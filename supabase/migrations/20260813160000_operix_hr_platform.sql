-- OperiX HR platform foundation.
--
-- This migration is additive to the existing OperiX account, company,
-- membership, payroll, document, and audit model. Web and mobile clients use
-- the same tables and RPCs; no HR-specific auth or tenant tables are created.

begin;

-- ---------------------------------------------------------------------------
-- Shared HR permissions and system roles
-- ---------------------------------------------------------------------------

insert into public.app_permissions (code, name, category, description, is_sensitive)
values
  ('employees.view', 'View employees', 'hr', 'View non-sensitive employee directory data.', false),
  ('attendance.view', 'View attendance', 'hr', 'View attendance records for an organization.', false),
  ('leave.view', 'View leave', 'hr', 'View leave requests and balances for an organization.', false),
  ('leave.request', 'Request leave for others', 'hr', 'Create leave requests on behalf of an employee.', false),
  ('leave.approve', 'Approve leave', 'hr', 'Approve, reject, and review leave requests.', false),
  ('leave.types.manage', 'Manage leave types', 'hr', 'Configure organization leave types and allowances.', true),
  ('hr.documents.view', 'View HR documents', 'hr', 'View private employee HR documents.', true),
  ('hr.documents.manage', 'Manage HR documents', 'hr', 'Upload, update, and delete private HR documents.', true),
  ('hr.contracts.view', 'View HR contracts', 'hr', 'View employee contracts.', true),
  ('hr.contracts.manage', 'Manage HR contracts', 'hr', 'Create and update employee contracts.', true),
  ('hr.announcements.manage', 'Manage HR announcements', 'hr', 'Create and publish organization announcements.', false),
  ('hr.approvals.view', 'View HR approvals', 'hr', 'View assigned HR approval work.', false),
  ('hr.approvals.manage', 'Manage HR approvals', 'hr', 'Resolve HR approvals and corrections.', false),
  ('hr.reports.view', 'View HR reports', 'hr', 'View HR operational reports.', false)
on conflict (code) do update
set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  is_sensitive = excluded.is_sensitive;

insert into public.app_roles (company_id, code, name, description, is_system)
values
  (null, 'hr_admin', 'HR administrator', 'Full HR administration except organization security ownership.', true)
on conflict (code) where company_id is null do update
set
  name = excluded.name,
  description = excluded.description,
  is_system = true;

with grants(role_code, permission_code) as (
  values
    ('hr_admin', 'employees.view'), ('hr_admin', 'employees.manage'),
    ('hr_admin', 'attendance.view'), ('hr_admin', 'attendance.manage'),
    ('hr_admin', 'leave.view'), ('hr_admin', 'leave.request'), ('hr_admin', 'leave.approve'),
    ('hr_admin', 'leave.types.manage'), ('hr_admin', 'hr.documents.view'),
    ('hr_admin', 'hr.documents.manage'), ('hr_admin', 'hr.contracts.view'),
    ('hr_admin', 'hr.contracts.manage'), ('hr_admin', 'hr.announcements.manage'),
    ('hr_admin', 'hr.approvals.view'), ('hr_admin', 'hr.approvals.manage'),
    ('hr_admin', 'hr.reports.view'),
    ('hr_manager', 'employees.view'), ('hr_manager', 'employees.manage'),
    ('hr_manager', 'attendance.view'), ('hr_manager', 'attendance.manage'),
    ('hr_manager', 'leave.view'), ('hr_manager', 'leave.request'), ('hr_manager', 'leave.approve'),
    ('hr_manager', 'leave.types.manage'), ('hr_manager', 'hr.documents.view'),
    ('hr_manager', 'hr.documents.manage'), ('hr_manager', 'hr.contracts.view'),
    ('hr_manager', 'hr.contracts.manage'), ('hr_manager', 'hr.announcements.manage'),
    ('hr_manager', 'hr.approvals.view'), ('hr_manager', 'hr.approvals.manage'),
    ('hr_manager', 'hr.reports.view'),
    ('payroll_administrator', 'employees.view'), ('payroll_administrator', 'attendance.view'),
    ('payroll_administrator', 'leave.view'), ('payroll_administrator', 'hr.documents.view'),
    ('payroll_administrator', 'hr.contracts.view'), ('payroll_administrator', 'hr.reports.view'),
    ('read_only', 'employees.view'), ('read_only', 'attendance.view'),
    ('read_only', 'leave.view'), ('read_only', 'hr.reports.view'),
    ('owner', 'employees.view'), ('owner', 'employees.manage'),
    ('owner', 'attendance.view'), ('owner', 'attendance.manage'),
    ('owner', 'leave.view'), ('owner', 'leave.request'), ('owner', 'leave.approve'),
    ('owner', 'leave.types.manage'), ('owner', 'hr.documents.view'),
    ('owner', 'hr.documents.manage'), ('owner', 'hr.contracts.view'),
    ('owner', 'hr.contracts.manage'), ('owner', 'hr.announcements.manage'),
    ('owner', 'hr.approvals.view'), ('owner', 'hr.approvals.manage'), ('owner', 'hr.reports.view'),
    ('super_administrator', 'employees.view'), ('super_administrator', 'employees.manage'),
    ('super_administrator', 'attendance.view'), ('super_administrator', 'attendance.manage'),
    ('super_administrator', 'leave.view'), ('super_administrator', 'leave.request'), ('super_administrator', 'leave.approve'),
    ('super_administrator', 'leave.types.manage'), ('super_administrator', 'hr.documents.view'),
    ('super_administrator', 'hr.documents.manage'), ('super_administrator', 'hr.contracts.view'),
    ('super_administrator', 'hr.contracts.manage'), ('super_administrator', 'hr.announcements.manage'),
    ('super_administrator', 'hr.approvals.view'), ('super_administrator', 'hr.approvals.manage'), ('super_administrator', 'hr.reports.view'),
    ('company_administrator', 'employees.view'), ('company_administrator', 'employees.manage'),
    ('company_administrator', 'attendance.view'), ('company_administrator', 'attendance.manage'),
    ('company_administrator', 'leave.view'), ('company_administrator', 'leave.request'), ('company_administrator', 'leave.approve'),
    ('company_administrator', 'leave.types.manage'), ('company_administrator', 'hr.documents.view'),
    ('company_administrator', 'hr.documents.manage'), ('company_administrator', 'hr.contracts.view'),
    ('company_administrator', 'hr.contracts.manage'), ('company_administrator', 'hr.announcements.manage'),
    ('company_administrator', 'hr.approvals.view'), ('company_administrator', 'hr.approvals.manage'), ('company_administrator', 'hr.reports.view')
)
insert into public.app_role_permissions (role_id, permission_code)
select role.id, grant_row.permission_code
from grants grant_row
join public.app_roles role
  on role.company_id is null
 and role.code = grant_row.role_code
