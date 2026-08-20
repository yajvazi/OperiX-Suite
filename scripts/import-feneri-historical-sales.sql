\set ON_ERROR_STOP on

-- One-time, idempotent Feneri historical-sales import.
--
-- This script deliberately uses the existing invoice, accounting, and payment
-- RPCs. It does not create POS orders because Feneri has no configured POS
-- branch/terminal, and it does not create fiscal receipts or stock movements.

begin;

create temporary table _feneri_historical_sales (
  row_number integer primary key,
  customer_name text not null,
  quantity numeric(20,4) not null check (quantity > 0),
  transport_type text not null check (transport_type in ('normal', 'private'))
) on commit drop;

insert into _feneri_historical_sales (row_number, customer_name, quantity, transport_type) values
  (1, 'Gentian Bujupi', 10, 'normal'),
  (2, 'Endrit Voca', 10, 'normal'),
  (3, 'Enis Morina', 5, 'normal'),
  (4, 'Adhurim Aliu', 10, 'normal'),
  (5, 'Saranda', 7, 'normal'),
  (6, 'Fatos Bujupaj', 10, 'normal'),
  (7, 'Elbasana Bajraktari', 2, 'normal'),
  (8, 'Fitore Gashi', 10, 'normal'),
  (9, 'Driton Hoxha', 10, 'normal'),
  (10, 'Dina', 4, 'normal'),
  (11, 'Diana', 2, 'normal'),
  (12, 'Belinda Lekaj', 5, 'normal'),
  (13, 'Ebyp Ajazaj', 10, 'normal'),
  (14, 'Blerina Kaliqani', 10, 'normal'),
  (15, 'Erlon Bytyqi', 2, 'normal'),
  (16, 'Gerta Hoxha', 2, 'normal'),
  (17, 'Leuart Mjeki', 2, 'normal'),
  (18, 'Egzon Luma', 4, 'normal'),
  (19, 'Agnesa Fazliu', 1, 'normal'),
  (20, 'Era Berisha', 2, 'normal'),
  (21, 'Tringa', 2, 'normal'),
  (22, 'Engjell Dedinca', 2, 'normal'),
  (23, 'Arijane Hoxha', 2, 'normal'),
  (24, 'Sara Krasniqi', 2, 'normal'),
  (25, 'Bujari', 60, 'normal'),
  (26, 'Leonora Aliu', 1, 'normal'),
  (27, 'Erblina Grajqevci', 5, 'normal'),
  (28, 'Alban Hoti', 5, 'normal'),
  (29, 'Alban Nitaj', 10, 'normal'),
  (30, 'Erblina Grajqevci', 3, 'normal'),
  (31, 'Arjoneta Meholli', 10, 'normal'),
  (32, 'Flamur Fazliu', 2, 'normal'),
  (33, 'Ardian Elshani', 2, 'normal'),
  (34, 'Arbrije Gegaj', 2, 'normal'),
  (35, 'Almir Bilalli', 3, 'normal'),
  (36, 'Arbenita Nuredini', 5, 'normal'),
  (37, 'Besjana Rrahmani', 4, 'normal'),
  (38, 'Diana Ramaj', 1, 'normal'),
  (39, 'Elvana Sopa', 13, 'normal'),
  (40, 'Besnik Bullaku', 5, 'normal'),
  (41, 'Edona Gjergji', 3, 'normal'),
  (42, 'Shendrit Rafuna', 2, 'normal'),
  (43, 'Dorian Agani', 20, 'normal'),
  (44, 'Faton Nimani', 2, 'normal'),
  (45, 'Albert Zeqiri', 10, 'normal'),
  (46, 'Armend Haliti', 10, 'normal'),
  (47, 'Shqipdon Bajraktari', 4, 'normal'),
  (48, 'Jakup Lami', 28, 'normal'),
  (49, 'Elmedina Kurtishi Ademaj', 8, 'normal'),
  (50, 'Gentiana Haliti', 1, 'normal'),
  (51, 'Besnik Gjakolaj', 10, 'normal'),
  (52, 'Fatos Behlluli', 3, 'normal'),
  (53, 'Rejan Mehmeti', 3, 'normal'),
  (54, 'Flora Çacaj', 4, 'normal'),
  (55, 'Djellona Meta', 6, 'normal'),
  (56, 'Tamara Lazic', 1, 'normal'),
  (57, 'Gresa Sinani', 2, 'normal'),
  (58, 'Adrian Curri', 3, 'normal'),
  (59, 'Fiton Gajraku', 1, 'normal'),
  (60, 'Shkelqim Shkëmbi', 3, 'normal'),
  (61, 'Antigona Muqaj', 4, 'normal'),
  (62, 'Anduena Fazliu', 2, 'normal'),
  (63, 'Medina Kryeziu', 1, 'normal'),
  (64, 'Drilon Avdiu', 3, 'normal'),
  (65, 'Daut Osmani', 1, 'normal'),
  (66, 'Adrian Curri', 3, 'private'),
  (67, 'Granit Krasniqi', 1, 'private'),
  (68, 'Ersin', 10, 'private'),
  (69, 'Njomza', 2, 'private'),
  (70, 'Arianit', 1, 'private'),
  (71, 'Dea Robaj', 1, 'private'),
  (72, 'Dorian Agani', 20, 'private'),
  (73, 'Erza Krasniqi', 4, 'private'),
  (74, 'Ujron Krasniqi', 5, 'private'),
  (75, 'Emër mungon – Ulpianë', 2, 'private'),
  (76, 'Dion Mulaj', 5, 'private'),
  (77, 'Olesa Zemaj', 2, 'private'),
  (78, 'Safie', 5, 'private');

