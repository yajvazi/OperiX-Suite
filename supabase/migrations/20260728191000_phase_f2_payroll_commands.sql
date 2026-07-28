-- OperiX Invoice Phase F2
-- Tenant-safe payroll commands, atomic finalization, liabilities and payments.

begin;

create or replace function private.payroll_feature_enabled(p_company_id uuid, p_flag text)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((
    select enabled from public.company_feature_flags
    where company_id=p_company_id and flag=p_flag
  ),false)
$$;
revoke all on function private.payroll_feature_enabled(uuid,text) from public;
grant execute on function private.payroll_feature_enabled(uuid,text) to authenticated,service_role;

create or replace function private.record_payroll_audit(
  p_company_id uuid,
  p_branch_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_previous jsonb,
  p_new jsonb,
  p_reason text default null
) returns public.audit_events
language plpgsql security definer set search_path='' as $$
declare result public.audit_events;
begin
  insert into public.audit_events(
    company_id,branch_id,actor_user_id,action,entity_type,entity_id,
    previous_values,new_values,reason
  ) values (
    p_company_id,p_branch_id,(select auth.uid()),p_action,p_entity_type,p_entity_id,
    coalesce(p_previous,'{}'::jsonb),coalesce(p_new,'{}'::jsonb),p_reason
  ) returning * into result;
  return result;
end $$;
revoke all on function private.record_payroll_audit(uuid,uuid,text,text,uuid,jsonb,jsonb,text) from public;

create or replace function public.create_payroll_period(
  p_company_id uuid,
  p_code text,
  p_name text,
  p_starts_on date,
  p_ends_on date,
  p_payment_date date,
  p_payroll_group_id uuid default null
) returns public.payroll_periods
language plpgsql security definer set search_path='' as $$
declare result public.payroll_periods;
begin
  if not (select private.payroll_feature_enabled(p_company_id,'payroll_enabled'))
     or not (select private.has_company_permission(p_company_id,'payroll.period.manage')) then
    raise exception 'Payroll is disabled or permission is missing' using errcode='42501';
  end if;
  if p_ends_on < p_starts_on then
    raise exception 'Payroll period end must not precede start' using errcode='23514';
  end if;
  insert into public.payroll_periods(
    company_id,payroll_group_id,code,name,starts_on,ends_on,payment_date,created_by,updated_by
  ) values (
    p_company_id,p_payroll_group_id,trim(p_code),trim(p_name),p_starts_on,p_ends_on,p_payment_date,
    (select auth.uid()),(select auth.uid())
  ) returning * into result;
  perform private.record_payroll_audit(p_company_id,null,'payroll.period.created','payroll_period',result.id,null,to_jsonb(result),null);
  return result;
end $$;

create or replace function public.create_payroll_run(
  p_company_id uuid,
  p_payroll_period_id uuid,
  p_config_set_id uuid,
  p_idempotency_key text,
  p_branch_id uuid default null,
  p_payroll_group_id uuid default null,
  p_run_type text default 'regular',
  p_original_run_id uuid default null
) returns public.payroll_runs
language plpgsql security definer set search_path='' as $$
declare
  result public.payroll_runs;
  period_row public.payroll_periods;
  config_row public.payroll_config_sets;
  next_number bigint;
begin
  if not (select private.payroll_feature_enabled(p_company_id,'payroll_enabled'))
     or not (select private.has_company_permission(p_company_id,'payroll.run.create')) then
    raise exception 'Payroll is disabled or permission is missing' using errcode='42501';
  end if;
  if trim(coalesce(p_idempotency_key,''))='' then
    raise exception 'Idempotency key is required' using errcode='23514';
  end if;
  select * into result from public.payroll_runs
  where company_id=p_company_id and idempotency_key=p_idempotency_key;
  if found then return result; end if;
  select * into period_row from public.payroll_periods
  where id=p_payroll_period_id and company_id=p_company_id and status in ('open','processing','reopened')
  for update;
  if not found then raise exception 'Open payroll period not found' using errcode='P0002'; end if;
  select * into config_row from public.payroll_config_sets
  where id=p_config_set_id and company_id=p_company_id and status='approved'
    and effective_from<=period_row.ends_on
    and (effective_until is null or effective_until>=period_row.starts_on);
  if not found then raise exception 'Approved effective payroll configuration not found' using errcode='P0002'; end if;
  if p_run_type<>'regular' and not (select private.payroll_feature_enabled(p_company_id,'supplemental_payroll_enabled')) then
    raise exception 'Supplemental payroll is disabled' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||':payroll-run:'||extract(year from period_row.ends_on)::text,0));
  select coalesce(max(nullif(regexp_replace(run_number,'^PAY-[0-9]{4}-',''),'')::bigint),0)+1
  into next_number from public.payroll_runs
  where company_id=p_company_id and run_number like 'PAY-'||extract(year from period_row.ends_on)::text||'-%';
  insert into public.payroll_runs(
    company_id,branch_id,payroll_period_id,payroll_group_id,config_set_id,run_number,run_type,
    original_run_id,currency,idempotency_key,created_by,updated_by
  ) values (
    p_company_id,p_branch_id,p_payroll_period_id,p_payroll_group_id,p_config_set_id,
    'PAY-'||extract(year from period_row.ends_on)::text||'-'||lpad(next_number::text,6,'0'),
    p_run_type,p_original_run_id,config_row.currency,p_idempotency_key,(select auth.uid()),(select auth.uid())
  ) returning * into result;
  update public.payroll_periods set status='processing',updated_at=now(),updated_by=(select auth.uid())
  where id=p_payroll_period_id and status in ('open','reopened');
  perform private.record_payroll_audit(p_company_id,p_branch_id,'payroll.run.created','payroll_run',result.id,null,to_jsonb(result),null);
  perform private.emit_domain_outbox_event(p_company_id,p_branch_id,'payroll_run',result.id,'payroll.run.created',
    jsonb_build_object('runNumber',result.run_number,'runType',result.run_type),p_idempotency_key||':created');
  return result;
end $$;

