-- Shared Web/Mobile invoice persistence contract.
--
-- The two clients now submit the same canonical invoice payload and line
-- representation. This RPC keeps invoice + lines in one transaction, applies
-- the same tenant/permission checks for both clients, and optionally posts a
-- real invoice through the existing accounting command.

alter table public.invoices
  add column if not exists shipping_amount numeric(20,4) not null default 0 check (shipping_amount >= 0),
  add column if not exists shipping_tax_amount numeric(20,4) not null default 0 check (shipping_tax_amount >= 0),
  add column if not exists transport_amount numeric(20,4) not null default 0 check (transport_amount >= 0),
  add column if not exists transport_tax_amount numeric(20,4) not null default 0 check (transport_tax_amount >= 0),
  add column if not exists additional_fee_amount numeric(20,4) not null default 0 check (additional_fee_amount >= 0),
  add column if not exists additional_fee_tax_amount numeric(20,4) not null default 0 check (additional_fee_tax_amount >= 0);

alter table public.invoice_items
  add column if not exists tax_included boolean not null default false;

-- Keep the accounting source of truth aligned with the canonical persisted
-- charge fields. Existing records with the default zero values are unchanged.
create or replace function private.sales_invoice_amounts(p_invoice_id uuid)
returns table (
  net_amount numeric(20,4),
  tax_amount numeric(20,4),
  gross_amount numeric(20,4)
)
language sql
stable
security definer
set search_path = ''
as $$
  with line_totals as (
    select
      round(coalesce(item.amount, 0)::numeric, 2) as net,
      round(
        round(coalesce(item.amount, 0)::numeric, 2)
        * coalesce(item.tax_rate, 0)::numeric / 100,
        2
      ) as tax
    from public.invoice_items item
    where item.invoice_id = p_invoice_id
  ), invoice_charges as (
    select
      round(coalesce(invoice.shipping_amount, 0) + coalesce(invoice.transport_amount, 0)
        + coalesce(invoice.additional_fee_amount, 0), 2) as net,
      round(coalesce(invoice.shipping_tax_amount, 0) + coalesce(invoice.transport_tax_amount, 0)
        + coalesce(invoice.additional_fee_tax_amount, 0), 2) as tax
    from public.invoices invoice
    where invoice.id = p_invoice_id
  )
  select
    round(coalesce(sum(value.net), 0), 2),
    round(coalesce(sum(value.tax), 0), 2),
    round(coalesce(sum(value.net + value.tax), 0), 2)
  from (
    select net, tax from line_totals
    union all
    select net, tax from invoice_charges
  ) value
$$;

create or replace function public.save_invoice_document(
  p_invoice jsonb,
  p_items jsonb,
  p_invoice_id uuid default null,
  p_post_invoice boolean default false,
  p_idempotency_key uuid default null
)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  invoice_row public.invoices;
  existing_row public.invoices;
  client_row public.clients;
  product_row public.products;
  item_record record;
  calculated record;
  invoice_company_id uuid;
  invoice_user_id uuid;
  invoice_client_id uuid;
  invoice_document_type text;
  invoice_status text;
  invoice_accounting_state text;
  can_edit boolean;
