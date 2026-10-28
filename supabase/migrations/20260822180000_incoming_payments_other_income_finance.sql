-- OperiX financial settlement completion.
--
-- This migration extends the existing payments, payment_allocations,
-- company_fund_accounts, company_fund_transactions, journal, period, audit,
-- and reconciliation architecture. It does not create a second accounting
-- ledger or rewrite invoice revenue when money is received.

begin;

-- ---------------------------------------------------------------------------
-- Permissions and stable category identifiers
-- ---------------------------------------------------------------------------

insert into public.app_permissions (code, name, category, description, is_sensitive)
values
  ('customer_payment.view', 'View incoming payments', 'payments', 'View customer receipts, allocations, and customer credit.', false),
  ('customer_payment.record', 'Record incoming payments', 'payments', 'Record and post money received from customers.', true),
  ('customer_payment.edit', 'Edit incoming payments', 'payments', 'Edit an eligible incoming payment through the audited workflow.', true),
  ('customer_payment.void', 'Void incoming payments', 'payments', 'Void or reverse an incoming payment without deleting history.', true),
  ('customer_payment.allocate', 'Allocate incoming payments', 'payments', 'Allocate or unallocate customer receipts to invoices.', true),
  ('customer_credit.manage', 'Manage customer credit', 'payments', 'Apply, refund, or correct customer credit.', true),
  ('other_income.view', 'View other income', 'income', 'View non-invoice income documents and receipts.', false),
  ('other_income.create', 'Create other income', 'income', 'Create and post non-invoice income documents.', true),
  ('other_income.edit', 'Edit other income', 'income', 'Edit eligible other income through the audited workflow.', true),
  ('cash_account.manage', 'Manage cash and bank accounts', 'banking', 'Create and maintain financial fund accounts.', true),
  ('cash_transaction.post', 'Post cash and bank transactions', 'banking', 'Post transfers, adjustments, and controlled fund movements.', true),
  ('bank.reconcile', 'Reconcile cash and bank accounts', 'banking', 'Complete or reopen a bank or cash reconciliation.', true),
  ('financial_reports.view', 'View financial reports', 'reports', 'View settlement, income, cash-flow, receivable, and payable reports.', false),
  ('financial_reports.export', 'Export financial reports', 'reports', 'Export financial reports and statements.', true),
  ('customer_refund.create', 'Process customer refunds', 'payments', 'Create and post full or partial customer refunds.', true)
on conflict (code) do update
set name = excluded.name, category = excluded.category,
    description = excluded.description, is_sensitive = excluded.is_sensitive;

with grants(role_code, permission_code) as (
  values
    ('owner','customer_payment.view'),('owner','customer_payment.record'),('owner','customer_payment.edit'),('owner','customer_payment.void'),('owner','customer_payment.allocate'),('owner','customer_credit.manage'),('owner','other_income.view'),('owner','other_income.create'),('owner','other_income.edit'),('owner','cash_account.manage'),('owner','cash_transaction.post'),('owner','customer_refund.create'),('owner','financial_reports.view'),('owner','financial_reports.export'),
    ('company_administrator','customer_payment.view'),('company_administrator','customer_payment.record'),('company_administrator','customer_payment.edit'),('company_administrator','customer_payment.void'),('company_administrator','customer_payment.allocate'),('company_administrator','customer_credit.manage'),('company_administrator','other_income.view'),('company_administrator','other_income.create'),('company_administrator','other_income.edit'),('company_administrator','cash_account.manage'),('company_administrator','cash_transaction.post'),('company_administrator','customer_refund.create'),('company_administrator','financial_reports.view'),('company_administrator','financial_reports.export'),
    ('senior_accountant','customer_payment.view'),('senior_accountant','customer_payment.record'),('senior_accountant','customer_payment.edit'),('senior_accountant','customer_payment.void'),('senior_accountant','customer_payment.allocate'),('senior_accountant','customer_credit.manage'),('senior_accountant','other_income.view'),('senior_accountant','other_income.create'),('senior_accountant','other_income.edit'),('senior_accountant','cash_account.manage'),('senior_accountant','cash_transaction.post'),('senior_accountant','customer_refund.create'),('senior_accountant','financial_reports.view'),('senior_accountant','financial_reports.export'),
    ('accountant','customer_payment.view'),('accountant','customer_payment.record'),('accountant','customer_payment.allocate'),('accountant','other_income.view'),('accountant','other_income.create'),('accountant','cash_transaction.post'),('accountant','financial_reports.view'),('accountant','financial_reports.export'),
    ('auditor','customer_payment.view'),('auditor','other_income.view'),('auditor','financial_reports.view'),
    ('read_only','customer_payment.view'),('read_only','other_income.view'),('read_only','financial_reports.view')
)
insert into public.app_role_permissions(role_id, permission_code)
select role.id, grants.permission_code
from public.app_roles role
join grants on grants.role_code = role.code
where role.company_id is null
on conflict do nothing;

insert into public.app_role_permissions(role_id, permission_code)
select role.id, permission_code
from public.app_roles role
cross join (values
  ('owner','bank.reconcile'),('owner','cash_account.manage'),('owner','cash_transaction.post'),
  ('company_administrator','bank.reconcile'),('company_administrator','cash_account.manage'),('company_administrator','cash_transaction.post'),
  ('senior_accountant','bank.reconcile'),('senior_accountant','cash_account.manage')
) as grant_row(role_code,permission_code)
where role.company_id is null and role.code=grant_row.role_code
on conflict do nothing;

create table if not exists public.other_income_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  category_key text not null,
  name_en text not null,
  name_sq text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique(company_id, category_key)
);

insert into public.other_income_categories(category_key, name_en, name_sq)
values
  ('interest_income','Interest Income','Të Hyra nga Interesi'),
  ('commission_income','Commission Income','Të Hyra nga Komisionet'),
  ('rental_income','Rental Income','Të Hyra nga Qiraja'),
  ('asset_sale','Asset Sale','Shitje e Asetit'),
  ('grants_subsidies','Grants / Subsidies','Grante / Subvencione'),
  ('reimbursements','Reimbursements','Rimbursime'),
  ('insurance_compensation','Insurance Compensation','Kompensim nga Sigurimi'),
  ('other_operating_income','Other Operating Income','Të Hyra Tjera Operative'),
  ('other_income','Other Income','Të Hyra Tjera')
on conflict(company_id, category_key) do nothing;

alter table public.other_income_categories enable row level security;
drop policy if exists other_income_categories_read on public.other_income_categories;
create policy other_income_categories_read on public.other_income_categories
for select to authenticated
using (active and (company_id is null or private.is_company_member(company_id)));
revoke all on public.other_income_categories from anon, authenticated;
grant select on public.other_income_categories to authenticated;

-- ---------------------------------------------------------------------------
-- Financial accounts and the unified movement projection
-- ---------------------------------------------------------------------------

