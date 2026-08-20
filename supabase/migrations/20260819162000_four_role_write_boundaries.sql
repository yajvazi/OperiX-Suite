-- Close legacy tenant-member policies that predate the four-role model.
-- Employee is allowed to create commercial documents only; all other writes
-- must go through a role permission.

begin;

insert into public.app_permissions (code, name, category, description, is_sensitive)
values
  ('contracts.manage', 'Manage contracts', 'sales', 'Create, edit, and remove contracts and contract templates.', true),
  ('invoice_templates.manage', 'Manage invoice templates', 'sales', 'Create, edit, and remove invoice templates.', true)
on conflict (code) do update
set name = excluded.name,
    category = excluded.category,
    description = excluded.description,
    is_sensitive = excluded.is_sensitive;

insert into public.app_role_permissions (role_id, permission_code)
select role.id, permission.code
from public.app_roles role
cross join (values ('contracts.manage'), ('invoice_templates.manage')) as permission(code)
where role.company_id is null
  and role.code in ('owner', 'super_administrator', 'company_administrator', 'manager')
on conflict do nothing;

-- SECURITY DEFINER document helpers must not become an Employee edit API.
-- The normal create wrapper marks its transaction; the auxiliary helpers
-- mark their own draft-only update. Other invoice-mutating RPCs are rejected
-- by this trigger for Employee sessions.
create or replace function private.prevent_employee_invoice_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.company_id is not null
     and public.get_my_company_role(old.company_id) = 'employee'
     and coalesce(current_setting('app.document_create_workflow', true), '') <> 'authorized'
     and coalesce(current_setting('app.invoice_auxiliary_workflow', true), '') <> 'authorized'
     and not (
       coalesce(current_setting('app.financial_workflow', true), '') = 'authorized'
       and old.user_id = (select auth.uid())
     ) then
    raise exception 'Employees can create documents but cannot edit existing invoices'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_employee_invoice_mutation() from public, anon, authenticated;

drop trigger if exists invoices_employee_mutation_guard on public.invoices;
create trigger invoices_employee_mutation_guard
before update on public.invoices
for each row execute function private.prevent_employee_invoice_mutation();

create or replace function public.save_invoice_document(
  p_invoice jsonb,
  p_items jsonb,
  p_invoice_id uuid default null,
  p_post_invoice boolean default false,
  p_idempotency_key uuid default null
)
returns public.invoices
language plpgsql security definer set search_path = ''
as $$
declare
  target_company_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_invoice_id is not null then
    select invoice.company_id into target_company_id
    from public.invoices invoice
    where invoice.id = p_invoice_id;
    if target_company_id is null
       or not private.has_company_permission(target_company_id, 'sales_invoice.edit') then
      raise exception 'Insufficient permission to edit sales invoices' using errcode = '42501';
    end if;
  else
    perform set_config('app.document_create_workflow', 'authorized', true);
  end if;
  return public.save_invoice_document_unchecked(p_invoice, p_items, p_invoice_id, p_post_invoice, p_idempotency_key);
end;
$$;

revoke all on function public.save_invoice_document(jsonb, jsonb, uuid, boolean, uuid) from public, anon;
grant execute on function public.save_invoice_document(jsonb, jsonb, uuid, boolean, uuid) to authenticated;

create or replace function public.set_invoice_product_pictures(
  p_invoice_id uuid,
  p_show_product_pictures boolean
)
returns public.invoices
language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  invoice_row public.invoices;
  allowed boolean;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into invoice_row from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;
  allowed := invoice_row.company_id is null and invoice_row.user_id = actor_id;
  if not allowed and invoice_row.company_id is not null then
    allowed := public.can_access_company(invoice_row.company_id)
      and (
        coalesce(private.has_company_permission(invoice_row.company_id, 'sales_invoice.edit'), false)
        or (
          public.get_my_company_role(invoice_row.company_id) = 'employee'
          and invoice_row.user_id = actor_id
          and upper(coalesce(invoice_row.commercial_status, invoice_row.status::text, 'DRAFT')) = 'DRAFT'
        )
      );
  end if;
  if not allowed then
    raise exception 'Insufficient permission to update invoice display settings' using errcode = '42501';
  end if;
  perform set_config('app.invoice_auxiliary_workflow', 'authorized', true);
  update public.invoices
  set show_product_pictures = coalesce(p_show_product_pictures, false)
  where id = p_invoice_id
  returning * into invoice_row;
  return invoice_row;
