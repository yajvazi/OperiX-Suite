insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists product_images_insert on storage.objects;
create policy product_images_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'product-images'
  and (
    (
      split_part(name, '/', 1) = 'company'
      and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and public.can_access_company(split_part(name, '/', 2)::uuid)
    )
    or (
      split_part(name, '/', 1) = 'user'
      and split_part(name, '/', 2) = (select auth.uid())::text
    )
  )
);

drop policy if exists product_images_update on storage.objects;
create policy product_images_update on storage.objects
for update to authenticated
using (
  bucket_id = 'product-images'
  and (
    (
      split_part(name, '/', 1) = 'company'
      and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and public.can_access_company(split_part(name, '/', 2)::uuid)
    )
    or (
      split_part(name, '/', 1) = 'user'
      and split_part(name, '/', 2) = (select auth.uid())::text
    )
  )
)
with check (
  bucket_id = 'product-images'
  and (
    (
      split_part(name, '/', 1) = 'company'
      and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and public.can_access_company(split_part(name, '/', 2)::uuid)
    )
    or (
      split_part(name, '/', 1) = 'user'
      and split_part(name, '/', 2) = (select auth.uid())::text
    )
  )
);

drop policy if exists product_images_delete on storage.objects;
create policy product_images_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'product-images'
  and (
    (
      split_part(name, '/', 1) = 'company'
      and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and public.can_access_company(split_part(name, '/', 2)::uuid)
    )
    or (
      split_part(name, '/', 1) = 'user'
      and split_part(name, '/', 2) = (select auth.uid())::text
    )
  )
);
