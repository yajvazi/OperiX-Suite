-- OperiX Control foundation.
--
-- This migration is additive. Authentication, profiles, companies, memberships,
-- existing application roles, and domain business data remain the shared
-- source of truth. These tables only add the minimum governance metadata that
-- does not exist elsewhere in the suite.

begin;

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Control permission vocabulary and default organization roles
-- ---------------------------------------------------------------------------

insert into public.app_permissions (code, name, category, description, is_sensitive)
values
  ('control.access', 'Access OperiX Control', 'control', 'Enter the OperiX Control administration console.', true),
  ('organization.read', 'View organization', 'organization', 'View organization profile, structure, and business information.', false),
  ('organization.manage', 'Manage organization', 'organization', 'Update organization profile, branding, and localization.', true),
  ('users.read', 'View users', 'users', 'View organization memberships and invitations.', false),
  ('users.manage', 'Manage users', 'users', 'Invite, suspend, reactivate, and remove organization members.', true),
  ('teams.read', 'View teams and groups', 'users', 'View shared access groups.', false),
  ('teams.manage', 'Manage teams and groups', 'users', 'Create groups and assign shared access.', true),
  ('roles.read', 'View roles and permissions', 'security', 'View organization roles and permission definitions.', false),
  ('roles.manage', 'Manage roles and permissions', 'security', 'Create custom roles and assign permissions.', true),
  ('apps.read', 'View applications', 'apps', 'View the OperiX application registry and organization entitlements.', false),
  ('apps.manage', 'Manage applications', 'apps', 'Enable modules and manage application access.', true),
  ('integrations.read', 'View integrations', 'integrations', 'View supported integration status without exposing secrets.', false),
  ('integrations.manage', 'Manage integrations', 'integrations', 'Connect or disconnect supported integrations.', true),
  ('billing.read', 'View billing', 'billing', 'View billing state supplied by the shared billing system.', false),
  ('billing.manage', 'Manage billing', 'billing', 'Manage billing settings supplied by the shared billing system.', true),
  ('usage.read', 'View usage', 'usage', 'View measured organization usage.', false),
  ('security.read', 'View security', 'security', 'View measurable organization security state.', true),
  ('security.manage', 'Manage security', 'security', 'Manage supported organization security policies.', true),
  ('audit.read', 'View audit log', 'security', 'View tenant-scoped administrative audit events.', true),
  ('settings.read', 'View Control settings', 'control', 'View central Control preferences.', false),
  ('settings.manage', 'Manage Control settings', 'control', 'Manage central Control preferences.', true),
  ('api.read', 'View API and webhooks', 'developer', 'View developer access metadata.', true),
  ('api.manage', 'Manage API and webhooks', 'developer', 'Create, rotate, and revoke developer credentials.', true),
  ('data.read', 'View data and storage', 'data', 'View measured data and storage metadata.', false),
  ('status.read', 'View system status', 'platform', 'View service health where monitoring data exists.', false)
on conflict (code) do update
set name = excluded.name,
    category = excluded.category,
    description = excluded.description,
    is_sensitive = excluded.is_sensitive;

insert into public.app_roles (company_id, code, name, description, is_system)
values
  (null, 'organization_admin', 'Organization Admin', 'Manage the organization control plane.', true),
  (null, 'it_admin', 'IT Admin', 'Manage users, applications, integrations, and developer access.', true),
  (null, 'security_admin', 'Security Admin', 'Manage security posture and review administrative audit.', true),
  (null, 'billing_admin', 'Billing Admin', 'Manage billing and subscription metadata.', true),
  (null, 'app_admin', 'App Admin', 'Manage application availability and access.', true),
  (null, 'read_only_admin', 'Read Only Admin', 'Read organization administration surfaces.', true)
on conflict (code) where company_id is null do update
set name = excluded.name,
    description = excluded.description,
    is_system = true;

