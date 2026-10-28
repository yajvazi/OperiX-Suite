-- OperiX product-based subscriptions.
--
-- This migration evolves the existing Invoice-only subscription_accounts ledger
-- in place. It does not create a second subscription source of truth and it
-- does not delete financial, tenant, user, or historical trial data.

begin;

-- Older installs created the workspace table before the legacy settings
-- migration was normalized. Keep the subscription trigger contract explicit
-- so a clean database and an upgraded database expose the same columns.
alter table if exists public.companies
  add column if not exists settings jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- Evolve the existing subscription ledger from one Invoice row per company to
-- one row per organization + purchasable plan.
-- ---------------------------------------------------------------------------

alter table if exists public.subscription_accounts
  drop constraint if exists subscription_accounts_company_id_key;
alter table if exists public.subscription_accounts
  drop constraint if exists subscription_accounts_product_check;
alter table if exists public.subscription_accounts
  drop constraint if exists subscription_accounts_stripe_customer_id_key;
alter table if exists public.subscription_accounts
  drop constraint if exists subscription_accounts_scheduled_plan_check;
alter table if exists public.subscription_accounts
  drop constraint if exists subscription_accounts_scheduled_interval_check;

alter table if exists public.subscription_accounts
  add column if not exists scheduled_plan text,
  add column if not exists scheduled_billing_interval text,
  add column if not exists scheduled_change_at timestamptz,
  add column if not exists source text not null default 'stripe',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists last_error text;

-- Paid subscriptions do not always have a trial. Preserve existing values but
-- allow Stripe-created paid accounts to leave trial timestamps null.
alter table if exists public.subscription_accounts
  alter column trial_started_at drop not null,
  alter column trial_ends_at drop not null;

alter table if exists public.subscription_accounts
  add constraint subscription_accounts_product_check
  check (product in ('invoice', 'booking', 'suite'));

alter table if exists public.subscription_accounts
  add constraint subscription_accounts_scheduled_plan_check
  check (scheduled_plan is null or scheduled_plan in ('invoice', 'booking', 'suite'));

alter table if exists public.subscription_accounts
  add constraint subscription_accounts_scheduled_interval_check
  check (scheduled_billing_interval is null or scheduled_billing_interval in ('monthly', 'annual'));

create unique index if not exists subscription_accounts_company_product_key
  on public.subscription_accounts(company_id, product);
create index if not exists subscription_accounts_company_status_idx
  on public.subscription_accounts(company_id, status, current_period_end);
create index if not exists subscription_accounts_source_idx
  on public.subscription_accounts(source, product);
create index if not exists subscription_accounts_customer_idx
  on public.subscription_accounts(stripe_customer_id)
  where stripe_customer_id is not null;

alter table if exists public.subscription_manual_grants
  drop constraint if exists subscription_manual_grants_grant_type_check;
alter table if exists public.subscription_manual_grants
  drop constraint if exists subscription_manual_grants_product_check;
alter table if exists public.subscription_manual_grants
  add column if not exists product text not null default 'invoice';
alter table if exists public.subscription_manual_grants
  add constraint subscription_manual_grants_product_check
  check (product in ('invoice', 'booking', 'suite', 'hr', 'desk'));
alter table if exists public.subscription_manual_grants
  add constraint subscription_manual_grants_grant_type_check
  check (grant_type in ('complimentary', 'extended_trial', 'manual_override'));
drop index if exists public.subscription_manual_grants_active_unique;
create unique index if not exists subscription_manual_grants_active_product_unique
  on public.subscription_manual_grants(company_id, product)
  where revoked_at is null;

-- ---------------------------------------------------------------------------
-- Durable product trial history and independent product entitlements.
-- ---------------------------------------------------------------------------

create table if not exists public.subscription_trials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  product_or_plan text not null check (product_or_plan in ('invoice', 'booking', 'suite')),
  started_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'trialing' check (status in ('trialing', 'completed', 'expired', 'canceled')),
  consumed boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, product_or_plan)
);

create index if not exists subscription_trials_expiry_idx
  on public.subscription_trials(status, ends_at);

create table if not exists public.organization_product_entitlements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  product text not null check (product in ('invoice', 'booking', 'hr', 'desk')),
  source text not null check (source in ('subscription', 'trial', 'enterprise_contract', 'manual_grant')),
  source_id uuid not null,
  enabled boolean not null default false,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, product, source, source_id)
);

create index if not exists organization_product_entitlements_lookup_idx
  on public.organization_product_entitlements(company_id, product, enabled, starts_at, ends_at);

