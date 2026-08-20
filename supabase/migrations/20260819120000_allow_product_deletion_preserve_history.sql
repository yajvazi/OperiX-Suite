-- Allow products to be removed without deleting or mutating historical sales
-- and inventory records. Historical rows keep a product-name snapshot after
-- their catalog reference is detached.

alter table public.inventory_stock_movements
  add column if not exists product_name text;

alter table public.inventory_movements
  add column if not exists product_name text;

alter table public.inventory_count_lines
  add column if not exists product_name text;

update public.inventory_stock_movements movement
set product_name = product.name
from public.products product
where movement.product_id = product.id
  and movement.product_name is null;

update public.inventory_movements movement
set product_name = product.name
from public.products product
where movement.product_id = product.id
  and movement.product_name is null;

update public.inventory_count_lines line
set product_name = product.name
from public.products product
where line.product_id = product.id
  and line.product_name is null;

alter table public.pos_order_lines
  drop constraint if exists pos_order_lines_product_id_fkey;
alter table public.pos_order_lines
  add constraint pos_order_lines_product_id_fkey
  foreign key (product_id) references public.products(id) on delete set null;

alter table public.inventory_stock_movements
  alter column product_id drop not null;
alter table public.inventory_stock_movements
  drop constraint if exists inventory_stock_movements_product_id_fkey;
alter table public.inventory_stock_movements
  add constraint inventory_stock_movements_product_id_fkey
  foreign key (product_id) references public.products(id) on delete set null;

alter table public.inventory_movements
  alter column product_id drop not null;
alter table public.inventory_movements
  drop constraint if exists inventory_movements_product_id_fkey;
alter table public.inventory_movements
  add constraint inventory_movements_product_id_fkey
  foreign key (product_id) references public.products(id) on delete set null;

alter table public.inventory_count_lines
  alter column product_id drop not null;
alter table public.inventory_count_lines
  drop constraint if exists inventory_count_lines_product_id_fkey;
alter table public.inventory_count_lines
  add constraint inventory_count_lines_product_id_fkey
  foreign key (product_id) references public.products(id) on delete set null;

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
  and coalesce(current_setting('app.invoice_delete_workflow', true), '') <> 'authorized'
  and coalesce(current_setting('app.product_delete_workflow', true), '') <> 'authorized' then
    raise exception 'Stock-tracked invoice lines cannot be edited after checkout'
      using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.delete_product(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  product_row public.products;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select *
  into product_row
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'Product not found' using errcode = 'P0002';
  end if;

  if (
    product_row.company_id is not null
    and not coalesce(private.has_company_permission(product_row.company_id, 'products.manage'), false)
  ) or (
    product_row.company_id is null
    and (
      product_row.user_id <> actor_id
      or not private.has_unscoped_permission('products.manage')
    )
  ) then
    raise exception 'You do not have permission to delete this product' using errcode = '42501';
  end if;

  perform set_config('app.product_delete_workflow', 'authorized', true);

  update public.inventory_stock_movements
  set product_name = coalesce(product_name, product_row.name), product_id = null
  where product_id = p_product_id;

  update public.inventory_movements
  set product_name = coalesce(product_name, product_row.name), product_id = null
  where product_id = p_product_id;

  update public.inventory_count_lines
  set product_name = coalesce(product_name, product_row.name), product_id = null
  where product_id = p_product_id;

  delete from public.products
  where id = p_product_id;
end;
$$;

revoke all on function public.delete_product(uuid) from public, anon, authenticated;
grant execute on function public.delete_product(uuid) to authenticated;
