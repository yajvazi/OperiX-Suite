-- Post expense records that were saved before the mobile accounting posting
-- workflow was available. The operation is idempotent because already-posted
-- expenses have a posting journal entry and are skipped.

create or replace function public.repair_unposted_expenses(
  p_company_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  expense_row public.expenses;
  posted_count integer := 0;
  skipped_count integer := 0;
  failures jsonb := '[]'::jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_company_id is null or not public.can_access_company(p_company_id) then
    raise exception 'You do not have access to this company' using errcode = '42501';
  end if;
  if not (select private.has_company_permission(p_company_id, 'expense.post'))
     or not (select private.has_company_permission(p_company_id, 'journal.post')) then
    raise exception 'Insufficient permission to repair expense posting' using errcode = '42501';
  end if;

  for expense_row in
    select *
    from public.expenses expense
    where expense.company_id = p_company_id
      and lower(coalesce(expense.type, 'expense')) = 'expense'
      and lower(coalesce(expense.accounting_state, 'legacy')) in ('legacy', 'ready_for_posting')
      and expense.posting_journal_entry_id is null
      and coalesce(expense.amount, 0) > 0
    order by expense.date nulls first, expense.created_at nulls first
  loop
    begin
      perform public.post_expense(
        expense_row.id,
        gen_random_uuid(),
        'Repair unposted expense ledger posting'
      );
      posted_count := posted_count + 1;
    exception when others then
      skipped_count := skipped_count + 1;
      failures := failures || jsonb_build_array(jsonb_build_object(
        'expense_id', expense_row.id,
        'message', sqlerrm
      ));
    end;
  end loop;

  return jsonb_build_object(
    'posted', posted_count,
    'skipped', skipped_count,
    'failures', failures
  );
end
$$;

revoke all on function public.repair_unposted_expenses(uuid) from public, anon;
grant execute on function public.repair_unposted_expenses(uuid) to authenticated;

comment on function public.repair_unposted_expenses(uuid) is
  'Posts eligible expense rows that were saved before the canonical ledger workflow; income rows are excluded.';
