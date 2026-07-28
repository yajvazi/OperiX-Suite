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
