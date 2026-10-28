-- Fix the trusted public-booking rate-limit lookup.
--
-- PostgreSQL resolves an unqualified `ip_hash` in the hardened function as
-- ambiguous between the PL/pgSQL variable and booking_public_attempts.ip_hash.
-- Keep the server-only boundary and the canonical booking core unchanged while
-- using an explicitly named local value.

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
  ip_hash_value text;
  recent_attempts integer;
begin
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

  ip_hash_value := md5(request_rate_key || ':' || slug_value);
  perform pg_advisory_xact_lock(hashtextextended(ip_hash_value, 0));
  select count(*)::integer into recent_attempts
  from public.booking_public_attempts attempt
  where attempt.public_slug = slug_value
    and attempt.ip_hash = ip_hash_value
    and attempt.created_at > now() - interval '15 minutes';
  if recent_attempts >= 10 then
    raise exception 'Too many booking attempts. Please try again later.' using errcode = '42900';
  end if;
  insert into public.booking_public_attempts (company_id, public_slug, ip_hash, guest_email)
  values (company_id_value, slug_value, ip_hash_value, guest_email_value);
  return private.booking_create_core(
    company_id_value, null, guest_name_value, guest_email_value, guest_phone_value,
    p_service_id, p_location_id, null, p_staff_id, p_starts_at, null,
    1, 1, 'pending', notes_value, null, null, 'public', null, null, true, slug_value
  );
end;
$$;

revoke all on function public.booking_public_create(text, uuid, uuid, uuid, timestamptz, text, text, text, text) from public, anon, authenticated;
grant execute on function public.booking_public_create(text, uuid, uuid, uuid, timestamptz, text, text, text, text) to service_role;

