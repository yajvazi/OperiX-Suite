-- Keep OperiX Invoice web and mobile on one company-scoped data model.
-- Legacy rows without a company_id remain available to their original creator.

create or replace function public.can_access_company(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_company_id is not null
    and (
      exists (
        select 1
        from public.memberships membership
        where membership.company_id = target_company_id
          and membership.user_id = (select auth.uid())
          and coalesce(membership.status, 'active') = 'active'
      )
      or exists (
        select 1
        from public.profiles profile
        where profile.id = (select auth.uid())
          and target_company_id in (profile.company_id, profile.active_company_id)
      )
    );
$$;

revoke all on function public.can_access_company(uuid) from public;
grant execute on function public.can_access_company(uuid) to authenticated;

alter table public.clients enable row level security;
alter table public.products enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.expenses enable row level security;
alter table public.vendors enable row level security;
alter table public.supplier_bills enable row level security;
alter table public.supplier_bill_items enable row level security;
alter table public.vendor_payments enable row level security;
alter table public.contracts enable row level security;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'clients', 'products', 'invoices', 'invoice_items', 'payments',
        'expenses', 'vendors', 'supplier_bills', 'supplier_bill_items',
        'vendor_payments', 'contracts'
      ])
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end
$$;

-- Tables that store both the creator and company use the same rules.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'clients', 'products', 'invoices', 'payments', 'expenses',
    'supplier_bills', 'contracts'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using
       ((select auth.uid()) = user_id or public.can_access_company(company_id))',
      table_name || '_company_select',
      table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check
       ((select auth.uid()) = user_id and
        (company_id is null or public.can_access_company(company_id)))',
      table_name || '_company_insert',
      table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using
       ((select auth.uid()) = user_id or public.can_access_company(company_id))
       with check
       ((select auth.uid()) = user_id or public.can_access_company(company_id))',
      table_name || '_company_update',
      table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using
       ((select auth.uid()) = user_id or public.can_access_company(company_id))',
      table_name || '_company_delete',
      table_name
    );
  end loop;
end
$$;

-- Vendors and vendor payments allow historical rows without a creator.
create policy vendors_company_select on public.vendors
for select to authenticated
using ((select auth.uid()) = user_id or public.can_access_company(company_id));

create policy vendors_company_insert on public.vendors
for insert to authenticated
with check (
  ((select auth.uid()) = user_id or user_id is null)
  and (company_id is null or public.can_access_company(company_id))
);

create policy vendors_company_update on public.vendors
for update to authenticated
using ((select auth.uid()) = user_id or public.can_access_company(company_id))
with check ((select auth.uid()) = user_id or public.can_access_company(company_id));

create policy vendors_company_delete on public.vendors
for delete to authenticated
using ((select auth.uid()) = user_id or public.can_access_company(company_id));

create policy vendor_payments_company_select on public.vendor_payments
for select to authenticated
using ((select auth.uid()) = user_id or public.can_access_company(company_id));

create policy vendor_payments_company_insert on public.vendor_payments
for insert to authenticated
with check (
  ((select auth.uid()) = user_id or user_id is null)
  and (company_id is null or public.can_access_company(company_id))
);

create policy vendor_payments_company_update on public.vendor_payments
for update to authenticated
using ((select auth.uid()) = user_id or public.can_access_company(company_id))
with check ((select auth.uid()) = user_id or public.can_access_company(company_id));

create policy vendor_payments_company_delete on public.vendor_payments
for delete to authenticated
using ((select auth.uid()) = user_id or public.can_access_company(company_id));

-- Child rows inherit access from their parent invoice or supplier bill.
create policy invoice_items_company_select on public.invoice_items
for select to authenticated
using (
  exists (
    select 1 from public.invoices invoice
    where invoice.id = invoice_items.invoice_id
      and (
        invoice.user_id = (select auth.uid())
        or public.can_access_company(invoice.company_id)
      )
  )
);

