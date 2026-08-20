---
title: Home dashboard and main navigation
description: Understand the Home dashboard, quick actions, business tabs, and the More menu in OperiX Invoice Mobile.
category: dashboard
language: en
keywords:
  - dashboard
  - home
  - quick actions
  - recent activity
  - navigation
---

Language: **English** | [Shqip](../../sq/dashboard/home.md)

# Home dashboard and main navigation

## Home dashboard

The **Home** tab reads data for the selected workspace and shows:

- revenue for the current day, based on non-cancelled invoice issue dates;
- invoice/sales count for the current day;
- outstanding and overdue amounts calculated from invoice statuses and totals;
- payments received for the current day;
- a low-stock count for tracked products;
- recent invoices, payments, and expenses.

Tap the refresh control to query the workspace again. Empty values mean that the current scope has no matching records or that the query returned no data; they are not a promise that another company has no records.

## Quick actions

Depending on the current role and screen state, quick actions open:

- **New Invoice** — the invoice form;
- **Customer** — the customer form/list;
- **Expense** — the expense form;
- **Payment** — the customer payment form.

The global create button is role-aware. Worker users do not see every product or expense creation action.

## Bottom tabs

- **Home**: dashboard and recent activity.
- **Sales**: quotes, proformas, orders, delivery notes, invoices, filters, and the shared document trail. See [Commercial document types](../documents/commercial-document-types.md).
- **Invoice**: POS product selection and checkout. See [Point of sale](../pos/point-of-sale.md).
- **Business**: products, inventory, expenses, vendors, and income shortcuts. See [Business workspace](../company/business-workspace.md).
- **More**: accounting, reports, taxes, money, purchases, payroll where permitted, contracts, company management, integrations, settings, support, and about.

## Search

The search icon opens **GlobalSearch** as a modal. It uses the query sources implemented in the screen and is scoped to the current authenticated workspace. It is not a public search and does not expose another company’s data when RLS is configured correctly.

## Refresh and error states

Network/query failures show an error state with a retry action on screens that implement it. A loading state is shown while the app reads the workspace. See [Troubleshooting](../troubleshooting/common-problems.md) when a refresh repeatedly fails.
