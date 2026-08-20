\set ON_ERROR_STOP on

-- Run only against a disposable/local/staging Supabase database. Every write is
-- inside a transaction and is rolled back. Supply IDs for two real test
-- tenants, their users, and representative rows with psql -v arguments.
-- Example arguments are documented in docs/testing/MOBILE-TEST-REPORT.md.
\if :{?tenant_a_id}
\else
\echo 'Missing tenant_a_id; refusing to run the mobile security test.'
\quit 3
\endif
\if :{?tenant_b_id}
\else
\echo 'Missing tenant_b_id; refusing to run the mobile security test.'
\quit 3
\endif
\if :{?user_a_id}
\else
\echo 'Missing user_a_id; refusing to run the mobile security test.'
\quit 3
\endif
\if :{?invoice_a_id}
\else
\echo 'Missing invoice_a_id; refusing to run the mobile security test.'
\quit 3
\endif
\if :{?invoice_b_id}
\else
\echo 'Missing invoice_b_id; refusing to run the mobile security test.'
\quit 3
\endif
\if :{?customer_b_id}
\else
\echo 'Missing customer_b_id; refusing to run the mobile security test.'
\quit 3
\endif
\if :{?product_b_id}
\else
\echo 'Missing product_b_id; refusing to run the mobile security test.'
\quit 3
\endif
\if :{?payment_b_id}
\else
\echo 'Missing payment_b_id; refusing to run the mobile security test.'
\quit 3
\endif

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'user_a_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  v_count bigint;
  v_rows integer;
begin
  -- Tenant A can read its own invoice through the underlying table query.
  select count(*) into v_count
  from public.invoices
  where id = :'invoice_a_id'::uuid
    and company_id = :'tenant_a_id'::uuid;
  if v_count <> 1 then
    raise exception 'Tenant A fixture invoice was not readable';
  end if;

  -- Direct reads must not leak tenant B data. These are intentionally direct
  -- table/view queries, not UI assertions.
  select count(*) into v_count from public.invoices where id = :'invoice_b_id'::uuid;
  if v_count <> 0 then raise exception 'Tenant A read Tenant B invoice'; end if;

  select count(*) into v_count from public.clients where id = :'customer_b_id'::uuid;
  if v_count <> 0 then raise exception 'Tenant A read Tenant B customer'; end if;

  select count(*) into v_count from public.products where id = :'product_b_id'::uuid;
  if v_count <> 0 then raise exception 'Tenant A read Tenant B product'; end if;

  select count(*) into v_count from public.payments where id = :'payment_b_id'::uuid;
  if v_count <> 0 then raise exception 'Tenant A read Tenant B payment'; end if;

  select count(*) into v_count
  from public.operix_report_summary
  where company_id = :'tenant_b_id'::uuid;
  if v_count <> 0 then raise exception 'Tenant A read Tenant B report summary'; end if;

  -- UPDATE and DELETE must affect zero rows even when the caller knows the
  -- foreign tenant's primary key.
  update public.invoices set notes = 'MOBILE SECURITY SHOULD NOT WRITE'
  where id = :'invoice_b_id'::uuid;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'Tenant A updated Tenant B invoice'; end if;

  delete from public.clients where id = :'customer_b_id'::uuid;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'Tenant A deleted Tenant B customer'; end if;

  update public.products set name = 'MOBILE SECURITY SHOULD NOT WRITE'
  where id = :'product_b_id'::uuid;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'Tenant A updated Tenant B product'; end if;

  delete from public.payments where id = :'payment_b_id'::uuid;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'Tenant A deleted Tenant B payment'; end if;
end
$$;

-- The security-definer invoice delete command must enforce the company
-- permission boundary too; it must not be possible to bypass RLS by calling
-- the RPC directly.
do $$
begin
  begin
    perform public.delete_invoice(:'invoice_b_id'::uuid);
    raise exception 'Tenant A deleted Tenant B invoice through delete_invoice RPC';
  exception when others then
    if sqlstate not in ('42501', '55000', 'P0002') then raise; end if;
  end;
end
$$;

rollback;
select 'OperiX Invoice Mobile tenant isolation tests passed' as result;
