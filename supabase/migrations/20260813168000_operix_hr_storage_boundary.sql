-- The employee-documents bucket is private, but bucket membership alone is
-- still too broad for HR records.  Match storage authorization to the HR
-- document table: an employee can access their own path, HR roles can access
-- authorized company paths, and only HR managers can mutate existing files.
begin;

drop policy if exists "Company members can view employee documents" on storage.objects;
drop policy if exists "Company members can upload employee documents" on storage.objects;
drop policy if exists "Company members can update employee documents" on storage.objects;
drop policy if exists "Company members can delete employee documents" on storage.objects;

create policy "HR users can view employee documents"
on storage.objects for select to authenticated
using (
  bucket_id = 'employee-documents'
  and case
    when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (
      (select private.has_company_permission(split_part(name, '/', 1)::uuid, 'hr.documents.view'))
      or (select private.has_company_permission(split_part(name, '/', 1)::uuid, 'hr.documents.manage'))
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

create policy "HR managers can update employee documents"
on storage.objects for update to authenticated
using (
  bucket_id = 'employee-documents'
  and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and (select private.has_company_permission(split_part(name, '/', 1)::uuid, 'hr.documents.manage'))
)
with check (
  bucket_id = 'employee-documents'
  and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and (select private.has_company_permission(split_part(name, '/', 1)::uuid, 'hr.documents.manage'))
);

create policy "HR managers can delete employee documents"
on storage.objects for delete to authenticated
using (
  bucket_id = 'employee-documents'
  and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and (select private.has_company_permission(split_part(name, '/', 1)::uuid, 'hr.documents.manage'))
);

commit;
