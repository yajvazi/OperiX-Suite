-- Public API mutations that accept an external reference must persist the
-- reference in the same database transaction as the canonical domain write.
-- These wrappers deliberately delegate validation, money calculation,
-- lifecycle checks, availability checks, and RBAC to existing domain commands.

create or replace function public.save_invoice_document_with_external_reference(
  p_invoice jsonb,
  p_items jsonb,
  p_invoice_id uuid default null,
  p_post_invoice boolean default false,
  p_idempotency_key uuid default null
)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.invoices;
begin
  result := public.save_invoice_document(p_invoice, p_items, p_invoice_id, p_post_invoice, p_idempotency_key);
  if p_invoice ? 'external_reference' then
    update public.invoices
    set external_reference = nullif(trim(p_invoice ->> 'external_reference'), '')
    where id = result.id and company_id = result.company_id
    returning * into result;
    -- The live outbox trigger runs during the canonical insert. Keep its
    -- immutable event snapshot aligned with the final transaction result.
    if p_invoice_id is null then
      update public.api_webhook_events event_row
      set payload = jsonb_set(event_row.payload, '{data,object,external_reference}', to_jsonb(result.external_reference), true)
      where event_row.id = (
        select candidate.id
        from public.api_webhook_events candidate
        where candidate.company_id = result.company_id
          and candidate.environment = 'live'
          and candidate.event_type = 'invoice.created'
          and candidate.object_id = result.id
        order by candidate.created_at desc, candidate.id desc
        limit 1
      );
    end if;
  end if;
  return result;
end;
$$;

revoke all on function public.save_invoice_document_with_external_reference(jsonb, jsonb, uuid, boolean, uuid) from public, anon;
grant execute on function public.save_invoice_document_with_external_reference(jsonb, jsonb, uuid, boolean, uuid) to authenticated;

