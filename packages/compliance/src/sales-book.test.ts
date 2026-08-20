import assert from "node:assert/strict";
import test from "node:test";
import {
  canTransitionSalesBookStatus,
  getSalesBookPeriod,
  normalizeBusinessDate,
  resolveSalesBookStrategy,
} from "./sales-book.ts";

const monthlyVat = {
  vatRegistrationStatus: "registered",
  reportingFrequency: "monthly",
};

test("generates Kosovo monthly periods and the following-month deadline", () => {
  assert.deepEqual(getSalesBookPeriod("2026-08-31", monthlyVat), {
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    declarationDeadline: "2026-09-20",
    reportingFrequency: "monthly",
    timezone: "Europe/Belgrade",
  });
});

test("handles December, leap February, and datetime timezone boundaries", () => {
  assert.equal(getSalesBookPeriod("2026-12-31", monthlyVat)?.declarationDeadline, "2027-01-20");
  assert.equal(getSalesBookPeriod("2024-02-29", monthlyVat)?.periodEnd, "2024-02-29");
  assert.equal(normalizeBusinessDate("2026-08-31T23:30:00-02:00"), "2026-09-01");
});

test("creates a Sales Book for non-VAT businesses when a reporting frequency is configured", () => {
  assert.equal(getSalesBookPeriod("2026-08-20", {
    vatRegistrationStatus: "not_registered",
    reportingFrequency: "monthly",
  })?.periodStart, "2026-08-01");
  assert.equal(resolveSalesBookStrategy({ vatRegistrationStatus: "not_registered", reportingFrequency: "monthly" }).enabled, true);
});

test("requires explicit tax configuration for registered businesses", () => {
  assert.throws(() => getSalesBookPeriod("2026-08-20", { vatRegistrationStatus: "registered" }), /not configured/);
});

test("enforces the no-reopen lifecycle", () => {
  assert.equal(canTransitionSalesBookStatus("OPEN", "READY_FOR_DECLARATION"), true);
  assert.equal(canTransitionSalesBookStatus("READY_FOR_DECLARATION", "DECLARED"), true);
  assert.equal(canTransitionSalesBookStatus("DECLARED", "AMENDED"), true);
  assert.equal(canTransitionSalesBookStatus("DECLARED", "OPEN"), false);
  assert.equal(canTransitionSalesBookStatus("AMENDED", "OPEN"), false);
});
