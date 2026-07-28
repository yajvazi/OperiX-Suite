\set ON_ERROR_STOP on

do $$
declare
  missing_objects text[];
begin
  select array_agg(required.name order by required.name)
  into missing_objects
  from (
    values
      ('public.pos_orders'),
      ('public.pos_order_lines'),
      ('public.pos_payments'),
      ('public.pos_command_idempotency'),
      ('public.receipt_render_snapshots'),
      ('public.cashier_shifts'),
      ('public.cashier_shift_movements'),
      ('public.held_orders'),
      ('public.fiscal_provider_configs'),
      ('public.fiscal_transactions'),
      ('public.fiscal_submission_attempts'),
      ('public.fiscal_reconciliation_events'),
      ('public.device_registrations'),
      ('public.offline_sync_batches'),
      ('public.offline_sync_items')
  ) required(name)
  where to_regclass(required.name) is null;

  if missing_objects is not null then
    raise exception 'Missing Phase E relations: %', missing_objects;
  end if;
end
$$;

do $$
declare
  missing_functions text[];
begin
  select array_agg(required.name order by required.name)
  into missing_functions
  from (
    values
      ('public.complete_pos_sale(uuid,uuid,uuid,jsonb,jsonb,text,text,uuid,timestamp with time zone)'),
      ('public.open_cashier_shift(uuid,uuid,numeric,text)'),
      ('public.submit_cashier_shift_count(uuid,uuid,numeric,text,text)'),
      ('public.approve_cashier_shift_close(uuid,uuid,text)'),
      ('public.reopen_cashier_shift(uuid,uuid,text)'),
      ('public.hold_pos_order(uuid,uuid,uuid,jsonb,timestamp with time zone)'),
      ('public.resume_held_pos_order(uuid,uuid,integer)'),
      ('public.process_mock_fiscal_transaction(uuid,text)'),
      ('public.register_pos_device(uuid,uuid,text,text,text,text,text,text,jsonb)'),
      ('public.create_offline_sync_batch(uuid,uuid)'),
      ('public.submit_offline_pos_sale(uuid,uuid,uuid,uuid,uuid,bigint,integer,text,text,jsonb)')
  ) required(name)
  where to_regprocedure(required.name) is null;

  if missing_functions is not null then
    raise exception 'Missing Phase E commands: %', missing_functions;
  end if;
end
$$;

do $$
declare
  relation_name text;
  rls_enabled boolean;
begin
  foreach relation_name in array array[
    'pos_orders',
    'pos_order_lines',
    'pos_payments',
    'cashier_shifts',
    'held_orders',
    'fiscal_transactions',
    'device_registrations',
    'offline_sync_batches',
    'offline_sync_items'
  ]
  loop
    select relrowsecurity
    into rls_enabled
    from pg_class
    where oid = ('public.' || relation_name)::regclass;

    if not coalesce(rls_enabled, false) then
      raise exception 'RLS is not enabled on public.%', relation_name;
    end if;
  end loop;
end
$$;

do $$
declare
  risky_enabled integer;
begin
  select count(*)
  into risky_enabled
  from public.company_feature_flags
  where flag in (
    'transactional_pos_enabled',
    'cashier_shifts_enabled',
    'fiscal_provider_enabled',
    'mock_fiscal_provider_enabled',
    'offline_pos_enabled',
    'device_registration_enabled',
    'pos_returns_enabled'
  )
  and enabled;

  if risky_enabled > 0 then
    raise exception 'One or more risky Phase E flags are enabled before release approval';
  end if;
end
$$;

select 'Phase E foundation schema checks passed' as result;
