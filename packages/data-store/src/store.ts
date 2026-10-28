import type { StorageMode } from './features.ts';

export type DataRecord = { id: string } & Record<string, unknown>;

/** Collections the free (local) tier supports. The cloud store maps these to database tables. */
export const LOCAL_TABLES = [
  'clients', 'products', 'vendors', 'expenses', 'supplier_bills', 'vendor_payments', 'branches',
  'invoices', 'invoice_items', 'payments', 'inventory_stock_movements',
] as const;
export type StoreTable = (typeof LOCAL_TABLES)[number];

export interface ListOptions {
  /** Only rows whose fields equal these values. */
  where?: Record<string, string | number | boolean | null>;
  /** Field to sort by; prefix with '-' for descending. Defaults to newest first. */
  orderBy?: string;
  limit?: number;
}

export interface InvoiceLineInput {
  productId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  taxRate?: number;
  taxIncluded?: boolean;
  unit?: string;
  sku?: string;
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
}

export interface PaymentInput {
  invoiceId: string;
  amount: number;
  paymentDate: string;
  paymentMethod: 'cash' | 'bank' | 'card' | 'online_payment' | 'cheque' | 'other';
  bankReference?: string;
  notes?: string;
  paymentNumber?: string;
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

/** Business operations. Local implements them now; the cloud adapter delegates to the existing repositories next. */
export interface DocumentStore extends DataStore {
  saveInvoiceDocument(input: InvoiceInput): Promise<DataRecord>;
  recordCustomerPayment(input: PaymentInput): Promise<DataRecord>;
  reverseCustomerPayment(paymentId: string, reason: string): Promise<DataRecord>;
}

/** Free-tier backup file support. Only the local store implements it. */
export interface BackupCapable {
  exportBackup(): Promise<BackupFile>;
  importBackup(file: BackupFile): Promise<ImportResult>;
}
