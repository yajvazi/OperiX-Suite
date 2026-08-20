-- OperiX CRM integration foundation.
-- Twenty owns its CRM database; these tables store only cross-system links,
-- sanitized event envelopes, and operational audit metadata in OperiX.

create table if not exists public.integration_entity_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.companies(id) on delete restrict,
  source_system text not null,
  source_entity_type text not null,
  source_entity_id text not null,
  target_system text not null,
  target_entity_type text not null,
  target_entity_id text,
  sync_status text not null default 'pending'
    check (sync_status in ('pending', 'processing', 'linked', 'skipped', 'failed')),
  last_synced_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, source_system, source_entity_type, source_entity_id),
  unique (organization_id, target_system, target_entity_type, target_entity_id)
);

create index if not exists integration_entity_links_target_lookup_idx
  on public.integration_entity_links (organization_id, target_system, target_entity_type, target_entity_id);
create index if not exists integration_entity_links_status_idx
  on public.integration_entity_links (organization_id, sync_status, updated_at desc);

create table if not exists public.integration_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.companies(id) on delete restrict,
  event_type text not null,
  source_system text not null,
  source_entity_type text,
  source_entity_id text,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  status text not null default 'received'
    check (status in ('received', 'processing', 'processed', 'skipped', 'failed', 'paused', 'rejected')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (idempotency_key)
);

create index if not exists integration_events_org_status_idx
  on public.integration_events (organization_id, status, created_at desc);
create index if not exists integration_events_source_lookup_idx
  on public.integration_events (source_system, source_entity_type, source_entity_id, created_at desc);

create table if not exists public.integration_audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.companies(id) on delete restrict,
  event_id uuid references public.integration_events(id) on delete set null,
  action text not null,
  outcome text not null check (outcome in ('started', 'succeeded', 'failed', 'skipped')),
  correlation_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists integration_audit_logs_org_created_idx
  on public.integration_audit_logs (organization_id, created_at desc);

alter table public.integration_entity_links enable row level security;
alter table public.integration_events enable row level security;
alter table public.integration_audit_logs enable row level security;

drop policy if exists "Integration links are visible to company members" on public.integration_entity_links;
create policy "Integration links are visible to company members"
  on public.integration_entity_links
  for select to authenticated
  using (public.can_access_company(organization_id));

drop policy if exists "Integration events are visible to company members" on public.integration_events;
create policy "Integration events are visible to company members"
  on public.integration_events
  for select to authenticated
  using (organization_id is not null and public.can_access_company(organization_id));

drop policy if exists "Integration audit is visible to company members" on public.integration_audit_logs;
create policy "Integration audit is visible to company members"
  on public.integration_audit_logs
  for select to authenticated
  using (organization_id is not null and public.can_access_company(organization_id));

revoke all on public.integration_entity_links from anon, authenticated;
revoke all on public.integration_events from anon, authenticated;
revoke all on public.integration_audit_logs from anon, authenticated;
grant select on public.integration_entity_links to authenticated;
grant select on public.integration_events to authenticated;
grant select on public.integration_audit_logs to authenticated;
