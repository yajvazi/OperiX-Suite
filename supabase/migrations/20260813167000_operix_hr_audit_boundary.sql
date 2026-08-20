-- Protect the shared audit stream used by HR and the existing payroll module.
begin;

insert into public.app_permissions (code, name, category, description, is_sensitive)
values ('hr.audit.view', 'View HR audit log', 'hr', 'View protected HR changes for an organization.', true)
on conflict (code) do update set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  is_sensitive = excluded.is_sensitive;

with grants(role_code) as (
  values ('hr_admin'), ('hr_manager'), ('owner'), ('super_administrator'), ('company_administrator')
)
insert into public.app_role_permissions (role_id, permission_code)
select role.id, 'hr.audit.view'
from grants
join public.app_roles role on role.company_id is null and role.code = grants.role_code
on conflict do nothing;

alter table public.audit_events enable row level security;
revoke all on table public.audit_events from public, anon, authenticated;
grant select on table public.audit_events to authenticated;

drop policy if exists operix_audit_events_read on public.audit_events;
create policy operix_audit_events_read
on public.audit_events for select to authenticated
using (
  company_id is not null
  and (
    (select private.has_company_permission(company_id, 'hr.audit.view'))
    or (select private.has_company_permission(company_id, 'payroll.audit.view'))
    or (select private.has_company_permission(company_id, 'audit.read'))
  )
);

commit;
