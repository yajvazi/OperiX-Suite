-- OperiX Booking foundation.
--
-- Booking is deliberately additive: it reuses companies, memberships, profiles,
-- clients, employees, Supabase Auth, and the existing permission primitive.
-- Direct booking writes go through security-definer commands below so web and
-- mobile share validation, pricing, availability, and transition rules.

create extension if not exists btree_gist with schema extensions;

alter table public.clients add column if not exists company_name text;
alter table public.clients add column if not exists company text;

create table if not exists public.booking_service_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  color text not null default '#004FFE',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (company_id, id),
  unique (company_id, slug)
);

create table if not exists public.booking_locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  address text,
  phone text,
  email text,
  timezone text not null default 'UTC',
  latitude numeric,
  longitude numeric,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, name)
);

create table if not exists public.booking_services (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  category_id uuid,
  name text not null,
  description text,
  duration_minutes integer not null default 60 check (duration_minutes > 0),
  price numeric(20,4) not null default 0 check (price >= 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  tax_rate numeric(8,4) not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  deposit_type text not null default 'none' check (deposit_type in ('none', 'fixed', 'percentage')),
  deposit_value numeric(20,4) not null default 0 check (deposit_value >= 0),
  buffer_before_minutes integer not null default 0 check (buffer_before_minutes >= 0),
  buffer_after_minutes integer not null default 0 check (buffer_after_minutes >= 0),
  min_participants integer not null default 1 check (min_participants > 0),
  max_participants integer not null default 1 check (max_participants >= min_participants),
  min_notice_minutes integer not null default 0 check (min_notice_minutes >= 0),
  max_advance_days integer not null default 365 check (max_advance_days > 0),
  cancellation_policy jsonb not null default '{}'::jsonb,
  booking_rules jsonb not null default '{}'::jsonb,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (company_id, id),
  foreign key (company_id, category_id)
    references public.booking_service_categories(company_id, id) on delete set null
);

create table if not exists public.booking_resources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid,
  name text not null,
  resource_type text not null default 'resource',
  description text,
  capacity integer not null default 1 check (capacity > 0),
  status text not null default 'active' check (status in ('active', 'unavailable', 'maintenance')),
  price_override numeric(20,4) check (price_override is null or price_override >= 0),
  photos jsonb not null default '[]'::jsonb,
  internal_notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, location_id)
    references public.booking_locations(company_id, id) on delete set null
);

create table if not exists public.booking_staff (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  display_name text not null,
  role_title text,
  booking_limits jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id)
);

create table if not exists public.booking_staff_services (
  company_id uuid not null references public.companies(id) on delete cascade,
  staff_id uuid not null,
  service_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (company_id, staff_id, service_id),
  foreign key (company_id, staff_id) references public.booking_staff(company_id, id) on delete cascade,
  foreign key (company_id, service_id) references public.booking_services(company_id, id) on delete cascade
);

create table if not exists public.booking_resource_services (
  company_id uuid not null references public.companies(id) on delete cascade,
  resource_id uuid not null,
  service_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (company_id, resource_id, service_id),
  foreign key (company_id, resource_id) references public.booking_resources(company_id, id) on delete cascade,
  foreign key (company_id, service_id) references public.booking_services(company_id, id) on delete cascade
);

create table if not exists public.booking_working_hours (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  scope_type text not null check (scope_type in ('organization', 'location', 'staff', 'resource')),
  location_id uuid,
  staff_id uuid,
  resource_id uuid,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  is_active boolean not null default true,
  check (end_time > start_time),
  foreign key (company_id, location_id) references public.booking_locations(company_id, id) on delete cascade,
  foreign key (company_id, staff_id) references public.booking_staff(company_id, id) on delete cascade,
  foreign key (company_id, resource_id) references public.booking_resources(company_id, id) on delete cascade,
  check (
    (scope_type = 'organization' and location_id is null and staff_id is null and resource_id is null)
    or (scope_type = 'location' and location_id is not null and staff_id is null and resource_id is null)
    or (scope_type = 'staff' and staff_id is not null and location_id is null and resource_id is null)
    or (scope_type = 'resource' and resource_id is not null and location_id is null and staff_id is null)
  )
);

create table if not exists public.booking_availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  scope_type text not null check (scope_type in ('organization', 'location', 'staff', 'resource')),
  location_id uuid,
  staff_id uuid,
  resource_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_available boolean not null default false,
  reason text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  foreign key (company_id, location_id) references public.booking_locations(company_id, id) on delete cascade,
  foreign key (company_id, staff_id) references public.booking_staff(company_id, id) on delete cascade,
  foreign key (company_id, resource_id) references public.booking_resources(company_id, id) on delete cascade
);

create table if not exists public.booking_blocked_times (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  scope_type text not null check (scope_type in ('organization', 'location', 'staff', 'resource')),
  location_id uuid,
  staff_id uuid,
  resource_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null default 'Unavailable',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  foreign key (company_id, location_id) references public.booking_locations(company_id, id) on delete cascade,
  foreign key (company_id, staff_id) references public.booking_staff(company_id, id) on delete cascade,
  foreign key (company_id, resource_id) references public.booking_resources(company_id, id) on delete cascade
);

create table if not exists public.booking_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  timezone text not null default 'UTC',
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  time_format text not null default '24h' check (time_format in ('12h', '24h')),
  date_format text not null default 'dd MMM yyyy',
  first_day_of_week smallint not null default 1 check (first_day_of_week between 0 and 6),
  auto_confirm boolean not null default true,
  require_customer_email boolean not null default false,
  require_customer_phone boolean not null default false,
  allow_customer_cancellation boolean not null default true,
  allow_customer_rescheduling boolean not null default true,
  cancellation_cutoff_minutes integer not null default 120 check (cancellation_cutoff_minutes >= 0),
  reschedule_cutoff_minutes integer not null default 120 check (reschedule_cutoff_minutes >= 0),
  minimum_booking_notice_minutes integer not null default 0 check (minimum_booking_notice_minutes >= 0),
  maximum_advance_booking_days integer not null default 365 check (maximum_advance_booking_days > 0),
  public_enabled boolean not null default false,
  public_slug text unique,
  public_description text,
  public_logo_url text,
  public_primary_color text not null default '#004FFE',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.booking_recurring_series (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  recurrence_rule text not null,
  starts_on date not null,
  ends_on date,
  timezone text not null default 'UTC',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  booking_number text not null,
  customer_id uuid references public.clients(id) on delete set null,
  guest_name text,
  guest_email text,
  guest_phone text,
  service_id uuid not null,
  location_id uuid,
  resource_id uuid,
  staff_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'UTC',
  duration_minutes integer not null check (duration_minutes > 0),
  quantity integer not null default 1 check (quantity > 0),
  participant_count integer not null default 1 check (participant_count > 0),
  price numeric(20,4) not null default 0 check (price >= 0),
  discount_amount numeric(20,4) not null default 0 check (discount_amount >= 0),
  tax_amount numeric(20,4) not null default 0 check (tax_amount >= 0),
  deposit_amount numeric(20,4) not null default 0 check (deposit_amount >= 0),
  total_amount numeric(20,4) not null default 0 check (total_amount >= 0),
  paid_amount numeric(20,4) not null default 0 check (paid_amount >= 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'partially_paid', 'paid', 'refunded', 'partially_refunded', 'failed')),
  status text not null default 'draft' check (status in ('draft', 'pending', 'confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show', 'rescheduled')),
  notes text,
  internal_notes text,
  customer_notes text,
  source text not null default 'admin' check (source in ('admin', 'public', 'mobile', 'import', 'api')),
  recurrence_rule text,
  recurrence_series_id uuid references public.booking_recurring_series(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, booking_number),
  unique (company_id, id),
  check (ends_at > starts_at),
  check (customer_id is not null or nullif(trim(coalesce(guest_name, '')), '') is not null),
  foreign key (company_id, service_id) references public.booking_services(company_id, id) on delete restrict,
  foreign key (company_id, location_id) references public.booking_locations(company_id, id) on delete restrict,
  foreign key (company_id, resource_id) references public.booking_resources(company_id, id) on delete restrict,
  foreign key (company_id, staff_id) references public.booking_staff(company_id, id) on delete restrict
);

