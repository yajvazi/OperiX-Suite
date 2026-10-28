-- Legacy payroll generation is a SECURITY DEFINER RPC. Preserve its existing
-- manager membership rule, but make the HR Enterprise entitlement mandatory
-- before it can read employees or write payroll rows.

begin;

create or replace function public.generate_company_payroll(
  p_company_id uuid,
  p_start_date date,
  p_end_date date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  employee_row record;
  generated_count integer := 0;
begin
  perform private.require_operix_product_access(p_company_id, 'hr');

  if not exists (
    select 1
    from public.memberships membership
    where membership.company_id = p_company_id
      and membership.user_id = (select auth.uid())
      and membership.role in ('owner', 'admin', 'manager')
      and coalesce(membership.status, 'active') in ('active', 'approved')
  ) then
    raise exception 'Access denied: manager membership is required' using errcode = '42501';
  end if;

  for employee_row in
    select employee.id, employee.base_salary
    from public.employees employee
    where employee.company_id = p_company_id
      and employee.status = 'active'
  loop
    if not exists (
      select 1
      from public.payrolls payroll
      where payroll.employee_id = employee_row.id
        and payroll.period_start = p_start_date
        and payroll.period_end = p_end_date
    ) then
      insert into public.payrolls(
        employee_id,
        company_id,
        period_start,
        period_end,
        base_salary,
        bonus,
        deductions,
        expenses_reimbursed,
        total_payout,
        status
      ) values (
        employee_row.id,
        p_company_id,
        p_start_date,
        p_end_date,
        employee_row.base_salary,
        0,
        0,
        0,
        employee_row.base_salary,
        'draft'
      );
      generated_count := generated_count + 1;
    end if;
  end loop;

  return jsonb_build_object('success', true, 'generated_count', generated_count);
end;
$$;

revoke all on function public.generate_company_payroll(uuid, date, date) from public, anon;
grant execute on function public.generate_company_payroll(uuid, date, date) to authenticated;

commit;
