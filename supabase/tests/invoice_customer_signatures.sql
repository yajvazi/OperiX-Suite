\set ON_ERROR_STOP on

-- Customer signatures use the existing invoice row, RLS and posted-document
-- immutability rules. The fixture is transactional and is rolled back below.
begin;

do $$
declare
  v_company_id uuid := 'b984c30b-fd41-4a82-96b8-97d536638f0b';
  v_user_id uuid := 'e6b66baa-6eac-4be7-bd2c-c87cad1138d2';
  v_client_id uuid;
  v_invoice_id uuid;
  v_wrapper_invoice public.invoices;
  v_idempotency_key uuid := gen_random_uuid();
begin
  perform set_config('request.jwt.claim.sub', v_user_id::text, true);

  insert into public.clients (user_id, company_id, name)
  values (v_user_id, v_company_id, 'Signature Test Customer')
  returning id into v_client_id;

  insert into public.invoices (
    user_id, company_id, client_id, invoice_number, issue_date, due_date,
    status, type, customer_signature_requested, customer_signature_status,
    customer_signature_name, customer_signed_at, buyer_signature_url
  ) values (
    v_user_id, v_company_id, v_client_id, 'SIGNATURE-TEST-INV', date '2026-08-12',
    date '2026-09-11', 'draft', 'invoice', true, 'signed',
    'Signature Test Customer', timestamptz '2026-08-12 12:00:00+00',
    'data:image/png;base64,signature-test'
  ) returning id into v_invoice_id;

  if not exists (
    select 1 from public.invoices
    where id = v_invoice_id
      and customer_signature_requested
      and customer_signature_status = 'signed'
      and buyer_signature_url is not null
  ) then
    raise exception 'Customer signature was not stored on the invoice';
  end if;

  if not exists (
    select 1 from public.audit_events
    where entity_type = 'invoices'
      and entity_id = v_invoice_id
      and action = 'customer_signature_requested'
  ) then
    raise exception 'Customer signature audit event was not created';
  end if;

  -- The transactional POS wrapper stores the same signature fields without a
  -- separate client update, and is safe to retry with the same idempotency key.
  v_wrapper_invoice := public.create_stock_tracked_invoice_with_signature(
    jsonb_build_object(
      'user_id', v_user_id,
      'company_id', v_company_id,
      'invoice_number', 'SIGNATURE-TEST-POS',
      'issue_date', '2026-08-12',
      'due_date', '2026-08-12',
      'status', 'draft',
      'type', 'invoice',
      'total_amount', 11.8,
      'tax_amount', 1.8,
      'payment_method', 'cash'
    ),
    jsonb_build_array(jsonb_build_object(
      'description', 'Signature test item',
      'quantity', 1,
      'unit', 'pcs',
      'unit_price', 10,
      'tax_rate', 18,
      'discount', 0,
      'amount', 10
    )),
    v_idempotency_key,
    jsonb_build_object(
      'requested', true,
      'signature_url', 'data:image/png;base64,wrapper-signature-test',
      'name', 'Signature Test Customer'
    )
  );

  if v_wrapper_invoice.customer_signature_status <> 'signed'
     or v_wrapper_invoice.buyer_signature_url is null then
    raise exception 'Transactional signature wrapper did not return a signed invoice';
  end if;

  v_wrapper_invoice := public.create_stock_tracked_invoice_with_signature(
    jsonb_build_object(
      'user_id', v_user_id,
      'company_id', v_company_id,
      'invoice_number', 'SIGNATURE-TEST-POS',
      'issue_date', '2026-08-12',
      'status', 'draft',
      'type', 'invoice'
    ),
    jsonb_build_array(jsonb_build_object('description', 'Retry', 'quantity', 1, 'unit_price', 10, 'amount', 10)),
    v_idempotency_key,
    jsonb_build_object(
      'requested', true,
      'signature_url', 'data:image/png;base64,wrapper-signature-test',
      'name', 'Signature Test Customer'
    )
  );

  if v_wrapper_invoice.id is null or v_wrapper_invoice.customer_signature_status <> 'signed' then
    raise exception 'Signature wrapper retry was not idempotent';
  end if;

  perform public.post_pos_invoice(v_wrapper_invoice.id, v_idempotency_key, 'Signature test posting');
  begin
    update public.invoices
    set buyer_signature_url = 'data:image/png;base64,changed-after-posting'
    where id = v_wrapper_invoice.id;
    raise exception 'Posted invoice customer signature was mutable';
  exception when others then
    if sqlstate <> '55000' then raise; end if;
  end;

  raise notice 'Invoice customer signature tests passed';
end
$$;

rollback;

-- Company RLS remains the boundary for signature-bearing invoice rows.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e6b66baa-6eac-4be7-bd2c-c87cad1138d2', true);
do $$
begin
  if exists (
    select 1 from public.invoices
    where company_id = '25a2477e-0f64-41ad-be0d-61cead706919'::uuid
      and customer_signature_requested
  ) then
    raise exception 'Cross-tenant signed invoice read was allowed';
  end if;
end
$$;
rollback;

select 'Invoice customer signature tests passed' as result;
