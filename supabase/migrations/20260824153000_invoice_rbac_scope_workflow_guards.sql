-- OperiX Invoice RBAC: close legacy-permission, assignment, and SECURITY
-- DEFINER scope gaps discovered during the authorization audit.
--
-- This migration is additive and does not rewrite existing financial rows.
begin;

-- The shared permission catalogue contains permissions for other OperiX
-- products.  Invoice permissions are canonicalized here so an old shared
-- grant such as roles.manage or company.manage cannot silently become an
-- Invoice privilege for Manager/Employee users.
create or replace function private.rbac_canonical_permission(p_permission text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case lower(trim(coalesce(p_permission, '')))
    when 'sales_invoice.view' then 'invoice.view'
    when 'sales_invoice.create' then 'invoice.create'
    when 'invoice.create' then 'invoice.create'
    when 'sales_invoice.edit' then 'invoice.edit'
    when 'sales_invoice.post' then 'invoice.issue'
    when 'invoice.post' then 'invoice.issue'
    when 'invoice.approve' then 'invoice.issue'
    when 'sales_invoice.approve' then 'invoice.issue'
    when 'sales_invoice.delete' then 'invoice.delete_draft'
    when 'sales_invoice.cancel' then 'invoice.void'
    when 'invoice.cancel' then 'invoice.void'
    when 'sales_invoice.reverse' then 'invoice.void'
    when 'credit_note.issue' then 'invoice.credit'
    when 'debit_note.issue' then 'invoice.debit'
    when 'payments.manage' then 'payment.create'
    when 'payment.manage' then 'payment.create'
    when 'payment.read' then 'payment.view'
    when 'customer_payment.view' then 'payment.view'
    when 'customer_payment.record' then 'payment.create'
    when 'customer_payment.allocate' then 'payment.create'
    when 'customer_payment.reverse' then 'payment.refund'
    when 'journal.create' then 'payment.create'
    when 'journal.post' then 'payment.create'
    when 'journal.reverse' then 'payment.refund'
    when 'cash_transaction.post' then 'payment.create'
    when 'cash_account.view' then 'settings.bank'
    when 'bank_account.view' then 'settings.bank'
    when 'expense.post' then 'expense.create'
    when 'expense.create' then 'expense.create'
    when 'expense.edit' then 'expense.edit'
    when 'expense.period.reopen' then 'accounting_period.reopen'
    when 'expense.tax.override' then 'settings.tax'
    when 'expense.vat.override' then 'settings.tax'
    when 'products.view' then 'product.view'
    when 'products.manage' then 'product.edit'
    when 'prices.override' then 'product.change_price'
    when 'discounts.override' then 'product.change_price'
    when 'inventory.manage' then 'inventory.adjust'
    when 'sales_customer.manage' then 'customer.edit'
    when 'customer.manage' then 'customer.edit'
    when 'customer.read' then 'customer.view'
    when 'customer.balance.view' then 'customer.view_all'
    when 'reports.view' then 'reports.operational'
    when 'report.read' then 'reports.operational'
    when 'financial_reports.view' then 'reports.profit'
    when 'financial_reports.export' then 'financial.export'
    when 'financial_data.export' then 'financial.export'
    when 'accounting.read' then 'accounting_period.view'
    when 'accounts.manage' then 'accounting_period.close'
    when 'accounting_period.manage' then 'accounting_period.close'
    when 'accounting_period.reopen' then 'accounting_period.reopen'
    when 'opening_balance.post' then 'accounting_period.close'
    when 'posting_rules.manage' then 'accounting_period.close'
    when 'tax.book.view' then 'sales_book.view'
    when 'tax_report.submit' then 'settings.tax'
    when 'tax.declaration.prepare' then 'settings.tax'
    when 'tax.calendar.manage' then 'settings.tax'
    when 'fiscal_configuration.manage' then 'settings.tax'
    when 'withholding.manage' then 'settings.tax'
    when 'compliance.manage' then 'settings.tax'
    when 'roles.manage' then 'permissions.manage'
    when 'roles.read' then 'users.view'
    when 'team.manage' then 'users.manage'
    when 'teams.manage' then 'users.manage'
    when 'team.read' then 'users.view'
    when 'teams.read' then 'users.view'
    when 'staff.manage' then 'users.manage'
    when 'employees.manage' then 'users.manage'
    when 'employees.view' then 'users.view'
    when 'users.read' then 'users.view'
    when 'users.manage' then 'users.manage'
    when 'company.manage' then 'settings.company'
    when 'branches.manage' then 'settings.company'
    when 'organization.manage' then 'settings.company'
    when 'organization.read' then 'settings.company'
    when 'organization.view' then 'settings.company'
    when 'workspace.manage' then 'settings.company'
    when 'settings.manage' then 'settings.company'
    when 'settings.read' then 'settings.company'
    when 'security.manage' then 'settings.security'
    when 'security.read' then 'settings.security'
    when 'integrations.manage' then 'settings.integrations'
    when 'integrations.read' then 'settings.integrations'
    when 'api.manage' then 'settings.api'
    when 'api.read' then 'settings.api'
    when 'billing.manage' then 'subscription.manage'
    when 'billing.read' then 'subscription.manage'
    else lower(trim(coalesce(p_permission, '')))
  end;
$$;

-- Only the Invoice catalogue is subject to the four-role Invoice ceiling.
-- Unknown keys remain available to their owning OperiX product so this
-- migration does not unintentionally remove unrelated Suite permissions.
create or replace function private.rbac_is_invoice_permission(p_permission text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select private.rbac_canonical_permission(p_permission) = any(array[
    'company.read',
    'invoice.view','invoice.view_all','invoice.create','invoice.edit','invoice.issue','invoice.delete_draft','invoice.void','invoice.credit','invoice.debit',
    'offer.create','offer.manage','proforma.create','proforma.manage','order.create','order.manage','delivery_note.create','delivery_note.manage',
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

-- Re-evaluate shared role grants through the Invoice role ceiling.  A legacy
-- Manager grant such as permissions.manage or organization.manage therefore
-- cannot bypass the canonical Invoice role preset.  Explicit Admin-managed
-- overrides still work, but only for keys allowed by the assignment ceiling.
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
$$;

revoke all on function private.rbac_is_invoice_permission(text) from public;
grant execute on function private.rbac_is_invoice_permission(text) to authenticated, service_role;

-- Assignment is an Admin-controlled data attribute.  A normal user may not
-- create a row assigned to another user and later use ASSIGNED scope to read
-- it.  Admins may assign within their tenant; service/platform workflows are
-- retained for migrations and platform operations.
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
  if coalesce((select auth.jwt() ->> 'role'), '') in ('service_role')
     or private.rbac_is_platform_admin()
     or private.rbac_is_tenant_admin(coalesce(old.company_id, new.company_id)) then
    return new;
  end if;
  if new.assigned_user_id is distinct from (select auth.uid()) then
    raise exception 'Only a tenant Admin can assign a record to another user' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE'
     and (
       old.company_id is distinct from new.company_id
       or old.user_id is distinct from new.user_id
     ) then
    raise exception 'Only a tenant Admin can reassign a record' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Scope-aware lifecycle guard.  SECURITY DEFINER workflows bypass table RLS,
-- so the trigger checks the actor's scope as well as the permission.
create or replace function private.rbac_invoice_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  document_type text := upper(coalesce(new.commercial_document_type, new.type, 'INVOICE'));
  old_status text := upper(coalesce(old.commercial_status, old.status::text, 'DRAFT'));
  new_status text := upper(coalesce(new.commercial_status, new.status::text, 'DRAFT'));
  server_request boolean := coalesce((select auth.jwt() ->> 'role'), '') = 'service_role';
  actor_permission text;
begin
  if server_request or private.rbac_is_platform_admin() then return new; end if;
  if new.company_id is null then return new; end if;

  if tg_op = 'INSERT'
     and not private.rbac_can_read_resource(new.company_id, 'invoice', new.user_id, new.assigned_user_id, 'invoice.create') then
    raise exception 'Invoice create permission or data scope is required' using errcode = '42501';
  end if;

  if document_type in ('CREDIT_NOTE','CREDIT') then
    actor_permission := 'invoice.credit';
  elsif document_type in ('DEBIT_NOTE','DEBIT') then
    actor_permission := 'invoice.debit';
  else
    actor_permission := 'invoice.edit';
  end if;
  if document_type in ('CREDIT_NOTE','CREDIT','DEBIT_NOTE','DEBIT')
     and not private.rbac_can_read_resource(new.company_id, 'invoice', coalesce(old.user_id, new.user_id), coalesce(old.assigned_user_id, new.assigned_user_id), actor_permission) then
    raise exception 'Correction-document permission or data scope is required' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
     and new.commercial_status = 'CONVERTED'
     and old.commercial_status is distinct from new.commercial_status
     and not private.rbac_can_read_resource(old.company_id, 'invoice', old.user_id, old.assigned_user_id, 'invoice.edit') then
    raise exception 'Source-document data scope is required for conversion' using errcode = '42501';
  end if;

  if new_status in ('ISSUED','POSTED','FINALIZED','APPROVED')
     and old_status is distinct from new_status
     and not private.rbac_can_read_resource(new.company_id, 'invoice', coalesce(old.user_id, new.user_id), coalesce(old.assigned_user_id, new.assigned_user_id), 'invoice.issue') then
    raise exception 'Invoice issue permission or data scope is required' using errcode = '42501';
  end if;
  if new_status in ('CANCELLED','VOID','VOIDED','REVERSED')
     and old_status is distinct from new_status
     and not private.rbac_can_read_resource(new.company_id, 'invoice', coalesce(old.user_id, new.user_id), coalesce(old.assigned_user_id, new.assigned_user_id), 'invoice.void') then
    raise exception 'Invoice void permission or data scope is required' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Related-record checks must also run inside authorized financial workflows;
-- otherwise a SECURITY DEFINER RPC could use a customer or invoice outside
-- the caller's OWN/ASSIGNED scope.
create or replace function private.rbac_related_record_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  related_company uuid;
  related_user uuid;
  related_assigned uuid;
  product_company uuid;
  invoice_company uuid;
  invoice_user uuid;
  invoice_assigned uuid;
  optional_id uuid;
  period_status text;
begin
  if coalesce((select auth.jwt() ->> 'role'), '') = 'service_role'
     or private.rbac_is_platform_admin() then
    return new;
  end if;

  if tg_table_name = 'invoices' and new.client_id is not null then
    select client.company_id, client.user_id, client.assigned_user_id
      into related_company, related_user, related_assigned
    from public.clients client where client.id = new.client_id;
    if not found or related_company is distinct from new.company_id then
      raise exception 'Invoice customer must belong to the same tenant' using errcode = '42501';
    end if;
    if not private.rbac_can_read_resource(new.company_id, 'customer', related_user, related_assigned, 'customer.view') then
      raise exception 'Invoice customer is outside the caller data scope' using errcode = '42501';
    end if;
  elsif tg_table_name = 'invoice_items' and new.product_id is not null then
    select product.company_id into product_company from public.products product where product.id = new.product_id;
    if not found then
      raise exception 'Invoice line product is invalid' using errcode = '42501';
    end if;
    select invoice.company_id into invoice_company from public.invoices invoice where invoice.id = new.invoice_id;
    if not found or product_company is distinct from invoice_company then
      raise exception 'Invoice line product must belong to the same tenant as the invoice' using errcode = '42501';
    end if;
    if not private.has_company_permission(invoice_company, 'product.view') then
      raise exception 'Invoice line product permission is required' using errcode = '42501';
    end if;
  elsif tg_table_name = 'payments' then
    if new.client_id is not null then
      select client.company_id, client.user_id, client.assigned_user_id
        into related_company, related_user, related_assigned
      from public.clients client where client.id = new.client_id;
      if not found or related_company is distinct from new.company_id then
        raise exception 'Payment customer must belong to the same tenant' using errcode = '42501';
      end if;
      if not private.rbac_can_read_resource(new.company_id, 'customer', related_user, related_assigned, 'payment.create') then
        raise exception 'Payment customer is outside the caller data scope' using errcode = '42501';
      end if;
    end if;
    if new.invoice_id is not null then
      select invoice.company_id, invoice.user_id, invoice.assigned_user_id
        into related_company, invoice_user, invoice_assigned
      from public.invoices invoice where invoice.id = new.invoice_id;
      if not found or related_company is distinct from new.company_id then
        raise exception 'Payment invoice must belong to the same tenant' using errcode = '42501';
      end if;
      if not private.rbac_can_read_resource(new.company_id, 'invoice', invoice_user, invoice_assigned, 'invoice.view') then
        raise exception 'Payment invoice is outside the caller data scope' using errcode = '42501';
      end if;
    end if;
  end if;

  if tg_table_name = 'expenses' then
    optional_id := nullif(to_jsonb(new) ->> 'vendor_id', '')::uuid;
    if optional_id is not null and to_regclass('public.vendors') is not null then
      related_company := null;
      execute 'select company_id from public.vendors where id = $1' into related_company using optional_id;
      if related_company is null or (new.company_id is not null and related_company is distinct from new.company_id) then
        raise exception 'Expense vendor must belong to the same tenant' using errcode = '42501';
      end if;
    end if;
    optional_id := nullif(to_jsonb(new) ->> 'accounting_period_id', '')::uuid;
    if optional_id is not null then
      select period.status into period_status
      from public.accounting_periods period
      where period.id = optional_id and period.company_id = new.company_id;
      if not found then
        raise exception 'Expense accounting period must belong to the same tenant' using errcode = '42501';
      end if;
      if period_status in ('closed','locked') then
        raise exception 'Expenses cannot be created or edited in a closed accounting period' using errcode = '55000';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.rbac_payment_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare payment_row public.payments;
begin
  if tg_op = 'DELETE' then
    if not private.rbac_can_read_resource(old.company_id, 'payment', old.user_id, old.assigned_user_id, 'payment.refund') then
      raise exception 'Payment refund permission or data scope is required' using errcode = '42501';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.reversed_at is null and new.reversed_at is not null then
    if not private.rbac_can_read_resource(new.company_id, 'payment', old.user_id, old.assigned_user_id, 'payment.refund') then
      raise exception 'Payment refund permission or data scope is required' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.rbac_expense_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if not private.rbac_can_read_resource(old.company_id, 'expense', old.user_id, old.assigned_user_id, 'expense.manage') then
      raise exception 'Expense management permission or data scope is required' using errcode = '42501';
    end if;
    return old;
  end if;
  if new.approval_status is distinct from old.approval_status
     and not private.rbac_can_read_resource(new.company_id, 'expense', old.user_id, old.assigned_user_id, 'expense.approve')
     and not private.rbac_can_read_resource(new.company_id, 'expense', old.user_id, old.assigned_user_id, 'expense.manage') then
    raise exception 'Expense approval permission or data scope is required' using errcode = '42501';
  end if;
  if (new.amount is distinct from old.amount
      or new.category is distinct from old.category
      or new.description is distinct from old.description
      or new.receipt_url is distinct from old.receipt_url)
     and not private.rbac_can_read_resource(new.company_id, 'expense', old.user_id, old.assigned_user_id, 'expense.edit')
     and not private.rbac_can_read_resource(new.company_id, 'expense', old.user_id, old.assigned_user_id, 'expense.manage') then
    raise exception 'Expense edit permission or data scope is required' using errcode = '42501';
  end if;
  return new;
end;
$$;

commit;
