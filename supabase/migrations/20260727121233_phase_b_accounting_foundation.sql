-- Phase B: double-entry accounting foundation.
-- Extends the Phase A tenant, RBAC, compliance, and append-only audit model.

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

insert into public.app_permissions (code, name, category, description, is_sensitive)
values
  ('accounting.read', 'View accounting', 'accounting', 'View accounts, journals, periods, and balances.', false),
  ('accounts.manage', 'Manage chart of accounts', 'accounting', 'Create and maintain posting accounts.', true),
  ('journal.create', 'Create journal entries', 'accounting', 'Create and update draft journal entries.', false),
  ('journal.post', 'Post journal entries', 'accounting', 'Post balanced journals into an open period.', true),
  ('journal.reverse', 'Reverse journal entries', 'accounting', 'Create controlled reversal entries.', true),
  ('accounting_period.manage', 'Manage accounting periods', 'accounting', 'Create, close, and lock accounting periods.', true),
  ('accounting_period.reopen', 'Reopen accounting periods', 'accounting', 'Reopen closed or locked periods with a mandatory reason.', true),
  ('posting_rules.manage', 'Manage posting rules', 'accounting', 'Configure source-event account mappings.', true)
on conflict (code) do update
set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  is_sensitive = excluded.is_sensitive;

insert into public.app_role_permissions (role_id, permission_code)
select role.id, permission.code
from public.app_roles role
cross join public.app_permissions permission
where role.company_id is null
  and role.code in ('owner', 'super_administrator', 'company_administrator')
  and permission.code in (
    'accounting.read', 'accounts.manage', 'journal.create', 'journal.post',
    'journal.reverse', 'accounting_period.manage', 'accounting_period.reopen',
    'posting_rules.manage'
  )
on conflict do nothing;

with grants(role_code, permission_code) as (
  values
    ('accountant', 'accounting.read'),
    ('accountant', 'journal.create'),
    ('accountant', 'journal.post'),
    ('senior_accountant', 'accounting.read'),
    ('senior_accountant', 'accounts.manage'),
    ('senior_accountant', 'journal.create'),
    ('senior_accountant', 'journal.post'),
    ('senior_accountant', 'journal.reverse'),
    ('senior_accountant', 'accounting_period.manage'),
    ('senior_accountant', 'accounting_period.reopen'),
    ('senior_accountant', 'posting_rules.manage'),
    ('auditor', 'accounting.read'),
    ('read_only', 'accounting.read')
)
insert into public.app_role_permissions (role_id, permission_code)
select role.id, grants.permission_code
from grants
join public.app_roles role
  on role.company_id is null
  and role.code = grants.role_code
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Chart templates and company chart of accounts
-- ---------------------------------------------------------------------------

create table if not exists public.accounting_account_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  jurisdiction text not null default 'XK',
  version integer not null default 1 check (version > 0),
  description text,
  requires_compliance_review boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.accounting_account_template_lines (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.accounting_account_templates(id) on delete cascade,
  account_code text not null,
  account_name text not null,
  account_type text not null check (account_type in ('asset', 'liability', 'equity', 'revenue', 'expense', 'contra_asset', 'contra_revenue')),
  normal_balance text not null check (normal_balance in ('debit', 'credit')),
  parent_code text,
  posting_allowed boolean not null default true,
  statement_mapping text,
  tax_mapping text,
  sort_order integer not null default 0,
  unique (template_id, account_code)
);

insert into public.accounting_account_templates (
  code, name, jurisdiction, version, description, requires_compliance_review
)
values (
  'xk-operix-base-v1',
  'OperiX Kosovo-oriented base chart',
  'XK',
  1,
  'A conservative starter chart. A licensed Kosovo accountant must review company-specific mappings before production posting.',
  true
)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  requires_compliance_review = excluded.requires_compliance_review;

with template as (
  select id from public.accounting_account_templates where code = 'xk-operix-base-v1'
)
insert into public.accounting_account_template_lines (
  template_id, account_code, account_name, account_type, normal_balance,
  parent_code, posting_allowed, statement_mapping, tax_mapping, sort_order
)
select template.id, item.*
from template
cross join (
  values
    ('1000', 'Assets', 'asset', 'debit', null, false, 'balance_sheet.current_assets', null, 1000),
    ('1010', 'Cash on hand', 'asset', 'debit', '1000', true, 'balance_sheet.cash', null, 1010),
    ('1020', 'Bank accounts', 'asset', 'debit', '1000', true, 'balance_sheet.cash', null, 1020),
    ('1100', 'Trade receivables', 'asset', 'debit', '1000', true, 'balance_sheet.receivables', null, 1100),
    ('1200', 'Inventory', 'asset', 'debit', '1000', true, 'balance_sheet.inventory', null, 1200),
    ('1300', 'Input VAT receivable', 'asset', 'debit', '1000', true, 'balance_sheet.tax_receivable', 'input_vat', 1300),
    ('1500', 'Fixed assets', 'asset', 'debit', null, true, 'balance_sheet.fixed_assets', null, 1500),
    ('1590', 'Accumulated depreciation', 'contra_asset', 'credit', null, true, 'balance_sheet.accumulated_depreciation', null, 1590),
    ('2000', 'Liabilities', 'liability', 'credit', null, false, 'balance_sheet.liabilities', null, 2000),
    ('2010', 'Trade payables', 'liability', 'credit', '2000', true, 'balance_sheet.payables', null, 2010),
    ('2100', 'Output VAT payable', 'liability', 'credit', '2000', true, 'balance_sheet.tax_payable', 'output_vat', 2100),
    ('2200', 'Payroll liabilities', 'liability', 'credit', '2000', true, 'balance_sheet.payroll_liabilities', null, 2200),
    ('2210', 'Salary payable', 'liability', 'credit', '2200', true, 'balance_sheet.salary_payable', null, 2210),
    ('2220', 'Pension payable', 'liability', 'credit', '2200', true, 'balance_sheet.pension_payable', null, 2220),
    ('2230', 'Employee tax payable', 'liability', 'credit', '2200', true, 'balance_sheet.tax_payable', null, 2230),
    ('3000', 'Owner equity', 'equity', 'credit', null, true, 'balance_sheet.equity', null, 3000),
    ('3100', 'Retained earnings', 'equity', 'credit', null, true, 'balance_sheet.retained_earnings', null, 3100),
    ('4000', 'Sales revenue', 'revenue', 'credit', null, true, 'profit_loss.revenue', 'sales', 4000),
    ('4100', 'Service revenue', 'revenue', 'credit', null, true, 'profit_loss.revenue', 'sales', 4100),
    ('4900', 'Sales returns and allowances', 'contra_revenue', 'debit', null, true, 'profit_loss.revenue_adjustments', 'credit_note', 4900),
    ('5000', 'Cost of goods sold', 'expense', 'debit', null, true, 'profit_loss.cost_of_sales', null, 5000),
    ('6000', 'Operating expenses', 'expense', 'debit', null, false, 'profit_loss.operating_expenses', null, 6000),
    ('6010', 'General operating expense', 'expense', 'debit', '6000', true, 'profit_loss.operating_expenses', null, 6010),
    ('6100', 'Payroll expense', 'expense', 'debit', '6000', true, 'profit_loss.payroll', null, 6100),
    ('6110', 'Employer pension expense', 'expense', 'debit', '6000', true, 'profit_loss.payroll', null, 6110),
    ('6200', 'Depreciation expense', 'expense', 'debit', '6000', true, 'profit_loss.depreciation', null, 6200),
    ('6300', 'Bank fees', 'expense', 'debit', '6000', true, 'profit_loss.finance_costs', null, 6300)
) as item(
  account_code, account_name, account_type, normal_balance, parent_code,
  posting_allowed, statement_mapping, tax_mapping, sort_order
)
on conflict (template_id, account_code) do update
set
  account_name = excluded.account_name,
  account_type = excluded.account_type,
  normal_balance = excluded.normal_balance,
  parent_code = excluded.parent_code,
  posting_allowed = excluded.posting_allowed,
  statement_mapping = excluded.statement_mapping,
  tax_mapping = excluded.tax_mapping,
  sort_order = excluded.sort_order;