begin
  if actor_id is null then
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
  invoice_document_type := upper(coalesce(nullif(trim(p_invoice ->> 'commercial_document_type'), ''), 'INVOICE'));
  invoice_status := lower(coalesce(nullif(trim(p_invoice ->> 'status'), ''), 'draft'));
  invoice_accounting_state := lower(coalesce(nullif(trim(p_invoice ->> 'accounting_state'), ''), 'legacy'));

  if invoice_user_id is distinct from actor_id then
    raise exception 'Invoice user does not match the signed-in user' using errcode = '42501';
  end if;
  if invoice_company_id is null or not public.can_access_company(invoice_company_id) then
    raise exception 'You do not have access to this company' using errcode = '42501';
  end if;
  if invoice_document_type not in (
    'QUOTE', 'PROFORMA', 'SALES_ORDER', 'DELIVERY_NOTE', 'INVOICE',
    'ADVANCE_INVOICE', 'FINAL_INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE',
    'SIMPLIFIED_INVOICE', 'FISCAL_RECEIPT', 'BAD_DEBT_INVOICE'
  ) then
    raise exception 'Unsupported commercial document type %', invoice_document_type using errcode = '22023';
  end if;
  if p_post_invoice and invoice_document_type <> 'INVOICE' then
    raise exception 'Only ordinary invoices can be posted by this command' using errcode = '22023';
  end if;
  if invoice_status not in ('draft', 'sent', 'approved') then
    raise exception 'Invoice must remain an editable draft before posting' using errcode = '55000';
  end if;

  if p_invoice_id is not null then
    select * into existing_row
    from public.invoices
    where id = p_invoice_id
    for update;
    if not found then
      raise exception 'Invoice not found' using errcode = 'P0002';
    end if;
    if (existing_row.company_id is not null and existing_row.company_id is distinct from invoice_company_id)
       or (existing_row.company_id is null and existing_row.user_id is distinct from actor_id) then
      raise exception 'Invoice belongs to another company' using errcode = '42501';
    end if;
    can_edit := coalesce(private.has_company_permission(invoice_company_id, 'sales_invoice.edit'), false);
    if not can_edit then
      raise exception 'Insufficient permission to edit sales invoices' using errcode = '42501';
    end if;
    if upper(coalesce(existing_row.commercial_status, existing_row.status::text, 'DRAFT')) not in ('DRAFT', 'SENT', 'VIEWED') then
      raise exception 'Issued documents cannot be edited; use a correction workflow' using errcode = '55000';
    end if;
  else
    if not (
      coalesce(private.has_company_permission(invoice_company_id, 'sales_invoice.create'), false)
      or coalesce(private.has_company_permission(invoice_company_id, 'invoice.create'), false)
    ) then
      raise exception 'Insufficient permission to create sales invoices' using errcode = '42501';
    end if;
    if p_idempotency_key is not null then
      select * into invoice_row
      from public.invoices
      where company_id = invoice_company_id
        and idempotency_key = p_idempotency_key
      for update;
      if found then return invoice_row; end if;
    end if;
  end if;

  if invoice_client_id is not null then
    select * into client_row
    from public.clients
    where id = invoice_client_id
      and (user_id = actor_id or public.can_access_company(company_id));
    if not found then
      raise exception 'The selected customer is not available in this company' using errcode = '22023';
    end if;
    if client_row.company_id is not null
       and not private.company_is_in_scope(invoice_company_id, client_row.company_id) then
      raise exception 'The selected customer belongs to another company' using errcode = '22023';
    end if;
  end if;

  -- Validate all lines before replacing anything. Related products must be
  -- visible to the same company scope as the invoice.
  for item_record in
    select * from jsonb_to_recordset(p_items) as item(
      product_id uuid,
      description text,
      quantity numeric,
      unit text,
      unit_price numeric,
      tax_rate numeric,
      discount numeric,
      tax_included boolean,
      sku text,
      amount numeric
    )
  loop
    if coalesce(item_record.quantity, 0) <= 0 then
      raise exception 'Invoice quantities must be greater than zero' using errcode = '22023';
    end if;
    if nullif(trim(coalesce(item_record.description, '')), '') is null then
      raise exception 'Every invoice line needs a description' using errcode = '22023';
    end if;
    if coalesce(item_record.unit_price, 0) < 0
       or coalesce(item_record.tax_rate, 0) < 0 or coalesce(item_record.tax_rate, 0) > 100
       or coalesce(item_record.discount, 0) < 0 or coalesce(item_record.discount, 0) > 100
       or coalesce(item_record.amount, 0) < 0 then
      raise exception 'Invoice contains an invalid price, VAT, discount, or amount' using errcode = '23514';
    end if;
    if item_record.product_id is not null then
      select * into product_row
      from public.products
      where id = item_record.product_id
        and (user_id = actor_id or public.can_access_company(company_id));
      if not found then
        raise exception 'One of the selected products is not available in this company' using errcode = '22023';
      end if;
      if product_row.company_id is not null
         and not private.company_is_in_scope(invoice_company_id, product_row.company_id) then
        raise exception 'A product belongs to another company subdivision' using errcode = '22023';
      end if;
    end if;
  end loop;

  if p_invoice_id is null then
    insert into public.invoices (
      user_id, company_id, client_id, invoice_number, issue_date, due_date,
      status, discount_amount, discount_percent, tax_amount, total_amount,
      notes, template_id, type, subtype, commercial_document_type,
      commercial_status, accounting_state, accounting_status, vat_status,
      inventory_status, payment_status, fiscalization_status, supply_date,
      order_date, delivery_date, source_document_type, source_document_id,
      original_invoice_id, tax_reporting_category, currency, exchange_rate,
      amount_received, payment_method, change_amount, paper_size,
      buyer_signature_url, customer_signature_requested,
      customer_signature_status, customer_signature_name, customer_signed_at,
      shipping_amount, transport_amount, additional_fee_amount, idempotency_key
      , shipping_tax_amount, transport_tax_amount, additional_fee_tax_amount
    ) values (
      actor_id, invoice_company_id, invoice_client_id, trim(p_invoice ->> 'invoice_number'),
      coalesce(nullif(p_invoice ->> 'issue_date', '')::date, current_date),
      nullif(p_invoice ->> 'due_date', '')::date,
      invoice_status::public.invoice_status,
      coalesce(nullif(p_invoice ->> 'discount_amount', '')::numeric, 0),
      coalesce(nullif(p_invoice ->> 'discount_percent', '')::numeric, 0),
      coalesce(nullif(p_invoice ->> 'tax_amount', '')::numeric, 0),
      coalesce(nullif(p_invoice ->> 'total_amount', '')::numeric, 0),
      nullif(p_invoice ->> 'notes', ''), coalesce(nullif(p_invoice ->> 'template_id', ''), 'corporate'),
      coalesce(nullif(p_invoice ->> 'type', ''), 'invoice'), coalesce(nullif(p_invoice ->> 'subtype', ''), 'regular'),
      invoice_document_type, upper(coalesce(nullif(p_invoice ->> 'commercial_status', ''), 'DRAFT')),
      case when invoice_document_type = 'INVOICE' then 'ready_for_posting' else invoice_accounting_state end,
      coalesce(nullif(p_invoice ->> 'accounting_status', ''), 'NOT_POSTED'),
      coalesce(nullif(p_invoice ->> 'vat_status', ''), 'NOT_EVALUATED'),
      coalesce(nullif(p_invoice ->> 'inventory_status', ''), 'NOT_APPLICABLE'),
      coalesce(nullif(p_invoice ->> 'payment_status', ''), 'UNPAID'),
      coalesce(nullif(p_invoice ->> 'fiscalization_status', ''), 'NOT_REQUIRED'),
      nullif(p_invoice ->> 'supply_date', '')::date, nullif(p_invoice ->> 'order_date', '')::date,
      nullif(p_invoice ->> 'delivery_date', '')::date, nullif(p_invoice ->> 'source_document_type', ''),
      nullif(p_invoice ->> 'source_document_id', '')::uuid, nullif(p_invoice ->> 'original_invoice_id', '')::uuid,
      nullif(p_invoice ->> 'tax_reporting_category', ''), upper(coalesce(nullif(p_invoice ->> 'currency', ''), 'EUR')),
      coalesce(nullif(p_invoice ->> 'exchange_rate', '')::numeric, 1),
      coalesce(nullif(p_invoice ->> 'amount_received', '')::numeric, 0), coalesce(nullif(p_invoice ->> 'payment_method', ''), 'bank'),
      coalesce(nullif(p_invoice ->> 'change_amount', '')::numeric, 0), coalesce(nullif(p_invoice ->> 'paper_size', ''), 'A4'),
      nullif(p_invoice ->> 'buyer_signature_url', ''), coalesce((p_invoice ->> 'customer_signature_requested')::boolean, false),
      coalesce(nullif(p_invoice ->> 'customer_signature_status', ''), 'not_requested'), nullif(p_invoice ->> 'customer_signature_name', ''),
      nullif(p_invoice ->> 'customer_signed_at', '')::timestamptz,
      coalesce(nullif(p_invoice ->> 'shipping_amount', '')::numeric, 0),
      coalesce(nullif(p_invoice ->> 'transport_amount', '')::numeric, 0),
      coalesce(nullif(p_invoice ->> 'additional_fee_amount', '')::numeric, 0),
      p_idempotency_key,
      coalesce(nullif(p_invoice ->> 'shipping_tax_amount', '')::numeric, 0),
      coalesce(nullif(p_invoice ->> 'transport_tax_amount', '')::numeric, 0),
      coalesce(nullif(p_invoice ->> 'additional_fee_tax_amount', '')::numeric, 0)
    ) returning * into invoice_row;
  else
    update public.invoices
    set client_id = invoice_client_id,
        invoice_number = trim(p_invoice ->> 'invoice_number'),
        issue_date = coalesce(nullif(p_invoice ->> 'issue_date', '')::date, issue_date),
        due_date = nullif(p_invoice ->> 'due_date', '')::date,
        status = invoice_status::public.invoice_status,
        discount_amount = coalesce(nullif(p_invoice ->> 'discount_amount', '')::numeric, 0),
        discount_percent = coalesce(nullif(p_invoice ->> 'discount_percent', '')::numeric, 0),
        notes = nullif(p_invoice ->> 'notes', ''),
        type = coalesce(nullif(p_invoice ->> 'type', ''), type),
        subtype = coalesce(nullif(p_invoice ->> 'subtype', ''), subtype),
        commercial_document_type = invoice_document_type,
        commercial_status = upper(coalesce(nullif(p_invoice ->> 'commercial_status', ''), commercial_status)),
        accounting_status = coalesce(nullif(p_invoice ->> 'accounting_status', ''), accounting_status),
        vat_status = coalesce(nullif(p_invoice ->> 'vat_status', ''), vat_status),
        inventory_status = coalesce(nullif(p_invoice ->> 'inventory_status', ''), inventory_status),
        payment_status = coalesce(nullif(p_invoice ->> 'payment_status', ''), payment_status),
        fiscalization_status = coalesce(nullif(p_invoice ->> 'fiscalization_status', ''), fiscalization_status),
        source_document_type = nullif(p_invoice ->> 'source_document_type', ''),
        source_document_id = nullif(p_invoice ->> 'source_document_id', '')::uuid,
        tax_reporting_category = nullif(p_invoice ->> 'tax_reporting_category', ''),
        currency = upper(coalesce(nullif(p_invoice ->> 'currency', ''), currency)),
        exchange_rate = coalesce(nullif(p_invoice ->> 'exchange_rate', '')::numeric, exchange_rate),
        amount_received = coalesce(nullif(p_invoice ->> 'amount_received', '')::numeric, 0),
        payment_method = coalesce(nullif(p_invoice ->> 'payment_method', ''), payment_method),
        change_amount = coalesce(nullif(p_invoice ->> 'change_amount', '')::numeric, 0),
        paper_size = coalesce(nullif(p_invoice ->> 'paper_size', ''), paper_size),
        buyer_signature_url = nullif(p_invoice ->> 'buyer_signature_url', ''),
        customer_signature_requested = coalesce((p_invoice ->> 'customer_signature_requested')::boolean, false),
        customer_signature_status = coalesce(nullif(p_invoice ->> 'customer_signature_status', ''), 'not_requested'),
        customer_signature_name = nullif(p_invoice ->> 'customer_signature_name', ''),
        customer_signed_at = nullif(p_invoice ->> 'customer_signed_at', '')::timestamptz,
        shipping_amount = coalesce(nullif(p_invoice ->> 'shipping_amount', '')::numeric, 0),
        shipping_tax_amount = coalesce(nullif(p_invoice ->> 'shipping_tax_amount', '')::numeric, 0),
        transport_amount = coalesce(nullif(p_invoice ->> 'transport_amount', '')::numeric, 0),
        transport_tax_amount = coalesce(nullif(p_invoice ->> 'transport_tax_amount', '')::numeric, 0),
        additional_fee_amount = coalesce(nullif(p_invoice ->> 'additional_fee_amount', '')::numeric, 0),
        additional_fee_tax_amount = coalesce(nullif(p_invoice ->> 'additional_fee_tax_amount', '')::numeric, 0)
    where id = p_invoice_id
    returning * into invoice_row;
  end if;

  delete from public.invoice_items where invoice_id = invoice_row.id;
  for item_record in
    select * from jsonb_to_recordset(p_items) as item(
      product_id uuid, description text, quantity numeric, unit text,
      unit_price numeric, tax_rate numeric, discount numeric,
      tax_included boolean, sku text, amount numeric
    )
  loop
    product_row := null;
    if item_record.product_id is not null then
      select * into product_row from public.products where id = item_record.product_id;
    end if;
    insert into public.invoice_items (
      invoice_id, product_id, description, quantity, unit, unit_price,
      tax_rate, discount, tax_included, sku, amount
    ) values (
      invoice_row.id, item_record.product_id,
      coalesce(nullif(trim(item_record.description), ''), product_row.name),
      item_record.quantity, coalesce(nullif(trim(item_record.unit), ''), product_row.unit, 'pcs'),
      coalesce(item_record.unit_price, product_row.unit_price, 0),
      coalesce(item_record.tax_rate, product_row.tax_rate, 0), coalesce(item_record.discount, 0),
      coalesce(item_record.tax_included, product_row.tax_included, false), coalesce(nullif(trim(item_record.sku), ''), product_row.sku, product_row.barcode, ''),
      -- Recalculate the persisted amount from the submitted primitives. The
      -- client-provided amount is only a preview and must never be trusted for
      -- an accounting record.
      round(
        case when coalesce(item_record.tax_included, product_row.tax_included, false)
          then (
            item_record.quantity * coalesce(item_record.unit_price, product_row.unit_price, 0)
              * (1 - coalesce(item_record.discount, 0) / 100)
          ) / (1 + coalesce(item_record.tax_rate, product_row.tax_rate, 0) / 100)
          else item_record.quantity * coalesce(item_record.unit_price, product_row.unit_price, 0)
            * (1 - coalesce(item_record.discount, 0) / 100)
        end,
        2
      )
    );
  end loop;

  select * into calculated from private.sales_invoice_amounts(invoice_row.id);
  update public.invoices
  set tax_amount = calculated.tax_amount,
      total_amount = calculated.gross_amount,
      discount_amount = coalesce(nullif(p_invoice ->> 'discount_amount', '')::numeric, discount_amount),
      discount_percent = coalesce(nullif(p_invoice ->> 'discount_percent', '')::numeric, discount_percent)
  where id = invoice_row.id
  returning * into invoice_row;

  if p_post_invoice then
    invoice_row := public.post_pos_invoice(invoice_row.id, p_idempotency_key, 'Shared invoice save');
  end if;
  return invoice_row;
