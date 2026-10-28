-- OperiX Invoice RBAC final guard pass.
-- Migration filename normalized to keep the historical version unique.
--
-- This migration only changes authorization, policy, and workflow guards. It
-- does not rewrite invoices, memberships, or other production records.

begin;

-- Normalize legacy Invoice/Suite permission names before the shared evaluator
-- applies the Invoice role ceiling. Unknown permissions remain available to
-- the owning Suite product; these aliases are the Invoice-owned paths.
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
    when 'supplier_bill.view' then 'expense.view_all'
    when 'supplier_bill.approve' then 'expense.approve'
    when 'supplier_bill.post' then 'expense.manage'
    when 'supplier_payment.view' then 'payment.view'
    when 'supplier_payment.record' then 'payment.create'
    when 'supplier_payment.reverse' then 'payment.refund'
    when 'document.archive.view' then 'audit.view'
    when 'document.archive.create' then 'audit.view'
    when 'financial_document.audit.view' then 'audit.view'
    when 'audit.read' then 'audit.view'
    when 'pos.complete' then 'invoice.issue'
    when 'pos.terminal.use' then 'invoice.issue'
    when 'pos.order.hold' then 'invoice.create'
    when 'pos.order.cancel' then 'invoice.void'
    when 'pos.receipt.reprint' then 'financial.export'
    when 'pos.shift.view' then 'payment.view'
    when 'pos.shift.open' then 'payment.create'
    when 'pos.shift.close' then 'payment.create'
    when 'pos.shift.reopen' then 'payment.refund'
    when 'pos.shift.cash_movement' then 'payment.create'
    when 'products.view' then 'product.view'
    when 'products.manage' then 'product.edit'
    when 'prices.override' then 'product.change_price'
    when 'discounts.override' then 'product.change_price'
    when 'inventory.manage' then 'inventory.adjust'
    when 'sales_customer.manage' then 'customer.edit'
    when 'customer.manage' then 'customer.edit'
    when 'customer.read' then 'customer.view'
    when 'customer.view' then 'customer.view'
    when 'customer.view_all' then 'customer.view_all'
    when 'customer.create' then 'customer.create'
    when 'customer.edit' then 'customer.edit'
    when 'customer.delete' then 'customer.delete'
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
    when 'tax.report.view' then 'reports.tax'
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

-- Profiles contain the tenant company settings used by documents. A user may
-- edit their personal name/preferences, but cannot turn an ordinary profile
-- update into a company, tax, bank, invoice, integration, or security write.
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
     or private.rbac_is_platform_admin() then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.company_id is distinct from old.company_id then
    raise exception 'Role and company membership are managed by protected workflows'
      using errcode = '42501';
  end if;
  if new.active_company_id is not null
     and not public.can_access_company(new.active_company_id) then
    raise exception 'You cannot select a company without an active membership'
      using errcode = '42501';
  end if;

  if target_company_id is not null
     and (new.company_name is distinct from old.company_name
       or new.email is distinct from old.email
       or new.phone is distinct from old.phone
       or new.address is distinct from old.address
       or new.website is distinct from old.website)
     and not private.has_company_permission(target_company_id, 'settings.company') then
    raise exception 'Company settings permission is required' using errcode = '42501';
  end if;
  if target_company_id is not null
     and (new.tax_rate is distinct from old.tax_rate
       or new.tax_name is distinct from old.tax_name
       or new.tax_id is distinct from old.tax_id)
     and not private.has_company_permission(target_company_id, 'settings.tax') then
    raise exception 'Tax settings permission is required' using errcode = '42501';
  end if;
  if target_company_id is not null
     and (new.logo_url is distinct from old.logo_url
       or new.signature_url is distinct from old.signature_url
       or new.stamp_url is distinct from old.stamp_url
       or new.template_config is distinct from old.template_config
       or new.primary_color is distinct from old.primary_color
       or new.is_grayscale is distinct from old.is_grayscale
       or new.invoice_language is distinct from old.invoice_language
       or new.terms_conditions is distinct from old.terms_conditions
       or new.default_client_discount is distinct from old.default_client_discount)
     and not private.has_company_permission(target_company_id, 'settings.invoice') then
    raise exception 'Invoice document settings permission is required' using errcode = '42501';
  end if;
  if target_company_id is not null
     and (new.bank_name is distinct from old.bank_name
       or new.bank_account is distinct from old.bank_account
       or new.bank_iban is distinct from old.bank_iban
       or new.bank_swift is distinct from old.bank_swift
       or new.payment_link_stripe is distinct from old.payment_link_stripe
       or new.payment_link_paypal is distinct from old.payment_link_paypal)
     and not private.has_company_permission(target_company_id, 'settings.bank') then
    raise exception 'Bank settings permission is required' using errcode = '42501';
  end if;
  if target_company_id is not null
     and (new.stripe_api_key is distinct from old.stripe_api_key
       or new.stripe_account_id is distinct from old.stripe_account_id
       or new.stripe_last_synced is distinct from old.stripe_last_synced
       or new.stripe_access_token is distinct from old.stripe_access_token
       or new.stripe_refresh_token is distinct from old.stripe_refresh_token
       or new.stripe_connected_at is distinct from old.stripe_connected_at
       or new.stripe_livemode is distinct from old.stripe_livemode)
     and not private.has_company_permission(target_company_id, 'settings.integrations') then
    raise exception 'Integration settings permission is required' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Product stock is an inventory adjustment unless it is the automatic stock
