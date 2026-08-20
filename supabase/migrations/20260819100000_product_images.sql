-- Store product photos using the same data-URL convention as existing mobile
-- company and receipt image fields.
alter table public.products
  add column if not exists image_url text;
