-- Tighten cross-table tenant checks for workflow inserts. Qualify outer-row
-- columns so subqueries cannot accidentally compare a child row to itself.

begin;

drop policy if exists hr_org_units_insert on public.hr_org_units;
create policy hr_org_units_insert on public.hr_org_units for insert to authenticated
with check (
  (select private.has_company_permission(public.hr_org_units.company_id, 'organization.manage'))
  and (public.hr_org_units.parent_id is null or exists (
    select 1 from public.hr_org_units parent_unit
    where parent_unit.id = public.hr_org_units.parent_id
      and parent_unit.company_id = public.hr_org_units.company_id
  ))
  and (public.hr_org_units.manager_employee_id is null or exists (
    select 1 from public.employees manager_employee
    where manager_employee.id = public.hr_org_units.manager_employee_id
      and manager_employee.company_id = public.hr_org_units.company_id
  ))
);

drop policy if exists hr_org_units_update on public.hr_org_units;
create policy hr_org_units_update on public.hr_org_units for update to authenticated
using ((select private.has_company_permission(public.hr_org_units.company_id, 'organization.manage')))
with check (
  (select private.has_company_permission(public.hr_org_units.company_id, 'organization.manage'))
  and (public.hr_org_units.parent_id is null or exists (
    select 1 from public.hr_org_units parent_unit
    where parent_unit.id = public.hr_org_units.parent_id
      and parent_unit.company_id = public.hr_org_units.company_id
  ))
  and (public.hr_org_units.manager_employee_id is null or exists (
    select 1 from public.employees manager_employee
    where manager_employee.id = public.hr_org_units.manager_employee_id
      and manager_employee.company_id = public.hr_org_units.company_id
  ))
);

drop policy if exists hr_applications_insert on public.hr_applications;
create policy hr_applications_insert on public.hr_applications for insert to authenticated
with check (
  (select private.has_company_permission(public.hr_applications.company_id, 'recruitment.manage'))
  and exists (
    select 1 from public.hr_candidates candidate
    where candidate.id = public.hr_applications.candidate_id
      and candidate.company_id = public.hr_applications.company_id
  )
  and exists (
    select 1 from public.hr_job_openings opening
    where opening.id = public.hr_applications.job_opening_id
      and opening.company_id = public.hr_applications.company_id
  )
);

drop policy if exists hr_interviews_insert on public.hr_interviews;
create policy hr_interviews_insert on public.hr_interviews for insert to authenticated
with check (
  (select private.has_company_permission(public.hr_interviews.company_id, 'recruitment.manage'))
  and exists (
    select 1 from public.hr_applications application
    where application.id = public.hr_interviews.application_id
      and application.company_id = public.hr_interviews.company_id
  )
);

drop policy if exists hr_performance_reviews_select on public.hr_performance_reviews;
create policy hr_performance_reviews_select on public.hr_performance_reviews for select to authenticated
using (
  exists (
    select 1 from public.employees employee
    where employee.id = public.hr_performance_reviews.employee_id
      and employee.user_id = (select auth.uid())
      and employee.company_id = public.hr_performance_reviews.company_id
  )
  or (select private.has_company_permission(public.hr_performance_reviews.company_id, 'performance.view'))
  or (select private.has_company_permission(public.hr_performance_reviews.company_id, 'performance.manage'))
);

drop policy if exists hr_performance_reviews_insert on public.hr_performance_reviews;
create policy hr_performance_reviews_insert on public.hr_performance_reviews for insert to authenticated
with check (
  (select private.has_company_permission(public.hr_performance_reviews.company_id, 'performance.manage'))
  and exists (
    select 1 from public.employees employee
    where employee.id = public.hr_performance_reviews.employee_id
      and employee.company_id = public.hr_performance_reviews.company_id
  )
  and exists (
    select 1 from public.hr_performance_cycles cycle
    where cycle.id = public.hr_performance_reviews.cycle_id
      and cycle.company_id = public.hr_performance_reviews.company_id
  )
);

drop policy if exists hr_performance_goals_select on public.hr_performance_goals;
create policy hr_performance_goals_select on public.hr_performance_goals for select to authenticated
using (
  exists (
    select 1 from public.employees employee
    where employee.id = public.hr_performance_goals.employee_id
      and employee.user_id = (select auth.uid())
      and employee.company_id = public.hr_performance_goals.company_id
  )
  or (select private.has_company_permission(public.hr_performance_goals.company_id, 'performance.view'))
  or (select private.has_company_permission(public.hr_performance_goals.company_id, 'performance.manage'))
);

drop policy if exists hr_performance_goals_insert on public.hr_performance_goals;
create policy hr_performance_goals_insert on public.hr_performance_goals for insert to authenticated
with check (
  (select private.has_company_permission(public.hr_performance_goals.company_id, 'performance.manage'))
  and exists (
    select 1 from public.employees employee
    where employee.id = public.hr_performance_goals.employee_id
      and employee.company_id = public.hr_performance_goals.company_id
  )
  and (public.hr_performance_goals.cycle_id is null or exists (
    select 1 from public.hr_performance_cycles cycle
    where cycle.id = public.hr_performance_goals.cycle_id
      and cycle.company_id = public.hr_performance_goals.company_id
  ))
);

drop policy if exists hr_onboarding_tasks_select on public.hr_onboarding_tasks;
create policy hr_onboarding_tasks_select on public.hr_onboarding_tasks for select to authenticated
using (
  exists (
    select 1 from public.employees employee
    where employee.id = public.hr_onboarding_tasks.employee_id
      and employee.user_id = (select auth.uid())
      and employee.company_id = public.hr_onboarding_tasks.company_id
  )
  or (select private.has_company_permission(public.hr_onboarding_tasks.company_id, 'onboarding.view'))
  or (select private.has_company_permission(public.hr_onboarding_tasks.company_id, 'onboarding.manage'))
);

drop policy if exists hr_onboarding_tasks_insert on public.hr_onboarding_tasks;
create policy hr_onboarding_tasks_insert on public.hr_onboarding_tasks for insert to authenticated
with check (
  (select private.has_company_permission(public.hr_onboarding_tasks.company_id, 'onboarding.manage'))
  and exists (
    select 1 from public.employees employee
    where employee.id = public.hr_onboarding_tasks.employee_id
      and employee.company_id = public.hr_onboarding_tasks.company_id
  )
);

drop policy if exists hr_offboarding_cases_insert on public.hr_offboarding_cases;
create policy hr_offboarding_cases_insert on public.hr_offboarding_cases for insert to authenticated
with check (
  (select private.has_company_permission(public.hr_offboarding_cases.company_id, 'offboarding.manage'))
  and exists (
    select 1 from public.employees employee
    where employee.id = public.hr_offboarding_cases.employee_id
      and employee.company_id = public.hr_offboarding_cases.company_id
  )
);

drop policy if exists hr_offboarding_tasks_insert on public.hr_offboarding_tasks;
create policy hr_offboarding_tasks_insert on public.hr_offboarding_tasks for insert to authenticated
with check (
  (select private.has_company_permission(public.hr_offboarding_tasks.company_id, 'offboarding.manage'))
  and exists (
    select 1 from public.hr_offboarding_cases case_row
    where case_row.id = public.hr_offboarding_tasks.case_id
      and case_row.company_id = public.hr_offboarding_tasks.company_id
  )
);

commit;
