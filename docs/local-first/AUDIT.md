# Local-first audit (2026-10-28)

Goal: a free tier where business data lives on the user's device (mobile: on-device SQLite, web: SQLite
in the browser), and a paid cloud plan (cloud backup/sync, multiple tenants, several users and
permissions, payment links, customer/invoice portal links, Developers API/webhooks).

This audit is read-only. It lists every place the apps talk to the backend and sorts the work.

## How big is the surface

| Area | Files that call the backend | Tables | Stored procedures (RPC) | Other |
|---|---|---|---|---|
| Mobile app (`src/`) | 54 | 46 | 22 | 2 edge functions (`business-notification`, `process-bill`), storage in 2 files, auth in 2 files |
| Web app (`src/`) | 57 | 76 | 54 (most through the shared package) | auth in 27 files, storage in 1 file |
| Shared `packages/api` | 3 (`repositories.ts`, `workspace.ts`, `domain.ts`) | 25 | 48 | the natural home for the new data layer |

No realtime subscriptions exist in either app, so there is nothing live to preserve.

Both apps already route a large part of their writes through `packages/api/src/repositories.ts`
(about 120 exported functions). That is the seam for the new data layer; the remaining direct
`supabase.from(...)` calls in screens and components have to move behind it.

## Approximate size per module (files to move onto the data layer)

| Module | Mobile | Web |
|---|---|---|
| Invoicing, quotes, POS | ~9 | ~13 |
| Payments, cash & bank, income | ~7 | ~5 |
| Customers, products, stock | ~3 | ~3 |
| Expenses, vendors, supplier bills | ~10 | ~7 |
| Reports, dashboard, tax book | ~8 | ~1 |
| Accounting, contracts | ~4 | ~1 |
| Payroll, employees | ~2 | ~3 |
| Team, billing, API, portal, auth, settings (mostly paid / cloud-only) | ~10 | ~20 |

(Counts come from file names and are approximate. Settings and company screens are mixed: part
stays local, part is cloud-only.)

## Where the business rules live today

The important finding: most business rules are **database functions**, not app code. A local mode
needs the same rules in TypeScript. From `packages/api` and the mobile app, grouped:

**Must exist locally for the free core (~35 functions)**
- Documents: `reserve_invoice_number`, `save_invoice_document_with_stock`,
  `replace_posted_invoice_document`, `transition_commercial_document`, `convert_commercial_document`,
  `delete_invoice`, `post_credit_note`, `set_invoice_delivery_method`, `set_invoice_delivery_details`,
  `set_invoice_operating_branch`, `set_invoice_product_pictures`, `complete_pos_sale_with_signature`,
  `ensure_walk_in_customer`, `apply_delivery_fulfillment`, `reserve_contract_number`
- Payments and money: `record_customer_payment` (+`_financial`, `_with_bank_account`),
  `allocate_customer_payment`, `reverse_customer_payment`, `update_customer_payment_with_bank_account`,
  `record_supplier_payment` (+`_with_bank_account`), `allocate_expense_payment`, `post_expense`,
  `correct_expense` (+`_with_vat`), `delete_expense`, `record_other_income`, `create_fund_transfer`,
  `set_fund_opening_balance`
- Stock: `set_product_branch_stock`, `transfer_product_branch_stock`, `delete_product`,
  `set_preferred_branch`

**Can wait (cloud-only at first, moved later)**
- Tax book: `ensure_sales_book_period`, `mark_sales_book_declared`, `create/apply_sales_book_amendment`
- Agents and cash on delivery: `create_agent_advance`, `create_agent_settlement`,
  `create_post_cod_settlement`, `list_company_agents`, `create_stripe_payout_settlement`
- Payroll: `create_payroll_period`, `save_payroll_configuration`, `save_employee_payroll_profile`,
  `set_payroll_feature_flags` and about 18 payroll tables
- Accounting ledger: journals, posting rules, trial balance, P&L views (`operix_*`). Today these are
  produced by database posting rules from invoices, payments and expenses.

**Never local (these are the paid features, server-enforced)**
- Team and permissions: `rbac_*`, `get_my_company_role`, `list_company_invitations`,
  `verify_invite_token`, `memberships`, `app_roles`, `membership_*`
- Multiple tenants: `set_company_parent`, `archive_company`, `set_active_company`, bank-account sharing
- Portal links: `customer_portal_tokens`, public invoice page
- Payment links: `payment_links`, Stripe tables
- Developers: `api_keys`, `api_webhook_endpoints`, `api_webhook_deliveries`, `api_request_logs`
- Billing: `subscription_accounts`, `get_product_billing_summary`
- Push notifications: `operix_push_device_tokens`, `business-notification`
- `repair_unposted_*`, audit log, integration events: server maintenance, not needed locally

## Tables by group

- **Local core (about 25):** `clients`, `products`, `product_branch_stock`, `branches`, `invoices`,
  `invoice_items`, `payments`, `payment_allocations`, `expenses`, `vendors`, `supplier_bills`,
  `supplier_bill_items`, `vendor_payments`, `other_income`, `other_income_categories`,
  `company_bank_accounts`, `company_fund_accounts`, `company_fund_transactions`,
  `document_sequences`, `commercial_document_events`, `document_source_links`, `invoice_templates`,
  `contracts`, `contract_templates`, `contract_events`, plus settings from `companies`/`profiles`
