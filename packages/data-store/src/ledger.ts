import type { LocalDataStore } from './local.ts';

/**
 * On-device accounting: every invoice, payment, bill, expense, income and payroll run on the device is turned
 * into balanced journal entries on the fly, so the trial balance and general ledger always agree with the
 * documents. This is a simplified chart of accounts for a small business, not a posted ledger; review it with
 * your accountant.
 */
export const LEDGER_ACCOUNTS = [
  { code: '1000', name: 'Cash', type: 'asset' },
  { code: '1010', name: 'Bank', type: 'asset' },
  { code: '1200', name: 'Accounts receivable', type: 'asset' },
  { code: '1300', name: 'VAT receivable (input VAT)', type: 'asset' },
  { code: '2000', name: 'Accounts payable', type: 'liability' },
  { code: '2100', name: 'VAT payable (output VAT)', type: 'liability' },
  { code: '2200', name: 'Net salaries payable', type: 'liability' },
  { code: '2210', name: 'Pension contributions payable', type: 'liability' },
  { code: '2220', name: 'Income tax withheld payable', type: 'liability' },
  { code: '4000', name: 'Sales revenue', type: 'revenue' },
  { code: '4900', name: 'Other income', type: 'revenue' },
  { code: '5000', name: 'Purchases', type: 'expense' },
  { code: '6000', name: 'Operating expenses', type: 'expense' },
  { code: '6100', name: 'Salaries', type: 'expense' },
  { code: '6110', name: 'Employer pension contributions', type: 'expense' },
] as const;
export type LedgerAccountCode = (typeof LEDGER_ACCOUNTS)[number]['code'];

export interface JournalLine { account: LedgerAccountCode; debit: number; credit: number }
export interface JournalEntry { date: string; reference: string; description: string; source: string; lines: JournalLine[] }
export interface TrialBalanceRow { code: string; name: string; type: string; debit: number; credit: number; balance: number }
export interface GeneralLedgerRow { date: string; reference: string; description: string; debit: number; credit: number; balance: number }

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const cashAccount = (method: unknown): LedgerAccountCode => (method === 'cash' ? '1000' : '1010');
const SALES_TYPES = ['INVOICE', 'FINAL_INVOICE', 'SIMPLIFIED_INVOICE', 'FISCAL_RECEIPT', 'ADVANCE_INVOICE', 'DEBIT_NOTE', 'CREDIT_NOTE'];

function entry(date: unknown, reference: unknown, description: string, source: string, lines: Array<[LedgerAccountCode, number, number]>): JournalEntry | null {
  const kept = lines.map(([account, debit, credit]) => ({ account, debit: round(debit), credit: round(credit) })).filter((line) => line.debit !== 0 || line.credit !== 0);
  if (!kept.length) return null;
  return { date: String(date ?? '').slice(0, 10), reference: String(reference ?? ''), description, source, lines: kept };
}

