---
title: QR and barcode scanner
description: Understand the QR/barcode scanner entry points used by invoice, product, and purchase flows.
category: invoices
language: en
keywords:
  - QR scanner
  - barcode
  - scan invoice
  - SKU
---

Language: **English** | [Shqip](../../sq/invoices/qr-scanner.md)

# QR and barcode scanner

The app registers a modal `QRScanner` route. The calling screen supplies a mode and, in some flows, the screen to return to.

## Invoice/document QR

The invoice list/detail flow can open the scanner to inspect invoice QR data. The scanner must receive a supported code and return to the requesting flow. It is not documented as a universal fiscal-receipt verifier; live fiscalization is disabled in the current app configuration.

## Product SKU/barcode

Product creation can open the scanner to populate a SKU. Products list screens also expose barcode scanning for product lookup. Confirm the returned value before saving because the scanner is an input helper, not a stock adjustment.

## Purchase-bill scanning

The purchase flow can open **Scan bill** and pass scanned data to the supplier-bill form. The current form uses recognized vendor, bill number, date, and line values when they are present; unrecognized values still require manual review.

Related: [Products](../products/manage-products.md), [Supplier bills](../company/suppliers-and-bills.md), [Fiscalization status](../fiscalization/status-and-eligibility.md).
