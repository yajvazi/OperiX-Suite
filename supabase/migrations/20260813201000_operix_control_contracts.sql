-- OperiX Control RPC contracts and safe projections.

begin;

-- Keep new governance changes in the existing append-only audit stream.
do $$
declare table_name text;
begin
  foreach table_name in array array['control_security_policies','control_company_domains','control_role_templates','control_data_retention_policies','control_notification_events','control_api_keys','control_webhook_endpoints','control_webhook_deliveries','control_billing_snapshots'] loop
    execute format('drop trigger if exists %I_audit on public.%I', table_name, table_name);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function private.control_audit_table_change()', table_name, table_name);
  end loop;
end $$;

create or replace function private.control_notify_audit_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare category_name text := case when new.entity_type in ('control_security_policies','control_platform_admins') or new.action ilike '%security%' then 'security' when new.entity_type like '%billing%' then 'billing' when new.entity_type like '%integration%' or new.entity_type like '%webhook%' then 'integrations' else 'administration' end;
begin
  if new.company_id is not null and new.entity_type not in ('control_notification_events','control_notification_reads') then
    insert into public.control_notification_events(company_id,category,severity,title,body,source_application,entity_type,entity_id)
    values(new.company_id,category_name,case when new.action in ('delete','revoke') then 'warning' else 'info' end,initcap(replace(new.action,'_',' ')) || ' · ' || initcap(replace(new.entity_type,'_',' ')),'A privileged change was recorded in OperiX Control.',case when new.entity_type like 'control_%' then 'control' else 'shared' end,new.entity_type,new.entity_id);
  end if;
  return new;
end;
$$;

drop trigger if exists audit_events_control_notifications on public.audit_events;
create trigger audit_events_control_notifications after insert on public.audit_events for each row execute function private.control_notify_audit_event();

drop function if exists public.control_list_audit_events(uuid, integer);
create or replace function public.control_list_audit_events(p_company_id uuid, p_limit integer default 200)
returns table(id uuid,action text,entity_type text,entity_id uuid,entity_key text,actor_user_id uuid,occurred_at timestamptz,has_changes boolean,application text)
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'audit.read') then raise exception 'You do not have permission to view this audit log' using errcode='42501'; end if;
  return query
  select event.id,event.action,event.entity_type,event.entity_id,event.entity_key,event.actor_user_id,event.occurred_at,(event.previous_values is not null or event.new_values is not null),
    case when event.entity_type in ('invoices','commercial_documents','invoice_items') or event.entity_type like '%invoice%' then 'invoice'
      when event.entity_type in ('employees','hr_notifications') or event.entity_type like 'hr_%' or event.entity_type like 'payroll_%' then 'hr'
      when event.entity_type in ('bookings','booking_audit_log') or event.entity_type like 'booking_%' then 'booking'
      when event.entity_type like 'desk_%' or event.entity_type like 'workspace_%' then 'desk'
      when event.entity_type like 'support_%' then 'support' when event.entity_type like 'crm_%' then 'crm' else 'control' end
  from public.audit_events event where event.company_id=p_company_id order by event.occurred_at desc limit greatest(1,least(coalesce(p_limit,200),500));
end;
$$;
revoke all on function public.control_list_audit_events(uuid,integer) from public,anon;
grant execute on function public.control_list_audit_events(uuid,integer) to authenticated;

create or replace function public.control_list_notifications(p_company_id uuid,p_limit integer default 50)
returns table(id uuid,category text,severity text,title text,body text,href text,source_application text,created_at timestamptz,read_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'security.read') then raise exception 'Notification access denied' using errcode='42501'; end if;
  return query select event.id,event.category,event.severity,event.title,event.body,event.href,event.source_application,event.created_at,reads.read_at
  from public.control_notification_events event left join public.control_notification_reads reads on reads.event_id=event.id and reads.user_id=(select auth.uid())
  where event.company_id=p_company_id order by event.created_at desc limit greatest(1,least(coalesce(p_limit,50),200));
end;
$$;

create or replace function public.control_mark_notification_read(p_company_id uuid,p_event_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'security.read') then raise exception 'Notification access denied' using errcode='42501'; end if;
  insert into public.control_notification_reads(event_id,company_id,user_id)
  select event.id,event.company_id,(select auth.uid()) from public.control_notification_events event where event.id=p_event_id and event.company_id=p_company_id
  on conflict(event_id,user_id) do update set read_at=now();
end;
$$;

create or replace function public.control_mark_all_notifications_read(p_company_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'security.read') then raise exception 'Notification access denied' using errcode='42501'; end if;
  insert into public.control_notification_reads(event_id,company_id,user_id)
  select event.id,event.company_id,(select auth.uid()) from public.control_notification_events event where event.company_id=p_company_id
  on conflict(event_id,user_id) do update set read_at=now();
