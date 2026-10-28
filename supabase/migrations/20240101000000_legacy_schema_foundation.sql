-- OperiX legacy schema foundation
--
-- The original Invoice/Workspace schema was kept in manually-run SQL files
-- whose names are not recognized by the Supabase migration runner.  A clean
-- database therefore reached the first 2024 migration without its base
-- tables.  This migration is the normalized, additive foundation for those
-- tables.  It is intentionally idempotent so it is safe to apply to an
-- upgraded database where the legacy objects already exist.

begin;

create extension if not exists pgcrypto;

do $$
begin
  create type public.invoice_status as enum ('draft', 'sent', 'paid', 'overdue');
exception
  when duplicate_object then null;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid,
  active_company_id uuid,
  role text default 'owner',
  first_name text,
  last_name text,
  company_name text,
  email text,
  phone text,
  address text,
  city text,
  country text,
  website text,
  logo_url text,
  signature_url text,
  stamp_url text,
  currency text default 'USD',
  tax_rate numeric default 0,
  tax_name text default 'VAT',
  tax_id text,
  bank_name text,
  bank_account text,
  bank_iban text,
  bank_swift text,
  payment_link_stripe text,
  payment_link_paypal text,
  invoice_language text default 'en',
  terms_conditions text,
  primary_color text default '#6366f1',
  is_grayscale boolean default false,
  biometric_enabled boolean default false,
  template_config jsonb,
  updated_at timestamptz default now()
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  name text,
  owner_id uuid references auth.users(id) on delete set null,
  invite_token text unique default encode(gen_random_bytes(6), 'hex'),
  invite_token_created_at timestamptz,
  settings jsonb not null default '{}'::jsonb,
  email text,
  phone text,
  address text,
  city text,
  country text,
  website text,
  logo_url text,
  signature_url text,
  stamp_url text,
  currency text default 'USD',
  tax_rate numeric default 0,
  tax_name text default 'VAT',
  tax_id text,
  bank_name text,
  bank_account text,
  bank_iban text,
  bank_swift text,
  payment_link_stripe text,
  payment_link_paypal text,
  invoice_language text default 'en',
  terms_conditions text,
  primary_color text default '#6366f1',
  is_grayscale boolean default false,
  template_config jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.companies
  add column if not exists city text,
  add column if not exists country text;

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  role text not null default 'worker',
  status text default 'active',
  created_at timestamptz default now(),
  unique(user_id, company_id)
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid,
  name text not null,
  email text,
  phone text,
  address text,
  city text,
  zip_code text,
  country text,
  tax_id text,
  nui text,
  fiscal_number text,
  vat_number text,
  company_name text,
  discount_percent numeric default 0,
  discount_type text default 'percentage',
  notes text,
  created_at timestamptz default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid,
  name text not null,
  description text,
  sku text,
  barcode text,
  unit_price numeric not null default 0,
  tax_rate numeric default 0,
  tax_included boolean default false,
  unit text default 'pcs',
  category text,
  stock_quantity numeric default 0,
  track_stock boolean default false,
  low_stock_threshold numeric default 5,
  created_at timestamptz default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid,
  amount numeric not null default 0,
  category text not null default 'Other',
  description text,
  date date default current_date,
  receipt_url text,
  created_at timestamptz default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid,
  client_id uuid references public.clients(id) on delete set null,
  invoice_number text not null,
  issue_date date default current_date,
  due_date date,
  posting_date date,
  status public.invoice_status default 'draft',
  type text not null default 'invoice',
  subtype text default 'regular',
  payment_method text,
  amount_received numeric default 0,
  change_amount numeric default 0,
  paper_size text default 'A4',
  tax_reporting_category text,
  discount_amount numeric default 0,
  discount_percent numeric default 0,
  tax_amount numeric default 0,
  total_amount numeric default 0,
  notes text,
  template_id text default 'classic',
  is_recurring boolean default false,
  recurring_interval text,
  last_recurring_date date,
  created_at timestamptz default now()
);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  description text not null,
  quantity numeric not null default 1,
  unit_price numeric not null default 0,
  tax_rate numeric default 0,
  amount numeric not null default 0,
  unit text,
  discount numeric default 0,
  sku text
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  job_title text,
  department text,
  avatar_url text,
  role text default 'employee',
  status text default 'active',
  hire_date date default current_date,
  base_salary numeric default 0,
  currency text default 'EUR',
  permissions jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete cascade,
  company_id uuid,
  name text not null,
  document_type text,
  file_url text not null,
  expiry_date date,
  uploaded_at timestamptz default now()
);

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete cascade,
  company_id uuid,
  date date default current_date,
  check_in timestamptz,
  check_out timestamptz,
  total_hours numeric generated always as (extract(epoch from (check_out - check_in)) / 3600) stored,
  status text default 'present',
  location_lat numeric,
  location_lng numeric,
  created_at timestamptz default now()
);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete cascade,
  company_id uuid,
  leave_type text,
  start_date date not null,
  end_date date not null,
  reason text,
  status text default 'pending',
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists public.payrolls (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete cascade,
  company_id uuid,
  period_start date not null,
  period_end date not null,
  base_salary numeric not null,
  bonus numeric default 0,
  deductions numeric default 0,
  expenses_reimbursed numeric default 0,
  total_payout numeric not null,
  status text default 'draft',
  payment_date date,
  created_at timestamptz default now()
);

