-- Owner-only OperiX Control visibility for the public API platform.
-- No credential material is returned by these projections.

begin;

create or replace function public.control_list_public_api_overview()
returns table (
  company_id uuid,
  organization text,
  addon_status text,
  api_addon_active boolean,
  invoice_api_active boolean,
  booking_api_active boolean,
  live_requests bigint,
  test_requests bigint,
  successful_live_requests bigint,
  failed_live_requests bigint,
  active_key_count bigint,
  active_webhook_count bigint,
  webhook_failure_count bigint,
  last_request_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.control_is_platform_admin() then
    raise exception 'Platform administration denied' using errcode = '42501';
  end if;

  return query
  select
    company.id,
    coalesce(company.company_name, company.name, company.id::text),
    coalesce(addon.status, 'inactive'),
    private.api_addon_access(company.id),
    private.api_product_access(company.id, 'invoice'),
    private.api_product_access(company.id, 'booking'),
    (select count(*) from public.api_usage usage_row
      where usage_row.company_id = company.id
        and usage_row.environment = 'live'
        and usage_row.occurred_at >= date_trunc('month', now())),
    (select count(*) from public.api_usage usage_row
      where usage_row.company_id = company.id
        and usage_row.environment = 'test'
        and usage_row.occurred_at >= date_trunc('month', now())),
    (select count(*) from public.api_usage usage_row
      where usage_row.company_id = company.id
        and usage_row.environment = 'live'
        and usage_row.occurred_at >= date_trunc('month', now())
        and usage_row.response_status < 400),
    (select count(*) from public.api_usage usage_row
      where usage_row.company_id = company.id
        and usage_row.environment = 'live'
        and usage_row.occurred_at >= date_trunc('month', now())
        and usage_row.response_status >= 400),
    (select count(*) from public.api_keys key_row
      where key_row.company_id = company.id
        and key_row.revoked_at is null
        and (key_row.expires_at is null or key_row.expires_at > now())),
    (select count(*) from public.api_webhook_endpoints endpoint
      where endpoint.company_id = company.id
        and endpoint.status in ('active', 'failing')),
    (select coalesce(sum(endpoint.failure_count), 0) from public.api_webhook_endpoints endpoint
      where endpoint.company_id = company.id
        and endpoint.status <> 'deleted'),
    (select max(usage_row.occurred_at) from public.api_usage usage_row where usage_row.company_id = company.id)
  from public.companies company
  left join public.api_addon_subscriptions addon on addon.company_id = company.id
  order by coalesce(company.company_name, company.name, company.id::text);
end;
$$;

create or replace function public.control_set_public_api_access(
  p_company_id uuid,
  p_enabled boolean,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_value boolean;
begin
  if not public.control_is_platform_admin() then
    raise exception 'Platform administration denied' using errcode = '42501';
  end if;
  if p_company_id is null or not exists (select 1 from public.companies where id = p_company_id) then
    raise exception 'Workspace not found' using errcode = '22023';
  end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'An auditable reason is required' using errcode = '22023';
  end if;

  select override.enabled into previous_value
  from public.api_access_overrides override
  where override.company_id = p_company_id;

  insert into public.api_access_overrides(company_id, enabled, reason, updated_by, updated_at)
    values (p_company_id, p_enabled, trim(p_reason), (select auth.uid()), now())
  on conflict (company_id) do update
    set enabled = excluded.enabled,
        reason = excluded.reason,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;

  insert into public.audit_events(
    company_id, actor_user_id, action, entity_type, entity_id,
    previous_values, new_values, reason
  ) values (
    p_company_id, (select auth.uid()),
    case when p_enabled then 'public_api_access_restored' else 'public_api_access_disabled' end,
    'api_access_overrides', p_company_id,
    jsonb_build_object('enabled', previous_value),
    jsonb_build_object('enabled', p_enabled),
    trim(p_reason)
  );

  return jsonb_build_object('company_id', p_company_id, 'enabled', p_enabled);
end;
$$;

revoke all on function public.control_list_public_api_overview() from public, anon;
revoke all on function public.control_set_public_api_access(uuid, boolean, text) from public, anon;
grant execute on function public.control_list_public_api_overview() to authenticated;
grant execute on function public.control_set_public_api_access(uuid, boolean, text) to authenticated;

commit;
