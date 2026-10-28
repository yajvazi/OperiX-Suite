-- OperiX Invoice RBAC hardening follow-up.
--
-- The completion migration establishes the shared evaluator.  This migration
-- closes legacy workflow and direct-table paths that could otherwise bypass
-- that evaluator.  It is additive and does not rewrite business records.

begin;

create or replace function private.rbac_is_tenant_admin(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.rbac_is_platform_admin()
    or (
      private.company_is_active(p_company_id)
      and private.rbac_role_code(p_company_id) = 'company_administrator'
    );
$$;

revoke all on function private.rbac_is_tenant_admin(uuid) from public;
grant execute on function private.rbac_is_tenant_admin(uuid) to authenticated, service_role;

-- A missing active membership must never be interpreted as an Employee.
create or replace function private.rbac_role_code(p_company_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with recursive ancestors(id, depth) as (
    select p_company_id, 0
    union all
    select company.parent_company_id, ancestors.depth + 1
    from public.companies company
    join ancestors on ancestors.id = company.id
    where company.parent_company_id is not null
  )
  select case
    when exists (
      select 1
      from ancestors
      join public.companies company on company.id = ancestors.id
      where company.owner_id = (select auth.uid())
    ) then 'company_administrator'
    when private.rbac_actor_membership(p_company_id) is null then null
    else private.rbac_member_role_code(private.rbac_actor_membership(p_company_id))
  end;
$$;

-- These tables are internal authorization state.  All reads and writes go
-- through the SECURITY DEFINER access RPCs; PostgREST must not expose a
-- caller-controlled insert/update/delete path.
alter table public.app_role_data_scopes enable row level security;
alter table public.membership_permission_overrides enable row level security;
alter table public.membership_data_scopes enable row level security;
revoke all on table public.app_role_data_scopes from anon, authenticated;
revoke all on table public.membership_permission_overrides from anon, authenticated;
revoke all on table public.membership_data_scopes from anon, authenticated;

-- Permission administration is an Admin operation, not a generic permission
-- that a Manager can grant to themselves or use to promote another member.
create or replace function public.rbac_list_company_members(p_company_id uuid)
returns table(
  membership_id uuid,
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  status text,
  role_code text,
  role_name text,
  is_company_owner boolean,
  access jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not private.rbac_is_tenant_admin(p_company_id) then
    raise exception 'Only a tenant Admin can manage permissions' using errcode = '42501';
  end if;
  return query
  select membership.id,
    membership.user_id,
    coalesce(auth_user.email, profile.email)::text,
    profile.first_name::text,
    profile.last_name::text,
    coalesce(membership.status, 'active')::text,
    private.rbac_member_role_code(membership.id)::text,
    case private.rbac_member_role_code(membership.id)
      when 'company_administrator' then 'Admin'
      when 'manager' then 'Manager'
      else 'Employee'
    end::text,
    company.owner_id = membership.user_id,
    private.rbac_member_access_json(membership.id)
  from public.memberships membership
  join public.companies company on company.id = membership.company_id
  left join auth.users auth_user on auth_user.id = membership.user_id
  left join public.profiles profile on profile.id = membership.user_id
  where membership.company_id = p_company_id
    and coalesce(membership.status, 'active') <> 'revoked'
  order by lower(coalesce(auth_user.email, profile.email, '')), membership.id;
end;
$$;

revoke all on function public.rbac_list_company_members(uuid) from public, anon;
grant execute on function public.rbac_list_company_members(uuid) to authenticated;

create or replace function public.rbac_update_member_access(
  p_membership_id uuid,
  p_role_code text,
  p_permissions jsonb default '{}'::jsonb,
  p_scopes jsonb default '{}'::jsonb
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
  company_owner_id uuid;
  role_code_value text := lower(trim(coalesce(p_role_code, '')));
  role_id_value uuid;
  previous_access jsonb;
  permission_entry record;
  scope_entry record;
  allowed_resources constant text[] := array['invoice','offer','proforma','order','delivery_note','customer','expense','payment','product','inventory'];
  allowed_roles constant text[] := array['company_administrator','manager','employee'];
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if role_code_value = 'admin' then
    role_code_value := 'company_administrator';
  end if;
  if role_code_value <> all(allowed_roles) then
    raise exception 'Only Admin, Manager, and Employee roles can be assigned' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_permissions, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_scopes, '{}'::jsonb)) <> 'object' then
    raise exception 'Permissions and scopes must be JSON objects' using errcode = '22023';
  end if;

  select membership.company_id, membership.user_id, company.owner_id
    into target_company_id, target_user_id, company_owner_id
  from public.memberships membership
  join public.companies company on company.id = membership.company_id
  where membership.id = p_membership_id
  for update;

  if target_company_id is null then
    raise exception 'Membership was not found' using errcode = '22023';
  end if;
  if not private.rbac_is_tenant_admin(target_company_id) then
    raise exception 'Only a tenant Admin can manage permissions' using errcode = '42501';
  end if;
  if target_user_id = actor_id then
    raise exception 'You cannot change your own role or permissions' using errcode = '42501';
  end if;
  if target_user_id = company_owner_id then
    raise exception 'The company owner cannot be edited from team management' using errcode = '42501';
  end if;

  select role.id into role_id_value
  from public.app_roles role
  where role.company_id is null and role.code = role_code_value
    and role_code_value in ('company_administrator','manager','employee');
  if role_id_value is null then
    raise exception 'The selected role is not available' using errcode = '22023';
  end if;

  previous_access := private.rbac_member_access_json(p_membership_id);

  if exists (
    select 1
    from jsonb_each(coalesce(p_permissions, '{}'::jsonb)) permission_entry
    where permission_entry.key not in (
      'invoice.view','invoice.view_all','invoice.create','invoice.edit','invoice.issue','invoice.delete_draft',
      'invoice.void','invoice.credit','invoice.debit','offer.create','offer.manage','proforma.create',
      'proforma.manage','order.create','order.manage','delivery_note.create','delivery_note.manage',
      'payment.view','payment.create','payment.refund','expense.view_own','expense.view_all','expense.create',
      'expense.edit','expense.approve','expense.manage','customer.view','customer.view_all','customer.create',
      'customer.edit','customer.delete','product.view','product.create','product.edit','product.change_price',
      'product.delete','inventory.view','inventory.adjust','reports.sales','reports.operational','reports.profit',
      'reports.tax','sales_book.view','sales_book.manage','accounting_period.view','accounting_period.close',
      'accounting_period.reopen','users.view','users.manage','permissions.manage','audit.view','financial.export',
      'settings.company','settings.tax','settings.invoice','settings.bank','settings.integrations','settings.api',
      'settings.security','subscription.manage'
    )
    or permission_entry.value not in ('true'::jsonb, 'false'::jsonb)
  ) then
    raise exception 'A permission is not valid for Invoice or is not boolean' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_each_text(coalesce(p_scopes, '{}'::jsonb)) scope_entry
    where scope_entry.key <> all(allowed_resources)
       or upper(scope_entry.value) not in ('OWN','ASSIGNED','ALL')
  ) then
    raise exception 'A data scope is not valid' using errcode = '22023';
  end if;

  perform set_config('app.membership_role_workflow', 'authorized', true);
  update public.memberships
  set role = case role_code_value
      when 'company_administrator' then 'admin'
      when 'manager' then 'manager'
      else 'employee'
    end,
    status = 'active'
  where id = p_membership_id;

  delete from public.membership_role_assignments where membership_id = p_membership_id;
  insert into public.membership_role_assignments(membership_id, role_id, created_by)
  values (p_membership_id, role_id_value, actor_id);

  delete from public.membership_permission_overrides where membership_id = p_membership_id;
  for permission_entry in
    select key, value from jsonb_each(coalesce(p_permissions, '{}'::jsonb))
  loop
    insert into public.membership_permission_overrides(
      membership_id, permission_code, enabled, created_by, updated_by
    ) values (
      p_membership_id, permission_entry.key, (permission_entry.value #>> '{}')::boolean,
      actor_id, actor_id
    );
  end loop;

  delete from public.membership_data_scopes where membership_id = p_membership_id;
  for scope_entry in
    select key, value from jsonb_each_text(coalesce(p_scopes, '{}'::jsonb))
  loop
    insert into public.membership_data_scopes(membership_id, resource, scope, updated_by)
    values (p_membership_id, scope_entry.key, upper(scope_entry.value), actor_id);
  end loop;
  perform set_config('app.membership_role_workflow', '', true);

  perform private.rbac_write_audit(
    target_company_id,
    'membership.access_updated',
    'membership_access',
    p_membership_id,
    previous_access,
    jsonb_build_object(
      'role_code', role_code_value,
      'permissions', coalesce(p_permissions, '{}'::jsonb),
      'scopes', coalesce(p_scopes, '{}'::jsonb)
    ),
    'Tenant Admin updated member role, permissions, or data scopes'
  );

  return jsonb_build_object(
    'membership_id', p_membership_id,
    'role_code', role_code_value,
    'access', private.rbac_member_access_json(p_membership_id)
  );
end;
$$;

revoke all on function public.rbac_update_member_access(uuid,text,jsonb,jsonb) from public, anon;
grant execute on function public.rbac_update_member_access(uuid,text,jsonb,jsonb) to authenticated;

create or replace function private.can_grant_role(p_membership_id uuid, p_role_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships target
    join public.companies company on company.id = target.company_id
    join public.app_roles role on role.id = p_role_id
    where target.id = p_membership_id
      and target.user_id <> (select auth.uid())
      and target.user_id <> company.owner_id
      and role.company_id is null
      and role.code in ('company_administrator','manager','employee')
      and private.rbac_is_tenant_admin(target.company_id)
  );
$$;

revoke all on function private.can_grant_role(uuid,uuid) from public;
grant execute on function private.can_grant_role(uuid,uuid) to authenticated, service_role;

-- Company selection is membership-derived.  A stale profile.company_id is not
-- an authorization source, including for SECURITY DEFINER callers.
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
    raise exception 'The organization is archived or unavailable' using errcode = '42501';
  end if;
  if not public.can_access_company(p_company_id) then
    raise exception 'You are not a member of this company or subdivision' using errcode = '42501';
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

-- Legacy invitations remain available for existing clients, but they can only
-- create the three tenant roles and only a tenant Admin may issue one.
create or replace function private.rbac_invitation_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_role text := lower(trim(coalesce(new.role_code, '')));
begin
  if coalesce((select auth.jwt() ->> 'role'), '') = 'service_role' then
    if normalized_role not in ('admin','company_administrator','manager','employee') then
      raise exception 'Only Admin, Manager, and Employee roles can be invited' using errcode = '42501';
    end if;
    return new;
  end if;
  if not private.rbac_is_tenant_admin(new.company_id) then
    raise exception 'Only a tenant Admin can invite company users' using errcode = '42501';
  end if;
  if normalized_role not in ('admin','company_administrator','manager','employee') then
    raise exception 'Only Admin, Manager, and Employee roles can be invited' using errcode = '42501';
  end if;
  new.role_code := case normalized_role when 'admin' then 'company_administrator' else normalized_role end;
  return new;
end;
$$;

drop trigger if exists rbac_invitation_guard on public.company_invitations;
create trigger rbac_invitation_guard
before insert or update on public.company_invitations
for each row execute function private.rbac_invitation_guard();

-- Prevent callers from changing ownership, tenant, or creator identity while
-- still allowing the protected role/status workflows to maintain memberships.
create or replace function private.rbac_membership_mutation_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.jwt() ->> 'role'), '') = 'service_role'
     or private.rbac_is_platform_admin()
     or coalesce(current_setting('app.membership_role_workflow', true), '') = 'authorized'
     or coalesce(current_setting('app.company_link_workflow', true), '') = 'authorized' then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    if private.rbac_is_tenant_admin(old.company_id) then return old; end if;
  elsif private.rbac_is_tenant_admin(old.company_id) then
    if new.company_id is distinct from old.company_id
       or new.user_id is distinct from old.user_id then
      raise exception 'Membership ownership cannot be changed by a tenant Admin' using errcode = '42501';
    end if;
    return new;
  end if;
  raise exception 'Membership changes require a protected administration workflow' using errcode = '42501';