create table if not exists public.chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  code text not null,
  name text not null,
  account_type text not null check (account_type in ('asset', 'liability', 'equity', 'revenue', 'expense', 'contra_asset', 'contra_revenue')),
  parent_account_id uuid references public.chart_of_accounts(id) on delete restrict,
  normal_balance text not null check (normal_balance in ('debit', 'credit')),
  active boolean not null default true,
  posting_allowed boolean not null default true,
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  tax_mapping text,
  statement_mapping text,
  template_line_id uuid references public.accounting_account_template_lines(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (company_id, code)
);

create index if not exists chart_of_accounts_company_type_idx
  on public.chart_of_accounts (company_id, account_type, active);
create index if not exists chart_of_accounts_parent_idx
  on public.chart_of_accounts (parent_account_id);

create or replace function private.validate_account_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_company uuid;
begin
  if new.parent_account_id is null then
    return new;
  end if;
  if new.parent_account_id = new.id then
    raise exception 'An account cannot be its own parent' using errcode = '23514';
  end if;
  select company_id into parent_company
  from public.chart_of_accounts
  where id = new.parent_account_id;
  if parent_company is distinct from new.company_id then
    raise exception 'Parent account must belong to the same company' using errcode = '23514';
  end if;
  return new;
end
$$;

drop trigger if exists chart_of_accounts_validate_parent on public.chart_of_accounts;
create trigger chart_of_accounts_validate_parent
before insert or update on public.chart_of_accounts
for each row execute function private.validate_account_parent();

-- ---------------------------------------------------------------------------
-- Fiscal years and periods
-- ---------------------------------------------------------------------------

create table if not exists public.accounting_fiscal_years (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  name text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'open' check (status in ('open', 'closed', 'locked')),
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  locked_at timestamptz,
  locked_by uuid references auth.users(id) on delete set null,
  reopened_at timestamptz,
  reopened_by uuid references auth.users(id) on delete set null,
  reopen_reason text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  check (end_date >= start_date),
  unique (company_id, start_date, end_date)
);

create table if not exists public.accounting_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  fiscal_year_id uuid not null references public.accounting_fiscal_years(id) on delete restrict,
  period_number smallint not null check (period_number between 1 and 53),
  name text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'open' check (status in ('open', 'closed', 'locked')),
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  locked_at timestamptz,
  locked_by uuid references auth.users(id) on delete set null,
  reopened_at timestamptz,
  reopened_by uuid references auth.users(id) on delete set null,
  reopen_reason text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  check (end_date >= start_date),
  unique (fiscal_year_id, period_number)
);

create index if not exists accounting_periods_company_dates_idx
  on public.accounting_periods (company_id, start_date, end_date);

create or replace function private.validate_accounting_period()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  year_row public.accounting_fiscal_years%rowtype;
begin
  select * into year_row
  from public.accounting_fiscal_years
  where id = new.fiscal_year_id;

  if not found or year_row.company_id <> new.company_id then
    raise exception 'Fiscal year must belong to the same company' using errcode = '23514';
  end if;
  if new.start_date < year_row.start_date or new.end_date > year_row.end_date then
    raise exception 'Accounting period must be inside its fiscal year' using errcode = '23514';
  end if;
  if exists (
    select 1
    from public.accounting_periods period
    where period.company_id = new.company_id
      and period.id <> new.id
      and daterange(period.start_date, period.end_date, '[]')
          && daterange(new.start_date, new.end_date, '[]')
  ) then
    raise exception 'Accounting periods cannot overlap' using errcode = '23P01';
  end if;
  return new;
end
$$;

drop trigger if exists accounting_periods_validate on public.accounting_periods;
create trigger accounting_periods_validate
before insert or update on public.accounting_periods
for each row execute function private.validate_accounting_period();

create or replace function private.protect_accounting_period_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
    and current_setting('app.accounting_period_workflow', true) <> 'authorized' then
    raise exception 'Accounting period status changes must use the controlled workflow'
      using errcode = '55000';
  end if;
  return new;
end
$$;

drop trigger if exists accounting_periods_protect_status on public.accounting_periods;
create trigger accounting_periods_protect_status
before update on public.accounting_periods
for each row execute function private.protect_accounting_period_status();

