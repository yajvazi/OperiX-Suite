-- Do not let the shared organization switcher select archived companies.
-- Control also fails closed if an older client already holds such a context.

create or replace function public.set_active_company(p_company_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not private.company_is_active(p_company_id) then
    raise exception 'The organization is archived or unavailable'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.companies company
    where company.id = p_company_id and company.owner_id = current_user_id
  ) and not exists (
    select 1 from public.memberships membership
    where membership.user_id = current_user_id
      and coalesce(membership.status, 'active') = 'active'
      and private.company_is_in_scope(membership.company_id, p_company_id)
  ) and not exists (
    select 1 from public.profiles profile
    where profile.id = current_user_id
      and private.company_is_in_scope(profile.company_id, p_company_id)
  ) then
    raise exception 'You are not a member of this company or subdivision'
      using errcode = '42501';
  end if;

  perform set_config('app.active_company_switch', 'authorized', true);
  update public.profiles
  set active_company_id = p_company_id, updated_at = clock_timestamp()
  where id = current_user_id;
  perform set_config('app.active_company_switch', '', true);
  return p_company_id;
end;
$$;

revoke all on function public.set_active_company(uuid) from public, anon;
grant execute on function public.set_active_company(uuid) to authenticated;