end
$$;

revoke all on function public.save_invoice_document(jsonb, jsonb, uuid, boolean, uuid) from public, anon;
grant execute on function public.save_invoice_document(jsonb, jsonb, uuid, boolean, uuid) to authenticated;
revoke all on function private.sales_invoice_amounts(uuid) from public;

comment on function public.save_invoice_document(jsonb, jsonb, uuid, boolean, uuid) is
  'Canonical tenant-safe invoice save used by OperiX Invoice Web and Mobile; persists invoice and lines atomically and optionally posts the invoice.';

-- Stock-tracked POS checkout uses the same canonical invoice writer. The
-- previous stock command persisted a reduced legacy invoice shape and trusted
-- client-supplied line totals, which could make inventory invoices differ from
-- ordinary invoices. This wrapper saves the canonical invoice first, then
-- locks and decrements only tracked products before posting, all in one
-- transaction.
create or replace function public.save_invoice_document_with_stock(
  p_invoice jsonb,
  p_items jsonb,
  p_idempotency_key uuid default null,
  p_post_invoice boolean default true
)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  invoice_row public.invoices;
  product_row public.products;
  item_record record;
  stock_before numeric;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not coalesce(p_post_invoice, true) then
    raise exception 'Stock checkout must post the invoice' using errcode = '22023';
  end if;

  invoice_row := public.save_invoice_document(
    p_invoice,
    p_items,
    null,
    false,
    p_idempotency_key
  );

  -- Idempotent retries return the already-posted invoice and must not issue
  -- stock a second time.
  if lower(coalesce(invoice_row.accounting_state, '')) = 'posted'
     or exists (
       select 1 from public.inventory_stock_movements movement
       where movement.invoice_id = invoice_row.id
         and movement.movement_type = 'invoice_issue'
     ) then
    return invoice_row;
  end if;

  for item_record in
    select item.product_id, sum(item.quantity) as quantity
    from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as item(product_id uuid, quantity numeric)
    where item.product_id is not null
    group by item.product_id
  loop
    select * into product_row
    from public.products
    where id = item_record.product_id
    for update;

    if not found then
      raise exception 'One of the selected products no longer exists' using errcode = '22023';
    end if;
    if product_row.user_id is distinct from actor_id
       and not public.can_access_company(product_row.company_id) then
      raise exception 'You do not have access to one of the selected products' using errcode = '42501';
    end if;
    if product_row.company_id is not null
       and not private.company_is_in_scope(invoice_row.company_id, product_row.company_id) then
      raise exception 'A product belongs to another company subdivision' using errcode = '22023';
    end if;

    if coalesce(product_row.track_stock, false) then
      if coalesce(product_row.stock_quantity, 0) < item_record.quantity then
        raise exception 'Not enough stock for "%". Available: %, requested: %',
          product_row.name, coalesce(product_row.stock_quantity, 0), item_record.quantity
          using errcode = '22003';
      end if;
      stock_before := coalesce(product_row.stock_quantity, 0);
      update public.products
      set stock_quantity = stock_before - item_record.quantity
      where id = product_row.id;

      insert into public.inventory_stock_movements (
        company_id, product_id, invoice_id, movement_type, quantity_delta,
        stock_before, stock_after, created_by
      ) values (
        invoice_row.company_id, product_row.id, invoice_row.id, 'invoice_issue',
        -item_record.quantity, stock_before, stock_before - item_record.quantity, actor_id
      );
    end if;
  end loop;

  invoice_row := public.post_pos_invoice(
    invoice_row.id,
    p_idempotency_key,
    'Shared stock invoice checkout'
  );
  return invoice_row;
