---
title: Navigation and route map
description: Complete navigation reference for the current OperiX Invoice Mobile app.
category: developer
language: en
keywords:
  - navigation
  - routes
  - tabs
  - React Navigation
  - deep links
---

# Navigation and route map

Navigation is implemented with `@react-navigation/native`, `@react-navigation/native-stack`, and `@react-navigation/bottom-tabs` in `src/navigation/AppNavigator.tsx`. Header rendering is disabled at navigator level; screens supply mobile headers.

## Tree

```text
AppNavigator
├── AuthNavigator (when no session)
│   ├── SignIn
│   ├── SignUp
│   └── JoinTeam
├── ApprovalPending (authenticated employee status = pending)
├── BiometricOverlay (authenticated profile biometric_enabled = true)
└── RootNavigator
    ├── MainTabs
    │   ├── Home -> HomeScreen
    │   ├── Sales -> SalesScreen
    │   ├── POS -> POSScreen (tab label: Invoice)
    │   ├── Business -> BusinessScreen
    │   └── More -> MoreScreen
    ├── GlobalSearch (modal)
    ├── QRScanner (modal)
    ├── Accounting
    ├── Payroll
    ├── ReportsHub -> ReportPreview
    ├── TaxCenter
    ├── Settings -> SettingsNavigator
    │   ├── SettingsMain
    │   ├── TemplateEditor
    │   ├── ContractTemplates
    │   ├── ContractTemplateEditor
    │   ├── InvoiceTemplateSettings
    │   ├── PaymentIntegrations
    │   ├── StripeDashboard
    │   ├── ManageCompanies
    │   └── AdvancedSettings
    ├── Profile, HelpSupport -> HelpCategory -> HelpArticle, About
    ├── InvoiceForm, InvoiceDetail, InvoicesList, AllInvoices
    ├── PaymentsList, PaymentForm
    ├── ClientForm, CustomerDetail
    ├── ProductsList, ProductForm, ProductDetail
    ├── ExpenseForm, ExpensesList
    ├── VendorsList, VendorForm, VendorLedger
    ├── VendorPaymentForm, VendorPaymentsList
    ├── SupplierBillForm, SupplierBillsList, ScanBill
    ├── ContractForm, ContractDetail
    └── compatibility: InvoicesTab, Management
```

## Compatibility navigators

`LegacyInvoicesNavigator`, `LegacyManagementNavigator`, and `LegacyExpensesNavigator` remain registered. They preserve older screens and route names while the bottom tabs use the current screens. New work should use typed root/tab routes and should not introduce another parallel business flow without a migration plan.

## Protected-route behavior

`AppNavigator` checks Supabase user state, profile `biometric_enabled`, and the latest employee status. It does not implement a server-side route authorization layer; RLS/RPC checks remain authoritative.

## Help routes and deep links

The native documentation flow uses typed React Navigation routes rather than a second router:

- `/help` corresponds to `HelpSupport`;
- `/help/<category>` corresponds to `HelpCategory` with `{ category, language? }`;
- `/help/<category>/<article-slug>` corresponds to `HelpArticle` with `{ articleId, language? }`.

These are predictable internal route equivalents for contextual help and article links. They are not currently OS-level universal links or a general external URL router.

## Deep links and schemes

`app.json` declares the `operix-invoice` scheme. Google OAuth uses an Expo Auth Session redirect. Stripe service code has a legacy `faturicka://stripe-callback` callback; treat this as an integration compatibility detail and verify before changing it. No general document deep-link router was found outside the native Help Center route flow.
