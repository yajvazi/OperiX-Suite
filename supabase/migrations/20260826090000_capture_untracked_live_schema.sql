-- Captures schema that exists in the hosted Invoice database but was never created by a
-- migration in this repository (it was added by hand). Without it a database built only from
-- these migrations would lack columns the apps write (e.g. expenses.type), the sign-up trigger
-- that creates a profile for every new user, and the barazim ledger table.
--
-- Everything here is idempotent: on the hosted database it changes nothing.
-- Definitions were read from the hosted database on 2026-10-28.

-- Columns added by hand ------------------------------------------------------------------
alter table public.companies
  add column if not exists smtp_host text,
  add column if not exists smtp_port integer,
  add column if not exists smtp_user text,
  add column if not exists smtp_pass text,
  add column if not exists smtp_from_email text,
  add column if not exists smtp_secure boolean default false;

alter table public.expenses add column if not exists type text default 'expense';

alter table public.invoice_templates
  add column if not exists columns jsonb default '[]'::jsonb,
  add column if not exists show_bank_details boolean default true,
  add column if not exists show_buyer_signature boolean default true,
  add column if not exists show_qr_code boolean default true,
  add column if not exists show_stamp boolean default true;

alter table public.profiles add column if not exists default_client_discount numeric default 0;
alter table public.vendors add column if not exists bank_account text;

-- Sign-up: every new auth user gets a profile row ---------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Company invite helpers -----------------------------------------------------------------
create or replace function public.generate_company_invite_token(company_uuid uuid)
returns text
language plpgsql
security definer
as $$
declare
  new_token text;
begin
  if not exists (
    select 1 from memberships
    where user_id = auth.uid()
      and company_id = company_uuid
      and role in ('owner', 'admin')
  ) then
    raise exception 'Not authorized to generate invite token';
  end if;

  new_token := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 8));

  update companies
  set invite_token = new_token
  where id = company_uuid;

  return new_token;
end;
$$;

create or replace function public.is_company_manager_or_higher(p_company_id uuid)
returns boolean
language sql
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from memberships
    where company_id = p_company_id
      and user_id = auth.uid()
      and role in ('owner', 'admin', 'manager')
  );
$$;

-- Barazim (informal receivable/payable) ledger --------------------------------------------
create table if not exists public.company_barazim_entries (
  id uuid default gen_random_uuid() not null primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  fund_account_id uuid references public.company_fund_accounts(id) on delete restrict,
  counterparty_name text not null,
  entry_type text not null,
  amount numeric(20,4) not null,
  currency text default 'EUR' not null,
  entry_date date default current_date not null,
  description text,
  status text default 'open' not null,
  settled_amount numeric(20,4) default 0 not null,
  idempotency_key uuid,
  created_at timestamptz default now() not null,
  created_by uuid references auth.users(id) on delete set null,
  constraint company_barazim_entries_amount_check check (amount > 0),
  constraint company_barazim_entries_check check (settled_amount >= 0 and settled_amount <= amount),
  constraint company_barazim_entries_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint company_barazim_entries_entry_type_check check (entry_type = any (array['receivable', 'payable'])),
  constraint company_barazim_entries_status_check check (status = any (array['open', 'settled', 'reversed']))
);

create index if not exists company_barazim_entries_company_idx
  on public.company_barazim_entries (company_id, status, entry_date desc);
create unique index if not exists company_barazim_entries_idempotency_idx
  on public.company_barazim_entries (idempotency_key) where idempotency_key is not null;

alter table public.company_barazim_entries enable row level security;

drop policy if exists company_barazim_entries_member_select on public.company_barazim_entries;
create policy company_barazim_entries_member_select on public.company_barazim_entries
  for select to authenticated
  using (private.is_company_member(company_id)
         or (fund_account_id is not null and private.can_view_fund_account(fund_account_id)));

grant all on table public.company_barazim_entries to service_role;
grant select on table public.company_barazim_entries to authenticated;
