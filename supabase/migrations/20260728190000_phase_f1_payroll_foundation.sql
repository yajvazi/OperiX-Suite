-- OperiX Invoice Phase F1
-- Payroll ownership, effective configuration, immutable run data and RLS.
-- This migration is additive. It does not post or reinterpret legacy payrolls.

begin;

-- ---------------------------------------------------------------------------
-- Permissions and feature flags
-- ---------------------------------------------------------------------------

insert into public.app_permissions (code, name, category, description, is_sensitive)
values
  ('payroll.dashboard.view', 'View payroll dashboard', 'payroll', 'View payroll run status and non-sensitive totals.', true),
  ('payroll.compensation.view', 'View employee compensation', 'payroll', 'View employee compensation and employer cost.', true),
  ('payroll.compensation.manage', 'Manage compensation', 'payroll', 'Manage effective-dated compensation.', true),
  ('payroll.period.manage', 'Manage payroll periods', 'payroll', 'Create and manage payroll periods.', true),
  ('payroll.run.create', 'Create payroll runs', 'payroll', 'Create payroll runs and collect inputs.', true),
  ('payroll.run.calculate', 'Calculate payroll', 'payroll', 'Calculate or recalculate payroll.', true),
  ('payroll.adjustment.create', 'Create payroll adjustments', 'payroll', 'Create controlled payroll adjustments.', true),
  ('payroll.adjustment.approve', 'Approve payroll adjustments', 'payroll', 'Approve payroll adjustments.', true),
  ('payroll.run.review', 'Review payroll', 'payroll', 'Review payroll calculations and inputs.', true),
  ('payroll.run.approve', 'Approve payroll', 'payroll', 'Approve a payroll run for finalization.', true),
  ('payroll.run.finalize', 'Finalize payroll', 'payroll', 'Finalize payroll, liabilities and accounting.', true),
  ('payroll.run.reverse', 'Reverse payroll', 'payroll', 'Reverse finalized payroll through a corrective run.', true),
  ('payroll.tax.view', 'View payroll tax', 'payroll', 'View employee tax calculations.', true),
  ('payroll.pension.view', 'View payroll pension', 'payroll', 'View pension calculations.', true),
  ('payroll.employer_cost.view', 'View employer payroll cost', 'payroll', 'View employer payroll costs.', true),
  ('payroll.bank_details.view', 'View payroll bank details', 'payroll', 'View unmasked employee bank details.', true),
  ('payroll.bank_details.manage', 'Manage payroll bank details', 'payroll', 'Manage employee bank details.', true),
  ('payroll.payslip.generate', 'Generate payslips', 'payroll', 'Generate immutable payslip snapshots.', true),
  ('payroll.payslip.deliver', 'Deliver payslips', 'payroll', 'Deliver or revoke payslip access.', true),
  ('payroll.payment_batch.create', 'Create payroll payment batch', 'payroll', 'Create payroll payment instructions.', true),
  ('payroll.payment_batch.approve', 'Approve payroll payment batch', 'payroll', 'Approve payroll payment batches.', true),
  ('payroll.bank_export.create', 'Export payroll bank file', 'payroll', 'Generate traceable generic bank export files.', true),
  ('payroll.reconcile', 'Reconcile payroll', 'payroll', 'Reconcile liabilities, batches and bank payments.', true),
  ('payroll.statutory_export.create', 'Export payroll statutory data', 'payroll', 'Generate versioned statutory export data.', true),
  ('payroll.audit.view', 'View payroll audit', 'payroll', 'View payroll audit history.', true),
  ('payroll.payslip.own', 'View own payslip', 'payroll', 'View only the signed-in employee payslips.', true),
  ('payroll.configuration.manage', 'Manage payroll configuration', 'payroll', 'Manage effective payroll rule versions.', true),
  ('payroll.hr_inputs.import', 'Import approved HR inputs', 'payroll', 'Import approved attendance, leave and overtime snapshots.', true)
on conflict (code) do update
set name=excluded.name, category=excluded.category, description=excluded.description, is_sensitive=excluded.is_sensitive;

