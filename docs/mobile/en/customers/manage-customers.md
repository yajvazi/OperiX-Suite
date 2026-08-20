---
title: Manage customers
description: Create, search, edit, inspect, and use customers in OperiX Invoice Mobile.
category: customers
language: en
keywords:
  - customer
  - client
  - customer ledger
  - tax ID
  - VAT number
---

Language: **English** | [Shqip](../../sq/customers/manage-customers.md)

# Manage customers

## Create a customer

1. Open **Business > Clients** or choose the customer quick action.
2. Tap **Add customer**.
3. Enter the required name.
4. Add email, phone, address, city, ZIP/postal code, and country if available.
5. Open the advanced/business fields when needed and enter tax ID/NUI, fiscal number, VAT number, discount percentage, and notes.
6. Tap **Save**.

The form stores the customer under the current company/workspace. The **Check Registry** action opens the ATK VAT registry website in a browser; it does not automatically import or certify the customer record.

## Fields

| Field | Purpose | Current behavior |
|---|---|---|
| Name | Customer display name | Required |
| Email | Contact and invoice email | Optional; used by the email/PDF action when present |
| Phone | Contact number | Optional |
| Address, city, ZIP, country | Billing/contact address | Optional; copied into invoice PDF data |
| Tax ID / NUI | Tax or registration identifier | Optional advanced field; stored with customer |
| Fiscal number | Fiscal identifier | Optional advanced field |
| VAT number | VAT registration identifier | Optional advanced field |
| Discount percent | Default customer discount | Optional; invoice form can apply it when the customer is selected |
| Notes | Internal/customer notes | Optional |

## Search and list

The customer list supports search by name, email, phone, or city and a city filter. It shows customer counts and invoice-based value summaries for the current workspace. The app queries tenant-scoped data through the workspace service and Supabase RLS.

## Customer detail

Open a customer to see contact details, invoice/payment activity, balances as calculated by the screen, and actions for:

- creating an invoice with the customer preselected;
- recording a payment for the customer;
- opening the customer ledger;
- calling or emailing when the platform and contact data allow it.

## Edit or delete

Open the customer and choose edit where available. The list also has a delete action. The audited mobile UI does not label this as an archive workflow, so confirm before deleting and follow your company retention policy.

Related: [Create an invoice](../invoices/create-and-edit.md), [Customer payments](../payments/record-customer-payment.md), [Customer ledger](../reports/financial-reports.md).
