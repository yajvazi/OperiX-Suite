# OperiX Invoice Mobile documentation inventory

Audit basis: the current source tree under `apps/OperiX Invoice/OperiX Invoice Mobile`, shared packages under `packages/`, Supabase migrations under `supabase/migrations/`, and the mobile navigation/typecheck tests. “Implemented” means discoverable in the current code; it does not mean that a tenant has enabled every backend permission or integration.

## Status labels

- ✅ Production — implemented and reachable in the mobile code path audited.
- 🟡 Partial — visible or callable, but with a verified limitation, backend dependency, or incomplete workflow.
- 🧪 Experimental — explicitly developer/test path or a capability not presented as a normal business workflow.
- 🚧 In development — source indicates work is in progress.
- 🔒 Internal — intended for internal operators/developers.
- ⛔ Disabled — deliberately unavailable in the current configuration.
- ❌ Broken — verified build/runtime defect; the defect is recorded in [Known limitations](./KNOWN-LIMITATIONS.md).

## Navigation and screens

| Feature / screen | Route or entry point | Relevant source | Audience | Status | Documentation | Screenshot / limitation | Related |
|---|---|---|---|---|---|---|---|
| Sign in | Auth `SignIn` | `screens/Auth/SignInScreen.tsx`, `packages/context/src/AuthContext.tsx` | User | ✅ | `en/getting-started/sign-in-and-account.md`, `sq/...` | Login error and loading states | Sign up, session |
| Sign up and email OTP | Auth `SignUp` | `screens/Auth/SignUpScreen.tsx` | User | 🟡 | same auth page | OTP is implemented; password reset is not exposed | Auth |
| Join a team | Auth `JoinTeam` | `screens/Auth/JoinTeamScreen.tsx` | Invited user | ✅ | same auth page | Uses `verify_invite_token`; approval can require a restart | Companies, roles |
| Approval pending | Auth gate | `screens/Auth/ApprovalPendingScreen.tsx`, `AppNavigator.tsx` | Invited user | 🟡 | same auth page | Check status does not force the root navigator to re-render | Auth |
| Biometric lock | Auth gate | `AppNavigator.tsx`, `SettingsScreen.tsx` | User | ✅ | `en/settings/preferences-and-templates.md` | Uses device authentication; no claim of account recovery | Security |
| Home dashboard | Bottom tab `Home` | `screens/Home/HomeScreen.tsx` | User | ✅ | `en/dashboard/home.md` | Queries invoices, payments, expenses, tracked products | Sales, products |
| Sales | Bottom tab `Sales` | `screens/Sales/SalesScreen.tsx` | User | ✅ | `en/documents/commercial-document-types.md` | Horizontal quick actions and document trail | Documents |
| POS | Bottom tab `POS` / tab label Invoice | `screens/POS/POSScreen.tsx` | User/worker | 🟡 | `en/pos/point-of-sale.md` | Cart is local screen state; checkout goes through invoice form | Invoices, inventory |
| Business | Bottom tab `Business` | `screens/Business/BusinessScreen.tsx` | User | ✅ | `en/company/business-workspace.md` | Inventory shortcut is product-backed | Products, expenses, vendors |
| More | Bottom tab `More` | `screens/More/MoreScreen.tsx` | User | ✅ | `en/dashboard/home.md`, settings pages | Worker role hides Payroll and GlobalCreate product/expense actions | Permissions |
| Global search | Modal `GlobalSearch` | `screens/Search/GlobalSearchScreen.tsx` | User | ✅ | `en/dashboard/home.md` | Search fields are limited to implemented query sources | Documents, customers |
| QR scanner | Modal `QRScanner` | `screens/Invoices/QRScannerScreen.tsx` | User | 🟡 | `en/invoices/qr-scanner.md` | Used to inspect invoice QR data or restore SKU/bill flows; no claim of universal QR support | Products, invoices |
| Help and support | `HelpSupport`, `HelpCategory`, `HelpArticle` | `screens/Support/HelpSupportScreen.tsx`, `HelpCategoryScreen.tsx`, `HelpArticleScreen.tsx`, `components/mobile/HelpCenterUI.tsx`, `services/helpDocumentation.ts`, generated `src/generated/mobileDocs.ts` | User | ✅ | `en/settings/help-and-about.md` | Bundled Markdown index, local search, language switch, categories, related articles, recent article IDs, and external contact links | About, InvoiceForm, TaxCenter, documentation maintenance |
| About | `About` | `screens/About/AboutScreen.tsx` | User | ✅ | `en/settings/help-and-about.md` | App version is hard-coded as 1.0.0 in screen | Support |

