-- Company administrators can edit a posted invoice that issued stock.
--
-- public.replace_posted_invoice_document refuses these invoices ("must be corrected with a stock return before
-- editing"). This wrapper does the correction as one atomic step: it returns the old quantities to stock, detaches
-- the old stock movements from the invoice (history is kept, with a note), replaces the invoice through the normal
-- posted-invoice workflow (which reverses and re-posts the accounting entries), then issues stock for the new lines
-- with the same rules as checkout (including branch stock and the "not enough stock" check). If any step fails
-- nothing is changed. A snapshot of the invoice before the correction is stored in audit_events.

create or replace function public.admin_correct_stock_invoice(
  p_invoice jsonb,
  p_items jsonb,
  p_invoice_id uuid,
  p_reason text,
  p_idempotency_key uuid default null
)
returns public.invoices
language plpgsql
security definer
set search_path to ''
as $$
declare
  actor_id uuid := (select auth.uid());
  invoice_row public.invoices%rowtype;
  result_invoice public.invoices;
  items_snapshot jsonb;
  reason_text text := nullif(trim(coalesce(p_reason, '')), '');
  stock_row record;
  item_record record;
  product_row public.products;
  branch_stock public.product_branch_stock;
  stock_before numeric;
  issue_branch_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if reason_text is null or char_length(reason_text) < 3 then
    raise exception 'A reason of at least 3 characters is required to correct an invoice' using errcode = '23514';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'At least one invoice item is required' using errcode = '22023';
  end if;

  select * into invoice_row from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;
  if invoice_row.company_id is null
     or not (
       private.rbac_is_platform_admin()
       or (
         private.rbac_role_code(invoice_row.company_id) = 'company_administrator'
         and coalesce(private.has_company_permission(invoice_row.company_id, 'sales_invoice.edit'), false)
       )
     ) then
    raise exception 'Only company administrators can correct posted invoices' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb) into items_snapshot
  from public.invoice_items item where item.invoice_id = invoice_row.id;

  -- 1) Return the quantities this invoice took out of stock (net of anything already returned).
  for stock_row in
    select movement.product_id, movement.branch_id, -sum(movement.quantity_delta) as quantity
    from public.inventory_stock_movements movement
    where movement.invoice_id = invoice_row.id and movement.product_id is not null
    group by movement.product_id, movement.branch_id
    having sum(movement.quantity_delta) < 0
  loop
    stock_before := null;
    if stock_row.branch_id is not null then
      select * into branch_stock from public.product_branch_stock
      where company_id = invoice_row.company_id and branch_id = stock_row.branch_id and product_id = stock_row.product_id
      for update;
      if found then
        stock_before := branch_stock.stock_quantity;
        update public.product_branch_stock set stock_quantity = stock_before + stock_row.quantity, updated_by = actor_id, updated_at = now()
        where id = branch_stock.id;
        update public.products set stock_quantity = (select coalesce(sum(stock_quantity), 0) from public.product_branch_stock where company_id = invoice_row.company_id and product_id = stock_row.product_id)
        where id = stock_row.product_id;
      end if;
    end if;
    if stock_before is null then
      select coalesce(product.stock_quantity, 0) into stock_before from public.products product where product.id = stock_row.product_id for update;
      if found then
        update public.products set stock_quantity = stock_before + stock_row.quantity where id = stock_row.product_id;
      else
        continue; -- the product no longer exists; there is nothing to return to
      end if;
    end if;
    insert into public.inventory_stock_movements (company_id, branch_id, product_id, invoice_id, movement_type, quantity_delta, stock_before, stock_after, created_by, note)
    values (invoice_row.company_id, stock_row.branch_id, stock_row.product_id, invoice_row.id, 'invoice_reversal',
            stock_row.quantity, stock_before, stock_before + stock_row.quantity, actor_id,
            'Returned for admin correction of ' || coalesce(invoice_row.invoice_number, ''));
  end loop;

  -- 2) Detach the old movements so the invoice can be replaced. The rows and their quantities stay as history.
  update public.inventory_stock_movements
  set invoice_id = null,
      note = trim(both ' ' from coalesce(note, '') || ' [was on invoice ' || coalesce(invoice_row.invoice_number, '') || ', corrected by admin]')
  where invoice_id = invoice_row.id;

  -- 3) Replace the invoice through the normal posted-invoice workflow (reverses and re-posts the journal).
  result_invoice := public.replace_posted_invoice_document(p_invoice, p_items, p_invoice_id, p_idempotency_key);

  -- 4) Issue stock for the new lines with the same rules as checkout.
  issue_branch_id := coalesce(nullif(p_invoice ->> 'branch_id', '')::uuid, result_invoice.branch_id);
  for item_record in
    select item.product_id, sum(item.quantity) as quantity
    from jsonb_to_recordset(p_items) as item(product_id uuid, quantity numeric)
    where item.product_id is not null
    group by item.product_id
  loop
    select * into product_row from public.products where id = item_record.product_id for update;
    if not found or not coalesce(product_row.track_stock, false) then
      continue;
    end if;
    if issue_branch_id is not null then
      select * into branch_stock from public.product_branch_stock
      where company_id = result_invoice.company_id and branch_id = issue_branch_id and product_id = product_row.id for update;
      if not found then
        if exists (select 1 from public.product_branch_stock where company_id = result_invoice.company_id and product_id = product_row.id) then
          raise exception 'No stock is configured for "%" in the selected branch', product_row.name using errcode = '22003';
        end if;
        if coalesce(product_row.stock_quantity, 0) < item_record.quantity then
          raise exception 'Not enough stock for "%". Available: %, requested: %', product_row.name, product_row.stock_quantity, item_record.quantity using errcode = '22003';
        end if;
        stock_before := product_row.stock_quantity;
        update public.products set stock_quantity = stock_before - item_record.quantity where id = product_row.id;
      else
        if coalesce(branch_stock.stock_quantity, 0) < item_record.quantity then
          raise exception 'Not enough stock for "%" in the selected branch. Available: %, requested: %', product_row.name, branch_stock.stock_quantity, item_record.quantity using errcode = '22003';
        end if;
        stock_before := branch_stock.stock_quantity;
        update public.product_branch_stock set stock_quantity = stock_before - item_record.quantity, updated_by = actor_id, updated_at = now() where id = branch_stock.id;
        update public.products set stock_quantity = (select coalesce(sum(stock_quantity), 0) from public.product_branch_stock where company_id = result_invoice.company_id and product_id = product_row.id) where id = product_row.id;
      end if;
    else
      if coalesce(product_row.stock_quantity, 0) < item_record.quantity then
        raise exception 'Not enough stock for "%". Available: %, requested: %', product_row.name, product_row.stock_quantity, item_record.quantity using errcode = '22003';
      end if;
      stock_before := product_row.stock_quantity;
      update public.products set stock_quantity = stock_before - item_record.quantity where id = product_row.id;
    end if;
    insert into public.inventory_stock_movements (company_id, branch_id, product_id, invoice_id, movement_type, quantity_delta, stock_before, stock_after, created_by)
    values (result_invoice.company_id, issue_branch_id, product_row.id, result_invoice.id, 'invoice_issue', -item_record.quantity, stock_before, stock_before - item_record.quantity, actor_id);
  end loop;

  insert into public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, entity_key, previous_values, new_values, reason, occurred_at)
  values (
    invoice_row.company_id, actor_id, 'invoice.corrected_by_admin', 'invoice', invoice_row.id, invoice_row.invoice_number,
    jsonb_build_object('invoice', to_jsonb(invoice_row), 'items', items_snapshot),
    jsonb_build_object('invoice', p_invoice, 'items', p_items),
    reason_text, clock_timestamp()
  );

  return result_invoice;
end;
$$;

revoke all on function public.admin_correct_stock_invoice(jsonb, jsonb, uuid, text, uuid) from public, anon;
grant execute on function public.admin_correct_stock_invoice(jsonb, jsonb, uuid, text, uuid) to authenticated;
