-- OperiX canonical four-role authorization model.
--
-- Super admin is represented by company ownership and is never granted to a
-- normal membership. Admin and Manager are tenant-scoped app roles. Employee
-- can create commercial documents, but cannot mutate the catalog or existing
-- documents.

begin;

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Canonical role vocabulary and permissions
-- ---------------------------------------------------------------------------

insert into public.app_permissions (code, name, category, description, is_sensitive)
values (
  'sales_customer.manage',
  'Manage sales customers',
  'sales',
  'Create, edit, and remove customers used by sales documents.',
  true
)
on conflict (code) do update
set name = excluded.name,
    category = excluded.category,
    description = excluded.description,
    is_sensitive = excluded.is_sensitive;

insert into public.app_roles (company_id, code, name, description, is_system)
select null, role_data.code, role_data.name, role_data.description, true
from (values
  ('owner', 'Super admin', 'Company owner and sole authority for OperiX Control.'),
  ('super_administrator', 'Super admin', 'Owner-level authority for OperiX Control.'),
  ('company_administrator', 'Admin', 'Full tenant administration without OperiX Control access.'),
  ('manager', 'Manager', 'Full operational access limited to the assigned tenant scope.'),
  ('employee', 'Employee', 'Create invoices and commercial documents without edit/delete catalog access.')
) as role_data(code, name, description)
where not exists (
  select 1 from public.app_roles role
  where role.company_id is null and role.code = role_data.code
);

update public.app_roles role
set name = role_data.name,
    description = role_data.description,
    is_system = true,
    updated_at = now()
from (values
  ('owner', 'Super admin', 'Company owner and sole authority for OperiX Control.'),
  ('super_administrator', 'Super admin', 'Owner-level authority for OperiX Control.'),
  ('company_administrator', 'Admin', 'Full tenant administration without OperiX Control access.'),
  ('manager', 'Manager', 'Full operational access limited to the assigned tenant scope.'),
  ('employee', 'Employee', 'Create invoices and commercial documents without edit/delete catalog access.')
) as role_data(code, name, description)
where role.company_id is null
  and role.code = role_data.code;

-- Remove permissions inherited from the old role catalogue before rebuilding
-- the four supported permission sets.
delete from public.app_role_permissions assignment
where assignment.role_id in (
  select role.id
  from public.app_roles role
  where role.company_id is null
    and role.code in ('owner', 'super_administrator', 'company_administrator', 'manager', 'employee')
);

-- Owner and Super admin are full-privilege roles. Super admin assignments are
-- still guarded below so only the owner identity can ever use this role.
insert into public.app_role_permissions (role_id, permission_code)
select role.id, permission.code
from public.app_roles role
cross join public.app_permissions permission
where role.company_id is null
  and role.code in ('owner', 'super_administrator')
on conflict do nothing;

-- Admin is the tenant administrator. The only intentionally excluded area is
-- the Control entry point and its settings category; the mobile tenant
-- management workflow remains available through the normal app permissions.
insert into public.app_role_permissions (role_id, permission_code)
select role.id, permission.code
from public.app_roles role
cross join public.app_permissions permission
where role.company_id is null
  and role.code = 'company_administrator'
  and permission.category <> 'control'
on conflict do nothing;

-- Manager has the same operational application surface, but cannot manage
-- organization members, roles, security, app entitlements, billing, or the
-- Control plane. Its membership scope is enforced by has_company_permission.
insert into public.app_role_permissions (role_id, permission_code)
select role.id, permission.code
from public.app_roles role
cross join public.app_permissions permission
where role.company_id is null
  and role.code = 'manager'
  and permission.category not in (
    'control', 'organization', 'users', 'security', 'apps', 'integrations',
    'billing', 'usage', 'developer', 'data', 'platform'
  )
  and permission.code <> 'company.manage'
on conflict do nothing;

-- Employee is deliberately narrow: it can create and view sales documents,
-- including every commercial document type accepted by save_invoice_document,
-- and can post an ordinary invoice as part of creating it.
insert into public.app_role_permissions (role_id, permission_code)
select role.id, permission.code
from public.app_roles role
cross join public.app_permissions permission
join (values
  ('company.read'),
  ('sales_invoice.view'),
  ('sales_invoice.create'),
  ('sales_invoice.post'),
  ('invoice.create')
) as employee_permission(permission_code)
  on employee_permission.permission_code = permission.code
