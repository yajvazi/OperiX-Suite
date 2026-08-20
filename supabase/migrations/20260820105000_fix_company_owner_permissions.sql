-- Company owners are authorized by ownership even when the legacy data model
-- has no membership row for the owned company.
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
        and (
          exists (
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
          or exists (
            select 1
            from public.companies owned_company
            where owned_company.id = p_company_id
              and owned_company.owner_id = (select auth.uid())
          )
        )
      )
    )
    and (p_permission not like 'control.%' or private.control_mfa_satisfied(p_company_id))
  from base_access, app_gate;
$$;

revoke all on function private.has_company_permission(uuid, text) from public;
grant execute on function private.has_company_permission(uuid, text) to authenticated, service_role;
