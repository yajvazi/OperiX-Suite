-- Shpenzimet / Expenses module upgrade.
-- Additive migration: legacy expenses (including Material Shpenzues) remain in
-- the same table and keep their IDs. Financial calculations use numeric(20,4)
-- and the shared posting/payment commands; no floating point is used here.

begin;

-- ---------------------------------------------------------------------------
-- Stable categories and jurisdiction-aware rule configuration
-- ---------------------------------------------------------------------------

create table if not exists public.expense_category_definitions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  category_code text not null,
  label_en text not null,
  label_sq text not null,
  group_code text not null default 'other',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique(company_id, category_code)
);

insert into public.expense_category_definitions(category_code,label_en,label_sq,group_code,sort_order)
values
 ('fuel','Fuel','Derivate','fuel',10),
 ('electricity','Electricity','Energji elektrike','utilities',20),
 ('water','Water','Ujë','utilities',30),
 ('waste','Waste','Mbeturina','utilities',40),
 ('heating','Heating','Ngrohje','utilities',50),
 ('internet','Internet','Internet','utilities',60),
 ('telecommunications','Telecommunications','Telefon','utilities',70),
 ('rent','Rent','Qira','occupancy',80),
 ('office_supplies','Office Supplies','Material zyre','operations',90),
 ('consumable_materials','Consumable Materials','Material shpenzues','operations',100),
 ('maintenance','Maintenance','Mirëmbajtje','operations',110),
 ('vehicle_expenses','Vehicle Expenses','Shpenzime automjeti','transport',120),
 ('transport','Transport','Transport','transport',130),
 ('software_subscriptions','Software & Subscriptions','Softuer dhe abonime','operations',140),
 ('professional_services','Professional Services','Shërbime profesionale','professional',150),
 ('bank_charges','Bank Charges','Shpenzime bankare','financial',160),
 ('advertising_marketing','Advertising & Marketing','Reklamë dhe marketing','marketing',170),
 ('representation','Representation','Përfaqësim','representation',180),
 ('insurance','Insurance','Sigurime','operations',190),
 ('training','Training','Trajnime','professional',200),
 ('other_expenses','Other Expenses','Shpenzime tjera','other',210)
on conflict (company_id,category_code) do nothing;

create table if not exists public.expense_tax_rule_configurations (
  id uuid primary key default gen_random_uuid(),
  jurisdiction text not null,
  rule_code text not null,
  effective_from date not null,
  effective_until date,
  value_numeric numeric(20,6),
  value_text text,
  legal_basis text,
  automatic boolean not null default false,
  advisory_note text,
  created_at timestamptz not null default now(),
  unique(jurisdiction,rule_code,effective_from)
);

insert into public.expense_tax_rule_configurations
  (jurisdiction,rule_code,effective_from,value_text,legal_basis,automatic,advisory_note)
values
  ('XK','representation_annual_limit',date '2000-01-01',null,
   'Kosovo representation deductibility concept; percentage requires accountant-confirmed configuration.',false,
   'Review Required until the tenant configures the applicable annual gross-income limit.'),
  ('XK','capital_expense_threshold',date '2000-01-01',null,
   'Threshold depends on the tenant accounting policy and applicable law.',false,
   'Advisory extension point; do not auto-classify an asset candidate as deductible.')
on conflict (jurisdiction,rule_code,effective_from) do nothing;

alter table public.expense_category_definitions enable row level security;
drop policy if exists expense_categories_select on public.expense_category_definitions;
create policy expense_categories_select on public.expense_category_definitions for select to authenticated
using (company_id is null or private.has_company_permission(company_id,'expense.view'));
revoke insert,update,delete,truncate on public.expense_category_definitions from anon,authenticated;
grant select on public.expense_category_definitions to authenticated;

alter table public.expense_tax_rule_configurations enable row level security;
drop policy if exists expense_tax_rules_select on public.expense_tax_rule_configurations;
create policy expense_tax_rules_select on public.expense_tax_rule_configurations for select to authenticated using (true);
revoke insert,update,delete,truncate on public.expense_tax_rule_configurations from anon,authenticated;
grant select on public.expense_tax_rule_configurations to authenticated;

-- ---------------------------------------------------------------------------
-- Expanded expense record, preserving legacy columns and references
-- ---------------------------------------------------------------------------

