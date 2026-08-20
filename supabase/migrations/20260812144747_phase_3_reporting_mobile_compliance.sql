-- OperiX Invoice Phase 3
-- Reporting, drill-down, bank reconciliation, mobile-facing report views and
-- final compliance/security evidence hooks.

begin;

-- ---------------------------------------------------------------------------
-- Phase 3 permissions
-- ---------------------------------------------------------------------------

insert into public.app_permissions (code, name, category, description, is_sensitive)
values
  ('financial_reports.view', 'View financial reports', 'reports', 'View accounting-engine financial reports and drill-downs.', false),
  ('financial_reports.export', 'Export financial reports', 'reports', 'Export reports and source drill-downs.', true),
  ('bank.reconcile', 'Reconcile bank accounts', 'banking', 'Import, match and complete bank reconciliations.', true),
  ('cash_account.view', 'View cash accounts', 'banking', 'View cash and bank ledger balances.', true)
on conflict (code) do update
set name=excluded.name, category=excluded.category, description=excluded.description, is_sensitive=excluded.is_sensitive;

with grants(role_code, permission_code) as (
  values
    ('owner','financial_reports.view'),('owner','financial_reports.export'),('owner','bank.reconcile'),('owner','cash_account.view'),
    ('company_administrator','financial_reports.view'),('company_administrator','financial_reports.export'),('company_administrator','bank.reconcile'),('company_administrator','cash_account.view'),
    ('senior_accountant','financial_reports.view'),('senior_accountant','financial_reports.export'),('senior_accountant','bank.reconcile'),('senior_accountant','cash_account.view'),
    ('accountant','financial_reports.view'),('accountant','financial_reports.export'),('accountant','bank.reconcile'),('accountant','cash_account.view'),
    ('auditor','financial_reports.view'),('auditor','financial_reports.export'),('auditor','cash_account.view'),
    ('read_only','financial_reports.view'),('read_only','cash_account.view')
)
insert into public.app_role_permissions(role_id,permission_code)
select role.id,grants.permission_code
from public.app_roles role join grants on grants.role_code=role.code
where role.company_id is null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Accounts payable allocations and aging
-- ---------------------------------------------------------------------------

create table if not exists public.supplier_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  vendor_payment_id uuid not null references public.vendor_payments(id) on delete restrict,
  supplier_bill_id uuid not null references public.supplier_bills(id) on delete restrict,
  allocated_amount numeric(20,4) not null check (allocated_amount > 0),
  allocation_date date not null default current_date,
  status text not null default 'active' check (status in ('active','reversed')),
  reversed_at timestamptz,
  reversed_by uuid references auth.users(id) on delete set null,
  reversal_reason text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique(vendor_payment_id,supplier_bill_id)
);

create index if not exists supplier_payment_allocations_bill_idx
on public.supplier_payment_allocations(company_id,supplier_bill_id,status);

alter table public.supplier_payment_allocations enable row level security;
drop policy if exists supplier_payment_allocations_select on public.supplier_payment_allocations;
create policy supplier_payment_allocations_select on public.supplier_payment_allocations for select to authenticated
using ((select private.has_company_permission(company_id,'financial_reports.view')) or (select private.has_company_permission(company_id,'supplier_payment.record')));
drop policy if exists supplier_payment_allocations_insert on public.supplier_payment_allocations;
create policy supplier_payment_allocations_insert on public.supplier_payment_allocations for insert to authenticated
with check ((select private.has_company_permission(company_id,'supplier_payment.record')));
revoke update,delete,truncate on public.supplier_payment_allocations from anon,authenticated;
grant select on public.supplier_payment_allocations to authenticated;

create or replace function public.allocate_supplier_payment(
  p_vendor_payment_id uuid,
  p_supplier_bill_id uuid,
  p_amount numeric,
  p_allocation_date date default current_date
)
returns public.supplier_payment_allocations
language plpgsql
security definer
set search_path=''
as $$
declare
  payment_row public.vendor_payments;
  bill_row public.supplier_bills;
  allocated numeric(20,4);
  existing_row public.supplier_payment_allocations;
  result public.supplier_payment_allocations;
begin
  select * into payment_row from public.vendor_payments where id=p_vendor_payment_id for update;
  if not found then raise exception 'Supplier payment not found' using errcode='P0002'; end if;
  if not (select private.has_company_permission(payment_row.company_id,'supplier_payment.record')) then raise exception 'Insufficient permission to allocate supplier payment' using errcode='42501'; end if;
  select * into bill_row from public.supplier_bills where id=p_supplier_bill_id and company_id=payment_row.company_id for update;
  if not found then raise exception 'Supplier bill does not belong to the payment company' using errcode='23503'; end if;
  if bill_row.accounting_state <> 'posted' or payment_row.accounting_state <> 'posted' then raise exception 'Only posted supplier documents can be allocated' using errcode='55000'; end if;
  select * into existing_row from public.supplier_payment_allocations where vendor_payment_id=p_vendor_payment_id and supplier_bill_id=p_supplier_bill_id and status='active' for update;
  if found then return existing_row; end if;
  select coalesce(sum(allocated_amount),0) into allocated from public.supplier_payment_allocations where supplier_bill_id=p_supplier_bill_id and status='active';
  if p_amount is null or p_amount <= 0 or round(p_amount,4) > round(bill_row.total_amount-allocated,4) then raise exception 'Supplier allocation exceeds the open bill amount' using errcode='23514'; end if;
  if round(p_amount,4) > round(payment_row.amount-coalesce((select sum(allocated_amount) from public.supplier_payment_allocations where vendor_payment_id=p_vendor_payment_id and status='active'),0),4) then raise exception 'Supplier allocation exceeds the open payment amount' using errcode='23514'; end if;
  insert into public.supplier_payment_allocations(company_id,vendor_payment_id,supplier_bill_id,allocated_amount,allocation_date,created_by)
  values(payment_row.company_id,p_vendor_payment_id,p_supplier_bill_id,round(p_amount,4),coalesce(p_allocation_date,current_date),(select auth.uid())) returning * into result;
  return result;
