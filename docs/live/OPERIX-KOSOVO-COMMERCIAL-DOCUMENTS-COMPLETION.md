# OperiX Kosovo commercial documents — completion report

Date: 2026-08-12  
Scope: OperiX Invoice Mobile first, shared Supabase/domain contract, and compatibility with the existing Web/POS/portal foundations.  
Decision: **NO-GO for production use**

## Executive result

OperiX Invoice Mobile now has a shared commercial-document vocabulary instead of treating every PDF as an invoice variant. The canonical identity is stored in `invoices.commercial_document_type`; the PDF title is presentation only. Mobile Shitjet uses one lifecycle surface with quick creation, document-type filters, linked-document navigation, event activity, conversion actions, and explicit proforma protection.

The work is not production-ready for legal or financial use yet. The migration has not been applied to a live Supabase project in this workspace, the official tax/accounting configuration still needs Kosovo professional approval, advance-payment ledger/tax allocation and debit-note posting need a complete accounting-engine path, and OperiX does not have confirmed TAK EFS certification/authorization. Those gates make a GO unsafe.

## Previous functionality

- Existing invoices, offers, POS checkout, payments, customer portal, signatures, shared PDF templates, inventory checkout, accounting commands, and the `FiscalizationProvider`/`KosovoEFSProvider` boundary were already present.
- Legacy documents were represented by the shared `invoices` table with `type`/`subtype`, but mobile and Web used different legacy mappings and conversions could reuse or mutate invoice numbers.
- Existing `post_pos_invoice`, `post_sales_invoice`, `post_credit_note`, payment allocation, stock-tracked checkout, RLS, and audit/outbox foundations were preserved.

## Reused functionality

- Existing `invoices` and `invoice_items` remain compatibility storage and the accounting source of truth; no duplicated quote/proforma/order/delivery schemas were introduced.
- Existing `document_sequences` is used by the new transactional allocator.
- Existing `document_source_links` is the relation graph; it now accepts lifecycle-specific relation types.
- Existing accounting posting functions remain the only posting boundary. The new conversion function copies commercial data and does not post journals, VAT, receivables, payments, or stock.
- Existing PDF adapter and OperiX branding remain the mobile rendering path.
- Existing tenant scope helpers and Supabase RLS remain the access boundary.

## New functionality

### Shared domain

Added `@invoice-monorepo/commercial-documents` with:

- explicit types: `QUOTE`, `PROFORMA`, `SALES_ORDER`, `DELIVERY_NOTE`, `INVOICE`, `ADVANCE_INVOICE`, `FINAL_INVOICE`, `CREDIT_NOTE`, `DEBIT_NOTE`, `SIMPLIFIED_INVOICE`, `FISCAL_RECEIPT`, and the Article 48 assessment type `BAD_DEBT_INVOICE`;
- per-type statuses and effect timing (`NONE`, `ON_ISSUE`, `ON_SUPPLY`, `ON_PAYMENT`, `POLICY_DEPENDENT`, `PROVIDER_ONLY`);
- legacy-row resolution that ignores PDF titles;
- supported conversion paths and plans that explicitly return `createsEconomicEvents: false`;
- deterministic commercial totals and advance-balance helpers;
- immutable-status helpers and domain tests.

### Database migration

Added `supabase/migrations/20260812170500_commercial_documents_domain.sql` and
`supabase/migrations/20260812174500_commercial_documents_mobile_support.sql`.

It adds:

- canonical type/status and separate accounting, VAT, inventory, payment, and fiscalization statuses to `invoices`;
- separate supply/order/delivery/payment/validity dates, customer PO number, delivery terms/address, correction/original-document references, and immutable/issued metadata;
- canonical security-invoker views: `commercial_documents`, `commercial_document_lines`, `commercial_document_relations`, and `commercial_document_timeline`;
- `commercial_document_events` with RLS, append-only access through a security-definer event function, and compatibility triggers for created/status events;
- independent configurable sequences for quotes, proformas, orders, delivery notes, invoices, advances, credit notes, debit notes, fiscal receipts, and bad-debt workflows. Final/simplified invoices use the tax-invoice sequence by default;
- idempotent `convert_commercial_document` and safe `transition_commercial_document` RPCs;
- ordered/fulfilled/remaining quantities and `apply_delivery_fulfillment` safeguards for partial deliveries;
- credit-line quantity validation against the original invoice line;
- compatibility triggers that derive canonical identity from legacy `type`/`subtype` on old clients while an explicit canonical type wins.
- Kosovo customer classification (`B2B`, `B2C`, `OTHER`) plus fiscal/VAT/NUI identifiers and billing/shipping addresses;
- per-company document defaults, including quantity-only delivery-note pricing;
- operational-document payment links that preserve proforma/advance traceability without treating a proforma as an ordinary invoice;
- an advance-allocation ledger, source-chain carry-forward, double-application guards, and a controlled-posting guard for advance/final invoices;
- explicit RLS policies and Data API grants for the new tables/views; `supabase/config.toml` now enables migration execution.

