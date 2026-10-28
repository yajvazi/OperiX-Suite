-- Control is an authorized server-side administrative path. Let its
-- SECURITY DEFINER contract-management RPCs refresh the trusted entitlement
-- projection without granting customers direct access to the refresh RPC.

begin;

create or replace function public.billing_refresh_product_entitlements(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  root_company_id uuid;
  account_row record;
  trial_row record;
  contract_row record;
  grant_row record;
  target_product text;
begin
  if not (private.operix_server_request() or public.control_is_platform_admin()) then
    raise exception 'Server billing path required' using errcode = '42501';
  end if;

  root_company_id := private.invoice_billing_root_company_id(p_company_id);
  perform pg_advisory_xact_lock(hashtextextended(root_company_id::text, 0));
  delete from public.organization_product_entitlements where company_id = root_company_id;

  for account_row in select * from public.subscription_accounts where company_id = root_company_id loop
    if private.operix_status_has_access(account_row.status, account_row.trial_ends_at, account_row.current_period_end, account_row.grace_period_ends_at, account_row.manual_override_status, account_row.manual_override_expires_at) then
      if account_row.product = 'suite' then
        foreach target_product in array array['invoice', 'booking'] loop
          insert into public.organization_product_entitlements(company_id, product, source, source_id, enabled, starts_at, ends_at, metadata)
          values (root_company_id, target_product, 'subscription', account_row.id, true, coalesce(account_row.current_period_start, account_row.created_at), case when account_row.status = 'canceled' then account_row.current_period_end when account_row.status = 'past_due' then account_row.grace_period_ends_at when account_row.status = 'trialing' then account_row.trial_ends_at else null end, jsonb_build_object('plan', account_row.product, 'subscription_id', account_row.stripe_subscription_id));
        end loop;
      else
        insert into public.organization_product_entitlements(company_id, product, source, source_id, enabled, starts_at, ends_at, metadata)
        values (root_company_id, account_row.product, 'subscription', account_row.id, true, coalesce(account_row.current_period_start, account_row.created_at), case when account_row.status = 'canceled' then account_row.current_period_end when account_row.status = 'past_due' then account_row.grace_period_ends_at when account_row.status = 'trialing' then account_row.trial_ends_at else null end, jsonb_build_object('plan', account_row.product, 'subscription_id', account_row.stripe_subscription_id));
      end if;
    end if;
  end loop;

  for trial_row in select * from public.subscription_trials where company_id = root_company_id and status = 'trialing' and ends_at > now() loop
    if trial_row.product_or_plan = 'suite' then
      foreach target_product in array array['invoice', 'booking'] loop
        insert into public.organization_product_entitlements(company_id, product, source, source_id, enabled, starts_at, ends_at, metadata)
        values (root_company_id, target_product, 'trial', trial_row.id, true, trial_row.started_at, trial_row.ends_at, jsonb_build_object('plan', trial_row.product_or_plan));
      end loop;
    else
      insert into public.organization_product_entitlements(company_id, product, source, source_id, enabled, starts_at, ends_at, metadata)
      values (root_company_id, trial_row.product_or_plan, 'trial', trial_row.id, true, trial_row.started_at, trial_row.ends_at, jsonb_build_object('plan', trial_row.product_or_plan));
    end if;
  end loop;

  for grant_row in select * from public.subscription_manual_grants where company_id = root_company_id and revoked_at is null and coalesce(override_status, 'active') in ('active', 'trialing') and (expires_at is null or expires_at > now()) loop
    if grant_row.product = 'suite' then
      foreach target_product in array array['invoice', 'booking'] loop
        insert into public.organization_product_entitlements(company_id, product, source, source_id, enabled, starts_at, ends_at, metadata)
        values (root_company_id, target_product, 'manual_grant', grant_row.id, true, grant_row.created_at, grant_row.expires_at, jsonb_build_object('grant_type', grant_row.grant_type, 'reason', grant_row.reason));
      end loop;
    else
      insert into public.organization_product_entitlements(company_id, product, source, source_id, enabled, starts_at, ends_at, metadata)
      values (root_company_id, grant_row.product, 'manual_grant', grant_row.id, true, grant_row.created_at, grant_row.expires_at, jsonb_build_object('grant_type', grant_row.grant_type, 'reason', grant_row.reason));
    end if;
  end loop;

  for contract_row in
    select contract.id, contract.company_id, contract.starts_at, contract.ends_at, contract.status, contract.trial_ends_at, product.product
    from public.enterprise_contracts contract
    join public.enterprise_contract_products product on product.contract_id = contract.id
    where contract.company_id = root_company_id
      and product.enabled
      and contract.status in ('trialing', 'active')
      and contract.starts_at <= now()
      and (contract.ends_at is null or contract.ends_at > now())
      and (contract.trial_ends_at is null or contract.trial_ends_at > now() or contract.status = 'active')
  loop
    insert into public.organization_product_entitlements(company_id, product, source, source_id, enabled, starts_at, ends_at, metadata)
    values (root_company_id, contract_row.product, 'enterprise_contract', contract_row.id, true, contract_row.starts_at, case when contract_row.status = 'trialing' then contract_row.trial_ends_at else contract_row.ends_at end, jsonb_build_object('contract_id', contract_row.id, 'trial_ends_at', contract_row.trial_ends_at));
  end loop;
end;
$$;

revoke all on function public.billing_refresh_product_entitlements(uuid) from public, anon, authenticated;
grant execute on function public.billing_refresh_product_entitlements(uuid) to service_role;

commit;
