import { buildInvoicePersistencePayload, invoiceTotalsForDraft, isCashPaymentAllowed, type InvoiceDraftInput } from '@invoice-monorepo/api/domain';
import type { SqlDriver } from './driver.ts';
import {
  LOCAL_TABLES,
  type BackupCapable, type BackupFile, type DataRecord, type DocumentStore, type ImportResult,
  type InvoiceInput, type InvoiceListOptions, type ListOptions, type PaymentInput, type PaymentListOptions, type StoreTable,
} from './store.ts';

const SCHEMA_VERSION = '1';
const SCHEMA = `
create table if not exists meta (key text primary key, value text not null);
create table if not exists records (
  table_name text not null,
  id text not null,
  data text not null,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  primary key (table_name, id)
);
create index if not exists records_table_idx on records (table_name, deleted_at);
create table if not exists sequences (series_key text primary key, next_value integer not null);
`;

// Same document types, sequence keys and default prefixes as public.reserve_invoice_number.
const TYPE_ALIASES: Record<string, string> = { offer: 'quote', order: 'sales_order' };
const SUPPORTED_TYPES = new Set([
  'quote', 'proforma', 'sales_order', 'delivery_note', 'invoice', 'advance_invoice', 'final_invoice',
  'credit_note', 'debit_note', 'simplified_invoice', 'fiscal_receipt', 'bad_debt_invoice',
]);
const SEQUENCE_KEY: Record<string, string> = { final_invoice: 'invoice', simplified_invoice: 'invoice' };
const DEFAULT_PREFIX: Record<string, string> = {
  quote: 'OF-', proforma: 'PRO-', sales_order: 'POR-', delivery_note: 'FD-', invoice: 'FAT-',
  advance_invoice: 'PAR-', credit_note: 'NK-', debit_note: 'ND-', fiscal_receipt: 'KUP-', bad_debt_invoice: 'BDI-',
};
const STOCK_DOCUMENT_TYPES = new Set(['invoice', 'final_invoice', 'simplified_invoice', 'fiscal_receipt', 'delivery_note']);
const DEVICE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface LocalStoreOptions {
  /** Short code that prefixes this device's number series. Generated on first use if omitted. */
  deviceCode?: string;
  newId?: () => string;
  now?: () => Date;
  /** Platform hooks for runtimes without Web Crypto (React Native): provide them from expo-crypto. */
  getRandomValues?: (bytes: Uint8Array) => Uint8Array;
  sha256Hex?: (value: string) => Promise<string>;
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const isoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

function normalizeDeviceCode(value: string): string {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,6}$/.test(code)) throw new Error('The device code must be 2–6 letters or digits.');
  return code;
}

function randomDeviceCode(getRandomValues: (bytes: Uint8Array) => Uint8Array): string {
  const bytes = new Uint8Array(4);
  getRandomValues(bytes);
  return Array.from(bytes, (byte) => DEVICE_CODE_ALPHABET[byte % DEVICE_CODE_ALPHABET.length]).join('');
}

async function webCryptoSha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
}

type Row = { table_name: string; id: string; data: string; created_at: string; updated_at: string; deleted_at: string | null };

/**
 * The free tier's storage: all business data lives in a SQLite database on the device. Rows are kept
 * as JSON documents keyed by table name, which keeps backup files and the later upload to the cloud
 * simple (a row is just a record for the matching cloud table).
 */
export class LocalDataStore implements DocumentStore, BackupCapable {
  readonly mode = 'local' as const;
  readonly companyId: string;
  readonly deviceCode: string;
  private readonly driver: SqlDriver;
  private readonly newId: () => string;
  private readonly now: () => Date;
  private readonly sha256: (value: string) => Promise<string>;

  private constructor(driver: SqlDriver, companyId: string, deviceCode: string, newId: () => string, now: () => Date, sha256: (value: string) => Promise<string>) {
    this.driver = driver; this.companyId = companyId; this.deviceCode = deviceCode; this.newId = newId; this.now = now; this.sha256 = sha256;
  }

