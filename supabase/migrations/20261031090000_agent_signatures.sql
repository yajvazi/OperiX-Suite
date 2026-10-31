-- Each agent can have their own signature. The invoice PDF prints the creating agent's signature and falls back
-- to the company signature when the agent has none. Agents set their own; company administrators can set or clear any member's.
alter table public.profiles
  add column if not exists agent_signature_url text;

alter table public.profiles
  drop constraint if exists profiles_agent_signature_size;
alter table public.profiles
  add constraint profiles_agent_signature_size check (agent_signature_url is null or length(agent_signature_url) <= 2000000);

comment on column public.profiles.agent_signature_url is
  'The agent''s own handwritten signature (data URL). Read through get_agent_signature, written through set_agent_signature.';

create or replace function public.get_agent_signature(p_company_id uuid, p_user_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  result text;
begin
  if caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if caller <> p_user_id and not (
    private.has_company_permission(p_company_id, 'roles.manage')
    or private.has_company_permission(p_company_id, 'accounting.read')
    or private.has_company_permission(p_company_id, 'sales_invoice.view')
  ) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.memberships m
    where m.company_id = p_company_id and m.user_id = p_user_id and coalesce(m.status, 'active') <> 'revoked'
  ) then
    return null;
  end if;
  select profile.agent_signature_url into result from public.profiles profile where profile.id = p_user_id;
  return nullif(result, '');
end;
$$;

create or replace function public.set_agent_signature(p_company_id uuid, p_user_id uuid, p_signature text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if caller <> p_user_id and not private.has_company_permission(p_company_id, 'roles.manage') then
    raise exception 'Only the agent or a company administrator can change this signature' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.memberships m
    where m.company_id = p_company_id and m.user_id = p_user_id and coalesce(m.status, 'active') <> 'revoked'
  ) then
    raise exception 'The user is not a member of this company' using errcode = '42501';
  end if;
  if p_signature is not null and p_signature <> '' and p_signature not like 'data:image/%' then
    raise exception 'The signature must be an image' using errcode = '22023';
  end if;
  update public.profiles set agent_signature_url = nullif(p_signature, '') where id = p_user_id;
end;
$$;

revoke all on function public.get_agent_signature(uuid, uuid) from public, anon;
revoke all on function public.set_agent_signature(uuid, uuid, text) from public, anon;
grant execute on function public.get_agent_signature(uuid, uuid) to authenticated;
grant execute on function public.set_agent_signature(uuid, uuid, text) to authenticated;