with payroll_admin_permissions(permission_code) as (
  values
    ('company.read'), ('accounting.read'), ('journal.create'), ('journal.post'),
    ('payroll.dashboard.view'), ('payroll.compensation.view'), ('payroll.compensation.manage'),
    ('payroll.period.manage'), ('payroll.run.create'), ('payroll.run.calculate'),
    ('payroll.adjustment.create'), ('payroll.adjustment.approve'), ('payroll.run.review'),
    ('payroll.run.approve'), ('payroll.run.finalize'), ('payroll.run.reverse'),
    ('payroll.tax.view'), ('payroll.pension.view'), ('payroll.employer_cost.view'),
    ('payroll.bank_details.view'), ('payroll.bank_details.manage'),
    ('payroll.payslip.generate'), ('payroll.payslip.deliver'),
    ('payroll.payment_batch.create'), ('payroll.payment_batch.approve'),
    ('payroll.bank_export.create'), ('payroll.reconcile'),
    ('payroll.statutory_export.create'), ('payroll.audit.view'),
    ('payroll.payslip.own'), ('payroll.configuration.manage'), ('payroll.hr_inputs.import')
)
insert into public.app_role_permissions (role_id, permission_code)
select role.id, permission.permission_code
from public.app_roles role
cross join payroll_admin_permissions permission
where role.company_id is null and role.code='payroll_administrator'
on conflict do nothing;

with senior_permissions(permission_code) as (
  values
    ('payroll.dashboard.view'), ('payroll.compensation.view'), ('payroll.period.manage'),
    ('payroll.run.create'), ('payroll.run.calculate'), ('payroll.adjustment.create'),
    ('payroll.adjustment.approve'), ('payroll.run.review'), ('payroll.run.approve'),
    ('payroll.run.finalize'), ('payroll.run.reverse'), ('payroll.tax.view'),
    ('payroll.pension.view'), ('payroll.employer_cost.view'),
    ('payroll.payslip.generate'), ('payroll.payment_batch.create'),
    ('payroll.payment_batch.approve'), ('payroll.bank_export.create'),
    ('payroll.reconcile'), ('payroll.statutory_export.create'), ('payroll.audit.view')
)
insert into public.app_role_permissions (role_id, permission_code)
select role.id, permission.permission_code
from public.app_roles role cross join senior_permissions permission
where role.company_id is null and role.code='senior_accountant'
on conflict do nothing;

insert into public.app_role_permissions (role_id, permission_code)
select role.id, 'payroll.payslip.own'
from public.app_roles role
where role.company_id is null
on conflict do nothing;

insert into public.app_role_permissions (role_id, permission_code)
select role.id, permission.code
from public.app_roles role
cross join public.app_permissions permission
where role.company_id is null
  and role.code in ('owner', 'super_administrator', 'company_administrator')
  and permission.category = 'payroll'
on conflict do nothing;

insert into public.company_feature_flags (company_id, flag, enabled, configuration, updated_by)
select company.id, flag.code, false, '{}'::jsonb, null
from public.companies company
cross join (values
  ('payroll_enabled'),
  ('kosovo_payroll_enabled'),
  ('payroll_hr_import_enabled'),
  ('attendance_payroll_enabled'),
  ('leave_payroll_enabled'),
  ('overtime_payroll_enabled'),
  ('payroll_approvals_enabled'),
  ('payslip_portal_enabled'),
  ('payroll_accounting_enabled'),
  ('payroll_bank_exports_enabled'),
  ('payroll_statutory_exports_enabled'),
  ('supplemental_payroll_enabled')
) flag(code)
on conflict (company_id, flag) do nothing;

-- ---------------------------------------------------------------------------
-- Canonical employee payroll readiness
-- ---------------------------------------------------------------------------

alter table public.employees add column if not exists employee_number text;
alter table public.employees add column if not exists personal_identification_reference text;
alter table public.employees add column if not exists employment_start_date date;
alter table public.employees add column if not exists employment_end_date date;
alter table public.employees add column if not exists branch_id uuid references public.branches(id) on delete restrict;
alter table public.employees add column if not exists cost_centre_id uuid references public.accounting_cost_centres(id) on delete restrict;
alter table public.employees add column if not exists project_id uuid references public.accounting_projects(id) on delete restrict;
alter table public.employees add column if not exists payroll_group_code text;
alter table public.employees add column if not exists payroll_ready_status text not null default 'requires_review'
  check (payroll_ready_status in ('ready','requires_review','excluded'));
create unique index if not exists employees_company_number_unique
  on public.employees(company_id, employee_number) where employee_number is not null;

create table if not exists public.employment_contracts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  contract_number text not null,
  contract_type text not null,
  starts_on date not null,
  ends_on date,
  probation_ends_on date,
  position text,
  department text,
  standard_hours numeric(10,4),
  standard_days numeric(10,4),
  status text not null default 'active' check (status in ('draft','active','expired','terminated','superseded')),
  source_application text not null default 'operix_invoice',
  source_record_id text,
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments)='array'),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique(company_id, contract_number),
  check (ends_on is null or ends_on >= starts_on)
);

