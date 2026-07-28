# Phase E1 — Transactional POS foundation

This release establishes the first safe, server-side POS completion path. It is
**fiscal-ready**, not certified for Kosovo TAK electronic fiscalization.

## Transaction boundary

`public.complete_pos_sale` is the only supported command for completing a POS
sale. It requires an idempotency key and performs the following in one database
transaction:

1. Authorizes the company member and terminal use.
2. Requires the `transactional_pos_enabled` company flag.
3. Reserves the command key in `pos_command_idempotency`.
4. Delegates to the private completion command.
5. Creates the sales invoice, POS order, POS lines, payment records and payment
   allocations.
6. Posts the sales and payment journals through the Phase B/C services.
7. Makes the POS order immutable, writes the receipt snapshot, audit events and
   outbox event.

The reservation is inside the same transaction. A double click, browser retry
or replay with the same company and idempotency key returns the existing
canonical sale rather than creating another invoice.

## Deliberate safeguards

- POS completion is feature-flagged and is off by default.
- An active configured terminal is required; the command will not invent a
  branch, fiscal location, warehouse or terminal.
- Products with `track_stock = true` are blocked until the Phase D stock-ledger
  command is wired into this repository. Updating `products.stock_quantity`
  directly would corrupt stock valuation and COGS.
- The fiscal status is `not_configured`. There is no live TAK provider,
  certificate, payload format or certification claim in this release.
- Draft POS documents remain available during the transition, but they are not
  posted financial records.

## Controlled rollout

Before enabling transactional POS for a company, an administrator must:

1. Create and activate its branch, fiscal location, warehouse and POS terminal.
2. Map the terminal's allowed payment methods and effective posting rules.
3. Assign `pos.complete`, `pos.terminal.use`, sales-posting, payment and
   journal-posting permissions to the cashier role.
4. Confirm that every saleable product is either non-stock or backed by the
   stock-ledger service.
5. Enable the company flag only after a test transaction and journal review:

   ```sql
   insert into public.company_feature_flags (company_id, flag, enabled)
   values ('<company-id>', 'transactional_pos_enabled', true)
   on conflict (company_id, flag) do update set enabled = excluded.enabled;
   ```

## Next Phase E gates

The following are intentionally not enabled by E1: cashier shifts, persisted
held orders, returns and refunds, fiscal-provider submission, encrypted offline
queue and fiscal reconciliation. Each requires its own migration, feature flag,
permissions, tests and a controlled rollout.

## Rollback

Do not delete completed POS records or journals. To pause rollout, disable the
company feature flag. Database changes are additive; the pre-E1 local database
backup is retained at deployment time. Any business correction after posting
must use a return, refund, credit note or reversal workflow.
