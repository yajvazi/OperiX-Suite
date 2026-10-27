import {
  calculateInvoice,
  decimalToAtoms,
  type CalculatedInvoiceLine,
  type InvoiceCalculationResult,
} from '@invoice-monorepo/money';
import {
  DOCUMENT_DEFINITIONS,
  legacyFieldsForDocumentType,
  type CommercialDocumentType,
} from '@invoice-monorepo/commercial-documents';

export type DomainPaymentMethod = 'cash' | 'bank' | 'card' | 'online_payment' | 'cheque' | 'customer_credit' | 'pos' | 'other';

/** Cash payments must remain strictly below the Kosovo cash threshold. */
export const CASH_PAYMENT_LIMIT_ATOMS = decimalToAtoms('300', 2);

/**
 * Keep the cash threshold in the shared domain layer so Web and Mobile do
 * not implement slightly different floating-point checks.
 *
 * Empty values represent an unfilled form field and are treated as zero;
 * malformed values fail closed for callers that are validating a payment.
 */
export function isCashPaymentAllowed(value: number | string | null | undefined) {
  if (value === null || value === undefined || String(value).trim() === '') return true;
  try {
    return decimalToAtoms(String(value), 2) < CASH_PAYMENT_LIMIT_ATOMS;
  } catch {
    return false;
  }
}

/**
 * Explicit TAK sales-book classifications accepted by `invoices.tax_reporting_category`
 * (see supabase/migrations/20260727160000_kosovo_tax_reporting_fields.sql). An empty
 * selection means "classify automatically from the invoice VAT rates".
 * Web and Mobile render the same list. The Albanian wording should be reviewed by
 * an accountant before it is treated as official terminology.
 */
export const TAX_REPORTING_CATEGORIES = [
  { value: 'domestic_standard_18', label: { en: 'Domestic supply · 18%', sq: 'Furnizim i brendshëm · 18%' } },
  { value: 'domestic_reduced_8', label: { en: 'Domestic supply · 8%', sq: 'Furnizim i brendshëm · 8%' } },
  { value: 'exempt_no_credit', label: { en: 'Exempt without input-credit right · column 9', sq: 'E përjashtuar pa të drejtë kreditimi · kolona 9' } },
  { value: 'foreign_services', label: { en: 'Services outside Kosovo · column 10a', sq: 'Shërbime jashtë Kosovës · kolona 10a' } },
  { value: 'domestic_reverse_charge', label: { en: 'Domestic reverse charge · column 10b', sq: 'Tatim i kundërt i brendshëm · kolona 10b' } },
  { value: 'exempt_with_credit', label: { en: 'Other exempt with input-credit right · column 10c', sq: 'Të tjera të përjashtuara me të drejtë kreditimi · kolona 10c' } },
  { value: 'export', label: { en: 'Export · column 11', sq: 'Eksport · kolona 11' } },
  { value: 'debit_credit_18', label: { en: 'Debit/credit adjustment · 18%', sq: 'Rregullim debit/kredit · 18%' } },
  { value: 'debit_credit_8', label: { en: 'Debit/credit adjustment · 8%', sq: 'Rregullim debit/kredit · 8%' } },
  { value: 'bad_debt_18', label: { en: 'Bad-debt adjustment · 18%', sq: 'Rregullim borxhi të keq · 18%' } },
  { value: 'bad_debt_8', label: { en: 'Bad-debt adjustment · 8%', sq: 'Rregullim borxhi të keq · 8%' } },
  { value: 'vat_adjustment_18', label: { en: 'VAT increase adjustment · 18%', sq: 'Rregullim i rritjes së TVSH-së · 18%' } },
  { value: 'vat_adjustment_8', label: { en: 'VAT increase adjustment · 8%', sq: 'Rregullim i rritjes së TVSH-së · 8%' } },
  { value: 'reverse_charge_purchase_18', label: { en: 'Reverse-charge purchase · 18%', sq: 'Blerje me tatim të kundërt · 18%' } },
  { value: 'international_organization', label: { en: 'International organization', sq: 'Organizatë ndërkombëtare' } },
] as const;

export type TaxReportingCategory = (typeof TAX_REPORTING_CATEGORIES)[number]['value'];

export function taxReportingCategoryLabel(value: string | null | undefined, language: 'en' | 'sq' = 'en'): string {
  return TAX_REPORTING_CATEGORIES.find((category) => category.value === value)?.label[language] ?? '';
}

/** Quick due-date choices offered next to the due date field on both apps. */
export const DUE_DATE_PRESETS = ['one_week', 'two_weeks', 'one_month', 'two_months', 'three_months'] as const;
export type DueDatePreset = (typeof DUE_DATE_PRESETS)[number];

