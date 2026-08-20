-- Repair issued sales invoices that were saved before the canonical posting
-- workflow was enabled. Drafts and non-invoice commercial documents are not
-- included.

create or replace function public.repair_unposted_sales_invoices(
  p_company_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  invoice_row public.invoices;
  original_status text;
  posted_count integer := 0;
  skipped_count integer := 0;
  failures jsonb := '[]'::jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_company_id is null or not public.can_access_company(p_company_id) then
    raise exception 'You do not have access to this company' using errcode = '42501';
  end if;
  if not (select private.has_company_permission(p_company_id, 'sales_invoice.post')) then
    raise exception 'Insufficient permission to repair sales invoice posting' using errcode = '42501';
  end if;

  for invoice_row in
    select *
    from public.invoices invoice
    where invoice.company_id = p_company_id
      -- Read newer commercial-document columns through JSON so this repair
      -- also works on installations that have the accounting columns but have
      -- not yet applied the commercial-document extension.
      and upper(coalesce(to_jsonb(invoice)->>'commercial_document_type', invoice.type, 'INVOICE')) = 'INVOICE'
      and lower(coalesce(invoice.accounting_state, 'legacy')) in ('legacy', 'ready_for_posting')
      and (
        lower(coalesce(invoice.status::text, '')) in ('sent', 'paid', 'overdue', 'partially_paid')
        or upper(coalesce(to_jsonb(invoice)->>'commercial_status', '')) in ('ISSUED', 'PAID', 'OVERDUE', 'PARTIALLY_PAID', 'SENT', 'VIEWED')
      )
    order by invoice.issue_date nulls first, invoice.created_at nulls first
  loop
    begin
      original_status := lower(invoice_row.status::text);

      -- The historical lifecycle used sent/paid/overdue as operational
      -- statuses. The posting command accepts an editable state, so move the
      -- row into that state inside this transaction before posting it.
      perform set_config('app.financial_workflow', 'authorized', true);
      update public.invoices
      set accounting_state = 'ready_for_posting',
          posting_date = coalesce(posting_date, issue_date, current_date),
          status = case
            when original_status in ('draft', 'approved') then status
            else 'draft'::public.invoice_status
          end
      where id = invoice_row.id;
      perform set_config('app.financial_workflow', '', true);

      -- Some legacy imports stored a customer from another company or no
      -- customer at all. Keep the sale in the correct company by resolving
      -- those records to that company's walk-in customer before posting.
      if not exists (
        select 1
        from public.clients client
        where client.id = invoice_row.client_id
          and client.company_id = p_company_id
      ) then
        perform set_config('app.financial_workflow', 'authorized', true);
        update public.invoices
        set client_id = private.ensure_pos_walk_in_customer(p_company_id)
        where id = invoice_row.id;
        perform set_config('app.financial_workflow', '', true);
      end if;

      perform public.post_sales_invoice(
        invoice_row.id,
        gen_random_uuid(),
        'Repair issued invoice ledger posting'
      );

      -- Preserve payment/overdue state after the invoice has been posted.
      -- For sent invoices, the posting command's posted state is the correct
      -- final state and the commercial trigger marks it as issued.
      if original_status in ('paid', 'overdue', 'partially_paid') then
        perform set_config('app.financial_workflow', 'authorized', true);
        update public.invoices
        set status = original_status::public.invoice_status
        where id = invoice_row.id;
        perform set_config('app.financial_workflow', '', true);
      end if;

      posted_count := posted_count + 1;
    exception when others then
      perform set_config('app.financial_workflow', '', true);
      skipped_count := skipped_count + 1;
      failures := failures || jsonb_build_array(jsonb_build_object(
        'invoice_id', invoice_row.id,
        'invoice_number', invoice_row.invoice_number,
        'message', sqlerrm
      ));
    end;
  end loop;

  return jsonb_build_object(
    'posted', posted_count,
    'skipped', skipped_count,
    'failures', failures
  );
end
$$;

revoke all on function public.repair_unposted_sales_invoices(uuid) from public, anon;
grant execute on function public.repair_unposted_sales_invoices(uuid) to authenticated;

comment on function public.repair_unposted_sales_invoices(uuid) is
  'Posts eligible issued sales invoices that predate the canonical ledger posting workflow; drafts are intentionally excluded.';

create or replace function public.repair_unposted_customer_payments(
  p_company_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  payment_row public.payments;
  client_row public.clients;
  settlement_account public.chart_of_accounts;
  receivable_account public.chart_of_accounts;
  receivable_account_id uuid;
  journal_row public.journal_entries;
  posted_count integer := 0;
  skipped_count integer := 0;
  failures jsonb := '[]'::jsonb;
begin
  if actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_company_id is null or not public.can_access_company(p_company_id) then
    raise exception 'You do not have access to this company' using errcode = '42501';
  end if;
  if not (select private.has_company_permission(p_company_id, 'customer_payment.record'))
     or not (select private.has_company_permission(p_company_id, 'journal.create'))
     or not (select private.has_company_permission(p_company_id, 'journal.post')) then
    raise exception 'Insufficient permission to repair customer payment posting' using errcode = '42501';
  end if;

  for payment_row in
    select *
    from public.payments payment
    where payment.company_id = p_company_id
      and lower(coalesce(payment.accounting_state, 'legacy')) in ('legacy', 'ready_for_posting')
      and payment.posting_journal_entry_id is null
      and payment.reversed_at is null
    order by payment.payment_date nulls first, payment.created_at nulls first
  loop
    begin
      select * into client_row
      from public.clients
      where id = payment_row.client_id
        and company_id = payment_row.company_id;
      if not found then
        -- Legacy payments can reference a customer that was imported under a
        -- different company. Resolve them to the local walk-in customer so
        -- the settlement is posted to the correct tenant ledger.
        perform set_config('app.financial_workflow', 'authorized', true);
        update public.payments
        set client_id = private.ensure_pos_walk_in_customer(p_company_id)
        where id = payment_row.id;
        perform set_config('app.financial_workflow', '', true);

        select * into client_row
        from public.clients
        where id = (select client_id from public.payments where id = payment_row.id)
          and company_id = payment_row.company_id;
      end if;
      if not found then
        raise exception 'Customer is invalid for this payment' using errcode = '23514';
      end if;

      select * into settlement_account
      from public.chart_of_accounts
      where id = payment_row.settlement_account_id
        and company_id = p_company_id
        and active and posting_allowed;
      if not found then
        select * into settlement_account
        from public.chart_of_accounts
        where company_id = p_company_id
          and code = case when lower(coalesce(payment_row.payment_method, '')) = 'cash' then '1010' else '1020' end
          and active and posting_allowed
        limit 1;
      end if;
      if not found then
        raise exception 'No valid settlement account is mapped for payment %', payment_row.payment_number using errcode = '23514';
      end if;

      receivable_account_id := client_row.default_receivable_account_id;
      if receivable_account_id is null then
        select line.account_id into receivable_account_id
        from public.posting_rule_sets rule_set
        join public.posting_rule_lines line on line.rule_set_id = rule_set.id
        where rule_set.company_id = p_company_id
          and rule_set.event_type = 'customer_payment'
          and rule_set.active
          and rule_set.effective_from <= coalesce(payment_row.payment_date, current_date)
          and (rule_set.effective_until is null or rule_set.effective_until >= coalesce(payment_row.payment_date, current_date))
          and line.side = 'credit'
          and line.amount_component = 'gross'
        order by rule_set.version desc, rule_set.effective_from desc, line.line_number
        limit 1;
      end if;

      select * into receivable_account
      from public.chart_of_accounts
      where id = receivable_account_id
        and company_id = p_company_id
        and active and posting_allowed;
      if not found then
        raise exception 'No valid receivable account is mapped for payment %', payment_row.payment_number using errcode = '23514';
      end if;

      journal_row := public.create_journal_entry(
        p_company_id,
        coalesce(payment_row.payment_date, current_date),
        coalesce(payment_row.payment_date, current_date),
        'Customer payment ' || payment_row.payment_number,
        payment_row.payment_number,
        upper(coalesce(payment_row.currency, 'EUR')),
        coalesce(payment_row.exchange_rate, 1),
        payment_row.branch_id,
        'automatic'
      );
      perform set_config('app.financial_workflow', 'authorized', true);
      update public.journal_entries
      set source_type = 'customer_payment',
          source_id = payment_row.id,
          source_key = payment_row.payment_number,
          metadata = jsonb_build_object('payment_number', payment_row.payment_number, 'customer_id', payment_row.client_id)
      where id = journal_row.id;
      perform set_config('app.financial_workflow', '', true);

      insert into public.journal_entry_lines (
        journal_entry_id, company_id, line_number, account_id, description,
        debit, credit, transaction_currency, transaction_amount, branch_id, created_by
      ) values
        (journal_row.id, p_company_id, 1, settlement_account.id, 'Customer payment settlement',
          payment_row.amount, 0, upper(coalesce(payment_row.currency, 'EUR')), payment_row.amount, payment_row.branch_id, actor_id),
        (journal_row.id, p_company_id, 2, receivable_account.id, 'Customer payment receivable allocation',
          0, payment_row.amount, upper(coalesce(payment_row.currency, 'EUR')), payment_row.amount, payment_row.branch_id, actor_id);

      journal_row := public.post_journal_entry(journal_row.id, 'Customer payment repaired');
      perform set_config('app.financial_workflow', 'authorized', true);
      update public.payments
      set accounting_state = 'posted',
          posted_at = clock_timestamp(),
          posting_journal_entry_id = journal_row.id,
          settlement_account_id = settlement_account.id
      where id = payment_row.id;
      perform set_config('app.financial_workflow', '', true);
      posted_count := posted_count + 1;
    exception when others then
      perform set_config('app.financial_workflow', '', true);
      skipped_count := skipped_count + 1;
      failures := failures || jsonb_build_array(jsonb_build_object(
        'payment_id', payment_row.id,
        'payment_number', payment_row.payment_number,
        'message', sqlerrm
      ));
    end;
  end loop;

  return jsonb_build_object(
    'posted', posted_count,
    'skipped', skipped_count,
    'failures', failures
  );
end
$$;

revoke all on function public.repair_unposted_customer_payments(uuid) from public, anon;
grant execute on function public.repair_unposted_customer_payments(uuid) to authenticated;

comment on function public.repair_unposted_customer_payments(uuid) is
  'Posts legacy customer payments that have no journal entry; reversals and already-posted payments are excluded.';
