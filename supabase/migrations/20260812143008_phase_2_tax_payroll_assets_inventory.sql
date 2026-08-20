-- OperiX Invoice Phase 2
-- Kosovo tax books, payroll rules, withholding, assets, inventory and archive.
-- This migration is additive and depends on the verified Phase 1 ledger.

begin;

-- ---------------------------------------------------------------------------
-- Phase 2 permissions
-- ---------------------------------------------------------------------------

insert into public.app_permissions (code, name, category, description, is_sensitive)
values
  ('tax.book.view', 'View tax books', 'tax', 'View TAK-aligned sales and purchase books.', true),
  ('tax.declaration.prepare', 'Prepare tax declarations', 'tax', 'Prepare and export tax declaration previews.', true),
  ('tax.calendar.manage', 'Manage tax calendar', 'tax', 'Generate and maintain company tax deadlines.', false),
  ('withholding.manage', 'Manage withholding tax', 'tax', 'Record and review withholding-tax transactions.', true),
  ('asset.view', 'View fixed assets', 'assets', 'View the fixed-asset register and depreciation.', false),
  ('asset.manage', 'Manage fixed assets', 'assets', 'Register, dispose and write off fixed assets.', true),
  ('asset.depreciation.post', 'Post depreciation', 'assets', 'Preview, post and reverse depreciation.', true),
  ('inventory.view', 'View inventory ledger', 'inventory', 'View inventory movements, counts and reconciliation.', false),
  ('inventory.manage', 'Manage inventory ledger', 'inventory', 'Post inventory movements and stock counts.', true),
  ('document.archive.view', 'View document archive', 'documents', 'View archived financial documents.', true),
  ('document.archive.create', 'Archive documents', 'documents', 'Upload and link source documents.', true)
on conflict (code) do update
set name = excluded.name,
    category = excluded.category,
    description = excluded.description,
    is_sensitive = excluded.is_sensitive;

with grants(role_code, permission_code) as (
  values
    ('owner','tax.book.view'),('owner','tax.declaration.prepare'),('owner','tax.calendar.manage'),
    ('owner','withholding.manage'),('owner','asset.view'),('owner','asset.manage'),('owner','asset.depreciation.post'),
    ('owner','inventory.view'),('owner','inventory.manage'),('owner','document.archive.view'),('owner','document.archive.create'),
    ('company_administrator','tax.book.view'),('company_administrator','tax.declaration.prepare'),('company_administrator','tax.calendar.manage'),
    ('company_administrator','withholding.manage'),('company_administrator','asset.view'),('company_administrator','asset.manage'),
    ('company_administrator','asset.depreciation.post'),('company_administrator','inventory.view'),('company_administrator','inventory.manage'),
    ('company_administrator','document.archive.view'),('company_administrator','document.archive.create'),
    ('senior_accountant','tax.book.view'),('senior_accountant','tax.declaration.prepare'),('senior_accountant','tax.calendar.manage'),
    ('senior_accountant','withholding.manage'),('senior_accountant','asset.view'),('senior_accountant','asset.manage'),
    ('senior_accountant','asset.depreciation.post'),('senior_accountant','inventory.view'),('senior_accountant','inventory.manage'),
    ('senior_accountant','document.archive.view'),('senior_accountant','document.archive.create'),
    ('accountant','tax.book.view'),('accountant','tax.declaration.prepare'),('accountant','tax.calendar.manage'),
    ('accountant','withholding.manage'),('accountant','asset.view'),('accountant','asset.manage'),('accountant','asset.depreciation.post'),
    ('accountant','inventory.view'),('accountant','inventory.manage'),('accountant','document.archive.view'),('accountant','document.archive.create'),
    ('payroll_administrator','tax.book.view'),('payroll_administrator','tax.declaration.prepare'),('payroll_administrator','tax.calendar.manage'),
    ('payroll_administrator','withholding.manage'),('payroll_administrator','document.archive.view'),('payroll_administrator','document.archive.create'),
    ('hr_manager','tax.book.view'),('hr_manager','tax.declaration.prepare'),('hr_manager','tax.calendar.manage'),('hr_manager','withholding.manage'),
    ('warehouse_manager','inventory.view'),('warehouse_manager','inventory.manage'),('warehouse_manager','document.archive.view'),
    ('auditor','tax.book.view'),('auditor','tax.declaration.prepare'),('auditor','asset.view'),('auditor','inventory.view'),('auditor','document.archive.view'),
    ('read_only','tax.book.view'),('read_only','asset.view'),('read_only','inventory.view')
)
insert into public.app_role_permissions (role_id, permission_code)
select role.id, grants.permission_code
from public.app_roles role
join grants on grants.role_code = role.code
where role.company_id is null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Payroll: effective Kosovo 2026 rules and secure command repairs
-- ---------------------------------------------------------------------------

alter table public.employee_tax_profiles
  add column if not exists employer_relationship text not null default 'primary'
  check (employer_relationship in ('primary','secondary'));

update public.employee_tax_profiles
set employer_relationship = case
  when lower(trim(tax_status)) = 'secondary' then 'secondary'
  else 'primary'
end
where employer_relationship = 'primary';

create or replace function private.sync_employee_tax_relationship()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if lower(trim(coalesce(new.tax_status, ''))) = 'secondary' then
    new.employer_relationship := 'secondary';
  else
    new.employer_relationship := 'primary';
  end if;
  return new;
end
$$;

drop trigger if exists employee_tax_profiles_relationship_sync on public.employee_tax_profiles;
create trigger employee_tax_profiles_relationship_sync
before insert or update of tax_status on public.employee_tax_profiles
for each row execute function private.sync_employee_tax_relationship();

-- The payroll functions deliberately use an empty secure search path.  pgcrypto
-- is installed in the extensions schema in Supabase, so make that schema
-- explicit instead of weakening the functions by exposing public search paths.
alter function public.import_payroll_inputs(uuid,uuid,text,text,text[],boolean,timestamptz,text,jsonb)
  set search_path = extensions, pg_catalog;
alter function public.finalize_payroll_run(uuid,text,text)
  set search_path = extensions, pg_catalog;

create or replace function public.save_payroll_posting_mapping(
  p_company_id uuid,
  p_mapping_code text,
  p_account_id uuid,
  p_branch_id uuid,
  p_cost_centre_id uuid,
  p_project_id uuid,
  p_effective_from date,
  p_reason text
)
returns public.payroll_posting_mappings
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.payroll_posting_mappings;
  normalized_code text := upper(trim(p_mapping_code));
  account_side text;
begin
  if not (select private.has_company_permission(p_company_id, 'payroll.configuration.manage')) then
    raise exception 'Insufficient permission' using errcode = '42501';
  end if;
  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'Mapping reason is required' using errcode = '23514';
  end if;
  select case when normal_balance = 'debit' then 'debit' else 'credit' end
  into account_side
  from public.chart_of_accounts
  where id = p_account_id and company_id = p_company_id and active and posting_allowed;
  if account_side is null then
    raise exception 'Posting account is not available' using errcode = '23503';
  end if;

  select * into result
  from public.payroll_posting_mappings
  where company_id = p_company_id
    and mapping_code = normalized_code
    and effective_from = p_effective_from
    and branch_id is not distinct from p_branch_id
    and cost_centre_id is not distinct from p_cost_centre_id
    and project_id is not distinct from p_project_id
    and department is null
  order by created_at desc
  limit 1
  for update;

  if found then
    update public.payroll_posting_mappings
    set account_id = p_account_id, side = account_side, active = true
    where id = result.id
    returning * into result;
  else
    insert into public.payroll_posting_mappings(
      company_id, mapping_code, account_id, side, branch_id, cost_centre_id,
      project_id, effective_from, created_by
    ) values (
      p_company_id, normalized_code, p_account_id, account_side, p_branch_id,
      p_cost_centre_id, p_project_id, p_effective_from, (select auth.uid())
    ) returning * into result;
  end if;
  perform private.record_payroll_audit(
    p_company_id, p_branch_id, 'payroll.posting_mapping.saved',
    'payroll_posting_mapping', result.id, null, to_jsonb(result), p_reason
  );
  return result;
end
$$;

do $$
declare
  company_row record;
  config_id uuid;
  account_row record;
begin
  for company_row in select id from public.companies loop
    insert into public.payroll_config_sets(
      company_id, code, name, jurisdiction, version, effective_from, status,
      currency, decimal_scale, rounding_mode, rule_source_reference, approved_at
    ) values (
      company_row.id, 'kosovo_2026', 'Kosovo payroll rules 2026', 'XK', 1,
      date '2026-01-01', 'approved', 'EUR', 2, 'half-up',
      'https://crmm.atk-ks.org/en/Public/GuideInteractivityAnswers/7a53613a-cb62-4671-2fde-08dba4862e41',
      clock_timestamp()
    ) on conflict (company_id, code, version) do update set
      status = 'approved',
      effective_from = date '2026-01-01',
      effective_until = null,
      rule_source_reference = excluded.rule_source_reference,
      approved_at = coalesce(public.payroll_config_sets.approved_at, clock_timestamp()),
      updated_at = clock_timestamp()
    returning id into config_id;

    if config_id is null then
      select id into config_id from public.payroll_config_sets
      where company_id = company_row.id and code = 'kosovo_2026' and version = 1;
    end if;

    insert into public.payroll_tax_brackets(
      company_id, config_set_id, bracket_order, lower_bound, upper_bound, rate_percent, fixed_amount
    )
    select company_row.id, config_id, seed.bracket_order, seed.lower_bound, seed.upper_bound, seed.rate_percent, 0
    from (values
      (1,0::numeric,80::numeric,0::numeric),
      (2,80::numeric,250::numeric,4::numeric),
      (3,250::numeric,450::numeric,8::numeric),
      (4,450::numeric,null::numeric,10::numeric)
    ) seed(bracket_order,lower_bound,upper_bound,rate_percent)
    where not exists (
      select 1 from public.payroll_tax_brackets existing
      where existing.config_set_id=config_id and existing.bracket_order=seed.bracket_order
    );

    if not exists (
      select 1 from public.payroll_pension_rules
      where config_set_id = config_id and employee_category = 'standard'
    ) then
      insert into public.payroll_pension_rules(
        company_id, config_set_id, employee_rate_percent, employer_rate_percent,
        employee_category
      ) values (company_row.id, config_id, 5, 5, 'standard');
    end if;

    for account_row in
      select mapping.code mapping_code, account.id account_id,
        case when account.normal_balance = 'debit' then 'debit' else 'credit' end side
      from (values
        ('SALARY_EXPENSE','6100'),
        ('EMPLOYER_PENSION_EXPENSE','6110'),
        ('EMPLOYEE_PENSION_PAYABLE','2220'),
        ('EMPLOYER_PENSION_PAYABLE','2220'),
        ('PERSONAL_INCOME_TAX_PAYABLE','2230'),
        ('OTHER_DEDUCTION_PAYABLE','2200'),
        ('NET_SALARY_PAYABLE','2210')
      ) mapping(code, account_code)
      join public.chart_of_accounts account
        on account.company_id = company_row.id and account.code = mapping.account_code
       and account.active and account.posting_allowed
    loop
      if not exists (
        select 1 from public.payroll_posting_mappings existing
        where existing.company_id=company_row.id and existing.mapping_code=account_row.mapping_code
          and existing.effective_from=date '2026-01-01' and existing.branch_id is null
          and existing.department is null and existing.cost_centre_id is null and existing.project_id is null
      ) then
        insert into public.payroll_posting_mappings(
          company_id, mapping_code, account_id, side, effective_from, created_by
        ) values (
          company_row.id, account_row.mapping_code, account_row.account_id,
          account_row.side, date '2026-01-01', (select auth.uid())
        );
      end if;
    end loop;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Purchase VAT treatment and source-document fields
