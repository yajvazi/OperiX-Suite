-- Phase E2: terminal-aware cashier shifts. This is additive and deliberately
-- does not fabricate shifts for historical POS invoices.

create table public.cashier_shifts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid not null references public.branches(id) on delete restrict,
  terminal_id uuid not null references public.pos_terminals(id) on delete restrict,
  cashier_id uuid not null references auth.users(id) on delete restrict,
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'active' check (status in ('open','active','closing','closed','reopened','investigated','cancelled_before_activity')),
  opening_float numeric(20,4) not null default 0 check (opening_float >= 0),
  expected_cash numeric(20,4) not null default 0,
  counted_cash numeric(20,4),
  difference_amount numeric(20,4),
  opening_notes text,
  closing_notes text,
  difference_reason text,
  opened_at timestamptz not null default clock_timestamp(),
  closed_at timestamptz,
  opened_by uuid references auth.users(id) on delete set null,
  closed_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  reopened_at timestamptz,
  reopened_by uuid references auth.users(id) on delete set null,
  reopen_reason text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (id, company_id)
);

create unique index cashier_shifts_one_open_terminal_idx
  on public.cashier_shifts (terminal_id)
  where status in ('open','active','closing','reopened');
create index cashier_shifts_company_terminal_created_idx
  on public.cashier_shifts (company_id, terminal_id, opened_at desc);

create table public.cashier_shift_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  cashier_shift_id uuid not null references public.cashier_shifts(id) on delete restrict,
  terminal_id uuid not null references public.pos_terminals(id) on delete restrict,
  movement_type text not null check (movement_type in ('opening_float','cash_sale','cash_refund','cash_in','cash_out','paid_out','safe_drop','cash_transfer','correction','closing_count')),
  amount numeric(20,4) not null check (amount <> 0 or movement_type in ('opening_float','closing_count')),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  source_type text,
  source_id uuid,
  reason text,
  occurred_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object')
);
create index cashier_shift_movements_shift_created_idx
  on public.cashier_shift_movements (cashier_shift_id, occurred_at);

create table public.cashier_shift_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  cashier_shift_id uuid not null references public.cashier_shifts(id) on delete restrict,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null default clock_timestamp(),
  actor_id uuid references auth.users(id) on delete set null
);

create function private.prevent_cashier_shift_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name in ('cashier_shift_movements', 'cashier_shift_events') then
    raise exception '% records are append-only', tg_table_name using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Cashier shifts cannot be deleted' using errcode = '55000';
  end if;

  if old.status = 'closed'
     and coalesce(current_setting('app.cashier_shift_workflow', true), '') <> 'authorized' then
    raise exception 'Closed cashier shifts are immutable; use the authorized reopen workflow'
      using errcode = '55000';
  end if;

  return new;
end
$$;

alter table public.pos_orders
  add column if not exists cashier_shift_id uuid references public.cashier_shifts(id) on delete restrict;
alter table public.pos_payments
  add column if not exists cashier_shift_id uuid references public.cashier_shifts(id) on delete restrict;
create index if not exists pos_orders_shift_created_idx on public.pos_orders (cashier_shift_id, created_at desc);

create or replace function private.assert_cashier_shift_access(p_company_id uuid, p_terminal_id uuid)
returns public.pos_terminals
language plpgsql security definer set search_path = '' as $$
declare terminal_row public.pos_terminals;
begin
  if not (select private.is_company_member(p_company_id)) then
    raise exception 'You do not have access to this company' using errcode = '42501';
  end if;
  terminal_row := private.resolve_pos_terminal(p_company_id, p_terminal_id);
  if terminal_row.status <> 'active' then
    raise exception 'An active POS terminal is required' using errcode = '23514';
  end if;
  return terminal_row;
end $$;

