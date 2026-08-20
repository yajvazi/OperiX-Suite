-- Keep same-company foreign references intact on workflow updates too.

begin;

drop policy if exists hr_applications_update on public.hr_applications;
create policy hr_applications_update on public.hr_applications for update to authenticated
using ((select private.has_company_permission(public.hr_applications.company_id, 'recruitment.manage')))
with check (
  (select private.has_company_permission(public.hr_applications.company_id, 'recruitment.manage'))
  and exists (select 1 from public.hr_candidates candidate where candidate.id = public.hr_applications.candidate_id and candidate.company_id = public.hr_applications.company_id)
  and exists (select 1 from public.hr_job_openings opening where opening.id = public.hr_applications.job_opening_id and opening.company_id = public.hr_applications.company_id)
);

drop policy if exists hr_interviews_update on public.hr_interviews;
create policy hr_interviews_update on public.hr_interviews for update to authenticated
using ((select private.has_company_permission(public.hr_interviews.company_id, 'recruitment.manage')))
with check (
  (select private.has_company_permission(public.hr_interviews.company_id, 'recruitment.manage'))
  and exists (select 1 from public.hr_applications application where application.id = public.hr_interviews.application_id and application.company_id = public.hr_interviews.company_id)
);

drop policy if exists hr_performance_reviews_update on public.hr_performance_reviews;
create policy hr_performance_reviews_update on public.hr_performance_reviews for update to authenticated
using ((select private.has_company_permission(public.hr_performance_reviews.company_id, 'performance.manage')))
with check (
  (select private.has_company_permission(public.hr_performance_reviews.company_id, 'performance.manage'))
  and exists (select 1 from public.employees employee where employee.id = public.hr_performance_reviews.employee_id and employee.company_id = public.hr_performance_reviews.company_id)
  and exists (select 1 from public.hr_performance_cycles cycle where cycle.id = public.hr_performance_reviews.cycle_id and cycle.company_id = public.hr_performance_reviews.company_id)
);

drop policy if exists hr_performance_goals_update on public.hr_performance_goals;
create policy hr_performance_goals_update on public.hr_performance_goals for update to authenticated
using ((select private.has_company_permission(public.hr_performance_goals.company_id, 'performance.manage')))
with check (
  (select private.has_company_permission(public.hr_performance_goals.company_id, 'performance.manage'))
  and exists (select 1 from public.employees employee where employee.id = public.hr_performance_goals.employee_id and employee.company_id = public.hr_performance_goals.company_id)
  and (public.hr_performance_goals.cycle_id is null or exists (select 1 from public.hr_performance_cycles cycle where cycle.id = public.hr_performance_goals.cycle_id and cycle.company_id = public.hr_performance_goals.company_id))
);

drop policy if exists hr_onboarding_tasks_update on public.hr_onboarding_tasks;
create policy hr_onboarding_tasks_update on public.hr_onboarding_tasks for update to authenticated
using ((select private.has_company_permission(public.hr_onboarding_tasks.company_id, 'onboarding.manage')))
with check (
  (select private.has_company_permission(public.hr_onboarding_tasks.company_id, 'onboarding.manage'))
  and exists (select 1 from public.employees employee where employee.id = public.hr_onboarding_tasks.employee_id and employee.company_id = public.hr_onboarding_tasks.company_id)
);

drop policy if exists hr_offboarding_cases_update on public.hr_offboarding_cases;
create policy hr_offboarding_cases_update on public.hr_offboarding_cases for update to authenticated
using ((select private.has_company_permission(public.hr_offboarding_cases.company_id, 'offboarding.manage')))
with check (
  (select private.has_company_permission(public.hr_offboarding_cases.company_id, 'offboarding.manage'))
  and exists (select 1 from public.employees employee where employee.id = public.hr_offboarding_cases.employee_id and employee.company_id = public.hr_offboarding_cases.company_id)
);

drop policy if exists hr_offboarding_tasks_update on public.hr_offboarding_tasks;
create policy hr_offboarding_tasks_update on public.hr_offboarding_tasks for update to authenticated
using ((select private.has_company_permission(public.hr_offboarding_tasks.company_id, 'offboarding.manage')))
with check (
  (select private.has_company_permission(public.hr_offboarding_tasks.company_id, 'offboarding.manage'))
  and exists (select 1 from public.hr_offboarding_cases case_row where case_row.id = public.hr_offboarding_tasks.case_id and case_row.company_id = public.hr_offboarding_tasks.company_id)
);

commit;