create table if not exists public.employee_compensation_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  contract_id uuid references public.employment_contracts(id) on delete restrict,
  salary_basis text not null check (salary_basis in ('gross-monthly','net-monthly','hourly','daily')),
  amount numeric(20,4) not null check (amount >= 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  standard_hours numeric(10,4),
  standard_days numeric(10,4),
  payroll_frequency text not null default 'monthly',
  branch_id uuid references public.branches(id) on delete restrict,
  department text,
  cost_centre_id uuid references public.accounting_cost_centres(id) on delete restrict,
  project_id uuid references public.accounting_projects(id) on delete restrict,
  expense_mapping_code text,
  liability_mapping_code text,
  effective_from date not null,
  effective_until date,
  status text not null default 'draft' check (status in ('draft','approved','superseded')),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  check (effective_until is null or effective_until >= effective_from)
);
create index if not exists employee_compensation_effective_idx
  on public.employee_compensation_profiles(company_id, employee_id, effective_from desc);

create table if not exists public.employee_compensation_history (
  id uuid primary key default gen_random_uuid(),
  compensation_profile_id uuid not null references public.employee_compensation_profiles(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete restrict,
  version integer not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot)='object'),
  reason text not null,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id) on delete set null,
  unique(compensation_profile_id, version)
);

create table if not exists public.employee_tax_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  tax_status text not null default 'standard',
  tax_exempt boolean not null default false,
  exemption_amount numeric(20,4) not null default 0 check (exemption_amount >= 0),
  effective_from date not null,
  effective_until date,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  check (effective_until is null or effective_until >= effective_from)
);
create unique index if not exists employee_tax_profiles_effective_unique
  on public.employee_tax_profiles(employee_id,effective_from);

create table if not exists public.employee_pension_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  pension_status text not null default 'standard',
  pension_exempt boolean not null default false,
  employee_rate_override numeric(9,6),
  employer_rate_override numeric(9,6),
  effective_from date not null,
  effective_until date,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  check (effective_until is null or effective_until >= effective_from)
);
create unique index if not exists employee_pension_profiles_effective_unique
  on public.employee_pension_profiles(employee_id,effective_from);

create table if not exists public.employee_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
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
  check (account_number is not null or iban is not null)
);
create unique index if not exists employee_bank_accounts_company_iban_unique
  on public.employee_bank_accounts(company_id,iban) where iban is not null;
create unique index if not exists employee_bank_primary_unique
  on public.employee_bank_accounts(company_id, employee_id) where is_primary and is_active;

-- ---------------------------------------------------------------------------
-- Effective payroll configuration and component catalog
-- ---------------------------------------------------------------------------

create table if not exists public.payroll_config_sets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  code text not null,
  name text not null,
  jurisdiction text not null default 'XK',
  version integer not null,
  effective_from date not null,
  effective_until date,
  status text not null default 'draft' check (status in ('draft','in_review','approved','retired')),
  currency text not null default 'EUR',
  decimal_scale smallint not null default 2 check (decimal_scale between 2 and 4),
  rounding_mode text not null default 'half-up' check (rounding_mode in ('half-up','half-even','truncate')),
  rule_source_reference text,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique(company_id, code, version),
  check (effective_until is null or effective_until >= effective_from)
);
create unique index if not exists payroll_config_effective_unique
  on public.payroll_config_sets(company_id, code, effective_from) where status='approved';

create table if not exists public.payroll_tax_brackets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  config_set_id uuid not null references public.payroll_config_sets(id) on delete restrict,
  bracket_order integer not null check (bracket_order > 0),
  lower_bound numeric(20,4) not null check (lower_bound >= 0),
  upper_bound numeric(20,4),
  rate_percent numeric(9,6) not null check (rate_percent between 0 and 100),
  fixed_amount numeric(20,4) not null default 0,
  unique(config_set_id, bracket_order),
  check (upper_bound is null or upper_bound > lower_bound)
);

create table if not exists public.payroll_pension_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  config_set_id uuid not null references public.payroll_config_sets(id) on delete restrict,
  employee_rate_percent numeric(9,6) not null check (employee_rate_percent between 0 and 100),
  employer_rate_percent numeric(9,6) not null check (employer_rate_percent between 0 and 100),
  minimum_contribution_base numeric(20,4),
  maximum_contribution_base numeric(20,4),
  employee_category text not null default 'standard',
  unique(config_set_id, employee_category)
);

