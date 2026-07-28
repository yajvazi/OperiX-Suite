# OperiX Phase E implementation status

Date: 2026-07-28

OperiX now has a tenant-safe Phase E foundation for transactional POS,
cashier shifts, persisted held orders, fiscal-provider isolation, registered
devices, and encrypted offline queues. This document records the exact gate
status and intentionally does not claim Kosovo TAK certification.

## Audit summary

The implementation reuses:

- Phase A companies, branches, warehouses, fiscal locations, terminals,
  permissions, feature flags, audit events, and outbox events.
- Phase B accounting periods, chart of accounts, posting rules, journal
  entries, journal lines, and balanced-posting constraints.
- Phase C invoice, customer payment, cash/bank, and receivable foundations.
- The existing POS product search, category browsing, cart, customer picker,
  discount controls, document type selection, and receipt/print screens.

The repository does **not** contain the Phase D stock-movement ledger,
weighted-average cost service, stock-issue command, or original-cost
restoration command described by the Phase E prerequisite. Account mappings
and inventory UI labels exist, but they are not a substitute for an immutable
inventory ledger. Consequently, stock-tracked products are rejected by
`complete_pos_sale` until those upstream services exist.

## Requirements matrix

| Area | Status | Evidence / remaining work |
| --- | --- | --- |
| Atomic POS sale command | Partial | `complete_pos_sale` creates immutable order, lines, payment allocations, invoice/payment accounting, receipt snapshot, audit, outbox, and fiscal aggregate in one transaction. Stock-tracked lines are deliberately blocked because the Phase D service is absent. |
| Idempotent completion | Complete | UUID idempotency is scoped by company, terminal, user, and command; database uniqueness returns the prior result. |
| Completed-sale immutability | Complete | Controlled mutation triggers reject direct update/delete outside authorized workflows. |
| Terminal validation | Complete foundation | Company, branch, fiscal location, terminal, warehouse, and configuration are validated. Checkout loads active terminals, requires an explicit selection when more than one exists, and fails closed when none is provisioned. No production terminal has been fabricated. |
| Cashier shifts | Complete foundation | Open, movements, closing count, approval, immutable close, and reasoned reopen commands exist. Enforcement remains feature-flagged. |
| Persisted held orders | Complete | Server-persisted hold/resume/cancel/expire commands replace browser session storage and use optimistic versions. |
| Mixed payments | Partial | Canonical allocation schema and total/change validation exist. Processor/card-terminal adapters and a dedicated mixed-payment dialog remain future integration work. |
| Customer credit | Partial | Payment method maps to receivable behavior; full credit-limit/overdue approval policy requires the missing upstream customer-credit command. |
| Returns and refunds | Blocked | Cannot safely restore original issue cost or stock without the Phase D stock ledger. The original sale is protected from mutation. |
| Canonical receipt snapshot | Complete foundation | A versioned immutable JSON snapshot is generated from the completed aggregate and used as the reproducible receipt source. |
| Fiscal provider abstraction | Complete foundation | Typed provider contract, deterministic mock scenarios, immutable attempts, reconciliation events, and disabled Kosovo adapter shell exist. |
| Kosovo EFS provider | Requires official fiscal specification | No endpoints, payloads, signatures, certificates, QR rules, or certification claims are fabricated. |
| Offline encrypted queue | Complete foundation | Non-extractable AES-GCM device key, authenticated encryption, checksums, ordered IndexedDB queue, and tamper tests exist. |
| Offline device/sync server path | Complete foundation | Revocable device identity, batches/items, integrity validation, idempotency, typed conflicts, and replay through `complete_pos_sale` exist. |
| Offline checkout UI | Partial | Infrastructure exists but remains disabled; activation requires terminal provisioning, device-pairing UX, policy configuration, and upstream stock handling. |
| Restaurant extension | Missing / out of active retail scope | Feature flag exists; no restaurant operational model was introduced. |
| Historical POS migration | Requires accountant review | Existing records are preserved. Terminal, shift, inventory, or fiscal history is not fabricated. |

## Acceptance gates

### E1 — Transactional POS: partial

Passes for non-stock-tracked lines. The stock/COGS invariant cannot pass until
Phase D provides an immutable stock issue and costing API.

### E2 — Terminals and shifts: foundation complete

The database commands and immutability rules pass. Production enablement still
requires real terminals, assignments, opening shifts, and company approval.

### E3 — Returns and refunds: blocked

Implementing a financial-only return would violate the required inventory and
original-cost invariants. This gate remains blocked instead of creating a
weaker corrective path.

### E4 — Fiscal-ready architecture: foundation complete

The POS depends on a generic fiscal aggregate/provider boundary. The mock
provider covers deterministic success and failure behavior. OperiX is
fiscal-ready architecture, **not TAK-certified**.

### E5 — Offline POS: partial and disabled

Encryption, device revocation, synchronization records, integrity validation,
idempotent replay, and conflicts exist. The feature remains off until E1 stock
integration, terminal provisioning, device-pairing UX, and security review are
complete.

### E6 — Migration and release: not complete

No historical terminal or fiscal data was invented. Feature flags remain off.
Production release needs an approved backup/rollback exercise, RLS review,
real-terminal configuration, and the blocked upstream services.

## Safe next order

1. Implement the missing Phase D stock ledger, stock issue, weighted-average
   costing, and original-cost restoration commands.
2. Integrate those commands inside `complete_pos_sale` and add reconciliation
   tests for stock, COGS, and inventory control accounts.
3. Implement return/refund commands using the same inventory and accounting
   services.
4. Provision real terminals and test cashier shifts with company-approved
   feature flags.
5. Add device-pairing and offline queue management UI, then complete the
   offline security review.
6. Integrate an official provider only after current specifications,
   credentials, certificates, and certification test cases are supplied.

## Rollback

Pre-migration database backups were created in `/tmp` before each applied
batch. Phase E flags default to disabled, so the new paths can remain dormant
without deleting or rewriting existing operational records. Rollback should
restore the matching backup in a maintenance window rather than manually
deleting immutable financial or fiscal rows.

## Verification record

The following gates passed on 2026-07-28:

- Live PostgreSQL Phase E schema/RLS invariant checks.
- Invoice web repository lint (warnings only, no errors).
- Invoice web TypeScript type check.
- Invoice web unit tests: 14 passing.
- Invoice web production build.
- Fiscalization package type check and tests: 4 passing.
- Offline POS package type check and encryption/queue tests: 3 passing.
- `git diff --check`.