create or replace function public.import_payroll_inputs(
  p_payroll_run_id uuid,
  p_employee_id uuid,
  p_input_type text,
  p_source_application text,
  p_source_record_ids text[],
  p_source_approved boolean,
  p_source_timestamp timestamptz,
  p_configuration_version text,
  p_payload jsonb
) returns public.payroll_input_snapshots
language plpgsql security definer set search_path='' as $$
declare run_row public.payroll_runs; result public.payroll_input_snapshots; checksum_value text;
begin
  select * into run_row from public.payroll_runs where id=p_payroll_run_id for update;
  if not found then raise exception 'Payroll run not found' using errcode='P0002'; end if;
  if not (select private.has_company_permission(run_row.company_id,'payroll.hr_inputs.import')) then
    raise exception 'Insufficient permission to import payroll inputs' using errcode='42501';
  end if;
  if run_row.status not in ('draft','collecting_inputs','calculated','calculation_failed') then
    raise exception 'Payroll inputs cannot be changed in state %',run_row.status using errcode='55000';
  end if;
  if p_source_application<>'operix_invoice' and not (select private.payroll_feature_enabled(run_row.company_id,'payroll_hr_import_enabled')) then
    raise exception 'HR payroll input import is disabled' using errcode='42501';
  end if;
  checksum_value:=encode(digest(convert_to(coalesce(p_payload,'{}'::jsonb)::text,'UTF8'),'sha256'),'hex');
  update public.payroll_input_snapshots set status='superseded'
  where payroll_run_id=p_payroll_run_id and employee_id=p_employee_id and input_type=p_input_type
    and status not in ('superseded','locked_in_payroll');
  insert into public.payroll_input_snapshots(
    company_id,payroll_run_id,employee_id,input_type,source_application,source_record_ids,
    source_approved,source_timestamp,imported_by,configuration_version,status,payload,checksum
  ) values (
    run_row.company_id,p_payroll_run_id,p_employee_id,p_input_type,p_source_application,
    coalesce(p_source_record_ids,'{}'),p_source_approved,p_source_timestamp,(select auth.uid()),
    p_configuration_version,case when p_source_approved then 'validated' else 'imported' end,
    coalesce(p_payload,'{}'::jsonb),checksum_value
  ) returning * into result;
  update public.payroll_runs set status='collecting_inputs',updated_at=now(),updated_by=(select auth.uid())
  where id=p_payroll_run_id;
  perform private.record_payroll_audit(run_row.company_id,run_row.branch_id,'payroll.input.imported','payroll_input_snapshot',result.id,null,
    jsonb_build_object('inputType',p_input_type,'sourceApplication',p_source_application,'checksum',checksum_value),null);
  return result;
end $$;

create or replace function public.save_payroll_calculation(
  p_payroll_run_id uuid,
  p_employee_id uuid,
  p_compensation_profile_id uuid,
  p_tax_profile_id uuid,
  p_pension_profile_id uuid,
  p_result jsonb,
  p_lines jsonb
) returns public.payroll_run_employees
language plpgsql security definer set search_path='' as $$
declare run_row public.payroll_runs; result public.payroll_run_employees; line jsonb; line_number integer:=0;
begin
  select * into run_row from public.payroll_runs where id=p_payroll_run_id for update;
  if not found then raise exception 'Payroll run not found' using errcode='P0002'; end if;
  if not (select private.has_company_permission(run_row.company_id,'payroll.run.calculate')) then
    raise exception 'Insufficient permission to calculate payroll' using errcode='42501';
  end if;
  if run_row.status not in ('draft','collecting_inputs','calculated','calculation_failed') then
    raise exception 'Payroll cannot be calculated in state %',run_row.status using errcode='55000';
  end if;
  if jsonb_array_length(coalesce(p_result->'errors','[]'::jsonb))>0 then
    raise exception 'Payroll result contains blocking errors' using errcode='23514';
  end if;
  insert into public.payroll_run_employees(
    company_id,payroll_run_id,employee_id,compensation_profile_id,tax_profile_id,pension_profile_id,
    branch_id,department,cost_centre_id,project_id,status,base_earnings,additional_earnings,
    taxable_earnings,non_taxable_earnings,gross_pay,pensionable_base,employee_pension,
    employer_pension,taxable_income,personal_income_tax,other_deductions,net_salary,employer_cost,
    calculation_metadata,warnings,errors,calculated_at
  )
  select
    run_row.company_id,p_payroll_run_id,p_employee_id,p_compensation_profile_id,p_tax_profile_id,p_pension_profile_id,
    employee.branch_id,employee.department,employee.cost_centre_id,employee.project_id,'calculated',
    (p_result->>'baseEarnings')::numeric,(p_result->>'additionalEarnings')::numeric,
    (p_result->>'taxableEarnings')::numeric,(p_result->>'nonTaxableEarnings')::numeric,
    (p_result->>'grossPay')::numeric,(p_result->>'pensionableBase')::numeric,
    (p_result->>'employeePension')::numeric,(p_result->>'employerPension')::numeric,
    (p_result->>'taxableIncome')::numeric,(p_result->>'personalIncomeTax')::numeric,
    (p_result->>'otherDeductions')::numeric,(p_result->>'netSalary')::numeric,
    (p_result->>'employerCost')::numeric,coalesce(p_result->'metadata','{}'::jsonb),
    coalesce(p_result->'warnings','[]'::jsonb),coalesce(p_result->'errors','[]'::jsonb),now()
  from public.employees employee
  where employee.id=p_employee_id and employee.company_id=run_row.company_id
  on conflict(payroll_run_id,employee_id) do update set
    compensation_profile_id=excluded.compensation_profile_id,tax_profile_id=excluded.tax_profile_id,
    pension_profile_id=excluded.pension_profile_id,status='calculated',
    base_earnings=excluded.base_earnings,additional_earnings=excluded.additional_earnings,
    taxable_earnings=excluded.taxable_earnings,non_taxable_earnings=excluded.non_taxable_earnings,
    gross_pay=excluded.gross_pay,pensionable_base=excluded.pensionable_base,
    employee_pension=excluded.employee_pension,employer_pension=excluded.employer_pension,
    taxable_income=excluded.taxable_income,personal_income_tax=excluded.personal_income_tax,
    other_deductions=excluded.other_deductions,net_salary=excluded.net_salary,
    employer_cost=excluded.employer_cost,calculation_metadata=excluded.calculation_metadata,
    warnings=excluded.warnings,errors=excluded.errors,calculated_at=now()
  returning * into result;
  if result.id is null then raise exception 'Employee does not belong to payroll company' using errcode='23514'; end if;
  delete from public.payroll_calculation_lines where payroll_run_employee_id=result.id;
  for line in select value from jsonb_array_elements(coalesce(p_lines,'[]'::jsonb)) loop
    line_number:=line_number+1;
    insert into public.payroll_calculation_lines(
      company_id,payroll_run_employee_id,line_number,kind,code,label,amount,taxable,pensionable,
      accounting_mapping_code,source_reference,metadata
    ) values (
      run_row.company_id,result.id,line_number,line->>'kind',line->>'code',line->>'label',
      (line->>'amount')::numeric,coalesce((line->>'taxable')::boolean,false),
      coalesce((line->>'pensionable')::boolean,false),line->>'accountingMappingCode',
      line->>'sourceReference',coalesce(line->'metadata','{}'::jsonb)
    );
  end loop;
  update public.payroll_runs set status='calculated',calculated_at=now(),updated_at=now(),updated_by=(select auth.uid())
  where id=p_payroll_run_id;
  return result;
end $$;