end;
$$;

drop trigger if exists rbac_membership_mutation_guard on public.memberships;
create trigger rbac_membership_mutation_guard
before update or delete on public.memberships
for each row execute function private.rbac_membership_mutation_guard();

-- Assignment columns are security attributes, not ordinary client fields.
create or replace function private.rbac_assignment_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.assigned_user_id is null then
    new.assigned_user_id := new.user_id;
  end if;
  if tg_op = 'UPDATE'
     and (
       old.company_id is distinct from new.company_id
       or old.user_id is distinct from new.user_id
       or old.assigned_user_id is distinct from new.assigned_user_id
     )
     and coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role'
     and not private.rbac_is_platform_admin()
     and not private.rbac_is_tenant_admin(coalesce(old.company_id, new.company_id)) then
    raise exception 'Only a tenant Admin can reassign a record' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Tax withholding records are financial data: tax readers can select them,
-- while tax identity administrators and protected workflows own mutations.
do $$
declare policy_name text;
begin
  if to_regclass('public.withholding_transactions') is not null then
    for policy_name in
      select pg_policies.policyname
      from pg_policies
      where schemaname = 'public' and tablename = 'withholding_transactions'
    loop
      execute format('drop policy if exists %I on public.withholding_transactions', policy_name);
    end loop;
    alter table public.withholding_transactions enable row level security;
    create policy rbac_withholding_select on public.withholding_transactions
      for select to authenticated
      using (private.has_company_permission(company_id, 'reports.tax'));
    create policy rbac_withholding_insert on public.withholding_transactions
      for insert to authenticated
      with check (private.has_company_permission(company_id, 'settings.tax'));
    create policy rbac_withholding_update on public.withholding_transactions
      for update to authenticated
      using (private.has_company_permission(company_id, 'settings.tax'))
      with check (private.has_company_permission(company_id, 'settings.tax'));
    create policy rbac_withholding_delete on public.withholding_transactions
      for delete to authenticated
      using (private.has_company_permission(company_id, 'settings.tax'));
  end if;
end
$$;

commit;
