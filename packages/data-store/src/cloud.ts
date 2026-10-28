import type { SupabaseClient } from '@supabase/supabase-js';
import {
  deleteCustomer, deleteInvoice, deleteProduct, deleteScopedResource, getInvoice, listInvoices, listPayments, postCreditNote, reserveDocumentNumber, reverseCustomerPayment,
  saveCustomer, saveCustomerPayment, saveInvoiceDocument, saveProduct, saveScopedResource, transitionInvoiceStatus,
} from '@invoice-monorepo/api/repositories';
import { scopedResource } from '@invoice-monorepo/api/workspace';
import type { InvoiceDraftInput } from '@invoice-monorepo/api/domain';
import type { DataRecord, DocumentStore, InvoiceInput, InvoiceListOptions, ListOptions, PaymentInput, PaymentListOptions, StoreTable } from './store.ts';

export interface CloudScope { userId: string; companyId: string | null; companyIds: readonly string[] }

const TYPE_ALIASES: Record<string, string> = { offer: 'quote', order: 'sales_order' };

function cloudDocumentType(value: string | undefined): InvoiceDraftInput['documentType'] {
  const requested = String(value || 'invoice').trim().toLowerCase();
  return (TYPE_ALIASES[requested] ?? requested).toUpperCase() as InvoiceDraftInput['documentType'];
}

/**
 * The paid tier's storage: the OperiX database through the existing shared repositories, so cloud
 * behaviour (numbering sequence, stock checkout, posting, permissions) stays exactly as it is today.
 */
export class CloudDataStore implements DocumentStore {
  readonly mode = 'cloud' as const;
  private readonly client: SupabaseClient;
  private readonly scope: CloudScope;

  constructor(client: SupabaseClient, scope: CloudScope) {
    this.client = client; this.scope = scope;
  }

  private get companyId(): string { return this.scope.companyId ?? ''; }
  private get rowScope(): string { return scopedResource(this.scope.userId, this.scope.companyIds); }

  async list(table: StoreTable, options: ListOptions = {}): Promise<DataRecord[]> {
    let query = this.client.from(table).select(options.columns ?? '*').or(this.rowScope);
    for (const [field, value] of Object.entries(options.where ?? {})) query = value === null ? query.is(field, null) : query.eq(field, value);
    const orderBy = options.orderBy ?? (table === 'clients' || table === 'products' ? 'name' : '-created_at');
    query = query.order(orderBy.replace(/^-/, ''), { ascending: !orderBy.startsWith('-') });
    if (options.limit) query = query.limit(options.limit);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as DataRecord[];
  }