-- ---------------------------------------------------------------------------
-- Dimensions and journals
-- ---------------------------------------------------------------------------

create table if not exists public.accounting_cost_centres (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  code text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (company_id, code)
);

create table if not exists public.accounting_projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  code text not null,
  name text not null,
  start_date date,
  end_date date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  check (end_date is null or start_date is null or end_date >= start_date),
  unique (company_id, code)
);

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete restrict,
  period_id uuid references public.accounting_periods(id) on delete restrict,
  entry_number text not null,
  status text not null default 'draft' check (status in ('draft', 'posted', 'reversed')),
  entry_type text not null default 'manual' check (entry_type in ('manual', 'automatic', 'opening', 'closing', 'adjustment', 'reversal', 'recurring')),
  posting_date date not null,
  document_date date not null,
  description text not null,
  reference text,
  source_type text,
  source_id uuid,
  source_key text,
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  exchange_rate numeric(20, 10) not null default 1 check (exchange_rate > 0),
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  reversal_of_id uuid references public.journal_entries(id) on delete restrict,
  reversed_by_id uuid references public.journal_entries(id) on delete restrict,
  posted_at timestamptz,
  posted_by uuid references auth.users(id) on delete set null,
  reversal_reason text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (company_id, entry_number)
);

create unique index if not exists journal_entries_source_unique
  on public.journal_entries (company_id, source_type, source_id)
  where source_type is not null and source_id is not null and entry_type = 'automatic';
create index if not exists journal_entries_company_posting_idx
  on public.journal_entries (company_id, posting_date desc, status);
create index if not exists journal_entries_period_idx
  on public.journal_entries (period_id, status);

create table if not exists public.journal_entry_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references public.journal_entries(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete restrict,
  line_number integer not null check (line_number > 0),
  account_id uuid not null references public.chart_of_accounts(id) on delete restrict,
  description text,
  debit numeric(20, 4) not null default 0 check (debit >= 0),
  credit numeric(20, 4) not null default 0 check (credit >= 0),
  transaction_currency text not null default 'EUR' check (transaction_currency ~ '^[A-Z]{3}$'),
  transaction_amount numeric(20, 4),
  exchange_rate numeric(20, 10) not null default 1 check (exchange_rate > 0),
  cost_centre_id uuid references public.accounting_cost_centres(id) on delete restrict,
  project_id uuid references public.accounting_projects(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete restrict,
  tax_code text,
  tax_base numeric(20, 4),
  tax_amount numeric(20, 4),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  check (
    (debit > 0 and credit = 0)
    or (credit > 0 and debit = 0)
  ),
  unique (journal_entry_id, line_number)
);

create index if not exists journal_entry_lines_account_idx
  on public.journal_entry_lines (account_id, journal_entry_id);
create index if not exists journal_entry_lines_company_idx
  on public.journal_entry_lines (company_id);

create or replace function private.validate_journal_line()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  entry_row public.journal_entries%rowtype;
  account_row public.chart_of_accounts%rowtype;
  dimension_company uuid;
begin
  select * into entry_row from public.journal_entries where id = new.journal_entry_id;
  if not found or entry_row.company_id <> new.company_id then
    raise exception 'Journal line company must match its entry' using errcode = '23514';
  end if;
  if entry_row.status <> 'draft' then
    raise exception 'Only draft journal entries may be changed' using errcode = '55000';
  end if;

  select * into account_row from public.chart_of_accounts where id = new.account_id;
  if not found or account_row.company_id <> new.company_id then
    raise exception 'Journal account must belong to the same company' using errcode = '23514';
  end if;
  if not account_row.active or not account_row.posting_allowed then
    raise exception 'Journal account is inactive or does not allow posting' using errcode = '23514';
  end if;

  if new.cost_centre_id is not null then
    select company_id into dimension_company from public.accounting_cost_centres where id = new.cost_centre_id;
    if dimension_company is distinct from new.company_id then
      raise exception 'Cost centre must belong to the same company' using errcode = '23514';
    end if;
  end if;
  if new.project_id is not null then
    select company_id into dimension_company from public.accounting_projects where id = new.project_id;
    if dimension_company is distinct from new.company_id then
      raise exception 'Project must belong to the same company' using errcode = '23514';
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists journal_entry_lines_validate on public.journal_entry_lines;
create trigger journal_entry_lines_validate
before insert or update on public.journal_entry_lines
for each row execute function private.validate_journal_line();

create or replace function private.protect_posted_journal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('posted', 'reversed')
    and current_setting('app.financial_workflow', true) <> 'authorized' then
    raise exception 'Posted journal entries are immutable; use reversal or adjustment'
      using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

drop trigger if exists journal_entries_protect_posted on public.journal_entries;
create trigger journal_entries_protect_posted
before update or delete on public.journal_entries
for each row execute function private.protect_posted_journal();

create or replace function private.protect_posted_journal_line()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  entry_status text;
begin
  select status into entry_status
  from public.journal_entries
  where id = coalesce(new.journal_entry_id, old.journal_entry_id);
  if entry_status in ('posted', 'reversed')
    and current_setting('app.financial_workflow', true) <> 'authorized' then
    raise exception 'Lines of posted journal entries are immutable'
      using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

drop trigger if exists journal_entry_lines_protect_posted on public.journal_entry_lines;
create trigger journal_entry_lines_protect_posted
before update or delete on public.journal_entry_lines
for each row execute function private.protect_posted_journal_line();

-- ---------------------------------------------------------------------------
-- Recurring journals and configurable posting rules
-- ---------------------------------------------------------------------------

create table if not exists public.recurring_journal_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  code text not null,
  name text not null,
  description text,
  frequency text not null check (frequency in ('weekly', 'monthly', 'quarterly', 'yearly')),
  next_run_date date not null,
  end_date date,
  active boolean not null default true,
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (company_id, code)
);

create table if not exists public.recurring_journal_template_lines (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.recurring_journal_templates(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete restrict,
  line_number integer not null check (line_number > 0),
  account_id uuid not null references public.chart_of_accounts(id) on delete restrict,
  description text,
  debit numeric(20, 4) not null default 0 check (debit >= 0),
  credit numeric(20, 4) not null default 0 check (credit >= 0),
  cost_centre_id uuid references public.accounting_cost_centres(id) on delete restrict,
  project_id uuid references public.accounting_projects(id) on delete restrict,
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0)),
  unique (template_id, line_number)
);

