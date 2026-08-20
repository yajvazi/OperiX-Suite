import { calculateInvoice } from '@invoice-monorepo/money';

/**
 * Shared commercial-document vocabulary and invariants.
 *
 * The database stores an explicit commercial_document_type. PDF titles are
 * presentation only and must never be used to infer this value.
 */

export const COMMERCIAL_DOCUMENT_TYPES = [
  'QUOTE',
  'PROFORMA',
  'SALES_ORDER',
  'DELIVERY_NOTE',
  'INVOICE',
  'ADVANCE_INVOICE',
  'FINAL_INVOICE',
  'CREDIT_NOTE',
  'DEBIT_NOTE',
  'SIMPLIFIED_INVOICE',
  'FISCAL_RECEIPT',
  'BAD_DEBT_INVOICE',
] as const;

export type CommercialDocumentType = (typeof COMMERCIAL_DOCUMENT_TYPES)[number];

export type CommercialDocumentStatus =
  | 'DRAFT'
  | 'SENT'
  | 'VIEWED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CONVERTED'
  | 'CANCELLED'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'PARTIALLY_FULFILLED'
  | 'FULFILLED'
  | 'PREPARED'
  | 'DISPATCHED'
  | 'DELIVERED'
  | 'PARTIALLY_DELIVERED'
  | 'REJECTED_DELIVERY'
  | 'RETURNED'
  | 'ISSUED'
  | 'OVERDUE'
  | 'CREDITED'
  | 'PARTIALLY_CREDITED'
  | 'CORRECTED';

export type CommercialEffect =
  | 'NONE'
  | 'ON_ISSUE'
  | 'ON_SUPPLY'
  | 'ON_PAYMENT'
  | 'POLICY_DEPENDENT'
  | 'PROVIDER_ONLY';

export type LegacyDocumentType = 'invoice' | 'offer' | 'proforma';
export type LegacyDocumentSubtype =
  | 'regular'
  | 'offer'
  | 'pro_invoice'
  | 'order'
  | 'delivery_note'
  | 'advance_invoice'
  | 'final_invoice'
  | 'credit_note'
  | 'debit_note'
  | 'simplified_invoice'
  | 'fiscal_receipt'
  | 'bad_debt_invoice';

export interface DocumentEffects {
  vat: CommercialEffect;
  accounting: CommercialEffect;
  inventory: CommercialEffect;
  receivable: CommercialEffect;
  fiscalization: CommercialEffect;
}

export interface CommercialDocumentDefinition {
  type: CommercialDocumentType;
  label: { sq: string; en: string };
  prefix: string;
  statuses: readonly CommercialDocumentStatus[];
  effects: DocumentEffects;
  canShowPrices: boolean;
  mustHideFiscalIdentifiers: boolean;
  requiresOriginalDocument: boolean;
}

export interface CommercialDocumentLine {
  id?: string;
  sourceLineId?: string;
  productId?: string;
  description: string;
  quantity: number;
  orderedQuantity?: number;
  deliveredQuantity?: number;
  remainingQuantity?: number;
  unit?: string;
  unitPrice: number;
  discountPercent?: number;
  taxRate?: number;
  taxCode?: string;
}

const NO_EFFECTS: DocumentEffects = {
  vat: 'NONE',
  accounting: 'NONE',
  inventory: 'NONE',
  receivable: 'NONE',
  fiscalization: 'NONE',
};

