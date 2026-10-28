-- PostgREST versions differ in whether they expose the JWT role through the
-- legacy scalar setting or the claims JSON setting. Keep server-only RPCs
-- restricted to trusted roles while accepting both representations.
create or replace function private.operix_server_request()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
         in ('service_role', 'supabase_admin');
$$;

revoke all on function private.operix_server_request() from public;
grant execute on function private.operix_server_request() to authenticated, service_role;