alter table public.expenses
  add column if not exists expense_number text,
  add column if not exists category_code text,
  add column if not exists subcategory text,
  add column if not exists supplier_fiscal_number text,
  add column if not exists supplier_business_number text,
  add column if not exists document_type text default 'other',
  add column if not exists document_number text,
  add column if not exists issue_date date,
  add column if not exists accounting_period_id uuid references public.accounting_periods(id) on delete restrict,
  add column if not exists sales_book_period_id uuid references public.sales_book_periods(id) on delete restrict,
  add column if not exists accounting_period_label text,
  add column if not exists net_amount numeric(20,4),
  add column if not exists vat_amount numeric(20,4),
  add column if not exists gross_amount numeric(20,4),
  add column if not exists quantity numeric(20,4),
  add column if not exists unit text,
  add column if not exists payment_status text default 'unpaid',
  add column if not exists paid_amount numeric(20,4) not null default 0,
  add column if not exists outstanding_amount numeric(20,4) not null default 0,
  add column if not exists due_date date,
  add column if not exists documentation_status text default 'missing_supporting_document',
  add column if not exists tax_treatment text default 'review_required',
  add column if not exists tax_recommended_treatment text default 'review_required',
  add column if not exists tax_deductible_percentage numeric(8,4),
  add column if not exists tax_deductible_amount numeric(20,4) not null default 0,
  add column if not exists tax_non_deductible_amount numeric(20,4) not null default 0,
  add column if not exists tax_override_reason text,
  add column if not exists tax_overridden_by uuid references auth.users(id) on delete set null,
  add column if not exists tax_overridden_at timestamptz,
  add column if not exists vat_treatment text default 'review_required',
  add column if not exists vat_recommended_treatment text default 'review_required',
  add column if not exists vat_deductible_percentage numeric(8,4),
  add column if not exists vat_deductible_amount numeric(20,4) not null default 0,
  add column if not exists vat_non_deductible_amount numeric(20,4) not null default 0,
  add column if not exists vat_override_reason text,
  add column if not exists vat_overridden_by uuid references auth.users(id) on delete set null,
  add column if not exists vat_overridden_at timestamptz,
  add column if not exists capital_classification text default 'operating_expense',
  add column if not exists business_use_percentage numeric(8,4) default 100,
  add column if not exists vehicle_id uuid,
  add column if not exists vehicle_label text,
  add column if not exists registration_plate text,
  add column if not exists fuel_type text,
  add column if not exists litres numeric(20,4),
  add column if not exists price_per_litre numeric(20,4),
  add column if not exists odometer_reading numeric(20,4),
  add column if not exists business_purpose text,
  add column if not exists driver_employee_id uuid,
  add column if not exists fuel_station text,
  add column if not exists billing_period_start date,
  add column if not exists billing_period_end date,
  add column if not exists utility_account_reference text,
  add column if not exists meter_reference text,
  add column if not exists property_location text,
  add column if not exists contract_reference text,
  add column if not exists purchase_book_eligible boolean not null default false,
  add column if not exists purchase_book_excluded_reason text,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

alter table public.expenses drop constraint if exists expenses_document_type_check;
alter table public.expenses add constraint expenses_document_type_check check (document_type in ('tax_invoice','fiscal_receipt','utility_invoice','contract','bank_document','import_customs_document','other'));
alter table public.expenses drop constraint if exists expenses_payment_status_check;
alter table public.expenses add constraint expenses_payment_status_check check (payment_status in ('unpaid','partially_paid','paid','overdue'));
alter table public.expenses drop constraint if exists expenses_documentation_status_check;
alter table public.expenses add constraint expenses_documentation_status_check check (documentation_status in ('complete','missing_information','missing_supporting_document'));
alter table public.expenses drop constraint if exists expenses_tax_treatment_check;
alter table public.expenses add constraint expenses_tax_treatment_check check (tax_treatment in ('fully_deductible','partially_deductible','non_deductible','review_required'));
alter table public.expenses drop constraint if exists expenses_vat_treatment_check;
alter table public.expenses add constraint expenses_vat_treatment_check check (vat_treatment in ('deductible','partially_deductible','non_deductible','not_vat_registered','no_vat_exempt','review_required'));
alter table public.expenses drop constraint if exists expenses_capital_classification_check;
alter table public.expenses add constraint expenses_capital_classification_check check (capital_classification in ('operating_expense','capital_expense_asset_candidate','review_required'));
alter table public.expenses drop constraint if exists expenses_business_use_percentage_check;
alter table public.expenses add constraint expenses_business_use_percentage_check check (business_use_percentage between 0 and 100);
alter table public.expenses drop constraint if exists expenses_amounts_consistent_check;
alter table public.expenses add constraint expenses_amounts_consistent_check check (gross_amount is null or (gross_amount >= 0 and vat_amount >= 0 and net_amount >= 0 and vat_amount <= gross_amount and abs((net_amount + vat_amount) - gross_amount) <= 0.0001));