-- A completed batch is a no-op. A partial batch is an error requiring manual
-- review; neither case can silently create duplicate historical sales.
select (
  count(*) = 78
  and round(coalesce(sum(total_amount), 0), 2) = 751.00
) as import_complete
from public.invoices
where company_id = 'be75d0be-3d1e-4e8b-80b6-88b8722f3f1e'::uuid
  and notes like 'FENERI-HISTORICAL-SALES-001-%';
\gset

\if :import_complete
  \echo 'FENERI-HISTORICAL-SALES-001 is already complete; no changes made.'
  rollback;
  \quit
\endif

do $$
begin
  if exists (
    select 1
    from public.invoices
    where company_id = 'be75d0be-3d1e-4e8b-80b6-88b8722f3f1e'::uuid
      and notes like 'FENERI-HISTORICAL-SALES-001-%'
  ) then
    raise exception 'A partial FENERI-HISTORICAL-SALES-001 batch already exists; refusing to append to it'
      using errcode = '55000';
  end if;
end
$$;

do $$
declare
  v_batch constant text := 'FENERI-HISTORICAL-SALES-001';
  v_company_id uuid;
  v_actor_id uuid;
  v_cash_account_id uuid;
  v_fener_product_id uuid;
  v_transport_product_id uuid;
  v_private_transport_product_id uuid;
  v_client_id uuid;
  v_existing_id uuid;
  v_invoice_key uuid;
  v_payment_key uuid;
  v_invoice_number text;
  v_display_name text;
  v_note text;
  v_sale_reference text;
  v_import_date date := current_date;
  v_invoice public.invoices;
  v_payment public.payments;
  v_row record;
  v_expected_total numeric(20,4);
  v_inserted_count integer := 0;
