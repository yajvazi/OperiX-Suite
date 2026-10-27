import { DecimalAmount } from '@invoice-monorepo/money';

/** Stable IDs are persisted in the database. Labels belong in the i18n layer. */
export const EXPENSE_CATEGORIES = [
  { id: 'fuel', en: 'Fuel', sq: 'Derivate', group: 'fuel' },
  { id: 'electricity', en: 'Electricity', sq: 'Energji elektrike', group: 'utilities' },
  { id: 'water', en: 'Water', sq: 'Ujë', group: 'utilities' },
  { id: 'waste', en: 'Waste', sq: 'Mbeturina', group: 'utilities' },
  { id: 'heating', en: 'Heating', sq: 'Ngrohje', group: 'utilities' },
  { id: 'internet', en: 'Internet', sq: 'Internet', group: 'utilities' },
  { id: 'telecommunications', en: 'Telecommunications', sq: 'Telefon', group: 'utilities' },
  { id: 'rent', en: 'Rent', sq: 'Qira', group: 'occupancy' },
  { id: 'office_supplies', en: 'Office Supplies', sq: 'Material zyre', group: 'operations' },
  { id: 'consumable_materials', en: 'Consumable Materials', sq: 'Material shpenzues', group: 'operations' },
  { id: 'maintenance', en: 'Maintenance', sq: 'Mirëmbajtje', group: 'operations' },
  { id: 'vehicle_expenses', en: 'Vehicle Expenses', sq: 'Shpenzime automjeti', group: 'transport' },
  { id: 'transport', en: 'Transport', sq: 'Transport', group: 'transport' },
  { id: 'software_subscriptions', en: 'Software & Subscriptions', sq: 'Softuer dhe abonime', group: 'operations' },
  { id: 'professional_services', en: 'Professional Services', sq: 'Shërbime profesionale', group: 'professional' },
  { id: 'bank_charges', en: 'Bank Charges', sq: 'Shpenzime bankare', group: 'financial' },
  { id: 'advertising_marketing', en: 'Advertising & Marketing', sq: 'Reklamë dhe marketing', group: 'marketing' },
  { id: 'representation', en: 'Representation', sq: 'Përfaqësim', group: 'representation' },
  { id: 'insurance', en: 'Insurance', sq: 'Sigurime', group: 'operations' },
  { id: 'training', en: 'Training', sq: 'Trajnime', group: 'professional' },
  { id: 'other_expenses', en: 'Other Expenses', sq: 'Shpenzime tjera', group: 'other' },
] as const;

export type ExpenseCategoryId = typeof EXPENSE_CATEGORIES[number]['id'];
export type ExpenseDocumentType = 'tax_invoice' | 'fiscal_receipt' | 'utility_invoice' | 'contract' | 'bank_document' | 'import_customs_document' | 'other';
export type TaxTreatment = 'fully_deductible' | 'partially_deductible' | 'non_deductible' | 'review_required';
export type VatTreatment = 'deductible' | 'partially_deductible' | 'non_deductible' | 'not_vat_registered' | 'no_vat_exempt' | 'review_required';
export type DocumentationStatus = 'complete' | 'missing_information' | 'missing_supporting_document';
export type ExpensePaymentStatus = 'unpaid' | 'partially_paid' | 'paid' | 'overdue';

export const EXPENSE_DOCUMENT_TYPES: readonly ExpenseDocumentType[] = [
  'tax_invoice', 'fiscal_receipt', 'utility_invoice', 'contract', 'bank_document', 'import_customs_document', 'other',
];

function decimal(value: string | number | null | undefined) {
  return DecimalAmount.from(String(value ?? 0), 4);
}

function percentage(value: string | number | null | undefined) {
  const parsed = decimal(value);
  if (parsed.atoms < 0n || parsed.atoms > 1000000n) throw new RangeError('Percentage must be between 0 and 100.');
  return parsed;
}

export function calculateExpenseTotals(input: { grossAmount: string | number; vatRate?: string | number | null }) {
  const gross = decimal(input.grossAmount);
  if (gross.atoms < 0n) throw new RangeError('Gross amount cannot be negative.');
  const rate = percentage(input.vatRate ?? 0);
  const vat = gross.multiply(rate, 4).multiplyRatio(1n, 100n);
  return { grossAmount: gross.toString(), vatRate: rate.toString(), vatAmount: vat.toString(), netAmount: gross.subtract(vat).toString() };
}