create table if not exists public.payroll_earning_types (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  code text not null,
  name text not null,
  taxable boolean not null default true,
  pensionable boolean not null default true,
  accounting_mapping_code text,
  approval_required boolean not null default false,
  display_order integer not null default 100,
  effective_from date not null,
  effective_until date,
  active boolean not null default true,
  unique(company_id, code, effective_from)
);

create table if not exists public.payroll_deduction_types (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  code text not null,
  name text not null,
  statutory boolean not null default false,
  accounting_mapping_code text,
  approval_required boolean not null default false,
  display_order integer not null default 100,
  effective_from date not null,
  effective_until date,
  active boolean not null default true,
  unique(company_id, code, effective_from)
);

create table if not exists public.employee_recurring_earnings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  earning_type_id uuid not null references public.payroll_earning_types(id) on delete restrict,
  amount numeric(20,4) not null,
  effective_from date not null,
  effective_until date,
  source_reference text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create table if not exists public.employee_recurring_deductions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  deduction_type_id uuid not null references public.payroll_deduction_types(id) on delete restrict,
  amount numeric(20,4) not null,
  remaining_amount numeric(20,4),
  effective_from date not null,
  effective_until date,
  source_reference text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

-- ---------------------------------------------------------------------------
-- Periods, snapshots, runs, calculations, approvals and final outputs
-- ---------------------------------------------------------------------------

create table if not exists public.payroll_groups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  code text not null,
  name text not null,
  frequency text not null default 'monthly',
  payment_day smallint,
  active boolean not null default true,
  unique(company_id, code)
);

create table if not exists public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  payroll_group_id uuid references public.payroll_groups(id) on delete restrict,
  code text not null,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  payment_date date not null,
  status text not null default 'open' check (status in ('open','processing','closed','locked','reopened')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique(company_id, code),
  check (ends_on >= starts_on)
);

create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete restrict,
  payroll_period_id uuid not null references public.payroll_periods(id) on delete restrict,
  payroll_group_id uuid references public.payroll_groups(id) on delete restrict,
  config_set_id uuid not null references public.payroll_config_sets(id) on delete restrict,
  run_number text not null,
  run_type text not null default 'regular' check (run_type in ('regular','supplemental','adjustment','reversal')),
  original_run_id uuid references public.payroll_runs(id) on delete restrict,
  status text not null default 'draft' check (status in (
    'draft','collecting_inputs','calculating','calculation_failed','calculated',
    'under_review','pending_approval','approved','finalizing','finalized',
    'payment_pending','partially_paid','paid','reversal_pending','reversed'
  )),
  currency text not null default 'EUR',
  idempotency_key text not null,
  input_locked_at timestamptz,
  calculated_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  finalized_at timestamptz,
  finalized_by uuid references auth.users(id) on delete set null,
  journal_entry_id uuid references public.journal_entries(id) on delete restrict,
  reversal_journal_entry_id uuid references public.journal_entries(id) on delete restrict,
  total_gross numeric(20,4) not null default 0,
  total_employee_pension numeric(20,4) not null default 0,
  total_employer_pension numeric(20,4) not null default 0,
  total_tax numeric(20,4) not null default 0,
  total_other_deductions numeric(20,4) not null default 0,
  total_net numeric(20,4) not null default 0,
  total_employer_cost numeric(20,4) not null default 0,
  warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(warnings)='array'),
  errors jsonb not null default '[]'::jsonb check (jsonb_typeof(errors)='array'),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique(company_id, run_number),
  unique(company_id, idempotency_key)
);
create index if not exists payroll_runs_period_idx on public.payroll_runs(company_id,payroll_period_id,status);

create table if not exists public.payroll_input_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  payroll_run_id uuid not null references public.payroll_runs(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  input_type text not null check (input_type in ('employee','contract','compensation','tax','pension','attendance','leave','overtime','earning','deduction')),
  source_application text not null,
  source_record_ids text[] not null default '{}',
  source_approved boolean not null default false,
  source_timestamp timestamptz,
  imported_at timestamptz not null default now(),
  imported_by uuid references auth.users(id) on delete set null,
  configuration_version text,
  status text not null default 'pending' check (status in ('pending','imported','validated','rejected','superseded','locked_in_payroll')),
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  checksum text not null,
  locked_at timestamptz,
  unique(payroll_run_id,employee_id,input_type,checksum)
);

