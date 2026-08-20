-- Sales Book availability is no longer gated by VAT registration status.
-- VAT registration remains tax metadata, but it does not prevent a company
-- from maintaining a Sales Book.

create or replace function private.sales_book_company_frequency(p_company_id uuid)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  company_row public.companies;
  configured_frequency text;
begin
  select * into company_row from public.companies where id = p_company_id;
  if not found then
    raise exception 'Company not found' using errcode = 'P0002';
  end if;

  configured_frequency := lower(nullif(trim(coalesce(company_row.accounting_period_frequency, '')), ''));
  if configured_frequency is null then
    raise exception 'Sales Book reporting frequency is not configured for this company' using errcode = '55000';
  end if;
  if configured_frequency not in ('monthly', 'quarterly', 'annual') then
    raise exception 'Sales Book reporting frequency is not supported: %', configured_frequency using errcode = '55000';
  end if;
  return configured_frequency;
end
$$;

create or replace function private.sync_sales_book_company_setup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  frequency text;
  first_date date;
  cursor_date date;
  today date := (timezone('Europe/Belgrade', clock_timestamp()))::date;
begin
  if tg_op = 'UPDATE'
     and new.vat_registration_status is not distinct from old.vat_registration_status
     and new.accounting_period_frequency is not distinct from old.accounting_period_frequency
     and new.vat_registration_date is not distinct from old.vat_registration_date then
    return new;
  end if;

  frequency := private.sales_book_company_frequency(new.id);
  first_date := coalesce(
    new.vat_registration_date,
    (select min(invoice.issue_date) from public.invoices invoice where invoice.company_id = new.id),
    today
  );
  cursor_date := first_date;
  perform set_config('app.sales_book_workflow', 'migration', true);
  while cursor_date <= today loop
    perform private.ensure_sales_book_period(new.id, cursor_date, null);
    cursor_date := case frequency
      when 'monthly' then (date_trunc('month', cursor_date::timestamp) + interval '1 month')::date
      when 'quarterly' then (date_trunc('quarter', cursor_date::timestamp) + interval '3 months')::date
      else (date_trunc('year', cursor_date::timestamp) + interval '1 year')::date
    end;
  end loop;
  perform set_config('app.financial_workflow', 'authorized', true);
  update public.invoices invoice
  set sales_book_period_id = period.id
  from public.sales_book_periods period
  where invoice.company_id = new.id
    and coalesce(invoice.issue_date, invoice.posting_date, today) between period.period_start and period.period_end
    and invoice.sales_book_period_id is distinct from period.id;
  perform set_config('app.financial_workflow', '', true);
  perform set_config('app.sales_book_workflow', '', true);
  return new;
exception when others then
  perform set_config('app.financial_workflow', '', true);
  perform set_config('app.sales_book_workflow', '', true);
  raise;
end
$$;

-- Backfill periods and invoice assignments for companies that were previously
-- excluded only because their VAT registration status was not "registered".
do $$
declare
  company_row record;
  first_date date;
  cursor_date date;
  frequency text;
  today date := (timezone('Europe/Belgrade', clock_timestamp()))::date;
begin
  for company_row in
    select company.id,
      coalesce(
        company.vat_registration_date,
        min(invoice.issue_date),
        today
      ) as first_date
    from public.companies company
    left join public.invoices invoice on invoice.company_id = company.id
    group by company.id, company.vat_registration_date
  loop
    frequency := private.sales_book_company_frequency(company_row.id);
    first_date := date_trunc('month', company_row.first_date)::date;
    cursor_date := first_date;
    while cursor_date <= today loop
      perform private.ensure_sales_book_period(company_row.id, cursor_date, null);
      cursor_date := case frequency
        when 'monthly' then (date_trunc('month', cursor_date::timestamp) + interval '1 month')::date
        when 'quarterly' then (date_trunc('quarter', cursor_date::timestamp) + interval '3 months')::date
        else (date_trunc('year', cursor_date::timestamp) + interval '1 year')::date
      end;
    end loop;
  end loop;

  perform set_config('app.sales_book_workflow', 'migration', true);
  perform set_config('app.financial_workflow', 'authorized', true);
  update public.invoices invoice
  set sales_book_period_id = period.id
  from public.sales_book_periods period
  where invoice.company_id = period.company_id
    and coalesce(invoice.issue_date, invoice.posting_date, today) between period.period_start and period.period_end
    and invoice.sales_book_period_id is distinct from period.id;
  perform set_config('app.financial_workflow', '', true);
  perform set_config('app.sales_book_workflow', '', true);
exception when others then
  perform set_config('app.financial_workflow', '', true);
  perform set_config('app.sales_book_workflow', '', true);
  raise;
end
$$;

drop trigger if exists companies_sales_book_setup on public.companies;
create trigger companies_sales_book_setup
after insert or update of vat_registration_status, accounting_period_frequency, vat_registration_date
on public.companies
for each row execute function private.sync_sales_book_company_setup();
