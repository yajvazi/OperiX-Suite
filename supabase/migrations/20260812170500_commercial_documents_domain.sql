-- OperiX CommercialDocuments domain.
--
-- This migration intentionally upgrades the existing invoices/invoice_items
-- operational tables instead of creating five duplicated document schemas.
-- `commercial_document_type` is the canonical identity; `type` and `subtype`
-- remain compatibility fields for existing mobile/web/POS flows.

alter table public.invoices
  add column if not exists commercial_document_type text,
  add column if not exists commercial_status text,
  add column if not exists accounting_status text not null default 'NOT_POSTED',
  add column if not exists vat_status text not null default 'NOT_EVALUATED',
  add column if not exists inventory_status text not null default 'NOT_APPLICABLE',
  add column if not exists payment_status text not null default 'NOT_APPLICABLE',
  add column if not exists fiscalization_status text not null default 'NOT_REQUIRED',
  add column if not exists supply_date date,
  add column if not exists order_date date,
  add column if not exists delivery_date date,
  add column if not exists payment_date date,
  add column if not exists valid_until date,
  add column if not exists customer_po_number text,
  add column if not exists delivery_address text,
  add column if not exists shipping_address text,
  add column if not exists payment_terms text,
  add column if not exists delivery_terms text,
  add column if not exists show_prices_on_delivery_note boolean not null default true,
  add column if not exists correction_reason_code text,
  add column if not exists original_invoice_id uuid references public.invoices(id) on delete restrict,
  add column if not exists advance_applied_amount numeric(20,4) not null default 0 check (advance_applied_amount >= 0),
  add column if not exists immutable_at timestamptz,
  add column if not exists issued_at timestamptz,
  add column if not exists issued_by uuid references auth.users(id) on delete set null;

update public.invoices
set commercial_document_type = case
  when lower(coalesce(subtype, '')) = 'offer' then 'QUOTE'
  when lower(coalesce(subtype, '')) in ('pro_invoice', 'proforma') or lower(coalesce(type, '')) = 'proforma' then 'PROFORMA'
  when lower(coalesce(subtype, '')) = 'order' then 'SALES_ORDER'
  when lower(coalesce(subtype, '')) = 'delivery_note' then 'DELIVERY_NOTE'
  when lower(coalesce(subtype, '')) = 'advance_invoice' then 'ADVANCE_INVOICE'
  when lower(coalesce(subtype, '')) = 'final_invoice' then 'FINAL_INVOICE'
  when lower(coalesce(subtype, '')) = 'credit_note' then 'CREDIT_NOTE'
  when lower(coalesce(subtype, '')) = 'debit_note' then 'DEBIT_NOTE'
  when lower(coalesce(subtype, '')) = 'simplified_invoice' then 'SIMPLIFIED_INVOICE'
  when lower(coalesce(subtype, '')) = 'fiscal_receipt' then 'FISCAL_RECEIPT'
  when lower(coalesce(subtype, '')) = 'bad_debt_invoice' then 'BAD_DEBT_INVOICE'
  when lower(coalesce(type, '')) = 'offer' then 'QUOTE'
  else 'INVOICE'
end
where commercial_document_type is null;

update public.invoices
set commercial_status = case
  when commercial_document_type in ('QUOTE', 'PROFORMA') and status::text = 'sent' then 'SENT'
  when commercial_document_type = 'SALES_ORDER' and status::text = 'sent' then 'CONFIRMED'
  when commercial_document_type = 'DELIVERY_NOTE' and status::text = 'sent' then 'DISPATCHED'
  when status::text = 'paid' then 'PAID'
  when status::text = 'overdue' then 'OVERDUE'
  when status::text = 'cancelled' then 'CANCELLED'
  when status::text = 'partially_paid' then 'PARTIALLY_PAID'
  when status::text in ('posted', 'approved') and commercial_document_type not in ('QUOTE', 'PROFORMA', 'SALES_ORDER', 'DELIVERY_NOTE') then 'ISSUED'
  else 'DRAFT'
end
where commercial_status is null;

update public.invoices
set accounting_status = case
      when accounting_state = 'posted' then 'POSTED'
      when accounting_state = 'ready_for_posting' then 'READY_TO_POST'
      when accounting_state = 'reversed' then 'REVERSED'
      when commercial_document_type in ('QUOTE', 'PROFORMA', 'SALES_ORDER', 'DELIVERY_NOTE') then 'NOT_APPLICABLE'
      else 'NOT_POSTED'
    end,
    vat_status = case
      when commercial_document_type in ('QUOTE', 'PROFORMA', 'SALES_ORDER', 'DELIVERY_NOTE') then 'NOT_APPLICABLE'
      when accounting_state = 'posted' then 'POSTED'
      else 'NOT_EVALUATED'
    end,
    inventory_status = case
      when commercial_document_type in ('SALES_ORDER', 'DELIVERY_NOTE') then 'POLICY_DEPENDENT'
      else 'NOT_APPLICABLE'
    end,
    payment_status = case
      when status::text = 'paid' then 'PAID'
      when status::text = 'partially_paid' then 'PARTIALLY_PAID'
      when commercial_document_type in ('INVOICE', 'ADVANCE_INVOICE', 'FINAL_INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE', 'SIMPLIFIED_INVOICE', 'FISCAL_RECEIPT', 'BAD_DEBT_INVOICE') then 'UNPAID'
      else 'NOT_APPLICABLE'
    end,
    fiscalization_status = 'NOT_REQUIRED'
