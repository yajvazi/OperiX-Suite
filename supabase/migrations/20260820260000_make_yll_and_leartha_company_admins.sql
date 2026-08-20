-- Grant company administrator access to the two requested users on every
-- active company membership they already have.
--
-- This intentionally does not create memberships or change revoked access.
-- Keep the legacy memberships.role and the current role assignment in sync so
-- older and newer authorization paths resolve the same privilege.
do $$
declare
  company_admin_role_id uuid;
begin
  select role.id
  into company_admin_role_id
  from public.app_roles role
  where role.company_id is null
    and role.code = 'company_administrator'
  limit 1;

  if company_admin_role_id is null then
    raise exception 'The company_administrator system role is missing';
  end if;

  -- This migration is safe to re-run and only targets these exact accounts.
  update public.memberships membership
  set role = 'admin'
  from auth.users account
  where account.id = membership.user_id
    and lower(account.email) in (
      'yllajvazi@lrdy-group.com',
      'learthajdari@lrdy-group.com'
    )
    and coalesce(membership.status, 'active') = 'active';

  perform set_config('app.membership_role_workflow', 'authorized', true);

  delete from public.membership_role_assignments assignment
  using public.memberships membership
  join auth.users account on account.id = membership.user_id
  where assignment.membership_id = membership.id
    and lower(account.email) in (
      'yllajvazi@lrdy-group.com',
      'learthajdari@lrdy-group.com'
    )
    and coalesce(membership.status, 'active') = 'active';

  insert into public.membership_role_assignments (membership_id, role_id)
  select membership.id, company_admin_role_id
  from public.memberships membership
  join auth.users account on account.id = membership.user_id
  where lower(account.email) in (
      'yllajvazi@lrdy-group.com',
      'learthajdari@lrdy-group.com'
    )
    and coalesce(membership.status, 'active') = 'active';

  perform set_config('app.membership_role_workflow', '', true);
end;
$$;
