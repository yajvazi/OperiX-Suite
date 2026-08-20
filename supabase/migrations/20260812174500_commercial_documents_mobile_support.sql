-- OperiX CommercialDocuments mobile support.
--
-- The preceding domain migration upgrades the existing invoices/invoice_items
-- tables. This migration adds the remaining shared mobile data contracts:
-- customer classification, per-document defaults, operational-document payment
-- links, advance reconciliation, immutable timeline events, and explicit Data
-- API grants. It deliberately does not create a second invoice or accounting
-- engine.

-- ---------------------------------------------------------------------------
-- Customer classification and Kosovo identifiers
-- ---------------------------------------------------------------------------

alter table public.clients
  add column if not exists customer_classification text not null default 'OTHER',
  add column if not exists fiscal_number text,
  add column if not exists vat_number text,
  add column if not exists nui text,
  add column if not exists billing_address text,
  add column if not exists shipping_address text,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clients_customer_classification_check'
      and conrelid = 'public.clients'::regclass
  ) then
    alter table public.clients
      add constraint clients_customer_classification_check
      check (customer_classification in ('B2B', 'B2C', 'OTHER'));
  end if;
end
$$;

create index if not exists clients_company_classification_idx
  on public.clients (company_id, customer_classification, name);
create index if not exists clients_company_fiscal_number_idx
  on public.clients (company_id, fiscal_number)
  where fiscal_number is not null and fiscal_number <> '';
create index if not exists clients_company_vat_number_idx
  on public.clients (company_id, vat_number)
  where vat_number is not null and vat_number <> '';

-- Attachments are shared by all commercial document types. The physical file
-- remains in Supabase Storage; this table only stores tenant-scoped metadata.
alter table public.financial_document_attachments
  drop constraint if exists financial_document_attachments_document_type_check;
alter table public.financial_document_attachments
  add constraint financial_document_attachments_document_type_check
  check (document_type in (
    'sales_invoice', 'commercial_document', 'supplier_bill', 'expense',
    'income', 'customer_payment', 'supplier_payment', 'credit_note'
  ));

-- ---------------------------------------------------------------------------
-- Per-company document settings
-- ---------------------------------------------------------------------------

create table if not exists public.commercial_document_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  document_type text not null check (document_type in (
    'QUOTE', 'PROFORMA', 'SALES_ORDER', 'DELIVERY_NOTE', 'INVOICE',
    'ADVANCE_INVOICE', 'FINAL_INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE',
    'SIMPLIFIED_INVOICE', 'FISCAL_RECEIPT', 'BAD_DEBT_INVOICE'
  )),
  show_prices boolean not null default true,
  default_valid_days integer check (default_valid_days is null or default_valid_days between 0 and 3650),
  default_payment_terms text,
  default_delivery_terms text,
  customer_portal_enabled boolean not null default true,
  signature_required boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (company_id, document_type)
);

create index if not exists commercial_document_settings_company_idx
  on public.commercial_document_settings (company_id, document_type);

alter table public.commercial_document_settings enable row level security;
drop policy if exists commercial_document_settings_select on public.commercial_document_settings;
drop policy if exists commercial_document_settings_insert on public.commercial_document_settings;
drop policy if exists commercial_document_settings_update on public.commercial_document_settings;
drop policy if exists commercial_document_settings_delete on public.commercial_document_settings;

create policy commercial_document_settings_select
on public.commercial_document_settings
for select to authenticated
using (
  (select private.has_company_permission(company_id, 'sales_invoice.view'))
  or (select private.has_company_permission(company_id, 'company.manage'))
);

create policy commercial_document_settings_insert
on public.commercial_document_settings
for insert to authenticated
with check (
  (select private.has_company_permission(company_id, 'sales_invoice.edit'))
  or (select private.has_company_permission(company_id, 'company.manage'))
);

create policy commercial_document_settings_update
on public.commercial_document_settings
for update to authenticated
using (
  (select private.has_company_permission(company_id, 'sales_invoice.edit'))
  or (select private.has_company_permission(company_id, 'company.manage'))
)
with check (
  (select private.has_company_permission(company_id, 'sales_invoice.edit'))
  or (select private.has_company_permission(company_id, 'company.manage'))
);

create policy commercial_document_settings_delete
on public.commercial_document_settings
for delete to authenticated
using ((select private.has_company_permission(company_id, 'company.manage')));

