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
  assert.equal(invoice.status, 'posted');
  assert.equal(invoice.commercial_status, 'ISSUED');
  assert.equal(invoice.commercial_document_type, 'INVOICE');
  assert.equal(invoice.accounting_state, 'posted');
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
  assert.ok(result.skipped <= 1, 'only the (already newer) company record may be skipped');
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

test('a new store has one company that can be updated', async () => {
  const { store } = await openStore();
  const company = await store.getCompany();
  assert.equal(company.id, store.companyId);
  assert.equal(company.currency, 'EUR');
  await store.save('companies', { id: store.companyId, company_name: 'Demo Trade' });
  assert.equal((await store.getCompany()).company_name, 'Demo Trade');
  assert.equal((await store.list('companies')).length, 1);
});

test('importing a backup keeps a single company on the device', async () => {
  const a = await openStore('AAAA'); const b = await openStore('BBBB');
  await a.store.save('companies', { id: a.store.companyId, company_name: 'From A' });
  await b.store.importBackup(await a.store.exportBackup());
  const companies = await b.store.list('companies');
  assert.equal(companies.length, 1);
  assert.equal(companies[0].id, b.store.companyId);
});

test('invoice reads attach customers, lines and products; payments attach customer and invoice', async () => {
  const { store } = await openStore();
  const customer = await store.save('clients', { name: 'Drini Logistics' });
  const product = await store.save('products', { name: 'Desk', sku: 'D-1' });
  const invoice = await store.saveInvoiceDocument({ issueDate: '2026-03-01', clientId: customer.id, lines: [{ description: 'Desk', quantity: 1, unitPrice: 100, productId: product.id }] });
  await store.saveInvoiceDocument({ documentType: 'offer', issueDate: '2026-03-02', clientId: customer.id, lines: [line] });
  assert.equal((await store.listInvoices()).length, 2);
  const invoices = await store.listInvoices({ documentType: 'INVOICE' });
  assert.equal(invoices.length, 1);
  assert.equal((invoices[0].client as { name: string }).name, 'Drini Logistics');
  assert.equal((invoices[0].items as unknown[]).length, 1);
  const detail = await store.getInvoice(invoice.id);
  assert.equal(((detail?.items as Array<{ product: { sku: string } }>)[0]).product.sku, 'D-1');
  assert.equal(await store.getInvoice('missing'), null);
  const quote = (await store.listInvoices({ documentType: 'QUOTE' }))[0];
  assert.equal(quote.status, 'sent');
  await assert.rejects(store.recordCustomerPayment({ invoiceId: quote.id, amount: 10, paymentDate: '2026-03-03', paymentMethod: 'bank' }), /cannot be recorded/);
  const payment = await store.recordCustomerPayment({ invoiceId: invoice.id, amount: 50, paymentDate: '2026-03-03', paymentMethod: 'bank' });
  const payments = await store.listPayments({ customerId: customer.id });
  assert.equal(payments.length, 1);
  assert.equal((payments[0].invoice as { invoice_number: string }).invoice_number, invoice.invoice_number);
  assert.equal((await store.getInvoice(invoice.id))?.payment_status, 'PARTIALLY_PAID');
  await store.reverseCustomerPayment(payment.id, 'Mistake');
  assert.equal((await store.listPayments()).length, 0, 'reversed payments are hidden');
  assert.equal((await store.getInvoice(invoice.id))?.payment_status, 'UNPAID');
});

test('quotes can be sent, converted along the allowed path, and converting twice returns the same document', async () => {
  const { store } = await openStore();
  const quote = await store.saveInvoiceDocument({ documentType: 'quote', issueDate: '2026-03-01', lines: [line] });
  assert.equal(quote.status, 'sent');
  const sent = await store.transitionDocumentStatus(quote.id, 'accepted');
  assert.equal(sent.commercial_status, 'ACCEPTED');
  await assert.rejects(store.transitionDocumentStatus(quote.id, 'paid'), /financial workflow/);
  await assert.rejects(store.transitionDocumentStatus(quote.id, 'nonsense'), /Unsupported/);
  await assert.rejects(store.convertDocument(quote.id, 'CREDIT_NOTE'), /not supported/);
  const order = await store.convertDocument(quote.id, 'SALES_ORDER');
  assert.equal(order.commercial_document_type, 'SALES_ORDER');
  assert.equal(order.status, 'draft');
  assert.equal(order.source_document_id, quote.id);
  assert.equal((await store.convertDocument(quote.id, 'SALES_ORDER')).id, order.id);
  assert.equal((await store.list('invoice_items', { where: { invoice_id: order.id } })).length, 1);
  const invoice = await store.convertDocument(order.id, 'INVOICE');
  assert.equal(invoice.payment_status, 'UNPAID');
  assert.match(String(invoice.invoice_number), /^FAT-AAAA-2026-/);
  const events = await store.list('commercial_document_events', { where: { document_id: quote.id } });
  assert.ok(events.length >= 2);
});

