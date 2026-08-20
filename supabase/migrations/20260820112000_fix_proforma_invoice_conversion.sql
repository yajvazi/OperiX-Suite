-- Fix the proforma-to-invoice conversion lookup.
-- The previous function compared a link column and a PL/pgSQL variable with
-- the same name, which PostgreSQL rejected as an ambiguous reference.

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

  source_type := upper(coalesce(source_row.commercial_document_type, ''));
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

revoke all on function public.convert_commercial_document(uuid, text, uuid) from public, anon;
grant execute on function public.convert_commercial_document(uuid, text, uuid) to authenticated;
