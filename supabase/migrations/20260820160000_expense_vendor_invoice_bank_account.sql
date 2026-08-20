-- Add the source details needed to identify an expense and the company bank
-- account used to pay it. The bank account is kept on the expense row so a
-- later change to Settings does not change the historical payment source.

alter table public.expenses
  add column if not exists vendor_name text,
  add column if not exists invoice_number text,
  add column if not exists company_bank_account_id uuid references public.company_bank_accounts(id) on delete restrict;

create index if not exists expenses_company_bank_account_idx
  on public.expenses(company_bank_account_id)
  where company_bank_account_id is not null;

-- A bank account can only be selected for a bank-paid expense in the same
-- company. This protects direct table writes as well as the mobile form.
create or replace function private.validate_expense_bank_account()
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

  if lower(coalesce(new.payment_method, 'bank')) <> 'bank' then
    raise exception 'A bank account can only be selected for a bank-paid expense' using errcode = '23514';
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

drop trigger if exists expenses_validate_bank_account on public.expenses;
create trigger expenses_validate_bank_account
before insert or update of company_id, payment_method, company_bank_account_id
on public.expenses
for each row execute function private.validate_expense_bank_account();

-- Use the selected bank's mapped accounting account when one is configured.
-- Accounts without a mapping retain the existing shared bank account fallback
-- (1020), while the selected bank remains recorded on the source expense and
-- journal metadata.
create or replace function private.create_expense_payment_journal(
  p_company_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_source_key text,
  p_posting_date date,
  p_document_date date,
  p_description text,
  p_amount numeric,
  p_currency text,
  p_branch_id uuid,
  p_payment_method text,
  p_metadata jsonb default '{}'::jsonb
)
returns public.journal_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  method text := lower(trim(coalesce(p_payment_method, 'bank')));
  gross numeric(20,4) := round(coalesce(p_amount, 0), 4);
  selected_bank_account_id uuid;
  selected_bank_account_id_for_gl uuid;
  expense_account uuid;
  settlement_account uuid;
  entry_row public.journal_entries;
begin
  if method not in ('cash', 'bank') then
    raise exception 'Expense payment method must be cash or bank' using errcode = '23514';
  end if;
  if gross <= 0 then
    raise exception 'Expense amount must be greater than zero' using errcode = '23514';
  end if;

  selected_bank_account_id := nullif(
    coalesce(
      nullif(p_metadata ->> 'company_bank_account_id', ''),
      nullif(current_setting('app.expense_bank_account_id', true), '')
    ),
    ''
  )::uuid;
  if method = 'bank' and selected_bank_account_id is not null then
    select account_id
      into selected_bank_account_id_for_gl
      from public.company_bank_accounts
     where id = selected_bank_account_id
       and company_id = p_company_id
       and is_active;
    if not found then
      raise exception 'The selected bank account is not available for this company' using errcode = '23503';
    end if;
  end if;

  select id into expense_account
    from public.chart_of_accounts
   where company_id = p_company_id and code = '6010' and active and posting_allowed;
  if expense_account is null then
    raise exception 'General operating expense account 6010 is not configured' using errcode = '23514';
  end if;

  if method = 'bank' and selected_bank_account_id_for_gl is not null then
    select id into settlement_account
      from public.chart_of_accounts
     where id = selected_bank_account_id_for_gl
       and company_id = p_company_id
       and active and posting_allowed;
    if settlement_account is null then
      raise exception 'The selected bank account is not mapped to an active accounting account' using errcode = '23514';
    end if;
  else
    select id into settlement_account
      from public.chart_of_accounts
     where company_id = p_company_id
       and code = case when method = 'cash' then '1010' else '1020' end
       and active and posting_allowed;
  end if;
  if settlement_account is null then
    raise exception 'The selected cash or bank account is not configured' using errcode = '23514';
  end if;

  entry_row := public.create_journal_entry(
    p_company_id,
    p_posting_date,
    p_document_date,
    coalesce(nullif(trim(p_description), ''), 'Expense'),
    p_source_key,
    upper(coalesce(nullif(trim(p_currency), ''), 'EUR')),
    1,
    p_branch_id,
    'automatic'
  );

  update public.journal_entries
     set source_type = p_source_type,
         source_id = p_source_id,
         source_key = p_source_key,
         metadata = coalesce(p_metadata, '{}'::jsonb)
           || jsonb_build_object('payment_method', method)
           || case
                when selected_bank_account_id is null then '{}'::jsonb
                else jsonb_build_object('company_bank_account_id', selected_bank_account_id)
              end,
         updated_by = (select auth.uid())
   where id = entry_row.id
   returning * into entry_row;

  insert into public.journal_entry_lines (
    journal_entry_id, company_id, line_number, account_id, description,
    debit, credit, transaction_currency, transaction_amount, exchange_rate,
    branch_id, created_by
  ) values
    (entry_row.id, p_company_id, 1, expense_account, 'General operating expense',
     gross, 0, upper(coalesce(nullif(trim(p_currency), ''), 'EUR')), gross, 1,
     p_branch_id, (select auth.uid())),
    (entry_row.id, p_company_id, 2, settlement_account,
     case when method = 'cash' then 'Cash expense payment' else 'Bank expense payment' end,
     0, gross, upper(coalesce(nullif(trim(p_currency), ''), 'EUR')), gross, 1,
     p_branch_id, (select auth.uid()));

  return public.post_journal_entry(entry_row.id, 'Expense posted');
