-- OperiX Booking growth foundation.
--
-- This migration is additive. Existing booking rows, status values, source
-- values, payment rows, and public flows remain valid. New behavior is exposed
-- through tenant-scoped commands below so Web and Mobile use the same rules.
-- No production data is touched by this file.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Compatibility columns on the existing Booking model.
-- ---------------------------------------------------------------------------

alter table public.booking_settings
  add column if not exists cancellation_policy jsonb not null default '{}'::jsonb,
  add column if not exists default_reminder_rules jsonb not null default '[]'::jsonb,
  add column if not exists public_widget_enabled boolean not null default false,
  add column if not exists public_widget_allowed_origins text[] not null default '{}',
  add column if not exists customer_portal_enabled boolean not null default true;

alter table public.booking_services
  add column if not exists deposit_policy jsonb not null default '{}'::jsonb,
  add column if not exists group_booking_mode text not null default 'private',
  add column if not exists pricing_mode text not null default 'flat',
  add column if not exists capacity_per_slot integer,
  add column if not exists custom_form_enabled boolean not null default false;

alter table public.booking_services
  add constraint booking_services_group_booking_mode_check
    check (group_booking_mode in ('private', 'shared')) not valid,
  add constraint booking_services_pricing_mode_check
    check (pricing_mode in ('flat', 'per_person')) not valid,
  add constraint booking_services_capacity_per_slot_check
    check (capacity_per_slot is null or capacity_per_slot > 0) not valid;

alter table public.booking_recurring_series
  add column if not exists rule_json jsonb,
  add column if not exists occurrence_count integer,
  add column if not exists status text not null default 'active',
  add column if not exists parent_booking_id uuid,
  add constraint booking_series_occurrence_count_check
    check (occurrence_count is null or occurrence_count between 1 and 100) not valid,
  add constraint booking_series_status_check
    check (status in ('active', 'cancelled', 'completed')) not valid;

alter table public.bookings
  add column if not exists payment_stage text not null default 'pending_deposit',
  add column if not exists cancellation_fee numeric(20,4) not null default 0,
  add column if not exists deposit_refund_amount numeric(20,4) not null default 0,
  add column if not exists policy_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists recurrence_index integer,
  add column if not exists recurrence_exception boolean not null default false,
  add column if not exists source_detail jsonb not null default '{}'::jsonb,
  add column if not exists customer_package_id uuid,
  add column if not exists package_units_reserved integer not null default 0,
  add column if not exists custom_form_answers jsonb not null default '{}'::jsonb;

alter table public.booking_waitlist
  add column if not exists location_id uuid,
  add column if not exists participant_count integer not null default 1,
  add column if not exists offered_until timestamptz,
  add column if not exists notes text,
  add constraint booking_waitlist_location_fk
    foreign key (company_id, location_id)
    references public.booking_locations(company_id, id) on delete set null not valid,
  add constraint booking_waitlist_participant_count_check
    check (participant_count > 0) not valid;

alter table public.booking_payments
  add column if not exists purpose text not null default 'balance',
  add column if not exists refunded_amount numeric(20,4) not null default 0;

alter table public.booking_reminders
  add column if not exists event_type text not null default 'booking.reminder',
  add column if not exists status text not null default 'pending',
  add column if not exists scheduled_for timestamptz,
  add column if not exists delivery_key text,
  add column if not exists attempts integer not null default 0,
  add column if not exists last_error text,
  add column if not exists sent_at timestamptz;

update public.booking_reminders
set delivery_key = coalesce(delivery_key, booking_id::text || ':' || minutes_before::text || ':' || channel),
    scheduled_for = coalesce(scheduled_for, now() + make_interval(mins => minutes_before))
where delivery_key is null or scheduled_for is null;

alter table public.booking_recurring_series
  add constraint booking_series_parent_booking_fk
    foreign key (company_id, parent_booking_id)
    references public.bookings(company_id, id) on delete set null not valid;

create index if not exists booking_bookings_payment_stage_idx
  on public.bookings (company_id, payment_stage, starts_at);
create index if not exists booking_bookings_series_idx
  on public.bookings (company_id, recurrence_series_id, recurrence_index);
create index if not exists booking_bookings_source_idx
  on public.bookings (company_id, source, starts_at);
create index if not exists booking_waitlist_location_idx
  on public.booking_waitlist (company_id, service_id, location_id, status, priority desc, created_at);
create index if not exists booking_reminders_due_idx
  on public.booking_reminders (company_id, status, scheduled_for);

-- Preserve the existing availability predicate and add the new per-slot
-- capacity constraint around it. The definition is copied inside the
-- database so every existing create/update/reschedule/public path continues
-- to use one canonical function name without duplicating its rules here.
do $$
declare
  legacy_definition text;
begin
  if not exists (
    select 1 from pg_proc
    where pronamespace = 'private'::regnamespace
      and proname = 'booking_slot_is_available_legacy'
      and pronargs = 9
  ) then
    select pg_get_functiondef(oid)
    into legacy_definition
    from pg_proc
    where pronamespace = 'private'::regnamespace
      and proname = 'booking_slot_is_available'
      and pronargs = 9
    limit 1;
    if legacy_definition is null then raise exception 'The canonical Booking availability predicate is missing'; end if;
    execute replace(legacy_definition, 'private.booking_slot_is_available(', 'private.booking_slot_is_available_legacy(');
  end if;
end;
$$;

create or replace function private.booking_slot_is_available(
  p_company_id uuid,
  p_service_id uuid,
  p_location_id uuid,
  p_resource_id uuid,
  p_staff_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_participant_count integer default 1,
  p_ignore_booking_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  service_row public.booking_services;
  slot_start timestamptz;
  slot_end timestamptz;
  current_load integer := 0;
begin
  if not private.booking_slot_is_available_legacy(p_company_id, p_service_id, p_location_id, p_resource_id, p_staff_id, p_starts_at, p_ends_at, p_participant_count, p_ignore_booking_id) then
    return false;
  end if;
  select * into service_row
  from public.booking_services service
  where service.company_id = p_company_id and service.id = p_service_id;
  if not found or service_row.capacity_per_slot is null then return true; end if;
  slot_start := p_starts_at - make_interval(mins => coalesce(service_row.buffer_before_minutes, 0));
  slot_end := p_ends_at + make_interval(mins => coalesce(service_row.buffer_after_minutes, 0));
  select coalesce(sum(coalesce(existing.participant_count, 1)), 0)::integer
  into current_load
  from public.bookings existing
  join public.booking_services existing_service on existing_service.company_id = existing.company_id and existing_service.id = existing.service_id
  where existing.company_id = p_company_id
    and existing.id is distinct from p_ignore_booking_id
    and existing.status in ('pending', 'confirmed', 'checked_in', 'in_progress', 'rescheduled')
    and (existing.starts_at - make_interval(mins => coalesce(existing_service.buffer_before_minutes, 0))) < slot_end
    and (existing.ends_at + make_interval(mins => coalesce(existing_service.buffer_after_minutes, 0))) > slot_start;
  return current_load + greatest(coalesce(p_participant_count, 1), 1) <= service_row.capacity_per_slot;
end;
$$;

revoke all on function private.booking_slot_is_available(uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, uuid) from public, anon;
grant execute on function private.booking_slot_is_available(uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Packages and membership-style customer entitlements.
-- ---------------------------------------------------------------------------

create table if not exists public.booking_packages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null default 'package' check (kind in ('package', 'membership')),
  name text not null,
  description text,
  uses integer check (uses is null or uses > 0),
  validity_days integer check (validity_days is null or validity_days > 0),
  price numeric(20,4) not null default 0 check (price >= 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  tax_rate numeric(8,4) not null default 0 check (tax_rate between 0 and 100),
  renewal_interval_days integer check (renewal_interval_days is null or renewal_interval_days > 0),
  usage_rules jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id)
);

create table if not exists public.booking_package_services (
  company_id uuid not null references public.companies(id) on delete cascade,
  package_id uuid not null,
  service_id uuid not null,
  included_uses integer check (included_uses is null or included_uses > 0),
  created_at timestamptz not null default now(),
  primary key (company_id, package_id, service_id),
  foreign key (company_id, package_id) references public.booking_packages(company_id, id) on delete cascade,
  foreign key (company_id, service_id) references public.booking_services(company_id, id) on delete cascade
);

create table if not exists public.booking_customer_packages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.clients(id) on delete cascade,
  package_id uuid not null,
  starts_on date not null default current_date,
  ends_on date,
  remaining_uses integer,
  status text not null default 'active' check (status in ('active', 'expired', 'exhausted', 'cancelled')),
  purchased_amount numeric(20,4) not null default 0 check (purchased_amount >= 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, package_id) references public.booking_packages(company_id, id) on delete restrict,
  check (ends_on is null or ends_on >= starts_on),
  check (remaining_uses is null or remaining_uses >= 0),
  unique (company_id, id)
);

create table if not exists public.booking_package_usage (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_package_id uuid not null,
  booking_id uuid not null,
  service_id uuid not null,
  units integer not null default 1 check (units > 0),
  action text not null default 'reserved' check (action in ('reserved', 'consumed', 'restored', 'voided')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (company_id, customer_package_id) references public.booking_customer_packages(company_id, id) on delete cascade,
  foreign key (company_id, booking_id) references public.bookings(company_id, id) on delete cascade,
  foreign key (company_id, service_id) references public.booking_services(company_id, id) on delete restrict,
  unique (company_id, customer_package_id, booking_id, action)
);

alter table public.bookings
  add constraint bookings_customer_package_fk
    foreign key (company_id, customer_package_id)
    references public.booking_customer_packages(company_id, id) on delete set null not valid;

create index if not exists booking_packages_company_idx on public.booking_packages(company_id, is_active, kind);
create index if not exists booking_customer_packages_lookup_idx on public.booking_customer_packages(company_id, customer_id, status, ends_on);
create index if not exists booking_package_usage_booking_idx on public.booking_package_usage(company_id, booking_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Forms, resource allocations, check-in, commissions, reminders, portals,
-- calendar abstraction, and widget configuration.
-- ---------------------------------------------------------------------------

create table if not exists public.booking_form_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  service_id uuid,
  name text not null,
  version integer not null default 1 check (version > 0),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, service_id) references public.booking_services(company_id, id) on delete cascade
);

create table if not exists public.booking_form_fields (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  template_id uuid not null,
  field_key text not null,
  label text not null,
  field_type text not null check (field_type in ('short_text', 'long_text', 'number', 'email', 'phone', 'date', 'dropdown', 'multi_select', 'checkbox', 'yes_no', 'acknowledgement')),
  options jsonb not null default '[]'::jsonb,
  is_required boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, template_id, field_key),
  foreign key (company_id, template_id) references public.booking_form_templates(company_id, id) on delete cascade
);

create table if not exists public.booking_form_responses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  booking_id uuid not null,
  field_id uuid,
  field_key text not null,
  label text not null,
  field_type text not null,
  value jsonb not null,
  created_at timestamptz not null default now(),
  foreign key (company_id, booking_id) references public.bookings(company_id, id) on delete cascade,
  foreign key (company_id, field_id) references public.booking_form_fields(company_id, id) on delete set null
);

create table if not exists public.booking_resource_allocations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  booking_id uuid not null,
  resource_id uuid not null,
  units integer not null default 1 check (units > 0),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (company_id, booking_id) references public.bookings(company_id, id) on delete cascade,
  foreign key (company_id, resource_id) references public.booking_resources(company_id, id) on delete restrict,
  unique (company_id, booking_id, resource_id)
);

create table if not exists public.booking_checkins (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  booking_id uuid not null,
  token_hash text not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  checked_in_at timestamptz,
  checked_in_by uuid references auth.users(id) on delete set null,
  device_id text,
  status text not null default 'issued' check (status in ('issued', 'consumed', 'revoked')),
  created_at timestamptz not null default now(),
  foreign key (company_id, booking_id) references public.bookings(company_id, id) on delete cascade,
  unique (company_id, booking_id),
  unique (token_hash)
);

create table if not exists public.booking_commission_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  staff_id uuid,
  service_id uuid,
  rule_type text not null check (rule_type in ('percentage', 'fixed')),
  rate numeric(20,4) not null check (rate >= 0),
  earned_on text not null default 'completed' check (earned_on in ('completed', 'paid')),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (company_id, staff_id) references public.booking_staff(company_id, id) on delete cascade,
  foreign key (company_id, service_id) references public.booking_services(company_id, id) on delete cascade
);

create table if not exists public.booking_commissions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  booking_id uuid not null,
  staff_id uuid not null,
  service_id uuid not null,
  revenue_basis numeric(20,4) not null default 0,
  commission_rate numeric(20,4) not null default 0,
  commission_type text not null check (commission_type in ('percentage', 'fixed')),
  amount numeric(20,4) not null default 0,
  status text not null default 'pending' check (status in ('pending', 'earned', 'voided')),
  earned_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (company_id, booking_id) references public.bookings(company_id, id) on delete cascade,
  foreign key (company_id, staff_id) references public.booking_staff(company_id, id) on delete restrict,
  foreign key (company_id, service_id) references public.booking_services(company_id, id) on delete restrict,
  unique (company_id, booking_id, staff_id)
);

create table if not exists public.booking_reminder_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  service_id uuid,
  event_type text not null default 'booking.reminder',
  minutes_before integer not null check (minutes_before >= 0),
  channel text not null check (channel in ('in_app', 'push', 'email', 'sms', 'whatsapp')),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (company_id, service_id) references public.booking_services(company_id, id) on delete cascade,
  unique (company_id, service_id, event_type, minutes_before, channel)
);

create table if not exists public.booking_portal_tokens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.clients(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (token_hash)
);

create table if not exists public.booking_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  provider text not null check (provider in ('google', 'apple', 'outlook')),
  external_account_id text,
  status text not null default 'disconnected' check (status in ('connected', 'disconnected', 'error')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, provider, external_account_id)
);

create table if not exists public.booking_calendar_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  booking_id uuid not null,
  connection_id uuid,
  external_event_id text,
  provider text not null check (provider in ('google', 'apple', 'outlook', 'ics')),
  sync_status text not null default 'pending' check (sync_status in ('pending', 'synced', 'error', 'deleted')),
  last_synced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, booking_id) references public.bookings(company_id, id) on delete cascade,
  foreign key (connection_id) references public.booking_calendar_connections(id) on delete cascade,
  unique (company_id, booking_id, provider, connection_id)
);

