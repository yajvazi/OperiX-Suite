begin;

-- Compatibility alias for the already deployed auxiliary helper functions;
-- new source migrations use public.get_my_company_role directly.
create or replace function private.get_my_company_role(p_company_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.get_my_company_role(p_company_id);
$$;

revoke all on function private.get_my_company_role(uuid) from public, anon;
grant execute on function private.get_my_company_role(uuid) to authenticated, service_role;
commit;
