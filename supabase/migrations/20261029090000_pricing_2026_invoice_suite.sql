-- New public prices: Invoice EUR 2.99/month or 29.99/year, Suite EUR 4.99/month or 49.99/year, each with
-- 1 workspace and 1 user; extra workspace EUR 1.99/month or 19.99/year, extra user EUR 0.99/month or 9.99/year.
-- Only the base prices change here (the add-on prices were already these amounts). Stripe prices are configured
-- separately (STRIPE_*_PRICE_ID) and must be created for the new amounts.

CREATE OR REPLACE FUNCTION private.operix_plan_value(p_plan text, p_interval text, p_billable_tenants integer, p_billable_users integer)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case when p_interval = 'annual' then
    case p_plan when 'invoice' then 29.99 when 'booking' then 49.99 when 'suite' then 49.99 else 0 end
      + coalesce(p_billable_tenants, 0) * 19.99
      + coalesce(p_billable_users, 0) * 9.99
  else
    case p_plan when 'invoice' then 2.99 when 'booking' then 4.99 when 'suite' then 4.99 else 0 end
      + coalesce(p_billable_tenants, 0) * 1.99
      + coalesce(p_billable_users, 0) * 0.99
  end;
$function$;

CREATE OR REPLACE FUNCTION public.rbac_get_users_access_billing_summary(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  monthly_base := case plan_value when 'suite' then 4.99 else 2.99 end;
  annual_base := case plan_value when 'suite' then 49.99 else 29.99 end;
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
$function$;

notify pgrst, 'reload schema';
