import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import type { SqlValue } from './driver.ts';
import { createExpoSqliteDriver } from './drivers/expo-sqlite.ts';
import { createSqliteWasmDriver } from './drivers/sqlite-wasm.ts';
import { LocalDataStore } from './local.ts';

// Fakes that expose the same method shapes as expo-sqlite and sqlite-wasm, backed by node:sqlite.
function fakeExpo() {
  const db = new DatabaseSync(':memory:');
  return {
    async execAsync(sql: string) { db.exec(sql); },
    async runAsync(sql: string, params: SqlValue[] = []) { return db.prepare(sql).run(...params); },
    async getAllAsync<T>(sql: string, params: SqlValue[] = []) { return db.prepare(sql).all(...params) as T[]; },
  };
}
function fakeWasm() {
  const db = new DatabaseSync(':memory:');
  return {
    exec(options: string | { sql: string; bind?: SqlValue[]; rowMode?: 'object'; returnValue?: 'resultRows' }) {
      if (typeof options === 'string') { db.exec(options); return undefined; }
      const statement = db.prepare(options.sql);
      return options.returnValue === 'resultRows' ? statement.all(...(options.bind ?? [])) : (statement.run(...(options.bind ?? [])), undefined);
    },
  };
}

for (const [name, make] of [['expo-sqlite', () => createExpoSqliteDriver(fakeExpo())], ['sqlite-wasm', () => createSqliteWasmDriver(fakeWasm())]] as const) {
  test(`${name} driver runs the local engine end to end`, async () => {
    const store = await LocalDataStore.open(make(), { deviceCode: 'DRV1' });
    const customer = await store.save('clients', { name: 'Test' });
    const invoice = await store.saveInvoiceDocument({ issueDate: '2026-03-01', clientId: customer.id, lines: [{ description: 'Item', quantity: 1, unitPrice: 50 }] });
    assert.equal(invoice.invoice_number, 'FAT-DRV1-2026-000001');
    await store.recordCustomerPayment({ invoiceId: invoice.id, amount: 50, paymentDate: '2026-03-02', paymentMethod: 'bank' });
    assert.equal((await store.get('invoices', invoice.id))?.status, 'paid');
  });

  test(`${name} driver rolls back a failed transaction`, async () => {
    const store = await LocalDataStore.open(make(), { deviceCode: 'DRV2' });
    const product = await store.save('products', { name: 'Widget', track_stock: true, stock_quantity: 1 });
    await assert.rejects(store.saveInvoiceDocument({ issueDate: '2026-03-01', lines: [{ description: 'Widget', productId: product.id, quantity: 5, unitPrice: 10 }] }), /Not enough stock/);
    assert.equal((await store.list('invoices')).length, 0);
    assert.equal(await store.reserveDocumentNumber('invoice', '2026-03-01'), 'FAT-DRV2-2026-000001', 'a failed sale does not burn a number');
  });
}
