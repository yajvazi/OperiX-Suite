# OperiX Invoice Mobile UX Revamp Audit

**Date:** 2026-08-07  
**Scope:** `apps/OperiX Invoice/OperiX Invoice Mobile`  
**Audit status:** Complete before redesign implementation

## Current navigation tree

The mobile app is an Expo React Native application using React Navigation 7. Authentication and the logged-in application are split at the root:

```text
NavigationContainer
├── AuthStack (when no Supabase user)
│   ├── SignIn
│   ├── SignUp
│   └── JoinTeam
└── RootStack (when authenticated)
    ├── MainTabs
    │   ├── Dashboard -> DashboardScreen
    │   ├── InvoicesTab -> InvoicesStack
    │   │   ├── FaturatMain -> FaturatScreen
    │   │   ├── InvoicesList -> InvoicesScreen
    │   │   ├── AllInvoices -> AllInvoicesScreen
    │   │   ├── InvoiceForm -> InvoiceFormScreen
    │   │   ├── InvoiceDetail -> InvoiceDetailScreen
    │   │   ├── ContractForm / ContractDetail
    │   │   ├── PaymentForm / PaymentsList
    │   │   ├── VendorForm / VendorsList
    │   │   ├── VendorPaymentForm / VendorPaymentsList
    │   │   ├── SupplierBillForm / SupplierBillsList / ScanBill
    │   │   ├── ExpenseForm
    │   │   └── report/ledger screens
    │   ├── Management -> ManagementStack
    │   │   ├── ManagementTabs -> ManagementScreen
    │   │   ├── ManagementDashboard
    │   │   ├── ClientsList / ClientForm
    │   │   ├── ProductsList / ProductForm
    │   │   ├── VendorsList / VendorForm
    │   │   ├── ExpensesList / ExpenseForm
    │   │   └── ledger screens
    │   └── Payroll -> PayrollScreen
    ├── QRScanner
    ├── Settings -> SettingsStack
    │   ├── SettingsMain
    │   ├── TemplateEditor
    │   ├── ContractTemplates / ContractTemplateEditor
    │   ├── InvoiceTemplateSettings
    │   ├── PaymentIntegrations / StripeDashboard
    │   ├── ManageCompanies
    │   └── AdvancedSettings
    └── Profile
```

The app has no drawer. `app.json` declares the `operix-invoice` scheme, but there is no React Navigation `linking` configuration or explicit screen path map. The QR scanner has an internal `returnTo` convention, not a full deep-link registry.

## Existing screen inventory

### Authentication and access control

- `SignInScreen`, `SignUpScreen`, `JoinTeamScreen`, and `ApprovalPendingScreen` are active authentication/onboarding paths.
- `AppNavigator` checks Supabase auth, employee approval status, and `profiles.biometric_enabled` before mounting the application.
- Biometric lock is a modal-like root replacement and must remain outside the new tab shell.
- Authorization is currently a mixture of Supabase/RLS and UI checks. The invoice detail screen checks `profile.role !== 'worker'` before destructive/edit actions; there is not yet a centralized mobile permission selector.

### Daily work

- `DashboardScreen` fetches profiles, invoices with items, expenses, clients, products, low-stock products, and optionally Stripe summaries. It currently contains dense stat rows, a chart, Stripe HUD, top clients/products, activity, and quick actions.
- `FaturatScreen` is a large ERP document hub with Finance, Legal, and Reports tabs. It is the current first screen inside `InvoicesTab` and exposes many low-frequency documents directly.
- `InvoicesScreen` and `AllInvoicesScreen` are overlapping invoice/offer/contract list surfaces. The former deliberately limits the query to five records; the latter is the broader list.
- `InvoiceFormScreen` contains the full invoice/offer creation/edit workflow and existing calculation/posting behavior.
- `InvoiceDetailScreen` loads the invoice, client, profile, and items and owns preview, PDF, share/email/print, status updates, conversion, and deletion.
- `PaymentsListScreen` and `PaymentFormScreen` provide client payment recording/listing.
- No dedicated POS screen exists in the mobile app. The `packages/offline-pos` package exists and is tested, but the mobile app does not expose a POS workflow.

### Business data

