-- OperiX Kosovo Sales Book period lifecycle.
--
-- Sales Book periods deliberately sit beside generic accounting_periods. The
-- generic periods continue to control journal posting while this table owns
-- the VAT-book declaration lifecycle and its stricter historical lock.

create table if not exists public.sales_book_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  accounting_period_id uuid references public.accounting_periods(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  reporting_frequency text not null default 'monthly'
    check (reporting_frequency in ('monthly', 'quarterly', 'annual')),
  status text not null default 'OPEN'
    check (status in ('OPEN', 'READY_FOR_DECLARATION', 'DECLARED', 'AMENDED')),
  declaration_deadline date not null,
  tax_timezone text not null default 'Europe/Belgrade',
  declared_at timestamptz,
  declared_by uuid references auth.users(id) on delete set null,
  declaration_metadata jsonb not null default '{}'::jsonb,
  amended_at timestamptz,
  amended_by uuid references auth.users(id) on delete set null,
  amendment_reason text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  check (period_end >= period_start),
  check (declaration_deadline > period_end),
  unique (company_id, period_start, period_end),
  unique (company_id, id)
);

create index if not exists sales_book_periods_company_dates_idx
  on public.sales_book_periods (company_id, period_start desc, period_end desc);
create index if not exists sales_book_periods_company_status_idx
  on public.sales_book_periods (company_id, status, declaration_deadline);

alter table public.invoices
  add column if not exists sales_book_period_id uuid;

create index if not exists invoices_sales_book_period_idx
  on public.invoices (company_id, sales_book_period_id)
  where sales_book_period_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'invoices_sales_book_period_company_fk'
      and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices
      add constraint invoices_sales_book_period_company_fk
      foreign key (company_id, sales_book_period_id)
      references public.sales_book_periods(company_id, id)
      on delete restrict;
  end if;
end
$$;

create table if not exists public.sales_book_amendments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  sales_book_period_id uuid not null references public.sales_book_periods(id) on delete restrict,
  invoice_id uuid references public.invoices(id) on delete restrict,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'APPLIED', 'CANCELLED')),
  reason text not null check (length(trim(reason)) > 0),
  before_snapshot jsonb not null default '{}'::jsonb,
  after_snapshot jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  applied_at timestamptz,
  applied_by uuid references auth.users(id) on delete set null,
  unique (id, company_id)
);

create index if not exists sales_book_amendments_period_idx
  on public.sales_book_amendments (company_id, sales_book_period_id, created_at desc);
create index if not exists sales_book_amendments_invoice_idx
  on public.sales_book_amendments (company_id, invoice_id, created_at desc)
  where invoice_id is not null;

-- ---------------------------------------------------------------------------
-- Central period strategy and assignment
-- ---------------------------------------------------------------------------

create or replace function private.sales_book_period_dates(
  p_transaction_date date,
  p_reporting_frequency text
)
returns table(period_start date, period_end date, declaration_deadline date)
language plpgsql
immutable
set search_path = ''
as $$
declare
  next_month date;
  quarter_month smallint;
begin
  if p_transaction_date is null then
    raise exception 'A transaction date is required for Sales Book assignment' using errcode = '22023';
  end if;

  if lower(coalesce(p_reporting_frequency, '')) = 'monthly' then
    period_start := date_trunc('month', p_transaction_date::timestamp)::date;
    period_end := (period_start + interval '1 month - 1 day')::date;
    next_month := (period_start + interval '1 month')::date;
    declaration_deadline := make_date(extract(year from next_month)::integer, extract(month from next_month)::integer, 20);
    return next;
    return;
  end if;

  if lower(coalesce(p_reporting_frequency, '')) = 'quarterly' then
    quarter_month := (((extract(month from p_transaction_date)::integer - 1) / 3) * 3) + 1;
    period_start := make_date(extract(year from p_transaction_date)::integer, quarter_month, 1);
    period_end := (period_start + interval '3 months - 1 day')::date;
    next_month := (period_end + interval '1 day')::date;
    declaration_deadline := make_date(extract(year from next_month)::integer, extract(month from next_month)::integer, 20);
    return next;
    return;
  end if;

  if lower(coalesce(p_reporting_frequency, '')) = 'annual' then
    period_start := make_date(extract(year from p_transaction_date)::integer, 1, 1);
    period_end := make_date(extract(year from p_transaction_date)::integer, 12, 31);
    declaration_deadline := make_date(extract(year from p_transaction_date)::integer + 1, 3, 31);
    return next;
    return;
  end if;

  raise exception 'Unsupported Sales Book reporting frequency: %', p_reporting_frequency using errcode = '22023';