end;
$$;

revoke all on function public.set_invoice_product_pictures(uuid, boolean) from public, anon;
grant execute on function public.set_invoice_product_pictures(uuid, boolean) to authenticated;

create or replace function public.set_invoice_delivery_details(
  p_invoice_id uuid,
  p_delivery_method text default null,
  p_pickup_branch_id uuid default null,
  p_delivery_details text default null
)
returns public.invoices
language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  invoice_row public.invoices;
  branch_row public.branches;
  normalized_method text := nullif(lower(trim(coalesce(p_delivery_method, ''))), '');
  normalized_details text := nullif(trim(coalesce(p_delivery_details, '')), '');
  normalized_branch_id uuid := p_pickup_branch_id;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;
  select * into invoice_row from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;
  if invoice_row.company_id is null or not public.can_access_company(invoice_row.company_id) then
    raise exception 'Invoice belongs to another company' using errcode = '42501';
  end if;
  if not (
    coalesce(private.has_company_permission(invoice_row.company_id, 'sales_invoice.edit'), false)
    or (
      public.get_my_company_role(invoice_row.company_id) = 'employee'
      and invoice_row.user_id = actor_id
      and upper(coalesce(invoice_row.commercial_status, invoice_row.status::text, 'DRAFT')) = 'DRAFT'
    )
  ) then
    raise exception 'Insufficient permission to edit invoice details' using errcode = '42501';
  end if;
  if normalized_method is not null
     and normalized_method not in ('pickup', 'delivery', 'bus', 'other') then
    raise exception 'Unsupported delivery method' using errcode = '22023';
  end if;
  if normalized_branch_id is not null then
    select * into branch_row
    from public.branches
    where id = normalized_branch_id and company_id = invoice_row.company_id;
    if not found then
      raise exception 'Pickup store belongs to another company' using errcode = '42501';
    end if;
    if normalized_method = 'pickup' then
      normalized_details := nullif(trim(concat_ws(', ', branch_row.name, branch_row.registered_address, branch_row.municipality)), '');
    end if;
  end if;
  if normalized_method is distinct from 'pickup' then
    normalized_branch_id := null;
  end if;
  perform set_config('app.invoice_auxiliary_workflow', 'authorized', true);
  update public.invoices
  set delivery_method = normalized_method,
      pickup_branch_id = normalized_branch_id,
      delivery_details = normalized_details
  where id = p_invoice_id
  returning * into invoice_row;
  return invoice_row;
end;
$$;

revoke all on function public.set_invoice_delivery_details(uuid, text, uuid, text) from public, anon;
grant execute on function public.set_invoice_delivery_details(uuid, text, uuid, text) to authenticated;

drop policy if exists contracts_company_insert on public.contracts;
drop policy if exists contracts_company_update on public.contracts;
drop policy if exists contracts_company_delete on public.contracts;
create policy contracts_role_insert on public.contracts for insert to authenticated
with check (company_id is not null and user_id = (select auth.uid()) and private.has_company_permission(company_id, 'contracts.manage'));
create policy contracts_role_update on public.contracts for update to authenticated
using (company_id is not null and private.has_company_permission(company_id, 'contracts.manage'))
with check (company_id is not null and private.has_company_permission(company_id, 'contracts.manage'));
create policy contracts_role_delete on public.contracts for delete to authenticated
using (company_id is not null and private.has_company_permission(company_id, 'contracts.manage'));

-- Compliance, templates, product-import, booking, supplier, and vendor writes
-- previously trusted membership alone. They now require their domain role.
drop policy if exists "Users can insert compliances for their company" on public.compliances;
drop policy if exists "Users can update compliances for their company" on public.compliances;
drop policy if exists "Users can delete compliances for their company" on public.compliances;
create policy compliances_manage_insert on public.compliances for insert to authenticated
with check (private.has_company_permission(company_id, 'compliance.manage'));
create policy compliances_manage_update on public.compliances for update to authenticated
using (private.has_company_permission(company_id, 'compliance.manage'))
with check (private.has_company_permission(company_id, 'compliance.manage'));
create policy compliances_manage_delete on public.compliances for delete to authenticated
using (private.has_company_permission(company_id, 'compliance.manage'));