on conflict do nothing;

-- Legacy membership roles are kept as the account source of truth. These
-- assignments only add HR capabilities; they do not remove existing roles.
insert into public.membership_role_assignments (membership_id, role_id)
select membership.id, role.id
from public.memberships membership
join public.app_roles role
  on role.company_id is null
 and role.code = case lower(coalesce(membership.role, ''))
   when 'manager' then 'hr_manager'
   when 'hr_manager' then 'hr_manager'
   when 'hr_admin' then 'hr_admin'
   when 'payroll_manager' then 'payroll_administrator'
   when 'payroll_administrator' then 'payroll_administrator'
   else null
 end
where coalesce(membership.status, 'active') = 'active'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Existing attendance and leave records: additive fields and domain checks
-- ---------------------------------------------------------------------------

alter table public.attendance_records
  add column if not exists work_mode text not null default 'office',
  add column if not exists updated_at timestamptz not null default now();

update public.attendance_records
set work_mode = 'remote'
where status = 'remote' and work_mode <> 'remote';

alter table public.attendance_records
  drop constraint if exists attendance_records_status_check;

alter table public.attendance_records
  add constraint attendance_records_status_check
  check (status in ('present', 'absent', 'late', 'remote', 'sick', 'on_leave', 'half_day', 'holiday'));

alter table public.attendance_records
  drop constraint if exists attendance_records_work_mode_check;

alter table public.attendance_records
  add constraint attendance_records_work_mode_check
  check (work_mode in ('office', 'remote'));

alter table public.leave_requests
  add column if not exists requested_days numeric(8, 2),
  add column if not exists reviewer_note text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.leave_requests
  drop constraint if exists leave_requests_leave_type_check;

alter table public.leave_requests
  add constraint leave_requests_leave_type_check
  check (leave_type in (
    'vacation', 'annual', 'annual_leave', 'sick', 'sick_leave', 'personal',
    'personal_leave', 'unpaid', 'unpaid_leave', 'maternity', 'paternity',
    'bereavement', 'other'
  ));

alter table public.leave_requests
  drop constraint if exists leave_requests_status_check;

alter table public.leave_requests
  add constraint leave_requests_status_check
  check (status in ('draft', 'pending', 'approved', 'rejected', 'cancelled'));

create index if not exists attendance_records_company_date_idx
  on public.attendance_records (company_id, date desc);

create unique index if not exists attendance_records_employee_date_unique
  on public.attendance_records (employee_id, date)
  where employee_id is not null and date is not null;

create index if not exists leave_requests_company_dates_idx
  on public.leave_requests (company_id, start_date, end_date);

