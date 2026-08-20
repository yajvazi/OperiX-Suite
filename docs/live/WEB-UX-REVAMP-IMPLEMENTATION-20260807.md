# OperiX Invoice Web UX Revamp — Implementation Report

**Date:** 2026-08-07  
**Scope:** `apps/OperiX Invoice/OperiX Web`  
**Reference product:** `apps/OperiX Invoice/OperiX Invoice Mobile`  
**Deployment:** Not performed

## Outcome

OperiX Invoice Web now has a mobile-first application shell and responsive presentation system that mirrors the native mobile redesign while preserving existing Supabase access, RLS boundaries, invoice calculations, POS posting, payment behavior, PDF generation, and accounting contracts.

The redesign is presentation- and entry-point-led. Existing backend behavior was intentionally kept behind the new navigation and responsive surfaces.

## Before architecture

The pre-revamp web app exposed a flat ERP-style module list through one desktop-oriented sidebar:

```text
Dashboard
POS
Invoices
Payments
Customers
Accounting
Payroll
Reports
Vendors
Products & Services
Settings
Help desk
```

Most secondary modules were reached through a generic `[section]` route. Major lists used desktop tables with a `min-width: 760px`; narrow screens therefore overflowed instead of changing information shape. The web app had no persistent mobile bottom navigation, no global create menu, and no grouped Sales/Business/Finance/More model.

Two primary invoice entry points were also incorrect for a modern product flow:

- `/invoices/[id]` redirected to `/pos` instead of rendering invoice detail.
- `/invoices/new` redirected to `/pos` unless an edit query was present.

The full audit, including the original route tree, component inventory, responsive issues, backend dependencies, and intentionally unchanged screens, is in [WEB-UX-REVAMP-AUDIT-20260807.md](./WEB-UX-REVAMP-AUDIT-20260807.md).

## Final architecture

```text
Authenticated AppShell
├── Desktop/tablet shell
│   ├── Grouped sidebar
│   ├── Global search trigger
│   ├── Global Create menu
│   ├── Notifications
│   ├── Company selector
│   └── Profile menu
├── Mobile web shell
│   ├── Compact top bar
│   ├── Global search sheet
│   ├── Central Create action
│   └── Home / Sales / POS / Business / More bottom navigation
└── Shared route content
    ├── Home/dashboard
    ├── Sales hub, invoices, quotes, customers, payments
    ├── POS
    ├── Business hub, products, inventory, expenses, vendors, income
    ├── Finance and reports
    ├── More: documents, administration, support
    └── Existing advanced/compatibility routes
```

### Desktop navigation tree

```text
Home                         /dashboard

SALES
├── Invoices                 /invoices
├── Quotes                   /quotes
├── Customers                /customers
├── Payments                 /payments
└── Contracts                /contracts

BUSINESS
├── Products                 /products
├── Inventory                /inventory
├── Expenses                 /expenses
├── Vendors                  /vendors
└── Income                   /income

FINANCE
├── Accounting               /accounting
├── Reports                  /reports
├── VAT / Tax                /tax-reports → /reports#tax-reports
├── Payroll                  /payroll
└── Fiscalization            /settings?tab=compliance

MORE
├── Templates                /settings?tab=templates
├── Company                  /settings?tab=company
├── Team / Users             /settings?tab=team
├── Integrations             /settings?tab=payments
├── Settings                 /settings
└── Help                     /help
```

The desktop rail is collapsible at desktop widths. At 768–1199px it becomes a compact icon rail with accessible `title` labels; at mobile widths it is replaced by the native-aligned bottom navigation.

### Mobile navigation tree

```text
Home                         /dashboard
Sales                        /sales
Create                       central action; Invoice, Quote, Customer, Product, Expense, Payment
POS                          /pos
Business                     /business
More                         /more
├── Finance                  Accounting, Reports, VAT / Tax, Payroll, Fiscalization
├── Documents                Contracts, Templates
├── Administration           Company, Team / Users, Integrations, Settings
└── Support                  Help
```

The five conceptual destinations remain Home, Sales, POS, Business, and More. The central plus button is an action affordance rather than a sixth destination.

## Redesigned routes

