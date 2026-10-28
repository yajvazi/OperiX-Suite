-- A credit note created from a sale represents a customer return. Posting it
-- must therefore reverse the sold quantity in the mobile stock ledger as well
-- as reversing the customer's receivable through the accounting journal.

create or replace function public.post_credit_note(
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
  journal_row public.journal_entries;
  net_amount numeric(20,4);
  credit_tax_amount numeric(20,4);
  gross_amount numeric(20,4);
  stock_row record;
  stock_before numeric;
begin
  select * into invoice_row from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Credit note not found' using errcode = 'P0002';
  end if;
  if not (select private.has_company_permission(invoice_row.company_id, 'sales_invoice.post')) then
    raise exception 'Insufficient permission to post credit notes' using errcode = '42501';
  end if;
  if invoice_row.credit_of_invoice_id is null
    and lower(coalesce(invoice_row.type, '')) <> 'credit_note'
    and lower(coalesce(invoice_row.subtype, '')) <> 'credit_note' then
    raise exception 'The document is not identified as a credit note' using errcode = '23514';
  end if;
  if invoice_row.accounting_state = 'posted' then
    if p_idempotency_key is null or invoice_row.idempotency_key = p_idempotency_key then
      return invoice_row;
    end if;
    raise exception 'Credit note has already been posted' using errcode = '55000';
  end if;
  if invoice_row.accounting_state <> 'ready_for_posting' then
    raise exception 'Credit note must be prepared before posting' using errcode = '55000';
  end if;

  select calculated.net_amount, calculated.tax_amount, calculated.gross_amount
  into net_amount, credit_tax_amount, gross_amount
  from private.sales_invoice_amounts(invoice_row.id) calculated;
  if gross_amount <= 0 then
    raise exception 'Credit note total must be greater than zero' using errcode = '23514';
  end if;

  journal_row := public.create_automatic_journal(
    invoice_row.company_id, 'credit_note', 'credit_note', invoice_row.id,
    invoice_row.invoice_number, coalesce(invoice_row.posting_date, invoice_row.issue_date, current_date),
    coalesce(invoice_row.issue_date, current_date), 'Credit note ' || invoice_row.invoice_number,
    jsonb_build_object('net', net_amount, 'tax', credit_tax_amount, 'gross', gross_amount),
    invoice_row.currency, invoice_row.branch_id,
    jsonb_build_object('invoice_number', invoice_row.invoice_number, 'client_id', invoice_row.client_id,
      'credited_invoice_id', invoice_row.credit_of_invoice_id)
  );

  perform set_config('app.financial_workflow', 'authorized', true);
  perform set_config('app.change_reason', coalesce(nullif(trim(p_reason), ''), 'Credit note posted'), true);
  update public.invoices
  set status = 'posted', accounting_state = 'posted',
      posting_date = coalesce(posting_date, issue_date, current_date),
      fiscal_year_id = (select fiscal_year_id from public.accounting_periods where id = journal_row.period_id),
      posted_at = clock_timestamp(), posted_by = (select auth.uid()),
      posting_journal_entry_id = journal_row.id,
      idempotency_key = coalesce(p_idempotency_key, idempotency_key),
      total_amount = gross_amount, tax_amount = credit_tax_amount
  where id = invoice_row.id
  returning * into invoice_row;
  perform set_config('app.financial_workflow', '', true);
  perform set_config('app.change_reason', '', true);

  -- The conversion copies the returned lines and keeps source_item_id on each
  -- line. Restore only products that were actually issued from stock on the
  -- original sale; non-stock products are intentionally unaffected.
  for stock_row in
    select item.product_id, sum(item.quantity) as quantity
    from public.invoice_items item
    where item.invoice_id = invoice_row.id
      and item.product_id is not null
      and exists (
        select 1
        from public.inventory_stock_movements issued
        where issued.invoice_id = invoice_row.credit_of_invoice_id
          and issued.product_id = item.product_id
          and issued.movement_type = 'invoice_issue'
      )
    group by item.product_id
  loop
    if invoice_row.branch_id is not null then
      select coalesce(stock.stock_quantity, 0) into stock_before
      from public.product_branch_stock stock
      where stock.company_id = invoice_row.company_id and stock.branch_id = invoice_row.branch_id and stock.product_id = stock_row.product_id
      for update;
      if found then
        update public.product_branch_stock set stock_quantity = stock_before + stock_row.quantity, updated_by = (select auth.uid()), updated_at = now() where company_id = invoice_row.company_id and branch_id = invoice_row.branch_id and product_id = stock_row.product_id;
        update public.products set stock_quantity = (select coalesce(sum(stock_quantity), 0) from public.product_branch_stock where company_id = invoice_row.company_id and product_id = stock_row.product_id) where id = stock_row.product_id;
      end if;
    else
      select coalesce(product.stock_quantity, 0) into stock_before from public.products product where product.id = stock_row.product_id for update;
      if found then update public.products set stock_quantity = stock_before + stock_row.quantity where id = stock_row.product_id; end if;
    end if;

    if found then

      insert into public.inventory_stock_movements (
        company_id, branch_id, product_id, invoice_id, movement_type, quantity_delta,
        stock_before, stock_after, created_by
      ) values (
        invoice_row.company_id, invoice_row.branch_id, stock_row.product_id, invoice_row.id, 'invoice_reversal',
        stock_row.quantity, stock_before, stock_before + stock_row.quantity, (select auth.uid())
      );
    end if;
  end loop;

  return invoice_row;
end
$$;

revoke all on function public.post_credit_note(uuid, uuid, text) from public;
grant execute on function public.post_credit_note(uuid, uuid, text) to authenticated;