begin
  select company.id
    into v_company_id
  from public.companies company
  where lower(trim(company.company_name)) = 'feneri'
  order by company.id;

  if v_company_id is null then
    raise exception 'Feneri company was not found';
  end if;
  if v_company_id <> 'be75d0be-3d1e-4e8b-80b6-88b8722f3f1e'::uuid then
    raise exception 'Feneri company ID changed unexpectedly: %', v_company_id;
  end if;

  select id into v_actor_id
  from auth.users
  where lower(email) = 'admin@lrdy-group.com'
  limit 1;
  if v_actor_id is null then
    raise exception 'Import actor admin@lrdy-group.com was not found';
  end if;

  perform set_config('request.jwt.claim.sub', v_actor_id::text, true);

  if not private.has_company_permission(v_company_id, 'accounts.manage')
     or not private.has_company_permission(v_company_id, 'sales_invoice.create')
     or not private.has_company_permission(v_company_id, 'sales_invoice.post')
     or not private.has_company_permission(v_company_id, 'customer_payment.record')
     or not private.has_company_permission(v_company_id, 'customer_payment.allocate') then
    raise exception 'Import actor lacks the required Feneri permissions';
  end if;

  -- Feneri was created without its accounting foundation. The existing
  -- initializer is idempotent and seeds the chart, 2026 periods, and posting
  -- rules needed by the normal invoice/payment posting paths.
  perform public.initialize_company_accounting(v_company_id, date '2026-01-01', 'xk-operix-base-v1');

  select id into v_cash_account_id
  from public.chart_of_accounts
  where company_id = v_company_id
    and code = '1010'
    and active
    and posting_allowed
  limit 1;
  if v_cash_account_id is null then
    raise exception 'Feneri cash settlement account 1010 was not initialized';
  end if;

  -- Reuse an existing clearly equivalent product if one exists. With no
  -- existing Feneri product, create the normal ProductForm-compatible record.
  select product.id into v_fener_product_id
  from public.products product
  where product.company_id = v_company_id
    and lower(trim(product.name)) in ('fener', 'fenera')
  order by case when lower(trim(product.name)) = 'fener' then 0 else 1 end, product.created_at, product.id
  limit 1;

  if v_fener_product_id is null then
    insert into public.products (
      user_id, company_id, name, description, unit_price, category,
      stock_quantity, track_stock, low_stock_threshold, tax_included,
      tax_rate, unit, sku, purchase_currency, exchange_rate,
      supplier_unit_price, supplier_discount_percent,
      supplier_unit_price_after_discount, transport_cost, additional_cost,
      customs_base, customs_duty, excise, import_vat_rate, import_vat_amount,
      unit_cost_with_vat, vat_treatment
    ) values (
      v_actor_id, v_company_id, 'Fener', 'Feneri historical sales product', 1.50, 'Product',
      0, false, 5, false,
      0, 'pcs', 'FENERI-FENER', 'EUR', 1,
      0, 0, 0, 0, 0,
      0, 0, 0, 0, 0,
      0, 'standard_18'
    ) returning id into v_fener_product_id;
  else
    if exists (
      select 1 from public.products product
      where product.id = v_fener_product_id
        and (coalesce(product.tax_rate, 0) <> 0 or coalesce(product.tax_included, false) or coalesce(product.track_stock, false))
    ) then
      raise exception 'Existing Fener product has VAT or stock tracking configured; refusing to import without review';
    end if;
  end if;

  -- No shipping column exists in the current invoice model. These non-stock
  -- service products are the existing supported miscellaneous-line mechanism.
  select product.id into v_transport_product_id
  from public.products product
  where product.company_id = v_company_id
    and lower(trim(product.name)) in ('transport', 'transport normal')
  order by case when lower(trim(product.name)) = 'transport' then 0 else 1 end, product.created_at, product.id
  limit 1;
  if v_transport_product_id is null then
    insert into public.products (
      user_id, company_id, name, description, unit_price, category,
      stock_quantity, track_stock, low_stock_threshold, tax_included,
      tax_rate, unit, sku, purchase_currency, exchange_rate,
      supplier_unit_price, supplier_discount_percent,
      supplier_unit_price_after_discount, transport_cost, additional_cost,
      customs_base, customs_duty, excise, import_vat_rate, import_vat_amount,
      unit_cost_with_vat, vat_treatment
    ) values (
      v_actor_id, v_company_id, 'Transport', 'Normal transport service', 0.50, 'Service',
      0, false, 0, false,
      0, 'unit', 'FENERI-TRANSPORT', 'EUR', 1,
      0, 0, 0, 0, 0,
      0, 0, 0, 0, 0,
      0, 'standard_18'
    ) returning id into v_transport_product_id;
  end if;

  select product.id into v_private_transport_product_id
  from public.products product
  where product.company_id = v_company_id
    and lower(trim(product.name)) in ('transport privat', 'private transport')
  order by case when lower(trim(product.name)) = 'transport privat' then 0 else 1 end, product.created_at, product.id
  limit 1;
  if v_private_transport_product_id is null then
    insert into public.products (
      user_id, company_id, name, description, unit_price, category,
      stock_quantity, track_stock, low_stock_threshold, tax_included,
      tax_rate, unit, sku, purchase_currency, exchange_rate,
      supplier_unit_price, supplier_discount_percent,
      supplier_unit_price_after_discount, transport_cost, additional_cost,
      customs_base, customs_duty, excise, import_vat_rate, import_vat_amount,
      unit_cost_with_vat, vat_treatment
    ) values (
      v_actor_id, v_company_id, 'Transport privat', 'Private transport service', 3.00, 'Service',
      0, false, 0, false,
      0, 'unit', 'FENERI-TRANSPORT-PRIVAT', 'EUR', 1,
      0, 0, 0, 0, 0,
      0, 0, 0, 0, 0,
      0, 'standard_18'
    ) returning id into v_private_transport_product_id;
  end if;

  create temporary table _feneri_customer_map (
    source_customer_name text primary key,
    client_id uuid not null
  ) on commit drop;

  -- Resolve exact equivalent customers once, then reuse them for repeated
  -- historical rows. The missing-name row uses the documented Ulpianë label.
  for v_row in
    select distinct customer_name
    from _feneri_historical_sales
    order by customer_name
  loop
    v_display_name := case
      when v_row.customer_name = 'Emër mungon – Ulpianë' then 'Klient pa emër – Ulpianë'
      else v_row.customer_name
    end;

    select client.id into v_client_id
    from public.clients client
    where client.company_id = v_company_id
      and lower(trim(client.name)) = lower(trim(v_display_name))
    order by client.created_at, client.id
    limit 1;

    if v_client_id is null then
      insert into public.clients (
        user_id, company_id, name, notes, account_status, default_currency,
        pos_walk_in_customer
      ) values (
        v_actor_id, v_company_id, v_display_name,
        case when v_row.customer_name = 'Emër mungon – Ulpianë'
          then 'Source customer reference: Emër mungon – Ulpianë. Historical Feneri import.'
          else 'Historical Feneri import customer.'
        end,
        'active', 'EUR', false
      ) returning id into v_client_id;
    end if;

    insert into _feneri_customer_map (source_customer_name, client_id)
    values (v_row.customer_name, v_client_id);
  end loop;

  for v_row in select * from _feneri_historical_sales order by row_number loop
    v_sale_reference := v_batch || '-' || lpad(v_row.row_number::text, 3, '0');
    v_invoice_key := md5(v_sale_reference || ':invoice')::uuid;
    v_payment_key := md5(v_sale_reference || ':payment')::uuid;
    v_expected_total := round(v_row.quantity * 1.50 + case when v_row.transport_type = 'normal' then 0.50 else 3.00 end, 2);
    select client_id into v_client_id
    from _feneri_customer_map
    where source_customer_name = v_row.customer_name;

    if v_client_id is null then
      raise exception 'Customer mapping is missing for import row %', v_row.row_number;
    end if;
    if exists (select 1 from public.invoices where company_id = v_company_id and idempotency_key = v_invoice_key)
       or exists (select 1 from public.payments where company_id = v_company_id and idempotency_key = v_payment_key) then
      raise exception 'Deterministic import key already exists for %', v_sale_reference
        using errcode = '55000';
    end if;

    v_invoice_number := public.reserve_invoice_number(v_company_id, 'invoice', v_import_date);
    v_note := v_sale_reference || ' | Historical Feneri sales import – source: manual sales list | Original customer: ' || v_row.customer_name;

    v_invoice := public.create_stock_tracked_invoice(
      jsonb_build_object(
        'user_id', v_actor_id::text,
        'company_id', v_company_id::text,
        'client_id', v_client_id::text,
        'invoice_number', v_invoice_number,
        'issue_date', v_import_date::text,
        'due_date', v_import_date::text,
        'notes', v_note,
        'status', 'draft',
        'tax_amount', '0',
        'discount_amount', '0',
        'discount_percent', '0',
        'total_amount', v_expected_total::text,
        'amount_received', v_expected_total::text,
        'payment_method', 'cash',
        'change_amount', '0',
        'idempotency_key', v_invoice_key::text
      ),
      jsonb_build_array(
        jsonb_build_object(
          'product_id', v_fener_product_id,
          'description', 'Fener',
          'quantity', v_row.quantity,
          'unit', 'pcs',
          'unit_price', 1.50,
          'tax_rate', 0,
          'discount', 0,
          'sku', 'FENERI-FENER',
          'amount', round(v_row.quantity * 1.50, 2)
        ),
        jsonb_build_object(
          'product_id', case when v_row.transport_type = 'normal' then v_transport_product_id else v_private_transport_product_id end,
          'description', case when v_row.transport_type = 'normal' then 'Transport' else 'Transport privat' end,
          'quantity', 1,
          'unit', 'unit',
          'unit_price', case when v_row.transport_type = 'normal' then 0.50 else 3.00 end,
          'tax_rate', 0,
          'discount', 0,
          'sku', case when v_row.transport_type = 'normal' then 'FENERI-TRANSPORT' else 'FENERI-TRANSPORT-PRIVAT' end,
          'amount', case when v_row.transport_type = 'normal' then 0.50 else 3.00 end
        )
      ),
      v_invoice_key
    );

    v_invoice := public.prepare_sales_invoice_for_posting(v_invoice.id, 'Historical Feneri sales import');
    v_invoice := public.post_sales_invoice(v_invoice.id, v_invoice_key, 'Historical Feneri sales import');

    v_payment := public.record_customer_payment(
      v_company_id,
      v_client_id,
      v_import_date,
      v_expected_total,
      'cash',
      v_cash_account_id,
      v_sale_reference,
      v_note,
      null,
      'EUR',
      v_payment_key
    );
    perform public.allocate_customer_payment(v_payment.id, v_invoice.id, v_expected_total, v_import_date);
    v_inserted_count := v_inserted_count + 1;
  end loop;

  -- Final in-transaction guard: a mismatch aborts the entire import.
  select count(*) into v_inserted_count
  from public.invoices
  where company_id = v_company_id
    and notes like v_batch || '-%';
  if v_inserted_count <> 78 then
    raise exception 'Imported invoice count is %, expected 78', v_inserted_count;
  end if;

  if round((select coalesce(sum(total_amount), 0) from public.invoices where company_id = v_company_id and notes like v_batch || '-%'), 2) <> 751.00 then
    raise exception 'Imported invoice total does not equal 751.00';
  end if;
  if round((select coalesce(sum(payment.amount), 0) from public.payments payment where payment.company_id = v_company_id and payment.notes like v_batch || '-%'), 2) <> 751.00 then
    raise exception 'Imported payment total does not equal 751.00';
  end if;
  if exists (
    select 1 from public.invoices invoice
    where invoice.company_id = v_company_id
      and invoice.notes like v_batch || '-%'
      and (invoice.status <> 'paid' or invoice.accounting_state <> 'posted' or invoice.posting_journal_entry_id is null)
  ) then
    raise exception 'At least one imported invoice is not paid and posted';
  end if;
  if (select count(*) from public.inventory_movements where company_id = v_company_id) <> 0
     or (select count(*) from public.inventory_stock_movements where company_id = v_company_id) <> 0 then
    raise exception 'Historical import unexpectedly created inventory movements';
  end if;
end
$$;

commit;
