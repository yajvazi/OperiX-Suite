alter table public.resources
add column if not exists restricted_to_team_leaders boolean not null default false;
