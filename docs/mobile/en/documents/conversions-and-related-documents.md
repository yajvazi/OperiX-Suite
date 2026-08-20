---
title: Convert documents and follow the source chain
description: Understand supported commercial-document conversions, source references, and idempotent conversion behavior.
category: documents
language: en
keywords:
  - convert document
  - related documents
  - source document
  - credit note
  - final invoice
---

Language: **English** | [Shqip](../../sq/documents/conversions-and-related-documents.md)

# Convert documents and follow the source chain

Open a document’s detail screen and choose a conversion action from the overflow menu. The shared conversion plan copies commercial data but records a new document and source relation; it does not treat conversion alone as a second sale, payment, or stock movement.

## Supported mobile paths

The current detail screen exposes these paths when the source type allows them:

- Quote → Sales order
- Quote → Invoice
- Proforma → Advance invoice
- Proforma → Invoice
- Sales order → Delivery note
- Sales order → Invoice
- Delivery note → Invoice
- Advance invoice → Final invoice
- Invoice or final/simplified invoice → Credit note
- Invoice or final/simplified invoice → Debit note

The backend shared domain also knows additional types, but a path is available only when the detail screen and backend RPC allow it.

## What is copied

Conversion carries customer/address context, currency and exchange-rate fields when present, line items and quantities, prices, discounts, tax classifications, notes, attachments/PO references when stored, and a source document reference. The new document receives its own number.

## Related-document graph

The data model supports one-to-many relationships such as one quote to multiple orders, one order to multiple delivery notes, multiple deliveries to one invoice, one invoice to multiple credit notes, and one invoice to multiple payments. The exact links shown depend on rows returned by `document_source_links` and related invoice fields.

## Partial quantities

Order and delivery line columns include ordered, delivered, and remaining quantities. The database triggers normalize order lines and fulfillment RPCs can update delivery state. The current mobile UI does not provide a complete multi-delivery editor, so verify quantities in the saved documents before billing.

## Corrections

Credit and debit notes require an original document in the shared type definition. Keep the source invoice; create a new note and review the original reference. The database contains safeguards for credit-line quantity limits where source line IDs are supplied.

## Idempotency and retry

Conversion is performed through `convert_commercial_document`. POS and payment/posting flows also use idempotency keys. If the UI shows an error after tapping conversion, check the document list and related-document section before trying again to avoid duplicate records.

Related: [Invoice detail](../invoices/invoice-detail-and-statuses.md), [Commercial document types](./commercial-document-types.md).
