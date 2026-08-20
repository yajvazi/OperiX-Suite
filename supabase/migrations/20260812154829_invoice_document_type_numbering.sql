-- Extend the database allocator to the existing non-posting document flows.
-- InvoiceFormScreen uses the same form for invoice, quote, proforma, and order.

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
  document_type text := lower(trim(coalesce(p_document_type, 'invoice')));
  sequence_type text;
  invoice_prefix text;
  period_key text := to_char(coalesce(p_issue_date, current_date), 'YYYY');
  sequence_row public.document_sequences%rowtype;
  max_existing bigint := 0;
  next_value bigint;
begin
  if p_company_id is null then
    raise exception 'A company is required to reserve an invoice number'
      using errcode = '22023';
  end if;

  if document_type not in ('invoice', 'offer', 'proforma', 'order') then
    raise exception 'Unsupported document type %', document_type
      using errcode = '22023';
  end if;

  if not (
    (select private.has_company_permission(p_company_id, 'sales_invoice.create'))
    or (select private.has_company_permission(p_company_id, 'invoice.create'))
  ) then
    raise exception 'Insufficient permission to reserve an invoice number'
      using errcode = '42501';
  end if;

  sequence_type := 'operix_' || document_type;
  invoice_prefix := case document_type
    when 'offer' then 'OFF'
    when 'proforma' then 'PRO'
    when 'order' then 'ORD'
    else 'INV'
  end;

  perform pg_advisory_xact_lock(
    hashtextextended(p_company_id::text || ':' || sequence_type || ':' || period_key, 0)
  );

  select coalesce(max(
    nullif(
      substring(invoice.invoice_number from (
        '^' || invoice_prefix || '-' || period_key || '-([0-9]+)$'
      )),
      ''
    )::bigint
  ), 0)
  into max_existing
  from public.invoices invoice
  where invoice.company_id = p_company_id
    and lower(coalesce(invoice.type, 'invoice')) = document_type;

  insert into public.document_sequences (
    company_id, branch_id, document_type, prefix, suffix, next_value,
    padding, reset_rule, current_period_key, is_active, created_by, updated_by
  )
  values (
    p_company_id, null, sequence_type, invoice_prefix || '-', '', greatest(1, max_existing + 1),
    4, 'fiscal_year', period_key, true, (select auth.uid()), (select auth.uid())
  )
  on conflict do nothing;

  select *
  into sequence_row
  from public.document_sequences as document_sequence
  where document_sequence.company_id = p_company_id
    and document_sequence.branch_id is null
    and document_sequence.document_type = sequence_type
    and document_sequence.is_active
  order by document_sequence.updated_at desc
  limit 1
  for update;

  if not found then
    raise exception 'Unable to initialize invoice numbering for company %', p_company_id
      using errcode = 'P0002';
  end if;

  next_value := case
    when sequence_row.current_period_key is distinct from period_key
      then greatest(1, max_existing + 1)
    else greatest(coalesce(sequence_row.next_value, 1), max_existing + 1)
  end;

  update public.document_sequences as document_sequence
  set prefix = invoice_prefix || '-',
      suffix = '',
      next_value = document_sequence.next_value + 1,
      padding = 4,
      reset_rule = 'fiscal_year',
      current_period_key = period_key,
      updated_at = clock_timestamp(),
      updated_by = (select auth.uid())
  where document_sequence.id = sequence_row.id;

  return invoice_prefix || '-' || period_key || '-' || lpad(next_value::text, 4, '0');
end
$$;
