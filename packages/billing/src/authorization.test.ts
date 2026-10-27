import assert from "node:assert/strict";
import test from "node:test";
import { canAccessProduct, hasProductEntitlement, isProductEntitlementActive } from "./authorization";

const now = new Date("2026-08-24T00:00:00.000Z");

test("enterprise entitlement requires an enabled, non-expired record", () => {
  assert.equal(hasProductEntitlement([{ product: "hr", source: "enterprise_contract", enabled: true, starts_at: "2026-08-23T00:00:00Z" }], "hr", now), true);
  assert.equal(hasProductEntitlement([{ product: "hr", source: "subscription", enabled: true }], "hr", now), false);
  assert.equal(hasProductEntitlement([{ product: "desk", source: "enterprise_contract", enabled: true }], "desk", now), true);
  assert.equal(hasProductEntitlement([{ product: "hr", source: "enterprise_contract", enabled: true, ends_at: "2026-08-23T00:00:00Z" }], "hr", now), false);
  assert.equal(hasProductEntitlement([{ product: "hr", enabled: false }], "hr", now), false);
  assert.equal(isProductEntitlementActive({ product: "desk", enabled: true, starts_at: "2026-08-25T00:00:00Z" }, now), false);
});

test("product entitlement and role permission are both required", () => {
  const records = [{ product: "hr", source: "enterprise_contract", enabled: true }];
  assert.equal(canAccessProduct({ entitlements: records, product: "hr", roleAllowed: true, now }), true);
  assert.equal(canAccessProduct({ entitlements: records, product: "hr", roleAllowed: false, now }), false);
  assert.equal(canAccessProduct({ entitlements: records, product: "desk", roleAllowed: true, now }), false);
});
