# OperiX Invoice E2E flows

- App: OperiX Invoice
- Path: `apps/OperiX Invoice/OperiX Invoice Mobile`
- Standard: Maestro (real simulator/emulator only)
- QA data: dedicated non-production accounts/tenants only
- Latest execution: ENVIRONMENT_FAILURE

## Discovered routes

- `About`
- `Accounting`
- `AdvancedSettings`
- `AllInvoices`
- `Business`
- `ClientForm`
- `ClientsList`
- `ContractDetail`
- `ContractForm`
- `ContractTemplateEditor`
- `ContractTemplates`
- `CustomerDetail`
- `CustomerLedger`
- `ExpenseForm`
- `ExpensesDashboard`
- `ExpensesList`
- `FaturatMain`
- `GlobalSearch`
- `HelpArticle`
- `HelpCategory`
- `HelpSupport`
- `Home`
- `InvoiceDetail`
- `InvoiceForm`
- `InvoiceTemplateSettings`
- `InvoicesList`
- `InvoicesTab`
- `JoinTeam`
- `MainTabs`
- `ManageCompanies`
- `Management`
- `ManagementDashboard`
- `ManagementTabs`
- `More`
- `POS`
- `PaymentDetail`
- `PaymentForm`
- `PaymentIntegrations`
- `PaymentsList`
- `Payroll`
- `PayrollSetup`
- `ProductDetail`
- `ProductForm`
- `ProductsList`
- `Profile`
- `QRScanner`
- `ReportPreview`
- `ReportsHub`
- `Sales`
- `ScanBill`
- `Settings`
- `SettingsMain`
- `SignIn`
- `SignUp`
- `StripeDashboard`
- `SupplierBillForm`
- `SupplierBillsList`
- `TaxCenter`
- `TemplateEditor`
- `VendorForm`
- `VendorLedger`
- `VendorPaymentForm`
- `VendorPaymentsList`
- `VendorsList`

## Major user journey

1. Login
2. Dashboard/Home
3. Customers → create customer
4. Products → create product
5. Invoices → create invoice
6. Payments
7. Document/report preview
8. Settings → language (English/Albanian)
9. Logout

## Flow requirements

- Use stable accessibility labels/test IDs following `<screen>-<element>-<action>`.
- Assert loading, empty, error, protected-route, and success states where they exist.
- Tag all created data with the QA namespace and clean only that data.
- Capture console/runtime/network failures as separate evidence.
- Do not run against production or use customer accounts.

## Current limitation

- Maestro flows exist, but the Maestro CLI is not installed in this environment; xcrun is also unavailable.
