import type { CommercialDocumentType } from "@invoice-monorepo/commercial-documents";

export type InvoiceStatus = "draft" | "sent" | "paid" | "partial" | "overdue" | "cancelled" | "viewed" | "accepted" | "rejected" | "expired" | "converted" | "issued" | "partially_paid" | "confirmed" | "processing" | "fulfilled" | "prepared" | "dispatched" | "delivered" | "credited" | "corrected" | "DRAFT" | "ISSUED" | "PAID" | "PARTIALLY_PAID" | "OVERDUE" | "CANCELLED" | "SENT" | "VIEWED" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "CONVERTED" | "CONFIRMED" | "PROCESSING" | "FULFILLED" | "PREPARED" | "DISPATCHED" | "DELIVERED" | "CREDITED" | "CORRECTED";
export type PaymentMethod = "cash" | "bank" | "card";
export type InvoiceTemplate = "corporate" | "thermal";
export type DataRow = Record<string, unknown> & { id: string };

export interface ClientRow extends DataRow { name: string; email?: string; phone?: string; address?: string; city?: string; zip_code?: string; country?: string; tax_id?: string; nui?: string; fiscal_number?: string; vat_number?: string; discount_percent?: number; pos_walk_in_customer?: boolean; created_at: string; }
export interface ProductRow extends DataRow { name: string; description?: string; sku?: string; barcode?: string; image_url?: string; unit_price: number; tax_rate?: number; tax_included?: boolean; track_stock?: boolean; low_stock_threshold?: number; unit?: string; category?: string; stock_quantity?: number; created_at: string; }
export interface InvoiceRow extends DataRow { invoice_number: string; public_qr_token?: string | null; client_id?: string; issue_date: string; due_date?: string; status: InvoiceStatus; type?: string; subtype?: string; commercial_document_type?: CommercialDocumentType | string | null; commercial_status?: string | null; accounting_state?: string | null; accounting_status?: string | null; vat_status?: string | null; inventory_status?: string | null; payment_status?: string | null; fiscalization_status?: string | null; source_document_type?: string | null; source_document_id?: string | null; original_invoice_id?: string | null; delivery_method?: string | null; pickup_branch_id?: string | null; delivery_details?: string | null; discount_amount: number; discount_percent?: number; tax_amount: number; total_amount: number; payment_method?: PaymentMethod; amount_received?: number; change_amount?: number; currency?: string; show_product_pictures?: boolean; template_id?: InvoiceTemplate; paper_size?: "A4" | "A5" | "Receipt"; buyer_signature_url?: string | null; customer_signature_requested?: boolean; customer_signature_status?: "not_requested" | "pending" | "signed" | "declined"; customer_signature_name?: string | null; customer_signed_at?: string | null; created_at: string; client?: { name: string } | null; }
export interface ExpenseRow extends DataRow { amount: number; category: string; description?: string; date: string; type?: "expense" | "income"; created_at: string; }
export interface PaymentRow extends DataRow { payment_number: string; amount: number; payment_date: string; payment_method: PaymentMethod; bank_reference?: string; created_at: string; client?: { name: string } | null; }

export interface InvoiceEditorItem { id: string; product_id?: string; description: string; quantity: number; unit_price: number; tax_rate: number; tax_included?: boolean; discount: number; unit: string; sku?: string; image_url?: string; }
export interface InvoiceDraft {
  client_id: string; invoice_number: string; issue_date: string; due_date: string; payment_method: PaymentMethod; qrReference?: string; currency?: string;
  commercial_document_type?: CommercialDocumentType; source_document_type?: string | null; source_document_id?: string | null;
  delivery_method?: "pickup" | "delivery" | "bus" | "other" | null; pickup_branch_id?: string | null; delivery_details?: string;
  discount_percent?: number; show_product_pictures?: boolean; show_stamp?: boolean; show_signature?: boolean;
  amount_received: number; notes: string; status: InvoiceStatus; items: InvoiceEditorItem[];
  buyer_signature_url?: string | null;
  customer_signature_requested?: boolean;
  customer_signature_status?: "not_requested" | "pending" | "signed" | "declined";
  customer_signature_name?: string | null;
  customer_signed_at?: string | null;
}

export interface InvoiceTemplateConfig {
  style?: InvoiceTemplate;
  pageSize?: "A4" | "A5" | "Receipt";
  showLogo?: boolean;
  showSignature?: boolean;
  showBuyerSignature?: boolean;
  showStamp?: boolean;
  showNotes?: boolean;
  showDiscount?: boolean;
  showTax?: boolean;
  showQrCode?: boolean;
  showBankDetails?: boolean;
  showProductPictures?: boolean;
  defaultDueDays?: number;
  defaultTaxRate?: number;
  primaryColor?: string;
  footerText?: string;
  fields?: unknown[];
  columns?: unknown[];
  labels?: Record<string,string>;
  visibleColumns?: {
    rowNumber?: boolean; sku?: boolean; description?: boolean; quantity?: boolean;
    unit?: boolean; unitPrice?: boolean; discount?: boolean; taxRate?: boolean;
    lineTotal?: boolean; grossPrice?: boolean;
  };
}
