-- Align the server-side Invoice price with the current commercial contract:
-- EUR 9.99/month and EUR 99.99/year. Historical migrations retain their
-- original values; this migration is the authoritative forward correction for
-- existing databases and fresh installs.

begin;

create or replace function private.operix_plan_value(
  p_plan text,
  p_interval text,
  p_billable_tenants integer,
  p_billable_users integer
)
returns numeric
language sql
immutable
as $$
  select case when p_interval = 'annual' then
    case p_plan when 'invoice' then 99.99 when 'booking' then 49.99 when 'suite' then 99.99 else 0 end
      + coalesce(p_billable_tenants, 0) * 19.99
      + coalesce(p_billable_users, 0) * 9.99
  else
    case p_plan when 'invoice' then 9.99 when 'booking' then 4.99 when 'suite' then 11.99 else 0 end
      + coalesce(p_billable_tenants, 0) * 1.99
      + coalesce(p_billable_users, 0) * 0.99
  end;
$$;

create or replace function public.get_product_billing_summary(p_company_id uuid, p_product text)
returns table(
  company_id uuid,
  billing_account_company_id uuid,
  requested_product text,
  plan text,
  product text,
  entitlements jsonb,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text,
  billing_interval text,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  grace_period_ends_at timestamptz,
  scheduled_plan text,
  scheduled_change_at timestamptz,
  total_tenants integer,
  included_tenants integer,
  billable_tenants integer,
  total_users integer,
  included_users integer,
  billable_users integer,
  estimated_monthly_total numeric,
  estimated_annual_total numeric,
  restricted boolean,
  billing_management_allowed boolean,
  usage_updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  root_company_id uuid;
  account_row public.subscription_accounts;
  usage_row public.subscription_usage;
  requested text := lower(trim(coalesce(p_product, '')));
  access boolean;
  plan_value text;
  monthly_value numeric := null;
  annual_value numeric := null;
  entitlement_json jsonb;
  manual_status text;
begin
  if requested not in ('invoice', 'booking', 'suite', 'hr', 'desk') then
    raise exception 'Unsupported OperiX product' using errcode = '22023';
  end if;
  if not public.can_access_company(p_company_id) then
    raise exception 'Company access denied' using errcode = '42501';
  end if;

  root_company_id := private.invoice_billing_root_company_id(p_company_id);
  if requested in ('invoice', 'booking', 'suite') then
    perform private.ensure_operix_product_trial(root_company_id, requested);
    -- Entitlement projection writes belong to the server/webhook path. A
    -- tenant summary read must not become a client-controlled write path.
    if private.operix_server_request() then
      perform public.billing_refresh_product_entitlements(root_company_id);
    end if;
  end if;

  select usage.* into usage_row from public.subscription_usage usage where usage.company_id = root_company_id;
  select account.* into account_row
  from public.subscription_accounts account
  where account.company_id = root_company_id
    and (
      account.product = requested
      or (requested in ('invoice', 'booking') and account.product = 'suite')
    )
  order by case when private.operix_status_has_access(account.status, account.trial_ends_at, account.current_period_end, account.grace_period_ends_at, account.manual_override_status, account.manual_override_expires_at) then 0 else 1 end,
           case when account.product = requested then 0 else 1 end,
           account.updated_at desc
  limit 1;

  select coalesce(jsonb_object_agg(products.product, coalesce(entitlement.enabled, false)), '{}'::jsonb)
    into entitlement_json
  from (values ('invoice'::text), ('booking'::text), ('hr'::text), ('desk'::text)) products(product)
  left join lateral (
    select true as enabled
    from public.organization_product_entitlements entitlement
    where entitlement.company_id = root_company_id
      and entitlement.product = products.product
      and entitlement.enabled
      and entitlement.starts_at <= now()
      and (entitlement.ends_at is null or entitlement.ends_at > now())
    limit 1
  ) entitlement on true;

  access := private.operix_product_access(root_company_id, requested);
  select coalesce(grant_row.override_status, 'active') into manual_status
  from public.subscription_manual_grants grant_row
  where grant_row.company_id = root_company_id
    and (grant_row.product = requested or (grant_row.product = 'suite' and requested in ('invoice', 'booking')))
    and grant_row.revoked_at is null
    and (grant_row.expires_at is null or grant_row.expires_at > now())
    and coalesce(grant_row.override_status, 'active') in ('active', 'trialing')
  order by case when grant_row.product = requested then 0 else 1 end, grant_row.created_at desc
  limit 1;

  plan_value := case
    when manual_status is not null and access and requested = 'suite' then 'suite'
    when account_row.id is not null then account_row.product
    when manual_status is not null and access and requested in ('invoice', 'booking') then requested
    when access and requested in ('hr', 'desk') then 'enterprise'
    else null
  end;

  if plan_value in ('invoice', 'booking', 'suite') then
    monthly_value := private.operix_plan_value(plan_value, 'monthly', coalesce(usage_row.billable_tenants, 0), coalesce(usage_row.billable_users, 0));
    annual_value := private.operix_plan_value(plan_value, 'annual', coalesce(usage_row.billable_tenants, 0), coalesce(usage_row.billable_users, 0));
  end if;

  return query select
    p_company_id,
    root_company_id,
    requested,
    plan_value,
    plan_value,
    entitlement_json,
    case when private.rbac_is_platform_admin() then account_row.stripe_customer_id else null end,
    case when private.rbac_is_platform_admin() then account_row.stripe_subscription_id else null end,
    coalesce(manual_status, private.operix_effective_status(account_row.status, account_row.trial_ends_at, account_row.current_period_end, account_row.grace_period_ends_at, account_row.manual_override_status, account_row.manual_override_expires_at), case when access then 'active' else 'expired' end),
    account_row.billing_interval,
    account_row.trial_started_at,
    account_row.trial_ends_at,
    account_row.current_period_start,
    account_row.current_period_end,
    coalesce(account_row.cancel_at_period_end, false),
    account_row.grace_period_ends_at,
    account_row.scheduled_plan,
    account_row.scheduled_change_at,
    coalesce(usage_row.total_tenants, 0),
    1,
    coalesce(usage_row.billable_tenants, 0),
    coalesce(usage_row.total_users, 0),
    1,
    coalesce(usage_row.billable_users, 0),
    monthly_value,
    annual_value,
    not access,
    private.has_company_permission(root_company_id, 'billing.manage'),
    usage_row.last_synced_at;
end;
$$;

revoke all on function public.get_product_billing_summary(uuid, text) from public, anon;
grant execute on function public.get_product_billing_summary(uuid, text) to authenticated;

create or replace function public.rbac_get_users_access_billing_summary(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  root_company_id uuid;
  account_row record;
  usage_row public.subscription_usage;
  plan_value text;
  interval_value text;
  monthly_base numeric;
  annual_base numeric;
  monthly_total numeric;
  annual_total numeric;
begin
  if (select auth.uid()) is null and not private.operix_server_request() then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not private.operix_server_request() and not private.rbac_is_user_access_admin(p_company_id) then
    raise exception 'Users & Access is restricted to authorized company administrators' using errcode = '42501';
  end if;
  root_company_id := private.invoice_billing_root_company_id(p_company_id);
  usage_row := private.refresh_invoice_subscription_usage(root_company_id);
  select * into account_row from public.subscription_accounts account
  where account.company_id = root_company_id and account.product in ('invoice', 'suite')
  order by case when account.product = 'suite' then 0 else 1 end, account.created_at limit 1;
  plan_value := case when account_row.product is null then 'invoice' else account_row.product end;
  interval_value := coalesce(account_row.billing_interval, 'monthly');
  monthly_base := case plan_value when 'suite' then 11.99 else 9.99 end;
  annual_base := case plan_value when 'suite' then 99.99 else 99.99 end;
  monthly_total := monthly_base + (greatest(usage_row.total_tenants - 1, 0) * 1.99) + (greatest(usage_row.total_users - 1, 0) * 0.99);
  annual_total := annual_base + (greatest(usage_row.total_tenants - 1, 0) * 19.99) + (greatest(usage_row.total_users - 1, 0) * 9.99);
  return jsonb_build_object(
    'company_id', p_company_id,
    'billing_account_company_id', root_company_id,
    'plan', plan_value,
    'status', coalesce(account_row.status, 'trialing'),
    'billing_interval', interval_value,
    'stripe_subscription_id', case when private.rbac_is_platform_admin() then account_row.stripe_subscription_id else null end,
    'trial_started_at', account_row.trial_started_at,
    'trial_ends_at', account_row.trial_ends_at,
    'current_period_end', account_row.current_period_end,
    'cancel_at_period_end', coalesce(account_row.cancel_at_period_end, false),
    'total_tenants', usage_row.total_tenants,
    'included_tenants', usage_row.included_tenants,
    'billable_tenants', usage_row.billable_tenants,
    'total_users', usage_row.total_users,
    'included_users', usage_row.included_users,
    'billable_users', usage_row.billable_users,
    'base_monthly', to_char(monthly_base, 'FM999999990.00'),
    'additional_tenant_monthly', '1.99',
    'additional_user_monthly', '0.99',
    'base_annual', to_char(annual_base, 'FM999999990.00'),
    'additional_tenant_annual', '19.99',
    'additional_user_annual', '9.99',
    'estimated_monthly_total', to_char(monthly_total, 'FM999999990.00'),
    'estimated_annual_total', to_char(annual_total, 'FM999999990.00'),
    'usage_updated_at', usage_row.updated_at,
    'trial_days_remaining', case when account_row.trial_ends_at is null then 0 else greatest(0, ceil(extract(epoch from (account_row.trial_ends_at - now())) / 86400))::integer end,
    'billing_management_allowed', true
  );
end;
$$;

revoke all on function public.rbac_get_users_access_billing_summary(uuid) from public, anon;
grant execute on function public.rbac_get_users_access_billing_summary(uuid) to authenticated, service_role;

commit;
