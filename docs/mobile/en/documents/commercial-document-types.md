---
title: Commercial document types
description: Learn how the mobile app distinguishes invoices, quotes, proformas, orders, delivery notes, corrections, and other document types.
category: documents
language: en
keywords:
  - quote
  - proforma
  - sales order
  - delivery note
  - invoice
  - credit note
  - debit note
---

Language: **English** | [Shqip](../../sq/documents/commercial-document-types.md)

# Commercial document types

OperiX stores the document identity in the explicit `commercial_document_type` field. The shared domain does not infer a type from the PDF title. The mobile form and detail/conversion screens use this vocabulary:

| Type | App label | What the current app provides |
|---|---|---|
| `QUOTE` | Quote / Ofertë | Commercial proposal; status and conversion to sales order or invoice |
| `PROFORMA` | Proforma / Pro-faturë | Preliminary commercial document; conversion to invoice or advance path |
| `SALES_ORDER` | Sales order / Porosi | Requested/confirmed order; ordered/delivered/remaining line fields in shared schema |
| `DELIVERY_NOTE` | Delivery note / Fletëdërgesë | Delivery/movement document; fulfillment status/RPC support is partial in mobile |
| `INVOICE` | Invoice / Faturë | Main invoice flow; POS and posting paths are integrated with backend RPCs |
| `ADVANCE_INVOICE` | Advance invoice / Faturë Paradhënie | Type and conversion exist; full advance reconciliation is partial in mobile |
| `FINAL_INVOICE` | Final invoice / Faturë Përfundimtare | Type and conversion from advance exist; review advance application before relying on it |
| `CREDIT_NOTE` | Credit note / Notë Krediti | Created from an original invoice through correction conversion |
| `DEBIT_NOTE` | Debit note / Notë Debiti | Created from an original invoice through correction conversion |
| `SIMPLIFIED_INVOICE` | Simplified invoice / Faturë e Thjeshtuar | Shared type recognized by code; no dedicated quick-create card was found |
| `FISCAL_RECEIPT` | Fiscal receipt / Kupon Fiskal | Shared type only; production EFS is disabled/not certified |
| `BAD_DEBT_INVOICE` | Bad-debt invoice | Shared internal vocabulary; not a normal mobile creation action |

## Operational versus financial behavior

The shared domain marks quote, proforma, order, and delivery-note effects as no-effect or policy-dependent for accounting, VAT, receivable, inventory, and fiscalization. Invoice and correction types have posting/effect states, but final accounting and tax outcomes come from the backend posting functions, permissions, and current company configuration. This page is a code-behavior guide, not independent legal advice.

## Status differences

Quotes use draft, sent, viewed, accepted, rejected, expired, converted, and cancelled. Proformas use draft, sent, viewed, partially paid, paid, converted, expired, and cancelled. Orders and delivery notes have their own confirmation/fulfillment/delivery states. Invoices and notes use issued/payment/correction states. A generic “sent” label must not be interpreted as an issued invoice.

## Creating a type

Use a visible quick action or a conversion from the source document. The app sends both the canonical type and legacy `type`/`subtype` compatibility fields to the existing invoice storage. Never change only the heading in a PDF.

See [Conversions and related documents](./conversions-and-related-documents.md) and [Invoice creation](../invoices/create-and-edit.md).