-- ---------------------------------------------------------------------------

alter table public.supplier_bills
  add column if not exists input_vat_recoverable_amount numeric(20,4) not null default 0,
  add column if not exists input_vat_non_recoverable_amount numeric(20,4) not null default 0,
  add column if not exists is_import boolean not null default false,
  add column if not exists reverse_charge boolean not null default false,
  add column if not exists tax_reporting_category text not null default 'domestic_purchase',
  add column if not exists customs_document_reference text;

alter table public.supplier_bills
  drop constraint if exists supplier_bills_vat_split_check;
alter table public.supplier_bills
  add constraint supplier_bills_vat_split_check check (
    input_vat_recoverable_amount >= 0
    and input_vat_non_recoverable_amount >= 0
    and input_vat_recoverable_amount + input_vat_non_recoverable_amount <= greatest(coalesce(tax_amount, 0), 0) + 0.0001
  );

create or replace function public.post_supplier_bill(
  p_bill_id uuid,
  p_idempotency_key uuid default null,
  p_reason text default null
)
returns public.supplier_bills
language plpgsql
security definer
set search_path = ''
as $$
declare
  bill_row public.supplier_bills;
  vendor_row public.vendors;
  journal_row public.journal_entries;
  expense_account_id uuid;
  payable_account_id uuid;
  input_vat_account_id uuid;
  gross_amount numeric(20,4);
  bill_tax_amount numeric(20,4);
  recoverable_vat numeric(20,4);
  nonrecoverable_vat numeric(20,4);
  expense_amount numeric(20,4);
  line_number integer := 0;
begin
  select * into bill_row from public.supplier_bills where id = p_bill_id for update;
  if not found then raise exception 'Supplier bill not found' using errcode = 'P0002'; end if;
  if not (select private.has_company_permission(bill_row.company_id, 'supplier_bill.post')) then
    raise exception 'Insufficient permission to post supplier bills' using errcode = '42501';
  end if;
  if bill_row.accounting_state = 'posted' then
    if p_idempotency_key is null or bill_row.idempotency_key = p_idempotency_key then return bill_row; end if;
    raise exception 'Supplier bill has already been posted' using errcode = '55000';
  end if;
  if bill_row.accounting_state <> 'ready_for_posting' then
    raise exception 'Supplier bill must be prepared before posting' using errcode = '55000';
  end if;
  select * into vendor_row from public.vendors where id = bill_row.vendor_id and company_id = bill_row.company_id;
  if not found then raise exception 'Supplier is invalid for this company' using errcode = '23514'; end if;

  gross_amount := round(coalesce(bill_row.total_amount, 0), 4);
  bill_tax_amount := round(greatest(coalesce(bill_row.tax_amount, 0), 0), 4);
  recoverable_vat := round(greatest(coalesce(bill_row.input_vat_recoverable_amount, 0), 0), 4);
  nonrecoverable_vat := round(greatest(coalesce(bill_row.input_vat_non_recoverable_amount, 0), 0), 4);
  -- Existing bills did not capture deductibility. They remain non-recoverable
  -- until a user explicitly classifies the VAT, never silently deductible.
  if recoverable_vat = 0 and nonrecoverable_vat = 0 and bill_tax_amount > 0 then
    nonrecoverable_vat := bill_tax_amount;
  end if;
  if round(recoverable_vat + nonrecoverable_vat, 4) <> bill_tax_amount then
    raise exception 'Purchase VAT must be explicitly split into recoverable and non-recoverable amounts' using errcode = '23514';
  end if;
  expense_amount := round(gross_amount - bill_tax_amount + nonrecoverable_vat, 4);
  if gross_amount <= 0 or expense_amount < 0 then raise exception 'Supplier bill amounts are invalid' using errcode = '23514'; end if;

  if vendor_row.default_expense_account_id is not null then
    select id into expense_account_id from public.chart_of_accounts
    where id = vendor_row.default_expense_account_id and company_id = bill_row.company_id and active and posting_allowed;
  end if;
  if expense_account_id is null then
    select id into expense_account_id from public.chart_of_accounts
    where company_id = bill_row.company_id and code = '6010' and active and posting_allowed limit 1;
  end if;
  if vendor_row.default_payable_account_id is not null then
    select id into payable_account_id from public.chart_of_accounts
    where id = vendor_row.default_payable_account_id and company_id = bill_row.company_id and active and posting_allowed;
  end if;
  if payable_account_id is null then
    select id into payable_account_id from public.chart_of_accounts
    where company_id = bill_row.company_id and code = '2010' and active and posting_allowed limit 1;
  end if;
  select id into input_vat_account_id from public.chart_of_accounts
  where company_id = bill_row.company_id and code = '1300' and active and posting_allowed limit 1;
  if expense_account_id is null or payable_account_id is null or (recoverable_vat > 0 and input_vat_account_id is null) then
    raise exception 'Supplier bill accounts are not mapped' using errcode = '23514';
  end if;

  journal_row := public.create_journal_entry(
    bill_row.company_id, coalesce(bill_row.posting_date, bill_row.issue_date, current_date),
    coalesce(bill_row.issue_date, current_date), 'Supplier bill ' || bill_row.bill_number,
    bill_row.bill_number, bill_row.currency, bill_row.exchange_rate, bill_row.branch_id, 'automatic'
  );
  update public.journal_entries
  set source_type = 'supplier_bill', source_id = bill_row.id, source_key = bill_row.bill_number,
      metadata = jsonb_build_object('netExpense', expense_amount, 'tax', bill_tax_amount,
        'recoverableVat', recoverable_vat, 'nonRecoverableVat', nonrecoverable_vat)
  where id = journal_row.id;
  if expense_amount > 0 then
    line_number := line_number + 1;
    insert into public.journal_entry_lines(journal_entry_id,company_id,line_number,account_id,description,debit,credit,transaction_currency,transaction_amount,branch_id,created_by)
    values(journal_row.id,bill_row.company_id,line_number,expense_account_id,'Supplier expense',expense_amount,0,bill_row.currency,expense_amount,bill_row.branch_id,(select auth.uid()));
  end if;
  if recoverable_vat > 0 then
    line_number := line_number + 1;
    insert into public.journal_entry_lines(journal_entry_id,company_id,line_number,account_id,description,debit,credit,transaction_currency,transaction_amount,branch_id,tax_code,tax_amount,created_by)
    values(journal_row.id,bill_row.company_id,line_number,input_vat_account_id,'Recoverable input VAT',recoverable_vat,0,bill_row.currency,recoverable_vat,bill_row.branch_id,bill_row.tax_reporting_category,recoverable_vat,(select auth.uid()));
  end if;
  line_number := line_number + 1;
  insert into public.journal_entry_lines(journal_entry_id,company_id,line_number,account_id,description,debit,credit,transaction_currency,transaction_amount,branch_id,created_by)
  values(journal_row.id,bill_row.company_id,line_number,payable_account_id,'Supplier payable',0,gross_amount,bill_row.currency,gross_amount,bill_row.branch_id,(select auth.uid()));
  journal_row := public.post_journal_entry(journal_row.id, coalesce(nullif(trim(p_reason), ''), 'Supplier bill posted'));

  perform set_config('app.financial_workflow', 'authorized', true);
  perform set_config('app.change_reason', coalesce(nullif(trim(p_reason), ''), 'Supplier bill posted'), true);
  update public.supplier_bills
  set accounting_state = 'posted', posting_date = coalesce(posting_date, issue_date, current_date),
      fiscal_year_id = (select fiscal_year_id from public.accounting_periods where id = journal_row.period_id),
      posted_at = clock_timestamp(), posted_by = (select auth.uid()), posting_journal_entry_id = journal_row.id,
      idempotency_key = coalesce(p_idempotency_key, idempotency_key), total_amount = gross_amount, tax_amount = bill_tax_amount,
      input_vat_recoverable_amount = recoverable_vat, input_vat_non_recoverable_amount = nonrecoverable_vat
  where id = bill_row.id returning * into bill_row;
  perform set_config('app.financial_workflow', '', true);
  perform set_config('app.change_reason', '', true);
  return bill_row;
end
$$;

revoke all on function public.save_payroll_posting_mapping(uuid,text,uuid,uuid,uuid,uuid,date,text) from public;
grant execute on function public.save_payroll_posting_mapping(uuid,text,uuid,uuid,uuid,uuid,date,text) to authenticated;

-- ---------------------------------------------------------------------------
-- Kosovo Sales Book and Purchase Book
-- ---------------------------------------------------------------------------

create or replace view public.kosovo_sales_book
with (security_invoker = true)
as
select
  invoice.company_id,
  date_trunc('month', coalesce(invoice.issue_date, invoice.posting_date, current_date))::date as period_start,
  invoice.id as invoice_id,
  invoice.invoice_number,
  coalesce(invoice.issue_date, invoice.posting_date) as invoice_date,
  invoice.client_id,
  client.name as customer_name,
  coalesce(client.nui, client.fiscal_number, client.vat_number, client.tax_id) as customer_fiscal_number,
  coalesce(nullif(invoice.tax_reporting_category, ''),
    case
      when max(coalesce(item.tax_rate, 0)) = 18 then 'standard_18'
      when max(coalesce(item.tax_rate, 0)) = 8 then 'reduced_8'
      when max(coalesce(item.tax_rate, 0)) = 0 then 'zero_rated'
      else 'classified_review_required'
    end) as vat_classification,
  max(coalesce(item.tax_rate, 0))::numeric(8,4) as vat_rate,
  round(sum(coalesce(item.amount, 0)) * case when invoice.credit_of_invoice_id is not null or lower(coalesce(invoice.type, '')) = 'credit_note' then -1 else 1 end, 4) as taxable_base,
  round(sum(round(coalesce(item.amount, 0) * coalesce(item.tax_rate, 0) / 100, 4)) * case when invoice.credit_of_invoice_id is not null or lower(coalesce(invoice.type, '')) = 'credit_note' then -1 else 1 end, 4) as output_vat,
  round(coalesce(invoice.total_amount, 0) * case when invoice.credit_of_invoice_id is not null or lower(coalesce(invoice.type, '')) = 'credit_note' then -1 else 1 end, 4) as total_amount,
  invoice.credit_of_invoice_id is not null or lower(coalesce(invoice.type, '')) = 'credit_note' as is_credit_note,
  invoice.posting_journal_entry_id as source_journal_entry_id
from public.invoices invoice
join public.invoice_items item on item.invoice_id = invoice.id
left join public.clients client on client.id = invoice.client_id
where invoice.accounting_state = 'posted'
  and invoice.status not in ('cancelled'::public.invoice_status, 'reversed'::public.invoice_status)
