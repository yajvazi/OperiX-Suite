-- OperiX Kosovo EFS certification-readiness boundary.
--
-- This migration adds tenant-isolated configuration, certificate metadata,
-- append-only fiscal evidence, and a backend production guard. It deliberately
-- does not contain TAK credentials, codes, certificates, private keys,
-- endpoints, payload schemas, or cryptographic parameters.

-- Active company is a UI preference, never an authorization grant. The
-- previous profile UPDATE policy allowed a caller to point active_company_id
-- at an arbitrary UUID, so all tenant access helpers must ignore that field.
create or replace function public.can_access_company(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_company_id is not null
    and (
      exists (
        select 1 from public.companies company
        where company.id = target_company_id
          and company.owner_id = (select auth.uid())
      )
      or exists (
        select 1
        from public.memberships membership
        where membership.user_id = (select auth.uid())
          and coalesce(membership.status, 'active') = 'active'
          and private.company_is_in_scope(membership.company_id, target_company_id)
      )
      or exists (
        select 1
        from public.profiles profile
        where profile.id = (select auth.uid())
          and private.company_is_in_scope(profile.company_id, target_company_id)
      )
    );
$$;

create or replace function private.prevent_active_company_hijack()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.active_company_id is distinct from old.active_company_id
     and coalesce(current_setting('app.active_company_switch', true), '') <> 'authorized' then
    raise exception 'Use the authorized active-company switch workflow'
      using errcode = '42501';
  end if;
  return new;
end
$$;

drop trigger if exists profiles_active_company_guard on public.profiles;
create trigger profiles_active_company_guard
before update of active_company_id on public.profiles
for each row execute function private.prevent_active_company_hijack();

create or replace function public.set_active_company(p_company_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.companies company
    where company.id = p_company_id and company.owner_id = current_user_id
  ) and not exists (
    select 1 from public.memberships membership
    where membership.user_id = current_user_id
      and coalesce(membership.status, 'active') = 'active'
      and private.company_is_in_scope(membership.company_id, p_company_id)
  ) and not exists (
    select 1 from public.profiles profile
    where profile.id = current_user_id
      and private.company_is_in_scope(profile.company_id, p_company_id)
  ) then
    raise exception 'You are not a member of this company or subdivision'
      using errcode = '42501';
  end if;

  perform set_config('app.active_company_switch', 'authorized', true);
  update public.profiles
  set active_company_id = p_company_id, updated_at = clock_timestamp()
  where id = current_user_id;
  perform set_config('app.active_company_switch', '', true);
  return p_company_id;
end
$$;

revoke all on function public.set_active_company(uuid) from public, anon;
grant execute on function public.set_active_company(uuid) to authenticated;

-- Ordinary invoice QR references must not be enumerable invoice numbers. This
-- is separate from the future TAK QR payload and uses a high-entropy opaque
-- token only for the existing customer-portal resolver.
alter table public.invoices
  add column if not exists public_qr_token text
    default encode(gen_random_bytes(24), 'hex');

update public.invoices
set public_qr_token = encode(gen_random_bytes(24), 'hex')
where public_qr_token is null;

create unique index if not exists invoices_public_qr_token_unique
  on public.invoices (public_qr_token)
  where public_qr_token is not null;

create or replace function public.resolve_invoice_qr(invoice_number_input text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_row invoices%rowtype;
  portal_token text;
begin
  if nullif(trim(invoice_number_input), '') is null
     or length(trim(invoice_number_input)) < 32
     or trim(invoice_number_input) !~ '^[A-Fa-f0-9]{32,}$' then
    return jsonb_build_object('error', 'This QR reference is invalid or expired.');
  end if;
  select * into invoice_row
  from invoices
  where public_qr_token = trim(invoice_number_input)
    and status::text <> 'draft'
  limit 1;
  if not found then return jsonb_build_object('error','Invoice not found.'); end if;
  if auth.uid() is not null and invoice_row.user_id = auth.uid() then
    return jsonb_build_object('destination','owner','url','/invoices/preview/' || invoice_row.invoice_number);
  end if;
  select token into portal_token
  from customer_portal_tokens
  where client_id = invoice_row.client_id
    and company_id = invoice_row.company_id
    and (expires_at is null or expires_at > now())
  order by created_at desc limit 1;
  if portal_token is null then
    insert into customer_portal_tokens(user_id, company_id, client_id)
    values(invoice_row.user_id, invoice_row.company_id, invoice_row.client_id)
    returning token into portal_token;
  end if;
  return jsonb_build_object('destination','portal','url','/portal/' || portal_token || '/invoice/' || invoice_row.id);
end;
$$;

grant execute on function public.resolve_invoice_qr(text) to anon, authenticated;

create table if not exists public.fiscal_installations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  fiscal_location_id uuid references public.fiscal_locations(id) on delete restrict,
  pos_terminal_id uuid not null references public.pos_terminals(id) on delete restrict,
  taxpayer_identifier text,
  taxpayer_name text,
  business_unit_number text,
  pos_number text,
  software_solution_code text,
  fiscalization_number text,
  unique_fiscalization_code text,
  efs_identification_number text,
  application_id text,
  status text not null default 'not_configured'
    check (status in (
      'not_configured','waiting_for_taxpayer','configured','validated',
      'active','suspended','revoked','deactivated'
    )),
  certificate_reference text,
  certificate_fingerprint text,
  signing_key_reference text,
  production_enabled boolean not null default false,
  certification_mode boolean not null default false,
  activated_at timestamptz,
  deactivated_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (company_id, pos_terminal_id),
  unique (company_id, business_unit_number, pos_number),
  check (production_enabled = false or status = 'active'),
  check (status <> 'active' or nullif(trim(taxpayer_identifier), '') is not null),
  check (status <> 'active' or nullif(trim(unique_fiscalization_code), '') is not null),
  check (status <> 'active' or nullif(trim(software_solution_code), '') is not null),
  check (status <> 'active' or nullif(trim(fiscalization_number), '') is not null),
  check (production_enabled = false or certification_mode = false)
);

create index if not exists fiscal_installations_company_status_idx
  on public.fiscal_installations (company_id, status, updated_at desc);

create table if not exists public.fiscal_certificates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  installation_id uuid not null references public.fiscal_installations(id) on delete restrict,
  certificate_reference text not null,
  issuer text,
  serial_number text,
  fingerprint text,
  valid_from timestamptz,
  valid_until timestamptz,
  status text not null default 'pending'
    check (status in ('pending','active','expired','revoked','invalid')),
  secret_reference text,
  assigned_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (company_id, installation_id, certificate_reference),
  check (valid_until is null or valid_from is null or valid_until > valid_from),
  check (certificate_reference !~* '-----begin'),
  check (coalesce(secret_reference, '') !~* '-----begin')
);

