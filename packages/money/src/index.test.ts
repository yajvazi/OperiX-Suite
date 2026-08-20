import assert from "node:assert/strict";
import test from "node:test";
import {
  DecimalAmount,
  MoneyAmount,
  atomsToDecimal,
  calculateInvoice,
  decimalToAtoms,
  rescaleAtoms,
} from "./index.ts";

test("parses decimal strings without binary floating-point", () => {
  assert.equal(decimalToAtoms("10.20"), 1020n);
  assert.equal(decimalToAtoms("-0.01"), -1n);
  assert.equal(atomsToDecimal(1020n), "10.20");
});

test("supports deterministic half-up and half-even rounding", () => {
  assert.equal(decimalToAtoms("1.005", 2, "half-up"), 101n);
  assert.equal(decimalToAtoms("1.005", 2, "half-even"), 100n);
  assert.equal(decimalToAtoms("1.015", 2, "half-even"), 102n);
  assert.equal(rescaleAtoms(-1005n, 3, 2, "half-up"), -101n);
});

test("adds and multiplies exact decimal amounts", () => {
  const subtotal = DecimalAmount.from("12.00");
  const discountRate = DecimalAmount.from("0.15", 4);
  const discount = subtotal.multiply(discountRate, 2);

  assert.equal(discount.toString(), "1.80");
  assert.equal(subtotal.subtract(discount).toString(), "10.20");
});

test("serializes money as a decimal string and currency", () => {
  const total = MoneyAmount.fromDecimal("10.20", "eur")
    .add(MoneyAmount.fromDecimal("0.80", "EUR"));

  assert.deepEqual(total.toJSON(), { amount: "11.00", currency: "EUR" });
});

test("rejects unsafe or incompatible inputs", () => {
  assert.throws(() => decimalToAtoms("1e3"), /Invalid decimal/);
  assert.throws(
    () =>
      MoneyAmount.fromDecimal("1.00", "EUR").add(
        MoneyAmount.fromDecimal("1.00", "USD"),
      ),
    /same currency/,
  );
});

test("calculates the shared invoice example with transport", () => {
  const result = calculateInvoice({
    lines: [{ quantity: 10, unitPrice: 1.5, taxRate: 0 }],
    transport: { amount: 0.5, taxRate: 0 },
  });

  assert.equal(result.subtotal, 15);
  assert.equal(result.transport, 0.5);
  assert.equal(result.total, 15.5);
});

test("supports VAT, discounts, inclusive prices, and payment state", () => {
  const result = calculateInvoice({
    lines: [
      { quantity: 2, unitPrice: "100.00", discountPercent: 10, taxRate: 18 },
      { quantity: 1, unitPrice: "11.80", taxRate: 18, taxIncluded: true },
    ],
    documentDiscountPercent: 5,
    paidAmount: 100,
  });

  assert.equal(result.subtotal, 211.8);
  assert.equal(result.discount, 29.5);
  assert.equal(result.taxable, 180.5);
  assert.equal(result.tax, 32.49);
  assert.equal(result.total, 212.99);
  assert.equal(result.remaining, 112.99);
  assert.equal(result.change, 0);
});

test("exposes the effective POS discount after document allocation", () => {
  const result = calculateInvoice({
    lines: [{ quantity: 1, unitPrice: "11.80", taxRate: 18, taxIncluded: true }],
    documentDiscountAmount: "0.50",
  });

  assert.equal(result.lines[0].effectiveDiscountPercent, 5);
  assert.equal(result.total, 11.21);
});