-- ---------------------------------------------------------------------------
-- HR reference and workflow tables
-- ---------------------------------------------------------------------------

create table if not exists public.leave_types (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  annual_allowance numeric(8, 2) not null default 0 check (annual_allowance >= 0),
  is_paid boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

create table if not exists public.leave_balances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_type_id uuid not null references public.leave_types(id) on delete cascade,
  year integer not null check (year between 2000 and 2200),
  allowance numeric(8, 2) not null default 0 check (allowance >= 0),
  carried_over numeric(8, 2) not null default 0 check (carried_over >= 0),
  used numeric(8, 2) not null default 0 check (used >= 0),
  pending numeric(8, 2) not null default 0 check (pending >= 0),
  remaining numeric(8, 2) generated always as (greatest(0::numeric, allowance + carried_over - used - pending)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, leave_type_id, year)
);

create table if not exists public.hr_announcements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  body text not null check (length(trim(body)) between 1 and 10000),
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  is_published boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or expires_at >= published_at)
);

create table if not exists public.hr_notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.hr_approvals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  resource_type text not null,
  resource_id uuid not null,
  requested_by uuid not null references auth.users(id) on delete restrict,
  assigned_to uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'more_info', 'cancelled')),
  note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);

create index if not exists leave_balances_employee_year_idx
  on public.leave_balances (company_id, employee_id, year);
create index if not exists hr_announcements_company_published_idx
  on public.hr_announcements (company_id, is_published, published_at desc);
create index if not exists hr_notifications_user_unread_idx
  on public.hr_notifications (company_id, user_id, read_at, created_at desc);
create index if not exists hr_approvals_inbox_idx
  on public.hr_approvals (company_id, status, assigned_to, created_at desc);

insert into public.leave_types (company_id, code, name, annual_allowance, is_paid)
select company.id, seed.code, seed.name, seed.annual_allowance, seed.is_paid
from public.companies company
cross join (values
  ('vacation', 'Annual Leave', 20::numeric, true),
  ('sick', 'Sick Leave', 10::numeric, true),
  ('personal', 'Personal Leave', 3::numeric, true),
  ('unpaid', 'Unpaid Leave', 0::numeric, false),
  ('maternity', 'Maternity Leave', 0::numeric, true),
  ('paternity', 'Paternity Leave', 0::numeric, true),
  ('bereavement', 'Bereavement Leave', 0::numeric, true),
  ('other', 'Other', 0::numeric, false)
) as seed(code, name, annual_allowance, is_paid)
on conflict (company_id, code) do nothing;

-- ---------------------------------------------------------------------------
-- RLS: authenticated users only, company scope and explicit permissions
-- ---------------------------------------------------------------------------

alter table public.employees enable row level security;
alter table public.attendance_records enable row level security;
alter table public.leave_requests enable row level security;
alter table public.payrolls enable row level security;
alter table public.employee_documents enable row level security;
alter table public.employment_contracts enable row level security;
alter table public.leave_types enable row level security;
alter table public.leave_balances enable row level security;
alter table public.hr_announcements enable row level security;
alter table public.hr_notifications enable row level security;
alter table public.hr_approvals enable row level security;

drop policy if exists "Access all for owner" on public.employees;
drop policy if exists "Admins can manage employees" on public.employees;
drop policy if exists "Company owners can insert employees" on public.employees;
drop policy if exists "Users can view own employee record" on public.employees;
drop policy if exists "Users can view their company employees" on public.employees;

create policy hr_employees_self_select
on public.employees for select to authenticated
using ((select auth.uid()) = user_id);

create policy hr_employees_company_select
on public.employees for select to authenticated
using (
  (select private.has_company_permission(company_id, 'employees.view'))
  or (select private.has_company_permission(company_id, 'employees.manage'))
);

create policy hr_employees_insert
on public.employees for insert to authenticated
with check ((select private.has_company_permission(company_id, 'employees.manage')));

create policy hr_employees_update
on public.employees for update to authenticated
using ((select private.has_company_permission(company_id, 'employees.manage')))
with check ((select private.has_company_permission(company_id, 'employees.manage')));

-- Employee rows are retained for audit and reporting. There is deliberately no
-- client DELETE policy; termination is represented by status and end dates.

drop policy if exists "Admins can view company attendance" on public.attendance_records;
drop policy if exists "Employees can insert their own attendance" on public.attendance_records;
drop policy if exists "Employees can update their own attendance" on public.attendance_records;
drop policy if exists "Employees can view their own attendance" on public.attendance_records;