group by
  invoice.company_id, invoice.id, invoice.invoice_number, invoice.issue_date, invoice.posting_date,
  invoice.client_id, client.name, client.nui, client.fiscal_number, client.vat_number, client.tax_id,
  invoice.tax_reporting_category, invoice.type, invoice.credit_of_invoice_id, invoice.total_amount,
  invoice.posting_journal_entry_id;

create or replace view public.kosovo_purchase_book
with (security_invoker = true)
as
select
  bill.company_id,
  date_trunc('month', coalesce(bill.issue_date, bill.posting_date, current_date))::date as period_start,
  bill.id as supplier_bill_id,
  bill.bill_number,
  coalesce(bill.issue_date, bill.posting_date) as bill_date,
  bill.vendor_id,
  vendor.name as supplier_name,
  coalesce(vendor.fiscal_number, vendor.vat_number, vendor.tax_id) as supplier_fiscal_number,
  coalesce(nullif(bill.tax_reporting_category, ''), 'domestic_purchase') as vat_classification,
  round(coalesce(bill.total_amount, 0) - coalesce(bill.tax_amount, 0), 4) * case when bill.credit_of_bill_id is not null then -1 else 1 end as taxable_base,
  round(coalesce(bill.tax_amount, 0), 4) * case when bill.credit_of_bill_id is not null then -1 else 1 end as input_vat,
  round(coalesce(bill.input_vat_recoverable_amount, 0), 4) * case when bill.credit_of_bill_id is not null then -1 else 1 end as recoverable_vat,
  round(coalesce(bill.input_vat_non_recoverable_amount, 0), 4) * case when bill.credit_of_bill_id is not null then -1 else 1 end as nonrecoverable_vat,
  round(coalesce(bill.total_amount, 0), 4) * case when bill.credit_of_bill_id is not null then -1 else 1 end as total_amount,
  bill.is_import,
  bill.reverse_charge,
  bill.credit_of_bill_id is not null as is_credit_note,
  bill.posting_journal_entry_id as source_journal_entry_id
from public.supplier_bills bill
left join public.vendors vendor on vendor.id = bill.vendor_id
where bill.accounting_state = 'posted'
  and coalesce(bill.status, '') not in ('cancelled', 'reversed');

grant select on public.kosovo_sales_book, public.kosovo_purchase_book to authenticated;

create or replace view public.kosovo_tax_book_reconciliation
with (security_invoker = true)
as
with sales as (
  select company_id, coalesce(sum(output_vat), 0)::numeric(20,4) output_vat
  from public.kosovo_sales_book group by company_id
), purchases as (
  select company_id, coalesce(sum(recoverable_vat), 0)::numeric(20,4) recoverable_vat
  from public.kosovo_purchase_book group by company_id
), gl as (
  select entry.company_id,
    coalesce(sum(case when account.code = '2100' then line.credit - line.debit else 0 end), 0)::numeric(20,4) output_vat_gl,
    coalesce(sum(case when account.code = '1300' then line.debit - line.credit else 0 end), 0)::numeric(20,4) recoverable_vat_gl
  from public.journal_entries entry
  join public.journal_entry_lines line on line.journal_entry_id = entry.id
  join public.chart_of_accounts account on account.id = line.account_id
  where entry.status = 'posted'
    and entry.source_type in ('sales_invoice','pos_invoice','supplier_bill')
  group by entry.company_id
)
select
  company.id as company_id,
  coalesce(sales.output_vat, 0) as sales_book_output_vat,
  coalesce(gl.output_vat_gl, 0) as output_vat_gl,
  round(coalesce(sales.output_vat, 0) - coalesce(gl.output_vat_gl, 0), 4) as output_vat_difference,
  coalesce(purchases.recoverable_vat, 0) as purchase_book_recoverable_vat,
  coalesce(gl.recoverable_vat_gl, 0) as recoverable_vat_gl,
  round(coalesce(purchases.recoverable_vat, 0) - coalesce(gl.recoverable_vat_gl, 0), 4) as recoverable_vat_difference
from public.companies company
left join sales on sales.company_id = company.id
left join purchases on purchases.company_id = company.id
left join gl on gl.company_id = company.id;

grant select on public.kosovo_tax_book_reconciliation to authenticated;

-- ---------------------------------------------------------------------------
-- Withholding tax and tax declarations
-- ---------------------------------------------------------------------------

create table if not exists public.withholding_tax_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  category text not null,
  rate_percent numeric(8,4) not null check (rate_percent >= 0 and rate_percent <= 100),
  effective_from date not null,
  effective_until date,
  official_source text not null,
  requires_legal_review boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  check (effective_until is null or effective_until >= effective_from),
  unique (company_id, category, effective_from)
);

create index if not exists withholding_tax_rules_effective_idx
on public.withholding_tax_rules(company_id, category, effective_from desc);

create table if not exists public.withholding_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  rule_id uuid not null references public.withholding_tax_rules(id) on delete restrict,
  category text not null,
  source_type text not null,
  source_id uuid,
  payment_date date not null,
  gross_amount numeric(20,4) not null check (gross_amount >= 0),
  rate_percent numeric(8,4) not null check (rate_percent >= 0 and rate_percent <= 100),
  withheld_amount numeric(20,4) not null check (withheld_amount >= 0),
  currency text not null default 'EUR',
  status text not null default 'posted' check (status in ('draft','posted','reversed')),
  journal_entry_id uuid references public.journal_entries(id) on delete restrict,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (company_id, idempotency_key)
);

alter table public.withholding_tax_rules enable row level security;
alter table public.withholding_transactions enable row level security;
drop policy if exists withholding_tax_rules_select on public.withholding_tax_rules;
create policy withholding_tax_rules_select on public.withholding_tax_rules for select to authenticated
using ((select private.has_company_permission(company_id, 'withholding.manage')) or (select private.has_company_permission(company_id, 'tax.book.view')));
drop policy if exists withholding_tax_rules_write on public.withholding_tax_rules;
create policy withholding_tax_rules_write on public.withholding_tax_rules for all to authenticated
using ((select private.has_company_permission(company_id, 'withholding.manage')))
with check ((select private.has_company_permission(company_id, 'withholding.manage')));
drop policy if exists withholding_transactions_select on public.withholding_transactions;
create policy withholding_transactions_select on public.withholding_transactions for select to authenticated
using ((select private.has_company_permission(company_id, 'withholding.manage')) or (select private.has_company_permission(company_id, 'tax.book.view')));
drop policy if exists withholding_transactions_insert on public.withholding_transactions;
create policy withholding_transactions_insert on public.withholding_transactions for insert to authenticated
with check ((select private.has_company_permission(company_id, 'withholding.manage')));
revoke update, delete, truncate on public.withholding_transactions from anon, authenticated;
grant select on public.withholding_tax_rules, public.withholding_transactions to authenticated;

do $$
declare company_row record;
begin
  for company_row in select id from public.companies loop
    insert into public.withholding_tax_rules(
      company_id, category, rate_percent, effective_from, official_source, requires_legal_review
    ) values (
      company_row.id, 'rent', 9, date '2026-01-01',
      'https://www.atk-ks.org/pyetje-te-shpeshta/?wpfaqpage=103', false
    ) on conflict (company_id, category, effective_from) do update set
      rate_percent = excluded.rate_percent, official_source = excluded.official_source,
      requires_legal_review = excluded.requires_legal_review;
    insert into public.withholding_tax_rules(
      company_id, category, rate_percent, effective_from, official_source, requires_legal_review
    ) values (
      company_row.id, 'other_applicable', 0, date '2026-01-01',
      'https://www.atk-ks.org/en/udhezues-manuale-dhe-rregullore/', true
    ) on conflict (company_id, category, effective_from) do nothing;
  end loop;
end
$$;

create or replace function public.calculate_withholding(
  p_company_id uuid,
  p_category text,
  p_gross_amount numeric,
  p_payment_date date default current_date
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare rule_row public.withholding_tax_rules;
begin
  if not (select private.has_company_permission(p_company_id, 'withholding.manage')) then
    raise exception 'Insufficient permission to calculate withholding' using errcode = '42501';
  end if;
  select * into rule_row from public.withholding_tax_rules
  where company_id = p_company_id and category = lower(trim(p_category))
    and effective_from <= coalesce(p_payment_date, current_date)
    and (effective_until is null or effective_until >= coalesce(p_payment_date, current_date))
  order by effective_from desc limit 1;
  if not found then raise exception 'No effective withholding rule exists for category %', p_category using errcode = 'P0002'; end if;
  if rule_row.requires_legal_review then
    raise exception 'Withholding category % requires legal review before calculation', rule_row.category using errcode = '55000';
  end if;
  return round(greatest(coalesce(p_gross_amount, 0), 0) * rule_row.rate_percent / 100, 2);
end
$$;

create or replace function public.record_withholding(
  p_company_id uuid,
  p_category text,
  p_source_type text,
  p_source_id uuid,
  p_payment_date date,
  p_gross_amount numeric,
  p_idempotency_key uuid
)
returns public.withholding_transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_row public.withholding_transactions;
  rule_row public.withholding_tax_rules;
  result public.withholding_transactions;
begin
  if not (select private.has_company_permission(p_company_id, 'withholding.manage')) then
    raise exception 'Insufficient permission to record withholding' using errcode = '42501';
  end if;
  select * into existing_row from public.withholding_transactions
  where company_id = p_company_id and idempotency_key = p_idempotency_key;
  if found then return existing_row; end if;
  select * into rule_row from public.withholding_tax_rules
  where company_id = p_company_id and category = lower(trim(p_category))
    and effective_from <= p_payment_date and (effective_until is null or effective_until >= p_payment_date)
  order by effective_from desc limit 1;
  if not found then raise exception 'No effective withholding rule exists' using errcode = 'P0002'; end if;
  if rule_row.requires_legal_review then raise exception 'Withholding rule requires legal review' using errcode = '55000'; end if;
  insert into public.withholding_transactions(
    company_id, rule_id, category, source_type, source_id, payment_date,
    gross_amount, rate_percent, withheld_amount, idempotency_key, created_by
  ) values (
    p_company_id, rule_row.id, rule_row.category, p_source_type, p_source_id, p_payment_date,
    round(greatest(coalesce(p_gross_amount,0),0),4), rule_row.rate_percent,
    round(greatest(coalesce(p_gross_amount,0),0) * rule_row.rate_percent / 100, 2),
    p_idempotency_key, (select auth.uid())
  ) returning * into result;
  return result;
end
$$;

create table if not exists public.tax_declarations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  declaration_type text not null check (declaration_type in ('vat','sales_book','purchase_book','payroll_withholding','pension','withholding','corporate_tax')),
  period_start date not null,
  period_end date not null,
  status text not null default 'draft' check (status in ('draft','ready','exported','submitted_manually','confirmed','amended')),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  source_checksum text,
  exported_at timestamptz,
  submitted_manually_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  check (period_end >= period_start),
  unique (company_id, declaration_type, period_start, period_end)
);

alter table public.tax_declarations enable row level security;
drop policy if exists tax_declarations_select on public.tax_declarations;
create policy tax_declarations_select on public.tax_declarations for select to authenticated
using ((select private.has_company_permission(company_id, 'tax.declaration.prepare')) or (select private.has_company_permission(company_id, 'tax.book.view')));
drop policy if exists tax_declarations_write on public.tax_declarations;
create policy tax_declarations_write on public.tax_declarations for all to authenticated
using ((select private.has_company_permission(company_id, 'tax.declaration.prepare')))
with check ((select private.has_company_permission(company_id, 'tax.declaration.prepare')));
grant select on public.tax_declarations to authenticated;

