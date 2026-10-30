-- Platform dashboard inside OperiX Control (/platform): statistics and a user directory for the platform owner,
-- plus granting and revoking OperiX Cloud access per workspace.
--
-- Who may use it: a platform administrator (public.control_is_platform_admin) whose sign-in email is ALSO on
-- public.platform_dashboard_allowlist. Every function below checks both, so the data is protected in the database
-- itself and not only by the web app. The allowlist starts with one address.

create table if not exists public.platform_dashboard_allowlist (
  email text primary key check (email = lower(email)),
  added_at timestamptz not null default now(),
  added_by uuid
);
alter table public.platform_dashboard_allowlist enable row level security; -- no policies: only the functions below read it
insert into public.platform_dashboard_allowlist (email) values ('admin@lrdy-group.com') on conflict do nothing;

create or replace function private.platform_dashboard_allowed()
returns boolean language sql stable security definer set search_path to '' as $$
  -- The address comes from the account itself (and must be confirmed), not from a claim inside the sign-in token.
  select coalesce(public.control_is_platform_admin(), false)
     and exists (
       select 1
       from auth.users account
       join public.platform_dashboard_allowlist allowed on allowed.email = lower(account.email)
       where account.id = (select auth.uid()) and account.email_confirmed_at is not null
     );
$$;

-- Lets the web app ask "may I show the dashboard?" without exposing why.
create or replace function public.platform_dashboard_access()
returns boolean language sql stable security definer set search_path to '' as $$
  select private.platform_dashboard_allowed();
$$;

-- The best OperiX Cloud state of a workspace: granted, paid, past_due, trial, expired or none.
create or replace function private.platform_cloud_status(p_company_id uuid)
returns text language plpgsql stable security definer set search_path to '' as $$
declare
  root_id uuid := coalesce(private.invoice_billing_root_company_id(p_company_id), p_company_id);
begin
  if exists (
    select 1 from public.subscription_manual_grants grant_row
    where grant_row.company_id = root_id and grant_row.revoked_at is null
      and (grant_row.expires_at is null or grant_row.expires_at > now())
      and grant_row.product in ('invoice', 'suite') and coalesce(grant_row.override_status, 'active') in ('active', 'trialing')
  ) then return 'granted'; end if;
  if exists (select 1 from public.subscription_accounts account where account.company_id = root_id and account.product in ('invoice', 'suite') and account.status = 'active') then return 'paid'; end if;
  if exists (select 1 from public.subscription_accounts account where account.company_id = root_id and account.product in ('invoice', 'suite') and account.status = 'past_due') then return 'past_due'; end if;
  if exists (select 1 from public.subscription_accounts account where account.company_id = root_id and account.product in ('invoice', 'suite') and account.status = 'trialing' and account.trial_ends_at > now()) then return 'trial'; end if;
  if exists (select 1 from public.subscription_accounts account where account.company_id = root_id and account.product in ('invoice', 'suite')) then return 'expired'; end if;
  return 'none';
end;
$$;

create or replace function private.platform_cloud_rank(p_status text)
returns integer language sql immutable set search_path to '' as $$
  select case p_status when 'granted' then 6 when 'paid' then 5 when 'past_due' then 4 when 'trial' then 3 when 'expired' then 2 else 1 end;
$$;

-- ---------------------------------------------------------------- statistics
create or replace function public.platform_stats()
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare
  result jsonb;
