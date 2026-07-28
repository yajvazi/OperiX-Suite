-- Phase C2 follow-up: PostgreSQL requires qualified fields when a function
-- return column has the same name as a PL/pgSQL variable.
-- Keep this forward-only so environments that already applied C2 are safe.

create or replace function public.post_sales_invoice(
  p_invoice_id uuid,
  p_idempotency_key uuid default null,
  p_reason text default null
)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice_row public.invoices;
  client_row public.clients;
  period_row public.accounting_periods;
  journal_row public.journal_entries;
  net_amount numeric(20,4);
  vat_amount numeric(20,4);
  gross_amount numeric(20,4);
  item_count integer;
begin
  select * into invoice_row from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;
  if not (select private.has_company_permission(invoice_row.company_id, 'sales_invoice.post')) then
    raise exception 'Insufficient permission to post sales invoices' using errcode = '42501';
  end if;

  if invoice_row.accounting_state = 'posted' then
    if p_idempotency_key is not null and invoice_row.idempotency_key = p_idempotency_key then
      return invoice_row;
    end if;
    raise exception 'Invoice has already been posted' using errcode = '55000';
  end if;
  if invoice_row.accounting_state <> 'ready_for_posting' then
    raise exception 'Invoice must be prepared before posting' using errcode = '55000';
  end if;
  if invoice_row.status not in ('draft', 'approved') then
    raise exception 'Invoice status is not eligible for posting' using errcode = '55000';
  end if;
  if invoice_row.approval_status = 'pending' or invoice_row.approval_status = 'rejected' then
    raise exception 'Invoice approval state is not eligible for posting' using errcode = '55000';
  end if;
  if invoice_row.client_id is null then
    raise exception 'A customer is required before posting a sales invoice' using errcode = '23514';
  end if;

  select * into client_row
  from public.clients
  where id = invoice_row.client_id and company_id = invoice_row.company_id;
  if not found then
    raise exception 'Invoice customer is invalid for this company' using errcode = '23514';
  end if;
  if client_row.sales_blocked or client_row.account_status in ('on_hold', 'closed') then
    raise exception 'Sales are blocked for this customer' using errcode = '55000';
  end if;

  select * into period_row
  from public.accounting_periods
  where company_id = invoice_row.company_id
    and coalesce(invoice_row.posting_date, invoice_row.issue_date, current_date) between start_date and end_date
    and status = 'open'
  order by start_date desc
  limit 1
  for update;
  if not found then
    raise exception 'No open accounting period covers the invoice posting date' using errcode = '55000';
  end if;

  select count(*) into item_count from public.invoice_items where invoice_id = invoice_row.id;
  if item_count = 0 then
    raise exception 'A sales invoice requires at least one line item' using errcode = '23514';
  end if;
  if exists (
    select 1
    from public.invoice_items item
    where item.invoice_id = invoice_row.id
      and (
        coalesce(item.quantity, 0) <= 0
        or coalesce(item.amount, 0) < 0
        or coalesce(item.tax_rate, 0) < 0
        or coalesce(item.tax_rate, 0) > 100
        or coalesce(item.discount, 0) < 0
        or coalesce(item.discount, 0) > 100
      )
  ) then
    raise exception 'Invoice contains invalid quantity, amount, discount, or VAT values' using errcode = '23514';
  end if;

  select calculated.net_amount, calculated.tax_amount, calculated.gross_amount
  into net_amount, vat_amount, gross_amount
  from private.sales_invoice_amounts(invoice_row.id) as calculated;
  if gross_amount <= 0 then
    raise exception 'Invoice total must be greater than zero' using errcode = '23514';
  end if;

  journal_row := public.create_automatic_journal(
    invoice_row.company_id,
    'sales_invoice',
    'sales_invoice',
    invoice_row.id,
    invoice_row.invoice_number,
    coalesce(invoice_row.posting_date, invoice_row.issue_date, current_date),
    coalesce(invoice_row.issue_date, current_date),
    'Sales invoice ' || invoice_row.invoice_number,
    jsonb_build_object('net', net_amount, 'tax', vat_amount, 'gross', gross_amount),
    invoice_row.currency,
    invoice_row.branch_id,
    jsonb_build_object('invoice_number', invoice_row.invoice_number, 'client_id', invoice_row.client_id)
  );

  perform set_config('app.financial_workflow', 'authorized', true);
  perform set_config('app.change_reason', coalesce(nullif(trim(p_reason), ''), 'Sales invoice posted'), true);
  update public.invoices
  set status = 'posted',
      accounting_state = 'posted',
      posting_date = coalesce(posting_date, issue_date, current_date),
      fiscal_year_id = period_row.fiscal_year_id,
      posted_at = clock_timestamp(),
      posted_by = (select auth.uid()),
      posting_journal_entry_id = journal_row.id,
      idempotency_key = coalesce(p_idempotency_key, idempotency_key),
      total_amount = gross_amount,
      tax_amount = vat_amount
  where id = invoice_row.id
  returning * into invoice_row;
  perform set_config('app.financial_workflow', '', true);
  perform set_config('app.change_reason', '', true);

  perform private.emit_domain_outbox_event(
    invoice_row.company_id, invoice_row.branch_id, 'sales_invoice', invoice_row.id,
    'sales_invoice.posted',
    jsonb_build_object('invoice_number', invoice_row.invoice_number, 'journal_entry_id', journal_row.id, 'gross_amount', gross_amount),
    'sales_invoice.posted:' || invoice_row.id::text
  );
  return invoice_row;
end
$$;

revoke all on function public.post_sales_invoice(uuid, uuid, text) from public;
grant execute on function public.post_sales_invoice(uuid, uuid, text) to authenticated;
