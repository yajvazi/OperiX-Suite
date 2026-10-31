-- The row-level security policies call private.has_company_permission() for every row they read. The check is a
-- heavy query (about 0.7 ms), and the report views read the journal tables many times, so the Reports page spent
-- seconds just on permission checks. Remember each answer for the rest of the current transaction (one API request).
-- The cache is keyed by the caller's claims, the company and the permission, and it is reset whenever any table the
-- check reads is written to, so a change made mid-transaction is never answered from a stale cache.

-- The original check, unchanged.
CREATE OR REPLACE FUNCTION private.has_company_permission_uncached(p_company_id uuid, p_permission text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with requested as (
    select lower(trim(coalesce(p_permission, ''))) as permission_code,
      private.rbac_canonical_permission(p_permission) as canonical_code
  ),
  access as (
    select private.company_is_active(p_company_id) as company_active,
      private.rbac_is_platform_admin() as platform_admin,
      private.rbac_role_code(p_company_id) as actor_role,
      private.rbac_actor_membership(p_company_id) as membership_id
  ),
  role_access as (
    select access.*,
      exists (
        select 1
        from public.membership_permission_overrides override
        where override.membership_id = access.membership_id
          and override.permission_code = requested.canonical_code
          and override.enabled = false
      ) as explicitly_denied,
      exists (
        select 1
        from public.membership_permission_overrides override
        where override.membership_id = access.membership_id
          and override.permission_code = requested.canonical_code
          and override.enabled = true
      ) as explicitly_enabled,
      exists (
        select 1
        from public.membership_role_assignments assignment
        join public.app_role_permissions role_permission on role_permission.role_id = assignment.role_id
        where assignment.membership_id = access.membership_id
          and role_permission.permission_code = requested.canonical_code
      ) as role_grant
    from access cross join requested
  ),
  app_gate as (
    select private.control_permission_app_key(p_permission) as app_key
  )
  select coalesce(role_access.company_active, false)
    and (
      role_access.platform_admin
      or (
        not private.rbac_is_platform_permission(requested.permission_code)
        and (
          role_access.actor_role = 'company_administrator'
          or not private.rbac_is_invoice_permission(requested.canonical_code)
          or (
            private.rbac_permission_assignable(role_access.actor_role, requested.canonical_code)
            and not role_access.explicitly_denied
            and (role_access.explicitly_enabled or role_access.role_grant)
          )
        )
      )
    )
    and (
      app_gate.app_key is null
      or role_access.platform_admin
      or (
        exists (
          select 1 from public.company_app_entitlements entitlement
          where entitlement.company_id = p_company_id
            and entitlement.app_key = app_gate.app_key
            and entitlement.enabled
        )
        and (
          role_access.actor_role = 'company_administrator'
          or exists (
            select 1 from public.memberships membership
            where membership.id = role_access.membership_id
              and coalesce(membership.status, 'active') = 'active'
              and not exists (
                select 1 from public.membership_app_access access
                where access.membership_id = membership.id
                  and access.app_key = app_gate.app_key
                  and access.enabled = false
              )
          )
        )
      )
    )
  from role_access cross join requested cross join app_gate;
$function$

;

create or replace function private.bump_permission_cache()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform set_config('operix.pc_epoch', clock_timestamp()::text || random()::text, true);
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'companies', 'memberships', 'membership_permission_overrides', 'membership_role_assignments',
    'membership_app_access', 'control_platform_admins', 'company_app_entitlements', 'app_role_permissions'
  ] loop
    execute format('drop trigger if exists operix_bump_permission_cache on public.%I', t);
    execute format('create trigger operix_bump_permission_cache after insert or update or delete or truncate on public.%I for each statement execute function private.bump_permission_cache()', t);
  end loop;
end;
$$;

create or replace function private.has_company_permission(p_company_id uuid, p_permission text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cache_key text;
  cached text;
  result boolean;
begin
  cache_key := 'operix.pc_' || md5(
    coalesce(current_setting('operix.pc_epoch', true), '') || '|' ||
    coalesce(current_setting('request.jwt.claims', true), '') || '|' ||
    coalesce(p_company_id::text, '') || '|' || coalesce(p_permission, ''));
  cached := current_setting(cache_key, true);
  if cached is not null and cached <> '' then
    return cached = 't';
  end if;
  result := private.has_company_permission_uncached(p_company_id, p_permission);
  perform set_config(cache_key, case when result then 't' else 'f' end, true);
  return result;
end;
$$;
