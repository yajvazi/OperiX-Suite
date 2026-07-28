import { DecimalAmount, decimalToAtoms } from "@invoice-monorepo/money";

export type PayrollRoundingMode = "half-up" | "half-even" | "truncate";
export type SalaryBasis = "gross-monthly" | "net-monthly" | "hourly" | "daily";

export interface EffectiveRuleReference {
  id: string;
  version: number;
  effectiveFrom: string;
  effectiveUntil?: string | null;
  sourceReference?: string | null;
}

export interface PayrollTaxBracket {
  lowerBound: string;
  upperBound?: string | null;
  ratePercent: string;
  fixedAmount: string;
}

export interface PayrollRuleConfiguration {
  currency: string;
  scale: number;
  roundingMode: PayrollRoundingMode;
  employeePensionRatePercent: string;
  employerPensionRatePercent: string;
  minimumPensionBase?: string | null;
  maximumPensionBase?: string | null;
  taxBrackets: readonly PayrollTaxBracket[];
  ruleReferences: readonly EffectiveRuleReference[];
}

export interface PayrollComponent {
  code: string;
  label: string;
  amount: string;
  taxable: boolean;
  pensionable: boolean;
  accountingMappingCode?: string | null;
  sourceReference?: string | null;
}

export interface PayrollCalculationInput {
  employeeId: string;
  salaryBasis: SalaryBasis;
  contractedAmount: string;
  standardHours?: string;
  actualHours?: string;
  standardDays?: string;
  actualDays?: string;
  prorationNumerator?: string;
  prorationDenominator?: string;
  earnings?: readonly PayrollComponent[];
  deductions?: readonly PayrollComponent[];
  taxExemptionAmount?: string;
  pensionExempt?: boolean;
  taxExempt?: boolean;
}

export interface PayrollCalculationLine extends PayrollComponent {
  kind: "earning" | "deduction" | "statutory";
}

export interface PayrollCalculationResult {
  employeeId: string;
  currency: string;
  baseEarnings: string;
  additionalEarnings: string;
  taxableEarnings: string;
  nonTaxableEarnings: string;
  grossPay: string;
  pensionableBase: string;
  employeePension: string;
  employerPension: string;
  taxableIncome: string;
  personalIncomeTax: string;
  otherDeductions: string;
  netSalary: string;
  employerCost: string;
  lines: PayrollCalculationLine[];
  ruleReferences: readonly EffectiveRuleReference[];
  warnings: string[];
  errors: string[];
  metadata: {
    salaryBasis: SalaryBasis;
    iterationCount: number;
    targetNet?: string;
  };
}

const ZERO = 0n;
const PERCENT_SCALE = 6;
const HUNDRED_ATOMS = decimalToAtoms("100", PERCENT_SCALE);

function atoms(value: string, scale: number, mode: PayrollRoundingMode) {
  return decimalToAtoms(value, scale, mode);
}

function format(value: bigint, scale: number) {
  return DecimalAmount.fromAtoms(value, scale).toString();
}

function roundedDivide(
  numerator: bigint,
  denominator: bigint,
  mode: PayrollRoundingMode,
) {
  if (denominator === ZERO) throw new RangeError("Denominator cannot be zero.");
  const negative = (numerator < ZERO) !== (denominator < ZERO);
  const left = numerator < ZERO ? -numerator : numerator;
  const right = denominator < ZERO ? -denominator : denominator;
  let quotient = left / right;
  const remainder = left % right;
  if (remainder !== ZERO && mode !== "truncate") {
    const doubled = remainder * 2n;
    if (
      doubled > right ||
      (doubled === right && (mode === "half-up" || quotient % 2n !== ZERO))
    ) {
      quotient += 1n;
    }
  }
  return negative ? -quotient : quotient;
}

function applyPercent(
  amount: bigint,
  percent: string,
  mode: PayrollRoundingMode,
) {
  return roundedDivide(
    amount * atoms(percent, PERCENT_SCALE, mode),
    HUNDRED_ATOMS,
    mode,
  );
}

function clamp(value: bigint, minimum?: bigint | null, maximum?: bigint | null) {
  if (minimum !== null && minimum !== undefined && value < minimum) return minimum;
  if (maximum !== null && maximum !== undefined && value > maximum) return maximum;
  return value;
}

