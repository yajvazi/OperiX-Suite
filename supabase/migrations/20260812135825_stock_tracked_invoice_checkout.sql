-- Allow the mobile POS/invoice flow to sell stock-tracked products safely.
-- The legacy POS command intentionally rejected these products because the
-- Phase D inventory ledger was not present. This is a small, invoice-scoped
-- stock issue ledger: each checkout locks the product row, validates stock,
-- writes the invoice and lines, and decrements stock in one transaction.

create table if not exists public.inventory_stock_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  product_id uuid not null references public.products(id) on delete restrict,
  invoice_id uuid references public.invoices(id) on delete set null,
  movement_type text not null check (movement_type in ('invoice_issue', 'invoice_reversal', 'manual_adjustment')),
  quantity_delta numeric not null check (quantity_delta <> 0),
  stock_before numeric not null,
  stock_after numeric not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists inventory_stock_movements_product_idx
  on public.inventory_stock_movements (product_id, created_at desc);

create index if not exists inventory_stock_movements_invoice_idx
  on public.inventory_stock_movements (invoice_id);

alter table public.inventory_stock_movements enable row level security;

drop policy if exists inventory_stock_movements_select on public.inventory_stock_movements;
create policy inventory_stock_movements_select
  on public.inventory_stock_movements
  for select
  to authenticated
  using (
    (select auth.uid()) = created_by
    or public.can_access_company(company_id)
    or exists (
      select 1
      from public.products product
      where product.id = inventory_stock_movements.product_id
        and (
          product.user_id = (select auth.uid())
          or public.can_access_company(product.company_id)
        )
    )
  );

revoke all on table public.inventory_stock_movements from anon, authenticated;
grant select on table public.inventory_stock_movements to authenticated;

-- Until a stock-return command exists, a posted stock issue must not be
-- orphaned by deleting the invoice or replacing its lines from the editor.
create or replace function private.prevent_stock_invoice_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.inventory_stock_movements movement
    where movement.invoice_id = old.id
  ) then
    raise exception 'Stock-tracked invoices cannot be deleted before a stock return is recorded'
      using errcode = '55000';
  end if;
  return old;
end;
$$;

revoke all on function private.prevent_stock_invoice_delete() from public, authenticated;

drop trigger if exists prevent_stock_invoice_delete on public.invoices;
create trigger prevent_stock_invoice_delete
before delete on public.invoices
for each row execute function private.prevent_stock_invoice_delete();

create or replace function private.prevent_stock_invoice_item_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_invoice_id uuid;
begin
  target_invoice_id := case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end;
  if exists (
    select 1
    from public.inventory_stock_movements movement
    where movement.invoice_id = target_invoice_id
  ) then
    raise exception 'Stock-tracked invoice lines cannot be edited after checkout'
      using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.prevent_stock_invoice_item_mutation() from public, authenticated;

drop trigger if exists prevent_stock_invoice_item_mutation on public.invoice_items;
create trigger prevent_stock_invoice_item_mutation
before update or delete on public.invoice_items
for each row execute function private.prevent_stock_invoice_item_mutation();

