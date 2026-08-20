-- EFS-readiness hardening for tenant identity and shared receipt access.
-- This migration does not enable TAK production traffic or store secrets.

-- A profile's primary company is a server-owned relationship. Company
-- switching uses active_company_id through set_active_company(); it must not
-- be possible to turn company_id into a client-controlled authorization grant.
create or replace function private.prevent_profile_company_hijack()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.company_id is distinct from old.company_id
     and (select auth.uid()) is not null
     and coalesce(current_setting('app.company_link_workflow', true), '') <> 'authorized' then
    raise exception 'Use the authorized company-membership workflow'
      using errcode = '42501';
  end if;
  return new;
end
$$;

drop trigger if exists profiles_company_guard on public.profiles;
create trigger profiles_company_guard
before update of company_id on public.profiles
for each row execute function private.prevent_profile_company_hijack();

-- Keep the existing invitation behavior, but make its two profile writes
-- explicit and auditable at the database boundary.
create or replace function public.join_company(token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id uuid;
  target_company_name text;
  new_employee_id uuid;
  user_email text;
  user_name text;
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Authentication required');
  end if;

  select company.id, coalesce(company.name, company.company_name)
    into target_company_id, target_company_name
  from public.companies company
  where company.invite_token = token;

  if target_company_id is null then
    return jsonb_build_object('success', false, 'error', 'Invalid or expired invitation token');
  end if;

  if exists (
    select 1 from public.memberships membership
    where membership.user_id = current_user_id
      and membership.company_id = target_company_id
  ) then
    return jsonb_build_object('success', false, 'error', 'You are already a member of this team');
  end if;

  select coalesce(profile.email, ''), coalesce(profile.first_name, profile.company_name, 'User')
    into user_email, user_name
  from public.profiles profile
  where profile.id = current_user_id;

  insert into public.employees (
    company_id, user_id, first_name, last_name, email, role, status
  ) values (
    target_company_id, current_user_id, coalesce(user_name, 'New'), 'Employee',
    user_email, 'employee', 'pending'
  ) returning id into new_employee_id;

  insert into public.memberships (company_id, user_id, role, status)
  values (target_company_id, current_user_id, 'employee', 'pending');

  perform set_config('app.company_link_workflow', 'authorized', true);
  perform set_config('app.active_company_switch', 'authorized', true);
  update public.profiles
  set company_id = target_company_id,
      active_company_id = target_company_id
  where id = current_user_id
    and company_id is null;

  return jsonb_build_object(
    'success', true,
    'company_id', target_company_id,
    'company_name', target_company_name,
    'employee_id', new_employee_id,
    'message', 'Your request to join ' || target_company_name || ' has been sent!'
  );
exception when others then
  return jsonb_build_object('success', false, 'error', sqlerrm);
end
$$;

revoke all on function public.join_company(text) from public;
grant execute on function public.join_company(text) to authenticated;

-- Shared links created from a QR code are invoice-scoped. Existing customer
-- portal links remain supported, but new customer-wide links must have an
-- explicit expiry and valid company/customer ownership.
alter table public.customer_portal_tokens
  add column if not exists invoice_id uuid references public.invoices(id) on delete cascade;

create index if not exists customer_portal_tokens_invoice_idx
  on public.customer_portal_tokens (invoice_id)
  where invoice_id is not null;

create or replace function private.validate_customer_portal_token()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.company_id is null or new.client_id is null then
    raise exception 'A portal link must identify a company and customer'
      using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.clients client
    where client.id = new.client_id and client.company_id = new.company_id
  ) then
    raise exception 'Portal customer does not belong to the selected company'
      using errcode = '23514';
  end if;

  if new.invoice_id is not null and not exists (
    select 1 from public.invoices invoice_row
    where invoice_row.id = new.invoice_id
      and invoice_row.company_id = new.company_id
      and invoice_row.client_id = new.client_id
      and invoice_row.status::text <> 'draft'
  ) then
    raise exception 'Portal invoice does not belong to the selected customer'
      using errcode = '23514';
  end if;

  if new.invoice_id is null and new.expires_at is null then
    raise exception 'Customer-wide portal links require an expiry date'
      using errcode = '23514';
  end if;

  if new.expires_at is not null and new.expires_at <= clock_timestamp() then
    raise exception 'Portal link expiry must be in the future'
      using errcode = '23514';
  end if;

  if (select auth.uid()) is not null
     and coalesce(current_setting('app.portal_link_workflow', true), '') <> 'authorized'
     and not public.can_access_company(new.company_id) then
    raise exception 'Insufficient permission for this company portal'
      using errcode = '42501';
  end if;
  return new;
