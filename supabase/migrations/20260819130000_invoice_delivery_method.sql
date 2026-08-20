-- Store the delivery choice independently from invoice comments so it can be
-- rendered as a first-class invoice detail in every client/template.
alter table public.invoices
  add column if not exists delivery_method text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.invoices'::regclass
      and conname = 'invoices_delivery_method_check'
  ) then
    alter table public.invoices
      add constraint invoices_delivery_method_check
      check (delivery_method is null or delivery_method in ('pickup', 'delivery', 'bus', 'other'));
  end if;
end
$$;

create or replace function public.set_invoice_delivery_method(
  p_invoice_id uuid,
  p_delivery_method text default null
)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  invoice_row public.invoices;
  normalized_method text := nullif(lower(trim(coalesce(p_delivery_method, ''))), '');
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select * into invoice_row
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;

  if invoice_row.company_id is null
     or not public.can_access_company(invoice_row.company_id) then
    raise exception 'Invoice belongs to another company' using errcode = '42501';
  end if;

  if not (
    coalesce(private.has_company_permission(invoice_row.company_id, 'sales_invoice.edit'), false)
    or coalesce(private.has_company_permission(invoice_row.company_id, 'sales_invoice.create'), false)
    or coalesce(private.has_company_permission(invoice_row.company_id, 'invoice.create'), false)
  ) then
    raise exception 'Insufficient permission to edit invoice details' using errcode = '42501';
  end if;

  if normalized_method is not null
     and normalized_method not in ('pickup', 'delivery', 'bus', 'other') then
    raise exception 'Unsupported delivery method' using errcode = '22023';
  end if;

  -- This command changes presentation/logistics metadata only. The trigger
  -- still protects every financial field and the function has already checked
  -- the caller's company permission above.
  perform set_config('app.financial_workflow', 'authorized', true);

  update public.invoices
  set delivery_method = normalized_method
  where id = p_invoice_id
  returning * into invoice_row;

  return invoice_row;
end
$$;

revoke all on function public.set_invoice_delivery_method(uuid, text) from public, anon;
grant execute on function public.set_invoice_delivery_method(uuid, text) to authenticated;
