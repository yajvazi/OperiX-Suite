-- Keep invitation metadata behind the same company-manager authorization as
-- the rest of the team-management surface. The raw invitation token is never
-- stored in this table, but email and expiry metadata should not be exposed
-- as a general authenticated table/GraphQL read surface.

revoke all on table public.company_invitations from public, anon, authenticated;

create or replace function public.list_company_invitations(p_company_id uuid)
returns table (
  id uuid,
  email text,
  role_code text,
  status text,
  expires_at timestamptz,
  created_at timestamptz
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
    raise exception 'You do not have permission to view company invitations'
      using errcode = '42501';
  end if;

  return query
  select
    invitation.id,
    invitation.email::text,
    invitation.role_code::text,
    invitation.status::text,
    invitation.expires_at,
    invitation.created_at
  from public.company_invitations invitation
  where invitation.company_id = p_company_id
    and invitation.status = 'pending'
    and invitation.expires_at > now()
  order by invitation.created_at desc;
end;
$$;

revoke all on function public.list_company_invitations(uuid) from public, anon;
grant execute on function public.list_company_invitations(uuid) to authenticated;
