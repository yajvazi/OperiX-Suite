import type { InvoiceTemplateConfig } from "./models";

export interface InvoiceTemplateRow {
  id: string;
  name?: string;
  fields?: unknown[];
  columns?: unknown[];
  show_logo?: boolean;
  show_signature?: boolean;
  show_buyer_signature?: boolean;
  show_stamp?: boolean;
  show_notes?: boolean;
  show_discount?: boolean;
  show_tax?: boolean;
  show_qr_code?: boolean;
  show_bank_details?: boolean;
  default_due_days?: number;
  default_tax_rate?: number;
  primary_color?: string;
  footer_text?: string;
}

export function templateConfigFromRow(row: InvoiceTemplateRow): InvoiceTemplateConfig {
  const visibleColumns = Object.fromEntries(
    (row.columns || [])
      .filter((column): column is Record<string, unknown> => Boolean(column) && typeof column === "object")
      .map((column) => [String(column.key || ""), column.enabled !== false]),
  );

  return {
    showLogo: row.show_logo ?? true,
    showSignature: row.show_signature ?? true,
    showBuyerSignature: row.show_buyer_signature ?? true,
    showStamp: row.show_stamp ?? true,
    showNotes: row.show_notes ?? true,
    showDiscount: row.show_discount ?? true,
    showTax: row.show_tax ?? true,
    showQrCode: row.show_qr_code ?? true,
    showBankDetails: row.show_bank_details ?? true,
    defaultDueDays: row.default_due_days ?? 30,
    defaultTaxRate: Number(row.default_tax_rate ?? 18),
    primaryColor: row.primary_color || "#004FFE",
    footerText: row.footer_text || "",
    fields: row.fields || [],
    columns: row.columns || [],
    visibleColumns: {
      rowNumber: visibleColumns.row_number,
      sku: visibleColumns.sku,
      description: visibleColumns.description,
      quantity: visibleColumns.quantity,
      unit: visibleColumns.unit,
      unitPrice: visibleColumns.unit_price,
      discount: visibleColumns.discount,
      taxRate: visibleColumns.tax_rate,
      lineTotal: visibleColumns.line_total,
      grossPrice: visibleColumns.gross_price,
    },
  };
}

export function templateRowFromConfig(
  config: InvoiceTemplateConfig,
  userId: string,
  name = "Default Template",
) {
  return {
    user_id: userId,
    name,
    fields: config.fields || [],
    columns: config.columns || [],
    show_logo: config.showLogo ?? true,
    show_signature: config.showSignature ?? true,
    show_buyer_signature: config.showBuyerSignature ?? true,
    show_stamp: config.showStamp ?? true,
    show_notes: config.showNotes ?? true,
    show_discount: config.showDiscount ?? true,
    show_tax: config.showTax ?? true,
    show_qr_code: config.showQrCode ?? true,
    show_bank_details: config.showBankDetails ?? true,
    default_due_days: config.defaultDueDays ?? 30,
    default_tax_rate: config.defaultTaxRate ?? 18,
    primary_color: config.primaryColor || "#004FFE",
    footer_text: config.footerText || "",
    is_default: true,
    updated_at: new Date().toISOString(),
  };
}
