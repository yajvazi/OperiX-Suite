begin;

create or replace function private.prevent_employee_invoice_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.company_id is not null
     and public.get_my_company_role(old.company_id) = 'employee'
     and coalesce(current_setting('app.document_create_workflow', true), '') <> 'authorized'
     and coalesce(current_setting('app.invoice_auxiliary_workflow', true), '') <> 'authorized'
     and not (
       coalesce(current_setting('app.financial_workflow', true), '') = 'authorized'
       and old.user_id = (select auth.uid())
     ) then
    raise exception 'Employees can create documents but cannot edit existing invoices'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_employee_invoice_mutation() from public, anon, authenticated;
commit;
