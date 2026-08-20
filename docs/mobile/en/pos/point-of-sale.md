---
title: Point of sale
description: Build a product cart, choose a customer and payment intent, and send the sale through the invoice checkout flow.
category: pos
language: en
keywords:
  - POS
  - point of sale
  - cart
  - checkout
  - held order
---

Language: **English** | [Shqip](../../sq/pos/point-of-sale.md)

# Point of sale

Open the **Invoice** bottom tab to open the POS screen. The tab label is invoice because a completed POS cart is sent through the invoice workflow.

## Start a sale

1. Search products or select a category.
2. Tap a product to add it to the cart.
3. Use plus/minus controls to change quantity.
4. Open the customer picker and select a customer or **Citizen**.
5. Review the cart total.
6. Choose a payment intent: cash, card, debt, or other.
7. Continue to the invoice form.
8. Review the invoice, customer, taxes, and payment data.
9. Save/create the invoice.

The POS screen itself does not complete a standalone receipt. `InvoiceFormScreen` receives the cart, customer, payment method, and an idempotency key; the invoice save path then calls the stock-tracked invoice RPC.

## Stock and totals

Tracked products use their stock quantity to limit additions. The POS cart total is calculated from quantity × unit price. Tax and invoice totals are handled in the subsequent invoice form; review the final invoice rather than treating the cart total as the complete tax calculation.

## Hold and restore

The screen can hold a cart and restore it while the screen remains mounted. The audited mobile implementation stores held orders in React state. It does not persist them to device storage or call the backend persisted-held-order functions, so a reload or unmount can lose them.

## Not found as complete mobile POS features

No complete mobile cashier shift/register close, cash drawer reconciliation, return/refund screen, receipt printer setup, or offline queue was found. Backend migrations contain POS/idempotency concepts; the mobile screen must still be treated as the source of the current user-visible behavior.

Related: [Inventory](../inventory/stock-and-low-stock.md), [Create an invoice](../invoices/create-and-edit.md), [Payments](../payments/record-customer-payment.md).