with grants(role_code, permission_code) as (
  values
    ('organization_admin', 'control.access'), ('organization_admin', 'organization.read'), ('organization_admin', 'organization.manage'),
    ('organization_admin', 'users.read'), ('organization_admin', 'users.manage'), ('organization_admin', 'teams.read'), ('organization_admin', 'teams.manage'),
    ('organization_admin', 'roles.read'), ('organization_admin', 'roles.manage'), ('organization_admin', 'apps.read'), ('organization_admin', 'apps.manage'),
    ('organization_admin', 'integrations.read'), ('organization_admin', 'integrations.manage'), ('organization_admin', 'billing.read'), ('organization_admin', 'billing.manage'),
    ('organization_admin', 'usage.read'), ('organization_admin', 'security.read'), ('organization_admin', 'security.manage'), ('organization_admin', 'audit.read'),
    ('organization_admin', 'settings.read'), ('organization_admin', 'settings.manage'), ('organization_admin', 'api.read'), ('organization_admin', 'api.manage'),
    ('organization_admin', 'data.read'), ('organization_admin', 'status.read'),
    ('it_admin', 'control.access'), ('it_admin', 'organization.read'), ('it_admin', 'users.read'), ('it_admin', 'users.manage'),
    ('it_admin', 'teams.read'), ('it_admin', 'teams.manage'), ('it_admin', 'roles.read'), ('it_admin', 'roles.manage'), ('it_admin', 'apps.read'), ('it_admin', 'apps.manage'),
    ('it_admin', 'integrations.read'), ('it_admin', 'integrations.manage'), ('it_admin', 'usage.read'), ('it_admin', 'security.read'),
    ('it_admin', 'audit.read'), ('it_admin', 'settings.read'), ('it_admin', 'api.read'), ('it_admin', 'api.manage'), ('it_admin', 'data.read'), ('it_admin', 'status.read'),
    ('security_admin', 'control.access'), ('security_admin', 'organization.read'), ('security_admin', 'users.read'), ('security_admin', 'roles.read'),
    ('security_admin', 'security.read'), ('security_admin', 'security.manage'), ('security_admin', 'audit.read'), ('security_admin', 'settings.read'), ('security_admin', 'status.read'),
    ('billing_admin', 'control.access'), ('billing_admin', 'organization.read'), ('billing_admin', 'billing.read'), ('billing_admin', 'billing.manage'), ('billing_admin', 'usage.read'),
    ('app_admin', 'control.access'), ('app_admin', 'organization.read'), ('app_admin', 'apps.read'), ('app_admin', 'apps.manage'), ('app_admin', 'integrations.read'), ('app_admin', 'integrations.manage'), ('app_admin', 'status.read'),
    ('read_only_admin', 'control.access'), ('read_only_admin', 'organization.read'), ('read_only_admin', 'users.read'), ('read_only_admin', 'teams.read'), ('read_only_admin', 'roles.read'), ('read_only_admin', 'apps.read'), ('read_only_admin', 'integrations.read'), ('read_only_admin', 'billing.read'), ('read_only_admin', 'usage.read'), ('read_only_admin', 'security.read'), ('read_only_admin', 'audit.read'), ('read_only_admin', 'settings.read'), ('read_only_admin', 'data.read'), ('read_only_admin', 'status.read'),
    ('auditor', 'control.access'), ('auditor', 'organization.read'), ('auditor', 'users.read'), ('auditor', 'teams.read'), ('auditor', 'roles.read'), ('auditor', 'apps.read'), ('auditor', 'integrations.read'), ('auditor', 'billing.read'), ('auditor', 'usage.read'), ('auditor', 'security.read'), ('auditor', 'audit.read'), ('auditor', 'data.read'), ('auditor', 'status.read')
)
insert into public.app_role_permissions (role_id, permission_code)
select role.id, grant_row.permission_code
from grants grant_row
join public.app_roles role on role.company_id is null and role.code = grant_row.role_code
on conflict do nothing;

insert into public.app_role_permissions (role_id, permission_code)
select role.id, permission.code
from public.app_roles role
join public.app_permissions permission on permission.code in ('company.read', 'company.manage')
where role.company_id is null and role.code = 'organization_admin'
on conflict do nothing;

-- Owner and legacy admin memberships are intentionally full Control users, as
-- they are already the suite's full organization authority.
insert into public.app_role_permissions (role_id, permission_code)
select role.id, permission.code
from public.app_roles role
cross join public.app_permissions permission
where role.company_id is null
  and role.code in ('owner', 'super_administrator', 'company_administrator')
  and permission.category in ('control', 'organization', 'users', 'security', 'apps', 'integrations', 'billing', 'usage', 'developer', 'data', 'platform')
