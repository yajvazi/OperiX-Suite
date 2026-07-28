-- Phase E1: transactional POS foundation.
--
-- This migration intentionally reuses the Phase A terminal/audit foundation,
-- Phase B journals and Phase C invoice/payment allocation commands. It does
-- not mutate the legacy `products.stock_quantity` column: stock-tracked POS
-- products are blocked until the Phase D stock-ledger command is available.

alter table public.pos_terminals
  add column if not exists warehouse_id uuid references public.warehouses(id) on delete restrict,
  add column if not exists receipt_template text not null default 'corporate',
  add column if not exists payment_methods jsonb not null default '["cash","card","bank","other","customer_credit"]'::jsonb
    check (jsonb_typeof(payment_methods) = 'array'),
  add column if not exists cashier_shift_required boolean not null default false,
  add column if not exists allow_negative_stock boolean not null default false,
  add column if not exists offline_policy jsonb not null default '{}'::jsonb
    check (jsonb_typeof(offline_policy) = 'object'),
  add column if not exists configuration_version integer not null default 1 check (configuration_version > 0);

alter table public.clients
  add column if not exists pos_walk_in_customer boolean not null default false;

create unique index if not exists clients_company_pos_walk_in_customer_unique
  on public.clients (company_id)
  where pos_walk_in_customer;

create table if not exists public.company_feature_flags (
  company_id uuid not null references public.companies(id) on delete cascade,
  flag text not null,
  enabled boolean not null default false,
  configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (company_id, flag)
);

create table if not exists public.pos_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  terminal_id uuid not null references public.pos_terminals(id) on delete restrict,
  fiscal_location_id uuid references public.fiscal_locations(id) on delete restrict,
  warehouse_id uuid references public.warehouses(id) on delete restrict,
  customer_id uuid references public.clients(id) on delete restrict,
  invoice_id uuid unique references public.invoices(id) on delete restrict,
  order_number text not null,
  status text not null default 'draft' check (status in (
    'draft','held','pending_payment','completed','partially_refunded','refunded',
    'cancelled_before_completion','offline_pending','sync_pending','sync_failed',
    'fiscal_pending','fiscal_submitted','fiscalized','fiscal_failed',
    'fiscal_reconciliation_required','reversed'
  )),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  subtotal numeric(20,4) not null default 0 check (subtotal >= 0),
  discount_amount numeric(20,4) not null default 0 check (discount_amount >= 0),
  tax_amount numeric(20,4) not null default 0 check (tax_amount >= 0),
  total_amount numeric(20,4) not null default 0 check (total_amount >= 0),
  cash_received numeric(20,4) not null default 0 check (cash_received >= 0),
  change_amount numeric(20,4) not null default 0 check (change_amount >= 0),
  notes text,
  idempotency_key uuid not null,
  source text not null default 'web' check (source in ('web','mobile','offline_sync')),
  occurred_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (company_id, terminal_id, idempotency_key),
  unique (company_id, order_number)
);

create index if not exists pos_orders_company_status_created_idx
  on public.pos_orders (company_id, status, created_at desc);
create index if not exists pos_orders_terminal_created_idx
  on public.pos_orders (terminal_id, created_at desc);

create table if not exists public.pos_order_lines (
  id uuid primary key default gen_random_uuid(),
  pos_order_id uuid not null references public.pos_orders(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete restrict,
  product_id uuid references public.products(id) on delete restrict,
  line_number integer not null check (line_number > 0),
  description text not null,
  sku text,
  unit text not null default 'pcs',
  quantity numeric(20,4) not null check (quantity > 0),
  unit_price numeric(20,4) not null check (unit_price >= 0),
  discount_percent numeric(9,4) not null default 0 check (discount_percent between 0 and 100),
  net_amount numeric(20,4) not null check (net_amount >= 0),
  tax_rate numeric(9,4) not null default 0 check (tax_rate between 0 and 100),
  tax_amount numeric(20,4) not null default 0 check (tax_amount >= 0),
  gross_amount numeric(20,4) not null check (gross_amount >= 0),
  original_unit_price numeric(20,4) not null check (original_unit_price >= 0),
  override_reason text,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id) on delete set null,
  unique (pos_order_id, line_number)
);

