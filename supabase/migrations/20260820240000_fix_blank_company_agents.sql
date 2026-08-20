-- Do not expose orphan memberships as blank sales agents.

delete from public.memberships
where user_id is null;

create or replace function public.list_company_agents(p_company_id uuid)
returns table (
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  membership_role text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  return query
  select
    membership.user_id,
    coalesce(auth_user.email, profile.email)::text,
    profile.first_name::text,
    profile.last_name::text,
    coalesce(membership.role, 'employee')::text
  from public.memberships membership
  left join auth.users auth_user on auth_user.id = membership.user_id
  left join public.profiles profile on profile.id = membership.user_id
  where membership.company_id = p_company_id
    and membership.user_id is not null
    and coalesce(membership.status, 'active') <> 'revoked'
    and (
      private.has_company_permission(p_company_id, 'roles.manage')
      or private.has_company_permission(p_company_id, 'accounting.read')
      or private.has_company_permission(p_company_id, 'sales_invoice.view')
    )
  order by lower(coalesce(auth_user.email, profile.email, ''));
end;
$$;

revoke all on function public.list_company_agents(uuid) from public, anon;
grant execute on function public.list_company_agents(uuid) to authenticated;

