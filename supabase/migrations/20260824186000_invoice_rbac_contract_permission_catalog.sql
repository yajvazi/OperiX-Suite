-- Keep contract management in the shared Invoice permission catalog.
-- The permission existed in the legacy four-role migration; this follow-up
-- makes it visible to the shared workspace and team-management RPCs too.

begin;

create or replace function private.rbac_is_invoice_permission(p_permission text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select private.rbac_canonical_permission(p_permission) = any(array[
    'company.read',
    'invoice.view','invoice.view_all','invoice.create','invoice.edit','invoice.issue','invoice.delete_draft','invoice.void','invoice.credit','invoice.debit',
    'offer.create','offer.manage','proforma.create','proforma.manage','order.create','order.manage','delivery_note.create','delivery_note.manage','contracts.manage',
    'payment.view','payment.create','payment.refund',
    'expense.view_own','expense.view_all','expense.create','expense.edit','expense.approve','expense.manage',
    'customer.view','customer.view_all','customer.create','customer.edit','customer.delete',
    'product.view','product.create','product.edit','product.change_price','product.delete',
    'inventory.view','inventory.adjust',
    'reports.sales','reports.operational','reports.profit','reports.tax','sales_book.view','sales_book.manage',
    'accounting_period.view','accounting_period.close','accounting_period.reopen',
    'users.view','users.manage','permissions.manage','audit.view','financial.export',
    'settings.company','settings.tax','settings.invoice','settings.bank','settings.integrations','settings.api','settings.security',
    'subscription.manage'
  ]::text[]);
$$;

revoke all on function private.rbac_is_invoice_permission(text) from public;
grant execute on function private.rbac_is_invoice_permission(text) to authenticated, service_role;

create or replace function private.rbac_permission_assignable(
  p_role_code text,
  p_permission text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with role_value as (
    select case lower(trim(coalesce(p_role_code, '')))
      when 'admin' then 'company_administrator'
      else lower(trim(coalesce(p_role_code, '')))
    end as role_code,
    private.rbac_canonical_permission(p_permission) as permission_code
  )
  select case
    when role_value.role_code = 'company_administrator' then
      role_value.permission_code in (
        'invoice.view','invoice.view_all','invoice.create','invoice.edit','invoice.issue','invoice.delete_draft',
        'invoice.void','invoice.credit','invoice.debit','offer.create','offer.manage','proforma.create',
        'proforma.manage','order.create','order.manage','delivery_note.create','delivery_note.manage','contracts.manage',
        'payment.view','payment.create','payment.refund','expense.view_own','expense.view_all','expense.create',
        'expense.edit','expense.approve','expense.manage','customer.view','customer.view_all','customer.create',
        'customer.edit','customer.delete','product.view','product.create','product.edit','product.change_price',
        'product.delete','inventory.view','inventory.adjust','reports.sales','reports.operational','reports.profit',
        'reports.tax','sales_book.view','sales_book.manage','accounting_period.view','accounting_period.close',
        'accounting_period.reopen','users.view','users.manage','permissions.manage','audit.view','financial.export',
        'settings.company','settings.tax','settings.invoice','settings.bank','settings.integrations','settings.api',
        'settings.security','subscription.manage'
      )
    when role_value.role_code = 'manager' then
      role_value.permission_code in (
        'company.read','invoice.view','invoice.view_all','invoice.create','invoice.edit','invoice.issue',
        'invoice.delete_draft','invoice.void','invoice.credit','invoice.debit','offer.create','offer.manage',
        'proforma.create','proforma.manage','order.create','order.manage','delivery_note.create','delivery_note.manage','contracts.manage',
        'payment.view','payment.create','payment.refund','expense.view_own','expense.view_all','expense.create',
        'expense.edit','expense.approve','expense.manage','customer.view','customer.view_all','customer.create',
        'customer.edit','customer.delete','product.view','product.create','product.edit','product.change_price',
        'product.delete','inventory.view','inventory.adjust','reports.sales','reports.operational','reports.profit',
        'reports.tax','sales_book.view','accounting_period.view','users.view','users.manage','audit.view',
        'financial.export'
      )
    when role_value.role_code = 'employee' then
      role_value.permission_code in (
        'company.read','invoice.view','invoice.view_all','invoice.create','invoice.edit','invoice.issue',
        'invoice.delete_draft','offer.create','offer.manage','proforma.create','proforma.manage','order.create',
        'order.manage','delivery_note.create','delivery_note.manage','payment.view','payment.create',
        'expense.view_own','expense.create','expense.edit','customer.view','customer.view_all','customer.create',
        'customer.edit','product.view','product.create','product.edit','inventory.view'
      )
    else false
  end
  from role_value;
$$;

revoke all on function private.rbac_permission_assignable(text,text) from public;
grant execute on function private.rbac_permission_assignable(text,text) to authenticated, service_role;

create or replace function public.rbac_get_workspace_access(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  role_code_value text;
  permission_values jsonb;
  scope_values jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not public.can_access_company(p_company_id) then
    raise exception 'Company access denied' using errcode = '42501';
  end if;

  role_code_value := case when public.control_is_platform_admin() then 'super_administrator' else private.rbac_role_code(p_company_id) end;
  select coalesce(jsonb_agg(permission.code order by permission.code), '[]'::jsonb)
    into permission_values
  from public.app_permissions permission
  where permission.code in (
    'invoice.view','invoice.view_all','invoice.create','invoice.edit','invoice.issue','invoice.delete_draft',
    'invoice.void','invoice.credit','invoice.debit','offer.create','offer.manage','proforma.create',
    'proforma.manage','order.create','order.manage','delivery_note.create','delivery_note.manage','contracts.manage',
    'payment.view','payment.create','payment.refund','expense.view_own','expense.view_all','expense.create',
    'expense.edit','expense.approve','expense.manage','customer.view','customer.view_all','customer.create',
    'customer.edit','customer.delete','product.view','product.create','product.edit','product.change_price',
    'product.delete','inventory.view','inventory.adjust','reports.sales','reports.operational','reports.profit',
    'reports.tax','sales_book.view','sales_book.manage','accounting_period.view','accounting_period.close',
    'accounting_period.reopen','users.view','users.manage','permissions.manage','audit.view','financial.export',
    'settings.company','settings.tax','settings.invoice','settings.bank','settings.integrations','settings.api',
    'settings.security','subscription.manage'
  )
    and private.has_company_permission(p_company_id, permission.code);

  select coalesce(jsonb_object_agg(resource, private.rbac_scope_for(p_company_id, resource)), '{}'::jsonb)
    into scope_values
  from (values
    ('invoice'),('offer'),('proforma'),('order'),('delivery_note'),('customer'),
    ('expense'),('payment'),('product'),('inventory')
  ) as resources(resource);

  return jsonb_build_object(
    'company_id', p_company_id,
    'role_code', role_code_value,
    'platform_admin', public.control_is_platform_admin(),
    'permissions', permission_values,
    'scopes', scope_values
  );
end;
$$;

revoke all on function public.rbac_get_workspace_access(uuid) from public, anon;
grant execute on function public.rbac_get_workspace_access(uuid) to authenticated;

create or replace function public.rbac_list_permission_catalog()
returns table(code text, name text, category text, description text, is_sensitive boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select permission.code, permission.name, permission.category,
    permission.description, permission.is_sensitive
  from public.app_permissions permission
  where permission.code in (
    'invoice.view','invoice.view_all','invoice.create','invoice.edit','invoice.issue','invoice.delete_draft',
    'invoice.void','invoice.credit','invoice.debit','offer.create','offer.manage','proforma.create',
    'proforma.manage','order.create','order.manage','delivery_note.create','delivery_note.manage','contracts.manage',
    'payment.view','payment.create','payment.refund','expense.view_own','expense.view_all','expense.create',
    'expense.edit','expense.approve','expense.manage','customer.view','customer.view_all','customer.create',
    'customer.edit','customer.delete','product.view','product.create','product.edit','product.change_price',
    'product.delete','inventory.view','inventory.adjust','reports.sales','reports.operational','reports.profit',
    'reports.tax','sales_book.view','sales_book.manage','accounting_period.view','accounting_period.close',
    'accounting_period.reopen','users.view','users.manage','permissions.manage','audit.view','financial.export',
    'settings.company','settings.tax','settings.invoice','settings.bank','settings.integrations','settings.api',
    'settings.security','subscription.manage'
  )
  order by permission.category, permission.code;
$$;

revoke all on function public.rbac_list_permission_catalog() from public, anon;
grant execute on function public.rbac_list_permission_catalog() to authenticated;

create or replace function private.rbac_member_access_json(p_membership_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with target as (
    select membership.company_id, private.rbac_member_role_code(membership.id) as role_code
    from public.memberships membership
    where membership.id = p_membership_id
  ),
  permissions as (
    select coalesce(jsonb_agg(permission.code order by permission.code), '[]'::jsonb) as value
    from public.app_permissions permission
    cross join target
    where permission.code in (
      'invoice.view','invoice.view_all','invoice.create','invoice.edit','invoice.issue','invoice.delete_draft',
      'invoice.void','invoice.credit','invoice.debit','offer.create','offer.manage','proforma.create',
      'proforma.manage','order.create','order.manage','delivery_note.create','delivery_note.manage','contracts.manage',
      'payment.view','payment.create','payment.refund','expense.view_own','expense.view_all','expense.create',
      'expense.edit','expense.approve','expense.manage','customer.view','customer.view_all','customer.create',
      'customer.edit','customer.delete','product.view','product.create','product.edit','product.change_price',
      'product.delete','inventory.view','inventory.adjust','reports.sales','reports.operational','reports.profit',
      'reports.tax','sales_book.view','sales_book.manage','accounting_period.view','accounting_period.close',
      'accounting_period.reopen','users.view','users.manage','permissions.manage','audit.view','financial.export',
      'settings.company','settings.tax','settings.invoice','settings.bank','settings.integrations','settings.api',
      'settings.security','subscription.manage'
    )
      and private.rbac_member_has_permission(p_membership_id, permission.code)
  ),
  scopes as (
    select coalesce(jsonb_object_agg(resource, private.rbac_member_scope(p_membership_id, resource)), '{}'::jsonb) as value
    from (values
      ('invoice'),('offer'),('proforma'),('order'),('delivery_note'),('customer'),
      ('expense'),('payment'),('product'),('inventory')
    ) as resources(resource)
  ),
  overrides as (
    select coalesce(jsonb_object_agg(permission_code, enabled), '{}'::jsonb) as value
    from public.membership_permission_overrides
    where membership_id = p_membership_id
  )
  select jsonb_build_object(
    'role_code', target.role_code,
    'permissions', permissions.value,
    'scopes', scopes.value,
    'overrides', overrides.value
  )
  from target, permissions, scopes, overrides;
$$;

commit;