create table if not exists public.posting_rule_sets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  event_type text not null check (event_type in (
    'sales_invoice', 'purchase_invoice', 'customer_payment', 'supplier_payment',
    'cash_sale', 'pos_sale', 'credit_note', 'stock_purchase', 'cost_of_goods_sold',
    'payroll', 'tax', 'fixed_asset_depreciation', 'bank_fee', 'expense_reimbursement'
  )),
  name text not null,
  version integer not null default 1 check (version > 0),
  effective_from date not null,
  effective_until date,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  check (effective_until is null or effective_until >= effective_from),
  unique (company_id, event_type, version)
);

create table if not exists public.posting_rule_lines (
  id uuid primary key default gen_random_uuid(),
  rule_set_id uuid not null references public.posting_rule_sets(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete restrict,
  line_number integer not null check (line_number > 0),
  account_id uuid not null references public.chart_of_accounts(id) on delete restrict,
  amount_component text not null check (amount_component in (
    'gross', 'net', 'tax', 'cost', 'inventory', 'discount', 'employer_cost',
    'employee_tax', 'employee_pension', 'employer_pension', 'net_pay', 'custom'
  )),
  side text not null check (side in ('debit', 'credit')),
  description_template text,
  condition jsonb not null default '{}'::jsonb check (jsonb_typeof(condition) = 'object'),
  cost_centre_id uuid references public.accounting_cost_centres(id) on delete restrict,
  project_id uuid references public.accounting_projects(id) on delete restrict,
  unique (rule_set_id, line_number)
);

create index if not exists posting_rule_sets_effective_idx
  on public.posting_rule_sets (company_id, event_type, effective_from desc)
  where active;

create or replace function private.validate_company_owned_relation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  owner_company uuid;
begin
  if tg_table_name = 'recurring_journal_template_lines' then
    select company_id into owner_company from public.recurring_journal_templates where id = new.template_id;
  elsif tg_table_name = 'posting_rule_lines' then
    select company_id into owner_company from public.posting_rule_sets where id = new.rule_set_id;
  end if;
  if owner_company is distinct from new.company_id then
    raise exception 'Related record must belong to the same company' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.chart_of_accounts account
    where account.id = new.account_id
      and account.company_id <> new.company_id
  ) then
    raise exception 'Account must belong to the same company' using errcode = '23514';
  end if;
  return new;
end
$$;

drop trigger if exists recurring_journal_lines_validate_company on public.recurring_journal_template_lines;
create trigger recurring_journal_lines_validate_company
before insert or update on public.recurring_journal_template_lines
for each row execute function private.validate_company_owned_relation();

drop trigger if exists posting_rule_lines_validate_company on public.posting_rule_lines;
create trigger posting_rule_lines_validate_company
before insert or update on public.posting_rule_lines
for each row execute function private.validate_company_owned_relation();

-- ---------------------------------------------------------------------------
-- Initialization and controlled workflows
-- ---------------------------------------------------------------------------

