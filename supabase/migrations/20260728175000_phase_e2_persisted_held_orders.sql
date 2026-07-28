-- Phase E2: replace browser-held carts with tenant-safe persisted held orders.

create table public.held_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  terminal_id uuid not null references public.pos_terminals(id) on delete restrict,
  warehouse_id uuid references public.warehouses(id) on delete restrict,
  cashier_id uuid not null references auth.users(id) on delete restrict,
  customer_id uuid references public.clients(id) on delete restrict,
  status text not null default 'held'
    check (status in ('held','resumed','transferred','cancelled','expired','completed')),
  cart_snapshot jsonb not null check (jsonb_typeof(cart_snapshot) = 'object'),
  version integer not null default 1 check (version > 0),
  expires_at timestamptz,
  resumed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references auth.users(id) on delete set null
);
create index held_orders_cashier_status_created_idx
  on public.held_orders (company_id, cashier_id, status, created_at desc);
create index held_orders_terminal_status_created_idx
  on public.held_orders (terminal_id, status, created_at desc);

create function private.prevent_terminal_held_order_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Held-order history cannot be deleted' using errcode = '55000';
  end if;
  if old.status <> 'held'
     and coalesce(current_setting('app.held_order_workflow', true), '') <> 'authorized' then
    raise exception 'Finalized held orders are immutable' using errcode = '55000';
  end if;
  if new.version <> old.version + 1 then
    raise exception 'Held-order version must increment exactly once' using errcode = '40001';
  end if;
  return new;
end
$$;

create function public.hold_pos_order(
  p_company_id uuid,
  p_terminal_id uuid,
  p_customer_id uuid,
  p_cart_snapshot jsonb,
  p_expires_at timestamptz default null
)
returns public.held_orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  terminal_row public.pos_terminals;
  held_row public.held_orders;
begin
  if not (select private.has_company_permission(p_company_id, 'pos.order.hold')) then
    raise exception 'Insufficient permission to hold POS orders' using errcode = '42501';
  end if;
  if not coalesce((
    select flag.enabled
    from public.company_feature_flags flag
    where flag.company_id = p_company_id and flag.flag = 'persisted_held_orders_enabled'
  ), false) then
    raise exception 'Persisted held orders are not enabled for this company' using errcode = '55000';
  end if;
  if jsonb_typeof(p_cart_snapshot) <> 'object'
     or jsonb_typeof(p_cart_snapshot -> 'items') <> 'array'
     or jsonb_array_length(p_cart_snapshot -> 'items') = 0 then
    raise exception 'A held order requires a non-empty item snapshot' using errcode = '23514';
  end if;

  terminal_row := private.assert_cashier_shift_access(p_company_id, p_terminal_id);
  if p_customer_id is not null and not exists (
    select 1 from public.clients
    where id = p_customer_id and company_id = p_company_id
  ) then
    raise exception 'Held-order customer does not belong to this company' using errcode = '23514';
  end if;

  insert into public.held_orders (
    company_id, branch_id, terminal_id, warehouse_id, cashier_id, customer_id,
    cart_snapshot, expires_at, created_by, updated_by
  )
  values (
    p_company_id, terminal_row.branch_id, terminal_row.id, terminal_row.warehouse_id,
    (select auth.uid()), p_customer_id, p_cart_snapshot, p_expires_at,
    (select auth.uid()), (select auth.uid())
  )
  returning * into held_row;

  perform private.emit_domain_outbox_event(
    p_company_id, terminal_row.branch_id, 'held_order', held_row.id,
    'pos_order.held', jsonb_build_object('terminal_id', terminal_row.id),
    'pos_order.held:' || held_row.id::text
  );
  return held_row;
end
$$;

