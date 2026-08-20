-- Supabase installs pgcrypto helpers in the extensions schema. These
-- security-definer routines must qualify them because they intentionally use
-- an empty search_path.
create or replace function public.control_add_domain(p_company_id uuid,p_domain text)
returns public.control_company_domains language plpgsql security definer set search_path = '' as $$
declare result public.control_company_domains; domain_name text:=lower(trim(p_domain)); token text:=encode(extensions.gen_random_bytes(18),'hex');
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'organization.manage') then raise exception 'Organization management denied' using errcode='42501'; end if;
  insert into public.control_company_domains(company_id,domain,verification_token,created_by) values(p_company_id,domain_name,token,(select auth.uid())) on conflict(company_id,domain) do update set verification_token=excluded.verification_token,verified_at=null,updated_at=now() returning * into result; return result;
end;
$$;

create or replace function public.control_create_api_key(p_company_id uuid,p_name text,p_scopes text[],p_environment text default 'production',p_expires_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare secret text:='opx_'||encode(extensions.gen_random_bytes(32),'hex'); result public.control_api_keys;
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'api.manage') then raise exception 'API management denied' using errcode='42501'; end if;
  insert into public.control_api_keys(company_id,name,key_prefix,secret_hash,scopes,environment,expires_at,created_by) values(p_company_id,trim(p_name),left(secret,12),extensions.digest(secret,'sha256'),coalesce(p_scopes,'{}'::text[]),p_environment,p_expires_at,(select auth.uid())) returning * into result;
  return jsonb_build_object('id',result.id,'name',result.name,'key_prefix',result.key_prefix,'secret',secret,'scopes',result.scopes,'environment',result.environment,'expires_at',result.expires_at,'created_at',result.created_at);
end;
$$;

create or replace function public.control_rotate_api_key(p_company_id uuid,p_key_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare secret text:='opx_'||encode(extensions.gen_random_bytes(32),'hex'); result public.control_api_keys;
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'api.manage') then raise exception 'API management denied' using errcode='42501'; end if;
  update public.control_api_keys set key_prefix=left(secret,12),secret_hash=extensions.digest(secret,'sha256'),updated_at=now(),revoked_at=null where id=p_key_id and company_id=p_company_id returning * into result;
  if result.id is null then raise exception 'API key not found' using errcode='22023'; end if;
  return jsonb_build_object('id',result.id,'name',result.name,'key_prefix',result.key_prefix,'secret',secret,'scopes',result.scopes,'environment',result.environment,'expires_at',result.expires_at,'created_at',result.created_at);
end;
$$;

create or replace function public.control_create_webhook(p_company_id uuid,p_name text,p_endpoint_url text,p_events text[],p_environment text default 'production')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare secret text:='whsec_'||encode(extensions.gen_random_bytes(32),'hex'); secret_id uuid; result public.control_webhook_endpoints;
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'api.manage') then raise exception 'Webhook management denied' using errcode='42501'; end if;
  secret_id:=vault.create_secret(secret,'OperiX webhook secret','Control webhook secret');
  insert into public.control_webhook_endpoints(company_id,name,endpoint_url,subscribed_events,environment,secret_prefix,vault_secret_id,created_by) values(p_company_id,trim(p_name),trim(p_endpoint_url),coalesce(p_events,'{}'::text[]),p_environment,left(secret,14),secret_id,(select auth.uid())) returning * into result;
  return jsonb_build_object('id',result.id,'name',result.name,'endpoint_url',result.endpoint_url,'subscribed_events',result.subscribed_events,'environment',result.environment,'secret',secret,'secret_prefix',result.secret_prefix,'created_at',result.created_at);
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
  request_id:=net.http_post(endpoint.endpoint_url,payload,'{}'::jsonb,jsonb_build_object('content-type','application/json','x-operix-event','control.test','x-operix-signature','sha256='||encode(extensions.hmac(payload::text,secret,'sha256'),'hex')),10000);
  insert into public.control_webhook_deliveries(company_id,endpoint_id,event_name,request_id) values(p_company_id,p_endpoint_id,'control.test',request_id) returning id into delivery_id;
  update public.control_webhook_endpoints set last_delivery_at=now(),updated_at=now() where id=p_endpoint_id;
  return delivery_id;
end;
$$;

