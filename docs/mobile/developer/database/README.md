---
title: Mobile database entity reference
description: Tables, views, relations, and access patterns used by OperiX Invoice Mobile.
category: developer
language: en
keywords:
  - database
  - tables
  - views
  - relations
  - RLS
---

# Mobile database entity reference

This is the mobile-facing entity inventory. Exact columns are defined by the current migrations and generated Supabase schema; do not treat this page as permission to expose every column to a client.

## Identity, tenants, and access

| Entity | Purpose and mobile use | Relations/access |
|---|---|---|
| `profiles` | User profile, active/company IDs, role, language/theme/branding, bank data, biometric and integration fields | `id` is the auth user; profile queries are user-scoped |
| `companies` | Company profile, hierarchy, branding, tax/bank fields | `parent_company_id`; visible through membership/company policies |
| `memberships` | User-company membership and legacy role | `user_id`, `company_id`, role; RLS restricts membership reads |
| `employees` | Invite/approval status and employee metadata | Used by auth gate; status query is user-scoped/permissioned |
| `company_invitations` / invitation RPC contract | Pending invitations and token workflow | Admin/role permissions; token should not be logged |
| `app_roles` | Server role catalog exposed by company management | Company-specific/system roles; select is permissioned |

## Sales and commercial documents

| Entity/view | Purpose and mobile use | Relations/access |
|---|---|---|
| `invoices` | Compatibility storage for all explicit commercial document types and financial invoices | `company_id`, `user_id`, `client_id`, source/original invoice fields; RLS and posting guards |
| `invoice_items` | Shared line storage | `invoice_id`, optional `product_id`, source/credited line IDs, ordered/delivered/remaining quantities |
| `commercial_documents` view | Canonical document projection | Security-invoker view over invoices |
| `commercial_document_lines` view | Canonical line projection | Security-invoker view over invoice_items |
| `document_source_links` | Relation graph for conversions, corrections, attachments, and payment/advance links | Source/target IDs and company scope |
| `commercial_document_relations` view | Commercial-only source relation projection | Security-invoker view |
| `commercial_document_events` | Timeline/audit events | Company/document scoped; shown in invoice detail |
| `document_sequences` | Number allocator state | Company/document type/period; allocated via transaction/RPC |
| `invoice_templates` / template config fields | Invoice presentation configuration where migrated | Company/profile/template relations vary by migration |

## Customers, catalog, and money

| Entity | Purpose and mobile use |
|---|---|
| `clients` | Customer contacts, tax identifiers, default discount, walk-in marker |
| `products` | Product/service catalog, prices, tax, units, SKU/barcode, stock flags and import-cost fields |
| `payments` | Customer payments and invoice allocations |
| `expenses` | Expense/income records and optional receipt data |
| `vendors` | Supplier contacts and tax data |
| `vendor_payments` | Supplier payment records |
| `supplier_bills`, `supplier_bill_items` | Purchase bills and lines |
| `chart_of_accounts` | Settlement/account selection for payment posting |

All business entities must be read with the company/user scope expected by their migrations. A field’s existence does not mean it is safe to select for every role.

## Contracts, reports, tax, payroll, and integrations

| Entity/view | Mobile use |
|---|---|
| `contracts`, `contract_templates` | Contract records and template editor |
| `operix_report_summary`, `operix_trial_balance`, `operix_profit_loss`, `operix_balance_sheet`, `operix_cash_flow`, `operix_changes_in_equity`, `operix_general_ledger` | Accounting/report previews |
| `operix_asset_register`, `inventory_register`, `operix_ar_aging`, `operix_ap_open_items` | Asset, inventory, receivable, payable reports |
| `kosovo_sales_book`, `kosovo_purchase_book`, `withholding_transactions`, `tax_declarations`, `document_archive`, `kosovo_tax_calendar` | Tax Center/report previews |
| `kosovo_efs_status` | EFS status warning; current mobile defaults to not certified |
| `payroll_runs`, `payslip_snapshots`, `payroll_liabilities` | Payroll screen reads status/summary data |
| `payment_connections` | Auto-sync/provider connection metadata |
| `stripe_transactions`, `stripe_payouts` | Stripe dashboard sync results |

## Direct mobile table/view checklist

The following names are also extracted from literal `.from(...)` calls in the audited mobile source and are intentionally listed so a schema change is not missed:

`profiles`, `companies`, `memberships`, `employees`, `company_invitations`, `app_roles`, `clients`, `products`, `invoices`, `invoice_items`, `payments`, `expenses`, `vendors`, `vendor_payments`, `supplier_bills`, `supplier_bill_items`, `contracts`, `contract_templates`, `document_sequences`, `document_source_links`, `commercial_document_events`, `invoice_templates`, `chart_of_accounts`, `payment_connections`, `stripe_transactions`, `stripe_payouts`, `payroll_runs`, `payslip_snapshots`, `payroll_liabilities`, and `kosovo_efs_status`.

The report preview additionally selects a dynamic source from this verified definition set: `operix_report_summary`, `operix_trial_balance`, `operix_profit_loss`, `operix_balance_sheet`, `operix_cash_flow`, `operix_changes_in_equity`, `operix_general_ledger`, `operix_asset_register`, `inventory_register`, `operix_ar_aging`, `operix_ap_open_items`, `kosovo_sales_book`, `kosovo_purchase_book`, `withholding_transactions`, `tax_declarations`, `document_archive`, and `kosovo_tax_calendar`.

These entities are read only through authenticated Supabase access in the mobile app. The direct table list is not a client schema contract: migrations/RLS determine which columns and operations are allowed.

## Storage and local state

Branding images may be stored through profile/company fields as data/URL values in the current mobile path. Theme, language, and theme mode use AsyncStorage keys from the theme context. No general mobile business-record cache/queue was found.

## Schema review rule

Before changing a screen, inspect the latest relevant migration and its RLS policies, not only `packages/types`. The repository has legacy and phase migrations; the newest applicable migration wins for the target environment.
