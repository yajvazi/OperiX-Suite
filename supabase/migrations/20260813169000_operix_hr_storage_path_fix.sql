-- Correct the employee path validator in the storage insert policy.
begin;

drop policy if exists "HR users can upload employee documents" on storage.objects;

create policy "HR users can upload employee documents"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'employee-documents'
  and case
    when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (
      (select private.has_company_permission(split_part(name, '/', 1)::uuid, 'hr.documents.manage'))
      or exists (
        select 1 from public.employees employee
        where employee.id = split_part(name, '/', 2)::uuid
          and employee.company_id = split_part(name, '/', 1)::uuid
          and employee.user_id = (select auth.uid())
      )
    )
    else false
  end
);

commit;
