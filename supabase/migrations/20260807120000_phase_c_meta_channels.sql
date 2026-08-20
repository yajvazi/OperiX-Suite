-- OperiX Support Phase C: Meta Channels (Facebook Messenger + Instagram DMs).
-- Additive only. No WhatsApp integration is introduced here.
--
-- Access tokens are intentionally stored in a server-only column. The migration
-- revokes column access for authenticated clients and the Support app uses the
-- service-role client only after it has authenticated the current user and
-- checked the Support RBAC permission.

begin;

-- ---------------------------------------------------------------------------
-- Shared permissions
-- ---------------------------------------------------------------------------

insert into public.app_permissions (code, name, category, description, is_sensitive)
values
  ('support.channel.view', 'View support channels', 'support', 'View connected Meta channels and channel health.', false),
  ('support.channel.manage', 'Manage support channels', 'support', 'Connect, reconnect, select, and disconnect Meta channels.', true)
on conflict (code) do update set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  is_sensitive = excluded.is_sensitive;

with grants(role_code, permission_code) as (
  values
    ('support_admin', 'support.channel.view'),
    ('support_admin', 'support.channel.manage'),
    ('support_manager', 'support.channel.view'),
    ('support_manager', 'support.channel.manage'),
    ('support_agent', 'support.channel.view'),
    ('support_viewer', 'support.channel.view')
)
insert into public.app_role_permissions (role_id, permission_code)
select role.id, grant_row.permission_code
from grants grant_row
join public.app_roles role
  on role.code = grant_row.role_code
 and role.company_id is null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Conversation extensions used by every channel adapter
-- ---------------------------------------------------------------------------

alter table public.support_conversations
  add column if not exists provider text,
  add column if not exists channel_identifier text,
  add column if not exists external_conversation_id text,
  add column if not exists provider_thread_key text,
  add column if not exists customer_id uuid,
  add column if not exists assigned_user_id uuid,
  add column if not exists unread_count integer not null default 0,
  add column if not exists last_read_at timestamptz,
  add column if not exists last_activity_at timestamptz;

update public.support_conversations
set provider = case
  when conversation_type = 'facebook_messenger' then 'facebook'
  when conversation_type = 'email' then 'email'
  else coalesce(provider, conversation_type)
end
where provider is null;

update public.support_conversations conversation
set customer_id = ticket.contact_id,
    assigned_user_id = ticket.assigned_user_id
from public.support_tickets ticket
where conversation.company_id = ticket.company_id
  and conversation.ticket_id = ticket.id
  and (conversation.customer_id is null or conversation.assigned_user_id is null);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'support_conversations_company_customer_fk'
      and conrelid = 'public.support_conversations'::regclass
  ) then
    alter table public.support_conversations
      add constraint support_conversations_company_customer_fk
      foreign key (company_id, customer_id) references public.support_contacts(company_id, id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'support_conversations_assigned_user_fk'
      and conrelid = 'public.support_conversations'::regclass
  ) then
    alter table public.support_conversations
      add constraint support_conversations_assigned_user_fk
      foreign key (assigned_user_id) references auth.users(id) on delete set null;
  end if;
end $$;

create index if not exists support_conversations_assignment_idx
  on public.support_conversations(company_id, assigned_user_id, provider, last_activity_at desc nulls last);

alter table public.support_conversations
  drop constraint if exists support_conversations_conversation_type_check;
alter table public.support_conversations
  add constraint support_conversations_conversation_type_check
  check (conversation_type in ('email', 'live_chat', 'whatsapp', 'telegram', 'facebook_messenger', 'instagram', 'api', 'voice', 'sms'));

alter table public.support_conversations
  add constraint support_conversations_provider_check
  check (provider is null or provider in ('facebook', 'instagram', 'email', 'live_chat', 'whatsapp', 'telegram', 'api', 'voice', 'sms'));

alter table public.support_conversations
  add constraint support_conversations_unread_count_check
  check (unread_count >= 0);