export function applyPercentage(amount: string | number, percent: string | number) {
  return decimal(amount).multiply(percentage(percent), 4).multiplyRatio(1n, 100n).toString();
}

export function calculateExpenseEligibility(input: {
  grossAmount: string | number;
  vatAmount: string | number;
  taxTreatment: TaxTreatment;
  taxDeductiblePercentage?: string | number | null;
  vatTreatment: VatTreatment;
  vatDeductiblePercentage?: string | number | null;
  businessUsePercentage?: string | number | null;
}) {
  const businessUse = percentage(input.businessUsePercentage ?? 100);
  const taxPercent = input.taxTreatment === 'fully_deductible' ? decimal(100) : input.taxTreatment === 'non_deductible' || input.taxTreatment === 'review_required' ? decimal(0) : percentage(input.taxDeductiblePercentage ?? 0);
  const vatPercent = input.vatTreatment === 'deductible' ? decimal(100) : input.vatTreatment === 'partially_deductible' ? percentage(input.vatDeductiblePercentage ?? 0) : decimal(0);
  const taxEligiblePercent = taxPercent.multiply(businessUse, 4).multiplyRatio(1n, 100n);
  const vatEligiblePercent = vatPercent.multiply(businessUse, 4).multiplyRatio(1n, 100n);
  const deductibleAmount = decimal(input.grossAmount).multiply(taxEligiblePercent, 4).multiplyRatio(1n, 100n);
  const deductibleVat = decimal(input.vatAmount).multiply(vatEligiblePercent, 4).multiplyRatio(1n, 100n);
  return {
    deductibleAmount: deductibleAmount.toString(),
    nonDeductibleAmount: decimal(input.grossAmount).subtract(deductibleAmount).toString(),
    deductibleVatAmount: deductibleVat.toString(),
    nonDeductibleVatAmount: decimal(input.vatAmount).subtract(deductibleVat).toString(),
    businessUsePercentage: businessUse.toString(),
  };
}

export function calculateExpensePayment(input: { grossAmount: string | number; paidAmount?: string | number | null; dueDate?: string | null; asOf?: string }) {
  const gross = decimal(input.grossAmount);
  const paid = decimal(input.paidAmount ?? 0);
  const outstanding = gross.subtract(paid).atoms > 0n ? gross.subtract(paid).toString() : '0.0000';
  let status: ExpensePaymentStatus = paid.atoms >= gross.atoms ? 'paid' : paid.atoms > 0n ? 'partially_paid' : 'unpaid';
  if (status === 'unpaid' && input.dueDate && (input.asOf || new Date().toISOString().slice(0, 10)) > input.dueDate) status = 'overdue';
  return { paidAmount: paid.toString(), outstandingAmount: outstanding, paymentStatus: status };
}

export function documentationStatus(input: { documentType?: string | null; documentNumber?: string | null; issueDate?: string | null; attachmentCount?: number }) : DocumentationStatus {
  if (!input.attachmentCount) return 'missing_supporting_document';
  if (!input.documentType || !input.documentNumber || !input.issueDate) return 'missing_information';
  return 'complete';
}

export function legacyExpenseCategory(category: string | null | undefined): ExpenseCategoryId {
  const value = String(category || '').trim().toLowerCase();
  if (value.includes('fuel') || value.includes('diesel') || value.includes('petrol') || value.includes('derivat')) return 'fuel';
  if (value.includes('rent') || value.includes('qira')) return 'rent';
  if (value.includes('utilit') || value.includes('electric') || value.includes('water') || value.includes('internet')) return 'other_expenses';
  if (value.includes('market') || value.includes('advert')) return 'advertising_marketing';
  if (value.includes('software')) return 'software_subscriptions';
  if (value.includes('office') || value.includes('suppl') || value.includes('material')) return 'consumable_materials';
  if (value.includes('travel') || value.includes('transport')) return 'transport';
  return 'other_expenses';
}