-- decrement performed as part of an invoice issue workflow.
create or replace function private.rbac_product_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.company_id is not null
     and (new.unit_price is distinct from old.unit_price
       or new.supplier_unit_price is distinct from old.supplier_unit_price
       or new.supplier_unit_price_after_discount is distinct from old.supplier_unit_price_after_discount)
     and not private.has_company_permission(new.company_id, 'product.change_price') then
    raise exception 'Product price permission is required' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE'
     and new.company_id is not null
     and (new.stock_quantity is distinct from old.stock_quantity
       or new.track_stock is distinct from old.track_stock
       or new.low_stock_threshold is distinct from old.low_stock_threshold)
     and not private.has_company_permission(new.company_id, 'inventory.adjust')
     and not private.has_company_permission(new.company_id, 'invoice.issue') then
    raise exception 'Inventory adjustment permission is required' using errcode = '42501';
  end if;
  if tg_op = 'DELETE'
     and old.company_id is not null
     and not private.has_company_permission(old.company_id, 'product.delete') then
    raise exception 'Product delete permission is required' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- Supplier data is tenant and scope protected. Employees can only see their
-- own supplier records; Manager/Admin users with expense.view_all can see all.
drop policy if exists supplier_bills_company_select on public.supplier_bills;
drop policy if exists rbac_supplier_bills_select on public.supplier_bills;
create policy rbac_supplier_bills_select on public.supplier_bills
for select to authenticated
using (
  (user_id = (select auth.uid()) and private.has_company_permission(company_id, 'expense.view_own'))
  or private.has_company_permission(company_id, 'expense.view_all')
);

drop policy if exists vendors_company_select on public.vendors;
drop policy if exists rbac_vendors_select on public.vendors;
create policy rbac_vendors_select on public.vendors
for select to authenticated
using (
  (user_id = (select auth.uid()) and private.has_company_permission(company_id, 'expense.view_own'))
  or private.has_company_permission(company_id, 'expense.view_all')
);

drop policy if exists vendor_payments_company_select on public.vendor_payments;
drop policy if exists rbac_vendor_payments_select on public.vendor_payments;
create policy rbac_vendor_payments_select on public.vendor_payments
for select to authenticated
using (
  private.rbac_can_read_resource(company_id, 'payment', user_id, user_id, 'payment.view')
);