on conflict do nothing;

create or replace function public.control_has_permission(p_company_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_company_permission(p_company_id, p_permission);
$$;

revoke all on function public.control_has_permission(uuid, text) from public, anon;
grant execute on function public.control_has_permission(uuid, text) to authenticated;

-- The legacy company member listing was intentionally restricted to
-- roles.manage. Control also has read-only administrators, so expose a
-- tenant-scoped read wrapper with the narrower users.read permission.
create or replace function public.control_list_company_members(p_company_id uuid)
returns table (
  membership_id uuid,
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  legacy_role text,
  status text,
  role_code text,
  role_name text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not private.has_company_permission(p_company_id, 'users.read') then
    raise exception 'You do not have permission to view company users' using errcode = '42501';
  end if;
  return query
  select
    membership.id,
    membership.user_id,
    coalesce(auth_user.email, profile.email)::text,
    profile.first_name::text,
    profile.last_name::text,
    membership.role::text,
    coalesce(membership.status, 'active')::text,
    coalesce(max(assigned_role.code), case lower(coalesce(membership.role, 'worker'))
      when 'owner' then 'owner'
      when 'admin' then 'company_administrator'
      when 'manager' then 'sales_manager'
      when 'accountant' then 'accountant'
      when 'cashier' then 'cashier'
      when 'waiter' then 'waiter'
      when 'auditor' then 'auditor'
      else 'read_only'
    end)::text,
    coalesce(max(assigned_role.name), 'Read-only user')::text
  from public.memberships membership
  left join auth.users auth_user on auth_user.id = membership.user_id
  left join public.profiles profile on profile.id = membership.user_id
  left join public.membership_role_assignments assignment on assignment.membership_id = membership.id
  left join public.app_roles assigned_role on assigned_role.id = assignment.role_id
  where membership.company_id = p_company_id
    and coalesce(membership.status, 'active') <> 'revoked'
  group by membership.id, membership.user_id, auth_user.email, profile.email, profile.first_name, profile.last_name, membership.role, membership.status
  order by lower(coalesce(auth_user.email, profile.email, ''));
end;
$$;

revoke all on function public.control_list_company_members(uuid) from public, anon;
grant execute on function public.control_list_company_members(uuid) to authenticated;

drop policy if exists audit_events_permission_select on public.audit_events;
create policy audit_events_permission_select
on public.audit_events
for select to authenticated
using (
  company_id is not null
  and (
    private.has_company_permission(company_id, 'audit.view')
    or private.has_company_permission(company_id, 'audit.read')
  )
);

-- ---------------------------------------------------------------------------
-- Shared application registry and organization-level app metadata
-- ---------------------------------------------------------------------------

create table if not exists public.operix_apps (
  app_key text primary key check (app_key ~ '^[a-z0-9][a-z0-9_-]{1,48}$'),
  display_name text not null,
  description text,
  route text,
  icon_key text,
  available boolean not null default true,
  subscription_requirement text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.operix_apps (app_key, display_name, description, route, icon_key, available, subscription_requirement, sort_order)
values
  ('invoice', 'OperiX Invoice', 'Invoicing and financial operations', 'https://invoice.operixsuite.com', 'invoice', true, null, 10),
  ('hr', 'OperiX HR', 'People, attendance, leave, and payroll', 'https://hr.operixsuite.com', 'hr', true, null, 20),
  ('booking', 'OperiX Booking', 'Appointments and reservations', 'https://booking.operixsuite.com', 'booking', true, null, 30),
  ('desk', 'OperiX Desk', 'Workspace reservations and utilization', 'https://desk.operixsuite.com', 'desk', true, null, 40),
  ('support', 'OperiX Support', 'Support inboxes and service workflows', 'https://support.operixsuite.com', 'support', true, null, 50),
  ('crm', 'OperiX CRM', 'Customer relationships and sales', 'https://crm.operixsuite.com', 'crm', true, null, 60)
on conflict (app_key) do update
set display_name = excluded.display_name,
    description = excluded.description,
    route = excluded.route,
    icon_key = excluded.icon_key,
    available = excluded.available,
    sort_order = excluded.sort_order,
    updated_at = now();

create table if not exists public.company_app_entitlements (
  company_id uuid not null references public.companies(id) on delete cascade,
  app_key text not null references public.operix_apps(app_key) on delete restrict,
  enabled boolean not null default false,
  plan text,
  enabled_at timestamptz,
  disabled_at timestamptz,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (company_id, app_key)
);

create table if not exists public.membership_app_access (
  membership_id uuid not null references public.memberships(id) on delete cascade,
  app_key text not null references public.operix_apps(app_key) on delete restrict,
  enabled boolean not null default true,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null,
  primary key (membership_id, app_key)
);

-- ---------------------------------------------------------------------------
-- Shared groups for Control provisioning
-- ---------------------------------------------------------------------------

create table if not exists public.control_groups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

create table if not exists public.control_group_members (
  group_id uuid not null references public.control_groups(id) on delete cascade,
  membership_id uuid not null references public.memberships(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, membership_id)
);

create table if not exists public.control_group_app_access (
  group_id uuid not null references public.control_groups(id) on delete cascade,
  app_key text not null references public.operix_apps(app_key) on delete restrict,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  primary key (group_id, app_key)
);

-- ---------------------------------------------------------------------------
-- RLS: all organization-owned Control rows are tenant-scoped
-- ---------------------------------------------------------------------------

alter table public.operix_apps enable row level security;
alter table public.company_app_entitlements enable row level security;
alter table public.membership_app_access enable row level security;
alter table public.control_groups enable row level security;
alter table public.control_group_members enable row level security;
alter table public.control_group_app_access enable row level security;

revoke all on table public.operix_apps, public.company_app_entitlements, public.membership_app_access, public.control_groups, public.control_group_members, public.control_group_app_access from anon;
grant select on table public.operix_apps to authenticated;
grant select, insert, update, delete on table public.company_app_entitlements to authenticated;
grant select, insert, update, delete on table public.membership_app_access to authenticated;
grant select, insert, update, delete on table public.control_groups to authenticated;
grant select, insert, delete on table public.control_group_members to authenticated;
grant select, insert, update, delete on table public.control_group_app_access to authenticated;

drop policy if exists operix_apps_authenticated_select on public.operix_apps;
create policy operix_apps_authenticated_select on public.operix_apps
for select to authenticated using (available = true);

drop policy if exists company_app_entitlements_member_select on public.company_app_entitlements;
create policy company_app_entitlements_member_select on public.company_app_entitlements
for select to authenticated using (private.is_company_member(company_id));
drop policy if exists company_app_entitlements_manage on public.company_app_entitlements;
create policy company_app_entitlements_manage on public.company_app_entitlements
for all to authenticated using (private.has_company_permission(company_id, 'apps.manage')) with check (private.has_company_permission(company_id, 'apps.manage'));

drop policy if exists membership_app_access_member_select on public.membership_app_access;
create policy membership_app_access_member_select on public.membership_app_access
for select to authenticated using (exists (select 1 from public.memberships membership where membership.id = membership_id and private.is_company_member(membership.company_id)));
drop policy if exists membership_app_access_manage on public.membership_app_access;
create policy membership_app_access_manage on public.membership_app_access
for all to authenticated using (exists (select 1 from public.memberships membership where membership.id = membership_app_access.membership_id and private.has_company_permission(membership.company_id, 'apps.manage'))) with check (exists (select 1 from public.memberships membership where membership.id = membership_app_access.membership_id and private.has_company_permission(membership.company_id, 'apps.manage')));

drop policy if exists control_groups_member_select on public.control_groups;
create policy control_groups_member_select on public.control_groups
for select to authenticated using (private.is_company_member(company_id));
drop policy if exists control_groups_manage on public.control_groups;
create policy control_groups_manage on public.control_groups
for all to authenticated using (private.has_company_permission(company_id, 'teams.manage')) with check (private.has_company_permission(company_id, 'teams.manage'));

drop policy if exists control_group_members_member_select on public.control_group_members;
create policy control_group_members_member_select on public.control_group_members
for select to authenticated using (exists (select 1 from public.control_groups group_row where group_row.id = group_id and private.is_company_member(group_row.company_id)));
drop policy if exists control_group_members_manage on public.control_group_members;
create policy control_group_members_manage on public.control_group_members
for all to authenticated
using (
  exists (
    select 1
    from public.control_groups group_row
    join public.memberships membership on membership.id = control_group_members.membership_id
    where group_row.id = control_group_members.group_id
      and membership.company_id = group_row.company_id
      and private.has_company_permission(group_row.company_id, 'teams.manage')
  )
)
with check (
  exists (
    select 1
    from public.control_groups group_row
    join public.memberships membership on membership.id = control_group_members.membership_id
    where group_row.id = control_group_members.group_id
      and membership.company_id = group_row.company_id
      and private.has_company_permission(group_row.company_id, 'teams.manage')
  )
);

drop policy if exists control_group_app_access_member_select on public.control_group_app_access;
create policy control_group_app_access_member_select on public.control_group_app_access
for select to authenticated using (exists (select 1 from public.control_groups group_row where group_row.id = group_id and private.is_company_member(group_row.company_id)));
drop policy if exists control_group_app_access_manage on public.control_group_app_access;
create policy control_group_app_access_manage on public.control_group_app_access
for all to authenticated using (exists (select 1 from public.control_groups group_row where group_row.id = group_id and private.has_company_permission(group_row.company_id, 'teams.manage'))) with check (exists (select 1 from public.control_groups group_row where group_row.id = group_id and private.has_company_permission(group_row.company_id, 'teams.manage')));

-- Keep direct Control changes in the existing append-oriented audit stream.
-- The shared audit trigger predates Control's join tables and cannot infer a
-- tenant from membership_app_access or group membership rows. Keep these
-- events in the same append-only stream, but resolve their company through
-- the referenced membership/group before inserting the event.
create or replace function private.control_audit_table_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_payload jsonb;
  new_payload jsonb;
  context_payload jsonb;
  resolved_company_id uuid;
  resolved_entity_id uuid;
  headers jsonb;
  jwt_claims jsonb;
begin
  old_payload := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  new_payload := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  context_payload := coalesce(new_payload, old_payload, '{}'::jsonb);
  resolved_entity_id := nullif(context_payload ->> 'id', '')::uuid;
  resolved_company_id := nullif(context_payload ->> 'company_id', '')::uuid;

  if tg_table_name = 'membership_app_access' then
    resolved_entity_id := coalesce(resolved_entity_id, nullif(context_payload ->> 'membership_id', '')::uuid);
    select membership.company_id into resolved_company_id
    from public.memberships membership
    where membership.id = nullif(context_payload ->> 'membership_id', '')::uuid;
  elsif tg_table_name = 'control_group_members' then
    resolved_entity_id := coalesce(resolved_entity_id, nullif(context_payload ->> 'membership_id', '')::uuid);
    select group_row.company_id into resolved_company_id
    from public.control_groups group_row
    where group_row.id = nullif(context_payload ->> 'group_id', '')::uuid;
  elsif tg_table_name = 'control_group_app_access' then
    select group_row.company_id into resolved_company_id
    from public.control_groups group_row
    where group_row.id = nullif(context_payload ->> 'group_id', '')::uuid;
  end if;

  headers := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  jwt_claims := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);

  insert into public.audit_events (
    company_id, actor_user_id, action, entity_type, entity_id, entity_key,
    previous_values, new_values, ip_address, session_identifier,
    device_identifier, reason, request_id
  )
  values (
    resolved_company_id,
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    resolved_entity_id,
    coalesce(context_payload ->> 'app_key', context_payload ->> 'code', context_payload ->> 'name'),
    private.redact_audit_payload(old_payload),
    private.redact_audit_payload(new_payload),
    private.audit_request_ip(),
    coalesce(jwt_claims ->> 'session_id', jwt_claims ->> 'sid'),
    coalesce(headers ->> 'x-device-id', headers ->> 'user-agent'),
    nullif(current_setting('app.change_reason', true), ''),
    coalesce(headers ->> 'x-request-id', headers ->> 'cf-ray')
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
exception
  when invalid_text_representation then
    raise exception 'Control audit context contains an invalid UUID'
      using errcode = '22023';
end
$$;

do $$
declare
  audited_table text;
begin
  foreach audited_table in array array['company_app_entitlements','membership_app_access','control_groups','control_group_members','control_group_app_access'] loop
    execute format('drop trigger if exists %I_audit on public.%I', audited_table, audited_table);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function private.control_audit_table_change()', audited_table, audited_table);
  end loop;
end
$$;

commit;
