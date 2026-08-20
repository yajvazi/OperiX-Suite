-- OperiX Control enforcement, organization switching support, and platform
-- boundary.

begin;

-- App and member access changes are never represented by deleting the row:
-- an explicit disabled row must continue to deny access in the shared
-- permission function.
drop policy if exists company_app_entitlements_manage on public.company_app_entitlements;
create policy company_app_entitlements_insert on public.company_app_entitlements for insert to authenticated with check (private.has_company_permission(company_id,'apps.manage'));
create policy company_app_entitlements_update on public.company_app_entitlements for update to authenticated using (private.has_company_permission(company_id,'apps.manage')) with check (private.has_company_permission(company_id,'apps.manage'));
drop policy if exists membership_app_access_manage on public.membership_app_access;
create policy membership_app_access_insert on public.membership_app_access for insert to authenticated with check (exists(select 1 from public.memberships membership where membership.id=membership_id and private.has_company_permission(membership.company_id,'apps.manage')));
create policy membership_app_access_update on public.membership_app_access for update to authenticated using (exists(select 1 from public.memberships membership where membership.id=membership_id and private.has_company_permission(membership.company_id,'apps.manage'))) with check (exists(select 1 from public.memberships membership where membership.id=membership_id and private.has_company_permission(membership.company_id,'apps.manage')));

create or replace function private.seed_membership_app_access()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(new.status,'active') <> 'revoked' then
    insert into public.membership_app_access(membership_id,app_key,enabled) select new.id,app.app_key,true from public.operix_apps app on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists memberships_seed_control_app_access on public.memberships;
create trigger memberships_seed_control_app_access after insert or update of status on public.memberships for each row execute function private.seed_membership_app_access();

create or replace function public.control_set_app_entitlement(p_company_id uuid,p_app_key text,p_enabled boolean)
returns public.company_app_entitlements language plpgsql security definer set search_path = '' as $$
declare result public.company_app_entitlements;
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'apps.manage') then raise exception 'Application management denied' using errcode='42501'; end if;
  if not exists(select 1 from public.operix_apps where app_key=p_app_key and available) then raise exception 'Application is not available' using errcode='22023'; end if;
  insert into public.company_app_entitlements(company_id,app_key,enabled,enabled_at,disabled_at,updated_by) values(p_company_id,p_app_key,p_enabled,case when p_enabled then now() else null end,case when p_enabled then null else now() end,(select auth.uid())) on conflict(company_id,app_key) do update set enabled=excluded.enabled,enabled_at=excluded.enabled_at,disabled_at=excluded.disabled_at,updated_at=now(),updated_by=(select auth.uid()) returning * into result;
  return result;
end;
$$;

create or replace function public.control_set_member_app_access(p_company_id uuid,p_membership_id uuid,p_app_key text,p_enabled boolean)
returns public.membership_app_access language plpgsql security definer set search_path = '' as $$
declare result public.membership_app_access;
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'apps.manage') then raise exception 'Application access management denied' using errcode='42501'; end if;
  if not exists(select 1 from public.memberships where id=p_membership_id and company_id=p_company_id) or not exists(select 1 from public.operix_apps where app_key=p_app_key and available) then raise exception 'Application access target is invalid' using errcode='22023'; end if;
  insert into public.membership_app_access(membership_id,app_key,enabled,granted_by) values(p_membership_id,p_app_key,p_enabled,(select auth.uid())) on conflict(membership_id,app_key) do update set enabled=excluded.enabled,granted_at=now(),granted_by=(select auth.uid()) returning * into result;
  return result;
end;
$$;

create or replace function public.control_set_group_app_access(p_company_id uuid,p_group_id uuid,p_app_key text,p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'teams.manage') then raise exception 'Group management denied' using errcode='42501'; end if;
  if not exists(select 1 from public.control_groups where id=p_group_id and company_id=p_company_id) then raise exception 'Group was not found' using errcode='22023'; end if;
  insert into public.control_group_app_access(group_id,app_key,enabled,created_by) values(p_group_id,p_app_key,p_enabled,(select auth.uid())) on conflict(group_id,app_key) do update set enabled=excluded.enabled,created_by=(select auth.uid());
  insert into public.membership_app_access(membership_id,app_key,enabled,granted_by)
  select member.membership_id,p_app_key,p_enabled,(select auth.uid()) from public.control_group_members member where member.group_id=p_group_id
  on conflict(membership_id,app_key) do update set enabled=excluded.enabled,granted_at=now(),granted_by=(select auth.uid());
end;
$$;

create or replace function public.control_create_company_invitation(p_company_id uuid,p_email text,p_role_code text)
returns table(id uuid,email text,role_code text,expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare invitation jsonb; domain_name text:=lower(split_part(trim(p_email),'@',2)); policy public.control_security_policies;
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'users.manage') then raise exception 'You do not have permission to invite users to this company' using errcode='42501'; end if;
  select * into policy from public.control_security_policies where company_id=p_company_id;
  if policy.invitation_policy='allowed_domains' and (cardinality(policy.allowed_email_domains)=0 or not(domain_name=any(policy.allowed_email_domains))) then raise exception 'This email domain is not allowed for organization invitations' using errcode='42501'; end if;
  invitation:=public.create_company_invitation(p_company_id,p_email,p_role_code);
  return query select (invitation->>'id')::uuid,invitation->>'email',invitation->>'role_code',(invitation->>'expires_at')::timestamptz;
