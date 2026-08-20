-- Add the controlled invoice edit/delete commands used by the mobile client.
--
-- Posted invoices are not edited in place: their journal is reversed, the
-- invoice is returned to a draft state, and the canonical save/post command
-- creates the replacement journal. Legacy ordinary invoices are normalized
-- through the same save/post path. Deleting an invoice removes the source
-- document from the sales/tax-book views while retaining the journal
-- reversal, archive record, and deletion audit trail.

-- Commercial-document events normally remain append-only and reference the
-- invoice with ON DELETE RESTRICT. A requested invoice deletion must still
-- be able to remove the source row, so preserve those events in a tombstone
-- archive before removing the live document.
create table if not exists public.commercial_document_event_archive (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete restrict,
  document_id uuid not null,
  event_type text not null,
  from_status text,
  to_status text,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null,
  actor_id uuid references auth.users(id) on delete set null,
  deleted_at timestamptz not null default clock_timestamp(),
  deleted_by uuid references auth.users(id) on delete set null
);

create index if not exists commercial_document_event_archive_document_idx
  on public.commercial_document_event_archive (company_id, document_id, occurred_at desc);

revoke all on public.commercial_document_event_archive from public, anon, authenticated;

create or replace function private.prevent_stock_invoice_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.inventory_stock_movements movement
    where movement.invoice_id = old.id
  )
  and coalesce(current_setting('app.invoice_delete_workflow', true), '') <> 'authorized' then
    raise exception 'Stock-tracked invoices cannot be deleted before a stock return is recorded'
      using errcode = '55000';
  end if;
  return old;
end;
$$;

create or replace function private.prevent_stock_invoice_item_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_invoice_id uuid;
begin
  target_invoice_id := case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end;
  if exists (
    select 1
    from public.inventory_stock_movements movement
    where movement.invoice_id = target_invoice_id
  )
  and coalesce(current_setting('app.invoice_delete_workflow', true), '') <> 'authorized' then
    raise exception 'Stock-tracked invoice lines cannot be edited after checkout'
      using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.prevent_stock_invoice_delete() from public, authenticated;
revoke all on function private.prevent_stock_invoice_item_mutation() from public, authenticated;