create or replace function public.booking_create_with_external_reference(
  p_company_id uuid,
  p_customer_id uuid default null,
  p_guest_name text default null,
  p_guest_email text default null,
  p_guest_phone text default null,
  p_service_id uuid default null,
  p_location_id uuid default null,
  p_resource_id uuid default null,
  p_staff_id uuid default null,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_quantity integer default 1,
  p_participant_count integer default 1,
  p_requested_status text default 'confirmed',
  p_notes text default null,
  p_internal_notes text default null,
  p_customer_notes text default null,
  p_source text default 'admin',
  p_recurrence_rule text default null,
  p_recurrence_series_id uuid default null,
  p_external_reference text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.bookings;
begin
  result := public.booking_create(
    p_company_id, p_customer_id, p_guest_name, p_guest_email, p_guest_phone,
    p_service_id, p_location_id, p_resource_id, p_staff_id, p_starts_at,
    p_ends_at, p_quantity, p_participant_count, p_requested_status, p_notes,
    p_internal_notes, p_customer_notes, p_source, p_recurrence_rule,
    p_recurrence_series_id
  );
  update public.bookings
  set external_reference = nullif(trim(p_external_reference), '')
  where id = result.id and company_id = p_company_id
  returning * into result;
  update public.api_webhook_events event_row
  set payload = jsonb_set(event_row.payload, '{data,object,external_reference}', to_jsonb(result.external_reference), true)
  where event_row.id = (
    select candidate.id
    from public.api_webhook_events candidate
    where candidate.company_id = result.company_id
      and candidate.environment = 'live'
      and candidate.event_type = 'booking.created'
      and candidate.object_id = result.id
    order by candidate.created_at desc, candidate.id desc
    limit 1
  );
  return result;
end;
$$;

revoke all on function public.booking_create_with_external_reference(uuid, uuid, text, text, text, uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, integer, text, text, text, text, text, text, uuid, text) from public, anon;
grant execute on function public.booking_create_with_external_reference(uuid, uuid, text, text, text, uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, integer, text, text, text, text, text, text, uuid, text) to authenticated;

create or replace function public.booking_update_with_external_reference(
  p_company_id uuid,
  p_booking_id uuid,
  p_customer_id uuid default null,
  p_guest_name text default null,
  p_guest_email text default null,
  p_guest_phone text default null,
  p_service_id uuid default null,
  p_location_id uuid default null,
  p_resource_id uuid default null,
  p_staff_id uuid default null,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_quantity integer default 1,
  p_participant_count integer default 1,
  p_notes text default null,
  p_internal_notes text default null,
  p_customer_notes text default null,
  p_source text default 'admin',
  p_external_reference text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.bookings;
begin
  result := public.booking_update(
    p_company_id, p_booking_id, p_customer_id, p_guest_name, p_guest_email,
    p_guest_phone, p_service_id, p_location_id, p_resource_id, p_staff_id,
    p_starts_at, p_ends_at, p_quantity, p_participant_count, p_notes,
    p_internal_notes, p_customer_notes, p_source
  );
  update public.bookings
  set external_reference = nullif(trim(p_external_reference), '')
  where id = result.id and company_id = p_company_id
  returning * into result;
  return result;
end;
$$;

revoke all on function public.booking_update_with_external_reference(uuid, uuid, uuid, text, text, text, uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, integer, text, text, text, text, text) from public, anon;
grant execute on function public.booking_update_with_external_reference(uuid, uuid, uuid, text, text, text, uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, integer, text, text, text, text, text) to authenticated;

comment on function public.save_invoice_document_with_external_reference(jsonb, jsonb, uuid, boolean, uuid) is
  'Canonical invoice save plus an atomic tenant-scoped external reference for Public API mutations.';
comment on function public.booking_create_with_external_reference(uuid, uuid, text, text, text, uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, integer, text, text, text, text, text, text, uuid, text) is
  'Canonical booking create plus an atomic tenant-scoped external reference for Public API mutations.';
comment on function public.booking_update_with_external_reference(uuid, uuid, uuid, text, text, text, uuid, uuid, uuid, uuid, timestamptz, timestamptz, integer, integer, text, text, text, text, text) is
  'Canonical booking update plus an atomic tenant-scoped external reference for Public API mutations.';

-- Keep the management RPC fail-closed as well as the web UI. A caller with
-- settings.integrations permission must still have the paid API entitlement
-- before creating or rotating credentials.
create or replace function public.api_create_key(
  p_company_id uuid,
  p_name text,
  p_environment text,
  p_scopes text[],
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret text := 'opx_' || p_environment || '_' || encode(extensions.gen_random_bytes(32), 'base64');
  clean_secret text := replace(replace(replace(secret, '+', '-'), '/', '_'), '=', '');
  key_row public.api_keys;
begin
  if (select auth.uid()) is null
     or not private.has_company_permission(p_company_id, 'settings.integrations')
     or not private.api_addon_access(p_company_id) then
    raise exception 'API management denied' using errcode = '42501';
  end if;
  if p_environment not in ('test', 'live')
     or p_name is null
     or char_length(trim(p_name)) not between 1 and 120
     or p_scopes is null
     or cardinality(p_scopes) = 0
     or exists (
       select 1 from unnest(p_scopes) requested(scope)
       where requested.scope not in (
         'invoice:read','invoice:write','invoice:finalize','invoice:void',
         'customer:read','customer:write','product:read','product:write',
         'payment:read','payment:write','document:read','document:write',
         'booking:read','booking:write','booking:cancel','availability:read',
         'service:read','service:write','provider:read','provider:write',
         'resource:read','resource:write','location:read','location:write',
         'booking_customer:read','booking_customer:write'
       )
     ) then
    raise exception 'Invalid API key configuration' using errcode = '22023';
  end if;
  insert into public.api_keys(company_id, environment, name, key_prefix, key_hash, created_by, scopes, expires_at)
    values (p_company_id, p_environment, trim(p_name), left(clean_secret, 13) || '…' || right(clean_secret, 4), 'sha256:' || encode(extensions.digest(clean_secret, 'sha256'), 'hex'), (select auth.uid()), p_scopes, p_expires_at)
    returning * into key_row;
  insert into public.api_key_scopes(api_key_id, scope) select key_row.id, unnest(p_scopes);
  return jsonb_build_object('id', key_row.id, 'name', key_row.name, 'environment', key_row.environment, 'key', clean_secret, 'key_prefix', key_row.key_prefix, 'scopes', key_row.scopes, 'created_at', key_row.created_at, 'expires_at', key_row.expires_at);
end;
$$;

revoke all on function public.api_create_key(uuid, text, text, text[], timestamptz) from public;
grant execute on function public.api_create_key(uuid, text, text, text[], timestamptz) to authenticated;

create or replace function public.api_rotate_key(p_company_id uuid, p_key_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret text := 'opx_live_' || encode(extensions.gen_random_bytes(32), 'base64');
  existing public.api_keys;
  clean_secret text := replace(replace(replace(secret, '+', '-'), '/', '_'), '=', '');
begin
  if (select auth.uid()) is null
     or not private.has_company_permission(p_company_id, 'settings.integrations')
     or not private.api_addon_access(p_company_id) then
    raise exception 'API management denied' using errcode = '42501';
  end if;
  select * into existing from public.api_keys where id = p_key_id and company_id = p_company_id for update;
  if existing.id is null then raise exception 'API key not found' using errcode = '22023'; end if;
  clean_secret := 'opx_' || existing.environment || '_' || substr(clean_secret, 10);
  update public.api_keys
  set key_prefix = left(clean_secret, 13) || '…' || right(clean_secret, 4),
      key_hash = 'sha256:' || encode(extensions.digest(clean_secret, 'sha256'), 'hex'),
      revoked_at = null,
      updated_at = now()
  where id = existing.id;
  return jsonb_build_object('id', existing.id, 'name', existing.name, 'environment', existing.environment, 'key', clean_secret, 'key_prefix', left(clean_secret, 13) || '…' || right(clean_secret, 4), 'scopes', existing.scopes);
end;
$$;

revoke all on function public.api_rotate_key(uuid, uuid) from public;
grant execute on function public.api_rotate_key(uuid, uuid) to authenticated;
