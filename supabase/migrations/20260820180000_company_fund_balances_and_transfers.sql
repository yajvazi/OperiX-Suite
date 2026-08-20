-- Track cash and each company bank account as separate funds.
-- The fund ledger is deliberately independent from the shared 1010/1020
-- fallback accounts so two unmapped bank accounts cannot be merged together.

create table if not exists public.company_fund_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  fund_type text not null check (fund_type in ('cash', 'bank')),
  company_bank_account_id uuid references public.company_bank_accounts(id) on delete cascade,
  name text not null,
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  opening_balance numeric(20,4) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint company_fund_accounts_type_relation_check check (
    (fund_type = 'cash' and company_bank_account_id is null)
    or (fund_type = 'bank' and company_bank_account_id is not null)
  )
);

create unique index if not exists company_fund_accounts_one_cash_idx
  on public.company_fund_accounts(company_id)
  where fund_type = 'cash';
create unique index if not exists company_fund_accounts_bank_idx
  on public.company_fund_accounts(company_bank_account_id)
  where company_bank_account_id is not null;
create index if not exists company_fund_accounts_company_active_idx
  on public.company_fund_accounts(company_id, is_active, fund_type);

-- Every company gets a cash fund, and existing bank settings become bank funds.
insert into public.company_fund_accounts (company_id, fund_type, name, currency)
select company.id, 'cash', 'Cash', upper(coalesce(nullif(company.currency, ''), 'EUR'))
from public.companies company
where not exists (
  select 1 from public.company_fund_accounts fund
  where fund.company_id = company.id and fund.fund_type = 'cash'
);

create or replace function private.ensure_company_cash_fund()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.company_fund_accounts (company_id, fund_type, name, currency, created_by, updated_by)
  values (new.id, 'cash', 'Cash', upper(coalesce(nullif(new.currency, ''), 'EUR')), (select auth.uid()), (select auth.uid()))
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists companies_ensure_cash_fund on public.companies;
create trigger companies_ensure_cash_fund
after insert on public.companies
for each row execute function private.ensure_company_cash_fund();

insert into public.company_fund_accounts (
  company_id, fund_type, company_bank_account_id, name, currency, is_active
)
select account.company_id, 'bank', account.id, account.bank_name,
       upper(coalesce(nullif(account.currency, ''), 'EUR')), account.is_active
from public.company_bank_accounts account
where not exists (
  select 1 from public.company_fund_accounts fund
  where fund.company_bank_account_id = account.id
);

create or replace function private.sync_company_bank_fund_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.company_fund_accounts
     set company_id = new.company_id,
         name = coalesce(nullif(trim(new.bank_name), ''), 'Bank'),
         currency = upper(coalesce(nullif(trim(new.currency), ''), 'EUR')),
         is_active = new.is_active,
         updated_at = now(),
         updated_by = (select auth.uid())
   where company_bank_account_id = new.id;
  if not found then
    insert into public.company_fund_accounts (
      company_id, fund_type, company_bank_account_id, name, currency, is_active,
      created_by, updated_by
    )
    values (
      new.company_id, 'bank', new.id, coalesce(nullif(trim(new.bank_name), ''), 'Bank'),
      upper(coalesce(nullif(trim(new.currency), ''), 'EUR')), new.is_active,
      (select auth.uid()), (select auth.uid())
    );
  end if;

  return new;
end;
$$;

drop trigger if exists company_bank_accounts_sync_fund on public.company_bank_accounts;
create trigger company_bank_accounts_sync_fund
after insert or update of company_id, bank_name, currency, is_active
on public.company_bank_accounts
for each row execute function private.sync_company_bank_fund_account();

