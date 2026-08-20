-- Repair the invoice API contract on databases where the original
-- walk-in-customer migration timestamp was already consumed by another
-- migration. The mobile invoice form uses this RPC for non-POS invoices.

create or replace function public.ensure_walk_in_customer(p_company_id uuid)
returns public.clients
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  walk_in_id uuid;
  walk_in_customer public.clients;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_company_id is null or not public.can_access_company(p_company_id) then
    raise exception 'You do not have access to this company' using errcode = '42501';
  end if;

  select client.id
    into walk_in_id
  from public.clients client
  where client.company_id = p_company_id
    and client.pos_walk_in_customer = true
  order by client.created_at
  limit 1;

  if walk_in_id is null then
    walk_in_id := private.ensure_pos_walk_in_customer(p_company_id);
  end if;

  select *
    into walk_in_customer
  from public.clients client
  where client.id = walk_in_id
    and client.company_id = p_company_id;

  if walk_in_customer.id is null then
    raise exception 'Walk-in customer could not be created' using errcode = '23514';
  end if;

  return walk_in_customer;
end;
$$;

revoke all on function public.ensure_walk_in_customer(uuid) from public, anon;
grant execute on function public.ensure_walk_in_customer(uuid) to authenticated;

comment on function public.ensure_walk_in_customer(uuid) is
  'Returns the company walk-in customer used by POS and non-POS sales documents.';

notify pgrst, 'reload schema';
