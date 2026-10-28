-- Final scope guard for document-specific creation and supplier references.

begin;

create or replace function private.rbac_invoice_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  document_type text := upper(coalesce(new.commercial_document_type, new.type, 'INVOICE'));
  old_status text := upper(coalesce(old.commercial_status, old.status::text, 'DRAFT'));
  new_status text := upper(coalesce(new.commercial_status, new.status::text, 'DRAFT'));
  server_request boolean := coalesce((select auth.jwt() ->> 'role'), '') = 'service_role';
  actor_permission text;
  create_permission text;
begin
  if server_request or private.rbac_is_platform_admin() then return new; end if;
  if new.company_id is null then return new; end if;

  create_permission := case document_type
    when 'QUOTE' then 'offer.create'
    when 'PROFORMA' then 'proforma.create'
    when 'SALES_ORDER' then 'order.create'
    when 'DELIVERY_NOTE' then 'delivery_note.create'
    when 'CREDIT_NOTE' then 'invoice.credit'
    when 'DEBIT_NOTE' then 'invoice.debit'
    else 'invoice.create'
  end;
  if tg_op = 'INSERT'
     and not private.rbac_can_read_resource(new.company_id, 'invoice', new.user_id, new.assigned_user_id, create_permission) then
    raise exception 'Document create permission or data scope is required' using errcode = '42501';
  end if;

  if document_type in ('CREDIT_NOTE','CREDIT') then
    actor_permission := 'invoice.credit';
  elsif document_type in ('DEBIT_NOTE','DEBIT') then
    actor_permission := 'invoice.debit';
  else
    actor_permission := 'invoice.edit';
  end if;
  if document_type in ('CREDIT_NOTE','CREDIT','DEBIT_NOTE','DEBIT')
     and not private.rbac_can_read_resource(new.company_id, 'invoice', coalesce(old.user_id, new.user_id), coalesce(old.assigned_user_id, new.assigned_user_id), actor_permission) then
    raise exception 'Correction-document permission or data scope is required' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE'
     and new.commercial_status = 'CONVERTED'
     and old.commercial_status is distinct from new.commercial_status
     and not private.rbac_can_read_resource(old.company_id, 'invoice', old.user_id, old.assigned_user_id, 'invoice.edit') then
    raise exception 'Source-document data scope is required for conversion' using errcode = '42501';
  end if;
  if new_status in ('ISSUED','POSTED','FINALIZED','APPROVED')
     and old_status is distinct from new_status
     and not private.rbac_can_read_resource(new.company_id, 'invoice', coalesce(old.user_id, new.user_id), coalesce(old.assigned_user_id, new.assigned_user_id), 'invoice.issue') then
    raise exception 'Invoice issue permission or data scope is required' using errcode = '42501';
  end if;
  if new_status in ('CANCELLED','VOID','VOIDED','REVERSED')
     and old_status is distinct from new_status
     and not private.rbac_can_read_resource(new.company_id, 'invoice', coalesce(old.user_id, new.user_id), coalesce(old.assigned_user_id, new.assigned_user_id), 'invoice.void') then
    raise exception 'Invoice void permission or data scope is required' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.rbac_supplier_related_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  vendor_company uuid;
begin
  if coalesce((select auth.jwt() ->> 'role'), '') = 'service_role'
     or private.rbac_is_platform_admin() then
    return new;
  end if;
  if tg_table_name in ('supplier_bills', 'vendor_payments') and new.vendor_id is not null then
    select vendor.company_id into vendor_company
    from public.vendors vendor
    where vendor.id = new.vendor_id;
    if vendor_company is null or vendor_company is distinct from new.company_id then
      raise exception 'Supplier record must belong to the same tenant' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists rbac_supplier_bills_related_guard on public.supplier_bills;
create trigger rbac_supplier_bills_related_guard
before insert or update on public.supplier_bills
for each row execute function private.rbac_supplier_related_guard();

drop trigger if exists rbac_vendor_payments_related_guard on public.vendor_payments;
create trigger rbac_vendor_payments_related_guard
before insert or update on public.vendor_payments
for each row execute function private.rbac_supplier_related_guard();

commit;
