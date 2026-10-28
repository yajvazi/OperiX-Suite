-- Durable, opt-in Booking -> Invoice automation.  The trigger only queues
-- work; invoice creation remains in the existing Invoice domain service and
-- is performed by a retry-safe server worker.

begin;

create or replace function public.booking_invoice_automation_access(p_company_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.operix_server_request()
    and private.operix_product_access(p_company_id, 'booking')
    and private.operix_product_access(p_company_id, 'invoice');
$$;

revoke all on function public.booking_invoice_automation_access(uuid) from public;
grant execute on function public.booking_invoice_automation_access(uuid) to service_role;

create or replace function public.booking_invoice_automation_allowed(p_company_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null
    and public.can_access_company(p_company_id)
    and private.operix_product_access(p_company_id, 'booking')
    and private.operix_product_access(p_company_id, 'invoice');
$$;

revoke all on function public.booking_invoice_automation_allowed(uuid) from public;
grant execute on function public.booking_invoice_automation_allowed(uuid) to authenticated, service_role;

create or replace function private.queue_booking_invoice_job()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  setting_row public.booking_invoice_automation_settings;
  trigger_name text;
  old_paid numeric := case when tg_op = 'UPDATE' then coalesce(old.paid_amount, 0) else 0 end;
  new_paid numeric := coalesce(new.paid_amount, 0);
begin
  if not private.operix_product_access(new.company_id, 'booking')
     or not private.operix_product_access(new.company_id, 'invoice') then
    return new;
  end if;
  select * into setting_row from public.booking_invoice_automation_settings where company_id = new.company_id;
  if not coalesce(setting_row.enabled, false) then return new; end if;

  if setting_row.trigger_event = 'payment_received' and (new_paid > old_paid or new.payment_status = 'paid') then
    trigger_name := 'payment_received';
  elsif setting_row.trigger_event = 'confirmed' and new.status = 'confirmed' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    trigger_name := 'confirmed';
  elsif setting_row.trigger_event = 'checked_in' and new.status = 'checked_in' and old.status is distinct from new.status then
    trigger_name := 'checked_in';
  elsif setting_row.trigger_event = 'completed' and new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    trigger_name := 'completed';
  else
    return new;
  end if;

  insert into public.booking_invoice_jobs(company_id, booking_id, trigger_event)
    values (new.company_id, new.id, trigger_name)
    on conflict (company_id, booking_id, trigger_event) do nothing;
  return new;
end;
$$;

revoke all on function private.queue_booking_invoice_job() from public;
grant execute on function private.queue_booking_invoice_job() to service_role;

drop trigger if exists booking_invoice_automation_queue on public.bookings;
create trigger booking_invoice_automation_queue
after insert or update of status, payment_status, paid_amount on public.bookings
for each row execute function private.queue_booking_invoice_job();

create or replace function public.booking_invoice_claim_jobs(p_limit integer default 25)
returns table(job_id uuid, company_id uuid, booking_id uuid, trigger_event text, attempts integer)
language plpgsql security definer set search_path = ''
as $$
begin
  if not private.operix_server_request() then raise exception 'Server-only automation function' using errcode = '42501'; end if;
  return query
  with candidates as (
    select job.id
    from public.booking_invoice_jobs job
    where job.status in ('pending', 'failed')
      and job.available_at <= now()
    order by job.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 25), 100))
  ), claimed as (
    update public.booking_invoice_jobs job
    set status = 'processing', attempts = job.attempts + 1, locked_at = now(), updated_at = now()
    from candidates
    where job.id = candidates.id
    returning job.id, job.company_id, job.booking_id, job.trigger_event, job.attempts
  )
  select claimed.id, claimed.company_id, claimed.booking_id, claimed.trigger_event, claimed.attempts from claimed;
end;
$$;

revoke all on function public.booking_invoice_claim_jobs(integer) from public;
grant execute on function public.booking_invoice_claim_jobs(integer) to service_role;

