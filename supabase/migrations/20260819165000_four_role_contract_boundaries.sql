begin;

drop policy if exists contracts_company_insert on public.contracts;
drop policy if exists contracts_company_update on public.contracts;
drop policy if exists contracts_company_delete on public.contracts;
create policy contracts_role_insert on public.contracts for insert to authenticated
with check (company_id is not null and user_id = (select auth.uid()) and private.has_company_permission(company_id, 'contracts.manage'));
create policy contracts_role_update on public.contracts for update to authenticated
using (company_id is not null and private.has_company_permission(company_id, 'contracts.manage'))
with check (company_id is not null and private.has_company_permission(company_id, 'contracts.manage'));
create policy contracts_role_delete on public.contracts for delete to authenticated
using (company_id is not null and private.has_company_permission(company_id, 'contracts.manage'));

notify pgrst, 'reload schema';
commit;
