import assert from "node:assert/strict";
import test from "node:test";
import {
  DecimalAmount,
  MoneyAmount,
  atomsToDecimal,
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
