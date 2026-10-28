-- OperiX Invoice RBAC financial and document-scope follow-up.
--
-- This migration closes legacy read predicates that only checked tenant
-- membership or a broad document permission. It does not rewrite business
-- data and is safe to apply to existing tenants.

begin;

-- Keep legacy financial permission names on the canonical Invoice permission
-- ceiling. This prevents an old Suite role grant from bypassing the new
-- payment, bank, refund, and financial-scope permissions.
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
    when 'customer_payment.edit' then 'payment.create'
    when 'customer_payment.allocate' then 'payment.create'
    when 'customer_payment.reverse' then 'payment.refund'
    when 'customer_payment.void' then 'payment.refund'
    when 'customer_credit.manage' then 'payment.refund'
    when 'customer_refund.create' then 'payment.refund'
    when 'other_income.view' then 'payment.view'
    when 'other_income.create' then 'payment.create'
    when 'other_income.edit' then 'payment.refund'
    when 'cash_account.view' then 'settings.bank'
    when 'cash_account.manage' then 'settings.bank'
    when 'bank_account.view' then 'settings.bank'
    when 'bank.reconcile' then 'settings.bank'
    when 'journal.create' then 'accounting_period.close'
    when 'journal.post' then 'accounting_period.close'
    when 'journal.reverse' then 'accounting_period.reopen'
    when 'cash_transaction.post' then 'payment.create'
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
    when 'customer.balance.view' then 'customer.view_all'
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

-- Bank account and fund reads must be permissioned, not merely membership
-- based. Managers can receive settings.bank explicitly; Employees cannot read
-- company bank configuration or cash balances by default.
create or replace function private.can_access_company_bank_account(p_bank_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.company_bank_accounts account
      where account.id = p_bank_account_id
        and (
          private.has_company_permission(account.company_id, 'settings.bank')
          or exists (
            select 1
            from public.company_bank_account_shares share
            where share.company_bank_account_id = account.id
              and share.is_active
              and private.has_company_permission(share.shared_company_id, 'settings.bank')
          )
        )
    );
$$;

create or replace function private.can_view_fund_account(p_fund_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_fund_accounts fund
    where fund.id = p_fund_account_id
      and (
        private.has_company_permission(fund.company_id, 'payment.view')
        or private.has_company_permission(fund.company_id, 'settings.bank')
        or (
          fund.company_bank_account_id is not null
          and private.can_access_company_bank_account(fund.company_bank_account_id)
        )
      )
  );
$$;

drop policy if exists company_bank_accounts_member_select on public.company_bank_accounts;
drop policy if exists company_bank_accounts_permission_delete on public.company_bank_accounts;
drop policy if exists company_bank_accounts_permission_insert on public.company_bank_accounts;
drop policy if exists company_bank_accounts_permission_update on public.company_bank_accounts;
drop policy if exists rbac_company_bank_accounts_select on public.company_bank_accounts;
drop policy if exists rbac_company_bank_accounts_insert on public.company_bank_accounts;
drop policy if exists rbac_company_bank_accounts_update on public.company_bank_accounts;
drop policy if exists rbac_company_bank_accounts_delete on public.company_bank_accounts;
create policy rbac_company_bank_accounts_select on public.company_bank_accounts
for select to authenticated using (private.can_access_company_bank_account(id));
create policy rbac_company_bank_accounts_insert on public.company_bank_accounts
for insert to authenticated with check (private.has_company_permission(company_id, 'settings.bank'));
create policy rbac_company_bank_accounts_update on public.company_bank_accounts
for update to authenticated using (private.has_company_permission(company_id, 'settings.bank'))
with check (private.has_company_permission(company_id, 'settings.bank'));
create policy rbac_company_bank_accounts_delete on public.company_bank_accounts
for delete to authenticated using (private.has_company_permission(company_id, 'settings.bank'));

