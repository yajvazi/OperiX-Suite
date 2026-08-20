-- Re-attribute all sales documents created by the LRDY admin account to Yll
-- Ajvazi. This changes attribution only; financial amounts and posting data
-- remain unchanged.

do $$
declare
  admin_user_id uuid;
  yll_user_id uuid;
  updated_invoice_count integer;
  updated_document_count integer;
begin
  select id into admin_user_id
  from auth.users
  where lower(email) = 'admin@lrdy-group.com'
  limit 1;

  select id into yll_user_id
  from auth.users
  where lower(email) = 'yllajvazi@lrdy-group.com'
  limit 1;

  if admin_user_id is null or yll_user_id is null then
    raise exception 'Both admin@lrdy-group.com and yllajvazi@lrdy-group.com must exist';
  end if;

  if admin_user_id = yll_user_id then
    raise exception 'The source and destination agents must be different users';
  end if;

  perform set_config('app.financial_workflow', 'authorized', true);

  update public.invoices
  set user_id = yll_user_id
  where user_id = admin_user_id
    and company_id is not null
    and exists (select 1 from public.companies company where company.id = invoices.company_id);
  get diagnostics updated_invoice_count = row_count;

  update public.commercial_documents
  set user_id = yll_user_id
  where user_id = admin_user_id
    and company_id is not null
    and exists (select 1 from public.companies company where company.id = commercial_documents.company_id);
  get diagnostics updated_document_count = row_count;

  perform set_config('app.financial_workflow', '', true);
  raise notice 'Moved % invoices and % commercial documents to Yll Ajvazi', updated_invoice_count, updated_document_count;
end;
$$;
