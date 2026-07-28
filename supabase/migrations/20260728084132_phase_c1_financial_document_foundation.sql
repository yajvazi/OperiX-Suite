-- Phase C1: financial-document lifecycle foundation.
--
-- This migration deliberately extends the existing operational document tables.
-- It does not reconstruct legacy accounting history and it does not introduce a
-- second invoice, customer, supplier, or payment module.

-- Keep legacy status labels readable while adding the lifecycle vocabulary that
-- Phase C commands will use. Existing records are not remapped in this
-- migration: their accounting treatment requires an accountant review.
alter type public.invoice_status add value if not exists 'pending_approval';
alter type public.invoice_status add value if not exists 'approved';
alter type public.invoice_status add value if not exists 'posted';
alter type public.invoice_status add value if not exists 'partially_paid';
alter type public.invoice_status add value if not exists 'reversed';
alter type public.invoice_status add value if not exists 'credited';
alter type public.invoice_status add value if not exists 'cancelled';

-- ---------------------------------------------------------------------------
-- Extend existing customer, supplier, document and payment records.
-- ---------------------------------------------------------------------------

alter table public.clients
  add column if not exists payment_terms_days integer check (payment_terms_days is null or payment_terms_days between 0 and 3650),
  add column if not exists credit_limit numeric(20,4) not null default 0 check (credit_limit >= 0),
  add column if not exists default_receivable_account_id uuid references public.chart_of_accounts(id) on delete restrict,
  add column if not exists default_revenue_account_id uuid references public.chart_of_accounts(id) on delete restrict,
  add column if not exists default_vat_code text,
  add column if not exists customer_group text,
  add column if not exists account_status text not null default 'active' check (account_status in ('active','inactive','on_hold','closed')),
  add column if not exists bad_debt_status text not null default 'none' check (bad_debt_status in ('none','watch','provisioned','written_off')),
  add column if not exists sales_blocked boolean not null default false,
  add column if not exists default_currency text not null default 'EUR' check (default_currency ~ '^[A-Z]{3}$'),
  add column if not exists billing_contacts jsonb not null default '[]'::jsonb check (jsonb_typeof(billing_contacts) = 'array'),
  add column if not exists attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array');

alter table public.vendors
  add column if not exists fiscal_number text,
  add column if not exists vat_number text,
  add column if not exists payment_terms_days integer check (payment_terms_days is null or payment_terms_days between 0 and 3650),
  add column if not exists default_payable_account_id uuid references public.chart_of_accounts(id) on delete restrict,
  add column if not exists default_expense_account_id uuid references public.chart_of_accounts(id) on delete restrict,
  add column if not exists default_vat_code text,
  add column if not exists supplier_status text not null default 'active' check (supplier_status in ('active','inactive','on_hold','blocked')),
  add column if not exists default_currency text not null default 'EUR' check (default_currency ~ '^[A-Z]{3}$'),
  add column if not exists contact_persons jsonb not null default '[]'::jsonb check (jsonb_typeof(contact_persons) = 'array'),
  add column if not exists bank_accounts jsonb not null default '[]'::jsonb check (jsonb_typeof(bank_accounts) = 'array'),
  add column if not exists attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array');

alter table public.invoices
  add column if not exists branch_id uuid references public.branches(id) on delete restrict,
  add column if not exists fiscal_year_id uuid references public.accounting_fiscal_years(id) on delete restrict,
  add column if not exists posting_date date,
  add column if not exists approval_status text not null default 'not_required' check (approval_status in ('not_required','pending','approved','rejected')),
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists posted_at timestamptz,
  add column if not exists posted_by uuid references auth.users(id) on delete set null,
  add column if not exists posting_journal_entry_id uuid references public.journal_entries(id) on delete restrict,
  add column if not exists currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  add column if not exists exchange_rate numeric(20,10) not null default 1 check (exchange_rate > 0),
  add column if not exists idempotency_key uuid,
  add column if not exists source_document_type text,
  add column if not exists source_document_id uuid,
  add column if not exists credit_of_invoice_id uuid references public.invoices(id) on delete restrict,
  add column if not exists reversal_of_invoice_id uuid references public.invoices(id) on delete restrict,
  add column if not exists cancellation_reason text,
  add column if not exists correction_reason text,
  add column if not exists accounting_state text not null default 'legacy' check (accounting_state in ('legacy','ready_for_posting','posted','reversed','opening_balance','excluded'));

