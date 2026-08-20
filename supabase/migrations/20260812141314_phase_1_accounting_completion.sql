-- Phase 1: complete the existing accounting foundation without introducing a
-- second ledger or a second document workflow.
--
-- The earlier accounting migrations provide the core tables and commands.
-- This forward-only migration fills the remaining integrity, VAT, opening
-- balance, transaction-posting, and reconciliation gaps required by Phase 1.

-- ---------------------------------------------------------------------------
-- Permissions and accounting-period state model
-- ---------------------------------------------------------------------------

insert into public.app_permissions (code, name, category, description, is_sensitive)
values
  ('opening_balance.post', 'Post opening balances', 'accounting', 'Post an approved opening-balance journal.', true),
  ('supplier_bill.post', 'Post supplier bills', 'accounting', 'Post supplier bills to the general ledger.', true),
  ('supplier_payment.record', 'Record supplier payments', 'payments', 'Record and post supplier payments.', true),
  ('customer_payment.reverse', 'Reverse customer payments', 'payments', 'Reverse a posted customer payment through a journal reversal.', true),
  ('supplier_payment.reverse', 'Reverse supplier payments', 'payments', 'Reverse a posted supplier payment through a journal reversal.', true),
  ('expense.post', 'Post expenses', 'accounting', 'Post an expense to the general ledger.', true)
on conflict (code) do nothing;

alter table public.accounting_periods
  drop constraint if exists accounting_periods_status_check;
alter table public.accounting_periods
  add constraint accounting_periods_status_check
  check (status = any (array['open'::text, 'soft_closed'::text, 'closed'::text, 'locked'::text]));

alter table public.accounting_fiscal_years
  drop constraint if exists accounting_fiscal_years_status_check;
alter table public.accounting_fiscal_years
  add constraint accounting_fiscal_years_status_check
  check (status = any (array['open'::text, 'soft_closed'::text, 'closed'::text, 'locked'::text]));

-- A posted journal must be balanced even if a caller attempts to bypass the
-- public posting command and changes the row directly.
create or replace function private.assert_posted_journal_integrity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  line_count integer;
  debit_total numeric(20,4);
  credit_total numeric(20,4);
  period_status text;
begin
  if new.status = 'posted' then
    if new.period_id is null then
      raise exception 'A posted journal must belong to an accounting period'
        using errcode = '23514';
    end if;

    select status into period_status
    from public.accounting_periods
    where id = new.period_id and company_id = new.company_id;
    if period_status is null then
      raise exception 'A posted journal period must belong to the same company'
        using errcode = '23514';
    end if;
    if period_status not in ('open', 'soft_closed') then
      raise exception 'A journal cannot be posted into a closed or locked period'
        using errcode = '55000';
    end if;

    select count(*), coalesce(sum(debit), 0), coalesce(sum(credit), 0)
    into line_count, debit_total, credit_total
    from public.journal_entry_lines
    where journal_entry_id = new.id;
    if line_count < 2 or debit_total <= 0 or debit_total <> credit_total then
      raise exception 'Posted journal is not balanced (debits %, credits %)', debit_total, credit_total
        using errcode = '23514';
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists journal_entries_posted_integrity on public.journal_entries;
create trigger journal_entries_posted_integrity
before insert or update of status, period_id on public.journal_entries
for each row execute function private.assert_posted_journal_integrity();

-- Replace the existing command so the soft-close behavior is explicit. Normal
-- posting is still limited to open periods; a soft-closed period requires an
-- accounting-period manager and a reason, while closed/locked periods reject
-- all posting.
create or replace function public.post_journal_entry(
  p_journal_entry_id uuid,
  p_reason text default null
)
returns public.journal_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry_row public.journal_entries;
  period_row public.accounting_periods;
  debit_total numeric(20, 4);
  credit_total numeric(20, 4);
  line_count integer;
begin
  select * into entry_row
  from public.journal_entries
  where id = p_journal_entry_id
  for update;
  if not found then
    raise exception 'Journal entry not found' using errcode = 'P0002';
  end if;
  if not (select private.has_company_permission(entry_row.company_id, 'journal.post')) then
    raise exception 'Insufficient permission to post journals' using errcode = '42501';
  end if;
  if entry_row.status <> 'draft' then
    raise exception 'Only draft journals may be posted' using errcode = '55000';
  end if;

  select * into period_row
  from public.accounting_periods
  where company_id = entry_row.company_id
    and entry_row.posting_date between start_date and end_date
  order by start_date desc
  limit 1
  for update;
  if not found then
    raise exception 'Posting date is not covered by an accounting period' using errcode = '23514';
  end if;
  if period_row.status in ('closed', 'locked') then
    raise exception 'Posting is not allowed in a closed or locked period' using errcode = '55000';
  end if;
  if period_row.status = 'soft_closed' then
    if not (select private.has_company_permission(entry_row.company_id, 'accounting_period.manage'))
      or nullif(trim(coalesce(p_reason, '')), '') is null then
      raise exception 'Posting into a soft-closed period requires accounting-period permission and a reason'
        using errcode = '55000';
    end if;
  end if;

  select count(*), coalesce(sum(debit), 0), coalesce(sum(credit), 0)
  into line_count, debit_total, credit_total
  from public.journal_entry_lines
  where journal_entry_id = p_journal_entry_id;
  if line_count < 2 then
    raise exception 'A journal entry requires at least two lines' using errcode = '23514';
  end if;
  if debit_total <= 0 or debit_total <> credit_total then
    raise exception 'Journal entry is not balanced (debits %, credits %)', debit_total, credit_total
      using errcode = '23514';
  end if;

  perform set_config('app.financial_workflow', 'authorized', true);
  perform set_config('app.change_reason', coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'Journal posted'), true);
  update public.journal_entries
  set status = 'posted',
      period_id = period_row.id,
      posted_at = clock_timestamp(),
      posted_by = (select auth.uid()),
      updated_at = clock_timestamp(),
      updated_by = (select auth.uid())
  where id = p_journal_entry_id
  returning * into entry_row;
  perform set_config('app.financial_workflow', '', true);
  perform set_config('app.change_reason', '', true);
  return entry_row;
end
$$;

-- Accounting periods retain their existing audited transition command, with a
-- distinct soft-closed state and explicit reasons when reopening.
create or replace function public.set_accounting_period_status(
  p_period_id uuid,
  p_status text,
  p_reason text default null
)
returns public.accounting_periods
language plpgsql
security definer
set search_path = ''
as $$
declare
  period_row public.accounting_periods;
