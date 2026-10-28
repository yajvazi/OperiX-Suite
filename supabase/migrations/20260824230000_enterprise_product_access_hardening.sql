-- OperiX Enterprise product boundary
--
-- Invoice, Booking, and Suite are public commercial products. HR and Desk are
-- independent Enterprise entitlements. This migration closes server-side
-- permission, RPC, RLS, storage, and platform-management gaps without
-- deleting or rewriting any existing business data.

begin;

create or replace function private.operix_product_for_permission(p_permission text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select case
    when lower(trim(coalesce(p_permission, ''))) like any (array[
      'hr.%', 'payroll.%', 'employees.%', 'attendance.%', 'leave.%',
      'recruitment.%', 'performance.%', 'onboarding.%', 'offboarding.%'
    ]) then 'hr'
    when lower(trim(coalesce(p_permission, ''))) like any (array[
      'desk.%', 'reservation.%', 'floor.%', 'resource.%', 'team.%'
    ]) then 'desk'
    else null
  end;
$$;

revoke all on function private.operix_product_for_permission(text) from public;
grant execute on function private.operix_product_for_permission(text) to authenticated, service_role;

-- Keep all existing RBAC callers on the same function OID while adding the
-- product gate. This is important: renaming the old function would leave
-- cached/dependent SQL functions calling an unprotected function.
create or replace function private.has_company_permission(
  p_company_id uuid,
  p_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with requested as (
    select lower(trim(coalesce(p_permission, ''))) as permission_code,
      private.rbac_canonical_permission(p_permission) as canonical_code
  ),
  access as (
    select private.company_is_active(p_company_id) as company_active,
      private.rbac_is_platform_admin() as platform_admin,
      private.rbac_role_code(p_company_id) as actor_role,
      private.rbac_actor_membership(p_company_id) as membership_id
  ),
  role_access as (
    select access.*,
      exists (
        select 1
        from public.membership_permission_overrides override
        where override.membership_id = access.membership_id
          and override.permission_code = requested.canonical_code
          and override.enabled = false
      ) as explicitly_denied,
      exists (
        select 1
        from public.membership_permission_overrides override
        where override.membership_id = access.membership_id
          and override.permission_code = requested.canonical_code
          and override.enabled = true
      ) as explicitly_enabled,
      exists (
        select 1
        from public.membership_role_assignments assignment
        join public.app_role_permissions role_permission on role_permission.role_id = assignment.role_id
        where assignment.membership_id = access.membership_id
          and role_permission.permission_code = requested.canonical_code
      ) as role_grant
    from access cross join requested
  ),
  app_gate as (
    select private.control_permission_app_key(p_permission) as app_key
  ),
  product_gate as (
    select private.operix_product_for_permission(requested.canonical_code) as required_product
    from requested
  )
  select coalesce(role_access.company_active, false)
    and (
      role_access.platform_admin
      or (
        not private.rbac_is_platform_permission(requested.permission_code)
        and (
          role_access.actor_role = 'company_administrator'
          or (
            not role_access.explicitly_denied
            and (role_access.explicitly_enabled or role_access.role_grant)
          )
        )
      )
    )
    and (
      app_gate.app_key is null
      or role_access.platform_admin
      or (
        exists (
          select 1 from public.company_app_entitlements entitlement
          where entitlement.company_id = p_company_id
            and entitlement.app_key = app_gate.app_key
            and entitlement.enabled
        )
        and (
          role_access.actor_role = 'company_administrator'
          or exists (
            select 1 from public.memberships membership
            where membership.id = role_access.membership_id
              and coalesce(membership.status, 'active') = 'active'
              and not exists (
                select 1 from public.membership_app_access access
                where access.membership_id = membership.id
                  and access.app_key = app_gate.app_key
                  and access.enabled = false
              )
          )
        )
      )
    )
    and (
      product_gate.required_product is null
      or private.operix_product_access(p_company_id, product_gate.required_product)
    )
  from role_access
  cross join requested
  cross join app_gate
  cross join product_gate;
$$;

revoke all on function private.has_company_permission(uuid, text) from public;
grant execute on function private.has_company_permission(uuid, text) to authenticated, service_role;

create or replace function private.require_operix_product_access(p_company_id uuid, p_product text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if lower(trim(coalesce(p_product, ''))) not in ('hr', 'desk') then
    raise exception 'Enterprise product required' using errcode = '42501';
  end if;
  if not private.operix_product_access(p_company_id, lower(trim(p_product))) then
    raise exception 'Enterprise product access is required' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.require_operix_product_access(uuid, text) from public;
grant execute on function private.require_operix_product_access(uuid, text) to authenticated, service_role;

-- The client receives only the current organization, product, date window,
-- and source. Contract price, notes, seat limits, and internal references are
-- never exposed through this identity endpoint.
create or replace function public.get_my_product_access(p_product text)
returns table(
  company_id uuid,
  product text,
  entitled boolean,
  role_allowed boolean,
  allowed boolean,
  source text,
  starts_at timestamptz,
  ends_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  requested_product text := lower(trim(coalesce(p_product, '')));
  selected_company_id uuid;
  root_company_id uuid;
  entitled_now boolean := false;
  role_allowed_now boolean := false;
  entitlement_row record;
begin
  if (select auth.uid()) is null then
    return;
  end if;
  if requested_product not in ('invoice', 'booking', 'hr', 'desk') then
    raise exception 'Unsupported product' using errcode = '22023';
  end if;

  select coalesce(profile.active_company_id, profile.company_id)
    into selected_company_id
  from public.profiles profile
  where profile.id = (select auth.uid());

  if selected_company_id is null then
    select membership.company_id into selected_company_id
    from public.memberships membership
    where membership.user_id = (select auth.uid())
      and coalesce(membership.status, 'active') = 'active'
    order by membership.created_at asc
    limit 1;
  end if;

  if selected_company_id is null or not public.can_access_company(selected_company_id) then
    return query select null::uuid, requested_product, false, false, false, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  root_company_id := private.invoice_billing_root_company_id(selected_company_id);
  entitled_now := private.operix_product_access(root_company_id, requested_product);

  select entitlement.source, entitlement.starts_at, entitlement.ends_at
    into entitlement_row
  from public.organization_product_entitlements entitlement
  where entitlement.company_id = root_company_id
    and entitlement.product = requested_product
    and entitlement.enabled
    and entitlement.starts_at <= now()
    and (entitlement.ends_at is null or entitlement.ends_at > now())
  order by case when entitlement.source = 'enterprise_contract' then 0 when entitlement.source = 'manual_grant' then 1 else 2 end,
    entitlement.starts_at desc
  limit 1;

  role_allowed_now := exists (
    select 1
    from public.app_permissions permission
    where permission.category = case when requested_product = 'hr' then 'hr' when requested_product = 'desk' then 'desk' else 'billing' end
      and private.has_company_permission(root_company_id, permission.code)
  );

  return query select
    root_company_id,
    requested_product,
    entitled_now,
    role_allowed_now,
    entitled_now and role_allowed_now,
    entitlement_row.source,
    entitlement_row.starts_at,
    entitlement_row.ends_at;
end;
$$;

revoke all on function public.get_my_product_access(text) from public, anon;
grant execute on function public.get_my_product_access(text) to authenticated;

create or replace function private.operix_company_uuid(p_value text)
returns uuid
language plpgsql
immutable
security definer
set search_path = ''
as $$
begin
  if p_value is null or p_value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return null;
  end if;
  return p_value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

revoke all on function private.operix_company_uuid(text) from public;
grant execute on function private.operix_company_uuid(text) to authenticated, service_role;

create or replace function private.operix_hr_audit_event(p_action text, p_entity_type text)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select lower(coalesce(p_action, '')) like any (array[
      'hr.%', 'payroll.%', 'employee.%', 'attendance.%', 'leave.%', 'payslip.%'
    ])
    or lower(coalesce(p_entity_type, '')) like any (array[
      'hr%', 'employee%', 'attendance%', 'leave%', 'payroll%', 'payslip%'
    ]);
$$;

revoke all on function private.operix_hr_audit_event(text, text) from public;
grant execute on function private.operix_hr_audit_event(text, text) to authenticated, service_role;

-- Direct table access is defense in depth. SECURITY DEFINER commands below
-- also receive explicit product guards because table RLS is bypassed by their
-- owner role.
do $$
declare
  table_name text;
begin
  for table_name in
    select relation.relname
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
      and exists (
        select 1 from information_schema.columns column_info
        where column_info.table_schema = 'public'
          and column_info.table_name = relation.relname
          and column_info.column_name = 'company_id'
      )
      and (
        relation.relname in ('employees', 'attendance_records', 'leave_requests', 'leave_types', 'leave_balances', 'employee_documents', 'employment_contracts', 'payrolls')
        or relation.relname like 'hr_%'
        or relation.relname like 'payroll_%'
        or relation.relname like 'leave_%'
        or relation.relname like 'employee%'
        or relation.relname like 'attendance%'
        or relation.relname like 'payslip%'
      )
  loop
    execute format('drop policy if exists operix_hr_product_boundary on public.%I', table_name);
    execute format(
      'create policy operix_hr_product_boundary on public.%I as restrictive for all to authenticated using (private.operix_product_access(private.operix_company_uuid(company_id::text), ''hr'')) with check (private.operix_product_access(private.operix_company_uuid(company_id::text), ''hr''))',
      table_name
    );
  end loop;

  for table_name in
    select relation.relname
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'p')
      and relation.relname in ('users', 'resources', 'reservations', 'floor_plans', 'favorites', 'audit_logs')
      and exists (
        select 1 from information_schema.columns column_info
        where column_info.table_schema = 'public'
          and column_info.table_name = relation.relname
          and column_info.column_name = 'company_id'
      )
  loop
    execute format('drop policy if exists operix_desk_product_boundary on public.%I', table_name);
    execute format(
      'create policy operix_desk_product_boundary on public.%I as restrictive for all to authenticated using (private.operix_product_access(private.operix_company_uuid(company_id::text), ''desk'')) with check (private.operix_product_access(private.operix_company_uuid(company_id::text), ''desk''))',
      table_name
    );
  end loop;
end;
$$;

drop policy if exists operix_hr_audit_product_boundary on public.audit_events;
create policy operix_hr_audit_product_boundary on public.audit_events
as restrictive for select to authenticated
using (
  not private.operix_hr_audit_event(action, entity_type)
  or private.operix_product_access(company_id, 'hr')
);

-- Employee document paths are `{company_id}/{employee_id}/{file}`. The
-- existing employee/membership policies remain in place; this restrictive
-- policy adds the product boundary without changing data retention.
create or replace function private.operix_hr_storage_product_access(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.operix_product_access(
    private.operix_company_uuid(split_part(coalesce(p_name, ''), '/', 1)),
    'hr'
  );
$$;

revoke all on function private.operix_hr_storage_product_access(text) from public;
grant execute on function private.operix_hr_storage_product_access(text) to authenticated, service_role;

drop policy if exists operix_hr_storage_product_boundary on storage.objects;
create policy operix_hr_storage_product_boundary on storage.objects
as restrictive for all to authenticated
using (bucket_id = 'employee-documents' and private.operix_hr_storage_product_access(name))
with check (bucket_id = 'employee-documents' and private.operix_hr_storage_product_access(name));

revoke insert, update, delete on public.organization_product_entitlements from authenticated;
revoke insert, update, delete on public.enterprise_contracts, public.enterprise_contract_products from authenticated;

-- Explicit product checks for SECURITY DEFINER self-service commands. The
-- original implementation is retained under an inaccessible internal name so
-- behavior and historical data semantics remain unchanged.
alter function public.hr_clock_in(uuid, uuid, text) rename to hr_clock_in_unchecked_operix;
create or replace function public.hr_clock_in(p_company_id uuid, p_employee_id uuid, p_work_mode text default 'office')
returns public.attendance_records language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_operix_product_access(p_company_id, 'hr');
  return public.hr_clock_in_unchecked_operix(p_company_id, p_employee_id, p_work_mode);
end;
$$;

alter function public.hr_clock_out(uuid, uuid) rename to hr_clock_out_unchecked_operix;
create or replace function public.hr_clock_out(p_company_id uuid, p_employee_id uuid)
returns public.attendance_records language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_operix_product_access(p_company_id, 'hr');
  return public.hr_clock_out_unchecked_operix(p_company_id, p_employee_id);
end;
$$;

alter function public.hr_submit_leave_request(uuid, uuid, text, date, date, text, numeric) rename to hr_submit_leave_request_unchecked_operix;
create or replace function public.hr_submit_leave_request(p_company_id uuid, p_employee_id uuid, p_leave_type text, p_start_date date, p_end_date date, p_reason text, p_requested_days numeric default null)
returns public.leave_requests language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_operix_product_access(p_company_id, 'hr');
  return public.hr_submit_leave_request_unchecked_operix(p_company_id, p_employee_id, p_leave_type, p_start_date, p_end_date, p_reason, p_requested_days);
end;
$$;

alter function public.hr_cancel_leave_request(uuid) rename to hr_cancel_leave_request_unchecked_operix;
create or replace function public.hr_cancel_leave_request(p_leave_request_id uuid)
returns public.leave_requests language plpgsql security definer set search_path = '' as $$
declare target_company_id uuid;
begin
  select request_row.company_id into target_company_id from public.leave_requests request_row where request_row.id = p_leave_request_id;
  if target_company_id is null then raise exception 'Leave request not found' using errcode = 'P0002'; end if;
  perform private.require_operix_product_access(target_company_id, 'hr');
  return public.hr_cancel_leave_request_unchecked_operix(p_leave_request_id);
end;
$$;

alter function public.hr_convert_candidate_to_employee(uuid, text, text, date) rename to hr_convert_candidate_to_employee_unchecked_operix;
create or replace function public.hr_convert_candidate_to_employee(p_application_id uuid, p_job_title text default null, p_department text default null, p_start_date date default current_date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare target_company_id uuid;
begin
  select application.company_id into target_company_id from public.hr_applications application where application.id = p_application_id;
  if target_company_id is null then raise exception 'Application not found' using errcode = 'P0002'; end if;
  perform private.require_operix_product_access(target_company_id, 'hr');
  return public.hr_convert_candidate_to_employee_unchecked_operix(p_application_id, p_job_title, p_department, p_start_date);
end;
$$;

alter function public.hr_update_self_review(uuid, text) rename to hr_update_self_review_unchecked_operix;
create or replace function public.hr_update_self_review(p_review_id uuid, p_self_review text)
returns public.hr_performance_reviews language plpgsql security definer set search_path = '' as $$
declare target_company_id uuid;
begin
  select review.company_id into target_company_id from public.hr_performance_reviews review where review.id = p_review_id;
  if target_company_id is null then raise exception 'Review not found' using errcode = 'P0002'; end if;
  perform private.require_operix_product_access(target_company_id, 'hr');
  return public.hr_update_self_review_unchecked_operix(p_review_id, p_self_review);
end;
$$;

alter function public.hr_resolve_approval(uuid, text, text) rename to hr_resolve_approval_unchecked_operix;
create or replace function public.hr_resolve_approval(p_approval_id uuid, p_status text, p_note text default null)
returns public.hr_approvals language plpgsql security definer set search_path = '' as $$
declare target_company_id uuid;
begin
  select approval.company_id into target_company_id from public.hr_approvals approval where approval.id = p_approval_id;
  if target_company_id is null then raise exception 'Approval not found' using errcode = 'P0002'; end if;
  perform private.require_operix_product_access(target_company_id, 'hr');
  return public.hr_resolve_approval_unchecked_operix(p_approval_id, p_status, p_note);
end;
$$;

alter function public.hr_start_offboarding(uuid, uuid, text, date, text) rename to hr_start_offboarding_unchecked_operix;
create or replace function public.hr_start_offboarding(p_company_id uuid, p_employee_id uuid, p_reason text, p_last_working_day date, p_notes text default null)
returns public.hr_offboarding_cases language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_operix_product_access(p_company_id, 'hr');
  return public.hr_start_offboarding_unchecked_operix(p_company_id, p_employee_id, p_reason, p_last_working_day, p_notes);
end;
$$;

alter function public.access_payroll_payslip(uuid, text) rename to access_payroll_payslip_unchecked_operix;
create or replace function public.access_payroll_payslip(p_payslip_id uuid, p_access_type text default 'view')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target_company_id uuid;
begin
  select payslip.company_id into target_company_id from public.payslip_snapshots payslip where payslip.id = p_payslip_id;
  if target_company_id is null then raise exception 'Payslip not found' using errcode = 'P0002'; end if;
  perform private.require_operix_product_access(target_company_id, 'hr');
  return public.access_payroll_payslip_unchecked_operix(p_payslip_id, p_access_type);
end;
$$;

do $$
declare
  function_name text;
begin
  foreach function_name in array array[
    'hr_clock_in_unchecked_operix(uuid,uuid,text)',
    'hr_clock_out_unchecked_operix(uuid,uuid)',
    'hr_submit_leave_request_unchecked_operix(uuid,uuid,text,date,date,text,numeric)',
    'hr_cancel_leave_request_unchecked_operix(uuid)',
    'hr_convert_candidate_to_employee_unchecked_operix(uuid,text,text,date)',
    'hr_update_self_review_unchecked_operix(uuid,text)',
    'hr_resolve_approval_unchecked_operix(uuid,text,text)',
    'hr_start_offboarding_unchecked_operix(uuid,uuid,text,date,text)',
    'access_payroll_payslip_unchecked_operix(uuid,text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', function_name);
  end loop;
end;
$$;

grant execute on function public.hr_clock_in(uuid, uuid, text) to authenticated;
grant execute on function public.hr_clock_out(uuid, uuid) to authenticated;
grant execute on function public.hr_submit_leave_request(uuid, uuid, text, date, date, text, numeric) to authenticated;
grant execute on function public.hr_cancel_leave_request(uuid) to authenticated;
grant execute on function public.hr_convert_candidate_to_employee(uuid, text, text, date) to authenticated;
grant execute on function public.hr_update_self_review(uuid, text) to authenticated;
grant execute on function public.hr_resolve_approval(uuid, text, text) to authenticated;
grant execute on function public.hr_start_offboarding(uuid, uuid, text, date, text) to authenticated;
grant execute on function public.access_payroll_payslip(uuid, text) to authenticated;

revoke all on function public.hr_clock_in(uuid, uuid, text) from public, anon;
revoke all on function public.hr_clock_out(uuid, uuid) from public, anon;
revoke all on function public.hr_submit_leave_request(uuid, uuid, text, date, date, text, numeric) from public, anon;
revoke all on function public.hr_cancel_leave_request(uuid) from public, anon;
revoke all on function public.hr_convert_candidate_to_employee(uuid, text, text, date) from public, anon;
revoke all on function public.hr_update_self_review(uuid, text) from public, anon;
revoke all on function public.hr_resolve_approval(uuid, text, text) from public, anon;
revoke all on function public.hr_start_offboarding(uuid, uuid, text, date, text) from public, anon;
revoke all on function public.access_payroll_payslip(uuid, text) from public, anon;

-- Platform-only read model for product access. It deliberately returns rows
-- only to Control; customer clients continue to use get_product_entitlements.
create or replace function public.control_list_product_entitlements()
returns table(company_id uuid, workspace_name text, product text, enabled boolean, source text, starts_at timestamptz, ends_at timestamptz, metadata jsonb)
language sql
security definer
set search_path = ''
as $$
  select entitlement.company_id,
    coalesce(company.company_name, 'Unnamed organization'),
    entitlement.product,
    entitlement.enabled,
    entitlement.source,
    entitlement.starts_at,
    entitlement.ends_at,
    entitlement.metadata
  from public.organization_product_entitlements entitlement
  join public.companies company on company.id = entitlement.company_id
  where public.control_is_platform_admin()
  order by entitlement.company_id, entitlement.product, entitlement.starts_at desc;
$$;

revoke all on function public.control_list_product_entitlements() from public, anon;
grant execute on function public.control_list_product_entitlements() to authenticated;

create or replace function public.control_set_enterprise_contract_product(
  p_contract_id uuid,
  p_product text,
  p_enabled boolean,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  contract_company_id uuid;
  previous_enabled boolean;
begin
  if not public.control_is_platform_admin() then raise exception 'Platform administrator access required' using errcode = '42501'; end if;
  if p_product not in ('hr', 'desk') then raise exception 'Only HR and Desk are enterprise products' using errcode = '22023'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'A reason is required' using errcode = '22023'; end if;
  select company_id into contract_company_id from public.enterprise_contracts where id = p_contract_id for update;
  if contract_company_id is null then raise exception 'Enterprise contract not found' using errcode = 'P0002'; end if;
  select enabled into previous_enabled from public.enterprise_contract_products where contract_id = p_contract_id and product = p_product for update;
  if p_enabled then
    insert into public.enterprise_contract_products(contract_id, product, enabled)
    values (p_contract_id, p_product, true)
    on conflict (contract_id, product) do update set enabled = true;
  elsif previous_enabled is null then
    raise exception 'Enterprise product is not configured on this contract' using errcode = 'P0002';
  else
    update public.enterprise_contract_products set enabled = false where contract_id = p_contract_id and product = p_product;
  end if;
  perform public.billing_refresh_product_entitlements(contract_company_id);
  insert into public.billing_audit_events(company_id, event, source, actor_user_id, metadata)
  values (contract_company_id, 'enterprise_entitlement_updated', 'operix_control', auth.uid(), jsonb_build_object('contract_id', p_contract_id, 'product', p_product, 'previous_enabled', previous_enabled, 'enabled', p_enabled, 'reason', trim(p_reason)));
end;
$$;

revoke all on function public.control_set_enterprise_contract_product(uuid, text, boolean, text) from public, anon;
grant execute on function public.control_set_enterprise_contract_product(uuid, text, boolean, text) to authenticated;

create or replace function public.expire_enterprise_entitlements()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_count integer := 0;
  contract_row record;
begin
  if not private.operix_server_request() then raise exception 'Server billing path required' using errcode = '42501'; end if;
  for contract_row in
    update public.enterprise_contracts contract
    set status = 'expired', updated_at = now()
    where contract.status in ('trialing', 'active')
      and ((contract.ends_at is not null and contract.ends_at <= now())
        or (contract.status = 'trialing' and contract.trial_ends_at is not null and contract.trial_ends_at <= now()))
    returning contract.id, contract.company_id
  loop
    expired_count := expired_count + 1;
    perform public.billing_refresh_product_entitlements(contract_row.company_id);
    insert into public.billing_audit_events(company_id, event, source, actor_user_id, metadata)
    values (contract_row.company_id, 'enterprise_entitlement_expired', 'billing_worker', null, jsonb_build_object('contract_id', contract_row.id));
  end loop;
  return expired_count;
end;
$$;

revoke all on function public.expire_enterprise_entitlements() from public, anon, authenticated;
grant execute on function public.expire_enterprise_entitlements() to service_role;

-- Add the exact event names required by the Enterprise audit contract while
-- preserving the existing descriptive billing_audit_events rows.
create or replace function public.control_create_enterprise_contract(
  p_company_id uuid,
  p_contract_name text,
  p_products text[],
  p_custom_price numeric default null,
  p_currency text default 'EUR',
  p_billing_interval text default 'custom',
  p_starts_at timestamptz default now(),
  p_ends_at timestamptz default null,
  p_status text default 'active',
  p_seat_limit integer default null,
  p_tenant_limit integer default null,
  p_product_limits jsonb default '{}'::jsonb,
  p_notes text default null,
  p_trial_started_at timestamptz default null,
  p_trial_ends_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  contract_id uuid;
  root_company_id uuid;
  enterprise_product text;
begin
  if not public.control_is_platform_admin() then raise exception 'Platform administrator access required' using errcode = '42501'; end if;
  if p_products is null or cardinality(p_products) = 0 or not (p_products <@ array['hr', 'desk']::text[]) then raise exception 'Enterprise products must be HR and/or Desk' using errcode = '22023'; end if;
  if p_status not in ('draft', 'trialing', 'active', 'expired', 'canceled') then raise exception 'Unsupported enterprise contract status' using errcode = '22023'; end if;
  if p_ends_at is not null and p_ends_at <= p_starts_at then raise exception 'Contract end must be after contract start' using errcode = '22023'; end if;
  if p_status = 'trialing' and p_trial_ends_at is null then raise exception 'A trial/demo contract requires a trial end' using errcode = '22023'; end if;
  if p_trial_ends_at is not null and coalesce(p_trial_started_at, p_starts_at) >= p_trial_ends_at then raise exception 'Trial end must be after trial start' using errcode = '22023'; end if;
  root_company_id := private.invoice_billing_root_company_id(p_company_id);
  insert into public.enterprise_contracts(company_id, contract_name, custom_price, currency, billing_interval, starts_at, ends_at, status, trial_started_at, trial_ends_at, seat_limit, tenant_limit, product_limits, notes, created_by, updated_by)
  values (root_company_id, trim(p_contract_name), p_custom_price, upper(p_currency), p_billing_interval, p_starts_at, p_ends_at, p_status, p_trial_started_at, p_trial_ends_at, p_seat_limit, p_tenant_limit, p_product_limits, p_notes, auth.uid(), auth.uid())
  returning id into contract_id;
  foreach enterprise_product in array p_products loop
    insert into public.enterprise_contract_products(contract_id, product) values (contract_id, enterprise_product) on conflict do nothing;
  end loop;
  perform public.billing_refresh_product_entitlements(root_company_id);
  insert into public.billing_audit_events(company_id, event, source, actor_user_id, metadata)
  values (root_company_id, 'enterprise_contract_created', 'operix_control', auth.uid(), jsonb_build_object('contract_id', contract_id, 'products', p_products, 'custom_price', p_custom_price, 'currency', upper(p_currency), 'starts_at', p_starts_at, 'ends_at', p_ends_at, 'trial_started_at', p_trial_started_at, 'trial_ends_at', p_trial_ends_at));
  insert into public.billing_audit_events(company_id, event, source, actor_user_id, metadata)
  values (root_company_id, 'enterprise_entitlement_granted', 'operix_control', auth.uid(), jsonb_build_object('contract_id', contract_id, 'products', p_products, 'reason', p_notes));
  return contract_id;
end;
$$;

revoke all on function public.control_create_enterprise_contract(uuid, text, text[], numeric, text, text, timestamptz, timestamptz, text, integer, integer, jsonb, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.control_create_enterprise_contract(uuid, text, text[], numeric, text, text, timestamptz, timestamptz, text, integer, integer, jsonb, text, timestamptz, timestamptz) to authenticated;

commit;
