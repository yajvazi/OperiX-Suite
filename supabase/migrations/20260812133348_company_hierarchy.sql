-- OperiX company hierarchy.
-- A root company is a group/parent. Its descendants are subdivisions.
-- Selecting a root company aggregates data from the whole subtree, while
-- selecting a subdivision keeps the data scoped to that subdivision.

alter table public.companies
  add column if not exists parent_company_id uuid
    references public.companies(id) on delete restrict;

create index if not exists companies_parent_company_id_idx
  on public.companies (parent_company_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'companies_parent_company_id_not_self'
      and conrelid = 'public.companies'::regclass
  ) then
    alter table public.companies
      add constraint companies_parent_company_id_not_self
      check (parent_company_id is null or parent_company_id <> id);
  end if;
end
$$;

-- Return true when p_grant_company_id is the target company or one of its
-- ancestors. This is the single hierarchy primitive used by all access
-- checks below.
create or replace function private.company_is_in_scope(
  p_grant_company_id uuid,
  p_target_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with recursive ancestors(id) as (
    select p_target_company_id
    union
    select company.parent_company_id
    from public.companies company
    join ancestors child on child.id = company.id
    where company.parent_company_id is not null
  )
  select p_grant_company_id is not null
    and p_target_company_id is not null
    and exists (
      select 1
      from ancestors
      where ancestors.id = p_grant_company_id
    );
$$;

revoke all on function private.company_is_in_scope(uuid, uuid) from public;
grant execute on function private.company_is_in_scope(uuid, uuid)
  to authenticated, service_role;

-- Prevent a direct update from creating a cycle in the hierarchy.
create or replace function private.prevent_company_hierarchy_cycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cycle_found boolean;
begin
  if new.parent_company_id is null then
    return new;
  end if;

  if new.parent_company_id = new.id then
    raise exception 'A company cannot be its own subdivision parent'
      using errcode = '23514';
  end if;

  with recursive ancestors(id) as (
    select new.parent_company_id
    union
    select company.parent_company_id
    from public.companies company
    join ancestors child on child.id = company.id
    where company.parent_company_id is not null
  )
  select exists (
    select 1
    from ancestors
    where ancestors.id = new.id
  )
  into cycle_found;

  if cycle_found then
    raise exception 'Moving this company would create a hierarchy cycle'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists companies_prevent_hierarchy_cycle on public.companies;
create trigger companies_prevent_hierarchy_cycle
before insert or update of parent_company_id on public.companies
for each row execute function private.prevent_company_hierarchy_cycle();

-- A user who belongs to a parent company can access that company and every
-- subdivision below it. A subdivision member cannot see the parent group.
create or replace function public.can_access_company(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_company_id is not null
    and (
      exists (
        select 1
        from public.companies company
        where company.id = target_company_id
          and company.owner_id = (select auth.uid())
      )
      or exists (
        select 1
        from public.memberships membership
        where membership.user_id = (select auth.uid())
          and coalesce(membership.status, 'active') = 'active'
          and private.company_is_in_scope(membership.company_id, target_company_id)
      )
      or exists (
        select 1
        from public.profiles profile
        where profile.id = (select auth.uid())
          and (
            private.company_is_in_scope(profile.company_id, target_company_id)
            or private.company_is_in_scope(profile.active_company_id, target_company_id)
          )
      )
    );
$$;

revoke all on function public.can_access_company(uuid) from public, anon;
grant execute on function public.can_access_company(uuid) to authenticated;

-- Keep the permission-based policies used by payroll, accounting, support,
-- POS, compliance, and the invoice app aligned with the same hierarchy.
create or replace function private.is_company_member(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_access_company(p_company_id);
$$;

create or replace function private.has_company_permission(
  p_company_id uuid,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with recursive ancestors(id) as (
    select p_company_id
    union
    select company.parent_company_id
    from public.companies company
    join ancestors child on child.id = company.id
    where company.parent_company_id is not null
  )
  select
    p_company_id is not null
    and p_permission is not null
    and (
      exists (
        select 1
        from public.companies company
        join ancestors scope on scope.id = company.id
        where company.owner_id = (select auth.uid())
      )
      or exists (
        select 1
        from public.memberships membership
        join ancestors scope on scope.id = membership.company_id
        where membership.user_id = (select auth.uid())
          and coalesce(membership.status, 'active') = 'active'
          and lower(membership.role) in ('owner', 'admin')
      )
      or exists (
        select 1
        from public.memberships membership
        join ancestors scope on scope.id = membership.company_id
        join public.membership_role_assignments assignment
          on assignment.membership_id = membership.id
        join public.app_roles role
          on role.id = assignment.role_id
          and (role.company_id is null or role.company_id = membership.company_id)
        join public.app_role_permissions role_permission
          on role_permission.role_id = role.id
        where membership.user_id = (select auth.uid())
          and coalesce(membership.status, 'active') = 'active'
          and role_permission.permission_code = p_permission
      )
    );
$$;

revoke all on function private.is_company_member(uuid) from public;
revoke all on function private.has_company_permission(uuid, text) from public;
grant execute on function private.is_company_member(uuid)
  to authenticated, service_role;
grant execute on function private.has_company_permission(uuid, text)
  to authenticated, service_role;

-- Child creation is explicit and permission checked. The new subdivision gets
-- an owner membership so it is immediately usable, while the parent owner or
-- administrator automatically inherits access to it.
create or replace function public.create_company_subdivision(
  p_parent_company_id uuid,
  p_company_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  new_company_id uuid;
  parent_name text;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_parent_company_id is null then
    raise exception 'Parent company is required' using errcode = '23514';
  end if;

  if nullif(trim(p_company_name), '') is null then
    raise exception 'Company name is required' using errcode = '23514';
  end if;

  if not private.has_company_permission(p_parent_company_id, 'company.manage') then
    raise exception 'You do not have permission to add a subdivision'
      using errcode = '42501';
  end if;

  select company.company_name
    into parent_name
  from public.companies company
  where company.id = p_parent_company_id;

  if parent_name is null then
    raise exception 'Parent company was not found' using errcode = '22023';
  end if;

  insert into public.companies (company_name, owner_id, parent_company_id)
  values (trim(p_company_name), current_user_id, p_parent_company_id)
  returning id into new_company_id;

  insert into public.memberships (user_id, company_id, role, status)
  values (current_user_id, new_company_id, 'owner', 'active');

  return jsonb_build_object(
    'id', new_company_id,
    'company_name', trim(p_company_name),
    'parent_company_id', p_parent_company_id,
    'parent_company_name', parent_name
  );
end;
$$;

revoke all on function public.create_company_subdivision(uuid, text) from public, anon;
grant execute on function public.create_company_subdivision(uuid, text) to authenticated;

-- This also lets an administrator group existing standalone companies under a
-- parent later, without exposing an unrestricted parent_company_id update.
create or replace function public.set_company_parent(
  p_company_id uuid,
  p_parent_company_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  company_name_value text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_company_id is null then
    raise exception 'Company is required' using errcode = '23514';
  end if;

  if not private.has_company_permission(p_company_id, 'company.manage') then
    raise exception 'You do not have permission to update this company'
      using errcode = '42501';
  end if;

  if p_parent_company_id is not null
     and not private.has_company_permission(p_parent_company_id, 'company.manage') then
    raise exception 'You do not have permission to use that parent company'
      using errcode = '42501';
  end if;

  if p_parent_company_id = p_company_id then
    raise exception 'A company cannot be its own subdivision parent'
      using errcode = '23514';
  end if;

  update public.companies
  set parent_company_id = p_parent_company_id,
      updated_at = now(),
      updated_by = (select auth.uid())
  where id = p_company_id
  returning company_name into company_name_value;

  if company_name_value is null then
    raise exception 'Company was not found' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'id', p_company_id,
    'company_name', company_name_value,
    'parent_company_id', p_parent_company_id
  );
end;
$$;

revoke all on function public.set_company_parent(uuid, uuid) from public, anon;
grant execute on function public.set_company_parent(uuid, uuid) to authenticated;

-- Replace all historical companies policies. Multiple permissive policies are
-- ORed by Postgres, so leaving an older direct-only or owner-only policy in
-- place would make the hierarchy behave inconsistently.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'companies'
  loop
    execute format('drop policy if exists %I on public.companies', policy_record.policyname);
  end loop;
end
$$;

create policy companies_member_select
on public.companies
for select
to authenticated
using ((select public.can_access_company(id)));

create policy companies_owner_insert
on public.companies
for insert
to authenticated
with check (
  owner_id = (select auth.uid())
  and parent_company_id is null
);

create policy companies_permission_update
on public.companies
for update
to authenticated
using ((select private.has_company_permission(id, 'company.manage')))
with check (
  (select private.has_company_permission(id, 'company.manage'))
  and (
    parent_company_id is null
    or (select private.has_company_permission(parent_company_id, 'company.manage'))
  )
);

comment on column public.companies.parent_company_id is
  'Optional parent company. A null parent is a main/group company; children are subdivisions.';
