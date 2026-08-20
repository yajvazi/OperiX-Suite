# OperiX Invoice Web UX Revamp Audit

**Date:** 2026-08-07  
**Scope:** `apps/OperiX Invoice/OperiX Web`  
**Comparison source:** `apps/OperiX Invoice/OperiX Invoice Mobile` and the supplied OperiX Invoice web/mobile redesign references  
**Audit status:** Complete before broad visual implementation

## Current route tree

The web app is a Next.js App Router application. Authenticated routes are grouped under `(app)` and rendered through `AppShell`; auth routes are grouped under `(auth)`. The route tree below is the user-facing surface found during static inspection.

```text
/
├── /login
├── /signup
├── /auth/callback
├── /dashboard
├── /invoices
├── /invoices/[id]                 # currently redirects to /pos
├── /invoices/new                  # currently redirects to /pos unless ?edit is present
├── /invoices/preview/[invoiceNumber]
├── /quotes
├── /pos
├── /pos/complete
├── /pos/complete/[invoiceCode]
├── /accounting
├── /reports
├── /payroll
├── /payroll/[section]
├── /payroll/runs/[id]
├── /inventory
├── /settings
├── /help
├── /management
├── /portal-links
├── /documents/print
├── /transactions/preview
├── /offline
├── /demo/[[...slug]]
├── /portal/[token]
├── /portal/[token]/invoice/[invoiceId]
├── /qr/[invoiceNumber]             # route handler, not an app screen
└── /[section]                      # generic ResourcePage for configured modules
    ├── /customers
    ├── /products
    ├── /payments
    ├── /expenses
    ├── /income
    ├── /vendors
    ├── /supplier-bills
    ├── /vendor-payments
    ├── /contracts
    ├── /recurring
    ├── /reminders
    ├── /payment-links
    └── /tax-reports -> /reports#tax-reports
```

The generic `[section]` route is a useful compatibility layer. It should remain available while the visible entry points are regrouped.

## Current navigation hierarchy

`src/components/app-shell.tsx` currently exposes a single desktop-oriented list:

```text
Dashboard
POS
Invoices
Payments
  ├── Payment Reminders
  ├── Online Payments
  ├── Income
  └── Expenses
Customers
Accounting
Payroll
  ├── Employees
  ├── Payroll Runs
  ├── Payslips
  ├── Payment Batches
  ├── Configuration
  └── Payroll Reports
Reports
Vendors
Products & Services
Settings
Help desk
```

On narrow screens the same sidebar is translated off-canvas and opened by a menu button. There is no persistent mobile bottom navigation or mobile-specific Sales/Business/More grouping.

## Major UX problems

### Information architecture

1. The first-level navigation is a flat ERP module list rather than a task model. Sales, Business, Finance, administration, and support are mixed together.
2. Quotes, contracts, inventory, income, vendor payments, supplier bills, and templates are not placed where a user would expect them from the native product.
3. `management` is a second operational hub duplicating the purpose of a Business area.
4. Payroll and accounting are presented as daily peers of invoices and POS even though they are role-sensitive advanced workflows.
5. There is no mobile equivalent of the native five-tab model: `Home`, `Sales`, `POS`, `Business`, `More`.

### Routing and workflow correctness

1. `/invoices/[id]` redirects to `/pos`, so the primary invoice detail URL does not render invoice detail.
2. `/invoices/new` redirects to `/pos` for new documents, so the invoice editor is not the default create flow.
3. The existing list navigates to `/invoices/preview/[invoiceNumber]` instead of the canonical detail route, splitting the mental model between preview and detail.
4. The existing editor can be reused, but the entry point needs a progressive-disclosure shell around it and must preserve its existing invoice calculation/posting behavior.

### Visual and interaction consistency