revoke all on table public.commercial_document_settings from anon, authenticated;
grant select, insert, update, delete on table public.commercial_document_settings to authenticated;

insert into public.commercial_document_settings (
  company_id, document_type, show_prices, default_valid_days
)
select company.id, seed.document_type, seed.show_prices, seed.default_valid_days
from public.companies company
cross join (
  values
    ('QUOTE', true, 30),
    ('PROFORMA', true, 30),
    ('SALES_ORDER', true, null::integer),
    ('DELIVERY_NOTE', false, null::integer),
    ('INVOICE', true, null::integer),
    ('ADVANCE_INVOICE', true, null::integer),
    ('FINAL_INVOICE', true, null::integer),
    ('CREDIT_NOTE', true, null::integer),
    ('DEBIT_NOTE', true, null::integer),
    ('SIMPLIFIED_INVOICE', true, null::integer),
    ('FISCAL_RECEIPT', true, null::integer),
    ('BAD_DEBT_INVOICE', true, null::integer)
) as seed(document_type, show_prices, default_valid_days)
on conflict (company_id, document_type) do nothing;

create or replace function private.seed_commercial_document_settings_for_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.commercial_document_settings (
    company_id, document_type, show_prices, default_valid_days, created_by, updated_by
  )
  select new.id, seed.document_type, seed.show_prices, seed.default_valid_days,
    (select auth.uid()), (select auth.uid())
  from (
    values
      ('QUOTE', true, 30),
      ('PROFORMA', true, 30),
      ('SALES_ORDER', true, null::integer),
      ('DELIVERY_NOTE', false, null::integer),
      ('INVOICE', true, null::integer),
      ('ADVANCE_INVOICE', true, null::integer),
      ('FINAL_INVOICE', true, null::integer),
      ('CREDIT_NOTE', true, null::integer),
      ('DEBIT_NOTE', true, null::integer),
      ('SIMPLIFIED_INVOICE', true, null::integer),
      ('FISCAL_RECEIPT', true, null::integer),
      ('BAD_DEBT_INVOICE', true, null::integer)
  ) as seed(document_type, show_prices, default_valid_days)
  on conflict (company_id, document_type) do nothing;
  return new;
end
$$;

drop trigger if exists companies_seed_commercial_document_settings on public.companies;
create trigger companies_seed_commercial_document_settings
after insert on public.companies
for each row execute function private.seed_commercial_document_settings_for_company();

-- ---------------------------------------------------------------------------
-- Payments linked to operational documents
-- ---------------------------------------------------------------------------

create table if not exists public.commercial_document_payment_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  document_id uuid not null references public.invoices(id) on delete restrict,
  payment_id uuid not null references public.payments(id) on delete restrict,
  allocation_type text not null default 'ADVANCE'
    check (allocation_type in ('ADVANCE')),
  amount numeric(20,4) not null check (amount > 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'active' check (status in ('active', 'reversed')),
  accounting_status text not null default 'PENDING_ADVANCE_TREATMENT'
    check (accounting_status in ('PENDING_ADVANCE_TREATMENT', 'POSTED', 'REVERSED')),
  vat_status text not null default 'NOT_EVALUATED'
    check (vat_status in ('NOT_EVALUATED', 'POSTED', 'REVERSED')),
  linked_at timestamptz not null default now(),
  linked_by uuid references auth.users(id) on delete set null,
  reversed_at timestamptz,
  reversed_by uuid references auth.users(id) on delete set null,
  reversal_reason text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  check (
    (status = 'active' and reversed_at is null and reversed_by is null and reversal_reason is null)
    or (status = 'reversed' and reversed_at is not null and reversed_by is not null and nullif(trim(reversal_reason), '') is not null)
  ),
  unique (payment_id, document_id, allocation_type)
);

create index if not exists commercial_document_payment_links_document_idx
  on public.commercial_document_payment_links (company_id, document_id, linked_at desc)
  where status = 'active';
create index if not exists commercial_document_payment_links_payment_idx
  on public.commercial_document_payment_links (company_id, payment_id, linked_at desc)
  where status = 'active';

alter table public.commercial_document_payment_links enable row level security;
drop policy if exists commercial_document_payment_links_select on public.commercial_document_payment_links;
create policy commercial_document_payment_links_select
on public.commercial_document_payment_links
for select to authenticated
using (
  (select private.has_company_permission(company_id, 'sales_invoice.view'))
  or (select private.has_company_permission(company_id, 'customer.balance.view'))
);