create or replace function public.prepare_tax_declaration(
  p_company_id uuid,
  p_declaration_type text,
  p_period_start date,
  p_period_end date
)
returns public.tax_declarations
language plpgsql
security definer
set search_path = ''
as $$
declare result public.tax_declarations;
declare payload_value jsonb;
begin
  if not (select private.has_company_permission(p_company_id, 'tax.declaration.prepare')) then
    raise exception 'Insufficient permission to prepare tax declaration' using errcode = '42501';
  end if;
  payload_value := jsonb_build_object(
    'declarationType', lower(trim(p_declaration_type)),
    'periodStart', p_period_start,
    'periodEnd', p_period_end,
    'submittedElectronically', false,
    'salesBook', coalesce((select jsonb_agg(to_jsonb(book) order by book.invoice_date, book.invoice_number)
      from public.kosovo_sales_book book where book.company_id=p_company_id and book.period_start between date_trunc('month',p_period_start)::date and date_trunc('month',p_period_end)::date), '[]'::jsonb),
    'purchaseBook', coalesce((select jsonb_agg(to_jsonb(book) order by book.bill_date, book.bill_number)
      from public.kosovo_purchase_book book where book.company_id=p_company_id and book.period_start between date_trunc('month',p_period_start)::date and date_trunc('month',p_period_end)::date), '[]'::jsonb),
    'withholding', coalesce((select jsonb_agg(to_jsonb(item) order by item.payment_date)
      from public.withholding_transactions item where item.company_id=p_company_id and item.payment_date between p_period_start and p_period_end), '[]'::jsonb)
  );
  insert into public.tax_declarations(company_id,declaration_type,period_start,period_end,status,payload,source_checksum,created_by,updated_by)
  values(p_company_id,lower(trim(p_declaration_type)),p_period_start,p_period_end,'ready',payload_value,
    encode(extensions.digest(convert_to(payload_value::text,'UTF8'),'sha256'),'hex'),(select auth.uid()),(select auth.uid()))
  on conflict (company_id,declaration_type,period_start,period_end) do update set
    payload=excluded.payload, source_checksum=excluded.source_checksum, status=case when public.tax_declarations.status in ('submitted_manually','confirmed') then 'amended' else 'ready' end,
    updated_at=clock_timestamp(), updated_by=(select auth.uid())
  returning * into result;
  return result;
end
$$;

create table if not exists public.tax_calendar_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  tax_type text not null,
  period_start date not null,
  period_end date not null,
  due_date date not null,
  title text not null,
  status text not null default 'open' check (status in ('open','completed')),
  completed_at timestamptz,
  source_reference text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique(company_id,tax_type,period_start,period_end)
);

alter table public.tax_calendar_events enable row level security;
drop policy if exists tax_calendar_events_select on public.tax_calendar_events;
create policy tax_calendar_events_select on public.tax_calendar_events for select to authenticated
using ((select private.has_company_permission(company_id, 'tax.calendar.manage')) or (select private.has_company_permission(company_id, 'tax.book.view')));
drop policy if exists tax_calendar_events_write on public.tax_calendar_events;
create policy tax_calendar_events_write on public.tax_calendar_events for all to authenticated
using ((select private.has_company_permission(company_id, 'tax.calendar.manage')))
with check ((select private.has_company_permission(company_id, 'tax.calendar.manage')));
grant select on public.tax_calendar_events to authenticated;

create or replace view public.kosovo_tax_calendar
with (security_invoker = true)
as
select event.*,
  case when event.status = 'completed' then 'completed'
    when event.due_date < current_date then 'overdue'
    when event.due_date <= current_date + 7 then 'due_soon'
    else 'upcoming' end as display_status
from public.tax_calendar_events event;
grant select on public.kosovo_tax_calendar to authenticated;

create or replace function public.generate_kosovo_tax_calendar(p_company_id uuid, p_year integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare inserted_count integer := 0; v_period_start date; v_period_end date; v_due_date date;
begin
  if not (select private.has_company_permission(p_company_id, 'tax.calendar.manage')) then
    raise exception 'Insufficient permission to generate tax calendar' using errcode = '42501';
  end if;
  for month_index in 1..12 loop
    v_period_start := make_date(p_year, month_index, 1);
    v_period_end := (v_period_start + interval '1 month - 1 day')::date;
    v_due_date := (v_period_end + interval '1 month')::date;
    if exists(select 1 from public.companies where id=p_company_id and vat_registration_status <> 'not_registered') then
      insert into public.tax_calendar_events(company_id,tax_type,period_start,period_end,due_date,title,source_reference,created_by)
      values(p_company_id,'vat',v_period_start,v_period_end,make_date(extract(year from v_due_date)::integer,extract(month from v_due_date)::integer,20),'VAT declaration',
        'https://www.atk-ks.org/en/portfolio/informata-te-pergjithshme-per-tatimet-ne-kosove/',(select auth.uid()))
      on conflict (company_id,tax_type,period_start,period_end) do update set due_date=excluded.due_date;
      inserted_count := inserted_count + 1;
      insert into public.tax_calendar_events(company_id,tax_type,period_start,period_end,due_date,title,source_reference,created_by)
      values(p_company_id,'sales_book',v_period_start,v_period_end,make_date(extract(year from v_due_date)::integer,extract(month from v_due_date)::integer,20),'Libri i Shitjes',
        'https://www.atk-ks.org/en/librat-e-blerjes-dhe-te-shitjes/',(select auth.uid()))
      on conflict (company_id,tax_type,period_start,period_end) do update set due_date=excluded.due_date;
      insert into public.tax_calendar_events(company_id,tax_type,period_start,period_end,due_date,title,source_reference,created_by)
      values(p_company_id,'purchase_book',v_period_start,v_period_end,make_date(extract(year from v_due_date)::integer,extract(month from v_due_date)::integer,20),'Libri i Blerjes',
        'https://www.atk-ks.org/en/librat-e-blerjes-dhe-te-shitjes/',(select auth.uid()))
      on conflict (company_id,tax_type,period_start,period_end) do update set due_date=excluded.due_date;
    end if;
    if exists(select 1 from public.employees where company_id=p_company_id and status='active') then
      insert into public.tax_calendar_events(company_id,tax_type,period_start,period_end,due_date,title,source_reference,created_by)
      values(p_company_id,'payroll_withholding',v_period_start,v_period_end,make_date(extract(year from v_due_date)::integer,extract(month from v_due_date)::integer,15),'Payroll withholding and pension',
        'https://crmm.atk-ks.org/en/Public/GuideInteractivityAnswers/7a53613a-cb62-4671-2fde-08dba4862e41',(select auth.uid()))
      on conflict (company_id,tax_type,period_start,period_end) do update set due_date=excluded.due_date;
    end if;
  end loop;
  insert into public.tax_calendar_events(company_id,tax_type,period_start,period_end,due_date,title,source_reference,created_by)
  values
    (p_company_id,'personal_income_tax',make_date(p_year,1,1),make_date(p_year,12,31),make_date(p_year+1,3,31),'Annual PIT information',
      'https://www.atk-ks.org/en/portfolio/informata-te-pergjithshme-per-tatimet-ne-kosove/',(select auth.uid())),
    (p_company_id,'corporate_tax',make_date(p_year,1,1),make_date(p_year,12,31),make_date(p_year+1,3,31),'Annual corporate/business tax information',
      'https://www.atk-ks.org/en/portfolio/informata-te-pergjithshme-per-tatimet-ne-kosove/',(select auth.uid()))
  on conflict (company_id,tax_type,period_start,period_end) do update set due_date=excluded.due_date;
  return inserted_count;
end
$$;

-- ---------------------------------------------------------------------------
-- Fixed assets and separate book/tax depreciation
-- ---------------------------------------------------------------------------

create table if not exists public.fixed_assets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  asset_number text not null,
  name text not null,
  category text not null,
  supplier_id uuid references public.vendors(id) on delete restrict,
  acquisition_date date not null,
  placed_in_service_date date not null,
  acquisition_cost numeric(20,4) not null check (acquisition_cost > 0),
  currency text not null default 'EUR',
  useful_life_months integer not null check (useful_life_months > 0),
  book_depreciation_method text not null default 'straight_line' check (book_depreciation_method in ('straight_line')),
  tax_category smallint not null default 2 check (tax_category in (1,2,3)),
  tax_depreciation_rate_percent numeric(8,4) not null check (tax_depreciation_rate_percent >= 0 and tax_depreciation_rate_percent <= 100),
  accumulated_book_depreciation numeric(20,4) not null default 0 check (accumulated_book_depreciation >= 0),
  accumulated_tax_depreciation numeric(20,4) not null default 0 check (accumulated_tax_depreciation >= 0),
  net_book_value numeric(20,4) not null,
  location text,
  responsible_employee_id uuid references public.employees(id) on delete restrict,
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  status text not null default 'active' check (status in ('active','disposed','written_off')),
  asset_account_id uuid not null references public.chart_of_accounts(id) on delete restrict,
  depreciation_expense_account_id uuid not null references public.chart_of_accounts(id) on delete restrict,
  accumulated_depreciation_account_id uuid not null references public.chart_of_accounts(id) on delete restrict,
  acquisition_journal_entry_id uuid references public.journal_entries(id) on delete restrict,
  source_bill_id uuid references public.supplier_bills(id) on delete restrict,
  idempotency_key uuid,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique(company_id, asset_number),
  unique(company_id, idempotency_key),
  check (placed_in_service_date >= acquisition_date),
  check (net_book_value >= 0),
  check (accumulated_book_depreciation <= acquisition_cost + 0.0001),
  check (accumulated_tax_depreciation <= acquisition_cost + 0.0001)
);

create table if not exists public.asset_depreciation_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  frequency text not null check (frequency in ('monthly','yearly')),
  status text not null default 'preview' check (status in ('preview','posted','reversed')),
  journal_entry_id uuid references public.journal_entries(id) on delete restrict,
  idempotency_key uuid not null,
  posted_at timestamptz,
  posted_by uuid references auth.users(id) on delete set null,
  reversed_at timestamptz,
  reversed_by uuid references auth.users(id) on delete set null,
  reversal_reason text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique(company_id, idempotency_key),
  unique(company_id, period_start, period_end, frequency),
  check(period_end >= period_start)
);

create table if not exists public.asset_depreciation_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  run_id uuid not null references public.asset_depreciation_runs(id) on delete restrict,
  asset_id uuid not null references public.fixed_assets(id) on delete restrict,
  book_depreciation_amount numeric(20,4) not null check (book_depreciation_amount >= 0),
  tax_depreciation_amount numeric(20,4) not null check (tax_depreciation_amount >= 0),
  book_accumulated_after numeric(20,4) not null,
  tax_accumulated_after numeric(20,4) not null,
  created_at timestamptz not null default now(),
  unique(run_id, asset_id)
);

