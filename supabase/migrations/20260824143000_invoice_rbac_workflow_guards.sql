-- OperiX Invoice RBAC workflow and scope hardening.
--
-- This migration is additive. It does not rewrite business records. It closes
-- privilege-escalation paths in the access RPC and protects SECURITY DEFINER
-- workflows and direct table writes with the canonical RBAC evaluator.

begin;

-- ---------------------------------------------------------------------------
-- Tenant-admin assignment ceiling
-- ---------------------------------------------------------------------------

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
    when role_value.role_code = 'manager' then
      role_value.permission_code in (
        -- Manager defaults and Admin-enabled operational extensions.
        'company.read','invoice.view','invoice.view_all','invoice.create','invoice.edit','invoice.issue',
        'invoice.delete_draft','invoice.void','invoice.credit','invoice.debit','offer.create','offer.manage',
        'proforma.create','proforma.manage','order.create','order.manage','delivery_note.create','delivery_note.manage',
        'payment.view','payment.create','payment.refund','expense.view_own','expense.view_all','expense.create',
        'expense.edit','expense.approve','expense.manage','customer.view','customer.view_all','customer.create',
        'customer.edit','customer.delete','product.view','product.create','product.edit','product.change_price',
        'product.delete','inventory.view','inventory.adjust','reports.sales','reports.operational','reports.profit',
        'reports.tax','sales_book.view','accounting_period.view','users.view','users.manage','audit.view',
        'financial.export'
      )
    when role_value.role_code = 'employee' then
      role_value.permission_code in (
        -- Employee defaults and narrowly scoped operational extensions.
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

-- The manager operational preset includes ALL invoice visibility.  Sensitive
-- actions remain absent until an Admin explicitly enables them.
insert into public.app_role_permissions(role_id, permission_code)
select role.id, 'invoice.view_all'
from public.app_roles role
where role.company_id is null and role.code = 'manager'
on conflict do nothing;

create or replace function private.rbac_permission_override_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_role text;
begin
  if coalesce((select auth.jwt() ->> 'role'), '') = 'service_role'
     or private.rbac_is_platform_admin() then
    return new;
  end if;
  select private.rbac_member_role_code(new.membership_id) into target_role;
  if target_role is null or not private.rbac_permission_assignable(target_role, new.permission_code) then
    raise exception 'The selected permission cannot be assigned to this tenant role' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists rbac_permission_override_guard on public.membership_permission_overrides;
create trigger rbac_permission_override_guard
before insert or update on public.membership_permission_overrides
for each row execute function private.rbac_permission_override_guard();

create or replace function private.rbac_scope_override_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_role text;
  view_all_permission text;
begin
  if coalesce((select auth.jwt() ->> 'role'), '') = 'service_role'
     or private.rbac_is_platform_admin() then
    return new;
  end if;
  if new.resource not in ('invoice','offer','proforma','order','delivery_note','customer','expense','payment','product','inventory') then
    raise exception 'The selected data scope is not valid' using errcode = '22023';
  end if;
  if upper(new.scope) = 'ALL' and new.resource in ('invoice','customer','expense') then
    view_all_permission := case new.resource
      when 'invoice' then 'invoice.view_all'
      when 'customer' then 'customer.view_all'
      else 'expense.view_all'
    end;
    if not private.rbac_member_has_permission(new.membership_id, view_all_permission) then
      raise exception 'ALL scope requires the matching view-all permission' using errcode = '42501';
    end if;
  end if;
  select private.rbac_member_role_code(new.membership_id) into target_role;
  if target_role is null then
    raise exception 'The target membership has no active tenant role' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists rbac_scope_override_guard on public.membership_data_scopes;
create trigger rbac_scope_override_guard
before insert or update on public.membership_data_scopes
for each row execute function private.rbac_scope_override_guard();

-- ---------------------------------------------------------------------------
-- Posted financial state is workflow-only
-- ---------------------------------------------------------------------------

create or replace function private.rbac_posted_state_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_state text := lower(coalesce(to_jsonb(new) ->> 'accounting_state', 'legacy'));
  old_state text := lower(coalesce(to_jsonb(old) ->> 'accounting_state', 'legacy'));
  financial_workflow boolean := coalesce(current_setting('app.financial_workflow', true), '') = 'authorized';
  auxiliary_workflow boolean := tg_table_name = 'invoices'
    and coalesce(current_setting('app.invoice_auxiliary_workflow', true), '') = 'authorized'
    and tg_op = 'UPDATE'
    and old_state = new_state;
begin
  if coalesce((select auth.jwt() ->> 'role'), '') = 'service_role'
     or private.rbac_is_platform_admin()
     or financial_workflow
     or auxiliary_workflow then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if new_state in ('posted','reversed','opening_balance')
     and (tg_op = 'INSERT' or new_state is distinct from old_state) then
    raise exception 'Posted financial state can only be created by the controlled accounting workflow'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists rbac_invoices_posted_state_guard on public.invoices;
create trigger rbac_invoices_posted_state_guard
before insert or update on public.invoices
for each row execute function private.rbac_posted_state_guard();
drop trigger if exists rbac_payments_posted_state_guard on public.payments;
create trigger rbac_payments_posted_state_guard
before insert or update on public.payments
for each row execute function private.rbac_posted_state_guard();
drop trigger if exists rbac_expenses_posted_state_guard on public.expenses;
create trigger rbac_expenses_posted_state_guard
before insert or update on public.expenses
for each row execute function private.rbac_posted_state_guard();

-- ---------------------------------------------------------------------------
-- Related-record tenant and accounting-period guards
-- ---------------------------------------------------------------------------

create or replace function private.rbac_related_record_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  related_company uuid;
  related_id uuid;
  optional_id uuid;
  period_status text;
  workflow_authorized boolean := coalesce(current_setting('app.financial_workflow', true), '') = 'authorized';
begin
  if coalesce((select auth.jwt() ->> 'role'), '') = 'service_role'
     or private.rbac_is_platform_admin()
     or workflow_authorized then
    return new;
  end if;

  if tg_table_name = 'invoices' and new.client_id is not null then
    select client.company_id into related_company from public.clients client where client.id = new.client_id;
    if not found or (related_company is not null and related_company is distinct from new.company_id) then
      raise exception 'Invoice customer must belong to the same tenant' using errcode = '42501';
    end if;
  elsif tg_table_name = 'invoice_items' and new.product_id is not null then
    select product.company_id into related_company from public.products product where product.id = new.product_id;
    select invoice.company_id into related_company
    from public.invoices invoice
    where invoice.id = new.invoice_id
      and (related_company is null or related_company = invoice.company_id);
    if not found then
      raise exception 'Invoice line product or invoice is invalid' using errcode = '42501';
    end if;
  elsif tg_table_name = 'payments' then
    if new.client_id is not null then
      select client.company_id into related_company from public.clients client where client.id = new.client_id;
      if not found or (related_company is not null and related_company is distinct from new.company_id) then
        raise exception 'Payment customer must belong to the same tenant' using errcode = '42501';
      end if;
    end if;
    if new.invoice_id is not null then
      select invoice.company_id into related_company from public.invoices invoice where invoice.id = new.invoice_id;
      if not found or related_company is distinct from new.company_id then
        raise exception 'Payment invoice must belong to the same tenant' using errcode = '42501';
      end if;
    end if;
  end if;

  -- Some installed Invoice schemas add vendor_id and accounting_period_id in
  -- later migrations. JSON extraction keeps this migration replayable against
  -- older local schemas while enforcing the check when those columns exist.
  if tg_table_name = 'expenses' then
    optional_id := nullif(to_jsonb(new) ->> 'vendor_id', '')::uuid;
    if optional_id is not null and to_regclass('public.vendors') is not null then
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

drop trigger if exists rbac_invoices_related_record_guard on public.invoices;
create trigger rbac_invoices_related_record_guard
before insert or update on public.invoices
for each row execute function private.rbac_related_record_guard();
drop trigger if exists rbac_invoice_items_related_record_guard on public.invoice_items;
create trigger rbac_invoice_items_related_record_guard
before insert or update on public.invoice_items
for each row execute function private.rbac_related_record_guard();
drop trigger if exists rbac_payments_related_record_guard on public.payments;
create trigger rbac_payments_related_record_guard
before insert or update on public.payments
for each row execute function private.rbac_related_record_guard();
drop trigger if exists rbac_expenses_related_record_guard on public.expenses;
create trigger rbac_expenses_related_record_guard
before insert or update on public.expenses
for each row execute function private.rbac_related_record_guard();

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER invoice workflows
-- ---------------------------------------------------------------------------

create or replace function public.save_invoice_document(
  p_invoice jsonb,
  p_items jsonb,
  p_invoice_id uuid default null,
  p_post_invoice boolean default false,
  p_idempotency_key uuid default null
)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id uuid;
  existing_invoice public.invoices;
  result public.invoices;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_invoice_id is not null then
    select * into existing_invoice from public.invoices where id = p_invoice_id;
    if not found then raise exception 'Invoice not found' using errcode = 'P0002'; end if;
    target_company_id := existing_invoice.company_id;
    if not private.rbac_can_read_resource(
      existing_invoice.company_id, 'invoice', existing_invoice.user_id,
      existing_invoice.assigned_user_id, 'invoice.edit'
    ) then
      raise exception 'Insufficient permission or data scope to edit this invoice' using errcode = '42501';
    end if;
  else
    target_company_id := nullif(p_invoice ->> 'company_id', '')::uuid;
    if not public.can_access_company(target_company_id)
       or not private.has_company_permission(target_company_id, 'invoice.create') then
      raise exception 'Insufficient permission to create invoices in this company' using errcode = '42501';
    end if;
    perform set_config('app.document_create_workflow', 'authorized', true);
  end if;
  if p_post_invoice and not private.rbac_can_read_resource(
    target_company_id, 'invoice',
    case when p_invoice_id is null then (select auth.uid()) else existing_invoice.user_id end,
    case when p_invoice_id is null then (select auth.uid()) else existing_invoice.assigned_user_id end,
    'invoice.issue'
  ) then
    raise exception 'Invoice issue permission and data scope are required to finalize an invoice' using errcode = '42501';
  end if;
  result := public.save_invoice_document_unchecked(p_invoice, p_items, p_invoice_id, p_post_invoice, p_idempotency_key);
  perform set_config('app.document_create_workflow', '', true);
  return result;
end;
$$;

revoke all on function public.save_invoice_document(jsonb,jsonb,uuid,boolean,uuid) from public, anon;
grant execute on function public.save_invoice_document(jsonb,jsonb,uuid,boolean,uuid) to authenticated;

create or replace function public.set_invoice_operating_branch(p_invoice_id uuid, p_branch_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice_row public.invoices;
begin
  select * into invoice_row from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found' using errcode = 'P0002'; end if;
  if not private.rbac_can_read_resource(invoice_row.company_id, 'invoice', invoice_row.user_id, invoice_row.assigned_user_id, 'invoice.edit')
     and not private.rbac_can_read_resource(invoice_row.company_id, 'invoice', invoice_row.user_id, invoice_row.assigned_user_id, 'invoice.create') then
    raise exception 'You do not have permission or data scope for this invoice' using errcode = '42501';
  end if;
  if p_branch_id is not null and not exists (
    select 1 from public.branches where id = p_branch_id and company_id = invoice_row.company_id and is_active
  ) then
    raise exception 'The selected branch is not active in this company' using errcode = '22023';
  end if;
  update public.invoices set branch_id = p_branch_id where id = p_invoice_id returning * into invoice_row;
  return invoice_row;
end;
$$;

revoke all on function public.set_invoice_operating_branch(uuid,uuid) from public, anon;
grant execute on function public.set_invoice_operating_branch(uuid,uuid) to authenticated;

-- Status changes are limited to non-posting commercial lifecycle states. Paid,
-- credited, and corrected states come from payment/correction workflows.
create or replace function public.transition_commercial_document(
  p_document_id uuid,
  p_status text,
  p_event_type text default null
)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice_row public.invoices;
  next_status text := upper(trim(coalesce(p_status, '')));
  previous_status text;
  permission_code text;
  server_request boolean := coalesce((select auth.jwt() ->> 'role'), '') = 'service_role';
begin
  select * into invoice_row from public.invoices where id = p_document_id for update;
  if not found then raise exception 'Commercial document not found' using errcode = 'P0002'; end if;
  if next_status = '' then raise exception 'A document status is required' using errcode = '22023'; end if;
  if next_status not in (
    'DRAFT','SENT','VIEWED','ISSUED','CONFIRMED','PREPARED','DELIVERED','ACCEPTED',
    'OVERDUE','CANCELLED','VOID','VOIDED','REVERSED','PAID','PARTIALLY_PAID',
    'CREDITED','PARTIALLY_CREDITED','CORRECTED'
  ) then
    raise exception 'Unsupported commercial document status' using errcode = '22023';
  end if;
  if not server_request and not private.rbac_is_platform_admin() then
    if next_status in ('PAID','PARTIALLY_PAID','CREDITED','PARTIALLY_CREDITED','CORRECTED') then
      raise exception 'Paid and correction states must use the supported financial workflow' using errcode = '55000';
    end if;
    permission_code := case
      when next_status in ('ISSUED') then 'invoice.issue'
      when next_status in ('CANCELLED','VOID','VOIDED','REVERSED') then 'invoice.void'
      else 'invoice.edit'
    end;
    if not private.rbac_can_read_resource(
      invoice_row.company_id, 'invoice', invoice_row.user_id,
      invoice_row.assigned_user_id, permission_code
    ) then
      raise exception 'Insufficient permission or data scope to transition this document' using errcode = '42501';
    end if;
    if invoice_row.accounting_state in ('posted','reversed') and next_status <> 'OVERDUE' then
      raise exception 'Posted financial documents must be corrected through a supported workflow' using errcode = '55000';
    end if;
  end if;
  previous_status := invoice_row.commercial_status;
  update public.invoices
  set commercial_status = next_status,
      status = case next_status
        when 'DRAFT' then 'draft'::public.invoice_status
        when 'SENT' then 'sent'::public.invoice_status
        when 'ISSUED' then 'sent'::public.invoice_status
        when 'VIEWED' then 'sent'::public.invoice_status
        when 'OVERDUE' then 'overdue'::public.invoice_status
        when 'CANCELLED' then 'cancelled'::public.invoice_status
        when 'VOID' then 'cancelled'::public.invoice_status
        when 'VOIDED' then 'cancelled'::public.invoice_status
        when 'REVERSED' then 'reversed'::public.invoice_status
        else status
      end,
      issued_at = case when next_status = 'ISSUED' then coalesce(issued_at, clock_timestamp()) else issued_at end,
      issued_by = case when next_status = 'ISSUED' then coalesce(issued_by, (select auth.uid())) else issued_by end,
      immutable_at = case when next_status = 'ISSUED' then coalesce(immutable_at, clock_timestamp()) else immutable_at end
  where id = invoice_row.id
  returning * into invoice_row;
  perform private.insert_commercial_document_event(
    invoice_row.company_id, invoice_row.id,
    coalesce(nullif(trim(p_event_type), ''), lower(next_status)),
    previous_status, next_status, '{}'::jsonb, clock_timestamp(), (select auth.uid())
  );
  return invoice_row;
end;
$$;

revoke all on function public.transition_commercial_document(uuid,text,text) from public, anon;
grant execute on function public.transition_commercial_document(uuid,text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- Draft-only invoice deletion, accounting periods, and related scopes
-- ---------------------------------------------------------------------------

create or replace function private.rbac_invoice_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.jwt() ->> 'role'), '') = 'service_role'
     or private.rbac_is_platform_admin() then
    return old;
  end if;
  if lower(coalesce(old.accounting_state, 'legacy')) not in ('legacy','ready_for_posting')
     or upper(coalesce(old.commercial_status, old.status::text, 'DRAFT')) <> 'DRAFT' then
    raise exception 'Finalized financial documents cannot be deleted; use a correction or reversal workflow' using errcode = '55000';
  end if;
  if not private.rbac_can_read_resource(old.company_id, 'invoice', old.user_id, old.assigned_user_id, 'invoice.delete_draft') then
    raise exception 'Draft-delete permission and data scope are required' using errcode = '42501';
  end if;
  return old;
end;
$$;

drop trigger if exists rbac_invoice_delete_guard on public.invoices;
create trigger rbac_invoice_delete_guard
before delete on public.invoices
for each row execute function private.rbac_invoice_delete_guard();

create or replace function private.rbac_accounting_period_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.jwt() ->> 'role'), '') = 'service_role'
     or private.rbac_is_platform_admin()
     or coalesce(current_setting('app.accounting_period_workflow', true), '') = 'authorized' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    raise exception 'Accounting period close and reopen operations must use the controlled workflow' using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists rbac_accounting_period_guard on public.accounting_periods;
