-- Keep the Reports hub from downloading every invoice just to calculate one card.
-- Migration filename normalized to keep the historical version unique.
-- The view returns one aggregate row per tenant and is intentionally read-only.

create index if not exists invoices_reporting_summary_idx
  on public.invoices(company_id, accounting_state, status);

do $migration$
declare
  has_commercial_type boolean;
  has_commercial_status boolean;
  commercial_type_expr text;
  commercial_status_expr text;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'invoices' and column_name = 'commercial_document_type'
  ) into has_commercial_type;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'invoices' and column_name = 'commercial_status'
  ) into has_commercial_status;

  commercial_type_expr := case when has_commercial_type then 'invoice.commercial_document_type' else 'null::text' end;
  commercial_status_expr := case when has_commercial_status then 'invoice.commercial_status' else 'null::text' end;

  execute format($view$
    create or replace view public.operix_report_gross_sales
    with (security_invoker = true)
    as
    select
      invoice.company_id,
      coalesce(sum(invoice.total_amount) filter (
        where invoice.status::text not in ('cancelled', 'reversed', 'credited')
          and coalesce(upper(nullif(trim(%2$s), '')), '') not in ('CANCELLED', 'CREDITED', 'REVERSED')
          and (
            case
              when nullif(trim(%1$s), '') is not null then upper(trim(%1$s))
              when lower(trim(coalesce(invoice.subtype, ''))) = 'offer'
                or (lower(trim(coalesce(invoice.type, ''))) = 'offer' and nullif(trim(invoice.subtype), '') is null)
                then 'QUOTE'
              when lower(trim(coalesce(invoice.subtype, ''))) in ('pro_invoice', 'proforma')
                or lower(trim(coalesce(invoice.type, ''))) = 'proforma'
                then 'PROFORMA'
              when lower(trim(coalesce(invoice.subtype, ''))) = 'order'
                or lower(trim(coalesce(invoice.type, ''))) = 'order'
                then 'SALES_ORDER'
              when lower(trim(coalesce(invoice.subtype, ''))) = 'delivery_note' then 'DELIVERY_NOTE'
              when lower(trim(coalesce(invoice.subtype, ''))) = 'advance_invoice' then 'ADVANCE_INVOICE'
              when lower(trim(coalesce(invoice.subtype, ''))) = 'final_invoice' then 'FINAL_INVOICE'
              when lower(trim(coalesce(invoice.subtype, ''))) = 'credit_note' then 'CREDIT_NOTE'
              when lower(trim(coalesce(invoice.subtype, ''))) = 'debit_note' then 'DEBIT_NOTE'
              when lower(trim(coalesce(invoice.subtype, ''))) = 'simplified_invoice' then 'SIMPLIFIED_INVOICE'
              when lower(trim(coalesce(invoice.subtype, ''))) = 'fiscal_receipt' then 'FISCAL_RECEIPT'
              when lower(trim(coalesce(invoice.subtype, ''))) = 'bad_debt_invoice' then 'BAD_DEBT_INVOICE'
              else 'INVOICE'
            end
          ) in ('INVOICE', 'FINAL_INVOICE', 'ADVANCE_INVOICE', 'SIMPLIFIED_INVOICE')
      ), 0)::numeric(20,4) as gross_sales
    from public.invoices invoice
    where invoice.accounting_state = 'posted'
    group by invoice.company_id
  $view$, commercial_type_expr, commercial_status_expr);
end
$migration$;

grant select on public.operix_report_gross_sales to authenticated;