create unique index if not exists invoices_company_number_unique
  on public.invoices (company_id, invoice_number)
  where company_id is not null;
create unique index if not exists invoices_posting_journal_unique
  on public.invoices (posting_journal_entry_id)
  where posting_journal_entry_id is not null;
create unique index if not exists invoices_company_idempotency_unique
  on public.invoices (company_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists invoices_company_lifecycle_idx
  on public.invoices (company_id, status, due_date, issue_date desc);
create index if not exists invoices_credit_of_idx
  on public.invoices (credit_of_invoice_id)
  where credit_of_invoice_id is not null;

alter table public.invoice_items
  add column if not exists revenue_account_id uuid references public.chart_of_accounts(id) on delete restrict,
  add column if not exists tax_code text,
  add column if not exists cost_centre_id uuid references public.accounting_cost_centres(id) on delete restrict,
  add column if not exists project_id uuid references public.accounting_projects(id) on delete restrict,
  add column if not exists source_item_id uuid references public.invoice_items(id) on delete restrict,
  add column if not exists credited_quantity numeric(20,4) not null default 0 check (credited_quantity >= 0);

alter table public.supplier_bills
  add column if not exists branch_id uuid references public.branches(id) on delete restrict,
  add column if not exists fiscal_year_id uuid references public.accounting_fiscal_years(id) on delete restrict,
  add column if not exists posting_date date,
  add column if not exists approval_status text not null default 'not_required' check (approval_status in ('not_required','pending','approved','rejected')),
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists posted_at timestamptz,
  add column if not exists posted_by uuid references auth.users(id) on delete set null,
  add column if not exists posting_journal_entry_id uuid references public.journal_entries(id) on delete restrict,
  add column if not exists currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  add column if not exists exchange_rate numeric(20,10) not null default 1 check (exchange_rate > 0),
  add column if not exists idempotency_key uuid,
  add column if not exists source_document_type text,
  add column if not exists source_document_id uuid,
  add column if not exists credit_of_bill_id uuid references public.supplier_bills(id) on delete restrict,
  add column if not exists reversal_of_bill_id uuid references public.supplier_bills(id) on delete restrict,
  add column if not exists cancellation_reason text,
  add column if not exists correction_reason text,
  add column if not exists accounting_state text not null default 'legacy' check (accounting_state in ('legacy','ready_for_posting','posted','reversed','opening_balance','excluded'));

create unique index if not exists supplier_bills_company_vendor_number_unique
  on public.supplier_bills (company_id, vendor_id, bill_number)
  where company_id is not null and vendor_id is not null;
create unique index if not exists supplier_bills_posting_journal_unique
  on public.supplier_bills (posting_journal_entry_id)
  where posting_journal_entry_id is not null;
create unique index if not exists supplier_bills_company_idempotency_unique
  on public.supplier_bills (company_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists supplier_bills_company_lifecycle_idx
  on public.supplier_bills (company_id, status, due_date, issue_date desc);

alter table public.supplier_bill_items
  add column if not exists tax_rate numeric(9,4) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  add column if not exists tax_code text,
  add column if not exists expense_account_id uuid references public.chart_of_accounts(id) on delete restrict,
  add column if not exists inventory_account_id uuid references public.chart_of_accounts(id) on delete restrict,
  add column if not exists asset_account_id uuid references public.chart_of_accounts(id) on delete restrict,
  add column if not exists cost_centre_id uuid references public.accounting_cost_centres(id) on delete restrict,
  add column if not exists project_id uuid references public.accounting_projects(id) on delete restrict,
  add column if not exists source_item_id uuid references public.supplier_bill_items(id) on delete restrict;

alter table public.payments
  add column if not exists branch_id uuid references public.branches(id) on delete restrict,
  add column if not exists currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  add column if not exists exchange_rate numeric(20,10) not null default 1 check (exchange_rate > 0),
  add column if not exists allocation_status text not null default 'legacy' check (allocation_status in ('legacy','unallocated','partially_allocated','allocated','reversed')),
  add column if not exists posting_journal_entry_id uuid references public.journal_entries(id) on delete restrict,
  add column if not exists posted_at timestamptz,
  add column if not exists reversed_at timestamptz,
  add column if not exists reversal_journal_entry_id uuid references public.journal_entries(id) on delete restrict,
  add column if not exists reversal_reason text,
  add column if not exists idempotency_key uuid,
  add column if not exists accounting_state text not null default 'legacy' check (accounting_state in ('legacy','ready_for_posting','posted','reversed','opening_balance','excluded'));

create unique index if not exists payments_posting_journal_unique
  on public.payments (posting_journal_entry_id)
  where posting_journal_entry_id is not null;
create unique index if not exists payments_company_idempotency_unique
  on public.payments (company_id, idempotency_key)
  where idempotency_key is not null;

alter table public.vendor_payments
  add column if not exists branch_id uuid references public.branches(id) on delete restrict,
  add column if not exists currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  add column if not exists exchange_rate numeric(20,10) not null default 1 check (exchange_rate > 0),
  add column if not exists allocation_status text not null default 'legacy' check (allocation_status in ('legacy','unallocated','partially_allocated','allocated','reversed')),
  add column if not exists posting_journal_entry_id uuid references public.journal_entries(id) on delete restrict,
  add column if not exists posted_at timestamptz,
  add column if not exists reversed_at timestamptz,
  add column if not exists reversal_journal_entry_id uuid references public.journal_entries(id) on delete restrict,
  add column if not exists reversal_reason text,
  add column if not exists idempotency_key uuid,
  add column if not exists accounting_state text not null default 'legacy' check (accounting_state in ('legacy','ready_for_posting','posted','reversed','opening_balance','excluded'));

create unique index if not exists vendor_payments_posting_journal_unique
  on public.vendor_payments (posting_journal_entry_id)
  where posting_journal_entry_id is not null;
create unique index if not exists vendor_payments_company_idempotency_unique
  on public.vendor_payments (company_id, idempotency_key)
  where idempotency_key is not null;

alter table public.expenses
  add column if not exists branch_id uuid references public.branches(id) on delete restrict,
  add column if not exists posting_date date,
  add column if not exists approval_status text not null default 'not_required' check (approval_status in ('not_required','pending','approved','rejected')),
  add column if not exists posting_journal_entry_id uuid references public.journal_entries(id) on delete restrict,
  add column if not exists currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  add column if not exists exchange_rate numeric(20,10) not null default 1 check (exchange_rate > 0),
  add column if not exists tax_code text,
  add column if not exists cost_centre_id uuid references public.accounting_cost_centres(id) on delete restrict,
  add column if not exists project_id uuid references public.accounting_projects(id) on delete restrict,
  add column if not exists idempotency_key uuid,
  add column if not exists accounting_state text not null default 'legacy' check (accounting_state in ('legacy','ready_for_posting','posted','reversed','opening_balance','excluded'));

create unique index if not exists expenses_posting_journal_unique
  on public.expenses (posting_journal_entry_id)
  where posting_journal_entry_id is not null;

-- ---------------------------------------------------------------------------
-- Generic, append-friendly document metadata shared by sales and purchases.
-- ---------------------------------------------------------------------------

create table if not exists public.financial_document_attachments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete restrict,
  document_type text not null check (document_type in ('sales_invoice','supplier_bill','expense','income','customer_payment','supplier_payment','credit_note')),
  document_id uuid not null,
  storage_bucket text not null,
  storage_path text not null,
  file_name text not null,
  content_type text,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  file_checksum text,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  unique (company_id, document_type, document_id, storage_bucket, storage_path)
);
create index if not exists financial_document_attachments_document_idx
  on public.financial_document_attachments (company_id, document_type, document_id)
  where deleted_at is null;

create table if not exists public.document_source_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  source_type text not null,
  source_id uuid not null,
  target_type text not null,
  target_id uuid not null,
  link_type text not null check (link_type in ('quotation_conversion','proforma_conversion','order_conversion','advance_finalization','credit_note','reversal','adjustment','attachment_reference')),
  quantity numeric(20,4),
  amount numeric(20,4),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (company_id, source_type, source_id, target_type, target_id, link_type)
);
create index if not exists document_source_links_source_idx on public.document_source_links (company_id, source_type, source_id);
create index if not exists document_source_links_target_idx on public.document_source_links (company_id, target_type, target_id);

