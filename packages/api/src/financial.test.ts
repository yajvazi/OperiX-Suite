import assert from 'node:assert/strict';
import test from 'node:test';
import { accountBalance, agingBucket, cashFlow, customerCredit, exactSum, invoicePaymentStatus, paymentState, outstandingAmount, validatePositiveMoney } from './financial.ts';

test('keeps payment and invoice settlement arithmetic exact', () => {
  assert.equal(exactSum(['0.10', '0.20', '1000.0050']), '1000.3050');
  assert.equal(outstandingAmount('1000.00', '400.00'), '600.0000');
  assert.equal(invoicePaymentStatus({ total: '1000.00', paid: '400.00', dueDate: '2026-08-30', asOf: '2026-08-22' }), 'partially_paid');
  assert.equal(invoicePaymentStatus({ total: '900.00', paid: '1000.00' }), 'overpaid');
});

test('tracks unallocated customer credit and allocation state', () => {
  assert.equal(customerCredit('1000.00', '900.00'), '100.0000');
  assert.equal(paymentState({ amount: '2000.00', allocatedAmount: '500.00' }), 'partially_allocated');
  assert.equal(paymentState({ amount: '2000.00', allocatedAmount: '0.00' }), 'unallocated');
});

test('cash and bank movements calculate balances without counting transfers as cash flow', () => {
  assert.equal(accountBalance('500.00', [
    { signedAmount: '1400.00', sourceType: 'customer_payment' },
    { signedAmount: '100.00', sourceType: 'other_income' },
    { signedAmount: '-320.00', sourceType: 'expense_payment' },
    { signedAmount: '-250.00', sourceType: 'supplier_payment' },
  ]), '1430.0000');
  assert.deepEqual(cashFlow([
    { signedAmount: '1000.00', sourceType: 'customer_payment' },
    { signedAmount: '-200.00', sourceType: 'expense_payment' },
    { signedAmount: '-500.00', sourceType: 'transfer_out' },
  ]), { cashIn: '1000.0000', cashOut: '200.0000', net: '800.0000' });
  assert.equal(agingBucket(0), 'current');
  assert.equal(agingBucket(91), '90_plus');
});

test('rejects zero and negative financial mutations', () => {
  assert.throws(() => validatePositiveMoney('0'), /greater than zero/);
  assert.throws(() => validatePositiveMoney('-1'), /greater than zero/);
});