1. Existing components use several ad-hoc card, button, status, table, and modal patterns despite already having shared CSS primitives.
2. The current desktop density and small control typography feel like an ERP, while the native mobile redesign uses larger targets, simpler sections, and clearer primary actions.
3. Status badges do not consistently use the native dot/badge language or a shared status map.
4. The global plus action is an icon-only invoice shortcut on web; the native product uses a global create sheet with Invoice, Quote, Customer, Product, Expense, and Payment.
5. Search is a module/invoice popover only. It loads the current invoice dataset, then issues a client-side `ilike` query without a debounce or grouped resource model. It must continue using the same Supabase client and RLS-scoped queries.

### Responsive behavior

1. `data-table` has a `min-width: 760px`, so major lists overflow on small screens rather than switching to cards.
2. The main responsive CSS uses `639px` and `1279px` thresholds, which does not express the requested mobile `<768`, tablet `768–1199`, and desktop `>=1200` model.
3. Mobile POS behavior is implemented through selector-specific CSS overrides and remains a dense two-panel interaction instead of a product-first screen with a full-screen cart state.
4. Forms are mostly desktop grid forms placed inside modals; the flow does not consistently use one-column mobile sections, sticky CTAs, or bottom sheets.
5. Mobile navigation has no reserved bottom-nav space, no central create affordance, and no persistent way back to Home/Sales/POS/Business/More.

### Data, loading, empty, and error states

1. `useBusinessData` requests up to 250 rows for every generic table and has no pagination contract. This is acceptable as a compatibility fallback but is too broad for the new global dashboard/search surfaces.
2. Some resource pages show a text error or blank table state, but the shared EmptyState/ErrorState/LoadingSkeleton component contract is not applied uniformly.
3. Invoice list summary cards contain hard-coded comparison copy such as `+12.5%` and `+15.7%`; comparison metrics must only appear when a valid comparison period is available.
4. Dashboard data is live, but its presentation gives equal weight to expense charts, cash flow, and recent invoices instead of prioritizing operational attention and quick actions.

### Accessibility

1. There are some good foundations: native buttons, labels, keyboard activation on invoice rows, focus-visible CSS, and accessible labels on several icon buttons.
2. Collapsed navigation needs consistent tooltip text and stronger active semantics.
3. Search, notifications, company switching, details menus, and modal/sheet surfaces need consistent focus management and Escape behavior.
4. Status must not rely on color alone; the badge text should remain present at every viewport.
5. Touch targets should be at least 44px in mobile navigation, create, filters, and invoice actions.

## Existing reusable components and data services

### Reusable presentation components

- `AppShell` — existing authenticated chrome and workspace actions; will be refactored rather than duplicated.
- `Brand` — existing official OperiX mark/wordmark component and brand asset usage.
- `DashboardView` — live invoice/expense aggregates and chart data; presentation will be redesigned.
- `InvoiceList` — invoice/quote filtering, CSV export, pagination, and Supabase data access; list rows will gain responsive card variants.
- `InvoiceDetail` — invoice loading, document preview, PDF/print/download, email, and payment-link actions.
- `InvoiceEditor` — existing invoice/customer/product loading and financial form behavior; route shell and progressive disclosure will be redesigned around it.
- `ResourcePage` — shared CRUD, relation loading, export, modal form, and data table behavior for configured resources.
- `PosView` — existing product search, cart, payment, held-order, terminal, and checkout behavior; visual layout will be adapted without changing posting logic.
- `AccountingView`, `ReportsView`, `SettingsView`, `PayrollView` — existing advanced feature surfaces that will receive the new shell and section framing.
- `LoadingSkeleton` patterns, `.card`, `.btn`, `.input`, `.select`, `.field`, `.status`, `.data-table` — existing primitives to consolidate into the new token layer.

### Existing data/business dependencies

- `useWorkspace` reads the authenticated user/profile/company and active company selection.
- `useBusinessData` performs Supabase table reads through the browser client and is subject to existing RLS.
- `src/lib/invoice-calculations.ts` owns invoice totals/payment state and must remain authoritative.
- `src/lib/pdf-client.ts` and `InvoiceDocument` own invoice document generation/preview.
- Existing POS RPC calls, held-order queries, terminal selection, and idempotency behavior must remain unchanged.
- Existing auth, company switching, Supabase client, API routes, RLS, accounting, tax, payment, invoice numbering, and fiscalization behavior are out of scope for visual redesign.