  static async open(driver: SqlDriver, options: LocalStoreOptions = {}): Promise<LocalDataStore> {
    await driver.exec(SCHEMA);
    const newId = options.newId ?? (() => globalThis.crypto.randomUUID());
    const now = options.now ?? (() => new Date());
    const read = async (key: string) => (await driver.all<{ value: string }>('select value from meta where key = ?', [key]))[0]?.value;
    const write = (key: string, value: string) => driver.run('insert into meta(key, value) values (?, ?) on conflict(key) do update set value = excluded.value', [key, value]);
    let companyId = await read('company_id');
    if (!companyId) { companyId = newId(); await write('company_id', companyId); }
    let deviceCode = await read('device_code');
    if (options.deviceCode) { deviceCode = normalizeDeviceCode(options.deviceCode); await write('device_code', deviceCode); }
    else if (!deviceCode) { deviceCode = randomDeviceCode(options.getRandomValues ?? ((bytes) => globalThis.crypto.getRandomValues(bytes))); await write('device_code', deviceCode); }
    await write('schema_version', SCHEMA_VERSION);
    const store = new LocalDataStore(driver, companyId, deviceCode, newId, now, options.sha256Hex ?? webCryptoSha256Hex);
    await store.ensureCompany();
    return store;
  }

  private stamp() { return this.now().toISOString(); }

  /** The single company of a free account. Its details (name, tax ID, logo, bank...) are edited in Settings. */
  private async ensureCompany() {
    if (await this.get('companies', this.companyId)) return;
    await this.save('companies', { id: this.companyId, company_name: '', currency: 'EUR', country: 'Kosovo', invoice_language: 'sq', tax_rate: 18, tax_name: 'TVSH', template_config: {} });
  }

  /** The company record, created on first use. */
  async getCompany(): Promise<DataRecord> {
    await this.ensureCompany();
    return (await this.get('companies', this.companyId)) as DataRecord;
  }

  private assertTable(table: string): asserts table is StoreTable {
    if (!(LOCAL_TABLES as readonly string[]).includes(table)) throw new Error(`Unknown collection "${table}".`);
  }

  private parse(row: Row): DataRecord {
    return { ...(JSON.parse(row.data) as Record<string, unknown>), id: row.id, created_at: row.created_at, updated_at: row.updated_at } as DataRecord;
  }

  async list(table: StoreTable, options: ListOptions = {}): Promise<DataRecord[]> {
    this.assertTable(table);
    const rows = await this.driver.all<Row>('select * from records where table_name = ? and deleted_at is null', [table]);
    let records = rows.map((row) => this.parse(row));
    for (const [field, expected] of Object.entries(options.where ?? {})) records = records.filter((record) => (record[field] ?? null) === expected);
    const orderBy = options.orderBy ?? '-created_at';
    const descending = orderBy.startsWith('-');
    const field = descending ? orderBy.slice(1) : orderBy;
    records.sort((a, b) => {
      const left = a[field] as string | number | null | undefined; const right = b[field] as string | number | null | undefined;
      if (left === right) return String(b.id).localeCompare(String(a.id)) * (descending ? 1 : -1);
      if (left === undefined || left === null) return 1;
      if (right === undefined || right === null) return -1;
      return (left < right ? -1 : 1) * (descending ? -1 : 1);
    });
    return options.limit ? records.slice(0, options.limit) : records;
  }

  async get(table: StoreTable, id: string): Promise<DataRecord | null> {
    this.assertTable(table);
    const rows = await this.driver.all<Row>('select * from records where table_name = ? and id = ? and deleted_at is null', [table, id]);
    return rows[0] ? this.parse(rows[0]) : null;
  }