create table if not exists public.asset_disposals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  asset_id uuid not null references public.fixed_assets(id) on delete restrict,
  disposal_date date not null,
  disposal_type text not null check (disposal_type in ('disposed','written_off')),
  proceeds numeric(20,4) not null default 0 check (proceeds >= 0),
  journal_entry_id uuid references public.journal_entries(id) on delete restrict,
  reason text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique(asset_id)
);

alter table public.fixed_assets enable row level security;
alter table public.asset_depreciation_runs enable row level security;
alter table public.asset_depreciation_lines enable row level security;
alter table public.asset_disposals enable row level security;

drop policy if exists fixed_assets_select on public.fixed_assets;
create policy fixed_assets_select on public.fixed_assets for select to authenticated
using ((select private.has_company_permission(company_id, 'asset.view')) or (select private.has_company_permission(company_id, 'asset.manage')));
drop policy if exists fixed_assets_write on public.fixed_assets;
create policy fixed_assets_write on public.fixed_assets for all to authenticated
using ((select private.has_company_permission(company_id, 'asset.manage')))
with check ((select private.has_company_permission(company_id, 'asset.manage')));
drop policy if exists asset_depreciation_runs_select on public.asset_depreciation_runs;
create policy asset_depreciation_runs_select on public.asset_depreciation_runs for select to authenticated
using ((select private.has_company_permission(company_id, 'asset.view')) or (select private.has_company_permission(company_id, 'asset.depreciation.post')));
drop policy if exists asset_depreciation_runs_write on public.asset_depreciation_runs;
create policy asset_depreciation_runs_write on public.asset_depreciation_runs for all to authenticated
using ((select private.has_company_permission(company_id, 'asset.depreciation.post')))
with check ((select private.has_company_permission(company_id, 'asset.depreciation.post')));
drop policy if exists asset_depreciation_lines_select on public.asset_depreciation_lines;
create policy asset_depreciation_lines_select on public.asset_depreciation_lines for select to authenticated
using ((select private.has_company_permission(company_id, 'asset.view')) or (select private.has_company_permission(company_id, 'asset.depreciation.post')));
drop policy if exists asset_disposals_select on public.asset_disposals;
create policy asset_disposals_select on public.asset_disposals for select to authenticated
using ((select private.has_company_permission(company_id, 'asset.view')) or (select private.has_company_permission(company_id, 'asset.manage')));
grant select on public.fixed_assets, public.asset_depreciation_runs, public.asset_depreciation_lines, public.asset_disposals to authenticated;

create or replace function public.register_fixed_asset(
  p_company_id uuid,
  p_name text,
  p_category text,
  p_acquisition_date date,
  p_placed_in_service_date date,
  p_acquisition_cost numeric,
  p_useful_life_months integer,
  p_tax_category smallint default 2,
  p_supplier_id uuid default null,
  p_location text default null,
  p_responsible_employee_id uuid default null,
  p_attachments jsonb default '[]'::jsonb,
  p_source_bill_id uuid default null,
  p_idempotency_key uuid default null
)
returns public.fixed_assets
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.fixed_assets;
  existing_asset public.fixed_assets;
  company_currency text;
  asset_account_id uuid;
  depreciation_expense_account_id uuid;
  accumulated_depreciation_account_id uuid;
  payable_account_id uuid;
  equity_account_id uuid;
  journal_row public.journal_entries;
  next_number integer;
  tax_rate numeric(8,4);
begin
  if not (select private.has_company_permission(p_company_id, 'asset.manage')) then
    raise exception 'Insufficient permission to register fixed assets' using errcode = '42501';
  end if;
  if p_idempotency_key is not null then
    select * into existing_asset from public.fixed_assets
    where company_id = p_company_id and idempotency_key = p_idempotency_key;
    if found then return existing_asset; end if;
  end if;
  if trim(coalesce(p_name,'')) = '' or p_acquisition_cost <= 0 or p_useful_life_months <= 0 then
    raise exception 'Asset name, cost and useful life are required' using errcode = '23514';
  end if;
  if p_tax_category not in (1,2,3) then raise exception 'Unsupported Kosovo tax depreciation category' using errcode = '23514'; end if;
  tax_rate := case p_tax_category when 1 then 5 when 2 then 20 when 3 then 10 end;
  select currency into company_currency from public.companies where id = p_company_id;
  select id into asset_account_id from public.chart_of_accounts where company_id=p_company_id and code='1500' and active and posting_allowed limit 1;
  select id into depreciation_expense_account_id from public.chart_of_accounts where company_id=p_company_id and code='6200' and active and posting_allowed limit 1;
  select id into accumulated_depreciation_account_id from public.chart_of_accounts where company_id=p_company_id and code='1590' and active and posting_allowed limit 1;
  select id into payable_account_id from public.chart_of_accounts where company_id=p_company_id and code='2010' and active and posting_allowed limit 1;
  select id into equity_account_id from public.chart_of_accounts where company_id=p_company_id and code='3000' and active and posting_allowed limit 1;
  if asset_account_id is null or depreciation_expense_account_id is null or accumulated_depreciation_account_id is null or coalesce(payable_account_id,equity_account_id) is null then
    raise exception 'Fixed-asset accounts are not mapped' using errcode = '23514';
  end if;
  select count(*) + 1 into next_number from public.fixed_assets where company_id=p_company_id;

  journal_row := public.create_journal_entry(
    p_company_id, p_acquisition_date, p_acquisition_date, 'Fixed asset acquisition: '||trim(p_name),
    'ASSET-'||next_number::text, coalesce(company_currency,'EUR'), 1, null, 'automatic'
  );
  update public.journal_entries set source_type='fixed_asset_acquisition', source_id=journal_row.id,
    source_key='ASSET-'||next_number::text, metadata=jsonb_build_object('assetName',trim(p_name))
  where id = journal_row.id;
  insert into public.journal_entry_lines(journal_entry_id,company_id,line_number,account_id,description,debit,credit,transaction_currency,transaction_amount,created_by)
  values(journal_row.id,p_company_id,1,asset_account_id,'Fixed asset acquisition',round(p_acquisition_cost,4),0,coalesce(company_currency,'EUR'),round(p_acquisition_cost,4),(select auth.uid()));
  insert into public.journal_entry_lines(journal_entry_id,company_id,line_number,account_id,description,debit,credit,transaction_currency,transaction_amount,created_by)
  values(journal_row.id,p_company_id,2,case when p_supplier_id is not null then payable_account_id else equity_account_id end,'Asset acquisition funding',0,round(p_acquisition_cost,4),coalesce(company_currency,'EUR'),round(p_acquisition_cost,4),(select auth.uid()));
  journal_row := public.post_journal_entry(journal_row.id, 'Fixed asset acquisition');

  insert into public.fixed_assets(
    company_id,asset_number,name,category,supplier_id,acquisition_date,placed_in_service_date,
    acquisition_cost,currency,useful_life_months,tax_category,tax_depreciation_rate_percent,
    net_book_value,location,responsible_employee_id,attachments,asset_account_id,
    depreciation_expense_account_id,accumulated_depreciation_account_id,acquisition_journal_entry_id,
    source_bill_id,idempotency_key,created_by,updated_by
  ) values (
    p_company_id,'A-'||extract(year from p_acquisition_date)::text||'-'||lpad(next_number::text,6,'0'),trim(p_name),trim(p_category),p_supplier_id,
    p_acquisition_date,p_placed_in_service_date,round(p_acquisition_cost,4),coalesce(company_currency,'EUR'),p_useful_life_months,p_tax_category,tax_rate,
    round(p_acquisition_cost,4),p_location,p_responsible_employee_id,coalesce(p_attachments,'[]'::jsonb),asset_account_id,
    depreciation_expense_account_id,accumulated_depreciation_account_id,journal_row.id,p_source_bill_id,p_idempotency_key,(select auth.uid()),(select auth.uid())
  ) returning * into result;
  return result;
end
$$;

create or replace function public.preview_asset_depreciation(
  p_company_id uuid,
  p_period_start date,
  p_period_end date,
  p_frequency text default 'monthly'
)
returns table(
  fixed_asset_id uuid,
  asset_number text,
  asset_name text,
  book_depreciation numeric,
  tax_depreciation numeric,
  book_accumulated_before numeric,
  tax_accumulated_before numeric
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.has_company_permission(p_company_id, 'asset.view'))
     and not (select private.has_company_permission(p_company_id, 'asset.depreciation.post')) then
    raise exception 'Insufficient permission to preview depreciation' using errcode = '42501';
  end if;
  if p_frequency not in ('monthly','yearly') or p_period_end < p_period_start then raise exception 'Invalid depreciation period' using errcode = '23514'; end if;
  return query
  select asset.id,asset.asset_number,asset.name,
    least(greatest(round(asset.acquisition_cost / asset.useful_life_months * case when p_frequency='yearly' then 12 else 1 end,4),0),greatest(asset.acquisition_cost-asset.accumulated_book_depreciation,0)),
    least(greatest(round(asset.acquisition_cost * asset.tax_depreciation_rate_percent / 100 * case when p_frequency='yearly' then 1 else 1.0/12 end,4),0),greatest(asset.acquisition_cost-asset.accumulated_tax_depreciation,0)),
    asset.accumulated_book_depreciation,asset.accumulated_tax_depreciation
  from public.fixed_assets asset
  where asset.company_id=p_company_id and asset.status='active' and asset.placed_in_service_date <= p_period_end
    and asset.accumulated_book_depreciation < asset.acquisition_cost;
end
$$;

create or replace function public.post_asset_depreciation(
  p_company_id uuid,
  p_period_start date,
  p_period_end date,
  p_frequency text,
  p_idempotency_key uuid,
  p_reason text
)
returns public.asset_depreciation_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.asset_depreciation_runs;
  existing_run public.asset_depreciation_runs;
  preview_row record;
  journal_row public.journal_entries;
  depreciation_expense_account_id uuid;
  accumulated_depreciation_account_id uuid;
  total_book numeric(20,4) := 0;