create table if not exists public.company_fund_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  fund_account_id uuid not null references public.company_fund_accounts(id) on delete restrict,
  transaction_type text not null check (transaction_type in (
    'expense', 'income', 'transfer_in', 'transfer_out', 'adjustment'
  )),
  signed_amount numeric(20,4) not null check (signed_amount <> 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  transaction_date date not null default current_date,
  description text,
  source_type text not null,
  source_id uuid not null,
  status text not null default 'active' check (status in ('active', 'reversed')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  reversed_at timestamptz,
  reversed_by uuid references auth.users(id) on delete set null,
  constraint company_fund_transactions_company_match check (company_id is not null)
);

create unique index if not exists company_fund_transactions_active_source_idx
  on public.company_fund_transactions(source_type, source_id, fund_account_id)
  where status = 'active';
create index if not exists company_fund_transactions_fund_date_idx
  on public.company_fund_transactions(fund_account_id, transaction_date, status);
create index if not exists company_fund_transactions_company_idx
  on public.company_fund_transactions(company_id, transaction_date, status);

create table if not exists public.company_fund_transfers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source_fund_account_id uuid not null references public.company_fund_accounts(id) on delete restrict,
  target_fund_account_id uuid not null references public.company_fund_accounts(id) on delete restrict,
  amount numeric(20,4) not null check (amount > 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  transfer_date date not null default current_date,
  description text,
  idempotency_key uuid,
  status text not null default 'posted' check (status in ('posted', 'reversed')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint company_fund_transfers_different_accounts check (source_fund_account_id <> target_fund_account_id)
);

create unique index if not exists company_fund_transfers_idempotency_idx
  on public.company_fund_transfers(company_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists company_fund_transfers_company_date_idx
  on public.company_fund_transfers(company_id, transfer_date desc);

create or replace function private.sync_expense_fund_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_fund_id uuid;
  payment_method text := lower(coalesce(new.payment_method, 'bank'));
  expense_amount numeric(20,4) := round(coalesce(new.amount, 0), 4);
begin
  if tg_op = 'DELETE' then
    update public.company_fund_transactions
       set status = 'reversed', reversed_at = clock_timestamp(), reversed_by = (select auth.uid())
     where source_type = 'expense' and source_id = old.id and status = 'active';
    return old;
  end if;

  update public.company_fund_transactions
     set status = 'reversed', reversed_at = clock_timestamp(), reversed_by = (select auth.uid())
   where source_type = 'expense'
     and source_id = new.id
     and status = 'active';

  if coalesce(new.accounting_state, '') <> 'posted' or expense_amount <= 0 then
    return new;
  end if;

  if payment_method = 'cash' then
    select id into target_fund_id
      from public.company_fund_accounts
     where company_id = new.company_id and fund_type = 'cash' and is_active;
  else
    select id into target_fund_id
      from public.company_fund_accounts
     where company_id = new.company_id
       and fund_type = 'bank'
       and company_bank_account_id = new.company_bank_account_id
       and is_active;

    -- Legacy bank expenses may not have a selected bank. Keep them visible by
    -- assigning them to the company's primary active bank when possible.
    if target_fund_id is null then
      select fund.id into target_fund_id
        from public.company_fund_accounts fund
        join public.company_bank_accounts bank on bank.id = fund.company_bank_account_id
       where fund.company_id = new.company_id
         and fund.fund_type = 'bank'
         and fund.is_active
         and bank.is_active
       order by bank.is_primary desc, bank.created_at
       limit 1;
    end if;
  end if;

  if target_fund_id is not null then
    insert into public.company_fund_transactions (
      company_id, fund_account_id, transaction_type, signed_amount, currency,
      transaction_date, description, source_type, source_id, created_by
    )
    values (
      new.company_id, target_fund_id, 'expense', -expense_amount,
      upper(coalesce(nullif(new.currency, ''), 'EUR')), new.date,
      coalesce(nullif(trim(new.description), ''), 'Expense'), 'expense', new.id,
      coalesce((select auth.uid()), new.user_id)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists expenses_sync_fund_transaction on public.expenses;
create trigger expenses_sync_fund_transaction
after insert or update of accounting_state, amount, currency, date, payment_method, company_bank_account_id or delete
on public.expenses
for each row execute function private.sync_expense_fund_transaction();

create or replace function private.sync_payment_fund_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_fund_id uuid;
  payment_method text := lower(coalesce(new.payment_method, 'cash'));
  payment_amount numeric(20,4) := round(coalesce(new.amount, 0), 4);
begin
  if tg_op = 'DELETE' then
    update public.company_fund_transactions
       set status = 'reversed', reversed_at = clock_timestamp(), reversed_by = (select auth.uid())
     where source_type = 'customer_payment' and source_id = old.id and status = 'active';
    return old;
  end if;

  update public.company_fund_transactions
     set status = 'reversed', reversed_at = clock_timestamp(), reversed_by = (select auth.uid())
   where source_type = 'customer_payment'
     and source_id = new.id
     and status = 'active';

  if coalesce(new.accounting_state, '') <> 'posted' or payment_amount <= 0 then
    return new;
  end if;

  if payment_method = 'cash' then
    select id into target_fund_id
      from public.company_fund_accounts
     where company_id = new.company_id and fund_type = 'cash' and is_active;
  else
    select id into target_fund_id
      from public.company_fund_accounts
     where company_id = new.company_id
       and fund_type = 'bank'
       and company_bank_account_id = new.company_bank_account_id
       and is_active;
    if target_fund_id is null then
      select fund.id into target_fund_id
        from public.company_fund_accounts fund
        join public.company_bank_accounts bank on bank.id = fund.company_bank_account_id
       where fund.company_id = new.company_id and fund.fund_type = 'bank'
         and fund.is_active and bank.is_active
       order by bank.is_primary desc, bank.created_at
       limit 1;
    end if;
  end if;

  if target_fund_id is not null then
    insert into public.company_fund_transactions (
      company_id, fund_account_id, transaction_type, signed_amount, currency,
      transaction_date, description, source_type, source_id, created_by
    )
    values (
      new.company_id, target_fund_id, 'income', payment_amount,
      upper(coalesce(nullif(new.currency, ''), 'EUR')), new.payment_date,
      coalesce(nullif(trim(new.bank_reference), ''), 'Customer payment'),
      'customer_payment', new.id, coalesce((select auth.uid()), new.user_id)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists payments_sync_fund_transaction on public.payments;
create trigger payments_sync_fund_transaction
after insert or update of accounting_state, amount, currency, payment_date, payment_method, company_bank_account_id or delete
on public.payments
for each row execute function private.sync_payment_fund_transaction();

-- Bring posted legacy expenses and customer payments into the new ledger.
insert into public.company_fund_transactions (
  company_id, fund_account_id, transaction_type, signed_amount, currency,
  transaction_date, description, source_type, source_id, created_by
)
select e.company_id, fund.id, 'expense', -round(e.amount, 4),
       upper(coalesce(nullif(e.currency, ''), 'EUR')), e.date,
       coalesce(nullif(trim(e.description), ''), 'Expense'), 'expense', e.id, e.user_id
from public.expenses e
join lateral (
  select candidate.id
    from public.company_fund_accounts candidate
    left join public.company_bank_accounts bank on bank.id = candidate.company_bank_account_id
   where candidate.company_id = e.company_id and candidate.is_active
     and ((lower(coalesce(e.payment_method, 'bank')) = 'cash' and candidate.fund_type = 'cash')
       or (lower(coalesce(e.payment_method, 'bank')) = 'bank' and candidate.fund_type = 'bank'
           and (candidate.company_bank_account_id = e.company_bank_account_id or e.company_bank_account_id is null)))
   order by case when candidate.company_bank_account_id = e.company_bank_account_id then 0
                 when bank.is_primary then 1 else 2 end, candidate.id
   limit 1
) fund on true
where e.accounting_state = 'posted'
  and e.amount > 0
  and not exists (
    select 1 from public.company_fund_transactions existing
    where existing.source_type = 'expense' and existing.source_id = e.id and existing.status = 'active'
  );

insert into public.company_fund_transactions (
  company_id, fund_account_id, transaction_type, signed_amount, currency,
  transaction_date, description, source_type, source_id, created_by
)
select p.company_id, fund.id, 'income', round(p.amount, 4),
       upper(coalesce(nullif(p.currency, ''), 'EUR')), p.payment_date,
       coalesce(nullif(trim(p.bank_reference), ''), 'Customer payment'),
       'customer_payment', p.id, p.user_id
from public.payments p
join lateral (
  select candidate.id
    from public.company_fund_accounts candidate
    left join public.company_bank_accounts bank on bank.id = candidate.company_bank_account_id
   where candidate.company_id = p.company_id and candidate.is_active
     and ((lower(coalesce(p.payment_method, 'cash')) = 'cash' and candidate.fund_type = 'cash')
       or (lower(coalesce(p.payment_method, 'cash')) = 'bank' and candidate.fund_type = 'bank'
           and (candidate.company_bank_account_id = p.company_bank_account_id or p.company_bank_account_id is null)))
   order by case when candidate.company_bank_account_id = p.company_bank_account_id then 0
                 when bank.is_primary then 1 else 2 end, candidate.id
   limit 1
) fund on true
where p.accounting_state = 'posted'
  and p.amount > 0
  and not exists (
    select 1 from public.company_fund_transactions existing
    where existing.source_type = 'customer_payment' and existing.source_id = p.id and existing.status = 'active'
  );

create or replace function public.set_fund_opening_balance(
  p_fund_account_id uuid,
  p_amount numeric,
  p_reason text default null
)
returns public.company_fund_accounts
language plpgsql
security definer
set search_path = ''
as $$
declare
  fund_row public.company_fund_accounts;
begin
  select * into fund_row
    from public.company_fund_accounts
   where id = p_fund_account_id and is_active
   for update;
  if not found then raise exception 'Fund account not found' using errcode = 'P0002'; end if;
  if not coalesce(private.has_company_permission(fund_row.company_id, 'cash_transaction.post'), false) then
    raise exception 'Insufficient permission to set a fund balance' using errcode = '42501';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'Opening balance must be zero or greater' using errcode = '23514';
  end if;
  update public.company_fund_accounts
     set opening_balance = round(p_amount, 4), updated_at = now(), updated_by = (select auth.uid())
   where id = fund_row.id
   returning * into fund_row;
  return fund_row;
end;
$$;

create or replace function public.create_fund_transfer(
  p_source_fund_account_id uuid,
  p_target_fund_account_id uuid,
  p_amount numeric,
  p_transfer_date date default current_date,
  p_description text default null,
  p_idempotency_key uuid default null
)
returns public.company_fund_transfers
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_fund public.company_fund_accounts;
  target_fund public.company_fund_accounts;
  transfer_row public.company_fund_transfers;
  current_balance numeric(20,4);
  transfer_amount numeric(20,4) := round(coalesce(p_amount, 0), 4);
begin
  if p_idempotency_key is not null then
    select * into transfer_row from public.company_fund_transfers
     where idempotency_key = p_idempotency_key for update;
    if found then return transfer_row; end if;
  end if;

  select * into source_fund from public.company_fund_accounts
   where id = p_source_fund_account_id and is_active for update;
  select * into target_fund from public.company_fund_accounts
   where id = p_target_fund_account_id and is_active for update;
  if not found or source_fund.id is null or target_fund.id is null then
    raise exception 'Both fund accounts must be active' using errcode = '23503';
  end if;
  if source_fund.company_id <> target_fund.company_id then
    raise exception 'Fund accounts must belong to the same company' using errcode = '23514';
  end if;
  if not coalesce(private.has_company_permission(source_fund.company_id, 'cash_transaction.post'), false) then
    raise exception 'Insufficient permission to transfer funds' using errcode = '42501';
  end if;
  if transfer_amount <= 0 then raise exception 'Transfer amount must be greater than zero' using errcode = '23514'; end if;
  if source_fund.currency <> target_fund.currency then raise exception 'Fund currencies must match' using errcode = '23514'; end if;

  select source_fund.opening_balance + coalesce(sum(fund_tx.signed_amount) filter (where fund_tx.status = 'active'), 0)
    into current_balance
    from public.company_fund_transactions fund_tx
   where fund_tx.fund_account_id = source_fund.id;
  if current_balance < transfer_amount then
    raise exception 'The source fund does not have enough money' using errcode = '23514';
  end if;

  insert into public.company_fund_transfers (
    company_id, source_fund_account_id, target_fund_account_id, amount, currency,
    transfer_date, description, idempotency_key, created_by
  ) values (
    source_fund.company_id, source_fund.id, target_fund.id, transfer_amount,
    source_fund.currency, coalesce(p_transfer_date, current_date),
    nullif(trim(p_description), ''), p_idempotency_key, (select auth.uid())
  ) returning * into transfer_row;

  insert into public.company_fund_transactions (
    company_id, fund_account_id, transaction_type, signed_amount, currency,
    transaction_date, description, source_type, source_id, created_by
  ) values
    (source_fund.company_id, source_fund.id, 'transfer_out', -transfer_amount,
     source_fund.currency, transfer_row.transfer_date, transfer_row.description,
     'fund_transfer', transfer_row.id, (select auth.uid())),
    (target_fund.company_id, target_fund.id, 'transfer_in', transfer_amount,
     target_fund.currency, transfer_row.transfer_date, transfer_row.description,
     'fund_transfer', transfer_row.id, (select auth.uid()));
  return transfer_row;
end;
$$;

create or replace view public.operix_fund_balances
with (security_invoker = true)
as
select fund.id,
       fund.company_id,
       fund.fund_type,
       fund.company_bank_account_id,
       fund.name,
       fund.currency,
       fund.opening_balance,
       coalesce(sum(fund_tx.signed_amount) filter (where fund_tx.status = 'active'), 0)::numeric(20,4) as transaction_total,
       (fund.opening_balance + coalesce(sum(fund_tx.signed_amount) filter (where fund_tx.status = 'active'), 0))::numeric(20,4) as balance,
       fund.is_active
  from public.company_fund_accounts fund
  left join public.company_fund_transactions fund_tx on fund_tx.fund_account_id = fund.id
 group by fund.id, fund.company_id, fund.fund_type, fund.company_bank_account_id,
          fund.name, fund.currency, fund.opening_balance, fund.is_active;

alter table public.company_fund_accounts enable row level security;
alter table public.company_fund_transactions enable row level security;
alter table public.company_fund_transfers enable row level security;

drop policy if exists company_fund_accounts_member_select on public.company_fund_accounts;
create policy company_fund_accounts_member_select on public.company_fund_accounts
for select to authenticated using ((select private.is_company_member(company_id)));
drop policy if exists company_fund_transactions_member_select on public.company_fund_transactions;
create policy company_fund_transactions_member_select on public.company_fund_transactions
for select to authenticated using ((select private.is_company_member(company_id)));
drop policy if exists company_fund_transfers_member_select on public.company_fund_transfers;
create policy company_fund_transfers_member_select on public.company_fund_transfers
for select to authenticated using ((select private.is_company_member(company_id)));

revoke all on public.company_fund_accounts from anon, authenticated;
grant select on public.company_fund_accounts to authenticated;
revoke all on public.company_fund_transactions from anon, authenticated;
grant select on public.company_fund_transactions to authenticated;
revoke all on public.company_fund_transfers from anon, authenticated;
grant select on public.company_fund_transfers to authenticated;
revoke all on public.operix_fund_balances from anon, authenticated;
grant select on public.operix_fund_balances to authenticated;
revoke all on function public.set_fund_opening_balance(uuid, numeric, text) from public, anon;
grant execute on function public.set_fund_opening_balance(uuid, numeric, text) to authenticated;
revoke all on function public.create_fund_transfer(uuid, uuid, numeric, date, text, uuid) from public, anon;
grant execute on function public.create_fund_transfer(uuid, uuid, numeric, date, text, uuid) to authenticated;