create table if not exists public.approval_workflows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  entity_type text not null check (entity_type in ('sales_invoice','supplier_bill','expense','income')),
  entity_id uuid not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  requested_at timestamptz not null default now(),
  requested_by uuid references auth.users(id) on delete set null,
  required_role_code text,
  current_step integer not null default 1 check (current_step > 0),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  unique (company_id, entity_type, entity_id)
);

create table if not exists public.approval_actions (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.approval_workflows(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete restrict,
  action text not null check (action in ('requested','approved','rejected','cancelled','reopened')),
  action_at timestamptz not null default now(),
  action_by uuid references auth.users(id) on delete set null,
  reason text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object')
);
create index if not exists approval_actions_workflow_idx on public.approval_actions (workflow_id, action_at);

-- A transactional outbox, not a second notification system. Existing delivery
-- channels can consume these events after the database transaction commits.
create table if not exists public.domain_outbox_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete restrict,
  aggregate_type text not null,
  aggregate_id uuid not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  idempotency_key text not null,
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  publish_attempts integer not null default 0 check (publish_attempts >= 0),
  last_error text,
  unique (company_id, event_type, idempotency_key)
);
create index if not exists domain_outbox_events_pending_idx
  on public.domain_outbox_events (occurred_at)
  where published_at is null;

