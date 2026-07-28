-- Phase C2: sales lifecycle and accounts receivable.
--
-- This extends the existing invoices, clients and payments tables. All posting
-- and allocation mutations occur through the server-side commands below; no
-- historic operational record is reconstructed by this migration.

alter table public.payments
  add column if not exists settlement_account_id uuid references public.chart_of_accounts(id) on delete restrict;

create index if not exists payments_company_customer_state_idx
  on public.payments (company_id, client_id, accounting_state, payment_date desc);

-- Allocations are append-only in practice: an unallocation records a reversal
-- instead of deleting the original allocation.
create table if not exists public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  branch_id uuid references public.branches(id) on delete restrict,
  payment_id uuid not null references public.payments(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  allocated_amount numeric(20,4) not null check (allocated_amount > 0),
  allocation_date date not null default current_date,
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'active' check (status in ('active','reversed')),
  reversed_at timestamptz,
  reversed_by uuid references auth.users(id) on delete set null,
  reversal_reason text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  check (
    (status = 'active' and reversed_at is null and reversed_by is null and reversal_reason is null)
    or (status = 'reversed' and reversed_at is not null and reversed_by is not null and nullif(trim(reversal_reason), '') is not null)
  )
);

create unique index if not exists payment_allocations_active_payment_invoice_unique
  on public.payment_allocations (payment_id, invoice_id)
  where status = 'active';
create index if not exists payment_allocations_invoice_active_idx
  on public.payment_allocations (company_id, invoice_id, allocation_date)
  where status = 'active';
create index if not exists payment_allocations_payment_active_idx
  on public.payment_allocations (company_id, payment_id, allocation_date)
  where status = 'active';

alter table public.payment_allocations enable row level security;

create policy payment_allocations_select on public.payment_allocations
  for select to authenticated
  using (
    (select private.has_company_permission(company_id, 'customer.balance.view'))
    or (select private.has_company_permission(company_id, 'customer_payment.allocate'))
  );

revoke insert, update, delete, truncate on public.payment_allocations from anon, authenticated;
grant select on public.payment_allocations to authenticated;

drop trigger if exists payment_allocations_audit on public.payment_allocations;
create trigger payment_allocations_audit
  after insert or update or delete on public.payment_allocations
  for each row execute function private.audit_table_change();