| Route | Final behavior |
|---|---|
| `/dashboard` | Task-focused Home/Dashboard with live KPI cards, quick actions, revenue overview, needs attention, and recent activity. |
| `/sales` | New grouped Sales hub for mobile web and a useful landing surface on desktop. |
| `/invoices` | Responsive invoice list with status tabs, search, filters, export, desktop table, and mobile cards. |
| `/quotes` | Same list system filtered to offers/quotes. |
| `/invoices/[id]` | Canonical invoice detail screen; no longer redirects to POS. |
| `/invoices/new` | Progressive customer → items → review flow on mobile; structured adaptive form on desktop. |
| `/business` | New grouped Business hub. |
| `/products`, `/inventory`, `/expenses`, `/vendors`, `/income` | Shared responsive resource list/card presentation with existing CRUD/data behavior. |
| `/pos` | Product-first desktop split layout and mobile product/cart state with persistent cart CTA. |
| `/more` | Grouped Finance, Documents, Administration, and Support entry surface. |
| `/reports` | Simplified report categories, period selector, focused revenue view, and embedded tax-report section. |
| `/settings` | Existing settings capabilities presented as a consolidated tab system; deep links now select Company, Templates, Compliance, Team, or Payments tabs. |
| `/accounting`, `/payroll`, payroll subroutes | Existing advanced flows remain available inside the Finance group. |
| `/invoices/preview/[invoiceNumber]`, portal, QR, print, transaction previews | Compatibility/document routes preserved. |

The generic `[section]` resource route remains available to avoid breaking existing bookmarks and to keep existing CRUD/data contracts stable.

## Native mobile ↔ web screen mapping

| Native mobile redesign | Mobile web | Desktop web |
|---|---|---|
| Home | `/dashboard` with vertical KPI, quick-action, attention, and activity cards | Dashboard with five KPI cards and multi-column operational grid |
| Sales | `/sales` hub → Invoices, Quotes, Customers, Payments | Sales sidebar group and `/sales` landing |
| Invoices list | `/invoices` mobile invoice cards | `/invoices` clean table with Invoice, Customer, Date, Total, Status, Actions |
| Invoice detail | `/invoices/[id]` stacked summary, actions, items, payments, notes/activity | `/invoices/[id]` summary panel, items table, totals rail, payments/activity tabs |
| Create invoice | `/invoices/new` three-step customer → items → review flow with sticky CTA | `/invoices/new` wide structured form with stepper and preview |
| POS | `/pos` product-first screen, persistent cart indicator, full-screen cart/checkout state | `/pos` two-column product catalog and cart/payment panel |
| Business | `/business` hub → Products, Inventory, Expenses, Vendors, Income | Business sidebar group and `/business` landing |
| Customer list | `/customers` mobile cards/list rows | `/customers` shared resource table |
| More | `/more` Finance, Documents, Administration, Support groups | Finance and More sidebar groups, settings query tabs |
| Native status badges | Shared `StatusBadge` with text plus tone/dot | Same status map and visual language |
| Native global create | Central plus action | Top-bar `+ Create` menu |
| Native global search | Full-screen search sheet behavior | Top-bar search dialog with grouped results, keyboard navigation, and `⌘/Ctrl+K` |

## Components

### Added

- `src/lib/navigation.ts` — shared desktop/mobile navigation definitions and active-route logic.
- `src/components/ui.tsx` — shared `PageHeader`, `StatusBadge`, `MetricCard`, `SectionCard`, `QuickAction`, `SearchField`, `FilterButton`, `MobileListCard`, `EmptyState`, `ErrorState`, `LoadingSkeleton`, and `StickyMobileCTA` primitives.
- `src/components/mobile-hubs.tsx` — Sales, Business, and More grouped mobile-web entry surfaces.
- Responsive product-system CSS tokens and variants in `src/app/globals.css`.

### Reused and adapted

- Official `Brand` component and existing OperiX SVG assets.
- `useWorkspace`, `useBusinessData`, browser Supabase client, and existing RLS-scoped queries.
- `InvoiceDocument`, `openInvoicePdf`, existing invoice calculation helpers, payment-link actions, and current invoice/POS business operations.
- Existing `ResourceConfig` definitions and generic CRUD relation fields.
- Existing accounting, payroll, tax, portal, print, and PDF implementations behind the new shell.

### Removed from primary presentation