end
$$;

create or replace function private.sales_book_company_frequency(p_company_id uuid)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  company_row public.companies;
  configured_frequency text;
begin
  select * into company_row from public.companies where id = p_company_id;
  if not found then
    raise exception 'Company not found' using errcode = 'P0002';
  end if;
  if lower(coalesce(company_row.vat_registration_status, 'not_registered')) <> 'registered' then
    return null;
  end if;
  configured_frequency := lower(nullif(trim(coalesce(company_row.accounting_period_frequency, '')), ''));
  if configured_frequency is null then
    raise exception 'VAT reporting frequency is not configured for this company' using errcode = '55000';
  end if;
  if configured_frequency not in ('monthly', 'quarterly', 'annual') then
    raise exception 'VAT reporting frequency is not supported for this Sales Book: %', configured_frequency using errcode = '55000';
  end if;
  return configured_frequency;
end
$$;

create or replace function private.ensure_sales_book_period(
  p_company_id uuid,
  p_transaction_date date,
  p_actor_id uuid default null
)
returns public.sales_book_periods
language plpgsql
security definer
set search_path = ''
as $$
declare
  frequency text;
  dates record;
  period_row public.sales_book_periods;
  accounting_period_id uuid;
  as_of_date date := coalesce(p_transaction_date, (timezone('Europe/Belgrade', clock_timestamp()))::date);
begin
  frequency := private.sales_book_company_frequency(p_company_id);
  if frequency is null then
    return null;
  end if;

  select * into dates from private.sales_book_period_dates(as_of_date, frequency);
  select id into accounting_period_id
  from public.accounting_periods
  where company_id = p_company_id
    and start_date = dates.period_start
    and end_date = dates.period_end
  limit 1;

  insert into public.sales_book_periods (
    company_id, accounting_period_id, period_start, period_end,
    reporting_frequency, status, declaration_deadline, tax_timezone,
    created_by, updated_by
  ) values (
    p_company_id, accounting_period_id, dates.period_start, dates.period_end,
    frequency, 'OPEN', dates.declaration_deadline, 'Europe/Belgrade',
    coalesce(p_actor_id, (select auth.uid())), coalesce(p_actor_id, (select auth.uid()))
  )
  on conflict (company_id, period_start, period_end)
  do update set
    accounting_period_id = coalesce(public.sales_book_periods.accounting_period_id, excluded.accounting_period_id),
    reporting_frequency = excluded.reporting_frequency,
    declaration_deadline = excluded.declaration_deadline,
    updated_at = clock_timestamp(),
    updated_by = coalesce(p_actor_id, (select auth.uid()))
  returning * into period_row;

  -- Month rollover is automatic, but it is intentionally only a transition to
  -- READY_FOR_DECLARATION. Declaration remains an explicit, audited action.
  perform set_config('app.sales_book_period_workflow', 'system', true);
  update public.sales_book_periods
  set status = 'READY_FOR_DECLARATION',
      updated_at = clock_timestamp(),
      updated_by = coalesce(p_actor_id, (select auth.uid()))
  where company_id = p_company_id
    and period_end < as_of_date
    and status = 'OPEN';
  perform set_config('app.sales_book_period_workflow', '', true);

  insert into public.tax_calendar_events (
    company_id, tax_type, period_start, period_end, due_date, title,
    source_reference, created_by
  ) values (
    p_company_id, 'vat', dates.period_start, dates.period_end,
    dates.declaration_deadline, 'VAT Sales Book declaration',
    'sales_book_period:' || period_row.id::text,
    coalesce(p_actor_id, (select auth.uid()))
  )
  on conflict (company_id, tax_type, period_start, period_end)
  do update set due_date = excluded.due_date;

  select * into period_row from public.sales_book_periods where id = period_row.id;
  return period_row;
end
$$;

create or replace function private.sales_book_period_is_locked(p_period_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.sales_book_periods
    where id = p_period_id and status in ('DECLARED', 'AMENDED')
  );
$$;

create or replace function private.assign_sales_book_period()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_locked boolean := false;
  target_date date;
  resolved_period public.sales_book_periods;
