-- Branch-aware inventory and per-company user branch preferences.
-- Existing products.stock_quantity remains the compatibility path for
-- products which have not yet been assigned to a branch.

create table if not exists public.product_branch_stock (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  stock_quantity numeric(20,6) not null default 0 check (stock_quantity >= 0),
  low_stock_threshold numeric(20,6) not null default 5 check (low_stock_threshold >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  unique (company_id, branch_id, product_id)
);

create index if not exists product_branch_stock_company_branch_idx
  on public.product_branch_stock(company_id, branch_id, product_id);
create index if not exists product_branch_stock_product_idx
  on public.product_branch_stock(product_id, branch_id);

create table if not exists public.company_user_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  preferred_branch_id uuid references public.branches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, company_id)
);

alter table public.inventory_stock_movements
  add column if not exists branch_id uuid references public.branches(id) on delete restrict;

create index if not exists inventory_stock_movements_branch_idx
  on public.inventory_stock_movements(company_id, branch_id, created_at desc);

alter table public.product_branch_stock enable row level security;
alter table public.company_user_preferences enable row level security;

drop policy if exists product_branch_stock_select on public.product_branch_stock;
create policy product_branch_stock_select on public.product_branch_stock
  for select to authenticated
  using (public.can_access_company(company_id));

drop policy if exists product_branch_stock_insert on public.product_branch_stock;
create policy product_branch_stock_insert on public.product_branch_stock
  for insert to authenticated
  with check (private.has_company_permission(company_id, 'inventory.manage'));

drop policy if exists product_branch_stock_update on public.product_branch_stock;
create policy product_branch_stock_update on public.product_branch_stock
  for update to authenticated
  using (private.has_company_permission(company_id, 'inventory.manage'))
  with check (private.has_company_permission(company_id, 'inventory.manage'));

drop policy if exists product_branch_stock_delete on public.product_branch_stock;
create policy product_branch_stock_delete on public.product_branch_stock
  for delete to authenticated
  using (private.has_company_permission(company_id, 'inventory.manage'));

drop policy if exists company_user_preferences_select on public.company_user_preferences;
create policy company_user_preferences_select on public.company_user_preferences
  for select to authenticated
  using (user_id = auth.uid() and public.can_access_company(company_id));

drop policy if exists company_user_preferences_insert on public.company_user_preferences;
create policy company_user_preferences_insert on public.company_user_preferences
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_access_company(company_id));

drop policy if exists company_user_preferences_update on public.company_user_preferences;
create policy company_user_preferences_update on public.company_user_preferences
  for update to authenticated
  using (user_id = auth.uid() and public.can_access_company(company_id))
  with check (user_id = auth.uid() and public.can_access_company(company_id));

drop policy if exists company_user_preferences_delete on public.company_user_preferences;
create policy company_user_preferences_delete on public.company_user_preferences
  for delete to authenticated
  using (user_id = auth.uid() and public.can_access_company(company_id));

create or replace function public.set_preferred_branch(
  p_company_id uuid,
  p_branch_id uuid
)
returns public.company_user_preferences
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  preference public.company_user_preferences;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not public.can_access_company(p_company_id) then
    raise exception 'You do not have access to this company' using errcode = '42501';
  end if;
  if p_branch_id is not null and not exists (
    select 1 from public.branches
    where id = p_branch_id and company_id = p_company_id and is_active
  ) then
    raise exception 'The selected branch is not active in this company' using errcode = '22023';
  end if;

  insert into public.company_user_preferences(user_id, company_id, preferred_branch_id, updated_at)
  values (actor_id, p_company_id, p_branch_id, now())
  on conflict (user_id, company_id) do update
    set preferred_branch_id = excluded.preferred_branch_id, updated_at = now()
  returning * into preference;
  return preference;
end;
$$;

revoke all on function public.set_preferred_branch(uuid, uuid) from public, anon;
grant execute on function public.set_preferred_branch(uuid, uuid) to authenticated;

