-- OperiX HR workflow modules.
-- Additive recruitment, performance, organization, onboarding, offboarding,
-- and reusable approval primitives. All clients share these tables/RPCs.

begin;

insert into public.app_permissions (code, name, category, description, is_sensitive)
values
  ('organization.view', 'View organization structure', 'hr', 'View departments, teams, and positions.', false),
  ('organization.manage', 'Manage organization structure', 'hr', 'Create and maintain departments, teams, and positions.', true),
  ('recruitment.view', 'View recruitment', 'hr', 'View openings, candidates, applications, and interviews.', true),
  ('recruitment.manage', 'Manage recruitment', 'hr', 'Create and manage recruitment workflows.', true),
  ('performance.view', 'View performance', 'hr', 'View performance cycles, reviews, and goals.', true),
  ('performance.manage', 'Manage performance', 'hr', 'Create and manage performance cycles, reviews, and goals.', true),
  ('onboarding.view', 'View onboarding', 'hr', 'View onboarding tasks and progress.', true),
  ('onboarding.manage', 'Manage onboarding', 'hr', 'Create and manage onboarding workflows.', true),
  ('offboarding.view', 'View offboarding', 'hr', 'View employee offboarding cases.', true),
  ('offboarding.manage', 'Manage offboarding', 'hr', 'Create and manage employee offboarding workflows.', true)
on conflict (code) do update
set name = excluded.name,
    category = excluded.category,
    description = excluded.description,
    is_sensitive = excluded.is_sensitive;

insert into public.app_roles (company_id, code, name, description, is_system)
values
  (null, 'recruiter', 'Recruiter', 'Recruitment workflow access.', true),
  (null, 'manager', 'Manager', 'Team management access.', true),
  (null, 'employee', 'Employee', 'Employee self-service access.', true)
on conflict (code) where company_id is null do update
set name = excluded.name,
    description = excluded.description,
    is_system = true;

with grants(role_code, permission_code) as (
  values
    ('hr_admin', 'organization.view'), ('hr_admin', 'organization.manage'),
    ('hr_admin', 'recruitment.view'), ('hr_admin', 'recruitment.manage'),
    ('hr_admin', 'performance.view'), ('hr_admin', 'performance.manage'),
    ('hr_admin', 'onboarding.view'), ('hr_admin', 'onboarding.manage'),
    ('hr_admin', 'offboarding.view'), ('hr_admin', 'offboarding.manage'),
    ('hr_manager', 'organization.view'), ('hr_manager', 'organization.manage'),
    ('hr_manager', 'recruitment.view'), ('hr_manager', 'recruitment.manage'),
    ('hr_manager', 'performance.view'), ('hr_manager', 'performance.manage'),
    ('hr_manager', 'onboarding.view'), ('hr_manager', 'onboarding.manage'),
    ('hr_manager', 'offboarding.view'), ('hr_manager', 'offboarding.manage'),
    ('recruiter', 'recruitment.view'), ('recruiter', 'recruitment.manage'),
    ('manager', 'organization.view'), ('manager', 'recruitment.view'),
    ('manager', 'performance.view'), ('manager', 'performance.manage'),
    ('manager', 'onboarding.view'), ('manager', 'offboarding.view'),
    ('payroll_administrator', 'organization.view'),
    ('read_only', 'organization.view'), ('read_only', 'recruitment.view'),
    ('read_only', 'performance.view'), ('read_only', 'onboarding.view'),
    ('read_only', 'offboarding.view'),
    ('owner', 'organization.view'), ('owner', 'organization.manage'),
    ('owner', 'recruitment.view'), ('owner', 'recruitment.manage'),
    ('owner', 'performance.view'), ('owner', 'performance.manage'),
    ('owner', 'onboarding.view'), ('owner', 'onboarding.manage'),
    ('owner', 'offboarding.view'), ('owner', 'offboarding.manage'),
    ('super_administrator', 'organization.view'), ('super_administrator', 'organization.manage'),
    ('super_administrator', 'recruitment.view'), ('super_administrator', 'recruitment.manage'),
    ('super_administrator', 'performance.view'), ('super_administrator', 'performance.manage'),
    ('super_administrator', 'onboarding.view'), ('super_administrator', 'onboarding.manage'),
    ('super_administrator', 'offboarding.view'), ('super_administrator', 'offboarding.manage'),
    ('company_administrator', 'organization.view'), ('company_administrator', 'organization.manage'),
    ('company_administrator', 'recruitment.view'), ('company_administrator', 'recruitment.manage'),
    ('company_administrator', 'performance.view'), ('company_administrator', 'performance.manage'),
    ('company_administrator', 'onboarding.view'), ('company_administrator', 'onboarding.manage'),
    ('company_administrator', 'offboarding.view'), ('company_administrator', 'offboarding.manage')
)
insert into public.app_role_permissions (role_id, permission_code)
select role.id, grant_row.permission_code
from grants grant_row
join public.app_roles role
  on role.company_id is null
 and role.code = grant_row.role_code
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Shared organization structure
-- ---------------------------------------------------------------------------

