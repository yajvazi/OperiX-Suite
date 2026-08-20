# OperiX Invoice Mobile test report

Test date: 2026-08-19

## Final execution summary

The authoritative CI command was:

```text
npm run test:ci --workspace=operix-invoice
```

It passed every executed stage:

| Suite | Tests | Passing | Failing | Skipped |
|---|---:|---:|---:|---:|
| Legacy Node tests | 8 | 8 | 0 | 0 |
| Shared core package tests | 13 | 13 | 0 | 0 |
| Jest unit tests | 47 | 47 | 0 | 0 |
| React Native component tests | 27 | 27 | 0 | 0 |
| API/integration-boundary tests | 3 | 3 | 0 | 0 |
| **CI total** | **98** | **98** | **0** | **0** |

Lint, TypeScript typecheck, localization validation, and the Expo web export smoke build also passed. Jest reported 0 snapshots; the suite uses behavioral assertions rather than snapshot-only coverage.

The separate coverage command passed 90 tests: 77 Jest tests plus 13 shared-core tests. The local E2E command was intentionally not executed against any backend: `npm run test:e2e` exited with code 2 because the required isolated test credentials were not supplied. This is the production-safety gate, not an application test failure.

## Coverage

Jest coverage over all mobile source files:

| Metric | Result | CI threshold |
|---|---:|---:|
| Statements | 23.48% | 18% |
| Branches | 52.05% | 45% |
| Functions | 34.97% | 30% |
| Lines | 23.48% | 18% |

Shared financial/API package coverage is reported by Node V8 because Expo/Jest excludes workspace package files outside the mobile root from its coverage map:

| Package | Lines | Branches | Functions |
|---|---:|---:|---:|
| `packages/money` | 94.57% | 66.53% | 83.70% |
| `packages/api/domain` | 93.06% | 67.86% | 95.24% |
| `packages/api/workspace` | 71.51% | 85.71% | 90.00% |
| `packages/commercial-documents` | 83.03% | 66.67% | 27.27% |
| **Core total** | **89.32%** | **69.96%** | **77.20%** |

The critical financial tests assert exact values for decimal parsing/rounding, line subtotals, quantity × price, VAT-inclusive and VAT-exclusive pricing, line/document discounts, shipping, transport, additional fees, paid amount, remaining balance, change, cash limits, and persistence payload totals. They do not rely on approximate UI text assertions.

## Audit and screen coverage

The implementation audit found:

- 62 screen files and 63 registered routes.
- 386 pressable/button sites, 32 text inputs, 26 switches, 15 modals, 151 alert sites, and 22 loading indicators.
- 118 stable semantic test IDs.
- 37 distinct Supabase table/view names and 34 RPC names across mobile plus shared API code.
- 35 table/view names and 20 RPC names used directly by mobile code; shared API adds 10 table/view names and 15 RPC names, with overlap.

Direct behavioral component coverage includes sign-in/sign-up, customer and product lists/forms, invoice list/form/detail, payment list/form, home, sales, business, and more. The route inventory also verifies that all declared root routes are registered and that authentication gates protected navigation.

Screens and areas still without direct component/E2E coverage, or covered only indirectly, include the legacy dashboard, approval-pending and join-team flows, customer/product/invoice list and detail variants, POS, management, expenses, reports and ledgers, accounting, tax center, payroll, vendors and supplier bills, vendor payments, contracts, company management, Stripe/integrations, template editors, support articles, global search, QR scanning, profile/about, and the remaining settings screens. Their status is recorded as `PARTIAL` or `NOT TESTED` in [MOBILE-TEST-MATRIX.md](./MOBILE-TEST-MATRIX.md); no unverified area is marked `PASS` merely because it renders.

## Actions and workflows covered

Behavioral tests cover authentication validation and errors, duplicate-submit protection, customer/product/payment/invoice form validation, Unicode and decimal input, exact invoice calculations, VAT and discounts, cash settlement, item add/remove/update, invoice persistence payloads and idempotency, invoice detail totals and status transition, PDF HTML generation/preview/share/print failure handling, tenant-scoped repository filters, query errors/empty results, payment RPC failure propagation, loading/error/empty states, core navigation actions, English/Albanian key parity, deterministic fixtures, and the following authored Maestro flows:

1. Login.
2. Customer create/search/open.
3. Product create/search/open.
4. Invoice create/customer/product/quantity/total/save/open.
5. Payment create/save/balance refresh.
6. Invoice PDF preview.
7. Logout.

The Maestro flows are environment-gated and have not run in this workspace because there is no configured isolated account, simulator/emulator, or Maestro binary.

## Database, Supabase, and security coverage

The Jest unit and integration layers cover query-builder behavior for invoice/customer/product/payment reads and mutations, empty/error responses, tenant filters, invoice-number reservation, atomic invoice RPC selection, idempotency payloads, payment allocation/reversal, POS command construction, and direct rejection of unsafe fallback invoice inserts.

The repository also contains [operix_invoice_mobile_security.sql](../../supabase/tests/operix_invoice_mobile_security.sql), which must be run only against a disposable local/test/staging Supabase database. It sets an authenticated Tenant A context and attempts direct cross-tenant reads, updates, deletes, report reads, and foreign invoice deletion RPC calls for invoices, customers, products, payments, and reports. It was not executed here because the Supabase CLI/test database was not available. No production data or production configuration was modified.

## Bugs and hardening changes

- The invoice form had preview-generation code but no reachable preview control. A visible `invoice-preview-button` and preview path were added, with a regression test proving generated HTML is displayed without saving the draft.
- The product list crashed when a product had a zero VAT rate because a numeric `0` was rendered as a React child. The condition now checks for a positive numeric rate, and the list regression suite includes a zero-VAT product.
- Synchronous in-flight guards were added to sign-in, customer save, product save, payment save, and invoice save. Tests prove rapid repeated presses result in one operation and pending controls cannot create duplicate records.
- The Maestro runner was corrected to resolve the app-level `.maestro` directory and refuses production/live or unclassified backend URLs.

## Remaining risks

- Real-device/simulator E2E has not run. It requires an isolated non-production Supabase project, deterministic fixture IDs, a test account, and a configured iOS/Android simulator.
- RLS and security-definer RPC behavior has been encoded in SQL but not run against a live test database.
- POS stock deduction/returns, payroll, vendor/supplier-bill, report, accounting, tax, settings/integration, contracts, and several document conversion paths remain `PARTIAL` or `NOT TESTED`.
- Jest component tests mock native modules and Supabase boundaries; they do not replace the live RLS and network tests.
- Localization has zero missing/extra/used-missing keys across 1,473 English and 1,473 Albanian keys, but nine same-value entries require human review: `draft`, `email`, `website`, `nr`, `id`, `standard`, `marketingCategory`, `grantCategory`, and `partner`.
- The dependency installation reported 50 audit advisories in the existing dependency graph, including 2 critical advisories; dependency remediation was not expanded into this testing task.

## Commands

From the mobile app directory:

```text
npm test                 # full CI-equivalent suite
npm run test:unit        # Jest unit tests
npm run test:component   # React Native Testing Library tests
npm run test:integration # API boundary tests
npm run test:core        # shared money/domain/workspace tests
npm run test:coverage    # Jest + shared-core coverage
npm run test:mobile      # typecheck, localization, Expo web build
npm run test:e2e         # gated Maestro flows; requires isolated non-production env
npm run audit:mobile-test
```

The test matrix is maintained in [MOBILE-TEST-MATRIX.md](./MOBILE-TEST-MATRIX.md). CI is defined in [mobile-tests.yml](../../.github/workflows/mobile-tests.yml).
