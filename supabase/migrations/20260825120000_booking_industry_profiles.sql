-- OperiX Booking industry configuration.
-- This migration is additive: existing tenants remain usable and existing
-- services, resources, customers, and bookings are never rewritten or deleted.

create table if not exists public.booking_tenant_configs (
  company_id uuid primary key references public.companies(id) on delete cascade,
  profile_id text not null default 'custom',
  terminology jsonb not null default '{}'::jsonb,
  enabled_modules jsonb not null default '[]'::jsonb,
  module_overrides jsonb not null default '{}'::jsonb,
  onboarding_status text not null default 'pending' check (onboarding_status in ('pending', 'configured', 'customized')),
  template_applied boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.booking_module_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  module_key text not null,
  enabled boolean not null default true,
  source text not null default 'profile' check (source in ('profile', 'admin')),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, module_key)
);

create table if not exists public.booking_custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  entity_type text not null check (entity_type in ('customer', 'booking', 'service', 'resource', 'staff', 'vehicle', 'pet', 'property')),
  field_key text not null,
  label jsonb not null,
  field_type text not null check (field_type in ('text', 'long_text', 'number', 'currency', 'date', 'time', 'datetime', 'select', 'multi_select', 'checkbox', 'toggle', 'email', 'phone', 'address', 'file', 'image')),
  options jsonb not null default '[]'::jsonb,
  is_required boolean not null default false,
  is_public boolean not null default false,
  default_value jsonb,
  validation jsonb not null default '{}'::jsonb,
  placeholder jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, entity_type, field_key)
);

create table if not exists public.booking_custom_field_values (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  field_id uuid not null references public.booking_custom_field_definitions(id) on delete cascade,
  entity_type text not null check (entity_type in ('customer', 'booking', 'service', 'resource', 'staff', 'vehicle', 'pet', 'property')),
  entity_id uuid not null,
  value jsonb not null default 'null'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, field_id, entity_id)
);

create index if not exists booking_module_settings_company_idx
  on public.booking_module_settings(company_id, enabled, module_key);
create index if not exists booking_custom_field_definitions_company_idx
  on public.booking_custom_field_definitions(company_id, entity_type, is_active, sort_order);
create index if not exists booking_custom_field_values_entity_idx
  on public.booking_custom_field_values(company_id, entity_type, entity_id);

alter table public.booking_tenant_configs enable row level security;
alter table public.booking_module_settings enable row level security;
alter table public.booking_custom_field_definitions enable row level security;
alter table public.booking_custom_field_values enable row level security;

revoke all on table public.booking_tenant_configs,
  public.booking_module_settings,
  public.booking_custom_field_definitions,
  public.booking_custom_field_values from public, anon;
grant select, insert, update on table public.booking_tenant_configs,
  public.booking_module_settings,
  public.booking_custom_field_definitions,
  public.booking_custom_field_values to authenticated;

