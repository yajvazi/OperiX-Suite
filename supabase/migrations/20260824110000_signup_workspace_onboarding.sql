-- Complete the signup workspace handoff.
--
-- Signup previously created an auth user and, in some paths, a company
-- membership, but did not link the new profile to the active company. That
-- left the first Home load without a usable tenant context.

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text;

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

  -- These relationships are server-owned and protected by profile triggers.
  -- Set the workflow guards only inside this trusted creation function.
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

create or replace function public.complete_signup_onboarding(
  p_tenant_name text,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_tax_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  account_email text;
  company_result jsonb;
  new_company_id uuid;
  existing_company_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if nullif(trim(p_tenant_name), '') is null then
    raise exception 'Tenant name is required' using errcode = '23514';
  end if;

  select email into account_email
  from auth.users
  where id = current_user_id;

  select active_company_id into existing_company_id
  from public.profiles
  where id = current_user_id;

  if existing_company_id is not null and (
    exists (
      select 1
      from public.companies company
      where company.id = existing_company_id
        and company.owner_id = current_user_id
    )
    or exists (
      select 1
      from public.memberships membership
      where membership.user_id = current_user_id
        and membership.company_id = existing_company_id
        and coalesce(membership.status, 'active') = 'active'
    )
  ) then
    select jsonb_build_object('id', company.id, 'company_name', company.company_name)
      into company_result
    from public.companies company
    where company.id = existing_company_id;
  else
    company_result := public.create_company_and_owner(trim(p_tenant_name));
  end if;
  new_company_id := (company_result ->> 'id')::uuid;

  perform set_config('app.company_link_workflow', 'authorized', true);
  perform set_config('app.active_company_switch', 'authorized', true);
  update public.profiles
  set first_name = nullif(trim(p_first_name), ''),
      last_name = nullif(trim(p_last_name), ''),
      phone = nullif(trim(p_phone), ''),
      email = coalesce(nullif(trim(account_email), ''), email),
      company_name = trim(p_tenant_name),
      tax_id = nullif(trim(p_tax_id), ''),
      company_id = new_company_id,
      active_company_id = new_company_id,
      updated_at = clock_timestamp()
  where id = current_user_id;
  perform set_config('app.company_link_workflow', '', true);
  perform set_config('app.active_company_switch', '', true);

  update public.companies
  set email = coalesce(nullif(trim(account_email), ''), email),
      phone = nullif(trim(p_phone), ''),
      tax_id = nullif(trim(p_tax_id), ''),
      updated_at = clock_timestamp()
  where id = new_company_id;

  return company_result || jsonb_build_object(
    'first_name', nullif(trim(p_first_name), ''),
    'last_name', nullif(trim(p_last_name), '')
  );
end
$$;

revoke all on function public.create_company_and_owner(text) from public, anon;
revoke all on function public.complete_signup_onboarding(text, text, text, text, text) from public, anon;
grant execute on function public.create_company_and_owner(text) to authenticated;
grant execute on function public.complete_signup_onboarding(text, text, text, text, text) to authenticated;

-- Repair profiles created by older signup/company flows so existing accounts
-- can open Home without having to create a duplicate tenant.
do $$
begin
  perform set_config('app.company_link_workflow', 'authorized', true);
  perform set_config('app.active_company_switch', 'authorized', true);
  update public.profiles profile
  set company_id = membership.company_id,
      active_company_id = membership.company_id,
      updated_at = clock_timestamp()
  from (
    select distinct on (user_id) user_id, company_id
    from public.memberships
    where coalesce(status, 'active') = 'active'
    order by user_id, created_at
  ) membership
  where profile.id = membership.user_id
    and (profile.company_id is null or profile.active_company_id is null);
  perform set_config('app.company_link_workflow', '', true);
  perform set_config('app.active_company_switch', '', true);
end
$$;
