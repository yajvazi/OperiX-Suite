export type RoundingMode = "half-up" | "half-even" | "truncate";

const DECIMAL_PATTERN = /^[+-]?\d+(?:\.\d+)?$/;

function assertScale(scale: number) {
  if (!Number.isInteger(scale) || scale < 0 || scale > 18) {
    throw new RangeError("Decimal scale must be an integer between 0 and 18.");
  }
}

function powerOfTen(scale: number) {
  assertScale(scale);
  return 10n ** BigInt(scale);
}

function shouldRoundUp(
  retainedMagnitude: bigint,
  discarded: string,
  mode: RoundingMode,
) {
  if (!discarded || mode === "truncate") return false;

  const first = Number(discarded[0]);
  if (first > 5) return true;
  if (first < 5) return false;

  const isExactlyHalf = discarded.slice(1).split("").every((digit) => digit === "0");
  if (!isExactlyHalf || mode === "half-up") return true;
  return retainedMagnitude % 2n !== 0n;
}

export function decimalToAtoms(
  rawValue: string,
  scale = 2,
  rounding: RoundingMode = "half-up",
) {
  assertScale(scale);
  const value = rawValue.trim();
  if (!DECIMAL_PATTERN.test(value)) {
    throw new TypeError(`Invalid decimal value: ${rawValue}`);
  }

  const negative = value.startsWith("-");
  const unsigned = value.replace(/^[+-]/, "");
  const [whole, fraction = ""] = unsigned.split(".");
  const retainedFraction = fraction.slice(0, scale).padEnd(scale, "0");
  let magnitude =
    BigInt(whole) * powerOfTen(scale) + BigInt(retainedFraction || "0");

  if (shouldRoundUp(magnitude, fraction.slice(scale), rounding)) {
    magnitude += 1n;
  }

  return negative ? -magnitude : magnitude;
}

export function atomsToDecimal(atoms: bigint, scale = 2) {
  assertScale(scale);
  const negative = atoms < 0n;
  const magnitude = negative ? -atoms : atoms;
  const divisor = powerOfTen(scale);
  const whole = magnitude / divisor;
  const fraction = magnitude % divisor;
  const sign = negative && magnitude !== 0n ? "-" : "";

  if (scale === 0) return `${sign}${whole}`;
  return `${sign}${whole}.${fraction.toString().padStart(scale, "0")}`;
}

export function rescaleAtoms(
  atoms: bigint,
  fromScale: number,
  toScale: number,
  rounding: RoundingMode = "half-up",
) {
  assertScale(fromScale);
  assertScale(toScale);
  if (fromScale === toScale) return atoms;
  if (fromScale < toScale) return atoms * powerOfTen(toScale - fromScale);

  const divisor = powerOfTen(fromScale - toScale);
  const negative = atoms < 0n;
  const magnitude = negative ? -atoms : atoms;
  let retained = magnitude / divisor;
  const remainder = magnitude % divisor;

  if (remainder !== 0n && rounding !== "truncate") {
    const doubled = remainder * 2n;
    const aboveHalf = doubled > divisor;
    const atHalf = doubled === divisor;
    if (
      aboveHalf ||
      (atHalf && (rounding === "half-up" || retained % 2n !== 0n))
    ) {
      retained += 1n;
    }
  }

  return negative ? -retained : retained;
}

export class DecimalAmount {
  readonly atoms: bigint;
  readonly scale: number;

  private constructor(atoms: bigint, scale: number) {
    assertScale(scale);
    this.atoms = atoms;
    this.scale = scale;
  }

  static from(
    value: string,
    scale = 2,
    rounding: RoundingMode = "half-up",
  ) {
    return new DecimalAmount(decimalToAtoms(value, scale, rounding), scale);
  }

  static fromAtoms(atoms: bigint, scale = 2) {
    return new DecimalAmount(atoms, scale);
  }

  add(other: DecimalAmount) {
    this.assertCompatible(other);
    return DecimalAmount.fromAtoms(this.atoms + other.atoms, this.scale);
  }

  subtract(other: DecimalAmount) {
    this.assertCompatible(other);
    return DecimalAmount.fromAtoms(this.atoms - other.atoms, this.scale);
  }

  multiply(
    other: DecimalAmount,
    resultScale = this.scale,
    rounding: RoundingMode = "half-up",
  ) {
    return DecimalAmount.fromAtoms(
      rescaleAtoms(
        this.atoms * other.atoms,
        this.scale + other.scale,
        resultScale,
        rounding,
      ),
      resultScale,
    );
  }

