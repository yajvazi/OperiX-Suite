-- SECURITY DEFINER Enterprise wrappers must never be callable by anon or
-- PUBLIC. Authenticated callers still pass the product and role checks in the
-- wrapper and in the underlying RBAC implementation.

begin;

revoke all on function public.hr_clock_in(uuid, uuid, text) from public, anon;
revoke all on function public.hr_clock_out(uuid, uuid) from public, anon;
revoke all on function public.hr_submit_leave_request(uuid, uuid, text, date, date, text, numeric) from public, anon;
revoke all on function public.hr_cancel_leave_request(uuid) from public, anon;
revoke all on function public.hr_convert_candidate_to_employee(uuid, text, text, date) from public, anon;
revoke all on function public.hr_update_self_review(uuid, text) from public, anon;
revoke all on function public.hr_resolve_approval(uuid, text, text) from public, anon;
revoke all on function public.hr_start_offboarding(uuid, uuid, text, date, text) from public, anon;
revoke all on function public.access_payroll_payslip(uuid, text) from public, anon;

commit;
