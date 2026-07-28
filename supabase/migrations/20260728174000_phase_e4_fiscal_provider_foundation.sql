-- Phase E4: generic fiscal-provider aggregate. No TAK endpoint or payload is
-- invented. Every completed POS order receives a local, auditable fiscal
-- aggregate; provider execution remains feature-flagged.

create table public.fiscal_provider_configs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  provider_code text not null,
  display_name text not null,
  enabled boolean not null default false,
  environment text not null default 'disabled'
    check (environment in ('disabled','mock','sandbox','production')),
  configuration_version integer not null default 1 check (configuration_version > 0),
  payload_version text,
  configuration jsonb not null default '{}'::jsonb
    check (jsonb_typeof(configuration) = 'object'),
  effective_from timestamptz not null default clock_timestamp(),
  effective_until timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references auth.users(id) on delete set null,
  check (effective_until is null or effective_until > effective_from),
  unique (company_id, provider_code, environment, configuration_version)
);

alter table public.pos_terminals
  add column if not exists fiscal_provider_config_id uuid
    references public.fiscal_provider_configs(id) on delete restrict;

create table public.fiscal_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  terminal_id uuid not null references public.pos_terminals(id) on delete restrict,
  fiscal_location_id uuid references public.fiscal_locations(id) on delete restrict,
  pos_order_id uuid not null unique references public.pos_orders(id) on delete restrict,
  original_fiscal_transaction_id uuid references public.fiscal_transactions(id) on delete restrict,
  provider_config_id uuid references public.fiscal_provider_configs(id) on delete restrict,
  provider_code text not null default 'disabled',
  provider_configuration_version integer,
  payload_version text,
  local_transaction_id uuid not null default gen_random_uuid(),
  transaction_kind text not null default 'sale'
    check (transaction_kind in ('sale','return','refund','correction','cancellation')),
  status text not null default 'draft' check (status in (
    'draft','pending_validation','validated','offline_pending','submission_pending',
    'submitted','fiscalized','rejected','retry_scheduled','reconciliation_required',
    'reconciled','cancel_pending','cancelled','correction_pending','corrected',
    'refund_pending','refunded','permanently_failed'
  )),
  canonical_payload jsonb not null check (jsonb_typeof(canonical_payload) = 'object'),
  request_checksum text not null,
  provider_identifiers jsonb not null default '{}'::jsonb
    check (jsonb_typeof(provider_identifiers) = 'object'),
  qr_data text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_attempt_at timestamptz,
  next_retry_at timestamptz,
  error_category text,
  error_message text,
  reconciliation_state text,
  occurred_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (company_id, local_transaction_id)
);
create index fiscal_transactions_company_status_created_idx
  on public.fiscal_transactions (company_id, status, created_at desc);
create index fiscal_transactions_retry_idx
  on public.fiscal_transactions (next_retry_at)
  where status = 'retry_scheduled';

create table public.fiscal_submission_attempts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  fiscal_transaction_id uuid not null references public.fiscal_transactions(id) on delete restrict,
  attempt_number integer not null check (attempt_number > 0),
  request_timestamp timestamptz not null default clock_timestamp(),
  response_timestamp timestamptz,
  request_checksum text not null,
  status text not null,
  provider_response_code text,
  failure_category text,
  retryable boolean not null default false,
  correlation_id text not null,
  network_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(network_metadata) = 'object'),
  result_payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(result_payload) = 'object'),
  created_by uuid references auth.users(id) on delete set null,
  unique (fiscal_transaction_id, attempt_number),
  unique (company_id, correlation_id)
);

create table public.fiscal_reconciliation_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  fiscal_transaction_id uuid not null references public.fiscal_transactions(id) on delete restrict,
  event_type text not null,
  previous_status text,
  new_status text,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  occurred_at timestamptz not null default clock_timestamp(),
  actor_id uuid references auth.users(id) on delete set null
);

create function private.prevent_fiscal_record_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name in ('fiscal_submission_attempts','fiscal_reconciliation_events') then
    raise exception '% records are append-only', tg_table_name using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Fiscal transactions cannot be deleted' using errcode = '55000';
  end if;
  if coalesce(current_setting('app.fiscal_workflow', true), '') <> 'authorized' then
    raise exception 'Fiscal transactions may only change through the fiscal workflow'
      using errcode = '55000';
  end if;
  return new;
end
$$;

