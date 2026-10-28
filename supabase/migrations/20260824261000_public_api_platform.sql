-- OperiX Public API Platform
--
-- Public API credentials, usage, idempotency, webhooks, API entitlements, and
-- the native Booking -> Invoice queue live in separate tables.  The gateway
-- never accepts a tenant id from a caller; it resolves company_id from the
-- hashed credential and invokes the existing tenant-scoped domain RPCs.

begin;

alter table if exists public.clients add column if not exists external_reference text;
alter table if exists public.products add column if not exists external_reference text;
alter table if exists public.invoices add column if not exists external_reference text;
alter table if exists public.bookings add column if not exists external_reference text;
alter table if exists public.booking_services add column if not exists external_reference text;
create unique index if not exists clients_company_external_reference_idx on public.clients(company_id, external_reference) where external_reference is not null;
create unique index if not exists products_company_external_reference_idx on public.products(company_id, external_reference) where external_reference is not null;
create unique index if not exists invoices_company_external_reference_idx on public.invoices(company_id, external_reference) where external_reference is not null;
create unique index if not exists bookings_company_external_reference_idx on public.bookings(company_id, external_reference) where external_reference is not null;
create unique index if not exists booking_services_company_external_reference_idx on public.booking_services(company_id, external_reference) where external_reference is not null;

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  environment text not null check (environment in ('test', 'live')),
  name text not null check (char_length(trim(name)) between 1 and 120),
  key_prefix text not null check (char_length(key_prefix) between 8 and 80),
  key_hash text not null check (key_hash like 'sha256:%'),
  created_by uuid references auth.users(id) on delete set null,
  scopes text[] not null default '{}'::text[],
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(scopes) > 0),
  unique (environment, key_hash)
);

create index if not exists api_keys_company_environment_idx
  on public.api_keys(company_id, environment, created_at desc);
create index if not exists api_keys_active_lookup_idx
  on public.api_keys(environment, key_hash)
  where revoked_at is null;

create table if not exists public.api_key_scopes (
  api_key_id uuid not null references public.api_keys(id) on delete cascade,
  scope text not null check (scope in (
    'invoice:read','invoice:write','invoice:finalize','invoice:void',
    'customer:read','customer:write','product:read','product:write',
    'payment:read','payment:write','document:read','document:write',
    'booking:read','booking:write','booking:cancel','availability:read',
    'service:read','service:write','provider:read','provider:write',
    'resource:read','resource:write','location:read','location:write',
    'booking_customer:read','booking_customer:write'
  )),
  primary key (api_key_id, scope)
);

create index if not exists api_key_scopes_scope_idx on public.api_key_scopes(scope);

create table if not exists public.api_idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  api_key_id uuid not null references public.api_keys(id) on delete cascade,
  environment text not null check (environment in ('test', 'live')),
  idempotency_key text not null check (char_length(trim(idempotency_key)) between 1 and 255),
  request_fingerprint text not null check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  response_status integer,
  response_body jsonb,
  resource_type text,
  resource_id uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '48 hours'),
  unique (company_id, environment, idempotency_key)
);

create index if not exists api_idempotency_expiry_idx on public.api_idempotency_keys(expires_at);

create table if not exists public.api_usage (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  api_key_id uuid not null references public.api_keys(id) on delete cascade,
  environment text not null check (environment in ('test', 'live')),
  endpoint text not null check (char_length(endpoint) between 1 and 300),
  method text not null check (method in ('GET','POST','PATCH','PUT','DELETE','HEAD','OPTIONS')),
  response_status integer not null check (response_status between 100 and 599),
  request_id text not null check (request_id like 'req_%'),
  occurred_at timestamptz not null default now(),
  request_count integer not null default 1 check (request_count = 1)
);