where role.company_id is null
  and role.code = 'employee'
on conflict do nothing;

-- Hide legacy roles from normal role readers. The rows remain for historical
-- foreign-key compatibility, but they cannot be selected or assigned.
drop policy if exists app_roles_member_select on public.app_roles;
create policy app_roles_member_select
on public.app_roles
for select to authenticated
using (
  code in ('owner', 'super_administrator', 'company_administrator', 'manager', 'employee')
  and (
    company_id is null
    or private.is_company_member(company_id)
  )
);

drop policy if exists app_role_permissions_member_select on public.app_role_permissions;
create policy app_role_permissions_member_select
on public.app_role_permissions
for select to authenticated
using (
  exists (
    select 1
    from public.app_roles role
    where role.id = app_role_permissions.role_id
      and role.code in ('owner', 'super_administrator', 'company_administrator', 'manager', 'employee')
      and (role.company_id is null or private.is_company_member(role.company_id))
  )
);

-- ---------------------------------------------------------------------------
-- Permission evaluation
-- ---------------------------------------------------------------------------

create or replace function private.has_company_permission(
  p_company_id uuid,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with recursive ancestors(id) as (
    select p_company_id
    union
    select company.parent_company_id
    from public.companies company
    join ancestors child on child.id = company.id
    where company.parent_company_id is not null
  ), base_access as (
    select private.company_is_active(p_company_id)
      and p_company_id is not null
      and p_permission is not null
      and (
        -- Ownership is the only path to Super admin and OperiX Control.
        exists (
          select 1
          from public.companies company
          join ancestors scope on scope.id = company.id
          where company.owner_id = (select auth.uid())
        )
        or exists (
          select 1
          from public.memberships membership
          join ancestors scope on scope.id = membership.company_id
          join public.membership_role_assignments assignment
            on assignment.membership_id = membership.id
          join public.app_roles role
            on role.id = assignment.role_id
           and (role.company_id is null or role.company_id = membership.company_id)
          join public.app_role_permissions role_permission
            on role_permission.role_id = role.id
          where membership.user_id = (select auth.uid())
            and coalesce(membership.status, 'active') = 'active'
            and (
              role.code in ('company_administrator', 'manager', 'employee')
              or (
                role.code = 'super_administrator'
                and exists (
                  select 1
                  from public.companies owned_company
                  where owned_company.id = membership.company_id
                    and owned_company.owner_id = membership.user_id
                )
              )
            )
            and role_permission.permission_code = p_permission
        )
      ) as allowed
  ), app_gate as (
    select private.control_permission_app_key(p_permission) as app_key
  )
  select base_access.allowed
    and (
      app_gate.app_key is null
      or (
        exists (
          select 1
          from public.company_app_entitlements entitlement
          where entitlement.company_id = p_company_id
            and entitlement.app_key = app_gate.app_key
            and entitlement.enabled
        )
        and exists (
          select 1
          from public.memberships membership
          where membership.company_id = p_company_id
            and membership.user_id = (select auth.uid())
            and coalesce(membership.status, 'active') = 'active'
            and not exists (
              select 1
              from public.membership_app_access access
              where access.membership_id = membership.id
                and access.app_key = app_gate.app_key
                and access.enabled = false
            )
        )
      )
    )
    and (p_permission not like 'control.%' or private.control_mfa_satisfied(p_company_id))
  from base_access, app_gate;
$$;

create or replace function private.has_unscoped_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.companies company
    where private.company_is_active(company.id)
      and (
        company.owner_id = (select auth.uid())
        or private.has_company_permission(company.id, p_permission)
      )
  );
$$;

revoke all on function private.has_unscoped_permission(text) from public;
grant execute on function private.has_unscoped_permission(text) to authenticated, service_role;

