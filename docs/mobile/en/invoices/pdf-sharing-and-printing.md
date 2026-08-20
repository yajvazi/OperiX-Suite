---
title: Preview, share, email, and print a document PDF
description: Learn how OperiX Invoice Mobile prepares invoice and transaction PDFs and shares them from the device.
category: invoices
language: en
keywords:
  - PDF
  - preview invoice
  - share invoice
  - print invoice
  - email invoice
---

Language: **English** | [Shqip](../../sq/invoices/pdf-sharing-and-printing.md)

# Preview, share, email, and print a document PDF

## Preview

1. Open an invoice or commercial document.
2. Choose **Preview** or open the automatic preview after saving.
3. Review the document in the in-app web view.

The detail screen builds `InvoiceData` from company, customer, document, line, payment, branding, and bank fields. The current preview path uses the corporate template adapter. The PDF service also contains a thermal/receipt path for receipt-sized output.

## Share or download through the device

1. Open the document detail screen.
2. Choose **Share PDF**.
3. Select an installed device destination such as Files, Mail, Messages, or another share target.

The app creates a temporary PDF with Expo Print and opens the native sharing sheet through Expo Sharing. The app does not provide a separate in-app document-storage library.

## Email

The email action requires a customer email address and uses the device mail composer. It attaches the generated PDF when the platform supports it. A compose action does not prove delivery, opening, or customer acceptance; the current mobile source does not provide a delivery-tracking service for this action.

## Print

Choose **Print** from the detail actions. The app first generates the PDF and then invokes the platform print dialog. A thermal print helper is also present for receipt-oriented output.

## Document identity and sensitive fields

The template receives the explicit commercial document type and label. For quote, proforma, order, and delivery-note documents, the detail data path hides fiscal identifiers. Do not manually rename a PDF heading and assume that it changes the stored type. See [Commercial document types](../documents/commercial-document-types.md).

Company branding and payment information come from [company settings](../settings/preferences-and-templates.md): logo, company information, signature/stamp, bank name, IBAN, SWIFT, and payment links where configured. Do not place secrets or private API keys in a document template.

## If PDF generation fails

Check that the document has a valid company/customer context and at least one line, retry with network/device storage available, and try the system share/print action again. If the problem persists, capture the document ID and contact support; see [Troubleshooting](../troubleshooting/common-problems.md).
