-- Employees may upload documents for their own employee record.  Reading and
-- deletion remain governed by the existing HR document policies.
begin;

drop policy if exists hr_documents_insert on public.employee_documents;

create policy hr_documents_insert
on public.employee_documents for insert to authenticated
with check (
  (
    exists (
      select 1
      from public.employees employee
      where employee.id = employee_documents.employee_id
        and employee.user_id = (select auth.uid())
        and employee.company_id = employee_documents.company_id
    )
    or (select private.has_company_permission(company_id, 'hr.documents.manage'))
  )
  and exists (
    select 1
    from public.employees employee
    where employee.id = employee_documents.employee_id
      and employee.company_id = employee_documents.company_id
  )
);

commit;