create unique index if not exists expenses_company_expense_number_unique on public.expenses(company_id,expense_number) where company_id is not null and expense_number is not null;
create index if not exists expenses_company_category_code_idx on public.expenses(company_id,category_code,date desc);
create index if not exists expenses_company_supplier_idx on public.expenses(company_id,vendor_id,date desc);
create index if not exists expenses_company_payment_status_idx on public.expenses(company_id,payment_status,due_date);
create index if not exists expenses_company_documentation_idx on public.expenses(company_id,documentation_status);

-- Backfill the expanded projection without changing the original amount. The backfill also
-- touches posted expenses (classification columns only), so authorize it for this transaction.
select set_config('app.financial_workflow', 'authorized', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
update public.expenses
set category_code = case
      when lower(coalesce(category,'')) like '%fuel%' or lower(coalesce(article,'')) in ('diesel','petrol') then 'fuel'
      when lower(coalesce(category,'')) like '%rent%' then 'rent'
      when lower(coalesce(category,'')) like '%market%' then 'advertising_marketing'
      when lower(coalesce(category,'')) like '%software%' then 'software_subscriptions'
      when lower(coalesce(category,'')) like '%travel%' or lower(coalesce(category,'')) like '%transport%' then 'transport'
      when lower(coalesce(category,'')) like '%office%' or lower(coalesce(category,'')) like '%suppl%' or lower(coalesce(category,'')) like '%material%' then 'consumable_materials'
      else 'other_expenses' end,
    issue_date = coalesce(issue_date,date),
    document_number = coalesce(document_number,invoice_number),
    gross_amount = coalesce(gross_amount,amount),
    vat_amount = coalesce(vat_amount,tax_amount,0),
    tax_recommended_treatment = coalesce(tax_recommended_treatment,'review_required'),
    tax_treatment = coalesce(tax_treatment,'review_required'),
    vat_recommended_treatment = coalesce(vat_recommended_treatment,case when coalesce(tax_amount,0)>0 then 'review_required' else 'no_vat_exempt' end),
    vat_treatment = coalesce(vat_treatment,case when coalesce(tax_amount,0)>0 then 'review_required' else 'no_vat_exempt' end),
    payment_status = coalesce(payment_status,'paid'),
    paid_amount = case when paid_amount = 0 and coalesce(amount,0) > 0 and accounting_state in ('legacy','posted') then amount else paid_amount end,
    updated_at = coalesce(updated_at,created_at,now())
where category_code is null or gross_amount is null or issue_date is null;

update public.expenses
set net_amount = round(gross_amount - coalesce(vat_amount,0),4),
    tax_amount = coalesce(vat_amount,0),
    outstanding_amount = greatest(round(gross_amount - coalesce(paid_amount,0),4),0),
    payment_status = case when coalesce(paid_amount,0) >= gross_amount then 'paid' when coalesce(paid_amount,0)>0 then 'partially_paid' when due_date is not null and due_date < current_date then 'overdue' else 'unpaid' end
where net_amount is null or outstanding_amount = 0;
select set_config('app.financial_workflow', '', true);
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.role', '', true);

-- Shared safe numbering. The unique index plus the row-locked document
-- sequence makes concurrent tenant writes race-safe.
create or replace function private.expense_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  vat numeric(20,4);
begin
  if new.company_id is not null and new.expense_number is null then
    new.expense_number := private.next_financial_document_number(new.company_id,new.branch_id,'expense','EXP-' || to_char(coalesce(new.date,current_date),'YYYY') || '-',coalesce(new.date,current_date));
  end if;
  new.category_code := coalesce(nullif(trim(new.category_code),''), case when lower(coalesce(new.category,'')) like '%fuel%' or lower(coalesce(new.article,'')) in ('diesel','petrol') then 'fuel' when lower(coalesce(new.category,'')) like '%rent%' then 'rent' when lower(coalesce(new.category,'')) like '%market%' then 'advertising_marketing' when lower(coalesce(new.category,'')) like '%software%' then 'software_subscriptions' when lower(coalesce(new.category,'')) like '%transport%' or lower(coalesce(new.category,'')) like '%travel%' then 'transport' when lower(coalesce(new.category,'')) like '%material%' or lower(coalesce(new.category,'')) like '%suppl%' then 'consumable_materials' else 'other_expenses' end);
  new.issue_date := coalesce(new.issue_date,new.date,current_date);
  -- Legacy correction RPCs still write `amount`; mirror that value when the
  -- expanded gross column was not explicitly supplied by the caller.
  if tg_op = 'UPDATE' and new.amount is distinct from old.amount and new.gross_amount is not distinct from old.gross_amount then
    new.gross_amount := new.amount;
  end if;
  new.gross_amount := round(coalesce(new.gross_amount,new.amount,0),4);
  new.vat_amount := round(coalesce(new.vat_amount,new.tax_amount,0),4);
  new.tax_amount := new.vat_amount;
  -- Legacy tax_recoverable_amount is retained for compatibility, but input
  -- VAT is only claimable from the separate VAT treatment calculation.
  if coalesce(current_setting('app.financial_workflow',true),'') <> 'authorized' then
    new.tax_recoverable_amount := round(coalesce(new.vat_deductible_amount,0),4);
  end if;
  new.net_amount := round(new.gross_amount - new.vat_amount,4);
  new.amount := new.gross_amount;
  new.outstanding_amount := greatest(round(new.gross_amount - coalesce(new.paid_amount,0),4),0);
  new.payment_status := case when coalesce(new.paid_amount,0) >= new.gross_amount then 'paid' when coalesce(new.paid_amount,0)>0 then 'partially_paid' when new.due_date is not null and new.due_date < current_date then 'overdue' else 'unpaid' end;
  new.updated_at := clock_timestamp();
  new.updated_by := coalesce(new.updated_by,(select auth.uid()));
  return new;
end $$;

drop trigger if exists expenses_before_write on public.expenses;
create trigger expenses_before_write before insert or update on public.expenses for each row execute function private.expense_before_write();

create or replace function private.prevent_locked_expense_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare period_status text; book_status text; workflow_authorized boolean := coalesce(current_setting('app.financial_workflow',true),'')='authorized';
begin
  if tg_op='UPDATE' and not workflow_authorized and new.company_id is not null then
    if (new.tax_treatment is distinct from old.tax_treatment or new.tax_deductible_percentage is distinct from old.tax_deductible_percentage or new.tax_deductible_amount is distinct from old.tax_deductible_amount or new.tax_override_reason is distinct from old.tax_override_reason) and not private.has_company_permission(new.company_id,'expense.tax.override') then
      raise exception 'Tax treatment changes require the expense tax override permission' using errcode='42501';
    end if;
    if (new.vat_treatment is distinct from old.vat_treatment or new.vat_deductible_percentage is distinct from old.vat_deductible_percentage or new.vat_deductible_amount is distinct from old.vat_deductible_amount or new.vat_override_reason is distinct from old.vat_override_reason) and not private.has_company_permission(new.company_id,'expense.vat.override') then
      raise exception 'VAT treatment changes require the expense VAT override permission' using errcode='42501';
    end if;
  end if;
  select status into period_status from public.accounting_periods where id=coalesce(new.accounting_period_id,old.accounting_period_id);
  select status into book_status from public.sales_book_periods where id=coalesce(new.sales_book_period_id,old.sales_book_period_id);
  if not workflow_authorized and not private.has_company_permission(coalesce(new.company_id,old.company_id),'expense.period.reopen') and (period_status in ('closed','locked') or book_status in ('DECLARED','LOCKED')) then
    raise exception 'This expense belongs to a closed accounting or Purchase Book period' using errcode='55000';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists expenses_locked_period_guard on public.expenses;
create trigger expenses_locked_period_guard before update or delete on public.expenses for each row execute function private.prevent_locked_expense_mutation();

-- ---------------------------------------------------------------------------
-- Reusable supplier-payment allocations and archive workflow
-- ---------------------------------------------------------------------------

create table if not exists public.expense_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  expense_id uuid not null references public.expenses(id) on delete restrict,
  vendor_payment_id uuid not null references public.vendor_payments(id) on delete restrict,
  allocated_amount numeric(20,4) not null check (allocated_amount > 0),
  allocation_date date not null default current_date,
  status text not null default 'active' check (status in ('active','reversed')),
  reversed_at timestamptz,
  reversed_by uuid references auth.users(id) on delete set null,
  reversal_reason text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique(vendor_payment_id,expense_id)
);
create index if not exists expense_payment_allocations_expense_idx on public.expense_payment_allocations(company_id,expense_id,status);
alter table public.expense_payment_allocations enable row level security;
drop policy if exists expense_payment_allocations_select on public.expense_payment_allocations;
create policy expense_payment_allocations_select on public.expense_payment_allocations for select to authenticated using (private.has_company_permission(company_id,'expense.view') or private.has_company_permission(company_id,'financial_reports.view'));
revoke insert,update,delete,truncate on public.expense_payment_allocations from anon,authenticated;
grant select on public.expense_payment_allocations to authenticated;