  async save(table: StoreTable, record: Record<string, unknown> & { id?: string }): Promise<DataRecord> {
    this.assertTable(table);
    const { id: givenId, created_at: _createdAt, updated_at: _updatedAt, ...fields } = record;
    const stamp = this.stamp();
    const existing = givenId ? await this.get(table, String(givenId)) : null;
    const id = existing ? existing.id : String(givenId || this.newId());
    const { id: _id, created_at, updated_at: _u, ...previous } = existing ?? ({ created_at: stamp } as unknown as DataRecord);
    const data = { ...previous, ...fields, company_id: this.companyId };
    await this.driver.run(
      'insert into records(table_name, id, data, created_at, updated_at, deleted_at) values (?, ?, ?, ?, ?, null) '
      + 'on conflict(table_name, id) do update set data = excluded.data, updated_at = excluded.updated_at, deleted_at = null',
      [table, id, JSON.stringify(data), String(created_at ?? stamp), stamp],
    );
    return { ...data, id, created_at: created_at ?? stamp, updated_at: stamp } as DataRecord;
  }

  async remove(table: StoreTable, id: string): Promise<void> {
    this.assertTable(table);
    if (table === 'invoices') {
      const invoice = await this.get('invoices', id);
      if (invoice && invoice.status !== 'draft') throw new Error('Issued documents cannot be deleted. Cancel or credit them instead.');
    }
    await this.driver.run('update records set deleted_at = ?, updated_at = ? where table_name = ? and id = ?', [this.stamp(), this.stamp(), table, id]);
  }

  /**
   * Free tier numbering: every device has its own consecutive series, prefixed with the device code
   * (for example FAT-K7QZ-2026-000001). Devices therefore never collide and nothing needs a server.
   * The paid cloud plan uses the shared per-company sequence instead.
   */
  async reserveDocumentNumber(documentType: string, issueDate: string): Promise<string> {
    const requested = String(documentType || 'invoice').trim().toLowerCase();
    const type = TYPE_ALIASES[requested] ?? requested;
    if (!SUPPORTED_TYPES.has(type)) throw new Error(`Unsupported commercial document type ${requested}`);
    if (!isoDate(issueDate)) throw new Error('The issue date must be an ISO date (YYYY-MM-DD).');
    const sequenceKey = SEQUENCE_KEY[type] ?? type;
    const period = issueDate.slice(0, 4);
    const seriesKey = `${sequenceKey}:${period}`;
    return this.driver.transaction(async () => {
      const row = (await this.driver.all<{ next_value: number }>('select next_value from sequences where series_key = ?', [seriesKey]))[0];
      const value = row?.next_value ?? 1;
      await this.driver.run('insert into sequences(series_key, next_value) values (?, ?) on conflict(series_key) do update set next_value = excluded.next_value', [seriesKey, value + 1]);
      return `${DEFAULT_PREFIX[sequenceKey] ?? 'DOC-'}${this.deviceCode}-${period}-${String(value).padStart(6, '0')}`;
    });
  }