begin
  select * into period_row
  from public.accounting_periods
  where id = p_period_id
  for update;
  if not found then
    raise exception 'Accounting period not found' using errcode = 'P0002';
  end if;
  if p_status not in ('open', 'soft_closed', 'closed', 'locked') then
    raise exception 'Invalid accounting period status' using errcode = '22023';
  end if;

  if p_status = 'open' and period_row.status in ('soft_closed', 'closed', 'locked') then
    if not (select private.has_company_permission(period_row.company_id, 'accounting_period.reopen')) then
      raise exception 'Insufficient permission to reopen accounting periods' using errcode = '42501';
    end if;
    if nullif(trim(coalesce(p_reason, '')), '') is null then
      raise exception 'A reason is required to reopen a period' using errcode = '23514';
    end if;
  elsif not (select private.has_company_permission(period_row.company_id, 'accounting_period.manage')) then
    raise exception 'Insufficient permission to manage accounting periods' using errcode = '42501';
  end if;

  perform set_config('app.accounting_period_workflow', 'authorized', true);
  perform set_config('app.change_reason', coalesce(nullif(trim(coalesce(p_reason, '')), ''), ''), true);
  update public.accounting_periods
  set status = p_status,
      closed_at = case when p_status = 'closed' then clock_timestamp() else closed_at end,
      closed_by = case when p_status = 'closed' then (select auth.uid()) else closed_by end,
      locked_at = case when p_status = 'locked' then clock_timestamp() else locked_at end,
      locked_by = case when p_status = 'locked' then (select auth.uid()) else locked_by end,
      reopened_at = case when p_status = 'open' and status <> 'open' then clock_timestamp() else reopened_at end,
      reopened_by = case when p_status = 'open' and status <> 'open' then (select auth.uid()) else reopened_by end,
      reopen_reason = case when p_status = 'open' and status <> 'open' then trim(p_reason) else reopen_reason end,
      updated_at = clock_timestamp(),
      updated_by = (select auth.uid())
  where id = p_period_id
  returning * into period_row;
  perform set_config('app.accounting_period_workflow', '', true);
  perform set_config('app.change_reason', '', true);
  return period_row;
end
$$;

-- ---------------------------------------------------------------------------
-- Centralized, effective-dated Kosovo VAT configuration
-- ---------------------------------------------------------------------------

do $$
declare
  company_row record;
  v_config_set_id uuid;
begin
  for company_row in select id from public.companies loop
    insert into public.compliance_config_sets (
      company_id, config_type, config_key, name, jurisdiction, description,
      created_by, updated_by
    )
    values (
      company_row.id, 'vat_rates', 'kosovo_default_2026',
      'Kosovo VAT rules', 'XK',
      'Centralized VAT categories and rates. Classification-specific treatment remains subject to legal review.',
      (select auth.uid()), (select auth.uid())
    )
    on conflict (company_id, config_type, config_key)
    do update set updated_at = clock_timestamp(), updated_by = (select auth.uid())
    returning id into v_config_set_id;

    if v_config_set_id is null then
      select id into v_config_set_id
      from public.compliance_config_sets
      where company_id = company_row.id
        and config_type = 'vat_rates'
        and config_key = 'kosovo_default_2026';
    end if;

    if not exists (
      select 1 from public.compliance_config_versions
      where compliance_config_versions.config_set_id = v_config_set_id
    ) then
      insert into public.compliance_config_versions (
        config_set_id, version, status, effective_from, effective_until,
        configuration, change_reason, created_by, updated_by
      )
      values (
        v_config_set_id, 1, 'active', date '2025-01-01', null,
        jsonb_build_object(
          'jurisdiction', 'XK',
          'legalStatus', 'verified_rates_only',
          'legalReviewRequired', true,
          'officialSources', jsonb_build_array(
            'https://www.atk-ks.org/en/portfolio/informata-te-pergjithshme-per-tatimet-ne-kosove/',
            'https://crmm.atk-ks.org/en/Public/CalculatorDetail?id=8'
          ),
          'rates', jsonb_build_array(
            jsonb_build_object('code','standard_18','name','Standard VAT','rate',18,'category','standard','appliesTo','both','deductibilityPercentage',100,'requiresComplianceReview',false),
            jsonb_build_object('code','reduced_8','name','Reduced VAT','rate',8,'category','reduced','appliesTo','both','deductibilityPercentage',100,'requiresComplianceReview',false),
            jsonb_build_object('code','zero_rated','name','Zero rated','rate',0,'category','zero_rated','appliesTo','both','deductibilityPercentage',100,'requiresComplianceReview',true),
            jsonb_build_object('code','exempt','name','VAT exempt','rate',0,'category','exempt','appliesTo','both','deductibilityPercentage',0,'requiresComplianceReview',true),
            jsonb_build_object('code','out_of_scope','name','Outside scope','rate',0,'category','out_of_scope','appliesTo','both','deductibilityPercentage',0,'requiresComplianceReview',true),
            jsonb_build_object('code','reverse_charge','name','Reverse charge','rate',18,'supportedRates',jsonb_build_array(18,8),'category','reverse_charge','appliesTo','both','deductibilityPercentage',100,'requiresComplianceReview',true)
          )
        ),
        'Seeded from the official TAK rate summary and VAT calculator. Classification and deductibility require ongoing legal verification.',
        (select auth.uid()), (select auth.uid())
      );
    end if;
  end loop;
end
$$;