const DUE_DATE_PRESET_DAYS: Partial<Record<DueDatePreset, number>> = { one_week: 7, two_weeks: 14 };
const DUE_DATE_PRESET_MONTHS: Partial<Record<DueDatePreset, number>> = { one_month: 1, two_months: 2, three_months: 3 };

/**
 * Due date (YYYY-MM-DD) for an issue date (YYYY-MM-DD). Month presets keep the day of
 * the month and clamp to the end of shorter months (31 Jan + 1 month = 28/29 Feb),
 * matching the Mobile invoice form.
 */
export function dueDateForPreset(issueDate: string, preset: DueDatePreset): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(issueDate);
  if (!match) throw new Error('Issue date must be formatted as YYYY-MM-DD.');
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const days = DUE_DATE_PRESET_DAYS[preset];
  let result: Date;
  if (days) {
    result = new Date(Date.UTC(year, month, day + days));
  } else {
    const months = DUE_DATE_PRESET_MONTHS[preset] ?? 0;
    const target = new Date(Date.UTC(year, month + months, 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    result = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, lastDay)));
  }
  return result.toISOString().slice(0, 10);
}

export interface InvoiceLineDraft {
  id?: string;
  productId?: string | null;
  description: string;
  quantity: number | string;
  unitPrice: number | string;
  taxRate?: number | string;
  discountPercent?: number | string;
  unit?: string | null;
  sku?: string | null;
  taxIncluded?: boolean;
}

export interface InvoiceDraftInput {
  userId: string;
  companyId: string;
  branchId?: string | null;
  lines: readonly InvoiceLineDraft[];
  clientId?: string | null;
  invoiceNumber?: string | null;
  issueDate: string;
  dueDate?: string | null;
  postCod?: boolean;
  documentType: CommercialDocumentType;
  status?: string;
  commercialStatus?: string;
  paymentMethod?: DomainPaymentMethod;
  amountReceived?: number | string;
  notes?: string | null;
  currency?: string;
  exchangeRate?: number | string;
  documentDiscountPercent?: number | string;
  documentDiscountAmount?: number | string;
  shipping?: { amount: number | string; taxRate?: number | string; taxIncluded?: boolean };
  transport?: { amount: number | string; taxRate?: number | string; taxIncluded?: boolean };
  additionalFees?: { amount: number | string; taxRate?: number | string; taxIncluded?: boolean };
  taxIncluded?: boolean;
  templateId?: string | null;
  paperSize?: 'A4' | 'A5' | 'Receipt' | null;
  taxReportingCategory?: string | null;
  sourceDocumentType?: string | null;
  sourceDocumentId?: string | null;
  originalInvoiceId?: string | null;
  externalReference?: string | null;
  buyerSignatureUrl?: string | null;
  customerSignatureRequested?: boolean;
  customerSignatureStatus?: 'not_requested' | 'pending' | 'signed' | 'declined';
  customerSignatureName?: string | null;
  customerSignedAt?: string | null;
  showProductPictures?: boolean;
  idempotencyKey?: string | null;
}

export interface InvoicePersistencePayload {
  user_id: string;
  company_id: string;
  branch_id: string | null;
  client_id: string | null;
  invoice_number: string;
  issue_date: string;
  due_date: string | null;
  post_cod: boolean;
  status: string;
  type: string;
  subtype: string;
  commercial_document_type: CommercialDocumentType;
  commercial_status: string;
  accounting_state: 'legacy' | 'ready_for_posting';
  accounting_status: string;
  vat_status: string;
  inventory_status: string;
  payment_status: string;
  fiscalization_status: string;
  supply_date: string | null;
  order_date: string | null;
  delivery_date: string | null;
  source_document_type: string | null;
  source_document_id: string | null;
  original_invoice_id: string | null;
  external_reference?: string | null;
  tax_reporting_category: string | null;
  currency: string;
  exchange_rate: number | string;
  tax_amount: number;
  discount_amount: number;
  discount_percent: number;
  total_amount: number;
  amount_received: number;
  payment_method: DomainPaymentMethod;
  change_amount: number;
  shipping_amount: number;
  shipping_tax_amount: number;
  transport_amount: number;
  transport_tax_amount: number;
  additional_fee_amount: number;
  additional_fee_tax_amount: number;
  template_id: string;
  paper_size: 'A4' | 'A5' | 'Receipt';
  notes: string | null;
  buyer_signature_url: string | null;
  customer_signature_requested: boolean;
  customer_signature_status: 'not_requested' | 'pending' | 'signed' | 'declined';
  customer_signature_name: string | null;
  customer_signed_at: string | null;
  show_product_pictures: boolean;
}

export interface InvoiceItemPersistencePayload {
  product_id: string | null;
  description: string;
  quantity: number | string;
  unit: string;
  unit_price: number | string;
  tax_rate: number | string;
  discount: number | string;
  tax_included: boolean;
  sku: string;
  amount: number;
}