  multiplyRatio(
    numerator: bigint,
    denominator: bigint,
    rounding: RoundingMode = "half-up",
  ) {
    if (denominator === 0n) throw new RangeError("Denominator cannot be zero.");
    const negative = (this.atoms < 0n) !== ((numerator < 0n) !== (denominator < 0n));
    const magnitude =
      (this.atoms < 0n ? -this.atoms : this.atoms) *
      (numerator < 0n ? -numerator : numerator);
    const divisor = denominator < 0n ? -denominator : denominator;
    let quotient = magnitude / divisor;
    const remainder = magnitude % divisor;

    if (remainder !== 0n && rounding !== "truncate") {
      const doubled = remainder * 2n;
      if (
        doubled > divisor ||
        (doubled === divisor &&
          (rounding === "half-up" || quotient % 2n !== 0n))
      ) {
        quotient += 1n;
      }
    }

    return DecimalAmount.fromAtoms(negative ? -quotient : quotient, this.scale);
  }

  toString() {
    return atomsToDecimal(this.atoms, this.scale);
  }

  toJSON() {
    return this.toString();
  }

  private assertCompatible(other: DecimalAmount) {
    if (other.scale !== this.scale) {
      throw new TypeError("Decimal amounts must use the same scale.");
    }
  }
}

export interface SerializedMoney {
  amount: string;
  currency: string;
}

export class MoneyAmount {
  readonly amount: DecimalAmount;
  readonly currency: string;

  private constructor(amount: DecimalAmount, currency: string) {
    const normalizedCurrency = currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
      throw new TypeError(`Invalid ISO 4217 currency: ${currency}`);
    }
    this.amount = amount;
    this.currency = normalizedCurrency;
  }

  static fromDecimal(
    value: string,
    currency = "EUR",
    scale = 2,
    rounding: RoundingMode = "half-up",
  ) {
    return new MoneyAmount(
      DecimalAmount.from(value, scale, rounding),
      currency,
    );
  }

  add(other: MoneyAmount) {
    this.assertCompatible(other);
    return new MoneyAmount(this.amount.add(other.amount), this.currency);
  }

  subtract(other: MoneyAmount) {
    this.assertCompatible(other);
    return new MoneyAmount(this.amount.subtract(other.amount), this.currency);
  }

  toJSON(): SerializedMoney {
    return { amount: this.amount.toString(), currency: this.currency };
  }

  private assertCompatible(other: MoneyAmount) {
    if (other.currency !== this.currency) {
      throw new TypeError("Money amounts must use the same currency.");
    }
  }
}

/**
 * A line as entered by either Invoice app. `unitPrice` is normally a
 * tax-exclusive price; set `taxIncluded` when a product/POS price is gross.
 */
export interface InvoiceCalculationLine {
  quantity: number | string;
  unitPrice: number | string;
  discountPercent?: number | string;
  taxRate?: number | string;
  taxIncluded?: boolean;
}

export interface InvoiceCharge {
  amount: number | string;
  taxRate?: number | string;
  taxIncluded?: boolean;
}

export interface InvoiceCalculationOptions {
  lines: readonly InvoiceCalculationLine[];
  documentDiscountPercent?: number | string;
  documentDiscountAmount?: number | string;
  shipping?: InvoiceCharge;
  transport?: InvoiceCharge;
  additionalFees?: InvoiceCharge;
  taxIncluded?: boolean;
  paidAmount?: number | string;
  currency?: string;
  scale?: number;
}

export interface CalculatedInvoiceLine {
  quantity: number;
  unitPrice: number;
  gross: number;
  discount: number;
  /** Effective percentage after line and document-level discounts. */
  effectiveDiscountPercent: number;
  taxable: number;
  tax: number;
  total: number;
}

export interface InvoiceCalculationResult {
  currency: string;
  scale: number;
  lines: CalculatedInvoiceLine[];
  subtotal: number;
  discount: number;
  taxable: number;
  tax: number;
  shipping: number;
  shippingTax: number;
  transport: number;
  transportTax: number;
  additionalFees: number;
  additionalFeesTax: number;
  feesTax: number;
  total: number;
  paid: number;
  remaining: number;
  change: number;
  paidInFull: boolean;
}

function decimalInput(value: number | string | undefined, fallback = "0") {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Financial values must be finite numbers.");
    // Avoid scientific notation because the exact parser intentionally only
    // accepts ordinary decimal strings.
    return value.toFixed(12).replace(/\.?0+$/, "") || "0";
  }
  return String(value).trim() || fallback;
}