end
$$;

revoke all on function public.save_invoice_document_with_stock(jsonb, jsonb, uuid, boolean) from public, anon;
grant execute on function public.save_invoice_document_with_stock(jsonb, jsonb, uuid, boolean) to authenticated;

comment on function public.save_invoice_document_with_stock(jsonb, jsonb, uuid, boolean) is
  'Canonical tenant-safe stock checkout used by OperiX Invoice Web and Mobile; writes one invoice, issues tracked stock once, and posts atomically.';

create or replace function private.complete_pos_sale_core(
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
  terminal_row public.pos_terminals;
  invoice_row public.invoices;
  pos_order_row public.pos_orders;
  payment_row public.payments;
  item_record record;
  payment_record record;
  product_row public.products;
  resolved_customer_id uuid;
  settlement_account_id uuid;
  item_net numeric(20,4);
  item_tax numeric(20,4);
  item_gross numeric(20,4);
  subtotal_value numeric(20,4) := 0;
  tax_value numeric(20,4) := 0;
  total_value numeric(20,4) := 0;
  allocation_total numeric(20,4) := 0;
  received_total numeric(20,4) := 0;
  cash_tendered numeric(20,4) := 0;
  cash_change numeric(20,4) := 0;
  customer_outstanding numeric(20,4) := 0;
  line_number integer := 0;
  payment_index integer := 0;
  credit_payment_count integer := 0;
  price_override boolean;
  document_number text;
  payment_method_value text;
begin
  if p_company_id is null or p_idempotency_key is null then
    raise exception 'Company and idempotency key are required for POS completion' using errcode = '23514';
  end if;
  if not (select private.is_company_member(p_company_id))
    or not (select private.has_company_permission(p_company_id, 'pos.complete')) then
    raise exception 'Insufficient permission to complete POS sales' using errcode = '42501';
  end if;
  if p_invoice_type <> 'invoice' then
    raise exception 'Only an Invoice can be completed in POS; quotations, pro forma documents, and orders remain drafts' using errcode = '23514';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one POS item is required' using errcode = '23514';
  end if;
  if jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) = 0 then
    raise exception 'At least one POS payment is required' using errcode = '23514';
  end if;

  -- Idempotency is locked at aggregate level, so browser retries return the
  -- original canonical result without creating new invoices or payments.
  select * into pos_order_row
  from public.pos_orders
  where company_id = p_company_id and idempotency_key = p_idempotency_key
  for update;
  if found then
    if pos_order_row.status = 'completed' then
      return jsonb_build_object('order_id', pos_order_row.id, 'invoice_id', pos_order_row.invoice_id, 'order_number', pos_order_row.order_number, 'idempotent', true);
    end if;
    raise exception 'This POS completion key is already in progress' using errcode = '55P03';
  end if;

  terminal_row := private.resolve_pos_terminal(p_company_id, p_terminal_id);
  if terminal_row.branch_id is null then
    raise exception 'POS terminal must belong to a branch' using errcode = '23514';
  end if;
  resolved_customer_id := coalesce(p_customer_id, private.ensure_pos_walk_in_customer(p_company_id));
  if not exists (select 1 from public.clients where id = resolved_customer_id and company_id = p_company_id and account_status = 'active' and not sales_blocked) then
    raise exception 'The selected POS customer is not eligible for sales' using errcode = '23514';
  end if;

  for item_record in select * from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric, unit_price numeric, discount_percent numeric)
  loop
    if item_record.product_id is null or coalesce(item_record.quantity, 0) <= 0 or coalesce(item_record.unit_price, -1) < 0 then
      raise exception 'POS items require product, positive quantity, and a non-negative unit price' using errcode = '23514';
    end if;
    select * into product_row from public.products where id = item_record.product_id and company_id = p_company_id for share;
    if not found then
      raise exception 'POS product is invalid for this company' using errcode = '23514';
    end if;
    if product_row.track_stock then
      raise exception 'Stock-tracked POS sales require the Phase D inventory posting service; this sale was blocked to protect stock and COGS integrity' using errcode = '55000';
    end if;
    price_override := round(coalesce(item_record.unit_price, 0), 4) <> round(coalesce(product_row.unit_price, 0), 4);
    if price_override and not (select private.has_company_permission(p_company_id, 'prices.override')) then
      raise exception 'Changing a POS product price requires price-override permission' using errcode = '42501';
    end if;
    if coalesce(item_record.discount_percent, 0) > 0 and not (select private.has_company_permission(p_company_id, 'discounts.override')) then
      raise exception 'Applying a POS discount requires discount permission' using errcode = '42501';
    end if;
    item_gross := round(item_record.quantity * item_record.unit_price * (1 - least(100, greatest(0, coalesce(item_record.discount_percent, 0))) / 100), 2);
    if coalesce(product_row.tax_included, false) then
      item_net := round(item_gross / (1 + coalesce(product_row.tax_rate, 0) / 100), 2);
      item_tax := round(item_net * coalesce(product_row.tax_rate, 0) / 100, 2);
      item_gross := round(item_net + item_tax, 2);
    else
      item_net := item_gross;
      item_tax := round(item_net * coalesce(product_row.tax_rate, 0) / 100, 2);
      item_gross := round(item_net + item_tax, 2);
    end if;
    subtotal_value := round(subtotal_value + item_net, 2);
    tax_value := round(tax_value + item_tax, 2);
    total_value := round(total_value + item_gross, 2);
  end loop;
  total_value := round(total_value, 2);
  if total_value <= 0 then
    raise exception 'POS total must be greater than zero' using errcode = '23514';
  end if;

  for payment_record in select * from jsonb_to_recordset(p_payments) as payment(method text, amount numeric, tendered_amount numeric, reference text, settlement_account_id uuid)
  loop
    payment_method_value := lower(coalesce(payment_record.method, ''));
    if payment_method_value not in ('cash','card','bank','other','customer_credit') then
      raise exception 'Unsupported POS payment method: %', payment_method_value using errcode = '23514';
    end if;
    if not (terminal_row.payment_methods ? payment_method_value) then
      raise exception 'The selected payment method is disabled for this terminal' using errcode = '23514';
    end if;
    if coalesce(payment_record.amount, 0) <= 0 then
      raise exception 'Each POS payment amount must be greater than zero' using errcode = '23514';
    end if;
    if payment_method_value = 'customer_credit' then
      credit_payment_count := credit_payment_count + 1;
      if p_customer_id is null then
        raise exception 'A named customer is required for a debt sale' using errcode = '23514';
      end if;
      if jsonb_array_length(p_payments) <> 1 then
        raise exception 'Debt sales cannot be combined with other payment methods' using errcode = '23514';
      end if;
      if coalesce(payment_record.tendered_amount, payment_record.amount) <> payment_record.amount then
        raise exception 'Debt sales cannot include cash change' using errcode = '23514';
      end if;
    elsif payment_method_value <> 'cash' and coalesce(payment_record.tendered_amount, payment_record.amount) <> payment_record.amount then
      raise exception 'Only cash payments may include change' using errcode = '23514';
    end if;
    if payment_method_value = 'cash' then
      if coalesce(payment_record.tendered_amount, payment_record.amount) < payment_record.amount then
        raise exception 'Cash tendered amount cannot be less than the allocated payment' using errcode = '23514';
      end if;
      cash_tendered := cash_tendered + coalesce(payment_record.tendered_amount, payment_record.amount);
    end if;
    allocation_total := round(allocation_total + round(payment_record.amount, 2), 2);
  end loop;
  if round(allocation_total, 2) <> total_value then
    raise exception 'POS payment allocations must equal the amount due' using errcode = '23514';
  end if;
  if credit_payment_count > 0 then
    select coalesce(sum(open_item.outstanding_amount), 0)
    into customer_outstanding
    from public.customer_receivable_open_items open_item
    where open_item.company_id = p_company_id
      and open_item.client_id = resolved_customer_id;
    if exists (
      select 1
      from public.clients customer
      where customer.id = resolved_customer_id
        and customer.company_id = p_company_id
        and customer.credit_limit > 0
        and customer_outstanding + total_value > customer.credit_limit
    ) then
      raise exception 'Debt sale exceeds the customer credit limit' using errcode = '23514';
    end if;
  end if;
  cash_change := round(greatest(0, cash_tendered - coalesce((select sum((payment ->> 'amount')::numeric) from jsonb_array_elements(p_payments) payment where lower(payment ->> 'method') = 'cash'), 0)), 2);
  received_total := round(allocation_total - case when credit_payment_count > 0 then total_value else 0 end, 2);

  document_number := private.next_financial_document_number(p_company_id, terminal_row.branch_id, 'pos_invoice', 'POS-', p_occurred_at::date);
  insert into public.invoices (
    user_id, company_id, branch_id, client_id, invoice_number, issue_date, due_date,
    status, approval_status, accounting_state, posting_date, currency, exchange_rate,
    discount_amount, discount_percent, tax_amount, total_amount, notes, template_id,
    type, subtype, payment_method, amount_received, change_amount, paper_size
  ) values (
    (select auth.uid()), p_company_id, terminal_row.branch_id, resolved_customer_id,
    document_number, p_occurred_at::date, p_occurred_at::date,
    'draft', 'not_required', 'legacy', p_occurred_at::date, 'EUR', 1,
    0, 0, tax_value, total_value, nullif(trim(p_notes), ''), 'corporate',
    'invoice', 'regular', 'pos', received_total, cash_change, 'A4'
  ) returning * into invoice_row;

  insert into public.pos_orders (
    company_id, branch_id, terminal_id, fiscal_location_id, warehouse_id, customer_id,
    invoice_id, order_number, status, currency, subtotal, discount_amount, tax_amount,
    total_amount, cash_received, change_amount, notes, idempotency_key, source, occurred_at,
    created_by, updated_by
  ) values (
    p_company_id, terminal_row.branch_id, terminal_row.id, terminal_row.fiscal_location_id,
    terminal_row.warehouse_id, resolved_customer_id, invoice_row.id, document_number,
    'pending_payment', 'EUR', subtotal_value, 0, tax_value, total_value, cash_tendered,
    cash_change, nullif(trim(p_notes), ''), p_idempotency_key, 'web', p_occurred_at,
    (select auth.uid()), (select auth.uid())
  ) returning * into pos_order_row;

  for item_record in select * from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric, unit_price numeric, discount_percent numeric)
  loop
    select * into product_row from public.products where id = item_record.product_id and company_id = p_company_id;
    item_gross := round(item_record.quantity * item_record.unit_price * (1 - least(100, greatest(0, coalesce(item_record.discount_percent, 0))) / 100), 2);
    if coalesce(product_row.tax_included, false) then
      item_net := round(item_gross / (1 + coalesce(product_row.tax_rate, 0) / 100), 2);
      item_tax := round(item_net * coalesce(product_row.tax_rate, 0) / 100, 2);
      item_gross := round(item_net + item_tax, 2);
    else
      item_net := item_gross;
      item_tax := round(item_net * coalesce(product_row.tax_rate, 0) / 100, 2);
      item_gross := round(item_net + item_tax, 2);
    end if;
    line_number := line_number + 1;
    insert into public.invoice_items (invoice_id, product_id, description, quantity, unit_price, tax_rate, discount, amount, unit, sku)
    values (invoice_row.id, product_row.id, product_row.name, item_record.quantity,
      round(item_net / item_record.quantity, 4), product_row.tax_rate,
      least(100, greatest(0, coalesce(item_record.discount_percent, 0))), item_net, product_row.unit, coalesce(product_row.sku, product_row.barcode));
    insert into public.pos_order_lines (pos_order_id, company_id, product_id, line_number, description, sku, unit, quantity, unit_price, discount_percent, net_amount, tax_rate, tax_amount, gross_amount, original_unit_price, override_reason, created_by)
    values (pos_order_row.id, p_company_id, product_row.id, line_number, product_row.name,
      coalesce(product_row.sku, product_row.barcode), product_row.unit, item_record.quantity,
      item_record.unit_price, least(100, greatest(0, coalesce(item_record.discount_percent, 0))),
      item_net, product_row.tax_rate, item_tax, item_gross, product_row.unit_price,
      case when round(item_record.unit_price,4) <> round(product_row.unit_price,4) then 'POS price override' end,
      (select auth.uid()));
  end loop;

  invoice_row := public.prepare_sales_invoice_for_posting(invoice_row.id, 'POS sale completion');
  invoice_row := public.post_sales_invoice(invoice_row.id, p_idempotency_key, 'POS sale completion');

  for payment_record in select * from jsonb_to_recordset(p_payments) as payment(method text, amount numeric, tendered_amount numeric, reference text, settlement_account_id uuid)
  loop
    payment_index := payment_index + 1;
    if lower(payment_record.method) = 'customer_credit' then
      insert into public.pos_payments (pos_order_id, company_id, payment_method, allocated_amount, tendered_amount, change_amount, reference, created_by)
      values (pos_order_row.id, p_company_id, 'customer_credit', round(payment_record.amount,2),
        round(coalesce(payment_record.tendered_amount, payment_record.amount),2), 0,
        payment_record.reference, (select auth.uid()));
    else
      settlement_account_id := private.pos_default_settlement_account(p_company_id, p_occurred_at::date, payment_record.settlement_account_id);
      payment_row := public.record_customer_payment(
        p_company_id, resolved_customer_id, p_occurred_at::date, round(payment_record.amount,4),
        lower(payment_record.method), settlement_account_id, coalesce(payment_record.reference, document_number),
        'POS payment for ' || document_number, terminal_row.branch_id, 'EUR', null
      );
      perform public.allocate_customer_payment(payment_row.id, invoice_row.id, round(payment_record.amount,2), p_occurred_at::date);
      insert into public.pos_payments (pos_order_id, company_id, payment_id, payment_method, allocated_amount, tendered_amount, change_amount, settlement_account_id, reference, created_by)
      values (pos_order_row.id, p_company_id, payment_row.id, lower(payment_record.method), round(payment_record.amount,2),
        round(coalesce(payment_record.tendered_amount, payment_record.amount),2),
        case when lower(payment_record.method) = 'cash' then round(coalesce(payment_record.tendered_amount, payment_record.amount) - payment_record.amount,2) else 0 end,
        settlement_account_id, payment_record.reference, (select auth.uid()));
    end if;
  end loop;

  perform set_config('app.pos_workflow', 'authorized', true);
  update public.pos_orders
  set status = 'completed', completed_at = clock_timestamp(), completed_by = (select auth.uid()), updated_by = (select auth.uid())
  where id = pos_order_row.id
  returning * into pos_order_row;
  perform set_config('app.pos_workflow', '', true);
  insert into public.pos_order_events (pos_order_id, company_id, event_type, payload, actor_id)
  values (pos_order_row.id, p_company_id, 'completed', jsonb_build_object('invoice_id', invoice_row.id, 'invoice_number', invoice_row.invoice_number, 'total', total_value), (select auth.uid()));
  insert into public.receipt_render_snapshots (company_id, pos_order_id, invoice_id, receipt_data, template_code, created_by)
  values (p_company_id, pos_order_row.id, invoice_row.id,
    jsonb_build_object('version', 1, 'order_id', pos_order_row.id, 'order_number', document_number,
      'invoice_id', invoice_row.id, 'terminal_id', terminal_row.id, 'branch_id', terminal_row.branch_id,
      'customer_id', resolved_customer_id, 'currency', 'EUR', 'subtotal', subtotal_value,
      'tax_amount', tax_value, 'total_amount', total_value, 'cash_received', cash_tendered,
      'change_amount', cash_change, 'fiscal_status', 'not_configured', 'occurred_at', p_occurred_at),
    terminal_row.receipt_template, (select auth.uid()));
  perform private.emit_domain_outbox_event(p_company_id, terminal_row.branch_id, 'pos_order', pos_order_row.id,
    'pos_order.completed', jsonb_build_object('invoice_id', invoice_row.id, 'total_amount', total_value, 'terminal_id', terminal_row.id),
    'pos_order.completed:' || pos_order_row.id::text);
  return jsonb_build_object('order_id', pos_order_row.id, 'invoice_id', invoice_row.id, 'invoice_number', invoice_row.invoice_number, 'order_number', pos_order_row.order_number, 'total_amount', total_value, 'change_amount', cash_change, 'idempotent', false);