-- Configurable document sequence consumption. A missing sequence gets a
-- documented default which administrators can change before the next number is
-- issued. The row lock makes concurrent issue attempts safe.
create or replace function private.next_financial_document_number(
  p_company_id uuid,
  p_branch_id uuid,
  p_document_type text,
  p_default_prefix text,
  p_document_date date
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  sequence_row public.document_sequences;
  period_key text;
  next_number text;
begin
  if p_company_id is null or nullif(trim(p_document_type), '') is null then
    raise exception 'Company and document type are required for document numbering'
      using errcode = '22023';
  end if;

  period_key := to_char(coalesce(p_document_date, current_date), 'YYYY');

  insert into public.document_sequences (
    company_id, branch_id, document_type, prefix, suffix, next_value,
    padding, reset_rule, current_period_key, is_active, created_by, updated_by
  )
  values (
    p_company_id, p_branch_id, p_document_type, coalesce(p_default_prefix, ''),
    '', 1, 6, 'fiscal_year', period_key, true, (select auth.uid()), (select auth.uid())
  )
  on conflict do nothing;

  select *
  into sequence_row
  from public.document_sequences
  where company_id = p_company_id
    and branch_id is not distinct from p_branch_id
    and document_type = p_document_type
    and is_active
  order by updated_at desc
  limit 1
  for update;

  if not found then
    raise exception 'No active document sequence configured for %', p_document_type
      using errcode = 'P0002';
  end if;

  if sequence_row.reset_rule = 'fiscal_year'
    and sequence_row.current_period_key is distinct from period_key then
    update public.document_sequences
    set next_value = 2,
        current_period_key = period_key,
        updated_at = clock_timestamp(),
        updated_by = (select auth.uid())
    where id = sequence_row.id;
    next_number := coalesce(sequence_row.prefix, '') || lpad('1', sequence_row.padding, '0') || coalesce(sequence_row.suffix, '');
  else
    update public.document_sequences
    set next_value = next_value + 1,
        updated_at = clock_timestamp(),
        updated_by = (select auth.uid())
    where id = sequence_row.id;
    next_number := coalesce(sequence_row.prefix, '')
      || lpad(sequence_row.next_value::text, sequence_row.padding, '0')
      || coalesce(sequence_row.suffix, '');
  end if;

  return next_number;
end
$$;

-- Canonical invoice totals. Existing operational invoice items store their
-- post-line-discount amount excluding VAT, so amounts are not recomputed from
-- JavaScript or floating-point values.
create or replace function private.sales_invoice_amounts(p_invoice_id uuid)
returns table (
  net_amount numeric(20,4),
  tax_amount numeric(20,4),
  gross_amount numeric(20,4)
)
language sql
stable
security definer
set search_path = ''
as $$
  with line_totals as (
    select
      round(coalesce(item.amount, 0)::numeric, 4) as net,
      round(
        round(coalesce(item.amount, 0)::numeric, 4)
        * coalesce(item.tax_rate, 0)::numeric / 100,
        4
      ) as tax
    from public.invoice_items item
    where item.invoice_id = p_invoice_id
  )
  select
    round(coalesce(sum(net), 0), 4),
    round(coalesce(sum(tax), 0), 4),
    round(coalesce(sum(net), 0) + coalesce(sum(tax), 0), 4)
  from line_totals
$$;

create or replace function private.refresh_customer_payment_state(p_invoice_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice_row public.invoices;
  allocated_total numeric(20,4);
  next_status public.invoice_status;
begin
  select *
  into invoice_row
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;
  if invoice_row.accounting_state <> 'posted' then
    return invoice_row;
  end if;

  select round(coalesce(sum(allocated_amount), 0), 4)
  into allocated_total
  from public.payment_allocations
  where invoice_id = invoice_row.id
    and status = 'active';

  if allocated_total >= round(invoice_row.total_amount, 4) then
    next_status := 'paid';
  elsif allocated_total > 0 then
    next_status := 'partially_paid';
  elsif invoice_row.due_date < current_date then
    next_status := 'overdue';
  else
    next_status := 'posted';
  end if;

  perform set_config('app.financial_workflow', 'authorized', true);
  update public.invoices
  set status = next_status
  where id = invoice_row.id
  returning * into invoice_row;
  perform set_config('app.financial_workflow', '', true);

  return invoice_row;
end
$$;

create or replace function private.refresh_customer_payment_allocation_state(p_payment_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.payments;
  allocated_total numeric(20,4);
  next_status text;
begin
  select *
  into payment_row
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment not found' using errcode = 'P0002';
  end if;

  select round(coalesce(sum(allocated_amount), 0), 4)
  into allocated_total
  from public.payment_allocations
  where payment_id = payment_row.id
    and status = 'active';

  if payment_row.accounting_state = 'reversed' then
    next_status := 'reversed';
  elsif allocated_total = 0 then
    next_status := 'unallocated';
  elsif allocated_total >= round(payment_row.amount, 4) then
    next_status := 'allocated';
  else
    next_status := 'partially_allocated';
  end if;

  perform set_config('app.financial_workflow', 'authorized', true);
  update public.payments
  set allocation_status = next_status
  where id = payment_row.id
  returning * into payment_row;
  perform set_config('app.financial_workflow', '', true);

  return payment_row;
end
$$;

-- Explicit transition: draft/approved operational documents become eligible
-- for immutable ledger posting only through this audited command.
create or replace function public.prepare_sales_invoice_for_posting(
  p_invoice_id uuid,
  p_reason text default null
)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice_row public.invoices;
begin
  select *
  into invoice_row
  from public.invoices
  where id = p_invoice_id
  for update;

  if not found then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;
  if not (select private.has_company_permission(invoice_row.company_id, 'sales_invoice.create')) then
    raise exception 'Insufficient permission to prepare sales invoices' using errcode = '42501';
  end if;
  if invoice_row.status not in ('draft', 'approved') then
    raise exception 'Only draft or approved invoices can be prepared for posting' using errcode = '55000';
  end if;
  if invoice_row.accounting_state not in ('legacy', 'ready_for_posting') then
    raise exception 'Invoice is already accounted for or excluded from posting' using errcode = '55000';
  end if;
  if invoice_row.approval_status = 'pending' then
    raise exception 'Invoice approval is still pending' using errcode = '55000';
  end if;

  perform set_config('app.change_reason', coalesce(nullif(trim(p_reason), ''), 'Prepared for posting'), true);
  update public.invoices
  set accounting_state = 'ready_for_posting',
      posting_date = coalesce(posting_date, issue_date, current_date)
  where id = invoice_row.id
  returning * into invoice_row;
  perform set_config('app.change_reason', '', true);

  perform private.emit_domain_outbox_event(
    invoice_row.company_id, invoice_row.branch_id, 'sales_invoice', invoice_row.id,
    'sales_invoice.ready_for_posting',
    jsonb_build_object('invoice_number', invoice_row.invoice_number),
    'sales_invoice.ready_for_posting:' || invoice_row.id::text
  );
  return invoice_row;
end
$$;

create or replace function public.request_sales_invoice_approval(
  p_invoice_id uuid,
  p_note text default null
)
returns public.approval_workflows
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice_row public.invoices;
  workflow_row public.approval_workflows;
begin
  select * into invoice_row from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;
  if not (select private.has_company_permission(invoice_row.company_id, 'sales_invoice.create')) then
    raise exception 'Insufficient permission to request invoice approval' using errcode = '42501';
  end if;
  if invoice_row.status <> 'draft' or invoice_row.accounting_state not in ('legacy', 'ready_for_posting') then
    raise exception 'Only an editable draft invoice may be submitted for approval' using errcode = '55000';
  end if;

  insert into public.approval_workflows (
    company_id, entity_type, entity_id, status, requested_by, required_role_code, metadata
  )
  values (
    invoice_row.company_id, 'sales_invoice', invoice_row.id, 'pending',
    (select auth.uid()), 'sales_invoice.approve', jsonb_build_object('note', p_note)
  )
  on conflict (company_id, entity_type, entity_id) do update
  set status = 'pending',
      requested_at = clock_timestamp(),
      requested_by = (select auth.uid()),
      resolved_at = null,
      resolved_by = null,
      metadata = excluded.metadata
  returning * into workflow_row;

  insert into public.approval_actions (workflow_id, company_id, action, action_by, reason)
  values (workflow_row.id, invoice_row.company_id, 'requested', (select auth.uid()), p_note);

  update public.invoices
  set status = 'pending_approval', approval_status = 'pending'
  where id = invoice_row.id
  returning * into invoice_row;

  perform private.emit_domain_outbox_event(
    invoice_row.company_id, invoice_row.branch_id, 'sales_invoice', invoice_row.id,
    'sales_invoice.approval_requested',
    jsonb_build_object('invoice_number', invoice_row.invoice_number, 'workflow_id', workflow_row.id),
    'sales_invoice.approval_requested:' || invoice_row.id::text || ':' || workflow_row.id::text
  );
  return workflow_row;
end
$$;

create or replace function public.approve_sales_invoice(
  p_invoice_id uuid,
  p_reason text
)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice_row public.invoices;
  workflow_row public.approval_workflows;
begin
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'An approval reason is required' using errcode = '22023';
  end if;

  select * into invoice_row from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;
  if not (select private.has_company_permission(invoice_row.company_id, 'sales_invoice.approve')) then
    raise exception 'Insufficient permission to approve sales invoices' using errcode = '42501';
  end if;
  if invoice_row.status <> 'pending_approval' or invoice_row.approval_status <> 'pending' then
    raise exception 'Invoice is not awaiting approval' using errcode = '55000';
  end if;

  select * into workflow_row
  from public.approval_workflows
  where company_id = invoice_row.company_id
    and entity_type = 'sales_invoice'
    and entity_id = invoice_row.id
    and status = 'pending'
  for update;
  if not found then
    raise exception 'No pending approval workflow exists for invoice' using errcode = 'P0002';
  end if;

  update public.approval_workflows
  set status = 'approved', resolved_at = clock_timestamp(), resolved_by = (select auth.uid())
  where id = workflow_row.id;
  insert into public.approval_actions (workflow_id, company_id, action, action_by, reason)
  values (workflow_row.id, invoice_row.company_id, 'approved', (select auth.uid()), p_reason);

  update public.invoices
  set status = 'approved', approval_status = 'approved',
      approved_at = clock_timestamp(), approved_by = (select auth.uid())
  where id = invoice_row.id
  returning * into invoice_row;

  perform private.emit_domain_outbox_event(
    invoice_row.company_id, invoice_row.branch_id, 'sales_invoice', invoice_row.id,
    'sales_invoice.approved',
    jsonb_build_object('invoice_number', invoice_row.invoice_number),
    'sales_invoice.approved:' || invoice_row.id::text
  );
  return invoice_row;
end
$$;

create or replace function public.post_sales_invoice(
  p_invoice_id uuid,
  p_idempotency_key uuid default null,
  p_reason text default null
)
returns public.invoices
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice_row public.invoices;
  client_row public.clients;
  period_row public.accounting_periods;
  journal_row public.journal_entries;
  net_amount numeric(20,4);
  vat_amount numeric(20,4);
  gross_amount numeric(20,4);
  item_count integer;
begin
  select * into invoice_row from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found' using errcode = 'P0002';
  end if;
  if not (select private.has_company_permission(invoice_row.company_id, 'sales_invoice.post')) then
    raise exception 'Insufficient permission to post sales invoices' using errcode = '42501';
  end if;

  if invoice_row.accounting_state = 'posted' then
    if p_idempotency_key is not null and invoice_row.idempotency_key = p_idempotency_key then
      return invoice_row;
    end if;
    raise exception 'Invoice has already been posted' using errcode = '55000';
  end if;
  if invoice_row.accounting_state <> 'ready_for_posting' then
    raise exception 'Invoice must be prepared before posting' using errcode = '55000';
  end if;
  if invoice_row.status not in ('draft', 'approved') then
    raise exception 'Invoice status is not eligible for posting' using errcode = '55000';
  end if;
  if invoice_row.approval_status = 'pending' or invoice_row.approval_status = 'rejected' then
    raise exception 'Invoice approval state is not eligible for posting' using errcode = '55000';
  end if;
  if invoice_row.client_id is null then
    raise exception 'A customer is required before posting a sales invoice' using errcode = '23514';
  end if;

  select * into client_row
  from public.clients
  where id = invoice_row.client_id and company_id = invoice_row.company_id;
  if not found then
    raise exception 'Invoice customer is invalid for this company' using errcode = '23514';
  end if;
  if client_row.sales_blocked or client_row.account_status in ('on_hold', 'closed') then
    raise exception 'Sales are blocked for this customer' using errcode = '55000';
  end if;

  select * into period_row
  from public.accounting_periods
  where company_id = invoice_row.company_id
    and coalesce(invoice_row.posting_date, invoice_row.issue_date, current_date) between start_date and end_date
    and status = 'open'
  order by start_date desc
  limit 1
  for update;
  if not found then
    raise exception 'No open accounting period covers the invoice posting date' using errcode = '55000';
  end if;

  select count(*) into item_count from public.invoice_items where invoice_id = invoice_row.id;
  if item_count = 0 then
    raise exception 'A sales invoice requires at least one line item' using errcode = '23514';
  end if;
  if exists (
    select 1
    from public.invoice_items item
    where item.invoice_id = invoice_row.id
      and (
        coalesce(item.quantity, 0) <= 0
        or coalesce(item.amount, 0) < 0
        or coalesce(item.tax_rate, 0) < 0
        or coalesce(item.tax_rate, 0) > 100
        or coalesce(item.discount, 0) < 0
        or coalesce(item.discount, 0) > 100
      )
  ) then
    raise exception 'Invoice contains invalid quantity, amount, discount, or VAT values' using errcode = '23514';
  end if;

  select calculated.net_amount, calculated.tax_amount, calculated.gross_amount
  into net_amount, vat_amount, gross_amount
  from private.sales_invoice_amounts(invoice_row.id) as calculated;
  if gross_amount <= 0 then
    raise exception 'Invoice total must be greater than zero' using errcode = '23514';
  end if;

  journal_row := public.create_automatic_journal(
    invoice_row.company_id,
    'sales_invoice',
    'sales_invoice',
    invoice_row.id,
    invoice_row.invoice_number,
    coalesce(invoice_row.posting_date, invoice_row.issue_date, current_date),
    coalesce(invoice_row.issue_date, current_date),
    'Sales invoice ' || invoice_row.invoice_number,
    jsonb_build_object('net', net_amount, 'tax', vat_amount, 'gross', gross_amount),
    invoice_row.currency,
    invoice_row.branch_id,
    jsonb_build_object('invoice_number', invoice_row.invoice_number, 'client_id', invoice_row.client_id)
  );

  perform set_config('app.financial_workflow', 'authorized', true);
  perform set_config('app.change_reason', coalesce(nullif(trim(p_reason), ''), 'Sales invoice posted'), true);
  update public.invoices
  set status = 'posted',
      accounting_state = 'posted',
      posting_date = coalesce(posting_date, issue_date, current_date),
      fiscal_year_id = period_row.fiscal_year_id,
      posted_at = clock_timestamp(),
      posted_by = (select auth.uid()),
      posting_journal_entry_id = journal_row.id,
      idempotency_key = coalesce(p_idempotency_key, idempotency_key),
      total_amount = gross_amount,
      tax_amount = vat_amount
  where id = invoice_row.id
  returning * into invoice_row;
  perform set_config('app.financial_workflow', '', true);
  perform set_config('app.change_reason', '', true);

  perform private.emit_domain_outbox_event(
    invoice_row.company_id, invoice_row.branch_id, 'sales_invoice', invoice_row.id,
    'sales_invoice.posted',
    jsonb_build_object('invoice_number', invoice_row.invoice_number, 'journal_entry_id', journal_row.id, 'gross_amount', gross_amount),
    'sales_invoice.posted:' || invoice_row.id::text
  );
  return invoice_row;
end
$$;

create or replace function public.record_customer_payment(
  p_company_id uuid,
  p_customer_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_payment_method text,
  p_settlement_account_id uuid,
  p_reference text default null,
  p_notes text default null,
  p_branch_id uuid default null,
  p_currency text default 'EUR',
  p_idempotency_key uuid default null
)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.payments;
  client_row public.clients;
  settlement_account public.chart_of_accounts;
  receivable_account_id uuid;
  receivable_account public.chart_of_accounts;
  journal_row public.journal_entries;
  payment_number text;
begin
  if p_amount is null or round(p_amount, 4) <= 0 then
    raise exception 'Payment amount must be greater than zero' using errcode = '23514';
  end if;
  if not (select private.has_company_permission(p_company_id, 'customer_payment.record'))
    or not (select private.has_company_permission(p_company_id, 'journal.create'))
    or not (select private.has_company_permission(p_company_id, 'journal.post')) then
    raise exception 'Recording a customer payment requires payment and journal posting permissions' using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    select * into payment_row
    from public.payments
    where company_id = p_company_id and idempotency_key = p_idempotency_key;
    if found then
      return payment_row;
    end if;
  end if;

  select * into client_row from public.clients
  where id = p_customer_id and company_id = p_company_id;
  if not found then
    raise exception 'Customer is invalid for this company' using errcode = '23514';
  end if;

  select * into settlement_account from public.chart_of_accounts
  where id = p_settlement_account_id
    and company_id = p_company_id
    and active
    and posting_allowed;
  if not found then
    raise exception 'A valid active settlement account is required' using errcode = '23514';
  end if;

  receivable_account_id := client_row.default_receivable_account_id;
  if receivable_account_id is null then
    select line.account_id
    into receivable_account_id
    from public.posting_rule_sets rule_set
    join public.posting_rule_lines line on line.rule_set_id = rule_set.id
    where rule_set.company_id = p_company_id
      and rule_set.event_type = 'customer_payment'
      and rule_set.active
      and rule_set.effective_from <= coalesce(p_payment_date, current_date)
      and (rule_set.effective_until is null or rule_set.effective_until >= coalesce(p_payment_date, current_date))
      and line.side = 'credit'
      and line.amount_component = 'gross'
    order by rule_set.version desc, rule_set.effective_from desc, line.line_number
    limit 1;
  end if;
  select * into receivable_account from public.chart_of_accounts
  where id = receivable_account_id
    and company_id = p_company_id
    and active
    and posting_allowed;
  if not found then
    raise exception 'No valid receivable account is mapped for customer payments' using errcode = '23514';
  end if;

  payment_number := private.next_financial_document_number(
    p_company_id, p_branch_id, 'customer_payment', 'PAY-', coalesce(p_payment_date, current_date)
  );
  insert into public.payments (
    user_id, company_id, branch_id, client_id, payment_number, amount, payment_date,
    payment_method, bank_reference, notes, currency, allocation_status, idempotency_key, accounting_state,
    settlement_account_id
  )
  values (
    (select auth.uid()), p_company_id, p_branch_id, p_customer_id, payment_number, round(p_amount, 4),
    coalesce(p_payment_date, current_date), nullif(trim(p_payment_method), ''), nullif(trim(p_reference), ''),
    p_notes, upper(coalesce(p_currency, 'EUR')), 'unallocated', p_idempotency_key, 'ready_for_posting',
    p_settlement_account_id
  )
  returning * into payment_row;

  journal_row := public.create_journal_entry(
    p_company_id,
    payment_row.payment_date,
    payment_row.payment_date,
    'Customer payment ' || payment_row.payment_number,
    payment_row.payment_number,
    payment_row.currency,
    1,
    p_branch_id,
    'automatic'
  );
  update public.journal_entries
  set source_type = 'customer_payment',
      source_id = payment_row.id,
      source_key = payment_row.payment_number,
      metadata = jsonb_build_object('payment_number', payment_row.payment_number, 'customer_id', p_customer_id)
  where id = journal_row.id;
  insert into public.journal_entry_lines (
    journal_entry_id, company_id, line_number, account_id, description,
    debit, credit, transaction_currency, transaction_amount, branch_id, created_by
  )
  values
    (journal_row.id, p_company_id, 1, settlement_account.id, 'Customer payment settlement',
      payment_row.amount, 0, payment_row.currency, payment_row.amount, p_branch_id, (select auth.uid())),
    (journal_row.id, p_company_id, 2, receivable_account.id, 'Customer payment receivable allocation',
      0, payment_row.amount, payment_row.currency, payment_row.amount, p_branch_id, (select auth.uid()));
  journal_row := public.post_journal_entry(journal_row.id, 'Customer payment recorded');

  perform set_config('app.financial_workflow', 'authorized', true);
  update public.payments
  set accounting_state = 'posted',
      posted_at = clock_timestamp(),
      posting_journal_entry_id = journal_row.id
  where id = payment_row.id
  returning * into payment_row;
  perform set_config('app.financial_workflow', '', true);

  perform private.emit_domain_outbox_event(
    payment_row.company_id, payment_row.branch_id, 'customer_payment', payment_row.id,
    'customer_payment.recorded',
    jsonb_build_object('payment_number', payment_row.payment_number, 'amount', payment_row.amount, 'journal_entry_id', journal_row.id),
    'customer_payment.recorded:' || payment_row.id::text
  );
  return payment_row;
end
$$;

create or replace function public.allocate_customer_payment(
  p_payment_id uuid,
  p_invoice_id uuid,
  p_amount numeric,
  p_allocation_date date default current_date
)
returns public.payment_allocations
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_row public.payments;
  invoice_row public.invoices;
  allocation_row public.payment_allocations;
  available_amount numeric(20,4);
  outstanding_amount numeric(20,4);
begin
  if p_amount is null or round(p_amount, 4) <= 0 then
    raise exception 'Allocation amount must be greater than zero' using errcode = '23514';
  end if;
  select * into payment_row from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Customer payment not found' using errcode = 'P0002';
  end if;
  if not (select private.has_company_permission(payment_row.company_id, 'customer_payment.allocate')) then
    raise exception 'Insufficient permission to allocate customer payments' using errcode = '42501';
  end if;
  if payment_row.accounting_state <> 'posted' or payment_row.reversed_at is not null then
    raise exception 'Only posted, unreversed customer payments can be allocated' using errcode = '55000';
  end if;

  select * into invoice_row from public.invoices where id = p_invoice_id for update;
  if not found or invoice_row.company_id <> payment_row.company_id then
    raise exception 'Invoice is invalid for this customer payment' using errcode = '23514';
  end if;
  if invoice_row.client_id is distinct from payment_row.client_id then
    raise exception 'Payment and invoice must belong to the same customer' using errcode = '23514';
  end if;
  if invoice_row.accounting_state <> 'posted' or invoice_row.status in ('reversed', 'credited', 'cancelled') then
    raise exception 'Only posted receivable invoices can receive allocations' using errcode = '55000';
  end if;
  if invoice_row.currency <> payment_row.currency then
    raise exception 'Payment and invoice currency must match before allocation' using errcode = '23514';
  end if;

  select round(payment_row.amount - coalesce(sum(allocated_amount), 0), 4)
  into available_amount
  from public.payment_allocations
  where payment_id = payment_row.id and status = 'active';
  select round(invoice_row.total_amount - coalesce(sum(allocated_amount), 0), 4)
  into outstanding_amount
  from public.payment_allocations
  where invoice_id = invoice_row.id and status = 'active';

  if round(p_amount, 4) > available_amount then
    raise exception 'Allocation exceeds the unallocated payment amount' using errcode = '23514';
  end if;
  if round(p_amount, 4) > outstanding_amount then
    raise exception 'Allocation exceeds the invoice outstanding amount' using errcode = '23514';
  end if;

  insert into public.payment_allocations (
    company_id, branch_id, payment_id, invoice_id, allocated_amount,
    allocation_date, currency, created_by
  )
  values (
    payment_row.company_id, payment_row.branch_id, payment_row.id, invoice_row.id,
    round(p_amount, 4), coalesce(p_allocation_date, current_date), payment_row.currency, (select auth.uid())
  )
  returning * into allocation_row;

  perform private.refresh_customer_payment_state(invoice_row.id);
  perform private.refresh_customer_payment_allocation_state(payment_row.id);
  perform private.emit_domain_outbox_event(
    payment_row.company_id, payment_row.branch_id, 'customer_payment', payment_row.id,
    'customer_payment.allocated',
    jsonb_build_object('invoice_id', invoice_row.id, 'allocated_amount', allocation_row.allocated_amount),
    'customer_payment.allocated:' || allocation_row.id::text
  );
  return allocation_row;
end
$$;

create or replace function public.unallocate_customer_payment(
  p_allocation_id uuid,
  p_reason text
)
returns public.payment_allocations
language plpgsql
security definer
set search_path = ''
as $$
declare
  allocation_row public.payment_allocations;
begin
  if nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'A reason is required to unallocate a customer payment' using errcode = '22023';
  end if;

  select * into allocation_row
  from public.payment_allocations
  where id = p_allocation_id
  for update;
  if not found then
    raise exception 'Payment allocation not found' using errcode = 'P0002';
  end if;
  if not (select private.has_company_permission(allocation_row.company_id, 'customer_payment.allocate')) then
    raise exception 'Insufficient permission to unallocate customer payments' using errcode = '42501';
  end if;
  if allocation_row.status <> 'active' then
    raise exception 'Only active allocations can be unallocated' using errcode = '55000';
  end if;

  update public.payment_allocations
  set status = 'reversed',
      reversed_at = clock_timestamp(),
      reversed_by = (select auth.uid()),
      reversal_reason = p_reason
  where id = allocation_row.id
  returning * into allocation_row;

  perform private.refresh_customer_payment_state(allocation_row.invoice_id);
  perform private.refresh_customer_payment_allocation_state(allocation_row.payment_id);
  perform private.emit_domain_outbox_event(
    allocation_row.company_id, allocation_row.branch_id, 'customer_payment', allocation_row.payment_id,
    'customer_payment.unallocated',
    jsonb_build_object('invoice_id', allocation_row.invoice_id, 'allocation_id', allocation_row.id, 'reason', p_reason),
    'customer_payment.unallocated:' || allocation_row.id::text
  );
  return allocation_row;
end
$$;

-- Allocation-based open items. This is intentionally a security-invoker view
-- so existing tenant RLS policies remain authoritative.
create or replace view public.customer_receivable_open_items
with (security_invoker = true)
as
select
  invoice.company_id,
  invoice.branch_id,
  invoice.client_id,
  invoice.id as invoice_id,
  invoice.invoice_number,
  invoice.issue_date,
  invoice.due_date,
  invoice.currency,
  round(invoice.total_amount, 4) as original_amount,
  round(coalesce(sum(allocation.allocated_amount) filter (where allocation.status = 'active'), 0), 4) as allocated_amount,
  round(invoice.total_amount - coalesce(sum(allocation.allocated_amount) filter (where allocation.status = 'active'), 0), 4) as outstanding_amount,
  greatest(current_date - invoice.due_date, 0) as days_overdue,
  case
    when invoice.due_date >= current_date then 'not_due'
    when current_date - invoice.due_date between 1 and 30 then '1_30'
    when current_date - invoice.due_date between 31 and 60 then '31_60'
    when current_date - invoice.due_date between 61 and 90 then '61_90'
    else '90_plus'
  end as aging_bucket
from public.invoices invoice
left join public.payment_allocations allocation
  on allocation.invoice_id = invoice.id
group by
  invoice.company_id, invoice.branch_id, invoice.client_id, invoice.id,
  invoice.invoice_number, invoice.issue_date, invoice.due_date, invoice.currency, invoice.total_amount
having invoice.accounting_state = 'posted'
  and invoice.status not in ('reversed', 'credited', 'cancelled')
  and round(invoice.total_amount - coalesce(sum(allocation.allocated_amount) filter (where allocation.status = 'active'), 0), 4) <> 0;

grant select on public.customer_receivable_open_items to authenticated;

revoke all on function private.next_financial_document_number(uuid, uuid, text, text, date) from public;
revoke all on function private.sales_invoice_amounts(uuid) from public;
revoke all on function private.refresh_customer_payment_state(uuid) from public;
revoke all on function private.refresh_customer_payment_allocation_state(uuid) from public;

revoke all on function public.prepare_sales_invoice_for_posting(uuid, text) from public;
revoke all on function public.request_sales_invoice_approval(uuid, text) from public;
revoke all on function public.approve_sales_invoice(uuid, text) from public;
revoke all on function public.post_sales_invoice(uuid, uuid, text) from public;
revoke all on function public.record_customer_payment(uuid, uuid, date, numeric, text, uuid, text, text, uuid, text, uuid) from public;
revoke all on function public.allocate_customer_payment(uuid, uuid, numeric, date) from public;
revoke all on function public.unallocate_customer_payment(uuid, text) from public;

grant execute on function public.prepare_sales_invoice_for_posting(uuid, text) to authenticated;
grant execute on function public.request_sales_invoice_approval(uuid, text) to authenticated;
grant execute on function public.approve_sales_invoice(uuid, text) to authenticated;
grant execute on function public.post_sales_invoice(uuid, uuid, text) to authenticated;
grant execute on function public.record_customer_payment(uuid, uuid, date, numeric, text, uuid, text, text, uuid, text, uuid) to authenticated;
grant execute on function public.allocate_customer_payment(uuid, uuid, numeric, date) to authenticated;
grant execute on function public.unallocate_customer_payment(uuid, text) to authenticated;

comment on table public.payment_allocations is
  'Allocation ledger for posted customer payments. Payment status and customer balances are derived from active allocations.';
comment on view public.customer_receivable_open_items is
  'Allocation-based customer aging source. It contains only posted journal-backed receivable invoices.';
