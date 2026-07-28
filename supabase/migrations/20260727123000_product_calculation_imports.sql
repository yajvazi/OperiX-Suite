-- Detailed purchase-cost imports used to create or update catalog products.
-- Batch metadata mirrors the Product Calculations document, while item rows keep
-- the full audit trail behind the latest catalog price.

alter table public.products
  add column if not exists cost_price numeric(14,4);

create table if not exists public.product_import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  supplier_name text,
  supplier_tax_id text,
  supplier_vat_number text,
  supplier_address text,
  invoice_number text,
  invoice_date date,
  expiry_date date,
  customs_document_number text,
  customs_document_date date,
  payment_terms text,
  organization_unit text,
  received_date date,
  document_number text,
  currency text not null default 'EUR',
  created_at timestamptz not null default now()
);

create table if not exists public.product_import_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.product_import_batches(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  line_number integer not null,
  sku text,
  barcode text,
  description text not null,
  category text,
  quantity numeric(14,3) not null default 0,
  unit text not null default 'pcs',
  supplier_currency_price numeric(14,4) not null default 0,
  discount_percent numeric(7,3) not null default 0,
  supplier_value numeric(14,4) not null default 0,
  price_after_discount numeric(14,4) not null default 0,
  transport_cost numeric(14,4) not null default 0,
  additional_cost numeric(14,4) not null default 0,
  customs_excise numeric(14,4) not null default 0,
  landed_unit_price numeric(14,4) not null default 0,
  tax_rate numeric(7,3) not null default 0,
  import_vat numeric(14,4) not null default 0,
  unit_price_with_vat numeric(14,4) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists product_import_batches_company_idx on public.product_import_batches(company_id, created_at desc);
create index if not exists product_import_items_batch_idx on public.product_import_items(batch_id, line_number);
create index if not exists product_import_items_product_idx on public.product_import_items(product_id);

alter table public.product_import_batches enable row level security;
alter table public.product_import_items enable row level security;

create policy product_import_batches_select on public.product_import_batches for select to authenticated
using ((select auth.uid()) = user_id or public.can_access_company(company_id));
create policy product_import_batches_insert on public.product_import_batches for insert to authenticated
with check ((select auth.uid()) = user_id and (company_id is null or public.can_access_company(company_id)));
create policy product_import_batches_update on public.product_import_batches for update to authenticated
using ((select auth.uid()) = user_id or public.can_access_company(company_id))
with check ((select auth.uid()) = user_id or public.can_access_company(company_id));
create policy product_import_batches_delete on public.product_import_batches for delete to authenticated
using ((select auth.uid()) = user_id or public.can_access_company(company_id));

create policy product_import_items_select on public.product_import_items for select to authenticated
using ((select auth.uid()) = user_id or public.can_access_company(company_id));
create policy product_import_items_insert on public.product_import_items for insert to authenticated
with check (
  ((select auth.uid()) = user_id and (company_id is null or public.can_access_company(company_id)))
  and exists (
    select 1 from public.product_import_batches batch
    where batch.id = batch_id
      and (batch.user_id = (select auth.uid()) or public.can_access_company(batch.company_id))
  )
);
create policy product_import_items_update on public.product_import_items for update to authenticated
using ((select auth.uid()) = user_id or public.can_access_company(company_id))
with check ((select auth.uid()) = user_id or public.can_access_company(company_id));
create policy product_import_items_delete on public.product_import_items for delete to authenticated
using ((select auth.uid()) = user_id or public.can_access_company(company_id));

grant select, insert, update, delete on public.product_import_batches, public.product_import_items to authenticated;