create or replace function public.allocate_expense_payment(p_expense_id uuid,p_vendor_payment_id uuid,p_amount numeric,p_allocation_date date default current_date)
returns public.expense_payment_allocations language plpgsql security definer set search_path='' as $$
declare expense_row public.expenses; payment_row public.vendor_payments; result public.expense_payment_allocations; allocated numeric(20,4);
begin
  select * into expense_row from public.expenses where id=p_expense_id for update;
  select * into payment_row from public.vendor_payments where id=p_vendor_payment_id for update;
  if expense_row.id is null or payment_row.id is null or expense_row.company_id is distinct from payment_row.company_id then raise exception 'Expense and supplier payment must belong to the same tenant' using errcode='42501'; end if;
  if not (private.has_company_permission(expense_row.company_id,'expense.payment.record') or private.has_company_permission(expense_row.company_id,'supplier_payment.record')) then raise exception 'Insufficient permission to allocate an expense payment' using errcode='42501'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Payment allocation must be positive' using errcode='23514'; end if;
  if exists(select 1 from public.expense_payment_allocations where expense_id=p_expense_id and vendor_payment_id=p_vendor_payment_id and status='active') then select * into result from public.expense_payment_allocations where expense_id=p_expense_id and vendor_payment_id=p_vendor_payment_id and status='active'; return result; end if;
  select coalesce(sum(allocated_amount),0) into allocated from public.expense_payment_allocations where expense_id=p_expense_id and status='active';
  if round(p_amount,4) > round(expense_row.gross_amount-allocated,4) then raise exception 'Payment exceeds expense outstanding amount' using errcode='23514'; end if;
  insert into public.expense_payment_allocations(company_id,expense_id,vendor_payment_id,allocated_amount,allocation_date,created_by) values(expense_row.company_id,p_expense_id,p_vendor_payment_id,round(p_amount,4),coalesce(p_allocation_date,current_date),(select auth.uid())) returning * into result;
  update public.expenses set paid_amount=round(allocated+p_amount,4),updated_by=(select auth.uid()) where id=p_expense_id;
  return result;