create policy hr_attendance_select
on public.attendance_records for select to authenticated
using (
  exists (
    select 1 from public.employees employee
    where employee.id = attendance_records.employee_id
      and employee.user_id = (select auth.uid())
      and employee.company_id = attendance_records.company_id
  )
  or (select private.has_company_permission(company_id, 'attendance.view'))
  or (select private.has_company_permission(company_id, 'attendance.manage'))
);

create policy hr_attendance_insert
on public.attendance_records for insert to authenticated
with check (
  exists (
    select 1 from public.employees employee
    where employee.id = attendance_records.employee_id
      and employee.company_id = attendance_records.company_id
      and (
        employee.user_id = (select auth.uid())
        or (select private.has_company_permission(attendance_records.company_id, 'attendance.manage'))
      )
  )
);

create policy hr_attendance_update
on public.attendance_records for update to authenticated
using (
  exists (
    select 1 from public.employees employee
    where employee.id = attendance_records.employee_id
      and employee.user_id = (select auth.uid())
      and employee.company_id = attendance_records.company_id
  )
  or (select private.has_company_permission(company_id, 'attendance.manage'))
)
with check (
  exists (
    select 1 from public.employees employee
    where employee.id = attendance_records.employee_id
      and employee.company_id = attendance_records.company_id
      and (
        employee.user_id = (select auth.uid())
        or (select private.has_company_permission(attendance_records.company_id, 'attendance.manage'))
      )
  )
);

drop policy if exists "Admins can update leave request status" on public.leave_requests;
drop policy if exists "Admins can view company leave requests" on public.leave_requests;
drop policy if exists "Employees can insert their own leave requests" on public.leave_requests;
drop policy if exists "Employees can view their own leave requests" on public.leave_requests;

create policy hr_leave_select
on public.leave_requests for select to authenticated
using (
  exists (
    select 1 from public.employees employee
    where employee.id = leave_requests.employee_id
      and employee.user_id = (select auth.uid())
      and employee.company_id = leave_requests.company_id
  )
  or (select private.has_company_permission(company_id, 'leave.view'))
  or (select private.has_company_permission(company_id, 'leave.approve'))
);

create policy hr_leave_insert
on public.leave_requests for insert to authenticated
with check (
  exists (
    select 1 from public.employees employee
    where employee.id = leave_requests.employee_id
      and employee.company_id = leave_requests.company_id
      and (
        employee.user_id = (select auth.uid())
        or (select private.has_company_permission(leave_requests.company_id, 'leave.request'))
        or (select private.has_company_permission(leave_requests.company_id, 'leave.approve'))
      )
  )
);

drop policy if exists "Manage payrolls policy" on public.payrolls;
drop policy if exists "View payrolls policy" on public.payrolls;

create policy hr_payroll_select
on public.payrolls for select to authenticated
using (
  exists (
    select 1 from public.employees employee
    where employee.id = payrolls.employee_id
      and employee.user_id = (select auth.uid())
      and employee.company_id = payrolls.company_id
  )
  or (select private.has_company_permission(company_id, 'payroll.dashboard.view'))
  or (select private.has_company_permission(company_id, 'payroll.salaries.view'))
);

create policy hr_payroll_insert
on public.payrolls for insert to authenticated
with check (
  (select private.has_company_permission(company_id, 'payroll.compensation.manage'))
  or (select private.has_company_permission(company_id, 'payroll.run.calculate'))
);

create policy hr_payroll_update
on public.payrolls for update to authenticated
using (
  (select private.has_company_permission(company_id, 'payroll.compensation.manage'))
  or (select private.has_company_permission(company_id, 'payroll.run.calculate'))
)
with check (
  (select private.has_company_permission(company_id, 'payroll.compensation.manage'))
  or (select private.has_company_permission(company_id, 'payroll.run.calculate'))
);

drop policy if exists "Admins can manage company documents" on public.employee_documents;
drop policy if exists "Admins can view company documents" on public.employee_documents;
drop policy if exists "Users can view their own documents" on public.employee_documents;

create policy hr_documents_select
on public.employee_documents for select to authenticated
using (
  exists (
    select 1 from public.employees employee
    where employee.id = employee_documents.employee_id
      and employee.user_id = (select auth.uid())
  )
  or (select private.has_company_permission(company_id, 'hr.documents.view'))
  or (select private.has_company_permission(company_id, 'hr.documents.manage'))
  or (select private.has_company_permission(company_id, 'document.archive.view'))
);

create policy hr_documents_insert
on public.employee_documents for insert to authenticated
with check (
  (select private.has_company_permission(company_id, 'hr.documents.manage'))
  and exists (
    select 1 from public.employees employee
    where employee.id = employee_documents.employee_id
      and employee.company_id = employee_documents.company_id
  )
);

