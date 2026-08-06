-- OperiX Support Phase A/B foundation.
-- Additive only: companies, profiles, memberships, existing RBAC, and auth.users
-- remain the source of truth. This migration does not create agents or customers.

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Shared RBAC permissions and public permission wrapper
-- ---------------------------------------------------------------------------

insert into public.app_permissions (code, name, category, description, is_sensitive)
values
  ('support.dashboard.view', 'View support dashboard', 'support', 'View support metrics and activity.', false),
  ('support.ticket.view', 'View support tickets', 'support', 'Read tickets, conversations, events, and attachments.', false),
  ('support.ticket.create', 'Create support tickets', 'support', 'Create tickets and initial conversations.', false),
  ('support.ticket.update', 'Update support tickets', 'support', 'Edit ticket fields and status.', false),
  ('support.ticket.assign', 'Assign support tickets', 'support', 'Assign, reassign, and unassign tickets.', false),
  ('support.ticket.reply', 'Reply to support tickets', 'support', 'Create public replies on tickets.', false),
  ('support.ticket.internal_note', 'Create internal support notes', 'support', 'Create private internal notes.', false),
  ('support.contact.view', 'View support contacts', 'support', 'Read generic support contacts.', false),
  ('support.contact.manage', 'Manage support contacts', 'support', 'Create and update generic support contacts.', false),
  ('support.department.manage', 'Manage support departments', 'support', 'Manage departments and department memberships.', true),
  ('support.category.manage', 'Manage support categories', 'support', 'Manage hierarchical support categories and tags.', true),
  ('support.saved_reply.manage', 'Manage saved replies', 'support', 'Create and edit reusable agent replies.', false),
  ('support.attachment.manage', 'Manage support attachments', 'support', 'Upload, download, and quarantine attachments.', true),
  ('support.email.manage', 'Manage support email', 'support', 'Manage mailboxes, delivery logs, and retry operations.', true),
  ('support.automation.manage', 'Manage support automation', 'support', 'Manage automation rules and actions.', true)
on conflict (code) do update set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description,
  is_sensitive = excluded.is_sensitive;

insert into public.app_roles (company_id, code, name, description, is_system)
values
  (null, 'support_admin', 'Support Admin', 'Full Support administration.', true),
  (null, 'support_manager', 'Support Manager', 'Manage Support operations and assignments.', true),
  (null, 'support_agent', 'Support Agent', 'Work assigned Support tickets.', true),
  (null, 'support_viewer', 'Support Viewer', 'Read-only Support access.', true),
  (null, 'support_customer', 'Support Customer', 'Reserved for a future customer channel.', true)
on conflict (code) where company_id is null do update set
  name = excluded.name,
  description = excluded.description,
  is_system = true;

with grants(role_code, permission_code) as (
  values
    ('support_admin', 'support.dashboard.view'), ('support_admin', 'support.ticket.view'),
    ('support_admin', 'support.ticket.create'), ('support_admin', 'support.ticket.update'),
    ('support_admin', 'support.ticket.assign'), ('support_admin', 'support.ticket.reply'),
    ('support_admin', 'support.ticket.internal_note'), ('support_admin', 'support.contact.view'),
    ('support_admin', 'support.contact.manage'), ('support_admin', 'support.department.manage'),
    ('support_admin', 'support.category.manage'), ('support_admin', 'support.saved_reply.manage'),
    ('support_admin', 'support.attachment.manage'), ('support_admin', 'support.email.manage'),
    ('support_admin', 'support.automation.manage'),
    ('support_manager', 'support.dashboard.view'), ('support_manager', 'support.ticket.view'),
    ('support_manager', 'support.ticket.create'), ('support_manager', 'support.ticket.update'),
    ('support_manager', 'support.ticket.assign'), ('support_manager', 'support.ticket.reply'),
    ('support_manager', 'support.ticket.internal_note'), ('support_manager', 'support.contact.view'),
    ('support_manager', 'support.contact.manage'), ('support_manager', 'support.department.manage'),
    ('support_manager', 'support.category.manage'), ('support_manager', 'support.saved_reply.manage'),
    ('support_manager', 'support.attachment.manage'),
    ('support_agent', 'support.dashboard.view'), ('support_agent', 'support.ticket.view'),
    ('support_agent', 'support.ticket.create'), ('support_agent', 'support.ticket.update'),
    ('support_agent', 'support.ticket.assign'), ('support_agent', 'support.ticket.reply'),
    ('support_agent', 'support.ticket.internal_note'), ('support_agent', 'support.contact.view'),
    ('support_agent', 'support.contact.manage'), ('support_agent', 'support.saved_reply.manage'),
    ('support_agent', 'support.attachment.manage'),
    ('support_viewer', 'support.dashboard.view'), ('support_viewer', 'support.ticket.view'),
    ('support_viewer', 'support.contact.view')
)
insert into public.app_role_permissions (role_id, permission_code)
select role.id, grant_row.permission_code
from grants grant_row
join public.app_roles role on role.code = grant_row.role_code and role.company_id is null
on conflict do nothing;

