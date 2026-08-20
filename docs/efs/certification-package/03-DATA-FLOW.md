# Data flow

```text
Authenticated operator
  → commercial invoice/POS
  → shared VAT totals
  → accounting journal + inventory movement
  → fiscal aggregate/idempotency key
  → server-side validation/signing boundary
  → documented TAK interface (pending input)
  → sanitized acknowledgement + append-only event
  → canonical receipt model / mobile / web / print
```

Only non-secret metadata and fingerprints are stored in EFS evidence. Raw keys, credentials, and unredacted provider secrets are not data-flow outputs.
