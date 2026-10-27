import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateExpenseEligibility, calculateExpensePayment, calculateExpenseTotals, documentationStatus, legacyExpenseCategory } from './expense-domain.ts';

test('expense VAT uses exact gross-to-net calculation', () => {
  assert.deepEqual(calculateExpenseTotals({ grossAmount: '100.00', vatRate: '18' }), { grossAmount: '100.0000', vatRate: '18.0000', vatAmount: '18.0000', netAmount: '82.0000' });
  assert.equal(calculateExpenseTotals({ grossAmount: '100.00', vatRate: '0' }).vatAmount, '0.0000');
});

test('tax deductibility and input VAT recovery remain separate', () => {
  const result = calculateExpenseEligibility({ grossAmount: '100', vatAmount: '18', taxTreatment: 'partially_deductible', taxDeductiblePercentage: '50', vatTreatment: 'partially_deductible', vatDeductiblePercentage: '25', businessUsePercentage: '70' });
  assert.deepEqual(result, { deductibleAmount: '35.0000', nonDeductibleAmount: '65.0000', deductibleVatAmount: '3.1500', nonDeductibleVatAmount: '14.8500', businessUsePercentage: '70.0000' });
  assert.equal(calculateExpenseEligibility({ grossAmount: '100', vatAmount: '18', taxTreatment: 'non_deductible', vatTreatment: 'not_vat_registered' }).deductibleAmount, '0.0000');
});

test('mixed-use fuel preserves gross accounting cost while eligibility uses business use', () => {
  const result = calculateExpenseEligibility({ grossAmount: '100', vatAmount: '18', taxTreatment: 'fully_deductible', vatTreatment: 'deductible', businessUsePercentage: '70' });
  assert.equal(result.deductibleAmount, '70.0000');
  assert.equal(result.deductibleVatAmount, '12.6000');
});

test('payment balances and documentation statuses are deterministic', () => {
  assert.deepEqual(calculateExpensePayment({ grossAmount: '100', paidAmount: '40', dueDate: '2026-08-30', asOf: '2026-08-22' }), { paidAmount: '40.0000', outstandingAmount: '60.0000', paymentStatus: 'partially_paid' });
  assert.equal(calculateExpensePayment({ grossAmount: '100', paidAmount: '0', dueDate: '2026-08-01', asOf: '2026-08-22' }).paymentStatus, 'overdue');
  assert.equal(documentationStatus({ documentType: 'tax_invoice', documentNumber: 'A-1', issueDate: '2026-08-22', attachmentCount: 1 }), 'complete');
  assert.equal(documentationStatus({ documentType: 'tax_invoice', documentNumber: 'A-1', issueDate: '2026-08-22', attachmentCount: 0 }), 'missing_supporting_document');
  assert.equal(legacyExpenseCategory('Material Shpenzues'), 'consumable_materials');
});

