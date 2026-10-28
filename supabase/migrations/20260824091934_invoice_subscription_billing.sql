-- OperiX Invoice shared SaaS subscription billing.
--
-- The existing companies/memberships model remains the workspace authority.
-- A billing account is attached to the root company of a company hierarchy;
-- subdivisions are metered tenants, never independent subscriptions.

begin;

create schema if not exists private;

create table if not exists public.subscription_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete restrict,
  product text not null default 'invoice' check (product = 'invoice'),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  billing_interval text check (billing_interval in ('monthly', 'annual')),
  status text not null default 'trialing' check (status in ('trialing', 'active', 'past_due', 'unpaid', 'canceled', 'expired', 'incomplete', 'incomplete_expired', 'paused')),
  trial_started_at timestamptz not null,
  trial_ends_at timestamptz not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  grace_period_ends_at timestamptz,
  manual_override_status text check (manual_override_status is null or manual_override_status in ('trialing', 'active', 'past_due', 'unpaid', 'canceled', 'expired', 'incomplete', 'incomplete_expired', 'paused')),
  manual_override_expires_at timestamptz,
  last_stripe_event_created bigint,
  last_stripe_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscription_accounts_status_idx
  on public.subscription_accounts(status, trial_ends_at);
create index if not exists subscription_accounts_stripe_customer_idx
  on public.subscription_accounts(stripe_customer_id)
  where stripe_customer_id is not null;
create index if not exists subscription_accounts_stripe_subscription_idx
  on public.subscription_accounts(stripe_subscription_id)
  where stripe_subscription_id is not null;

