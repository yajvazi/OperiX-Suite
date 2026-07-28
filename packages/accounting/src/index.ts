import { DecimalAmount } from "@invoice-monorepo/money";

export type AccountType =
  | "asset"
  | "liability"
  | "equity"
  | "revenue"
  | "expense";
export type NormalBalance = "debit" | "credit";
export type JournalStatus = "draft" | "posted" | "reversed";
export type PeriodStatus = "open" | "closed" | "locked";

export interface AccountingAccount {
  id: string;
  company_id: string;
  code: string;
  name: string;
  account_type: AccountType;
  normal_balance: NormalBalance;
  posting_allowed: boolean;
  active: boolean;
  currency: string;
}

export interface AccountingPeriod {
  id: string;
  company_id: string;
  fiscal_year_id: string;
  period_number: number;
  name: string;
  start_date: string;
  end_date: string;
  status: PeriodStatus;
}

export interface JournalEntry {
  id: string;
  company_id: string;
  entry_number: string;
  status: JournalStatus;
  entry_type: "manual" | "automatic" | "recurring" | "reversal" | "adjustment";
  posting_date: string;
  document_date: string;
  description: string;
  reference: string | null;
  currency: string;
  posted_at: string | null;
}

export interface JournalLineDraft {
  accountId: string;
  description?: string;
  debit: string;
  credit: string;
}

export interface TrialBalanceRow {
  company_id: string;
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  total_debit: number | string;
  total_credit: number | string;
  balance: number | string;
}

export function journalTotals(lines: readonly JournalLineDraft[]) {
  return lines.reduce(
    (totals, line) => ({
      debit: totals.debit.add(DecimalAmount.from(line.debit || "0", 4)),
      credit: totals.credit.add(DecimalAmount.from(line.credit || "0", 4)),
    }),
    {
      debit: DecimalAmount.from("0", 4),
      credit: DecimalAmount.from("0", 4),
    },
  );
}

export function validateJournalDraft(lines: readonly JournalLineDraft[]) {
  if (lines.length < 2) return "A journal requires at least two lines.";
  if (lines.some((line) => !line.accountId)) {
    return "Every journal line requires an account.";
  }
  try {
    for (const line of lines) {
      const debit = DecimalAmount.from(line.debit || "0", 4).atoms;
      const credit = DecimalAmount.from(line.credit || "0", 4).atoms;
      if ((debit > 0n) === (credit > 0n)) {
        return "Each line must contain either a debit or a credit.";
      }
    }
    const totals = journalTotals(lines);
    if (totals.debit.atoms <= 0n || totals.debit.atoms !== totals.credit.atoms) {
      return "Total debits and credits must be equal and greater than zero.";
    }
  } catch {
    return "Journal amounts must be valid decimal values.";
  }
  return null;
}
