# Phase A — Compliance foundation

Implemented on 2026-07-27 as an additive foundation for the existing OperiX
tenant model. This phase does **not** claim Kosovo TAK certification and does not
implement a fabricated TAK API.

## Included

- Extended company fiscal profile with business, fiscal, VAT, registered
  address, fiscal calendar, and default-language fields.
- Company bank accounts, branches, warehouses, fiscal locations, and POS
  terminals.
- Effective-dated, versioned compliance configuration with overlap validation
  and immutable active/retired versions.
- Company-scoped document numbering sequences.
- Granular company roles and permissions layered onto existing memberships.
- Append-only audit events with previous/new values, actor, company, branch,
  terminal, timestamp, IP, session/device, reason, and request identifiers.
- Hardened company creation/join functions and removal of direct self-service
  membership insertion.
- RLS policies for all new tenant data.
- Shared exact-decimal money and typed compliance packages.
- Invoice Settings UI for the fiscal company profile and read-only compliance
  version visibility.

## Compatibility

The migration is additive and preserves existing company, profile, invoice,
payment, product, employee, and membership rows. Existing invoice fields remain
available while the new normalized fields are adopted.

Legacy company tax rates are imported into a version explicitly labelled as
requiring compliance review. They are not asserted to be legally current.

## Applied migration

`supabase/migrations/20260727114526_phase_a_compliance_foundation.sql`

The migration was dry-run inside a transaction before being applied to the
local Supabase instance. A pre-migration custom-format database backup was
created inside the local database container at:

`/tmp/operix-pre-phase-a-20260727.dump`

The backup listing was verified with `pg_restore --list`.

## Verification performed

- Supabase database lint: no schema errors.
- All 13 new tables: RLS enabled and authenticated grants present.
- Owner update through RLS: succeeded.
- Audit context capture: verified in a rollback transaction.
- Audit update/delete protection: verified.
- Active compliance version mutation protection: verified.
- Money package tests and type-check: passed.
- Compliance package tests and type-check: passed.
- OperiX Invoice Web type-check and production build: passed.

The repository-wide web lint still reports pre-existing errors in
`customer-ledger-dialog.tsx` and `portal-links-view.tsx`, plus unrelated
warnings. Phase A files type-check and build successfully.

## External confirmation still required

- Current Kosovo VAT categories/rates and reporting mappings.
- Current payroll tax brackets, pension contribution rules, and effective
  dates.
- Official fiscal receipt numbering and correction/cancellation requirements.
- Official TAK export/submission formats, APIs, credentials, sandbox access,
  and certification process.
- Statutory document retention requirements.

These values must be introduced as reviewed effective-dated configuration
versions, never scattered as constants through application code.

## Next implementation slice

Phase B should add accounting periods, chart of accounts, balanced journal
entries, posting/reversal controls, and configurable posting rules. Financial
reports should then read posted journal lines rather than invoice aggregates.