create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid,
  name text not null,
  email text,
  phone text,
  address text,
  city text,
  zip_code text,
  country text,
  tax_id text,
  notes text,
  created_at timestamptz default now()
);

create table if not exists public.vendor_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid,
  vendor_id uuid references public.vendors(id) on delete set null,
  payment_number text not null,
  amount numeric not null default 0,
  payment_date date default current_date,
  payment_method text default 'bank',
  bank_reference text,
  description text,
  notes text,
  created_at timestamptz default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid,
  client_id uuid references public.clients(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  payment_number text not null,
  amount numeric not null default 0,
  payment_date date default current_date,
  payment_method text default 'cash',
  bank_reference text,
  notes text,
  created_at timestamptz default now()
);

create table if not exists public.supplier_bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  bill_number text not null,
  issue_date date default current_date,
  due_date date,
  total_amount numeric not null default 0,
  tax_amount numeric default 0,
  status text default 'unpaid',
  notes text,
  document_url text,
  created_at timestamptz default now()
);

create table if not exists public.supplier_bill_items (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.supplier_bills(id) on delete cascade,
  description text not null,
  quantity numeric not null default 1,
  unit_price numeric not null default 0,
  amount numeric not null default 0,
  created_at timestamptz default now()
);

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete cascade,
  company_id uuid,
  title text not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  color text default '#6366f1',
  created_at timestamptz default now()
);

create table if not exists public.compliances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  title text not null,
  description text,
  status text default 'pending',
  due_date date,
  completed_at date,
  attachment_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Backfill columns that were introduced by the legacy scripts but may be
-- absent on an upgraded database.  These are additive and do not rewrite
-- financial or tenant data.
alter table public.profiles
  add column if not exists company_id uuid,
  add column if not exists active_company_id uuid,
  add column if not exists first_name text,
  add column if not exists last_name text;
alter table public.companies
  add column if not exists company_name text,
  add column if not exists name text,
  add column if not exists owner_id uuid,
  add column if not exists invite_token text,
  add column if not exists invite_token_created_at timestamptz,
  add column if not exists settings jsonb not null default '{}'::jsonb;
alter table public.memberships
  add column if not exists status text default 'active';
alter table public.invoice_items
  add column if not exists discount numeric default 0,
  add column if not exists sku text;
alter table public.clients
  add column if not exists nui text,
  add column if not exists fiscal_number text,
  add column if not exists vat_number text,
  add column if not exists company_name text;
alter table public.employees
  add column if not exists permissions jsonb default '{}'::jsonb;

-- These helpers are prerequisites for the first tenant/RLS migrations. Later
-- migrations replace them with the canonical control-plane implementations.
create or replace function public.is_company_owner(p_company_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where company_id = p_company_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
      and coalesce(status, 'active') <> 'revoked'
  );
$$;

create or replace function public.generate_company_payroll(
  p_company_id uuid, p_start_date date, p_end_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  employee_row record;
  generated_count integer := 0;
begin
  if not public.is_company_owner(p_company_id)
     and not exists (
       select 1 from public.memberships
       where company_id = p_company_id and user_id = auth.uid()
         and role in ('owner', 'admin', 'manager')
         and coalesce(status, 'active') <> 'revoked'
     ) then
    raise exception 'Access denied';
  end if;

  for employee_row in
    select id, base_salary from public.employees
    where company_id = p_company_id and status = 'active'
  loop
    if not exists (
      select 1 from public.payrolls
      where employee_id = employee_row.id
        and period_start = p_start_date and period_end = p_end_date
    ) then
      insert into public.payrolls(
        employee_id, company_id, period_start, period_end, base_salary,
        bonus, deductions, expenses_reimbursed, total_payout, status
      ) values (
        employee_row.id, p_company_id, p_start_date, p_end_date,
        employee_row.base_salary, 0, 0, 0, employee_row.base_salary, 'draft'
      );
      generated_count := generated_count + 1;
    end if;
  end loop;
  return jsonb_build_object('success', true, 'generated_count', generated_count);
end;
$$;

commit;
