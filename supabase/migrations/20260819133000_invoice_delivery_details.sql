-- Persist the additional information required by each transport method.
alter table public.invoices
  add column if not exists pickup_branch_id uuid references public.branches(id) on delete set null,
  add column if not exists delivery_details text;

create index if not exists invoices_pickup_branch_idx
  on public.invoices (pickup_branch_id)
  where pickup_branch_id is not null;

create or replace function public.set_invoice_delivery_details(
  p_invoice_id uuid,
  p_delivery_method text default null,
  p_pickup_branch_id uuid default null,
  p_delivery_details text default null
)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  invoice_row public.invoices;
  branch_row public.branches;
  normalized_method text := nullif(lower(trim(coalesce(p_delivery_method, ''))), '');
  normalized_details text := nullif(trim(coalesce(p_delivery_details, '')), '');
  normalized_branch_id uuid := p_pickup_branch_id;
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
    or (
      public.get_my_company_role(invoice_row.company_id) = 'employee'
      and invoice_row.user_id = actor_id
      and upper(coalesce(invoice_row.commercial_status, invoice_row.status::text, 'DRAFT')) = 'DRAFT'
    )
  ) then
    raise exception 'Insufficient permission to edit invoice details' using errcode = '42501';
  end if;

  if normalized_method is not null
     and normalized_method not in ('pickup', 'delivery', 'bus', 'other') then
    raise exception 'Unsupported delivery method' using errcode = '22023';
  end if;

  if normalized_branch_id is not null then
    select * into branch_row
    from public.branches
    where id = normalized_branch_id
      and company_id = invoice_row.company_id;

    if not found then
      raise exception 'Pickup store belongs to another company' using errcode = '42501';
    end if;

    if normalized_method = 'pickup' then
      normalized_details := nullif(trim(concat_ws(', ', branch_row.name, branch_row.registered_address, branch_row.municipality)), '');
    end if;
  end if;

  if normalized_method is distinct from 'pickup' then
    normalized_branch_id := null;
  end if;

  perform set_config('app.invoice_auxiliary_workflow', 'authorized', true);

  update public.invoices
  set delivery_method = normalized_method,
      pickup_branch_id = normalized_branch_id,
      delivery_details = normalized_details
  where id = p_invoice_id
  returning * into invoice_row;

  return invoice_row;
end
$$;

revoke all on function public.set_invoice_delivery_details(uuid, text, uuid, text) from public, anon;
grant execute on function public.set_invoice_delivery_details(uuid, text, uuid, text) to authenticated;

-- Keep older clients functional while ensuring they do not leave stale details.
create or replace function public.set_invoice_delivery_method(
  p_invoice_id uuid,
  p_delivery_method text default null
)
returns public.invoices
language sql
security definer
set search_path = ''
as $$
  select public.set_invoice_delivery_details(p_invoice_id, p_delivery_method, null, null);
$$;

revoke all on function public.set_invoice_delivery_method(uuid, text) from public, anon;
grant execute on function public.set_invoice_delivery_method(uuid, text) to authenticated;