export const DOCUMENT_DEFINITIONS: Record<CommercialDocumentType, CommercialDocumentDefinition> = {
  QUOTE: {
    type: 'QUOTE',
    label: { sq: 'Ofertë', en: 'Quote' },
    prefix: 'OF',
    statuses: ['DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED', 'CANCELLED'],
    effects: NO_EFFECTS,
    canShowPrices: true,
    mustHideFiscalIdentifiers: true,
    requiresOriginalDocument: false,
  },
  PROFORMA: {
    type: 'PROFORMA',
    label: { sq: 'Pro-faturë', en: 'Proforma' },
    prefix: 'PRO',
    statuses: ['DRAFT', 'SENT', 'VIEWED', 'PARTIALLY_PAID', 'PAID', 'CONVERTED', 'EXPIRED', 'CANCELLED'],
    effects: NO_EFFECTS,
    canShowPrices: true,
    mustHideFiscalIdentifiers: true,
    requiresOriginalDocument: false,
  },
  SALES_ORDER: {
    type: 'SALES_ORDER',
    label: { sq: 'Porosi', en: 'Sales order' },
    prefix: 'POR',
    statuses: ['DRAFT', 'CONFIRMED', 'PROCESSING', 'PARTIALLY_FULFILLED', 'FULFILLED', 'CANCELLED', 'CONVERTED'],
    effects: { ...NO_EFFECTS, inventory: 'POLICY_DEPENDENT' },
    canShowPrices: true,
    mustHideFiscalIdentifiers: true,
    requiresOriginalDocument: false,
  },
  DELIVERY_NOTE: {
    type: 'DELIVERY_NOTE',
    label: { sq: 'Fletëdërgesë', en: 'Delivery note' },
    prefix: 'FD',
    statuses: ['DRAFT', 'PREPARED', 'DISPATCHED', 'DELIVERED', 'PARTIALLY_DELIVERED', 'REJECTED_DELIVERY', 'RETURNED'],
    effects: { ...NO_EFFECTS, inventory: 'POLICY_DEPENDENT' },
    canShowPrices: true,
    mustHideFiscalIdentifiers: true,
    requiresOriginalDocument: false,
  },
  INVOICE: {
    type: 'INVOICE',
    label: { sq: 'Faturë', en: 'Invoice' },
    prefix: 'FAT',
    statuses: ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CREDITED', 'PARTIALLY_CREDITED', 'CANCELLED', 'CORRECTED'],
    effects: { vat: 'ON_ISSUE', accounting: 'ON_ISSUE', inventory: 'POLICY_DEPENDENT', receivable: 'ON_ISSUE', fiscalization: 'PROVIDER_ONLY' },
    canShowPrices: true,
    mustHideFiscalIdentifiers: false,
    requiresOriginalDocument: false,
  },
  ADVANCE_INVOICE: {
    type: 'ADVANCE_INVOICE',
    label: { sq: 'Faturë Paradhënie', en: 'Advance invoice' },
    prefix: 'PAR',
    statuses: ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CREDITED', 'CANCELLED', 'CORRECTED'],
    effects: { vat: 'ON_PAYMENT', accounting: 'ON_PAYMENT', inventory: 'NONE', receivable: 'POLICY_DEPENDENT', fiscalization: 'PROVIDER_ONLY' },
    canShowPrices: true,
    mustHideFiscalIdentifiers: false,
    requiresOriginalDocument: false,
  },
  FINAL_INVOICE: {
    type: 'FINAL_INVOICE',
    label: { sq: 'Faturë Përfundimtare', en: 'Final invoice' },
    prefix: 'FAT',
    statuses: ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CREDITED', 'PARTIALLY_CREDITED', 'CANCELLED', 'CORRECTED'],
    effects: { vat: 'ON_SUPPLY', accounting: 'ON_ISSUE', inventory: 'POLICY_DEPENDENT', receivable: 'ON_ISSUE', fiscalization: 'PROVIDER_ONLY' },
    canShowPrices: true,
    mustHideFiscalIdentifiers: false,
    requiresOriginalDocument: false,
  },
  CREDIT_NOTE: {
    type: 'CREDIT_NOTE',
    label: { sq: 'Notë Krediti', en: 'Credit note' },
    prefix: 'NK',
    statuses: ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'CREDITED', 'PARTIALLY_CREDITED', 'CANCELLED', 'CORRECTED'],
    effects: { vat: 'ON_ISSUE', accounting: 'ON_ISSUE', inventory: 'POLICY_DEPENDENT', receivable: 'ON_ISSUE', fiscalization: 'PROVIDER_ONLY' },
    canShowPrices: true,
    mustHideFiscalIdentifiers: false,
    requiresOriginalDocument: true,
  },
  DEBIT_NOTE: {
    type: 'DEBIT_NOTE',
    label: { sq: 'Notë Debiti', en: 'Debit note' },
    prefix: 'ND',
    statuses: ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'CORRECTED'],
    effects: { vat: 'ON_ISSUE', accounting: 'ON_ISSUE', inventory: 'POLICY_DEPENDENT', receivable: 'ON_ISSUE', fiscalization: 'PROVIDER_ONLY' },
    canShowPrices: true,
    mustHideFiscalIdentifiers: false,
    requiresOriginalDocument: true,
  },
  SIMPLIFIED_INVOICE: {
    type: 'SIMPLIFIED_INVOICE',
    label: { sq: 'Faturë e Thjeshtuar', en: 'Simplified invoice' },
    prefix: 'FAT',
    statuses: ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CREDITED', 'CANCELLED', 'CORRECTED'],
    effects: { vat: 'ON_ISSUE', accounting: 'ON_ISSUE', inventory: 'POLICY_DEPENDENT', receivable: 'ON_ISSUE', fiscalization: 'PROVIDER_ONLY' },
    canShowPrices: true,
    mustHideFiscalIdentifiers: false,
    requiresOriginalDocument: false,
  },
  FISCAL_RECEIPT: {
    type: 'FISCAL_RECEIPT',
    label: { sq: 'Kupon Fiskal', en: 'Fiscal receipt' },
    prefix: 'KUP',
    statuses: ['DRAFT', 'ISSUED', 'PAID', 'CANCELLED', 'CORRECTED'],
    effects: { vat: 'ON_ISSUE', accounting: 'ON_ISSUE', inventory: 'POLICY_DEPENDENT', receivable: 'POLICY_DEPENDENT', fiscalization: 'PROVIDER_ONLY' },
    canShowPrices: true,
    mustHideFiscalIdentifiers: false,
    requiresOriginalDocument: false,
  },
  BAD_DEBT_INVOICE: {
    type: 'BAD_DEBT_INVOICE',
    label: { sq: 'Faturë për borxh të keq', en: 'Bad-debt invoice' },
    prefix: 'BDI',
    statuses: ['DRAFT', 'ISSUED', 'CREDITED', 'CANCELLED', 'CORRECTED'],
    effects: { vat: 'ON_ISSUE', accounting: 'ON_ISSUE', inventory: 'NONE', receivable: 'POLICY_DEPENDENT', fiscalization: 'PROVIDER_ONLY' },
    canShowPrices: true,
    mustHideFiscalIdentifiers: false,
    requiresOriginalDocument: true,
  },
};