revoke all on table public.commercial_document_payment_links from anon, authenticated;
grant select on table public.commercial_document_payment_links to authenticated;

create or replace view public.commercial_document_payments
with (security_invoker = true)
as
select
  link.id,
  link.company_id,
  link.document_id,
  link.payment_id,
  link.allocation_type,
  link.amount,
  link.currency,
  link.status,
  link.accounting_status,
  link.vat_status,
  link.linked_at,
  payment.payment_number,
  payment.payment_date,
  payment.payment_method,
  payment.bank_reference
from public.commercial_document_payment_links link
join public.payments payment on payment.id = link.payment_id;

-- Cross-row checks are kept in the database so a service-role repair cannot
-- attach a payment to a different company or to a tax-invoice-only workflow.
create or replace function private.validate_commercial_document_payment_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  document_row public.invoices;
  payment_row public.payments;
  existing_amount numeric(20,4);
begin
  select * into document_row
  from public.invoices
  where id = new.document_id;
  if not found then
    raise exception 'Commercial document not found' using errcode = 'P0002';
  end if;
  if document_row.commercial_document_type not in ('PROFORMA', 'ADVANCE_INVOICE') then
    raise exception 'Only proformas and advance invoices can receive advance payment links' using errcode = '23514';
  end if;

  select * into payment_row
  from public.payments
  where id = new.payment_id;
  if not found then
    raise exception 'Customer payment not found' using errcode = 'P0002';
  end if;
  if payment_row.company_id is distinct from document_row.company_id
     or payment_row.client_id is distinct from document_row.client_id then
    raise exception 'Payment and commercial document must belong to the same company and customer' using errcode = '23514';
  end if;
  if payment_row.accounting_state <> 'posted' or payment_row.reversed_at is not null then
    raise exception 'Only posted, unreversed customer payments can be linked' using errcode = '55000';
  end if;
  if upper(coalesce(payment_row.currency, 'EUR')) <> upper(coalesce(new.currency, 'EUR')) then
    raise exception 'Payment and commercial document currencies must match' using errcode = '23514';
  end if;
  if new.status = 'active' then
    select coalesce(sum(link.amount), 0)
    into existing_amount
    from public.commercial_document_payment_links link
    where link.document_id = new.document_id
      and link.status = 'active'
      and link.id <> new.id;
    if existing_amount + new.amount > coalesce(document_row.total_amount, 0) then
      raise exception 'Advance payment links exceed the document total' using errcode = '22003';
    end if;
    select round(
      coalesce(payment_row.amount, 0)
      - coalesce((select sum(allocation.allocated_amount) from public.payment_allocations allocation
                  where allocation.payment_id = payment_row.id and allocation.status = 'active'), 0)
      - coalesce((select sum(link.amount) from public.commercial_document_payment_links link
                  where link.payment_id = payment_row.id and link.status = 'active' and link.id <> new.id), 0),
      4
    ) into existing_amount;
    if new.amount > existing_amount then
      raise exception 'Advance payment link exceeds the unallocated payment amount' using errcode = '22003';
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists commercial_document_payment_links_validate on public.commercial_document_payment_links;
create trigger commercial_document_payment_links_validate
before insert or update on public.commercial_document_payment_links
for each row execute function private.validate_commercial_document_payment_link();