where true;

alter table public.invoices
  alter column commercial_document_type set default 'INVOICE',
  alter column commercial_document_type set not null;
alter table public.invoices
  alter column commercial_status set default 'DRAFT',
  alter column commercial_status set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'invoices_commercial_document_type_check'
      and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices add constraint invoices_commercial_document_type_check
      check (commercial_document_type in (
        'QUOTE', 'PROFORMA', 'SALES_ORDER', 'DELIVERY_NOTE', 'INVOICE',
        'ADVANCE_INVOICE', 'FINAL_INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE',
        'SIMPLIFIED_INVOICE', 'FISCAL_RECEIPT', 'BAD_DEBT_INVOICE'
      ));
  end if;
end
$$;

create index if not exists invoices_company_commercial_type_date_idx
  on public.invoices (company_id, commercial_document_type, issue_date desc, created_at desc);
create index if not exists invoices_company_commercial_status_idx
  on public.invoices (company_id, commercial_status, created_at desc);
create index if not exists invoices_source_document_idx
  on public.invoices (company_id, source_document_type, source_document_id)
  where source_document_id is not null;
create index if not exists invoices_original_invoice_idx
  on public.invoices (company_id, original_invoice_id)
  where original_invoice_id is not null;

-- Canonical domain views keep the mobile/web code on one vocabulary while the
-- existing invoice tables remain the compatibility storage and accounting
-- source of truth. These are security-invoker views; tenant RLS on the source
-- tables is not bypassed.
create or replace view public.commercial_documents
with (security_invoker = true)
as
select
  invoice.id,
  invoice.user_id,
  invoice.company_id,
  invoice.branch_id,
  invoice.client_id,
  invoice.invoice_number as document_number,
  invoice.commercial_document_type as document_type,
  invoice.commercial_status as document_status,
  invoice.accounting_status,
  invoice.vat_status,
  invoice.inventory_status,
  invoice.payment_status,
  invoice.fiscalization_status,
  invoice.issue_date,
  invoice.supply_date,
  invoice.due_date,
  invoice.valid_until,
  invoice.order_date,
  invoice.delivery_date,
  invoice.payment_date,
  invoice.currency,
  invoice.exchange_rate,
  invoice.total_amount,
  invoice.tax_amount,
  invoice.source_document_type,
  invoice.source_document_id,
  invoice.original_invoice_id,
  invoice.created_at
from public.invoices invoice;

create or replace view public.commercial_document_relations
with (security_invoker = true)
as
select
  link.id,
  link.company_id,
  link.source_id as source_document_id,
  link.target_id as target_document_id,
  link.link_type,
  link.quantity,
  link.amount,
  link.metadata,
  link.created_at,
  link.created_by
from public.document_source_links link
where link.source_type = 'commercial_document'
  and link.target_type = 'commercial_document';

create or replace function private.normalize_commercial_document_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  legacy_type text := lower(coalesce(new.type, 'invoice'));
  legacy_subtype text := lower(coalesce(new.subtype, 'regular'));
begin
  -- A compatibility insert that only supplies type/subtype must still receive
  -- a canonical identity. An explicit non-INVOICE identity always wins.
  if new.commercial_document_type is null
     or (new.commercial_document_type = 'INVOICE' and (legacy_type <> 'invoice' or legacy_subtype <> 'regular')) then
    new.commercial_document_type := case
      when legacy_subtype = 'offer' or (legacy_type = 'offer' and legacy_subtype = 'regular') then 'QUOTE'
      when legacy_subtype in ('pro_invoice', 'proforma') or legacy_type = 'proforma' then 'PROFORMA'
      when legacy_subtype = 'order' then 'SALES_ORDER'
      when legacy_subtype = 'delivery_note' then 'DELIVERY_NOTE'
      when legacy_subtype = 'advance_invoice' then 'ADVANCE_INVOICE'
      when legacy_subtype = 'final_invoice' then 'FINAL_INVOICE'
      when legacy_subtype = 'credit_note' then 'CREDIT_NOTE'
      when legacy_subtype = 'debit_note' then 'DEBIT_NOTE'
      when legacy_subtype = 'simplified_invoice' then 'SIMPLIFIED_INVOICE'
      when legacy_subtype = 'fiscal_receipt' then 'FISCAL_RECEIPT'
      when legacy_subtype = 'bad_debt_invoice' then 'BAD_DEBT_INVOICE'
      else 'INVOICE'
    end;
  end if;
  new.commercial_status := coalesce(new.commercial_status, 'DRAFT');
  return new;
