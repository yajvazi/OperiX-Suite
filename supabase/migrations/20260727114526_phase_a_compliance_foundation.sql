-- OperiX Phase A: Kosovo compliance, audit, company structure, and RBAC foundation.
-- This migration is intentionally additive. Existing tenant, profile, membership,
-- invoice, product, and payment records remain the source of truth.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Company fiscal profile
-- ---------------------------------------------------------------------------

alter table public.companies
  add column if not exists trade_name text,
  add column if not exists unique_business_number text,
  add column if not exists fiscal_number text,
  add column if not exists vat_number text,
  add column if not exists business_activity text,
  add column if not exists registered_address text,
  add column if not exists municipality text,
  add column if not exists country_code text not null default 'XK',
  add column if not exists vat_registration_status text not null default 'not_registered',
  add column if not exists vat_registration_date date,
  add column if not exists fiscal_year_start_month smallint not null default 1,
  add column if not exists fiscal_year_start_day smallint not null default 1,
  add column if not exists accounting_period_frequency text not null default 'monthly',
  add column if not exists default_language text not null default 'sq',
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

update public.companies
set
  fiscal_number = coalesce(fiscal_number, nullif(tax_id, '')),
  registered_address = coalesce(registered_address, nullif(address, '')),
  municipality = coalesce(municipality, nullif(city, '')),
  default_language = case
    when invoice_language in ('en', 'sq', 'sr') then invoice_language
    else default_language
  end
where
  fiscal_number is null
  or registered_address is null
  or municipality is null
  or default_language is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'companies_vat_registration_status_check'
      and conrelid = 'public.companies'::regclass
  ) then
    alter table public.companies
      add constraint companies_vat_registration_status_check
      check (vat_registration_status in ('not_registered', 'registered', 'deregistered'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'companies_fiscal_year_start_month_check'
      and conrelid = 'public.companies'::regclass
  ) then
    alter table public.companies
      add constraint companies_fiscal_year_start_month_check
      check (fiscal_year_start_month between 1 and 12);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'companies_fiscal_year_start_day_check'
      and conrelid = 'public.companies'::regclass
  ) then
    alter table public.companies
      add constraint companies_fiscal_year_start_day_check
      check (fiscal_year_start_day between 1 and 31);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'companies_country_code_check'
      and conrelid = 'public.companies'::regclass
  ) then
    alter table public.companies
      add constraint companies_country_code_check
      check (country_code ~ '^[A-Z]{2}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'companies_default_language_check'
      and conrelid = 'public.companies'::regclass
  ) then
    alter table public.companies
      add constraint companies_default_language_check
      check (default_language in ('sq', 'en', 'sr'));
  end if;
end
$$;

create unique index if not exists companies_unique_business_number_unique
  on public.companies (unique_business_number)
  where unique_business_number is not null and unique_business_number <> '';
create unique index if not exists companies_fiscal_number_unique
  on public.companies (fiscal_number)
  where fiscal_number is not null and fiscal_number <> '';
create unique index if not exists companies_vat_number_unique
  on public.companies (vat_number)
  where vat_number is not null and vat_number <> '';

create table if not exists public.company_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  bank_name text not null,
  account_name text,
  account_number text,
  iban text,
  swift_bic text,
  currency text not null default 'EUR',
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint company_bank_accounts_currency_check
    check (currency ~ '^[A-Z]{3}$'),
  constraint company_bank_accounts_identifier_check
    check (
      nullif(trim(coalesce(account_number, '')), '') is not null
      or nullif(trim(coalesce(iban, '')), '') is not null
    )
);

create unique index if not exists company_bank_accounts_primary_unique
  on public.company_bank_accounts (company_id)
  where is_primary and is_active;
create index if not exists company_bank_accounts_company_idx
  on public.company_bank_accounts (company_id, is_active);

insert into public.company_bank_accounts (
  company_id,
  bank_name,
  account_number,
  iban,
  swift_bic,
  currency,
  is_primary
)
select
  company.id,
  coalesce(nullif(company.bank_name, ''), 'Bank'),
  nullif(company.bank_account, ''),
  nullif(company.bank_iban, ''),
  nullif(company.bank_swift, ''),
  upper(coalesce(nullif(company.currency, ''), 'EUR')),
  true
from public.companies company
where
  (nullif(company.bank_account, '') is not null or nullif(company.bank_iban, '') is not null)
  and not exists (
    select 1
    from public.company_bank_accounts account
    where account.company_id = company.id
  );

-- ---------------------------------------------------------------------------
-- Branches, warehouses, fiscal locations, and terminals
-- ---------------------------------------------------------------------------

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  registered_address text,
  municipality text,
  country_code text not null default 'XK',
  phone text,
  email text,
  is_head_office boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (company_id, code)
);

create unique index if not exists branches_head_office_unique
  on public.branches (company_id)
  where is_head_office and is_active;
create index if not exists branches_company_idx
  on public.branches (company_id, is_active);

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  code text not null,
  name text not null,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (company_id, code)
);

create index if not exists warehouses_company_idx
  on public.warehouses (company_id, branch_id, is_active);

