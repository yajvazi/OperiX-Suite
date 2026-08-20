-- Restrict invoice deletion to Admin and Super admin.
-- Draft line editing remains available to users with invoice-create access;
-- this protects deletion of the invoice record itself.

insert into public.app_permissions (code, name, category, description, is_sensitive)
values (
  'sales_invoice.delete',
  'Delete sales invoices',
  'sales',
  'Delete draft sales invoices.',
  true
)
on conflict (code) do update
set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  is_sensitive = excluded.is_sensitive;

insert into public.app_role_permissions (role_id, permission_code)
select role.id, 'sales_invoice.delete'
from public.app_roles role
where role.company_id is null
  and role.code in ('owner', 'super_administrator', 'company_administrator')
on conflict do nothing;

-- The legacy company-wide delete policy allowed any company member to delete
-- an invoice. Replace it with the permission-aware policy.
drop policy if exists invoices_company_delete on public.invoices;
drop policy if exists invoices_admin_delete on public.invoices;
create policy invoices_admin_delete
on public.invoices
for delete to authenticated
using (
  (select private.has_company_permission(company_id, 'sales_invoice.delete'))
);

create or replace function private.prevent_non_admin_invoice_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.company_id is null
     or not coalesce(private.has_company_permission(old.company_id, 'sales_invoice.delete'), false) then
    raise exception 'Only company administrators can delete invoices'
      using errcode = '42501';
  end if;
  return old;
end;
$$;

revoke all on function private.prevent_non_admin_invoice_delete() from public, anon, authenticated;

drop trigger if exists invoices_admin_delete_guard on public.invoices;
create trigger invoices_admin_delete_guard
before delete on public.invoices
for each row execute function private.prevent_non_admin_invoice_delete();

-- Use one guarded operation from clients so line items and the invoice are
-- removed together. Posted or commercially immutable documents still require
-- the existing correction/reversal workflow, even for an administrator.
create or replace function public.delete_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  invoice_row public.invoices%rowtype;
  document_status text;
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

  document_status := upper(coalesce(invoice_row.commercial_status, invoice_row.status::text, ''));
  if coalesce(invoice_row.accounting_state, 'legacy') in ('posted', 'reversed', 'opening_balance')
     or document_status in ('ISSUED', 'PAID', 'OVERDUE', 'CREDITED', 'PARTIALLY_CREDITED', 'CORRECTED', 'CANCELLED') then
    raise exception 'Posted or issued invoices cannot be deleted; use a correction or reversal workflow'
      using errcode = '55000';
  end if;

  delete from public.invoice_items
  where invoice_id = invoice_row.id;

  delete from public.invoices
  where id = invoice_row.id;
end;
$$;

revoke all on function public.delete_invoice(uuid) from public, anon;
grant execute on function public.delete_invoice(uuid) to authenticated;

comment on function public.delete_invoice(uuid) is
  'Deletes a draft sales invoice only for an owner or company administrator.';

notify pgrst, 'reload schema';