create or replace function private.seed_default_posting_rules(
  p_company_id uuid,
  p_effective_from date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.posting_rule_sets (
    company_id, event_type, name, version, effective_from, active, metadata,
    created_by, updated_by
  )
  select p_company_id, seed.event_type, seed.name, 1, p_effective_from, true,
    jsonb_build_object('source', 'xk-operix-base-v1', 'compliance_status', 'requires_professional_review'),
    (select auth.uid()), (select auth.uid())
  from (values
    ('sales_invoice', 'Sales invoice'), ('purchase_invoice', 'Purchase invoice'),
    ('customer_payment', 'Customer payment'), ('supplier_payment', 'Supplier payment'),
    ('cash_sale', 'Cash sale'), ('pos_sale', 'POS sale'),
    ('credit_note', 'Sales credit note'), ('stock_purchase', 'Stock purchase'),
    ('cost_of_goods_sold', 'Cost of goods sold'), ('payroll', 'Payroll'),
    ('tax', 'Tax payment'), ('fixed_asset_depreciation', 'Fixed-asset depreciation'),
    ('bank_fee', 'Bank fee'), ('expense_reimbursement', 'Expense reimbursement')
  ) as seed(event_type, name)
  on conflict (company_id, event_type, version) do update
  set name = excluded.name, updated_at = clock_timestamp(), updated_by = excluded.updated_by;

  insert into public.posting_rule_lines (
    rule_set_id, company_id, line_number, account_id, amount_component, side,
    description_template
  )
  select rule_set.id, p_company_id, seed.line_number, account.id,
    seed.amount_component, seed.side, seed.description
  from (values
    ('sales_invoice',1,'1100','gross','debit','Customer receivable'), ('sales_invoice',2,'4000','net','credit','Sales revenue'), ('sales_invoice',3,'2100','tax','credit','Output VAT'),
    ('purchase_invoice',1,'6010','net','debit','Purchase expense'), ('purchase_invoice',2,'1300','tax','debit','Input VAT'), ('purchase_invoice',3,'2010','gross','credit','Supplier payable'),
    ('customer_payment',1,'1020','gross','debit','Bank receipt'), ('customer_payment',2,'1100','gross','credit','Customer receivable'),
    ('supplier_payment',1,'2010','gross','debit','Supplier payable'), ('supplier_payment',2,'1020','gross','credit','Bank payment'),
    ('cash_sale',1,'1010','gross','debit','Cash receipt'), ('cash_sale',2,'4000','net','credit','Sales revenue'), ('cash_sale',3,'2100','tax','credit','Output VAT'),
    ('pos_sale',1,'1010','gross','debit','POS receipt'), ('pos_sale',2,'4000','net','credit','POS sales revenue'), ('pos_sale',3,'2100','tax','credit','Output VAT'),
    ('credit_note',1,'4900','net','debit','Sales return'), ('credit_note',2,'2100','tax','debit','Output VAT adjustment'), ('credit_note',3,'1100','gross','credit','Customer receivable adjustment'),
    ('stock_purchase',1,'1200','net','debit','Inventory received'), ('stock_purchase',2,'1300','tax','debit','Input VAT'), ('stock_purchase',3,'2010','gross','credit','Supplier payable'),
    ('cost_of_goods_sold',1,'5000','cost','debit','Cost of goods sold'), ('cost_of_goods_sold',2,'1200','cost','credit','Inventory issued'),
    ('payroll',1,'6100','gross','debit','Gross payroll expense'), ('payroll',2,'6110','employer_pension','debit','Employer pension expense'),
    ('payroll',3,'2230','employee_tax','credit','Employee tax payable'), ('payroll',4,'2220','employee_pension','credit','Employee pension payable'),
    ('payroll',5,'2220','employer_pension','credit','Employer pension payable'), ('payroll',6,'2210','net_pay','credit','Net salaries payable'),
    ('tax',1,'2100','gross','debit','Tax liability settled'), ('tax',2,'1020','gross','credit','Tax payment'),
    ('fixed_asset_depreciation',1,'6200','gross','debit','Depreciation expense'), ('fixed_asset_depreciation',2,'1590','gross','credit','Accumulated depreciation'),
    ('bank_fee',1,'6300','gross','debit','Bank fee expense'), ('bank_fee',2,'1020','gross','credit','Bank fee payment'),
    ('expense_reimbursement',1,'6010','gross','debit','Expense reimbursement'), ('expense_reimbursement',2,'1020','gross','credit','Reimbursement payment')
  ) as seed(event_type, line_number, account_code, amount_component, side, description)
  join public.posting_rule_sets rule_set on rule_set.company_id=p_company_id and rule_set.event_type=seed.event_type and rule_set.version=1
  join public.chart_of_accounts account on account.company_id=p_company_id and account.code=seed.account_code
  on conflict (rule_set_id, line_number) do update set
    account_id=excluded.account_id, amount_component=excluded.amount_component,
    side=excluded.side, description_template=excluded.description_template;
end
$$;

create or replace function public.initialize_company_accounting(
  p_company_id uuid,
  p_fiscal_year_start date default date_trunc('year', current_date)::date,
  p_template_code text default 'xk-operix-base-v1'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_template_id uuid;
  v_fiscal_year_id uuid;
  period_start date;
  period_end date;
  v_period_number integer;
  created_accounts integer := 0;
begin
  if not (select private.has_company_permission(p_company_id, 'accounts.manage')) then
    raise exception 'Insufficient permission to initialize accounting' using errcode = '42501';
  end if;
  if p_fiscal_year_start is null then
    raise exception 'Fiscal year start is required' using errcode = '22004';
  end if;

  select id into v_template_id
  from public.accounting_account_templates
  where code = p_template_code and active;
  if v_template_id is null then
    raise exception 'Accounting template not found' using errcode = 'P0002';
  end if;

  insert into public.chart_of_accounts (
    company_id, code, name, account_type, normal_balance, posting_allowed,
    currency, tax_mapping, statement_mapping, template_line_id, created_by, updated_by
  )
  select
    p_company_id, line.account_code, line.account_name, line.account_type,
    line.normal_balance, line.posting_allowed, 'EUR', line.tax_mapping,
    line.statement_mapping, line.id, (select auth.uid()), (select auth.uid())
  from public.accounting_account_template_lines line
  where line.template_id = v_template_id
  on conflict (company_id, code) do nothing;
  get diagnostics created_accounts = row_count;

  update public.chart_of_accounts account
  set parent_account_id = parent.id
  from public.accounting_account_template_lines line
  join public.accounting_account_template_lines parent_line
    on parent_line.template_id = line.template_id
   and parent_line.account_code = line.parent_code
  join public.chart_of_accounts parent
    on parent.company_id = p_company_id
   and parent.code = parent_line.account_code
  where account.company_id = p_company_id
    and account.template_line_id = line.id
    and line.template_id = v_template_id
    and line.parent_code is not null
    and account.parent_account_id is distinct from parent.id;

  insert into public.accounting_fiscal_years (
    company_id, name, start_date, end_date, created_by, updated_by
  )
  values (
    p_company_id,
    extract(year from p_fiscal_year_start)::text,
    p_fiscal_year_start,
    (p_fiscal_year_start + interval '1 year - 1 day')::date,
    (select auth.uid()),
    (select auth.uid())
  )
  on conflict (company_id, start_date, end_date)
  do update set name = excluded.name
  returning id into v_fiscal_year_id;

  for v_period_number in 1..12 loop
    period_start := (p_fiscal_year_start + make_interval(months => v_period_number - 1))::date;
    period_end := (p_fiscal_year_start + make_interval(months => v_period_number) - interval '1 day')::date;
    insert into public.accounting_periods (
      company_id, fiscal_year_id, period_number, name, start_date, end_date,
      created_by, updated_by
    )
    values (
      p_company_id, v_fiscal_year_id, v_period_number,
      to_char(period_start, 'YYYY-MM'), period_start, period_end,
      (select auth.uid()), (select auth.uid())
    )
    on conflict (fiscal_year_id, period_number) do nothing;
  end loop;

  perform private.seed_default_posting_rules(p_company_id, p_fiscal_year_start);

  return jsonb_build_object(
    'template', p_template_code,
    'accounts_created', created_accounts,
    'fiscal_year_id', v_fiscal_year_id
  );
end
$$;

create or replace function private.next_journal_number(p_company_id uuid, p_posting_date date)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_number bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':journal:' || extract(year from p_posting_date)::text, 0));
  select coalesce(max(
    nullif(regexp_replace(entry_number, '^JE-[0-9]{4}-', ''), '')::bigint
  ), 0) + 1
  into next_number
  from public.journal_entries
  where company_id = p_company_id
    and entry_number like 'JE-' || extract(year from p_posting_date)::text || '-%'
    and entry_number ~ '^JE-[0-9]{4}-[0-9]+$';
  return 'JE-' || extract(year from p_posting_date)::text || '-' || lpad(next_number::text, 6, '0');
end
$$;