begin
  if tg_op = 'DELETE' then
    old_locked := private.sales_book_period_is_locked(old.sales_book_period_id);
    if old_locked and coalesce(current_setting('app.sales_book_workflow', true), '') not in ('amendment', 'migration') then
      raise exception 'Declared Sales Book invoices cannot be deleted; use an amendment or corrective document'
        using errcode = '55000';
    end if;
    return old;
  end if;

  old_locked := private.sales_book_period_is_locked(old.sales_book_period_id);
  if tg_op = 'UPDATE' and old_locked and coalesce(current_setting('app.sales_book_workflow', true), '') not in ('amendment', 'migration') then
    raise exception 'Declared Sales Book invoices cannot be edited; use an amendment or corrective document'
      using errcode = '55000';
  end if;

  if new.company_id is null then
    new.sales_book_period_id := null;
    return new;
  end if;

  target_date := coalesce(new.issue_date, new.posting_date, (timezone('Europe/Belgrade', clock_timestamp()))::date);
  resolved_period := private.ensure_sales_book_period(new.company_id, target_date, (select auth.uid()));
  if resolved_period.id is null then
    new.sales_book_period_id := null;
    return new;
  end if;
  if resolved_period.status in ('DECLARED', 'AMENDED')
     and coalesce(current_setting('app.sales_book_workflow', true), '') not in ('amendment', 'migration') then
    raise exception 'This invoice date belongs to a declared Sales Book period; use an amendment or corrective document'
      using errcode = '55000';
  end if;
  new.sales_book_period_id := resolved_period.id;
  return new;
end
$$;

drop trigger if exists invoices_assign_sales_book_period on public.invoices;
create trigger invoices_assign_sales_book_period
before insert or update or delete on public.invoices
for each row execute function private.assign_sales_book_period();

create or replace function private.prevent_declared_sales_book_item_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice_id uuid := case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end;
  period_id uuid;
begin
  select invoice.sales_book_period_id into period_id from public.invoices invoice where invoice.id = invoice_id;
  if private.sales_book_period_is_locked(period_id)
     and coalesce(current_setting('app.sales_book_workflow', true), '') not in ('amendment', 'migration') then
    raise exception 'Declared Sales Book invoice lines cannot be changed; use an amendment or corrective document'
      using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

drop trigger if exists invoice_items_declared_sales_book_guard on public.invoice_items;
create trigger invoice_items_declared_sales_book_guard
before insert or update or delete on public.invoice_items
for each row execute function private.prevent_declared_sales_book_item_mutation();

create or replace function private.prevent_declared_sales_book_customer_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.invoices invoice
    where invoice.client_id = case when tg_op = 'DELETE' then old.id else new.id end
      and private.sales_book_period_is_locked(invoice.sales_book_period_id)
  ) and coalesce(current_setting('app.sales_book_workflow', true), '') not in ('amendment', 'migration') then
    raise exception 'Customer data used by a declared Sales Book cannot be changed directly; use an amendment'
      using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

drop trigger if exists clients_declared_sales_book_guard on public.clients;
create trigger clients_declared_sales_book_guard
before update or delete on public.clients
for each row execute function private.prevent_declared_sales_book_customer_mutation();

-- ---------------------------------------------------------------------------
-- Period-aware Sales Book views
-- ---------------------------------------------------------------------------

create or replace view public.kosovo_sales_book
with (security_invoker = true)
as
select
  invoice.company_id,
  period.period_start,
  invoice.id as invoice_id,
  invoice.invoice_number,
  coalesce(invoice.issue_date, invoice.posting_date) as invoice_date,
  invoice.client_id,
  client.name as customer_name,
  coalesce(client.nui, client.fiscal_number, client.vat_number, client.tax_id) as customer_fiscal_number,
  coalesce(nullif(invoice.tax_reporting_category, ''),
    case
      when max(coalesce(item.tax_rate, 0)) = 18 then 'standard_18'
      when max(coalesce(item.tax_rate, 0)) = 8 then 'reduced_8'
      when max(coalesce(item.tax_rate, 0)) = 0 then 'zero_rated'
      else 'classified_review_required'
    end) as vat_classification,
  max(coalesce(item.tax_rate, 0))::numeric(8,4) as vat_rate,
  round(sum(coalesce(item.amount, 0)) * case when invoice.credit_of_invoice_id is not null or lower(coalesce(invoice.type, '')) = 'credit_note' then -1 else 1 end, 4) as taxable_base,
  round(sum(round(coalesce(item.amount, 0) * coalesce(item.tax_rate, 0) / 100, 4)) * case when invoice.credit_of_invoice_id is not null or lower(coalesce(invoice.type, '')) = 'credit_note' then -1 else 1 end, 4) as output_vat,
  round(coalesce(invoice.total_amount, 0) * case when invoice.credit_of_invoice_id is not null or lower(coalesce(invoice.type, '')) = 'credit_note' then -1 else 1 end, 4) as total_amount,
  invoice.credit_of_invoice_id is not null or lower(coalesce(invoice.type, '')) = 'credit_note' as is_credit_note,
  invoice.posting_journal_entry_id as source_journal_entry_id,
  period.id as sales_book_period_id,
  period.period_end,
  period.status as period_status,
  period.declaration_deadline,
  period.declared_at,
  period.declared_by