  async saveInvoiceDocument(input: InvoiceInput): Promise<DataRecord> {
    if (!isoDate(input.issueDate)) throw new Error('The issue date must be an ISO date (YYYY-MM-DD).');
    if (!input.lines.length) throw new Error('Add at least one line.');
    return this.driver.transaction(async () => {
      if (input.idempotencyKey) {
        const duplicate = (await this.list('invoices', { where: { idempotency_key: input.idempotencyKey }, limit: 1 }))[0];
        if (duplicate) return duplicate;
      }
      const requested = String(input.documentType || 'invoice').toLowerCase();
      const type = TYPE_ALIASES[requested] ?? requested;
      if (!SUPPORTED_TYPES.has(type)) throw new Error(`Unsupported commercial document type ${requested}`);
      const existing = input.id ? await this.get('invoices', input.id) : null;
      if (input.id && !existing) throw new Error('The document no longer exists.');
      if (existing && existing.status !== 'draft') throw new Error('Issued documents cannot be edited. Create a credit note instead.');

      const issuing = (input.status ?? 'issued') === 'issued';
      // The same draft -> totals -> database-shaped row path as the cloud save, so both stores produce identical records.
      const draft: InvoiceDraftInput = {
        ...input.draft,
        userId: this.companyId,
        companyId: this.companyId,
        documentType: type.toUpperCase() as InvoiceDraftInput['documentType'],
        clientId: input.clientId ?? null,
        issueDate: input.issueDate,
        dueDate: input.dueDate ?? input.issueDate,
        currency: input.currency ?? 'EUR',
        notes: input.notes,
        documentDiscountPercent: input.documentDiscountPercent ?? input.draft?.documentDiscountPercent,
        paymentMethod: (input.paymentMethod ?? input.draft?.paymentMethod ?? 'bank') as InvoiceDraftInput['paymentMethod'],
        status: issuing ? 'sent' : 'draft',
        lines: input.lines.map((line) => ({ ...line })),
      };
      const totals = invoiceTotalsForDraft(draft);
      if (issuing && STOCK_DOCUMENT_TYPES.has(type)) await this.checkStock(input);

      const invoiceNumber = issuing ? await this.reserveDocumentNumber(type, input.issueDate) : '';
      const { invoice: payload, items } = buildInvoicePersistencePayload(draft, totals, invoiceNumber);
      const operational = ['quote', 'proforma', 'sales_order', 'delivery_note'].includes(type);
      const invoice = await this.save('invoices', {
        id: existing?.id,
        ...payload,
        // The database posts issued invoices; locally an issued invoice is posted straight away.
        status: !issuing ? 'draft' : operational ? 'sent' : 'posted',
        accounting_state: issuing && !operational ? 'posted' : payload.accounting_state,
        subtotal: totals.subtotal,
        amount_received: 0,
        idempotency_key: input.idempotencyKey ?? null,
      });

      for (const old of await this.list('invoice_items', { where: { invoice_id: invoice.id } })) await this.remove('invoice_items', old.id);
      for (const [index, item] of items.entries()) {
        const calculated = totals.lines[index];
        await this.save('invoice_items', { ...item, invoice_id: invoice.id, position: index + 1, taxable_amount: calculated.taxable, tax_amount: calculated.tax, total: calculated.total });
      }
      if (issuing && STOCK_DOCUMENT_TYPES.has(type)) await this.applyStock(input, invoice.id);
      return invoice;
    });
  }

  private stockNeeds(input: InvoiceInput) {
    const needs = new Map<string, number>();
    for (const line of input.lines) if (line.productId) needs.set(line.productId, (needs.get(line.productId) ?? 0) + Number(line.quantity));
    return needs;
  }

  /** Same rule as save_invoice_document_with_stock: tracked products cannot be sold below zero. */
  private async checkStock(input: InvoiceInput) {
    for (const [productId, quantity] of this.stockNeeds(input)) {
      const product = await this.get('products', productId);
      if (!product) throw new Error('One of the selected products no longer exists');
      if (product.track_stock && Number(product.stock_quantity ?? 0) < quantity) {
        throw new Error(`Not enough stock for "${String(product.name)}". Available: ${Number(product.stock_quantity ?? 0)}, requested: ${quantity}`);
      }
    }
  }

  private async applyStock(input: InvoiceInput, invoiceId: string) {
    for (const [productId, quantity] of this.stockNeeds(input)) {
      const product = await this.get('products', productId);
      if (!product?.track_stock) continue;
      const before = Number(product.stock_quantity ?? 0);
      await this.save('products', { id: productId, stock_quantity: before - quantity });
      await this.save('inventory_stock_movements', { product_id: productId, invoice_id: invoiceId, movement_type: 'invoice_issue', quantity_delta: -quantity, stock_before: before, stock_after: before - quantity });
    }
  }

