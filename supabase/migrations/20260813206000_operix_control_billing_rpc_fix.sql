create or replace function public.control_billing_overview(p_company_id uuid)
returns table(provider text,plan_name text,status text,billing_cycle text,next_invoice_at timestamptz,current_period_end timestamptz,seat_limit integer,storage_limit_bytes bigint,portal_url text,stripe_account_hint text,stripe_connected_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'billing.read') then raise exception 'Billing access denied' using errcode='42501'; end if;
  return query
  select snapshot.provider,snapshot.plan_name,snapshot.status,snapshot.billing_cycle,snapshot.next_invoice_at,snapshot.current_period_end,snapshot.seat_limit,snapshot.storage_limit_bytes,snapshot.portal_url,
    (select right(profile.stripe_account_id,4) from public.profiles profile where profile.company_id=p_company_id and profile.stripe_account_id is not null limit 1),
    (select max(profile.stripe_connected_at) from public.profiles profile where profile.company_id=p_company_id)
  from public.control_billing_snapshots snapshot
  where snapshot.company_id=p_company_id
  limit 1;
  if not found then
    return query select 'stripe'::text,null::text,null::text,null::text,null::timestamptz,null::timestamptz,null::integer,null::bigint,null::text,
      (select right(profile.stripe_account_id,4) from public.profiles profile where profile.company_id=p_company_id and profile.stripe_account_id is not null limit 1),
      (select max(profile.stripe_connected_at) from public.profiles profile where profile.company_id=p_company_id);
  end if;
end;
$$;

revoke all on function public.control_billing_overview(uuid) from public,anon;
grant execute on function public.control_billing_overview(uuid) to authenticated;

