-- Reconcile a Stripe payout with the net amount received in a bank account.
-- This is an internal record only: Stripe sync already accounts for the
-- provider payout, so this migration intentionally creates no fund movement.

create table if not exists public.stripe_payout_settlements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  stripe_fund_account_id uuid not null references public.company_fund_accounts(id) on delete restrict,
  bank_fund_account_id uuid not null references public.company_fund_accounts(id) on delete restrict,
  payout_amount numeric(20,4) not null check (payout_amount > 0),
  bank_fee numeric(20,4) not null default 0 check (bank_fee >= 0),
  net_received numeric(20,4) generated always as (payout_amount - bank_fee) stored,
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  settlement_date date not null default current_date,
  description text,
  idempotency_key uuid,
  status text not null default 'active' check (status in ('active', 'reversed')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  reversed_at timestamptz,
  reversed_by uuid references auth.users(id) on delete set null,
  check (bank_fee <= payout_amount)
);

create unique index if not exists stripe_payout_settlements_idempotency_idx
  on public.stripe_payout_settlements(idempotency_key)
  where idempotency_key is not null;
create index if not exists stripe_payout_settlements_company_idx
  on public.stripe_payout_settlements(company_id, settlement_date desc, status);

alter table public.stripe_payout_settlements enable row level security;
drop policy if exists stripe_payout_settlements_member_select on public.stripe_payout_settlements;
create policy stripe_payout_settlements_member_select on public.stripe_payout_settlements
for select to authenticated
using (
  private.is_company_member(company_id)
  or private.can_view_fund_account(stripe_fund_account_id)
  or private.can_view_fund_account(bank_fund_account_id)
);

revoke all on public.stripe_payout_settlements from anon, authenticated;
grant select on public.stripe_payout_settlements to authenticated;

create or replace function public.create_stripe_payout_settlement(
  p_company_id uuid,
  p_stripe_fund_account_id uuid,
  p_bank_fund_account_id uuid,
  p_payout_amount numeric,
  p_bank_fee numeric default 0,
  p_settlement_date date default current_date,
  p_description text default null,
  p_idempotency_key uuid default null
)
returns public.stripe_payout_settlements
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  stripe_fund_row public.company_fund_accounts;
  bank_fund_row public.company_fund_accounts;
  settlement_row public.stripe_payout_settlements;
  payout_amount_value numeric(20,4) := round(coalesce(p_payout_amount, 0), 4);
  bank_fee_value numeric(20,4) := round(coalesce(p_bank_fee, 0), 4);
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_company_id is null or not public.can_access_company(p_company_id) then
    raise exception 'The selected tenant is not accessible' using errcode = '42501';
  end if;
  if not coalesce(private.has_company_permission(p_company_id, 'cash_transaction.post'), false) then
    raise exception 'Insufficient permission to reconcile a Stripe payout' using errcode = '42501';
  end if;
  if payout_amount_value <= 0 then
    raise exception 'Payout amount must be greater than zero' using errcode = '23514';
  end if;
  if bank_fee_value < 0 or bank_fee_value > payout_amount_value then
    raise exception 'Bank fee must be between zero and the payout amount' using errcode = '23514';
  end if;

  select * into stripe_fund_row
    from public.company_fund_accounts
   where id = p_stripe_fund_account_id and is_active
   for update;
  if not found or stripe_fund_row.stripe_store_id is null then
    raise exception 'The selected source is not an active Stripe balance' using errcode = '23503';
  end if;
  if not private.can_view_fund_account(stripe_fund_row.id) then
    raise exception 'The selected Stripe balance is not accessible' using errcode = '42501';
  end if;

  select * into bank_fund_row
    from public.company_fund_accounts
   where id = p_bank_fund_account_id and is_active
   for update;
  if not found or bank_fund_row.fund_type not in ('cash', 'bank') or bank_fund_row.stripe_store_id is not null then
    raise exception 'The selected destination must be an active cash or bank account' using errcode = '23503';
  end if;
  if not private.can_view_fund_account(bank_fund_row.id) then
    raise exception 'The selected destination account is not accessible' using errcode = '42501';
  end if;
  if upper(coalesce(stripe_fund_row.currency, 'EUR')) <> upper(coalesce(bank_fund_row.currency, 'EUR')) then
    raise exception 'Stripe and destination accounts must use the same currency' using errcode = '22023';
  end if;

  if p_idempotency_key is not null then
    select * into settlement_row
      from public.stripe_payout_settlements
     where idempotency_key = p_idempotency_key
     for update;
    if found then return settlement_row; end if;
  end if;

  insert into public.stripe_payout_settlements (
    company_id, stripe_fund_account_id, bank_fund_account_id,
    payout_amount, bank_fee, currency, settlement_date,
    description, idempotency_key, created_by
  ) values (
    p_company_id, stripe_fund_row.id, bank_fund_row.id,
    payout_amount_value, bank_fee_value, upper(coalesce(stripe_fund_row.currency, 'EUR')),
    coalesce(p_settlement_date, current_date), nullif(trim(p_description), ''),
    p_idempotency_key, actor_id
  ) returning * into settlement_row;

  return settlement_row;
end;
$$;

revoke all on function public.create_stripe_payout_settlement(uuid, uuid, uuid, numeric, numeric, date, text, uuid) from public, anon;
grant execute on function public.create_stripe_payout_settlement(uuid, uuid, uuid, numeric, numeric, date, text, uuid) to authenticated;

comment on function public.create_stripe_payout_settlement(uuid, uuid, uuid, numeric, numeric, date, text, uuid) is
  'Records a Stripe payout, bank fee, and net receipt without changing company fund balances.';
