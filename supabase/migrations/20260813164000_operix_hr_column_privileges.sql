-- Replace table-wide employee grants with an explicit safe-column contract.
-- This is required because a column-level REVOKE cannot override a prior
-- table-wide SELECT grant in PostgreSQL.
begin;

revoke all on table public.employees from authenticated;

grant select (
  id, company_id, user_id, first_name, last_name, email, phone, job_title,
  department, avatar_url, role, status, hire_date, currency, created_at,
  updated_at, employee_number, employment_start_date, employment_end_date,
  branch_id, cost_centre_id, project_id, payroll_group_code, payroll_ready_status
) on table public.employees to authenticated;

grant insert (
  company_id, user_id, first_name, last_name, email, phone, job_title,
  department, avatar_url, status, hire_date, currency, employee_number,
  employment_start_date, employment_end_date, branch_id, cost_centre_id,
  project_id, payroll_group_code, payroll_ready_status
) on table public.employees to authenticated;

grant update (
  first_name, last_name, email, phone, job_title, department, avatar_url,
  status, hire_date, currency, employee_number, employment_start_date,
  employment_end_date, branch_id, cost_centre_id, project_id,
  payroll_group_code, payroll_ready_status
) on table public.employees to authenticated;

-- Legacy payroll rows remain readable only through their RLS scope, but the
-- direct base salary column is deliberately absent from the client contract.
revoke all on table public.payrolls from authenticated;
grant select (
  id, employee_id, company_id, period_start, period_end, bonus, deductions,
  expenses_reimbursed, total_payout, status, payment_date, created_at
) on table public.payrolls to authenticated;

commit;