end
$$;

drop trigger if exists invoices_normalize_commercial_identity_trigger on public.invoices;
create trigger invoices_normalize_commercial_identity_trigger
  before insert or update of type, subtype, commercial_document_type on public.invoices
  for each row execute function private.normalize_commercial_document_identity();

create or replace function private.sync_commercial_state_from_invoice_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status::text = 'posted' then
    new.commercial_status := 'ISSUED';
    new.accounting_status := 'POSTED';
    new.vat_status := 'POSTED';
    new.issued_at := coalesce(new.issued_at, clock_timestamp());
    new.immutable_at := coalesce(new.immutable_at, clock_timestamp());
  elsif new.status::text = 'paid' then
    new.commercial_status := 'PAID';
    new.payment_status := 'PAID';
  elsif new.status::text = 'partially_paid' then
    new.commercial_status := 'PARTIALLY_PAID';
    new.payment_status := 'PARTIALLY_PAID';
  elsif new.status::text = 'overdue' then
    new.commercial_status := 'OVERDUE';
    new.payment_status := 'OVERDUE';
  elsif new.status::text = 'cancelled' then
    new.commercial_status := 'CANCELLED';
  end if;
  return new;
end
$$;

drop trigger if exists invoices_sync_commercial_state_trigger on public.invoices;
create trigger invoices_sync_commercial_state_trigger
  before update of status on public.invoices
  for each row execute function private.sync_commercial_state_from_invoice_status();

-- The relation graph is shared by all document types and supports one-to-many
-- conversions. Keep the existing table and expand its vocabulary.
alter table public.document_source_links
  drop constraint if exists document_source_links_link_type_check;
alter table public.document_source_links
  add constraint document_source_links_link_type_check
  check (link_type in (
    'quotation_conversion', 'proforma_conversion', 'order_conversion',
    'delivery_to_invoice', 'advance_finalization', 'proforma_to_advance',
    'payment_to_advance', 'credit_note', 'debit_note', 'reversal', 'adjustment',
    'attachment_reference', 'duplicate_as_draft'
  ));

alter table public.invoice_items
  add column if not exists ordered_quantity numeric(20,4) not null default 0 check (ordered_quantity >= 0),
  add column if not exists delivered_quantity numeric(20,4) not null default 0 check (delivered_quantity >= 0),
  add column if not exists remaining_quantity numeric(20,4) not null default 0 check (remaining_quantity >= 0);

update public.invoice_items item
set ordered_quantity = case when invoice.commercial_document_type = 'SALES_ORDER' then item.quantity else coalesce(item.ordered_quantity, 0) end,
    remaining_quantity = case when invoice.commercial_document_type = 'SALES_ORDER' then item.quantity else coalesce(item.remaining_quantity, 0) end
from public.invoices invoice
where invoice.id = item.invoice_id;

create or replace function private.normalize_commercial_line_quantities()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  document_type text;
begin
  select commercial_document_type into document_type from public.invoices where id = new.invoice_id;
  if document_type = 'SALES_ORDER' then
    new.ordered_quantity := case when coalesce(new.ordered_quantity, 0) = 0 then coalesce(new.quantity, 0) else new.ordered_quantity end;
    new.remaining_quantity := greatest(0, new.ordered_quantity - coalesce(new.delivered_quantity, 0));
  elsif document_type = 'DELIVERY_NOTE' then
    new.delivered_quantity := case when coalesce(new.delivered_quantity, 0) = 0 then coalesce(new.quantity, 0) else new.delivered_quantity end;
  end if;
  return new;
end
$$;

drop trigger if exists invoice_items_normalize_commercial_quantities_trigger on public.invoice_items;
create trigger invoice_items_normalize_commercial_quantities_trigger
  before insert or update of quantity, ordered_quantity, delivered_quantity on public.invoice_items
  for each row execute function private.normalize_commercial_line_quantities();

create or replace function private.validate_commercial_credit_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  document_type text;
  original_quantity numeric(20,4);
  already_credited numeric(20,4);
