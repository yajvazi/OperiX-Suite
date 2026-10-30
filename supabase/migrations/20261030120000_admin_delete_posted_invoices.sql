-- Company administrators can delete invoices that were already posted.
--
-- public.delete_invoice already reverses the posting journal, restores stock, detaches payments and archives
-- the document history, but the guard trigger private.rbac_invoice_delete_guard still stopped it for anyone
-- who is not a platform admin. The guard now also accepts the controlled delete workflow, and only when the
-- caller holds sales_invoice.delete. Declared Sales Book invoices, fiscal receipts and stock-tracked invoices
-- keep their own protections (other triggers and delete_invoice checks), so they still cannot be deleted.
--
-- public.admin_delete_invoice wraps delete_invoice: a written reason is required and a full snapshot of the
-- invoice and its lines is stored in audit_events before the delete, in the same transaction.

create or replace function private.rbac_invoice_delete_guard()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if coalesce((select auth.jwt() ->> 'role'), '') = 'service_role'
     or private.rbac_is_platform_admin() then
    return old;
  end if;
  -- Controlled admin workflow: public.delete_invoice sets this flag after its own permission and safety checks.
  if coalesce(current_setting('app.invoice_delete_workflow', true), '') = 'authorized'
     and old.company_id is not null
     and coalesce(private.has_company_permission(old.company_id, 'sales_invoice.delete'), false) then
    return old;
  end if;
  if lower(coalesce(old.accounting_state, 'legacy')) not in ('legacy','ready_for_posting')
     or upper(coalesce(old.commercial_status, old.status::text, 'DRAFT')) <> 'DRAFT' then
    raise exception 'Finalized financial documents cannot be deleted; use a correction or reversal workflow' using errcode = '55000';
  end if;
  if not private.rbac_can_read_resource(old.company_id, 'invoice', old.user_id, old.assigned_user_id, 'invoice.delete_draft') then
    raise exception 'Draft-delete permission and data scope are required' using errcode = '42501';
  end if;
  return old;
end;
$$;

create or replace function public.admin_delete_invoice(p_invoice_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  actor_id uuid := (select auth.uid());
  invoice_row public.invoices%rowtype;
  items_snapshot jsonb;
  reason_text text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if reason_text is null or char_length(reason_text) < 3 then
    raise exception 'A reason of at least 3 characters is required to delete an invoice' using errcode = '23514';
  end if;

  select * into invoice_row from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;
  if invoice_row.company_id is null
     or not coalesce(private.has_company_permission(invoice_row.company_id, 'sales_invoice.delete'), false) then
    raise exception 'Only company administrators can delete invoices' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(item) order by item.id), '[]'::jsonb)
  into items_snapshot
  from public.invoice_items item
  where item.invoice_id = invoice_row.id;

  insert into public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, entity_key, previous_values, reason, occurred_at)
  values (
    invoice_row.company_id, actor_id, 'invoice.deleted_by_admin', 'invoice', invoice_row.id, invoice_row.invoice_number,
    jsonb_build_object('invoice', to_jsonb(invoice_row), 'items', items_snapshot),
    reason_text, clock_timestamp()
  );

  perform public.delete_invoice(p_invoice_id);
end;
$$;

revoke all on function public.admin_delete_invoice(uuid, text) from public, anon;
grant execute on function public.admin_delete_invoice(uuid, text) to authenticated;