create index if not exists fiscal_certificates_installation_status_idx
  on public.fiscal_certificates (installation_id, status, valid_until);

create table if not exists public.fiscal_configuration_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  installation_id uuid references public.fiscal_installations(id) on delete restrict,
  certificate_id uuid references public.fiscal_certificates(id) on delete restrict,
  event_type text not null,
  previous_status text,
  new_status text,
  changed_fields jsonb not null default '{}'::jsonb
    check (jsonb_typeof(changed_fields) = 'object'),
  actor_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null default clock_timestamp()
);

create index if not exists fiscal_configuration_history_company_time_idx
  on public.fiscal_configuration_history (company_id, occurred_at desc);

create table if not exists public.fiscal_transaction_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  installation_id uuid references public.fiscal_installations(id) on delete restrict,
  fiscal_transaction_id uuid references public.fiscal_transactions(id) on delete restrict,
  source_transaction_id uuid,
  pos_terminal_id uuid references public.pos_terminals(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  state text not null,
  request_fingerprint text,
  response_fingerprint text,
  status_code text,
  details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(details) = 'object'),
  occurred_at timestamptz not null default clock_timestamp()
);

create index if not exists fiscal_transaction_events_company_time_idx
  on public.fiscal_transaction_events (company_id, occurred_at desc);
create index if not exists fiscal_transaction_events_transaction_time_idx
  on public.fiscal_transaction_events (fiscal_transaction_id, occurred_at desc);

create table if not exists public.fiscal_receipts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  installation_id uuid references public.fiscal_installations(id) on delete restrict,
  fiscal_transaction_id uuid not null unique references public.fiscal_transactions(id) on delete restrict,
  source_transaction_id uuid,
  render_model jsonb not null check (jsonb_typeof(render_model) = 'object'),
  fiscal_state text not null,
  fiscal_document_number text,
  fiscalized_at timestamptz,
  qr_payload text,
  qr_status text not null default 'not_available'
    check (qr_status in ('not_available','test_only','tak_verified')),
  certification_only boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists fiscal_receipts_company_time_idx
  on public.fiscal_receipts (company_id, created_at desc);

