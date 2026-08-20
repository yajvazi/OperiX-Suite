import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allowedConversion,
  calculateCommercialTotals,
  isImmutableCommercialStatus,
  planConversion,
  remainingAfterAdvances,
  resolveCommercialDocumentType,
} from './index.ts';

test('explicit document type wins over legacy fields and title', () => {
  assert.equal(resolveCommercialDocumentType({ commercial_document_type: 'PROFORMA', type: 'invoice', title: 'FATURË' }), 'PROFORMA');
});

test('legacy mapping never uses the PDF title', () => {
  assert.equal(resolveCommercialDocumentType({ type: 'offer', subtype: 'order', title: 'FATURË' }), 'SALES_ORDER');
  assert.equal(resolveCommercialDocumentType({ type: 'invoice', title: 'PRO-FATURË' }), 'INVOICE');
});

test('conversion plans are traceable and never post economic events', () => {
  assert.equal(allowedConversion('QUOTE', 'SALES_ORDER'), true);
  assert.equal(allowedConversion('QUOTE', 'CREDIT_NOTE'), false);
  const plan = planConversion('DELIVERY_NOTE', 'INVOICE');
  assert.equal(plan.createsEconomicEvents, false);
  assert.equal(plan.relationType, 'delivery_note_to_invoice');
});

test('commercial totals and advance reconciliation are deterministic', () => {
  const totals = calculateCommercialTotals([
    { quantity: 2, unitPrice: 100, discountPercent: 10, taxRate: 18 },
    { quantity: 1, unitPrice: 50, taxRate: 0 },
  ]);
  assert.deepEqual(totals, { subtotal: 250, discount: 20, taxable: 230, vat: 32.4, total: 262.4 });
  assert.equal(remainingAfterAdvances(1000, [300, 100]), 600);
});

test('issued financial documents are immutable', () => {
  assert.equal(isImmutableCommercialStatus('ISSUED'), true);
  assert.equal(isImmutableCommercialStatus('DRAFT'), false);
});
