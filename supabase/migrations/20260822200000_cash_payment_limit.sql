-- Cash receipts must stay below the existing €300 product/legal threshold.
-- Keep this database-enforced so direct RPC/API calls cannot bypass the UI.

create or replace function private.enforce_customer_cash_payment_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(trim(coalesce(new.payment_method, ''))) = 'cash'
     and round(coalesce(new.amount, 0), 2) >= 300 then
    raise exception 'Cash payments are available only below 300.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists payments_enforce_cash_limit on public.payments;
create trigger payments_enforce_cash_limit
before insert or update of amount, payment_method on public.payments
for each row execute function private.enforce_customer_cash_payment_limit();
