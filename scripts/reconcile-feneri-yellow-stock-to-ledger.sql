-- One-time, guarded reconciliation for Feneri's yellow Fenera product.
-- The inventory movement ledger is authoritative. This script only repairs the
-- denormalized products.stock_quantity display value; it does not create a
-- stock movement, journal entry, sale, or inventory deduction.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '10s';
SELECT set_config('app.inventory_workflow', 'authorized', true);

DO $$
DECLARE
  v_company_name text;
  v_product_name text;
  v_product_stock numeric;
  v_ledger_quantity numeric;
  v_movement_count integer;
  v_white_stock numeric;
  v_white_ledger numeric;
  v_admin_id uuid;
BEGIN
  SELECT c.company_name
    INTO v_company_name
    FROM public.companies c
   WHERE c.id = 'be75d0be-3d1e-4e8b-80b6-88b8722f3f1e'::uuid
   FOR UPDATE;

  IF v_company_name IS DISTINCT FROM 'Feneri' THEN
    RAISE EXCEPTION 'Guard failed: expected Feneri tenant, found %', v_company_name;
  END IF;

  SELECT p.name, p.stock_quantity
    INTO v_product_name, v_product_stock
    FROM public.products p
   WHERE p.id = '4c0e5c6a-321d-47d0-aee4-065a8d8577a8'::uuid
     AND p.company_id = 'be75d0be-3d1e-4e8b-80b6-88b8722f3f1e'::uuid
   FOR UPDATE;

  IF v_product_name IS DISTINCT FROM 'Fenera të verdhë' THEN
    RAISE EXCEPTION 'Guard failed: unexpected yellow product %', v_product_name;
  END IF;

  SELECT count(*), max(im.quantity_after)
    INTO v_movement_count, v_ledger_quantity
    FROM public.inventory_movements im
   WHERE im.company_id = 'be75d0be-3d1e-4e8b-80b6-88b8722f3f1e'::uuid
     AND im.product_id = '4c0e5c6a-321d-47d0-aee4-065a8d8577a8'::uuid;

  IF v_movement_count <> 1 OR v_ledger_quantity <> 1970 THEN
    RAISE EXCEPTION 'Guard failed: expected one yellow opening movement ending at 1970, found count=% quantity=%',
      v_movement_count, v_ledger_quantity;
  END IF;

  SELECT p.stock_quantity
    INTO v_white_stock
    FROM public.products p
   WHERE p.id = '0be2d977-2505-4ff2-8c15-1ddfd8f85059'::uuid
     AND p.company_id = 'be75d0be-3d1e-4e8b-80b6-88b8722f3f1e'::uuid
   FOR UPDATE;

  SELECT max(im.quantity_after)
    INTO v_white_ledger
    FROM public.inventory_movements im
   WHERE im.company_id = 'be75d0be-3d1e-4e8b-80b6-88b8722f3f1e'::uuid
     AND im.product_id = '0be2d977-2505-4ff2-8c15-1ddfd8f85059'::uuid;

  IF v_white_stock <> 310 OR v_white_ledger <> 310 THEN
    RAISE EXCEPTION 'Guard failed: white Fenera changed unexpectedly, product=% ledger=%',
      v_white_stock, v_white_ledger;
  END IF;

  IF v_product_stock IS DISTINCT FROM 1508 AND v_product_stock IS DISTINCT FROM v_ledger_quantity THEN
    RAISE EXCEPTION 'Guard failed: yellow product stock is neither the observed stale value 1508 nor the ledger value 1970; found %',
      v_product_stock;
  END IF;

  SELECT u.id
    INTO v_admin_id
    FROM auth.users u
   WHERE lower(u.email) = 'admin@lrdy-group.com'
   LIMIT 1;

  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Guard failed: admin actor was not found';
  END IF;
END $$;

WITH latest AS (
  SELECT im.quantity_after
    FROM public.inventory_movements im
   WHERE im.company_id = 'be75d0be-3d1e-4e8b-80b6-88b8722f3f1e'::uuid
     AND im.product_id = '4c0e5c6a-321d-47d0-aee4-065a8d8577a8'::uuid
   ORDER BY im.movement_sequence DESC
   LIMIT 1
), changed AS (
  UPDATE public.products p
     SET stock_quantity = latest.quantity_after
    FROM latest
   WHERE p.id = '4c0e5c6a-321d-47d0-aee4-065a8d8577a8'::uuid
     AND p.company_id = 'be75d0be-3d1e-4e8b-80b6-88b8722f3f1e'::uuid
     AND p.stock_quantity = 1508
  RETURNING p.id, p.company_id, p.stock_quantity
)
INSERT INTO public.audit_events (
  company_id,
  actor_user_id,
  action,
  entity_type,
  entity_id,
  previous_values,
  new_values,
  reason,
  request_id
)
SELECT
  changed.company_id,
  (SELECT u.id FROM auth.users u WHERE lower(u.email) = 'admin@lrdy-group.com' LIMIT 1),
  'stock_reconciled_to_inventory_ledger',
  'product',
  changed.id,
  jsonb_build_object('stock_quantity', 1508),
  jsonb_build_object('stock_quantity', changed.stock_quantity),
  'Feneri product stock display reconciled to the authoritative inventory movement ledger; no movement or journal was created.',
  'FENERI-STOCK-LEDGER-RECONCILIATION-001'
FROM changed
WHERE NOT EXISTS (
  SELECT 1
    FROM public.audit_events ae
   WHERE ae.request_id = 'FENERI-STOCK-LEDGER-RECONCILIATION-001'
);

COMMIT;