create policy hr_documents_update
on public.employee_documents for update to authenticated
using ((select private.has_company_permission(company_id, 'hr.documents.manage')))
with check ((select private.has_company_permission(company_id, 'hr.documents.manage')));

create policy hr_documents_delete
on public.employee_documents for delete to authenticated
using ((select private.has_company_permission(company_id, 'hr.documents.manage')));

drop policy if exists employment_contracts_payroll_read on public.employment_contracts;

create policy hr_contracts_select
on public.employment_contracts for select to authenticated
using (
  exists (
    select 1 from public.employees employee
    where employee.id = employment_contracts.employee_id
      and employee.user_id = (select auth.uid())
      and employee.company_id = employment_contracts.company_id
  )
  or (select private.has_company_permission(company_id, 'hr.contracts.view'))
  or (select private.has_company_permission(company_id, 'hr.contracts.manage'))
  or (select private.has_company_permission(company_id, 'payroll.dashboard.view'))
);

create policy hr_contracts_insert
on public.employment_contracts for insert to authenticated
with check (
  (select private.has_company_permission(company_id, 'hr.contracts.manage'))
  or (select private.has_company_permission(company_id, 'payroll.configuration.manage'))
);

create policy hr_contracts_update
on public.employment_contracts for update to authenticated
using (
  (select private.has_company_permission(company_id, 'hr.contracts.manage'))
  or (select private.has_company_permission(company_id, 'payroll.configuration.manage'))
)
with check (
  (select private.has_company_permission(company_id, 'hr.contracts.manage'))
  or (select private.has_company_permission(company_id, 'payroll.configuration.manage'))
);

create policy hr_leave_types_select
on public.leave_types for select to authenticated
using ((select private.is_company_member(company_id)));

create policy hr_leave_types_insert
on public.leave_types for insert to authenticated
with check ((select private.has_company_permission(company_id, 'leave.types.manage')));

create policy hr_leave_types_update
on public.leave_types for update to authenticated
using ((select private.has_company_permission(company_id, 'leave.types.manage')))
with check ((select private.has_company_permission(company_id, 'leave.types.manage')));

create policy hr_leave_balances_select
on public.leave_balances for select to authenticated
using (
  exists (
    select 1 from public.employees employee
    where employee.id = leave_balances.employee_id
      and employee.user_id = (select auth.uid())
      and employee.company_id = leave_balances.company_id
  )
  or (select private.has_company_permission(company_id, 'leave.view'))
  or (select private.has_company_permission(company_id, 'leave.approve'))
);

create policy hr_announcements_select
on public.hr_announcements for select to authenticated
using (
  (
    (select private.is_company_member(company_id))
    and is_published
    and published_at <= now()
    and (expires_at is null or expires_at >= now())
  )
  or (select private.has_company_permission(company_id, 'hr.announcements.manage'))
);

create policy hr_announcements_insert
on public.hr_announcements for insert to authenticated
with check ((select private.has_company_permission(company_id, 'hr.announcements.manage')));

create policy hr_announcements_update
on public.hr_announcements for update to authenticated
using ((select private.has_company_permission(company_id, 'hr.announcements.manage')))
with check ((select private.has_company_permission(company_id, 'hr.announcements.manage')));

create policy hr_announcements_delete
on public.hr_announcements for delete to authenticated
using ((select private.has_company_permission(company_id, 'hr.announcements.manage')));

create policy hr_notifications_select
on public.hr_notifications for select to authenticated
using (user_id = (select auth.uid()));

create policy hr_notifications_update
on public.hr_notifications for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy hr_approvals_select
on public.hr_approvals for select to authenticated
using (
  requested_by = (select auth.uid())
  or assigned_to = (select auth.uid())
  or (select private.has_company_permission(company_id, 'hr.approvals.view'))
  or (select private.has_company_permission(company_id, 'leave.approve'))
);

-- Workflow transitions happen through the security-definer RPCs below. There
-- are no direct client update/delete policies for balances or approvals.

grant select, insert, update on public.leave_types to authenticated;
grant select on public.leave_balances to authenticated;
grant select, insert, update, delete on public.hr_announcements to authenticated;
grant select, update on public.hr_notifications to authenticated;
grant select on public.hr_approvals to authenticated;

-- ---------------------------------------------------------------------------
-- Centralized HR workflows
-- ---------------------------------------------------------------------------

