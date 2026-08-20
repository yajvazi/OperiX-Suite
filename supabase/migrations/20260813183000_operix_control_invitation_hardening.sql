-- Keep the existing shared invitation flow, but mark its profile-linking
-- writes as the authorized membership workflow. The profile guards are
-- intentionally strict for direct client updates; invitation acceptance is
-- the one server-side path that is allowed to establish the initial context.

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

  select lower(email) into actor_email
  from auth.users
  where id = actor_id;

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
    raise exception 'Sign in with the invited email address before accepting this invitation'
      using errcode = '42501';
  end if;

  select role.id into target_role_id
  from public.app_roles role
  where lower(role.code) = lower(invitation.role_code)
    and (role.company_id is null or role.company_id = invitation.company_id)
  order by role.company_id nulls last
  limit 1;

  if target_role_id is null then
    raise exception 'The invited privilege is no longer available' using errcode = '22023';
  end if;

  legacy_role := case
    when invitation.role_code = 'owner' then 'owner'
    when invitation.role_code in ('company_administrator', 'super_administrator') then 'admin'
    else 'worker'
  end;

  insert into public.memberships (company_id, user_id, role, status)
  values (invitation.company_id, actor_id, legacy_role, 'active')
  on conflict (company_id, user_id) do update
    set role = excluded.role,
        status = 'active'
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
