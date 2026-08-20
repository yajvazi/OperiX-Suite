-- OperiX HR privilege hardening.
-- Supabase-created tables can inherit broad table grants; HR data must be
-- reachable only through authenticated requests and the RLS policies defined
-- by the HR foundation migration.

begin;

revoke all on table
  public.employees,
  public.attendance_records,
  public.leave_requests,
  public.payrolls,
  public.employee_documents,
  public.employment_contracts,
  public.leave_types,
  public.leave_balances,
  public.hr_announcements,
  public.hr_notifications,
  public.hr_approvals
from public, anon;

grant select, insert, update on table public.employees to authenticated;
grant select, insert, update on table public.attendance_records to authenticated;
grant select, insert on table public.leave_requests to authenticated;
grant select, insert, update on table public.payrolls to authenticated;
grant select, insert, update, delete on table public.employee_documents to authenticated;
grant select, insert, update on table public.employment_contracts to authenticated;
grant select, insert, update on table public.leave_types to authenticated;
grant select on table public.leave_balances to authenticated;
grant select, insert, update, delete on table public.hr_announcements to authenticated;
grant select, update on table public.hr_notifications to authenticated;
grant select on table public.hr_approvals to authenticated;

commit;
