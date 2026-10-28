-- OperiX Booking completion contracts
--
-- This migration closes the remaining production gaps without changing the
-- booking/availability source of truth. It adds idempotent Stripe membership
-- events, a narrowly-scoped public Checkout session boundary, notification
-- delivery claiming, and the storage/domain records needed by Booking Pages.
-- It is intentionally additive and has not been applied to production.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Idempotent Stripe event ledger for Booking payments and memberships.
-- ---------------------------------------------------------------------------

create table if not exists public.booking_stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider text not null default 'stripe',
  provider_event_id text not null,
  event_type text not null,
  status text not null default 'processing' check (status in ('processing', 'processed', 'ignored', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, provider_event_id)
);

create index if not exists booking_stripe_webhook_events_company_idx
  on public.booking_stripe_webhook_events(company_id, created_at desc);

alter table public.booking_stripe_webhook_events enable row level security;
revoke all on table public.booking_stripe_webhook_events from public, anon, authenticated;
grant all on table public.booking_stripe_webhook_events to service_role;

create or replace function public.booking_stripe_webhook_claim(
  p_company_id uuid,
  p_event_id text,
  p_event_type text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'Service authorization required' using errcode = '42501';
  end if;
  if p_company_id is null or nullif(trim(p_event_id), '') is null or nullif(trim(p_event_type), '') is null then
    raise exception 'Stripe event identity is required' using errcode = '22023';
  end if;
  insert into public.booking_stripe_webhook_events(company_id, provider_event_id, event_type)
  values (p_company_id, left(trim(p_event_id), 255), left(trim(p_event_type), 120))
  on conflict (provider, provider_event_id) do nothing;
  return found;
end;
$$;

revoke all on function public.booking_stripe_webhook_claim(uuid, text, text) from public, anon, authenticated;
grant execute on function public.booking_stripe_webhook_claim(uuid, text, text) to service_role;

create or replace function public.booking_stripe_webhook_complete(
  p_event_id text,
  p_status text default 'processed',
  p_error_message text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'Service authorization required' using errcode = '42501';
  end if;
  if p_status not in ('processed', 'ignored', 'failed') then
    raise exception 'Stripe event status is invalid' using errcode = '22023';
  end if;
  update public.booking_stripe_webhook_events
  set status = p_status,
      error_message = nullif(left(coalesce(p_error_message, ''), 1000), ''),
      processed_at = now()
  where provider = 'stripe' and provider_event_id = left(trim(p_event_id), 255);
end;
$$;

revoke all on function public.booking_stripe_webhook_complete(text, text, text) from public, anon, authenticated;
grant execute on function public.booking_stripe_webhook_complete(text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Customer membership billing lifecycle.
-- ---------------------------------------------------------------------------

alter table public.booking_memberships
  add column if not exists last_billing_event_id text,
  add column if not exists last_billing_event_created bigint;

create table if not exists public.booking_membership_billing_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  membership_id uuid not null,
  provider text not null default 'stripe',
  provider_event_id text not null,
  event_type text not null,
  event_created bigint,
  status text not null default 'applied' check (status in ('applied', 'ignored', 'failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id),
  foreign key (company_id, membership_id) references public.booking_memberships(company_id, id) on delete cascade
);

create index if not exists booking_membership_billing_events_membership_idx
  on public.booking_membership_billing_events(company_id, membership_id, created_at desc);

alter table public.booking_membership_billing_events enable row level security;
revoke all on table public.booking_membership_billing_events from public, anon, authenticated;
grant all on table public.booking_membership_billing_events to service_role;

create or replace function public.booking_membership_billing_apply_event(
  p_company_id uuid,
  p_membership_id uuid default null,
  p_external_subscription_id text default null,
  p_provider text default 'stripe',
  p_event_id text default null,
  p_event_type text default null,
  p_status text default null,
  p_period_start date default null,
  p_period_end date default null,
  p_next_billing_on date default null,
  p_event_created bigint default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  membership_row public.booking_memberships;
  plan_row public.booking_packages;
  mapping_row public.booking_package_services;
  credit_row public.booking_membership_credits;
  event_id uuid;
  normalized_status text := lower(trim(coalesce(p_status, '')));
  period_start_value date := p_period_start;
  period_end_value date := p_period_end;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'Service authorization required' using errcode = '42501';
  end if;
  if p_company_id is null or nullif(trim(coalesce(p_event_id, '')), '') is null then
    raise exception 'Membership billing event identity is required' using errcode = '22023';
  end if;
  if normalized_status not in ('active', 'trialing', 'past_due', 'paused', 'cancelled', 'expired') then
    raise exception 'Membership billing status is invalid' using errcode = '22023';
  end if;
  select membership.* into membership_row
  from public.booking_memberships membership
  where membership.company_id = p_company_id
    and (p_membership_id is not null and membership.id = p_membership_id
      or p_membership_id is null and p_external_subscription_id is not null and membership.external_subscription_id = trim(p_external_subscription_id))
  for update;
  if not found then
    raise exception 'Membership billing target was not found' using errcode = 'P0002';
  end if;

  insert into public.booking_membership_billing_events(
    company_id, membership_id, provider, provider_event_id, event_type,
    event_created, metadata
  )
  values (
    p_company_id, membership_row.id, lower(trim(coalesce(p_provider, 'stripe'))),
    left(trim(p_event_id), 255), left(trim(coalesce(p_event_type, 'membership.billing')), 120),
    p_event_created, coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (provider, provider_event_id) do nothing
  returning id into event_id;
  if event_id is null then
    return jsonb_build_object('processed', false, 'duplicate', true, 'membershipId', membership_row.id);
  end if;

  if p_event_created is not null and membership_row.last_billing_event_created is not null
    and membership_row.last_billing_event_created > p_event_created then
    update public.booking_membership_billing_events
    set status = 'ignored'
    where id = event_id;
    return jsonb_build_object('processed', false, 'stale', true, 'membershipId', membership_row.id);
  end if;

  period_start_value := coalesce(period_start_value, membership_row.next_billing_on);
  period_end_value := coalesce(period_end_value,
    case when period_start_value is null then null
      when membership_row.billing_interval = 'annual' then (period_start_value + interval '1 year' - interval '1 day')::date
      else (period_start_value + interval '1 month' - interval '1 day')::date
    end);

  update public.booking_memberships as membership
  set status = normalized_status,
      external_provider = coalesce(nullif(trim(p_provider), ''), membership.external_provider),
      external_subscription_id = coalesce(nullif(trim(p_external_subscription_id), ''), membership.external_subscription_id),
      ends_on = case
        when normalized_status in ('cancelled', 'expired') then coalesce(period_end_value, membership.ends_on, current_date)
        when normalized_status in ('active', 'trialing', 'past_due', 'paused') and membership.external_subscription_id is not null then null
        else membership.ends_on
      end,
      next_billing_on = coalesce(p_next_billing_on, case when period_end_value is null then membership.next_billing_on else period_end_value + 1 end),
      last_billing_event_id = left(trim(p_event_id), 255),
      last_billing_event_created = coalesce(p_event_created, membership.last_billing_event_created),
      cancelled_at = case when normalized_status = 'cancelled' then coalesce(membership.cancelled_at, now()) else membership.cancelled_at end,
      updated_at = now()
  where membership.company_id = p_company_id and membership.id = membership_row.id
  returning membership.* into membership_row;

  if normalized_status in ('active', 'trialing') and period_start_value is not null and period_end_value is not null then
    select package.* into plan_row
    from public.booking_packages package
    where package.company_id = p_company_id and package.id = membership_row.package_id;
    for mapping_row in
      select mapping.* from public.booking_package_services mapping
      where mapping.company_id = p_company_id and mapping.package_id = membership_row.package_id
    loop
      if not exists (
        select 1 from public.booking_membership_credits credit
        where credit.company_id = p_company_id and credit.membership_id = membership_row.id
          and credit.service_id = mapping_row.service_id and credit.period_starts_on = period_start_value
      ) then
        insert into public.booking_membership_credits(
          company_id, membership_id, service_id, period_starts_on, period_ends_on,
          included_units, remaining_units
        )
        values (
          p_company_id, membership_row.id, mapping_row.service_id, period_start_value,
          period_end_value, coalesce(mapping_row.included_uses, plan_row.uses, 1),
          coalesce(mapping_row.included_uses, plan_row.uses, 1)
        )
        returning * into credit_row;
        insert into public.booking_membership_credit_ledger(
          company_id, membership_id, credit_id, service_id, action, units, metadata
        )
        values (
          p_company_id, membership_row.id, credit_row.id, credit_row.service_id, 'granted',
          credit_row.included_units,
          jsonb_build_object('periodStartsOn', credit_row.period_starts_on, 'periodEndsOn', credit_row.period_ends_on, 'source', 'stripe.billing')
        );
      end if;
    end loop;
  end if;

  if normalized_status = 'past_due' then
    insert into public.booking_automation_runs(company_id, rule_id, customer_id, due_at, idempotency_key, payload)
    select rule.company_id, rule.id, membership_row.customer_id, now(),
      rule.id::text || ':membership:' || membership_row.id::text || ':' || left(trim(p_event_id), 255),
      jsonb_build_object('trigger', 'membership_payment_failed', 'membershipId', membership_row.id)
    from public.booking_automation_rules rule
    join public.clients customer on customer.company_id = rule.company_id and customer.id = membership_row.customer_id
    where rule.company_id = p_company_id and rule.enabled and rule.trigger_type = 'membership_payment_failed'
      and (not rule.requires_marketing_consent or (customer.marketing_consent and customer.marketing_unsubscribed_at is null))
    on conflict (company_id, idempotency_key) do nothing;
  end if;

  perform private.booking_audit_event(p_company_id, null, 'membership.billing_event_applied', jsonb_build_object('membership_id', membership_row.id, 'event_type', p_event_type, 'status', normalized_status));
  return jsonb_build_object('processed', true, 'membershipId', membership_row.id, 'status', normalized_status, 'nextBillingOn', membership_row.next_billing_on);
end;
$$;

revoke all on function public.booking_membership_billing_apply_event(uuid, uuid, text, text, text, text, text, date, date, date, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.booking_membership_billing_apply_event(uuid, uuid, text, text, text, text, text, date, date, date, bigint, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Notification delivery queue. The worker only marks a row sent after a
-- configured provider accepts it; unsupported channels remain observable.
-- ---------------------------------------------------------------------------

alter table public.booking_notification_log
  add column if not exists attempts integer not null default 0,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists locked_at timestamptz;

create index if not exists booking_notification_delivery_claim_idx
  on public.booking_notification_log(status, next_attempt_at, locked_at, created_at);

create or replace function public.booking_notification_claim(p_limit integer default 50)
returns setof public.booking_notification_log
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'Service authorization required' using errcode = '42501';
  end if;
  return query
  with candidates as (
    select notification.id
    from public.booking_notification_log notification
    where notification.status in ('queued', 'failed')
      and notification.attempts < 8
      and (notification.next_attempt_at is null or notification.next_attempt_at <= now())
      and (notification.locked_at is null or notification.locked_at < now() - interval '15 minutes')
    order by notification.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  )
  update public.booking_notification_log notification
  set locked_at = now(), attempts = notification.attempts + 1
  from candidates
  where notification.id = candidates.id
  returning notification.*;
end;
$$;

revoke all on function public.booking_notification_claim(integer) from public, anon, authenticated;
grant execute on function public.booking_notification_claim(integer) to service_role;

create or replace function public.booking_notification_complete(
  p_notification_id uuid,
  p_success boolean,
  p_provider_message_id text default null,
  p_error_message text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  notification_row public.booking_notification_log;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'Service authorization required' using errcode = '42501';
  end if;
  select * into notification_row from public.booking_notification_log where id = p_notification_id for update;
  if not found then return; end if;
  update public.booking_notification_log
  set status = case when p_success then 'sent' when notification_row.attempts >= 8 then 'skipped' else 'failed' end,
      provider_message_id = coalesce(nullif(left(trim(coalesce(p_provider_message_id, '')), 255), ''), provider_message_id),
      error_message = nullif(left(coalesce(p_error_message, ''), 1000), ''),
      sent_at = case when p_success then coalesce(sent_at, now()) else sent_at end,
      next_attempt_at = case when p_success or notification_row.attempts >= 8 then null else now() + least(interval '1 day', make_interval(mins => greatest(1, notification_row.attempts * 5))) end,
      locked_at = null
  where id = p_notification_id;
end;
$$;

revoke all on function public.booking_notification_complete(uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function public.booking_notification_complete(uuid, boolean, text, text) to service_role;

-- Allow a crashed worker to retry a claimed waitlist offer without creating a
-- second offer or leaking a token into logs.
create or replace function public.booking_waitlist_claim_offer_deliveries(p_limit integer default 50)
returns table(offer_id uuid, company_id uuid, raw_token text, recipient text, expires_at timestamptz, starts_at timestamptz, ends_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'Service authorization required' using errcode = '42501';
  end if;
  return query
  with candidates as (
    select delivery.id
    from public.booking_waitlist_offer_delivery delivery
    join public.booking_waitlist_offers offer on offer.id = delivery.offer_id
    where delivery.consumed_at is null
      and (delivery.claimed_at is null or delivery.claimed_at < now() - interval '15 minutes')
      and delivery.attempts < 8
      and offer.status = 'offered'
      and offer.expires_at > now()
    order by offer.created_at
    for update of delivery skip locked
    limit greatest(1, least(coalesce(p_limit, 50), 200))
  ), claimed as (
    update public.booking_waitlist_offer_delivery delivery
    set claimed_at = now(), attempts = delivery.attempts + 1
    from candidates
    where delivery.id = candidates.id
    returning delivery.*
  )
  select offer.id, offer.company_id, claimed.raw_token,
    coalesce(nullif(trim(waitlist.guest_email), ''), nullif(trim(customer.email), ''), nullif(trim(waitlist.guest_phone), ''), nullif(trim(customer.phone), '')), offer.expires_at,
    offer.offered_starts_at, offer.offered_ends_at
  from claimed
  join public.booking_waitlist_offers offer on offer.id = claimed.offer_id
  join public.booking_waitlist waitlist on waitlist.company_id = offer.company_id and waitlist.id = offer.waitlist_id
  left join public.clients customer on customer.company_id = waitlist.company_id and customer.id = waitlist.customer_id
  where offer.status = 'offered' and offer.expires_at > now();
end;
$$;

revoke all on function public.booking_waitlist_claim_offer_deliveries(integer) from public, anon, authenticated;
grant execute on function public.booking_waitlist_claim_offer_deliveries(integer) to service_role;

-- ---------------------------------------------------------------------------
-- Booking Page custom domains and controlled media uploads.
-- ---------------------------------------------------------------------------

create table if not exists public.booking_page_domains (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  page_id uuid not null,
  hostname text not null,
  status text not null default 'pending' check (status in ('pending', 'verified', 'disabled')),
  verification_token_hash text not null,
  verified_at timestamptz,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hostname),
  foreign key (company_id, page_id) references public.booking_pages(company_id, id) on delete cascade,
  unique (company_id, id)
);

create unique index if not exists booking_page_domains_primary_idx
  on public.booking_page_domains(company_id) where is_primary and status = 'verified';

create index if not exists booking_page_domains_hostname_idx
  on public.booking_page_domains(lower(hostname), status);

alter table public.booking_page_domains enable row level security;
revoke all on table public.booking_page_domains from public, anon, authenticated;
grant all on table public.booking_page_domains to service_role;

create table if not exists public.booking_page_media (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  page_id uuid not null,
  media_type text not null check (media_type in ('logo', 'cover', 'service', 'staff', 'location')),
  object_path text not null unique,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer not null check (byte_size > 0 and byte_size <= 10485760),
  status text not null default 'pending' check (status in ('pending', 'uploaded', 'deleted')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, page_id) references public.booking_pages(company_id, id) on delete cascade
);

create index if not exists booking_page_media_page_idx
  on public.booking_page_media(company_id, page_id, media_type, status, created_at desc);

alter table public.booking_page_media enable row level security;
revoke all on table public.booking_page_media from public, anon, authenticated;
grant all on table public.booking_page_media to service_role;

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
    values ('booking-pages', 'booking-pages', true, 10485760, array['image/jpeg', 'image/png', 'image/webp']::text[])
    on conflict (id) do nothing;
  end if;
end;
$$;

do $$
begin
  if to_regclass('storage.objects') is not null and not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'booking_pages_public_read'
  ) then
    create policy booking_pages_public_read on storage.objects for select to anon, authenticated using (bucket_id = 'booking-pages');
  end if;
end;
$$;

create or replace function public.booking_page_media_prepare(
  p_company_id uuid,
  p_page_id uuid,
  p_media_type text,
  p_content_type text,
  p_byte_size integer,
  p_file_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  media_row public.booking_page_media;
  extension_value text := case lower(coalesce(p_content_type, '')) when 'image/png' then 'png' when 'image/webp' then 'webp' else 'jpg' end;
  object_path_value text;
begin
  if actor_id is null or not public.can_access_company(p_company_id) or not coalesce(private.has_company_permission(p_company_id, 'booking.settings.manage'), false) then
    raise exception 'You do not have permission to upload Booking Page media' using errcode = '42501';
  end if;
  if p_media_type not in ('logo', 'cover', 'service', 'staff', 'location') or p_content_type not in ('image/jpeg', 'image/png', 'image/webp') or p_byte_size is null or p_byte_size < 1 or p_byte_size > 10485760 then
    raise exception 'Booking Page media is invalid or too large' using errcode = '22023';
  end if;
  if not exists (select 1 from public.booking_pages page where page.company_id = p_company_id and page.id = p_page_id) then
    raise exception 'Booking Page not found' using errcode = 'P0002';
  end if;
  object_path_value := 'pages/' || encode(extensions.gen_random_bytes(18), 'hex') || '.' || extension_value;
  insert into public.booking_page_media(company_id, page_id, media_type, object_path, content_type, byte_size, created_by)
  values (p_company_id, p_page_id, p_media_type, object_path_value, p_content_type, p_byte_size, actor_id)
  returning * into media_row;
  return jsonb_build_object('id', media_row.id, 'path', media_row.object_path, 'bucket', 'booking-pages', 'contentType', media_row.content_type, 'maxBytes', 10485760);
end;
$$;

revoke all on function public.booking_page_media_prepare(uuid, uuid, text, text, integer, text) from public, anon;
grant execute on function public.booking_page_media_prepare(uuid, uuid, text, text, integer, text) to authenticated;

create or replace function public.booking_page_media_mark_uploaded(p_media_id uuid)
returns public.booking_page_media
language plpgsql
security definer
set search_path = ''
as $$
declare
  media_row public.booking_page_media;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'Service authorization required' using errcode = '42501';
  end if;
  update public.booking_page_media
  set status = 'uploaded', updated_at = now()
  where id = p_media_id and status = 'pending'
  returning * into media_row;
  if not found then raise exception 'Booking Page media not found' using errcode = 'P0002'; end if;
  return media_row;
end;
$$;

revoke all on function public.booking_page_media_mark_uploaded(uuid) from public, anon, authenticated;
grant execute on function public.booking_page_media_mark_uploaded(uuid) to service_role;

create or replace function public.booking_page_domain_add(p_company_id uuid, p_hostname text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  page_row public.booking_pages;
  hostname_value text := lower(trim(p_hostname));
  raw_token text := encode(extensions.gen_random_bytes(24), 'hex');
  domain_row public.booking_page_domains;
begin
  if actor_id is null or not public.can_access_company(p_company_id) or not coalesce(private.has_company_permission(p_company_id, 'booking.settings.manage'), false) then
    raise exception 'You do not have permission to manage Booking Page domains' using errcode = '42501';
  end if;
  if hostname_value !~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$' or char_length(hostname_value) > 253 then
    raise exception 'Enter a valid custom hostname' using errcode = '22023';
  end if;
  if hostname_value in ('booking.operixsuite.com', 'www.operixsuite.com', 'operixsuite.com') then
    raise exception 'That hostname is reserved by OperiX' using errcode = '23505';
  end if;
  select * into page_row from public.booking_pages where company_id = p_company_id;
  if not found then raise exception 'Booking Page not found' using errcode = 'P0002'; end if;
  insert into public.booking_page_domains(company_id, page_id, hostname, verification_token_hash, is_primary)
  values (p_company_id, page_row.id, hostname_value, encode(extensions.digest(raw_token, 'sha256'), 'hex'), not exists (select 1 from public.booking_page_domains where company_id = p_company_id and status = 'verified'))
  returning * into domain_row;
  perform private.booking_audit_event(p_company_id, null, 'booking_page.domain_added', jsonb_build_object('domain_id', domain_row.id, 'hostname', hostname_value));
  return jsonb_build_object('id', domain_row.id, 'hostname', domain_row.hostname, 'status', domain_row.status, 'verificationToken', raw_token);
exception when unique_violation then
  raise exception 'That hostname is already connected to another Booking Page' using errcode = '23505';
end;
$$;

revoke all on function public.booking_page_domain_add(uuid, text) from public, anon;
grant execute on function public.booking_page_domain_add(uuid, text) to authenticated;

create or replace function public.booking_page_domain_list(p_company_id uuid)
returns setof public.booking_page_domains
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_access_company(p_company_id) or not coalesce(private.has_company_permission(p_company_id, 'booking.settings.manage'), false) then
    raise exception 'You do not have permission to view Booking Page domains' using errcode = '42501';
  end if;
  return query select domain.* from public.booking_page_domains domain where domain.company_id = p_company_id order by domain.is_primary desc, domain.created_at;
end;
$$;

revoke all on function public.booking_page_domain_list(uuid) from public, anon;
grant execute on function public.booking_page_domain_list(uuid) to authenticated;

create or replace function public.booking_page_domain_mark_verified(p_domain_id uuid, p_verification_token text)
returns public.booking_page_domains
language plpgsql
security definer
set search_path = ''
as $$
declare
  domain_row public.booking_page_domains;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception 'Service authorization required' using errcode = '42501';
  end if;
  update public.booking_page_domains
  set status = 'verified', verified_at = now(), updated_at = now()
  where id = p_domain_id
    and status = 'pending'
    and verification_token_hash = encode(extensions.digest(trim(coalesce(p_verification_token, '')), 'sha256'), 'hex')
  returning * into domain_row;
  if not found then raise exception 'The domain verification token is invalid' using errcode = '42501'; end if;
  return domain_row;
end;
$$;

revoke all on function public.booking_page_domain_mark_verified(uuid, text) from public, anon, authenticated;
grant execute on function public.booking_page_domain_mark_verified(uuid, text) to service_role;

create or replace function public.booking_page_public_get_by_host(p_hostname text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.booking_page_public_get(page.slug)
  from public.booking_page_domains domain
  join public.booking_pages page on page.company_id = domain.company_id and page.id = domain.page_id
  join public.booking_settings settings on settings.company_id = domain.company_id
  where lower(domain.hostname) = lower(trim(p_hostname))
    and domain.status = 'verified'
    and domain.is_primary
    and page.status = 'published'
    and settings.public_enabled
  limit 1;
$$;

revoke all on function public.booking_page_public_get_by_host(text) from public;
grant execute on function public.booking_page_public_get_by_host(text) to anon, authenticated;

comment on table public.booking_page_domains is 'Verified custom hostnames for Booking Pages; DNS/edge provisioning remains deployment-owned.';
comment on table public.booking_page_media is 'Tenant-scoped, controlled Booking Page media upload records.';

-- Widget configuration is public-safe: never return the tenant UUID, and
-- enforce the configured origin list when the widget supplies its parent
-- origin. An empty allow-list preserves the existing open-embed behavior.
create or replace function public.booking_widget_config_get(p_slug text, p_origin text default null)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'available',
      coalesce(settings.public_enabled, false)
      and coalesce(settings.public_widget_enabled, false)
      and (
        cardinality(coalesce(config.allowed_origins, settings.public_widget_allowed_origins, '{}'::text[])) = 0
        or (nullif(trim(p_origin), '') is not null and nullif(trim(p_origin), '') = any(coalesce(config.allowed_origins, settings.public_widget_allowed_origins, '{}'::text[])))
      ),
    'slug', settings.public_slug,
    'theme', coalesce(config.theme, '{}'::jsonb),
    'language', coalesce(config.language, 'en'),
    'serviceId', config.service_id,
    'locationId', config.location_id,
    'staffId', config.staff_id
  )
  from public.booking_settings settings
  left join public.booking_widget_configs config on config.company_id = settings.company_id
  where settings.public_slug = lower(trim(p_slug));
$$;

create or replace function public.booking_widget_config_get(p_slug text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.booking_widget_config_get(p_slug, null::text);
$$;

revoke all on function public.booking_widget_config_get(text) from public;
revoke all on function public.booking_widget_config_get(text, text) from public;
grant execute on function public.booking_widget_config_get(text) to anon, authenticated;
grant execute on function public.booking_widget_config_get(text, text) to anon, authenticated;
