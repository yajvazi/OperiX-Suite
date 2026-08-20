-- Tenant-scoped Expo push tokens for invoice-created notifications.
-- A token is stored per user/company pair so a device can safely switch
-- accounts and a user can belong to more than one tenant.

begin;

create table if not exists public.operix_push_device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  expo_push_token text not null check (char_length(expo_push_token) between 10 and 512),
  platform text not null check (platform in ('ios', 'android', 'web')),
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, company_id, expo_push_token)
);

create index if not exists operix_push_device_tokens_company_idx
  on public.operix_push_device_tokens(company_id, is_active, user_id);

alter table public.operix_push_device_tokens enable row level security;

drop policy if exists operix_push_device_tokens_select on public.operix_push_device_tokens;
create policy operix_push_device_tokens_select on public.operix_push_device_tokens
for select to authenticated
using ((select auth.uid()) = user_id and public.can_access_company(company_id));

drop policy if exists operix_push_device_tokens_insert on public.operix_push_device_tokens;
create policy operix_push_device_tokens_insert on public.operix_push_device_tokens
for insert to authenticated
with check ((select auth.uid()) = user_id and public.can_access_company(company_id));

drop policy if exists operix_push_device_tokens_update on public.operix_push_device_tokens;
create policy operix_push_device_tokens_update on public.operix_push_device_tokens
for update to authenticated
using ((select auth.uid()) = user_id and public.can_access_company(company_id))
with check ((select auth.uid()) = user_id and public.can_access_company(company_id));

drop policy if exists operix_push_device_tokens_delete on public.operix_push_device_tokens;
create policy operix_push_device_tokens_delete on public.operix_push_device_tokens
for delete to authenticated
using ((select auth.uid()) = user_id and public.can_access_company(company_id));

revoke all on public.operix_push_device_tokens from anon;
grant select, insert, update, delete on public.operix_push_device_tokens to authenticated;

create table if not exists public.operix_notification_delivery_keys (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null,
  notification_type text not null,
  created_at timestamptz not null default now(),
  unique (company_id, user_id, event_key)
);

create index if not exists operix_notification_delivery_keys_lookup_idx
  on public.operix_notification_delivery_keys(company_id, user_id, created_at desc);

alter table public.operix_notification_delivery_keys enable row level security;
revoke all on public.operix_notification_delivery_keys from anon, authenticated;

commit;
