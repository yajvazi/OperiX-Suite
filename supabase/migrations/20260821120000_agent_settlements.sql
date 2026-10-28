-- Record money handed over by an agent and post it into the selected
-- tenant-owned cash or bank fund. The settlement is separate from customer
-- payments because it reconciles an agent's sales balance.

create table if not exists public.agent_settlements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  agent_user_id uuid not null references auth.users(id) on delete restrict,
  fund_account_id uuid not null references public.company_fund_accounts(id) on delete restrict,
  amount numeric(20,4) not null check (amount > 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  settlement_date date not null default current_date,
  description text,
  idempotency_key uuid,
  status text not null default 'active' check (status in ('active', 'reversed')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  reversed_at timestamptz,
  reversed_by uuid references auth.users(id) on delete set null
);

create unique index if not exists agent_settlements_idempotency_idx
  on public.agent_settlements(idempotency_key)
  where idempotency_key is not null;
create index if not exists agent_settlements_agent_idx
  on public.agent_settlements(company_id, agent_user_id, settlement_date desc, status);
create index if not exists agent_settlements_created_at_idx
  on public.agent_settlements(company_id, created_at desc, status);

alter table public.agent_settlements enable row level security;

drop policy if exists agent_settlements_member_select on public.agent_settlements;
create policy agent_settlements_member_select on public.agent_settlements
for select to authenticated
using (
  private.is_company_member(company_id)
  or private.can_view_fund_account(fund_account_id)
);

revoke all on public.agent_settlements from anon, authenticated;
grant select on public.agent_settlements to authenticated;

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
     and lower(coalesce(invoice.type, '')) in ('invoice', 'final_invoice', 'advance_invoice', 'simplified_invoice')
     and lower(coalesce(invoice.status::text, '')) not in ('cancelled', 'credited', 'reversed');

  select coalesce(sum(settlement.amount), 0)::numeric(20,4)
    into settled_total
    from public.agent_settlements settlement
   where settlement.company_id = p_company_id
     and settlement.agent_user_id = p_agent_user_id
     and settlement.status = 'active';

  outstanding_total := greatest(sales_total - settled_total, 0);
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

  insert into public.company_fund_transactions (
    company_id, source_company_id, fund_account_id, transaction_type, signed_amount,
    currency, transaction_date, description, source_type, source_id, created_by
  ) values (
    fund_row.company_id, p_company_id, fund_row.id, 'income', settlement_amount,
    fund_row.currency, settlement_row.settlement_date,
    coalesce(nullif(trim(p_description), ''), 'Agent settlement'),
    'agent_settlement', settlement_row.id, actor_id
  );

  return settlement_row;
end;
$$;

revoke all on function public.create_agent_settlement(uuid, uuid, uuid, numeric, date, text, uuid) from public, anon;
grant execute on function public.create_agent_settlement(uuid, uuid, uuid, numeric, date, text, uuid) to authenticated;

comment on table public.agent_settlements is
  'Cash or bank deposits that reconcile posted sales attributed to an agent.';