create table if not exists public.fiscal_locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  code text not null,
  name text not null,
  external_identifier text,
  status text not null default 'draft',
  provider_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (company_id, code),
  constraint fiscal_locations_status_check
    check (status in ('draft', 'active', 'inactive', 'pending_registration'))
);

create index if not exists fiscal_locations_company_idx
  on public.fiscal_locations (company_id, branch_id, status);

create table if not exists public.pos_terminals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete restrict,
  fiscal_location_id uuid references public.fiscal_locations(id) on delete set null,
  code text not null,
  name text not null,
  external_identifier text,
  status text not null default 'draft',
  provider_code text,
  device_identifier text,
  metadata jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (company_id, code),
  constraint pos_terminals_status_check
    check (status in ('draft', 'active', 'inactive', 'pending_registration'))
);

create index if not exists pos_terminals_company_idx
  on public.pos_terminals (company_id, branch_id, status);

-- ---------------------------------------------------------------------------
-- Versioned compliance configuration
-- ---------------------------------------------------------------------------

create table if not exists public.compliance_config_sets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  config_type text not null,
  config_key text not null default 'default',
  name text not null,
  jurisdiction text not null default 'XK',
  description text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (company_id, config_type, config_key),
  constraint compliance_config_sets_type_check check (
    config_type in (
      'vat_rates',
      'payroll_tax_brackets',
      'pension_contribution_rates',
      'invoice_numbering',
      'fiscal_receipt_numbering',
      'accounting_periods',
      'tax_reporting_periods',
      'document_retention',
      'payment_methods',
      'credit_note_rules',
      'cancellation_rules',
      'rounding_rules'
    )
  )
);

create table if not exists public.compliance_config_versions (
  id uuid primary key default gen_random_uuid(),
  config_set_id uuid not null references public.compliance_config_sets(id) on delete cascade,
  version integer not null,
  status text not null default 'draft',
  effective_from date not null,
  effective_until date,
  configuration jsonb not null,
  change_reason text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (config_set_id, version),
  constraint compliance_config_versions_status_check
    check (status in ('draft', 'active', 'retired')),
  constraint compliance_config_versions_dates_check
    check (effective_until is null or effective_until >= effective_from),
  constraint compliance_config_versions_payload_check
    check (jsonb_typeof(configuration) = 'object')
);

create index if not exists compliance_config_versions_effective_idx
  on public.compliance_config_versions (
    config_set_id,
    status,
    effective_from,
    effective_until
  );

create or replace function private.prevent_overlapping_compliance_versions()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'active' and exists (
    select 1
    from public.compliance_config_versions existing
    where existing.config_set_id = new.config_set_id
      and existing.status = 'active'
      and existing.id <> new.id
      and daterange(
        existing.effective_from,
        coalesce(existing.effective_until + 1, 'infinity'::date),
        '[)'
      ) && daterange(
        new.effective_from,
        coalesce(new.effective_until + 1, 'infinity'::date),
        '[)'
      )
  ) then
    raise exception 'Active compliance configuration periods cannot overlap'
      using errcode = '23P01';
  end if;
  return new;
end
$$;

drop trigger if exists compliance_versions_no_overlap
  on public.compliance_config_versions;
create trigger compliance_versions_no_overlap
before insert or update on public.compliance_config_versions
for each row execute function private.prevent_overlapping_compliance_versions();

create or replace function private.protect_effective_compliance_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'retired' then
    raise exception 'Retired compliance configuration versions are immutable'
      using errcode = '55000';
  end if;

  if old.status = 'active' and (
    new.config_set_id is distinct from old.config_set_id
    or new.version is distinct from old.version
    or new.effective_from is distinct from old.effective_from
    or new.configuration is distinct from old.configuration
    or new.status not in ('active', 'retired')
  ) then
    raise exception 'Active compliance configuration values are immutable; create a new version'
      using errcode = '55000';
  end if;

  if old.status = 'active'
    and new.status = 'retired'
    and nullif(trim(coalesce(new.change_reason, '')), '') is null
  then
    raise exception 'A reason is required when retiring a compliance configuration version'
      using errcode = '23514';
  end if;

  return new;
end
$$;

drop trigger if exists compliance_versions_protect_effective
  on public.compliance_config_versions;
create trigger compliance_versions_protect_effective
before update on public.compliance_config_versions
for each row execute function private.protect_effective_compliance_version();

create table if not exists public.document_sequences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  document_type text not null,
  prefix text not null default '',
  suffix text not null default '',
  next_value bigint not null default 1,
  padding smallint not null default 6,
  reset_rule text not null default 'calendar_year',
  current_period_key text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint document_sequences_next_value_check check (next_value > 0),
  constraint document_sequences_padding_check check (padding between 1 and 18),
  constraint document_sequences_reset_rule_check
    check (reset_rule in ('never', 'calendar_year', 'fiscal_year', 'monthly'))
);

create unique index if not exists document_sequences_scope_unique
  on public.document_sequences (
    company_id,
    coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
    document_type
  )
  where is_active;

