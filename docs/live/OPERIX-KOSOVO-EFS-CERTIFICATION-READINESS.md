# OperiX Invoice — Kosovo EFS Certification Readiness

**Assessment date:** 2026-08-12 UTC  
**Scope:** OperiX Invoice mobile, web, Supabase/PostgreSQL, shared fiscalization package and certification evidence.  
**Assessment type:** software-side readiness; not a TAK application, test result or certification.

## 1. Executive verdict

## CONDITIONALLY READY

OperiX now has a controlled EFS domain boundary, tenant-isolated fiscal configuration metadata, a permanently closed production guard, certification-mode fixtures, a deterministic local simulator, canonical receipt interfaces, QR test encoding, evidence export and the certification-package documentation skeleton.

It is **not ready to issue production fiscal coupons** and is **not TAK-certified**. It is conditionally ready to continue the TAK certification-testing process after TAK supplies/ confirms the exact integration contract and the applicant supplies the required credentials, certificates and documents.

Production decision: **NO-GO** until the TAK dependencies, secure production key service, formal TAK testing and authorization are completed.

## 2. Official source basis

The source-of-truth matrix is [docs/compliance/kosovo-efs-requirements-2026.md](../compliance/kosovo-efs-requirements-2026.md). The implementation used the official TAK/ATK documents and notices below:

- [Administrative Instruction (MF) No. 01/2026](https://www.atk-ks.org/wp-content/uploads/2026/06/ENG-ADMINISTRATIVE_INSTRUCTION_MF_NO._01_2026.pdf)
- [Specific Technical and Functional Requirements for EFD/FS/EFS](https://www.atk-ks.org/wp-content/uploads/2016/04/ENG-KE%CC%88RKESAT-SPECIFIKE-TEKNIKE-DHE-FUNKSIONALE-PE%CC%88R-PAJISJET-ELEKTRONIKE-FISKALE.pdf)
- [Conditions and Procedures for Application, Certification and Maintenance of EFS — final 29.05.2026](https://www.atk-ks.org/wp-content/uploads/2026/06/ENG-KUSHTET-DHE-PROCEDURAT-PER-APLIKIMIN-CERTIFIKIMIN-dhe-MIREMBAJTJEN-e-SEF-Verzioni-Final-29.05.2026.pdf)
- [TAK notice: application for EFS certification and maintenance](https://www.atk-ks.org/en/notice-to-taxpayers-apply-for-certification-and-maintenance-of-electronic-fiscal-software-efs-2/)
- [TAK notice: EDI request for fiscalization / Unique Fiscalization Code](https://www.atk-ks.org/en/notice-to-taxpayers-new-version-of-the-edi-electronic-system-published/)

The technical requirements document states that TAK publishes the detailed data structure, endpoints, registration, certificate, signature, request/response, error and example specifications separately. OperiX therefore stops at an explicit provider/client boundary instead of inventing an endpoint, payload, cryptographic algorithm, QR payload or TAK-issued value.

## 3. Requirement summary

The matrix contains **128 numbered requirements** across AI, technical, certification and notice sources. Statuses overlap because a requirement can be both partial and TAK-dependent.

| Measure | Result |
|---|---:|
| Matrix requirements | 128 |
| Fully complete (`COMPLETE`) | 1 |
| Partial with implementation/evidence | 64 |
| Rows containing TAK dependency | 51 |
| Rows containing legal review | 10 |
| Rows containing missing work | 8 |
| Applicant-dependent rows | 14 |
| EFS-specific automated tests/assertion groups passed | 17 |
| Failed implemented test cases | 0 |

The counts above are not additive; mixed statuses are intentionally counted in each applicable category.

## 4. Implemented software scope

- Reused `packages/fiscalization` rather than creating a second fiscalization system.
- Added explicit EFS states and guarded transitions separate from invoice, accounting and inventory status.
- Added typed `CanonicalFiscalDocument`, validation, decimal-safe total reconciliation and stable payload fingerprints.
- Added `FiscalKeyProvider`, development-only test key provider and production readiness guard. No private key is stored in the database or shipped to mobile.
- Added `KosovoEFSProvider` as an honest disabled boundary. It reports technical input required until TAK confirms the exact contract.
- Added deterministic `MockTakServer` fixtures for success, rejection, auth failure, bad signature, duplicate, timeout, server error, malformed response and unavailable service.
- Added installation, certificate metadata, configuration history, fiscal event journal and canonical fiscal receipt persistence with RLS and append-only controls.
- Added opaque invoice QR references. Existing invoice numbers are not used as public QR bearer identifiers.
- Added server-owned profile company identity and an authorized `set_active_company` workflow.
- Added readiness diagnostics and UI wording: `EFS NOT CERTIFIED` and production disabled.
- Added sanitized certification evidence export: `npm run efs:certification-report`.

## 5. State and accounting separation

```text
Commercial invoice / POS sale
        ├── accounting / VAT / inventory
        └── fiscalization status and evidence
```

The EFS layer does not create a second sale journal or a second inventory movement. An invoice can remain issued/accounted while its fiscalization state is pending, rejected or unavailable. A request being sent is not treated as TAK acceptance.

## 6. Production status

| Item | Status |
|---|---|
| TAK CERTIFIED | **NO** |
| Production EFS enabled | **NO** |
| Software Solution Code | Waiting for TAK / applicant configuration |
| Fiscalization Number | Waiting for TAK / taxpayer configuration |
| Unique Fiscalization Code | Waiting for taxpayer through TAK EDI workflow; never generated locally |
| TAK certification | Not submitted / pending |
| Customer fiscalization | Pending |
| Digital certificate | Pending; only metadata/reference fields exist |
| Production-safe private-key provider | **Blocked — KMS/HSM/Vault required** |
| TAK production integration | **Blocked — documented endpoint and protocol contract required** |
| UI wording | `EFS NOT CERTIFIED — DO NOT USE OPERIX AS A CERTIFIED FISCAL RECEIPT SYSTEM` |

## 7. Technical readiness scores

Scores describe software-side readiness, not legal approval or certification.

| Area | Score |
|---|---:|
| TAK Specification Coverage | 62/100 |
| Fiscal Transaction Engine | 62/100 |
| Receipt Compliance | 54/100 |
| QR Compliance | 30/100 |
| Cryptographic Signing | 35/100 |
| Certificate / Key Security | 60/100 |
| TAK Communication | 20/100 |
| Offline / Recovery | 45/100 |
| Database Integrity | 74/100 |
| Multi-Tenant Security | 76/100 |
| Mobile EFS UX | 58/100 |
| Certification Documentation | 86/100 |

The largest score reductions are deliberate: TAK has not supplied the exact live contract in the repository, no approved certificate/private-key service is configured, and formal TAK testing has not occurred.

## 8. Tests and verification

Passed during this readiness pass:

- `npm test --workspace=@invoice-monorepo/fiscalization` — 11/11 tests passed.
- Fiscal state-transition, stable fingerprint, decimal-total, certification QR round-trip, development-key isolation and mock-server scenario tests passed.
- `supabase/tests/kosovo_efs_readiness.sql` — schema, RLS, production guard, secret-boundary, active-company and invoice-scoped QR checks passed.
- Web TypeScript check passed: `npm run typecheck --workspace=web-suite`.
- Mobile TypeScript check passed: `npm run typecheck --workspace=operix-invoice`.
- Earlier local Supabase lint passed with two pre-existing warnings in unrelated payroll/accounting functions. A later CLI invocation could not start because the environment attempted to install an unavailable Linux Supabase binary; the database SQL test remained available and passed.
- `npm run efs:certification-report` generated a sanitized bundle with 23 copied source/document/test artifacts, no keys and no secrets.
- Independent Codex Security scan `40973cce-6d37-4dd1-a8f6-eda5bae0a129` completed with 8 reportable residual findings and partial coverage; its scope explicitly excluded TAK production calls and production secrets.

Not yet passable without TAK inputs:

- TAK known-answer signature vectors and certificate verification.
- TAK QR generation/decoding against the official verification application/data.
- TAK endpoint request/response contract and certification environment exchange.
- Formal offline exception, emergency block, numbering and correction/return test cases.
- Formal TAK test execution and certification decision.

Accounting, VAT and inventory remain sourced from the existing Phase 1–3 engines. The new EFS code does not duplicate those postings. Full production reconciliation still requires populated tenant fixtures and the final fiscal document contract.

## 9. Security findings and controls

Controls implemented:

- EFS tables are tenant-owned and RLS-enabled.
- Installation branch/location/POS ownership is checked at the database boundary.
- Fiscal provider configuration SELECT access is reduced to fiscal configuration permission.
- Secret-looking JSON/private-key material is rejected from fiscal configuration, attempts, events and evidence details.
- Fiscal history tables have append-only mutation guards.
- Profile `company_id` is protected from client-controlled cross-tenant changes; company switching uses an authorized RPC.
- Public QR references are high-entropy opaque tokens and QR-created portal access is invoice-scoped.
- Public portal company/client output is an allowlist, not `to_jsonb` of credential-bearing rows.
- PDF generation requires an authenticated session, source-token checks where a QR reference is present, restricted browser requests and generic error output.

Residual blockers requiring a separate security hardening pass before production:

- Legacy broad CRUD policies on several commercial tables still need replacement with permission-specific command/RLS paths.
- Existing profile/Stripe integration exposes payment-provider secrets to client code and must move to server-side secret storage.
- Privileged database operators can still alter some historical records unless deployment/role controls and tamper-evident chaining are added.
- Existing manual customer-wide portal tokens need migration/revocation and a fully server-mediated creation path.
- The transaction-report PDF endpoint needs the same source-record binding and constrained rendering policy as the invoice PDF endpoint.
- Offline payload persistence is not a device-backed TAK signature and cannot be treated as production fiscal evidence.
- Non-placeholder environment files were found in the worktree by the security review. Their values were not printed or included in evidence; deployment owners must rotate any credentials, move them to the deployment secret store and remove tracked copies through a controlled release process. The root ignore rules now cover future `.env` files while retaining example templates.

These residual findings are why this report does not issue a production GO.

## 10. TAK and applicant dependencies

Required from TAK and/or applicant:

1. Formal EFS application and signed standard form.
2. Applicant identity/KBRA documents and any conditional TAK fiscal-number certificate.
3. Signed software compliance statement.
4. Registered/certified OperiX software-solution identity and exact EFS Identification Number terminology/value.
5. TAK-confirmed Software Solution Code and Fiscalization Number workflow/value.
6. Taxpayer Unique Fiscalization Code obtained through EDI; OperiX must only store/configure it.
7. Approved certificate, certificate chain and installation assignment.
8. Secure private-key storage decision and production KMS/HSM/Vault deployment.
9. Certification/test endpoint, authentication method, schemas, message types, response codes, retry rules and test credentials.
10. Exact signature algorithm, canonicalization, digest, encoding, certificate rules and known-answer vectors.
11. Exact QR payload, encoding, verification behavior, size/error-correction rules and fiscal-logo requirements.
12. Official numbering scope, daily sequence and correction/return/cancellation semantics.
13. Official offline, 48-hour, following-month and emergency block procedures applicable to each transaction scenario.
14. Formal TAK technical/functional test execution and certificate/authorization decision.

No value in this list has been fabricated in code, database fixtures or documentation.

## 11. Evidence and certification package

Prepared:

- [Requirement matrix](../compliance/kosovo-efs-requirements-2026.md)
- [Pre-implementation audit](OPERIX-EFS-PREIMPLEMENTATION-AUDIT.md)
- [EFS documentation index](../efs/README.md)
- [Certification package](../efs/certification-package/00-APPLICATION-CHECKLIST.md)
- [Applicant documents checklist](../efs/certification-package/APPLICANT-DOCUMENTS.md)
- [Sanitized evidence command](../../scripts/efs-certification-report.mjs)
- Generated evidence directory: `artifacts/efs-certification-report/` (ignored from source control)

The package contains software-side architecture, data flow, security, key-management, installation, user/admin, maintenance, test, traceability, release-manifest and limitations documents. Applicant-supplied administrative evidence is explicitly left uncompleted.

Existing UI evidence can be reviewed in [web settings](../live/screenshots/web-preview-settings-1440.png) and the existing mobile/web regression artifacts. No screenshot is represented as a TAK fiscal coupon; the exact TAK receipt and QR are blocked until the official contract is supplied.

## 12. Final verdict

**CONDITIONALLY READY** for continued software-side preparation and controlled entry into TAK EFS certification testing.

**NO-GO** for Kosovo production accounting/fiscal-receipt use as an EFS. OperiX must continue to display `EFS NOT CERTIFIED`, keep production fiscalization disabled, and avoid representing ordinary OperiX invoices as TAK-certified fiscal coupons until formal TAK certification/authorization and taxpayer installation configuration exist.
