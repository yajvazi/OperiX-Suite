-- Separate operationally pending money from available cash and bank funds.
-- Agent sales and Post COD invoices may already have created cash entries, but
-- the money is not available until the agent/courier barazim is recorded.

drop view if exists public.operix_fund_balances;

create view public.operix_fund_balances
with (security_invoker = true)
as
with raw_balances as (
  select
    fund.id,
    fund.company_id as owner_company_id,
    fund.fund_type,
    fund.company_bank_account_id,
    fund.stripe_store_id,
    fund.name,
    fund.currency,
    fund.opening_balance,
    coalesce(sum(fund_tx.signed_amount) filter (where fund_tx.status = 'active'), 0)::numeric(20,4) as transaction_total,
    (fund.opening_balance + coalesce(sum(fund_tx.signed_amount) filter (where fund_tx.status = 'active'), 0))::numeric(20,4) as balance,
    snapshot.available_balance as provider_available_balance,
    snapshot.pending_balance as provider_pending_balance,
    snapshot.as_of as provider_balance_as_of,
    fund.is_active,
    row_number() over (partition by fund.company_id, fund.fund_type order by fund.id) as fund_type_rank
  from public.company_fund_accounts fund
  left join public.company_fund_transactions fund_tx
    on fund_tx.fund_account_id = fund.id
  left join public.stripe_balance_snapshots snapshot
    on snapshot.stripe_store_id = fund.stripe_store_id
   and snapshot.currency = fund.currency
  group by fund.id, fund.company_id, fund.fund_type, fund.company_bank_account_id,
           fund.stripe_store_id, fund.name, fund.currency, fund.opening_balance,
           snapshot.available_balance, snapshot.pending_balance, snapshot.as_of,
           fund.is_active
), agent_sales as (
  select
    invoice.company_id,
    coalesce(sum(invoice.total_amount), 0)::numeric(20,4) as sales_amount
  from public.invoices invoice
  where invoice.accounting_state = 'posted'
    and coalesce(invoice.post_cod, false) = false
    and lower(coalesce(invoice.payment_method, '')) = 'cash'
    and lower(coalesce(invoice.type, '')) in ('invoice', 'final_invoice', 'advance_invoice', 'simplified_invoice')
    and lower(coalesce(invoice.status::text, '')) not in ('cancelled', 'credited', 'reversed')
  group by invoice.company_id
), agent_settled as (
  select company_id, coalesce(sum(amount), 0)::numeric(20,4) as settled_amount
  from public.agent_settlements
  where status = 'active'
  group by company_id
), cod_sales as (
  select company_id, coalesce(sum(total_amount), 0)::numeric(20,4) as sales_amount
  from public.invoices
  where accounting_state = 'posted'
    and post_cod = true
    and lower(coalesce(type, '')) in ('invoice', 'final_invoice', 'advance_invoice', 'simplified_invoice')
    and lower(coalesce(status::text, '')) not in ('cancelled', 'credited', 'reversed')
  group by company_id
), cod_settled as (
  select company_id, coalesce(sum(amount), 0)::numeric(20,4) as settled_amount
  from public.post_cod_settlements
  where status = 'active'
  group by company_id
), pending_by_company as (
  select
    coalesce(agent_sales.company_id, cod_sales.company_id) as company_id,
    greatest(coalesce(agent_sales.sales_amount, 0) - coalesce(agent_settled.settled_amount, 0), 0)
      + greatest(coalesce(cod_sales.sales_amount, 0) - coalesce(cod_settled.settled_amount, 0), 0) as cash_pending,
    0::numeric(20,4) as bank_pending
  from agent_sales
  full join cod_sales on cod_sales.company_id = agent_sales.company_id
  left join agent_settled on agent_settled.company_id = coalesce(agent_sales.company_id, cod_sales.company_id)
  left join cod_settled on cod_settled.company_id = coalesce(agent_sales.company_id, cod_sales.company_id)
), balances_with_pending as (
  select
    raw.*,
    case
      when raw.stripe_store_id is not null or raw.fund_type not in ('cash', 'bank') or raw.fund_type_rank <> 1 then 0::numeric(20,4)
      when raw.fund_type = 'cash' then coalesce(pending.cash_pending, 0)::numeric(20,4)
      else coalesce(pending.bank_pending, 0)::numeric(20,4)
    end as pending_balance
  from raw_balances raw
  left join pending_by_company pending on pending.company_id = raw.owner_company_id
)
select
  balances.id,
  balances.owner_company_id as company_id,
  balances.owner_company_id,
  balances.fund_type,
  balances.company_bank_account_id,
  balances.stripe_store_id,
  balances.name,
  balances.currency,
  balances.opening_balance,
  balances.transaction_total,
  balances.balance,
  balances.provider_available_balance,
  balances.provider_pending_balance,
  balances.provider_balance_as_of,
  balances.pending_balance,
  (balances.balance - balances.pending_balance)::numeric(20,4) as available_balance,
  balances.is_active,
  false as is_shared
from balances_with_pending balances
union all
select
  balances.id,
  share.shared_company_id as company_id,
  balances.owner_company_id,
  balances.fund_type,
  balances.company_bank_account_id,
  balances.stripe_store_id,
  balances.name,
  balances.currency,
  balances.opening_balance,
  balances.transaction_total,
  balances.balance,
  balances.provider_available_balance,
  balances.provider_pending_balance,
  balances.provider_balance_as_of,
  balances.pending_balance,
  (balances.balance - balances.pending_balance)::numeric(20,4) as available_balance,
  balances.is_active,
  true as is_shared
from balances_with_pending balances
join public.company_bank_account_shares share
  on share.company_bank_account_id = balances.company_bank_account_id
 and share.is_active;

revoke all on public.operix_fund_balances from anon, authenticated;
grant select on public.operix_fund_balances to authenticated;
