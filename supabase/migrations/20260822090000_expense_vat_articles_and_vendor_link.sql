-- Add vendor-linked expense details used by the mobile expense form, PDFs,
-- vendor ledgers, and the purchase-side accounting journal.

begin;

alter table public.expenses
  add column if not exists vendor_id uuid references public.vendors(id) on delete set null,
  add column if not exists article text,
  add column if not exists vat_rate numeric(8,4) not null default 0,
  add column if not exists tax_amount numeric(20,4) not null default 0,
  add column if not exists tax_recoverable_amount numeric(20,4) not null default 0;

alter table public.expenses
  drop constraint if exists expenses_vat_rate_check;
alter table public.expenses
  add constraint expenses_vat_rate_check check (vat_rate >= 0 and vat_rate <= 100);

alter table public.expenses
  drop constraint if exists expenses_tax_amount_check;
alter table public.expenses
  add constraint expenses_tax_amount_check check (tax_amount >= 0 and tax_amount <= amount + 0.0001);

alter table public.expenses
  drop constraint if exists expenses_tax_recoverable_amount_check;
alter table public.expenses
  add constraint expenses_tax_recoverable_amount_check check (
    tax_recoverable_amount >= 0
    and tax_recoverable_amount <= tax_amount + 0.0001
  );

create index if not exists expenses_vendor_id_idx
  on public.expenses(vendor_id)
  where vendor_id is not null;

-- Expense amount is the entered total. The mobile form stores the VAT share
-- requested by the user (for example: EUR 100 total at 18% = EUR 82 net and
-- EUR 18 VAT). Recoverable VAT is posted separately to account 1300.
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
  tax_total numeric(20,4);
  recoverable_vat numeric(20,4);
  nonrecoverable_vat numeric(20,4);
  expense_amount numeric(20,4);
  selected_bank_account_id uuid;
  selected_bank_account_id_for_gl uuid;
  expense_account uuid;
  input_vat_account uuid;
  settlement_account uuid;
  entry_row public.journal_entries;
  source_expense_id uuid;
  expense_description text := coalesce(nullif(trim(p_description), ''), nullif(trim(p_metadata ->> 'article'), ''), 'Expense');
  line_number integer := 0;
begin
  if method not in ('cash', 'bank') then
    raise exception 'Expense payment method must be cash or bank' using errcode = '23514';
  end if;
  if gross <= 0 then
    raise exception 'Expense amount must be greater than zero' using errcode = '23514';
  end if;

  expense_description := concat_ws(
    ' · ',
    expense_description,
    nullif(trim(p_metadata ->> 'vendor_name'), ''),
    case
      when nullif(trim(p_metadata ->> 'invoice_number'), '') is not null
        then 'Vendor invoice #' || trim(p_metadata ->> 'invoice_number')
      else null
    end
  );

  source_expense_id := coalesce(
    nullif(p_metadata ->> 'expense_id', '')::uuid,
    p_source_id
  );
  select
    round(greatest(coalesce(e.tax_amount, 0), 0), 4),
    round(greatest(coalesce(e.tax_recoverable_amount, e.tax_amount, 0), 0), 4)
  into tax_total, recoverable_vat
  from public.expenses e
  where e.id = source_expense_id;

  tax_total := round(greatest(coalesce(nullif(p_metadata ->> 'tax_amount', '')::numeric, tax_total, 0), 0), 4);
  recoverable_vat := round(greatest(coalesce(nullif(p_metadata ->> 'tax_recoverable_amount', '')::numeric, recoverable_vat, tax_total), 0), 4);
  if tax_total > gross or recoverable_vat > tax_total then
    raise exception 'Expense VAT amounts are invalid' using errcode = '23514';
  end if;
  nonrecoverable_vat := round(tax_total - recoverable_vat, 4);
  expense_amount := round(gross - recoverable_vat, 4);

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
      from public.company_bank_accounts account
     where account.id = selected_bank_account_id
       and account.is_active
       and (
         account.company_id = p_company_id
         or exists (
           select 1
             from public.company_bank_account_shares share
            where share.company_bank_account_id = account.id
              and share.shared_company_id = p_company_id
              and share.is_active
         )
       );
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

  if recoverable_vat > 0 then
    select id into input_vat_account
      from public.chart_of_accounts
     where company_id = p_company_id and code = '1300' and active and posting_allowed;
    if input_vat_account is null then
      raise exception 'Input VAT account 1300 is not configured' using errcode = '23514';
    end if;
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
    expense_description,
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
           || jsonb_build_object(
                'payment_method', method,
                'net_amount', expense_amount,
                'tax_amount', tax_total,
                'tax_recoverable_amount', recoverable_vat,
                'tax_nonrecoverable_amount', nonrecoverable_vat
              ),
         updated_by = (select auth.uid())
   where id = entry_row.id
   returning * into entry_row;

  if expense_amount > 0 then
    line_number := line_number + 1;
    insert into public.journal_entry_lines (
      journal_entry_id, company_id, line_number, account_id, description,
      debit, credit, transaction_currency, transaction_amount, exchange_rate,
      branch_id, created_by
    ) values (
      entry_row.id, p_company_id, line_number, expense_account,
      expense_description,
      expense_amount, 0, upper(coalesce(nullif(trim(p_currency), ''), 'EUR')),
      expense_amount, 1, p_branch_id, (select auth.uid())
    );
  end if;
  if recoverable_vat > 0 then
    line_number := line_number + 1;
    insert into public.journal_entry_lines (
      journal_entry_id, company_id, line_number, account_id, description,
      debit, credit, transaction_currency, transaction_amount, exchange_rate,
      branch_id, tax_code, tax_amount, created_by
    ) values (
      entry_row.id, p_company_id, line_number, input_vat_account, 'Recoverable input VAT · ' || expense_description,
      recoverable_vat, 0, upper(coalesce(nullif(trim(p_currency), ''), 'EUR')),
      recoverable_vat, 1, p_branch_id,
      coalesce(nullif(p_metadata ->> 'tax_code', ''), 'domestic_purchase'),
      recoverable_vat, (select auth.uid())
    );
  end if;

  line_number := line_number + 1;
  insert into public.journal_entry_lines (
    journal_entry_id, company_id, line_number, account_id, description,
    debit, credit, transaction_currency, transaction_amount, exchange_rate,
    branch_id, created_by
  ) values (
    entry_row.id, p_company_id, line_number, settlement_account,
    case when method = 'cash' then 'Cash expense payment · ' else 'Bank expense payment · ' end || expense_description,
    0, gross, upper(coalesce(nullif(trim(p_currency), ''), 'EUR')),
    gross, 1, p_branch_id, (select auth.uid())
  );

  return public.post_journal_entry(entry_row.id, 'Expense posted');
