import type { InvoiceDraft } from "@/lib/models";
import { resolveCommercialDocumentType } from "@invoice-monorepo/commercial-documents";

type Row = Record<string, unknown>;
const text = (row: Row, key: string) => (row[key] == null ? "" : String(row[key]));

/** A stored invoice as the draft the PDF template prints. */
export function invoiceRowToDraft(row: Row, fallbackCurrency = "EUR"): InvoiceDraft {
  const items = Array.isArray(row.items) ? (row.items as Row[]) : [];
  return {
    client_id: text(row, "client_id"), invoice_number: text(row, "invoice_number"), issue_date: text(row, "issue_date"), due_date: text(row, "due_date") || text(row, "issue_date"),
    payment_method: (text(row, "payment_method") || "bank") as InvoiceDraft["payment_method"], currency: text(row, "currency") || fallbackCurrency,
    amount_received: Number(row.amount_received || 0), notes: text(row, "notes"), status: (text(row, "status") || "draft") as InvoiceDraft["status"],
    commercial_document_type: resolveCommercialDocumentType(row), source_document_type: text(row, "source_document_type") || null, source_document_id: text(row, "source_document_id") || null,
    delivery_method: (text(row, "delivery_method") || null) as InvoiceDraft["delivery_method"], pickup_branch_id: text(row, "pickup_branch_id") || null, delivery_details: text(row, "delivery_details"),
    show_product_pictures: Boolean(row.show_product_pictures), show_stamp: true, show_signature: true, qrReference: text(row, "public_qr_token") || undefined,
    buyer_signature_url: text(row, "buyer_signature_url") || null, customer_signature_requested: Boolean(row.customer_signature_requested),
    customer_signature_status: (text(row, "customer_signature_status") || "not_requested") as InvoiceDraft["customer_signature_status"],
    customer_signature_name: text(row, "customer_signature_name") || null, customer_signed_at: text(row, "customer_signed_at") || null,
    items: items.map((item) => ({
      id: text(item, "id"), product_id: text(item, "product_id") || undefined, description: text(item, "description"), quantity: Number(item.quantity || 0),
      unit_price: Number(item.unit_price || 0), tax_rate: Number(item.tax_rate || 0), tax_included: Boolean(item.tax_included), discount: Number(item.discount || 0),
      unit: text(item, "unit") || "pcs", sku: text(item, "sku") || undefined, image_url: text(item, "image_url") || undefined,
    })),
  } as InvoiceDraft;
}