begin
  select commercial_document_type into document_type from public.invoices where id = new.invoice_id;
  if document_type <> 'CREDIT_NOTE' or new.source_item_id is null then return new; end if;
  select quantity into original_quantity from public.invoice_items where id = new.source_item_id;
  if original_quantity is null then raise exception 'Credit line is not linked to the original invoice line' using errcode = '23514'; end if;
  select coalesce(sum(item.quantity), 0) into already_credited
  from public.invoice_items item
  join public.invoices credit on credit.id = item.invoice_id
  where credit.commercial_document_type = 'CREDIT_NOTE'
    and credit.credit_of_invoice_id = (select credit_of_invoice_id from public.invoices where id = new.invoice_id)
    and item.source_item_id = new.source_item_id
    and item.id <> new.id;
  if already_credited + greatest(0, coalesce(new.quantity, 0)) > original_quantity then
    raise exception 'Credited quantity exceeds the original invoice quantity' using errcode = '22003';
  end if;
  new.credited_quantity := greatest(0, coalesce(new.quantity, 0));
  return new;
end
$$;

drop trigger if exists invoice_items_validate_commercial_credit_trigger on public.invoice_items;
create trigger invoice_items_validate_commercial_credit_trigger
  before insert or update of quantity, source_item_id on public.invoice_items
  for each row execute function private.validate_commercial_credit_line();

create or replace view public.commercial_document_lines
with (security_invoker = true)
as
select
  item.id,
  item.invoice_id as document_id,
  item.product_id,
  item.description,
  item.quantity,
  item.ordered_quantity,
  item.delivered_quantity,
  item.remaining_quantity,
  item.unit,
  item.unit_price,
  item.discount,
  item.tax_rate,
  item.amount,
  item.source_item_id,
  item.credited_quantity
from public.invoice_items item;

create table if not exists public.commercial_document_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  document_id uuid not null references public.invoices(id) on delete restrict,
  event_type text not null,
  from_status text,
  to_status text,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null default now(),
  actor_id uuid references auth.users(id) on delete set null
);

create index if not exists commercial_document_events_document_idx
  on public.commercial_document_events (company_id, document_id, occurred_at desc);
create index if not exists commercial_document_events_company_idx
  on public.commercial_document_events (company_id, occurred_at desc);

create or replace view public.commercial_document_timeline
with (security_invoker = true)
as
select event.id, event.company_id, event.document_id, event.event_type,
  event.from_status, event.to_status, event.payload, event.occurred_at, event.actor_id
from public.commercial_document_events event;

alter table public.commercial_document_events enable row level security;
drop policy if exists commercial_document_events_select on public.commercial_document_events;
create policy commercial_document_events_select on public.commercial_document_events
  for select to authenticated
  using ((select private.has_company_permission(company_id, 'sales_invoice.view')));
revoke insert, update, delete, truncate on public.commercial_document_events from anon, authenticated;
grant select on public.commercial_document_events to authenticated;

create or replace function private.insert_commercial_document_event(
  p_company_id uuid,
  p_document_id uuid,
  p_event_type text,
  p_from_status text default null,
  p_to_status text default null,
  p_payload jsonb default '{}'::jsonb,
  p_occurred_at timestamptz default now(),
  p_actor_id uuid default null
)
returns public.commercial_document_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.commercial_document_events;
begin
  insert into public.commercial_document_events (
    company_id, document_id, event_type, from_status, to_status, payload, occurred_at, actor_id
  ) values (
    p_company_id, p_document_id, p_event_type, p_from_status, p_to_status,
    coalesce(p_payload, '{}'::jsonb), coalesce(p_occurred_at, clock_timestamp()),
    coalesce(p_actor_id, (select auth.uid()))
  ) returning * into event_row;
  return event_row;
end
$$;

create or replace function private.capture_commercial_document_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.company_id is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    perform private.insert_commercial_document_event(
      new.company_id, new.id, 'created', null, new.commercial_status,
      jsonb_build_object('document_number', new.invoice_number, 'document_type', new.commercial_document_type),
      new.created_at, new.user_id
    );
  elsif old.commercial_status is distinct from new.commercial_status then
    perform private.insert_commercial_document_event(
      new.company_id, new.id, 'status_changed', old.commercial_status, new.commercial_status,
      jsonb_build_object('document_number', new.invoice_number, 'document_type', new.commercial_document_type),
      clock_timestamp(), (select auth.uid())
    );
  end if;
  return new;
end
$$;

drop trigger if exists invoices_commercial_document_event_trigger on public.invoices;
create trigger invoices_commercial_document_event_trigger
  after insert or update of commercial_status on public.invoices
  for each row execute function private.capture_commercial_document_event();

create or replace function public.record_commercial_document_event(
  p_document_id uuid,
  p_event_type text,
  p_payload jsonb default '{}'::jsonb
)
returns public.commercial_document_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice_row public.invoices;
begin
  select * into invoice_row from public.invoices where id = p_document_id;
  if not found then
    raise exception 'Commercial document not found' using errcode = 'P0002';
  end if;
  if not (select private.has_company_permission(invoice_row.company_id, 'sales_invoice.edit')) then
    raise exception 'Insufficient permission to record a document event' using errcode = '42501';
  end if;
  return private.insert_commercial_document_event(
    invoice_row.company_id, invoice_row.id, trim(p_event_type),
    null, invoice_row.commercial_status, coalesce(p_payload, '{}'::jsonb), clock_timestamp(), (select auth.uid())
  );