create or replace function public.link_commercial_advance_payment(
  p_document_id uuid,
  p_payment_id uuid,
  p_amount numeric default null,
  p_reason text default null
)
returns public.commercial_document_payment_links
language plpgsql
security definer
set search_path = ''
as $$
declare
  document_row public.invoices;
  payment_row public.payments;
  existing_link public.commercial_document_payment_links;
  link_row public.commercial_document_payment_links;
  available_payment numeric(20,4);
  outstanding_document numeric(20,4);
  link_amount numeric(20,4);
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into payment_row from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Customer payment not found' using errcode = 'P0002';
  end if;
  select * into document_row from public.invoices where id = p_document_id for update;
  if not found then
    raise exception 'Commercial document not found' using errcode = 'P0002';
  end if;
  if not (select private.has_company_permission(document_row.company_id, 'customer_payment.allocate'))
     and not (select private.has_company_permission(document_row.company_id, 'sales_invoice.edit')) then
    raise exception 'Insufficient permission to link an advance payment' using errcode = '42501';
  end if;
  if document_row.commercial_document_type not in ('PROFORMA', 'ADVANCE_INVOICE') then
    raise exception 'Only proformas and advance invoices can receive advance payments' using errcode = '23514';
  end if;
  if payment_row.company_id is distinct from document_row.company_id
     or payment_row.client_id is distinct from document_row.client_id then
    raise exception 'Payment and document must belong to the same company and customer' using errcode = '23514';
  end if;
  if payment_row.accounting_state <> 'posted' or payment_row.reversed_at is not null then
    raise exception 'Only posted, unreversed customer payments can be linked' using errcode = '55000';
  end if;
  if upper(coalesce(payment_row.currency, 'EUR')) <> upper(coalesce(document_row.currency, 'EUR')) then
    raise exception 'Payment and document currencies must match' using errcode = '23514';
  end if;

  select * into existing_link
  from public.commercial_document_payment_links
  where payment_id = payment_row.id
    and document_id = document_row.id
    and allocation_type = 'ADVANCE'
    and status = 'active'
  for update;
  if found then
    return existing_link;
  end if;

  select round(
    payment_row.amount
    - coalesce((select sum(allocation.allocated_amount) from public.payment_allocations allocation
               where allocation.payment_id = payment_row.id and allocation.status = 'active'), 0)
    - coalesce((select sum(link.amount) from public.commercial_document_payment_links link
               where link.payment_id = payment_row.id and link.status = 'active'), 0),
    4
  ) into available_payment;
  select round(
    document_row.total_amount
    - coalesce((select sum(link.amount) from public.commercial_document_payment_links link
               where link.document_id = document_row.id and link.status = 'active'), 0),
    4
  ) into outstanding_document;

  link_amount := round(coalesce(p_amount, least(available_payment, outstanding_document)), 4);
  if link_amount <= 0 then
    raise exception 'There is no available payment or document balance to link' using errcode = '23514';
  end if;
  if link_amount > available_payment or link_amount > outstanding_document then
    raise exception 'Advance payment link exceeds the available payment or document balance' using errcode = '23514';
  end if;

  insert into public.commercial_document_payment_links (
    company_id, document_id, payment_id, allocation_type, amount, currency,
    linked_by, metadata
  ) values (
    document_row.company_id, document_row.id, payment_row.id, 'ADVANCE', link_amount,
    upper(coalesce(payment_row.currency, 'EUR')), (select auth.uid()),
    jsonb_build_object('reason', nullif(trim(coalesce(p_reason, '')), ''))
  ) returning * into link_row;

  insert into public.document_source_links (
    company_id, source_type, source_id, target_type, target_id, link_type,
    amount, metadata, created_by
  ) values (
    document_row.company_id, 'payment', payment_row.id, 'commercial_document', document_row.id,
    'payment_to_advance', link_amount,
    jsonb_build_object('allocation_id', link_row.id), (select auth.uid())
  ) on conflict do nothing;

  update public.invoices
  set commercial_status = case
        when outstanding_document - link_amount <= 0 then 'PAID'
        else 'PARTIALLY_PAID'
      end,
      payment_status = case
        when outstanding_document - link_amount <= 0 then 'PAID'
        else 'PARTIALLY_PAID'
      end
  where id = document_row.id;

  perform private.insert_commercial_document_event(
    document_row.company_id, document_row.id, 'advance_payment_linked',
    document_row.commercial_status,
    case when outstanding_document - link_amount <= 0 then 'PAID' else 'PARTIALLY_PAID' end,
    jsonb_build_object(
      'payment_id', payment_row.id,
      'allocation_id', link_row.id,
      'amount', link_amount,
      'accounting_status', link_row.accounting_status,
      'vat_status', link_row.vat_status
    ),
    clock_timestamp(), (select auth.uid())
  );
  return link_row;
end
$$;