-- The purchase book is a financial/tax report, not a raw tenant-wide view.
create or replace view public.kosovo_purchase_book
with (security_invoker = true)
as
select report.*
from (
  select bill.company_id,
    date_trunc('month'::text, coalesce(bill.issue_date, bill.posting_date, current_date)::timestamp with time zone)::date as period_start,
    bill.id as supplier_bill_id,
    bill.bill_number,
    coalesce(bill.issue_date, bill.posting_date) as bill_date,
    bill.vendor_id,
    vendor.name as supplier_name,
    coalesce(vendor.fiscal_number, vendor.vat_number, vendor.tax_id) as supplier_fiscal_number,
    coalesce(nullif(bill.tax_reporting_category, ''), 'domestic_purchase') as vat_classification,
    round(coalesce(bill.total_amount, 0) - coalesce(bill.tax_amount, 0), 4)
      * case when bill.credit_of_bill_id is not null then -1 else 1 end as taxable_base,
    round(coalesce(bill.tax_amount, 0), 4)
      * case when bill.credit_of_bill_id is not null then -1 else 1 end as input_vat,
    round(coalesce(bill.input_vat_recoverable_amount, 0), 4)
      * case when bill.credit_of_bill_id is not null then -1 else 1 end as recoverable_vat,
    round(coalesce(bill.input_vat_non_recoverable_amount, 0), 4)
      * case when bill.credit_of_bill_id is not null then -1 else 1 end as nonrecoverable_vat,
    round(coalesce(bill.total_amount, 0), 4)
      * case when bill.credit_of_bill_id is not null then -1 else 1 end as total_amount,
    bill.is_import,
    bill.reverse_charge,
    bill.credit_of_bill_id is not null as is_credit_note,
    bill.posting_journal_entry_id as source_journal_entry_id
  from public.supplier_bills bill
  left join public.vendors vendor on vendor.id = bill.vendor_id
  where bill.accounting_state = 'posted'
    and coalesce(bill.status, '') not in ('cancelled', 'reversed')
) report
where private.has_company_permission(report.company_id, 'reports.tax');

grant select on public.kosovo_purchase_book to authenticated;