-- Seed neutral operational defaults. VAT values are imported from the existing
-- company setting and explicitly marked for compliance review; this migration
-- does not assert that a rate has been approved by TAK.
insert into public.compliance_config_sets (
  company_id,
  config_type,
  config_key,
  name,
  description
)
select company.id, seed.config_type, 'default', seed.name, seed.description
from public.companies company
cross join (
  values
    ('vat_rates', 'VAT rates', 'Imported from the legacy company tax setting; accountant review required.'),
    ('rounding_rules', 'Rounding rules', 'Default exact-decimal calculation policy.'),
    ('payment_methods', 'Payment methods', 'Enabled payment methods for documents and POS.')
) as seed(config_type, name, description)
on conflict (company_id, config_type, config_key) do nothing;

insert into public.compliance_config_versions (
  config_set_id,
  version,
  status,
  effective_from,
  configuration,
  change_reason
)
select
  config_set.id,
  1,
  'active',
  date '2000-01-01',
  case config_set.config_type
    when 'vat_rates' then jsonb_build_object(
      'rates',
      jsonb_build_array(
        jsonb_build_object(
          'code', 'LEGACY_DEFAULT',
          'name', 'Legacy default VAT',
          'rate', coalesce(company.tax_rate, 0)::text,
          'appliesTo', 'both',
          'deductibilityPercentage', '100',
          'category', 'standard',
          'requiresComplianceReview', true
        )
      )
    )
    when 'rounding_rules' then jsonb_build_object(
      'monetaryScale', 2,
      'unitPriceScale', 4,
      'quantityScale', 3,
      'mode', 'half-up',
      'taxRounding', 'per-line'
    )
    else jsonb_build_object(
      'enabled',
      jsonb_build_array('cash', 'card', 'bank_transfer', 'voucher', 'customer_credit', 'mixed')
    )
  end,
  'Created by Phase A migration from existing company settings.'
from public.compliance_config_sets config_set
join public.companies company on company.id = config_set.company_id
where config_set.config_type in ('vat_rates', 'rounding_rules', 'payment_methods')
on conflict (config_set_id, version) do nothing;

-- ---------------------------------------------------------------------------
-- Granular roles and permissions, extending legacy memberships
-- ---------------------------------------------------------------------------

