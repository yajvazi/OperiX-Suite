-- Phase E5 foundation: registered POS devices and an idempotent offline replay
-- boundary. Offline items always pass through public.complete_pos_sale; this is
-- not a second or weaker financial posting path.

create table public.device_registrations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  terminal_id uuid not null references public.pos_terminals(id) on delete restrict,
  device_identifier text not null,
  display_name text not null,
  platform text,
  app_version text,
  operating_system text,
  public_key_fingerprint text not null,
  status text not null default 'active'
    check (status in ('active','suspended','revoked')),
  encryption_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(encryption_metadata) = 'object'),
  configuration_version integer not null default 1 check (configuration_version > 0),
  sync_cursor bigint not null default 0 check (sync_cursor >= 0),
  last_seen_at timestamptz,
  registered_at timestamptz not null default clock_timestamp(),
  registered_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revoke_reason text,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (company_id, device_identifier),
  unique (company_id, public_key_fingerprint)
);
create index device_registrations_terminal_status_idx
  on public.device_registrations (terminal_id, status);

create table public.offline_sync_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  device_registration_id uuid not null references public.device_registrations(id) on delete restrict,
  terminal_id uuid not null references public.pos_terminals(id) on delete restrict,
  status text not null default 'queued'
    check (status in ('queued','processing','partially_completed','completed','failed')),
  item_count integer not null default 0 check (item_count >= 0),
  completed_count integer not null default 0 check (completed_count >= 0),
  conflict_count integer not null default 0 check (conflict_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id) on delete set null
);
create index offline_sync_batches_device_created_idx
  on public.offline_sync_batches (device_registration_id, created_at desc);

create table public.offline_sync_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  batch_id uuid not null references public.offline_sync_batches(id) on delete restrict,
  device_registration_id uuid not null references public.device_registrations(id) on delete restrict,
  client_item_id uuid not null,
  idempotency_key uuid not null,
  queue_sequence bigint not null check (queue_sequence >= 0),
  configuration_version integer not null check (configuration_version > 0),
  integrity_checksum text not null,
  client_queue_encrypted boolean not null default true,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'queued'
    check (status in ('queued','processing','completed','conflict','failed','rejected')),
  conflict_type text,
  error_code text,
  error_message text,
  result jsonb,
  original_occurred_at timestamptz not null,
  server_posted_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  processed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  unique (company_id, device_registration_id, client_item_id),
  unique (company_id, device_registration_id, idempotency_key),
  unique (device_registration_id, queue_sequence)
);
create index offline_sync_items_batch_status_idx
  on public.offline_sync_items (batch_id, status, queue_sequence);

create function private.prevent_offline_record_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'POS device and offline synchronization history cannot be deleted'
      using errcode = '55000';
  end if;
  if coalesce(current_setting('app.offline_sync_workflow', true), '') <> 'authorized' then
    raise exception 'POS device and offline synchronization records may only change through authorized commands'
      using errcode = '55000';
  end if;
  return new;
end
$$;

create function public.register_pos_device(
  p_company_id uuid,
  p_terminal_id uuid,
  p_device_identifier text,
  p_display_name text,
  p_public_key_fingerprint text,
  p_platform text default null,
  p_app_version text default null,
  p_operating_system text default null,
  p_encryption_metadata jsonb default '{}'::jsonb
)
returns public.device_registrations
language plpgsql
security definer
set search_path = ''
as $$
declare
  terminal_row public.pos_terminals;
  device_row public.device_registrations;
begin
  if not (select private.has_company_permission(p_company_id, 'pos.device.manage')) then
    raise exception 'Insufficient permission to register POS devices' using errcode = '42501';
  end if;
  if nullif(trim(p_device_identifier), '') is null
     or nullif(trim(p_display_name), '') is null
     or nullif(trim(p_public_key_fingerprint), '') is null then
    raise exception 'Device identifier, display name, and public-key fingerprint are required'
      using errcode = '23514';
  end if;
  terminal_row := private.assert_cashier_shift_access(p_company_id, p_terminal_id);

  insert into public.device_registrations (
    company_id, terminal_id, device_identifier, display_name, platform,
    app_version, operating_system, public_key_fingerprint,
    encryption_metadata, configuration_version, last_seen_at,
    registered_by, updated_by
  )
  values (
    p_company_id, terminal_row.id, trim(p_device_identifier), trim(p_display_name),
    nullif(trim(p_platform), ''), nullif(trim(p_app_version), ''),
    nullif(trim(p_operating_system), ''), trim(p_public_key_fingerprint),
    coalesce(p_encryption_metadata, '{}'::jsonb), terminal_row.configuration_version,
    clock_timestamp(), (select auth.uid()), (select auth.uid())
  )
  returning * into device_row;

  perform private.emit_domain_outbox_event(
    p_company_id, terminal_row.branch_id, 'device_registration', device_row.id,
    'pos_device.registered',
    jsonb_build_object('terminal_id', terminal_row.id, 'configuration_version', device_row.configuration_version),
    'pos_device.registered:' || device_row.id::text
  );
  return device_row;