end
$$;

create or replace view public.operix_ap_open_items
with (security_invoker=true)
as
select bill.company_id,bill.branch_id,bill.vendor_id,bill.id as supplier_bill_id,bill.bill_number,
  vendor.name as supplier_name,bill.issue_date,bill.due_date,bill.currency,
  round(bill.total_amount,4) as original_amount,
  round(coalesce(sum(allocation.allocated_amount) filter(where allocation.status='active'),0),4) as allocated_amount,
  round(bill.total_amount-coalesce(sum(allocation.allocated_amount) filter(where allocation.status='active'),0),4) as outstanding_amount,
  greatest(current_date-coalesce(bill.due_date,bill.issue_date),0) as days_overdue,
  case when coalesce(bill.due_date,bill.issue_date) >= current_date then 'current'
    when current_date-coalesce(bill.due_date,bill.issue_date) between 1 and 30 then '1_30'
    when current_date-coalesce(bill.due_date,bill.issue_date) between 31 and 60 then '31_60'
    when current_date-coalesce(bill.due_date,bill.issue_date) between 61 and 90 then '61_90'
    else '90_plus' end as aging_bucket
from public.supplier_bills bill
left join public.vendors vendor on vendor.id=bill.vendor_id
left join public.supplier_payment_allocations allocation on allocation.supplier_bill_id=bill.id
where bill.accounting_state='posted' and coalesce(bill.status,'') not in ('reversed','cancelled')
group by bill.company_id,bill.branch_id,bill.vendor_id,bill.id,bill.bill_number,vendor.name,bill.issue_date,bill.due_date,bill.currency,bill.total_amount
having round(bill.total_amount-coalesce(sum(allocation.allocated_amount) filter(where allocation.status='active'),0),4) <> 0;

create or replace view public.operix_ar_aging
with (security_invoker=true)
as
select item.company_id,item.branch_id,item.client_id,item.invoice_id,item.invoice_number,item.issue_date,item.due_date,
  item.currency,item.original_amount,item.allocated_amount,item.outstanding_amount,item.days_overdue,
  case when item.aging_bucket='not_due' then 'current' else item.aging_bucket end as aging_bucket
from public.customer_receivable_open_items item;

grant select on public.operix_ap_open_items,public.operix_ar_aging to authenticated;

-- ---------------------------------------------------------------------------
-- Manual bank reconciliation architecture
-- ---------------------------------------------------------------------------

alter table public.company_bank_accounts
  add column if not exists account_id uuid references public.chart_of_accounts(id) on delete restrict;

create table if not exists public.bank_reconciliations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  company_bank_account_id uuid not null references public.company_bank_accounts(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  opening_balance numeric(20,4) not null default 0,
  statement_closing_balance numeric(20,4),
  gl_closing_balance numeric(20,4),
  difference numeric(20,4),
  status text not null default 'open' check (status in ('open','completed','reopened')),
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique(company_bank_account_id,period_start,period_end),
  check(period_end>=period_start)
);

create table if not exists public.bank_statement_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  reconciliation_id uuid not null references public.bank_reconciliations(id) on delete restrict,
  company_bank_account_id uuid not null references public.company_bank_accounts(id) on delete restrict,
  external_id text,
  transaction_date date not null,
  description text,
  reference text,
  amount numeric(20,4) not null,
  currency text not null default 'EUR',
  status text not null default 'unmatched' check (status in ('unmatched','matched','ignored')),
  matched_journal_entry_id uuid references public.journal_entries(id) on delete restrict,
  imported_at timestamptz not null default now(),
  imported_by uuid references auth.users(id) on delete set null,
  matched_at timestamptz,
  matched_by uuid references auth.users(id) on delete set null,
  unique(company_id,company_bank_account_id,external_id)
);

