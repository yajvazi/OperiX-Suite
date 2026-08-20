-- Fix the member-management RPC return types for auth.users varchar columns.
-- auth.users.email is varchar in hosted Supabase, while the public function
-- contract intentionally exposes text values to the mobile client.

create or replace function public.list_company_members(p_company_id uuid)
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

  if not private.has_company_permission(p_company_id, 'roles.manage') then
    raise exception 'You do not have permission to manage this company team'
      using errcode = '42501';
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
    coalesce(
      max(assigned_role.code),
      case lower(coalesce(membership.role, 'worker'))
        when 'owner' then 'owner'
        when 'admin' then 'company_administrator'
        when 'manager' then 'sales_manager'
        when 'accountant' then 'accountant'
        when 'cashier' then 'cashier'
        when 'waiter' then 'waiter'
        when 'auditor' then 'auditor'
        else 'read_only'
      end
    )::text,
    coalesce(max(assigned_role.name), 'Read-only user')::text
  from public.memberships membership
  left join auth.users auth_user on auth_user.id = membership.user_id
  left join public.profiles profile on profile.id = membership.user_id
  left join public.membership_role_assignments assignment
    on assignment.membership_id = membership.id
  left join public.app_roles assigned_role
    on assigned_role.id = assignment.role_id
  where membership.company_id = p_company_id
    and coalesce(membership.status, 'active') <> 'revoked'
  group by
    membership.id,
    membership.user_id,
    auth_user.email,
    profile.email,
    profile.first_name,
    profile.last_name,
    membership.role,
    membership.status
  order by lower(coalesce(auth_user.email, profile.email, ''));
end;
$$;

revoke all on function public.list_company_members(uuid) from public, anon;
grant execute on function public.list_company_members(uuid) to authenticated;
