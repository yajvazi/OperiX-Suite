\set ON_ERROR_STOP on

-- Phase 3 tests are transactional and leave the local fixture unchanged.
begin;

do $$
declare
  v_company_id uuid := 'b984c30b-fd41-4a82-96b8-97d536638f0b';
  v_user_id uuid := 'e6b66baa-6eac-4be7-bd2c-c87cad1138d2';
  v_vendor_id uuid;
  v_bill_id uuid;
  v_vendor_payment_id uuid;
  v_vendor_payment_journal_id uuid;
  v_bank_account_id uuid;
  v_bank_coa_id uuid;
  v_reconciliation public.bank_reconciliations;
  v_statement public.bank_statement_transactions;
  v_journal public.journal_entries;
  v_summary record;
  v_reconciliation_audit record;
begin
  perform set_config('request.jwt.claim.sub', v_user_id::text, true);

  -- Financial statements are sourced from the accounting engine views.
  if not exists (select 1 from public.operix_report_summary where company_id=v_company_id) then
    raise exception 'Financial report summary is not available to the company';
  end if;
  if not exists (select 1 from public.operix_financial_reconciliation where company_id=v_company_id and reconciles) then
    raise exception 'Empty-company financial reconciliation did not pass';
  end if;

  -- Create a balanced source journal so drill-down, bank matching and reports
  -- can be verified against a real posted transaction.
  select id into v_bank_coa_id
  from public.chart_of_accounts
  where company_id=v_company_id and code='1020';
  select id into v_bank_account_id
  from public.company_bank_accounts
  where company_id=v_company_id and is_active
  order by id limit 1;
  if v_bank_coa_id is null or v_bank_account_id is null then
    raise exception 'Phase 3 fixture is missing a bank account or bank COA';
  end if;
  update public.company_bank_accounts set account_id=v_bank_coa_id where id=v_bank_account_id;

  v_journal := public.create_journal_entry(
    v_company_id,date '2026-08-12',date '2026-08-12','Phase 3 bank funding',
    'PH3-BANK-FUNDING','EUR',1,null,'manual'
  );
  insert into public.journal_entry_lines(journal_entry_id,company_id,line_number,account_id,debit,credit,created_by)
  select v_journal.id,v_company_id,1,v_bank_coa_id,10,0,v_user_id
  union all
  select v_journal.id,v_company_id,2,account.id,0,10,v_user_id
  from public.chart_of_accounts account
  where account.company_id=v_company_id and account.code='3000';
  v_journal := public.post_journal_entry(v_journal.id,'Phase 3 bank funding test');
  if v_journal.status <> 'posted' then raise exception 'Source journal did not post'; end if;

  -- AP aging is allocation-based rather than assuming every payment clears a
  -- particular supplier bill.
  select id into v_vendor_id from public.vendors where company_id=v_company_id order by id limit 1;
  insert into public.supplier_bills(
    user_id,company_id,vendor_id,bill_number,issue_date,due_date,total_amount,tax_amount,status
  ) values(
    v_user_id,v_company_id,v_vendor_id,'PH3-AP-AGING',date '2026-08-12',date '2026-09-11',10,0,'unpaid'
  ) returning id into v_bill_id;
  perform public.prepare_supplier_bill_for_posting(v_bill_id,'Phase 3 AP aging test');
  perform public.post_supplier_bill(v_bill_id,gen_random_uuid(),'Phase 3 AP aging test');
  select id into v_vendor_payment_id
  from public.record_supplier_payment(
    v_company_id,v_vendor_id,date '2026-08-12',4,'bank',v_bank_coa_id,
    'PH3-AP-PAY','Phase 3 AP aging test',null,'EUR',gen_random_uuid()
  );
  select posting_journal_entry_id into v_vendor_payment_journal_id
  from public.vendor_payments where id=v_vendor_payment_id;
  perform public.allocate_supplier_payment(v_vendor_payment_id,v_bill_id,4,date '2026-08-12');
  select * into v_summary from public.operix_ap_open_items where supplier_bill_id=v_bill_id;
  if v_summary.outstanding_amount <> 6 or v_summary.aging_bucket <> 'current' then
    raise exception 'AP aging allocation is incorrect';
  end if;

  -- Bank reconciliation supports imported statement lines and manual matching.
  v_reconciliation := public.create_bank_reconciliation(
    v_bank_account_id,date '2026-08-01',date '2026-08-31',0,'Phase 3 bank reconciliation test'
  );
  v_statement := public.import_bank_statement_transaction(
    v_reconciliation.id,'PH3-STATEMENT-DEPOSIT',date '2026-08-12','Funding','PH3-BANK-FUNDING',10,'EUR'
  );
  perform public.match_bank_statement_transaction(v_statement.id,v_journal.id);
  v_statement := public.import_bank_statement_transaction(
    v_reconciliation.id,'PH3-STATEMENT-PAYMENT',date '2026-08-12','Supplier payment','PH3-AP-PAY',-4,'EUR'
  );
  perform public.match_bank_statement_transaction(v_statement.id,v_vendor_payment_journal_id);
  v_reconciliation := public.complete_bank_reconciliation(v_reconciliation.id,6,'Phase 3 completed reconciliation test');
  if v_reconciliation.status <> 'completed' or v_reconciliation.difference <> 0 then
    raise exception 'Bank reconciliation did not close to zero difference';
  end if;
  if exists(select 1 from public.operix_bank_reconciliation_summary where id=v_reconciliation.id and unmatched_transactions <> 0) then
    raise exception 'Matched bank reconciliation still has unmatched lines';
  end if;

  -- Posted journal history is immutable; correction must use a reversal.
  begin
    update public.journal_entries set description='Unauthorized edit' where id=v_journal.id;
    raise exception 'Posted journal metadata was mutable';
  exception when others then
    if sqlstate <> '55000' then raise; end if;
  end;
  begin
    update public.journal_entry_lines set debit=11 where journal_entry_id=v_journal.id and line_number=1;
    raise exception 'Posted journal lines were mutable';
  exception when others then
    if sqlstate <> '55000' then raise; end if;
  end;

  select * into v_reconciliation_audit
  from public.operix_financial_reconciliation
  where company_id=v_company_id;
  if not v_reconciliation_audit.reconciles then
    raise exception 'Financial reconciliation audit failed after posted source transactions';
  end if;
  if exists(
    select 1 from public.operix_financial_drilldown
    where company_id=v_company_id and journal_entry_id=v_journal.id
      and source_type='manual'
  ) = false then
    raise exception 'Financial drill-down did not expose the source journal';
  end if;
  if exists(
    select 1 from public.journal_entries entry
    join lateral (
      select coalesce(sum(debit),0) debit,coalesce(sum(credit),0) credit
      from public.journal_entry_lines line where line.journal_entry_id=entry.id
    ) totals on true
    where entry.status='posted' and (totals.debit <= 0 or totals.debit <> totals.credit)
  ) then
    raise exception 'Phase 3 created an unbalanced journal';
  end if;

  raise notice 'Phase 3 reporting, reconciliation and drill-down tests passed';