drop policy if exists company_fund_transactions_member_select on public.company_fund_transactions;
drop policy if exists rbac_company_fund_transactions_select on public.company_fund_transactions;
create policy rbac_company_fund_transactions_select on public.company_fund_transactions
for select to authenticated using (
  private.has_company_permission(company_id, 'payment.view')
  or (source_company_id is not null and private.has_company_permission(source_company_id, 'payment.view'))
  or private.can_view_fund_account(fund_account_id)
);

-- Scoped reads for commercial-document metadata and links. The underlying
-- invoice RLS already protects invoice rows; these related tables must repeat
-- the same owner/assigned/ALL decision because they are independently queryable.
drop policy if exists commercial_document_events_select on public.commercial_document_events;
drop policy if exists rbac_commercial_document_events_select on public.commercial_document_events;
create policy rbac_commercial_document_events_select on public.commercial_document_events
for select to authenticated using (
  exists (
    select 1
    from public.invoices invoice
    where invoice.id = commercial_document_events.document_id
      and invoice.company_id = commercial_document_events.company_id
      and private.rbac_can_read_resource(
        invoice.company_id, 'invoice', invoice.user_id, invoice.assigned_user_id, 'invoice.view'
      )
  )
);

drop policy if exists document_source_links_select on public.document_source_links;
drop policy if exists rbac_document_source_links_select on public.document_source_links;
create policy rbac_document_source_links_select on public.document_source_links
for select to authenticated using (
  (
    source_type = 'commercial_document'
    and target_type = 'commercial_document'
    and exists (
      select 1
      from public.invoices source_invoice
      where source_invoice.id = document_source_links.source_id
        and source_invoice.company_id = document_source_links.company_id
        and private.rbac_can_read_resource(
          source_invoice.company_id, 'invoice', source_invoice.user_id,
          source_invoice.assigned_user_id, 'invoice.view'
        )
    )
    and exists (
      select 1
      from public.invoices target_invoice
      where target_invoice.id = document_source_links.target_id
        and target_invoice.company_id = document_source_links.company_id
        and private.rbac_can_read_resource(
          target_invoice.company_id, 'invoice', target_invoice.user_id,
          target_invoice.assigned_user_id, 'invoice.view'
        )
    )
  )
  or (
    source_type = 'supplier_bill'
    and target_type = 'supplier_bill'
    and exists (
      select 1 from public.supplier_bills source_bill
      where source_bill.id = document_source_links.source_id
        and source_bill.company_id = document_source_links.company_id
        and (
          (source_bill.user_id = (select auth.uid()) and private.has_company_permission(source_bill.company_id, 'expense.view_own'))
          or private.has_company_permission(source_bill.company_id, 'expense.view_all')
        )
    )
    and exists (
      select 1 from public.supplier_bills target_bill
      where target_bill.id = document_source_links.target_id
        and target_bill.company_id = document_source_links.company_id
        and (
          (target_bill.user_id = (select auth.uid()) and private.has_company_permission(target_bill.company_id, 'expense.view_own'))
          or private.has_company_permission(target_bill.company_id, 'expense.view_all')
        )
    )
  )
);

drop policy if exists commercial_document_advance_allocations_select on public.commercial_document_advance_allocations;
drop policy if exists rbac_commercial_document_advance_allocations_select on public.commercial_document_advance_allocations;
create policy rbac_commercial_document_advance_allocations_select
on public.commercial_document_advance_allocations for select to authenticated using (
  exists (
    select 1 from public.invoices advance_invoice
    where advance_invoice.id = commercial_document_advance_allocations.advance_invoice_id
      and advance_invoice.company_id = commercial_document_advance_allocations.company_id
      and private.rbac_can_read_resource(
        advance_invoice.company_id, 'invoice', advance_invoice.user_id,
        advance_invoice.assigned_user_id, 'invoice.view'
      )
  )
  and exists (
    select 1 from public.invoices final_invoice
    where final_invoice.id = commercial_document_advance_allocations.final_invoice_id
      and final_invoice.company_id = commercial_document_advance_allocations.company_id
      and private.rbac_can_read_resource(
        final_invoice.company_id, 'invoice', final_invoice.user_id,
        final_invoice.assigned_user_id, 'invoice.view'
      )
  )
);