-- When a proforma is converted to an advance invoice, preserve a direct
-- payment-to-advance relation for navigation. The payment-link row remains on
-- the original proforma so the same payment is never counted twice.
create or replace function private.carry_commercial_advance_payment_links()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_link record;
begin
  if new.commercial_document_type = 'ADVANCE_INVOICE'
     and new.source_document_type = 'commercial_document'
     and new.source_document_id is not null then
    for source_link in
      select link.payment_id, link.amount, link.metadata
      from public.commercial_document_payment_links link
      where link.document_id = new.source_document_id
        and link.status = 'active'
    loop
      insert into public.document_source_links (
        company_id, source_type, source_id, target_type, target_id, link_type,
        amount, metadata, created_by
      ) values (
        new.company_id, 'payment', source_link.payment_id, 'commercial_document', new.id,
        'payment_to_advance', source_link.amount,
        coalesce(source_link.metadata, '{}'::jsonb)
          || jsonb_build_object('carried_from_document_id', new.source_document_id),
        (select auth.uid())
      ) on conflict do nothing;
    end loop;
  end if;
  return new;
end
$$;

drop trigger if exists invoices_carry_commercial_advance_payment_links on public.invoices;
create trigger invoices_carry_commercial_advance_payment_links
after insert on public.invoices
for each row execute function private.carry_commercial_advance_payment_links();

-- ---------------------------------------------------------------------------
-- Advance-to-final reconciliation ledger
-- ---------------------------------------------------------------------------

alter table public.invoices
  add column if not exists advance_applied_tax_amount numeric(20,4) not null default 0
    check (advance_applied_tax_amount >= 0),
  add column if not exists advance_reconciliation_status text not null default 'NOT_APPLICABLE'
    check (advance_reconciliation_status in ('NOT_APPLICABLE', 'PENDING', 'RECONCILED', 'REQUIRES_REVIEW'));

create table if not exists public.commercial_document_advance_allocations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  advance_invoice_id uuid not null references public.invoices(id) on delete restrict,
  final_invoice_id uuid not null references public.invoices(id) on delete restrict,
  amount numeric(20,4) not null check (amount > 0),
  tax_amount numeric(20,4) not null default 0 check (tax_amount >= 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  allocated_at timestamptz not null default now(),
  allocated_by uuid references auth.users(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'reversed')),
  reversed_at timestamptz,
  reversed_by uuid references auth.users(id) on delete set null,
  reversal_reason text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  check (advance_invoice_id <> final_invoice_id),
  check (
    (status = 'active' and reversed_at is null and reversed_by is null and reversal_reason is null)
    or (status = 'reversed' and reversed_at is not null and reversed_by is not null and nullif(trim(reversal_reason), '') is not null)
  )
);

create index if not exists commercial_document_advance_allocations_advance_idx
  on public.commercial_document_advance_allocations (company_id, advance_invoice_id, allocated_at desc)
  where status = 'active';
create index if not exists commercial_document_advance_allocations_final_idx
  on public.commercial_document_advance_allocations (company_id, final_invoice_id, allocated_at desc)
  where status = 'active';

-- A payment made against a proforma remains attributable to the advance
-- invoice created from that proforma through the source-document chain.
create or replace function private.commercial_document_received_amount(p_invoice_id uuid)
returns numeric(20,4)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive document_chain(id) as (
    select p_invoice_id
    union
    select source.source_document_id
    from public.invoices source
    join document_chain chain on chain.id = source.id
    where source.source_document_type = 'commercial_document'
      and source.source_document_id is not null
  ), payment_totals as (
    select allocation.payment_id, sum(allocation.allocated_amount) as amount
    from public.payment_allocations allocation
    where allocation.invoice_id in (select id from document_chain)
      and allocation.status = 'active'
    group by allocation.payment_id
    union all
    select link.payment_id, sum(link.amount) as amount
    from public.commercial_document_payment_links link
    where link.document_id in (select id from document_chain)
      and link.status = 'active'
    group by link.payment_id
  )
  select round(coalesce(sum(payment_totals.amount), 0), 4)
  from payment_totals
$$;

alter table public.commercial_document_advance_allocations enable row level security;
drop policy if exists commercial_document_advance_allocations_select on public.commercial_document_advance_allocations;
create policy commercial_document_advance_allocations_select
on public.commercial_document_advance_allocations
for select to authenticated
using (
  (select private.has_company_permission(company_id, 'sales_invoice.view'))
  or (select private.has_company_permission(company_id, 'customer.balance.view'))
);

revoke all on table public.commercial_document_advance_allocations from anon, authenticated;
grant select on table public.commercial_document_advance_allocations to authenticated;

create or replace function private.validate_commercial_advance_allocation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  advance_row public.invoices;
  final_row public.invoices;
  existing_amount numeric(20,4);
