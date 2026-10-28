-- Repair migration for installations where branch preferences were introduced
-- but the RPC was not loaded into PostgREST's schema cache.

create table if not exists public.company_user_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  preferred_branch_id uuid references public.branches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, company_id)
);

alter table public.company_user_preferences enable row level security;

drop policy if exists company_user_preferences_select on public.company_user_preferences;
create policy company_user_preferences_select on public.company_user_preferences
  for select to authenticated
  using (user_id = auth.uid() and public.can_access_company(company_id));

drop policy if exists company_user_preferences_insert on public.company_user_preferences;
create policy company_user_preferences_insert on public.company_user_preferences
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_access_company(company_id));

drop policy if exists company_user_preferences_update on public.company_user_preferences;
create policy company_user_preferences_update on public.company_user_preferences
  for update to authenticated
  using (user_id = auth.uid() and public.can_access_company(company_id))
  with check (user_id = auth.uid() and public.can_access_company(company_id));

create or replace function public.set_preferred_branch(
  p_company_id uuid,
  p_branch_id uuid
)
returns public.company_user_preferences
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  preference public.company_user_preferences;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not public.can_access_company(p_company_id) then
    raise exception 'You do not have access to this company' using errcode = '42501';
  end if;
  if p_branch_id is not null and not exists (
    select 1
    from public.branches
    where id = p_branch_id
      and company_id = p_company_id
      and is_active
  ) then
    raise exception 'The selected branch is not active in this company' using errcode = '22023';
  end if;

  insert into public.company_user_preferences(user_id, company_id, preferred_branch_id, updated_at)
  values (actor_id, p_company_id, p_branch_id, now())
  on conflict (user_id, company_id) do update
    set preferred_branch_id = excluded.preferred_branch_id,
        updated_at = now()
  returning * into preference;

  return preference;
end;
$$;

revoke all on function public.set_preferred_branch(uuid, uuid) from public, anon;
grant execute on function public.set_preferred_branch(uuid, uuid) to authenticated;