create or replace function public.replace_posted_invoice_document(
  p_invoice jsonb,
  p_items jsonb,
  p_invoice_id uuid,
  p_idempotency_key uuid default null
)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  invoice_row public.invoices;
  journal_row public.journal_entries;
  saved_invoice public.invoices;
  active_allocated numeric(20,4) := 0;
  replacement_payload jsonb;
  legacy_client_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_invoice_id is null then
    raise exception 'Invoice id is required' using errcode = '23514';
  end if;
  if jsonb_typeof(coalesce(p_invoice, '{}'::jsonb)) <> 'object' then
    raise exception 'Invoice payload must be an object' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'At least one invoice item is required' using errcode = '22023';
  end if;

  select *
  into invoice_row
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;
  if invoice_row.company_id is null
     or not coalesce(private.has_company_permission(invoice_row.company_id, 'sales_invoice.edit'), false)
     or not coalesce(private.has_company_permission(invoice_row.company_id, 'journal.reverse'), false) then
    raise exception 'Insufficient permission to edit posted invoices' using errcode = '42501';
  end if;
  if upper(coalesce(invoice_row.commercial_document_type, '')) <> 'INVOICE' then
    raise exception 'Only ordinary sales invoices can be edited after posting; use a correction workflow'
      using errcode = '55000';
  end if;
  if lower(coalesce(invoice_row.accounting_state, 'legacy')) not in ('posted', 'legacy') then
    raise exception 'This invoice is already reversed or excluded and cannot be edited'
      using errcode = '55000';
  end if;
  if lower(coalesce(invoice_row.accounting_state, 'legacy')) = 'posted'
     and invoice_row.posting_journal_entry_id is null then
    raise exception 'The posted invoice has no posting journal and cannot be edited'
      using errcode = '55000';
  end if;
  if lower(coalesce(invoice_row.accounting_state, 'legacy')) = 'legacy'
     and invoice_row.posting_journal_entry_id is not null then
    raise exception 'The legacy invoice has an unexpected posting journal'
      using errcode = '55000';
  end if;
  if lower(coalesce(invoice_row.accounting_state, 'legacy')) = 'legacy'
     and invoice_row.client_id is not null
     and exists (
       select 1
       from public.clients client_row
       where client_row.id = invoice_row.client_id
         and client_row.user_id = actor_id
         and client_row.company_id is not null
         and not private.company_is_in_scope(invoice_row.company_id, client_row.company_id)
     )
     and nullif(trim(coalesce(p_invoice ->> 'client_id', '')), '')::uuid is not distinct from invoice_row.client_id then
    -- Some legacy imports point at a customer owned by the same user but
    -- stored under a different legacy company. Preserve that relationship;
    -- the canonical writer is temporarily given a null customer only while it
    -- validates and posts the replacement journal.
    legacy_client_id := invoice_row.client_id;
  end if;
  if exists (
    select 1
    from public.inventory_stock_movements movement
    where movement.invoice_id = invoice_row.id
  ) then
    raise exception 'Stock-tracked invoices must be corrected with a stock return before editing'
      using errcode = '55000';
  end if;
  if exists (
    select 1
    from public.pos_orders order_row
    where order_row.invoice_id = invoice_row.id
  ) then
    raise exception 'POS invoices must be corrected through the POS return workflow'
      using errcode = '55000';
  end if;
  if exists (
    select 1
    from public.commercial_document_advance_allocations allocation
    where allocation.advance_invoice_id = invoice_row.id
       or allocation.final_invoice_id = invoice_row.id
  ) then
    raise exception 'Invoices used in an advance reconciliation require a correction workflow'
      using errcode = '55000';
  end if;
  if exists (
    select 1
    from public.document_source_links link
    where link.source_id = invoice_row.id
       or link.target_id = invoice_row.id
  ) then
    raise exception 'Converted or linked invoices require a correction workflow'
      using errcode = '55000';
  end if;

  select round(coalesce(sum(allocation.allocated_amount), 0), 4)
  into active_allocated
  from public.payment_allocations allocation
  where allocation.invoice_id = invoice_row.id
    and allocation.status = 'active';

  if active_allocated > 0
     and nullif(trim(coalesce(p_invoice ->> 'client_id', '')), '')::uuid is distinct from invoice_row.client_id then
    raise exception 'A paid invoice cannot change customer while payments are allocated'
      using errcode = '55000';
  end if;

  if lower(coalesce(invoice_row.accounting_state, 'legacy')) = 'posted' then
    select *
    into journal_row
    from public.journal_entries
    where id = invoice_row.posting_journal_entry_id
    for update;
    if not found or journal_row.status <> 'posted' then
      raise exception 'The invoice posting journal is not available for replacement'
        using errcode = '55000';
    end if;

    perform public.reverse_journal_entry(
      journal_row.id,
      coalesce(invoice_row.posting_date, invoice_row.issue_date, current_date),
      'Invoice edited from the mobile invoice workflow'
    );

    -- Free the automatic-journal source key for the replacement posting while
    -- retaining the reversed journal as the audit trail for the old version.
    perform set_config('app.financial_workflow', 'authorized', true);
    update public.journal_entries
    set source_type = coalesce(source_type, 'sales_invoice') || '_replaced_' || left(id::text, 8),
        source_key = coalesce(source_key, entry_number) || ':replaced:' || id::text,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'replaced_by', actor_id,
          'replaced_at', clock_timestamp(),
          'invoice_id', invoice_row.id
        )
    where id = journal_row.id;
  end if;

  update public.invoices
  set status = 'draft',
      commercial_status = 'DRAFT',
      accounting_state = 'ready_for_posting',
      accounting_status = 'READY_TO_POST',
      vat_status = 'NOT_EVALUATED',
      payment_status = 'UNPAID',
      posting_journal_entry_id = null,
      posted_at = null,
      posted_by = null,
      issued_at = null,
      issued_by = null,
      immutable_at = null
  where id = invoice_row.id;
  perform set_config('app.financial_workflow', '', true);

  replacement_payload := coalesce(p_invoice, '{}'::jsonb) || jsonb_build_object(
    'user_id', actor_id,
    'status', 'draft',
    'commercial_status', 'DRAFT',
    'accounting_state', 'ready_for_posting',
    'accounting_status', 'READY_TO_POST',
    'vat_status', 'NOT_EVALUATED',
    'payment_status', 'UNPAID'
  );
  if legacy_client_id is not null then
    replacement_payload := jsonb_set(replacement_payload, '{client_id}', 'null'::jsonb, true);
  end if;
  saved_invoice := public.save_invoice_document(
    replacement_payload,
    p_items,
    invoice_row.id,
    true,
    p_idempotency_key
  );

  if legacy_client_id is not null then
    perform set_config('app.financial_workflow', 'authorized', true);
    update public.invoices
    set client_id = legacy_client_id
    where id = saved_invoice.id
    returning * into saved_invoice;
    perform set_config('app.financial_workflow', '', true);
  end if;

  if active_allocated > round(coalesce(saved_invoice.total_amount, 0), 4) then
    raise exception 'The edited invoice total cannot be lower than allocated payments'
      using errcode = '22003';
  end if;
  if active_allocated > 0 then
    saved_invoice := private.refresh_customer_payment_state(saved_invoice.id);
  end if;
  return saved_invoice;