- `ClientsScreen` / `ClientFormScreen` manage customers and customer ledgers.
- `ProductsScreen` / `ProductFormScreen` manage products, pricing, tax, SKU/barcode, and optional stock fields.
- `ExpensesScreen`, `ExpensesDashboardScreen`, `ExpensesListScreen`, and `ExpenseFormScreen` are overlapping expense/income surfaces.
- `VendorsScreen`, `VendorFormScreen`, supplier bill screens, vendor payment screens, and bill scanning cover supplier operations.
- `ManagementScreen` is a second operational overview with counts and module cards. `ManagementDashboardScreen` is a further, mostly duplicated management landing surface.

### Advanced and support surfaces

- `PayrollScreen` is a read-oriented payroll status screen. Its copy correctly states that sensitive payroll setup/finalization/bank exports remain restricted to authorized desktop roles.
- `ReportPreviewScreen`, `CustomerLedgerScreen`, and `VendorLedgerScreen` expose reports and ledgers.
- Contract creation/detail and contract template screens exist.
- Settings include company management, templates, payment integrations, Stripe dashboard, advanced settings, and profile.
- `QRScannerScreen` is used by products/bills and is registered at the root.
- No mobile offline status screen or demo mode was found. Offline POS functionality must not be implied by the redesign.
- No mobile-specific feature flag registry was found. Existing feature availability is inferred from current screens, profile fields, and backend/RLS behavior.

## Problems found

### Information architecture and cognitive load

1. The primary shell exposes ERP modules instead of business tasks: Dashboard, Invoices, Management, and Payroll.
2. Accounting, payroll, reports, products, vendors, expenses, and settings are not grouped by frequency or user intent.
3. `FaturatScreen` exposes a large document taxonomy as a primary tab root, mixing invoices, fiscal documents, contracts, ledgers, supplier bills, and reports.
4. `ManagementScreen`, `ManagementDashboardScreen`, and the list screens duplicate operational entry points.
5. Invoice lists are split across `InvoicesScreen` and `AllInvoicesScreen`; the primary list only fetches five records.
6. Expenses have three overlapping list/dashboard surfaces and are not discoverable from a stable business area.
7. There is no POS destination even though POS is a high-frequency workflow requested by the product direction.
8. There is no global create action or global search surface.

### Navigation correctness

The following references were found during static inspection:

- `InvoiceFormScreen.tsx` calls `navigation.navigate('ManagementTab', { screen: 'ClientForm' })`, but no `ManagementTab` route is registered. The registered tab is `Management`; the registered stack screen is `ManagementTabs`.
- `FaturatScreen.tsx` also calls `navigation.navigate('ManagementTab', { screen: 'ClientForm' })`, with the same invalid route.
- `DashboardScreen.tsx` calls `navigation.navigate('ExpensesTab', { screen: 'ExpenseForm' })`, but no `ExpensesTab` route is registered. `ExpensesStack` exists but is not mounted in `RootStack` or `MainTabs`.
- Several nested screens rely on untyped navigation bubbling to reach parent routes (`QRScanner`, `Settings`, `MainTabs`, and other stack routes), making invalid destinations compile and fail only at runtime.
- `ManagementDashboardScreen` uses `ManagementTabs` with an `activeTab` parameter, but `ManagementScreen` does not implement a typed/declared route contract for that parameter.
- `ProfileScreen` is registered but is not reachable from the current visible navigation tree.
- There is no explicit deep-link screen map, so the declared scheme is not enough to guarantee detail-screen routing from external links or notifications.

### Data, performance, and state

- Several primary screens fetch all matching records without pagination or virtualization (`DashboardScreen`, clients, products, expenses, and parts of management).
- `DashboardScreen` loads full invoice items for the entire invoice dataset and calculates charts/top clients/products on-device for the first screen.
- `InvoicesScreen` hard-limits the visible query to five records; this is not an intentional UX limit and hides existing data.
- Many screens repeat profile/company lookups rather than sharing workspace context.
- Loading/error state coverage is inconsistent. A number of list screens render empty content without a distinct error/retry state.
- Some destructive operations call Supabase directly and refresh without surfacing the returned error.
- The dashboard hardcodes `growth: 12.5`, which violates the requirement not to display fake financial trends.

### Type and contract health

Baseline `tsc --noEmit` findings include:

- React Navigation 7 navigator components require the new `id` contract in the current dependency/type combination.
- `classic.ts` and `modern.ts` use `config.visibleColumns.price`, while the shared `TemplateConfig` contract uses `unitPrice`.
- `kosovo.ts` uses `config.visibleColumns.tax`, while the shared contract uses `taxRate`.
- `InvoiceFormScreen.tsx` uses local `bank_transfer`, while the canonical shared `PaymentMethod` union uses `bank`.
- The current screens use broad `any` navigation props, which hides route defects.

## Retain unchanged or reuse as business logic

- Supabase client, authentication provider, biometric/approval checks, and existing RLS-bound queries.
- Invoice creation calculations, invoice numbering behavior currently used by the form, tax fields, payment allocation/status behavior, and PDF generation.
- Existing invoice, customer, product, vendor, expense, payment, contract, report, payroll, settings, QR, and template screens as feature implementations until their new entry points are proven.
- Existing shared UI primitives and `lucide-react-native` icon library.
- Existing brand assets, Poppins typography, and primary blue `#004FFE`.

## Relocate behind the new information architecture

- Invoices, quotes, customers, and payments -> `Sales` segmented surface.
- Products, inventory, expenses, vendors, and income -> `Business` menu/list surface.
- Accounting, reports, VAT/tax, payroll, and fiscalization-related entries -> `More > Finance` with availability/permission gates.
- Contracts and templates -> `More > Documents`.
- Company, team/users, integrations, and settings -> `More > Administration`.
- Help, about, and offline status -> `More > Support` where the capability exists.
- Existing POS/package capability -> new `POS` primary destination; unsupported stock-tracked checkout remains explicitly communicated.

## Consolidate or replace as primary destinations

- Replace the four-tab shell with exactly five tabs: `Home`, `Sales`, `POS`, `Business`, `More`.
- Replace `DashboardScreen` as a dense analytics dashboard with a task-focused Home surface. Keep valid data queries but remove fake trends and defer secondary analytics.
- Replace `FaturatScreen` as the invoice-tab root with a Sales root; retain the document hub as an advanced Documents/Finance entry only if needed.
- Use one invoice list/detail path as the primary invoice experience; keep legacy list screens reachable from advanced/compatibility paths until deep-link and replacement coverage are verified.
- Use one Business root for products, inventory, expenses, vendors, and income; keep existing CRUD forms and detail/ledger behavior.
- Use a single global create sheet instead of duplicated create grids on every landing screen.

## Screens to redesign

- Home/dashboard.
- Sales root and invoice list cards.
- POS root and cart/payment workflow.
- Business root and mobile list cards.
- More root and advanced navigation.
- Invoice detail summary/actions.
- Customer detail/activity view.
- Product detail/summary view.
- Global search and global create surfaces.
- Primary loading, empty, error, retry, and accessibility states.

## Screens intentionally hidden behind advanced navigation

- Accounting and ledger/report screens.
- Payroll.
- VAT/tax and fiscalization-related document/report entries.
- Contracts and contract templates.
- Supplier bills, vendor payments, and bill scanning.
- Invoice template editors, payment integrations, Stripe dashboard, advanced settings, and company management.

These are being relocated, not removed. Visibility must remain conditioned by the existing available data/role/permission signals, and backend/RLS remains authoritative.

## Functionality that cannot safely be moved without additional backend work

- Any new stock-tracked POS checkout behavior if current backend posting rejects it.
- Offline POS or offline financial posting; the package exists but production readiness is not established by the mobile app.
- Fiscalization production claims; the current app does not establish that the capability is ready for all companies/users.
- New global search SQL/RPC or cross-resource queries that bypass existing RLS. Search will use existing user/company-scoped queries and the same Supabase client.
- Journal posting, payment allocation, tax calculations, invoice numbering, immutable receipt behavior, accounting periods, and auth semantics.

## Audit conclusion

The current app has the underlying CRUD and financial building blocks required for a safer mobile-first shell, but the current navigation is a compressed ERP menu and has runtime-invalid route references. The revamp can proceed conservatively by introducing a typed root shell and mobile surfaces while preserving existing detail/forms/services behind stable routes. No production infrastructure or database behavior is required for the navigation redesign.
