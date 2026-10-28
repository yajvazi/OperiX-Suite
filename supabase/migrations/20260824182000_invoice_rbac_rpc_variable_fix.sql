-- Fix PL/pgSQL record-variable shadowing in the access-management RPC.

begin;

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
  if role_code_value = 'admin' then role_code_value := 'company_administrator'; end if;
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
  if target_company_id is null then raise exception 'Membership was not found' using errcode = '22023'; end if;
  if not private.rbac_is_tenant_admin(target_company_id) then raise exception 'Only a tenant Admin can manage permissions' using errcode = '42501'; end if;
  if target_user_id = actor_id then raise exception 'You cannot change your own role or permissions' using errcode = '42501'; end if;
  if target_user_id = company_owner_id then raise exception 'The company owner cannot be edited from team management' using errcode = '42501'; end if;

  select role.id into role_id_value
  from public.app_roles role
  where role.company_id is null and role.code = role_code_value
    and role_code_value in ('company_administrator','manager','employee');
  if role_id_value is null then raise exception 'The selected role is not available' using errcode = '22023'; end if;
  previous_access := private.rbac_member_access_json(p_membership_id);

  if exists (
    select 1
    from jsonb_each(coalesce(p_permissions, '{}'::jsonb)) requested_permission
    where requested_permission.key not in (
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
    or requested_permission.value not in ('true'::jsonb, 'false'::jsonb)
  ) then
    raise exception 'A permission is not valid for Invoice or is not boolean' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_each_text(coalesce(p_scopes, '{}'::jsonb)) requested_scope
    where requested_scope.key <> all(allowed_resources)
       or upper(requested_scope.value) not in ('OWN','ASSIGNED','ALL')
  ) then
    raise exception 'A data scope is not valid' using errcode = '22023';
  end if;

  perform set_config('app.membership_role_workflow', 'authorized', true);
  update public.memberships
  set role = case role_code_value when 'company_administrator' then 'admin' when 'manager' then 'manager' else 'employee' end,
      status = 'active'
  where id = p_membership_id;
  delete from public.membership_role_assignments where membership_id = p_membership_id;
  insert into public.membership_role_assignments(membership_id, role_id, created_by)
  values (p_membership_id, role_id_value, actor_id);
  delete from public.membership_permission_overrides where membership_id = p_membership_id;
  for permission_entry in select key, value from jsonb_each(coalesce(p_permissions, '{}'::jsonb))
  loop
    insert into public.membership_permission_overrides(membership_id, permission_code, enabled, created_by, updated_by)
    values (p_membership_id, permission_entry.key, (permission_entry.value #>> '{}')::boolean, actor_id, actor_id);
  end loop;
  delete from public.membership_data_scopes where membership_id = p_membership_id;
  for scope_entry in select key, value from jsonb_each_text(coalesce(p_scopes, '{}'::jsonb))
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
    jsonb_build_object('role_code', role_code_value, 'permissions', coalesce(p_permissions, '{}'::jsonb), 'scopes', coalesce(p_scopes, '{}'::jsonb)),
    'Tenant Admin updated member role, permissions, or data scopes'
  );
  return jsonb_build_object('membership_id', p_membership_id, 'role_code', role_code_value, 'access', private.rbac_member_access_json(p_membership_id));
end;
$$;

revoke all on function public.rbac_update_member_access(uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.rbac_update_member_access(uuid, text, jsonb, jsonb) to authenticated, service_role;

commit;