  async get(table: StoreTable, id: string): Promise<DataRecord | null> {
    const { data, error } = await this.client.from(table).select('*').eq('id', id).or(this.rowScope).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as DataRecord | null) ?? null;
  }

  async save(table: StoreTable, record: Record<string, unknown> & { id?: string }): Promise<DataRecord> {
    const { id, ...fields } = record;
    const payload = { ...fields, user_id: this.scope.userId, company_id: this.scope.companyId ?? null };
    // Customers and products go through the same repository functions the screens used before.
    if (table === 'clients') return await saveCustomer(this.client, payload, id ?? null) as DataRecord;
    if (table === 'products') return await saveProduct(this.client, payload, id ?? null) as DataRecord;
    return await saveScopedResource(this.client, table, payload, id ?? null) as DataRecord;
  }

  async remove(table: StoreTable, id: string): Promise<void> {
    if (table === 'clients') return deleteCustomer(this.client, id, this.scope.companyId ?? null, this.scope.userId);
    if (table === 'products') return deleteProduct(this.client, id, this.companyId, this.scope.userId);
    await deleteScopedResource(this.client, table, id, this.companyId);
  }

  async reserveDocumentNumber(documentType: string, issueDate: string): Promise<string> {
    return reserveDocumentNumber(this.client, this.companyId, cloudDocumentType(documentType), issueDate);
  }

  async saveInvoiceDocument(input: InvoiceInput): Promise<DataRecord> {
    const issuing = (input.status ?? 'issued') === 'issued';
    const saved = await saveInvoiceDocument(this.client, {
      draft: {
        userId: this.scope.userId,
        companyId: this.companyId,
        documentType: cloudDocumentType(input.documentType),
        clientId: input.clientId ?? null,
        issueDate: input.issueDate,
        dueDate: input.dueDate ?? null,
        currency: input.currency,
        status: issuing ? undefined : 'draft',
        notes: input.notes,
        documentDiscountPercent: input.documentDiscountPercent,
        lines: input.lines.map((line) => ({ ...line })),
        idempotencyKey: input.idempotencyKey ?? null,
        ...(input.paymentMethod ? { paymentMethod: input.paymentMethod as InvoiceDraftInput['paymentMethod'] } : {}),
      },
      existingInvoiceId: input.id ?? null,
      postInvoice: issuing,
      idempotencyKey: input.idempotencyKey ?? null,
    });
    return saved.invoice as DataRecord;
  }

  async recordCustomerPayment(input: PaymentInput): Promise<DataRecord> {
    const invoice = await this.get('invoices', input.invoiceId);
    if (!invoice) throw new Error('Invoice not found.');
    const saved = await saveCustomerPayment(this.client, {
      userId: this.scope.userId,
      companyId: this.companyId,
      customerId: String(invoice.client_id ?? ''),
      invoiceId: input.invoiceId,
      paymentNumber: input.paymentNumber ?? null,
      amount: input.amount,
      paymentDate: input.paymentDate,
      paymentMethod: input.paymentMethod,
      bankReference: input.bankReference ?? null,
      companyBankAccountId: input.companyBankAccountId ?? null,
      fundAccountId: input.fundAccountId ?? null,
      notes: input.notes ?? null,
    });
    return saved.payment as DataRecord;
  }

  async listInvoices(options: InvoiceListOptions = {}): Promise<DataRecord[]> {
    const documentType = options.documentType?.toUpperCase();
    const legacyType = documentType === 'QUOTE' ? 'offer' : documentType === 'INVOICE' ? 'invoice' : undefined;
    const rows = await listInvoices(this.client, { userId: this.scope.userId, companyIds: this.scope.companyIds }, {
      select: '*, client:clients(*), items:invoice_items(id)',
      documentType: documentType as InvoiceDraftInput['documentType'] | undefined,
      legacyType,
      clientId: options.clientId,
      limit: options.limit,
    }) as unknown as DataRecord[];
    return options.ascending ? [...rows].reverse() : rows;
  }

  async getInvoice(id: string): Promise<DataRecord | null> {
    return await getInvoice(this.client, id, { userId: this.scope.userId, companyIds: this.scope.companyIds }, '*, client:clients(*), items:invoice_items(*, product:products(sku, name, image_url))') as unknown as DataRecord | null;
  }

  async listPayments(options: PaymentListOptions = {}): Promise<DataRecord[]> {
    return await listPayments(this.client, { userId: this.scope.userId, companyIds: this.scope.companyIds }, { customerId: options.customerId, invoiceId: options.invoiceId, limit: options.limit }) as unknown as DataRecord[];
  }

  async transitionDocumentStatus(id: string, status: string, eventType?: string): Promise<DataRecord> {
    const { data, error } = await transitionInvoiceStatus(this.client, id, status, eventType ?? status.toLowerCase());
    if (error) throw error;
    return data as DataRecord;
  }

  async deleteInvoice(id: string): Promise<void> {
    await deleteInvoice(this.client, id);
  }

  async convertDocument(sourceId: string, targetType: string): Promise<DataRecord> {
    const { data, error } = await this.client.rpc('convert_commercial_document', { p_source_document_id: sourceId, p_target_document_type: targetType.toUpperCase() });
    if (error) throw error;
    if (!data) throw new Error('The document could not be created.');
    return data as DataRecord;
  }

  async postCreditNote(id: string, reason?: string): Promise<DataRecord> {
    return await postCreditNote(this.client, id, reason) as DataRecord;
  }

  async reverseCustomerPayment(paymentId: string, reason: string): Promise<DataRecord> {
    return await reverseCustomerPayment(this.client, paymentId, reason) as DataRecord;
  }
}
