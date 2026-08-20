-- OperiX Control developer access, usage, integrations, and platform-safe
-- projections.

begin;

create or replace function public.control_usage_summary(p_company_id uuid)
returns table(metric text,value bigint,measured boolean,source text)
language plpgsql security definer set search_path = '' as $$
declare result bigint;
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'usage.read') then raise exception 'Usage access denied' using errcode='42501'; end if;
  return query select 'users',count(*)::bigint,true,'memberships' from public.memberships where company_id=p_company_id and coalesce(status,'active')<>'revoked';
  return query select 'active_apps',count(*)::bigint,true,'company_app_entitlements' from public.company_app_entitlements where company_id=p_company_id and enabled;
  if to_regclass('public.invoices') is not null then execute 'select count(*)::bigint from public.invoices where company_id=$1' into result using p_company_id; return query select 'invoices',result,true,'invoices'; end if;
  if to_regclass('public.commercial_documents') is not null then execute 'select count(*)::bigint from public.commercial_documents where company_id=$1' into result using p_company_id; return query select 'commercial_documents',result,true,'commercial_documents'; end if;
  if to_regclass('public.bookings') is not null then execute 'select count(*)::bigint from public.bookings where company_id=$1' into result using p_company_id; return query select 'bookings',result,true,'bookings'; end if;
  if to_regclass('public.employees') is not null then execute 'select count(*)::bigint from public.employees where company_id=$1' into result using p_company_id; return query select 'employees',result,true,'employees'; end if;
  if to_regclass('public.support_tickets') is not null then execute 'select count(*)::bigint from public.support_tickets where company_id=$1 and deleted_at is null' into result using p_company_id; return query select 'support_tickets',result,true,'support_tickets'; end if;
  execute 'select count(*)::bigint from storage.objects where name like ($1 || ''/%'')' into result using p_company_id::text;
  return query select 'stored_files',result,true,'storage.objects company prefix';
end;
$$;

create or replace function public.control_storage_summary(p_company_id uuid)
returns table(object_count bigint,bytes bigint,measured boolean,source text)
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'data.read') then raise exception 'Data access denied' using errcode='42501'; end if;
  return query execute 'select count(*)::bigint,coalesce(sum(coalesce((metadata->>''size'')::bigint,0)),0)::bigint,true,''storage.objects company prefix'' from storage.objects where name like ($1 || ''/%'')' using p_company_id::text;
end;
$$;

create or replace function public.control_billing_overview(p_company_id uuid)
returns table(provider text,plan_name text,status text,billing_cycle text,next_invoice_at timestamptz,current_period_end timestamptz,seat_limit integer,storage_limit_bytes bigint,portal_url text,stripe_account_hint text,stripe_connected_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'billing.read') then raise exception 'Billing access denied' using errcode='42501'; end if;
  return query select snapshot.provider,snapshot.plan_name,snapshot.status,snapshot.billing_cycle,snapshot.next_invoice_at,snapshot.current_period_end,snapshot.seat_limit,snapshot.storage_limit_bytes,snapshot.portal_url,(select right(profile.stripe_account_id,4) from public.profiles profile where profile.company_id=p_company_id and profile.stripe_account_id is not null limit 1),(select max(profile.stripe_connected_at) from public.profiles profile where profile.company_id=p_company_id);
  if not found then return query select 'stripe'::text,null::text,null::text,null::text,null::timestamptz,null::timestamptz,null::integer,null::bigint,null::text,(select right(profile.stripe_account_id,4) from public.profiles profile where profile.company_id=p_company_id and profile.stripe_account_id is not null limit 1),(select max(profile.stripe_connected_at) from public.profiles profile where profile.company_id=p_company_id); end if;
end;
$$;