create or replace function public.support_has_permission(p_company_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select private.has_company_permission(p_company_id, p_permission); $$;

revoke all on function public.support_has_permission(uuid, text) from public;
grant execute on function public.support_has_permission(uuid, text) to authenticated, service_role;

create or replace function private.support_user_has_permission(p_user_id uuid, p_company_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_user_id is not null and p_company_id is not null and p_permission is not null and (
      exists (
        select 1 from public.companies company
        where company.id = p_company_id and company.owner_id = p_user_id
      )
      or exists (
        select 1 from public.memberships membership
        where membership.company_id = p_company_id and membership.user_id = p_user_id
          and coalesce(membership.status, 'active') = 'active'
          and lower(membership.role) in ('owner', 'admin')
      )
      or exists (
        select 1
        from public.memberships membership
        join public.membership_role_assignments assignment on assignment.membership_id = membership.id
        join public.app_roles role on role.id = assignment.role_id
          and (role.company_id is null or role.company_id = membership.company_id)
        join public.app_role_permissions role_permission on role_permission.role_id = role.id
        where membership.company_id = p_company_id and membership.user_id = p_user_id
          and coalesce(membership.status, 'active') = 'active'
          and role_permission.permission_code = p_permission
      )
    );
$$;

revoke all on function private.support_user_has_permission(uuid, uuid, text) from public;
grant execute on function private.support_user_has_permission(uuid, uuid, text) to authenticated, service_role;

create or replace function public.support_list_agents(p_company_id uuid)
returns table(user_id uuid, membership_role text, email text, company_name text, signature_url text, department_ids uuid[])
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    membership.user_id,
    membership.role,
    profile.email,
    profile.company_name,
    profile.signature_url,
    coalesce((select array_agg(department_membership.department_id order by department_membership.department_id)
      from public.support_department_memberships department_membership
      where department_membership.company_id = membership.company_id
        and department_membership.user_id = membership.user_id
        and department_membership.is_active), '{}'::uuid[])
  from public.memberships membership
  join public.profiles profile on profile.id = membership.user_id
  where membership.company_id = p_company_id
    and coalesce(membership.status, 'active') = 'active'
    and private.support_user_has_permission(membership.user_id, p_company_id, 'support.ticket.reply')
    and private.has_company_permission(p_company_id, 'support.ticket.assign');
$$;

revoke all on function public.support_list_agents(uuid) from public;
grant execute on function public.support_list_agents(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Reference data and generic contact model
-- ---------------------------------------------------------------------------

create table if not exists public.support_departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  unique (company_id, id),
  unique (company_id, code),
  unique (company_id, name)
);

create index if not exists support_departments_company_active_idx
  on public.support_departments(company_id, is_active, name)
  where deleted_at is null;

create table if not exists public.support_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  parent_id uuid,
  name text not null,
  slug text not null,
  description text,
  color text not null default '#004FFE',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  unique (company_id, id),
  unique (company_id, slug),
  foreign key (company_id, parent_id) references public.support_categories(company_id, id) on delete set null,
  check (color ~ '^#[0-9A-Fa-f]{6}$')
);

create index if not exists support_categories_tree_idx
  on public.support_categories(company_id, parent_id, sort_order, name)
  where deleted_at is null;

create table if not exists public.support_tags (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  slug text not null,
  color text not null default '#004FFE',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  unique (company_id, id),
  unique (company_id, slug),
  check (color ~ '^#[0-9A-Fa-f]{6}$')
);

create index if not exists support_tags_search_idx
  on public.support_tags(company_id, name)
  where deleted_at is null;

create table if not exists public.support_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  display_name text not null,
  email text,
  email_normalized text generated always as (lower(nullif(trim(email), ''))) stored,
  phone text,
  organization_name text,
  contact_kind text not null default 'external_customer',
  linked_entity_type text,
  linked_entity_id uuid,
  linked_profile_id uuid references public.profiles(id) on delete set null,
  source_application text,
  external_reference text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  unique (company_id, id),
  check (contact_kind in ('external_customer', 'internal', 'supplier', 'lead', 'organization', 'other')),
  check (linked_entity_type is null or length(trim(linked_entity_type)) between 2 and 80)
);

create unique index if not exists support_contacts_email_unique
  on public.support_contacts(company_id, email_normalized)
  where email_normalized is not null and deleted_at is null;
create index if not exists support_contacts_search_idx
  on public.support_contacts(company_id, display_name, email_normalized)
  where deleted_at is null;
create index if not exists support_contacts_linked_entity_idx
  on public.support_contacts(company_id, linked_entity_type, linked_entity_id)
  where deleted_at is null;

create table if not exists public.support_department_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  department_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (company_id, department_id, user_id),
  foreign key (company_id, department_id) references public.support_departments(company_id, id) on delete cascade
);

create index if not exists support_department_memberships_user_idx
  on public.support_department_memberships(company_id, user_id, is_active);

-- ---------------------------------------------------------------------------
-- Mailboxes, ticket numbering, tickets, conversations, and messages
-- ---------------------------------------------------------------------------

create table if not exists public.support_mailboxes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  department_id uuid,
  address text not null,
  display_name text not null default 'OperiX Support',
  ticket_prefix text not null,
  source_application text not null default 'operix',
  reply_to text,
  imap_host text,
  imap_port integer not null default 993,
  imap_username text,
  imap_password_ciphertext text,
  imap_tls_mode text not null default 'implicit',
  smtp_host text,
  smtp_port integer not null default 587,
  smtp_username text,
  smtp_password_ciphertext text,
  smtp_tls_mode text not null default 'starttls',
  default_signature text,
  sync_mode text not null default 'idle',
  sync_interval_seconds integer not null default 300,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  unique (company_id, id),
  unique (company_id, address),
  foreign key (company_id, department_id) references public.support_departments(company_id, id) on delete set null,
  check (address = lower(address)),
  check (ticket_prefix ~ '^[A-Z0-9]{2,12}$'),
  check (imap_port between 1 and 65535),
  check (smtp_port between 1 and 65535),
  check (imap_tls_mode in ('implicit', 'starttls', 'none')),
  check (smtp_tls_mode in ('implicit', 'starttls', 'none')),
  check (sync_mode in ('webhook', 'idle', 'poll')),
  check (sync_interval_seconds between 30 and 86400)
);

create index if not exists support_mailboxes_active_idx
  on public.support_mailboxes(company_id, is_active)
  where deleted_at is null;

create sequence if not exists public.support_ticket_global_number_seq as bigint start with 1 increment by 1 no minvalue;

