\set ON_ERROR_STOP on

-- Sales Book period checks use the seeded Feneri workspace and roll back every
-- fixture change. They exercise the database controls, not just the mobile UI.
begin;

select set_config('request.jwt.claim.sub', 'e6b66baa-6eac-4be7-bd2c-c87cad1138d2', true);

do $$
declare
  v_period record;
  v_company_id uuid := 'be75d0be-3d1e-4e8b-80b6-88b8722f3f1e';
  v_other_company_id uuid := '25a2477e-0f64-41ad-be0d-61cead706919';
  v_invoice_id uuid;
  v_august_id uuid;
  v_september_id uuid;
  v_status text;
begin
  select * into v_period from private.sales_book_period_dates(date '2026-08-31', 'monthly');
  if v_period.period_start <> date '2026-08-01'
     or v_period.period_end <> date '2026-08-31'
     or v_period.declaration_deadline <> date '2026-09-20' then
    raise exception 'Monthly Kosovo period or deadline calculation is incorrect';
  end if;

  select * into v_period from private.sales_book_period_dates(date '2024-02-29', 'monthly');
  if v_period.period_end <> date '2024-02-29' then
    raise exception 'Leap-year February period is incorrect';
  end if;

  select * into v_period from private.sales_book_period_dates(date '2026-12-31', 'monthly');
  if v_period.period_start <> date '2026-12-01' or v_period.declaration_deadline <> date '2027-01-20' then
    raise exception 'December-to-January period transition is incorrect';
  end if;

  if private.sales_book_company_frequency(v_company_id) is not null then
    raise exception 'Non-VAT tenant unexpectedly has an active Sales Book strategy';
  end if;

  update public.companies
  set vat_registration_status = 'registered',
      accounting_period_frequency = 'monthly',
      vat_registration_date = date '2026-01-01'
  where id = v_company_id;
  update public.companies
  set vat_registration_status = 'registered',
      accounting_period_frequency = 'monthly',
      vat_registration_date = date '2026-01-01'
  where id = v_other_company_id;

  if not exists (
    select 1 from public.sales_book_periods
    where company_id = v_company_id and period_start = date '2026-08-01'
      and period_end = date '2026-08-31' and status = 'OPEN'
  ) then
    raise exception 'Current VAT period was not generated as OPEN';
  end if;

  select id into v_september_id
  from private.ensure_sales_book_period(v_company_id, date '2026-09-01', null);
  select id, status into v_august_id, v_status
  from public.sales_book_periods
  where company_id = v_company_id and period_start = date '2026-08-01';
  if v_status <> 'READY_FOR_DECLARATION' then
    raise exception 'Month rollover did not produce READY_FOR_DECLARATION';
  end if;
  if not exists (
    select 1 from public.sales_book_periods
    where id = v_september_id and period_start = date '2026-09-01'
      and period_end = date '2026-09-30' and status = 'OPEN'
  ) then
    raise exception 'New month was not created as OPEN';
  end if;
  if (select count(*) from public.sales_book_periods where company_id = v_company_id and period_start = date '2026-08-01') <> 1 then
    raise exception 'Duplicate Sales Book period was created';
  end if;

  begin
    perform public.ensure_sales_book_period(v_company_id, date '2099-01-01');
    raise exception 'Future Sales Book period creation was allowed';
  exception when others then
    if sqlstate <> '22023' then raise; end if;
  end;

  begin
    perform public.mark_sales_book_declared(v_august_id, false, null);
    raise exception 'Declaration without explicit confirmation was allowed';
  exception when others then
    if sqlstate <> '55000' then raise; end if;
  end;

  insert into public.invoices (
    user_id, company_id, invoice_number, issue_date, due_date, status, type
  ) values (
    'e6b66baa-6eac-4be7-bd2c-c87cad1138d2', v_company_id,
    'SB-PERIOD-TEST', date '2026-08-15', date '2026-09-14', 'draft', 'invoice'
  ) returning id into v_invoice_id;
  if (select sales_book_period_id from public.invoices where id = v_invoice_id) <> v_august_id then
    raise exception 'Invoice was not assigned to its legal Sales Book period';
  end if;

  perform set_config('app.sales_book_period_workflow', 'authorized', true);
  update public.sales_book_periods set status = 'DECLARED' where id = v_august_id;
  perform set_config('app.sales_book_period_workflow', '', true);

  begin
    update public.invoices set issue_date = date '2026-08-16' where id = v_invoice_id;
    raise exception 'Declared invoice edit was allowed';
  exception when others then
    if sqlstate <> '55000' then raise; end if;
  end;
  begin
    delete from public.invoices where id = v_invoice_id;
    raise exception 'Declared invoice deletion was allowed';
  exception when others then
    if sqlstate <> '55000' then raise; end if;
  end;
  begin
    update public.sales_book_periods set status = 'OPEN' where id = v_august_id;
    raise exception 'Declared period was reopened';
  exception when others then
    if sqlstate <> '55000' then raise; end if;
  end;
end
$$;

do $$
declare
  v_company_id uuid := 'be75d0be-3d1e-4e8b-80b6-88b8722f3f1e';
  v_period_id uuid;
  v_invoice_id uuid;
  v_amendment_id uuid;
  v_invoice_payload jsonb;
  v_items_payload jsonb;
  v_updated_invoice public.invoices;
begin
  select p.id into v_period_id
  from public.sales_book_periods p
  where p.company_id = v_company_id and p.period_start = date '2026-08-01';
  select i.id into v_invoice_id
  from public.invoices i
  where i.company_id = v_company_id
    and i.issue_date between date '2026-08-01' and date '2026-08-31'
    and i.accounting_state = 'posted'
    and exists (select 1 from public.invoice_items item where item.invoice_id = i.id)
    and not exists (select 1 from public.inventory_stock_movements movement where movement.invoice_id = i.id)
    and not exists (select 1 from public.document_source_links link where link.source_id = i.id or link.target_id = i.id)
  order by i.issue_date desc
  limit 1;
  if v_invoice_id is null then
    raise exception 'No posted invoice was available for the amendment test';
  end if;
  select to_jsonb(i) into v_invoice_payload from public.invoices i where i.id = v_invoice_id;
  select jsonb_agg(to_jsonb(item)) into v_items_payload from public.invoice_items item where item.invoice_id = v_invoice_id;
  v_amendment_id := (select id from public.create_sales_book_amendment(v_period_id, v_invoice_id, 'Test declared Sales Book correction'));
  v_updated_invoice := public.apply_sales_book_amendment(v_amendment_id, v_invoice_payload, v_items_payload, gen_random_uuid());
  if v_updated_invoice.id <> v_invoice_id then
    raise exception 'Amendment returned a different invoice';
  end if;
  if (select status from public.sales_book_amendments where id = v_amendment_id) <> 'APPLIED' then
    raise exception 'Amendment was not marked APPLIED';
  end if;
  if (select status from public.sales_book_periods where id = v_period_id) <> 'AMENDED' then
    raise exception 'Applied amendment did not move the period to AMENDED';
  end if;
end
$$;

set local role authenticated;
do $$
begin
  if exists (
    select 1 from public.sales_book_periods
    where company_id = '25a2477e-0f64-41ad-be0d-61cead706919'::uuid
  ) then
    raise exception 'Sales Book RLS exposed another tenant period';
  end if;
end
$$;
reset role;

rollback;

select 'Sales Book period lifecycle database tests passed' as result;
