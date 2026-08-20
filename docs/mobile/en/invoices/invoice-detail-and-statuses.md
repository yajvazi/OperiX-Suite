---
title: Invoice detail, statuses, and corrections
description: Understand invoice detail actions, commercial statuses, payments, related documents, and immutable corrections.
category: invoices
language: en
keywords:
  - invoice detail
  - invoice status
  - paid
  - overdue
  - credit note
  - debit note
---

Language: **English** | [Shqip](../../sq/invoices/invoice-detail-and-statuses.md)

# Invoice detail, statuses, and corrections

Open an invoice from **Sales**, **Invoices**, the Home activity list, or a customer detail screen. The detail view loads the customer, line items, payments, source links, linked documents, and commercial timeline when those records exist.

## Actions

The overflow menu can expose actions according to type and status:

- edit a draft or otherwise editable operational document;
- preview the document;
- share or print a PDF;
- record a payment;
- convert to an allowed next document;
- change a supported commercial status;
- create a credit note or debit note from an invoice-type document;
- duplicate as a new draft;
- delete a draft when the backend permission and immutable checks allow it;
- open related documents.

Issued financial documents are not silently deleted or rewritten. The database includes immutable/issued fields and the app checks the commercial status and accounting state before allowing destructive actions.

## Statuses

The shared domain defines type-specific statuses. Common invoice statuses are:

- **Draft** — being prepared;
- **Issued** — financial document has been issued/posted by the relevant flow;
- **Partially paid** — some payment has been allocated;
- **Paid** — allocated payment reaches the payable amount;
- **Overdue** — the document is past due according to the status data;
- **Credited** or **Partially credited** — a credit correction is linked;
- **Cancelled/Corrected** — a correction/cancellation state represented by the backend.

Quotes, proformas, orders, and delivery notes use different status sets. Do not infer their state from the invoice status label; see [Commercial document types](../documents/commercial-document-types.md).

## Payments and balance

The detail page reads payment rows for the invoice and can open **Record payment**. A payment may be posted first and allocated to an invoice in a separate operation. If allocation reports a warning, check both the payment list and invoice balance before retrying.

## Related documents and timeline

The **Related documents** section follows source links such as quote → order → delivery note → invoice, proforma → advance/final invoice, and invoice → credit/debit note. The timeline shows database events when present. An email compose action is not proof that the message was delivered, opened, or legally accepted.

## Corrections

To correct an issued invoice:

1. Open the original invoice.
2. Open the overflow menu.
3. Choose **Create Credit Note** or **Create Debit Note** when offered.
4. Keep the original invoice unchanged.
5. Review the new document and its original-document reference.

Credit/debit note behavior is implemented through the shared commercial-document domain and backend accounting functions. Use the current company procedure for reasons, VAT treatment, and approval; this user guide does not make an independent legal determination.

## Delete behavior

Delete is intended for drafts and is guarded by permissions. Issued or posted financial records are expected to remain traceable. If the delete action is missing, the status, accounting state, or company permission is preventing it.

Related: [Record a payment](../payments/record-customer-payment.md), [Conversions](../documents/conversions-and-related-documents.md), [PDF actions](./pdf-sharing-and-printing.md).
