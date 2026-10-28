-- OperiX Booking Pages
--
-- Additive tenant-scoped publication layer for public booking pages.
-- Public reads resolve by slug and intentionally do not expose company ids.
-- Public booking creation is kept behind the trusted server boundary and
-- reuses private.booking_create_core for pricing, rules, and concurrency.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.booking_pages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  slug text not null unique,
  status text not null default 'draft' check (status in ('draft', 'published', 'unpublished')),
  draft_config jsonb not null default '{}'::jsonb,
  published_config jsonb not null default '{}'::jsonb,
  draft_version integer not null default 1 check (draft_version > 0),
  published_version integer not null default 0 check (published_version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  unpublished_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  unique (company_id, id),
  check (slug = lower(slug)),
  check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  check (char_length(slug) between 3 and 64)
);

create table if not exists public.booking_page_services (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  page_id uuid not null references public.booking_pages(id) on delete cascade,
  service_id uuid not null,
  is_enabled boolean not null default true,
  is_featured boolean not null default false,
  sort_order integer not null default 0,
  public_name text,
  public_description text,
  created_at timestamptz not null default now(),
  unique (company_id, page_id, service_id),
  foreign key (company_id, page_id) references public.booking_pages(company_id, id) on delete cascade,
  foreign key (company_id, service_id) references public.booking_services(company_id, id) on delete cascade
);

create table if not exists public.booking_page_staff (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  page_id uuid not null references public.booking_pages(id) on delete cascade,
  staff_id uuid not null,
  is_enabled boolean not null default true,
  public_name text,
  public_role_title text,
  public_bio text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (company_id, page_id, staff_id),
  foreign key (company_id, page_id) references public.booking_pages(company_id, id) on delete cascade,
  foreign key (company_id, staff_id) references public.booking_staff(company_id, id) on delete cascade
);

create table if not exists public.booking_page_locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  page_id uuid not null references public.booking_pages(id) on delete cascade,
  location_id uuid not null,
  is_enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (company_id, page_id, location_id),
  foreign key (company_id, page_id) references public.booking_pages(company_id, id) on delete cascade,
  foreign key (company_id, location_id) references public.booking_locations(company_id, id) on delete cascade
);

create table if not exists public.booking_page_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  page_id uuid not null references public.booking_pages(id) on delete cascade,
  event_name text not null check (event_name in (
    'page_view', 'booking_started', 'service_selected', 'slot_selected',
    'checkout_started', 'booking_completed', 'booking_cancelled',
    'booking_rescheduled', 'payment_started', 'payment_completed', 'payment_failed'
  )),
  session_key text,
  service_id uuid,
  location_id uuid,
  staff_id uuid,
  booking_id uuid,
  referrer text,
  attribution jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (company_id, page_id) references public.booking_pages(company_id, id) on delete cascade,
  foreign key (company_id, service_id) references public.booking_services(company_id, id) on delete set null,
  foreign key (company_id, location_id) references public.booking_locations(company_id, id) on delete set null,
  foreign key (company_id, staff_id) references public.booking_staff(company_id, id) on delete set null,
  foreign key (company_id, booking_id) references public.bookings(company_id, id) on delete set null
);

create table if not exists public.booking_page_submission_keys (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  page_id uuid not null references public.booking_pages(id) on delete cascade,
  key_hash text not null,
  booking_id uuid not null,
  created_at timestamptz not null default now(),
  unique (company_id, page_id, key_hash),
  foreign key (company_id, booking_id) references public.bookings(company_id, id) on delete cascade
);

create index if not exists booking_pages_slug_idx on public.booking_pages(slug, status);
create index if not exists booking_page_services_lookup_idx on public.booking_page_services(company_id, page_id, is_enabled, sort_order);
create index if not exists booking_page_staff_lookup_idx on public.booking_page_staff(company_id, page_id, is_enabled, sort_order);
create index if not exists booking_page_locations_lookup_idx on public.booking_page_locations(company_id, page_id, is_enabled, sort_order);
create index if not exists booking_page_events_analytics_idx on public.booking_page_events(company_id, page_id, event_name, created_at desc);
create index if not exists booking_page_events_session_idx on public.booking_page_events(page_id, session_key, event_name, created_at desc);

alter table public.booking_pages enable row level security;
alter table public.booking_page_services enable row level security;
alter table public.booking_page_staff enable row level security;
alter table public.booking_page_locations enable row level security;
alter table public.booking_page_events enable row level security;
alter table public.booking_page_submission_keys enable row level security;

revoke all on table public.booking_pages, public.booking_page_services,
  public.booking_page_staff, public.booking_page_locations,
  public.booking_page_events, public.booking_page_submission_keys
  from public, anon, authenticated;