create function public.resume_held_pos_order(
  p_company_id uuid,
  p_held_order_id uuid,
  p_expected_version integer
)
returns public.held_orders
language plpgsql
security definer
set search_path = ''
as $$
declare held_row public.held_orders;
begin
  if not (select private.has_company_permission(p_company_id, 'pos.order.hold')) then
    raise exception 'Insufficient permission to resume held orders' using errcode = '42501';
  end if;
  select * into held_row
  from public.held_orders
  where id = p_held_order_id
    and company_id = p_company_id
    and cashier_id = (select auth.uid())
  for update;
  if not found or held_row.status <> 'held' then
    raise exception 'Held order is unavailable' using errcode = '55000';
  end if;
  if held_row.version <> p_expected_version then
    raise exception 'Held order changed on another device; refresh before resuming'
      using errcode = '40001';
  end if;
  if held_row.expires_at is not null and held_row.expires_at <= clock_timestamp() then
    perform set_config('app.held_order_workflow', 'authorized', true);
    update public.held_orders
    set status = 'expired', version = version + 1, updated_at = clock_timestamp(),
        updated_by = (select auth.uid())
    where id = held_row.id
    returning * into held_row;
    perform set_config('app.held_order_workflow', '', true);
    return held_row;
  end if;

  perform set_config('app.held_order_workflow', 'authorized', true);
  update public.held_orders
  set status = 'resumed', resumed_at = clock_timestamp(), version = version + 1,
      updated_at = clock_timestamp(), updated_by = (select auth.uid())
  where id = held_row.id
  returning * into held_row;
  perform set_config('app.held_order_workflow', '', true);
  return held_row;
end
$$;

create function public.cancel_held_pos_order(
  p_company_id uuid,
  p_held_order_id uuid,
  p_expected_version integer,
  p_reason text
)
returns public.held_orders
language plpgsql
security definer
set search_path = ''
as $$
declare held_row public.held_orders;
begin
  if not (select private.has_company_permission(p_company_id, 'pos.order.cancel')) then
    raise exception 'Insufficient permission to cancel held orders' using errcode = '42501';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'A cancellation reason is required' using errcode = '23514';
  end if;
  select * into held_row
  from public.held_orders
  where id = p_held_order_id and company_id = p_company_id
  for update;
  if not found or held_row.status <> 'held' then
    raise exception 'Held order is unavailable' using errcode = '55000';
  end if;
  if held_row.version <> p_expected_version then
    raise exception 'Held order changed; refresh before cancelling' using errcode = '40001';
  end if;
  update public.held_orders
  set status = 'cancelled', cancel_reason = trim(p_reason),
      cancelled_at = clock_timestamp(), version = version + 1,
      updated_at = clock_timestamp(), updated_by = (select auth.uid())
  where id = held_row.id
  returning * into held_row;
  return held_row;
end
$$;

insert into public.app_permissions (code,name,category,description,is_sensitive) values
  ('pos.order.hold','Hold and resume POS orders','pos','Persist and resume terminal held orders.',false),
  ('pos.order.cancel','Cancel held POS orders','pos','Cancel held orders with a reason.',true),
  ('pos.order.transfer','Transfer held POS orders','pos','Transfer held orders across approved terminals or cashiers.',true)
on conflict (code) do update
set name=excluded.name,category=excluded.category,description=excluded.description,is_sensitive=excluded.is_sensitive;

insert into public.app_role_permissions (role_id,permission_code)
select role.id, permission.code
from public.app_roles role
join public.app_permissions permission
  on permission.code in ('pos.order.hold','pos.order.cancel','pos.order.transfer')
where role.company_id is null
  and role.code in ('owner','super_administrator','company_administrator','cashier')
  and (role.code <> 'cashier' or permission.code in ('pos.order.hold','pos.order.cancel'))
on conflict do nothing;

alter table public.held_orders enable row level security;
create policy held_orders_select on public.held_orders
for select to authenticated
using (
  (select private.is_company_member(company_id))
  and (
    cashier_id = (select auth.uid())
    or (select private.has_company_permission(company_id,'pos.order.transfer'))
  )
);

create trigger held_orders_immutable
before update or delete on public.held_orders
for each row execute function private.prevent_terminal_held_order_mutation();
create trigger held_orders_audit
after insert or update or delete on public.held_orders
for each row execute function private.audit_table_change();

revoke all on function public.hold_pos_order(uuid,uuid,uuid,jsonb,timestamptz) from public;
revoke all on function public.resume_held_pos_order(uuid,uuid,integer) from public;
revoke all on function public.cancel_held_pos_order(uuid,uuid,integer,text) from public;
grant execute on function public.hold_pos_order(uuid,uuid,uuid,jsonb,timestamptz) to authenticated;
grant execute on function public.resume_held_pos_order(uuid,uuid,integer) to authenticated;
grant execute on function public.cancel_held_pos_order(uuid,uuid,integer,text) to authenticated;

comment on table public.held_orders is
  'Versioned, tenant-scoped POS held orders. Replaces browser session-storage carts when its feature flag is enabled.';
