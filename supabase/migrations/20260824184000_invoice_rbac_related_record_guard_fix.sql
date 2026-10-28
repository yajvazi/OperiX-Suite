-- Fix the shared RBAC related-record trigger so PostgreSQL never evaluates a
-- record field that is not present on the table currently being triggered.
-- This preserves tenant/scope enforcement while allowing valid rows without
-- optional foreign keys to be inserted.

begin;

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

  if tg_table_name = 'invoices' then
    if new.client_id is not null then
      select client.company_id, client.user_id, client.assigned_user_id
        into related_company, related_user, related_assigned
      from public.clients client
      where client.id = new.client_id;
      if not found or related_company is distinct from new.company_id then
        raise exception 'Invoice customer must belong to the same tenant' using errcode = '42501';
      end if;
      if not private.rbac_can_read_resource(new.company_id, 'customer', related_user, related_assigned, 'customer.view') then
        raise exception 'Invoice customer is outside the caller data scope' using errcode = '42501';
      end if;
    end if;
  elsif tg_table_name = 'invoice_items' then
    if new.product_id is not null then
      select product.company_id
        into product_company
      from public.products product
      where product.id = new.product_id;
      if not found then
        raise exception 'Invoice line product is invalid' using errcode = '42501';
      end if;
      select invoice.company_id
        into invoice_company
      from public.invoices invoice
      where invoice.id = new.invoice_id;
      if not found or product_company is distinct from invoice_company then
        raise exception 'Invoice line product must belong to the same tenant as the invoice' using errcode = '42501';
      end if;
      if not private.has_company_permission(invoice_company, 'product.view') then
        raise exception 'Invoice line product permission is required' using errcode = '42501';
      end if;
    end if;
  elsif tg_table_name = 'payments' then
    if new.client_id is not null then
      select client.company_id, client.user_id, client.assigned_user_id
        into related_company, related_user, related_assigned
      from public.clients client
      where client.id = new.client_id;
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
      from public.invoices invoice
      where invoice.id = new.invoice_id;
      if not found or related_company is distinct from new.company_id then
        raise exception 'Payment invoice must belong to the same tenant' using errcode = '42501';
      end if;
      if not private.rbac_can_read_resource(new.company_id, 'invoice', invoice_user, invoice_assigned, 'invoice.view') then
        raise exception 'Payment invoice is outside the caller data scope' using errcode = '42501';
      end if;
    end if;
  elsif tg_table_name = 'expenses' then
    optional_id := nullif(to_jsonb(new) ->> 'vendor_id', '')::uuid;
    if optional_id is not null and to_regclass('public.vendors') is not null then
      related_company := null;
      execute 'select company_id from public.vendors where id = $1'
        into related_company
        using optional_id;
      if related_company is null or (new.company_id is not null and related_company is distinct from new.company_id) then
        raise exception 'Expense vendor must belong to the same tenant' using errcode = '42501';
      end if;
    end if;
    optional_id := nullif(to_jsonb(new) ->> 'accounting_period_id', '')::uuid;
    if optional_id is not null then
      select period.status
        into period_status
      from public.accounting_periods period
      where period.id = optional_id
        and period.company_id = new.company_id;
      if not found then
        raise exception 'Expense accounting period must belong to the same tenant' using errcode = '42501';
      end if;
      if period_status in ('closed', 'locked') then
        raise exception 'Expenses cannot be created or edited in a closed accounting period' using errcode = '55000';
      end if;
    end if;
  end if;

  return new;
end;
$$;

commit;
