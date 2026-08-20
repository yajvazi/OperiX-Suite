\set ON_ERROR_STOP on

-- These checks run inside a transaction so the local fixture is never changed.
begin;

do $$
declare
  v_company_id uuid := 'b984c30b-fd41-4a82-96b8-97d536638f0b';
  v_user_id uuid := 'e6b66baa-6eac-4be7-bd2c-c87cad1138d2';
  v_customer_id uuid;
  v_invoice_id uuid;
  v_vendor_id uuid;
  v_bill_id uuid;
  v_payment_id uuid;
  v_vendor_payment_id uuid;
  v_expense_id uuid;
  v_bank_id uuid;
  v_equity_id uuid;
  v_period_id uuid;
  v_original_journal_id uuid;
  v_invoice_key uuid;
  v_journal public.journal_entries;
begin
  perform set_config('request.jwt.claim.sub', v_user_id::text, true);

  select account.id into v_bank_id
  from public.chart_of_accounts account
  where account.company_id = v_company_id and account.code = '1020';
  select account.id into v_equity_id
  from public.chart_of_accounts account
  where account.company_id = v_company_id and account.code = '3000';
  if v_bank_id is null or v_equity_id is null then
    raise exception 'Phase 1 fixture is missing bank/equity accounts';
  end if;

  -- Sales invoice -> journal and customer payment -> journal -> reversal.
  insert into public.clients (user_id, company_id, name)
  values (v_user_id, v_company_id, 'Phase 1 Test Customer')
  returning id into v_customer_id;

  insert into public.invoices (
    user_id, company_id, client_id, invoice_number, issue_date, due_date, status, type
  )
  values (
    v_user_id, v_company_id, v_customer_id, 'PH1-TEST-INV', date '2026-08-12',
    date '2026-09-11', 'draft', 'invoice'
  )
  returning id into v_invoice_id;

  insert into public.invoice_items (
    invoice_id, description, quantity, unit_price, amount, tax_rate
  )
  values (v_invoice_id, 'Test service', 1, 100, 100, 18);

  v_invoice_key := gen_random_uuid();
  perform public.prepare_sales_invoice_for_posting(v_invoice_id, 'Phase 1 test');
  perform public.post_sales_invoice(v_invoice_id, v_invoice_key, 'Phase 1 test');
  perform public.post_sales_invoice(v_invoice_id, v_invoice_key, 'Phase 1 idempotent retry');
  if not exists (
    select 1 from public.journal_entries
    where source_type = 'sales_invoice' and source_id = v_invoice_id and status = 'posted'
  ) then
    raise exception 'Invoice did not post';
  end if;

  select id into v_payment_id
  from public.record_customer_payment(
    v_company_id, v_customer_id, date '2026-08-12', 118, 'bank', v_bank_id,
    'PH1-CUST-PAY', 'Phase 1 test', null, 'EUR', gen_random_uuid()
  );
  if not exists (
    select 1 from public.journal_entries
    where source_type = 'customer_payment' and source_id = v_payment_id and status = 'posted'
  ) then
    raise exception 'Customer payment did not post';
  end if;
  select posting_journal_entry_id into v_original_journal_id
  from public.payments where id = v_payment_id;
  perform public.reverse_customer_payment(v_payment_id, date '2026-08-12', 'Phase 1 refund test');
  if not exists (
    select 1 from public.journal_entries
    where source_type = 'journal_reversal' and source_id = v_original_journal_id and status = 'posted'
  ) then
    raise exception 'Customer payment reversal did not post';
  end if;

  -- Walk-in POS invoice uses the cash-sale rule while remaining the same
  -- invoice document type and ledger workflow.
  insert into public.invoices (
    user_id, company_id, invoice_number, issue_date, due_date, status, type,
    total_amount, tax_amount, payment_method
  )
  values (
    v_user_id, v_company_id, 'PH1-TEST-POS', date '2026-08-12', date '2026-08-12',
    'draft', 'invoice', 11.8, 1.8, 'cash'
  )
  returning id into v_invoice_id;
  insert into public.invoice_items (
    invoice_id, description, quantity, unit_price, amount, tax_rate
  )
  values (v_invoice_id, 'POS item', 1, 10, 10, 18);
  perform public.post_pos_invoice(v_invoice_id, gen_random_uuid(), 'Phase 1 POS test');
  if not exists (
    select 1 from public.journal_entries
    where source_type = 'pos_invoice' and source_id = v_invoice_id and status = 'posted'
  ) then
    raise exception 'Walk-in POS invoice did not post';
  end if;

  -- Supplier invoice -> journal and supplier payment -> journal.
  select id into v_vendor_id
  from public.vendors where company_id = v_company_id order by id limit 1;
  if v_vendor_id is null then
    raise exception 'Phase 1 fixture is missing a supplier';
  end if;

  insert into public.supplier_bills (
    user_id, company_id, vendor_id, bill_number, issue_date, due_date,
    total_amount, tax_amount, status
  )
  values (
    v_user_id, v_company_id, v_vendor_id, 'PH1-TEST-BILL', date '2026-08-12',
    date '2026-09-11', 59, 9, 'unpaid'
  )
  returning id into v_bill_id;
  perform public.prepare_supplier_bill_for_posting(v_bill_id, 'Phase 1 test');
  perform public.post_supplier_bill(v_bill_id, gen_random_uuid(), 'Phase 1 test');
  if not exists (
    select 1 from public.journal_entries
    where source_type = 'supplier_bill' and source_id = v_bill_id and status = 'posted'
  ) then
    raise exception 'Supplier bill did not post';
  end if;

  select id into v_vendor_payment_id
  from public.record_supplier_payment(
    v_company_id, v_vendor_id, date '2026-08-12', 59, 'bank', v_bank_id,
    'PH1-SUP-PAY', 'Phase 1 test', null, 'EUR', gen_random_uuid()
  );
  if not exists (
    select 1 from public.journal_entries
    where source_type = 'supplier_payment' and source_id = v_vendor_payment_id and status = 'posted'
  ) then
    raise exception 'Supplier payment did not post';
  end if;

  -- Expense -> journal.
  insert into public.expenses (user_id, company_id, amount, category, description, date)
  values (v_user_id, v_company_id, 25, 'Other', 'Phase 1 test expense', date '2026-08-12')
  returning id into v_expense_id;
  perform public.post_expense(v_expense_id, gen_random_uuid(), 'Phase 1 test');
  if not exists (
    select 1 from public.journal_entries
    where source_type = 'expense' and source_id = v_expense_id and status = 'posted'
  ) then
    raise exception 'Expense did not post';
  end if;

  if exists (
    select 1 from public.customer_subledger_reconciliation
    where company_id = v_company_id and not reconciles
  ) or exists (
    select 1 from public.supplier_subledger_reconciliation
    where company_id = v_company_id and not reconciles
  ) then
    raise exception 'Customer or supplier subledger does not reconcile to the general ledger';
  end if;

  -- Opening balances are idempotent and posted through the same ledger.
  perform public.post_opening_balance(
    v_company_id, date '2026-08-01', 'Phase 1 test opening',
    jsonb_build_array(
      jsonb_build_object('account_code', '1020', 'debit', 10, 'credit', 0),
      jsonb_build_object('account_code', '3000', 'debit', 0, 'credit', 10)
    ), gen_random_uuid()
  );

  -- Soft close allows only an explicitly authorized, reasoned posting.
  select id into v_period_id
  from public.accounting_periods
  where company_id = v_company_id and period_number = 8;
  perform public.set_accounting_period_status(v_period_id, 'soft_closed', 'Phase 1 soft close');
  v_journal := public.create_journal_entry(
    v_company_id, date '2026-08-15', date '2026-08-15', 'Soft close test',
    'SOFT-TEST', 'EUR', 1, null, 'manual'
  );
  insert into public.journal_entry_lines (
    journal_entry_id, company_id, line_number, account_id, debit, credit, created_by
  )
  values
    (v_journal.id, v_company_id, 1, v_bank_id, 5, 0, v_user_id),
    (v_journal.id, v_company_id, 2, v_equity_id, 0, 5, v_user_id);
  v_journal := public.post_journal_entry(v_journal.id, 'Approved soft-close test');
  if v_journal.status <> 'posted' then
    raise exception 'Soft-close journal did not post';
  end if;

  -- Closed periods reject posting, and an unbalanced entry cannot be posted.
  perform public.set_accounting_period_status(v_period_id, 'closed', 'Phase 1 closed-period test');
  v_journal := public.create_journal_entry(
    v_company_id, date '2026-08-16', date '2026-08-16', 'Closed period test',
    'CLOSED-TEST', 'EUR', 1, null, 'manual'
  );
  insert into public.journal_entry_lines (
    journal_entry_id, company_id, line_number, account_id, debit, credit, created_by
  ) values (v_journal.id, v_company_id, 1, v_bank_id, 5, 0, v_user_id);
  begin
    perform public.post_journal_entry(v_journal.id, 'Should fail in closed period');
    raise exception 'Closed period accepted a journal';
  exception when others then
    if sqlstate <> '55000' then raise; end if;
  end;
  perform public.set_accounting_period_status(v_period_id, 'open', 'Restore test period');

  perform public.set_accounting_period_status(v_period_id, 'open', 'Restore test period');

  -- Every posted entry in the fixture must balance exactly at four decimals.
  if exists (
    select 1
    from public.journal_entries entry
    join lateral (
      select coalesce(sum(debit), 0) debit, coalesce(sum(credit), 0) credit
      from public.journal_entry_lines line
      where line.journal_entry_id = entry.id
    ) totals on true
    where entry.status = 'posted'
      and (totals.debit <= 0 or totals.debit <> totals.credit)
  ) then
    raise exception 'Posted journal balance invariant failed';
  end if;

  raise notice 'Phase 1 accounting transaction tests passed';
end
$$;

rollback;

begin;

-- Cross-tenant read attempts must return no rows for an unrelated company.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e6b66baa-6eac-4be7-bd2c-c87cad1138d2', true);
do $$
begin
  if exists (
    select 1 from public.chart_of_accounts
    where company_id = '25a2477e-0f64-41ad-be0d-61cead706919'::uuid
  ) then
    raise exception 'Cross-tenant chart-of-accounts read was allowed';
  end if;
  if exists (
    select 1 from public.invoices
    where company_id = '25a2477e-0f64-41ad-be0d-61cead706919'::uuid
  ) then
    raise exception 'Cross-tenant invoice read was allowed';
  end if;
end
$$;
rollback;

select 'Phase 1 accounting foundation tests passed' as result;
