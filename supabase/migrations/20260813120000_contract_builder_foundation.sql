-- Contract builder foundation.
-- The legacy JSON fields remain the source of truth for old templates/contracts;
-- the new JSON columns allow the mobile builder to evolve without breaking them.

begin;

alter table public.contract_templates
  add column if not exists company_id uuid references public.companies(id) on delete set null,
  add column if not exists category text not null default 'custom',
  add column if not exists language text not null default 'en',
  add column if not exists tags text[] not null default '{}',
  add column if not exists numbering jsonb not null default '{"mode":"automatic","prefix":"CTR","year":true,"padding":4}'::jsonb,
  add column if not exists parties jsonb not null default '[]'::jsonb,
  add column if not exists blocks jsonb not null default '[]'::jsonb,
  add column if not exists settings jsonb not null default '{}'::jsonb,
  add column if not exists signers jsonb not null default '[]'::jsonb,
  add column if not exists appearance jsonb not null default '{}'::jsonb,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

update public.contract_templates template
set company_id = profile.active_company_id
from public.profiles profile
where template.company_id is null
  and profile.id = template.user_id
  and profile.active_company_id is not null;

alter table public.contracts
  add column if not exists template_id uuid references public.contract_templates(id) on delete set null,
  add column if not exists contract_number text,
  add column if not exists category text,
  add column if not exists language text not null default 'en',
  add column if not exists parties jsonb not null default '[]'::jsonb,
  add column if not exists variables jsonb not null default '{}'::jsonb,
  add column if not exists settings jsonb not null default '{}'::jsonb,
  add column if not exists financial_terms jsonb not null default '{}'::jsonb,
  add column if not exists signers jsonb not null default '[]'::jsonb,
  add column if not exists approval_status text not null default 'not_required',
  add column if not exists provider text,
  add column if not exists provider_envelope_id text,
  add column if not exists signed_document_path text,
  add column if not exists last_activity_at timestamptz;

-- The legacy migration pointed this column at auth.users. Contracts are
-- tenant-owned records, so keep the FK aligned with the active company model.
alter table public.contracts drop constraint if exists contracts_company_id_fkey;
alter table public.contracts
  add constraint contracts_company_id_fkey foreign key (company_id)
  references public.companies(id) on delete set null;

update public.contracts contract
set company_id = profile.active_company_id
from public.profiles profile
where contract.company_id is null
  and contract.user_id = profile.id
  and profile.active_company_id is not null;

create unique index if not exists contracts_company_number_unique
  on public.contracts(company_id, contract_number)
  where company_id is not null and contract_number is not null;
create index if not exists contract_templates_company_updated_idx on public.contract_templates(company_id, updated_at desc);
create index if not exists contracts_company_status_idx on public.contracts(company_id, status, updated_at desc);

create or replace function public.reserve_contract_number(
  p_company_id uuid,
  p_prefix text default 'CTR',
  p_year integer default extract(year from now())::integer,
  p_manual_number text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  next_number integer;
  result text;
begin
  if auth.uid() is null or not public.can_access_company(p_company_id) then
    raise exception 'not authorized';
  end if;
  if nullif(trim(p_manual_number), '') is not null then
    return trim(p_manual_number);
  end if;
  select coalesce(max((regexp_match(contract_number, '^' || regexp_replace(p_prefix, '[^A-Za-z0-9_-]', '', 'g') || '-' || p_year::text || '-([0-9]+)$'))[1]::integer), 0) + 1
    into next_number
  from public.contracts
  where company_id = p_company_id;
  result := regexp_replace(p_prefix, '[^A-Za-z0-9_-]', '', 'g') || '-' || p_year::text || '-' || lpad(next_number::text, 4, '0');
  return result;
end;
$$;

revoke all on function public.reserve_contract_number(uuid, text, integer, text) from public;
grant execute on function public.reserve_contract_number(uuid, text, integer, text) to authenticated;

create table if not exists public.contract_clauses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  name text not null,
  category text not null,
  language text not null default 'en',
  content text not null,
  variables jsonb not null default '[]'::jsonb,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contract_clauses_system_scope check (is_system = false or company_id is null)
);

create table if not exists public.contract_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade not null,
  contract_id uuid references public.contracts(id) on delete restrict not null,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  provider_event_id text,
  occurred_at timestamptz not null default now(),
  unique(provider_event_id)
);

create table if not exists public.contract_invoice_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade not null,
  contract_id uuid references public.contracts(id) on delete restrict not null,
  invoice_id uuid references public.invoices(id) on delete restrict not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(contract_id, invoice_id)
);

create table if not exists public.contract_attachments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade not null,
  contract_id uuid references public.contracts(id) on delete restrict,
  template_id uuid references public.contract_templates(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  byte_size bigint,
  created_at timestamptz not null default now(),
  constraint contract_attachment_parent check (contract_id is not null or template_id is not null)
);

