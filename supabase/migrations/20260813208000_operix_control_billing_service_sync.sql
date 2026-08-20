-- Billing snapshots are written by the server-side billing synchronizer, not
-- by organization users. Accept only a service_role JWT for this path.
create or replace function public.control_upsert_billing_snapshot(p_company_id uuid,p_provider text,p_customer_id text,p_subscription_id text,p_plan_name text,p_status text,p_billing_cycle text,p_next_invoice_at timestamptz,p_current_period_end timestamptz,p_seat_limit integer,p_storage_limit_bytes bigint,p_portal_url text)
returns public.control_billing_snapshots language plpgsql security definer set search_path = '' as $$
declare result public.control_billing_snapshots; server_sync boolean := coalesce((select auth.jwt() ->> 'role'),'') = 'service_role';
begin
  if not server_sync then raise exception 'Billing snapshots are server-managed' using errcode='42501'; end if;
  insert into public.control_billing_snapshots(company_id,provider,customer_id,subscription_id,plan_name,status,billing_cycle,next_invoice_at,current_period_end,seat_limit,storage_limit_bytes,portal_url,updated_by)
  values(p_company_id,p_provider,p_customer_id,p_subscription_id,p_plan_name,p_status,p_billing_cycle,p_next_invoice_at,p_current_period_end,p_seat_limit,p_storage_limit_bytes,p_portal_url,null)
  on conflict(company_id) do update set provider=excluded.provider,customer_id=excluded.customer_id,subscription_id=excluded.subscription_id,plan_name=excluded.plan_name,status=excluded.status,billing_cycle=excluded.billing_cycle,next_invoice_at=excluded.next_invoice_at,current_period_end=excluded.current_period_end,seat_limit=excluded.seat_limit,storage_limit_bytes=excluded.storage_limit_bytes,portal_url=excluded.portal_url,updated_at=now(),updated_by=null
  returning * into result;
  return result;
end;
$$;

revoke all on function public.control_upsert_billing_snapshot(uuid,text,text,text,text,text,text,timestamptz,timestamptz,integer,bigint,text) from public,anon,authenticated;
grant execute on function public.control_upsert_billing_snapshot(uuid,text,text,text,text,text,text,timestamptz,timestamptz,integer,bigint,text) to service_role;

