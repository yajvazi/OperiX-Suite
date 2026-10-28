import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateInvoice } from '@invoice-monorepo/money';
import { createNodeSqliteDriver } from './drivers/node-sqlite.ts';
import { LocalDataStore } from './local.ts';

async function openStore(deviceCode = 'AAAA') {
  const driver = createNodeSqliteDriver();
  let counter = 0;
  const store = await LocalDataStore.open(driver, { deviceCode, newId: () => `id-${deviceCode}-${++counter}`, now: () => new Date(`2026-03-01T10:00:${String(counter % 60).padStart(2, '0')}Z`) });
  return { store, driver };
}

const line = { description: 'Desk', quantity: 2, unitPrice: 100, taxRate: 18 };

test('numbers are consecutive per device and carry the device code', async () => {
  const { store } = await openStore('K7QZ');
  assert.equal(await store.reserveDocumentNumber('invoice', '2026-03-01'), 'FAT-K7QZ-2026-000001');
  assert.equal(await store.reserveDocumentNumber('invoice', '2026-03-02'), 'FAT-K7QZ-2026-000002');
  assert.equal(await store.reserveDocumentNumber('offer', '2026-03-02'), 'OF-K7QZ-2026-000001');
  assert.equal(await store.reserveDocumentNumber('final_invoice', '2026-03-03'), 'FAT-K7QZ-2026-000003', 'final invoices share the invoice series');
  assert.equal(await store.reserveDocumentNumber('invoice', '2027-01-01'), 'FAT-K7QZ-2027-000001', 'a new year starts a new series');
});

test('two devices can never produce the same number', async () => {
  const a = await openStore('AAAA'); const b = await openStore('BBBB');
  const numbers = new Set<string>();
  for (let index = 0; index < 5; index += 1) { numbers.add(await a.store.reserveDocumentNumber('invoice', '2026-03-01')); numbers.add(await b.store.reserveDocumentNumber('invoice', '2026-03-01')); }
  assert.equal(numbers.size, 10);
});

test('unsupported document types and bad dates are rejected', async () => {
  const { store } = await openStore();
  await assert.rejects(store.reserveDocumentNumber('mystery', '2026-03-01'), /Unsupported/);
  await assert.rejects(store.reserveDocumentNumber('invoice', '01/03/2026'), /ISO date/);
});

test('an invoice uses the shared calculation, is numbered when issued and cannot be edited afterwards', async () => {
  const { store } = await openStore();
  const expected = calculateInvoice({ lines: [{ quantity: 2, unitPrice: 100, taxRate: 18 }] });
  const invoice = await store.saveInvoiceDocument({ issueDate: '2026-03-01', clientId: 'c1', lines: [line] });
  assert.equal(invoice.total_amount, expected.total);
  assert.equal(invoice.tax_amount, expected.tax);
  assert.equal(invoice.invoice_number, 'FAT-AAAA-2026-000001');
  assert.equal(invoice.status, 'issued');
  const items = await store.list('invoice_items', { where: { invoice_id: invoice.id } });
  assert.equal(items.length, 1);
  await assert.rejects(store.saveInvoiceDocument({ id: invoice.id, issueDate: '2026-03-01', lines: [line] }), /cannot be edited/);
  await assert.rejects(store.remove('invoices', invoice.id), /cannot be deleted/);
});

test('drafts have no number until they are issued, and repeating a save does not duplicate', async () => {
  const { store } = await openStore();
  const draft = await store.saveInvoiceDocument({ issueDate: '2026-03-01', status: 'draft', lines: [line], idempotencyKey: 'k1' });
  assert.equal(draft.invoice_number, '');
  const again = await store.saveInvoiceDocument({ issueDate: '2026-03-01', status: 'draft', lines: [line], idempotencyKey: 'k1' });
  assert.equal(again.id, draft.id);
  assert.equal((await store.list('invoices')).length, 1);
  const issued = await store.saveInvoiceDocument({ id: draft.id, issueDate: '2026-03-01', lines: [line, { ...line, description: 'Chair' }] });
  assert.equal(issued.invoice_number, 'FAT-AAAA-2026-000001');
  assert.equal((await store.list('invoice_items', { where: { invoice_id: draft.id } })).length, 2, 'the old lines are replaced');
});

test('tracked stock is reduced when a document is issued and cannot go below zero', async () => {
  const { store } = await openStore();
  const product = await store.save('products', { name: 'Widget', track_stock: true, stock_quantity: 5 });
  await assert.rejects(store.saveInvoiceDocument({ issueDate: '2026-03-01', lines: [{ ...line, productId: product.id, quantity: 6 }] }), /Not enough stock for "Widget"\. Available: 5, requested: 6/);
  assert.equal((await store.get('products', product.id))?.stock_quantity, 5, 'a rejected sale changes nothing');
  await store.saveInvoiceDocument({ issueDate: '2026-03-01', lines: [{ ...line, productId: product.id, quantity: 3 }] });
  assert.equal((await store.get('products', product.id))?.stock_quantity, 2);
  const movements = await store.list('inventory_stock_movements');
  assert.equal(movements.length, 1);
  assert.equal(movements[0].quantity_delta, -3);
});

