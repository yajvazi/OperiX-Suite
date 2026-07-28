-- Phase E1 follow-up: immutable command reservations and a feature-flagged
-- public POS command. Keep the Phase E1 migration immutable after deployment.

create table if not exists public.pos_command_idempotency (
  company_id uuid not null references public.companies(id) on delete restrict,
  idempotency_key uuid not null,
  terminal_id uuid references public.pos_terminals(id) on delete set null,
  order_id uuid references public.pos_orders(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  primary key (company_id, idempotency_key)
);

-- Move the original implementation behind the private API. Its complete
-- transaction remains unchanged; the wrapper below reserves its key before
-- any financial writes can start.
alter function public.complete_pos_sale(uuid, uuid, uuid, jsonb, jsonb, text, text, uuid, timestamptz)
  rename to complete_pos_sale_core;
alter function public.complete_pos_sale_core(uuid, uuid, uuid, jsonb, jsonb, text, text, uuid, timestamptz)
  set schema private;

revoke all on function private.complete_pos_sale_core(uuid, uuid, uuid, jsonb, jsonb, text, text, uuid, timestamptz) from public;
revoke all on function private.complete_pos_sale_core(uuid, uuid, uuid, jsonb, jsonb, text, text, uuid, timestamptz) from authenticated;

create function public.complete_pos_sale(
  p_company_id uuid,
  p_terminal_id uuid,
  p_customer_id uuid,
  p_items jsonb,
  p_payments jsonb,
  p_invoice_type text default 'invoice',
  p_notes text default null,
  p_idempotency_key uuid default null,
  p_occurred_at timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation public.pos_command_idempotency;
  existing_order public.pos_orders;
  result jsonb;
begin
  if p_company_id is null or p_idempotency_key is null then
    raise exception 'Company and idempotency key are required for POS completion' using errcode = '23514';
  end if;
  if not (select private.is_company_member(p_company_id))
    or not (select private.has_company_permission(p_company_id, 'pos.complete'))
    or not (select private.has_company_permission(p_company_id, 'pos.terminal.use')) then
    raise exception 'Insufficient permission to complete POS sales on this terminal' using errcode = '42501';
  end if;
  if not coalesce((
    select flag.enabled
    from public.company_feature_flags flag
    where flag.company_id = p_company_id and flag.flag = 'transactional_pos_enabled'
  ), false) then
    raise exception 'Transactional POS is not enabled for this company' using errcode = '55000';
  end if;

  -- This insert serializes duplicate browser, network, and offline replay
  -- requests. A failed core transaction rolls the reservation back too.
  insert into public.pos_command_idempotency (company_id, idempotency_key, terminal_id, created_by)
  values (p_company_id, p_idempotency_key, p_terminal_id, (select auth.uid()))
  on conflict (company_id, idempotency_key) do nothing;

  select * into reservation
  from public.pos_command_idempotency
  where company_id = p_company_id and idempotency_key = p_idempotency_key
  for update;

  if reservation.order_id is not null then
    select * into existing_order from public.pos_orders where id = reservation.order_id;
    return jsonb_build_object(
      'order_id', reservation.order_id,
      'invoice_id', reservation.invoice_id,
      'invoice_number', existing_order.order_number,
      'order_number', existing_order.order_number,
      'total_amount', existing_order.total_amount,
      'change_amount', existing_order.change_amount,
      'idempotent', true
    );
  end if;

  result := private.complete_pos_sale_core(
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

  update public.pos_command_idempotency
  set order_id = nullif(result ->> 'order_id', '')::uuid,
      invoice_id = nullif(result ->> 'invoice_id', '')::uuid,
      status = 'completed',
      completed_at = clock_timestamp()
  where company_id = p_company_id and idempotency_key = p_idempotency_key;

  return result;
end
$$;

alter table public.pos_command_idempotency enable row level security;
drop policy if exists "pos_command_idempotency_member_select" on public.pos_command_idempotency;
create policy "pos_command_idempotency_member_select"
  on public.pos_command_idempotency
  for select
  to authenticated
  using ((select private.is_company_member(company_id)));

drop trigger if exists pos_command_idempotency_audit on public.pos_command_idempotency;
create trigger pos_command_idempotency_audit
  after insert or update or delete on public.pos_command_idempotency
  for each row execute function private.audit_table_change();

revoke all on function public.complete_pos_sale(uuid, uuid, uuid, jsonb, jsonb, text, text, uuid, timestamptz) from public;
grant execute on function public.complete_pos_sale(uuid, uuid, uuid, jsonb, jsonb, text, text, uuid, timestamptz) to authenticated;

comment on function public.complete_pos_sale(uuid, uuid, uuid, jsonb, jsonb, text, text, uuid, timestamptz) is
  'Feature-flagged Phase E POS command with database-level idempotency. It is fiscal-ready only; no TAK provider is enabled.';