create function private.create_pos_fiscal_aggregate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  provider_config public.fiscal_provider_configs;
  payload jsonb;
  checksum text;
  fiscal_row public.fiscal_transactions;
begin
  if new.status not in ('completed','fiscal_pending')
     or old.status in ('completed','fiscal_pending','fiscal_submitted','fiscalized') then
    return new;
  end if;

  select config.*
  into provider_config
  from public.pos_terminals terminal
  join public.fiscal_provider_configs config
    on config.id = terminal.fiscal_provider_config_id
   and config.company_id = terminal.company_id
  where terminal.id = new.terminal_id
    and config.effective_from <= new.occurred_at
    and (config.effective_until is null or config.effective_until > new.occurred_at)
  limit 1;

  payload := jsonb_build_object(
    'schema_version', 1,
    'local_order_id', new.id,
    'idempotency_key', new.idempotency_key,
    'company_id', new.company_id,
    'branch_id', new.branch_id,
    'fiscal_location_id', new.fiscal_location_id,
    'terminal_id', new.terminal_id,
    'cashier_id', new.completed_by,
    'order_number', new.order_number,
    'occurred_at', new.occurred_at,
    'customer_id', new.customer_id,
    'transaction_kind', 'sale',
    'currency', new.currency,
    'subtotal', new.subtotal,
    'discount_amount', new.discount_amount,
    'vat_amount', new.tax_amount,
    'total_amount', new.total_amount,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'line_id', line.id,
        'product_id', line.product_id,
        'sku', line.sku,
        'description', line.description,
        'quantity', line.quantity,
        'unit', line.unit,
        'unit_price', line.unit_price,
        'discount_percent', line.discount_percent,
        'net_amount', line.net_amount,
        'vat_rate', line.tax_rate,
        'vat_amount', line.tax_amount,
        'gross_amount', line.gross_amount
      ) order by line.line_number)
      from public.pos_order_lines line
      where line.pos_order_id = new.id
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'payment_method', payment.payment_method,
        'amount', payment.allocated_amount,
        'tendered_amount', payment.tendered_amount,
        'change_amount', payment.change_amount,
        'reference', payment.reference
      ) order by payment.created_at, payment.id)
      from public.pos_payments payment
      where payment.pos_order_id = new.id
    ), '[]'::jsonb)
  );
  checksum := encode(extensions.digest(convert_to(payload::text, 'utf8'), 'sha256'), 'hex');

  insert into public.fiscal_transactions (
    company_id, branch_id, terminal_id, fiscal_location_id, pos_order_id,
    provider_config_id, provider_code, provider_configuration_version,
    payload_version, status, canonical_payload, request_checksum, occurred_at,
    created_by, updated_by
  )
  values (
    new.company_id, new.branch_id, new.terminal_id, new.fiscal_location_id, new.id,
    provider_config.id, coalesce(provider_config.provider_code, 'disabled'),
    provider_config.configuration_version, provider_config.payload_version,
    case when coalesce(provider_config.enabled, false) then 'pending_validation' else 'draft' end,
    payload, checksum, new.occurred_at, new.completed_by, new.completed_by
  )
  on conflict (pos_order_id) do nothing
  returning * into fiscal_row;

  if fiscal_row.id is not null then
    insert into public.fiscal_reconciliation_events (
      company_id, fiscal_transaction_id, event_type, new_status, details, actor_id
    )
    values (
      new.company_id, fiscal_row.id, 'aggregate_created', fiscal_row.status,
      jsonb_build_object(
        'provider_code', fiscal_row.provider_code,
        'configuration_version', fiscal_row.provider_configuration_version
      ),
      new.completed_by
    );

    perform private.emit_domain_outbox_event(
      new.company_id, new.branch_id, 'fiscal_transaction', fiscal_row.id,
      'fiscal_transaction.created',
      jsonb_build_object(
        'pos_order_id', new.id,
        'provider_code', fiscal_row.provider_code,
        'status', fiscal_row.status
      ),
      'fiscal_transaction.created:' || fiscal_row.id::text
    );
  end if;
  return new;
end
$$;

