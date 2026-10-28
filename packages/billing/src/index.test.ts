import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateBillingPreview,
  calculateSubscriptionPrice,
  getProductEntitlementDecision,
  isBillableTenant,
  isBillableUser,
  planEntitlements,
  separatePlanMonthlyTotal,
  subscriptionHasFullAccess,
} from "./index";

test("uses the exact Invoice prices", () => {
  assert.equal(calculateSubscriptionPrice({ plan: "invoice", interval: "monthly", totalTenants: 1, totalActiveUsers: 1 }).total, "2.99");
  assert.equal(calculateSubscriptionPrice({ plan: "invoice", interval: "annual", totalTenants: 1, totalActiveUsers: 1 }).total, "29.99");
  assert.equal(calculateSubscriptionPrice({ plan: "invoice", interval: "monthly", totalTenants: 3, totalActiveUsers: 5 }).total, "10.93");
});

test("uses the exact Booking and Suite prices", () => {
  assert.equal(calculateSubscriptionPrice({ plan: "booking", interval: "monthly", totalTenants: 1, totalActiveUsers: 1 }).total, "4.99");
  assert.equal(calculateSubscriptionPrice({ plan: "booking", interval: "annual", totalTenants: 1, totalActiveUsers: 1 }).total, "49.99");
  assert.equal(calculateSubscriptionPrice({ plan: "suite", interval: "monthly", totalTenants: 3, totalActiveUsers: 5 }).total, "12.93");
  assert.equal(calculateSubscriptionPrice({ plan: "suite", interval: "annual", totalTenants: 3, totalActiveUsers: 5 }).total, "129.93");
});

test("uses one shared Suite quantity set and compares separate plans", () => {
  const preview = calculateBillingPreview({ plan: "suite", interval: "monthly", totalTenants: 3, totalActiveUsers: 5 });
  assert.equal(preview.billableTenants, 2);
  assert.equal(preview.billableUsers, 4);
  assert.equal(separatePlanMonthlyTotal(1, 1), "7.98");
  assert.equal(separatePlanMonthlyTotal(3, 5), "23.86");
});

test("calculates included and billable quantities", () => {
  assert.equal(calculateBillingPreview({ interval: "monthly", totalTenants: 1, totalActiveUsers: 1 }).billableTenants, 0);
  assert.equal(calculateBillingPreview({ interval: "monthly", totalTenants: 2, totalActiveUsers: 5 }).billableTenants, 1);
  assert.equal(calculateBillingPreview({ interval: "monthly", totalTenants: 3, totalActiveUsers: 5 }).billableTenants, 2);
  assert.equal(calculateBillingPreview({ interval: "monthly", totalTenants: 3, totalActiveUsers: 1 }).billableUsers, 0);
  assert.equal(calculateBillingPreview({ interval: "monthly", totalTenants: 3, totalActiveUsers: 5 }).billableUsers, 4);
});

test("excludes non-billable tenants and users", () => {
  assert.equal(isBillableTenant({ status: "active" }), true);
  assert.equal(isBillableTenant({ status: "archived" }), false);
  assert.equal(isBillableTenant({ deletedAt: "2026-01-01" }), false);
  assert.equal(isBillableTenant({ isInternal: true }), false);
  assert.equal(isBillableTenant({ isDemo: true }), false);

  assert.equal(isBillableUser({ status: "active", accepted: true, role: "admin" }), true);
  assert.equal(isBillableUser({ status: "active", accepted: false, role: "employee" }), false);
  assert.equal(isBillableUser({ status: "pending", accepted: true, role: "employee" }), false);
  assert.equal(isBillableUser({ status: "active", disabled: true, role: "employee" }), false);
  assert.equal(isBillableUser({ status: "active", deleted: true, role: "employee" }), false);
  assert.equal(isBillableUser({ status: "active", role: "super_admin" }), false);
  assert.equal(isBillableUser({ status: "active", isServiceAccount: true, role: "employee" }), false);
  assert.equal(isBillableUser({ status: "active", isAutomationUser: true, role: "employee" }), false);
  assert.equal(isBillableUser({ status: "active", isSystemUser: true, role: "employee" }), false);
});

test("maps plan entitlements without unlocking unrelated products", () => {
  assert.deepEqual(planEntitlements("invoice"), { invoice: true, booking: false, hr: false, desk: false });
  assert.deepEqual(planEntitlements("booking"), { invoice: false, booking: true, hr: false, desk: false });
  assert.deepEqual(planEntitlements("suite"), { invoice: true, booking: true, hr: false, desk: false });
});

test("applies trial, cancellation, grace, and product entitlement rules", () => {
  const now = new Date("2026-08-24T00:00:00.000Z");
  assert.equal(subscriptionHasFullAccess({ status: "trialing", trialEndsAt: "2026-08-30T00:00:00.000Z", now }), true);
  assert.equal(subscriptionHasFullAccess({ status: "trialing", trialEndsAt: "2026-08-23T00:00:00.000Z", now }), false);
  assert.equal(subscriptionHasFullAccess({ status: "canceled", currentPeriodEnd: "2026-08-25T00:00:00.000Z", now }), true);
  assert.equal(subscriptionHasFullAccess({ status: "past_due", gracePeriodEndsAt: "2026-08-25T00:00:00.000Z", now }), true);
  assert.equal(subscriptionHasFullAccess({ status: "unpaid", now }), false);
  assert.equal(getProductEntitlementDecision("booking", "canCreateBooking", { status: "active", entitlements: { booking: false }, now }).allowed, false);
  assert.equal(getProductEntitlementDecision("booking", "canCreateBooking", { status: "active", entitlements: { booking: true }, now }).allowed, true);
  assert.equal(getProductEntitlementDecision("hr", "canView", { status: "active", entitlements: { hr: true }, now }).allowed, true);
  assert.equal(getProductEntitlementDecision("booking", "canCreateBooking", { status: "expired", entitlements: { booking: false }, now }).allowed, false);
  assert.equal(getProductEntitlementDecision("booking", "canView", { status: "expired", entitlements: { booking: false }, now }).allowed, true);
});