create table if not exists public.booking_participants (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  booking_id uuid not null,
  customer_id uuid references public.clients(id) on delete set null,
  name text not null,
  email text,
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  foreign key (company_id, booking_id) references public.bookings(company_id, id) on delete cascade
);

create table if not exists public.booking_status_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  booking_id uuid not null,
  from_status text,
  to_status text not null,
  reason text,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (company_id, booking_id) references public.bookings(company_id, id) on delete cascade
);

create table if not exists public.booking_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  booking_id uuid not null,
  amount numeric(20,4) not null check (amount > 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  method text not null check (method in ('cash', 'card', 'bank_transfer', 'online', 'manual')),
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'refunded', 'partially_refunded')),
  provider text,
  provider_payment_id text,
  metadata jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (company_id, booking_id) references public.bookings(company_id, id) on delete cascade
);

create table if not exists public.booking_waitlist (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid references public.clients(id) on delete set null,
  guest_name text,
  guest_email text,
  service_id uuid not null,
  staff_id uuid,
  preferred_from timestamptz,
  preferred_to timestamptz,
  preferred_time_start time,
  preferred_time_end time,
  priority integer not null default 0,
  status text not null default 'active' check (status in ('active', 'offered', 'booked', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  foreign key (company_id, service_id) references public.booking_services(company_id, id) on delete cascade,
  foreign key (company_id, staff_id) references public.booking_staff(company_id, id) on delete set null,
  check (customer_id is not null or nullif(trim(coalesce(guest_name, '')), '') is not null)
);

create table if not exists public.booking_reminders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  booking_id uuid not null,
  minutes_before integer not null check (minutes_before >= 0),
  channel text not null check (channel in ('in_app', 'push', 'email', 'sms')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (booking_id, minutes_before, channel),
  foreign key (company_id, booking_id) references public.bookings(company_id, id) on delete cascade
);

create table if not exists public.booking_notification_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete cascade,
  event_type text not null,
  channel text not null,
  recipient text,
  delivery_key text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'delivered', 'failed', 'skipped')),
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, delivery_key, channel)
);

create table if not exists public.booking_audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  booking_id uuid,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (company_id, booking_id) references public.bookings(company_id, id) on delete cascade
);

create table if not exists public.booking_public_attempts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  public_slug text not null,
  ip_hash text not null,
  guest_email text,
  created_at timestamptz not null default now()
);

create index if not exists booking_bookings_calendar_idx on public.bookings (company_id, starts_at, ends_at, status);
create index if not exists booking_bookings_resources_idx on public.bookings (company_id, resource_id, starts_at, ends_at);
create index if not exists booking_bookings_staff_idx on public.bookings (company_id, staff_id, starts_at, ends_at);
create index if not exists booking_bookings_customer_idx on public.bookings (company_id, customer_id, starts_at desc);
create index if not exists booking_bookings_location_idx on public.bookings (company_id, location_id, starts_at);
create index if not exists booking_bookings_status_idx on public.bookings (company_id, status, starts_at);
create index if not exists booking_working_hours_scope_idx on public.booking_working_hours (company_id, scope_type, weekday, is_active);
create index if not exists booking_blocked_times_range_idx on public.booking_blocked_times using gist (company_id, tstzrange(starts_at, ends_at, '[)'));
create index if not exists booking_audit_booking_idx on public.booking_audit_log (company_id, booking_id, created_at desc);
create index if not exists booking_waitlist_lookup_idx on public.booking_waitlist (company_id, service_id, status, priority desc, created_at);
create unique index if not exists booking_payments_provider_reference_unique
  on public.booking_payments (company_id, provider, provider_payment_id)
  where provider_payment_id is not null;

create or replace function private.booking_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists booking_services_touch_updated_at on public.booking_services;
create trigger booking_services_touch_updated_at before update on public.booking_services for each row execute function private.booking_touch_updated_at();
drop trigger if exists booking_locations_touch_updated_at on public.booking_locations;
create trigger booking_locations_touch_updated_at before update on public.booking_locations for each row execute function private.booking_touch_updated_at();
drop trigger if exists booking_resources_touch_updated_at on public.booking_resources;
create trigger booking_resources_touch_updated_at before update on public.booking_resources for each row execute function private.booking_touch_updated_at();
drop trigger if exists booking_staff_touch_updated_at on public.booking_staff;
create trigger booking_staff_touch_updated_at before update on public.booking_staff for each row execute function private.booking_touch_updated_at();
drop trigger if exists booking_bookings_touch_updated_at on public.bookings;
create trigger booking_bookings_touch_updated_at before update on public.bookings for each row execute function private.booking_touch_updated_at();

create sequence if not exists public.booking_reference_seq;

create or replace function public.booking_next_number()
returns text
language sql
security definer
set search_path = ''
as $$
  select 'BK-' || to_char(now() at time zone 'UTC', 'YYYY') || '-' || lpad(nextval('public.booking_reference_seq')::text, 6, '0');
$$;

revoke all on function public.booking_next_number() from public;
grant execute on function public.booking_next_number() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Booking permissions and helper functions
-- ---------------------------------------------------------------------------

insert into public.app_permissions (code, name, category, description, is_sensitive)
values
  ('booking.read', 'View bookings', 'booking', 'View bookings and booking details.', false),
  ('booking.create', 'Create bookings', 'booking', 'Create reservations and waitlist entries.', false),
  ('booking.update', 'Update bookings', 'booking', 'Edit, reschedule, and transition bookings.', false),
  ('booking.cancel', 'Cancel bookings', 'booking', 'Cancel reservations and record reasons.', true),
  ('calendar.read', 'View booking calendar', 'booking', 'View booking schedules and availability.', false),
  ('calendar.manage', 'Manage booking calendar', 'booking', 'Block time and move reservations.', true),
  ('customer.read', 'View booking customers', 'booking', 'View customer booking information.', false),
  ('customer.manage', 'Manage booking customers', 'booking', 'Create and update booking customers.', false),
  ('service.read', 'View booking services', 'booking', 'View services and pricing.', false),
  ('service.manage', 'Manage booking services', 'booking', 'Create and update services.', true),
  ('resource.read', 'View booking resources', 'booking', 'View rooms, vehicles, equipment, and resources.', false),
  ('resource.manage', 'Manage booking resources', 'booking', 'Create and update resources.', true),
  ('staff.read', 'View booking staff', 'booking', 'View booking providers and schedules.', false),
  ('staff.manage', 'Manage booking staff', 'booking', 'Manage booking provider profiles.', true),
  ('payment.read', 'View booking payments', 'booking', 'View payment status and booking balances.', true),
  ('payment.manage', 'Manage booking payments', 'booking', 'Record booking payments.', true),
  ('payment.refund', 'Refund booking payments', 'booking', 'Refund booking payments.', true),
  ('report.read', 'View booking reports', 'booking', 'View operational booking reports.', false),
  ('audit.view', 'View booking audit log', 'booking', 'View sensitive booking change history.', true),
  ('booking.settings.manage', 'Manage booking settings', 'booking', 'Manage booking rules, public booking, and availability.', true)
on conflict (code) do update set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  is_sensitive = excluded.is_sensitive;