drop policy if exists contract_templates_insert on public.contract_templates;
drop policy if exists contract_templates_update on public.contract_templates;
drop policy if exists contract_templates_delete on public.contract_templates;
drop policy if exists "Users can insert their own templates" on public.contract_templates;
drop policy if exists "Users can update their own templates" on public.contract_templates;
drop policy if exists "Users can delete their own templates" on public.contract_templates;
create policy contract_templates_manage_insert on public.contract_templates for insert to authenticated
with check (user_id = (select auth.uid()) and private.has_unscoped_permission('contracts.manage'));
create policy contract_templates_manage_update on public.contract_templates for update to authenticated
using (user_id = (select auth.uid()) and private.has_unscoped_permission('contracts.manage'))
with check (user_id = (select auth.uid()) and private.has_unscoped_permission('contracts.manage'));
create policy contract_templates_manage_delete on public.contract_templates for delete to authenticated
using (user_id = (select auth.uid()) and private.has_unscoped_permission('contracts.manage'));

drop policy if exists invoice_templates_insert on public.invoice_templates;
drop policy if exists invoice_templates_update on public.invoice_templates;
drop policy if exists invoice_templates_delete on public.invoice_templates;
drop policy if exists "Users can create own templates" on public.invoice_templates;
drop policy if exists "Users can update own templates" on public.invoice_templates;
drop policy if exists "Users can delete own templates" on public.invoice_templates;
create policy invoice_templates_manage_insert on public.invoice_templates for insert to authenticated
with check (user_id = (select auth.uid()) and private.has_unscoped_permission('invoice_templates.manage'));
create policy invoice_templates_manage_update on public.invoice_templates for update to authenticated
using (user_id = (select auth.uid()) and private.has_unscoped_permission('invoice_templates.manage'))
with check (user_id = (select auth.uid()) and private.has_unscoped_permission('invoice_templates.manage'));
create policy invoice_templates_manage_delete on public.invoice_templates for delete to authenticated
using (user_id = (select auth.uid()) and private.has_unscoped_permission('invoice_templates.manage'));

drop policy if exists product_import_batches_insert on public.product_import_batches;
drop policy if exists product_import_batches_update on public.product_import_batches;
drop policy if exists product_import_batches_delete on public.product_import_batches;
drop policy if exists product_import_items_insert on public.product_import_items;
drop policy if exists product_import_items_update on public.product_import_items;
drop policy if exists product_import_items_delete on public.product_import_items;
create policy product_import_batches_manage_insert on public.product_import_batches for insert to authenticated
with check (user_id = (select auth.uid()) and company_id is not null and private.has_company_permission(company_id, 'products.manage'));
create policy product_import_batches_manage_update on public.product_import_batches for update to authenticated
using (company_id is not null and private.has_company_permission(company_id, 'products.manage'))
with check (company_id is not null and private.has_company_permission(company_id, 'products.manage'));
create policy product_import_batches_manage_delete on public.product_import_batches for delete to authenticated
using (company_id is not null and private.has_company_permission(company_id, 'products.manage'));
create policy product_import_items_manage_insert on public.product_import_items for insert to authenticated
with check (company_id is not null and private.has_company_permission(company_id, 'products.manage'));
create policy product_import_items_manage_update on public.product_import_items for update to authenticated
using (company_id is not null and private.has_company_permission(company_id, 'products.manage'))
with check (company_id is not null and private.has_company_permission(company_id, 'products.manage'));
create policy product_import_items_manage_delete on public.product_import_items for delete to authenticated
using (company_id is not null and private.has_company_permission(company_id, 'products.manage'));

drop policy if exists operix_desk_reservations_insert on public.reservations;
drop policy if exists operix_desk_reservations_update on public.reservations;
drop policy if exists operix_desk_reservations_delete on public.reservations;
create policy operix_desk_reservations_role_insert on public.reservations for insert to authenticated
with check (company_id is not null and private.has_company_permission(company_id::uuid, 'booking.create'));
create policy operix_desk_reservations_role_update on public.reservations for update to authenticated
using (company_id is not null and private.has_company_permission(company_id::uuid, 'booking.update'))
with check (company_id is not null and private.has_company_permission(company_id::uuid, 'booking.update'));
create policy operix_desk_reservations_role_delete on public.reservations for delete to authenticated
using (company_id is not null and private.has_company_permission(company_id::uuid, 'booking.cancel'));