create table if not exists public.payroll_run_employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  payroll_run_id uuid not null references public.payroll_runs(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  compensation_profile_id uuid references public.employee_compensation_profiles(id) on delete restrict,
  tax_profile_id uuid references public.employee_tax_profiles(id) on delete restrict,
  pension_profile_id uuid references public.employee_pension_profiles(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete restrict,
  department text,
  cost_centre_id uuid references public.accounting_cost_centres(id) on delete restrict,
  project_id uuid references public.accounting_projects(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','calculated','warning','error','excluded','finalized','reversed')),
  base_earnings numeric(20,4) not null default 0,
  additional_earnings numeric(20,4) not null default 0,
  taxable_earnings numeric(20,4) not null default 0,
  non_taxable_earnings numeric(20,4) not null default 0,
  gross_pay numeric(20,4) not null default 0,
  pensionable_base numeric(20,4) not null default 0,
  employee_pension numeric(20,4) not null default 0,
  employer_pension numeric(20,4) not null default 0,
  taxable_income numeric(20,4) not null default 0,
  personal_income_tax numeric(20,4) not null default 0,
  other_deductions numeric(20,4) not null default 0,
  net_salary numeric(20,4) not null default 0,
  employer_cost numeric(20,4) not null default 0,
  calculation_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(calculation_metadata)='object'),
  warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(warnings)='array'),
  errors jsonb not null default '[]'::jsonb check (jsonb_typeof(errors)='array'),
  calculated_at timestamptz,
  finalized_at timestamptz,
  unique(payroll_run_id,employee_id)
);

create table if not exists public.payroll_calculation_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  payroll_run_employee_id uuid not null references public.payroll_run_employees(id) on delete restrict,
  line_number integer not null,
  kind text not null check (kind in ('earning','deduction','statutory','employer_cost')),
  code text not null,
  label text not null,
  amount numeric(20,4) not null,
  taxable boolean not null default false,
  pensionable boolean not null default false,
  accounting_mapping_code text,
  source_reference text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  unique(payroll_run_employee_id,line_number)
);

create table if not exists public.payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  payroll_run_id uuid not null references public.payroll_runs(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  adjustment_type text not null,
  amount numeric(20,4) not null,
  reason text not null,
  status text not null default 'draft' check (status in ('draft','pending_approval','approved','rejected','applied','reversed')),
  source_period_id uuid references public.payroll_periods(id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  check (created_by is distinct from approved_by)
);

create table if not exists public.payroll_approvals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  payroll_run_id uuid not null references public.payroll_runs(id) on delete restrict,
  stage text not null check (stage in ('preparer','hr_review','accountant_review','finance_approval','final_authorization')),
  sequence integer not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','skipped')),
  action_by uuid references auth.users(id) on delete set null,
  action_at timestamptz,
  reason text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  unique(payroll_run_id,stage)
);

create table if not exists public.payslip_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  payroll_run_id uuid not null references public.payroll_runs(id) on delete restrict,
  payroll_run_employee_id uuid not null references public.payroll_run_employees(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  language text not null default 'sq' check (language in ('sq','en','sr')),
  verification_reference text not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot)='object'),
  snapshot_checksum text not null,
  pdf_storage_path text,
  generated_at timestamptz not null default now(),
  generated_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revocation_reason text,
  unique(payroll_run_employee_id,language)
);

create table if not exists public.payslip_access_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  payslip_snapshot_id uuid not null references public.payslip_snapshots(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  accessed_by uuid references auth.users(id) on delete set null,
  access_type text not null check (access_type in ('view','download','email','signed_link','revoke')),
  accessed_at timestamptz not null default now(),
  ip_address inet,
  session_identifier text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object')
);

create table if not exists public.payroll_posting_mappings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  mapping_code text not null,
  account_id uuid not null references public.chart_of_accounts(id) on delete restrict,
  side text not null check (side in ('debit','credit')),
  employee_category text,
  branch_id uuid references public.branches(id) on delete restrict,
  department text,
  cost_centre_id uuid references public.accounting_cost_centres(id) on delete restrict,
  project_id uuid references public.accounting_projects(id) on delete restrict,
  effective_from date not null,
  effective_until date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique(company_id,mapping_code,effective_from,branch_id,department,cost_centre_id,project_id)
);