create trigger rbac_accounting_period_guard
before insert or update on public.accounting_periods
for each row execute function private.rbac_accounting_period_guard();

create or replace function public.set_accounting_period_status(
  p_period_id uuid,
  p_status text,
  p_reason text default null
)
returns public.accounting_periods
language plpgsql
security definer
set search_path = ''
as $$
declare
  period_row public.accounting_periods;
  normalized_status text := lower(trim(coalesce(p_status, '')));
begin
  select * into period_row from public.accounting_periods where id = p_period_id for update;
  if not found then raise exception 'Accounting period not found' using errcode = 'P0002'; end if;
  if normalized_status not in ('open','closed','locked') then
    raise exception 'Invalid accounting period status' using errcode = '22023';
  end if;
  if normalized_status = 'open' and period_row.status in ('closed','locked') then
    if not private.has_company_permission(period_row.company_id, 'accounting_period.reopen') then
      raise exception 'Insufficient permission to reopen accounting periods' using errcode = '42501';
    end if;
    if trim(coalesce(p_reason, '')) = '' then
      raise exception 'A reason is required to reopen a period' using errcode = '23514';
    end if;
  elsif normalized_status <> period_row.status
     and not private.has_company_permission(period_row.company_id, 'accounting_period.close') then
    raise exception 'Insufficient permission to close accounting periods' using errcode = '42501';
  end if;
  perform set_config('app.accounting_period_workflow', 'authorized', true);
  perform set_config('app.change_reason', coalesce(nullif(trim(coalesce(p_reason, '')), ''), ''), true);
  update public.accounting_periods
  set status = normalized_status,
      closed_at = case when normalized_status = 'closed' then clock_timestamp() else closed_at end,
      closed_by = case when normalized_status = 'closed' then (select auth.uid()) else closed_by end,
      locked_at = case when normalized_status = 'locked' then clock_timestamp() else locked_at end,
      locked_by = case when normalized_status = 'locked' then (select auth.uid()) else locked_by end,
      reopened_at = case when normalized_status = 'open' and status <> 'open' then clock_timestamp() else reopened_at end,
      reopened_by = case when normalized_status = 'open' and status <> 'open' then (select auth.uid()) else reopened_by end,
      reopen_reason = case when normalized_status = 'open' and status <> 'open' then trim(p_reason) else reopen_reason end,
      updated_at = clock_timestamp(), updated_by = (select auth.uid())
  where id = p_period_id
  returning * into period_row;
  perform set_config('app.accounting_period_workflow', '', true);
  perform set_config('app.change_reason', '', true);
  return period_row;
