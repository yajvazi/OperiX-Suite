-- OperiX Invoice Users & Access lifecycle and seat-billing guardrails.
--
-- This migration is additive. Existing memberships, invitations, roles, audit
-- events, and subscription ledgers are retained. User lifecycle mutations are
-- moved behind an idempotent operation ledger so a paid seat is never
-- activated before the server has confirmed the Stripe mutation.

begin;

-- Reassert the server boundary for this migration. SECURITY DEFINER changes
-- current_user to the function owner, so it is never an authentication proof.
create or replace function private.operix_server_request()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(current_setting('request.jwt.claim.role', true), '') in ('service_role', 'supabase_admin');
$$;

revoke all on function private.operix_server_request() from public;
grant execute on function private.operix_server_request() to authenticated, service_role;

-- The invitation trigger historically inspected auth.jwt() directly. The
-- billing-aware service workflow uses the same verified server boundary as
-- the other protected functions, so it must not depend on a client session
-- claim representation inside a SECURITY DEFINER trigger.
create or replace function private.rbac_invitation_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_role text := lower(trim(coalesce(new.role_code, '')));
begin
  if private.operix_server_request()
     or coalesce(current_setting('app.user_access_invitation_workflow', true), '') = 'authorized' then
    if normalized_role not in ('admin', 'company_administrator', 'manager', 'employee') then
      raise exception 'Only Admin, Manager, and Employee roles can be invited' using errcode = '42501';
    end if;
    new.role_code := case normalized_role when 'admin' then 'company_administrator' else normalized_role end;
    return new;
  end if;
  if not private.rbac_is_tenant_admin(new.company_id) then
    raise exception 'Only a tenant Admin can invite company users' using errcode = '42501';
  end if;
  if normalized_role not in ('admin', 'company_administrator', 'manager', 'employee') then
    raise exception 'Only Admin, Manager, and Employee roles can be invited' using errcode = '42501';
  end if;
  new.role_code := case normalized_role when 'admin' then 'company_administrator' else normalized_role end;
  return new;
end;
$$;

revoke all on function private.rbac_invitation_guard() from public;
grant execute on function private.rbac_invitation_guard() to authenticated, service_role;

alter table public.memberships
  add column if not exists suspended_at timestamptz,
  add column if not exists revoked_at timestamptz,
  add column if not exists last_active_at timestamptz;

alter table public.company_invitations
  add column if not exists user_access_operation_id uuid,
  add column if not exists first_name text,
  add column if not exists last_name text;

create table if not exists public.user_access_operations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  root_company_id uuid not null references public.companies(id) on delete restrict,
  operation_key text not null check (char_length(trim(operation_key)) between 16 and 200),
  operation_type text not null check (operation_type in ('invite', 'update', 'suspend', 'reactivate', 'remove', 'resend')),
  target_membership_id uuid references public.memberships(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  email text,
  first_name text,
  last_name text,
  requested_role_code text check (requested_role_code is null or requested_role_code in ('company_administrator', 'manager', 'employee')),
  requested_permissions jsonb not null default '{}'::jsonb check (jsonb_typeof(requested_permissions) = 'object'),
  requested_scopes jsonb not null default '{}'::jsonb check (jsonb_typeof(requested_scopes) = 'object'),
  status text not null default 'pending_billing' check (status in ('pending_billing', 'billing_succeeded', 'invite_pending', 'completed', 'failed', 'canceled')),
  billing_required boolean not null default false,
  billable_user_delta integer not null default 0 check (billable_user_delta between -1 and 1),
  billing_interval text check (billing_interval is null or billing_interval in ('monthly', 'annual')),
  stripe_subscription_id text,
  stripe_invoice_id text,
  billing_preview jsonb not null default '{}'::jsonb,
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  failure_code text,
  failure_message text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '20 minutes'),
  completed_at timestamptz,
  unique (company_id, operation_key)
);

create index if not exists user_access_operations_company_status_idx
  on public.user_access_operations(company_id, status, created_at desc);
create index if not exists user_access_operations_root_status_idx
  on public.user_access_operations(root_company_id, status, expires_at);
create index if not exists user_access_operations_target_idx
  on public.user_access_operations(target_membership_id, status);
create unique index if not exists user_access_operations_pending_email_idx
  on public.user_access_operations(company_id, lower(email))
  where operation_type = 'invite'
    and email is not null
    and status in ('pending_billing', 'billing_succeeded', 'invite_pending');

