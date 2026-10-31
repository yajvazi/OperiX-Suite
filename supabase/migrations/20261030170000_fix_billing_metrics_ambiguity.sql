-- control_product_billing_metrics() returns a column named "value" and its body also uses "value", so PL/pgSQL
-- reported the name as ambiguous and the platform billing page could not load. Prefer the table column.
CREATE OR REPLACE FUNCTION public.control_product_billing_metrics()
 RETURNS TABLE(metric text, value numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
begin
  if not public.control_is_platform_admin() then raise exception 'Platform administrator access required' using errcode = '42501'; end if;
  return query
  with accounts as (
    select account.*,
      private.operix_effective_status(account.status, account.trial_ends_at, account.current_period_end, account.grace_period_ends_at, account.manual_override_status, account.manual_override_expires_at) as effective_status
    from public.subscription_accounts account
  ), paid as (
    select account.* from accounts account where private.operix_status_has_access(account.status, account.trial_ends_at, account.current_period_end, account.grace_period_ends_at, account.manual_override_status, account.manual_override_expires_at) and account.effective_status <> 'trialing'
  ), values as (
    select paid.product, paid.billing_interval, private.operix_plan_value(paid.product, paid.billing_interval, usage.billable_tenants, usage.billable_users) as value
    from paid left join public.subscription_usage usage on usage.company_id = paid.company_id
  ), enterprise_values as (
    select contract.billing_interval, contract.custom_price as value
    from public.enterprise_contracts contract
    where contract.status = 'active'
      and contract.starts_at <= now()
      and (contract.ends_at is null or contract.ends_at > now())
      and contract.custom_price is not null
      and contract.billing_interval in ('monthly', 'annual')
  ), trial_keys as (
    -- Conversion is an organization metric. A Suite clock can have linked
    -- Invoice/Booking history rows, and a customer can also have explored
    -- two standalone products; neither should inflate the denominator.
    select
      trial.company_id,
      case
        when bool_or(trial.status = 'trialing' and trial.ends_at > now()) then 'trialing'
        when bool_or(trial.status = 'completed') then 'completed'
        when bool_or(trial.status = 'expired' or trial.ends_at <= now()) then 'expired'
        else max(trial.status)
      end as status
    from public.subscription_trials trial
    group by trial.company_id
  ), trials as (
    select count(*) filter (where status = 'trialing')::numeric as active_trials,
      count(*) filter (where status = 'expired')::numeric as expired_trials,
      count(*)::numeric as all_trials
    from trial_keys
  )
  select 'invoice_subscriptions', count(*) filter (where product = 'invoice')::numeric from accounts
  union all select 'booking_subscriptions', count(*) filter (where product = 'booking')::numeric from accounts
  union all select 'suite_subscriptions', count(*) filter (where product = 'suite')::numeric from accounts
  union all select 'monthly_subscriptions', count(*) filter (where billing_interval = 'monthly' and effective_status <> 'expired')::numeric from accounts
  union all select 'annual_subscriptions', count(*) filter (where billing_interval = 'annual' and effective_status <> 'expired')::numeric from accounts
  union all select 'active_trials', trials.active_trials from trials
  union all select 'expired_trials', trials.expired_trials from trials
  union all select 'trial_conversion_rate', case when trials.all_trials = 0 then 0 else round((select count(distinct company_id)::numeric from paid) / trials.all_trials * 100, 2) end from trials
  union all select 'mrr', coalesce((select sum(case when billing_interval = 'annual' then value / 12 else value end) from values), 0) + coalesce((select sum(case when billing_interval = 'annual' then value / 12 else value end) from enterprise_values), 0)
  union all select 'arr', coalesce((select sum(case when billing_interval = 'annual' then value else value * 12 end) from values), 0) + coalesce((select sum(case when billing_interval = 'annual' then value else value * 12 end) from enterprise_values), 0)
  union all select 'active_subscriptions', count(*) filter (where effective_status in ('active', 'past_due', 'canceled'))::numeric from accounts
  union all select 'past_due_accounts', count(*) filter (where status = 'past_due')::numeric from accounts
  union all select 'canceled_accounts', count(*) filter (where status = 'canceled')::numeric from accounts
  union all select 'enterprise_customers', count(distinct company_id)::numeric from public.enterprise_contracts where status in ('trialing', 'active') and starts_at <= now() and (ends_at is null or ends_at > now());
end;
$function$

;