create or replace function public.hr_clock_in(
  p_company_id uuid,
  p_employee_id uuid,
  p_work_mode text default 'office'
)
returns public.attendance_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  employee_row public.employees%rowtype;
  attendance_row public.attendance_records%rowtype;
  today_date date := current_date;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_work_mode not in ('office', 'remote') then
    raise exception 'Invalid work mode' using errcode = '22023';
  end if;

  select employee.* into employee_row
  from public.employees employee
  where employee.id = p_employee_id
    and employee.company_id = p_company_id;

  if not found then
    raise exception 'Employee not found in this organization' using errcode = 'P0002';
  end if;
  if not (
    coalesce(employee_row.user_id = current_user_id, false)
    or private.has_company_permission(p_company_id, 'attendance.manage')
  ) then
    raise exception 'You do not have permission to clock in for this employee' using errcode = '42501';
  end if;

  select attendance.* into attendance_row
  from public.attendance_records attendance
  where attendance.employee_id = p_employee_id
    and attendance.company_id = p_company_id
    and attendance.date = today_date
  for update;

  if found then
    if attendance_row.check_out is null then
      raise exception 'This employee is already clocked in' using errcode = '23505';
    end if;
    raise exception 'Attendance is already recorded for today' using errcode = '23505';
  end if;

  insert into public.attendance_records (
    employee_id, company_id, date, check_in, status, work_mode
  )
  values (
    p_employee_id, p_company_id, today_date, clock_timestamp(),
    case when p_work_mode = 'remote' then 'remote' else 'present' end,
    p_work_mode
  )
  returning * into attendance_row;

  return attendance_row;
end;
$$;

create or replace function public.hr_clock_out(
  p_company_id uuid,
  p_employee_id uuid
)
returns public.attendance_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  employee_row public.employees%rowtype;
  attendance_row public.attendance_records%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select employee.* into employee_row
  from public.employees employee
  where employee.id = p_employee_id
    and employee.company_id = p_company_id;
  if not found then
    raise exception 'Employee not found in this organization' using errcode = 'P0002';
  end if;
  if not (
    coalesce(employee_row.user_id = current_user_id, false)
    or private.has_company_permission(p_company_id, 'attendance.manage')
  ) then
    raise exception 'You do not have permission to clock out for this employee' using errcode = '42501';
  end if;

  select attendance.* into attendance_row
  from public.attendance_records attendance
  where attendance.employee_id = p_employee_id
    and attendance.company_id = p_company_id
    and attendance.date = current_date
  for update;

  if not found or attendance_row.check_in is null then
    raise exception 'No open attendance record for today' using errcode = 'P0002';
  end if;
  if attendance_row.check_out is not null then
    raise exception 'This employee is already clocked out' using errcode = '23505';
  end if;

  update public.attendance_records attendance
  set check_out = clock_timestamp(), updated_at = clock_timestamp()
  where attendance.id = attendance_row.id
  returning * into attendance_row;

  return attendance_row;
end;
$$;

create or replace function public.hr_submit_leave_request(
  p_company_id uuid,
  p_employee_id uuid,
  p_leave_type text,
  p_start_date date,
  p_end_date date,
  p_reason text default null,
  p_requested_days numeric default null
)
returns public.leave_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  employee_row public.employees%rowtype;
  leave_type_row public.leave_types%rowtype;
  request_row public.leave_requests%rowtype;
  year_value integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'Leave dates are invalid' using errcode = '22023';
  end if;

  select employee.* into employee_row
  from public.employees employee
  where employee.id = p_employee_id
    and employee.company_id = p_company_id;
  if not found then
    raise exception 'Employee not found in this organization' using errcode = 'P0002';
  end if;
  if not (
    coalesce(employee_row.user_id = current_user_id, false)
    or private.has_company_permission(p_company_id, 'leave.request')
    or private.has_company_permission(p_company_id, 'leave.approve')
  ) then
    raise exception 'You do not have permission to request leave for this employee' using errcode = '42501';
  end if;

  select leave_type.* into leave_type_row
  from public.leave_types leave_type
  where leave_type.company_id = p_company_id
    and leave_type.code = p_leave_type
    and leave_type.is_active;
  if not found then
    raise exception 'Leave type is not available for this organization' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.leave_requests existing
    where existing.employee_id = p_employee_id
      and existing.company_id = p_company_id
      and existing.status in ('pending', 'approved')
      and existing.start_date <= p_end_date
      and existing.end_date >= p_start_date
  ) then
    raise exception 'This leave request overlaps an existing request' using errcode = '23P01';
  end if;

  insert into public.leave_requests (
    employee_id, company_id, leave_type, start_date, end_date,
    requested_days, reason, status
  )
  values (
    p_employee_id, p_company_id, p_leave_type, p_start_date, p_end_date,
    (p_end_date - p_start_date) + 1, nullif(trim(p_reason), ''), 'pending'
  )
  returning * into request_row;

  for year_value in
    select generate_series(extract(year from p_start_date)::integer, extract(year from p_end_date)::integer)
  loop
    insert into public.leave_balances (
      company_id, employee_id, leave_type_id, year, allowance
    )
    values (p_company_id, p_employee_id, leave_type_row.id, year_value, leave_type_row.annual_allowance)
    on conflict (employee_id, leave_type_id, year) do nothing;

    update public.leave_balances balance
    set pending = balance.pending + greatest(
      0,
      (least(p_end_date, make_date(year_value, 12, 31))
       - greatest(p_start_date, make_date(year_value, 1, 1))) + 1
    ),
    updated_at = clock_timestamp()
    where balance.company_id = p_company_id
      and balance.employee_id = p_employee_id
      and balance.leave_type_id = leave_type_row.id
      and balance.year = year_value;
  end loop;

  insert into public.hr_approvals (
    company_id, resource_type, resource_id, requested_by, status, note
  )
  values (
    p_company_id, 'leave_request', request_row.id, current_user_id, 'pending', null
  );

  return request_row;