begin
  if not private.platform_dashboard_allowed() then raise exception 'Platform dashboard access denied' using errcode = '42501'; end if;

  select jsonb_build_object(
    'generated_at', now(),
    'users', (select jsonb_build_object(
        'total', count(*),
        'new_7d', count(*) filter (where created_at > now() - interval '7 days'),
        'new_30d', count(*) filter (where created_at > now() - interval '30 days'),
        'active_7d', count(*) filter (where last_sign_in_at > now() - interval '7 days'),
        'active_30d', count(*) filter (where last_sign_in_at > now() - interval '30 days'),
        'unconfirmed', count(*) filter (where email_confirmed_at is null),
        'providers', (select coalesce(jsonb_object_agg(provider, total), '{}'::jsonb) from (select coalesce(raw_app_meta_data ->> 'provider', 'email') as provider, count(*) as total from auth.users group by 1) providers))
      from auth.users),
    'signups_by_day', (select jsonb_agg(jsonb_build_object('day', day::date, 'count', coalesce(signups.total, 0)) order by day)
      from generate_series((current_date - 29)::timestamp, current_date::timestamp, interval '1 day') day
      left join (select created_at::date as signup_day, count(*) as total from auth.users where created_at >= current_date - 29 group by 1) signups on signups.signup_day = day::date),
    'workspaces', (select jsonb_build_object(
        'total', count(*),
        'new_30d', count(*) filter (where created_at > now() - interval '30 days'),
        'multi_member', count(*) filter (where (select count(*) from public.memberships member where member.company_id = company.id and coalesce(member.status, 'active') = 'active') > 1),
        'by_cloud_status', (select coalesce(jsonb_object_agg(status, total), '{}'::jsonb) from (select private.platform_cloud_status(root.id) as status, count(*) as total from public.companies root where root.parent_company_id is null and root.archived_at is null group by 1) states))
      from public.companies company where company.parent_company_id is null and company.archived_at is null),
    'subscriptions', jsonb_build_object(
        'by_status', (select coalesce(jsonb_agg(jsonb_build_object('product', product, 'status', status, 'count', total) order by product, status), '[]'::jsonb) from (select product, status, count(*) as total from public.subscription_accounts group by 1, 2) rows),
        'paying', (select count(*) from public.subscription_accounts where status = 'active' and stripe_subscription_id is not null),
        'estimated_mrr_eur', (select coalesce(round(sum(case
              when billing_interval = 'annual' then (case product when 'suite' then 49.99 when 'booking' then 49.99 else 29.99 end) / 12
              else (case product when 'suite' then 4.99 when 'booking' then 4.99 else 2.99 end) end), 2), 0)
            from public.subscription_accounts where status = 'active' and stripe_subscription_id is not null),
        'manual_grants_active', (select count(*) from public.subscription_manual_grants where revoked_at is null and (expires_at is null or expires_at > now()))),
    'activity', jsonb_build_object(
        'invoices_total', (select count(*) from public.invoices),
        'invoices_30d', (select count(*) from public.invoices where created_at > now() - interval '30 days'),
        'invoice_volume_30d', (select coalesce(jsonb_object_agg(currency, total), '{}'::jsonb) from (select coalesce(currency, 'EUR') as currency, round(sum(total_amount), 2) as total from public.invoices where created_at > now() - interval '30 days' and coalesce(status::text, 'draft') <> 'draft' group by 1) volume),
        'payments_30d', (select count(*) from public.payments where created_at > now() - interval '30 days'),
        'expenses_30d', (select count(*) from public.expenses where created_at > now() - interval '30 days'),
        'customers_total', (select count(*) from public.clients),
        'products_total', (select count(*) from public.products)),
    'invoices_by_day', (select jsonb_agg(jsonb_build_object('day', day::date, 'count', coalesce(invoices.total, 0)) order by day)
      from generate_series((current_date - 29)::timestamp, current_date::timestamp, interval '1 day') day
      left join (select created_at::date as invoice_day, count(*) as total from public.invoices where created_at >= current_date - 29 group by 1) invoices on invoices.invoice_day = day::date),
    'top_workspaces_30d', (select coalesce(jsonb_agg(jsonb_build_object('company_id', id, 'name', name, 'invoices', total) order by total desc), '[]'::jsonb)
      from (select company.id, coalesce(company.company_name, company.name, 'Unnamed') as name, count(invoice.id) as total
            from public.invoices invoice join public.companies company on company.id = invoice.company_id
            where invoice.created_at > now() - interval '30 days' group by company.id, company.company_name, company.name order by total desc limit 8) top),
    'devices', jsonb_build_object(
        'active', (select count(*) from public.operix_push_device_tokens where is_active),
        'by_platform', (select coalesce(jsonb_object_agg(platform, total), '{}'::jsonb) from (select coalesce(platform, 'unknown') as platform, count(*) as total from public.operix_push_device_tokens where is_active group by 1) platforms),
        'push_sent_7d', (select count(*) from public.push_outbox where processed_at > now() - interval '7 days'),
        'push_pending', (select count(*) from public.push_outbox where processed_at is null))
  ) into result;
  return result;
end;
$$;

