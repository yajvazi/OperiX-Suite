-- Booking Mobile parity: one authoritative edit command for Web and Mobile.
-- This is additive. It does not rewrite existing booking data or bypass RLS.

create or replace function public.booking_update(
  p_company_id uuid,
  p_booking_id uuid,
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
  p_notes text default null,
  p_internal_notes text default null,
  p_customer_notes text default null,
  p_source text default 'admin'
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  booking_row public.bookings;
  before_row public.bookings;
  service_row public.booking_services;
  location_row public.booking_locations;
  resource_row public.booking_resources;
  staff_row public.booking_staff;
  settings_row public.booking_settings;
  ends_value timestamptz;
  unit_price numeric(20,4);
  subtotal_value numeric(20,4);
  tax_value numeric(20,4);
  total_value numeric(20,4);
  deposit_value numeric(20,4);
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_company_id is null or not public.can_access_company(p_company_id) then
    raise exception 'You do not have access to this organization' using errcode = '42501';
  end if;
  if not coalesce(private.has_company_permission(p_company_id, 'booking.update'), false) then
    raise exception 'You do not have permission to update this booking' using errcode = '42501';
  end if;

  select * into booking_row
  from public.bookings
  where id = p_booking_id and company_id = p_company_id
  for update;
  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;
  before_row := booking_row;
  if not private.booking_user_can_access_staff(p_company_id, booking_row.staff_id) then
    raise exception 'You do not have permission to manage this booking' using errcode = '42501';
  end if;
  if booking_row.status in ('cancelled', 'completed', 'no_show') then
    raise exception 'This booking cannot be edited in its current state' using errcode = '55000';
  end if;
  if booking_row.staff_id is distinct from p_staff_id
     and not coalesce(private.has_company_permission(p_company_id, 'booking.scope_all'), false) then
    raise exception 'You do not have permission to reassign this booking' using errcode = '42501';
  end if;

  select * into service_row
  from public.booking_services
  where id = p_service_id and company_id = p_company_id and is_active;
  if not found then raise exception 'The selected service is no longer available' using errcode = 'P0002'; end if;
  if p_participant_count is null or p_participant_count < service_row.min_participants or p_participant_count > service_row.max_participants then
    raise exception 'The participant count is outside this service capacity' using errcode = '22023';
  end if;
  if p_customer_id is not null and not exists (
    select 1 from public.clients customer where customer.id = p_customer_id and customer.company_id = p_company_id
  ) then
    raise exception 'The selected customer does not belong to this organization' using errcode = '42501';
  end if;
  if p_customer_id is null and nullif(trim(coalesce(p_guest_name, '')), '') is null then
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
    if not private.booking_user_can_access_staff(p_company_id, p_staff_id) then
      raise exception 'You do not have permission to assign this staff member' using errcode = '42501';
    end if;
  end if;

  if p_starts_at is null then raise exception 'A booking start time is required' using errcode = '22023'; end if;
  ends_value := coalesce(p_ends_at, p_starts_at + make_interval(mins => service_row.duration_minutes));
  if ends_value <= p_starts_at then raise exception 'Booking end time must be after the start time' using errcode = '22023'; end if;
  if p_quantity is null or p_quantity < 1 then raise exception 'Quantity must be at least one' using errcode = '22023'; end if;
  if p_starts_at < now() + make_interval(mins => greatest(coalesce(service_row.min_notice_minutes, 0), coalesce((select minimum_booking_notice_minutes from public.booking_settings where company_id = p_company_id), 0))) then
    raise exception 'This booking does not meet the minimum notice rule' using errcode = '22023';
  end if;
  if p_starts_at > now() + make_interval(days => coalesce(service_row.max_advance_days, (select maximum_advance_booking_days from public.booking_settings where company_id = p_company_id), 365)) then
    raise exception 'This booking is outside the advance booking window' using errcode = '22023';
  end if;
  if char_length(coalesce(p_notes, '')) > 2000 or char_length(coalesce(p_internal_notes, '')) > 2000 or char_length(coalesce(p_customer_notes, '')) > 2000 then
    raise exception 'Booking notes cannot exceed 2000 characters' using errcode = '22023';
  end if;
  if p_source not in ('admin', 'public', 'mobile', 'import', 'api') then
    raise exception 'The booking source is invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':availability', 0));
  if not private.booking_slot_is_available(
    p_company_id, p_service_id, p_location_id, p_resource_id, p_staff_id,
    p_starts_at, ends_value, p_participant_count, p_booking_id
  ) then
    raise exception 'This time slot is no longer available. Choose another time.' using errcode = '23P01';
  end if;

  select * into settings_row from public.booking_settings where company_id = p_company_id;
  unit_price := coalesce(resource_row.price_override, service_row.price);
  subtotal_value := round(unit_price * greatest(p_quantity, 1), 4);
  tax_value := round(subtotal_value * service_row.tax_rate / 100, 4);
  total_value := greatest(round(subtotal_value + tax_value, 4), 0);
  deposit_value := case service_row.deposit_type
    when 'fixed' then least(total_value, round(service_row.deposit_value * greatest(p_quantity, 1), 4))
    when 'percentage' then least(total_value, round(total_value * service_row.deposit_value / 100, 4))
    else 0
  end;

  update public.bookings
  set customer_id = p_customer_id,
      guest_name = nullif(trim(p_guest_name), ''),
      guest_email = nullif(trim(p_guest_email), ''),
      guest_phone = nullif(trim(p_guest_phone), ''),
      service_id = p_service_id,
      location_id = p_location_id,
      resource_id = p_resource_id,
      staff_id = p_staff_id,
      starts_at = p_starts_at,
      ends_at = ends_value,
      timezone = coalesce(location_row.timezone, settings_row.timezone, booking_row.timezone, 'UTC'),
      duration_minutes = extract(epoch from (ends_value - p_starts_at))::integer / 60,
      quantity = greatest(p_quantity, 1),
      participant_count = greatest(p_participant_count, 1),
      price = subtotal_value,
      tax_amount = tax_value,
      deposit_amount = deposit_value,
      total_amount = total_value,
      notes = p_notes,
      internal_notes = p_internal_notes,
      customer_notes = p_customer_notes,
      source = p_source,
      updated_at = now()
  where id = p_booking_id and company_id = p_company_id
  returning * into booking_row;

  insert into public.booking_audit_log (company_id, booking_id, actor_user_id, action, entity, entity_id, details, before_data, after_data)
  values (p_company_id, booking_row.id, actor_id, 'booking.updated', 'booking', booking_row.id,
    jsonb_build_object('source', 'shared_booking_update'), to_jsonb(before_row), to_jsonb(booking_row));
  return booking_row;
end;
$$;

revoke all on function public.booking_update(uuid, uuid, uuid, text, text, text, uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, integer, text, text, text, text) from public, anon;
grant execute on function public.booking_update(uuid, uuid, uuid, text, text, text, uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, integer, text, text, text, text) to authenticated;

comment on function public.booking_update(uuid, uuid, uuid, text, text, text, uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, integer, text, text, text, text) is 'Canonical tenant-scoped Booking edit command shared by web and mobile.';