create or replace function public.submit_payroll_for_review(p_payroll_run_id uuid)
returns public.payroll_runs language plpgsql security definer set search_path='' as $$
declare result public.payroll_runs;
begin
  select * into result from public.payroll_runs where id=p_payroll_run_id for update;
  if not found then raise exception 'Payroll run not found' using errcode='P0002'; end if;
  if not (select private.has_company_permission(result.company_id,'payroll.run.review')) then raise exception 'Insufficient permission' using errcode='42501'; end if;
  if result.status<>'calculated' then raise exception 'Only calculated payroll may be reviewed' using errcode='55000'; end if;
  if exists(select 1 from public.payroll_run_employees where payroll_run_id=result.id and status='error') then
    raise exception 'Payroll contains blocking employee errors' using errcode='23514';
  end if;
  update public.payroll_runs set status='under_review',updated_at=now(),updated_by=(select auth.uid())
  where id=result.id returning * into result;
  return result;
end $$;

create or replace function public.approve_payroll_run(p_payroll_run_id uuid,p_reason text)
returns public.payroll_runs language plpgsql security definer set search_path='' as $$
declare result public.payroll_runs;
begin
  select * into result from public.payroll_runs where id=p_payroll_run_id for update;
  if not found then raise exception 'Payroll run not found' using errcode='P0002'; end if;
  if not (select private.has_company_permission(result.company_id,'payroll.run.approve')) then raise exception 'Insufficient permission' using errcode='42501'; end if;
  if result.status not in ('under_review','pending_approval') then raise exception 'Payroll is not awaiting approval' using errcode='55000'; end if;
  if trim(coalesce(p_reason,''))='' then raise exception 'Approval reason is required' using errcode='23514'; end if;
  insert into public.payroll_approvals(company_id,payroll_run_id,stage,sequence,status,action_by,action_at,reason)
  values(result.company_id,result.id,'final_authorization',50,'approved',(select auth.uid()),now(),trim(p_reason))
  on conflict(payroll_run_id,stage) do update set status='approved',action_by=(select auth.uid()),action_at=now(),reason=excluded.reason;
  update public.payroll_runs set status='approved',approved_at=now(),approved_by=(select auth.uid()),updated_at=now(),updated_by=(select auth.uid())
  where id=result.id returning * into result;
  perform private.record_payroll_audit(result.company_id,result.branch_id,'payroll.run.approved','payroll_run',result.id,null,to_jsonb(result),p_reason);
  perform private.emit_domain_outbox_event(result.company_id,result.branch_id,'payroll_run',result.id,'payroll.run.approved',
    jsonb_build_object('runNumber',result.run_number),result.idempotency_key||':approved');
  return result;
end $$;

create or replace function private.payroll_mapping_account(
  p_company_id uuid,p_code text,p_posting_date date,p_branch_id uuid
) returns uuid language plpgsql stable security definer set search_path='' as $$
declare result uuid;
begin
  select account_id into result from public.payroll_posting_mappings
  where company_id=p_company_id and mapping_code=p_code and active
    and effective_from<=p_posting_date and (effective_until is null or effective_until>=p_posting_date)
    and (branch_id is null or branch_id=p_branch_id)
  order by (branch_id is not null) desc,effective_from desc limit 1;
  if result is null then raise exception 'Missing effective payroll posting mapping: %',p_code using errcode='P0002'; end if;
  return result;
end $$;

create or replace function public.finalize_payroll_run(
  p_payroll_run_id uuid,p_idempotency_key text,p_reason text
) returns public.payroll_runs
language plpgsql security definer set search_path='' as $$
declare
  result public.payroll_runs;
  period_row public.payroll_periods;
  accounting_period_row public.accounting_periods;
  journal_row public.journal_entries;
  employee_row record;
  line_number integer:=0;
  payment_date date;