create table if not exists public.booking_widget_configs (
  company_id uuid primary key references public.companies(id) on delete cascade,
  enabled boolean not null default false,
  service_id uuid,
  location_id uuid,
  staff_id uuid,
  theme jsonb not null default '{}'::jsonb,
  language text not null default 'en',
  allowed_origins text[] not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  foreign key (company_id, service_id) references public.booking_services(company_id, id) on delete set null,
  foreign key (company_id, location_id) references public.booking_locations(company_id, id) on delete set null,
  foreign key (company_id, staff_id) references public.booking_staff(company_id, id) on delete set null
);

create index if not exists booking_form_fields_order_idx on public.booking_form_fields(company_id, template_id, sort_order);
create index if not exists booking_form_responses_booking_idx on public.booking_form_responses(company_id, booking_id, created_at);
create index if not exists booking_resource_allocations_resource_idx on public.booking_resource_allocations(company_id, resource_id, booking_id);
create index if not exists booking_checkins_booking_idx on public.booking_checkins(company_id, booking_id, status);
create index if not exists booking_commissions_report_idx on public.booking_commissions(company_id, staff_id, status, created_at);
create index if not exists booking_reminder_rules_lookup_idx on public.booking_reminder_rules(company_id, service_id, is_active, minutes_before);
create index if not exists booking_portal_tokens_lookup_idx on public.booking_portal_tokens(token_hash, expires_at) where revoked_at is null;
create index if not exists booking_calendar_events_booking_idx on public.booking_calendar_events(company_id, booking_id, sync_status);

-- ---------------------------------------------------------------------------
-- Permissions and shared policy/financial helpers.
-- ---------------------------------------------------------------------------

insert into public.app_permissions (code, name, category, description, is_sensitive)
values
  ('booking.waitlist.manage', 'Manage booking waitlist', 'booking', 'Join, offer, and resolve waiting-list entries.', false),
  ('booking.checkin', 'Check in booking customers', 'booking', 'Validate QR/manual check-ins and record arrival.', false),
  ('booking.analytics', 'View booking analytics', 'booking', 'View aggregated booking performance metrics.', false),
  ('booking.package.manage', 'Manage booking packages', 'booking', 'Configure packages and memberships.', true),
  ('booking.commission.manage', 'Manage booking commissions', 'booking', 'Configure and view staff commission records.', true),
  ('booking.forms.manage', 'Manage booking forms', 'booking', 'Configure custom booking questions.', true),
  ('booking.portal.manage', 'Manage customer portal', 'booking', 'Issue and revoke customer portal access.', true),
  ('booking.integration.manage', 'Manage booking integrations', 'booking', 'Manage calendar and widget integrations.', true),
  ('booking.policy.override', 'Override booking penalties', 'booking', 'Override cancellation and no-show penalties.', true)
on conflict (code) do update set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  is_sensitive = excluded.is_sensitive;

with grants(role_code, permission_code) as (
  values
    ('booking_admin', 'booking.waitlist.manage'), ('booking_admin', 'booking.checkin'),
    ('booking_admin', 'booking.analytics'), ('booking_admin', 'booking.package.manage'),
    ('booking_admin', 'booking.commission.manage'), ('booking_admin', 'booking.forms.manage'),
    ('booking_admin', 'booking.portal.manage'), ('booking_admin', 'booking.integration.manage'),
    ('booking_admin', 'booking.policy.override'),
    ('booking_manager', 'booking.waitlist.manage'), ('booking_manager', 'booking.checkin'),
    ('booking_manager', 'booking.analytics'), ('booking_manager', 'booking.forms.manage'),
    ('booking_manager', 'booking.portal.manage'),
    ('booking_staff', 'booking.checkin'),
    ('booking_finance', 'booking.analytics'), ('booking_finance', 'booking.commission.manage')
)
insert into public.app_role_permissions (role_id, permission_code)
select role.id, grants.permission_code
from grants
join public.app_roles role on role.code = grants.role_code and role.company_id is null
on conflict do nothing;