## Registered compatibility, redirect, and source-only screens

| Screen | Source / route situation | Status | Documentation note |
|---|---|---|---|
| `ProfileScreen` | `RootStack.Profile`; immediately replaces itself with `Settings > SettingsMain` | 🟡 | There is no separate profile destination in the current UX; document profile fields through settings |
| `DashboardScreen` | Source file exists and contains a larger legacy dashboard with privacy mode, six-month chart, top clients, most-sold product, low stock, and Stripe summary; it is not a current bottom-tab destination in `AppNavigator.tsx` | 🔒 Internal | Do not present its placeholder growth value or legacy calculations as the current Home dashboard |
| `ManagementScreen` / `ManagementDashboardScreen` | Registered through the `Management` compatibility navigator | 🟡 | Legacy management statistics and cards remain available to compatibility callers; current users use Business/More |
| `FaturatScreen` | Registered through `InvoicesTab` compatibility navigator | 🟡 | Older invoice dashboard with static/legacy sections; current Sales and invoice routes are the primary flow |
| `ExpensesDashboardScreen` / `ExpensesListScreen` | Defined in `LegacyExpensesNavigator`, but not a current bottom-tab route | 🟡 | Expense pages are documented from the reachable Expenses screens; verify route registration before exposing a new entry point |
| Location permission | Expo config includes `expo-location` attendance permission | 🟡 | No current mobile attendance screen or location query was found in the audited source |
| Notifications icon | Home bell displays an in-app “caught up” alert | 🟡 | No push notification registration or reminder engine was found |

## Sales and commercial documents

| Feature | Route / source | Status | Documentation | Verified behavior / limitation |
|---|---|---|---|---|
| Invoice list and filters | `InvoicesScreen.tsx`, `AllInvoicesScreen.tsx` | ✅ | `en/invoices/invoice-detail-and-statuses.md` | Lists tenant-scoped invoices; legacy list remains registered |
| Shared invoice/document form | `InvoiceFormScreen.tsx`, `navigation/types.ts` | ✅ | `en/invoices/create-and-edit.md` | One form carries explicit `commercial_document_type` and legacy compatibility fields |
| Invoice detail | `InvoiceDetailScreen.tsx` | ✅ | `en/invoices/invoice-detail-and-statuses.md` | Loads payments, source links, events, and related invoices |
| Invoice PDF preview | `InvoiceDetailScreen.tsx`, `services/pdf/TemplateFactory.ts` | ✅ | `en/invoices/pdf-sharing-and-printing.md` | Preview path currently calls the corporate template; native service supports corporate/thermal |
| PDF share, email composer, print | `services/pdf/pdfService.ts`, `expo-mail-composer` | ✅ | same PDF page | Email composing is local; the screen does not prove delivery or acceptance |
| Quote / Ofertë | `commercial-documents`, `InvoiceFormScreen.tsx` | ✅ | `en/documents/commercial-document-types.md` | Non-posting operational document; conversion to order/invoice exposed |
| Proforma / Pro-faturë | same | ✅ | same | Payment/advance semantics are represented in domain code, but mobile does not implement a separate payment-to-advance wizard |
| Sales order / Porosi | same | ✅ | same | Ordered/delivered/remaining line fields exist in schema; mobile fulfillment UI is limited |
| Delivery note / Fletëdërgesë | same | 🟡 | same | Delivery status and fulfillment RPC exist; dedicated mobile confirmation/signature workflow is limited |
| Advance invoice | same | 🟡 | same | Type and conversion exist; mobile form does not fully reconcile multiple advances from a dedicated wizard |
| Final invoice | same | 🟡 | same | Type and conversion exist; advance amount field exists; complete reconciliation depends on backend contracts |
| Credit note | same | 🟡 | `en/documents/conversions-and-related-documents.md` | Conversion requires original document; partial-credit constraints are database-backed, but mobile does not expose every reason/line control |
| Debit note | same | 🟡 | same | Conversion exists; mobile is not a full legal correction editor |
| Simplified invoice | shared type | 🟡 | same | Type is recognized by shared domain/detail code but not a distinct quick-create action |
| Fiscal receipt / Kupon Fiskal | shared type, EFS status | ⛔ | `en/fiscalization/status-and-eligibility.md` | EFS status is `EFS NOT CERTIFIED`; production fiscalization is disabled |
| Bad-debt invoice | shared type | 🔒 Internal | `en/documents/commercial-document-types.md` | Exists in shared domain/storage vocabulary, not exposed as a normal mobile creation action |
| Commercial conversion | `InvoiceDetailScreen.tsx`, RPC `convert_commercial_document` | ✅ | `en/documents/conversions-and-related-documents.md` | Supported paths are explicit; conversion creates a new document and preserves source links |
| Timeline/events | `commercial_document_events`, `InvoiceDetailScreen.tsx` | ✅ | same | Events are displayed when present; email delivery/viewed evidence is not automatically established by local compose |
| Number reservation | RPC `reserve_invoice_number`, `AdvancedSettingsScreen.tsx` | 🟡 | `en/settings/preferences-and-templates.md` | Transactional allocator exists; settings UI and legacy prefixes must be kept consistent |