from public.invoices invoice
join public.sales_book_periods period on period.id = invoice.sales_book_period_id
join public.invoice_items item on item.invoice_id = invoice.id
left join public.clients client on client.id = invoice.client_id
where invoice.accounting_state = 'posted'
  and invoice.status not in ('cancelled'::public.invoice_status, 'reversed'::public.invoice_status)
group by
  invoice.company_id, period.period_start, period.period_end, period.id, period.status,
  period.declaration_deadline, period.declared_at, period.declared_by,
  invoice.id, invoice.invoice_number, invoice.issue_date, invoice.posting_date,
  invoice.client_id, client.name, client.nui, client.fiscal_number, client.vat_number, client.tax_id,
  invoice.tax_reporting_category, invoice.type, invoice.credit_of_invoice_id, invoice.total_amount,
  invoice.posting_journal_entry_id;

grant select on public.kosovo_sales_book to authenticated;

create or replace view public.kosovo_sales_book_period_summary
with (security_invoker = true)
as
select
  period.id,
  period.company_id,
  period.accounting_period_id,
  period.period_start,
  period.period_end,
  period.reporting_frequency,
  period.status,
  period.declaration_deadline,
  period.tax_timezone,
  period.declared_at,
  period.declared_by,
  period.declaration_metadata,
  period.amended_at,
  period.amended_by,
  period.amendment_reason,
  period.created_at,
  period.updated_at,
  count(book.invoice_id)::integer as transaction_count,
  round(coalesce(sum(book.taxable_base), 0), 4) as taxable_amount,
  round(coalesce(sum(book.output_vat), 0), 4) as vat_amount,
  round(coalesce(sum(book.total_amount), 0), 4) as total_amount
from public.sales_book_periods period
left join public.kosovo_sales_book book on book.sales_book_period_id = period.id
group by period.id;

grant select on public.kosovo_sales_book_period_summary to authenticated;

create or replace function private.sales_book_period_snapshot(p_period_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'period_id', period.id,
    'company_id', period.company_id,
    'period_start', period.period_start,
    'period_end', period.period_end,
    'declaration_deadline', period.declaration_deadline,
    'transaction_count', coalesce(summary.transaction_count, 0),
    'taxable_amount', coalesce(summary.taxable_amount, 0),
    'vat_amount', coalesce(summary.vat_amount, 0),
    'total_amount', coalesce(summary.total_amount, 0),
    'transactions', coalesce((
      select jsonb_agg(to_jsonb(book) order by book.invoice_date, book.invoice_number, book.invoice_id)
      from public.kosovo_sales_book book
      where book.sales_book_period_id = period.id
    ), '[]'::jsonb),
    'source_checksum', md5(coalesce((
      select string_agg(
        concat_ws(':', book.invoice_id::text, book.taxable_base::text, book.output_vat::text, book.total_amount::text),
        '|' order by book.invoice_id
      )
      from public.kosovo_sales_book book
      where book.sales_book_period_id = period.id
    ), ''))
  )
  from public.sales_book_periods period
  left join public.kosovo_sales_book_period_summary summary on summary.id = period.id
  where period.id = p_period_id;
$$;

-- ---------------------------------------------------------------------------
-- Declaration and amendment commands
-- ---------------------------------------------------------------------------