create or replace function public.create_journal_entry(
  p_company_id uuid,
  p_posting_date date,
  p_document_date date,
  p_description text,
  p_reference text default null,
  p_currency text default 'EUR',
  p_exchange_rate numeric default 1,
  p_branch_id uuid default null,
  p_entry_type text default 'manual'
)
returns public.journal_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  created public.journal_entries;
begin
  if not (select private.has_company_permission(p_company_id, 'journal.create')) then
    raise exception 'Insufficient permission to create journals' using errcode = '42501';
  end if;
  if trim(coalesce(p_description, '')) = '' then
    raise exception 'Journal description is required' using errcode = '23514';
  end if;
  insert into public.journal_entries (
    company_id, branch_id, entry_number, entry_type, posting_date, document_date,
    description, reference, currency, exchange_rate, created_by, updated_by
  )
  values (
    p_company_id, p_branch_id, private.next_journal_number(p_company_id, p_posting_date),
    p_entry_type, p_posting_date, p_document_date, trim(p_description), p_reference,
    upper(p_currency), p_exchange_rate, (select auth.uid()), (select auth.uid())
  )
  returning * into created;
  return created;
end
$$;

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
  for update;
  if not found then
    raise exception 'Posting date is not covered by an accounting period' using errcode = '23514';
  end if;
  if period_row.status <> 'open' then
    raise exception 'Posting is not allowed in a closed or locked period' using errcode = '55000';
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
  perform set_config('app.change_reason', coalesce(nullif(trim(coalesce(p_reason, '')), ''), ''), true);
  update public.journal_entries
  set
    status = 'posted',
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

create or replace function public.reverse_journal_entry(
  p_journal_entry_id uuid,
  p_reversal_date date,
  p_reason text
)
returns public.journal_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  original public.journal_entries;
  reversal public.journal_entries;
begin
  select * into original
  from public.journal_entries
  where id = p_journal_entry_id
  for update;
  if not found then
    raise exception 'Journal entry not found' using errcode = 'P0002';
  end if;
  if not (select private.has_company_permission(original.company_id, 'journal.reverse')) then
    raise exception 'Insufficient permission to reverse journals' using errcode = '42501';
  end if;
  if original.status <> 'posted' then
    raise exception 'Only posted journals may be reversed' using errcode = '55000';
  end if;
  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'A reversal reason is required' using errcode = '23514';
  end if;

  insert into public.journal_entries (
    company_id, branch_id, entry_number, status, entry_type, posting_date,
    document_date, description, reference, source_type, source_id, source_key,
    currency, exchange_rate, metadata, reversal_of_id, reversal_reason,
    created_by, updated_by
  )
  values (
    original.company_id, original.branch_id,
    private.next_journal_number(original.company_id, p_reversal_date),
    'draft', 'reversal', p_reversal_date, p_reversal_date,
    'Reversal: ' || original.description, original.entry_number,
    'journal_reversal', original.id, original.entry_number,
    original.currency, original.exchange_rate, original.metadata,
    original.id, trim(p_reason), (select auth.uid()), (select auth.uid())
  )
  returning * into reversal;

  insert into public.journal_entry_lines (
    journal_entry_id, company_id, line_number, account_id, description,
    debit, credit, transaction_currency, transaction_amount, exchange_rate,
    cost_centre_id, project_id, branch_id, tax_code, tax_base, tax_amount,
    metadata, created_by
  )
  select
    reversal.id, line.company_id, line.line_number, line.account_id,
    coalesce(line.description, original.description),
    line.credit, line.debit, line.transaction_currency,
    case when line.transaction_amount is null then null else -line.transaction_amount end,
    line.exchange_rate, line.cost_centre_id, line.project_id, line.branch_id,
    line.tax_code, line.tax_base,
    case when line.tax_amount is null then null else -line.tax_amount end,
    line.metadata, (select auth.uid())
  from public.journal_entry_lines line
  where line.journal_entry_id = original.id
  order by line.line_number;

  reversal := public.post_journal_entry(reversal.id, trim(p_reason));
  perform set_config('app.financial_workflow', 'authorized', true);
  perform set_config('app.change_reason', trim(p_reason), true);
  update public.journal_entries
  set
    status = 'reversed',
    reversed_by_id = reversal.id,
    updated_at = clock_timestamp(),
    updated_by = (select auth.uid())
  where id = original.id;
  perform set_config('app.financial_workflow', '', true);
  perform set_config('app.change_reason', '', true);
  return reversal;
end
$$;

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
  if p_status not in ('open', 'closed', 'locked') then
    raise exception 'Invalid accounting period status' using errcode = '22023';
  end if;
  if p_status = 'open' and period_row.status in ('closed', 'locked') then
    if not (select private.has_company_permission(period_row.company_id, 'accounting_period.reopen')) then
      raise exception 'Insufficient permission to reopen accounting periods' using errcode = '42501';
    end if;
    if trim(coalesce(p_reason, '')) = '' then
      raise exception 'A reason is required to reopen a period' using errcode = '23514';
    end if;
  elsif not (select private.has_company_permission(period_row.company_id, 'accounting_period.manage')) then
    raise exception 'Insufficient permission to manage accounting periods' using errcode = '42501';
  end if;

  perform set_config('app.accounting_period_workflow', 'authorized', true);
  perform set_config('app.change_reason', coalesce(nullif(trim(coalesce(p_reason, '')), ''), ''), true);
  update public.accounting_periods
  set
    status = p_status,
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

create or replace function public.generate_recurring_journal(
  p_template_id uuid,
  p_posting_date date default current_date
)
returns public.journal_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  template_row public.recurring_journal_templates;
  entry_row public.journal_entries;
