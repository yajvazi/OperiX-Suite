-- Delete an expense and its automatic ledger journal atomically.
--
-- Posted expense journals are normally immutable. Expense deletion is an
-- explicit workflow, so the command temporarily authorizes the tightly
-- scoped cleanup after verifying the journal belongs to the expense.

create or replace function public.delete_expense(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  expense_row public.expenses;
  journal_id uuid;
  journal_row public.journal_entries;
  journal_ids uuid[];
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
    raise exception 'You do not have permission to delete this expense'
      using errcode = '42501';
  end if;

  if lower(coalesce(expense_row.accounting_state, 'legacy')) = 'opening_balance' then
    raise exception 'Opening-balance expenses cannot be deleted' using errcode = '55000';
  end if;

  select coalesce(array_agg(j.id order by j.id), '{}'::uuid[])
    into journal_ids
    from public.journal_entries j
   where j.id = expense_row.posting_journal_entry_id
      or (j.entry_type = 'automatic' and j.source_type = 'expense' and j.source_id = expense_row.id);

  if expense_row.posting_journal_entry_id is not null
     and not (expense_row.posting_journal_entry_id = any(journal_ids)) then
    raise exception 'The expense posting journal could not be found' using errcode = '55000';
  end if;

  foreach journal_id in array journal_ids loop
    select *
      into journal_row
      from public.journal_entries
     where id = journal_id
     for update;

    if journal_row.entry_type <> 'automatic'
       or journal_row.source_type <> 'expense'
       or journal_row.source_id <> expense_row.id then
      raise exception 'The expense is linked to an unrelated journal entry' using errcode = '55000';
    end if;
    if journal_row.status not in ('draft', 'posted') then
      raise exception 'Reversed or invalid expense journals cannot be deleted' using errcode = '55000';
    end if;
  end loop;

  perform set_config('app.financial_workflow', 'authorized', true);
  perform set_config('app.change_reason', 'Expense deleted by user', true);

  -- Clear the foreign key before removing the journal entry. Its lines are
  -- deleted by the journal_entry_lines foreign key cascade.
  update public.expenses
     set posting_journal_entry_id = null
   where id = expense_row.id;

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

-- All authenticated expense deletions must use the guarded RPC so a ledger
-- journal cannot be left behind by a direct table delete.
drop policy if exists "Company shared expenses" on public.expenses;
drop policy if exists "Users can delete own expenses" on public.expenses;
drop policy if exists expenses_company_delete on public.expenses;
revoke delete on table public.expenses from anon, authenticated;
