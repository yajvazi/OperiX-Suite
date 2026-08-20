# Verified known limitations

These are findings from the audited source and current build/test scripts. They are not proposed fixes.

## Authentication and access

1. The app implements sign-in, sign-up, Google OAuth, email OTP verification, sign-out, invite joining, and a biometric gate. No password-reset screen or `resetPasswordForEmail` call was found in the mobile source.
2. `ApprovalPendingScreen` can query status, but its “check status” action does not itself cause the `AppNavigator` employee-status gate to re-evaluate. A restart or sign-out/sign-in may be required after approval.
3. Worker visibility is implemented in `MoreScreen` and `GlobalCreateButton`, but final authorization is expected from Supabase RLS/RPC permissions. UI visibility is not a security boundary.

## Commercial documents and accounting

1. The shared document model is implemented on the existing `invoices` and `invoice_items` tables. The mobile form recognizes quotes, proformas, orders, delivery notes, advance invoices, final invoices, credit notes, debit notes, simplified invoices, fiscal receipts, and bad-debt invoices, but not every type has a dedicated creation control or complete mobile workflow.
2. Advance invoice and final-invoice types and conversion paths exist, but the mobile UI does not provide a complete multiple-advance reconciliation wizard. Do not use the presence of `advance_applied_amount` as proof that every advance accounting scenario is handled end-to-end.
3. Credit/debit conversion exists and the database contains original-document/line constraints. The mobile form is not a full legal correction editor with every reason code and line-level control.
4. Order and delivery line quantity fields and fulfillment RPCs exist, but the mobile UI does not expose a complete warehouse, partial-delivery history, receiver/signature, and return workflow.
5. The invoice preview path calls the corporate template. The PDF service also contains thermal behavior, but the wider template registry and the preview screen are not identical capabilities.
6. The source contains legacy invoice and management navigators in addition to the current bottom-tab paths. These routes remain for compatibility and can expose older labels/flows.

## POS, stock, and offline behavior

1. POS cart and held orders are React state in `POSScreen`; they are lost when the screen is unmounted or the app reloads. Backend migrations contain persisted held-order/offline-pos capability, but the audited mobile screen does not call that persisted queue.
2. POS checkout navigates to `InvoiceFormScreen`, which uses the stock-tracked invoice RPC. POS does not independently complete a payment or directly render a final fiscal receipt.
3. Products have stock quantity, tracking, and low-stock fields. The mobile app does not expose a complete stock-adjustment, warehouse-transfer, return, or valuation workflow.

## Payments, expenses, and integrations

1. Customer payment posting and invoice allocation are separate RPC calls. If allocation fails, the form can report a warning while the payment remains posted; support should verify both records.
2. Payment number generation in `PaymentFormScreen` is based on a count and is editable in the form. It is not the same transactional sequence allocator used by the commercial-document migration.
3. Stripe includes OAuth/Edge Function and a developer-mode direct API-key path. The mobile repository contains a Stripe client ID and a hard-coded service URL in `stripeService.ts`; production secrets must remain server-side and this path must be reviewed before broad release.
4. PayPal in the payment-integration screen is link-based. The audited mobile code does not establish a complete PayPal transaction synchronization flow.
5. Expense receipt images are stored as base64 data URLs in the expense record path. This can increase payload size and is not the same as a dedicated storage-object workflow.

## Reports, tax, and fiscalization

1. Report previews load rows in pages, display up to 100 rows, and export the first eight discovered columns. The export is a print/PDF table, not a complete report-book export.
2. Some report loading/error/export labels are hard-coded English in `ReportPreviewScreen`; Albanian localization is therefore incomplete in that screen.
3. The Tax Center reads `kosovo_efs_status` and defaults to `EFS NOT CERTIFIED`. The mobile source does not demonstrate live TAK/EFS certification or production fiscalization.
4. Tax/book/report screens are dependent on server-side views and permissions. Empty results can mean no posted records or unavailable access; the mobile UI does not always distinguish those cases.

## Localization and build quality

1. The localization check currently reports 1,361 English keys and 1,361 Albanian keys with no missing/extra keys or missing mobile-source keys. It still flags eight same-value pairs for review (`draft`, `email`, `website`, `nr`, `id`, `standard`, `marketingCategory`, `grantCategory`).
2. Some report preview labels and errors are hard-coded in English, so runtime Albanian coverage is not complete in that screen.
3. The shared i18n formatter supports multiple currency codes, but current invoice/company forms default to EUR and do not expose a complete mobile currency-management workflow.

## In-app Help Center

1. The Help Center bundles the Markdown content during development/build; changing `docs/mobile/en/` or `docs/mobile/sq/` requires running `npm run docs:mobile:generate` before the app sees the change.
2. Article rendering is a native supported Markdown subset. It renders headings, paragraphs, lists, tables, emphasis, code, notices, screenshot placeholders, and links; arbitrary HTML, embedded images, and interactive Markdown extensions are not supported.
3. Core articles, search, categories, and recent article IDs work offline. Contact Support and the external Help Center link require network/browser availability.

## Legacy and hidden source

1. `ProfileScreen` is a registered compatibility route that immediately redirects to `Settings > SettingsMain`; it is not a separate profile workflow.
2. `DashboardScreen` contains a larger legacy dashboard with a hard-coded growth value (`12.5`) and calculations different from the current `HomeScreen`. It is not the current bottom-tab Home destination.
3. `ManagementScreen`, `ManagementDashboardScreen`, `FaturatScreen`, and the legacy expense navigator remain in source/compatibility registrations. Their labels and calculations should not be treated as the canonical current navigation.
4. Expo configuration requests an attendance location permission, but no current attendance/location workflow was found in the mobile screens.

## Features not found as complete mobile workflows

No complete mobile password reset, customer-portal screen, push-notification registration, general offline synchronization queue, cashier-shift closing, refund/return screen, or live fiscalization workflow was found. These are intentionally not described as available features.
