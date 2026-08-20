begin;

-- Customer acceptance is an optional part of the existing invoice workflow.
-- The captured signature stays on the invoice so all existing invoice views,
-- portal links and PDF renderers can use the same source of truth.
alter table public.invoices
  add column if not exists customer_signature_requested boolean not null default false,
  add column if not exists customer_signature_status text not null default 'not_requested',
  add column if not exists customer_signature_name text,
  add column if not exists customer_signed_at timestamptz;

-- Existing buyer signatures are preserved as completed customer acceptance.
update public.invoices
set customer_signature_requested = true,
    customer_signature_status = 'signed'
where buyer_signature_url is not null
  and customer_signature_status = 'not_requested';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.invoices'::regclass
      and conname = 'invoices_customer_signature_status_check'
  ) then
    alter table public.invoices
      add constraint invoices_customer_signature_status_check
      check (
        (customer_signature_status = 'not_requested'
          and customer_signature_requested = false
          and buyer_signature_url is null)
        or (customer_signature_status = 'pending'
          and customer_signature_requested = true
          and buyer_signature_url is null)
        or (customer_signature_status = 'signed'
          and customer_signature_requested = true
          and buyer_signature_url is not null)
        or (customer_signature_status = 'declined'
          and customer_signature_requested = true)
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.invoices'::regclass
      and conname = 'invoices_buyer_signature_size_check'
  ) then
    alter table public.invoices
      add constraint invoices_buyer_signature_size_check
      check (buyer_signature_url is null or length(buyer_signature_url) <= 2000000);
  end if;
end
$$;

create index if not exists invoices_customer_signature_status_idx
  on public.invoices (company_id, customer_signature_status)
  where customer_signature_requested = true;

comment on column public.invoices.customer_signature_requested is
  'Whether the issuer asked the customer to sign before the invoice was created.';
comment on column public.invoices.customer_signature_status is
  'Customer acceptance state: not_requested, pending, signed or declined.';
comment on column public.invoices.buyer_signature_url is
  'Captured customer signature image/data URI. Posted invoice signatures are immutable.';

-- Record the acceptance state without duplicating the potentially large image
-- data in the audit log. The existing posted-document immutability trigger on
-- invoices protects these fields after posting.
create or replace function private.audit_invoice_customer_signature()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     and not coalesce(new.customer_signature_requested, false)
     and new.buyer_signature_url is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and old.customer_signature_requested is not distinct from new.customer_signature_requested
     and old.customer_signature_status is not distinct from new.customer_signature_status
     and old.customer_signature_name is not distinct from new.customer_signature_name
     and old.customer_signed_at is not distinct from new.customer_signed_at
     and old.buyer_signature_url is not distinct from new.buyer_signature_url then
    return new;
  end if;

  insert into public.audit_events (
    company_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    entity_key,
    previous_values,
    new_values,
    reason
  ) values (
    new.company_id,
    (select auth.uid()),
    case when tg_op = 'INSERT' then 'customer_signature_requested' else 'customer_signature_updated' end,
    'invoices',
    new.id,
    new.invoice_number,
    case when tg_op = 'UPDATE' then jsonb_build_object(
      'requested', old.customer_signature_requested,
      'status', old.customer_signature_status,
      'name', old.customer_signature_name,
      'signed_at', old.customer_signed_at,
      'has_signature', old.buyer_signature_url is not null
    ) else null end,
    jsonb_build_object(
      'requested', new.customer_signature_requested,
      'status', new.customer_signature_status,
      'name', new.customer_signature_name,
      'signed_at', new.customer_signed_at,
      'has_signature', new.buyer_signature_url is not null
    ),
    'Customer acceptance captured during invoice creation'
  );
  return new;
end
$$;

drop trigger if exists invoices_customer_signature_audit on public.invoices;
create trigger invoices_customer_signature_audit
after insert or update on public.invoices
for each row execute function private.audit_invoice_customer_signature();