create or replace function private.protect_sales_book_period_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     and coalesce(current_setting('app.sales_book_period_workflow', true), '') not in ('system', 'authorized', 'amendment') then
    raise exception 'Sales Book period status changes must use a controlled workflow' using errcode = '55000';
  end if;
  if old.status = 'OPEN' and new.status not in ('OPEN', 'READY_FOR_DECLARATION') then
    raise exception 'An open Sales Book can only move to READY_FOR_DECLARATION' using errcode = '55000';
  end if;
  if old.status = 'READY_FOR_DECLARATION' and new.status not in ('READY_FOR_DECLARATION', 'DECLARED') then
    raise exception 'A ready Sales Book can only be declared' using errcode = '55000';
  end if;
  if old.status = 'DECLARED' and new.status not in ('DECLARED', 'AMENDED') then
    raise exception 'A declared Sales Book can only move to AMENDED' using errcode = '55000';
  end if;
  if old.status = 'AMENDED' and new.status <> 'AMENDED' then
    raise exception 'An amended Sales Book cannot be reopened' using errcode = '55000';
  end if;
  return new;
end
$$;

drop trigger if exists sales_book_period_status_guard on public.sales_book_periods;
create trigger sales_book_period_status_guard
before update on public.sales_book_periods
for each row execute function private.protect_sales_book_period_status();

create or replace function private.protect_sales_book_period_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('DECLARED', 'AMENDED')
     and coalesce(current_setting('app.sales_book_period_workflow', true), '') not in ('amendment', 'migration')
     and (
       new.company_id is distinct from old.company_id
       or new.accounting_period_id is distinct from old.accounting_period_id
       or new.period_start is distinct from old.period_start
       or new.period_end is distinct from old.period_end
       or new.reporting_frequency is distinct from old.reporting_frequency
       or new.declaration_deadline is distinct from old.declaration_deadline
       or new.tax_timezone is distinct from old.tax_timezone
       or new.declared_at is distinct from old.declared_at
       or new.declared_by is distinct from old.declared_by
       or new.declaration_metadata is distinct from old.declaration_metadata
       or new.amended_at is distinct from old.amended_at
       or new.amended_by is distinct from old.amended_by
       or new.amendment_reason is distinct from old.amendment_reason
       or new.created_at is distinct from old.created_at
       or new.created_by is distinct from old.created_by
     ) then
    raise exception 'Declared Sales Book period metadata is immutable; use an amendment workflow'
      using errcode = '55000';
  end if;
  return new;
end
$$;

drop trigger if exists sales_book_period_fields_guard on public.sales_book_periods;
create trigger sales_book_period_fields_guard
before update on public.sales_book_periods
for each row execute function private.protect_sales_book_period_fields();

drop trigger if exists sales_book_periods_audit on public.sales_book_periods;
create trigger sales_book_periods_audit
after insert or update or delete on public.sales_book_periods
for each row execute function private.audit_table_change();

drop trigger if exists sales_book_amendments_audit on public.sales_book_amendments;
create trigger sales_book_amendments_audit
after insert or update or delete on public.sales_book_amendments
for each row execute function private.audit_table_change();

create or replace function private.prevent_sales_book_amendment_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.sales_book_amendment_workflow', true), '') <> 'authorized' then
    raise exception 'Sales Book amendments are append-only and can only be changed by the amendment workflow'
      using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

drop trigger if exists sales_book_amendments_immutable on public.sales_book_amendments;
create trigger sales_book_amendments_immutable
before update or delete on public.sales_book_amendments
for each row execute function private.prevent_sales_book_amendment_mutation();

create or replace function public.ensure_sales_book_period(
  p_company_id uuid,
  p_as_of_date date default (timezone('Europe/Belgrade', clock_timestamp()))::date
)
returns public.sales_book_periods
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.sales_book_periods;
begin
  if not coalesce(private.has_company_permission(p_company_id, 'tax.book.view'), false) then
    raise exception 'Insufficient permission to view the Sales Book' using errcode = '42501';
  end if;
  if p_as_of_date is not null
     and p_as_of_date > (timezone('Europe/Belgrade', clock_timestamp()))::date then
    raise exception 'A Sales Book period cannot be created for a future date' using errcode = '22023';
  end if;
  result := private.ensure_sales_book_period(p_company_id, p_as_of_date, (select auth.uid()));
  return result;
end
$$;

revoke all on function public.ensure_sales_book_period(uuid, date) from public, anon;
grant execute on function public.ensure_sales_book_period(uuid, date) to authenticated;