test('payments settle the invoice, reject overpayment and big cash payments, and can be reversed', async () => {
  const { store } = await openStore();
  const invoice = await store.saveInvoiceDocument({ issueDate: '2026-03-01', lines: [{ description: 'Service', quantity: 1, unitPrice: 1000 }] });
  await assert.rejects(store.recordCustomerPayment({ invoiceId: invoice.id, amount: 300, paymentDate: '2026-03-02', paymentMethod: 'cash' }), /below 300/);
  await assert.rejects(store.recordCustomerPayment({ invoiceId: invoice.id, amount: 1500, paymentDate: '2026-03-02', paymentMethod: 'bank' }), /exceeds the outstanding/);
  const first = await store.recordCustomerPayment({ invoiceId: invoice.id, amount: 400, paymentDate: '2026-03-02', paymentMethod: 'bank' });
  assert.equal((await store.get('invoices', invoice.id))?.status, 'partially_paid');
  assert.equal((await store.get('invoices', invoice.id))?.amount_received, 400);
  await store.recordCustomerPayment({ invoiceId: invoice.id, amount: 600, paymentDate: '2026-03-03', paymentMethod: 'bank' });
  assert.equal((await store.get('invoices', invoice.id))?.status, 'paid');
  await assert.rejects(store.reverseCustomerPayment(first.id, ' '), /reason/);
  await store.reverseCustomerPayment(first.id, 'Entered twice');
  const after = await store.get('invoices', invoice.id);
  assert.equal(after?.amount_received, 600);
  assert.equal(after?.status, 'partially_paid');
  await assert.rejects(store.reverseCustomerPayment(first.id, 'again'), /already been reversed/);
});

test('a backup restores everything on another device and never reuses an issued number', async () => {
  const a = await openStore('AAAA');
  const customer = await a.store.save('clients', { name: 'Drini Logistics' });
  const invoice = await a.store.saveInvoiceDocument({ issueDate: '2026-03-01', clientId: customer.id, lines: [line] });
  await a.store.saveInvoiceDocument({ issueDate: '2026-03-02', lines: [line] });
  const file = await a.store.exportBackup();

  const b = await openStore('BBBB');
  const result = await b.store.importBackup(file);
  assert.equal(result.skipped, 0);
  assert.equal((await b.store.get('clients', customer.id))?.name, 'Drini Logistics');
  assert.equal((await b.store.get('invoices', invoice.id))?.invoice_number, 'FAT-AAAA-2026-000001');
  // B continues in its own series, and A's counter was carried over (restoring onto A itself never reuses 000001/000002).
  assert.equal(await b.store.reserveDocumentNumber('invoice', '2026-03-05'), 'FAT-BBBB-2026-000003');

  const again = await b.store.importBackup(file);
  assert.deepEqual(again, { inserted: 0, updated: 0, skipped: file.records.length }, 'importing the same file twice changes nothing');
});

test('a damaged or foreign backup file is refused', async () => {
  const a = await openStore();
  const file = await a.store.exportBackup();
  const { store } = await openStore('CCCC');
  await assert.rejects(store.importBackup({ ...file, companyId: 'tampered' }), /damaged/);
  await assert.rejects(store.importBackup({ ...file, format: 'other' } as never), /not an OperiX backup/);
});

test('deleted records stay deleted after a backup is imported', async () => {
  const a = await openStore('AAAA');
  const customer = await a.store.save('clients', { name: 'Temp' });
  const b = await openStore('BBBB');
  await b.store.importBackup(await a.store.exportBackup());
  await a.store.remove('clients', customer.id);
  await b.store.importBackup(await a.store.exportBackup());
  assert.equal(await b.store.get('clients', customer.id), null);
});

test('list filters and sorts', async () => {
  const { store } = await openStore();
  await store.save('clients', { name: 'Bravo' }); await store.save('clients', { name: 'Alpha' }); await store.save('clients', { name: 'Charlie', city: 'Prishtina' });
  assert.deepEqual((await store.list('clients', { orderBy: 'name' })).map((row) => row.name), ['Alpha', 'Bravo', 'Charlie']);
  assert.deepEqual((await store.list('clients', { where: { city: 'Prishtina' } })).map((row) => row.name), ['Charlie']);
  assert.equal((await store.list('clients', { limit: 2 })).length, 2);
});
