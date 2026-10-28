-- OperiX Invoice RBAC storage and report follow-up.

begin;

create or replace function public.add_expense_attachment(
  p_expense_id uuid,
  p_storage_bucket text,
  p_storage_path text,
  p_file_name text,
  p_content_type text default null,
  p_byte_size bigint default null,
  p_file_checksum text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.financial_document_attachments
language plpgsql
security definer
set search_path = ''
as $$
declare
  expense_row public.expenses;
  expense_json jsonb;
  result public.financial_document_attachments;
  documentation_status_value text;
begin
  select * into expense_row from public.expenses where id = p_expense_id;
  if not found then raise exception 'Expense not found' using errcode = 'P0002'; end if;
  if not (
    private.rbac_can_read_resource(expense_row.company_id, 'expense', expense_row.user_id, expense_row.assigned_user_id, 'expense.create')
    or private.rbac_can_read_resource(expense_row.company_id, 'expense', expense_row.user_id, expense_row.assigned_user_id, 'expense.edit')
    or private.rbac_can_read_resource(expense_row.company_id, 'expense', expense_row.user_id, expense_row.assigned_user_id, 'expense.manage')
  ) then
    raise exception 'Expense attachment permission or data scope is required' using errcode = '42501';
  end if;
  if p_storage_bucket <> 'operix-expense-documents'
     or split_part(p_storage_path, '/', 1) <> expense_row.company_id::text
     or split_part(p_storage_path, '/', 2) <> 'expenses'
     or split_part(p_storage_path, '/', 3) <> expense_row.id::text then
    raise exception 'Expense attachment must use company/expenses/expense-id private paths' using errcode = '42501';
  end if;

  insert into public.financial_document_attachments(
    company_id, branch_id, document_type, document_id, storage_bucket,
    storage_path, file_name, content_type, byte_size, file_checksum,
    uploaded_by, metadata
  ) values (
    expense_row.company_id, expense_row.branch_id, 'expense', expense_row.id,
    p_storage_bucket, p_storage_path, p_file_name, p_content_type, p_byte_size,
    p_file_checksum, (select auth.uid()), coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict(company_id, document_type, document_id, storage_bucket, storage_path)
  do update set
    deleted_at = null,
    deleted_by = null,
    file_name = excluded.file_name,
    content_type = excluded.content_type,
    byte_size = excluded.byte_size,
    file_checksum = excluded.file_checksum,
    metadata = excluded.metadata,
    uploaded_at = clock_timestamp(),
    uploaded_by = (select auth.uid())
  returning * into result;

  expense_json := to_jsonb(expense_row);
  documentation_status_value := case
    when coalesce(expense_json ->> 'document_type', 'other') <> 'other'
      and coalesce(nullif(expense_json ->> 'document_number', ''), nullif(expense_json ->> 'invoice_number', '')) is not null
      and coalesce(nullif(expense_json ->> 'issue_date', ''), nullif(expense_json ->> 'date', '')) is not null
    then 'complete' else 'missing_information' end;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'expenses' and column_name = 'documentation_status'
  ) then
    execute 'update public.expenses set documentation_status = $1, updated_by = (select auth.uid()) where id = $2'
      using documentation_status_value, expense_row.id;
  else
    update public.expenses set updated_at = clock_timestamp() where id = expense_row.id;
  end if;
  return result;
end;
$$;

revoke all on function public.add_expense_attachment(uuid,text,text,text,text,bigint,text,jsonb) from public, anon;
grant execute on function public.add_expense_attachment(uuid,text,text,text,text,bigint,text,jsonb) to authenticated;

do $$
declare
  policy_name text;
begin
  if to_regclass('storage.objects') is not null then
    foreach policy_name in array array[
      'expense_documents_select','expense_documents_insert','expense_documents_update','expense_documents_delete',
      'rbac_expense_documents_select','rbac_expense_documents_insert','rbac_expense_documents_update','rbac_expense_documents_delete'
    ] loop
      execute format('drop policy if exists %I on storage.objects', policy_name);
    end loop;
    create policy rbac_expense_documents_select on storage.objects for select to authenticated
    using (
      bucket_id = 'operix-expense-documents'
      and (
        exists (
          select 1 from public.expenses expense
          where expense.company_id = split_part(name, '/', 1)::uuid
            and expense.id = split_part(name, '/', 3)::uuid
            and split_part(name, '/', 2) = 'expenses'
            and private.rbac_can_read_resource(expense.company_id, 'expense', expense.user_id, expense.assigned_user_id, 'expense.view_own')
        )
        or private.has_company_permission(split_part(name, '/', 1)::uuid, 'expense.view_all')
      )
    );
    create policy rbac_expense_documents_insert on storage.objects for insert to authenticated
    with check (
      bucket_id = 'operix-expense-documents'
      and exists (
        select 1 from public.expenses expense
        where expense.company_id = split_part(name, '/', 1)::uuid
          and expense.id = split_part(name, '/', 3)::uuid
          and split_part(name, '/', 2) = 'expenses'
          and (
            private.rbac_can_read_resource(expense.company_id, 'expense', expense.user_id, expense.assigned_user_id, 'expense.create')
            or private.rbac_can_read_resource(expense.company_id, 'expense', expense.user_id, expense.assigned_user_id, 'expense.edit')
          )
      )
    );
    create policy rbac_expense_documents_update on storage.objects for update to authenticated
    using (bucket_id = 'operix-expense-documents' and private.has_company_permission(split_part(name, '/', 1)::uuid, 'expense.manage'))
    with check (bucket_id = 'operix-expense-documents' and private.has_company_permission(split_part(name, '/', 1)::uuid, 'expense.manage'));
    create policy rbac_expense_documents_delete on storage.objects for delete to authenticated
    using (bucket_id = 'operix-expense-documents' and private.has_company_permission(split_part(name, '/', 1)::uuid, 'expense.manage'));
  end if;
end
$$;

do $$
declare
  view_name text;
  permission_code text;
  view_sql text;
begin
  for view_name, permission_code in
    select source.view_name, source.permission_code
    from (values
      ('operix_report_gross_sales','reports.sales'),
      ('kosovo_expense_purchase_book','reports.tax'),
      ('operix_expense_summary','reports.operational')
    ) as source(view_name, permission_code)
  loop
    if exists (
      select 1 from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public' and relation.relname = view_name and relation.relkind = 'v'
    ) then
      view_sql := pg_get_viewdef(('public.' || view_name)::regclass, true);
      view_sql := regexp_replace(view_sql, E';[[:space:]]*$', '');
      execute format(
        'create or replace view public.%I as select * from (%s) as rbac_report where private.has_company_permission(rbac_report.company_id, %L)',
        view_name, view_sql, permission_code
      );
      execute format('alter view public.%I set (security_invoker = true)', view_name);
    end if;
  end loop;
end
$$;

commit;