export class DomainValidationError extends Error {
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = 'DomainValidationError';
    this.field = field;
  }
}

function finiteNumber(value: number | string | undefined, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new DomainValidationError('Financial values must be finite numbers.');
  return parsed;
}

function normalizeDateOnly(value: string, field: string) {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new DomainValidationError(`${field} must be an ISO date (YYYY-MM-DD).`, field);
  }
  return normalized;
}

export function validateInvoiceDraft(input: InvoiceDraftInput, totals?: InvoiceCalculationResult) {
  if (!input.userId) throw new DomainValidationError('A signed-in user is required.', 'userId');
  if (!input.companyId) throw new DomainValidationError('A company workspace is required.', 'companyId');
  normalizeDateOnly(input.issueDate, 'issueDate');
  if (input.dueDate) normalizeDateOnly(input.dueDate, 'dueDate');
  if (!DOCUMENT_DEFINITIONS[input.documentType]) throw new DomainValidationError('Unsupported document type.', 'documentType');
  if (!input.lines?.length) throw new DomainValidationError('At least one invoice line is required.', 'lines');

  input.lines.forEach((line, index) => {
    if (!line.description.trim()) throw new DomainValidationError('Every invoice line needs a description.', `lines.${index}.description`);
    if (finiteNumber(line.quantity) <= 0) throw new DomainValidationError('Quantity must be greater than zero.', `lines.${index}.quantity`);
    if (finiteNumber(line.unitPrice) < 0) throw new DomainValidationError('Unit price cannot be negative.', `lines.${index}.unitPrice`);
    const discountPercent = finiteNumber(line.discountPercent);
    if (discountPercent < 0 || discountPercent > 100) throw new DomainValidationError('Discount must be between 0 and 100%.', `lines.${index}.discountPercent`);
    if (!Number.isInteger(discountPercent)) throw new DomainValidationError('Discount must be a whole percentage.', `lines.${index}.discountPercent`);
    if (finiteNumber(line.taxRate) < 0 || finiteNumber(line.taxRate) > 100) throw new DomainValidationError('VAT rate must be between 0 and 100%.', `lines.${index}.taxRate`);
  });

  if (input.documentDiscountPercent !== undefined) {
    const documentDiscountPercent = finiteNumber(input.documentDiscountPercent);
    if (documentDiscountPercent < 0 || documentDiscountPercent > 100) throw new DomainValidationError('Discount must be between 0 and 100%.', 'documentDiscountPercent');
    if (!Number.isInteger(documentDiscountPercent)) throw new DomainValidationError('Discount must be a whole percentage.', 'documentDiscountPercent');
  }

  if (input.paymentMethod === 'cash' && totals) {
    const submittedCashAmount = finiteNumber(input.amountReceived);
    if (!isCashPaymentAllowed(submittedCashAmount)) {
      throw new DomainValidationError('Cash payments are available only below 300.');
    }
    if (totals.paid < totals.total) throw new DomainValidationError('Cash received must cover the invoice total.');
  }
}

function effectiveDiscountPercent(calculated: CalculatedInvoiceLine) {
  // The shared calculator converts document-level discounts back to the gross
  // price basis for tax-inclusive lines. Persist that effective percentage so
  // the database can reproduce the exact taxable amount from primitives.
  return calculated.effectiveDiscountPercent;
}

function canonicalCommercialStatus(input: InvoiceDraftInput) {
  const definition = DOCUMENT_DEFINITIONS[input.documentType];
  const explicit = String(input.commercialStatus || '').trim().toUpperCase();
  const status = String(input.status || 'draft').trim().toLowerCase();
  const mappedStatus: Record<string, string> = {
    draft: 'DRAFT',
    sent: input.documentType === 'SALES_ORDER'
      ? 'CONFIRMED'
      : input.documentType === 'DELIVERY_NOTE'
        ? 'PREPARED'
        : input.documentType === 'INVOICE' || input.documentType.endsWith('_INVOICE') || input.documentType === 'CREDIT_NOTE' || input.documentType === 'DEBIT_NOTE'
          ? 'ISSUED'
          : 'SENT',
    posted: 'ISSUED',
    approved: 'ISSUED',
    partially_paid: 'PARTIALLY_PAID',
    paid: 'PAID',
    overdue: 'OVERDUE',
    cancelled: 'CANCELLED',
  };
  const statusCandidate = mappedStatus[status] || status.toUpperCase();
  const isAllowed = (value: string) => (definition.statuses as readonly string[]).includes(value);

  // A stale DRAFT value from one client must not erase a meaningful status
  // requested by the other client. Explicit non-draft values remain useful
  // for workflows such as VIEWED/ACCEPTED/CONVERTED.
  if (explicit && explicit !== 'DRAFT' && isAllowed(explicit)) return explicit;
  if (isAllowed(statusCandidate)) return statusCandidate;
  if (explicit && isAllowed(explicit)) return explicit;
  return 'DRAFT';
}