begin
  select * into advance_row from public.invoices where id = new.advance_invoice_id;
  select * into final_row from public.invoices where id = new.final_invoice_id;
  if advance_row.id is null or final_row.id is null then
    raise exception 'Advance or final invoice was not found' using errcode = 'P0002';
  end if;
  if advance_row.commercial_document_type <> 'ADVANCE_INVOICE'
     or final_row.commercial_document_type <> 'FINAL_INVOICE' then
    raise exception 'Advance allocations require an advance invoice and a final invoice' using errcode = '23514';
  end if;
  if advance_row.company_id is distinct from final_row.company_id
     or advance_row.client_id is distinct from final_row.client_id
     or upper(coalesce(advance_row.currency, 'EUR')) <> upper(coalesce(final_row.currency, 'EUR'))
     or advance_row.company_id is distinct from new.company_id then
    raise exception 'Advance and final invoices must belong to the same company, customer, and currency' using errcode = '23514';
  end if;
  if new.status = 'active' then
    select coalesce(sum(allocation.amount), 0)
    into existing_amount
    from public.commercial_document_advance_allocations allocation
    where allocation.final_invoice_id = new.final_invoice_id
      and allocation.status = 'active'
      and allocation.id <> new.id;
    if existing_amount + new.amount > coalesce(final_row.total_amount, 0) then
      raise exception 'Advance allocations exceed the final invoice total' using errcode = '22003';
    end if;
    select round(
      private.commercial_document_received_amount(advance_row.id)
      - coalesce((select sum(allocation.amount) from public.commercial_document_advance_allocations allocation
                  where allocation.advance_invoice_id = advance_row.id and allocation.status = 'active'
                    and allocation.id <> new.id), 0),
      4
    ) into existing_amount;
    if new.amount > existing_amount then
      raise exception 'Advance allocation exceeds the received and unapplied advance amount' using errcode = '22003';
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists commercial_document_advance_allocations_validate on public.commercial_document_advance_allocations;
create trigger commercial_document_advance_allocations_validate
before insert or update on public.commercial_document_advance_allocations
for each row execute function private.validate_commercial_advance_allocation();