end $$;
revoke all on function public.allocate_expense_payment(uuid,uuid,numeric,date) from public,anon;
grant execute on function public.allocate_expense_payment(uuid,uuid,numeric,date) to authenticated;

create or replace function public.archive_expense(p_expense_id uuid,p_reason text default null)
returns public.expenses language plpgsql security definer set search_path='' as $$
declare expense_row public.expenses;
begin
  select * into expense_row from public.expenses where id=p_expense_id for update;
  if expense_row.id is null then raise exception 'Expense not found' using errcode='P0002'; end if;
  if not (private.has_company_permission(expense_row.company_id,'expense.archive') or private.has_company_permission(expense_row.company_id,'expense.post')) then raise exception 'Insufficient permission to archive expense' using errcode='42501'; end if;
  if expense_row.accounting_period_id is not null and exists(select 1 from public.accounting_periods where id=expense_row.accounting_period_id and status in ('closed','locked')) and not private.has_company_permission(expense_row.company_id,'expense.period.reopen') then raise exception 'Closed accounting periods cannot be archived without an authorized amendment' using errcode='55000'; end if;
  perform set_config('app.change_reason',coalesce(nullif(trim(p_reason),''),'Expense archived'),true);
  update public.expenses set archived_at=clock_timestamp(),archived_by=(select auth.uid()),updated_by=(select auth.uid()) where id=p_expense_id returning * into expense_row;
  perform set_config('app.change_reason','',true);
  return expense_row;
end $$;
revoke all on function public.archive_expense(uuid,text) from public,anon;
grant execute on function public.archive_expense(uuid,text) to authenticated;

