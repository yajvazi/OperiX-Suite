-- Automatic OperiX Intelligence preferences, cached commentary, and in-app alerts.
-- Deterministic financial calculations remain in application/database logic;
-- the commentary table stores only short summaries of already-computed metrics.

begin;

alter table public.ai_settings
  add column if not exists intelligence_enabled boolean not null default true,
  add column if not exists invoice_alerts_enabled boolean not null default true,
  add column if not exists customer_insights_enabled boolean not null default true,
  add column if not exists inventory_alerts_enabled boolean not null default true,
  add column if not exists sales_insights_enabled boolean not null default true,
  add column if not exists payment_alerts_enabled boolean not null default true,
  add column if not exists push_notifications_enabled boolean not null default true,
  add column if not exists show_amounts_in_notifications boolean not null default true;

create table if not exists public.ai_intelligence_commentary (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  fingerprint text not null check (char_length(fingerprint) between 1 and 128),
  preferred_language text not null check (preferred_language in ('en', 'sq')),
  commentary text not null check (char_length(commentary) between 1 and 800),
  source_metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(source_metrics) = 'object'),
  generated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '6 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, company_id, fingerprint, preferred_language)
);

create table if not exists public.operix_intelligence_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  insight_key text not null check (char_length(insight_key) between 1 and 240),
  category text not null check (category in ('invoice', 'customer', 'inventory', 'sales', 'payment', 'duplicate')),
  priority text not null check (priority in ('info', 'attention', 'important')),
  title text not null check (char_length(title) between 1 and 180),
  body text not null check (char_length(body) between 1 and 800),
  target_type text not null check (target_type in ('invoice', 'customer', 'product', 'invoices', 'products', 'expenses', 'sales', 'payments', 'notifications')),
  target_id uuid,
  target_params jsonb not null default '{}'::jsonb check (jsonb_typeof(target_params) = 'object'),
  read_at timestamptz,
  dismissed_at timestamptz,
  resolved_at timestamptz,
  last_surfaced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, company_id, insight_key)
);

create index if not exists ai_intelligence_commentary_lookup_idx
  on public.ai_intelligence_commentary(user_id, company_id, preferred_language, expires_at desc);
create index if not exists operix_intelligence_notifications_user_state_idx
  on public.operix_intelligence_notifications(user_id, company_id, dismissed_at, resolved_at, created_at desc);

alter table public.ai_intelligence_commentary enable row level security;
alter table public.operix_intelligence_notifications enable row level security;

drop policy if exists ai_intelligence_commentary_select on public.ai_intelligence_commentary;
create policy ai_intelligence_commentary_select on public.ai_intelligence_commentary
for select to authenticated
using ((select auth.uid()) = user_id and public.can_access_company(company_id));

drop policy if exists ai_intelligence_commentary_insert on public.ai_intelligence_commentary;
create policy ai_intelligence_commentary_insert on public.ai_intelligence_commentary
for insert to authenticated
with check ((select auth.uid()) = user_id and public.can_access_company(company_id));

drop policy if exists ai_intelligence_commentary_update on public.ai_intelligence_commentary;
create policy ai_intelligence_commentary_update on public.ai_intelligence_commentary
for update to authenticated
using ((select auth.uid()) = user_id and public.can_access_company(company_id))
with check ((select auth.uid()) = user_id and public.can_access_company(company_id));

drop policy if exists ai_intelligence_commentary_delete on public.ai_intelligence_commentary;
create policy ai_intelligence_commentary_delete on public.ai_intelligence_commentary
for delete to authenticated
using ((select auth.uid()) = user_id and public.can_access_company(company_id));

drop policy if exists operix_intelligence_notifications_select on public.operix_intelligence_notifications;
create policy operix_intelligence_notifications_select on public.operix_intelligence_notifications
for select to authenticated
using ((select auth.uid()) = user_id and public.can_access_company(company_id));

drop policy if exists operix_intelligence_notifications_insert on public.operix_intelligence_notifications;
create policy operix_intelligence_notifications_insert on public.operix_intelligence_notifications
for insert to authenticated
with check ((select auth.uid()) = user_id and public.can_access_company(company_id));

drop policy if exists operix_intelligence_notifications_update on public.operix_intelligence_notifications;
create policy operix_intelligence_notifications_update on public.operix_intelligence_notifications
for update to authenticated
using ((select auth.uid()) = user_id and public.can_access_company(company_id))
with check ((select auth.uid()) = user_id and public.can_access_company(company_id));

drop policy if exists operix_intelligence_notifications_delete on public.operix_intelligence_notifications;
create policy operix_intelligence_notifications_delete on public.operix_intelligence_notifications
for delete to authenticated
using ((select auth.uid()) = user_id and public.can_access_company(company_id));

revoke all on public.ai_intelligence_commentary, public.operix_intelligence_notifications from anon;
grant select, insert, update, delete on public.ai_intelligence_commentary, public.operix_intelligence_notifications to authenticated;

-- A security-definer check protects the deployment-wide automatic commentary
-- budget without exposing cross-tenant usage rows to the mobile client.
create or replace function public.operix_intelligence_global_budget_available(p_limit integer default 200)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  used_count integer;
begin
  if (select auth.uid()) is null then
    return false;
  end if;
  select count(*)::integer into used_count
  from public.ai_usage
  where conversation_id is null
    and created_at >= date_trunc('day', now() at time zone 'utc');
  return used_count < greatest(coalesce(p_limit, 0), 0);
end;
$$;

revoke all on function public.operix_intelligence_global_budget_available(integer) from public, anon;
grant execute on function public.operix_intelligence_global_budget_available(integer) to authenticated;

commit;