function boundedRate(value: number | string | undefined) {
  const parsed = Number(decimalInput(value));
  if (!Number.isFinite(parsed)) throw new TypeError("Tax and discount rates must be finite numbers.");
  return Math.min(100, Math.max(0, parsed));
}

function moneyNumber(atoms: bigint, scale: number) {
  return Number(atomsToDecimal(rescaleAtoms(atoms, scale, 2), 2));
}

function addAtoms(values: readonly bigint[]) {
  return values.reduce((sum, value) => sum + value, 0n);
}

function percentageFromAtoms(value: bigint, base: bigint) {
  if (value <= 0n || base <= 0n) return 0;
  const percentage = Number(atomsToDecimal(value, 2)) / Number(atomsToDecimal(base, 2)) * 100;
  return Math.round(percentage * 10000) / 10000;
}

function calculateCharge(charge: InvoiceCharge | undefined, defaultTaxIncluded: boolean, scale: number) {
  if (!charge) return { amount: 0n, taxable: 0n, tax: 0n };
  const gross = DecimalAmount.from(decimalInput(charge.amount), scale).multiply(
    DecimalAmount.from("1", scale),
    2,
  );
  const rate = decimalToAtoms(decimalInput(charge.taxRate), 4);
  const included = charge.taxIncluded ?? defaultTaxIncluded;
  const taxable = included
    ? gross.multiplyRatio(1000000n, 1000000n + rate).atoms
    : gross.atoms;
  const tax = included
    ? gross.atoms - taxable
    : DecimalAmount.fromAtoms(taxable, 2).multiplyRatio(rate, 1000000n).atoms;
  return { amount: gross.atoms, taxable, tax };
}

/**
 * Calculates the canonical invoice representation used by Web and Mobile.
 *
 * `invoice_items.amount` is the post-discount, tax-exclusive line amount;
 * invoice `tax_amount` is the sum of rounded line taxes and `total_amount` is
 * taxable value plus tax plus charges. All intermediate monetary values are
 * integer minor units, so binary floating-point cannot change a persisted
 * total.
 */