create index if not exists api_usage_company_period_idx on public.api_usage(company_id, environment, occurred_at desc);
create index if not exists api_usage_key_period_idx on public.api_usage(api_key_id, occurred_at desc);
create index if not exists api_usage_endpoint_period_idx on public.api_usage(company_id, endpoint, occurred_at desc);

create table if not exists public.api_request_logs (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  api_key_id uuid not null references public.api_keys(id) on delete cascade,
  environment text not null check (environment in ('test', 'live')),
  request_id text not null check (request_id like 'req_%'),
  endpoint text not null,
  method text not null,
  response_status integer not null check (response_status between 100 and 599),
  duration_ms integer not null check (duration_ms >= 0),
  occurred_at timestamptz not null default now(),
  unique (request_id)
);

create index if not exists api_request_logs_company_period_idx on public.api_request_logs(company_id, occurred_at desc);
create index if not exists api_request_logs_request_id_idx on public.api_request_logs(request_id);

create table if not exists public.api_rate_limit_windows (
  api_key_id uuid not null references public.api_keys(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  environment text not null check (environment in ('test', 'live')),
  window_start bigint not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (api_key_id, environment, window_start)
);

create table if not exists public.api_addon_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  status text not null default 'inactive' check (status in ('trialing','active','past_due','canceled','unpaid','incomplete','incomplete_expired','inactive')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  grace_period_ends_at timestamptz,
  source text not null default 'stripe' check (source in ('stripe','manual','enterprise')),
  metadata jsonb not null default '{}'::jsonb,
  last_stripe_event_id text,
  last_stripe_event_created bigint,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id)
);

create index if not exists api_addon_status_idx on public.api_addon_subscriptions(company_id, status, current_period_end);

create table if not exists public.api_access_overrides (
  company_id uuid primary key references public.companies(id) on delete cascade,
  enabled boolean not null default true,
  reason text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.api_webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  endpoint_url text not null check (char_length(endpoint_url) between 1 and 2048),
  environment text not null check (environment in ('test', 'live')),
  subscribed_events text[] not null default '{}'::text[],
  status text not null default 'active' check (status in ('active','disabled','failing','deleted')),
  secret_prefix text not null,
  secret_hash text not null check (secret_hash like 'sha256:%'),
  secret_ciphertext text not null,
  last_delivery_at timestamptz,
  failure_count integer not null default 0 check (failure_count >= 0),
  success_count integer not null default 0 check (success_count >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists api_webhook_endpoints_company_idx on public.api_webhook_endpoints(company_id, environment, status);

create table if not exists public.api_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique check (event_id like 'evt_%'),
  company_id uuid not null references public.companies(id) on delete cascade,
  environment text not null check (environment in ('test', 'live')),
  event_type text not null,
  object_id uuid,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.api_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.api_webhook_events(id) on delete cascade,
  endpoint_id uuid not null references public.api_webhook_endpoints(id) on delete cascade,
  attempt integer not null default 0 check (attempt >= 0),
  status text not null default 'pending' check (status in ('pending','delivering','delivered','failed','exhausted','canceled')),
  status_code integer,
  response_time_ms integer,
  response_excerpt text,
  error_message text,
  next_attempt_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, endpoint_id)
);

create index if not exists api_webhook_deliveries_retry_idx on public.api_webhook_deliveries(status, next_attempt_at);
create index if not exists api_webhook_deliveries_endpoint_idx on public.api_webhook_deliveries(endpoint_id, created_at desc);

create table if not exists public.booking_invoice_automation_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  trigger_event text not null default 'completed' check (trigger_event in ('manual','confirmed','checked_in','completed','payment_received')),
  invoice_mode text not null default 'draft' check (invoice_mode in ('draft','finalize')),
  enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.booking_invoice_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  trigger_event text not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (company_id, booking_id),
  unique (company_id, idempotency_key)
);

create index if not exists booking_invoice_links_invoice_idx on public.booking_invoice_links(company_id, invoice_id);

