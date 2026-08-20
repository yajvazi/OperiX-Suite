-- Centralize offboarding so employee history, case state, and checklist tasks
-- are changed atomically and audited together.

begin;

create or replace function public.hr_start_offboarding(
  p_company_id uuid,
  p_employee_id uuid,
  p_reason text,
  p_last_working_day date,
  p_notes text default null
)
returns public.hr_offboarding_cases
language plpgsql
security definer
set search_path = ''
as $$
declare
  employee_row public.employees%rowtype;
  case_row public.hr_offboarding_cases%rowtype;
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_reason not in ('termination', 'resignation', 'contract_expiry', 'retirement', 'other') then
    raise exception 'Invalid offboarding reason' using errcode = '22023';
  end if;
  if not private.has_company_permission(p_company_id, 'offboarding.manage')
     or not private.has_company_permission(p_company_id, 'employees.manage') then
    raise exception 'Offboarding and employee permissions are required' using errcode = '42501';
  end if;

  select employee.* into employee_row
  from public.employees employee
  where employee.id = p_employee_id
    and employee.company_id = p_company_id
  for update;
  if not found then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.hr_offboarding_cases existing
    where existing.employee_id = p_employee_id
      and existing.status = 'open'
  ) then
    raise exception 'An open offboarding case already exists' using errcode = '23505';
  end if;

  insert into public.hr_offboarding_cases (
    company_id, employee_id, reason, last_working_day, notes, created_by
  )
  values (
    p_company_id, p_employee_id, p_reason, p_last_working_day,
    nullif(trim(p_notes), ''), current_user_id
  )
  returning * into case_row;

  update public.employees employee
  set status = 'terminated',
      employment_end_date = p_last_working_day,
      updated_at = clock_timestamp()
  where employee.id = p_employee_id;

  insert into public.hr_offboarding_tasks (company_id, case_id, title, due_on)
  values
    (p_company_id, case_row.id, 'Disable OperiX access', p_last_working_day),
    (p_company_id, case_row.id, 'Return equipment', p_last_working_day),
    (p_company_id, case_row.id, 'Finalize payroll', p_last_working_day),
    (p_company_id, case_row.id, 'Collect HR documents', p_last_working_day),
    (p_company_id, case_row.id, 'Complete exit checklist', p_last_working_day);

  return case_row;
end;
$$;

revoke all on function public.hr_start_offboarding(uuid, uuid, text, date, text) from public, anon;
grant execute on function public.hr_start_offboarding(uuid, uuid, text, date, text) to authenticated;

commit;