export const CONVERSION_PATHS: Readonly<Record<CommercialDocumentType, readonly CommercialDocumentType[]>> = {
  QUOTE: ['SALES_ORDER', 'INVOICE'],
  PROFORMA: ['SALES_ORDER', 'INVOICE', 'ADVANCE_INVOICE'],
  SALES_ORDER: ['DELIVERY_NOTE', 'INVOICE'],
  DELIVERY_NOTE: ['INVOICE'],
  INVOICE: ['CREDIT_NOTE', 'DEBIT_NOTE'],
  ADVANCE_INVOICE: ['FINAL_INVOICE'],
  FINAL_INVOICE: ['CREDIT_NOTE', 'DEBIT_NOTE'],
  CREDIT_NOTE: [],
  DEBIT_NOTE: [],
  SIMPLIFIED_INVOICE: ['CREDIT_NOTE', 'DEBIT_NOTE'],
  FISCAL_RECEIPT: ['CREDIT_NOTE'],
  BAD_DEBT_INVOICE: ['CREDIT_NOTE'],
};

export interface ConversionPlan {
  sourceType: CommercialDocumentType;
  targetType: CommercialDocumentType;
  copiedCommercialData: readonly string[];
  createsEconomicEvents: false;
  requiresOriginalDocument: boolean;
  relationType: string;
}

export function isCommercialDocumentType(value: unknown): value is CommercialDocumentType {
  return typeof value === 'string' && (COMMERCIAL_DOCUMENT_TYPES as readonly string[]).includes(value);
}

export function normalizeCommercialDocumentType(value: unknown): CommercialDocumentType | null {
  if (isCommercialDocumentType(value)) return value;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase().replace(/[ -]+/g, '_');
  return isCommercialDocumentType(normalized) ? normalized : null;
}

export function resolveCommercialDocumentType(row: {
  commercial_document_type?: unknown;
  document_type?: unknown;
  type?: unknown;
  subtype?: unknown;
  title?: unknown;
}): CommercialDocumentType {
  const explicit = normalizeCommercialDocumentType(row.commercial_document_type ?? row.document_type);
  if (explicit) return explicit;

  const subtype = String(row.subtype ?? '').trim().toLowerCase();
  const legacyType = String(row.type ?? '').trim().toLowerCase();
  if (subtype === 'offer' || (legacyType === 'offer' && !subtype)) return 'QUOTE';
  if (subtype === 'pro_invoice' || subtype === 'proforma' || legacyType === 'proforma') return 'PROFORMA';
  if (subtype === 'order' || legacyType === 'order') return 'SALES_ORDER';
  if (subtype === 'delivery_note') return 'DELIVERY_NOTE';
  if (subtype === 'advance_invoice') return 'ADVANCE_INVOICE';
  if (subtype === 'final_invoice') return 'FINAL_INVOICE';
  if (subtype === 'credit_note') return 'CREDIT_NOTE';
  if (subtype === 'debit_note') return 'DEBIT_NOTE';
  if (subtype === 'simplified_invoice') return 'SIMPLIFIED_INVOICE';
  if (subtype === 'fiscal_receipt') return 'FISCAL_RECEIPT';
  if (subtype === 'bad_debt_invoice') return 'BAD_DEBT_INVOICE';
  // The title is intentionally ignored. Unknown/legacy financial rows remain invoices.
  return 'INVOICE';
}

