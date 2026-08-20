# OperiX EFS preimplementation audit

Audit date: **2026-08-12**  
Repository: `/root/OperiX`  
Audit mode: read-only before EFS implementation changes. Existing user changes in the worktree were preserved.

## Executive finding

OperiX already has a reusable generic fiscal-provider foundation, a POS transaction model, offline POS primitives, accounting/VAT/inventory posting, ordinary receipt/PDF renderers, company/branch/terminal records, a `kosovo_efs_status` safety view and explicit `EFS NOT CERTIFIED` UI wording.

It does **not** have a TAK EFS implementation. There is no evidence in the repository of an OperiX TAK certificate, EFS Identification Number/ApplicationId, Software Solution Code, taxpayer Unique Fiscalization Code, Fiscalization Number, approved certificate, production credentials, TAK integration endpoint or TAK test result. The existing mock provider is not a fiscal receipt and its QR value is not a TAK-verifiable QR.

The source-backed implementation decision is therefore:

> Build the software-side EFS boundary, persistence, security controls, certification mode, evidence package and deterministic mock tests. Stop the real TAK adapter at an explicit technical-input boundary until TAK supplies the exact integration contract and credentials. Keep production EFS disabled.

## Official sources read

| Source | Evidence used |
|---|---|
| [Administrative Instruction (MF) No. 01/2026](https://www.atk-ks.org/wp-content/uploads/2026/06/ENG-ADMINISTRATIVE_INSTRUCTION_MF_NO._01_2026.pdf) | Articles 5–7, 31–46: eligibility, coupon fields, EFS functions, certificates/private keys, EFS code, HTTPS/signing, QR, verification, corrections and outage rules. |
| [Specific Technical and Functional Requirements](https://www.atk-ks.org/wp-content/uploads/2016/04/ENG-KE%CC%88RKESAT-SPECIFIKE-TEKNIKE-DHE-FUNKSIONALE-PE%CC%88R-PAJISJET-ELEKTRONIKE-FISKALE.pdf) | Articles 22–31, pp. 43–55: EFS functional/technical requirements, coupon content, QR, offline behavior, thermal formats, TAK integration documentation and registration. EFS annex pp. 78–88 was read for logo, examples and units. |
| [Conditions and Procedures for Application, Certification and Maintenance](https://www.atk-ks.org/wp-content/uploads/2026/06/ENG-KUSHTET-DHE-PROCEDURAT-PER-APLIKIMIN-CERTIFIKIMIN-dhe-MIREMBAJTJEN-e-SEF-Verzioni-Final-29.05.2026.pdf) | Articles 1–9, pp. 2–7: applicant scope, required documents, testing, correction/re-test, decision, certificate/register and withdrawal. |
| [TAK EFS application notice](https://www.atk-ks.org/en/notice-to-taxpayers-apply-for-certification-and-maintenance-of-electronic-fiscal-software-efs-2/) | Application is open; applicant must apply for certification/maintenance and may submit electronically or in person. |
| [TAK EDI notice](https://www.atk-ks.org/en/notice-to-taxpayers-new-version-of-the-edi-electronic-system-published/) | EDI “Request for Fiscalization” issues/displays the Unique Fiscalization Code; it is a prerequisite for taxpayer EFS use. |

The complete requirement matrix is [kosovo-efs-requirements-2026.md](../compliance/kosovo-efs-requirements-2026.md).

## Existing architecture

```text
Invoice / POS UI
       |
       v
Supabase commercial transaction + accounting/VAT/inventory posting
       |
       v
packages/fiscalization (generic provider + mock provider)
       |
       v
fiscal_provider_configs / fiscal_transactions / attempts / reconciliation events
       |
       X  No documented TAK endpoint, schema, certificate or production credentials
```

## Existing functionality classification

| Area | Classification | Evidence and consequence |
|---|---|---|
| Generic provider boundary | PARTIAL / REUSED | `packages/fiscalization/src/index.ts` exposes `FiscalProvider`, a disabled Kosovo adapter and a mock provider. The interface is reusable, but its payload is not a TAK schema. |
| Mock provider | PARTIAL / SAFE ONLY FOR TESTS | Mock scenarios exist in `packages/fiscalization/src/index.test.ts` and migration `20260728174000_phase_e4_fiscal_provider_foundation.sql`. `operix-fiscal://mock/...` is explicitly not TAK verification. |
| POS commercial transaction | COMPLETE LOCALLY / REUSED | Phase E POS tables/functions allocate idempotent orders, lines and payments and create a fiscal aggregate after completion. |
| Invoice commercial transaction | COMPLETE LOCALLY / REUSED | Existing web/mobile invoice flows and Phase 1 accounting posting continue to operate; they are not automatically certified fiscal coupons. |
| Accounting/VAT/inventory | COMPLETE LOCALLY / REUSED | Phase 1–3 accounting, VAT, inventory and COGS foundations are the source of commercial totals. EFS must consume them and must not post a second sale or stock movement. |
| Fiscal aggregate persistence | PARTIAL | `fiscal_transactions` is tenant-owned and append-audited, but it has no TAK-specific installation/certificate/FCUIN fields and no exact fiscal receipt schema. |
| Fiscal provider configuration | UNSAFE / REMEDIATING | `fiscal_provider_configs.configuration` is JSON in a public table and is selected by `pos.fiscal.view`. It must not hold private keys or other secrets, and sensitive metadata needs a tighter server-only boundary. |
| Certificate lifecycle | MISSING | No fiscal certificate metadata table/provider exists. TAK Article 34 requires a certificate for each EFS installation. |
| Private-key storage | MISSING / BLOCKED | No KMS/HSM/Vault-backed `FiscalKeyProvider` exists. Production signing must remain blocked. |
| TAK client | MISSING / TAK DEPENDENCY | No `KosovoTAKClient` with documented endpoints exists. The technical requirements say TAK supplies this contract separately. |
| Exact signing/QR | MISSING / TAK DEPENDENCY | No exact EFS canonicalization, signature encoding or QR payload contract is available. Existing mock QR is decorative test data only. |
| Fiscal document schema | PARTIAL | `CanonicalFiscalTransaction` carries commercial totals and lines, but lacks mandatory operator, unit, fiscal identity, EFS ID, FCUIN/daily number, tax-letter mapping and official payment codes. |
| Returns/corrections/cancellation | PARTIAL | Generic kinds and original-transaction linkage exist; a TAK-specific linked receipt flow, reason, numbering and response semantics are absent. |
| Offline fiscalization | PARTIAL | Phase E has offline POS device/order support and fiscal statuses, but exact Article 44 deadlines, offline marking, emergency block and TAK re-submission evidence are not implemented. |
| Fiscal numbering | PARTIAL / TAK DEPENDENCY | Local transaction/idempotency uniqueness exists; TAK daily/FCUIN numbering format and scope are not known. |
| Time | PARTIAL | POS stores timestamps; fiscal operations do not yet use an explicit trusted server-time/canonical timezone contract. |
| Receipt/PDF rendering | PARTIAL / DUPLICATED | Web and mobile invoice/thermal renderers exist, but there is no single canonical EFS fiscal receipt model used by all surfaces. The web PDF endpoint was read-only audited as lacking its own authentication/ownership check. |
| QR verification | MISSING / TAK DEPENDENCY | Mobile has a QR scanner and the app displays the not-certified status, but no TAK verification integration exists. |
| EFS UI | PARTIAL | Web settings/navigation and mobile Tax Center explicitly show `EFS NOT CERTIFIED`; there is no installation onboarding, readiness diagnostics, certificate health or fiscal transaction action flow. |
| Business unit/POS identity | PARTIAL | `branches`, `fiscal_locations`, `pos_terminals` and terminal RLS exist. TAK-specific unit/POS/software/fiscal-number identity and lifecycle are absent. |
| Operator identification | PARTIAL | Authenticated cashier IDs exist in POS; fiscal operator name/identification mapping is not modeled/validated. |
| Payment mapping | PARTIAL | POS supports payment rows/methods; official TAK payment classification codes are not available. |
| Multi-tenant RLS | PARTIAL / UNSAFE SURFACE | Fiscal rows have company permission policies and tenant columns. Provider config exposure, non-forced RLS and public security-definer surfaces require hardening and tests. |
| Fiscal event journal | PARTIAL | `fiscal_reconciliation_events` is append-only, but a complete typed fiscal event journal with request/response fingerprints and tamper-evident chaining is absent. |
| Audit log | PARTIAL | Existing `audit_table_change` triggers cover fiscal tables; setup, cert assignment, retries, reprints, verification and lifecycle events need explicit fiscal audit records. |
| Certification mode | MISSING | No isolated `EFS_CERTIFICATION_MODE` with data separation/fixtures exists. |
| Mock TAK server | PARTIAL | Mock provider scenarios exist, but no isolated documented-schema local TAK simulator with normalized errors and transport responses. |
| Golden receipt suite | MISSING | Existing fiscal tests cover generic mock success/retry/reconciliation only; the required golden cases are not present. |
| Certification package | MISSING | No `docs/efs/certification-package/` artifact set exists. |
| Change control | MISSING | No EFS-specific change-control procedure or certified release manifest exists. |
| Security / PDF authorization | UNSAFE / REMEDIATING | `/api/pdf` accepts client-supplied invoice/company content and does not authenticate or query ownership before rendering. EFS acceptance requires PDF/receipt authorization to be closed. |
| Production guard | PARTIAL | Existing UI/status explicitly says not certified and no production claim is made. A backend-level guard over software certification, taxpayer configuration, installation, certificate, key and production flag is still required. |

## Read-only security observations

1. `fiscal_provider_configs` is RLS-enabled but its normal SELECT policy exposes the entire `configuration` JSON to users with `pos.fiscal.view`; no private key should be stored there, and the design needs a server-only secret reference/metadata split.
2. Fiscal tables use `security definer` functions with fixed `search_path`, which is better than an unqualified function, but the security-definer surface must remain narrowly permission-checked and should not be the mechanism for exposing secrets.
3. The `kosovo_efs_status` view uses `security_invoker = true` and returns a fixed `EFS NOT CERTIFIED` value, which is a good safety state; it must continue to be tenant-scoped.
4. The web PDF route is not an EFS route, but it can render invoice content without a route-level authenticated ownership check. It is included in the certification security gate because the final receipt/PDF must be authorized and source-linked.
5. Client-side feature hiding is insufficient for fiscalization. The backend/database must reject production fiscalization when any mandatory TAK/applicant condition is missing.

## Required implementation order

1. Create the source-of-truth matrix (done before implementation code).
2. Harden/reuse the existing fiscal persistence boundary; do not create another fiscal system.
3. Add typed EFS domain contracts, production guard, key/certificate abstractions and certification-mode simulator without inventing TAK schema/endpoint/signature values.
4. Add canonical receipt/QR interfaces and tests that remain blocked for official verification until TAK’s integration package is supplied.
5. Add mobile/web status, onboarding and diagnostics that distinguish software readiness, taxpayer configuration and certification.
6. Add the certification package/evidence exporter and run security, database, package and UI verification.

## Audit conclusion

The repository is **not currently ready to issue or represent a TAK-certified fiscal receipt**. It is suitable for controlled software-side readiness work and can become ready for TAK certification testing only after the documented implementation and the explicit TAK/applicant dependencies in the requirements matrix are closed.

## Post-audit implementation record

The implementation pass following this read-only audit added the following controls without enabling production fiscalization:

- `packages/fiscalization/src/index.ts` now contains the explicit EFS state machine, typed canonical fiscal document boundary, decimal-safe reconciliation checks, development-only key provider, deterministic local TAK simulator, production hard guard and certification QR codec. The codec is intentionally not a TAK QR implementation.
- `supabase/migrations/20260812154150_kosovo_efs_certification_readiness_20260812.sql` adds tenant-owned installation/certificate metadata, append-only configuration/event/receipt evidence, secret-looking JSON rejection, RLS, readiness diagnostics and a database-level guard that remains closed until the exact certified build is authorized.
- `supabase/migrations/20260812161000_efs_tenant_and_receipt_access_hardening.sql` makes profile company identity server-owned, keeps company switching behind `set_active_company`, scopes QR-created portal access to a single invoice, and allowlists public portal fields.
- Web/mobile settings expose `EFS NOT CERTIFIED` and production-disabled readiness information. No screen can enable production EFS by itself.
- `scripts/efs-certification-report.mjs` produces a sanitized evidence bundle with source hashes, tests, migrations and documentation while excluding keys, credentials and production responses.

The remaining audit classifications that prevent a production claim are unchanged: the exact TAK technical integration package, TAK-issued values/certificate, production-safe KMS/HSM/Vault signing, formal TAK testing/certification, the broad legacy commercial-table authorization model, and full legally verified offline/emergency workflows.