drop policy if exists vendors_company_insert on public.vendors;
drop policy if exists vendors_company_update on public.vendors;
drop policy if exists vendors_company_delete on public.vendors;
create policy vendors_role_insert on public.vendors for insert to authenticated
with check (company_id is not null and user_id = (select auth.uid()) and private.has_company_permission(company_id, 'supplier_bill.post'));
create policy vendors_role_update on public.vendors for update to authenticated
using (company_id is not null and private.has_company_permission(company_id, 'supplier_bill.post'))
with check (company_id is not null and private.has_company_permission(company_id, 'supplier_bill.post'));
create policy vendors_role_delete on public.vendors for delete to authenticated
using (company_id is not null and private.has_company_permission(company_id, 'supplier_bill.post'));

drop policy if exists vendor_payments_company_insert on public.vendor_payments;
drop policy if exists vendor_payments_company_update on public.vendor_payments;
drop policy if exists vendor_payments_company_delete on public.vendor_payments;
create policy vendor_payments_role_insert on public.vendor_payments for insert to authenticated
with check (company_id is not null and user_id = (select auth.uid()) and private.has_company_permission(company_id, 'supplier_payment.record'));
create policy vendor_payments_role_update on public.vendor_payments for update to authenticated
using (company_id is not null and private.has_company_permission(company_id, 'supplier_payment.record'))
with check (company_id is not null and private.has_company_permission(company_id, 'supplier_payment.record'));
create policy vendor_payments_role_delete on public.vendor_payments for delete to authenticated
using (company_id is not null and private.has_company_permission(company_id, 'supplier_payment.reverse'));

drop policy if exists supplier_bills_company_insert on public.supplier_bills;
drop policy if exists supplier_bills_company_update on public.supplier_bills;
drop policy if exists supplier_bills_company_delete on public.supplier_bills;
create policy supplier_bills_role_insert on public.supplier_bills for insert to authenticated
with check (company_id is not null and user_id = (select auth.uid()) and private.has_company_permission(company_id, 'supplier_bill.post'));
create policy supplier_bills_role_update on public.supplier_bills for update to authenticated
using (company_id is not null and private.has_company_permission(company_id, 'supplier_bill.post'))
with check (company_id is not null and private.has_company_permission(company_id, 'supplier_bill.post'));
create policy supplier_bills_role_delete on public.supplier_bills for delete to authenticated
using (company_id is not null and private.has_company_permission(company_id, 'supplier_bill.post'));

drop policy if exists supplier_bill_items_company_insert on public.supplier_bill_items;
drop policy if exists supplier_bill_items_company_update on public.supplier_bill_items;
drop policy if exists supplier_bill_items_company_delete on public.supplier_bill_items;
create policy supplier_bill_items_role_insert on public.supplier_bill_items for insert to authenticated
with check (exists (select 1 from public.supplier_bills bill where bill.id = bill_id and bill.company_id is not null and private.has_company_permission(bill.company_id, 'supplier_bill.post')));
create policy supplier_bill_items_role_update on public.supplier_bill_items for update to authenticated
using (exists (select 1 from public.supplier_bills bill where bill.id = bill_id and bill.company_id is not null and private.has_company_permission(bill.company_id, 'supplier_bill.post')))
with check (exists (select 1 from public.supplier_bills bill where bill.id = bill_id and bill.company_id is not null and private.has_company_permission(bill.company_id, 'supplier_bill.post')));
create policy supplier_bill_items_role_delete on public.supplier_bill_items for delete to authenticated
using (exists (select 1 from public.supplier_bills bill where bill.id = bill_id and bill.company_id is not null and private.has_company_permission(bill.company_id, 'supplier_bill.post')));

drop policy if exists commercial_document_settings_insert on public.commercial_document_settings;
drop policy if exists commercial_document_settings_update on public.commercial_document_settings;
create policy commercial_document_settings_edit_insert on public.commercial_document_settings for insert to authenticated
with check (private.has_company_permission(company_id, 'sales_invoice.edit') or private.has_company_permission(company_id, 'company.manage'));
create policy commercial_document_settings_edit_update on public.commercial_document_settings for update to authenticated
using (private.has_company_permission(company_id, 'sales_invoice.edit') or private.has_company_permission(company_id, 'company.manage'))
with check (private.has_company_permission(company_id, 'sales_invoice.edit') or private.has_company_permission(company_id, 'company.manage'));

notify pgrst, 'reload schema';
commit;
