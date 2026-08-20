-- OperiX AI Assistant persistence and guarded action commands.
--
-- AI is an orchestration layer only. These tables hold tenant-scoped
-- conversations, previews, tool audit records, and short-lived confirmation
-- state. Financial mutations continue through the existing domain RPCs.

begin;

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  title text,
  summary text,
  preferred_language text not null default 'en' check (preferred_language in ('en', 'sq', 'auto')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool', 'system')),
  content text not null default '',
  structured_content jsonb not null default '{}'::jsonb check (jsonb_typeof(structured_content) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.ai_tool_calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.ai_conversations(id) on delete set null,
  message_id uuid references public.ai_messages(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  provider_tool_call_id text,
  tool_name text not null,
  permission_class text not null check (permission_class in ('READ', 'PREPARE', 'MUTATE')),
  arguments jsonb not null default '{}'::jsonb check (jsonb_typeof(arguments) = 'object'),
  result_status text not null default 'success' check (result_status in ('success', 'denied', 'failed')),
  result_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(result_summary) = 'object'),
  resulting_resource_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_pending_actions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.ai_conversations(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  action_type text not null check (action_type in ('create_invoice', 'create_expense', 'send_reminder')),
  parameters jsonb not null default '{}'::jsonb check (jsonb_typeof(parameters) = 'object'),
  preview jsonb not null default '{}'::jsonb check (jsonb_typeof(preview) = 'object'),
  status text not null default 'pending' check (status in ('pending', 'processing', 'confirmed', 'failed', 'expired', 'cancelled')),
  idempotency_key uuid not null default gen_random_uuid(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  confirmed_at timestamptz,
  result_resource_id uuid,
  result_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(result_payload) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.ai_conversations(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  model text not null,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  request_ms integer,
  result_status text not null default 'success' check (result_status in ('success', 'failed', 'rate_limited', 'timeout')),
  created_at timestamptz not null default now()
);

create table if not exists public.ai_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  ai_enabled boolean not null default true,
  preferred_language text not null default 'auto' check (preferred_language in ('auto', 'en', 'sq')),
  daily_briefing_enabled boolean not null default true,
  history_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, company_id)
);

create index if not exists ai_conversations_user_company_idx
  on public.ai_conversations(user_id, company_id, updated_at desc);
create index if not exists ai_messages_conversation_created_idx
  on public.ai_messages(conversation_id, created_at desc);
create index if not exists ai_tool_calls_conversation_created_idx
  on public.ai_tool_calls(conversation_id, created_at desc);
create index if not exists ai_pending_actions_user_status_idx
  on public.ai_pending_actions(user_id, company_id, status, expires_at);
create unique index if not exists ai_pending_actions_company_idempotency_idx
  on public.ai_pending_actions(company_id, idempotency_key);
create index if not exists ai_usage_user_company_created_idx
  on public.ai_usage(user_id, company_id, created_at desc);

-- Expenses did not originally have an idempotency uniqueness boundary. The AI
-- confirmation path uses the same key on retries so a network retry cannot
-- create a second expense.
alter table public.expenses
  add column if not exists idempotency_key uuid;

create unique index if not exists expenses_company_idempotency_unique
  on public.expenses(company_id, idempotency_key)
  where idempotency_key is not null;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'ai_conversations', 'ai_messages', 'ai_tool_calls',
    'ai_pending_actions', 'ai_usage', 'ai_settings'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I_select on public.%I', table_name, table_name);
    execute format('drop policy if exists %I_insert on public.%I', table_name, table_name);
    execute format('drop policy if exists %I_update on public.%I', table_name, table_name);
    execute format('drop policy if exists %I_delete on public.%I', table_name, table_name);

    execute format(
      'create policy %I_select on public.%I for select to authenticated using ((select auth.uid()) = user_id and public.can_access_company(company_id))',
      table_name || '_select', table_name
    );
    execute format(
      'create policy %I_insert on public.%I for insert to authenticated with check ((select auth.uid()) = user_id and public.can_access_company(company_id))',
      table_name || '_insert', table_name
    );
    execute format(
      'create policy %I_update on public.%I for update to authenticated using ((select auth.uid()) = user_id and public.can_access_company(company_id)) with check ((select auth.uid()) = user_id and public.can_access_company(company_id))',
      table_name || '_update', table_name
    );
    execute format(
      'create policy %I_delete on public.%I for delete to authenticated using ((select auth.uid()) = user_id and public.can_access_company(company_id))',
      table_name || '_delete', table_name
    );
  end loop;
end;
$$;

-- A message/tool/action must belong to the same user-owned conversation. This
-- prevents a caller from pairing a valid conversation ID with another tenant's
-- message metadata even when the caller has a valid session.
drop policy if exists ai_messages_insert on public.ai_messages;
create policy ai_messages_insert on public.ai_messages
for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and public.can_access_company(company_id)
  and exists (
    select 1 from public.ai_conversations conversation
    where conversation.id = ai_messages.conversation_id
      and conversation.user_id = (select auth.uid())
      and conversation.company_id = ai_messages.company_id
  )
);

drop policy if exists ai_tool_calls_insert on public.ai_tool_calls;
create policy ai_tool_calls_insert on public.ai_tool_calls
for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and public.can_access_company(company_id)
  and (
    conversation_id is null
    or exists (
      select 1 from public.ai_conversations conversation
      where conversation.id = ai_tool_calls.conversation_id
        and conversation.user_id = (select auth.uid())
        and conversation.company_id = ai_tool_calls.company_id
    )
  )
);

