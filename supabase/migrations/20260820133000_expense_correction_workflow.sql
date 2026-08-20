-- Correct a posted expense without mutating its existing accounting journal.
-- The old journal is reversed and a new automatic journal is posted for the
-- corrected values. The expense row remains the stable operational record.

create or replace function public.correct_expense(
  p_expense_id uuid,
  p_amount numeric,
  p_category text,
  p_description text,
  p_date date,
  p_receipt_url text default null,
  p_type text default 'expense',
  p_correction_id uuid default null,
  p_reason text default null
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

  select *
    into expense_row
    from public.expenses
   where id = p_expense_id
   for update;

  if not found then
    raise exception 'Expense not found' using errcode = 'P0002';
  end if;
  if expense_row.company_id is null
     or not coalesce(private.has_company_permission(expense_row.company_id, 'expense.post'), false)
     or not coalesce(private.has_company_permission(expense_row.company_id, 'journal.post'), false)
     or not coalesce(private.has_company_permission(expense_row.company_id, 'journal.reverse'), false) then
    raise exception 'You do not have permission to correct this expense' using errcode = '42501';
  end if;

  select *
    into correction_journal
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

  select *
    into current_journal
    from public.journal_entries
   where id = expense_row.posting_journal_entry_id
   for update;
  if not found or current_journal.status <> 'posted' then
    raise exception 'The current expense journal is not posted' using errcode = '55000';
  end if;
  if current_journal.entry_type <> 'automatic'
     or not (
       (current_journal.source_type = 'expense' and current_journal.source_id = expense_row.id)
       or (
         current_journal.source_type = 'expense_correction'
         and current_journal.metadata ->> 'expense_id' = expense_row.id::text
       )
     ) then
    raise exception 'The expense is linked to an unrelated journal entry' using errcode = '55000';
  end if;

  perform public.reverse_journal_entry(current_journal.id, correction_date, correction_reason);

  -- The reporting views read posted ledger rows. Keep the source journal
  -- posted alongside its posted reversal so the pair nets to zero and the
  -- replacement journal carries the corrected amount. The reversal remains
  -- linked to the source for audit and deletion cleanup.
  perform set_config('app.financial_workflow', 'authorized', true);
  perform set_config('app.change_reason', correction_reason, true);
  update public.journal_entries
     set status = 'posted',
         reversed_by_id = null,
         updated_at = clock_timestamp(),
         updated_by = (select auth.uid())
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
         accounting_state = 'ready_for_posting',
         posting_date = correction_date,
         posting_journal_entry_id = null,
         idempotency_key = correction_id
   where id = expense_row.id
   returning * into expense_row;
  perform set_config('app.financial_workflow', '', true);

  correction_journal := public.create_automatic_journal(
    expense_row.company_id,
    'expense_reimbursement',
    'expense_correction',
    correction_id,
    expense_row.id::text || ':' || correction_id::text,
    correction_date,
    coalesce(p_date, expense_row.date, correction_date),
    coalesce(nullif(trim(expense_row.description), ''), 'Expense'),
    jsonb_build_object('gross', normalized_amount),
    expense_row.currency,
    expense_row.branch_id,
    jsonb_build_object(
      'expense_id', expense_row.id,
      'correction_of_journal_id', current_journal.id,
      'category', expense_row.category,
      'tax_code', expense_row.tax_code
    )
  );

  perform set_config('app.financial_workflow', 'authorized', true);
  perform set_config('app.change_reason', correction_reason, true);
  update public.expenses
     set accounting_state = 'posted',
         posting_journal_entry_id = correction_journal.id,
         idempotency_key = correction_id
   where id = expense_row.id
   returning * into expense_row;
  perform set_config('app.change_reason', '', true);
  perform set_config('app.financial_workflow', '', true);

  return expense_row;
end;
$$;

revoke all on function public.correct_expense(uuid, numeric, text, text, date, text, text, uuid, text) from public, anon;
grant execute on function public.correct_expense(uuid, numeric, text, text, date, text, text, uuid, text) to authenticated;

-- Keep deletion safe after one or more corrections: remove the expense's
-- original, correction, and reversal journals as one audited cleanup.
create or replace function public.delete_expense(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  expense_row public.expenses;
  base_journal_ids uuid[];
  journal_ids uuid[];
  journal_id uuid;
  journal_row public.journal_entries;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_expense_id is null then
    raise exception 'Expense id is required' using errcode = '23514';
  end if;

  select *
    into expense_row
    from public.expenses
   where id = p_expense_id
   for update;
  if not found then
    raise exception 'Expense not found' using errcode = 'P0002';
  end if;
  if expense_row.company_id is null
     or not coalesce(private.has_company_permission(expense_row.company_id, 'expense.post'), false) then
    raise exception 'You do not have permission to delete this expense' using errcode = '42501';
  end if;
  if lower(coalesce(expense_row.accounting_state, 'legacy')) = 'opening_balance' then
    raise exception 'Opening-balance expenses cannot be deleted' using errcode = '55000';
  end if;

  select coalesce(array_agg(distinct j.id order by j.id), '{}'::uuid[])
    into base_journal_ids
    from public.journal_entries j
   where j.id = expense_row.posting_journal_entry_id
      or (
        j.entry_type = 'automatic'
        and (
          (j.source_type = 'expense' and j.source_id = expense_row.id)
          or (
            j.source_type = 'expense_correction'
            and j.metadata ->> 'expense_id' = expense_row.id::text
          )
        )
      );

  if expense_row.posting_journal_entry_id is not null
     and not (expense_row.posting_journal_entry_id = any(base_journal_ids)) then
    raise exception 'The expense posting journal could not be found' using errcode = '55000';
  end if;

  select coalesce(array_agg(distinct j.id order by j.id), '{}'::uuid[])
    into journal_ids
    from public.journal_entries j
   where j.id = any(base_journal_ids)
      or j.reversal_of_id = any(base_journal_ids);

  foreach journal_id in array journal_ids loop
    select *
      into journal_row
      from public.journal_entries
     where id = journal_id
     for update;

    if journal_row.status not in ('draft', 'posted', 'reversed') then
      raise exception 'Invalid expense journal status' using errcode = '55000';
    end if;

    if journal_id = any(base_journal_ids) then
      if journal_row.entry_type <> 'automatic'
         or not (
           (journal_row.source_type = 'expense' and journal_row.source_id = expense_row.id)
           or (
             journal_row.source_type = 'expense_correction'
             and journal_row.metadata ->> 'expense_id' = expense_row.id::text
           )
         ) then
        raise exception 'The expense is linked to an unrelated journal entry' using errcode = '55000';
      end if;
    elsif journal_row.entry_type <> 'reversal'
       or journal_row.source_type <> 'journal_reversal'
       or not (journal_row.reversal_of_id = any(base_journal_ids)) then
      raise exception 'The expense has an unrelated reversal journal' using errcode = '55000';
    end if;
  end loop;

  perform set_config('app.financial_workflow', 'authorized', true);
  perform set_config('app.change_reason', 'Expense deleted by user', true);

  update public.expenses
     set posting_journal_entry_id = null
   where id = expense_row.id;

  update public.journal_entries
     set reversed_by_id = null
   where id = any(base_journal_ids);
  update public.journal_entries
     set reversal_of_id = null
   where id = any(journal_ids)
     and not (id = any(base_journal_ids));

  foreach journal_id in array journal_ids loop
    delete from public.journal_entries
     where id = journal_id;
  end loop;

  delete from public.expenses
   where id = expense_row.id;

  perform set_config('app.change_reason', '', true);
  perform set_config('app.financial_workflow', '', true);
end;
$$;

revoke all on function public.delete_expense(uuid) from public, anon;
grant execute on function public.delete_expense(uuid) to authenticated;