begin
  if not (select private.has_company_permission(p_company_id, 'asset.depreciation.post'))
     or not (select private.has_company_permission(p_company_id, 'journal.create'))
     or not (select private.has_company_permission(p_company_id, 'journal.post')) then
    raise exception 'Depreciation posting requires asset and journal permissions' using errcode = '42501';
  end if;
  if trim(coalesce(p_reason,'')) = '' then raise exception 'Depreciation posting reason is required' using errcode = '23514'; end if;
  select * into existing_run from public.asset_depreciation_runs where company_id=p_company_id and idempotency_key=p_idempotency_key for update;
  if found then return existing_run; end if;
  if exists(select 1 from public.asset_depreciation_runs where company_id=p_company_id and period_start=p_period_start and period_end=p_period_end and frequency=p_frequency and status='posted') then
    raise exception 'Depreciation has already been posted for this period' using errcode = '55000';
  end if;
  insert into public.asset_depreciation_runs(company_id,period_start,period_end,frequency,status,idempotency_key,created_by)
  values(p_company_id,p_period_start,p_period_end,p_frequency,'preview',p_idempotency_key,(select auth.uid())) returning * into result;
  for preview_row in select * from public.preview_asset_depreciation(p_company_id,p_period_start,p_period_end,p_frequency) loop
    insert into public.asset_depreciation_lines(company_id,run_id,asset_id,book_depreciation_amount,tax_depreciation_amount,book_accumulated_after,tax_accumulated_after)
    select p_company_id,result.id,asset.id,preview_row.book_depreciation,preview_row.tax_depreciation,
      asset.accumulated_book_depreciation+preview_row.book_depreciation,asset.accumulated_tax_depreciation+preview_row.tax_depreciation
    from public.fixed_assets asset where asset.id=preview_row.fixed_asset_id;
    total_book := total_book + preview_row.book_depreciation;
  end loop;
  if total_book > 0 then
    select id into depreciation_expense_account_id from public.chart_of_accounts where company_id=p_company_id and code='6200' and active and posting_allowed limit 1;
    select id into accumulated_depreciation_account_id from public.chart_of_accounts where company_id=p_company_id and code='1590' and active and posting_allowed limit 1;
    if depreciation_expense_account_id is null or accumulated_depreciation_account_id is null then raise exception 'Depreciation accounts are not mapped' using errcode='23514'; end if;
    journal_row := public.create_journal_entry(p_company_id,p_period_end,p_period_end,'Depreciation '||p_period_start::text||' to '||p_period_end::text,'AD-'||result.id::text,'EUR',1,null,'automatic');
    update public.journal_entries set source_type='asset_depreciation',source_id=result.id,source_key='AD-'||result.id::text
    where id = journal_row.id;
    insert into public.journal_entry_lines(journal_entry_id,company_id,line_number,account_id,description,debit,credit,transaction_currency,transaction_amount,created_by)
    values(journal_row.id,p_company_id,1,depreciation_expense_account_id,'Accounting depreciation',round(total_book,4),0,'EUR',round(total_book,4),(select auth.uid()));
    insert into public.journal_entry_lines(journal_entry_id,company_id,line_number,account_id,description,debit,credit,transaction_currency,transaction_amount,created_by)
    values(journal_row.id,p_company_id,2,accumulated_depreciation_account_id,'Accumulated depreciation',0,round(total_book,4),'EUR',round(total_book,4),(select auth.uid()));
    journal_row := public.post_journal_entry(journal_row.id,p_reason);
  end if;
  for preview_row in select line.asset_id,line.book_depreciation_amount,line.tax_depreciation_amount from public.asset_depreciation_lines line where line.run_id=result.id loop
    update public.fixed_assets asset set accumulated_book_depreciation=asset.accumulated_book_depreciation+preview_row.book_depreciation_amount,
      accumulated_tax_depreciation=asset.accumulated_tax_depreciation+preview_row.tax_depreciation_amount,
      net_book_value=asset.acquisition_cost-(asset.accumulated_book_depreciation+preview_row.book_depreciation_amount),updated_at=clock_timestamp(),updated_by=(select auth.uid())
    where asset.id=preview_row.asset_id;
  end loop;
  update public.asset_depreciation_runs set status='posted',journal_entry_id=journal_row.id,posted_at=clock_timestamp(),posted_by=(select auth.uid()) where id=result.id returning * into result;
  return result;
end
$$;

create or replace function public.reverse_asset_depreciation(p_run_id uuid, p_reason text)
returns public.asset_depreciation_runs
language plpgsql
security definer
set search_path = ''
as $$
declare result public.asset_depreciation_runs; line_row record;
begin
  select * into result from public.asset_depreciation_runs where id=p_run_id for update;
  if not found then raise exception 'Depreciation run not found' using errcode='P0002'; end if;
  if not (select private.has_company_permission(result.company_id,'asset.depreciation.post')) then raise exception 'Insufficient permission to reverse depreciation' using errcode='42501'; end if;
  if result.status <> 'posted' then raise exception 'Only posted depreciation can be reversed' using errcode='55000'; end if;
  if trim(coalesce(p_reason,''))='' then raise exception 'Depreciation reversal reason is required' using errcode='23514'; end if;
  if result.journal_entry_id is not null then perform public.reverse_journal_entry(result.journal_entry_id,current_date,p_reason); end if;
  for line_row in select * from public.asset_depreciation_lines where run_id=result.id loop
    update public.fixed_assets set accumulated_book_depreciation=greatest(accumulated_book_depreciation-line_row.book_depreciation_amount,0),
      accumulated_tax_depreciation=greatest(accumulated_tax_depreciation-line_row.tax_depreciation_amount,0),
      net_book_value=acquisition_cost-greatest(accumulated_book_depreciation-line_row.book_depreciation_amount,0),updated_at=clock_timestamp(),updated_by=(select auth.uid())
    where id=line_row.asset_id;
  end loop;
  update public.asset_depreciation_runs set status='reversed',reversed_at=clock_timestamp(),reversed_by=(select auth.uid()),reversal_reason=p_reason where id=result.id returning * into result;
  return result;
end
$$;

create or replace function public.dispose_fixed_asset(
  p_asset_id uuid,
  p_disposal_date date,
  p_disposal_type text,
  p_proceeds numeric default 0,
  p_reason text default null
)
returns public.asset_disposals
language plpgsql
security definer
set search_path = ''
as $$
declare
  asset_row public.fixed_assets;
  result public.asset_disposals;
  journal_row public.journal_entries;
  cash_account_id uuid;
  gain_account_id uuid;
  loss_account_id uuid;
  line_number integer := 0;
  net_book_value numeric(20,4);
  gain numeric(20,4);
  loss numeric(20,4);
begin
  select * into asset_row from public.fixed_assets where id=p_asset_id for update;
  if not found then raise exception 'Fixed asset not found' using errcode='P0002'; end if;
  if not (select private.has_company_permission(asset_row.company_id,'asset.manage'))
     or not (select private.has_company_permission(asset_row.company_id,'journal.create'))
     or not (select private.has_company_permission(asset_row.company_id,'journal.post')) then
    raise exception 'Asset disposal requires asset and journal permissions' using errcode='42501';
  end if;
  if asset_row.status <> 'active' then raise exception 'Only active assets can be disposed' using errcode='55000'; end if;
  if p_disposal_type not in ('disposed','written_off') or trim(coalesce(p_reason,''))='' then raise exception 'Disposal type and reason are required' using errcode='23514'; end if;
  net_book_value := greatest(asset_row.acquisition_cost-asset_row.accumulated_book_depreciation,0);
  gain := greatest(round(coalesce(p_proceeds,0)-net_book_value,4),0);
  loss := greatest(round(net_book_value-coalesce(p_proceeds,0),4),0);
  select id into cash_account_id from public.chart_of_accounts where company_id=asset_row.company_id and code='1010' and active and posting_allowed limit 1;
  select id into gain_account_id from public.chart_of_accounts where company_id=asset_row.company_id and code='4100' and active and posting_allowed limit 1;
  select id into loss_account_id from public.chart_of_accounts where company_id=asset_row.company_id and code='6010' and active and posting_allowed limit 1;
  journal_row := public.create_journal_entry(asset_row.company_id,p_disposal_date,p_disposal_date,'Fixed asset disposal: '||asset_row.asset_number,asset_row.asset_number,'EUR',1,null,'automatic');
  update public.journal_entries set source_type='fixed_asset_disposal',source_id=asset_row.id,source_key=asset_row.asset_number where id=journal_row.id;
  if asset_row.accumulated_book_depreciation > 0 then
    line_number:=line_number+1;
    insert into public.journal_entry_lines(journal_entry_id,company_id,line_number,account_id,description,debit,credit,transaction_currency,transaction_amount,created_by)
    values(journal_row.id,asset_row.company_id,line_number,asset_row.accumulated_depreciation_account_id,'Remove accumulated depreciation',asset_row.accumulated_book_depreciation,0,'EUR',asset_row.accumulated_book_depreciation,(select auth.uid()));
  end if;
  if p_proceeds > 0 then
    if cash_account_id is null then raise exception 'Cash account is not mapped' using errcode='23514'; end if;
    line_number:=line_number+1;
    insert into public.journal_entry_lines(journal_entry_id,company_id,line_number,account_id,description,debit,credit,transaction_currency,transaction_amount,created_by)
    values(journal_row.id,asset_row.company_id,line_number,cash_account_id,'Disposal proceeds',round(p_proceeds,4),0,'EUR',round(p_proceeds,4),(select auth.uid()));
  end if;
  if loss > 0 then
    line_number:=line_number+1;
    insert into public.journal_entry_lines(journal_entry_id,company_id,line_number,account_id,description,debit,credit,transaction_currency,transaction_amount,created_by)
    values(journal_row.id,asset_row.company_id,line_number,loss_account_id,'Loss on disposal',loss,0,'EUR',loss,(select auth.uid()));
  end if;
  line_number:=line_number+1;
  insert into public.journal_entry_lines(journal_entry_id,company_id,line_number,account_id,description,debit,credit,transaction_currency,transaction_amount,created_by)
  values(journal_row.id,asset_row.company_id,line_number,asset_row.asset_account_id,'Remove asset cost',0,asset_row.acquisition_cost,'EUR',asset_row.acquisition_cost,(select auth.uid()));
  if gain > 0 then
    line_number:=line_number+1;
    insert into public.journal_entry_lines(journal_entry_id,company_id,line_number,account_id,description,debit,credit,transaction_currency,transaction_amount,created_by)
    values(journal_row.id,asset_row.company_id,line_number,gain_account_id,'Gain on disposal',0,gain,'EUR',gain,(select auth.uid()));
  end if;
  journal_row := public.post_journal_entry(journal_row.id,p_reason);
  insert into public.asset_disposals(company_id,asset_id,disposal_date,disposal_type,proceeds,journal_entry_id,reason,created_by)
  values(asset_row.company_id,asset_row.id,p_disposal_date,p_disposal_type,round(coalesce(p_proceeds,0),4),journal_row.id,p_reason,(select auth.uid())) returning * into result;
  update public.fixed_assets set status=p_disposal_type,updated_at=clock_timestamp(),updated_by=(select auth.uid()) where id=asset_row.id;
  return result;
end
$$;

-- ---------------------------------------------------------------------------
-- Inventory movement ledger, weighted-average cost and physical counts
-- ---------------------------------------------------------------------------

create table if not exists public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete restrict,
  code text not null,
  name text not null,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique(company_id, code)
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  movement_sequence bigint generated by default as identity,
  company_id uuid not null references public.companies(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  location_id uuid references public.inventory_locations(id) on delete restrict,
  movement_type text not null check (movement_type in ('purchase','sale','return','transfer','adjustment','opening_stock','stock_count','write_off')),
  quantity_delta numeric(20,4) not null,
  quantity_before numeric(20,4) not null,
  quantity_after numeric(20,4) not null check (quantity_after >= 0),
  unit_cost numeric(20,4) not null default 0 check (unit_cost >= 0),
  cost_amount numeric(20,4) not null default 0 check (cost_amount >= 0),
  average_cost_before numeric(20,4) not null default 0,
  average_cost_after numeric(20,4) not null default 0,
  inventory_value_after numeric(20,4) not null default 0,
  source_type text,
  source_id uuid,
  journal_entry_id uuid references public.journal_entries(id) on delete restrict,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique(company_id, idempotency_key)
);

alter table public.inventory_movements
  add column if not exists movement_sequence bigint generated by default as identity;
create unique index if not exists inventory_movements_sequence_unique
  on public.inventory_movements(company_id, movement_sequence);

