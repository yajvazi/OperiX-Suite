\set ON_ERROR_STOP on

-- Metadata-level regression checks for the shared HR tenant boundary.  The
-- test does not create fixture employees or mutate production data.
begin;

do $$
declare
  table_name text;
  protected_tables constant text[] := array[
    'employees', 'attendance_records', 'leave_requests', 'leave_types',
    'leave_balances', 'employee_documents', 'employment_contracts',
    'hr_announcements', 'hr_notifications', 'hr_approvals', 'audit_events',
    'hr_org_units', 'hr_job_openings', 'hr_candidates', 'hr_applications',
    'hr_interviews', 'hr_performance_cycles', 'hr_performance_reviews',
    'hr_performance_goals', 'hr_onboarding_tasks', 'hr_offboarding_cases',
    'hr_offboarding_tasks'
  ];
begin
  foreach table_name in array protected_tables loop
    if not exists (
      select 1 from pg_class relation
      join pg_namespace schema on schema.oid = relation.relnamespace
      where schema.nspname = 'public'
        and relation.relname = table_name
        and relation.relrowsecurity
    ) then
      raise exception 'HR table % does not have RLS enabled', table_name;
    end if;
    if has_table_privilege('anon', format('public.%I', table_name), 'SELECT') then
      raise exception 'anon retains SELECT on HR table %', table_name;
    end if;
  end loop;

  if has_column_privilege('authenticated', 'public.employees', 'base_salary', 'SELECT') then
    raise exception 'authenticated can select sensitive employee salary directly';
  end if;
  if has_column_privilege('authenticated', 'public.employees', 'permissions', 'SELECT') then
    raise exception 'authenticated can select sensitive employee permissions directly';
  end if;
  if has_table_privilege('authenticated', 'public.leave_requests', 'INSERT') then
    raise exception 'authenticated can bypass the shared leave command RPC';
  end if;
  if not exists (select 1 from storage.buckets where id = 'employee-documents' and public = false) then
    raise exception 'employee document storage bucket is not private or missing';
  end if;

  if not has_function_privilege('authenticated', 'public.hr_clock_in(uuid,uuid,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.hr_clock_out(uuid,uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.hr_submit_leave_request(uuid,uuid,text,date,date,text,numeric)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.hr_convert_candidate_to_employee(uuid,text,text,date)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.hr_start_offboarding(uuid,uuid,text,date,text)', 'EXECUTE')
  then
    raise exception 'shared HR command functions are not available to authenticated users';
  end if;
end $$;

rollback;
