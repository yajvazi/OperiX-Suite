\set ON_ERROR_STOP on

-- Phase 2 tests are transactional and leave the local fixture unchanged.
begin;

do $$
declare
  v_company_id uuid := 'b984c30b-fd41-4a82-96b8-97d536638f0b';
  v_other_company_id uuid := '25a2477e-0f64-41ad-be0d-61cead706919';
  v_user_id uuid := 'e6b66baa-6eac-4be7-bd2c-c87cad1138d2';
  v_customer_id uuid;
  v_vendor_id uuid;
  v_invoice_id uuid;
  v_bill_id uuid;
  v_asset public.fixed_assets;
  v_depreciation public.asset_depreciation_runs;
  v_product_id uuid;
  v_movement public.inventory_movements;
  v_declaration public.tax_declarations;
  v_withholding public.withholding_transactions;
  v_calendar_count integer;
  v_sales_book public.kosovo_sales_book;
  v_purchase_book public.kosovo_purchase_book;
  v_accounting_difference numeric;
  v_employee_id uuid;
  v_branch_id uuid;
  v_payroll_period public.payroll_periods;
  v_payroll_run public.payroll_runs;
  v_config_id uuid;
  v_compensation_id uuid;
  v_tax_profile_id uuid;
  v_pension_profile_id uuid;
  v_payroll_result jsonb;
