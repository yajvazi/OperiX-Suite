-- OperiX Control operational plane.
-- Additive governance, developer access, notification, and measurement
-- contracts. Existing identity, tenant, product, and billing data remains
-- authoritative.

begin;

create extension if not exists pgcrypto;

create table if not exists public.control_security_policies (
  company_id uuid primary key references public.companies(id) on delete cascade,
  require_mfa_admins boolean not null default false,
  require_mfa_all boolean not null default false,
  allowed_email_domains text[] not null default '{}'::text[],
  invitation_policy text not null default 'any_email' check (invitation_policy in ('any_email', 'allowed_domains')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.control_company_domains (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  domain text not null check (domain = lower(trim(domain)) and domain ~ '^[a-z0-9][a-z0-9.-]{1,252}$'),
  verification_token text not null,
  verified_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, domain)
);

create table if not exists public.control_role_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  description text,
  app_access jsonb not null default '{}'::jsonb check (jsonb_typeof(app_access) = 'object'),
  app_roles jsonb not null default '{}'::jsonb check (jsonb_typeof(app_roles) = 'object'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

create table if not exists public.control_data_retention_policies (
  company_id uuid primary key references public.companies(id) on delete cascade,
  audit_log_days integer check (audit_log_days is null or audit_log_days >= 30),
  support_attachment_days integer check (support_attachment_days is null or support_attachment_days >= 30),
  deleted_file_days integer check (deleted_file_days is null or deleted_file_days >= 7),
  inactive_account_days integer check (inactive_account_days is null or inactive_account_days >= 30),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.control_notification_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  category text not null check (category in ('security', 'billing', 'integrations', 'system', 'administration')),
  severity text not null default 'info' check (severity in ('info', 'success', 'warning', 'critical')),
  title text not null check (length(trim(title)) between 1 and 240),
  body text,
  href text,
  source_application text,
  entity_type text,
  entity_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.control_notification_reads (
  event_id uuid not null references public.control_notification_events(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table if not exists public.control_api_keys (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  key_prefix text not null check (key_prefix ~ '^opx_[a-f0-9]{8}$'),
  secret_hash bytea not null,
  scopes text[] not null default '{}'::text[],
  environment text not null default 'production' check (environment in ('production', 'staging', 'development')),
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists control_api_keys_prefix_idx on public.control_api_keys(key_prefix);

create table if not exists public.control_webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  endpoint_url text not null check (endpoint_url ~ '^https://'),
  subscribed_events text[] not null default '{}'::text[],
  environment text not null default 'production' check (environment in ('production', 'staging', 'development')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  secret_prefix text not null check (secret_prefix ~ '^whsec_[a-f0-9]{8}$'),
  vault_secret_id uuid not null,
  last_delivery_at timestamptz,
  success_count bigint not null default 0,
  failure_count bigint not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.control_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  endpoint_id uuid not null references public.control_webhook_endpoints(id) on delete cascade,
  event_name text not null,
  attempt integer not null default 1 check (attempt > 0),
  request_id bigint,
  status text not null default 'queued' check (status in ('queued', 'delivered', 'failed')),
  status_code integer,
  duration_ms integer,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.control_billing_snapshots (
  company_id uuid primary key references public.companies(id) on delete cascade,
  provider text not null default 'stripe',
  customer_id text,
  subscription_id text,
  plan_name text,
  status text,
  billing_cycle text,
  next_invoice_at timestamptz,
  current_period_end timestamptz,
  seat_limit integer,
  storage_limit_bytes bigint,
  portal_url text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

-- This table is intentionally empty. Platform authority is never inferred
-- from an organization role.
create table if not exists public.control_platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);

create or replace function private.control_permission_app_key(p_permission text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_permission is null then null
    when p_permission like 'booking.%' or p_permission in ('calendar.manage', 'calendar.read') then 'booking'
    when p_permission like 'desk.%' or p_permission like 'workspace.%' or p_permission like 'floor.%' or p_permission like 'resource.%' or p_permission like 'reservation.%' then 'desk'
    when p_permission like 'hr.%' or p_permission like 'payroll.%' or p_permission like 'employee%' or p_permission in ('attendance.manage', 'attendance.view', 'leave.approve', 'leave.request', 'leave.types.manage', 'leave.view', 'offboarding.manage', 'offboarding.view', 'onboarding.manage', 'onboarding.view', 'performance.manage', 'performance.view', 'recruitment.manage', 'recruitment.view') then 'hr'
    when p_permission like 'support.%' then 'support'
    when p_permission like 'crm.%' then 'crm'
    when p_permission like 'invoice.%' or p_permission like 'sales_%' or p_permission like 'financial_%' or p_permission like 'accounting_%' or p_permission like 'tax_%' or p_permission like 'supplier_%' or p_permission like 'customer_%' or p_permission like 'payment%' or p_permission like 'pos.%' or p_permission in ('accounts.manage', 'asset.depreciation.post', 'asset.manage', 'asset.view', 'bank_account.view', 'bank_reconciliation.complete', 'bank_reconciliation.reopen', 'bank_statement.import', 'bank.reconcile', 'cash_account.view', 'cash_transaction.post', 'cashier_shift.close', 'compliance.manage', 'compliance.read', 'costs.view', 'discounts.override', 'document.archive.create', 'document.archive.view', 'expense.post', 'fiscal_configuration.manage', 'inventory.manage', 'inventory.view', 'journal.create', 'journal.post', 'journal.reverse', 'opening_balance.post', 'posting_rules.manage', 'prices.override', 'products.manage', 'report.read', 'reports.view', 'supplier_payment.record', 'supplier_payment.reverse', 'withholding.manage') then 'invoice'
    else null
  end;
$$;

revoke all on function private.control_permission_app_key(text) from public;

-- Preserve existing organizations and access during adoption.
insert into public.company_app_entitlements (company_id, app_key, enabled, plan, enabled_at)
select company.id, app.app_key, true, 'legacy', now()
from public.companies company cross join public.operix_apps app
where company.archived_at is null
on conflict (company_id, app_key) do nothing;

insert into public.membership_app_access (membership_id, app_key, enabled)
select membership.id, app.app_key, true
from public.memberships membership cross join public.operix_apps app
where coalesce(membership.status, 'active') = 'active'
on conflict (membership_id, app_key) do nothing;

create or replace function private.control_mfa_satisfied(p_company_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.control_security_policies policy
    where policy.company_id = p_company_id
      and (policy.require_mfa_all or (policy.require_mfa_admins and exists (
        select 1 from public.memberships membership
        where membership.company_id = p_company_id and membership.user_id = (select auth.uid())
          and lower(membership.role) in ('owner', 'admin')
      )))
  ) or coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2';
$$;

create or replace function private.has_company_permission(p_company_id uuid, p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  with recursive ancestors(id) as (
    select p_company_id
    union
    select company.parent_company_id from public.companies company
    join ancestors child on child.id = company.id where company.parent_company_id is not null
  ), base_access as (
    select private.company_is_active(p_company_id) and p_company_id is not null and p_permission is not null and (
      exists (select 1 from public.companies company join ancestors scope on scope.id=company.id where company.owner_id=(select auth.uid()))
      or exists (select 1 from public.memberships membership join ancestors scope on scope.id=membership.company_id where membership.user_id=(select auth.uid()) and coalesce(membership.status,'active')='active' and lower(membership.role) in ('owner','admin'))
      or exists (
        select 1 from public.memberships membership join ancestors scope on scope.id=membership.company_id
        join public.membership_role_assignments assignment on assignment.membership_id=membership.id
        join public.app_roles role on role.id=assignment.role_id and (role.company_id is null or role.company_id=membership.company_id)
        join public.app_role_permissions role_permission on role_permission.role_id=role.id
        where membership.user_id=(select auth.uid()) and coalesce(membership.status,'active')='active' and role_permission.permission_code=p_permission
      )
    ) as allowed
  ), app_gate as (select private.control_permission_app_key(p_permission) as app_key)
  select base_access.allowed
    and (app_gate.app_key is null or (
      exists (select 1 from public.company_app_entitlements entitlement where entitlement.company_id=p_company_id and entitlement.app_key=app_gate.app_key and entitlement.enabled)
      and exists (
        select 1 from public.memberships membership where membership.company_id=p_company_id and membership.user_id=(select auth.uid()) and coalesce(membership.status,'active')='active'
          and not exists (select 1 from public.membership_app_access access where access.membership_id=membership.id and access.app_key=app_gate.app_key and access.enabled=false)
      )
    ))
    and (p_permission not like 'control.%' or private.control_mfa_satisfied(p_company_id))
  from base_access, app_gate;
$$;

commit;
