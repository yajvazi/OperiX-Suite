-- OperiX Booking security hardening.
--
-- This migration closes the authorization gaps found in the Booking review
-- without changing the shared account, company, customer, HR, or Invoice
-- entities. Booking remains a tenant-scoped client of those shared models.

-- ---------------------------------------------------------------------------
-- Archived companies are not active authorization scopes.
-- ---------------------------------------------------------------------------

create or replace function private.company_is_active(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with recursive company_chain(id, parent_company_id, archived_at) as (
    select company.id, company.parent_company_id, company.archived_at
    from public.companies company
    where company.id = p_company_id
    union
    select parent.id, parent.parent_company_id, parent.archived_at
    from public.companies parent
    join company_chain child on child.parent_company_id = parent.id
  )
  select exists (select 1 from company_chain where id = p_company_id)
    and not exists (select 1 from company_chain where archived_at is not null);
$$;

revoke all on function private.company_is_active(uuid) from public;
grant execute on function private.company_is_active(uuid) to authenticated, service_role;

create or replace function public.can_access_company(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_company_id is not null
    and private.company_is_active(target_company_id)
    and (
      exists (
        select 1
        from public.companies company
        where company.id = target_company_id
          and company.owner_id = (select auth.uid())
      )
      or exists (
        select 1
        from public.memberships membership
        where membership.user_id = (select auth.uid())
          and coalesce(membership.status, 'active') = 'active'
          and private.company_is_in_scope(membership.company_id, target_company_id)
      )
      or exists (
        select 1
        from public.profiles profile
        where profile.id = (select auth.uid())
          and (
            private.company_is_in_scope(profile.company_id, target_company_id)
            or private.company_is_in_scope(profile.active_company_id, target_company_id)
          )
      )
    );
$$;

revoke all on function public.can_access_company(uuid) from public, anon;
grant execute on function public.can_access_company(uuid) to authenticated, service_role;

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
  with recursive ancestors(id) as (
    select p_company_id
    union
    select company.parent_company_id
    from public.companies company
    join ancestors child on child.id = company.id
    where company.parent_company_id is not null
  )
  select private.company_is_active(p_company_id)
    and p_company_id is not null
    and p_permission is not null
    and (
      exists (
        select 1
        from public.companies company
        join ancestors scope on scope.id = company.id
        where company.owner_id = (select auth.uid())
      )
      or exists (
        select 1
        from public.memberships membership
        join ancestors scope on scope.id = membership.company_id
        where membership.user_id = (select auth.uid())
          and coalesce(membership.status, 'active') = 'active'
          and lower(membership.role) in ('owner', 'admin')
      )
      or exists (
        select 1
        from public.memberships membership
        join ancestors scope on scope.id = membership.company_id
        join public.membership_role_assignments assignment
          on assignment.membership_id = membership.id
        join public.app_roles role
          on role.id = assignment.role_id
          and (role.company_id is null or role.company_id = membership.company_id)
        join public.app_role_permissions role_permission
          on role_permission.role_id = role.id
        where membership.user_id = (select auth.uid())
          and coalesce(membership.status, 'active') = 'active'
          and role_permission.permission_code = p_permission
      )
    );
$$;

revoke all on function private.has_company_permission(uuid, text) from public;
grant execute on function private.has_company_permission(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Assigned-provider scope and status transitions.
-- ---------------------------------------------------------------------------

insert into public.app_permissions (code, name, category, description, is_sensitive)
values (
  'booking.scope_all',
  'View and manage all bookings',
  'booking',
  'View and manage bookings beyond the current provider assignment.',
  true
)
on conflict (code) do update set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  is_sensitive = excluded.is_sensitive;

with grants(role_code, permission_code) as (
  values
    ('booking_admin', 'booking.scope_all'),
    ('booking_manager', 'booking.scope_all'),
    ('booking_receptionist', 'booking.scope_all'),
    ('booking_finance', 'booking.scope_all')
)
insert into public.app_role_permissions (role_id, permission_code)
select role.id, grants.permission_code
from grants
join public.app_roles role
  on role.code = grants.role_code
 and role.company_id is null
on conflict do nothing;

create or replace function private.booking_user_can_access_staff(
  p_company_id uuid,
  p_staff_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.company_is_active(p_company_id)
    and (
      coalesce(private.has_company_permission(p_company_id, 'booking.scope_all'), false)
      or (
        p_staff_id is not null
        and exists (
          select 1
          from public.booking_staff staff
          left join public.employees employee on employee.id = staff.employee_id
          where staff.company_id = p_company_id
            and staff.id = p_staff_id
            and staff.is_active
            and (
              staff.user_id = (select auth.uid())
              or employee.user_id = (select auth.uid())
            )
        )
      )
    );
$$;

create or replace function private.booking_user_can_access_booking(
  p_company_id uuid,
  p_booking_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.bookings booking
    where booking.company_id = p_company_id
      and booking.id = p_booking_id
      and private.booking_user_can_access_staff(booking.company_id, booking.staff_id)
  );
$$;

revoke all on function private.booking_user_can_access_staff(uuid, uuid) from public;
revoke all on function private.booking_user_can_access_booking(uuid, uuid) from public;
grant execute on function private.booking_user_can_access_staff(uuid, uuid) to authenticated, service_role;
grant execute on function private.booking_user_can_access_booking(uuid, uuid) to authenticated, service_role;

create or replace function private.booking_assignment_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Service-role webhook/payment reconciliation is an internal operation and
  -- has no end-user JWT. Authenticated updates must remain within assignment
  -- scope even when a future command updates additional booking fields.
  if (select auth.uid()) is not null then
    if old.company_id is distinct from new.company_id then
      raise exception 'A booking organization cannot be changed' using errcode = '42501';
    end if;
    if old.staff_id is distinct from new.staff_id
       and not coalesce(private.has_company_permission(new.company_id, 'booking.scope_all'), false) then
      raise exception 'You do not have permission to reassign this booking' using errcode = '42501';
    end if;
    if not private.booking_user_can_access_staff(new.company_id, new.staff_id) then
      raise exception 'You do not have permission to manage this booking' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists booking_assignment_guard on public.bookings;
create trigger booking_assignment_guard
before update on public.bookings
for each row execute function private.booking_assignment_guard();

create or replace function private.booking_can_transition(p_from text, p_to text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_from
    when 'draft' then p_to in ('pending', 'confirmed', 'cancelled')
    when 'pending' then p_to in ('confirmed', 'cancelled', 'rescheduled')
    when 'confirmed' then p_to in ('checked_in', 'cancelled', 'no_show', 'rescheduled')
    when 'checked_in' then p_to in ('in_progress', 'cancelled', 'no_show')
    when 'in_progress' then p_to in ('completed', 'cancelled')
    when 'rescheduled' then p_to in ('pending', 'confirmed', 'cancelled')
    else false
  end;
$$;

revoke all on function private.booking_can_transition(text, text) from public;
grant execute on function private.booking_can_transition(text, text) to authenticated, service_role;

-- The command functions enforce assignment scope before they return or update
-- a booking. This is intentionally server-side; hiding buttons is not enough.
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
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_company_id is null or not public.can_access_company(p_company_id) then
    raise exception 'You do not have access to this organization' using errcode = '42501';
  end if;
  select * into booking_row
  from public.bookings
  where id = p_booking_id and company_id = p_company_id
  for update;
  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;
  if not private.booking_user_can_access_staff(p_company_id, booking_row.staff_id) then
    raise exception 'You do not have permission to manage this booking' using errcode = '42501';
  end if;
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
  values (
    p_company_id, booking_row.id, actor_id, 'booking.status_changed', 'booking', booking_row.id,
    jsonb_build_object('reason', p_reason, 'status', next_status), to_jsonb(booking_row)
  );
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
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_company_id is null or not public.can_access_company(p_company_id) then
    raise exception 'You do not have access to this organization' using errcode = '42501';
  end if;
  if not coalesce(private.has_company_permission(p_company_id, 'booking.update'), false) then
    raise exception 'You do not have permission to reschedule bookings' using errcode = '42501';
  end if;
  select * into booking_row
  from public.bookings
  where id = p_booking_id and company_id = p_company_id
  for update;
  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;
  if not private.booking_user_can_access_staff(p_company_id, booking_row.staff_id) then
    raise exception 'You do not have permission to manage this booking' using errcode = '42501';
  end if;
  if booking_row.status in ('cancelled', 'completed', 'no_show') then
    raise exception 'This booking cannot be rescheduled' using errcode = '55000';
  end if;
  old_status := booking_row.status;
  select * into settings_row from public.booking_settings where company_id = p_company_id;
  if now() > booking_row.starts_at - make_interval(mins => coalesce(settings_row.reschedule_cutoff_minutes, 120)) then
    raise exception 'The booking cannot be rescheduled within the cutoff window' using errcode = '55000';
  end if;
  select * into service_row
  from public.booking_services
  where id = booking_row.service_id and company_id = p_company_id;
  new_ends_at := coalesce(p_ends_at, p_starts_at + make_interval(mins => service_row.duration_minutes));
  if new_ends_at <= p_starts_at then
    raise exception 'Booking end time must be after the start time' using errcode = '22023';
  end if;
  old_starts_at := booking_row.starts_at;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':availability', 0));
  if not private.booking_slot_is_available(
    p_company_id, booking_row.service_id, booking_row.location_id,
    booking_row.resource_id, booking_row.staff_id, p_starts_at, new_ends_at,
    booking_row.participant_count, booking_row.id
  ) then
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
  insert into public.booking_audit_log (
    company_id, booking_id, actor_user_id, action, entity, entity_id,
    details, before_data, after_data
  )
  values (
    p_company_id, booking_row.id, actor_id, 'booking.rescheduled', 'booking', booking_row.id,
    jsonb_build_object('reason', p_reason, 'old_starts_at', old_starts_at, 'new_starts_at', p_starts_at),
    jsonb_build_object('starts_at', old_starts_at),
    jsonb_build_object('starts_at', booking_row.starts_at, 'ends_at', booking_row.ends_at)
  );
  return booking_row;
end;
$$;

revoke all on function public.booking_reschedule(uuid, uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.booking_reschedule(uuid, uuid, timestamptz, timestamptz, text) to authenticated;

-- Restrict the Booking record and its customer-visible child records to the
-- assigned provider unless the caller has the explicit all-bookings scope.
drop policy if exists booking_member_select on public.bookings;
create policy booking_member_select
on public.bookings
for select to authenticated
using (
  public.can_access_company(company_id)
  and coalesce(private.has_company_permission(company_id, 'booking.read'), false)
  and private.booking_user_can_access_staff(company_id, staff_id)
);

drop policy if exists booking_member_select on public.booking_participants;
create policy booking_member_select
on public.booking_participants
for select to authenticated
using (
  public.can_access_company(company_id)
  and coalesce(private.has_company_permission(company_id, 'booking.read'), false)
  and private.booking_user_can_access_booking(company_id, booking_id)
);

drop policy if exists booking_member_select on public.booking_status_history;
create policy booking_member_select
on public.booking_status_history
for select to authenticated
using (
  public.can_access_company(company_id)
  and coalesce(private.has_company_permission(company_id, 'booking.read'), false)
  and private.booking_user_can_access_booking(company_id, booking_id)
);

drop policy if exists booking_member_select on public.booking_reminders;
create policy booking_member_select
on public.booking_reminders
for select to authenticated
using (
  public.can_access_company(company_id)
  and coalesce(private.has_company_permission(company_id, 'booking.read'), false)
  and private.booking_user_can_access_booking(company_id, booking_id)
);

drop policy if exists booking_member_select on public.booking_notification_log;
create policy booking_member_select
on public.booking_notification_log
for select to authenticated
using (
  public.can_access_company(company_id)
  and coalesce(private.has_company_permission(company_id, 'booking.read'), false)
  and (
    (booking_id is null and private.has_company_permission(company_id, 'booking.scope_all'))
    or (booking_id is not null and private.booking_user_can_access_booking(company_id, booking_id))
  )
);

drop policy if exists booking_member_select on public.booking_waitlist;
create policy booking_member_select
on public.booking_waitlist
for select to authenticated
using (
  public.can_access_company(company_id)
  and coalesce(private.has_company_permission(company_id, 'booking.read'), false)
  and private.booking_user_can_access_staff(company_id, staff_id)
);

-- ---------------------------------------------------------------------------
-- Customer directory commands: Booking permission is checked before the
-- shared clients table is read or written.
-- ---------------------------------------------------------------------------

create or replace function public.booking_list_customers(
  p_company_id uuid,
  p_search text default null,
  p_limit integer default 100,
  p_customer_ids uuid[] default null
)
returns table (
  id uuid,
  company_id uuid,
  user_id uuid,
  name text,
  email text,
  phone text,
  company text,
  company_name text,
  address text,
  notes text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_company_id is null
     or not public.can_access_company(p_company_id)
     or not private.has_company_permission(p_company_id, 'customer.read') then
    return;
  end if;

  return query
  select customer.id, customer.company_id, customer.user_id, customer.name,
    customer.email, customer.phone, customer.company, customer.company_name,
    customer.address, customer.notes, customer.created_at
  from public.clients customer
  where customer.company_id = p_company_id
    and (p_customer_ids is null or customer.id = any(p_customer_ids))
    and (
      nullif(trim(p_search), '') is null
      or position(lower(trim(p_search)) in lower(coalesce(customer.name, ''))) > 0
      or position(lower(trim(p_search)) in lower(coalesce(customer.email, ''))) > 0
      or position(lower(trim(p_search)) in lower(coalesce(customer.phone, ''))) > 0
    )
  order by customer.name
  limit greatest(1, least(coalesce(p_limit, 100), 1000));
end;
$$;

create or replace function public.booking_create_customer(
  p_company_id uuid,
  p_name text,
  p_email text default null,
  p_phone text default null,
  p_company text default null,
  p_notes text default null
)
returns table (
  id uuid,
  company_id uuid,
  user_id uuid,
  name text,
  email text,
  phone text,
  company text,
  company_name text,
  address text,
  notes text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  name_value text := nullif(trim(p_name), '');
  email_value text := nullif(trim(p_email), '');
  phone_value text := nullif(trim(p_phone), '');
  company_value text := nullif(trim(p_company), '');
  notes_value text := nullif(trim(p_notes), '');
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_company_id is null
     or not public.can_access_company(p_company_id)
     or not private.has_company_permission(p_company_id, 'customer.manage') then
    raise exception 'You do not have permission to manage booking customers' using errcode = '42501';
  end if;
  if name_value is null or char_length(name_value) > 160 then
    raise exception 'Customer name must be between 1 and 160 characters' using errcode = '22023';
  end if;
  if email_value is not null and (
    char_length(email_value) > 320
    or email_value !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ) then
    raise exception 'Customer email is invalid' using errcode = '22023';
  end if;
  if phone_value is not null and char_length(phone_value) > 40 then
    raise exception 'Customer phone is too long' using errcode = '22023';
  end if;
  if company_value is not null and char_length(company_value) > 160 then
    raise exception 'Customer company is too long' using errcode = '22023';
  end if;
  if notes_value is not null and char_length(notes_value) > 2000 then
    raise exception 'Customer notes are too long' using errcode = '22023';
  end if;

  return query
  insert into public.clients (
    company_id, user_id, name, email, phone, company, company_name, notes
  )
  values (
    p_company_id, actor_id, name_value, email_value, phone_value,
    company_value, company_value, notes_value
  )
  returning clients.id, clients.company_id, clients.user_id, clients.name,
    clients.email, clients.phone, clients.company, clients.company_name,
    clients.address, clients.notes, clients.created_at;
end;
$$;

revoke all on function public.booking_list_customers(uuid, text, integer, uuid[]) from public, anon;
revoke all on function public.booking_create_customer(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.booking_list_customers(uuid, text, integer, uuid[]) to authenticated;
grant execute on function public.booking_create_customer(uuid, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Public booking input limits and trusted rate-limit identity.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bookings_guest_name_length') then
    alter table public.bookings add constraint bookings_guest_name_length
      check (guest_name is null or char_length(guest_name) <= 160) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bookings_guest_email_length') then
    alter table public.bookings add constraint bookings_guest_email_length
      check (guest_email is null or char_length(guest_email) <= 320) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bookings_guest_phone_length') then
    alter table public.bookings add constraint bookings_guest_phone_length
      check (guest_phone is null or char_length(guest_phone) <= 40) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bookings_notes_length') then
    alter table public.bookings add constraint bookings_notes_length
      check (notes is null or char_length(notes) <= 2000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bookings_internal_notes_length') then
    alter table public.bookings add constraint bookings_internal_notes_length
      check (internal_notes is null or char_length(internal_notes) <= 2000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bookings_customer_notes_length') then
    alter table public.bookings add constraint bookings_customer_notes_length
      check (customer_notes is null or char_length(customer_notes) <= 2000) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'booking_public_attempts_slug_length') then
    alter table public.booking_public_attempts add constraint booking_public_attempts_slug_length
      check (char_length(public_slug) between 1 and 120) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'booking_public_attempts_email_length') then
    alter table public.booking_public_attempts add constraint booking_public_attempts_email_length
      check (guest_email is null or char_length(guest_email) <= 320) not valid;
  end if;
end;
$$;

create index if not exists booking_public_attempts_rate_lookup_idx
  on public.booking_public_attempts (public_slug, ip_hash, created_at desc);

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
  slug_value text := lower(trim(p_slug));
  guest_name_value text := nullif(trim(p_guest_name), '');
  guest_email_value text := nullif(trim(p_guest_email), '');
  guest_phone_value text := nullif(trim(p_guest_phone), '');
  notes_value text := nullif(trim(p_notes), '');
  request_headers jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
  request_rate_key text;
  ip_hash text;
  recent_attempts integer;
begin
  -- Only the trusted Booking server route receives execute on this function.
  -- It passes an IP-derived key in a dedicated header after Nginx/Cloudflare
  -- has established the client address.
  request_rate_key := nullif(request_headers ->> 'x-operix-booking-rate-key', '');
  if request_rate_key is null or char_length(request_rate_key) > 128 then
    raise exception 'Public booking is temporarily unavailable' using errcode = '42501';
  end if;
  if slug_value is null or char_length(slug_value) < 1 or char_length(slug_value) > 120 then
    raise exception 'Public booking is not available' using errcode = '42501';
  end if;
  if guest_name_value is null or char_length(guest_name_value) > 160 then
    raise exception 'Guest name must be between 1 and 160 characters' using errcode = '22023';
  end if;
  if guest_email_value is not null and (
    char_length(guest_email_value) > 320
    or guest_email_value !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ) then
    raise exception 'Guest email is invalid' using errcode = '22023';
  end if;
  if guest_phone_value is not null and char_length(guest_phone_value) > 40 then
    raise exception 'Guest phone is too long' using errcode = '22023';
  end if;
  if notes_value is not null and char_length(notes_value) > 2000 then
    raise exception 'Booking notes are too long' using errcode = '22023';
  end if;

  select settings.company_id into company_id_value
  from public.booking_settings settings
  where settings.public_slug = slug_value and settings.public_enabled;
  if company_id_value is null then
    raise exception 'Public booking is not available' using errcode = '42501';
  end if;

  ip_hash := md5(request_rate_key || ':' || slug_value);
  perform pg_advisory_xact_lock(hashtextextended(ip_hash, 0));
  select count(*)::integer into recent_attempts
  from public.booking_public_attempts attempt
  where attempt.public_slug = slug_value
    and attempt.ip_hash = ip_hash
    and attempt.created_at > now() - interval '15 minutes';
  if recent_attempts >= 10 then
    raise exception 'Too many booking attempts. Please try again later.' using errcode = '42900';
  end if;
  insert into public.booking_public_attempts (company_id, public_slug, ip_hash, guest_email)
  values (company_id_value, slug_value, ip_hash, guest_email_value);
  return private.booking_create_core(
    company_id_value, null, guest_name_value, guest_email_value, guest_phone_value,
    p_service_id, p_location_id, null, p_staff_id, p_starts_at, null,
    1, 1, 'pending', notes_value, null, null, 'public', null, null, true, slug_value
  );
end;
$$;

revoke all on function public.booking_public_create(text, uuid, uuid, uuid, timestamptz, text, text, text, text) from public, anon, authenticated;
grant execute on function public.booking_public_create(text, uuid, uuid, uuid, timestamptz, text, text, text, text) to service_role;
