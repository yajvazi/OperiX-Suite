-- Invoice creation reliability.
--
-- New companies must be usable immediately, and invoice numbers must be
-- allocated by the database rather than calculated from a row count in a
-- client.  The latter is not safe when drafts are deleted, retries happen,
-- or two devices save at the same time.

create or replace function public.reserve_invoice_number(
  p_company_id uuid,
  p_document_type text default 'invoice',
  p_issue_date date default current_date
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  document_type text := lower(trim(coalesce(p_document_type, 'invoice')));
  sequence_type text;
  invoice_prefix text;
  period_key text := to_char(coalesce(p_issue_date, current_date), 'YYYY');
  sequence_row public.document_sequences%rowtype;
  max_existing bigint := 0;
  next_value bigint;
begin
  if p_company_id is null then
    raise exception 'A company is required to reserve an invoice number'
      using errcode = '22023';
  end if;

  if document_type not in ('invoice', 'offer', 'proforma', 'order') then
    raise exception 'Unsupported document type %', document_type
      using errcode = '22023';
  end if;

  if not (
    (select private.has_company_permission(p_company_id, 'sales_invoice.create'))
    or (select private.has_company_permission(p_company_id, 'invoice.create'))
  ) then
    raise exception 'Insufficient permission to reserve an invoice number'
      using errcode = '42501';
  end if;

  sequence_type := 'operix_' || document_type;
  invoice_prefix := case document_type
    when 'offer' then 'OFF'
    when 'proforma' then 'PRO'
    when 'order' then 'ORD'
    else 'INV'
  end;

  -- This lock covers both the sequence row and legacy invoices that were
  -- numbered by clients. It makes the first allocation safe during migration
  -- and keeps all subsequent allocations serialized per company and year.
  perform pg_advisory_xact_lock(
    hashtextextended(p_company_id::text || ':' || sequence_type || ':' || period_key, 0)
  );

  select coalesce(max(
    nullif(
      substring(invoice.invoice_number from (
        '^' || invoice_prefix || '-' || period_key || '-([0-9]+)$'
      )),
      ''
    )::bigint
  ), 0)
  into max_existing
  from public.invoices invoice
  where invoice.company_id = p_company_id
    and lower(coalesce(invoice.type, 'invoice')) = document_type;

  insert into public.document_sequences (
    company_id, branch_id, document_type, prefix, suffix, next_value,
    padding, reset_rule, current_period_key, is_active, created_by, updated_by
  )
  values (
    p_company_id, null, sequence_type, invoice_prefix || '-', '', greatest(1, max_existing + 1),
    4, 'fiscal_year', period_key, true, (select auth.uid()), (select auth.uid())
  )
  on conflict do nothing;

  select *
  into sequence_row
  from public.document_sequences as document_sequence
  where document_sequence.company_id = p_company_id
    and document_sequence.branch_id is null
    and document_sequence.document_type = sequence_type
    and document_sequence.is_active
  order by document_sequence.updated_at desc
  limit 1
  for update;

  if not found then
    raise exception 'Unable to initialize invoice numbering for company %', p_company_id
      using errcode = 'P0002';
  end if;

  next_value := case
    when sequence_row.current_period_key is distinct from period_key
      then greatest(1, max_existing + 1)
    else greatest(coalesce(sequence_row.next_value, 1), max_existing + 1)
  end;

  update public.document_sequences as document_sequence
  set prefix = invoice_prefix || '-',
      suffix = '',
      next_value = document_sequence.next_value + 1,
      padding = 4,
      reset_rule = 'fiscal_year',
      current_period_key = period_key,
      updated_at = clock_timestamp(),
      updated_by = (select auth.uid())
  where document_sequence.id = sequence_row.id;

  return invoice_prefix || '-' || period_key || '-' || lpad(next_value::text, 4, '0');
end
$$;

revoke all on function public.reserve_invoice_number(uuid, text, date) from public, anon;
grant execute on function public.reserve_invoice_number(uuid, text, date) to authenticated;

comment on function public.reserve_invoice_number(uuid, text, date) is
  'Atomically reserves a company-scoped invoice/offer number. Client row counts must not be used for numbering.';

-- Initialize accounting immediately after an owner membership is created.
-- Both company creation paths insert the owner membership, so this also
-- covers future main companies and subdivisions without duplicating those
-- functions here.
create or replace function private.initialize_company_accounting_after_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'owner'
     and new.status = 'active'
     and (select auth.uid()) is not null then
    perform public.initialize_company_accounting(
      new.company_id,
      date_trunc('year', current_date)::date,
      'xk-operix-base-v1'
    );
  end if;
  return new;
end
$$;

drop trigger if exists memberships_initialize_accounting on public.memberships;
create trigger memberships_initialize_accounting
after insert on public.memberships
for each row
execute function private.initialize_company_accounting_after_owner_membership();

-- Repair companies created before owner-membership initialization existed.
-- The claim is set only for this migration transaction so the existing
-- permission-aware initializer records the real company owner as actor.
do $$
declare
  target record;
begin
  for target in
    select company.id, company.owner_id
    from public.companies company
    join public.memberships membership
      on membership.company_id = company.id
     and membership.user_id = company.owner_id
     and membership.role = 'owner'
     and membership.status = 'active'
    where company.owner_id is not null
      and (
        not exists (
          select 1 from public.chart_of_accounts account
          where account.company_id = company.id
        )
        or not exists (
          select 1 from public.accounting_periods period
          where period.company_id = company.id
            and current_date between period.start_date and period.end_date
        )
        or not exists (
          select 1 from public.posting_rule_sets rule_set
          where rule_set.company_id = company.id
            and rule_set.event_type = 'pos_sale'
            and rule_set.active
            and current_date >= rule_set.effective_from
            and (rule_set.effective_until is null or current_date <= rule_set.effective_until)
        )
      )
  loop
    perform set_config('request.jwt.claim.sub', target.owner_id::text, true);
    perform public.initialize_company_accounting(
      target.id,
      date_trunc('year', current_date)::date,
      'xk-operix-base-v1'
    );
  end loop;
  perform set_config('request.jwt.claim.sub', '', true);
end
$$;

-- Keep initialization explicit in the supported company-creation RPCs. This
-- is deliberately idempotent, so it is safe for an existing company and for
-- a retry after a partially completed client request.
drop trigger if exists memberships_initialize_accounting on public.memberships;

create or replace function public.create_company_and_owner(p_company_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_company_id uuid;
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if nullif(trim(p_company_name), '') is null then
    raise exception 'Company name is required' using errcode = '23514';
  end if;

  insert into public.companies (company_name, owner_id)
  values (trim(p_company_name), current_user_id)
  returning id into new_company_id;

  insert into public.memberships (user_id, company_id, role, status)
  values (current_user_id, new_company_id, 'owner', 'active');

  perform public.initialize_company_accounting(
    new_company_id,
    date_trunc('year', current_date)::date,
    'xk-operix-base-v1'
  );

  return jsonb_build_object(
    'id', new_company_id,
    'company_name', trim(p_company_name)
  );
end
$$;

create or replace function public.create_company_subdivision(
  p_parent_company_id uuid,
  p_company_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  new_company_id uuid;
  parent_name text;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_parent_company_id is null then
    raise exception 'Parent company is required' using errcode = '23514';
  end if;

  if nullif(trim(p_company_name), '') is null then
    raise exception 'Company name is required' using errcode = '23514';
  end if;

  if not private.has_company_permission(p_parent_company_id, 'company.manage') then
    raise exception 'You do not have permission to add a subdivision'
      using errcode = '42501';
  end if;

  select company.company_name
    into parent_name
  from public.companies company
  where company.id = p_parent_company_id;

  if parent_name is null then
    raise exception 'Parent company was not found' using errcode = '22023';
  end if;

  insert into public.companies (company_name, owner_id, parent_company_id)
  values (trim(p_company_name), current_user_id, p_parent_company_id)
  returning id into new_company_id;

  insert into public.memberships (user_id, company_id, role, status)
  values (current_user_id, new_company_id, 'owner', 'active');

  perform public.initialize_company_accounting(
    new_company_id,
    date_trunc('year', current_date)::date,
    'xk-operix-base-v1'
  );

  return jsonb_build_object(
    'id', new_company_id,
    'company_name', trim(p_company_name),
    'parent_company_id', p_parent_company_id,
    'parent_company_name', parent_name
  );
end
$$;

revoke all on function public.create_company_and_owner(text) from public, anon;
revoke all on function public.create_company_subdivision(uuid, text) from public, anon;
grant execute on function public.create_company_and_owner(text) to authenticated;
grant execute on function public.create_company_subdivision(uuid, text) to authenticated;
