-- Push notifications to the other people in a workspace.
--
-- Changes in the database (an invoice issued or paid, a payment, an expense, a new member, low stock, a transfer,
-- an admin correction, a billing change) put a row in public.push_outbox. A web endpoint (/api/internal/push-dispatch)
-- turns those rows into Expo push messages for the right people. Because the database queues them, notifications
-- work for every change, from any device or the web app, even if the phone that made the change closes right away.
--
-- Who is told: the people with the owner/admin role, anyone whose role can see everything of that kind, and the
-- person an item is assigned to. The person who made the change is never told about their own change.
-- People can switch kinds of notification on or off (notification_preferences).
--
-- To enable sending, store two Vault secrets (the database calls the endpoint when something is queued):
--   select vault.create_secret('https://your-web-address/api/internal/push-dispatch', 'push_dispatch_url');
--   select vault.create_secret('<same value as CRON_SECRET or PUSH_DISPATCH_SECRET on the web app>', 'push_dispatch_secret');
-- Without them events are still queued and can be sent by calling the endpoint on a schedule.

alter table public.operix_push_device_tokens add column if not exists language text not null default 'en';

create table if not exists public.push_outbox (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  event_type text not null,
  category text not null check (category in ('invoices', 'payments', 'expenses', 'team', 'stock', 'money', 'billing')),
  recipient_scope text not null default 'category' check (recipient_scope in ('category', 'admins')),
  entity_type text,
  entity_id uuid,
  actor_user_id uuid,
  assigned_user_id uuid,
  title jsonb not null,
  body jsonb not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  processed_at timestamptz,
  attempts integer not null default 0,
  last_error text
);
create index if not exists push_outbox_pending_idx on public.push_outbox (created_at) where processed_at is null;
-- One notification per invoice for these one-time events, even when the invoice is saved in several steps.
create unique index if not exists push_outbox_once_idx on public.push_outbox (event_type, entity_id)
  where entity_id is not null and event_type in ('invoice_created', 'invoice_paid', 'invoice_cancelled');
alter table public.push_outbox enable row level security; -- no policies: only the server (service role) and the functions below touch it

create table if not exists public.notification_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('invoices', 'payments', 'expenses', 'team', 'stock', 'money', 'billing')),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);
alter table public.notification_preferences enable row level security;
drop policy if exists notification_preferences_select on public.notification_preferences;
drop policy if exists notification_preferences_write on public.notification_preferences;
create policy notification_preferences_select on public.notification_preferences for select to authenticated using (user_id = (select auth.uid()));
create policy notification_preferences_write on public.notification_preferences for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.notification_preferences to authenticated;

-- ---------------------------------------------------------------- helpers
create or replace function private.push_money(p_amount numeric, p_currency text)
returns text language sql immutable set search_path to '' as $$
  select case upper(coalesce(p_currency, 'EUR')) when 'EUR' then '€' when 'USD' then '$' when 'GBP' then '£' else upper(p_currency) || ' ' end
         || trim(to_char(coalesce(p_amount, 0), 'FM999,999,999,990.00'));
$$;

create or replace function private.push_person(p_user_id uuid)
returns text language sql stable security definer set search_path to '' as $$
  select coalesce(
    nullif(trim(coalesce(profile.first_name, '') || ' ' || coalesce(profile.last_name, '')), ''),
    nullif(split_part(coalesce(profile.email, ''), '@', 1), ''),
    'A team member')
  from (select 1) one left join public.profiles profile on profile.id = p_user_id;
$$;

-- Calls the web endpoint right after the transaction commits. Never blocks or fails the change that queued the row.
create or replace function private.push_kick()
returns void language plpgsql security definer set search_path to '' as $$
declare
  dispatch_url text;
  dispatch_secret text;
