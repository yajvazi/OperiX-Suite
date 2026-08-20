\set ON_ERROR_STOP on

-- Transactional AI gateway/RLS checks. Run against a disposable or staging
-- database after the OperiX AI migration with psql variables for two unrelated
-- tenants and one user in tenant A:
-- psql -v tenant_a_id=... -v tenant_b_id=... -v user_a_id=... -f this-file
\if :{?tenant_a_id}
\else
\echo 'Missing tenant_a_id; refusing to run the AI security test.'
\quit 3
\endif
\if :{?tenant_b_id}
\else
\echo 'Missing tenant_b_id; refusing to run the AI security test.'
\quit 3
\endif
\if :{?user_a_id}
\else
\echo 'Missing user_a_id; refusing to run the AI security test.'
\quit 3
\endif

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'user_a_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  v_count bigint;
  v_action_id uuid;
begin
  select count(*) into v_count
  from public.ai_conversations
  where company_id = :'tenant_b_id'::uuid;
  if v_count <> 0 then raise exception 'AI conversation crossed tenant boundary'; end if;

  begin
    insert into public.ai_conversations(user_id, company_id, title)
    values (:'user_a_id'::uuid, :'tenant_b_id'::uuid, 'cross-tenant attempt');
    raise exception 'Cross-tenant AI conversation insert was allowed';
  exception when others then
    if sqlstate not in ('42501', '23503') then raise; end if;
  end;

  insert into public.ai_pending_actions(user_id, company_id, action_type, parameters, preview, expires_at)
  values (:'user_a_id'::uuid, :'tenant_a_id'::uuid, 'create_expense', '{}'::jsonb, '{}'::jsonb, now() - interval '1 minute')
  returning id into v_action_id;

  begin
    perform public.claim_ai_pending_action(v_action_id);
    raise exception 'Expired AI action was claimable';
  exception when others then
    if sqlstate not in ('57014', 'P0002', '42501') then raise; end if;
  end;

  insert into public.ai_pending_actions(user_id, company_id, action_type, parameters, preview)
  values (:'user_a_id'::uuid, :'tenant_a_id'::uuid, 'create_expense', '{}'::jsonb, '{}'::jsonb)
  returning id into v_action_id;
  perform public.claim_ai_pending_action(v_action_id);

  begin
    perform public.claim_ai_pending_action(v_action_id);
    raise exception 'AI action replay was claimable';
  exception when others then
    if sqlstate <> '55000' then raise; end if;
  end;
end
$$;

rollback;
select 'OperiX AI tenant isolation and confirmation replay tests passed' as result;
