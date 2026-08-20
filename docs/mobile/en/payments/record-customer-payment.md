---
title: Record a customer payment
description: Record cash, bank, or card payments and optionally allocate them to an invoice.
category: payments
language: en
keywords:
  - customer payment
  - partial payment
  - payment allocation
  - cash
  - bank transfer
  - card
---

Language: **English** | [Shqip](../../sq/payments/record-customer-payment.md)

# Record a customer payment

## Create a payment

1. Open **More > Money** or choose **Record payment** from a customer or invoice.
2. Enter or review the payment number.
3. Select the customer.
4. Optionally select an unpaid invoice.
5. Enter the amount. It must be greater than zero.
6. Select **Cash**, **Bank**, or **Card**.
7. For bank payments, enter the bank reference when available.
8. Set the payment date and add notes if needed.
9. Save the payment.

When an invoice is selected, the form calls the customer-payment posting RPC and then an allocation RPC. The invoice status/balance changes only when the allocation succeeds. A warning can therefore mean that the payment exists but is not linked to the invoice yet.

## Partial and full payments

Enter only the amount actually received for a partial payment. Repeat the process for later payments. The invoice detail reads payment rows and the backend allocation state; use the invoice and payment lists together to verify the remaining balance.

## Fields

| Field | Meaning | Current behavior |
|---|---|---|
| Payment number | Reference for the payment | Form proposes a `PAY-` number based on the current count and permits editing |
| Payment date | Date received | Defaults to the current date string |
| Customer | Payer/customer | Required |
| Invoice | Invoice to allocate | Optional; list shows unpaid invoices for the selected customer |
| Amount | Amount received | Required and must be positive |
| Method | Cash, bank, or card | Required selection in the form |
| Bank reference | Transfer/reference number | Shown for bank method |
| Notes | Additional description | Optional |

The posting path selects a company settlement account (cash or bank) and uses an idempotency key for the RPC call. The app then shares a transaction PDF in the completed flow when the platform permits it.

## Payment history

**Payments** lists recorded customer payments and totals for the current workspace. Open a payment to edit where the screen allows it. Refunds were not found as a dedicated mobile workflow.

Related: [Invoice statuses](../invoices/invoice-detail-and-statuses.md), [Customer detail](../customers/manage-customers.md), [Vendor payments](./vendor-payments.md).