create table if not exists public.hr_org_units (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  parent_id uuid references public.hr_org_units(id) on delete set null,
  manager_employee_id uuid references public.employees(id) on delete set null,
  unit_type text not null check (unit_type in ('department', 'team', 'position')),
  name text not null check (length(trim(name)) between 1 and 160),
  code text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, unit_type, name)
);

create index if not exists hr_org_units_company_parent_idx
  on public.hr_org_units (company_id, parent_id, unit_type, name);

-- ---------------------------------------------------------------------------
-- Recruitment pipeline
-- ---------------------------------------------------------------------------

create table if not exists public.hr_job_openings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  department text,
  description text,
  employment_type text not null default 'full_time' check (employment_type in ('full_time', 'part_time', 'contract', 'internship', 'temporary')),
  work_location text,
  status text not null default 'draft' check (status in ('draft', 'open', 'on_hold', 'closed')),
  openings integer not null default 1 check (openings > 0),
  hiring_manager_id uuid references auth.users(id) on delete set null,
  opened_on date,
  closes_on date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (closes_on is null or opened_on is null or closes_on >= opened_on)
);

create table if not exists public.hr_candidates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  first_name text not null check (length(trim(first_name)) between 1 and 120),
  last_name text not null check (length(trim(last_name)) between 1 and 120),
  email text,
  phone text,
  source text,
  resume_path text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_applications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  candidate_id uuid not null references public.hr_candidates(id) on delete restrict,
  job_opening_id uuid not null references public.hr_job_openings(id) on delete restrict,
  stage text not null default 'applied' check (stage in ('applied', 'screening', 'interview', 'final_interview', 'offer', 'hired', 'rejected')),
  assigned_to uuid references auth.users(id) on delete set null,
  notes text,
  applied_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  hired_employee_id uuid references public.employees(id) on delete set null,
  unique (candidate_id, job_opening_id)
);

create table if not exists public.hr_interviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  application_id uuid not null references public.hr_applications(id) on delete cascade,
  interviewer_id uuid references auth.users(id) on delete set null,
  scheduled_at timestamptz not null,
  location text,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  feedback text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hr_job_openings_company_status_idx
  on public.hr_job_openings (company_id, status, created_at desc);
create index if not exists hr_candidates_company_created_idx
  on public.hr_candidates (company_id, created_at desc);
create index if not exists hr_applications_company_stage_idx
  on public.hr_applications (company_id, stage, updated_at desc);
create index if not exists hr_interviews_company_schedule_idx
  on public.hr_interviews (company_id, scheduled_at);

-- ---------------------------------------------------------------------------
-- Performance, onboarding, and offboarding
-- ---------------------------------------------------------------------------

create table if not exists public.hr_performance_cycles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 160),
  starts_on date not null,
  ends_on date not null,
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create table if not exists public.hr_performance_reviews (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  cycle_id uuid not null references public.hr_performance_cycles(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete restrict,
  reviewer_id uuid references auth.users(id) on delete set null,
  status text not null default 'self_review' check (status in ('self_review', 'manager_review', 'completed')),
  rating smallint check (rating between 1 and 5),
  self_review text,
  manager_feedback text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cycle_id, employee_id)
);

create table if not exists public.hr_performance_goals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  cycle_id uuid references public.hr_performance_cycles(id) on delete set null,
  employee_id uuid not null references public.employees(id) on delete restrict,
  title text not null check (length(trim(title)) between 1 and 200),
  description text,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  progress smallint not null default 0 check (progress between 0 and 100),
  due_on date,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  description text,
  assigned_to uuid references auth.users(id) on delete set null,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'skipped')),
  due_on date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_offboarding_cases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete restrict,
  reason text not null check (reason in ('termination', 'resignation', 'contract_expiry', 'retirement', 'other')),
  last_working_day date not null,
  status text not null default 'open' check (status in ('open', 'completed', 'cancelled')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, status)
);