## Master data, money, and operations

| Feature | Route / source | Status | Documentation | Verified behavior / limitation |
|---|---|---|---|---|
| Customers | `ClientsScreen.tsx`, `ClientFormScreen.tsx`, `CustomerDetailScreen.tsx` | ✅ | `en/customers/manage-customers.md` | Company-scoped; registry link opens ATK website; delete is direct and not labeled archive |
| Customer ledger | `CustomerLedgerScreen.tsx` | ✅ | `en/customers/manage-customers.md` | Linked from customer detail/reports |
| Products/services | `ProductsScreen.tsx`, `ProductFormScreen.tsx`, `ProductDetailScreen.tsx` | ✅ | `en/products/manage-products.md` | One product table supports product/service categories and stock flags |
| Product barcode/SKU scanner | `ProductsScreen.tsx`, `ProductFormScreen.tsx`, `QRScannerScreen.tsx` | 🟡 | `en/products/manage-products.md` | Scanner supports product entry/lookup; not a documented end-to-end warehouse scanner |
| Inventory/low stock | `BusinessScreen.tsx`, `ProductsScreen.tsx`, POS | 🟡 | `en/inventory/stock-and-low-stock.md` | Stock fields and POS deduction RPC exist; no complete mobile adjustment/warehouse UI was found |
| Customer payments | `PaymentFormScreen.tsx`, `PaymentsListScreen.tsx` | ✅ | `en/payments/record-customer-payment.md` | RPC posts payment and allocation; payment number generation in form is count-based |
| Vendor payments | `VendorPaymentFormScreen.tsx`, `VendorPaymentsListScreen.tsx` | ✅ | `en/payments/vendor-payments.md` | Uses supplier-payment accounting RPC where available |
| Expenses and income | `ExpensesScreen.tsx`, `ExpenseFormScreen.tsx` | ✅ | `en/expenses/record-expenses-and-income.md` | Expense posting uses RPC; income mode inserts an income row based on invoices/expense table behavior |
| Vendors | `VendorsScreen.tsx`, `VendorFormScreen.tsx`, `VendorLedgerScreen.tsx` | ✅ | `en/company/suppliers-and-bills.md` | Contact/business fields and ledger are available |
| Supplier bills | `SupplierBillsListScreen.tsx`, `SupplierBillFormScreen.tsx`, `ScanBillScreen.tsx` | 🟡 | same | Scan pre-fills bill data; accounting/posting depends on backend and permissions |
| Contracts | `ContractFormScreen.tsx`, `ContractDetailScreen.tsx` | ✅ | `en/documents/contracts.md` | Service agreement, NDA, employment, and general types are represented; signing is not presented as qualified e-signature |
| Contract templates | `Settings/Contracts/*` | ✅ | same | Templates store fields/content; separate from invoice templates |
| Payroll | `PayrollScreen.tsx` | 🟡 | `en/company/payroll.md` | Screen reads payroll runs/snapshots/liabilities; access is hidden for worker role |

## Finance, compliance, and administration