export function calculateInvoice(options: InvoiceCalculationOptions): InvoiceCalculationResult {
  const scale = options.scale ?? 6;
  assertScale(scale);
  const defaultTaxIncluded = options.taxIncluded ?? false;
  const lines = options.lines.map((line) => {
    const quantityValue = Number(decimalInput(line.quantity));
    const unitPriceValue = Number(decimalInput(line.unitPrice));
    if (!Number.isFinite(quantityValue) || quantityValue < 0) throw new RangeError("Quantity cannot be negative.");
    if (!Number.isFinite(unitPriceValue) || unitPriceValue < 0) throw new RangeError("Unit price cannot be negative.");

    const quantity = DecimalAmount.from(decimalInput(line.quantity), scale);
    const unitPrice = DecimalAmount.from(decimalInput(line.unitPrice), scale);
    const gross = quantity.multiply(unitPrice, 2).atoms;
    const discountRate = decimalToAtoms(decimalInput(boundedRate(line.discountPercent)), 4);
    const discount = DecimalAmount.fromAtoms(gross, 2).multiplyRatio(discountRate, 1000000n).atoms;
    const afterDiscount = gross - discount;
    const taxRate = decimalToAtoms(decimalInput(boundedRate(line.taxRate)), 4);
    const included = line.taxIncluded ?? defaultTaxIncluded;
    const taxable = included
      ? DecimalAmount.fromAtoms(afterDiscount, 2).multiplyRatio(1000000n, 1000000n + taxRate).atoms
      : afterDiscount;
    // For tax-included prices, keep the entered gross amount exact and derive
    // VAT as the remainder after the rounded tax-exclusive amount.
    const tax = included
      ? afterDiscount - taxable
      : DecimalAmount.fromAtoms(taxable, 2).multiplyRatio(taxRate, 1000000n).atoms;

    return {
      quantity: quantityValue,
      unitPrice: unitPriceValue,
      gross,
      discount,
      taxable,
      tax,
      total: included ? afterDiscount : taxable + tax,
      taxRate,
      included,
    };
  });

  const lineGross = addAtoms(lines.map((line) => line.gross));
  const lineDiscount = addAtoms(lines.map((line) => line.discount));
  const lineTaxableBeforeDocumentDiscount = addAtoms(lines.map((line) => line.taxable));
  const requestedDocumentDiscount = options.documentDiscountAmount !== undefined
    ? DecimalAmount.from(decimalInput(options.documentDiscountAmount), 2).atoms
    : DecimalAmount.fromAtoms(
      decimalToAtoms(decimalInput(boundedRate(options.documentDiscountPercent)), 4),
      2,
    ).multiplyRatio(lineTaxableBeforeDocumentDiscount, 1000000n).atoms;
  const nonNegativeDocumentDiscount = requestedDocumentDiscount < 0n ? 0n : requestedDocumentDiscount;
  const nonNegativeTaxable = lineTaxableBeforeDocumentDiscount < 0n ? 0n : lineTaxableBeforeDocumentDiscount;
  const documentDiscount = nonNegativeDocumentDiscount < nonNegativeTaxable
    ? nonNegativeDocumentDiscount
    : nonNegativeTaxable;

  let allocatedDocumentDiscount = 0n;
  const calculatedLines = lines.map((line, index) => {
    const allocation = index === lines.length - 1
      ? documentDiscount - allocatedDocumentDiscount
      : lineTaxableBeforeDocumentDiscount === 0n
        ? 0n
        : DecimalAmount.fromAtoms(documentDiscount, 2).multiplyRatio(line.taxable, lineTaxableBeforeDocumentDiscount).atoms;
    allocatedDocumentDiscount += allocation;
    const taxable = line.taxable - allocation;
    const grossAfterAllDiscount = line.included
      ? allocation === 0n
        ? line.total
        : DecimalAmount.fromAtoms(taxable, 2).multiplyRatio(1000000n + line.taxRate, 1000000n).atoms
      : taxable;
    const tax = line.included
      ? grossAfterAllDiscount - taxable
      : DecimalAmount.fromAtoms(taxable, 2).multiplyRatio(line.taxRate, 1000000n).atoms;
    const effectiveDiscount = line.gross > grossAfterAllDiscount
      ? line.gross - grossAfterAllDiscount
      : 0n;
    return {
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      gross: moneyNumber(line.gross, 2),
      discount: moneyNumber(line.discount + allocation, 2),
      effectiveDiscountPercent: percentageFromAtoms(effectiveDiscount, line.gross),
      taxable: moneyNumber(taxable, 2),
      tax: moneyNumber(tax, 2),
      total: moneyNumber(grossAfterAllDiscount, 2),
    };
  });

  // Recalculate tax after a document-level discount. This keeps the persisted
  // invoice internally consistent when a global discount is entered.
  const lineTax = calculatedLines.map((line) => decimalToAtoms(decimalInput(line.tax), 2));
  const lineTaxTotal = addAtoms(lineTax);
  const shipping = calculateCharge(options.shipping, defaultTaxIncluded, scale);
  const transport = calculateCharge(options.transport, defaultTaxIncluded, scale);
  const additionalFees = calculateCharge(options.additionalFees, defaultTaxIncluded, scale);
  const feesTax = shipping.tax + transport.tax + additionalFees.tax;
  const taxable = addAtoms([
    ...calculatedLines.map((line) => decimalToAtoms(decimalInput(line.taxable), 2)),
    shipping.taxable,
    transport.taxable,
    additionalFees.taxable,
  ]);
  const tax = lineTaxTotal + feesTax;
  const total = taxable + tax;
  const requestedPaid = DecimalAmount.from(decimalInput(options.paidAmount), 2).atoms;
  const paid = requestedPaid < 0n ? 0n : requestedPaid;
  const remaining = total > paid ? total - paid : 0n;
  const change = paid > total ? paid - total : 0n;
  const currency = (options.currency || "EUR").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new TypeError("Currency must be a three-letter ISO code.");

  return {
    currency,
    scale: 2,
    lines: calculatedLines,
    subtotal: moneyNumber(lineGross, 2),
    discount: moneyNumber(lineDiscount + documentDiscount, 2),
    taxable: moneyNumber(taxable, 2),
    tax: moneyNumber(tax, 2),
    shipping: moneyNumber(shipping.amount, 2),
    shippingTax: moneyNumber(shipping.tax, 2),
    transport: moneyNumber(transport.amount, 2),
    transportTax: moneyNumber(transport.tax, 2),
    additionalFees: moneyNumber(additionalFees.amount, 2),
    additionalFeesTax: moneyNumber(additionalFees.tax, 2),
    feesTax: moneyNumber(feesTax, 2),
    total: moneyNumber(total, 2),
    paid: moneyNumber(paid, 2),
    remaining: moneyNumber(remaining, 2),
    change: moneyNumber(change, 2),
    paidInFull: total > 0n && paid >= total,
  };
}
