-- Repair confirmed signup accounts whose workspace creation was interrupted.
-- Only users with an explicit tenant/company name in signup metadata are
-- repaired automatically; accounts without that information remain available
-- through the workspace recovery screen so a tenant is never guessed.

do $$
declare
  signup record;
  new_company_id uuid;
begin
  for signup in
    select
      u.id,
      u.email,
      trim(coalesce(
        u.raw_user_meta_data ->> 'tenant_name',
        u.raw_user_meta_data ->> 'company_name',
        ''
      )) as tenant_name
    from auth.users u
    where u.email_confirmed_at is not null
      and trim(coalesce(
        u.raw_user_meta_data ->> 'tenant_name',
        u.raw_user_meta_data ->> 'company_name',
        ''
      )) <> ''
      and not exists (
        select 1
        from public.memberships m
        where m.user_id = u.id
          and m.status = 'active'
      )
  loop
    insert into public.companies (company_name, owner_id)
    values (signup.tenant_name, signup.id)
    returning id into new_company_id;

    insert into public.memberships (user_id, company_id, role, status)
    values (signup.id, new_company_id, 'owner', 'active');

    -- The accounting initializer checks the trusted user's auth.uid().
    -- Scope the claim to this repair iteration only.
    perform set_config('request.jwt.claim.sub', signup.id::text, true);
    insert into public.company_app_entitlements (
      company_id,
      app_key,
      enabled,
      enabled_at,
      updated_by
    )
    values (new_company_id, 'invoice', true, clock_timestamp(), signup.id)
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
    values (signup.id, signup.email)
    on conflict (id) do nothing;

    perform set_config('app.company_link_workflow', 'authorized', true);
    perform set_config('app.active_company_switch', 'authorized', true);
    update public.profiles
    set company_id = new_company_id,
        active_company_id = new_company_id,
        company_name = signup.tenant_name,
        updated_at = clock_timestamp()
    where id = signup.id;
    perform set_config('app.company_link_workflow', '', true);
    perform set_config('app.active_company_switch', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
  end loop;
end
$$;