create table if not exists public.user_access_billing_locks (
  root_company_id uuid primary key references public.companies(id) on delete cascade,
  operation_id uuid not null references public.user_access_operations(id) on delete cascade,
  locked_until timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.user_access_operations enable row level security;
alter table public.user_access_billing_locks enable row level security;
revoke all on table public.user_access_operations from anon, authenticated;
revoke all on table public.user_access_billing_locks from anon, authenticated;

drop policy if exists user_access_operations_select on public.user_access_operations;
create policy user_access_operations_select on public.user_access_operations
  for select to authenticated
  using (
    private.has_company_permission(company_id, 'users.manage')
    or target_user_id = (select auth.uid())
  );

-- Last-admin protection is a database invariant. It applies to direct SQL and
-- to SECURITY DEFINER workflows, not only to the Users & Access UI.
create or replace function private.rbac_last_active_admin_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_role text;
  other_admins integer;
begin
  if tg_op = 'INSERT' then
    if lower(coalesce(new.status, 'active')) in ('active', 'suspended')
       and lower(coalesce(new.role, 'employee')) not in ('owner', 'admin', 'company_administrator')
       and not exists (
         select 1 from public.memberships existing
         where existing.company_id = new.company_id
           and lower(coalesce(existing.status, 'active')) = 'active'
           and lower(coalesce(existing.role, 'employee')) in ('owner', 'admin', 'company_administrator')
       ) then
      raise exception 'The company must have at least one active Admin' using errcode = '42501';
    end if;
    return new;
  end if;

  old_role := private.rbac_member_role_code(old.id);
  if old_role = 'company_administrator'
     and lower(coalesce(old.status, 'active')) = 'active'
     and (
       lower(coalesce(new.status, 'active')) <> 'active'
       or lower(coalesce(new.role, 'employee')) not in ('owner', 'admin', 'company_administrator')
     ) then
    select count(*)::integer into other_admins
    from public.memberships existing
    where existing.company_id = old.company_id
      and existing.id <> old.id
      and lower(coalesce(existing.status, 'active')) = 'active'
      and private.rbac_member_role_code(existing.id) = 'company_administrator';
    if other_admins < 1 then
      raise exception 'This company must have at least one active Admin. Assign another Admin before changing your account.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists rbac_last_active_admin_guard on public.memberships;
create trigger rbac_last_active_admin_guard
before insert or update of role, status on public.memberships
for each row execute function private.rbac_last_active_admin_guard();

-- Protected profile writes are used for an Admin editing a member's display
-- name. The workflow itself still validates the tenant and users.manage.
create or replace function private.rbac_profile_authorization_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id uuid := coalesce(
    new.active_company_id,
    old.active_company_id,
    new.company_id,
    old.company_id,
    (
      select membership.company_id
      from public.memberships membership
      where membership.user_id = (select auth.uid())
        and coalesce(membership.status, 'active') = 'active'
      order by membership.created_at, membership.id
      limit 1
    )
  );
begin
  if coalesce((select auth.jwt() ->> 'role'), '') = 'service_role'
     or coalesce(current_setting('app.company_link_workflow', true), '') = 'authorized'
     or coalesce(current_setting('app.active_company_switch', true), '') = 'authorized'
     or coalesce(current_setting('app.user_access_profile_workflow', true), '') = 'authorized'
     or private.rbac_is_platform_admin() then
    return new;
  end if;

  if new.role is distinct from old.role or new.company_id is distinct from old.company_id then
    raise exception 'Role and company membership are managed by protected workflows' using errcode = '42501';
  end if;
  if new.active_company_id is not null and not public.can_access_company(new.active_company_id) then
    raise exception 'You cannot select a company without an active membership' using errcode = '42501';
  end if;
  if target_company_id is not null
     and (
       new.company_name is distinct from old.company_name
       or new.email is distinct from old.email
       or new.phone is distinct from old.phone
       or new.address is distinct from old.address
       or new.website is distinct from old.website
     )
     and not private.has_company_permission(target_company_id, 'settings.company') then
    raise exception 'Company settings permission is required' using errcode = '42501';
  end if;
  if target_company_id is not null
     and (
       new.tax_rate is distinct from old.tax_rate
       or new.tax_name is distinct from old.tax_name
       or new.tax_id is distinct from old.tax_id
     )
     and not private.has_company_permission(target_company_id, 'settings.tax') then
    raise exception 'Tax settings permission is required' using errcode = '42501';
  end if;
  if target_company_id is not null
     and (
       new.logo_url is distinct from old.logo_url
       or new.signature_url is distinct from old.signature_url
       or new.stamp_url is distinct from old.stamp_url
       or new.template_config is distinct from old.template_config
       or new.primary_color is distinct from old.primary_color
       or new.is_grayscale is distinct from old.is_grayscale
       or new.invoice_language is distinct from old.invoice_language
       or new.terms_conditions is distinct from old.terms_conditions
       or new.default_client_discount is distinct from old.default_client_discount
     )
     and not private.has_company_permission(target_company_id, 'settings.invoice') then
    raise exception 'Invoice document settings permission is required' using errcode = '42501';
  end if;
  if target_company_id is not null
     and (
       new.bank_name is distinct from old.bank_name
       or new.bank_account is distinct from old.bank_account
       or new.bank_iban is distinct from old.bank_iban
       or new.bank_swift is distinct from old.bank_swift
       or new.payment_link_stripe is distinct from old.payment_link_stripe
       or new.payment_link_paypal is distinct from old.payment_link_paypal
     )
     and not private.has_company_permission(target_company_id, 'settings.bank') then
    raise exception 'Bank settings permission is required' using errcode = '42501';
  end if;
  if target_company_id is not null
     and (
       new.stripe_api_key is distinct from old.stripe_api_key
       or new.stripe_account_id is distinct from old.stripe_account_id
       or new.stripe_last_synced is distinct from old.stripe_last_synced
       or new.stripe_access_token is distinct from old.stripe_access_token
       or new.stripe_refresh_token is distinct from old.stripe_refresh_token
       or new.stripe_connected_at is distinct from old.stripe_connected_at
       or new.stripe_livemode is distinct from old.stripe_livemode
     )
     and not private.has_company_permission(target_company_id, 'settings.integrations') then
    raise exception 'Integration settings permission is required' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.rbac_is_user_access_admin(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_company_id is not null
    and private.company_is_active(p_company_id)
    and (
      private.rbac_is_platform_admin()
      or (
        private.rbac_role_code(p_company_id) in ('company_administrator', 'manager')
        and private.has_company_permission(p_company_id, 'users.manage')
      )
    );
$$;

revoke all on function private.rbac_is_user_access_admin(uuid) from public;
grant execute on function private.rbac_is_user_access_admin(uuid) to authenticated, service_role;

create or replace function private.rbac_user_role_id(p_role_code text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select role.id
  from public.app_roles role
  where role.company_id is null
    and role.code = case lower(trim(coalesce(p_role_code, '')))
      when 'admin' then 'company_administrator'
      else lower(trim(coalesce(p_role_code, '')))
    end
    and role.code in ('company_administrator', 'manager', 'employee')
  limit 1;
$$;

create or replace function private.rbac_active_admin_count(p_company_id uuid, p_except_membership_id uuid default null)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.memberships membership
  where membership.company_id = p_company_id
    and membership.id is distinct from p_except_membership_id
    and lower(coalesce(membership.status, 'active')) = 'active'
    and private.rbac_member_role_code(membership.id) = 'company_administrator';
$$;

create or replace function private.rbac_member_scope(p_membership_id uuid, p_resource text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.rbac_member_role_code(p_membership_id) = 'company_administrator' then 'ALL'
    else coalesce(
      (
        select scope.scope
        from public.membership_data_scopes scope
        where scope.membership_id = p_membership_id and scope.resource = p_resource
      ),
      (
        select role_scope.scope
        from public.membership_role_assignments assignment
        join public.app_role_data_scopes role_scope on role_scope.role_id = assignment.role_id
        where assignment.membership_id = p_membership_id and role_scope.resource = p_resource
        order by case role_scope.scope when 'ALL' then 1 when 'ASSIGNED' then 2 else 3 end
        limit 1
      ),
      'OWN'
    )
  end;
$$;

revoke all on function private.rbac_member_scope(uuid,text) from public;
grant execute on function private.rbac_member_scope(uuid,text) to authenticated, service_role;

create or replace function private.rbac_validate_user_access_payload(
  p_role_code text,
  p_permissions jsonb,
  p_scopes jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  role_value text := case lower(trim(coalesce(p_role_code, '')))
    when 'admin' then 'company_administrator'
    else lower(trim(coalesce(p_role_code, '')))
  end;
  permission_entry record;
  scope_entry record;
  view_all_permission text;
begin
  if role_value not in ('company_administrator', 'manager', 'employee') then
    raise exception 'Only Admin, Manager, and Employee roles can be assigned' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_permissions, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_scopes, '{}'::jsonb)) <> 'object' then
    raise exception 'Permissions and scopes must be JSON objects' using errcode = '22023';
  end if;
  for permission_entry in select key, value from jsonb_each(coalesce(p_permissions, '{}'::jsonb)) loop
    if not private.rbac_is_invoice_permission(permission_entry.key)
       or jsonb_typeof(permission_entry.value) <> 'boolean' then
      raise exception 'A permission is not valid for Invoice or is not boolean' using errcode = '22023';
    end if;
    if (permission_entry.value #>> '{}')::boolean
       and role_value <> 'company_administrator'
       and not private.rbac_permission_assignable(role_value, permission_entry.key) then
      raise exception 'The selected permission cannot be assigned to this tenant role' using errcode = '42501';
    end if;
  end loop;
  for scope_entry in select key, value from jsonb_each_text(coalesce(p_scopes, '{}'::jsonb)) loop
    if scope_entry.key not in ('invoice','offer','proforma','order','delivery_note','customer','expense','payment','product','inventory')
       or upper(scope_entry.value) not in ('OWN','ASSIGNED','ALL') then
      raise exception 'A data scope is not valid' using errcode = '22023';
    end if;
    if upper(scope_entry.value) = 'ALL' and scope_entry.key in ('invoice','customer','expense') then
      view_all_permission := case scope_entry.key
        when 'invoice' then 'invoice.view_all'
        when 'customer' then 'customer.view_all'
        else 'expense.view_all'
      end;
      if role_value <> 'company_administrator'
         and coalesce((p_permissions ->> view_all_permission)::boolean, false) = false
         and not exists (
           select 1
           from public.app_roles role
           join public.app_role_permissions role_permission on role_permission.role_id = role.id
           where role.company_id is null
             and role.code = role_value
             and role_permission.permission_code = view_all_permission
         ) then
        raise exception 'ALL scope requires the matching view-all permission' using errcode = '42501';
      end if;
    end if;
  end loop;
end;
$$;

revoke all on function private.rbac_validate_user_access_payload(text,jsonb,jsonb) from public;
grant execute on function private.rbac_validate_user_access_payload(text,jsonb,jsonb) to authenticated, service_role;

create or replace function private.rbac_apply_user_access(
  p_membership_id uuid,
  p_role_code text,
  p_permissions jsonb,
  p_scopes jsonb,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  role_value text := case lower(trim(coalesce(p_role_code, '')))
    when 'admin' then 'company_administrator'
    else lower(trim(coalesce(p_role_code, '')))
  end;
  role_id_value uuid;
  permission_entry record;
  scope_entry record;
begin
  perform private.rbac_validate_user_access_payload(role_value, p_permissions, p_scopes);
  role_id_value := private.rbac_user_role_id(role_value);
  if role_id_value is null then
    raise exception 'The selected role is not available' using errcode = '22023';
  end if;

  perform set_config('app.membership_role_workflow', 'authorized', true);
  update public.memberships
  set role = case role_value when 'company_administrator' then 'admin' when 'manager' then 'manager' else 'employee' end,
      status = status
  where id = p_membership_id;
  delete from public.membership_role_assignments where membership_id = p_membership_id;
  insert into public.membership_role_assignments(membership_id, role_id, created_by)
  values (p_membership_id, role_id_value, p_actor_id);
  delete from public.membership_permission_overrides where membership_id = p_membership_id;
  if role_value <> 'company_administrator' then
    for permission_entry in select key, value from jsonb_each(coalesce(p_permissions, '{}'::jsonb)) loop
      insert into public.membership_permission_overrides(membership_id, permission_code, enabled, created_by, updated_by)
      values (p_membership_id, private.rbac_canonical_permission(permission_entry.key), (permission_entry.value #>> '{}')::boolean, p_actor_id, p_actor_id);
    end loop;
  end if;
  delete from public.membership_data_scopes where membership_id = p_membership_id;
  if role_value <> 'company_administrator' then
    for scope_entry in select key, value from jsonb_each_text(coalesce(p_scopes, '{}'::jsonb)) loop
      insert into public.membership_data_scopes(membership_id, resource, scope, updated_by)
      values (p_membership_id, scope_entry.key, upper(scope_entry.value), p_actor_id);
    end loop;
  end if;
  perform set_config('app.membership_role_workflow', '', true);

  return private.rbac_member_access_json(p_membership_id);
exception when others then
  perform set_config('app.membership_role_workflow', '', true);
  raise;
end;
$$;

revoke all on function private.rbac_apply_user_access(uuid,text,jsonb,jsonb,uuid) from public;
grant execute on function private.rbac_apply_user_access(uuid,text,jsonb,jsonb,uuid) to authenticated, service_role;

create or replace function private.rbac_write_user_access_audit(
  p_company_id uuid,
  p_actor_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_previous jsonb,
  p_new jsonb,
  p_reason text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_events(company_id, actor_user_id, action, entity_type, entity_id, previous_values, new_values, reason)
  values (p_company_id, p_actor_id, p_action, p_entity_type, p_entity_id, p_previous, p_new, p_reason);
$$;

revoke all on function private.rbac_write_user_access_audit(uuid,uuid,text,text,uuid,jsonb,jsonb,text) from public;
grant execute on function private.rbac_write_user_access_audit(uuid,uuid,text,text,uuid,jsonb,jsonb,text) to authenticated, service_role;

-- Replace the user count used by the shared subscription ledger. Suspended
-- users remain billable. A seat reservation is counted while a Stripe-backed
-- invite/remove operation is in flight, preventing quantity races.
create or replace function private.invoice_billable_user_count(p_root_company_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  with eligible_members as (
    select distinct membership.user_id
    from public.memberships membership
    join auth.users auth_user on auth_user.id = membership.user_id
    where lower(coalesce(membership.status, 'active')) in ('active', 'suspended')
      and private.invoice_company_is_in_root(p_root_company_id, membership.company_id)
      and not exists (
        select 1 from public.user_access_operations removal
        where removal.operation_type = 'remove'
          and removal.target_membership_id = membership.id
          and removal.status in ('pending_billing', 'billing_succeeded')
          and removal.expires_at > now()
      )
      and not exists (
        select 1
        from public.membership_role_assignments assignment
        join public.app_roles assigned_role on assigned_role.id = assignment.role_id
        where assignment.membership_id = membership.id
          and lower(assigned_role.code) in ('super_admin','super_administrator','platform_owner','platform_admin','service','service_account','automation','system','internal')
      )
      and lower(coalesce(membership.role, 'employee')) not in ('super_admin','super_administrator','platform_owner','platform_admin','service','service_account','automation','system','internal')
      and not exists (
        select 1 from public.control_platform_admins platform_admin
        where platform_admin.user_id = membership.user_id and platform_admin.revoked_at is null
      )
      and lower(coalesce(auth_user.raw_app_meta_data ->> 'account_type', '')) not in ('service','service_account','automation','system','internal','platform_admin','platform_owner','super_admin','super_administrator')
      and lower(coalesce(auth_user.raw_app_meta_data ->> 'user_type', '')) not in ('service','service_account','automation','system','internal','platform_admin','platform_owner','super_admin','super_administrator')
      and lower(coalesce(auth_user.raw_app_meta_data ->> 'is_service_account', 'false')) not in ('true','1','yes')
      and lower(coalesce(auth_user.raw_app_meta_data ->> 'is_internal', 'false')) not in ('true','1','yes')
  ),
  pending_memberships as (
    select distinct membership.user_id
    from public.memberships membership
    where lower(coalesce(membership.status, 'active')) = 'pending'
      and private.invoice_company_is_in_root(p_root_company_id, membership.company_id)
      and exists (
        select 1 from public.user_access_operations operation
        where operation.operation_type = 'invite'
          and operation.target_membership_id = membership.id
          and operation.status = 'invite_pending'
          and operation.expires_at > now()
      )
  ),
  virtual_seats as (
    select operation.id
    from public.user_access_operations operation
    where operation.root_company_id = p_root_company_id
      and operation.operation_type = 'invite'
      and operation.target_membership_id is null
      and operation.status in ('pending_billing','billing_succeeded','invite_pending')
      and operation.expires_at > now()
  )
  select (select count(*) from eligible_members)
       + (select count(*) from pending_memberships)
       + (select count(*) from virtual_seats)::integer;
$$;

-- Keep the existing shared subscription usage refresh function, but use the
-- new suspended/pending-aware user count above.
create or replace function private.refresh_invoice_subscription_usage(p_company_id uuid)
returns public.subscription_usage
language plpgsql
security definer
set search_path = ''
as $$
declare
  root_company_id uuid;
  tenant_count integer;
  user_count integer;
  usage_row public.subscription_usage;
begin
  select case
    when exists (select 1 from public.subscription_accounts where company_id = p_company_id) then p_company_id
    else private.invoice_billing_root_company_id(p_company_id)
  end into root_company_id;
  if root_company_id is null then raise exception 'Billing account was not found' using errcode = '22023'; end if;

  select count(*)::integer into tenant_count
  from public.companies company
  where private.invoice_company_is_in_root(root_company_id, company.id)
    and company.archived_at is null
    and lower(coalesce(company.settings ->> 'status', 'active')) not in ('archived','deleted','suspended','disabled','inactive')
    and lower(coalesce(company.settings ->> 'is_internal', 'false')) not in ('true','1','yes')
    and lower(coalesce(company.settings ->> 'is_demo', 'false')) not in ('true','1','yes')
    and nullif(company.settings ->> 'deleted_at', '') is null
    and nullif(company.settings ->> 'suspended_at', '') is null;
  user_count := private.invoice_billable_user_count(root_company_id);

  insert into public.subscription_usage(company_id,total_tenants,billable_tenants,total_users,billable_users,updated_at)
  values(root_company_id,tenant_count,greatest(tenant_count - 1,0),user_count,greatest(user_count - 1,0),clock_timestamp())
  on conflict(company_id) do update set
    total_tenants = excluded.total_tenants,
    billable_tenants = excluded.billable_tenants,
    total_users = excluded.total_users,
    billable_users = excluded.billable_users,
    updated_at = excluded.updated_at
  returning * into usage_row;

  insert into public.subscription_sync_queue(company_id,requested_at,status,last_error,updated_at)
  values(root_company_id,clock_timestamp(),'pending',null,clock_timestamp())
  on conflict(company_id) do update set
    requested_at = excluded.requested_at,
    status = case when public.subscription_sync_queue.status = 'processing' then 'processing' else 'pending' end,
    last_error = null,
    updated_at = excluded.updated_at;
  return usage_row;
end;
$$;

revoke all on function private.invoice_billable_user_count(uuid) from public;
grant execute on function private.invoice_billable_user_count(uuid) to authenticated, service_role;
revoke all on function private.refresh_invoice_subscription_usage(uuid) from public;
grant execute on function private.refresh_invoice_subscription_usage(uuid) to authenticated, service_role;

create or replace function public.rbac_get_users_access_billing_summary(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  root_company_id uuid;
  account_row record;
  usage_row public.subscription_usage;
  plan_value text;
  interval_value text;
  monthly_base numeric;
  annual_base numeric;
  monthly_total numeric;
  annual_total numeric;
begin
  if (select auth.uid()) is null and not private.operix_server_request() then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not private.operix_server_request() and not private.rbac_is_user_access_admin(p_company_id) then
    raise exception 'Users & Access is restricted to authorized company administrators' using errcode = '42501';
  end if;
  root_company_id := private.invoice_billing_root_company_id(p_company_id);
  usage_row := private.refresh_invoice_subscription_usage(root_company_id);
  select * into account_row from public.subscription_accounts account
  where account.company_id = root_company_id and account.product in ('invoice', 'suite')
  order by case when account.product = 'suite' then 0 else 1 end, account.created_at limit 1;
  plan_value := case when account_row.product is null then 'invoice' else account_row.product end;
  interval_value := coalesce(account_row.billing_interval, 'monthly');
  monthly_base := case plan_value when 'suite' then 11.99 else 9.99 end;
  annual_base := case plan_value when 'suite' then 99.99 else 99.99 end;
  monthly_total := monthly_base + (greatest(usage_row.total_tenants - 1, 0) * 1.99) + (greatest(usage_row.total_users - 1, 0) * 0.99);
  annual_total := annual_base + (greatest(usage_row.total_tenants - 1, 0) * 19.99) + (greatest(usage_row.total_users - 1, 0) * 9.99);
  return jsonb_build_object(
    'company_id', p_company_id,
    'billing_account_company_id', root_company_id,
    'plan', plan_value,
    'status', coalesce(account_row.status, 'trialing'),
    'billing_interval', interval_value,
    'stripe_subscription_id', case when private.rbac_is_platform_admin() then account_row.stripe_subscription_id else null end,
    'trial_started_at', account_row.trial_started_at,
    'trial_ends_at', account_row.trial_ends_at,
    'current_period_end', account_row.current_period_end,
    'cancel_at_period_end', coalesce(account_row.cancel_at_period_end, false),
    'total_tenants', usage_row.total_tenants,
    'included_tenants', usage_row.included_tenants,
    'billable_tenants', usage_row.billable_tenants,
    'total_users', usage_row.total_users,
    'included_users', usage_row.included_users,
    'billable_users', usage_row.billable_users,
    'base_monthly', to_char(monthly_base, 'FM999999990.00'),
    'additional_tenant_monthly', '1.99',
    'additional_user_monthly', '0.99',
    'base_annual', to_char(annual_base, 'FM999999990.00'),
    'additional_tenant_annual', '19.99',
    'additional_user_annual', '9.99',
    'estimated_monthly_total', to_char(monthly_total, 'FM999999990.00'),
    'estimated_annual_total', to_char(annual_total, 'FM999999990.00'),
    'usage_updated_at', usage_row.updated_at,
    'trial_days_remaining', case when account_row.trial_ends_at is null then 0 else greatest(0, ceil(extract(epoch from (account_row.trial_ends_at - now())) / 86400))::integer end,
    'billing_management_allowed', true
  );
end;
$$;

revoke all on function public.rbac_get_users_access_billing_summary(uuid) from public, anon;
grant execute on function public.rbac_get_users_access_billing_summary(uuid) to authenticated, service_role;

drop function if exists public.rbac_list_users_access(uuid);
create or replace function public.rbac_list_users_access(p_company_id uuid)
returns table(
  membership_id uuid,
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  status text,
  role_code text,
  role_name text,
  data_scopes jsonb,
  last_active_at timestamptz,
  date_added timestamptz,
  billing_status text,
  is_company_owner boolean,
  operation_id uuid,
  access jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null and not private.operix_server_request() then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not private.operix_server_request() and not private.rbac_is_user_access_admin(p_company_id) then
    raise exception 'Users & Access is restricted to authorized company administrators' using errcode = '42501';
  end if;
  return query
  select membership.id,
    membership.user_id,
    coalesce(auth_user.email, profile.email)::text,
    profile.first_name::text,
    profile.last_name::text,
    case lower(coalesce(membership.status, 'active')) when 'suspended' then 'suspended' when 'pending' then 'invited' else 'active' end::text,
    private.rbac_member_role_code(membership.id)::text,
    case private.rbac_member_role_code(membership.id) when 'company_administrator' then 'Admin' when 'manager' then 'Manager' else 'Employee' end::text,
    coalesce((private.rbac_member_access_json(membership.id) -> 'scopes'), '{}'::jsonb),
    coalesce(membership.last_active_at, auth_user.last_sign_in_at),
    membership.created_at,
    case
      when lower(coalesce(membership.status, 'active')) = 'suspended' then 'seat_active'
      when account.status in ('past_due','unpaid','incomplete') then 'pending_payment'
      when account.status = 'trialing' then 'trial'
      else 'active'
    end::text,
    company.owner_id = membership.user_id,
    linked_operation.id,
    private.rbac_member_access_json(membership.id)
  from public.memberships membership
  join public.companies company on company.id = membership.company_id
  left join auth.users auth_user on auth_user.id = membership.user_id
  left join public.profiles profile on profile.id = membership.user_id
  left join lateral (
    select subscription.status
    from public.subscription_accounts subscription
    where subscription.company_id = private.invoice_billing_root_company_id(p_company_id)
      and subscription.product in ('invoice', 'suite')
    order by case when subscription.product = 'suite' then 0 else 1 end, subscription.created_at
    limit 1
  ) account on true
  left join lateral (
    select operation.id
    from public.user_access_operations operation
    where operation.target_membership_id = membership.id
    order by operation.created_at desc
    limit 1
  ) linked_operation on true
  where membership.company_id = p_company_id
    and lower(coalesce(membership.status, 'active')) <> 'revoked'
    and not exists (
      select 1 from public.control_platform_admins platform_admin
      where platform_admin.user_id = membership.user_id and platform_admin.revoked_at is null
    )
  union all
  select operation.target_membership_id,
    operation.target_user_id,
    operation.email,
    operation.first_name,
    operation.last_name,
    case when operation.status in ('pending_billing', 'failed') then 'pending_payment' else 'invited' end::text,
    coalesce(operation.requested_role_code, 'employee'),
    case coalesce(operation.requested_role_code, 'employee') when 'company_administrator' then 'Admin' when 'manager' then 'Manager' else 'Employee' end::text,
    coalesce(operation.requested_scopes, '{}'::jsonb),
    null::timestamptz,
    operation.created_at,
    case when operation.status in ('pending_billing', 'failed') then 'pending_payment' when account.status = 'trialing' then 'trial' else 'active' end::text,
    false,
    operation.id,
    jsonb_build_object(
      'role_code', coalesce(operation.requested_role_code, 'employee'),
      'permissions', coalesce((select jsonb_agg(permission.key order by permission.key) from jsonb_each_text(operation.requested_permissions) permission where permission.value = 'true'), '[]'::jsonb),
      'scopes', coalesce(operation.requested_scopes, '{}'::jsonb),
      'overrides', coalesce(operation.requested_permissions, '{}'::jsonb)
    )
  from public.user_access_operations operation
  left join lateral (
    select subscription.status
    from public.subscription_accounts subscription
    where subscription.company_id = operation.root_company_id
      and subscription.product in ('invoice', 'suite')
    order by case when subscription.product = 'suite' then 0 else 1 end, subscription.created_at
    limit 1
  ) account on true
  where operation.company_id = p_company_id
    and operation.operation_type = 'invite'
    and operation.status in ('pending_billing','billing_succeeded','invite_pending','failed')
    and (
      operation.expires_at > now()
      or (operation.status = 'failed' and operation.updated_at > now() - interval '20 minutes')
    )
    and operation.target_membership_id is null
  order by 11 desc nulls last, 3;
end;
$$;

revoke all on function public.rbac_list_users_access(uuid) from public, anon;
grant execute on function public.rbac_list_users_access(uuid) to authenticated;

create or replace function public.rbac_get_user_access_operation(p_operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  operation_row public.user_access_operations;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into operation_row
  from public.user_access_operations operation
  where operation.id = p_operation_id
    and (
      private.rbac_is_user_access_admin(operation.company_id)
      or operation.target_user_id = (select auth.uid())
    );
  if operation_row.id is null then
    raise exception 'The user access operation was not found' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'operation_id', operation_row.id,
    'company_id', operation_row.company_id,
    'operation_type', operation_row.operation_type,
    'target_membership_id', operation_row.target_membership_id,
    'target_user_id', operation_row.target_user_id,
    'email', operation_row.email,
    'status', operation_row.status,
    'billing_required', operation_row.billing_required,
    'billing_interval', operation_row.billing_interval,
    'billing_preview', coalesce(operation_row.billing_preview, '{}'::jsonb) - 'invoice_id',
    'expires_at', operation_row.expires_at
  );
end;
$$;

revoke all on function public.rbac_get_user_access_operation(uuid) from public, anon;
grant execute on function public.rbac_get_user_access_operation(uuid) to authenticated;

create or replace function public.rbac_begin_user_access_operation(
  p_company_id uuid,
  p_operation_key text,
  p_operation_type text,
  p_membership_id uuid default null,
  p_email text default null,
  p_first_name text default null,
  p_last_name text default null,
  p_role_code text default 'employee',
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
  root_company_id uuid;
  operation_row public.user_access_operations;
  pending_invite public.user_access_operations;
  target_membership public.memberships;
  target_user_id uuid;
  company_owner_id uuid;
  role_value text := case lower(trim(coalesce(p_role_code, '')))
    when 'admin' then 'company_administrator'
    else lower(trim(coalesce(p_role_code, '')))
  end;
  normalized_email text := lower(trim(coalesce(p_email, '')));
  before_access jsonb;
  billing_required_value boolean;
  delta_value integer;
  billing_summary jsonb;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not private.rbac_is_user_access_admin(p_company_id) then
    raise exception 'You do not have permission to manage Users & Access' using errcode = '42501';
  end if;
  if p_operation_key is null or char_length(trim(p_operation_key)) < 16 then
    raise exception 'An idempotency key is required' using errcode = '22023';
  end if;
  if p_operation_type not in ('invite','suspend','reactivate','remove') then
    raise exception 'This user operation is not supported' using errcode = '22023';
  end if;
  root_company_id := private.invoice_billing_root_company_id(p_company_id);
  if root_company_id is null then raise exception 'Billing account was not found' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(root_company_id::text, 922337));
  select * into operation_row from public.user_access_operations operation
  where operation.company_id = p_company_id and operation.operation_key = trim(p_operation_key)
  for update;
  if operation_row.id is not null then
    if operation_row.operation_type <> p_operation_type then
      raise exception 'This idempotency key is already used for another user operation' using errcode = '40901';
    end if;
    if operation_row.status in ('failed', 'canceled')
       or (operation_row.status = 'pending_billing' and operation_row.expires_at <= now()) then
      -- A definitive billing failure did not activate a seat. Reopening the
      -- same idempotency key makes a payment-method correction/retry safe
      -- without creating another operation or another reserved seat.
      update public.user_access_operations
      set status = 'pending_billing', failure_code = null, failure_message = null,
          billing_preview = '{}'::jsonb, updated_at = now(), expires_at = now() + interval '20 minutes'
      where id = operation_row.id
      returning * into operation_row;
      billing_summary := public.rbac_get_users_access_billing_summary(p_company_id);
      return jsonb_build_object('operation_id', operation_row.id, 'status', operation_row.status, 'operation_type', operation_row.operation_type, 'billing_required', operation_row.billing_required, 'billable_user_delta', operation_row.billable_user_delta, 'billing_preview', operation_row.billing_preview, 'summary', billing_summary);
    else
      billing_summary := public.rbac_get_users_access_billing_summary(p_company_id);
      return jsonb_build_object('operation_id', operation_row.id, 'status', operation_row.status, 'operation_type', operation_row.operation_type, 'billing_required', operation_row.billing_required, 'billable_user_delta', operation_row.billable_user_delta, 'billing_preview', operation_row.billing_preview, 'summary', billing_summary);
    end if;
  end if;

  if p_operation_type = 'invite' then
    if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Enter a valid email address' using errcode = '22023'; end if;
    if char_length(coalesce(p_first_name, '')) > 100 or char_length(coalesce(p_last_name, '')) > 100 then raise exception 'Name is too long' using errcode = '22023'; end if;
    perform private.rbac_validate_user_access_payload(role_value, p_permissions, p_scopes);
    if not private.rbac_is_platform_admin()
       and private.rbac_role_code(p_company_id) <> 'company_administrator'
       and role_value <> 'employee' then
      raise exception 'Only a tenant Admin can assign Admin or Manager roles' using errcode = '42501';
    end if;
    if not private.rbac_is_platform_admin()
       and private.rbac_role_code(p_company_id) <> 'company_administrator'
       and exists (
         select 1 from jsonb_each(coalesce(p_permissions, '{}'::jsonb)) permission
         where (permission.value #>> '{}')::boolean
           and not private.has_company_permission(p_company_id, permission.key)
       ) then
      raise exception 'You cannot grant a permission you do not hold' using errcode = '42501';
    end if;
    update public.user_access_operations expired
    set status = 'canceled', failure_code = 'expired', failure_message = 'The confirmation window expired.', updated_at = now()
    where expired.company_id = p_company_id
      and expired.operation_type = 'invite'
      and lower(expired.email) = normalized_email
      and expired.status in ('pending_billing','billing_succeeded','invite_pending')
      and expired.expires_at <= now();
    if exists (
      select 1 from public.memberships membership join auth.users auth_user on auth_user.id = membership.user_id
      where membership.company_id = p_company_id and lower(auth_user.email) = normalized_email and lower(coalesce(membership.status, 'active')) <> 'revoked'
    ) then raise exception 'This email already has access to the company' using errcode = '23505'; end if;
    if exists (
      select 1 from public.user_access_operations pending
      where pending.company_id = p_company_id and pending.operation_type = 'invite' and lower(pending.email) = normalized_email
        and pending.status in ('pending_billing','billing_succeeded','invite_pending') and pending.expires_at > now()
    ) then raise exception 'An invitation for this email is already pending' using errcode = '23505'; end if;
    billing_required_value := exists (
      select 1 from public.subscription_accounts account
      where account.company_id = root_company_id and account.product in ('invoice', 'suite')
        and lower(coalesce(account.status, 'trialing')) not in ('trialing')
        and account.stripe_subscription_id is not null
    );
    delta_value := 1;
  else
    if p_operation_type = 'remove' and p_membership_id is null then
      if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'An email is required to remove a pending invitation' using errcode = '22023'; end if;
      select pending.* into pending_invite
      from public.user_access_operations pending
      where pending.company_id = p_company_id
        and pending.operation_type = 'invite'
        and pending.target_membership_id is null
        and pending.email = normalized_email
        and pending.status in ('pending_billing','billing_succeeded','invite_pending','failed')
        and (
          pending.expires_at > now()
          or (pending.status = 'failed' and pending.updated_at > now() - interval '20 minutes')
        )
      order by pending.created_at desc
      limit 1
      for update;
      if pending_invite.id is null then raise exception 'The pending invitation was not found' using errcode = '22023'; end if;
      target_user_id := pending_invite.target_user_id;
      before_access := jsonb_build_object(
        'invite_operation_id', pending_invite.id,
        'email', pending_invite.email,
        'status', pending_invite.status,
        'role_code', pending_invite.requested_role_code,
        'user_id', pending_invite.target_user_id
      );
      billing_required_value := pending_invite.status <> 'failed' and exists (
        select 1 from public.subscription_accounts account where account.company_id = root_company_id and account.product in ('invoice', 'suite') and account.stripe_subscription_id is not null and lower(coalesce(account.status, 'trialing')) not in ('trialing')
      );
      delta_value := case when pending_invite.status = 'failed' then 0 else -1 end;
      role_value := coalesce(pending_invite.requested_role_code, 'employee');
      normalized_email := pending_invite.email;
    else
      select membership.* into target_membership
      from public.memberships membership join public.companies company on company.id = membership.company_id
      where membership.id = p_membership_id and membership.company_id = p_company_id
      for update;
      if target_membership.id is null then raise exception 'Membership was not found' using errcode = '22023'; end if;
      target_user_id := target_membership.user_id;
      select company.owner_id into company_owner_id from public.companies company where company.id = target_membership.company_id;
      if exists (select 1 from public.control_platform_admins platform_admin where platform_admin.user_id = target_membership.user_id and platform_admin.revoked_at is null) then raise exception 'Platform Super Admin accounts are outside tenant user management' using errcode = '42501'; end if;
      if not private.rbac_is_platform_admin()
         and private.rbac_role_code(p_company_id) <> 'company_administrator'
         and p_operation_type in ('remove','suspend','reactivate')
         and private.rbac_member_role_code(target_membership.id) <> 'employee' then
        raise exception 'Only a tenant Admin can manage Admin or Manager accounts' using errcode = '42501';
      end if;
      if p_operation_type in ('remove','suspend') and target_membership.user_id = actor_id and private.rbac_active_admin_count(p_company_id, target_membership.id) < 1 then
        raise exception 'This company must have at least one active Admin. Assign another Admin before changing your account.' using errcode = '42501';
      end if;
      if p_operation_type = 'remove' and target_membership.user_id = company_owner_id then raise exception 'Transfer company ownership before removing the owner' using errcode = '42501'; end if;
      if p_operation_type = 'remove' and lower(coalesce(target_membership.status, 'active')) = 'revoked' then raise exception 'This user has already been removed' using errcode = '40901'; end if;
      if p_operation_type = 'suspend' and lower(coalesce(target_membership.status, 'active')) = 'suspended' then raise exception 'This user is already suspended' using errcode = '40901'; end if;
      if p_operation_type = 'reactivate' and lower(coalesce(target_membership.status, 'active')) <> 'suspended' then raise exception 'This user is not suspended' using errcode = '40901'; end if;
      before_access := jsonb_build_object('status', target_membership.status, 'role_code', private.rbac_member_role_code(target_membership.id), 'access', private.rbac_member_access_json(target_membership.id));
      billing_required_value := p_operation_type = 'remove' and exists (
        select 1 from public.subscription_accounts account where account.company_id = root_company_id and account.product in ('invoice', 'suite') and account.stripe_subscription_id is not null and lower(coalesce(account.status, 'trialing')) not in ('trialing')
      );
      delta_value := case when p_operation_type = 'remove' then -1 else 0 end;
      role_value := private.rbac_member_role_code(target_membership.id);
      normalized_email := (select lower(coalesce(auth_user.email, '')) from auth.users auth_user where auth_user.id = target_membership.user_id);
    end if;
  end if;

  insert into public.user_access_operations(company_id,root_company_id,operation_key,operation_type,target_membership_id,target_user_id,email,first_name,last_name,requested_role_code,requested_permissions,requested_scopes,status,billing_required,billable_user_delta,before_state,created_by)
  values(p_company_id,root_company_id,trim(p_operation_key),p_operation_type,target_membership.id,case when p_operation_type = 'invite' then null else target_user_id end,normalized_email,nullif(trim(p_first_name),''),nullif(trim(p_last_name),''),case when p_operation_type = 'invite' then role_value else null end,coalesce(p_permissions,'{}'::jsonb),coalesce(p_scopes,'{}'::jsonb),'pending_billing',billing_required_value,delta_value,coalesce(before_access,'{}'::jsonb),actor_id)
  returning * into operation_row;
  billing_summary := public.rbac_get_users_access_billing_summary(p_company_id);
  return jsonb_build_object('operation_id', operation_row.id, 'status', operation_row.status, 'operation_type', operation_row.operation_type, 'billing_required', operation_row.billing_required, 'billable_user_delta', operation_row.billable_user_delta, 'billing_preview', billing_summary, 'summary', billing_summary);
end;
$$;

revoke all on function public.rbac_begin_user_access_operation(uuid,text,text,uuid,text,text,text,text,jsonb,jsonb) from public, anon;
grant execute on function public.rbac_begin_user_access_operation(uuid,text,text,uuid,text,text,text,text,jsonb,jsonb) to authenticated;

create or replace function public.rbac_claim_user_access_billing_lock(p_root_company_id uuid, p_operation_id uuid, p_lease_seconds integer default 120)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_lock public.user_access_billing_locks;
begin
  if not private.operix_server_request() then raise exception 'Server billing workflow required' using errcode = '42501'; end if;
  if p_lease_seconds < 30 or p_lease_seconds > 600 then raise exception 'Invalid billing lock lease' using errcode = '22023'; end if;
  select * into current_lock from public.user_access_billing_locks where root_company_id = p_root_company_id for update;
  if current_lock.root_company_id is not null and current_lock.locked_until > now() and current_lock.operation_id <> p_operation_id then return false; end if;
  insert into public.user_access_billing_locks(root_company_id,operation_id,locked_until,updated_at)
  values(p_root_company_id,p_operation_id,now() + make_interval(secs => p_lease_seconds),now())
  on conflict(root_company_id) do update set operation_id = excluded.operation_id, locked_until = excluded.locked_until, updated_at = excluded.updated_at;
  return true;
end;
$$;

create or replace function public.rbac_release_user_access_billing_lock(p_root_company_id uuid, p_operation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.operix_server_request() then raise exception 'Server billing workflow required' using errcode = '42501'; end if;
  delete from public.user_access_billing_locks where root_company_id = p_root_company_id and operation_id = p_operation_id;
  return true;
end;
$$;

revoke all on function public.rbac_claim_user_access_billing_lock(uuid,uuid,integer) from public, anon, authenticated;
revoke all on function public.rbac_release_user_access_billing_lock(uuid,uuid) from public, anon, authenticated;
grant execute on function public.rbac_claim_user_access_billing_lock(uuid,uuid,integer) to service_role;
grant execute on function public.rbac_release_user_access_billing_lock(uuid,uuid) to service_role;

create or replace function public.rbac_mark_user_access_billing_succeeded(
  p_operation_id uuid,
  p_billing_interval text,
  p_stripe_subscription_id text default null,
  p_stripe_invoice_id text default null,
  p_billing_preview jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  operation_row public.user_access_operations;
begin
  if not private.operix_server_request() then raise exception 'Server billing workflow required' using errcode = '42501'; end if;
  select * into operation_row from public.user_access_operations where id = p_operation_id for update;
  if operation_row.id is null then raise exception 'User access operation was not found' using errcode = '22023'; end if;
  if operation_row.status in ('completed','invite_pending','billing_succeeded') then return to_jsonb(operation_row); end if;
  if operation_row.status <> 'pending_billing' then raise exception 'The user access operation cannot be billed in its current state' using errcode = '40901'; end if;
  update public.user_access_operations set status = 'billing_succeeded', billing_interval = p_billing_interval, stripe_subscription_id = p_stripe_subscription_id, stripe_invoice_id = p_stripe_invoice_id, billing_preview = coalesce(p_billing_preview,'{}'::jsonb), updated_at = now(), expires_at = now() + interval '7 days' where id = p_operation_id returning * into operation_row;
  perform private.rbac_write_user_access_audit(operation_row.company_id, operation_row.created_by, case when operation_row.operation_type = 'remove' then 'USER_SEAT_REMOVED' else 'USER_SEAT_BILLED' end, 'user_access_operation', operation_row.id, operation_row.before_state, jsonb_build_object('billing_interval',p_billing_interval,'billing_preview',coalesce(p_billing_preview,'{}'::jsonb) - 'invoice_id'), 'Stripe confirmed the user seat billing operation');
  return to_jsonb(operation_row);
end;
$$;

create or replace function public.rbac_mark_user_access_billing_failed(p_operation_id uuid, p_failure_code text, p_failure_message text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare operation_row public.user_access_operations;
begin
  if not private.operix_server_request() then raise exception 'Server billing workflow required' using errcode = '42501'; end if;
  select * into operation_row from public.user_access_operations where id = p_operation_id for update;
  if operation_row.id is null then raise exception 'User access operation was not found' using errcode = '22023'; end if;
  if operation_row.status in ('completed','invite_pending','billing_succeeded') then return to_jsonb(operation_row); end if;
  if operation_row.status <> 'pending_billing' then raise exception 'The user access operation cannot be failed in its current state' using errcode = '40901'; end if;
  update public.user_access_operations set status = 'failed', failure_code = left(p_failure_code,100), failure_message = left(p_failure_message,1000), updated_at = now(), expires_at = now() + interval '20 minutes' where id = p_operation_id returning * into operation_row;
  perform private.rbac_write_user_access_audit(operation_row.company_id, operation_row.created_by, 'USER_SEAT_BILLING_FAILED', 'user_access_operation', operation_row.id, operation_row.before_state, jsonb_build_object('status','failed','failure_code',operation_row.failure_code), 'Stripe did not confirm the user seat billing operation; access remains inactive and the operation can be retried safely');
  return to_jsonb(operation_row);
end;
$$;

revoke all on function public.rbac_mark_user_access_billing_succeeded(uuid,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.rbac_mark_user_access_billing_failed(uuid,text,text) from public, anon, authenticated;
grant execute on function public.rbac_mark_user_access_billing_succeeded(uuid,text,text,text,jsonb) to service_role;
grant execute on function public.rbac_mark_user_access_billing_failed(uuid,text,text) to service_role;

create or replace function public.rbac_finalize_user_access_invite(p_operation_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  operation_row public.user_access_operations;
  membership_id_value uuid;
  auth_email text;
  access jsonb;
  membership_created boolean := false;
begin
  if not private.operix_server_request() then raise exception 'Server invitation workflow required' using errcode = '42501'; end if;
  select * into operation_row from public.user_access_operations where id = p_operation_id for update;
  if operation_row.id is null or operation_row.operation_type <> 'invite' then raise exception 'Invitation operation was not found' using errcode = '22023'; end if;
  if operation_row.status not in ('billing_succeeded','invite_pending') then raise exception 'Billing must succeed before the user seat is created' using errcode = '40201'; end if;
  select lower(email) into auth_email from auth.users where id = p_user_id;
  if auth_email is null or auth_email <> lower(operation_row.email) then raise exception 'The invited account does not match the requested email' using errcode = '42501'; end if;
  if exists (
    select 1
    from public.control_platform_admins platform_admin
    where platform_admin.user_id = p_user_id
      and platform_admin.revoked_at is null
  ) then
    raise exception 'Platform Super Admin accounts are outside tenant user management' using errcode = '42501';
  end if;

  select membership.id into membership_id_value from public.memberships membership where membership.company_id = operation_row.company_id and membership.user_id = p_user_id for update;
  perform set_config('app.membership_role_workflow', 'authorized', true);
  if membership_id_value is null then
    insert into public.memberships(company_id,user_id,role,status,created_at)
    values(operation_row.company_id,p_user_id,case operation_row.requested_role_code when 'company_administrator' then 'admin' when 'manager' then 'manager' else 'employee' end,'pending',now()) returning id into membership_id_value;
    membership_created := true;
  else
    update public.memberships set role = case operation_row.requested_role_code when 'company_administrator' then 'admin' when 'manager' then 'manager' else 'employee' end, status = 'pending', suspended_at = null, revoked_at = null where id = membership_id_value;
  end if;
  perform set_config('app.membership_role_workflow', '', true);
  update public.user_access_operations set target_membership_id = membership_id_value, target_user_id = p_user_id, status = 'invite_pending', updated_at = now(), after_state = jsonb_build_object('membership_id',membership_id_value,'user_id',p_user_id,'role_code',operation_row.requested_role_code,'status','pending') where id = p_operation_id returning * into operation_row;

  perform private.rbac_apply_user_access(membership_id_value, operation_row.requested_role_code, operation_row.requested_permissions, operation_row.requested_scopes, operation_row.created_by);
  perform set_config('app.user_access_profile_workflow', 'authorized', true);
  update public.profiles set first_name = coalesce(operation_row.first_name, first_name), last_name = coalesce(operation_row.last_name, last_name), updated_at = now() where id = p_user_id;
  perform set_config('app.user_access_profile_workflow', '', true);
  perform set_config('app.user_access_invitation_workflow', 'authorized', true);
  insert into public.company_invitations(company_id,email,role_code,invited_by,token_hash,status,expires_at,user_access_operation_id,first_name,last_name)
  values(operation_row.company_id,lower(operation_row.email),operation_row.requested_role_code,operation_row.created_by,encode(extensions.digest(encode(extensions.gen_random_bytes(32),'hex'),'sha256'),'hex'),'pending',now() + interval '7 days',p_operation_id,operation_row.first_name,operation_row.last_name)
  on conflict (company_id, lower(email)) where status = 'pending' do update set updated_at = now(), user_access_operation_id = excluded.user_access_operation_id, role_code = excluded.role_code, first_name = excluded.first_name, last_name = excluded.last_name;
  access := private.rbac_member_access_json(membership_id_value);
  perform set_config('app.user_access_invitation_workflow', '', true);
  if membership_created then
    perform private.rbac_write_user_access_audit(operation_row.company_id, operation_row.created_by, 'USER_CREATED', 'membership', membership_id_value, '{}'::jsonb, jsonb_build_object('membership_id',membership_id_value,'user_id',p_user_id,'role_code',operation_row.requested_role_code,'status','pending'), 'Tenant membership created after server-confirmed user seat billing');
  end if;
  perform private.rbac_write_user_access_audit(operation_row.company_id, operation_row.created_by, 'USER_INVITED', 'membership', membership_id_value, operation_row.before_state, jsonb_build_object('membership_id',membership_id_value,'user_id',p_user_id,'role_code',operation_row.requested_role_code,'status','pending','access',access), 'User seat billed and invitation created');
  return jsonb_build_object('operation_id',p_operation_id,'membership_id',membership_id_value,'user_id',p_user_id,'status','invite_pending','access',access);
exception when others then
  perform set_config('app.membership_role_workflow', '', true);
  perform set_config('app.user_access_profile_workflow', '', true);
  perform set_config('app.user_access_invitation_workflow', '', true);
  raise;
end;
$$;

revoke all on function public.rbac_finalize_user_access_invite(uuid,uuid) from public, anon, authenticated;
grant execute on function public.rbac_finalize_user_access_invite(uuid,uuid) to service_role;

create or replace function public.rbac_accept_user_access_invitation(p_operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  operation_row public.user_access_operations;
  membership_id_value uuid;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into operation_row from public.user_access_operations where id = p_operation_id for update;
  if operation_row.id is null or operation_row.operation_type <> 'invite' then raise exception 'Invitation was not found' using errcode = '22023'; end if;
  if operation_row.target_user_id is distinct from actor_id then raise exception 'This invitation belongs to another OperiX account' using errcode = '42501'; end if;
  if operation_row.status = 'completed' then return jsonb_build_object('operation_id',operation_row.id,'status','completed','membership_id',operation_row.target_membership_id); end if;
  if operation_row.status <> 'invite_pending' or operation_row.expires_at <= now() then raise exception 'This invitation has expired or is not ready' using errcode = '41001'; end if;
  membership_id_value := operation_row.target_membership_id;
  perform set_config('app.membership_role_workflow', 'authorized', true);
  update public.memberships set status = 'active', suspended_at = null, revoked_at = null, last_active_at = now() where id = membership_id_value;
  perform set_config('app.membership_role_workflow', '', true);
  perform set_config('app.user_access_invitation_workflow', 'authorized', true);
  update public.company_invitations set status = 'accepted', accepted_by = actor_id, accepted_at = now(), updated_at = now() where user_access_operation_id = operation_row.id and status = 'pending';
  perform set_config('app.user_access_invitation_workflow', '', true);
  update public.user_access_operations set status = 'completed', completed_at = now(), updated_at = now(), after_state = after_state || jsonb_build_object('status','active') where id = operation_row.id;
  perform private.rbac_write_user_access_audit(operation_row.company_id, actor_id, 'USER_ACTIVATED', 'membership', membership_id_value, jsonb_build_object('status','pending'), jsonb_build_object('status','active','role_code',operation_row.requested_role_code), 'User accepted the OperiX invitation');
  return jsonb_build_object('operation_id',operation_row.id,'status','completed','membership_id',membership_id_value,'company_id',operation_row.company_id);
exception when others then
  perform set_config('app.membership_role_workflow', '', true);
  perform set_config('app.user_access_invitation_workflow', '', true);
  raise;
end;
$$;

revoke all on function public.rbac_accept_user_access_invitation(uuid) from public, anon;
grant execute on function public.rbac_accept_user_access_invitation(uuid) to authenticated;

-- Existing Auth identities do not need a second account or a password-reset
-- invite. Once the server has linked the already-authenticated identity to the
-- billed operation, activate that tenant membership atomically. New Auth
-- identities continue through the expiring invitation acceptance flow above.
create or replace function public.rbac_activate_existing_user_access(p_operation_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  operation_row public.user_access_operations;
  membership_id_value uuid;
begin
  if not private.operix_server_request() then raise exception 'Server invitation workflow required' using errcode = '42501'; end if;
  select * into operation_row from public.user_access_operations where id = p_operation_id for update;
  if operation_row.id is null or operation_row.operation_type <> 'invite' then raise exception 'Invitation operation was not found' using errcode = '22023'; end if;
  if operation_row.target_user_id is distinct from p_user_id then raise exception 'The existing account does not match the invitation' using errcode = '42501'; end if;
  if operation_row.status = 'completed' then return jsonb_build_object('operation_id', operation_row.id, 'status', 'completed', 'membership_id', operation_row.target_membership_id, 'user_id', p_user_id); end if;
  if operation_row.status <> 'invite_pending' or operation_row.expires_at <= now() then raise exception 'The invitation is not ready for activation' using errcode = '41001'; end if;
  membership_id_value := operation_row.target_membership_id;
  if membership_id_value is null then raise exception 'The tenant membership was not created' using errcode = '22023'; end if;
  perform set_config('app.membership_role_workflow', 'authorized', true);
  update public.memberships set status = 'active', suspended_at = null, revoked_at = null, last_active_at = now() where id = membership_id_value;
  perform set_config('app.membership_role_workflow', '', true);
  perform set_config('app.user_access_invitation_workflow', 'authorized', true);
  update public.company_invitations set status = 'accepted', accepted_by = p_user_id, accepted_at = now(), updated_at = now() where user_access_operation_id = operation_row.id and status = 'pending';
  perform set_config('app.user_access_invitation_workflow', '', true);
  update public.user_access_operations set status = 'completed', completed_at = now(), updated_at = now(), after_state = after_state || jsonb_build_object('status','active','existing_account',true) where id = operation_row.id returning * into operation_row;
  perform private.rbac_write_user_access_audit(operation_row.company_id, operation_row.created_by, 'USER_ACTIVATED', 'membership', membership_id_value, jsonb_build_object('status','pending'), jsonb_build_object('status','active','role_code',operation_row.requested_role_code,'existing_account',true), 'Existing OperiX account linked to the tenant after server-confirmed seat billing');
  return jsonb_build_object('operation_id', operation_row.id, 'status', 'completed', 'membership_id', membership_id_value, 'user_id', p_user_id);
exception when others then
  perform set_config('app.membership_role_workflow', '', true);
  perform set_config('app.user_access_invitation_workflow', '', true);
  raise;
end;
$$;

revoke all on function public.rbac_activate_existing_user_access(uuid,uuid) from public, anon, authenticated;
grant execute on function public.rbac_activate_existing_user_access(uuid,uuid) to service_role;

create or replace function public.rbac_finalize_user_access_removal(p_operation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  operation_row public.user_access_operations;
  invite_operation public.user_access_operations;
  invite_operation_id uuid;
  previous_access jsonb;
begin
  if not private.operix_server_request() then raise exception 'Server removal workflow required' using errcode = '42501'; end if;
  select * into operation_row from public.user_access_operations where id = p_operation_id for update;
  if operation_row.id is null or operation_row.operation_type <> 'remove' then raise exception 'Removal operation was not found' using errcode = '22023'; end if;
  if operation_row.status = 'completed' then return to_jsonb(operation_row); end if;
  if operation_row.status <> 'billing_succeeded' then raise exception 'Billing must succeed before access is removed' using errcode = '40201'; end if;
  if operation_row.target_membership_id is null then
    invite_operation_id := nullif(operation_row.before_state ->> 'invite_operation_id', '')::uuid;
    select * into invite_operation
    from public.user_access_operations pending_invite
    where pending_invite.id = invite_operation_id
      and pending_invite.company_id = operation_row.company_id
      and pending_invite.operation_type = 'invite'
      and pending_invite.target_membership_id is null
      and pending_invite.status in ('pending_billing','billing_succeeded','invite_pending','failed')
    for update;
    if invite_operation.id is null then raise exception 'The pending invitation was not found' using errcode = '22023'; end if;
    previous_access := operation_row.before_state;
    update public.company_invitations set status = 'revoked', updated_at = now() where user_access_operation_id = invite_operation.id and status = 'pending';
    update public.user_access_operations set status = 'canceled', failure_code = 'removed', failure_message = 'The pending invitation was removed by a company administrator.', updated_at = now(), completed_at = now(), after_state = jsonb_build_object('status','canceled','removed_by_operation_id',operation_row.id) where id = invite_operation.id;
  else
    select private.rbac_member_access_json(membership.id) into previous_access from public.memberships membership where membership.id = operation_row.target_membership_id;
    perform set_config('app.membership_role_workflow', 'authorized', true);
    update public.memberships set status = 'revoked', revoked_at = now(), suspended_at = null where id = operation_row.target_membership_id;
    perform set_config('app.membership_role_workflow', '', true);
    delete from public.membership_permission_overrides where membership_id = operation_row.target_membership_id;
    delete from public.membership_data_scopes where membership_id = operation_row.target_membership_id;
    delete from public.membership_role_assignments where membership_id = operation_row.target_membership_id;
    update public.company_invitations set status = 'revoked', updated_at = now() where user_access_operation_id = operation_row.id and status = 'pending';
  end if;
  update public.user_access_operations set status = 'completed', completed_at = now(), updated_at = now(), before_state = coalesce(operation_row.before_state, previous_access), after_state = jsonb_build_object('status','revoked','membership_id',operation_row.target_membership_id) where id = operation_row.id returning * into operation_row;
  perform private.rbac_write_user_access_audit(operation_row.company_id, operation_row.created_by, 'USER_REMOVED', case when operation_row.target_membership_id is null then 'user_access_operation' else 'membership' end, coalesce(operation_row.target_membership_id, operation_row.id), previous_access, jsonb_build_object('status','revoked','membership_id',operation_row.target_membership_id,'invite_operation_id',invite_operation_id), case when operation_row.target_membership_id is null then 'Pending invitation removed and reserved seat released without creating a tenant membership' else 'Tenant membership removed without deleting historical business records' end);
  return to_jsonb(operation_row);
exception when others then
  perform set_config('app.membership_role_workflow', '', true);
  raise;
end;
$$;

revoke all on function public.rbac_finalize_user_access_removal(uuid) from public, anon, authenticated;
grant execute on function public.rbac_finalize_user_access_removal(uuid) to service_role;

create or replace function public.rbac_update_user_access(
  p_membership_id uuid,
  p_role_code text,
  p_permissions jsonb default '{}'::jsonb,
  p_scopes jsonb default '{}'::jsonb,
  p_first_name text default null,
  p_last_name text default null
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
  previous_state jsonb;
  next_access jsonb;
  role_value text := case lower(trim(coalesce(p_role_code, '')))
    when 'admin' then 'company_administrator'
    else lower(trim(coalesce(p_role_code, '')))
  end;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select membership.company_id, membership.user_id, company.owner_id into target_company_id, target_user_id, company_owner_id
  from public.memberships membership join public.companies company on company.id = membership.company_id
  where membership.id = p_membership_id for update;
  if target_company_id is null then raise exception 'Membership was not found' using errcode = '22023'; end if;
  if not private.rbac_is_user_access_admin(target_company_id) then raise exception 'You do not have permission to manage Users & Access' using errcode = '42501'; end if;
  if target_user_id = actor_id then raise exception 'You cannot change your own role or permissions' using errcode = '42501'; end if;
  if target_user_id = company_owner_id then raise exception 'The company owner cannot be edited from team management' using errcode = '42501'; end if;
  if exists (select 1 from public.control_platform_admins platform_admin where platform_admin.user_id = target_user_id and platform_admin.revoked_at is null) then raise exception 'Platform Super Admin accounts are outside tenant user management' using errcode = '42501'; end if;
  if not private.rbac_is_platform_admin()
     and private.rbac_role_code(target_company_id) <> 'company_administrator'
     and (
       private.rbac_member_role_code(p_membership_id) <> 'employee'
       or role_value <> 'employee'
     ) then
    raise exception 'Only a tenant Admin can manage Admin or Manager accounts' using errcode = '42501';
  end if;
  perform private.rbac_validate_user_access_payload(role_value, p_permissions, p_scopes);
  if not private.rbac_is_platform_admin()
     and private.rbac_role_code(target_company_id) <> 'company_administrator'
     and exists (
       select 1 from jsonb_each(coalesce(p_permissions, '{}'::jsonb)) permission
       where (permission.value #>> '{}')::boolean
         and not private.has_company_permission(target_company_id, permission.key)
     ) then
    raise exception 'You cannot grant a permission you do not hold' using errcode = '42501';
  end if;
  if private.rbac_member_role_code(p_membership_id) = 'company_administrator' and role_value <> 'company_administrator' and private.rbac_active_admin_count(target_company_id, p_membership_id) < 1 then
    raise exception 'This company must have at least one active Admin. Assign another Admin before changing your account.' using errcode = '42501';
  end if;
  previous_state := jsonb_build_object('role_code',private.rbac_member_role_code(p_membership_id),'access',private.rbac_member_access_json(p_membership_id));
  next_access := private.rbac_apply_user_access(p_membership_id, role_value, p_permissions, p_scopes, actor_id);
  perform set_config('app.user_access_profile_workflow', 'authorized', true);
  update public.profiles set first_name = coalesce(nullif(trim(p_first_name), ''), first_name), last_name = coalesce(nullif(trim(p_last_name), ''), last_name), updated_at = now() where id = target_user_id;
  perform set_config('app.user_access_profile_workflow', '', true);
  perform private.rbac_write_user_access_audit(target_company_id, actor_id, case when previous_state ->> 'role_code' is distinct from role_value then 'USER_ROLE_CHANGED' else 'USER_PERMISSIONS_CHANGED' end, 'membership', p_membership_id, previous_state, jsonb_build_object('role_code',role_value,'access',next_access), 'Tenant Admin updated user access');
  return jsonb_build_object('membership_id',p_membership_id,'role_code',role_value,'access',next_access);
exception when others then
  perform set_config('app.user_access_profile_workflow', '', true);
  raise;
end;
$$;

revoke all on function public.rbac_update_user_access(uuid,text,jsonb,jsonb,text,text) from public, anon;
grant execute on function public.rbac_update_user_access(uuid,text,jsonb,jsonb,text,text) to authenticated;

-- Keep the legacy RPC name callable for older clients, but route it through
-- the same hardened tenant/role/permission checks. It cannot become a
-- second authorization implementation.
create or replace function public.rbac_update_member_access(
  p_membership_id uuid,
  p_role_code text,
  p_permissions jsonb default '{}'::jsonb,
  p_scopes jsonb default '{}'::jsonb
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.rbac_update_user_access(p_membership_id, p_role_code, p_permissions, p_scopes, null, null);
$$;

revoke all on function public.rbac_update_member_access(uuid,text,jsonb,jsonb) from public, anon, service_role;
grant execute on function public.rbac_update_member_access(uuid,text,jsonb,jsonb) to authenticated;

create or replace function public.rbac_set_user_access_status(p_membership_id uuid, p_status text)
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
  previous_status text;
  next_status text := lower(trim(coalesce(p_status, '')));
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if next_status not in ('suspended','active') then raise exception 'Only suspend and reactivate are supported here' using errcode = '22023'; end if;
  select membership.company_id, membership.user_id, membership.status, company.owner_id into target_company_id, target_user_id, previous_status, company_owner_id
  from public.memberships membership join public.companies company on company.id = membership.company_id
  where membership.id = p_membership_id for update;
  if target_company_id is null then raise exception 'Membership was not found' using errcode = '22023'; end if;
  if not private.rbac_is_user_access_admin(target_company_id) then raise exception 'You do not have permission to manage Users & Access' using errcode = '42501'; end if;
  if target_user_id = company_owner_id then raise exception 'The company owner cannot be suspended or reactivated from team management' using errcode = '42501'; end if;
  if exists (select 1 from public.control_platform_admins platform_admin where platform_admin.user_id = target_user_id and platform_admin.revoked_at is null) then raise exception 'Platform Super Admin accounts are outside tenant user management' using errcode = '42501'; end if;
  if not private.rbac_is_platform_admin()
     and private.rbac_role_code(target_company_id) <> 'company_administrator'
     and private.rbac_member_role_code(p_membership_id) <> 'employee' then
    raise exception 'Only a tenant Admin can manage Admin or Manager accounts' using errcode = '42501';
  end if;
  if next_status = 'suspended' and target_user_id = actor_id and private.rbac_member_role_code(p_membership_id) = 'company_administrator' and private.rbac_active_admin_count(target_company_id, p_membership_id) < 1 then
    raise exception 'This company must have at least one active Admin. Assign another Admin before changing your account.' using errcode = '42501';
  end if;
  perform set_config('app.membership_role_workflow', 'authorized', true);
  update public.memberships set status = next_status, suspended_at = case when next_status = 'suspended' then now() else null end, last_active_at = case when next_status = 'active' then now() else last_active_at end where id = p_membership_id;
  perform set_config('app.membership_role_workflow', '', true);
  perform private.rbac_write_user_access_audit(target_company_id, actor_id, case when next_status = 'suspended' then 'USER_SUSPENDED' else 'USER_REACTIVATED' end, 'membership', p_membership_id, jsonb_build_object('status',previous_status), jsonb_build_object('status',next_status), 'Tenant Admin changed user access status');
  return jsonb_build_object('membership_id',p_membership_id,'status',next_status,'billable_seat_retained',next_status = 'suspended');
exception when others then
  perform set_config('app.membership_role_workflow', '', true);
  raise;
end;
$$;

revoke all on function public.rbac_set_user_access_status(uuid,text) from public, anon;
grant execute on function public.rbac_set_user_access_status(uuid,text) to authenticated;

-- The old direct-removal RPC is retained for compatibility, but it can no
-- longer revoke a seat outside the billing-aware workflow.
create or replace function public.remove_company_member(p_membership_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Use the billing-aware Users & Access removal workflow' using errcode = '42501';
end;
$$;

revoke all on function public.remove_company_member(uuid) from public, anon;
grant execute on function public.remove_company_member(uuid) to authenticated;

-- The old token-only invitation path could create an invitation without a
-- reserved/billed user seat. Keep the signature for old clients, but make it
-- fail closed; Invoice invitations must use the billing-aware operation API.
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
begin
  raise exception 'Use the billing-aware Users & Access invitation workflow' using errcode = '42501';
end;
$$;

revoke all on function public.create_company_invitation(uuid,text,text) from public, anon, authenticated, service_role;

-- Legacy token acceptance must not activate an unbilled seat. Tokens created
-- by the billing-aware flow are still accepted through the operation-bound
-- workflow; older token-only invitations are rejected for safe migration.
create or replace function public.accept_company_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  operation_id_value uuid;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select invitation.user_access_operation_id into operation_id_value
  from public.company_invitations invitation
  where invitation.token_hash = encode(extensions.digest(trim(p_token), 'sha256'), 'hex')
    and invitation.status = 'pending'
    and invitation.expires_at > now()
  for update;
  if operation_id_value is null then raise exception 'This invitation must be recreated from Users & Access before it can be accepted' using errcode = '42501'; end if;
  return public.rbac_accept_user_access_invitation(operation_id_value);
end;
$$;

revoke all on function public.accept_company_invitation(text) from public, anon;
grant execute on function public.accept_company_invitation(text) to authenticated;

-- A legacy revoke is safe only for a token-only invitation, because it has no
-- seat to decrement. Billing-aware invitations must use the removal workflow.
create or replace function public.revoke_company_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_company_id uuid;
  operation_id_value uuid;
begin
  select invitation.company_id, invitation.user_access_operation_id into invitation_company_id, operation_id_value
  from public.company_invitations invitation
  where invitation.id = p_invitation_id and invitation.status = 'pending';
  if invitation_company_id is null then raise exception 'Invitation was not found or is no longer pending' using errcode = '22023'; end if;
  if operation_id_value is not null then raise exception 'Use the billing-aware Users & Access removal workflow' using errcode = '42501'; end if;
  if not private.has_company_permission(invitation_company_id, 'users.manage') then raise exception 'You do not have permission to revoke this invitation' using errcode = '42501'; end if;
  update public.company_invitations set status = 'revoked', updated_at = now() where id = p_invitation_id;
  return jsonb_build_object('id', p_invitation_id, 'status', 'revoked');
end;
$$;

revoke all on function public.revoke_company_invitation(uuid) from public, anon;
grant execute on function public.revoke_company_invitation(uuid) to authenticated;

-- The Control wrapper must not revoke a billing-aware invitation directly.
-- Legacy token-only invitations can still be revoked by an authorized caller
-- during migration because they never reserved a billable seat.
create or replace function public.control_revoke_company_invitation(p_company_id uuid, p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_company_id uuid;
  operation_id_value uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select invitation.company_id, invitation.user_access_operation_id
    into invitation_company_id, operation_id_value
  from public.company_invitations invitation
  where invitation.id = p_invitation_id and invitation.status = 'pending';
  if invitation_company_id is distinct from p_company_id then
    raise exception 'Invitation was not found or is no longer pending' using errcode = '22023';
  end if;
  if operation_id_value is not null then
    raise exception 'Use the billing-aware Users & Access removal workflow' using errcode = '42501';
  end if;
  if not private.has_company_permission(p_company_id, 'users.manage') then
    raise exception 'You do not have permission to revoke this invitation' using errcode = '42501';
  end if;
  update public.company_invitations set status = 'revoked', updated_at = now() where id = p_invitation_id;
  return jsonb_build_object('id', p_invitation_id, 'status', 'revoked');
end;
$$;

revoke all on function public.control_revoke_company_invitation(uuid,uuid) from public, anon;
grant execute on function public.control_revoke_company_invitation(uuid,uuid) to authenticated;

-- The Control compatibility wrapper is not a tenant-user escape hatch. A
-- normal tenant caller must use the billing-aware operation workflow. The
-- separate platform authority may still perform its existing platform
-- lifecycle action; it soft-revokes the membership, clears tenant authz, and
-- refreshes the authoritative usage queue so Stripe reconciliation can bring
-- the shared subscription quantity back in line.
create or replace function public.control_remove_company_member(p_company_id uuid, p_membership_id uuid)
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
  previous_access jsonb;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not private.rbac_is_platform_admin() then
    raise exception 'Use the billing-aware Users & Access removal workflow' using errcode = '42501';
  end if;
  select membership.company_id, membership.user_id, company.owner_id,
         private.rbac_member_access_json(membership.id)
    into target_company_id, target_user_id, target_owner_id, previous_access
  from public.memberships membership
  join public.companies company on company.id = membership.company_id
  where membership.id = p_membership_id and membership.company_id = p_company_id
  for update;
  if target_company_id is null then raise exception 'Membership was not found' using errcode = '22023'; end if;
  if target_user_id = actor_id then raise exception 'You cannot remove your own access here' using errcode = '42501'; end if;
  if target_user_id = target_owner_id then raise exception 'Transfer company ownership before removing the owner' using errcode = '42501'; end if;
  if lower(coalesce((select membership.status from public.memberships membership where membership.id = p_membership_id), 'active')) = 'revoked' then
    raise exception 'This user has already been removed' using errcode = '40901';
  end if;
  perform set_config('app.membership_role_workflow', 'authorized', true);
  update public.memberships set status = 'revoked', revoked_at = now(), suspended_at = null where id = p_membership_id;
  perform set_config('app.membership_role_workflow', '', true);
  delete from public.membership_permission_overrides where membership_id = p_membership_id;
  delete from public.membership_data_scopes where membership_id = p_membership_id;
  delete from public.membership_role_assignments where membership_id = p_membership_id;
  perform private.refresh_invoice_subscription_usage(p_company_id);
  perform private.rbac_write_user_access_audit(p_company_id, actor_id, 'USER_REMOVED', 'membership', p_membership_id, previous_access, jsonb_build_object('status','revoked','source','operix_control'), 'Platform Super Admin removed a tenant membership; subscription usage was queued for reconciliation');
  return jsonb_build_object('membership_id', p_membership_id, 'status', 'revoked', 'billing_sync_queued', true);
exception when others then
  perform set_config('app.membership_role_workflow', '', true);
  raise;
end;
$$;

revoke all on function public.control_remove_company_member(uuid,uuid) from public, anon;
grant execute on function public.control_remove_company_member(uuid,uuid) to authenticated;

-- Keep the legacy member projection from exposing a platform-authorized
-- identity to tenant administration clients. OperiX Control has its own
-- platform-only projection for platform administration.
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
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode = '42501'; end if;
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
    and not exists (
      select 1 from public.control_platform_admins platform_admin
      where platform_admin.user_id = membership.user_id
        and platform_admin.revoked_at is null
    )
  order by lower(coalesce(auth_user.email, profile.email, '')), membership.id;
end;
$$;

revoke all on function public.rbac_list_company_members(uuid) from public, anon;
grant execute on function public.rbac_list_company_members(uuid) to authenticated;

comment on table public.user_access_operations is 'Idempotent, server-confirmed Users & Access lifecycle operations. Stripe must succeed before invite activation or removal.';
comment on table public.user_access_billing_locks is 'Short-lived per-billing-account lease used to serialize Stripe seat quantity updates.';

commit;