create index if not exists inventory_movements_product_date_idx
on public.inventory_movements(company_id, product_id, created_at desc);

create table if not exists public.inventory_counts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  location_id uuid references public.inventory_locations(id) on delete restrict,
  count_date date not null,
  status text not null default 'draft' check (status in ('draft','finalized','cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  finalized_at timestamptz,
  finalized_by uuid references auth.users(id) on delete set null
);

create table if not exists public.inventory_count_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  count_id uuid not null references public.inventory_counts(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  expected_quantity numeric(20,4) not null,
  counted_quantity numeric(20,4) not null check (counted_quantity >= 0),
  adjustment_movement_id uuid references public.inventory_movements(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(count_id, product_id)
);

alter table public.inventory_locations enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.inventory_counts enable row level security;
alter table public.inventory_count_lines enable row level security;

drop policy if exists inventory_locations_select on public.inventory_locations;
create policy inventory_locations_select on public.inventory_locations for select to authenticated
using ((select private.has_company_permission(company_id,'inventory.view')) or (select private.has_company_permission(company_id,'inventory.manage')));
drop policy if exists inventory_locations_write on public.inventory_locations;
create policy inventory_locations_write on public.inventory_locations for all to authenticated
using ((select private.has_company_permission(company_id,'inventory.manage')))
with check ((select private.has_company_permission(company_id,'inventory.manage')));
drop policy if exists inventory_movements_select on public.inventory_movements;
create policy inventory_movements_select on public.inventory_movements for select to authenticated
using ((select private.has_company_permission(company_id,'inventory.view')) or (select private.has_company_permission(company_id,'inventory.manage')));
drop policy if exists inventory_counts_select on public.inventory_counts;
create policy inventory_counts_select on public.inventory_counts for select to authenticated
using ((select private.has_company_permission(company_id,'inventory.view')) or (select private.has_company_permission(company_id,'inventory.manage')));
drop policy if exists inventory_counts_write on public.inventory_counts;
create policy inventory_counts_write on public.inventory_counts for all to authenticated
using ((select private.has_company_permission(company_id,'inventory.manage')))
with check ((select private.has_company_permission(company_id,'inventory.manage')));
drop policy if exists inventory_count_lines_select on public.inventory_count_lines;
create policy inventory_count_lines_select on public.inventory_count_lines for select to authenticated
using ((select private.has_company_permission(company_id,'inventory.view')) or (select private.has_company_permission(company_id,'inventory.manage')));
drop policy if exists inventory_count_lines_write on public.inventory_count_lines;
create policy inventory_count_lines_write on public.inventory_count_lines for all to authenticated
using ((select private.has_company_permission(company_id,'inventory.manage')))
with check ((select private.has_company_permission(company_id,'inventory.manage')));
revoke update, delete, truncate on public.inventory_movements from anon, authenticated;
grant select on public.inventory_locations,public.inventory_movements,public.inventory_counts,public.inventory_count_lines to authenticated;

create or replace function private.inventory_account(p_company_id uuid, p_code text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result uuid;
begin
  select id into result from public.chart_of_accounts where company_id=p_company_id and code=p_code and active and posting_allowed limit 1;
  if result is null then raise exception 'Inventory account % is not mapped',p_code using errcode='P0002'; end if;
  return result;
end
$$;

create or replace function public.post_inventory_movement(
  p_company_id uuid,
  p_product_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_unit_cost numeric default null,
  p_location_id uuid default null,
  p_source_type text default null,
  p_source_id uuid default null,
  p_idempotency_key uuid default null,
  p_reason text default null
)
returns public.inventory_movements
language plpgsql
security definer
set search_path = ''
as $$
declare
  product_row public.products;
  existing_row public.inventory_movements;
  result public.inventory_movements;
  movement text := lower(trim(p_movement_type));
  delta numeric(20,4);
  before_quantity numeric(20,4);
  after_quantity numeric(20,4);
  before_average numeric(20,4);
  after_average numeric(20,4);
  unit_cost numeric(20,4);
  cost_amount numeric(20,4);
  old_value numeric(20,4);
  new_value numeric(20,4);
  journal_row public.journal_entries;
  debit_account_id uuid;
  credit_account_id uuid;
  currency_code text := 'EUR';
begin
  if not (select private.has_company_permission(p_company_id,'inventory.manage')) then
    raise exception 'Insufficient permission to post inventory' using errcode='42501';
  end if;
  if p_idempotency_key is null then raise exception 'Inventory idempotency key is required' using errcode='23514'; end if;
  select * into existing_row from public.inventory_movements where company_id=p_company_id and idempotency_key=p_idempotency_key for update;
  if found then return existing_row; end if;
  if movement not in ('purchase','sale','return','transfer','adjustment','opening_stock','stock_count','write_off') or coalesce(p_quantity,0)=0 then
    raise exception 'Inventory movement type and non-zero quantity are required' using errcode='23514';
  end if;
  select * into product_row from public.products where id=p_product_id and company_id=p_company_id for update;
  if not found then raise exception 'Product is invalid for this company' using errcode='23514'; end if;
  if p_location_id is not null and not exists(select 1 from public.inventory_locations where id=p_location_id and company_id=p_company_id and status='active') then
    raise exception 'Inventory location is invalid for this company' using errcode='23514';
  end if;
  select movement.quantity_after,movement.average_cost_after,movement.inventory_value_after
  into before_quantity,before_average,old_value
  from public.inventory_movements movement
  where movement.company_id=p_company_id and movement.product_id=p_product_id
  order by movement.movement_sequence desc
  limit 1;
  if not found then
    before_quantity := round(coalesce(product_row.stock_quantity,0),4);
    before_average := round(coalesce(product_row.cost_price,0),4);
    old_value := round(before_quantity*before_average,4);
  end if;
  delta := case
    when movement in ('sale','write_off') then -abs(p_quantity)
    when movement in ('purchase','return','opening_stock') then abs(p_quantity)
    else p_quantity
  end;
  after_quantity := round(before_quantity + delta,4);
  if after_quantity < 0 then raise exception 'Inventory quantity cannot become negative' using errcode='23514'; end if;
  if delta > 0 then
    unit_cost := round(coalesce(p_unit_cost, before_average),4);
    if unit_cost < 0 or (movement in ('purchase','opening_stock','return') and unit_cost = 0 and before_average = 0) then
      raise exception 'A non-zero unit cost is required for incoming inventory' using errcode='23514';
    end if;
    new_value := old_value + delta * unit_cost;
    after_average := case when after_quantity=0 then 0 else round(new_value/after_quantity,4) end;
  else
    unit_cost := case when before_quantity=0 then 0 else round(old_value/before_quantity,4) end;
    cost_amount := case when before_quantity=0 then 0 else round(abs(delta)*old_value/before_quantity,4) end;
    new_value := round(old_value-cost_amount,4);
    after_average := case when after_quantity=0 then 0 else before_average end;
  end if;
  if delta > 0 then cost_amount := round(abs(delta)*unit_cost,4); end if;

  insert into public.inventory_movements(
    company_id,product_id,location_id,movement_type,quantity_delta,quantity_before,quantity_after,unit_cost,cost_amount,
    average_cost_before,average_cost_after,inventory_value_after,source_type,source_id,idempotency_key,created_by
  ) values(
    p_company_id,p_product_id,p_location_id,movement,delta,before_quantity,after_quantity,unit_cost,cost_amount,
    before_average,after_average,new_value,p_source_type,p_source_id,p_idempotency_key,(select auth.uid())
  ) returning * into result;

  if movement <> 'transfer' then
    if delta > 0 then
      debit_account_id := private.inventory_account(p_company_id,'1200');
      credit_account_id := private.inventory_account(p_company_id,case when movement='opening_stock' then '3000' when movement='purchase' then '2010' when movement='return' then '5000' else '6010' end);
    else
      debit_account_id := private.inventory_account(p_company_id,case when movement='sale' then '5000' else '6010' end);
      credit_account_id := private.inventory_account(p_company_id,'1200');
    end if;
    journal_row := public.create_journal_entry(p_company_id,current_date,current_date,'Inventory '||movement||' for '||product_row.name,'INV-'||result.id::text,currency_code,1,null,'automatic');
    update public.journal_entries set source_type='inventory_movement',source_id=result.id,source_key='INV-'||result.id::text where id=journal_row.id;
    insert into public.journal_entry_lines(journal_entry_id,company_id,line_number,account_id,description,debit,credit,transaction_currency,transaction_amount,created_by)
    values(journal_row.id,p_company_id,1,debit_account_id,'Inventory movement',cost_amount,0,currency_code,cost_amount,(select auth.uid()));
    insert into public.journal_entry_lines(journal_entry_id,company_id,line_number,account_id,description,debit,credit,transaction_currency,transaction_amount,created_by)
    values(journal_row.id,p_company_id,2,credit_account_id,'Inventory movement',0,cost_amount,currency_code,cost_amount,(select auth.uid()));
    journal_row := public.post_journal_entry(journal_row.id,coalesce(nullif(trim(p_reason),''),'Inventory movement posted'));
    update public.inventory_movements set journal_entry_id=journal_row.id where id=result.id;
  end if;

  perform set_config('app.inventory_workflow','authorized',true);
  update public.products set stock_quantity=after_quantity,cost_price=after_average where id=product_row.id;
  perform set_config('app.inventory_workflow','',true);
  select * into result from public.inventory_movements where id=result.id;
  return result;
end
$$;

create or replace view public.inventory_register
with (security_invoker = true)
as
with latest as (
  select distinct on (company_id,product_id)
    company_id,product_id,quantity_after,average_cost_after,inventory_value_after
  from public.inventory_movements
  order by company_id,product_id,movement_sequence desc
)
select product.company_id,product.id as product_id,product.sku,product.name,product.category,
  round(coalesce(latest.quantity_after,product.stock_quantity,0),4) as quantity,
  round(coalesce(latest.average_cost_after,product.cost_price,0),4) as average_cost,
  round(coalesce(latest.inventory_value_after,coalesce(product.stock_quantity,0)*coalesce(product.cost_price,0)),4) as inventory_value,
  product.track_stock
from public.products product
left join latest on latest.company_id=product.company_id and latest.product_id=product.id
where coalesce(product.track_stock,false);

create or replace view public.inventory_gl_reconciliation
with (security_invoker = true)
as
with register as (
  select company_id,coalesce(sum(inventory_value),0)::numeric(20,4) inventory_register_value
  from public.inventory_register group by company_id
), ledger as (
  select entry.company_id,coalesce(sum(line.debit-line.credit),0)::numeric(20,4) inventory_gl_value
  from public.journal_entries entry join public.journal_entry_lines line on line.journal_entry_id=entry.id
  join public.chart_of_accounts account on account.id=line.account_id
  where entry.status='posted' and account.code='1200'
  group by entry.company_id
)
select company.id company_id,coalesce(register.inventory_register_value,0) inventory_register_value,
  coalesce(ledger.inventory_gl_value,0) inventory_gl_value,
  round(coalesce(register.inventory_register_value,0)-coalesce(ledger.inventory_gl_value,0),4) difference
from public.companies company left join register on register.company_id=company.id left join ledger on ledger.company_id=company.id;

grant select on public.inventory_register,public.inventory_gl_reconciliation to authenticated;

create or replace function public.create_inventory_count(
  p_company_id uuid,
  p_count_date date,
  p_location_id uuid default null,
  p_notes text default null
)
returns public.inventory_counts
language plpgsql
security definer
set search_path = ''
as $$
declare result public.inventory_counts;
begin
  if not (select private.has_company_permission(p_company_id,'inventory.manage')) then raise exception 'Insufficient permission to create inventory count' using errcode='42501'; end if;
  insert into public.inventory_counts(company_id,location_id,count_date,notes,created_by)
  values(p_company_id,p_location_id,coalesce(p_count_date,current_date),p_notes,(select auth.uid())) returning * into result;
  return result;
end
$$;

create or replace function public.add_inventory_count_line(
  p_count_id uuid,
  p_product_id uuid,
  p_counted_quantity numeric
)
returns public.inventory_count_lines
language plpgsql
security definer
set search_path = ''
as $$
declare count_row public.inventory_counts; product_row public.products; result public.inventory_count_lines;
begin
  select * into count_row from public.inventory_counts where id=p_count_id for update;
  if not found then raise exception 'Inventory count not found' using errcode='P0002'; end if;
  if not (select private.has_company_permission(count_row.company_id,'inventory.manage')) then raise exception 'Insufficient permission to edit inventory count' using errcode='42501'; end if;
  if count_row.status <> 'draft' then raise exception 'Only draft inventory counts can be edited' using errcode='55000'; end if;
  select * into product_row from public.products where id=p_product_id and company_id=count_row.company_id for update;
  if not found or p_counted_quantity < 0 then raise exception 'Inventory count product or quantity is invalid' using errcode='23514'; end if;
  insert into public.inventory_count_lines(company_id,count_id,product_id,expected_quantity,counted_quantity)
  values(count_row.company_id,count_row.id,p_product_id,coalesce(product_row.stock_quantity,0),p_counted_quantity)
  on conflict(count_id,product_id) do update set counted_quantity=excluded.counted_quantity
  returning * into result;
  return result;
end
$$;

create or replace function public.finalize_inventory_count(p_count_id uuid, p_reason text)
returns public.inventory_counts
language plpgsql
security definer
set search_path = ''
as $$
declare count_row public.inventory_counts; line_row public.inventory_count_lines; movement_row public.inventory_movements;
begin
  select * into count_row from public.inventory_counts where id=p_count_id for update;
  if not found then raise exception 'Inventory count not found' using errcode='P0002'; end if;
  if not (select private.has_company_permission(count_row.company_id,'inventory.manage')) then raise exception 'Insufficient permission to finalize inventory count' using errcode='42501'; end if;
  if count_row.status <> 'draft' then raise exception 'Only draft inventory counts can be finalized' using errcode='55000'; end if;
  if trim(coalesce(p_reason,''))='' then raise exception 'Inventory count finalization reason is required' using errcode='23514'; end if;
  for line_row in select * from public.inventory_count_lines where count_id=count_row.id loop
    if line_row.counted_quantity <> line_row.expected_quantity then
      movement_row := public.post_inventory_movement(count_row.company_id,line_row.product_id,'stock_count',line_row.counted_quantity-line_row.expected_quantity,null,count_row.location_id,'inventory_count',line_row.id,gen_random_uuid(),p_reason);
      update public.inventory_count_lines set adjustment_movement_id=movement_row.id where id=line_row.id;
    end if;
  end loop;
  update public.inventory_counts set status='finalized',finalized_at=clock_timestamp(),finalized_by=(select auth.uid()) where id=count_row.id returning * into count_row;
  return count_row;
end
$$;

-- ---------------------------------------------------------------------------
-- Document archive and explicit fiscalization readiness state
-- ---------------------------------------------------------------------------

create table if not exists public.document_archive (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete restrict,
  document_type text not null check (document_type in ('sales_invoice','supplier_invoice','supplier_bill','customs_document','payroll','tax_declaration','bank_document','asset_document','expense_receipt','other')),
  document_date date,
  source_type text,
  source_id uuid,
  storage_bucket text not null,
  storage_path text not null,
  file_name text not null,
  content_type text,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  file_checksum text,
  retention_until date,
  status text not null default 'active' check (status in ('active','superseded','deleted')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references auth.users(id) on delete set null,
  unique(company_id, storage_bucket, storage_path)
);

create index if not exists document_archive_source_idx on public.document_archive(company_id,source_type,source_id);
alter table public.document_archive enable row level security;
drop policy if exists document_archive_select on public.document_archive;
create policy document_archive_select on public.document_archive for select to authenticated
using ((select private.has_company_permission(company_id,'document.archive.view')) or (select private.has_company_permission(company_id,'document.archive.create')));
drop policy if exists document_archive_insert on public.document_archive;
create policy document_archive_insert on public.document_archive for insert to authenticated
with check ((select private.has_company_permission(company_id,'document.archive.create')));
drop policy if exists document_archive_update on public.document_archive;
create policy document_archive_update on public.document_archive for update to authenticated
using ((select private.has_company_permission(company_id,'document.archive.create')))
with check ((select private.has_company_permission(company_id,'document.archive.create')));
revoke delete, truncate on public.document_archive from anon, authenticated;
grant select on public.document_archive to authenticated;

create or replace function public.archive_document(
  p_company_id uuid,
  p_document_type text,
  p_storage_bucket text,
  p_storage_path text,
  p_file_name text,
  p_document_date date default null,
  p_source_type text default null,
  p_source_id uuid default null,
  p_content_type text default null,
  p_byte_size bigint default null,
  p_file_checksum text default null,
  p_retention_until date default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.document_archive
language plpgsql
security definer
set search_path = ''
as $$
declare result public.document_archive;
begin
  if not (select private.has_company_permission(p_company_id,'document.archive.create')) then raise exception 'Insufficient permission to archive documents' using errcode='42501'; end if;
  if trim(coalesce(p_storage_bucket,''))='' or trim(coalesce(p_storage_path,''))='' or trim(coalesce(p_file_name,''))='' then raise exception 'Document storage metadata is required' using errcode='23514'; end if;
  insert into public.document_archive(
    company_id,document_type,document_date,source_type,source_id,storage_bucket,storage_path,file_name,content_type,byte_size,file_checksum,retention_until,metadata,uploaded_by
  ) values(
    p_company_id,lower(trim(p_document_type)),p_document_date,p_source_type,p_source_id,p_storage_bucket,p_storage_path,p_file_name,p_content_type,p_byte_size,p_file_checksum,p_retention_until,coalesce(p_metadata,'{}'::jsonb),(select auth.uid())
  ) on conflict(company_id,storage_bucket,storage_path) do update set
    status='active',file_name=excluded.file_name,content_type=excluded.content_type,byte_size=excluded.byte_size,file_checksum=excluded.file_checksum,
    retention_until=excluded.retention_until,metadata=excluded.metadata,uploaded_at=clock_timestamp(),uploaded_by=(select auth.uid())
  returning * into result;
  return result;
end
$$;

create or replace view public.kosovo_efs_status
with (security_invoker = true)
as
select company.id as company_id,
  'EFS NOT CERTIFIED'::text as status,
  false as certified,
  false as production_enabled,
  null::text as certification_reference,
  'OperiX does not represent normal invoices as certified Kosovo fiscal receipts.'::text as message,
  'https://www.atk-ks.org/en/notice-to-taxpayers-apply-for-certification-and-maintenance-of-electronic-fiscal-software-efs-2/'::text as official_reference
from public.companies company;
grant select on public.kosovo_efs_status to authenticated;

-- Existing fiscal tables remain the provider architecture. No mock or sandbox
-- result is promoted to production, and no fiscal receipt is synthesized here.
comment on view public.kosovo_efs_status is
  'Explicit Phase 2 safety state: EFS NOT CERTIFIED until TAK certification, credentials and approvals are evidenced.';

-- Critical Phase 2 records are append-audited using the existing immutable
-- audit trail. Archive files remain recoverable in storage; rows are never
-- hard-deleted through the application role.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'withholding_tax_rules','withholding_transactions','tax_declarations','tax_calendar_events',
    'fixed_assets','asset_depreciation_runs','asset_depreciation_lines','asset_disposals',
    'inventory_locations','inventory_movements','inventory_counts','inventory_count_lines','document_archive'
  ] loop
    execute format('drop trigger if exists %I_audit on public.%I',table_name,table_name);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function private.audit_table_change()',table_name,table_name);
  end loop;
end
$$;

revoke all on function public.calculate_withholding(uuid,text,numeric,date) from public;
revoke all on function public.record_withholding(uuid,text,text,uuid,date,numeric,uuid) from public;
revoke all on function public.prepare_tax_declaration(uuid,text,date,date) from public;
revoke all on function public.generate_kosovo_tax_calendar(uuid,integer) from public;
revoke all on function public.register_fixed_asset(uuid,text,text,date,date,numeric,integer,smallint,uuid,text,uuid,jsonb,uuid,uuid) from public;
revoke all on function public.preview_asset_depreciation(uuid,date,date,text) from public;
revoke all on function public.post_asset_depreciation(uuid,date,date,text,uuid,text) from public;
revoke all on function public.reverse_asset_depreciation(uuid,text) from public;
revoke all on function public.dispose_fixed_asset(uuid,date,text,numeric,text) from public;
revoke all on function public.post_inventory_movement(uuid,uuid,text,numeric,numeric,uuid,text,uuid,uuid,text) from public;
revoke all on function public.create_inventory_count(uuid,date,uuid,text) from public;
revoke all on function public.add_inventory_count_line(uuid,uuid,numeric) from public;
revoke all on function public.finalize_inventory_count(uuid,text) from public;
revoke all on function public.archive_document(uuid,text,text,text,text,date,text,uuid,text,bigint,text,date,jsonb) from public;

grant execute on function public.calculate_withholding(uuid,text,numeric,date) to authenticated;
grant execute on function public.record_withholding(uuid,text,text,uuid,date,numeric,uuid) to authenticated;
grant execute on function public.prepare_tax_declaration(uuid,text,date,date) to authenticated;
grant execute on function public.generate_kosovo_tax_calendar(uuid,integer) to authenticated;
grant execute on function public.register_fixed_asset(uuid,text,text,date,date,numeric,integer,smallint,uuid,text,uuid,jsonb,uuid,uuid) to authenticated;
grant execute on function public.preview_asset_depreciation(uuid,date,date,text) to authenticated;
grant execute on function public.post_asset_depreciation(uuid,date,date,text,uuid,text) to authenticated;
grant execute on function public.reverse_asset_depreciation(uuid,text) to authenticated;
grant execute on function public.dispose_fixed_asset(uuid,date,text,numeric,text) to authenticated;
grant execute on function public.post_inventory_movement(uuid,uuid,text,numeric,numeric,uuid,text,uuid,uuid,text) to authenticated;
grant execute on function public.create_inventory_count(uuid,date,uuid,text) to authenticated;
grant execute on function public.add_inventory_count_line(uuid,uuid,numeric) to authenticated;
grant execute on function public.finalize_inventory_count(uuid,text) to authenticated;
grant execute on function public.archive_document(uuid,text,text,text,text,date,text,uuid,text,bigint,text,date,jsonb) to authenticated;

commit;