end;
$$;

revoke all on function public.set_accounting_period_status(uuid,text,text) from public, anon;
grant execute on function public.set_accounting_period_status(uuid,text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- Payment allocation and attachment scope enforcement
-- ---------------------------------------------------------------------------

do $$
declare
  policy_name text;
begin
  if to_regclass('public.payment_allocations') is not null then
    for policy_name in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = 'payment_allocations'
    loop
      execute format('drop policy if exists %I on public.payment_allocations', policy_name);
    end loop;
    alter table public.payment_allocations enable row level security;
    create policy rbac_payment_allocations_select on public.payment_allocations
      for select to authenticated
      using (
        exists (
          select 1 from public.payments payment
          where payment.id = payment_allocations.payment_id
            and payment.company_id = payment_allocations.company_id
            and private.rbac_can_read_resource(payment.company_id, 'payment', payment.user_id, payment.assigned_user_id, 'payment.view')
        )
        and exists (
          select 1 from public.invoices invoice
          where invoice.id = payment_allocations.invoice_id
            and invoice.company_id = payment_allocations.company_id
            and private.rbac_can_read_resource(invoice.company_id, 'invoice', invoice.user_id, invoice.assigned_user_id, 'invoice.view')
        )
      );
  end if;
end
$$;

create or replace function private.rbac_payment_allocation_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.payments;
  invoice_row public.invoices;
begin
  if coalesce((select auth.jwt() ->> 'role'), '') = 'service_role'
     or private.rbac_is_platform_admin() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select * into payment_row from public.payments where id = coalesce(new.payment_id, old.payment_id);
  select * into invoice_row from public.invoices where id = coalesce(new.invoice_id, old.invoice_id);
  if payment_row.id is null or invoice_row.id is null
     or payment_row.company_id is distinct from invoice_row.company_id
     or payment_row.company_id is distinct from coalesce(new.company_id, old.company_id) then
    raise exception 'Payment allocation parents must belong to the same tenant' using errcode = '42501';
  end if;
  if not private.rbac_can_read_resource(payment_row.company_id, 'payment', payment_row.user_id, payment_row.assigned_user_id, 'payment.create')
     or not private.rbac_can_read_resource(invoice_row.company_id, 'invoice', invoice_row.user_id, invoice_row.assigned_user_id, 'invoice.view') then
    raise exception 'Payment allocation permission or data scope is required' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists rbac_payment_allocation_guard on public.payment_allocations;
create trigger rbac_payment_allocation_guard
before insert or update or delete on public.payment_allocations
for each row execute function private.rbac_payment_allocation_guard();

-- Attachments are read through their linked financial record.  Writes are
-- performed by protected RPCs, never by direct PostgREST inserts.
do $$
declare policy_name text;
begin
  if to_regclass('public.financial_document_attachments') is not null then
    for policy_name in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = 'financial_document_attachments'
    loop
      execute format('drop policy if exists %I on public.financial_document_attachments', policy_name);
    end loop;
    alter table public.financial_document_attachments enable row level security;
    create policy rbac_financial_document_attachments_select on public.financial_document_attachments
      for select to authenticated
      using (
        (document_type = 'expense' and exists (
          select 1 from public.expenses expense
          where expense.id = financial_document_attachments.document_id
            and expense.company_id = financial_document_attachments.company_id
            and private.rbac_can_read_resource(expense.company_id, 'expense', expense.user_id, expense.assigned_user_id, 'expense.view_own')
        ))
        or (document_type <> 'expense' and private.has_company_permission(company_id, 'invoice.view'))
      );
    revoke insert, update, delete, truncate on public.financial_document_attachments from anon, authenticated;
  end if;
end
$$;

commit;
