create extension if not exists pgcrypto;

create table if not exists recurring_invoice_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  company_id uuid,
  client_id uuid references clients(id) on delete cascade,
  name text not null,
  frequency text not null default 'monthly',
  next_issue_date date not null,
  due_days integer not null default 30,
  amount numeric not null default 0,
  tax_rate numeric not null default 0,
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists invoice_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  company_id uuid,
  invoice_id uuid references invoices(id) on delete cascade,
  reminder_type text not null default 'upcoming',
  scheduled_for date not null,
  sent_at timestamptz,
  status text not null default 'scheduled',
  created_at timestamptz not null default now()
);

create table if not exists customer_portal_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  company_id uuid,
  client_id uuid references clients(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  expires_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists payment_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  company_id uuid,
  invoice_id uuid references invoices(id) on delete cascade,
  provider text not null default 'stripe',
  external_id text,
  url text,
  amount numeric not null default 0,
  currency text not null default 'eur',
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists tax_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  company_id uuid,
  period_start date not null,
  period_end date not null,
  country text not null default 'AL',
  vat_rate numeric not null default 20,
  output_vat numeric not null default 0,
  input_vat numeric not null default 0,
  status text not null default 'draft',
  notes text,
  created_at timestamptz not null default now()
);

alter table recurring_invoice_templates enable row level security;
alter table invoice_reminders enable row level security;
alter table customer_portal_tokens enable row level security;
alter table payment_links enable row level security;
alter table tax_reports enable row level security;

do $$ declare t text; begin
  foreach t in array array['recurring_invoice_templates','invoice_reminders','customer_portal_tokens','payment_links','tax_reports'] loop
    execute format('drop policy if exists "owner access %s" on %I', t, t);
    execute format('create policy "owner access %s" on %I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t, t);
  end loop;
end $$;

create index if not exists recurring_invoice_templates_company_idx on recurring_invoice_templates(company_id);
create index if not exists invoice_reminders_invoice_idx on invoice_reminders(invoice_id);
create index if not exists customer_portal_tokens_token_idx on customer_portal_tokens(token);
create index if not exists payment_links_invoice_idx on payment_links(invoice_id);
create index if not exists tax_reports_company_period_idx on tax_reports(company_id, period_start, period_end);

-- Public, token-scoped customer portal read model. The function exposes only the
-- customer and that customer's non-draft invoices; no authenticated session is
-- required, which keeps shared portal links useful for recipients.
create or replace function public.get_customer_portal_data(portal_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  portal customer_portal_tokens%rowtype;
  result jsonb;
begin
  select * into portal
  from customer_portal_tokens
  where token = portal_token
    and (expires_at is null or expires_at > now());
  if not found then
    return jsonb_build_object('error', 'This customer portal link is invalid or expired.');
  end if;

  update customer_portal_tokens set last_used_at = now() where id = portal.id;

  select jsonb_build_object(
    'company', (select to_jsonb(c) - 'id' from companies c where c.id = portal.company_id),
    'client', (select to_jsonb(c) - 'id' from clients c where c.id = portal.client_id),
    'invoices', coalesce((select jsonb_agg(jsonb_build_object(
      'id', i.id,
      'invoice_number', i.invoice_number,
      'issue_date', i.issue_date,
      'due_date', i.due_date,
      'status', i.status,
      'total_amount', i.total_amount,
      'tax_amount', i.tax_amount,
      'amount_received', coalesce(i.amount_received, 0),
      'notes', i.notes,
      'items', coalesce((select jsonb_agg(to_jsonb(ii) - 'id' - 'invoice_id') from invoice_items ii where ii.invoice_id = i.id), '[]'::jsonb)
    ) order by i.issue_date desc) from invoices i where i.client_id = portal.client_id and i.company_id = portal.company_id and i.type is distinct from 'offer' and i.status::text <> 'cancelled'), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

grant execute on function public.get_customer_portal_data(text) to anon, authenticated;