-- POS stock checkout is already transactional. This wrapper adds the
-- customer-signature fields in that same transaction, avoiding a separate
-- client update between stock issue and invoice posting.
create or replace function public.create_stock_tracked_invoice_with_signature(
  p_invoice jsonb,
  p_items jsonb,
  p_idempotency_key uuid default null,
  p_customer_signature jsonb default null
)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice_row public.invoices;
  requested boolean;
  signature_url text;
  signature_name text;
  signed_at timestamptz;
  desired_status text;
  desired_signature_url text;
  desired_signature_name text;
begin
  invoice_row := public.create_stock_tracked_invoice(p_invoice, p_items, p_idempotency_key);

  if p_customer_signature is null then
    return invoice_row;
  end if;

  requested := coalesce((p_customer_signature ->> 'requested')::boolean, false);
  signature_url := nullif(trim(p_customer_signature ->> 'signature_url'), '');
  signature_name := nullif(trim(p_customer_signature ->> 'name'), '');
  desired_signature_url := case when requested then signature_url else null end;
  desired_signature_name := case when requested then signature_name else null end;
  desired_status := case
    when not requested then 'not_requested'
    when signature_url is not null then 'signed'
    else 'pending'
  end;
  signed_at := case
    when requested and signature_url is not null
      then coalesce(
        nullif(p_customer_signature ->> 'signed_at', '')::timestamptz,
        case when invoice_row.buyer_signature_url is not distinct from signature_url
          then invoice_row.customer_signed_at
          else null
        end,
        clock_timestamp()
      )
    else null
  end;

  if signature_url is not null and length(signature_url) > 2000000 then
    raise exception 'Customer signature is too large' using errcode = '22023';
  end if;

  -- Do not issue a no-op update on an idempotent retry of an already-posted
  -- invoice: posted-document immutability correctly rejects real changes.
  if invoice_row.customer_signature_requested is distinct from requested
     or invoice_row.buyer_signature_url is distinct from desired_signature_url
     or invoice_row.customer_signature_name is distinct from desired_signature_name
     or invoice_row.customer_signed_at is distinct from signed_at
     or invoice_row.customer_signature_status is distinct from desired_status then
    update public.invoices
    set customer_signature_requested = requested,
        customer_signature_status = desired_status,
        customer_signature_name = desired_signature_name,
        customer_signed_at = signed_at,
        buyer_signature_url = desired_signature_url
    where id = invoice_row.id
    returning * into invoice_row;
  end if;

  return invoice_row;
end
$$;

revoke all on function public.create_stock_tracked_invoice_with_signature(jsonb, jsonb, uuid, jsonb) from public, anon;
grant execute on function public.create_stock_tracked_invoice_with_signature(jsonb, jsonb, uuid, jsonb) to authenticated;

comment on function public.create_stock_tracked_invoice_with_signature(jsonb, jsonb, uuid, jsonb) is
  'Atomically creates a stock-tracked invoice and stores optional customer acceptance before posting.';

