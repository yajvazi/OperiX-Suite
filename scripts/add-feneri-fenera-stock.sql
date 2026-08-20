-- One-time, idempotent Feneri stock setup.
--
-- The existing Fener product is the product referenced by the 453 historical
-- yellow-Fenera sales. It is reused and renamed instead of creating a second
-- product for the same historical item. The 1,970 yellow units below are the
-- gross opening stock; apply-feneri-historical-sales-inventory.sql records the
-- 453 historical units sold, leaving 1,517 currently available.

begin;

do $$
declare
  v_company_id constant uuid := 'be75d0be-3d1e-4e8b-80b6-88b8722f3f1e';
  v_actor_id constant uuid := '6340daec-c16e-42e6-8e5a-a322a23b7b86';
  v_yellow_product_id constant uuid := '4c0e5c6a-321d-47d0-aee4-065a8d8577a8';
  v_white_product_id uuid;
  v_yellow_movement public.inventory_movements;
  v_white_movement public.inventory_movements;
  v_existing_count integer;
begin
  if not exists (
    select 1
    from public.companies
    where id = v_company_id
      and company_name = 'Feneri'
  ) then
    raise exception 'Expected Feneri company was not found';
  end if;

  perform set_config('request.jwt.claim.sub', v_actor_id::text, true);

  if not private.has_company_permission(v_company_id, 'products.manage')
     or not private.has_company_permission(v_company_id, 'inventory.manage') then
    raise exception 'Feneri admin lacks product or inventory permission'
      using errcode = '42501';
  end if;

  -- Reuse the exact product already linked to the 453 historical sales.
  if not exists (
    select 1
    from public.products
    where id = v_yellow_product_id
      and company_id = v_company_id
      and sku = 'FENERI-FENER'
  ) then
    raise exception 'The existing historical Fener product does not match the expected Feneri record';
  end if;

  -- Do not create a duplicate white variant if a prior equivalent exists.
  select count(*) into v_existing_count
  from public.products
  where company_id = v_company_id
    and (
      sku = 'FENERI-FENERA-BARDHE'
      or lower(trim(name)) in ('fenera të bardhë', 'fenera te bardhe')
    );

  if v_existing_count > 1 then
    raise exception 'More than one Fenera të bardhë product exists for Feneri';
  end if;

  select id into v_white_product_id
  from public.products
  where company_id = v_company_id
    and (
      sku = 'FENERI-FENERA-BARDHE'
      or lower(trim(name)) in ('fenera të bardhë', 'fenera te bardhe')
    )
  order by case when sku = 'FENERI-FENERA-BARDHE' then 0 else 1 end, created_at
  limit 1;

  -- If a previous run already posted the opening movement, the RPC is
  -- idempotent. Otherwise, a non-zero existing stock is unsafe to overwrite.
  if not exists (
    select 1
    from public.inventory_movements
    where company_id = v_company_id
      and idempotency_key = md5('FENERI-STOCK-SETUP-001-YELLOW')::uuid
  ) and exists (
    select 1
    from public.products
    where id = v_yellow_product_id
      and coalesce(stock_quantity, 0) <> 0
  ) then
    raise exception 'Yellow Fenera already has stock but no controlled opening movement; refusing to overwrite it';
  end if;

  update public.products
  set name = 'Fenera të verdhë',
      unit_price = 1.50,
      cost_price = 0.32,
      purchase_currency = 'EUR',
      supplier_unit_price = 0.32,
      supplier_unit_price_after_discount = 0.32,
      unit_cost_with_vat = 0.32,
      track_stock = true,
      unit = coalesce(nullif(unit, ''), 'pcs')
  where id = v_yellow_product_id
    and company_id = v_company_id;

  if v_white_product_id is null then
    insert into public.products (
      user_id,
      company_id,
      name,
      description,
      unit_price,
      stock_quantity,
      track_stock,
      low_stock_threshold,
      sku,
      tax_included,
      tax_rate,
      unit,
      cost_price,
      purchase_currency,
      exchange_rate,
      supplier_unit_price,
      supplier_discount_percent,
      supplier_unit_price_after_discount,
      unit_cost_with_vat,
      vat_treatment
    ) values (
      v_actor_id,
      v_company_id,
      'Fenera të bardhë',
      'Fenera të bardhë',
      1.50,
      0,
      true,
      5,
      'FENERI-FENERA-BARDHE',
      false,
      0,
      'pcs',
      0.32,
      'EUR',
      1,
      0.32,
      0,
      0.32,
      0.32,
      'standard_18'
    )
    returning id into v_white_product_id;
  else
    if not exists (
      select 1
      from public.inventory_movements
      where company_id = v_company_id
        and product_id = v_white_product_id
        and idempotency_key = md5('FENERI-STOCK-SETUP-001-WHITE')::uuid
    ) and exists (
      select 1
      from public.products
      where id = v_white_product_id
        and coalesce(stock_quantity, 0) <> 0
    ) then
      raise exception 'White Fenera already has stock but no controlled opening movement; refusing to overwrite it';
    end if;

    update public.products
    set name = 'Fenera të bardhë',
        unit_price = 1.50,
        cost_price = 0.32,
        purchase_currency = 'EUR',
        supplier_unit_price = 0.32,
        supplier_unit_price_after_discount = 0.32,
        unit_cost_with_vat = 0.32,
        track_stock = true,
        unit = coalesce(nullif(unit, ''), 'pcs'),
        sku = 'FENERI-FENERA-BARDHE'
    where id = v_white_product_id
      and company_id = v_company_id;
  end if;

  select * into v_yellow_movement
  from public.post_inventory_movement(
    v_company_id,
    v_yellow_product_id,
    'opening_stock',
    1970,
    0.32,
    null,
    'feneri_stock_setup',
    null,
    md5('FENERI-STOCK-SETUP-001-YELLOW')::uuid,
    'Feneri opening stock: 1,970 available Fenera të verdhë; historical sold units excluded'
  );

  select * into v_white_movement
  from public.post_inventory_movement(
    v_company_id,
    v_white_product_id,
    'opening_stock',
    310,
    0.32,
    null,
    'feneri_stock_setup',
    null,
    md5('FENERI-STOCK-SETUP-001-WHITE')::uuid,
    'Feneri opening stock: 310 Fenera të bardhë'
  );

  if not exists (
    select 1
    from public.products
    where id = v_yellow_product_id
      and company_id = v_company_id
      and name = 'Fenera të verdhë'
      and track_stock
      and cost_price = 0.32
      and (
        stock_quantity = 1970
        or (
          stock_quantity = 1517
          and exists (
            select 1
            from public.inventory_movements
            where company_id = v_company_id
              and product_id = v_yellow_product_id
              and idempotency_key = md5('FENERI-HISTORICAL-SALES-001-STOCK')::uuid
              and movement_type = 'sale'
              and quantity_delta = -453
              and quantity_after = 1517
          )
        )
      )
    ) then
    raise exception 'Yellow Fenera final state did not reconcile to opening or post-historical-sale stock';
  end if;

  if not exists (
    select 1
    from public.products
    where id = v_white_product_id
      and company_id = v_company_id
      and name = 'Fenera të bardhë'
      and track_stock
      and stock_quantity = 310
      and cost_price = 0.32
  ) then
    raise exception 'White Fenera final state did not reconcile';
  end if;

  if (select count(*) from public.inventory_movements where id in (v_yellow_movement.id, v_white_movement.id)) <> 2 then
    raise exception 'Expected two controlled opening-stock movements';
  end if;

  if (select round(coalesce(sum(cost_amount), 0), 2)
      from public.inventory_movements
      where id in (v_yellow_movement.id, v_white_movement.id)) <> 729.60 then
    raise exception 'Opening-stock cost total did not reconcile to EUR 729.60';
  end if;
end
$$;

commit;
