import type { RoundingMode } from "@invoice-monorepo/money";

export const complianceConfigTypes = [
  "vat_rates",
  "payroll_tax_brackets",
  "pension_contribution_rates",
  "invoice_numbering",
  "fiscal_receipt_numbering",
  "accounting_periods",
  "tax_reporting_periods",
  "document_retention",
  "payment_methods",
  "credit_note_rules",
  "cancellation_rules",
  "rounding_rules",
] as const;

export type ComplianceConfigType = (typeof complianceConfigTypes)[number];
export type ComplianceConfigStatus = "draft" | "active" | "retired";

export interface VatRateDefinition {
  code: string;
  name: string;
  rate: string;
  appliesTo: "sales" | "purchases" | "both";
  deductibilityPercentage: string;
  category:
    | "standard"
    | "reduced"
    | "zero_rated"
    | "exempt"
    | "out_of_scope"
    | "reverse_charge"
    | "import"
    | "export";
}

export interface PayrollTaxBracketDefinition {
  lowerBound: string;
  upperBound: string | null;
  rate: string;
  fixedAmount: string;
}

export interface NumberingDefinition {
  prefix: string;
  nextNumber: string;
  padding: number;
  reset: "never" | "fiscal_year" | "calendar_year" | "monthly";
}

export interface RoundingDefinition {
  monetaryScale: number;
  unitPriceScale: number;
  quantityScale: number;
  mode: RoundingMode;
  taxRounding: "per-line" | "per-document";
}

export interface CompliancePayloadMap {
  vat_rates: { rates: VatRateDefinition[] };
  payroll_tax_brackets: { currency: string; brackets: PayrollTaxBracketDefinition[] };
  pension_contribution_rates: {
    employeeRate: string;
    employerRate: string;
    minimumBase: string | null;
    maximumBase: string | null;
  };
  invoice_numbering: NumberingDefinition;
  fiscal_receipt_numbering: NumberingDefinition;
  accounting_periods: { frequency: "monthly"; fiscalYearStartMonth: number };
  tax_reporting_periods: { vatFrequency: "monthly" };
  document_retention: { years: number };
  payment_methods: { enabled: string[] };
  credit_note_rules: { reasonRequired: boolean; approvalRequired: boolean };
  cancellation_rules: { reasonRequired: boolean; approvalRequired: boolean };
  rounding_rules: RoundingDefinition;
}

export interface EffectiveConfigVersion<T extends ComplianceConfigType> {
  id: string;
  type: T;
  version: number;
  status: ComplianceConfigStatus;
  effectiveFrom: string;
  effectiveUntil: string | null;
  payload: CompliancePayloadMap[T];
}

function compareIsoDate(left: string, right: string) {
  return left.localeCompare(right);
}

export function selectEffectiveConfig<T extends ComplianceConfigType>(
  versions: readonly EffectiveConfigVersion<T>[],
  effectiveOn: string,
) {
  return (
    versions
      .filter(
        (candidate) =>
          candidate.status === "active" &&
          compareIsoDate(candidate.effectiveFrom, effectiveOn) <= 0 &&
          (!candidate.effectiveUntil ||
            compareIsoDate(candidate.effectiveUntil, effectiveOn) >= 0),
      )
      .sort((left, right) => {
        const effectiveDateOrder = compareIsoDate(
          right.effectiveFrom,
          left.effectiveFrom,
        );
        return effectiveDateOrder || right.version - left.version;
      })[0] ?? null
  );
}