create or replace function public.set_product_branch_stock(
  p_company_id uuid,
  p_product_id uuid,
  p_branch_id uuid,
  p_stock_quantity numeric,
  p_low_stock_threshold numeric default 5
)
returns public.product_branch_stock
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  product_row public.products;
  branch_row public.branches;
  stock_row public.product_branch_stock;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_stock_quantity is null or p_stock_quantity < 0 then raise exception 'Stock cannot be negative' using errcode = '22023'; end if;
  if p_low_stock_threshold is null or p_low_stock_threshold < 0 then raise exception 'Low stock threshold cannot be negative' using errcode = '22023'; end if;
  if not (private.has_company_permission(p_company_id, 'inventory.manage') or private.has_company_permission(p_company_id, 'products.manage')) then
    raise exception 'Insufficient permission to manage inventory' using errcode = '42501';
  end if;
  select * into branch_row from public.branches where id = p_branch_id and company_id = p_company_id and is_active for update;
  if not found then raise exception 'The selected branch is not active in this company' using errcode = '22023'; end if;
  select * into product_row from public.products where id = p_product_id and company_id = p_company_id for update;
  if not found then raise exception 'The selected product is not available in this company' using errcode = '22023'; end if;

  insert into public.product_branch_stock(company_id, branch_id, product_id, stock_quantity, low_stock_threshold, created_by, updated_by, updated_at)
  values (p_company_id, p_branch_id, p_product_id, p_stock_quantity, p_low_stock_threshold, actor_id, actor_id, now())
  on conflict (company_id, branch_id, product_id) do update
    set stock_quantity = excluded.stock_quantity,
        low_stock_threshold = excluded.low_stock_threshold,
        updated_by = actor_id,
        updated_at = now()
  returning * into stock_row;

  -- Keep the legacy total useful for existing reports and older clients.
  update public.products
  set stock_quantity = (
    select coalesce(sum(stock_quantity), 0)
    from public.product_branch_stock
    where company_id = p_company_id and product_id = p_product_id
  )
  where id = p_product_id;
  return stock_row;
end;
$$;

revoke all on function public.set_product_branch_stock(uuid, uuid, uuid, numeric, numeric) from public, anon;
grant execute on function public.set_product_branch_stock(uuid, uuid, uuid, numeric, numeric) to authenticated;

create or replace function public.set_invoice_operating_branch(
  p_invoice_id uuid,
  p_branch_id uuid
)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice_row public.invoices;
begin
  select * into invoice_row from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found' using errcode = 'P0002'; end if;
  if not public.can_access_company(invoice_row.company_id) then raise exception 'You do not have access to this invoice' using errcode = '42501'; end if;
  if not private.has_company_permission(invoice_row.company_id, 'invoice.create')
     and not private.has_company_permission(invoice_row.company_id, 'sales_invoice.edit') then
    raise exception 'Insufficient permission to assign an invoice branch' using errcode = '42501';
  end if;
  if p_branch_id is not null and not exists (
    select 1 from public.branches where id = p_branch_id and company_id = invoice_row.company_id and is_active
  ) then
    raise exception 'The selected branch is not active in this company' using errcode = '22023';
  end if;
  update public.invoices set branch_id = p_branch_id where id = p_invoice_id returning * into invoice_row;
  return invoice_row;
end;
$$;

revoke all on function public.set_invoice_operating_branch(uuid, uuid) from public, anon;
grant execute on function public.set_invoice_operating_branch(uuid, uuid) to authenticated;