create or replace function public.create_stock_tracked_invoice(
  p_invoice jsonb,
  p_items jsonb,
  p_idempotency_key uuid default null
)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  invoice_user_id uuid;
  invoice_company_id uuid;
  invoice_client_id uuid;
  invoice_row public.invoices;
  client_row public.clients;
  product_row public.products;
  item_record record;
  stock_before numeric;
  stock_after numeric;
  required_quantity numeric;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_invoice, '{}'::jsonb)) <> 'object' then
    raise exception 'Invoice payload must be an object' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'At least one invoice item is required' using errcode = '22023';
  end if;

  invoice_user_id := nullif(p_invoice ->> 'user_id', '')::uuid;
  invoice_company_id := nullif(p_invoice ->> 'company_id', '')::uuid;
  invoice_client_id := nullif(p_invoice ->> 'client_id', '')::uuid;

  if invoice_user_id is null then
    invoice_user_id := current_user_id;
  elsif invoice_user_id <> current_user_id then
    raise exception 'Invoice user does not match the signed-in user' using errcode = '42501';
  end if;

  if invoice_company_id is not null
     and not public.can_access_company(invoice_company_id) then
    raise exception 'You do not have access to this company' using errcode = '42501';
  end if;

  -- A retry after a network timeout returns the original invoice instead of
  -- issuing the same stock twice.
  if p_idempotency_key is not null then
    select *
    into invoice_row
    from public.invoices
    where company_id is not distinct from invoice_company_id
      and idempotency_key = p_idempotency_key
      and (
        user_id = current_user_id
        or public.can_access_company(company_id)
      )
    order by created_at desc
    limit 1
    for update;

    if found then
      return invoice_row;
    end if;
  end if;

  if nullif(trim(coalesce(p_invoice ->> 'invoice_number', '')), '') is null then
    raise exception 'Invoice number is required' using errcode = '22023';
  end if;
  if lower(coalesce(p_invoice ->> 'type', 'invoice')) <> 'invoice' then
    raise exception 'Stock checkout is available for invoices only' using errcode = '22023';
  end if;

  -- Validate every line before changing anything. This also prevents a
  -- negative line from cancelling a positive line for the same product.
  for item_record in
    select *
    from jsonb_to_recordset(p_items) as item(
      product_id uuid,
      description text,
      quantity numeric,
      unit text,
      unit_price numeric,
      tax_rate numeric,
      discount numeric,
      sku text,
      amount numeric
    )
  loop
    if coalesce(item_record.quantity, 0) <= 0 then
      raise exception 'Invoice quantities must be greater than zero' using errcode = '22023';
    end if;
    if item_record.product_id is null
       and nullif(trim(coalesce(item_record.description, '')), '') is null then
      raise exception 'Every invoice line needs a product or description' using errcode = '22023';
    end if;
  end loop;

  if invoice_client_id is not null then
    select *
    into client_row
    from public.clients
    where id = invoice_client_id
      and (
        user_id = current_user_id
        or public.can_access_company(company_id)
      );

    if not found then
      raise exception 'The selected customer is not available in this company' using errcode = '22023';
    end if;
    if invoice_company_id is not null
       and client_row.company_id is not null
       and not private.company_is_in_scope(invoice_company_id, client_row.company_id) then
      raise exception 'The selected customer belongs to another company' using errcode = '22023';
    end if;
  end if;

  -- Lock every referenced product before inserting the invoice. Two devices
  -- attempting to sell the last unit therefore serialize instead of both
  -- succeeding against the same displayed stock value.
  for item_record in
    select item.product_id, sum(item.quantity) as quantity
    from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric)
    where item.product_id is not null
    group by item.product_id
  loop
    required_quantity := item_record.quantity;

    select *
    into product_row
    from public.products
    where id = item_record.product_id
    for update;

    if not found then
      raise exception 'One of the selected products no longer exists' using errcode = '22023';
    end if;
    if not (
      product_row.user_id = current_user_id
      or public.can_access_company(product_row.company_id)
    ) then
      raise exception 'You do not have access to one of the selected products' using errcode = '42501';
    end if;
    if invoice_company_id is not null
       and product_row.company_id is not null
       and not private.company_is_in_scope(invoice_company_id, product_row.company_id) then
      raise exception 'A product belongs to another company subdivision' using errcode = '22023';
    end if;

    if coalesce(product_row.track_stock, false)
       and coalesce(product_row.stock_quantity, 0) < required_quantity then
      raise exception 'Not enough stock for "%". Available: %, requested: %',
        product_row.name, coalesce(product_row.stock_quantity, 0), required_quantity
        using errcode = '22003';
    end if;
  end loop;

  begin
    insert into public.invoices (
      user_id, company_id, client_id, invoice_number, issue_date, due_date,
      notes, status, type, subtype, tax_amount, discount_amount,
      discount_percent, total_amount, amount_received, payment_method,
      change_amount, idempotency_key
    ) values (
      invoice_user_id,
      invoice_company_id,
      invoice_client_id,
      trim(p_invoice ->> 'invoice_number'),
      coalesce(nullif(p_invoice ->> 'issue_date', '')::date, current_date),
      nullif(p_invoice ->> 'due_date', '')::date,
      p_invoice ->> 'notes',
      coalesce(nullif(p_invoice ->> 'status', '')::public.invoice_status, 'draft'::public.invoice_status),
      'invoice',
      coalesce(nullif(p_invoice ->> 'subtype', ''), 'regular'),
      coalesce(nullif(p_invoice ->> 'tax_amount', '')::numeric, 0),
      coalesce(nullif(p_invoice ->> 'discount_amount', '')::numeric, 0),
      coalesce(nullif(p_invoice ->> 'discount_percent', '')::numeric, 0),
      coalesce(nullif(p_invoice ->> 'total_amount', '')::numeric, 0),
      coalesce(nullif(p_invoice ->> 'amount_received', '')::numeric, 0),
      coalesce(nullif(p_invoice ->> 'payment_method', ''), 'bank'),
      coalesce(nullif(p_invoice ->> 'change_amount', '')::numeric, 0),
      p_idempotency_key
    )
    returning * into invoice_row;
  exception
    when unique_violation then
      if p_idempotency_key is null then
        raise;
      end if;

      select *
      into invoice_row
      from public.invoices
      where company_id is not distinct from invoice_company_id
        and idempotency_key = p_idempotency_key
        and (
          user_id = current_user_id
          or public.can_access_company(company_id)
        )
      order by created_at desc
      limit 1
      for update;

      if not found then
        raise;
      end if;
      return invoice_row;
  end;

  for item_record in
    select *
    from jsonb_to_recordset(p_items) as item(
      product_id uuid,
      description text,
      quantity numeric,
      unit text,
      unit_price numeric,
      tax_rate numeric,
      discount numeric,
      sku text,
      amount numeric
    )
  loop
    if item_record.product_id is not null then
      select * into product_row
      from public.products
      where id = item_record.product_id;
    else
      product_row := null;
    end if;

    insert into public.invoice_items (
      invoice_id, product_id, description, quantity, unit, unit_price,
      tax_rate, discount, sku, amount
    ) values (
      invoice_row.id,
      item_record.product_id,
      coalesce(nullif(trim(item_record.description), ''), product_row.name),
      item_record.quantity,
      coalesce(nullif(item_record.unit, ''), product_row.unit, 'pcs'),
      coalesce(item_record.unit_price, product_row.unit_price, 0),
      coalesce(item_record.tax_rate, product_row.tax_rate, 0),
      coalesce(item_record.discount, 0),
      coalesce(nullif(item_record.sku, ''), product_row.sku, product_row.barcode, ''),
      coalesce(
        item_record.amount,
        item_record.quantity * coalesce(item_record.unit_price, product_row.unit_price, 0)
          * (1 - coalesce(item_record.discount, 0) / 100)
      )
    );
  end loop;

  -- Only tracked products are decremented. Non-stock products remain valid
  -- invoice lines and do not create a misleading inventory movement.
  for item_record in
    select item.product_id, sum(item.quantity) as quantity
    from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric)
    where item.product_id is not null
    group by item.product_id
  loop
    select * into product_row
    from public.products
    where id = item_record.product_id
    for update;

    if product_row.track_stock then
      stock_before := coalesce(product_row.stock_quantity, 0);
      stock_after := stock_before - item_record.quantity;

      update public.products
      set stock_quantity = stock_after
      where id = product_row.id;

      insert into public.inventory_stock_movements (
        company_id, product_id, invoice_id, movement_type, quantity_delta,
        stock_before, stock_after, created_by
      ) values (
        product_row.company_id,
        product_row.id,
        invoice_row.id,
        'invoice_issue',
        -item_record.quantity,
        stock_before,
        stock_after,
        current_user_id
      );
    end if;
  end loop;

  return invoice_row;
end;
$$;

revoke all on function public.create_stock_tracked_invoice(jsonb, jsonb, uuid) from public, anon;
grant execute on function public.create_stock_tracked_invoice(jsonb, jsonb, uuid) to authenticated;

comment on function public.create_stock_tracked_invoice(jsonb, jsonb, uuid) is
  'Atomically creates a mobile invoice and issues stock-tracked products with row locking and an inventory movement record.';
