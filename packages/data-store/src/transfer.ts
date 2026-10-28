import type { DataRecord, DataStore, StoreTable } from './store.ts';

/** Master data that can be copied between the device and the cloud. Invoices and payments travel in the backup file instead. */
export const TRANSFER_TABLES = ['clients', 'products', 'vendors'] as const satisfies readonly StoreTable[];
export type TransferTable = (typeof TRANSFER_TABLES)[number];

export interface TransferResult {
  copied: Record<TransferTable, number>;
  skipped: Record<TransferTable, number>;
  failed: Array<{ table: TransferTable; name: string; message: string }>;
}

const text = (value: unknown) => String(value ?? '').trim().toLowerCase();

/** The identity of a record across stores: what makes two rows "the same customer / product / supplier". */
export function transferKey(table: TransferTable, record: Record<string, unknown>): string {
  if (table === 'products') return text(record.sku) ? `sku:${text(record.sku)}` : `name:${text(record.name)}`;
  if (table === 'clients') return text(record.email) ? `email:${text(record.email)}` : `name:${text(record.name)}`;
  return text(record.tax_id) ? `tax:${text(record.tax_id)}` : `name:${text(record.name)}`;
}

// Fields that belong to the storing system rather than to the business record.
const SYSTEM_FIELDS = ['id', 'user_id', 'company_id', 'created_at', 'updated_at', 'deleted_at'];

function clean(record: DataRecord, keepId: boolean): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...record };
  for (const field of SYSTEM_FIELDS) delete copy[field];
  if (keepId) copy.id = record.id;
  return copy;
}

/**
 * Copies customers, products and suppliers from one store to the other. Rows that already exist in the
 * target (same email / SKU / tax id, or same name) are skipped, so running it twice is safe.
 * Moving to the device keeps the original ids, so the same record is recognised later.
 */
export async function copyMasterData(source: DataStore, target: DataStore, onProgress?: (table: TransferTable) => void): Promise<TransferResult> {
  const result: TransferResult = {
    copied: { clients: 0, products: 0, vendors: 0 },
    skipped: { clients: 0, products: 0, vendors: 0 },
    failed: [],
  };
  const keepIds = target.mode === 'local';
  for (const table of TRANSFER_TABLES) {
    onProgress?.(table);
    const existing = new Set((await target.list(table)).map((record) => transferKey(table, record)));
    for (const record of await source.list(table, { orderBy: 'created_at' })) {
      const key = transferKey(table, record);
      if (!text(record.name) || existing.has(key)) { result.skipped[table] += 1; continue; }
      try {
        await target.save(table, clean(record, keepIds));
        existing.add(key);
        result.copied[table] += 1;
      } catch (error) {
        result.failed.push({ table, name: String(record.name ?? ''), message: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  return result;
}