function progressiveTax(
  taxableIncome: bigint,
  config: PayrollRuleConfiguration,
) {
  if (taxableIncome <= ZERO) return ZERO;
  const scale = config.scale;
  let total = ZERO;
  const brackets = [...config.taxBrackets].sort(
    (left, right) =>
      Number(
        atoms(left.lowerBound, scale, config.roundingMode) -
          atoms(right.lowerBound, scale, config.roundingMode),
      ),
  );

  for (const bracket of brackets) {
    const lower = atoms(bracket.lowerBound, scale, config.roundingMode);
    const upper = bracket.upperBound
      ? atoms(bracket.upperBound, scale, config.roundingMode)
      : null;
    if (taxableIncome <= lower) continue;
    const taxableSlice = (upper === null || taxableIncome < upper ? taxableIncome : upper) - lower;
    total += atoms(bracket.fixedAmount, scale, config.roundingMode);
    total += applyPercent(taxableSlice, bracket.ratePercent, config.roundingMode);
  }
  return total;
}

function calculateBaseEarnings(
  input: PayrollCalculationInput,
  config: PayrollRuleConfiguration,
) {
  const amount = atoms(input.contractedAmount, config.scale, config.roundingMode);
  if (input.salaryBasis === "hourly") {
    return DecimalAmount.fromAtoms(amount, config.scale)
      .multiply(
        DecimalAmount.from(input.actualHours ?? "0", 4, config.roundingMode),
        config.scale,
        config.roundingMode,
      ).atoms;
  }
  if (input.salaryBasis === "daily") {
    return DecimalAmount.fromAtoms(amount, config.scale)
      .multiply(
        DecimalAmount.from(input.actualDays ?? "0", 4, config.roundingMode),
        config.scale,
        config.roundingMode,
      ).atoms;
  }
  if (input.prorationNumerator && input.prorationDenominator) {
    return DecimalAmount.fromAtoms(amount, config.scale).multiplyRatio(
      atoms(input.prorationNumerator, 4, config.roundingMode),
      atoms(input.prorationDenominator, 4, config.roundingMode),
      config.roundingMode,
    ).atoms;
  }
  if (input.actualHours && input.standardHours) {
    return DecimalAmount.fromAtoms(amount, config.scale).multiplyRatio(
      atoms(input.actualHours, 4, config.roundingMode),
      atoms(input.standardHours, 4, config.roundingMode),
      config.roundingMode,
    ).atoms;
  }
  if (input.actualDays && input.standardDays) {
    return DecimalAmount.fromAtoms(amount, config.scale).multiplyRatio(
      atoms(input.actualDays, 4, config.roundingMode),
      atoms(input.standardDays, 4, config.roundingMode),
      config.roundingMode,
    ).atoms;
  }
  return amount;
}

