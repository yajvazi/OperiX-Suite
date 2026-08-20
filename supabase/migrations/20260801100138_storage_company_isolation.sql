
-- Restrict employee documents to authenticated members of the company folder.
-- OperiX writes paths as: <company_id>/<employee_id>/<filename>.

drop policy if exists "Authenticated users can upload documents" on storage.objects;
drop policy if exists "Users can view their company documents" on storage.objects;
drop policy if exists "Company members can view employee documents" on storage.objects;
drop policy if exists "Company members can upload employee documents" on storage.objects;
drop policy if exists "Company members can update employee documents" on storage.objects;
drop policy if exists "Company members can delete employee documents" on storage.objects;

create policy "Company members can view employee documents"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'employee-documents'
  and case
    when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.can_access_company(split_part(name, '/', 1)::uuid)
    else false
  end
);

create policy "Company members can upload employee documents"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'employee-documents'
  and case
    when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.can_access_company(split_part(name, '/', 1)::uuid)
    else false
  end
);

create policy "Company members can update employee documents"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'employee-documents'
  and case
    when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.can_access_company(split_part(name, '/', 1)::uuid)
    else false
  end
)
with check (
  bucket_id = 'employee-documents'
  and case
    when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.can_access_company(split_part(name, '/', 1)::uuid)
    else false
  end
);

create policy "Company members can delete employee documents"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'employee-documents'
  and case
    when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.can_access_company(split_part(name, '/', 1)::uuid)
    else false
  end
);
