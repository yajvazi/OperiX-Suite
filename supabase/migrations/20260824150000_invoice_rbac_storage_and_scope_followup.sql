-- OperiX Invoice RBAC follow-up for attachment storage, report views, and
-- replay-safe scope guards.

begin;

-- A disabled override is harmless and is retained so the UI can submit a
-- complete permission matrix. Only enabling a permission outside the target
-- role's assignment ceiling is rejected.
create or replace function private.rbac_permission_override_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare target_role text;
begin
  if coalesce((select auth.jwt() ->> 'role'), '') = 'service_role'
     or private.rbac_is_platform_admin()
     or not new.enabled then
    return new;
  end if;
  select private.rbac_member_role_code(new.membership_id) into target_role;
  if target_role is null or not private.rbac_permission_assignable(target_role, new.permission_code) then
    raise exception 'The selected permission cannot be granted to this tenant role' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.rbac_related_record_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  related_company uuid;
  product_company uuid;
  invoice_company uuid;
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
    select product.company_id into product_company from public.products product where product.id = new.product_id;
    if not found then
      raise exception 'Invoice line product is invalid' using errcode = '42501';
    end if;
    select invoice.company_id into invoice_company from public.invoices invoice where invoice.id = new.invoice_id;
    if not found or (product_company is not null and product_company is distinct from invoice_company) then
      raise exception 'Invoice line product must belong to the same tenant as the invoice' using errcode = '42501';
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

create or replace function private.rbac_payment_allocation_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_id_value uuid := case when tg_op = 'DELETE' then old.payment_id else new.payment_id end;
  invoice_id_value uuid := case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end;
  company_id_value uuid := case when tg_op = 'DELETE' then old.company_id else new.company_id end;
  payment_row public.payments;
  invoice_row public.invoices;
begin
  if coalesce((select auth.jwt() ->> 'role'), '') = 'service_role'
     or private.rbac_is_platform_admin() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select * into payment_row from public.payments where id = payment_id_value;
  select * into invoice_row from public.invoices where id = invoice_id_value;
  if payment_row.id is null or invoice_row.id is null
     or payment_row.company_id is distinct from invoice_row.company_id
     or payment_row.company_id is distinct from company_id_value then
    raise exception 'Payment allocation parents must belong to the same tenant' using errcode = '42501';
  end if;
  if not private.rbac_can_read_resource(payment_row.company_id, 'payment', payment_row.user_id, payment_row.assigned_user_id, 'payment.create')
     or not private.rbac_can_read_resource(invoice_row.company_id, 'invoice', invoice_row.user_id, invoice_row.assigned_user_id, 'invoice.view') then
    raise exception 'Payment allocation permission or data scope is required' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

commit;

