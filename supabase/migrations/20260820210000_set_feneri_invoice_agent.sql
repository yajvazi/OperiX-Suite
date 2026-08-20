-- Attribute all existing Feneri invoices to Yll Ajvazi.
-- This is intentionally tenant-scoped and leaves invoices in every other
-- company unchanged.

do $$
declare
  feneri_company_id uuid;
  yll_user_id uuid;
  updated_invoice_count integer;
begin
  select company.id
    into feneri_company_id
    from public.companies company
   where lower(coalesce(company.company_name, company.name, '')) = 'feneri'
   order by company.created_at nulls last, company.id
   limit 1;

  if feneri_company_id is null then
    raise exception 'Tenant Feneri was not found';
  end if;

  select auth_user.id
    into yll_user_id
    from auth.users auth_user
   where lower(auth_user.email) = 'yllajvazi@lrdy-group.com'
   limit 1;

  if yll_user_id is null then
    raise exception 'User yllajvazi@lrdy-group.com was not found';
  end if;

  if not exists (
    select 1
      from public.memberships membership
     where membership.company_id = feneri_company_id
       and membership.user_id = yll_user_id
       and coalesce(membership.status, 'active') <> 'revoked'
  ) then
    raise exception 'Yll Ajvazi is not an active member of tenant Feneri';
  end if;

  -- This is an intentional historical attribution correction. Use the same
  -- protected workflow flag required by the financial immutability trigger.
  perform set_config('app.financial_workflow', 'authorized', true);

  update public.invoices
     set user_id = yll_user_id
   where company_id = feneri_company_id
     and user_id is distinct from yll_user_id;

  get diagnostics updated_invoice_count = row_count;
  perform set_config('app.financial_workflow', '', true);

  update public.profiles
     set first_name = 'Yll',
         last_name = 'Ajvazi',
         email = coalesce(nullif(email, ''), 'yllajvazi@lrdy-group.com')
   where id = yll_user_id;

  raise notice 'Attributed % existing Feneri invoices to Yll Ajvazi (%)', updated_invoice_count, yll_user_id;
end;
$$;