create table if not exists public.hr_offboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  case_id uuid not null references public.hr_offboarding_cases(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  assigned_to uuid references auth.users(id) on delete set null,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'skipped')),
  due_on date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hr_performance_reviews_employee_idx
  on public.hr_performance_reviews (company_id, employee_id, updated_at desc);
create index if not exists hr_performance_goals_employee_idx
  on public.hr_performance_goals (company_id, employee_id, status, due_on);
create index if not exists hr_onboarding_tasks_employee_idx
  on public.hr_onboarding_tasks (company_id, employee_id, status, due_on);
create index if not exists hr_offboarding_cases_company_status_idx
  on public.hr_offboarding_cases (company_id, status, last_working_day);

-- ---------------------------------------------------------------------------
-- RLS and grants. There are no client DELETE policies for historical HR data.
-- ---------------------------------------------------------------------------

alter table public.hr_org_units enable row level security;
alter table public.hr_job_openings enable row level security;
alter table public.hr_candidates enable row level security;
alter table public.hr_applications enable row level security;
alter table public.hr_interviews enable row level security;
alter table public.hr_performance_cycles enable row level security;
alter table public.hr_performance_reviews enable row level security;
alter table public.hr_performance_goals enable row level security;
alter table public.hr_onboarding_tasks enable row level security;
alter table public.hr_offboarding_cases enable row level security;
alter table public.hr_offboarding_tasks enable row level security;

revoke all on public.hr_org_units, public.hr_job_openings, public.hr_candidates,
  public.hr_applications, public.hr_interviews, public.hr_performance_cycles,
  public.hr_performance_reviews, public.hr_performance_goals,
  public.hr_onboarding_tasks, public.hr_offboarding_cases,
  public.hr_offboarding_tasks from public, anon, authenticated;

grant select, insert, update on public.hr_org_units to authenticated;
grant select, insert, update on public.hr_job_openings, public.hr_candidates,
  public.hr_applications, public.hr_interviews to authenticated;
grant select, insert, update on public.hr_performance_cycles,
  public.hr_performance_reviews, public.hr_performance_goals to authenticated;
grant select, insert, update on public.hr_onboarding_tasks,
  public.hr_offboarding_cases, public.hr_offboarding_tasks to authenticated;

create policy hr_org_units_select on public.hr_org_units for select to authenticated
using ((select private.has_company_permission(company_id, 'organization.view'))
  or (select private.has_company_permission(company_id, 'organization.manage')));
create policy hr_org_units_insert on public.hr_org_units for insert to authenticated
with check ((select private.has_company_permission(company_id, 'organization.manage')));
create policy hr_org_units_update on public.hr_org_units for update to authenticated
using ((select private.has_company_permission(company_id, 'organization.manage')))
with check ((select private.has_company_permission(company_id, 'organization.manage')));

create policy hr_job_openings_select on public.hr_job_openings for select to authenticated
using ((select private.has_company_permission(company_id, 'recruitment.view'))
  or (select private.has_company_permission(company_id, 'recruitment.manage')));
create policy hr_job_openings_insert on public.hr_job_openings for insert to authenticated
with check ((select private.has_company_permission(company_id, 'recruitment.manage')));
create policy hr_job_openings_update on public.hr_job_openings for update to authenticated
using ((select private.has_company_permission(company_id, 'recruitment.manage')))
with check ((select private.has_company_permission(company_id, 'recruitment.manage')));

create policy hr_candidates_select on public.hr_candidates for select to authenticated
using ((select private.has_company_permission(company_id, 'recruitment.view'))
  or (select private.has_company_permission(company_id, 'recruitment.manage')));
create policy hr_candidates_insert on public.hr_candidates for insert to authenticated
with check ((select private.has_company_permission(company_id, 'recruitment.manage')));
create policy hr_candidates_update on public.hr_candidates for update to authenticated
using ((select private.has_company_permission(company_id, 'recruitment.manage')))
with check ((select private.has_company_permission(company_id, 'recruitment.manage')));

create policy hr_applications_select on public.hr_applications for select to authenticated
using ((select private.has_company_permission(company_id, 'recruitment.view'))
  or (select private.has_company_permission(company_id, 'recruitment.manage')));
