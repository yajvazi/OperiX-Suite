delete from public.favorites
where resource_id in (
  select id from public.resources where is_active = false
);

delete from public.reservations
where resource_id in (
  select id from public.resources where is_active = false
);

delete from public.resources
where is_active = false;