drop policy if exists commercial_document_payment_links_select on public.commercial_document_payment_links;
drop policy if exists rbac_commercial_document_payment_links_select on public.commercial_document_payment_links;
create policy rbac_commercial_document_payment_links_select
on public.commercial_document_payment_links for select to authenticated using (
  exists (
    select 1 from public.invoices invoice
    where invoice.id = commercial_document_payment_links.document_id
      and invoice.company_id = commercial_document_payment_links.company_id
      and private.rbac_can_read_resource(
        invoice.company_id, 'invoice', invoice.user_id, invoice.assigned_user_id, 'invoice.view'
      )
  )
  and exists (
    select 1 from public.payments payment
    where payment.id = commercial_document_payment_links.payment_id
      and payment.company_id = commercial_document_payment_links.company_id
      and private.rbac_can_read_resource(
        payment.company_id, 'payment', payment.user_id, payment.assigned_user_id, 'payment.view'
      )
  )
);

-- Commercial document settings are company configuration. invoice.edit is a
-- document-writing permission and must not grant access to this table.
do $$
begin
  if to_regclass('public.commercial_document_settings') is not null then
    drop policy if exists commercial_document_settings_delete on public.commercial_document_settings;
    drop policy if exists commercial_document_settings_edit_insert on public.commercial_document_settings;
    drop policy if exists commercial_document_settings_edit_update on public.commercial_document_settings;
    drop policy if exists commercial_document_settings_select on public.commercial_document_settings;
    drop policy if exists rbac_commercial_document_settings_select on public.commercial_document_settings;
    drop policy if exists rbac_commercial_document_settings_insert on public.commercial_document_settings;
    drop policy if exists rbac_commercial_document_settings_update on public.commercial_document_settings;
    drop policy if exists rbac_commercial_document_settings_delete on public.commercial_document_settings;
    create policy rbac_commercial_document_settings_select on public.commercial_document_settings
    for select to authenticated using (private.has_company_permission(company_id, 'settings.invoice'));
    create policy rbac_commercial_document_settings_insert on public.commercial_document_settings
    for insert to authenticated with check (private.has_company_permission(company_id, 'settings.invoice'));
    create policy rbac_commercial_document_settings_update on public.commercial_document_settings
    for update to authenticated using (private.has_company_permission(company_id, 'settings.invoice'))
    with check (private.has_company_permission(company_id, 'settings.invoice'));
    create policy rbac_commercial_document_settings_delete on public.commercial_document_settings
    for delete to authenticated using (private.has_company_permission(company_id, 'settings.invoice'));
  end if;
end;
$$;

