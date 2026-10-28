-- Desk mobile device registrations are Desk data and must follow the same
-- Enterprise entitlement boundary as reservations and resources.

begin;

do $$
begin
  if to_regclass('public.desk_device_tokens') is not null then
    execute 'drop policy if exists operix_desk_device_token_product_boundary on public.desk_device_tokens';
    execute $policy$
      create policy operix_desk_device_token_product_boundary
      on public.desk_device_tokens
      as restrictive for all to authenticated
      using (private.operix_product_access(private.operix_company_uuid(company_id::text), 'desk'))
      with check (private.operix_product_access(private.operix_company_uuid(company_id::text), 'desk'))
    $policy$;
  end if;
end;
$$;

commit;