begin
  select * into result from public.payroll_runs where id=p_payroll_run_id for update;
  if not found then raise exception 'Payroll run not found' using errcode='P0002'; end if;
  if result.status in ('finalized','payment_pending','partially_paid','paid') then return result; end if;
  if trim(coalesce(p_idempotency_key,''))='' then raise exception 'Finalization idempotency key is required' using errcode='23514'; end if;
  if trim(coalesce(p_reason,''))='' then raise exception 'Finalization reason is required' using errcode='23514'; end if;
  if not (select private.payroll_feature_enabled(result.company_id,'payroll_enabled'))
     or not (select private.payroll_feature_enabled(result.company_id,'payroll_accounting_enabled'))
     or not (select private.has_company_permission(result.company_id,'payroll.run.finalize'))
     or not (select private.has_company_permission(result.company_id,'journal.post')) then
    raise exception 'Payroll accounting is disabled or permission is missing' using errcode='42501';
  end if;
  if result.status<>'approved' then raise exception 'Only approved payroll may be finalized' using errcode='55000'; end if;
  if exists(select 1 from public.payroll_run_employees where payroll_run_id=result.id and jsonb_array_length(errors)>0) then
    raise exception 'Payroll contains blocking calculation errors' using errcode='23514';
  end if;
  if not exists(select 1 from public.payroll_run_employees where payroll_run_id=result.id and status='calculated') then
    raise exception 'Payroll has no calculated employees' using errcode='23514';
  end if;
  select * into period_row from public.payroll_periods where id=result.payroll_period_id;
  payment_date:=period_row.payment_date;
  if not exists(
    select 1
    from public.payroll_config_sets config
    where config.id=result.config_set_id
      and config.company_id=result.company_id
      and config.status='approved'
      and payment_date between config.effective_from and coalesce(config.effective_until,'infinity'::date)
  ) then
    raise exception 'The payroll configuration is not approved or effective for the payment date' using errcode='55000';
  end if;
  select * into accounting_period_row from public.accounting_periods
  where company_id=result.company_id and payment_date between start_date and end_date and status='open'
  for update;
  if not found then raise exception 'Payroll payment date is not in an open accounting period' using errcode='55000'; end if;

  update public.payroll_runs set status='finalizing',updated_at=now(),updated_by=(select auth.uid()) where id=result.id;
  perform set_config('app.payroll_workflow','authorized',true);
  update public.payroll_input_snapshots set status='locked_in_payroll',locked_at=now()
  where payroll_run_id=result.id and status in ('validated','imported');

  select
    coalesce(sum(gross_pay),0),coalesce(sum(employee_pension),0),coalesce(sum(employer_pension),0),
    coalesce(sum(personal_income_tax),0),coalesce(sum(other_deductions),0),coalesce(sum(net_salary),0),
    coalesce(sum(employer_cost),0)
  into result.total_gross,result.total_employee_pension,result.total_employer_pension,
    result.total_tax,result.total_other_deductions,result.total_net,result.total_employer_cost
  from public.payroll_run_employees where payroll_run_id=result.id and status='calculated';

  journal_row:=public.create_journal_entry(
    result.company_id,payment_date,payment_date,'Payroll '||result.run_number,result.run_number,
    result.currency,1,result.branch_id,'automatic'
  );
  update public.journal_entries set source_type='payroll_run',source_id=result.id,source_key=result.run_number,
    metadata=jsonb_build_object('payrollRunId',result.id,'configSetId',result.config_set_id)
  where id=journal_row.id returning * into journal_row;

  line_number:=line_number+1;
  insert into public.journal_entry_lines(journal_entry_id,company_id,line_number,account_id,description,debit,credit,branch_id,created_by)
  values(journal_row.id,result.company_id,line_number,private.payroll_mapping_account(result.company_id,'SALARY_EXPENSE',payment_date,result.branch_id),
    'Gross salaries',result.total_gross,0,result.branch_id,(select auth.uid()));
  if result.total_employer_pension<>0 then
    line_number:=line_number+1;
    insert into public.journal_entry_lines(journal_entry_id,company_id,line_number,account_id,description,debit,credit,branch_id,created_by)
    values(journal_row.id,result.company_id,line_number,private.payroll_mapping_account(result.company_id,'EMPLOYER_PENSION_EXPENSE',payment_date,result.branch_id),
      'Employer pension expense',result.total_employer_pension,0,result.branch_id,(select auth.uid()));
  end if;
  if result.total_employee_pension<>0 then
    line_number:=line_number+1;
    insert into public.journal_entry_lines(journal_entry_id,company_id,line_number,account_id,description,debit,credit,branch_id,created_by)
    values(journal_row.id,result.company_id,line_number,private.payroll_mapping_account(result.company_id,'EMPLOYEE_PENSION_PAYABLE',payment_date,result.branch_id),
      'Employee pension payable',0,result.total_employee_pension,result.branch_id,(select auth.uid()));
  end if;
  if result.total_employer_pension<>0 then
    line_number:=line_number+1;
    insert into public.journal_entry_lines(journal_entry_id,company_id,line_number,account_id,description,debit,credit,branch_id,created_by)
    values(journal_row.id,result.company_id,line_number,private.payroll_mapping_account(result.company_id,'EMPLOYER_PENSION_PAYABLE',payment_date,result.branch_id),
      'Employer pension payable',0,result.total_employer_pension,result.branch_id,(select auth.uid()));
  end if;
  if result.total_tax<>0 then
    line_number:=line_number+1;
    insert into public.journal_entry_lines(journal_entry_id,company_id,line_number,account_id,description,debit,credit,branch_id,created_by)
    values(journal_row.id,result.company_id,line_number,private.payroll_mapping_account(result.company_id,'PERSONAL_INCOME_TAX_PAYABLE',payment_date,result.branch_id),
      'Personal income tax payable',0,result.total_tax,result.branch_id,(select auth.uid()));
  end if;
  if result.total_other_deductions<>0 then
    line_number:=line_number+1;
    insert into public.journal_entry_lines(journal_entry_id,company_id,line_number,account_id,description,debit,credit,branch_id,created_by)
    values(journal_row.id,result.company_id,line_number,private.payroll_mapping_account(result.company_id,'OTHER_DEDUCTION_PAYABLE',payment_date,result.branch_id),
      'Other payroll deductions payable',0,result.total_other_deductions,result.branch_id,(select auth.uid()));
  end if;
  line_number:=line_number+1;
  insert into public.journal_entry_lines(journal_entry_id,company_id,line_number,account_id,description,debit,credit,branch_id,created_by)
  values(journal_row.id,result.company_id,line_number,private.payroll_mapping_account(result.company_id,'NET_SALARY_PAYABLE',payment_date,result.branch_id),
    'Net salary payable',0,result.total_net,result.branch_id,(select auth.uid()));

  journal_row:=public.post_journal_entry(journal_row.id,'Payroll finalization: '||trim(p_reason));

  for employee_row in
    select run_employee.*,employee.first_name,employee.last_name,employee.employee_number,
      employee.job_title,employee.department as employee_department
    from public.payroll_run_employees run_employee
    join public.employees employee on employee.id=run_employee.employee_id
    where run_employee.payroll_run_id=result.id and run_employee.status='calculated'
  loop
    insert into public.payroll_liabilities(
      company_id,payroll_run_id,payroll_run_employee_id,employee_id,liability_type,amount,currency,due_date,journal_entry_id
    ) values (
      result.company_id,result.id,employee_row.id,employee_row.employee_id,'net_salary',employee_row.net_salary,
      result.currency,payment_date,journal_row.id
    );
    insert into public.payslip_snapshots(
      company_id,payroll_run_id,payroll_run_employee_id,employee_id,language,verification_reference,
      snapshot,snapshot_checksum,generated_by
    )
    select
      result.company_id,result.id,employee_row.id,employee_row.employee_id,language_code,
      encode(digest(convert_to(result.id::text||':'||employee_row.employee_id::text||':'||language_code,'UTF8'),'sha256'),'hex'),
      jsonb_build_object(
        'language',language_code,
        'runNumber',result.run_number,'period',jsonb_build_object('name',period_row.name,'startsOn',period_row.starts_on,'endsOn',period_row.ends_on,'paymentDate',payment_date),
        'company',(select jsonb_build_object(
          'legalName',coalesce(company.company_name,company.name),
          'tradeName',company.trade_name,
          'fiscalNumber',company.fiscal_number,
          'uniqueBusinessNumber',company.unique_business_number,
          'vatNumber',company.vat_number,
          'address',coalesce(company.registered_address,company.address),
          'municipality',company.municipality,
          'country',coalesce(company.country_code,company.country),
          'email',company.email,
          'phone',company.phone,
          'logoUrl',company.logo_url
        ) from public.companies company where company.id=result.company_id),
        'employee',jsonb_build_object('id',employee_row.employee_id,'employeeNumber',employee_row.employee_number,'firstName',employee_row.first_name,'lastName',employee_row.last_name,'position',employee_row.job_title,'department',coalesce(employee_row.employee_department,employee_row.department)),
        'currency',result.currency,'grossPay',employee_row.gross_pay,'employeePension',employee_row.employee_pension,
        'employerPension',employee_row.employer_pension,'personalIncomeTax',employee_row.personal_income_tax,
        'otherDeductions',employee_row.other_deductions,'netSalary',employee_row.net_salary,
        'employerCost',employee_row.employer_cost,
        'lines',(select coalesce(jsonb_agg(to_jsonb(line) order by line.line_number),'[]'::jsonb) from public.payroll_calculation_lines line where line.payroll_run_employee_id=employee_row.id),
        'configSetId',result.config_set_id,'finalizedAt',now()
      ),
      encode(digest(convert_to(jsonb_build_object('run',result.id,'employee',employee_row.id,'net',employee_row.net_salary,'language',language_code)::text,'UTF8'),'sha256'),'hex'),
      (select auth.uid())
    from unnest(array['sq'::text,'en'::text]) language_code;
    update public.payroll_run_employees set status='finalized',finalized_at=now() where id=employee_row.id;
  end loop;
  insert into public.payroll_liabilities(company_id,payroll_run_id,liability_type,amount,currency,due_date,journal_entry_id)
  select result.company_id,result.id,kind,amount,result.currency,payment_date,journal_row.id
  from (values
    ('employee_pension'::text,result.total_employee_pension),
    ('employer_pension'::text,result.total_employer_pension),
    ('personal_income_tax'::text,result.total_tax),
    ('other_deduction'::text,result.total_other_deductions)
  ) liability(kind,amount) where amount>0;

  update public.payroll_runs set status='finalized',journal_entry_id=journal_row.id,input_locked_at=now(),
    finalized_at=now(),finalized_by=(select auth.uid()),total_gross=result.total_gross,
    total_employee_pension=result.total_employee_pension,total_employer_pension=result.total_employer_pension,
    total_tax=result.total_tax,total_other_deductions=result.total_other_deductions,total_net=result.total_net,
    total_employer_cost=result.total_employer_cost,updated_at=now(),updated_by=(select auth.uid())
  where id=result.id returning * into result;
  perform private.record_payroll_audit(result.company_id,result.branch_id,'payroll.run.finalized','payroll_run',result.id,null,
    jsonb_build_object('runNumber',result.run_number,'journalEntryId',journal_row.id,'totalNet',result.total_net),p_reason);
  perform private.emit_domain_outbox_event(result.company_id,result.branch_id,'payroll_run',result.id,'payroll.run.finalized',
    jsonb_build_object('runNumber',result.run_number,'journalEntryId',journal_row.id,'totalNet',result.total_net),
    p_idempotency_key||':finalized');
  return result;
