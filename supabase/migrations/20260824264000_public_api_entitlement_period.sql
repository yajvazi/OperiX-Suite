-- Expose the API Add-on billing window through the existing entitlement
-- projection so the Developer usage screen measures the actual Stripe period,
-- not a calendar-month approximation.

begin;

create or replace function public.api_entitlement_summary(p_company_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  root_company_id uuid := private.invoice_billing_root_company_id(p_company_id);
  addon_row public.api_addon_subscriptions;
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id, 'settings.integrations') then
    raise exception 'API entitlement access denied' using errcode = '42501';
  end if;

  select * into addon_row
  from public.api_addon_subscriptions
  where company_id = root_company_id;

  return jsonb_build_object(
    'api_addon', private.api_addon_access(p_company_id),
    'invoice', private.api_product_access(p_company_id, 'invoice'),
    'booking', private.api_product_access(p_company_id, 'booking'),
    'status', coalesce(addon_row.status, 'inactive'),
    'period_start', addon_row.current_period_start,
    'period_end', addon_row.current_period_end,
    'grace_period_ends_at', addon_row.grace_period_ends_at,
    'included_requests', 5000,
    'overage_ready', true,
    'automatic_overage_charging', false
  );
end;
$$;

revoke all on function public.api_entitlement_summary(uuid) from public;
grant execute on function public.api_entitlement_summary(uuid) to authenticated, service_role;

commit;
