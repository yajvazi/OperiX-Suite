-- OperiX Booking platform features
--
-- This migration is additive. It extends the Booking growth/Pages contracts
-- already present in this repository and keeps booking creation, pricing, and
-- availability in the existing private booking engine.
--
-- Provider secrets are never stored in client-readable tables. Calendar
-- credentials are encrypted by the server worker and all public customer
-- commands use opaque, hashed tokens.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Shared permissions and small compatibility columns
-- ---------------------------------------------------------------------------

insert into public.app_permissions (code, name, category, description, is_sensitive)
values
  ('booking.calendar.sync', 'Synchronize external calendars', 'booking', 'Connect external calendars and manage conflict synchronization.', true),
  ('booking.membership.manage', 'Manage customer memberships', 'booking', 'Configure and manage customer membership plans.', true),
  ('booking.automation.manage', 'Manage booking automations', 'booking', 'Configure server-side booking communication automations.', true),
  ('booking.crm.read', 'View customer intelligence', 'booking', 'View tenant-scoped customer metrics and activity timelines.', false),
  ('booking.analytics.advanced', 'View advanced booking analytics', 'booking', 'View tenant-scoped advanced analytics and insights.', true)
on conflict (code) do update set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  is_sensitive = excluded.is_sensitive;

with grants(role_code, permission_code) as (
  values
    ('owner', 'booking.calendar.sync'), ('owner', 'booking.membership.manage'), ('owner', 'booking.automation.manage'), ('owner', 'booking.crm.read'), ('owner', 'booking.analytics.advanced'),
    ('super_administrator', 'booking.calendar.sync'), ('super_administrator', 'booking.membership.manage'), ('super_administrator', 'booking.automation.manage'), ('super_administrator', 'booking.crm.read'), ('super_administrator', 'booking.analytics.advanced'),
    ('company_administrator', 'booking.calendar.sync'), ('company_administrator', 'booking.membership.manage'), ('company_administrator', 'booking.automation.manage'), ('company_administrator', 'booking.crm.read'), ('company_administrator', 'booking.analytics.advanced'),
    ('manager', 'booking.calendar.sync'), ('manager', 'booking.membership.manage'), ('manager', 'booking.automation.manage'), ('manager', 'booking.crm.read'), ('manager', 'booking.analytics.advanced')
)
insert into public.app_role_permissions (role_id, permission_code)
select role.id, grants.permission_code
from grants
join public.app_roles role on role.company_id is null and role.code = grants.role_code
on conflict do nothing;

alter table public.booking_notification_log
  add column if not exists payload jsonb not null default '{}'::jsonb;

alter table public.booking_packages
  add column if not exists billing_interval text not null default 'custom',
  add column if not exists discount_percent numeric(8,4) not null default 0,
  add column if not exists benefits jsonb not null default '{}'::jsonb,
  add column if not exists trial_days integer not null default 0,
  add column if not exists grace_period_days integer not null default 0,
  add column if not exists priority_booking boolean not null default false,
  add column if not exists transferable boolean not null default false;

alter table public.booking_packages
  drop constraint if exists booking_packages_billing_interval_check;
alter table public.booking_packages
  add constraint booking_packages_billing_interval_check
  check (billing_interval in ('monthly', 'annual', 'custom')) not valid;

alter table public.booking_packages
  drop constraint if exists booking_packages_discount_check;
alter table public.booking_packages
  add constraint booking_packages_discount_check
  check (discount_percent between 0 and 100) not valid;

-- Memberships are customer entitlements and deliberately reuse the existing
-- booking_packages catalog. They are not OperiX SaaS subscriptions.

create table if not exists public.booking_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.clients(id) on delete cascade,
  package_id uuid not null,
  status text not null default 'active' check (status in ('active', 'trialing', 'past_due', 'paused', 'cancelled', 'expired')),
  starts_on date not null default current_date,
  ends_on date,
  next_billing_on date,
  billing_interval text not null default 'monthly' check (billing_interval in ('monthly', 'annual', 'custom')),
  price numeric(20,4) not null default 0 check (price >= 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  external_provider text,
  external_subscription_id text,
  paused_at timestamptz,
  cancelled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, package_id) references public.booking_packages(company_id, id) on delete restrict,
  check (ends_on is null or ends_on >= starts_on),
  unique (company_id, id)
);

create unique index if not exists booking_memberships_active_unique
  on public.booking_memberships(company_id, customer_id, package_id)
  where status in ('active', 'trialing', 'past_due', 'paused');

create table if not exists public.booking_membership_credits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  membership_id uuid not null,
  service_id uuid not null,
  period_starts_on date not null,
  period_ends_on date not null,
  included_units integer not null check (included_units > 0),
  remaining_units integer not null check (remaining_units >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, membership_id) references public.booking_memberships(company_id, id) on delete cascade,
  foreign key (company_id, service_id) references public.booking_services(company_id, id) on delete restrict,
  check (period_ends_on >= period_starts_on),
  check (remaining_units <= included_units),
  unique (company_id, id),
  unique (company_id, membership_id, service_id, period_starts_on)
);

create table if not exists public.booking_membership_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  membership_id uuid not null,
  credit_id uuid,
  booking_id uuid,
  service_id uuid,
  action text not null check (action in ('granted', 'redeemed', 'restored', 'expired', 'adjusted')),
  units integer not null check (units > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (company_id, membership_id) references public.booking_memberships(company_id, id) on delete cascade,
  foreign key (company_id, credit_id) references public.booking_membership_credits(company_id, id) on delete set null,
  foreign key (company_id, booking_id) references public.bookings(company_id, id) on delete set null,
  foreign key (company_id, service_id) references public.booking_services(company_id, id) on delete set null
);

alter table public.bookings add column if not exists membership_id uuid;
alter table public.bookings
  drop constraint if exists bookings_membership_fk;
alter table public.bookings
  add constraint bookings_membership_fk
  foreign key (company_id, membership_id)
  references public.booking_memberships(company_id, id)
  on delete set null not valid;

alter table public.bookings
  drop constraint if exists bookings_source_check;
alter table public.bookings
  add constraint bookings_source_check
  check (source in ('admin', 'public', 'mobile', 'import', 'api', 'customer_portal', 'widget', 'walk_in', 'staff_created', 'booking_page', 'waitlist')) not valid;

create index if not exists booking_memberships_customer_idx on public.booking_memberships(company_id, customer_id, status, ends_on);
create index if not exists booking_membership_credits_lookup_idx on public.booking_membership_credits(company_id, membership_id, service_id, period_ends_on);
create index if not exists booking_membership_ledger_lookup_idx on public.booking_membership_credit_ledger(company_id, membership_id, created_at desc);

-- ---------------------------------------------------------------------------
-- External calendar synchronization
-- ---------------------------------------------------------------------------

alter table public.booking_calendar_connections
  add column if not exists staff_id uuid,
  add column if not exists calendar_id text,
  add column if not exists calendar_name text,
  add column if not exists account_email text,
  add column if not exists conflict_blocking_enabled boolean not null default true,
  add column if not exists pull_busy_periods boolean not null default true,
  add column if not exists push_bookings boolean not null default false,
  add column if not exists sync_interval_minutes integer not null default 15,
  add column if not exists last_synced_at timestamptz,
  add column if not exists last_error text,
  add column if not exists next_sync_at timestamptz,
  add column if not exists oauth_scopes text[] not null default '{}';

alter table public.booking_calendar_connections
  drop constraint if exists booking_calendar_connections_staff_fk;
alter table public.booking_calendar_connections
  add constraint booking_calendar_connections_staff_fk
  foreign key (company_id, staff_id)
  references public.booking_staff(company_id, id)
  on delete cascade not valid;

create table if not exists public.booking_calendar_credentials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  connection_id uuid not null references public.booking_calendar_connections(id) on delete cascade,
  access_token_ciphertext text,
  refresh_token_ciphertext text,
  apple_ics_url_ciphertext text,
  token_expires_at timestamptz,
  encryption_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, connection_id)
);

create table if not exists public.booking_external_busy_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  connection_id uuid not null references public.booking_calendar_connections(id) on delete cascade,
  staff_id uuid not null,
  external_event_id text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  source_label text not null default 'External calendar — Busy',
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (company_id, staff_id) references public.booking_staff(company_id, id) on delete cascade,
  check (ends_at > starts_at),
  unique (company_id, connection_id, external_event_id, starts_at)
);

create table if not exists public.booking_calendar_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  connection_id uuid not null references public.booking_calendar_connections(id) on delete cascade,
  booking_id uuid,
  job_type text not null check (job_type in ('pull_busy', 'push_booking', 'delete_booking', 'full_sync')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'succeeded', 'failed')),
  idempotency_key text not null,
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  foreign key (company_id, booking_id) references public.bookings(company_id, id) on delete cascade,
  unique (company_id, idempotency_key)
);

alter table public.booking_blocked_times
  add column if not exists external_busy_period_id uuid;
alter table public.booking_blocked_times
  drop constraint if exists booking_blocked_times_external_busy_fk;
alter table public.booking_blocked_times
  add constraint booking_blocked_times_external_busy_fk
  foreign key (external_busy_period_id)
  references public.booking_external_busy_periods(id)
  on delete cascade not valid;

create index if not exists booking_external_busy_staff_range_idx
  on public.booking_external_busy_periods(company_id, staff_id, starts_at, ends_at);
create index if not exists booking_calendar_sync_jobs_claim_idx
  on public.booking_calendar_sync_jobs(status, available_at, created_at);

-- ---------------------------------------------------------------------------
-- Automated waitlist offers
-- ---------------------------------------------------------------------------

alter table public.booking_waitlist
  add column if not exists guest_phone text;

create index if not exists booking_waitlist_public_match_idx
  on public.booking_waitlist(company_id, service_id, status, preferred_from, preferred_to, created_at);

create table if not exists public.booking_waitlist_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  enabled boolean not null default false,
  offer_mode text not null default 'sequential' check (offer_mode in ('sequential', 'broadcast')),
  offer_expiry_minutes integer not null default 15 check (offer_expiry_minutes between 5 and 1440),
  max_customers_contacted integer not null default 3 check (max_customers_contacted between 1 and 50),
  notification_channels text[] not null default '{email}',
  match_staff boolean not null default true,
  remove_after_booking boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.booking_waitlist_offers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  waitlist_id uuid not null references public.booking_waitlist(id) on delete cascade,
  source_booking_id uuid,
  token_hash text not null,
  offered_starts_at timestamptz not null,
  offered_ends_at timestamptz not null,
  status text not null default 'offered' check (status in ('offered', 'accepted', 'expired', 'declined', 'converted')),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  converted_booking_id uuid,
  attempts integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (token_hash),
  unique (company_id, waitlist_id, offered_starts_at),
  foreign key (company_id, source_booking_id) references public.bookings(company_id, id) on delete set null,
  foreign key (company_id, converted_booking_id) references public.bookings(company_id, id) on delete set null,
  check (offered_ends_at > offered_starts_at)
);

create table if not exists public.booking_waitlist_offer_delivery (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  offer_id uuid not null references public.booking_waitlist_offers(id) on delete cascade,
  raw_token text not null,
  consumed_at timestamptz,
  claimed_at timestamptz,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  unique (offer_id)
);

alter table public.booking_waitlist_offer_delivery
  add column if not exists claimed_at timestamptz,
  add column if not exists attempts integer not null default 0;

create index if not exists booking_waitlist_offers_due_idx on public.booking_waitlist_offers(company_id, status, expires_at);

-- ---------------------------------------------------------------------------
-- Package credit ledger and CRM
-- ---------------------------------------------------------------------------

create table if not exists public.booking_package_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_package_id uuid not null,
  booking_id uuid,
  action text not null check (action in ('purchase', 'redemption', 'restoration', 'expiry', 'manual_adjustment')),
  units integer not null check (units > 0),
  balance_after integer,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (company_id, customer_package_id) references public.booking_customer_packages(company_id, id) on delete cascade,
  foreign key (company_id, booking_id) references public.bookings(company_id, id) on delete set null
);

create table if not exists public.booking_customer_tags (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  color text not null default '#004FFE',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, name)
);

create table if not exists public.booking_customer_tag_links (
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.clients(id) on delete cascade,
  tag_id uuid not null references public.booking_customer_tags(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (company_id, customer_id, tag_id),
  foreign key (company_id, tag_id) references public.booking_customer_tags(company_id, id) on delete cascade
);

create index if not exists booking_customer_tag_links_customer_idx on public.booking_customer_tag_links(company_id, customer_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Lightweight, server-executed automations
-- ---------------------------------------------------------------------------

create table if not exists public.booking_automation_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  enabled boolean not null default true,
  trigger_type text not null check (trigger_type in ('booking_created', 'booking_completed', 'booking_cancelled', 'customer_inactive', 'package_low_balance', 'package_expiring', 'membership_payment_failed', 'customer_birthday')),
  conditions jsonb not null default '{}'::jsonb,
  delay_minutes integer not null default 0 check (delay_minutes between 0 and 525600),
  action_type text not null check (action_type in ('email', 'push', 'sms', 'in_app', 'apply_tag', 'booking_page_link', 'internal_task')),
  action_config jsonb not null default '{}'::jsonb,
  requires_marketing_consent boolean not null default true,
  quiet_hours_start time,
  quiet_hours_end time,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.booking_automation_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  rule_id uuid not null references public.booking_automation_rules(id) on delete cascade,
  customer_id uuid references public.clients(id) on delete set null,
  booking_id uuid,
  status text not null default 'pending' check (status in ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
  due_at timestamptz not null default now(),
  idempotency_key text not null,
  attempts integer not null default 0,
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (company_id, booking_id) references public.bookings(company_id, id) on delete cascade,
  unique (company_id, idempotency_key)
);

create index if not exists booking_automation_runs_claim_idx on public.booking_automation_runs(status, due_at, created_at);
create index if not exists booking_automation_rules_trigger_idx on public.booking_automation_rules(company_id, trigger_type, enabled);

-- ---------------------------------------------------------------------------
-- Tenant isolation for newly introduced tables
-- ---------------------------------------------------------------------------

alter table public.booking_memberships enable row level security;
alter table public.booking_membership_credits enable row level security;
alter table public.booking_membership_credit_ledger enable row level security;
alter table public.booking_calendar_credentials enable row level security;
alter table public.booking_external_busy_periods enable row level security;
alter table public.booking_calendar_sync_jobs enable row level security;
alter table public.booking_waitlist_settings enable row level security;
alter table public.booking_waitlist_offers enable row level security;
alter table public.booking_waitlist_offer_delivery enable row level security;
alter table public.booking_package_credit_ledger enable row level security;
alter table public.booking_customer_tags enable row level security;
alter table public.booking_customer_tag_links enable row level security;
alter table public.booking_automation_rules enable row level security;
alter table public.booking_automation_runs enable row level security;

revoke all on table
  public.booking_memberships,
  public.booking_membership_credits,
  public.booking_membership_credit_ledger,
  public.booking_calendar_credentials,
  public.booking_external_busy_periods,
  public.booking_calendar_sync_jobs,
  public.booking_waitlist_settings,
  public.booking_waitlist_offers,
  public.booking_waitlist_offer_delivery,
  public.booking_package_credit_ledger,
  public.booking_customer_tags,
  public.booking_customer_tag_links,
  public.booking_automation_rules,
  public.booking_automation_runs
from public, anon, authenticated;

drop policy if exists booking_platform_memberships_manage on public.booking_memberships;
create policy booking_platform_memberships_manage on public.booking_memberships
  for all to authenticated
  using (public.can_access_company(company_id) and (coalesce(private.has_company_permission(company_id, 'booking.membership.manage'), false) or coalesce(private.has_company_permission(company_id, 'customer.read'), false)))
  with check (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.membership.manage'), false));

drop policy if exists booking_platform_membership_credits_read on public.booking_membership_credits;
create policy booking_platform_membership_credits_read on public.booking_membership_credits
  for select to authenticated
  using (public.can_access_company(company_id) and (coalesce(private.has_company_permission(company_id, 'customer.read'), false) or coalesce(private.has_company_permission(company_id, 'booking.membership.manage'), false)));

drop policy if exists booking_platform_membership_ledger_read on public.booking_membership_credit_ledger;
create policy booking_platform_membership_ledger_read on public.booking_membership_credit_ledger
  for select to authenticated
  using (public.can_access_company(company_id) and (coalesce(private.has_company_permission(company_id, 'customer.read'), false) or coalesce(private.has_company_permission(company_id, 'booking.membership.manage'), false)));

drop policy if exists booking_platform_waitlist_settings_manage on public.booking_waitlist_settings;
create policy booking_platform_waitlist_settings_manage on public.booking_waitlist_settings
  for all to authenticated
  using (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.waitlist.manage'), false))
  with check (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.waitlist.manage'), false));

drop policy if exists booking_platform_waitlist_offers_read on public.booking_waitlist_offers;
create policy booking_platform_waitlist_offers_read on public.booking_waitlist_offers
  for select to authenticated
  using (public.can_access_company(company_id) and (coalesce(private.has_company_permission(company_id, 'booking.waitlist.manage'), false) or coalesce(private.has_company_permission(company_id, 'booking.read'), false)));

drop policy if exists booking_platform_package_ledger_read on public.booking_package_credit_ledger;
create policy booking_platform_package_ledger_read on public.booking_package_credit_ledger
  for select to authenticated
  using (public.can_access_company(company_id) and (coalesce(private.has_company_permission(company_id, 'customer.read'), false) or coalesce(private.has_company_permission(company_id, 'booking.package.manage'), false)));

drop policy if exists booking_platform_customer_tags_manage on public.booking_customer_tags;
create policy booking_platform_customer_tags_manage on public.booking_customer_tags
  for all to authenticated
  using (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'customer.manage'), false))
  with check (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'customer.manage'), false));

drop policy if exists booking_platform_customer_tag_links_manage on public.booking_customer_tag_links;
create policy booking_platform_customer_tag_links_manage on public.booking_customer_tag_links
  for all to authenticated
  using (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'customer.manage'), false))
  with check (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'customer.manage'), false));

