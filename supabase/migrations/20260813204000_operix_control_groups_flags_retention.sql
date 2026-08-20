-- Remaining shared Control configuration surfaces.

begin;

create or replace function public.control_list_group_access(p_company_id uuid)
returns table(group_id uuid,membership_id uuid,app_key text,enabled boolean)
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'teams.read') then raise exception 'Group access denied' using errcode='42501'; end if;
  return query select group_row.id,member.membership_id,access.app_key,access.enabled from public.control_groups group_row join public.control_group_members member on member.group_id=group_row.id left join public.control_group_app_access access on access.group_id=group_row.id where group_row.company_id=p_company_id;
end;
$$;

create or replace function public.control_upsert_retention_policy(p_company_id uuid,p_audit_log_days integer,p_support_attachment_days integer,p_deleted_file_days integer,p_inactive_account_days integer)
returns public.control_data_retention_policies language plpgsql security definer set search_path = '' as $$
declare result public.control_data_retention_policies;
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'settings.manage') then raise exception 'Retention policy management denied' using errcode='42501'; end if;
  insert into public.control_data_retention_policies(company_id,audit_log_days,support_attachment_days,deleted_file_days,inactive_account_days,updated_by) values(p_company_id,p_audit_log_days,p_support_attachment_days,p_deleted_file_days,p_inactive_account_days,(select auth.uid())) on conflict(company_id) do update set audit_log_days=excluded.audit_log_days,support_attachment_days=excluded.support_attachment_days,deleted_file_days=excluded.deleted_file_days,inactive_account_days=excluded.inactive_account_days,updated_at=now(),updated_by=(select auth.uid()) returning * into result;
  return result;
end;
$$;

create or replace function public.control_list_feature_flags(p_company_id uuid)
returns table(flag text,enabled boolean,configuration jsonb,updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'settings.read') then raise exception 'Feature flag access denied' using errcode='42501'; end if;
  return query select feature.flag,feature.enabled,feature.configuration,feature.updated_at from public.company_feature_flags feature where feature.company_id=p_company_id order by feature.flag;
end;
$$;

create or replace function public.control_set_feature_flag(p_company_id uuid,p_flag text,p_enabled boolean,p_configuration jsonb default '{}'::jsonb)
returns public.company_feature_flags language plpgsql security definer set search_path = '' as $$
declare result public.company_feature_flags;
begin
  if (select auth.uid()) is null or not private.has_company_permission(p_company_id,'settings.manage') then raise exception 'Feature flag management denied' using errcode='42501'; end if;
  insert into public.company_feature_flags(company_id,flag,enabled,configuration,updated_by) values(p_company_id,trim(p_flag),p_enabled,coalesce(p_configuration,'{}'::jsonb),(select auth.uid())) on conflict(company_id,flag) do update set enabled=excluded.enabled,configuration=excluded.configuration,updated_at=now(),updated_by=(select auth.uid()) returning * into result;
  return result;
end;
$$;

grant execute on function public.control_list_group_access(uuid),public.control_upsert_retention_policy(uuid,integer,integer,integer,integer),public.control_list_feature_flags(uuid),public.control_set_feature_flag(uuid,text,boolean,jsonb) to authenticated;

commit;
