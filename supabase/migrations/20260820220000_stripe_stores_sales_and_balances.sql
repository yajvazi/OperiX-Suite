-- Stripe stores, online sales, invoices, and provider-backed fund balances.
--
-- Stripe credentials live in private.* and are only read by Edge Functions.
-- The public tables contain tenant-scoped operational data and never contain
-- an access token, refresh token, or API key.

begin;

-- Some installations ran the original Stripe SQL manually rather than as a
-- timestamped migration. Keep this migration safe for both those databases
-- and a clean database rebuilt from the ordered migration chain.
alter table public.profiles
  add column if not exists stripe_access_token text,
  add column if not exists stripe_refresh_token text,
  add column if not exists stripe_account_id text,
  add column if not exists stripe_connected_at timestamptz,
  add column if not exists stripe_livemode boolean default false,
  add column if not exists stripe_last_synced timestamptz,
  add column if not exists stripe_api_key text;

create table if not exists public.stripe_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  company_id uuid,
  stripe_id text not null,
  type text not null,
  amount numeric not null,
  currency text default 'eur',
  description text,
  customer_email text,
  status text,
  fee numeric default 0,
  net numeric default 0,
  created_at timestamptz default now(),
  payment_details jsonb
);

create table if not exists public.stripe_payouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  company_id uuid,
  stripe_id text not null,
  amount numeric not null,
  currency text default 'eur',
  arrival_date date,
  status text,
  method text,
  description text,
  created_at timestamptz default now()
);

