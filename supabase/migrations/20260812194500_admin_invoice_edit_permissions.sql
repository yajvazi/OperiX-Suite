-- Make draft invoice editing explicit in the permission model.
-- sales_invoice.create already represents creating and editing drafts for
-- operational roles; this dedicated permission makes administrator access
-- visible and keeps the RLS policy intentional.

insert into public.app_permissions (code, name, category, description, is_sensitive)
values (
  'sales_invoice.edit',
  'Edit sales invoices',
  'sales',
  'Edit draft sales invoices.',
  true
)
on conflict (code) do update
set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  is_sensitive = excluded.is_sensitive;

insert into public.app_role_permissions (role_id, permission_code)
select role.id, 'sales_invoice.edit'
from public.app_roles role
where role.company_id is null
  and role.code in ('owner', 'super_administrator', 'company_administrator')
on conflict do nothing;

-- The old policies allowed any company member to replace an invoice or its
-- lines. Keep sales roles that already have sales_invoice.create working, and
-- explicitly include administrators through sales_invoice.edit.
drop policy if exists invoices_company_update on public.invoices;
drop policy if exists invoices_editor_update on public.invoices;
create policy invoices_editor_update
on public.invoices
for update to authenticated
using (
  (
    (select auth.uid()) = user_id
    and company_id is null
  )
  or (select private.has_company_permission(company_id, 'sales_invoice.edit'))
  or (select private.has_company_permission(company_id, 'sales_invoice.create'))
)
with check (
  (
    (
      (select auth.uid()) = user_id
      and company_id is null
    )
    or
    (select private.has_company_permission(company_id, 'sales_invoice.edit'))
    or (select private.has_company_permission(company_id, 'sales_invoice.create'))
  )
  and upper(coalesce(commercial_status, status::text, 'DRAFT')) in ('DRAFT', 'SENT', 'VIEWED')
);

drop policy if exists invoice_items_company_insert on public.invoice_items;
drop policy if exists invoice_items_editor_insert on public.invoice_items;
create policy invoice_items_editor_insert
on public.invoice_items
for insert to authenticated
with check (
  exists (
    select 1
    from public.invoices invoice
    where invoice.id = invoice_items.invoice_id
      and (
        invoice.user_id = (select auth.uid())
        or
        (select private.has_company_permission(invoice.company_id, 'sales_invoice.edit'))
        or (select private.has_company_permission(invoice.company_id, 'sales_invoice.create'))
      )
  )
);

drop policy if exists invoice_items_company_update on public.invoice_items;
drop policy if exists invoice_items_editor_update on public.invoice_items;
create policy invoice_items_editor_update
on public.invoice_items
for update to authenticated
using (
  exists (
    select 1
    from public.invoices invoice
    where invoice.id = invoice_items.invoice_id
      and (
        invoice.user_id = (select auth.uid())
        or
        (select private.has_company_permission(invoice.company_id, 'sales_invoice.edit'))
        or (select private.has_company_permission(invoice.company_id, 'sales_invoice.create'))
      )
  )
)
with check (
  exists (
    select 1
    from public.invoices invoice
    where invoice.id = invoice_items.invoice_id
      and (
        invoice.user_id = (select auth.uid())
        or
        (select private.has_company_permission(invoice.company_id, 'sales_invoice.edit'))
        or (select private.has_company_permission(invoice.company_id, 'sales_invoice.create'))
      )
  )
);

drop policy if exists invoice_items_company_delete on public.invoice_items;
drop policy if exists invoice_items_editor_delete on public.invoice_items;
create policy invoice_items_editor_delete
on public.invoice_items
for delete to authenticated
using (
  exists (
    select 1
    from public.invoices invoice
    where invoice.id = invoice_items.invoice_id
      and (
        invoice.user_id = (select auth.uid())
        or
        (select private.has_company_permission(invoice.company_id, 'sales_invoice.edit'))
        or (select private.has_company_permission(invoice.company_id, 'sales_invoice.create'))
      )
  )
);

notify pgrst, 'reload schema';