create table if not exists public.app_permissions (
  code text primary key,
  name text not null,
  category text not null,
  description text,
  is_sensitive boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.app_roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create unique index if not exists app_roles_system_code_unique
  on public.app_roles (code)
  where company_id is null;
create unique index if not exists app_roles_company_code_unique
  on public.app_roles (company_id, code)
  where company_id is not null;

create table if not exists public.app_role_permissions (
  role_id uuid not null references public.app_roles(id) on delete cascade,
  permission_code text not null references public.app_permissions(code) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  primary key (role_id, permission_code)
);

create table if not exists public.membership_role_assignments (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships(id) on delete cascade,
  role_id uuid not null references public.app_roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (membership_id, role_id)
);

insert into public.app_permissions (code, name, category, description, is_sensitive)
values
  ('company.read', 'View company', 'company', 'View company and fiscal profile.', false),
  ('company.manage', 'Manage company', 'company', 'Edit company and fiscal profile.', true),
  ('roles.manage', 'Manage roles', 'security', 'Manage roles and permission assignments.', true),
  ('audit.view', 'View audit trail', 'security', 'View append-only audit events.', true),
  ('compliance.read', 'View compliance configuration', 'compliance', 'View effective compliance configuration.', false),
  ('compliance.manage', 'Manage compliance configuration', 'compliance', 'Create and activate compliance versions.', true),
  ('branches.manage', 'Manage branches', 'company', 'Manage branches and fiscal locations.', true),
  ('warehouses.manage', 'Manage warehouses', 'inventory', 'Manage warehouses and locations.', true),
  ('terminals.manage', 'Manage POS terminals', 'fiscal', 'Manage POS and fiscal terminal registration.', true),
  ('invoice.create', 'Create invoice', 'sales', 'Create sales documents.', false),
  ('invoice.approve', 'Approve invoice', 'sales', 'Approve sales documents.', true),
  ('invoice.post', 'Post invoice', 'accounting', 'Post invoice accounting entries.', true),
  ('invoice.cancel', 'Cancel invoice', 'sales', 'Cancel through the permitted workflow.', true),
  ('credit_note.issue', 'Issue credit note', 'sales', 'Issue credit notes against source documents.', true),
  ('costs.view', 'View costs', 'inventory', 'View purchase and inventory costs.', true),
  ('prices.override', 'Override prices', 'sales', 'Override configured selling prices.', true),
  ('discounts.override', 'Override discounts', 'sales', 'Override configured discount limits.', true),
  ('cashier_shift.close', 'Close cashier shift', 'pos', 'Count and close a cashier shift.', true),
  ('accounting_period.reopen', 'Reopen accounting period', 'accounting', 'Reopen a closed period with a reason.', true),
  ('payroll.finalize', 'Finalize payroll', 'payroll', 'Finalize and lock payroll.', true),
  ('payroll.salaries.view', 'View salaries', 'payroll', 'View sensitive salary information.', true),
  ('tax_report.submit', 'Submit tax report', 'tax', 'Approve export or record manual submission.', true),
  ('financial_data.export', 'Export financial data', 'accounting', 'Export accounting and tax records.', true),
  ('fiscal_configuration.manage', 'Manage fiscal configuration', 'fiscal', 'Manage provider-neutral fiscal settings.', true),
  ('products.manage', 'Manage products', 'inventory', 'Create and update products.', false),
  ('inventory.manage', 'Manage inventory', 'inventory', 'Post stock operations and counts.', true),
  ('payments.manage', 'Manage payments', 'payments', 'Record and allocate payments.', true),
  ('reports.view', 'View reports', 'reporting', 'View operational and financial reports.', false),
  ('employees.manage', 'Manage employees', 'hr', 'Manage employee records.', true),
  ('attendance.manage', 'Manage attendance', 'hr', 'Manage attendance and leave.', false)
on conflict (code) do update
set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  is_sensitive = excluded.is_sensitive;

insert into public.app_roles (company_id, code, name, description, is_system)
values
  (null, 'owner', 'Owner', 'Full company authority.', true),
  (null, 'super_administrator', 'Super administrator', 'Full company administration.', true),
  (null, 'company_administrator', 'Company administrator', 'Company operations and configuration.', true),
  (null, 'accountant', 'Accountant', 'Daily accounting operations.', true),
  (null, 'senior_accountant', 'Senior accountant', 'Accounting review and period control.', true),
  (null, 'payroll_administrator', 'Payroll administrator', 'Payroll processing and finalization.', true),
  (null, 'hr_manager', 'HR manager', 'Employees, attendance, and leave.', true),
  (null, 'sales_manager', 'Sales manager', 'Sales documents, pricing, and customers.', true),
  (null, 'warehouse_manager', 'Warehouse manager', 'Products, purchasing, and inventory.', true),
  (null, 'cashier', 'Cashier', 'POS sales and cashier shifts.', true),
  (null, 'waiter', 'Waiter', 'Restaurant POS order entry.', true),
  (null, 'auditor', 'Auditor', 'Read-only financial and audit access.', true),
  (null, 'read_only', 'Read-only user', 'Read-only operational access.', true)
on conflict (code) where company_id is null do update
set
  name = excluded.name,
  description = excluded.description,
  is_system = true;

insert into public.app_role_permissions (role_id, permission_code)
select role.id, permission.code
from public.app_roles role
cross join public.app_permissions permission
where role.company_id is null
  and role.code in ('owner', 'super_administrator', 'company_administrator')
on conflict do nothing;

with grants(role_code, permission_code) as (
  values
    ('accountant', 'company.read'),
    ('accountant', 'compliance.read'),
    ('accountant', 'invoice.create'),
    ('accountant', 'invoice.post'),
    ('accountant', 'credit_note.issue'),
    ('accountant', 'costs.view'),
    ('accountant', 'payments.manage'),
    ('accountant', 'reports.view'),
    ('accountant', 'financial_data.export'),
    ('senior_accountant', 'company.read'),
    ('senior_accountant', 'compliance.read'),
    ('senior_accountant', 'compliance.manage'),
    ('senior_accountant', 'invoice.create'),
    ('senior_accountant', 'invoice.approve'),
    ('senior_accountant', 'invoice.post'),
    ('senior_accountant', 'invoice.cancel'),
    ('senior_accountant', 'credit_note.issue'),
    ('senior_accountant', 'costs.view'),
    ('senior_accountant', 'payments.manage'),
    ('senior_accountant', 'reports.view'),
    ('senior_accountant', 'financial_data.export'),
    ('senior_accountant', 'accounting_period.reopen'),
    ('senior_accountant', 'tax_report.submit'),
    ('payroll_administrator', 'company.read'),
    ('payroll_administrator', 'employees.manage'),
    ('payroll_administrator', 'payroll.salaries.view'),
    ('payroll_administrator', 'payroll.finalize'),
    ('hr_manager', 'company.read'),
    ('hr_manager', 'employees.manage'),
    ('hr_manager', 'attendance.manage'),
    ('sales_manager', 'company.read'),
    ('sales_manager', 'invoice.create'),
    ('sales_manager', 'invoice.approve'),
    ('sales_manager', 'invoice.cancel'),
    ('sales_manager', 'credit_note.issue'),
    ('sales_manager', 'prices.override'),
    ('sales_manager', 'discounts.override'),
    ('sales_manager', 'payments.manage'),
    ('sales_manager', 'reports.view'),
    ('warehouse_manager', 'company.read'),
    ('warehouse_manager', 'warehouses.manage'),
    ('warehouse_manager', 'products.manage'),
    ('warehouse_manager', 'inventory.manage'),
    ('warehouse_manager', 'costs.view'),
    ('warehouse_manager', 'reports.view'),
    ('cashier', 'company.read'),
    ('cashier', 'invoice.create'),
    ('cashier', 'payments.manage'),
    ('cashier', 'cashier_shift.close'),
    ('waiter', 'company.read'),
    ('waiter', 'invoice.create'),
    ('auditor', 'company.read'),
    ('auditor', 'compliance.read'),
    ('auditor', 'audit.view'),
    ('auditor', 'costs.view'),
    ('auditor', 'reports.view'),
    ('auditor', 'financial_data.export'),
    ('read_only', 'company.read'),
    ('read_only', 'compliance.read'),
    ('read_only', 'reports.view')
)
insert into public.app_role_permissions (role_id, permission_code)
select role.id, grants.permission_code
from grants
join public.app_roles role
  on role.code = grants.role_code
  and role.company_id is null
on conflict do nothing;

insert into public.membership_role_assignments (membership_id, role_id)
select
  membership.id,
  role.id
from public.memberships membership
join public.app_roles role
  on role.company_id is null
  and role.code = case lower(coalesce(membership.role, ''))
    when 'owner' then 'owner'
    when 'admin' then 'company_administrator'
    when 'manager' then 'sales_manager'
    when 'accountant' then 'accountant'
    when 'cashier' then 'cashier'
    when 'waiter' then 'waiter'
    when 'auditor' then 'auditor'
    else 'read_only'
  end
on conflict do nothing;

create or replace function private.is_company_member(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_company_id is not null
    and (
      exists (
        select 1
        from public.companies company
        where company.id = p_company_id
          and company.owner_id = (select auth.uid())
      )
      or exists (
        select 1
        from public.memberships membership
        where membership.company_id = p_company_id
          and membership.user_id = (select auth.uid())
          and coalesce(membership.status, 'active') = 'active'
      )
      or exists (
        select 1
        from public.profiles profile
        where profile.id = (select auth.uid())
          and p_company_id in (profile.company_id, profile.active_company_id)
      )
    );
$$;

create or replace function private.has_company_permission(
  p_company_id uuid,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_company_id is not null
    and p_permission is not null
    and (
      exists (
        select 1
        from public.companies company
        where company.id = p_company_id
          and company.owner_id = (select auth.uid())
      )
      or exists (
        select 1
        from public.memberships membership
        where membership.company_id = p_company_id
          and membership.user_id = (select auth.uid())
          and coalesce(membership.status, 'active') = 'active'
          and lower(membership.role) in ('owner', 'admin')
      )
      or exists (
        select 1
        from public.memberships membership
        join public.membership_role_assignments assignment
          on assignment.membership_id = membership.id
        join public.app_roles role
          on role.id = assignment.role_id
          and (role.company_id is null or role.company_id = membership.company_id)
        join public.app_role_permissions role_permission
          on role_permission.role_id = role.id
        where membership.company_id = p_company_id
          and membership.user_id = (select auth.uid())
          and coalesce(membership.status, 'active') = 'active'
          and role_permission.permission_code = p_permission
      )
    );
$$;

create or replace function private.can_manage_role(p_role_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_roles role
    where role.id = p_role_id
      and role.company_id is not null
      and (select private.has_company_permission(role.company_id, 'roles.manage'))
  );
$$;

revoke all on function private.is_company_member(uuid) from public;
revoke all on function private.has_company_permission(uuid, text) from public;
revoke all on function private.can_manage_role(uuid) from public;
grant execute on function private.is_company_member(uuid) to authenticated, service_role;
grant execute on function private.has_company_permission(uuid, text) to authenticated, service_role;
grant execute on function private.can_manage_role(uuid) to authenticated, service_role;

-- Company creation and invitation acceptance are the only supported paths for
-- users to create their own membership. The legacy insert policies allowed an
-- authenticated user to join an arbitrary company by choosing its UUID.
drop policy if exists "Users can create their own memberships" on public.memberships;
drop policy if exists "Users can join valid companies" on public.memberships;

create or replace function public.create_company_and_owner(p_company_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_company_id uuid;
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if nullif(trim(p_company_name), '') is null then
    raise exception 'Company name is required' using errcode = '23514';
  end if;

  insert into public.companies (company_name, owner_id)
  values (trim(p_company_name), current_user_id)
  returning id into new_company_id;

  insert into public.memberships (user_id, company_id, role, status)
  values (current_user_id, new_company_id, 'owner', 'active');

  return jsonb_build_object(
    'id', new_company_id,
    'company_name', trim(p_company_name)
  );
end
$$;

create or replace function public.join_company(token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id uuid;
  target_company_name text;
  new_employee_id uuid;
  user_email text;
  user_name text;
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Authentication required');
  end if;

  select company.id, coalesce(company.name, company.company_name)
  into target_company_id, target_company_name
  from public.companies company
  where company.invite_token = token;

  if target_company_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'Invalid or expired invitation token'
    );
  end if;

  if exists (
    select 1
    from public.memberships membership
    where membership.user_id = current_user_id
      and membership.company_id = target_company_id
  ) then
    return jsonb_build_object(
      'success', false,
      'error', 'You are already a member of this team'
    );
  end if;

  select
    coalesce(profile.email, ''),
    coalesce(profile.first_name, profile.company_name, 'User')
  into user_email, user_name
  from public.profiles profile
  where profile.id = current_user_id;

  insert into public.employees (
    company_id,
    user_id,
    first_name,
    last_name,
    email,
    role,
    status
  )
  values (
    target_company_id,
    current_user_id,
    coalesce(user_name, 'New'),
    'Employee',
    user_email,
    'employee',
    'pending'
  )
  returning id into new_employee_id;

  insert into public.memberships (company_id, user_id, role, status)
  values (target_company_id, current_user_id, 'employee', 'pending');

  update public.profiles
  set
    company_id = target_company_id,
    active_company_id = target_company_id
  where id = current_user_id
    and company_id is null;

  return jsonb_build_object(
    'success', true,
    'company_id', target_company_id,
    'company_name', target_company_name,
    'employee_id', new_employee_id,
    'message', 'Your request to join ' || target_company_name || ' has been sent!'
  );
exception when others then
  return jsonb_build_object('success', false, 'error', sqlerrm);
end
$$;

revoke all on function public.create_company_and_owner(text) from public;
revoke all on function public.join_company(text) from public;
grant execute on function public.create_company_and_owner(text) to authenticated;
grant execute on function public.join_company(text) to authenticated;

-- Extend company update authorization without removing the existing owner policy.
drop policy if exists companies_permission_update on public.companies;
create policy companies_permission_update
on public.companies
for update
to authenticated
using ((select private.has_company_permission(id, 'company.manage')))
with check ((select private.has_company_permission(id, 'company.manage')));

-- ---------------------------------------------------------------------------
-- Append-only audit events
-- ---------------------------------------------------------------------------

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  branch_id uuid references public.branches(id) on delete set null,
  terminal_id uuid references public.pos_terminals(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  entity_key text,
  previous_values jsonb,
  new_values jsonb,
  occurred_at timestamptz not null default clock_timestamp(),
  ip_address inet,
  session_identifier text,
  device_identifier text,
  reason text,
  request_id text
);

create index if not exists audit_events_company_time_idx
  on public.audit_events (company_id, occurred_at desc);
create index if not exists audit_events_entity_idx
  on public.audit_events (entity_type, entity_id, occurred_at desc);
create index if not exists audit_events_actor_idx
  on public.audit_events (actor_user_id, occurred_at desc);

create or replace function private.audit_request_ip()
returns inet
language plpgsql
stable
set search_path = ''
as $$
declare
  headers jsonb;
  candidate text;
begin
  headers := nullif(current_setting('request.headers', true), '')::jsonb;
  candidate := split_part(
    coalesce(headers ->> 'x-forwarded-for', headers ->> 'x-real-ip', ''),
    ',',
    1
  );
  if trim(candidate) = '' then
    return null;
  end if;
  return trim(candidate)::inet;
exception when others then
  return null;
end
$$;

create or replace function private.redact_audit_payload(payload jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when payload is null then null
    else payload
      - 'smtp_pass'
      - 'smtp_password'
      - 'stripe_api_key'
      - 'stripe_access_token'
      - 'stripe_refresh_token'
      - 'payment_link_stripe'
      - 'payment_link_paypal'
      - 'invite_token'
  end;
$$;

create or replace function private.audit_table_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_payload jsonb;
  new_payload jsonb;
  context_payload jsonb;
  resolved_company_id uuid;
  resolved_branch_id uuid;
  resolved_terminal_id uuid;
  resolved_entity_id uuid;
  headers jsonb;
  jwt_claims jsonb;
begin
  old_payload := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  new_payload := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  context_payload := coalesce(new_payload, old_payload, '{}'::jsonb);

  resolved_entity_id := nullif(context_payload ->> 'id', '')::uuid;
  resolved_company_id := case
    when tg_table_name = 'companies' then resolved_entity_id
    else nullif(context_payload ->> 'company_id', '')::uuid
  end;
  resolved_branch_id := case
    when tg_table_name = 'branches' then resolved_entity_id
    else nullif(context_payload ->> 'branch_id', '')::uuid
  end;
  resolved_terminal_id := case
    when tg_table_name = 'pos_terminals' then resolved_entity_id
    else nullif(context_payload ->> 'terminal_id', '')::uuid
  end;

  if tg_table_name = 'compliance_config_versions' then
    select config_set.company_id
    into resolved_company_id
    from public.compliance_config_sets config_set
    where config_set.id = nullif(context_payload ->> 'config_set_id', '')::uuid;
  elsif tg_table_name = 'membership_role_assignments' then
    select membership.company_id
    into resolved_company_id
    from public.memberships membership
    where membership.id = nullif(context_payload ->> 'membership_id', '')::uuid;
  elsif tg_table_name = 'app_role_permissions' then
    select role.company_id
    into resolved_company_id
    from public.app_roles role
    where role.id = nullif(context_payload ->> 'role_id', '')::uuid;
  end if;

  headers := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  jwt_claims := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);

  insert into public.audit_events (
    company_id,
    branch_id,
    terminal_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    entity_key,
    previous_values,
    new_values,
    ip_address,
    session_identifier,
    device_identifier,
    reason,
    request_id
  )
  values (
    resolved_company_id,
    resolved_branch_id,
    resolved_terminal_id,
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    resolved_entity_id,
    coalesce(context_payload ->> 'code', context_payload ->> 'name'),
    private.redact_audit_payload(old_payload),
    private.redact_audit_payload(new_payload),
    private.audit_request_ip(),
    coalesce(jwt_claims ->> 'session_id', jwt_claims ->> 'sid'),
    coalesce(headers ->> 'x-device-id', headers ->> 'user-agent'),
    nullif(current_setting('app.change_reason', true), ''),
    coalesce(headers ->> 'x-request-id', headers ->> 'cf-ray')
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
exception
  when invalid_text_representation then
    raise exception 'Audit context contains an invalid UUID'
      using errcode = '22023';
end
$$;

create or replace function private.prevent_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Audit events are append-only'
    using errcode = '55000';
end
$$;

drop trigger if exists audit_events_immutable on public.audit_events;
create trigger audit_events_immutable
before update or delete on public.audit_events
for each row execute function private.prevent_audit_mutation();

do $$
declare
  audited_table text;
begin
  foreach audited_table in array array[
    'companies',
    'company_bank_accounts',
    'branches',
    'warehouses',
    'fiscal_locations',
    'pos_terminals',
    'compliance_config_sets',
    'compliance_config_versions',
    'document_sequences',
    'memberships',
    'membership_role_assignments',
    'app_roles',
    'app_role_permissions'
  ]
  loop
    execute format('drop trigger if exists %I_audit on public.%I', audited_table, audited_table);
    execute format(
      'create trigger %I_audit after insert or update or delete on public.%I for each row execute function private.audit_table_change()',
      audited_table,
      audited_table
    );
  end loop;
end
$$;

create or replace function private.set_row_update_metadata()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  new.updated_by := coalesce((select auth.uid()), new.updated_by);
  return new;
end
$$;

do $$
declare
  tracked_table text;
begin
  foreach tracked_table in array array[
    'companies',
    'company_bank_accounts',
    'branches',
    'warehouses',
    'fiscal_locations',
    'pos_terminals',
    'compliance_config_sets',
    'compliance_config_versions',
    'document_sequences',
    'app_roles'
  ]
  loop
    execute format('drop trigger if exists %I_update_metadata on public.%I', tracked_table, tracked_table);
    execute format(
      'create trigger %I_update_metadata before update on public.%I for each row execute function private.set_row_update_metadata()',
      tracked_table,
      tracked_table
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.company_bank_accounts enable row level security;
alter table public.branches enable row level security;
alter table public.warehouses enable row level security;
alter table public.fiscal_locations enable row level security;
alter table public.pos_terminals enable row level security;
alter table public.compliance_config_sets enable row level security;
alter table public.compliance_config_versions enable row level security;
alter table public.document_sequences enable row level security;
alter table public.app_permissions enable row level security;
alter table public.app_roles enable row level security;
alter table public.app_role_permissions enable row level security;
alter table public.membership_role_assignments enable row level security;
alter table public.audit_events enable row level security;

do $$
declare
  table_name text;
  manage_permission text;
begin
  for table_name, manage_permission in
    select *
    from (
      values
        ('company_bank_accounts', 'company.manage'),
        ('branches', 'branches.manage'),
        ('warehouses', 'warehouses.manage'),
        ('fiscal_locations', 'fiscal_configuration.manage'),
        ('pos_terminals', 'terminals.manage'),
        ('compliance_config_sets', 'compliance.manage'),
        ('document_sequences', 'compliance.manage')
    ) as policy_target(table_name, manage_permission)
  loop
    execute format('drop policy if exists %I_member_select on public.%I', table_name, table_name);
    execute format(
      'create policy %I_member_select on public.%I for select to authenticated using ((select private.is_company_member(company_id)))',
      table_name,
      table_name
    );
    execute format('drop policy if exists %I_permission_insert on public.%I', table_name, table_name);
    execute format(
      'create policy %I_permission_insert on public.%I for insert to authenticated with check ((select private.has_company_permission(company_id, %L)))',
      table_name,
      table_name,
      manage_permission
    );
    execute format('drop policy if exists %I_permission_update on public.%I', table_name, table_name);
    execute format(
      'create policy %I_permission_update on public.%I for update to authenticated using ((select private.has_company_permission(company_id, %L))) with check ((select private.has_company_permission(company_id, %L)))',
      table_name,
      table_name,
      manage_permission,
      manage_permission
    );
    execute format('drop policy if exists %I_permission_delete on public.%I', table_name, table_name);
    execute format(
      'create policy %I_permission_delete on public.%I for delete to authenticated using ((select private.has_company_permission(company_id, %L)))',
      table_name,
      table_name,
      manage_permission
    );
  end loop;
end
$$;

drop policy if exists compliance_config_versions_member_select
  on public.compliance_config_versions;
create policy compliance_config_versions_member_select
on public.compliance_config_versions
for select
to authenticated
using (
  exists (
    select 1
    from public.compliance_config_sets config_set
    where config_set.id = config_set_id
      and (select private.is_company_member(config_set.company_id))
  )
);

drop policy if exists compliance_config_versions_permission_insert
  on public.compliance_config_versions;
create policy compliance_config_versions_permission_insert
on public.compliance_config_versions
for insert
to authenticated
with check (
  exists (
    select 1
    from public.compliance_config_sets config_set
    where config_set.id = config_set_id
      and (select private.has_company_permission(config_set.company_id, 'compliance.manage'))
  )
);

drop policy if exists compliance_config_versions_permission_update
  on public.compliance_config_versions;
create policy compliance_config_versions_permission_update
on public.compliance_config_versions
for update
to authenticated
using (
  exists (
    select 1
    from public.compliance_config_sets config_set
    where config_set.id = config_set_id
      and (select private.has_company_permission(config_set.company_id, 'compliance.manage'))
  )
)
with check (
  exists (
    select 1
    from public.compliance_config_sets config_set
    where config_set.id = config_set_id
      and (select private.has_company_permission(config_set.company_id, 'compliance.manage'))
  )
);

drop policy if exists compliance_config_versions_permission_delete
  on public.compliance_config_versions;
create policy compliance_config_versions_permission_delete
on public.compliance_config_versions
for delete
to authenticated
using (
  status = 'draft'
  and exists (
    select 1
    from public.compliance_config_sets config_set
    where config_set.id = config_set_id
      and (select private.has_company_permission(config_set.company_id, 'compliance.manage'))
  )
);

drop policy if exists app_permissions_authenticated_select on public.app_permissions;
create policy app_permissions_authenticated_select
on public.app_permissions
for select
to authenticated
using (true);

drop policy if exists app_roles_member_select on public.app_roles;
create policy app_roles_member_select
on public.app_roles
for select
to authenticated
using (
  company_id is null
  or (select private.is_company_member(company_id))
);

drop policy if exists app_roles_permission_insert on public.app_roles;
create policy app_roles_permission_insert
on public.app_roles
for insert
to authenticated
with check (
  company_id is not null
  and not is_system
  and (select private.has_company_permission(company_id, 'roles.manage'))
);

drop policy if exists app_roles_permission_update on public.app_roles;
create policy app_roles_permission_update
on public.app_roles
for update
to authenticated
using (
  company_id is not null
  and not is_system
  and (select private.has_company_permission(company_id, 'roles.manage'))
)
with check (
  company_id is not null
  and not is_system
  and (select private.has_company_permission(company_id, 'roles.manage'))
);

drop policy if exists app_roles_permission_delete on public.app_roles;
create policy app_roles_permission_delete
on public.app_roles
for delete
to authenticated
using (
  company_id is not null
  and not is_system
  and (select private.has_company_permission(company_id, 'roles.manage'))
);

drop policy if exists app_role_permissions_member_select on public.app_role_permissions;
create policy app_role_permissions_member_select
on public.app_role_permissions
for select
to authenticated
using (
  exists (
    select 1
    from public.app_roles role
    where role.id = role_id
      and (
        role.company_id is null
        or (select private.is_company_member(role.company_id))
      )
  )
);

drop policy if exists app_role_permissions_manage_insert on public.app_role_permissions;
create policy app_role_permissions_manage_insert
on public.app_role_permissions
for insert
to authenticated
with check ((select private.can_manage_role(role_id)));

drop policy if exists app_role_permissions_manage_delete on public.app_role_permissions;
create policy app_role_permissions_manage_delete
on public.app_role_permissions
for delete
to authenticated
using ((select private.can_manage_role(role_id)));

drop policy if exists membership_role_assignments_member_select
  on public.membership_role_assignments;
create policy membership_role_assignments_member_select
on public.membership_role_assignments
for select
to authenticated
using (
  exists (
    select 1
    from public.memberships membership
    where membership.id = membership_id
      and (
        membership.user_id = (select auth.uid())
        or (select private.is_company_member(membership.company_id))
      )
  )
);

drop policy if exists membership_role_assignments_manage_insert
  on public.membership_role_assignments;
create policy membership_role_assignments_manage_insert
on public.membership_role_assignments
for insert
to authenticated
with check (
  exists (
    select 1
    from public.memberships membership
    where membership.id = membership_id
      and (select private.has_company_permission(membership.company_id, 'roles.manage'))
  )
);

drop policy if exists membership_role_assignments_manage_delete
  on public.membership_role_assignments;
create policy membership_role_assignments_manage_delete
on public.membership_role_assignments
for delete
to authenticated
using (
  exists (
    select 1
    from public.memberships membership
    where membership.id = membership_id
      and (select private.has_company_permission(membership.company_id, 'roles.manage'))
  )
);

drop policy if exists audit_events_permission_select on public.audit_events;
create policy audit_events_permission_select
on public.audit_events
for select
to authenticated
using (
  company_id is not null
  and (select private.has_company_permission(company_id, 'audit.view'))
);

revoke insert, update, delete, truncate on public.audit_events from anon, authenticated;
grant select on public.audit_events to authenticated;

comment on table public.audit_events is
  'Append-only audit history for sensitive tenant operations. Direct client writes are prohibited.';
comment on table public.compliance_config_versions is
  'Effective-date, versioned compliance configuration. Values require accountant/legal review before production use.';
comment on table public.pos_terminals is
  'Provider-neutral terminal registration. This table does not imply TAK certification.';
