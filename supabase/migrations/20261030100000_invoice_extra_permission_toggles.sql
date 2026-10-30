-- Two extra Admin-toggleable invoice permissions:
--   invoice.apply_discount  apply a discount to invoice lines or the whole invoice
--   invoice.change_dates    change the issue or due date of an existing invoice
-- Admins always hold them; Managers get them by default; Employees do not
-- until an Admin turns them on in Settings -> Users & Access.

begin;

insert into public.app_permissions (code, name, category, description, is_sensitive)
values
  ('invoice.apply_discount', 'Apply discounts', 'invoices', 'Apply a discount to invoice lines or to a whole invoice.', true),
  ('invoice.change_dates', 'Change invoice dates', 'invoices', 'Change the issue date or due date of an existing invoice.', true)
on conflict (code) do update
set name = excluded.name,
    category = excluded.category,
    description = excluded.description,
    is_sensitive = excluded.is_sensitive;

-- Defaults: Admin and Manager hold both; Employee holds neither.
insert into public.app_role_permissions(role_id, permission_code)
select role.id, permission.code
from public.app_roles role
cross join (values ('invoice.apply_discount'), ('invoice.change_dates')) as permission(code)
where role.company_id is null and role.code in ('company_administrator', 'manager')
on conflict do nothing;

-- The permission vocabulary is repeated inside four functions. Add the new
-- codes next to 'invoice.edit' in each one without restating their bodies.
do $$
declare
  fn regprocedure;
  def text;
begin
  foreach fn in array array[
    'private.rbac_is_invoice_permission(text)'::regprocedure,
    'private.rbac_permission_assignable(text,text)'::regprocedure,
    'public.rbac_get_workspace_access(uuid)'::regprocedure,
    'public.rbac_list_permission_catalog()'::regprocedure
  ] loop
    def := pg_get_functiondef(fn);
    if position('invoice.apply_discount' in def) = 0 then
      def := replace(def, '''invoice.edit''', '''invoice.edit'',''invoice.apply_discount'',''invoice.change_dates''');
      execute def;
    end if;
  end loop;
end;
$$;

-- Enforcement ---------------------------------------------------------------

create or replace function private.rbac_invoice_discount_dates_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  server_request boolean := coalesce((select auth.jwt() ->> 'role'), '') = 'service_role';
  target_company uuid;
begin
  if server_request or private.rbac_is_platform_admin() then return new; end if;

  if tg_table_name = 'invoice_items' then
    if coalesce(new.discount, 0) > 0 and (tg_op = 'INSERT' or new.discount is distinct from old.discount) then
      select invoice.company_id into target_company from public.invoices invoice where invoice.id = new.invoice_id;
      if target_company is not null and not private.has_company_permission(target_company, 'invoice.apply_discount') then
        raise exception 'Discount permission is required' using errcode = '42501';
      end if;
    end if;
    return new;
  end if;

  if new.company_id is null then return new; end if;

  if (coalesce(new.discount_percent, 0) > 0 or coalesce(new.discount_amount, 0) > 0)
     and (tg_op = 'INSERT'
          or new.discount_percent is distinct from old.discount_percent
          or new.discount_amount is distinct from old.discount_amount)
     and not private.has_company_permission(new.company_id, 'invoice.apply_discount') then
    raise exception 'Discount permission is required' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
     and (new.issue_date is distinct from old.issue_date or new.due_date is distinct from old.due_date)
     and not private.has_company_permission(new.company_id, 'invoice.change_dates') then
    raise exception 'Date-change permission is required' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.rbac_invoice_discount_dates_guard() from public;

drop trigger if exists rbac_invoices_discount_dates_guard on public.invoices;
create trigger rbac_invoices_discount_dates_guard
before insert or update on public.invoices
for each row execute function private.rbac_invoice_discount_dates_guard();

drop trigger if exists rbac_invoice_items_discount_guard on public.invoice_items;
create trigger rbac_invoice_items_discount_guard
before insert or update on public.invoice_items
for each row execute function private.rbac_invoice_discount_dates_guard();

commit;