end;
$$;

create or replace function public.hr_review_leave_request(
  p_leave_request_id uuid,
  p_status text,
  p_note text default null
)
returns public.leave_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  request_row public.leave_requests%rowtype;
  leave_type_row public.leave_types%rowtype;
  year_value integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_status not in ('approved', 'rejected') then
    raise exception 'Invalid leave decision' using errcode = '22023';
  end if;

  select request.* into request_row
  from public.leave_requests request
  where request.id = p_leave_request_id
  for update;
  if not found then
    raise exception 'Leave request not found' using errcode = 'P0002';
  end if;
  if not private.has_company_permission(request_row.company_id, 'leave.approve')
     and not private.has_company_permission(request_row.company_id, 'hr.approvals.manage') then
    raise exception 'You do not have permission to review this leave request' using errcode = '42501';
  end if;
  if request_row.status <> 'pending' then
    raise exception 'Only pending leave requests can be reviewed' using errcode = 'P0001';
  end if;

  update public.leave_requests request
  set status = p_status,
      approved_by = current_user_id,
      reviewer_note = nullif(trim(p_note), ''),
      reviewed_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where request.id = p_leave_request_id
  returning * into request_row;

  select leave_type.* into leave_type_row
  from public.leave_types leave_type
  where leave_type.company_id = request_row.company_id
    and leave_type.code = request_row.leave_type;

  if found then
    for year_value in
      select generate_series(extract(year from request_row.start_date)::integer, extract(year from request_row.end_date)::integer)
    loop
      insert into public.leave_balances (
        company_id, employee_id, leave_type_id, year, allowance
      )
      values (request_row.company_id, request_row.employee_id, leave_type_row.id, year_value, leave_type_row.annual_allowance)
      on conflict (employee_id, leave_type_id, year) do nothing;

      update public.leave_balances balance
      set pending = greatest(0, balance.pending - greatest(
        0,
        (least(request_row.end_date, make_date(year_value, 12, 31))
         - greatest(request_row.start_date, make_date(year_value, 1, 1))) + 1
      )),
      used = case when p_status = 'approved' then balance.used + greatest(
        0,
        (least(request_row.end_date, make_date(year_value, 12, 31))
         - greatest(request_row.start_date, make_date(year_value, 1, 1))) + 1
      ) else balance.used end,
      updated_at = clock_timestamp()
      where balance.company_id = request_row.company_id
        and balance.employee_id = request_row.employee_id
        and balance.leave_type_id = leave_type_row.id
        and balance.year = year_value;
    end loop;
  end if;

  update public.hr_approvals approval
  set status = p_status,
      note = nullif(trim(p_note), ''),
      resolved_at = clock_timestamp(),
      resolved_by = current_user_id
  where approval.company_id = request_row.company_id
    and approval.resource_type = 'leave_request'
    and approval.resource_id = request_row.id
    and approval.status = 'pending';

  insert into public.hr_notifications (company_id, user_id, type, title, body, href)
  select
    request_row.company_id,
    employee.user_id,
    case when p_status = 'approved' then 'leave_approved' else 'leave_rejected' end,
    case when p_status = 'approved' then 'Leave request approved' else 'Leave request rejected' end,
    case when p_status = 'approved'
      then 'Your leave request has been approved.'
      else 'Your leave request has been rejected.'
    end,
    '/leave'
  from public.employees employee
  where employee.id = request_row.employee_id
    and employee.user_id is not null;

  return request_row;
end;
$$;

