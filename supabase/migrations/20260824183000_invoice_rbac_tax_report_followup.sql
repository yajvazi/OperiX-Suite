-- Route the legacy tax_reports table through Invoice tenant RBAC.
-- Existing rows are preserved; only grants and authorization are changed.

begin;

alter table public.tax_reports enable row level security;

drop policy if exists "owner access tax_reports" on public.tax_reports;
drop policy if exists rbac_tax_reports_select on public.tax_reports;
drop policy if exists rbac_tax_reports_insert on public.tax_reports;
drop policy if exists rbac_tax_reports_update on public.tax_reports;
drop policy if exists rbac_tax_reports_delete on public.tax_reports;

revoke all on table public.tax_reports from public, anon;
grant select, insert, update, delete on table public.tax_reports to authenticated;

create policy rbac_tax_reports_select on public.tax_reports
for select to authenticated
using (
  company_id is not null
  and private.has_company_permission(company_id, 'reports.tax')
);

create policy rbac_tax_reports_insert on public.tax_reports
for insert to authenticated
with check (
  company_id is not null
  and user_id = (select auth.uid())
  and private.has_company_permission(company_id, 'settings.tax')
);

create policy rbac_tax_reports_update on public.tax_reports
for update to authenticated
using (company_id is not null and private.has_company_permission(company_id, 'settings.tax'))
with check (company_id is not null and private.has_company_permission(company_id, 'settings.tax'));

create policy rbac_tax_reports_delete on public.tax_reports
for delete to authenticated
using (company_id is not null and private.has_company_permission(company_id, 'settings.tax'));

drop trigger if exists tax_reports_audit on public.tax_reports;
create trigger tax_reports_audit
after insert or update or delete on public.tax_reports
for each row execute function private.audit_table_change();

commit;