begin
  select * into template_row
  from public.recurring_journal_templates
  where id = p_template_id
  for update;
  if not found or not template_row.active then
    raise exception 'Active recurring journal template not found' using errcode = 'P0002';
  end if;
  if not (select private.has_company_permission(template_row.company_id, 'journal.create')) then
    raise exception 'Insufficient permission to generate journals' using errcode = '42501';
  end if;

  entry_row := public.create_journal_entry(
    template_row.company_id, p_posting_date, p_posting_date,
    template_row.name, template_row.code, template_row.currency, 1, null, 'recurring'
  );
  insert into public.journal_entry_lines (
    journal_entry_id, company_id, line_number, account_id, description,
    debit, credit, cost_centre_id, project_id, created_by
  )
  select
    entry_row.id, line.company_id, line.line_number, line.account_id,
    line.description, line.debit, line.credit, line.cost_centre_id,
    line.project_id, (select auth.uid())
  from public.recurring_journal_template_lines line
  where line.template_id = p_template_id
  order by line.line_number;

  update public.recurring_journal_templates
  set
    next_run_date = case frequency
      when 'weekly' then next_run_date + 7
      when 'monthly' then (next_run_date + interval '1 month')::date
      when 'quarterly' then (next_run_date + interval '3 months')::date
      else (next_run_date + interval '1 year')::date
    end,
    updated_at = clock_timestamp(),
    updated_by = (select auth.uid())
  where id = p_template_id;
  return entry_row;
end
$$;

create or replace function public.create_automatic_journal(
  p_company_id uuid,
  p_event_type text,
  p_source_type text,
  p_source_id uuid,
  p_source_key text,
  p_posting_date date,
  p_document_date date,
  p_description text,
  p_amounts jsonb,
  p_currency text default 'EUR',
  p_branch_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.journal_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  rule_set public.posting_rule_sets;
  entry_row public.journal_entries;
  rule_line record;
  amount_value numeric(20, 4);
  line_counter integer := 0;
begin
  if not (select private.has_company_permission(p_company_id, 'journal.post')) then
    raise exception 'Insufficient permission to create automatic journals' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_amounts, '{}'::jsonb)) <> 'object' then
    raise exception 'Posting amounts must be a JSON object' using errcode = '22023';
  end if;

  select * into rule_set
  from public.posting_rule_sets
  where company_id = p_company_id
    and event_type = p_event_type
    and active
    and effective_from <= p_posting_date
    and (effective_until is null or effective_until >= p_posting_date)
  order by version desc, effective_from desc
  limit 1;
  if not found then
    raise exception 'No effective posting rule exists for event %', p_event_type using errcode = 'P0002';
  end if;

  entry_row := public.create_journal_entry(
    p_company_id, p_posting_date, p_document_date, p_description,
    p_source_key, p_currency, 1, p_branch_id, 'automatic'
  );
  update public.journal_entries
  set
    source_type = p_source_type,
    source_id = p_source_id,
    source_key = p_source_key,
    metadata = coalesce(p_metadata, '{}'::jsonb),
    updated_by = (select auth.uid())
  where id = entry_row.id
  returning * into entry_row;

  for rule_line in
    select *
    from public.posting_rule_lines
    where rule_set_id = rule_set.id
    order by line_number
  loop
    amount_value := round(coalesce((p_amounts ->> rule_line.amount_component)::numeric, 0), 4);
    if amount_value <> 0 then
      line_counter := line_counter + 1;
      insert into public.journal_entry_lines (
        journal_entry_id, company_id, line_number, account_id, description,
        debit, credit, transaction_currency, transaction_amount,
        cost_centre_id, project_id, branch_id, metadata, created_by
      )
      values (
        entry_row.id, p_company_id, line_counter, rule_line.account_id,
        coalesce(rule_line.description_template, p_description),
        case when rule_line.side = 'debit' then abs(amount_value) else 0 end,
        case when rule_line.side = 'credit' then abs(amount_value) else 0 end,
        upper(p_currency), amount_value, rule_line.cost_centre_id,
        rule_line.project_id, p_branch_id, rule_line.condition, (select auth.uid())
      );
    end if;
  end loop;
  return public.post_journal_entry(entry_row.id, 'Automatic posting: ' || p_event_type);
exception
  when unique_violation then
    select * into entry_row
    from public.journal_entries
    where company_id = p_company_id
      and source_type = p_source_type
      and source_id = p_source_id
      and entry_type = 'automatic';
    if found then
      return entry_row;
    end if;
    raise;
end
$$;

-- ---------------------------------------------------------------------------
-- Ledger views (posted entries only)
-- ---------------------------------------------------------------------------

create or replace view public.general_ledger_entries
with (security_invoker = true)
as
select
  entry.company_id,
  entry.id as journal_entry_id,
  entry.entry_number,
  entry.posting_date,
  entry.document_date,
  entry.description as journal_description,
  entry.reference,
  entry.source_type,
  entry.source_id,
  line.id as journal_line_id,
  line.line_number,
  account.id as account_id,
  account.code as account_code,
  account.name as account_name,
  account.account_type,
  line.description,
  line.debit,
  line.credit,
  line.debit - line.credit as signed_amount,
  line.cost_centre_id,
  line.project_id,
  coalesce(line.branch_id, entry.branch_id) as branch_id,
  line.tax_code,
  line.tax_base,
  line.tax_amount
from public.journal_entries entry
join public.journal_entry_lines line on line.journal_entry_id = entry.id
join public.chart_of_accounts account on account.id = line.account_id
where entry.status = 'posted';

create or replace view public.trial_balance
with (security_invoker = true)
as
select
  ledger.company_id,
  ledger.account_id,
  ledger.account_code,
  ledger.account_name,
  ledger.account_type,
  min(ledger.posting_date) as first_posting_date,
  max(ledger.posting_date) as last_posting_date,
  sum(ledger.debit)::numeric(20, 4) as total_debit,
  sum(ledger.credit)::numeric(20, 4) as total_credit,
  sum(ledger.debit - ledger.credit)::numeric(20, 4) as balance
from public.general_ledger_entries ledger
group by
  ledger.company_id, ledger.account_id, ledger.account_code,
  ledger.account_name, ledger.account_type;

-- ---------------------------------------------------------------------------
-- RLS, grants, metadata, and audit
-- ---------------------------------------------------------------------------

alter table public.accounting_account_templates enable row level security;
alter table public.accounting_account_template_lines enable row level security;
alter table public.chart_of_accounts enable row level security;
alter table public.accounting_fiscal_years enable row level security;
alter table public.accounting_periods enable row level security;
alter table public.accounting_cost_centres enable row level security;
alter table public.accounting_projects enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_entry_lines enable row level security;
alter table public.recurring_journal_templates enable row level security;
alter table public.recurring_journal_template_lines enable row level security;
alter table public.posting_rule_sets enable row level security;
alter table public.posting_rule_lines enable row level security;

