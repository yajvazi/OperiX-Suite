import assert from "node:assert/strict";
import test from "node:test";
import { decidePaywall } from "./paywall.ts";

test("an active subscription is paid", () => {
  assert.deepEqual(decidePaywall({ status: "active", restricted: false, billing_management_allowed: true }), { requiresPayment: false, reason: "paid", canPay: true });
});

test("a trial, an expired or cancelled subscription, and no subscription all require payment", () => {
  for (const status of ["trialing", "canceled", "expired", "unpaid", "incomplete", "incomplete_expired", "paused", "", null, undefined]) {
    assert.equal(decidePaywall({ status, restricted: true }).requiresPayment, true, String(status));
  }
  assert.equal(decidePaywall(null).requiresPayment, true);
});

test("a payment that failed keeps working during the grace period", () => {
  assert.deepEqual(decidePaywall({ status: "past_due", restricted: false }), { requiresPayment: false, reason: "grace", canPay: false });
});

test("a restricted workspace needs payment even if the status looks active", () => {
  assert.equal(decidePaywall({ status: "active", restricted: true }).requiresPayment, true);
});

test("only administrators can pay", () => {
  assert.equal(decidePaywall({ status: "trialing", billing_management_allowed: false }).canPay, false);
  assert.equal(decidePaywall({ status: "trialing", billing_management_allowed: true }).canPay, true);
});