  async recordCustomerPayment(input: PaymentInput): Promise<DataRecord> {
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Payment amount must be greater than zero.');
    if (!isoDate(input.paymentDate)) throw new Error('Payment date must be an ISO date.');
    if (input.paymentMethod === 'cash' && !isCashPaymentAllowed(amount)) throw new Error('Cash payments must be below 300 EUR.');
    return this.driver.transaction(async () => {
      const invoice = await this.get('invoices', input.invoiceId);
      if (!invoice) throw new Error('Invoice not found.');
      if (invoice.status === 'draft') throw new Error('Issue the invoice before recording a payment.');
      if (invoice.payment_status === 'NOT_APPLICABLE') throw new Error('Payments cannot be recorded against this document type.');
      const outstanding = round2(Number(invoice.total_amount) - Number(invoice.amount_received ?? 0));
      if (round2(amount) > outstanding) throw new Error(`The payment exceeds the outstanding amount (${outstanding.toFixed(2)}).`);
      const payment = await this.save('payments', {
        invoice_id: invoice.id, client_id: invoice.client_id ?? null, amount: round2(amount), payment_date: input.paymentDate,
        payment_method: input.paymentMethod, bank_reference: input.bankReference ?? null, notes: input.notes ?? null,
        payment_number: input.paymentNumber || `PAY-${this.deviceCode}-${input.paymentDate.slice(0, 4)}-${String((await this.list('payments')).length + 1).padStart(5, '0')}`,
        accounting_state: 'posted',
      });
      await this.settle(invoice.id);
      return payment;
    });
  }

  async reverseCustomerPayment(paymentId: string, reason: string): Promise<DataRecord> {
    if (!reason.trim()) throw new Error('A reason is required to reverse a payment.');
    return this.driver.transaction(async () => {
      const payment = await this.get('payments', paymentId);
      if (!payment) throw new Error('Payment not found.');
      if (payment.accounting_state === 'reversed') throw new Error('This payment has already been reversed.');
      const reversed = await this.save('payments', { id: paymentId, accounting_state: 'reversed', reversal_reason: reason.trim(), reversed_at: this.stamp() });
      await this.settle(String(payment.invoice_id));
      return reversed;
    });
  }

  /** Recomputes the invoice's received amount and status from its posted payments. */
  private async settle(invoiceId: string) {
    const invoice = await this.get('invoices', invoiceId);
    if (!invoice) return;
    const payments = await this.list('payments', { where: { invoice_id: invoiceId } });
    const received = round2(payments.filter((payment) => payment.accounting_state !== 'reversed').reduce((sum, payment) => sum + Number(payment.amount), 0));
    const total = Number(invoice.total_amount);
    const paid = received >= total;
    const partial = !paid && received > 0;
    await this.save('invoices', {
      id: invoiceId, amount_received: received,
      status: paid ? 'paid' : partial ? 'partially_paid' : 'posted',
      commercial_status: paid ? 'PAID' : partial ? 'PARTIALLY_PAID' : 'ISSUED',
      payment_status: paid ? 'PAID' : partial ? 'PARTIALLY_PAID' : 'UNPAID',
    });
  }

  async listInvoices(options: InvoiceListOptions = {}): Promise<DataRecord[]> {
    const where: Record<string, string> = {};
    if (options.documentType) where.commercial_document_type = options.documentType.toUpperCase();
    if (options.clientId) where.client_id = options.clientId;
    const invoices = await this.list('invoices', { where, orderBy: options.ascending ? 'created_at' : '-created_at', limit: options.limit });
    const clients = new Map((await this.list('clients')).map((client) => [client.id, client]));
    const items = await this.list('invoice_items');
    return invoices.map((invoice) => ({
      ...invoice,
      client: invoice.client_id ? clients.get(String(invoice.client_id)) ?? null : null,
      items: items.filter((item) => item.invoice_id === invoice.id).map((item) => ({ id: item.id })),
    }));
  }