alter table public.bank_reconciliations enable row level security;
alter table public.bank_statement_transactions enable row level security;
drop policy if exists bank_reconciliations_select on public.bank_reconciliations;
create policy bank_reconciliations_select on public.bank_reconciliations for select to authenticated
using ((select private.has_company_permission(company_id,'bank.reconcile')) or (select private.has_company_permission(company_id,'financial_reports.view')));
drop policy if exists bank_reconciliations_write on public.bank_reconciliations;
create policy bank_reconciliations_write on public.bank_reconciliations for all to authenticated
using ((select private.has_company_permission(company_id,'bank.reconcile')))
with check ((select private.has_company_permission(company_id,'bank.reconcile')));
drop policy if exists bank_statement_transactions_select on public.bank_statement_transactions;
create policy bank_statement_transactions_select on public.bank_statement_transactions for select to authenticated
using ((select private.has_company_permission(company_id,'bank.reconcile')) or (select private.has_company_permission(company_id,'financial_reports.view')));
drop policy if exists bank_statement_transactions_insert on public.bank_statement_transactions;
create policy bank_statement_transactions_insert on public.bank_statement_transactions for insert to authenticated
with check ((select private.has_company_permission(company_id,'bank.reconcile')));
drop policy if exists bank_statement_transactions_update on public.bank_statement_transactions;
create policy bank_statement_transactions_update on public.bank_statement_transactions for update to authenticated
using ((select private.has_company_permission(company_id,'bank.reconcile')))
with check ((select private.has_company_permission(company_id,'bank.reconcile')));
grant select on public.bank_reconciliations,public.bank_statement_transactions to authenticated;

create or replace function public.create_bank_reconciliation(
  p_company_bank_account_id uuid,
  p_period_start date,
  p_period_end date,
  p_opening_balance numeric default 0,
  p_notes text default null
)
returns public.bank_reconciliations
language plpgsql
security definer
set search_path=''
as $$
declare account_row public.company_bank_accounts; result public.bank_reconciliations;
begin
  select * into account_row from public.company_bank_accounts where id=p_company_bank_account_id and is_active for update;
  if not found then raise exception 'Bank account not found' using errcode='P0002'; end if;
  if not (select private.has_company_permission(account_row.company_id,'bank.reconcile')) then raise exception 'Insufficient permission to reconcile bank account' using errcode='42501'; end if;
  insert into public.bank_reconciliations(company_id,company_bank_account_id,period_start,period_end,opening_balance,notes,created_by)
  values(account_row.company_id,p_company_bank_account_id,p_period_start,p_period_end,round(coalesce(p_opening_balance,0),4),p_notes,(select auth.uid()))
  on conflict(company_bank_account_id,period_start,period_end) do update set status='reopened',notes=excluded.notes
  returning * into result;
  return result;
end
$$;

create or replace function public.import_bank_statement_transaction(
  p_reconciliation_id uuid,
  p_external_id text,
  p_transaction_date date,
  p_description text,
  p_reference text,
  p_amount numeric,
  p_currency text default 'EUR'
)
returns public.bank_statement_transactions
language plpgsql
security definer
set search_path=''
as $$
declare reconciliation_row public.bank_reconciliations; result public.bank_statement_transactions;
begin
  select * into reconciliation_row from public.bank_reconciliations where id=p_reconciliation_id for update;
  if not found then raise exception 'Bank reconciliation not found' using errcode='P0002'; end if;
  if not (select private.has_company_permission(reconciliation_row.company_id,'bank.reconcile')) then raise exception 'Insufficient permission to import bank statement' using errcode='42501'; end if;
  if reconciliation_row.status='completed' then raise exception 'Completed reconciliation cannot be modified' using errcode='55000'; end if;
  insert into public.bank_statement_transactions(company_id,reconciliation_id,company_bank_account_id,external_id,transaction_date,description,reference,amount,currency,imported_by)
  values(reconciliation_row.company_id,reconciliation_row.id,reconciliation_row.company_bank_account_id,p_external_id,p_transaction_date,p_description,p_reference,round(p_amount,4),upper(coalesce(p_currency,'EUR')),(select auth.uid()))
  on conflict(company_id,company_bank_account_id,external_id) do update set description=excluded.description,reference=excluded.reference,amount=excluded.amount,transaction_date=excluded.transaction_date
  returning * into result;
  return result;
end
$$;

create or replace function public.match_bank_statement_transaction(p_statement_transaction_id uuid,p_journal_entry_id uuid)
returns public.bank_statement_transactions
language plpgsql
security definer
set search_path=''
as $$
declare statement_row public.bank_statement_transactions;
begin
  select * into statement_row from public.bank_statement_transactions where id=p_statement_transaction_id for update;
  if not found then raise exception 'Bank statement transaction not found' using errcode='P0002'; end if;
  if not (select private.has_company_permission(statement_row.company_id,'bank.reconcile')) then raise exception 'Insufficient permission to match bank statement' using errcode='42501'; end if;
  if not exists (
    select 1 from public.journal_entries
    where id=p_journal_entry_id and company_id=statement_row.company_id and status='posted'
  ) then
    raise exception 'Posted journal entry does not belong to the company' using errcode='23503';
  end if;
  update public.bank_statement_transactions set status='matched',matched_journal_entry_id=p_journal_entry_id,matched_at=clock_timestamp(),matched_by=(select auth.uid()) where id=statement_row.id returning * into statement_row;
  return statement_row;
end
$$;

