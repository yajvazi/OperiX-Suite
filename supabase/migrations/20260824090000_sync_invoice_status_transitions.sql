-- Keep the legacy invoice status and the canonical commercial status aligned
-- when a document is changed from the mobile/web transition action.

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
  previous_status text;
begin
  select * into invoice_row
  from public.invoices
  where id = p_document_id
  for update;

  if not found then
    raise exception 'Commercial document not found' using errcode = 'P0002';
  end if;

  if not (select private.has_company_permission(invoice_row.company_id, 'sales_invoice.edit')) then
    raise exception 'Insufficient permission to transition commercial documents' using errcode = '42501';
  end if;

  if next_status = '' then
    raise exception 'A document status is required' using errcode = '22023';
  end if;

  previous_status := invoice_row.commercial_status;

  if invoice_row.accounting_state in ('posted', 'reversed')
     and next_status not in ('PAID', 'OVERDUE', 'CREDITED', 'PARTIALLY_CREDITED') then
    raise exception 'Posted financial documents must be corrected through a supported financial workflow' using errcode = '55000';
  end if;

  update public.invoices
  set commercial_status = next_status,
      -- `status` remains the compatibility field used by older list/report
      -- screens. Canonical states that have no legacy equivalent keep the
      -- current value instead of corrupting the enum.
      status = case next_status
        when 'DRAFT' then 'draft'::public.invoice_status
        when 'SENT' then 'sent'::public.invoice_status
        when 'ISSUED' then 'sent'::public.invoice_status
        when 'VIEWED' then 'sent'::public.invoice_status
        when 'PAID' then 'paid'::public.invoice_status
        when 'PARTIALLY_PAID' then 'partially_paid'::public.invoice_status
        when 'OVERDUE' then 'overdue'::public.invoice_status
        when 'CANCELLED' then 'cancelled'::public.invoice_status
        when 'CREDITED' then 'credited'::public.invoice_status
        when 'REVERSED' then 'reversed'::public.invoice_status
        else status
      end,
      issued_at = case when next_status = 'ISSUED' then coalesce(issued_at, clock_timestamp()) else issued_at end,
      issued_by = case when next_status = 'ISSUED' then coalesce(issued_by, (select auth.uid())) else issued_by end,
      immutable_at = case when next_status in ('ISSUED', 'PAID', 'CREDITED', 'CORRECTED') then coalesce(immutable_at, clock_timestamp()) else immutable_at end
  where id = invoice_row.id
  returning * into invoice_row;

  perform private.insert_commercial_document_event(
    invoice_row.company_id,
    invoice_row.id,
    coalesce(nullif(trim(p_event_type), ''), lower(next_status)),
    previous_status,
    next_status,
    '{}'::jsonb,
    clock_timestamp(),
    (select auth.uid())
  );

  return invoice_row;
end
$$;

revoke all on function public.transition_commercial_document(uuid, text, text) from public, anon;
grant execute on function public.transition_commercial_document(uuid, text, text) to authenticated;