create policy hr_applications_insert on public.hr_applications for insert to authenticated
with check ((select private.has_company_permission(company_id, 'recruitment.manage')));
create policy hr_applications_update on public.hr_applications for update to authenticated
using ((select private.has_company_permission(company_id, 'recruitment.manage')))
with check ((select private.has_company_permission(company_id, 'recruitment.manage')));

create policy hr_interviews_select on public.hr_interviews for select to authenticated
using ((select private.has_company_permission(company_id, 'recruitment.view'))
  or (select private.has_company_permission(company_id, 'recruitment.manage')));
create policy hr_interviews_insert on public.hr_interviews for insert to authenticated
with check ((select private.has_company_permission(company_id, 'recruitment.manage')));
create policy hr_interviews_update on public.hr_interviews for update to authenticated
using ((select private.has_company_permission(company_id, 'recruitment.manage')))
with check ((select private.has_company_permission(company_id, 'recruitment.manage')));

create policy hr_performance_cycles_select on public.hr_performance_cycles for select to authenticated
using ((select private.has_company_permission(company_id, 'performance.view'))
  or (select private.has_company_permission(company_id, 'performance.manage')));
create policy hr_performance_cycles_insert on public.hr_performance_cycles for insert to authenticated
with check ((select private.has_company_permission(company_id, 'performance.manage')));
create policy hr_performance_cycles_update on public.hr_performance_cycles for update to authenticated
using ((select private.has_company_permission(company_id, 'performance.manage')))
with check ((select private.has_company_permission(company_id, 'performance.manage')));

create policy hr_performance_reviews_select on public.hr_performance_reviews for select to authenticated
using (exists (select 1 from public.employees employee where employee.id = employee_id and employee.user_id = (select auth.uid()) and employee.company_id = company_id)
  or (select private.has_company_permission(company_id, 'performance.view'))
  or (select private.has_company_permission(company_id, 'performance.manage')));
create policy hr_performance_reviews_insert on public.hr_performance_reviews for insert to authenticated
with check ((select private.has_company_permission(company_id, 'performance.manage'))
  and exists (select 1 from public.employees employee where employee.id = employee_id and employee.company_id = company_id));
create policy hr_performance_reviews_update on public.hr_performance_reviews for update to authenticated
using ((select private.has_company_permission(company_id, 'performance.manage')))
with check ((select private.has_company_permission(company_id, 'performance.manage')));

create policy hr_performance_goals_select on public.hr_performance_goals for select to authenticated
using (exists (select 1 from public.employees employee where employee.id = employee_id and employee.user_id = (select auth.uid()) and employee.company_id = company_id)
  or (select private.has_company_permission(company_id, 'performance.view'))
  or (select private.has_company_permission(company_id, 'performance.manage')));
create policy hr_performance_goals_insert on public.hr_performance_goals for insert to authenticated
with check ((select private.has_company_permission(company_id, 'performance.manage'))
  and exists (select 1 from public.employees employee where employee.id = employee_id and employee.company_id = company_id));
create policy hr_performance_goals_update on public.hr_performance_goals for update to authenticated
using ((select private.has_company_permission(company_id, 'performance.manage')))
with check ((select private.has_company_permission(company_id, 'performance.manage')));

create policy hr_onboarding_tasks_select on public.hr_onboarding_tasks for select to authenticated
using (exists (select 1 from public.employees employee where employee.id = employee_id and employee.user_id = (select auth.uid()) and employee.company_id = company_id)
  or (select private.has_company_permission(company_id, 'onboarding.view'))
  or (select private.has_company_permission(company_id, 'onboarding.manage')));
create policy hr_onboarding_tasks_insert on public.hr_onboarding_tasks for insert to authenticated
with check ((select private.has_company_permission(company_id, 'onboarding.manage'))
  and exists (select 1 from public.employees employee where employee.id = employee_id and employee.company_id = company_id));
create policy hr_onboarding_tasks_update on public.hr_onboarding_tasks for update to authenticated
using ((select private.has_company_permission(company_id, 'onboarding.manage')))
with check ((select private.has_company_permission(company_id, 'onboarding.manage')));

create policy hr_offboarding_cases_select on public.hr_offboarding_cases for select to authenticated
using ((select private.has_company_permission(company_id, 'offboarding.view'))
  or (select private.has_company_permission(company_id, 'offboarding.manage')));