alter table public.company_fund_accounts add column if not exists account_type text;
alter table public.company_fund_accounts add column if not exists notes text;
update public.company_fund_accounts
set account_type = case
  when fund_type = 'cash' then 'cash'
  when fund_type = 'bank' then 'bank'
  else 'other'
end
where account_type is null;
alter table public.company_fund_accounts alter column account_type set default 'other';
alter table public.company_fund_accounts alter column account_type set not null;

alter table public.company_fund_accounts drop constraint if exists company_fund_accounts_fund_type_check;
alter table public.company_fund_accounts add constraint company_fund_accounts_fund_type_check
  check (fund_type in ('cash','bank','card_clearing','online_clearing','other'));
alter table public.company_fund_accounts drop constraint if exists company_fund_accounts_account_type_check;
alter table public.company_fund_accounts add constraint company_fund_accounts_account_type_check
  check (account_type in ('cash','bank','card_clearing','online_clearing','other'));
alter table public.company_fund_accounts drop constraint if exists company_fund_accounts_type_relation_check;
alter table public.company_fund_accounts add constraint company_fund_accounts_type_relation_check check (
  (fund_type = 'cash' and company_bank_account_id is null and stripe_store_id is null)
  -- A bank fund is backed by either a company bank account or a Stripe store (see the
  -- Stripe stores migration), never both and never neither.
  or (fund_type = 'bank' and (
    (company_bank_account_id is not null and stripe_store_id is null)
    or (company_bank_account_id is null and stripe_store_id is not null)
  ))
  or (fund_type in ('card_clearing','online_clearing','other'))
);

-- The original fund triggers predate account_type. Keep newly created cash
-- and bank funds classified correctly instead of relying on the default.
create or replace function private.ensure_company_cash_fund()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.company_fund_accounts(company_id,fund_type,account_type,name,currency,created_by,updated_by)
  values(new.id,'cash','cash','Cash',upper(coalesce(nullif(new.currency,''),'EUR')),(select auth.uid()),(select auth.uid()))
  on conflict do nothing;
  return new;
end;
$$;

create or replace function private.sync_company_bank_fund_account()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.company_fund_accounts
     set company_id=new.company_id, fund_type='bank', account_type='bank',
         name=coalesce(nullif(trim(new.bank_name),''),'Bank'),
         currency=upper(coalesce(nullif(trim(new.currency),''),'EUR')),
         is_active=new.is_active, updated_at=now(), updated_by=(select auth.uid())
   where company_bank_account_id=new.id;
  if not found then
    insert into public.company_fund_accounts(company_id,fund_type,account_type,company_bank_account_id,name,currency,is_active,created_by,updated_by)
    values(new.company_id,'bank','bank',new.id,coalesce(nullif(trim(new.bank_name),''),'Bank'),upper(coalesce(nullif(trim(new.currency),''),'EUR')),new.is_active,(select auth.uid()),(select auth.uid()));
  end if;
  return new;
end;
$$;

alter table public.company_fund_transactions
  add column if not exists payment_method text,
  add column if not exists reference text,
  add column if not exists counterparty text,
  add column if not exists reconciliation_status text not null default 'unreconciled',
  add column if not exists transfer_id uuid;

do $$
begin
  alter table public.company_fund_transactions drop constraint if exists company_fund_transactions_reconciliation_status_check;
  alter table public.company_fund_transactions add constraint company_fund_transactions_reconciliation_status_check
    check (reconciliation_status in ('unreconciled','reconciled','ignored'));
exception when duplicate_object then null;
end;
$$;

create index if not exists company_fund_transactions_source_lookup_idx
  on public.company_fund_transactions(company_id, source_type, source_id, transaction_date desc);
create index if not exists company_fund_transactions_reconciliation_idx
  on public.company_fund_transactions(fund_account_id, reconciliation_status, transaction_date desc);

create or replace view public.operix_financial_account_balances
with (security_invoker = true)
as
select fund.id, fund.company_id, fund.name, fund.account_type, fund.fund_type,
  fund.currency, fund.opening_balance,
  round(fund.opening_balance + coalesce(sum(tx.signed_amount) filter(where tx.status = 'active'), 0), 4) as current_balance,
  round(fund.opening_balance + coalesce(sum(tx.signed_amount) filter(where tx.status = 'active' and tx.reconciliation_status = 'reconciled'), 0), 4) as reconciled_balance,
  round(coalesce(sum(tx.signed_amount) filter(where tx.status = 'active' and tx.reconciliation_status <> 'reconciled'), 0), 4) as unreconciled_balance,
  fund.is_active
from public.company_fund_accounts fund
left join public.company_fund_transactions tx on tx.fund_account_id = fund.id
where fund.is_active and private.has_company_permission(fund.company_id,'financial_reports.view')
group by fund.id, fund.company_id, fund.name, fund.account_type, fund.fund_type,
  fund.currency, fund.opening_balance, fund.is_active;

create or replace view public.operix_financial_account_transactions
with (security_invoker = true)
as
select tx.id, tx.company_id, tx.fund_account_id, fund.name as account_name,
  fund.account_type, fund.currency as account_currency, tx.transaction_type,
  tx.signed_amount, tx.currency, tx.transaction_date, tx.description,
  tx.source_type, tx.source_id, tx.payment_method, tx.reference,
  tx.counterparty, tx.reconciliation_status, tx.status, tx.created_at, tx.created_by
from public.company_fund_transactions tx
join public.company_fund_accounts fund on fund.id = tx.fund_account_id
where private.has_company_permission(tx.company_id,'financial_reports.view');

-- The earlier reporting migration exposed a monthly ledger view with a
-- different column contract. PostgreSQL cannot replace a view while
-- renaming its columns, so remove and rebuild both dependent views in one
-- migration while preserving the report-summary contract.
drop view if exists public.operix_report_summary;
drop view if exists public.operix_cash_flow;

create view public.operix_cash_flow
with (security_invoker = true)
as
select tx.company_id, tx.transaction_date,
  round(coalesce(sum(tx.signed_amount) filter(where tx.signed_amount > 0 and tx.transaction_type not in ('transfer_in','transfer_out')), 0), 4) as cash_in,
  round(coalesce(sum(abs(tx.signed_amount)) filter(where tx.signed_amount < 0 and tx.transaction_type not in ('transfer_in','transfer_out')), 0), 4) as cash_out,
  round(coalesce(sum(tx.signed_amount) filter(where tx.transaction_type not in ('transfer_in','transfer_out')), 0), 4) as net_cash_flow
from public.company_fund_transactions tx
where tx.status = 'active' and private.has_company_permission(tx.company_id,'financial_reports.view')
group by tx.company_id, tx.transaction_date;

