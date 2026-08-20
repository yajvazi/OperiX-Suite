-- Safe company removal for the workspace administration flow.
--
-- Companies are tenant roots for financial, inventory, payroll, and audit
-- records. Removing a company from the workspace must therefore be a
-- reversible archive, not a cascading DELETE.

alter table public.companies
  add column if not exists archived_at timestamptz;

create index if not exists companies_archived_at_idx
  on public.companies (archived_at)
  where archived_at is null;

drop policy if exists companies_member_select on public.companies;
create policy companies_member_select
on public.companies
for select
to authenticated
using (
  archived_at is null
  and (select public.can_access_company(id))
);

create or replace function public.archive_company(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  company_row public.companies%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_company_id is null then
    raise exception 'Company is required' using errcode = '23514';
  end if;

  if not private.has_company_permission(p_company_id, 'company.manage') then
    raise exception 'You do not have permission to remove this company'
      using errcode = '42501';
  end if;

  select *
  into company_row
  from public.companies
  where id = p_company_id
  for update;

  if company_row.id is null then
    raise exception 'Company was not found' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.companies child
    where child.parent_company_id = p_company_id
      and child.archived_at is null
  ) then
    raise exception 'Remove or move all active subdivisions before removing this company'
      using errcode = '23514';
  end if;

  if company_row.archived_at is null then
    update public.companies
    set archived_at = clock_timestamp(),
        updated_at = clock_timestamp(),
        updated_by = (select auth.uid())
    where id = p_company_id;
  end if;

  -- Do not leave any user pointing at a company that is no longer in the
  -- active workspace list. The authorized setting is required by the
  -- active-company guard trigger. A null preference is safe: the app can
  -- show the remaining accessible companies and the user can choose one.
  perform set_config('app.active_company_switch', 'authorized', true);
  update public.profiles
  set active_company_id = null,
      updated_at = clock_timestamp()
  where active_company_id = p_company_id;
  perform set_config('app.active_company_switch', '', true);

  return jsonb_build_object(
    'id', company_row.id,
    'company_name', company_row.company_name,
    'archived_at', coalesce(company_row.archived_at, clock_timestamp())
  );
end;
$$;

revoke all on function public.archive_company(uuid) from public, anon;
grant execute on function public.archive_company(uuid) to authenticated;