insert into public.app_roles (company_id, code, name, description, is_system)
values
  (null, 'booking_admin', 'Booking administrator', 'Full Booking administration.', true),
  (null, 'booking_manager', 'Booking manager', 'Manage schedules, customers, services, and resources.', true),
  (null, 'booking_receptionist', 'Booking receptionist', 'Create and manage front-desk bookings.', true),
  (null, 'booking_staff', 'Booking staff member', 'Manage assigned bookings and personal availability.', true),
  (null, 'booking_finance', 'Booking finance', 'View and manage booking payments and reports.', true)
on conflict (code) where company_id is null do update set
  name = excluded.name,
  description = excluded.description,
  is_system = true;

insert into public.app_role_permissions (role_id, permission_code)
select role.id, permission.code
from public.app_roles role
cross join public.app_permissions permission
where role.company_id is null
  and role.code = 'booking_admin'
  and permission.category = 'booking'
on conflict do nothing;

with grants(role_code, permission_code) as (
  values
    ('booking_manager', 'booking.read'), ('booking_manager', 'booking.create'),
    ('booking_manager', 'booking.update'), ('booking_manager', 'booking.cancel'),
    ('booking_manager', 'calendar.read'), ('booking_manager', 'calendar.manage'),
    ('booking_manager', 'customer.read'), ('booking_manager', 'customer.manage'),
    ('booking_manager', 'service.read'), ('booking_manager', 'service.manage'),
    ('booking_manager', 'resource.read'), ('booking_manager', 'resource.manage'),
    ('booking_manager', 'staff.read'), ('booking_manager', 'report.read'),
    ('booking_receptionist', 'booking.read'), ('booking_receptionist', 'booking.create'),
    ('booking_receptionist', 'booking.update'), ('booking_receptionist', 'calendar.read'),
    ('booking_receptionist', 'customer.read'), ('booking_receptionist', 'customer.manage'),
    ('booking_receptionist', 'service.read'), ('booking_receptionist', 'resource.read'),
    ('booking_receptionist', 'staff.read'),
    ('booking_staff', 'booking.read'), ('booking_staff', 'booking.update'),
    ('booking_staff', 'calendar.read'), ('booking_staff', 'customer.read'),
    ('booking_manager', 'audit.view'),
    ('booking_finance', 'booking.read'), ('booking_finance', 'payment.read'),
    ('booking_finance', 'payment.manage'), ('booking_finance', 'payment.refund'),
    ('booking_finance', 'report.read')
)
insert into public.app_role_permissions (role_id, permission_code)
select role.id, grants.permission_code
from grants
join public.app_roles role on role.code = grants.role_code and role.company_id is null
on conflict do nothing;