  async getInvoice(id: string): Promise<DataRecord | null> {
    const invoice = await this.get('invoices', id);
    if (!invoice) return null;
    const client = invoice.client_id ? await this.get('clients', String(invoice.client_id)) : null;
    const items = await this.list('invoice_items', { where: { invoice_id: id }, orderBy: 'position' });
    const withProducts = await Promise.all(items.map(async (item) => {
      const product = item.product_id ? await this.get('products', String(item.product_id)) : null;
      return { ...item, product: product ? { sku: product.sku ?? null, name: product.name ?? null, image_url: product.image_url ?? null } : null };
    }));
    return { ...invoice, client, items: withProducts };
  }

  async listPayments(options: PaymentListOptions = {}): Promise<DataRecord[]> {
    const where: Record<string, string> = {};
    if (options.customerId) where.client_id = options.customerId;
    if (options.invoiceId) where.invoice_id = options.invoiceId;
    const payments = (await this.list('payments', { where, orderBy: '-payment_date' })).filter((payment) => payment.accounting_state !== 'reversed');
    const clients = new Map((await this.list('clients')).map((client) => [client.id, client]));
    const invoices = new Map((await this.list('invoices')).map((invoice) => [invoice.id, invoice]));
    const rows = payments.map((payment) => ({
      ...payment,
      client: payment.client_id ? clients.get(String(payment.client_id)) ?? null : null,
      invoice: payment.invoice_id ? invoices.get(String(payment.invoice_id)) ?? null : null,
    }));
    return options.limit ? rows.slice(0, options.limit) : rows;
  }

  async exportBackup(): Promise<BackupFile> {
    const rows = await this.driver.all<Row>('select * from records order by table_name, id');
    const sequences = await this.driver.all<{ series_key: string; next_value: number }>('select series_key, next_value from sequences order by series_key');
    const body = {
      format: 'operix-backup' as const, version: 1 as const, exportedAt: this.stamp(), companyId: this.companyId, deviceCode: this.deviceCode, sequences,
      records: rows.map((row) => ({ table: row.table_name, id: row.id, data: JSON.parse(row.data) as Record<string, unknown>, created_at: row.created_at, updated_at: row.updated_at, deleted_at: row.deleted_at })),
    };
    return { ...body, checksum: await this.sha256(canonicalJson(body)) };
  }

  /**
   * Merges a backup into this device. Newer rows win; deleted rows stay deleted; a counter never
   * moves backwards, so numbers that were already issued are not reused. Importing the same file
   * twice changes nothing.
   */
  async importBackup(file: BackupFile): Promise<ImportResult> {
    if (file?.format !== 'operix-backup' || file.version !== 1) throw new Error('This file is not an OperiX backup.');
    const { checksum, ...body } = file;
    if (checksum !== await this.sha256(canonicalJson(body))) throw new Error('The backup file is damaged or was changed.');
    const result: ImportResult = { inserted: 0, updated: 0, skipped: 0 };
    await this.driver.transaction(async () => {
      for (const source of file.records) {
        if (!(LOCAL_TABLES as readonly string[]).includes(source.table)) { result.skipped += 1; continue; }
        // A device has exactly one company: the backup's company details merge into it.
        const record = source.table === 'companies' ? { ...source, id: this.companyId } : source;
        const current = (await this.driver.all<Row>('select * from records where table_name = ? and id = ?', [record.table, record.id]))[0];
        if (current && current.updated_at >= record.updated_at) { result.skipped += 1; continue; }
        await this.driver.run(
          'insert into records(table_name, id, data, created_at, updated_at, deleted_at) values (?, ?, ?, ?, ?, ?) '
          + 'on conflict(table_name, id) do update set data = excluded.data, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at',
          [record.table, record.id, JSON.stringify({ ...record.data, company_id: this.companyId }), record.created_at, record.updated_at, record.deleted_at],
        );
        if (current) result.updated += 1; else result.inserted += 1;
      }
      for (const sequence of file.sequences) {
        await this.driver.run(
          'insert into sequences(series_key, next_value) values (?, ?) on conflict(series_key) do update set next_value = max(next_value, excluded.next_value)',
          [sequence.series_key, sequence.next_value],
        );
      }
    });
    return result;
  }
}
