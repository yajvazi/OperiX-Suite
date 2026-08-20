# OperiX Invoice Mobile documentation audit

Audit date: 2026-08-12

Audit scope: `apps/OperiX Invoice/OperiX Invoice Mobile`, shared packages used by that app, the mobile navigation/types, Supabase calls and relevant migrations, localization files, PDF services, and available mobile test/build scripts.

## Coverage

| Measure | Result |
|---|---:|
| Mobile screen source files inspected | 59 TSX screens |
| Bottom navigation tabs | 5 |
| Auth routes | 3 primary routes: SignIn, SignUp, JoinTeam |
| Settings routes | 9 nested routes |
| Native Help Center routes | 3: `HelpSupport`, `HelpCategory`, `HelpArticle` |
| English user-documentation files | 32, including the English portal README |
| Albanian user-documentation files | 32, including the Albanian portal README |
| Localized articles indexed for the app | 64 (32 logical articles in each language pair) |
| Help Center categories | 21 |
| Developer documentation files | 14 |
| Inventory, limitations, screenshot, translation, and audit files | 5 |
| User page parity | 100% by same-path file comparison |
| Broken internal Markdown links after validation | 0 |
| Undocumented major reachable feature areas | 0 identified |

The inventory also records compatibility/source-only screens and capabilities that are not presented as normal production workflows. Those are not silently omitted; they are marked in [DOCUMENTATION-INVENTORY.md](./DOCUMENTATION-INVENTORY.md).

## Sections covered

English and Albanian pages cover authentication/onboarding, dashboard/navigation, invoices, customers, products, payments, expenses, inventory, POS, commercial documents/conversions, contracts, reports, accounting, tax, EFS status, settings/templates, company hierarchy, roles, vendors/supplier bills, payroll, integrations, notifications/device actions, troubleshooting, and FAQ.

Developer pages cover architecture, navigation, authentication, database entities, API/RPC/Edge Functions, Supabase, state, localization, security, offline behavior, PDF generation, testing, deployment, and developer troubleshooting.

The in-app Help & Support flow now uses the same user Markdown as its canonical source. A Node build step generates a bundled TypeScript index for offline search and article rendering. The app provides local title-prioritized search, category navigation, related articles, language switching, and recent-article IDs in local storage. External contact and Help Center links remain network-dependent.

## Translation

- English user pages: 32/32
- Albanian user pages: 32/32
- Page-level parity: 100%
- Translation status: [TRANSLATION-STATUS.md](./TRANSLATION-STATUS.md)

Page parity does not mean the app UI is fully translated. The source audit found hard-coded English report labels/errors, duplicate i18n object keys, and a missing `enterInviteCode` key reference. These remain documented findings.

## Feature status summary

- ✅ Production: authentication/session, current five-tab shell, core customer/product/invoice/payment/expense CRUD paths, PDF/share/print helpers, company switching and management controls where permitted, report entry points.
- 🟡 Partial: POS offline/held orders, inventory, commercial-document subtypes, advance/final reconciliation, credit/debit editing, report export, supplier bills, payroll, Stripe/PayPal integration, localization parity, settings export/templates.
- 🧪 Experimental: Stripe developer API-key synchronization path and shared/backend capabilities not exposed as ordinary mobile workflows.
- 🔒 Internal: legacy dashboard/management paths and bad-debt document vocabulary.
- ⛔ Disabled: production EFS/fiscalization in the audited mobile status (`EFS NOT CERTIFIED`).
- ❌ Broken: no separate mobile runtime crash was established by this documentation pass.

## Risks and findings

1. `ProfileScreen` redirects to Settings rather than presenting a separate profile page. Documentation points users to Settings.
2. Legacy dashboard and management screens remain in source/compatibility navigation. Their calculations and labels differ from current Home/Business flows.
3. The invoice form uses a canonical commercial-document type but still writes compatibility fields into the existing invoice schema. This is intentional architecture and must be preserved during future migrations.
4. Payment posting and invoice allocation are separate operations. A payment can remain posted when allocation fails; support documentation calls this out.
5. POS held orders are local React state in the current screen even though backend/offline-pos migrations exist.
6. EFS status is explicitly not certified/production-disabled. No document guide calls an ordinary invoice PDF a fiscal receipt.
7. Report previews are bounded (250 queried/100 rendered, first eight columns in PDF export) and use server-side views.
8. The mobile source contains direct Stripe API-key/developer-mode code. This needs security review before production enablement.
9. The localization catalog check passes with no missing/extra/source keys, but flags eight same-value pairs for terminology review and the report preview still contains hard-coded English labels/errors.
10. Expo configuration requests location permission, but no current attendance/location screen was found.

## Validation performed

- Compared `docs/mobile/en` and `docs/mobile/sq` file paths: passed.
- Checked user-page frontmatter and language navigation: passed for the created pages.
- Checked all internal Markdown links under `docs/mobile`: passed after fixing three relative paths.
- Ran `npm run docs:validate`: passed with 32 English articles, 32 Albanian articles, 21 categories, complete language pairs, and valid related/internal links.
- Ran `npm run docs:mobile:generate`: generated the bundled mobile documentation asset.
- Compared route registrations/types and source screen files while building the inventory.
- Inspected Supabase client, workspace scope helper, relevant RPC calls, migration contracts, PDF services, i18n, and package scripts.
- Ran `npm run typecheck`: passed.
- Ran `node --test src/navigation/navigation.test.mjs`: 2 tests passed.
- Ran `npm run localization:check`: passed with 1,361/1,361 keys and eight review pairs.
- Ran `npm run build:check`: Expo web export passed.

## Remaining documentation work

No major reachable feature area remains without an inventory entry or user/developer documentation. Future implementation changes must update the inventory, both language pages, screenshot plan, and this audit rather than treating the pages as static marketing copy.

## Documentation release decision

**GO for this documentation set.**

This is not a production approval for the mobile application. The application itself should not be treated as production-ready for legally sensitive accounting, VAT, numbering, fiscalization, or offline claims until the limitations and test failures listed above are resolved and independently verified.
