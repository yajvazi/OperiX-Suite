import type { InvoiceDraftInput } from '@invoice-monorepo/api/domain';
import type { StorageMode } from './features.ts';

export type DataRecord = { id: string } & Record<string, unknown>;

/** Collections the free (local) tier supports. The cloud store maps these to database tables. */
export const LOCAL_TABLES = [
  'clients', 'products', 'vendors', 'expenses', 'supplier_bills', 'supplier_bill_items', 'vendor_payments', 'branches',
  'invoices', 'invoice_items', 'payments', 'inventory_stock_movements', 'companies',
  'document_source_links', 'commercial_document_events', 'invoice_templates',
  'contracts', 'contract_templates', 'contract_events', 'other_income', 'held_orders', 'company_bank_accounts', 'employees', 'payroll_runs',
] as const;
export type StoreTable = (typeof LOCAL_TABLES)[number];

export interface ListOptions {
  /** Only rows whose fields equal these values. */
  where?: Record<string, string | number | boolean | null>;
  /** Field to sort by; prefix with '-' for descending. Defaults to newest first. */
  orderBy?: string;
  limit?: number;
  /** Cloud only: comma-separated columns to fetch (the local store always returns whole records). */
  columns?: string;
}

export interface InvoiceLineInput {
  id?: string;
  productId?: string | null;
  description: string;
  quantity: number | string;
  unitPrice: number | string;
  discountPercent?: number | string;
  taxRate?: number | string;
  taxIncluded?: boolean;
  unit?: string | null;
  sku?: string | null;
}

export interface InvoiceInput {
  /** Set to update an existing document. */
  id?: string;
  documentType?: string;
  clientId?: string | null;
  issueDate: string;
  dueDate?: string | null;
  currency?: string;
  /** 'draft' documents get no number until they are issued. Default 'issued'. */
  status?: 'draft' | 'issued';
  lines: readonly InvoiceLineInput[];
  documentDiscountPercent?: number;
  notes?: string;
  paymentMethod?: string;
  /** Repeating a save with the same key returns the first result instead of creating a duplicate. */
  idempotencyKey?: string;
  /** Any other fields of the shared invoice draft (branch, shipping, tax-included, signature, template...). */
  draft?: Partial<Omit<InvoiceDraftInput, 'userId' | 'companyId' | 'lines'>>;
}

export interface PaymentInput {
  /** The invoice being paid. Leave empty for money received on account; then `customerId` is required. */
  invoiceId?: string | null;
  customerId?: string | null;
  amount: number;
  paymentDate: string;
  paymentMethod: 'cash' | 'bank' | 'card' | 'online_payment' | 'cheque' | 'other';
  bankReference?: string;
  notes?: string;
  paymentNumber?: string;
  /** Cloud only: the receiving bank account / fund account (required for bank payments there). */
  companyBankAccountId?: string | null;
  fundAccountId?: string | null;
}

export interface BackupFile {
  format: 'operix-backup';
  version: 1;
  exportedAt: string;
  companyId: string;
  deviceCode: string;
  /** Number-series counters, so restoring never reuses an issued number. */
  sequences: Array<{ series_key: string; next_value: number }>;
  records: Array<{ table: string; id: string; data: Record<string, unknown>; created_at: string; updated_at: string; deleted_at: string | null }>;
  /** SHA-256 of the canonical JSON of the fields above. */
  checksum: string;
}

export interface ImportResult { inserted: number; updated: number; skipped: number }

/**
 * Everything an app screen needs from storage. Screens depend on this interface only, so the same
 * UI works on the device (free tier) or on the OperiX cloud (paid tier).
 */
export interface DataStore {
  readonly mode: StorageMode;
  list(table: StoreTable, options?: ListOptions): Promise<DataRecord[]>;
  get(table: StoreTable, id: string): Promise<DataRecord | null>;
  save(table: StoreTable, record: Record<string, unknown> & { id?: string }): Promise<DataRecord>;
  remove(table: StoreTable, id: string): Promise<void>;
  reserveDocumentNumber(documentType: string, issueDate: string): Promise<string>;
}

export interface InvoiceListOptions {
  /** Commercial document type, for example 'INVOICE' or 'QUOTE'. */
  documentType?: string;
  clientId?: string;
  limit?: number;
  /** Oldest first instead of newest first. */
  ascending?: boolean;
  /** Attach whole line records as `items` instead of just their ids. */
  fullItems?: boolean;
}

export interface PaymentListOptions { customerId?: string; invoiceId?: string; limit?: number }

/** Business operations. Local implements them now; the cloud adapter delegates to the existing repositories next. */
export interface DocumentStore extends DataStore {
  saveInvoiceDocument(input: InvoiceInput): Promise<DataRecord>;
  recordCustomerPayment(input: PaymentInput): Promise<DataRecord>;
  reverseCustomerPayment(paymentId: string, reason: string): Promise<DataRecord>;
  /** Invoices with their customer (`client`) and lines (`items`) attached, newest first. */
  listInvoices(options?: InvoiceListOptions): Promise<DataRecord[]>;
  /** One invoice with `client` and `items` (each item with its `product`). */
  getInvoice(id: string): Promise<DataRecord | null>;
  /** Payments that are not reversed, with `client` and `invoice` attached, newest first. */
  listPayments(options?: PaymentListOptions): Promise<DataRecord[]>;
  /** Moves a document to another commercial status (for example SENT, OVERDUE, CANCELLED) and records the event. */
  transitionDocumentStatus(id: string, status: string, eventType?: string): Promise<DataRecord>;
  /** Deletes a draft document. Issued documents must be cancelled or credited instead. */
  deleteInvoice(id: string): Promise<void>;
  /** Creates the next document in a conversion path (quote -> order -> invoice, invoice -> credit note...). Repeating returns the same document. */
  convertDocument(sourceId: string, targetType: string): Promise<DataRecord>;
  /** Posts a draft credit note and returns returned stock to the shelf. */
  postCreditNote(id: string, reason?: string): Promise<DataRecord>;
}

/** Free-tier backup file support. Only the local store implements it. */
export interface BackupCapable {
  exportBackup(): Promise<BackupFile>;
  importBackup(file: BackupFile): Promise<ImportResult>;
}

/** The built-in other-income categories (the same keys the cloud ships), usable without a server. */
export const OTHER_INCOME_CATEGORIES = [
  { category_key: 'asset_sale', name_en: 'Asset Sale', name_sq: 'Shitje e Asetit' },
  { category_key: 'commission_income', name_en: 'Commission Income', name_sq: 'Të Hyra nga Komisionet' },
  { category_key: 'grants_subsidies', name_en: 'Grants / Subsidies', name_sq: 'Grante / Subvencione' },
  { category_key: 'insurance_compensation', name_en: 'Insurance Compensation', name_sq: 'Kompensim nga Sigurimi' },
  { category_key: 'interest_income', name_en: 'Interest Income', name_sq: 'Të Hyra nga Interesi' },
  { category_key: 'other_income', name_en: 'Other Income', name_sq: 'Të Hyra Tjera' },
  { category_key: 'other_operating_income', name_en: 'Other Operating Income', name_sq: 'Të Hyra Tjera Operative' },
  { category_key: 'reimbursements', name_en: 'Reimbursements', name_sq: 'Rimbursime' },
  { category_key: 'rental_income', name_en: 'Rental Income', name_sq: 'Të Hyra nga Qiraja' },
] as const;