end
$$;

-- Independent configurable sequences. FINAL_INVOICE and SIMPLIFIED_INVOICE
-- deliberately use the invoice sequence by default because they are tax
-- invoices; their explicit document type remains separate from presentation.
create or replace function public.reserve_invoice_number(
  p_company_id uuid,
  p_document_type text default 'invoice',
  p_issue_date date default current_date
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_type text := lower(trim(coalesce(p_document_type, 'invoice')));
  sequence_key text;
  default_prefix text;
  period_key text := to_char(coalesce(p_issue_date, current_date), 'YYYY');
  sequence_row public.document_sequences%rowtype;
  max_existing bigint := 0;
  next_value bigint;
begin
  if p_company_id is null then
    raise exception 'A company is required to reserve a document number' using errcode = '22023';
  end if;

  if requested_type not in (
    'quote', 'proforma', 'sales_order', 'delivery_note', 'invoice',
    'advance_invoice', 'final_invoice', 'credit_note', 'debit_note',
    'simplified_invoice', 'fiscal_receipt', 'bad_debt_invoice',
    'offer', 'order'
  ) then
    raise exception 'Unsupported commercial document type %', requested_type using errcode = '22023';
  end if;

  requested_type := case requested_type
    when 'offer' then 'quote'
    when 'order' then 'sales_order'
    else requested_type
  end;
  sequence_key := case requested_type
    when 'final_invoice' then 'invoice'
    when 'simplified_invoice' then 'invoice'
    else requested_type
  end;
  default_prefix := case sequence_key
    when 'quote' then 'OF-'
    when 'proforma' then 'PRO-'
    when 'sales_order' then 'POR-'
    when 'delivery_note' then 'FD-'
    when 'invoice' then 'FAT-'
    when 'advance_invoice' then 'PAR-'
    when 'credit_note' then 'NK-'
    when 'debit_note' then 'ND-'
    when 'fiscal_receipt' then 'KUP-'
    when 'bad_debt_invoice' then 'BDI-'
    else 'DOC-'
  end;

  if not (
    (select private.has_company_permission(p_company_id, 'sales_invoice.create'))
    or (select private.has_company_permission(p_company_id, 'invoice.create'))
  ) then
    raise exception 'Insufficient permission to reserve a document number' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':' || sequence_key || ':' || period_key, 0));

  insert into public.document_sequences (
    company_id, branch_id, document_type, prefix, suffix, next_value,
    padding, reset_rule, current_period_key, is_active, created_by, updated_by
  ) values (
    p_company_id, null, 'operix_' || sequence_key, default_prefix, '', 1,
    6, 'fiscal_year', period_key, true, (select auth.uid()), (select auth.uid())
  ) on conflict do nothing;

  select * into sequence_row
  from public.document_sequences
  where company_id = p_company_id
    and branch_id is null
    and document_type = 'operix_' || sequence_key
    and is_active
  order by updated_at desc
  limit 1
  for update;

  if not found then
    raise exception 'Unable to initialize document numbering for company %', p_company_id using errcode = 'P0002';
  end if;

  select coalesce(max(nullif(substring(invoice_number from '([0-9]+)$'), '')::bigint), 0)
  into max_existing
  from public.invoices
  where company_id = p_company_id
    and case sequence_key
      when 'invoice' then commercial_document_type in ('INVOICE', 'FINAL_INVOICE', 'SIMPLIFIED_INVOICE')
      else commercial_document_type = upper(sequence_key)
    end
    and issue_date is not null
    and to_char(issue_date, 'YYYY') = period_key;

  next_value := case
    when sequence_row.current_period_key is distinct from period_key then greatest(1, max_existing + 1)
    else greatest(coalesce(sequence_row.next_value, 1), max_existing + 1)
  end;

  update public.document_sequences as document_sequence
  set next_value = document_sequence.next_value + 1,
      current_period_key = period_key,
      updated_at = clock_timestamp(),
      updated_by = (select auth.uid())
  where document_sequence.id = sequence_row.id;

  return coalesce(sequence_row.prefix, default_prefix)
    || period_key || '-'
    || lpad(next_value::text, greatest(1, coalesce(sequence_row.padding, 6)), '0')
    || coalesce(sequence_row.suffix, '');
end
$$;

create or replace function public.transition_commercial_document(
  p_document_id uuid,
  p_status text,
  p_event_type text default null
)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice_row public.invoices;
  next_status text := upper(trim(coalesce(p_status, '')));
