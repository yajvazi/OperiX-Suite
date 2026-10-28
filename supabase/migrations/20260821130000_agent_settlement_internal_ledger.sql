-- Agent barazim is an internal reconciliation entry.
-- The sale money is already included in the company's cash/bank balances,
-- so settling an agent must not post a second fund transaction.

create or replace function public.create_agent_settlement(
  p_company_id uuid,
  p_agent_user_id uuid,
  p_fund_account_id uuid,
  p_amount numeric,
  p_settlement_date date default current_date,
  p_description text default null,
  p_idempotency_key uuid default null
)
returns public.agent_settlements
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  fund_row public.company_fund_accounts;
  settlement_row public.agent_settlements;
  sales_total numeric(20,4) := 0;
  advance_total numeric(20,4) := 0;
  settled_total numeric(20,4) := 0;
  outstanding_total numeric(20,4) := 0;
  settlement_amount numeric(20,4) := round(coalesce(p_amount, 0), 4);
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_company_id is null or not public.can_access_company(p_company_id) then
    raise exception 'The selected tenant is not accessible' using errcode = '42501';
  end if;
  if not coalesce(private.has_company_permission(p_company_id, 'cash_transaction.post'), false) then
    raise exception 'Insufficient permission to settle an agent balance' using errcode = '42501';
  end if;
  if not exists (
    select 1
      from public.memberships membership
     where membership.company_id = p_company_id
       and membership.user_id = p_agent_user_id
       and coalesce(membership.status, 'active') <> 'revoked'
  ) then
    raise exception 'The selected user is not an agent for this tenant' using errcode = '23503';
  end if;
  if settlement_amount <= 0 then
    raise exception 'Settlement amount must be greater than zero' using errcode = '23514';
  end if;

  -- Keep the selected destination for the internal audit trail, but do not
  -- change its balance because the money is already in the books.
  select * into fund_row
    from public.company_fund_accounts
   where id = p_fund_account_id and is_active
   for update;
  if not found then
    raise exception 'The selected cash or bank account is not active' using errcode = '23503';
  end if;
  if fund_row.fund_type not in ('cash', 'bank') or fund_row.stripe_store_id is not null then
    raise exception 'Agent settlements can only use cash or bank accounts' using errcode = '23514';
  end if;
  if not private.can_view_fund_account(fund_row.id) then
    raise exception 'The selected cash or bank account is not accessible' using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    select * into settlement_row
      from public.agent_settlements
     where idempotency_key = p_idempotency_key
     for update;
    if found then return settlement_row; end if;
  end if;

  -- Prevent two simultaneous taps from settling more than the agent has sold.
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':' || p_agent_user_id::text, 0));

  select coalesce(sum(invoice.total_amount), 0)::numeric(20,4)
    into sales_total
    from public.invoices invoice
   where invoice.company_id = p_company_id
     and invoice.user_id = p_agent_user_id
     and invoice.accounting_state = 'posted'
     and lower(coalesce(invoice.payment_method, '')) = 'cash'
     and lower(coalesce(invoice.type, '')) in ('invoice', 'final_invoice', 'advance_invoice', 'simplified_invoice')
     and lower(coalesce(invoice.status::text, '')) not in ('cancelled', 'credited', 'reversed');

  select coalesce(sum(settlement.amount), 0)::numeric(20,4)
    into settled_total
    from public.agent_settlements settlement
   where settlement.company_id = p_company_id
     and settlement.agent_user_id = p_agent_user_id
     and settlement.status = 'active';

  select coalesce(sum(advance.amount), 0)::numeric(20,4)
    into advance_total
    from public.agent_advances advance
   where advance.company_id = p_company_id
     and advance.agent_user_id = p_agent_user_id
     and advance.status = 'active';

  outstanding_total := greatest(sales_total + advance_total - settled_total, 0);
  if settlement_amount > outstanding_total + 0.0001 then
    raise exception 'Settlement amount exceeds the agent balance' using errcode = '23514';
  end if;

  insert into public.agent_settlements (
    company_id, agent_user_id, fund_account_id, amount, currency,
    settlement_date, description, idempotency_key, created_by
  ) values (
    p_company_id, p_agent_user_id, fund_row.id, settlement_amount, fund_row.currency,
    coalesce(p_settlement_date, current_date), nullif(trim(p_description), ''),
    p_idempotency_key, actor_id
  ) returning * into settlement_row;

  return settlement_row;
end;
$$;

revoke all on function public.create_agent_settlement(uuid, uuid, uuid, numeric, date, text, uuid) from public, anon;
grant execute on function public.create_agent_settlement(uuid, uuid, uuid, numeric, date, text, uuid) to authenticated;

comment on function public.create_agent_settlement(uuid, uuid, uuid, numeric, date, text, uuid) is
  'Records an internal agent barazim without changing cash or bank balances.';