-- Conversion is a SECURITY DEFINER mutation, so its source scope and target
-- permission must be checked before the idempotent-return branch.
create or replace function public.convert_commercial_document(
  p_source_document_id uuid,
  p_target_document_type text,
  p_idempotency_key uuid default gen_random_uuid()
)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_row public.invoices;
  target_row public.invoices;
  source_type text;
  target_type text := upper(trim(coalesce(p_target_document_type, '')));
  target_legacy_type text;
  target_subtype text;
  link_type text;
  target_number text;
  target_id uuid;
  source_permission text;
  target_permission text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into source_row from public.invoices where id = p_source_document_id for update;
  if not found then raise exception 'Source commercial document not found' using errcode = 'P0002'; end if;

  source_type := upper(coalesce(source_row.commercial_document_type, ''));
  if target_type not in ('QUOTE','PROFORMA','SALES_ORDER','DELIVERY_NOTE','INVOICE','ADVANCE_INVOICE','FINAL_INVOICE','CREDIT_NOTE','DEBIT_NOTE','SIMPLIFIED_INVOICE','FISCAL_RECEIPT','BAD_DEBT_INVOICE') then
    raise exception 'Unsupported target commercial document type %', target_type using errcode = '22023';
  end if;
  if not ((source_type = 'QUOTE' and target_type in ('SALES_ORDER','INVOICE'))
       or (source_type = 'PROFORMA' and target_type in ('SALES_ORDER','INVOICE','ADVANCE_INVOICE'))
       or (source_type = 'SALES_ORDER' and target_type in ('DELIVERY_NOTE','INVOICE'))
       or (source_type = 'DELIVERY_NOTE' and target_type = 'INVOICE')
       or (source_type = 'ADVANCE_INVOICE' and target_type = 'FINAL_INVOICE')
       or (source_type in ('INVOICE','FINAL_INVOICE','SIMPLIFIED_INVOICE','FISCAL_RECEIPT','BAD_DEBT_INVOICE') and target_type in ('CREDIT_NOTE','DEBIT_NOTE'))) then
    raise exception 'Conversion from % to % is not supported', source_type, target_type using errcode = '22023';
  end if;

  target_permission := case
    when target_type = 'QUOTE' then 'offer.create'
    when target_type = 'PROFORMA' then 'proforma.create'
    when target_type = 'SALES_ORDER' then 'order.create'
    when target_type = 'DELIVERY_NOTE' then 'delivery_note.create'
    when target_type = 'CREDIT_NOTE' then 'invoice.credit'
    when target_type = 'DEBIT_NOTE' then 'invoice.debit'
    else 'invoice.create'
  end;
  source_permission := case
    when target_type = 'CREDIT_NOTE' then 'invoice.credit'
    when target_type = 'DEBIT_NOTE' then 'invoice.debit'
    else 'invoice.edit'
  end;
  if not private.rbac_can_read_resource(source_row.company_id, 'invoice', source_row.user_id, source_row.assigned_user_id, source_permission)
     or not private.has_company_permission(source_row.company_id, target_permission) then
    raise exception 'Insufficient permission or data scope to convert this document' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(source_row.id::text || ':' || target_type, 0));
  select target.id into target_id
  from public.document_source_links link
  join public.invoices target on target.id = link.target_id
  where link.company_id = source_row.company_id
    and link.source_type = 'commercial_document'
    and link.source_id = source_row.id
    and link.target_type = 'commercial_document'
    and link.metadata ->> 'target_document_type' = target_type
  limit 1;
  if target_id is not null then
    select * into target_row from public.invoices where id = target_id;
    return target_row;
  end if;

  target_number := public.reserve_invoice_number(source_row.company_id, lower(target_type), coalesce(source_row.issue_date, current_date));
  target_legacy_type := case when target_type = 'QUOTE' then 'offer' when target_type = 'PROFORMA' then 'proforma' when target_type = 'SALES_ORDER' then 'offer' else 'invoice' end;
  target_subtype := case target_type
    when 'QUOTE' then 'offer'
    when 'PROFORMA' then 'pro_invoice'
    when 'SALES_ORDER' then 'order'
    when 'DELIVERY_NOTE' then 'delivery_note'
    when 'ADVANCE_INVOICE' then 'advance_invoice'
    when 'FINAL_INVOICE' then 'final_invoice'
    when 'CREDIT_NOTE' then 'credit_note'
    when 'DEBIT_NOTE' then 'debit_note'
    when 'SIMPLIFIED_INVOICE' then 'simplified_invoice'
    when 'FISCAL_RECEIPT' then 'fiscal_receipt'
    when 'BAD_DEBT_INVOICE' then 'bad_debt_invoice'
    else 'regular'
  end;
  link_type := case
    when source_type = 'QUOTE' then 'quotation_conversion'
    when source_type = 'PROFORMA' and target_type = 'ADVANCE_INVOICE' then 'proforma_to_advance'
    when source_type = 'PROFORMA' then 'proforma_conversion'
    when source_type = 'SALES_ORDER' and target_type = 'DELIVERY_NOTE' then 'order_conversion'
    when source_type = 'DELIVERY_NOTE' then 'delivery_to_invoice'
    when source_type = 'ADVANCE_INVOICE' then 'advance_finalization'
    when target_type = 'CREDIT_NOTE' then 'credit_note'
    when target_type = 'DEBIT_NOTE' then 'debit_note'
    else 'adjustment'
  end;

  insert into public.invoices (
    user_id, company_id, client_id, invoice_number, issue_date, due_date, status,
    discount_amount, discount_percent, tax_amount, total_amount, notes, template_id,
    type, subtype, payment_method, amount_received, change_amount, currency, exchange_rate,
    source_document_type, source_document_id, credit_of_invoice_id, original_invoice_id,
    accounting_state, commercial_document_type, commercial_status, accounting_status,
    vat_status, inventory_status, payment_status, fiscalization_status, supply_date,
    order_date, delivery_date, valid_until, customer_po_number, delivery_address,
    shipping_address, payment_terms, delivery_terms, show_prices_on_delivery_note,
    advance_applied_amount, idempotency_key
  ) values (
    coalesce((select auth.uid()), source_row.user_id), source_row.company_id, source_row.client_id,
    target_number, coalesce(source_row.issue_date, current_date), source_row.due_date, 'draft',
    source_row.discount_amount, source_row.discount_percent, source_row.tax_amount, source_row.total_amount,
    source_row.notes, source_row.template_id, target_legacy_type, target_subtype, 'cash', 0, 0,
    source_row.currency, source_row.exchange_rate, source_type, source_row.id,
    case when target_type = 'CREDIT_NOTE' then source_row.id else null end,
    case when target_type in ('DEBIT_NOTE','BAD_DEBT_INVOICE') then source_row.id else null end,
    case when target_type in ('QUOTE','PROFORMA','SALES_ORDER','DELIVERY_NOTE') then 'legacy' else 'ready_for_posting' end,
    target_type, 'DRAFT', case when target_type in ('QUOTE','PROFORMA','SALES_ORDER','DELIVERY_NOTE') then 'NOT_APPLICABLE' else 'READY_TO_POST' end,
    case when target_type in ('QUOTE','PROFORMA','SALES_ORDER','DELIVERY_NOTE') then 'NOT_APPLICABLE' else 'NOT_EVALUATED' end,
    case when target_type in ('SALES_ORDER','DELIVERY_NOTE') then 'POLICY_DEPENDENT' else 'NOT_APPLICABLE' end,
    case when target_type in ('QUOTE','PROFORMA','SALES_ORDER','DELIVERY_NOTE') then 'NOT_APPLICABLE' else 'UNPAID' end,
    'NOT_REQUIRED', source_row.supply_date, source_row.order_date, source_row.delivery_date, source_row.valid_until,
    source_row.customer_po_number, source_row.delivery_address, source_row.shipping_address,
    source_row.payment_terms, source_row.delivery_terms, source_row.show_prices_on_delivery_note,
    0, p_idempotency_key
  ) returning * into target_row;

  insert into public.invoice_items (
    invoice_id, product_id, description, quantity, unit_price, tax_rate, amount, unit,
    revenue_account_id, tax_code, cost_centre_id, project_id, source_item_id, credited_quantity
  )
  select target_row.id, item.product_id, item.description, item.quantity, item.unit_price,
    item.tax_rate, item.amount, item.unit, item.revenue_account_id, item.tax_code,
    item.cost_centre_id, item.project_id, item.id, 0
  from public.invoice_items item
  where item.invoice_id = source_row.id;

  insert into public.document_source_links (
    company_id, source_type, source_id, target_type, target_id, link_type, amount, metadata, created_by
  ) values (
    source_row.company_id, 'commercial_document', source_row.id, 'commercial_document', target_row.id,
    link_type, source_row.total_amount,
    jsonb_build_object('target_document_type', target_type, 'idempotency_key', p_idempotency_key),
    (select auth.uid())
  ) on conflict do nothing;

  perform private.insert_commercial_document_event(
    source_row.company_id, source_row.id, 'converted', source_row.commercial_status,
    'CONVERTED', jsonb_build_object('target_document_id', target_row.id, 'target_document_type', target_type),
    clock_timestamp(), (select auth.uid())
  );
  update public.invoices set commercial_status = 'CONVERTED' where id = source_row.id;
  return target_row;
end;
$$;

revoke all on function public.convert_commercial_document(uuid, text, uuid) from public, anon;
grant execute on function public.convert_commercial_document(uuid, text, uuid) to authenticated, service_role;

-- These stock workflows already validate the signed-in user and are protected
-- by the invoice/product triggers. Anonymous execution is never meaningful.
revoke all on function public.create_stock_tracked_invoice(jsonb, jsonb, uuid) from anon;
revoke all on function public.create_stock_tracked_invoice_with_signature(jsonb, jsonb, uuid, jsonb) from anon;

-- Remove anonymous execution from sensitive Invoice mutations while retaining
-- authenticated clients and trusted service-role workers.
do $$
declare
  function_row record;
begin
  for function_row in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(array[
        'allocate_customer_payment', 'archive_document', 'complete_pos_sale',
        'create_inventory_count', 'post_credit_note', 'post_pos_invoice',
        'post_sales_invoice', 'prepare_sales_invoice_for_posting',
        'record_customer_payment', 'unallocate_customer_payment'
      ])
  loop
    execute format('revoke all on function %s from anon', function_row.signature);
  end loop;
end;
$$;

commit;
