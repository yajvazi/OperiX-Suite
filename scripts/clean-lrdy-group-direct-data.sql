-- One-time, guarded cleanup of direct business data owned by LRDY Group.
--
-- The root company, memberships, profiles, audit history, and feature/access
-- configuration are retained. Every delete below is restricted to the exact
-- root company_id, so child-tenant rows are not touched.

begin;

do $$
declare
  lrdy_company_id uuid;
  matching_companies integer;
  target_table text;
  deleted_rows integer;
  deleted_this_pass integer;
  pass_number integer;
  table_row record;
begin
  select count(*)
    into matching_companies
  from public.companies
  where parent_company_id is null
    and lower(trim(coalesce(company_name, name, ''))) = 'lrdy group l.l.c.';

  if matching_companies <> 1 then
    raise exception 'Expected exactly one root LRDY Group company, found %', matching_companies;
  end if;

  select id
    into lrdy_company_id
  from public.companies
  where parent_company_id is null
    and lower(trim(coalesce(company_name, name, ''))) = 'lrdy group l.l.c.';

  -- This is an explicit local administrative cleanup, so protected financial
  -- triggers may release their normal immutable-row guard for these rows.
  perform set_config('app.financial_workflow', 'authorized', true);

  -- A root-owned bank account may have share rows even though the share table
  -- uses shared_company_id rather than company_id. Remove only relationships
  -- involving the root-owned account; child-company accounts stay untouched.
  delete from public.company_bank_account_shares
  where company_bank_account_id in (
    select id from public.company_bank_accounts where company_id = lrdy_company_id
  )
  or shared_company_id = lrdy_company_id;

  -- This detail table predates the company_id convention.
  delete from public.invoice_items item
  using public.invoices invoice
  where item.invoice_id = invoice.id
    and invoice.company_id = lrdy_company_id;

  -- Delete every direct company-owned row except identity, access, audit, and
  -- platform configuration. Multiple passes let child rows be removed before
  -- their parent rows when a foreign key uses RESTRICT.
  for pass_number in 1..12 loop
    deleted_this_pass := 0;
    for table_row in
      select distinct columns.table_name
      from information_schema.columns
      join pg_class relation
        on relation.relname = columns.table_name
      join pg_namespace namespace
        on namespace.oid = relation.relnamespace
       and namespace.nspname = 'public'
      where columns.table_schema = 'public'
        and columns.column_name = 'company_id'
        and relation.relkind in ('r', 'p')
        and columns.table_name not like 'control_%'
        and columns.table_name not in (
          'app_roles',
          'audit_events',
          'audit_logs',
          'company_app_entitlements',
          'company_feature_flags',
          'company_invitations',
          'desk_device_tokens',
          'device_registrations',
          'favorites',
          'memberships',
          'profiles',
          'users'
        )
      order by columns.table_name
    loop
      target_table := table_row.table_name;
      begin
        execute format('delete from public.%I where company_id::text = $1::text', target_table)
          using lrdy_company_id;
        get diagnostics deleted_rows = row_count;
        deleted_this_pass := deleted_this_pass + deleted_rows;
      exception when foreign_key_violation then
        -- A later pass will remove the referencing direct-company row first.
        continue;
      end;
    end loop;

    exit when deleted_this_pass = 0;
  end loop;
end;
$$;

commit;