end
$$;

-- Posted customer payments are journal-backed records. Editing one in place
-- would make the journal disagree with the payment row, so the shared update
-- command either edits an unposted legacy row or reverses and recreates a
-- posted payment with a new audit trail and optional reallocation.
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
  allocation_row public.payment_allocations;
  reversal_row public.journal_entries;
  actor_id uuid := (select auth.uid());
begin
  select * into payment_row
  from public.payments
  where id = p_payment_id
  for update;
  if not found then
    raise exception 'Customer payment not found' using errcode = 'P0002';
  end if;
  if not coalesce(private.has_company_permission(payment_row.company_id, 'journal.reverse'), false) then
    raise exception 'Insufficient permission to reverse customer payments' using errcode = '42501';
  end if;
  if payment_row.accounting_state <> 'posted' or payment_row.posting_journal_entry_id is null then
    raise exception 'Only posted customer payments can be reversed' using errcode = '55000';
  end if;
  if payment_row.reversal_journal_entry_id is not null or payment_row.accounting_state = 'reversed' then
    raise exception 'Customer payment has already been reversed' using errcode = '55000';
  end if;
  if actor_id is null or nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'A signed-in actor and reversal reason are required' using errcode = '23514';
  end if;

  reversal_row := public.reverse_journal_entry(
    payment_row.posting_journal_entry_id,
    coalesce(p_reversal_date, current_date),
    trim(p_reason)
  );

  -- Allocations are append-only. Reverse them as part of the same payment
  -- reversal so invoice status and customer balances cannot remain paid by a
  -- payment that no longer exists economically.
  for allocation_row in
    select *
    from public.payment_allocations
    where payment_id = payment_row.id
      and status = 'active'
    for update
  loop
    update public.payment_allocations
    set status = 'reversed',
        reversed_at = clock_timestamp(),
        reversed_by = actor_id,
        reversal_reason = trim(p_reason)
    where id = allocation_row.id;
    perform private.refresh_customer_payment_state(allocation_row.invoice_id);
  end loop;

  perform set_config('app.financial_workflow', 'authorized', true);
  update public.payments
  set accounting_state = 'reversed',
      allocation_status = 'reversed',
      reversed_at = clock_timestamp(),
      reversal_journal_entry_id = reversal_row.id,
      reversal_reason = trim(p_reason)
  where id = payment_row.id
  returning * into payment_row;
  perform set_config('app.financial_workflow', '', true);
  return payment_row;
