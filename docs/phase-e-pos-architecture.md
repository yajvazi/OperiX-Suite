# Phase E POS architecture

## Online sale boundary

The browser submits a lightweight checkout command with a UUID idempotency key.
It does not insert invoices, payments, journals, inventory rows, fiscal rows,
or audit events directly.

```text
POS UI
  -> complete_pos_sale
     -> access, terminal, shift, period, price, tax, and payment validation
     -> immutable POS order and lines
     -> payment allocations
     -> accounting posting
     -> receipt snapshot
     -> fiscal aggregate
     -> audit event
     -> outbox events
  -> one committed result or one rollback
```

Until a Phase D stock ledger exists, stock-tracked lines fail before financial
records are created. This protects inventory and COGS integrity.

## Idempotency

Completion uses a UUID scoped by company, terminal, user, and command. A unique
database constraint prevents duplicate orders caused by double-clicks, browser
retries, timeouts after commit, multiple tabs, or offline replay.

## Cashier shifts

Shift commands are the only supported mutation path:

```text
open -> active -> closing -> closed
                         -> reopened (permission + mandatory reason)
```

Movements identify opening float, cash sale/refund, cash in/out, safe drop,
transfer, correction, and closing count. Closed shifts and their events remain
immutable.

## Held orders

Held carts are stored in `held_orders`, not browser session storage. The
snapshot contains checkout state, company/branch/terminal/warehouse, cashier,
customer, timestamps, and a version. Resume and cancel use version checks to
prevent one device overwriting another.

## Fiscal boundary

The POS creates a provider-neutral `fiscal_transactions` aggregate. Provider
calls create append-only `fiscal_submission_attempts`; reconciliation changes
create append-only `fiscal_reconciliation_events`.

Available adapters:

- `MockFiscalProvider`: deterministic development/test scenarios.
- `KosovoEfsProvider`: disabled shell only.

The Kosovo adapter cannot be enabled without official current payload,
authentication, certificate, endpoint, QR, offline, correction, cancellation,
and certification specifications.

## Offline boundary

The device queues only encrypted records:

```text
canonical envelope
  -> SHA-256 integrity checksum
  -> AES-256-GCM with non-extractable device key and authenticated metadata
  -> encrypted IndexedDB record
```

On synchronization:

```text
registered device
  -> canonical payload + checksum validation
  -> configuration and terminal validation
  -> idempotency validation
  -> normal complete_pos_sale command
  -> completed result or typed conflict/rejection
```

There is no weaker offline posting command. Revoked devices cannot create
batches or synchronize. Offline feature flags remain disabled by default.

## Operational safety

- Do not enable `transactional_pos_enabled` for stock-tracked catalogues until
  Phase D stock posting is implemented and reconciled.
- Do not enable offline sales until device pairing, policy configuration,
  conflict UI, security review, and stock handling pass.
- Do not enable a live fiscal provider until official integration and
  certification requirements are available.
- Never edit or delete completed sales, fiscal attempts, or closed shifts.

