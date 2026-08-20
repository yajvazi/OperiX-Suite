-- Development-only OperiX HR demo data.
-- This file deliberately refuses to run unless the local database exposes
-- app.environment=development. It is never part of a production migration.

begin;

do $$
declare
  environment_name text := current_setting('app.environment', true);
  company_id uuid;
  employee_id uuid;
  index_value integer;
  leave_type_code text;
begin
  if environment_name is distinct from 'development' then
    raise exception 'Refusing HR demo seed: app.environment must equal development';
  end if;

  select id into company_id from public.companies order by created_at nulls last limit 1;
  if company_id is null then
    raise exception 'Create a development company before running the HR demo seed';
  end if;

  for index_value in 1..156 loop
    insert into public.employees (
      company_id, first_name, last_name, email, job_title, department,
      status, hire_date, employee_number, payroll_ready_status
    )
    values (
      company_id,
      case when index_value % 4 = 0 then 'Arta' when index_value % 4 = 1 then 'John' when index_value % 4 = 2 then 'Elira' else 'Luan' end,
      'Demo ' || lpad(index_value::text, 3, '0'),
      'demo+' || index_value || '@operix.local',
      case when index_value % 3 = 0 then 'Engineer' when index_value % 3 = 1 then 'Specialist' else 'Coordinator' end,
      case when index_value % 4 = 0 then 'Finance' when index_value % 4 = 1 then 'Engineering' when index_value % 4 = 2 then 'Sales' else 'Operations' end,
      'active', current_date - (index_value % 720), 'DEMO-' || lpad(index_value::text, 3, '0'), 'pending'
    )
    returning id into employee_id;

    if index_value <= 128 then
      insert into public.attendance_records (company_id, employee_id, date, status, work_mode, check_in, check_out)
      values (company_id, employee_id, current_date, case when index_value % 8 = 0 then 'remote' else 'present' end, case when index_value % 8 = 0 then 'remote' else 'office' end, current_date + time '08:00', current_date + time '16:30');
    elsif index_value <= 144 then
      insert into public.leave_requests (company_id, employee_id, leave_type, start_date, end_date, requested_days, status, reason)
      values (company_id, employee_id, case when index_value % 2 = 0 then 'vacation' else 'sick' end, current_date, current_date, 1, 'approved', 'Development demo leave');
    else
      insert into public.attendance_records (company_id, employee_id, date, status, work_mode)
      values (company_id, employee_id, current_date, 'absent', 'office');
    end if;
  end loop;

  insert into public.hr_announcements (company_id, title, body, is_published)
  values
    (company_id, 'Welcome to the OperiX HR demo', 'This announcement exists only in the development seed.', true),
    (company_id, 'Payroll review window', 'Review the current payroll period before the development close date.', true);

  insert into public.hr_job_openings (company_id, title, department, employment_type, work_location, status, openings, opened_on)
  select company_id, seed.title, seed.department, 'full_time', seed.location, 'open', 1, current_date
  from (values
    ('Backend Engineer', 'Engineering', 'Hybrid'), ('People Operations Specialist', 'Operations', 'Pristina'),
    ('Account Executive', 'Sales', 'Remote'), ('Finance Analyst', 'Finance', 'Pristina')
  ) as seed(title, department, location);
end $$;

commit;