-- Domain-owned webhook outbox. Native Web/Mobile mutations and Public API
-- mutations both pass through these database events, so webhook behavior does
-- not depend on one particular client implementation. Payloads are explicit
-- public projections; internal rows and secrets are never serialized.
create or replace function private.api_enqueue_webhook_event(
  p_company_id uuid,
  p_type text,
  p_object_id uuid,
  p_object jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.api_webhook_events;
  event_identifier text := 'evt_' || replace(gen_random_uuid()::text, '-', '');
  created_value timestamptz := now();
begin
  if p_company_id is null
     or p_type not in (
       'invoice.created','invoice.finalized','invoice.paid','invoice.partially_paid','invoice.overdue','invoice.voided',
       'payment.created','customer.created',
       'booking.created','booking.confirmed','booking.rescheduled','booking.cancelled','booking.checked_in','booking.completed','booking.no_show'
     )
     or not private.api_addon_access(p_company_id) then
    return;
  end if;

  insert into public.api_webhook_events(event_id, company_id, environment, event_type, object_id, payload)
    values (
      event_identifier, p_company_id, 'live', p_type, p_object_id,
      jsonb_build_object('id', event_identifier, 'type', p_type, 'created_at', created_value, 'data', jsonb_build_object('object', coalesce(p_object, '{}'::jsonb)))
    )
    returning * into event_row;

  insert into public.api_webhook_deliveries(event_id, endpoint_id, status, next_attempt_at)
    select event_row.id, endpoint.id, 'pending', created_value
    from public.api_webhook_endpoints endpoint
    where endpoint.company_id = p_company_id
      and endpoint.environment = 'live'
      and endpoint.status = 'active'
      and p_type = any(endpoint.subscribed_events);
end;
$$;

revoke all on function private.api_enqueue_webhook_event(uuid, text, uuid, jsonb) from public;
grant execute on function private.api_enqueue_webhook_event(uuid, text, uuid, jsonb) to authenticated, service_role;

create or replace function private.api_invoice_webhook_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status text := lower(coalesce(new.commercial_status::text, new.status::text, 'draft'));
  previous_status text := case when tg_op = 'UPDATE' then lower(coalesce(old.commercial_status::text, old.status::text, 'draft')) else null end;
  current_payment text := lower(coalesce(new.payment_status, 'not_applicable'));
  previous_payment text := case when tg_op = 'UPDATE' then lower(coalesce(old.payment_status, 'not_applicable')) else null end;
  object_value jsonb := jsonb_build_object(
    'id', new.id,
    'number', new.invoice_number,
    'status', current_status,
    'payment_status', current_payment,
    'subtotal', greatest(coalesce(new.total_amount, 0) - coalesce(new.tax_amount, 0), 0),
    'vat', new.tax_amount,
    'total', new.total_amount,
    'currency', new.currency,
    'customer_id', new.client_id,
    'external_reference', new.external_reference,
    'issue_date', new.issue_date,
    'due_date', new.due_date,
    'created_at', new.created_at,
    'updated_at', now()
  );
begin
  if tg_op = 'INSERT' then
    perform private.api_enqueue_webhook_event(new.company_id, 'invoice.created', new.id, object_value);
  end if;
  if tg_op = 'INSERT' or current_status is distinct from previous_status then
    if current_status in ('issued', 'finalized') and current_status is distinct from previous_status then
      perform private.api_enqueue_webhook_event(new.company_id, 'invoice.finalized', new.id, object_value);
    elsif current_status in ('cancelled', 'void', 'voided') and current_status is distinct from previous_status then
      perform private.api_enqueue_webhook_event(new.company_id, 'invoice.voided', new.id, object_value);
    elsif current_status = 'overdue' and current_status is distinct from previous_status then
      perform private.api_enqueue_webhook_event(new.company_id, 'invoice.overdue', new.id, object_value);
    end if;
  end if;
  if current_payment is distinct from previous_payment then
    if current_payment = 'paid' then
      perform private.api_enqueue_webhook_event(new.company_id, 'invoice.paid', new.id, object_value);
    elsif current_payment = 'partially_paid' then
      perform private.api_enqueue_webhook_event(new.company_id, 'invoice.partially_paid', new.id, object_value);
    elsif current_payment = 'overdue' then
      perform private.api_enqueue_webhook_event(new.company_id, 'invoice.overdue', new.id, object_value);
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.api_payment_webhook_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(coalesce(new.accounting_state, 'posted')) not in ('voided', 'reversed') and new.reversed_at is null then
    perform private.api_enqueue_webhook_event(new.company_id, 'payment.created', new.id, jsonb_build_object(
      'id', new.id, 'payment_number', new.payment_number, 'amount', new.amount, 'currency', new.currency,
      'payment_date', new.payment_date, 'payment_method', new.payment_method, 'customer_id', new.client_id,
      'invoice_id', new.invoice_id, 'external_reference', new.bank_reference, 'created_at', new.created_at
    ));
  end if;
  return new;
end;
$$;

create or replace function private.api_customer_webhook_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.api_enqueue_webhook_event(new.company_id, 'customer.created', new.id, jsonb_build_object(
    'id', new.id, 'name', new.name, 'email', new.email, 'phone', new.phone, 'company', new.company,
    'external_reference', new.external_reference, 'created_at', new.created_at, 'updated_at', now()
  ));
  return new;
end;
$$;

create or replace function private.api_booking_webhook_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status text := lower(coalesce(new.status, 'draft'));
  previous_status text := case when tg_op = 'UPDATE' then lower(coalesce(old.status, 'draft')) else null end;
  object_value jsonb := jsonb_build_object(
    'id', new.id, 'number', new.booking_number, 'status', current_status, 'service_id', new.service_id,
    'provider_id', new.staff_id, 'location_id', new.location_id, 'resource_id', new.resource_id,
    'customer_id', new.customer_id, 'starts_at', new.starts_at, 'ends_at', new.ends_at,
    'timezone', new.timezone, 'participant_count', new.participant_count, 'quantity', new.quantity,
    'price', new.price, 'discount', new.discount_amount, 'vat', new.tax_amount, 'total', new.total_amount,
    'paid', new.paid_amount, 'currency', new.currency, 'payment_status', new.payment_status,
    'external_reference', new.external_reference, 'created_at', new.created_at, 'updated_at', new.updated_at
  );
begin
  if tg_op = 'INSERT' then
    perform private.api_enqueue_webhook_event(new.company_id, 'booking.created', new.id, object_value);
  end if;
  if current_status is distinct from previous_status then
    case current_status
      when 'confirmed' then perform private.api_enqueue_webhook_event(new.company_id, 'booking.confirmed', new.id, object_value);
      when 'rescheduled' then perform private.api_enqueue_webhook_event(new.company_id, 'booking.rescheduled', new.id, object_value);
      when 'cancelled' then perform private.api_enqueue_webhook_event(new.company_id, 'booking.cancelled', new.id, object_value);
      when 'checked_in' then perform private.api_enqueue_webhook_event(new.company_id, 'booking.checked_in', new.id, object_value);
      when 'completed' then perform private.api_enqueue_webhook_event(new.company_id, 'booking.completed', new.id, object_value);
      when 'no_show' then perform private.api_enqueue_webhook_event(new.company_id, 'booking.no_show', new.id, object_value);
      else null;
    end case;
  end if;
  return new;
end;
$$;

revoke all on function private.api_invoice_webhook_trigger() from public;
revoke all on function private.api_payment_webhook_trigger() from public;
revoke all on function private.api_customer_webhook_trigger() from public;
revoke all on function private.api_booking_webhook_trigger() from public;

drop trigger if exists api_invoice_webhook_events on public.invoices;
create trigger api_invoice_webhook_events after insert or update of commercial_status, status, payment_status on public.invoices for each row execute function private.api_invoice_webhook_trigger();
drop trigger if exists api_payment_webhook_events on public.payments;
create trigger api_payment_webhook_events after insert on public.payments for each row execute function private.api_payment_webhook_trigger();
drop trigger if exists api_customer_webhook_events on public.clients;
create trigger api_customer_webhook_events after insert on public.clients for each row execute function private.api_customer_webhook_trigger();
drop trigger if exists api_booking_webhook_events on public.bookings;
create trigger api_booking_webhook_events after insert or update of status on public.bookings for each row execute function private.api_booking_webhook_trigger();

commit;