create or replace function public.mark_sales_book_declared(
  p_period_id uuid,
  p_confirmation boolean,
  p_reason text default null
)
returns public.sales_book_periods
language plpgsql
security definer
set search_path = ''
as $$
declare
  period_row public.sales_book_periods;
  snapshot jsonb;
begin
  if not coalesce(p_confirmation, false) then
    raise exception 'Explicit confirmation is required to declare a Sales Book' using errcode = '55000';
  end if;
  select * into period_row from public.sales_book_periods where id = p_period_id for update;
  if not found then
    raise exception 'Sales Book period not found' using errcode = 'P0002';
  end if;
  if not coalesce(private.has_company_permission(period_row.company_id, 'tax.declaration.prepare'), false) then
    raise exception 'Insufficient permission to declare the Sales Book' using errcode = '42501';
  end if;
  if period_row.status <> 'READY_FOR_DECLARATION' then
    raise exception 'Only a ready Sales Book period may be declared' using errcode = '55000';
  end if;
  snapshot := private.sales_book_period_snapshot(period_row.id);
  perform set_config('app.sales_book_period_workflow', 'authorized', true);
  perform set_config('app.change_reason', coalesce(nullif(trim(p_reason), ''), 'Sales Book declared'), true);
  update public.sales_book_periods
  set status = 'DECLARED',
      declared_at = clock_timestamp(),
      declared_by = (select auth.uid()),
      declaration_metadata = snapshot || jsonb_build_object('declared_by', (select auth.uid()), 'declared_at', clock_timestamp()),
      updated_at = clock_timestamp(),
      updated_by = (select auth.uid())
  where id = period_row.id
  returning * into period_row;
  update public.tax_calendar_events
  set status = 'completed', completed_at = clock_timestamp()
  where company_id = period_row.company_id
    and tax_type = 'vat'
    and period_start = period_row.period_start
    and period_end = period_row.period_end;
  perform set_config('app.change_reason', '', true);
  perform set_config('app.sales_book_period_workflow', '', true);
  return period_row;
exception when others then
  perform set_config('app.change_reason', '', true);
  perform set_config('app.sales_book_period_workflow', '', true);
  raise;
end
$$;

revoke all on function public.mark_sales_book_declared(uuid, boolean, text) from public, anon;
grant execute on function public.mark_sales_book_declared(uuid, boolean, text) to authenticated;

create or replace function public.create_sales_book_amendment(
  p_period_id uuid,
  p_invoice_id uuid default null,
  p_reason text default null
)
returns public.sales_book_amendments
language plpgsql
security definer
set search_path = ''
as $$
declare
  period_row public.sales_book_periods;
  invoice_row public.invoices;
  amendment_row public.sales_book_amendments;
  before_snapshot jsonb;
begin
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'An amendment reason is required' using errcode = '23514';
  end if;
  if p_invoice_id is null then
    raise exception 'An affected Sales Book transaction is required for an amendment' using errcode = '22023';
  end if;
  select * into period_row from public.sales_book_periods where id = p_period_id for update;
  if not found then
    raise exception 'Sales Book period not found' using errcode = 'P0002';
  end if;
  if not coalesce(private.has_company_permission(period_row.company_id, 'tax.declaration.prepare'), false) then
    raise exception 'Insufficient permission to amend the Sales Book' using errcode = '42501';
  end if;
  if period_row.status not in ('DECLARED', 'AMENDED') then
    raise exception 'Only a declared Sales Book period may be amended' using errcode = '55000';
  end if;
  select * into invoice_row from public.invoices where id = p_invoice_id and company_id = period_row.company_id for share;
  if not found then
    raise exception 'The selected invoice is not in this company' using errcode = '22023';
  end if;
  if invoice_row.sales_book_period_id is distinct from period_row.id then
    raise exception 'The selected invoice is not assigned to this Sales Book period' using errcode = '22023';
  end if;
  before_snapshot := jsonb_build_object('invoice', to_jsonb(invoice_row), 'period', private.sales_book_period_snapshot(period_row.id));
  insert into public.sales_book_amendments (
    company_id, sales_book_period_id, invoice_id, reason, before_snapshot, created_by
  ) values (
    period_row.company_id, period_row.id, p_invoice_id, trim(p_reason), before_snapshot, (select auth.uid())
  ) returning * into amendment_row;
  return amendment_row;
end
$$;