begin
  select * into invoice_row from public.invoices where id = p_document_id for update;
  if not found then raise exception 'Commercial document not found' using errcode = 'P0002'; end if;
  if not (select private.has_company_permission(invoice_row.company_id, 'sales_invoice.edit')) then
    raise exception 'Insufficient permission to transition commercial documents' using errcode = '42501';
  end if;
  if invoice_row.accounting_state in ('posted', 'reversed') and next_status not in ('PAID', 'OVERDUE', 'CREDITED', 'PARTIALLY_CREDITED') then
    raise exception 'Posted financial documents must be corrected through a supported financial workflow' using errcode = '55000';
  end if;
  if next_status = '' then raise exception 'A document status is required' using errcode = '22023'; end if;

  update public.invoices
  set commercial_status = next_status,
      issued_at = case when next_status = 'ISSUED' then coalesce(issued_at, clock_timestamp()) else issued_at end,
      issued_by = case when next_status = 'ISSUED' then coalesce(issued_by, (select auth.uid())) else issued_by end,
      immutable_at = case when next_status in ('ISSUED', 'PAID', 'CREDITED', 'CORRECTED') then coalesce(immutable_at, clock_timestamp()) else immutable_at end
  where id = invoice_row.id
  returning * into invoice_row;

  perform private.insert_commercial_document_event(
    invoice_row.company_id, invoice_row.id, coalesce(nullif(trim(p_event_type), ''), lower(next_status)),
    null, next_status, '{}'::jsonb, clock_timestamp(), (select auth.uid())
  );
  return invoice_row;
end
$$;

create or replace function public.convert_commercial_document(
  p_source_document_id uuid,
  p_target_document_type text,
  p_idempotency_key uuid default gen_random_uuid()
)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_row public.invoices;
  target_row public.invoices;
  source_type text;
  target_type text := upper(trim(coalesce(p_target_document_type, '')));
  target_legacy_type text;
  target_subtype text;
  link_type text;
  target_number text;
  target_id uuid;
