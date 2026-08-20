-- Keep the mobile invoice form compatible with databases that still use the
-- original invoice allocator. The mobile API sends canonical commercial
-- document types such as quote and sales_order.

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
    raise exception 'A company is required to reserve a document number'
      using errcode = '22023';
  end if;

  if requested_type not in (
    'quote', 'proforma', 'sales_order', 'delivery_note', 'invoice',
    'advance_invoice', 'final_invoice', 'credit_note', 'debit_note',
    'simplified_invoice', 'fiscal_receipt', 'bad_debt_invoice',
    'offer', 'order'
  ) then
    raise exception 'Unsupported commercial document type %', requested_type
      using errcode = '22023';
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

  -- Number reservation remains restricted to users who can create sales
  -- documents. Compatibility must not weaken tenant authorization.
  if not (
    (select private.has_company_permission(p_company_id, 'sales_invoice.create'))
    or (select private.has_company_permission(p_company_id, 'invoice.create'))
  ) then
    raise exception 'Insufficient permission to reserve a document number'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_company_id::text || ':' || sequence_key || ':' || period_key, 0)
  );

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
    raise exception 'Unable to initialize document numbering for company %', p_company_id
      using errcode = 'P0002';
  end if;

  -- Read existing legacy invoice fields while older rows are still present.
  select coalesce(max(
    nullif(substring(invoice.invoice_number from '([0-9]+)$'), '')::bigint
  ), 0)
  into max_existing
  from public.invoices invoice
  where invoice.company_id = p_company_id
    and invoice.issue_date is not null
    and to_char(invoice.issue_date, 'YYYY') = period_key
    and case sequence_key
      when 'quote' then lower(coalesce(invoice.type, '')) = 'offer'
        and lower(coalesce(invoice.subtype, '')) in ('offer', 'regular')
      when 'proforma' then lower(coalesce(invoice.type, '')) = 'proforma'
        or lower(coalesce(invoice.subtype, '')) in ('pro_invoice', 'proforma')
      when 'sales_order' then lower(coalesce(invoice.type, '')) = 'order'
        or lower(coalesce(invoice.subtype, '')) = 'order'
      when 'delivery_note' then lower(coalesce(invoice.subtype, '')) = 'delivery_note'
      when 'invoice' then lower(coalesce(invoice.type, 'invoice')) = 'invoice'
        and lower(coalesce(invoice.subtype, 'regular')) in ('regular', 'final_invoice', 'simplified_invoice')
      else lower(coalesce(invoice.subtype, '')) = sequence_key
    end;

  next_value := case
    when sequence_row.current_period_key is distinct from period_key
      then greatest(1, max_existing + 1)
    else greatest(coalesce(sequence_row.next_value, 1), max_existing + 1)
  end;

  update public.document_sequences as document_sequence
  set prefix = coalesce(sequence_row.prefix, default_prefix),
      suffix = coalesce(sequence_row.suffix, ''),
      next_value = document_sequence.next_value + 1,
      padding = greatest(1, coalesce(sequence_row.padding, 6)),
      reset_rule = 'fiscal_year',
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

revoke all on function public.reserve_invoice_number(uuid, text, date) from public, anon;
grant execute on function public.reserve_invoice_number(uuid, text, date) to authenticated;

comment on function public.reserve_invoice_number(uuid, text, date) is
  'Concurrency-safe document number allocator compatible with canonical commercial document types.';