end
$$;

create or replace function public.update_customer_payment(
  p_payment_id uuid,
  p_company_id uuid,
  p_customer_id uuid,
  p_invoice_id uuid default null,
  p_payment_date date default current_date,
  p_amount numeric default 0,
  p_payment_method text default 'bank',
  p_settlement_account_id uuid default null,
  p_reference text default null,
  p_notes text default null,
  p_currency text default 'EUR',
  p_idempotency_key uuid default null,
  p_reason text default 'Customer payment edited'
)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_payment public.payments;
  new_payment public.payments;
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_company_id is null or p_amount is null or round(p_amount, 4) <= 0 then
    raise exception 'A company and positive payment amount are required' using errcode = '23514';
  end if;
  if p_idempotency_key is not null then
    select * into new_payment
    from public.payments
    where company_id = p_company_id
      and idempotency_key = p_idempotency_key
    for update;
    if found then return new_payment; end if;
  end if;

  select * into old_payment
  from public.payments
  where id = p_payment_id
  for update;
  if not found or old_payment.company_id is distinct from p_company_id then
    raise exception 'Customer payment is not available in this company' using errcode = '42501';
  end if;
  if not coalesce(private.has_company_permission(p_company_id, 'customer_payment.record'), false) then
    raise exception 'Insufficient permission to edit customer payments' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.clients customer
    where customer.id = p_customer_id
      and customer.company_id = p_company_id
  ) then
    raise exception 'Customer is invalid for this company' using errcode = '23514';
  end if;

  if old_payment.accounting_state = 'posted' then
    perform public.reverse_customer_payment(
      old_payment.id,
      coalesce(p_payment_date, current_date),
      coalesce(nullif(trim(p_reason), ''), 'Customer payment edited')
    );
    new_payment := public.record_customer_payment(
      p_company_id,
      p_customer_id,
      coalesce(p_payment_date, current_date),
      round(p_amount, 4),
      p_payment_method,
      p_settlement_account_id,
      p_reference,
      p_notes,
      old_payment.branch_id,
      upper(coalesce(p_currency, old_payment.currency, 'EUR')),
      p_idempotency_key
    );
    if p_invoice_id is not null then
      perform public.allocate_customer_payment(
        new_payment.id,
        p_invoice_id,
        round(p_amount, 4),
        coalesce(p_payment_date, current_date)
      );
      update public.payments
      set invoice_id = p_invoice_id
      where id = new_payment.id
      returning * into new_payment;
    end if;
    return new_payment;
  end if;

  if old_payment.accounting_state in ('reversed', 'opening_balance', 'excluded') then
    raise exception 'This customer payment cannot be edited' using errcode = '55000';
  end if;
  update public.payments
  set client_id = p_customer_id,
      invoice_id = p_invoice_id,
      payment_date = coalesce(p_payment_date, payment_date),
      amount = round(p_amount, 4),
      payment_method = nullif(trim(p_payment_method), ''),
      bank_reference = nullif(trim(p_reference), ''),
      notes = p_notes,
      currency = upper(coalesce(p_currency, currency, 'EUR')),
      settlement_account_id = coalesce(p_settlement_account_id, settlement_account_id)
  where id = old_payment.id
  returning * into new_payment;
  return new_payment;