create table if not exists public.pos_payments (
  id uuid primary key default gen_random_uuid(),
  pos_order_id uuid not null references public.pos_orders(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete restrict,
  payment_id uuid references public.payments(id) on delete restrict,
  payment_method text not null,
  allocated_amount numeric(20,4) not null check (allocated_amount > 0),
  tendered_amount numeric(20,4) not null check (tendered_amount > 0),
  change_amount numeric(20,4) not null default 0 check (change_amount >= 0),
  settlement_account_id uuid references public.chart_of_accounts(id) on delete restrict,
  reference text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id) on delete set null,
  unique (pos_order_id, payment_id)
);

create table if not exists public.pos_order_events (
  id uuid primary key default gen_random_uuid(),
  pos_order_id uuid not null references public.pos_orders(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete restrict,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default clock_timestamp(),
  actor_id uuid references auth.users(id) on delete set null
);

create table if not exists public.receipt_render_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  pos_order_id uuid not null unique references public.pos_orders(id) on delete restrict,
  invoice_id uuid references public.invoices(id) on delete restrict,
  receipt_data jsonb not null check (jsonb_typeof(receipt_data) = 'object'),
  template_code text not null default 'corporate',
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id) on delete set null
);

-- Completed orders, their lines and payment snapshots are immutable. The
-- transaction command temporarily sets a local flag for the final state flip.
create or replace function private.prevent_completed_pos_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  linked_status text;
begin
  if tg_table_name = 'pos_orders' then
    if old.status in ('completed','partially_refunded','refunded','fiscalized','reversed')
      and current_setting('app.pos_workflow', true) is distinct from 'authorized' then
      raise exception 'Completed POS orders are immutable; use a return, refund, or correction workflow'
        using errcode = '55000';
    end if;
  else
    select status into linked_status from public.pos_orders where id = coalesce(old.pos_order_id, new.pos_order_id);
    if linked_status in ('completed','partially_refunded','refunded','fiscalized','reversed')
      and current_setting('app.pos_workflow', true) is distinct from 'authorized' then
      raise exception 'Completed POS order details are immutable' using errcode = '55000';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

drop trigger if exists pos_orders_immutable on public.pos_orders;
create trigger pos_orders_immutable before update or delete on public.pos_orders
for each row execute function private.prevent_completed_pos_mutation();
drop trigger if exists pos_order_lines_immutable on public.pos_order_lines;
create trigger pos_order_lines_immutable before update or delete on public.pos_order_lines
for each row execute function private.prevent_completed_pos_mutation();
drop trigger if exists pos_payments_immutable on public.pos_payments;
create trigger pos_payments_immutable before update or delete on public.pos_payments
for each row execute function private.prevent_completed_pos_mutation();

