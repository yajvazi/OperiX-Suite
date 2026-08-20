# Fiscal flow

## Sale

1. Complete the commercial invoice/POS transaction in its existing transaction.
2. Read validated VAT and rounded totals from the shared VAT/commercial model.
3. Post accounting and inventory exactly once.
4. Create or reuse the fiscal aggregate using a source transaction ID and idempotency key.
5. Validate company, branch, POS, operator, payment, items, totals, and installation status on the backend.
6. Ask the `FiscalKeyProvider` to sign through a server-side secret boundary when the TAK contract is configured.
7. Submit through an isolated documented TAK client.
8. Persist request/response fingerprints and the sanitized acknowledgement.
9. Mark the fiscal transaction final only after the documented successful response.

## State separation

`invoice_status = issued`, `accounting_status = posted`, and `fiscalization_status = pending` are valid at the same time. Fiscal states are explicit in the package state machine and are not overloaded into invoice status.

## Returns and corrections

The accepted sale remains immutable. A return, correction, or cancellation is a new source event with an original fiscal document reference. The exact allowable transaction types and TAK references remain subject to the current TAK technical contract.

## Failure

Timeouts and service failures become retryable states, not accepted states. Duplicate submissions use the source/idempotency uniqueness boundary and must be reconciled rather than blindly submitted again.
