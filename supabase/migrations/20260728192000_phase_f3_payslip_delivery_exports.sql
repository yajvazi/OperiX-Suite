begin;

create or replace function public.access_payroll_payslip(
  p_payslip_id uuid,
  p_access_type text default 'view'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  payslip public.payslip_snapshots;
  employee_user_id uuid;
begin
  if p_access_type not in ('view','download','email','signed_link') then
    raise exception 'Unsupported payslip access type' using errcode='22023';
  end if;

  select * into payslip
  from public.payslip_snapshots
  where id=p_payslip_id and revoked_at is null;
  if not found then
    raise exception 'Payslip not found' using errcode='P0002';
  end if;

  select user_id into employee_user_id
  from public.employees
  where id=payslip.employee_id and company_id=payslip.company_id;

  if employee_user_id is distinct from (select auth.uid())
     and not (select private.has_company_permission(payslip.company_id,'payroll.payslip.generate'))
     and not (select private.has_company_permission(payslip.company_id,'payroll.dashboard.view')) then
    raise exception 'Insufficient payslip permission' using errcode='42501';
  end if;

  insert into public.payslip_access_logs(
    company_id,payslip_snapshot_id,employee_id,accessed_by,access_type,
    session_identifier,metadata
  ) values (
    payslip.company_id,payslip.id,payslip.employee_id,(select auth.uid()),p_access_type,
    coalesce(nullif(current_setting('request.headers',true),'')::jsonb,'{}'::jsonb)->>'x-client-info',
    jsonb_build_object('source','operix_invoice')
  );

  return jsonb_build_object(
    'id',payslip.id,
    'companyId',payslip.company_id,
    'employeeId',payslip.employee_id,
    'language',payslip.language,
    'verificationReference',payslip.verification_reference,
    'snapshot',payslip.snapshot,
    'snapshotChecksum',payslip.snapshot_checksum,
    'generatedAt',payslip.generated_at
  );
end $$;

create or replace function public.record_payroll_export(
  p_payment_batch_id uuid,
  p_export_type text,
  p_schema_version text,
  p_field_mapping jsonb,
  p_file_checksum text,
  p_storage_path text default null
) returns public.payroll_exports
language plpgsql
security definer
set search_path = ''
as $$
declare
  batch public.payroll_payment_batches;
  result public.payroll_exports;
begin
  select * into batch
  from public.payroll_payment_batches
  where id=p_payment_batch_id
  for update;
  if not found then
    raise exception 'Payroll payment batch not found' using errcode='P0002';
  end if;
  if p_export_type not in ('bank_csv','bank_excel','payment_order') then
    raise exception 'Unsupported payroll bank export type' using errcode='22023';
  end if;
  if not (select private.payroll_feature_enabled(batch.company_id,'payroll_bank_exports_enabled'))
     or not (select private.has_company_permission(batch.company_id,'payroll.bank_export.create')) then
    raise exception 'Payroll bank exports are disabled or permission is missing' using errcode='42501';
  end if;
  if batch.status not in ('approved','exported','partially_paid','paid') then
    raise exception 'Payment batch must be approved before export' using errcode='55000';
  end if;
  if coalesce(trim(p_file_checksum),'')='' then
    raise exception 'File checksum is required' using errcode='23514';
  end if;

  insert into public.payroll_exports(
    company_id,payroll_run_id,payment_batch_id,export_type,provider,schema_version,
    field_mapping,file_checksum,storage_path,status,approval_state,created_by,downloaded_at
  ) values (
    batch.company_id,batch.payroll_run_id,batch.id,p_export_type,'generic',p_schema_version,
    coalesce(p_field_mapping,'{}'::jsonb),p_file_checksum,p_storage_path,'downloaded',
    batch.approval_state,(select auth.uid()),now()
  ) returning * into result;

  update public.payroll_payment_batches
  set status=case when status='approved' then 'exported' else status end
  where id=batch.id;

  perform private.record_payroll_audit(
    batch.company_id,batch.branch_id,'payroll.payment_batch.exported',
    'payroll_export',result.id,null,
    jsonb_build_object('batchId',batch.id,'exportType',p_export_type,'checksum',p_file_checksum),
    'Approved payroll payment export downloaded'
  );
  perform private.emit_domain_outbox_event(
    batch.company_id,batch.branch_id,'payroll_export',result.id,
    'payroll.payment_batch.exported',
    jsonb_build_object('batchId',batch.id,'exportType',p_export_type,'checksum',p_file_checksum),
    'payroll-export:'||result.id::text
  );
  return result;
end $$;

create or replace function public.add_payroll_adjustment(
  p_payroll_run_id uuid,
  p_employee_id uuid,
  p_adjustment_type text,
  p_amount numeric,
  p_reason text,
  p_source_period_id uuid default null
) returns public.payroll_adjustments
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_row public.payroll_runs;
  result public.payroll_adjustments;
begin
  select * into run_row from public.payroll_runs where id=p_payroll_run_id for update;
  if not found then raise exception 'Payroll run not found' using errcode='P0002'; end if;
  if not (select private.has_company_permission(run_row.company_id,'payroll.adjustment.create')) then
    raise exception 'Insufficient permission' using errcode='42501';
  end if;
  if run_row.status not in ('draft','collecting_inputs','calculated') then
    raise exception 'Adjustments cannot be added in payroll state %',run_row.status using errcode='55000';
  end if;
  if not exists(select 1 from public.employees where id=p_employee_id and company_id=run_row.company_id) then
    raise exception 'Employee does not belong to payroll company' using errcode='23514';
  end if;
  if p_amount=0 or trim(coalesce(p_reason,''))='' then
    raise exception 'A non-zero amount and reason are required' using errcode='23514';
  end if;
  insert into public.payroll_adjustments(
    company_id,payroll_run_id,employee_id,adjustment_type,amount,reason,status,
    source_period_id,created_by
  ) values (
    run_row.company_id,run_row.id,p_employee_id,p_adjustment_type,p_amount,trim(p_reason),
    'pending_approval',p_source_period_id,(select auth.uid())
  ) returning * into result;
  update public.payroll_runs set status='collecting_inputs',updated_at=now(),updated_by=(select auth.uid()) where id=run_row.id;
  perform private.record_payroll_audit(
    run_row.company_id,run_row.branch_id,'payroll.adjustment.created','payroll_adjustment',
    result.id,null,to_jsonb(result),p_reason
  );
  return result;
end $$;

create or replace function public.approve_payroll_adjustment(
  p_adjustment_id uuid,
  p_approved boolean,
  p_reason text
) returns public.payroll_adjustments
language plpgsql
security definer
set search_path = ''
as $$
declare result public.payroll_adjustments; run_row public.payroll_runs;
begin
  select * into result from public.payroll_adjustments where id=p_adjustment_id for update;
  if not found then raise exception 'Payroll adjustment not found' using errcode='P0002'; end if;
  if not (select private.has_company_permission(result.company_id,'payroll.adjustment.approve')) then
    raise exception 'Insufficient permission' using errcode='42501';
  end if;
  if result.created_by=(select auth.uid()) then
    raise exception 'Adjustment creator cannot approve the same adjustment' using errcode='42501';
  end if;
  if result.status<>'pending_approval' then
    raise exception 'Adjustment is not pending approval' using errcode='55000';
  end if;
  if trim(coalesce(p_reason,''))='' then raise exception 'Approval reason is required' using errcode='23514'; end if;
  update public.payroll_adjustments
  set status=case when p_approved then 'approved' else 'rejected' end,
      approved_at=now(),approved_by=(select auth.uid())
  where id=result.id returning * into result;
  select * into run_row from public.payroll_runs where id=result.payroll_run_id;
  perform private.record_payroll_audit(
    result.company_id,run_row.branch_id,
    case when p_approved then 'payroll.adjustment.approved' else 'payroll.adjustment.rejected' end,
    'payroll_adjustment',result.id,null,to_jsonb(result),p_reason
  );
  return result;
end $$;

revoke all on function public.access_payroll_payslip(uuid,text) from public;
revoke all on function public.record_payroll_export(uuid,text,text,jsonb,text,text) from public;
revoke all on function public.add_payroll_adjustment(uuid,uuid,text,numeric,text,uuid) from public;
revoke all on function public.approve_payroll_adjustment(uuid,boolean,text) from public;
grant execute on function public.access_payroll_payslip(uuid,text) to authenticated;
grant execute on function public.record_payroll_export(uuid,text,text,jsonb,text,text) to authenticated;
grant execute on function public.add_payroll_adjustment(uuid,uuid,text,numeric,text,uuid) to authenticated;
grant execute on function public.approve_payroll_adjustment(uuid,boolean,text) to authenticated;

comment on function public.access_payroll_payslip(uuid,text) is
  'Returns an immutable payroll-owned payslip snapshot after tenant/own-payslip authorization and records access.';
comment on function public.record_payroll_export(uuid,text,text,jsonb,text,text) is
  'Records a checksum-addressed generic payroll bank export without claiming bank-specific compatibility.';

commit;