No financial or CRUD business component was deleted. The old flat sidebar presentation, the invoice-list preview-first navigation, desktop-only resource-table presentation, and duplicated mobile/desktop create affordances were removed or replaced as primary entry patterns.

## Global search and create

Global search now:

- Opens from the desktop top bar or mobile search icon/sheet.
- Debounces queries by 250ms.
- Searches invoices, customers, products, payments, and vendors through the existing browser Supabase client.
- Groups results by resource type.
- Supports arrow-key selection and Enter navigation on desktop.
- Uses existing RLS/auth semantics; no service-role client, privileged RPC, or database migration was added.
- Navigates directly to invoice detail when the canonical detail route exists and to the relevant resource surface for existing generic resources.

Global Create now contains Invoice, Quote, Customer, Product, Expense, and Payment. Contextual actions remain only where they clarify the current task.

## Responsive behavior

| Range | Behavior |
|---|---|
| `>=1200px` | Full collapsible sidebar, lightweight top bar, five-column KPI row, desktop tables, desktop POS split, wide invoice form/detail layout. |
| `768–1199px` | Compact icon rail with accessible labels, reduced top-bar spacing, two/three-column content grids, tablet-friendly tables and form layouts. |
| `<768px` | Sidebar removed, mobile top bar and bottom navigation, stacked cards, filter surfaces, one-column forms, central create action, sticky mobile CTAs, and product-first POS. |

Major table fallbacks are explicit:

- Invoice table → invoice cards.
- Customer/payment/product/expense/vendor/income resource table → mobile list cards.
- Invoice item table remains horizontally scrollable only inside the progressive create flow when line-item editing genuinely requires its columns.
- POS cart becomes a full-screen mobile state rather than a permanently competing second column.

## Loading, empty, and error states

The primary redesigned surfaces now use shared states rather than blank content:

- Dashboard, invoice list, invoice detail, reports, and generic resources expose loading skeletons.
- Empty invoice/customer/resource states provide a clear next action.
- Data failures use retryable `ErrorState` surfaces.
- Invoice filter surfaces show active filter state and reset behavior.
- Invoice detail tabs show explicit empty states for payments, activity, notes, and files where no data exists.

## Accessibility changes

- Sidebar links retain semantic links and active `aria-current` state.
- Collapsed navigation keeps accessible `title` labels.
- Search and create controls have explicit labels, Escape handling, and keyboard selection where applicable.
- Invoice table rows support keyboard activation.
- Status badges retain visible text and a dot; color is not the sole status signal.
- Mobile navigation and primary actions use large touch targets; mobile Create is a 54px control.
- Search inputs, filters, modal controls, and icon-only actions have labels or screen-reader text.
- Shared focus-visible styling is retained across the new primitives.
- Destructive and advanced invoice actions are moved under secondary action menus rather than competing with Send/Payment/PDF actions.

## Performance changes

- Global search is debounced and caps each resource group at six results.
- Existing generic resource reads retain the compatibility cap of 250 rows rather than loading unbounded tables.
- Dashboard/report calculations are derived from already loaded query results and avoid fake comparison data.
- Recharts views use a single focused chart per landing surface and disable unnecessary animation in the redesigned chart views.
- Shared components reduce duplicated markup and CSS patterns across lists, cards, status, filters, and states.
- URL-aware components have explicit Suspense boundaries so Next.js static generation remains safe.

Known limitation: the existing `useBusinessData` compatibility hook still uses a 250-row client query rather than a new server-side pagination contract. Introducing a new pagination/RPC contract was intentionally deferred because it would expand the scope into backend/data behavior.

## Screenshots

Responsive browser captures were generated locally with Playwright against a Supabase-disabled preview server so the shell and route presentation could be checked without inventing an authenticated user or bypassing RLS:

- [Desktop dashboard preview — 1440px](./screenshots/web-preview-dashboard-1440.png)
- [Compact desktop/tablet dashboard preview — 1024px](./screenshots/web-preview-dashboard-1024.png)
- [Tablet dashboard preview — 768px](./screenshots/web-preview-dashboard-768.png)
- [Mobile dashboard preview — 390px](./screenshots/web-preview-dashboard-390.png)
- [Small mobile dashboard preview — 320px](./screenshots/web-preview-dashboard-320.png)
- [Desktop Create menu](./screenshots/web-preview-create-1440.png)
- [Mobile Create sheet](./screenshots/web-preview-create-390.png)

