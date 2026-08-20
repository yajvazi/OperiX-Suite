-- Use the customer-facing name "Citizen" for the company-scoped POS customer.
update public.clients
set name = 'Citizen'
where pos_walk_in_customer = true
  and name in ('POS Walk-in Customer', 'Walk-in customer', 'Walk-in Customer');

create or replace function private.ensure_pos_walk_in_customer(p_company_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer_id uuid;
begin
  select id into customer_id
  from public.clients
  where company_id = p_company_id and pos_walk_in_customer
  limit 1;
  if customer_id is null then
    insert into public.clients (user_id, company_id, name, pos_walk_in_customer, account_status, sales_blocked)
    values ((select auth.uid()), p_company_id, 'Citizen', true, 'active', false)
    returning id into customer_id;
  end if;
  return customer_id;
end
$$;

