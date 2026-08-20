-- Allow an owned bank account to be explicitly shared with another tenant.
-- The bank account and its fund ledger remain owned by the original tenant;
-- linked tenants only receive payment-source access to the same physical fund.

alter table public.company_fund_transactions
  add column if not exists source_company_id uuid references public.companies(id) on delete cascade;

update public.company_fund_transactions
   set source_company_id = company_id
 where source_company_id is null;

alter table public.company_fund_transactions
  alter column source_company_id set not null;

create index if not exists company_fund_transactions_source_company_idx
  on public.company_fund_transactions(source_company_id, transaction_date, status);

create table if not exists public.company_bank_account_shares (
  id uuid primary key default gen_random_uuid(),
  company_bank_account_id uuid not null references public.company_bank_accounts(id) on delete cascade,
  shared_company_id uuid not null references public.companies(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint company_bank_account_shares_unique_target unique (company_bank_account_id, shared_company_id)
);

create index if not exists company_bank_account_shares_target_idx
  on public.company_bank_account_shares(shared_company_id, is_active);

create or replace function private.can_access_company_bank_account(p_bank_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
        from public.company_bank_accounts account
       where account.id = p_bank_account_id
         and (
           private.is_company_member(account.company_id)
           or exists (
             select 1
               from public.company_bank_account_shares share
              where share.company_bank_account_id = account.id
                and share.is_active
                and private.is_company_member(share.shared_company_id)
           )
         )
    );
$$;

create or replace function private.can_view_fund_account(p_fund_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.company_fund_accounts fund
     where fund.id = p_fund_account_id
       and (
         private.is_company_member(fund.company_id)
         or (
           fund.company_bank_account_id is not null
           and private.can_access_company_bank_account(fund.company_bank_account_id)
         )
       )
  );
$$;

revoke all on function private.can_access_company_bank_account(uuid) from public;
revoke all on function private.can_view_fund_account(uuid) from public;
grant execute on function private.can_access_company_bank_account(uuid) to authenticated, service_role;
grant execute on function private.can_view_fund_account(uuid) to authenticated, service_role;

alter table public.company_bank_account_shares enable row level security;

drop policy if exists company_bank_account_shares_member_select on public.company_bank_account_shares;
create policy company_bank_account_shares_member_select on public.company_bank_account_shares
for select to authenticated
using (
  private.can_access_company_bank_account(company_bank_account_id)
  or private.is_company_member(shared_company_id)
);

-- Existing bank-account policies only allowed the owning company. Replace the
-- read policy with the explicit share-aware predicate; write policies remain
-- owner/company.manage protected.
drop policy if exists company_bank_accounts_member_select on public.company_bank_accounts;
create policy company_bank_accounts_member_select on public.company_bank_accounts
for select to authenticated
using (private.can_access_company_bank_account(id));

revoke all on public.company_bank_account_shares from anon, authenticated;
grant select on public.company_bank_account_shares to authenticated;

create or replace function public.share_company_bank_account(
  p_company_bank_account_id uuid,
  p_shared_company_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  bank_row public.company_bank_accounts;
  target_name text;
  share_row public.company_bank_account_shares;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into bank_row
    from public.company_bank_accounts
   where id = p_company_bank_account_id and is_active
   for update;
  if not found then
    raise exception 'Bank account not found' using errcode = 'P0002';
  end if;
  if p_shared_company_id is null or p_shared_company_id = bank_row.company_id then
    raise exception 'Choose a different tenant to share the bank account with' using errcode = '23514';
  end if;
  if not private.has_company_permission(bank_row.company_id, 'company.manage')
     or not private.has_company_permission(p_shared_company_id, 'company.manage') then
    raise exception 'You do not have permission to share this bank account' using errcode = '42501';
  end if;

  select company_name into target_name
    from public.companies
   where id = p_shared_company_id;
  if target_name is null then
    raise exception 'Target tenant was not found' using errcode = 'P0002';
  end if;

  insert into public.company_bank_account_shares (
    company_bank_account_id, shared_company_id, is_active, created_by, updated_by
  ) values (
    bank_row.id, p_shared_company_id, true, actor_id, actor_id
  )
  on conflict (company_bank_account_id, shared_company_id) do update
    set is_active = true, updated_at = now(), updated_by = actor_id
  returning * into share_row;

  return jsonb_build_object(
    'id', share_row.id,
    'company_bank_account_id', share_row.company_bank_account_id,
    'shared_company_id', share_row.shared_company_id,
    'shared_company_name', target_name,
    'is_active', share_row.is_active
  );
end;
$$;

create or replace function public.revoke_company_bank_account_share(
  p_company_bank_account_id uuid,
  p_shared_company_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  bank_row public.company_bank_accounts;
  changed boolean := false;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into bank_row from public.company_bank_accounts
   where id = p_company_bank_account_id for update;
  if not found then raise exception 'Bank account not found' using errcode = 'P0002'; end if;
  if not private.has_company_permission(bank_row.company_id, 'company.manage') then
    raise exception 'You do not have permission to revoke this bank-account share' using errcode = '42501';
  end if;

  update public.company_bank_account_shares
     set is_active = false, updated_at = now(), updated_by = actor_id
   where company_bank_account_id = p_company_bank_account_id
     and shared_company_id = p_shared_company_id
     and is_active
  returning true into changed;

  return jsonb_build_object('revoked', coalesce(changed, false));
end;
$$;

revoke all on function public.share_company_bank_account(uuid, uuid) from public, anon;
grant execute on function public.share_company_bank_account(uuid, uuid) to authenticated;
revoke all on function public.revoke_company_bank_account_share(uuid, uuid) from public, anon;
grant execute on function public.revoke_company_bank_account_share(uuid, uuid) to authenticated;

create or replace view public.operix_accessible_company_bank_accounts
with (security_invoker = true)
as
select account.id,
       account.company_id,
       account.company_id as owner_company_id,
       account.company_id as available_company_id,
       account.bank_name,
       account.account_name,
       account.account_number,
       account.iban,
       account.swift_bic,
       account.currency,
       account.is_primary,
       account.is_active,
       account.created_at,
       account.account_id,
       false as is_shared
  from public.company_bank_accounts account
union all
select account.id,
       account.company_id,
       account.company_id as owner_company_id,
       share.shared_company_id as available_company_id,
       account.bank_name,
       account.account_name,
       account.account_number,
       account.iban,
       account.swift_bic,
       account.currency,
       false as is_primary,
       account.is_active,
       account.created_at,
       account.account_id,
       true as is_shared
  from public.company_bank_accounts account
  join public.company_bank_account_shares share
    on share.company_bank_account_id = account.id
   and share.is_active;

revoke all on public.operix_accessible_company_bank_accounts from anon, authenticated;
grant select on public.operix_accessible_company_bank_accounts to authenticated;

-- Shared-bank validators: a bank is valid for its owner or an active target
-- tenant share, but never for an unrelated tenant.
create or replace function private.validate_expense_bank_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_company_id uuid;
  account_active boolean;
  account_shared boolean;
begin
  if new.company_bank_account_id is null then return new; end if;
  if lower(coalesce(new.payment_method, 'bank')) <> 'bank' then
    raise exception 'A bank account can only be selected for a bank-paid expense' using errcode = '23514';
  end if;

  select account.company_id, account.is_active,
         exists (
           select 1 from public.company_bank_account_shares share
            where share.company_bank_account_id = account.id
              and share.shared_company_id = new.company_id
              and share.is_active
         )
    into account_company_id, account_active, account_shared
    from public.company_bank_accounts account
   where account.id = new.company_bank_account_id;

  if account_company_id is null or not coalesce(account_active, false)
     or (account_company_id <> new.company_id and not coalesce(account_shared, false)) then
    raise exception 'The selected bank account is not available for this company' using errcode = '23503';
  end if;
  return new;
end;
$$;

create or replace function private.validate_payment_bank_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_company_id uuid;
  account_active boolean;
  account_shared boolean;
begin
  if new.company_bank_account_id is null then return new; end if;
  if lower(coalesce(new.payment_method, 'cash')) <> 'bank' then
    raise exception 'A bank account can only be selected for a bank payment' using errcode = '23514';
  end if;

  select account.company_id, account.is_active,
         exists (
           select 1 from public.company_bank_account_shares share
            where share.company_bank_account_id = account.id
              and share.shared_company_id = new.company_id
              and share.is_active
         )
    into account_company_id, account_active, account_shared
    from public.company_bank_accounts account
   where account.id = new.company_bank_account_id;

  if account_company_id is null or not coalesce(account_active, false)
     or (account_company_id <> new.company_id and not coalesce(account_shared, false)) then
    raise exception 'The selected bank account is not available for this company' using errcode = '23503';
  end if;
  return new;
end;
$$;

-- Allow the existing customer-payment RPCs to validate an explicitly shared
-- bank account. Their target company's settlement account remains the GL
-- account; the physical shared bank is retained on the payment row and fund
-- ledger.
create or replace function public.record_customer_payment_with_bank_account(
  p_company_id uuid,
  p_customer_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_payment_method text,
  p_settlement_account_id uuid,
  p_reference text default null,
  p_notes text default null,
  p_branch_id uuid default null,
  p_currency text default 'EUR',
  p_idempotency_key uuid default null,
  p_company_bank_account_id uuid default null
)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.payments;
begin
  if p_company_bank_account_id is not null then
    if lower(coalesce(p_payment_method, 'cash')) <> 'bank'
       or not exists (
         select 1 from public.company_bank_accounts account
          where account.id = p_company_bank_account_id
            and account.is_active
            and (
              account.company_id = p_company_id
              or exists (
                select 1 from public.company_bank_account_shares share
                 where share.company_bank_account_id = account.id
                   and share.shared_company_id = p_company_id
                   and share.is_active
              )
            )
       ) then
      raise exception 'The selected bank account is not available for this payment' using errcode = '23503';
    end if;
  end if;

  payment_row := public.record_customer_payment(
    p_company_id, p_customer_id, p_payment_date, p_amount, p_payment_method,
    p_settlement_account_id, p_reference, p_notes, p_branch_id, p_currency,
    p_idempotency_key
  );

  perform set_config('app.financial_workflow', 'authorized', true);
  update public.payments
     set company_bank_account_id = p_company_bank_account_id
   where id = payment_row.id
   returning * into payment_row;
  perform set_config('app.financial_workflow', '', true);
  return payment_row;
end;
$$;

create or replace function public.update_customer_payment_with_bank_account(
  p_payment_id uuid,
  p_company_id uuid,
  p_customer_id uuid,
  p_invoice_id uuid default null,
  p_payment_date date default current_date,
  p_amount numeric default 0,
  p_payment_method text default 'bank',
  p_settlement_account_id uuid default null,
  p_reference text default null,
  p_notes text default null,
  p_currency text default 'EUR',
  p_idempotency_key uuid default null,
  p_reason text default 'Customer payment edited',
  p_company_bank_account_id uuid default null
)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.payments;
begin
  if p_company_bank_account_id is not null then
    if lower(coalesce(p_payment_method, 'cash')) <> 'bank'
       or not exists (
         select 1 from public.company_bank_accounts account
          where account.id = p_company_bank_account_id
            and account.is_active
            and (
              account.company_id = p_company_id
              or exists (
                select 1 from public.company_bank_account_shares share
                 where share.company_bank_account_id = account.id
                   and share.shared_company_id = p_company_id
                   and share.is_active
              )
            )
       ) then
      raise exception 'The selected bank account is not available for this payment' using errcode = '23503';
    end if;
  end if;

  payment_row := public.update_customer_payment(
    p_payment_id, p_company_id, p_customer_id, p_invoice_id, p_payment_date,
    p_amount, p_payment_method, p_settlement_account_id, p_reference, p_notes,
    p_currency, p_idempotency_key, p_reason
  );

  perform set_config('app.financial_workflow', 'authorized', true);
  update public.payments
     set company_bank_account_id = p_company_bank_account_id
   where id = payment_row.id
   returning * into payment_row;
  perform set_config('app.financial_workflow', '', true);
  return payment_row;
end;
$$;

revoke all on function public.record_customer_payment_with_bank_account(uuid, uuid, date, numeric, text, uuid, text, text, uuid, text, uuid, uuid) from public, anon;
grant execute on function public.record_customer_payment_with_bank_account(uuid, uuid, date, numeric, text, uuid, text, text, uuid, text, uuid, uuid) to authenticated;
revoke all on function public.update_customer_payment_with_bank_account(uuid, uuid, uuid, uuid, date, numeric, text, uuid, text, text, text, uuid, text, uuid) from public, anon;
grant execute on function public.update_customer_payment_with_bank_account(uuid, uuid, uuid, uuid, date, numeric, text, uuid, text, text, text, uuid, text, uuid) to authenticated;

-- Supplier payments use the same physical-bank selector and ledger rule as
-- expenses. The legacy supplier-payment RPC remains available for cash and
-- backward compatibility; this wrapper adds explicit bank-account selection.
alter table public.vendor_payments
  add column if not exists company_bank_account_id uuid references public.company_bank_accounts(id) on delete restrict;

create index if not exists vendor_payments_company_bank_account_idx
  on public.vendor_payments(company_bank_account_id)
  where company_bank_account_id is not null;

create or replace function private.validate_vendor_payment_bank_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_company_id uuid;
  account_active boolean;
  account_shared boolean;
begin
  if new.company_bank_account_id is null then return new; end if;
  if lower(coalesce(new.payment_method, 'bank')) <> 'bank' then
    raise exception 'A bank account can only be selected for a bank supplier payment' using errcode = '23514';
  end if;

  select account.company_id, account.is_active,
         exists (
           select 1 from public.company_bank_account_shares share
            where share.company_bank_account_id = account.id
              and share.shared_company_id = new.company_id
              and share.is_active
         )
    into account_company_id, account_active, account_shared
    from public.company_bank_accounts account
   where account.id = new.company_bank_account_id;

  if account_company_id is null or not coalesce(account_active, false)
     or (account_company_id <> new.company_id and not coalesce(account_shared, false)) then
    raise exception 'The selected bank account is not available for this company' using errcode = '23503';
  end if;
  return new;
end;
$$;

drop trigger if exists vendor_payments_validate_bank_account on public.vendor_payments;
create trigger vendor_payments_validate_bank_account
before insert or update of company_id, payment_method, company_bank_account_id
on public.vendor_payments
for each row execute function private.validate_vendor_payment_bank_account();

create or replace function public.record_supplier_payment_with_bank_account(
  p_company_id uuid,
  p_supplier_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_payment_method text,
  p_settlement_account_id uuid,
  p_reference text default null,
  p_notes text default null,
  p_branch_id uuid default null,
  p_currency text default 'EUR',
  p_idempotency_key uuid default null,
  p_company_bank_account_id uuid default null
)
returns public.vendor_payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.vendor_payments;
begin
  if p_company_bank_account_id is not null then
    if lower(coalesce(p_payment_method, 'bank')) <> 'bank'
       or not exists (
         select 1 from public.company_bank_accounts account
          where account.id = p_company_bank_account_id
            and account.is_active
            and (
              account.company_id = p_company_id
              or exists (
                select 1 from public.company_bank_account_shares share
                 where share.company_bank_account_id = account.id
                   and share.shared_company_id = p_company_id
                   and share.is_active
              )
            )
       ) then
      raise exception 'The selected bank account is not available for this payment' using errcode = '23503';
    end if;
  end if;

  payment_row := public.record_supplier_payment(
    p_company_id, p_supplier_id, p_payment_date, p_amount, p_payment_method,
    p_settlement_account_id, p_reference, p_notes, p_branch_id, p_currency,
    p_idempotency_key
  );

  perform set_config('app.financial_workflow', 'authorized', true);
  update public.vendor_payments
     set company_bank_account_id = p_company_bank_account_id
   where id = payment_row.id
   returning * into payment_row;
  if payment_row.posting_journal_entry_id is not null then
    update public.journal_entries
       set metadata = coalesce(metadata, '{}'::jsonb)
           || case when p_company_bank_account_id is null then '{}'::jsonb
                   else jsonb_build_object('company_bank_account_id', p_company_bank_account_id) end
     where id = payment_row.posting_journal_entry_id;
  end if;
  perform set_config('app.financial_workflow', '', true);
  return payment_row;
end;
$$;

revoke all on function public.record_supplier_payment_with_bank_account(uuid, uuid, date, numeric, text, uuid, text, text, uuid, text, uuid, uuid) from public, anon;
grant execute on function public.record_supplier_payment_with_bank_account(uuid, uuid, date, numeric, text, uuid, text, text, uuid, text, uuid, uuid) to authenticated;

-- Fund entries for a shared bank are owned by the bank-owning tenant, while
-- source_company_id records which tenant created the expense/payment.
create or replace function private.sync_expense_fund_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_fund_id uuid;
  fund_owner_company_id uuid;
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
   where source_type = 'expense' and source_id = new.id and status = 'active';

  if coalesce(new.accounting_state, '') <> 'posted' or expense_amount <= 0 then return new; end if;

  if payment_method = 'cash' then
    select id, company_id into target_fund_id, fund_owner_company_id
      from public.company_fund_accounts
     where company_id = new.company_id and fund_type = 'cash' and is_active;
  else
    select fund.id, fund.company_id into target_fund_id, fund_owner_company_id
      from public.company_fund_accounts fund
      join public.company_bank_accounts bank on bank.id = fund.company_bank_account_id
     where fund.fund_type = 'bank'
       and fund.company_bank_account_id = new.company_bank_account_id
       and fund.is_active and bank.is_active;

    if target_fund_id is null then
      select fund.id, fund.company_id into target_fund_id, fund_owner_company_id
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
      company_id, source_company_id, fund_account_id, transaction_type, signed_amount, currency,
      transaction_date, description, source_type, source_id, created_by
    ) values (
      fund_owner_company_id, new.company_id, target_fund_id, 'expense', -expense_amount,
      upper(coalesce(nullif(new.currency, ''), 'EUR')), new.date,
      coalesce(nullif(trim(new.description), ''), 'Expense'), 'expense', new.id,
      coalesce((select auth.uid()), new.user_id)
    );
  end if;
  return new;
end;
$$;

create or replace function private.sync_vendor_payment_fund_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_fund_id uuid;
  fund_owner_company_id uuid;
  payment_method text := lower(coalesce(new.payment_method, 'bank'));
  payment_amount numeric(20,4) := round(coalesce(new.amount, 0), 4);
begin
  if tg_op = 'DELETE' then
    update public.company_fund_transactions
       set status = 'reversed', reversed_at = clock_timestamp(), reversed_by = (select auth.uid())
     where source_type = 'vendor_payment' and source_id = old.id and status = 'active';
    return old;
  end if;

  update public.company_fund_transactions
     set status = 'reversed', reversed_at = clock_timestamp(), reversed_by = (select auth.uid())
   where source_type = 'vendor_payment' and source_id = new.id and status = 'active';

  if coalesce(new.accounting_state, '') <> 'posted' or payment_amount <= 0 then return new; end if;

  if payment_method = 'cash' then
    select id, company_id into target_fund_id, fund_owner_company_id
      from public.company_fund_accounts
     where company_id = new.company_id and fund_type = 'cash' and is_active;
  elsif payment_method = 'bank' then
    select fund.id, fund.company_id into target_fund_id, fund_owner_company_id
      from public.company_fund_accounts fund
      join public.company_bank_accounts bank on bank.id = fund.company_bank_account_id
     where fund.fund_type = 'bank'
       and fund.company_bank_account_id = new.company_bank_account_id
       and fund.is_active and bank.is_active;

    if target_fund_id is null then
      select fund.id, fund.company_id into target_fund_id, fund_owner_company_id
        from public.company_fund_accounts fund
        join public.company_bank_accounts bank on bank.id = fund.company_bank_account_id
       where fund.company_id = new.company_id and fund.fund_type = 'bank'
         and fund.is_active and bank.is_active
       order by bank.is_primary desc, bank.created_at
       limit 1;
    end if;
  else
    return new;
  end if;

  if target_fund_id is not null then
    insert into public.company_fund_transactions (
      company_id, source_company_id, fund_account_id, transaction_type, signed_amount, currency,
      transaction_date, description, source_type, source_id, created_by
    ) values (
      fund_owner_company_id, new.company_id, target_fund_id, 'expense', -payment_amount,
      upper(coalesce(nullif(new.currency, ''), 'EUR')), new.payment_date,
      coalesce(nullif(trim(new.notes), ''), 'Supplier payment'), 'vendor_payment', new.id,
      coalesce((select auth.uid()), new.user_id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists vendor_payments_sync_fund_transaction on public.vendor_payments;
create trigger vendor_payments_sync_fund_transaction
after insert or update of accounting_state, amount, currency, payment_date, payment_method, company_bank_account_id or delete
on public.vendor_payments
for each row execute function private.sync_vendor_payment_fund_transaction();

-- Bring posted legacy supplier payments into the fund ledger. Card payments
-- intentionally do not affect cash or bank funds.
insert into public.company_fund_transactions (
  company_id, source_company_id, fund_account_id, transaction_type, signed_amount, currency,
  transaction_date, description, source_type, source_id, created_by
)
select fund.company_id, payment.company_id, fund.id, 'expense', -round(payment.amount, 4),
       upper(coalesce(nullif(payment.currency, ''), 'EUR')), payment.payment_date,
       coalesce(nullif(trim(payment.notes), ''), 'Supplier payment'), 'vendor_payment', payment.id,
       payment.user_id
from public.vendor_payments payment
join lateral (
  select candidate.id, candidate.company_id
    from public.company_fund_accounts candidate
    left join public.company_bank_accounts bank on bank.id = candidate.company_bank_account_id
   where candidate.is_active
     and (
       (lower(coalesce(payment.payment_method, 'bank')) = 'cash'
        and candidate.company_id = payment.company_id and candidate.fund_type = 'cash')
       or (lower(coalesce(payment.payment_method, 'bank')) = 'bank'
        and candidate.fund_type = 'bank'
        and (candidate.company_bank_account_id = payment.company_bank_account_id
          or payment.company_bank_account_id is null and candidate.company_id = payment.company_id))
     )
   order by case when candidate.company_bank_account_id = payment.company_bank_account_id then 0
                 when bank.is_primary then 1 else 2 end, candidate.id
   limit 1
) fund on true
where payment.accounting_state = 'posted'
  and payment.amount > 0
  and lower(coalesce(payment.payment_method, 'bank')) in ('cash', 'bank')
  and not exists (
    select 1 from public.company_fund_transactions existing
    where existing.source_type = 'vendor_payment'
      and existing.source_id = payment.id
      and existing.status = 'active'
  );

create or replace function private.sync_payment_fund_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_fund_id uuid;
  fund_owner_company_id uuid;
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
   where source_type = 'customer_payment' and source_id = new.id and status = 'active';

  if coalesce(new.accounting_state, '') <> 'posted' or payment_amount <= 0 then return new; end if;

  if payment_method = 'cash' then
    select id, company_id into target_fund_id, fund_owner_company_id
      from public.company_fund_accounts
     where company_id = new.company_id and fund_type = 'cash' and is_active;
  else
    select fund.id, fund.company_id into target_fund_id, fund_owner_company_id
      from public.company_fund_accounts fund
      join public.company_bank_accounts bank on bank.id = fund.company_bank_account_id
     where fund.fund_type = 'bank'
       and fund.company_bank_account_id = new.company_bank_account_id
       and fund.is_active and bank.is_active;

    if target_fund_id is null then
      select fund.id, fund.company_id into target_fund_id, fund_owner_company_id
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
      company_id, source_company_id, fund_account_id, transaction_type, signed_amount, currency,
      transaction_date, description, source_type, source_id, created_by
    ) values (
      fund_owner_company_id, new.company_id, target_fund_id, 'income', payment_amount,
      upper(coalesce(nullif(new.currency, ''), 'EUR')), new.payment_date,
      coalesce(nullif(trim(new.bank_reference), ''), 'Customer payment'),
      'customer_payment', new.id, coalesce((select auth.uid()), new.user_id)
    );
  end if;
  return new;
end;
$$;

drop policy if exists company_fund_accounts_member_select on public.company_fund_accounts;
create policy company_fund_accounts_member_select on public.company_fund_accounts
for select to authenticated using (private.can_view_fund_account(id));

drop policy if exists company_fund_transactions_member_select on public.company_fund_transactions;
create policy company_fund_transactions_member_select on public.company_fund_transactions
for select to authenticated using (
  private.is_company_member(company_id)
  or private.is_company_member(source_company_id)
  or private.can_view_fund_account(fund_account_id)
);

drop view if exists public.operix_fund_balances;
create view public.operix_fund_balances
with (security_invoker = true)
as
with balances as (
  select fund.id,
         fund.company_id as owner_company_id,
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
            fund.name, fund.currency, fund.opening_balance, fund.is_active
)
select balances.id,
       balances.owner_company_id as company_id,
       balances.owner_company_id,
       balances.fund_type,
       balances.company_bank_account_id,
       balances.name,
       balances.currency,
       balances.opening_balance,
       balances.transaction_total,
       balances.balance,
       balances.is_active,
       false as is_shared
  from balances
union all
select balances.id,
       share.shared_company_id as company_id,
       balances.owner_company_id,
       balances.fund_type,
       balances.company_bank_account_id,
       balances.name,
       balances.currency,
       balances.opening_balance,
       balances.transaction_total,
       balances.balance,
       balances.is_active,
       true as is_shared
  from balances
  join public.company_bank_account_shares share
    on share.company_bank_account_id = balances.company_bank_account_id
   and share.is_active;

revoke all on public.operix_fund_balances from anon, authenticated;
grant select on public.operix_fund_balances to authenticated;

-- The shared-ledger source column is required for every future transfer too.
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
    company_id, source_company_id, fund_account_id, transaction_type, signed_amount,
    currency, transaction_date, description, source_type, source_id, created_by
  ) values
    (source_fund.company_id, source_fund.company_id, source_fund.id, 'transfer_out', -transfer_amount,
     source_fund.currency, transfer_row.transfer_date, transfer_row.description,
     'fund_transfer', transfer_row.id, (select auth.uid())),
    (target_fund.company_id, target_fund.company_id, target_fund.id, 'transfer_in', transfer_amount,
     target_fund.currency, transfer_row.transfer_date, transfer_row.description,
     'fund_transfer', transfer_row.id, (select auth.uid()));
  return transfer_row;
end;
$$;

-- A shared physical bank can be mapped to the owning tenant's chart account,
-- but a posting created in another tenant must use that tenant's own 1020
-- fallback account for its journal. The fund ledger still points to the
-- shared physical bank above.
create or replace function private.create_expense_payment_journal(
  p_company_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_source_key text,
  p_posting_date date,
  p_document_date date,
  p_description text,
  p_amount numeric,
  p_currency text,
  p_branch_id uuid,
  p_payment_method text,
  p_metadata jsonb default '{}'::jsonb
)
returns public.journal_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  method text := lower(trim(coalesce(p_payment_method, 'bank')));
  gross numeric(20,4) := round(coalesce(p_amount, 0), 4);
  selected_bank_account_id uuid;
  selected_bank_account_id_for_gl uuid;
  expense_account uuid;
  settlement_account uuid;
  entry_row public.journal_entries;
begin
  if method not in ('cash', 'bank') then raise exception 'Expense payment method must be cash or bank' using errcode = '23514'; end if;
  if gross <= 0 then raise exception 'Expense amount must be greater than zero' using errcode = '23514'; end if;

  selected_bank_account_id := nullif(coalesce(
    nullif(p_metadata ->> 'company_bank_account_id', ''),
    nullif(current_setting('app.expense_bank_account_id', true), '')
  ), '')::uuid;

  if method = 'bank' and selected_bank_account_id is not null then
    select account.account_id into selected_bank_account_id_for_gl
      from public.company_bank_accounts account
     where account.id = selected_bank_account_id
       and account.is_active
       and (
         account.company_id = p_company_id
         or exists (
           select 1 from public.company_bank_account_shares share
            where share.company_bank_account_id = account.id
              and share.shared_company_id = p_company_id
              and share.is_active
         )
       );
    if not found then
      raise exception 'The selected bank account is not available for this company' using errcode = '23503';
    end if;
  end if;

  select id into expense_account
    from public.chart_of_accounts
   where company_id = p_company_id and code = '6010' and active and posting_allowed;
  if expense_account is null then raise exception 'General operating expense account 6010 is not configured' using errcode = '23514'; end if;

  if method = 'bank' and selected_bank_account_id_for_gl is not null then
    select id into settlement_account
      from public.chart_of_accounts
     where id = selected_bank_account_id_for_gl
       and company_id = p_company_id and active and posting_allowed;
  end if;
  if settlement_account is null then
    select id into settlement_account
      from public.chart_of_accounts
     where company_id = p_company_id
       and code = case when method = 'cash' then '1010' else '1020' end
       and active and posting_allowed;
  end if;
  if settlement_account is null then raise exception 'The selected cash or bank account is not configured' using errcode = '23514'; end if;

  entry_row := public.create_journal_entry(
    p_company_id, p_posting_date, p_document_date,
    coalesce(nullif(trim(p_description), ''), 'Expense'), p_source_key,
    upper(coalesce(nullif(trim(p_currency), ''), 'EUR')), 1, p_branch_id, 'automatic'
  );

  update public.journal_entries
     set source_type = p_source_type, source_id = p_source_id, source_key = p_source_key,
         metadata = coalesce(p_metadata, '{}'::jsonb)
           || jsonb_build_object('payment_method', method)
           || case when selected_bank_account_id is null then '{}'::jsonb
                   else jsonb_build_object('company_bank_account_id', selected_bank_account_id) end,
         updated_by = (select auth.uid())
   where id = entry_row.id
   returning * into entry_row;

  insert into public.journal_entry_lines (
    journal_entry_id, company_id, line_number, account_id, description,
    debit, credit, transaction_currency, transaction_amount, exchange_rate,
    branch_id, created_by
  ) values
    (entry_row.id, p_company_id, 1, expense_account, 'General operating expense', gross, 0,
     upper(coalesce(nullif(trim(p_currency), ''), 'EUR')), gross, 1, p_branch_id, (select auth.uid())),
    (entry_row.id, p_company_id, 2, settlement_account,
     case when method = 'cash' then 'Cash expense payment' else 'Bank expense payment' end,
     0, gross, upper(coalesce(nullif(trim(p_currency), ''), 'EUR')), gross, 1, p_branch_id, (select auth.uid()));

  return public.post_journal_entry(entry_row.id, 'Expense posted');
end;
$$;