create policy booking_pages_manage on public.booking_pages
  for all to authenticated
  using (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.settings.manage'), false))
  with check (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.settings.manage'), false));

create policy booking_page_services_manage on public.booking_page_services
  for all to authenticated
  using (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.settings.manage'), false))
  with check (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.settings.manage'), false));

create policy booking_page_staff_manage on public.booking_page_staff
  for all to authenticated
  using (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.settings.manage'), false))
  with check (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.settings.manage'), false));

create policy booking_page_locations_manage on public.booking_page_locations
  for all to authenticated
  using (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.settings.manage'), false))
  with check (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.settings.manage'), false));

-- Public event and booking submission writes happen only through narrowly
-- scoped functions below; anonymous roles never get table access.

do $$
declare
  settings_row record;
  page_row record;
  service_row record;
begin
  for settings_row in
    select settings.*
    from public.booking_settings settings
    where settings.public_slug is not null
      and settings.public_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      and char_length(settings.public_slug) between 3 and 64
  loop
    insert into public.booking_pages(company_id, slug, status, draft_config, published_config, draft_version, published_version, published_at)
    values (
      settings_row.company_id,
      lower(trim(settings_row.public_slug)),
      case when settings_row.public_enabled then 'published' else 'draft' end,
      jsonb_build_object(
        'template', 'standard',
        'displayName', (select coalesce(company.company_name, company.name, 'OperiX Booking') from public.companies company where company.id = settings_row.company_id),
        'description', settings_row.public_description,
        'about', null,
        'logoUrl', settings_row.public_logo_url,
        'coverImageUrl', null,
        'primaryColor', settings_row.public_primary_color,
        'secondaryColor', null,
        'headline', null,
        'defaultLanguage', 'en',
        'enabledLanguages', jsonb_build_array('en', 'sq'),
        'showStaff', true,
        'showLocations', true,
        'staffSelection', 'any_or_choose',
        'allowIndexing', false
        , 'sectionVisibility', jsonb_build_object('services', true, 'team', true, 'about', true, 'locations', true, 'contact', true, 'trust', true)
      ),
      case when settings_row.public_enabled then jsonb_build_object(
        'template', 'standard',
        'displayName', (select coalesce(company.company_name, company.name, 'OperiX Booking') from public.companies company where company.id = settings_row.company_id),
        'description', settings_row.public_description,
        'about', null,
        'logoUrl', settings_row.public_logo_url,
        'coverImageUrl', null,
        'primaryColor', settings_row.public_primary_color,
        'secondaryColor', null,
        'headline', null,
        'defaultLanguage', 'en',
        'enabledLanguages', jsonb_build_array('en', 'sq'),
        'showStaff', true,
        'showLocations', true,
        'staffSelection', 'any_or_choose',
        'allowIndexing', false
        , 'sectionVisibility', jsonb_build_object('services', true, 'team', true, 'about', true, 'locations', true, 'contact', true, 'trust', true)
      ) else '{}'::jsonb end,
      1,
      case when settings_row.public_enabled then 1 else 0 end,
      case when settings_row.public_enabled then settings_row.updated_at else null end
    )
    on conflict (company_id) do nothing;
  end loop;

  for page_row in select page.* from public.booking_pages page loop
    insert into public.booking_page_services(company_id, page_id, service_id, sort_order)
    select service.company_id, page_row.id, service.id, row_number() over (order by service.name) - 1
    from public.booking_services service
    where service.company_id = page_row.company_id and service.is_active
    on conflict (company_id, page_id, service_id) do nothing;

    insert into public.booking_page_staff(company_id, page_id, staff_id, sort_order)
    select staff.company_id, page_row.id, staff.id, row_number() over (order by staff.display_name) - 1
    from public.booking_staff staff
    where staff.company_id = page_row.company_id and staff.is_active
    on conflict (company_id, page_id, staff_id) do nothing;

    insert into public.booking_page_locations(company_id, page_id, location_id, sort_order)
    select location.company_id, page_row.id, location.id, row_number() over (order by location.name) - 1
    from public.booking_locations location
    where location.company_id = page_row.company_id and location.is_active
    on conflict (company_id, page_id, location_id) do nothing;
  end loop;
end;
$$;

create or replace function public.booking_page_get(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  page_row public.booking_pages;
begin
  if p_company_id is null or not public.can_access_company(p_company_id) or not coalesce(private.has_company_permission(p_company_id, 'booking.settings.manage'), false) then
    raise exception 'You do not have permission to manage Booking Pages' using errcode = '42501';
  end if;
  select page.* into page_row from public.booking_pages page where page.company_id = p_company_id;
  return jsonb_build_object(
    'page', case when page_row.id is null then null else to_jsonb(page_row) end,
    'services', coalesce((select jsonb_agg(to_jsonb(item) order by item.sort_order, item.created_at) from public.booking_page_services item where item.company_id = p_company_id and item.page_id = page_row.id), '[]'::jsonb),
    'staff', coalesce((select jsonb_agg(to_jsonb(item) order by item.sort_order, item.created_at) from public.booking_page_staff item where item.company_id = p_company_id and item.page_id = page_row.id), '[]'::jsonb),
    'locations', coalesce((select jsonb_agg(to_jsonb(item) order by item.sort_order, item.created_at) from public.booking_page_locations item where item.company_id = p_company_id and item.page_id = page_row.id), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.booking_page_get(uuid) from public, anon;
grant execute on function public.booking_page_get(uuid) to authenticated;

create or replace function public.booking_page_save_draft(
  p_company_id uuid,
  p_slug text,
  p_config jsonb default '{}'::jsonb,
  p_service_ids uuid[] default '{}',
  p_staff_ids uuid[] default '{}',
  p_location_ids uuid[] default '{}',
  p_confirm_slug_change boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  page_row public.booking_pages;
  normalized_slug text := lower(trim(p_slug));
  config jsonb := coalesce(p_config, '{}'::jsonb);
begin
  if actor_id is null or not public.can_access_company(p_company_id) or not coalesce(private.has_company_permission(p_company_id, 'booking.settings.manage'), false) then
    raise exception 'You do not have permission to manage Booking Pages' using errcode = '42501';
  end if;
  if normalized_slug is null or char_length(normalized_slug) not between 3 and 64 or normalized_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Use 3–64 lowercase letters, numbers, and hyphens for the public URL.' using errcode = '22023';
  end if;
  if normalized_slug in ('admin', 'api', 'auth', 'login', 'register', 'dashboard', 'booking', 'support', 'help', 'account', 'settings', 'operix', 'operixsuite', 'manage', 'public', 'widget') then
    raise exception 'That public URL is reserved. Choose another one.' using errcode = '23505';
  end if;
  if coalesce(config->>'template', 'standard') not in ('standard', 'minimal', 'professional', 'wellness', 'services') then
    raise exception 'The selected Booking Page template is invalid.' using errcode = '22023';
  end if;
  if char_length(coalesce(config->>'displayName', '')) > 120 or char_length(coalesce(config->>'description', '')) > 500 or char_length(coalesce(config->>'about', '')) > 2000 then
    raise exception 'Booking Page text is too long.' using errcode = '22023';
  end if;
  if coalesce(config->>'primaryColor', '#004FFE') !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Choose a valid six-digit accent color.' using errcode = '22023';
  end if;
  if nullif(config->>'secondaryColor', '') is not null and config->>'secondaryColor' !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Choose a valid secondary color.' using errcode = '22023';
  end if;
  if char_length(coalesce(config->>'headline', '')) > 180 then
    raise exception 'The page headline is too long.' using errcode = '22023';
  end if;
  if nullif(config->>'logoUrl', '') is not null and config->>'logoUrl' !~ '^https?://[^[:space:]]+$' then
    raise exception 'The page logo must be an https image URL.' using errcode = '22023';
  end if;
  if nullif(config->>'coverImageUrl', '') is not null and config->>'coverImageUrl' !~ '^https?://[^[:space:]]+$' then
    raise exception 'The page cover must be an https image URL.' using errcode = '22023';
  end if;
  select page.* into page_row from public.booking_pages page where page.company_id = p_company_id for update;
  if page_row.id is not null and page_row.status = 'published' and page_row.slug <> normalized_slug and not coalesce(p_confirm_slug_change, false) then
    raise exception 'Changing a published URL requires confirmation.' using errcode = '55000';
  end if;
  if exists (select 1 from public.booking_pages page where page.slug = normalized_slug and page.company_id <> p_company_id) then
    raise exception 'That public URL is already in use.' using errcode = '23505';
  end if;
  if exists (select 1 from unnest(coalesce(p_service_ids, '{}'::uuid[])) value where not exists (select 1 from public.booking_services service where service.company_id = p_company_id and service.id = value and service.is_active)) then
    raise exception 'A selected service does not belong to this workspace.' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(coalesce(p_staff_ids, '{}'::uuid[])) value where not exists (select 1 from public.booking_staff staff where staff.company_id = p_company_id and staff.id = value and staff.is_active)) then
    raise exception 'A selected staff member does not belong to this workspace.' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(coalesce(p_location_ids, '{}'::uuid[])) value where not exists (select 1 from public.booking_locations location where location.company_id = p_company_id and location.id = value and location.is_active)) then
    raise exception 'A selected location does not belong to this workspace.' using errcode = '42501';
  end if;

  insert into public.booking_pages(company_id, slug, status, draft_config, draft_version, updated_at, updated_by)
  values (p_company_id, normalized_slug, case when coalesce(page_row.status, 'draft') = 'published' then 'published' else 'draft' end, config, coalesce(page_row.draft_version, 0) + 1, now(), actor_id)
  on conflict (company_id) do update set slug = excluded.slug, draft_config = excluded.draft_config, draft_version = public.booking_pages.draft_version + 1, updated_at = now(), updated_by = actor_id;
  select page.* into page_row from public.booking_pages page where page.company_id = p_company_id;

  delete from public.booking_page_services where company_id = p_company_id and page_id = page_row.id;
  insert into public.booking_page_services(company_id, page_id, service_id, sort_order)
  select p_company_id, page_row.id, value, row_number() over () - 1 from unnest(coalesce(p_service_ids, '{}'::uuid[])) value;
  delete from public.booking_page_staff where company_id = p_company_id and page_id = page_row.id;
  insert into public.booking_page_staff(company_id, page_id, staff_id, sort_order)
  select p_company_id, page_row.id, value, row_number() over () - 1 from unnest(coalesce(p_staff_ids, '{}'::uuid[])) value;
  delete from public.booking_page_locations where company_id = p_company_id and page_id = page_row.id;
  insert into public.booking_page_locations(company_id, page_id, location_id, sort_order)
  select p_company_id, page_row.id, value, row_number() over () - 1 from unnest(coalesce(p_location_ids, '{}'::uuid[])) value;
  return public.booking_page_get(p_company_id);
end;
$$;

revoke all on function public.booking_page_save_draft(uuid, text, jsonb, uuid[], uuid[], uuid[], boolean) from public, anon;
grant execute on function public.booking_page_save_draft(uuid, text, jsonb, uuid[], uuid[], uuid[], boolean) to authenticated;

create or replace function public.booking_page_publish(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  page_row public.booking_pages;
  settings_row public.booking_settings;
  config jsonb;
begin
  if actor_id is null or not public.can_access_company(p_company_id) or not coalesce(private.has_company_permission(p_company_id, 'booking.settings.manage'), false) then
    raise exception 'You do not have permission to publish Booking Pages' using errcode = '42501';
  end if;
  select page.* into page_row from public.booking_pages page where page.company_id = p_company_id for update;
  if page_row.id is null then raise exception 'Save a Booking Page draft before publishing.' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.booking_page_services item where item.company_id = p_company_id and item.page_id = page_row.id and item.is_enabled) then
    raise exception 'Select at least one service before publishing.' using errcode = '22023';
  end if;
  config := page_row.draft_config;
  update public.booking_pages
  set status = 'published', published_config = config, published_version = draft_version,
      published_at = now(), unpublished_at = null, published_by = actor_id, updated_at = now(), updated_by = actor_id
  where id = page_row.id
  returning * into page_row;
  select settings.* into settings_row from public.booking_settings settings where settings.company_id = p_company_id;
  insert into public.booking_settings(company_id, timezone, currency, public_enabled, public_slug, public_description, public_logo_url, public_primary_color, updated_at, updated_by)
  values (p_company_id, coalesce(settings_row.timezone, 'UTC'), coalesce(settings_row.currency, 'EUR'), true, page_row.slug, nullif(config->>'description', ''), nullif(config->>'logoUrl', ''), coalesce(config->>'primaryColor', '#004FFE'), now(), actor_id)
  on conflict (company_id) do update set public_enabled = true, public_slug = excluded.public_slug, public_description = excluded.public_description, public_logo_url = excluded.public_logo_url, public_primary_color = excluded.public_primary_color, updated_at = now(), updated_by = actor_id;
  return public.booking_page_get(p_company_id);
end;
$$;

revoke all on function public.booking_page_publish(uuid) from public, anon;
grant execute on function public.booking_page_publish(uuid) to authenticated;

create or replace function public.booking_page_unpublish(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
begin
  if actor_id is null or not public.can_access_company(p_company_id) or not coalesce(private.has_company_permission(p_company_id, 'booking.settings.manage'), false) then
    raise exception 'You do not have permission to unpublish Booking Pages' using errcode = '42501';
  end if;
  update public.booking_pages set status = 'unpublished', unpublished_at = now(), updated_at = now(), updated_by = actor_id where company_id = p_company_id;
  update public.booking_settings set public_enabled = false, updated_at = now(), updated_by = actor_id where company_id = p_company_id;
  return public.booking_page_get(p_company_id);
end;
$$;

revoke all on function public.booking_page_unpublish(uuid) from public, anon;
grant execute on function public.booking_page_unpublish(uuid) to authenticated;

create or replace function public.booking_page_analytics(p_company_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  page_row public.booking_pages;
  slug_value text;
begin
  if p_company_id is null or not public.can_access_company(p_company_id) or not coalesce(private.has_company_permission(p_company_id, 'booking.read'), false) then
    raise exception 'You do not have permission to view Booking Page analytics' using errcode = '42501';
  end if;
  select page.* into page_row from public.booking_pages page where page.company_id = p_company_id;
  if page_row.id is null then return jsonb_build_object('views', 0, 'uniqueSessions', 0, 'started', 0, 'bookings', 0, 'conversion', 0, 'revenue', 0, 'deposits', 0); end if;
  slug_value := page_row.slug;
  return jsonb_build_object(
    'views', (select count(*) from public.booking_page_events event where event.page_id = page_row.id and event.event_name = 'page_view' and event.created_at >= p_from and event.created_at < p_to),
    'uniqueSessions', (select count(distinct event.session_key) from public.booking_page_events event where event.page_id = page_row.id and event.event_name = 'page_view' and event.session_key is not null and event.created_at >= p_from and event.created_at < p_to),
    'started', (select count(*) from public.booking_page_events event where event.page_id = page_row.id and event.event_name = 'booking_started' and event.created_at >= p_from and event.created_at < p_to),
    'bookings', (select count(*) from public.bookings booking where booking.company_id = p_company_id and booking.source = 'public' and booking.source_detail->>'pageSlug' = slug_value and booking.created_at >= p_from and booking.created_at < p_to),
    'conversion', case when (select count(*) from public.booking_page_events event where event.page_id = page_row.id and event.event_name = 'page_view' and event.created_at >= p_from and event.created_at < p_to) = 0 then 0 else round(((select count(*) from public.bookings booking where booking.company_id = p_company_id and booking.source = 'public' and booking.source_detail->>'pageSlug' = slug_value and booking.created_at >= p_from and booking.created_at < p_to)::numeric / (select count(*) from public.booking_page_events event where event.page_id = page_row.id and event.event_name = 'page_view' and event.created_at >= p_from and event.created_at < p_to)::numeric) * 100, 2) end,
    'revenue', coalesce((select sum(booking.total_amount) from public.bookings booking where booking.company_id = p_company_id and booking.source = 'public' and booking.source_detail->>'pageSlug' = slug_value and booking.status <> 'cancelled' and booking.created_at >= p_from and booking.created_at < p_to), 0),
    'deposits', coalesce((select sum(booking.paid_amount) from public.bookings booking where booking.company_id = p_company_id and booking.source = 'public' and booking.source_detail->>'pageSlug' = slug_value and booking.created_at >= p_from and booking.created_at < p_to), 0)
  );
end;
$$;

revoke all on function public.booking_page_analytics(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.booking_page_analytics(uuid, timestamptz, timestamptz) to authenticated;

create or replace function public.booking_page_public_get(p_slug text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'available', page.status = 'published' and settings.public_enabled,
    'slug', page.slug,
    'businessName', coalesce(page.published_config->>'displayName', company.company_name, company.name, 'OperiX Booking'),
    'description', page.published_config->>'description',
    'about', page.published_config->>'about',
    'logoUrl', page.published_config->>'logoUrl',
    'coverImageUrl', page.published_config->>'coverImageUrl',
    'primaryColor', coalesce(page.published_config->>'primaryColor', '#004FFE'),
    'secondaryColor', page.published_config->>'secondaryColor',
    'headline', page.published_config->>'headline',
    'template', coalesce(page.published_config->>'template', 'standard'),
    'defaultLanguage', coalesce(page.published_config->>'defaultLanguage', 'en'),
    'enabledLanguages', coalesce(page.published_config->'enabledLanguages', '["en"]'::jsonb),
    'showStaff', coalesce((page.published_config->>'showStaff')::boolean, true),
    'showLocations', coalesce((page.published_config->>'showLocations')::boolean, true),
    'staffSelection', coalesce(page.published_config->>'staffSelection', 'any_or_choose'),
    'timezone', settings.timezone,
    'currency', settings.currency,
    'requireCustomerEmail', settings.require_customer_email,
    'requireCustomerPhone', settings.require_customer_phone,
    'autoConfirm', settings.auto_confirm,
    'sectionVisibility', coalesce(page.published_config->'sectionVisibility', jsonb_build_object('services', true, 'team', true, 'about', true, 'locations', true, 'contact', true, 'trust', true)),
    'trustFeatures', coalesce(page.published_config->'trustFeatures', '[]'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object(
      'id', service.id, 'name', coalesce(item.public_name, service.name), 'description', coalesce(item.public_description, service.description),
      'durationMinutes', service.duration_minutes, 'price', service.price, 'currency', service.currency,
      'taxRate', service.tax_rate, 'depositType', service.deposit_type, 'depositValue', service.deposit_value,
      'minParticipants', service.min_participants, 'maxParticipants', service.max_participants,
      'customFormEnabled', service.custom_form_enabled, 'featured', item.is_featured, 'imageUrl', service.image_url
    ) order by item.is_featured desc, item.sort_order, service.name) from public.booking_page_services item join public.booking_services service on service.company_id = item.company_id and service.id = item.service_id where item.page_id = page.id and item.company_id = page.company_id and item.is_enabled and service.is_active), '[]'::jsonb),
    'locations', coalesce((select jsonb_agg(jsonb_build_object('id', location.id, 'name', location.name, 'address', location.address, 'phone', location.phone, 'timezone', location.timezone) order by item.sort_order, location.name) from public.booking_page_locations item join public.booking_locations location on location.company_id = item.company_id and location.id = item.location_id where item.page_id = page.id and item.company_id = page.company_id and item.is_enabled and location.is_active), '[]'::jsonb),
    'staff', case when coalesce((page.published_config->>'showStaff')::boolean, true) then coalesce((select jsonb_agg(jsonb_build_object('id', staff.id, 'displayName', coalesce(item.public_name, staff.display_name), 'roleTitle', coalesce(item.public_role_title, staff.role_title), 'bio', item.public_bio) order by item.sort_order, staff.display_name) from public.booking_page_staff item join public.booking_staff staff on staff.company_id = item.company_id and staff.id = item.staff_id where item.page_id = page.id and item.company_id = page.company_id and item.is_enabled and staff.is_active), '[]'::jsonb) else '[]'::jsonb end
  )
  from public.booking_pages page
  join public.booking_settings settings on settings.company_id = page.company_id
  join public.companies company on company.id = page.company_id
  where page.slug = lower(trim(p_slug)) and page.status = 'published' and settings.public_enabled;
$$;

revoke all on function public.booking_page_public_get(text) from public;
grant execute on function public.booking_page_public_get(text) to anon, authenticated;

create or replace function public.booking_get_public_catalog(p_slug text)
returns jsonb
language sql
security definer
set search_path = ''
as $$ select coalesce(public.booking_page_public_get(p_slug), jsonb_build_object('available', false)); $$;

revoke all on function public.booking_get_public_catalog(text) from public;
grant execute on function public.booking_get_public_catalog(text) to anon, authenticated;

create or replace function public.booking_page_public_slots(
  p_slug text,
  p_service_id uuid,
  p_date date,
  p_location_id uuid default null,
  p_staff_id uuid default null,
  p_participant_count integer default 1
)
returns table(starts_at timestamptz, ends_at timestamptz, available boolean, capacity_remaining integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  company_id_value uuid;
  page_id_value uuid;
begin
  select page.company_id, page.id into company_id_value, page_id_value
  from public.booking_pages page
  join public.booking_settings settings on settings.company_id = page.company_id
  where page.slug = lower(trim(p_slug)) and page.status = 'published' and settings.public_enabled;
  if company_id_value is null then return; end if;
  if not exists (select 1 from public.booking_page_services item join public.booking_services service on service.company_id = item.company_id and service.id = item.service_id where item.company_id = company_id_value and item.page_id = page_id_value and item.service_id = p_service_id and item.is_enabled and service.is_active) then return; end if;
  if p_location_id is not null and not exists (select 1 from public.booking_page_locations item where item.company_id = company_id_value and item.page_id = page_id_value and item.location_id = p_location_id and item.is_enabled) then return; end if;
  if p_staff_id is not null and not exists (select 1 from public.booking_page_staff item where item.company_id = company_id_value and item.page_id = page_id_value and item.staff_id = p_staff_id and item.is_enabled) then return; end if;
  return query select slot.starts_at, slot.ends_at, slot.available, slot.capacity_remaining from public.booking_get_available_slots(company_id_value, p_service_id, p_date, p_location_id, null, p_staff_id, greatest(coalesce(p_participant_count, 1), 1), lower(trim(p_slug))) slot where slot.available;
end;
$$;

revoke all on function public.booking_page_public_slots(text, uuid, date, uuid, uuid, integer) from public;
grant execute on function public.booking_page_public_slots(text, uuid, date, uuid, uuid, integer) to anon, authenticated;

create or replace function public.booking_page_public_form_fields(p_slug text, p_service_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('fieldKey', field.field_key, 'label', field.label, 'fieldType', field.field_type, 'options', field.options, 'isRequired', field.is_required, 'sortOrder', field.sort_order) order by field.sort_order, field.created_at), '[]'::jsonb)
  from public.booking_form_fields field
  join public.booking_form_templates template on template.company_id = field.company_id and template.id = field.template_id and template.is_active and template.service_id = p_service_id
  join public.booking_pages page on page.company_id = field.company_id and page.slug = lower(trim(p_slug)) and page.status = 'published'
  join public.booking_settings settings on settings.company_id = page.company_id and settings.public_enabled;
$$;

revoke all on function public.booking_page_public_form_fields(text, uuid) from public;
grant execute on function public.booking_page_public_form_fields(text, uuid) to anon, authenticated;

create or replace function public.booking_page_event(
  p_slug text,
  p_event_name text,
  p_session_key text default null,
  p_service_id uuid default null,
  p_location_id uuid default null,
  p_staff_id uuid default null,
  p_referrer text default null,
  p_attribution jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  page_row public.booking_pages;
  normalized_session text := nullif(left(trim(coalesce(p_session_key, '')), 128), '');
begin
  select page.* into page_row from public.booking_pages page join public.booking_settings settings on settings.company_id = page.company_id where page.slug = lower(trim(p_slug)) and page.status = 'published' and settings.public_enabled;
  if page_row.id is null or p_event_name not in ('page_view', 'booking_started', 'service_selected', 'slot_selected', 'checkout_started', 'payment_started', 'payment_failed') then return false; end if;
  if p_event_name = 'page_view' and normalized_session is not null and exists (select 1 from public.booking_page_events event where event.page_id = page_row.id and event.event_name = 'page_view' and event.session_key = normalized_session and event.created_at > now() - interval '1 day') then return true; end if;
  insert into public.booking_page_events(company_id, page_id, event_name, session_key, service_id, location_id, staff_id, referrer, attribution)
  values (page_row.company_id, page_row.id, p_event_name, normalized_session, p_service_id, p_location_id, p_staff_id, nullif(left(trim(coalesce(p_referrer, '')), 500), ''), coalesce(p_attribution, '{}'::jsonb) - 'email' - 'phone' - 'name');
  return true;
end;
$$;

revoke all on function public.booking_page_event(text, text, text, uuid, uuid, uuid, text, jsonb) from public;
grant execute on function public.booking_page_event(text, text, text, uuid, uuid, uuid, text, jsonb) to anon, authenticated;

create or replace function public.booking_page_public_create(
  p_slug text,
  p_service_id uuid,
  p_location_id uuid,
  p_staff_id uuid,
  p_starts_at timestamptz,
  p_guest_name text,
  p_guest_email text default null,
  p_guest_phone text default null,
  p_notes text default null,
  p_custom_form_answers jsonb default '{}'::jsonb,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  company_id_value uuid;
  page_row public.booking_pages;
  settings_row public.booking_settings;
  booking_row public.bookings;
  key_hash text;
  existing_submission public.booking_page_submission_keys;
  normalized_slug text := lower(trim(p_slug));
  answers jsonb := coalesce(p_custom_form_answers, '{}'::jsonb);
  field_row record;
  status_value text;
  request_headers jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
  request_rate_key text;
  ip_hash_value text;
  recent_attempts integer;
begin
  if nullif(trim(p_idempotency_key), '') is null or char_length(trim(p_idempotency_key)) > 160 then raise exception 'A valid booking submission key is required' using errcode = '22023'; end if;
  request_rate_key := nullif(request_headers ->> 'x-operix-booking-rate-key', '');
  if request_rate_key is null or char_length(request_rate_key) > 128 then raise exception 'Public booking is temporarily unavailable' using errcode = '42501'; end if;
  select page.* into page_row from public.booking_pages page join public.booking_settings settings on settings.company_id = page.company_id where page.slug = normalized_slug and page.status = 'published' and settings.public_enabled for update;
  if page_row.id is null then raise exception 'Public booking is not available' using errcode = '42501'; end if;
  select settings.* into settings_row from public.booking_settings settings where settings.company_id = page_row.company_id;
  ip_hash_value := md5(request_rate_key || ':' || normalized_slug);
  perform pg_advisory_xact_lock(hashtextextended(ip_hash_value, 0));
  select count(*)::integer into recent_attempts from public.booking_public_attempts attempt where attempt.public_slug = normalized_slug and attempt.ip_hash = ip_hash_value and attempt.created_at > now() - interval '15 minutes';
  if recent_attempts >= 10 then raise exception 'Too many booking attempts. Please try again later.' using errcode = '42900'; end if;
  insert into public.booking_public_attempts(company_id, public_slug, ip_hash, guest_email) values (page_row.company_id, normalized_slug, ip_hash_value, nullif(trim(p_guest_email), ''));
  if not exists (select 1 from public.booking_page_services item join public.booking_services service on service.company_id = item.company_id and service.id = item.service_id where item.company_id = page_row.company_id and item.page_id = page_row.id and item.service_id = p_service_id and item.is_enabled and service.is_active) then raise exception 'The selected service is no longer available' using errcode = 'P0002'; end if;
  if p_location_id is not null and not exists (select 1 from public.booking_page_locations item where item.company_id = page_row.company_id and item.page_id = page_row.id and item.location_id = p_location_id and item.is_enabled) then raise exception 'The selected location is no longer available' using errcode = 'P0002'; end if;
  if p_staff_id is not null and not exists (select 1 from public.booking_page_staff item where item.company_id = page_row.company_id and item.page_id = page_row.id and item.staff_id = p_staff_id and item.is_enabled) then raise exception 'The selected provider is no longer available' using errcode = 'P0002'; end if;
  key_hash := encode(extensions.digest(page_row.company_id::text || ':' || page_row.id::text || ':' || trim(p_idempotency_key), 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(key_hash, 0));
  select submission.* into existing_submission from public.booking_page_submission_keys submission where submission.company_id = page_row.company_id and submission.page_id = page_row.id and submission.key_hash = key_hash for update;
  if existing_submission.id is not null then
    select booking.* into booking_row from public.bookings booking where booking.company_id = page_row.company_id and booking.id = existing_submission.booking_id;
    return jsonb_build_object('id', booking_row.id, 'bookingNumber', booking_row.booking_number, 'status', booking_row.status, 'total', booking_row.total_amount, 'deposit', booking_row.deposit_amount, 'currency', booking_row.currency);
  end if;
  for field_row in
    select field.* from public.booking_form_fields field join public.booking_form_templates template on template.company_id = field.company_id and template.id = field.template_id and template.is_active and template.service_id = p_service_id where field.company_id = page_row.company_id order by field.sort_order
  loop
    if field_row.is_required and (not answers ? field_row.field_key or nullif(trim(coalesce(answers->>field_row.field_key, '')), '') is null) then raise exception 'Please complete the required booking question: %', field_row.label using errcode = '22023'; end if;
  end loop;
  status_value := case when coalesce(settings_row.auto_confirm, true) then 'confirmed' else 'pending' end;
  select * into booking_row from private.booking_create_core(
    page_row.company_id, null, p_guest_name, p_guest_email, p_guest_phone,
    p_service_id, p_location_id, null, p_staff_id, p_starts_at, null,
    1, 1, status_value, p_notes, null, null, 'public', null, null, true, normalized_slug
  );
  update public.bookings set source_detail = jsonb_build_object('channel', 'booking_page', 'pageSlug', normalized_slug), custom_form_answers = answers, updated_at = now() where company_id = page_row.company_id and id = booking_row.id returning * into booking_row;
  for field_row in
    select field.* from public.booking_form_fields field join public.booking_form_templates template on template.company_id = field.company_id and template.id = field.template_id and template.is_active and template.service_id = p_service_id where field.company_id = page_row.company_id and answers ? field.field_key order by field.sort_order
  loop
    insert into public.booking_form_responses(company_id, booking_id, field_id, field_key, label, field_type, value) values (page_row.company_id, booking_row.id, field_row.id, field_row.field_key, field_row.label, field_row.field_type, answers->field_row.field_key);
  end loop;
  insert into public.booking_page_submission_keys(company_id, page_id, key_hash, booking_id) values (page_row.company_id, page_row.id, key_hash, booking_row.id);
  insert into public.booking_page_events(company_id, page_id, event_name, session_key, service_id, location_id, staff_id, booking_id) values (page_row.company_id, page_row.id, 'booking_completed', null, p_service_id, p_location_id, p_staff_id, booking_row.id);
  return jsonb_build_object('id', booking_row.id, 'bookingNumber', booking_row.booking_number, 'status', booking_row.status, 'total', booking_row.total_amount, 'deposit', booking_row.deposit_amount, 'currency', booking_row.currency);
end;
$$;

revoke all on function public.booking_page_public_create(text, uuid, uuid, uuid, timestamptz, text, text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.booking_page_public_create(text, uuid, uuid, uuid, timestamptz, text, text, text, text, jsonb, text) to service_role;

comment on table public.booking_pages is 'Draft/published tenant-owned OperiX Booking Pages configuration.';
comment on table public.booking_page_events is 'Privacy-conscious aggregate Booking Page events; no customer PII is stored.';
comment on table public.booking_page_submission_keys is 'Idempotency keys for trusted public Booking Page booking submission.';