create or replace function public.hr_cancel_leave_request(
  p_leave_request_id uuid
)
returns public.leave_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  request_row public.leave_requests%rowtype;
  employee_row public.employees%rowtype;
  leave_type_row public.leave_types%rowtype;
  year_value integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select request.* into request_row
  from public.leave_requests request
  where request.id = p_leave_request_id
  for update;
  if not found then
    raise exception 'Leave request not found' using errcode = 'P0002';
  end if;

  select employee.* into employee_row
  from public.employees employee
  where employee.id = request_row.employee_id;
  if not (
    coalesce(employee_row.user_id = current_user_id, false)
    or private.has_company_permission(request_row.company_id, 'leave.approve')
  ) then
    raise exception 'You do not have permission to cancel this leave request' using errcode = '42501';
  end if;
  if request_row.status <> 'pending' then
    raise exception 'Only pending leave requests can be cancelled' using errcode = 'P0001';
  end if;

  update public.leave_requests request
  set status = 'cancelled', cancelled_at = clock_timestamp(), updated_at = clock_timestamp()
  where request.id = p_leave_request_id
  returning * into request_row;

  select leave_type.* into leave_type_row
  from public.leave_types leave_type
  where leave_type.company_id = request_row.company_id
    and leave_type.code = request_row.leave_type;

  if found then
    for year_value in
      select generate_series(extract(year from request_row.start_date)::integer, extract(year from request_row.end_date)::integer)
    loop
      update public.leave_balances balance
      set pending = greatest(0, balance.pending - greatest(
        0,
        (least(request_row.end_date, make_date(year_value, 12, 31))
         - greatest(request_row.start_date, make_date(year_value, 1, 1))) + 1
      )),
      updated_at = clock_timestamp()
      where balance.company_id = request_row.company_id
        and balance.employee_id = request_row.employee_id
        and balance.leave_type_id = leave_type_row.id
        and balance.year = year_value;
    end loop;
  end if;

  update public.hr_approvals approval
  set status = 'cancelled', resolved_at = clock_timestamp(), resolved_by = current_user_id
  where approval.company_id = request_row.company_id
    and approval.resource_type = 'leave_request'
    and approval.resource_id = request_row.id
    and approval.status = 'pending';

  return request_row;
end;
$$;

revoke all on function public.hr_clock_in(uuid, uuid, text) from public, anon;
revoke all on function public.hr_clock_out(uuid, uuid) from public, anon;
revoke all on function public.hr_submit_leave_request(uuid, uuid, text, date, date, text, numeric) from public, anon;
revoke all on function public.hr_review_leave_request(uuid, text, text) from public, anon;
revoke all on function public.hr_cancel_leave_request(uuid) from public, anon;
grant execute on function public.hr_clock_in(uuid, uuid, text) to authenticated;
grant execute on function public.hr_clock_out(uuid, uuid) to authenticated;
grant execute on function public.hr_submit_leave_request(uuid, uuid, text, date, date, text, numeric) to authenticated;
grant execute on function public.hr_review_leave_request(uuid, text, text) to authenticated;
grant execute on function public.hr_cancel_leave_request(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Append-only audit coverage and Realtime publication
-- ---------------------------------------------------------------------------

drop trigger if exists audit_hr_employees on public.employees;
create trigger audit_hr_employees
after insert or update or delete on public.employees
for each row execute function private.audit_table_change();

drop trigger if exists audit_hr_attendance_records on public.attendance_records;
create trigger audit_hr_attendance_records
after insert or update or delete on public.attendance_records
for each row execute function private.audit_table_change();

drop trigger if exists audit_hr_leave_requests on public.leave_requests;
create trigger audit_hr_leave_requests
after insert or update or delete on public.leave_requests
for each row execute function private.audit_table_change();

drop trigger if exists audit_hr_leave_balances on public.leave_balances;
create trigger audit_hr_leave_balances
after insert or update or delete on public.leave_balances
for each row execute function private.audit_table_change();

drop trigger if exists audit_hr_documents on public.employee_documents;
create trigger audit_hr_documents
after insert or update or delete on public.employee_documents
for each row execute function private.audit_table_change();

drop trigger if exists audit_hr_contracts on public.employment_contracts;
create trigger audit_hr_contracts
after insert or update or delete on public.employment_contracts
for each row execute function private.audit_table_change();

drop trigger if exists audit_hr_announcements on public.hr_announcements;
create trigger audit_hr_announcements
after insert or update or delete on public.hr_announcements
for each row execute function private.audit_table_change();

drop trigger if exists audit_hr_notifications on public.hr_notifications;
create trigger audit_hr_notifications
after insert or update or delete on public.hr_notifications
for each row execute function private.audit_table_change();

drop trigger if exists audit_hr_approvals on public.hr_approvals;
create trigger audit_hr_approvals
after insert or update or delete on public.hr_approvals
for each row execute function private.audit_table_change();

do $$
begin
  begin alter publication supabase_realtime add table public.employees; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.attendance_records; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.leave_requests; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.leave_balances; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.hr_announcements; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.hr_notifications; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.hr_approvals; exception when duplicate_object then null; end;
end;
$$;

commit;
