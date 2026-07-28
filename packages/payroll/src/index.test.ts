import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateNetToGross,
  calculatePayroll,
  type PayrollRuleConfiguration,
} from "./index.ts";

const rules: PayrollRuleConfiguration = {
  currency: "EUR",
  scale: 2,
  roundingMode: "half-up",
  employeePensionRatePercent: "5",
  employerPensionRatePercent: "5",
  taxBrackets: [
    { lowerBound: "0", upperBound: "80", ratePercent: "0", fixedAmount: "0" },
    { lowerBound: "80", upperBound: "250", ratePercent: "4", fixedAmount: "0" },
    { lowerBound: "250", upperBound: "450", ratePercent: "8", fixedAmount: "0" },
    { lowerBound: "450", upperBound: null, ratePercent: "10", fixedAmount: "0" },
  ],
  ruleReferences: [
    { id: "reviewed-config", version: 1, effectiveFrom: "2026-01-01" },
  ],
};

test("gross-to-net uses exact decimal pension and progressive tax", () => {
  const result = calculatePayroll(
    {
      employeeId: "employee-1",
      salaryBasis: "gross-monthly",
      contractedAmount: "1000.00",
    },
    rules,
  );
  assert.equal(result.grossPay, "1000.00");
  assert.equal(result.employeePension, "50.00");
  assert.equal(result.employerPension, "50.00");
  assert.equal(result.personalIncomeTax, "72.80");
  assert.equal(result.netSalary, "877.20");
  assert.equal(result.employerCost, "1050.00");
});

test("net-to-gross is deterministic and reaches the target", () => {
  const first = calculateNetToGross(
    "877.20",
    { employeeId: "employee-1" },
    rules,
  );
  const second = calculateNetToGross(
    "877.20",
    { employeeId: "employee-1" },
    rules,
  );
  assert.deepEqual(first, second);
  assert.equal(first.grossPay, "1000.00");
  assert.equal(first.netSalary, "877.20");
  assert.ok(first.metadata.iterationCount > 0);
});

test("proration, earnings and deductions preserve exact cents", () => {
  const result = calculatePayroll(
    {
      employeeId: "employee-2",
      salaryBasis: "gross-monthly",
      contractedAmount: "900.00",
      prorationNumerator: "15",
      prorationDenominator: "30",
      earnings: [
        {
          code: "BONUS",
          label: "Bonus",
          amount: "100.00",
          taxable: true,
          pensionable: true,
        },
        {
          code: "MEAL",
          label: "Meal reimbursement",
          amount: "25.25",
          taxable: false,
          pensionable: false,
        },
      ],
      deductions: [
        {
          code: "ADVANCE",
          label: "Advance repayment",
          amount: "50.00",
          taxable: false,
          pensionable: false,
        },
      ],
    },
    rules,
  );
  assert.equal(result.baseEarnings, "450.00");
  assert.equal(result.grossPay, "575.25");
  assert.equal(result.nonTaxableEarnings, "25.25");
  assert.equal(result.otherDeductions, "50.00");
  assert.equal(result.errors.length, 0);
});

test("missing rule references is a blocking error", () => {
  const result = calculatePayroll(
    {
      employeeId: "employee-3",
      salaryBasis: "gross-monthly",
      contractedAmount: "500.00",
    },
    { ...rules, ruleReferences: [] },
  );
  assert.ok(result.errors.some((message) => message.includes("rule references")));
});

test("hourly and daily contracts calculate from approved input snapshots", () => {
  const hourly = calculatePayroll(
    {
      employeeId: "employee-hourly",
      salaryBasis: "hourly",
      contractedAmount: "7.50",
      actualHours: "160",
    },
    rules,
  );
  const daily = calculatePayroll(
    {
      employeeId: "employee-daily",
      salaryBasis: "daily",
      contractedAmount: "45.00",
      actualDays: "20",
    },
    rules,
  );
  assert.equal(hourly.baseEarnings, "1200.00");
  assert.equal(daily.baseEarnings, "900.00");
});

test("pension and tax exemptions are explicit and deterministic", () => {
  const result = calculatePayroll(
    {
      employeeId: "employee-exempt",
      salaryBasis: "gross-monthly",
      contractedAmount: "800.00",
      pensionExempt: true,
      taxExempt: true,
    },
    rules,
  );
  assert.equal(result.employeePension, "0.00");
  assert.equal(result.employerPension, "0.00");
  assert.equal(result.personalIncomeTax, "0.00");
  assert.equal(result.netSalary, "800.00");
});

test("pension contribution bases respect effective configuration limits", () => {
  const result = calculatePayroll(
    {
      employeeId: "employee-capped",
      salaryBasis: "gross-monthly",
      contractedAmount: "5000.00",
    },
    { ...rules, maximumPensionBase: "2000.00" },
  );
  assert.equal(result.pensionableBase, "2000.00");
  assert.equal(result.employeePension, "100.00");
  assert.equal(result.employerPension, "100.00");
});

test("deductions above earnings are rejected as a blocking error", () => {
  const result = calculatePayroll(
    {
      employeeId: "employee-deduction",
      salaryBasis: "gross-monthly",
      contractedAmount: "100.00",
      deductions: [{
        code: "COURT_ORDER",
        label: "Court order",
        amount: "250.00",
        taxable: false,
        pensionable: false,
      }],
    },
    rules,
  );
  assert.ok(result.errors.some((message) => message.includes("exceed")));
});