end;
$$;

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
  if not found then raise exception 'Expense not found' using errcode = 'P0002'; end if;
  if not (select private.has_company_permission(expense_row.company_id, 'expense.post'))
     or not (select private.has_company_permission(expense_row.company_id, 'journal.post')) then
    raise exception 'Insufficient permission to post expenses' using errcode = '42501';
  end if;
  if expense_row.accounting_state = 'posted' then
    if p_idempotency_key is null or expense_row.idempotency_key = p_idempotency_key then return expense_row; end if;
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
    coalesce(nullif(trim(expense_row.description), ''), expense_row.article, 'Expense'),
    expense_row.amount, expense_row.currency, expense_row.branch_id,
    expense_row.payment_method,
    jsonb_build_object(
      'category', expense_row.category,
      'article', expense_row.article,
      'vendor_id', expense_row.vendor_id,
      'vendor_name', expense_row.vendor_name,
      'invoice_number', expense_row.invoice_number,
      'tax_code', expense_row.tax_code,
      'vat_rate', expense_row.vat_rate,
      'tax_amount', expense_row.tax_amount,
      'tax_recoverable_amount', expense_row.tax_recoverable_amount,
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

-- Posted expense corrections use the existing audited correction workflow. The
-- wrapper updates the new fields in the same transaction before that workflow
-- rebuilds the journal, so the replacement journal receives the VAT/article
-- metadata without changing the legacy RPC signature.
create or replace function public.correct_expense_with_vat(
  p_expense_id uuid,
  p_amount numeric,
  p_category text,
  p_article text,
  p_description text,
  p_date date,
  p_company_bank_account_id uuid,
  p_vendor_id uuid,
  p_vendor_name text,
  p_invoice_number text,
  p_bank_reference text,
  p_notes text,
  p_vat_rate numeric,
  p_tax_amount numeric,
  p_tax_recoverable_amount numeric,
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
  corrected_row public.expenses;
begin
  if actor_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if coalesce(p_vat_rate, 0) < 0 or coalesce(p_vat_rate, 0) > 100
     or coalesce(p_tax_amount, 0) < 0
     or coalesce(p_tax_recoverable_amount, 0) < 0
     or coalesce(p_tax_amount, 0) > coalesce(p_amount, 0)
     or coalesce(p_tax_recoverable_amount, 0) > coalesce(p_tax_amount, 0) then
    raise exception 'Expense VAT amounts are invalid' using errcode = '23514';
  end if;

  select * into expense_row from public.expenses where id = p_expense_id for update;
  if not found then raise exception 'Expense not found' using errcode = 'P0002'; end if;
  if not coalesce(private.has_company_permission(expense_row.company_id, 'expense.post'), false)
     or not coalesce(private.has_company_permission(expense_row.company_id, 'journal.post'), false)
     or not coalesce(private.has_company_permission(expense_row.company_id, 'journal.reverse'), false) then
    raise exception 'You do not have permission to correct this expense' using errcode = '42501';
  end if;

  perform set_config('app.financial_workflow', 'authorized', true);
  perform set_config('app.change_reason', coalesce(nullif(trim(p_reason), ''), 'Expense details corrected'), true);
  update public.expenses
     set article = nullif(trim(p_article), ''),
         vendor_id = p_vendor_id,
         vat_rate = round(coalesce(p_vat_rate, 0), 4),
         tax_amount = round(coalesce(p_tax_amount, 0), 4),
         tax_recoverable_amount = round(coalesce(p_tax_recoverable_amount, 0), 4)
   where id = p_expense_id;

  corrected_row := public.correct_expense(
    p_expense_id => p_expense_id,
    p_amount => p_amount,
    p_category => p_category,
    p_description => p_description,
    p_date => p_date,
    p_company_bank_account_id => p_company_bank_account_id,
    p_vendor_name => p_vendor_name,
    p_invoice_number => p_invoice_number,
    p_bank_reference => p_bank_reference,
    p_notes => p_notes,
    p_receipt_url => p_receipt_url,
    p_type => p_type,
    p_correction_id => p_correction_id,
    p_reason => p_reason,
    p_payment_method => p_payment_method
  );
  perform set_config('app.change_reason', '', true);
  perform set_config('app.financial_workflow', '', true);
  return corrected_row;
end;
$$;

revoke all on function public.correct_expense_with_vat(uuid,numeric,text,text,text,date,uuid,uuid,text,text,text,text,numeric,numeric,numeric,text,text,uuid,text,text) from public, anon;
grant execute on function public.correct_expense_with_vat(uuid,numeric,text,text,text,date,uuid,uuid,text,text,text,text,numeric,numeric,numeric,text,text,uuid,text,text) to authenticated;

commit;