-- Keep the token-scoped customer portal aligned with the invoice record so a
-- recipient sees the same two signatures as the issuer-created PDF.
create or replace function public.get_customer_portal_data(portal_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  portal customer_portal_tokens%rowtype;
  result jsonb;
begin
  select * into portal
  from customer_portal_tokens
  where token = portal_token
    and (expires_at is null or expires_at > now());
  if not found then
    return jsonb_build_object('error', 'This customer portal link is invalid or expired.');
  end if;

  update customer_portal_tokens set last_used_at = now() where id = portal.id;

  select jsonb_build_object(
    'company', (select to_jsonb(c) - 'id' from companies c where c.id = portal.company_id),
    'client', (select to_jsonb(c) - 'id' from clients c where c.id = portal.client_id),
    'invoices', coalesce((select jsonb_agg(jsonb_build_object(
      'id', i.id,
      'invoice_number', i.invoice_number,
      'issue_date', i.issue_date,
      'due_date', i.due_date,
      'status', i.status,
      'total_amount', i.total_amount,
      'tax_amount', i.tax_amount,
      'amount_received', coalesce(i.amount_received, 0),
      'notes', i.notes,
      'buyer_signature_url', i.buyer_signature_url,
      'customer_signature_requested', i.customer_signature_requested,
      'customer_signature_status', i.customer_signature_status,
      'customer_signature_name', i.customer_signature_name,
      'customer_signed_at', i.customer_signed_at,
      'items', coalesce((select jsonb_agg(to_jsonb(ii) - 'id' - 'invoice_id') from invoice_items ii where ii.invoice_id = i.id), '[]'::jsonb)
    ) order by i.issue_date desc) from invoices i where i.client_id = portal.client_id and i.company_id = portal.company_id and i.type is distinct from 'offer' and i.status::text <> 'cancelled'), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

grant execute on function public.get_customer_portal_data(text) to anon, authenticated;

-- The web POS completion command is already the single transactional sale
-- workflow and posts the invoice inside its database function. A transaction
-- local signature context lets a thin RPC wrapper add acceptance before that
-- existing post occurs, without creating a second POS implementation.
create or replace function private.apply_customer_signature_context()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  context_payload jsonb;
  requested boolean;
  signature_url text;
  signature_name text;
  signed_at timestamptz;
begin
  if tg_op <> 'INSERT' then
    return new;
  end if;

  context_payload := nullif(current_setting('app.customer_signature_context', true), '')::jsonb;
  if context_payload is null or jsonb_typeof(context_payload) <> 'object' then
    return new;
  end if;

  requested := coalesce((context_payload ->> 'requested')::boolean, false);
  signature_url := nullif(trim(context_payload ->> 'signature_url'), '');
  signature_name := nullif(trim(context_payload ->> 'name'), '');
  signed_at := case
    when requested and signature_url is not null
      then coalesce(nullif(context_payload ->> 'signed_at', '')::timestamptz, clock_timestamp())
    else null
  end;

  if requested and signature_url is null then
    raise exception 'Customer signature is required before completing this POS invoice' using errcode = '23514';
  end if;

  new.customer_signature_requested := requested;
  new.customer_signature_status := case
    when not requested then 'not_requested'
    when signature_url is not null then 'signed'
    else 'pending'
  end;
  new.customer_signature_name := case when requested then signature_name else null end;
  new.customer_signed_at := signed_at;
  new.buyer_signature_url := case when requested then signature_url else null end;
  return new;
end
$$;

drop trigger if exists invoices_customer_signature_context on public.invoices;
create trigger invoices_customer_signature_context
before insert on public.invoices
for each row execute function private.apply_customer_signature_context();

create or replace function public.complete_pos_sale_with_signature(
  p_company_id uuid,
  p_terminal_id uuid,
  p_customer_id uuid,
  p_items jsonb,
  p_payments jsonb,
  p_invoice_type text default 'invoice',
  p_notes text default null,
  p_idempotency_key uuid default null,
  p_occurred_at timestamptz default clock_timestamp(),
  p_customer_signature jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform set_config('app.customer_signature_context', coalesce(p_customer_signature, '{}'::jsonb)::text, true);
  result := public.complete_pos_sale(
    p_company_id,
    p_terminal_id,
    p_customer_id,
    p_items,
    p_payments,
    p_invoice_type,
    p_notes,
    p_idempotency_key,
    p_occurred_at
  );
  perform set_config('app.customer_signature_context', '', true);
  return result;
exception
  when others then
    perform set_config('app.customer_signature_context', '', true);
    raise;
end
$$;

revoke all on function public.complete_pos_sale_with_signature(uuid, uuid, uuid, jsonb, jsonb, text, text, uuid, timestamptz, jsonb) from public, anon;
grant execute on function public.complete_pos_sale_with_signature(uuid, uuid, uuid, jsonb, jsonb, text, text, uuid, timestamptz, jsonb) to authenticated;

comment on function public.complete_pos_sale_with_signature(uuid, uuid, uuid, jsonb, jsonb, text, text, uuid, timestamptz, jsonb) is
  'Completes the existing transactional POS sale while capturing optional customer acceptance before invoice posting.';

commit;