create function public.process_mock_fiscal_transaction(
  p_fiscal_transaction_id uuid,
  p_scenario text default 'success'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  fiscal_row public.fiscal_transactions;
  attempt_number_value integer;
  next_status text;
  response_code text;
  retryable_value boolean := false;
  correlation_id_value text;
  provider_ids jsonb := '{}'::jsonb;
  qr_value text;
begin
  select *
  into fiscal_row
  from public.fiscal_transactions
  where id = p_fiscal_transaction_id
  for update;

  if not found
     or not (select private.has_company_permission(fiscal_row.company_id, 'pos.fiscal.retry')) then
    raise exception 'Fiscal transaction not found or access denied' using errcode = '42501';
  end if;
  if fiscal_row.provider_code <> 'mock' then
    raise exception 'Only the mock provider can be processed by this command' using errcode = '23514';
  end if;
  if not coalesce((
    select flag.enabled
    from public.company_feature_flags flag
    where flag.company_id = fiscal_row.company_id
      and flag.flag = 'mock_fiscal_provider_enabled'
  ), false) then
    raise exception 'Mock fiscal provider is disabled for this company' using errcode = '55000';
  end if;
  if p_scenario not in (
    'success','validation_failure','network_timeout','provider_rejection',
    'duplicate_transaction','delayed_response','retry_success','retry_failure',
    'reconciliation_success','reconciliation_mismatch'
  ) then
    raise exception 'Unsupported mock fiscal scenario' using errcode = '23514';
  end if;

  attempt_number_value := fiscal_row.attempt_count + 1;
  correlation_id_value := 'mock:' || fiscal_row.local_transaction_id::text || ':' || attempt_number_value::text;

  case p_scenario
    when 'success', 'retry_success', 'reconciliation_success' then
      next_status := case when p_scenario = 'reconciliation_success' then 'reconciled' else 'fiscalized' end;
      response_code := 'MOCK_OK';
      provider_ids := jsonb_build_object(
        'provider_transaction_id', 'MOCK-' || fiscal_row.local_transaction_id::text,
        'verification_code', 'VERIFY-' || left(fiscal_row.local_transaction_id::text, 8)
      );
      qr_value := 'operix-fiscal://mock/' || fiscal_row.local_transaction_id::text;
    when 'validation_failure', 'provider_rejection' then
      next_status := 'rejected';
      response_code := case when p_scenario = 'validation_failure' then 'MOCK_VALIDATION' else 'MOCK_REJECTED' end;
    when 'network_timeout', 'delayed_response', 'retry_failure' then
      next_status := 'retry_scheduled';
      response_code := 'MOCK_RETRYABLE';
      retryable_value := true;
    when 'duplicate_transaction', 'reconciliation_mismatch' then
      next_status := 'reconciliation_required';
      response_code := case when p_scenario = 'duplicate_transaction' then 'MOCK_DUPLICATE' else 'MOCK_MISMATCH' end;
  end case;

  insert into public.fiscal_submission_attempts (
    company_id, fiscal_transaction_id, attempt_number, response_timestamp,
    request_checksum, status, provider_response_code, failure_category,
    retryable, correlation_id, result_payload, created_by
  )
  values (
    fiscal_row.company_id, fiscal_row.id, attempt_number_value, clock_timestamp(),
    fiscal_row.request_checksum, next_status, response_code,
    case when next_status in ('rejected','retry_scheduled','reconciliation_required') then p_scenario end,
    retryable_value, correlation_id_value,
    jsonb_build_object('scenario', p_scenario, 'status', next_status),
    (select auth.uid())
  );

  perform set_config('app.fiscal_workflow', 'authorized', true);
  update public.fiscal_transactions
  set status = next_status,
      provider_identifiers = provider_ids,
      qr_data = qr_value,
      attempt_count = attempt_number_value,
      last_attempt_at = clock_timestamp(),
      next_retry_at = case when retryable_value then clock_timestamp() + make_interval(secs => least(3600, power(2, attempt_number_value)::integer * 15)) end,
      error_category = case when next_status in ('rejected','retry_scheduled','reconciliation_required') then p_scenario end,
      error_message = case when next_status in ('rejected','retry_scheduled','reconciliation_required') then response_code end,
      reconciliation_state = case when next_status in ('reconciliation_required','reconciled') then next_status end,
      updated_at = clock_timestamp(),
      updated_by = (select auth.uid())
  where id = fiscal_row.id
  returning * into fiscal_row;
  perform set_config('app.fiscal_workflow', '', true);

  insert into public.fiscal_reconciliation_events (
    company_id, fiscal_transaction_id, event_type, previous_status, new_status,
    details, actor_id
  )
  values (
    fiscal_row.company_id, fiscal_row.id, 'mock_provider_result',
    case when attempt_number_value = 1 then 'pending_validation' else null end,
    fiscal_row.status,
    jsonb_build_object('scenario', p_scenario, 'response_code', response_code),
    (select auth.uid())
  );

  return jsonb_build_object(
    'fiscal_transaction_id', fiscal_row.id,
    'status', fiscal_row.status,
    'attempt_count', fiscal_row.attempt_count,
    'retryable', retryable_value,
    'response_code', response_code,
    'qr_data', fiscal_row.qr_data
  );
end
$$;

insert into public.app_permissions (code,name,category,description,is_sensitive) values
  ('pos.fiscal.view','View POS fiscal status','pos','View fiscal transactions and immutable provider attempts.',false),
  ('pos.fiscal.retry','Retry fiscal submission','pos','Retry or simulate an approved fiscal-provider submission.',true),
  ('pos.fiscal.reconcile','Resolve fiscal reconciliation','pos','Review and resolve fiscal reconciliation states.',true),
  ('pos.fiscal.configure','Configure fiscal provider','pos','Manage terminal fiscal-provider configuration.',true)
on conflict (code) do update
set name=excluded.name,category=excluded.category,description=excluded.description,is_sensitive=excluded.is_sensitive;

insert into public.app_role_permissions (role_id,permission_code)
select role.id, permission.code
from public.app_roles role
join public.app_permissions permission
  on permission.code in ('pos.fiscal.view','pos.fiscal.retry','pos.fiscal.reconcile','pos.fiscal.configure')
where role.company_id is null
  and role.code in ('owner','super_administrator','company_administrator','senior_accountant','auditor')
  and (role.code <> 'auditor' or permission.code = 'pos.fiscal.view')
on conflict do nothing;

alter table public.fiscal_provider_configs enable row level security;
alter table public.fiscal_transactions enable row level security;
alter table public.fiscal_submission_attempts enable row level security;
alter table public.fiscal_reconciliation_events enable row level security;

create policy fiscal_provider_configs_select on public.fiscal_provider_configs
for select to authenticated using ((select private.has_company_permission(company_id,'pos.fiscal.view')));
create policy fiscal_transactions_select on public.fiscal_transactions
for select to authenticated using ((select private.has_company_permission(company_id,'pos.fiscal.view')));
create policy fiscal_submission_attempts_select on public.fiscal_submission_attempts
for select to authenticated using ((select private.has_company_permission(company_id,'pos.fiscal.view')));
create policy fiscal_reconciliation_events_select on public.fiscal_reconciliation_events
for select to authenticated using ((select private.has_company_permission(company_id,'pos.fiscal.view')));

create trigger fiscal_transactions_immutable
before update or delete on public.fiscal_transactions
for each row execute function private.prevent_fiscal_record_mutation();
create trigger fiscal_submission_attempts_immutable
before update or delete on public.fiscal_submission_attempts
for each row execute function private.prevent_fiscal_record_mutation();
create trigger fiscal_reconciliation_events_immutable
before update or delete on public.fiscal_reconciliation_events
for each row execute function private.prevent_fiscal_record_mutation();

create trigger pos_orders_create_fiscal_aggregate
after update of status on public.pos_orders
for each row execute function private.create_pos_fiscal_aggregate();

create trigger fiscal_provider_configs_audit
after insert or update or delete on public.fiscal_provider_configs
for each row execute function private.audit_table_change();
create trigger fiscal_transactions_audit
after insert or update or delete on public.fiscal_transactions
for each row execute function private.audit_table_change();
create trigger fiscal_submission_attempts_audit
after insert or update or delete on public.fiscal_submission_attempts
for each row execute function private.audit_table_change();
create trigger fiscal_reconciliation_events_audit
after insert or update or delete on public.fiscal_reconciliation_events
for each row execute function private.audit_table_change();

revoke all on function public.process_mock_fiscal_transaction(uuid,text) from public;
grant execute on function public.process_mock_fiscal_transaction(uuid,text) to authenticated;

comment on table public.fiscal_transactions is
  'Generic fiscal-ready aggregate. Draft or mock states are not evidence of TAK fiscalization or certification.';
comment on function public.process_mock_fiscal_transaction(uuid,text) is
  'Development-only mock provider command, gated by mock_fiscal_provider_enabled. It does not contact TAK.';
