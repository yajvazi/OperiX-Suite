-- Phase E2 acceptance gate: enforce terminal shift policy inside the same
-- idempotent transaction that completes the POS sale.

create or replace function public.complete_pos_sale(
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
  terminal_row public.pos_terminals;
  shift_row public.cashier_shifts;
  result jsonb;
  result_order_id uuid;
  cash_amount numeric(20,4);
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

  terminal_row := private.resolve_pos_terminal(p_company_id, p_terminal_id);

  -- This insert serializes duplicate browser, network, and offline replay
  -- requests. A failed core transaction rolls the reservation back too.
  insert into public.pos_command_idempotency (company_id, idempotency_key, terminal_id, created_by)
  values (p_company_id, p_idempotency_key, terminal_row.id, (select auth.uid()))
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
      'cashier_shift_id', existing_order.cashier_shift_id,
      'idempotent', true
    );
  end if;

  if terminal_row.cashier_shift_required then
    select *
    into shift_row
    from public.cashier_shifts
    where company_id = p_company_id
      and terminal_id = terminal_row.id
      and cashier_id = (select auth.uid())
      and status in ('open','active','reopened')
    for update;

    if not found then
      raise exception 'Open your cashier shift before completing a sale on this terminal'
        using errcode = '55000';
    end if;
  end if;

  result := private.complete_pos_sale_core(
    p_company_id,
    terminal_row.id,
    p_customer_id,
    p_items,
    p_payments,
    p_invoice_type,
    p_notes,
    p_idempotency_key,
    p_occurred_at
  );
  result_order_id := nullif(result ->> 'order_id', '')::uuid;

  if shift_row.id is not null then
    perform set_config('app.pos_workflow', 'authorized', true);
    update public.pos_orders
    set cashier_shift_id = shift_row.id,
        updated_at = clock_timestamp(),
        updated_by = (select auth.uid())
    where id = result_order_id;

    update public.pos_payments
    set cashier_shift_id = shift_row.id
    where pos_order_id = result_order_id;
    perform set_config('app.pos_workflow', '', true);

    select coalesce(sum(payment.allocated_amount), 0)
    into cash_amount
    from public.pos_payments payment
    where payment.pos_order_id = result_order_id
      and payment.payment_method = 'cash';

    if cash_amount <> 0 then
      update public.cashier_shifts
      set expected_cash = round(expected_cash + cash_amount, 4),
          updated_at = clock_timestamp()
      where id = shift_row.id
      returning * into shift_row;

      insert into public.cashier_shift_movements (
        company_id, cashier_shift_id, terminal_id, movement_type, amount,
        currency, source_type, source_id, reason, created_by
      )
      values (
        p_company_id, shift_row.id, terminal_row.id, 'cash_sale',
        round(cash_amount, 4), 'EUR', 'pos_order', result_order_id,
        'Cash received from completed POS sale', (select auth.uid())
      );
    end if;

    insert into public.cashier_shift_events (
      company_id, cashier_shift_id, event_type, payload, actor_id
    )
    values (
      p_company_id, shift_row.id, 'sale_completed',
      jsonb_build_object(
        'pos_order_id', result_order_id,
        'invoice_id', nullif(result ->> 'invoice_id', '')::uuid,
        'total_amount', result ->> 'total_amount',
        'cash_amount', cash_amount
      ),
      (select auth.uid())
    );

    result := result || jsonb_build_object('cashier_shift_id', shift_row.id);
  end if;

  update public.pos_command_idempotency
  set order_id = result_order_id,
      invoice_id = nullif(result ->> 'invoice_id', '')::uuid,
      status = 'completed',
      completed_at = clock_timestamp()
  where company_id = p_company_id and idempotency_key = p_idempotency_key;

  return result;
end
$$;

revoke all on function public.complete_pos_sale(uuid, uuid, uuid, jsonb, jsonb, text, text, uuid, timestamptz) from public;
grant execute on function public.complete_pos_sale(uuid, uuid, uuid, jsonb, jsonb, text, text, uuid, timestamptz) to authenticated;

comment on function public.complete_pos_sale(uuid, uuid, uuid, jsonb, jsonb, text, text, uuid, timestamptz) is
  'Idempotent transactional POS completion with terminal cashier-shift enforcement and atomic expected-cash movement.';