### Mobile UX

- Replaced the old Sales invoice/quote split with a lifecycle-oriented `Shitjet` workspace.
- Added quick actions for Faturë, Pro-faturë, Ofertë, Porosi, and Fletëdërgesë.
- Added filters: Të gjitha, Faturat, Pro-faturat, Ofertat, Porositë, Fletëdërgesat.
- Added customer/number/note search, Albanian/English labels for the new surface, linked-document navigation, and event timeline display.
- Added conversion actions: Ofertë → Porosi/Faturë, Pro-faturë → Paradhënie/Faturë, Porosi → Fletëdërgesë/Faturë, Fletëdërgesë → Faturë, Paradhënie → Faturë Përfundimtare, and invoice → Notë Krediti/Notë Debiti.
- Existing issued financial documents cannot be silently edited or deleted from the mobile form/detail flow.
- Added read-only numbering previews to Advanced Settings; tax-invoice sequence changes remain administrative and are not exposed as an unsafe free-form edit.

## Document types and conversion paths

The supported graph is:

```text
OFERTË ──accepted──> POROSI ──> FLETËDËRGESË ──> FATURË ──> PAGESË
   └────────────────────────────────────────────> FATURË

PRO-FATURË ──> FATURË
     └───────> Faturë Paradhënie ──> Faturë Përfundimtare

FATURË / Faturë Përfundimtare ──> Notë Krediti / Notë Debiti
```

Every conversion creates a new number and preserves the source. `source_document_id`, `source_document_type`, `document_source_links`, and event history provide traceability. The RPC is locked by source/target and checks for an existing relation before creating another target.

The graph supports one quote to multiple targets, one order to multiple deliveries, many deliveries to one later invoice, multiple corrections per invoice, and multiple linked payment records. The advance ledger supports multiple received advances and bounded application to a final invoice, but its certified Kosovo tax/accounting posting command remains a production gate.

## Numbering

`reserve_invoice_number(company_id, document_type, issue_date)` now uses a company/sequence/year advisory lock and the existing `document_sequences` row lock. It honors configured prefix/suffix/padding and never calculates the next number from a client-side list.

Default examples are `OF-YYYY-000001`, `PRO-YYYY-000001`, `POR-YYYY-000001`, `FD-YYYY-000001`, `FAT-YYYY-000001`, `PAR-YYYY-000001`, `NK-YYYY-000001`, and `ND-YYYY-000001`. Organizations must approve their final prefix and sequence policy; tax-invoice numbering must not be changed after issuance in a way that violates the applicable sequence rules.

## Accounting behavior

- Quotes, proformas, orders, and delivery-note conversion itself does not call posting functions.
- The existing invoice/POS accounting boundary remains the only journal-posting path.
- The existing credit-note posting function is reusable for a prepared credit note, but mobile creation currently leaves correction documents as drafts until an authorized posting workflow is completed.
- Debit-note posting is not yet a dedicated accounting command; using an ordinary invoice post for it would be unsafe, so this report does not claim completion.
- Proforma/advance payment links and final-invoice advance allocations are deliberately marked as pending controlled accounting treatment; they do not create revenue, ordinary AR, VAT, or fiscalization entries by themselves.
- The migration guard blocks the existing ordinary sales-invoice poster from silently posting `ADVANCE_INVOICE` or advance-applied `FINAL_INVOICE` rows.
- Delivery fulfillment tracks quantities and prevents over-delivery, but an organization-specific inventory/COGS policy must decide the exact journal/stock event.

## VAT behavior

The compliance matrix records Article 22, Articles 44–50, Article 47, Article 48, Article 49, and Article 50 distinctions. Proformas have no fiscal identifiers/QR and do not post an ordinary invoice merely because a PDF was generated. Advance invoices are explicit documents, not “paid proformas.”

The tax engine still needs a production-approved tax-point implementation for supply date, advance receipt date, and early invoice issuance. The existing accounting posting command uses the existing invoice posting date and is not sufficient evidence that every Kosovo tax-point scenario is solved. Final invoices must be enabled only after advance VAT reconciliation is approved.

## Inventory behavior

- Order lines maintain ordered, delivered, and remaining quantities.
- Delivery confirmation is idempotent and rejects a delivery that would exceed the order quantity.
- Conversion does not itself reduce stock.
- Existing POS stock-tracked checkout remains atomic and is not duplicated by conversion.
- Warehouse-specific delivery-note movement, returns, serial/batch, and COGS policy are not fully certified for every organization configuration.

## EFS behavior