create view public.operix_report_summary
with (security_invoker = true)
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
  select company_id,coalesce(sum(net_cash_flow),0)::numeric(20,4) cash_flow
  from public.operix_cash_flow group by company_id
), ar as (
  select company_id,coalesce(sum(outstanding_amount),0)::numeric(20,4) ar_outstanding
  from public.operix_ar_aging group by company_id
), ap as (
  select company_id,coalesce(sum(outstanding_amount),0)::numeric(20,4) ap_outstanding
  from public.operix_ap_open_items group by company_id
)
select company.id as company_id,
  coalesce(pl.revenue,0) as revenue,coalesce(pl.expenses,0) as expenses,
  coalesce(pl.revenue,0)-coalesce(pl.expenses,0) as net_profit,
  coalesce(bs.assets,0) as assets,coalesce(bs.liabilities_equity,0) as liabilities_equity,
  coalesce(cash.cash_flow,0) as cash_flow,coalesce(ar.ar_outstanding,0) as ar_outstanding,coalesce(ap.ap_outstanding,0) as ap_outstanding
from public.companies company
left join pl on pl.company_id=company.id left join bs on bs.company_id=company.id
left join cash on cash.company_id=company.id left join ar on ar.company_id=company.id
left join ap on ap.company_id=company.id;

grant select on public.operix_financial_account_balances, public.operix_financial_account_transactions, public.operix_cash_flow to authenticated;
grant select on public.operix_report_summary to authenticated;

-- ---------------------------------------------------------------------------
-- Incoming payments: preserve old records while adding source/account data.
-- ---------------------------------------------------------------------------

alter table public.payments
  add column if not exists payer_name text,
  add column if not exists external_reference text,
  add column if not exists fund_account_id uuid references public.company_fund_accounts(id) on delete restrict,
  add column if not exists attachment_id uuid references public.financial_document_attachments(id) on delete restrict,
  add column if not exists payment_status text not null default 'posted';

do $$
begin
  alter table public.payments drop constraint if exists payments_payment_status_check;
  alter table public.payments add constraint payments_payment_status_check
    check (payment_status in ('posted','voided','reversed'));
exception when duplicate_object then null;
end;
$$;

create index if not exists payments_company_date_idx on public.payments(company_id, payment_date desc);
create index if not exists payments_external_reference_idx on public.payments(company_id, external_reference);
create index if not exists payments_fund_account_idx on public.payments(fund_account_id, payment_date desc);

create or replace function private.validate_payment_fund_account()
returns trigger language plpgsql security definer set search_path = '' as $$
declare fund_row public.company_fund_accounts;
begin
  if new.fund_account_id is null then return new; end if;
  select * into fund_row from public.company_fund_accounts where id = new.fund_account_id and is_active;
  if not found or not (fund_row.company_id = new.company_id or private.can_view_fund_account(fund_row.id)) then
    raise exception 'The selected financial account is not available for this company' using errcode = '23503';
  end if;
  if upper(coalesce(new.currency, 'EUR')) <> upper(fund_row.currency) then
    raise exception 'Payment currency must match the destination account currency' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists payments_validate_fund_account on public.payments;
create trigger payments_validate_fund_account
before insert or update of company_id, currency, fund_account_id on public.payments
for each row execute function private.validate_payment_fund_account();

create or replace function private.validate_financial_attachment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.attachment_id is not null and not exists(
    select 1 from public.financial_document_attachments attachment
     where attachment.id=new.attachment_id and attachment.company_id=new.company_id
       and attachment.deleted_at is null
       and attachment.document_type in ('customer_payment','income')
  ) then
    raise exception 'The attachment is not available for this company and document' using errcode='23503';
  end if;
  return new;
end;
$$;
drop trigger if exists payments_validate_financial_attachment on public.payments;
create trigger payments_validate_financial_attachment
before insert or update of company_id,attachment_id on public.payments
for each row execute function private.validate_financial_attachment();

-- Use an explicitly selected fund when available. Legacy payments continue to
-- resolve to cash or the primary bank fund exactly as before.
create or replace function private.sync_payment_fund_transaction()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target_fund_id uuid;
declare payment_method text := lower(coalesce(new.payment_method, 'cash'));
declare payment_amount numeric(20,4) := round(coalesce(new.amount, 0), 4);
begin
  if tg_op = 'DELETE' then
    update public.company_fund_transactions set status='reversed', reversed_at=clock_timestamp(), reversed_by=(select auth.uid())
    where source_type='customer_payment' and source_id=old.id and status='active';
    return old;
  end if;
  update public.company_fund_transactions set status='reversed', reversed_at=clock_timestamp(), reversed_by=(select auth.uid())
  where source_type='customer_payment' and source_id=new.id and status='active';
  if coalesce(new.accounting_state,'') <> 'posted' or payment_amount <= 0 or coalesce(new.payment_status,'posted') in ('voided','reversed') then return new; end if;
  target_fund_id := new.fund_account_id;
  if target_fund_id is null and payment_method = 'cash' then
    select id into target_fund_id from public.company_fund_accounts where company_id=new.company_id and fund_type='cash' and is_active;
  elsif target_fund_id is null then
    select id into target_fund_id from public.company_fund_accounts
    where company_id=new.company_id and fund_type='bank' and company_bank_account_id=new.company_bank_account_id and is_active;
    if target_fund_id is null then
      select fund.id into target_fund_id from public.company_fund_accounts fund
      join public.company_bank_accounts bank on bank.id=fund.company_bank_account_id
      where fund.company_id=new.company_id and fund.fund_type='bank' and fund.is_active and bank.is_active
      order by bank.is_primary desc, bank.created_at limit 1;
    end if;
  end if;
  if target_fund_id is not null then
    insert into public.company_fund_transactions(company_id,fund_account_id,transaction_type,signed_amount,currency,transaction_date,description,source_type,source_id,created_by,payment_method,reference,counterparty,reconciliation_status)
    values(new.company_id,target_fund_id,'income',payment_amount,upper(coalesce(nullif(new.currency,''),'EUR')),new.payment_date,coalesce(nullif(trim(new.notes),''),nullif(trim(new.external_reference),''),'Customer payment'),'customer_payment',new.id,coalesce((select auth.uid()),new.user_id),new.payment_method,coalesce(new.external_reference,new.bank_reference),coalesce(new.payer_name,(select name from public.clients where id=new.client_id)),'unreconciled');
  end if;
  return new;
end;
$$;