create table if not exists public.payroll_liabilities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  payroll_run_id uuid not null references public.payroll_runs(id) on delete restrict,
  payroll_run_employee_id uuid references public.payroll_run_employees(id) on delete restrict,
  employee_id uuid references public.employees(id) on delete restrict,
  liability_type text not null check (liability_type in ('net_salary','employee_pension','employer_pension','personal_income_tax','other_deduction','salary_advance','employee_loan')),
  amount numeric(20,4) not null check (amount >= 0),
  paid_amount numeric(20,4) not null default 0 check (paid_amount >= 0),
  currency text not null default 'EUR',
  due_date date,
  status text not null default 'open' check (status in ('open','partially_paid','paid','reversed')),
  journal_entry_id uuid not null references public.journal_entries(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.payroll_payment_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  payroll_run_id uuid not null references public.payroll_runs(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete restrict,
  company_bank_account_id uuid not null references public.company_bank_accounts(id) on delete restrict,
  batch_number text not null,
  currency text not null default 'EUR',
  payment_date date not null,
  total_amount numeric(20,4) not null default 0,
  status text not null default 'draft' check (status in ('draft','pending_approval','approved','exported','partially_paid','paid','rejected','reversed')),
  approval_state text not null default 'pending',
  reconciliation_state text not null default 'unreconciled',
  idempotency_key text not null,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique(company_id,batch_number),
  unique(company_id,idempotency_key)
);

create table if not exists public.payroll_payment_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  payment_batch_id uuid not null references public.payroll_payment_batches(id) on delete restrict,
  liability_id uuid not null references public.payroll_liabilities(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  employee_bank_account_id uuid references public.employee_bank_accounts(id) on delete restrict,
  amount numeric(20,4) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending','submitted','paid','failed','rejected','reversed')),
  external_reference text,
  failure_reason text,
  payment_journal_entry_id uuid references public.journal_entries(id) on delete restrict,
  paid_at timestamptz
);

create table if not exists public.payroll_reconciliation_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  payroll_run_id uuid not null references public.payroll_runs(id) on delete restrict,
  payment_batch_id uuid references public.payroll_payment_batches(id) on delete restrict,
  liability_id uuid references public.payroll_liabilities(id) on delete restrict,
  event_type text not null,
  previous_state text,
  new_state text not null,
  amount numeric(20,4),
  reason text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  occurred_at timestamptz not null default now(),
  occurred_by uuid references auth.users(id) on delete set null
);

create table if not exists public.payroll_exports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  payroll_run_id uuid references public.payroll_runs(id) on delete restrict,
  payment_batch_id uuid references public.payroll_payment_batches(id) on delete restrict,
  export_type text not null check (export_type in ('bank_csv','bank_excel','payment_order','statutory','report_pdf','report_excel','report_csv')),
  provider text not null default 'generic',
  schema_version text not null,
  field_mapping jsonb not null default '{}'::jsonb check (jsonb_typeof(field_mapping)='object'),
  validation_issues jsonb not null default '[]'::jsonb check (jsonb_typeof(validation_issues)='array'),
  file_checksum text,
  storage_path text,
  status text not null default 'draft' check (status in ('draft','validated','approved','generated','downloaded','submitted','rejected','revoked')),
  approval_state text not null default 'pending',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  downloaded_at timestamptz,
  submitted_at timestamptz
);

create table if not exists public.payroll_migration_reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  source_type text not null check (source_type in ('employee','legacy_payroll')),
  source_id uuid not null,
  classification text not null,
  issues jsonb not null default '[]'::jsonb check (jsonb_typeof(issues)='array'),
  decision text,
  decision_reason text,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(company_id,source_type,source_id)
);

-- Review existing data without converting, posting or inventing facts.
insert into public.payroll_migration_reviews(company_id,source_type,source_id,classification,issues)
select employee.company_id, 'employee', employee.id,
  case
    when employee.base_salary is null or employee.base_salary <= 0 then 'missing_salary_type'
    else 'requires_review'
  end,
  jsonb_strip_nulls(jsonb_build_array(
    case when employee.base_salary is null or employee.base_salary <= 0 then 'missing compensation' end,
    'missing compensation effective date',
    'missing tax profile',
    'missing pension profile',
    case when employee.branch_id is null then 'missing branch' end,
    case when employee.cost_centre_id is null then 'missing cost centre' end
  ))
from public.employees employee
on conflict do nothing;

insert into public.payroll_migration_reviews(company_id,source_type,source_id,classification,issues)
select legacy.company_id,'legacy_payroll',legacy.id,'legacy_summary_only',
  jsonb_build_array('missing tax details','missing pension details','missing journal','requires accountant review')
from public.payrolls legacy
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Immutability and tenant-safe RLS
-- ---------------------------------------------------------------------------

