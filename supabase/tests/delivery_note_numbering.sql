\set ON_ERROR_STOP on

-- Regression test for the mobile delivery-note save path. The test is
-- transactional so it does not consume a customer sequence number.
begin;

do $$
declare
  v_company_id uuid;
  v_user_id uuid;
  v_number text;
begin
  select company.id, company.owner_id
  into v_company_id, v_user_id
  from public.companies company
  where company.owner_id is not null
    and exists (
      select 1
      from public.memberships membership
      where membership.company_id = company.id
        and membership.user_id = company.owner_id
        and coalesce(membership.status, 'active') = 'active'
    )
  order by company.id
  limit 1;

  if v_company_id is null or v_user_id is null then
    raise exception 'Delivery-note numbering fixture is missing an owner company';
  end if;

  perform set_config('request.jwt.claim.sub', v_user_id::text, true);
  v_number := public.reserve_invoice_number(v_company_id, 'delivery_note', date '2026-08-12');

  if v_number !~ '^FD-[0-9]{4}-[0-9]{1,18}$' then
    raise exception 'Delivery-note number has the wrong format: %', v_number;
  end if;
end
$$;

rollback;