end;
$$;

create or replace function public.control_list_groups(p_company_id uuid)
returns table(id uuid,name text,description text,member_count bigint,app_count bigint,created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'teams.read') then raise exception 'Group access denied' using errcode='42501'; end if;
  return query select group_row.id,group_row.name,group_row.description,(select count(*) from public.control_group_members member where member.group_id=group_row.id),(select count(*) from public.control_group_app_access access where access.group_id=group_row.id and access.enabled),group_row.created_at
  from public.control_groups group_row where group_row.company_id=p_company_id order by group_row.name;
end;
$$;

create or replace function public.control_create_group(p_company_id uuid,p_name text,p_description text default null)
returns public.control_groups language plpgsql security definer set search_path = '' as $$
declare result public.control_groups;
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'teams.manage') then raise exception 'Group management denied' using errcode='42501'; end if;
  insert into public.control_groups(company_id,name,description,created_by) values(p_company_id,trim(p_name),nullif(trim(p_description),''),(select auth.uid())) returning * into result;
  return result;
end;
$$;

create or replace function public.control_delete_group(p_company_id uuid,p_group_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'teams.manage') then raise exception 'Group management denied' using errcode='42501'; end if;
  delete from public.control_groups where id=p_group_id and company_id=p_company_id;
end;
$$;

create or replace function public.control_set_group_member(p_company_id uuid,p_group_id uuid,p_membership_id uuid,p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'teams.manage') then raise exception 'Group management denied' using errcode='42501'; end if;
  if not exists(select 1 from public.control_groups where id=p_group_id and company_id=p_company_id) or not exists(select 1 from public.memberships where id=p_membership_id and company_id=p_company_id) then raise exception 'Group target is invalid' using errcode='22023'; end if;
  if p_enabled then insert into public.control_group_members(group_id,membership_id) values(p_group_id,p_membership_id) on conflict do nothing; else delete from public.control_group_members where group_id=p_group_id and membership_id=p_membership_id; end if;
end;
$$;

create or replace function public.control_set_group_app_access(p_company_id uuid,p_group_id uuid,p_app_key text,p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'teams.manage') then raise exception 'Group management denied' using errcode='42501'; end if;
  if p_enabled then insert into public.control_group_app_access(group_id,app_key,enabled,created_by) select p_group_id,p_app_key,(true),(select auth.uid()) where exists(select 1 from public.control_groups where id=p_group_id and company_id=p_company_id) on conflict(group_id,app_key) do update set enabled=true; else update public.control_group_app_access set enabled=false where group_id=p_group_id and app_key=p_app_key; end if;
end;
$$;

create or replace function public.control_set_role_permissions(p_company_id uuid,p_role_id uuid,p_permissions text[])
returns void language plpgsql security definer set search_path = '' as $$
declare permission_code text;
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'roles.manage') then raise exception 'Role management denied' using errcode='42501'; end if;
  if not exists(select 1 from public.app_roles where id=p_role_id and company_id=p_company_id and not is_system) then raise exception 'Only custom organization roles can be edited' using errcode='42501'; end if;
  delete from public.app_role_permissions where role_id=p_role_id;
  foreach permission_code in array coalesce(p_permissions,'{}'::text[]) loop
    if private.can_grant_permission(p_role_id,permission_code) then insert into public.app_role_permissions(role_id,permission_code,created_by) values(p_role_id,permission_code,(select auth.uid())) on conflict do nothing; end if;
  end loop;
end;
$$;

create or replace function public.control_delete_custom_role(p_company_id uuid,p_role_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'roles.manage') then raise exception 'Role management denied' using errcode='42501'; end if;
  if exists(select 1 from public.membership_role_assignments assignment join public.memberships membership on membership.id=assignment.membership_id where assignment.role_id=p_role_id and membership.company_id=p_company_id) then raise exception 'Remove this role from members before deleting it' using errcode='23503'; end if;
  delete from public.app_roles where id=p_role_id and company_id=p_company_id and not is_system;
end;
$$;

