-- Company administration for parent companies and subdivisions.
--
-- This migration keeps the existing membership/role model, but adds the
-- missing management commands needed by the mobile company administration
-- screen. Invitation tokens are stored only as SHA-256 hashes; the raw token
-- is returned once by the create RPC so the caller can share it securely.

create table if not exists public.company_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null,
  role_code text not null default 'read_only',
  invited_by uuid not null references auth.users(id) on delete restrict,
  token_hash text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists company_invitations_pending_email_unique
  on public.company_invitations (company_id, lower(email))
  where status = 'pending';

create index if not exists company_invitations_company_status_idx
  on public.company_invitations (company_id, status, created_at desc);

alter table public.company_invitations enable row level security;

revoke all on table public.company_invitations from anon, authenticated;
grant select on table public.company_invitations to authenticated;

drop policy if exists company_invitations_manager_select on public.company_invitations;
create policy company_invitations_manager_select
on public.company_invitations
for select
to authenticated
using ((select private.has_company_permission(company_id, 'roles.manage')));

-- Membership rows are readable to the member or to a manager of the company.
-- Writes stay behind the RPCs below so role changes and removals are audited
-- and cannot accidentally reassign a row to another company.
alter table public.memberships enable row level security;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'memberships'
  loop
    execute format('drop policy if exists %I on public.memberships', policy_record.policyname);
  end loop;
end
$$;

create policy memberships_member_or_manager_select
on public.memberships
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.has_company_permission(company_id, 'roles.manage'))
);

-- Direct role-assignment writes must not be able to grant the owner role.
-- The owner-safe set_company_member_role RPC is the supported write path.
drop policy if exists membership_role_assignments_manage_insert
  on public.membership_role_assignments;
create policy membership_role_assignments_manage_insert
on public.membership_role_assignments
for insert
to authenticated
with check (
  not exists (
    select 1
    from public.app_roles role
    where role.id = role_id
      and role.code = 'owner'
  )
  and exists (
    select 1
    from public.memberships membership
    where membership.id = membership_id
      and (select private.has_company_permission(membership.company_id, 'roles.manage'))
  )
);

-- ---------------------------------------------------------------------------
-- Company profile editing
-- ---------------------------------------------------------------------------

create or replace function public.update_company_profile(
  p_company_id uuid,
  p_company_name text,
  p_email text,
  p_phone text,
  p_address text,
  p_website text,
  p_tax_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_company public.companies%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_company_id is null then
    raise exception 'Company is required' using errcode = '23514';
  end if;

  if nullif(trim(p_company_name), '') is null then
    raise exception 'Company name is required' using errcode = '23514';
  end if;

  if not private.has_company_permission(p_company_id, 'company.manage') then
    raise exception 'You do not have permission to edit this company'
      using errcode = '42501';
  end if;

  update public.companies
  set company_name = trim(p_company_name),
      email = nullif(trim(p_email), ''),
      phone = nullif(trim(p_phone), ''),
      address = nullif(trim(p_address), ''),
      website = nullif(trim(p_website), ''),
      tax_id = nullif(trim(p_tax_id), ''),
      updated_at = now(),
      updated_by = (select auth.uid())
  where id = p_company_id
  returning * into updated_company;

  if updated_company.id is null then
    raise exception 'Company was not found' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'id', updated_company.id,
    'company_name', updated_company.company_name,
    'email', updated_company.email,
    'phone', updated_company.phone,
    'address', updated_company.address,
    'website', updated_company.website,
    'tax_id', updated_company.tax_id,
    'parent_company_id', updated_company.parent_company_id
  );
end;
$$;

