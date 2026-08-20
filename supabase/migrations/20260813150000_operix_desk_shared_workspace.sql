-- OperiX Desk shared account, company scope, permissions, realtime, and
-- reservation safety. This is additive: legacy Desk integer ids and routes are
-- intentionally retained so reservation ownership can be mapped in place.

alter table public.users
  add column if not exists supabase_user_id text,
  add column if not exists company_id text;

alter table public.resources
  add column if not exists company_id text;

alter table public.reservations
  add column if not exists company_id text;

alter table public.floor_plans
  add column if not exists company_id text;

alter table public.favorites
  add column if not exists company_id text;

alter table public.audit_logs
  add column if not exists company_id text;

create unique index if not exists operix_desk_users_supabase_user_id_unique
  on public.users (supabase_user_id)
  where supabase_user_id is not null;

create index if not exists operix_desk_users_company_id_idx
  on public.users (company_id);
create index if not exists operix_desk_resources_company_scope_idx
  on public.resources (company_id, is_active, type, floor);
create index if not exists operix_desk_reservations_company_scope_idx
  on public.reservations (company_id, date, status);
create index if not exists operix_desk_floor_plans_company_scope_idx
  on public.floor_plans (company_id, floor);
create unique index if not exists operix_desk_floor_plans_company_floor_unique
  on public.floor_plans (company_id, floor)
  where company_id is not null;
create index if not exists operix_desk_audit_company_scope_idx
  on public.audit_logs (company_id, created_at desc);

-- The old migration removes uq_resource_date to permit room time slots. Keep
-- all-day resources safe at the database boundary; timed-room overlap and the
-- user/day rules are additionally serialized by the FastAPI booking service.
create unique index if not exists operix_desk_active_all_day_resource_unique
  on public.reservations (resource_id, date)
  where status = 'active' and start_time is null and end_time is null;

-- Map legacy Desk users to the shared Supabase Auth identity when the email is
-- already present. This does not change passwords or delete any Desk rows.
update public.users desk_user
set supabase_user_id = auth_user.id::text
from auth.users auth_user
where desk_user.supabase_user_id is null
  and lower(desk_user.email) = lower(auth_user.email);

-- A single-company installation is unambiguous. Multi-company installations
-- remain nullable until the operator sets DESK_DEFAULT_COMPANY_ID and the
-- backend's explicit migration command scopes the legacy rows.
do $$
declare
  only_company text;
begin
  select min(company.id::text)
    into only_company
  from public.companies company
  having count(*) = 1;

  if only_company is not null then
    update public.users set company_id = only_company where company_id is null;
    update public.resources set company_id = only_company where company_id is null;
    update public.floor_plans set company_id = only_company where company_id is null;
    update public.reservations reservation
    set company_id = coalesce(reservation.company_id, resource.company_id)
    from public.resources resource
    where reservation.resource_id = resource.id
      and reservation.company_id is null;
    update public.favorites favorite
    set company_id = coalesce(favorite.company_id, resource.company_id)
    from public.resources resource
    where favorite.resource_id = resource.id
      and favorite.company_id is null;
    update public.audit_logs log
    set company_id = coalesce(log.company_id, actor.company_id)
    from public.users actor
    where log.actor_id = actor.id
      and log.company_id is null;
  end if;
end
$$;

-- Shared OperiX permission vocabulary. Existing role rows are reused; these
-- grants are additive and do not alter Invoice/HR/Booking permissions.
insert into public.app_permissions (code, name, category, description, is_sensitive)
values
  ('desk.reserve', 'Reserve workspace resources', 'desk', 'Create and change eligible Desk reservations.', false),
  ('desk.cancel_own', 'Cancel own Desk reservations', 'desk', 'Cancel the signed-in user''s active reservations.', false),
  ('desk.view_floor', 'View workplace floor plans', 'desk', 'View floors, resource availability, and team locations.', false),
  ('reservation.read_all', 'View all Desk reservations', 'desk', 'View reservation data for the current company.', false),
  ('reservation.manage', 'Manage Desk reservations', 'desk', 'Create, edit, and cancel reservations for other users.', true),
  ('floor.read', 'View Desk floors', 'desk', 'View workplace floor plans.', false),
  ('floor.manage', 'Manage Desk floors', 'desk', 'Upload and edit floor plans and positions.', true),
  ('resource.read', 'View Desk resources', 'desk', 'View desks, rooms, and amenities.', false),
  ('resource.manage', 'Manage Desk resources', 'desk', 'Create, edit, and retire Desk resources.', true),
  ('team.read', 'View Desk teams', 'desk', 'View team attendance and locations.', false),
  ('team.manage', 'Manage Desk teams', 'desk', 'Assign and manage workplace teams.', true),
  ('analytics.read', 'View Desk analytics', 'desk', 'View occupancy and resource utilization.', false),
  ('audit.read', 'View Desk audit log', 'desk', 'View protected Desk administrative activity.', true),
  ('workspace.manage', 'Manage Desk workspace', 'desk', 'Manage Desk reservation and workspace settings.', true)
on conflict (code) do update
set name = excluded.name,
    category = excluded.category,
    description = excluded.description,
    is_sensitive = excluded.is_sensitive;

insert into public.app_roles (company_id, code, name, description, is_system)
values
  (null, 'desk_admin', 'Desk administrator', 'Full OperiX Desk workspace administration.', true),
  (null, 'workspace_manager', 'Workspace manager', 'Desk occupancy, resources, reservations, and analytics.', true),
  (null, 'team_manager', 'Team manager', 'Desk team attendance and team reservations.', true)