create or replace function public.complete_bank_reconciliation(p_reconciliation_id uuid,p_statement_closing_balance numeric,p_reason text)
returns public.bank_reconciliations
language plpgsql
security definer
set search_path=''
as $$
declare reconciliation_row public.bank_reconciliations; gl_balance numeric(20,4);
begin
  select * into reconciliation_row from public.bank_reconciliations where id=p_reconciliation_id for update;
  if not found then raise exception 'Bank reconciliation not found' using errcode='P0002'; end if;
  if not (select private.has_company_permission(reconciliation_row.company_id,'bank.reconcile')) then raise exception 'Insufficient permission to complete bank reconciliation' using errcode='42501'; end if;
  if trim(coalesce(p_reason,''))='' then raise exception 'Bank reconciliation reason is required' using errcode='23514'; end if;
  select coalesce(sum(line.debit-line.credit),0) into gl_balance
  from public.journal_entries entry join public.journal_entry_lines line on line.journal_entry_id=entry.id
  join public.chart_of_accounts account on account.id=line.account_id
  where entry.company_id=reconciliation_row.company_id and entry.status='posted'
    and (
      account.id=(select bank.account_id from public.company_bank_accounts bank where bank.id=reconciliation_row.company_bank_account_id)
      or ((select bank.account_id from public.company_bank_accounts bank where bank.id=reconciliation_row.company_bank_account_id) is null and account.code='1020')
    )
    and entry.posting_date <= reconciliation_row.period_end;
  update public.bank_reconciliations set statement_closing_balance=round(p_statement_closing_balance,4),gl_closing_balance=round(gl_balance,4),
    difference=round(p_statement_closing_balance-gl_balance,4),status='completed',completed_at=clock_timestamp(),completed_by=(select auth.uid()),notes=coalesce(notes||E'\n','')||p_reason
  where id=reconciliation_row.id returning * into reconciliation_row;
  return reconciliation_row;
end
$$;

create or replace view public.operix_bank_reconciliation_summary
with (security_invoker=true)
as
select reconciliation.id,reconciliation.company_id,reconciliation.company_bank_account_id,account.name as account_name,
  reconciliation.period_start,reconciliation.period_end,reconciliation.opening_balance,reconciliation.statement_closing_balance,
  reconciliation.gl_closing_balance,reconciliation.difference,reconciliation.status,
  count(statement.id) filter(where statement.status='unmatched') as unmatched_transactions,
  coalesce(sum(statement.amount),0)::numeric(20,4) as imported_statement_net
from public.bank_reconciliations reconciliation
join public.company_bank_accounts bank on bank.id=reconciliation.company_bank_account_id
left join public.chart_of_accounts account on account.id=bank.account_id
left join public.bank_statement_transactions statement on statement.reconciliation_id=reconciliation.id
group by reconciliation.id,reconciliation.company_id,reconciliation.company_bank_account_id,account.name,reconciliation.period_start,reconciliation.period_end,reconciliation.opening_balance,reconciliation.statement_closing_balance,reconciliation.gl_closing_balance,reconciliation.difference,reconciliation.status;

grant select on public.operix_bank_reconciliation_summary to authenticated;

-- ---------------------------------------------------------------------------
-- Accounting-engine financial statements and drill-down views
-- ---------------------------------------------------------------------------

create or replace view public.operix_trial_balance
with (security_invoker=true)
as select * from public.trial_balance;

create or replace view public.operix_general_ledger
with (security_invoker=true)
as select * from public.general_ledger_entries;

create or replace view public.operix_profit_loss
with (security_invoker=true)
as
select ledger.company_id,
  date_trunc('month',ledger.posting_date)::date as period_start,
  ledger.account_id,ledger.account_code,ledger.account_name,ledger.account_type,
  round(sum(ledger.debit),4) as total_debit,
  round(sum(ledger.credit),4) as total_credit,
  round(case when ledger.account_type in ('revenue','contra_revenue') then sum(ledger.credit-ledger.debit) else sum(ledger.debit-ledger.credit) end,4) as presentation_amount
from public.general_ledger_entries ledger
where ledger.account_type in ('revenue','contra_revenue','expense')
group by ledger.company_id,date_trunc('month',ledger.posting_date)::date,ledger.account_id,ledger.account_code,ledger.account_name,ledger.account_type;

create or replace view public.operix_balance_sheet
with (security_invoker=true)
as
select ledger.company_id,ledger.account_id,ledger.account_code,ledger.account_name,ledger.account_type,
  round(sum(ledger.debit),4) as total_debit,round(sum(ledger.credit),4) as total_credit,
  round(sum(ledger.debit-ledger.credit),4) as signed_balance,
  round(case when ledger.account_type in ('liability','equity') then sum(ledger.credit-ledger.debit) else sum(ledger.debit-ledger.credit) end,4) as presentation_amount
from public.general_ledger_entries ledger
where ledger.account_type in ('asset','contra_asset','liability','equity')
group by ledger.company_id,ledger.account_id,ledger.account_code,ledger.account_name,ledger.account_type;

create or replace view public.operix_cash_flow
with (security_invoker=true)
as
select ledger.company_id,date_trunc('month',ledger.posting_date)::date as period_start,
  case when ledger.account_code='1010' then 'cash' when ledger.account_code='1020' then 'bank' else 'other' end as cash_account_type,
  round(sum(ledger.debit-ledger.credit),4) as net_change
from public.general_ledger_entries ledger
where ledger.account_code in ('1010','1020')
group by ledger.company_id,date_trunc('month',ledger.posting_date)::date,ledger.account_code;

create or replace view public.operix_changes_in_equity
with (security_invoker=true)
as
select ledger.company_id,date_trunc('month',ledger.posting_date)::date as period_start,
  ledger.account_id,ledger.account_code,ledger.account_name,
  round(sum(ledger.credit-ledger.debit),4) as change_amount
