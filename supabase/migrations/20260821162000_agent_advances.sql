-- Record money advanced to an agent. The fund is reduced immediately while
-- the amount remains part of the agent's pending barazim balance.
create table if not exists public.agent_advances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  agent_user_id uuid not null references auth.users(id) on delete restrict,
  fund_account_id uuid not null references public.company_fund_accounts(id) on delete restrict,
  amount numeric(20,4) not null check (amount > 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  advance_date date not null default current_date,
  description text,
  idempotency_key uuid,
  status text not null default 'active' check (status in ('active', 'reversed')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  reversed_at timestamptz,
  reversed_by uuid references auth.users(id) on delete set null
);

create unique index if not exists agent_advances_idempotency_idx
  on public.agent_advances(idempotency_key) where idempotency_key is not null;
create index if not exists agent_advances_agent_idx
  on public.agent_advances(company_id, agent_user_id, advance_date desc, status);

alter table public.agent_advances enable row level security;
drop policy if exists agent_advances_member_select on public.agent_advances;
create policy agent_advances_member_select on public.agent_advances
for select to authenticated
using (private.is_company_member(company_id) or private.can_view_fund_account(fund_account_id));

revoke all on public.agent_advances from anon, authenticated;
grant select on public.agent_advances to authenticated;

create or replace function public.create_agent_advance(
  p_company_id uuid,
  p_agent_user_id uuid,
  p_fund_account_id uuid,
  p_amount numeric,
  p_advance_date date default current_date,
  p_description text default null,
  p_idempotency_key uuid default null
)
returns public.agent_advances
language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  fund_row public.company_fund_accounts;
  advance_row public.agent_advances;
  advance_amount numeric(20,4) := round(coalesce(p_amount, 0), 4);
  current_balance numeric(20,4) := 0;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_company_id is null or not public.can_access_company(p_company_id) then
    raise exception 'The selected tenant is not accessible' using errcode = '42501';
  end if;
  if not coalesce(private.has_company_permission(p_company_id, 'cash_transaction.post'), false) then
    raise exception 'Insufficient permission to record an agent advance' using errcode = '42501';
  end if;
  if not exists (select 1 from public.memberships membership where membership.company_id = p_company_id
    and membership.user_id = p_agent_user_id and coalesce(membership.status, 'active') <> 'revoked') then
    raise exception 'The selected user is not an agent for this tenant' using errcode = '23503';
  end if;
  if advance_amount <= 0 then raise exception 'Advance amount must be greater than zero' using errcode = '23514'; end if;

  select * into fund_row from public.company_fund_accounts
   where id = p_fund_account_id and company_id = p_company_id and is_active for update;
  if not found then raise exception 'The selected cash or bank account is not active' using errcode = '23503'; end if;
  if fund_row.fund_type not in ('cash', 'bank') or fund_row.stripe_store_id is not null then
    raise exception 'Agent advances can only use cash or bank accounts' using errcode = '23514';
  end if;
  if not private.can_view_fund_account(fund_row.id) then raise exception 'The selected cash or bank account is not accessible' using errcode = '42501'; end if;

  if p_idempotency_key is not null then
    select * into advance_row from public.agent_advances where idempotency_key = p_idempotency_key for update;
    if found then return advance_row; end if;
  end if;

  select fund_row.opening_balance + coalesce(sum(transaction.signed_amount), 0)
    into current_balance from public.company_fund_transactions transaction
   where transaction.fund_account_id = fund_row.id and transaction.status = 'active';
  if current_balance < advance_amount then raise exception 'Insufficient funds for this agent advance' using errcode = '23514'; end if;

  insert into public.agent_advances (company_id, agent_user_id, fund_account_id, amount, currency, advance_date, description, idempotency_key, created_by)
  values (p_company_id, p_agent_user_id, fund_row.id, advance_amount, fund_row.currency, coalesce(p_advance_date, current_date), nullif(trim(p_description), ''), p_idempotency_key, actor_id)
  returning * into advance_row;

  insert into public.company_fund_transactions (company_id, source_company_id, fund_account_id, transaction_type, signed_amount, currency, transaction_date, description, source_type, source_id, created_by)
  values (p_company_id, p_company_id, fund_row.id, 'expense', -advance_amount, fund_row.currency, coalesce(p_advance_date, current_date), coalesce(nullif(trim(p_description), ''), 'Agent advance'), 'agent_advance', advance_row.id, actor_id);
  return advance_row;
end;
$$;

revoke all on function public.create_agent_advance(uuid, uuid, uuid, numeric, date, text, uuid) from public, anon;
grant execute on function public.create_agent_advance(uuid, uuid, uuid, numeric, date, text, uuid) to authenticated;