end $$;

create or replace function public.create_payroll_payment_batch(
  p_payroll_run_id uuid,p_company_bank_account_id uuid,p_payment_date date,p_idempotency_key text,
  p_employee_ids uuid[] default null
) returns public.payroll_payment_batches
language plpgsql security definer set search_path='' as $$
declare run_row public.payroll_runs; result public.payroll_payment_batches; next_number bigint;
begin
  select * into run_row from public.payroll_runs where id=p_payroll_run_id for update;
  if not found then raise exception 'Payroll run not found' using errcode='P0002'; end if;
  if not (select private.payroll_feature_enabled(run_row.company_id,'payroll_bank_exports_enabled'))
     or not (select private.has_company_permission(run_row.company_id,'payroll.payment_batch.create')) then
    raise exception 'Payroll bank exports are disabled or permission is missing' using errcode='42501';
  end if;
  if run_row.status not in ('finalized','payment_pending','partially_paid') then raise exception 'Payroll is not payable' using errcode='55000'; end if;
  if not exists(select 1 from public.company_bank_accounts where id=p_company_bank_account_id and company_id=run_row.company_id and is_active) then
    raise exception 'Company bank account not found' using errcode='P0002';
  end if;
  select * into result from public.payroll_payment_batches where company_id=run_row.company_id and idempotency_key=p_idempotency_key;
  if found then return result; end if;
  perform pg_advisory_xact_lock(hashtextextended(run_row.company_id::text||':payroll-batch:'||extract(year from p_payment_date)::text,0));
  select count(*)+1 into next_number from public.payroll_payment_batches where company_id=run_row.company_id;
  insert into public.payroll_payment_batches(
    company_id,payroll_run_id,branch_id,company_bank_account_id,batch_number,currency,payment_date,idempotency_key,created_by
  ) values (
    run_row.company_id,run_row.id,run_row.branch_id,p_company_bank_account_id,
    'PB-'||extract(year from p_payment_date)::text||'-'||lpad(next_number::text,6,'0'),
    run_row.currency,p_payment_date,p_idempotency_key,(select auth.uid())
  ) returning * into result;
  insert into public.payroll_payment_lines(company_id,payment_batch_id,liability_id,employee_id,employee_bank_account_id,amount)
  select liability.company_id,result.id,liability.id,liability.employee_id,bank.id,liability.amount-liability.paid_amount
  from public.payroll_liabilities liability
  left join lateral (
    select id from public.employee_bank_accounts
    where company_id=liability.company_id and employee_id=liability.employee_id and is_active
    order by is_primary desc,created_at desc limit 1
  ) bank on true
  where liability.payroll_run_id=run_row.id and liability.liability_type='net_salary'
    and liability.status in ('open','partially_paid')
    and (p_employee_ids is null or liability.employee_id=any(p_employee_ids));
  update public.payroll_payment_batches set total_amount=(
    select coalesce(sum(amount),0) from public.payroll_payment_lines where payment_batch_id=result.id
  ) where id=result.id returning * into result;
  if result.total_amount<=0 then raise exception 'No open salary liabilities were selected' using errcode='23514'; end if;
  update public.payroll_runs set status='payment_pending',updated_at=now(),updated_by=(select auth.uid()) where id=run_row.id;
  perform private.emit_domain_outbox_event(result.company_id,result.branch_id,'payroll_payment_batch',result.id,'payroll.payment_batch.created',
    jsonb_build_object('batchNumber',result.batch_number,'total',result.total_amount),p_idempotency_key||':created');
  return result;
end $$;

create or replace function public.approve_payroll_payment_batch(p_batch_id uuid,p_reason text)
returns public.payroll_payment_batches language plpgsql security definer set search_path='' as $$
declare result public.payroll_payment_batches;
begin
  select * into result from public.payroll_payment_batches where id=p_batch_id for update;
  if not found then raise exception 'Payroll payment batch not found' using errcode='P0002'; end if;
  if not (select private.has_company_permission(result.company_id,'payroll.payment_batch.approve')) then raise exception 'Insufficient permission' using errcode='42501'; end if;
  if result.status<>'draft' then raise exception 'Only draft payment batches may be approved' using errcode='55000'; end if;
  if trim(coalesce(p_reason,''))='' then raise exception 'Approval reason is required' using errcode='23514'; end if;
  update public.payroll_payment_batches set status='approved',approval_state='approved',approved_at=now(),approved_by=(select auth.uid())
  where id=result.id returning * into result;
  perform private.record_payroll_audit(result.company_id,result.branch_id,'payroll.payment_batch.approved','payroll_payment_batch',result.id,null,to_jsonb(result),p_reason);
  return result;
end $$;