create table if not exists public.support_ticket_number_ledger (
  sequence_value bigint primary key,
  ticket_number text not null unique,
  company_id uuid not null references public.companies(id) on delete restrict,
  mailbox_id uuid references public.support_mailboxes(id) on delete set null,
  allocated_at timestamptz not null default now()
);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ticket_number text not null unique,
  subject text not null,
  status text not null default 'open',
  priority text not null default 'normal',
  category_id uuid,
  department_id uuid,
  assigned_user_id uuid references auth.users(id) on delete set null,
  contact_id uuid,
  mailbox_id uuid,
  source_application text not null default 'operix',
  first_response_at timestamptz,
  acknowledgement_sent_at timestamptz,
  acknowledgement_delivery_id uuid,
  resolved_at timestamptz,
  closed_at timestamptz,
  archived_at timestamptz,
  last_message_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  unique (company_id, id),
  foreign key (company_id, category_id) references public.support_categories(company_id, id) on delete set null,
  foreign key (company_id, department_id) references public.support_departments(company_id, id) on delete set null,
  foreign key (company_id, contact_id) references public.support_contacts(company_id, id) on delete set null,
  foreign key (company_id, mailbox_id) references public.support_mailboxes(company_id, id) on delete set null,
  check (status in ('open', 'waiting_on_customer', 'waiting_on_agent', 'in_progress', 'resolved', 'closed', 'archived')),
  check (priority in ('low', 'normal', 'high', 'urgent', 'critical')),
  check (length(trim(subject)) between 1 and 240)
);

create index if not exists support_tickets_company_updated_idx
  on public.support_tickets(company_id, updated_at desc)
  where deleted_at is null;
create index if not exists support_tickets_status_priority_idx
  on public.support_tickets(company_id, status, priority, updated_at desc)
  where deleted_at is null;
create index if not exists support_tickets_assignment_idx
  on public.support_tickets(company_id, assigned_user_id, status, updated_at desc)
  where deleted_at is null;
create index if not exists support_tickets_contact_idx
  on public.support_tickets(company_id, contact_id, updated_at desc)
  where deleted_at is null;
create index if not exists support_tickets_subject_search_idx
  on public.support_tickets using gin (to_tsvector('simple', subject));

create table if not exists public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ticket_id uuid not null,
  conversation_type text not null default 'email',
  external_thread_id text,
  provider_thread_key text,
  mailbox_id uuid,
  address text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, ticket_id) references public.support_tickets(company_id, id) on delete cascade,
  foreign key (company_id, mailbox_id) references public.support_mailboxes(company_id, id) on delete set null,
  check (conversation_type in ('email', 'live_chat', 'whatsapp', 'telegram', 'facebook_messenger', 'api', 'voice', 'sms'))
);

create unique index if not exists support_conversations_external_thread_unique
  on public.support_conversations(company_id, conversation_type, external_thread_id)
  where external_thread_id is not null;
create index if not exists support_conversations_ticket_idx
  on public.support_conversations(company_id, ticket_id, updated_at desc);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  conversation_id uuid not null,
  author_user_id uuid references auth.users(id) on delete set null,
  author_contact_id uuid,
  visibility text not null default 'public',
  body_text text,
  body_html text,
  raw_body text,
  subject text,
  external_message_id text,
  in_reply_to text,
  reference_ids text[] not null default '{}',
  language text,
  sentiment text,
  summary text,
  labels jsonb not null default '[]'::jsonb,
  embedding_reference text,
  source text not null default 'agent',
  email_headers jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  foreign key (company_id, conversation_id) references public.support_conversations(company_id, id) on delete cascade,
  foreign key (company_id, author_contact_id) references public.support_contacts(company_id, id) on delete set null,
  check (visibility in ('public', 'internal', 'system')),
  check (source in ('agent', 'customer', 'system', 'integration')),
  check (author_user_id is not null or author_contact_id is not null or visibility = 'system'),
  check (body_text is not null or body_html is not null)
);

create unique index if not exists support_messages_external_id_unique
  on public.support_messages(company_id, external_message_id)
  where external_message_id is not null;
create index if not exists support_messages_conversation_idx
  on public.support_messages(company_id, conversation_id, created_at);

create table if not exists public.support_attachments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ticket_id uuid not null,
  message_id uuid,
  filename text not null,
  content_type text not null,
  byte_size bigint not null,
  storage_path text not null,
  checksum_sha256 text,
  provider_attachment_id text,
  virus_scan_status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (company_id, id),
  foreign key (company_id, ticket_id) references public.support_tickets(company_id, id) on delete cascade,
  foreign key (message_id) references public.support_messages(id) on delete set null,
  check (byte_size > 0),
  check (virus_scan_status in ('pending', 'clean', 'quarantined', 'failed'))
);

create unique index if not exists support_attachments_provider_unique
  on public.support_attachments(company_id, ticket_id, provider_attachment_id)
  where provider_attachment_id is not null;
create unique index if not exists support_attachments_checksum_unique
  on public.support_attachments(company_id, ticket_id, checksum_sha256)
  where checksum_sha256 is not null;
create index if not exists support_attachments_ticket_idx
  on public.support_attachments(company_id, ticket_id, created_at);

create table if not exists public.support_ticket_tags (
  company_id uuid not null references public.companies(id) on delete cascade,
  ticket_id uuid not null,
  tag_id uuid not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  primary key (ticket_id, tag_id),
  foreign key (company_id, ticket_id) references public.support_tickets(company_id, id) on delete cascade,
  foreign key (company_id, tag_id) references public.support_tags(company_id, id) on delete cascade
);

create index if not exists support_ticket_tags_tag_idx on public.support_ticket_tags(company_id, tag_id, ticket_id);

create table if not exists public.support_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ticket_id uuid not null,
  event_name text not null,
  payload jsonb not null default '{}'::jsonb,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_contact_id uuid references public.support_contacts(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (company_id, ticket_id) references public.support_tickets(company_id, id) on delete cascade,
  check (jsonb_typeof(payload) = 'object'),
  check (event_name ~ '^[a-z][a-z0-9_]{2,80}$')
);