create or replace function public.booking_has_permission(p_company_id uuid, p_permission text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select coalesce(public.can_access_company(p_company_id), false)
    and coalesce(private.has_company_permission(p_company_id, p_permission), false);
$$;

revoke all on function public.booking_has_permission(uuid, text) from public, anon;
grant execute on function public.booking_has_permission(uuid, text) to authenticated;

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
  location_row public.booking_locations;
  resource_row public.booking_resources;
  staff_row public.booking_staff;
  settings_row public.booking_settings;
  slot_start timestamptz;
  slot_end timestamptz;
  local_start timestamp;
  local_end timestamp;
  weekday_value integer;
  scope_has_hours boolean;
  resource_load integer;
begin
  if p_company_id is null or p_service_id is null or p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    return false;
  end if;

  select * into service_row
  from public.booking_services
  where id = p_service_id and company_id = p_company_id and is_active;
  if not found then return false; end if;

  select * into settings_row from public.booking_settings where company_id = p_company_id;
  if greatest(coalesce(p_participant_count, 1), 1) < service_row.min_participants
    or greatest(coalesce(p_participant_count, 1), 1) > service_row.max_participants then
    return false;
  end if;
  if p_starts_at < now() + make_interval(mins => greatest(coalesce(service_row.min_notice_minutes, 0), coalesce(settings_row.minimum_booking_notice_minutes, 0)))
    or p_starts_at > now() + make_interval(days => coalesce(service_row.max_advance_days, settings_row.maximum_advance_booking_days, 365)) then
    return false;
  end if;
  local_start := p_starts_at at time zone coalesce(settings_row.timezone, 'UTC');
  local_end := p_ends_at at time zone coalesce(settings_row.timezone, 'UTC');
  weekday_value := extract(dow from local_start)::integer;
  slot_start := p_starts_at - make_interval(mins => coalesce(service_row.buffer_before_minutes, 0));
  slot_end := p_ends_at + make_interval(mins => coalesce(service_row.buffer_after_minutes, 0));

  if p_location_id is not null then
    select * into location_row from public.booking_locations where id = p_location_id and company_id = p_company_id and is_active;
    if not found then return false; end if;
  end if;
  if p_resource_id is not null then
    select * into resource_row from public.booking_resources where id = p_resource_id and company_id = p_company_id and is_active and status = 'active';
    if not found then return false; end if;
    if resource_row.location_id is not null and p_location_id is not null and resource_row.location_id <> p_location_id then return false; end if;
  end if;
  if p_staff_id is not null then
    select * into staff_row from public.booking_staff where id = p_staff_id and company_id = p_company_id and is_active;
    if not found then return false; end if;
    if staff_row.employee_id is not null and exists (
      select 1 from public.leave_requests leave
      where leave.employee_id = staff_row.employee_id
        and leave.company_id = p_company_id
        and leave.status = 'approved'
        and leave.start_date <= local_end::date
        and leave.end_date >= local_start::date
    ) then return false; end if;
  end if;

  -- A missing working-hours row means the organization has not configured
  -- hours yet. In that case the default is open; configured rows are strict.
  select exists (
    select 1 from public.booking_working_hours hours
    where hours.company_id = p_company_id and hours.scope_type = 'organization'
      and hours.weekday = weekday_value and hours.is_active
  ) into scope_has_hours;
  if scope_has_hours and not exists (
    select 1 from public.booking_working_hours hours
    where hours.company_id = p_company_id and hours.scope_type = 'organization'
      and hours.weekday = weekday_value and hours.is_active
      and local_start::time >= hours.start_time and local_end::time <= hours.end_time
  ) then return false; end if;

  if p_location_id is not null then
    select exists (
      select 1 from public.booking_working_hours hours
      where hours.company_id = p_company_id and hours.scope_type = 'location'
        and hours.location_id = p_location_id and hours.weekday = weekday_value and hours.is_active
    ) into scope_has_hours;
    if scope_has_hours and not exists (
      select 1 from public.booking_working_hours hours
      where hours.company_id = p_company_id and hours.scope_type = 'location'
        and hours.location_id = p_location_id and hours.weekday = weekday_value and hours.is_active
        and local_start::time >= hours.start_time and local_end::time <= hours.end_time
    ) then return false; end if;
  end if;
  if p_staff_id is not null then
    select exists (
      select 1 from public.booking_working_hours hours
      where hours.company_id = p_company_id and hours.scope_type = 'staff'
        and hours.staff_id = p_staff_id and hours.weekday = weekday_value and hours.is_active
    ) into scope_has_hours;
    if scope_has_hours and not exists (
      select 1 from public.booking_working_hours hours
      where hours.company_id = p_company_id and hours.scope_type = 'staff'
        and hours.staff_id = p_staff_id and hours.weekday = weekday_value and hours.is_active
        and local_start::time >= hours.start_time and local_end::time <= hours.end_time
    ) then return false; end if;
  end if;
  if p_resource_id is not null then
    select exists (
      select 1 from public.booking_working_hours hours
      where hours.company_id = p_company_id and hours.scope_type = 'resource'
        and hours.resource_id = p_resource_id and hours.weekday = weekday_value and hours.is_active
    ) into scope_has_hours;
    if scope_has_hours and not exists (
      select 1 from public.booking_working_hours hours
      where hours.company_id = p_company_id and hours.scope_type = 'resource'
        and hours.resource_id = p_resource_id and hours.weekday = weekday_value and hours.is_active
        and local_start::time >= hours.start_time and local_end::time <= hours.end_time
    ) then return false; end if;
  end if;

  if exists (
    select 1 from public.booking_blocked_times blocked
    where blocked.company_id = p_company_id
      and (blocked.scope_type = 'organization'
        or (blocked.scope_type = 'location' and blocked.location_id = p_location_id)
        or (blocked.scope_type = 'staff' and blocked.staff_id = p_staff_id)
        or (blocked.scope_type = 'resource' and blocked.resource_id = p_resource_id))
      and blocked.starts_at < slot_end and blocked.ends_at > slot_start
  ) then return false; end if;

  if exists (
    select 1 from public.booking_availability_exceptions exception_row
    where exception_row.company_id = p_company_id
      and not exception_row.is_available
      and (exception_row.scope_type = 'organization'
        or (exception_row.scope_type = 'location' and exception_row.location_id = p_location_id)
        or (exception_row.scope_type = 'staff' and exception_row.staff_id = p_staff_id)
        or (exception_row.scope_type = 'resource' and exception_row.resource_id = p_resource_id))
      and exception_row.starts_at < slot_end and exception_row.ends_at > slot_start
  ) then return false; end if;

  if p_resource_id is not null then
    select coalesce(sum(coalesce(existing.participant_count, 1)), 0)::integer into resource_load
    from public.bookings existing
    join public.booking_services existing_service on existing_service.id = existing.service_id and existing_service.company_id = existing.company_id
    where existing.company_id = p_company_id and existing.resource_id = p_resource_id
      and existing.id is distinct from p_ignore_booking_id
      and existing.status in ('pending', 'confirmed', 'checked_in', 'in_progress', 'rescheduled')
      and (existing.starts_at - make_interval(mins => coalesce(existing_service.buffer_before_minutes, 0))) < slot_end
      and (existing.ends_at + make_interval(mins => coalesce(existing_service.buffer_after_minutes, 0))) > slot_start;
    if resource_load + greatest(coalesce(p_participant_count, 1), 1) > resource_row.capacity then return false; end if;
  end if;

  if p_staff_id is not null then
    if exists (
      select 1
      from public.bookings existing
      join public.booking_services existing_service on existing_service.id = existing.service_id and existing_service.company_id = existing.company_id
      where existing.company_id = p_company_id and existing.staff_id = p_staff_id
        and existing.id is distinct from p_ignore_booking_id
        and existing.status in ('pending', 'confirmed', 'checked_in', 'in_progress', 'rescheduled')
        and (existing.starts_at - make_interval(mins => coalesce(existing_service.buffer_before_minutes, 0))) < slot_end
        and (existing.ends_at + make_interval(mins => coalesce(existing_service.buffer_after_minutes, 0))) > slot_start
    ) then return false; end if;
  end if;

  if p_location_id is not null then
    if exists (
      select 1 from public.bookings existing
      where existing.company_id = p_company_id and existing.location_id = p_location_id
        and existing.id is distinct from p_ignore_booking_id
        and existing.status in ('pending', 'confirmed', 'checked_in', 'in_progress', 'rescheduled')
        and existing.starts_at < slot_end and existing.ends_at > slot_start
    ) then return false; end if;
  end if;

  if p_resource_id is null and p_staff_id is null and p_location_id is null then
    if exists (
      select 1 from public.bookings existing
      where existing.company_id = p_company_id
        and existing.id is distinct from p_ignore_booking_id
        and existing.status in ('pending', 'confirmed', 'checked_in', 'in_progress', 'rescheduled')
        and existing.starts_at < slot_end and existing.ends_at > slot_start
    ) then return false; end if;
  end if;

  return true;
end;
$$;

revoke all on function private.booking_slot_is_available(uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, uuid) from public;
grant execute on function private.booking_slot_is_available(uuid, uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, uuid) to authenticated, service_role;

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
    when 'in_progress' then p_to in ('completed', 'cancelled')
    when 'rescheduled' then p_to in ('pending', 'confirmed', 'cancelled')
    else false
  end;
$$;

revoke all on function private.booking_can_transition(text, text) from public;
grant execute on function private.booking_can_transition(text, text) to authenticated, service_role;

create or replace function private.booking_create_core(
  p_company_id uuid,
  p_customer_id uuid,
  p_guest_name text,
  p_guest_email text,
  p_guest_phone text,
  p_service_id uuid,
  p_location_id uuid,
  p_resource_id uuid,
  p_staff_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_quantity integer,
  p_participant_count integer,
  p_requested_status text,
  p_notes text,
  p_internal_notes text,
  p_customer_notes text,
  p_source text,
  p_recurrence_rule text,
  p_recurrence_series_id uuid,
  p_is_public boolean default false,
  p_public_slug text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  service_row public.booking_services;
  location_row public.booking_locations;
  resource_row public.booking_resources;
  staff_row public.booking_staff;
  settings_row public.booking_settings;
  booking_row public.bookings;
  starts_value timestamptz := p_starts_at;
  ends_value timestamptz;
  unit_price numeric(20,4);
  subtotal_value numeric(20,4);
  discount_value numeric(20,4) := 0;
  tax_value numeric(20,4);
  total_value numeric(20,4);
  deposit_value numeric(20,4);
  booking_status text;
  booking_timezone text;
  lock_key text;
begin
  if not p_is_public then
    if actor_id is null then
      raise exception 'Authentication required' using errcode = '42501';
    end if;
    if p_company_id is null or not public.can_access_company(p_company_id) then
      raise exception 'You do not have access to this organization' using errcode = '42501';
    end if;
    if not coalesce(private.has_company_permission(p_company_id, 'booking.create'), false) then
      raise exception 'You do not have permission to create bookings' using errcode = '42501';
    end if;
  else
    if p_public_slug is null or length(trim(p_public_slug)) < 3 then
      raise exception 'A public booking identifier is required' using errcode = '22023';
    end if;
  end if;

  select * into settings_row from public.booking_settings where company_id = p_company_id;
  if p_is_public and (
    settings_row.public_enabled is distinct from true
    or settings_row.public_slug is distinct from lower(trim(p_public_slug))
  ) then
    raise exception 'Public booking is not available for this organization' using errcode = '42501';
  end if;

  select * into service_row
  from public.booking_services
  where id = p_service_id and company_id = p_company_id and is_active;
  if not found then raise exception 'The selected service is no longer available' using errcode = 'P0002'; end if;
  if p_quantity is null or p_quantity < 1 then raise exception 'Quantity must be at least one' using errcode = '22023'; end if;
  if p_participant_count is null or p_participant_count < service_row.min_participants or p_participant_count > service_row.max_participants then
    raise exception 'The participant count is outside this service capacity' using errcode = '22023';
  end if;

  if p_customer_id is not null then
    if not exists (select 1 from public.clients customer where customer.id = p_customer_id and customer.company_id = p_company_id) then
      raise exception 'The selected customer does not belong to this organization' using errcode = '42501';
    end if;
  elsif nullif(trim(coalesce(p_guest_name, '')), '') is null then
    raise exception 'A customer or guest name is required' using errcode = '22023';
  end if;

  if p_location_id is not null then
    select * into location_row from public.booking_locations where id = p_location_id and company_id = p_company_id and is_active;
    if not found then raise exception 'The selected location is no longer available' using errcode = 'P0002'; end if;
  end if;
  if p_resource_id is not null then
    select * into resource_row from public.booking_resources where id = p_resource_id and company_id = p_company_id and is_active and status = 'active';
    if not found then raise exception 'The selected resource is no longer available' using errcode = 'P0002'; end if;
    if resource_row.location_id is not null and p_location_id is not null and resource_row.location_id <> p_location_id then
      raise exception 'The selected resource belongs to another location' using errcode = '22023';
    end if;
    if exists (select 1 from public.booking_resource_services mapping where mapping.company_id = p_company_id and mapping.service_id = p_service_id)
       and not exists (select 1 from public.booking_resource_services mapping where mapping.company_id = p_company_id and mapping.service_id = p_service_id and mapping.resource_id = p_resource_id) then
      raise exception 'The selected resource cannot provide this service' using errcode = '22023';
    end if;
  end if;
  if p_staff_id is not null then
    select * into staff_row from public.booking_staff where id = p_staff_id and company_id = p_company_id and is_active;
    if not found then raise exception 'The selected staff member is unavailable' using errcode = 'P0002'; end if;
    if exists (select 1 from public.booking_staff_services mapping where mapping.company_id = p_company_id and mapping.service_id = p_service_id)
       and not exists (select 1 from public.booking_staff_services mapping where mapping.company_id = p_company_id and mapping.service_id = p_service_id and mapping.staff_id = p_staff_id) then
      raise exception 'The selected staff member cannot provide this service' using errcode = '22023';
    end if;
  end if;

  ends_value := coalesce(p_ends_at, starts_value + make_interval(mins => service_row.duration_minutes));
  if starts_value is null or ends_value <= starts_value then
    raise exception 'Booking end time must be after the start time' using errcode = '22023';
  end if;
  if starts_value < now() + make_interval(mins => greatest(coalesce(service_row.min_notice_minutes, 0), coalesce(settings_row.minimum_booking_notice_minutes, 0))) then
    raise exception 'This booking does not meet the minimum notice rule' using errcode = '22023';
  end if;
  if starts_value > now() + make_interval(days => coalesce(service_row.max_advance_days, settings_row.maximum_advance_booking_days, 365)) then
    raise exception 'This booking is outside the advance booking window' using errcode = '22023';
  end if;
  if coalesce(settings_row.require_customer_email, false) and nullif(trim(coalesce(p_guest_email, '')), '') is null and p_customer_id is null then
    raise exception 'A customer email address is required' using errcode = '22023';
  end if;
  if coalesce(settings_row.require_customer_phone, false) and nullif(trim(coalesce(p_guest_phone, '')), '') is null and p_customer_id is null then
    raise exception 'A customer phone number is required' using errcode = '22023';
  end if;

  -- Serialize availability checks per organization. This keeps simultaneous
  -- bookings safe even when two requests target different resources but share
  -- the same staff member or location.
  lock_key := p_company_id::text || ':availability';
  perform pg_advisory_xact_lock(hashtextextended(lock_key, 0));
  if not private.booking_slot_is_available(
    p_company_id, p_service_id, p_location_id, p_resource_id, p_staff_id,
    starts_value, ends_value, p_participant_count, null
  ) then
    raise exception 'This time slot is no longer available. Choose another time.' using errcode = '23P01';
  end if;

  unit_price := coalesce(resource_row.price_override, service_row.price);
  subtotal_value := round(unit_price * greatest(p_quantity, 1), 4);
  tax_value := round((subtotal_value - discount_value) * service_row.tax_rate / 100, 4);
  total_value := greatest(round(subtotal_value - discount_value + tax_value, 4), 0);
  deposit_value := case service_row.deposit_type
    when 'fixed' then least(total_value, round(service_row.deposit_value * greatest(p_quantity, 1), 4))
    when 'percentage' then least(total_value, round(total_value * service_row.deposit_value / 100, 4))
    else 0
  end;
  booking_status := lower(coalesce(p_requested_status, case when coalesce(settings_row.auto_confirm, true) then 'confirmed' else 'pending' end));
  if p_is_public and not coalesce(settings_row.auto_confirm, true) then booking_status := 'pending'; end if;
  if booking_status not in ('draft', 'pending', 'confirmed') then
    raise exception 'Bookings can only start as draft, pending, or confirmed' using errcode = '22023';
  end if;
  booking_timezone := coalesce(location_row.timezone, settings_row.timezone, 'UTC');

  insert into public.bookings (
    company_id, booking_number, customer_id, guest_name, guest_email, guest_phone,
    service_id, location_id, resource_id, staff_id, starts_at, ends_at, timezone,
    duration_minutes, quantity, participant_count, price, discount_amount, tax_amount,
    deposit_amount, total_amount, currency, status, notes, internal_notes,
    customer_notes, source, recurrence_rule, recurrence_series_id, created_by
  ) values (
    p_company_id, public.booking_next_number(), p_customer_id, nullif(trim(p_guest_name), ''),
    nullif(trim(p_guest_email), ''), nullif(trim(p_guest_phone), ''), p_service_id,
    p_location_id, p_resource_id, p_staff_id, starts_value, ends_value, booking_timezone,
    extract(epoch from (ends_value - starts_value))::integer / 60, greatest(p_quantity, 1),
    greatest(p_participant_count, 1), subtotal_value, discount_value, tax_value, deposit_value,
    total_value, coalesce(service_row.currency, settings_row.currency, 'EUR'), booking_status,
    p_notes, p_internal_notes, p_customer_notes,
    case when p_is_public then 'public' else coalesce(p_source, 'admin') end,
    p_recurrence_rule, p_recurrence_series_id, actor_id
  ) returning * into booking_row;

  insert into public.booking_status_history (company_id, booking_id, from_status, to_status, actor_user_id)
  values (p_company_id, booking_row.id, null, booking_status, actor_id);
  insert into public.booking_audit_log (company_id, booking_id, actor_user_id, action, entity, entity_id, after_data)
  values (p_company_id, booking_row.id, actor_id, 'booking.created', 'booking', booking_row.id, to_jsonb(booking_row));
  return booking_row;
end;
$$;

revoke all on function private.booking_create_core(uuid, uuid, text, text, text, uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, integer, text, text, text, text, text, text, uuid, boolean, text) from public;
grant execute on function private.booking_create_core(uuid, uuid, text, text, text, uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, integer, text, text, text, text, text, text, uuid, boolean, text) to authenticated, service_role;

create or replace function public.booking_create(
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
  p_recurrence_rule text default null,
  p_recurrence_series_id uuid default null
)
returns public.bookings
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return private.booking_create_core(
    p_company_id, p_customer_id, p_guest_name, p_guest_email, p_guest_phone,
    p_service_id, p_location_id, p_resource_id, p_staff_id, p_starts_at, p_ends_at,
    p_quantity, p_participant_count, p_requested_status, p_notes, p_internal_notes,
    p_customer_notes, p_source, p_recurrence_rule, p_recurrence_series_id, false, null
  );
end;
$$;

revoke all on function public.booking_create(uuid, uuid, text, text, text, uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, integer, text, text, text, text, text, text, uuid) from public, anon;
grant execute on function public.booking_create(uuid, uuid, text, text, text, uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, integer, text, text, text, text, text, text, uuid) to authenticated;

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
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_company_id is null or not public.can_access_company(p_company_id) then
    raise exception 'You do not have access to this organization' using errcode = '42501';
  end if;
  select * into booking_row from public.bookings where id = p_booking_id and company_id = p_company_id for update;
  if not found then raise exception 'Booking not found' using errcode = 'P0002'; end if;
  old_status := booking_row.status;
  if next_status = 'cancelled' then
    if not coalesce(private.has_company_permission(p_company_id, 'booking.cancel'), false) then
      raise exception 'You do not have permission to cancel this booking' using errcode = '42501';
    end if;
  elsif not coalesce(private.has_company_permission(p_company_id, 'booking.update'), false) then
    raise exception 'You do not have permission to update this booking' using errcode = '42501';
  end if;
  if not private.booking_can_transition(booking_row.status, next_status) then
    raise exception 'This booking cannot move from % to %', booking_row.status, next_status using errcode = '55000';
  end if;
  update public.bookings
  set status = next_status,
      updated_at = now()
  where id = booking_row.id
  returning * into booking_row;
  insert into public.booking_status_history (company_id, booking_id, from_status, to_status, reason, actor_user_id)
  values (p_company_id, booking_row.id, old_status, next_status, p_reason, actor_id);
  insert into public.booking_audit_log (company_id, booking_id, actor_user_id, action, entity, entity_id, details, after_data)
  values (p_company_id, booking_row.id, actor_id, 'booking.status_changed', 'booking', booking_row.id, jsonb_build_object('reason', p_reason, 'status', next_status), to_jsonb(booking_row));
  return booking_row;
end;
$$;

revoke all on function public.booking_transition(uuid, uuid, text, text) from public, anon;
grant execute on function public.booking_transition(uuid, uuid, text, text) to authenticated;

create or replace function public.booking_reschedule(
  p_company_id uuid,
  p_booking_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz default null,
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
  service_row public.booking_services;
  settings_row public.booking_settings;
  new_ends_at timestamptz;
  old_starts_at timestamptz;
  old_status text;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_company_id is null or not public.can_access_company(p_company_id) then
    raise exception 'You do not have access to this organization' using errcode = '42501';
  end if;
  if not coalesce(private.has_company_permission(p_company_id, 'booking.update'), false) then
    raise exception 'You do not have permission to reschedule bookings' using errcode = '42501';
  end if;
  select * into booking_row from public.bookings where id = p_booking_id and company_id = p_company_id for update;
  if not found then raise exception 'Booking not found' using errcode = 'P0002'; end if;
  if booking_row.status in ('cancelled', 'completed', 'no_show') then raise exception 'This booking cannot be rescheduled' using errcode = '55000'; end if;
  old_status := booking_row.status;
  select * into settings_row from public.booking_settings where company_id = p_company_id;
  if now() > booking_row.starts_at - make_interval(mins => coalesce(settings_row.reschedule_cutoff_minutes, 120)) then
    raise exception 'The booking cannot be rescheduled within the cutoff window' using errcode = '55000';
  end if;
  select * into service_row from public.booking_services where id = booking_row.service_id and company_id = p_company_id;
  new_ends_at := coalesce(p_ends_at, p_starts_at + make_interval(mins => service_row.duration_minutes));
  if new_ends_at <= p_starts_at then raise exception 'Booking end time must be after the start time' using errcode = '22023'; end if;
  old_starts_at := booking_row.starts_at;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':availability', 0));
  if not private.booking_slot_is_available(p_company_id, booking_row.service_id, booking_row.location_id, booking_row.resource_id, booking_row.staff_id, p_starts_at, new_ends_at, booking_row.participant_count, booking_row.id) then
    raise exception 'This time slot is no longer available. Choose another time.' using errcode = '23P01';
  end if;
  update public.bookings
  set starts_at = p_starts_at,
      ends_at = new_ends_at,
      duration_minutes = extract(epoch from (new_ends_at - p_starts_at))::integer / 60,
      status = case when old_status = 'confirmed' then 'rescheduled' else old_status end,
      updated_at = now()
  where id = booking_row.id
  returning * into booking_row;
  insert into public.booking_status_history (company_id, booking_id, from_status, to_status, reason, actor_user_id)
  values (p_company_id, booking_row.id, old_status, booking_row.status, p_reason, actor_id);
  insert into public.booking_audit_log (company_id, booking_id, actor_user_id, action, entity, entity_id, details, before_data, after_data)
  values (
    p_company_id, booking_row.id, actor_id, 'booking.rescheduled', 'booking', booking_row.id,
    jsonb_build_object('reason', p_reason, 'old_starts_at', old_starts_at, 'new_starts_at', p_starts_at),
    jsonb_build_object('starts_at', old_starts_at), jsonb_build_object('starts_at', booking_row.starts_at, 'ends_at', booking_row.ends_at)
  );
  return booking_row;
end;
$$;

revoke all on function public.booking_reschedule(uuid, uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.booking_reschedule(uuid, uuid, timestamptz, timestamptz, text) to authenticated;

create or replace function public.booking_reconcile_payment(
  p_company_id uuid,
  p_booking_id uuid,
  p_provider text,
  p_provider_payment_id text,
  p_amount numeric,
  p_currency text,
  p_status text,
  p_metadata jsonb default '{}'::jsonb
)
returns public.bookings
language plpgsql
security invoker
set search_path = ''
as $$
declare
  booking_row public.bookings;
  payment_id uuid;
  paid_total numeric(20,4);
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be positive' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_provider, '')), '') is null or nullif(trim(coalesce(p_provider_payment_id, '')), '') is null then
    raise exception 'A payment provider and provider reference are required' using errcode = '22023';
  end if;
  if lower(coalesce(p_status, '')) not in ('succeeded', 'failed', 'refunded', 'partially_refunded') then
    raise exception 'Unsupported payment status' using errcode = '22023';
  end if;
  select * into booking_row
  from public.bookings
  where company_id = p_company_id and id = p_booking_id
  for update;
  if not found then raise exception 'Booking not found' using errcode = 'P0002'; end if;
  if upper(coalesce(p_currency, '')) <> upper(coalesce(booking_row.currency, '')) then
    raise exception 'Payment currency does not match the booking currency' using errcode = '22023';
  end if;

  select id into payment_id
  from public.booking_payments
  where company_id = p_company_id
    and provider = p_provider
    and provider_payment_id = p_provider_payment_id
  for update;

  select coalesce(sum(case when payment.status = 'succeeded' then payment.amount else 0 end), 0)
  into paid_total
  from public.booking_payments payment
  where payment.company_id = p_company_id
    and payment.booking_id = p_booking_id
    and payment.id is distinct from payment_id;
  if lower(p_status) = 'succeeded' and paid_total + p_amount > booking_row.total_amount then
    raise exception 'Payment exceeds the booking balance' using errcode = '22023';
  end if;

  if payment_id is null then
    insert into public.booking_payments (
      company_id, booking_id, amount, currency, method, status, provider,
      provider_payment_id, metadata, paid_at
    )
    values (
      p_company_id, p_booking_id, p_amount, upper(p_currency), 'online',
      lower(p_status), p_provider, p_provider_payment_id, coalesce(p_metadata, '{}'::jsonb),
      case when lower(p_status) = 'succeeded' then now() else null end
    )
    returning id into payment_id;
  else
    update public.booking_payments
    set amount = p_amount,
        currency = upper(p_currency),
        status = lower(p_status),
        metadata = coalesce(p_metadata, '{}'::jsonb),
        paid_at = case when lower(p_status) = 'succeeded' then coalesce(paid_at, now()) else paid_at end
    where id = payment_id;
  end if;

  select coalesce(sum(case when payment.status = 'succeeded' then payment.amount else 0 end), 0)
  into paid_total
  from public.booking_payments payment
  where payment.company_id = p_company_id and payment.booking_id = p_booking_id;

  update public.bookings
  set paid_amount = least(total_amount, paid_total),
      payment_status = case
        when paid_total <= 0 then 'unpaid'
        when paid_total >= total_amount then 'paid'
        else 'partially_paid'
      end,
      updated_at = now()
  where company_id = p_company_id and id = p_booking_id
  returning * into booking_row;
  return booking_row;
end;
$$;

revoke all on function public.booking_reconcile_payment(uuid, uuid, text, text, numeric, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.booking_reconcile_payment(uuid, uuid, text, text, numeric, text, text, jsonb) to service_role;

create or replace function public.booking_get_available_slots(
  p_company_id uuid,
  p_service_id uuid,
  p_date date,
  p_location_id uuid default null,
  p_resource_id uuid default null,
  p_staff_id uuid default null,
  p_participant_count integer default 1,
  p_public_slug text default null
)
returns table (
  starts_at timestamptz,
  ends_at timestamptz,
  label text,
  available boolean,
  capacity_remaining integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  settings_row public.booking_settings;
  service_row public.booking_services;
  window_row record;
  slot_start timestamptz;
  slot_end timestamptz;
  local_date_start timestamp;
  service_window_count integer;
  cursor_start time;
  cursor_end time;
  working_hours_configured boolean;
begin
  select * into settings_row from public.booking_settings where company_id = p_company_id;
  if p_public_slug is not null then
    if settings_row.public_enabled is distinct from true or settings_row.public_slug is distinct from lower(trim(p_public_slug)) then
      raise exception 'Public booking is not available for this organization' using errcode = '42501';
    end if;
  elsif actor_id is null or not public.can_access_company(p_company_id) or not coalesce(private.has_company_permission(p_company_id, 'calendar.read'), false) then
    raise exception 'You do not have permission to view availability' using errcode = '42501';
  end if;
  select * into service_row from public.booking_services where id = p_service_id and company_id = p_company_id and is_active;
  if not found then raise exception 'The selected service is no longer available' using errcode = 'P0002'; end if;
  local_date_start := p_date::timestamp;

  select exists (
    select 1 from public.booking_working_hours hours
    where hours.company_id = p_company_id and hours.scope_type = 'organization'
      and hours.weekday = extract(dow from p_date)::integer and hours.is_active
  ) into working_hours_configured;

  if working_hours_configured then
    for window_row in
      select hours.start_time, hours.end_time
      from public.booking_working_hours hours
      where hours.company_id = p_company_id and hours.scope_type = 'organization'
        and hours.weekday = extract(dow from p_date)::integer and hours.is_active
      order by hours.start_time
    loop
      cursor_start := window_row.start_time;
      cursor_end := window_row.end_time;
      slot_start := ((p_date::text || ' ' || cursor_start::text)::timestamp at time zone coalesce(settings_row.timezone, 'UTC'));
      while slot_start < ((p_date::text || ' ' || cursor_end::text)::timestamp at time zone coalesce(settings_row.timezone, 'UTC')) loop
        slot_end := slot_start + make_interval(mins => service_row.duration_minutes);
        if slot_end <= ((p_date::text || ' ' || cursor_end::text)::timestamp at time zone coalesce(settings_row.timezone, 'UTC')) then
          starts_at := slot_start;
          ends_at := slot_end;
          label := to_char(slot_start at time zone coalesce(settings_row.timezone, 'UTC'), 'HH24:MI');
          available := private.booking_slot_is_available(p_company_id, p_service_id, p_location_id, p_resource_id, p_staff_id, slot_start, slot_end, greatest(p_participant_count, 1), null);
          capacity_remaining := case when p_resource_id is not null then (select resource.capacity from public.booking_resources resource where resource.id = p_resource_id and resource.company_id = p_company_id) else null end;
          return next;
        end if;
        slot_start := slot_start + interval '15 minutes';
      end loop;
    end loop;
  else
    -- Safe operational default until an organization configures its hours.
    slot_start := ((p_date::text || ' 09:00:00')::timestamp at time zone coalesce(settings_row.timezone, 'UTC'));
    while slot_start < ((p_date::text || ' 17:00:00')::timestamp at time zone coalesce(settings_row.timezone, 'UTC')) loop
      slot_end := slot_start + make_interval(mins => service_row.duration_minutes);
      if slot_end <= ((p_date::text || ' 17:00:00')::timestamp at time zone coalesce(settings_row.timezone, 'UTC')) then
        starts_at := slot_start;
        ends_at := slot_end;
        label := to_char(slot_start at time zone coalesce(settings_row.timezone, 'UTC'), 'HH24:MI');
        available := private.booking_slot_is_available(p_company_id, p_service_id, p_location_id, p_resource_id, p_staff_id, slot_start, slot_end, greatest(p_participant_count, 1), null);
        capacity_remaining := case when p_resource_id is not null then (select resource.capacity from public.booking_resources resource where resource.id = p_resource_id and resource.company_id = p_company_id) else null end;
        return next;
      end if;
      slot_start := slot_start + interval '15 minutes';
    end loop;
  end if;
end;
$$;

revoke all on function public.booking_get_available_slots(uuid, uuid, date, uuid, uuid, uuid, integer, text) from public;
grant execute on function public.booking_get_available_slots(uuid, uuid, date, uuid, uuid, uuid, integer, text) to authenticated, anon;

create or replace function public.booking_get_public_catalog(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  company_id_value uuid;
  company_name_value text;
  settings_row public.booking_settings;
begin
  select settings.company_id into company_id_value
  from public.booking_settings settings
  where settings.public_slug = lower(trim(p_slug)) and settings.public_enabled;
  if company_id_value is null then return jsonb_build_object('available', false); end if;
  select * into settings_row from public.booking_settings where company_id = company_id_value;
  select coalesce(company.name, 'OperiX Booking') into company_name_value from public.companies company where company.id = company_id_value;
  return jsonb_build_object(
    'available', true,
    'companyId', company_id_value,
    'businessName', coalesce(company_name_value, 'OperiX Booking'),
    'description', settings_row.public_description,
    'logoUrl', settings_row.public_logo_url,
    'primaryColor', settings_row.public_primary_color,
    'timezone', settings_row.timezone,
    'currency', settings_row.currency,
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', service.id, 'name', service.name, 'description', service.description,
        'durationMinutes', service.duration_minutes, 'price', service.price,
        'currency', service.currency, 'categoryId', service.category_id,
        'maxParticipants', service.max_participants
      ) order by service.name)
      from public.booking_services service
      where service.company_id = company_id_value and service.is_active
    ), '[]'::jsonb),
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', location.id, 'name', location.name, 'address', location.address,
        'timezone', location.timezone
      ) order by location.name)
      from public.booking_locations location
      where location.company_id = company_id_value and location.is_active
    ), '[]'::jsonb),
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object('id', staff.id, 'displayName', staff.display_name, 'roleTitle', staff.role_title) order by staff.display_name)
      from public.booking_staff staff
      where staff.company_id = company_id_value and staff.is_active
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.booking_get_public_catalog(text) from public;
grant execute on function public.booking_get_public_catalog(text) to anon, authenticated;

