# OperiX Invoice — Phase 2 Kosovo Tax, Payroll, Assets & Inventory

Status: **implemented and verified locally**  
Scope: one official implementation phase, following Phase 1’s posted ledger  
Migration: `supabase/migrations/20260812143008_phase_2_tax_payroll_assets_inventory.sql`  
Tests: `supabase/tests/phase_2_tax_payroll_assets_inventory.sql`

## Audit before implementation

The Phase 2 audit found the following reusable functionality:

| Area | Classification | Finding and reuse decision |
| --- | --- | --- |
| Payroll tables and workflow | PARTIAL | Existing effective-dated payroll workflow, approvals, payslips and posting were retained. Kosovo rules, secondary-employer treatment and mappings were completed. |
| Payroll checksum functions | BROKEN | Existing secure functions could not resolve `digest`; their search path now explicitly includes the trusted `extensions` schema. |
| Sales and purchase documents | PARTIAL | Existing invoice and supplier-bill records were reused; the books read only posted accounting documents. |
| VAT configuration | PARTIAL / LEGALLY UNVERIFIED | Phase 1’s centralized effective-dated VAT configuration remains the single source. Classification-specific treatment is still marked for legal review. |
| Tax books | MISSING | Added posted-data sales and purchase books plus reconciliation to VAT control accounts. |
| Withholding | MISSING | Added effective-dated rules and transactions. Rent is enabled at 9%; other categories remain blocked pending legal review. |
| Assets | MISSING | Added fixed-asset register, acquisition/disposal, separate book/tax depreciation, posting and reversal. |
| Inventory | PARTIAL | Existing product stock and invoice-scoped movement code were not treated as the accounting ledger. Added an append-only weighted-average movement ledger, COGS journals, stock counts and GL reconciliation. |
| Archive | PARTIAL | Existing financial attachments remain reusable. Added a broader archive index for payroll, customs, bank, tax and asset documents. |
| Fiscalization | PARTIAL / UNSAFE | Existing provider architecture was retained. No certification, credentials or fiscal receipt claims were added. |

No parallel tax-book, asset, payroll or fiscalization system was created where a working foundation already existed.

## Implemented

### Tax center data layer

The database now provides:

- `kosovo_sales_book`, generated from posted invoices and invoice lines with customers, fiscal numbers, VAT classification, taxable base, VAT and credit-note sign.
- `kosovo_purchase_book`, generated from posted supplier bills with supplier identity, taxable base, input VAT, recoverable/non-recoverable VAT, imports and reverse charge.
- `kosovo_tax_book_reconciliation`, comparing the books with output VAT account `2100` and recoverable input VAT account `1300`.
- `withholding_tax_rules`, `withholding_transactions`, `calculate_withholding` and `record_withholding`.
- `tax_declarations` with `Draft`, `Ready`, `Exported`, `Submitted manually`, `Confirmed` and `Amended` states. Preparation never reports electronic submission.
- `tax_calendar_events` and `kosovo_tax_calendar` with upcoming, due-soon, overdue and completed presentation states.

Purchase VAT is not silently deductible. Existing bills without an explicit VAT split are treated as non-recoverable until classified by an authorized user.

### Payroll and pensions

The effective-dated approved `kosovo_2026` configuration is seeded per company with:

- primary employer PIT brackets: 0% to €80, 4% from €80–€250, 8% from €250–€450 and 10% above €450;
- secondary employer PIT at a separate 10% rate in the payroll package;
- 5% employee and 5% employer pension contributions;
- explicit tax-profile synchronization for primary and secondary employer relationships;
- default posting mappings for salary expense, employer pension expense, pension payable, employee tax payable and net salary payable.

Payroll approval/finalization continues to call the Phase 1 journal engine. A payroll finalization integration test produced a posted, balanced journal and immutable payslip checksums.

### Fixed assets

Added `fixed_assets`, `asset_depreciation_runs`, `asset_depreciation_lines` and `asset_disposals` with:

- acquisition, supplier, placed-in-service date, useful life, location, responsible employee and attachments;
- acquisition and disposal journals;
- accounting depreciation separated from Kosovo tax depreciation;
- tax categories 1/2/3 represented as 5%/20%/10%, subject to official legal confirmation;
- monthly/yearly preview, idempotent post, reversal and accumulated-depreciation protection.

Accounting depreciation posts debit `6200` and credit `1590`.

### Inventory

Added `inventory_locations`, `inventory_movements`, `inventory_counts` and `inventory_count_lines`.

The movement command is transactional, idempotent and quantity-safe. It records quantity before/after, exact cost amount, weighted-average cost, inventory value and source journal. Sale movements post COGS (`5000`) against inventory (`1200`). Physical counts create controlled stock-count adjustments. `inventory_gl_reconciliation` compares the register with the general ledger.

### Archive and fiscalization safety

`document_archive` supports sales documents, supplier invoices, customs, payroll, declarations, bank documents, assets and expense receipts, with source links, checksums, retention dates and RLS.

`kosovo_efs_status` explicitly reports:

> **EFS NOT CERTIFIED**

The normal OperiX invoice flow is not represented as a certified fiscal receipt.

## Legal sources used

These sources were used to configure rates and filing-calendar references:

- [TAK general tax information](https://www.atk-ks.org/en/portfolio/informata-te-pergjithshme-per-tatimet-ne-kosove/) — official summary of VAT rates, payroll/pension rates and filing deadlines.
- [TAK Sales Book and Purchase Book](https://www.atk-ks.org/en/librat-e-blerjes-dhe-te-shitjes/) — official book guidance index.
- [TAK notice on electronic Sales/Purchase Books](https://www.atk-ks.org/en/notice-to-taxpayers-electronic-declaration-of-the-purchase-book-and-the-sale-book/) — monthly 1–20 filing window.
- [TAK interactive PIT and pension guide](https://crmm.atk-ks.org/en/Public/GuideInteractivityAnswers/7a53613a-cb62-4671-2fde-08dba4862e41) — primary/secondary employment, PIT and pension references.
- [TAK rent withholding FAQ](https://www.atk-ks.org/pyetje-te-shpeshta/?wpfaqpage=103) — 9% rent withholding reference.
- [TAK depreciation FAQ](https://www.atk-ks.org/pyetje-te-shpeshta/?wpfaqpage=138) — category/rate reference used for the separate tax schedule.
- [TAK EFS certification notice](https://www.atk-ks.org/en/notice-to-taxpayers-apply-for-certification-and-maintenance-of-electronic-fiscal-software-efs-2/) — certification is not inferred from having a provider interface.

VAT classification, reverse-charge scope, recoverability exceptions, withholding categories beyond rent, depreciation applicability and retention requirements remain effective-dated legal controls. Anything not established by an official source is **LEGAL REVIEW REQUIRED**.

## Verification

Passed locally:

- posted sales book and purchase book values;
- recoverable/non-recoverable purchase VAT and VAT-control reconciliation;
- primary/secondary payroll rule representation;
- 5% + 5% pension calculations;
- payroll approval and balanced accounting journal;
- rent withholding at 9% and blocking of unverified withholding categories;
- declaration preview and tax-calendar generation;
- fixed-asset acquisition, separate book/tax depreciation, posting and reversal;
- inventory opening stock, weighted-average purchase, sale COGS and GL reconciliation;
- document archive source linking;
- explicit EFS not-certified state;
- cross-company RLS reads for assets, inventory, declarations and archive;
- package tests for payroll, accounting, compliance and decimal money.

`npx supabase db lint --local` no longer reports the payroll checksum errors or Phase 2 function errors. One unrelated pre-existing error remains in `support_ingest_channel_message` and is carried into Phase 3 hardening rather than suppressed.

## Phase 2 exit gate

The Phase 2 accounting/tax/operational gate passed for the local transaction suite, and the Phase 2 migration has since been applied to the authorized hosted project. Production rollout remains blocked until the hosted security/reconciliation audit, controlled legacy-invoice review, and the legal-review items above are resolved or explicitly accepted. EFS certification remains separate and is not claimed.
