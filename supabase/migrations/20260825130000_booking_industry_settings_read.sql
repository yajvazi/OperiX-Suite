-- Allow users who can administer Booking settings to review the configuration
-- they are about to change, while keeping all rows tenant-scoped.

drop policy if exists booking_tenant_config_read on public.booking_tenant_configs;
create policy booking_tenant_config_read on public.booking_tenant_configs
  for select to authenticated
  using (
    public.can_access_company(company_id)
    and (
      coalesce(private.has_company_permission(company_id, 'booking.read'), false)
      or coalesce(private.has_company_permission(company_id, 'booking.settings.manage'), false)
    )
  );

drop policy if exists booking_module_settings_read on public.booking_module_settings;
create policy booking_module_settings_read on public.booking_module_settings
  for select to authenticated
  using (
    public.can_access_company(company_id)
    and (
      coalesce(private.has_company_permission(company_id, 'booking.read'), false)
      or coalesce(private.has_company_permission(company_id, 'booking.settings.manage'), false)
    )
  );

drop policy if exists booking_custom_fields_read on public.booking_custom_field_definitions;
create policy booking_custom_fields_read on public.booking_custom_field_definitions
  for select to authenticated
  using (
    public.can_access_company(company_id)
    and (
      coalesce(private.has_company_permission(company_id, 'booking.read'), false)
      or coalesce(private.has_company_permission(company_id, 'booking.settings.manage'), false)
    )
  );

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
    and (
      coalesce(private.has_company_permission(p_company_id, 'booking.read'), false)
      or coalesce(private.has_company_permission(p_company_id, 'booking.settings.manage'), false)
    )
$$;
