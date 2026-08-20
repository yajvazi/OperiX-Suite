---
title: Frequently asked questions
description: Answers to common questions about the current OperiX Invoice Mobile workflows.
category: faq
language: en
keywords:
  - FAQ
  - invoice questions
  - payment questions
  - company questions
---

Language: **English** | [Shqip](../../sq/faq/README.md)

# Frequently asked questions

## How do I create an invoice?

Open **Invoice** or a new-invoice action, select a customer, add at least one line, review dates/tax/total, and save. See [Create and edit an invoice](../invoices/create-and-edit.md).

## Can I create a quote or proforma?

Yes. The shared commercial-document form and Sales conversion paths recognize Quote and Proforma. Their stored type is different from `INVOICE`; changing a PDF title is not enough. See [Commercial document types](../documents/commercial-document-types.md).

## Can I edit an issued invoice?

The detail screen blocks ordinary editing for immutable statuses and posted accounting state. Use the supported credit/debit correction path and preserve the original.

## How do I mark an invoice paid?

Record a customer payment and allocate it to the invoice. The status changes based on the allocation result, not simply on opening the payment form.

## Can I record a partial payment?

Yes. Enter the amount received and allocate it to the invoice. Verify the remaining balance in invoice detail.

## How do I change invoice numbering?

Number reservation is handled by the backend document-sequence allocator. Advanced settings exposes sequence-related data, but users must not reuse or silently change an issued number. Ask an administrator.

## Can I change VAT?

The invoice form and product form contain tax-rate/tax-treatment fields. Select the value used by your company’s configured workflow and verify the resulting document; the app does not replace professional tax advice.

## How do I add a logo or bank details?

Open **More > Settings**, expand the identity or bank section, and save the values. They are used by PDF data when configured.

## Can I use multiple currencies?

Shared formatting recognizes multiple currencies, but current mobile invoice/company forms default to EUR and do not expose a complete currency-management workflow. Confirm the saved document and accounting setup before using a non-EUR flow.

## Is customer portal access available in mobile?

No dedicated customer-portal screen was found in the mobile app. Mobile can compose email/share PDFs; portal behavior belongs to other repository surfaces and must not be assumed from this app.

## Is the app offline?

Not as a complete offline-first app. Theme/language are persisted locally and POS held orders are temporary screen state. Records generally require live Supabase access.

## Is fiscalization active?

The current Tax Center shows **EFS NOT CERTIFIED** and production EFS is disabled in the audited mobile configuration. Do not call an ordinary invoice PDF a fiscal receipt.