create or replace function public.get_effective_vat_rule(
  p_company_id uuid,
  p_code text,
  p_as_of date default current_date
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  configuration jsonb;
  result jsonb;
begin
  if not (select private.has_company_permission(p_company_id, 'accounting.read')) then
    raise exception 'Insufficient permission to read VAT configuration' using errcode = '42501';
  end if;

  select version.configuration into configuration
  from public.compliance_config_sets config_set
  join public.compliance_config_versions version on version.config_set_id = config_set.id
  where config_set.company_id = p_company_id
    and config_set.config_type = 'vat_rates'
    and version.status = 'active'
    and version.effective_from <= coalesce(p_as_of, current_date)
    and (version.effective_until is null or version.effective_until >= coalesce(p_as_of, current_date))
  order by version.version desc, version.effective_from desc
  limit 1;

  if configuration is null then
    return null;
  end if;

  select value into result
  from jsonb_array_elements(coalesce(configuration -> 'rates', '[]'::jsonb)) value
  where value ->> 'code' = p_code
  limit 1;
  return result;
end
$$;

create or replace function public.list_effective_vat_rules(
  p_company_id uuid,
  p_as_of date default current_date
)
returns table (
  code text,
  name text,
  rate numeric,
  category text,
  deductibility_percentage numeric,
  requires_compliance_review boolean,
  effective_from date,
  effective_until date,
  official_sources jsonb
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  config_row record;
begin
  if not (select private.has_company_permission(p_company_id, 'accounting.read')) then
    raise exception 'Insufficient permission to read VAT configuration' using errcode = '42501';
  end if;

  select version.configuration, version.effective_from, version.effective_until
  into config_row
  from public.compliance_config_sets config_set
  join public.compliance_config_versions version on version.config_set_id = config_set.id
  where config_set.company_id = p_company_id
    and config_set.config_type = 'vat_rates'
    and version.status = 'active'
    and version.effective_from <= coalesce(p_as_of, current_date)
    and (version.effective_until is null or version.effective_until >= coalesce(p_as_of, current_date))
  order by version.version desc, version.effective_from desc
  limit 1;

  if not found then
    return;
  end if;

  return query
  select
    value ->> 'code',
    value ->> 'name',
    (value ->> 'rate')::numeric,
    value ->> 'category',
    (value ->> 'deductibilityPercentage')::numeric,
    coalesce((value ->> 'requiresComplianceReview')::boolean, true),
    config_row.effective_from,
    config_row.effective_until,
    config_row.configuration -> 'officialSources'
  from jsonb_array_elements(coalesce(config_row.configuration -> 'rates', '[]'::jsonb)) value;
end
$$;

grant execute on function public.get_effective_vat_rule(uuid, text, date) to authenticated;
grant execute on function public.list_effective_vat_rules(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Opening balances
-- ---------------------------------------------------------------------------

create table if not exists public.accounting_opening_balances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  as_of_date date not null,
  description text not null,
  idempotency_key uuid not null,
  journal_entry_id uuid not null references public.journal_entries(id) on delete restrict,
  lines jsonb not null check (jsonb_typeof(lines) = 'array'),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (company_id, idempotency_key),
  unique (journal_entry_id)
);

alter table public.accounting_opening_balances enable row level security;
drop policy if exists accounting_opening_balances_read on public.accounting_opening_balances;
create policy accounting_opening_balances_read
on public.accounting_opening_balances for select to authenticated
using ((select private.has_company_permission(company_id, 'accounting.read')));
drop policy if exists accounting_opening_balances_insert on public.accounting_opening_balances;
create policy accounting_opening_balances_insert
on public.accounting_opening_balances for insert to authenticated
with check ((select private.has_company_permission(company_id, 'opening_balance.post')));
drop policy if exists accounting_opening_balances_update on public.accounting_opening_balances;
create policy accounting_opening_balances_update
on public.accounting_opening_balances for update to authenticated
using ((select private.has_company_permission(company_id, 'opening_balance.post')))
with check ((select private.has_company_permission(company_id, 'opening_balance.post')));
drop policy if exists accounting_opening_balances_delete on public.accounting_opening_balances;
create policy accounting_opening_balances_delete
on public.accounting_opening_balances for delete to authenticated
using (false);

create or replace function public.post_opening_balance(
  p_company_id uuid,
  p_as_of_date date,
  p_description text,
  p_lines jsonb,
  p_idempotency_key uuid
)
returns public.journal_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_row public.accounting_opening_balances;
  opening_id uuid := gen_random_uuid();
  entry_row public.journal_entries;
  account_row public.chart_of_accounts;
  line_value jsonb;
  account_id uuid;
  line_debit numeric(20,4);
  line_credit numeric(20,4);
  debit_total numeric(20,4) := 0;
  credit_total numeric(20,4) := 0;
  line_number integer := 0;
begin
  if not (select private.has_company_permission(p_company_id, 'opening_balance.post'))
    or not (select private.has_company_permission(p_company_id, 'journal.create'))
    or not (select private.has_company_permission(p_company_id, 'journal.post')) then
    raise exception 'Opening-balance posting requires accounting permissions' using errcode = '42501';
  end if;
  if p_as_of_date is null then
    raise exception 'Opening-balance date is required' using errcode = '23514';
  end if;
  if nullif(trim(coalesce(p_description, '')), '') is null then
    raise exception 'Opening-balance description is required' using errcode = '23514';
  end if;
  if p_idempotency_key is null then
    raise exception 'Opening-balance idempotency key is required' using errcode = '23514';
  end if;
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' then
    raise exception 'Opening-balance lines must be a JSON array' using errcode = '22023';
  end if;

  select * into existing_row
  from public.accounting_opening_balances
  where company_id = p_company_id and idempotency_key = p_idempotency_key
  for update;
  if found then
    select * into entry_row from public.journal_entries where id = existing_row.journal_entry_id;
    return entry_row;
  end if;

  if jsonb_array_length(p_lines) < 2 then
    raise exception 'An opening balance requires at least two lines' using errcode = '23514';
  end if;

  for line_value in select value from jsonb_array_elements(p_lines) value loop
    account_id := null;
    if nullif(line_value ->> 'account_id', '') is not null then
      account_id := (line_value ->> 'account_id')::uuid;
    elsif nullif(line_value ->> 'account_code', '') is not null then
      select id into account_id
      from public.chart_of_accounts
      where company_id = p_company_id and code = line_value ->> 'account_code';
    end if;
    if account_id is null then
      raise exception 'Every opening-balance line requires a valid account' using errcode = '23514';
    end if;
    select * into account_row
    from public.chart_of_accounts
    where id = account_id and company_id = p_company_id and active and posting_allowed;
    if not found or account_row.id is null then
      raise exception 'Opening-balance account is invalid for this company' using errcode = '23514';
    end if;

    line_debit := round(coalesce(nullif(line_value ->> 'debit', '')::numeric, 0), 4);
    line_credit := round(coalesce(nullif(line_value ->> 'credit', '')::numeric, 0), 4);
    if line_debit < 0 or line_credit < 0 or
       ((line_debit <= 0) and (line_credit <= 0)) or
       (line_debit > 0 and line_credit > 0) then
      raise exception 'Opening-balance lines must contain exactly one positive side' using errcode = '23514';
    end if;
    debit_total := debit_total + line_debit;
    credit_total := credit_total + line_credit;
  end loop;
  if debit_total <= 0 or debit_total <> credit_total then
    raise exception 'Opening balance is not balanced (debits %, credits %)', debit_total, credit_total
      using errcode = '23514';
  end if;

  entry_row := public.create_journal_entry(
    p_company_id, p_as_of_date, p_as_of_date, trim(p_description),
    'OPENING-' || p_idempotency_key::text, 'EUR', 1, null, 'opening'
  );

  insert into public.accounting_opening_balances (
    id, company_id, as_of_date, description, idempotency_key, journal_entry_id,
    lines, created_by
  )
  values (
    opening_id, p_company_id, p_as_of_date, trim(p_description), p_idempotency_key,
    entry_row.id, p_lines, (select auth.uid())
  );

  perform set_config('app.financial_workflow', 'authorized', true);
  update public.journal_entries
  set source_type = 'opening_balance', source_id = opening_id,
      source_key = 'OPENING-' || p_idempotency_key::text,
      metadata = jsonb_build_object('opening_balance_id', opening_id, 'idempotency_key', p_idempotency_key)
  where id = entry_row.id;
  perform set_config('app.financial_workflow', '', true);

  for line_value in select value from jsonb_array_elements(p_lines) value loop
    account_id := null;
    if nullif(line_value ->> 'account_id', '') is not null then
      account_id := (line_value ->> 'account_id')::uuid;
    else
      select id into account_id
      from public.chart_of_accounts
      where company_id = p_company_id and code = line_value ->> 'account_code';
    end if;
    line_debit := round(coalesce(nullif(line_value ->> 'debit', '')::numeric, 0), 4);
    line_credit := round(coalesce(nullif(line_value ->> 'credit', '')::numeric, 0), 4);
    line_number := line_number + 1;
    insert into public.journal_entry_lines (
      journal_entry_id, company_id, line_number, account_id, description,
      debit, credit, transaction_currency, transaction_amount, created_by
    )
    values (
      entry_row.id, p_company_id, line_number, account_id,
      coalesce(nullif(trim(line_value ->> 'description'), ''), trim(p_description)),
      line_debit, line_credit, 'EUR', line_debit + line_credit, (select auth.uid())
    );
  end loop;

  entry_row := public.post_journal_entry(entry_row.id, 'Opening balance posted');
  return entry_row;
end
$$;

grant select, insert, update on public.accounting_opening_balances to authenticated;
revoke all on function public.post_opening_balance(uuid, date, text, jsonb, uuid) from public;
grant execute on function public.post_opening_balance(uuid, date, text, jsonb, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Core transaction posting commands
-- ---------------------------------------------------------------------------

alter table public.vendor_payments
  add column if not exists settlement_account_id uuid references public.chart_of_accounts(id) on delete restrict;

alter table public.expenses
  add column if not exists tax_amount numeric(20,4) not null default 0 check (tax_amount >= 0),
  add column if not exists tax_recoverable_amount numeric(20,4) not null default 0 check (tax_recoverable_amount >= 0);

create or replace function public.prepare_supplier_bill_for_posting(
  p_bill_id uuid,
  p_reason text default null
)
returns public.supplier_bills
language plpgsql
security definer
set search_path = ''
as $$
declare
  bill_row public.supplier_bills;
begin
  select * into bill_row from public.supplier_bills where id = p_bill_id for update;
  if not found then
    raise exception 'Supplier bill not found' using errcode = 'P0002';
  end if;
  if not (select private.has_company_permission(bill_row.company_id, 'supplier_bill.post')) then
    raise exception 'Insufficient permission to prepare supplier bills' using errcode = '42501';
  end if;
  if bill_row.accounting_state not in ('legacy', 'ready_for_posting') then
    raise exception 'Supplier bill is already accounted for or excluded from posting' using errcode = '55000';
  end if;
  if bill_row.vendor_id is null then
    raise exception 'A supplier is required before posting a supplier bill' using errcode = '23514';
  end if;
  if coalesce(bill_row.total_amount, 0) <= 0 then
    raise exception 'Supplier bill total must be greater than zero' using errcode = '23514';
  end if;

  perform set_config('app.change_reason', coalesce(nullif(trim(p_reason), ''), 'Prepared supplier bill for posting'), true);
  update public.supplier_bills
  set accounting_state = 'ready_for_posting',
      posting_date = coalesce(posting_date, issue_date, current_date)
  where id = bill_row.id
  returning * into bill_row;
  perform set_config('app.change_reason', '', true);
  return bill_row;
end
$$;

create or replace function public.post_supplier_bill(
  p_bill_id uuid,
  p_idempotency_key uuid default null,
  p_reason text default null
)
returns public.supplier_bills
language plpgsql
security definer
set search_path = ''
as $$
declare
  bill_row public.supplier_bills;
  vendor_row public.vendors;
  journal_row public.journal_entries;
  net_amount numeric(20,4);
  bill_tax_amount numeric(20,4);
  gross_amount numeric(20,4);
begin
  select * into bill_row from public.supplier_bills where id = p_bill_id for update;
  if not found then
    raise exception 'Supplier bill not found' using errcode = 'P0002';
  end if;
  if not (select private.has_company_permission(bill_row.company_id, 'supplier_bill.post')) then
    raise exception 'Insufficient permission to post supplier bills' using errcode = '42501';
  end if;
  if bill_row.accounting_state = 'posted' then
    if p_idempotency_key is null or bill_row.idempotency_key = p_idempotency_key then
      return bill_row;
    end if;
    raise exception 'Supplier bill has already been posted' using errcode = '55000';
  end if;
  if bill_row.accounting_state <> 'ready_for_posting' then
    raise exception 'Supplier bill must be prepared before posting' using errcode = '55000';
  end if;

  select * into vendor_row
  from public.vendors
  where id = bill_row.vendor_id and company_id = bill_row.company_id;
  if not found then
    raise exception 'Supplier is invalid for this company' using errcode = '23514';
  end if;
  if vendor_row.supplier_status in ('inactive', 'blocked') then
    raise exception 'Supplier is not eligible for posting' using errcode = '55000';
  end if;

  gross_amount := round(coalesce(bill_row.total_amount, 0), 4);
  bill_tax_amount := round(greatest(coalesce(bill_row.tax_amount, 0), 0), 4);
  net_amount := round(gross_amount - bill_tax_amount, 4);
  if gross_amount <= 0 or net_amount < 0 then
    raise exception 'Supplier bill amounts are invalid' using errcode = '23514';
  end if;

  journal_row := public.create_automatic_journal(
    bill_row.company_id,
    'purchase_invoice',
    'supplier_bill',
    bill_row.id,
    bill_row.bill_number,
    coalesce(bill_row.posting_date, bill_row.issue_date, current_date),
    coalesce(bill_row.issue_date, current_date),
    'Supplier bill ' || bill_row.bill_number,
    jsonb_build_object('net', net_amount, 'tax', bill_tax_amount, 'gross', gross_amount),
    bill_row.currency,
    bill_row.branch_id,
    jsonb_build_object('bill_number', bill_row.bill_number, 'vendor_id', bill_row.vendor_id)
  );

  perform set_config('app.financial_workflow', 'authorized', true);
  perform set_config('app.change_reason', coalesce(nullif(trim(p_reason), ''), 'Supplier bill posted'), true);
  update public.supplier_bills
  set accounting_state = 'posted',
      posting_date = coalesce(posting_date, issue_date, current_date),
      fiscal_year_id = (select fiscal_year_id from public.accounting_periods where id = journal_row.period_id),
      posted_at = clock_timestamp(),
      posted_by = (select auth.uid()),
      posting_journal_entry_id = journal_row.id,
      idempotency_key = coalesce(p_idempotency_key, idempotency_key),
      total_amount = gross_amount,
      tax_amount = bill_tax_amount
  where id = bill_row.id
  returning * into bill_row;
  perform set_config('app.financial_workflow', '', true);
  perform set_config('app.change_reason', '', true);

  perform private.emit_domain_outbox_event(
    bill_row.company_id, bill_row.branch_id, 'supplier_bill', bill_row.id,
    'supplier_bill.posted',
    jsonb_build_object('bill_number', bill_row.bill_number, 'journal_entry_id', journal_row.id, 'gross_amount', gross_amount),
    'supplier_bill.posted:' || bill_row.id::text
  );
  return bill_row;
end
$$;

create or replace function public.record_supplier_payment(
  p_company_id uuid,
  p_supplier_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_payment_method text,
  p_settlement_account_id uuid,
  p_reference text default null,
  p_notes text default null,
  p_branch_id uuid default null,
  p_currency text default 'EUR',
  p_idempotency_key uuid default null
)
returns public.vendor_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.vendor_payments;
  vendor_row public.vendors;
  settlement_account public.chart_of_accounts;
  payable_account public.chart_of_accounts;
  journal_row public.journal_entries;
  payment_number text;
  method text := lower(trim(coalesce(p_payment_method, 'bank')));
begin
  if p_amount is null or round(p_amount, 4) <= 0 then
    raise exception 'Supplier payment amount must be greater than zero' using errcode = '23514';
  end if;
  if method not in ('cash', 'bank', 'card') then
    raise exception 'Supplier payment method is invalid' using errcode = '23514';
  end if;
  if not (select private.has_company_permission(p_company_id, 'supplier_payment.record'))
    or not (select private.has_company_permission(p_company_id, 'journal.create'))
    or not (select private.has_company_permission(p_company_id, 'journal.post')) then
    raise exception 'Recording a supplier payment requires payment and journal permissions' using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    select * into payment_row
    from public.vendor_payments
    where company_id = p_company_id and idempotency_key = p_idempotency_key;
    if found then
      return payment_row;
    end if;
  end if;

  select * into vendor_row from public.vendors
  where id = p_supplier_id and company_id = p_company_id;
  if not found then
    raise exception 'Supplier is invalid for this company' using errcode = '23514';
  end if;

  select * into settlement_account
  from public.chart_of_accounts
  where id = p_settlement_account_id and company_id = p_company_id and active and posting_allowed;
  if not found then
    raise exception 'A valid active settlement account is required' using errcode = '23514';
  end if;

  if vendor_row.default_payable_account_id is not null then
    select * into payable_account
    from public.chart_of_accounts
    where id = vendor_row.default_payable_account_id
      and company_id = p_company_id and active and posting_allowed;
  else
    select * into payable_account
    from public.chart_of_accounts
    where company_id = p_company_id and statement_mapping = 'balance_sheet.payables'
      and active and posting_allowed
    order by code limit 1;
  end if;
  if not found then
    raise exception 'No valid payable account is mapped for supplier payments' using errcode = '23514';
  end if;

  payment_number := private.next_financial_document_number(
    p_company_id, p_branch_id, 'supplier_payment', 'VPAY-', coalesce(p_payment_date, current_date)
  );
  insert into public.vendor_payments (
    user_id, company_id, branch_id, vendor_id, payment_number, amount, payment_date,
    payment_method, bank_reference, notes, currency, allocation_status,
    idempotency_key, accounting_state, settlement_account_id
  )
  values (
    (select auth.uid()), p_company_id, p_branch_id, p_supplier_id, payment_number,
    round(p_amount, 4), coalesce(p_payment_date, current_date), method,
    nullif(trim(p_reference), ''), p_notes, upper(coalesce(p_currency, 'EUR')),
    'unallocated', p_idempotency_key, 'ready_for_posting', p_settlement_account_id
  )
  returning * into payment_row;

  journal_row := public.create_journal_entry(
    p_company_id, payment_row.payment_date, payment_row.payment_date,
    'Supplier payment ' || payment_row.payment_number, payment_row.payment_number,
    payment_row.currency, 1, p_branch_id, 'automatic'
  );
  perform set_config('app.financial_workflow', 'authorized', true);
  update public.journal_entries
  set source_type = 'supplier_payment', source_id = payment_row.id,
      source_key = payment_row.payment_number,
      metadata = jsonb_build_object('payment_number', payment_row.payment_number, 'supplier_id', p_supplier_id)
  where id = journal_row.id;
  perform set_config('app.financial_workflow', '', true);

  insert into public.journal_entry_lines (
    journal_entry_id, company_id, line_number, account_id, description,
    debit, credit, transaction_currency, transaction_amount, branch_id, created_by
  )
  values
    (journal_row.id, p_company_id, 1, payable_account.id, 'Supplier payment payable settlement',
      payment_row.amount, 0, payment_row.currency, payment_row.amount, p_branch_id, (select auth.uid())),
    (journal_row.id, p_company_id, 2, settlement_account.id, 'Supplier payment settlement account',
      0, payment_row.amount, payment_row.currency, payment_row.amount, p_branch_id, (select auth.uid()));
  journal_row := public.post_journal_entry(journal_row.id, 'Supplier payment recorded');

  perform set_config('app.financial_workflow', 'authorized', true);
  update public.vendor_payments
  set accounting_state = 'posted', posted_at = clock_timestamp(), posting_journal_entry_id = journal_row.id
  where id = payment_row.id
  returning * into payment_row;
  perform set_config('app.financial_workflow', '', true);
  return payment_row;
end
$$;

create or replace function public.post_expense(
  p_expense_id uuid,
  p_idempotency_key uuid default null,
  p_reason text default null
)
returns public.expenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  expense_row public.expenses;
  journal_row public.journal_entries;
begin
  select * into expense_row from public.expenses where id = p_expense_id for update;
  if not found then
    raise exception 'Expense not found' using errcode = 'P0002';
  end if;
  if not (select private.has_company_permission(expense_row.company_id, 'expense.post'))
    or not (select private.has_company_permission(expense_row.company_id, 'journal.post')) then
    raise exception 'Insufficient permission to post expenses' using errcode = '42501';
  end if;
  if expense_row.accounting_state = 'posted' then
    if p_idempotency_key is null or expense_row.idempotency_key = p_idempotency_key then
      return expense_row;
    end if;
    raise exception 'Expense has already been posted' using errcode = '55000';
  end if;
  if expense_row.accounting_state not in ('legacy', 'ready_for_posting') then
    raise exception 'Expense is not eligible for posting' using errcode = '55000';
  end if;
  if coalesce(expense_row.amount, 0) <= 0 then
    raise exception 'Expense amount must be greater than zero' using errcode = '23514';
  end if;

  journal_row := public.create_automatic_journal(
    expense_row.company_id, 'expense_reimbursement', 'expense', expense_row.id,
    expense_row.id::text, coalesce(expense_row.posting_date, expense_row.date, current_date),
    coalesce(expense_row.date, current_date),
    coalesce(nullif(trim(expense_row.description), ''), 'Expense'),
    jsonb_build_object('gross', round(expense_row.amount, 4)), expense_row.currency,
    expense_row.branch_id, jsonb_build_object('category', expense_row.category, 'tax_code', expense_row.tax_code)
  );

  perform set_config('app.financial_workflow', 'authorized', true);
  perform set_config('app.change_reason', coalesce(nullif(trim(p_reason), ''), 'Expense posted'), true);
  update public.expenses
  set accounting_state = 'posted', posting_date = coalesce(posting_date, date, current_date),
      posting_journal_entry_id = journal_row.id,
      idempotency_key = coalesce(p_idempotency_key, idempotency_key)
  where id = expense_row.id
  returning * into expense_row;
  perform set_config('app.financial_workflow', '', true);
  perform set_config('app.change_reason', '', true);
  return expense_row;
end
$$;

create or replace function public.post_credit_note(
  p_invoice_id uuid,
  p_idempotency_key uuid default null,
  p_reason text default null
)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice_row public.invoices;
  journal_row public.journal_entries;
  net_amount numeric(20,4);
  credit_tax_amount numeric(20,4);
  gross_amount numeric(20,4);
begin
  select * into invoice_row from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Credit note not found' using errcode = 'P0002';
  end if;
  if not (select private.has_company_permission(invoice_row.company_id, 'sales_invoice.post')) then
    raise exception 'Insufficient permission to post credit notes' using errcode = '42501';
  end if;
  if invoice_row.credit_of_invoice_id is null
    and lower(coalesce(invoice_row.type, '')) <> 'credit_note'
    and lower(coalesce(invoice_row.subtype, '')) <> 'credit_note' then
    raise exception 'The document is not identified as a credit note' using errcode = '23514';
  end if;
  if invoice_row.accounting_state = 'posted' then
    if p_idempotency_key is null or invoice_row.idempotency_key = p_idempotency_key then
      return invoice_row;
    end if;
    raise exception 'Credit note has already been posted' using errcode = '55000';
  end if;
  if invoice_row.accounting_state <> 'ready_for_posting' then
    raise exception 'Credit note must be prepared before posting' using errcode = '55000';
  end if;

  select calculated.net_amount, calculated.tax_amount, calculated.gross_amount
  into net_amount, credit_tax_amount, gross_amount
  from private.sales_invoice_amounts(invoice_row.id) calculated;
  if gross_amount <= 0 then
    raise exception 'Credit note total must be greater than zero' using errcode = '23514';
  end if;

  journal_row := public.create_automatic_journal(
    invoice_row.company_id, 'credit_note', 'credit_note', invoice_row.id,
    invoice_row.invoice_number, coalesce(invoice_row.posting_date, invoice_row.issue_date, current_date),
    coalesce(invoice_row.issue_date, current_date), 'Credit note ' || invoice_row.invoice_number,
    jsonb_build_object('net', net_amount, 'tax', credit_tax_amount, 'gross', gross_amount),
    invoice_row.currency, invoice_row.branch_id,
    jsonb_build_object('invoice_number', invoice_row.invoice_number, 'client_id', invoice_row.client_id,
      'credited_invoice_id', invoice_row.credit_of_invoice_id)
  );

  perform set_config('app.financial_workflow', 'authorized', true);
  perform set_config('app.change_reason', coalesce(nullif(trim(p_reason), ''), 'Credit note posted'), true);
  update public.invoices
  set status = 'posted', accounting_state = 'posted',
      posting_date = coalesce(posting_date, issue_date, current_date),
      fiscal_year_id = (select fiscal_year_id from public.accounting_periods where id = journal_row.period_id),
      posted_at = clock_timestamp(), posted_by = (select auth.uid()),
      posting_journal_entry_id = journal_row.id,
      idempotency_key = coalesce(p_idempotency_key, idempotency_key),
      total_amount = gross_amount, tax_amount = credit_tax_amount
  where id = invoice_row.id
  returning * into invoice_row;
  perform set_config('app.financial_workflow', '', true);
  perform set_config('app.change_reason', '', true);
  return invoice_row;
end
$$;

create or replace function public.reverse_customer_payment(
  p_payment_id uuid,
  p_reversal_date date default current_date,
  p_reason text default null
)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.payments;
  reversal_row public.journal_entries;
begin
  select * into payment_row from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Customer payment not found' using errcode = 'P0002';
  end if;
  if not (select private.has_company_permission(payment_row.company_id, 'journal.reverse')) then
    raise exception 'Insufficient permission to reverse customer payments' using errcode = '42501';
  end if;
  if payment_row.accounting_state <> 'posted' or payment_row.posting_journal_entry_id is null then
    raise exception 'Only posted customer payments can be reversed' using errcode = '55000';
  end if;
  if payment_row.reversal_journal_entry_id is not null or payment_row.accounting_state = 'reversed' then
    raise exception 'Customer payment has already been reversed' using errcode = '55000';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'A reversal reason is required' using errcode = '23514';
  end if;

  reversal_row := public.reverse_journal_entry(
    payment_row.posting_journal_entry_id,
    coalesce(p_reversal_date, current_date),
    trim(p_reason)
  );
  perform set_config('app.financial_workflow', 'authorized', true);
  update public.payments
  set accounting_state = 'reversed', allocation_status = 'reversed',
      reversed_at = clock_timestamp(), reversal_journal_entry_id = reversal_row.id,
      reversal_reason = trim(p_reason)
  where id = payment_row.id
  returning * into payment_row;
  perform set_config('app.financial_workflow', '', true);
  return payment_row;
end
$$;

create or replace function public.reverse_supplier_payment(
  p_payment_id uuid,
  p_reversal_date date default current_date,
  p_reason text default null
)
returns public.vendor_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.vendor_payments;
  reversal_row public.journal_entries;
begin
  select * into payment_row from public.vendor_payments where id = p_payment_id for update;
  if not found then
    raise exception 'Supplier payment not found' using errcode = 'P0002';
  end if;
  if not (select private.has_company_permission(payment_row.company_id, 'journal.reverse')) then
    raise exception 'Insufficient permission to reverse supplier payments' using errcode = '42501';
  end if;
  if payment_row.accounting_state <> 'posted' or payment_row.posting_journal_entry_id is null then
    raise exception 'Only posted supplier payments can be reversed' using errcode = '55000';
  end if;
  if payment_row.reversal_journal_entry_id is not null or payment_row.accounting_state = 'reversed' then
    raise exception 'Supplier payment has already been reversed' using errcode = '55000';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'A reversal reason is required' using errcode = '23514';
  end if;

  reversal_row := public.reverse_journal_entry(
    payment_row.posting_journal_entry_id,
    coalesce(p_reversal_date, current_date),
    trim(p_reason)
  );
  perform set_config('app.financial_workflow', 'authorized', true);
  update public.vendor_payments
  set accounting_state = 'reversed', allocation_status = 'reversed',
      reversed_at = clock_timestamp(), reversal_journal_entry_id = reversal_row.id,
      reversal_reason = trim(p_reason)
  where id = payment_row.id
  returning * into payment_row;
  perform set_config('app.financial_workflow', '', true);
  return payment_row;
end
$$;

-- ---------------------------------------------------------------------------
-- Customer and supplier subledgers, and reconciliation views
-- ---------------------------------------------------------------------------

create or replace view public.customer_subledger_entries
with (security_invoker = true)
as
select
  ledger.company_id,
  customer.id as customer_id,
  customer.name as customer_name,
  ledger.journal_entry_id,
  ledger.entry_number,
  ledger.posting_date,
  ledger.source_type,
  ledger.source_id,
  ledger.account_id,
  ledger.account_code,
  ledger.account_name,
  ledger.debit,
  ledger.credit,
  ledger.signed_amount,
  ledger.description
from public.general_ledger_entries ledger
join lateral (
  select
    coalesce(original.source_type, ledger.source_type) as source_type,
    coalesce(original.source_id, ledger.source_id) as source_id
  from public.journal_entries original
  where ledger.source_type = 'journal_reversal'
    and original.id = ledger.source_id
  union all
  select ledger.source_type, ledger.source_id
  where ledger.source_type is distinct from 'journal_reversal'
  limit 1
) source on true
left join public.invoices invoice
  on source.source_type in ('sales_invoice', 'credit_note') and invoice.id = source.source_id
left join public.payments payment
  on source.source_type = 'customer_payment' and payment.id = source.source_id
join public.clients customer
  on customer.id = coalesce(invoice.client_id, payment.client_id)
where ledger.account_id in (
  select account.id
  from public.chart_of_accounts account
  where account.company_id = ledger.company_id
    and account.statement_mapping = 'balance_sheet.receivables'
);

create or replace view public.supplier_subledger_entries
with (security_invoker = true)
as
select
  ledger.company_id,
  supplier.id as supplier_id,
  supplier.name as supplier_name,
  ledger.journal_entry_id,
  ledger.entry_number,
  ledger.posting_date,
  ledger.source_type,
  ledger.source_id,
  ledger.account_id,
  ledger.account_code,
  ledger.account_name,
  ledger.debit,
  ledger.credit,
  ledger.signed_amount,
  ledger.description
from public.general_ledger_entries ledger
join lateral (
  select
    coalesce(original.source_type, ledger.source_type) as source_type,
    coalesce(original.source_id, ledger.source_id) as source_id
  from public.journal_entries original
  where ledger.source_type = 'journal_reversal'
    and original.id = ledger.source_id
  union all
  select ledger.source_type, ledger.source_id
  where ledger.source_type is distinct from 'journal_reversal'
  limit 1
) source on true
left join public.supplier_bills bill
  on source.source_type = 'supplier_bill' and bill.id = source.source_id
left join public.vendor_payments payment
  on source.source_type = 'supplier_payment' and payment.id = source.source_id
join public.vendors supplier
  on supplier.id = coalesce(bill.vendor_id, payment.vendor_id)
where ledger.account_id in (
  select account.id
  from public.chart_of_accounts account
  where account.company_id = ledger.company_id
    and account.statement_mapping = 'balance_sheet.payables'
);

create or replace view public.customer_subledger_reconciliation
with (security_invoker = true)
as
with subledger as (
  select company_id, round(sum(signed_amount), 4) as subledger_balance
  from public.customer_subledger_entries
  group by company_id
), general_ledger as (
  select company_id, round(sum(debit - credit), 4) as gl_balance
  from public.general_ledger_entries ledger
  where ledger.account_id in (
    select account.id from public.chart_of_accounts account
    where account.company_id = ledger.company_id
      and account.statement_mapping = 'balance_sheet.receivables'
  )
  group by company_id
)
select
  coalesce(subledger.company_id, general_ledger.company_id) as company_id,
  coalesce(subledger.subledger_balance, 0)::numeric(20,4) as subledger_balance,
  coalesce(general_ledger.gl_balance, 0)::numeric(20,4) as gl_balance,
  round(coalesce(subledger.subledger_balance, 0) - coalesce(general_ledger.gl_balance, 0), 4)::numeric(20,4) as difference,
  round(coalesce(subledger.subledger_balance, 0) - coalesce(general_ledger.gl_balance, 0), 4) = 0 as reconciles
from subledger
full join general_ledger on general_ledger.company_id = subledger.company_id;

create or replace view public.supplier_subledger_reconciliation
with (security_invoker = true)
as
with subledger as (
  select company_id, round(sum(signed_amount), 4) as subledger_balance
  from public.supplier_subledger_entries
  group by company_id
), general_ledger as (
  select company_id, round(sum(debit - credit), 4) as gl_balance
  from public.general_ledger_entries ledger
  where ledger.account_id in (
    select account.id from public.chart_of_accounts account
    where account.company_id = ledger.company_id
      and account.statement_mapping = 'balance_sheet.payables'
  )
  group by company_id
)
select
  coalesce(subledger.company_id, general_ledger.company_id) as company_id,
  coalesce(subledger.subledger_balance, 0)::numeric(20,4) as subledger_balance,
  coalesce(general_ledger.gl_balance, 0)::numeric(20,4) as gl_balance,
  round(coalesce(subledger.subledger_balance, 0) - coalesce(general_ledger.gl_balance, 0), 4)::numeric(20,4) as difference,
  round(coalesce(subledger.subledger_balance, 0) - coalesce(general_ledger.gl_balance, 0), 4) = 0 as reconciles
from subledger
full join general_ledger on general_ledger.company_id = subledger.company_id;

grant select on public.customer_subledger_entries,
  public.supplier_subledger_entries,
  public.customer_subledger_reconciliation,
  public.supplier_subledger_reconciliation
to authenticated;

revoke all on function public.prepare_supplier_bill_for_posting(uuid, text) from public;
revoke all on function public.post_supplier_bill(uuid, uuid, text) from public;
revoke all on function public.record_supplier_payment(uuid, uuid, date, numeric, text, uuid, text, text, uuid, text, uuid) from public;
revoke all on function public.post_expense(uuid, uuid, text) from public;
revoke all on function public.post_credit_note(uuid, uuid, text) from public;
revoke all on function public.reverse_customer_payment(uuid, date, text) from public;
revoke all on function public.reverse_supplier_payment(uuid, date, text) from public;
grant execute on function public.prepare_supplier_bill_for_posting(uuid, text) to authenticated;
grant execute on function public.post_supplier_bill(uuid, uuid, text) to authenticated;
grant execute on function public.record_supplier_payment(uuid, uuid, date, numeric, text, uuid, text, text, uuid, text, uuid) to authenticated;
grant execute on function public.post_expense(uuid, uuid, text) to authenticated;
grant execute on function public.post_credit_note(uuid, uuid, text) to authenticated;
grant execute on function public.reverse_customer_payment(uuid, date, text) to authenticated;
grant execute on function public.reverse_supplier_payment(uuid, date, text) to authenticated;

-- POS and invoice are one accounting workflow. Customer-backed invoices use
-- the receivables rule; a walk-in POS sale uses the existing cash-sale rule.
create or replace function public.post_pos_invoice(
  p_invoice_id uuid,
  p_idempotency_key uuid default null,
  p_reason text default null
)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice_row public.invoices;
  journal_row public.journal_entries;
  net_amount numeric(20,4);
  vat_amount numeric(20,4);
  gross_amount numeric(20,4);
begin
  select * into invoice_row from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'POS invoice not found' using errcode = 'P0002';
  end if;
  if not (select private.has_company_permission(invoice_row.company_id, 'sales_invoice.post')) then
    raise exception 'Insufficient permission to post POS invoices' using errcode = '42501';
  end if;
  if invoice_row.accounting_state = 'posted' then
    if p_idempotency_key is null or invoice_row.idempotency_key = p_idempotency_key then
      return invoice_row;
    end if;
    raise exception 'POS invoice has already been posted' using errcode = '55000';
  end if;
  if lower(coalesce(invoice_row.type, 'invoice')) <> 'invoice' then
    raise exception 'POS posting is available for invoices only' using errcode = '22023';
  end if;

  if invoice_row.client_id is not null then
    perform public.prepare_sales_invoice_for_posting(p_invoice_id, coalesce(p_reason, 'POS invoice prepared'));
    return public.post_sales_invoice(p_invoice_id, p_idempotency_key, coalesce(p_reason, 'POS invoice posted'));
  end if;

  select calculated.net_amount, calculated.tax_amount, calculated.gross_amount
  into net_amount, vat_amount, gross_amount
  from private.sales_invoice_amounts(invoice_row.id) calculated;
  if gross_amount <= 0 then
    raise exception 'POS invoice total must be greater than zero' using errcode = '23514';
  end if;

  perform set_config('app.financial_workflow', 'authorized', true);
  update public.invoices
  set accounting_state = 'ready_for_posting', posting_date = coalesce(posting_date, issue_date, current_date)
  where id = invoice_row.id;
  perform set_config('app.financial_workflow', '', true);

  journal_row := public.create_automatic_journal(
    invoice_row.company_id, 'pos_sale', 'pos_invoice', invoice_row.id,
    invoice_row.invoice_number, coalesce(invoice_row.posting_date, invoice_row.issue_date, current_date),
    coalesce(invoice_row.issue_date, current_date), 'POS invoice ' || invoice_row.invoice_number,
    jsonb_build_object('net', net_amount, 'tax', vat_amount, 'gross', gross_amount),
    invoice_row.currency, invoice_row.branch_id,
    jsonb_build_object('invoice_number', invoice_row.invoice_number, 'walk_in_sale', true)
  );

  perform set_config('app.financial_workflow', 'authorized', true);
  update public.invoices
  set status = 'posted', accounting_state = 'posted',
      posting_date = coalesce(posting_date, issue_date, current_date),
      fiscal_year_id = (select fiscal_year_id from public.accounting_periods where id = journal_row.period_id),
      posted_at = clock_timestamp(), posted_by = (select auth.uid()),
      posting_journal_entry_id = journal_row.id,
      idempotency_key = coalesce(p_idempotency_key, idempotency_key),
      total_amount = gross_amount, tax_amount = vat_amount
  where id = invoice_row.id
  returning * into invoice_row;
  perform set_config('app.financial_workflow', '', true);
  return invoice_row;
end
$$;

revoke all on function public.post_pos_invoice(uuid, uuid, text) from public;
grant execute on function public.post_pos_invoice(uuid, uuid, text) to authenticated;

drop trigger if exists accounting_opening_balances_audit on public.accounting_opening_balances;
create trigger accounting_opening_balances_audit
after insert or update or delete on public.accounting_opening_balances
for each row execute function private.audit_table_change();