begin
  perform set_config('request.jwt.claim.sub', v_user_id::text, true);

  -- Effective-dated payroll rules are seeded and distinguish the two employer types.
  if not exists (
    select 1 from public.payroll_config_sets
    where company_id=v_company_id and code='kosovo_2026' and status='approved'
      and effective_from=date '2026-01-01'
  ) then
    raise exception 'Kosovo payroll configuration is not approved/effective';
  end if;
  if (select count(*) from public.payroll_tax_brackets where config_set_id=(select id from public.payroll_config_sets where company_id=v_company_id and code='kosovo_2026' and version=1)) <> 4 then
    raise exception 'Kosovo PIT brackets are incomplete';
  end if;
  if not exists (
    select 1 from public.payroll_pension_rules rule
    join public.payroll_config_sets config on config.id=rule.config_set_id
    where config.company_id=v_company_id and config.code='kosovo_2026'
      and rule.employee_rate_percent=5 and rule.employer_rate_percent=5
  ) then
    raise exception 'Kosovo pension rule is not 5 percent employee plus 5 percent employer';
  end if;

  -- Payroll approval finalizes through the Phase 1 journal engine.
  insert into public.branches(company_id,code,name,created_by,updated_by)
  values(v_company_id,'PH2-PAY','Phase 2 Payroll Test Branch',v_user_id,v_user_id)
  returning id into v_branch_id;
  select id into v_employee_id from public.employees where company_id=v_company_id and status='active' order by id limit 1;
  perform public.save_employee_payroll_profile(
    v_employee_id,'PH2-EMP-001',v_branch_id,null,null,'gross-monthly',1000,null,null,date '2026-01-01',
    'primary','standard',null,null,'Phase 2 payroll profile test'
  );
  select id into v_config_id from public.payroll_config_sets where company_id=v_company_id and code='kosovo_2026' and version=1;
  v_payroll_period := public.create_payroll_period(v_company_id,'PH2-2026-08','Phase 2 Payroll August',date '2026-08-01',date '2026-08-31',date '2026-08-31',null);
  v_payroll_run := public.create_payroll_run(v_company_id,v_payroll_period.id,v_config_id,'PH2-PAYROLL-RUN',v_branch_id,null,'regular',null);
  select id into v_compensation_id from public.employee_compensation_profiles where employee_id=v_employee_id and effective_from=date '2026-01-01' order by created_at desc limit 1;
  select id into v_tax_profile_id from public.employee_tax_profiles where employee_id=v_employee_id and effective_from=date '2026-01-01';
  select id into v_pension_profile_id from public.employee_pension_profiles where employee_id=v_employee_id and effective_from=date '2026-01-01';
  v_payroll_result := jsonb_build_object(
    'baseEarnings','1000.00','additionalEarnings','0.00','taxableEarnings','1000.00','nonTaxableEarnings','0.00',
    'grossPay','1000.00','pensionableBase','1000.00','employeePension','50.00','employerPension','50.00',
    'taxableIncome','950.00','personalIncomeTax','72.80','otherDeductions','0.00','netSalary','877.20','employerCost','1050.00',
    'metadata',jsonb_build_object('salaryBasis','gross-monthly'),'warnings','[]'::jsonb,'errors','[]'::jsonb
  );
  perform public.save_payroll_calculation(v_payroll_run.id,v_employee_id,v_compensation_id,v_tax_profile_id,v_pension_profile_id,v_payroll_result,
    '[{"kind":"statutory","code":"EMPLOYEE_PENSION","label":"Employee pension","amount":"50.00"}]'::jsonb);
  perform public.submit_payroll_for_review(v_payroll_run.id);
  perform public.approve_payroll_run(v_payroll_run.id,'Phase 2 payroll approval');
  update public.company_feature_flags set enabled=true where company_id=v_company_id and flag in ('payroll_enabled','payroll_accounting_enabled');
  v_payroll_run := public.finalize_payroll_run(v_payroll_run.id,'PH2-PAYROLL-FINAL','Phase 2 payroll finalization');
  if v_payroll_run.status <> 'finalized' or v_payroll_run.journal_entry_id is null or not exists(select 1 from public.journal_entries where id=v_payroll_run.journal_entry_id and status='posted') then
    raise exception 'Payroll did not finalize into a posted journal';
  end if;

  select id into v_customer_id from public.clients where company_id=v_company_id limit 1;
  if v_customer_id is null then
    insert into public.clients(user_id,company_id,name) values(v_user_id,v_company_id,'Phase 2 Test Customer') returning id into v_customer_id;
  end if;
  insert into public.invoices(user_id,company_id,client_id,invoice_number,issue_date,due_date,status,type)
  values(v_user_id,v_company_id,v_customer_id,'PH2-TAX-SALE',date '2026-08-12',date '2026-09-11','draft','invoice') returning id into v_invoice_id;
  insert into public.invoice_items(invoice_id,description,quantity,unit_price,amount,tax_rate,tax_code)
  values(v_invoice_id,'Phase 2 taxable sale',1,100,100,18,'standard_18');
  perform public.prepare_sales_invoice_for_posting(v_invoice_id,'Phase 2 tax-book test');
  perform public.post_sales_invoice(v_invoice_id,gen_random_uuid(),'Phase 2 tax-book test');
  select * into v_sales_book from public.kosovo_sales_book where invoice_id=v_invoice_id;
  if v_sales_book.taxable_base <> 100 or v_sales_book.output_vat <> 18 or v_sales_book.total_amount <> 118 then
    raise exception 'Sales Book values do not match the posted invoice';
  end if;

  select id into v_vendor_id from public.vendors where company_id=v_company_id limit 1;
  if v_vendor_id is null then
    insert into public.vendors(user_id,company_id,name) values(v_user_id,v_company_id,'Phase 2 Test Supplier') returning id into v_vendor_id;
  end if;
  insert into public.supplier_bills(
    user_id,company_id,vendor_id,bill_number,issue_date,due_date,total_amount,tax_amount,status,
    input_vat_recoverable_amount,input_vat_non_recoverable_amount,tax_reporting_category
  ) values(
    v_user_id,v_company_id,v_vendor_id,'PH2-TAX-PURCHASE',date '2026-08-12',date '2026-09-11',118,18,'unpaid',10,8,'domestic_purchase'
  ) returning id into v_bill_id;
  perform public.prepare_supplier_bill_for_posting(v_bill_id,'Phase 2 purchase-book test');
  perform public.post_supplier_bill(v_bill_id,gen_random_uuid(),'Phase 2 purchase-book test');
  select * into v_purchase_book from public.kosovo_purchase_book where supplier_bill_id=v_bill_id;
  if v_purchase_book.taxable_base <> 100 or v_purchase_book.input_vat <> 18 or v_purchase_book.recoverable_vat <> 10 or v_purchase_book.nonrecoverable_vat <> 8 then
    raise exception 'Purchase Book VAT split is incorrect';
  end if;
  if exists(select 1 from public.journal_entry_lines line join public.journal_entries entry on entry.id=line.journal_entry_id join public.chart_of_accounts account on account.id=line.account_id where entry.source_id=v_bill_id and entry.status='posted' and account.code='1300' and line.debit<>10) then
    raise exception 'Non-recoverable purchase VAT was posted to input VAT';
  end if;

  select output_vat_difference into v_accounting_difference from public.kosovo_tax_book_reconciliation where company_id=v_company_id;
  if v_accounting_difference <> 0 then raise exception 'Sales Book does not reconcile to output VAT control account'; end if;
  if (select recoverable_vat_difference from public.kosovo_tax_book_reconciliation where company_id=v_company_id) <> 0 then
    raise exception 'Purchase Book does not reconcile to input VAT control account';
  end if;

  if public.calculate_withholding(v_company_id,'rent',100,date '2026-08-12') <> 9 then
    raise exception 'Kosovo rent withholding is not 9 percent';
  end if;
  v_withholding := public.record_withholding(v_company_id,'rent','supplier_bill',v_bill_id,date '2026-08-12',100,gen_random_uuid());
  if v_withholding.withheld_amount <> 9 then raise exception 'Withholding transaction amount is incorrect'; end if;
  begin
    perform public.calculate_withholding(v_company_id,'other_applicable',100,date '2026-08-12');
    raise exception 'Unverified withholding category was enabled';
  exception when others then
    if sqlstate <> '55000' then raise; end if;
  end;

  v_declaration := public.prepare_tax_declaration(v_company_id,'vat',date '2026-08-01',date '2026-08-31');
  if v_declaration.status <> 'ready' or coalesce((v_declaration.payload->'salesBook')::text,'') = '[]' then
    raise exception 'VAT declaration preview was not generated from source books';
  end if;
  v_calendar_count := public.generate_kosovo_tax_calendar(v_company_id,2026);
  if not exists(select 1 from public.tax_calendar_events where company_id=v_company_id and tax_type in ('personal_income_tax','corporate_tax') and due_date=date '2027-03-31') then
    raise exception 'Annual Kosovo tax calendar events are missing';
  end if;

  v_asset := public.register_fixed_asset(
    v_company_id,'Phase 2 Test Equipment'::text,'equipment'::text,date '2026-08-12',date '2026-08-12',1200::numeric,12,2::smallint,v_vendor_id,
    'Test location'::text,null::uuid,'[]'::jsonb,null::uuid,gen_random_uuid()
  );
  if v_asset.net_book_value <> 1200 or v_asset.tax_depreciation_rate_percent <> 20 then raise exception 'Fixed asset register values are incorrect'; end if;
  v_depreciation := public.post_asset_depreciation(v_company_id,date '2026-08-01',date '2026-08-31','monthly',gen_random_uuid(),'Phase 2 depreciation test');
  if v_depreciation.status <> 'posted' or not exists(select 1 from public.asset_depreciation_lines where run_id=v_depreciation.id and book_depreciation_amount=100 and tax_depreciation_amount=20) then
    raise exception 'Separate book/tax depreciation was not posted';
  end if;
  if not exists(select 1 from public.journal_entries entry where entry.id=v_depreciation.journal_entry_id and entry.status='posted') then
    raise exception 'Depreciation journal was not posted';
  end if;
  perform public.reverse_asset_depreciation(v_depreciation.id,'Phase 2 depreciation reversal test');
  if not exists(select 1 from public.asset_depreciation_runs where id=v_depreciation.id and status='reversed') then raise exception 'Depreciation reversal failed'; end if;

  insert into public.products(user_id,company_id,name,unit_price,stock_quantity,cost_price,track_stock,sku)
  values(v_user_id,v_company_id,'Phase 2 Test Stock',30,0,0,true,'PH2-STOCK') returning id into v_product_id;
  v_movement := public.post_inventory_movement(v_company_id,v_product_id,'opening_stock',10,20,null,'opening_stock',null,gen_random_uuid(),'Phase 2 inventory opening');
  if v_movement.quantity_after <> 10 or v_movement.inventory_value_after <> 200 then raise exception 'Opening stock movement failed'; end if;
  v_movement := public.post_inventory_movement(v_company_id,v_product_id,'purchase',5,30,null,'inventory_purchase',null,gen_random_uuid(),'Phase 2 inventory purchase');
  if round(v_movement.average_cost_after,2) <> 23.33 then raise exception 'Weighted average cost calculation failed'; end if;
  v_movement := public.post_inventory_movement(v_company_id,v_product_id,'sale',3,null,null,'inventory_sale',null,gen_random_uuid(),'Phase 2 inventory sale');
  if v_movement.quantity_after <> 12 or round(v_movement.cost_amount,2) <> 70 then raise exception 'COGS movement failed'; end if;
  if exists(select 1 from public.inventory_gl_reconciliation where company_id=v_company_id and abs(difference) > 0.0001) then
    raise exception 'Inventory register does not reconcile to GL inventory';
  end if;

  perform public.archive_document(v_company_id,'supplier_invoice','operix-documents','phase-2/test-bill.pdf','test-bill.pdf',date '2026-08-12','supplier_bill',v_bill_id,'application/pdf',12,'phase2-checksum',date '2036-08-12','{}'::jsonb);
  if not exists(select 1 from public.document_archive where company_id=v_company_id and source_id=v_bill_id and status='active') then raise exception 'Document archive link was not created'; end if;
  if exists(select 1 from public.kosovo_efs_status where company_id=v_company_id and status <> 'EFS NOT CERTIFIED') then raise exception 'EFS was incorrectly marked certified'; end if;

  if exists(
    select 1 from public.journal_entries entry
    join lateral (select coalesce(sum(debit),0) debit,coalesce(sum(credit),0) credit from public.journal_entry_lines line where line.journal_entry_id=entry.id) totals on true
    where entry.status='posted' and (totals.debit <= 0 or totals.debit <> totals.credit)
  ) then raise exception 'Phase 2 created an unbalanced journal'; end if;

  raise notice 'Phase 2 tax, payroll, assets and inventory tests passed';
end
$$;

rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','e6b66baa-6eac-4be7-bd2c-c87cad1138d2',true);
do $$
begin
  if exists(select 1 from public.fixed_assets where company_id='25a2477e-0f64-41ad-be0d-61cead706919'::uuid) then raise exception 'Cross-tenant fixed-asset read was allowed'; end if;
  if exists(select 1 from public.inventory_movements where company_id='25a2477e-0f64-41ad-be0d-61cead706919'::uuid) then raise exception 'Cross-tenant inventory read was allowed'; end if;
  if exists(select 1 from public.tax_declarations where company_id='25a2477e-0f64-41ad-be0d-61cead706919'::uuid) then raise exception 'Cross-tenant declaration read was allowed'; end if;
  if exists(select 1 from public.document_archive where company_id='25a2477e-0f64-41ad-be0d-61cead706919'::uuid) then raise exception 'Cross-tenant archive read was allowed'; end if;
end
$$;
rollback;

select 'Phase 2 tax, payroll, assets and inventory tests passed' as result;
