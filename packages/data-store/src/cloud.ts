import type { SupabaseClient } from '@supabase/supabase-js';
import {
  deleteScopedResource, reserveDocumentNumber, reverseCustomerPayment, saveCustomerPayment,
  saveInvoiceDocument, saveScopedResource,
} from '@invoice-monorepo/api/repositories';
import type { InvoiceDraftInput } from '@invoice-monorepo/api/domain';
import type { DataRecord, DocumentStore, InvoiceInput, ListOptions, PaymentInput, StoreTable } from './store.ts';

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
  private readonly scope: { userId: string; companyId: string };

  constructor(client: SupabaseClient, scope: { userId: string; companyId: string }) {
    this.client = client; this.scope = scope;
  }

  async list(table: StoreTable, options: ListOptions = {}): Promise<DataRecord[]> {
    let query = this.client.from(table).select('*').eq('company_id', this.scope.companyId);
    for (const [field, value] of Object.entries(options.where ?? {})) query = value === null ? query.is(field, null) : query.eq(field, value);
    const orderBy = options.orderBy ?? '-created_at';
    query = query.order(orderBy.replace(/^-/, ''), { ascending: !orderBy.startsWith('-') });
    if (options.limit) query = query.limit(options.limit);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as DataRecord[];
  }

  async get(table: StoreTable, id: string): Promise<DataRecord | null> {
    const { data, error } = await this.client.from(table).select('*').eq('company_id', this.scope.companyId).eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as DataRecord | null) ?? null;
  }

  async save(table: StoreTable, record: Record<string, unknown> & { id?: string }): Promise<DataRecord> {
    const { id, ...fields } = record;
    return await saveScopedResource(this.client, table, { ...fields, company_id: this.scope.companyId }, id ?? null) as DataRecord;
  }

  async remove(table: StoreTable, id: string): Promise<void> {
    await deleteScopedResource(this.client, table, id, this.scope.companyId);
  }

  async reserveDocumentNumber(documentType: string, issueDate: string): Promise<string> {
    return reserveDocumentNumber(this.client, this.scope.companyId, cloudDocumentType(documentType), issueDate);
  }

  async saveInvoiceDocument(input: InvoiceInput): Promise<DataRecord> {
    const issuing = (input.status ?? 'issued') === 'issued';
    const saved = await saveInvoiceDocument(this.client, {
      draft: {
        userId: this.scope.userId,
        companyId: this.scope.companyId,
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
      companyId: this.scope.companyId,
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

  async reverseCustomerPayment(paymentId: string, reason: string): Promise<DataRecord> {
    return await reverseCustomerPayment(this.client, paymentId, reason) as DataRecord;
  }
}