create index if not exists support_events_ticket_idx on public.support_events(company_id, ticket_id, created_at);

create table if not exists public.support_saved_replies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  body_text text not null,
  body_html text,
  category_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  unique (company_id, id),
  foreign key (company_id, category_id) references public.support_categories(company_id, id) on delete set null
);

create index if not exists support_saved_replies_search_idx
  on public.support_saved_replies using gin (to_tsvector('simple', name || ' ' || body_text))
  where deleted_at is null and is_active;

create table if not exists public.support_saved_filters (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid references auth.users(id) on delete cascade,
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  is_shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id)
);

-- Number allocation is deliberately sequence-backed. PostgreSQL sequence values
-- are not rolled back, so a failed transaction cannot cause a ticket number to be
-- reused. The ledger preserves the allocation audit trail.
create or replace function private.support_next_ticket_number(p_company_id uuid, p_mailbox_id uuid, p_source_application text default null)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prefix text := case lower(coalesce(p_source_application, ''))
    when 'internetkudo' then 'IK'
    when 'invoice' then 'INV'
    when 'hr' then 'HR'
    when 'booking' then 'BOOK'
    when 'desk' then 'DESK'
    when 'crm' then 'CRM'
    when 'pos' then 'POS'
    when 'scanner' then 'SCAN'
    when 'tracker' then 'TRK'
    else 'SUP'
  end;
  sequence_value bigint;
  result text;
begin
  if p_mailbox_id is not null then
    select mailbox.ticket_prefix into prefix
    from public.support_mailboxes mailbox
    where mailbox.id = p_mailbox_id and mailbox.company_id = p_company_id and mailbox.deleted_at is null;
  end if;
  prefix := upper(coalesce(nullif(trim(prefix), ''), 'SUP'));
  sequence_value := nextval('public.support_ticket_global_number_seq');
  result := prefix || '-' || to_char(timezone('UTC', now()), 'YYYYMMDD') || '-' || lpad(sequence_value::text, 6, '0');
  insert into public.support_ticket_number_ledger(sequence_value, ticket_number, company_id, mailbox_id)
  values (sequence_value, result, p_company_id, p_mailbox_id);
  return result;
end;
$$;

create or replace function private.support_assign_ticket_number()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.ticket_number is null or trim(new.ticket_number) = '' then
    new.ticket_number := private.support_next_ticket_number(new.company_id, new.mailbox_id, new.source_application);
  end if;
  return new;
end;
$$;

drop trigger if exists support_tickets_assign_number on public.support_tickets;
create trigger support_tickets_assign_number
before insert on public.support_tickets
for each row execute function private.support_assign_ticket_number();