begin
  select * into source_row from public.invoices where id = p_source_document_id for update;
  if not found then raise exception 'Source commercial document not found' using errcode = 'P0002'; end if;
  if not (select private.has_company_permission(source_row.company_id, 'sales_invoice.edit')) then
    raise exception 'Insufficient permission to convert commercial documents' using errcode = '42501';
  end if;

  source_type := source_row.commercial_document_type;
  if target_type not in ('QUOTE','PROFORMA','SALES_ORDER','DELIVERY_NOTE','INVOICE','ADVANCE_INVOICE','FINAL_INVOICE','CREDIT_NOTE','DEBIT_NOTE','SIMPLIFIED_INVOICE','FISCAL_RECEIPT','BAD_DEBT_INVOICE') then
    raise exception 'Unsupported target commercial document type %', target_type using errcode = '22023';
  end if;

  if not ((source_type = 'QUOTE' and target_type in ('SALES_ORDER','INVOICE'))
       or (source_type = 'PROFORMA' and target_type in ('SALES_ORDER','INVOICE','ADVANCE_INVOICE'))
       or (source_type = 'SALES_ORDER' and target_type in ('DELIVERY_NOTE','INVOICE'))
       or (source_type = 'DELIVERY_NOTE' and target_type = 'INVOICE')
       or (source_type = 'ADVANCE_INVOICE' and target_type = 'FINAL_INVOICE')
       or (source_type in ('INVOICE','FINAL_INVOICE','SIMPLIFIED_INVOICE','FISCAL_RECEIPT','BAD_DEBT_INVOICE') and target_type in ('CREDIT_NOTE','DEBIT_NOTE'))) then
    raise exception 'Conversion from % to % is not supported', source_type, target_type using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(source_row.id::text || ':' || target_type, 0));

  select target.id into target_id
  from public.document_source_links link
  join public.invoices target on target.id = link.target_id
  where link.company_id = source_row.company_id
    and link.source_type = 'commercial_document'
    and link.source_id = source_row.id
    and link.target_type = 'commercial_document'
    and link.metadata ->> 'target_document_type' = upper(trim(coalesce(p_target_document_type, '')))
  limit 1;
  if target_id is not null then
    select * into target_row from public.invoices where id = target_id;
    return target_row;
  end if;

  target_number := public.reserve_invoice_number(source_row.company_id, lower(target_type), coalesce(source_row.issue_date, current_date));
  target_legacy_type := case when target_type = 'QUOTE' then 'offer' when target_type = 'PROFORMA' then 'proforma' when target_type = 'SALES_ORDER' then 'offer' else 'invoice' end;
  target_subtype := case target_type
    when 'QUOTE' then 'offer'
    when 'PROFORMA' then 'pro_invoice'
    when 'SALES_ORDER' then 'order'
    when 'DELIVERY_NOTE' then 'delivery_note'
    when 'ADVANCE_INVOICE' then 'advance_invoice'
    when 'FINAL_INVOICE' then 'final_invoice'
    when 'CREDIT_NOTE' then 'credit_note'
    when 'DEBIT_NOTE' then 'debit_note'
    when 'SIMPLIFIED_INVOICE' then 'simplified_invoice'
    when 'FISCAL_RECEIPT' then 'fiscal_receipt'
    when 'BAD_DEBT_INVOICE' then 'bad_debt_invoice'
    else 'regular'
  end;
  link_type := case
    when source_type = 'QUOTE' then 'quotation_conversion'
    when source_type = 'PROFORMA' and target_type = 'ADVANCE_INVOICE' then 'proforma_to_advance'
    when source_type = 'PROFORMA' then 'proforma_conversion'
    when source_type = 'SALES_ORDER' and target_type = 'DELIVERY_NOTE' then 'order_conversion'
    when source_type = 'DELIVERY_NOTE' then 'delivery_to_invoice'
    when source_type = 'ADVANCE_INVOICE' then 'advance_finalization'
    when target_type = 'CREDIT_NOTE' then 'credit_note'
    when target_type = 'DEBIT_NOTE' then 'debit_note'
    else 'adjustment'
  end;

  insert into public.invoices (
    user_id, company_id, client_id, invoice_number, issue_date, due_date, status,
    discount_amount, discount_percent, tax_amount, total_amount, notes, template_id,
    type, subtype, payment_method, amount_received, change_amount,
    currency, exchange_rate, source_document_type, source_document_id,
    credit_of_invoice_id, original_invoice_id, accounting_state,
    commercial_document_type, commercial_status, accounting_status, vat_status,
    inventory_status, payment_status, fiscalization_status, supply_date,
    order_date, delivery_date, valid_until, customer_po_number, delivery_address,
    shipping_address, payment_terms, delivery_terms, show_prices_on_delivery_note,
    advance_applied_amount, idempotency_key
  ) values (
    coalesce((select auth.uid()), source_row.user_id), source_row.company_id, source_row.client_id,
    target_number, coalesce(source_row.issue_date, current_date), source_row.due_date, 'draft',
    source_row.discount_amount, source_row.discount_percent, source_row.tax_amount,
    source_row.total_amount, source_row.notes, source_row.template_id, target_legacy_type,
    target_subtype, 'cash', 0, 0, source_row.currency, source_row.exchange_rate,
    source_type, source_row.id,
    case when target_type = 'CREDIT_NOTE' then source_row.id else null end,
    case when target_type in ('DEBIT_NOTE','BAD_DEBT_INVOICE') then source_row.id else null end,
    case when target_type in ('QUOTE','PROFORMA','SALES_ORDER','DELIVERY_NOTE') then 'legacy' else 'ready_for_posting' end,
    target_type, 'DRAFT', case when target_type in ('QUOTE','PROFORMA','SALES_ORDER','DELIVERY_NOTE') then 'NOT_APPLICABLE' else 'READY_TO_POST' end,
    case when target_type in ('QUOTE','PROFORMA','SALES_ORDER','DELIVERY_NOTE') then 'NOT_APPLICABLE' else 'NOT_EVALUATED' end,
    case when target_type in ('SALES_ORDER','DELIVERY_NOTE') then 'POLICY_DEPENDENT' else 'NOT_APPLICABLE' end,
    case when target_type in ('QUOTE','PROFORMA','SALES_ORDER','DELIVERY_NOTE') then 'NOT_APPLICABLE' else 'UNPAID' end,
    'NOT_REQUIRED', source_row.supply_date, source_row.order_date, source_row.delivery_date,
    source_row.valid_until, source_row.customer_po_number, source_row.delivery_address,
    source_row.shipping_address, source_row.payment_terms, source_row.delivery_terms,
    source_row.show_prices_on_delivery_note, 0, p_idempotency_key
  ) returning * into target_row;

  insert into public.invoice_items (
    invoice_id, product_id, description, quantity, unit_price, tax_rate, amount, unit,
    revenue_account_id, tax_code, cost_centre_id, project_id, source_item_id, credited_quantity
  )
  select target_row.id, item.product_id, item.description, item.quantity, item.unit_price,
    item.tax_rate, item.amount, item.unit, item.revenue_account_id, item.tax_code,
    item.cost_centre_id, item.project_id, item.id, 0
  from public.invoice_items item
  where item.invoice_id = source_row.id;

  insert into public.document_source_links (
    company_id, source_type, source_id, target_type, target_id, link_type, amount, metadata, created_by
  ) values (
    source_row.company_id, 'commercial_document', source_row.id, 'commercial_document', target_row.id,
    link_type, source_row.total_amount,
    jsonb_build_object('target_document_type', target_type, 'idempotency_key', p_idempotency_key),
    (select auth.uid())
  ) on conflict do nothing;

  perform private.insert_commercial_document_event(
    source_row.company_id, source_row.id, 'converted', source_row.commercial_status,
    'CONVERTED', jsonb_build_object('target_document_id', target_row.id, 'target_document_type', target_type),
    clock_timestamp(), (select auth.uid())
  );
  update public.invoices set commercial_status = 'CONVERTED' where id = source_row.id;
  return target_row;
