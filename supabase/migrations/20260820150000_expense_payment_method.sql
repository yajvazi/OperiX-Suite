-- Record whether an expense was paid from cash or bank and post it to the
-- matching settlement account. Existing expenses keep the historical bank
-- behavior through the default value.

alter table public.expenses
  add column if not exists payment_method text not null default 'bank';

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.expenses'::regclass
       and conname = 'expenses_payment_method_check'
  ) then
    alter table public.expenses
      add constraint expenses_payment_method_check
      check (payment_method in ('cash', 'bank'));
  end if;
end;
$$;

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

  select id into expense_account
    from public.chart_of_accounts
   where company_id = p_company_id and code = '6010' and active and posting_allowed;
  if expense_account is null then
    raise exception 'General operating expense account 6010 is not configured' using errcode = '23514';
  end if;

  select id into settlement_account
    from public.chart_of_accounts
   where company_id = p_company_id
     and code = case when method = 'cash' then '1010' else '1020' end
     and active and posting_allowed;
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
         metadata = coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('payment_method', method),
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

-- Keep the public posting command stable; it now uses the expense's selected
-- settlement method instead of the old hard-coded bank rule.
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
      'tax_code', expense_row.tax_code
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

-- Overload the correction RPC with the payment method as an explicit input.
-- The original nine-argument function remains available for older clients.
create or replace function public.correct_expense(
  p_expense_id uuid,
  p_amount numeric,
  p_category text,
  p_description text,
  p_date date,
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
  current_journal public.journal_entries;
  correction_journal public.journal_entries;
  correction_id uuid := coalesce(p_correction_id, gen_random_uuid());
  correction_date date := current_date;
  normalized_amount numeric(20,4) := round(coalesce(p_amount, 0), 4);
  normalized_type text := lower(trim(coalesce(p_type, 'expense')));
  normalized_method text := lower(trim(coalesce(p_payment_method, 'bank')));
  correction_reason text := coalesce(nullif(trim(p_reason), ''), 'Expense corrected');
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_expense_id is null then
    raise exception 'Expense id is required' using errcode = '23514';
  end if;
  if normalized_amount <= 0 then
    raise exception 'Expense amount must be greater than zero' using errcode = '23514';
  end if;
  if normalized_type <> 'expense' then
    raise exception 'Only expense records can use the accounting correction workflow' using errcode = '55000';
  end if;
  if normalized_method not in ('cash', 'bank') then
    raise exception 'Expense payment method must be cash or bank' using errcode = '23514';
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

  select * into correction_journal
    from public.journal_entries
   where company_id = expense_row.company_id
     and source_type = 'expense_correction'
     and source_id = correction_id
     and entry_type = 'automatic';
  if found then
    if correction_journal.metadata ->> 'expense_id' is distinct from expense_row.id::text then
      raise exception 'Correction id is already used for another expense' using errcode = '23505';
    end if;
    return expense_row;
  end if;

  if expense_row.accounting_state <> 'posted' then
    raise exception 'Only posted expenses can be corrected' using errcode = '55000';
  end if;
  if expense_row.posting_journal_entry_id is null then
    raise exception 'The posted expense has no accounting journal' using errcode = '55000';
  end if;

  select * into current_journal
    from public.journal_entries
   where id = expense_row.posting_journal_entry_id
   for update;
  if not found or current_journal.status <> 'posted' then
    raise exception 'The current expense journal is not posted' using errcode = '55000';
  end if;
  if current_journal.entry_type <> 'automatic'
     or not (
       (current_journal.source_type = 'expense' and current_journal.source_id = expense_row.id)
       or (current_journal.source_type = 'expense_correction'
           and current_journal.metadata ->> 'expense_id' = expense_row.id::text)
     ) then
    raise exception 'The expense is linked to an unrelated journal entry' using errcode = '55000';
  end if;

  perform public.reverse_journal_entry(current_journal.id, correction_date, correction_reason);

  -- Reports read posted rows. Keeping the source posted alongside its posted
  -- reversal makes the old transaction net to zero while preserving audit data.
  perform set_config('app.financial_workflow', 'authorized', true);
  perform set_config('app.change_reason', correction_reason, true);
  update public.journal_entries
     set status = 'posted', reversed_by_id = null, updated_at = clock_timestamp(), updated_by = actor_id
   where id = current_journal.id;
  perform set_config('app.financial_workflow', '', true);

  perform set_config('app.financial_workflow', 'authorized', true);
  perform set_config('app.change_reason', correction_reason, true);
  update public.expenses
     set amount = normalized_amount,
         category = coalesce(nullif(trim(p_category), ''), 'Other'),
         description = p_description,
         date = coalesce(p_date, expense_row.date, correction_date),
         receipt_url = p_receipt_url,
         type = normalized_type,
         payment_method = normalized_method,
         accounting_state = 'ready_for_posting',
         posting_date = correction_date,
         posting_journal_entry_id = null,
         idempotency_key = correction_id
   where id = expense_row.id
   returning * into expense_row;
  perform set_config('app.financial_workflow', '', true);

  correction_journal := private.create_expense_payment_journal(
    expense_row.company_id, 'expense_correction', correction_id,
    expense_row.id::text || ':' || correction_id::text,
    correction_date, coalesce(p_date, expense_row.date, correction_date),
    coalesce(nullif(trim(expense_row.description), ''), 'Expense'),
    normalized_amount, expense_row.currency, expense_row.branch_id,
    normalized_method, jsonb_build_object(
      'expense_id', expense_row.id,
      'correction_of_journal_id', current_journal.id,
      'category', expense_row.category,
      'tax_code', expense_row.tax_code
    )
  );

  perform set_config('app.financial_workflow', 'authorized', true);
  perform set_config('app.change_reason', correction_reason, true);
  update public.expenses
     set accounting_state = 'posted', posting_journal_entry_id = correction_journal.id,
         idempotency_key = correction_id
   where id = expense_row.id
   returning * into expense_row;
  perform set_config('app.change_reason', '', true);
  perform set_config('app.financial_workflow', '', true);
  return expense_row;
end;
$$;

revoke all on function public.post_expense(uuid, uuid, text) from public, anon;
grant execute on function public.post_expense(uuid, uuid, text) to authenticated;
revoke all on function public.correct_expense(uuid, numeric, text, text, date, text, text, uuid, text, text) from public, anon;
grant execute on function public.correct_expense(uuid, numeric, text, text, date, text, text, uuid, text, text) to authenticated;