create or replace function public.allocate_advance_to_final_invoice(
  p_advance_invoice_id uuid,
  p_final_invoice_id uuid,
  p_amount numeric,
  p_reason text default null
)
returns public.commercial_document_advance_allocations
language plpgsql
security definer
set search_path = ''
as $$
declare
  advance_row public.invoices;
  final_row public.invoices;
  allocation_row public.commercial_document_advance_allocations;
  received_amount numeric(20,4);
  already_applied numeric(20,4);
  available_advance numeric(20,4);
  remaining_final numeric(20,4);
  allocation_amount numeric(20,4);
  allocation_tax numeric(20,4);
  next_final_status text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_amount is null or round(p_amount, 4) <= 0 then
    raise exception 'Advance allocation amount must be greater than zero' using errcode = '23514';
  end if;

  -- Lock both rows in a deterministic order before reading balances. This
  -- prevents two finalization requests from consuming the same advance.
  perform 1
  from public.invoices invoice
  where invoice.id in (p_advance_invoice_id, p_final_invoice_id)
  order by invoice.id
  for update;

  select * into advance_row from public.invoices where id = p_advance_invoice_id;
  select * into final_row from public.invoices where id = p_final_invoice_id;
  if advance_row.id is null or final_row.id is null then
    raise exception 'Advance or final invoice was not found' using errcode = 'P0002';
  end if;
  if not (select private.has_company_permission(advance_row.company_id, 'sales_invoice.edit')) then
    raise exception 'Advance reconciliation requires sales invoice posting permission' using errcode = '42501';
  end if;
  if advance_row.commercial_document_type <> 'ADVANCE_INVOICE'
     or final_row.commercial_document_type <> 'FINAL_INVOICE' then
    raise exception 'Advance reconciliation requires an advance invoice and a final invoice' using errcode = '23514';
  end if;
  if advance_row.company_id is distinct from final_row.company_id
     or advance_row.client_id is distinct from final_row.client_id
     or upper(coalesce(advance_row.currency, 'EUR')) <> upper(coalesce(final_row.currency, 'EUR')) then
    raise exception 'Advance and final invoices must belong to the same company, customer, and currency' using errcode = '23514';
  end if;
  if final_row.accounting_state in ('posted', 'reversed') then
    raise exception 'Posted final invoices require the controlled advance-reconciliation posting workflow' using errcode = '55000';
  end if;

  received_amount := private.commercial_document_received_amount(advance_row.id);
  select round(coalesce(sum(allocation.amount), 0), 4)
  into already_applied
  from public.commercial_document_advance_allocations allocation
  where allocation.advance_invoice_id = advance_row.id
    and allocation.status = 'active';
  available_advance := greatest(0, received_amount - already_applied);
  remaining_final := greatest(0, coalesce(final_row.total_amount, 0) - coalesce(final_row.advance_applied_amount, 0));
  allocation_amount := round(p_amount, 4);

  if allocation_amount > available_advance then
    raise exception 'Advance allocation exceeds the received and unapplied advance amount' using errcode = '23514';
  end if;
  if allocation_amount > remaining_final then
    raise exception 'Advance allocation exceeds the remaining final invoice amount' using errcode = '23514';
  end if;

  allocation_tax := case
    when coalesce(advance_row.total_amount, 0) > 0
      then round(allocation_amount * coalesce(advance_row.tax_amount, 0) / advance_row.total_amount, 4)
    else 0
  end;

  insert into public.commercial_document_advance_allocations (
    company_id, advance_invoice_id, final_invoice_id, amount, tax_amount,
    currency, allocated_by, metadata
  ) values (
    advance_row.company_id, advance_row.id, final_row.id, allocation_amount, allocation_tax,
    upper(coalesce(final_row.currency, 'EUR')), (select auth.uid()),
    jsonb_build_object('reason', nullif(trim(coalesce(p_reason, '')), ''))
  ) returning * into allocation_row;

  next_final_status := case
    when remaining_final - allocation_amount <= 0 then 'RECONCILED'
    else 'PENDING'
  end;
  update public.invoices
  set advance_applied_amount = coalesce(advance_applied_amount, 0) + allocation_amount,
      advance_applied_tax_amount = coalesce(advance_applied_tax_amount, 0) + allocation_tax,
      advance_reconciliation_status = next_final_status,
      payment_status = case
        when remaining_final - allocation_amount <= 0 then 'PAID'
        else 'PARTIALLY_PAID'
      end
  where id = final_row.id;

  insert into public.document_source_links (
    company_id, source_type, source_id, target_type, target_id, link_type,
    amount, metadata, created_by
  ) values (
    advance_row.company_id, 'commercial_document', advance_row.id,
    'commercial_document', final_row.id, 'advance_finalization', allocation_amount,
    jsonb_build_object('advance_allocation_id', allocation_row.id), (select auth.uid())
  ) on conflict do nothing;

  perform private.insert_commercial_document_event(
    final_row.company_id, final_row.id, 'advance_reconciled',
    final_row.commercial_status, final_row.commercial_status,
    jsonb_build_object(
      'advance_invoice_id', advance_row.id,
      'allocation_id', allocation_row.id,
      'amount', allocation_amount,
      'tax_amount', allocation_tax,
      'reconciliation_status', next_final_status
    ),
    clock_timestamp(), (select auth.uid())
  );
  return allocation_row;
end
$$;

-- Do not let the ordinary sales-invoice poster silently treat an advance or a
-- final invoice with advances as an ordinary one. A certified/legal posting
-- workflow can set this transaction-local flag after it has applied the
-- verified Kosovo tax/accounting rule.
create or replace function private.guard_advance_aware_invoice_posting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.accounting_state = 'posted'
     and new.commercial_document_type in ('ADVANCE_INVOICE', 'FINAL_INVOICE')
     and coalesce(current_setting('app.commercial_advance_posting', true), '') <> 'authorized' then
    raise exception 'Advance and final invoices require the controlled commercial advance posting workflow'
      using errcode = '55000';
  end if;
  return new;
end
$$;

drop trigger if exists invoices_guard_advance_aware_posting on public.invoices;
create trigger invoices_guard_advance_aware_posting
before update of accounting_state, status on public.invoices
for each row execute function private.guard_advance_aware_invoice_posting();

-- ---------------------------------------------------------------------------
-- Shared view refreshes, immutable events, and explicit API exposure
-- ---------------------------------------------------------------------------