on conflict (code) where company_id is null do update
set name = excluded.name,
    description = excluded.description,
    is_system = true;

insert into public.app_role_permissions (role_id, permission_code)
select role.id, permission.code
from public.app_roles role
cross join public.app_permissions permission
where role.company_id is null
  and role.code in ('owner', 'super_administrator', 'company_administrator', 'desk_admin')
  and permission.category = 'desk'
on conflict do nothing;

insert into public.app_role_permissions (role_id, permission_code)
select role.id, permission.code
from public.app_roles role
join public.app_permissions permission
  on permission.code in (
    'desk.reserve', 'desk.cancel_own', 'desk.view_floor', 'reservation.read_all',
    'reservation.manage', 'floor.read', 'resource.read', 'team.read',
    'analytics.read', 'workspace.manage'
  )
where role.company_id is null
  and role.code = 'workspace_manager'
on conflict do nothing;

insert into public.app_role_permissions (role_id, permission_code)
select role.id, permission.code
from public.app_roles role
join public.app_permissions permission
  on permission.code in (
    'desk.reserve', 'desk.cancel_own', 'desk.view_floor', 'floor.read',
    'resource.read', 'team.read', 'team.manage', 'reservation.read_all'
  )
where role.company_id is null
  and role.code = 'team_manager'
on conflict do nothing;

-- Defense-in-depth for direct authenticated Supabase clients. FastAPI still
-- applies the same company and permission checks because its connection pool
-- is not the caller's JWT/RLS session.
alter table public.resources enable row level security;
alter table public.reservations enable row level security;
alter table public.floor_plans enable row level security;
alter table public.favorites enable row level security;
alter table public.audit_logs enable row level security;
-- The legacy Desk users table contains password-hash compatibility fields and
-- is intentionally deny-by-default for direct Supabase clients. FastAPI reads
-- it through its server-side database connection after Auth authorization.
alter table public.users enable row level security;

drop policy if exists operix_desk_resources_select on public.resources;
create policy operix_desk_resources_select on public.resources
for select to authenticated
using (company_id is not null and public.can_access_company(company_id::uuid));

drop policy if exists operix_desk_resources_manage on public.resources;
create policy operix_desk_resources_manage on public.resources
for all to authenticated
using (company_id is not null and private.has_company_permission(company_id::uuid, 'resource.manage'))
with check (company_id is not null and private.has_company_permission(company_id::uuid, 'resource.manage'));

drop policy if exists operix_desk_floor_plans_select on public.floor_plans;
create policy operix_desk_floor_plans_select on public.floor_plans
for select to authenticated
using (company_id is not null and public.can_access_company(company_id::uuid));

drop policy if exists operix_desk_floor_plans_manage on public.floor_plans;
create policy operix_desk_floor_plans_manage on public.floor_plans
for all to authenticated
using (company_id is not null and private.has_company_permission(company_id::uuid, 'floor.manage'))
with check (company_id is not null and private.has_company_permission(company_id::uuid, 'floor.manage'));

drop policy if exists operix_desk_reservations_select on public.reservations;
create policy operix_desk_reservations_select on public.reservations
for select to authenticated
using (company_id is not null and public.can_access_company(company_id::uuid));

drop policy if exists operix_desk_reservations_insert on public.reservations;
create policy operix_desk_reservations_insert on public.reservations
for insert to authenticated
with check (
  company_id is not null
  and public.can_access_company(company_id::uuid)
  and private.desk_user_matches_auth(user_id, company_id::uuid)
);

drop policy if exists operix_desk_reservations_update on public.reservations;
create policy operix_desk_reservations_update on public.reservations
for update to authenticated
using (
  company_id is not null
  and public.can_access_company(company_id::uuid)
  and (
    private.desk_user_matches_auth(user_id, company_id::uuid)
    or private.has_company_permission(company_id::uuid, 'reservation.manage')
  )
)
with check (company_id is not null and public.can_access_company(company_id::uuid));

drop policy if exists operix_desk_reservations_delete on public.reservations;
create policy operix_desk_reservations_delete on public.reservations
for delete to authenticated
using (
  company_id is not null
  and public.can_access_company(company_id::uuid)
  and (
    private.desk_user_matches_auth(user_id, company_id::uuid)
    or private.has_company_permission(company_id::uuid, 'reservation.manage')
  )
);

drop policy if exists operix_desk_favorites_manage on public.favorites;
create policy operix_desk_favorites_manage on public.favorites
for all to authenticated
using (
  company_id is not null
  and public.can_access_company(company_id::uuid)
  and private.desk_user_matches_auth(user_id, company_id::uuid)
)
with check (company_id is not null and public.can_access_company(company_id::uuid));

drop policy if exists operix_desk_audit_select on public.audit_logs;
create policy operix_desk_audit_select on public.audit_logs
for select to authenticated
using (company_id is not null and private.has_company_permission(company_id::uuid, 'audit.read'));

-- Enable realtime updates for floor/resource/reservation changes when the
-- publication is available. The guarded blocks keep local Supabase projects
-- without the publication usable during migration development.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'resources') then
      alter publication supabase_realtime add table public.resources;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reservations') then
      alter publication supabase_realtime add table public.reservations;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'floor_plans') then
      alter publication supabase_realtime add table public.floor_plans;
    end if;
  end if;
end
$$;

comment on column public.users.supabase_user_id is 'Shared OperiX Supabase Auth user id; legacy Desk password remains only for migration compatibility.';
comment on column public.users.company_id is 'Shared OperiX company/organization scope.';