create policy hr_offboarding_cases_insert on public.hr_offboarding_cases for insert to authenticated
with check ((select private.has_company_permission(company_id, 'offboarding.manage'))
  and exists (select 1 from public.employees employee where employee.id = employee_id and employee.company_id = company_id));
create policy hr_offboarding_cases_update on public.hr_offboarding_cases for update to authenticated
using ((select private.has_company_permission(company_id, 'offboarding.manage')))
with check ((select private.has_company_permission(company_id, 'offboarding.manage')));

create policy hr_offboarding_tasks_select on public.hr_offboarding_tasks for select to authenticated
using ((select private.has_company_permission(company_id, 'offboarding.view'))
  or (select private.has_company_permission(company_id, 'offboarding.manage')));
create policy hr_offboarding_tasks_insert on public.hr_offboarding_tasks for insert to authenticated
with check ((select private.has_company_permission(company_id, 'offboarding.manage'))
  and exists (select 1 from public.hr_offboarding_cases case_row where case_row.id = case_id and case_row.company_id = company_id));
create policy hr_offboarding_tasks_update on public.hr_offboarding_tasks for update to authenticated
using ((select private.has_company_permission(company_id, 'offboarding.manage')))
with check ((select private.has_company_permission(company_id, 'offboarding.manage')));

-- ---------------------------------------------------------------------------
-- Centralized commands for sensitive cross-table transitions
-- ---------------------------------------------------------------------------