create or replace function public.support_create_ticket(
  p_company_id uuid,
  p_subject text,
  p_description text,
  p_priority text default 'normal',
  p_category_id uuid default null,
  p_department_id uuid default null,
  p_contact_id uuid default null,
  p_mailbox_id uuid default null,
  p_source_application text default 'operix'
)
returns table(ticket_id uuid, ticket_number text, conversation_id uuid, message_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created_ticket_id uuid;
  created_ticket_number text;
  created_conversation_id uuid;
  created_message_id uuid;
begin
  if not private.has_company_permission(p_company_id, 'support.ticket.create') then
    raise exception using errcode = '42501', message = 'Support ticket creation is not permitted';
  end if;
  if nullif(trim(p_subject), '') is null or length(trim(p_subject)) > 240 then
    raise exception using errcode = '22023', message = 'Ticket subject is invalid';
  end if;
  if nullif(trim(p_description), '') is null then
    raise exception using errcode = '22023', message = 'Ticket description is required';
  end if;
  insert into public.support_tickets(
    company_id, subject, priority, category_id, department_id, contact_id,
    mailbox_id, source_application, created_by, updated_by, last_message_at
  ) values (
    p_company_id, trim(p_subject), coalesce(p_priority, 'normal'), p_category_id,
    p_department_id, p_contact_id, p_mailbox_id, coalesce(nullif(trim(p_source_application), ''), 'operix'),
    auth.uid(), auth.uid(), now()
  ) returning id, support_tickets.ticket_number into created_ticket_id, created_ticket_number;

  insert into public.support_conversations(company_id, ticket_id, conversation_type, mailbox_id, address)
  values (p_company_id, created_ticket_id, case when p_mailbox_id is null then 'api' else 'email' end, p_mailbox_id,
    (select address from public.support_mailboxes where id = p_mailbox_id and company_id = p_company_id))
  returning id into created_conversation_id;

  insert into public.support_messages(
    company_id, conversation_id, author_user_id, visibility, body_text, source, sent_at
  ) values (p_company_id, created_conversation_id, auth.uid(), 'public', trim(p_description), 'agent', now())
  returning id into created_message_id;

  insert into public.support_events(company_id, ticket_id, event_name, payload, actor_user_id)
  values (p_company_id, created_ticket_id, 'ticket_created', jsonb_build_object(
    'ticket_number', created_ticket_number, 'source_application', coalesce(p_source_application, 'operix'),
    'priority', coalesce(p_priority, 'normal'), 'conversation_id', created_conversation_id,
    'message_id', created_message_id
  ), auth.uid());

  return query select created_ticket_id, created_ticket_number, created_conversation_id, created_message_id;
end;
$$;

create or replace function public.support_add_message(
  p_company_id uuid,
  p_ticket_id uuid,
  p_body_text text,
  p_body_html text default null,
  p_visibility text default 'public',
  p_source text default 'agent',
  p_external_message_id text default null,
  p_in_reply_to text default null,
  p_reference_ids text[] default '{}'
)
returns table(message_id uuid, conversation_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing_conversation_id uuid;
  created_message_id uuid;
begin
  if p_visibility = 'internal' then
    if not private.has_company_permission(p_company_id, 'support.ticket.internal_note') then
      raise exception using errcode = '42501', message = 'Internal notes are not permitted';
    end if;
  elsif p_visibility = 'public' then
    if not private.has_company_permission(p_company_id, 'support.ticket.reply') then
      raise exception using errcode = '42501', message = 'Support replies are not permitted';
    end if;
  elsif p_visibility = 'system' then
    if not private.has_company_permission(p_company_id, 'support.ticket.update') then
      raise exception using errcode = '42501', message = 'System events are not permitted';
    end if;
  else
    raise exception using errcode = '22023', message = 'Message visibility is invalid';
  end if;
  if nullif(trim(coalesce(p_body_text, '')), '') is null and nullif(trim(coalesce(p_body_html, '')), '') is null then
    raise exception using errcode = '22023', message = 'Message body is required';
  end if;
  select conversation.id into existing_conversation_id
  from public.support_conversations conversation
  where conversation.company_id = p_company_id and conversation.ticket_id = p_ticket_id
  order by conversation.created_at
  limit 1;
  if existing_conversation_id is null then
    raise exception using errcode = '23503', message = 'Ticket conversation does not exist';
  end if;
  insert into public.support_messages(
    company_id, conversation_id, author_user_id, visibility, body_text, body_html,
    source, external_message_id, in_reply_to, reference_ids, sent_at
  ) values (
    p_company_id, existing_conversation_id, auth.uid(), p_visibility, nullif(trim(p_body_text), ''),
    nullif(trim(p_body_html), ''), coalesce(p_source, 'agent'), nullif(trim(p_external_message_id), ''),
    nullif(trim(p_in_reply_to), ''), coalesce(p_reference_ids, '{}'), now()
  ) returning id into created_message_id;
  update public.support_tickets
  set last_message_at = now(),
      first_response_at = case when p_visibility = 'public' and first_response_at is null then now() else first_response_at end,
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_ticket_id and company_id = p_company_id;
  insert into public.support_events(company_id, ticket_id, event_name, payload, actor_user_id)
  values (
    p_company_id, p_ticket_id,
    case when p_visibility = 'internal' then 'note_created' else 'reply_created' end,
    jsonb_build_object('message_id', created_message_id, 'conversation_id', existing_conversation_id, 'visibility', p_visibility),
    auth.uid()
  );
  return query select created_message_id, existing_conversation_id;
end;
$$;

create or replace function public.support_assign_ticket(
  p_company_id uuid,
  p_ticket_id uuid,
  p_agent_id uuid,
  p_department_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare old_agent_id uuid; old_department_id uuid;
begin
  if not private.has_company_permission(p_company_id, 'support.ticket.assign') then
    raise exception using errcode = '42501', message = 'Ticket assignment is not permitted';
  end if;
  if p_agent_id is not null and not private.support_user_has_permission(p_agent_id, p_company_id, 'support.ticket.reply') then
    raise exception using errcode = '42501', message = 'The selected user is not a Support agent';
  end if;
  select assigned_user_id, department_id into old_agent_id, old_department_id
  from public.support_tickets
  where id = p_ticket_id and company_id = p_company_id and deleted_at is null
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'Ticket not found'; end if;
  update public.support_tickets
  set assigned_user_id = p_agent_id, department_id = coalesce(p_department_id, department_id), updated_by = auth.uid(), updated_at = now()
  where id = p_ticket_id and company_id = p_company_id;
  insert into public.support_events(company_id, ticket_id, event_name, payload, actor_user_id)
  values (p_company_id, p_ticket_id, 'assignment_changed', jsonb_build_object(
    'previous_agent_id', old_agent_id, 'agent_id', p_agent_id,
    'previous_department_id', old_department_id, 'department_id', coalesce(p_department_id, old_department_id)
  ), auth.uid());
  if p_department_id is not null and p_department_id is distinct from old_department_id then
    insert into public.support_events(company_id, ticket_id, event_name, payload, actor_user_id)
    values (p_company_id, p_ticket_id, 'department_changed', jsonb_build_object(
      'previous_department_id', old_department_id, 'department_id', p_department_id
    ), auth.uid());
  end if;
  return true;
end;
$$;

create or replace function public.support_bulk_assign_tickets(
  p_company_id uuid,
  p_ticket_ids uuid[],
  p_agent_id uuid,
  p_department_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ticket_id uuid;
  assigned_count integer := 0;
begin
  if not private.has_company_permission(p_company_id, 'support.ticket.assign') then
    raise exception using errcode = '42501', message = 'Ticket assignment is not permitted';
  end if;
  if coalesce(cardinality(p_ticket_ids), 0) > 200 then
    raise exception using errcode = '22023', message = 'Bulk assignment is limited to 200 tickets';
  end if;
  foreach ticket_id in array coalesce(p_ticket_ids, '{}'::uuid[]) loop
    perform public.support_assign_ticket(p_company_id, ticket_id, p_agent_id, p_department_id);
    assigned_count := assigned_count + 1;
  end loop;
  return assigned_count;
end;
$$;

revoke all on function public.support_create_ticket(uuid, text, text, text, uuid, uuid, uuid, uuid, text) from public;
revoke all on function public.support_add_message(uuid, uuid, text, text, text, text, text, text, text[]) from public;
revoke all on function public.support_assign_ticket(uuid, uuid, uuid, uuid) from public;
revoke all on function public.support_bulk_assign_tickets(uuid, uuid[], uuid, uuid) from public;
grant execute on function public.support_create_ticket(uuid, text, text, text, uuid, uuid, uuid, uuid, text) to authenticated, service_role;
grant execute on function public.support_add_message(uuid, uuid, text, text, text, text, text, text, text[]) to authenticated, service_role;
grant execute on function public.support_assign_ticket(uuid, uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.support_bulk_assign_tickets(uuid, uuid[], uuid, uuid) to authenticated, service_role;

create or replace function private.support_touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'support_departments', 'support_categories', 'support_tags', 'support_contacts',
    'support_mailboxes', 'support_tickets', 'support_conversations', 'support_messages',
    'support_saved_replies', 'support_saved_filters'
  ] loop
    execute format('drop trigger if exists %I_touch_updated_at on public.%I', table_name, table_name);
    execute format('create trigger %I_touch_updated_at before update on public.%I for each row execute function private.support_touch_updated_at()', table_name, table_name);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Email ingestion, delivery, worker queue, and automation foundation
-- ---------------------------------------------------------------------------

create table if not exists public.support_email_inbox_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  mailbox_id uuid not null,
  ticket_id uuid,
  provider_uid bigint,
  uid_validity bigint,
  message_id text,
  message_hash text not null,
  received_at timestamptz,
  imported_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  foreign key (company_id, mailbox_id) references public.support_mailboxes(company_id, id) on delete cascade,
  foreign key (company_id, ticket_id) references public.support_tickets(company_id, id) on delete set null,
  unique (mailbox_id, provider_uid, uid_validity),
  unique (mailbox_id, message_id),
  unique (mailbox_id, message_hash)
);

create index if not exists support_email_inbox_messages_ticket_idx
  on public.support_email_inbox_messages(company_id, ticket_id, imported_at desc);

create table if not exists public.support_mailbox_sync_state (
  mailbox_id uuid primary key references public.support_mailboxes(id) on delete cascade,
  uid_validity bigint,
  last_uid bigint not null default 0,
  last_synced_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

create table if not exists public.support_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  mailbox_id uuid,
  message_id uuid,
  ticket_id uuid,
  recipient text not null,
  subject text,
  delivery_type text not null default 'message',
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  provider_message_id text,
  last_error text,
  idempotency_key text not null unique,
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (company_id, mailbox_id) references public.support_mailboxes(company_id, id) on delete set null,
  foreign key (message_id) references public.support_messages(id) on delete set null,
  foreign key (company_id, ticket_id) references public.support_tickets(company_id, id) on delete set null,
  check (status in ('queued', 'sending', 'sent', 'failed', 'retrying', 'bounced')),
  check (delivery_type in ('message', 'acknowledgement')),
  check (attempts >= 0)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'support_tickets_ack_delivery_fk'
      and conrelid = 'public.support_tickets'::regclass
  ) then
    alter table public.support_tickets
      add constraint support_tickets_ack_delivery_fk
      foreign key (acknowledgement_delivery_id) references public.support_email_deliveries(id) on delete set null;
  end if;
end $$;

create index if not exists support_email_deliveries_queue_idx
  on public.support_email_deliveries(status, next_attempt_at)
  where status in ('queued', 'retrying');
create index if not exists support_email_deliveries_ticket_idx
  on public.support_email_deliveries(company_id, ticket_id, queued_at desc);

create table if not exists public.support_job_queue (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  company_id uuid references public.companies(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  attempts integer not null default 0,
  max_attempts integer not null default 8,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  idempotency_key text unique,
  check (status in ('queued', 'running', 'completed', 'failed', 'dead_letter')),
  check (attempts >= 0 and max_attempts between 1 and 32)
);

create index if not exists support_job_queue_claim_idx
  on public.support_job_queue(status, available_at, created_at)
  where status = 'queued';

create table if not exists public.support_automation_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text,
  event_name text not null,
  conditions jsonb not null default '{}'::jsonb,
  is_active boolean not null default false,
  priority integer not null default 100,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  unique (company_id, id)
);

create index if not exists support_automation_rules_event_idx
  on public.support_automation_rules(company_id, event_name, priority)
  where deleted_at is null and is_active;

create table if not exists public.support_automation_actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  rule_id uuid not null,
  action_type text not null,
  configuration jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (company_id, rule_id) references public.support_automation_rules(company_id, id) on delete cascade,
  unique (company_id, id)
);

create index if not exists support_automation_actions_order_idx
  on public.support_automation_actions(company_id, rule_id, sort_order);

do $$
declare table_name text;
begin
  foreach table_name in array array['support_mailbox_sync_state', 'support_email_deliveries', 'support_job_queue'] loop
    execute format('drop trigger if exists %I_touch_updated_at on public.%I', table_name, table_name);
    execute format('create trigger %I_touch_updated_at before update on public.%I for each row execute function private.support_touch_updated_at()', table_name, table_name);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Private helpers and RLS
-- ---------------------------------------------------------------------------

create or replace function private.support_storage_company_id(object_name text)
returns uuid
language plpgsql
stable
set search_path = public, storage, pg_temp
as $$
begin
  return (storage.foldername(object_name))[1]::uuid;
exception when others then
  return null;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'support_departments', 'support_categories', 'support_tags', 'support_contacts',
    'support_department_memberships', 'support_mailboxes', 'support_ticket_number_ledger',
    'support_tickets', 'support_conversations', 'support_messages', 'support_attachments',
    'support_ticket_tags', 'support_events', 'support_saved_replies', 'support_saved_filters',
    'support_email_inbox_messages', 'support_mailbox_sync_state', 'support_email_deliveries',
    'support_job_queue', 'support_automation_rules', 'support_automation_actions'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

-- Reference data
drop policy if exists support_departments_read on public.support_departments;
create policy support_departments_read on public.support_departments for select to authenticated
using ((select private.has_company_permission(company_id, 'support.ticket.view')));
drop policy if exists support_departments_manage on public.support_departments;
create policy support_departments_manage on public.support_departments for all to authenticated
using ((select private.has_company_permission(company_id, 'support.department.manage')))
with check ((select private.has_company_permission(company_id, 'support.department.manage')));

drop policy if exists support_categories_read on public.support_categories;
create policy support_categories_read on public.support_categories for select to authenticated
using ((select private.has_company_permission(company_id, 'support.ticket.view')));
drop policy if exists support_categories_manage on public.support_categories;
create policy support_categories_manage on public.support_categories for all to authenticated
using ((select private.has_company_permission(company_id, 'support.category.manage')))
with check ((select private.has_company_permission(company_id, 'support.category.manage')));

drop policy if exists support_tags_read on public.support_tags;
create policy support_tags_read on public.support_tags for select to authenticated
using ((select private.has_company_permission(company_id, 'support.ticket.view')));
drop policy if exists support_tags_manage on public.support_tags;
create policy support_tags_manage on public.support_tags for all to authenticated
using ((select private.has_company_permission(company_id, 'support.category.manage')))
with check ((select private.has_company_permission(company_id, 'support.category.manage')));

drop policy if exists support_contacts_read on public.support_contacts;
create policy support_contacts_read on public.support_contacts for select to authenticated
using ((select private.has_company_permission(company_id, 'support.contact.view')));
drop policy if exists support_contacts_manage on public.support_contacts;
create policy support_contacts_manage on public.support_contacts for all to authenticated
using ((select private.has_company_permission(company_id, 'support.contact.manage')))
with check ((select private.has_company_permission(company_id, 'support.contact.manage')));

drop policy if exists support_department_memberships_read on public.support_department_memberships;
create policy support_department_memberships_read on public.support_department_memberships for select to authenticated
using ((select private.has_company_permission(company_id, 'support.ticket.view')));
drop policy if exists support_department_memberships_manage on public.support_department_memberships;
create policy support_department_memberships_manage on public.support_department_memberships for all to authenticated
using ((select private.has_company_permission(company_id, 'support.department.manage')))
with check ((select private.has_company_permission(company_id, 'support.department.manage')));

-- Mailbox settings are restricted to email administrators.
drop policy if exists support_mailboxes_read on public.support_mailboxes;
create policy support_mailboxes_read on public.support_mailboxes for select to authenticated
using ((select private.has_company_permission(company_id, 'support.email.manage')));
drop policy if exists support_mailboxes_manage on public.support_mailboxes;
create policy support_mailboxes_manage on public.support_mailboxes for all to authenticated
using ((select private.has_company_permission(company_id, 'support.email.manage')))
with check ((select private.has_company_permission(company_id, 'support.email.manage')));

-- Ticket graph
drop policy if exists support_tickets_read on public.support_tickets;
create policy support_tickets_read on public.support_tickets for select to authenticated
using ((select private.has_company_permission(company_id, 'support.ticket.view')) and deleted_at is null);
drop policy if exists support_tickets_insert on public.support_tickets;
create policy support_tickets_insert on public.support_tickets for insert to authenticated
with check ((select private.has_company_permission(company_id, 'support.ticket.create')));
drop policy if exists support_tickets_update on public.support_tickets;
create policy support_tickets_update on public.support_tickets for update to authenticated
using ((select private.has_company_permission(company_id, 'support.ticket.update')))
with check ((select private.has_company_permission(company_id, 'support.ticket.update')));

drop policy if exists support_conversations_read on public.support_conversations;
create policy support_conversations_read on public.support_conversations for select to authenticated
using ((select private.has_company_permission(company_id, 'support.ticket.view')));
drop policy if exists support_conversations_insert on public.support_conversations;
create policy support_conversations_insert on public.support_conversations for insert to authenticated
with check ((select private.has_company_permission(company_id, 'support.ticket.create')) or (select private.has_company_permission(company_id, 'support.ticket.reply')));
drop policy if exists support_conversations_update on public.support_conversations;
create policy support_conversations_update on public.support_conversations for update to authenticated
using ((select private.has_company_permission(company_id, 'support.ticket.update')))
with check ((select private.has_company_permission(company_id, 'support.ticket.update')));

drop policy if exists support_messages_read on public.support_messages;
create policy support_messages_read on public.support_messages for select to authenticated
using ((select private.has_company_permission(company_id, 'support.ticket.view')));
drop policy if exists support_messages_insert on public.support_messages;
create policy support_messages_insert on public.support_messages for insert to authenticated
with check (
  (visibility = 'internal' and (select private.has_company_permission(company_id, 'support.ticket.internal_note')))
  or (visibility = 'public' and (select private.has_company_permission(company_id, 'support.ticket.reply')))
  or (visibility = 'system' and (select private.has_company_permission(company_id, 'support.ticket.update')))
);
drop policy if exists support_messages_update on public.support_messages;
create policy support_messages_update on public.support_messages for update to authenticated
using ((select private.has_company_permission(company_id, 'support.ticket.update')))
with check ((select private.has_company_permission(company_id, 'support.ticket.update')));

drop policy if exists support_attachments_read on public.support_attachments;
create policy support_attachments_read on public.support_attachments for select to authenticated
using ((select private.has_company_permission(company_id, 'support.ticket.view')));
drop policy if exists support_attachments_insert on public.support_attachments;
create policy support_attachments_insert on public.support_attachments for insert to authenticated
with check ((select private.has_company_permission(company_id, 'support.attachment.manage')));
drop policy if exists support_attachments_update on public.support_attachments;
create policy support_attachments_update on public.support_attachments for update to authenticated
using ((select private.has_company_permission(company_id, 'support.attachment.manage')))
with check ((select private.has_company_permission(company_id, 'support.attachment.manage')));

drop policy if exists support_ticket_tags_read on public.support_ticket_tags;
create policy support_ticket_tags_read on public.support_ticket_tags for select to authenticated
using ((select private.has_company_permission(company_id, 'support.ticket.view')));
drop policy if exists support_ticket_tags_manage on public.support_ticket_tags;
create policy support_ticket_tags_manage on public.support_ticket_tags for update to authenticated
using ((select private.has_company_permission(company_id, 'support.ticket.update')))
with check ((select private.has_company_permission(company_id, 'support.ticket.update')));
drop policy if exists support_ticket_tags_insert on public.support_ticket_tags;
create policy support_ticket_tags_insert on public.support_ticket_tags for insert to authenticated
with check ((select private.has_company_permission(company_id, 'support.ticket.update')) or (select private.has_company_permission(company_id, 'support.ticket.create')));
drop policy if exists support_ticket_tags_delete on public.support_ticket_tags;
create policy support_ticket_tags_delete on public.support_ticket_tags for delete to authenticated
using ((select private.has_company_permission(company_id, 'support.ticket.update')));

drop policy if exists support_events_read on public.support_events;
create policy support_events_read on public.support_events for select to authenticated
using ((select private.has_company_permission(company_id, 'support.ticket.view')));
drop policy if exists support_events_insert on public.support_events;
create policy support_events_insert on public.support_events for insert to authenticated
with check ((select private.has_company_permission(company_id, 'support.ticket.update')) or (select private.has_company_permission(company_id, 'support.ticket.reply')));

-- Agent utilities
drop policy if exists support_saved_replies_read on public.support_saved_replies;
create policy support_saved_replies_read on public.support_saved_replies for select to authenticated
using ((select private.has_company_permission(company_id, 'support.ticket.view')) and deleted_at is null);
drop policy if exists support_saved_replies_manage on public.support_saved_replies;
create policy support_saved_replies_manage on public.support_saved_replies for all to authenticated
using ((select private.has_company_permission(company_id, 'support.saved_reply.manage')))
with check ((select private.has_company_permission(company_id, 'support.saved_reply.manage')));

drop policy if exists support_saved_filters_read on public.support_saved_filters;
create policy support_saved_filters_read on public.support_saved_filters for select to authenticated
using ((select private.has_company_permission(company_id, 'support.ticket.view')) and (is_shared or created_by = (select auth.uid())));
drop policy if exists support_saved_filters_manage on public.support_saved_filters;
create policy support_saved_filters_manage on public.support_saved_filters for all to authenticated
using ((select private.has_company_permission(company_id, 'support.ticket.view')) and (is_shared or created_by = (select auth.uid())))
with check ((select private.has_company_permission(company_id, 'support.ticket.view')) and (is_shared or created_by = (select auth.uid())));

-- The worker is the only writer of imported inbox records, sync state, and jobs.
drop policy if exists support_email_deliveries_read on public.support_email_deliveries;
create policy support_email_deliveries_read on public.support_email_deliveries for select to authenticated
using ((select private.has_company_permission(company_id, 'support.email.manage')) or (select private.has_company_permission(company_id, 'support.ticket.view')));
drop policy if exists support_email_deliveries_insert on public.support_email_deliveries;
create policy support_email_deliveries_insert on public.support_email_deliveries for insert to authenticated
with check ((select private.has_company_permission(company_id, 'support.ticket.reply')));
drop policy if exists support_email_deliveries_update on public.support_email_deliveries;
create policy support_email_deliveries_update on public.support_email_deliveries for update to authenticated
using ((select private.has_company_permission(company_id, 'support.email.manage')))
with check ((select private.has_company_permission(company_id, 'support.email.manage')));

drop policy if exists support_automation_rules_read on public.support_automation_rules;
create policy support_automation_rules_read on public.support_automation_rules for select to authenticated
using ((select private.has_company_permission(company_id, 'support.automation.manage')));
drop policy if exists support_automation_rules_manage on public.support_automation_rules;
create policy support_automation_rules_manage on public.support_automation_rules for all to authenticated
using ((select private.has_company_permission(company_id, 'support.automation.manage')))
with check ((select private.has_company_permission(company_id, 'support.automation.manage')));
drop policy if exists support_automation_actions_read on public.support_automation_actions;
create policy support_automation_actions_read on public.support_automation_actions for select to authenticated
using ((select private.has_company_permission(company_id, 'support.automation.manage')));
drop policy if exists support_automation_actions_manage on public.support_automation_actions;
create policy support_automation_actions_manage on public.support_automation_actions for all to authenticated
using ((select private.has_company_permission(company_id, 'support.automation.manage')))
with check ((select private.has_company_permission(company_id, 'support.automation.manage')));

-- Private attachment bucket. The object path is company_id/ticket_id/file_id/name.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'operix-support-attachments', 'operix-support-attachments', false, 26214400,
  array[
    'application/pdf', 'text/plain', 'application/zip', 'application/x-zip-compressed',
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists support_storage_read on storage.objects;
create policy support_storage_read on storage.objects for select to authenticated
using (bucket_id = 'operix-support-attachments' and (select private.has_company_permission(private.support_storage_company_id(name), 'support.ticket.view')));
drop policy if exists support_storage_insert on storage.objects;
create policy support_storage_insert on storage.objects for insert to authenticated
with check (bucket_id = 'operix-support-attachments' and (select private.has_company_permission(private.support_storage_company_id(name), 'support.attachment.manage')));
drop policy if exists support_storage_update on storage.objects;
create policy support_storage_update on storage.objects for update to authenticated
using (bucket_id = 'operix-support-attachments' and (select private.has_company_permission(private.support_storage_company_id(name), 'support.attachment.manage')))
with check (bucket_id = 'operix-support-attachments' and (select private.has_company_permission(private.support_storage_company_id(name), 'support.attachment.manage')));
drop policy if exists support_storage_delete on storage.objects;
create policy support_storage_delete on storage.objects for delete to authenticated
using (bucket_id = 'operix-support-attachments' and (select private.has_company_permission(private.support_storage_company_id(name), 'support.attachment.manage')));

grant execute on function private.support_next_ticket_number(uuid, uuid, text) to authenticated, service_role;