create function public.open_cashier_shift(p_company_id uuid, p_terminal_id uuid, p_opening_float numeric default 0, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare terminal_row public.pos_terminals; shift_row public.cashier_shifts;
begin
  if not (select private.has_company_permission(p_company_id, 'pos.shift.open')) then
    raise exception 'Insufficient permission to open a cashier shift' using errcode = '42501';
  end if;
  if coalesce(p_opening_float, 0) < 0 then
    raise exception 'Opening float cannot be negative' using errcode = '23514';
  end if;
  terminal_row := private.assert_cashier_shift_access(p_company_id, p_terminal_id);
  if exists (select 1 from public.cashier_shifts where terminal_id = terminal_row.id and status in ('open','active','closing','reopened')) then
    raise exception 'This terminal already has an open cashier shift' using errcode = '23505';
  end if;
  insert into public.cashier_shifts (company_id,branch_id,terminal_id,cashier_id,currency,status,opening_float,expected_cash,opening_notes,opened_by)
  values (p_company_id,terminal_row.branch_id,terminal_row.id,(select auth.uid()),'EUR','active',round(coalesce(p_opening_float,0),4),round(coalesce(p_opening_float,0),4),nullif(trim(p_notes),''),(select auth.uid()))
  returning * into shift_row;
  insert into public.cashier_shift_movements (company_id,cashier_shift_id,terminal_id,movement_type,amount,source_type,reason,created_by)
  values (p_company_id,shift_row.id,terminal_row.id,'opening_float',round(coalesce(p_opening_float,0),4),'cashier_shift',nullif(trim(p_notes),''),(select auth.uid()));
  insert into public.cashier_shift_events (company_id,cashier_shift_id,event_type,payload,actor_id)
  values (p_company_id,shift_row.id,'opened',jsonb_build_object('opening_float',shift_row.opening_float),(select auth.uid()));
  return jsonb_build_object('shift_id',shift_row.id,'status',shift_row.status,'expected_cash',shift_row.expected_cash);
end $$;

create function public.record_cashier_shift_movement(p_company_id uuid, p_shift_id uuid, p_movement_type text, p_amount numeric, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare shift_row public.cashier_shifts; signed_amount numeric(20,4);
begin
  if not (select private.has_company_permission(p_company_id, 'pos.shift.cash_movement')) then
    raise exception 'Insufficient permission to record a cash movement' using errcode = '42501';
  end if;
  select * into shift_row from public.cashier_shifts where id=p_shift_id and company_id=p_company_id for update;
  if not found or shift_row.status not in ('open','active','reopened') then raise exception 'An active cashier shift is required' using errcode='55000'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'A reason is required for a cash movement' using errcode='23514'; end if;
  if coalesce(p_amount,0) <= 0 then raise exception 'Cash movement amount must be positive' using errcode='23514'; end if;
  if p_movement_type not in ('cash_in','cash_out','paid_out','safe_drop','cash_transfer') then raise exception 'Unsupported cash movement type' using errcode='23514'; end if;
  signed_amount := case when p_movement_type in ('cash_out','paid_out','safe_drop','cash_transfer') then -round(p_amount,4) else round(p_amount,4) end;
  insert into public.cashier_shift_movements (company_id,cashier_shift_id,terminal_id,movement_type,amount,reason,created_by)
  values (p_company_id,shift_row.id,shift_row.terminal_id,p_movement_type,signed_amount,trim(p_reason),(select auth.uid()));
  update public.cashier_shifts set expected_cash=round(expected_cash+signed_amount,4),updated_at=clock_timestamp() where id=shift_row.id returning * into shift_row;
  insert into public.cashier_shift_events (company_id,cashier_shift_id,event_type,payload,actor_id) values (p_company_id,shift_row.id,'cash_movement',jsonb_build_object('type',p_movement_type,'amount',signed_amount,'reason',trim(p_reason)),(select auth.uid()));
  return jsonb_build_object('shift_id',shift_row.id,'expected_cash',shift_row.expected_cash);
end $$;

create function public.submit_cashier_shift_count(p_company_id uuid, p_shift_id uuid, p_counted_cash numeric, p_notes text default null, p_difference_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare shift_row public.cashier_shifts; difference_value numeric(20,4);
begin
  if not (select private.has_company_permission(p_company_id, 'pos.shift.close')) then raise exception 'Insufficient permission to close a cashier shift' using errcode='42501'; end if;
  select * into shift_row from public.cashier_shifts where id=p_shift_id and company_id=p_company_id for update;
  if not found or shift_row.status not in ('open','active','reopened') then raise exception 'Only an active cashier shift can be counted' using errcode='55000'; end if;
  if coalesce(p_counted_cash,-1) < 0 then raise exception 'Counted cash cannot be negative' using errcode='23514'; end if;
  difference_value := round(p_counted_cash-shift_row.expected_cash,4);
  if difference_value <> 0 and nullif(trim(p_difference_reason),'') is null then raise exception 'A reason is required for a cash difference' using errcode='23514'; end if;
  update public.cashier_shifts set status='closing',counted_cash=round(p_counted_cash,4),difference_amount=difference_value,closing_notes=nullif(trim(p_notes),''),difference_reason=nullif(trim(p_difference_reason),''),updated_at=clock_timestamp() where id=shift_row.id returning * into shift_row;
  insert into public.cashier_shift_movements (company_id,cashier_shift_id,terminal_id,movement_type,amount,source_type,reason,created_by) values (p_company_id,shift_row.id,shift_row.terminal_id,'closing_count',round(p_counted_cash,4),'cashier_shift',nullif(trim(p_notes),''),(select auth.uid()));
  insert into public.cashier_shift_events (company_id,cashier_shift_id,event_type,payload,actor_id) values (p_company_id,shift_row.id,'count_submitted',jsonb_build_object('counted_cash',p_counted_cash,'expected_cash',shift_row.expected_cash,'difference',difference_value),(select auth.uid()));
  return jsonb_build_object('shift_id',shift_row.id,'status',shift_row.status,'difference_amount',difference_value);
end $$;

create function public.approve_cashier_shift_close(p_company_id uuid, p_shift_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare shift_row public.cashier_shifts;
begin
  if not (select private.has_company_permission(p_company_id, 'pos.shift.approve')) then raise exception 'Insufficient permission to approve a cashier shift close' using errcode='42501'; end if;
  select * into shift_row from public.cashier_shifts where id=p_shift_id and company_id=p_company_id for update;
  if not found or shift_row.status <> 'closing' then raise exception 'Only a counted cashier shift can be approved' using errcode='55000'; end if;
  update public.cashier_shifts set status='closed',closed_at=clock_timestamp(),closed_by=(select auth.uid()),approved_by=(select auth.uid()),updated_at=clock_timestamp() where id=shift_row.id returning * into shift_row;
  insert into public.cashier_shift_events (company_id,cashier_shift_id,event_type,payload,actor_id) values (p_company_id,shift_row.id,'closed',jsonb_build_object('reason',nullif(trim(p_reason),''),'difference',shift_row.difference_amount),(select auth.uid()));
  return jsonb_build_object('shift_id',shift_row.id,'status',shift_row.status,'expected_cash',shift_row.expected_cash,'counted_cash',shift_row.counted_cash,'difference_amount',shift_row.difference_amount);
end $$;

create function public.reopen_cashier_shift(p_company_id uuid, p_shift_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare shift_row public.cashier_shifts;
begin
  if not (select private.has_company_permission(p_company_id, 'pos.shift.reopen')) then raise exception 'Insufficient permission to reopen a cashier shift' using errcode='42501'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'A reason is required to reopen a cashier shift' using errcode='23514'; end if;
  select * into shift_row from public.cashier_shifts where id=p_shift_id and company_id=p_company_id for update;
  if not found or shift_row.status <> 'closed' then raise exception 'Only a closed cashier shift can be reopened' using errcode='55000'; end if;
  perform set_config('app.cashier_shift_workflow', 'authorized', true);
  update public.cashier_shifts set status='reopened',counted_cash=null,difference_amount=null,reopened_at=clock_timestamp(),reopened_by=(select auth.uid()),reopen_reason=trim(p_reason),closed_at=null,closed_by=null,approved_by=null,updated_at=clock_timestamp() where id=shift_row.id returning * into shift_row;
  perform set_config('app.cashier_shift_workflow', '', true);
  insert into public.cashier_shift_events (company_id,cashier_shift_id,event_type,payload,actor_id) values (p_company_id,shift_row.id,'reopened',jsonb_build_object('reason',trim(p_reason)),(select auth.uid()));
  return jsonb_build_object('shift_id',shift_row.id,'status',shift_row.status);
end $$;

insert into public.app_permissions (code,name,category,description,is_sensitive) values
  ('pos.shift.open','Open cashier shift','pos','Open a terminal-linked cashier shift.',true),
  ('pos.shift.close','Close cashier shift','pos','Count and submit a cashier shift close.',true),
  ('pos.shift.approve','Approve cashier shift close','pos','Approve counted cashier shifts and cash differences.',true),
  ('pos.shift.reopen','Reopen cashier shift','pos','Reopen a closed cashier shift with a reason.',true),
  ('pos.shift.cash_movement','Record cash movement','pos','Record auditable cash in, out and safe-drop movements.',true),
  ('pos.shift.view','View cashier shifts','pos','View terminal cashier-shift history.',false)
on conflict (code) do update set name=excluded.name,category=excluded.category,description=excluded.description,is_sensitive=excluded.is_sensitive;

insert into public.app_role_permissions (role_id,permission_code)
select role.id, permission.code from public.app_roles role join public.app_permissions permission on permission.code in ('pos.shift.open','pos.shift.close','pos.shift.approve','pos.shift.reopen','pos.shift.cash_movement','pos.shift.view')
where role.company_id is null and role.code in ('owner','super_administrator','company_administrator','cashier')
  and (role.code <> 'cashier' or permission.code in ('pos.shift.open','pos.shift.close','pos.shift.cash_movement','pos.shift.view'))
on conflict do nothing;

alter table public.cashier_shifts enable row level security;
alter table public.cashier_shift_movements enable row level security;
alter table public.cashier_shift_events enable row level security;
create policy cashier_shifts_select on public.cashier_shifts for select to authenticated using ((select private.has_company_permission(company_id,'pos.shift.view')));
create policy cashier_shift_movements_select on public.cashier_shift_movements for select to authenticated using ((select private.has_company_permission(company_id,'pos.shift.view')));
create policy cashier_shift_events_select on public.cashier_shift_events for select to authenticated using ((select private.has_company_permission(company_id,'pos.shift.view')));
create trigger cashier_shifts_immutable before update or delete on public.cashier_shifts for each row execute function private.prevent_cashier_shift_mutation();
create trigger cashier_shift_movements_immutable before update or delete on public.cashier_shift_movements for each row execute function private.prevent_cashier_shift_mutation();
create trigger cashier_shift_events_immutable before update or delete on public.cashier_shift_events for each row execute function private.prevent_cashier_shift_mutation();
create trigger cashier_shifts_audit after insert or update or delete on public.cashier_shifts for each row execute function private.audit_table_change();
create trigger cashier_shift_movements_audit after insert or update or delete on public.cashier_shift_movements for each row execute function private.audit_table_change();
create trigger cashier_shift_events_audit after insert or update or delete on public.cashier_shift_events for each row execute function private.audit_table_change();

revoke all on function public.open_cashier_shift(uuid,uuid,numeric,text) from public;
revoke all on function public.record_cashier_shift_movement(uuid,uuid,text,numeric,text) from public;
revoke all on function public.submit_cashier_shift_count(uuid,uuid,numeric,text,text) from public;
revoke all on function public.approve_cashier_shift_close(uuid,uuid,text) from public;
revoke all on function public.reopen_cashier_shift(uuid,uuid,text) from public;
grant execute on function public.open_cashier_shift(uuid,uuid,numeric,text), public.record_cashier_shift_movement(uuid,uuid,text,numeric,text), public.submit_cashier_shift_count(uuid,uuid,numeric,text,text), public.approve_cashier_shift_close(uuid,uuid,text), public.reopen_cashier_shift(uuid,uuid,text) to authenticated;

comment on table public.cashier_shifts is 'Phase E terminal-aware shifts. Closed shifts are operationally immutable; reopening requires permission and a reason.';
