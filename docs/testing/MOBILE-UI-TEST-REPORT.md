# OperiX Invoice Mobile UI testing report

## Scope

This implementation is limited to UI behavior. RNTL tests mock repositories, workspace data, Supabase responses, native PDF/camera/link modules, and authentication context only to put screens into deterministic UI states. No database, API, RLS, security, or business-logic test suite was added here.

## Selected frameworks

- React Native Testing Library 14 with Jest 29 and `jest-expo` for component/screen behavior.
- Maestro for device E2E and screenshot assertions.
- Maestro was selected instead of Detox because the repository is an Expo SDK 54 managed app with no checked-in `ios/` or `android/` project. Maestro can exercise the installed development client through semantic IDs without introducing a native test harness or installing both tools.
- Visual assertions use Maestro `assertScreenshot` with an explicit `thresholdPercentage: 98`. Baselines are never rewritten by the normal check command.

## Implemented test inventory

| Measure | Result |
|---|---:|
| RNTL test files | 7 |
| RNTL tests | 35 |
| RNTL passing | 35 |
| RNTL failing | 0 |
| RNTL skipped | 0 |
| Root Maestro E2E flows | 10 |
| Visual Maestro flow files | 6 |
| Visual screenshot assertions | 21 per device/language cell |
| Approved PNG baselines in this workspace | 0 |
| Stable static test IDs after audit | 155 |
| Audited screen files | 62 |
| Registered routes | 63 |

The 35 RNTL tests cover authentication, dashboard/home, Sales, Business, More, customer/product/payment forms, invoice creation/detail/list flows, POS, reports, settings, help/support, profile redirect, loading/error/empty states, pull-to-refresh, selectors, confirmation dialogs, and duplicate-submit guards. The tests are behavior assertions, not snapshots.

## Device E2E coverage

The root `.maestro` suite contains:

- login and logout;
- dashboard tab navigation;
- customer create/search/open;
- product create/search/open;
- invoice create/customer/product/quantity/save/open;
- payment entry;
- invoice preview/PDF web view;
- settings section navigation;
- POS customer/cart/payment sheets.

All flows use stable test IDs or accessibility labels. The E2E runner refuses missing test credentials, production/live URLs, and unclassified remote targets. In this workspace the suite was not executed because Maestro, an iOS simulator, and the required isolated test account are not installed/configured. That is an environment gate, not a passing E2E result.

## Visual regression coverage

The visual suite defines 21 screenshots for each matrix cell:

- login and dashboard;
- invoice list and forced no-match empty invoice list;
- create invoice, customer selector, product selector, invoice with items;
- invoice details, actions modal, document preview;
- customer details, product list/details, POS, Business;
- Reports, Settings, Help, and logout confirmation.
- a network error state after disabling connectivity.

The runner supports `small-iphone` and `large-iphone`, and `en` and `sq`. The checked-in `.gitkeep` is intentionally not a fake screenshot. No simulator was available in this workspace, so no image can be honestly approved here. Run the explicit update command on the isolated simulator matrix to create the PNGs; normal visual checks will fail if a required baseline is missing.

## Commands

Run from the repository root:

```sh
npm run test:ui --workspace=operix-invoice
npm run test:mobile-ui --workspace=operix-invoice
npm run test:e2e --workspace=operix-invoice
npm run test:visual --workspace=operix-invoice
VISUAL_DEVICE=small-iphone VISUAL_LANGUAGE=en npm run test:visual:update --workspace=operix-invoice
```

The last command is the only baseline approval path. Set the E2E credentials and a local/test/staging `E2E_SUPABASE_URL` before device commands. Use `npm run test:visual:update` once for each device/language combination; review the generated images before committing them.

## Exact verification results in this workspace

- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- `npm run test:ui`: PASS — 7 suites, 35 tests.
- `npm run test:mobile-ui`: PASS — lint, typecheck, and the same 35 UI tests.
- `npm run test:mobile`: PASS — typecheck, localization check, and Expo web export smoke test.
- `npm run test:ci`: PASS — existing full mobile CI path, including the new `test:ui` stage; 106 tests passed across its existing legacy/core/unit/UI/integration stages.
- `node --check test/e2e/run-maestro.mjs`: PASS.
- `node --check test/visual/run-maestro-visual.mjs`: PASS.
- `npm run test:e2e`: NOT RUN — safely exited with code 2 because the required isolated E2E variables were not configured.
- `npm run test:visual`: NOT RUN — safely exited with code 2 because the required isolated E2E variables were not configured (Maestro/simulator are also unavailable).

## Covered interactive elements

The added identifiers cover authentication fields/actions, Home quick actions, bottom tabs, Sales and invoice creation, customer/product selectors, line quantity/delete/price/discount fields, invoice save/preview/detail actions, payment actions, customer/product list actions, POS product/cart/checkout/customer/payment controls, More menu entries, Settings sections/language/theme/logout, reports cards/retry, Help search/language/contact, and Profile redirection.

## Known UI bugs found and fixed

- Products with a zero VAT rate rendered the numeric `0` as a child inside a React Native `View`, which can crash in native rendering. The conditional now checks `Number(item.tax_rate || 0) > 0`; the product-list UI regression test includes a zero-VAT product.

## Remaining risks and untested UI

The remaining matrix is explicit: legacy/compatibility screens, vendor and expense workflows, payroll, contracts, tax, company management, payment integrations, advanced/template settings, QR/bill scanning, and several report detail screens still need dedicated RNTL coverage. Native simulator execution, both iPhone sizes, both-language screenshots, baseline approval, and actual device E2E remain pending until CI or a developer workstation supplies Maestro, an iOS simulator, a development client build, and isolated non-production fixtures. No visual baseline should be considered approved until that run is reviewed.