revoke all on function public.update_company_profile(uuid, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.update_company_profile(uuid, text, text, text, text, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Member and role administration
-- ---------------------------------------------------------------------------

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
    coalesce(auth_user.email, profile.email),
    profile.first_name,
    profile.last_name,
    membership.role,
    coalesce(membership.status, 'active'),
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
    ),
    coalesce(max(assigned_role.name), 'Read-only user')
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
  target_role text;
  target_owner_id uuid;
  selected_role_id uuid;
  selected_role_code text;
  selected_role_name text;
  legacy_role text;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select
    membership.company_id,
    membership.user_id,
    membership.role,
    company.owner_id
  into target_company_id, target_user_id, target_role, target_owner_id
  from public.memberships membership
  join public.companies company on company.id = membership.company_id
  where membership.id = p_membership_id;

  if target_company_id is null then
    raise exception 'Membership was not found' using errcode = '22023';
  end if;

  if not private.has_company_permission(target_company_id, 'roles.manage') then
    raise exception 'You do not have permission to change this member'
      using errcode = '42501';
  end if;

  if target_user_id = actor_id then
    raise exception 'You cannot change your own company privilege'
      using errcode = '42501';
  end if;

  select role.id, role.code, role.name
    into selected_role_id, selected_role_code, selected_role_name
  from public.app_roles role
  where lower(role.code) = lower(trim(p_role_code))
    and (role.company_id is null or role.company_id = target_company_id)
  order by role.company_id nulls last
  limit 1;

  if selected_role_id is null then
    raise exception 'The selected privilege was not found' using errcode = '22023';
  end if;

  if target_owner_id = target_user_id and selected_role_code <> 'owner' then
    raise exception 'The company owner must keep the owner privilege'
      using errcode = '42501';
  end if;

  if selected_role_code = 'owner' and target_owner_id <> actor_id then
    raise exception 'Only the company owner can grant the owner privilege'
      using errcode = '42501';
  end if;

  legacy_role := case
    when selected_role_code = 'owner' then 'owner'
    when selected_role_code in ('company_administrator', 'super_administrator') then 'admin'
    else 'worker'
  end;

  update public.memberships
  set role = legacy_role,
      status = 'active'
  where id = p_membership_id;

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

create or replace function public.remove_company_member(p_membership_id uuid)
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
    raise exception 'You do not have permission to remove this member'
      using errcode = '42501';
  end if;

  if target_user_id = actor_id then
    raise exception 'You cannot remove your own access here'
      using errcode = '42501';
  end if;

  if target_user_id = target_owner_id then
    raise exception 'Transfer company ownership before removing the owner'
      using errcode = '42501';
  end if;

  update public.memberships
  set status = 'revoked'
  where id = p_membership_id;

  delete from public.membership_role_assignments
  where membership_id = p_membership_id;

  return jsonb_build_object('membership_id', p_membership_id, 'status', 'revoked');
end;
$$;

revoke all on function public.remove_company_member(uuid) from public, anon;
grant execute on function public.remove_company_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Per-email invitations
-- ---------------------------------------------------------------------------

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

  if not private.has_company_permission(p_company_id, 'roles.manage') then
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
    company_id,
    email,
    role_code,
    invited_by,
    token_hash,
    expires_at
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

create or replace function public.revoke_company_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_company_id uuid;
begin
  select company_id into invitation_company_id
  from public.company_invitations
  where id = p_invitation_id and status = 'pending';

  if invitation_company_id is null then
    raise exception 'Invitation was not found or is no longer pending' using errcode = '22023';
  end if;

  if not private.has_company_permission(invitation_company_id, 'roles.manage') then
    raise exception 'You do not have permission to revoke this invitation'
      using errcode = '42501';
  end if;

  update public.company_invitations
  set status = 'revoked', updated_at = now()
  where id = p_invitation_id;

  return jsonb_build_object('id', p_invitation_id, 'status', 'revoked');
end;
$$;

revoke all on function public.revoke_company_invitation(uuid) from public, anon;
grant execute on function public.revoke_company_invitation(uuid) to authenticated;

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

-- Keep the existing sign-up invite flow compatible with the new per-email
-- invitation tokens. The old company-wide invite_token path remains supported.
create or replace function public.verify_invite_token(token_input text)
returns table (company_id uuid, company_name text)
language sql
security definer
set search_path = ''
as $$
  select company.id, company.company_name
  from public.companies company
  where lower(company.invite_token) = lower(trim(token_input))
  union all
  select invitation.company_id, company.company_name
  from public.company_invitations invitation
  join public.companies company on company.id = invitation.company_id
  where invitation.token_hash = encode(extensions.digest(trim(token_input), 'sha256'), 'hex')
    and invitation.status = 'pending'
    and invitation.expires_at > now();
$$;

revoke all on function public.verify_invite_token(text) from public;
grant execute on function public.verify_invite_token(text) to anon, authenticated;

create or replace function public.process_new_user_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  token_value text;
  target_company_id uuid;
  invitation public.company_invitations%rowtype;
  target_role_id uuid;
  legacy_role text;
  membership_id_value uuid;
begin
  select auth_user.raw_user_meta_data ->> 'invite_token'
    into token_value
  from auth.users auth_user
  where auth_user.id = new.id;

  if nullif(trim(token_value), '') is null then
    return new;
  end if;

  select company.id into target_company_id
  from public.companies company
  where lower(company.invite_token) = lower(trim(token_value));

  if target_company_id is not null then
    insert into public.memberships (company_id, user_id, role, status)
    values (target_company_id, new.id, 'employee', 'pending')
    on conflict (company_id, user_id) do nothing;

    update public.profiles
    set company_id = coalesce(company_id, target_company_id),
        active_company_id = coalesce(active_company_id, target_company_id)
    where id = new.id;

    return new;
  end if;

  select * into invitation
  from public.company_invitations
  where token_hash = encode(extensions.digest(trim(token_value), 'sha256'), 'hex')
    and status = 'pending'
    and expires_at > now()
    and lower(email) = lower(new.email)
  for update;

  if invitation.id is null then
    return new;
  end if;

  select role.id into target_role_id
  from public.app_roles role
  where lower(role.code) = lower(invitation.role_code)
    and (role.company_id is null or role.company_id = invitation.company_id)
  order by role.company_id nulls last
  limit 1;

  legacy_role := case
    when invitation.role_code = 'owner' then 'owner'
    when invitation.role_code in ('company_administrator', 'super_administrator') then 'admin'
    else 'worker'
  end;

  insert into public.memberships (company_id, user_id, role, status)
  values (invitation.company_id, new.id, legacy_role, 'active')
  on conflict (company_id, user_id) do update
    set role = excluded.role,
        status = 'active'
  returning id into membership_id_value;

  if target_role_id is not null then
    delete from public.membership_role_assignments
    where membership_id = membership_id_value;

    insert into public.membership_role_assignments (membership_id, role_id, created_by)
    values (membership_id_value, target_role_id, invitation.invited_by);
  end if;

  update public.company_invitations
  set status = 'accepted', accepted_by = new.id, accepted_at = now(), updated_at = now()
  where id = invitation.id;

  update public.profiles
  set company_id = coalesce(company_id, invitation.company_id),
      active_company_id = coalesce(active_company_id, invitation.company_id)
  where id = new.id;

  return new;
end;
$$;

revoke all on function public.process_new_user_invite() from public, anon;
grant execute on function public.process_new_user_invite() to authenticated, service_role;

comment on table public.company_invitations is
  'Email-bound, single-use invitations for a company or subdivision. Raw tokens are never stored.';