create index if not exists contract_events_contract_idx on public.contract_events(contract_id, occurred_at desc);
create index if not exists contract_invoice_links_contract_idx on public.contract_invoice_links(contract_id);
create index if not exists contract_attachments_parent_idx on public.contract_attachments(company_id, contract_id, template_id);

insert into public.contract_clauses (name, category, language, content, variables, is_system)
select seed.name, seed.category, seed.language, seed.content, seed.variables::jsonb, true
from (values
  ('Payment terms', 'payment', 'en', 'The customer shall pay {{contract.value}} {{contract.currency}} according to the agreed payment schedule.', '["contract.value","contract.currency"]'),
  ('Confidentiality', 'confidentiality', 'en', 'Each party shall keep confidential information received from the other party and use it only for the purposes of this agreement.', '[]'),
  ('Termination', 'termination', 'en', 'Either party may terminate this agreement by giving the notice period stated in the contract settings.', '[]'),
  ('Kushtet e pagesës', 'payment', 'sq', 'Klienti do të paguajë {{contract.value}} {{contract.currency}} sipas planit të dakorduar të pagesës.', '["contract.value","contract.currency"]'),
  ('Konfidencialiteti', 'confidentiality', 'sq', 'Secila palë do ta mbajë konfidencial informacionin e marrë nga pala tjetër dhe do ta përdorë vetëm për qëllimet e kësaj marrëveshjeje.', '[]'),
  ('Përfundimi', 'termination', 'sq', 'Secila palë mund ta përfundojë këtë marrëveshje duke dhënë njoftimin e përcaktuar në cilësimet e kontratës.', '[]')
) as seed(name, category, language, content, variables)
where not exists (
  select 1 from public.contract_clauses existing
  where existing.name = seed.name and existing.language = seed.language and existing.is_system
);

alter table public.contract_templates enable row level security;
alter table public.contract_clauses enable row level security;
alter table public.contract_events enable row level security;
alter table public.contract_invoice_links enable row level security;
alter table public.contract_attachments enable row level security;

drop policy if exists "Users can view their own templates" on public.contract_templates;
drop policy if exists "Users can insert their own templates" on public.contract_templates;
drop policy if exists "Users can update their own templates" on public.contract_templates;
drop policy if exists "Users can delete their own templates" on public.contract_templates;

create policy contract_templates_select on public.contract_templates for select to authenticated
using ((select auth.uid()) = user_id or public.can_access_company(company_id));
create policy contract_templates_insert on public.contract_templates for insert to authenticated
with check ((select auth.uid()) = user_id and (company_id is null or public.can_access_company(company_id)));
create policy contract_templates_update on public.contract_templates for update to authenticated
using ((select auth.uid()) = user_id or public.can_access_company(company_id))
with check ((select auth.uid()) = user_id or public.can_access_company(company_id));
create policy contract_templates_delete on public.contract_templates for delete to authenticated
using ((select auth.uid()) = user_id or public.can_access_company(company_id));

create policy contract_clauses_select on public.contract_clauses for select to authenticated
using (is_system or public.can_access_company(company_id));
create policy contract_clauses_insert on public.contract_clauses for insert to authenticated
with check (not is_system and public.can_access_company(company_id) and created_by = (select auth.uid()));
create policy contract_clauses_update on public.contract_clauses for update to authenticated
using (not is_system and public.can_access_company(company_id) and created_by = (select auth.uid()))
with check (not is_system and public.can_access_company(company_id));
create policy contract_clauses_delete on public.contract_clauses for delete to authenticated
using (not is_system and public.can_access_company(company_id) and created_by = (select auth.uid()));

create policy contract_events_select on public.contract_events for select to authenticated
using (public.can_access_company(company_id));
create policy contract_events_insert on public.contract_events for insert to authenticated
with check (public.can_access_company(company_id) and actor_id = (select auth.uid()));

create policy contract_invoice_links_select on public.contract_invoice_links for select to authenticated
using (public.can_access_company(company_id));
create policy contract_invoice_links_insert on public.contract_invoice_links for insert to authenticated
with check (public.can_access_company(company_id) and created_by = (select auth.uid()));

create policy contract_attachments_select on public.contract_attachments for select to authenticated
using (public.can_access_company(company_id));
create policy contract_attachments_insert on public.contract_attachments for insert to authenticated
with check (public.can_access_company(company_id) and created_by = (select auth.uid()));
create policy contract_attachments_delete on public.contract_attachments for delete to authenticated
using (public.can_access_company(company_id) and created_by = (select auth.uid()));

grant select, insert, update, delete on public.contract_templates to authenticated;
grant select, insert, update, delete on public.contract_clauses to authenticated;
grant select, insert on public.contract_events to authenticated;
grant select, insert on public.contract_invoice_links to authenticated;
grant select, insert, delete on public.contract_attachments to authenticated;

commit;
