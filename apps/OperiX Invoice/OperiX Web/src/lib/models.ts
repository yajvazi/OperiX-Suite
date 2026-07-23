export type InvoiceStatus = "draft" | "sent" | "paid" | "partial" | "overdue" | "cancelled";
export type PaymentMethod = "cash" | "bank" | "card";
export type InvoiceTemplate = "corporate" | "thermal";
export type DataRow = Record<string, unknown> & { id: string };

export interface ClientRow extends DataRow { name: string; email?: string; phone?: string; address?: string; city?: string; country?: string; tax_id?: string; created_at: string; }
export interface ProductRow extends DataRow { name: string; description?: string; sku?: string; barcode?: string; image_url?: string; unit_price: number; tax_rate?: number; unit?: string; category?: string; stock_quantity?: number; created_at: string; }
export interface InvoiceRow extends DataRow { invoice_number: string; client_id?: string; issue_date: string; due_date?: string; status: InvoiceStatus; type?: string; discount_amount: number; tax_amount: number; total_amount: number; payment_method?: PaymentMethod; amount_received?: number; change_amount?: number; notes?: string; template_id?: InvoiceTemplate; paper_size?: "A4" | "A5" | "Receipt"; created_at: string; client?: { name: string } | null; }
export interface ExpenseRow extends DataRow { amount: number; category: string; description?: string; date: string; type?: "expense" | "income"; created_at: string; }
export interface PaymentRow extends DataRow { payment_number: string; amount: number; payment_date: string; payment_method: PaymentMethod; bank_reference?: string; created_at: string; client?: { name: string } | null; }

export interface InvoiceEditorItem { id: string; product_id?: string; description: string; quantity: number; unit_price: number; tax_rate: number; discount: number; unit: string; sku?: string; }
export interface InvoiceDraft {
  client_id: string; invoice_number: string; issue_date: string; due_date: string; payment_method: PaymentMethod;
  amount_received: number; notes: string; status: InvoiceStatus; items: InvoiceEditorItem[];
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
