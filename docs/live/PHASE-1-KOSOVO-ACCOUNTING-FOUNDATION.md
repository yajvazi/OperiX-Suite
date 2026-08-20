# OperiX Invoice — Phase 1 Kosovo Accounting Foundation

Status: **VERIFIED LOCALLY — READY FOR PHASE 2 IMPLEMENTATION**  
Verification date: 2026-08-12  
Migration: `supabase/migrations/20260812141314_phase_1_accounting_completion.sql`

This document records the required read-only audit, the Phase 1 implementation, local migration/test evidence, and the exit-gate decision. It treats the existing OperiX accounting schema and posting commands as the system of record and extends them forward-only.

## Audit classification

The audit covered the monorepo, existing Supabase migrations, accounting/compliance/money packages, web/mobile transaction flows, local RLS policies, and the local database schema. Existing worktree changes were preserved and not reset.

| Area | Classification | Evidence and decision |
|---|---|---|
| Decimal money arithmetic | COMPLETE | `packages/money` uses integer atoms and explicit rounding; package tests pass. |
| Journal entries and lines | COMPLETE | Existing `journal_entries`, `journal_entry_lines`, draft-only line mutation, posting command, reversal command, and audit triggers were reused. Phase 1 adds a database-level posted-balance trigger. |
| Debit/credit integrity | COMPLETE | Database posting rejects fewer than two lines, non-positive debit totals, or unequal totals. A posted-journal trigger protects direct status changes as well. |
| Chart of Accounts | COMPLETE | Existing configurable company chart and Kosovo-oriented seeded accounts were reused; contra-asset and contra-revenue types are represented in the package types. |
| Accounting periods | COMPLETE | Existing open/closed/locked workflow was extended with `soft_closed`; soft-close posting requires privileged permission and a reason. |
| Posting rules | COMPLETE | Existing effective-dated `posting_rule_sets` and lines were reused for sales, purchases, payments, expenses, credit notes, POS, payroll, depreciation, and COGS. |
| Sales invoice posting | COMPLETE | Existing `prepare_sales_invoice_for_posting` and `post_sales_invoice` were reused. Mobile invoice creation now calls the audited posting command. |
| Customer payments | COMPLETE | Existing `record_customer_payment` was reused; mobile recording now uses it and allocation rather than directly changing invoice status. |
| Supplier bill/payment posting | COMPLETE | Phase 1 adds `prepare_supplier_bill_for_posting`, `post_supplier_bill`, and `record_supplier_payment` using the existing ledger and posting rules. |
| Expenses | COMPLETE | Phase 1 adds `post_expense`; mobile expense creation posts through the command for expense records. |
| Credit notes/refunds | PARTIAL | Sales credit-note posting and customer/supplier payment reversals are implemented. Supplier-bill allocation and full refund document UX remain Phase 2 work. |
| Opening balances | COMPLETE | Idempotent `accounting_opening_balances` storage and `post_opening_balance` command were added. |
| Customer subledger | COMPLETE | Source-aware posted AR view and GL reconciliation view were added. Reversal source lineage is retained. |
| Supplier subledger | COMPLETE | Source-aware posted AP view and GL reconciliation view were added. |
| VAT foundation | PARTIAL | Effective-dated centralized Kosovo VAT configuration supports 18%, 8%, zero-rated, exempt, outside-scope, and reverse-charge categories. Category-specific deductibility and reverse-charge treatment remain explicitly marked for legal review. |
| RBAC and RLS | COMPLETE | Existing company permission checks and RLS policies were reused; opening balances and new command access are permission-gated. Cross-tenant read tests pass locally. |
| Audit trail | COMPLETE | Existing accounting audit triggers were reused; opening-balance records are audited. Posted journals and posted financial documents are immutable except through protected reversal/correction commands. |
| Mobile accounting screens | PARTIAL | Existing Accounting screens were reused. Phase 1 wires core transaction creation to accounting commands; advanced accounting navigation and full reconciliation UX continue in Phase 3. |
| Legacy operational rows | UNSAFE | Existing rows with `accounting_state = 'legacy'` were not silently reconstructed or modified. A controlled migration/cutover review is required before those rows are treated as posted history. |
| Direct UI writes | DUPLICATED / UNSAFE | Older web and some legacy screens still write operational tables directly. Mobile core invoice/payment/expense paths now use audited commands; web and remaining legacy paths need the Phase 3 hardening pass. |
| POS implementations | DUPLICATED / PARTIAL | Existing web `complete_pos_sale` and mobile stock checkout are separate operational paths. Mobile stock issue is atomic and now posts through `post_pos_invoice`; full inventory ledger unification is Phase 2. |
| Payroll, assets, inventory, tax books, reports | MISSING FOR PHASE 1 | Existing foundations are present, but the requested Kosovo operational layer belongs to Phase 2 and reporting belongs to Phase 3. |
| Fiscalization | LEGALLY UNVERIFIED | Provider architecture exists, but no OperiX certification, EDI code, credentials, or TAK approval was found. OperiX must not represent normal invoices as certified fiscal receipts. |

## Implemented foundation

The implementation reuses the existing accounting tables and commands:

- `journal_entries` and `journal_entry_lines` remain the only general ledger.
- `chart_of_accounts` remains customizable; system mappings use account IDs and statement mappings rather than duplicating a chart.
- `posting_rule_sets` remain effective-dated and configurable.
- `post_journal_entry` now accepts `open` and authorized `soft_closed` periods, rejects closed/locked periods, and validates balance before the row can become posted.
- A database trigger rejects any direct attempt to mark an unbalanced journal as posted.
- `accounting_opening_balances` and `post_opening_balance` provide idempotent opening-balance posting.
- `get_effective_vat_rule` and `list_effective_vat_rules` centralize VAT selection by company and effective date.
- `post_supplier_bill`, `record_supplier_payment`, `post_expense`, `post_credit_note`, `reverse_customer_payment`, and `reverse_supplier_payment` use the existing journal engine.
- `post_pos_invoice` uses the receivable rule for customer-backed invoices and the existing cash-sale rule for walk-in POS invoices.
- `customer_subledger_entries`, `supplier_subledger_entries`, `customer_subledger_reconciliation`, and `supplier_subledger_reconciliation` originate from posted ledger entries.

## Default Kosovo-oriented accounts

The existing template was retained and verified locally. It includes:

`1010` cash on hand, `1020` bank accounts, `1100` trade receivables, `1200` inventory, `1300` input VAT receivable, `1500` fixed assets, `1590` accumulated depreciation, `2010` trade payables, `2100` output VAT payable, `2200` payroll liabilities, `2210` salary payable, `2220` pension payable, `2230` employee tax payable, `3000` owner equity, `3100` retained earnings, `4000` sales revenue, `4100` service revenue, `4900` sales returns/allowances, `5000` COGS, `6010` general operating expense, `6100` payroll expense, `6110` employer pension expense, `6200` depreciation expense, and `6300` bank fees.

Companies may add or rename accounts, but system posting rules must continue to point to valid active posting accounts. Custom mappings are supported through account IDs and statement/tax mappings.

## Automatic accounting map

| Source operation | Ledger event | Result |
|---|---|---|
| Invoice | `sales_invoice` | Debit receivable; credit revenue and output VAT. |
| Walk-in POS invoice | `pos_sale` | Debit cash; credit revenue and output VAT. |
| Customer payment | `customer_payment` | Debit selected cash/bank account; credit receivable. |
| Supplier bill | `purchase_invoice` | Debit expense, input VAT; credit payable. |
| Supplier payment | `supplier_payment` | Debit payable; credit selected cash/bank account. |
| Expense | `expense_reimbursement` | Debit operating expense; credit bank account. |
| Credit note | `credit_note` | Debit returns and output VAT; credit receivable. |
| Refund/reversal | `journal_reversal` | Reverses the original posted journal with an immutable reason trail. |

All command paths are transactional. Source posting indexes and idempotency keys prevent duplicate journals. Posted source documents cannot be edited or deleted through ordinary writes.

## VAT legal-source status

TAK’s current general tax information identifies 18% standard VAT and 8% reduced VAT. TAK’s public VAT calculator also exposes zero/exempt, reverse-charge, credit-note, import, and deductibility classifications. Sources used by the seeded configuration:

- [TAK — General Information on Taxes in Kosovo](https://www.atk-ks.org/en/portfolio/informata-te-pergjithshme-per-tatimet-ne-kosove/)
- [TAK — VAT calculator](https://crmm.atk-ks.org/en/Public/CalculatorDetail?id=8)

The rates are recorded with effective dates and sources. Classification-specific deductibility, reverse-charge conditions, and purchase treatment are not treated as legally final until the Phase 2 legal verification matrix is completed.

## Migrations and local verification

Applied to the local Supabase database:

- `20260812141314_phase_1_accounting_completion.sql`
- Existing accounting/compliance migrations were reused; no reset or destructive migration was performed.

Tests added/run:

- `supabase/tests/phase_1_accounting_foundation.sql`
- `packages/accounting` tests and typecheck
- `packages/compliance` tests
- `packages/money` tests
- Mobile TypeScript/navigation tests and Expo web export
- `git diff --check`

The Phase 1 SQL suite passes for invoice posting, POS posting, customer payment, customer payment reversal, supplier bill, supplier payment, expense, opening balance, duplicate invoice retry, soft close, closed-period rejection, exact debit/credit equality, AR/AP reconciliation, and cross-tenant reads.

`npx supabase db lint --local` still reports pre-existing errors in payroll payslip checksums, payroll posting mappings, and support channel ingestion. Those are not suppressed; they are Phase 2/3 remediation items and prevent a final production-readiness verdict until fixed.

## Phase 1 exit gate

| Gate | Result |
|---|---|
| Journals always balance | PASS locally; database trigger and posting command tested. |
| Invoice accounting works | PASS locally for customer invoices and walk-in POS invoices. |
| Purchase accounting works | PASS locally for supplier bills and supplier payments. |
| Payments work | PASS locally for customer/supplier payment posting and customer refund reversal. |
| VAT foundation works | PASS as centralized effective-dated configuration; legal classification review remains explicit. |
| Chart of Accounts works | PASS; seeded Kosovo-oriented accounts and customizable mappings verified. |
| Subledgers reconcile | PASS locally for AR/AP source-aware views. |
| RLS tests pass | PASS locally for unrelated-company reads. |
| Existing invoices still work | PASS for existing schema/read paths; legacy rows remain unposted until reviewed. |

**Decision:** Phase 1 implementation and local exit verification pass. The Phase 1 migration has since been applied to the authorized hosted project. Production use still requires controlled legacy-invoice backfill, legal review, and the remaining hosted security/reconciliation gates.