drop policy if exists booking_platform_automations_manage on public.booking_automation_rules;
create policy booking_platform_automations_manage on public.booking_automation_rules
  for all to authenticated
  using (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.automation.manage'), false))
  with check (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.automation.manage'), false));

drop policy if exists booking_platform_automation_runs_read on public.booking_automation_runs;
create policy booking_platform_automation_runs_read on public.booking_automation_runs
  for select to authenticated
  using (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.automation.manage'), false));

grant select on public.booking_memberships, public.booking_membership_credits, public.booking_membership_credit_ledger,
  public.booking_waitlist_settings, public.booking_waitlist_offers, public.booking_package_credit_ledger,
  public.booking_customer_tags, public.booking_customer_tag_links, public.booking_automation_rules,
  public.booking_automation_runs to authenticated;
grant select, insert, update, delete on public.booking_customer_tags, public.booking_customer_tag_links, public.booking_automation_rules, public.booking_waitlist_settings to authenticated;
grant all on table public.booking_calendar_credentials, public.booking_external_busy_periods, public.booking_calendar_sync_jobs, public.booking_waitlist_offer_delivery to service_role;
grant all on table public.booking_memberships, public.booking_membership_credits, public.booking_membership_credit_ledger, public.booking_waitlist_offers, public.booking_package_credit_ledger, public.booking_automation_runs to service_role;

-- ---------------------------------------------------------------------------
-- Calendar connection configuration and worker queue
-- ---------------------------------------------------------------------------

create or replace function private.booking_calendar_rebuild_blocked_times(
  p_company_id uuid,
  p_connection_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  connection_row public.booking_calendar_connections;
begin
  select * into connection_row
  from public.booking_calendar_connections
  where company_id = p_company_id and id = p_connection_id
  for update;
  if not found then return; end if;

  delete from public.booking_blocked_times blocked
  where blocked.company_id = p_company_id
    and blocked.external_busy_period_id in (
      select busy.id from public.booking_external_busy_periods busy
      where busy.company_id = p_company_id and busy.connection_id = p_connection_id
    );

  if connection_row.conflict_blocking_enabled and connection_row.staff_id is not null then
    insert into public.booking_blocked_times(
      company_id, scope_type, staff_id, starts_at, ends_at, reason, created_by, external_busy_period_id
    )
    select busy.company_id, 'staff', busy.staff_id, busy.starts_at, busy.ends_at,
      'External calendar — Busy', null, busy.id
    from public.booking_external_busy_periods busy
    where busy.company_id = p_company_id
      and busy.connection_id = p_connection_id
      and not exists (
        select 1 from public.booking_blocked_times blocked
        where blocked.company_id = busy.company_id and blocked.external_busy_period_id = busy.id
      );
  end if;
end;
$$;

revoke all on function private.booking_calendar_rebuild_blocked_times(uuid, uuid) from public;
grant execute on function private.booking_calendar_rebuild_blocked_times(uuid, uuid) to service_role;

create or replace function public.booking_calendar_connection_configure(
  p_company_id uuid,
  p_connection_id uuid default null,
  p_provider text default 'google',
  p_staff_id uuid default null,
  p_calendar_id text default null,
  p_calendar_name text default null,
  p_account_email text default null,
  p_conflict_blocking_enabled boolean default true,
  p_pull_busy_periods boolean default true,
  p_push_bookings boolean default false,
  p_sync_interval_minutes integer default 15
)
returns public.booking_calendar_connections
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  connection_row public.booking_calendar_connections;
begin
  if actor_id is null or not public.can_access_company(p_company_id) or not coalesce(private.has_company_permission(p_company_id, 'booking.calendar.sync'), false) then
    raise exception 'You do not have permission to manage calendar synchronization' using errcode = '42501';
  end if;
  if p_provider not in ('google', 'apple', 'outlook') then raise exception 'The calendar provider is invalid' using errcode = '22023'; end if;
  if p_sync_interval_minutes < 5 or p_sync_interval_minutes > 1440 then raise exception 'Sync interval must be between 5 minutes and 24 hours' using errcode = '22023'; end if;
  if p_staff_id is not null and not exists (select 1 from public.booking_staff staff where staff.company_id = p_company_id and staff.id = p_staff_id and staff.is_active) then
    raise exception 'The selected staff member does not belong to this workspace' using errcode = '42501';
  end if;
  if p_connection_id is not null then
    select * into connection_row from public.booking_calendar_connections where company_id = p_company_id and id = p_connection_id for update;
    if not found then raise exception 'Calendar connection not found' using errcode = 'P0002'; end if;
  else
    select * into connection_row
    from public.booking_calendar_connections
    where company_id = p_company_id and provider = p_provider and staff_id is not distinct from p_staff_id
    order by created_at desc
    limit 1
    for update;
  end if;
  if connection_row.id is null then
    insert into public.booking_calendar_connections(
      company_id, user_id, provider, staff_id, calendar_id, calendar_name, account_email,
      status, conflict_blocking_enabled, pull_busy_periods, push_bookings,
      sync_interval_minutes, next_sync_at
    ) values (
      p_company_id, actor_id, p_provider, p_staff_id, nullif(trim(p_calendar_id), ''),
      nullif(trim(p_calendar_name), ''), nullif(trim(p_account_email), ''), 'connected',
      coalesce(p_conflict_blocking_enabled, true), coalesce(p_pull_busy_periods, true),
      coalesce(p_push_bookings, false), p_sync_interval_minutes,
      now() + make_interval(mins => p_sync_interval_minutes)
    ) returning * into connection_row;
  else
    update public.booking_calendar_connections
    set staff_id = p_staff_id,
        calendar_id = nullif(trim(p_calendar_id), ''),
        calendar_name = nullif(trim(p_calendar_name), ''),
        account_email = nullif(trim(p_account_email), ''),
        conflict_blocking_enabled = coalesce(p_conflict_blocking_enabled, true),
        pull_busy_periods = coalesce(p_pull_busy_periods, true),
        push_bookings = coalesce(p_push_bookings, false),
        sync_interval_minutes = p_sync_interval_minutes,
        status = case when status = 'disconnected' then 'connected' else status end,
        last_error = null,
        updated_at = now(),
        next_sync_at = now()
    where company_id = p_company_id and id = connection_row.id
    returning * into connection_row;
  end if;
  perform private.booking_calendar_rebuild_blocked_times(p_company_id, connection_row.id);
  perform private.booking_audit_event(p_company_id, null, 'calendar.connection_configured', jsonb_build_object('connection_id', connection_row.id, 'provider', connection_row.provider, 'staff_id', connection_row.staff_id));
  return connection_row;
end;
$$;

revoke all on function public.booking_calendar_connection_configure(uuid, uuid, text, uuid, text, text, text, boolean, boolean, boolean, integer) from public, anon;
grant execute on function public.booking_calendar_connection_configure(uuid, uuid, text, uuid, text, text, text, boolean, boolean, boolean, integer) to authenticated;

-- OAuth callbacks can return in a separate browser context from the mobile
-- app, so the server worker needs a narrowly scoped service-role bridge. The
-- HMAC-signed state is still required by the route, and this wrapper restores
-- the original user's claims before reusing the normal permission checks.
create or replace function public.booking_calendar_connection_configure_service(
  p_user_id uuid,
  p_company_id uuid,
  p_connection_id uuid default null,
  p_provider text default 'google',
  p_staff_id uuid default null,
  p_calendar_id text default null,
  p_calendar_name text default null,
  p_account_email text default null,
  p_conflict_blocking_enabled boolean default true,
  p_pull_busy_periods boolean default true,
  p_push_bookings boolean default false,
  p_sync_interval_minutes integer default 15
)
returns public.booking_calendar_connections
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then raise exception 'Service authorization required' using errcode = '42501'; end if;
  if p_user_id is null or not exists (
    select 1 from public.memberships membership
    where membership.company_id = p_company_id
      and membership.user_id = p_user_id
      and coalesce(membership.status, 'active') = 'active'
  ) then raise exception 'The calendar owner is not an active workspace member' using errcode = '42501'; end if;
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  return public.booking_calendar_connection_configure(
    p_company_id, p_connection_id, p_provider, p_staff_id, p_calendar_id,
    p_calendar_name, p_account_email, p_conflict_blocking_enabled,
    p_pull_busy_periods, p_push_bookings, p_sync_interval_minutes
  );
end;
$$;

revoke all on function public.booking_calendar_connection_configure_service(uuid, uuid, uuid, text, uuid, text, text, text, boolean, boolean, boolean, integer) from public, anon, authenticated;
grant execute on function public.booking_calendar_connection_configure_service(uuid, uuid, uuid, text, uuid, text, text, text, boolean, boolean, boolean, integer) to service_role;

create or replace function public.booking_calendar_connection_disconnect(p_company_id uuid, p_connection_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_access_company(p_company_id) or not coalesce(private.has_company_permission(p_company_id, 'booking.calendar.sync'), false) then
    raise exception 'You do not have permission to disconnect calendars' using errcode = '42501';
  end if;
  update public.booking_calendar_connections
  set status = 'disconnected', conflict_blocking_enabled = false, pull_busy_periods = false,
      push_bookings = false, last_error = null, next_sync_at = null, updated_at = now()
  where company_id = p_company_id and id = p_connection_id;
  delete from public.booking_calendar_credentials where company_id = p_company_id and connection_id = p_connection_id;
  delete from public.booking_external_busy_periods where company_id = p_company_id and connection_id = p_connection_id;
  perform private.booking_audit_event(p_company_id, null, 'calendar.connection_disconnected', jsonb_build_object('connection_id', p_connection_id));
end;
$$;

revoke all on function public.booking_calendar_connection_disconnect(uuid, uuid) from public, anon;
grant execute on function public.booking_calendar_connection_disconnect(uuid, uuid) to authenticated;

-- Keep the existing provider-neutral listing RPC compatible with the new
-- calendar permission. Older tenants may still have the legacy integration
-- permission, so both paths remain accepted during the transition.
create or replace function public.booking_calendar_connections(p_company_id uuid)
returns setof public.booking_calendar_connections
language sql
security definer
set search_path = ''
as $$
  select connection.*
  from public.booking_calendar_connections connection
  where connection.company_id = p_company_id
    and public.can_access_company(p_company_id)
    and (coalesce(private.has_company_permission(p_company_id, 'booking.calendar.sync'), false)
      or coalesce(private.has_company_permission(p_company_id, 'booking.integration.manage'), false))
  order by connection.provider, connection.created_at desc;
$$;

revoke all on function public.booking_calendar_connections(uuid) from public, anon;
grant execute on function public.booking_calendar_connections(uuid) to authenticated;

-- Calendar connection rows contain provider account metadata and legacy
-- clients must use the sanitized RPC above. Keep direct table reads limited to
-- the service-role worker.
revoke select on public.booking_calendar_connections from authenticated;

create or replace function public.booking_calendar_credentials_put(
  p_connection_id uuid,
  p_access_token_ciphertext text,
  p_refresh_token_ciphertext text,
  p_token_expires_at timestamptz default null,
  p_encryption_version integer default 1
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  connection_row public.booking_calendar_connections;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then raise exception 'Service authorization required' using errcode = '42501'; end if;
  select * into connection_row from public.booking_calendar_connections where id = p_connection_id;
  if not found then raise exception 'Calendar connection not found' using errcode = 'P0002'; end if;
  insert into public.booking_calendar_credentials(company_id, connection_id, access_token_ciphertext, refresh_token_ciphertext, token_expires_at, encryption_version, updated_at)
  values (connection_row.company_id, p_connection_id, p_access_token_ciphertext, p_refresh_token_ciphertext, p_token_expires_at, greatest(coalesce(p_encryption_version, 1), 1), now())
  on conflict (company_id, connection_id) do update set
    access_token_ciphertext = excluded.access_token_ciphertext,
    refresh_token_ciphertext = excluded.refresh_token_ciphertext,
    token_expires_at = excluded.token_expires_at,
    encryption_version = excluded.encryption_version,
    updated_at = now();
end;
$$;

revoke all on function public.booking_calendar_credentials_put(uuid, text, text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.booking_calendar_credentials_put(uuid, text, text, timestamptz, integer) to service_role;

-- Apple Calendar does not expose a portable OAuth API. Accept an HTTPS ICS
-- feed, but keep the URL in the same service-only encrypted credential store
-- as provider tokens. The worker decrypts it only while pulling busy periods.
create or replace function public.booking_calendar_apple_configure_service(
  p_user_id uuid,
  p_company_id uuid,
  p_staff_id uuid,
  p_ics_url_ciphertext text,
  p_calendar_name text default 'Apple Calendar',
  p_conflict_blocking_enabled boolean default true,
  p_sync_interval_minutes integer default 30
)
returns public.booking_calendar_connections
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := p_user_id;
  connection_row public.booking_calendar_connections;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then raise exception 'Service authorization required' using errcode = '42501'; end if;
  if actor_id is null or not exists (
    select 1 from public.memberships membership
    where membership.company_id = p_company_id
      and membership.user_id = actor_id
      and coalesce(membership.status, 'active') = 'active'
  ) then raise exception 'The calendar owner is not an active workspace member' using errcode = '42501'; end if;
  perform set_config('request.jwt.claim.sub', actor_id::text, true);
  if not public.can_access_company(p_company_id) or not coalesce(private.has_company_permission(p_company_id, 'booking.calendar.sync'), false) then
    raise exception 'You do not have permission to manage calendar synchronization' using errcode = '42501';
  end if;
  if p_staff_id is null or not exists (select 1 from public.booking_staff staff where staff.company_id = p_company_id and staff.id = p_staff_id and staff.is_active) then
    raise exception 'A valid staff member is required for Apple Calendar conflict blocking' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_ics_url_ciphertext, '')), '') is null or char_length(p_ics_url_ciphertext) > 4096 then
    raise exception 'The Apple Calendar feed is invalid' using errcode = '22023';
  end if;
  if p_sync_interval_minutes < 5 or p_sync_interval_minutes > 1440 then raise exception 'Sync interval must be between 5 minutes and 24 hours' using errcode = '22023'; end if;

  select * into connection_row
  from public.booking_calendar_connections connection
  where connection.company_id = p_company_id and connection.provider = 'apple' and connection.staff_id = p_staff_id
  order by connection.created_at desc
  limit 1
  for update;

  if connection_row.id is null then
    insert into public.booking_calendar_connections(
      company_id, user_id, provider, staff_id, calendar_name, status,
      conflict_blocking_enabled, pull_busy_periods, push_bookings,
      sync_interval_minutes, next_sync_at
    ) values (
      p_company_id, actor_id, 'apple', p_staff_id, nullif(trim(p_calendar_name), ''), 'connected',
      coalesce(p_conflict_blocking_enabled, true), true, false,
      p_sync_interval_minutes, now()
    ) returning * into connection_row;
  else
    update public.booking_calendar_connections
    set user_id = actor_id,
        calendar_name = nullif(trim(p_calendar_name), ''),
        status = 'connected',
        conflict_blocking_enabled = coalesce(p_conflict_blocking_enabled, true),
        pull_busy_periods = true,
        push_bookings = false,
        sync_interval_minutes = p_sync_interval_minutes,
        last_error = null,
        next_sync_at = now(),
        updated_at = now()
    where company_id = p_company_id and id = connection_row.id
    returning * into connection_row;
  end if;

  insert into public.booking_calendar_credentials(company_id, connection_id, apple_ics_url_ciphertext, token_expires_at, encryption_version, updated_at)
  values (p_company_id, connection_row.id, trim(p_ics_url_ciphertext), null, 1, now())
  on conflict (company_id, connection_id) do update set
    apple_ics_url_ciphertext = excluded.apple_ics_url_ciphertext,
    updated_at = now();
  perform private.booking_calendar_rebuild_blocked_times(p_company_id, connection_row.id);
  perform private.booking_audit_event(p_company_id, actor_id, 'calendar.apple_feed_configured', jsonb_build_object('connection_id', connection_row.id, 'staff_id', p_staff_id));
  return connection_row;
end;
$$;

revoke all on function public.booking_calendar_apple_configure_service(uuid, uuid, uuid, text, text, boolean, integer) from public, anon, authenticated;
grant execute on function public.booking_calendar_apple_configure_service(uuid, uuid, uuid, text, text, boolean, integer) to service_role;

create or replace function private.booking_enqueue_calendar_sync_jobs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  connection_row public.booking_calendar_connections;
  job_kind text;
  key_value text;
begin
  if new.status = 'cancelled' then job_kind := 'delete_booking'; else job_kind := 'push_booking'; end if;
  for connection_row in
    select connection.*
    from public.booking_calendar_connections connection
    where connection.company_id = new.company_id
      and connection.status = 'connected'
      and connection.push_bookings
      and (connection.staff_id is null or connection.staff_id = new.staff_id)
  loop
    key_value := new.id::text || ':' || job_kind || ':' || coalesce(to_char(new.updated_at at time zone 'UTC', 'YYYYMMDDHH24MISSMS'), '0');
    insert into public.booking_calendar_sync_jobs(company_id, connection_id, booking_id, job_type, status, idempotency_key)
    values (new.company_id, connection_row.id, new.id, job_kind, 'pending', key_value)
    on conflict (company_id, idempotency_key) do nothing;
  end loop;
  return new;
end;
$$;

drop trigger if exists booking_enqueue_calendar_sync_jobs on public.bookings;
create trigger booking_enqueue_calendar_sync_jobs
after insert or update of starts_at, ends_at, staff_id, location_id, status on public.bookings
for each row execute function private.booking_enqueue_calendar_sync_jobs();

create or replace function public.booking_calendar_sync_claim_jobs(p_limit integer default 25)
returns table(id uuid, company_id uuid, connection_id uuid, booking_id uuid, job_type text, idempotency_key text, attempts integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then raise exception 'Service authorization required' using errcode = '42501'; end if;
  return query
  with candidates as (
    select job.id
    from public.booking_calendar_sync_jobs job
    where job.status in ('pending', 'failed')
      and job.available_at <= now()
      and job.attempts < 8
    order by job.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 25), 100))
  ), claimed as (
    update public.booking_calendar_sync_jobs job
    set status = 'processing', locked_at = now(), attempts = job.attempts + 1
    from candidates
    where job.id = candidates.id
    returning job.*
  )
  select claimed.id, claimed.company_id, claimed.connection_id, claimed.booking_id, claimed.job_type, claimed.idempotency_key, claimed.attempts
  from claimed;
end;
$$;

revoke all on function public.booking_calendar_sync_claim_jobs(integer) from public, anon, authenticated;
grant execute on function public.booking_calendar_sync_claim_jobs(integer) to service_role;

create or replace function public.booking_calendar_sync_complete_job(p_job_id uuid, p_success boolean, p_error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then raise exception 'Service authorization required' using errcode = '42501'; end if;
  update public.booking_calendar_sync_jobs
  set status = case when p_success then 'succeeded' else 'failed' end,
      completed_at = case when p_success then now() else null end,
      locked_at = null,
      available_at = case when p_success then now() else now() + least(interval '1 hour', make_interval(mins => greatest(1, attempts * 5))) end,
      last_error = nullif(left(coalesce(p_error, ''), 1000), '')
  where id = p_job_id;
end;
$$;

revoke all on function public.booking_calendar_sync_complete_job(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.booking_calendar_sync_complete_job(uuid, boolean, text) to service_role;

-- The worker supplies only busy intervals. Event titles and descriptions are
-- intentionally discarded. Existing Booking availability sees the mirrored
-- rows in booking_blocked_times, so public, Web, and Mobile use one predicate.
create or replace function public.booking_calendar_sync_set_busy_periods(p_connection_id uuid, p_periods jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  connection_row public.booking_calendar_connections;
  period_row record;
  inserted_count integer := 0;
  busy_row public.booking_external_busy_periods;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then raise exception 'Service authorization required' using errcode = '42501'; end if;
  select * into connection_row from public.booking_calendar_connections where id = p_connection_id for update;
  if not found or connection_row.staff_id is null then raise exception 'A staff member is required for external conflict synchronization' using errcode = '22023'; end if;
  delete from public.booking_external_busy_periods where company_id = connection_row.company_id and connection_id = p_connection_id;
  for period_row in
    select * from jsonb_to_recordset(coalesce(p_periods, '[]'::jsonb)) as value(external_event_id text, starts_at timestamptz, ends_at timestamptz, all_day boolean, source_label text)
  loop
    if period_row.external_event_id is null or period_row.starts_at is null or period_row.ends_at is null or period_row.ends_at <= period_row.starts_at then continue; end if;
    insert into public.booking_external_busy_periods(company_id, connection_id, staff_id, external_event_id, starts_at, ends_at, all_day, source_label, last_seen_at)
    values (connection_row.company_id, p_connection_id, connection_row.staff_id, left(period_row.external_event_id, 500), period_row.starts_at, period_row.ends_at, coalesce(period_row.all_day, false), 'External calendar — Busy', now())
    returning * into busy_row;
    if connection_row.conflict_blocking_enabled then
      insert into public.booking_blocked_times(company_id, scope_type, staff_id, starts_at, ends_at, reason, created_by, external_busy_period_id)
      values (connection_row.company_id, 'staff', connection_row.staff_id, busy_row.starts_at, busy_row.ends_at, 'External calendar — Busy', null, busy_row.id);
    end if;
    inserted_count := inserted_count + 1;
  end loop;
  update public.booking_calendar_connections set last_synced_at = now(), last_error = null, next_sync_at = now() + make_interval(mins => sync_interval_minutes), status = 'connected', updated_at = now() where id = p_connection_id;
  return inserted_count;
end;
$$;

revoke all on function public.booking_calendar_sync_set_busy_periods(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.booking_calendar_sync_set_busy_periods(uuid, jsonb) to service_role;

create or replace function public.booking_calendar_sync_request(p_company_id uuid, p_connection_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  connection_row public.booking_calendar_connections;
  job_id uuid;
begin
  if actor_id is null or not public.can_access_company(p_company_id) or not coalesce(private.has_company_permission(p_company_id, 'booking.calendar.sync'), false) then raise exception 'You do not have permission to synchronize calendars' using errcode = '42501'; end if;
  select * into connection_row from public.booking_calendar_connections where company_id = p_company_id and id = p_connection_id for update;
  if not found then raise exception 'Calendar connection not found' using errcode = 'P0002'; end if;
  insert into public.booking_calendar_sync_jobs(company_id, connection_id, job_type, idempotency_key, available_at)
  values (p_company_id, p_connection_id, 'full_sync', p_connection_id::text || ':manual:' || to_char(clock_timestamp() at time zone 'UTC', 'YYYYMMDDHH24MISSMS'), now())
  returning id into job_id;
  return job_id;
end;
$$;

revoke all on function public.booking_calendar_sync_request(uuid, uuid) from public, anon;
grant execute on function public.booking_calendar_sync_request(uuid, uuid) to authenticated;

-- The worker calls this before claiming jobs. A due connection gets one
-- idempotent full-sync job per UTC minute, while failed jobs remain retryable
-- through booking_calendar_sync_claim_jobs.
create or replace function public.booking_calendar_sync_enqueue_due(p_limit integer default 100)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  connection_row public.booking_calendar_connections;
  queued_count integer := 0;
  key_value text;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then raise exception 'Service authorization required' using errcode = '42501'; end if;
  for connection_row in
    select connection.*
    from public.booking_calendar_connections connection
    where connection.status = 'connected'
      and connection.pull_busy_periods
      and connection.next_sync_at is not null
      and connection.next_sync_at <= now()
    order by connection.next_sync_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  loop
    key_value := connection_row.id::text || ':due:' || to_char(clock_timestamp() at time zone 'UTC', 'YYYYMMDDHH24MI');
    insert into public.booking_calendar_sync_jobs(company_id, connection_id, job_type, idempotency_key, available_at)
    values (connection_row.company_id, connection_row.id, 'full_sync', key_value, now())
    on conflict (company_id, idempotency_key) do nothing;
    update public.booking_calendar_connections
    set next_sync_at = now() + make_interval(mins => greatest(5, coalesce(connection_row.sync_interval_minutes, 15))), updated_at = now()
    where company_id = connection_row.company_id and id = connection_row.id;
    queued_count := queued_count + 1;
  end loop;
  return queued_count;
end;
$$;

revoke all on function public.booking_calendar_sync_enqueue_due(integer) from public, anon, authenticated;
grant execute on function public.booking_calendar_sync_enqueue_due(integer) to service_role;

-- ---------------------------------------------------------------------------
-- Recurrence preview and customer portal repeat-booking
-- ---------------------------------------------------------------------------

create or replace function public.booking_recurrence_preview(
  p_company_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz default null,
  p_location_id uuid default null,
  p_resource_id uuid default null,
  p_staff_id uuid default null,
  p_participant_count integer default 1,
  p_rule jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  service_row public.booking_services;
  settings_row public.booking_settings;
  frequency_value text := lower(coalesce(p_rule->>'frequency', 'weekly'));
  interval_value integer := greatest(1, coalesce((p_rule->>'interval')::integer, 1));
  occurrence_limit integer := least(100, greatest(1, coalesce((p_rule->>'occurrenceCount')::integer, 12)));
  start_limit date := nullif(p_rule->>'endsOn', '')::date;
  cursor_start timestamptz := p_starts_at;
  cursor_end timestamptz;
  duration_value interval;
  occurrence_index integer := 0;
  available_value boolean;
  conflict_reason text;
  result_value jsonb := '[]'::jsonb;
begin
  if not public.can_access_company(p_company_id) or not coalesce(private.has_company_permission(p_company_id, 'booking.create'), false) then
    raise exception 'You do not have permission to preview recurring bookings' using errcode = '42501';
  end if;
  if p_starts_at is null then raise exception 'A recurrence start is required' using errcode = '22023'; end if;
  if frequency_value not in ('daily', 'weekly', 'monthly', 'custom') then raise exception 'The recurrence frequency is invalid' using errcode = '22023'; end if;
  select * into service_row from public.booking_services where company_id = p_company_id and id = p_service_id and is_active;
  if not found then raise exception 'The selected service is no longer available' using errcode = 'P0002'; end if;
  select * into settings_row from public.booking_settings where company_id = p_company_id;
  duration_value := coalesce(p_ends_at - p_starts_at, make_interval(mins => service_row.duration_minutes));
  if duration_value <= interval '0 minutes' then raise exception 'The recurrence duration is invalid' using errcode = '22023'; end if;

  while occurrence_index < occurrence_limit and (start_limit is null or cursor_start::date <= start_limit) loop
    occurrence_index := occurrence_index + 1;
    cursor_end := cursor_start + duration_value;
    available_value := private.booking_slot_is_available(p_company_id, p_service_id, p_location_id, p_resource_id, p_staff_id, cursor_start, cursor_end, greatest(coalesce(p_participant_count, 1), 1), null);
    conflict_reason := case when available_value then null else 'Staff, resource, working-hours, external-calendar, or existing-booking conflict' end;
    result_value := result_value || jsonb_build_array(jsonb_build_object(
      'index', occurrence_index,
      'startsAt', cursor_start,
      'endsAt', cursor_end,
      'available', available_value,
      'conflictReason', conflict_reason
    ));
    cursor_start := case frequency_value
      when 'daily' then cursor_start + make_interval(days => interval_value)
      when 'weekly' then cursor_start + make_interval(days => 7 * interval_value)
      when 'monthly' then cursor_start + make_interval(months => interval_value)
      else cursor_start + make_interval(days => interval_value)
    end;
  end loop;
  return jsonb_build_object(
    'occurrences', result_value,
    'requested', occurrence_index,
    'available', (select count(*) from jsonb_array_elements(result_value) item where (item->>'available')::boolean),
    'conflicts', (select count(*) from jsonb_array_elements(result_value) item where not (item->>'available')::boolean),
    'timezone', coalesce(settings_row.timezone, 'UTC'),
    'durationMinutes', extract(epoch from duration_value)::integer / 60
  );
end;
$$;

revoke all on function public.booking_recurrence_preview(uuid, uuid, timestamptz, timestamptz, uuid, uuid, uuid, integer, jsonb) from public, anon;
grant execute on function public.booking_recurrence_preview(uuid, uuid, timestamptz, timestamptz, uuid, uuid, uuid, integer, jsonb) to authenticated;

create or replace function public.booking_portal_book_again(p_token text, p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  token_row public.booking_portal_tokens;
  booking_row public.bookings;
  page_slug text;
begin
  select * into token_row from public.booking_portal_tokens token
  where token.token_hash = encode(extensions.digest(trim(coalesce(p_token, '')), 'sha256'), 'hex')
    and token.revoked_at is null and token.expires_at > now();
  if not found then return jsonb_build_object('available', false); end if;
  select * into booking_row from public.bookings where company_id = token_row.company_id and id = p_booking_id and customer_id = token_row.customer_id;
  if not found then return jsonb_build_object('available', false); end if;
  page_slug := nullif(booking_row.source_detail->>'pageSlug', '');
  if page_slug is null then select settings.public_slug into page_slug from public.booking_settings settings where settings.company_id = booking_row.company_id and settings.public_enabled; end if;
  if page_slug is null then return jsonb_build_object('available', false); end if;
  return jsonb_build_object(
    'available', true,
    'slug', page_slug,
    'serviceId', booking_row.service_id,
    'locationId', booking_row.location_id,
    'staffId', booking_row.staff_id
  );
end;
$$;

revoke all on function public.booking_portal_book_again(text, uuid) from public;
grant execute on function public.booking_portal_book_again(text, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Membership plans, customer memberships, and credit invariants
-- ---------------------------------------------------------------------------

create or replace function public.booking_membership_plan_create(
  p_company_id uuid,
  p_name text,
  p_description text default null,
  p_price numeric default 0,
  p_currency text default 'EUR',
  p_billing_interval text default 'monthly',
  p_discount_percent numeric default 0,
  p_uses integer default null,
  p_validity_days integer default null,
  p_trial_days integer default 0,
  p_benefits jsonb default '{}'::jsonb,
  p_service_credits jsonb default '{}'::jsonb
)
returns public.booking_packages
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  plan_row public.booking_packages;
  service_id_value uuid;
  units_value integer;
begin
  if actor_id is null or not public.can_access_company(p_company_id) or not coalesce(private.has_company_permission(p_company_id, 'booking.membership.manage'), false) then raise exception 'You do not have permission to manage memberships' using errcode = '42501'; end if;
  if nullif(trim(p_name), '') is null or p_price < 0 or p_discount_percent < 0 or p_discount_percent > 100 or p_billing_interval not in ('monthly', 'annual', 'custom') then raise exception 'Membership plan values are invalid' using errcode = '22023'; end if;
  insert into public.booking_packages(company_id, kind, name, description, uses, validity_days, price, currency, billing_interval, discount_percent, benefits, trial_days, priority_booking, created_by)
  values (p_company_id, 'membership', trim(p_name), nullif(trim(p_description), ''), p_uses, p_validity_days, round(p_price, 2), upper(p_currency), p_billing_interval, round(p_discount_percent, 4), coalesce(p_benefits, '{}'::jsonb), greatest(coalesce(p_trial_days, 0), 0), coalesce((p_benefits->>'priorityBooking')::boolean, false), actor_id)
  returning * into plan_row;
  for service_id_value, units_value in
    select key::uuid, greatest(1, value::integer) from jsonb_each_text(coalesce(p_service_credits, '{}'::jsonb))
  loop
    if not exists (select 1 from public.booking_services service where service.company_id = p_company_id and service.id = service_id_value and service.is_active) then raise exception 'A membership service does not belong to this organization' using errcode = '42501'; end if;
    insert into public.booking_package_services(company_id, package_id, service_id, included_uses) values (p_company_id, plan_row.id, service_id_value, units_value) on conflict (company_id, package_id, service_id) do update set included_uses = excluded.included_uses;
  end loop;
  perform private.booking_audit_event(p_company_id, null, 'membership.plan_created', jsonb_build_object('package_id', plan_row.id));
  return plan_row;
end;
$$;

revoke all on function public.booking_membership_plan_create(uuid, text, text, numeric, text, text, numeric, integer, integer, integer, jsonb, jsonb) from public, anon;
grant execute on function public.booking_membership_plan_create(uuid, text, text, numeric, text, text, numeric, integer, integer, integer, jsonb, jsonb) to authenticated;

create or replace function public.booking_membership_start(
  p_company_id uuid,
  p_customer_id uuid,
  p_package_id uuid,
  p_starts_on date default current_date,
  p_external_provider text default null,
  p_external_subscription_id text default null
)
returns public.booking_memberships
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  plan_row public.booking_packages;
  membership_row public.booking_memberships;
  mapping_row public.booking_package_services;
  start_date date := coalesce(p_starts_on, current_date);
  period_end date;
  initial_status text;
  credit_row public.booking_membership_credits;
begin
  if actor_id is null or not public.can_access_company(p_company_id) or not coalesce(private.has_company_permission(p_company_id, 'booking.membership.manage'), false) then raise exception 'You do not have permission to start memberships' using errcode = '42501'; end if;
  select * into plan_row from public.booking_packages where company_id = p_company_id and id = p_package_id and kind = 'membership' and is_active;
  if not found then raise exception 'Membership plan not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.clients customer where customer.company_id = p_company_id and customer.id = p_customer_id) then raise exception 'Customer not found' using errcode = 'P0002'; end if;
  period_end := case
    when plan_row.trial_days > 0 then (start_date + plan_row.trial_days - 1)
    when plan_row.billing_interval = 'annual' then (start_date + interval '1 year' - interval '1 day')::date
    when plan_row.billing_interval = 'monthly' then (start_date + interval '1 month' - interval '1 day')::date
    else coalesce(start_date + plan_row.validity_days, (start_date + interval '1 month' - interval '1 day')::date)
  end;
  initial_status := case when plan_row.trial_days > 0 then 'trialing' else 'active' end;
  insert into public.booking_memberships(company_id, customer_id, package_id, status, starts_on, ends_on, next_billing_on, billing_interval, price, currency, external_provider, external_subscription_id)
  values (p_company_id, p_customer_id, p_package_id, initial_status, start_date,
    case when nullif(trim(p_external_subscription_id), '') is null then period_end else null end,
    period_end + 1, plan_row.billing_interval, plan_row.price, plan_row.currency,
    nullif(trim(p_external_provider), ''), nullif(trim(p_external_subscription_id), ''))
  returning * into membership_row;
  for mapping_row in select * from public.booking_package_services where company_id = p_company_id and package_id = p_package_id loop
    insert into public.booking_membership_credits(company_id, membership_id, service_id, period_starts_on, period_ends_on, included_units, remaining_units)
    values (p_company_id, membership_row.id, mapping_row.service_id, start_date, period_end, coalesce(mapping_row.included_uses, plan_row.uses, 1), coalesce(mapping_row.included_uses, plan_row.uses, 1))
    returning * into credit_row;
    insert into public.booking_membership_credit_ledger(company_id, membership_id, credit_id, service_id, action, units, metadata, created_by)
    values (p_company_id, membership_row.id, credit_row.id, credit_row.service_id, 'granted', credit_row.included_units, jsonb_build_object('periodStartsOn', credit_row.period_starts_on, 'periodEndsOn', credit_row.period_ends_on), actor_id);
  end loop;
  perform private.booking_audit_event(p_company_id, null, 'membership.started', jsonb_build_object('membership_id', membership_row.id, 'customer_id', p_customer_id));
  return membership_row;
end;
$$;

revoke all on function public.booking_membership_start(uuid, uuid, uuid, date, text, text) from public, anon;
grant execute on function public.booking_membership_start(uuid, uuid, uuid, date, text, text) to authenticated;

create or replace function public.booking_customer_memberships(p_company_id uuid, p_customer_id uuid)
returns setof public.booking_memberships
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_access_company(p_company_id) or not (coalesce(private.has_company_permission(p_company_id, 'customer.read'), false) or coalesce(private.has_company_permission(p_company_id, 'booking.membership.manage'), false)) then raise exception 'You do not have access to customer memberships' using errcode = '42501'; end if;
  return query select membership.* from public.booking_memberships membership where membership.company_id = p_company_id and membership.customer_id = p_customer_id order by membership.created_at desc;
end;
$$;

revoke all on function public.booking_customer_memberships(uuid, uuid) from public, anon;
grant execute on function public.booking_customer_memberships(uuid, uuid) to authenticated;

-- Extend the existing customer portal response with safe membership data. The
-- portal token still scopes every row to one customer; no internal plan or
-- payment metadata is exposed.
create or replace function public.booking_portal_get(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  token_row public.booking_portal_tokens;
  customer_row public.clients;
begin
  if nullif(trim(p_token), '') is null then return jsonb_build_object('available', false); end if;
  select * into token_row
  from public.booking_portal_tokens token
  where token.token_hash = encode(extensions.digest(trim(p_token), 'sha256'), 'hex')
    and token.revoked_at is null
    and token.expires_at > now()
  for update;
  if not found then return jsonb_build_object('available', false); end if;
  update public.booking_portal_tokens set last_used_at = now() where id = token_row.id;
  select * into customer_row from public.clients customer where customer.company_id = token_row.company_id and customer.id = token_row.customer_id;
  if not found then return jsonb_build_object('available', false); end if;
  return jsonb_build_object(
    'available', true,
    'expiresAt', token_row.expires_at,
    'customer', jsonb_build_object('id', customer_row.id, 'name', customer_row.name, 'email', customer_row.email, 'phone', customer_row.phone),
    'bookings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', booking.id, 'bookingNumber', booking.booking_number, 'service', service.name,
        'startsAt', booking.starts_at, 'endsAt', booking.ends_at, 'timezone', booking.timezone,
        'status', booking.status, 'paymentStatus', booking.payment_status, 'paymentStage', booking.payment_stage,
        'totalAmount', booking.total_amount, 'depositAmount', booking.deposit_amount, 'paidAmount', booking.paid_amount,
        'outstandingBalance', greatest(booking.total_amount - booking.paid_amount, 0), 'currency', booking.currency,
        'location', location.name, 'staff', staff.display_name, 'notes', booking.customer_notes
      ) order by booking.starts_at)
      from public.bookings booking
      join public.booking_services service on service.company_id = booking.company_id and service.id = booking.service_id
      left join public.booking_locations location on location.company_id = booking.company_id and location.id = booking.location_id
      left join public.booking_staff staff on staff.company_id = booking.company_id and staff.id = booking.staff_id
      where booking.company_id = token_row.company_id and booking.customer_id = token_row.customer_id
    ), '[]'::jsonb),
    'packages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', entitlement.id, 'packageId', entitlement.package_id, 'status', entitlement.status,
        'startsOn', entitlement.starts_on, 'endsOn', entitlement.ends_on,
        'remainingUses', entitlement.remaining_uses, 'name', package.name, 'kind', package.kind
      ) order by entitlement.ends_on nulls last, entitlement.starts_on desc)
      from public.booking_customer_packages entitlement
      join public.booking_packages package on package.company_id = entitlement.company_id and package.id = entitlement.package_id
      where entitlement.company_id = token_row.company_id and entitlement.customer_id = token_row.customer_id and entitlement.status = 'active'
    ), '[]'::jsonb),
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', membership.id, 'packageId', membership.package_id, 'status', membership.status,
        'startsOn', membership.starts_on, 'endsOn', membership.ends_on, 'nextBillingOn', membership.next_billing_on,
        'name', package.name, 'billingInterval', membership.billing_interval,
        'credits', coalesce((
          select jsonb_agg(jsonb_build_object('serviceId', credit.service_id, 'service', service.name, 'remainingUnits', credit.remaining_units, 'includedUnits', credit.included_units) order by service.name)
          from public.booking_membership_credits credit
          join public.booking_services service on service.company_id = credit.company_id and service.id = credit.service_id
          where credit.company_id = membership.company_id and credit.membership_id = membership.id and credit.period_ends_on >= current_date
        ), '[]'::jsonb)
      ) order by membership.created_at desc)
      from public.booking_memberships membership
      join public.booking_packages package on package.company_id = membership.company_id and package.id = membership.package_id
      where membership.company_id = token_row.company_id and membership.customer_id = token_row.customer_id and membership.status in ('active', 'trialing', 'past_due', 'paused')
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.booking_portal_get(text) from public;
grant execute on function public.booking_portal_get(text) to anon, authenticated;

create or replace function public.booking_membership_redeem(p_company_id uuid, p_membership_id uuid, p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  membership_row public.booking_memberships;
  plan_row public.booking_packages;
  booking_row public.bookings;
  credit_row public.booking_membership_credits;
begin
  if not public.can_access_company(p_company_id) or not (coalesce(private.has_company_permission(p_company_id, 'booking.update'), false) or coalesce(private.has_company_permission(p_company_id, 'booking.create'), false) or coalesce(private.has_company_permission(p_company_id, 'booking.membership.manage'), false)) then raise exception 'You do not have permission to redeem memberships' using errcode = '42501'; end if;
  select * into booking_row from public.bookings where company_id = p_company_id and id = p_booking_id for update;
  if not found then raise exception 'Booking not found' using errcode = 'P0002'; end if;
  select * into membership_row from public.booking_memberships where company_id = p_company_id and id = p_membership_id and customer_id is not distinct from booking_row.customer_id for update;
  if not found then raise exception 'This membership is not eligible for the booking' using errcode = '55000'; end if;
  select * into plan_row from public.booking_packages where company_id = p_company_id and id = membership_row.package_id and kind = 'membership' and is_active;
  if not found or membership_row.status not in ('active', 'trialing', 'past_due') or (membership_row.ends_on is not null and membership_row.ends_on < current_date) or (membership_row.status = 'past_due' and current_date > coalesce(membership_row.ends_on, current_date) + greatest(coalesce(plan_row.grace_period_days, 0), 0)) then
    raise exception 'This membership is not eligible for the booking' using errcode = '55000';
  end if;
  select credit.* into credit_row
  from public.booking_membership_credits credit
  join public.booking_package_services mapping on mapping.company_id = credit.company_id and mapping.package_id = membership_row.package_id and mapping.service_id = credit.service_id
  where credit.company_id = p_company_id and credit.membership_id = p_membership_id and credit.service_id = booking_row.service_id and credit.period_starts_on <= current_date and credit.period_ends_on >= current_date and credit.remaining_units > 0
  order by credit.period_ends_on
  limit 1
  for update;
  if not found then raise exception 'No membership credit remains for this service' using errcode = '55000'; end if;
  update public.booking_membership_credits set remaining_units = remaining_units - 1, updated_at = now() where id = credit_row.id and remaining_units > 0;
  if not found then raise exception 'The membership credit was already used' using errcode = '40001'; end if;
  if coalesce(booking_row.paid_amount, 0) > 0 or booking_row.payment_status not in ('unpaid', 'failed') then
    raise exception 'Membership credits must be applied before payment' using errcode = '55000';
  end if;
  -- A credit represents an included service, so the booking is fully covered.
  -- The plan discount remains available for future non-credit benefits without
  -- letting a paid booking be rewritten after the fact.
  update public.bookings
  set membership_id = p_membership_id,
      total_amount = 0,
      deposit_amount = 0,
      payment_status = 'paid',
      updated_at = now()
  where company_id = p_company_id and id = p_booking_id;
  insert into public.booking_membership_credit_ledger(company_id, membership_id, credit_id, booking_id, service_id, action, units)
  values (p_company_id, p_membership_id, credit_row.id, p_booking_id, booking_row.service_id, 'redeemed', 1);
  return jsonb_build_object('membershipId', p_membership_id, 'creditId', credit_row.id, 'remainingUnits', credit_row.remaining_units - 1);
end;
$$;

revoke all on function public.booking_membership_redeem(uuid, uuid, uuid) from public, anon;
grant execute on function public.booking_membership_redeem(uuid, uuid, uuid) to authenticated;

-- Apply a customer membership credit in the same transaction as a staff-created
-- booking. This prevents a successful booking from being left behind when the
-- credit is invalid or already exhausted.
create or replace function public.booking_create_with_membership(
  p_company_id uuid,
  p_customer_id uuid default null,
  p_guest_name text default null,
  p_guest_email text default null,
  p_guest_phone text default null,
  p_service_id uuid default null,
  p_location_id uuid default null,
  p_resource_id uuid default null,
  p_staff_id uuid default null,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_quantity integer default 1,
  p_participant_count integer default 1,
  p_requested_status text default 'confirmed',
  p_notes text default null,
  p_internal_notes text default null,
  p_customer_notes text default null,
  p_source text default 'admin',
  p_source_detail jsonb default null,
  p_custom_form_answers jsonb default null,
  p_membership_id uuid default null
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  booking_row public.bookings;
begin
  if actor_id is null or not public.can_access_company(p_company_id) or not private.has_company_permission(p_company_id, 'booking.create') then
    raise exception 'You do not have permission to create bookings' using errcode = '42501';
  end if;
  if p_customer_id is null then raise exception 'A customer is required to use a membership credit' using errcode = '22023'; end if;
  if p_membership_id is null then raise exception 'A membership is required' using errcode = '22023'; end if;
  select * into booking_row
  from public.booking_create_with_details(
    p_company_id => p_company_id,
    p_customer_id => p_customer_id,
    p_guest_name => null,
    p_guest_email => p_guest_email,
    p_guest_phone => p_guest_phone,
    p_service_id => p_service_id,
    p_location_id => p_location_id,
    p_resource_id => p_resource_id,
    p_staff_id => p_staff_id,
    p_starts_at => p_starts_at,
    p_ends_at => p_ends_at,
    p_quantity => p_quantity,
    p_participant_count => p_participant_count,
    p_requested_status => p_requested_status,
    p_notes => p_notes,
    p_internal_notes => p_internal_notes,
    p_customer_notes => p_customer_notes,
    p_source => p_source,
    p_source_detail => p_source_detail,
    p_customer_package_id => null,
    p_custom_form_answers => p_custom_form_answers
  );
  perform public.booking_membership_redeem(p_company_id, p_membership_id, booking_row.id);
  select * into booking_row from public.bookings where company_id = p_company_id and id = booking_row.id;
  return booking_row;
end;
$$;

revoke all on function public.booking_create_with_membership(uuid, uuid, text, text, text, uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, integer, text, text, text, text, text, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.booking_create_with_membership(uuid, uuid, text, text, text, uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, integer, text, text, text, text, text, jsonb, jsonb, uuid) to authenticated;

create or replace function private.booking_restore_membership_credit(p_company_id uuid, p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ledger_row public.booking_membership_credit_ledger;
begin
  select ledger.* into ledger_row
  from public.booking_membership_credit_ledger ledger
  where ledger.company_id = p_company_id and ledger.booking_id = p_booking_id and ledger.action = 'redeemed'
    and not exists (select 1 from public.booking_membership_credit_ledger restored where restored.company_id = ledger.company_id and restored.booking_id = ledger.booking_id and restored.action = 'restored')
  order by ledger.created_at desc
  limit 1;
  if not found or ledger_row.credit_id is null then return; end if;
  update public.booking_membership_credits set remaining_units = least(included_units, remaining_units + ledger_row.units), updated_at = now() where company_id = p_company_id and id = ledger_row.credit_id;
  insert into public.booking_membership_credit_ledger(company_id, membership_id, credit_id, booking_id, service_id, action, units, metadata)
  values (p_company_id, ledger_row.membership_id, ledger_row.credit_id, p_booking_id, ledger_row.service_id, 'restored', ledger_row.units, jsonb_build_object('reason', 'booking_cancelled'));
end;
$$;

create or replace function public.booking_membership_restore(p_company_id uuid, p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_access_company(p_company_id) or not (coalesce(private.has_company_permission(p_company_id, 'booking.update'), false) or coalesce(private.has_company_permission(p_company_id, 'booking.membership.manage'), false)) then raise exception 'You do not have permission to restore membership credits' using errcode = '42501'; end if;
  perform private.booking_restore_membership_credit(p_company_id, p_booking_id);
end;
$$;

revoke all on function public.booking_membership_restore(uuid, uuid) from public, anon;
grant execute on function public.booking_membership_restore(uuid, uuid) to authenticated;

create or replace function public.booking_membership_set_status(p_company_id uuid, p_membership_id uuid, p_status text)
returns public.booking_memberships
language plpgsql
security definer
set search_path = ''
as $$
declare
  membership_row public.booking_memberships;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' and (not public.can_access_company(p_company_id) or not coalesce(private.has_company_permission(p_company_id, 'booking.membership.manage'), false)) then raise exception 'You do not have permission to change membership status' using errcode = '42501'; end if;
  if p_status not in ('active', 'trialing', 'past_due', 'paused', 'cancelled', 'expired') then raise exception 'Membership status is invalid' using errcode = '22023'; end if;
  update public.booking_memberships set status = p_status, cancelled_at = case when p_status = 'cancelled' then now() else cancelled_at end, updated_at = now() where company_id = p_company_id and id = p_membership_id returning * into membership_row;
  if not found then raise exception 'Membership not found' using errcode = 'P0002'; end if;
  return membership_row;
end;
$$;

revoke all on function public.booking_membership_set_status(uuid, uuid, text) from public, anon;
grant execute on function public.booking_membership_set_status(uuid, uuid, text) to authenticated, service_role;

create or replace function public.booking_membership_expire_due(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_count integer;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then raise exception 'Service authorization required' using errcode = '42501'; end if;
  update public.booking_memberships membership
  set status = 'expired', updated_at = now()
  where membership.id in (
    select due.id
    from public.booking_memberships due
    where due.status in ('active', 'trialing', 'past_due')
      and due.ends_on is not null
      and due.ends_on < current_date
    order by due.ends_on
    limit greatest(1, least(coalesce(p_limit, 500), 2000))
  );
  get diagnostics changed_count = row_count;
  return changed_count;
end;
$$;

revoke all on function public.booking_membership_expire_due(integer) from public, anon, authenticated;
grant execute on function public.booking_membership_expire_due(integer) to service_role;

create or replace function private.booking_package_credit_ledger_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  action_value text;
  balance_value integer;
begin
  action_value := case new.action when 'reserved' then 'redemption' when 'consumed' then 'redemption' when 'restored' then 'restoration' when 'voided' then 'restoration' else 'manual_adjustment' end;
  select entitlement.remaining_uses into balance_value from public.booking_customer_packages entitlement where entitlement.company_id = new.company_id and entitlement.id = new.customer_package_id;
  insert into public.booking_package_credit_ledger(company_id, customer_package_id, booking_id, action, units, balance_after, created_by)
  values (new.company_id, new.customer_package_id, new.booking_id, action_value, new.units, balance_value, new.created_by)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists booking_package_usage_ledger on public.booking_package_usage;
create trigger booking_package_usage_ledger after insert on public.booking_package_usage for each row execute function private.booking_package_credit_ledger_trigger();

create or replace function private.booking_customer_package_purchase_ledger_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.booking_package_credit_ledger(company_id, customer_package_id, action, units, balance_after, created_by)
  values (new.company_id, new.id, 'purchase', greatest(coalesce(new.remaining_uses, 1), 1), new.remaining_uses, new.created_by)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists booking_customer_package_purchase_ledger on public.booking_customer_packages;
create trigger booking_customer_package_purchase_ledger after insert on public.booking_customer_packages for each row execute function private.booking_customer_package_purchase_ledger_trigger();

create or replace function private.booking_membership_restore_on_cancel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from new.status and new.membership_id is not null and coalesce(new.cancellation_fee, 0) = 0 then perform private.booking_restore_membership_credit(new.company_id, new.id); end if;
  return new;
end;
$$;

drop trigger if exists booking_membership_restore_on_cancel on public.bookings;
create trigger booking_membership_restore_on_cancel after update of status on public.bookings for each row execute function private.booking_membership_restore_on_cancel();

-- ---------------------------------------------------------------------------
-- Automated waitlist offers
-- ---------------------------------------------------------------------------

create or replace function public.booking_waitlist_settings_save(
  p_company_id uuid,
  p_enabled boolean,
  p_offer_mode text default 'sequential',
  p_offer_expiry_minutes integer default 15,
  p_max_customers_contacted integer default 3,
  p_notification_channels text[] default '{email}',
  p_match_staff boolean default true,
  p_remove_after_booking boolean default true
)
returns public.booking_waitlist_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  result_row public.booking_waitlist_settings;
begin
  if actor_id is null or not public.can_access_company(p_company_id) or not coalesce(private.has_company_permission(p_company_id, 'booking.waitlist.manage'), false) then raise exception 'You do not have permission to manage the waitlist' using errcode = '42501'; end if;
  if p_offer_mode not in ('sequential', 'broadcast') or p_offer_expiry_minutes < 5 or p_offer_expiry_minutes > 1440 or p_max_customers_contacted < 1 or p_max_customers_contacted > 50 then raise exception 'Waitlist settings are invalid' using errcode = '22023'; end if;
  insert into public.booking_waitlist_settings(company_id, enabled, offer_mode, offer_expiry_minutes, max_customers_contacted, notification_channels, match_staff, remove_after_booking, updated_by)
  values (p_company_id, coalesce(p_enabled, false), p_offer_mode, p_offer_expiry_minutes, p_max_customers_contacted, coalesce(p_notification_channels, '{email}'), coalesce(p_match_staff, true), coalesce(p_remove_after_booking, true), actor_id)
  on conflict (company_id) do update set enabled = excluded.enabled, offer_mode = excluded.offer_mode, offer_expiry_minutes = excluded.offer_expiry_minutes, max_customers_contacted = excluded.max_customers_contacted, notification_channels = excluded.notification_channels, match_staff = excluded.match_staff, remove_after_booking = excluded.remove_after_booking, updated_by = excluded.updated_by, updated_at = now()
  returning * into result_row;
  return result_row;
end;
$$;

revoke all on function public.booking_waitlist_settings_save(uuid, boolean, text, integer, integer, text[], boolean, boolean) from public, anon;
grant execute on function public.booking_waitlist_settings_save(uuid, boolean, text, integer, integer, text[], boolean, boolean) to authenticated;

create or replace function public.booking_waitlist_public_status(p_slug text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select coalesce(waitlist.enabled, false)
  from public.booking_pages page
  join public.booking_settings settings on settings.company_id = page.company_id and settings.public_enabled
  left join public.booking_waitlist_settings waitlist on waitlist.company_id = page.company_id
  where page.slug = lower(trim(p_slug)) and page.status = 'published';
$$;

revoke all on function public.booking_waitlist_public_status(text) from public;
grant execute on function public.booking_waitlist_public_status(text) to anon, authenticated;

create or replace function public.booking_waitlist_public_join(
  p_slug text,
  p_service_id uuid,
  p_location_id uuid default null,
  p_staff_id uuid default null,
  p_preferred_from timestamptz default null,
  p_preferred_to timestamptz default null,
  p_preferred_time_start time default null,
  p_preferred_time_end time default null,
  p_participant_count integer default 1,
  p_guest_name text default null,
  p_guest_email text default null,
  p_guest_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_slug text := lower(trim(coalesce(p_slug, '')));
  company_id_value uuid;
  page_id_value uuid;
  request_headers jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
  rate_key text := nullif(request_headers ->> 'x-operix-booking-rate-key', '');
  ip_hash_value text;
  recent_attempts integer;
  waitlist_row public.booking_waitlist;
begin
  if normalized_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or char_length(normalized_slug) > 64 then raise exception 'The booking page is invalid' using errcode = '22023'; end if;
  if rate_key is null or char_length(rate_key) > 128 then raise exception 'The waitlist is temporarily unavailable' using errcode = '42501'; end if;
  if nullif(trim(coalesce(p_guest_name, '')), '') is null then raise exception 'A name is required to join the waitlist' using errcode = '22023'; end if;
  if p_guest_email is not null and (char_length(trim(p_guest_email)) > 320 or trim(p_guest_email) !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then raise exception 'Enter a valid email address' using errcode = '22023'; end if;
  if p_preferred_from is not null and p_preferred_to is not null and p_preferred_to <= p_preferred_from then raise exception 'The preferred date range is invalid' using errcode = '22023'; end if;
  if p_preferred_time_start is not null and p_preferred_time_end is not null and p_preferred_time_end <= p_preferred_time_start then raise exception 'The preferred time range is invalid' using errcode = '22023'; end if;
  if coalesce(p_participant_count, 1) < 1 or coalesce(p_participant_count, 1) > 100 then raise exception 'The participant count is invalid' using errcode = '22023'; end if;

  select page.company_id, page.id into company_id_value, page_id_value
  from public.booking_pages page
  join public.booking_settings settings on settings.company_id = page.company_id and settings.public_enabled
  where page.slug = normalized_slug and page.status = 'published';
  if company_id_value is null then raise exception 'Public booking is not available' using errcode = '42501'; end if;
  if not exists (select 1 from public.booking_waitlist_settings settings where settings.company_id = company_id_value and settings.enabled) then raise exception 'The waitlist is not enabled' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.booking_page_services item
    join public.booking_services service on service.company_id = item.company_id and service.id = item.service_id
    where item.company_id = company_id_value and item.page_id = page_id_value and item.service_id = p_service_id and item.is_enabled and service.is_active
  ) then raise exception 'The selected service is not available' using errcode = 'P0002'; end if;
  if p_location_id is not null and not exists (select 1 from public.booking_page_locations item where item.company_id = company_id_value and item.page_id = page_id_value and item.location_id = p_location_id and item.is_enabled) then raise exception 'The selected location is not available' using errcode = 'P0002'; end if;
  if p_staff_id is not null and not exists (select 1 from public.booking_page_staff item join public.booking_staff staff on staff.company_id = item.company_id and staff.id = item.staff_id and staff.is_active where item.company_id = company_id_value and item.page_id = page_id_value and item.staff_id = p_staff_id and item.is_enabled) then raise exception 'The selected provider is not available' using errcode = 'P0002'; end if;

  ip_hash_value := md5(rate_key || ':' || normalized_slug);
  perform pg_advisory_xact_lock(hashtextextended(ip_hash_value, 0));
  select count(*)::integer into recent_attempts from public.booking_public_attempts attempt where attempt.public_slug = normalized_slug and attempt.ip_hash = ip_hash_value and attempt.created_at > now() - interval '15 minutes';
  if recent_attempts >= 5 then raise exception 'Too many waitlist attempts. Please try again later.' using errcode = '42900'; end if;
  insert into public.booking_public_attempts(company_id, public_slug, ip_hash, guest_email) values (company_id_value, normalized_slug, ip_hash_value, nullif(trim(p_guest_email), ''));
  insert into public.booking_waitlist(company_id, guest_name, guest_email, guest_phone, service_id, location_id, staff_id, preferred_from, preferred_to, preferred_time_start, preferred_time_end, participant_count, priority, status, notes)
  values (company_id_value, nullif(trim(p_guest_name), ''), nullif(trim(p_guest_email), ''), nullif(trim(p_guest_phone), ''), p_service_id, p_location_id, p_staff_id, p_preferred_from, p_preferred_to, p_preferred_time_start, p_preferred_time_end, greatest(coalesce(p_participant_count, 1), 1), 0, 'active', 'Joined from Booking Page')
  returning * into waitlist_row;
  perform private.booking_audit_event(company_id_value, null, 'waitlist.public_joined', jsonb_build_object('waitlist_id', waitlist_row.id, 'service_id', p_service_id, 'page_slug', normalized_slug));
  return jsonb_build_object('joined', true, 'status', waitlist_row.status);
end;
$$;

revoke all on function public.booking_waitlist_public_join(text, uuid, uuid, uuid, timestamptz, timestamptz, time, time, integer, text, text, text) from public;
grant execute on function public.booking_waitlist_public_join(text, uuid, uuid, uuid, timestamptz, timestamptz, time, time, integer, text, text, text) to anon, authenticated;

create or replace function private.booking_waitlist_offer_slot(p_company_id uuid, p_booking_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking_row public.bookings;
  settings_row public.booking_waitlist_settings;
  candidate_row public.booking_waitlist;
  raw_token text;
  offer_row public.booking_waitlist_offers;
  contact_value text;
  contacted integer := 0;
  candidate_limit integer;
begin
  select * into booking_row from public.bookings where company_id = p_company_id and id = p_booking_id;
  if not found or booking_row.status <> 'cancelled' or booking_row.starts_at <= now() then return 0; end if;
  select * into settings_row from public.booking_waitlist_settings where company_id = p_company_id and enabled;
  if not found then return 0; end if;
  candidate_limit := case when settings_row.offer_mode = 'sequential' then 1 else settings_row.max_customers_contacted end;
  for candidate_row in
    select waitlist.* from public.booking_waitlist waitlist
    where waitlist.company_id = p_company_id and waitlist.service_id = booking_row.service_id and waitlist.status = 'active'
      and (not settings_row.match_staff or waitlist.staff_id is null or waitlist.staff_id = booking_row.staff_id)
      and (waitlist.location_id is null or waitlist.location_id = booking_row.location_id)
      and (waitlist.preferred_from is null or booking_row.starts_at >= waitlist.preferred_from)
      and (waitlist.preferred_to is null or booking_row.starts_at < waitlist.preferred_to)
      and (waitlist.preferred_time_start is null or (booking_row.starts_at at time zone booking_row.timezone)::time >= waitlist.preferred_time_start)
      and (waitlist.preferred_time_end is null or (booking_row.starts_at at time zone booking_row.timezone)::time <= waitlist.preferred_time_end)
    order by waitlist.priority desc, waitlist.created_at
    limit candidate_limit
    for update skip locked
  loop
    raw_token := encode(extensions.gen_random_bytes(32), 'hex');
    insert into public.booking_waitlist_offers(company_id, waitlist_id, source_booking_id, token_hash, offered_starts_at, offered_ends_at, expires_at, metadata)
    values (p_company_id, candidate_row.id, p_booking_id, encode(extensions.digest(raw_token, 'sha256'), 'hex'), booking_row.starts_at, booking_row.ends_at, now() + make_interval(mins => settings_row.offer_expiry_minutes), jsonb_build_object('mode', settings_row.offer_mode))
    on conflict (company_id, waitlist_id, offered_starts_at) do nothing
    returning * into offer_row;
    if offer_row.id is null then continue; end if;
    insert into public.booking_waitlist_offer_delivery(company_id, offer_id, raw_token) values (p_company_id, offer_row.id, raw_token);
    update public.booking_waitlist set status = 'offered', offered_until = offer_row.expires_at where company_id = p_company_id and id = candidate_row.id;
    contact_value := coalesce(candidate_row.guest_email, (select customer.email from public.clients customer where customer.company_id = p_company_id and customer.id = candidate_row.customer_id));
    insert into public.booking_notification_log(company_id, booking_id, event_type, channel, recipient, delivery_key, payload)
    values (p_company_id, p_booking_id, 'waitlist.slot_available', case when contact_value is null then 'in_app' else 'email' end, contact_value, 'waitlist-offer:' || offer_row.id::text, jsonb_build_object('offerId', offer_row.id, 'expiresAt', offer_row.expires_at, 'startsAt', booking_row.starts_at, 'endsAt', booking_row.ends_at));
    contacted := contacted + 1;
  end loop;
  return contacted;
end;
$$;

create or replace function private.booking_offer_waitlist_after_cancel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from new.status then perform private.booking_waitlist_offer_slot(new.company_id, new.id); end if;
  return new;
end;
$$;

drop trigger if exists booking_offer_waitlist_after_cancel on public.bookings;
create trigger booking_offer_waitlist_after_cancel after update of status on public.bookings for each row execute function private.booking_offer_waitlist_after_cancel();

create or replace function public.booking_waitlist_claim_offer_deliveries(p_limit integer default 50)
returns table(offer_id uuid, company_id uuid, raw_token text, recipient text, expires_at timestamptz, starts_at timestamptz, ends_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then raise exception 'Service authorization required' using errcode = '42501'; end if;
  return query
  with candidates as (
    select delivery.id
    from public.booking_waitlist_offer_delivery delivery
    join public.booking_waitlist_offers offer on offer.id = delivery.offer_id
    where delivery.consumed_at is null
      and delivery.claimed_at is null
      and offer.status = 'offered'
      and offer.expires_at > now()
    order by offer.created_at
    for update of delivery skip locked
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  ), claimed as (
    update public.booking_waitlist_offer_delivery delivery
    set claimed_at = now(), attempts = delivery.attempts + 1
    from candidates
    where delivery.id = candidates.id
    returning delivery.*
  )
  select offer.id, offer.company_id, claimed.raw_token,
    coalesce(waitlist.guest_email, customer.email), offer.expires_at, offer.offered_starts_at, offer.offered_ends_at
  from claimed
  join public.booking_waitlist_offers offer on offer.id = claimed.offer_id
  join public.booking_waitlist waitlist on waitlist.company_id = offer.company_id and waitlist.id = offer.waitlist_id
  left join public.clients customer on customer.company_id = waitlist.company_id and customer.id = waitlist.customer_id
  where offer.status = 'offered' and offer.expires_at > now();
end;
$$;

revoke all on function public.booking_waitlist_claim_offer_deliveries(integer) from public, anon, authenticated;
grant execute on function public.booking_waitlist_claim_offer_deliveries(integer) to service_role;

create or replace function public.booking_waitlist_mark_offer_delivered(p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then raise exception 'Service authorization required' using errcode = '42501'; end if;
  update public.booking_waitlist_offer_delivery set consumed_at = now(), claimed_at = null, raw_token = '' where offer_id = p_offer_id;
end;
$$;

revoke all on function public.booking_waitlist_mark_offer_delivered(uuid) from public, anon, authenticated;
grant execute on function public.booking_waitlist_mark_offer_delivered(uuid) to service_role;

create or replace function public.booking_waitlist_release_offer_delivery(p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then raise exception 'Service authorization required' using errcode = '42501'; end if;
  update public.booking_waitlist_offer_delivery
  set claimed_at = null
  where offer_id = p_offer_id and consumed_at is null;
end;
$$;

revoke all on function public.booking_waitlist_release_offer_delivery(uuid) from public, anon, authenticated;
grant execute on function public.booking_waitlist_release_offer_delivery(uuid) to service_role;

create or replace function public.booking_waitlist_accept_offer(p_token text, p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  offer_row public.booking_waitlist_offers;
  waitlist_row public.booking_waitlist;
  source_booking public.bookings;
  customer_row public.clients;
  settings_row public.booking_settings;
  slug_value text;
  new_booking public.bookings;
begin
  if nullif(trim(p_token), '') is null then raise exception 'The waitlist offer is invalid' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(trim(p_token) || ':' || p_offer_id::text, 0));
  select * into offer_row from public.booking_waitlist_offers where id = p_offer_id and token_hash = encode(extensions.digest(trim(p_token), 'sha256'), 'hex') for update;
  if not found or offer_row.status <> 'offered' or offer_row.expires_at <= now() then raise exception 'This waitlist offer has expired' using errcode = '41000'; end if;
  select * into waitlist_row from public.booking_waitlist where company_id = offer_row.company_id and id = offer_row.waitlist_id for update;
  select * into source_booking from public.bookings where company_id = offer_row.company_id and id = offer_row.source_booking_id;
  if not found then raise exception 'The offered booking time is no longer available' using errcode = 'P0002'; end if;
  if source_booking.status <> 'cancelled' then raise exception 'The offered booking time is no longer available' using errcode = '55000'; end if;
  select settings.* into settings_row from public.booking_settings settings where settings.company_id = offer_row.company_id;
  slug_value := coalesce(source_booking.source_detail->>'pageSlug', settings_row.public_slug);
  if slug_value is null or settings_row.public_enabled is distinct from true then raise exception 'Public booking is not available' using errcode = '42501'; end if;
  if waitlist_row.customer_id is not null then select * into customer_row from public.clients customer where customer.company_id = waitlist_row.company_id and customer.id = waitlist_row.customer_id; end if;
  select * into new_booking from private.booking_create_core(
    offer_row.company_id,
    waitlist_row.customer_id,
    coalesce(customer_row.name, waitlist_row.guest_name),
    coalesce(customer_row.email, waitlist_row.guest_email),
    customer_row.phone,
    source_booking.service_id, source_booking.location_id, source_booking.resource_id, source_booking.staff_id,
    offer_row.offered_starts_at, offer_row.offered_ends_at, 1, coalesce(waitlist_row.participant_count, 1),
    case when coalesce(settings_row.auto_confirm, true) then 'confirmed' else 'pending' end,
    null, null, null, 'customer_portal', null, null, true, slug_value
  );
  update public.booking_waitlist_offers set status = 'converted', accepted_at = now(), converted_booking_id = new_booking.id where id = offer_row.id;
  update public.booking_waitlist set status = case when (select coalesce(remove_after_booking, true) from public.booking_waitlist_settings where company_id = offer_row.company_id) then 'booked' else 'active' end, offered_until = null where company_id = offer_row.company_id and id = waitlist_row.id;
  return jsonb_build_object('available', true, 'bookingId', new_booking.id, 'bookingNumber', new_booking.booking_number, 'status', new_booking.status);
end;
$$;

revoke all on function public.booking_waitlist_accept_offer(text, uuid) from public;
grant execute on function public.booking_waitlist_accept_offer(text, uuid) to anon, authenticated;

-- Keep the legacy provider-neutral calendar RPC compatible without allowing a
-- raw Apple ICS feed (or OAuth material from older clients) to travel back to
-- mobile/web callers. New Apple connections use the encrypted credential RPC.
create or replace function public.booking_calendar_connection_save(
  p_company_id uuid,
  p_provider text,
  p_external_account_id text default null,
  p_status text default 'connected',
  p_metadata jsonb default '{}'::jsonb
)
returns public.booking_calendar_connections
language plpgsql
security definer
set search_path = ''
as $$
declare
  result_row public.booking_calendar_connections;
  safe_metadata jsonb;
begin
  if not public.can_access_company(p_company_id)
    or not (coalesce(private.has_company_permission(p_company_id, 'booking.integration.manage'), false)
      or coalesce(private.has_company_permission(p_company_id, 'booking.calendar.sync'), false)) then
    raise exception 'You do not have permission to manage calendar integrations' using errcode = '42501';
  end if;
  if p_provider not in ('google', 'apple', 'outlook') or p_status not in ('connected', 'disconnected', 'error') then
    raise exception 'The calendar provider or status is invalid' using errcode = '22023';
  end if;
  if p_provider = 'apple' and (
    coalesce(p_metadata, '{}'::jsonb) ? 'icsUrl'
    or coalesce(p_metadata, '{}'::jsonb) ? 'ics_url'
    or coalesce(p_metadata, '{}'::jsonb) ? 'url'
  ) then
    raise exception 'Apple Calendar feeds must be configured through the secure calendar flow' using errcode = '42501';
  end if;
  safe_metadata := coalesce(p_metadata, '{}'::jsonb)
    - 'access_token'
    - 'refresh_token'
    - 'client_secret'
    - 'icsUrl'
    - 'ics_url'
    - 'url';
  insert into public.booking_calendar_connections(company_id, user_id, provider, external_account_id, status, metadata)
  values (p_company_id, (select auth.uid()), p_provider, nullif(trim(p_external_account_id), ''), p_status, safe_metadata)
  on conflict (company_id, provider, external_account_id) do update
    set status = excluded.status, metadata = excluded.metadata, user_id = excluded.user_id, updated_at = now()
  returning * into result_row;
  return result_row;
end;
$$;

revoke all on function public.booking_calendar_connection_save(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.booking_calendar_connection_save(uuid, text, text, text, jsonb) to authenticated;

create or replace function public.booking_calendar_connections(p_company_id uuid)
returns setof public.booking_calendar_connections
language plpgsql
security definer
set search_path = ''
as $$
declare
  connection_row public.booking_calendar_connections;
begin
  if not public.can_access_company(p_company_id)
    or not (coalesce(private.has_company_permission(p_company_id, 'booking.calendar.sync'), false)
      or coalesce(private.has_company_permission(p_company_id, 'booking.integration.manage'), false)) then
    return;
  end if;
  for connection_row in
    select connection.*
    from public.booking_calendar_connections connection
    where connection.company_id = p_company_id
    order by connection.provider, connection.created_at desc
  loop
    connection_row.metadata := coalesce(connection_row.metadata, '{}'::jsonb)
      - 'access_token'
      - 'refresh_token'
      - 'client_secret'
      - 'icsUrl'
      - 'ics_url'
      - 'url';
    return next connection_row;
  end loop;
  return;
end;
$$;

revoke all on function public.booking_calendar_connections(uuid) from public, anon;
grant execute on function public.booking_calendar_connections(uuid) to authenticated;

create or replace function public.booking_waitlist_expire_offers(p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_count integer;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then raise exception 'Service authorization required' using errcode = '42501'; end if;
  update public.booking_waitlist_offers set status = 'expired' where id in (select id from public.booking_waitlist_offers where status = 'offered' and expires_at <= now() order by expires_at limit greatest(1, least(coalesce(p_limit, 200), 1000)));
  get diagnostics changed_count = row_count;
  update public.booking_waitlist waitlist set status = 'active', offered_until = null where status = 'offered' and offered_until <= now();
  return changed_count;
end;
$$;

revoke all on function public.booking_waitlist_expire_offers(integer) from public, anon, authenticated;
grant execute on function public.booking_waitlist_expire_offers(integer) to service_role;

-- ---------------------------------------------------------------------------
-- Customer CRM intelligence and timeline
-- ---------------------------------------------------------------------------

create or replace function public.booking_customer_tag_save(p_company_id uuid, p_name text, p_color text default '#004FFE')
returns public.booking_customer_tags
language plpgsql
security definer
set search_path = ''
as $$
declare
  result_row public.booking_customer_tags;
begin
  if not public.can_access_company(p_company_id) or not coalesce(private.has_company_permission(p_company_id, 'customer.manage'), false) then raise exception 'You do not have permission to manage customer tags' using errcode = '42501'; end if;
  if nullif(trim(p_name), '') is null or coalesce(p_color, '#004FFE') !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Customer tag values are invalid' using errcode = '22023'; end if;
  insert into public.booking_customer_tags(company_id, name, color, created_by) values (p_company_id, trim(p_name), coalesce(p_color, '#004FFE'), auth.uid())
  on conflict (company_id, name) do update set color = excluded.color
  returning * into result_row;
  return result_row;
end;
$$;

revoke all on function public.booking_customer_tag_save(uuid, text, text) from public, anon;
grant execute on function public.booking_customer_tag_save(uuid, text, text) to authenticated;

create or replace function public.booking_customer_tag_assign(p_company_id uuid, p_customer_id uuid, p_tag_id uuid, p_assigned boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_access_company(p_company_id) or not coalesce(private.has_company_permission(p_company_id, 'customer.manage'), false) then raise exception 'You do not have permission to assign customer tags' using errcode = '42501'; end if;
  if not exists (select 1 from public.clients customer where customer.company_id = p_company_id and customer.id = p_customer_id) or not exists (select 1 from public.booking_customer_tags tag where tag.company_id = p_company_id and tag.id = p_tag_id) then raise exception 'The customer or tag does not belong to this workspace' using errcode = '42501'; end if;
  if coalesce(p_assigned, true) then insert into public.booking_customer_tag_links(company_id, customer_id, tag_id, created_by) values (p_company_id, p_customer_id, p_tag_id, auth.uid()) on conflict do nothing;
  else delete from public.booking_customer_tag_links where company_id = p_company_id and customer_id = p_customer_id and tag_id = p_tag_id; end if;
end;
$$;

revoke all on function public.booking_customer_tag_assign(uuid, uuid, uuid, boolean) from public, anon;
grant execute on function public.booking_customer_tag_assign(uuid, uuid, uuid, boolean) to authenticated;

create or replace function public.booking_customer_intelligence(p_company_id uuid, p_customer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer_row public.clients;
  total_count integer;
  completed_count integer;
  upcoming_count integer;
  cancelled_count integer;
  no_show_count integer;
  revenue_value numeric;
  average_value numeric;
  first_booking timestamptz;
  last_booking timestamptz;
  days_since integer;
  favorite_service jsonb;
  favorite_location jsonb;
  favorite_staff jsonb;
  segments text[] := '{}';
  active_packages jsonb;
  active_memberships jsonb;
  outstanding_value numeric;
  tags_value jsonb;
begin
  if not public.can_access_company(p_company_id) or not (coalesce(private.has_company_permission(p_company_id, 'booking.crm.read'), false) or coalesce(private.has_company_permission(p_company_id, 'customer.read'), false)) then raise exception 'You do not have access to customer intelligence' using errcode = '42501'; end if;
  select * into customer_row from public.clients customer where customer.company_id = p_company_id and customer.id = p_customer_id;
  if not found then raise exception 'Customer not found' using errcode = 'P0002'; end if;
  select count(*)::integer, count(*) filter (where status = 'completed')::integer, count(*) filter (where starts_at >= now() and status not in ('cancelled', 'completed', 'no_show'))::integer, count(*) filter (where status = 'cancelled')::integer, count(*) filter (where status = 'no_show')::integer,
    coalesce(sum(total_amount) filter (where status = 'completed'), 0), coalesce(avg(total_amount) filter (where status not in ('cancelled')), 0), min(starts_at), max(starts_at), coalesce(sum(greatest(total_amount - paid_amount, 0)) filter (where status not in ('cancelled', 'completed')), 0)
  into total_count, completed_count, upcoming_count, cancelled_count, no_show_count, revenue_value, average_value, first_booking, last_booking, outstanding_value
  from public.bookings where company_id = p_company_id and customer_id = p_customer_id;
  days_since := case when last_booking is null then null else greatest(0, current_date - last_booking::date) end;
  select jsonb_build_object('id', grouped.service_id, 'name', grouped.name, 'bookings', grouped.bookings) into favorite_service from (select booking.service_id, service.name, count(*)::integer bookings from public.bookings booking join public.booking_services service on service.company_id = booking.company_id and service.id = booking.service_id where booking.company_id = p_company_id and booking.customer_id = p_customer_id and booking.status not in ('cancelled') group by booking.service_id, service.name order by count(*) desc, service.name limit 1) grouped;
  select jsonb_build_object('id', grouped.location_id, 'name', grouped.name, 'bookings', grouped.bookings) into favorite_location from (select booking.location_id, location.name, count(*)::integer bookings from public.bookings booking join public.booking_locations location on location.company_id = booking.company_id and location.id = booking.location_id where booking.company_id = p_company_id and booking.customer_id = p_customer_id and booking.location_id is not null group by booking.location_id, location.name order by count(*) desc, location.name limit 1) grouped;
  select jsonb_build_object('id', grouped.staff_id, 'name', grouped.name, 'bookings', grouped.bookings) into favorite_staff from (select booking.staff_id, staff.display_name as name, count(*)::integer bookings from public.bookings booking join public.booking_staff staff on staff.company_id = booking.company_id and staff.id = booking.staff_id where booking.company_id = p_company_id and booking.customer_id = p_customer_id and booking.staff_id is not null group by booking.staff_id, staff.display_name order by count(*) desc, staff.display_name limit 1) grouped;
  if total_count = 0 then segments := array_append(segments, 'new'); elsif completed_count >= 3 then segments := array_append(segments, 'returning'); end if;
  if revenue_value >= 1000 then segments := array_append(segments, 'high_value'); end if;
  if completed_count >= 5 then segments := array_append(segments, 'frequent'); end if;
  if last_booking is not null and days_since >= 60 then segments := array_append(segments, 'inactive'); segments := array_append(segments, 'at_risk'); end if;
  if total_count > 0 and cancelled_count::numeric / greatest(total_count, 1) >= 0.25 then segments := array_append(segments, 'frequent_cancellations'); end if;
  if total_count > 0 and no_show_count::numeric / greatest(total_count, 1) >= 0.15 then segments := array_append(segments, 'frequent_no_shows'); end if;
  if exists (select 1 from public.booking_customer_packages entitlement where entitlement.company_id = p_company_id and entitlement.customer_id = p_customer_id and entitlement.status = 'active') then segments := array_append(segments, 'package_holder'); end if;
  if exists (select 1 from public.booking_memberships membership where membership.company_id = p_company_id and membership.customer_id = p_customer_id and membership.status in ('active', 'trialing')) then segments := array_append(segments, 'member'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', entitlement.id, 'name', package.name, 'remainingUses', entitlement.remaining_uses, 'endsOn', entitlement.ends_on, 'status', entitlement.status) order by entitlement.ends_on nulls last), '[]'::jsonb) into active_packages from public.booking_customer_packages entitlement join public.booking_packages package on package.company_id = entitlement.company_id and package.id = entitlement.package_id where entitlement.company_id = p_company_id and entitlement.customer_id = p_customer_id and entitlement.status = 'active';
  select coalesce(jsonb_agg(jsonb_build_object('id', membership.id, 'name', package.name, 'status', membership.status, 'nextBillingOn', membership.next_billing_on, 'endsOn', membership.ends_on) order by membership.created_at desc), '[]'::jsonb) into active_memberships from public.booking_memberships membership join public.booking_packages package on package.company_id = membership.company_id and package.id = membership.package_id where membership.company_id = p_company_id and membership.customer_id = p_customer_id and membership.status in ('active', 'trialing', 'past_due', 'paused');
  select coalesce(jsonb_agg(jsonb_build_object('id', tag.id, 'name', tag.name, 'color', tag.color) order by tag.name), '[]'::jsonb) into tags_value from public.booking_customer_tag_links link join public.booking_customer_tags tag on tag.company_id = link.company_id and tag.id = link.tag_id where link.company_id = p_company_id and link.customer_id = p_customer_id;
  return jsonb_build_object(
    'customer', jsonb_build_object('id', customer_row.id, 'name', customer_row.name, 'email', customer_row.email, 'phone', customer_row.phone),
    'totalBookings', total_count, 'completedBookings', completed_count, 'upcomingBookings', upcoming_count, 'cancelledBookings', cancelled_count, 'noShows', no_show_count,
    'totalRevenue', round(revenue_value, 2), 'averageBookingValue', round(average_value, 2), 'lifetimeValue', round(revenue_value, 2),
    'firstBooking', first_booking, 'lastBooking', last_booking, 'daysSinceLastVisit', days_since, 'outstandingBalance', round(outstanding_value, 2),
    'favoriteService', favorite_service, 'favoriteLocation', favorite_location, 'preferredStaff', favorite_staff,
    'segments', to_jsonb(segments), 'packages', active_packages, 'memberships', active_memberships, 'tags', tags_value
  );
end;
$$;

revoke all on function public.booking_customer_intelligence(uuid, uuid) from public, anon;
grant execute on function public.booking_customer_intelligence(uuid, uuid) to authenticated;

create or replace function public.booking_customer_timeline(p_company_id uuid, p_customer_id uuid, p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_access_company(p_company_id) or not (coalesce(private.has_company_permission(p_company_id, 'booking.crm.read'), false) or coalesce(private.has_company_permission(p_company_id, 'customer.read'), false)) then raise exception 'You do not have access to the customer timeline' using errcode = '42501'; end if;
  if not exists (select 1 from public.clients customer where customer.company_id = p_company_id and customer.id = p_customer_id) then raise exception 'Customer not found' using errcode = 'P0002'; end if;
  return coalesce((
    select jsonb_agg(item.event order by item.created_at desc)
    from (
      select jsonb_build_object('type', 'booking', 'action', audit.action, 'bookingId', audit.booking_id, 'details', audit.details, 'createdAt', audit.created_at) as event, audit.created_at from public.booking_audit_log audit join public.bookings booking on booking.company_id = audit.company_id and booking.id = audit.booking_id where audit.company_id = p_company_id and booking.customer_id = p_customer_id
      union all
      select jsonb_build_object('type', 'status', 'action', 'booking.status_changed', 'bookingId', history.booking_id, 'status', history.to_status, 'createdAt', history.created_at), history.created_at from public.booking_status_history history join public.bookings booking on booking.company_id = history.company_id and booking.id = history.booking_id where history.company_id = p_company_id and booking.customer_id = p_customer_id
      union all
      select jsonb_build_object('type', 'payment', 'action', 'payment.' || payment.status, 'bookingId', payment.booking_id, 'amount', payment.amount, 'currency', payment.currency, 'createdAt', payment.created_at), payment.created_at from public.booking_payments payment join public.bookings booking on booking.company_id = payment.company_id and booking.id = payment.booking_id where payment.company_id = p_company_id and booking.customer_id = p_customer_id
      union all
      select jsonb_build_object('type', 'package', 'action', ledger.action, 'bookingId', ledger.booking_id, 'units', ledger.units, 'createdAt', ledger.created_at), ledger.created_at from public.booking_package_credit_ledger ledger join public.booking_customer_packages entitlement on entitlement.company_id = ledger.company_id and entitlement.id = ledger.customer_package_id where ledger.company_id = p_company_id and entitlement.customer_id = p_customer_id
      union all
      select jsonb_build_object('type', 'membership', 'action', ledger.action, 'bookingId', ledger.booking_id, 'units', ledger.units, 'createdAt', ledger.created_at), ledger.created_at from public.booking_membership_credit_ledger ledger join public.booking_memberships membership on membership.company_id = ledger.company_id and membership.id = ledger.membership_id where ledger.company_id = p_company_id and membership.customer_id = p_customer_id
      order by created_at desc
      limit greatest(1, least(coalesce(p_limit, 100), 500))
    ) item
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.booking_customer_timeline(uuid, uuid, integer) from public, anon;
grant execute on function public.booking_customer_timeline(uuid, uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Consent-aware server automations and durable execution queue
-- ---------------------------------------------------------------------------

alter table public.clients
  add column if not exists marketing_consent boolean not null default false,
  add column if not exists marketing_consent_at timestamptz,
  add column if not exists marketing_unsubscribed_at timestamptz,
  add column if not exists communication_preferences jsonb not null default '{}'::jsonb,
  add column if not exists date_of_birth date;

create or replace function public.booking_automation_rule_save(
  p_company_id uuid,
  p_rule_id uuid default null,
  p_name text default null,
  p_enabled boolean default true,
  p_trigger_type text default 'booking_completed',
  p_conditions jsonb default '{}'::jsonb,
  p_delay_minutes integer default 0,
  p_action_type text default 'email',
  p_action_config jsonb default '{}'::jsonb,
  p_requires_marketing_consent boolean default true,
  p_quiet_hours_start time default null,
  p_quiet_hours_end time default null
)
returns public.booking_automation_rules
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  result_row public.booking_automation_rules;
begin
  if actor_id is null or not public.can_access_company(p_company_id) or not coalesce(private.has_company_permission(p_company_id, 'booking.automation.manage'), false) then raise exception 'You do not have permission to manage automations' using errcode = '42501'; end if;
  if nullif(trim(p_name), '') is null or p_trigger_type not in ('booking_created', 'booking_completed', 'booking_cancelled', 'customer_inactive', 'package_low_balance', 'package_expiring', 'membership_payment_failed', 'customer_birthday') or p_action_type not in ('email', 'push', 'sms', 'in_app', 'apply_tag', 'booking_page_link', 'internal_task') or p_delay_minutes < 0 or p_delay_minutes > 525600 then raise exception 'Automation values are invalid' using errcode = '22023'; end if;
  if p_rule_id is null then
    insert into public.booking_automation_rules(company_id, name, enabled, trigger_type, conditions, delay_minutes, action_type, action_config, requires_marketing_consent, quiet_hours_start, quiet_hours_end, created_by)
    values (p_company_id, trim(p_name), coalesce(p_enabled, true), p_trigger_type, coalesce(p_conditions, '{}'::jsonb), p_delay_minutes, p_action_type, coalesce(p_action_config, '{}'::jsonb), coalesce(p_requires_marketing_consent, true), p_quiet_hours_start, p_quiet_hours_end, actor_id)
    returning * into result_row;
  else
    update public.booking_automation_rules set name = trim(p_name), enabled = coalesce(p_enabled, true), trigger_type = p_trigger_type, conditions = coalesce(p_conditions, '{}'::jsonb), delay_minutes = p_delay_minutes, action_type = p_action_type, action_config = coalesce(p_action_config, '{}'::jsonb), requires_marketing_consent = coalesce(p_requires_marketing_consent, true), quiet_hours_start = p_quiet_hours_start, quiet_hours_end = p_quiet_hours_end, updated_at = now() where company_id = p_company_id and id = p_rule_id returning * into result_row;
    if not found then raise exception 'Automation rule not found' using errcode = 'P0002'; end if;
  end if;
  perform private.booking_audit_event(p_company_id, null, 'automation.rule_saved', jsonb_build_object('rule_id', result_row.id, 'trigger_type', result_row.trigger_type));
  return result_row;
end;
$$;

revoke all on function public.booking_automation_rule_save(uuid, uuid, text, boolean, text, jsonb, integer, text, jsonb, boolean, time, time) from public, anon;
grant execute on function public.booking_automation_rule_save(uuid, uuid, text, boolean, text, jsonb, integer, text, jsonb, boolean, time, time) to authenticated;

create or replace function private.booking_enqueue_automation_for_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  trigger_value text;
  rule_row public.booking_automation_rules;
  customer_allowed boolean := true;
  idempotency_value text;
begin
  trigger_value := case when TG_OP = 'INSERT' then 'booking_created' when new.status = 'completed' then 'booking_completed' when new.status = 'cancelled' then 'booking_cancelled' else null end;
  if trigger_value is null then return new; end if;
  if new.customer_id is not null then
    select coalesce(customer.marketing_consent, false) and customer.marketing_unsubscribed_at is null into customer_allowed from public.clients customer where customer.company_id = new.company_id and customer.id = new.customer_id;
  end if;
  for rule_row in
    select rule.* from public.booking_automation_rules rule
    where rule.company_id = new.company_id and rule.enabled and rule.trigger_type = trigger_value
      and (nullif(rule.conditions->>'serviceId', '') is null or rule.conditions->>'serviceId' = new.service_id::text)
      and (not rule.requires_marketing_consent or customer_allowed)
  loop
    idempotency_value := rule_row.id::text || ':' || new.id::text || ':' || trigger_value;
    insert into public.booking_automation_runs(company_id, rule_id, customer_id, booking_id, due_at, idempotency_key, payload)
    values (new.company_id, rule_row.id, new.customer_id, new.id, now() + make_interval(mins => rule_row.delay_minutes), idempotency_value, jsonb_build_object('trigger', trigger_value, 'serviceId', new.service_id, 'source', new.source))
    on conflict (company_id, idempotency_key) do nothing;
  end loop;
  return new;
end;
$$;

drop trigger if exists booking_enqueue_automation_after_insert on public.bookings;
create trigger booking_enqueue_automation_after_insert after insert on public.bookings for each row execute function private.booking_enqueue_automation_for_booking();
drop trigger if exists booking_enqueue_automation_after_status on public.bookings;
create trigger booking_enqueue_automation_after_status after update of status on public.bookings for each row execute function private.booking_enqueue_automation_for_booking();

create or replace function public.booking_automation_claim_runs(p_limit integer default 25)
returns table(id uuid, company_id uuid, rule_id uuid, customer_id uuid, booking_id uuid, action_type text, action_config jsonb, payload jsonb, attempts integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then raise exception 'Service authorization required' using errcode = '42501'; end if;
  return query
  with candidates as (
    select run.id from public.booking_automation_runs run where run.status = 'pending' and run.due_at <= now() and run.attempts < 8 order by run.due_at, run.created_at for update skip locked limit greatest(1, least(coalesce(p_limit, 25), 100))
  ), claimed as (
    update public.booking_automation_runs run set status = 'running', locked_at = now(), attempts = run.attempts + 1 from candidates where run.id = candidates.id returning run.*
  )
  select claimed.id, claimed.company_id, claimed.rule_id, claimed.customer_id, claimed.booking_id, rule.action_type, rule.action_config, claimed.payload, claimed.attempts
  from claimed join public.booking_automation_rules rule on rule.company_id = claimed.company_id and rule.id = claimed.rule_id;
end;
$$;

revoke all on function public.booking_automation_claim_runs(integer) from public, anon, authenticated;
grant execute on function public.booking_automation_claim_runs(integer) to service_role;

create or replace function public.booking_automation_complete_run(p_run_id uuid, p_success boolean, p_error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then raise exception 'Service authorization required' using errcode = '42501'; end if;
  update public.booking_automation_runs set status = case when p_success then 'succeeded' when attempts >= 8 then 'failed' else 'pending' end, locked_at = null, completed_at = case when p_success then now() else null end, due_at = case when p_success then due_at else now() + least(interval '1 hour', make_interval(mins => greatest(1, attempts * 5))) end, last_error = nullif(left(coalesce(p_error, ''), 1000), '') where id = p_run_id;
end;
$$;

revoke all on function public.booking_automation_complete_run(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.booking_automation_complete_run(uuid, boolean, text) to service_role;

-- ---------------------------------------------------------------------------
-- Advanced analytics and deterministic OperiX Insights
-- ---------------------------------------------------------------------------

create or replace function public.booking_advanced_analytics(
  p_company_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_service_id uuid default null,
  p_staff_id uuid default null,
  p_location_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  summary_value jsonb;
  previous_value jsonb;
  service_metrics jsonb;
  time_series jsonb;
  source_metrics jsonb;
  utilization_value jsonb;
  heatmap_value jsonb;
  funnel_value jsonb;
  customer_value jsonb;
  insights_value jsonb;
  booked_minutes numeric := 0;
  scheduled_minutes numeric := 0;
  total_active integer := 0;
  inactive_count integer := 0;
  busiest_hour integer;
  busiest_hour_count integer;
  previous_revenue numeric := 0;
  previous_bookings numeric := 0;
begin
  if not public.can_access_company(p_company_id) or not (coalesce(private.has_company_permission(p_company_id, 'booking.analytics.advanced'), false) or coalesce(private.has_company_permission(p_company_id, 'booking.analytics'), false) or coalesce(private.has_company_permission(p_company_id, 'report.read'), false)) then raise exception 'You do not have access to advanced booking analytics' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '366 days' then raise exception 'The analytics range is invalid' using errcode = '22023'; end if;
  summary_value := public.booking_analytics_summary(p_company_id, p_from, p_to, p_service_id, p_staff_id, p_location_id);
  previous_value := public.booking_analytics_summary(p_company_id, p_from - (p_to - p_from), p_from, p_service_id, p_staff_id, p_location_id);
  previous_revenue := coalesce((previous_value->>'revenue')::numeric, 0);
  previous_bookings := coalesce((previous_value->>'totalBookings')::numeric, 0);

  select count(*)::integer, coalesce(sum(extract(epoch from (least(booking.ends_at, p_to) - greatest(booking.starts_at, p_from))) / 60) filter (where booking.starts_at < p_to and booking.ends_at > p_from), 0)
  into total_active, booked_minutes
  from public.bookings booking
  where booking.company_id = p_company_id and booking.status in ('pending', 'confirmed', 'checked_in', 'in_progress', 'rescheduled') and booking.starts_at < p_to and booking.ends_at > p_from
    and (p_service_id is null or booking.service_id = p_service_id) and (p_staff_id is null or booking.staff_id = p_staff_id) and (p_location_id is null or booking.location_id = p_location_id);
  select coalesce(sum(extract(epoch from (hours.end_time - hours.start_time)) / 60) * (select count(*) from generate_series(p_from::date, (p_to - interval '1 day')::date, interval '1 day') day where extract(dow from day)::integer = hours.weekday), 0)
  into scheduled_minutes
  from public.booking_working_hours hours
  where hours.company_id = p_company_id and hours.scope_type = 'organization' and hours.is_active;
  utilization_value := jsonb_build_object('bookedHours', round(booked_minutes / 60, 2), 'scheduledHours', round(scheduled_minutes / 60, 2), 'utilization', case when scheduled_minutes = 0 then null else round(least(100, booked_minutes * 100 / scheduled_minutes), 2) end, 'dataAvailable', scheduled_minutes > 0);

  select coalesce(jsonb_agg(jsonb_build_object('date', date_value, 'bookings', bookings, 'revenue', round(revenue, 2)) order by date_value), '[]'::jsonb)
  into time_series
  from (
    select day::date as date_value, count(booking.id)::integer bookings, coalesce(sum(booking.total_amount) filter (where booking.status <> 'cancelled'), 0) revenue
    from generate_series(p_from::date, (p_to - interval '1 day')::date, interval '1 day') day
    left join public.bookings booking on booking.company_id = p_company_id and booking.starts_at >= day and booking.starts_at < day + interval '1 day' and (p_service_id is null or booking.service_id = p_service_id) and (p_staff_id is null or booking.staff_id = p_staff_id) and (p_location_id is null or booking.location_id = p_location_id)
    group by day::date
  ) daily;

  select coalesce(jsonb_agg(jsonb_build_object('id', metrics.service_id, 'name', metrics.name, 'bookings', metrics.bookings, 'revenue', round(metrics.revenue, 2), 'revenuePerHour', case when metrics.booked_minutes = 0 then 0 else round(metrics.revenue / (metrics.booked_minutes / 60), 2) end, 'averagePrice', case when metrics.bookings = 0 then 0 else round(metrics.revenue / metrics.bookings, 2) end, 'cancellationRate', case when metrics.bookings = 0 then 0 else round(metrics.cancelled::numeric * 100 / metrics.bookings, 2) end, 'noShowRate', case when metrics.bookings = 0 then 0 else round(metrics.no_shows::numeric * 100 / metrics.bookings, 2) end, 'repeatBookingRate', case when metrics.bookings = 0 then 0 else round(metrics.repeat_bookings::numeric * 100 / metrics.bookings, 2) end) order by metrics.revenue desc), '[]'::jsonb)
  into service_metrics
  from (
    select booking.service_id, service.name, count(*)::integer bookings, coalesce(sum(booking.total_amount) filter (where booking.status <> 'cancelled'), 0) revenue, coalesce(sum(extract(epoch from (booking.ends_at - booking.starts_at)) / 60) filter (where booking.status not in ('cancelled')), 0) booked_minutes, count(*) filter (where booking.status = 'cancelled')::integer cancelled, count(*) filter (where booking.status = 'no_show')::integer no_shows, count(*) filter (where booking.customer_id is not null and exists (select 1 from public.bookings previous where previous.company_id = booking.company_id and previous.customer_id = booking.customer_id and previous.starts_at < p_from and previous.status = 'completed'))::integer repeat_bookings
    from public.bookings booking join public.booking_services service on service.company_id = booking.company_id and service.id = booking.service_id
    where booking.company_id = p_company_id and booking.starts_at >= p_from and booking.starts_at < p_to and (p_service_id is null or booking.service_id = p_service_id) and (p_staff_id is null or booking.staff_id = p_staff_id) and (p_location_id is null or booking.location_id = p_location_id)
    group by booking.service_id, service.name
  ) metrics;

  select coalesce(jsonb_agg(jsonb_build_object('source', grouped.source, 'bookings', grouped.bookings, 'revenue', round(grouped.revenue, 2)) order by grouped.bookings desc), '[]'::jsonb) into source_metrics from (select coalesce(booking.source_detail->'attribution'->>'utm_source', booking.source_detail->>'origin', booking.source) source, count(*)::integer bookings, coalesce(sum(booking.total_amount) filter (where booking.status <> 'cancelled'), 0) revenue from public.bookings booking where booking.company_id = p_company_id and booking.starts_at >= p_from and booking.starts_at < p_to and (p_service_id is null or booking.service_id = p_service_id) and (p_staff_id is null or booking.staff_id = p_staff_id) and (p_location_id is null or booking.location_id = p_location_id) group by coalesce(booking.source_detail->'attribution'->>'utm_source', booking.source_detail->>'origin', booking.source)) grouped;

  select coalesce(jsonb_agg(jsonb_build_object('weekday', grouped.weekday, 'hour', grouped.hour, 'bookings', grouped.bookings, 'utilization', case when total_active = 0 then 0 else round(grouped.bookings * 100 / total_active, 2) end) order by grouped.bookings desc), '[]'::jsonb) into heatmap_value from (select extract(dow from booking.starts_at at time zone booking.timezone)::integer as weekday, extract(hour from booking.starts_at at time zone booking.timezone)::integer as hour, count(*)::integer as bookings from public.bookings booking where booking.company_id = p_company_id and booking.starts_at >= p_from and booking.starts_at < p_to and booking.status not in ('cancelled') group by extract(dow from booking.starts_at at time zone booking.timezone), extract(hour from booking.starts_at at time zone booking.timezone)) grouped;

  select count(*)::integer into inactive_count from public.clients customer where customer.company_id = p_company_id and exists (select 1 from public.bookings booking where booking.company_id = p_company_id and booking.customer_id = customer.id and booking.status = 'completed') and not exists (select 1 from public.bookings recent where recent.company_id = p_company_id and recent.customer_id = customer.id and recent.status not in ('cancelled', 'no_show') and recent.starts_at >= now() - interval '60 days');
  select extract(hour from booking.starts_at at time zone booking.timezone)::integer, count(*)::integer into busiest_hour, busiest_hour_count from public.bookings booking where booking.company_id = p_company_id and booking.starts_at >= p_from and booking.starts_at < p_to and booking.status not in ('cancelled') group by extract(hour from booking.starts_at at time zone booking.timezone) order by count(*) desc limit 1;
  customer_value := jsonb_build_object('new', coalesce((summary_value->>'newCustomers')::integer, 0), 'returning', coalesce((summary_value->>'returningCustomers')::integer, 0), 'inactive60Days', inactive_count);
  funnel_value := jsonb_build_object(
    'pageViewed', (select count(*) from public.booking_page_events event where event.company_id = p_company_id and event.event_name = 'page_view' and event.created_at >= p_from and event.created_at < p_to),
    'bookingStarted', (select count(*) from public.booking_page_events event where event.company_id = p_company_id and event.event_name = 'booking_started' and event.created_at >= p_from and event.created_at < p_to),
    'serviceSelected', (select count(*) from public.booking_page_events event where event.company_id = p_company_id and event.event_name = 'service_selected' and event.created_at >= p_from and event.created_at < p_to),
    'slotSelected', (select count(*) from public.booking_page_events event where event.company_id = p_company_id and event.event_name = 'slot_selected' and event.created_at >= p_from and event.created_at < p_to),
    'paymentStarted', (select count(*) from public.booking_page_events event where event.company_id = p_company_id and event.event_name = 'payment_started' and event.created_at >= p_from and event.created_at < p_to),
    'bookingCompleted', (select count(*) from public.booking_page_events event where event.company_id = p_company_id and event.event_name = 'booking_completed' and event.created_at >= p_from and event.created_at < p_to)
  );
  insights_value := case when total_active = 0 then jsonb_build_array(jsonb_build_object('kind', 'insufficient_data', 'message', 'Not enough data yet')) else jsonb_build_array(
    jsonb_build_object('kind', 'busy_hour', 'message', coalesce('Hour ' || lpad(busiest_hour::text, 2, '0') || ':00 is your busiest booking period with ' || busiest_hour_count::text || ' bookings.', 'Not enough data yet')),
    jsonb_build_object('kind', 'inactive_customers', 'message', case when inactive_count > 0 then inactive_count::text || ' customers who previously booked have not returned in 60+ days.' else 'No inactive customer trend detected yet.' end)
  ) end;
  return jsonb_build_object(
    'from', p_from, 'to', p_to,
    'overview', summary_value || jsonb_build_object('previous', previous_value, 'revenueChangePercent', case when previous_revenue = 0 then null else round(((coalesce((summary_value->>'revenue')::numeric, 0) - previous_revenue) * 100 / previous_revenue), 2) end, 'bookingChangePercent', case when previous_bookings = 0 then null else round(((coalesce((summary_value->>'totalBookings')::numeric, 0) - previous_bookings) * 100 / previous_bookings), 2) end, 'revenueDefinition', 'Booking total_amount for non-cancelled reservations; payment ledger remains canonical for collected cash.'),
    'revenue', jsonb_build_object('overTime', time_series, 'bySource', source_metrics, 'depositRevenue', coalesce((summary_value->>'depositsCollected')::numeric, 0)),
    'services', service_metrics,
    'utilization', utilization_value,
    'heatmap', heatmap_value,
    'customers', customer_value,
    'funnel', funnel_value,
    'insights', insights_value
  );
end;
$$;

revoke all on function public.booking_advanced_analytics(uuid, timestamptz, timestamptz, uuid, uuid, uuid) from public, anon;
grant execute on function public.booking_advanced_analytics(uuid, timestamptz, timestamptz, uuid, uuid, uuid) to authenticated;

-- UTM attribution is written by the trusted public-booking server after the
-- atomic create RPC returns. It is intentionally limited to common marketing
-- keys and stored in the existing booking source detail JSON.
create or replace function public.booking_page_public_record_attribution(p_booking_id uuid, p_attribution jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking_row public.bookings;
  safe_attribution jsonb := '{}'::jsonb;
  key_value text;
  value_text text;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then raise exception 'Service authorization required' using errcode = '42501'; end if;
  select booking.* into booking_row from public.bookings booking where booking.id = p_booking_id and booking.source = 'public';
  if not found then return; end if;
  foreach key_value in array array['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] loop
    value_text := nullif(left(trim(coalesce(p_attribution ->> key_value, '')), 200), '');
    if value_text is not null then safe_attribution := safe_attribution || jsonb_build_object(key_value, value_text); end if;
  end loop;
  if safe_attribution = '{}'::jsonb then return; end if;
  update public.bookings
  set source_detail = coalesce(source_detail, '{}'::jsonb) || jsonb_build_object('attribution', safe_attribution), updated_at = now()
  where id = p_booking_id and company_id = booking_row.company_id;
end;
$$;

revoke all on function public.booking_page_public_record_attribution(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.booking_page_public_record_attribution(uuid, jsonb) to service_role;

-- Public-page guests do not have an auth.users-backed client row, so they use
-- a separate opaque management token. It never replaces the authenticated
-- customer portal token and is scoped to one booking only.
create table if not exists public.booking_guest_manage_tokens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  booking_id uuid not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (company_id, booking_id) references public.bookings(company_id, id) on delete cascade
);

create index if not exists booking_guest_manage_tokens_lookup_idx
  on public.booking_guest_manage_tokens(token_hash, expires_at)
  where revoked_at is null;

alter table public.booking_guest_manage_tokens enable row level security;
revoke all on table public.booking_guest_manage_tokens from public, anon, authenticated;
grant all on table public.booking_guest_manage_tokens to service_role;

create or replace function public.booking_guest_manage_issue(p_booking_id uuid, p_expires_in_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking_row public.bookings;
  raw_token text := encode(extensions.gen_random_bytes(32), 'hex');
  expires_at_value timestamptz;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then raise exception 'Service authorization required' using errcode = '42501'; end if;
  if p_expires_in_days < 1 or p_expires_in_days > 90 then raise exception 'Guest management links must expire within 90 days' using errcode = '22023'; end if;
  select booking.* into booking_row from public.bookings booking where booking.id = p_booking_id and booking.source = 'public';
  if not found then raise exception 'Public booking not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.booking_settings settings where settings.company_id = booking_row.company_id and coalesce(settings.customer_portal_enabled, true)) then raise exception 'Customer booking management is disabled' using errcode = '42501'; end if;
  expires_at_value := now() + make_interval(days => p_expires_in_days);
  insert into public.booking_guest_manage_tokens(company_id, booking_id, token_hash, expires_at)
  values (booking_row.company_id, booking_row.id, encode(extensions.digest(raw_token, 'sha256'), 'hex'), expires_at_value);
  return jsonb_build_object('token', raw_token, 'expiresAt', expires_at_value);
end;
$$;

revoke all on function public.booking_guest_manage_issue(uuid, integer) from public, anon, authenticated;
grant execute on function public.booking_guest_manage_issue(uuid, integer) to service_role;

create or replace function public.booking_guest_manage_get(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  token_row public.booking_guest_manage_tokens;
  booking_row public.bookings;
  service_row public.booking_services;
  location_name text;
  staff_name text;
  settings_row public.booking_settings;
begin
  if nullif(trim(p_token), '') is null then return jsonb_build_object('available', false); end if;
  select token.* into token_row from public.booking_guest_manage_tokens token
  where token.token_hash = encode(extensions.digest(trim(p_token), 'sha256'), 'hex') and token.revoked_at is null and token.expires_at > now()
  for update;
  if not found then return jsonb_build_object('available', false); end if;
  select booking.* into booking_row from public.bookings booking where booking.company_id = token_row.company_id and booking.id = token_row.booking_id;
  if not found then return jsonb_build_object('available', false); end if;
  update public.booking_guest_manage_tokens set last_used_at = now() where id = token_row.id;
  select service.* into service_row from public.booking_services service where service.company_id = booking_row.company_id and service.id = booking_row.service_id;
  select location.name into location_name from public.booking_locations location where location.company_id = booking_row.company_id and location.id = booking_row.location_id;
  select staff.display_name into staff_name from public.booking_staff staff where staff.company_id = booking_row.company_id and staff.id = booking_row.staff_id;
  select settings.* into settings_row from public.booking_settings settings where settings.company_id = booking_row.company_id;
  return jsonb_build_object(
    'available', true,
    'expiresAt', token_row.expires_at,
    'businessName', coalesce((select company.company_name from public.companies company where company.id = booking_row.company_id), 'Booking'),
    'slug', coalesce(booking_row.source_detail->>'pageSlug', settings_row.public_slug),
    'booking', jsonb_build_object(
      'id', booking_row.id, 'bookingNumber', booking_row.booking_number, 'status', booking_row.status,
      'service', service_row.name, 'serviceId', booking_row.service_id, 'startsAt', booking_row.starts_at,
      'endsAt', booking_row.ends_at, 'timezone', booking_row.timezone, 'locationId', booking_row.location_id,
      'staffId', booking_row.staff_id, 'location', location_name, 'staff', staff_name,
      'totalAmount', booking_row.total_amount, 'depositAmount', booking_row.deposit_amount,
      'paidAmount', booking_row.paid_amount, 'balance', greatest(booking_row.total_amount - booking_row.paid_amount, 0),
      'paymentStatus', booking_row.payment_status, 'currency', booking_row.currency,
      'guestName', booking_row.guest_name, 'guestEmail', booking_row.guest_email, 'guestPhone', booking_row.guest_phone
    ),
    'allowCancellation', coalesce(settings_row.allow_customer_cancellation, false),
    'allowRescheduling', coalesce(settings_row.allow_customer_rescheduling, false)
  );
end;
$$;

revoke all on function public.booking_guest_manage_get(text) from public;
grant execute on function public.booking_guest_manage_get(text) to anon, authenticated;

create or replace function public.booking_guest_manage_cancel(p_token text, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  token_row public.booking_guest_manage_tokens;
  booking_row public.bookings;
  settings_row public.booking_settings;
  policy jsonb;
  free_window boolean;
  fee numeric(20,4) := 0;
  refund numeric(20,4) := 0;
  old_status text;
begin
  select token.* into token_row from public.booking_guest_manage_tokens token where token.token_hash = encode(extensions.digest(trim(p_token), 'sha256'), 'hex') and token.revoked_at is null and token.expires_at > now() for update;
  if not found then raise exception 'The guest management link is invalid or expired' using errcode = '42501'; end if;
  select settings.* into settings_row from public.booking_settings settings where settings.company_id = token_row.company_id;
  if not coalesce(settings_row.customer_portal_enabled, true) or not coalesce(settings_row.allow_customer_cancellation, false) then raise exception 'Customer cancellation is disabled' using errcode = '42501'; end if;
  select booking.* into booking_row from public.bookings booking where booking.company_id = token_row.company_id and booking.id = token_row.booking_id for update;
  if not found or booking_row.status in ('cancelled', 'completed', 'no_show') then raise exception 'This booking cannot be cancelled' using errcode = '55000'; end if;
  if now() > booking_row.starts_at - make_interval(mins => coalesce(settings_row.cancellation_cutoff_minutes, 120)) then raise exception 'The cancellation window has closed' using errcode = '55000'; end if;
  policy := case when booking_row.policy_snapshot = '{}'::jsonb then private.booking_resolve_policy(token_row.company_id, booking_row.service_id) else booking_row.policy_snapshot end;
  free_window := now() <= booking_row.starts_at - make_interval(mins => greatest(0, coalesce((policy->>'freeCancellationMinutes')::integer, 120)));
  if not free_window then fee := private.booking_policy_fee(policy, 'late', booking_row.total_amount); end if;
  if free_window and coalesce((policy->>'depositsRefundable')::boolean, false) then refund := greatest(0, least(booking_row.deposit_amount, booking_row.paid_amount) - fee); end if;
  old_status := booking_row.status;
  update public.bookings set status = 'cancelled', cancellation_fee = round(fee, 2), deposit_refund_amount = round(refund, 2), updated_at = now() where company_id = token_row.company_id and id = booking_row.id returning * into booking_row;
  insert into public.booking_status_history(company_id, booking_id, from_status, to_status, reason, actor_user_id) values (token_row.company_id, booking_row.id, old_status, 'cancelled', p_reason, null);
  insert into public.booking_audit_log(company_id, booking_id, actor_user_id, action, entity, entity_id, details) values (token_row.company_id, booking_row.id, null, 'booking.guest_cancelled', 'booking', booking_row.id, jsonb_build_object('reason', p_reason, 'cancellation_fee', fee, 'deposit_refund_amount', refund));
  return jsonb_build_object('bookingId', booking_row.id, 'bookingNumber', booking_row.booking_number, 'status', booking_row.status, 'cancellationFee', fee, 'depositRefundAmount', refund);
end;
$$;

revoke all on function public.booking_guest_manage_cancel(text, text) from public;
grant execute on function public.booking_guest_manage_cancel(text, text) to anon, authenticated;

create or replace function public.booking_guest_manage_reschedule(p_token text, p_starts_at timestamptz, p_ends_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  token_row public.booking_guest_manage_tokens;
  booking_row public.bookings;
  service_row public.booking_services;
  settings_row public.booking_settings;
  new_ends_at timestamptz;
  old_status text;
begin
  select token.* into token_row from public.booking_guest_manage_tokens token where token.token_hash = encode(extensions.digest(trim(p_token), 'sha256'), 'hex') and token.revoked_at is null and token.expires_at > now() for update;
  if not found then raise exception 'The guest management link is invalid or expired' using errcode = '42501'; end if;
  select settings.* into settings_row from public.booking_settings settings where settings.company_id = token_row.company_id;
  if not coalesce(settings_row.customer_portal_enabled, true) or not coalesce(settings_row.allow_customer_rescheduling, false) then raise exception 'Customer rescheduling is disabled' using errcode = '42501'; end if;
  select booking.* into booking_row from public.bookings booking where booking.company_id = token_row.company_id and booking.id = token_row.booking_id for update;
  if not found or booking_row.status in ('cancelled', 'completed', 'no_show') then raise exception 'This booking cannot be rescheduled' using errcode = '55000'; end if;
  if now() > booking_row.starts_at - make_interval(mins => coalesce(settings_row.reschedule_cutoff_minutes, 120)) then raise exception 'The rescheduling window has closed' using errcode = '55000'; end if;
  select service.* into service_row from public.booking_services service where service.company_id = token_row.company_id and service.id = booking_row.service_id and service.is_active;
  if not found then raise exception 'This service is no longer available' using errcode = 'P0002'; end if;
  new_ends_at := coalesce(p_ends_at, p_starts_at + make_interval(mins => service_row.duration_minutes));
  if p_starts_at is null or new_ends_at <= p_starts_at then raise exception 'The new booking time is invalid' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(token_row.company_id::text || ':availability', 0));
  if not private.booking_slot_is_available(token_row.company_id, booking_row.service_id, booking_row.location_id, booking_row.resource_id, booking_row.staff_id, p_starts_at, new_ends_at, booking_row.participant_count, booking_row.id) then raise exception 'This time slot is no longer available' using errcode = '23P01'; end if;
  old_status := booking_row.status;
  update public.bookings set starts_at = p_starts_at, ends_at = new_ends_at, duration_minutes = extract(epoch from (new_ends_at - p_starts_at))::integer / 60, status = case when old_status = 'confirmed' then 'rescheduled' else old_status end, updated_at = now() where company_id = token_row.company_id and id = booking_row.id returning * into booking_row;
  insert into public.booking_status_history(company_id, booking_id, from_status, to_status, reason, actor_user_id) values (token_row.company_id, booking_row.id, old_status, booking_row.status, 'Guest booking reschedule', null);
  insert into public.booking_audit_log(company_id, booking_id, actor_user_id, action, entity, entity_id, details) values (token_row.company_id, booking_row.id, null, 'booking.guest_rescheduled', 'booking', booking_row.id, jsonb_build_object('new_starts_at', p_starts_at));
  return jsonb_build_object('bookingId', booking_row.id, 'bookingNumber', booking_row.booking_number, 'startsAt', booking_row.starts_at, 'endsAt', booking_row.ends_at, 'status', booking_row.status);
end;
$$;

revoke all on function public.booking_guest_manage_reschedule(text, timestamptz, timestamptz) from public;
grant execute on function public.booking_guest_manage_reschedule(text, timestamptz, timestamptz) to anon, authenticated;

create or replace function public.booking_guest_manage_book_again(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  token_row public.booking_guest_manage_tokens;
  booking_row public.bookings;
  settings_row public.booking_settings;
begin
  select token.* into token_row from public.booking_guest_manage_tokens token where token.token_hash = encode(extensions.digest(trim(p_token), 'sha256'), 'hex') and token.revoked_at is null and token.expires_at > now();
  if not found then raise exception 'The guest management link is invalid or expired' using errcode = '42501'; end if;
  select booking.* into booking_row from public.bookings booking where booking.company_id = token_row.company_id and booking.id = token_row.booking_id;
  if not found then raise exception 'The booking is no longer available' using errcode = 'P0002'; end if;
  select settings.* into settings_row from public.booking_settings settings where settings.company_id = token_row.company_id;
  if not found or settings_row.public_enabled is distinct from true then raise exception 'Public booking is not available' using errcode = '42501'; end if;
  return jsonb_build_object('available', true, 'slug', coalesce(booking_row.source_detail->>'pageSlug', settings_row.public_slug), 'serviceId', booking_row.service_id, 'locationId', booking_row.location_id, 'staffId', booking_row.staff_id);
end;
$$;

revoke all on function public.booking_guest_manage_book_again(text) from public;
grant execute on function public.booking_guest_manage_book_again(text) to anon, authenticated;

-- Expire package entitlements in the background and keep the credit ledger
-- auditable. Package usage already writes redemption/restoration entries; this
-- closes the remaining lifecycle gap for unused credits that pass their end
-- date.
create or replace function private.booking_customer_package_expiry_ledger_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'expired'
    and old.status is distinct from new.status
    and coalesce(old.remaining_uses, 0) > 0 then
    insert into public.booking_package_credit_ledger(
      company_id, customer_package_id, action, units, balance_after, created_by, metadata
    )
    values (
      new.company_id,
      new.id,
      'expiry',
      old.remaining_uses,
      new.remaining_uses,
      new.created_by,
      jsonb_build_object('expiredOn', current_date)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists booking_customer_package_expiry_ledger on public.booking_customer_packages;
create trigger booking_customer_package_expiry_ledger
after update of status on public.booking_customer_packages
for each row execute function private.booking_customer_package_expiry_ledger_trigger();

create or replace function public.booking_package_expire_due(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_count integer;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'Service authorization required' using errcode = '42501';
  end if;
  update public.booking_customer_packages entitlement
  set status = 'expired', updated_at = now()
  where entitlement.id in (
    select due.id
    from public.booking_customer_packages due
    where due.status = 'active'
      and due.ends_on is not null
      and due.ends_on < current_date
    order by due.ends_on
    limit greatest(1, least(coalesce(p_limit, 500), 2000))
  );
  get diagnostics changed_count = row_count;
  return changed_count;
end;
$$;

revoke all on function public.booking_package_expire_due(integer) from public, anon, authenticated;
grant execute on function public.booking_package_expire_due(integer) to service_role;

-- A cancellation and a reschedule both free a slot. Keep the matching and
-- offer creation in one helper so the same waitlist rules apply to either
-- event, while the existing cancellation wrapper remains backwards compatible.
create or replace function private.booking_waitlist_offer_freed_slot(
  p_company_id uuid,
  p_source_booking_id uuid,
  p_service_id uuid,
  p_location_id uuid,
  p_staff_id uuid,
  p_resource_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_timezone text,
  p_participant_count integer default 1
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings_row public.booking_waitlist_settings;
  candidate_row public.booking_waitlist;
  offer_row public.booking_waitlist_offers;
  raw_token text;
  contact_value text;
  contacted integer := 0;
  candidate_limit integer;
begin
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at or p_starts_at <= now() then
    return 0;
  end if;
  select * into settings_row
  from public.booking_waitlist_settings settings
  where settings.company_id = p_company_id and settings.enabled;
  if not found then return 0; end if;
  candidate_limit := case when settings_row.offer_mode = 'sequential' then 1 else settings_row.max_customers_contacted end;
  for candidate_row in
    select waitlist.*
    from public.booking_waitlist waitlist
    where waitlist.company_id = p_company_id
      and waitlist.service_id = p_service_id
      and waitlist.status = 'active'
      and coalesce(waitlist.participant_count, 1) <= greatest(coalesce(p_participant_count, 1), 1)
      and (not settings_row.match_staff or waitlist.staff_id is null or waitlist.staff_id = p_staff_id)
      and (waitlist.location_id is null or waitlist.location_id = p_location_id)
      and (waitlist.preferred_from is null or p_starts_at >= waitlist.preferred_from)
      and (waitlist.preferred_to is null or p_starts_at < waitlist.preferred_to)
      and (waitlist.preferred_time_start is null or (p_starts_at at time zone coalesce(p_timezone, 'UTC'))::time >= waitlist.preferred_time_start)
      and (waitlist.preferred_time_end is null or (p_starts_at at time zone coalesce(p_timezone, 'UTC'))::time <= waitlist.preferred_time_end)
    order by waitlist.priority desc, waitlist.created_at
    limit candidate_limit
    for update skip locked
  loop
    raw_token := encode(extensions.gen_random_bytes(32), 'hex');
    insert into public.booking_waitlist_offers(
      company_id, waitlist_id, source_booking_id, token_hash, offered_starts_at, offered_ends_at, expires_at, metadata
    )
    values (
      p_company_id,
      candidate_row.id,
      p_source_booking_id,
      encode(extensions.digest(raw_token, 'sha256'), 'hex'),
      p_starts_at,
      p_ends_at,
      now() + make_interval(mins => settings_row.offer_expiry_minutes),
      jsonb_build_object(
        'mode', settings_row.offer_mode,
        'serviceId', p_service_id,
        'locationId', p_location_id,
        'staffId', p_staff_id,
        'resourceId', p_resource_id,
        'participantCount', greatest(coalesce(p_participant_count, 1), 1),
        'timezone', coalesce(p_timezone, 'UTC')
      )
    )
    on conflict (company_id, waitlist_id, offered_starts_at) do nothing
    returning * into offer_row;
    if offer_row.id is null then continue; end if;
    insert into public.booking_waitlist_offer_delivery(company_id, offer_id, raw_token)
    values (p_company_id, offer_row.id, raw_token);
    update public.booking_waitlist
    set status = 'offered', offered_until = offer_row.expires_at
    where company_id = p_company_id and id = candidate_row.id;
    contact_value := coalesce(candidate_row.guest_email, (
      select customer.email
      from public.clients customer
      where customer.company_id = p_company_id and customer.id = candidate_row.customer_id
    ));
    insert into public.booking_notification_log(
      company_id, booking_id, event_type, channel, recipient, delivery_key, payload
    )
    values (
      p_company_id,
      p_source_booking_id,
      'waitlist.slot_available',
      case when contact_value is null then 'in_app' else 'email' end,
      contact_value,
      'waitlist-offer:' || offer_row.id::text,
      jsonb_build_object('offerId', offer_row.id, 'expiresAt', offer_row.expires_at, 'startsAt', p_starts_at, 'endsAt', p_ends_at)
    );
    contacted := contacted + 1;
  end loop;
  return contacted;
end;
$$;

create or replace function private.booking_waitlist_offer_slot(p_company_id uuid, p_booking_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking_row public.bookings;
begin
  select * into booking_row
  from public.bookings booking
  where booking.company_id = p_company_id and booking.id = p_booking_id;
  if not found or booking_row.status <> 'cancelled' then return 0; end if;
  return private.booking_waitlist_offer_freed_slot(
    booking_row.company_id,
    booking_row.id,
    booking_row.service_id,
    booking_row.location_id,
    booking_row.staff_id,
    booking_row.resource_id,
    booking_row.starts_at,
    booking_row.ends_at,
    booking_row.timezone,
    booking_row.participant_count
  );
end;
$$;

create or replace function private.booking_offer_waitlist_after_cancel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from new.status then
    perform private.booking_waitlist_offer_slot(new.company_id, new.id);
  elsif new.status <> 'cancelled'
    and old.status <> 'cancelled'
    and (old.starts_at is distinct from new.starts_at or old.ends_at is distinct from new.ends_at) then
    perform private.booking_waitlist_offer_freed_slot(
      new.company_id,
      new.id,
      old.service_id,
      old.location_id,
      old.staff_id,
      old.resource_id,
      old.starts_at,
      old.ends_at,
      old.timezone,
      old.participant_count
    );
  end if;
  return new;
end;
$$;

drop trigger if exists booking_offer_waitlist_after_cancel on public.bookings;
create trigger booking_offer_waitlist_after_cancel
after update of status, starts_at, ends_at on public.bookings
for each row execute function private.booking_offer_waitlist_after_cancel();

create or replace function public.booking_waitlist_accept_offer(p_token text, p_offer_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  offer_row public.booking_waitlist_offers;
  waitlist_row public.booking_waitlist;
  source_booking public.bookings;
  customer_row public.clients;
  settings_row public.booking_settings;
  slug_value text;
  new_booking public.bookings;
  service_id_value uuid;
  location_id_value uuid;
  resource_id_value uuid;
  staff_id_value uuid;
  participant_count_value integer;
begin
  if nullif(trim(p_token), '') is null then raise exception 'The waitlist offer is invalid' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(trim(p_token) || ':' || p_offer_id::text, 0));
  select * into offer_row
  from public.booking_waitlist_offers offer
  where offer.id = p_offer_id
    and offer.token_hash = encode(extensions.digest(trim(p_token), 'sha256'), 'hex')
  for update;
  if not found or offer_row.status <> 'offered' or offer_row.expires_at <= now() then
    raise exception 'This waitlist offer has expired' using errcode = '41000';
  end if;
  select * into waitlist_row
  from public.booking_waitlist waitlist
  where waitlist.company_id = offer_row.company_id and waitlist.id = offer_row.waitlist_id
  for update;
  select * into source_booking
  from public.bookings booking
  where booking.company_id = offer_row.company_id and booking.id = offer_row.source_booking_id
  for update;
  if not found then raise exception 'The offered booking time is no longer available' using errcode = 'P0002'; end if;
  -- A cancelled source freed its current slot. A rescheduled source is still
  -- active, but it is valid when its old time differs from the offered slot.
  if source_booking.status <> 'cancelled'
    and source_booking.starts_at = offer_row.offered_starts_at
    and source_booking.ends_at = offer_row.offered_ends_at then
    raise exception 'The offered booking time is no longer available' using errcode = '55000';
  end if;
  select settings.* into settings_row
  from public.booking_settings settings
  where settings.company_id = offer_row.company_id;
  slug_value := coalesce(source_booking.source_detail->>'pageSlug', settings_row.public_slug);
  if slug_value is null or settings_row.public_enabled is distinct from true then
    raise exception 'Public booking is not available' using errcode = '42501';
  end if;
  if waitlist_row.customer_id is not null then
    select * into customer_row
    from public.clients customer
    where customer.company_id = waitlist_row.company_id and customer.id = waitlist_row.customer_id;
  end if;
  service_id_value := coalesce(nullif(offer_row.metadata->>'serviceId', '')::uuid, source_booking.service_id);
  location_id_value := coalesce(nullif(offer_row.metadata->>'locationId', '')::uuid, source_booking.location_id);
  resource_id_value := coalesce(nullif(offer_row.metadata->>'resourceId', '')::uuid, source_booking.resource_id);
  staff_id_value := coalesce(nullif(offer_row.metadata->>'staffId', '')::uuid, source_booking.staff_id);
  participant_count_value := greatest(coalesce((offer_row.metadata->>'participantCount')::integer, waitlist_row.participant_count, 1), 1);
  select * into new_booking
  from private.booking_create_core(
    offer_row.company_id,
    waitlist_row.customer_id,
    coalesce(customer_row.name, waitlist_row.guest_name),
    coalesce(customer_row.email, waitlist_row.guest_email),
    coalesce(customer_row.phone, waitlist_row.guest_phone),
    service_id_value,
    location_id_value,
    resource_id_value,
    staff_id_value,
    offer_row.offered_starts_at,
    offer_row.offered_ends_at,
    1,
    participant_count_value,
    case when coalesce(settings_row.auto_confirm, true) then 'confirmed' else 'pending' end,
    null,
    null,
    null,
    'customer_portal',
    null,
    null,
    true,
    slug_value
  );
  update public.bookings
  set source = 'waitlist',
      source_detail = coalesce(source_detail, '{}'::jsonb) || jsonb_build_object('origin', 'waitlist', 'offerId', offer_row.id, 'pageSlug', slug_value),
      updated_at = now()
  where company_id = offer_row.company_id and id = new_booking.id;
  update public.booking_waitlist_offers
  set status = 'converted', accepted_at = now(), converted_booking_id = new_booking.id
  where id = offer_row.id;
  update public.booking_waitlist
  set status = case when (select coalesce(remove_after_booking, true) from public.booking_waitlist_settings where company_id = offer_row.company_id) then 'booked' else 'active' end,
      offered_until = null
  where company_id = offer_row.company_id and id = waitlist_row.id;
  return jsonb_build_object('available', true, 'bookingId', new_booking.id, 'bookingNumber', new_booking.booking_number, 'status', new_booking.status);
end;
$$;

revoke all on function public.booking_waitlist_accept_offer(text, uuid) from public;
grant execute on function public.booking_waitlist_accept_offer(text, uuid) to anon, authenticated;
