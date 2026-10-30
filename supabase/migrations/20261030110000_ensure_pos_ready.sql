-- A company's first POS sale needs the transactional-POS flag, a branch and an
-- active terminal. Nothing created them, so checkout failed with "Transactional
-- POS is not enabled" / "An active POS terminal is required". The POS screen now
-- calls this once per company; it only fills in what is missing.

begin;

create or replace function public.ensure_pos_ready(p_company_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  branch_id_value uuid;
  terminal_id_value uuid;
  company_label text;
begin
  if p_company_id is null
     or not (select private.is_company_member(p_company_id))
     or not (select private.has_company_permission(p_company_id, 'pos.complete')) then
    raise exception 'Insufficient permission to set up POS' using errcode = '42501';
  end if;

  insert into public.company_feature_flags (company_id, flag, enabled, updated_by)
  values (p_company_id, 'transactional_pos_enabled', true, (select auth.uid()))
  on conflict (company_id, flag) do update
    set enabled = true, updated_at = now(), updated_by = excluded.updated_by
    where public.company_feature_flags.enabled = false;

  select id into terminal_id_value
  from public.pos_terminals
  where company_id = p_company_id and status = 'active'
  order by created_at
  limit 1;
  if terminal_id_value is not null then return terminal_id_value; end if;

  select id into branch_id_value
  from public.branches
  where company_id = p_company_id and is_active
  order by is_head_office desc, created_at
  limit 1;

  if branch_id_value is null then
    select coalesce(nullif(trim(company.company_name), ''), 'Main') into company_label
    from public.companies company where company.id = p_company_id;
    insert into public.branches (company_id, code, name, country_code, is_head_office, is_active, created_by)
    values (p_company_id, 'MAIN', coalesce(company_label, 'Main'), 'XK', true, true, (select auth.uid()))
    on conflict do nothing
    returning id into branch_id_value;
    if branch_id_value is null then
      select id into branch_id_value from public.branches where company_id = p_company_id order by created_at limit 1;
    end if;
  end if;

  insert into public.pos_terminals (company_id, branch_id, code, name, status, created_by)
  values (p_company_id, branch_id_value, 'POS-1', 'Main counter', 'active', (select auth.uid()))
  on conflict (company_id, code) do update set status = 'active'
  returning id into terminal_id_value;
  return terminal_id_value;
end;
$$;

revoke all on function public.ensure_pos_ready(uuid) from public, anon;
grant execute on function public.ensure_pos_ready(uuid) to authenticated;

commit;
