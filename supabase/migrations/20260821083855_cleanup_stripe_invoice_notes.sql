-- Keep Stripe-imported invoice notes focused on the transaction reference.
-- The trigger also covers databases where the original Stripe migration has
-- already been applied and protects future imports until the function is
-- refreshed by the migration history.

create or replace function public.normalize_stripe_invoice_note()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.source_document_type = 'stripe_transaction'
     and new.notes like 'Imported from Stripe store %. Stripe transaction: %' then
    new.notes := 'Stripe transaction: ' || split_part(new.notes, '. Stripe transaction: ', 2);
  end if;
  return new;
end;
$$;

drop trigger if exists normalize_stripe_invoice_note on public.invoices;
create trigger normalize_stripe_invoice_note
before insert or update of notes on public.invoices
for each row
execute function public.normalize_stripe_invoice_note();

update public.invoices
set notes = 'Stripe transaction: ' || split_part(notes, '. Stripe transaction: ', 2)
where source_document_type = 'stripe_transaction'
  and notes like 'Imported from Stripe store %. Stripe transaction: %';