create index if not exists support_conversations_provider_inbox_idx
  on public.support_conversations(company_id, provider, last_activity_at desc nulls last, updated_at desc);

create unique index if not exists support_conversations_channel_thread_unique
  on public.support_conversations(company_id, provider, external_conversation_id)
  where provider is not null and external_conversation_id is not null;

-- An external contact identifier is scoped to a tenant. This is used for
-- idempotent contact upserts from Messenger and Instagram profile IDs.
create unique index if not exists support_contacts_external_reference_unique
  on public.support_contacts(company_id, external_reference)
  where external_reference is not null and deleted_at is null;

-- ---------------------------------------------------------------------------
-- Connected accounts and webhook health
-- ---------------------------------------------------------------------------

create table if not exists public.support_channel_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider text not null,
  display_name text not null,
  business_id text,
  page_id text,
  instagram_id text,
  meta_user_id text,
  access_token_encrypted text,
  refresh_metadata jsonb not null default '{}'::jsonb,
  granted_permissions text[] not null default '{}',
  permissions_verified_at timestamptz,
  expires_at timestamptz,
  connected_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending_selection',
  department_id uuid,
  webhook_subscribed_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, department_id) references public.support_departments(company_id, id) on delete set null,
  check (provider in ('facebook', 'instagram')),
  check ((provider = 'facebook' and page_id is not null) or (provider = 'instagram' and instagram_id is not null)),
  check (status in ('pending_selection', 'connected', 'needs_reauthorization', 'disconnected', 'error')),
  check (status = 'disconnected' or access_token_encrypted is not null),
  check (jsonb_typeof(refresh_metadata) = 'object')
);

create unique index if not exists support_channel_accounts_company_page_unique
  on public.support_channel_accounts(company_id, page_id)
  where provider = 'facebook' and page_id is not null and status <> 'disconnected';
create unique index if not exists support_channel_accounts_company_instagram_unique
  on public.support_channel_accounts(company_id, instagram_id)
  where provider = 'instagram' and instagram_id is not null and status <> 'disconnected';
-- A webhook entry contains only an asset ID, so an active Meta asset must map
-- to one tenant. This prevents ambiguous cross-company delivery.
create unique index if not exists support_channel_accounts_active_page_global_unique
  on public.support_channel_accounts(provider, page_id)
  where provider = 'facebook' and page_id is not null and status in ('pending_selection', 'connected', 'needs_reauthorization', 'error');
create unique index if not exists support_channel_accounts_active_instagram_global_unique
  on public.support_channel_accounts(provider, instagram_id)
  where provider = 'instagram' and instagram_id is not null and status in ('pending_selection', 'connected', 'needs_reauthorization', 'error');

create index if not exists support_channel_accounts_company_status_idx
  on public.support_channel_accounts(company_id, status, provider, updated_at desc);

create table if not exists public.support_channel_webhooks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  channel_account_id uuid,
  provider text not null,
  object_type text not null,
  object_id text not null,
  callback_url text not null,
  subscribed_fields text[] not null default '{}',
  status text not null default 'unknown',
  signature_verified boolean not null default false,
  last_received_at timestamptz,
  last_verified_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, object_type, object_id),
  unique (company_id, id),
  foreign key (company_id, channel_account_id) references public.support_channel_accounts(company_id, id) on delete cascade,
  check (provider in ('facebook', 'instagram')),
  check (status in ('unknown', 'healthy', 'degraded', 'disconnected', 'error'))
);

create index if not exists support_channel_webhooks_company_health_idx
  on public.support_channel_webhooks(company_id, status, last_received_at desc);

create table if not exists public.support_channel_sync_state (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  channel_account_id uuid not null,
  cursor text,
  last_sync_at timestamptz,
  last_success_at timestamptz,
  retry_after timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, channel_account_id),
  foreign key (company_id, channel_account_id) references public.support_channel_accounts(company_id, id) on delete cascade,
  check (jsonb_typeof(metadata) = 'object')
);