create table if not exists public.booking_invoice_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  trigger_event text not null,
  status text not null default 'pending' check (status in ('pending','processing','completed','failed','canceled')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, booking_id, trigger_event)
);

create index if not exists booking_invoice_jobs_claim_idx on public.booking_invoice_jobs(status, available_at, created_at);

-- The API add-on is independent from Invoice/Booking/Suite rows in
-- subscription_accounts.  A tenant receives API access only when the add-on
-- is active and the requested base product is active.
create or replace function private.api_addon_access(p_company_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  with root as (select private.invoice_billing_root_company_id(p_company_id) as company_id)
  select exists (
    select 1 from public.companies company join root on root.company_id = company.id
    where company.archived_at is null
      and lower(coalesce(company.settings ->> 'status', 'active')) not in ('archived','deleted','suspended','disabled','inactive')
      and nullif(company.settings ->> 'suspended_at', '') is null
  )
  and not exists (
    select 1 from public.api_access_overrides disabled join root on root.company_id = disabled.company_id
    where not disabled.enabled
  )
  and (
    exists (
      select 1 from public.api_addon_subscriptions addon join root on root.company_id = addon.company_id
      where addon.status in ('trialing','active','past_due')
        and (addon.current_period_end is null or addon.current_period_end > now() or addon.grace_period_ends_at > now())
    )
    or exists (
    select 1 from public.api_access_overrides override join root on root.company_id = override.company_id
    where override.enabled
    )
  );
$$;

revoke all on function private.api_addon_access(uuid) from public;
grant execute on function private.api_addon_access(uuid) to authenticated, service_role;

-- Checkout eligibility is deliberately separate from API access.  A customer
-- must already own an Invoice, Booking, or Suite entitlement before the
-- add-on checkout can be opened, but the add-on itself is not required here.
create or replace function public.api_check_base_product_access(p_company_id uuid, p_product text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or not private.has_company_permission(p_company_id, 'billing.manage')
     or lower(trim(coalesce(p_product, ''))) not in ('invoice', 'booking', 'suite') then
    return false;
  end if;
  return private.operix_product_access(p_company_id, lower(trim(p_product)));
end;
$$;

revoke all on function public.api_check_base_product_access(uuid, text) from public;
grant execute on function public.api_check_base_product_access(uuid, text) to authenticated, service_role;

create or replace function private.api_product_access(p_company_id uuid, p_product text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.api_addon_access(p_company_id)
    and private.operix_product_access(p_company_id, lower(trim(p_product)));
$$;

revoke all on function private.api_product_access(uuid, text) from public;
grant execute on function private.api_product_access(uuid, text) to authenticated, service_role;

create or replace function public.api_check_product_access(p_company_id uuid, p_product text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.operix_server_request() and private.api_product_access(p_company_id, p_product);
$$;

revoke all on function public.api_check_product_access(uuid, text) from public, anon, authenticated;
grant execute on function public.api_check_product_access(uuid, text) to service_role;

create or replace function public.api_usage_summary(p_company_id uuid, p_environment text, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare result jsonb;
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id, 'settings.integrations') then
    raise exception 'API usage access denied' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'requests', count(*)::integer,
    'successful', count(*) filter (where response_status < 400)::integer,
    'failed', count(*) filter (where response_status >= 400)::integer,
    'requests_today', count(*) filter (where occurred_at >= date_trunc('day', now()))::integer,
    'top_endpoints', coalesce((select jsonb_agg(jsonb_build_object('endpoint', endpoint, 'requests', requests) order by requests desc)
      from (select usage.endpoint, count(*)::integer as requests from public.api_usage usage where usage.company_id = p_company_id and usage.environment = p_environment and usage.occurred_at >= p_from and usage.occurred_at < p_to group by usage.endpoint order by requests desc limit 10) top_rows), '[]'::jsonb),
    'by_key', coalesce((select jsonb_agg(jsonb_build_object('key_id', key_id, 'key_prefix', key_prefix, 'requests', requests) order by requests desc)
      from (select usage.api_key_id as key_id, key.key_prefix, count(*)::integer as requests from public.api_usage usage join public.api_keys key on key.id = usage.api_key_id where usage.company_id = p_company_id and usage.environment = p_environment and usage.occurred_at >= p_from and usage.occurred_at < p_to group by usage.api_key_id, key.key_prefix order by requests desc limit 20) key_rows), '[]'::jsonb)
  ) into result
  from public.api_usage usage
  where usage.company_id = p_company_id and usage.environment = p_environment and usage.occurred_at >= p_from and usage.occurred_at < p_to;
  return result;
end;
$$;

revoke all on function public.api_usage_summary(uuid, text, timestamptz, timestamptz) from public;
grant execute on function public.api_usage_summary(uuid, text, timestamptz, timestamptz) to authenticated, service_role;

create or replace function public.api_entitlement_summary(p_company_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id, 'settings.integrations') then
    raise exception 'API entitlement access denied' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'api_addon', private.api_addon_access(p_company_id),
    'invoice', private.api_product_access(p_company_id, 'invoice'),
    'booking', private.api_product_access(p_company_id, 'booking'),
    'included_requests', 5000,
    'overage_ready', true,
    'automatic_overage_charging', false
  );
end;
$$;

revoke all on function public.api_entitlement_summary(uuid) from public;
grant execute on function public.api_entitlement_summary(uuid) to authenticated, service_role;

-- Server-only, row-locked rate limiter.  It is deliberately keyed by API key,
-- tenant, and environment instead of IP address.
create or replace function public.api_consume_rate_limit(p_api_key_id uuid, p_company_id uuid, p_environment text, p_limit integer default 120, p_window_seconds integer default 60)
returns table(allowed boolean, request_count integer, remaining integer, reset_at bigint)
language plpgsql security definer set search_path = ''
as $$
declare current_window bigint := floor(extract(epoch from clock_timestamp()) / greatest(p_window_seconds, 1));
declare count_value integer;
begin
  if not private.operix_server_request() then raise exception 'Server-only API function' using errcode = '42501'; end if;
  if not exists (select 1 from public.api_keys key where key.id = p_api_key_id and key.company_id = p_company_id and key.environment = p_environment and key.revoked_at is null) then
    raise exception 'API key scope mismatch' using errcode = '42501';
  end if;
  insert into public.api_rate_limit_windows(api_key_id, company_id, environment, window_start, request_count)
    values (p_api_key_id, p_company_id, p_environment, current_window, 1)
    on conflict (api_key_id, environment, window_start)
    do update set request_count = public.api_rate_limit_windows.request_count + 1, updated_at = now()
    returning public.api_rate_limit_windows.request_count into count_value;
  return query select count_value <= p_limit, count_value, greatest(p_limit - count_value, 0), ((current_window + 1) * greatest(p_window_seconds, 1))::bigint;
end;
$$;

revoke all on function public.api_consume_rate_limit(uuid, uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.api_consume_rate_limit(uuid, uuid, text, integer, integer) to service_role;

create or replace function public.api_record_webhook_result(p_endpoint_id uuid, p_delivered boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.operix_server_request() then raise exception 'Server-only API function' using errcode = '42501'; end if;
  update public.api_webhook_endpoints
  set last_delivery_at = now(),
      success_count = success_count + case when p_delivered then 1 else 0 end,
      failure_count = failure_count + case when p_delivered then 0 else 1 end,
      status = case
        when p_delivered then 'active'
        when failure_count + 1 >= 3 then 'failing'
        else status
      end,
      updated_at = now()
  where id = p_endpoint_id and status <> 'deleted';
end;
$$;

revoke all on function public.api_record_webhook_result(uuid, boolean) from public;
grant execute on function public.api_record_webhook_result(uuid, boolean) to service_role;

create or replace function public.api_create_key(p_company_id uuid, p_name text, p_environment text, p_scopes text[], p_expires_at timestamptz default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare secret text := 'opx_' || p_environment || '_' || encode(extensions.gen_random_bytes(32), 'base64');
declare clean_secret text := replace(replace(replace(secret, '+', '-'), '/', '_'), '=', '');
declare key_row public.api_keys;
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id, 'settings.integrations') then raise exception 'API management denied' using errcode = '42501'; end if;
  if p_environment not in ('test', 'live') or p_scopes is null or cardinality(p_scopes) = 0 then raise exception 'Invalid API key configuration' using errcode = '22023'; end if;
  insert into public.api_keys(company_id, environment, name, key_prefix, key_hash, created_by, scopes, expires_at)
    values (p_company_id, p_environment, trim(p_name), left(clean_secret, 13) || '…' || right(clean_secret, 4), 'sha256:' || encode(extensions.digest(clean_secret, 'sha256'), 'hex'), (select auth.uid()), p_scopes, p_expires_at)
    returning * into key_row;
  insert into public.api_key_scopes(api_key_id, scope) select key_row.id, unnest(p_scopes);
  return jsonb_build_object('id', key_row.id, 'name', key_row.name, 'environment', key_row.environment, 'key', clean_secret, 'key_prefix', key_row.key_prefix, 'scopes', key_row.scopes, 'created_at', key_row.created_at, 'expires_at', key_row.expires_at);
end;
$$;

revoke all on function public.api_create_key(uuid, text, text, text[], timestamptz) from public;
grant execute on function public.api_create_key(uuid, text, text, text[], timestamptz) to authenticated;

create or replace function public.api_rotate_key(p_company_id uuid, p_key_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare secret text := 'opx_live_' || encode(extensions.gen_random_bytes(32), 'base64');
declare existing public.api_keys;
declare clean_secret text := replace(replace(replace(secret, '+', '-'), '/', '_'), '=', '');
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id, 'settings.integrations') then raise exception 'API management denied' using errcode = '42501'; end if;
  select * into existing from public.api_keys where id = p_key_id and company_id = p_company_id for update;
  if existing.id is null then raise exception 'API key not found' using errcode = '22023'; end if;
  clean_secret := 'opx_' || existing.environment || '_' || substr(clean_secret, 10);
  update public.api_keys set key_prefix = left(clean_secret, 13) || '…' || right(clean_secret, 4), key_hash = 'sha256:' || encode(extensions.digest(clean_secret, 'sha256'), 'hex'), revoked_at = null, updated_at = now() where id = existing.id;
  return jsonb_build_object('id', existing.id, 'name', existing.name, 'environment', existing.environment, 'key', clean_secret, 'key_prefix', left(clean_secret, 13) || '…' || right(clean_secret, 4), 'scopes', existing.scopes);
end;
$$;

revoke all on function public.api_rotate_key(uuid, uuid) from public;
grant execute on function public.api_rotate_key(uuid, uuid) to authenticated;

create or replace function public.api_revoke_key(p_company_id uuid, p_key_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id, 'settings.integrations') then raise exception 'API management denied' using errcode = '42501'; end if;
  update public.api_keys set revoked_at = coalesce(revoked_at, now()), updated_at = now() where id = p_key_id and company_id = p_company_id;
end;
$$;

revoke all on function public.api_revoke_key(uuid, uuid) from public;
grant execute on function public.api_revoke_key(uuid, uuid) to authenticated;

alter table public.api_keys enable row level security;
alter table public.api_key_scopes enable row level security;
alter table public.api_idempotency_keys enable row level security;
alter table public.api_usage enable row level security;
alter table public.api_request_logs enable row level security;
alter table public.api_rate_limit_windows enable row level security;
alter table public.api_addon_subscriptions enable row level security;
alter table public.api_access_overrides enable row level security;
alter table public.api_webhook_endpoints enable row level security;
alter table public.api_webhook_events enable row level security;
alter table public.api_webhook_deliveries enable row level security;
alter table public.booking_invoice_automation_settings enable row level security;
alter table public.booking_invoice_links enable row level security;
alter table public.booking_invoice_jobs enable row level security;

revoke all on public.api_keys, public.api_key_scopes, public.api_idempotency_keys, public.api_usage, public.api_request_logs, public.api_rate_limit_windows, public.api_addon_subscriptions, public.api_access_overrides, public.api_webhook_endpoints, public.api_webhook_events, public.api_webhook_deliveries, public.booking_invoice_automation_settings, public.booking_invoice_links, public.booking_invoice_jobs from anon;
grant select on public.api_keys, public.api_key_scopes, public.api_usage, public.api_request_logs, public.api_addon_subscriptions, public.api_webhook_endpoints, public.api_webhook_deliveries, public.booking_invoice_automation_settings, public.booking_invoice_links to authenticated;
grant insert, update, delete on public.booking_invoice_automation_settings to authenticated;
grant all on public.api_keys, public.api_key_scopes, public.api_idempotency_keys, public.api_usage, public.api_request_logs, public.api_rate_limit_windows, public.api_addon_subscriptions, public.api_access_overrides, public.api_webhook_endpoints, public.api_webhook_events, public.api_webhook_deliveries, public.booking_invoice_automation_settings, public.booking_invoice_links, public.booking_invoice_jobs to service_role;

drop policy if exists api_keys_read on public.api_keys;
create policy api_keys_read on public.api_keys for select to authenticated using (private.has_company_permission(company_id, 'settings.integrations'));
drop policy if exists api_key_scopes_read on public.api_key_scopes;
create policy api_key_scopes_read on public.api_key_scopes for select to authenticated using (exists (select 1 from public.api_keys key where key.id = api_key_id and private.has_company_permission(key.company_id, 'settings.integrations')));
drop policy if exists api_usage_read on public.api_usage;
create policy api_usage_read on public.api_usage for select to authenticated using (private.has_company_permission(company_id, 'settings.integrations'));
drop policy if exists api_logs_read on public.api_request_logs;
create policy api_logs_read on public.api_request_logs for select to authenticated using (private.has_company_permission(company_id, 'settings.integrations'));
drop policy if exists api_addon_read on public.api_addon_subscriptions;
create policy api_addon_read on public.api_addon_subscriptions for select to authenticated using (private.has_company_permission(company_id, 'billing.read'));
drop policy if exists webhook_read on public.api_webhook_endpoints;
create policy webhook_read on public.api_webhook_endpoints for select to authenticated using (private.has_company_permission(company_id, 'settings.integrations'));
drop policy if exists webhook_delivery_read on public.api_webhook_deliveries;
create policy webhook_delivery_read on public.api_webhook_deliveries for select to authenticated using (exists (select 1 from public.api_webhook_endpoints endpoint where endpoint.id = endpoint_id and private.has_company_permission(endpoint.company_id, 'settings.integrations')));
drop policy if exists automation_read on public.booking_invoice_automation_settings;
create policy automation_read on public.booking_invoice_automation_settings for select to authenticated using (private.has_company_permission(company_id, 'settings.integrations'));
drop policy if exists automation_write on public.booking_invoice_automation_settings;
create policy automation_write on public.booking_invoice_automation_settings for all to authenticated using (private.has_company_permission(company_id, 'settings.integrations')) with check (private.has_company_permission(company_id, 'settings.integrations'));
drop policy if exists booking_invoice_link_read on public.booking_invoice_links;
create policy booking_invoice_link_read on public.booking_invoice_links for select to authenticated using (public.can_access_company(company_id));

-- Keep the API-facing functions usable only through their intended roles.
revoke all on public.api_idempotency_keys, public.api_rate_limit_windows, public.api_webhook_events, public.booking_invoice_jobs from authenticated;

commit;
