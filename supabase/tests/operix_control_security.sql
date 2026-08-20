\set ON_ERROR_STOP on

-- Metadata-level regression checks for the Control tenant and privilege
-- boundary. This test is read-only and can run after the repository's
-- migrations against a local Supabase database.
begin;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'operix_apps', 'company_app_entitlements', 'membership_app_access',
    'control_groups', 'control_group_members', 'control_group_app_access',
    'control_security_policies', 'control_company_domains', 'control_role_templates',
    'control_data_retention_policies', 'control_notification_events', 'control_notification_reads',
    'control_api_keys', 'control_webhook_endpoints', 'control_webhook_deliveries',
    'control_billing_snapshots', 'control_platform_admins'
  ] loop
    if not exists (
      select 1
      from pg_class relation
      join pg_namespace schema on schema.oid = relation.relnamespace
      where schema.nspname = 'public'
        and relation.relname = table_name
        and relation.relrowsecurity
    ) then
      raise exception 'Control table % must have RLS enabled', table_name;
    end if;
    if has_table_privilege('anon', format('public.%I', table_name), 'SELECT') then
      raise exception 'anon retains SELECT on Control table %', table_name;
    end if;
  end loop;

  if not has_function_privilege('authenticated', 'public.control_has_permission(uuid,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.control_list_company_members(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.control_create_company_invitation(uuid,text,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.control_revoke_company_invitation(uuid,uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.control_remove_company_member(uuid,uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.control_set_member_status(uuid,uuid,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.control_list_audit_events(uuid,integer)', 'EXECUTE') then
    raise exception 'authenticated must use the tenant-scoped Control permission wrappers';
  end if;

  if not has_function_privilege('authenticated', 'public.control_usage_summary(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.control_storage_summary(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.control_billing_overview(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.control_list_integrations(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.control_search(uuid,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.control_create_api_key(uuid,text,text[],text,timestamptz)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.control_create_webhook(uuid,text,text,text[],text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.control_list_platform_organizations()', 'EXECUTE') then
    raise exception 'operational and platform Control RPCs must be authenticated-only';
  end if;

  if exists (
    select 1 from pg_trigger
    where tgrelid = 'public.control_notification_events'::regclass
      and not tgisinternal
  ) then
    raise exception 'notification projection rows must not recursively audit themselves';
  end if;

  if not has_function_privilege('authenticated', 'public.control_set_app_entitlement(uuid,text,boolean)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.control_set_member_app_access(uuid,uuid,text,boolean)', 'EXECUTE') then
    raise exception 'app entitlement writes must use the tenant-scoped apps.manage RPCs';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename in ('company_app_entitlements','membership_app_access') and cmd = 'DELETE'
  ) then
    raise exception 'app disable and access revocation must preserve rows for safe re-enablement';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'audit_events'
      and policyname = 'audit_events_permission_select'
      and coalesce(qual, '') like '%audit.read%'
  ) then
    raise exception 'Control audit reads must require audit.read';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.membership_app_access'::regclass
      and tgname = 'membership_app_access_audit'
  ) then
    raise exception 'membership app access changes must be audited';
  end if;
  if not exists (
    select 1 from pg_proc
    where pronamespace = 'private'::regnamespace
      and proname = 'control_audit_table_change'
  ) then
    raise exception 'tenant-aware Control audit trigger function is missing';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.companies'::regclass
      and tgname = 'companies_owner_guard'
  ) then
    raise exception 'company ownership must be protected by a dedicated workflow';
  end if;
  if not exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'control_set_member_status'
  ) then
    raise exception 'Control membership suspension workflow is missing';
  end if;
  if not exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'set_active_company'
  ) then
    raise exception 'The shared organization switcher workflow is missing';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'membership_role_assignments'
      and policyname = 'membership_role_assignments_manage_insert'
      and coalesce(with_check, '') like '%can_grant_role%'
  ) then
    raise exception 'membership role assignment writes must use the privilege ceiling';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.membership_role_assignments'::regclass
      and tgname = 'membership_role_assignments_guard'
  ) then
    raise exception 'security-definer role workflows must keep the privilege ceiling';
  end if;

  if not exists (
    select 1
    from public.app_roles role
    join public.app_role_permissions grant_row on grant_row.role_id = role.id
    where role.company_id is null and role.code = 'billing_admin'
      and grant_row.permission_code = 'billing.manage'
  ) or exists (
    select 1
    from public.app_roles role
    join public.app_role_permissions grant_row on grant_row.role_id = role.id
    where role.company_id is null and role.code = 'billing_admin'
      and grant_row.permission_code = 'security.manage'
  ) then
    raise exception 'Billing Admin must manage billing without managing security';
  end if;

  if not exists (
    select 1
    from public.app_roles role
    join public.app_role_permissions grant_row on grant_row.role_id = role.id
    where role.company_id is null and role.code = 'security_admin'
      and grant_row.permission_code = 'security.manage'
  ) or exists (
    select 1
    from public.app_roles role
    join public.app_role_permissions grant_row on grant_row.role_id = role.id
    where role.company_id is null and role.code = 'security_admin'
      and grant_row.permission_code = 'billing.manage'
  ) then
    raise exception 'Security Admin must manage security without managing billing';
  end if;

  if not exists (
    select 1
    from public.app_roles role
    join public.app_role_permissions grant_row on grant_row.role_id = role.id
    where role.company_id is null and role.code = 'read_only_admin'
      and grant_row.permission_code = 'users.read'
  ) or exists (
    select 1
    from public.app_roles role
    join public.app_role_permissions grant_row on grant_row.role_id = role.id
    where role.company_id is null and role.code = 'read_only_admin'
      and grant_row.permission_code = 'users.manage'
  ) then
    raise exception 'Read Only Admin must read users without managing users';
  end if;
end $$;

rollback;