revoke all on public.ai_conversations, public.ai_messages, public.ai_tool_calls,
  public.ai_pending_actions, public.ai_usage, public.ai_settings from anon;
grant select, insert, update, delete on public.ai_conversations, public.ai_messages,
  public.ai_tool_calls, public.ai_pending_actions, public.ai_usage, public.ai_settings
  to authenticated;

-- Atomically claim a pending action before any financial or communication
-- workflow runs. A second confirmation receives an explicit replay error.
create or replace function public.claim_ai_pending_action(p_action_id uuid)
returns public.ai_pending_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  action_row public.ai_pending_actions;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into action_row
  from public.ai_pending_actions
  where id = p_action_id
    and user_id = (select auth.uid())
    and public.can_access_company(company_id)
  for update;

  if not found then
    raise exception 'AI confirmation action was not found' using errcode = 'P0002';
  end if;
  if action_row.status <> 'pending' then
    raise exception 'AI confirmation action has already been used' using errcode = '55000';
  end if;
  if action_row.expires_at <= clock_timestamp() then
    update public.ai_pending_actions
    set status = 'expired'
    where id = action_row.id;
    raise exception 'AI confirmation action has expired' using errcode = '57014';
  end if;

  update public.ai_pending_actions
  set status = 'processing'
  where id = action_row.id;

  action_row.status := 'processing';
  return action_row;
end;
$$;

revoke all on function public.claim_ai_pending_action(uuid) from public, anon;
grant execute on function public.claim_ai_pending_action(uuid) to authenticated;

-- Atomic expense creation wrapper. It delegates the accounting entry to the
-- existing post_expense command and keeps the AI retry boundary idempotent.
create or replace function public.create_expense_with_posting(
  p_expense jsonb,
  p_idempotency_key uuid
)
returns public.expenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  company_id_value uuid := nullif(p_expense ->> 'company_id', '')::uuid;
  expense_row public.expenses;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if company_id_value is null or not public.can_access_company(company_id_value) then
    raise exception 'The expense company is not available to this user' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'Expense idempotency key is required' using errcode = '23514';
  end if;
  if not private.has_company_permission(company_id_value, 'expense.post')
     or not private.has_company_permission(company_id_value, 'journal.post') then
    raise exception 'Insufficient permission to post expenses' using errcode = '42501';
  end if;
  if coalesce((p_expense ->> 'amount')::numeric, 0) <= 0 then
    raise exception 'Expense amount must be greater than zero' using errcode = '23514';
  end if;

  select * into expense_row
  from public.expenses
  where company_id = company_id_value
    and idempotency_key = p_idempotency_key
  for update;
  if found then
    return expense_row;
  end if;

  insert into public.expenses (
    user_id, company_id, vendor_name, category, description, amount,
    currency, date, receipt_url, idempotency_key, accounting_state
  ) values (
    actor_id,
    company_id_value,
    nullif(trim(p_expense ->> 'vendor_name'), ''),
    coalesce(nullif(trim(p_expense ->> 'category'), ''), 'Other'),
    nullif(trim(p_expense ->> 'description'), ''),
    round((p_expense ->> 'amount')::numeric, 4),
    upper(coalesce(nullif(trim(p_expense ->> 'currency'), ''), 'EUR')),
    coalesce(nullif(p_expense ->> 'date', '')::date, current_date),
    nullif(trim(p_expense ->> 'receipt_url'), ''),
    p_idempotency_key,
    'ready_for_posting'
  ) returning * into expense_row;

  return public.post_expense(
    expense_row.id,
    p_idempotency_key,
    'OperiX AI confirmed expense'
  );
end;
$$;

revoke all on function public.create_expense_with_posting(jsonb, uuid) from public, anon;
grant execute on function public.create_expense_with_posting(jsonb, uuid) to authenticated;

commit;