create or replace function public.control_upsert_billing_snapshot(p_company_id uuid,p_provider text,p_customer_id text,p_subscription_id text,p_plan_name text,p_status text,p_billing_cycle text,p_next_invoice_at timestamptz,p_current_period_end timestamptz,p_seat_limit integer,p_storage_limit_bytes bigint,p_portal_url text)
returns public.control_billing_snapshots language plpgsql security definer set search_path = '' as $$
declare result public.control_billing_snapshots;
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'billing.manage') then raise exception 'Billing management denied' using errcode='42501'; end if;
  insert into public.control_billing_snapshots(company_id,provider,customer_id,subscription_id,plan_name,status,billing_cycle,next_invoice_at,current_period_end,seat_limit,storage_limit_bytes,portal_url,updated_by) values(p_company_id,p_provider,p_customer_id,p_subscription_id,p_plan_name,p_status,p_billing_cycle,p_next_invoice_at,p_current_period_end,p_seat_limit,p_storage_limit_bytes,p_portal_url,(select auth.uid())) on conflict(company_id) do update set provider=excluded.provider,customer_id=excluded.customer_id,subscription_id=excluded.subscription_id,plan_name=excluded.plan_name,status=excluded.status,billing_cycle=excluded.billing_cycle,next_invoice_at=excluded.next_invoice_at,current_period_end=excluded.current_period_end,seat_limit=excluded.seat_limit,storage_limit_bytes=excluded.storage_limit_bytes,portal_url=excluded.portal_url,updated_at=now(),updated_by=(select auth.uid()) returning * into result;
  return result;
end;
$$;

create or replace function public.control_list_integrations(p_company_id uuid)
returns table(provider text,display_name text,category text,status text,account_hint text,used_by text[],last_sync_at timestamptz,last_error text)
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'integrations.read') then raise exception 'Integration access denied' using errcode='42501'; end if;
  return query select 'stripe','Stripe','Payments',case when exists(select 1 from public.profiles profile where profile.company_id=p_company_id and profile.stripe_account_id is not null and profile.stripe_connected_at is not null) then 'Connected' else 'Disconnected' end,(select right(profile.stripe_account_id,4) from public.profiles profile where profile.company_id=p_company_id and profile.stripe_account_id is not null limit 1),array['OperiX Invoice','OperiX Booking']::text[],(select max(profile.stripe_last_synced) from public.profiles profile where profile.company_id=p_company_id),null::text
  union all select 'smtp','SMTP / Mailcow','Communication',case when company.smtp_host is not null then 'Connected' else 'Disconnected' end,company.smtp_host,array['OperiX Suite','OperiX HR']::text[],null::timestamptz,null::text from public.companies company where company.id=p_company_id
  union all select 'supabase','Supabase','Platform','Connected',null,array['OperiX Control','OperiX Invoice','OperiX HR','OperiX Booking']::text[],now(),null::text
  union all select account.provider,initcap(account.provider),'Communication',case when account.status in ('connected','active') and (account.expires_at is null or account.expires_at>now()) then 'Connected' when account.expires_at is not null and account.expires_at<=now() then 'Expired' else 'Needs Attention' end,coalesce(account.page_id,account.business_id,account.instagram_id),array['OperiX Support']::text[],account.last_sync_at,account.last_error from public.support_channel_accounts account where account.company_id=p_company_id;
end;
$$;

create or replace function public.control_search(p_company_id uuid,p_query text)
returns table(entity_type text,entity_id uuid,title text,subtitle text,href text)
language plpgsql security definer set search_path = '' as $$
declare query_text text:=lower(trim(coalesce(p_query,'')));
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'control.access') then raise exception 'Control access denied' using errcode='42501'; end if;
  return query select 'user',member.user_id,trim(concat_ws(' ',member.first_name,member.last_name)),member.email,'/users/'||member.user_id::text from public.control_list_company_members(p_company_id) member where query_text='' or lower(concat_ws(' ',member.first_name,member.last_name,member.email)) like '%'||query_text||'%' limit 10;
  return query select 'app',null::uuid,app.display_name,app.description,'/apps' from public.operix_apps app where app.available and (query_text='' or lower(app.display_name||' '||coalesce(app.description,'')) like '%'||query_text||'%') limit 10;
  return query select 'group',group_row.id,group_row.name,group_row.description,'/teams' from public.control_groups group_row where group_row.company_id=p_company_id and (query_text='' or lower(group_row.name||' '||coalesce(group_row.description,'')) like '%'||query_text||'%') limit 10;
  if private.has_company_permission(p_company_id,'audit.read') then return query select 'audit',event.id,event.action,event.entity_type,'/audit' from public.audit_events event where event.company_id=p_company_id and (query_text='' or lower(event.action||' '||event.entity_type||' '||coalesce(event.entity_key,'')) like '%'||query_text||'%') order by event.occurred_at desc limit 10; end if;