create or replace function private.protect_finalized_payroll()
returns trigger language plpgsql set search_path='' as $$
declare run_status text;
begin
  if tg_table_name='payroll_runs' then
    run_status := old.status;
  elsif tg_table_name in ('payroll_run_employees','payroll_input_snapshots','payroll_approvals','payroll_adjustments') then
    select status into run_status from public.payroll_runs where id=old.payroll_run_id;
  elsif tg_table_name='payroll_calculation_lines' then
    select run.status into run_status
    from public.payroll_run_employees employee_run
    join public.payroll_runs run on run.id=employee_run.payroll_run_id
    where employee_run.id=old.payroll_run_employee_id;
  else
    run_status := 'finalized';
  end if;
  if run_status in ('finalized','payment_pending','partially_paid','paid','reversal_pending','reversed')
     and current_setting('app.payroll_workflow',true) <> 'authorized' then
    raise exception 'Finalized payroll records are immutable; use supplemental, adjustment or reversal workflows'
      using errcode='55000';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'payroll_runs','payroll_run_employees','payroll_input_snapshots',
    'payroll_calculation_lines','payroll_adjustments','payroll_approvals',
    'payslip_snapshots','payroll_liabilities'
  ] loop
    execute format('drop trigger if exists %I_immutable on public.%I',table_name,table_name);
    execute format('create trigger %I_immutable before update or delete on public.%I for each row execute function private.protect_finalized_payroll()',table_name,table_name);
  end loop;
end $$;

create or replace function private.payroll_table_company_guard()
returns trigger language plpgsql set search_path='' as $$
declare employee_company uuid;
begin
  if new.employee_id is not null then
    select company_id into employee_company from public.employees where id=new.employee_id;
    if employee_company is distinct from new.company_id then
      raise exception 'Payroll employee must belong to the same company' using errcode='23514';
    end if;
  end if;
  return new;
end $$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'employment_contracts','employee_compensation_profiles','employee_tax_profiles',
    'employee_pension_profiles','employee_bank_accounts','employee_recurring_earnings',
    'employee_recurring_deductions','payroll_input_snapshots','payroll_run_employees',
    'payroll_adjustments','payslip_snapshots','payslip_access_logs','payroll_payment_lines'
  ] loop
    execute format('drop trigger if exists %I_company_guard on public.%I',table_name,table_name);
    execute format('create trigger %I_company_guard before insert or update on public.%I for each row execute function private.payroll_table_company_guard()',table_name,table_name);
  end loop;
end $$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'employment_contracts','employee_compensation_profiles','employee_compensation_history',
    'employee_tax_profiles','employee_pension_profiles','employee_bank_accounts',
    'payroll_config_sets','payroll_tax_brackets','payroll_pension_rules',
    'payroll_earning_types','payroll_deduction_types','employee_recurring_earnings',
    'employee_recurring_deductions','payroll_groups','payroll_periods','payroll_runs',
    'payroll_input_snapshots','payroll_run_employees','payroll_calculation_lines',
    'payroll_adjustments','payroll_approvals','payslip_snapshots','payslip_access_logs',
    'payroll_posting_mappings','payroll_liabilities','payroll_payment_batches',
    'payroll_payment_lines','payroll_reconciliation_events','payroll_exports',
    'payroll_migration_reviews'
  ] loop
    execute format('alter table public.%I enable row level security',table_name);
  end loop;
end $$;

-- Sensitive payroll tables are read only to explicit payroll permissions.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'employment_contracts','employee_compensation_profiles','employee_compensation_history',
    'employee_tax_profiles','employee_pension_profiles','employee_bank_accounts',
    'payroll_config_sets','payroll_tax_brackets','payroll_pension_rules',
    'payroll_earning_types','payroll_deduction_types','employee_recurring_earnings',
    'employee_recurring_deductions','payroll_groups','payroll_periods','payroll_runs',
    'payroll_input_snapshots','payroll_run_employees','payroll_calculation_lines',
    'payroll_adjustments','payroll_approvals','payroll_posting_mappings',
    'payroll_liabilities','payroll_payment_batches','payroll_payment_lines',
    'payroll_reconciliation_events','payroll_exports','payroll_migration_reviews'
  ] loop
    execute format('drop policy if exists %I_payroll_read on public.%I',table_name,table_name);
    execute format(
      'create policy %I_payroll_read on public.%I for select to authenticated using ((select private.has_company_permission(company_id,%L)))',
      table_name,table_name,'payroll.dashboard.view'
    );
  end loop;
end $$;

drop policy if exists payslip_snapshots_payroll_read on public.payslip_snapshots;
create policy payslip_snapshots_payroll_read on public.payslip_snapshots
for select to authenticated using (
  (select private.has_company_permission(company_id,'payroll.payslip.generate'))
  or exists (
    select 1 from public.employees employee
    where employee.id=payslip_snapshots.employee_id
      and employee.user_id=(select auth.uid())
      and employee.company_id=payslip_snapshots.company_id
  )
);

