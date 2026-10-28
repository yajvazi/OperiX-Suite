-- Move tracked stock between two active branches atomically.

alter table public.inventory_stock_movements
  drop constraint if exists inventory_stock_movements_movement_type_check;

alter table public.inventory_stock_movements
  add constraint inventory_stock_movements_movement_type_check
  check (movement_type in ('invoice_issue', 'invoice_reversal', 'manual_adjustment', 'transfer'));

alter table public.inventory_stock_movements
  add column if not exists transfer_id uuid;

alter table public.inventory_stock_movements
  add column if not exists note text;

create index if not exists inventory_stock_movements_transfer_idx
  on public.inventory_stock_movements(company_id, transfer_id)
  where transfer_id is not null;

create or replace function public.transfer_product_branch_stock(
  p_company_id uuid,
  p_product_id uuid,
  p_from_branch_id uuid,
  p_to_branch_id uuid,
  p_quantity numeric,
  p_transfer_id uuid default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  transfer_id uuid := coalesce(p_transfer_id, public.gen_random_uuid());
  product_row public.products;
  source_stock public.product_branch_stock;
  destination_stock public.product_branch_stock;
  source_before numeric;
  destination_before numeric;
  source_after numeric;
  destination_after numeric;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Transfer quantity must be greater than zero' using errcode = '22023';
  end if;
  if p_from_branch_id is null or p_to_branch_id is null or p_from_branch_id = p_to_branch_id then
    raise exception 'Select two different branches' using errcode = '22023';
  end if;
  if not (private.has_company_permission(p_company_id, 'inventory.manage') or private.has_company_permission(p_company_id, 'products.manage')) then
    raise exception 'Insufficient permission to manage inventory' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.branches
    where id = p_from_branch_id and company_id = p_company_id and is_active
  ) or not exists (
    select 1 from public.branches
    where id = p_to_branch_id and company_id = p_company_id and is_active
  ) then
    raise exception 'Both branches must be active in this company' using errcode = '22023';
  end if;

  -- Lock the product first so concurrent transfers for the same product are serialized.
  select * into product_row
  from public.products
  where id = p_product_id and company_id = p_company_id
  for update;
  if not found then
    raise exception 'The selected product is not available in this company' using errcode = '22023';
  end if;

  select * into source_stock
  from public.product_branch_stock
  where company_id = p_company_id and branch_id = p_from_branch_id and product_id = p_product_id
  for update;
  if not found then
    raise exception 'The source branch has no stock configured for "%"', product_row.name using errcode = '22003';
  end if;
  source_before := source_stock.stock_quantity;
  if source_before < p_quantity then
    raise exception 'Not enough stock in the source branch for "%". Available: %, requested: %', product_row.name, source_before, p_quantity using errcode = '22003';
  end if;

  select * into destination_stock
  from public.product_branch_stock
  where company_id = p_company_id and branch_id = p_to_branch_id and product_id = p_product_id
  for update;
  if not found then
    insert into public.product_branch_stock(
      company_id, branch_id, product_id, stock_quantity, low_stock_threshold, created_by, updated_by, updated_at
    ) values (
      p_company_id, p_to_branch_id, p_product_id, 0, source_stock.low_stock_threshold, actor_id, actor_id, now()
    ) returning * into destination_stock;
  end if;
  destination_before := destination_stock.stock_quantity;
  source_after := source_before - p_quantity;
  destination_after := destination_before + p_quantity;

  update public.product_branch_stock
  set stock_quantity = source_after, updated_by = actor_id, updated_at = now()
  where id = source_stock.id;
  update public.product_branch_stock
  set stock_quantity = destination_after, updated_by = actor_id, updated_at = now()
  where id = destination_stock.id;

  update public.products
  set stock_quantity = (
    select coalesce(sum(stock_quantity), 0)
    from public.product_branch_stock
    where company_id = p_company_id and product_id = p_product_id
  )
  where id = p_product_id;

  insert into public.inventory_stock_movements(
    company_id, branch_id, product_id, movement_type, quantity_delta,
    stock_before, stock_after, created_by, product_name, transfer_id, note
  ) values
    (p_company_id, p_from_branch_id, p_product_id, 'transfer', -p_quantity, source_before, source_after, actor_id, product_row.name, transfer_id, nullif(trim(coalesce(p_note, '')), '')),
    (p_company_id, p_to_branch_id, p_product_id, 'transfer', p_quantity, destination_before, destination_after, actor_id, product_row.name, transfer_id, nullif(trim(coalesce(p_note, '')), ''));

  return jsonb_build_object(
    'transfer_id', transfer_id,
    'product_id', p_product_id,
    'from_branch_id', p_from_branch_id,
    'to_branch_id', p_to_branch_id,
    'quantity', p_quantity,
    'source_stock', source_after,
    'destination_stock', destination_after,
    'note', nullif(trim(coalesce(p_note, '')), '')
  );
end;
$$;

revoke all on function public.transfer_product_branch_stock(uuid, uuid, uuid, uuid, numeric, uuid, text) from public, anon;
grant execute on function public.transfer_product_branch_stock(uuid, uuid, uuid, uuid, numeric, uuid, text) to authenticated;