test('only drafts can be deleted, and posted invoices only move to overdue', async () => {
  const { store } = await openStore();
  const draft = await store.saveInvoiceDocument({ issueDate: '2026-03-01', status: 'draft', lines: [line] });
  await store.deleteInvoice(draft.id);
  assert.equal(await store.get('invoices', draft.id), null);
  assert.equal((await store.list('invoice_items')).length, 0);
  const invoice = await store.saveInvoiceDocument({ issueDate: '2026-03-01', lines: [line] });
  await assert.rejects(store.deleteInvoice(invoice.id), /cannot be deleted/);
  await assert.rejects(store.transitionDocumentStatus(invoice.id, 'cancelled'), /supported workflow/);
  assert.equal((await store.transitionDocumentStatus(invoice.id, 'overdue')).status, 'overdue');
});

test('a credit note is created from an invoice, posted once, and returns stock', async () => {
  const { store } = await openStore();
  const product = await store.save('products', { name: 'Widget', track_stock: true, stock_quantity: 10 });
  const invoice = await store.saveInvoiceDocument({ issueDate: '2026-03-01', lines: [{ ...line, productId: product.id, quantity: 4 }] });
  assert.equal((await store.get('products', product.id))?.stock_quantity, 6);
  const note = await store.convertDocument(invoice.id, 'CREDIT_NOTE');
  assert.equal(note.credit_of_invoice_id, invoice.id);
  assert.equal(note.accounting_state, 'ready_for_posting');
  const posted = await store.postCreditNote(note.id, 'Customer return');
  assert.equal(posted.accounting_state, 'posted');
  assert.equal((await store.get('products', product.id))?.stock_quantity, 10);
  assert.equal((await store.postCreditNote(note.id)).accounting_state, 'posted');
  assert.equal((await store.get('products', product.id))?.stock_quantity, 10, 'posting twice does not return stock twice');
  await assert.rejects(store.postCreditNote(invoice.id), /not identified as a credit note/);
});

test('money received on account is kept against the customer and can be reversed', async () => {
  const { store } = await openStore();
  const customer = await store.save('clients', { name: 'Acme' });
  await assert.rejects(store.recordCustomerPayment({ amount: 50, paymentDate: '2026-03-02', paymentMethod: 'bank' }), /Choose the customer/);
  const payment = await store.recordCustomerPayment({ customerId: customer.id, amount: 50, paymentDate: '2026-03-02', paymentMethod: 'bank' });
  assert.equal(payment.invoice_id, null);
  assert.equal((await store.listPayments({ customerId: customer.id })).length, 1);
  await store.reverseCustomerPayment(payment.id, 'Entered twice');
  assert.equal((await store.listPayments({ customerId: customer.id })).length, 0);
});

test('the ledger is balanced and agrees with the documents', async () => {
  const { store } = await openStore();
  const { buildLedger, trialBalance, generalLedger } = await import('./ledger.ts');
  const customer = await store.save('clients', { name: 'Acme' });
  const invoice = await store.saveInvoiceDocument({ clientId: customer.id, issueDate: '2026-03-01', lines: [line] });
  await store.recordCustomerPayment({ invoiceId: invoice.id, amount: 100, paymentDate: '2026-03-02', paymentMethod: 'bank' });
  await store.save('expenses', { date: '2026-03-03', category: 'Rent', amount: 50, payment_method: 'cash' });
  await store.save('supplier_bills', { bill_number: 'B1', issue_date: '2026-03-04', total_amount: 118, tax_amount: 18, status: 'open' });
  await store.save('payroll_runs', { run_number: 'PR-1', period_name: 'Mar 2026', period_end: '2026-03-31', status: 'finalised', totals: { gross: 500, employerPension: 25, employeePension: 25, tax: 10, net: 465 } });
  const entries = await buildLedger(store);
  assert.ok(entries.every((item) => Math.abs(item.lines.reduce((sum, row) => sum + row.debit - row.credit, 0)) < 0.005), 'every entry balances');
  const rows = trialBalance(entries);
  assert.equal(Math.round(rows.reduce((sum, row) => sum + row.debit - row.credit, 0) * 100), 0);
  const receivable = generalLedger(entries, '1200');
  assert.equal(receivable.at(-1)?.balance, 136, 'invoice 236 less payment 100');
  assert.equal(rows.find((row) => row.code === '4000')?.credit, 200);
  assert.equal(rows.find((row) => row.code === '6100')?.debit, 500);
});