-- Shared in-app notification records. Delivery is written through the shared
-- notification package's sink adapter; agents can only read their own rows.
create table if not exists public.support_notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ticket_id uuid,
  notification_type text not null,
  title text not null,
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, ticket_id) references public.support_tickets(company_id, id) on delete cascade,
  check (jsonb_typeof(metadata) = 'object')
);

create index if not exists support_notifications_recipient_idx
  on public.support_notifications(company_id, user_id, read_at, created_at desc);

-- ---------------------------------------------------------------------------
-- Provider event/message ledger and attachment metadata
-- ---------------------------------------------------------------------------

create table if not exists public.support_channel_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  channel_account_id uuid,
  provider text not null,
  object_type text not null,
  object_id text,
  external_event_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  signature_verified boolean not null default false,
  status text not null default 'queued',
  attempts integer not null default 0,
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, external_event_id),
  foreign key (company_id, channel_account_id) references public.support_channel_accounts(company_id, id) on delete set null,
  check (provider in ('facebook', 'instagram')),
  check (jsonb_typeof(payload) = 'object'),
  check (status in ('queued', 'processing', 'processed', 'ignored', 'failed')),
  check (attempts >= 0)
);

create index if not exists support_channel_events_processing_idx
  on public.support_channel_events(status, received_at)
  where status in ('queued', 'failed');
create index if not exists support_channel_events_company_idx
  on public.support_channel_events(company_id, received_at desc);

create table if not exists public.support_channel_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  channel_account_id uuid not null,
  conversation_id uuid,
  support_message_id uuid,
  provider text not null,
  direction text not null,
  event_type text not null default 'message',
  provider_message_id text,
  provider_conversation_id text,
  idempotency_key text not null,
  status text not null default 'processing',
  payload jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  retry_count integer not null default 0,
  next_retry_at timestamptz,
  received_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, idempotency_key),
  foreign key (company_id, channel_account_id) references public.support_channel_accounts(company_id, id) on delete cascade,
  foreign key (company_id, conversation_id) references public.support_conversations(company_id, id) on delete set null,
  foreign key (company_id, support_message_id) references public.support_messages(company_id, id) on delete set null,
  check (provider in ('facebook', 'instagram')),
  check (direction in ('inbound', 'outbound')),
  check (status in ('processing', 'queued', 'sent', 'delivered', 'read', 'failed', 'retrying', 'ignored')),
  check (jsonb_typeof(payload) = 'object'),
  check (retry_count >= 0)
);

create unique index if not exists support_channel_messages_provider_id_unique
  on public.support_channel_messages(company_id, provider, provider_message_id)
  where provider_message_id is not null;
create index if not exists support_channel_messages_conversation_idx
  on public.support_channel_messages(company_id, conversation_id, created_at);
create index if not exists support_channel_messages_outbound_retry_idx
  on public.support_channel_messages(status, next_retry_at, created_at)
  where direction = 'outbound' and status in ('queued', 'retrying');

create table if not exists public.support_channel_attachments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  channel_message_id uuid not null,
  support_attachment_id uuid,
  provider text not null,
  remote_attachment_id text,
  kind text not null,
  filename text,
  content_type text,
  byte_size bigint,
  remote_url text,
  preview_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, channel_message_id) references public.support_channel_messages(company_id, id) on delete cascade,
  foreign key (company_id, support_attachment_id) references public.support_attachments(company_id, id) on delete set null,
  check (provider in ('facebook', 'instagram')),
  check (kind in ('image', 'video', 'audio', 'file', 'link', 'unknown')),
  check (byte_size is null or byte_size > 0),
  check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists support_channel_attachments_remote_id_unique
  on public.support_channel_attachments(company_id, provider, remote_attachment_id)
  where remote_attachment_id is not null;
create index if not exists support_channel_attachments_message_idx
  on public.support_channel_attachments(company_id, channel_message_id, created_at);

create or replace function public.support_sync_channel_conversation_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.support_conversations
  set customer_id = new.contact_id,
      assigned_user_id = new.assigned_user_id,
      updated_at = now()
  where company_id = new.company_id
    and ticket_id = new.id
    and provider in ('facebook', 'instagram');
  return new;