from public.general_ledger_entries ledger
where ledger.account_type='equity'
group by ledger.company_id,date_trunc('month',ledger.posting_date)::date,ledger.account_id,ledger.account_code,ledger.account_name;

create or replace view public.operix_asset_register
with (security_invoker=true)
as
select asset.company_id,asset.id as fixed_asset_id,asset.asset_number,asset.name,asset.category,asset.supplier_id,
  asset.acquisition_date,asset.placed_in_service_date,asset.acquisition_cost,asset.useful_life_months,
  asset.tax_category,asset.tax_depreciation_rate_percent,asset.accumulated_book_depreciation,
  asset.accumulated_tax_depreciation,asset.net_book_value,asset.location,asset.responsible_employee_id,asset.status
from public.fixed_assets asset;

create or replace view public.operix_financial_drilldown
with (security_invoker=true)
as
select ledger.company_id,ledger.journal_entry_id,ledger.entry_number,ledger.posting_date,ledger.document_date,
  ledger.account_id,ledger.account_code,ledger.account_name,ledger.account_type,ledger.description,
  ledger.debit,ledger.credit,ledger.signed_amount,coalesce(ledger.source_type,journal.entry_type) as source_type,ledger.source_id,
  case
    when invoice.id is not null then 'invoice'
    when bill.id is not null then 'supplier_bill'
    when expense.id is not null then 'expense'
    when payment.id is not null then 'customer_payment'
    when vendor_payment.id is not null then 'supplier_payment'
    when payroll.id is not null then 'payroll'
    when asset.id is not null then 'fixed_asset'
    else coalesce(ledger.source_type,journal.entry_type)
  end as transaction_type,
  coalesce(invoice.invoice_number,bill.bill_number,expense.description,payment.payment_number,vendor_payment.payment_number,payroll.run_number,asset.asset_number,ledger.reference) as transaction_reference,
  case when archive.id is not null then archive.id else null end as original_document_id
from public.general_ledger_entries ledger
join public.journal_entries journal on journal.id=ledger.journal_entry_id
left join public.invoices invoice on invoice.id=ledger.source_id and ledger.source_type in ('sales_invoice','pos_invoice')
left join public.supplier_bills bill on bill.id=ledger.source_id and ledger.source_type='supplier_bill'
left join public.expenses expense on expense.id=ledger.source_id and ledger.source_type='expense'
left join public.payments payment on payment.id=ledger.source_id and ledger.source_type in ('customer_payment','payment')
left join public.vendor_payments vendor_payment on vendor_payment.id=ledger.source_id and ledger.source_type in ('supplier_payment','vendor_payment')
left join public.payroll_runs payroll on payroll.id=ledger.source_id and ledger.source_type='payroll_run'
left join public.fixed_assets asset on asset.id=ledger.source_id and ledger.source_type like 'fixed_asset%'
left join lateral (
  select document.id from public.document_archive document
  where document.company_id=ledger.company_id
    and document.source_id=ledger.source_id and document.status='active'
  order by document.uploaded_at desc limit 1
) archive on true;

create or replace view public.operix_report_summary
with (security_invoker=true)
as
with pl as (
  select company_id,
    coalesce(sum(presentation_amount) filter(where account_type in ('revenue','contra_revenue')),0)::numeric(20,4) as revenue,
    coalesce(sum(presentation_amount) filter(where account_type='expense'),0)::numeric(20,4) as expenses
  from public.operix_profit_loss group by company_id
), bs as (
  select company_id,
    coalesce(sum(presentation_amount) filter(where account_type in ('asset','contra_asset')),0)::numeric(20,4) as assets,
    coalesce(sum(presentation_amount) filter(where account_type in ('liability','equity')),0)::numeric(20,4) as liabilities_equity
  from public.operix_balance_sheet group by company_id
), cash as (
  select company_id,coalesce(sum(net_change),0)::numeric(20,4) cash_flow from public.operix_cash_flow group by company_id
), ar as (
  select company_id,coalesce(sum(outstanding_amount),0)::numeric(20,4) ar_outstanding from public.operix_ar_aging group by company_id
), ap as (
  select company_id,coalesce(sum(outstanding_amount),0)::numeric(20,4) ap_outstanding from public.operix_ap_open_items group by company_id
)
select company.id as company_id,
  coalesce(pl.revenue,0) as revenue,coalesce(pl.expenses,0) as expenses,
  coalesce(pl.revenue,0)-coalesce(pl.expenses,0) as net_profit,
  coalesce(bs.assets,0) as assets,coalesce(bs.liabilities_equity,0) as liabilities_equity,
  coalesce(cash.cash_flow,0) as cash_flow,coalesce(ar.ar_outstanding,0) as ar_outstanding,coalesce(ap.ap_outstanding,0) as ap_outstanding
from public.companies company
left join pl on pl.company_id=company.id left join bs on bs.company_id=company.id left join cash on cash.company_id=company.id
left join ar on ar.company_id=company.id left join ap on ap.company_id=company.id;

grant select on public.operix_trial_balance,public.operix_general_ledger,public.operix_profit_loss,public.operix_balance_sheet,
  public.operix_cash_flow,public.operix_changes_in_equity,public.operix_asset_register,public.operix_financial_drilldown,
  public.operix_report_summary to authenticated;