| Feature | Route / source | Status | Documentation | Verified behavior / limitation |
|---|---|---|---|---|
| Accounting shortcuts | `AccountingScreen.tsx` | 🟡 | `en/accounting/accounting-workspace.md` | Mobile links to books/ledger and states that posting is governed by backend permissions |
| Reports | `ReportsHubScreen.tsx`, `ReportPreviewScreen.tsx` | ✅ | `en/reports/financial-reports.md` | Queries report views; export prints a landscape table with a limited column/row view |
| Tax center | `TaxCenterScreen.tsx` | 🟡 | `en/taxes/tax-center.md` | Books and declaration previews are exposed; EFS warning is always relevant to current status |
| Fiscalization status | `TaxCenterScreen.tsx`, `kosovo_efs_status` | ⛔ | `en/fiscalization/status-and-eligibility.md` | No production TAK/EFS acceptance is claimed by the mobile code |
| Company switching/hierarchy | `ManageCompaniesScreen.tsx`, workspace service | ✅ | `en/company/manage-companies-and-members.md` | Main companies include descendants; selected subdivision does not include parent/siblings |
| Members, roles, invitations | `ManageCompaniesScreen.tsx`, company RPCs | ✅ | `en/users-and-permissions/roles-and-access.md` | Owner/admin/worker plus app roles; permission denial is backend-enforced |
| Profile/preferences | `SettingsScreen.tsx`, theme context | ✅ | `en/settings/preferences-and-templates.md` | Language/theme/brand color and profile/company assets auto-save on edit end |
| Advanced settings/data export | `AdvancedSettingsScreen.tsx` | 🟡 | same | JSON/CSV export is client-side and reads a bounded set of tables; sequence controls are not fully generic |
| Invoice templates | `InvoiceTemplateSettingsScreen.tsx`, `TemplateEditorScreen.tsx` | 🟡 | same | Shared type has broad template options; mobile PDF factory currently exposes corporate/thermal behavior |
| Stripe/PayPal integration | `PaymentIntegrationsScreen.tsx`, `StripeDashboardScreen.tsx`, `stripeService.ts` | 🟡/🧪 | `en/integrations/stripe-and-connected-services.md` | Stripe OAuth/Edge Function and developer API-key paths exist; PayPal is link-based; keys must not be placed in docs |
| Notifications/reminders | local alerts, mail composer, support FAQ | 🟡 | `en/notifications/alerts-and-device-actions.md` | No mobile push notification registration/handler was found in the audited source |

## Requested areas not found as complete mobile features

| Searched area | Evidence/status | Documentation treatment |
|---|---|---|
| Subscription/billing management | No mobile subscription, plan, or billing route/service was found in the audited source | Not presented as an app feature; website/support links are documented only |
| Customer portal | No customer-portal screen or mobile portal route was found | Mobile email/PDF sharing is documented; a portal is not claimed |
| Password recovery | No reset-password route or mobile recovery method was found | Documented as an authentication limitation |
| Push notifications/reminders | No Expo notification registration/handler was found | In-app alerts/device actions only |
| Attendance/location | `expo-location` permission exists in `app.json`; no current attendance screen/query was found | Marked partial/source configuration only |
| Refunds/returns/cashier close | No complete mobile screens were found | POS/document limitations explain the boundary |

## Cross-cutting status

| Area | Source | Status | Documentation |
|---|---|---|---|
| Supabase Auth/session | `packages/context/src/AuthContext.tsx` | ✅ | `developer/authentication/README.md` |
| Tenant scope | `src/services/workspace.ts`, RLS migrations | ✅/🟡 | `developer/security/README.md` |
| Translation files | `packages/i18n/src/index.ts` | 🟡 | `developer/localization/README.md` |
| Local persistence | AsyncStorage theme/language; no general sync queue | 🟡 | `developer/offline-sync/README.md` |
| PDF generation | Expo Print/Sharing | ✅ | `developer/pdf/README.md` |
| Tests/build | package scripts and navigation test | 🟡 | `developer/testing/README.md` |

## Features searched for but not represented as complete mobile workflows

The audit searched for invoice, customer, client, product, service, expense, payment, report, stock, inventory, VAT/tax, fiscal, receipt, proforma, offer, order, delivery, settings, tenant, company, user, role, permission, PDF, share, export, notification, sync, and offline. No complete mobile implementation was found for password reset, a customer portal screen, a persisted mobile offline queue, warehouse adjustment workflows, cashier shift closing, refund/return screens, or live production EFS fiscalization. They are documented as limitations rather than invented as features.