revoke all on function public.create_sales_book_amendment(uuid, uuid, text) from public, anon;
grant execute on function public.create_sales_book_amendment(uuid, uuid, text) to authenticated;

create or replace function public.apply_sales_book_amendment(
  p_amendment_id uuid,
  p_invoice jsonb,
  p_items jsonb,
  p_idempotency_key uuid default null
)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  amendment_row public.sales_book_amendments;
  period_row public.sales_book_periods;
  updated_invoice public.invoices;
  after_snapshot_value jsonb;
begin
  select * into amendment_row from public.sales_book_amendments where id = p_amendment_id for update;
  if not found then
    raise exception 'Sales Book amendment not found' using errcode = 'P0002';
  end if;
  select * into period_row from public.sales_book_periods where id = amendment_row.sales_book_period_id for update;
  if not coalesce(private.has_company_permission(period_row.company_id, 'tax.declaration.prepare'), false) then
    raise exception 'Insufficient permission to apply the Sales Book amendment' using errcode = '42501';
  end if;
  if amendment_row.status <> 'PENDING' then
    raise exception 'This Sales Book amendment has already been resolved' using errcode = '55000';
  end if;
  if amendment_row.invoice_id is null then
    raise exception 'A transaction is required to apply an invoice amendment' using errcode = '22023';
  end if;

  perform set_config('app.sales_book_workflow', 'amendment', true);
  begin
    updated_invoice := public.replace_posted_invoice_document(
      p_invoice, p_items, amendment_row.invoice_id, p_idempotency_key
    );
    if updated_invoice.sales_book_period_id is distinct from period_row.id then
      raise exception 'An amendment must keep the corrected invoice in its original Sales Book period'
        using errcode = '55000';
    end if;
  exception when others then
    perform set_config('app.sales_book_workflow', '', true);
    raise;
  end;
  perform set_config('app.sales_book_workflow', '', true);

  after_snapshot_value := jsonb_build_object(
    'invoice', to_jsonb(updated_invoice),
    'period', private.sales_book_period_snapshot(period_row.id)
  );
  perform set_config('app.sales_book_amendment_workflow', 'authorized', true);
  update public.sales_book_amendments
  set status = 'APPLIED', after_snapshot = after_snapshot_value,
      applied_at = clock_timestamp(), applied_by = (select auth.uid())
  where id = amendment_row.id;
  perform set_config('app.sales_book_amendment_workflow', '', true);

  perform set_config('app.sales_book_period_workflow', 'amendment', true);
  perform set_config('app.change_reason', amendment_row.reason, true);
  update public.sales_book_periods
  set status = 'AMENDED', amended_at = clock_timestamp(), amended_by = (select auth.uid()),
      amendment_reason = amendment_row.reason, updated_at = clock_timestamp(), updated_by = (select auth.uid())
  where id = period_row.id;
  perform set_config('app.change_reason', '', true);
  perform set_config('app.sales_book_period_workflow', '', true);
  return updated_invoice;
exception when others then
  perform set_config('app.sales_book_workflow', '', true);
  perform set_config('app.sales_book_amendment_workflow', '', true);
  perform set_config('app.change_reason', '', true);
  perform set_config('app.sales_book_period_workflow', '', true);
  raise;
end
$$;