-- ---------------------------------------------------------------- users
create or replace function public.platform_list_users(p_search text default null, p_limit integer default 25, p_offset integer default 0)
returns table (
  id uuid, email text, full_name text, created_at timestamptz, last_sign_in_at timestamptz, email_confirmed boolean,
  provider text, workspaces integer, cloud_status text, invoices bigint, total_count bigint
)
language plpgsql stable security definer set search_path to '' as $$
declare
  term text := nullif(trim(coalesce(p_search, '')), '');
begin
  if not private.platform_dashboard_allowed() then raise exception 'Platform dashboard access denied' using errcode = '42501'; end if;
  return query
  with base as (
    select u.id, u.email::text as email,
      nullif(trim(coalesce(profile.first_name, '') || ' ' || coalesce(profile.last_name, '')), '') as full_name,
      u.created_at, u.last_sign_in_at, u.email_confirmed_at is not null as email_confirmed,
      coalesce(u.raw_app_meta_data ->> 'provider', 'email') as provider
    from auth.users u left join public.profiles profile on profile.id = u.id
    where term is null or u.email ilike '%' || term || '%'
       or coalesce(profile.first_name, '') || ' ' || coalesce(profile.last_name, '') ilike '%' || term || '%'
  ), enriched as (
    select base.*,
      (select count(*)::integer from public.memberships member where member.user_id = base.id and coalesce(member.status, 'active') = 'active') as workspaces,
      (select status from (select private.platform_cloud_status(member.company_id) as status from public.memberships member where member.user_id = base.id and coalesce(member.status, 'active') = 'active') states order by private.platform_cloud_rank(status) desc limit 1) as cloud_status,
      (select count(*) from public.invoices invoice where invoice.user_id = base.id) as invoices
    from base
  )
  select e.id, e.email, e.full_name, e.created_at, e.last_sign_in_at, e.email_confirmed, e.provider, e.workspaces,
         coalesce(e.cloud_status, 'none'), e.invoices, count(*) over ()
  from enriched e order by e.created_at desc limit greatest(1, least(coalesce(p_limit, 25), 200)) offset greatest(0, coalesce(p_offset, 0));
end;
$$;

create or replace function public.platform_user_detail(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare
  result jsonb;
begin
  if not private.platform_dashboard_allowed() then raise exception 'Platform dashboard access denied' using errcode = '42501'; end if;
  select jsonb_build_object(
    'user', jsonb_build_object(
      'id', u.id, 'email', u.email, 'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at,
      'email_confirmed_at', u.email_confirmed_at, 'provider', coalesce(u.raw_app_meta_data ->> 'provider', 'email'),
      'providers', coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb), 'banned_until', u.banned_until,
      'full_name', nullif(trim(coalesce(profile.first_name, '') || ' ' || coalesce(profile.last_name, '')), ''), 'phone', profile.phone),
    'invoices_total', (select count(*) from public.invoices invoice where invoice.user_id = u.id),
    'last_invoice_at', (select max(invoice.created_at) from public.invoices invoice where invoice.user_id = u.id),
    'devices', (select coalesce(jsonb_agg(jsonb_build_object('platform', device.platform, 'language', device.language, 'last_seen_at', device.last_seen_at, 'is_active', device.is_active) order by device.last_seen_at desc nulls last), '[]'::jsonb)
                from public.operix_push_device_tokens device where device.user_id = u.id),
    'memberships', (select coalesce(jsonb_agg(jsonb_build_object(
        'company_id', company.id, 'company_name', coalesce(company.company_name, company.name, 'Unnamed'), 'role', member.role, 'status', member.status,
        'joined_at', member.created_at, 'is_root', company.parent_company_id is null,
        'root_company_id', coalesce(private.invoice_billing_root_company_id(company.id), company.id),
        'cloud_status', private.platform_cloud_status(company.id),
        'members', (select count(*) from public.memberships other where other.company_id = company.id and coalesce(other.status, 'active') = 'active'),
        'invoices_30d', (select count(*) from public.invoices invoice where invoice.company_id = company.id and invoice.created_at > now() - interval '30 days'),
        'subscription', (select jsonb_build_object('product', account.product, 'status', account.status, 'interval', account.billing_interval, 'trial_ends_at', account.trial_ends_at, 'current_period_end', account.current_period_end, 'stripe', account.stripe_subscription_id is not null)
                         from public.subscription_accounts account where account.company_id = coalesce(private.invoice_billing_root_company_id(company.id), company.id) and account.product in ('invoice', 'suite') order by case account.status when 'active' then 0 else 1 end limit 1),
        'grants', (select coalesce(jsonb_agg(jsonb_build_object('id', grant_row.id, 'product', grant_row.product, 'type', grant_row.grant_type, 'reason', grant_row.reason, 'expires_at', grant_row.expires_at, 'created_at', grant_row.created_at)), '[]'::jsonb)
                   from public.subscription_manual_grants grant_row where grant_row.company_id = coalesce(private.invoice_billing_root_company_id(company.id), company.id) and grant_row.revoked_at is null and (grant_row.expires_at is null or grant_row.expires_at > now()))
      ) order by member.created_at), '[]'::jsonb)
      from public.memberships member join public.companies company on company.id = member.company_id where member.user_id = u.id)
  ) into result
  from auth.users u left join public.profiles profile on profile.id = u.id where u.id = p_user_id;
  if result is null then raise exception 'User not found' using errcode = 'P0002'; end if;
  return result;