export function buildInvoicePersistencePayload(input: InvoiceDraftInput, totals: InvoiceCalculationResult, invoiceNumber: string): {
  invoice: InvoicePersistencePayload;
  items: InvoiceItemPersistencePayload[];
} {
  validateInvoiceDraft(input, totals);
  const legacy = legacyFieldsForDocumentType(input.documentType);
  const operational = ['QUOTE', 'PROFORMA', 'SALES_ORDER', 'DELIVERY_NOTE'].includes(input.documentType);
  const shouldPost = input.documentType === 'INVOICE';
  const amountReceived = shouldPost && input.paymentMethod === 'cash' ? totals.paid : 0;
  const signatureRequested = input.documentType === 'INVOICE' && Boolean(input.customerSignatureRequested);
  const signatureUrl = signatureRequested ? input.buyerSignatureUrl || null : null;
  const signatureStatus = signatureRequested
    ? input.customerSignatureStatus || (signatureUrl ? 'signed' : 'pending')
    : 'not_requested';
  const invoice: InvoicePersistencePayload = {
    user_id: input.userId,
    company_id: input.companyId,
    branch_id: input.branchId || null,
    client_id: input.clientId || null,
    invoice_number: invoiceNumber,
    issue_date: normalizeDateOnly(input.issueDate, 'issueDate'),
    due_date: input.dueDate ? normalizeDateOnly(input.dueDate, 'dueDate') : null,
    post_cod: Boolean(input.postCod),
    status: shouldPost ? 'draft' : input.status || 'draft',
    type: legacy.type,
    subtype: legacy.subtype,
    commercial_document_type: input.documentType,
    commercial_status: canonicalCommercialStatus(input),
    accounting_state: shouldPost ? 'ready_for_posting' : 'legacy',
    accounting_status: operational ? 'NOT_APPLICABLE' : 'READY_TO_POST',
    vat_status: operational ? 'NOT_APPLICABLE' : 'NOT_EVALUATED',
    inventory_status: input.documentType === 'SALES_ORDER' || input.documentType === 'DELIVERY_NOTE' ? 'POLICY_DEPENDENT' : 'NOT_APPLICABLE',
    payment_status: operational ? 'NOT_APPLICABLE' : 'UNPAID',
    fiscalization_status: 'NOT_REQUIRED',
    supply_date: input.documentType === 'INVOICE' || input.documentType === 'FINAL_INVOICE' ? input.issueDate : null,
    order_date: input.documentType === 'SALES_ORDER' ? input.issueDate : null,
    delivery_date: input.documentType === 'DELIVERY_NOTE' ? input.issueDate : null,
    source_document_type: input.sourceDocumentType || null,
    source_document_id: input.sourceDocumentId || null,
    original_invoice_id: input.originalInvoiceId || null,
    external_reference: input.externalReference,
    tax_reporting_category: input.taxReportingCategory || null,
    currency: totals.currency,
    exchange_rate: input.exchangeRate === undefined ? 1 : input.exchangeRate,
    tax_amount: totals.tax,
    discount_amount: totals.discount,
    discount_percent: totals.subtotal > 0 ? totals.discount / totals.subtotal * 100 : 0,
    total_amount: totals.total,
    amount_received: amountReceived,
    payment_method: input.paymentMethod || 'bank',
    change_amount: totals.change,
    shipping_amount: totals.shipping,
    shipping_tax_amount: totals.shippingTax,
    transport_amount: totals.transport,
    transport_tax_amount: totals.transportTax,
    additional_fee_amount: totals.additionalFees,
    additional_fee_tax_amount: totals.additionalFeesTax,
    template_id: input.templateId || 'corporate',
    paper_size: input.paperSize || 'A4',
    notes: input.notes || null,
    buyer_signature_url: signatureUrl,
    customer_signature_requested: signatureRequested,
    customer_signature_status: signatureStatus,
    customer_signature_name: signatureRequested ? input.customerSignatureName || null : null,
    customer_signed_at: signatureRequested && signatureUrl ? input.customerSignedAt || new Date().toISOString() : null,
    show_product_pictures: Boolean(input.showProductPictures),
  };
  const items = input.lines.map((line, index) => ({
    product_id: line.productId || null,
    description: line.description.trim(),
    quantity: line.quantity,
    unit: line.unit?.trim() || 'pcs',
    unit_price: line.unitPrice,
    tax_rate: finiteNumber(line.taxRate),
    discount: effectiveDiscountPercent(totals.lines[index]),
    tax_included: line.taxIncluded ?? input.taxIncluded ?? false,
    sku: line.sku?.trim() || '',
    amount: totals.lines[index].taxable,
  }));
  return { invoice, items };
}