drop policy if exists payslip_access_logs_payroll_read on public.payslip_access_logs;
create policy payslip_access_logs_payroll_read on public.payslip_access_logs
for select to authenticated using (
  (select private.has_company_permission(company_id,'payroll.audit.view'))
  or exists (
    select 1 from public.employees employee
    where employee.id=payslip_access_logs.employee_id and employee.user_id=(select auth.uid())
  )
);

-- Writes are limited to configuration/master-data screens; transaction tables
-- are written only by SECURITY DEFINER commands added in the next migration.
create policy payroll_config_sets_manage on public.payroll_config_sets for all to authenticated
using ((select private.has_company_permission(company_id,'payroll.configuration.manage')))
with check ((select private.has_company_permission(company_id,'payroll.configuration.manage')));
create policy payroll_tax_brackets_manage on public.payroll_tax_brackets for all to authenticated
using ((select private.has_company_permission(company_id,'payroll.configuration.manage')))
with check ((select private.has_company_permission(company_id,'payroll.configuration.manage')));
create policy payroll_pension_rules_manage on public.payroll_pension_rules for all to authenticated
using ((select private.has_company_permission(company_id,'payroll.configuration.manage')))
with check ((select private.has_company_permission(company_id,'payroll.configuration.manage')));
create policy payroll_earning_types_manage on public.payroll_earning_types for all to authenticated
using ((select private.has_company_permission(company_id,'payroll.configuration.manage')))
with check ((select private.has_company_permission(company_id,'payroll.configuration.manage')));
create policy payroll_deduction_types_manage on public.payroll_deduction_types for all to authenticated
using ((select private.has_company_permission(company_id,'payroll.configuration.manage')))
with check ((select private.has_company_permission(company_id,'payroll.configuration.manage')));
create policy employee_compensation_manage on public.employee_compensation_profiles for all to authenticated
using ((select private.has_company_permission(company_id,'payroll.compensation.manage')))
with check ((select private.has_company_permission(company_id,'payroll.compensation.manage')));
create policy employee_tax_profile_manage on public.employee_tax_profiles for all to authenticated
using ((select private.has_company_permission(company_id,'payroll.configuration.manage')))
with check ((select private.has_company_permission(company_id,'payroll.configuration.manage')));
create policy employee_pension_profile_manage on public.employee_pension_profiles for all to authenticated
using ((select private.has_company_permission(company_id,'payroll.configuration.manage')))
with check ((select private.has_company_permission(company_id,'payroll.configuration.manage')));
create policy employee_bank_account_manage on public.employee_bank_accounts for all to authenticated
using ((select private.has_company_permission(company_id,'payroll.bank_details.manage')))
with check ((select private.has_company_permission(company_id,'payroll.bank_details.manage')));

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'employment_contracts','employee_compensation_profiles','employee_compensation_history',
    'employee_tax_profiles','employee_pension_profiles','employee_bank_accounts',
    'payroll_config_sets','payroll_tax_brackets','payroll_pension_rules',
    'payroll_earning_types','payroll_deduction_types','employee_recurring_earnings',
    'employee_recurring_deductions','payroll_groups','payroll_periods','payroll_runs',
    'payroll_input_snapshots','payroll_run_employees','payroll_calculation_lines',
    'payroll_adjustments','payroll_approvals','payslip_snapshots','payslip_access_logs',
    'payroll_posting_mappings','payroll_liabilities','payroll_payment_batches',
    'payroll_payment_lines','payroll_reconciliation_events','payroll_exports',
    'payroll_migration_reviews'
  ] loop
    execute format('revoke all on public.%I from anon',table_name);
    execute format('grant select on public.%I to authenticated',table_name);
    execute format('grant all on public.%I to service_role',table_name);
  end loop;
end $$;

grant insert,update,delete on public.payroll_config_sets,public.payroll_tax_brackets,
  public.payroll_pension_rules,public.payroll_earning_types,public.payroll_deduction_types,
  public.employee_compensation_profiles,public.employee_tax_profiles,
  public.employee_pension_profiles,public.employee_bank_accounts to authenticated;

comment on table public.payrolls is
  'Legacy operational payroll summaries. Phase F does not finalize or post from this table.';
comment on table public.payroll_config_sets is
  'Versioned payroll configuration. Kosovo rule values require accountant/legal approval before activation.';
comment on table public.payslip_snapshots is
  'Immutable payroll-owned payslip snapshots. HR may consume them only through authorized shared access.';

commit;