alter table public.fiscal_transactions
  add column if not exists installation_id uuid
    references public.fiscal_installations(id) on delete restrict,
  add column if not exists source_transaction_id uuid,
  add column if not exists efs_state text not null default 'draft'
    check (efs_state in (
      'not_required','draft','ready','signing','signed','submitting',
      'submitted','accepted','rejected','retry_required','offline_pending',
      'corrected','returned','cancelled'
    )),
  add column if not exists fiscal_idempotency_key text,
  add column if not exists request_fingerprint text;

select set_config('app.fiscal_workflow', 'authorized', true);

update public.fiscal_transactions
set source_transaction_id = pos_order_id
where source_transaction_id is null;

update public.fiscal_transactions
set fiscal_idempotency_key = local_transaction_id::text
where fiscal_idempotency_key is null;

select set_config('app.fiscal_workflow', '', true);

create unique index if not exists fiscal_transactions_company_source_unique
  on public.fiscal_transactions (company_id, source_transaction_id)
  where source_transaction_id is not null;
create unique index if not exists fiscal_transactions_company_idempotency_unique
  on public.fiscal_transactions (company_id, fiscal_idempotency_key)
  where fiscal_idempotency_key is not null;

alter table public.fiscal_provider_configs
  add column if not exists secret_reference text;

create or replace function private.reject_fiscal_secret_material()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if lower(coalesce(new.configuration::text, '')) ~
       '(private[_-]?key|secret|password|credential|access[_-]?token|refresh[_-]?token|-----begin)' then
    raise exception 'Fiscal provider configuration may contain public metadata only; store secrets by reference in a secure signing service'
      using errcode = '22023';
  end if;
  if coalesce(new.secret_reference, '') ~* '-----begin' then
    raise exception 'Private key or certificate material cannot be stored in fiscal configuration'
      using errcode = '22023';
  end if;
  return new;
end
$$;

drop trigger if exists fiscal_provider_configs_reject_secrets on public.fiscal_provider_configs;
create trigger fiscal_provider_configs_reject_secrets
before insert or update on public.fiscal_provider_configs
for each row execute function private.reject_fiscal_secret_material();