end
$$;

drop trigger if exists customer_portal_token_scope_guard on public.customer_portal_tokens;
create trigger customer_portal_token_scope_guard
before insert or update on public.customer_portal_tokens
for each row execute function private.validate_customer_portal_token();

-- QR resolution creates a long-lived, opaque, invoice-scoped portal token.
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
  if not found then
    return jsonb_build_object('error', 'Invoice not found.');
  end if;

  if auth.uid() is not null and invoice_row.user_id = auth.uid() then
    return jsonb_build_object('destination', 'owner', 'url', '/invoices/preview/' || invoice_row.invoice_number);
  end if;

  select token into portal_token
  from customer_portal_tokens
  where invoice_id = invoice_row.id
    and (expires_at is null or expires_at > now())
  order by created_at desc
  limit 1;

  if portal_token is null then
    perform set_config('app.portal_link_workflow', 'authorized', true);
    insert into customer_portal_tokens(user_id, company_id, client_id, invoice_id)
    values(invoice_row.user_id, invoice_row.company_id, invoice_row.client_id, invoice_row.id)
    returning token into portal_token;
  end if;

  return jsonb_build_object(
    'destination', 'portal',
    'url', '/portal/' || portal_token || '/invoice/' || invoice_row.id
  );
end
$$;

grant execute on function public.resolve_invoice_qr(text) to anon, authenticated;

-- Public portal output is an allowlist, never a serialized company/client row.
-- Invoice-scoped QR tokens return only their one invoice; customer-wide links
-- return published invoices only.
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
    'company', (
      select jsonb_build_object(
        'company_name', company.company_name,
        'name', coalesce(company.name, company.company_name),
        'email', company.email,
        'phone', company.phone,
        'address', company.address,
        'city', company.city,
        'country', company.country,
        'website', company.website,
        'logo_url', company.logo_url,
        'signature_url', company.signature_url,
        'stamp_url', company.stamp_url,
        'tax_id', company.tax_id,
        'bank_name', company.bank_name,
        'bank_iban', company.bank_iban
      ) from companies company where company.id = portal.company_id
    ),
    'client', (
      select jsonb_build_object(
        'id', client.id,
        'name', client.name,
        'email', client.email,
        'phone', client.phone,
        'address', client.address,
        'city', client.city,
        'country', client.country,
        'tax_id', client.tax_id
      ) from clients client where client.id = portal.client_id
    ),
    'invoices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', invoice_row.id,
        'invoice_number', invoice_row.invoice_number,
        'issue_date', invoice_row.issue_date,
        'due_date', invoice_row.due_date,
        'status', invoice_row.status,
        'total_amount', invoice_row.total_amount,
        'tax_amount', invoice_row.tax_amount,
        'amount_received', coalesce(invoice_row.amount_received, 0),
        'notes', invoice_row.notes,
        'buyer_signature_url', invoice_row.buyer_signature_url,
        'customer_signature_requested', invoice_row.customer_signature_requested,
        'customer_signature_status', invoice_row.customer_signature_status,
        'customer_signature_name', invoice_row.customer_signature_name,
        'customer_signed_at', invoice_row.customer_signed_at,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', item.id,
            'description', item.description,
            'quantity', item.quantity,
            'unit_price', item.unit_price,
            'amount', item.amount,
            'tax_rate', item.tax_rate,
            'discount', item.discount,
            'unit', item.unit,
            'sku', item.sku
          ) order by item.id)
          from invoice_items item where item.invoice_id = invoice_row.id
        ), '[]'::jsonb)
      ) order by invoice_row.issue_date desc)
      from invoices invoice_row
      where invoice_row.company_id = portal.company_id
        and invoice_row.client_id = portal.client_id
        and invoice_row.type is distinct from 'offer'
        and invoice_row.status::text not in ('cancelled', 'draft')
        and (portal.invoice_id is null or invoice_row.id = portal.invoice_id)
    ), '[]'::jsonb)
  ) into result;
  return result;
end
$$;

grant execute on function public.get_customer_portal_data(text) to anon, authenticated;
