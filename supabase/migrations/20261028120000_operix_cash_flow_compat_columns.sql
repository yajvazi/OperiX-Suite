-- The mobile app (and older web builds) read operix_cash_flow with the monthly contract
-- (period_start, cash_account_type, net_change). The finance migration replaced it with a
-- daily contract (transaction_date, cash_in, cash_out, net_cash_flow). Serve both: keep every
-- existing column, append the legacy ones, and split rows by cash/bank account type.
create or replace view public.operix_cash_flow
with (security_invoker = true)
as
select tx.company_id, tx.transaction_date,
  round(coalesce(sum(tx.signed_amount) filter (where tx.signed_amount > 0 and tx.transaction_type not in ('transfer_in','transfer_out')), 0), 4) as cash_in,
  round(coalesce(sum(abs(tx.signed_amount)) filter (where tx.signed_amount < 0 and tx.transaction_type not in ('transfer_in','transfer_out')), 0), 4) as cash_out,
  round(coalesce(sum(tx.signed_amount) filter (where tx.transaction_type not in ('transfer_in','transfer_out')), 0), 4) as net_cash_flow,
  date_trunc('month', tx.transaction_date)::date as period_start,
  coalesce(fa.fund_type, 'other') as cash_account_type,
  round(coalesce(sum(tx.signed_amount) filter (where tx.transaction_type not in ('transfer_in','transfer_out')), 0), 4) as net_change
from public.company_fund_transactions tx
left join public.company_fund_accounts fa on fa.id = tx.fund_account_id
where tx.status = 'active' and private.has_company_permission(tx.company_id, 'financial_reports.view')
group by tx.company_id, tx.transaction_date, coalesce(fa.fund_type, 'other');

notify pgrst, 'reload schema';
