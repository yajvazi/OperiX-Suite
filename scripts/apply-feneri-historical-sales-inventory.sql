-- One-time, idempotent inventory reconciliation for Feneri's imported sales.
--
-- The 78 historical invoices already contain the commercial sale, revenue,
-- payment, and customer records. This script adds only the missing inventory
-- movement for the 453 yellow Fenera units sold. It uses the existing posting
-- RPC so stock, COGS, the inventory journal, and the product display quantity
-- remain synchronized.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
SELECT set_config(
  'request.jwt.claim.sub',
  '6340daec-c16e-42e6-8e5a-a322a23b7b86',
  true
);

DO $$
DECLARE
  v_company_id constant uuid := 'be75d0be-3d1e-4e8b-80b6-88b8722f3f1e';
  v_product_id constant uuid := '4c0e5c6a-321d-47d0-aee4-065a8d8577a8';
  v_actor_id constant uuid := '6340daec-c16e-42e6-8e5a-a322a23b7b86';
  v_batch constant text := 'FENERI-HISTORICAL-SALES-001';
  v_company_name text;
  v_product_name text;
  v_product_stock numeric;
  v_ledger_quantity numeric;
  v_sales_count integer;
  v_sales_quantity numeric;
  v_product_revenue numeric;
  v_movement public.inventory_movements;
BEGIN
  SELECT c.company_name
    INTO v_company_name
    FROM public.companies c
   WHERE c.id = v_company_id
   FOR UPDATE;

  IF v_company_name IS DISTINCT FROM 'Feneri' THEN
    RAISE EXCEPTION 'Guard failed: expected Feneri tenant, found %', v_company_name;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_actor_id) THEN
    RAISE EXCEPTION 'Guard failed: import actor does not exist';
  END IF;

  IF NOT private.has_company_permission(v_company_id, 'inventory.manage') THEN
    RAISE EXCEPTION 'Guard failed: import actor lacks inventory.manage permission'
      USING errcode = '42501';
  END IF;

  SELECT p.name, p.stock_quantity
    INTO v_product_name, v_product_stock
    FROM public.products p
   WHERE p.id = v_product_id
     AND p.company_id = v_company_id
   FOR UPDATE;

  IF v_product_name IS DISTINCT FROM 'Fenera të verdhë' THEN
    RAISE EXCEPTION 'Guard failed: unexpected product %', v_product_name;
  END IF;

  SELECT count(DISTINCT i.id), coalesce(sum(ii.quantity), 0), coalesce(sum(ii.amount), 0)
    INTO v_sales_count, v_sales_quantity, v_product_revenue
    FROM public.invoice_items ii
    JOIN public.invoices i ON i.id = ii.invoice_id
   WHERE i.company_id = v_company_id
     AND i.notes LIKE v_batch || '-%'
     AND ii.product_id = v_product_id;

  IF v_sales_count <> 78 OR v_sales_quantity <> 453 OR v_product_revenue <> 679.50 THEN
    RAISE EXCEPTION 'Guard failed: expected 78 historical sales, 453 units, EUR 679.50 product revenue; found sales=% units=% revenue=%',
      v_sales_count, v_sales_quantity, v_product_revenue;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.inventory_movements im
     WHERE im.company_id = v_company_id
       AND im.idempotency_key = md5(v_batch || '-STOCK')::uuid
  ) THEN
    SELECT *
      INTO v_movement
      FROM public.inventory_movements im
     WHERE im.company_id = v_company_id
       AND im.idempotency_key = md5(v_batch || '-STOCK')::uuid
     FOR UPDATE;

    IF v_movement.movement_type <> 'sale'
       OR v_movement.quantity_delta <> -453
       OR v_movement.quantity_after <> 1517 THEN
      RAISE EXCEPTION 'Existing historical stock movement does not match the expected result';
    END IF;

    SELECT ir.quantity
      INTO v_ledger_quantity
      FROM public.inventory_register ir
     WHERE ir.company_id = v_company_id
       AND ir.product_id = v_product_id;

    IF v_product_stock <> 1517 OR v_ledger_quantity <> 1517 THEN
      RAISE EXCEPTION 'Existing historical movement is present but stock is not reconciled: product=% ledger=%',
        v_product_stock, v_ledger_quantity;
    END IF;
  ELSE
    SELECT ir.quantity
      INTO v_ledger_quantity
      FROM public.inventory_register ir
     WHERE ir.company_id = v_company_id
       AND ir.product_id = v_product_id;

    IF v_product_stock <> 1970 OR v_ledger_quantity <> 1970 THEN
      RAISE EXCEPTION 'Guard failed: expected pre-adjustment stock and ledger of 1970; product=% ledger=%',
        v_product_stock, v_ledger_quantity;
    END IF;

    SELECT *
      INTO v_movement
      FROM public.post_inventory_movement(
        v_company_id,
        v_product_id,
        'sale',
        453,
        NULL,
        NULL,
        'feneri_historical_sales_import',
        NULL,
        md5(v_batch || '-STOCK')::uuid,
        'Feneri historical sales import: 453 Fenera të verdhë sold; inventory and COGS posted without duplicating revenue or payments'
      );
  END IF;

  IF v_movement.quantity_after <> 1517 OR v_movement.cost_amount <> 144.96 THEN
    RAISE EXCEPTION 'Historical stock movement did not reconcile: quantity_after=% cost_amount=%',
      v_movement.quantity_after, v_movement.cost_amount;
  END IF;

  IF (SELECT stock_quantity FROM public.products WHERE id = v_product_id) <> 1517 THEN
    RAISE EXCEPTION 'Product stock did not reconcile to 1517';
  END IF;

  IF (SELECT quantity FROM public.inventory_register WHERE company_id = v_company_id AND product_id = v_product_id) <> 1517 THEN
    RAISE EXCEPTION 'Inventory register did not reconcile to 1517';
  END IF;
END $$;

COMMIT;