end;
$$;

revoke all on function public.replace_posted_invoice_document(jsonb, jsonb, uuid, uuid) from public, anon;
grant execute on function public.replace_posted_invoice_document(jsonb, jsonb, uuid, uuid) to authenticated;

comment on function public.replace_posted_invoice_document(jsonb, jsonb, uuid, uuid) is
  'Edits a posted or legacy ordinary sales invoice atomically; posted journals are reversed and the revised invoice is reposted.';

create or replace function public.delete_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  invoice_row public.invoices%rowtype;
  journal_row public.journal_entries%rowtype;
  stock_row public.inventory_stock_movements%rowtype;
  payment_id uuid;
  payment_ids uuid[] := '{}';
  stock_before numeric;
  journal_is_draft boolean := false;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_invoice_id is null then
    raise exception 'Invoice id is required' using errcode = '23514';
  end if;

  select *
  into invoice_row
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;
  if invoice_row.company_id is null
     or not coalesce(private.has_company_permission(invoice_row.company_id, 'sales_invoice.delete'), false) then
    raise exception 'Only company administrators can delete invoices'
      using errcode = '42501';
  end if;
  if lower(coalesce(invoice_row.accounting_state, 'legacy')) = 'opening_balance' then
    raise exception 'Opening-balance invoices cannot be deleted'
      using errcode = '55000';
  end if;
  if exists (
    select 1
    from public.invoices child
    where child.credit_of_invoice_id = invoice_row.id
       or child.original_invoice_id = invoice_row.id
       or child.reversal_of_invoice_id = invoice_row.id
  ) then
    raise exception 'This invoice is referenced by another document and cannot be deleted'
      using errcode = '55000';
  end if;
  if exists (
    select 1
    from public.commercial_document_advance_allocations allocation
    where allocation.advance_invoice_id = invoice_row.id
       or allocation.final_invoice_id = invoice_row.id
  ) then
    raise exception 'Invoices used in an advance reconciliation require a correction workflow'
      using errcode = '55000';
  end if;
  if exists (
    select 1
    from public.pos_orders order_row
    where order_row.invoice_id = invoice_row.id
  ) then
    raise exception 'POS invoices must be reversed through the POS return workflow'
      using errcode = '55000';
  end if;
  if exists (
    select 1
    from public.inventory_movements movement
    where movement.source_id = invoice_row.id
      and movement.source_type in ('sales_invoice', 'pos_invoice')
  ) then
    raise exception 'Inventory-ledger invoices require an inventory reversal workflow'
      using errcode = '55000';
  end if;
  if exists (
    select 1
    from public.withholding_transactions transaction_row
    where transaction_row.source_id = invoice_row.id
  ) then
    raise exception 'Invoices referenced by withholding records require a correction workflow'
      using errcode = '55000';
  end if;

  select array_agg(distinct allocation.payment_id)
  into payment_ids
  from public.payment_allocations allocation
  where allocation.invoice_id = invoice_row.id;

  if invoice_row.posting_journal_entry_id is not null then
    select *
    into journal_row
    from public.journal_entries
    where id = invoice_row.posting_journal_entry_id
    for update;

    if found and journal_row.status = 'posted' then
      perform public.reverse_journal_entry(
        journal_row.id,
        coalesce(invoice_row.posting_date, invoice_row.issue_date, current_date),
        'Invoice deleted from the invoice workflow'
      );
    elsif found and journal_row.status = 'draft' then
      journal_is_draft := true;
    elsif found and journal_row.status not in ('reversed') then
      raise exception 'The invoice posting journal cannot be deleted in its current state'
        using errcode = '55000';
    end if;
  end if;

  -- Restore stock before the invoice foreign key is cleared. The original
  -- stock issue remains as history and the compensating movement has no
  -- invoice reference because the source document is being removed.
  for stock_row in
    select movement.*
    from public.inventory_stock_movements movement
    where movement.invoice_id = invoice_row.id
    order by movement.created_at, movement.id
    for update
  loop
    select coalesce(product.stock_quantity, 0)
    into stock_before
    from public.products product
    where product.id = stock_row.product_id
    for update;

    if found then
      update public.products
      set stock_quantity = stock_before - stock_row.quantity_delta
      where id = stock_row.product_id;

      insert into public.inventory_stock_movements (
        company_id, product_id, invoice_id, movement_type, quantity_delta,
        stock_before, stock_after, created_by
      ) values (
        invoice_row.company_id, stock_row.product_id, null, 'invoice_reversal',
        -stock_row.quantity_delta, stock_before, stock_before - stock_row.quantity_delta, actor_id
      );
    end if;
  end loop;

  -- Allocations cannot survive a hard delete because invoice_id is required.
  -- The payment itself remains posted and becomes unallocated/partially
  -- allocated, so the cash/bank book is not silently removed.
  delete from public.payment_allocations
  where invoice_id = invoice_row.id;
  if payment_ids is not null then
    foreach payment_id in array payment_ids loop
      perform private.refresh_customer_payment_allocation_state(payment_id);
    end loop;
  end if;

  delete from public.commercial_document_payment_links
  where document_id = invoice_row.id;

  delete from public.document_source_links
  where source_id = invoice_row.id
     or target_id = invoice_row.id;

  delete from public.approval_actions
  where workflow_id in (
    select workflow.id
    from public.approval_workflows workflow
    where workflow.company_id = invoice_row.company_id
      and workflow.entity_type = 'sales_invoice'
      and workflow.entity_id = invoice_row.id
  );
  delete from public.approval_workflows
  where company_id = invoice_row.company_id
    and entity_type = 'sales_invoice'
    and entity_id = invoice_row.id;

  update public.financial_document_attachments
  set deleted_at = clock_timestamp(), deleted_by = actor_id
  where company_id = invoice_row.company_id
    and document_id = invoice_row.id
    and deleted_at is null;

  update public.document_archive
  set status = 'deleted'
  where company_id = invoice_row.company_id
    and source_id = invoice_row.id
    and status = 'active';

  delete from public.domain_outbox_events
  where company_id = invoice_row.company_id
    and aggregate_id = invoice_row.id
    and aggregate_type in ('sales_invoice', 'commercial_document');

  insert into public.commercial_document_event_archive (
    id, company_id, document_id, event_type, from_status, to_status,
    payload, occurred_at, actor_id, deleted_by
  )
  select event.id, event.company_id, event.document_id, event.event_type,
    event.from_status, event.to_status, event.payload, event.occurred_at,
    event.actor_id, (select auth.uid())
  from public.commercial_document_events event
  where event.document_id = invoice_row.id
  on conflict (id) do nothing;

  perform set_config('app.financial_workflow', 'authorized', true);
  perform set_config('app.invoice_delete_workflow', 'authorized', true);
  perform set_config('app.commercial_document_events_workflow', 'authorized', true);

  delete from public.commercial_document_events
  where document_id = invoice_row.id;

  update public.invoices
  set posting_journal_entry_id = null
  where id = invoice_row.id;

  delete from public.invoice_items
  where invoice_id = invoice_row.id;

  delete from public.invoices
  where id = invoice_row.id;

  if journal_is_draft and journal_row.id is not null then
    delete from public.journal_entries
    where id = journal_row.id;
  end if;

  perform set_config('app.invoice_delete_workflow', '', true);
  perform set_config('app.financial_workflow', '', true);
  perform set_config('app.commercial_document_events_workflow', '', true);
end;
$$;

revoke all on function public.delete_invoice(uuid) from public, anon;
grant execute on function public.delete_invoice(uuid) to authenticated;

comment on function public.delete_invoice(uuid) is
  'Deletes an authorized sales invoice and its derived book source; posted journals are reversed and payments remain as unallocated cash/bank records.';

notify pgrst, 'reload schema';