-- One atomic branch-aware checkout path for both web and mobile.
create or replace function public.save_invoice_document_with_stock(
  p_invoice jsonb,
  p_items jsonb,
  p_idempotency_key uuid default null,
  p_post_invoice boolean default true
)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  invoice_row public.invoices;
  product_row public.products;
  branch_stock public.product_branch_stock;
  item_record record;
  stock_before numeric;
  invoice_branch_id uuid := nullif(p_invoice ->> 'branch_id', '')::uuid;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not coalesce(p_post_invoice, true) then raise exception 'Stock checkout must post the invoice' using errcode = '22023'; end if;

  invoice_row := public.save_invoice_document(p_invoice, p_items, null, false, p_idempotency_key);

  if invoice_branch_id is not null then
    if not exists (select 1 from public.branches where id = invoice_branch_id and company_id = invoice_row.company_id and is_active) then
      raise exception 'The selected branch is not active in this company' using errcode = '22023';
    end if;
    update public.invoices set branch_id = invoice_branch_id where id = invoice_row.id returning * into invoice_row;
  end if;

  if lower(coalesce(invoice_row.accounting_state, '')) = 'posted'
     or exists (select 1 from public.inventory_stock_movements movement where movement.invoice_id = invoice_row.id and movement.movement_type = 'invoice_issue') then
    return invoice_row;
  end if;

  for item_record in
    select item.product_id, sum(item.quantity) as quantity
    from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as item(product_id uuid, quantity numeric)
    where item.product_id is not null
    group by item.product_id
  loop
    select * into product_row from public.products where id = item_record.product_id for update;
    if not found then raise exception 'One of the selected products no longer exists' using errcode = '22023'; end if;
    if product_row.company_id is not null and product_row.company_id <> invoice_row.company_id then
      raise exception 'A product belongs to another company subdivision' using errcode = '22023';
    end if;
    if coalesce(product_row.track_stock, false) then
      if invoice_branch_id is not null then
        select * into branch_stock
        from public.product_branch_stock
        where company_id = invoice_row.company_id and branch_id = invoice_branch_id and product_id = product_row.id
        for update;
        if not found then
          if exists (select 1 from public.product_branch_stock where company_id = invoice_row.company_id and product_id = product_row.id) then
            raise exception 'No stock is configured for "%" in the selected branch', product_row.name using errcode = '22003';
          end if;
          -- Legacy products with one global stock value remain sellable until
          -- their stock is distributed between branches explicitly.
          if coalesce(product_row.stock_quantity, 0) < item_record.quantity then
            raise exception 'Not enough stock for "%". Available: %, requested: %', product_row.name, product_row.stock_quantity, item_record.quantity using errcode = '22003';
          end if;
          stock_before := product_row.stock_quantity;
          update public.products set stock_quantity = stock_before - item_record.quantity where id = product_row.id;
        else
          if coalesce(branch_stock.stock_quantity, 0) < item_record.quantity then
            raise exception 'Not enough stock for "%" in the selected branch. Available: %, requested: %', product_row.name, branch_stock.stock_quantity, item_record.quantity using errcode = '22003';
          end if;
          stock_before := branch_stock.stock_quantity;
          update public.product_branch_stock set stock_quantity = stock_before - item_record.quantity, updated_by = actor_id, updated_at = now() where id = branch_stock.id;
          update public.products set stock_quantity = (select coalesce(sum(stock_quantity), 0) from public.product_branch_stock where company_id = invoice_row.company_id and product_id = product_row.id) where id = product_row.id;
        end if;
      else
        if coalesce(product_row.stock_quantity, 0) < item_record.quantity then
          raise exception 'Not enough stock for "%". Available: %, requested: %', product_row.name, product_row.stock_quantity, item_record.quantity using errcode = '22003';
        end if;
        stock_before := product_row.stock_quantity;
        update public.products set stock_quantity = stock_before - item_record.quantity where id = product_row.id;
      end if;
      insert into public.inventory_stock_movements(company_id, branch_id, product_id, invoice_id, movement_type, quantity_delta, stock_before, stock_after, created_by)
      values (invoice_row.company_id, invoice_branch_id, product_row.id, invoice_row.id, 'invoice_issue', -item_record.quantity, stock_before, stock_before - item_record.quantity, actor_id);
    end if;
  end loop;

  invoice_row := public.post_pos_invoice(invoice_row.id, p_idempotency_key, 'Shared branch stock invoice checkout');
  return invoice_row;
end
$$;

revoke all on function public.save_invoice_document_with_stock(jsonb, jsonb, uuid, boolean) from public, anon;
grant execute on function public.save_invoice_document_with_stock(jsonb, jsonb, uuid, boolean) to authenticated;