export function legacyFieldsForDocumentType(type: CommercialDocumentType): {
  type: LegacyDocumentType;
  subtype: LegacyDocumentSubtype;
} {
  if (type === 'QUOTE') return { type: 'offer', subtype: 'offer' };
  if (type === 'PROFORMA') return { type: 'proforma', subtype: 'pro_invoice' };
  if (type === 'SALES_ORDER') return { type: 'offer', subtype: 'order' };
  if (type === 'DELIVERY_NOTE') return { type: 'invoice', subtype: 'delivery_note' };
  if (type === 'ADVANCE_INVOICE') return { type: 'invoice', subtype: 'advance_invoice' };
  if (type === 'FINAL_INVOICE') return { type: 'invoice', subtype: 'final_invoice' };
  if (type === 'CREDIT_NOTE') return { type: 'invoice', subtype: 'credit_note' };
  if (type === 'DEBIT_NOTE') return { type: 'invoice', subtype: 'debit_note' };
  if (type === 'SIMPLIFIED_INVOICE') return { type: 'invoice', subtype: 'simplified_invoice' };
  if (type === 'FISCAL_RECEIPT') return { type: 'invoice', subtype: 'fiscal_receipt' };
  if (type === 'BAD_DEBT_INVOICE') return { type: 'invoice', subtype: 'bad_debt_invoice' };
  return { type: 'invoice', subtype: 'regular' };
}

export function documentTypeLabel(type: CommercialDocumentType, locale: 'sq' | 'en' = 'sq'): string {
  return DOCUMENT_DEFINITIONS[type].label[locale];
}

export function documentTypePrefix(type: CommercialDocumentType): string {
  return DOCUMENT_DEFINITIONS[type].prefix;
}

export function allowedConversion(sourceType: CommercialDocumentType, targetType: CommercialDocumentType): boolean {
  return CONVERSION_PATHS[sourceType].includes(targetType);
}

export function planConversion(sourceType: CommercialDocumentType, targetType: CommercialDocumentType): ConversionPlan {
  if (!allowedConversion(sourceType, targetType)) {
    throw new Error(`Conversion from ${sourceType} to ${targetType} is not supported`);
  }
  return {
    sourceType,
    targetType,
    copiedCommercialData: ['customer', 'addresses', 'currency', 'exchange rate', 'items', 'quantities', 'prices', 'discounts', 'tax classifications', 'notes', 'attachments', 'customer PO number'],
    createsEconomicEvents: false,
    requiresOriginalDocument: DOCUMENT_DEFINITIONS[targetType].requiresOriginalDocument,
    relationType: `${sourceType.toLowerCase()}_to_${targetType.toLowerCase()}`,
  };
}

export function isImmutableCommercialStatus(status: unknown): boolean {
  return ['ISSUED', 'PAID', 'OVERDUE', 'CREDITED', 'PARTIALLY_CREDITED', 'CORRECTED', 'CANCELLED'].includes(String(status ?? '').toUpperCase());
}

export interface CommercialLineInput {
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  taxRate?: number;
}

export interface CommercialTotals {
  subtotal: number;
  discount: number;
  taxable: number;
  vat: number;
  total: number;
}

export function calculateCommercialTotals(lines: readonly CommercialLineInput[]): CommercialTotals {
  const totals = calculateInvoice({ lines });
  return {
    subtotal: totals.subtotal,
    discount: totals.discount,
    taxable: totals.taxable,
    vat: totals.tax,
    total: totals.total,
  };
}

export function remainingAfterAdvances(total: number, advances: readonly number[]): number {
  const result = calculateInvoice({
    lines: [{ quantity: 1, unitPrice: Math.max(0, Number(total || 0)) }],
    paidAmount: advances.reduce((sum, amount) => sum + Math.max(0, Number(amount || 0)), 0),
  });
  return result.remaining;
}

export function defaultCommercialStatus(type: CommercialDocumentType): CommercialDocumentStatus {
  return DOCUMENT_DEFINITIONS[type].statuses[0];
}