create or replace function public.control_upsert_security_policy(p_company_id uuid,p_require_mfa_admins boolean,p_require_mfa_all boolean,p_allowed_domains text[],p_invitation_policy text)
returns public.control_security_policies language plpgsql security definer set search_path = '' as $$
declare result public.control_security_policies;
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'security.manage') then raise exception 'Security management denied' using errcode='42501'; end if;
  if p_require_mfa_admins and coalesce((select auth.jwt() ->> 'aal'),'aal1') <> 'aal2' then raise exception 'Enroll MFA before requiring it for administrators' using errcode='42501'; end if;
  insert into public.control_security_policies(company_id,require_mfa_admins,require_mfa_all,allowed_email_domains,invitation_policy,updated_by)
  values(p_company_id,p_require_mfa_admins,p_require_mfa_all,(select coalesce(array_agg(lower(trim(domain))) filter(where trim(domain)<>''),'{}'::text[]) from unnest(coalesce(p_allowed_domains,'{}'::text[])) domain),p_invitation_policy,(select auth.uid()))
  on conflict(company_id) do update set require_mfa_admins=excluded.require_mfa_admins,require_mfa_all=excluded.require_mfa_all,allowed_email_domains=excluded.allowed_email_domains,invitation_policy=excluded.invitation_policy,updated_at=now(),updated_by=(select auth.uid()) returning * into result;
  return result;
end;
$$;

create or replace function public.control_security_summary(p_company_id uuid)
returns table(admin_count bigint,mfa_enrolled_count bigint,mfa_adoption numeric,active_session_count bigint,api_key_count bigint,unread_notification_count bigint)
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'security.read') then raise exception 'Security access denied' using errcode='42501'; end if;
  return query select count(*) filter(where lower(coalesce(membership.role,'')) in ('owner','admin')),count(distinct factors.user_id) filter(where factors.status::text='verified'),case when count(distinct membership.user_id)=0 then 0 else round((count(distinct factors.user_id) filter(where factors.status::text='verified'))::numeric*100/count(distinct membership.user_id),1) end,count(distinct session.id),(select count(*) from public.control_api_keys key where key.company_id=p_company_id and key.revoked_at is null and (key.expires_at is null or key.expires_at>now())),(select count(*) from public.control_notification_events event where event.company_id=p_company_id and not exists(select 1 from public.control_notification_reads read where read.event_id=event.id and read.user_id=(select auth.uid())))
  from public.memberships membership left join auth.mfa_factors factors on factors.user_id=membership.user_id left join auth.sessions session on session.user_id=membership.user_id and (session.not_after is null or session.not_after>now())
  where membership.company_id=p_company_id and coalesce(membership.status,'active')<>'revoked';
end;
$$;

create or replace function public.control_list_member_security(p_company_id uuid)
returns table(membership_id uuid,user_id uuid,mfa_enrolled boolean,active_sessions bigint,last_session_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'security.read') then raise exception 'Security access denied' using errcode='42501'; end if;
  return query select membership.id,membership.user_id,exists(select 1 from auth.mfa_factors factor where factor.user_id=membership.user_id and factor.status::text='verified'),(select count(*) from auth.sessions session where session.user_id=membership.user_id and (session.not_after is null or session.not_after>now())),(select max(session.updated_at) from auth.sessions session where session.user_id=membership.user_id)
  from public.memberships membership where membership.company_id=p_company_id and coalesce(membership.status,'active')<>'revoked';
end;
$$;

create or replace function public.control_revoke_member_sessions(p_company_id uuid,p_user_id uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare removed bigint;
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'security.manage') then raise exception 'Session management denied' using errcode='42501'; end if;
  if not exists(select 1 from public.memberships where company_id=p_company_id and user_id=p_user_id) then raise exception 'Member not found' using errcode='22023'; end if;
  delete from auth.sessions where user_id=p_user_id; get diagnostics removed=row_count; return removed;
end;
$$;

create or replace function public.control_add_domain(p_company_id uuid,p_domain text)
returns public.control_company_domains language plpgsql security definer set search_path = '' as $$
declare result public.control_company_domains; domain_name text:=lower(trim(p_domain)); token text:=encode(gen_random_bytes(18),'hex');
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'organization.manage') then raise exception 'Organization management denied' using errcode='42501'; end if;
  insert into public.control_company_domains(company_id,domain,verification_token,created_by) values(p_company_id,domain_name,token,(select auth.uid())) on conflict(company_id,domain) do update set verification_token=excluded.verification_token,verified_at=null,updated_at=now() returning * into result; return result;
end;
$$;

create or replace function public.control_mark_domain_verified(p_company_id uuid,p_domain_id uuid,p_token text)
returns public.control_company_domains language plpgsql security definer set search_path = '' as $$
declare result public.control_company_domains;
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'organization.manage') then raise exception 'Organization management denied' using errcode='42501'; end if;
  update public.control_company_domains set verified_at=now(),updated_at=now() where id=p_domain_id and company_id=p_company_id and verification_token=p_token returning * into result;
  if result.id is null then raise exception 'Domain verification token is invalid' using errcode='22023'; end if; return result;
end;
$$;

commit;
