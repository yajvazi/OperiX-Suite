-- Kosovo import-cost audit fields and TAK sales-book classifications.
-- These columns extend the shared product/invoice records used by web and mobile.

alter table public.products
  add column if not exists purchase_currency text not null default 'EUR',
  add column if not exists exchange_rate numeric(14,6) not null default 1,
  add column if not exists supplier_unit_price numeric(14,4) not null default 0,
  add column if not exists supplier_discount_percent numeric(7,3) not null default 0,
  add column if not exists supplier_unit_price_after_discount numeric(14,4) not null default 0,
  add column if not exists transport_cost numeric(14,4) not null default 0,
  add column if not exists additional_cost numeric(14,4) not null default 0,
  add column if not exists customs_base numeric(14,4) not null default 0,
  add column if not exists customs_duty numeric(14,4) not null default 0,
  add column if not exists excise numeric(14,4) not null default 0,
  add column if not exists import_vat_rate numeric(7,3) not null default 0,
  add column if not exists import_vat_amount numeric(14,4) not null default 0,
  add column if not exists unit_cost_with_vat numeric(14,4) not null default 0,
  add column if not exists tariff_code text,
  add column if not exists country_of_origin text,
  add column if not exists vat_treatment text not null default 'standard_18';

alter table public.products
  drop constraint if exists products_exchange_rate_positive,
  add constraint products_exchange_rate_positive check (exchange_rate > 0),
  drop constraint if exists products_supplier_discount_percent_range,
  add constraint products_supplier_discount_percent_range check (supplier_discount_percent between 0 and 100),
  drop constraint if exists products_import_vat_rate_kosovo,
  add constraint products_import_vat_rate_kosovo check (import_vat_rate in (0, 8, 18)),
  drop constraint if exists products_import_costs_nonnegative,
  add constraint products_import_costs_nonnegative check (
    supplier_unit_price >= 0
    and supplier_unit_price_after_discount >= 0
    and transport_cost >= 0
    and additional_cost >= 0
    and customs_base >= 0
    and customs_duty >= 0
    and excise >= 0
    and import_vat_amount >= 0
    and unit_cost_with_vat >= 0
  );

alter table public.products
  drop constraint if exists products_vat_treatment_check;
alter table public.products
  add constraint products_vat_treatment_check check (
    vat_treatment in (
      'standard_18',
      'reduced_8',
      'exempt_no_credit',
      'exempt_with_credit',
      'export',
      'reverse_charge',
      'out_of_scope'
    )
  );

alter table public.product_import_batches
  add column if not exists exchange_rate numeric(14,6) not null default 1,
  add column if not exists customs_declaration_type text,
  add column if not exists country_of_dispatch text;

alter table public.product_import_batches
  drop constraint if exists product_import_batches_exchange_rate_positive,
  add constraint product_import_batches_exchange_rate_positive check (exchange_rate > 0);

alter table public.product_import_items
  add column if not exists exchange_rate numeric(14,6) not null default 1,
  add column if not exists supplier_unit_price numeric(14,4) not null default 0,
  add column if not exists discount_value numeric(14,4) not null default 0,
  add column if not exists supplier_value_after_discount numeric(14,4) not null default 0,
  add column if not exists customs_base numeric(14,4) not null default 0,
  add column if not exists customs_duty numeric(14,4) not null default 0,
  add column if not exists excise numeric(14,4) not null default 0,
  add column if not exists landed_value numeric(14,4) not null default 0,
  add column if not exists total_value_with_vat numeric(14,4) not null default 0,
  add column if not exists tariff_code text,
  add column if not exists country_of_origin text,
  add column if not exists vat_treatment text not null default 'standard_18';

alter table public.product_import_items
  drop constraint if exists product_import_items_exchange_rate_positive,
  add constraint product_import_items_exchange_rate_positive check (exchange_rate > 0),
  drop constraint if exists product_import_items_discount_percent_range,
  add constraint product_import_items_discount_percent_range check (discount_percent between 0 and 100),
  drop constraint if exists product_import_items_tax_rate_kosovo,
  add constraint product_import_items_tax_rate_kosovo check (tax_rate in (0, 8, 18)),
  drop constraint if exists product_import_items_costs_nonnegative,
  add constraint product_import_items_costs_nonnegative check (
    supplier_unit_price >= 0
    and discount_value >= 0
    and supplier_value_after_discount >= 0
    and customs_base >= 0
    and customs_duty >= 0
    and excise >= 0
    and landed_value >= 0
    and total_value_with_vat >= 0
    and import_vat >= 0
    and unit_price_with_vat >= 0
  );

alter table public.product_import_items
  drop constraint if exists product_import_items_vat_treatment_check;
alter table public.product_import_items
  add constraint product_import_items_vat_treatment_check check (
    vat_treatment in (
      'standard_18',
      'reduced_8',
      'exempt_no_credit',
      'exempt_with_credit',
      'export',
      'reverse_charge',
      'out_of_scope'
    )
  );

alter table public.invoices
  add column if not exists tax_reporting_category text;

alter table public.invoices
  drop constraint if exists invoices_tax_reporting_category_check;
alter table public.invoices
  add constraint invoices_tax_reporting_category_check check (
    tax_reporting_category is null or tax_reporting_category in (
      'domestic_standard_18',
      'domestic_reduced_8',
      'exempt_no_credit',
      'foreign_services',
      'domestic_reverse_charge',
      'exempt_with_credit',
      'export',
      'debit_credit_18',
      'debit_credit_8',
      'bad_debt_18',
      'bad_debt_8',
      'vat_adjustment_18',
      'vat_adjustment_8',
      'reverse_charge_purchase_18',
      'international_organization'
    )
  );

comment on column public.invoices.tax_reporting_category is
  'Explicit TAK sales-book classification. Null values are classified from the invoice VAT rate only when a report is generated.';