begin
  select decrypted_secret into dispatch_url from vault.decrypted_secrets where name = 'push_dispatch_url' limit 1;
  select decrypted_secret into dispatch_secret from vault.decrypted_secrets where name = 'push_dispatch_secret' limit 1;
  if dispatch_url is null or dispatch_secret is null then return; end if;
  perform net.http_post(url := dispatch_url, headers := jsonb_build_object('content-type', 'application/json', 'x-dispatch-secret', dispatch_secret), body := '{}'::jsonb, timeout_milliseconds := 5000);
exception when others then
  null;
end;
$$;

create or replace function private.enqueue_push(
  p_company_id uuid, p_event_type text, p_category text, p_scope text, p_entity_type text, p_entity_id uuid,
  p_actor uuid, p_assigned uuid, p_title_en text, p_title_sq text, p_body_en text, p_body_sq text, p_data jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path to '' as $$
begin
  if p_company_id is null then return; end if;
  insert into public.push_outbox (company_id, event_type, category, recipient_scope, entity_type, entity_id, actor_user_id, assigned_user_id, title, body, data)
  values (p_company_id, p_event_type, p_category, p_scope, p_entity_type, p_entity_id, p_actor, p_assigned,
          jsonb_build_object('en', p_title_en, 'sq', p_title_sq), jsonb_build_object('en', p_body_en, 'sq', p_body_sq), coalesce(p_data, '{}'::jsonb))
  on conflict do nothing;
  perform private.push_kick();
exception when others then
  null; -- a notification problem must never break the business change
end;
$$;

-- ---------------------------------------------------------------- who is told
create or replace function public.push_outbox_recipients(p_event_id uuid)
returns table (user_id uuid)
language sql stable security definer set search_path to '' as $$
  select distinct member.user_id
  from public.push_outbox event
  join public.memberships member on member.company_id = event.company_id and coalesce(member.status, 'active') = 'active'
  where event.id = p_event_id
    and member.user_id is distinct from event.actor_user_id
    and (
      member.role in ('owner', 'admin')
      or member.user_id = event.assigned_user_id
      or (event.recipient_scope = 'category' and exists (
        select 1
        from public.membership_role_assignments assignment
        join public.app_role_permissions grant_row on grant_row.role_id = assignment.role_id
        where assignment.membership_id = member.id
          and grant_row.permission_code = case event.category
            when 'invoices' then 'invoice.view_all'
            when 'payments' then 'payment.view'
            when 'expenses' then 'expense.view_all'
            when 'stock' then 'inventory.view'
            when 'money' then 'settings.bank'
            else '-'
          end))
    )
    and coalesce((select preference.enabled from public.notification_preferences preference where preference.user_id = member.user_id and preference.category = event.category), true);
$$;

create or replace function public.claim_push_outbox(p_limit integer default 50)
returns setof public.push_outbox
language sql security definer set search_path to '' as $$
  update public.push_outbox outbox
  set claimed_at = now(), attempts = outbox.attempts + 1
  where outbox.id in (
    select pending.id from public.push_outbox pending
    where pending.processed_at is null and pending.attempts < 5
      and (pending.claimed_at is null or pending.claimed_at < now() - interval '5 minutes')
    order by pending.created_at
    limit greatest(1, least(coalesce(p_limit, 50), 200))
    for update skip locked)
  returning outbox.*;
$$;

create or replace function public.complete_push_outbox(p_event_id uuid, p_error text default null)
returns void language sql security definer set search_path to '' as $$
  update public.push_outbox
  set processed_at = case when p_error is null then now() else processed_at end, last_error = left(p_error, 500)
  where id = p_event_id;
$$;

revoke all on function public.push_outbox_recipients(uuid), public.claim_push_outbox(integer), public.complete_push_outbox(uuid, text) from public, anon, authenticated;
grant execute on function public.push_outbox_recipients(uuid), public.claim_push_outbox(integer), public.complete_push_outbox(uuid, text) to service_role;

-- ---------------------------------------------------------------- triggers
-- Invoices: issued (created), paid, cancelled.
create or replace function private.push_on_invoice()
returns trigger language plpgsql security definer set search_path to '' as $$
declare
  actor uuid := (select auth.uid());
  doc_type text := upper(coalesce(new.commercial_document_type, new.type, 'INVOICE'));
  old_status text := lower(coalesce(case when tg_op = 'UPDATE' then old.status::text end, 'draft'));
  new_status text := lower(coalesce(new.status::text, 'draft'));
  customer text;
  amount text := private.push_money(new.total_amount, new.currency);
  who text := private.push_person(actor);
  link jsonb := jsonb_build_object('type', 'invoice', 'id', new.id, 'url', 'operix-invoice://open/invoices/' || new.id);
begin
  if doc_type in ('QUOTE', 'OFFER', 'PROFORMA', 'SALES_ORDER', 'DELIVERY_NOTE') or new.company_id is null then return new; end if;
  select client.name into customer from public.clients client where client.id = new.client_id;
  customer := coalesce(customer, '—');

  if new_status <> 'draft' and new_status not in ('cancelled', 'reversed') and (tg_op = 'INSERT' or old_status = 'draft') then
    perform private.enqueue_push(new.company_id, 'invoice_created', 'invoices', 'category', 'invoice', new.id, actor, new.assigned_user_id,
      'New invoice ' || coalesce(new.invoice_number, ''), 'Faturë e re ' || coalesce(new.invoice_number, ''),
      who || ' issued an invoice for ' || customer || ' · ' || amount, who || ' lëshoi një faturë për ' || customer || ' · ' || amount, link);
  end if;
  if tg_op = 'UPDATE' and upper(coalesce(new.payment_status, '')) = 'PAID' and upper(coalesce(old.payment_status, '')) is distinct from 'PAID' then
    perform private.enqueue_push(new.company_id, 'invoice_paid', 'invoices', 'category', 'invoice', new.id, actor, new.assigned_user_id,
      'Invoice paid ' || coalesce(new.invoice_number, ''), 'Fatura u pagua ' || coalesce(new.invoice_number, ''),
      customer || ' · ' || amount || ' is fully paid', customer || ' · ' || amount || ' është paguar plotësisht', link);
  end if;
  if tg_op = 'UPDATE' and new_status in ('cancelled', 'reversed') and old_status not in ('cancelled', 'reversed') then
    perform private.enqueue_push(new.company_id, 'invoice_cancelled', 'invoices', 'category', 'invoice', new.id, actor, new.assigned_user_id,
      'Invoice cancelled ' || coalesce(new.invoice_number, ''), 'Fatura u anulua ' || coalesce(new.invoice_number, ''),
      who || ' cancelled the invoice for ' || customer || ' · ' || amount, who || ' anuloi faturën për ' || customer || ' · ' || amount, link);
  end if;
  return new;
exception when others then
  return new;
end;
$$;
drop trigger if exists push_on_invoice on public.invoices;
create trigger push_on_invoice after insert or update of status, payment_status on public.invoices
  for each row execute function private.push_on_invoice();

-- Payments received.
create or replace function private.push_on_payment()
returns trigger language plpgsql security definer set search_path to '' as $$
declare
  actor uuid := (select auth.uid());
  customer text;
  invoice_number text;
  amount text := private.push_money(new.amount, new.currency);
begin
  select client.name into customer from public.clients client where client.id = new.client_id;
  select invoice.invoice_number into invoice_number from public.invoices invoice where invoice.id = new.invoice_id;
  customer := coalesce(customer, new.payer_name, '—');
  perform private.enqueue_push(new.company_id, 'payment_received', 'payments', 'category', 'payment', new.id, coalesce(actor, new.user_id), new.assigned_user_id,
    'Payment received ' || amount, 'Pagesë e pranuar ' || amount,
    private.push_person(coalesce(actor, new.user_id)) || ' recorded ' || amount || ' from ' || customer || coalesce(' for ' || invoice_number, ''),
    private.push_person(coalesce(actor, new.user_id)) || ' regjistroi ' || amount || ' nga ' || customer || coalesce(' për ' || invoice_number, ''),
    jsonb_build_object('type', 'payment', 'id', new.id, 'url', 'operix-invoice://open/payments/' || new.id));
  return new;
exception when others then
  return new;
end;
$$;
drop trigger if exists push_on_payment on public.payments;
create trigger push_on_payment after insert on public.payments for each row execute function private.push_on_payment();

-- Expenses: new expense, and approval requests for administrators.
create or replace function private.push_on_expense()
returns trigger language plpgsql security definer set search_path to '' as $$
declare
  actor uuid := (select auth.uid());
  who text := private.push_person(coalesce(actor, new.user_id));
  amount text := private.push_money(new.amount, new.currency);
  what text := coalesce(nullif(new.vendor_name, ''), nullif(new.category, ''), nullif(new.description, ''), 'expense');
  link jsonb := jsonb_build_object('type', 'expense', 'id', new.id, 'url', 'operix-invoice://open/expenses/' || new.id);
begin
  perform private.enqueue_push(new.company_id, 'expense_created', 'expenses', 'category', 'expense', new.id, coalesce(actor, new.user_id), new.assigned_user_id,
    'New expense ' || amount, 'Shpenzim i ri ' || amount, who || ' added ' || what || ' · ' || amount, who || ' shtoi ' || what || ' · ' || amount, link);
  if lower(coalesce(new.approval_status, '')) in ('pending', 'pending_approval') then
    perform private.enqueue_push(new.company_id, 'approval_requested', 'expenses', 'admins', 'expense', new.id, coalesce(actor, new.user_id), null,
      'Approval needed', 'Kërkohet aprovim', who || ' needs approval for ' || what || ' · ' || amount, who || ' kërkon aprovim për ' || what || ' · ' || amount, link);
  end if;
  return new;
exception when others then
  return new;
end;
$$;
drop trigger if exists push_on_expense on public.expenses;
create trigger push_on_expense after insert on public.expenses for each row execute function private.push_on_expense();

-- A new member joins the workspace (administrators are told).
create or replace function private.push_on_member()
returns trigger language plpgsql security definer set search_path to '' as $$
declare
  company_label text;
begin
  if coalesce(new.status, 'active') <> 'active' or new.role = 'owner' then return new; end if;
  select coalesce(company.company_name, company.name, 'your workspace') into company_label from public.companies company where company.id = new.company_id;
  perform private.enqueue_push(new.company_id, 'member_added', 'team', 'admins', 'membership', new.id, (select auth.uid()), null,
    'New team member', 'Anëtar i ri i ekipit', private.push_person(new.user_id) || ' joined ' || company_label, private.push_person(new.user_id) || ' u bashkua te ' || company_label,
    jsonb_build_object('type', 'team'));
  return new;
exception when others then
  return new;
end;
$$;
drop trigger if exists push_on_member on public.memberships;
create trigger push_on_member after insert on public.memberships for each row execute function private.push_on_member();

-- Money moved between cash, bank and card accounts.
create or replace function private.push_on_transfer()
returns trigger language plpgsql security definer set search_path to '' as $$
declare
  actor uuid := coalesce((select auth.uid()), new.created_by);
  amount text := private.push_money(new.amount, new.currency);
begin
  perform private.enqueue_push(new.company_id, 'money_transferred', 'money', 'category', 'transfer', new.id, actor, null,
    'Money transferred ' || amount, 'Para të transferuara ' || amount,
    private.push_person(actor) || ' moved ' || amount || coalesce(' · ' || nullif(new.description, ''), ''),
    private.push_person(actor) || ' transferoi ' || amount || coalesce(' · ' || nullif(new.description, ''), ''),
    jsonb_build_object('type', 'money'));
  return new;
exception when others then
  return new;
end;
$$;
drop trigger if exists push_on_transfer on public.company_fund_transfers;
create trigger push_on_transfer after insert on public.company_fund_transfers for each row execute function private.push_on_transfer();

-- A tracked product runs low on stock (only when it crosses the threshold, not on every sale below it).
create or replace function private.push_on_low_stock()
returns trigger language plpgsql security definer set search_path to '' as $$
declare
  threshold numeric := coalesce(new.low_stock_threshold, 5);
begin
  if not coalesce(new.track_stock, false) or new.company_id is null then return new; end if;
  if coalesce(old.stock_quantity, 0) > threshold and coalesce(new.stock_quantity, 0) <= threshold then
    perform private.enqueue_push(new.company_id, 'low_stock', 'stock', 'category', 'product', new.id, (select auth.uid()), null,
      'Low stock: ' || new.name, 'Stok i ulët: ' || new.name,
      new.name || ' is down to ' || trim(to_char(coalesce(new.stock_quantity, 0), 'FM999,999,990.##')) || ' left', new.name || ' ka mbetur ' || trim(to_char(coalesce(new.stock_quantity, 0), 'FM999,999,990.##')),
      jsonb_build_object('type', 'product', 'id', new.id, 'url', 'operix-invoice://open/products/' || new.id));
  end if;
  return new;
exception when others then
  return new;
end;
$$;
drop trigger if exists push_on_low_stock on public.products;
create trigger push_on_low_stock after update of stock_quantity on public.products for each row execute function private.push_on_low_stock();

-- Administrator deleted or corrected a posted invoice: the other administrators are told.
create or replace function private.push_on_admin_invoice_action()
returns trigger language plpgsql security definer set search_path to '' as $$
declare
  deleted boolean := new.action = 'invoice.deleted_by_admin';
  who text := private.push_person(new.actor_user_id);
begin
  if new.action not in ('invoice.deleted_by_admin', 'invoice.corrected_by_admin') then return new; end if;
  perform private.enqueue_push(new.company_id, case when deleted then 'invoice_deleted' else 'invoice_corrected' end, 'invoices', 'admins', 'invoice', null, new.actor_user_id, null,
    case when deleted then 'Invoice deleted ' else 'Invoice corrected ' end || coalesce(new.entity_key, ''),
    case when deleted then 'Fatura u fshi ' else 'Fatura u korrigjua ' end || coalesce(new.entity_key, ''),
    who || (case when deleted then ' deleted a posted invoice: ' else ' corrected a posted invoice: ' end) || coalesce(new.reason, ''),
    who || (case when deleted then ' fshiu një faturë të postuar: ' else ' korrigjoi një faturë të postuar: ' end) || coalesce(new.reason, ''),
    jsonb_build_object('type', 'audit'));
  return new;
exception when others then
  return new;
end;
$$;
drop trigger if exists push_on_admin_invoice_action on public.audit_events;
create trigger push_on_admin_invoice_action after insert on public.audit_events for each row execute function private.push_on_admin_invoice_action();

-- Subscription changes: payment failed or subscription active (administrators).
create or replace function private.push_on_subscription()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if new.status is not distinct from old.status then return new; end if;
  if new.status = 'past_due' then
    perform private.enqueue_push(new.company_id, 'billing_payment_failed', 'billing', 'admins', 'subscription', null, null, null,
      'Subscription payment failed', 'Pagesa e abonimit dështoi', 'Update your payment method to avoid interruption.', 'Përditësoni mënyrën e pagesës për të shmangur ndërprerjen.', jsonb_build_object('type', 'billing'));
  elsif new.status = 'active' and coalesce(old.status, '') <> 'active' then
    perform private.enqueue_push(new.company_id, 'billing_active', 'billing', 'admins', 'subscription', null, null, null,
      'OperiX Cloud is active', 'OperiX Cloud është aktiv', 'Your subscription is active. Thank you!', 'Abonimi juaj është aktiv. Faleminderit!', jsonb_build_object('type', 'billing'));
  end if;
  return new;
exception when others then
  return new;
end;
$$;
drop trigger if exists push_on_subscription on public.subscription_accounts;
create trigger push_on_subscription after update of status on public.subscription_accounts for each row execute function private.push_on_subscription();