end;
$$;

-- ---------------------------------------------------------------- OperiX Cloud access
create or replace function public.platform_grant_cloud_access(p_company_id uuid, p_plan text, p_reason text, p_expires_at timestamptz default null)
returns uuid language plpgsql security definer set search_path to '' as $$
declare
  root_id uuid;
  grant_id uuid;
  reason_text text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not private.platform_dashboard_allowed() then raise exception 'Platform dashboard access denied' using errcode = '42501'; end if;
  if p_plan not in ('invoice', 'suite') then raise exception 'Choose the Invoice or Suite plan' using errcode = '22023'; end if;
  if reason_text is null or char_length(reason_text) < 3 then raise exception 'A reason of at least 3 characters is required' using errcode = '22023'; end if;
  if p_expires_at is not null and p_expires_at <= now() then raise exception 'The end date must be in the future' using errcode = '22023'; end if;
  root_id := coalesce(private.invoice_billing_root_company_id(p_company_id), p_company_id);
  if not exists (select 1 from public.companies where id = root_id) then raise exception 'Workspace not found' using errcode = 'P0002'; end if;
  -- Only one active grant per product: replace the existing one.
  update public.subscription_manual_grants set revoked_at = now(), revoked_by = auth.uid(), updated_at = now()
  where company_id = root_id and product = p_plan and revoked_at is null;
  grant_id := public.control_create_product_manual_grant(root_id, p_plan, 'complimentary', reason_text, p_expires_at, 'active');
  insert into public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, new_values, reason, occurred_at)
  values (root_id, auth.uid(), 'platform.cloud_access_granted', 'subscription_manual_grant', grant_id,
          jsonb_build_object('plan', p_plan, 'expires_at', p_expires_at), reason_text, clock_timestamp());
  return grant_id;
end;
$$;

create or replace function public.platform_revoke_cloud_access(p_grant_id uuid, p_reason text)
returns void language plpgsql security definer set search_path to '' as $$
declare
  root_id uuid;
  reason_text text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not private.platform_dashboard_allowed() then raise exception 'Platform dashboard access denied' using errcode = '42501'; end if;
  if reason_text is null or char_length(reason_text) < 3 then raise exception 'A reason of at least 3 characters is required' using errcode = '22023'; end if;
  select company_id into root_id from public.subscription_manual_grants where id = p_grant_id;
  perform public.control_revoke_product_manual_grant(p_grant_id, reason_text);
  insert into public.audit_events (company_id, actor_user_id, action, entity_type, entity_id, reason, occurred_at)
  values (root_id, auth.uid(), 'platform.cloud_access_revoked', 'subscription_manual_grant', p_grant_id, reason_text, clock_timestamp());
end;
$$;

revoke all on function public.platform_dashboard_access(), public.platform_stats(), public.platform_list_users(text, integer, integer), public.platform_user_detail(uuid),
  public.platform_grant_cloud_access(uuid, text, text, timestamptz), public.platform_revoke_cloud_access(uuid, text) from public, anon;
grant execute on function public.platform_dashboard_access(), public.platform_stats(), public.platform_list_users(text, integer, integer), public.platform_user_detail(uuid),
  public.platform_grant_cloud_access(uuid, text, text, timestamptz), public.platform_revoke_cloud_access(uuid, text) to authenticated;