create or replace function public.record_payroll_payment(
  p_payment_line_id uuid,p_payment_journal_entry_id uuid,p_external_reference text,p_paid_at timestamptz,p_reason text
) returns public.payroll_payment_lines language plpgsql security definer set search_path='' as $$
declare result public.payroll_payment_lines; liability_row public.payroll_liabilities; batch_row public.payroll_payment_batches; run_row public.payroll_runs;
begin
  select * into result from public.payroll_payment_lines where id=p_payment_line_id for update;
  if not found then raise exception 'Payroll payment line not found' using errcode='P0002'; end if;
  if not (select private.has_company_permission(result.company_id,'payroll.reconcile')) then raise exception 'Insufficient permission' using errcode='42501'; end if;
  if result.status='paid' then return result; end if;
  select * into liability_row from public.payroll_liabilities where id=result.liability_id for update;
  if not exists(select 1 from public.journal_entries where id=p_payment_journal_entry_id and company_id=result.company_id and status='posted') then
    raise exception 'Posted payroll bank-payment journal not found' using errcode='P0002';
  end if;
  perform set_config('app.payroll_workflow','authorized',true);
  update public.payroll_payment_lines set status='paid',payment_journal_entry_id=p_payment_journal_entry_id,
    external_reference=p_external_reference,paid_at=coalesce(p_paid_at,now())
  where id=result.id returning * into result;
  update public.payroll_liabilities set paid_amount=least(amount,paid_amount+result.amount),
    status=case when paid_amount+result.amount>=amount then 'paid' else 'partially_paid' end
  where id=liability_row.id;
  select * into batch_row from public.payroll_payment_batches where id=result.payment_batch_id for update;
  update public.payroll_payment_batches set
    status=case
      when not exists(select 1 from public.payroll_payment_lines where payment_batch_id=batch_row.id and status<>'paid') then 'paid'
      else 'partially_paid' end,
    reconciliation_state=case
      when not exists(select 1 from public.payroll_payment_lines where payment_batch_id=batch_row.id and status<>'paid') then 'reconciled'
      else 'partial' end
  where id=batch_row.id returning * into batch_row;
  select * into run_row from public.payroll_runs where id=batch_row.payroll_run_id for update;
  update public.payroll_runs set
    status=case
      when not exists(select 1 from public.payroll_liabilities where payroll_run_id=run_row.id and status not in ('paid','reversed')) then 'paid'
      else 'partially_paid' end,
    updated_at=now(),updated_by=(select auth.uid())
  where id=run_row.id;
  insert into public.payroll_reconciliation_events(
    company_id,payroll_run_id,payment_batch_id,liability_id,event_type,previous_state,new_state,amount,reason,occurred_by
  ) values (
    result.company_id,run_row.id,batch_row.id,liability_row.id,'payment_recorded',liability_row.status,
    case when liability_row.paid_amount+result.amount>=liability_row.amount then 'paid' else 'partially_paid' end,
    result.amount,p_reason,(select auth.uid())
  );
  perform private.record_payroll_audit(result.company_id,run_row.branch_id,'payroll.payment.recorded','payroll_payment_line',result.id,null,to_jsonb(result),p_reason);
  return result;
end $$;

create or replace function public.reverse_payroll_run(
  p_payroll_run_id uuid,p_idempotency_key text,p_reason text
) returns public.payroll_runs language plpgsql security definer set search_path='' as $$
declare original public.payroll_runs; reversal public.payroll_runs; reversed_journal public.journal_entries;
begin
  select * into original from public.payroll_runs where id=p_payroll_run_id for update;
  if not found then raise exception 'Payroll run not found' using errcode='P0002'; end if;
  if not (select private.has_company_permission(original.company_id,'payroll.run.reverse')) then raise exception 'Insufficient permission' using errcode='42501'; end if;
  if trim(coalesce(p_reason,''))='' then raise exception 'Reversal reason is required' using errcode='23514'; end if;
  if original.status not in ('finalized','payment_pending') then raise exception 'Paid or non-finalized payroll cannot use direct reversal' using errcode='55000'; end if;
  if exists(select 1 from public.payroll_liabilities where payroll_run_id=original.id and paid_amount>0) then
    raise exception 'Payroll with payments requires payment reversal before payroll reversal' using errcode='55000';
  end if;
  select * into reversal from public.payroll_runs where company_id=original.company_id and idempotency_key=p_idempotency_key;
  if found then return reversal; end if;
  reversed_journal:=public.reverse_journal_entry(original.journal_entry_id,current_date,p_reason);
  perform set_config('app.payroll_workflow','authorized',true);
  insert into public.payroll_runs(
    company_id,branch_id,payroll_period_id,payroll_group_id,config_set_id,run_number,run_type,original_run_id,
    status,currency,idempotency_key,journal_entry_id,total_gross,total_employee_pension,total_employer_pension,
    total_tax,total_other_deductions,total_net,total_employer_cost,created_by,updated_by,finalized_at,finalized_by
  ) values (
    original.company_id,original.branch_id,original.payroll_period_id,original.payroll_group_id,original.config_set_id,
    original.run_number||'-REV','reversal',original.id,'finalized',original.currency,p_idempotency_key,reversed_journal.id,
    -original.total_gross,-original.total_employee_pension,-original.total_employer_pension,-original.total_tax,
    -original.total_other_deductions,-original.total_net,-original.total_employer_cost,(select auth.uid()),(select auth.uid()),now(),(select auth.uid())
  ) returning * into reversal;
  update public.payroll_liabilities set status='reversed' where payroll_run_id=original.id;
  update public.payroll_runs set status='reversed',reversal_journal_entry_id=reversed_journal.id,updated_at=now(),updated_by=(select auth.uid())
  where id=original.id;
  perform private.record_payroll_audit(original.company_id,original.branch_id,'payroll.run.reversed','payroll_run',original.id,to_jsonb(original),jsonb_build_object('reversalRunId',reversal.id),p_reason);
  perform private.emit_domain_outbox_event(original.company_id,original.branch_id,'payroll_run',original.id,'payroll.run.reversed',
    jsonb_build_object('reversalRunId',reversal.id,'reversalJournalId',reversed_journal.id),p_idempotency_key||':reversed');
  return reversal;
end $$;

create or replace function public.save_payroll_configuration(
  p_company_id uuid,
  p_name text,
  p_effective_from date,
  p_effective_until date,
  p_rule_source_reference text,
  p_rounding_mode text,
  p_money_scale integer,
  p_tax_brackets jsonb,
  p_pension_rule jsonb,
  p_reason text
) returns public.payroll_config_sets
language plpgsql security definer set search_path='' as $$
declare
  result public.payroll_config_sets;
  next_version integer;
  bracket jsonb;