-- POS order rows may contain totals and customer information. Keep the order
-- scope aligned with invoice OWN/ASSIGNED/ALL; POS payment rows additionally
-- require payment.view.
do $$
begin
  if to_regclass('public.pos_orders') is not null then
    drop policy if exists pos_orders_member_select on public.pos_orders;
    drop policy if exists rbac_pos_orders_select on public.pos_orders;
    create policy rbac_pos_orders_select on public.pos_orders for select to authenticated using (
      private.rbac_can_read_resource(company_id, 'invoice', created_by, created_by, 'invoice.view')
    );
  end if;
  if to_regclass('public.pos_order_lines') is not null then
    drop policy if exists pos_order_lines_member_select on public.pos_order_lines;
    drop policy if exists rbac_pos_order_lines_select on public.pos_order_lines;
    create policy rbac_pos_order_lines_select on public.pos_order_lines for select to authenticated using (
      exists (
        select 1 from public.pos_orders pos_order
        where pos_order.id = pos_order_lines.pos_order_id
          and private.rbac_can_read_resource(pos_order.company_id, 'invoice', pos_order.created_by, pos_order.created_by, 'invoice.view')
      )
    );
  end if;
  if to_regclass('public.pos_order_events') is not null then
    drop policy if exists pos_order_events_member_select on public.pos_order_events;
    drop policy if exists rbac_pos_order_events_select on public.pos_order_events;
    create policy rbac_pos_order_events_select on public.pos_order_events for select to authenticated using (
      exists (
        select 1 from public.pos_orders pos_order
        where pos_order.id = pos_order_events.pos_order_id
          and private.rbac_can_read_resource(pos_order.company_id, 'invoice', pos_order.created_by, pos_order.created_by, 'invoice.view')
      )
    );
  end if;
  if to_regclass('public.pos_command_idempotency') is not null then
    drop policy if exists pos_command_idempotency_member_select on public.pos_command_idempotency;
    drop policy if exists rbac_pos_command_idempotency_select on public.pos_command_idempotency;
    create policy rbac_pos_command_idempotency_select on public.pos_command_idempotency for select to authenticated using (
      private.has_company_permission(company_id, 'audit.view')
    );
  end if;
  if to_regclass('public.pos_payments') is not null then
    drop policy if exists pos_payments_member_select on public.pos_payments;
    drop policy if exists rbac_pos_payments_select on public.pos_payments;
    create policy rbac_pos_payments_select on public.pos_payments for select to authenticated using (
      private.has_company_permission(company_id, 'payment.view')
      and exists (
        select 1 from public.pos_orders pos_order
        where pos_order.id = pos_payments.pos_order_id
          and private.rbac_can_read_resource(pos_order.company_id, 'invoice', pos_order.created_by, pos_order.created_by, 'invoice.view')
      )
    );
  end if;
  if to_regclass('public.receipt_render_snapshots') is not null then
    drop policy if exists receipt_render_snapshots_member_select on public.receipt_render_snapshots;
    drop policy if exists rbac_receipt_render_snapshots_select on public.receipt_render_snapshots;
    create policy rbac_receipt_render_snapshots_select on public.receipt_render_snapshots for select to authenticated using (
      invoice_id is not null
      and exists (
        select 1 from public.invoices invoice
        where invoice.id = receipt_render_snapshots.invoice_id
          and invoice.company_id = receipt_render_snapshots.company_id
          and private.rbac_can_read_resource(invoice.company_id, 'invoice', invoice.user_id, invoice.assigned_user_id, 'invoice.view')
      )
    );
  end if;
end;
$$;

