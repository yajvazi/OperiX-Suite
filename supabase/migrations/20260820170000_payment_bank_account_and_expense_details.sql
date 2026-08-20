-- Store the bank source for customer payments and the additional reference
-- details needed for bank-paid expenses.

alter table public.payments
  add column if not exists company_bank_account_id uuid references public.company_bank_accounts(id) on delete restrict;

alter table public.expenses
  add column if not exists bank_reference text,
  add column if not exists notes text;

create index if not exists payments_company_bank_account_idx
  on public.payments(company_bank_account_id)
  where company_bank_account_id is not null;

create or replace function private.validate_payment_bank_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_company_id uuid;
  account_active boolean;
begin
  if new.company_bank_account_id is null then
    return new;
  end if;

  if lower(coalesce(new.payment_method, 'cash')) <> 'bank' then
    raise exception 'A bank account can only be selected for a bank payment' using errcode = '23514';
  end if;

  select company_id, is_active
    into account_company_id, account_active
    from public.company_bank_accounts
   where id = new.company_bank_account_id;

  if account_company_id is null
     or account_company_id <> new.company_id
     or not coalesce(account_active, false) then
    raise exception 'The selected bank account is not available for this company' using errcode = '23503';
  end if;

  return new;
end;
$$;

drop trigger if exists payments_validate_bank_account on public.payments;
create trigger payments_validate_bank_account
before insert or update of company_id, payment_method, company_bank_account_id
on public.payments
for each row execute function private.validate_payment_bank_account();

-- Keep the existing payment accounting functions intact while adding the
-- selected company bank to the returned payment row.
create or replace function public.record_customer_payment_with_bank_account(
  p_company_id uuid,
  p_customer_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_payment_method text,
  p_settlement_account_id uuid,
  p_reference text default null,
  p_notes text default null,
  p_branch_id uuid default null,
  p_currency text default 'EUR',
  p_idempotency_key uuid default null,
  p_company_bank_account_id uuid default null
)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.payments;
  bank_row public.company_bank_accounts;
begin
  if p_company_bank_account_id is not null then
    select * into bank_row
      from public.company_bank_accounts
     where id = p_company_bank_account_id
       and company_id = p_company_id
       and is_active;
    if not found or lower(coalesce(p_payment_method, 'cash')) <> 'bank' then
      raise exception 'The selected bank account is not available for this payment' using errcode = '23503';
    end if;
  end if;

  payment_row := public.record_customer_payment(
    p_company_id,
    p_customer_id,
    p_payment_date,
    p_amount,
    p_payment_method,
    p_settlement_account_id,
    p_reference,
    p_notes,
    p_branch_id,
    p_currency,
    p_idempotency_key
  );

  perform set_config('app.financial_workflow', 'authorized', true);
  update public.payments
     set company_bank_account_id = p_company_bank_account_id
   where id = payment_row.id
   returning * into payment_row;
  perform set_config('app.financial_workflow', '', true);
  return payment_row;
end;
$$;

create or replace function public.update_customer_payment_with_bank_account(
  p_payment_id uuid,
  p_company_id uuid,
  p_customer_id uuid,
  p_invoice_id uuid default null,
  p_payment_date date default current_date,
  p_amount numeric default 0,
  p_payment_method text default 'bank',
  p_settlement_account_id uuid default null,
  p_reference text default null,
  p_notes text default null,
  p_currency text default 'EUR',
  p_idempotency_key uuid default null,
  p_reason text default 'Customer payment edited',
  p_company_bank_account_id uuid default null
)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.payments;
  bank_row public.company_bank_accounts;
