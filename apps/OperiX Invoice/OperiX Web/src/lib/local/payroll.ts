import { calculatePayroll, type PayrollCalculationResult, type PayrollRuleConfiguration, type SalaryBasis } from "@invoice-monorepo/payroll";

/**
 * Kosovo monthly payroll rules used on the device: 5% employee and 5% employer pension, progressive income tax
 * (0% to 80, 4% to 250, 8% to 450, 10% above), secondary employment taxed at 10%. These are a reviewed starting
 * point, not legal advice: check them with your accountant before paying anyone.
 */
export const KOSOVO_PAYROLL_RULES: PayrollRuleConfiguration = {
  currency: "EUR",
  scale: 2,
  roundingMode: "half-up",
  employeePensionRatePercent: "5",
  employerPensionRatePercent: "5",
  secondaryTaxRatePercent: "10",
  taxBrackets: [
    { lowerBound: "0", upperBound: "80", ratePercent: "0", fixedAmount: "0" },
    { lowerBound: "80", upperBound: "250", ratePercent: "4", fixedAmount: "0" },
    { lowerBound: "250", upperBound: "450", ratePercent: "8", fixedAmount: "0" },
    { lowerBound: "450", upperBound: null, ratePercent: "10", fixedAmount: "0" },
  ],
  ruleReferences: [{ id: "device-default", version: 1, effectiveFrom: "2026-01-01" }],
};

export interface LocalEmployee {
  id: string;
  employee_number?: string;
  first_name?: string;
  last_name?: string;
  position?: string;
  department?: string;
  salary_basis?: SalaryBasis;
  salary_amount?: number | string;
  taxpayer_type?: "primary" | "secondary";
  pension_exempt?: boolean;
  active?: boolean;
}

export interface RunItem {
  employeeId: string;
  name: string;
  employeeNumber: string;
  position: string;
  department: string;
  result: PayrollCalculationResult;
}

export function calculateEmployee(employee: LocalEmployee): PayrollCalculationResult {
  return calculatePayroll({
    employeeId: employee.id,
    salaryBasis: employee.salary_basis === "net-monthly" ? "net-monthly" : "gross-monthly",
    contractedAmount: String(Number(employee.salary_amount || 0)),
    pensionExempt: Boolean(employee.pension_exempt),
  }, { ...KOSOVO_PAYROLL_RULES, taxpayerType: employee.taxpayer_type === "secondary" ? "secondary" : "primary" });
}

export function buildRunItems(employees: readonly LocalEmployee[]): RunItem[] {
  return employees.filter((employee) => employee.active !== false).map((employee) => ({
    employeeId: employee.id,
    name: `${employee.first_name ?? ""} ${employee.last_name ?? ""}`.trim(),
    employeeNumber: employee.employee_number ?? "",
    position: employee.position ?? "",
    department: employee.department ?? "",
    result: calculateEmployee(employee),
  }));
}

export function runTotals(items: readonly RunItem[]) {
  const sum = (pick: (item: RunItem) => string) => Math.round(items.reduce((total, item) => total + Number(pick(item)), 0) * 100) / 100;
  return {
    gross: sum((item) => item.result.grossPay),
    employeePension: sum((item) => item.result.employeePension),
    employerPension: sum((item) => item.result.employerPension),
    tax: sum((item) => item.result.personalIncomeTax),
    net: sum((item) => item.result.netSalary),
    employerCost: sum((item) => item.result.employerCost),
  };
}
