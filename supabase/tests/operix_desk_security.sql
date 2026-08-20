\set ON_ERROR_STOP on

-- OperiX Desk invariants. Run against a migrated local Supabase project with
-- `psql` or the repository's normal Supabase test runner. Every mutation is
-- rolled back, so the fixture is unchanged.
begin;

do $$
declare
  v_company_id text := 'b984c30b-fd41-4a82-96b8-97d536638f0b';
  v_email text := 'desk-race-' || replace(gen_random_uuid()::text, '-', '') || '@example.test';
  v_user_id integer;
  v_resource_id integer;
  v_date date := current_date + 1;
  v_conflict boolean := false;
begin
  insert into public.users (email, hashed_password, role, full_name, company_id)
  values (v_email, 'migration-test-only', 'employee', 'Desk Race Test', v_company_id)
  returning id into v_user_id;

  insert into public.resources (name, type, building, floor, zone, company_id)
  values ('Race Test Desk', 'desk', 'Test Office', 'Test Floor', 'Test Zone', v_company_id)
  returning id into v_resource_id;

  insert into public.reservations (user_id, resource_id, date, status, company_id)
  values (v_user_id, v_resource_id, v_date, 'active', v_company_id);

  begin
    insert into public.reservations (user_id, resource_id, date, status, company_id)
    values (v_user_id, v_resource_id, v_date, 'active', v_company_id);
  exception when unique_violation then
    v_conflict := true;
  end;
  if not v_conflict then
    raise exception 'Desk all-day reservation race guard did not reject the duplicate';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'resources'
      and policyname = 'operix_desk_resources_select'
  ) then raise exception 'Desk resource tenant policy is missing'; end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'reservations'
      and policyname = 'operix_desk_reservations_insert'
  ) then raise exception 'Desk reservation insert policy is missing'; end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'operix_desk_active_all_day_resource_unique'
  ) then raise exception 'Desk all-day reservation unique index is missing'; end if;
  if not exists (
    select 1 from pg_class
    where relnamespace = 'public'::regnamespace
      and relname = 'users'
      and relrowsecurity
  ) then raise exception 'Desk users table must keep RLS enabled'; end if;
end
$$;

rollback;

-- Static policy checks remain useful even when no authenticated fixture user is
-- available. The policy expressions must reject NULL company scope and use the
-- shared company-access/permission functions.
select policyname, tablename
from pg_policies
where schemaname = 'public'
  and policyname like 'operix_desk_%'
order by tablename, policyname;
