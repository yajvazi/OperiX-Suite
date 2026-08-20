-- Posted invoices remain financially immutable, but authorized auxiliary
-- RPCs may update non-financial display and delivery metadata.

create or replace function private.prevent_posted_financial_document_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  workflow_authorized boolean := coalesce(current_setting('app.financial_workflow', true), '') = 'authorized';
  auxiliary_workflow_authorized boolean := tg_table_name = 'invoices'
    and coalesce(current_setting('app.invoice_auxiliary_workflow', true), '') = 'authorized';
  prior_state text;
begin
  if tg_table_name = 'invoice_items' then
    select invoice.accounting_state
    into prior_state
    from public.invoices invoice
    where invoice.id = old.invoice_id;
  elsif tg_table_name = 'supplier_bill_items' then
    select bill.accounting_state
    into prior_state
    from public.supplier_bills bill
    where bill.id = old.bill_id;
  else
    prior_state := to_jsonb(old) ->> 'accounting_state';
  end if;

  prior_state := coalesce(prior_state, 'legacy');
  if prior_state in ('posted', 'reversed', 'opening_balance')
     and not workflow_authorized
     and not auxiliary_workflow_authorized then
    raise exception 'Posted financial records are immutable; use a correction or reversal workflow'
      using errcode = '55000';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.prevent_posted_financial_document_mutation() from public, authenticated;
