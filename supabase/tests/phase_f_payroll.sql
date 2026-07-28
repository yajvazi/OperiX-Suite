\set ON_ERROR_STOP on

do $$
declare missing_objects text[];
begin
  select array_agg(required.name order by required.name) into missing_objects
  from (values
    ('public.employee_compensation_profiles'),
    ('public.employee_tax_profiles'),
    ('public.employee_pension_profiles'),
    ('public.employee_bank_accounts'),
    ('public.payroll_config_sets'),
    ('public.payroll_tax_brackets'),
    ('public.payroll_pension_rules'),
    ('public.payroll_periods'),
    ('public.payroll_runs'),
    ('public.payroll_input_snapshots'),
    ('public.payroll_run_employees'),
    ('public.payroll_calculation_lines'),
    ('public.payroll_adjustments'),
    ('public.payslip_snapshots'),
    ('public.payroll_liabilities'),
    ('public.payroll_payment_batches'),
    ('public.payroll_payment_lines'),
    ('public.payroll_exports')
  ) required(name)
  where to_regclass(required.name) is null;
  if missing_objects is not null then
    raise exception 'Missing Phase F relations: %', missing_objects;
  end if;
end $$;

do $$
declare missing_functions text[];
begin
  select array_agg(required.name order by required.name) into missing_functions
  from (values
    ('public.create_payroll_period(uuid,text,text,date,date,date,uuid)'),
    ('public.create_payroll_run(uuid,uuid,uuid,text,uuid,uuid,text,uuid)'),
    ('public.import_payroll_inputs(uuid,uuid,text,text,text[],boolean,timestamptz,text,jsonb)'),
    ('public.save_payroll_calculation(uuid,uuid,uuid,uuid,uuid,jsonb,jsonb)'),
    ('public.submit_payroll_for_review(uuid)'),
    ('public.approve_payroll_run(uuid,text)'),
    ('public.finalize_payroll_run(uuid,text,text)'),
    ('public.create_payroll_payment_batch(uuid,uuid,date,text,uuid[])'),
    ('public.approve_payroll_payment_batch(uuid,text)'),
    ('public.record_payroll_payment(uuid,uuid,text,timestamptz,text)'),
    ('public.reverse_payroll_run(uuid,text,text)'),
    ('public.access_payroll_payslip(uuid,text)'),
    ('public.record_payroll_export(uuid,text,text,jsonb,text,text)'),
    ('public.add_payroll_adjustment(uuid,uuid,text,numeric,text,uuid)'),
    ('public.approve_payroll_adjustment(uuid,boolean,text)')
  ) required(name)
  where to_regprocedure(required.name) is null;
  if missing_functions is not null then
    raise exception 'Missing Phase F commands: %', missing_functions;
  end if;
end $$;

do $$
declare relation_name text; rls_enabled boolean;
begin
  foreach relation_name in array array[
    'employee_compensation_profiles','employee_tax_profiles','employee_pension_profiles',
    'employee_bank_accounts','payroll_config_sets','payroll_periods','payroll_runs',
    'payroll_input_snapshots','payroll_run_employees','payroll_adjustments',
    'payslip_snapshots','payslip_access_logs','payroll_liabilities',
    'payroll_payment_batches','payroll_payment_lines','payroll_exports'
  ] loop
    select relrowsecurity into rls_enabled
    from pg_class where oid=('public.'||relation_name)::regclass;
    if not coalesce(rls_enabled,false) then
      raise exception 'RLS is not enabled on public.%', relation_name;
    end if;
  end loop;
end $$;

do $$
declare risky_enabled integer;
begin
  select count(*) into risky_enabled
  from public.company_feature_flags
  where flag in (
    'payroll_enabled','kosovo_payroll_enabled','payroll_hr_import_enabled',
    'attendance_payroll_enabled','leave_payroll_enabled','overtime_payroll_enabled',
    'payroll_approvals_enabled','payslip_portal_enabled','payroll_accounting_enabled',
    'payroll_bank_exports_enabled','payroll_statutory_exports_enabled',
    'supplemental_payroll_enabled'
  ) and enabled;
  if risky_enabled > 0 then
    raise exception 'One or more Phase F flags are enabled before company approval';
  end if;
end $$;

do $$
declare trigger_count integer;
begin
  select count(*) into trigger_count
  from pg_trigger
  where not tgisinternal
    and tgname in (
      'payroll_runs_immutable','payroll_run_employees_immutable',
      'payroll_input_snapshots_immutable','payroll_calculation_lines_immutable',
      'payslip_snapshots_immutable','payroll_liabilities_immutable'
    );
  if trigger_count <> 6 then
    raise exception 'Expected six Phase F immutable triggers, found %',trigger_count;
  end if;
end $$;

select 'Phase F payroll foundation schema checks passed' as result;