create or replace function private.booking_resolve_policy(p_company_id uuid, p_service_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  setting_policy jsonb := '{}'::jsonb;
  service_policy jsonb := '{}'::jsonb;
  merged jsonb;
begin
  select coalesce(settings.cancellation_policy, '{}'::jsonb)
  into setting_policy
  from public.booking_settings settings
  where settings.company_id = p_company_id;

  select coalesce(service.cancellation_policy, '{}'::jsonb)
  into service_policy
  from public.booking_services service
  where service.company_id = p_company_id and service.id = p_service_id;

  merged := setting_policy || service_policy;
  return jsonb_build_object(
    'freeCancellationMinutes', coalesce((merged->>'freeCancellationMinutes')::integer, (merged->>'free_cancellation_minutes')::integer, (select cancellation_cutoff_minutes from public.booking_settings where company_id = p_company_id), 120),
    'lateCancellationFeeType', coalesce(merged->>'lateCancellationFeeType', merged->>'late_cancellation_fee_type', 'none'),
    'lateCancellationFeeValue', coalesce((merged->>'lateCancellationFeeValue')::numeric, (merged->>'late_cancellation_fee_value')::numeric, 0),
    'noShowFeeType', coalesce(merged->>'noShowFeeType', merged->>'no_show_fee_type', 'none'),
    'noShowFeeValue', coalesce((merged->>'noShowFeeValue')::numeric, (merged->>'no_show_fee_value')::numeric, 0),
    'depositsRefundable', coalesce((merged->>'depositsRefundable')::boolean, (merged->>'deposits_refundable')::boolean, false),
    'packageUseOnNoShow', coalesce((merged->>'packageUseOnNoShow')::boolean, (merged->>'package_use_on_no_show')::boolean, true),
    'managerOverrideAllowed', coalesce((merged->>'managerOverrideAllowed')::boolean, (merged->>'manager_override_allowed')::boolean, false)
  );
end;
$$;

revoke all on function private.booking_resolve_policy(uuid, uuid) from public;
grant execute on function private.booking_resolve_policy(uuid, uuid) to authenticated, service_role;

create or replace function private.booking_growth_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  service_deposit_policy jsonb := '{}'::jsonb;
  deposit_mode text;
  deposit_value numeric(20,4) := 0;
begin
  if new.policy_snapshot is null or new.policy_snapshot = '{}'::jsonb then
    new.policy_snapshot := private.booking_resolve_policy(new.company_id, new.service_id);
  end if;
  select coalesce(service.deposit_policy, '{}'::jsonb)
  into service_deposit_policy
  from public.booking_services service
  where service.company_id = new.company_id and service.id = new.service_id;
  deposit_mode := lower(coalesce(service_deposit_policy->>'mode', ''));
  if deposit_mode in ('full', 'fixed', 'percentage') then
    deposit_value := greatest(0, coalesce((service_deposit_policy->>'value')::numeric, 0));
    new.deposit_amount := case deposit_mode
      when 'full' then greatest(0, new.total_amount)
      when 'percentage' then least(greatest(0, new.total_amount), round(greatest(0, new.total_amount) * least(100, deposit_value) / 100, 2))
      else least(greatest(0, new.total_amount), round(deposit_value, 2))
    end;
  end if;
  if new.total_amount <= 0 then
    new.payment_stage := 'not_required';
  elsif new.paid_amount >= new.total_amount then
    new.payment_stage := case when new.payment_status = 'refunded' then 'refunded' when new.payment_status = 'partially_refunded' then 'partially_refunded' else 'paid' end;
  elsif new.deposit_amount > 0 and new.paid_amount = 0 then
    new.payment_stage := 'pending_deposit';
  elsif new.deposit_amount > 0 and new.paid_amount < new.deposit_amount then
    new.payment_stage := 'deposit_partially_paid';
  elsif new.deposit_amount > 0 and new.paid_amount >= new.deposit_amount then
    new.payment_stage := 'deposit_paid';
  else
    new.payment_stage := case when new.paid_amount > 0 then 'partially_paid' else 'pending_deposit' end;
  end if;
  return new;
end;
$$;

drop trigger if exists booking_growth_fields on public.bookings;
create trigger booking_growth_fields
before insert or update of total_amount, deposit_amount, paid_amount, payment_status, policy_snapshot, service_id
on public.bookings
for each row execute function private.booking_growth_fields();

create or replace function private.booking_audit_event(
  p_company_id uuid,
  p_booking_id uuid,
  p_action text,
  p_details jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.booking_audit_log(company_id, booking_id, actor_user_id, action, entity, entity_id, details)
  values (p_company_id, p_booking_id, (select auth.uid()), p_action, 'booking', p_booking_id, coalesce(p_details, '{}'::jsonb));
$$;

revoke all on function private.booking_audit_event(uuid, uuid, text, jsonb) from public;
grant execute on function private.booking_audit_event(uuid, uuid, text, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Package reservation and restoration helpers.
-- ---------------------------------------------------------------------------

create or replace function private.booking_reserve_package(
  p_company_id uuid,
  p_booking_id uuid,
  p_customer_package_id uuid,
  p_customer_id uuid,
  p_service_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  entitlement public.booking_customer_packages;
  package_service_exists boolean;
begin
  select * into entitlement
  from public.booking_customer_packages
  where company_id = p_company_id and id = p_customer_package_id
  for update;
  if not found or entitlement.customer_id is distinct from p_customer_id or entitlement.status <> 'active' then
    raise exception 'The selected package is not available for this customer' using errcode = '42501';
  end if;
  if entitlement.ends_on is not null and entitlement.ends_on < current_date then
    update public.booking_customer_packages set status = 'expired', updated_at = now() where id = entitlement.id;
    raise exception 'The selected package has expired' using errcode = '22023';
  end if;
  select exists (
    select 1 from public.booking_package_services mapping
    where mapping.company_id = p_company_id
      and mapping.package_id = entitlement.package_id
      and mapping.service_id = p_service_id
  ) into package_service_exists;
  if not package_service_exists then raise exception 'This package does not include the selected service' using errcode = '22023'; end if;
  if entitlement.remaining_uses is not null and entitlement.remaining_uses < 1 then
    update public.booking_customer_packages set status = 'exhausted', updated_at = now() where id = entitlement.id;
    raise exception 'No package sessions remain' using errcode = '22023';
  end if;
  if entitlement.remaining_uses is not null then
    update public.booking_customer_packages
    set remaining_uses = remaining_uses - 1,
        status = case when remaining_uses = 1 then 'exhausted' else 'active' end,
        updated_at = now()
    where id = entitlement.id;
  end if;
  insert into public.booking_package_usage(company_id, customer_package_id, booking_id, service_id, units, action, created_by)
  values (p_company_id, entitlement.id, p_booking_id, p_service_id, 1, 'reserved', (select auth.uid()))
  on conflict (company_id, customer_package_id, booking_id, action) do nothing;
end;
$$;

create or replace function private.booking_restore_package(
  p_company_id uuid,
  p_booking_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  usage_row public.booking_package_usage;
begin
  select package_usage_row.* into usage_row
  from public.booking_package_usage package_usage_row
  where package_usage_row.company_id = p_company_id and package_usage_row.booking_id = p_booking_id and package_usage_row.action = 'reserved'
  order by package_usage_row.created_at desc
  limit 1
  for update;
  if not found then return; end if;
  if exists (select 1 from public.booking_package_usage restored where restored.company_id = p_company_id and restored.booking_id = p_booking_id and restored.action = 'restored') then return; end if;
  update public.booking_customer_packages
  set remaining_uses = case when remaining_uses is null then null else remaining_uses + usage_row.units end,
      status = case when remaining_uses is null or remaining_uses + usage_row.units > 0 then 'active' else status end,
      updated_at = now()
  where company_id = p_company_id and id = usage_row.customer_package_id;
  insert into public.booking_package_usage(company_id, customer_package_id, booking_id, service_id, units, action, created_by)
  values (p_company_id, usage_row.customer_package_id, p_booking_id, usage_row.service_id, usage_row.units, 'restored', (select auth.uid()));
end;
$$;

revoke all on function private.booking_reserve_package(uuid, uuid, uuid, uuid, uuid) from public;
revoke all on function private.booking_restore_package(uuid, uuid) from public;
grant execute on function private.booking_reserve_package(uuid, uuid, uuid, uuid, uuid) to authenticated, service_role;
grant execute on function private.booking_restore_package(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Booking creation details and recurring series commands.
-- ---------------------------------------------------------------------------

create or replace function public.booking_create_with_details(
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
  p_customer_package_id uuid default null,
  p_custom_form_answers jsonb default null
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
  select * into booking_row
  from private.booking_create_core(
    p_company_id, p_customer_id, p_guest_name, p_guest_email, p_guest_phone,
    p_service_id, p_location_id, p_resource_id, p_staff_id, p_starts_at, p_ends_at,
    p_quantity, p_participant_count, p_requested_status, p_notes, p_internal_notes,
    p_customer_notes, p_source, null, null, false, null
  );
  update public.bookings
  set source_detail = coalesce(p_source_detail, '{}'::jsonb),
      custom_form_answers = coalesce(p_custom_form_answers, '{}'::jsonb),
      customer_package_id = p_customer_package_id,
      package_units_reserved = case when p_customer_package_id is null then 0 else 1 end,
      updated_at = now()
  where company_id = p_company_id and id = booking_row.id
  returning * into booking_row;
  if p_customer_package_id is not null then
    perform private.booking_reserve_package(p_company_id, booking_row.id, p_customer_package_id, p_customer_id, p_service_id);
  end if;
  perform private.booking_audit_event(p_company_id, booking_row.id, 'booking.details_saved', jsonb_build_object('source_detail', coalesce(p_source_detail, '{}'::jsonb), 'has_form_answers', p_custom_form_answers is not null, 'package_id', p_customer_package_id));
  return booking_row;
end;
$$;

revoke all on function public.booking_create_with_details(uuid, uuid, text, text, text, uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, integer, text, text, text, text, text, jsonb, uuid, jsonb) from public, anon;
grant execute on function public.booking_create_with_details(uuid, uuid, text, text, text, uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, integer, text, text, text, text, text, jsonb, uuid, jsonb) to authenticated;

create or replace function public.booking_create_series(
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
  p_rule jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  series_id uuid;
  booking_row public.bookings;
  first_booking_id uuid;
  booking_ids uuid[] := '{}'::uuid[];
  frequency text := lower(coalesce(p_rule->>'frequency', 'weekly'));
  recurrence_interval integer := greatest(1, coalesce((p_rule->>'interval')::integer, 1));
  occurrence_limit integer := least(100, greatest(1, coalesce((p_rule->>'occurrenceCount')::integer, 100)));
  ends_on_value date := nullif(p_rule->>'endsOn', '')::date;
  occurrence_index integer := 0;
  day_offset integer := 0;
  candidate_start timestamptz;
  candidate_end timestamptz;
  duration_interval interval;
  candidate_date date;
  candidate_weekday integer;
  weekday_matches boolean;
  target_week integer;
begin
  if actor_id is null or not public.can_access_company(p_company_id) or not private.has_company_permission(p_company_id, 'booking.create') then
    raise exception 'You do not have permission to create recurring bookings' using errcode = '42501';
  end if;
  if frequency not in ('daily', 'weekly', 'monthly', 'custom') then raise exception 'Unsupported recurrence frequency' using errcode = '22023'; end if;
  if p_rule->>'occurrenceCount' is null and ends_on_value is null then raise exception 'A recurrence end date or occurrence count is required' using errcode = '22023'; end if;
  if p_starts_at is null then raise exception 'A recurring booking start is required' using errcode = '22023'; end if;
  duration_interval := coalesce(p_ends_at - p_starts_at, make_interval(mins => (select duration_minutes from public.booking_services where company_id = p_company_id and id = p_service_id)));
  if duration_interval <= interval '0 minutes' then raise exception 'Booking duration must be positive' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':availability', 0));
  insert into public.booking_recurring_series(company_id, recurrence_rule, rule_json, starts_on, ends_on, occurrence_count, timezone, created_by)
  values (p_company_id, p_rule::text, p_rule, (p_starts_at at time zone coalesce(p_rule->>'timezone', 'UTC'))::date, ends_on_value, nullif(p_rule->>'occurrenceCount', '')::integer, coalesce(p_rule->>'timezone', 'UTC'), actor_id)
  returning id into series_id;

  if frequency in ('daily', 'monthly') then
    while occurrence_index < occurrence_limit loop
      candidate_start := case
        when frequency = 'daily' then p_starts_at + make_interval(days => occurrence_index * recurrence_interval)
        else p_starts_at + make_interval(months => occurrence_index * recurrence_interval)
      end;
      if ends_on_value is not null and (candidate_start at time zone coalesce(p_rule->>'timezone', 'UTC'))::date > ends_on_value then exit; end if;
      candidate_end := candidate_start + duration_interval;
      select * into booking_row from private.booking_create_core(
        p_company_id, p_customer_id, p_guest_name, p_guest_email, p_guest_phone,
        p_service_id, p_location_id, p_resource_id, p_staff_id, candidate_start, candidate_end,
        p_quantity, p_participant_count, p_requested_status, p_notes, p_internal_notes,
        p_customer_notes, p_source, p_rule::text, series_id, false, null
      );
      update public.bookings set recurrence_index = occurrence_index, source_detail = coalesce(p_source_detail, '{}'::jsonb) where company_id = p_company_id and id = booking_row.id returning * into booking_row;
      booking_ids := array_append(booking_ids, booking_row.id);
      if first_booking_id is null then first_booking_id := booking_row.id; end if;
      occurrence_index := occurrence_index + 1;
    end loop;
  else
    while occurrence_index < occurrence_limit and day_offset < 750 loop
      candidate_date := (p_starts_at at time zone coalesce(p_rule->>'timezone', 'UTC'))::date + day_offset;
      if ends_on_value is not null and candidate_date > ends_on_value then exit; end if;
      candidate_weekday := extract(dow from candidate_date)::integer;
      weekday_matches := exists (
        select 1
        from jsonb_array_elements_text(coalesce(p_rule->'weekdays', jsonb_build_array(extract(dow from (p_starts_at at time zone coalesce(p_rule->>'timezone', 'UTC')))::integer))) weekday
        where weekday::integer = candidate_weekday
      );
      target_week := floor(day_offset / 7.0)::integer;
      if weekday_matches and mod(target_week, recurrence_interval) = 0 then
        candidate_start := p_starts_at + make_interval(days => day_offset);
        if candidate_start >= p_starts_at then
          candidate_end := candidate_start + duration_interval;
          select * into booking_row from private.booking_create_core(
            p_company_id, p_customer_id, p_guest_name, p_guest_email, p_guest_phone,
            p_service_id, p_location_id, p_resource_id, p_staff_id, candidate_start, candidate_end,
            p_quantity, p_participant_count, p_requested_status, p_notes, p_internal_notes,
            p_customer_notes, p_source, p_rule::text, series_id, false, null
          );
          update public.bookings set recurrence_index = occurrence_index, source_detail = coalesce(p_source_detail, '{}'::jsonb) where company_id = p_company_id and id = booking_row.id returning * into booking_row;
          booking_ids := array_append(booking_ids, booking_row.id);
          if first_booking_id is null then first_booking_id := booking_row.id; end if;
          occurrence_index := occurrence_index + 1;
        end if;
      end if;
      day_offset := day_offset + 1;
    end loop;
  end if;
  if occurrence_index = 0 then raise exception 'The recurrence rule does not produce any occurrence' using errcode = '22023'; end if;
  update public.booking_recurring_series set parent_booking_id = first_booking_id where company_id = p_company_id and id = series_id;
  return jsonb_build_object('seriesId', series_id, 'bookingIds', to_jsonb(booking_ids), 'firstBookingId', first_booking_id);
end;
$$;

revoke all on function public.booking_create_series(uuid, uuid, text, text, text, uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, integer, text, text, text, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.booking_create_series(uuid, uuid, text, text, text, uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, integer, text, text, text, text, text, jsonb, jsonb) to authenticated;

create or replace function public.booking_update_series(
  p_company_id uuid,
  p_booking_id uuid,
  p_scope text,
  p_starts_at timestamptz,
  p_ends_at timestamptz default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  source_booking public.bookings;
  target_booking public.bookings;
  target_ids uuid[] := '{}'::uuid[];
  candidate_start timestamptz;
  candidate_end timestamptz;
  offset_interval interval;
  old_status text;
begin
  if actor_id is null or not public.can_access_company(p_company_id) or not private.has_company_permission(p_company_id, 'booking.update') then raise exception 'You do not have permission to edit bookings' using errcode = '42501'; end if;
  if p_scope not in ('occurrence', 'future', 'series') then raise exception 'Invalid series edit scope' using errcode = '22023'; end if;
  select * into source_booking from public.bookings where company_id = p_company_id and id = p_booking_id for update;
  if not found then raise exception 'Booking not found' using errcode = 'P0002'; end if;
  if source_booking.recurrence_series_id is null then raise exception 'This booking is not part of a recurring series' using errcode = '22023'; end if;
  if p_starts_at is null then raise exception 'A new start time is required' using errcode = '22023'; end if;
  offset_interval := p_starts_at - source_booking.starts_at;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':availability', 0));
  for target_booking in
    select * from public.bookings booking
    where booking.company_id = p_company_id
      and booking.recurrence_series_id = source_booking.recurrence_series_id
      and (p_scope = 'series' or (p_scope = 'future' and booking.starts_at >= source_booking.starts_at) or (p_scope = 'occurrence' and booking.id = source_booking.id))
      and booking.status not in ('cancelled', 'completed', 'no_show')
    order by booking.starts_at
    for update
  loop
    candidate_start := target_booking.starts_at + offset_interval;
    candidate_end := candidate_start + (target_booking.ends_at - target_booking.starts_at);
    if not private.booking_slot_is_available(p_company_id, target_booking.service_id, target_booking.location_id, target_booking.resource_id, target_booking.staff_id, candidate_start, candidate_end, target_booking.participant_count, target_booking.id) then
      raise exception 'The series edit conflicts with another reservation' using errcode = '23P01';
    end if;
    old_status := target_booking.status;
    update public.bookings
    set starts_at = candidate_start,
        ends_at = candidate_end,
        status = case when old_status = 'confirmed' then 'rescheduled' else old_status end,
        recurrence_exception = case when p_scope = 'occurrence' then true else recurrence_exception end,
        updated_at = now()
    where company_id = p_company_id and id = target_booking.id
    returning * into target_booking;
    insert into public.booking_status_history(company_id, booking_id, from_status, to_status, reason, actor_user_id)
    values (p_company_id, target_booking.id, old_status, target_booking.status, p_reason, actor_id);
    perform private.booking_audit_event(p_company_id, target_booking.id, 'booking.series_updated', jsonb_build_object('scope', p_scope, 'reason', p_reason, 'old_starts_at', target_booking.starts_at - offset_interval, 'new_starts_at', target_booking.starts_at));
    target_ids := array_append(target_ids, target_booking.id);
  end loop;
  return jsonb_build_object('updatedBookingIds', to_jsonb(target_ids));
end;
$$;

revoke all on function public.booking_update_series(uuid, uuid, text, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.booking_update_series(uuid, uuid, text, timestamptz, timestamptz, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Cancellation/no-show policies, immutable snapshots, and lifecycle command.
-- ---------------------------------------------------------------------------

create or replace function private.booking_policy_fee(p_policy jsonb, p_kind text, p_total numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select least(
    greatest(coalesce(p_total, 0), 0),
    greatest(
      case when coalesce(p_kind, 'late') = 'no_show' then
        case coalesce(p_policy->>'noShowFeeType', 'none')
          when 'percentage' then round(greatest(coalesce(p_total, 0), 0) * least(100, greatest(coalesce((p_policy->>'noShowFeeValue')::numeric, 0), 0)) / 100, 2)
          when 'fixed' then coalesce((p_policy->>'noShowFeeValue')::numeric, 0)
          else 0
        end
      else
        case coalesce(p_policy->>'lateCancellationFeeType', 'none')
          when 'percentage' then round(greatest(coalesce(p_total, 0), 0) * least(100, greatest(coalesce((p_policy->>'lateCancellationFeeValue')::numeric, 0), 0)) / 100, 2)
          when 'fixed' then coalesce((p_policy->>'lateCancellationFeeValue')::numeric, 0)
          else 0
        end
      end,
      0
    )
  );
$$;

revoke all on function private.booking_policy_fee(jsonb, text, numeric) from public;
grant execute on function private.booking_policy_fee(jsonb, text, numeric) to authenticated, service_role;

create or replace function public.booking_cancellation_quote(
  p_company_id uuid,
  p_booking_id uuid,
  p_no_show boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  booking_row public.bookings;
  policy jsonb;
  free_minutes integer;
  free_window boolean;
  fee numeric(20,4);
  refund numeric(20,4);
begin
  if actor_id is null or not public.can_access_company(p_company_id) or not private.has_company_permission(p_company_id, 'booking.read') then raise exception 'You do not have access to this booking' using errcode = '42501'; end if;
  select * into booking_row from public.bookings where company_id = p_company_id and id = p_booking_id;
  if not found or not private.booking_user_can_access_booking(p_company_id, p_booking_id) then raise exception 'Booking not found' using errcode = 'P0002'; end if;
  policy := case when booking_row.policy_snapshot = '{}'::jsonb then private.booking_resolve_policy(p_company_id, booking_row.service_id) else booking_row.policy_snapshot end;
  free_minutes := greatest(0, coalesce((policy->>'freeCancellationMinutes')::integer, 120));
  free_window := now() <= booking_row.starts_at - make_interval(mins => free_minutes);
  fee := case when p_no_show or not free_window then private.booking_policy_fee(policy, case when p_no_show then 'no_show' else 'late' end, booking_row.total_amount) else 0 end;
  refund := case when not p_no_show and free_window and coalesce((policy->>'depositsRefundable')::boolean, false) then greatest(0, least(booking_row.deposit_amount, booking_row.paid_amount) - fee) else 0 end;
  return jsonb_build_object(
    'allowed', case when p_no_show then now() <= booking_row.ends_at + interval '24 hours' else booking_row.status not in ('cancelled', 'completed', 'no_show') end,
    'isWithinFreeWindow', free_window,
    'fee', round(least(booking_row.total_amount, greatest(fee, 0)), 2),
    'depositRefund', round(least(booking_row.paid_amount, greatest(refund, 0)), 2),
    'policy', policy,
    'reason', case when p_no_show then 'no_show_policy' when free_window then 'free_cancellation' else 'late_cancellation_policy' end
  );
end;
$$;

revoke all on function public.booking_cancellation_quote(uuid, uuid, boolean) from public, anon;
grant execute on function public.booking_cancellation_quote(uuid, uuid, boolean) to authenticated;

create or replace function private.booking_can_transition(p_from text, p_to text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_from
    when 'draft' then p_to in ('pending', 'confirmed', 'cancelled')
    when 'pending' then p_to in ('confirmed', 'cancelled', 'rescheduled')
    when 'confirmed' then p_to in ('checked_in', 'in_progress', 'completed', 'cancelled', 'no_show', 'rescheduled')
    when 'checked_in' then p_to in ('in_progress', 'completed', 'cancelled', 'no_show')
    when 'in_progress' then p_to in ('completed', 'cancelled', 'no_show')
    when 'rescheduled' then p_to in ('pending', 'confirmed', 'cancelled')
    else false
  end;
$$;

create or replace function public.booking_transition(
  p_company_id uuid,
  p_booking_id uuid,
  p_next_status text,
  p_reason text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  booking_row public.bookings;
  next_status text := lower(trim(p_next_status));
  old_status text;
  policy jsonb;
  is_override boolean := lower(coalesce(p_reason, '')) like 'manager_override:%';
  free_window boolean;
  fee numeric(20,4) := 0;
  deposit_refund numeric(20,4) := 0;
  should_restore_package boolean := false;
begin
  if actor_id is null or p_company_id is null or not public.can_access_company(p_company_id) then raise exception 'Authentication and organization access are required' using errcode = '42501'; end if;
  select * into booking_row from public.bookings where company_id = p_company_id and id = p_booking_id for update;
  if not found then raise exception 'Booking not found' using errcode = 'P0002'; end if;
  if not private.booking_user_can_access_staff(p_company_id, booking_row.staff_id) then raise exception 'You do not have permission to manage this booking' using errcode = '42501'; end if;
  if next_status = 'checked_in' then
    if not coalesce(private.has_company_permission(p_company_id, 'booking.checkin'), false) and not coalesce(private.has_company_permission(p_company_id, 'booking.update'), false) then raise exception 'You do not have permission to check in this booking' using errcode = '42501'; end if;
  elsif next_status in ('cancelled', 'no_show') then
    if next_status = 'cancelled' and not coalesce(private.has_company_permission(p_company_id, 'booking.cancel'), false) then raise exception 'You do not have permission to cancel this booking' using errcode = '42501'; end if;
    if next_status = 'no_show' and not coalesce(private.has_company_permission(p_company_id, 'booking.update'), false) then raise exception 'You do not have permission to mark this booking as no-show' using errcode = '42501'; end if;
  elsif not coalesce(private.has_company_permission(p_company_id, 'booking.update'), false) then
    raise exception 'You do not have permission to update this booking' using errcode = '42501';
  end if;
  if is_override and not coalesce(private.has_company_permission(p_company_id, 'booking.policy.override'), false) then raise exception 'You do not have permission to override booking penalties' using errcode = '42501'; end if;
  if not private.booking_can_transition(booking_row.status, next_status) then raise exception 'This booking cannot move from % to %', booking_row.status, next_status using errcode = '55000'; end if;

  old_status := booking_row.status;
  policy := case when booking_row.policy_snapshot = '{}'::jsonb then private.booking_resolve_policy(p_company_id, booking_row.service_id) else booking_row.policy_snapshot end;
  free_window := now() <= booking_row.starts_at - make_interval(mins => greatest(0, coalesce((policy->>'freeCancellationMinutes')::integer, 120)));
  if next_status in ('cancelled', 'no_show') and not is_override then
    if next_status = 'no_show' or not free_window then fee := private.booking_policy_fee(policy, case when next_status = 'no_show' then 'no_show' else 'late' end, booking_row.total_amount); end if;
    if next_status = 'cancelled' and free_window and coalesce((policy->>'depositsRefundable')::boolean, false) then deposit_refund := greatest(0, least(booking_row.deposit_amount, booking_row.paid_amount) - fee); end if;
    should_restore_package := next_status = 'cancelled' and free_window;
    should_restore_package := should_restore_package or (next_status = 'no_show' and not coalesce((policy->>'packageUseOnNoShow')::boolean, true));
  elsif next_status in ('cancelled', 'no_show') then
    deposit_refund := least(booking_row.deposit_amount, booking_row.paid_amount);
    should_restore_package := true;
  end if;

  update public.bookings
  set status = next_status,
      cancellation_fee = round(greatest(0, fee), 2),
      deposit_refund_amount = round(greatest(0, deposit_refund), 2),
      policy_snapshot = policy,
      updated_at = now()
  where company_id = p_company_id and id = p_booking_id
  returning * into booking_row;
  insert into public.booking_status_history(company_id, booking_id, from_status, to_status, reason, actor_user_id)
  values (p_company_id, booking_row.id, old_status, next_status, p_reason, actor_id);
  insert into public.booking_audit_log(company_id, booking_id, actor_user_id, action, entity, entity_id, details, before_data, after_data)
  values (p_company_id, booking_row.id, actor_id, 'booking.status_changed', 'booking', booking_row.id, jsonb_build_object('reason', p_reason, 'status', next_status, 'cancellation_fee', fee, 'deposit_refund_amount', deposit_refund, 'policy_snapshot', policy), jsonb_build_object('status', old_status), to_jsonb(booking_row));
  if should_restore_package and booking_row.customer_package_id is not null then perform private.booking_restore_package(p_company_id, booking_row.id); end if;
  if next_status = 'completed' then perform private.booking_earn_commission(p_company_id, booking_row.id); end if;
  return booking_row;
end;
$$;

revoke all on function public.booking_transition(uuid, uuid, text, text) from public, anon;
grant execute on function public.booking_transition(uuid, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Waiting list and series cancellation commands.
-- ---------------------------------------------------------------------------

create or replace function public.booking_waitlist_join(
  p_company_id uuid,
  p_customer_id uuid default null,
  p_guest_name text default null,
  p_guest_email text default null,
  p_service_id uuid default null,
  p_location_id uuid default null,
  p_staff_id uuid default null,
  p_preferred_from timestamptz default null,
  p_preferred_to timestamptz default null,
  p_preferred_time_start time default null,
  p_preferred_time_end time default null,
  p_participant_count integer default 1,
  p_priority integer default 0
)
returns public.booking_waitlist
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  waitlist_row public.booking_waitlist;
begin
  if actor_id is null or not public.can_access_company(p_company_id) or not (coalesce(private.has_company_permission(p_company_id, 'booking.create'), false) or coalesce(private.has_company_permission(p_company_id, 'booking.waitlist.manage'), false)) then raise exception 'You do not have permission to join the waiting list' using errcode = '42501'; end if;
  if p_customer_id is null and nullif(trim(coalesce(p_guest_name, '')), '') is null then raise exception 'A customer or guest name is required' using errcode = '22023'; end if;
  if not exists (select 1 from public.booking_services service where service.company_id = p_company_id and service.id = p_service_id and service.is_active) then raise exception 'The selected service is not available' using errcode = 'P0002'; end if;
  if p_customer_id is not null and not exists (select 1 from public.clients customer where customer.company_id = p_company_id and customer.id = p_customer_id) then raise exception 'The selected customer does not belong to this organization' using errcode = '42501'; end if;
  insert into public.booking_waitlist(company_id, customer_id, guest_name, guest_email, service_id, location_id, staff_id, preferred_from, preferred_to, preferred_time_start, preferred_time_end, participant_count, priority, status)
  values (p_company_id, p_customer_id, nullif(trim(p_guest_name), ''), nullif(trim(p_guest_email), ''), p_service_id, p_location_id, p_staff_id, p_preferred_from, p_preferred_to, p_preferred_time_start, p_preferred_time_end, greatest(1, coalesce(p_participant_count, 1)), coalesce(p_priority, 0), 'active')
  returning * into waitlist_row;
  perform private.booking_audit_event(p_company_id, null, 'waitlist.joined', jsonb_build_object('waitlist_id', waitlist_row.id, 'service_id', p_service_id));
  return waitlist_row;
end;
$$;

revoke all on function public.booking_waitlist_join(uuid, uuid, text, text, uuid, uuid, uuid, timestamptz, timestamptz, time, time, integer, integer) from public, anon;
grant execute on function public.booking_waitlist_join(uuid, uuid, text, text, uuid, uuid, uuid, timestamptz, timestamptz, time, time, integer, integer) to authenticated;

create or replace function public.booking_waitlist_candidates(p_company_id uuid, p_booking_id uuid)
returns setof public.booking_waitlist
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking_row public.bookings;
begin
  if not public.can_access_company(p_company_id) or not private.has_company_permission(p_company_id, 'booking.read') then raise exception 'You do not have access to this waiting list' using errcode = '42501'; end if;
  select * into booking_row from public.bookings where company_id = p_company_id and id = p_booking_id;
  if not found then raise exception 'Booking not found' using errcode = 'P0002'; end if;
  return query
  select waitlist.*
  from public.booking_waitlist waitlist
  where waitlist.company_id = p_company_id
    and waitlist.service_id = booking_row.service_id
    and waitlist.status = 'active'
    and (waitlist.staff_id is null or waitlist.staff_id = booking_row.staff_id)
    and (waitlist.location_id is null or waitlist.location_id = booking_row.location_id)
    and (waitlist.preferred_from is null or booking_row.starts_at >= waitlist.preferred_from)
    and (waitlist.preferred_to is null or booking_row.starts_at < waitlist.preferred_to)
    and (waitlist.preferred_time_start is null or (booking_row.starts_at at time zone booking_row.timezone)::time >= waitlist.preferred_time_start)
    and (waitlist.preferred_time_end is null or (booking_row.starts_at at time zone booking_row.timezone)::time <= waitlist.preferred_time_end)
    and coalesce(waitlist.participant_count, 1) <= booking_row.participant_count
  order by waitlist.priority desc, waitlist.created_at asc;
end;
$$;

revoke all on function public.booking_waitlist_candidates(uuid, uuid) from public, anon;
grant execute on function public.booking_waitlist_candidates(uuid, uuid) to authenticated;

create or replace function public.booking_waitlist_set_status(
  p_company_id uuid,
  p_entry_id uuid,
  p_status text
)
returns public.booking_waitlist
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  result_row public.booking_waitlist;
begin
  if actor_id is null or not public.can_access_company(p_company_id) or not private.has_company_permission(p_company_id, 'booking.waitlist.manage') then raise exception 'You do not have permission to manage the waiting list' using errcode = '42501'; end if;
  if p_status not in ('active', 'offered', 'booked', 'cancelled', 'expired') then raise exception 'Invalid waiting-list status' using errcode = '22023'; end if;
  update public.booking_waitlist
  set status = p_status,
      offered_until = case when p_status = 'offered' then now() + interval '24 hours' else null end
  where company_id = p_company_id and id = p_entry_id
  returning * into result_row;
  if not found then raise exception 'Waiting-list entry not found' using errcode = 'P0002'; end if;
  perform private.booking_audit_event(p_company_id, null, 'waitlist.status_changed', jsonb_build_object('waitlist_id', p_entry_id, 'status', p_status));
  return result_row;
end;
$$;

revoke all on function public.booking_waitlist_set_status(uuid, uuid, text) from public, anon;
grant execute on function public.booking_waitlist_set_status(uuid, uuid, text) to authenticated;

create or replace function public.booking_cancel_series(
  p_company_id uuid,
  p_booking_id uuid,
  p_scope text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  source_booking public.bookings;
  target_booking public.bookings;
  updated_booking public.bookings;
  cancelled_ids uuid[] := '{}'::uuid[];
begin
  if actor_id is null or not public.can_access_company(p_company_id) or not private.has_company_permission(p_company_id, 'booking.cancel') then raise exception 'You do not have permission to cancel bookings' using errcode = '42501'; end if;
  if p_scope not in ('occurrence', 'future', 'series') then raise exception 'Invalid series cancellation scope' using errcode = '22023'; end if;
  select * into source_booking from public.bookings where company_id = p_company_id and id = p_booking_id;
  if not found or source_booking.recurrence_series_id is null then raise exception 'This booking is not part of a recurring series' using errcode = '22023'; end if;
  for target_booking in
    select * from public.bookings booking
    where booking.company_id = p_company_id
      and booking.recurrence_series_id = source_booking.recurrence_series_id
      and (p_scope = 'series' or (p_scope = 'future' and booking.starts_at >= source_booking.starts_at) or (p_scope = 'occurrence' and booking.id = source_booking.id))
      and booking.status not in ('cancelled', 'completed', 'no_show')
    order by booking.starts_at
  loop
    select * into updated_booking from public.booking_transition(p_company_id, target_booking.id, 'cancelled', p_reason);
    cancelled_ids := array_append(cancelled_ids, updated_booking.id);
  end loop;
  if p_scope = 'series' then update public.booking_recurring_series set status = 'cancelled' where company_id = p_company_id and id = source_booking.recurrence_series_id; end if;
  return jsonb_build_object('cancelledBookingIds', to_jsonb(cancelled_ids));
end;
$$;

revoke all on function public.booking_cancel_series(uuid, uuid, text, text) from public, anon;
grant execute on function public.booking_cancel_series(uuid, uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Secure QR/manual check-in.
-- ---------------------------------------------------------------------------

create or replace function public.booking_checkin_issue_token(p_company_id uuid, p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  booking_row public.bookings;
  raw_token text := encode(extensions.gen_random_bytes(32), 'hex');
  expires_at_value timestamptz;
begin
  if actor_id is null or not public.can_access_company(p_company_id) or not coalesce(private.has_company_permission(p_company_id, 'booking.checkin'), false) then raise exception 'You do not have permission to issue check-in codes' using errcode = '42501'; end if;
  select * into booking_row from public.bookings where company_id = p_company_id and id = p_booking_id;
  if not found or not private.booking_user_can_access_staff(p_company_id, booking_row.staff_id) then raise exception 'Booking not found' using errcode = 'P0002'; end if;
  if booking_row.status in ('cancelled', 'completed', 'no_show') then raise exception 'This booking cannot be checked in' using errcode = '55000'; end if;
  expires_at_value := booking_row.ends_at + interval '12 hours';
  insert into public.booking_checkins(company_id, booking_id, token_hash, expires_at, status, checked_in_at, checked_in_by, device_id)
  values (p_company_id, p_booking_id, encode(extensions.digest(raw_token, 'sha256'), 'hex'), expires_at_value, 'issued', null, null, null)
  on conflict (company_id, booking_id) do update
    set token_hash = excluded.token_hash,
        issued_at = now(),
        expires_at = excluded.expires_at,
        status = 'issued',
        checked_in_at = null,
        checked_in_by = null,
        device_id = null;
  return jsonb_build_object('token', raw_token, 'expiresAt', expires_at_value);
end;
$$;

revoke all on function public.booking_checkin_issue_token(uuid, uuid) from public, anon;
grant execute on function public.booking_checkin_issue_token(uuid, uuid) to authenticated;

create or replace function public.booking_checkin_consume(p_token text, p_device_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  checkin_row public.booking_checkins;
  booking_row public.bookings;
  updated_booking public.bookings;
  already_checked boolean := false;
begin
  if actor_id is null or nullif(trim(p_token), '') is null then raise exception 'Authentication and a check-in token are required' using errcode = '42501'; end if;
  select * into checkin_row from public.booking_checkins where token_hash = encode(extensions.digest(trim(p_token), 'sha256'), 'hex') for update;
  if not found then raise exception 'The check-in code is invalid' using errcode = '22023'; end if;
  select * into booking_row from public.bookings where company_id = checkin_row.company_id and id = checkin_row.booking_id for update;
  if not private.booking_user_can_access_staff(booking_row.company_id, booking_row.staff_id) or not coalesce(private.has_company_permission(booking_row.company_id, 'booking.checkin'), false) then raise exception 'You do not have permission to check in this booking' using errcode = '42501'; end if;
  if checkin_row.status = 'consumed' then already_checked := true;
  elsif checkin_row.status = 'revoked' or checkin_row.expires_at < now() then raise exception 'This check-in code has expired' using errcode = '22023';
  elsif now() < booking_row.starts_at - interval '2 hours' or now() > booking_row.ends_at + interval '12 hours' then raise exception 'This booking is outside its check-in window' using errcode = '55000';
  elsif booking_row.status in ('cancelled', 'completed', 'no_show') then raise exception 'This booking cannot be checked in' using errcode = '55000';
  else
    select * into updated_booking from public.booking_transition(booking_row.company_id, booking_row.id, 'checked_in', 'QR check-in');
    update public.booking_checkins set status = 'consumed', checked_in_at = now(), checked_in_by = actor_id, device_id = nullif(trim(p_device_id), '') where id = checkin_row.id;
    booking_row := updated_booking;
  end if;
  return jsonb_build_object('bookingId', booking_row.id, 'bookingNumber', booking_row.booking_number, 'checkedInAt', coalesce(checkin_row.checked_in_at, now()), 'status', booking_row.status, 'alreadyCheckedIn', already_checked);
end;
$$;

revoke all on function public.booking_checkin_consume(text, text) from public, anon;
grant execute on function public.booking_checkin_consume(text, text) to authenticated;

create or replace function public.booking_checkin_manual(p_company_id uuid, p_booking_id uuid, p_device_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  booking_row public.bookings;
  updated_booking public.bookings;
  already_checked boolean := false;
begin
  if actor_id is null or not public.can_access_company(p_company_id) or not coalesce(private.has_company_permission(p_company_id, 'booking.checkin'), false) then raise exception 'You do not have permission to check in bookings' using errcode = '42501'; end if;
  select * into booking_row from public.bookings where company_id = p_company_id and id = p_booking_id for update;
  if not found or not private.booking_user_can_access_staff(p_company_id, booking_row.staff_id) then raise exception 'Booking not found' using errcode = 'P0002'; end if;
  if booking_row.status = 'checked_in' then already_checked := true;
  elsif now() < booking_row.starts_at - interval '2 hours' or now() > booking_row.ends_at + interval '12 hours' then raise exception 'This booking is outside its check-in window' using errcode = '55000';
  else select * into updated_booking from public.booking_transition(p_company_id, p_booking_id, 'checked_in', 'Manual check-in'); booking_row := updated_booking; end if;
  insert into public.booking_checkins(company_id, booking_id, token_hash, expires_at, checked_in_at, checked_in_by, device_id, status)
  values (p_company_id, p_booking_id, encode(extensions.digest('manual:' || p_booking_id::text, 'sha256'), 'hex'), booking_row.ends_at + interval '12 hours', case when already_checked then null else now() end, case when already_checked then null else actor_id end, nullif(trim(p_device_id), ''), 'consumed')
  on conflict (company_id, booking_id) do update set checked_in_at = coalesce(booking_checkins.checked_in_at, excluded.checked_in_at), checked_in_by = coalesce(booking_checkins.checked_in_by, excluded.checked_in_by), device_id = coalesce(excluded.device_id, booking_checkins.device_id), status = 'consumed';
  return jsonb_build_object('bookingId', booking_row.id, 'bookingNumber', booking_row.booking_number, 'checkedInAt', coalesce((select checked_in_at from public.booking_checkins where id = (select id from public.booking_checkins where company_id = p_company_id and booking_id = p_booking_id)), now()), 'status', booking_row.status, 'alreadyCheckedIn', already_checked);
end;
$$;

revoke all on function public.booking_checkin_manual(uuid, uuid, text) from public, anon;
grant execute on function public.booking_checkin_manual(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Package catalog, customer entitlements, and usage operations.
-- ---------------------------------------------------------------------------

create or replace function public.booking_package_create(
  p_company_id uuid,
  p_kind text,
  p_name text,
  p_description text default null,
  p_uses integer default null,
  p_validity_days integer default null,
  p_price numeric default 0,
  p_currency text default 'EUR',
  p_tax_rate numeric default 0,
  p_renewal_interval_days integer default null,
  p_service_ids uuid[] default '{}'
)
returns public.booking_packages
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  package_row public.booking_packages;
  service_id_value uuid;
begin
  if actor_id is null or not public.can_access_company(p_company_id) or not coalesce(private.has_company_permission(p_company_id, 'booking.package.manage'), false) then raise exception 'You do not have permission to manage packages' using errcode = '42501'; end if;
  if p_kind not in ('package', 'membership') or nullif(trim(p_name), '') is null then raise exception 'A valid package name and type are required' using errcode = '22023'; end if;
  if p_price < 0 or p_tax_rate < 0 or p_tax_rate > 100 or (p_uses is not null and p_uses < 1) then raise exception 'Package financial values are invalid' using errcode = '22023'; end if;
  insert into public.booking_packages(company_id, kind, name, description, uses, validity_days, price, currency, tax_rate, renewal_interval_days, created_by)
  values (p_company_id, p_kind, trim(p_name), nullif(trim(p_description), ''), p_uses, p_validity_days, round(p_price, 2), upper(p_currency), p_tax_rate, p_renewal_interval_days, actor_id)
  returning * into package_row;
  foreach service_id_value in array coalesce(p_service_ids, '{}'::uuid[]) loop
    if not exists (select 1 from public.booking_services service where service.company_id = p_company_id and service.id = service_id_value) then raise exception 'A package service does not belong to this organization' using errcode = '42501'; end if;
    insert into public.booking_package_services(company_id, package_id, service_id) values (p_company_id, package_row.id, service_id_value) on conflict do nothing;
  end loop;
  return package_row;
end;
$$;

revoke all on function public.booking_package_create(uuid, text, text, text, integer, integer, numeric, text, numeric, integer, uuid[]) from public, anon;
grant execute on function public.booking_package_create(uuid, text, text, text, integer, integer, numeric, text, numeric, integer, uuid[]) to authenticated;

create or replace function public.booking_customer_package_issue(
  p_company_id uuid,
  p_customer_id uuid,
  p_package_id uuid,
  p_starts_on date default current_date,
  p_ends_on date default null
)
returns public.booking_customer_packages
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  package_row public.booking_packages;
  result_row public.booking_customer_packages;
  end_date date;
begin
  if actor_id is null or not public.can_access_company(p_company_id) or not coalesce(private.has_company_permission(p_company_id, 'booking.package.manage'), false) then raise exception 'You do not have permission to assign packages' using errcode = '42501'; end if;
  if not exists (select 1 from public.clients customer where customer.company_id = p_company_id and customer.id = p_customer_id) then raise exception 'Customer does not belong to this organization' using errcode = '42501'; end if;
  select * into package_row from public.booking_packages where company_id = p_company_id and id = p_package_id and is_active;
  if not found then raise exception 'Package not found' using errcode = 'P0002'; end if;
  end_date := coalesce(p_ends_on, case when package_row.validity_days is null then null else p_starts_on + package_row.validity_days end);
  insert into public.booking_customer_packages(company_id, customer_id, package_id, starts_on, ends_on, remaining_uses, purchased_amount, currency, created_by)
  values (p_company_id, p_customer_id, p_package_id, p_starts_on, end_date, package_row.uses, package_row.price, package_row.currency, actor_id)
  returning * into result_row;
  return result_row;
end;
$$;

revoke all on function public.booking_customer_package_issue(uuid, uuid, uuid, date, date) from public, anon;
grant execute on function public.booking_customer_package_issue(uuid, uuid, uuid, date, date) to authenticated;

create or replace function public.booking_customer_packages(p_company_id uuid, p_customer_id uuid)
returns setof public.booking_customer_packages
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_access_company(p_company_id) or not coalesce(private.has_company_permission(p_company_id, 'customer.read'), false) then raise exception 'You do not have access to customer packages' using errcode = '42501'; end if;
  return query select entitlement.* from public.booking_customer_packages entitlement where entitlement.company_id = p_company_id and entitlement.customer_id = p_customer_id order by entitlement.starts_on desc;
end;
$$;

revoke all on function public.booking_customer_packages(uuid, uuid) from public, anon;
grant execute on function public.booking_customer_packages(uuid, uuid) to authenticated;

create or replace function public.booking_package_redeem(p_company_id uuid, p_booking_id uuid, p_customer_package_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare booking_row public.bookings;
begin
  if not public.can_access_company(p_company_id) or not coalesce(private.has_company_permission(p_company_id, 'booking.update'), false) then raise exception 'You do not have permission to redeem packages' using errcode = '42501'; end if;
  select * into booking_row from public.bookings where company_id = p_company_id and id = p_booking_id;
  if not found then raise exception 'Booking not found' using errcode = 'P0002'; end if;
  update public.bookings set customer_package_id = p_customer_package_id, package_units_reserved = 1 where company_id = p_company_id and id = p_booking_id;
  perform private.booking_reserve_package(p_company_id, p_booking_id, p_customer_package_id, booking_row.customer_id, booking_row.service_id);
end;
$$;

revoke all on function public.booking_package_redeem(uuid, uuid, uuid) from public, anon;
grant execute on function public.booking_package_redeem(uuid, uuid, uuid) to authenticated;

create or replace function public.booking_package_restore(p_company_id uuid, p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_access_company(p_company_id) or not coalesce(private.has_company_permission(p_company_id, 'booking.update'), false) then raise exception 'You do not have permission to restore package usage' using errcode = '42501'; end if;
  perform private.booking_restore_package(p_company_id, p_booking_id);
end;
$$;

revoke all on function public.booking_package_restore(uuid, uuid) from public, anon;
grant execute on function public.booking_package_restore(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Versioned custom booking forms and immutable answer snapshots.
-- ---------------------------------------------------------------------------

create or replace function public.booking_form_fields_for_service(p_company_id uuid, p_service_id uuid default null)
returns setof public.booking_form_fields
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_access_company(p_company_id) or not private.has_company_permission(p_company_id, 'service.read') then raise exception 'You do not have access to booking forms' using errcode = '42501'; end if;
  return query
  select distinct on (field.field_key) field.*
  from public.booking_form_fields field
  join public.booking_form_templates template on template.company_id = field.company_id and template.id = field.template_id and template.is_active
  where field.company_id = p_company_id
    and (template.service_id = p_service_id or template.service_id is null)
  order by field.field_key, case when template.service_id = p_service_id then 0 else 1 end, template.version desc, field.sort_order;
end;
$$;

revoke all on function public.booking_form_fields_for_service(uuid, uuid) from public, anon;
grant execute on function public.booking_form_fields_for_service(uuid, uuid) to authenticated;

create or replace function public.booking_form_submit(p_company_id uuid, p_booking_id uuid, p_answers jsonb)
returns setof public.booking_form_responses
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  booking_row public.bookings;
  field_row public.booking_form_fields;
  answer_entry record;
  has_field boolean;
begin
  if actor_id is null or not public.can_access_company(p_company_id) or not private.has_company_permission(p_company_id, 'booking.update') then raise exception 'You do not have permission to save booking answers' using errcode = '42501'; end if;
  select * into booking_row from public.bookings where company_id = p_company_id and id = p_booking_id;
  if not found or not private.booking_user_can_access_booking(p_company_id, p_booking_id) then raise exception 'Booking not found' using errcode = 'P0002'; end if;
  for field_row in
    select fields.*
    from public.booking_form_fields fields
    join public.booking_form_templates templates on templates.company_id = fields.company_id and templates.id = fields.template_id and templates.is_active
    where fields.company_id = p_company_id and (templates.service_id = booking_row.service_id or templates.service_id is null)
    order by case when templates.service_id = booking_row.service_id then 0 else 1 end, fields.sort_order
  loop
    if field_row.is_required and not (coalesce(p_answers, '{}'::jsonb) ? field_row.field_key) then raise exception 'The required booking question is missing: %', field_row.label using errcode = '22023'; end if;
  end loop;
  update public.bookings set custom_form_answers = coalesce(p_answers, '{}'::jsonb), updated_at = now() where company_id = p_company_id and id = p_booking_id;
  for answer_entry in select * from jsonb_each(coalesce(p_answers, '{}'::jsonb)) loop
    select fields.* into field_row
    from public.booking_form_fields fields
    join public.booking_form_templates templates on templates.company_id = fields.company_id and templates.id = fields.template_id and templates.is_active
    where fields.company_id = p_company_id and fields.field_key = answer_entry.key
    order by case when templates.service_id = booking_row.service_id then 0 else 1 end
    limit 1;
    has_field := found;
    insert into public.booking_form_responses(company_id, booking_id, field_id, field_key, label, field_type, value)
    values (p_company_id, p_booking_id, case when has_field then field_row.id else null end, answer_entry.key, case when has_field then field_row.label else answer_entry.key end, case when has_field then field_row.field_type else 'short_text' end, answer_entry.value);
  end loop;
  return query select response.* from public.booking_form_responses response where response.company_id = p_company_id and response.booking_id = p_booking_id order by response.created_at;
end;
$$;

revoke all on function public.booking_form_submit(uuid, uuid, jsonb) from public, anon;
grant execute on function public.booking_form_submit(uuid, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Reminder scheduling and deduplicated service-role claiming.
-- ---------------------------------------------------------------------------

create or replace function private.booking_sync_reminders()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rule_row record;
  rule_json jsonb;
begin
  if new.status in ('cancelled', 'completed', 'no_show') then
    update public.booking_reminders set status = 'cancelled', is_active = false where company_id = new.company_id and booking_id = new.id and status in ('pending', 'queued');
    return new;
  end if;
  update public.booking_reminders
  set scheduled_for = new.starts_at - make_interval(mins => minutes_before), status = 'pending', is_active = true, last_error = null
  where company_id = new.company_id and booking_id = new.id and status <> 'sent';
  for rule_row in
    select rules.minutes_before, rules.channel, rules.event_type
    from public.booking_reminder_rules rules
    where rules.company_id = new.company_id and rules.is_active and (rules.service_id is null or rules.service_id = new.service_id)
    order by rules.minutes_before desc
  loop
    if rule_row.channel in ('in_app', 'push', 'email', 'sms') then
      insert into public.booking_reminders(company_id, booking_id, minutes_before, channel, event_type, status, scheduled_for, delivery_key)
      values (new.company_id, new.id, rule_row.minutes_before, rule_row.channel, rule_row.event_type, 'pending', new.starts_at - make_interval(mins => rule_row.minutes_before), new.id::text || ':' || rule_row.event_type || ':' || rule_row.minutes_before::text || ':' || rule_row.channel)
      on conflict (booking_id, minutes_before, channel) do update set event_type = excluded.event_type, scheduled_for = excluded.scheduled_for, status = case when booking_reminders.status = 'sent' then 'sent' else 'pending' end, is_active = true;
    else
      insert into public.booking_notification_log(company_id, booking_id, event_type, channel, recipient, delivery_key, status)
      values (new.company_id, new.id, rule_row.event_type, rule_row.channel, coalesce(new.guest_email, new.guest_phone), new.id::text || ':' || rule_row.event_type || ':' || rule_row.minutes_before::text || ':' || rule_row.channel, 'queued')
      on conflict (company_id, delivery_key, channel) do nothing;
    end if;
  end loop;
  select settings.default_reminder_rules into rule_json from public.booking_settings settings where settings.company_id = new.company_id;
  for rule_row in select * from jsonb_array_elements(coalesce(rule_json, '[]'::jsonb)) rule_json_entry loop
    if coalesce((rule_row.value->>'isActive')::boolean, true) and coalesce(rule_row.value->>'channel', '') in ('in_app', 'push', 'email', 'sms') then
      insert into public.booking_reminders(company_id, booking_id, minutes_before, channel, event_type, status, scheduled_for, delivery_key)
      values (new.company_id, new.id, greatest(0, coalesce((rule_row.value->>'minutesBefore')::integer, 0)), rule_row.value->>'channel', coalesce(rule_row.value->>'eventType', 'booking.reminder'), 'pending', new.starts_at - make_interval(mins => greatest(0, coalesce((rule_row.value->>'minutesBefore')::integer, 0))), new.id::text || ':default:' || coalesce(rule_row.value->>'eventType', 'booking.reminder') || ':' || coalesce(rule_row.value->>'minutesBefore', '0') || ':' || (rule_row.value->>'channel'))
      on conflict (booking_id, minutes_before, channel) do nothing;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists booking_reminder_sync on public.bookings;
create trigger booking_reminder_sync
after insert or update of starts_at, status, service_id
on public.bookings
for each row execute function private.booking_sync_reminders();

create or replace function public.booking_claim_reminders(p_limit integer default 50)
returns setof public.booking_reminders
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) <> 'service_role' then raise exception 'Only the notification worker may claim reminders' using errcode = '42501'; end if;
  return query
  with claimed as (
    select reminder.id
    from public.booking_reminders reminder
    join public.bookings booking on booking.company_id = reminder.company_id and booking.id = reminder.booking_id
    where reminder.status = 'pending'
      and reminder.is_active
      and coalesce(reminder.scheduled_for, booking.starts_at - make_interval(mins => reminder.minutes_before)) <= now()
      and booking.status not in ('cancelled', 'completed', 'no_show')
    order by reminder.scheduled_for nulls first, reminder.created_at
    for update of reminder skip locked
    limit greatest(1, least(coalesce(p_limit, 50), 500))
  )
  update public.booking_reminders reminder
  set status = 'queued', attempts = reminder.attempts + 1
  from claimed
  where reminder.id = claimed.id
  returning reminder.*;
end;
$$;

revoke all on function public.booking_claim_reminders(integer) from public, anon, authenticated;
grant execute on function public.booking_claim_reminders(integer) to service_role;

-- ---------------------------------------------------------------------------
-- Staff commissions and server-side operational analytics.
-- ---------------------------------------------------------------------------

create or replace function private.booking_earn_commission(p_company_id uuid, p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking_row public.bookings;
  rule_row public.booking_commission_rules;
  revenue_basis numeric(20,4);
  commission_amount numeric(20,4);
  commission_status text;
begin
  select * into booking_row
  from public.bookings
  where company_id = p_company_id and id = p_booking_id;
  if not found or booking_row.staff_id is null then return; end if;

  select * into rule_row
  from public.booking_commission_rules rule
  where rule.company_id = p_company_id
    and rule.is_active
    and (rule.staff_id is null or rule.staff_id = booking_row.staff_id)
    and (rule.service_id is null or rule.service_id = booking_row.service_id)
  order by (case when rule.staff_id is not null then 2 else 0 end)
    + (case when rule.service_id is not null then 1 else 0 end) desc,
    rule.created_at desc
  limit 1;
  if not found then return; end if;

  revenue_basis := greatest(coalesce(booking_row.total_amount, 0) - coalesce(booking_row.cancellation_fee, 0), 0);
  commission_amount := case rule_row.rule_type
    when 'percentage' then round(revenue_basis * least(100, greatest(rule_row.rate, 0)) / 100, 2)
    else round(greatest(rule_row.rate, 0), 2)
  end;
  commission_status := case when rule_row.earned_on = 'paid' and booking_row.payment_status <> 'paid' then 'pending' else 'earned' end;

  insert into public.booking_commissions(
    company_id, booking_id, staff_id, service_id, revenue_basis,
    commission_rate, commission_type, amount, status, earned_at
  )
  values (
    p_company_id, booking_row.id, booking_row.staff_id, booking_row.service_id,
    revenue_basis, rule_row.rate, rule_row.rule_type, commission_amount,
    commission_status, case when commission_status = 'earned' then now() else null end
  )
  on conflict (company_id, booking_id, staff_id) do update set
    service_id = excluded.service_id,
    revenue_basis = excluded.revenue_basis,
    commission_rate = excluded.commission_rate,
    commission_type = excluded.commission_type,
    amount = excluded.amount,
    status = case when booking_commissions.status = 'voided' then 'voided' else excluded.status end,
    earned_at = case when excluded.status = 'earned' and booking_commissions.status <> 'voided' then coalesce(booking_commissions.earned_at, now()) else booking_commissions.earned_at end;
end;
$$;

revoke all on function private.booking_earn_commission(uuid, uuid) from public;
grant execute on function private.booking_earn_commission(uuid, uuid) to authenticated, service_role;

create or replace function public.booking_commission_summary(
  p_company_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_staff_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_access_company(p_company_id)
     or not (coalesce(private.has_company_permission(p_company_id, 'booking.commission.manage'), false)
       or coalesce(private.has_company_permission(p_company_id, 'booking.analytics'), false)) then
    raise exception 'You do not have access to commission reports' using errcode = '42501';
  end if;
  if p_to <= p_from then raise exception 'The report range is invalid' using errcode = '22023'; end if;
  return jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'total', coalesce((select round(sum(commission.amount), 2) from public.booking_commissions commission where commission.company_id = p_company_id and commission.status = 'earned' and commission.earned_at >= p_from and commission.earned_at < p_to and (p_staff_id is null or commission.staff_id = p_staff_id)), 0),
    'byStaff', coalesce((
      select jsonb_agg(jsonb_build_object('id', grouped.staff_id, 'name', grouped.name, 'amount', round(grouped.amount, 2), 'bookings', grouped.bookings) order by grouped.amount desc)
      from (
        select commission.staff_id, staff.display_name as name, sum(commission.amount) as amount, count(*)::integer as bookings
        from public.booking_commissions commission
        join public.booking_staff staff on staff.company_id = commission.company_id and staff.id = commission.staff_id
        where commission.company_id = p_company_id and commission.status = 'earned' and commission.earned_at >= p_from and commission.earned_at < p_to and (p_staff_id is null or commission.staff_id = p_staff_id)
        group by commission.staff_id, staff.display_name
      ) grouped
    ), '[]'::jsonb),
    'byService', coalesce((
      select jsonb_agg(jsonb_build_object('id', grouped.service_id, 'name', grouped.name, 'amount', round(grouped.amount, 2), 'bookings', grouped.bookings) order by grouped.amount desc)
      from (
        select commission.service_id, service.name, sum(commission.amount) as amount, count(*)::integer as bookings
        from public.booking_commissions commission
        join public.booking_services service on service.company_id = commission.company_id and service.id = commission.service_id
        where commission.company_id = p_company_id and commission.status = 'earned' and commission.earned_at >= p_from and commission.earned_at < p_to and (p_staff_id is null or commission.staff_id = p_staff_id)
        group by commission.service_id, service.name
      ) grouped
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.booking_commission_summary(uuid, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.booking_commission_summary(uuid, timestamptz, timestamptz, uuid) to authenticated;

create or replace function public.booking_analytics_summary(
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
begin
  if not public.can_access_company(p_company_id)
     or not (coalesce(private.has_company_permission(p_company_id, 'booking.analytics'), false)
       or coalesce(private.has_company_permission(p_company_id, 'report.read'), false)) then
    raise exception 'You do not have access to booking analytics' using errcode = '42501';
  end if;
  if p_to <= p_from then raise exception 'The report range is invalid' using errcode = '22023'; end if;

  return (
    with filtered as (
      select booking.*
      from public.bookings booking
      where booking.company_id = p_company_id
        and booking.starts_at >= p_from
        and booking.starts_at < p_to
        and (p_service_id is null or booking.service_id = p_service_id)
        and (p_staff_id is null or booking.staff_id = p_staff_id)
        and (p_location_id is null or booking.location_id = p_location_id)
        and private.booking_user_can_access_staff(p_company_id, booking.staff_id)
    ),
    active_rows as (
      select * from filtered where status not in ('cancelled', 'no_show', 'draft')
    ),
    counts as (
      select
        count(*)::integer as total_bookings,
        count(*) filter (where status in ('confirmed', 'checked_in', 'in_progress', 'completed', 'rescheduled'))::integer as confirmed_bookings,
        count(*) filter (where status = 'completed')::integer as completed_bookings,
        count(*) filter (where status = 'cancelled')::integer as cancelled_bookings,
        count(*) filter (where status = 'no_show')::integer as no_shows,
        coalesce(sum(total_amount) filter (where status not in ('cancelled', 'no_show', 'draft')), 0) as revenue,
        coalesce(avg(total_amount) filter (where status not in ('cancelled', 'no_show', 'draft')), 0) as average_booking_value,
        coalesce(sum(least(paid_amount, deposit_amount)) filter (where status not in ('cancelled', 'no_show')), 0) as deposits_collected,
        coalesce(sum(greatest(total_amount - paid_amount, 0)) filter (where status not in ('cancelled', 'no_show')), 0) as outstanding_balance,
        coalesce(sum(participant_count) filter (where status not in ('cancelled', 'no_show', 'draft')), 0) as occupied_units,
        coalesce(sum(coalesce(service.capacity_per_slot, service.max_participants)) filter (where filtered.status not in ('cancelled', 'no_show', 'draft')), 0) as available_units
      from filtered
      left join public.booking_services service on service.company_id = filtered.company_id and service.id = filtered.service_id
    ),
    customer_counts as (
      select
        count(*) filter (where not exists (select 1 from public.bookings previous where previous.company_id = p_company_id and previous.customer_id = active.customer_id and previous.starts_at < p_from))::integer as new_customers,
        count(*) filter (where exists (select 1 from public.bookings previous where previous.company_id = p_company_id and previous.customer_id = active.customer_id and previous.starts_at < p_from))::integer as returning_customers
      from (select distinct customer_id from active_rows where customer_id is not null) active
    )
    select jsonb_build_object(
      'from', p_from,
      'to', p_to,
      'totalBookings', counts.total_bookings,
      'confirmedBookings', counts.confirmed_bookings,
      'completedBookings', counts.completed_bookings,
      'cancelledBookings', counts.cancelled_bookings,
      'noShows', counts.no_shows,
      'cancellationRate', case when counts.total_bookings = 0 then 0 else round(counts.cancelled_bookings::numeric * 100 / counts.total_bookings, 2) end,
      'noShowRate', case when counts.total_bookings = 0 then 0 else round(counts.no_shows::numeric * 100 / counts.total_bookings, 2) end,
      'revenue', round(counts.revenue, 2),
      'averageBookingValue', round(counts.average_booking_value, 2),
      'depositsCollected', round(counts.deposits_collected, 2),
      'outstandingBalance', round(counts.outstanding_balance, 2),
      'newCustomers', coalesce(customer_counts.new_customers, 0),
      'returningCustomers', coalesce(customer_counts.returning_customers, 0),
      'occupancyRate', case when counts.available_units = 0 then 0 else round(least(100, counts.occupied_units::numeric * 100 / counts.available_units), 2) end,
      'topServices', coalesce((select jsonb_agg(jsonb_build_object('id', grouped.id, 'name', grouped.name, 'bookings', grouped.bookings, 'revenue', round(grouped.revenue, 2)) order by grouped.revenue desc) from (select service.id, service.name, count(*)::integer bookings, sum(active.total_amount) revenue from active_rows active join public.booking_services service on service.company_id = active.company_id and service.id = active.service_id group by service.id, service.name order by sum(active.total_amount) desc limit 5) grouped), '[]'::jsonb),
      'topStaff', coalesce((select jsonb_agg(jsonb_build_object('id', grouped.id, 'name', grouped.name, 'bookings', grouped.bookings, 'revenue', round(grouped.revenue, 2)) order by grouped.revenue desc) from (select staff.id, staff.display_name as name, count(*)::integer bookings, sum(active.total_amount) revenue from active_rows active join public.booking_staff staff on staff.company_id = active.company_id and staff.id = active.staff_id group by staff.id, staff.display_name order by sum(active.total_amount) desc limit 5) grouped), '[]'::jsonb),
      'topLocations', coalesce((select jsonb_agg(jsonb_build_object('id', grouped.id, 'name', grouped.name, 'bookings', grouped.bookings, 'revenue', round(grouped.revenue, 2)) order by grouped.revenue desc) from (select location.id, location.name, count(*)::integer bookings, sum(active.total_amount) revenue from active_rows active join public.booking_locations location on location.company_id = active.company_id and location.id = active.location_id group by location.id, location.name order by sum(active.total_amount) desc limit 5) grouped), '[]'::jsonb),
      'sources', coalesce((select jsonb_agg(jsonb_build_object('source', grouped.source, 'bookings', grouped.bookings) order by grouped.bookings desc) from (select source, count(*)::integer bookings from filtered group by source order by count(*) desc) grouped), '[]'::jsonb)
    )
    from counts
    cross join customer_counts
  );
end;
$$;

revoke all on function public.booking_analytics_summary(uuid, timestamptz, timestamptz, uuid, uuid, uuid) from public, anon;
grant execute on function public.booking_analytics_summary(uuid, timestamptz, timestamptz, uuid, uuid, uuid) to authenticated;

create or replace function public.booking_smart_availability(
  p_company_id uuid,
  p_service_id uuid,
  p_date date,
  p_requested_start timestamptz default null,
  p_location_id uuid default null,
  p_resource_id uuid default null,
  p_staff_id uuid default null,
  p_participant_count integer default 1
)
returns table (
  starts_at timestamptz,
  ends_at timestamptz,
  staff_id uuid,
  location_id uuid,
  resource_id uuid,
  capacity_remaining integer,
  score numeric,
  reason text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings_row public.booking_settings;
  service_row public.booking_services;
  candidate_staff_id uuid;
  candidate_location_id uuid;
  candidate_resource_id uuid;
  slot_start timestamptz;
  slot_end timestamptz;
  candidate_score numeric;
  candidate_reason text;
  distance_minutes numeric;
  capacity_limit integer;
  occupied_capacity integer;
begin
  if not public.can_access_company(p_company_id) or not coalesce(private.has_company_permission(p_company_id, 'calendar.read'), false) then raise exception 'You do not have access to availability suggestions' using errcode = '42501'; end if;
  select * into settings_row from public.booking_settings where company_id = p_company_id;
  select * into service_row from public.booking_services where company_id = p_company_id and id = p_service_id and is_active;
  if not found then raise exception 'The selected service is not available' using errcode = 'P0002'; end if;

  create temporary table if not exists pg_temp.booking_availability_suggestions (
    starts_at timestamptz,
    ends_at timestamptz,
    staff_id uuid,
    location_id uuid,
    resource_id uuid,
    capacity_remaining integer,
    score numeric,
    reason text
  ) on commit drop;
  delete from pg_temp.booking_availability_suggestions;

  for candidate_staff_id in
    select staff.id from public.booking_staff staff
    where staff.company_id = p_company_id and staff.is_active
      and (not exists (select 1 from public.booking_staff_services mapping where mapping.company_id = p_company_id and mapping.service_id = p_service_id) or exists (select 1 from public.booking_staff_services mapping where mapping.company_id = p_company_id and mapping.service_id = p_service_id and mapping.staff_id = staff.id))
    order by case when staff.id = p_staff_id then 0 else 1 end, staff.display_name
  loop
    for candidate_location_id in
      select candidates.id
      from (
        select location.id, case when location.id = p_location_id then 0 else 1 end as preference
        from public.booking_locations location
        where location.company_id = p_company_id and location.is_active
        union all
        select null::uuid, 2
      ) candidates
      order by candidates.preference, candidates.id nulls last
    loop
      for candidate_resource_id in
        select candidates.id
        from (
          select resource.id, case when resource.id = p_resource_id then 0 else 1 end as preference, resource.name
          from public.booking_resources resource
          where resource.company_id = p_company_id and resource.is_active and resource.status = 'active'
            and (candidate_location_id is null or resource.location_id is null or resource.location_id = candidate_location_id)
            and (not exists (select 1 from public.booking_resource_services mapping where mapping.company_id = p_company_id and mapping.service_id = p_service_id) or exists (select 1 from public.booking_resource_services mapping where mapping.company_id = p_company_id and mapping.service_id = p_service_id and mapping.resource_id = resource.id))
          union all
          select null::uuid, 2, null::text
        ) candidates
        order by candidates.preference, candidates.name nulls last
      loop
        slot_start := ((p_date::text || ' 06:00:00')::timestamp at time zone coalesce(settings_row.timezone, 'UTC'));
        while slot_start < ((p_date::text || ' 22:00:00')::timestamp at time zone coalesce(settings_row.timezone, 'UTC')) loop
          slot_end := slot_start + make_interval(mins => service_row.duration_minutes);
          if private.booking_slot_is_available(p_company_id, p_service_id, candidate_location_id, candidate_resource_id, candidate_staff_id, slot_start, slot_end, greatest(coalesce(p_participant_count, 1), 1), null) then
            distance_minutes := case when p_requested_start is null then 0 else abs(extract(epoch from (slot_start - p_requested_start)) / 60) end;
            candidate_score := -distance_minutes
              + case when p_staff_id is not null and candidate_staff_id = p_staff_id then 10000 else 0 end
              + case when p_location_id is not null and candidate_location_id = p_location_id then 5000 else 0 end
              + case when p_resource_id is not null and candidate_resource_id = p_resource_id then 2500 else 0 end;
            candidate_reason := case
              when p_staff_id is not null and candidate_staff_id = p_staff_id and p_location_id is not null and candidate_location_id = p_location_id then 'Preferred provider and location'
              when p_staff_id is not null and candidate_staff_id = p_staff_id then 'Preferred provider'
              when p_location_id is not null and candidate_location_id = p_location_id then 'Preferred location'
              when p_requested_start is null or slot_start >= p_requested_start then 'Next available time'
              else 'Earlier available time'
            end;
            capacity_limit := coalesce(service_row.capacity_per_slot, service_row.max_participants);
            if candidate_resource_id is not null then select resource.capacity into capacity_limit from public.booking_resources resource where resource.company_id = p_company_id and resource.id = candidate_resource_id; end if;
            select coalesce(sum(booking.participant_count), 0)::integer into occupied_capacity
            from public.bookings booking
            where booking.company_id = p_company_id and booking.status in ('pending', 'confirmed', 'checked_in', 'in_progress', 'rescheduled')
              and (candidate_resource_id is not null and booking.resource_id = candidate_resource_id or candidate_resource_id is null and booking.service_id = p_service_id)
              and booking.starts_at < slot_end and booking.ends_at > slot_start;
            insert into pg_temp.booking_availability_suggestions values (slot_start, slot_end, candidate_staff_id, candidate_location_id, candidate_resource_id, greatest(0, capacity_limit - occupied_capacity), candidate_score, candidate_reason)
            on conflict do nothing;
          end if;
          slot_start := slot_start + interval '15 minutes';
        end loop;
      end loop;
    end loop;
  end loop;

  return query select suggestion.starts_at, suggestion.ends_at, suggestion.staff_id, suggestion.location_id, suggestion.resource_id, suggestion.capacity_remaining, suggestion.score, suggestion.reason
  from pg_temp.booking_availability_suggestions suggestion
  order by suggestion.score desc, suggestion.starts_at
  limit 8;
end;
$$;

revoke all on function public.booking_smart_availability(uuid, uuid, date, timestamptz, uuid, uuid, uuid, integer) from public, anon;
grant execute on function public.booking_smart_availability(uuid, uuid, date, timestamptz, uuid, uuid, uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Customer portal tokens. Tokens are opaque, expiring, revocable, and only
-- return customer-safe booking fields. They are deliberately not exposed by
-- direct table grants or RLS policies.
-- ---------------------------------------------------------------------------

create or replace function public.booking_portal_issue_token(
  p_company_id uuid,
  p_customer_id uuid,
  p_expires_in_days integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  raw_token text := encode(extensions.gen_random_bytes(32), 'hex');
  token_row public.booking_portal_tokens;
  expires_at_value timestamptz;
begin
  if actor_id is null or not public.can_access_company(p_company_id) or not coalesce(private.has_company_permission(p_company_id, 'booking.portal.manage'), false) then raise exception 'You do not have permission to issue customer portal links' using errcode = '42501'; end if;
  if p_expires_in_days < 1 or p_expires_in_days > 90 then raise exception 'Portal links must expire within 90 days' using errcode = '22023'; end if;
  if not exists (select 1 from public.booking_settings settings where settings.company_id = p_company_id and coalesce(settings.customer_portal_enabled, true)) then raise exception 'The customer portal is disabled' using errcode = '42501'; end if;
  if not exists (select 1 from public.clients customer where customer.company_id = p_company_id and customer.id = p_customer_id) then raise exception 'Customer not found' using errcode = 'P0002'; end if;
  expires_at_value := now() + make_interval(days => p_expires_in_days);
  insert into public.booking_portal_tokens(company_id, customer_id, token_hash, expires_at, created_by)
  values (p_company_id, p_customer_id, encode(extensions.digest(raw_token, 'sha256'), 'hex'), expires_at_value, actor_id)
  returning * into token_row;
  perform private.booking_audit_event(p_company_id, null, 'portal.token_issued', jsonb_build_object('token_id', token_row.id, 'customer_id', p_customer_id, 'expires_at', expires_at_value));
  return jsonb_build_object('id', token_row.id, 'token', raw_token, 'expiresAt', expires_at_value);
end;
$$;

revoke all on function public.booking_portal_issue_token(uuid, uuid, integer) from public, anon;
grant execute on function public.booking_portal_issue_token(uuid, uuid, integer) to authenticated;

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
        'id', booking.id,
        'bookingNumber', booking.booking_number,
        'service', service.name,
        'startsAt', booking.starts_at,
        'endsAt', booking.ends_at,
        'timezone', booking.timezone,
        'status', booking.status,
        'paymentStatus', booking.payment_status,
        'paymentStage', booking.payment_stage,
        'totalAmount', booking.total_amount,
        'depositAmount', booking.deposit_amount,
        'paidAmount', booking.paid_amount,
        'outstandingBalance', greatest(booking.total_amount - booking.paid_amount, 0),
        'currency', booking.currency,
        'location', location.name,
        'staff', staff.display_name,
        'notes', booking.customer_notes
      ) order by booking.starts_at)
      from public.bookings booking
      join public.booking_services service on service.company_id = booking.company_id and service.id = booking.service_id
      left join public.booking_locations location on location.company_id = booking.company_id and location.id = booking.location_id
      left join public.booking_staff staff on staff.company_id = booking.company_id and staff.id = booking.staff_id
      where booking.company_id = token_row.company_id and booking.customer_id = token_row.customer_id
    ), '[]'::jsonb),
    'packages', coalesce((
      select jsonb_agg(jsonb_build_object('id', entitlement.id, 'packageId', entitlement.package_id, 'status', entitlement.status, 'startsOn', entitlement.starts_on, 'endsOn', entitlement.ends_on, 'remainingUses', entitlement.remaining_uses, 'name', package.name, 'kind', package.kind) order by entitlement.ends_on nulls last, entitlement.starts_on desc)
      from public.booking_customer_packages entitlement
      join public.booking_packages package on package.company_id = entitlement.company_id and package.id = entitlement.package_id
      where entitlement.company_id = token_row.company_id and entitlement.customer_id = token_row.customer_id and entitlement.status = 'active'
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.booking_portal_get(text) from public;
grant execute on function public.booking_portal_get(text) to anon, authenticated;

create or replace function public.booking_portal_revoke_token(p_company_id uuid, p_token_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_access_company(p_company_id) or not coalesce(private.has_company_permission(p_company_id, 'booking.portal.manage'), false) then raise exception 'You do not have permission to revoke customer portal links' using errcode = '42501'; end if;
  update public.booking_portal_tokens set revoked_at = now() where company_id = p_company_id and id = p_token_id and revoked_at is null;
  perform private.booking_audit_event(p_company_id, null, 'portal.token_revoked', jsonb_build_object('token_id', p_token_id));
end;
$$;

revoke all on function public.booking_portal_revoke_token(uuid, uuid) from public, anon;
grant execute on function public.booking_portal_revoke_token(uuid, uuid) to authenticated;

create or replace function public.booking_portal_cancel(p_token text, p_booking_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  token_row public.booking_portal_tokens;
  booking_row public.bookings;
  policy jsonb;
  free_window boolean;
  fee numeric(20,4) := 0;
  refund numeric(20,4) := 0;
  old_status text;
begin
  select * into token_row from public.booking_portal_tokens token where token.token_hash = encode(extensions.digest(trim(p_token), 'sha256'), 'hex') and token.revoked_at is null and token.expires_at > now() for update;
  if not found then raise exception 'The customer portal link is invalid or expired' using errcode = '42501'; end if;
  if not exists (select 1 from public.booking_settings settings where settings.company_id = token_row.company_id and coalesce(settings.customer_portal_enabled, true) and settings.allow_customer_cancellation) then raise exception 'Customer cancellation is disabled' using errcode = '42501'; end if;
  select * into booking_row from public.bookings booking where booking.company_id = token_row.company_id and booking.id = p_booking_id and booking.customer_id = token_row.customer_id for update;
  if not found then raise exception 'Booking not found' using errcode = 'P0002'; end if;
  if booking_row.status in ('cancelled', 'completed', 'no_show') then raise exception 'This booking cannot be cancelled' using errcode = '55000'; end if;
  if now() > booking_row.starts_at - make_interval(mins => (select settings.cancellation_cutoff_minutes from public.booking_settings settings where settings.company_id = token_row.company_id)) then raise exception 'The cancellation window has closed' using errcode = '55000'; end if;
  policy := case when booking_row.policy_snapshot = '{}'::jsonb then private.booking_resolve_policy(token_row.company_id, booking_row.service_id) else booking_row.policy_snapshot end;
  free_window := now() <= booking_row.starts_at - make_interval(mins => greatest(0, coalesce((policy->>'freeCancellationMinutes')::integer, 120)));
  if not free_window then fee := private.booking_policy_fee(policy, 'late', booking_row.total_amount); end if;
  if free_window and coalesce((policy->>'depositsRefundable')::boolean, false) then refund := greatest(0, least(booking_row.deposit_amount, booking_row.paid_amount) - fee); end if;
  old_status := booking_row.status;
  update public.bookings set status = 'cancelled', cancellation_fee = round(fee, 2), deposit_refund_amount = round(refund, 2), updated_at = now() where company_id = token_row.company_id and id = booking_row.id returning * into booking_row;
  insert into public.booking_status_history(company_id, booking_id, from_status, to_status, reason, actor_user_id) values (token_row.company_id, booking_row.id, old_status, 'cancelled', p_reason, null);
  insert into public.booking_audit_log(company_id, booking_id, actor_user_id, action, entity, entity_id, details) values (token_row.company_id, booking_row.id, null, 'booking.customer_cancelled', 'booking', booking_row.id, jsonb_build_object('reason', p_reason, 'cancellation_fee', fee, 'deposit_refund_amount', refund));
  if free_window and booking_row.customer_package_id is not null then perform private.booking_restore_package(token_row.company_id, booking_row.id); end if;
  return jsonb_build_object('bookingId', booking_row.id, 'bookingNumber', booking_row.booking_number, 'status', booking_row.status, 'cancellationFee', booking_row.cancellation_fee, 'depositRefundAmount', booking_row.deposit_refund_amount);
end;
$$;

revoke all on function public.booking_portal_cancel(text, uuid, text) from public, authenticated;
grant execute on function public.booking_portal_cancel(text, uuid, text) to anon;

create or replace function public.booking_portal_reschedule(p_token text, p_booking_id uuid, p_starts_at timestamptz, p_ends_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  token_row public.booking_portal_tokens;
  booking_row public.bookings;
  service_row public.booking_services;
  settings_row public.booking_settings;
  new_ends_at timestamptz;
  old_status text;
  old_starts_at timestamptz;
begin
  select * into token_row from public.booking_portal_tokens token where token.token_hash = encode(extensions.digest(trim(p_token), 'sha256'), 'hex') and token.revoked_at is null and token.expires_at > now() for update;
  if not found then raise exception 'The customer portal link is invalid or expired' using errcode = '42501'; end if;
  select * into settings_row from public.booking_settings settings where settings.company_id = token_row.company_id;
  if not coalesce(settings_row.customer_portal_enabled, true) or not coalesce(settings_row.allow_customer_rescheduling, false) then raise exception 'Customer rescheduling is disabled' using errcode = '42501'; end if;
  select * into booking_row from public.bookings booking where booking.company_id = token_row.company_id and booking.id = p_booking_id and booking.customer_id = token_row.customer_id for update;
  if not found then raise exception 'Booking not found' using errcode = 'P0002'; end if;
  if booking_row.status in ('cancelled', 'completed', 'no_show') then raise exception 'This booking cannot be rescheduled' using errcode = '55000'; end if;
  if now() > booking_row.starts_at - make_interval(mins => coalesce(settings_row.reschedule_cutoff_minutes, 120)) then raise exception 'The rescheduling window has closed' using errcode = '55000'; end if;
  select * into service_row from public.booking_services service where service.company_id = token_row.company_id and service.id = booking_row.service_id and service.is_active;
  new_ends_at := coalesce(p_ends_at, p_starts_at + make_interval(mins => service_row.duration_minutes));
  if p_starts_at is null or new_ends_at <= p_starts_at then raise exception 'The new booking time is invalid' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(token_row.company_id::text || ':availability', 0));
  if not private.booking_slot_is_available(token_row.company_id, booking_row.service_id, booking_row.location_id, booking_row.resource_id, booking_row.staff_id, p_starts_at, new_ends_at, booking_row.participant_count, booking_row.id) then raise exception 'This time slot is no longer available' using errcode = '23P01'; end if;
  old_status := booking_row.status;
  old_starts_at := booking_row.starts_at;
  update public.bookings set starts_at = p_starts_at, ends_at = new_ends_at, duration_minutes = extract(epoch from (new_ends_at - p_starts_at))::integer / 60, status = case when old_status = 'confirmed' then 'rescheduled' else old_status end, recurrence_exception = case when recurrence_series_id is not null then true else recurrence_exception end, updated_at = now() where company_id = token_row.company_id and id = booking_row.id returning * into booking_row;
  insert into public.booking_status_history(company_id, booking_id, from_status, to_status, reason, actor_user_id) values (token_row.company_id, booking_row.id, old_status, booking_row.status, 'Customer portal reschedule', null);
  insert into public.booking_audit_log(company_id, booking_id, actor_user_id, action, entity, entity_id, details) values (token_row.company_id, booking_row.id, null, 'booking.customer_rescheduled', 'booking', booking_row.id, jsonb_build_object('old_starts_at', old_starts_at, 'new_starts_at', p_starts_at));
  return jsonb_build_object('bookingId', booking_row.id, 'bookingNumber', booking_row.booking_number, 'startsAt', booking_row.starts_at, 'endsAt', booking_row.ends_at, 'status', booking_row.status);
end;
$$;

revoke all on function public.booking_portal_reschedule(text, uuid, timestamptz, timestamptz) from public, authenticated;
grant execute on function public.booking_portal_reschedule(text, uuid, timestamptz, timestamptz) to anon;

-- ---------------------------------------------------------------------------
-- Calendar provider abstraction and public widget configuration.
-- ---------------------------------------------------------------------------

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
begin
  if not public.can_access_company(p_company_id) or not coalesce(private.has_company_permission(p_company_id, 'booking.integration.manage'), false) then raise exception 'You do not have permission to manage calendar integrations' using errcode = '42501'; end if;
  if p_provider not in ('google', 'apple', 'outlook') or p_status not in ('connected', 'disconnected', 'error') then raise exception 'The calendar provider or status is invalid' using errcode = '22023'; end if;
  insert into public.booking_calendar_connections(company_id, user_id, provider, external_account_id, status, metadata)
  values (p_company_id, (select auth.uid()), p_provider, nullif(trim(p_external_account_id), ''), p_status, coalesce(p_metadata, '{}'::jsonb) - 'access_token' - 'refresh_token' - 'client_secret')
  on conflict (company_id, provider, external_account_id) do update set status = excluded.status, metadata = excluded.metadata, user_id = excluded.user_id, updated_at = now()
  returning * into result_row;
  return result_row;
end;
$$;

revoke all on function public.booking_calendar_connection_save(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.booking_calendar_connection_save(uuid, text, text, text, jsonb) to authenticated;

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
    and coalesce(private.has_company_permission(p_company_id, 'booking.integration.manage'), false)
  order by connection.provider;
$$;

revoke all on function public.booking_calendar_connections(uuid) from public, anon;
grant execute on function public.booking_calendar_connections(uuid) to authenticated;

create or replace function public.booking_widget_config_get(p_slug text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'available', settings.public_enabled and coalesce(settings.public_widget_enabled, false),
    'companyId', settings.company_id,
    'slug', settings.public_slug,
    'theme', coalesce(config.theme, '{}'::jsonb),
    'language', coalesce(config.language, 'en'),
    'serviceId', config.service_id,
    'locationId', config.location_id,
    'staffId', config.staff_id,
    'allowedOrigins', coalesce(config.allowed_origins, settings.public_widget_allowed_origins, '{}')
  )
  from public.booking_settings settings
  left join public.booking_widget_configs config on config.company_id = settings.company_id
  where settings.public_slug = lower(trim(p_slug));
$$;

revoke all on function public.booking_widget_config_get(text) from public;
grant execute on function public.booking_widget_config_get(text) to anon, authenticated;

create or replace function public.booking_widget_config_save(
  p_company_id uuid,
  p_enabled boolean,
  p_service_id uuid default null,
  p_location_id uuid default null,
  p_staff_id uuid default null,
  p_theme jsonb default '{}'::jsonb,
  p_language text default 'en',
  p_allowed_origins text[] default '{}'
)
returns public.booking_widget_configs
language plpgsql
security definer
set search_path = ''
as $$
declare
  result_row public.booking_widget_configs;
begin
  if not public.can_access_company(p_company_id) or not coalesce(private.has_company_permission(p_company_id, 'booking.integration.manage'), false) then raise exception 'You do not have permission to manage the booking widget' using errcode = '42501'; end if;
  if p_service_id is not null and not exists (select 1 from public.booking_services service where service.company_id = p_company_id and service.id = p_service_id) then raise exception 'The selected widget service does not belong to this organization' using errcode = '42501'; end if;
  insert into public.booking_widget_configs(company_id, enabled, service_id, location_id, staff_id, theme, language, allowed_origins, updated_by)
  values (p_company_id, coalesce(p_enabled, false), p_service_id, p_location_id, p_staff_id, coalesce(p_theme, '{}'::jsonb), coalesce(nullif(trim(p_language), ''), 'en'), coalesce(p_allowed_origins, '{}'), (select auth.uid()))
  on conflict (company_id) do update set enabled = excluded.enabled, service_id = excluded.service_id, location_id = excluded.location_id, staff_id = excluded.staff_id, theme = excluded.theme, language = excluded.language, allowed_origins = excluded.allowed_origins, updated_by = excluded.updated_by, updated_at = now()
  returning * into result_row;
  update public.booking_settings set public_widget_enabled = coalesce(p_enabled, false), public_widget_allowed_origins = coalesce(p_allowed_origins, '{}'), updated_at = now(), updated_by = (select auth.uid()) where company_id = p_company_id;
  return result_row;
end;
$$;

revoke all on function public.booking_widget_config_save(uuid, boolean, uuid, uuid, uuid, jsonb, text, text[]) from public, anon;
grant execute on function public.booking_widget_config_save(uuid, boolean, uuid, uuid, uuid, jsonb, text, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Tenant isolation and explicit grants for every new table.
-- ---------------------------------------------------------------------------

alter table public.booking_packages enable row level security;
alter table public.booking_package_services enable row level security;
alter table public.booking_customer_packages enable row level security;
alter table public.booking_package_usage enable row level security;
alter table public.booking_form_templates enable row level security;
alter table public.booking_form_fields enable row level security;
alter table public.booking_form_responses enable row level security;
alter table public.booking_resource_allocations enable row level security;
alter table public.booking_checkins enable row level security;
alter table public.booking_commission_rules enable row level security;
alter table public.booking_commissions enable row level security;
alter table public.booking_reminder_rules enable row level security;
alter table public.booking_portal_tokens enable row level security;
alter table public.booking_calendar_connections enable row level security;
alter table public.booking_calendar_events enable row level security;
alter table public.booking_widget_configs enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'booking_packages', 'booking_package_services', 'booking_customer_packages',
    'booking_package_usage', 'booking_form_templates', 'booking_form_fields',
    'booking_form_responses', 'booking_resource_allocations', 'booking_checkins',
    'booking_commission_rules', 'booking_commissions', 'booking_reminder_rules',
    'booking_portal_tokens', 'booking_calendar_connections', 'booking_calendar_events',
    'booking_widget_configs'
  ] loop
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
  end loop;
end;
$$;

create policy booking_growth_packages_manage on public.booking_packages
  for all to authenticated
  using (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.package.manage'), false))
  with check (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.package.manage'), false));

create policy booking_growth_package_services_manage on public.booking_package_services
  for all to authenticated
  using (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.package.manage'), false))
  with check (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.package.manage'), false));

create policy booking_growth_customer_packages_read on public.booking_customer_packages
  for select to authenticated
  using (public.can_access_company(company_id) and (coalesce(private.has_company_permission(company_id, 'customer.read'), false) or coalesce(private.has_company_permission(company_id, 'booking.package.manage'), false)));

create policy booking_growth_package_usage_read on public.booking_package_usage
  for select to authenticated
  using (public.can_access_company(company_id) and (coalesce(private.has_company_permission(company_id, 'customer.read'), false) or coalesce(private.has_company_permission(company_id, 'booking.package.manage'), false)));

create policy booking_growth_form_templates_manage on public.booking_form_templates
  for all to authenticated
  using (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.forms.manage'), false))
  with check (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.forms.manage'), false));

create policy booking_growth_form_fields_manage on public.booking_form_fields
  for all to authenticated
  using (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.forms.manage'), false))
  with check (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.forms.manage'), false));

create policy booking_growth_form_responses_read on public.booking_form_responses
  for select to authenticated
  using (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.read'), false));

create policy booking_growth_resource_allocations_manage on public.booking_resource_allocations
  for all to authenticated
  using (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.update'), false))
  with check (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.update'), false));

create policy booking_growth_checkins_read on public.booking_checkins
  for select to authenticated
  using (public.can_access_company(company_id) and (coalesce(private.has_company_permission(company_id, 'booking.checkin'), false) or coalesce(private.has_company_permission(company_id, 'booking.read'), false)));

create policy booking_growth_commission_rules_manage on public.booking_commission_rules
  for all to authenticated
  using (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.commission.manage'), false))
  with check (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.commission.manage'), false));

create policy booking_growth_commissions_read on public.booking_commissions
  for select to authenticated
  using (public.can_access_company(company_id) and (coalesce(private.has_company_permission(company_id, 'booking.commission.manage'), false) or coalesce(private.has_company_permission(company_id, 'payment.read'), false)));

create policy booking_growth_reminder_rules_manage on public.booking_reminder_rules
  for all to authenticated
  using (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.settings.manage'), false))
  with check (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.settings.manage'), false));

create policy booking_growth_calendar_connections_read on public.booking_calendar_connections
  for select to authenticated
  using (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.integration.manage'), false));

create policy booking_growth_calendar_events_read on public.booking_calendar_events
  for select to authenticated
  using (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.integration.manage'), false));

create policy booking_growth_widget_configs_read on public.booking_widget_configs
  for select to authenticated
  using (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.integration.manage'), false));

grant select on public.booking_packages, public.booking_package_services,
  public.booking_customer_packages, public.booking_package_usage,
  public.booking_form_templates, public.booking_form_fields,
  public.booking_form_responses, public.booking_resource_allocations,
  public.booking_checkins, public.booking_commission_rules,
  public.booking_commissions, public.booking_reminder_rules,
  public.booking_calendar_connections, public.booking_calendar_events,
  public.booking_widget_configs to authenticated;

grant insert, update, delete on public.booking_packages, public.booking_package_services,
  public.booking_form_templates, public.booking_form_fields,
  public.booking_resource_allocations, public.booking_commission_rules,
  public.booking_reminder_rules to authenticated;

comment on table public.booking_portal_tokens is 'Hashed, expiring customer portal credentials. Access only through booking_portal_* security-definer commands.';
comment on table public.booking_commissions is 'Booking commissions are earned by lifecycle/payment rules; this is not a payroll ledger.';
comment on table public.booking_calendar_connections is 'Provider-neutral calendar connection metadata. OAuth secrets must remain in the integration worker secret store.';