-- A single command supplies the fund/account mapping for cash, bank, card,
-- online, cheque, and other receipt methods. Existing allocation RPCs remain
-- the source of truth for invoice settlement and customer credit.
create or replace function public.record_customer_payment_financial(
  p_company_id uuid, p_customer_id uuid, p_payment_date date, p_amount numeric,
  p_payment_method text, p_fund_account_id uuid, p_reference text default null,
  p_notes text default null, p_payer_name text default null,
  p_currency text default 'EUR', p_idempotency_key uuid default null,
  p_attachment_id uuid default null
)
returns public.payments language plpgsql security definer set search_path = '' as $$
declare fund_row public.company_fund_accounts; bank_id uuid; settlement_id uuid; payment_row public.payments;
declare method text := lower(trim(coalesce(p_payment_method,'cash')));
begin
  if not private.has_company_permission(p_company_id,'customer_payment.record') then raise exception 'Insufficient permission to record customer payments' using errcode='42501'; end if;
  if p_amount is null or round(p_amount,4) <= 0 then raise exception 'Payment amount must be greater than zero' using errcode='23514'; end if;
  if method not in ('cash','bank','bank_transfer','card','online_payment','cheque','other') then raise exception 'Payment method is invalid' using errcode='23514'; end if;
  select * into fund_row from public.company_fund_accounts where id=p_fund_account_id and is_active and (company_id=p_company_id or private.can_view_fund_account(id)) for update;
  if not found then raise exception 'A valid active destination account is required' using errcode='23503'; end if;
  if upper(fund_row.currency) <> upper(coalesce(p_currency,'EUR')) then raise exception 'Payment currency must match the destination account currency' using errcode='23514'; end if;
  if fund_row.company_bank_account_id is not null then bank_id := fund_row.company_bank_account_id; end if;
  if fund_row.account_type = 'cash' then
    select id into settlement_id from public.chart_of_accounts where company_id=p_company_id and code='1010' and active and posting_allowed limit 1;
  elsif fund_row.company_bank_account_id is not null then
    select account_id into settlement_id from public.company_bank_accounts where id=fund_row.company_bank_account_id and company_id=p_company_id;
  end if;
  if settlement_id is null then select id into settlement_id from public.chart_of_accounts where company_id=p_company_id and code='1020' and active and posting_allowed limit 1; end if;
  if settlement_id is null then raise exception 'No active settlement account is configured' using errcode='23514'; end if;
  payment_row := public.record_customer_payment(p_company_id,p_customer_id,p_payment_date,p_amount,method,settlement_id,p_reference,p_notes,null,p_currency,p_idempotency_key);
  perform set_config('app.change_reason','Incoming payment financial destination recorded',true);
  perform set_config('app.financial_workflow','authorized',true);
  update public.payments set fund_account_id=fund_row.id, company_bank_account_id=bank_id, payer_name=nullif(trim(p_payer_name),''), external_reference=nullif(trim(p_reference),''), attachment_id=p_attachment_id, payment_status='posted' where id=payment_row.id returning * into payment_row;
  perform set_config('app.financial_workflow','','true');
  perform set_config('app.change_reason','',true);
  return payment_row;
end;
$$;

