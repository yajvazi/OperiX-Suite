# Web ↔ Mobile parity matrix (Invoice)

Goal: the web app and the mobile app offer the same business capabilities, work on the same
account and data, and can be used separately or at the same time.

## How this was built

Compared what each app actually does against the backend: every table, stored procedure,
edge function and shared `@invoice-monorepo/api` function that each app calls, plus the
screens/routes each has. The web app also uses generic "resource pages" configured in
`apps/OperiX Invoice/OperiX Web/src/lib/resource-config.ts` (customers, products, expenses,
income, payments, vendors, contracts, recurring, reminders); those were counted too.

**Limits:** this finds missing capabilities, not UX or field-level differences. "Both" means
the capability exists on both sides, not that it is identical. Rows marked *depth audit* need a
field-by-field comparison before they can be called done.

Legend: ✅ both · ◐ partial (see note) · ⬅ mobile only · ➡ web only · — out of scope

## Sales

| Capability | Status | Notes |
|---|---|---|
| Invoices, quotes, sales orders, delivery notes | ◐ *audited 2026-10-28* | Core save logic, totals/rounding and the cash limit are already shared code (`saveInvoiceDocument`, `@invoice-monorepo/money`, `isCashPaymentAllowed`). See the invoice audit below. |
| Customers | ✅ *depth audit* | Web uses a generic page; mobile has dedicated form/detail/ledger screens. |
| Customer ledger | ✅ | |
| Payments (record, links) | ✅ *depth audit* | Mobile `PaymentForm` is 986 lines. Mobile can delete a payment; web reverses. Decide one behavior. |
| Credit notes | ✅ *depth audit* | |
| Recurring invoices | ➡ | Mobile: none. |
| Payment reminders | ◐ | Web has reminders resource and automation; mobile minimal. |
| Customer portal links | ➡ | Mobile: none. |
| Contracts: list/detail | ◐ | Web: list only. |
| Contracts: templates, builder, clauses, events, number reservation | ⬅ | Tables `contract_templates`, `contract_clauses`, `contract_events`; RPC `reserve_contract_number`. Largest single gap. |
| POS | ◐ | Web: held orders (hold/resume), terminals, completion and print views. Mobile POS is ~330 lines with no hold/resume, no terminal handling, no receipt printing. Web POS is disabled by default (`NEXT_PUBLIC_POS_ENABLED`). |
| Agents and cash-on-delivery (agent advances, agent settlements, post-COD settlements) | ⬅ | No web UI. |

## Business

| Capability | Status | Notes |
|---|---|---|
| Products and services | ✅ *depth audit* | Mobile `ProductForm` is 967 lines. |
| Product import (CSV/PDF) | ➡ | Mobile has no import. |
| Branch stock transfer, preferred branch | ⬅ | `transferProductBranchStock`, `set_preferred_branch`. |
| Inventory view | ✅ | |
| Expenses | ✅ *depth audit* | |
| Vendors | ✅ | |
| Supplier bills | ◐ | Mobile has bill line items (`supplier_bill_items`) and bill scanning (`process-bill`); web has neither. |
| Vendor payments | ◐ | Mobile: dedicated form and list; web: one generic page. |
| Other income | ✅ | |
| Vendor ledger | ⬅ | |

## Finance

| Capability | Status | Notes |
|---|---|---|
| Bank accounts (manage, share) | ◐ | Mobile deeper. |
| Fund transfers, fund balances | ⬅ | |
| Reports: AR aging, cash flow, gross sales, cash balances | ◐ | Mobile has dedicated reports; web has little or none (gross sales: none). |
| Sales book / tax reports | ✅ *depth audit* | |
| Accounting periods | ✅ | |
| Journals, cost centres, projects, posting rules | ➡ | Web is much deeper. |
| Trial balance, P&L | ✅ *depth audit* | |
| Payroll (runs, approvals, payment batches, adjustments, tax/pension config) | ➡ | Web is full; mobile has two screens only. |
| Stripe dashboard (stores, balances, payouts, transactions, payout settlements) | ⬅ | |

## Administration

| Capability | Status | Notes |
|---|---|---|
| Team and user access | ✅ | Web has the deeper RBAC workflow. |
| Multi-company (switch, archive, parent company) | ◐ | Mobile deeper. |
| Settings, templates | ✅ *depth audit* | |
| Billing and subscription | ✅ | |
| API keys, webhooks, request logs | ➡ | |
| Audit log viewer, feature flags, compliance config | ➡ | |
| Integration events and entity links | ➡ | |
| Data export (CSV/Excel) | ◐ | Web 8 files, mobile 3. |
| Global search | ⬅ | |

## Out of scope for parity (confirm)

- Native-only: biometric lock, push notifications, camera/QR scanning, mail composer.
- Booking integration (`booking_invoice_*`): web-only product link.
- The AI assistant: removed.

## Proposed tiers

1. **Core daily workflows:** invoices/quotes, customers, payments, products, expenses, vendors, supplier bills, vendor payments, income, POS. Do the depth audits and close differences.
2. **Finance and admin:** reports, bank accounts and fund transfers, payroll on mobile, accounting depth on mobile, API/webhooks/audit on mobile, multi-company, data export.
3. **Specialized:** contracts (templates/builder), agents and COD, Stripe dashboard, recurring invoices, customer portal links.

Cross-cutting (needed for "used simultaneously"):
- Live updates between devices (no realtime in the invoicing code today).
- Conflict protection (version checks) on shared records.
- Move business rules (pricing, tax, numbering, validation) into shared packages so both apps call the same code.

## Invoice form audit (2026-10-28)

Both apps call the same shared save path. Differences found, and status:

| Difference | Direction | Status |
|---|---|---|
| TAK sales-book treatment (`tax_reporting_category`) selector | web had it, mobile did not | **Done.** Shared list `TAX_REPORTING_CATEGORIES` in `packages/api/src/domain.ts` (test keeps it in sync with the DB constraint); mobile picker added; web renders from the shared list. Albanian wording needs accountant review. |
| Post-COD flag when delivery method is "Delivery" | mobile only | **Done** on web (loads, saves, resets when the method changes). |
| Due-date presets | both had them, **but different math**: web "1 month" = +30 days, mobile = +1 calendar month (clamped to month end) | **Done.** Shared `dueDateForPreset` in `domain.ts`; web and mobile both use it. |
| Per-branch stock shown when adding items | mobile only | **Done** on web: the item picker shows branch stock, and a hint under the line turns red when the quantity exceeds it. |
| Email the invoice to the customer | mobile uses the native mail composer (out of scope); web has a `mailto:` Send button | **No change needed.** Server-side sending would need the company SMTP settings (`send-email` takes SMTP credentials from the caller and requires `settings.integrations`), so it is a separate decision. |
| Record payment from the invoice detail | mobile opens the payment form for the invoice | **Done** on web: a "Record payment" button on the detail page opens Payments with the invoice, customer, outstanding amount and today's date filled in. |
| POS flow inside the invoice form (`completePosSale`) | mobile only | Tracked under POS. |
| Delivery methods | web: pickup, delivery, bus/carrier, other | **Already matched:** mobile has all four (the earlier note was out of date). |

Verification: shared domain tests (7), web tests (63), web type check, web production build and mobile type check pass.