create or replace function private.emit_domain_outbox_event(
  p_company_id uuid,
  p_branch_id uuid,
  p_aggregate_type text,
  p_aggregate_id uuid,
  p_event_type text,
  p_payload jsonb,
  p_idempotency_key text
)
returns public.domain_outbox_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.domain_outbox_events;
begin
  insert into public.domain_outbox_events (
    company_id, branch_id, aggregate_type, aggregate_id, event_type,
    payload, idempotency_key, created_by
  )
  values (
    p_company_id, p_branch_id, p_aggregate_type, p_aggregate_id, p_event_type,
    coalesce(p_payload, '{}'::jsonb), p_idempotency_key, (select auth.uid())
  )
  on conflict (company_id, event_type, idempotency_key) do nothing
  returning * into event_row;

  if event_row.id is null then
    select *
    into event_row
    from public.domain_outbox_events
    where company_id = p_company_id
      and event_type = p_event_type
      and idempotency_key = p_idempotency_key;
  end if;
  return event_row;
end
$$;

-- Posted operational documents can only be touched from a protected financial
-- command. This leaves legacy records accessible and editable until an explicit
-- reconstruction/cutover decision is made.
create or replace function private.prevent_posted_financial_document_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  workflow_authorized boolean := coalesce(current_setting('app.financial_workflow', true), '') = 'authorized';
  prior_state text;
begin
  if tg_table_name = 'invoice_items' then
    select invoice.accounting_state
    into prior_state
    from public.invoices invoice
    where invoice.id = old.invoice_id;
  elsif tg_table_name = 'supplier_bill_items' then
    select bill.accounting_state
    into prior_state
    from public.supplier_bills bill
    where bill.id = old.bill_id;
  else
    prior_state := to_jsonb(old) ->> 'accounting_state';
  end if;

  prior_state := coalesce(prior_state, 'legacy');
  if prior_state in ('posted', 'reversed', 'opening_balance') and not workflow_authorized then
    raise exception 'Posted financial records are immutable; use a correction or reversal workflow'
      using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['invoices','invoice_items','supplier_bills','supplier_bill_items','payments','vendor_payments','expenses']
  loop
    execute format('drop trigger if exists %I_financial_immutable on public.%I', table_name, table_name);
    execute format('create trigger %I_financial_immutable before update or delete on public.%I for each row execute function private.prevent_posted_financial_document_mutation()', table_name, table_name);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Phase C permissions and RLS/audit integration.
-- ---------------------------------------------------------------------------