begin
  if not (select private.has_company_permission(p_company_id,'payroll.configuration.manage')) then
    raise exception 'Insufficient permission' using errcode='42501';
  end if;
  if trim(coalesce(p_reason,''))='' then
    raise exception 'Configuration reason is required' using errcode='23514';
  end if;
  if p_effective_until is not null and p_effective_until<p_effective_from then
    raise exception 'Effective date range is invalid' using errcode='22007';
  end if;
  if p_rounding_mode not in ('half-up','half-even','truncate') or p_money_scale not between 2 and 4 then
    raise exception 'Unsupported payroll rounding configuration' using errcode='23514';
  end if;
  if jsonb_typeof(p_tax_brackets)<>'array' or jsonb_array_length(p_tax_brackets)=0 then
    raise exception 'At least one reviewed tax bracket is required' using errcode='23514';
  end if;
  if coalesce((p_pension_rule->>'employeeRatePercent')::numeric,-1)<0
     or coalesce((p_pension_rule->>'employerRatePercent')::numeric,-1)<0 then
    raise exception 'Reviewed employee and employer pension rates are required' using errcode='23514';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||':payroll-config',0));
  select coalesce(max(version),0)+1 into next_version
  from public.payroll_config_sets where company_id=p_company_id;

  insert into public.payroll_config_sets(
    company_id,code,name,version,effective_from,effective_until,status,rounding_mode,decimal_scale,
    rule_source_reference,created_by,updated_by
  ) values (
    p_company_id,'xk-payroll',trim(p_name),next_version,p_effective_from,p_effective_until,'draft',
    p_rounding_mode,p_money_scale,nullif(trim(coalesce(p_rule_source_reference,'')),''),
    (select auth.uid()),(select auth.uid())
  ) returning * into result;

  for bracket in select value from jsonb_array_elements(p_tax_brackets)
  loop
    insert into public.payroll_tax_brackets(
      company_id,config_set_id,bracket_order,lower_bound,upper_bound,rate_percent,fixed_amount
    ) values (
      p_company_id,result.id,coalesce((bracket->>'sequence')::integer,1),
      coalesce((bracket->>'lowerBound')::numeric,0),(bracket->>'upperBound')::numeric,
      coalesce((bracket->>'ratePercent')::numeric,0),coalesce((bracket->>'fixedAmount')::numeric,0)
    );
  end loop;

  insert into public.payroll_pension_rules(
    company_id,config_set_id,employee_rate_percent,employer_rate_percent,
    minimum_contribution_base,maximum_contribution_base
  ) values (
    p_company_id,result.id,(p_pension_rule->>'employeeRatePercent')::numeric,
    (p_pension_rule->>'employerRatePercent')::numeric,
    (p_pension_rule->>'minimumBase')::numeric,(p_pension_rule->>'maximumBase')::numeric
  );

  perform private.record_payroll_audit(p_company_id,null,'payroll.configuration.created',
    'payroll_config_set',result.id,null,to_jsonb(result),p_reason);
  return result;
end $$;

create or replace function public.approve_payroll_configuration(
  p_config_set_id uuid,
  p_reason text
) returns public.payroll_config_sets
language plpgsql security definer set search_path='' as $$
declare result public.payroll_config_sets;
begin
  select * into result from public.payroll_config_sets where id=p_config_set_id for update;
  if not found then raise exception 'Payroll configuration not found' using errcode='P0002'; end if;
  if not (select private.has_company_permission(result.company_id,'payroll.configuration.manage')) then
    raise exception 'Insufficient permission' using errcode='42501';
  end if;
  if trim(coalesce(p_reason,''))='' or result.rule_source_reference is null then
    raise exception 'Approval reason and legal source reference are required' using errcode='23514';
  end if;
  update public.payroll_config_sets
  set status='retired',updated_at=now(),updated_by=(select auth.uid())
  where company_id=result.company_id and status='approved' and id<>result.id;
  update public.payroll_config_sets
  set status='approved',approved_at=now(),approved_by=(select auth.uid()),updated_at=now(),updated_by=(select auth.uid())
  where id=result.id returning * into result;
  perform private.record_payroll_audit(result.company_id,null,'payroll.configuration.approved',
    'payroll_config_set',result.id,null,to_jsonb(result),p_reason);
  return result;
end $$;

create or replace function public.save_employee_payroll_profile(
  p_employee_id uuid,
  p_employee_number text,
  p_branch_id uuid,
  p_cost_centre_id uuid,
  p_project_id uuid,
  p_salary_basis text,
  p_contracted_amount numeric,
  p_standard_hours numeric,
  p_standard_days numeric,
  p_effective_from date,
  p_tax_status text,
  p_pension_status text,
  p_iban text,
  p_bank_name text,
  p_reason text
) returns public.employees
language plpgsql security definer set search_path='' as $$
declare result public.employees;
begin
  select * into result from public.employees where id=p_employee_id for update;
  if not found then raise exception 'Employee not found' using errcode='P0002'; end if;
  if not (select private.has_company_permission(result.company_id,'payroll.compensation.manage')) then
    raise exception 'Insufficient permission' using errcode='42501';
  end if;
  if trim(coalesce(p_reason,''))='' or p_contracted_amount<0 then
    raise exception 'Reason and valid compensation are required' using errcode='23514';
  end if;
  if p_salary_basis not in ('gross-monthly','net-monthly','hourly','daily') then
    raise exception 'Unsupported salary basis' using errcode='23514';
  end if;
  if p_branch_id is null or trim(coalesce(p_employee_number,''))='' then
    raise exception 'Employee number and branch are required' using errcode='23514';
  end if;
  update public.employee_compensation_profiles
  set effective_until=p_effective_from-1,status='superseded',updated_at=now(),updated_by=(select auth.uid())
  where employee_id=result.id and status='approved'
    and effective_from<p_effective_from and (effective_until is null or effective_until>=p_effective_from);
  insert into public.employee_compensation_profiles(
    company_id,employee_id,salary_basis,amount,currency,standard_hours,standard_days,
    branch_id,cost_centre_id,project_id,effective_from,status,created_by,updated_by
  ) values (
    result.company_id,result.id,p_salary_basis,p_contracted_amount,'EUR',p_standard_hours,p_standard_days,
    p_branch_id,p_cost_centre_id,p_project_id,p_effective_from,'approved',(select auth.uid()),(select auth.uid())
  );
  insert into public.employee_tax_profiles(company_id,employee_id,tax_status,effective_from,created_by)
  values(result.company_id,result.id,coalesce(nullif(trim(p_tax_status),''),'standard'),p_effective_from,(select auth.uid()))
  on conflict (employee_id,effective_from) do update set tax_status=excluded.tax_status;
  insert into public.employee_pension_profiles(company_id,employee_id,pension_status,effective_from,created_by)
  values(result.company_id,result.id,coalesce(nullif(trim(p_pension_status),''),'standard'),p_effective_from,(select auth.uid()))
  on conflict (employee_id,effective_from) do update set pension_status=excluded.pension_status;
  if nullif(regexp_replace(coalesce(p_iban,''),'\s','','g'),'') is not null then
    update public.employee_bank_accounts set is_primary=false where employee_id=result.id;
    insert into public.employee_bank_accounts(company_id,employee_id,bank_name,iban,account_name,is_primary,created_by,updated_by)
    values(result.company_id,result.id,coalesce(nullif(trim(p_bank_name),''),'Bank'),upper(regexp_replace(p_iban,'\s','','g')),
      trim(coalesce(result.first_name,'')||' '||coalesce(result.last_name,'')),true,(select auth.uid()),(select auth.uid()))
    on conflict (company_id,iban) where iban is not null
    do update set bank_name=excluded.bank_name,is_primary=true,updated_at=now(),updated_by=(select auth.uid());
  end if;
  update public.employees set employee_number=trim(p_employee_number),branch_id=p_branch_id,cost_centre_id=p_cost_centre_id,
    project_id=p_project_id,payroll_ready_status='ready'
  where id=result.id returning * into result;
  perform private.record_payroll_audit(result.company_id,p_branch_id,'payroll.employee_profile.updated',
    'employee',result.id,null,jsonb_build_object('salaryBasis',p_salary_basis,'effectiveFrom',p_effective_from),p_reason);
  return result;
