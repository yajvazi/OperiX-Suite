-- Retire the authenticated account without deleting company accounting history.
-- The account is anonymized, disabled, and removed from all workspaces.

create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  successor_id uuid;
  deleted_email text;
  owned_company record;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- Keep company history available. If another active member exists, transfer
  -- ownership; otherwise leave the company ownerless rather than deleting its
  -- invoices, accounting entries, and audit history.
  perform set_config('app.company_owner_transfer', 'authorized', true);
  for owned_company in
    select id
    from public.companies
    where owner_id = current_user_id
  loop
    select membership.user_id
    into successor_id
    from public.memberships membership
    where membership.company_id = owned_company.id
      and membership.user_id <> current_user_id
      and coalesce(membership.status, 'active') = 'active'
    order by membership.created_at, membership.id
    limit 1;

    update public.companies
    set owner_id = successor_id,
        updated_at = clock_timestamp(),
        updated_by = successor_id
    where id = owned_company.id;
  end loop;
  perform set_config('app.company_owner_transfer', '', true);

  delete from public.memberships where user_id = current_user_id;
  delete from public.profiles where id = current_user_id;
  delete from auth.sessions where user_id = current_user_id;

  deleted_email := 'deleted+' || current_user_id::text || '@invalid.operix.local';
  update auth.users
  set email = deleted_email,
      phone = null,
      encrypted_password = null,
      raw_user_meta_data = '{}'::jsonb,
      raw_app_meta_data = '{}'::jsonb,
      confirmation_token = '',
      recovery_token = '',
      email_change = '',
      phone_change = '',
      banned_until = 'infinity'::timestamptz,
      deleted_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = current_user_id;

  return jsonb_build_object('deleted', true);
end
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