begin
  if p_company_bank_account_id is not null then
    select * into bank_row
      from public.company_bank_accounts
     where id = p_company_bank_account_id
       and company_id = p_company_id
       and is_active;
    if not found or lower(coalesce(p_payment_method, 'cash')) <> 'bank' then
      raise exception 'The selected bank account is not available for this payment' using errcode = '23503';
    end if;
  end if;

  payment_row := public.update_customer_payment(
    p_payment_id,
    p_company_id,
    p_customer_id,
    p_invoice_id,
    p_payment_date,
    p_amount,
    p_payment_method,
    p_settlement_account_id,
    p_reference,
    p_notes,
    p_currency,
    p_idempotency_key,
    p_reason
  );

  perform set_config('app.financial_workflow', 'authorized', true);
  update public.payments
     set company_bank_account_id = p_company_bank_account_id
   where id = payment_row.id
   returning * into payment_row;
  perform set_config('app.financial_workflow', '', true);
  return payment_row;
end;
$$;

-- Add bank reference and notes to the newer expense correction overload while
-- retaining the previous overload for older mobile clients.
create or replace function public.correct_expense(
  p_expense_id uuid,
  p_amount numeric,
  p_category text,
  p_description text,
  p_date date,
  p_company_bank_account_id uuid,
  p_vendor_name text,
  p_invoice_number text,
  p_bank_reference text,
  p_notes text,
  p_receipt_url text default null,
  p_type text default 'expense',
  p_correction_id uuid default null,
  p_reason text default null,
  p_payment_method text default 'bank'
)
returns public.expenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  expense_row public.expenses;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into expense_row from public.expenses where id = p_expense_id for update;
  if not found then
    raise exception 'Expense not found' using errcode = 'P0002';
  end if;
  if expense_row.company_id is null
     or not coalesce(private.has_company_permission(expense_row.company_id, 'expense.post'), false)
     or not coalesce(private.has_company_permission(expense_row.company_id, 'journal.post'), false)
     or not coalesce(private.has_company_permission(expense_row.company_id, 'journal.reverse'), false) then
    raise exception 'You do not have permission to correct this expense' using errcode = '42501';
  end if;

  perform set_config('app.financial_workflow', 'authorized', true);
  perform set_config('app.change_reason', coalesce(nullif(trim(p_reason), ''), 'Expense metadata corrected'), true);
  update public.expenses
     set vendor_name = nullif(trim(p_vendor_name), ''),
         invoice_number = nullif(trim(p_invoice_number), ''),
         bank_reference = nullif(trim(p_bank_reference), ''),
         notes = nullif(trim(p_notes), ''),
         payment_method = lower(trim(coalesce(p_payment_method, 'bank'))),
         company_bank_account_id = p_company_bank_account_id
   where id = p_expense_id;
  perform set_config('app.change_reason', '', true);
  perform set_config('app.financial_workflow', '', true);

  -- Pass the selected bank through to the existing correction implementation.
  perform set_config('app.expense_bank_account_id', coalesce(p_company_bank_account_id::text, ''), true);
  expense_row := public.correct_expense(
    p_expense_id,
    p_amount,
    p_category,
    p_description,
    p_date,
    p_receipt_url,
    p_type,
    p_correction_id,
    p_reason,
    p_payment_method
  );
  perform set_config('app.expense_bank_account_id', '', true);
  return expense_row;
end;
$$;

revoke all on function public.record_customer_payment_with_bank_account(uuid, uuid, date, numeric, text, uuid, text, text, uuid, text, uuid, uuid) from public, anon;
grant execute on function public.record_customer_payment_with_bank_account(uuid, uuid, date, numeric, text, uuid, text, text, uuid, text, uuid, uuid) to authenticated;
revoke all on function public.update_customer_payment_with_bank_account(uuid, uuid, uuid, uuid, date, numeric, text, uuid, text, text, text, uuid, text, uuid) from public, anon;
grant execute on function public.update_customer_payment_with_bank_account(uuid, uuid, uuid, uuid, date, numeric, text, uuid, text, text, text, uuid, text, uuid) to authenticated;
revoke all on function public.correct_expense(uuid, numeric, text, text, date, uuid, text, text, text, text, text, text, uuid, text, text) from public, anon;
grant execute on function public.correct_expense(uuid, numeric, text, text, date, uuid, text, text, text, text, text, text, uuid, text, text) to authenticated;