drop policy if exists booking_tenant_config_read on public.booking_tenant_configs;
create policy booking_tenant_config_read on public.booking_tenant_configs
  for select to authenticated
  using (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.read'), false));

drop policy if exists booking_tenant_config_manage on public.booking_tenant_configs;
create policy booking_tenant_config_manage on public.booking_tenant_configs
  for all to authenticated
  using (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.settings.manage'), false))
  with check (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.settings.manage'), false));

drop policy if exists booking_module_settings_read on public.booking_module_settings;
create policy booking_module_settings_read on public.booking_module_settings
  for select to authenticated
  using (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.read'), false));

drop policy if exists booking_module_settings_manage on public.booking_module_settings;
create policy booking_module_settings_manage on public.booking_module_settings
  for all to authenticated
  using (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.settings.manage'), false))
  with check (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.settings.manage'), false));

drop policy if exists booking_custom_fields_read on public.booking_custom_field_definitions;
create policy booking_custom_fields_read on public.booking_custom_field_definitions
  for select to authenticated
  using (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.read'), false));

drop policy if exists booking_custom_fields_manage on public.booking_custom_field_definitions;
create policy booking_custom_fields_manage on public.booking_custom_field_definitions
  for all to authenticated
  using (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.settings.manage'), false))
  with check (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.settings.manage'), false));

drop policy if exists booking_custom_field_values_read on public.booking_custom_field_values;
create policy booking_custom_field_values_read on public.booking_custom_field_values
  for select to authenticated
  using (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.read'), false));

drop policy if exists booking_custom_field_values_manage on public.booking_custom_field_values;
create policy booking_custom_field_values_manage on public.booking_custom_field_values
  for all to authenticated
  using (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.update'), false))
  with check (public.can_access_company(company_id) and coalesce(private.has_company_permission(company_id, 'booking.update'), false));

create or replace function public.booking_industry_config_get(p_company_id uuid)
returns jsonb
language sql
security invoker
set search_path = public, private
as $$
  select to_jsonb(config)
  from public.booking_tenant_configs config
  where config.company_id = p_company_id
    and public.can_access_company(p_company_id)
    and coalesce(private.has_company_permission(p_company_id, 'booking.read'), false)
$$;

create or replace function public.booking_industry_config_save(
  p_company_id uuid,
  p_profile_id text,
  p_enabled_modules jsonb,
  p_terminology jsonb default '{}'::jsonb,
  p_module_overrides jsonb default '{}'::jsonb,
  p_apply_template boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  previous_config public.booking_tenant_configs;
  saved_config public.booking_tenant_configs;
  modules jsonb := coalesce(p_enabled_modules, '[]'::jsonb);
begin
  if not public.can_access_company(p_company_id)
     or not coalesce(private.has_company_permission(p_company_id, 'booking.settings.manage'), false) then
    raise exception 'Booking settings permission required' using errcode = '42501';
  end if;

  if p_profile_id not in (
    'barbershop', 'hair_salon', 'beauty_nail_salon', 'spa_massage', 'medical_clinic',
    'dental_clinic', 'physiotherapy', 'gym_personal_training', 'yoga_pilates_dance',
    'tutoring_training', 'photography_studio', 'sports_facility', 'car_wash_detailing',
    'garage_mechanic', 'pet_grooming', 'veterinary_clinic', 'coworking_space',
    'event_venue', 'recording_studio', 'real_estate_agency', 'law_firm', 'accounting_firm',
    'consultancy', 'cleaning_company', 'home_services', 'hotel_accommodation', 'custom'
  ) then
    raise exception 'Unknown Booking industry profile' using errcode = '22023';
  end if;

  if jsonb_typeof(modules) <> 'array' or exists (
    select 1 from jsonb_array_elements_text(modules) item
    where item not in ('services', 'staff', 'resources', 'locations', 'classes', 'capacity', 'packages', 'memberships', 'payments', 'deposits', 'forms', 'documents', 'attachments', 'travel_time', 'vehicles', 'pets', 'properties', 'equipment', 'attendance', 'check_in', 'recurring_bookings', 'waiting_lists', 'public_booking', 'invoices', 'notes')
  ) then
    raise exception 'Invalid Booking module configuration' using errcode = '22023';
  end if;

  select * into previous_config from public.booking_tenant_configs where company_id = p_company_id;
  insert into public.booking_tenant_configs(company_id, profile_id, terminology, enabled_modules, module_overrides, onboarding_status, template_applied, updated_by)
  values (p_company_id, p_profile_id, coalesce(p_terminology, '{}'::jsonb), modules, coalesce(p_module_overrides, '{}'::jsonb), case when p_apply_template then 'configured' else 'customized' end, p_apply_template, (select auth.uid()))
  on conflict (company_id) do update set
    profile_id = excluded.profile_id,
    terminology = excluded.terminology,
    enabled_modules = excluded.enabled_modules,
    module_overrides = excluded.module_overrides,
    onboarding_status = excluded.onboarding_status,
    template_applied = excluded.template_applied,
    updated_at = now(),
    updated_by = excluded.updated_by
  returning * into saved_config;

  insert into public.booking_module_settings(company_id, module_key, enabled, source)
  select p_company_id, module_key, modules ? module_key, case when p_apply_template then 'profile' else 'admin' end
  from unnest(array['services', 'staff', 'resources', 'locations', 'classes', 'capacity', 'packages', 'memberships', 'payments', 'deposits', 'forms', 'documents', 'attachments', 'travel_time', 'vehicles', 'pets', 'properties', 'equipment', 'attendance', 'check_in', 'recurring_bookings', 'waiting_lists', 'public_booking', 'invoices', 'notes']) module_key
  on conflict (company_id, module_key) do update set enabled = excluded.enabled, source = excluded.source, updated_at = now();

  perform private.booking_audit_event(p_company_id, null, 'industry.configuration_changed', jsonb_build_object(
    'before', case when previous_config.company_id is null then null else to_jsonb(previous_config) end,
    'after', to_jsonb(saved_config),
    'profile_id', p_profile_id,
    'template_applied', p_apply_template
  ));

  return to_jsonb(saved_config);
end
$$;

revoke all on function public.booking_industry_config_get(uuid) from public, anon;
revoke all on function public.booking_industry_config_save(uuid, text, jsonb, jsonb, jsonb, boolean) from public, anon;
grant execute on function public.booking_industry_config_get(uuid) to authenticated;
grant execute on function public.booking_industry_config_save(uuid, text, jsonb, jsonb, jsonb, boolean) to authenticated;

-- Public pages receive only the published industry vocabulary and flow. The
-- tenant config contains no customer records or internal notes.
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
    'industryTerminology', coalesce(config.terminology, '{}'::jsonb),
    'publicBookingFlow', coalesce((config.module_overrides->'publicBookingFlow'), '{}'::jsonb),
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
  left join public.booking_tenant_configs config on config.company_id = page.company_id
  where page.slug = lower(trim(p_slug)) and page.status = 'published' and settings.public_enabled;
$$;

revoke all on function public.booking_page_public_get(text) from public;
grant execute on function public.booking_page_public_get(text) to anon, authenticated;