- **Later, local:** accounting (`chart_of_accounts`, `journal_entries`, `journal_entry_lines`,
  `accounting_periods`, `posting_rule_sets`, cost centres, projects), tax book (`kosovo_sales_book*`),
  payroll (about 18 tables), agents and COD, held POS orders and terminals
- **Cloud only (paid):** everything in the "never local" list above

## Mobile-specific notes

- Auth (Supabase sign-in) stays; a free account holds no business data.
- `process-bill` (bill scanning) and `business-notification` (push) are server features. Bill scanning
  would need an on-device alternative or move to the paid plan.
- Storage is used for attachments and images (2 files). Local mode keeps these as files on the device.
- Mobile currently has a few queries that were wrong against the live schema
  (`operix_cash_flow.net_change`, `profiles.full_name`); the data layer work should remove the raw
  queries that caused them.

## Web-specific notes

- Auth is used in 27 files (route handlers, server pages). Server routes (PDF, billing, developers,
  webhooks, cron) stay server-side and are paid or hosted-only. Local mode needs a client-side PDF/print
  path, because the current PDF route uses a server-side browser.
- The web pages mostly use the generic `resource-config` system, which is good for the data layer:
  one adapter can serve customers, products, expenses, vendors, bills and vendor payments.

## Recommended first cut (Step 1 and 2 of the plan)

1. Introduce `DataStore` in `packages/api` and port the ~35 core functions to a shared TypeScript
   engine (numbering, totals/stock, payment allocation, expense posting). Keep the database functions
   for cloud mode.
2. Shared conformance tests: the same scenarios run against the TypeScript engine and the database
   functions, so both modes cannot drift apart.
3. Move direct `supabase.from(...)` calls in mobile and web onto `DataStore`, module by module,
   starting with customers/products (simple), then expenses/vendors/bills, then invoices/payments.
4. Mark each paid feature with a feature key (`cloud_backup`, `multi_tenant`, `team_access`,
   `payment_links`, `portal_links`, `developer_api`) and check it in the database and server routes.

## Risks to decide early

- **Accounting is database-driven.** Reports that depend on journals (P&L, balance sheet, trial
  balance) need either a local posting engine or to be cloud-only at launch.
- **Numbering and tax records.** Local invoices are numbered per device. Two devices on one free
  account cannot share a sequence; this is a reason cloud sync is a paid feature.
- **Neither app is SEF compatible.** Show this clearly in both apps and in the open-source README.

## Decisions (2026-10-28)

- **Paid plan:** cloud backup and sync between devices, multiple tenants, several users and
  permissions, payment links, customer/invoice portal links, Developers (API keys, webhooks, request
  logs), and document scanning (`process-bill`).
- **Free plan:** everything else, for one company and one user, stored on the device. Free export and
  import of a backup file. Emailing through the user's own mail app. PDFs and printing on the device.
- **Both apps are free to use and neither is SEF compatible.** The web app is open source.
- **Invoice numbering:**
  - Free: each device has its own series (a short device code as prefix, for example `A-2026-0001`),
    kept strictly consecutive. No server involved, works offline, devices can never collide. Backup
    files carry their series, so importing one cannot clash with another.
  - Paid: the normal shared server sequence (`reserve_invoice_number` / `document_sequences`), one
    consecutive series per company for all devices.
  - Upgrading: existing local numbers stay as issued. The cloud series continues from the highest
    shared sequence; documents already issued keep their device-series numbers.
  - Open item: confirm with the accountant that several consecutive series (one per device) are
    acceptable for Kosovo tax purposes.

## Progress

- **Step 1, part 1 (done): `packages/data-store`.** `DataStore` / `DocumentStore` interfaces, free-vs-paid
  feature keys (`features.ts`), a SQLite driver interface (`driver.ts`), the on-device engine
  (`local.ts`: collections, device-series numbering, invoice save with the shared calculation and stock
  rule, payments with cash limit / overpayment / reversal, backup export and import with checksum and
  merge rules), and a cloud adapter for collections and numbering (`cloud.ts`). 14 tests run against
  node:sqlite (`npm test` in the package).
- **Step 1, part 2 (done):** driver adapters for expo-sqlite (mobile) and the official sqlite-wasm (web), both
  structural (no dependency added yet), and the cloud adapter now delegates invoices and payments to the
  existing `saveInvoiceDocument`, `saveCustomerPayment` and `reverseCustomerPayment`. 18 tests pass.
- **Next:** (a) add `expo-sqlite` to the mobile app (native module, needs a new TestFlight build) and
  `@sqlite.org/sqlite-wasm` to the web app; (b) a conformance suite that runs the same scenarios against
  the local engine and the cloud store; (c) move screens onto `DataStore`
  module by module (customers/products first); (d) server-side enforcement of the paid feature keys;
  (e) storage-mode switch and the upgrade upload.