create or replace function private.reject_efs_secret_json(
  p_value jsonb,
  p_context text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if lower(coalesce(p_value::text, '')) ~
       '(private[_-]?key|secret|password|credential|access[_-]?token|refresh[_-]?token|-----begin)' then
    raise exception 'Secret-looking material is not allowed in %; store an opaque secure-provider reference'
      , coalesce(p_context, 'EFS payload') using errcode = '22023';
  end if;
end
$$;

create or replace function private.reject_fiscal_transaction_secrets()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.reject_efs_secret_json(new.canonical_payload, 'fiscal transaction payload');
  perform private.reject_efs_secret_json(new.provider_identifiers, 'fiscal provider identifiers');
  return new;
end
$$;

create or replace function private.reject_fiscal_attempt_secrets()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.reject_efs_secret_json(new.network_metadata, 'fiscal network metadata');
  perform private.reject_efs_secret_json(new.result_payload, 'fiscal provider response');
  return new;
end
$$;

create or replace function private.reject_fiscal_reconciliation_secrets()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.reject_efs_secret_json(new.details, 'fiscal reconciliation details');
  return new;
end
$$;

drop trigger if exists fiscal_transactions_reject_secrets on public.fiscal_transactions;
create trigger fiscal_transactions_reject_secrets
before insert or update on public.fiscal_transactions
for each row execute function private.reject_fiscal_transaction_secrets();
drop trigger if exists fiscal_submission_attempts_reject_secrets on public.fiscal_submission_attempts;
create trigger fiscal_submission_attempts_reject_secrets
before insert on public.fiscal_submission_attempts
for each row execute function private.reject_fiscal_attempt_secrets();
drop trigger if exists fiscal_reconciliation_events_reject_secrets on public.fiscal_reconciliation_events;
create trigger fiscal_reconciliation_events_reject_secrets
before insert on public.fiscal_reconciliation_events
for each row execute function private.reject_fiscal_reconciliation_secrets();

create or replace function private.validate_fiscal_provider_environment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.provider_code = 'mock' and new.environment <> 'mock' then
    raise exception 'Mock fiscal provider requires environment = mock' using errcode = '55000';
  end if;
  if new.environment = 'production' and new.provider_code = 'mock' then
    raise exception 'Mock fiscal provider cannot be configured for production' using errcode = '55000';
  end if;
  return new;
end
$$;

drop trigger if exists fiscal_provider_configs_environment_guard on public.fiscal_provider_configs;
create trigger fiscal_provider_configs_environment_guard
before insert or update on public.fiscal_provider_configs
for each row execute function private.validate_fiscal_provider_environment();

create or replace function private.validate_fiscal_transaction_environment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.provider_code = 'mock'
     and not exists (
       select 1 from public.fiscal_provider_configs config
       where config.id = new.provider_config_id
         and config.company_id = new.company_id
         and config.environment = 'mock'
     ) then
    raise exception 'Mock fiscal transaction requires a provider configuration in mock environment'
      using errcode = '55000';
  end if;
  return new;
end
$$;

drop trigger if exists fiscal_transactions_environment_guard on public.fiscal_transactions;
create trigger fiscal_transactions_environment_guard
before insert or update on public.fiscal_transactions
for each row execute function private.validate_fiscal_transaction_environment();

drop policy if exists fiscal_provider_configs_select on public.fiscal_provider_configs;
create policy fiscal_provider_configs_select on public.fiscal_provider_configs
for select to authenticated
using ((select private.has_company_permission(company_id, 'pos.fiscal.configure')));

create or replace function private.prevent_efs_append_only_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% records are append-only', tg_table_name using errcode = '55000';
end
$$;

create or replace function private.prevent_efs_configuration_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'EFS configuration history cannot be deleted' using errcode = '55000';
  end if;
  if coalesce(current_setting('app.efs_configuration_workflow', true), '') <> 'authorized' then
    raise exception 'EFS configuration changes must use the authorized configuration workflow'
      using errcode = '55000';
  end if;
  return new;
end
$$;

create trigger fiscal_configuration_history_append_only
before update or delete on public.fiscal_configuration_history
for each row execute function private.prevent_efs_append_only_mutation();
create trigger fiscal_transaction_events_append_only
before update or delete on public.fiscal_transaction_events
for each row execute function private.prevent_efs_append_only_mutation();
create trigger fiscal_receipts_append_only
before update or delete on public.fiscal_receipts
for each row execute function private.prevent_efs_append_only_mutation();
create trigger fiscal_installations_authorized_mutation
before update or delete on public.fiscal_installations
for each row execute function private.prevent_efs_configuration_mutation();
create trigger fiscal_certificates_authorized_mutation
before update or delete on public.fiscal_certificates
for each row execute function private.prevent_efs_configuration_mutation();

create or replace function private.validate_fiscal_installation_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  branch_company uuid;
  location_company uuid;
  terminal_company uuid;
begin
  select branch.company_id into branch_company
  from public.branches branch where branch.id = new.branch_id;
  select location.company_id into location_company
  from public.fiscal_locations location where location.id = new.fiscal_location_id;
  select terminal.company_id into terminal_company
  from public.pos_terminals terminal where terminal.id = new.pos_terminal_id;
  if branch_company is distinct from new.company_id
     or terminal_company is distinct from new.company_id
     or (new.fiscal_location_id is not null and location_company is distinct from new.company_id) then
    raise exception 'Fiscal installation resources must belong to the same company'
      using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger fiscal_installations_scope_check
before insert or update on public.fiscal_installations
for each row execute function private.validate_fiscal_installation_scope();

create or replace function private.derive_fiscal_installation_status(
  p_taxpayer_identifier text,
  p_business_unit_number text,
  p_pos_number text,
  p_software_solution_code text,
  p_fiscalization_number text,
  p_unique_fiscalization_code text,
  p_certificate_reference text,
  p_signing_key_reference text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when nullif(trim(coalesce(p_taxpayer_identifier, '')), '') is null
      or nullif(trim(coalesce(p_business_unit_number, '')), '') is null
      or nullif(trim(coalesce(p_pos_number, '')), '') is null
      then 'not_configured'
    when nullif(trim(coalesce(p_software_solution_code, '')), '') is null
      or nullif(trim(coalesce(p_fiscalization_number, '')), '') is null
      or nullif(trim(coalesce(p_unique_fiscalization_code, '')), '') is null
      then 'waiting_for_taxpayer'
    when nullif(trim(coalesce(p_certificate_reference, '')), '') is null
      or nullif(trim(coalesce(p_signing_key_reference, '')), '') is null
      then 'configured'
    else 'validated'
  end;
$$;

create or replace function public.upsert_fiscal_installation(
  p_company_id uuid,
  p_branch_id uuid,
  p_pos_terminal_id uuid,
  p_fiscal_location_id uuid default null,
  p_taxpayer_identifier text default null,
  p_taxpayer_name text default null,
  p_business_unit_number text default null,
  p_pos_number text default null,
  p_software_solution_code text default null,
  p_fiscalization_number text default null,
  p_unique_fiscalization_code text default null,
  p_efs_identification_number text default null,
  p_application_id text default null,
  p_certificate_reference text default null,
  p_certificate_fingerprint text default null,
  p_signing_key_reference text default null,
  p_certification_mode boolean default false
)
returns public.fiscal_installations
language plpgsql
security definer
set search_path = ''
as $$
declare
  installation public.fiscal_installations;
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null or not private.has_company_permission(p_company_id, 'pos.fiscal.configure') then
    raise exception 'Insufficient permission to configure EFS installations' using errcode = '42501';
  end if;
  if p_certification_mode and coalesce((
    select enabled from public.company_feature_flags
    where company_id = p_company_id and flag = 'kosovo_efs_production_enabled'
  ), false) then
    raise exception 'Certification mode cannot be combined with production fiscalization' using errcode = '55000';
  end if;

  perform set_config('app.efs_configuration_workflow', 'authorized', true);
  insert into public.fiscal_installations (
    company_id, branch_id, fiscal_location_id, pos_terminal_id,
    taxpayer_identifier, taxpayer_name, business_unit_number, pos_number,
    software_solution_code, fiscalization_number, unique_fiscalization_code,
    efs_identification_number, application_id, certificate_reference,
    certificate_fingerprint, signing_key_reference, status, certification_mode,
    created_by, updated_by
  )
  values (
    p_company_id, p_branch_id, p_fiscal_location_id, p_pos_terminal_id,
    nullif(trim(p_taxpayer_identifier), ''), nullif(trim(p_taxpayer_name), ''),
    nullif(trim(p_business_unit_number), ''), nullif(trim(p_pos_number), ''),
    nullif(trim(p_software_solution_code), ''), nullif(trim(p_fiscalization_number), ''),
    nullif(trim(p_unique_fiscalization_code), ''), nullif(trim(p_efs_identification_number), ''),
    nullif(trim(p_application_id), ''), nullif(trim(p_certificate_reference), ''),
    nullif(trim(p_certificate_fingerprint), ''), nullif(trim(p_signing_key_reference), ''),
    private.derive_fiscal_installation_status(
      p_taxpayer_identifier, p_business_unit_number, p_pos_number,
      p_software_solution_code, p_fiscalization_number, p_unique_fiscalization_code,
      p_certificate_reference, p_signing_key_reference
    ),
    coalesce(p_certification_mode, false), current_user_id, current_user_id
  )
  on conflict (company_id, pos_terminal_id) do update
  set branch_id = excluded.branch_id,
      fiscal_location_id = excluded.fiscal_location_id,
      taxpayer_identifier = excluded.taxpayer_identifier,
      taxpayer_name = excluded.taxpayer_name,
      business_unit_number = excluded.business_unit_number,
      pos_number = excluded.pos_number,
      software_solution_code = excluded.software_solution_code,
      fiscalization_number = excluded.fiscalization_number,
      unique_fiscalization_code = excluded.unique_fiscalization_code,
      efs_identification_number = excluded.efs_identification_number,
      application_id = excluded.application_id,
      certificate_reference = excluded.certificate_reference,
      certificate_fingerprint = excluded.certificate_fingerprint,
      signing_key_reference = excluded.signing_key_reference,
      status = excluded.status,
      certification_mode = excluded.certification_mode,
      updated_at = clock_timestamp(),
      updated_by = current_user_id
  returning * into installation;
  perform set_config('app.efs_configuration_workflow', '', true);

  insert into public.fiscal_configuration_history (
    company_id, installation_id, event_type, new_status,
    changed_fields, actor_id
  )
  values (
    installation.company_id, installation.id, 'installation_configured', installation.status,
    jsonb_build_object(
      'business_unit_number', installation.business_unit_number,
      'pos_number', installation.pos_number,
      'certificate_reference_present', installation.certificate_reference is not null,
      'signing_key_reference_present', installation.signing_key_reference is not null,
      'production_enabled', installation.production_enabled,
      'certification_mode', installation.certification_mode
    ), current_user_id
  );
  return installation;
end
$$;

create or replace function public.record_fiscal_certificate_metadata(
  p_company_id uuid,
  p_installation_id uuid,
  p_certificate_reference text,
  p_issuer text default null,
  p_serial_number text default null,
  p_fingerprint text default null,
  p_valid_from timestamptz default null,
  p_valid_until timestamptz default null,
  p_secret_reference text default null
)
returns public.fiscal_certificates
language plpgsql
security definer
set search_path = ''
as $$
declare
  certificate_row public.fiscal_certificates;
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null or not private.has_company_permission(p_company_id, 'pos.fiscal.configure') then
    raise exception 'Insufficient permission to configure EFS certificates' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.fiscal_installations
    where id = p_installation_id and company_id = p_company_id
  ) then
    raise exception 'Fiscal installation not found' using errcode = 'P0002';
  end if;
  if nullif(trim(p_certificate_reference), '') is null then
    raise exception 'Certificate reference is required; certificate material is not accepted' using errcode = '23514';
  end if;
  if p_valid_from is not null and p_valid_until is not null and p_valid_until <= p_valid_from then
    raise exception 'Certificate validity interval is invalid' using errcode = '23514';
  end if;

  perform set_config('app.efs_configuration_workflow', 'authorized', true);
  insert into public.fiscal_certificates (
    company_id, installation_id, certificate_reference, issuer, serial_number,
    fingerprint, valid_from, valid_until, status, secret_reference,
    assigned_at, created_by, updated_by
  )
  values (
    p_company_id, p_installation_id, trim(p_certificate_reference),
    nullif(trim(p_issuer), ''), nullif(trim(p_serial_number), ''),
    nullif(trim(p_fingerprint), ''), p_valid_from, p_valid_until,
    case when p_valid_until is not null and p_valid_until <= clock_timestamp()
      then 'expired' else 'pending' end,
    nullif(trim(p_secret_reference), ''), clock_timestamp(), current_user_id, current_user_id
  )
  on conflict (company_id, installation_id, certificate_reference) do update
  set issuer = excluded.issuer,
      serial_number = excluded.serial_number,
      fingerprint = excluded.fingerprint,
      valid_from = excluded.valid_from,
      valid_until = excluded.valid_until,
      secret_reference = excluded.secret_reference,
      updated_at = clock_timestamp(),
      updated_by = current_user_id
  returning * into certificate_row;
  perform set_config('app.efs_configuration_workflow', '', true);

  insert into public.fiscal_configuration_history (
    company_id, installation_id, certificate_id, event_type,
    new_status, changed_fields, actor_id
  )
  values (
    p_company_id, p_installation_id, certificate_row.id, 'certificate_metadata_recorded',
    certificate_row.status,
    jsonb_build_object(
      'certificate_reference', certificate_row.certificate_reference,
      'fingerprint', certificate_row.fingerprint,
      'valid_until', certificate_row.valid_until,
      'secret_reference_present', certificate_row.secret_reference is not null
    ), current_user_id
  );
  return certificate_row;
end
$$;

create or replace function public.get_efs_readiness(
  p_company_id uuid,
  p_installation_id uuid default null
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  installation_row public.fiscal_installations;
  certificate_valid boolean := false;
  key_available boolean := false;
  production_flag boolean := false;
  software_configured boolean := false;
  customer_configured boolean := false;
begin
  if not private.has_company_permission(p_company_id, 'pos.fiscal.view') then
    raise exception 'Insufficient permission to view EFS readiness' using errcode = '42501';
  end if;
  select * into installation_row
  from public.fiscal_installations
  where company_id = p_company_id
    and (p_installation_id is null or id = p_installation_id)
  order by updated_at desc
  limit 1;

  if installation_row.id is null then
    return jsonb_build_object(
      'status', 'not_configured',
      'production_enabled', false,
      'certification_status', 'EFS NOT CERTIFIED',
      'checks', jsonb_build_object(
        'taxpayer_configuration', false,
        'business_unit', false,
        'pos', false,
        'software_solution_code', false,
        'fiscalization_number', false,
        'certificate', false,
        'private_key_provider', false,
        'tak_connectivity', false,
        'receipt_renderer', true,
        'qr_validation', false,
        'accounting', true,
        'vat', true
      )
    );
  end if;

  customer_configured := installation_row.taxpayer_identifier is not null
    and installation_row.unique_fiscalization_code is not null;
  software_configured := installation_row.software_solution_code is not null
    and installation_row.fiscalization_number is not null;
  key_available := installation_row.signing_key_reference is not null;
  select exists (
    select 1 from public.fiscal_certificates certificate
    where certificate.installation_id = installation_row.id
      and certificate.company_id = p_company_id
      and certificate.status = 'active'
      and (certificate.valid_from is null or certificate.valid_from <= clock_timestamp())
      and (certificate.valid_until is null or certificate.valid_until > clock_timestamp())
  ) into certificate_valid;
  select coalesce(flag.enabled, false) into production_flag
  from public.company_feature_flags flag
  where flag.company_id = p_company_id
    and flag.flag = 'kosovo_efs_production_enabled';

  return jsonb_build_object(
    'status', installation_row.status,
    'certification_status', 'EFS NOT CERTIFIED',
    'production_enabled', false,
    'checks', jsonb_build_object(
      'taxpayer_configuration', customer_configured,
      'business_unit', installation_row.business_unit_number is not null,
      'pos', installation_row.pos_number is not null,
      'software_solution_code', software_configured,
      'fiscalization_number', installation_row.fiscalization_number is not null,
      'certificate', certificate_valid,
      'private_key_provider', key_available,
      'tak_connectivity', false,
      'receipt_renderer', true,
      'qr_validation', false,
      'accounting', true,
      'vat', true
    ),
    'blockers', jsonb_build_array(
      case when not customer_configured then 'TAK taxpayer Unique Fiscalization Code is not configured.' end,
      case when not software_configured then 'TAK Software Solution Code/Fiscalization Number is not configured.' end,
      case when not certificate_valid then 'A valid TAK certificate is not configured.' end,
      case when not key_available then 'A production-safe signing key provider is not configured.' end,
      'TAK technical contract and certification are pending; production fiscalization is disabled.'
    ),
    'stored_production_flag', production_flag
  );
end
$$;

create or replace function public.assert_efs_production_ready(
  p_company_id uuid,
  p_installation_id uuid
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  installation_row public.fiscal_installations;
  software_ready boolean := false;
  certificate_ready boolean := false;
  key_ready boolean := false;
  taxpayer_ready boolean := false;
  feature_enabled boolean := false;
begin
  if not private.has_company_permission(p_company_id, 'pos.fiscal.retry') then
    raise exception 'Insufficient permission to fiscalize' using errcode = '42501';
  end if;
  select * into installation_row
  from public.fiscal_installations
  where id = p_installation_id and company_id = p_company_id;
  if not found then
    raise exception 'Fiscal installation not found' using errcode = 'P0002';
  end if;
  software_ready := installation_row.software_solution_code is not null
    and installation_row.fiscalization_number is not null;
  taxpayer_ready := installation_row.taxpayer_identifier is not null
    and installation_row.unique_fiscalization_code is not null;
  key_ready := installation_row.signing_key_reference is not null;
  select exists (
    select 1 from public.fiscal_certificates certificate
    where certificate.installation_id = installation_row.id
      and certificate.company_id = p_company_id
      and certificate.status = 'active'
      and (certificate.valid_from is null or certificate.valid_from <= clock_timestamp())
      and (certificate.valid_until is null or certificate.valid_until > clock_timestamp())
  ) into certificate_ready;
  select coalesce((select enabled from public.company_feature_flags
    where company_id = p_company_id and flag = 'kosovo_efs_enabled'), false)
    and coalesce((select enabled from public.company_feature_flags
    where company_id = p_company_id and flag = 'kosovo_efs_production_enabled'), false)
    into feature_enabled;

  if not (
    false -- software certification is intentionally false until TAK certifies this exact build
    and software_ready
    and taxpayer_ready
    and installation_row.status = 'active'
    and certificate_ready
    and key_ready
    and feature_enabled
  ) then
    raise exception 'Production EFS guard blocked: OperiX is not TAK certified or configured for production'
      using errcode = '55000';
  end if;
  return jsonb_build_object('allowed', true, 'production', true);
end
$$;

insert into public.app_permissions (code, name, category, description, is_sensitive) values
  ('efs.configuration.view','View EFS configuration','compliance','View tenant-isolated EFS readiness and installation metadata.',false),
  ('efs.configuration.manage','Manage EFS configuration','compliance','Manage EFS installation and certificate metadata without storing private key material.',true),
  ('efs.fiscalize','Fiscalize an eligible transaction','compliance','Request a guarded EFS fiscalization operation.',true),
  ('efs.audit.view','View EFS audit history','compliance','View append-only EFS configuration and transaction events.',true),
  ('efs.diagnostics.view','View EFS diagnostics','compliance','View EFS readiness diagnostics.',false)
on conflict (code) do update set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  is_sensitive = excluded.is_sensitive;

insert into public.app_role_permissions (role_id, permission_code)
select role.id, permission.code
from public.app_roles role
join public.app_permissions permission
  on permission.code in (
    'efs.configuration.view','efs.configuration.manage','efs.fiscalize',
    'efs.audit.view','efs.diagnostics.view'
  )
where role.company_id is null
  and role.code in ('owner','super_administrator','company_administrator','senior_accountant','auditor')
  and (role.code <> 'auditor' or permission.code in ('efs.configuration.view','efs.audit.view','efs.diagnostics.view'))
on conflict do nothing;

alter table public.fiscal_installations enable row level security;
alter table public.fiscal_certificates enable row level security;
alter table public.fiscal_configuration_history enable row level security;
alter table public.fiscal_transaction_events enable row level security;
alter table public.fiscal_receipts enable row level security;

create policy fiscal_installations_select on public.fiscal_installations
for select to authenticated using ((select private.has_company_permission(company_id, 'efs.configuration.view')));
create policy fiscal_certificates_select on public.fiscal_certificates
for select to authenticated using ((select private.has_company_permission(company_id, 'efs.configuration.view')));
create policy fiscal_configuration_history_select on public.fiscal_configuration_history
for select to authenticated using ((select private.has_company_permission(company_id, 'efs.audit.view')));
create policy fiscal_transaction_events_select on public.fiscal_transaction_events
for select to authenticated using ((select private.has_company_permission(company_id, 'efs.audit.view')));
create policy fiscal_receipts_select on public.fiscal_receipts
for select to authenticated using ((select private.has_company_permission(company_id, 'pos.fiscal.view')));

create or replace function private.reject_efs_event_secrets()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.reject_efs_secret_json(new.details, 'EFS transaction event details');
  return new;
end
$$;

create or replace function private.reject_efs_configuration_history_secrets()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform private.reject_efs_secret_json(new.changed_fields, 'EFS configuration history');
  return new;
end
$$;

create trigger fiscal_transaction_events_reject_secrets
before insert on public.fiscal_transaction_events
for each row execute function private.reject_efs_event_secrets();
create trigger fiscal_configuration_history_reject_secrets
before insert on public.fiscal_configuration_history
for each row execute function private.reject_efs_configuration_history_secrets();

create trigger fiscal_installations_audit
after insert or update or delete on public.fiscal_installations
for each row execute function private.audit_table_change();
create trigger fiscal_certificates_audit
after insert or update or delete on public.fiscal_certificates
for each row execute function private.audit_table_change();
create trigger fiscal_configuration_history_audit
after insert on public.fiscal_configuration_history
for each row execute function private.audit_table_change();
create trigger fiscal_transaction_events_audit
after insert on public.fiscal_transaction_events
for each row execute function private.audit_table_change();
create trigger fiscal_receipts_audit
after insert on public.fiscal_receipts
for each row execute function private.audit_table_change();

revoke all on function public.upsert_fiscal_installation(
  uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,boolean
) from public;
grant execute on function public.upsert_fiscal_installation(
  uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,boolean
) to authenticated;
revoke all on function public.record_fiscal_certificate_metadata(
  uuid,uuid,text,text,text,text,timestamptz,timestamptz,text
) from public;
grant execute on function public.record_fiscal_certificate_metadata(
  uuid,uuid,text,text,text,text,timestamptz,timestamptz,text
) to authenticated;
revoke all on function public.get_efs_readiness(uuid,uuid) from public, anon;
grant execute on function public.get_efs_readiness(uuid,uuid) to authenticated;
revoke all on function public.assert_efs_production_ready(uuid,uuid) from public, anon;
grant execute on function public.assert_efs_production_ready(uuid,uuid) to authenticated;

comment on table public.fiscal_installations is
  'Tenant-isolated EFS installation metadata. TAK-issued codes are entered by an authorized applicant; OperiX never generates them.';
comment on table public.fiscal_certificates is
  'Certificate metadata and secure secret references only. Private keys and certificate material are prohibited.';
comment on table public.fiscal_transaction_events is
  'Append-only, tamper-evident fiscal event evidence. It is not proof of TAK certification.';
comment on function public.assert_efs_production_ready(uuid,uuid) is
  'Hard backend guard. Always blocks until the exact OperiX build is formally TAK certified and all production prerequisites exist.';