The preview server had no authenticated workspace data, so those captures show the real shell plus the honest Supabase-not-configured error state. No test credentials were created, and no production/auth/RLS bypass was introduced. A separate logged-out production smoke check confirmed `/dashboard` redirects to `/login?next=/dashboard` at every requested width.

## Validation

Commands were run from `apps/OperiX Invoice/OperiX Web`:

| Check | Result |
|---|---|
| `npm run typecheck` | Pass — `tsc --noEmit` |
| `npm test` | Pass — 8 files, 27 tests |
| `npm run lint` | Exit 0 — 0 errors, 6 existing warnings |
| `npm run build` | Pass — Next.js 16.2.11, 40 static pages generated |
| Browser route smoke | Pass — `/dashboard`, `/sales`, `/invoices`, `/invoices/new`, `/customers`, `/pos`, `/products`, `/reports`, `/more`, `/settings` returned 200 with expected headings |
| Responsive shell smoke | Pass at 1440, 1024, 768, 390, and 320px; Create and global search interactions exercised |
| Deployment | Not performed |

The remaining lint warnings are outside the redesign’s primary surfaces: portal `<img>` usage, an existing effect dependency in portal links/POS completion, and an unused legacy PDF helper.

## Remaining known UX issues

- The authenticated browser smoke pass could not execute data-dependent CRUD actions because no test credentials were available in the workspace. Route rendering and unauthenticated redirect behavior were verified; live Supabase data flows still need a normal authenticated QA pass.
- Advanced Accounting, Payroll, fiscalization, and some Settings internals retain their existing dense feature-specific layouts. They are now organized behind Finance/More and inherit the new shell, but they were not rewritten into new accounting workflows.
- Generic resource lists retain the existing 250-row compatibility query cap and do not yet have true server-side pagination.
- Customer and generic-resource search results currently land on the existing resource surface where a dedicated detail route does not exist.
- The old `/management` path remains available for compatibility but is no longer a primary navigation item.
- PDF/portal/QR screens were not visually redesigned in this phase.

## Backend and security issues discovered or intentionally retained

No backend contract or migration was added for this redesign. Pre-existing audit risks remain documented and were not worsened or rebranded as complete:

- draft portal exposure;
- tenant-safety of QR lookup;
- invoice money-model consistency;
- incomplete Stripe reconciliation;
- PDF route authorization;
- quote conversion consistency;
- incomplete stock ledger/COGS/returns/reservations/adjustments;
- incomplete fiscalization readiness;
- incomplete offline POS readiness;
- migration drift.

The redesign does not claim stock-tracked checkout, complete inventory accounting, production fiscalization, or offline financial posting when the existing implementation does not establish those guarantees.

## Financial logic deliberately not modified

The following were kept intact and remain authoritative in the existing code:

- invoice amount and line-item calculations;
- VAT/tax calculation behavior;
- journal posting and accounting periods;
- payment allocation and payment status semantics;
- Stripe payment state behavior;
- invoice numbering;
- fiscalization rules and readiness limitations;
- stock posting behavior;
- immutable receipt behavior;
- Supabase authentication, workspace selection, and RLS semantics.

The only invoice routing change is that the UI now reaches the existing invoice detail/editor implementations through their correct canonical routes. The editor’s post-save navigation now returns to `/invoices/[id]`; it does not change the saved financial record.

## Git diff summary

Redesign-focused changes are concentrated in the Invoice Web app:

- New navigation definitions, mobile hubs, shared UI primitives, and two grouped hub routes.
- New AppShell/top-bar/sidebar/mobile-bottom-nav implementation.
- New dashboard, invoice list, invoice detail, invoice editor flow, resource cards, reports, settings deep-link behavior, and POS responsive presentation.
- The tracked core component/CSS diff is 1,677 additions and 377 deletions; route files and new primitives add further files outside that tracked-file subtotal.
- Existing worktree changes in unrelated OperiX apps, infrastructure, migrations, API routes, and native mobile redesign files were preserved and are not part of this UX change.

The audit and this report are the two requested live documents; no production deployment or destructive database operation was performed.
