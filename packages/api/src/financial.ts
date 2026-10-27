import { DecimalAmount } from '@invoice-monorepo/money';

export type PaymentStatus = 'unpaid' | 'partially_paid' | 'paid' | 'overpaid' | 'overdue' | 'written_off';
export type AllocationStatus = 'unallocated' | 'partially_allocated' | 'allocated' | 'reversed';

export type FinancialMovement = {
  signedAmount: string | number;
  sourceType?: string | null;
  status?: string | null;
};

function decimal(value: string | number | null | undefined, scale = 4) {
  return DecimalAmount.from(String(value ?? 0), scale);
}

export function exactSum(values: readonly (string | number | null | undefined)[], scale = 4) {
  return values.reduce((sum, value) => sum.add(decimal(value, scale)), decimal(0, scale)).toString();
}

export function paymentState(input: {
  amount: string | number;
  allocatedAmount: string | number;
  reversed?: boolean;
}): AllocationStatus {
  if (input.reversed) return 'reversed';
  const amount = decimal(input.amount);
  const allocated = decimal(input.allocatedAmount);
  if (allocated.atoms <= 0n) return 'unallocated';
  if (allocated.atoms >= amount.atoms) return 'allocated';
  return 'partially_allocated';
}

export function invoicePaymentStatus(input: {
  total: string | number;
  paid: string | number;
  dueDate?: string | null;
  asOf?: string;
  writtenOff?: boolean;
}): PaymentStatus {
  if (input.writtenOff) return 'written_off';
  const total = decimal(input.total);
  const paid = decimal(input.paid);
  if (paid.atoms > total.atoms) return 'overpaid';
  if (paid.atoms === total.atoms) return 'paid';
  if (paid.atoms > 0n) return 'partially_paid';
  if (input.dueDate && (input.asOf || new Date().toISOString().slice(0, 10)) > input.dueDate) return 'overdue';
  return 'unpaid';
}

export function outstandingAmount(total: string | number, paid: string | number) {
  const result = decimal(total).subtract(decimal(paid));
  return result.atoms < 0n ? '0.0000' : result.toString();
}

export function customerCredit(totalPayments: string | number, allocatedPayments: string | number, refunds = 0) {
  const result = decimal(totalPayments).subtract(decimal(allocatedPayments)).subtract(decimal(refunds));
  return result.atoms < 0n ? '0.0000' : result.toString();
}

export function accountBalance(openingBalance: string | number, movements: readonly FinancialMovement[]) {
  return movements
    .filter((movement) => (movement.status || 'active') === 'active')
    .reduce((balance, movement) => balance.add(decimal(movement.signedAmount)), decimal(openingBalance))
    .toString();
}

export function cashFlow(movements: readonly FinancialMovement[]) {
  const active = movements.filter((movement) => (movement.status || 'active') === 'active' && !String(movement.sourceType || '').includes('transfer'));
  const cashIn = active.filter((movement) => decimal(movement.signedAmount).atoms > 0n).reduce((sum, movement) => sum.add(decimal(movement.signedAmount)), decimal(0));
  const cashOut = active.filter((movement) => decimal(movement.signedAmount).atoms < 0n).reduce((sum, movement) => sum.add(decimal(movement.signedAmount).atoms < 0n ? decimal(0).subtract(decimal(movement.signedAmount)) : decimal(0)), decimal(0));
  return { cashIn: cashIn.toString(), cashOut: cashOut.toString(), net: cashIn.subtract(cashOut).toString() };
}

export function agingBucket(daysOverdue: number) {
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return '1_30';
  if (daysOverdue <= 60) return '31_60';
  if (daysOverdue <= 90) return '61_90';
  return '90_plus';
}

export function validatePositiveMoney(value: string | number, label = 'Amount') {
  const parsed = decimal(value);
  if (parsed.atoms <= 0n) throw new Error(`${label} must be greater than zero.`);
  return parsed.toString();
}