revoke all on function public.apply_sales_book_amendment(uuid, jsonb, jsonb, uuid) from public, anon;
grant execute on function public.apply_sales_book_amendment(uuid, jsonb, jsonb, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Safe historical backfill
-- ---------------------------------------------------------------------------

create or replace function private.sync_sales_book_company_setup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  frequency text;
  first_date date;
  cursor_date date;
  today date := (timezone('Europe/Belgrade', clock_timestamp()))::date;
begin
  if lower(coalesce(new.vat_registration_status, 'not_registered')) <> 'registered' then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.vat_registration_status is not distinct from old.vat_registration_status
     and new.accounting_period_frequency is not distinct from old.accounting_period_frequency
     and new.vat_registration_date is not distinct from old.vat_registration_date then
    return new;
  end if;

  frequency := private.sales_book_company_frequency(new.id);
  first_date := coalesce(
    new.vat_registration_date,
    (select min(invoice.issue_date) from public.invoices invoice where invoice.company_id = new.id),
    today
  );
  cursor_date := first_date;
  perform set_config('app.sales_book_workflow', 'migration', true);
  while cursor_date <= today loop
    perform private.ensure_sales_book_period(new.id, cursor_date, null);
    cursor_date := case frequency
      when 'monthly' then (date_trunc('month', cursor_date::timestamp) + interval '1 month')::date
      when 'quarterly' then (date_trunc('quarter', cursor_date::timestamp) + interval '3 months')::date
      else (date_trunc('year', cursor_date::timestamp) + interval '1 year')::date
    end;
  end loop;
  perform set_config('app.financial_workflow', 'authorized', true);
  update public.invoices invoice
  set sales_book_period_id = period.id
  from public.sales_book_periods period
  where invoice.company_id = new.id
    and coalesce(invoice.issue_date, invoice.posting_date, today) between period.period_start and period.period_end
    and invoice.sales_book_period_id is distinct from period.id;
  perform set_config('app.financial_workflow', '', true);
  perform set_config('app.sales_book_workflow', '', true);
  return new;
exception when others then
  perform set_config('app.financial_workflow', '', true);
  perform set_config('app.sales_book_workflow', '', true);
  raise;
end
$$;

drop trigger if exists companies_sales_book_setup on public.companies;
create trigger companies_sales_book_setup
after insert or update of vat_registration_status, accounting_period_frequency, vat_registration_date
on public.companies
for each row execute function private.sync_sales_book_company_setup();

do $$
declare
  company_row record;
  first_date date;
  cursor_date date;
  frequency text;
  today date := (timezone('Europe/Belgrade', clock_timestamp()))::date;
begin
  for company_row in
    select company.id, coalesce(company.vat_registration_date, min(invoice.issue_date), current_date) as first_date
    from public.companies company
    left join public.invoices invoice on invoice.company_id = company.id
    where lower(coalesce(company.vat_registration_status, 'not_registered')) = 'registered'
    group by company.id, company.vat_registration_date
  loop
    frequency := private.sales_book_company_frequency(company_row.id);
    first_date := date_trunc('month', company_row.first_date)::date;
    cursor_date := first_date;
    while cursor_date <= today loop
      perform private.ensure_sales_book_period(company_row.id, cursor_date, null);
      cursor_date := case frequency
        when 'monthly' then (date_trunc('month', cursor_date::timestamp) + interval '1 month')::date
        when 'quarterly' then (date_trunc('quarter', cursor_date::timestamp) + interval '3 months')::date
        else (date_trunc('year', cursor_date::timestamp) + interval '1 year')::date
      end;
    end loop;
  end loop;

  perform set_config('app.sales_book_workflow', 'migration', true);
  perform set_config('app.financial_workflow', 'authorized', true);
  update public.invoices invoice
  set sales_book_period_id = period.id
  from public.sales_book_periods period
  where invoice.company_id = period.company_id
    and coalesce(invoice.issue_date, invoice.posting_date, current_date) between period.period_start and period.period_end
    and invoice.sales_book_period_id is distinct from period.id;
  perform set_config('app.financial_workflow', '', true);
  perform set_config('app.sales_book_workflow', '', true);

  perform set_config('app.sales_book_period_workflow', 'system', true);
  update public.sales_book_periods
  set status = 'READY_FOR_DECLARATION', updated_at = clock_timestamp()
  where period_end < today and status = 'OPEN';
  perform set_config('app.sales_book_period_workflow', '', true);
end
$$;

-- ---------------------------------------------------------------------------
-- Tenant isolation and controlled writes
-- ---------------------------------------------------------------------------

alter table public.sales_book_periods enable row level security;
alter table public.sales_book_amendments enable row level security;

drop policy if exists sales_book_periods_select on public.sales_book_periods;
create policy sales_book_periods_select
on public.sales_book_periods for select to authenticated
using ((select private.has_company_permission(company_id, 'tax.book.view')));

drop policy if exists sales_book_amendments_select on public.sales_book_amendments;
create policy sales_book_amendments_select
on public.sales_book_amendments for select to authenticated
using ((select private.has_company_permission(company_id, 'tax.book.view')));

revoke all on public.sales_book_periods, public.sales_book_amendments from anon, authenticated;
grant select on public.sales_book_periods, public.sales_book_amendments to authenticated;

comment on table public.sales_book_periods is
  'Tenant-scoped Kosovo Sales Book periods. Declaration status is controlled by mark_sales_book_declared and amendments are explicit.';
comment on table public.sales_book_amendments is
  'Append-audited Sales Book correction workflow preserving before and after snapshots.';
