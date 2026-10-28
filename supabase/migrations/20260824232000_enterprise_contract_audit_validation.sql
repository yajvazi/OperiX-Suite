-- Keep the enterprise contract creation RPC aligned with the original
-- validation and audit contract after the product-boundary hardening pass.

begin;

create or replace function public.control_create_enterprise_contract(
  p_company_id uuid,
  p_contract_name text,
  p_products text[],
  p_custom_price numeric default null,
  p_currency text default 'EUR',
  p_billing_interval text default 'custom',
  p_starts_at timestamptz default now(),
  p_ends_at timestamptz default null,
  p_status text default 'active',
  p_seat_limit integer default null,
  p_tenant_limit integer default null,
  p_product_limits jsonb default '{}'::jsonb,
  p_notes text default null,
  p_trial_started_at timestamptz default null,
  p_trial_ends_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  contract_id uuid;
  root_company_id uuid;
  enterprise_product text;
begin
  if not public.control_is_platform_admin() then raise exception 'Platform administrator access required' using errcode = '42501'; end if;
  if p_products is null or cardinality(p_products) = 0 or not (p_products <@ array['hr', 'desk']::text[]) then raise exception 'Enterprise products must be HR and/or Desk' using errcode = '22023'; end if;
  if p_status not in ('draft', 'trialing', 'active', 'expired', 'canceled') then raise exception 'Unsupported enterprise contract status' using errcode = '22023'; end if;
  if p_ends_at is not null and p_ends_at <= p_starts_at then raise exception 'Contract end must be after contract start' using errcode = '22023'; end if;
  if p_status = 'trialing' and p_trial_ends_at is null then raise exception 'A trial/demo contract requires a trial end' using errcode = '22023'; end if;
  if p_trial_ends_at is not null and coalesce(p_trial_started_at, p_starts_at) >= p_trial_ends_at then raise exception 'Trial end must be after trial start' using errcode = '22023'; end if;
  root_company_id := private.invoice_billing_root_company_id(p_company_id);
  insert into public.enterprise_contracts(company_id, contract_name, custom_price, currency, billing_interval, starts_at, ends_at, status, trial_started_at, trial_ends_at, seat_limit, tenant_limit, product_limits, notes, created_by, updated_by)
  values (root_company_id, trim(p_contract_name), p_custom_price, upper(p_currency), p_billing_interval, p_starts_at, p_ends_at, p_status, p_trial_started_at, p_trial_ends_at, p_seat_limit, p_tenant_limit, p_product_limits, p_notes, auth.uid(), auth.uid())
  returning id into contract_id;
  foreach enterprise_product in array p_products loop
    insert into public.enterprise_contract_products(contract_id, product) values (contract_id, enterprise_product) on conflict do nothing;
  end loop;
  perform public.billing_refresh_product_entitlements(root_company_id);
  insert into public.billing_audit_events(company_id, event, source, actor_user_id, metadata)
  values (root_company_id, 'enterprise_contract_created', 'operix_control', auth.uid(), jsonb_build_object('contract_id', contract_id, 'products', p_products, 'custom_price', p_custom_price, 'currency', upper(p_currency), 'starts_at', p_starts_at, 'ends_at', p_ends_at, 'trial_started_at', p_trial_started_at, 'trial_ends_at', p_trial_ends_at));
  insert into public.billing_audit_events(company_id, event, source, actor_user_id, metadata)
  values (root_company_id, 'enterprise_entitlement_granted', 'operix_control', auth.uid(), jsonb_build_object('contract_id', contract_id, 'products', p_products, 'reason', p_notes));
  return contract_id;
end;
$$;

revoke all on function public.control_create_enterprise_contract(uuid, text, text[], numeric, text, text, timestamptz, timestamptz, text, integer, integer, jsonb, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.control_create_enterprise_contract(uuid, text, text[], numeric, text, text, timestamptz, timestamptz, text, integer, integer, jsonb, text, timestamptz, timestamptz) to authenticated;

commit;
