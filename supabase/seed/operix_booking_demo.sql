-- Development-only OperiX Booking seed.
-- Never run this in production. It creates a connected, tenant-scoped sample
-- workspace with 128 bookings for calendar, reporting, and race testing.

begin;

do $$
declare
  environment_name text := current_setting('app.environment', true);
  company_id_value uuid;
  category_id_value uuid;
  location_id_value uuid;
  service_id_value uuid;
  resource_id_value uuid;
  staff_id_value uuid;
  customer_id_value uuid;
  booking_id_value uuid;
  starts_value timestamptz;
  ends_value timestamptz;
  index_value integer;
  service_index integer;
begin
  if environment_name is distinct from 'development' then
    raise exception 'Refusing Booking demo seed: app.environment must equal development';
  end if;

  select id into company_id_value
  from public.companies
  order by created_at nulls last
  limit 1;
  if company_id_value is null then
    raise exception 'Create a development company before running the Booking demo seed';
  end if;

  insert into public.booking_service_categories (company_id, name, slug, color)
  values (company_id_value, 'Demo services', 'demo-services', '#004FFE')
  on conflict (company_id, slug) do update set name = excluded.name
  returning id into category_id_value;

  insert into public.booking_locations (company_id, name, address, timezone)
  values
    (company_id_value, 'Prishtina Center', 'Garibaldi 12, Prishtina', 'Europe/Belgrade'),
    (company_id_value, 'Ulpiana Studio', 'Bulevardi Bill Clinton, Prishtina', 'Europe/Belgrade')
  on conflict (company_id, name) do update set timezone = excluded.timezone;

  select id into location_id_value
  from public.booking_locations
  where company_id = company_id_value
  order by name
  limit 1;

  insert into public.booking_settings (
    company_id, timezone, currency, auto_confirm, public_enabled,
    public_slug, public_description, public_primary_color
  )
  values (
    company_id_value, 'Europe/Belgrade', 'EUR', true, true,
    'booking-demo', 'Choose a time that works for you.', '#004FFE'
  )
  on conflict (company_id) do update set
    public_enabled = excluded.public_enabled,
    public_slug = excluded.public_slug,
    public_description = excluded.public_description;

  insert into public.booking_services (company_id, category_id, name, description, duration_minutes, price, currency, max_participants)
  values
    (company_id_value, category_id_value, 'Business Meeting Room', 'Video-ready meeting room.', 60, 45, 'EUR', 8),
    (company_id_value, category_id_value, 'Dental Consultation', 'New patient consultation.', 45, 60, 'EUR', 1),
    (company_id_value, category_id_value, 'Premium Car', 'Day vehicle rental.', 120, 89, 'EUR', 1),
    (company_id_value, category_id_value, 'Fitness Class', 'Instructor-led group class.', 60, 18, 'EUR', 12)
  on conflict do nothing;

  insert into public.booking_resources (company_id, location_id, name, resource_type, capacity)
  values
    (company_id_value, location_id_value, 'Room A', 'meeting_room', 8),
    (company_id_value, location_id_value, 'Room B', 'meeting_room', 6),
    (company_id_value, location_id_value, 'Vehicle 04', 'vehicle', 1)
  on conflict (company_id, id) do nothing;

  insert into public.booking_staff (company_id, display_name, role_title)
  values
    (company_id_value, 'Arta Berisha', 'Dental provider'),
    (company_id_value, 'Luan Krasniqi', 'Class instructor'),
    (company_id_value, 'Mila Petrovic', 'Booking coordinator')
  on conflict (company_id, id) do nothing;

  for index_value in 1..32 loop
    insert into public.clients (company_id, name, email, phone, notes)
    values (company_id_value, 'Demo Customer ' || lpad(index_value::text, 2, '0'), 'booking-demo-' || index_value || '@operix.local', '+383 44 000 ' || lpad(index_value::text, 3, '0'), 'Development-only Booking customer')
    on conflict do nothing;
  end loop;

  for index_value in 1..128 loop
    service_index := ((index_value - 1) % 4);
    select id into customer_id_value
    from public.clients
    where company_id = company_id_value
    order by created_at, id
    offset ((index_value - 1) % 32)
    limit 1;
    select id into service_id_value
    from public.booking_services
    where company_id = company_id_value
    order by created_at, id
    offset service_index
    limit 1;
    select id into resource_id_value
    from public.booking_resources
    where company_id = company_id_value
    order by created_at, id
    offset ((index_value - 1) % 3)
    limit 1;
    select id into staff_id_value
    from public.booking_staff
    where company_id = company_id_value
    order by created_at, id
    offset ((index_value - 1) % 3)
    limit 1;

    starts_value := (
      case
        when index_value <= 32 then current_date + (1 + ((index_value - 1) % 14))
        else current_date - (1 + ((index_value - 33) % 60))
      end
      + time '08:00'
      + (((index_value - 1) % 8) * interval '60 minutes')
    ) at time zone 'Europe/Belgrade';
    ends_value := starts_value + case when service_index = 1 then interval '45 minutes' else interval '60 minutes' end;

    insert into public.bookings (
      company_id, booking_number, customer_id, service_id, location_id,
      resource_id, staff_id, starts_at, ends_at, timezone, duration_minutes,
      participant_count, price, total_amount, paid_amount, currency, status,
      payment_status, source
    )
    values (
      company_id_value, public.booking_next_number(), customer_id_value, service_id_value,
      location_id_value, resource_id_value, staff_id_value, starts_value, ends_value,
      'Europe/Belgrade', extract(epoch from (ends_value - starts_value))::integer / 60,
      case when service_index = 3 then 4 else 1 end,
      case when service_index = 0 then 45 when service_index = 1 then 60 when service_index = 2 then 89 else 18 end,
      case when service_index = 0 then 45 when service_index = 1 then 60 when service_index = 2 then 89 else 18 end,
      case when index_value > 32 then case when index_value % 9 = 0 then 0 else case when service_index = 0 then 45 when service_index = 1 then 60 when service_index = 2 then 89 else 18 end end else 0 end,
      'EUR',
      case when index_value <= 32 then case when index_value % 5 = 0 then 'pending' else 'confirmed' end else 'completed' end,
      case when index_value <= 32 then 'unpaid' when index_value % 9 = 0 then 'partially_paid' else 'paid' end,
      'import'
    )
    returning id into booking_id_value;

    insert into public.booking_status_history (company_id, booking_id, from_status, to_status)
    values (company_id_value, booking_id_value, null, case when index_value <= 32 then case when index_value % 5 = 0 then 'pending' else 'confirmed' end else 'completed' end);
  end loop;
end
$$;

commit;