Commercial document type and fiscalization status are separate. Quote, proforma, order, and ordinary delivery note do not become fiscal documents from their title or PDF template. Existing `FiscalizationProvider` and disabled `KosovoEFSProvider` are reused; no cryptography/protocol engine was added. Production fiscalization remains disabled pending the organization's current TAK eligibility, certification/authorization, Unique Fiscalization Code, installation/configuration, and technical acceptance.

## Kosovo legal sources

The detailed source matrix is [docs/compliance/kosovo-commercial-documents-matrix.md](../compliance/kosovo-commercial-documents-matrix.md).

Primary sources reviewed:

- [Official Gazette — Law No. 05/L-037 on VAT](https://gzk.rks-gov.net/ActDocumentDetail.aspx?ActID=11015)
- [Official Gazette — Law No. 08/L-257 on Administration of Tax Procedures](https://gzk.rks-gov.net/ActDetail.aspx?ActID=85269)
- [Official Gazette — Administrative Instruction MF No. 01/2026 on fiscal devices/systems](https://gzk.rks-gov.net/ActDetail.aspx?ActID=119286)
- [TAK — EFS certification and maintenance notice](https://www.atk-ks.org/en/notice-to-taxpayers-apply-for-certification-and-maintenance-of-electronic-fiscal-software-efs-2/)
- [Official Gazette — Law No. 06/L-032 on Accounting, Financial Reporting and Auditing](https://gzk.rks-gov.net/ActDetail.aspx?ActID=16268&langid=2)
- [Official Gazette — Law No. 10/L-025 amending the accounting law](https://gzk.rks-gov.net/ActDetail.aspx?ActID=119828)
- [Official Gazette — Administrative Instruction MF No. 03/2015 implementing VAT](https://gzk.rks-gov.net/ActDocumentDetail.aspx?ActID=11079)

## Test and verification results

| Check | Result |
|---|---|
| Shared commercial-document package tests | PASS — 5/5 |
| Shared commercial-document package typecheck | PASS |
| Mobile TypeScript check | PASS |
| Mobile navigation tests | PASS — 2/2 |
| Mobile `npm test` | PASS |
| Mobile Expo web export | PASS |
| Web TypeScript check | PASS |
| Web Vitest suite | PASS — 8 files / 27 tests |
| Migration SQL parse/dependency harness | PASS — both commercial migrations applied to a disposable PostgreSQL 16 schema stub |
| Commercial migration behavior harness | PASS — proforma payment link → advance chain → final allocation; duplicate-payment guard exercised |
| Supabase local/live migration run | NOT RUN — Supabase CLI and a project connection are unavailable in workspace; apply to a disposable project before production |
| Browser visual check | PASS for authenticated shell fallback screenshot; Sales data view requires authenticated test credentials |
| Screenshot | [mobile-sales-lifecycle.png](screenshots/mobile-sales-lifecycle.png) |
| Generated visual reference | [web-preview-dashboard-1440.png](screenshots/web-preview-dashboard-1440.png) |

The browser fallback screenshot shows the sign-in shell because no authenticated test account was supplied. The generated Sales reference was inspected with the image viewer and used for the lifecycle workspace hierarchy, white/#004FFE styling, quick actions, filter chips, and linked-document panel.

## Known limitations / release gates

1. Apply and run all timestamped migrations against a disposable Supabase database, then run RLS and RPC integration tests with at least two organizations and two users.
2. Implement and approve advance-payment ledger/tax allocation, including multiple advances and final-invoice reconciliation without double VAT.
3. Add a dedicated debit-note accounting command and verify Article 47 journal/VAT/AR behavior.
4. Centralize Kosovo tax-point rules instead of relying on invoice issue/posting date in every scenario.
5. Complete B2B/B2C field validation against the active company/customer classifications and the latest TAK implementation instructions.
6. Confirm electronic-invoice authenticity/integrity and customer acceptance workflow for each delivery channel.
7. Complete SEF/EFS certification, provider configuration, TAK authorization, and production acceptance before enabling fiscalization.
8. Add live integration tests for partial deliveries, returned goods, partial credits, payments, inventory COGS, portal isolation, and offline mobile sync.
9. The Web UI was not the primary change surface for this mobile-first continuation; its complete lifecycle parity must be validated before the overall Web acceptance criterion is marked complete.

## Scores

| Area | Score |
|---|---:|
| Commercial Documents | 76/100 |
| Kosovo Legal Compliance | 62/100 |
| Accounting Integration | 48/100 |
| VAT Integration | 45/100 |
| Inventory Integration | 60/100 |
| EFS Integration | 45/100 |
| Mobile UX | 80/100 |
| Web UX | 42/100 |
| Security/RLS | 75/100 |

## Production decision

# NO-GO

Do not enable production issuance, VAT posting, advance-payment finalization, debit notes, or EFS fiscalization based on this implementation alone. The mobile commercial-document foundation is testable and substantially safer than title-based templates, but the remaining legal/accounting/provider gates can still create inconsistent records if enabled without the listed verification and professional approval.
