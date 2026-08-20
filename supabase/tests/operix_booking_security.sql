\set ON_ERROR_STOP on

-- Static Booking invariants. Run after all migrations against a local
-- development Supabase database. This test is read-only.

do $$
declare
  table_name text;
  required_table text;
begin
  foreach required_table in array array[
    'booking_services', 'booking_locations', 'booking_resources',
    'booking_staff', 'booking_settings', 'bookings',
    'booking_status_history', 'booking_payments', 'booking_audit_log'
  ]
  loop
    if not exists (
      select 1 from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = required_table
        and relation.relrowsecurity
    ) then
      raise exception 'Booking table % must have RLS enabled', required_table;
    end if;
  end loop;

  if not exists (select 1 from pg_proc where proname = 'booking_create') then
    raise exception 'Canonical booking_create command is missing';
  end if;
  if not exists (select 1 from pg_proc where proname = 'booking_get_available_slots') then
    raise exception 'Canonical availability command is missing';
  end if;
  if not exists (select 1 from pg_proc where proname = 'booking_transition') then
    raise exception 'Canonical status transition command is missing';
  end if;
  if not exists (select 1 from pg_proc where proname = 'booking_list_customers') then
    raise exception 'Permission-checked customer directory command is missing';
  end if;
  if not exists (select 1 from pg_proc where proname = 'booking_create_customer') then
    raise exception 'Permission-checked customer creation command is missing';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'booking_bookings_calendar_idx'
  ) then
      raise exception 'Booking calendar index is missing';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'bookings'
      and policyname = 'booking_member_select'
      and coalesce(qual, '') like '%booking.read%'
  ) then
    raise exception 'Booking reads must require booking.read';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'booking_payments'
      and policyname = 'booking_member_select'
      and coalesce(qual, '') like '%payment.read%'
  ) then
    raise exception 'Payment reads must require payment.read';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'booking_audit_log'
      and policyname = 'booking_audit_read'
      and coalesce(qual, '') like '%booking.read%'
  ) then
    raise exception 'Audit reads must not be granted by booking.read';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'bookings'
      and policyname = 'booking_member_select'
      and coalesce(qual, '') like '%booking_user_can_access_staff%'
  ) then
    raise exception 'Assigned booking reads must require provider scope';
  end if;
  if has_function_privilege(
    'anon',
    'public.booking_public_create(text,uuid,uuid,uuid,timestamptz,text,text,text,text)',
    'execute'
  ) then
    raise exception 'Anonymous callers must not execute public booking creation directly';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.booking_public_create(text,uuid,uuid,uuid,timestamptz,text,text,text,text)',
    'execute'
  ) then
    raise exception 'Booking server role must execute public booking creation';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'booking_public_attempts_rate_lookup_idx'
  ) then
    raise exception 'Public booking rate lookup index is missing';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bookings'::regclass
      and conname = 'bookings_notes_length'
  ) then
    raise exception 'Booking note length constraint is missing';
  end if;
end
$$;

select tablename, policyname
from pg_policies
where schemaname = 'public'
  and tablename in ('bookings', 'booking_services', 'booking_resources', 'booking_staff')
order by tablename, policyname;