create or replace function public.hr_convert_candidate_to_employee(
  p_application_id uuid,
  p_job_title text default null,
  p_department text default null,
  p_start_date date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  application_row public.hr_applications%rowtype;
  candidate_row public.hr_candidates%rowtype;
  opening_row public.hr_job_openings%rowtype;
  employee_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select application.* into application_row
  from public.hr_applications application
  where application.id = p_application_id
  for update;
  if not found then
    raise exception 'Application not found' using errcode = 'P0002';
  end if;
  if not private.has_company_permission(application_row.company_id, 'recruitment.manage')
     or not private.has_company_permission(application_row.company_id, 'employees.manage') then
    raise exception 'Recruitment and employee permissions are required' using errcode = '42501';
  end if;
  if application_row.stage = 'hired' and application_row.hired_employee_id is not null then
    return application_row.hired_employee_id;
  end if;

  select candidate.* into candidate_row
  from public.hr_candidates candidate
  where candidate.id = application_row.candidate_id
    and candidate.company_id = application_row.company_id;
  select opening.* into opening_row
  from public.hr_job_openings opening
  where opening.id = application_row.job_opening_id
    and opening.company_id = application_row.company_id;

  insert into public.employees (
    company_id, first_name, last_name, email, phone, job_title, department,
    status, hire_date, employment_start_date, payroll_ready_status
  )
  values (
    application_row.company_id, candidate_row.first_name, candidate_row.last_name,
    candidate_row.email, candidate_row.phone,
    coalesce(nullif(trim(p_job_title), ''), opening_row.title),
    nullif(trim(coalesce(p_department, opening_row.department)), ''),
    'active', p_start_date, p_start_date, 'pending'
  )
  returning id into employee_id;

  update public.hr_applications
  set stage = 'hired', hired_employee_id = employee_id, updated_at = clock_timestamp()
  where id = application_row.id;

  return employee_id;
end;
$$;

create or replace function public.hr_update_self_review(
  p_review_id uuid,
  p_self_review text
)
returns public.hr_performance_reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  review_row public.hr_performance_reviews%rowtype;
begin
  select review.* into review_row
  from public.hr_performance_reviews review
  join public.employees employee on employee.id = review.employee_id
  where review.id = p_review_id
    and employee.user_id = (select auth.uid())
  for update;
  if not found then
    raise exception 'Review not found' using errcode = 'P0002';
  end if;
  if review_row.status = 'completed' then
    raise exception 'Completed reviews cannot be modified' using errcode = 'P0001';
  end if;

  update public.hr_performance_reviews review
  set self_review = nullif(trim(p_self_review), ''),
      status = 'manager_review',
      updated_at = clock_timestamp()
  where review.id = review_row.id
  returning * into review_row;
  return review_row;
end;
$$;

create or replace function public.hr_resolve_approval(
  p_approval_id uuid,
  p_status text,
  p_note text default null
)
returns public.hr_approvals
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  approval_row public.hr_approvals%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_status not in ('approved', 'rejected', 'more_info') then
    raise exception 'Invalid approval status' using errcode = '22023';
  end if;

  select approval.* into approval_row
  from public.hr_approvals approval
  where approval.id = p_approval_id
  for update;
  if not found then
    raise exception 'Approval not found' using errcode = 'P0002';
  end if;
  if approval_row.resource_type = 'leave_request' then
    raise exception 'Use the leave review workflow for leave requests' using errcode = 'P0001';
  end if;
  if not (
    approval_row.assigned_to = current_user_id
    or private.has_company_permission(approval_row.company_id, 'hr.approvals.manage')
  ) then
    raise exception 'You do not have permission to resolve this approval' using errcode = '42501';
  end if;
  if approval_row.status <> 'pending' then
    raise exception 'Only pending approvals can be resolved' using errcode = 'P0001';
  end if;

  update public.hr_approvals approval
  set status = p_status,
      note = nullif(trim(p_note), ''),
      resolved_at = case when p_status = 'more_info' then null else clock_timestamp() end,
      resolved_by = case when p_status = 'more_info' then null else current_user_id end
  where approval.id = approval_row.id
  returning * into approval_row;
  return approval_row;
end;
$$;

revoke all on function public.hr_convert_candidate_to_employee(uuid, text, text, date) from public, anon;
revoke all on function public.hr_update_self_review(uuid, text) from public, anon;
revoke all on function public.hr_resolve_approval(uuid, text, text) from public, anon;
grant execute on function public.hr_convert_candidate_to_employee(uuid, text, text, date) to authenticated;
grant execute on function public.hr_update_self_review(uuid, text) to authenticated;
grant execute on function public.hr_resolve_approval(uuid, text, text) to authenticated;

-- Append-only audit coverage and realtime invalidation.
drop trigger if exists audit_hr_org_units on public.hr_org_units;
create trigger audit_hr_org_units after insert or update or delete on public.hr_org_units
for each row execute function private.audit_table_change();
drop trigger if exists audit_hr_job_openings on public.hr_job_openings;
create trigger audit_hr_job_openings after insert or update or delete on public.hr_job_openings
for each row execute function private.audit_table_change();
drop trigger if exists audit_hr_candidates on public.hr_candidates;
create trigger audit_hr_candidates after insert or update or delete on public.hr_candidates
for each row execute function private.audit_table_change();
drop trigger if exists audit_hr_applications on public.hr_applications;
create trigger audit_hr_applications after insert or update or delete on public.hr_applications
for each row execute function private.audit_table_change();
drop trigger if exists audit_hr_interviews on public.hr_interviews;
create trigger audit_hr_interviews after insert or update or delete on public.hr_interviews
for each row execute function private.audit_table_change();
drop trigger if exists audit_hr_performance_cycles on public.hr_performance_cycles;
create trigger audit_hr_performance_cycles after insert or update or delete on public.hr_performance_cycles
for each row execute function private.audit_table_change();
drop trigger if exists audit_hr_performance_reviews on public.hr_performance_reviews;
create trigger audit_hr_performance_reviews after insert or update or delete on public.hr_performance_reviews
for each row execute function private.audit_table_change();
drop trigger if exists audit_hr_performance_goals on public.hr_performance_goals;
create trigger audit_hr_performance_goals after insert or update or delete on public.hr_performance_goals
for each row execute function private.audit_table_change();
drop trigger if exists audit_hr_onboarding_tasks on public.hr_onboarding_tasks;
create trigger audit_hr_onboarding_tasks after insert or update or delete on public.hr_onboarding_tasks
for each row execute function private.audit_table_change();
drop trigger if exists audit_hr_offboarding_cases on public.hr_offboarding_cases;
create trigger audit_hr_offboarding_cases after insert or update or delete on public.hr_offboarding_cases
for each row execute function private.audit_table_change();
drop trigger if exists audit_hr_offboarding_tasks on public.hr_offboarding_tasks;
create trigger audit_hr_offboarding_tasks after insert or update or delete on public.hr_offboarding_tasks
for each row execute function private.audit_table_change();

do $$
begin
  begin alter publication supabase_realtime add table public.hr_org_units; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.hr_job_openings; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.hr_candidates; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.hr_applications; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.hr_interviews; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.hr_performance_cycles; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.hr_performance_reviews; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.hr_performance_goals; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.hr_onboarding_tasks; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.hr_offboarding_cases; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.hr_offboarding_tasks; exception when duplicate_object then null; end;
end $$;

commit;
