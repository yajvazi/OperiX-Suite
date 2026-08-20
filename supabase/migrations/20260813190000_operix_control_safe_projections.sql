-- OperiX Control safe server projections.
-- Keep bearer tokens and audit payload JSON out of the Control browser contract.

begin;

create or replace function public.control_create_company_invitation(
  p_company_id uuid,
  p_email text,
  p_role_code text
)
returns table (
  id uuid,
  email text,
  role_code text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not private.has_company_permission(p_company_id, 'users.manage') then
    raise exception 'You do not have permission to invite users to this company' using errcode = '42501';
  end if;

  -- The existing invitation workflow performs role selection, duplicate
  -- detection, hashing, expiry, and the membership-safe write. This wrapper
  -- deliberately drops the one-time bearer token before returning.
  invitation := public.create_company_invitation(p_company_id, p_email, p_role_code);

  return query
  select
    (invitation ->> 'id')::uuid,
    invitation ->> 'email',
    invitation ->> 'role_code',
    (invitation ->> 'expires_at')::timestamptz;
end;
$$;

revoke all on function public.control_create_company_invitation(uuid, text, text) from public, anon;
grant execute on function public.control_create_company_invitation(uuid, text, text) to authenticated;

-- Control-specific membership lifecycle wrappers use users.manage. The legacy
-- RPCs keep their existing roles.manage contract for other suite workflows;
-- these wrappers keep Control's user administration boundary explicit.
create or replace function public.control_revoke_company_invitation(
  p_company_id uuid,
  p_invitation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_company_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not private.has_company_permission(p_company_id, 'users.manage') then
    raise exception 'You do not have permission to revoke this invitation'
      using errcode = '42501';
  end if;

  select company_id into invitation_company_id
  from public.company_invitations
  where id = p_invitation_id and status = 'pending';

  if invitation_company_id is distinct from p_company_id then
    raise exception 'Invitation was not found or is no longer pending'
      using errcode = '22023';
  end if;

  update public.company_invitations
  set status = 'revoked', updated_at = now()
  where id = p_invitation_id;

  return jsonb_build_object('id', p_invitation_id, 'status', 'revoked');
end;
$$;

revoke all on function public.control_revoke_company_invitation(uuid, uuid) from public, anon;
grant execute on function public.control_revoke_company_invitation(uuid, uuid) to authenticated;

create or replace function public.control_remove_company_member(
  p_company_id uuid,
  p_membership_id uuid
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
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not private.has_company_permission(p_company_id, 'users.manage') then
    raise exception 'You do not have permission to remove this member'
      using errcode = '42501';
  end if;

  select membership.company_id, membership.user_id, company.owner_id
    into target_company_id, target_user_id, target_owner_id
  from public.memberships membership
  join public.companies company on company.id = membership.company_id
  where membership.id = p_membership_id
    and membership.company_id = p_company_id;

  if target_company_id is null then
    raise exception 'Membership was not found' using errcode = '22023';
  end if;
  if target_user_id = actor_id then
    raise exception 'You cannot remove your own access here' using errcode = '42501';
  end if;
  if target_user_id = target_owner_id then
    raise exception 'Transfer company ownership before removing the owner' using errcode = '42501';
  end if;

  update public.memberships
  set status = 'revoked'
  where id = p_membership_id;

  delete from public.membership_role_assignments
  where membership_id = p_membership_id;

  return jsonb_build_object('membership_id', p_membership_id, 'status', 'revoked');
end;
$$;

revoke all on function public.control_remove_company_member(uuid, uuid) from public, anon;
grant execute on function public.control_remove_company_member(uuid, uuid) to authenticated;

create or replace function public.control_list_audit_events(
  p_company_id uuid,
  p_limit integer default 40
)
returns table (
  id uuid,
  action text,
  entity_type text,
  entity_id uuid,
  entity_key text,
  actor_user_id uuid,
  occurred_at timestamptz,
  has_changes boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not private.has_company_permission(p_company_id, 'audit.read') then
    raise exception 'You do not have permission to view this audit log' using errcode = '42501';
  end if;

  return query
  select
    event.id,
    event.action,
    event.entity_type,
    event.entity_id,
    event.entity_key,
    event.actor_user_id,
    event.occurred_at,
    (event.previous_values is not null or event.new_values is not null)
  from public.audit_events event
  where event.company_id = p_company_id
  order by event.occurred_at desc
  limit greatest(1, least(coalesce(p_limit, 40), 200));
end;
$$;

revoke all on function public.control_list_audit_events(uuid, integer) from public, anon;
grant execute on function public.control_list_audit_events(uuid, integer) to authenticated;

commit;
