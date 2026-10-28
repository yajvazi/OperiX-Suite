-- Track cash-on-delivery deliveries separately from company cash/bank funds.

alter table public.invoices
  add column if not exists post_cod boolean not null default false;

create index if not exists invoices_post_cod_idx
  on public.invoices (company_id, issue_date desc)
  where post_cod = true;

-- Keep the existing four-argument RPC available while allowing newer clients
-- to persist the Post COD checkbox.
create or replace function public.set_invoice_delivery_details(
  p_invoice_id uuid,
  p_delivery_method text default null,
  p_pickup_branch_id uuid default null,
  p_delivery_details text default null,
  p_post_cod boolean default false
)
returns public.invoices
language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  invoice_row public.invoices;
  branch_row public.branches;
  normalized_method text := nullif(lower(trim(coalesce(p_delivery_method, ''))), '');
  normalized_details text := nullif(trim(coalesce(p_delivery_details, '')), '');
  normalized_branch_id uuid := p_pickup_branch_id;
  normalized_post_cod boolean := coalesce(p_post_cod, false) and normalized_method = 'delivery';
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select * into invoice_row from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;
  if invoice_row.company_id is null or not public.can_access_company(invoice_row.company_id) then
    raise exception 'Invoice belongs to another company' using errcode = '42501';
  end if;
  if not (
    coalesce(private.has_company_permission(invoice_row.company_id, 'sales_invoice.edit'), false)
    or (
      public.get_my_company_role(invoice_row.company_id) = 'employee'
      and invoice_row.user_id = actor_id
      and upper(coalesce(invoice_row.commercial_status, invoice_row.status::text, 'DRAFT')) = 'DRAFT'
    )
  ) then
    raise exception 'Insufficient permission to edit invoice details' using errcode = '42501';
  end if;
  if normalized_method is not null
     and normalized_method not in ('pickup', 'delivery', 'bus', 'other') then
    raise exception 'Unsupported delivery method' using errcode = '22023';
  end if;
  if normalized_branch_id is not null then
    select * into branch_row
      from public.branches
     where id = normalized_branch_id and company_id = invoice_row.company_id;
    if not found then
      raise exception 'Pickup store belongs to another company' using errcode = '42501';
    end if;
    if normalized_method = 'pickup' then
      normalized_details := nullif(trim(concat_ws(', ', branch_row.name, branch_row.registered_address, branch_row.municipality)), '');
    end if;
  end if;
  if normalized_method is distinct from 'pickup' then
    normalized_branch_id := null;
  end if;

  perform set_config('app.invoice_auxiliary_workflow', 'authorized', true);
  update public.invoices
     set delivery_method = normalized_method,
         pickup_branch_id = normalized_branch_id,
         delivery_details = normalized_details,
         post_cod = normalized_post_cod
   where id = p_invoice_id
   returning * into invoice_row;
  return invoice_row;
end;
$$;

revoke all on function public.set_invoice_delivery_details(uuid, text, uuid, text, boolean) from public, anon;
grant execute on function public.set_invoice_delivery_details(uuid, text, uuid, text, boolean) to authenticated;

create or replace function public.set_invoice_delivery_details(
  p_invoice_id uuid,
  p_delivery_method text default null,
  p_pickup_branch_id uuid default null,
  p_delivery_details text default null
)
returns public.invoices
language sql security definer set search_path = ''
as $$
  select public.set_invoice_delivery_details(p_invoice_id, p_delivery_method, p_pickup_branch_id, p_delivery_details, false);
$$;

revoke all on function public.set_invoice_delivery_details(uuid, text, uuid, text) from public, anon;
grant execute on function public.set_invoice_delivery_details(uuid, text, uuid, text) to authenticated;

create table if not exists public.post_cod_settlements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
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

create unique index if not exists post_cod_settlements_idempotency_idx
  on public.post_cod_settlements(idempotency_key)
  where idempotency_key is not null;
create index if not exists post_cod_settlements_company_idx
  on public.post_cod_settlements(company_id, settlement_date desc, status);

alter table public.post_cod_settlements enable row level security;
drop policy if exists post_cod_settlements_member_select on public.post_cod_settlements;
create policy post_cod_settlements_member_select on public.post_cod_settlements
for select to authenticated
using (private.is_company_member(company_id) or private.can_view_fund_account(fund_account_id));

revoke all on public.post_cod_settlements from anon, authenticated;
grant select on public.post_cod_settlements to authenticated;

create or replace function public.create_post_cod_settlement(
  p_company_id uuid,
  p_fund_account_id uuid,
  p_amount numeric,
  p_settlement_date date default current_date,
  p_description text default null,
  p_idempotency_key uuid default null
)
returns public.post_cod_settlements
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  fund_row public.company_fund_accounts;
  settlement_row public.post_cod_settlements;
  cod_total numeric(20,4) := 0;
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
    raise exception 'Insufficient permission to settle Post COD' using errcode = '42501';
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
    raise exception 'Post COD settlements can only use cash or bank accounts' using errcode = '23514';
  end if;
  if not private.can_view_fund_account(fund_row.id) then
    raise exception 'The selected cash or bank account is not accessible' using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    select * into settlement_row
      from public.post_cod_settlements
     where idempotency_key = p_idempotency_key
     for update;
    if found then return settlement_row; end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':post_cod', 0));

  select coalesce(sum(invoice.total_amount), 0)::numeric(20,4)
    into cod_total
    from public.invoices invoice
   where invoice.company_id = p_company_id
     and invoice.post_cod = true
     and invoice.accounting_state = 'posted'
     and lower(coalesce(invoice.type, '')) in ('invoice', 'final_invoice', 'advance_invoice', 'simplified_invoice')
     and lower(coalesce(invoice.status::text, '')) not in ('cancelled', 'credited', 'reversed');

  select coalesce(sum(settlement.amount), 0)::numeric(20,4)
    into settled_total
    from public.post_cod_settlements settlement
   where settlement.company_id = p_company_id
     and settlement.status = 'active';

  outstanding_total := greatest(cod_total - settled_total, 0);
  if settlement_amount > outstanding_total + 0.0001 then
    raise exception 'Settlement amount exceeds the Post COD balance' using errcode = '23514';
  end if;

  insert into public.post_cod_settlements (
    company_id, fund_account_id, amount, currency, settlement_date,
    description, idempotency_key, created_by
  ) values (
    p_company_id, fund_row.id, settlement_amount, fund_row.currency,
    coalesce(p_settlement_date, current_date), nullif(trim(p_description), ''),
    p_idempotency_key, actor_id
  ) returning * into settlement_row;

  return settlement_row;
end;
$$;

revoke all on function public.create_post_cod_settlement(uuid, uuid, numeric, date, text, uuid) from public, anon;
grant execute on function public.create_post_cod_settlement(uuid, uuid, numeric, date, text, uuid) to authenticated;

comment on function public.create_post_cod_settlement(uuid, uuid, numeric, date, text, uuid) is
  'Records an internal Post COD reconciliation without changing cash or bank balances.';
