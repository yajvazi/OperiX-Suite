alter table public.invoices
  add column if not exists show_product_pictures boolean not null default false;

create or replace function public.set_invoice_product_pictures(
  p_invoice_id uuid,
  p_show_product_pictures boolean
)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  invoice_row public.invoices;
  allowed boolean;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into invoice_row
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;

  allowed := invoice_row.company_id is null and invoice_row.user_id = actor_id;
  if not allowed and invoice_row.company_id is not null then
    allowed := public.can_access_company(invoice_row.company_id)
      and (
        coalesce(private.has_company_permission(invoice_row.company_id, 'sales_invoice.edit'), false)
        or (
          public.get_my_company_role(invoice_row.company_id) = 'employee'
          and invoice_row.user_id = actor_id
          and upper(coalesce(invoice_row.commercial_status, invoice_row.status::text, 'DRAFT')) = 'DRAFT'
        )
      );
  end if;

  if not allowed then
    raise exception 'Insufficient permission to update invoice display settings' using errcode = '42501';
  end if;

  perform set_config('app.invoice_auxiliary_workflow', 'authorized', true);
  update public.invoices
  set show_product_pictures = coalesce(p_show_product_pictures, false)
  where id = p_invoice_id
  returning * into invoice_row;

  return invoice_row;
end;
$$;

revoke all on function public.set_invoice_product_pictures(uuid, boolean) from public, anon;
grant execute on function public.set_invoice_product_pictures(uuid, boolean) to authenticated;