end
$$;

create function public.revoke_pos_device(
  p_company_id uuid,
  p_device_registration_id uuid,
  p_reason text
)
returns public.device_registrations
language plpgsql
security definer
set search_path = ''
as $$
declare device_row public.device_registrations;
begin
  if not (select private.has_company_permission(p_company_id, 'pos.device.manage')) then
    raise exception 'Insufficient permission to revoke POS devices' using errcode = '42501';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'A device revocation reason is required' using errcode = '23514';
  end if;
  select * into device_row
  from public.device_registrations
  where id = p_device_registration_id and company_id = p_company_id
  for update;
  if not found then
    raise exception 'POS device registration not found' using errcode = 'P0002';
  end if;
  perform set_config('app.offline_sync_workflow', 'authorized', true);
  update public.device_registrations
  set status = 'revoked', revoked_at = clock_timestamp(),
      revoked_by = (select auth.uid()), revoke_reason = trim(p_reason),
      updated_at = clock_timestamp(), updated_by = (select auth.uid())
  where id = device_row.id
  returning * into device_row;
  perform set_config('app.offline_sync_workflow', '', true);
  return device_row;
end
$$;

create function public.create_offline_sync_batch(
  p_company_id uuid,
  p_device_registration_id uuid
)
returns public.offline_sync_batches
language plpgsql
security definer
set search_path = ''
as $$
declare
  device_row public.device_registrations;
  batch_row public.offline_sync_batches;
begin
  if not (select private.has_company_permission(p_company_id, 'pos.offline.use')) then
    raise exception 'Insufficient permission to synchronize offline POS sales' using errcode = '42501';
  end if;
  if not coalesce((
    select enabled from public.company_feature_flags
    where company_id = p_company_id and flag = 'offline_pos_enabled'
  ), false) then
    raise exception 'Offline POS is not enabled for this company' using errcode = '55000';
  end if;
  select * into device_row
  from public.device_registrations
  where id = p_device_registration_id and company_id = p_company_id
  for update;
  if not found or device_row.status <> 'active' then
    raise exception 'An active registered POS device is required' using errcode = '42501';
  end if;

  insert into public.offline_sync_batches (
    company_id, device_registration_id, terminal_id, created_by
  )
  values (p_company_id, device_row.id, device_row.terminal_id, (select auth.uid()))
  returning * into batch_row;
  return batch_row;
end
$$;