create or replace function public.delete_expense(p_expense_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin perform public.archive_expense(p_expense_id,'Legacy delete request converted to archive'); end $$;
grant execute on function public.delete_expense(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Purchase Book traceability, reporting views and audit/RLS boundaries
-- ---------------------------------------------------------------------------

create or replace view public.kosovo_expense_purchase_book
with (security_invoker=true) as
select e.company_id,e.id as source_expense_id,e.expense_number,e.document_number as bill_number,
       coalesce(e.issue_date,e.date) as bill_date,e.vendor_id,coalesce(v.name,e.vendor_name) as supplier_name,
       coalesce(e.supplier_fiscal_number,v.tax_id) as supplier_fiscal_number,
       e.vat_treatment as vat_classification,e.net_amount as taxable_base,e.vat_amount as input_vat,
       e.vat_deductible_amount as recoverable_vat,
       greatest(e.vat_amount-e.vat_deductible_amount,0) as nonrecoverable_vat,e.gross_amount as total_amount,
       e.document_type='import_customs_document' as is_import,false as reverse_charge,false as is_credit_note,
       e.posting_journal_entry_id as source_journal_entry_id,e.documentation_status,e.purchase_book_excluded_reason
from public.expenses e left join public.vendors v on v.id=e.vendor_id
where e.accounting_state='posted' and e.archived_at is null and e.purchase_book_eligible and e.documentation_status='complete';
grant select on public.kosovo_expense_purchase_book to authenticated;

-- The existing Purchase Book remains backwards compatible. This expanded
-- source is the single traceable union consumed by new reporting surfaces.
create or replace view public.kosovo_purchase_book_expanded
with (security_invoker=true) as
select book.company_id,book.period_start,book.supplier_bill_id,null::uuid as source_expense_id,
       book.bill_number,book.bill_date,book.vendor_id,book.supplier_name,book.supplier_fiscal_number,
       book.vat_classification,book.taxable_base,book.input_vat,book.recoverable_vat,book.nonrecoverable_vat,
       book.total_amount,book.is_import,book.reverse_charge,book.is_credit_note,book.source_journal_entry_id
from public.kosovo_purchase_book book
union all
select expense.company_id,date_trunc('month',expense.bill_date)::date,null::uuid,expense.source_expense_id,
       expense.bill_number,expense.bill_date,expense.vendor_id,expense.supplier_name,expense.supplier_fiscal_number,
       expense.vat_classification,expense.taxable_base,expense.input_vat,expense.recoverable_vat,expense.nonrecoverable_vat,
       expense.total_amount,expense.is_import,expense.reverse_charge,expense.is_credit_note,expense.source_journal_entry_id
from public.kosovo_expense_purchase_book expense;
grant select on public.kosovo_purchase_book_expanded to authenticated;

create or replace view public.kosovo_tax_book_reconciliation
with (security_invoker=true) as
with sales as (select company_id,coalesce(sum(output_vat),0)::numeric(20,4) output_vat from public.kosovo_sales_book group by company_id),
purchases as (select company_id,coalesce(sum(recoverable_vat),0)::numeric(20,4) recoverable_vat from public.kosovo_purchase_book_expanded group by company_id),
gl as (select entry.company_id,
  coalesce(sum(case when account.code='2100' then line.credit-line.debit else 0 end),0)::numeric(20,4) output_vat_gl,
  coalesce(sum(case when account.code='1300' then line.debit-line.credit else 0 end),0)::numeric(20,4) recoverable_vat_gl
  from public.journal_entries entry join public.journal_entry_lines line on line.journal_entry_id=entry.id join public.chart_of_accounts account on account.id=line.account_id
  where entry.status='posted' and entry.source_type in ('sales_invoice','pos_invoice','supplier_bill','expense') group by entry.company_id)
select company.id as company_id,coalesce(sales.output_vat,0) as sales_book_output_vat,coalesce(gl.output_vat_gl,0) as output_vat_gl,
  round(coalesce(sales.output_vat,0)-coalesce(gl.output_vat_gl,0),4) as output_vat_difference,
  coalesce(purchases.recoverable_vat,0) as purchase_book_recoverable_vat,coalesce(gl.recoverable_vat_gl,0) as recoverable_vat_gl,
  round(coalesce(purchases.recoverable_vat,0)-coalesce(gl.recoverable_vat_gl,0),4) as recoverable_vat_difference
from public.companies company left join sales on sales.company_id=company.id left join purchases on purchases.company_id=company.id left join gl on gl.company_id=company.id;
grant select on public.kosovo_tax_book_reconciliation to authenticated;

create or replace view public.operix_expense_summary
with (security_invoker=true) as
select e.company_id,count(*) filter(where e.archived_at is null) as expense_count,
  coalesce(sum(e.net_amount) filter(where e.archived_at is null),0)::numeric(20,4) as net_amount,
  coalesce(sum(e.vat_amount) filter(where e.archived_at is null),0)::numeric(20,4) as vat_amount,
  coalesce(sum(e.gross_amount) filter(where e.archived_at is null),0)::numeric(20,4) as gross_amount,
  coalesce(sum(e.paid_amount) filter(where e.archived_at is null),0)::numeric(20,4) as paid_amount,
  coalesce(sum(e.outstanding_amount) filter(where e.archived_at is null),0)::numeric(20,4) as outstanding_amount,
  coalesce(sum(e.tax_deductible_amount) filter(where e.archived_at is null),0)::numeric(20,4) as deductible_amount,
  coalesce(sum(e.tax_non_deductible_amount) filter(where e.archived_at is null),0)::numeric(20,4) as non_deductible_amount,
  coalesce(sum(e.vat_deductible_amount) filter(where e.archived_at is null),0)::numeric(20,4) as recoverable_vat,
  count(*) filter(where e.archived_at is null and e.documentation_status<>'complete') as missing_documentation
from public.expenses e group by e.company_id;
grant select on public.operix_expense_summary to authenticated;

-- Extend the shared audit stream for new financial/tax-sensitive fields.
drop trigger if exists expenses_audit on public.expenses;
create trigger expenses_audit after insert or update or delete on public.expenses for each row execute function private.audit_table_change();
drop trigger if exists expense_payment_allocations_audit on public.expense_payment_allocations;
create trigger expense_payment_allocations_audit after insert or update or delete on public.expense_payment_allocations for each row execute function private.audit_table_change();

-- Reuse the existing archive table for multiple secure attachments. Its
-- existing trigger and tenant policies remain the source of audit/security.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('operix-expense-documents','operix-expense-documents',false,20971520,array['application/pdf','image/jpeg','image/png','image/heic','image/heif'])
on conflict (id) do update set public=false,file_size_limit=20971520,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists expense_documents_select on storage.objects;
create policy expense_documents_select on storage.objects for select to authenticated
using (bucket_id='operix-expense-documents' and public.can_access_company(nullif(split_part(name,'/',1),'')::uuid));
drop policy if exists expense_documents_insert on storage.objects;
create policy expense_documents_insert on storage.objects for insert to authenticated
with check (bucket_id='operix-expense-documents' and public.can_access_company(nullif(split_part(name,'/',1),'')::uuid));
drop policy if exists expense_documents_update on storage.objects;
create policy expense_documents_update on storage.objects for update to authenticated
using (bucket_id='operix-expense-documents' and public.can_access_company(nullif(split_part(name,'/',1),'')::uuid))
with check (bucket_id='operix-expense-documents' and public.can_access_company(nullif(split_part(name,'/',1),'')::uuid));
drop policy if exists expense_documents_delete on storage.objects;
create policy expense_documents_delete on storage.objects for delete to authenticated
using (bucket_id='operix-expense-documents' and public.can_access_company(nullif(split_part(name,'/',1),'')::uuid));

create or replace function public.add_expense_attachment(
  p_expense_id uuid,p_storage_bucket text,p_storage_path text,p_file_name text,
  p_content_type text default null,p_byte_size bigint default null,p_file_checksum text default null,p_metadata jsonb default '{}'::jsonb
)
returns public.financial_document_attachments language plpgsql security definer set search_path='' as $$
declare expense_row public.expenses; result public.financial_document_attachments;
begin
  select * into expense_row from public.expenses where id=p_expense_id;
  if expense_row.id is null then raise exception 'Expense not found' using errcode='P0002'; end if;
  if not (private.has_company_permission(expense_row.company_id,'expense.create') or private.has_company_permission(expense_row.company_id,'expense.edit') or private.has_company_permission(expense_row.company_id,'document.archive.create')) then raise exception 'Insufficient permission to attach an expense document' using errcode='42501'; end if;
  if p_storage_bucket <> 'operix-expense-documents' or split_part(p_storage_path,'/',1) <> expense_row.company_id::text then raise exception 'Expense attachment must use a tenant-scoped private path' using errcode='42501'; end if;
  insert into public.financial_document_attachments(company_id,branch_id,document_type,document_id,storage_bucket,storage_path,file_name,content_type,byte_size,file_checksum,uploaded_by,metadata)
  values(expense_row.company_id,expense_row.branch_id,'expense',expense_row.id,p_storage_bucket,p_storage_path,p_file_name,p_content_type,p_byte_size,p_file_checksum,(select auth.uid()),coalesce(p_metadata,'{}'::jsonb))
  on conflict(company_id,document_type,document_id,storage_bucket,storage_path) do update set deleted_at=null,deleted_by=null,file_name=excluded.file_name,content_type=excluded.content_type,byte_size=excluded.byte_size,file_checksum=excluded.file_checksum,metadata=excluded.metadata,uploaded_at=clock_timestamp(),uploaded_by=(select auth.uid())
  returning * into result;
  update public.expenses
     set documentation_status = case when document_type <> 'other' and coalesce(document_number,invoice_number) is not null and issue_date is not null then 'complete' else 'missing_information' end,
         updated_by=(select auth.uid())
   where id=expense_row.id;
  return result;
end $$;
revoke all on function public.add_expense_attachment(uuid,text,text,text,text,bigint,text,jsonb) from public,anon;
grant execute on function public.add_expense_attachment(uuid,text,text,text,text,bigint,text,jsonb) to authenticated;

drop policy if exists financial_document_attachments_select on public.financial_document_attachments;
create policy financial_document_attachments_select on public.financial_document_attachments for select to authenticated
using (private.has_company_permission(company_id,'expense.view') or private.has_company_permission(company_id,'document.archive.view') or private.has_company_permission(company_id,'supplier_bill.view'));

-- Replace the old broad expense policies with permission-aware tenant RLS.
drop policy if exists "Company shared expenses" on public.expenses;
drop policy if exists expenses_company_select on public.expenses;
drop policy if exists expenses_company_insert on public.expenses;
drop policy if exists expenses_company_update on public.expenses;
drop policy if exists expenses_company_delete on public.expenses;
create policy expenses_company_select on public.expenses for select to authenticated using ((company_id is not null and private.has_company_permission(company_id,'expense.view')) or (company_id is null and user_id=(select auth.uid())));
create policy expenses_company_insert on public.expenses for insert to authenticated with check ((company_id is not null and (private.has_company_permission(company_id,'expense.create') or private.has_company_permission(company_id,'expense.post'))) or (company_id is null and user_id=(select auth.uid())));
create policy expenses_company_update on public.expenses for update to authenticated using ((company_id is not null and (private.has_company_permission(company_id,'expense.edit') or private.has_company_permission(company_id,'expense.post'))) or (company_id is null and user_id=(select auth.uid()))) with check ((company_id is not null and (private.has_company_permission(company_id,'expense.edit') or private.has_company_permission(company_id,'expense.post'))) or (company_id is null and user_id=(select auth.uid())));
revoke delete on public.expenses from anon,authenticated;

-- Permission catalogue. Role grants are additive and only target roles that
-- exist in the installed schema; sensitive overrides are not granted to staff.
insert into public.app_permissions(code,name,category,description,is_sensitive) values
 ('expense.view','View expenses','accounting','View tenant expenses and expense history.',false),
 ('expense.create','Create expenses','accounting','Create expense records without tax overrides.',false),
 ('expense.edit','Edit expenses','accounting','Edit expense records in open periods.',true),
 ('expense.archive','Archive expenses','accounting','Archive expense history without hard deletion.',true),
 ('expense.payment.record','Record expense payments','payments','Record and allocate supplier payments to expenses.',true),
 ('expense.tax.override','Override tax treatment','tax','Change tax deductibility and document the reason.',true),
 ('expense.vat.override','Override VAT treatment','tax','Change input VAT recovery and document the reason.',true),
 ('expense.period.reopen','Amend closed expense periods','tax','Authorize a closed-period expense amendment.',true),
 ('expense.report.view','View expense reports','reports','View expense, tax, VAT and supplier reports.',false),
 ('expense.report.export','Export expense reports','reports','Export expense reports and Purchase Book source rows.',true),
 ('supplier.manage','Manage suppliers','suppliers','Create and maintain supplier records.',true)
on conflict(code) do update set name=excluded.name,category=excluded.category,description=excluded.description,is_sensitive=excluded.is_sensitive;

insert into public.app_role_permissions(role_id,permission_code)
select r.id,p.code from public.app_roles r cross join public.app_permissions p
where r.company_id is null and r.code in ('owner','super_administrator','company_administrator','manager','accountant','senior_accountant')
  and p.code in ('expense.view','expense.create','expense.edit','expense.archive','expense.payment.record','expense.tax.override','expense.vat.override','expense.period.reopen','expense.report.view','expense.report.export','supplier.manage')
on conflict do nothing;

commit;