function calculateGross(
  input: PayrollCalculationInput,
  config: PayrollRuleConfiguration,
  contractedGrossOverride?: bigint,
) {
  const scale = config.scale;
  const baseEarnings =
    contractedGrossOverride ??
    calculateBaseEarnings({ ...input, salaryBasis: input.salaryBasis === "net-monthly" ? "gross-monthly" : input.salaryBasis }, config);
  const earnings = input.earnings ?? [];
  const deductions = input.deductions ?? [];
  const earningAtoms = earnings.map((line) => ({
    line,
    amount: atoms(line.amount, scale, config.roundingMode),
  }));
  const deductionAtoms = deductions.map((line) => ({
    line,
    amount: atoms(line.amount, scale, config.roundingMode),
  }));
  const additionalEarnings = earningAtoms.reduce((sum, item) => sum + item.amount, ZERO);
  const grossPay = baseEarnings + additionalEarnings;
  const pensionableBaseRaw =
    baseEarnings +
    earningAtoms
      .filter((item) => item.line.pensionable)
      .reduce((sum, item) => sum + item.amount, ZERO);
  const minimumBase = config.minimumPensionBase
    ? atoms(config.minimumPensionBase, scale, config.roundingMode)
    : null;
  const maximumBase = config.maximumPensionBase
    ? atoms(config.maximumPensionBase, scale, config.roundingMode)
    : null;
  const pensionableBase = input.pensionExempt
    ? ZERO
    : clamp(pensionableBaseRaw, minimumBase, maximumBase);
  const employeePension = input.pensionExempt
    ? ZERO
    : applyPercent(
        pensionableBase,
        config.employeePensionRatePercent,
        config.roundingMode,
      );
  const employerPension = input.pensionExempt
    ? ZERO
    : applyPercent(
        pensionableBase,
        config.employerPensionRatePercent,
        config.roundingMode,
      );
  const taxableEarnings =
    baseEarnings +
    earningAtoms
      .filter((item) => item.line.taxable)
      .reduce((sum, item) => sum + item.amount, ZERO);
  const nonTaxableEarnings = grossPay - taxableEarnings;
  const exemption = atoms(
    input.taxExemptionAmount ?? "0",
    scale,
    config.roundingMode,
  );
  const taxableIncome = input.taxExempt
    ? ZERO
    : [taxableEarnings - employeePension - exemption, ZERO].reduce((largest, value) =>
        value > largest ? value : largest,
      );
  const personalIncomeTax = input.taxExempt
    ? ZERO
    : progressiveTax(taxableIncome, config);
  const otherDeductions = deductionAtoms.reduce((sum, item) => sum + item.amount, ZERO);
  const netSalary =
    grossPay - employeePension - personalIncomeTax - otherDeductions;
  const employerCost = grossPay + employerPension;

  return {
    baseEarnings,
    additionalEarnings,
    taxableEarnings,
    nonTaxableEarnings,
    grossPay,
    pensionableBase,
    employeePension,
    employerPension,
    taxableIncome,
    personalIncomeTax,
    otherDeductions,
    netSalary,
    employerCost,
    earningAtoms,
    deductionAtoms,
  };
}

export function calculatePayroll(
  input: PayrollCalculationInput,
  config: PayrollRuleConfiguration,
): PayrollCalculationResult {
  if (config.currency.trim().toUpperCase() !== "EUR") {
    throw new TypeError("Phase F payroll currently requires EUR configuration.");
  }
  if (config.scale < 2 || config.scale > 4) {
    throw new RangeError("Payroll scale must be between 2 and 4.");
  }

  let iterationCount = 0;
  let targetNet: bigint | undefined;
  let result;
  if (input.salaryBasis === "net-monthly") {
    targetNet = atoms(input.contractedAmount, config.scale, config.roundingMode);
    let low = ZERO;
    let high = targetNet > ZERO ? targetNet * 3n + 100_00n : 100_00n;
    for (iterationCount = 1; iterationCount <= 128; iterationCount += 1) {
      const midpoint = (low + high) / 2n;
      const candidate = calculateGross(input, config, midpoint);
      if (candidate.netSalary < targetNet) low = midpoint + 1n;
      else high = midpoint;
      if (low >= high) break;
    }
    result = calculateGross(input, config, high);
  } else {
    result = calculateGross(input, config);
  }

  const lines: PayrollCalculationLine[] = [
    ...(result.earningAtoms.map(({ line }) => ({ ...line, kind: "earning" as const }))),
    ...(result.deductionAtoms.map(({ line }) => ({ ...line, kind: "deduction" as const }))),
    {
      code: "EMPLOYEE_PENSION",
      label: "Employee pension",
      amount: format(result.employeePension, config.scale),
      taxable: false,
      pensionable: false,
      kind: "statutory",
    },
    {
      code: "PERSONAL_INCOME_TAX",
      label: "Personal income tax",
      amount: format(result.personalIncomeTax, config.scale),
      taxable: false,
      pensionable: false,
      kind: "statutory",
    },
    {
      code: "EMPLOYER_PENSION",
      label: "Employer pension",
      amount: format(result.employerPension, config.scale),
      taxable: false,
      pensionable: false,
      kind: "statutory",
    },
  ];
  const warnings: string[] = [];
  const errors: string[] = [];
  if (result.netSalary < ZERO) errors.push("Deductions exceed available earnings.");
  if (config.ruleReferences.length === 0) {
    errors.push("No approved payroll rule references were supplied.");
  }
  if (input.salaryBasis === "net-monthly" && result.netSalary !== targetNet) {
    warnings.push(
      `Net-to-gross result differs from target by ${format(
        result.netSalary - (targetNet ?? ZERO),
        config.scale,
      )}.`,
    );
  }

  return {
    employeeId: input.employeeId,
    currency: config.currency.toUpperCase(),
    baseEarnings: format(result.baseEarnings, config.scale),
    additionalEarnings: format(result.additionalEarnings, config.scale),
    taxableEarnings: format(result.taxableEarnings, config.scale),
    nonTaxableEarnings: format(result.nonTaxableEarnings, config.scale),
    grossPay: format(result.grossPay, config.scale),
    pensionableBase: format(result.pensionableBase, config.scale),
    employeePension: format(result.employeePension, config.scale),
    employerPension: format(result.employerPension, config.scale),
    taxableIncome: format(result.taxableIncome, config.scale),
    personalIncomeTax: format(result.personalIncomeTax, config.scale),
    otherDeductions: format(result.otherDeductions, config.scale),
    netSalary: format(result.netSalary, config.scale),
    employerCost: format(result.employerCost, config.scale),
    lines,
    ruleReferences: config.ruleReferences,
    warnings,
    errors,
    metadata: {
      salaryBasis: input.salaryBasis,
      iterationCount,
      ...(targetNet !== undefined
        ? { targetNet: format(targetNet, config.scale) }
        : {}),
    },
  };
}