insert into public.app_permissions (code, name, category, description, is_sensitive)
values
  ('sales_invoice.view', 'View sales invoices', 'sales', 'View sales invoices and lifecycle details.', false),
  ('sales_invoice.create', 'Create sales invoices', 'sales', 'Create and edit draft sales invoices.', false),
  ('sales_invoice.approve', 'Approve sales invoices', 'sales', 'Approve sales invoices for posting.', true),
  ('sales_invoice.post', 'Post sales invoices', 'accounting', 'Post sales invoice journals.', true),
  ('sales_invoice.reverse', 'Reverse posted invoices', 'accounting', 'Reverse permitted posted invoice journals.', true),
  ('customer.balance.view', 'View customer balances', 'receivables', 'View customer balances, aging and statements.', false),
  ('customer_payment.record', 'Record customer payments', 'receivables', 'Record customer payments.', true),
  ('customer_payment.allocate', 'Allocate customer payments', 'receivables', 'Allocate and unallocate customer payments.', true),
  ('supplier_bill.view', 'View supplier bills', 'payables', 'View supplier invoices and lifecycle details.', false),
  ('supplier_bill.approve', 'Approve supplier bills', 'payables', 'Approve supplier bills for posting.', true),
  ('supplier_bill.post', 'Post supplier bills', 'accounting', 'Post supplier invoice journals.', true),
  ('supplier_payment.record', 'Record supplier payments', 'payables', 'Record supplier payments.', true),
  ('cash_account.view', 'View cash accounts', 'cash', 'View cash boxes and cash books.', false),
  ('cash_transaction.post', 'Post cash transactions', 'cash', 'Post cash receipts, payments and adjustments.', true),
  ('bank_account.view', 'View bank accounts', 'banking', 'View operational bank accounts.', false),
  ('bank_statement.import', 'Import bank statements', 'banking', 'Import and validate bank statements.', true),
  ('bank_reconciliation.complete', 'Complete bank reconciliation', 'banking', 'Complete and lock bank reconciliations.', true),
  ('bank_reconciliation.reopen', 'Reopen bank reconciliation', 'banking', 'Reopen a completed reconciliation with a reason.', true),
  ('financial_reports.view', 'View financial reports', 'reporting', 'View posted-ledger financial reports.', false),
  ('financial_reports.export', 'Export financial reports', 'reporting', 'Export financial reports.', true),
  ('financial_document.audit.view', 'View financial document audit history', 'security', 'View sensitive document audit history.', true)
on conflict (code) do update
set name = excluded.name, category = excluded.category, description = excluded.description, is_sensitive = excluded.is_sensitive;

insert into public.app_role_permissions (role_id, permission_code)
select role.id, permission.code
from public.app_roles role
cross join public.app_permissions permission
where role.company_id is null
  and role.code in ('owner','super_administrator','company_administrator')
  and permission.code in (
    'sales_invoice.view','sales_invoice.create','sales_invoice.approve','sales_invoice.post','sales_invoice.reverse',
    'customer.balance.view','customer_payment.record','customer_payment.allocate',
    'supplier_bill.view','supplier_bill.approve','supplier_bill.post','supplier_payment.record',
    'cash_account.view','cash_transaction.post','bank_account.view','bank_statement.import',
    'bank_reconciliation.complete','bank_reconciliation.reopen','financial_reports.view','financial_reports.export',
    'financial_document.audit.view'
  )
on conflict do nothing;