-- Supplier bills and product-calculation imports contain financial cost data.
-- Their legacy SELECT policies accepted any company member after a primary
-- row was known, which bypassed OWN/ASSIGNED/ALL scope decisions.
do $$
begin
  if to_regclass('public.supplier_bills') is not null then
    drop policy if exists rbac_supplier_bills_select on public.supplier_bills;
    drop policy if exists rbac_supplier_bills_scoped_select on public.supplier_bills;
    create policy rbac_supplier_bills_scoped_select on public.supplier_bills
      for select to authenticated using (
        (private.has_company_permission(company_id, 'expense.view_own')
         or private.has_company_permission(company_id, 'expense.view_all'))
        and private.rbac_scope_allows(company_id, 'expense', user_id, user_id)
      );
  end if;

  if to_regclass('public.vendors') is not null then
    drop policy if exists rbac_vendors_select on public.vendors;
    drop policy if exists rbac_vendors_scoped_select on public.vendors;
    create policy rbac_vendors_scoped_select on public.vendors
      for select to authenticated using (
        (private.has_company_permission(company_id, 'expense.view_own')
         or private.has_company_permission(company_id, 'expense.view_all'))
        and private.rbac_scope_allows(company_id, 'expense', user_id, user_id)
      );
  end if;

  if to_regclass('public.supplier_bill_items') is not null then
    drop policy if exists supplier_bill_items_company_select on public.supplier_bill_items;
    drop policy if exists rbac_supplier_bill_items_scoped_select on public.supplier_bill_items;
    create policy rbac_supplier_bill_items_scoped_select on public.supplier_bill_items
      for select to authenticated using (
        exists (
          select 1
          from public.supplier_bills bill
          where bill.id = supplier_bill_items.bill_id
            and (private.has_company_permission(bill.company_id, 'expense.view_own')
                 or private.has_company_permission(bill.company_id, 'expense.view_all'))
            and private.rbac_scope_allows(bill.company_id, 'expense', bill.user_id, bill.user_id)
        )
      );
  end if;

  if to_regclass('public.product_import_batches') is not null then
    drop policy if exists product_import_batches_select on public.product_import_batches;
    drop policy if exists rbac_product_import_batches_scoped_select on public.product_import_batches;
    create policy rbac_product_import_batches_scoped_select on public.product_import_batches
      for select to authenticated using (
        private.rbac_can_read_resource(company_id, 'product', user_id, user_id, 'product.view')
      );
  end if;

  if to_regclass('public.product_import_items') is not null then
    drop policy if exists product_import_items_select on public.product_import_items;
    drop policy if exists rbac_product_import_items_scoped_select on public.product_import_items;
    create policy rbac_product_import_items_scoped_select on public.product_import_items
      for select to authenticated using (
        private.rbac_can_read_resource(company_id, 'product', user_id, user_id, 'product.view')
      );
  end if;
end;
$$;

-- UPDATE ... WITH CHECK is evaluated against the proposed row.  Keep that
-- predicate scope-aware as well, so a caller cannot use an allowed source
-- row to move invoice data or line items onto another employee's record.
drop policy if exists rbac_invoices_update on public.invoices;
create policy rbac_invoices_update on public.invoices
  for update to authenticated
  using (
    private.rbac_can_read_resource(company_id, 'invoice', user_id, assigned_user_id, 'invoice.edit')
    and upper(coalesce(commercial_status, status::text, 'DRAFT')) = any (array['DRAFT','SENT','VIEWED'])
  )
  with check (
    company_id is not null
    and private.rbac_can_read_resource(company_id, 'invoice', user_id, assigned_user_id, 'invoice.edit')
    and upper(coalesce(commercial_status, status::text, 'DRAFT')) = any (array['DRAFT','SENT','VIEWED'])
  );

drop policy if exists rbac_invoice_items_delete on public.invoice_items;
create policy rbac_invoice_items_delete on public.invoice_items
  for delete to authenticated using (
    exists (
      select 1
      from public.invoices invoice
      where invoice.id = invoice_items.invoice_id
        and private.rbac_can_read_resource(invoice.company_id, 'invoice', invoice.user_id, invoice.assigned_user_id, 'invoice.delete_draft')
        and upper(coalesce(invoice.commercial_status, invoice.status::text, 'DRAFT')) = 'DRAFT'
    )
  );

drop policy if exists rbac_invoice_items_update on public.invoice_items;
create policy rbac_invoice_items_update on public.invoice_items
  for update to authenticated
  using (
    exists (
      select 1
      from public.invoices invoice
      where invoice.id = invoice_items.invoice_id
        and private.rbac_can_read_resource(invoice.company_id, 'invoice', invoice.user_id, invoice.assigned_user_id, 'invoice.edit')
        and upper(coalesce(invoice.commercial_status, invoice.status::text, 'DRAFT')) = any (array['DRAFT','SENT','VIEWED'])
    )
  )
  with check (
    exists (
      select 1
      from public.invoices invoice
      where invoice.id = invoice_items.invoice_id
        and private.rbac_can_read_resource(invoice.company_id, 'invoice', invoice.user_id, invoice.assigned_user_id, 'invoice.edit')
        and upper(coalesce(invoice.commercial_status, invoice.status::text, 'DRAFT')) = any (array['DRAFT','SENT','VIEWED'])
    )
  );