export function calculateNetToGross(
  targetNet: string,
  input: Omit<PayrollCalculationInput, "salaryBasis" | "contractedAmount">,
  config: PayrollRuleConfiguration,
) {
  return calculatePayroll(
    { ...input, salaryBasis: "net-monthly", contractedAmount: targetNet },
    config,
  );
}

export interface PayslipSnapshot {
  runNumber: string;
  period: { name: string; startsOn: string; endsOn: string; paymentDate: string };
  company?: {
    legalName?: string;
    tradeName?: string;
    fiscalNumber?: string;
    uniqueBusinessNumber?: string;
    vatNumber?: string;
    address?: string;
    municipality?: string;
    country?: string;
    email?: string;
    phone?: string;
    logoUrl?: string;
  };
  employee: {
    employeeNumber?: string;
    firstName: string;
    lastName: string;
    position?: string;
    department?: string;
  };
  currency: string;
  grossPay: string | number;
  employeePension: string | number;
  employerPension: string | number;
  personalIncomeTax: string | number;
  otherDeductions: string | number;
  netSalary: string | number;
  employerCost: string | number;
  lines?: Array<{
    kind?: string;
    code?: string;
    label?: string;
    description?: string;
    amount?: string | number;
  }>;
  finalizedAt?: string;
}

