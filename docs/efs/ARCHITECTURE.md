# EFS architecture

```text
Mobile / Web
    │ authenticated request
    ▼
Commercial transaction
    ├── VAT engine (single source of tax values)
    ├── Accounting engine (single posting)
    └── Inventory movement (single stock effect)
              │
              ▼
FiscalizationProvider
              │
              ├── MockTakServer (local deterministic tests only)
              └── KosovoEFSProvider (blocked adapter until exact TAK contract)
                          │
                          ├── FiscalKeyProvider (KMS/HSM/Vault boundary)
                          ├── Fiscal document schema/validator
                          ├── receipt model/renderer
                          └── KosovoTAKClient boundary (not configured)
```

The fiscal domain is in `packages/fiscalization`. Database persistence is tenant-scoped through `company_id`, which is the repository's organization boundary. `fiscal_installations` maps a company to branch/business unit, fiscal location, and POS terminal. Certificate rows contain metadata and an opaque secret reference only.

The backend guard `public.assert_efs_production_ready` always refuses production until the exact OperiX build is certified, taxpayer configuration exists, the installation is active, a valid certificate and secure key provider exist, and explicit feature flags are enabled. The function contains a deliberate certification gate that remains false before TAK approval.

## Invariants

1. Accounting and fiscalization have separate state fields.
2. A request sent to TAK is not an accepted fiscal document.
3. A return, correction, or cancellation references original history; it does not edit it.
4. Source transaction and idempotency uniqueness are database constraints.
5. Private signing material never enters mobile storage, browser storage, normal tables, logs, or evidence exports.
6. Mock responses are test evidence only and never prove TAK acceptance.
