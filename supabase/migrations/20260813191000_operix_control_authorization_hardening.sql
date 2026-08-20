-- OperiX Control authorization hardening.
-- Keep legacy application RPCs available, but close direct table paths that
-- could bypass their safer lifecycle rules.

begin;

-- Company ownership is not a normal organization preference. Ownership
-- transfer needs a dedicated, owner-only audited workflow; no such workflow is
-- exposed by Control yet, so direct updates are rejected.
create or replace function private.prevent_company_owner_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id
     and (
       coalesce(current_setting('app.company_owner_transfer', true), '') <> 'authorized'
       or old.owner_id is distinct from (select auth.uid())
     ) then
    raise exception 'Use the authorized owner-transfer workflow'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists companies_owner_guard on public.companies;
create trigger companies_owner_guard
before update of owner_id on public.companies
for each row execute function private.prevent_company_owner_mutation();

-- A role manager may create or assign only permissions they already hold,
-- unless they are the company owner/full company administrator. This keeps a
-- roles.manage grant from becoming a path to self-escalation.
create or replace function private.can_grant_permission(
  p_role_id uuid,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_roles role
    where role.id = p_role_id
      and role.company_id is not null
      and private.has_company_permission(role.company_id, 'roles.manage')
      and (
        private.has_company_permission(role.company_id, 'company.manage')
        or private.has_company_permission(role.company_id, p_permission)
      )
  );
$$;

revoke all on function private.can_grant_permission(uuid, text) from public;
grant execute on function private.can_grant_permission(uuid, text) to authenticated, service_role;

drop policy if exists app_role_permissions_manage_insert on public.app_role_permissions;
create policy app_role_permissions_manage_insert
on public.app_role_permissions
for insert to authenticated
with check ((select private.can_grant_permission(role_id, permission_code)));

create or replace function private.can_grant_role(
  p_membership_id uuid,
  p_role_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with target as (
    select membership.id, membership.user_id, membership.company_id
    from public.memberships membership
    where membership.id = p_membership_id
  ), selected_role as (
    select role.id, role.code, role.company_id
    from public.app_roles role
    where role.id = p_role_id
  )
  select exists (
    select 1
    from target
    join selected_role on selected_role.company_id is null or selected_role.company_id = target.company_id
    join public.companies company on company.id = target.company_id
    where target.user_id <> (select auth.uid())
      and private.has_company_permission(target.company_id, 'roles.manage')
      and (
        selected_role.code not in ('owner', 'super_administrator', 'company_administrator')
        or company.owner_id = (select auth.uid())
      )
      and (
        private.has_company_permission(target.company_id, 'company.manage')
        or not exists (
          select 1
          from public.app_role_permissions requested
          where requested.role_id = selected_role.id
            and not private.has_company_permission(target.company_id, requested.permission_code)
        )
      )
  );
$$;

revoke all on function private.can_grant_role(uuid, uuid) from public;
grant execute on function private.can_grant_role(uuid, uuid) to authenticated, service_role;

-- Security-definer legacy RPCs bypass table RLS. Enforce the same role ceiling
-- at the table boundary, while allowing the existing invitation acceptance and
-- server-side provisioning workflows to mark their inserts explicitly.
create or replace function private.prevent_unsafe_role_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or coalesce(current_setting('app.membership_role_workflow', true), '') = 'authorized' then
    return new;
  end if;

  if not private.can_grant_role(new.membership_id, new.role_id) then
    raise exception 'You cannot grant this organization role'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists membership_role_assignments_guard on public.membership_role_assignments;
create trigger membership_role_assignments_guard
before insert on public.membership_role_assignments
for each row execute function private.prevent_unsafe_role_assignment();

drop policy if exists membership_role_assignments_manage_insert on public.membership_role_assignments;
create policy membership_role_assignments_manage_insert
on public.membership_role_assignments
for insert to authenticated
with check ((select private.can_grant_role(membership_id, role_id)));

-- Application access metadata is administrative data. Members may only read it
-- when they have the corresponding Control read/manage permission.
drop policy if exists company_app_entitlements_member_select on public.company_app_entitlements;
create policy company_app_entitlements_member_select
on public.company_app_entitlements
for select to authenticated
using (
  private.has_company_permission(company_id, 'apps.read')
  or private.has_company_permission(company_id, 'apps.manage')
);

drop policy if exists membership_app_access_member_select on public.membership_app_access;
create policy membership_app_access_member_select
on public.membership_app_access
for select to authenticated
using (
  exists (
    select 1
    from public.memberships membership
    where membership.id = membership_id
      and (
        private.has_company_permission(membership.company_id, 'apps.read')
        or private.has_company_permission(membership.company_id, 'apps.manage')
      )
  )
);

drop policy if exists control_groups_member_select on public.control_groups;
create policy control_groups_member_select
on public.control_groups
for select to authenticated
using (
  private.has_company_permission(company_id, 'teams.read')
  or private.has_company_permission(company_id, 'teams.manage')
);

drop policy if exists control_group_members_member_select on public.control_group_members;
create policy control_group_members_member_select
on public.control_group_members
for select to authenticated
using (
  exists (
    select 1
    from public.control_groups group_row
    where group_row.id = group_id
      and (
        private.has_company_permission(group_row.company_id, 'teams.read')
        or private.has_company_permission(group_row.company_id, 'teams.manage')
      )
  )
);

drop policy if exists control_group_app_access_member_select on public.control_group_app_access;
create policy control_group_app_access_member_select
on public.control_group_app_access
for select to authenticated
using (
  exists (
    select 1
    from public.control_groups group_row
    where group_row.id = group_id
      and (
        private.has_company_permission(group_row.company_id, 'teams.read')
        or private.has_company_permission(group_row.company_id, 'teams.manage')
      )
  )
);

commit;