end;
$$;

revoke all on function public.support_sync_channel_conversation_fields() from public, anon, authenticated;
drop trigger if exists support_tickets_sync_channel_conversation_fields on public.support_tickets;
create trigger support_tickets_sync_channel_conversation_fields
after update of contact_id, assigned_user_id on public.support_tickets
for each row execute function public.support_sync_channel_conversation_fields();

-- Timestamp maintenance for the additive tables.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'support_channel_accounts', 'support_channel_webhooks',
    'support_channel_sync_state', 'support_channel_messages'
  ] loop
    execute format('drop trigger if exists %I_touch_updated_at on public.%I', table_name, table_name);
    execute format('create trigger %I_touch_updated_at before update on public.%I for each row execute function private.support_touch_updated_at()', table_name, table_name);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Atomic service-role inbound ingestion and authenticated agent reply helpers
-- ---------------------------------------------------------------------------

create or replace function public.support_ingest_channel_message(
  p_company_id uuid,
  p_channel_account_id uuid,
  p_provider text,
  p_channel_identifier text,
  p_external_conversation_id text,
  p_provider_message_id text,
  p_idempotency_key text,
  p_contact_id uuid,
  p_subject text,
  p_body_text text,
  p_received_at timestamptz,
  p_payload jsonb default '{}'::jsonb
)
returns table(
  channel_message_id uuid,
  ticket_id uuid,
  conversation_id uuid,
  support_message_id uuid,
  duplicate boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created_channel_message_id uuid;
  created_ticket_id uuid;
  created_conversation_id uuid;
  created_support_message_id uuid;
  existing_status text;
  existing_ticket_id uuid;
  existing_conversation_id uuid;
  conversation_type_value text := case when p_provider = 'instagram' then 'instagram' else 'facebook_messenger' end;
  message_subject text := left(coalesce(nullif(trim(p_subject), ''), initcap(p_provider) || ' conversation'), 240);
  incoming_at timestamptz := coalesce(p_received_at, now());
  was_duplicate boolean := false;
begin
  if current_setting('request.jwt.claim.role', true) <> 'service_role' then
    raise exception using errcode = '42501', message = 'Channel ingestion is restricted to the service role';
  end if;
  if p_provider not in ('facebook', 'instagram') then
    raise exception using errcode = '22023', message = 'Unsupported channel provider';
  end if;
  if nullif(trim(p_channel_identifier), '') is null or nullif(trim(p_external_conversation_id), '') is null then
    raise exception using errcode = '22023', message = 'Channel identifiers are required';
  end if;
  if p_contact_id is not null and not exists (
    select 1 from public.support_contacts contact
    where contact.id = p_contact_id and contact.company_id = p_company_id and contact.deleted_at is null
  ) then
    raise exception using errcode = '23503', message = 'Contact does not belong to the channel company';
  end if;
  if not exists (
    select 1 from public.support_channel_accounts account
    where account.id = p_channel_account_id
      and account.company_id = p_company_id
      and account.provider = p_provider
      and account.status in ('connected', 'needs_reauthorization', 'error')
  ) then
    raise exception using errcode = '23503', message = 'Channel account does not belong to the company';
  end if;

  insert into public.support_channel_messages(
    company_id, channel_account_id, provider, direction, event_type,
    provider_message_id, provider_conversation_id, idempotency_key,
    status, payload, received_at
  ) values (
    p_company_id, p_channel_account_id, p_provider, 'inbound', 'message',
    nullif(trim(p_provider_message_id), ''), p_external_conversation_id, p_idempotency_key,
    'processing', coalesce(p_payload, '{}'::jsonb), incoming_at
  )
  on conflict (company_id, idempotency_key) do nothing
  returning id into created_channel_message_id;

  if created_channel_message_id is null then
    select channel.id, channel.status, channel.conversation_id, conversation.ticket_id
      into created_channel_message_id, existing_status, existing_conversation_id, existing_ticket_id
    from public.support_channel_messages channel
    left join public.support_conversations conversation
      on conversation.company_id = channel.company_id and conversation.id = channel.conversation_id
    where channel.company_id = p_company_id and channel.idempotency_key = p_idempotency_key
    for update;
    was_duplicate := true;
    return query select created_channel_message_id, existing_ticket_id, existing_conversation_id, null::uuid, was_duplicate;
    return;
  end if;

  select conversation.id, conversation.ticket_id
    into created_conversation_id, created_ticket_id
  from public.support_conversations conversation
  where conversation.company_id = p_company_id
    and conversation.provider = p_provider
    and conversation.external_conversation_id = p_external_conversation_id
  for update;

  if created_conversation_id is null then
    insert into public.support_tickets(
      company_id, subject, status, priority, department_id, contact_id,
      source_application, last_message_at, created_by, updated_by
    )
    select p_company_id, message_subject, 'open', 'normal', account.department_id,
      p_contact_id, 'operix-support-meta', incoming_at, null, null
    from public.support_channel_accounts account
    where account.id = p_channel_account_id and account.company_id = p_company_id
    returning id into created_ticket_id;

    insert into public.support_conversations(
      company_id, ticket_id, conversation_type, provider, channel_identifier,
      external_conversation_id, provider_thread_key, customer_id, assigned_user_id, metadata,
      last_activity_at, unread_count
    ) values (
      p_company_id, created_ticket_id, conversation_type_value, p_provider,
      p_channel_identifier, p_external_conversation_id, p_external_conversation_id, p_contact_id, null,
      jsonb_build_object('channel_account_id', p_channel_account_id), incoming_at, 1
    ) returning id into created_conversation_id;

    insert into public.support_messages(
      company_id, conversation_id, author_contact_id, visibility,
      body_text, source, external_message_id, sent_at, created_at
    ) values (
      p_company_id, created_conversation_id, p_contact_id, 'public',
      nullif(trim(p_body_text), ''), 'customer', nullif(trim(p_provider_message_id), ''), incoming_at, incoming_at
    ) returning id into created_support_message_id;

    insert into public.support_events(company_id, ticket_id, event_name, payload, actor_contact_id)
    values
      (p_company_id, created_ticket_id, 'ticket_created', jsonb_build_object(
        'source', p_provider, 'channel_account_id', p_channel_account_id,
        'conversation_id', created_conversation_id, 'message_id', created_support_message_id
      ), p_contact_id),
      (p_company_id, created_ticket_id, 'channel_message_received', jsonb_build_object(
        'provider', p_provider, 'channel_message_id', created_channel_message_id,
        'provider_message_id', p_provider_message_id, 'conversation_id', created_conversation_id
      ), p_contact_id);
  else
    insert into public.support_messages(
      company_id, conversation_id, author_contact_id, visibility,
      body_text, source, external_message_id, sent_at, created_at
    ) values (
      p_company_id, created_conversation_id, p_contact_id, 'public',
      nullif(trim(p_body_text), ''), 'customer', nullif(trim(p_provider_message_id), ''), incoming_at, incoming_at
    ) returning id into created_support_message_id;

    update public.support_conversations
    set customer_id = coalesce(customer_id, p_contact_id),
        channel_identifier = coalesce(channel_identifier, p_channel_identifier),
        last_activity_at = incoming_at,
        unread_count = unread_count + 1,
        updated_at = now()
    where company_id = p_company_id and id = created_conversation_id;

    update public.support_tickets
    set last_message_at = incoming_at,
        status = case when status in ('resolved', 'closed', 'archived', 'waiting_on_customer') then 'open' else status end,
        resolved_at = case when status in ('resolved', 'closed', 'archived', 'waiting_on_customer') then null else resolved_at end,
        closed_at = case when status in ('resolved', 'closed', 'archived', 'waiting_on_customer') then null else closed_at end,
        archived_at = case when status in ('resolved', 'closed', 'archived', 'waiting_on_customer') then null else archived_at end,
        updated_at = now()
    where company_id = p_company_id and id = created_ticket_id;

    insert into public.support_events(company_id, ticket_id, event_name, payload, actor_contact_id)
    values (p_company_id, created_ticket_id, 'channel_message_received', jsonb_build_object(
      'provider', p_provider, 'channel_message_id', created_channel_message_id,
      'provider_message_id', p_provider_message_id, 'conversation_id', created_conversation_id
    ), p_contact_id);
  end if;

  update public.support_channel_messages
  set conversation_id = created_conversation_id,
      support_message_id = created_support_message_id,
      status = 'processed',
      updated_at = now()
  where company_id = p_company_id and id = created_channel_message_id;

  return query select created_channel_message_id, created_ticket_id, created_conversation_id, created_support_message_id, was_duplicate;
end;
$$;

create or replace function public.support_add_channel_message(
  p_company_id uuid,
  p_ticket_id uuid,
  p_conversation_id uuid,
  p_body_text text,
  p_body_html text default null,
  p_visibility text default 'public',
  p_source text default 'agent'
)
returns table(message_id uuid, conversation_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare created_message_id uuid;
begin
  if p_visibility = 'internal' then
    if not private.has_company_permission(p_company_id, 'support.ticket.internal_note') then
      raise exception using errcode = '42501', message = 'Internal notes are not permitted';
    end if;
  elsif p_visibility = 'public' then
    if not private.has_company_permission(p_company_id, 'support.ticket.reply') then
      raise exception using errcode = '42501', message = 'Support replies are not permitted';
    end if;
  else
    raise exception using errcode = '22023', message = 'Message visibility is invalid';
  end if;
  if nullif(trim(coalesce(p_body_text, '')), '') is null and nullif(trim(coalesce(p_body_html, '')), '') is null then
    raise exception using errcode = '22023', message = 'Message body is required';
  end if;
  if not exists (
    select 1 from public.support_conversations conversation
    where conversation.company_id = p_company_id
      and conversation.id = p_conversation_id
      and conversation.ticket_id = p_ticket_id
  ) then
    raise exception using errcode = '23503', message = 'Channel conversation does not belong to the ticket';
  end if;
  insert into public.support_messages(
    company_id, conversation_id, author_user_id, visibility, body_text,
    body_html, source, sent_at
  ) values (
    p_company_id, p_conversation_id, auth.uid(), p_visibility,
    nullif(trim(p_body_text), ''), nullif(trim(p_body_html), ''),
    coalesce(p_source, 'agent'), now()
  ) returning id into created_message_id;
  update public.support_conversations
  set last_activity_at = now(), updated_at = now()
  where company_id = p_company_id and id = p_conversation_id;
  update public.support_tickets
  set last_message_at = now(),
      first_response_at = case when p_visibility = 'public' and first_response_at is null then now() else first_response_at end,
      updated_by = auth.uid(), updated_at = now()
  where company_id = p_company_id and id = p_ticket_id;
  insert into public.support_events(company_id, ticket_id, event_name, payload, actor_user_id)
  values (p_company_id, p_ticket_id, case when p_visibility = 'internal' then 'note_created' else 'reply_created' end,
    jsonb_build_object('message_id', created_message_id, 'conversation_id', p_conversation_id, 'provider', (select provider from public.support_conversations where id = p_conversation_id)), auth.uid());
  return query select created_message_id, p_conversation_id;
end;
$$;

revoke all on function public.support_ingest_channel_message(uuid, uuid, text, text, text, text, text, uuid, text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.support_ingest_channel_message(uuid, uuid, text, text, text, text, text, uuid, text, text, timestamptz, jsonb) to service_role;
revoke all on function public.support_add_channel_message(uuid, uuid, uuid, text, text, text, text) from public, anon;
grant execute on function public.support_add_channel_message(uuid, uuid, uuid, text, text, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS and explicit Data API grants
-- ---------------------------------------------------------------------------

alter table public.support_channel_accounts enable row level security;
alter table public.support_channel_webhooks enable row level security;
alter table public.support_channel_sync_state enable row level security;
alter table public.support_channel_events enable row level security;
alter table public.support_channel_messages enable row level security;
alter table public.support_channel_attachments enable row level security;
alter table public.support_notifications enable row level security;

drop policy if exists support_channel_accounts_read on public.support_channel_accounts;
create policy support_channel_accounts_read on public.support_channel_accounts
  for select to authenticated
  using ((select private.has_company_permission(company_id, 'support.channel.view')));
drop policy if exists support_channel_accounts_manage on public.support_channel_accounts;
create policy support_channel_accounts_manage on public.support_channel_accounts
  for all to authenticated
  using ((select private.has_company_permission(company_id, 'support.channel.manage')))
  with check ((select private.has_company_permission(company_id, 'support.channel.manage')));

drop policy if exists support_channel_webhooks_read on public.support_channel_webhooks;
create policy support_channel_webhooks_read on public.support_channel_webhooks
  for select to authenticated
  using (company_id is not null and (select private.has_company_permission(company_id, 'support.channel.view')));
drop policy if exists support_channel_sync_state_read on public.support_channel_sync_state;
create policy support_channel_sync_state_read on public.support_channel_sync_state
  for select to authenticated
  using ((select private.has_company_permission(company_id, 'support.channel.view')));
drop policy if exists support_channel_events_read on public.support_channel_events;
create policy support_channel_events_read on public.support_channel_events
  for select to authenticated
  using (company_id is not null and (select private.has_company_permission(company_id, 'support.channel.view')));
drop policy if exists support_channel_messages_read on public.support_channel_messages;
create policy support_channel_messages_read on public.support_channel_messages
  for select to authenticated
  using ((select private.has_company_permission(company_id, 'support.channel.view')));
drop policy if exists support_channel_attachments_read on public.support_channel_attachments;
create policy support_channel_attachments_read on public.support_channel_attachments
  for select to authenticated
  using ((select private.has_company_permission(company_id, 'support.channel.view')));

drop policy if exists support_notifications_read on public.support_notifications;
create policy support_notifications_read on public.support_notifications
  for select to authenticated
  using (user_id = (select auth.uid()) and (select private.has_company_permission(company_id, 'support.ticket.view')));

-- These tables are exposed through PostgREST by supabase-js. Keep the token
-- column out of the authenticated role's column privileges as defense in depth.
revoke all on public.support_channel_accounts from anon, authenticated;
grant select (
  id, company_id, provider, display_name, business_id, page_id, instagram_id,
  meta_user_id, granted_permissions, permissions_verified_at, expires_at,
  connected_by, status, department_id, webhook_subscribed_at, last_sync_at,
  last_error, created_at, updated_at
) on public.support_channel_accounts to authenticated;
revoke select (access_token_encrypted, refresh_metadata) on public.support_channel_accounts from authenticated;

revoke all on public.support_channel_webhooks from anon, authenticated;
grant select on public.support_channel_webhooks to authenticated;
revoke all on public.support_channel_sync_state from anon, authenticated;
grant select on public.support_channel_sync_state to authenticated;
revoke all on public.support_channel_events from anon, authenticated;
grant select on public.support_channel_events to authenticated;
revoke all on public.support_channel_messages from anon, authenticated;
grant select on public.support_channel_messages to authenticated;
revoke all on public.support_channel_attachments from anon, authenticated;
grant select on public.support_channel_attachments to authenticated;
revoke all on public.support_notifications from anon, authenticated;
grant select on public.support_notifications to authenticated;

grant all on public.support_channel_accounts to service_role;
grant all on public.support_channel_webhooks to service_role;
grant all on public.support_channel_sync_state to service_role;
grant all on public.support_channel_events to service_role;
grant all on public.support_channel_messages to service_role;
grant all on public.support_channel_attachments to service_role;
grant all on public.support_notifications to service_role;

commit;