drop policy if exists accounting_templates_authenticated_read on public.accounting_account_templates;
create policy accounting_templates_authenticated_read
on public.accounting_account_templates for select to authenticated
using (active);
drop policy if exists accounting_template_lines_authenticated_read on public.accounting_account_template_lines;
create policy accounting_template_lines_authenticated_read
on public.accounting_account_template_lines for select to authenticated
using (exists (
  select 1 from public.accounting_account_templates template
  where template.id = template_id and template.active
));

do $$
declare
  item record;
begin
  for item in
    select * from (values
      ('chart_of_accounts', 'accounting.read', 'accounts.manage'),
      ('accounting_fiscal_years', 'accounting.read', 'accounting_period.manage'),
      ('accounting_periods', 'accounting.read', 'accounting_period.manage'),
      ('accounting_cost_centres', 'accounting.read', 'accounts.manage'),
      ('accounting_projects', 'accounting.read', 'accounts.manage'),
      ('journal_entries', 'accounting.read', 'journal.create'),
      ('journal_entry_lines', 'accounting.read', 'journal.create'),
      ('recurring_journal_templates', 'accounting.read', 'journal.create'),
      ('recurring_journal_template_lines', 'accounting.read', 'journal.create'),
      ('posting_rule_sets', 'accounting.read', 'posting_rules.manage'),
      ('posting_rule_lines', 'accounting.read', 'posting_rules.manage')
    ) as policies(table_name, read_permission, write_permission)
  loop
    execute format('drop policy if exists %I_read on public.%I', item.table_name, item.table_name);
    execute format(
      'create policy %I_read on public.%I for select to authenticated using ((select private.has_company_permission(company_id, %L)))',
      item.table_name, item.table_name, item.read_permission
    );
    execute format('drop policy if exists %I_insert on public.%I', item.table_name, item.table_name);
    execute format(
      'create policy %I_insert on public.%I for insert to authenticated with check ((select private.has_company_permission(company_id, %L)))',
      item.table_name, item.table_name, item.write_permission
    );
    execute format('drop policy if exists %I_update on public.%I', item.table_name, item.table_name);
    execute format(
      'create policy %I_update on public.%I for update to authenticated using ((select private.has_company_permission(company_id, %L))) with check ((select private.has_company_permission(company_id, %L)))',
      item.table_name, item.table_name, item.write_permission, item.write_permission
    );
    execute format('drop policy if exists %I_delete on public.%I', item.table_name, item.table_name);
    execute format(
      'create policy %I_delete on public.%I for delete to authenticated using ((select private.has_company_permission(company_id, %L)))',
      item.table_name, item.table_name, item.write_permission
    );
  end loop;
end
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'chart_of_accounts', 'accounting_fiscal_years', 'accounting_periods',
    'accounting_cost_centres', 'accounting_projects', 'journal_entries',
    'recurring_journal_templates', 'posting_rule_sets'
  ]
  loop
    execute format('drop trigger if exists %I_update_metadata on public.%I', table_name, table_name);
    execute format(
      'create trigger %I_update_metadata before update on public.%I for each row execute function private.set_row_update_metadata()',
      table_name, table_name
    );
  end loop;
end
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'chart_of_accounts', 'accounting_fiscal_years', 'accounting_periods',
    'accounting_cost_centres', 'accounting_projects', 'journal_entries',
    'journal_entry_lines', 'recurring_journal_templates',
    'recurring_journal_template_lines', 'posting_rule_sets', 'posting_rule_lines'
  ]
  loop
    execute format('drop trigger if exists %I_audit on public.%I', table_name, table_name);
    execute format(
      'create trigger %I_audit after insert or update or delete on public.%I for each row execute function private.audit_table_change()',
      table_name, table_name
    );
  end loop;
end
$$;

grant select on public.accounting_account_templates, public.accounting_account_template_lines to authenticated;
grant select, insert, update, delete on
  public.chart_of_accounts,
  public.accounting_fiscal_years,
  public.accounting_periods,
  public.accounting_cost_centres,
  public.accounting_projects,
  public.journal_entries,
  public.journal_entry_lines,
  public.recurring_journal_templates,
  public.recurring_journal_template_lines,
  public.posting_rule_sets,
  public.posting_rule_lines
to authenticated;
grant select on public.general_ledger_entries, public.trial_balance to authenticated;

revoke all on function public.initialize_company_accounting(uuid, date, text) from public;
revoke all on function public.create_journal_entry(uuid, date, date, text, text, text, numeric, uuid, text) from public;
revoke all on function public.post_journal_entry(uuid, text) from public;
revoke all on function public.reverse_journal_entry(uuid, date, text) from public;
revoke all on function public.set_accounting_period_status(uuid, text, text) from public;
revoke all on function public.generate_recurring_journal(uuid, date) from public;
revoke all on function public.create_automatic_journal(uuid, text, text, uuid, text, date, date, text, jsonb, text, uuid, jsonb) from public;

grant execute on function public.initialize_company_accounting(uuid, date, text) to authenticated;
grant execute on function public.create_journal_entry(uuid, date, date, text, text, text, numeric, uuid, text) to authenticated;
grant execute on function public.post_journal_entry(uuid, text) to authenticated;
grant execute on function public.reverse_journal_entry(uuid, date, text) to authenticated;
grant execute on function public.set_accounting_period_status(uuid, text, text) to authenticated;
grant execute on function public.generate_recurring_journal(uuid, date) to authenticated;
grant execute on function public.create_automatic_journal(uuid, text, text, uuid, text, date, date, text, jsonb, text, uuid, jsonb) to authenticated;

comment on table public.accounting_account_templates is
  'Versioned starter charts. Kosovo-oriented templates require accountant/compliance review.';
comment on table public.chart_of_accounts is
  'Tenant chart of accounts. Accounts referenced by journals cannot be deleted.';
comment on table public.journal_entries is
  'Double-entry journal headers. Posted records are immutable and corrected by reversal.';
comment on table public.posting_rule_sets is
  'Effective-dated source-event posting configuration; account IDs are data, never application constants.';
comment on view public.general_ledger_entries is
  'Posted journal lines only. Financial statements must be based on this ledger.';