end
$$;

revoke all on function private.insert_commercial_document_event(uuid, uuid, text, text, text, jsonb, timestamptz, uuid) from public;
revoke all on function private.capture_commercial_document_event() from public;
revoke all on function public.record_commercial_document_event(uuid, text, jsonb) from public, anon;
revoke all on function public.reserve_invoice_number(uuid, text, date) from public, anon;
revoke all on function public.transition_commercial_document(uuid, text, text) from public, anon;
revoke all on function public.convert_commercial_document(uuid, text, uuid) from public, anon;
grant execute on function public.record_commercial_document_event(uuid, text, jsonb) to authenticated;
grant execute on function public.reserve_invoice_number(uuid, text, date) to authenticated;
grant execute on function public.transition_commercial_document(uuid, text, text) to authenticated;
grant execute on function public.convert_commercial_document(uuid, text, uuid) to authenticated;

create or replace function public.apply_delivery_fulfillment(p_delivery_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery_row public.invoices;
  order_row public.invoices;
  delivery_item record;
  ordered_amount numeric(20,4);
  already_delivered numeric(20,4);
  next_delivered numeric(20,4);
  has_remaining boolean;
begin
  select * into delivery_row from public.invoices where id = p_delivery_id for update;
  if not found then raise exception 'Delivery note not found' using errcode = 'P0002'; end if;
  if delivery_row.commercial_document_type <> 'DELIVERY_NOTE' then
    raise exception 'Only delivery notes can apply fulfillment' using errcode = '22023';
  end if;
  if not (select private.has_company_permission(delivery_row.company_id, 'sales_invoice.edit')) then
    raise exception 'Insufficient permission to confirm delivery' using errcode = '42501';
  end if;
  if delivery_row.source_document_id is null then
    update public.invoices set commercial_status = 'DELIVERED' where id = delivery_row.id returning * into delivery_row;
    return delivery_row;
  end if;

  select * into order_row from public.invoices
  where id = delivery_row.source_document_id
    and company_id = delivery_row.company_id
    and commercial_document_type = 'SALES_ORDER'
  for update;
  if not found then raise exception 'The delivery note source is not a sales order' using errcode = '23514'; end if;

  for delivery_item in
    select item.* from public.invoice_items item where item.invoice_id = delivery_row.id for update
  loop
    if delivery_item.source_item_id is null then continue; end if;
    select quantity into ordered_amount from public.invoice_items where id = delivery_item.source_item_id and invoice_id = order_row.id for update;
    if ordered_amount is null then raise exception 'Delivery line is not linked to an order line' using errcode = '23514'; end if;
    select coalesce(sum(item.quantity), 0) into already_delivered
    from public.invoice_items item
    join public.invoices delivery on delivery.id = item.invoice_id
    where delivery.company_id = order_row.company_id
      and delivery.commercial_document_type = 'DELIVERY_NOTE'
      and delivery.source_document_id = order_row.id
      and delivery.id <> delivery_row.id
      and item.source_item_id = delivery_item.source_item_id;
    next_delivered := already_delivered + greatest(0, coalesce(delivery_item.quantity, 0));
    if next_delivered > ordered_amount then
      raise exception 'Delivered quantity exceeds ordered quantity for line %', delivery_item.source_item_id using errcode = '22003';
    end if;
    update public.invoice_items
    set ordered_quantity = ordered_amount,
        delivered_quantity = next_delivered,
        remaining_quantity = greatest(0, ordered_amount - next_delivered)
    where id = delivery_item.source_item_id;
    update public.invoice_items
    set ordered_quantity = ordered_amount,
        delivered_quantity = greatest(0, coalesce(delivery_item.quantity, 0)),
        remaining_quantity = greatest(0, ordered_amount - greatest(0, coalesce(delivery_item.quantity, 0)))
    where id = delivery_item.id;
  end loop;

  select exists (
    select 1 from public.invoice_items item
    where item.invoice_id = order_row.id and item.remaining_quantity > 0
  ) into has_remaining;
  update public.invoices
  set commercial_status = case when has_remaining then 'PARTIALLY_FULFILLED' else 'FULFILLED' end
  where id = order_row.id;
  update public.invoices
  set commercial_status = case when has_remaining then 'PARTIALLY_DELIVERED' else 'DELIVERED' end,
      delivery_date = coalesce(delivery_date, current_date)
  where id = delivery_row.id
  returning * into delivery_row;
  return delivery_row;
end
$$;

revoke all on function public.apply_delivery_fulfillment(uuid) from public, anon;
grant execute on function public.apply_delivery_fulfillment(uuid) to authenticated;