-- Employees may edit their own draft invoices. Finalized/legal records remain
-- immutable and all issue/void transitions still pass through rbac_invoice_guard.
create or replace function private.prevent_employee_invoice_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_status text := upper(coalesce(old.commercial_status, old.status::text, 'DRAFT'));
begin
  if old.company_id is not null
     and public.get_my_company_role(old.company_id) = 'employee'
     and coalesce(current_setting('app.document_create_workflow', true), '') <> 'authorized'
     and coalesce(current_setting('app.invoice_auxiliary_workflow', true), '') <> 'authorized'
     and coalesce(current_setting('app.financial_workflow', true), '') <> 'authorized'
     and (
       old_status not in ('DRAFT', 'SENT', 'VIEWED')
       or not private.rbac_can_read_resource(
         old.company_id, 'invoice', old.user_id, old.assigned_user_id, 'invoice.edit'
       )
     ) then
    raise exception 'Employees may edit only invoices in their permitted draft scope'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Contracts were introduced before the Invoice RBAC model.  Their write
-- policies already required contracts.manage, but legacy SELECT and child
-- record policies still granted tenant-membership access.  Keep the existing
-- permission and make it the read/write boundary for the whole contract
-- aggregate as well.
insert into public.app_permissions(code, name, category, description, is_sensitive)
values ('contracts.manage', 'Manage contracts', 'documents', 'Create, view, edit, and remove company contracts and contract templates.', true)
on conflict (code) do update set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  is_sensitive = excluded.is_sensitive;

insert into public.app_role_permissions(role_id, permission_code)
select role.id, 'contracts.manage'
from public.app_roles role
where role.company_id is null
  and role.code = 'manager'
on conflict do nothing;