create or replace function public.booking_public_create(
  p_slug text,
  p_service_id uuid,
  p_location_id uuid,
  p_staff_id uuid,
  p_starts_at timestamptz,
  p_guest_name text,
  p_guest_email text default null,
  p_guest_phone text default null,
  p_notes text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  company_id_value uuid;
  request_ip text;
  ip_hash text;
  recent_attempts integer;
begin
  select settings.company_id into company_id_value
  from public.booking_settings settings
  where settings.public_slug = lower(trim(p_slug)) and settings.public_enabled;
  if company_id_value is null then raise exception 'Public booking is not available' using errcode = '42501'; end if;
  request_ip := coalesce((nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for'), 'unknown');
  ip_hash := md5(request_ip || ':' || lower(trim(p_slug)));
  perform pg_advisory_xact_lock(hashtextextended(ip_hash, 0));
  select count(*)::integer into recent_attempts
  from public.booking_public_attempts attempt
  where attempt.public_slug = lower(trim(p_slug)) and attempt.ip_hash = ip_hash and attempt.created_at > now() - interval '15 minutes';
  if recent_attempts >= 10 then raise exception 'Too many booking attempts. Please try again later.' using errcode = '42900'; end if;
  insert into public.booking_public_attempts (company_id, public_slug, ip_hash, guest_email)
  values (company_id_value, lower(trim(p_slug)), ip_hash, nullif(trim(p_guest_email), ''));
  return private.booking_create_core(
    company_id_value, null, p_guest_name, p_guest_email, p_guest_phone,
    p_service_id, p_location_id, null, p_staff_id, p_starts_at, null,
    1, 1, 'pending', p_notes, null, null, 'public', null, null, true, lower(trim(p_slug))
  );
end;
$$;

revoke all on function public.booking_public_create(text, uuid, uuid, uuid, timestamptz, text, text, text, text) from public;
grant execute on function public.booking_public_create(text, uuid, uuid, uuid, timestamptz, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tenant isolation and explicit grants
-- ---------------------------------------------------------------------------

alter table public.booking_service_categories enable row level security;
alter table public.booking_locations enable row level security;
alter table public.booking_services enable row level security;
alter table public.booking_resources enable row level security;
alter table public.booking_staff enable row level security;
alter table public.booking_staff_services enable row level security;
alter table public.booking_resource_services enable row level security;
alter table public.booking_working_hours enable row level security;
alter table public.booking_availability_exceptions enable row level security;
alter table public.booking_blocked_times enable row level security;
alter table public.booking_settings enable row level security;
alter table public.booking_recurring_series enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_participants enable row level security;
alter table public.booking_status_history enable row level security;
alter table public.booking_payments enable row level security;
alter table public.booking_waitlist enable row level security;
alter table public.booking_reminders enable row level security;
alter table public.booking_notification_log enable row level security;
alter table public.booking_audit_log enable row level security;
alter table public.booking_public_attempts enable row level security;

do $$
declare
  table_policy record;
begin
  for table_policy in
    select * from (values
      ('booking_service_categories'::text, 'service.read'::text),
      ('booking_locations'::text, 'calendar.read'::text),
      ('booking_services'::text, 'service.read'::text),
      ('booking_resources'::text, 'resource.read'::text),
      ('booking_staff'::text, 'staff.read'::text),
      ('booking_staff_services'::text, 'staff.read'::text),
      ('booking_resource_services'::text, 'resource.read'::text),
      ('booking_working_hours'::text, 'calendar.read'::text),
      ('booking_availability_exceptions'::text, 'calendar.read'::text),
      ('booking_blocked_times'::text, 'calendar.read'::text),
      ('booking_settings'::text, 'booking.read'::text),
      ('booking_recurring_series'::text, 'booking.read'::text),
      ('bookings'::text, 'booking.read'::text),
      ('booking_participants'::text, 'booking.read'::text),
      ('booking_status_history'::text, 'booking.read'::text),
      ('booking_payments'::text, 'payment.read'::text),
      ('booking_waitlist'::text, 'booking.read'::text),
      ('booking_reminders'::text, 'booking.read'::text),
      ('booking_notification_log'::text, 'booking.read'::text),
      ('booking_audit_log'::text, 'audit.view'::text)
    ) as permission_map(table_name, permission_code)
  loop
    execute format('revoke all on table public.%I from anon, authenticated', table_policy.table_name);
    execute format('grant select on table public.%I to authenticated', table_policy.table_name);
    execute format('drop policy if exists booking_member_select on public.%I', table_policy.table_name);
    execute format(
      'create policy booking_member_select on public.%I for select to authenticated using (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, %L), false))',
      table_policy.table_name,
      table_policy.permission_code
    );
  end loop;
  revoke all on table public.booking_public_attempts from anon, authenticated;
end;
$$;

-- Reference data uses permission-checked RLS for management. Booking records
-- themselves are created and transitioned only by the command functions.
create policy booking_services_manage on public.booking_services
  for all to authenticated
  using (private.has_company_permission(company_id, 'service.manage'))
  with check (private.has_company_permission(company_id, 'service.manage'));
create policy booking_categories_manage on public.booking_service_categories
  for all to authenticated
  using (private.has_company_permission(company_id, 'service.manage'))
  with check (private.has_company_permission(company_id, 'service.manage'));
create policy booking_locations_manage on public.booking_locations
  for all to authenticated
  using (private.has_company_permission(company_id, 'booking.settings.manage'))
  with check (private.has_company_permission(company_id, 'booking.settings.manage'));
create policy booking_resources_manage on public.booking_resources
  for all to authenticated
  using (private.has_company_permission(company_id, 'resource.manage'))
  with check (private.has_company_permission(company_id, 'resource.manage'));
create policy booking_staff_manage on public.booking_staff
  for all to authenticated
  using (private.has_company_permission(company_id, 'staff.manage'))
  with check (private.has_company_permission(company_id, 'staff.manage'));
create policy booking_staff_services_manage on public.booking_staff_services
  for all to authenticated
  using (private.has_company_permission(company_id, 'staff.manage'))
  with check (private.has_company_permission(company_id, 'staff.manage'));
create policy booking_resource_services_manage on public.booking_resource_services
  for all to authenticated
  using (private.has_company_permission(company_id, 'resource.manage'))
  with check (private.has_company_permission(company_id, 'resource.manage'));
create policy booking_working_hours_manage on public.booking_working_hours
  for all to authenticated
  using (private.has_company_permission(company_id, 'booking.settings.manage'))
  with check (private.has_company_permission(company_id, 'booking.settings.manage'));
create policy booking_exceptions_manage on public.booking_availability_exceptions
  for all to authenticated
  using (private.has_company_permission(company_id, 'booking.settings.manage'))
  with check (private.has_company_permission(company_id, 'booking.settings.manage'));
create policy booking_blocked_times_manage on public.booking_blocked_times
  for all to authenticated
  using (private.has_company_permission(company_id, 'calendar.manage'))
  with check (private.has_company_permission(company_id, 'calendar.manage'));
create policy booking_settings_manage on public.booking_settings
  for all to authenticated
  using (private.has_company_permission(company_id, 'booking.settings.manage'))
  with check (private.has_company_permission(company_id, 'booking.settings.manage'));
create policy booking_recurring_series_manage on public.booking_recurring_series
  for all to authenticated
  using (private.has_company_permission(company_id, 'booking.create'))
  with check (private.has_company_permission(company_id, 'booking.create'));
create policy booking_waitlist_manage on public.booking_waitlist
  for all to authenticated
  using (private.has_company_permission(company_id, 'booking.update'))
  with check (private.has_company_permission(company_id, 'booking.update'));
create policy booking_reminders_manage on public.booking_reminders
  for all to authenticated
  using (private.has_company_permission(company_id, 'booking.settings.manage'))
  with check (private.has_company_permission(company_id, 'booking.settings.manage'));
create policy booking_payments_manage on public.booking_payments
  for all to authenticated
  using (private.has_company_permission(company_id, 'payment.manage'))
  with check (private.has_company_permission(company_id, 'payment.manage'));

create policy booking_audit_read on public.booking_audit_log
  for select to authenticated
  using (public.can_access_company(company_id) and private.has_company_permission(company_id, 'audit.view'));

grant select on public.bookings, public.booking_status_history, public.booking_participants, public.booking_payments, public.booking_audit_log to authenticated;
grant insert, update, delete on public.booking_services, public.booking_service_categories, public.booking_locations,
  public.booking_resources, public.booking_staff, public.booking_staff_services, public.booking_resource_services,
  public.booking_working_hours, public.booking_availability_exceptions, public.booking_blocked_times,
  public.booking_settings, public.booking_recurring_series, public.booking_waitlist, public.booking_reminders,
  public.booking_payments to authenticated;
grant execute on function public.booking_get_public_catalog(text), public.booking_public_create(text, uuid, uuid, uuid, timestamptz, text, text, text, text),
  public.booking_get_available_slots(uuid, uuid, date, uuid, uuid, uuid, integer, text) to anon, authenticated;

comment on table public.bookings is 'Tenant-scoped OperiX Booking reservations. Use booking_* commands for writes.';
comment on function public.booking_create(uuid, uuid, text, text, text, uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, integer, text, text, text, text, text, text, uuid) is 'Canonical authenticated booking creation command shared by web and mobile.';

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'bookings'
    )
  then
    alter publication supabase_realtime add table public.bookings;
  end if;
end
$$;
