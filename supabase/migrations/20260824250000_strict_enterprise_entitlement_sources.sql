-- OperiX HR and Desk are Enterprise-only products.
--
-- Keep historical projection rows for audit/data retention, but ensure that a
-- stale or incorrectly labelled public subscription/trial row can never grant
-- HR or Desk access. New active rows are constrained to trusted Enterprise
-- sources.

begin;

do $$
begin
  update public.organization_product_entitlements
  set enabled = false,
      updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'disabled_reason', 'enterprise_source_required',
        'disabled_at', now()
      )
  where product in ('hr', 'desk')
    and source not in ('enterprise_contract', 'manual_grant', 'internal')
    and enabled;
end;
$$;

alter table public.organization_product_entitlements
  drop constraint if exists organization_product_entitlements_source_check;

alter table public.organization_product_entitlements
  add constraint organization_product_entitlements_source_check
  check (source in ('subscription', 'trial', 'enterprise_contract', 'manual_grant', 'internal'));

alter table public.organization_product_entitlements
  drop constraint if exists organization_product_entitlements_enterprise_source_check;

alter table public.organization_product_entitlements
  add constraint organization_product_entitlements_enterprise_source_check
  check (
    not enabled
    or product in ('invoice', 'booking')
    or source in ('enterprise_contract', 'manual_grant', 'internal')
  );

create or replace function private.operix_product_access(p_company_id uuid, p_product text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with requested as (
    select lower(trim(coalesce(p_product, ''))) as product
  ),
  root as (
    select private.invoice_billing_root_company_id(p_company_id) as company_id
  )
  select exists (
    select 1
    from public.organization_product_entitlements entitlement
    join root on root.company_id = entitlement.company_id
    cross join requested
    where entitlement.product = requested.product
      and entitlement.enabled
      and entitlement.starts_at <= now()
      and (entitlement.ends_at is null or entitlement.ends_at > now())
      and (
        requested.product not in ('hr', 'desk')
        or entitlement.source in ('enterprise_contract', 'manual_grant', 'internal')
      )
  )
  or exists (
    select 1
    from public.subscription_accounts account
    join root on root.company_id = account.company_id
    cross join requested
    where requested.product not in ('hr', 'desk')
      and (
        account.product = requested.product
        or (account.product = 'suite' and requested.product in ('invoice', 'booking'))
      )
      and private.operix_status_has_access(
        account.status,
        account.trial_ends_at,
        account.current_period_end,
        account.grace_period_ends_at,
        account.manual_override_status,
        account.manual_override_expires_at
      )
  )
  or exists (
    select 1
    from public.enterprise_contract_products contract_product
    join public.enterprise_contracts contract on contract.id = contract_product.contract_id
    join root on root.company_id = contract.company_id
    cross join requested
    where contract_product.product = requested.product
      and requested.product in ('hr', 'desk')
      and contract_product.enabled
      and contract.status in ('trialing', 'active')
      and contract.starts_at <= now()
      and (contract.ends_at is null or contract.ends_at > now())
      and (contract.trial_ends_at is null or contract.trial_ends_at > now() or contract.status = 'active')
  )
  or exists (
    select 1
    from public.subscription_manual_grants grant_row
    join root on root.company_id = grant_row.company_id
    cross join requested
    where grant_row.product = requested.product
      and requested.product in ('hr', 'desk')
      and coalesce(grant_row.override_status, 'active') in ('active', 'trialing')
      and grant_row.revoked_at is null
      and (grant_row.expires_at is null or grant_row.expires_at > now())
  )
  or exists (
    select 1
    from public.subscription_manual_grants grant_row
    join root on root.company_id = grant_row.company_id
    cross join requested
    where grant_row.product = 'suite'
      and requested.product in ('invoice', 'booking', 'suite')
      and coalesce(grant_row.override_status, 'active') in ('active', 'trialing')
      and grant_row.revoked_at is null
      and (grant_row.expires_at is null or grant_row.expires_at > now())
  );
$$;

revoke all on function private.operix_product_access(uuid, text) from public;
grant execute on function private.operix_product_access(uuid, text) to authenticated, service_role;

commit;