create or replace function public.reserve_contract_number(
  p_company_id uuid,
  p_prefix text default 'CTR',
  p_year integer default extract(year from now())::integer,
  p_manual_number text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  next_number integer;
  result text;
begin
  if auth.uid() is null
     or not private.has_company_permission(p_company_id, 'contracts.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if nullif(trim(p_manual_number), '') is not null then
    return trim(p_manual_number);
  end if;
  select coalesce(max((regexp_match(contract_number, '^' || regexp_replace(p_prefix, '[^A-Za-z0-9_-]', '', 'g') || '-' || p_year::text || '-([0-9]+)$'))[1]::integer), 0) + 1
    into next_number
  from public.contracts
  where company_id = p_company_id;
  result := regexp_replace(p_prefix, '[^A-Za-z0-9_-]', '', 'g') || '-' || p_year::text || '-' || lpad(next_number::text, 4, '0');
  return result;
end;
$$;

revoke all on function public.reserve_contract_number(uuid, text, integer, text) from public, anon;
grant execute on function public.reserve_contract_number(uuid, text, integer, text) to authenticated;

alter table public.contracts enable row level security;
drop policy if exists "Users can view their own contracts" on public.contracts;
drop policy if exists "Users can insert their own contracts" on public.contracts;
drop policy if exists "Users can update their own contracts" on public.contracts;
drop policy if exists "Users can delete their own contracts" on public.contracts;
drop policy if exists contracts_company_select on public.contracts;
drop policy if exists contracts_company_insert on public.contracts;
drop policy if exists contracts_company_update on public.contracts;
drop policy if exists contracts_company_delete on public.contracts;
drop policy if exists contracts_role_select on public.contracts;
drop policy if exists contracts_role_insert on public.contracts;
drop policy if exists contracts_role_update on public.contracts;
drop policy if exists contracts_role_delete on public.contracts;
drop policy if exists contracts_rbac_select on public.contracts;
drop policy if exists contracts_rbac_insert on public.contracts;
drop policy if exists contracts_rbac_update on public.contracts;
drop policy if exists contracts_rbac_delete on public.contracts;

create policy contracts_rbac_select on public.contracts
  for select to authenticated
  using (
    company_id is not null
    and private.has_company_permission(company_id, 'contracts.manage')
  );
create policy contracts_rbac_insert on public.contracts
  for insert to authenticated
  with check (
    company_id is not null
    and user_id = (select auth.uid())
    and private.has_company_permission(company_id, 'contracts.manage')
  );
create policy contracts_rbac_update on public.contracts
  for update to authenticated
  using (
    company_id is not null
    and private.has_company_permission(company_id, 'contracts.manage')
  )
  with check (
    company_id is not null
    and private.has_company_permission(company_id, 'contracts.manage')
  );
create policy contracts_rbac_delete on public.contracts
  for delete to authenticated
  using (
    company_id is not null
    and private.has_company_permission(company_id, 'contracts.manage')
  );

alter table public.contract_templates enable row level security;
drop policy if exists contract_templates_select on public.contract_templates;
drop policy if exists contract_templates_insert on public.contract_templates;
drop policy if exists contract_templates_update on public.contract_templates;
drop policy if exists contract_templates_delete on public.contract_templates;
drop policy if exists contract_templates_manage_insert on public.contract_templates;
drop policy if exists contract_templates_manage_update on public.contract_templates;
drop policy if exists contract_templates_manage_delete on public.contract_templates;
drop policy if exists "Users can view their own templates" on public.contract_templates;
drop policy if exists "Users can insert their own templates" on public.contract_templates;
drop policy if exists "Users can update their own templates" on public.contract_templates;
drop policy if exists "Users can delete their own templates" on public.contract_templates;

create policy contracts_templates_rbac_select on public.contract_templates
  for select to authenticated
  using (
    (company_id is not null and private.has_company_permission(company_id, 'contracts.manage'))
    or (company_id is null and user_id = (select auth.uid()) and private.has_unscoped_permission('contracts.manage'))
  );
create policy contracts_templates_rbac_insert on public.contract_templates
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      (company_id is not null and private.has_company_permission(company_id, 'contracts.manage'))
      or (company_id is null and private.has_unscoped_permission('contracts.manage'))
    )
  );
create policy contracts_templates_rbac_update on public.contract_templates
  for update to authenticated
  using (
    (company_id is not null and private.has_company_permission(company_id, 'contracts.manage'))
    or (company_id is null and user_id = (select auth.uid()) and private.has_unscoped_permission('contracts.manage'))
  )
  with check (
    user_id = (select auth.uid())
    and (
      (company_id is not null and private.has_company_permission(company_id, 'contracts.manage'))
      or (company_id is null and private.has_unscoped_permission('contracts.manage'))
    )
  );
create policy contracts_templates_rbac_delete on public.contract_templates
  for delete to authenticated
  using (
    (company_id is not null and private.has_company_permission(company_id, 'contracts.manage'))
    or (company_id is null and user_id = (select auth.uid()) and private.has_unscoped_permission('contracts.manage'))
  );

alter table public.contract_clauses enable row level security;
drop policy if exists contract_clauses_select on public.contract_clauses;
drop policy if exists contract_clauses_insert on public.contract_clauses;
drop policy if exists contract_clauses_update on public.contract_clauses;
drop policy if exists contract_clauses_delete on public.contract_clauses;
create policy contracts_clauses_rbac_select on public.contract_clauses
  for select to authenticated
  using (
    is_system
    or (company_id is not null and private.has_company_permission(company_id, 'contracts.manage'))
  );
create policy contracts_clauses_rbac_insert on public.contract_clauses
  for insert to authenticated
  with check (
    not is_system
    and company_id is not null
    and created_by = (select auth.uid())
    and private.has_company_permission(company_id, 'contracts.manage')
  );