export function renderPayslipHtml(
  snapshot: PayslipSnapshot,
  options: { language?: "sq" | "en"; verificationReference?: string } = {},
) {
  const language = options.language === "en" ? "en" : "sq";
  const labels = language === "sq"
    ? {
        title: "Fletëpagesa",
        period: "Periudha",
        employee: "Punonjësi",
        employeeNumber: "Numri i punonjësit",
        position: "Pozita",
        department: "Departamenti",
        earnings: "Të ardhurat",
        deductions: "Zbritjet dhe detyrimet",
        gross: "Paga bruto",
        employeePension: "Kontributi pensional i punonjësit",
        employerPension: "Kontributi pensional i punëdhënësit",
        tax: "Tatimi në të ardhurat personale",
        other: "Zbritje të tjera",
        net: "Paga neto",
        employerCost: "Kostoja e punëdhënësit",
        paymentDate: "Data e pagesës",
        verification: "Referenca e verifikimit",
      }
    : {
        title: "Payslip",
        period: "Period",
        employee: "Employee",
        employeeNumber: "Employee number",
        position: "Position",
        department: "Department",
        earnings: "Earnings",
        deductions: "Deductions and liabilities",
        gross: "Gross salary",
        employeePension: "Employee pension",
        employerPension: "Employer pension",
        tax: "Personal income tax",
        other: "Other deductions",
        net: "Net salary",
        employerCost: "Employer cost",
        paymentDate: "Payment date",
        verification: "Verification reference",
      };
  const currency = snapshot.currency || "EUR";
  const amount = (value: string | number) =>
    new Intl.NumberFormat("en-XK", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(Number(value || 0));
  const escape = (value: unknown) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  const detail = (label: string, value?: string) =>
    value ? `<div><small>${escape(label)}</small><strong>${escape(value)}</strong></div>` : "";
  const lines = (snapshot.lines || []).filter((line) => line.kind !== "statutory");
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><style>
    @page{size:A4;margin:14mm}*{box-sizing:border-box}body{margin:0;color:#0b1739;font:13px Arial,sans-serif}
    .sheet{min-height:269mm;display:flex;flex-direction:column}.head{display:flex;justify-content:space-between;border-bottom:2px solid #075cff;padding-bottom:18px}
    h1{margin:0;font-size:28px}.company{font-size:17px;font-weight:700}.muted,small{color:#667085}.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:22px 0}
    .meta div,.summary div{border:1px solid #d9e2ef;padding:12px}.meta small,.meta strong{display:block}.meta strong{margin-top:5px}
    h2{font-size:14px;margin:20px 0 8px}table{width:100%;border-collapse:collapse}th,td{padding:9px;border-bottom:1px solid #e6ebf1;text-align:left}th:last-child,td:last-child{text-align:right}
    .summary{margin:22px 0 0 auto;width:48%;display:grid}.summary div{display:flex;justify-content:space-between;border-bottom:0}.summary .net{border:2px solid #075cff;font-size:17px}
    footer{margin-top:auto;border-top:1px solid #d9e2ef;padding-top:12px;display:flex;justify-content:space-between;font-size:10px}
  </style></head><body><article class="sheet">
    <header class="head"><div><div class="company">${escape(snapshot.company?.legalName || snapshot.company?.tradeName || "OperiX")}</div><div class="muted">${escape(snapshot.company?.fiscalNumber || snapshot.company?.uniqueBusinessNumber || "")}</div></div><div><h1>${escape(labels.title)}</h1><div class="muted">${escape(snapshot.runNumber)}</div></div></header>
    <section class="meta">
      ${detail(labels.employee, `${snapshot.employee.firstName} ${snapshot.employee.lastName}`)}
      ${detail(labels.employeeNumber, snapshot.employee.employeeNumber)}
      ${detail(labels.position, snapshot.employee.position)}
      ${detail(labels.department, snapshot.employee.department)}
      ${detail(labels.period, `${snapshot.period.startsOn} – ${snapshot.period.endsOn}`)}
      ${detail(labels.paymentDate, snapshot.period.paymentDate)}
    </section>
    <h2>${escape(labels.earnings)}</h2>
    <table><thead><tr><th>${escape(language === "sq" ? "Përshkrimi" : "Description")}</th><th>${escape(language === "sq" ? "Shuma" : "Amount")}</th></tr></thead><tbody>
      ${lines.length ? lines.map((line) => `<tr><td>${escape(line.label || line.description || line.code)}</td><td>${escape(amount(line.amount || 0))}</td></tr>`).join("") : `<tr><td>${escape(labels.gross)}</td><td>${escape(amount(snapshot.grossPay))}</td></tr>`}
    </tbody></table>
    <section class="summary">
      <div><span>${escape(labels.gross)}</span><strong>${escape(amount(snapshot.grossPay))}</strong></div>
      <div><span>${escape(labels.employeePension)}</span><strong>${escape(amount(snapshot.employeePension))}</strong></div>
      <div><span>${escape(labels.tax)}</span><strong>${escape(amount(snapshot.personalIncomeTax))}</strong></div>
      <div><span>${escape(labels.other)}</span><strong>${escape(amount(snapshot.otherDeductions))}</strong></div>
      <div class="net"><span>${escape(labels.net)}</span><strong>${escape(amount(snapshot.netSalary))}</strong></div>
      <div><span>${escape(labels.employerPension)}</span><strong>${escape(amount(snapshot.employerPension))}</strong></div>
      <div><span>${escape(labels.employerCost)}</span><strong>${escape(amount(snapshot.employerCost))}</strong></div>
    </section>
    <footer><span>${escape(snapshot.company?.address || "")}</span><span>${escape(labels.verification)}: ${escape(options.verificationReference || "")}</span></footer>
  </article></body></html>`;
}