end;
$$;

create or replace function public.control_create_api_key(p_company_id uuid,p_name text,p_scopes text[],p_environment text default 'production',p_expires_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare secret text:='opx_'||encode(gen_random_bytes(32),'hex'); result public.control_api_keys;
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'api.manage') then raise exception 'API management denied' using errcode='42501'; end if;
  insert into public.control_api_keys(company_id,name,key_prefix,secret_hash,scopes,environment,expires_at,created_by) values(p_company_id,trim(p_name),left(secret,12),digest(secret,'sha256'),coalesce(p_scopes,'{}'::text[]),p_environment,p_expires_at,(select auth.uid())) returning * into result;
  return jsonb_build_object('id',result.id,'name',result.name,'key_prefix',result.key_prefix,'secret',secret,'scopes',result.scopes,'environment',result.environment,'expires_at',result.expires_at,'created_at',result.created_at);
end;
$$;

create or replace function public.control_rotate_api_key(p_company_id uuid,p_key_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare secret text:='opx_'||encode(gen_random_bytes(32),'hex'); result public.control_api_keys;
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'api.manage') then raise exception 'API management denied' using errcode='42501'; end if;
  update public.control_api_keys set key_prefix=left(secret,12),secret_hash=digest(secret,'sha256'),updated_at=now(),revoked_at=null where id=p_key_id and company_id=p_company_id returning * into result;
  if result.id is null then raise exception 'API key not found' using errcode='22023'; end if;
  return jsonb_build_object('id',result.id,'name',result.name,'key_prefix',result.key_prefix,'secret',secret,'scopes',result.scopes,'environment',result.environment,'expires_at',result.expires_at,'created_at',result.created_at);
end;
$$;

create or replace function public.control_revoke_api_key(p_company_id uuid,p_key_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'api.manage') then raise exception 'API management denied' using errcode='42501'; end if;
  update public.control_api_keys set revoked_at=coalesce(revoked_at,now()),updated_at=now() where id=p_key_id and company_id=p_company_id;
end;
$$;

create or replace function public.control_list_api_keys(p_company_id uuid)
returns table(id uuid,name text,key_prefix text,scopes text[],environment text,expires_at timestamptz,last_used_at timestamptz,revoked_at timestamptz,created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'api.read') then raise exception 'API access denied' using errcode='42501'; end if;
  return query select key.id,key.name,key.key_prefix,key.scopes,key.environment,key.expires_at,key.last_used_at,key.revoked_at,key.created_at from public.control_api_keys key where key.company_id=p_company_id order by key.created_at desc;
end;
$$;

create or replace function public.control_create_webhook(p_company_id uuid,p_name text,p_endpoint_url text,p_events text[],p_environment text default 'production')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare secret text:='whsec_'||encode(gen_random_bytes(32),'hex'); secret_id uuid; result public.control_webhook_endpoints;
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'api.manage') then raise exception 'Webhook management denied' using errcode='42501'; end if;
  secret_id:=vault.create_secret(secret,'OperiX webhook secret','Control webhook secret');
  insert into public.control_webhook_endpoints(company_id,name,endpoint_url,subscribed_events,environment,secret_prefix,vault_secret_id,created_by) values(p_company_id,trim(p_name),trim(p_endpoint_url),coalesce(p_events,'{}'::text[]),p_environment,left(secret,14),secret_id,(select auth.uid())) returning * into result;
  return jsonb_build_object('id',result.id,'name',result.name,'endpoint_url',result.endpoint_url,'subscribed_events',result.subscribed_events,'environment',result.environment,'secret',secret,'secret_prefix',result.secret_prefix,'created_at',result.created_at);
end;
$$;