end;
$$;

-- Keep the public posting command stable while passing the selected bank
-- account through to the journal metadata.
create or replace function public.post_expense(
  p_expense_id uuid,
  p_idempotency_key uuid default null,
  p_reason text default null
)
returns public.expenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  expense_row public.expenses;
  journal_row public.journal_entries;
begin
  select * into expense_row from public.expenses where id = p_expense_id for update;
  if not found then
    raise exception 'Expense not found' using errcode = 'P0002';
  end if;
  if not (select private.has_company_permission(expense_row.company_id, 'expense.post'))
    or not (select private.has_company_permission(expense_row.company_id, 'journal.post')) then
    raise exception 'Insufficient permission to post expenses' using errcode = '42501';
  end if;
  if expense_row.accounting_state = 'posted' then
    if p_idempotency_key is null or expense_row.idempotency_key = p_idempotency_key then
      return expense_row;
    end if;
    raise exception 'Expense has already been posted' using errcode = '55000';
  end if;
  if expense_row.accounting_state not in ('legacy', 'ready_for_posting') then
    raise exception 'Expense is not eligible for posting' using errcode = '55000';
  end if;
  if coalesce(expense_row.amount, 0) <= 0 then
    raise exception 'Expense amount must be greater than zero' using errcode = '23514';
  end if;

  journal_row := private.create_expense_payment_journal(
    expense_row.company_id, 'expense', expense_row.id, expense_row.id::text,
    coalesce(expense_row.posting_date, expense_row.date, current_date),
    coalesce(expense_row.date, current_date),
    coalesce(nullif(trim(expense_row.description), ''), 'Expense'),
    expense_row.amount, expense_row.currency, expense_row.branch_id,
    expense_row.payment_method, jsonb_build_object(
      'category', expense_row.category,
      'tax_code', expense_row.tax_code,
      'company_bank_account_id', expense_row.company_bank_account_id
    )
  );

  perform set_config('app.financial_workflow', 'authorized', true);
  perform set_config('app.change_reason', coalesce(nullif(trim(p_reason), ''), 'Expense posted'), true);
  update public.expenses
     set accounting_state = 'posted',
         posting_date = coalesce(posting_date, date, current_date),
         posting_journal_entry_id = journal_row.id,
         idempotency_key = coalesce(p_idempotency_key, idempotency_key)
   where id = expense_row.id
   returning * into expense_row;
  perform set_config('app.financial_workflow', '', true);
  perform set_config('app.change_reason', '', true);
  return expense_row;
end;
$$;

-- Extend the existing payment-method correction RPC without breaking clients
-- that still call its ten-argument overload. Metadata fields are updated under
-- the same audited workflow before the correction is reposted.
create or replace function public.correct_expense(
  p_expense_id uuid,
  p_amount numeric,
  p_category text,
  p_description text,
  p_date date,
  p_company_bank_account_id uuid,
  p_vendor_name text,
  p_invoice_number text,
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
         payment_method = lower(trim(coalesce(p_payment_method, 'bank'))),
         company_bank_account_id = p_company_bank_account_id
   where id = p_expense_id;
  perform set_config('app.change_reason', '', true);
  perform set_config('app.financial_workflow', '', true);

  -- The legacy ten-argument correction function rebuilds the journal through
  -- the private helper but does not receive the new bank-account argument.
  -- Keep the selected bank available for that nested call without changing
  -- the existing RPC signature.
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

revoke all on function public.correct_expense(uuid, numeric, text, text, date, uuid, text, text, text, text, uuid, text, text) from public, anon;
grant execute on function public.correct_expense(uuid, numeric, text, text, date, uuid, text, text, text, text, uuid, text, text) to authenticated;