-- Resolve the settlement account from the effective customer-payment posting
-- rule. The command never embeds account IDs in source code.
create or replace function private.pos_default_settlement_account(
  p_company_id uuid,
  p_payment_date date,
  p_requested_account_id uuid default null
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  resolved_account_id uuid;
begin
  if p_requested_account_id is not null then
    select account.id into resolved_account_id
    from public.chart_of_accounts account
    where account.id = p_requested_account_id
      and account.company_id = p_company_id
      and account.active and account.posting_allowed;
  else
    select line.account_id into resolved_account_id
    from public.posting_rule_sets rule_set
    join public.posting_rule_lines line on line.rule_set_id = rule_set.id
    join public.chart_of_accounts account on account.id = line.account_id
    where rule_set.company_id = p_company_id
      and rule_set.event_type = 'customer_payment'
      and rule_set.active
      and rule_set.effective_from <= p_payment_date
      and (rule_set.effective_until is null or rule_set.effective_until >= p_payment_date)
      and line.side = 'debit'
      and line.amount_component = 'gross'
      and account.active and account.posting_allowed
    order by rule_set.version desc, rule_set.effective_from desc, line.line_number
    limit 1;
  end if;
  if resolved_account_id is null then
    raise exception 'No active settlement account is mapped for POS customer payments' using errcode = '23514';
  end if;
  return resolved_account_id;
end
$$;

create or replace function private.resolve_pos_terminal(
  p_company_id uuid,
  p_terminal_id uuid default null
)
returns public.pos_terminals
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  terminal_row public.pos_terminals;
begin
  if p_terminal_id is not null then
    select * into terminal_row
    from public.pos_terminals
    where id = p_terminal_id and company_id = p_company_id and status = 'active';
  else
    select * into terminal_row
    from public.pos_terminals
    where company_id = p_company_id and status = 'active'
    order by created_at
    limit 2;
    if found and (select count(*) from public.pos_terminals where company_id = p_company_id and status = 'active') > 1 then
      raise exception 'Select a POS terminal before completing a sale' using errcode = '23514';
    end if;
  end if;
  if not found then
    raise exception 'An active POS terminal is required before completing a sale' using errcode = '23514';
  end if;
  return terminal_row;
end
$$;

create or replace function private.ensure_pos_walk_in_customer(p_company_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer_id uuid;
begin
  select id into customer_id
  from public.clients
  where company_id = p_company_id and pos_walk_in_customer
  limit 1;
  if customer_id is null then
    insert into public.clients (user_id, company_id, name, pos_walk_in_customer, account_status, sales_blocked)
    values ((select auth.uid()), p_company_id, 'POS Walk-in Customer', true, 'active', false)
    returning id into customer_id;
  end if;
  return customer_id;
end
$$;

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
    item_gross := round(item_record.quantity * item_record.unit_price * (1 - least(100, greatest(0, coalesce(item_record.discount_percent, 0))) / 100), 4);
    if coalesce(product_row.tax_included, false) then
      item_net := round(item_gross / (1 + coalesce(product_row.tax_rate, 0) / 100), 4);
      item_tax := round(item_gross - item_net, 4);
    else
      item_net := item_gross;
      item_tax := round(item_net * coalesce(product_row.tax_rate, 0) / 100, 4);
      item_gross := round(item_net + item_tax, 4);
    end if;
    subtotal_value := subtotal_value + item_net;
    tax_value := tax_value + item_tax;
    total_value := total_value + item_gross;
  end loop;
  total_value := round(total_value, 4);
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
    allocation_total := allocation_total + round(payment_record.amount, 4);
  end loop;
  if round(allocation_total, 4) <> total_value then
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
  cash_change := round(greatest(0, cash_tendered - coalesce((select sum((payment ->> 'amount')::numeric) from jsonb_array_elements(p_payments) payment where lower(payment ->> 'method') = 'cash'), 0)), 4);
  received_total := round(allocation_total - case when credit_payment_count > 0 then total_value else 0 end, 4);

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
    item_gross := round(item_record.quantity * item_record.unit_price * (1 - least(100, greatest(0, coalesce(item_record.discount_percent, 0))) / 100), 4);
    if coalesce(product_row.tax_included, false) then
      item_net := round(item_gross / (1 + coalesce(product_row.tax_rate, 0) / 100), 4);
      item_tax := round(item_gross - item_net, 4);
    else
      item_net := item_gross;
      item_tax := round(item_net * coalesce(product_row.tax_rate, 0) / 100, 4);
      item_gross := round(item_net + item_tax, 4);
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
      values (pos_order_row.id, p_company_id, 'customer_credit', round(payment_record.amount,4),
        round(coalesce(payment_record.tendered_amount, payment_record.amount),4), 0,
        payment_record.reference, (select auth.uid()));
    else
      settlement_account_id := private.pos_default_settlement_account(p_company_id, p_occurred_at::date, payment_record.settlement_account_id);
      payment_row := public.record_customer_payment(
        p_company_id, resolved_customer_id, p_occurred_at::date, round(payment_record.amount,4),
        lower(payment_record.method), settlement_account_id, coalesce(payment_record.reference, document_number),
        'POS payment for ' || document_number, terminal_row.branch_id, 'EUR', null
      );
      perform public.allocate_customer_payment(payment_row.id, invoice_row.id, round(payment_record.amount,4), p_occurred_at::date);
      insert into public.pos_payments (pos_order_id, company_id, payment_id, payment_method, allocated_amount, tendered_amount, change_amount, settlement_account_id, reference, created_by)
      values (pos_order_row.id, p_company_id, payment_row.id, lower(payment_record.method), round(payment_record.amount,4),
        round(coalesce(payment_record.tendered_amount, payment_record.amount),4),
        case when lower(payment_record.method) = 'cash' then round(coalesce(payment_record.tendered_amount, payment_record.amount) - payment_record.amount,4) else 0 end,
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

insert into public.app_permissions (code, name, category, description, is_sensitive)
values
  ('pos.complete', 'Complete POS sales', 'pos', 'Complete transactional POS sales.', true),
  ('pos.terminal.use', 'Use assigned POS terminals', 'pos', 'Use an active POS terminal.', false),
  ('pos.receipt.reprint', 'Reprint POS receipts', 'pos', 'Reprint receipt snapshots.', false)
on conflict (code) do update
set name = excluded.name, category = excluded.category, description = excluded.description, is_sensitive = excluded.is_sensitive;

insert into public.app_role_permissions (role_id, permission_code)
select role.id, permission.code
from public.app_roles role
join public.app_permissions permission on permission.code in (
  'pos.complete',
  'pos.terminal.use',
  'pos.receipt.reprint',
  'sales_invoice.create',
  'sales_invoice.post',
  'customer_payment.record',
  'customer_payment.allocate',
  'journal.create',
  'journal.post'
)
where role.company_id is null and role.code in ('owner','super_administrator','company_administrator','accountant','senior_accountant','cashier')
on conflict do nothing;

alter table public.company_feature_flags enable row level security;
alter table public.pos_orders enable row level security;
alter table public.pos_order_lines enable row level security;
alter table public.pos_payments enable row level security;
alter table public.pos_order_events enable row level security;
alter table public.receipt_render_snapshots enable row level security;

do $$
declare target_table text;
begin
  foreach target_table in array array['company_feature_flags','pos_orders','pos_order_lines','pos_payments','pos_order_events','receipt_render_snapshots']
  loop
    execute format('drop policy if exists %I_member_select on public.%I', target_table, target_table);
    execute format('create policy %I_member_select on public.%I for select to authenticated using ((select private.is_company_member(company_id)))', target_table, target_table);
  end loop;
end
$$;

do $$
declare target_table text;
begin
  foreach target_table in array array['pos_orders','pos_order_lines','pos_payments','pos_order_events','receipt_render_snapshots']
  loop
    execute format('drop trigger if exists %I_audit on public.%I', target_table, target_table);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function private.audit_table_change()', target_table, target_table);
  end loop;
end
$$;

revoke all on function public.complete_pos_sale(uuid, uuid, uuid, jsonb, jsonb, text, text, uuid, timestamptz) from public;
grant execute on function public.complete_pos_sale(uuid, uuid, uuid, jsonb, jsonb, text, text, uuid, timestamptz) to authenticated;

comment on function public.complete_pos_sale(uuid, uuid, uuid, jsonb, jsonb, text, text, uuid, timestamptz) is
  'Phase E transactional POS command. Fiscalization and stock ledger posting are intentionally not faked; stock-tracked items block until their domain services are available.';