create table if not exists public.stripe_stores (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  store_name text not null,
  stripe_account_id text unique,
  account_email text,
  livemode boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending', 'connected', 'disconnected', 'error')),
  auto_sync boolean not null default true,
  auto_invoice_sales boolean not null default true,
  connected_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create index if not exists stripe_stores_company_idx
  on public.stripe_stores(company_id, status, store_name);
create unique index if not exists stripe_stores_company_name_idx
  on public.stripe_stores(company_id, lower(store_name));

-- These schemas are not exposed through the Supabase Data API. The service
-- role is used only by the OAuth/sync/webhook Edge Functions.
create table if not exists private.stripe_store_secrets (
  stripe_store_id uuid primary key references public.stripe_stores(id) on delete cascade,
  access_token text not null,
  refresh_token text,
  livemode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.stripe_oauth_states (
  state_hash text primary key,
  stripe_store_id uuid not null references public.stripe_stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists stripe_oauth_states_expiry_idx
  on private.stripe_oauth_states(expires_at)
  where consumed_at is null;

create table if not exists private.stripe_customer_links (
  stripe_store_id uuid not null references public.stripe_stores(id) on delete cascade,
  stripe_customer_id text not null,
  client_id uuid not null references public.clients(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (stripe_store_id, stripe_customer_id)
);

create table if not exists private.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  stripe_store_id uuid references public.stripe_stores(id) on delete set null,
  event_type text not null,
  processed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

revoke all on private.stripe_store_secrets from public, anon, authenticated;
revoke all on private.stripe_oauth_states from public, anon, authenticated;
revoke all on private.stripe_customer_links from public, anon, authenticated;
revoke all on private.stripe_webhook_events from public, anon, authenticated;

-- PostgREST does not expose private schemas. These narrow service-role RPCs
-- are the only bridge used by the Edge Functions, and no authenticated role
-- can execute them.
create or replace function public.create_stripe_oauth_state(
  p_state_hash text,
  p_stripe_store_id uuid,
  p_user_id uuid,
  p_expires_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.stripe_oauth_states (state_hash, stripe_store_id, user_id, expires_at)
  values (p_state_hash, p_stripe_store_id, p_user_id, p_expires_at);
end;
$$;

create or replace function public.consume_stripe_oauth_state(p_state_hash text)
returns table (stripe_store_id uuid, user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  state_row private.stripe_oauth_states;
begin
  select * into state_row
  from private.stripe_oauth_states
  where state_hash = p_state_hash
  for update;
  if not found or state_row.consumed_at is not null or state_row.expires_at <= now() then
    return;
  end if;
  update private.stripe_oauth_states
  set consumed_at = clock_timestamp()
  where state_hash = p_state_hash;
  stripe_store_id := state_row.stripe_store_id;
  user_id := state_row.user_id;
  return next;
end;
$$;

create or replace function public.upsert_stripe_store_secret(
  p_stripe_store_id uuid,
  p_access_token text,
  p_refresh_token text,
  p_livemode boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(trim(p_access_token), '') is null then
    raise exception 'Stripe access token is required' using errcode = '22023';
  end if;
  insert into private.stripe_store_secrets (
    stripe_store_id, access_token, refresh_token, livemode, updated_at
  ) values (
    p_stripe_store_id, p_access_token, p_refresh_token, coalesce(p_livemode, false), now()
  )
  on conflict (stripe_store_id) do update
    set access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        livemode = excluded.livemode,
        updated_at = now();
end;
$$;

create or replace function public.get_stripe_store_secret(p_stripe_store_id uuid)
returns table (access_token text, refresh_token text, livemode boolean)
language sql
security definer
set search_path = ''
as $$
  select secret.access_token, secret.refresh_token, secret.livemode
  from private.stripe_store_secrets secret
  where secret.stripe_store_id = p_stripe_store_id
$$;

create or replace function public.delete_stripe_store_secret(p_stripe_store_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.stripe_store_secrets
  where stripe_store_id = p_stripe_store_id
$$;

create or replace function public.claim_stripe_webhook_event(
  p_event_id text,
  p_stripe_store_id uuid,
  p_event_type text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.stripe_webhook_events (event_id, stripe_store_id, event_type)
  values (p_event_id, p_stripe_store_id, p_event_type)
  on conflict (event_id) do nothing;
  if found then return true; end if;
  -- A failed delivery is retryable; a successfully processed event remains
  -- idempotently ignored on all later Stripe retries.
  update private.stripe_webhook_events
  set processed_at = null, error_message = null
  where event_id = p_event_id
    and error_message is not null;
  return found;
end;
$$;

create or replace function public.complete_stripe_webhook_event(
  p_event_id text,
  p_error_message text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.stripe_webhook_events
  set processed_at = clock_timestamp(), error_message = p_error_message
  where event_id = p_event_id
$$;

revoke all on function public.create_stripe_oauth_state(text, uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.consume_stripe_oauth_state(text) from public, anon, authenticated;
revoke all on function public.upsert_stripe_store_secret(uuid, text, text, boolean) from public, anon, authenticated;
revoke all on function public.get_stripe_store_secret(uuid) from public, anon, authenticated;
revoke all on function public.delete_stripe_store_secret(uuid) from public, anon, authenticated;
revoke all on function public.claim_stripe_webhook_event(text, uuid, text) from public, anon, authenticated;
revoke all on function public.complete_stripe_webhook_event(text, text) from public, anon, authenticated;
grant execute on function public.create_stripe_oauth_state(text, uuid, uuid, timestamptz) to service_role;
grant execute on function public.consume_stripe_oauth_state(text) to service_role;
grant execute on function public.upsert_stripe_store_secret(uuid, text, text, boolean) to service_role;
grant execute on function public.get_stripe_store_secret(uuid) to service_role;
grant execute on function public.delete_stripe_store_secret(uuid) to service_role;
grant execute on function public.claim_stripe_webhook_event(text, uuid, text) to service_role;
grant execute on function public.complete_stripe_webhook_event(text, text) to service_role;

-- A public, non-sensitive store directory is needed by the mobile dashboard.
alter table public.stripe_stores enable row level security;
drop policy if exists stripe_stores_member_select on public.stripe_stores;
create policy stripe_stores_member_select on public.stripe_stores
for select to authenticated
using ((select private.is_company_member(company_id)));
revoke all on public.stripe_stores from anon, authenticated;
grant select on public.stripe_stores to authenticated;

alter table public.stripe_transactions
  add column if not exists stripe_store_id uuid references public.stripe_stores(id) on delete set null,
  add column if not exists invoice_id uuid references public.invoices(id) on delete set null,
  add column if not exists client_id uuid references public.clients(id) on delete set null,
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists stripe_customer_id text,
  add column if not exists source_object_id text,
  add column if not exists source_payment_intent text,
  add column if not exists receipt_url text,
  add column if not exists customer_address jsonb not null default '{}'::jsonb,
  add column if not exists line_items jsonb not null default '[]'::jsonb,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists livemode boolean not null default false;

alter table public.stripe_payouts
  add column if not exists stripe_store_id uuid references public.stripe_stores(id) on delete set null,
  add column if not exists livemode boolean not null default false;

alter table public.invoices
  add column if not exists stripe_store_id uuid references public.stripe_stores(id) on delete set null;
create index if not exists invoices_stripe_store_idx
  on public.invoices(stripe_store_id, issue_date desc)
  where stripe_store_id is not null;

-- Older deployments used globally unique Stripe IDs and wrote these rows from
-- the phone. Store-scoped uniqueness is required when two connected stores
-- contain objects with the same ID namespace.
alter table public.stripe_transactions drop constraint if exists stripe_transactions_stripe_id_key;
drop index if exists public.stripe_transactions_stripe_id_key;
alter table public.stripe_payouts drop constraint if exists stripe_payouts_stripe_id_key;
drop index if exists public.stripe_payouts_stripe_id_key;
drop index if exists public.stripe_transactions_store_id_key;
create unique index stripe_transactions_store_id_key
  on public.stripe_transactions(stripe_store_id, stripe_id);
drop index if exists public.stripe_payouts_store_id_key;
create unique index stripe_payouts_store_id_key
  on public.stripe_payouts(stripe_store_id, stripe_id);
create index if not exists stripe_transactions_store_created_idx
  on public.stripe_transactions(stripe_store_id, created_at desc);
create index if not exists stripe_transactions_invoice_idx
  on public.stripe_transactions(invoice_id)
  where invoice_id is not null;
create index if not exists stripe_payouts_store_created_idx
  on public.stripe_payouts(stripe_store_id, created_at desc);
create unique index if not exists invoices_stripe_source_unique
  on public.invoices(company_id, source_document_type, source_document_id)
  where source_document_type = 'stripe_transaction'
    and source_document_id is not null;

-- Preserve one existing OAuth connection per company as the first store. API
-- keys are intentionally not copied because they were previously exposed to
-- the mobile client and are not a safe credential for this integration.
insert into public.stripe_stores (
  company_id, store_name, stripe_account_id, livemode, status,
  connected_at, created_by, updated_by
)
select distinct on (profile.stripe_account_id)
  coalesce(profile.active_company_id, profile.company_id),
  coalesce(nullif(trim(company.company_name), ''), 'Stripe Store'),
  profile.stripe_account_id,
  coalesce(profile.stripe_livemode, false),
  'connected',
  profile.stripe_connected_at,
  profile.id,
  profile.id
from public.profiles profile
left join public.companies company
  on company.id = coalesce(profile.active_company_id, profile.company_id)
where profile.stripe_account_id is not null
  and coalesce(profile.active_company_id, profile.company_id) is not null
order by profile.stripe_account_id, profile.stripe_connected_at desc nulls last, profile.updated_at desc nulls last
on conflict (stripe_account_id) do nothing;

insert into private.stripe_store_secrets (stripe_store_id, access_token, refresh_token, livemode)
select store.id, profile.stripe_access_token, profile.stripe_refresh_token,
       coalesce(profile.stripe_livemode, false)
from public.stripe_stores store
join public.profiles profile on profile.stripe_account_id = store.stripe_account_id
where profile.stripe_access_token is not null
on conflict (stripe_store_id) do nothing;

-- Legacy profile credential columns remain for older applications that have
-- not migrated yet. The new Invoice mobile flow never reads or writes them;
-- rotate any old API key and remove those legacy values once every client has
-- moved to this server-only connection path.

-- Existing records can be associated safely when a company has exactly one
-- migrated store. Rows in a company with several stores remain visible as
-- legacy data until the next authenticated sync identifies their store.
update public.stripe_transactions transaction_row
set stripe_store_id = store.id
from public.stripe_stores store
where transaction_row.stripe_store_id is null
  and transaction_row.company_id = store.company_id
  and (
    select count(*) from public.stripe_stores candidate
    where candidate.company_id = transaction_row.company_id
  ) = 1;

update public.stripe_payouts payout_row
set stripe_store_id = store.id
from public.stripe_stores store
where payout_row.stripe_store_id is null
  and payout_row.company_id = store.company_id
  and (
    select count(*) from public.stripe_stores candidate
    where candidate.company_id = payout_row.company_id
  ) = 1;

create table if not exists public.stripe_balance_snapshots (
  id uuid not null default gen_random_uuid(),
  stripe_store_id uuid not null references public.stripe_stores(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  available_balance numeric(20,4) not null default 0,
  pending_balance numeric(20,4) not null default 0,
  as_of timestamptz not null default now(),
  raw_balance jsonb not null default '{}'::jsonb,
  primary key (stripe_store_id, currency),
  unique (id)
);

create index if not exists stripe_balance_snapshots_company_idx
  on public.stripe_balance_snapshots(company_id, currency);

alter table public.stripe_balance_snapshots enable row level security;
drop policy if exists stripe_balance_snapshots_member_select on public.stripe_balance_snapshots;
create policy stripe_balance_snapshots_member_select on public.stripe_balance_snapshots
for select to authenticated
using ((select private.is_company_member(company_id)));
revoke all on public.stripe_balance_snapshots from anon, authenticated;
grant select on public.stripe_balance_snapshots to authenticated;

-- A Stripe wallet behaves like a bank fund in the existing cash/bank report,
-- but it does not require storing a fake IBAN or bank account number.
alter table public.company_fund_accounts
  add column if not exists stripe_store_id uuid references public.stripe_stores(id) on delete cascade;

alter table public.company_fund_accounts
  drop constraint if exists company_fund_accounts_type_relation_check;
alter table public.company_fund_accounts
  add constraint company_fund_accounts_type_relation_check check (
    (fund_type = 'cash' and company_bank_account_id is null and stripe_store_id is null)
    or (
      fund_type = 'bank'
      and (
        (company_bank_account_id is not null and stripe_store_id is null)
        or (company_bank_account_id is null and stripe_store_id is not null)
      )
    )
  );

create unique index if not exists company_fund_accounts_stripe_idx
  on public.company_fund_accounts(stripe_store_id, currency)
  where stripe_store_id is not null;
create index if not exists company_fund_accounts_stripe_store_idx
  on public.company_fund_accounts(stripe_store_id)
  where stripe_store_id is not null;

-- Replace the view with the shared-account projection plus provider balance
-- fields. balance remains the local ledger total; provider_available_balance
-- is the latest Stripe-reported available amount.
drop view if exists public.operix_fund_balances;
create view public.operix_fund_balances
with (security_invoker = true)
as
with balances as (
  select fund.id,
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
         fund.is_active
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
)
select balances.id,
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
       balances.is_active,
       false as is_shared
  from balances
union all
select balances.id,
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
       balances.is_active,
       true as is_shared
  from balances
  join public.company_bank_account_shares share
    on share.company_bank_account_id = balances.company_bank_account_id
   and share.is_active;

revoke all on public.operix_fund_balances from anon, authenticated;
grant select on public.operix_fund_balances to authenticated;

-- A provider fund is created lazily for each store/currency. The advisory
-- lock makes concurrent webhook and manual-sync calls deterministic.
create or replace function private.ensure_stripe_fund_account(p_stripe_store_id uuid, p_currency text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  store_row public.stripe_stores;
  fund_id uuid;
  normalized_currency text := upper(coalesce(nullif(trim(p_currency), ''), 'EUR'));
begin
  select * into store_row
  from public.stripe_stores
  where id = p_stripe_store_id
    and status in ('connected', 'pending')
  for update;
  if not found then
    raise exception 'Stripe store not found' using errcode = 'P0002';
  end if;
  if normalized_currency !~ '^[A-Z]{3}$' then
    raise exception 'Stripe currency is invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_stripe_store_id::text || ':' || normalized_currency, 0));
  select id into fund_id
  from public.company_fund_accounts
  where stripe_store_id = p_stripe_store_id
    and currency = normalized_currency
  for update;

  if fund_id is null then
    insert into public.company_fund_accounts (
      company_id, fund_type, stripe_store_id, name, currency,
      created_by, updated_by
    ) values (
      store_row.company_id, 'bank', store_row.id,
      'Stripe · ' || store_row.store_name || ' (' || normalized_currency || ')',
      normalized_currency, store_row.created_by, store_row.created_by
    ) returning id into fund_id;
  else
    update public.company_fund_accounts
    set company_id = store_row.company_id,
        name = 'Stripe · ' || store_row.store_name || ' (' || normalized_currency || ')',
        is_active = true,
        updated_at = now()
    where id = fund_id;
  end if;
  return fund_id;
end;
$$;

create or replace function public.ensure_stripe_fund_account_for_sync(
  p_stripe_store_id uuid,
  p_currency text default 'EUR'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  return private.ensure_stripe_fund_account(p_stripe_store_id, p_currency);
end;
$$;

revoke all on function private.ensure_stripe_fund_account(uuid, text) from public, anon, authenticated;
revoke all on function public.ensure_stripe_fund_account_for_sync(uuid, text) from public, anon, authenticated;
grant execute on function public.ensure_stripe_fund_account_for_sync(uuid, text) to service_role;

-- Reconcile one imported Stripe balance transaction into the fund ledger. The
-- Stripe net value is used because it already includes Stripe fees. Payouts,
-- refunds, and fees therefore reduce the Stripe fund exactly once.
create or replace function public.sync_stripe_ledger_entry(p_stripe_transaction_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  transaction_row public.stripe_transactions;
  store_row public.stripe_stores;
  fund_id uuid;
  existing_row public.company_fund_transactions;
  net_amount numeric(20,4);
begin
  select * into transaction_row
  from public.stripe_transactions
  where id = p_stripe_transaction_id
  for update;
  if not found then
    raise exception 'Stripe transaction not found' using errcode = 'P0002';
  end if;
  if transaction_row.stripe_store_id is null then
    return jsonb_build_object('synced', false, 'reason', 'store_missing');
  end if;

  select * into store_row from public.stripe_stores where id = transaction_row.stripe_store_id;
  if not found then
    raise exception 'Stripe store not found' using errcode = 'P0002';
  end if;
  net_amount := round(coalesce(transaction_row.net, 0), 4);
  if net_amount = 0 then
    return jsonb_build_object('synced', false, 'reason', 'zero_net');
  end if;

  fund_id := private.ensure_stripe_fund_account(
    store_row.id,
    upper(coalesce(nullif(transaction_row.currency, ''), 'EUR'))
  );

  select * into existing_row
  from public.company_fund_transactions
  where source_type = 'stripe_balance_transaction'
    and source_id = transaction_row.id
    and status = 'active'
  for update;

  if found
     and existing_row.fund_account_id = fund_id
     and existing_row.signed_amount = net_amount then
    return jsonb_build_object('synced', true, 'created', false, 'fund_account_id', fund_id);
  end if;

  if found then
    update public.company_fund_transactions
    set status = 'reversed', reversed_at = clock_timestamp()
    where id = existing_row.id;
  end if;

  insert into public.company_fund_transactions (
    company_id, source_company_id, fund_account_id, transaction_type,
    signed_amount, currency, transaction_date, description,
    source_type, source_id, status
  ) values (
    store_row.company_id, store_row.company_id, fund_id,
    case when net_amount > 0 then 'income' else 'expense' end,
    net_amount,
    upper(coalesce(nullif(transaction_row.currency, ''), 'EUR')),
    coalesce(transaction_row.created_at::date, current_date),
    'Stripe · ' || coalesce(nullif(transaction_row.description, ''), transaction_row.type) || ' · ' || transaction_row.stripe_id,
    'stripe_balance_transaction', transaction_row.id, 'active'
  );

  return jsonb_build_object('synced', true, 'created', true, 'fund_account_id', fund_id);
end;
$$;

revoke all on function public.sync_stripe_ledger_entry(uuid) from public, anon, authenticated;
grant execute on function public.sync_stripe_ledger_entry(uuid) to service_role;

-- Generate one local paid invoice for each imported charge/payment. This is
-- called only by the service-role Edge Functions after Stripe data has been
-- validated and persisted. It impersonates the store connection owner only
-- inside this transaction so the canonical invoice writer still performs the
-- normal tenant and permission checks.
create or replace function public.create_stripe_sale_invoice(p_stripe_transaction_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  transaction_row public.stripe_transactions;
  store_row public.stripe_stores;
  company_row public.companies;
  client_row public.clients;
  linked_client_id uuid;
  actor_id uuid;
  invoice_row public.invoices;
  invoice_number text;
  invoice_items jsonb := '[]'::jsonb;
  normalized_item jsonb;
  item_total numeric(20,4) := 0;
  item_quantity numeric(20,4);
  item_price numeric(20,4);
  item_discount numeric(20,4);
  item_tax numeric(20,4);
  item_description text;
begin
  select * into transaction_row
  from public.stripe_transactions
  where id = p_stripe_transaction_id
  for update;
  if not found then
    raise exception 'Stripe transaction not found' using errcode = 'P0002';
  end if;
  if transaction_row.invoice_id is not null then
    select * into invoice_row from public.invoices where id = transaction_row.invoice_id;
    return invoice_row;
  end if;
  if lower(coalesce(transaction_row.type, '')) not in ('charge', 'payment')
     or coalesce(transaction_row.amount, 0) <= 0 then
    return null;
  end if;

  select * into store_row from public.stripe_stores where id = transaction_row.stripe_store_id;
  if not found then
    raise exception 'Stripe store not found' using errcode = 'P0002';
  end if;
  select * into company_row from public.companies where id = store_row.company_id;
  actor_id := coalesce(store_row.created_by, transaction_row.user_id, company_row.owner_id);
  if actor_id is null then
    raise exception 'Stripe store has no invoice owner' using errcode = '42501';
  end if;

  perform set_config('request.jwt.claim.sub', actor_id::text, true);
  if not (
    private.has_company_permission(store_row.company_id, 'sales_invoice.create')
    or private.has_company_permission(store_row.company_id, 'invoice.create')
  ) then
    raise exception 'Stripe store owner cannot create invoices for this company' using errcode = '42501';
  end if;

  if transaction_row.client_id is not null then
    select * into client_row from public.clients where id = transaction_row.client_id;
  end if;

  if client_row.id is null and transaction_row.stripe_customer_id is not null then
    select link.client_id into linked_client_id
    from private.stripe_customer_links link
    where link.stripe_store_id = store_row.id
      and link.stripe_customer_id = transaction_row.stripe_customer_id;
    if linked_client_id is not null then
      select * into client_row from public.clients where id = linked_client_id;
    end if;
  end if;

  if client_row.id is null and nullif(trim(transaction_row.customer_email), '') is not null then
    select * into client_row
    from public.clients candidate
    where candidate.company_id = store_row.company_id
      and lower(trim(candidate.email)) = lower(trim(transaction_row.customer_email))
    order by candidate.created_at
    limit 1;
  end if;

  if client_row.id is null
     and (
       nullif(trim(transaction_row.customer_email), '') is not null
       or nullif(trim(transaction_row.customer_name), '') is not null
       or transaction_row.stripe_customer_id is not null
     ) then
    insert into public.clients (
      user_id, company_id, name, email, phone, address, city, zip_code, country, notes
    ) values (
      actor_id,
      store_row.company_id,
      coalesce(nullif(trim(transaction_row.customer_name), ''), nullif(trim(transaction_row.customer_email), ''), 'Stripe customer'),
      nullif(trim(transaction_row.customer_email), ''),
      nullif(trim(transaction_row.customer_phone), ''),
      nullif(trim(concat_ws(', ',
        transaction_row.customer_address ->> 'line1',
        transaction_row.customer_address ->> 'line2',
        transaction_row.customer_address ->> 'city',
        transaction_row.customer_address ->> 'postal_code'
      )), ''),
      nullif(trim(transaction_row.customer_address ->> 'city'), ''),
      nullif(trim(transaction_row.customer_address ->> 'postal_code'), ''),
      nullif(trim(transaction_row.customer_address ->> 'country'), ''),
      'Created from Stripe online sale'
    ) returning * into client_row;
  end if;

  if transaction_row.stripe_customer_id is not null and client_row.id is not null then
    insert into private.stripe_customer_links (stripe_store_id, stripe_customer_id, client_id)
    values (store_row.id, transaction_row.stripe_customer_id, client_row.id)
    on conflict (stripe_store_id, stripe_customer_id) do update
      set client_id = excluded.client_id, updated_at = now();
  end if;

  -- Normalize Checkout line items. If the source was not a Checkout Session,
  -- or its lines do not reconcile to Stripe's gross amount, use one reliable
  -- summary line instead of creating an invoice with the wrong total.
  if jsonb_typeof(transaction_row.line_items) = 'array' then
    for normalized_item in select value from jsonb_array_elements(transaction_row.line_items)
    loop
      item_quantity := greatest(coalesce(nullif(normalized_item ->> 'quantity', '')::numeric, 1), 0.0001);
      item_price := greatest(coalesce(nullif(normalized_item ->> 'unit_price', '')::numeric, 0), 0);
      item_discount := greatest(least(coalesce(nullif(normalized_item ->> 'discount', '')::numeric, 0), 100), 0);
      item_tax := greatest(least(coalesce(nullif(normalized_item ->> 'tax_rate', '')::numeric, 0), 100), 0);
      item_description := coalesce(nullif(trim(normalized_item ->> 'description'), ''), 'Stripe online sale item');
      invoice_items := invoice_items || jsonb_build_array(jsonb_build_object(
        'description', item_description,
        'quantity', item_quantity,
        'unit', coalesce(nullif(trim(normalized_item ->> 'unit'), ''), 'pcs'),
        'unit_price', item_price,
        'tax_rate', item_tax,
        'discount', item_discount,
        'tax_included', false,
        'sku', coalesce(normalized_item ->> 'sku', ''),
        'amount', item_quantity * item_price * (1 - item_discount / 100)
      ));
      item_total := item_total + round(item_quantity * item_price * (1 - item_discount / 100) * (1 + item_tax / 100), 2);
    end loop;
  end if;

  if jsonb_array_length(invoice_items) = 0
     or abs(item_total - transaction_row.amount) > 0.01 then
    invoice_items := jsonb_build_array(jsonb_build_object(
      'description', coalesce(nullif(trim(transaction_row.description), ''), 'Stripe online sale'),
      'quantity', 1,
      'unit', 'sale',
      'unit_price', transaction_row.amount,
      'tax_rate', 0,
      'discount', 0,
      'tax_included', false,
      'sku', transaction_row.stripe_id,
      'amount', transaction_row.amount
    ));
  end if;

  invoice_number := public.reserve_invoice_number(
    store_row.company_id,
    'invoice',
    coalesce(transaction_row.created_at::date, current_date)
  );

  invoice_row := public.save_invoice_document_unchecked(
    jsonb_build_object(
      'user_id', actor_id,
      'company_id', store_row.company_id,
      'client_id', client_row.id,
      'invoice_number', invoice_number,
      'issue_date', coalesce(transaction_row.created_at::date, current_date),
      'status', 'draft',
      'type', 'invoice',
      'subtype', 'regular',
      'commercial_document_type', 'INVOICE',
      'commercial_status', 'ISSUED',
      'accounting_state', 'ready_for_posting',
      'payment_status', 'PAID',
      'payment_method', 'card',
      'amount_received', transaction_row.amount,
      'currency', upper(coalesce(nullif(transaction_row.currency, ''), 'EUR')),
      'tax_amount', 0,
      'total_amount', transaction_row.amount,
      'notes', 'Imported from Stripe store ' || store_row.store_name || '. Stripe transaction: ' || transaction_row.stripe_id,
      'source_document_type', 'stripe_transaction',
      'source_document_id', transaction_row.id,
      'template_id', 'corporate',
      'paper_size', 'A4'
    ),
    invoice_items,
    null,
    true,
    null
  );

  -- The invoice was paid online at the time of the Stripe transaction. The
  -- posting journal is already created by the canonical writer; this only
  -- updates the commercial payment state.
  perform set_config('app.financial_workflow', 'authorized', true);
  update public.invoices
  set status = 'paid', payment_status = 'PAID', amount_received = total_amount,
      payment_method = 'card', payment_date = coalesce(transaction_row.created_at::date, current_date),
      stripe_store_id = store_row.id
  where id = invoice_row.id
  returning * into invoice_row;
  perform set_config('app.financial_workflow', '', true);

  update public.stripe_transactions
  set invoice_id = invoice_row.id,
      client_id = client_row.id
  where id = transaction_row.id;

  return invoice_row;
end;
$$;

revoke all on function public.create_stripe_sale_invoice(uuid) from public, anon, authenticated;
grant execute on function public.create_stripe_sale_invoice(uuid) to service_role;

-- The app reads these tables but never writes imported Stripe data directly.
alter table public.stripe_transactions enable row level security;
alter table public.stripe_payouts enable row level security;
drop policy if exists "Users can view own stripe_transactions" on public.stripe_transactions;
drop policy if exists "Users can insert own stripe_transactions" on public.stripe_transactions;
drop policy if exists "Users can update own stripe_transactions" on public.stripe_transactions;
drop policy if exists stripe_transactions_member_select on public.stripe_transactions;
create policy stripe_transactions_member_select on public.stripe_transactions
for select to authenticated
using (
  (company_id is not null and (select private.is_company_member(company_id)))
  or (company_id is null and user_id = (select auth.uid()))
);
drop policy if exists "Users can view own stripe_payouts" on public.stripe_payouts;
drop policy if exists "Users can insert own stripe_payouts" on public.stripe_payouts;
drop policy if exists "Users can update own stripe_payouts" on public.stripe_payouts;
drop policy if exists stripe_payouts_member_select on public.stripe_payouts;
create policy stripe_payouts_member_select on public.stripe_payouts
for select to authenticated
using (
  (company_id is not null and (select private.is_company_member(company_id)))
  or (company_id is null and user_id = (select auth.uid()))
);
revoke all on public.stripe_transactions from anon, authenticated;
grant select on public.stripe_transactions to authenticated;
revoke all on public.stripe_payouts from anon, authenticated;
grant select on public.stripe_payouts to authenticated;

notify pgrst, 'reload schema';

commit;