revoke all on function public.record_customer_payment_financial(uuid,uuid,date,numeric,text,uuid,text,text,text,text,uuid,uuid) from public, anon;
grant execute on function public.record_customer_payment_financial(uuid,uuid,date,numeric,text,uuid,text,text,text,text,uuid,uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Other Income: economic document, optional VAT review, receipt, and audit.
-- ---------------------------------------------------------------------------

create table if not exists public.other_income (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete restrict,
  income_number text not null,
  category_id uuid not null references public.other_income_categories(id) on delete restrict,
  income_date date not null,
  payer_source text,
  description text not null,
  currency text not null default 'EUR' check(currency ~ '^[A-Z]{3}$'),
  net_amount numeric(20,4) not null check(net_amount > 0),
  vat_amount numeric(20,4) not null default 0 check(vat_amount >= 0),
  gross_amount numeric(20,4) not null check(gross_amount > 0),
  tax_treatment text not null default 'review_required',
  payment_method text not null default 'bank',
  fund_account_id uuid not null references public.company_fund_accounts(id) on delete restrict,
  reference text,
  attachment_id uuid references public.financial_document_attachments(id) on delete restrict,
  notes text,
  accounting_state text not null default 'ready_for_posting' check(accounting_state in ('ready_for_posting','posted','reversed','excluded')),
  posting_journal_entry_id uuid references public.journal_entries(id) on delete restrict,
  idempotency_key uuid,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique(company_id,income_number),
  unique(company_id,idempotency_key)
);

create index if not exists other_income_company_date_idx on public.other_income(company_id,income_date desc);
create index if not exists other_income_category_idx on public.other_income(company_id,category_id,income_date desc);
create index if not exists other_income_reference_idx on public.other_income(company_id,reference);

create or replace function private.sync_other_income_fund_transaction()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.company_fund_transactions set status='reversed',reversed_at=clock_timestamp(),reversed_by=(select auth.uid())
  where source_type='other_income' and source_id=coalesce(new.id,old.id) and status='active';
  if tg_op <> 'DELETE' and new.accounting_state='posted' and new.gross_amount > 0 then
    insert into public.company_fund_transactions(company_id,fund_account_id,transaction_type,signed_amount,currency,transaction_date,description,source_type,source_id,created_by,payment_method,reference,counterparty,reconciliation_status)
    values(new.company_id,new.fund_account_id,'income',round(new.gross_amount,4),new.currency,new.income_date,new.description,'other_income',new.id,coalesce((select auth.uid()),new.created_by),new.payment_method,new.reference,new.payer_source,'unreconciled');
  end if;
  return coalesce(new,old);
end;
$$;
drop trigger if exists other_income_sync_fund_transaction on public.other_income;
create trigger other_income_sync_fund_transaction after insert or update of accounting_state,gross_amount,currency,income_date,fund_account_id,payment_method,reference,payer_source or delete on public.other_income for each row execute function private.sync_other_income_fund_transaction();
drop trigger if exists other_income_validate_financial_attachment on public.other_income;
create trigger other_income_validate_financial_attachment
before insert or update of company_id,attachment_id on public.other_income
for each row execute function private.validate_financial_attachment();

create or replace function public.record_other_income(
  p_company_id uuid, p_category_id uuid, p_income_date date, p_payer_source text,
  p_description text, p_currency text, p_net_amount numeric, p_vat_amount numeric,
  p_tax_treatment text, p_payment_method text, p_fund_account_id uuid,
  p_reference text default null, p_notes text default null,
  p_attachment_id uuid default null, p_idempotency_key uuid default null
)
returns public.other_income language plpgsql security definer set search_path = '' as $$
declare category_row public.other_income_categories; fund_row public.company_fund_accounts; income_row public.other_income; journal_row public.journal_entries; settlement_id uuid; revenue_id uuid; vat_id uuid; gross numeric(20,4); method text := lower(trim(coalesce(p_payment_method,'bank'))); income_number text;
begin
  if not private.has_company_permission(p_company_id,'other_income.create') then raise exception 'Insufficient permission to create other income' using errcode='42501'; end if;
  if p_idempotency_key is not null then select * into income_row from public.other_income where company_id=p_company_id and idempotency_key=p_idempotency_key for update; if found then return income_row; end if; end if;
  if p_income_date is null or p_description is null or nullif(trim(p_description),'') is null then raise exception 'Income date and description are required' using errcode='23514'; end if;
  if p_net_amount is null or round(p_net_amount,4) <= 0 or p_vat_amount is null or round(p_vat_amount,4) < 0 then raise exception 'Income amounts are invalid' using errcode='23514'; end if;
  select * into category_row from public.other_income_categories where id=p_category_id and active and (company_id is null or company_id=p_company_id);
  if not found then raise exception 'Income category is invalid for this company' using errcode='23514'; end if;
  select * into fund_row from public.company_fund_accounts where id=p_fund_account_id and company_id=p_company_id and is_active for update;
  if not found or upper(fund_row.currency) <> upper(coalesce(p_currency,'EUR')) then raise exception 'Destination account is invalid or has a different currency' using errcode='23514'; end if;
  gross := round(p_net_amount + p_vat_amount,4);
  income_number := private.next_financial_document_number(p_company_id,null,'other_income','INC-',p_income_date);
  insert into public.other_income(company_id,income_number,category_id,income_date,payer_source,description,currency,net_amount,vat_amount,gross_amount,tax_treatment,payment_method,fund_account_id,reference,attachment_id,notes,idempotency_key,created_by,updated_by)
  values(p_company_id,income_number,p_category_id,p_income_date,nullif(trim(p_payer_source),''),trim(p_description),upper(coalesce(p_currency,'EUR')),round(p_net_amount,4),round(p_vat_amount,4),gross,coalesce(nullif(trim(p_tax_treatment),''),'review_required'),method,fund_row.id,nullif(trim(p_reference),''),p_attachment_id,p_notes,p_idempotency_key,(select auth.uid()),(select auth.uid())) returning * into income_row;
  if fund_row.account_type='cash' then select id into settlement_id from public.chart_of_accounts where company_id=p_company_id and code='1010' and active and posting_allowed limit 1;
  elsif fund_row.company_bank_account_id is not null then select account_id into settlement_id from public.company_bank_accounts where id=fund_row.company_bank_account_id and company_id=p_company_id;
  end if;
  if settlement_id is null then select id into settlement_id from public.chart_of_accounts where company_id=p_company_id and code='1020' and active and posting_allowed limit 1; end if;
  select id into revenue_id from public.chart_of_accounts where company_id=p_company_id and code='4200' and active and posting_allowed limit 1;
  select id into vat_id from public.chart_of_accounts where company_id=p_company_id and code='2100' and active and posting_allowed limit 1;
  if settlement_id is null or revenue_id is null then raise exception 'Other income posting accounts are not configured' using errcode='23514'; end if;
  if income_row.vat_amount > 0 and vat_id is null then raise exception 'VAT account is not configured; mark the tax treatment for review before posting' using errcode='23514'; end if;
  journal_row := public.create_journal_entry(p_company_id,p_income_date,p_income_date,'Other income '||income_row.income_number,income_row.income_number,income_row.currency,1,null,'automatic');
  perform set_config('app.financial_workflow','authorized',true);
  update public.journal_entries set source_type='other_income',source_id=income_row.id,source_key=income_row.income_number,metadata=jsonb_build_object('category_key',category_row.category_key,'tax_treatment',income_row.tax_treatment) where id=journal_row.id;
  perform set_config('app.financial_workflow','','true');
  insert into public.journal_entry_lines(journal_entry_id,company_id,line_number,account_id,description,debit,credit,transaction_currency,transaction_amount,created_by)
  values(journal_row.id,p_company_id,1,settlement_id,'Other income receipt',gross,0,income_row.currency,gross,(select auth.uid())),
        (journal_row.id,p_company_id,2,revenue_id,'Other income',0,income_row.net_amount,income_row.currency,income_row.net_amount,(select auth.uid()));
  perform set_config('app.financial_workflow','authorized',true);
  if income_row.vat_amount > 0 and vat_id is not null then
    insert into public.journal_entry_lines(journal_entry_id,company_id,line_number,account_id,description,debit,credit,transaction_currency,transaction_amount,created_by)
    values(journal_row.id,p_company_id,3,vat_id,'Other income VAT review',0,income_row.vat_amount,income_row.currency,income_row.vat_amount,(select auth.uid()));
  end if;
  perform set_config('app.financial_workflow','','true');
  journal_row := public.post_journal_entry(journal_row.id,'Other income recorded');
  perform set_config('app.financial_workflow','authorized',true);
  update public.other_income set accounting_state='posted',posting_journal_entry_id=journal_row.id,updated_at=now(),updated_by=(select auth.uid()) where id=income_row.id returning * into income_row;
  perform set_config('app.financial_workflow','','true');
  return income_row;
end;
$$;

revoke all on function public.record_other_income(uuid,uuid,date,text,text,text,numeric,numeric,text,text,uuid,text,text,uuid,uuid) from public, anon;
grant execute on function public.record_other_income(uuid,uuid,date,text,text,text,numeric,numeric,text,text,uuid,text,text,uuid,uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Customer credit, refunds, and a non-destructive refund path.
-- ---------------------------------------------------------------------------

create table if not exists public.customer_refunds (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  customer_id uuid not null references public.clients(id) on delete restrict,
  payment_id uuid references public.payments(id) on delete restrict,
  invoice_id uuid references public.invoices(id) on delete restrict,
  refund_number text not null,
  refund_date date not null,
  amount numeric(20,4) not null check(amount > 0),
  currency text not null default 'EUR' check(currency ~ '^[A-Z]{3}$'),
  fund_account_id uuid not null references public.company_fund_accounts(id) on delete restrict,
  reference text,
  reason text not null,
  status text not null default 'ready_for_posting' check(status in ('ready_for_posting','posted','reversed')),
  posting_journal_entry_id uuid references public.journal_entries(id) on delete restrict,
  idempotency_key uuid,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique(company_id,refund_number), unique(company_id,idempotency_key)
);
create index if not exists customer_refunds_customer_date_idx on public.customer_refunds(company_id,customer_id,refund_date desc);

create or replace function private.sync_customer_refund_fund_transaction()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.company_fund_transactions set status='reversed',reversed_at=clock_timestamp(),reversed_by=(select auth.uid())
  where source_type='customer_refund' and source_id=coalesce(new.id,old.id) and status='active';
  if tg_op <> 'DELETE' and new.status='posted' then
    insert into public.company_fund_transactions(company_id,fund_account_id,transaction_type,signed_amount,currency,transaction_date,description,source_type,source_id,created_by,reference,counterparty,reconciliation_status)
    values(new.company_id,new.fund_account_id,'expense',-round(new.amount,4),new.currency,new.refund_date,'Customer refund','customer_refund',new.id,coalesce((select auth.uid()),new.created_by),new.reference,(select name from public.clients where id=new.customer_id),'unreconciled');
  end if;
  return coalesce(new,old);
end;
$$;
drop trigger if exists customer_refunds_sync_fund_transaction on public.customer_refunds;
create trigger customer_refunds_sync_fund_transaction after insert or update of status,amount,currency,refund_date,fund_account_id or delete on public.customer_refunds for each row execute function private.sync_customer_refund_fund_transaction();

create or replace function public.record_customer_refund(
  p_company_id uuid, p_customer_id uuid, p_payment_id uuid, p_invoice_id uuid,
  p_refund_date date, p_amount numeric, p_fund_account_id uuid,
  p_reason text, p_currency text default 'EUR', p_reference text default null,
  p_idempotency_key uuid default null
)
returns public.customer_refunds language plpgsql security definer set search_path = '' as $$
declare payment_row public.payments; fund_row public.company_fund_accounts; refund_row public.customer_refunds; journal_row public.journal_entries; settlement_id uuid; receivable_id uuid; refund_number text;
begin
  if not private.has_company_permission(p_company_id,'customer_refund.create') then raise exception 'Insufficient permission to process customer refunds' using errcode='42501'; end if;
  if nullif(trim(p_reason),'') is null or p_amount is null or round(p_amount,4) <= 0 then raise exception 'A positive refund amount and reason are required' using errcode='23514'; end if;
  if p_idempotency_key is not null then select * into refund_row from public.customer_refunds where company_id=p_company_id and idempotency_key=p_idempotency_key for update; if found then return refund_row; end if; end if;
  select * into payment_row from public.payments where id=p_payment_id and company_id=p_company_id and client_id=p_customer_id and accounting_state='posted' and payment_status='posted' for update;
  if not found then raise exception 'The original customer payment is invalid for this refund' using errcode='23514'; end if;
  if p_invoice_id is not null and not exists(select 1 from public.invoices where id=p_invoice_id and company_id=p_company_id and client_id=p_customer_id) then raise exception 'The refund invoice is invalid for this customer' using errcode='23514'; end if;
  if round(p_amount,4) > round(payment_row.amount - coalesce((select sum(amount) from public.customer_refunds where payment_id=payment_row.id and status='posted'),0),4) then raise exception 'Refund exceeds the remaining customer payment amount' using errcode='23514'; end if;
  select * into fund_row from public.company_fund_accounts where id=p_fund_account_id and company_id=p_company_id and is_active for update;
  if not found or fund_row.currency <> upper(coalesce(p_currency,'EUR')) then raise exception 'Refund account is invalid or has a different currency' using errcode='23514'; end if;
  if fund_row.account_type='cash' then select id into settlement_id from public.chart_of_accounts where company_id=p_company_id and code='1010' and active and posting_allowed limit 1;
  elsif fund_row.company_bank_account_id is not null then select account_id into settlement_id from public.company_bank_accounts where id=fund_row.company_bank_account_id and company_id=p_company_id;
  end if;
  if settlement_id is null then select id into settlement_id from public.chart_of_accounts where company_id=p_company_id and code='1020' and active and posting_allowed limit 1; end if;
  select id into receivable_id from public.chart_of_accounts where company_id=p_company_id and code='1100' and active and posting_allowed limit 1;
  if settlement_id is null or receivable_id is null then raise exception 'Refund posting accounts are not configured' using errcode='23514'; end if;
  refund_number := private.next_financial_document_number(p_company_id,null,'customer_refund','REF-',p_refund_date);
  insert into public.customer_refunds(company_id,customer_id,payment_id,invoice_id,refund_number,refund_date,amount,currency,fund_account_id,reference,reason,idempotency_key,created_by)
  values(p_company_id,p_customer_id,p_payment_id,p_invoice_id,refund_number,coalesce(p_refund_date,current_date),round(p_amount,4),upper(coalesce(p_currency,'EUR')),fund_row.id,nullif(trim(p_reference),''),trim(p_reason),p_idempotency_key,(select auth.uid())) returning * into refund_row;
  journal_row := public.create_journal_entry(p_company_id,refund_row.refund_date,refund_row.refund_date,'Customer refund '||refund_row.refund_number,refund_row.refund_number,refund_row.currency,1,null,'automatic');
  perform set_config('app.financial_workflow','authorized',true);
  update public.journal_entries set source_type='customer_refund',source_id=refund_row.id,source_key=refund_row.refund_number where id=journal_row.id;
  perform set_config('app.financial_workflow','','true');
  insert into public.journal_entry_lines(journal_entry_id,company_id,line_number,account_id,description,debit,credit,transaction_currency,transaction_amount,created_by)
  values(journal_row.id,p_company_id,1,receivable_id,'Customer refund',refund_row.amount,0,refund_row.currency,refund_row.amount,(select auth.uid())),
        (journal_row.id,p_company_id,2,settlement_id,'Refund paid from account',0,refund_row.amount,refund_row.currency,refund_row.amount,(select auth.uid()));
  journal_row := public.post_journal_entry(journal_row.id,'Customer refund recorded');
  perform set_config('app.financial_workflow','authorized',true);
  update public.customer_refunds set status='posted',posting_journal_entry_id=journal_row.id where id=refund_row.id returning * into refund_row;
  perform set_config('app.financial_workflow','','true');
  return refund_row;
end;
$$;

revoke all on function public.record_customer_refund(uuid,uuid,uuid,uuid,date,numeric,uuid,text,text,text,uuid) from public,anon;
grant execute on function public.record_customer_refund(uuid,uuid,uuid,uuid,date,numeric,uuid,text,text,text,uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Controlled account maintenance, adjustments, and reconciliation.
-- ---------------------------------------------------------------------------

create table if not exists public.financial_adjustments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  fund_account_id uuid not null references public.company_fund_accounts(id) on delete restrict,
  adjustment_date date not null,
  amount numeric(20,4) not null check(amount <> 0),
  currency text not null default 'EUR' check(currency ~ '^[A-Z]{3}$'),
  reason text not null,
  status text not null default 'posted' check(status in ('posted','reversed')),
  idempotency_key uuid,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique(company_id,idempotency_key)
);
create index if not exists financial_adjustments_fund_date_idx
  on public.financial_adjustments(fund_account_id,adjustment_date desc);

create or replace function private.sync_financial_adjustment_fund_transaction()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.company_fund_transactions
     set status='reversed', reversed_at=clock_timestamp(), reversed_by=(select auth.uid())
   where source_type='adjustment' and source_id=coalesce(new.id,old.id) and status='active';
  if tg_op <> 'DELETE' and new.status='posted' then
    insert into public.company_fund_transactions(
      company_id,fund_account_id,transaction_type,signed_amount,currency,transaction_date,
      description,source_type,source_id,created_by,reconciliation_status
    ) values(
      new.company_id,new.fund_account_id,
      case when new.amount > 0 then 'income' else 'expense' end,
      round(new.amount,4),new.currency,new.adjustment_date,new.reason,
      'adjustment',new.id,coalesce((select auth.uid()),new.created_by),'unreconciled'
    );
  end if;
  return coalesce(new,old);
end;
$$;
drop trigger if exists financial_adjustments_sync_fund_transaction on public.financial_adjustments;
create trigger financial_adjustments_sync_fund_transaction
after insert or update of status,amount,currency,adjustment_date,fund_account_id or delete
on public.financial_adjustments for each row execute function private.sync_financial_adjustment_fund_transaction();

create or replace function public.create_financial_account(
  p_company_id uuid, p_name text, p_account_type text, p_currency text default 'EUR',
  p_company_bank_account_id uuid default null, p_opening_balance numeric default 0,
  p_notes text default null
)
returns public.company_fund_accounts language plpgsql security definer set search_path = '' as $$
declare account_row public.company_fund_accounts; bank_row public.company_bank_accounts; account_kind text := lower(trim(coalesce(p_account_type,'')));
begin
  if not private.has_company_permission(p_company_id,'cash_account.manage') then raise exception 'Insufficient permission to manage financial accounts' using errcode='42501'; end if;
  if nullif(trim(p_name),'') is null or account_kind not in ('cash','bank','card_clearing','online_clearing','other') then raise exception 'Account name and type are required' using errcode='23514'; end if;
  if p_opening_balance is null or p_opening_balance < 0 then raise exception 'Opening balance must be zero or greater' using errcode='23514'; end if;
  if account_kind='cash' and p_company_bank_account_id is not null then raise exception 'Cash accounts cannot reference a bank account' using errcode='23514'; end if;
  if account_kind='bank' and p_company_bank_account_id is null then raise exception 'Bank accounts require a bank account record' using errcode='23514'; end if;
  if p_company_bank_account_id is not null then
    select * into bank_row from public.company_bank_accounts
     where id=p_company_bank_account_id and is_active
       and (company_id=p_company_id or private.can_access_company_bank_account(id));
    if not found or upper(bank_row.currency) <> upper(coalesce(p_currency,'EUR')) then raise exception 'Bank account is invalid or has a different currency' using errcode='23514'; end if;
  end if;
  perform set_config('app.change_reason',coalesce(nullif(trim(p_notes),''),'Financial account created'),true);
  insert into public.company_fund_accounts(company_id,fund_type,account_type,company_bank_account_id,name,currency,opening_balance,notes,created_by,updated_by)
  values(p_company_id,account_kind,account_kind,p_company_bank_account_id,trim(p_name),upper(coalesce(p_currency,'EUR')),round(p_opening_balance,4),nullif(trim(p_notes),''),(select auth.uid()),(select auth.uid()))
  returning * into account_row;
  perform set_config('app.change_reason','',true);
  return account_row;
end;
$$;
revoke all on function public.create_financial_account(uuid,text,text,text,uuid,numeric,text) from public,anon;
grant execute on function public.create_financial_account(uuid,text,text,text,uuid,numeric,text) to authenticated;

create or replace function public.update_financial_account(
  p_fund_account_id uuid, p_name text, p_notes text default null,
  p_is_active boolean default true, p_reason text default null
)
returns public.company_fund_accounts language plpgsql security definer set search_path = '' as $$
declare account_row public.company_fund_accounts;
begin
  select * into account_row from public.company_fund_accounts where id=p_fund_account_id for update;
  if not found then raise exception 'Financial account not found' using errcode='P0002'; end if;
  if not private.has_company_permission(account_row.company_id,'cash_account.manage') then raise exception 'Insufficient permission to manage financial accounts' using errcode='42501'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Account name is required' using errcode='23514'; end if;
  perform set_config('app.change_reason',coalesce(nullif(trim(p_reason),''),'Financial account updated'),true);
  update public.company_fund_accounts
     set name=trim(p_name), notes=nullif(trim(p_notes),''), is_active=coalesce(p_is_active,true), updated_at=now(), updated_by=(select auth.uid())
   where id=account_row.id returning * into account_row;
  perform set_config('app.change_reason','',true);
  return account_row;
end;
$$;
revoke all on function public.update_financial_account(uuid,text,text,boolean,text) from public,anon;
grant execute on function public.update_financial_account(uuid,text,text,boolean,text) to authenticated;

create or replace function public.create_fund_adjustment(
  p_fund_account_id uuid, p_amount numeric, p_adjustment_date date,
  p_reason text, p_idempotency_key uuid default null
)
returns public.financial_adjustments language plpgsql security definer set search_path = '' as $$
declare fund_row public.company_fund_accounts; adjustment_row public.financial_adjustments; period_row public.accounting_periods;
begin
  select * into fund_row from public.company_fund_accounts where id=p_fund_account_id and is_active for update;
  if not found then raise exception 'Financial account is not active' using errcode='23503'; end if;
  if not private.has_company_permission(fund_row.company_id,'cash_transaction.post') then raise exception 'Insufficient permission to post financial adjustments' using errcode='42501'; end if;
  if p_amount is null or round(p_amount,4)=0 or nullif(trim(p_reason),'') is null or p_adjustment_date is null then raise exception 'Adjustment date, non-zero amount, and reason are required' using errcode='23514'; end if;
  if p_idempotency_key is not null then select * into adjustment_row from public.financial_adjustments where company_id=fund_row.company_id and idempotency_key=p_idempotency_key for update; if found then return adjustment_row; end if; end if;
  select * into period_row from public.accounting_periods where company_id=fund_row.company_id and p_adjustment_date between start_date and end_date for update;
  if not found or period_row.status <> 'open' then raise exception 'Financial adjustments are not allowed in a closed period' using errcode='55000'; end if;
  perform set_config('app.change_reason',trim(p_reason),true);
  insert into public.financial_adjustments(company_id,fund_account_id,adjustment_date,amount,currency,reason,idempotency_key,created_by)
  values(fund_row.company_id,fund_row.id,p_adjustment_date,round(p_amount,4),fund_row.currency,trim(p_reason),p_idempotency_key,(select auth.uid())) returning * into adjustment_row;
  perform set_config('app.change_reason','',true);
  return adjustment_row;
end;
$$;
revoke all on function public.create_fund_adjustment(uuid,numeric,date,text,uuid) from public,anon;
grant execute on function public.create_fund_adjustment(uuid,numeric,date,text,uuid) to authenticated;

create or replace function public.set_fund_transaction_reconciliation(
  p_transaction_id uuid, p_status text, p_reason text default null
)
returns public.company_fund_transactions language plpgsql security definer set search_path = '' as $$
declare transaction_row public.company_fund_transactions; new_status text := lower(trim(coalesce(p_status,'')));
begin
  select tx.* into transaction_row from public.company_fund_transactions tx join public.company_fund_accounts fund on fund.id=tx.fund_account_id where tx.id=p_transaction_id and fund.is_active for update;
  if not found then raise exception 'Financial transaction not found' using errcode='P0002'; end if;
  if new_status not in ('unreconciled','reconciled','ignored') then raise exception 'Reconciliation status is invalid' using errcode='23514'; end if;
  if not private.has_company_permission(transaction_row.company_id,'bank.reconcile') then raise exception 'Insufficient permission to reconcile financial transactions' using errcode='42501'; end if;
  perform set_config('app.change_reason',coalesce(nullif(trim(p_reason),''),'Reconciliation status changed'),true);
  update public.company_fund_transactions set reconciliation_status=new_status where id=transaction_row.id returning * into transaction_row;
  perform set_config('app.change_reason','',true);
  return transaction_row;
end;
$$;
revoke all on function public.set_fund_transaction_reconciliation(uuid,text,text) from public,anon;
grant execute on function public.set_fund_transaction_reconciliation(uuid,text,text) to authenticated;

create or replace function public.create_other_income_category(
  p_company_id uuid, p_category_key text, p_name_en text, p_name_sq text
)
returns public.other_income_categories language plpgsql security definer set search_path = '' as $$
declare category_row public.other_income_categories;
begin
  if not private.has_company_permission(p_company_id,'other_income.edit') then raise exception 'Insufficient permission to manage income categories' using errcode='42501'; end if;
  if nullif(trim(p_category_key),'') is null or nullif(trim(p_name_en),'') is null or nullif(trim(p_name_sq),'') is null then raise exception 'Category key and names are required' using errcode='23514'; end if;
  insert into public.other_income_categories(company_id,category_key,name_en,name_sq,created_by)
  values(p_company_id,lower(trim(p_category_key)),trim(p_name_en),trim(p_name_sq),(select auth.uid())) returning * into category_row;
  return category_row;
end;
$$;
revoke all on function public.create_other_income_category(uuid,text,text,text) from public,anon;
grant execute on function public.create_other_income_category(uuid,text,text,text) to authenticated;

alter table public.financial_adjustments enable row level security;
drop policy if exists financial_adjustments_read on public.financial_adjustments;
create policy financial_adjustments_read on public.financial_adjustments for select to authenticated using(private.is_company_member(company_id));
revoke all on public.financial_adjustments from anon,authenticated;
grant select on public.financial_adjustments to authenticated;
drop trigger if exists financial_adjustments_audit on public.financial_adjustments;
create trigger financial_adjustments_audit after insert or update or delete on public.financial_adjustments for each row execute function private.audit_table_change();

create or replace view public.customer_credit_balances
with (security_invoker = true)
as
with allocation_totals as (
  select allocation.payment_id, sum(allocation.allocated_amount) as allocated_amount
  from public.payment_allocations allocation
  where allocation.status='active'
  group by allocation.payment_id
), refund_totals as (
  select refund.payment_id, sum(refund.amount) as refund_amount
  from public.customer_refunds refund
  where refund.status='posted'
  group by refund.payment_id
)
select payment.company_id,payment.client_id as customer_id,
  round(sum(payment.amount - coalesce(allocation_totals.allocated_amount,0) - coalesce(refund_totals.refund_amount,0)),4) as available_credit,
  max(payment.payment_date) as latest_payment_date
from public.payments payment
left join allocation_totals on allocation_totals.payment_id=payment.id
left join refund_totals on refund_totals.payment_id=payment.id
where payment.accounting_state='posted' and payment.payment_status='posted'
group by payment.company_id,payment.client_id;
grant select on public.customer_credit_balances to authenticated;

-- ---------------------------------------------------------------------------
-- Audit, RLS, and report surfaces
-- ---------------------------------------------------------------------------

alter table public.other_income enable row level security;
drop policy if exists other_income_read on public.other_income;
create policy other_income_read on public.other_income for select to authenticated using(private.has_company_permission(company_id,'other_income.view'));
drop policy if exists other_income_insert on public.other_income;
create policy other_income_insert on public.other_income for insert to authenticated with check(private.has_company_permission(company_id,'other_income.create'));
drop policy if exists other_income_update on public.other_income;
create policy other_income_update on public.other_income for update to authenticated using(private.has_company_permission(company_id,'other_income.edit')) with check(private.has_company_permission(company_id,'other_income.edit'));
revoke delete on public.other_income from anon,authenticated;
grant select on public.other_income to authenticated;

alter table public.customer_refunds enable row level security;
drop policy if exists customer_refunds_read on public.customer_refunds;
create policy customer_refunds_read on public.customer_refunds for select to authenticated using(private.has_company_permission(company_id,'customer_payment.view'));
revoke all on public.customer_refunds from anon,authenticated;
grant select on public.customer_refunds to authenticated;

-- Shared bank access must expose only the shared fund itself and its own
-- movements; it must never broaden access to another company's funds.
drop policy if exists company_fund_accounts_member_select on public.company_fund_accounts;
create policy company_fund_accounts_member_select on public.company_fund_accounts
for select to authenticated using(private.can_view_fund_account(id));
drop policy if exists company_fund_transactions_member_select on public.company_fund_transactions;
create policy company_fund_transactions_member_select on public.company_fund_transactions
for select to authenticated using(private.can_view_fund_account(fund_account_id));

drop trigger if exists other_income_audit on public.other_income;
create trigger other_income_audit after insert or update or delete on public.other_income for each row execute function private.audit_table_change();
drop trigger if exists customer_refunds_audit on public.customer_refunds;
create trigger customer_refunds_audit after insert or update or delete on public.customer_refunds for each row execute function private.audit_table_change();
drop trigger if exists company_fund_accounts_audit on public.company_fund_accounts;
create trigger company_fund_accounts_audit after insert or update or delete on public.company_fund_accounts for each row execute function private.audit_table_change();
drop trigger if exists company_fund_transactions_audit on public.company_fund_transactions;
create trigger company_fund_transactions_audit after insert or update or delete on public.company_fund_transactions for each row execute function private.audit_table_change();

create or replace view public.operix_income_report
with (security_invoker = true)
as
select invoice.company_id, invoice.issue_date as income_date, 'sales_invoice'::text as source_type, invoice.id as source_id, invoice.currency, round(invoice.total_amount,4) as amount
from public.invoices invoice
where invoice.accounting_state='posted' and private.has_company_permission(invoice.company_id,'financial_reports.view') and invoice.commercial_document_type in ('INVOICE','FINAL_INVOICE','ADVANCE_INVOICE','SIMPLIFIED_INVOICE')
union all
select income.company_id,income.income_date,'other_income'::text,income.id,income.currency,income.gross_amount
from public.other_income income where income.accounting_state='posted' and private.has_company_permission(income.company_id,'financial_reports.view');

create or replace view public.operix_payment_report
with (security_invoker = true)
as
select payment.company_id,payment.id,payment.payment_number,payment.payment_date,payment.amount,payment.currency,payment.payment_method,payment.fund_account_id,payment.external_reference,payment.client_id as customer_id,'customer_payment'::text as source_type
from public.payments payment where payment.accounting_state='posted' and payment.payment_status='posted' and private.has_company_permission(payment.company_id,'financial_reports.view')
union all
select payment.company_id,payment.id,payment.payment_number,payment.payment_date,payment.amount,payment.currency,payment.payment_method,payment.settlement_account_id,payment.bank_reference,payment.vendor_id,'supplier_payment'::text
from public.vendor_payments payment where payment.accounting_state='posted' and private.has_company_permission(payment.company_id,'financial_reports.view');

grant select on public.operix_income_report,public.operix_payment_report to authenticated;

comment on view public.customer_credit_balances is 'Available customer credit is the unallocated portion of posted receipts less posted refunds; it is not revenue.';
comment on view public.operix_cash_flow is 'Actual fund movements excluding transfers between accounts owned by the company.';
comment on table public.other_income is 'Non-invoice economic income document. Tax treatment defaults to review_required and must not be inferred from settlement.';

commit;