create or replace function public.get_my_company_role(p_company_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when company.owner_id = (select auth.uid()) then 'super_administrator'
    else coalesce(
      assigned_role.code,
      case lower(coalesce(membership.role, 'employee'))
        when 'admin' then 'company_administrator'
        when 'manager' then 'manager'
        when 'employee' then 'employee'
        when 'worker' then 'employee'
        else 'employee'
      end
    )
  end
  from public.companies company
  left join public.memberships membership
    on membership.company_id = company.id
   and membership.user_id = (select auth.uid())
   and coalesce(membership.status, 'active') = 'active'
  left join lateral (
    select role.code
    from public.membership_role_assignments assignment
    join public.app_roles role on role.id = assignment.role_id
    where assignment.membership_id = membership.id
      and role.code in ('company_administrator', 'manager', 'employee')
    order by case role.code
      when 'company_administrator' then 1
      when 'manager' then 2
      else 3
    end
    limit 1
  ) assigned_role on true
  where company.id = p_company_id
    and (company.owner_id = (select auth.uid()) or membership.id is not null)
  limit 1;
$$;

revoke all on function public.get_my_company_role(uuid) from public, anon;
grant execute on function public.get_my_company_role(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Role assignment and invitation boundaries
-- ---------------------------------------------------------------------------

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
    join selected_role
      on selected_role.company_id is null
      or selected_role.company_id = target.company_id
    join public.companies company on company.id = target.company_id
    where target.user_id <> (select auth.uid())
      and target.user_id <> company.owner_id
      and selected_role.code in ('company_administrator', 'manager', 'employee')
      and private.has_company_permission(target.company_id, 'roles.manage')
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

create or replace function public.set_company_member_role(
  p_membership_id uuid,
  p_role_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_company_id uuid;
  target_user_id uuid;
  target_owner_id uuid;
  selected_role_id uuid;
  selected_role_code text;
  selected_role_name text;
  legacy_role text;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select membership.company_id, membership.user_id, company.owner_id
  into target_company_id, target_user_id, target_owner_id
  from public.memberships membership
  join public.companies company on company.id = membership.company_id
  where membership.id = p_membership_id;

  if target_company_id is null then
    raise exception 'Membership was not found' using errcode = '22023';
  end if;
  if not private.has_company_permission(target_company_id, 'roles.manage') then
    raise exception 'You do not have permission to change this member' using errcode = '42501';
  end if;
  if target_user_id = actor_id then
    raise exception 'You cannot change your own company privilege' using errcode = '42501';
  end if;
  if target_user_id = target_owner_id then
    raise exception 'The company owner must keep the Super admin privilege' using errcode = '42501';
  end if;

  select role.id, role.code, role.name
  into selected_role_id, selected_role_code, selected_role_name
  from public.app_roles role
  where role.company_id is null
    and role.code in ('company_administrator', 'manager', 'employee')
    and lower(role.code) = lower(trim(p_role_code))
  limit 1;

  if selected_role_id is null then
    raise exception 'Only Admin, Manager, and Employee roles can be assigned' using errcode = '22023';
  end if;

  legacy_role := case selected_role_code
    when 'company_administrator' then 'admin'
    when 'manager' then 'manager'
    else 'employee'
  end;

  update public.memberships
  set role = legacy_role, status = 'active'
  where id = p_membership_id;

  perform set_config('app.membership_role_workflow', 'authorized', true);
  delete from public.membership_role_assignments
  where membership_id = p_membership_id;
  insert into public.membership_role_assignments (membership_id, role_id, created_by)
  values (p_membership_id, selected_role_id, actor_id);

  return jsonb_build_object(
    'membership_id', p_membership_id,
    'role_code', selected_role_code,
    'role_name', selected_role_name
  );
end;
$$;

revoke all on function public.set_company_member_role(uuid, text) from public, anon;
grant execute on function public.set_company_member_role(uuid, text) to authenticated;

create or replace function public.create_company_invitation(
  p_company_id uuid,
  p_email text,
  p_role_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  normalized_email text := lower(trim(p_email));
  raw_token text := encode(extensions.gen_random_bytes(32), 'hex');
  selected_role_id uuid;
  selected_role_code text;
  selected_role_name text;
  company_name_value text;
  invitation_id uuid;
  expires_at_value timestamptz := now() + interval '7 days';
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not (
    private.has_company_permission(p_company_id, 'users.manage')
    or private.has_company_permission(p_company_id, 'roles.manage')
  ) then
    raise exception 'You do not have permission to invite users to this company' using errcode = '42501';
  end if;
  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Enter a valid email address' using errcode = '22023';
  end if;

  select company.company_name into company_name_value
  from public.companies company
  where company.id = p_company_id;
  if company_name_value is null then
    raise exception 'Company was not found' using errcode = '22023';
  end if;

  select role.id, role.code, role.name
  into selected_role_id, selected_role_code, selected_role_name
  from public.app_roles role
  where role.company_id is null
    and role.code in ('company_administrator', 'manager', 'employee')
    and lower(role.code) = lower(trim(p_role_code))
  limit 1;
  if selected_role_id is null then
    raise exception 'Only Admin, Manager, and Employee roles can be invited' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.memberships membership
    join auth.users auth_user on auth_user.id = membership.user_id
    where membership.company_id = p_company_id
      and lower(auth_user.email) = normalized_email
      and coalesce(membership.status, 'active') <> 'revoked'
  ) then
    raise exception 'This email already has access to the company' using errcode = '23505';
  end if;

  update public.company_invitations
  set status = 'revoked', updated_at = now()
  where company_id = p_company_id
    and lower(email) = normalized_email
    and status = 'pending';

  insert into public.company_invitations (
    company_id, email, role_code, invited_by, token_hash, expires_at
  )
  values (
    p_company_id, normalized_email, selected_role_code, actor_id,
    encode(extensions.digest(raw_token, 'sha256'), 'hex'), expires_at_value
  )
  returning id into invitation_id;

  return jsonb_build_object(
    'id', invitation_id,
    'company_id', p_company_id,
    'company_name', company_name_value,
    'email', normalized_email,
    'role_code', selected_role_code,
    'role_name', selected_role_name,
    'token', raw_token,
    'expires_at', expires_at_value
  );
end;
$$;

revoke all on function public.create_company_invitation(uuid, text, text) from public, anon;
grant execute on function public.create_company_invitation(uuid, text, text) to authenticated;

create or replace function public.accept_company_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_email text;
  invitation public.company_invitations%rowtype;
  target_role_id uuid;
  legacy_role text;
  membership_id_value uuid;
  company_name_value text;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select lower(email) into actor_email from auth.users where id = actor_id;
  select * into invitation
  from public.company_invitations
  where token_hash = encode(extensions.digest(trim(p_token), 'sha256'), 'hex')
    and status = 'pending'
  for update;

  if invitation.id is null then
    raise exception 'Invitation is invalid, expired, or already used' using errcode = '22023';
  end if;
  if invitation.expires_at <= now() then
    update public.company_invitations
    set status = 'expired', updated_at = now()
    where id = invitation.id;
    raise exception 'Invitation has expired' using errcode = '22023';
  end if;
  if actor_email is null or actor_email <> lower(invitation.email) then
    raise exception 'Sign in with the invited email address before accepting this invitation' using errcode = '42501';
  end if;

  select role.id into target_role_id
  from public.app_roles role
  where role.company_id is null
    and role.code in ('company_administrator', 'manager', 'employee')
    and lower(role.code) = lower(invitation.role_code)
  limit 1;
  if target_role_id is null then
    raise exception 'The invited privilege is no longer available' using errcode = '22023';
  end if;

  legacy_role := case lower(invitation.role_code)
    when 'company_administrator' then 'admin'
    when 'manager' then 'manager'
    else 'employee'
  end;

  insert into public.memberships (company_id, user_id, role, status)
  values (invitation.company_id, actor_id, legacy_role, 'active')
  on conflict (company_id, user_id) do update
    set role = excluded.role, status = 'active'
  returning id into membership_id_value;

  perform set_config('app.membership_role_workflow', 'authorized', true);
  delete from public.membership_role_assignments
  where membership_id = membership_id_value;
  insert into public.membership_role_assignments (membership_id, role_id, created_by)
  values (membership_id_value, target_role_id, actor_id);

  update public.company_invitations
  set status = 'accepted', accepted_by = actor_id, accepted_at = now(), updated_at = now()
  where id = invitation.id;

  select company.company_name into company_name_value
  from public.companies company
  where company.id = invitation.company_id;

  perform set_config('app.company_link_workflow', 'authorized', true);
  perform set_config('app.active_company_switch', 'authorized', true);
  update public.profiles
  set active_company_id = coalesce(active_company_id, invitation.company_id),
      company_id = coalesce(company_id, invitation.company_id)
  where id = actor_id;

  return jsonb_build_object(
    'company_id', invitation.company_id,
    'company_name', company_name_value,
    'role_code', invitation.role_code,
    'membership_id', membership_id_value
  );
end;
$$;

revoke all on function public.accept_company_invitation(text) from public, anon;
grant execute on function public.accept_company_invitation(text) to authenticated;

-- Replace legacy role labels in both member list contracts. Owners are shown
-- as Super admin even though their protected membership remains owner.
create or replace function public.list_company_members(p_company_id uuid)
returns table (
  membership_id uuid, user_id uuid, email text, first_name text, last_name text,
  legacy_role text, status text, role_code text, role_name text
)
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not private.has_company_permission(p_company_id, 'roles.manage') then
    raise exception 'You do not have permission to manage this company team' using errcode = '42501';
  end if;
  return query
  select membership.id, membership.user_id,
    coalesce(auth_user.email, profile.email)::text,
    profile.first_name::text, profile.last_name::text,
    membership.role::text, coalesce(membership.status, 'active')::text,
    case
      when company.owner_id = membership.user_id then 'super_administrator'
      else coalesce(assigned_role.code,
        case lower(coalesce(membership.role, 'employee'))
          when 'admin' then 'company_administrator'
          when 'manager' then 'manager'
          else 'employee'
        end)
    end::text,
    case
      when company.owner_id = membership.user_id then 'Super admin'
      when coalesce(assigned_role.code,
        case lower(coalesce(membership.role, 'employee'))
          when 'admin' then 'company_administrator'
          when 'manager' then 'manager'
          else 'employee'
        end) = 'company_administrator' then 'Admin'
      when coalesce(assigned_role.code, membership.role) = 'manager' then 'Manager'
      else 'Employee'
    end::text
  from public.memberships membership
  join public.companies company on company.id = membership.company_id
  left join auth.users auth_user on auth_user.id = membership.user_id
  left join public.profiles profile on profile.id = membership.user_id
  left join lateral (
    select role.code
    from public.membership_role_assignments assignment
    join public.app_roles role on role.id = assignment.role_id
    where assignment.membership_id = membership.id
      and role.code in ('company_administrator', 'manager', 'employee')
    order by case role.code when 'company_administrator' then 1 when 'manager' then 2 else 3 end
    limit 1
  ) assigned_role on true
  where membership.company_id = p_company_id
    and coalesce(membership.status, 'active') <> 'revoked'
  order by lower(coalesce(auth_user.email, profile.email, ''));
end;
$$;

revoke all on function public.list_company_members(uuid) from public, anon;
grant execute on function public.list_company_members(uuid) to authenticated;

create or replace function public.control_list_company_members(p_company_id uuid)
returns table (
  membership_id uuid, user_id uuid, email text, first_name text, last_name text,
  legacy_role text, status text, role_code text, role_name text
)
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not private.has_company_permission(p_company_id, 'users.read') then
    raise exception 'You do not have permission to view company users' using errcode = '42501';
  end if;
  return query
  select membership.id, membership.user_id,
    coalesce(auth_user.email, profile.email)::text,
    profile.first_name::text, profile.last_name::text,
    membership.role::text, coalesce(membership.status, 'active')::text,
    case
      when company.owner_id = membership.user_id then 'super_administrator'
      else coalesce(assigned_role.code,
        case lower(coalesce(membership.role, 'employee'))
          when 'admin' then 'company_administrator'
          when 'manager' then 'manager'
          else 'employee'
        end)
    end::text,
    case
      when company.owner_id = membership.user_id then 'Super admin'
      when coalesce(assigned_role.code,
        case lower(coalesce(membership.role, 'employee'))
          when 'admin' then 'company_administrator'
          when 'manager' then 'manager'
          else 'employee'
        end) = 'company_administrator' then 'Admin'
      when coalesce(assigned_role.code, membership.role) = 'manager' then 'Manager'
      else 'Employee'
    end::text
  from public.memberships membership
  join public.companies company on company.id = membership.company_id
  left join auth.users auth_user on auth_user.id = membership.user_id
  left join public.profiles profile on profile.id = membership.user_id
  left join lateral (
    select role.code
    from public.membership_role_assignments assignment
    join public.app_roles role on role.id = assignment.role_id
    where assignment.membership_id = membership.id
      and role.code in ('company_administrator', 'manager', 'employee')
    order by case role.code when 'company_administrator' then 1 when 'manager' then 2 else 3 end
    limit 1
  ) assigned_role on true
  where membership.company_id = p_company_id
    and coalesce(membership.status, 'active') <> 'revoked'
  order by lower(coalesce(auth_user.email, profile.email, ''));
end;
$$;

revoke all on function public.control_list_company_members(uuid) from public, anon;
grant execute on function public.control_list_company_members(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Normalize existing memberships and remove legacy assignments
-- ---------------------------------------------------------------------------

update public.memberships membership
set role = 'owner'
from public.companies company
where company.id = membership.company_id
  and company.owner_id = membership.user_id
  and coalesce(membership.status, 'active') <> 'revoked';

update public.memberships membership
set role = case lower(coalesce(membership.role, 'employee'))
  when 'admin' then 'admin'
  when 'manager' then 'manager'
  else 'employee'
end
where coalesce(membership.status, 'active') <> 'revoked'
  and not exists (
    select 1
    from public.companies company
    where company.id = membership.company_id
      and company.owner_id = membership.user_id
  );

delete from public.membership_role_assignments;

insert into public.membership_role_assignments (membership_id, role_id)
select membership.id, role.id
from public.memberships membership
join public.app_roles role
  on role.company_id is null
 and role.code = case lower(membership.role)
   when 'admin' then 'company_administrator'
   when 'manager' then 'manager'
   else 'employee'
 end
where coalesce(membership.status, 'active') <> 'revoked'
  and not exists (
    select 1
    from public.companies company
    where company.id = membership.company_id
      and company.owner_id = membership.user_id
  );

-- ---------------------------------------------------------------------------
-- Employee write boundaries for catalog and financial records
-- ---------------------------------------------------------------------------

drop policy if exists products_company_insert on public.products;
create policy products_company_insert
on public.products for insert to authenticated
with check (
  (
    company_id is not null
    and user_id = (select auth.uid())
    and private.has_company_permission(company_id, 'products.manage')
  )
  or (
    company_id is null
    and user_id = (select auth.uid())
    and private.has_unscoped_permission('products.manage')
  )
);

drop policy if exists products_company_update on public.products;
create policy products_company_update
on public.products for update to authenticated
using (
  (company_id is not null and private.has_company_permission(company_id, 'products.manage'))
  or (company_id is null and user_id = (select auth.uid()) and private.has_unscoped_permission('products.manage'))
)
with check (
  (company_id is not null and private.has_company_permission(company_id, 'products.manage'))
  or (company_id is null and user_id = (select auth.uid()) and private.has_unscoped_permission('products.manage'))
);

drop policy if exists products_company_delete on public.products;
create policy products_company_delete
on public.products for delete to authenticated
using (
  (company_id is not null and private.has_company_permission(company_id, 'products.manage'))
  or (company_id is null and user_id = (select auth.uid()) and private.has_unscoped_permission('products.manage'))
);

drop policy if exists clients_company_insert on public.clients;
create policy clients_company_insert
on public.clients for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (
    (company_id is not null and private.has_company_permission(company_id, 'sales_customer.manage'))
    or (company_id is null and private.has_unscoped_permission('sales_customer.manage'))
  )
);

drop policy if exists clients_company_update on public.clients;
create policy clients_company_update
on public.clients for update to authenticated
using (
  (company_id is not null and private.has_company_permission(company_id, 'sales_customer.manage'))
  or (company_id is null and user_id = (select auth.uid()) and private.has_unscoped_permission('sales_customer.manage'))
)
with check (
  (company_id is not null and private.has_company_permission(company_id, 'sales_customer.manage'))
  or (company_id is null and user_id = (select auth.uid()) and private.has_unscoped_permission('sales_customer.manage'))
);

drop policy if exists clients_company_delete on public.clients;
create policy clients_company_delete
on public.clients for delete to authenticated
using (
  (company_id is not null and private.has_company_permission(company_id, 'sales_customer.manage'))
  or (company_id is null and user_id = (select auth.uid()) and private.has_unscoped_permission('sales_customer.manage'))
);

drop policy if exists expenses_company_insert on public.expenses;
create policy expenses_company_insert
on public.expenses for insert to authenticated
with check (
  user_id = (select auth.uid())
  and company_id is not null
  and private.has_company_permission(company_id, 'expense.post')
);

drop policy if exists expenses_company_update on public.expenses;
create policy expenses_company_update
on public.expenses for update to authenticated
using (company_id is not null and private.has_company_permission(company_id, 'expense.post'))
with check (company_id is not null and private.has_company_permission(company_id, 'expense.post'));

drop policy if exists expenses_company_delete on public.expenses;
create policy expenses_company_delete
on public.expenses for delete to authenticated
using (company_id is not null and private.has_company_permission(company_id, 'expense.post'));

drop policy if exists payments_company_insert on public.payments;
create policy payments_company_insert
on public.payments for insert to authenticated
with check (
  user_id = (select auth.uid())
  and company_id is not null
  and private.has_company_permission(company_id, 'payments.manage')
);

drop policy if exists payments_company_update on public.payments;
create policy payments_company_update
on public.payments for update to authenticated
using (company_id is not null and private.has_company_permission(company_id, 'payments.manage'))
with check (company_id is not null and private.has_company_permission(company_id, 'payments.manage'));

drop policy if exists payments_company_delete on public.payments;
create policy payments_company_delete
on public.payments for delete to authenticated
using (company_id is not null and private.has_company_permission(company_id, 'payments.manage'));

drop policy if exists invoices_company_insert on public.invoices;
create policy invoices_company_insert
on public.invoices for insert to authenticated
with check (
  user_id = (select auth.uid())
  and company_id is not null
  and (
    private.has_company_permission(company_id, 'sales_invoice.create')
    or private.has_company_permission(company_id, 'invoice.create')
  )
);

drop policy if exists invoices_editor_update on public.invoices;
create policy invoices_editor_update
on public.invoices for update to authenticated
using (company_id is not null and private.has_company_permission(company_id, 'sales_invoice.edit'))
with check (
  company_id is not null
  and private.has_company_permission(company_id, 'sales_invoice.edit')
  and upper(coalesce(commercial_status, status::text, 'DRAFT')) = any (array['DRAFT', 'SENT', 'VIEWED'])
);

drop policy if exists invoice_items_editor_insert on public.invoice_items;
create policy invoice_items_editor_insert
on public.invoice_items for insert to authenticated
with check (
  exists (
    select 1 from public.invoices invoice
    where invoice.id = invoice_items.invoice_id
      and private.has_company_permission(invoice.company_id, 'sales_invoice.edit')
  )
);

drop policy if exists invoice_items_editor_update on public.invoice_items;
create policy invoice_items_editor_update
on public.invoice_items for update to authenticated
using (
  exists (
    select 1 from public.invoices invoice
    where invoice.id = invoice_items.invoice_id
      and private.has_company_permission(invoice.company_id, 'sales_invoice.edit')
  )
)
with check (
  exists (
    select 1 from public.invoices invoice
    where invoice.id = invoice_items.invoice_id
      and private.has_company_permission(invoice.company_id, 'sales_invoice.edit')
  )
);

drop policy if exists invoice_items_editor_delete on public.invoice_items;
create policy invoice_items_editor_delete
on public.invoice_items for delete to authenticated
using (
  exists (
    select 1 from public.invoices invoice
    where invoice.id = invoice_items.invoice_id
      and private.has_company_permission(invoice.company_id, 'sales_invoice.edit')
  )
);

-- ---------------------------------------------------------------------------
-- Product deletion that preserves historical references
-- ---------------------------------------------------------------------------

alter table public.inventory_stock_movements add column if not exists product_name text;
alter table public.inventory_movements add column if not exists product_name text;
alter table public.inventory_count_lines add column if not exists product_name text;

update public.inventory_stock_movements movement
set product_name = product.name
from public.products product
where movement.product_id = product.id and movement.product_name is null;
update public.inventory_movements movement
set product_name = product.name
from public.products product
where movement.product_id = product.id and movement.product_name is null;
update public.inventory_count_lines line
set product_name = product.name
from public.products product
where line.product_id = product.id and line.product_name is null;

alter table public.pos_order_lines drop constraint if exists pos_order_lines_product_id_fkey;
alter table public.pos_order_lines add constraint pos_order_lines_product_id_fkey
  foreign key (product_id) references public.products(id) on delete set null;
alter table public.inventory_stock_movements alter column product_id drop not null;
alter table public.inventory_stock_movements drop constraint if exists inventory_stock_movements_product_id_fkey;
alter table public.inventory_stock_movements add constraint inventory_stock_movements_product_id_fkey
  foreign key (product_id) references public.products(id) on delete set null;
alter table public.inventory_movements alter column product_id drop not null;
alter table public.inventory_movements drop constraint if exists inventory_movements_product_id_fkey;
alter table public.inventory_movements add constraint inventory_movements_product_id_fkey
  foreign key (product_id) references public.products(id) on delete set null;
alter table public.inventory_count_lines alter column product_id drop not null;
alter table public.inventory_count_lines drop constraint if exists inventory_count_lines_product_id_fkey;
alter table public.inventory_count_lines add constraint inventory_count_lines_product_id_fkey
  foreign key (product_id) references public.products(id) on delete set null;

create or replace function public.delete_product(p_product_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid());
  product_row public.products;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into product_row
  from public.products
  where id = p_product_id
  for update;
  if not found then
    raise exception 'Product not found' using errcode = 'P0002';
  end if;
  if (
    product_row.company_id is not null
    and not coalesce(private.has_company_permission(product_row.company_id, 'products.manage'), false)
  ) or (
    product_row.company_id is null
    and (
      product_row.user_id <> actor_id
      or not private.has_unscoped_permission('products.manage')
    )
  ) then
    raise exception 'You do not have permission to delete this product' using errcode = '42501';
  end if;

  perform set_config('app.product_delete_workflow', 'authorized', true);
  update public.inventory_stock_movements
  set product_name = coalesce(product_name, product_row.name), product_id = null
  where product_id = p_product_id;
  update public.inventory_movements
  set product_name = coalesce(product_name, product_row.name), product_id = null
  where product_id = p_product_id;
  update public.inventory_count_lines
  set product_name = coalesce(product_name, product_row.name), product_id = null
  where product_id = p_product_id;
  delete from public.products where id = p_product_id;
end;
$$;

revoke all on function public.delete_product(uuid) from public, anon;
grant execute on function public.delete_product(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Existing save RPC: keep creation available, but block Employee edits
-- ---------------------------------------------------------------------------

-- Rename the already deployed implementation so the public RPC can perform a
-- permission check before delegating to the trusted atomic writer. Internal
-- security-definer workflows continue to use the trusted implementation.
alter function public.save_invoice_document(jsonb, jsonb, uuid, boolean, uuid)
  rename to save_invoice_document_unchecked;

create or replace function public.save_invoice_document(
  p_invoice jsonb,
  p_items jsonb,
  p_invoice_id uuid default null,
  p_post_invoice boolean default false,
  p_idempotency_key uuid default null
)
returns public.invoices
language plpgsql security definer set search_path = '' as $$
declare
  target_company_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_invoice_id is not null then
    select invoice.company_id into target_company_id
    from public.invoices invoice
    where invoice.id = p_invoice_id;
    if target_company_id is null
       or not private.has_company_permission(target_company_id, 'sales_invoice.edit') then
      raise exception 'Insufficient permission to edit sales invoices' using errcode = '42501';
    end if;
  else
    perform set_config('app.document_create_workflow', 'authorized', true);
  end if;
  return public.save_invoice_document_unchecked(p_invoice, p_items, p_invoice_id, p_post_invoice, p_idempotency_key);
end;
$$;

revoke all on function public.save_invoice_document_unchecked(jsonb, jsonb, uuid, boolean, uuid) from public, anon, authenticated;
revoke all on function public.save_invoice_document(jsonb, jsonb, uuid, boolean, uuid) from public, anon;
grant execute on function public.save_invoice_document(jsonb, jsonb, uuid, boolean, uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