create table if not exists public.enterprise_contracts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  contract_name text not null check (char_length(trim(contract_name)) between 1 and 200),
  custom_price numeric(20, 4),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  billing_interval text check (billing_interval is null or billing_interval in ('monthly', 'annual', 'custom')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  status text not null default 'active' check (status in ('draft', 'trialing', 'active', 'expired', 'canceled')),
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  seat_limit integer check (seat_limit is null or seat_limit >= 0),
  tenant_limit integer check (tenant_limit is null or tenant_limit >= 0),
  product_limits jsonb not null default '{}'::jsonb,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists enterprise_contracts_company_status_idx
  on public.enterprise_contracts(company_id, status, starts_at, ends_at);

create table if not exists public.enterprise_contract_products (
  contract_id uuid not null references public.enterprise_contracts(id) on delete cascade,
  product text not null check (product in ('hr', 'desk')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (contract_id, product)
);

create index if not exists enterprise_contract_products_product_idx
  on public.enterprise_contract_products(product, enabled);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.enterprise_contracts'::regclass
      and conname = 'enterprise_contracts_custom_price_nonnegative'
  ) then
    alter table public.enterprise_contracts
      add constraint enterprise_contracts_custom_price_nonnegative
      check (custom_price is null or custom_price >= 0);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Product access primitives.
-- ---------------------------------------------------------------------------

create or replace function private.operix_server_request()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- This function is SECURITY DEFINER, so current_user is the function
  -- owner for ordinary PostgREST calls. Trust only the verified JWT role;
  -- otherwise every authenticated RPC would look like a server request.
  select coalesce(current_setting('request.jwt.claim.role', true), '') in ('service_role', 'supabase_admin');
$$;

revoke all on function private.operix_server_request() from public;
grant execute on function private.operix_server_request() to authenticated, service_role;

-- SECURITY DEFINER functions execute with their owner's database role. Do not
-- use current_user = postgres as proof that a client mutation is trusted:
-- PostgREST invokes many authenticated RPCs through a postgres-owned
-- SECURITY DEFINER function. Only service-role/server claims (or the
-- separate platform-admin role) may bypass product write guards.
create or replace function private.operix_privileged_request()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select current_user = 'supabase_admin'
    or coalesce(current_setting('request.jwt.claim.role', true), '') in ('service_role', 'supabase_admin');
$$;

revoke all on function private.operix_privileged_request() from public;
grant execute on function private.operix_privileged_request() to authenticated, service_role;

create or replace function private.operix_status_has_access(
  p_status text,
  p_trial_ends_at timestamptz,
  p_period_end timestamptz,
  p_grace_ends_at timestamptz,
  p_manual_status text default null,
  p_manual_expires_at timestamptz default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_manual_status is not null
      and (p_manual_expires_at is null or p_manual_expires_at > now())
      and p_manual_status in ('active', 'trialing') then true
    when p_status = 'trialing' then p_trial_ends_at > now()
    when p_status = 'active' then true
    when p_status = 'canceled' then p_period_end > now()
    when p_status = 'past_due' then p_grace_ends_at > now()
    else false
  end;
$$;

revoke all on function private.operix_status_has_access(text, timestamptz, timestamptz, timestamptz, text, timestamptz) from public;
grant execute on function private.operix_status_has_access(text, timestamptz, timestamptz, timestamptz, text, timestamptz) to authenticated, service_role;

create or replace function private.operix_effective_status(
  p_status text,
  p_trial_ends_at timestamptz,
  p_period_end timestamptz,
  p_grace_ends_at timestamptz,
  p_manual_status text default null,
  p_manual_expires_at timestamptz default null
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_manual_status is not null
      and (p_manual_expires_at is null or p_manual_expires_at > now()) then p_manual_status
    when p_status = 'trialing' and (p_trial_ends_at is null or p_trial_ends_at <= now()) then 'expired'
    when p_status = 'canceled' and (p_period_end is null or p_period_end <= now()) then 'expired'
    else coalesce(p_status, 'expired')
  end;
$$;

revoke all on function private.operix_effective_status(text, timestamptz, timestamptz, timestamptz, text, timestamptz) from public;
grant execute on function private.operix_effective_status(text, timestamptz, timestamptz, timestamptz, text, timestamptz) to authenticated, service_role;

create or replace function private.operix_product_access(p_company_id uuid, p_product text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with root as (
    select private.invoice_billing_root_company_id(p_company_id) as company_id
  )
  select exists (
    select 1
    from public.organization_product_entitlements entitlement
    join root on root.company_id = entitlement.company_id
    where entitlement.product = lower(trim(p_product))
      and entitlement.enabled
      and entitlement.starts_at <= now()
      and (entitlement.ends_at is null or entitlement.ends_at > now())
  )
  or exists (
    select 1
    from public.subscription_accounts account
    join root on root.company_id = account.company_id
    where (
      account.product = lower(trim(p_product))
      or (account.product = 'suite' and lower(trim(p_product)) in ('invoice', 'booking'))
    )
      and private.operix_status_has_access(
        account.status,
        account.trial_ends_at,
        account.current_period_end,
        account.grace_period_ends_at,
        account.manual_override_status,
        account.manual_override_expires_at
      )
  )
  or exists (
    select 1
    from public.enterprise_contract_products contract_product
    join public.enterprise_contracts contract on contract.id = contract_product.contract_id
    join root on root.company_id = contract.company_id
    where contract_product.product = lower(trim(p_product))
      and contract_product.enabled
      and contract.status in ('trialing', 'active')
      and contract.starts_at <= now()
      and (contract.ends_at is null or contract.ends_at > now())
      and (contract.trial_ends_at is null or contract.trial_ends_at > now() or contract.status = 'active')
  )
  or exists (
    select 1
    from public.subscription_manual_grants grant_row
    join root on root.company_id = grant_row.company_id
    where grant_row.product = 'suite'
      and lower(trim(p_product)) = 'suite'
      and coalesce(grant_row.override_status, 'active') in ('active', 'trialing')
      and grant_row.revoked_at is null
      and (grant_row.expires_at is null or grant_row.expires_at > now())
  );
$$;

revoke all on function private.operix_product_access(uuid, text) from public;
grant execute on function private.operix_product_access(uuid, text) to authenticated, service_role;

create or replace function private.operix_any_product_access(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.operix_product_access(p_company_id, 'invoice')
      or private.operix_product_access(p_company_id, 'booking')
      or private.operix_product_access(p_company_id, 'hr')
      or private.operix_product_access(p_company_id, 'desk');
$$;

revoke all on function private.operix_any_product_access(uuid) from public;
grant execute on function private.operix_any_product_access(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Durable trial creation. This is called by product summary reads and is
-- scoped by can_access_company before it is exposed through a public RPC.
-- ---------------------------------------------------------------------------

create or replace function private.ensure_operix_product_trial(p_company_id uuid, p_plan text)
returns public.subscription_trials
language plpgsql
security definer
set search_path = ''
as $$
declare
  root_company_id uuid;
  trial_row public.subscription_trials;
  linked_trial public.subscription_trials;
  linked_status text;
  start_time timestamptz := now();
  end_time timestamptz := now() + interval '14 days';
begin
  root_company_id := private.invoice_billing_root_company_id(p_company_id);
  if p_plan not in ('invoice', 'booking', 'suite') then
    raise exception 'Unsupported trial plan' using errcode = '22023';
  end if;

  select * into trial_row
  from public.subscription_trials
  where company_id = root_company_id and product_or_plan = p_plan
  for update;

  if trial_row.id is null then
    -- Suite is one shared trial clock. If an organization has already begun
    -- an Invoice or Booking trial (including the legacy Invoice trial seeded
    -- at workspace creation), expose the same clock to Suite instead of
    -- granting a second 14-day window. The inverse also applies when a
    -- product is opened after a Suite trial.
    if p_plan = 'suite' then
      select * into linked_trial
      from public.subscription_trials
      where company_id = root_company_id
        and product_or_plan in ('invoice', 'booking')
      order by ends_at asc, started_at asc
      limit 1;
    else
      select * into linked_trial
      from public.subscription_trials
      where company_id = root_company_id
        and product_or_plan = 'suite'
      limit 1;
    end if;

    if linked_trial.id is not null then
      linked_status := case
        when linked_trial.status = 'trialing' and linked_trial.ends_at <= now() then 'expired'
        else linked_trial.status
      end;
      insert into public.subscription_trials(
        company_id, product_or_plan, started_at, ends_at, status, consumed, metadata
      ) values (
        root_company_id,
        p_plan,
        linked_trial.started_at,
        linked_trial.ends_at,
        linked_status,
        linked_trial.consumed,
        linked_trial.metadata || jsonb_build_object('linked_trial', linked_trial.product_or_plan)
      ) on conflict (company_id, product_or_plan) do nothing
      returning * into trial_row;

      if trial_row.id is null then
        select * into trial_row
        from public.subscription_trials
        where company_id = root_company_id and product_or_plan = p_plan
        for update;
      end if;

      insert into public.subscription_accounts(
        company_id, product, status, trial_started_at, trial_ends_at, source
      ) values (
        root_company_id, p_plan, linked_status, linked_trial.started_at, linked_trial.ends_at, 'trial'
      ) on conflict (company_id, product) do nothing;
    else
      insert into public.subscription_trials(company_id, product_or_plan, started_at, ends_at, status, consumed)
      values (root_company_id, p_plan, start_time, end_time, 'trialing', false)
      on conflict (company_id, product_or_plan) do nothing
      returning * into trial_row;

      -- Two first-time summary reads can arrive concurrently. The unique
      -- constraint prevents duplication; reload the winner so both callers
      -- receive the same durable trial clock instead of a transient conflict.
      if trial_row.id is null then
        select * into trial_row
        from public.subscription_trials
        where company_id = root_company_id and product_or_plan = p_plan
        for update;
      end if;

      insert into public.subscription_accounts(
        company_id, product, status, trial_started_at, trial_ends_at, source
      ) values (
        root_company_id, p_plan, 'trialing', start_time, end_time, 'trial'
      ) on conflict (company_id, product) do nothing;
    end if;
  end if;

  return trial_row;
end;
$$;

revoke all on function private.ensure_operix_product_trial(uuid, text) from public;
grant execute on function private.ensure_operix_product_trial(uuid, text) to authenticated, service_role;

create or replace function public.billing_consume_product_trials(p_company_id uuid, p_plan text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  root_company_id uuid;
  trial_product text;
  products text[];
begin
  if not private.operix_server_request() then
    raise exception 'Server billing path required' using errcode = '42501';
  end if;
  if p_plan not in ('invoice', 'booking', 'suite') then
    raise exception 'Unsupported paid product' using errcode = '22023';
  end if;
  root_company_id := private.invoice_billing_root_company_id(p_company_id);
  products := case when p_plan = 'suite' then array['invoice', 'booking', 'suite']::text[] else array[p_plan]::text[] end;
  foreach trial_product in array products loop
    insert into public.subscription_trials(company_id, product_or_plan, started_at, ends_at, status, consumed, metadata)
    values (root_company_id, trial_product, now(), now(), 'completed', true, jsonb_build_object('consumed_by', p_plan, 'source', 'paid_subscription'))
    on conflict (company_id, product_or_plan) do update
      set status = 'completed', consumed = true, updated_at = now(), metadata = public.subscription_trials.metadata || jsonb_build_object('consumed_by', p_plan, 'source', 'paid_subscription');
  end loop;
end;
$$;

revoke all on function public.billing_consume_product_trials(uuid, text) from public, anon, authenticated;
grant execute on function public.billing_consume_product_trials(uuid, text) to service_role;

-- The legacy usage function is retained as the single metering entry point,
-- but its tenant predicate is made product-safe for schemas that encode
-- internal/demo/deleted/suspended state in the existing companies.settings
-- JSON. Archived tenants remain historical data and stop billing here.
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
  select case
    when exists (select 1 from public.subscription_accounts where company_id = p_company_id) then p_company_id
    else private.invoice_billing_root_company_id(p_company_id)
  end into root_company_id;

  select count(*)::integer
    into tenant_count
  from public.companies company
  where private.invoice_company_is_in_root(root_company_id, company.id)
    and company.archived_at is null
    and lower(coalesce(company.settings ->> 'status', 'active')) not in ('archived', 'deleted', 'suspended', 'disabled', 'inactive')
    and lower(coalesce(company.settings ->> 'is_internal', 'false')) not in ('true', '1', 'yes')
    and lower(coalesce(company.settings ->> 'is_demo', 'false')) not in ('true', '1', 'yes')
    and nullif(company.settings ->> 'deleted_at', '') is null
    and nullif(company.settings ->> 'suspended_at', '') is null;

  user_count := private.invoice_billable_user_count(root_company_id);

  insert into public.subscription_usage (
    company_id, total_tenants, billable_tenants, total_users, billable_users, updated_at
  )
  values (
    root_company_id, tenant_count, greatest(tenant_count - 1, 0), user_count,
    greatest(user_count - 1, 0), clock_timestamp()
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

-- The earlier Invoice migration installed this trigger before the product
-- ledger existed. Replace its company-only conflict target and keep the
-- company-created trial path compatible with the product-aware tables.
create or replace function private.initialize_invoice_subscription_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  root_company_id uuid;
begin
  root_company_id := coalesce(new.parent_company_id, new.id);
  perform private.ensure_operix_product_trial(root_company_id, 'invoice');
  perform private.refresh_invoice_subscription_usage(root_company_id);
  return new;
end;
$$;

drop trigger if exists companies_initialize_invoice_subscription on public.companies;
create trigger companies_initialize_invoice_subscription
after insert on public.companies
for each row execute function private.initialize_invoice_subscription_account();

-- ---------------------------------------------------------------------------
-- Entitlement projection. The table is the independent product-access model;
-- subscription/trial/enterprise records remain the auditable sources.
-- ---------------------------------------------------------------------------

create or replace function public.billing_refresh_product_entitlements(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  root_company_id uuid;
  account_row record;
  trial_row record;
  contract_row record;
  grant_row record;
  target_product text;
begin
  if not private.operix_server_request() then
    raise exception 'Server billing path required' using errcode = '42501';
  end if;

  root_company_id := private.invoice_billing_root_company_id(p_company_id);
  -- Projection refresh is delete-and-rebuild by design. Serialize it per
  -- billing account so concurrent webhook, summary, and Control requests do
  -- not race on the source_id uniqueness constraint.
  perform pg_advisory_xact_lock(hashtextextended(root_company_id::text, 0));
  delete from public.organization_product_entitlements where company_id = root_company_id;

  for account_row in
    select * from public.subscription_accounts where company_id = root_company_id
  loop
    if private.operix_status_has_access(
      account_row.status,
      account_row.trial_ends_at,
      account_row.current_period_end,
      account_row.grace_period_ends_at,
      account_row.manual_override_status,
      account_row.manual_override_expires_at
    ) then
      if account_row.product = 'suite' then
        foreach target_product in array array['invoice', 'booking'] loop
          insert into public.organization_product_entitlements(company_id, product, source, source_id, enabled, starts_at, ends_at, metadata)
          values (root_company_id, target_product, 'subscription', account_row.id, true, coalesce(account_row.current_period_start, account_row.created_at), case when account_row.status = 'canceled' then account_row.current_period_end when account_row.status = 'past_due' then account_row.grace_period_ends_at when account_row.status = 'trialing' then account_row.trial_ends_at else null end, jsonb_build_object('plan', account_row.product, 'subscription_id', account_row.stripe_subscription_id));
        end loop;
      else
        insert into public.organization_product_entitlements(company_id, product, source, source_id, enabled, starts_at, ends_at, metadata)
        values (root_company_id, account_row.product, 'subscription', account_row.id, true, coalesce(account_row.current_period_start, account_row.created_at), case when account_row.status = 'canceled' then account_row.current_period_end when account_row.status = 'past_due' then account_row.grace_period_ends_at when account_row.status = 'trialing' then account_row.trial_ends_at else null end, jsonb_build_object('plan', account_row.product, 'subscription_id', account_row.stripe_subscription_id));
      end if;
    end if;
  end loop;

  for trial_row in
    select * from public.subscription_trials where company_id = root_company_id and status = 'trialing' and ends_at > now()
  loop
    if trial_row.product_or_plan = 'suite' then
      foreach target_product in array array['invoice', 'booking'] loop
        insert into public.organization_product_entitlements(company_id, product, source, source_id, enabled, starts_at, ends_at, metadata)
        values (root_company_id, target_product, 'trial', trial_row.id, true, trial_row.started_at, trial_row.ends_at, jsonb_build_object('plan', trial_row.product_or_plan));
      end loop;
    else
      insert into public.organization_product_entitlements(company_id, product, source, source_id, enabled, starts_at, ends_at, metadata)
      values (root_company_id, trial_row.product_or_plan, 'trial', trial_row.id, true, trial_row.started_at, trial_row.ends_at, jsonb_build_object('plan', trial_row.product_or_plan));
    end if;
  end loop;

  for grant_row in
    select * from public.subscription_manual_grants
    where company_id = root_company_id
      and revoked_at is null
      and coalesce(override_status, 'active') in ('active', 'trialing')
      and (expires_at is null or expires_at > now())
  loop
    if grant_row.product = 'suite' then
      foreach target_product in array array['invoice', 'booking'] loop
        insert into public.organization_product_entitlements(company_id, product, source, source_id, enabled, starts_at, ends_at, metadata)
        values (root_company_id, target_product, 'manual_grant', grant_row.id, true, grant_row.created_at, grant_row.expires_at, jsonb_build_object('grant_type', grant_row.grant_type, 'reason', grant_row.reason));
      end loop;
    else
      insert into public.organization_product_entitlements(company_id, product, source, source_id, enabled, starts_at, ends_at, metadata)
      values (root_company_id, grant_row.product, 'manual_grant', grant_row.id, true, grant_row.created_at, grant_row.expires_at, jsonb_build_object('grant_type', grant_row.grant_type, 'reason', grant_row.reason));
    end if;
  end loop;

  for contract_row in
    select contract.id, contract.company_id, contract.starts_at, contract.ends_at, contract.status, contract.trial_ends_at, product.product
    from public.enterprise_contracts contract
    join public.enterprise_contract_products product on product.contract_id = contract.id
    where contract.company_id = root_company_id
      and product.enabled
      and contract.status in ('trialing', 'active')
      and contract.starts_at <= now()
      and (contract.ends_at is null or contract.ends_at > now())
      and (contract.trial_ends_at is null or contract.trial_ends_at > now() or contract.status = 'active')
  loop
          insert into public.organization_product_entitlements(company_id, product, source, source_id, enabled, starts_at, ends_at, metadata)
          values (
            root_company_id,
            contract_row.product,
            'enterprise_contract',
            contract_row.id,
            true,
            contract_row.starts_at,
            case when contract_row.status = 'trialing' then contract_row.trial_ends_at else contract_row.ends_at end,
            jsonb_build_object('contract_id', contract_row.id, 'trial_ends_at', contract_row.trial_ends_at)
          );
  end loop;
end;
$$;

revoke all on function public.billing_refresh_product_entitlements(uuid) from public, anon, authenticated;
grant execute on function public.billing_refresh_product_entitlements(uuid) to service_role;

-- Backfill durable Invoice trial history from the existing Invoice-only ledger.
insert into public.subscription_trials(company_id, product_or_plan, started_at, ends_at, status, consumed, metadata)
select account.company_id,
       'invoice',
       account.trial_started_at,
       account.trial_ends_at,
       case when account.status = 'trialing' and account.trial_ends_at > now() then 'trialing' else 'expired' end,
       not (account.status = 'trialing' and account.trial_ends_at > now()),
       jsonb_build_object('migrated_from', 'invoice_subscription_billing')
from public.subscription_accounts account
where account.product = 'invoice'
on conflict (company_id, product_or_plan) do nothing;

-- Ensure old rows which still say source=stripe retain their current access
-- projection and keep old Stripe customer/subscription relationships intact.
do $$
declare
  root_company_id uuid;
begin
  -- This is a migration-owned backfill, not a client request. The server-only
  -- function intentionally trusts the verified service-role claim rather than
  -- SECURITY DEFINER's current_user value.
  perform set_config('request.jwt.claim.role', 'service_role', true);
  for root_company_id in select distinct company_id from public.subscription_accounts loop
    perform public.billing_refresh_product_entitlements(root_company_id);
  end loop;
  perform set_config('request.jwt.claim.role', '', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Product billing summary and entitlement reads.
-- ---------------------------------------------------------------------------

create or replace function public.billing_has_permission(p_company_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_access_company(p_company_id)
    and private.has_company_permission(private.invoice_billing_root_company_id(p_company_id), p_permission);
$$;

revoke all on function public.billing_has_permission(uuid, text) from public, anon;
grant execute on function public.billing_has_permission(uuid, text) to authenticated;

create or replace function public.get_product_entitlements(p_company_id uuid)
returns table(product text, enabled boolean, source text, starts_at timestamptz, ends_at timestamptz, metadata jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  root_company_id uuid;
begin
  if not public.can_access_company(p_company_id) then
    raise exception 'Company access denied' using errcode = '42501';
  end if;
  root_company_id := private.invoice_billing_root_company_id(p_company_id);
  return query
  select entitlement.product, entitlement.enabled, entitlement.source, entitlement.starts_at, entitlement.ends_at, entitlement.metadata
  from public.organization_product_entitlements entitlement
  where entitlement.company_id = root_company_id
    and entitlement.enabled
    and entitlement.starts_at <= now()
    and (entitlement.ends_at is null or entitlement.ends_at > now())
  order by entitlement.product, entitlement.starts_at desc;
end;
$$;

revoke all on function public.get_product_entitlements(uuid) from public, anon;
grant execute on function public.get_product_entitlements(uuid) to authenticated;

create or replace function public.get_product_billing_summary(p_company_id uuid, p_product text)
returns table(
  company_id uuid,
  billing_account_company_id uuid,
  requested_product text,
  plan text,
  product text,
  entitlements jsonb,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text,
  billing_interval text,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  grace_period_ends_at timestamptz,
  scheduled_plan text,
  scheduled_change_at timestamptz,
  total_tenants integer,
  included_tenants integer,
  billable_tenants integer,
  total_users integer,
  included_users integer,
  billable_users integer,
  estimated_monthly_total numeric,
  estimated_annual_total numeric,
  restricted boolean,
  billing_management_allowed boolean,
  usage_updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  root_company_id uuid;
  account_row public.subscription_accounts;
  usage_row public.subscription_usage;
  requested text := lower(trim(coalesce(p_product, '')));
  access boolean;
  plan_value text;
  monthly_value numeric := null;
  annual_value numeric := null;
  entitlement_json jsonb;
  manual_status text;
begin
  if requested not in ('invoice', 'booking', 'suite', 'hr', 'desk') then
    raise exception 'Unsupported OperiX product' using errcode = '22023';
  end if;
  if not public.can_access_company(p_company_id) then
    raise exception 'Company access denied' using errcode = '42501';
  end if;

  root_company_id := private.invoice_billing_root_company_id(p_company_id);
  if requested in ('invoice', 'booking', 'suite') then
    perform private.ensure_operix_product_trial(root_company_id, requested);
    -- Entitlement projection writes are server/webhook work. Authenticated
    -- summary reads must not be able to turn a client-controlled claim into a
    -- write path; the durable subscription/trial tables remain authoritative.
    if private.operix_server_request() then
      perform public.billing_refresh_product_entitlements(root_company_id);
    end if;
  end if;

  select usage.* into usage_row from public.subscription_usage usage where usage.company_id = root_company_id;
  select account.* into account_row
  from public.subscription_accounts account
  where account.company_id = root_company_id
    and (
      account.product = requested
      or (requested in ('invoice', 'booking') and account.product = 'suite')
    )
  order by case when private.operix_status_has_access(account.status, account.trial_ends_at, account.current_period_end, account.grace_period_ends_at, account.manual_override_status, account.manual_override_expires_at) then 0 else 1 end,
           case when account.product = requested then 0 else 1 end,
           account.updated_at desc
  limit 1;

  select coalesce(jsonb_object_agg(products.product, coalesce(entitlement.enabled, false)), '{}'::jsonb)
    into entitlement_json
  from (values ('invoice'::text), ('booking'::text), ('hr'::text), ('desk'::text)) products(product)
  left join lateral (
    select true as enabled
    from public.organization_product_entitlements entitlement
    where entitlement.company_id = root_company_id
      and entitlement.product = products.product
      and entitlement.enabled
      and entitlement.starts_at <= now()
      and (entitlement.ends_at is null or entitlement.ends_at > now())
    limit 1
  ) entitlement on true;

  -- Suite is its own Stripe plan. Separate Invoice + Booking access must not
  -- be interpreted as Suite access or silently become a bundle.
  access := private.operix_product_access(root_company_id, requested);
  select coalesce(grant_row.override_status, 'active') into manual_status
  from public.subscription_manual_grants grant_row
  where grant_row.company_id = root_company_id
    and (grant_row.product = requested or (grant_row.product = 'suite' and requested in ('invoice', 'booking')))
    and grant_row.revoked_at is null
    and (grant_row.expires_at is null or grant_row.expires_at > now())
    and coalesce(grant_row.override_status, 'active') in ('active', 'trialing')
  order by case when grant_row.product = requested then 0 else 1 end, grant_row.created_at desc
  limit 1;
  plan_value := case
    when manual_status is not null and access and requested = 'suite' then 'suite'
    when account_row.id is not null then account_row.product
    when manual_status is not null and access and requested in ('invoice', 'booking') then requested
    when access and requested in ('hr', 'desk') then 'enterprise'
    else null
  end;

  if plan_value in ('invoice', 'booking', 'suite') then
    monthly_value :=  
      case plan_value when 'invoice' then 9.99 when 'booking' then 4.99 when 'suite' then 11.99 end
      + coalesce(usage_row.billable_tenants, 0) * 1.99
      + coalesce(usage_row.billable_users, 0) * 0.99;
    annual_value :=
      case plan_value when 'invoice' then 99.99 when 'booking' then 49.99 when 'suite' then 99.99 end
      + coalesce(usage_row.billable_tenants, 0) * 19.99
      + coalesce(usage_row.billable_users, 0) * 9.99;
  end if;

  return query select
    p_company_id,
    root_company_id,
    requested,
    plan_value,
    plan_value,
    entitlement_json,
    case when private.rbac_is_platform_admin() then account_row.stripe_customer_id else null end,
    case when private.rbac_is_platform_admin() then account_row.stripe_subscription_id else null end,
    coalesce(manual_status, private.operix_effective_status(account_row.status, account_row.trial_ends_at, account_row.current_period_end, account_row.grace_period_ends_at, account_row.manual_override_status, account_row.manual_override_expires_at), case when access then 'active' else 'expired' end),
    account_row.billing_interval,
    account_row.trial_started_at,
    account_row.trial_ends_at,
    account_row.current_period_start,
    account_row.current_period_end,
    coalesce(account_row.cancel_at_period_end, false),
    account_row.grace_period_ends_at,
    account_row.scheduled_plan,
    account_row.scheduled_change_at,
    coalesce(usage_row.total_tenants, 0),
    1,
    coalesce(usage_row.billable_tenants, 0),
    coalesce(usage_row.total_users, 0),
    1,
    coalesce(usage_row.billable_users, 0),
    monthly_value,
    annual_value,
    not access,
    private.has_company_permission(root_company_id, 'billing.manage'),
    usage_row.last_synced_at;
end;
$$;

revoke all on function public.get_product_billing_summary(uuid, text) from public, anon;
grant execute on function public.get_product_billing_summary(uuid, text) to authenticated;

-- Backward-compatible Invoice read contract. It now returns the Invoice
-- entitlement from the product-aware ledger and uses the €9.99/€99.99 base.
drop function if exists public.get_invoice_billing_summary(uuid);
create or replace function public.get_invoice_billing_summary(p_company_id uuid)
returns table(
  company_id uuid,
  billing_account_company_id uuid,
  product text,
  stripe_customer_id text,
  stripe_subscription_id text,
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
  estimated_monthly_total numeric,
  estimated_annual_total numeric,
  restricted boolean,
  billing_management_allowed boolean,
  usage_updated_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select summary.company_id,
    summary.billing_account_company_id,
    summary.plan as product,
    summary.stripe_customer_id,
    summary.stripe_subscription_id,
    summary.status,
    summary.billing_interval,
    summary.trial_started_at,
    summary.trial_ends_at,
    summary.current_period_start,
    summary.current_period_end,
    summary.cancel_at_period_end,
    summary.grace_period_ends_at,
    summary.total_tenants,
    summary.included_tenants,
    summary.billable_tenants,
    summary.total_users,
    summary.included_users,
    summary.billable_users,
    summary.estimated_monthly_total,
    summary.estimated_annual_total,
    summary.restricted,
    summary.billing_management_allowed,
    summary.usage_updated_at
  from public.get_product_billing_summary(p_company_id, 'invoice') summary;
$$;

revoke all on function public.get_invoice_billing_summary(uuid) from public, anon;
grant execute on function public.get_invoice_billing_summary(uuid) to authenticated;

-- Keep the legacy tenant-scoped Control contract compatible for existing
-- callers, but source it from the product-aware summary rather than the old
-- company-wide Invoice entitlement. Control must not imply that one product
-- subscription unlocks unrelated products.
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
language sql
security definer
set search_path = ''
as $$
  select
    'stripe'::text,
    case summary.plan when 'suite' then 'OperiX Suite' when 'invoice' then 'OperiX Invoice' else 'OperiX Invoice' end,
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
    summary.stripe_customer_id,
    summary.stripe_subscription_id
  from public.get_product_billing_summary(p_company_id, 'invoice') summary;
$$;

revoke all on function public.control_invoice_billing_overview(uuid) from public, anon;
grant execute on function public.control_invoice_billing_overview(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Trial expiry, queue claiming, and scheduled plan changes.
-- ---------------------------------------------------------------------------

create or replace function public.expire_product_trials()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_count integer := 0;
  root_company_id uuid;
begin
  if not private.operix_server_request() then
    raise exception 'Server billing path required' using errcode = '42501';
  end if;
  update public.subscription_trials
  set status = 'expired', consumed = true, updated_at = now()
  where status = 'trialing' and ends_at <= now();
  get diagnostics expired_count = row_count;

  update public.subscription_accounts account
  set status = 'expired', updated_at = now()
  where account.status = 'trialing'
    and account.trial_ends_at <= now()
    and account.stripe_subscription_id is null;

  for root_company_id in select distinct company_id from public.subscription_accounts loop
    perform public.billing_refresh_product_entitlements(root_company_id);
  end loop;
  return expired_count;
end;
$$;

revoke all on function public.expire_product_trials() from public, anon, authenticated;
grant execute on function public.expire_product_trials() to service_role;

create or replace function public.claim_product_sync_queue(p_limit integer default 25)
returns setof public.subscription_sync_queue
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.operix_server_request() then
    raise exception 'Server billing path required' using errcode = '42501';
  end if;
  return query
  with claimed as (
    select queue.company_id
    from public.subscription_sync_queue queue
    where (
      queue.status in ('pending', 'failed')
      and queue.requested_at <= now()
    ) or (
      queue.status = 'processing'
      and queue.locked_at < now() - interval '10 minutes'
    )
    order by queue.requested_at
    limit greatest(1, least(coalesce(p_limit, 25), 100))
    for update skip locked
  )
  update public.subscription_sync_queue queue
  set status = 'processing', locked_at = now(), attempts = queue.attempts + 1, updated_at = now()
  from claimed
  where queue.company_id = claimed.company_id
  returning queue.*;
end;
$$;

revoke all on function public.claim_product_sync_queue(integer) from public, anon, authenticated;
grant execute on function public.claim_product_sync_queue(integer) to service_role;

create or replace function public.claim_scheduled_product_changes(p_limit integer default 25)
returns table(id uuid, company_id uuid, stripe_subscription_id text, product text, scheduled_plan text, billing_interval text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.operix_server_request() then
    raise exception 'Server billing path required' using errcode = '42501';
  end if;
  return query
  with claimed as (
    select account.id
    from public.subscription_accounts account
    where account.scheduled_plan is not null
      and account.scheduled_change_at <= now()
      and account.stripe_subscription_id is not null
    order by account.scheduled_change_at
    limit greatest(1, least(coalesce(p_limit, 25), 100))
    for update skip locked
  )
  update public.subscription_accounts account
  set updated_at = now()
  from claimed
  where account.id = claimed.id
  returning account.id, account.company_id, account.stripe_subscription_id, account.product, account.scheduled_plan, coalesce(account.scheduled_billing_interval, account.billing_interval);
end;
$$;

revoke all on function public.claim_scheduled_product_changes(integer) from public, anon, authenticated;
grant execute on function public.claim_scheduled_product_changes(integer) to service_role;

-- Keep the old worker RPC name safe for any already-running Invoice worker.
drop function if exists public.claim_invoice_sync_queue(integer);
create or replace function public.claim_invoice_sync_queue(p_limit integer default 25)
returns setof public.subscription_sync_queue
language sql
security definer
set search_path = ''
as $$
  select * from public.claim_product_sync_queue(p_limit);
$$;

revoke all on function public.claim_invoice_sync_queue(integer) from public, anon, authenticated;
grant execute on function public.claim_invoice_sync_queue(integer) to service_role;

-- ---------------------------------------------------------------------------
-- Product-aware database mutation guards.
-- ---------------------------------------------------------------------------

create or replace function private.product_required_for_table(p_table_name text)
returns text
language plpgsql
immutable
as $$
begin
  if p_table_name in ('companies', 'memberships', 'company_invitations', 'invitations', 'membership_role_assignments') then
    return 'any';
  end if;
  if p_table_name in ('booking_services', 'booking_service_categories', 'booking_locations', 'booking_resources', 'booking_staff', 'booking_staff_services', 'booking_resource_services', 'booking_working_hours', 'booking_availability_exceptions', 'booking_blocked_times', 'booking_settings', 'booking_recurring_series', 'bookings', 'booking_participants', 'booking_status_history', 'booking_payments', 'booking_waitlist', 'booking_reminders', 'booking_notification_log', 'booking_audit_log', 'booking_public_attempts') then
    return 'booking';
  end if;
  if p_table_name like 'hr_%' or p_table_name like 'payroll_%' or p_table_name like 'leave_%' or p_table_name like 'employee%' or p_table_name like 'attendance%' or p_table_name like 'payslip%' or p_table_name = 'payrolls' then
    return 'hr';
  end if;
  if p_table_name like 'desk_%' or p_table_name like 'support_%' then
    return 'desk';
  end if;
  return 'invoice';
end;
$$;

create or replace function private.operix_enforce_enterprise_limits(p_company_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  root_company_id uuid;
  active_tenants integer;
  active_users integer;
  limit_row record;
begin
  root_company_id := private.invoice_billing_root_company_id(p_company_id);

  select count(*)::integer
    into active_tenants
  from public.companies company
  where private.invoice_company_is_in_root(root_company_id, company.id)
    and company.archived_at is null
    and lower(coalesce(company.settings ->> 'status', 'active')) not in ('archived', 'deleted', 'suspended', 'disabled', 'inactive')
    and lower(coalesce(company.settings ->> 'is_internal', 'false')) not in ('true', '1', 'yes')
    and lower(coalesce(company.settings ->> 'is_demo', 'false')) not in ('true', '1', 'yes')
    and nullif(company.settings ->> 'deleted_at', '') is null
    and nullif(company.settings ->> 'suspended_at', '') is null;

  active_users := private.invoice_billable_user_count(root_company_id);

  for limit_row in
    select contract.tenant_limit, contract.seat_limit
    from public.enterprise_contracts contract
    where contract.company_id = root_company_id
      and contract.status in ('trialing', 'active')
      and contract.starts_at <= now()
      and (contract.ends_at is null or contract.ends_at > now())
      and (contract.trial_ends_at is null or contract.trial_ends_at > now() or contract.status = 'active')
  loop
    if p_action = 'canCreateTenant'
      and limit_row.tenant_limit is not null
      and active_tenants >= limit_row.tenant_limit then
      raise exception 'The enterprise tenant limit has been reached.' using errcode = '42501';
    end if;
    if p_action = 'canInviteUser'
      and limit_row.seat_limit is not null
      and active_users >= limit_row.seat_limit then
      raise exception 'The enterprise seat limit has been reached.' using errcode = '42501';
    end if;
  end loop;
end;
$$;

revoke all on function private.operix_enforce_enterprise_limits(uuid, text) from public;
grant execute on function private.operix_enforce_enterprise_limits(uuid, text) to authenticated, service_role;

create or replace function private.invoice_require_entitlement(p_company_id uuid, p_action text default 'canCreateInvoice')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  required_product text := 'invoice';
begin
  if private.operix_privileged_request() or private.rbac_is_platform_admin() then return; end if;
  if p_action in ('canCreateTenant', 'canInviteUser') then
    if not private.operix_any_product_access(p_company_id) then
      raise exception 'An active OperiX product subscription is required for this action.' using errcode = '42501';
    end if;
    perform private.operix_enforce_enterprise_limits(p_company_id, p_action);
    return;
  end if;
  if not private.operix_product_access(p_company_id, required_product) then
    raise exception 'An active OperiX Invoice entitlement is required for this action.' using errcode = '42501';
  end if;
end;
$$;

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
  if private.operix_privileged_request() or private.rbac_is_platform_admin() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  if tg_table_name = 'invoice_items' then
    select invoice.company_id into target_company_id from public.invoices invoice where invoice.id = nullif(row_data ->> 'invoice_id', '')::uuid;
  elsif tg_table_name = 'companies' then
    if tg_op = 'UPDATE' and (to_jsonb(old) ->> 'archived_at') is not null and (to_jsonb(new) ->> 'archived_at') is null then
      target_company_id := new.id; action := 'canCreateTenant';
    elsif tg_op = 'INSERT' then
      target_company_id := coalesce(new.parent_company_id, new.id); action := 'canCreateTenant';
      if new.parent_company_id is null and not exists (select 1 from public.subscription_accounts where company_id = new.id) then return new; end if;
    else
      if tg_op = 'DELETE' then return old; end if;
      return new;
    end if;
  elsif tg_table_name in ('memberships', 'company_invitations', 'invitations') then
    if tg_op = 'DELETE' then return old; end if;
    if tg_table_name = 'memberships'
      and tg_op = 'UPDATE'
      and lower(coalesce(old.status, 'active')) = 'active'
      and lower(coalesce(new.status, 'active')) = 'active' then
      return new;
    end if;
    if lower(coalesce(row_data ->> 'status', 'active')) <> 'active' and tg_table_name = 'memberships' then return new; end if;
    target_company_id := nullif(row_data ->> 'company_id', '')::uuid; action := case when tg_table_name = 'memberships' then 'canInviteUser' else 'canInviteUser' end;
  else
    target_company_id := nullif(row_data ->> 'company_id', '')::uuid;
  end if;
  if target_company_id is not null then perform private.invoice_require_entitlement(target_company_id, action); end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function private.enforce_operix_product_entitlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb;
  target_company_id uuid;
  required_product text;
begin
  if private.operix_privileged_request() or private.rbac_is_platform_admin() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  target_company_id := nullif(row_data ->> 'company_id', '')::uuid;
  required_product := private.product_required_for_table(tg_table_name);
  if required_product = 'any' then
    perform private.invoice_require_entitlement(target_company_id, 'canCreateTenant');
  elsif required_product = 'booking' then
    if not private.operix_product_access(target_company_id, 'booking') then raise exception 'An active OperiX Booking entitlement is required for this action.' using errcode = '42501'; end if;
  elsif required_product = 'hr' then
    if not private.operix_product_access(target_company_id, 'hr') then raise exception 'An active OperiX HR enterprise entitlement is required for this action.' using errcode = '42501'; end if;
  elsif required_product = 'desk' then
    if not private.operix_product_access(target_company_id, 'desk') then raise exception 'An active OperiX Desk enterprise entitlement is required for this action.' using errcode = '42501'; end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.enforce_invoice_entitlement() from public;
revoke all on function private.enforce_operix_product_entitlement() from public;
grant execute on function private.enforce_invoice_entitlement() to authenticated, service_role;
grant execute on function private.enforce_operix_product_entitlement() to authenticated, service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'booking_services', 'booking_service_categories', 'booking_locations', 'booking_resources', 'booking_staff', 'booking_staff_services', 'booking_resource_services', 'booking_working_hours', 'booking_availability_exceptions', 'booking_blocked_times', 'booking_settings', 'booking_recurring_series', 'bookings', 'booking_participants', 'booking_status_history', 'booking_payments', 'booking_waitlist', 'booking_reminders', 'booking_notification_log', 'booking_audit_log', 'booking_public_attempts'
  ] loop
    if exists (select 1 from pg_class relation join pg_namespace namespace on namespace.oid = relation.relnamespace where namespace.nspname = 'public' and relation.relname = table_name and relation.relkind in ('r', 'p')) then
      execute format('drop trigger if exists operix_product_entitlement_guard on public.%I', table_name);
      execute format('create trigger operix_product_entitlement_guard before insert or update or delete on public.%I for each row execute function private.enforce_operix_product_entitlement()', table_name);
    end if;
  end loop;

  for table_name in select relation.relname from pg_class relation join pg_namespace namespace on namespace.oid = relation.relnamespace where namespace.nspname = 'public' and relation.relkind in ('r', 'p') and (relation.relname like 'hr_%' or relation.relname like 'payroll_%' or relation.relname like 'leave_%' or relation.relname like 'employee%' or relation.relname like 'attendance%' or relation.relname like 'payslip%' or relation.relname = 'payrolls' or relation.relname like 'desk_%' or relation.relname like 'support_%') loop
    execute format('drop trigger if exists operix_product_entitlement_guard on public.%I', table_name);
    execute format('create trigger operix_product_entitlement_guard before insert or update or delete on public.%I for each row execute function private.enforce_operix_product_entitlement()', table_name);
  end loop;
end;
$$;

-- Existing Invoice triggers now call the product-aware implementation above.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'companies', 'memberships', 'company_invitations', 'invitations', 'invoices', 'invoice_items', 'products', 'clients', 'expenses', 'payments', 'vendors', 'vendor_payments', 'supplier_bills', 'commercial_documents', 'journal_entries', 'chart_of_accounts', 'customer_portal_tokens', 'contracts', 'contract_clauses', 'contract_events', 'contract_invoice_links', 'other_income', 'customer_refunds', 'financial_adjustments', 'inventory_stock_movements', 'product_branch_stock', 'inventory_locations', 'inventory_movements', 'inventory_counts', 'inventory_count_lines', 'pos_payments', 'cashier_shifts', 'cashier_shift_movements', 'cashier_shift_events', 'payment_links', 'invoice_reminders', 'recurring_invoice_templates'
  ] loop
    if exists (select 1 from pg_class relation join pg_namespace namespace on namespace.oid = relation.relnamespace where namespace.nspname = 'public' and relation.relname = table_name and relation.relkind in ('r', 'p')) then
      execute format('drop trigger if exists invoice_entitlement_guard on public.%I', table_name);
      execute format('create trigger invoice_entitlement_guard before insert or update or delete on public.%I for each row execute function private.enforce_invoice_entitlement()', table_name);
    end if;
  end loop;
end;
$$;

-- The public Booking endpoint intentionally uses a service-role RPC after it
-- validates the request and rate key. Add a non-bypassable guard at the
-- public-attempt boundary so an expired workspace cannot keep accepting new
-- public bookings merely because that trusted route uses service_role.
create or replace function private.enforce_booking_public_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.operix_product_access(new.company_id, 'booking') then
    raise exception 'An active OperiX Booking entitlement is required for public booking.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_booking_public_subscription() from public;
grant execute on function private.enforce_booking_public_subscription() to service_role;

drop trigger if exists booking_public_subscription_guard on public.booking_public_attempts;
create trigger booking_public_subscription_guard
before insert on public.booking_public_attempts
for each row execute function private.enforce_booking_public_subscription();

-- Re-meter tenant state changes represented by the existing archived_at or
-- settings fields. This keeps internal/demo/suspended flags from continuing
-- to contribute to future Stripe quantities.
drop trigger if exists companies_invoice_usage_change on public.companies;
create trigger companies_invoice_usage_change
after update of archived_at, parent_company_id, settings on public.companies
for each row execute function private.invoice_usage_change_trigger();

-- ---------------------------------------------------------------------------
-- Platform-only enterprise and manual entitlement operations.
-- ---------------------------------------------------------------------------

create or replace function public.control_list_product_manual_grants()
returns table(
  id uuid,
  company_id uuid,
  workspace_name text,
  product text,
  grant_type text,
  override_status text,
  reason text,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz,
  created_by uuid
)
language sql
security definer
set search_path = ''
as $$
  select grant_row.id,
    grant_row.company_id,
    coalesce(company.company_name, 'Unnamed organization'),
    grant_row.product,
    grant_row.grant_type,
    grant_row.override_status,
    grant_row.reason,
    grant_row.expires_at,
    grant_row.revoked_at,
    grant_row.created_at,
    grant_row.created_by
  from public.subscription_manual_grants grant_row
  join public.companies company on company.id = grant_row.company_id
  where public.control_is_platform_admin()
  order by grant_row.created_at desc;
$$;

revoke all on function public.control_list_product_manual_grants() from public, anon;
grant execute on function public.control_list_product_manual_grants() to authenticated;

create or replace function public.control_create_product_manual_grant(
  p_company_id uuid,
  p_product text,
  p_grant_type text,
  p_reason text,
  p_expires_at timestamptz default null,
  p_override_status text default 'active'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  root_company_id uuid;
  grant_id uuid;
begin
  if not public.control_is_platform_admin() then raise exception 'Platform administrator access required' using errcode = '42501'; end if;
  if p_product not in ('invoice', 'booking', 'suite', 'hr', 'desk') then raise exception 'Unsupported product' using errcode = '22023'; end if;
  if p_grant_type not in ('complimentary', 'extended_trial', 'manual_override') then raise exception 'Unsupported grant type' using errcode = '22023'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'A grant reason is required' using errcode = '22023'; end if;
  root_company_id := private.invoice_billing_root_company_id(p_company_id);
  insert into public.subscription_manual_grants(company_id, product, grant_type, override_status, reason, expires_at, created_by)
  values (root_company_id, p_product, p_grant_type, p_override_status, trim(p_reason), p_expires_at, auth.uid())
  returning id into grant_id;
  perform public.billing_refresh_product_entitlements(root_company_id);
  insert into public.billing_audit_events(company_id, event, source, actor_user_id, metadata)
  values (root_company_id, 'manual_product_grant', 'operix_control', auth.uid(), jsonb_build_object('grant_id', grant_id, 'product', p_product, 'grant_type', p_grant_type, 'expires_at', p_expires_at, 'reason', trim(p_reason)));
  return grant_id;
end;
$$;

revoke all on function public.control_create_product_manual_grant(uuid, text, text, text, timestamptz, text) from public, anon;
grant execute on function public.control_create_product_manual_grant(uuid, text, text, text, timestamptz, text) to authenticated;

create or replace function public.control_revoke_product_manual_grant(p_grant_id uuid, p_reason text default 'Revoked by platform administrator')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  grant_row public.subscription_manual_grants;
begin
  if not public.control_is_platform_admin() then raise exception 'Platform administrator access required' using errcode = '42501'; end if;
  select * into grant_row from public.subscription_manual_grants where id = p_grant_id for update;
  if grant_row.id is null then raise exception 'Manual grant not found' using errcode = 'P0002'; end if;
  update public.subscription_manual_grants set revoked_at = now(), revoked_by = auth.uid(), updated_at = now() where id = p_grant_id;
  perform public.billing_refresh_product_entitlements(grant_row.company_id);
  insert into public.billing_audit_events(company_id, event, source, actor_user_id, metadata)
  values (grant_row.company_id, 'manual_product_grant_revoked', 'operix_control', auth.uid(), jsonb_build_object('grant_id', p_grant_id, 'product', grant_row.product, 'reason', p_reason));
end;
$$;

revoke all on function public.control_revoke_product_manual_grant(uuid, text) from public, anon;
grant execute on function public.control_revoke_product_manual_grant(uuid, text) to authenticated;

-- Compatibility wrapper for the previous Invoice Control form.
drop function if exists public.control_create_invoice_manual_grant(uuid, text, text, timestamptz, text);
create or replace function public.control_create_invoice_manual_grant(p_company_id uuid, p_grant_type text, p_reason text, p_expires_at timestamptz default null, p_override_status text default 'active')
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.control_create_product_manual_grant(p_company_id, 'invoice', p_grant_type, p_reason, p_expires_at, p_override_status);
$$;

revoke all on function public.control_create_invoice_manual_grant(uuid, text, text, timestamptz, text) from public, anon;
grant execute on function public.control_create_invoice_manual_grant(uuid, text, text, timestamptz, text) to authenticated;

drop function if exists public.control_create_enterprise_contract(uuid, text, text[], numeric, text, text, timestamptz, timestamptz, text, integer, integer, jsonb, text);
create or replace function public.control_create_enterprise_contract(
  p_company_id uuid,
  p_contract_name text,
  p_products text[],
  p_custom_price numeric default null,
  p_currency text default 'EUR',
  p_billing_interval text default 'custom',
  p_starts_at timestamptz default now(),
  p_ends_at timestamptz default null,
  p_status text default 'active',
  p_seat_limit integer default null,
  p_tenant_limit integer default null,
  p_product_limits jsonb default '{}'::jsonb,
  p_notes text default null,
  p_trial_started_at timestamptz default null,
  p_trial_ends_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  root_company_id uuid;
  contract_id uuid;
  enterprise_product text;
begin
  if not public.control_is_platform_admin() then raise exception 'Platform administrator access required' using errcode = '42501'; end if;
  if p_products is null or cardinality(p_products) = 0 or not (p_products <@ array['hr', 'desk']::text[]) then raise exception 'Enterprise products must be HR and/or Desk' using errcode = '22023'; end if;
  if p_status not in ('draft', 'trialing', 'active', 'expired', 'canceled') then raise exception 'Unsupported enterprise contract status' using errcode = '22023'; end if;
  if p_ends_at is not null and p_ends_at <= p_starts_at then raise exception 'Contract end must be after contract start' using errcode = '22023'; end if;
  if p_status = 'trialing' and p_trial_ends_at is null then raise exception 'A trial/demo contract requires a trial end' using errcode = '22023'; end if;
  if p_trial_ends_at is not null and coalesce(p_trial_started_at, p_starts_at) >= p_trial_ends_at then raise exception 'Trial end must be after trial start' using errcode = '22023'; end if;
  root_company_id := private.invoice_billing_root_company_id(p_company_id);
  insert into public.enterprise_contracts(company_id, contract_name, custom_price, currency, billing_interval, starts_at, ends_at, status, trial_started_at, trial_ends_at, seat_limit, tenant_limit, product_limits, notes, created_by, updated_by)
  values (root_company_id, trim(p_contract_name), p_custom_price, upper(p_currency), p_billing_interval, p_starts_at, p_ends_at, p_status, p_trial_started_at, p_trial_ends_at, p_seat_limit, p_tenant_limit, p_product_limits, p_notes, auth.uid(), auth.uid())
  returning id into contract_id;
  foreach enterprise_product in array p_products loop
    insert into public.enterprise_contract_products(contract_id, product) values (contract_id, enterprise_product) on conflict do nothing;
  end loop;
  perform public.billing_refresh_product_entitlements(root_company_id);
  insert into public.billing_audit_events(company_id, event, source, actor_user_id, metadata)
  values (root_company_id, 'enterprise_contract_created', 'operix_control', auth.uid(), jsonb_build_object('contract_id', contract_id, 'products', p_products, 'custom_price', p_custom_price, 'currency', upper(p_currency), 'starts_at', p_starts_at, 'ends_at', p_ends_at, 'trial_started_at', p_trial_started_at, 'trial_ends_at', p_trial_ends_at));
  return contract_id;
end;
$$;

revoke all on function public.control_create_enterprise_contract(uuid, text, text[], numeric, text, text, timestamptz, timestamptz, text, integer, integer, jsonb, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.control_create_enterprise_contract(uuid, text, text[], numeric, text, text, timestamptz, timestamptz, text, integer, integer, jsonb, text, timestamptz, timestamptz) to authenticated;

create or replace function public.control_revoke_enterprise_contract(p_contract_id uuid, p_reason text default 'Revoked by platform administrator')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  contract_company_id uuid;
begin
  if not public.control_is_platform_admin() then raise exception 'Platform administrator access required' using errcode = '42501'; end if;
  update public.enterprise_contracts set status = 'canceled', ends_at = least(coalesce(ends_at, now()), now()), updated_by = auth.uid(), updated_at = now() where id = p_contract_id returning company_id into contract_company_id;
  if contract_company_id is null then raise exception 'Enterprise contract not found' using errcode = 'P0002'; end if;
  perform public.billing_refresh_product_entitlements(contract_company_id);
  insert into public.billing_audit_events(company_id, event, source, actor_user_id, metadata)
  values (contract_company_id, 'enterprise_contract_revoked', 'operix_control', auth.uid(), jsonb_build_object('contract_id', p_contract_id, 'reason', p_reason));
end;
$$;

revoke all on function public.control_revoke_enterprise_contract(uuid, text) from public, anon;
grant execute on function public.control_revoke_enterprise_contract(uuid, text) to authenticated;

create or replace function public.control_extend_enterprise_contract(
  p_contract_id uuid,
  p_ends_at timestamptz default null,
  p_reason text default 'Enterprise access extended by platform administrator'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  contract_company_id uuid;
  contract_start timestamptz;
  previous_end timestamptz;
begin
  if not public.control_is_platform_admin() then raise exception 'Platform administrator access required' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'An extension reason is required' using errcode = '22023'; end if;
  if p_ends_at is not null and p_ends_at <= now() then raise exception 'Enterprise access end must be in the future' using errcode = '22023'; end if;
  select company_id, starts_at, ends_at
    into contract_company_id, contract_start, previous_end
  from public.enterprise_contracts
  where id = p_contract_id
  for update;
  if contract_company_id is null then raise exception 'Enterprise contract not found' using errcode = 'P0002'; end if;
  if p_ends_at is not null and p_ends_at <= contract_start then raise exception 'Enterprise access end must be after the contract start' using errcode = '22023'; end if;

  update public.enterprise_contracts
  set ends_at = p_ends_at,
      status = 'active',
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_contract_id;
  perform public.billing_refresh_product_entitlements(contract_company_id);
  insert into public.billing_audit_events(company_id, event, source, actor_user_id, metadata)
  values (contract_company_id, 'enterprise_contract_extended', 'operix_control', auth.uid(), jsonb_build_object('contract_id', p_contract_id, 'previous_ends_at', previous_end, 'ends_at', p_ends_at, 'reason', p_reason));
end;
$$;

revoke all on function public.control_extend_enterprise_contract(uuid, timestamptz, text) from public, anon;
grant execute on function public.control_extend_enterprise_contract(uuid, timestamptz, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Platform reporting.
-- ---------------------------------------------------------------------------

create or replace function private.operix_plan_value(p_plan text, p_interval text, p_billable_tenants integer, p_billable_users integer)
returns numeric
language sql
immutable
as $$
  select case when p_interval = 'annual' then
    case p_plan when 'invoice' then 99.99 when 'booking' then 49.99 when 'suite' then 99.99 else 0 end
      + coalesce(p_billable_tenants, 0) * 19.99
      + coalesce(p_billable_users, 0) * 9.99
  else
    case p_plan when 'invoice' then 9.99 when 'booking' then 4.99 when 'suite' then 11.99 else 0 end
      + coalesce(p_billable_tenants, 0) * 1.99
      + coalesce(p_billable_users, 0) * 0.99
  end;
$$;

create or replace function public.control_list_product_billing_accounts()
returns table(
  id uuid,
  company_id uuid,
  workspace_name text,
  plan text,
  status text,
  billing_interval text,
  total_tenants integer,
  included_tenants integer,
  billable_tenants integer,
  total_users integer,
  included_users integer,
  billable_users integer,
  current_value numeric,
  mrr numeric,
  arr numeric,
  next_renewal_at timestamptz,
  cancel_at_period_end boolean,
  stripe_customer_id text,
  stripe_subscription_id text,
  entitlements jsonb,
  enterprise_contract_id uuid
)
language sql
security definer
set search_path = ''
as $$
  select account.id,
    account.company_id,
    coalesce(company.company_name, 'Unnamed organization'),
    account.product,
    private.operix_effective_status(account.status, account.trial_ends_at, account.current_period_end, account.grace_period_ends_at, account.manual_override_status, account.manual_override_expires_at),
    account.billing_interval,
    coalesce(usage.total_tenants, 0),
    1,
    coalesce(usage.billable_tenants, 0),
    coalesce(usage.total_users, 0),
    1,
    coalesce(usage.billable_users, 0),
    private.operix_plan_value(account.product, account.billing_interval, usage.billable_tenants, usage.billable_users),
    case when account.billing_interval = 'annual' then private.operix_plan_value(account.product, account.billing_interval, usage.billable_tenants, usage.billable_users) / 12 else private.operix_plan_value(account.product, account.billing_interval, usage.billable_tenants, usage.billable_users) end,
    case when account.billing_interval = 'annual' then private.operix_plan_value(account.product, account.billing_interval, usage.billable_tenants, usage.billable_users) else private.operix_plan_value(account.product, account.billing_interval, usage.billable_tenants, usage.billable_users) * 12 end,
    account.current_period_end,
    account.cancel_at_period_end,
    account.stripe_customer_id,
    account.stripe_subscription_id,
    coalesce((select jsonb_object_agg(entitlement.product, true) from public.organization_product_entitlements entitlement where entitlement.company_id = account.company_id and entitlement.enabled), '{}'::jsonb),
    null::uuid
  from public.subscription_accounts account
  join public.companies company on company.id = account.company_id
  left join public.subscription_usage usage on usage.company_id = account.company_id
  where public.control_is_platform_admin()
  union all
  select contract.id,
    contract.company_id,
    coalesce(company.company_name, 'Unnamed organization'),
    'enterprise',
    contract.status,
    contract.billing_interval,
    coalesce(usage.total_tenants, 0),
    1,
    coalesce(usage.billable_tenants, 0),
    coalesce(usage.total_users, 0),
    1,
    coalesce(usage.billable_users, 0),
    contract.custom_price,
    case when contract.billing_interval = 'annual' then contract.custom_price / 12 else contract.custom_price end,
    case when contract.billing_interval = 'annual' then contract.custom_price else contract.custom_price * 12 end,
    contract.ends_at,
    false,
    null,
    null,
    jsonb_object_agg(product.product, true),
    contract.id
  from public.enterprise_contracts contract
  join public.companies company on company.id = contract.company_id
  join public.enterprise_contract_products product on product.contract_id = contract.id and product.enabled
  left join public.subscription_usage usage on usage.company_id = contract.company_id
  where public.control_is_platform_admin()
  group by contract.id, contract.company_id, company.company_name, contract.status, contract.billing_interval, contract.custom_price, contract.ends_at, usage.total_tenants, usage.billable_tenants, usage.total_users, usage.billable_users;
$$;

revoke all on function public.control_list_product_billing_accounts() from public, anon;
grant execute on function public.control_list_product_billing_accounts() to authenticated;

drop function if exists public.control_list_enterprise_contracts();
create or replace function public.control_list_enterprise_contracts()
returns table(
  id uuid,
  company_id uuid,
  workspace_name text,
  contract_name text,
  products text[],
  custom_price numeric,
  currency text,
  billing_interval text,
  starts_at timestamptz,
  ends_at timestamptz,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  status text,
  seat_limit integer,
  tenant_limit integer,
  product_limits jsonb,
  notes text
)
language sql
security definer
set search_path = ''
as $$
  select contract.id,
    contract.company_id,
    coalesce(company.company_name, 'Unnamed organization'),
    contract.contract_name,
    coalesce(array_agg(product.product order by product.product) filter (where product.enabled), '{}'::text[]),
    contract.custom_price,
    contract.currency,
    contract.billing_interval,
    contract.starts_at,
    contract.ends_at,
    contract.trial_started_at,
    contract.trial_ends_at,
    contract.status,
    contract.seat_limit,
    contract.tenant_limit,
    contract.product_limits,
    contract.notes
  from public.enterprise_contracts contract
  join public.companies company on company.id = contract.company_id
  left join public.enterprise_contract_products product on product.contract_id = contract.id
  where public.control_is_platform_admin()
  group by contract.id, contract.company_id, company.company_name, contract.contract_name,
    contract.custom_price, contract.currency, contract.billing_interval, contract.starts_at, contract.ends_at,
    contract.trial_started_at, contract.trial_ends_at,
    contract.status, contract.seat_limit, contract.tenant_limit, contract.product_limits, contract.notes
  order by contract.starts_at desc;
$$;

revoke all on function public.control_list_enterprise_contracts() from public, anon;
grant execute on function public.control_list_enterprise_contracts() to authenticated;

drop function if exists public.control_list_invoice_billing_accounts();
create or replace function public.control_list_invoice_billing_accounts()
returns table(
  id uuid, company_id uuid, workspace_name text, status text, billing_interval text,
  total_tenants integer, included_tenants integer, billable_tenants integer,
  total_users integer, included_users integer, billable_users integer,
  current_value numeric, next_renewal_at timestamptz, cancel_at_period_end boolean,
  stripe_customer_id text, stripe_subscription_id text, past_due boolean
)
language sql
security definer
set search_path = ''
as $$
  select row.id, row.company_id, row.workspace_name, row.status, row.billing_interval,
    row.total_tenants, row.included_tenants, row.billable_tenants, row.total_users,
    row.included_users, row.billable_users, row.current_value, row.next_renewal_at,
    row.cancel_at_period_end, row.stripe_customer_id, row.stripe_subscription_id,
    row.status = 'past_due'
  from public.control_list_product_billing_accounts() row
  where row.plan = 'invoice';
$$;

revoke all on function public.control_list_invoice_billing_accounts() from public, anon;
grant execute on function public.control_list_invoice_billing_accounts() to authenticated;

create or replace function public.control_product_billing_metrics()
returns table(metric text, value numeric)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.control_is_platform_admin() then raise exception 'Platform administrator access required' using errcode = '42501'; end if;
  return query
  with accounts as (
    select account.*,
      private.operix_effective_status(account.status, account.trial_ends_at, account.current_period_end, account.grace_period_ends_at, account.manual_override_status, account.manual_override_expires_at) as effective_status
    from public.subscription_accounts account
  ), paid as (
    select account.* from accounts account where private.operix_status_has_access(account.status, account.trial_ends_at, account.current_period_end, account.grace_period_ends_at, account.manual_override_status, account.manual_override_expires_at) and account.effective_status <> 'trialing'
  ), values as (
    select paid.product, paid.billing_interval, private.operix_plan_value(paid.product, paid.billing_interval, usage.billable_tenants, usage.billable_users) as value
    from paid left join public.subscription_usage usage on usage.company_id = paid.company_id
  ), enterprise_values as (
    select contract.billing_interval, contract.custom_price as value
    from public.enterprise_contracts contract
    where contract.status = 'active'
      and contract.starts_at <= now()
      and (contract.ends_at is null or contract.ends_at > now())
      and contract.custom_price is not null
      and contract.billing_interval in ('monthly', 'annual')
  ), trial_keys as (
    -- Conversion is an organization metric. A Suite clock can have linked
    -- Invoice/Booking history rows, and a customer can also have explored
    -- two standalone products; neither should inflate the denominator.
    select
      trial.company_id,
      case
        when bool_or(trial.status = 'trialing' and trial.ends_at > now()) then 'trialing'
        when bool_or(trial.status = 'completed') then 'completed'
        when bool_or(trial.status = 'expired' or trial.ends_at <= now()) then 'expired'
        else max(trial.status)
      end as status
    from public.subscription_trials trial
    group by trial.company_id
  ), trials as (
    select count(*) filter (where status = 'trialing')::numeric as active_trials,
      count(*) filter (where status = 'expired')::numeric as expired_trials,
      count(*)::numeric as all_trials
    from trial_keys
  )
  select 'invoice_subscriptions', count(*) filter (where product = 'invoice')::numeric from accounts
  union all select 'booking_subscriptions', count(*) filter (where product = 'booking')::numeric from accounts
  union all select 'suite_subscriptions', count(*) filter (where product = 'suite')::numeric from accounts
  union all select 'monthly_subscriptions', count(*) filter (where billing_interval = 'monthly' and effective_status <> 'expired')::numeric from accounts
  union all select 'annual_subscriptions', count(*) filter (where billing_interval = 'annual' and effective_status <> 'expired')::numeric from accounts
  union all select 'active_trials', trials.active_trials from trials
  union all select 'expired_trials', trials.expired_trials from trials
  union all select 'trial_conversion_rate', case when trials.all_trials = 0 then 0 else round((select count(distinct company_id)::numeric from paid) / trials.all_trials * 100, 2) end from trials
  union all select 'mrr', coalesce((select sum(case when billing_interval = 'annual' then value / 12 else value end) from values), 0) + coalesce((select sum(case when billing_interval = 'annual' then value / 12 else value end) from enterprise_values), 0)
  union all select 'arr', coalesce((select sum(case when billing_interval = 'annual' then value else value * 12 end) from values), 0) + coalesce((select sum(case when billing_interval = 'annual' then value else value * 12 end) from enterprise_values), 0)
  union all select 'active_subscriptions', count(*) filter (where effective_status in ('active', 'past_due', 'canceled'))::numeric from accounts
  union all select 'past_due_accounts', count(*) filter (where status = 'past_due')::numeric from accounts
  union all select 'canceled_accounts', count(*) filter (where status = 'canceled')::numeric from accounts
  union all select 'enterprise_customers', count(distinct company_id)::numeric from public.enterprise_contracts where status in ('trialing', 'active') and starts_at <= now() and (ends_at is null or ends_at > now());
end;
$$;

revoke all on function public.control_product_billing_metrics() from public, anon;
grant execute on function public.control_product_billing_metrics() to authenticated;

-- The original Control organization list read plan_name from the legacy
-- control_billing_snapshots table. Keep that table for compatibility with
-- older operational screens, but make the platform organization list derive
-- its plan from the product-aware subscription/entitlement ledger.
create or replace function public.control_list_platform_organizations()
returns table(id uuid, organization text, owner_id uuid, plan text, member_count bigint, enabled_apps bigint, status text, created_at timestamptz)
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
    company.id,
    coalesce(company.company_name),
    company.owner_id,
    coalesce(billing.plan, '—'),
    (select count(*)
     from public.memberships membership
     where membership.company_id = company.id
       and coalesce(membership.status, 'active') <> 'revoked'),
    (select count(*)
     from public.company_app_entitlements entitlement
     where entitlement.company_id = company.id
       and entitlement.enabled),
    case when company.archived_at is null then 'active' else 'archived' end,
    company.created_at
  from public.companies company
  left join lateral (
    select string_agg(label.product_label, ' + ' order by label.sort_order) as plan
    from (
      select distinct
        product.product,
        case product.product
          when 'invoice' then 'OperiX Invoice'
          when 'booking' then 'OperiX Booking'
          when 'suite' then 'OperiX Suite'
          when 'hr' then 'OperiX HR'
          when 'desk' then 'OperiX Desk'
          else initcap(product.product)
        end as product_label,
        case product.product
          when 'suite' then 1
          when 'invoice' then 2
          when 'booking' then 3
          when 'hr' then 4
          when 'desk' then 5
          else 9
        end as sort_order
      from (
        select account.product
        from public.subscription_accounts account
        where account.company_id = company.id
          and private.operix_status_has_access(
            account.status,
            account.trial_ends_at,
            account.current_period_end,
            account.grace_period_ends_at,
            account.manual_override_status,
            account.manual_override_expires_at
          )
        union
        select entitlement.product
        from public.organization_product_entitlements entitlement
        where entitlement.company_id = company.id
          and entitlement.enabled
          and entitlement.starts_at <= now()
          and (entitlement.ends_at is null or entitlement.ends_at > now())
      ) product
    ) label
  ) billing on true
  order by company.created_at desc;
end;
$$;

revoke all on function public.control_list_platform_organizations() from public, anon;
grant execute on function public.control_list_platform_organizations() to authenticated;

create or replace function public.control_invoice_billing_metrics()
returns table(metric text, value numeric)
language sql
security definer
set search_path = ''
as $$
  select metric, value from public.control_product_billing_metrics();
$$;

revoke all on function public.control_invoice_billing_metrics() from public, anon;
grant execute on function public.control_invoice_billing_metrics() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: clients can read only their authorized organization; write paths are
-- server functions/webhooks or platform Control.
-- ---------------------------------------------------------------------------

alter table public.subscription_accounts enable row level security;
alter table public.subscription_trials enable row level security;
alter table public.organization_product_entitlements enable row level security;
alter table public.enterprise_contracts enable row level security;
alter table public.enterprise_contract_products enable row level security;

revoke all on public.subscription_accounts, public.subscription_trials, public.organization_product_entitlements, public.enterprise_contracts, public.enterprise_contract_products from anon, authenticated;
grant select on public.subscription_accounts, public.organization_product_entitlements to authenticated;

drop policy if exists subscription_accounts_billing_read on public.subscription_accounts;
create policy subscription_accounts_billing_read on public.subscription_accounts
for select to authenticated
using (private.has_company_permission(private.invoice_billing_root_company_id(company_id), 'billing.read'));

drop policy if exists product_entitlements_billing_read on public.organization_product_entitlements;
create policy product_entitlements_billing_read on public.organization_product_entitlements
for select to authenticated
using (private.has_company_permission(private.invoice_billing_root_company_id(company_id), 'billing.read'));

-- The following tables are intentionally function-only. Their RLS is defense
-- in depth even though authenticated has no direct table grants.
alter table public.subscription_trials enable row level security;
alter table public.enterprise_contracts enable row level security;
alter table public.enterprise_contract_products enable row level security;

commit;