export async function buildLedger(store: LocalDataStore): Promise<JournalEntry[]> {
  const entries: JournalEntry[] = [];
  const push = (value: JournalEntry | null) => { if (value) entries.push(value); };

  for (const invoice of await store.listInvoices({ ascending: true })) {
    const type = String(invoice.commercial_document_type);
    if (!SALES_TYPES.includes(type) || ['draft', 'cancelled', 'reversed'].includes(String(invoice.status))) continue;
    const credit = type === 'CREDIT_NOTE';
    const total = Math.abs(Number(invoice.total_amount || 0)); const vat = Math.abs(Number(invoice.tax_amount || 0));
    const label = `${credit ? 'Credit note' : 'Invoice'} ${invoice.invoice_number ?? ''}`.trim();
    push(credit
      ? entry(invoice.issue_date, invoice.invoice_number, label, 'invoice', [['4000', total - vat, 0], ['2100', vat, 0], ['1200', 0, total]])
      : entry(invoice.issue_date, invoice.invoice_number, label, 'invoice', [['1200', total, 0], ['4000', 0, total - vat], ['2100', 0, vat]]));
  }
  for (const payment of await store.listPayments()) {
    const amount = Number(payment.amount || 0);
    push(entry(payment.payment_date, payment.payment_number, `Payment ${payment.payment_number ?? ''}`.trim(), 'payment', [[cashAccount(payment.payment_method), amount, 0], ['1200', 0, amount]]));
  }
  for (const income of await store.list('other_income')) {
    push(entry(income.income_date, income.income_number, `Other income: ${income.description ?? ''}`.trim(), 'other_income',
      [[cashAccount(income.payment_method), Number(income.gross_amount || 0), 0], ['4900', 0, Number(income.net_amount || 0)], ['2100', 0, Number(income.vat_amount || 0)]]));
  }
  for (const bill of await store.list('supplier_bills')) {
    if (['draft', 'cancelled'].includes(String(bill.status))) continue;
    const total = Number(bill.total_amount || 0); const vat = Number(bill.tax_amount || 0);
    push(entry(bill.issue_date, bill.bill_number, `Supplier bill ${bill.bill_number ?? ''}`.trim(), 'supplier_bill', [['5000', total - vat, 0], ['1300', vat, 0], ['2000', 0, total]]));
  }
  for (const payment of await store.list('vendor_payments')) {
    const amount = Number(payment.amount || 0);
    push(entry(payment.payment_date, payment.payment_number, `Supplier payment ${payment.payment_number ?? ''}`.trim(), 'vendor_payment', [['2000', amount, 0], [cashAccount(payment.payment_method), 0, amount]]));
  }
  for (const expense of await store.list('expenses')) {
    if (expense.type === 'income') continue;
    const amount = Number(expense.amount || 0);
    push(entry(expense.date, expense.id, `Expense: ${expense.category ?? ''} ${expense.description ?? ''}`.trim(), 'expense', [['6000', amount, 0], [cashAccount(expense.payment_method), 0, amount]]));
  }
  for (const run of await store.list('payroll_runs')) {
    if (!['finalised', 'paid'].includes(String(run.status))) continue;
    const totals = (run.totals ?? {}) as Record<string, number>;
    const gross = Number(totals.gross || 0); const employerPension = Number(totals.employerPension || 0);
    const employeePension = Number(totals.employeePension || 0); const tax = Number(totals.tax || 0); const net = Number(totals.net || 0);
    push(entry(run.period_end, run.run_number, `Payroll ${run.period_name ?? ''}`.trim(), 'payroll',
      [['6100', gross, 0], ['6110', employerPension, 0], ['2200', 0, net], ['2210', 0, employeePension + employerPension], ['2220', 0, tax]]));
    if (run.status === 'paid') push(entry(run.payment_date ?? run.period_end, run.run_number, `Salaries paid ${run.period_name ?? ''}`.trim(), 'payroll_payment', [['2200', net, 0], ['1010', 0, net]]));
  }
  return entries.sort((a, b) => a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference));
}

export function trialBalance(entries: readonly JournalEntry[]): TrialBalanceRow[] {
  const totals = new Map<string, { debit: number; credit: number }>();
  for (const line of entries.flatMap((item) => item.lines)) {
    const current = totals.get(line.account) ?? { debit: 0, credit: 0 };
    current.debit = round(current.debit + line.debit); current.credit = round(current.credit + line.credit);
    totals.set(line.account, current);
  }
  return LEDGER_ACCOUNTS.filter((account) => totals.has(account.code)).map((account) => {
    const sum = totals.get(account.code)!;
    return { code: account.code, name: account.name, type: account.type, debit: sum.debit, credit: sum.credit, balance: round(sum.debit - sum.credit) };
  });
}

export function generalLedger(entries: readonly JournalEntry[], account: string): GeneralLedgerRow[] {
  let balance = 0;
  const rows: GeneralLedgerRow[] = [];
  for (const item of entries) {
    for (const line of item.lines.filter((candidate) => candidate.account === account)) {
      balance = round(balance + line.debit - line.credit);
      rows.push({ date: item.date, reference: item.reference, description: item.description, debit: line.debit, credit: line.credit, balance });
    }
  }
  return rows;
}