## Screens being redesigned

1. Authenticated app shell, desktop sidebar, top bar, and global search/create.
2. Home/dashboard with operational KPI cards, quick actions, needs-attention, and activity.
3. Sales landing/list grouping, invoices list, quote list, invoice detail, and invoice creation entry flow.
4. Customers list and customer detail entry behavior.
5. POS desktop split layout and mobile product/cart/checkout states.
6. Business landing and product, inventory, expenses, vendors, and income list presentation.
7. Finance/More grouping, reports landing, accounting entry, payroll entry, VAT/tax, and fiscalization availability framing.
8. Settings landing and consolidated sections.
9. Loading, empty, error, retry, filter sheet, action menu, modal, and sticky mobile CTA behavior.

## Screens being consolidated or relocated

### Consolidated primary destinations

- `Dashboard` -> `Home` on mobile and `Dashboard` on desktop.
- `Invoices`, `Quotes`, `Customers`, `Payments` -> `Sales` mobile surface and `Sales` desktop sidebar section.
- `Products`, `Inventory`, `Expenses`, `Vendors`, `Income` -> `Business` mobile surface and `Business` desktop sidebar section.
- `Accounting`, `Reports`, `VAT / Tax`, `Payroll`, `Fiscalization` -> `More > Finance` mobile and `Finance` desktop section.
- `Contracts`, `Templates` -> `More > Documents` and `More` desktop section.
- `Company`, `Team / Users`, `Integrations`, `Settings` -> `More > Administration` and `More` desktop section.
- `Help` -> `More > Support` and `More` desktop section.

### Compatibility paths intentionally preserved

- Existing `/[section]` resource URLs and bookmarks.
- `/management`, `/inventory`, payroll subroutes, portal/print routes, and the existing preview URL.
- Existing API/route-handler surfaces and document/PDF paths.

## Screens intentionally unchanged in this phase

- Login/signup/auth callback visual redesign beyond shell-safe brand alignment.
- Customer portal, public QR verification, document print/PDF templates, and server route authorization.
- Core invoice calculation, VAT/tax semantics, accounting/journal posting, payment allocation, invoice numbering, fiscalization rules, stock posting, and immutable receipt behavior.
- Supabase schema, RLS policies, production infrastructure, deployment configuration, and backend migrations.

## Known backend and security dependencies

The UX work must not claim or introduce behavior for known audit risks:

- draft portal exposure and tenant-unsafe QR lookup;
- invoice money-model consistency and Stripe reconciliation;
- PDF route authorization;
- quote conversion consistency;
- incomplete stock ledger/COGS/returns/reservations/adjustments;
- incomplete fiscalization and offline POS;
- migration drift.

The new global search will use current workspace-scoped Supabase access only. No service-role client, new privileged RPC, RLS bypass, or database migration is required for the redesign.

## Native mobile alignment inventory

The current native redesign provides the cross-platform reference tokens and component concepts:

- Primary `#004FFE`, pressed `#0043D8`, background `#F7F9FC`, surface `#FFFFFF`.
- Poppins hierarchy, official OperiX logo/brand asset, soft blue icon surfaces, 10–16px card/panel radii, and generous 44px+ touch targets.
- Status badges for Draft, Sent, Partial/Pending, Paid, Overdue, and Cancelled with text plus tone.
- Shared screen concepts: Home, Sales, POS, Business, More, global create, global search, metric cards, shortcut rows, empty/error/loading states, and grouped advanced settings.

## Audit conclusion

The web app has enough existing data and business logic to implement the requested redesign conservatively. The safe approach is to refactor presentation and routing entry points first, introduce shared responsive primitives, and keep existing feature components/data contracts behind the new information architecture. The highest-risk workflow defects are the invoice detail/create redirects and mobile table overflow; these are presentation/routing fixes that do not require financial rule changes.