create policy invoice_items_company_insert on public.invoice_items
for insert to authenticated
with check (
  exists (
    select 1 from public.invoices invoice
    where invoice.id = invoice_items.invoice_id
      and (
        invoice.user_id = (select auth.uid())
        or public.can_access_company(invoice.company_id)
      )
  )
);

create policy invoice_items_company_update on public.invoice_items
for update to authenticated
using (
  exists (
    select 1 from public.invoices invoice
    where invoice.id = invoice_items.invoice_id
      and (
        invoice.user_id = (select auth.uid())
        or public.can_access_company(invoice.company_id)
      )
  )
)
with check (
  exists (
    select 1 from public.invoices invoice
    where invoice.id = invoice_items.invoice_id
      and (
        invoice.user_id = (select auth.uid())
        or public.can_access_company(invoice.company_id)
      )
  )
);

create policy invoice_items_company_delete on public.invoice_items
for delete to authenticated
using (
  exists (
    select 1 from public.invoices invoice
    where invoice.id = invoice_items.invoice_id
      and (
        invoice.user_id = (select auth.uid())
        or public.can_access_company(invoice.company_id)
      )
  )
);

create policy supplier_bill_items_company_select on public.supplier_bill_items
for select to authenticated
using (
  exists (
    select 1 from public.supplier_bills bill
    where bill.id = supplier_bill_items.bill_id
      and (
        bill.user_id = (select auth.uid())
        or public.can_access_company(bill.company_id)
      )
  )
);

create policy supplier_bill_items_company_insert on public.supplier_bill_items
for insert to authenticated
with check (
  exists (
    select 1 from public.supplier_bills bill
    where bill.id = supplier_bill_items.bill_id
      and (
        bill.user_id = (select auth.uid())
        or public.can_access_company(bill.company_id)
      )
  )
);

create policy supplier_bill_items_company_update on public.supplier_bill_items
for update to authenticated
using (
  exists (
    select 1 from public.supplier_bills bill
    where bill.id = supplier_bill_items.bill_id
      and (
        bill.user_id = (select auth.uid())
        or public.can_access_company(bill.company_id)
      )
  )
)
with check (
  exists (
    select 1 from public.supplier_bills bill
    where bill.id = supplier_bill_items.bill_id
      and (
        bill.user_id = (select auth.uid())
        or public.can_access_company(bill.company_id)
      )
  )
);

create policy supplier_bill_items_company_delete on public.supplier_bill_items
for delete to authenticated
using (
  exists (
    select 1 from public.supplier_bills bill
    where bill.id = supplier_bill_items.bill_id
      and (
        bill.user_id = (select auth.uid())
        or public.can_access_company(bill.company_id)
      )
  )
);

-- Company records are visible to their owner and all members, including pending
-- members who need to see the company during invite acceptance.
drop policy if exists "Authenticated users can create companies" on public.companies;
drop policy if exists "Owners can update their companies" on public.companies;
drop policy if exists "Owners can update their company" on public.companies;
drop policy if exists "Users can create companies" on public.companies;
drop policy if exists "Users can view companies they are members of" on public.companies;
drop policy if exists "Users can view their own company" on public.companies;

create policy companies_member_select on public.companies
for select to authenticated
using (
  owner_id = (select auth.uid())
  or exists (
    select 1 from public.memberships membership
    where membership.company_id = companies.id
      and membership.user_id = (select auth.uid())
  )
);

create policy companies_owner_insert on public.companies
for insert to authenticated
with check (owner_id = (select auth.uid()));

create policy companies_admin_update on public.companies
for update to authenticated
using (
  owner_id = (select auth.uid())
  or public.is_company_owner(id)
)
with check (
  owner_id = (select auth.uid())
  or public.is_company_owner(id)
);

grant select, insert, update, delete on
  public.clients,
  public.products,
  public.invoices,
  public.invoice_items,
  public.payments,
  public.expenses,
  public.vendors,
  public.supplier_bills,
  public.supplier_bill_items,
  public.vendor_payments,
  public.contracts,
  public.companies
to authenticated;
