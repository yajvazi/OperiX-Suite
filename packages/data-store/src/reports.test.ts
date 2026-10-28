import assert from 'node:assert/strict';
import test from 'node:test';
import { createNodeSqliteDriver } from './drivers/node-sqlite.ts';
import { LocalDataStore } from './local.ts';
import { isLocalReportType, localReportRows, localReportSummary } from './reports.ts';

async function seeded() {
  let counter = 0;
  const store = await LocalDataStore.open(createNodeSqliteDriver(), { deviceCode: 'RPT1', newId: () => `id-${++counter}` });
  const customer = await store.save('clients', { name: 'Drini Logistics' });
  const product = await store.save('products', { name: 'Widget', sku: 'W1', track_stock: true, stock_quantity: 10, unit_price: 20 });
  const paid = await store.saveInvoiceDocument({ issueDate: '2026-03-05', clientId: customer.id, lines: [{ description: 'A', quantity: 1, unitPrice: 100, taxRate: 18 }] });
  await store.recordCustomerPayment({ invoiceId: paid.id, amount: 118, paymentDate: '2026-03-06', paymentMethod: 'bank' });
  await store.saveInvoiceDocument({ issueDate: '2026-02-01', dueDate: '2026-02-15', clientId: customer.id, lines: [{ description: 'B', quantity: 2, unitPrice: 50, productId: product.id }] });
  await store.saveInvoiceDocument({ documentType: 'quote', issueDate: '2026-03-07', lines: [{ description: 'Q', quantity: 1, unitPrice: 999 }] });
  const vendor = await store.save('vendors', { name: 'Supplier' });
  await store.save('expenses', { amount: 40, category: 'Rent', date: '2026-03-02', type: 'expense', payment_method: 'cash' });
  await store.save('supplier_bills', { vendor_id: vendor.id, bill_number: 'SB-1', issue_date: '2026-03-01', due_date: '2026-03-20', total_amount: 75, status: 'unpaid' });
  await store.save('vendor_payments', { vendor_id: vendor.id, amount: 10, payment_date: '2026-03-03', payment_method: 'bank' });
  return store;
}

test('the summary counts issued sales only, never quotes or drafts', async () => {
  const summary = await localReportSummary(await seeded());
  assert.equal(summary.gross_sales, 218);          // 118 + 100 (the quote is excluded)
  assert.equal(summary.revenue, 200);              // net of VAT
  assert.equal(summary.expenses, 40);
  assert.equal(summary.net_profit, 160);
  assert.equal(summary.ar_outstanding, 100);       // the unpaid invoice
  assert.equal(summary.ap_outstanding, 75);
});

test('receivables aging lists only unpaid invoices, bucketed by how late they are', async () => {
  const rows = await localReportRows(await seeded(), 'operix_ar_aging');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].customer_name, 'Drini Logistics');
  assert.equal(rows[0].outstanding_amount, 100);
  assert.equal(rows[0].aging_bucket, '90+');
});

test('payables, inventory and cash flow rows have the shapes the report screen reads', async () => {
  const store = await seeded();
  const payables = await localReportRows(store, 'operix_ap_open_items');
  assert.equal(payables[0].supplier_name, 'Supplier');
  const inventory = await localReportRows(store, 'inventory_register');
  assert.deepEqual(inventory.map((row) => [row.name, row.stock_quantity, row.inventory_value]), [['Widget', 8, 160]]);
  const cash = await localReportRows(store, 'operix_cash_flow');
  const net = (type: string) => cash.filter((row) => row.cash_account_type === type).reduce((sum, row) => sum + Number(row.net_change), 0);
  assert.equal(net('bank'), 108);                  // +118 payment, -10 vendor payment
  assert.equal(net('cash'), -40);
});

test('profit and loss groups revenue and expenses by month', async () => {
  const rows = await localReportRows(await seeded(), 'operix_profit_loss');
  const march = rows.filter((row) => row.period_start === '2026-03-01');
  assert.equal(march.find((row) => row.account_type === 'revenue')?.presentation_amount, 100);
  assert.equal(march.find((row) => row.account_type === 'expense')?.presentation_amount, 40);
});

test('only reports that can be built from device records are offered', () => {
  for (const type of ['daily', 'profit_loss', 'cash_flow', 'inventory_register', 'ar_aging', 'ap_aging']) assert.equal(isLocalReportType(type), true);
  for (const type of ['trial_balance', 'balance_sheet', 'general_ledger', 'sales_book']) assert.equal(isLocalReportType(type), false);
});