create function public.submit_offline_pos_sale(
  p_company_id uuid,
  p_batch_id uuid,
  p_device_registration_id uuid,
  p_client_item_id uuid,
  p_idempotency_key uuid,
  p_queue_sequence bigint,
  p_configuration_version integer,
  p_integrity_checksum text,
  p_canonical_payload text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  batch_row public.offline_sync_batches;
  device_row public.device_registrations;
  item_row public.offline_sync_items;
  expected_checksum text;
  result_value jsonb;
  order_id_value uuid;
  failure_state text;
begin
  if not (select private.has_company_permission(p_company_id, 'pos.offline.use')) then
    raise exception 'Insufficient permission to synchronize offline POS sales' using errcode = '42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Offline POS payload must be an object' using errcode = '23514';
  end if;
  if nullif(p_canonical_payload, '') is null
     or p_canonical_payload::jsonb <> p_payload then
    raise exception 'Canonical offline payload does not match the submitted payload'
      using errcode = '22000';
  end if;
  if not coalesce((
    select enabled from public.company_feature_flags
    where company_id = p_company_id and flag = 'offline_pos_enabled'
  ), false) then
    raise exception 'Offline POS is not enabled for this company' using errcode = '55000';
  end if;

  select * into device_row
  from public.device_registrations
  where id = p_device_registration_id and company_id = p_company_id
  for update;
  if not found or device_row.status <> 'active' then
    raise exception 'Device registration is revoked, suspended, or unavailable' using errcode = '42501';
  end if;
  if device_row.configuration_version <> p_configuration_version then
    raise exception 'POS configuration changed after this offline item was queued'
      using errcode = '40001';
  end if;

  select * into batch_row
  from public.offline_sync_batches
  where id = p_batch_id
    and company_id = p_company_id
    and device_registration_id = device_row.id
  for update;
  if not found or batch_row.status in ('completed','failed') then
    raise exception 'Offline synchronization batch is unavailable' using errcode = '55000';
  end if;

  expected_checksum := encode(
    extensions.digest(convert_to(p_canonical_payload, 'utf8'), 'sha256'),
    'hex'
  );
  if expected_checksum <> lower(trim(p_integrity_checksum)) then
    raise exception 'Offline queue integrity validation failed' using errcode = '22000';
  end if;

  insert into public.offline_sync_items (
    company_id, batch_id, device_registration_id, client_item_id,
    idempotency_key, queue_sequence, configuration_version,
    integrity_checksum, payload, status, original_occurred_at, created_by
  )
  values (
    p_company_id, batch_row.id, device_row.id, p_client_item_id,
    p_idempotency_key, p_queue_sequence, p_configuration_version,
    expected_checksum, p_payload, 'processing',
    coalesce(nullif(p_payload ->> 'occurred_at', '')::timestamptz, clock_timestamp()),
    (select auth.uid())
  )
  on conflict (company_id, device_registration_id, client_item_id) do nothing;

  select * into item_row
  from public.offline_sync_items
  where company_id = p_company_id
    and device_registration_id = device_row.id
    and client_item_id = p_client_item_id
  for update;

  if item_row.status = 'completed' then
    return item_row.result || jsonb_build_object('offline_sync_item_id', item_row.id, 'idempotent', true);
  end if;
  if item_row.idempotency_key <> p_idempotency_key
     or item_row.integrity_checksum <> expected_checksum then
    raise exception 'Offline item identity does not match its prior submission' using errcode = '23505';
  end if;

  perform set_config('app.offline_sync_workflow', 'authorized', true);
  update public.offline_sync_batches
  set status = 'processing', started_at = coalesce(started_at, clock_timestamp())
  where id = batch_row.id;
  perform set_config('app.offline_sync_workflow', '', true);

  begin
    result_value := public.complete_pos_sale(
      p_company_id,
      device_row.terminal_id,
      nullif(p_payload ->> 'customer_id', '')::uuid,
      p_payload -> 'items',
      p_payload -> 'payments',
      coalesce(nullif(p_payload ->> 'invoice_type', ''), 'invoice'),
      nullif(p_payload ->> 'notes', ''),
      p_idempotency_key,
      item_row.original_occurred_at
    );

    order_id_value := nullif(result_value ->> 'order_id', '')::uuid;
    perform set_config('app.pos_workflow', 'authorized', true);
    update public.pos_orders
    set source = 'offline_sync',
        metadata = metadata || jsonb_build_object(
          'offline_sync_item_id', item_row.id,
          'device_registration_id', device_row.id,
          'original_occurred_at', item_row.original_occurred_at
        ),
        updated_at = clock_timestamp(),
        updated_by = (select auth.uid())
    where id = order_id_value;
    perform set_config('app.pos_workflow', '', true);

    perform set_config('app.offline_sync_workflow', 'authorized', true);
    update public.offline_sync_items
    set status = 'completed', result = result_value,
        server_posted_at = clock_timestamp(), processed_at = clock_timestamp()
    where id = item_row.id;
    perform set_config('app.offline_sync_workflow', '', true);
  exception when others then
    failure_state := case
      when sqlstate in ('40001','23505') then 'conflict'
      when sqlstate in ('42501','23514','55000') then 'rejected'
      else 'failed'
    end;
    perform set_config('app.offline_sync_workflow', 'authorized', true);
    update public.offline_sync_items
    set status = failure_state,
        conflict_type = case when failure_state = 'conflict' then sqlstate end,
        error_code = sqlstate, error_message = sqlerrm,
        processed_at = clock_timestamp()
    where id = item_row.id;
    perform set_config('app.offline_sync_workflow', '', true);
    result_value := jsonb_build_object(
      'offline_sync_item_id', item_row.id,
      'status', failure_state,
      'error_code', sqlstate,
      'error_message', sqlerrm
    );
  end;

  perform set_config('app.offline_sync_workflow', 'authorized', true);
  update public.device_registrations
  set last_seen_at = clock_timestamp(),
      sync_cursor = greatest(sync_cursor, p_queue_sequence),
      updated_at = clock_timestamp(), updated_by = (select auth.uid())
  where id = device_row.id;
  update public.offline_sync_batches batch
  set item_count = aggregate.item_count,
      completed_count = aggregate.completed_count,
      conflict_count = aggregate.conflict_count,
      failed_count = aggregate.failed_count,
      status = case
        when aggregate.open_count > 0 then 'processing'
        when aggregate.failed_count > 0 or aggregate.conflict_count > 0 then 'partially_completed'
        else 'completed'
      end,
      completed_at = case when aggregate.open_count = 0 then clock_timestamp() end
  from (
    select count(*)::integer item_count,
      count(*) filter (where status = 'completed')::integer completed_count,
      count(*) filter (where status = 'conflict')::integer conflict_count,
      count(*) filter (where status in ('failed','rejected'))::integer failed_count,
      count(*) filter (where status in ('queued','processing'))::integer open_count
    from public.offline_sync_items
    where batch_id = batch_row.id
  ) aggregate
  where batch.id = batch_row.id;
  perform set_config('app.offline_sync_workflow', '', true);

  return coalesce(result_value, '{}'::jsonb)
    || jsonb_build_object('offline_sync_item_id', item_row.id);
end
$$;

insert into public.app_permissions (code,name,category,description,is_sensitive) values
  ('pos.device.manage','Manage POS devices','pos','Register, suspend, and revoke POS device identities.',true),
  ('pos.offline.use','Use offline POS','pos','Queue and synchronize approved offline POS sales.',true),
  ('pos.offline.resolve','Resolve offline POS conflicts','pos','Review and resolve offline synchronization conflicts.',true)
on conflict (code) do update
set name=excluded.name,category=excluded.category,description=excluded.description,is_sensitive=excluded.is_sensitive;

insert into public.app_role_permissions (role_id,permission_code)
select role.id, permission.code
from public.app_roles role
join public.app_permissions permission
  on permission.code in ('pos.device.manage','pos.offline.use','pos.offline.resolve')
where role.company_id is null
  and role.code in ('owner','super_administrator','company_administrator','cashier')
  and (role.code <> 'cashier' or permission.code = 'pos.offline.use')
on conflict do nothing;

alter table public.device_registrations enable row level security;
alter table public.offline_sync_batches enable row level security;
alter table public.offline_sync_items enable row level security;

create policy device_registrations_select on public.device_registrations
for select to authenticated
using ((select private.is_company_member(company_id)));
create policy offline_sync_batches_select on public.offline_sync_batches
for select to authenticated
using ((select private.is_company_member(company_id)));
create policy offline_sync_items_select on public.offline_sync_items
for select to authenticated
using ((select private.is_company_member(company_id)));

create trigger device_registrations_controlled
before update or delete on public.device_registrations
for each row execute function private.prevent_offline_record_mutation();
create trigger offline_sync_batches_controlled
before update or delete on public.offline_sync_batches
for each row execute function private.prevent_offline_record_mutation();
create trigger offline_sync_items_controlled
before update or delete on public.offline_sync_items
for each row execute function private.prevent_offline_record_mutation();

create trigger device_registrations_audit
after insert or update or delete on public.device_registrations
for each row execute function private.audit_table_change();
create trigger offline_sync_batches_audit
after insert or update or delete on public.offline_sync_batches
for each row execute function private.audit_table_change();
create trigger offline_sync_items_audit
after insert or update or delete on public.offline_sync_items
for each row execute function private.audit_table_change();

revoke all on function public.register_pos_device(uuid,uuid,text,text,text,text,text,text,jsonb) from public;
revoke all on function public.revoke_pos_device(uuid,uuid,text) from public;
revoke all on function public.create_offline_sync_batch(uuid,uuid) from public;
revoke all on function public.submit_offline_pos_sale(uuid,uuid,uuid,uuid,uuid,bigint,integer,text,text,jsonb) from public;
grant execute on function public.register_pos_device(uuid,uuid,text,text,text,text,text,text,jsonb) to authenticated;
grant execute on function public.revoke_pos_device(uuid,uuid,text) to authenticated;
grant execute on function public.create_offline_sync_batch(uuid,uuid) to authenticated;
grant execute on function public.submit_offline_pos_sale(uuid,uuid,uuid,uuid,uuid,bigint,integer,text,text,jsonb) to authenticated;

comment on table public.device_registrations is
  'Revocable POS device identity bound to a terminal and a public-key fingerprint; browser metadata alone is not trusted.';
comment on function public.submit_offline_pos_sale(uuid,uuid,uuid,uuid,uuid,bigint,integer,text,text,jsonb) is
  'Integrity-checks and idempotently replays an offline POS item through the normal transactional complete_pos_sale command.';
