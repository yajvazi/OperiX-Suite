-- Align invitation administration with users.manage and provide an explicit
-- Control membership suspension workflow. The global OperiX identity and
-- historical product records remain untouched.

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
    raise exception 'You do not have permission to invite users to this company'
      using errcode = '42501';
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
  where lower(role.code) = lower(trim(p_role_code))
    and (role.company_id is null or role.company_id = p_company_id)
  order by role.company_id nulls last
  limit 1;

  if selected_role_id is null then
    raise exception 'The selected privilege was not found' using errcode = '22023';
  end if;

  if selected_role_code = 'owner' and not exists (
    select 1 from public.companies company
    where company.id = p_company_id and company.owner_id = actor_id
  ) then
    raise exception 'Only the company owner can invite an owner'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.memberships membership
    join auth.users auth_user on auth_user.id = membership.user_id
    where membership.company_id = p_company_id
      and lower(auth_user.email) = normalized_email
      and coalesce(membership.status, 'active') <> 'revoked'
  ) then
    raise exception 'This email already has access to the company'
      using errcode = '23505';
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
    p_company_id,
    normalized_email,
    selected_role_code,
    actor_id,
    encode(extensions.digest(raw_token, 'sha256'), 'hex'),
    expires_at_value
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

create or replace function public.control_set_member_status(
  p_company_id uuid,
  p_membership_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_user_id uuid;
  target_owner_id uuid;
  target_status text := lower(trim(p_status));
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if target_status not in ('active', 'suspended') then
    raise exception 'Membership status is invalid' using errcode = '22023';
  end if;
  if not private.has_company_permission(p_company_id, 'users.manage') then
    raise exception 'You do not have permission to change this member'
      using errcode = '42501';
  end if;

  select membership.user_id, company.owner_id
    into target_user_id, target_owner_id
  from public.memberships membership
  join public.companies company on company.id = membership.company_id
  where membership.id = p_membership_id
    and membership.company_id = p_company_id;

  if target_user_id is null then
    raise exception 'Membership was not found' using errcode = '22023';
  end if;
  if target_user_id = actor_id then
    raise exception 'You cannot change your own organization status'
      using errcode = '42501';
  end if;
  if target_user_id = target_owner_id then
    raise exception 'The company owner cannot be suspended'
      using errcode = '42501';
  end if;

  update public.memberships
  set status = target_status
  where id = p_membership_id;

  return jsonb_build_object(
    'membership_id', p_membership_id,
    'status', target_status
  );
end;
$$;

revoke all on function public.control_set_member_status(uuid, uuid, text) from public, anon;
grant execute on function public.control_set_member_status(uuid, uuid, text) to authenticated;
