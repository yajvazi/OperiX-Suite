---
title: Create and edit an invoice
description: Learn how to create an invoice or another supported commercial document in OperiX Invoice Mobile.
category: invoices
language: en
keywords:
  - invoice
  - create invoice
  - edit invoice
  - VAT
  - customer
  - product
---

Language: **English** | [Shqip](../../sq/invoices/create-and-edit.md)

# Create and edit an invoice

The app uses one shared commercial-document form. The record’s explicit `commercial_document_type` determines whether it is an invoice, quote, proforma, order, delivery note, or another supported type. The PDF heading alone does not change the record type.

## Create an invoice

1. Open **Invoice** or choose **More > Sales** and tap the create action.
2. Select **Invoice** if a document-type choice is shown.
3. Select an existing customer, choose **Citizen**, or use **Add customer**.
4. Add a product or choose **Custom item**.
5. Enter quantity, unit price, unit, discount, and tax rate for each line.
6. Set the issue date and, if needed, the due date.
7. Review subtotal, discount, tax, and total.
8. Choose a payment method if the payment section is shown: bank transfer, cash, or card.
9. Enter amount received when applicable and review change.
10. Add notes or advanced document details if needed.
11. Tap **Save**.

The form requires at least one line and an active company. For a non-POS invoice without a customer, it uses the configured walk-in customer path. The invoice number is normally reserved at save through the `reserve_invoice_number` RPC.

## Important fields

| Field | Meaning | Required/default/validation |
|---|---|---|
| Invoice/document number | Number shown on the document | Usually allocated on save; manual advanced editing exists but must not be used to create duplicates |
| Customer | Client attached to the document | Optional in the form because walk-in customer can be used; a saved non-POS sale receives a walk-in customer if none is selected |
| Issue date | Date the document is issued | Defaults to the current date in the form |
| Due date | Date payment is expected | Optional; blank is stored as null |
| Product/service | Existing product or custom line | A line description and price are needed for a useful line |
| Description | Text printed for the line | Copied from the product when an existing product is selected |
| Quantity | Number of units/services | Entered per line; POS quantity controls use positive stock-aware values |
| Unit | Unit label such as pcs, hrs, kg, or unit | Product unit is copied when available |
| Unit price | Price before the line calculation | Product price is copied when available |
| Discount | Line/global discount percentage or amount as represented by the form | Customer default discount can be applied; totals use the form’s numeric value |
| Tax rate | Percentage used to calculate tax | Product tax rate is copied; the form calculates tax on the discounted amount |
| Notes | Free text attached to the document | Optional |
| Payment method | Bank, cash, or card in the invoice form | Optional in ordinary creation; POS supplies a method from the checkout flow |
| Amount received | Money received during the form flow | Optional; exact amount and change helpers are available |
| Customer signature | Requests a buyer signature | Only shown for `INVOICE`; a signature pad is required before saving when requested |

The form calculates each line as quantity × price less discount, then applies tax to the discounted amount. The displayed summary is subtotal, discount, tax, and total. Verify the saved document when a legacy screen displays a different subtotal convention.

## Edit a draft

1. Open the document from the invoice list or document trail.
2. Open the overflow menu.
3. Choose **Edit** when the document is still editable.
4. Change the fields and save.

The detail screen prevents normal editing when the commercial status is immutable, such as issued, paid, overdue, credited, corrected, or cancelled. Use a credit/debit correction path instead of rewriting an issued financial document. See [Statuses and corrections](./invoice-detail-and-statuses.md).

## Duplicate as draft

The detail overflow menu can create a new draft copy. This creates a separate document; it does not change the original and should not be treated as a payment or accounting reversal.

## Create other documents

The same form is used by the commercial-document conversion and creation paths. For differences between invoice, quote, proforma, order, delivery note, advance, final, credit, and debit documents, see [Commercial document types](../documents/commercial-document-types.md).

## Related help

- [Customers](../customers/manage-customers.md)
- [Products](../products/manage-products.md)
- [VAT and tax screens](../taxes/tax-center.md)
- [Record a payment](../payments/record-customer-payment.md)
- [PDF, sharing, and printing](./pdf-sharing-and-printing.md)
