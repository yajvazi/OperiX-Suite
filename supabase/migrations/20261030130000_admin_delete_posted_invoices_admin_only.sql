-- Tighten 20261030120000: only company administrators (and platform admins) may delete a posted invoice.
--
-- The permission name sales_invoice.delete is treated by the permission system as the same as invoice.delete_draft,
-- so anyone who was only allowed to delete DRAFTS would otherwise pass the check. Posted-invoice deletion now also
-- requires the company_administrator role.

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
     and private.rbac_role_code(old.company_id) = 'company_administrator'
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
     or not (
       private.rbac_is_platform_admin()
       or (
         private.rbac_role_code(invoice_row.company_id) = 'company_administrator'
         and coalesce(private.has_company_permission(invoice_row.company_id, 'sales_invoice.delete'), false)
       )
     ) then
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
