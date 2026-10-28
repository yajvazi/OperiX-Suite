-- New workspaces must enable the Invoice app before the accounting seed runs.
-- initialize_company_accounting checks accounts.manage through that entitlement.

create or replace function public.create_company_and_owner(p_company_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_company_id uuid;
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if nullif(trim(p_company_name), '') is null then
    raise exception 'Company name is required' using errcode = '23514';
  end if;

  insert into public.companies (company_name, owner_id)
  values (trim(p_company_name), current_user_id)
  returning id into new_company_id;

  insert into public.memberships (user_id, company_id, role, status)
  values (current_user_id, new_company_id, 'owner', 'active');

  insert into public.company_app_entitlements (
    company_id,
    app_key,
    enabled,
    enabled_at,
    updated_by
  )
  values (new_company_id, 'invoice', true, clock_timestamp(), current_user_id)
  on conflict (company_id, app_key) do update
    set enabled = true,
        enabled_at = excluded.enabled_at,
        disabled_at = null,
        updated_at = clock_timestamp(),
        updated_by = excluded.updated_by;

  perform public.initialize_company_accounting(
    new_company_id,
    date_trunc('year', current_date)::date,
    'xk-operix-base-v1'
  );

  insert into public.profiles (id, email)
  select current_user_id, email
  from auth.users
  where id = current_user_id
  on conflict (id) do nothing;

  perform set_config('app.company_link_workflow', 'authorized', true);
  perform set_config('app.active_company_switch', 'authorized', true);
  update public.profiles
  set company_id = new_company_id,
      active_company_id = new_company_id,
      company_name = trim(p_company_name),
      updated_at = clock_timestamp()
  where id = current_user_id;
  perform set_config('app.company_link_workflow', '', true);
  perform set_config('app.active_company_switch', '', true);

  return jsonb_build_object(
    'id', new_company_id,
    'company_name', trim(p_company_name)
  );
end
$$;

revoke all on function public.create_company_and_owner(text) from public, anon;
grant execute on function public.create_company_and_owner(text) to authenticated;