end $$;

create or replace function public.save_payroll_posting_mapping(
  p_company_id uuid,
  p_mapping_code text,
  p_account_id uuid,
  p_branch_id uuid,
  p_cost_centre_id uuid,
  p_project_id uuid,
  p_effective_from date,
  p_reason text
) returns public.payroll_posting_mappings
language plpgsql security definer set search_path='' as $$
declare result public.payroll_posting_mappings;
begin
  if not (select private.has_company_permission(p_company_id,'payroll.configuration.manage')) then
    raise exception 'Insufficient permission' using errcode='42501';
  end if;
  if trim(coalesce(p_reason,''))='' then raise exception 'Mapping reason is required' using errcode='23514'; end if;
  if not exists(select 1 from public.chart_of_accounts where id=p_account_id and company_id=p_company_id and active and posting_allowed) then
    raise exception 'Posting account is not available' using errcode='23503';
  end if;
  insert into public.payroll_posting_mappings(company_id,mapping_code,account_id,branch_id,cost_centre_id,project_id,effective_from,created_by)
  values(p_company_id,upper(trim(p_mapping_code)),p_account_id,p_branch_id,p_cost_centre_id,p_project_id,p_effective_from,(select auth.uid()))
  on conflict (company_id,mapping_code,branch_id,cost_centre_id,project_id,effective_from)
  do update set account_id=excluded.account_id,active=true
  returning * into result;
  perform private.record_payroll_audit(p_company_id,p_branch_id,'payroll.posting_mapping.saved',
    'payroll_posting_mapping',result.id,null,to_jsonb(result),p_reason);
  return result;
end $$;

create or replace function public.set_payroll_feature_flags(
  p_company_id uuid,
  p_enabled boolean,
  p_reason text
) returns setof public.company_feature_flags
language plpgsql security definer set search_path='' as $$
begin
  if not (select private.has_company_permission(p_company_id,'company.manage')) then
    raise exception 'Insufficient permission' using errcode='42501';
  end if;
  if trim(coalesce(p_reason,''))='' then raise exception 'Feature-change reason is required' using errcode='23514'; end if;
  update public.company_feature_flags
  set enabled=p_enabled,updated_at=now(),updated_by=(select auth.uid())
  where company_id=p_company_id and flag='payroll_enabled';
  perform private.record_payroll_audit(p_company_id,null,'payroll.feature_flags.changed',
    'company',p_company_id,null,jsonb_build_object('enabled',p_enabled),p_reason);
  return query select * from public.company_feature_flags
    where company_id=p_company_id and flag='payroll_enabled';
end $$;

revoke all on function public.create_payroll_period(uuid,text,text,date,date,date,uuid) from public;
revoke all on function public.create_payroll_run(uuid,uuid,uuid,text,uuid,uuid,text,uuid) from public;
revoke all on function public.import_payroll_inputs(uuid,uuid,text,text,text[],boolean,timestamptz,text,jsonb) from public;
revoke all on function public.save_payroll_calculation(uuid,uuid,uuid,uuid,uuid,jsonb,jsonb) from public;
revoke all on function public.submit_payroll_for_review(uuid) from public;
revoke all on function public.approve_payroll_run(uuid,text) from public;
revoke all on function public.finalize_payroll_run(uuid,text,text) from public;
revoke all on function public.create_payroll_payment_batch(uuid,uuid,date,text,uuid[]) from public;
revoke all on function public.approve_payroll_payment_batch(uuid,text) from public;
revoke all on function public.record_payroll_payment(uuid,uuid,text,timestamptz,text) from public;
revoke all on function public.reverse_payroll_run(uuid,text,text) from public;
revoke all on function public.save_payroll_configuration(uuid,text,date,date,text,text,integer,jsonb,jsonb,text) from public;
revoke all on function public.approve_payroll_configuration(uuid,text) from public;
revoke all on function public.save_employee_payroll_profile(uuid,text,uuid,uuid,uuid,text,numeric,numeric,numeric,date,text,text,text,text,text) from public;
revoke all on function public.save_payroll_posting_mapping(uuid,text,uuid,uuid,uuid,uuid,date,text) from public;
revoke all on function public.set_payroll_feature_flags(uuid,boolean,text) from public;

grant execute on function public.create_payroll_period(uuid,text,text,date,date,date,uuid) to authenticated;
grant execute on function public.create_payroll_run(uuid,uuid,uuid,text,uuid,uuid,text,uuid) to authenticated;
grant execute on function public.import_payroll_inputs(uuid,uuid,text,text,text[],boolean,timestamptz,text,jsonb) to authenticated;
grant execute on function public.save_payroll_calculation(uuid,uuid,uuid,uuid,uuid,jsonb,jsonb) to authenticated;
grant execute on function public.submit_payroll_for_review(uuid) to authenticated;
grant execute on function public.approve_payroll_run(uuid,text) to authenticated;
grant execute on function public.finalize_payroll_run(uuid,text,text) to authenticated;
grant execute on function public.create_payroll_payment_batch(uuid,uuid,date,text,uuid[]) to authenticated;
grant execute on function public.approve_payroll_payment_batch(uuid,text) to authenticated;
grant execute on function public.record_payroll_payment(uuid,uuid,text,timestamptz,text) to authenticated;
grant execute on function public.reverse_payroll_run(uuid,text,text) to authenticated;
grant execute on function public.save_payroll_configuration(uuid,text,date,date,text,text,integer,jsonb,jsonb,text) to authenticated;
grant execute on function public.approve_payroll_configuration(uuid,text) to authenticated;
grant execute on function public.save_employee_payroll_profile(uuid,text,uuid,uuid,uuid,text,numeric,numeric,numeric,date,text,text,text,text,text) to authenticated;
grant execute on function public.save_payroll_posting_mapping(uuid,text,uuid,uuid,uuid,uuid,date,text) to authenticated;
grant execute on function public.set_payroll_feature_flags(uuid,boolean,text) to authenticated;

comment on function public.finalize_payroll_run(uuid,text,text) is
  'Atomically freezes payroll, posts the Phase B journal, creates liabilities/payslips and emits audit/outbox events.';

commit;