end
$$;

rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','e6b66baa-6eac-4be7-bd2c-c87cad1138d2',true);
do $$
begin
  if exists(select 1 from public.operix_trial_balance where company_id='25a2477e-0f64-41ad-be0d-61cead706919'::uuid) then
    raise exception 'Cross-tenant Trial Balance read was allowed';
  end if;
  if exists(select 1 from public.operix_financial_drilldown where company_id='25a2477e-0f64-41ad-be0d-61cead706919'::uuid) then
    raise exception 'Cross-tenant financial drill-down read was allowed';
  end if;
  if exists(select 1 from public.bank_reconciliations where company_id='25a2477e-0f64-41ad-be0d-61cead706919'::uuid) then
    raise exception 'Cross-tenant bank reconciliation read was allowed';
  end if;
  if exists(select 1 from public.operix_ap_open_items where company_id='25a2477e-0f64-41ad-be0d-61cead706919'::uuid) then
    raise exception 'Cross-tenant AP aging read was allowed';
  end if;
  if exists(select 1 from public.journal_entries where company_id='25a2477e-0f64-41ad-be0d-61cead706919'::uuid) then
    raise exception 'Cross-tenant journal read was allowed';
  end if;
  if exists(select 1 from public.payroll_runs where company_id='25a2477e-0f64-41ad-be0d-61cead706919'::uuid) then
    raise exception 'Cross-tenant payroll read was allowed';
  end if;
  if exists(select 1 from public.document_archive where company_id='25a2477e-0f64-41ad-be0d-61cead706919'::uuid) then
    raise exception 'Cross-tenant document read was allowed';
  end if;
end
$$;
rollback;

select 'Phase 3 reporting, reconciliation and drill-down tests passed' as result;