create or replace view public.commercial_documents
with (security_invoker = true)
as
select
  invoice.id,
  invoice.user_id,
  invoice.company_id,
  invoice.branch_id,
  invoice.client_id,
  invoice.invoice_number as document_number,
  invoice.commercial_document_type as document_type,
  invoice.commercial_status as document_status,
  invoice.accounting_status,
  invoice.vat_status,
  invoice.inventory_status,
  invoice.payment_status,
  invoice.fiscalization_status,
  invoice.issue_date,
  invoice.supply_date,
  invoice.due_date,
  invoice.valid_until,
  invoice.order_date,
  invoice.delivery_date,
  invoice.payment_date,
  invoice.currency,
  invoice.exchange_rate,
  invoice.total_amount,
  invoice.tax_amount,
  invoice.source_document_type,
  invoice.source_document_id,
  invoice.original_invoice_id,
  invoice.created_at,
  invoice.customer_po_number,
  invoice.delivery_address,
  invoice.shipping_address,
  invoice.payment_terms,
  invoice.delivery_terms,
  invoice.show_prices_on_delivery_note,
  invoice.advance_applied_amount,
  invoice.advance_applied_tax_amount,
  invoice.advance_reconciliation_status,
  invoice.immutable_at,
  invoice.issued_at,
  invoice.issued_by
from public.invoices invoice;

create or replace view public.commercial_document_lines
with (security_invoker = true)
as
select
  item.id,
  item.invoice_id as document_id,
  item.product_id,
  item.description,
  item.quantity,
  item.ordered_quantity,
  item.delivered_quantity,
  item.remaining_quantity,
  item.unit,
  item.unit_price,
  item.discount,
  item.tax_rate,
  item.amount,
  item.source_item_id,
  item.credited_quantity,
  item.sku,
  item.tax_code
from public.invoice_items item;

grant select on public.commercial_documents to authenticated;
grant select on public.commercial_document_lines to authenticated;
grant select on public.commercial_document_relations to authenticated;
grant select on public.commercial_document_timeline to authenticated;
grant select on public.commercial_document_payments to authenticated;

-- Timeline rows are append-only. Corrections are represented by a new event,
-- never by rewriting or deleting the original event.
create or replace function private.prevent_commercial_document_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.commercial_document_events_workflow', true), '') <> 'authorized' then
    raise exception 'Commercial document events are immutable' using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

drop trigger if exists commercial_document_events_append_only on public.commercial_document_events;
create trigger commercial_document_events_append_only
before update or delete on public.commercial_document_events
for each row execute function private.prevent_commercial_document_event_mutation();

drop trigger if exists invoices_commercial_document_event_trigger on public.invoices;
create trigger invoices_commercial_document_event_trigger
after insert or update of status, commercial_status on public.invoices
for each row execute function private.capture_commercial_document_event();

revoke all on function public.link_commercial_advance_payment(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.link_commercial_advance_payment(uuid, uuid, numeric, text) to authenticated;
revoke all on function public.allocate_advance_to_final_invoice(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.allocate_advance_to_final_invoice(uuid, uuid, numeric, text) to authenticated;
revoke all on function private.seed_commercial_document_settings_for_company() from public;
revoke all on function private.validate_commercial_document_payment_link() from public;
revoke all on function private.carry_commercial_advance_payment_links() from public;
revoke all on function private.validate_commercial_advance_allocation() from public;
revoke all on function private.commercial_document_received_amount(uuid) from public;
revoke all on function private.guard_advance_aware_invoice_posting() from public;
revoke all on function private.prevent_commercial_document_event_mutation() from public;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'commercial_document_settings',
    'commercial_document_payment_links',
    'commercial_document_advance_allocations'
  ]
  loop
    execute format('drop trigger if exists %I_audit on public.%I', table_name, table_name);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function private.audit_table_change()', table_name, table_name);
  end loop;
end
$$;

comment on table public.commercial_document_payment_links is
  'Traceability links for payments received against proformas or advance invoices. These links do not by themselves post revenue, AR, VAT, or fiscalization.';
comment on table public.commercial_document_advance_allocations is
  'Advance amounts applied to final invoices. The row prevents double application; certified legal/accounting posting remains a separate controlled workflow.';
comment on function public.link_commercial_advance_payment(uuid, uuid, numeric, text) is
  'Links an already posted customer payment to a proforma/advance invoice without treating the proforma as an ordinary tax invoice.';
comment on function public.allocate_advance_to_final_invoice(uuid, uuid, numeric, text) is
  'Applies received advance value to a final invoice and records the reconciliation ledger without creating a second VAT event.';