end
$$;

revoke all on function public.update_customer_payment(uuid, uuid, uuid, uuid, date, numeric, text, uuid, text, text, text, uuid, text) from public, anon;
grant execute on function public.update_customer_payment(uuid, uuid, uuid, uuid, date, numeric, text, uuid, text, text, text, uuid, text) to authenticated;
revoke all on function public.reverse_customer_payment(uuid, date, text) from public, anon;
grant execute on function public.reverse_customer_payment(uuid, date, text) to authenticated;

-- Older POS/accounting functions wrote a tax-included product's net unit
-- price while the ordinary invoice form writes its gross unit price. Keep
-- the stored line representation canonical for every new insert without
-- rewriting historical records: amount is net-of-VAT and unit_price is the
-- entered/gross price when the product is tax included.
create or replace function private.normalize_invoice_item_tax_representation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  product_row public.products;
  gross_after_discount numeric;
  discount_factor numeric;
begin
  if new.product_id is null or coalesce(new.tax_included, false) then
    return new;
  end if;

  select * into product_row
  from public.products
  where id = new.product_id;
  if not found or not coalesce(product_row.tax_included, false) then
    return new;
  end if;

  discount_factor := 1 - least(100, greatest(0, coalesce(new.discount, 0))) / 100;
  if coalesce(new.quantity, 0) > 0 and discount_factor > 0 then
    gross_after_discount := coalesce(new.amount, 0) *
      (1 + coalesce(new.tax_rate, product_row.tax_rate, 0) / 100);
    new.unit_price := round(gross_after_discount / new.quantity / discount_factor, 4);
  end if;
  new.tax_included := true;
  return new;
end
$$;

drop trigger if exists invoice_items_tax_representation_normalizer on public.invoice_items;
create trigger invoice_items_tax_representation_normalizer
before insert on public.invoice_items
for each row execute function private.normalize_invoice_item_tax_representation();
revoke all on function private.normalize_invoice_item_tax_representation() from public, anon, authenticated;

notify pgrst, 'reload schema';
