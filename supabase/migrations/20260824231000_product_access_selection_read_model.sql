-- Public product access is used by application switchers and identity gates.
-- For public products the entitlement answers product ownership; each product
-- application still evaluates its own role permissions for protected routes.
-- HR and Desk retain the stricter organization entitlement + category role
-- permission check here.

begin;

create or replace function public.get_my_product_access(p_product text)
returns table(
  company_id uuid,
  product text,
  entitled boolean,
  role_allowed boolean,
  allowed boolean,
  source text,
  starts_at timestamptz,
  ends_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  requested_product text := lower(trim(coalesce(p_product, '')));
  selected_company_id uuid;
  root_company_id uuid;
  entitled_now boolean := false;
  role_allowed_now boolean := false;
  entitlement_row record;
begin
  if (select auth.uid()) is null then return; end if;
  if requested_product not in ('invoice', 'booking', 'hr', 'desk') then
    raise exception 'Unsupported product' using errcode = '22023';
  end if;

  select coalesce(profile.active_company_id, profile.company_id)
    into selected_company_id
  from public.profiles profile
  where profile.id = (select auth.uid());
  if selected_company_id is null then
    select membership.company_id into selected_company_id
    from public.memberships membership
    where membership.user_id = (select auth.uid())
      and coalesce(membership.status, 'active') = 'active'
    order by membership.created_at asc
    limit 1;
  end if;
  if selected_company_id is null or not public.can_access_company(selected_company_id) then
    return query select null::uuid, requested_product, false, false, false, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  root_company_id := private.invoice_billing_root_company_id(selected_company_id);
  entitled_now := private.operix_product_access(root_company_id, requested_product);
  select entitlement.source, entitlement.starts_at, entitlement.ends_at
    into entitlement_row
  from public.organization_product_entitlements entitlement
  where entitlement.company_id = root_company_id
    and entitlement.product = requested_product
    and entitlement.enabled
    and entitlement.starts_at <= now()
    and (entitlement.ends_at is null or entitlement.ends_at > now())
  order by case when entitlement.source = 'enterprise_contract' then 0 when entitlement.source = 'manual_grant' then 1 else 2 end, entitlement.starts_at desc
  limit 1;

  if requested_product in ('invoice', 'booking') then
    role_allowed_now := true;
  else
    role_allowed_now := exists (
      select 1
      from public.app_permissions permission
      where permission.category = requested_product
        and private.has_company_permission(root_company_id, permission.code)
    );
  end if;

  return query select root_company_id, requested_product, entitled_now, role_allowed_now,
    entitled_now and role_allowed_now, entitlement_row.source, entitlement_row.starts_at, entitlement_row.ends_at;
end;
$$;

revoke all on function public.get_my_product_access(text) from public, anon;
grant execute on function public.get_my_product_access(text) to authenticated;

commit;
