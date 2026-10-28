import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copyMasterData, transferKey } from './transfer.ts';
import type { DataStore } from './store.ts';

function memoryStore(mode: 'local' | 'cloud', seed: Record<string, Record<string, unknown>[]> = {}): DataStore & { rows: Record<string, Record<string, unknown>[]> } {
  const rows: Record<string, Record<string, unknown>[]> = { clients: [], products: [], vendors: [], ...seed };
  let counter = 0;
  return {
    mode, rows,
    list: async (table) => (rows[table] ?? []).map((row) => ({ ...row })) as never,
    get: async () => null,
    save: async (table, record) => { const row = { ...record, id: String(record.id ?? `new-${++counter}`) }; rows[table].push(row); return row as never; },
    remove: async () => undefined,
    reserveDocumentNumber: async () => '',
  };
}

test('keys prefer the strongest identifier', () => {
  assert.equal(transferKey('products', { sku: ' AB-1 ', name: 'x' }), 'sku:ab-1');
  assert.equal(transferKey('clients', { name: 'Ana' }), 'name:ana');
  assert.equal(transferKey('vendors', { tax_id: '811', name: 'x' }), 'tax:811');
});

test('copying to the cloud skips existing rows, drops system fields and is repeatable', async () => {
  const local = memoryStore('local', { clients: [{ id: 'l1', name: 'Ana', email: 'a@x.com', company_id: 'c', created_at: 't' }, { id: 'l2', name: 'Bek' }], products: [{ id: 'p1', name: 'Pen', sku: 'P1' }] });
  const cloud = memoryStore('cloud', { clients: [{ id: 'c1', name: 'Other', email: 'A@x.com' }] });
  const first = await copyMasterData(local, cloud);
  assert.deepEqual(first.copied, { clients: 1, products: 1, vendors: 0 });
  assert.deepEqual(first.skipped, { clients: 1, products: 0, vendors: 0 });
  assert.equal(cloud.rows.clients.at(-1)?.company_id, undefined);
  assert.notEqual(cloud.rows.clients.at(-1)?.id, 'l2');
  const second = await copyMasterData(local, cloud);
  assert.deepEqual(second.copied, { clients: 0, products: 0, vendors: 0 });
});

test('copying to the device keeps ids and reports failures without stopping', async () => {
  const cloud = memoryStore('cloud', { vendors: [{ id: 'v1', name: 'Supplier' }, { id: 'v2', name: 'Bad' }] });
  const local = memoryStore('local');
  const original = local.save;
  local.save = async (table, record) => { if (record.name === 'Bad') throw new Error('boom'); return original(table, record); };
  const result = await copyMasterData(cloud, local);
  assert.equal(result.copied.vendors, 1);
  assert.equal(local.rows.vendors[0].id, 'v1');
  assert.deepEqual(result.failed.map((f) => f.name), ['Bad']);
});