create table if not exists public.subscription_usage (
  company_id uuid primary key references public.companies(id) on delete restrict,
  total_tenants integer not null default 0 check (total_tenants >= 0),
  included_tenants integer not null default 1 check (included_tenants = 1),
  billable_tenants integer not null default 0 check (billable_tenants >= 0),
  total_users integer not null default 0 check (total_users >= 0),
  included_users integer not null default 1 check (included_users = 1),
  billable_users integer not null default 0 check (billable_users >= 0),
  last_synced_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists subscription_usage_billable_idx
  on public.subscription_usage(company_id, billable_tenants, billable_users);

create table if not exists public.subscription_sync_queue (
  company_id uuid primary key references public.companies(id) on delete restrict,
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'processing', 'succeeded', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  locked_at timestamptz,
  processed_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

create index if not exists subscription_sync_queue_pending_idx
  on public.subscription_sync_queue(status, requested_at);

create table if not exists public.subscription_sync_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  source text not null,
  total_tenants integer not null default 0,
  billable_tenants integer not null default 0,
  total_users integer not null default 0,
  billable_users integer not null default 0,
  stripe_updated boolean not null default false,
  status text not null check (status in ('succeeded', 'skipped', 'failed')),
  error text,
  created_at timestamptz not null default now()
);

create index if not exists subscription_sync_logs_company_idx
  on public.subscription_sync_logs(company_id, created_at desc);

create table if not exists public.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  event_type text not null,
  processing_status text not null default 'processing' check (processing_status in ('processing', 'succeeded', 'failed')),
  attempts integer not null default 1 check (attempts >= 1),
  processing_started_at timestamptz not null default now(),
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stripe_webhook_events_status_idx
  on public.stripe_webhook_events(processing_status, created_at);

create table if not exists public.billing_audit_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  event text not null,
  source text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  stripe_event_id text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists billing_audit_events_company_idx
  on public.billing_audit_events(company_id, occurred_at desc);
create index if not exists billing_audit_events_stripe_event_idx
  on public.billing_audit_events(stripe_event_id)
  where stripe_event_id is not null;

create table if not exists public.subscription_manual_grants (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  grant_type text not null check (grant_type in ('complimentary', 'extended_trial', 'manual_override')),
  override_status text check (override_status is null or override_status in ('trialing', 'active', 'past_due', 'unpaid', 'canceled', 'expired', 'incomplete', 'incomplete_expired', 'paused')),
  reason text not null check (char_length(trim(reason)) between 3 and 1000),
  expires_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists subscription_manual_grants_active_unique
  on public.subscription_manual_grants(company_id)
  where revoked_at is null;
create index if not exists subscription_manual_grants_company_idx
  on public.subscription_manual_grants(company_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Shared hierarchy and usage primitives
-- ---------------------------------------------------------------------------

create or replace function private.invoice_billing_root_company_id(p_company_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  root_company_id uuid;
begin
  with recursive company_chain(id, parent_company_id) as (
    select company.id, company.parent_company_id
    from public.companies company
    where company.id = p_company_id
    union all
    select parent.id, parent.parent_company_id
    from public.companies parent
    join company_chain child on child.parent_company_id = parent.id
  )
  select chain.id
    into root_company_id
  from company_chain chain
  where chain.parent_company_id is null
  limit 1;

  return coalesce(root_company_id, p_company_id);
end;
$$;

revoke all on function private.invoice_billing_root_company_id(uuid) from public;
grant execute on function private.invoice_billing_root_company_id(uuid) to authenticated, service_role;

create or replace function private.invoice_company_is_in_root(p_root_company_id uuid, p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with recursive descendants(id) as (
    select p_root_company_id
    union all
    select company.id
    from public.companies company
    join descendants parent on company.parent_company_id = parent.id
  )
  select exists (select 1 from descendants where id = p_company_id);
$$;

revoke all on function private.invoice_company_is_in_root(uuid, uuid) from public;
grant execute on function private.invoice_company_is_in_root(uuid, uuid) to authenticated, service_role;

create or replace function private.invoice_billable_user_count(p_root_company_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct membership.user_id)::integer
  from public.memberships membership
  join auth.users auth_user on auth_user.id = membership.user_id
  where membership.status = 'active'
    and private.invoice_company_is_in_root(p_root_company_id, membership.company_id)
    and not exists (
      select 1
      from public.membership_role_assignments assignment
      join public.app_roles assigned_role on assigned_role.id = assignment.role_id
      where assignment.membership_id = membership.id
        and lower(assigned_role.code) in ('super_admin', 'super_administrator', 'platform_owner', 'platform_admin', 'service', 'service_account', 'automation', 'system', 'internal')
    )
    and lower(coalesce(membership.role, 'employee')) not in ('super_admin', 'super_administrator', 'platform_owner', 'platform_admin', 'service', 'service_account', 'automation', 'system', 'internal')
    and not exists (
      select 1
      from public.control_platform_admins platform_admin
      where platform_admin.user_id = membership.user_id
        and platform_admin.revoked_at is null
    )
    and lower(coalesce(auth_user.raw_app_meta_data ->> 'account_type', '')) not in ('service', 'service_account', 'automation', 'system', 'internal', 'platform_admin', 'platform_owner', 'super_admin', 'super_administrator')
    and lower(coalesce(auth_user.raw_app_meta_data ->> 'user_type', '')) not in ('service', 'service_account', 'automation', 'system', 'internal', 'platform_admin', 'platform_owner', 'super_admin', 'super_administrator')
    and lower(coalesce(auth_user.raw_app_meta_data ->> 'is_service_account', 'false')) not in ('true', '1', 'yes')
    and lower(coalesce(auth_user.raw_app_meta_data ->> 'is_internal', 'false')) not in ('true', '1', 'yes');
$$;

revoke all on function private.invoice_billable_user_count(uuid) from public;
grant execute on function private.invoice_billable_user_count(uuid) to authenticated, service_role;

create or replace function private.refresh_invoice_subscription_usage(p_company_id uuid)
returns public.subscription_usage
language plpgsql
security definer
set search_path = ''
as $$
declare
  root_company_id uuid;
  tenant_count integer;
  user_count integer;
  usage_row public.subscription_usage;
begin
  -- A root can be re-parented by an administrative migration. Preserve the
  -- existing subscription owner in that case instead of deriving a different
  -- root solely from the current hierarchy.
  select case
    when exists (select 1 from public.subscription_accounts where company_id = p_company_id) then p_company_id
    else private.invoice_billing_root_company_id(p_company_id)
  end into root_company_id;

  select count(*)::integer
    into tenant_count
  from public.companies company
  where private.invoice_company_is_in_root(root_company_id, company.id)
    and company.archived_at is null;

  user_count := private.invoice_billable_user_count(root_company_id);

  insert into public.subscription_usage (
    company_id,
    total_tenants,
    billable_tenants,
    total_users,
    billable_users,
    updated_at
  )
  values (
    root_company_id,
    tenant_count,
    greatest(tenant_count - 1, 0),
    user_count,
    greatest(user_count - 1, 0),
    clock_timestamp()
  )
  on conflict (company_id) do update set
    total_tenants = excluded.total_tenants,
    billable_tenants = excluded.billable_tenants,
    total_users = excluded.total_users,
    billable_users = excluded.billable_users,
    updated_at = excluded.updated_at
  returning * into usage_row;

  insert into public.subscription_sync_queue(company_id, requested_at, status, last_error, updated_at)
  values (root_company_id, clock_timestamp(), 'pending', null, clock_timestamp())
  on conflict (company_id) do update set
    requested_at = excluded.requested_at,
    status = case when public.subscription_sync_queue.status = 'processing' then 'processing' else 'pending' end,
    last_error = null,
    updated_at = excluded.updated_at;

  return usage_row;
end;
$$;

revoke all on function private.refresh_invoice_subscription_usage(uuid) from public;
grant execute on function private.refresh_invoice_subscription_usage(uuid) to authenticated, service_role;

create or replace function private.invoice_manual_grant_active(p_root_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.subscription_manual_grants grant_row
    where grant_row.company_id = p_root_company_id
      and grant_row.revoked_at is null
      and (grant_row.expires_at is null or grant_row.expires_at > now())
  );
$$;

revoke all on function private.invoice_manual_grant_active(uuid) from public;
grant execute on function private.invoice_manual_grant_active(uuid) to authenticated, service_role;

create or replace function private.invoice_effective_status(p_company_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  root_company_id uuid := private.invoice_billing_root_company_id(p_company_id);
  account_row public.subscription_accounts;
begin
  select * into account_row
  from public.subscription_accounts
  where company_id = root_company_id;

  if account_row.id is null then
    return 'expired';
  end if;
  if account_row.manual_override_status is not null
     and (account_row.manual_override_expires_at is null or account_row.manual_override_expires_at > now()) then
    return account_row.manual_override_status;
  end if;
  if account_row.status = 'trialing' and account_row.trial_ends_at <= now() then
    return 'expired';
  end if;
  if account_row.status = 'canceled'
     and (account_row.current_period_end is null or account_row.current_period_end <= now()) then
    return 'expired';
  end if;
  return account_row.status;
end;
$$;

revoke all on function private.invoice_effective_status(uuid) from public;
grant execute on function private.invoice_effective_status(uuid) to authenticated, service_role;

create or replace function private.invoice_has_full_access(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with account as (
    select subscription.*
    from public.subscription_accounts subscription
    where subscription.company_id = private.invoice_billing_root_company_id(p_company_id)
  )
  select private.invoice_manual_grant_active(private.invoice_billing_root_company_id(p_company_id))
    or exists (
      select 1
      from account
      where (account.status = 'trialing' and account.trial_ends_at > now())
         or account.status = 'active'
         or (account.status = 'canceled' and account.current_period_end > now())
         or (account.status = 'past_due' and account.grace_period_ends_at > now())
         or (
           account.manual_override_status is not null
           and (account.manual_override_expires_at is null or account.manual_override_expires_at > now())
         )
    );
$$;

revoke all on function private.invoice_has_full_access(uuid) from public;
grant execute on function private.invoice_has_full_access(uuid) to authenticated, service_role;

create or replace function private.invoice_entitlement_allowed(p_company_id uuid, p_action text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_action in ('canView', 'canExport', 'canManageBilling') then true
    else private.invoice_has_full_access(p_company_id)
  end;
$$;

revoke all on function private.invoice_entitlement_allowed(uuid, text) from public;
grant execute on function private.invoice_entitlement_allowed(uuid, text) to authenticated, service_role;

create or replace function private.invoice_require_entitlement(p_company_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_company_id is null then
    raise exception 'A billing workspace is required' using errcode = '42501';
  end if;
  if not private.invoice_entitlement_allowed(p_company_id, p_action) then
    raise exception 'OperiX Invoice is in restricted mode. Subscribe or update billing to continue.'
      using errcode = '42501', detail = 'invoice_subscription_required';
  end if;
end;
$$;

revoke all on function private.invoice_require_entitlement(uuid, text) from public;
grant execute on function private.invoice_require_entitlement(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Trial initialization and authoritative usage queue
-- ---------------------------------------------------------------------------

create or replace function private.initialize_invoice_subscription_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  start_at timestamptz := clock_timestamp();
begin
  if new.parent_company_id is null then
    insert into public.subscription_accounts(company_id, status, trial_started_at, trial_ends_at)
    values (new.id, 'trialing', start_at, start_at + interval '14 days')
    on conflict (company_id) do nothing;
    perform private.refresh_invoice_subscription_usage(new.id);
  else
    perform private.refresh_invoice_subscription_usage(new.parent_company_id);
  end if;
  return new;
end;
$$;

drop trigger if exists companies_initialize_invoice_subscription on public.companies;
create trigger companies_initialize_invoice_subscription
after insert on public.companies
for each row execute function private.initialize_invoice_subscription_account();

create or replace function private.invoice_usage_change_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_company_id uuid;
begin
  if tg_table_name = 'companies' then
    changed_company_id := case when tg_op = 'DELETE' then old.id else new.id end;
    if changed_company_id is not null then
      perform private.refresh_invoice_subscription_usage(changed_company_id);
    end if;
    if tg_op = 'UPDATE' and old.parent_company_id is distinct from new.parent_company_id then
      perform private.refresh_invoice_subscription_usage(coalesce(old.parent_company_id, old.id));
      perform private.refresh_invoice_subscription_usage(coalesce(new.parent_company_id, new.id));
    end if;
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  elsif tg_table_name = 'membership_role_assignments' then
    if tg_op = 'DELETE' then
      select membership.company_id into changed_company_id
      from public.memberships membership
      where membership.id = old.membership_id;
    else
      select membership.company_id into changed_company_id
      from public.memberships membership
      where membership.id = new.membership_id;
    end if;
  else
    if tg_op = 'DELETE' then
      changed_company_id := nullif(to_jsonb(old) ->> 'company_id', '')::uuid;
    else
      changed_company_id := nullif(to_jsonb(new) ->> 'company_id', '')::uuid;
    end if;
  end if;
  if changed_company_id is not null then
    perform private.refresh_invoice_subscription_usage(changed_company_id);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists companies_invoice_usage_change on public.companies;
create trigger companies_invoice_usage_change
after update of archived_at, parent_company_id on public.companies
for each row execute function private.invoice_usage_change_trigger();

drop trigger if exists memberships_invoice_usage_change on public.memberships;
create trigger memberships_invoice_usage_change
after insert or update or delete on public.memberships
for each row execute function private.invoice_usage_change_trigger();

do $$
begin
  if to_regclass('public.membership_role_assignments') is not null then
    execute 'drop trigger if exists membership_role_assignments_invoice_usage_change on public.membership_role_assignments';
    execute 'create trigger membership_role_assignments_invoice_usage_change after insert or update or delete on public.membership_role_assignments for each row execute function private.invoice_usage_change_trigger()';
  end if;
end;
$$;

create or replace function private.invoice_platform_admin_usage_change_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_user_id uuid;
  company_row record;
begin
  if tg_op <> 'INSERT' then
    affected_user_id := old.user_id;
    for company_row in
      select distinct membership.company_id
      from public.memberships membership
      where membership.user_id = affected_user_id
        and membership.company_id is not null
    loop
      perform private.refresh_invoice_subscription_usage(company_row.company_id);
    end loop;
  end if;
  if tg_op <> 'DELETE' then
    affected_user_id := new.user_id;
    for company_row in
      select distinct membership.company_id
      from public.memberships membership
      where membership.user_id = affected_user_id
        and membership.company_id is not null
    loop
      perform private.refresh_invoice_subscription_usage(company_row.company_id);
    end loop;
  end if;
  return coalesce(new, old);
end;
$$;

do $$
begin
  if to_regclass('public.control_platform_admins') is not null then
    execute 'drop trigger if exists control_platform_admins_invoice_usage_change on public.control_platform_admins';
    execute 'create trigger control_platform_admins_invoice_usage_change after insert or update or delete on public.control_platform_admins for each row execute function private.invoice_platform_admin_usage_change_trigger()';
  end if;
end;
$$;

-- Existing root companies receive one rollout trial. It is created once and
-- never recreated by user, invitation, role, or subdivision changes.
insert into public.subscription_accounts(company_id, status, trial_started_at, trial_ends_at)
select company.id, 'trialing', clock_timestamp(), clock_timestamp() + interval '14 days'
from public.companies company
where company.parent_company_id is null
on conflict (company_id) do nothing;

insert into public.subscription_usage(company_id, total_tenants, billable_tenants, total_users, billable_users)
select company.id, 0, 0, 0, 0
from public.companies company
where company.parent_company_id is null
on conflict (company_id) do nothing;

do $$
declare company_row record;
begin
  for company_row in select id from public.companies where parent_company_id is null loop
    perform private.refresh_invoice_subscription_usage(company_row.id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Server-authoritative read contract and webhook idempotency
-- ---------------------------------------------------------------------------

create or replace function public.get_invoice_billing_summary(p_company_id uuid)
returns table (
  company_id uuid,
  billing_account_company_id uuid,
  product text,
  status text,
  billing_interval text,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  grace_period_ends_at timestamptz,
  total_tenants integer,
  included_tenants integer,
  billable_tenants integer,
  total_users integer,
  included_users integer,
  billable_users integer,
  estimated_monthly_total numeric(20,2),
  estimated_annual_total numeric(20,2),
  restricted boolean,
  billing_management_allowed boolean,
  usage_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  root_company_id uuid := private.invoice_billing_root_company_id(p_company_id);
  account_row public.subscription_accounts;
  usage_row public.subscription_usage;
begin
  if not public.can_access_company(p_company_id) then
    raise exception 'Billing workspace is not accessible' using errcode = '42501';
  end if;

  select * into account_row from public.subscription_accounts subscription where subscription.company_id = root_company_id;
  select * into usage_row from public.subscription_usage usage where usage.company_id = root_company_id;

  return query
  select
    p_company_id,
    root_company_id,
    coalesce(account_row.product, 'invoice'),
    coalesce(private.invoice_effective_status(root_company_id), 'expired'),
    account_row.billing_interval,
    account_row.trial_started_at,
    account_row.trial_ends_at,
    account_row.current_period_start,
    account_row.current_period_end,
    coalesce(account_row.cancel_at_period_end, false),
    account_row.grace_period_ends_at,
    coalesce(usage_row.total_tenants, 0),
    coalesce(usage_row.included_tenants, 1),
    coalesce(usage_row.billable_tenants, 0),
    coalesce(usage_row.total_users, 0),
    coalesce(usage_row.included_users, 1),
    coalesce(usage_row.billable_users, 0),
    round(9.99 + (1.99 * coalesce(usage_row.billable_tenants, 0)) + (0.99 * coalesce(usage_row.billable_users, 0)), 2),
    round(99.99 + (19.99 * coalesce(usage_row.billable_tenants, 0)) + (9.99 * coalesce(usage_row.billable_users, 0)), 2),
    not private.invoice_has_full_access(root_company_id),
    private.has_company_permission(p_company_id, 'billing.manage'),
    usage_row.updated_at;
end;
$$;

revoke all on function public.get_invoice_billing_summary(uuid) from public, anon;
grant execute on function public.get_invoice_billing_summary(uuid) to authenticated;

create or replace function public.get_invoice_entitlement(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  summary record;
begin
  select * into summary from public.get_invoice_billing_summary(p_company_id);
  if summary.company_id is null then
    raise exception 'Billing workspace is not accessible' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'company_id', summary.company_id,
    'billing_account_company_id', summary.billing_account_company_id,
    'status', summary.status,
    'trial_started_at', summary.trial_started_at,
    'trial_ends_at', summary.trial_ends_at,
    'current_period_end', summary.current_period_end,
    'cancel_at_period_end', summary.cancel_at_period_end,
    'restricted', summary.restricted,
    'canView', true,
    'canExport', true,
    'canCreateInvoice', not summary.restricted,
    'canIssueInvoice', not summary.restricted,
    'canCreateTenant', not summary.restricted,
    'canInviteUser', not summary.restricted,
    'canManageBilling', summary.billing_management_allowed
  );
end;
$$;

revoke all on function public.get_invoice_entitlement(uuid) from public, anon;
grant execute on function public.get_invoice_entitlement(uuid) to authenticated;

create or replace function public.claim_invoice_webhook_event(
  p_event_id text,
  p_event_type text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.stripe_webhook_events;
begin
  if nullif(trim(p_event_id), '') is null or nullif(trim(p_event_type), '') is null then
    raise exception 'Stripe event identity is required' using errcode = '22023';
  end if;

  insert into public.stripe_webhook_events(stripe_event_id, event_type)
  values (trim(p_event_id), trim(p_event_type))
  on conflict (stripe_event_id) do nothing;
  if found then return true; end if;

  select * into event_row
  from public.stripe_webhook_events
  where stripe_event_id = trim(p_event_id)
  for update;

  if event_row.processing_status = 'succeeded' then
    return false;
  end if;
  if event_row.processing_status = 'processing'
     and event_row.processing_started_at > now() - interval '10 minutes' then
    return false;
  end if;

  update public.stripe_webhook_events
  set processing_status = 'processing',
      attempts = event_row.attempts + 1,
      processing_started_at = now(),
      error = null,
      updated_at = now()
  where stripe_event_id = trim(p_event_id);
  return true;
end;
$$;

create or replace function public.complete_invoice_webhook_event(
  p_event_id text,
  p_error_message text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.stripe_webhook_events
  set processing_status = case when p_error_message is null then 'succeeded' else 'failed' end,
      processed_at = case when p_error_message is null then now() else null end,
      error = nullif(left(p_error_message, 1000), ''),
      updated_at = now()
  where stripe_event_id = p_event_id;
$$;

revoke all on function public.claim_invoice_webhook_event(text, text) from public, anon, authenticated;
revoke all on function public.complete_invoice_webhook_event(text, text) from public, anon, authenticated;
grant execute on function public.claim_invoice_webhook_event(text, text) to service_role;
grant execute on function public.complete_invoice_webhook_event(text, text) to service_role;

create or replace function public.claim_invoice_sync_queue(p_limit integer default 25)
returns table(company_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with claimed as (
    select queue.company_id
    from public.subscription_sync_queue queue
    where (queue.status in ('pending', 'failed') and queue.requested_at <= now())
       or (queue.status = 'processing' and queue.locked_at < now() - interval '10 minutes')
    order by queue.requested_at
    limit greatest(1, least(coalesce(p_limit, 25), 100))
    for update skip locked
  )
  update public.subscription_sync_queue queue
  set status = 'processing', locked_at = now(), attempts = queue.attempts + 1, updated_at = now()
  from claimed
  where queue.company_id = claimed.company_id
  returning queue.company_id;
end;
$$;

revoke all on function public.claim_invoice_sync_queue(integer) from public, anon, authenticated;
grant execute on function public.claim_invoice_sync_queue(integer) to service_role;

-- ---------------------------------------------------------------------------
-- Database enforcement: entitlement is checked at the data boundary.
-- ---------------------------------------------------------------------------

create or replace function private.enforce_invoice_entitlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id uuid;
  action text := 'canCreateInvoice';
  row_data jsonb;
begin
  -- Service-role workers and migrations are server-side paths. Inspect the
  -- JWT role rather than current_user because this function is SECURITY DEFINER.
  if coalesce(auth.jwt() ->> 'role', '') in ('service_role', 'supabase_admin') then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    row_data := to_jsonb(old);
  else
    row_data := to_jsonb(new);
  end if;

  if tg_table_name = 'invoice_items' then
    select invoice.company_id into target_company_id
    from public.invoices invoice
    where invoice.id = nullif(row_data ->> 'invoice_id', '')::uuid;
  elsif tg_table_name = 'companies' then
    if tg_op = 'UPDATE' then
      if (to_jsonb(old) ->> 'archived_at') is not null and (to_jsonb(new) ->> 'archived_at') is null then
        target_company_id := new.id;
        action := 'canCreateTenant';
      else
        return new;
      end if;
    elsif tg_op = 'INSERT' then
      -- A child tenant is not visible to recursive hierarchy queries until
      -- after this BEFORE trigger. Authorize it against its existing parent
      -- workspace so active trials and paid subscriptions can create tenants.
      target_company_id := coalesce(new.parent_company_id, new.id);
      action := 'canCreateTenant';
      -- A root company is the billing account itself. Its one-time trial is
      -- initialized by the AFTER INSERT trigger below before any workspace
      -- member can perform paid-product writes.
      if new.parent_company_id is null
         and not exists (select 1 from public.subscription_accounts where company_id = new.id) then
        return new;
      end if;
    else
      return old;
    end if;
  elsif tg_table_name = 'memberships' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    if tg_op = 'UPDATE' and lower(coalesce(old.status, 'active')) = 'active' and lower(coalesce(new.status, 'active')) = 'active' then
      return new;
    end if;
    if lower(coalesce(row_data ->> 'status', 'active')) <> 'active' then
      return new;
    end if;
    target_company_id := nullif(row_data ->> 'company_id', '')::uuid;
    action := 'canInviteUser';
  elsif tg_table_name = 'company_invitations' then
    if tg_op <> 'INSERT' then
      if tg_op = 'DELETE' then return old; end if;
      return new;
    end if;
    target_company_id := nullif(row_data ->> 'company_id', '')::uuid;
    action := 'canInviteUser';
  else
    target_company_id := nullif(row_data ->> 'company_id', '')::uuid;
  end if;

  if target_company_id is not null then
    perform private.invoice_require_entitlement(target_company_id, action);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_invoice_entitlement() from public;
grant execute on function private.enforce_invoice_entitlement() to authenticated, service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'companies', 'memberships', 'company_invitations', 'invoices', 'invoice_items',
    'products', 'clients', 'expenses', 'payments', 'vendors', 'vendor_payments',
    'supplier_bills', 'commercial_documents', 'journal_entries', 'chart_of_accounts',
    'customer_portal_tokens', 'contracts', 'contract_clauses', 'contract_events',
    'contract_invoice_links', 'other_income', 'customer_refunds', 'financial_adjustments',
    'inventory_stock_movements', 'product_branch_stock', 'inventory_locations',
    'inventory_movements', 'inventory_counts', 'inventory_count_lines', 'pos_payments',
    'cashier_shifts', 'cashier_shift_movements', 'cashier_shift_events', 'payment_links',
    'invoice_reminders', 'recurring_invoice_templates'
  ] loop
    if exists (
      select 1
      from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = table_name
        and relation.relkind in ('r', 'p')
    ) then
      execute format('drop trigger if exists invoice_entitlement_guard on public.%I', table_name);
      execute format('create trigger invoice_entitlement_guard before insert or update or delete on public.%I for each row execute function private.enforce_invoice_entitlement()', table_name);
    end if;
  end loop;
end;
$$;

-- The trusted atomic invoice writer is still the only supported write path,
-- but its public wrapper now explicitly checks the subscription as well as RBAC.
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
  target_company_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_invoice_id is not null then
    select invoice.company_id into target_company_id
    from public.invoices invoice
    where invoice.id = p_invoice_id;
    if target_company_id is null or not private.has_company_permission(target_company_id, 'sales_invoice.edit') then
      raise exception 'Insufficient permission to edit sales invoices' using errcode = '42501';
    end if;
    perform private.invoice_require_entitlement(target_company_id, 'canCreateInvoice');
  else
    target_company_id := nullif(p_invoice ->> 'company_id', '')::uuid;
    perform private.invoice_require_entitlement(target_company_id, 'canCreateInvoice');
    perform set_config('app.document_create_workflow', 'authorized', true);
  end if;
  return public.save_invoice_document_unchecked(p_invoice, p_items, p_invoice_id, p_post_invoice, p_idempotency_key);
end;
$$;

revoke all on function public.save_invoice_document(jsonb, jsonb, uuid, boolean, uuid) from public, anon;
grant execute on function public.save_invoice_document(jsonb, jsonb, uuid, boolean, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Control projections and privileged grant/metric APIs
-- ---------------------------------------------------------------------------

create or replace function public.control_invoice_billing_overview(p_company_id uuid)
returns table (
  provider text,
  plan_name text,
  status text,
  billing_cycle text,
  next_invoice_at timestamptz,
  current_period_end timestamptz,
  seat_limit integer,
  storage_limit_bytes bigint,
  portal_url text,
  stripe_account_hint text,
  stripe_connected_at timestamptz,
  total_tenants integer,
  included_tenants integer,
  billable_tenants integer,
  total_users integer,
  included_users integer,
  billable_users integer,
  estimated_monthly_total numeric(20,2),
  estimated_annual_total numeric(20,2),
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  cancel_at_period_end boolean,
  grace_period_ends_at timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  summary record;
  root_company_id uuid := private.invoice_billing_root_company_id(p_company_id);
  account_row public.subscription_accounts;
begin
  if not private.has_company_permission(p_company_id, 'billing.read') then
    raise exception 'Billing access denied' using errcode = '42501';
  end if;
  select * into summary from public.get_invoice_billing_summary(p_company_id);
  select * into account_row from public.subscription_accounts where company_id = root_company_id;
  return query select
    'stripe',
    'OperiX Invoice Pro',
    summary.status,
    summary.billing_interval,
    summary.current_period_end,
    summary.current_period_end,
    summary.total_users,
    null::bigint,
    null::text,
    null::text,
    null::timestamptz,
    summary.total_tenants,
    summary.included_tenants,
    summary.billable_tenants,
    summary.total_users,
    summary.included_users,
    summary.billable_users,
    summary.estimated_monthly_total,
    summary.estimated_annual_total,
    summary.trial_started_at,
    summary.trial_ends_at,
    summary.cancel_at_period_end,
    summary.grace_period_ends_at,
    account_row.stripe_customer_id,
    account_row.stripe_subscription_id;
end;
$$;

revoke all on function public.control_invoice_billing_overview(uuid) from public, anon;
grant execute on function public.control_invoice_billing_overview(uuid) to authenticated;

create or replace function public.control_list_invoice_billing_accounts()
returns table (
  id uuid,
  company_id uuid,
  workspace_name text,
  status text,
  billing_interval text,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  total_tenants integer,
  billable_tenants integer,
  total_users integer,
  billable_users integer,
  current_value numeric(20,2),
  next_renewal_at timestamptz,
  cancel_at_period_end boolean,
  stripe_customer_id text,
  stripe_subscription_id text,
  past_due boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.control_is_platform_admin() then
    raise exception 'Platform administration denied' using errcode = '42501';
  end if;
  return query
  select
    account.id,
    account.company_id,
    coalesce(company.company_name, company.name, 'Unnamed workspace'),
    private.invoice_effective_status(account.company_id),
    account.billing_interval,
    account.trial_started_at,
    account.trial_ends_at,
    coalesce(usage.total_tenants, 0),
    coalesce(usage.billable_tenants, 0),
    coalesce(usage.total_users, 0),
    coalesce(usage.billable_users, 0),
    case when account.billing_interval = 'annual'
      then round(99.99 + 19.99 * coalesce(usage.billable_tenants, 0) + 9.99 * coalesce(usage.billable_users, 0), 2)
      else round(9.99 + 1.99 * coalesce(usage.billable_tenants, 0) + 0.99 * coalesce(usage.billable_users, 0), 2)
    end,
    account.current_period_end,
    account.cancel_at_period_end,
    account.stripe_customer_id,
    account.stripe_subscription_id,
    private.invoice_effective_status(account.company_id) = 'past_due',
    account.created_at
  from public.subscription_accounts account
  join public.companies company on company.id = account.company_id
  left join public.subscription_usage usage on usage.company_id = account.company_id
  order by account.created_at desc;
end;
$$;

revoke all on function public.control_list_invoice_billing_accounts() from public, anon;
grant execute on function public.control_list_invoice_billing_accounts() to authenticated;

create or replace function public.control_invoice_billing_metrics()
returns table(metric text, value numeric(20,2))
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.control_is_platform_admin() then
    raise exception 'Platform administration denied' using errcode = '42501';
  end if;
  return query
  with values_by_account as (
    select
      account.id,
      private.invoice_effective_status(account.company_id) as status,
      case when account.billing_interval = 'annual'
        then round(99.99 + 19.99 * coalesce(usage.billable_tenants, 0) + 9.99 * coalesce(usage.billable_users, 0), 2)
        else round(9.99 + 1.99 * coalesce(usage.billable_tenants, 0) + 0.99 * coalesce(usage.billable_users, 0), 2)
      end as period_value,
      account.billing_interval
    from public.subscription_accounts account
    left join public.subscription_usage usage on usage.company_id = account.company_id
  ), metrics as (
    select 'mrr'::text as metric, coalesce(sum(case when status in ('active', 'past_due', 'canceled') then case when billing_interval = 'annual' then period_value / 12 else period_value end else 0 end), 0)::numeric(20,2) as value from values_by_account
    union all select 'arr', coalesce(sum(case when status in ('active', 'past_due', 'canceled') then case when billing_interval = 'annual' then period_value else period_value * 12 end else 0 end), 0)::numeric(20,2) from values_by_account
    union all select 'active_subscriptions', count(*)::numeric from values_by_account where status in ('active', 'past_due', 'canceled')
    union all select 'trialing_accounts', count(*)::numeric from values_by_account where status = 'trialing'
    union all select 'trial_conversion_rate', coalesce(round(
      100.0 * count(*) filter (where status in ('active', 'past_due', 'unpaid', 'canceled', 'paused'))
      / nullif(count(*) filter (where status <> 'trialing'), 0), 2
    ), 0)::numeric(20,2) from values_by_account
    union all select 'past_due_accounts', count(*)::numeric from values_by_account where status = 'past_due'
    union all select 'canceled_accounts', count(*)::numeric from values_by_account where status = 'canceled'
  ) select metrics.metric, metrics.value from metrics order by metrics.metric;
end;
$$;

revoke all on function public.control_invoice_billing_metrics() from public, anon;
grant execute on function public.control_invoice_billing_metrics() to authenticated;

create or replace function public.control_create_invoice_manual_grant(
  p_company_id uuid,
  p_grant_type text,
  p_reason text,
  p_expires_at timestamptz default null,
  p_override_status text default 'active'
)
returns public.subscription_manual_grants
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  root_company_id uuid := private.invoice_billing_root_company_id(p_company_id);
  grant_row public.subscription_manual_grants;
begin
  if not public.control_is_platform_admin() or actor_id is null then
    raise exception 'Platform administration denied' using errcode = '42501';
  end if;
  if p_grant_type not in ('complimentary', 'extended_trial', 'manual_override') then
    raise exception 'Unsupported manual grant type' using errcode = '22023';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'A manual grant reason is required' using errcode = '23514';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Manual grant expiry must be in the future' using errcode = '23514';
  end if;
  if p_override_status is not null and p_override_status not in ('trialing', 'active', 'past_due', 'unpaid', 'canceled', 'expired', 'incomplete', 'incomplete_expired', 'paused') then
    raise exception 'Unsupported manual grant status' using errcode = '22023';
  end if;

  update public.subscription_manual_grants
  set revoked_at = now(), revoked_by = actor_id, updated_at = now()
  where company_id = root_company_id and revoked_at is null;

  insert into public.subscription_manual_grants(company_id, grant_type, override_status, reason, expires_at, created_by)
  values (root_company_id, p_grant_type, case when p_grant_type = 'extended_trial' then 'trialing' else p_override_status end, trim(p_reason), p_expires_at, actor_id)
  returning * into grant_row;

  update public.subscription_accounts
  set manual_override_status = case when p_grant_type = 'extended_trial' then 'trialing' else p_override_status end,
      manual_override_expires_at = p_expires_at,
      updated_at = now()
  where company_id = root_company_id;

  insert into public.billing_audit_events(company_id, event, source, actor_user_id, metadata)
  values (root_company_id, case when p_grant_type = 'extended_trial' then 'trial_extended' else 'manual_grant' end, 'operix_control', actor_id, jsonb_build_object('grant_type', p_grant_type, 'reason', trim(p_reason), 'expires_at', p_expires_at, 'override_status', p_override_status));
  return grant_row;
end;
$$;

create or replace function public.control_revoke_invoice_manual_grant(p_company_id uuid, p_grant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  root_company_id uuid := private.invoice_billing_root_company_id(p_company_id);
begin
  if not public.control_is_platform_admin() or actor_id is null then
    raise exception 'Platform administration denied' using errcode = '42501';
  end if;
  update public.subscription_manual_grants
  set revoked_at = now(), revoked_by = actor_id, updated_at = now()
  where id = p_grant_id and company_id = root_company_id and revoked_at is null;
  update public.subscription_accounts
  set manual_override_status = null, manual_override_expires_at = null, updated_at = now()
  where company_id = root_company_id;
  insert into public.billing_audit_events(company_id, event, source, actor_user_id, metadata)
  values (root_company_id, 'manual_grant_revoked', 'operix_control', actor_id, jsonb_build_object('grant_id', p_grant_id));
end;
$$;

revoke all on function public.control_create_invoice_manual_grant(uuid, text, text, timestamptz, text) from public, anon;
revoke all on function public.control_revoke_invoice_manual_grant(uuid, uuid) from public, anon;
grant execute on function public.control_create_invoice_manual_grant(uuid, text, text, timestamptz, text) to authenticated;
grant execute on function public.control_revoke_invoice_manual_grant(uuid, uuid) to authenticated;

-- Sensitive billing tables are never directly writable/readable by the
-- browser except through their scoped read policy or explicit RPC contract.
alter table public.subscription_accounts enable row level security;
alter table public.subscription_usage enable row level security;
alter table public.subscription_sync_queue enable row level security;
alter table public.subscription_sync_logs enable row level security;
alter table public.stripe_webhook_events enable row level security;
alter table public.billing_audit_events enable row level security;
alter table public.subscription_manual_grants enable row level security;

revoke all on public.subscription_accounts, public.subscription_usage, public.subscription_sync_queue, public.subscription_sync_logs, public.stripe_webhook_events, public.billing_audit_events, public.subscription_manual_grants from anon, authenticated;
grant select on public.subscription_accounts, public.subscription_usage, public.billing_audit_events to authenticated;

drop policy if exists subscription_accounts_billing_read on public.subscription_accounts;
create policy subscription_accounts_billing_read
on public.subscription_accounts for select to authenticated
using (private.has_company_permission(private.invoice_billing_root_company_id(company_id), 'billing.read'));

drop policy if exists subscription_usage_billing_read on public.subscription_usage;
create policy subscription_usage_billing_read
on public.subscription_usage for select to authenticated
using (private.has_company_permission(private.invoice_billing_root_company_id(company_id), 'billing.read'));

drop policy if exists billing_audit_events_billing_read on public.billing_audit_events;
create policy billing_audit_events_billing_read
on public.billing_audit_events for select to authenticated
using (private.has_company_permission(private.invoice_billing_root_company_id(company_id), 'billing.read'));

notify pgrst, 'reload schema';

commit;
