# OperiX Invoice Mobile UI test matrix

This matrix is based on the implementation audit, not only the existing route documentation. The audit found 62 screen files, 63 registered routes, 386 pressable/button surfaces, 32 text inputs, 26 switches, 15 modal declarations, 22 loading indicators, and 155 stable static test IDs (dynamic row IDs are additional). Backend calls are mocked only where needed to render a UI state; this is not a database, API, RLS, or business-logic test matrix.

`PASS` means the corresponding UI automation is implemented and executed in the available environment. `PARTIAL` means the automation is authored but requires a configured simulator, visual baselines, or isolated non-production test account. `NOT TESTED` means no reliable automation was added yet.

| Screen | Component/Action | RNTL | E2E | Visual | Small iPhone | Large iPhone | EN | SQ | Status |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Sign In | Email/password, validation, auth error, Google, sign-up link | PASS | PARTIAL | PARTIAL | NOT TESTED | NOT TESTED | PASS | PARTIAL | PARTIAL |
| Sign Up | Required fields, password rules, metadata, OTP route | PASS | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | PASS | PARTIAL | PARTIAL |
| Join Team | Invite entry and verification route | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Approval Pending | Status check and pending state | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Home / Dashboard | Metrics, recent activity, quick actions, error retry | PASS | PARTIAL | PARTIAL | NOT TESTED | NOT TESTED | PASS | PARTIAL | PARTIAL |
| Main tabs | Home, Sales, POS, Business, More, back navigation | PARTIAL | PARTIAL | PARTIAL | NOT TESTED | NOT TESTED | PASS | PARTIAL | PARTIAL |
| Sales | Search, document actions, empty/no-match state | PASS | PARTIAL | PARTIAL | NOT TESTED | NOT TESTED | PASS | PARTIAL | PARTIAL |
| Invoices list | Create, row open, preview, type tabs | PASS | PARTIAL | PARTIAL | NOT TESTED | NOT TESTED | PASS | PARTIAL | PARTIAL |
| All invoices | Legacy all-invoice list | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Faturat main | Legacy invoice hub tabs/actions | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Create invoice | Customer/product selectors, line editing, discount, notes, preview, save, duplicate-save guard | PASS | PARTIAL | PARTIAL | NOT TESTED | NOT TESTED | PASS | PARTIAL | PARTIAL |
| Invoice customer selector | Search, select, walk-in, create customer, close | PASS | PARTIAL | PARTIAL | NOT TESTED | NOT TESTED | PASS | PARTIAL | PARTIAL |
| Invoice product selector | Search, select, custom line, close | PASS | PARTIAL | PARTIAL | NOT TESTED | NOT TESTED | PASS | PARTIAL | PARTIAL |
| Invoice details | Totals, payment, share/send, actions menu, status, missing resource | PASS | PARTIAL | PARTIAL | NOT TESTED | NOT TESTED | PASS | PARTIAL | PARTIAL |
| Invoice preview/PDF | Web view, close, print/share actions | PASS | PARTIAL | PARTIAL | NOT TESTED | NOT TESTED | PASS | PARTIAL | PARTIAL |
| QR scanner | Camera surface and cancel/return route | PARTIAL | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | PASS | NOT TESTED | PARTIAL |
| POS | Product search, category tabs, customer sheet, cart, quantity, payment sheet, stock guard | PASS | PARTIAL | PARTIAL | NOT TESTED | NOT TESTED | PASS | PARTIAL | PARTIAL |
| Business | Section tabs, search, add action, product/inventory empty states | PASS | PARTIAL | PARTIAL | NOT TESTED | NOT TESTED | PASS | PARTIAL | PARTIAL |
| Products list | Search, row open, create, scanner, empty state | PASS | PARTIAL | PARTIAL | NOT TESTED | NOT TESTED | PASS | PARTIAL | PARTIAL |
| Product form | Fields, decimal price, stock toggle, scanner, save | PASS | PARTIAL | NOT TESTED | NOT TESTED | NOT TESTED | PASS | PARTIAL | PARTIAL |
| Product details | Detail display and edit/delete actions | NOT TESTED | PARTIAL | PARTIAL | NOT TESTED | NOT TESTED | PASS | PARTIAL | PARTIAL |
| Customers list | Search, row open, create, empty state | PASS | PARTIAL | NOT TESTED | NOT TESTED | NOT TESTED | PASS | PARTIAL | PARTIAL |
| Customer form | Required name, Unicode, optional details, save, duplicate guard | PASS | PARTIAL | NOT TESTED | NOT TESTED | NOT TESTED | PASS | PARTIAL | PARTIAL |
| Customer details | Detail display, invoice/payment navigation | PARTIAL | PARTIAL | PARTIAL | NOT TESTED | NOT TESTED | PASS | PARTIAL | PARTIAL |
| Payments list | Totals, row open, add, export empty guard | PASS | PARTIAL | NOT TESTED | NOT TESTED | NOT TESTED | PASS | PARTIAL | PARTIAL |
| Payment form | Customer/invoice selectors, amount, method, bank reference, save, duplicate guard | PASS | PARTIAL | NOT TESTED | NOT TESTED | NOT TESTED | PASS | PARTIAL | PARTIAL |
| Dashboard legacy | Compatibility dashboard route | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| More | Menu visibility, role-aware payroll, settings/help/reports routes, sign-out confirmation | PASS | PARTIAL | PARTIAL | NOT TESTED | NOT TESTED | PASS | PARTIAL | PARTIAL |
| Accounting | Accounting hub actions and empty/loading/error states | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Reports hub | Snapshot metrics, report cards, retry error state | PASS | PARTIAL | PARTIAL | NOT TESTED | NOT TESTED | PASS | PARTIAL | PARTIAL |
| Report preview | Report document tabs and preview states | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Customer ledger | Customer ledger filters and empty state | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Vendor ledger | Vendor ledger filters and empty state | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Tax center | Tax summary and tax activity navigation | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Expenses dashboard | Summary cards and actions | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Expenses list | Search/filter/list actions and empty state | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Expenses screen | Compatibility expense list | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Expense form | Expense/income fields, validation, save/cancel | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Vendors list | Search, row open, create, empty state | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Vendor form | Fields, validation, save/cancel | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Vendor payments list | List, add, empty state | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Vendor payment form | Form validation and save/cancel | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Supplier bills list | Search, row open, add, empty state | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Supplier bill form | Line editor, validation, save/cancel | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Scan bill | Camera/document picker and cancel | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Payroll | Payroll dashboard states and actions | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Payroll setup | Setup form and save/cancel | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Management | Compatibility management tabs | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Management dashboard | Compatibility dashboard actions | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Contract form | Contract fields, template/custom fields, save/cancel | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Contract details | Detail actions, status, signature UI | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Settings | Language, theme, sections, sign-out confirmation | PASS | PARTIAL | PARTIAL | NOT TESTED | NOT TESTED | PASS | PARTIAL | PARTIAL |
| Advanced settings | Export, numbering, templates and navigation links | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Template editor | Invoice template form and preview actions | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Invoice template settings | Template options and save/cancel | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Contract templates | List/create/edit/delete UI | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Contract template editor | Wizard, field/block modals, save/cancel | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Payment integrations | Provider cards, connect/disconnect modals | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Stripe dashboard | Connection and payout UI | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Manage companies | Company list, switch, invite/remove modals | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Profile | Legacy redirect to merged Settings | PASS | PARTIAL | NOT TESTED | NOT TESTED | NOT TESTED | PASS | PARTIAL | PARTIAL |
| Help/support | Search, empty results, EN/SQ toggle, external support | PASS | PARTIAL | PARTIAL | NOT TESTED | NOT TESTED | PASS | PASS | PARTIAL |
| Help category | Category list and article navigation | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | PASS | PARTIAL | PARTIAL |
| Help article | Markdown/content links and back navigation | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | PASS | PARTIAL | PARTIAL |
| About | Version, legal/support links | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | PASS | PARTIAL | PARTIAL |
| Global search | Query input, result types, no-result state, route open | PARTIAL | PARTIAL | NOT TESTED | NOT TESTED | NOT TESTED | PASS | PARTIAL | PARTIAL |
| Loading states | Home, POS, reports, lists, forms | PASS | PARTIAL | NOT TESTED | NOT TESTED | NOT TESTED | PASS | PARTIAL | PARTIAL |
| Error states | Offline/query failures, retry actions, missing invoice | PASS | PARTIAL | NOT TESTED | NOT TESTED | NOT TESTED | PASS | PARTIAL | PARTIAL |
| Empty states | Empty customer/payment lists, no-search results, empty invoice form | PASS | PARTIAL | PARTIAL | NOT TESTED | NOT TESTED | PASS | PARTIAL | PARTIAL |
| Confirmation dialogs | Sign-out, delete/status actions, cancel paths | PASS | PARTIAL | PARTIAL | NOT TESTED | NOT TESTED | PASS | PARTIAL | PARTIAL |
| Form interaction contract | Input, validation, Unicode, decimal values, disabled submit, double press | PASS | PARTIAL | PARTIAL | NOT TESTED | NOT TESTED | PASS | PARTIAL | PARTIAL |
| Visual regression matrix | 21 screenshot assertions × 2 device sizes × 2 languages | NOT APPLICABLE | PARTIAL | PARTIAL | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | PARTIAL |