create or replace function public.control_list_webhooks(p_company_id uuid)
returns table(id uuid,name text,endpoint_url text,subscribed_events text[],environment text,status text,secret_prefix text,last_delivery_at timestamptz,success_count bigint,failure_count bigint,created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'api.read') then raise exception 'Webhook access denied' using errcode='42501'; end if;
  return query select endpoint.id,endpoint.name,endpoint.endpoint_url,endpoint.subscribed_events,endpoint.environment,endpoint.status,endpoint.secret_prefix,endpoint.last_delivery_at,endpoint.success_count,endpoint.failure_count,endpoint.created_at from public.control_webhook_endpoints endpoint where endpoint.company_id=p_company_id order by endpoint.created_at desc;
end;
$$;

create or replace function public.control_set_webhook_status(p_company_id uuid,p_endpoint_id uuid,p_status text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'api.manage') then raise exception 'Webhook management denied' using errcode='42501'; end if;
  update public.control_webhook_endpoints set status=p_status,updated_at=now() where id=p_endpoint_id and company_id=p_company_id;
end;
$$;

create or replace function public.control_delete_webhook(p_company_id uuid,p_endpoint_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'api.manage') then raise exception 'Webhook management denied' using errcode='42501'; end if;
  delete from public.control_webhook_endpoints where id=p_endpoint_id and company_id=p_company_id;
end;
$$;

create or replace function public.control_test_webhook(p_company_id uuid,p_endpoint_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare endpoint public.control_webhook_endpoints; secret text; payload jsonb:=jsonb_build_object('id',gen_random_uuid(),'type','control.test','created_at',now(),'organization_id',p_company_id); request_id bigint; delivery_id uuid;
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'api.manage') then raise exception 'Webhook management denied' using errcode='42501'; end if;
  select * into endpoint from public.control_webhook_endpoints where id=p_endpoint_id and company_id=p_company_id and status='active';
  if endpoint.id is null then raise exception 'Active webhook was not found' using errcode='22023'; end if;
  select decrypted_secret into secret from vault.decrypted_secrets where id=endpoint.vault_secret_id;
  request_id:=net.http_post(endpoint.endpoint_url,payload,'{}'::jsonb,jsonb_build_object('content-type','application/json','x-operix-event','control.test','x-operix-signature','sha256='||encode(hmac(payload::text,secret,'sha256'),'hex')),10000);
  insert into public.control_webhook_deliveries(company_id,endpoint_id,event_name,request_id) values(p_company_id,p_endpoint_id,'control.test',request_id) returning id into delivery_id;
  update public.control_webhook_endpoints set last_delivery_at=now(),updated_at=now() where id=p_endpoint_id;
  return delivery_id;
end;
$$;

create or replace function public.control_refresh_webhook_delivery(p_company_id uuid,p_delivery_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare delivery public.control_webhook_deliveries; response record;
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'api.read') then raise exception 'Webhook access denied' using errcode='42501'; end if;
  select * into delivery from public.control_webhook_deliveries where id=p_delivery_id and company_id=p_company_id;
  if delivery.id is null or delivery.request_id is null then return; end if;
  select * into response from net._http_response where id=delivery.request_id;
  if response.id is null then return; end if;
  update public.control_webhook_deliveries set status=case when response.status_code between 200 and 299 then 'delivered' else 'failed' end,status_code=response.status_code,error_message=left(response.error_msg,500),completed_at=coalesce(response.created,now()) where id=delivery.id;
  update public.control_webhook_endpoints set success_count=success_count+case when response.status_code between 200 and 299 then 1 else 0 end,failure_count=failure_count+case when response.status_code between 200 and 299 then 0 else 1 end,updated_at=now() where id=delivery.endpoint_id;
end;
$$;

create or replace function public.control_list_webhook_deliveries(p_company_id uuid,p_endpoint_id uuid)
returns table(id uuid,event_name text,attempt integer,status text,status_code integer,duration_ms integer,error_message text,created_at timestamptz,completed_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'api.read') then raise exception 'Webhook access denied' using errcode='42501'; end if;
  return query select delivery.id,delivery.event_name,delivery.attempt,delivery.status,delivery.status_code,delivery.duration_ms,delivery.error_message,delivery.created_at,delivery.completed_at from public.control_webhook_deliveries delivery where delivery.company_id=p_company_id and delivery.endpoint_id=p_endpoint_id order by delivery.created_at desc limit 100;
end;
$$;

commit;