with grants(role_code, permission_code) as (
  values
    ('accountant','sales_invoice.view'), ('accountant','sales_invoice.create'), ('accountant','sales_invoice.post'),
    ('accountant','customer.balance.view'), ('accountant','customer_payment.record'), ('accountant','customer_payment.allocate'),
    ('accountant','supplier_bill.view'), ('accountant','supplier_bill.post'), ('accountant','supplier_payment.record'),
    ('accountant','cash_account.view'), ('accountant','cash_transaction.post'), ('accountant','bank_account.view'),
    ('accountant','financial_reports.view'), ('accountant','financial_reports.export'),
    ('senior_accountant','sales_invoice.view'), ('senior_accountant','sales_invoice.create'), ('senior_accountant','sales_invoice.approve'), ('senior_accountant','sales_invoice.post'), ('senior_accountant','sales_invoice.reverse'),
    ('senior_accountant','customer.balance.view'), ('senior_accountant','customer_payment.record'), ('senior_accountant','customer_payment.allocate'),
    ('senior_accountant','supplier_bill.view'), ('senior_accountant','supplier_bill.approve'), ('senior_accountant','supplier_bill.post'), ('senior_accountant','supplier_payment.record'),
    ('senior_accountant','cash_account.view'), ('senior_accountant','cash_transaction.post'), ('senior_accountant','bank_account.view'), ('senior_accountant','bank_statement.import'),
    ('senior_accountant','bank_reconciliation.complete'), ('senior_accountant','bank_reconciliation.reopen'), ('senior_accountant','financial_reports.view'), ('senior_accountant','financial_reports.export'), ('senior_accountant','financial_document.audit.view'),
    ('sales_manager','sales_invoice.view'), ('sales_manager','sales_invoice.create'), ('sales_manager','sales_invoice.approve'), ('sales_manager','customer.balance.view'),
    ('cashier','sales_invoice.view'), ('cashier','sales_invoice.create'), ('cashier','customer_payment.record'),
    ('auditor','sales_invoice.view'), ('auditor','customer.balance.view'), ('auditor','supplier_bill.view'), ('auditor','cash_account.view'), ('auditor','bank_account.view'), ('auditor','financial_reports.view'), ('auditor','financial_document.audit.view'),
    ('read_only','sales_invoice.view'), ('read_only','customer.balance.view'), ('read_only','supplier_bill.view'), ('read_only','cash_account.view'), ('read_only','bank_account.view'), ('read_only','financial_reports.view')
)
insert into public.app_role_permissions (role_id, permission_code)
select role.id, grants.permission_code
from grants
join public.app_roles role on role.code = grants.role_code and role.company_id is null
on conflict do nothing;

alter table public.financial_document_attachments enable row level security;
alter table public.document_source_links enable row level security;
alter table public.approval_workflows enable row level security;
alter table public.approval_actions enable row level security;
alter table public.domain_outbox_events enable row level security;

create policy financial_document_attachments_select on public.financial_document_attachments for select to authenticated
  using ((select private.has_company_permission(company_id, 'sales_invoice.view')) or (select private.has_company_permission(company_id, 'supplier_bill.view')));
create policy document_source_links_select on public.document_source_links for select to authenticated
  using ((select private.has_company_permission(company_id, 'sales_invoice.view')) or (select private.has_company_permission(company_id, 'supplier_bill.view')));
create policy approval_workflows_select on public.approval_workflows for select to authenticated
  using ((select private.has_company_permission(company_id, 'sales_invoice.view')) or (select private.has_company_permission(company_id, 'supplier_bill.view')));
create policy approval_actions_select on public.approval_actions for select to authenticated
  using ((select private.has_company_permission(company_id, 'sales_invoice.view')) or (select private.has_company_permission(company_id, 'supplier_bill.view')));
create policy domain_outbox_events_select on public.domain_outbox_events for select to authenticated
  using ((select private.has_company_permission(company_id, 'financial_document.audit.view')));

revoke insert, update, delete, truncate on public.financial_document_attachments, public.document_source_links, public.approval_workflows, public.approval_actions, public.domain_outbox_events from anon, authenticated;
grant select on public.financial_document_attachments, public.document_source_links, public.approval_workflows, public.approval_actions, public.domain_outbox_events to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['financial_document_attachments','document_source_links','approval_workflows','approval_actions','domain_outbox_events']
  loop
    execute format('drop trigger if exists %I_audit on public.%I', table_name, table_name);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function private.audit_table_change()', table_name, table_name);
  end loop;
end
$$;

revoke all on function private.emit_domain_outbox_event(uuid, uuid, text, uuid, text, jsonb, text) from public;

comment on table public.domain_outbox_events is
  'Transactional Phase C outbox. A delivery worker may publish events only after their source transaction commits.';
comment on column public.invoices.accounting_state is
  'Legacy records remain operational-only until explicitly reconstructed or included in opening balances.';