end;
$$;

create or replace function public.control_is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.control_platform_admins admin where admin.user_id=(select auth.uid()) and admin.revoked_at is null);
$$;

create or replace function public.control_list_platform_organizations()
returns table(id uuid,organization text,owner_id uuid,plan text,member_count bigint,enabled_apps bigint,status text,created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.control_is_platform_admin() then raise exception 'Platform administration denied' using errcode='42501'; end if;
  return query select company.id,coalesce(company.company_name,company.name),(company.owner_id),(select snapshot.plan_name from public.control_billing_snapshots snapshot where snapshot.company_id=company.id),(select count(*) from public.memberships membership where membership.company_id=company.id and coalesce(membership.status,'active')<>'revoked'),(select count(*) from public.company_app_entitlements entitlement where entitlement.company_id=company.id and entitlement.enabled),case when company.archived_at is null then 'active' else 'archived' end,company.created_at from public.companies company order by company.created_at desc;
end;
$$;

-- New tables are RPC-backed. These policies additionally protect direct
-- reads if a future client requests a table explicitly.
do $$
declare table_name text;
begin
  foreach table_name in array array['control_security_policies','control_company_domains','control_role_templates','control_data_retention_policies','control_notification_events','control_notification_reads','control_api_keys','control_webhook_endpoints','control_webhook_deliveries','control_billing_snapshots','control_platform_admins'] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('revoke all on table public.%I from anon,authenticated',table_name);
  end loop;
end;
$$;

grant select on public.control_security_policies,public.control_company_domains,public.control_role_templates,public.control_data_retention_policies,public.control_notification_events,public.control_api_keys,public.control_webhook_endpoints,public.control_webhook_deliveries,public.control_billing_snapshots to authenticated;
grant select,insert,update,delete on public.control_notification_reads to authenticated;

drop policy if exists control_security_policy_read on public.control_security_policies;
create policy control_security_policy_read on public.control_security_policies for select to authenticated using (private.has_company_permission(company_id,'security.read'));
drop policy if exists control_domain_read on public.control_company_domains;
create policy control_domain_read on public.control_company_domains for select to authenticated using (private.has_company_permission(company_id,'organization.read'));
drop policy if exists control_role_template_read on public.control_role_templates;
create policy control_role_template_read on public.control_role_templates for select to authenticated using (private.has_company_permission(company_id,'roles.read'));
drop policy if exists control_retention_read on public.control_data_retention_policies;
create policy control_retention_read on public.control_data_retention_policies for select to authenticated using (private.has_company_permission(company_id,'data.read'));
drop policy if exists control_notification_event_read on public.control_notification_events;
create policy control_notification_event_read on public.control_notification_events for select to authenticated using (private.has_company_permission(company_id,'security.read'));
drop policy if exists control_api_key_read on public.control_api_keys;
create policy control_api_key_read on public.control_api_keys for select to authenticated using (private.has_company_permission(company_id,'api.read'));
drop policy if exists control_webhook_read on public.control_webhook_endpoints;
create policy control_webhook_read on public.control_webhook_endpoints for select to authenticated using (private.has_company_permission(company_id,'api.read'));
drop policy if exists control_webhook_delivery_read on public.control_webhook_deliveries;
create policy control_webhook_delivery_read on public.control_webhook_deliveries for select to authenticated using (private.has_company_permission(company_id,'api.read'));
drop policy if exists control_billing_read on public.control_billing_snapshots;
create policy control_billing_read on public.control_billing_snapshots for select to authenticated using (private.has_company_permission(company_id,'billing.read'));
drop policy if exists control_notification_read_own on public.control_notification_reads;
create policy control_notification_read_own on public.control_notification_reads for all to authenticated using(user_id=(select auth.uid()) and private.is_company_member(company_id)) with check(user_id=(select auth.uid()) and private.is_company_member(company_id));

grant execute on function public.control_usage_summary(uuid),public.control_storage_summary(uuid),public.control_billing_overview(uuid),public.control_list_integrations(uuid),public.control_search(uuid,text),public.control_create_api_key(uuid,text,text[],text,timestamptz),public.control_rotate_api_key(uuid,uuid),public.control_revoke_api_key(uuid,uuid),public.control_list_api_keys(uuid),public.control_create_webhook(uuid,text,text,text[],text),public.control_list_webhooks(uuid),public.control_set_webhook_status(uuid,uuid,text),public.control_delete_webhook(uuid,uuid),public.control_test_webhook(uuid,uuid),public.control_refresh_webhook_delivery(uuid,uuid),public.control_list_webhook_deliveries(uuid,uuid),public.control_set_app_entitlement(uuid,text,boolean),public.control_set_member_app_access(uuid,uuid,text,boolean),public.control_set_group_app_access(uuid,uuid,text,boolean),public.control_is_platform_admin(),public.control_list_platform_organizations() to authenticated;
grant execute on function public.control_upsert_billing_snapshot(uuid,text,text,text,text,text,text,timestamptz,timestamptz,integer,bigint,text) to service_role;

commit;
