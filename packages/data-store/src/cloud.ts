import type { SupabaseClient } from '@supabase/supabase-js';
import { deleteScopedResource, reserveDocumentNumber, saveScopedResource } from '@invoice-monorepo/api/repositories';
import type { DataRecord, DataStore, ListOptions, StoreTable } from './store.ts';

/**
 * The paid tier's storage: the OperiX database through the existing shared repositories.
 * Invoice and payment operations are added here next, delegating to `saveInvoiceDocument` and
 * `saveCustomerPayment` in `@invoice-monorepo/api/repositories`.
 */
export class CloudDataStore implements DataStore {
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
    return reserveDocumentNumber(this.client, this.scope.companyId, documentType as never, issueDate);
  }
}
