-- Keep customer editing on the same tenant/RBAC boundary as customer creation.
-- Booking Mobile and Booking Web can both call this command without relying on
-- the shared clients table exposing a broad update policy.
create or replace function public.booking_update_customer(
  p_company_id uuid,
  p_customer_id uuid,
  p_name text,
  p_email text default null,
  p_phone text default null,
  p_company text default null,
  p_notes text default null,
  p_address text default null
)
returns table (
  id uuid,
  company_id uuid,
  user_id uuid,
  name text,
  email text,
  phone text,
  company text,
  company_name text,
  address text,
  notes text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  name_value text := nullif(trim(p_name), '');
  email_value text := nullif(trim(p_email), '');
  phone_value text := nullif(trim(p_phone), '');
  company_value text := nullif(trim(p_company), '');
  notes_value text := nullif(trim(p_notes), '');
  address_value text := nullif(trim(p_address), '');
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_company_id is null
     or not public.can_access_company(p_company_id)
     or not private.has_company_permission(p_company_id, 'customer.manage') then
    raise exception 'You do not have permission to manage booking customers' using errcode = '42501';
  end if;
  if p_customer_id is null then
    raise exception 'Customer not found' using errcode = 'P0002';
  end if;
  if name_value is null or char_length(name_value) > 160 then
    raise exception 'Customer name must be between 1 and 160 characters' using errcode = '22023';
  end if;
  if email_value is not null and (
    char_length(email_value) > 320
    or email_value !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ) then
    raise exception 'Customer email is invalid' using errcode = '22023';
  end if;
  if phone_value is not null and char_length(phone_value) > 40 then
    raise exception 'Customer phone is too long' using errcode = '22023';
  end if;
  if company_value is not null and char_length(company_value) > 160 then
    raise exception 'Customer company is too long' using errcode = '22023';
  end if;
  if notes_value is not null and char_length(notes_value) > 2000 then
    raise exception 'Customer notes are too long' using errcode = '22023';
  end if;
  if address_value is not null and char_length(address_value) > 500 then
    raise exception 'Customer address is too long' using errcode = '22023';
  end if;

  return query
  update public.clients customer
  set name = name_value,
      email = email_value,
      phone = phone_value,
      company = company_value,
      company_name = company_value,
      address = address_value,
      notes = notes_value
  where customer.id = p_customer_id
    and customer.company_id = p_company_id
  returning customer.id, customer.company_id, customer.user_id, customer.name,
    customer.email, customer.phone, customer.company, customer.company_name,
    customer.address, customer.notes, customer.created_at;

  if not found then
    raise exception 'Customer not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.booking_update_customer(uuid, uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.booking_update_customer(uuid, uuid, text, text, text, text, text, text) to authenticated;

comment on function public.booking_update_customer(uuid, uuid, text, text, text, text, text, text) is 'Canonical tenant-scoped Booking customer edit command shared by web and mobile.';
