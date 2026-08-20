\set ON_ERROR_STOP on

begin;

do $$
declare
  table_name text;
  missing text[];
begin
  select array_agg(required.name order by required.name)
  into missing
  from (values
    ('public.fiscal_installations'),
    ('public.fiscal_certificates'),
    ('public.fiscal_configuration_history'),
    ('public.fiscal_transaction_events'),
    ('public.fiscal_receipts')
  ) required(name)
  where to_regclass(required.name) is null;
  if missing is not null then raise exception 'Missing EFS relations: %', missing; end if;

  foreach table_name in array array[
    'fiscal_installations','fiscal_certificates','fiscal_configuration_history',
    'fiscal_transaction_events','fiscal_receipts'
  ] loop
    if not (select relrowsecurity from pg_class where oid=('public.' || table_name)::regclass) then
      raise exception 'RLS is not enabled on public.%', table_name;
    end if;
  end loop;
end
$$;

do $$
declare
  function_def text;
begin
  if to_regprocedure('public.assert_efs_production_ready(uuid,uuid)') is null then
    raise exception 'Hard EFS production guard is missing';
  end if;
  select pg_get_functiondef('public.assert_efs_production_ready(uuid,uuid)'::regprocedure)
  into function_def;
  if position('false' in lower(function_def)) = 0 then
    raise exception 'Production certification gate is not closed';
  end if;
  select pg_get_functiondef('public.can_access_company(uuid)'::regprocedure)
  into function_def;
  if position('active_company_id' in lower(function_def)) > 0 then
    raise exception 'Authorization still depends on active_company_id';
  end if;
  select pg_get_functiondef('public.resolve_invoice_qr(text)'::regprocedure)
  into function_def;
  if position('public_qr_token' in lower(function_def)) = 0
     or position('length(trim(invoice_number_input)) < 32' in lower(function_def)) = 0 then
    raise exception 'Public QR resolver still accepts enumerable invoice numbers';
  end if;
end
$$;

do $$
declare
  unsafe_config_count integer;
  enabled_production_count integer;
begin
  select count(*) into unsafe_config_count
  from public.fiscal_provider_configs
  where lower(configuration::text) ~ '(private[_-]?key|secret|password|credential|access[_-]?token|refresh[_-]?token|-----begin)';
  if unsafe_config_count > 0 then raise exception 'Secret-looking fiscal configuration exists'; end if;

  select count(*) into enabled_production_count
  from public.fiscal_installations
  where production_enabled;
  if enabled_production_count > 0 then raise exception 'Production EFS is enabled in a local readiness database'; end if;
end
$$;

do $$
declare
  policy_count integer;
begin
  select count(*) into policy_count
  from pg_policies
  where schemaname='public'
    and tablename in ('fiscal_installations','fiscal_certificates','fiscal_configuration_history','fiscal_transaction_events','fiscal_receipts');
  if policy_count < 5 then raise exception 'EFS RLS policies are incomplete'; end if;
end
$$;

-- A direct active-company mutation must be rejected by the trigger. The test
-- only runs when the local fixture has a profile and rolls back immediately.
do $$
declare
  profile_id uuid;
  target_company uuid := gen_random_uuid();
begin
  select id into profile_id from public.profiles limit 1;
  if profile_id is not null then
    perform set_config('request.jwt.claim.sub', profile_id::text, true);
    begin
      update public.profiles set active_company_id=target_company where id=profile_id;
      raise exception 'Direct active-company mutation was accepted';
    exception when others then
      if sqlstate <> '42501' then raise; end if;
    end;
    begin
      update public.profiles set company_id=target_company where id=profile_id;
      raise exception 'Direct profile company mutation was accepted';
    exception when others then
      if sqlstate <> '42501' then raise; end if;
    end;
  end if;
end
$$;

do $$
declare
  function_def text;
begin
  select pg_get_functiondef('public.resolve_invoice_qr(text)'::regprocedure)
    into function_def;
  if position('invoice_id' in lower(function_def)) = 0 then
    raise exception 'QR resolver is not invoice-scoped';
  end if;
  select pg_get_functiondef('public.get_customer_portal_data(text)'::regprocedure)
    into function_def;
  if position('to_jsonb(c)' in lower(function_def)) > 0 then
    raise exception 'Portal still serializes an unrestricted company row';
  end if;
end
$$;

rollback;

select 'Kosovo EFS readiness schema, guard, RLS, secret-boundary, and active-company tests passed' as result;
