-- Product deletion must be scoped to the exact active company.
--
-- A parent company may be authorized to manage descendant tenants, but that
-- does not mean a product from a descendant can be deleted while the parent
-- company is active. The RPC therefore requires the caller to submit the
-- active company and matches the product to that company before touching it.

drop function if exists public.delete_product(uuid);

create or replace function public.delete_product(
  p_product_id uuid,
  p_company_id uuid
)
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

  if p_company_id is null then
    raise exception 'An active company is required to delete a product' using errcode = '22004';
  end if;

  -- The company predicate is intentional: a root-company permission must not
  -- turn a delete request for the root into a delete of a child-tenant row.
  -- Keep the legacy user-owned branch for products created before company
  -- ownership was introduced.
  select * into product_row
  from public.products
  where id = p_product_id
    and (
      company_id = p_company_id
      or (company_id is null and user_id = actor_id)
    )
  for update;

  if not found then
    raise exception 'Product not found in the selected company' using errcode = 'P0002';
  end if;

  if (
    product_row.company_id is not null
    and not coalesce(private.has_company_permission(p_company_id, 'products.manage'), false)
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
  delete from public.products where id = p_product_id;
end;
$$;

revoke all on function public.delete_product(uuid, uuid) from public, anon;
grant execute on function public.delete_product(uuid, uuid) to authenticated;