-- ---------------------------------------------------------------------------
-- Correct the pre-existing support ingestion lock query.
-- PostgreSQL cannot apply FOR UPDATE to the nullable side of a LEFT JOIN.
-- Lock the idempotency row first, then lock its conversation separately.
-- ---------------------------------------------------------------------------

create or replace function public.support_ingest_channel_message(
  p_company_id uuid,
  p_channel_account_id uuid,
  p_provider text,
  p_channel_identifier text,
  p_external_conversation_id text,
  p_provider_message_id text,
  p_idempotency_key text,
  p_contact_id uuid,
  p_subject text,
  p_body_text text,
  p_received_at timestamptz,
  p_payload jsonb default '{}'::jsonb
)
returns table(
  channel_message_id uuid,
  ticket_id uuid,
  conversation_id uuid,
  support_message_id uuid,
  duplicate boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created_channel_message_id uuid;
  created_ticket_id uuid;
  created_conversation_id uuid;
  created_support_message_id uuid;
  existing_ticket_id uuid;
  existing_conversation_id uuid;
  conversation_type_value text := case when p_provider = 'instagram' then 'instagram' else 'facebook_messenger' end;
  message_subject text := left(coalesce(nullif(trim(p_subject), ''), initcap(p_provider) || ' conversation'), 240);
  incoming_at timestamptz := coalesce(p_received_at, now());
  was_duplicate boolean := false;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception using errcode = '42501', message = 'Channel ingestion is restricted to the service role';
  end if;
  if p_provider not in ('facebook', 'instagram') then
    raise exception using errcode = '22023', message = 'Unsupported channel provider';
  end if;
  if nullif(trim(p_channel_identifier), '') is null or nullif(trim(p_external_conversation_id), '') is null then
    raise exception using errcode = '22023', message = 'Channel identifiers are required';
  end if;
  if p_contact_id is not null and not exists (
    select 1 from public.support_contacts contact
    where contact.id = p_contact_id and contact.company_id = p_company_id and contact.deleted_at is null
  ) then
    raise exception using errcode = '23503', message = 'Contact does not belong to the channel company';
  end if;
  if not exists (
    select 1 from public.support_channel_accounts account
    where account.id = p_channel_account_id
      and account.company_id = p_company_id
      and account.provider = p_provider
      and account.status in ('connected', 'needs_reauthorization', 'error')
  ) then
    raise exception using errcode = '23503', message = 'Channel account does not belong to the company';
  end if;

  insert into public.support_channel_messages(
    company_id, channel_account_id, provider, direction, event_type,
    provider_message_id, provider_conversation_id, idempotency_key,
    status, payload, received_at
  ) values (
    p_company_id, p_channel_account_id, p_provider, 'inbound', 'message',
    nullif(trim(p_provider_message_id), ''), p_external_conversation_id, p_idempotency_key,
    'processing', coalesce(p_payload, '{}'::jsonb), incoming_at
  )
  on conflict (company_id, idempotency_key) do nothing
  returning id into created_channel_message_id;

  if created_channel_message_id is null then
    select channel.id, channel.conversation_id
      into created_channel_message_id, existing_conversation_id
    from public.support_channel_messages channel
    where channel.company_id = p_company_id and channel.idempotency_key = p_idempotency_key
    for update;

    if existing_conversation_id is not null then
      select conversation.ticket_id
        into existing_ticket_id
      from public.support_conversations conversation
      where conversation.company_id = p_company_id and conversation.id = existing_conversation_id
      for update;
    end if;

    was_duplicate := true;
    return query select created_channel_message_id, existing_ticket_id, existing_conversation_id, null::uuid, was_duplicate;
    return;
  end if;

  select conversation.id, conversation.ticket_id
    into created_conversation_id, created_ticket_id
  from public.support_conversations conversation
  where conversation.company_id = p_company_id
    and conversation.provider = p_provider
    and conversation.external_conversation_id = p_external_conversation_id
  for update;

  if created_conversation_id is null then
    insert into public.support_tickets(
      company_id, subject, status, priority, department_id, contact_id,
      source_application, last_message_at, created_by, updated_by
    )
    select p_company_id, message_subject, 'open', 'normal', account.department_id,
      p_contact_id, 'operix-support-meta', incoming_at, null, null
    from public.support_channel_accounts account
    where account.id = p_channel_account_id and account.company_id = p_company_id
    returning id into created_ticket_id;

    insert into public.support_conversations(
      company_id, ticket_id, conversation_type, provider, channel_identifier,
      external_conversation_id, provider_thread_key, customer_id, assigned_user_id, metadata,
      last_activity_at, unread_count
    ) values (
      p_company_id, created_ticket_id, conversation_type_value, p_provider,
      p_channel_identifier, p_external_conversation_id, p_external_conversation_id, p_contact_id, null,
      jsonb_build_object('channel_account_id', p_channel_account_id), incoming_at, 1
    ) returning id into created_conversation_id;

    insert into public.support_messages(
      company_id, conversation_id, author_contact_id, visibility,
      body_text, source, external_message_id, sent_at, created_at
    ) values (
      p_company_id, created_conversation_id, p_contact_id, 'public',
      nullif(trim(p_body_text), ''), 'customer', nullif(trim(p_provider_message_id), ''), incoming_at, incoming_at
    ) returning id into created_support_message_id;

    insert into public.support_events(company_id, ticket_id, event_name, payload, actor_contact_id)
    values
      (p_company_id, created_ticket_id, 'ticket_created', jsonb_build_object(
        'source', p_provider, 'channel_account_id', p_channel_account_id,
        'conversation_id', created_conversation_id, 'message_id', created_support_message_id
      ), p_contact_id),
      (p_company_id, created_ticket_id, 'channel_message_received', jsonb_build_object(
        'provider', p_provider, 'channel_message_id', created_channel_message_id,
        'provider_message_id', p_provider_message_id, 'conversation_id', created_conversation_id
      ), p_contact_id);
  else
    insert into public.support_messages(
      company_id, conversation_id, author_contact_id, visibility,
      body_text, source, external_message_id, sent_at, created_at
    ) values (
      p_company_id, created_conversation_id, p_contact_id, 'public',
      nullif(trim(p_body_text), ''), 'customer', nullif(trim(p_provider_message_id), ''), incoming_at, incoming_at
    ) returning id into created_support_message_id;

    update public.support_conversations
    set customer_id = coalesce(customer_id, p_contact_id),
        channel_identifier = coalesce(channel_identifier, p_channel_identifier),
        last_activity_at = incoming_at,
        unread_count = unread_count + 1,
        updated_at = now()
    where company_id = p_company_id and id = created_conversation_id;

    update public.support_tickets
    set last_message_at = incoming_at,
        status = case when status in ('resolved', 'closed', 'archived', 'waiting_on_customer') then 'open' else status end,
        resolved_at = case when status in ('resolved', 'closed', 'archived', 'waiting_on_customer') then null else resolved_at end,
        closed_at = case when status in ('resolved', 'closed', 'archived', 'waiting_on_customer') then null else closed_at end,
        archived_at = case when status in ('resolved', 'closed', 'archived', 'waiting_on_customer') then null else archived_at end,
        updated_at = now()
    where company_id = p_company_id and id = created_ticket_id;

    insert into public.support_events(company_id, ticket_id, event_name, payload, actor_contact_id)
    values (p_company_id, created_ticket_id, 'channel_message_received', jsonb_build_object(
      'provider', p_provider, 'channel_message_id', created_channel_message_id,
      'provider_message_id', p_provider_message_id, 'conversation_id', created_conversation_id
    ), p_contact_id);
  end if;

  update public.support_channel_messages
  set conversation_id = created_conversation_id,
      support_message_id = created_support_message_id,
      status = 'processed',
      updated_at = now()
  where company_id = p_company_id and id = created_channel_message_id;

  return query select created_channel_message_id, created_ticket_id, created_conversation_id, created_support_message_id, was_duplicate;
end;
$$;

-- ---------------------------------------------------------------------------
-- Automated reconciliation audit
-- ---------------------------------------------------------------------------

create or replace view public.operix_financial_reconciliation
with (security_invoker=true)
as
with tb as (
  select company_id,coalesce(sum(total_debit),0)::numeric(20,4) total_debit,coalesce(sum(total_credit),0)::numeric(20,4) total_credit
  from public.trial_balance group by company_id
), bs as (
  select company_id,
    coalesce(sum(presentation_amount) filter(where account_type in ('asset','contra_asset')),0)::numeric(20,4) assets,
    coalesce(sum(presentation_amount) filter(where account_type in ('liability','equity')),0)::numeric(20,4) liabilities_equity
  from public.operix_balance_sheet group by company_id
), pl as (
  select company_id,coalesce(sum(case when account_type in ('revenue','contra_revenue') then presentation_amount else -presentation_amount end),0)::numeric(20,4) net_profit
  from public.operix_profit_loss group by company_id
), ar_gl as (
  select company_id,coalesce(sum(balance),0)::numeric(20,4) gl_balance from public.trial_balance where account_code='1100' group by company_id
), ar_sub as (
  select company_id,coalesce(sum(outstanding_amount),0)::numeric(20,4) subledger_balance from public.operix_ar_aging group by company_id
), ap_gl as (
  select company_id,coalesce(-sum(balance),0)::numeric(20,4) gl_balance from public.trial_balance where account_code='2010' group by company_id
), ap_sub as (
  select company_id,coalesce(sum(outstanding_amount),0)::numeric(20,4) subledger_balance from public.operix_ap_open_items group by company_id
), inv as (
  select company_id,difference from public.inventory_gl_reconciliation
), assets as (
  select company.id as company_id,
    coalesce((select sum(acquisition_cost) from public.fixed_assets asset where asset.company_id=company.id and asset.status='active'),0)::numeric(20,4) register_gross,
    coalesce((select sum(accumulated_book_depreciation) from public.fixed_assets asset where asset.company_id=company.id and asset.status='active'),0)::numeric(20,4) register_accumulated,
    coalesce((select balance from public.trial_balance where company_id=company.id and account_code='1500'),0)::numeric(20,4) gl_gross,
    coalesce((select -balance from public.trial_balance where company_id=company.id and account_code='1590'),0)::numeric(20,4) gl_accumulated
  from public.companies company
), vat as (
  select company_id,output_vat_difference,recoverable_vat_difference from public.kosovo_tax_book_reconciliation
), cash as (
  select company.id as company_id,coalesce((select balance from public.trial_balance where company_id=company.id and account_code='1010'),0)::numeric(20,4) gl_cash,
    coalesce((select sum(debit-credit) from public.general_ledger_entries where company_id=company.id and account_code='1010'),0)::numeric(20,4) cash_book
  from public.companies company
)
select company.id as company_id,
  coalesce(tb.total_debit,0) as trial_balance_debit,coalesce(tb.total_credit,0) as trial_balance_credit,
  round(coalesce(tb.total_debit,0)-coalesce(tb.total_credit,0),4) as trial_balance_difference,
  coalesce(bs.assets,0) as balance_sheet_assets,coalesce(bs.liabilities_equity,0)+coalesce(pl.net_profit,0) as balance_sheet_liabilities_equity,
  round(coalesce(bs.assets,0)-(coalesce(bs.liabilities_equity,0)+coalesce(pl.net_profit,0)),4) as balance_sheet_difference,
  coalesce(ar_sub.subledger_balance,0) as ar_subledger,coalesce(ar_gl.gl_balance,0) as ar_gl,
  round(coalesce(ar_sub.subledger_balance,0)-coalesce(ar_gl.gl_balance,0),4) as ar_difference,
  coalesce(ap_sub.subledger_balance,0) as ap_subledger,coalesce(ap_gl.gl_balance,0) as ap_gl,
  round(coalesce(ap_sub.subledger_balance,0)-coalesce(ap_gl.gl_balance,0),4) as ap_difference,
  coalesce(inv.difference,0) as inventory_difference,
  round(coalesce(assets.register_gross,0)-coalesce(assets.gl_gross,0),4) as assets_gross_difference,
  round(coalesce(assets.register_accumulated,0)-coalesce(assets.gl_accumulated,0),4) as assets_accumulated_difference,
  coalesce(vat.output_vat_difference,0) as output_vat_difference,coalesce(vat.recoverable_vat_difference,0) as recoverable_vat_difference,
  round(coalesce(cash.gl_cash,0)-coalesce(cash.cash_book,0),4) as cash_difference,
  (abs(round(coalesce(tb.total_debit,0)-coalesce(tb.total_credit,0),4)) <= 0.0001
    and abs(round(coalesce(bs.assets,0)-(coalesce(bs.liabilities_equity,0)+coalesce(pl.net_profit,0)),4)) <= 0.0001
    and abs(round(coalesce(ar_sub.subledger_balance,0)-coalesce(ar_gl.gl_balance,0),4)) <= 0.0001
    and abs(round(coalesce(ap_sub.subledger_balance,0)-coalesce(ap_gl.gl_balance,0),4)) <= 0.0001
    and abs(coalesce(inv.difference,0)) <= 0.0001
    and abs(round(coalesce(assets.register_gross,0)-coalesce(assets.gl_gross,0),4)) <= 0.0001
    and abs(round(coalesce(assets.register_accumulated,0)-coalesce(assets.gl_accumulated,0),4)) <= 0.0001
    and abs(coalesce(vat.output_vat_difference,0)) <= 0.0001
    and abs(coalesce(vat.recoverable_vat_difference,0)) <= 0.0001
    and abs(round(coalesce(cash.gl_cash,0)-coalesce(cash.cash_book,0),4)) <= 0.0001) as reconciles
from public.companies company
left join tb on tb.company_id=company.id left join bs on bs.company_id=company.id left join pl on pl.company_id=company.id
left join ar_gl on ar_gl.company_id=company.id left join ar_sub on ar_sub.company_id=company.id
left join ap_gl on ap_gl.company_id=company.id left join ap_sub on ap_sub.company_id=company.id
left join inv on inv.company_id=company.id left join assets on assets.company_id=company.id left join vat on vat.company_id=company.id left join cash on cash.company_id=company.id;

grant select on public.operix_financial_reconciliation to authenticated;

grant execute on function public.allocate_supplier_payment(uuid,uuid,numeric,date) to authenticated;
grant execute on function public.create_bank_reconciliation(uuid,date,date,numeric,text) to authenticated;
grant execute on function public.import_bank_statement_transaction(uuid,text,date,text,text,numeric,text) to authenticated;
grant execute on function public.match_bank_statement_transaction(uuid,uuid) to authenticated;
grant execute on function public.complete_bank_reconciliation(uuid,numeric,text) to authenticated;

revoke execute on function public.allocate_supplier_payment(uuid,uuid,numeric,date) from anon;
revoke execute on function public.create_bank_reconciliation(uuid,date,date,numeric,text) from anon;
revoke execute on function public.import_bank_statement_transaction(uuid,text,date,text,text,numeric,text) from anon;
revoke execute on function public.match_bank_statement_transaction(uuid,uuid) from anon;
revoke execute on function public.complete_bank_reconciliation(uuid,numeric,text) from anon;

drop trigger if exists supplier_payment_allocations_audit on public.supplier_payment_allocations;
create trigger supplier_payment_allocations_audit
after insert or update or delete on public.supplier_payment_allocations
for each row execute function private.audit_table_change();

drop trigger if exists bank_reconciliations_audit on public.bank_reconciliations;
create trigger bank_reconciliations_audit
after insert or update or delete on public.bank_reconciliations
for each row execute function private.audit_table_change();

drop trigger if exists bank_statement_transactions_audit on public.bank_statement_transactions;
create trigger bank_statement_transactions_audit
after insert or update or delete on public.bank_statement_transactions
for each row execute function private.audit_table_change();

commit;