create policy contracts_clauses_rbac_update on public.contract_clauses
  for update to authenticated
  using (
    not is_system
    and company_id is not null
    and created_by = (select auth.uid())
    and private.has_company_permission(company_id, 'contracts.manage')
  )
  with check (
    not is_system
    and company_id is not null
    and private.has_company_permission(company_id, 'contracts.manage')
  );
create policy contracts_clauses_rbac_delete on public.contract_clauses
  for delete to authenticated
  using (
    not is_system
    and company_id is not null
    and created_by = (select auth.uid())
    and private.has_company_permission(company_id, 'contracts.manage')
  );

alter table public.contract_events enable row level security;
drop policy if exists contract_events_select on public.contract_events;
drop policy if exists contract_events_insert on public.contract_events;
create policy contracts_events_rbac_select on public.contract_events
  for select to authenticated
  using (
    private.has_company_permission(company_id, 'contracts.manage')
    and exists (
      select 1 from public.contracts contract
      where contract.id = contract_events.contract_id
        and contract.company_id = contract_events.company_id
    )
  );
create policy contracts_events_rbac_insert on public.contract_events
  for insert to authenticated
  with check (
    actor_id = (select auth.uid())
    and private.has_company_permission(company_id, 'contracts.manage')
    and exists (
      select 1 from public.contracts contract
      where contract.id = contract_events.contract_id
        and contract.company_id = contract_events.company_id
    )
  );

alter table public.contract_invoice_links enable row level security;
drop policy if exists contract_invoice_links_select on public.contract_invoice_links;
drop policy if exists contract_invoice_links_insert on public.contract_invoice_links;
create policy contracts_invoice_links_rbac_select on public.contract_invoice_links
  for select to authenticated
  using (
    private.has_company_permission(company_id, 'contracts.manage')
    and exists (
      select 1 from public.contracts contract
      where contract.id = contract_invoice_links.contract_id
        and contract.company_id = contract_invoice_links.company_id
    )
  );
create policy contracts_invoice_links_rbac_insert on public.contract_invoice_links
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and private.has_company_permission(company_id, 'contracts.manage')
    and exists (
      select 1 from public.contracts contract
      where contract.id = contract_invoice_links.contract_id
        and contract.company_id = contract_invoice_links.company_id
    )
    and exists (
      select 1 from public.invoices invoice
      where invoice.id = contract_invoice_links.invoice_id
        and invoice.company_id = contract_invoice_links.company_id
    )
  );

alter table public.contract_attachments enable row level security;
drop policy if exists contract_attachments_select on public.contract_attachments;
drop policy if exists contract_attachments_insert on public.contract_attachments;
drop policy if exists contract_attachments_delete on public.contract_attachments;
create policy contracts_attachments_rbac_select on public.contract_attachments
  for select to authenticated
  using (
    private.has_company_permission(company_id, 'contracts.manage')
    and (
      exists (
        select 1 from public.contracts contract
        where contract.id = contract_attachments.contract_id
          and contract.company_id = contract_attachments.company_id
      )
      or exists (
        select 1 from public.contract_templates template
        where template.id = contract_attachments.template_id
          and template.company_id = contract_attachments.company_id
      )
    )
  );
create policy contracts_attachments_rbac_insert on public.contract_attachments
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and private.has_company_permission(company_id, 'contracts.manage')
    and (
      exists (
        select 1 from public.contracts contract
        where contract.id = contract_attachments.contract_id
          and contract.company_id = contract_attachments.company_id
      )
      or exists (
        select 1 from public.contract_templates template
        where template.id = contract_attachments.template_id
          and template.company_id = contract_attachments.company_id
      )
    )
  );
create policy contracts_attachments_rbac_delete on public.contract_attachments
  for delete to authenticated
  using (
    created_by = (select auth.uid())
    and private.has_company_permission(company_id, 'contracts.manage')
  );

commit;
