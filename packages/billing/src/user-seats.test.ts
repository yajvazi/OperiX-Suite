import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";
import { buildUserSeatSubscriptionItems, userSeatProrationBehavior } from "./server";

const originalEnv = { ...process.env };

function restoreEnv() {
  process.env = { ...originalEnv };
}

function subscription(items: Array<{ id: string; price: string }>) {
  return { items: { data: items.map((item) => ({ id: item.id, price: { id: item.price } })) } } as unknown as Stripe.Subscription;
}

test.afterEach(restoreEnv);

test("updates one existing user-seat item and removes Stripe drift", () => {
  Object.assign(process.env, {
    STRIPE_USER_MONTHLY_PRICE_ID: "price_user_monthly",
    STRIPE_USER_ANNUAL_PRICE_ID: "price_user_annual",
  });
  assert.deepEqual(buildUserSeatSubscriptionItems(
    subscription([
      { id: "si_user_monthly", price: "price_user_monthly" },
      { id: "si_duplicate", price: "price_user_monthly" },
    ]),
    "price_user_annual",
    4,
  ), [
    { id: "si_user_monthly", price: "price_user_annual", quantity: 4 },
    { id: "si_duplicate", deleted: true },
  ]);
});

test("creates and removes the shared seat item at authoritative quantities", () => {
  Object.assign(process.env, {
    STRIPE_USER_MONTHLY_PRICE_ID: "price_user_monthly",
    STRIPE_USER_ANNUAL_PRICE_ID: "price_user_annual",
  });
  assert.deepEqual(buildUserSeatSubscriptionItems(subscription([]), "price_user_monthly", 2), [
    { price: "price_user_monthly", quantity: 2 },
  ]);
  assert.deepEqual(buildUserSeatSubscriptionItems(subscription([{ id: "si_user", price: "price_user_monthly" }]), "price_user_monthly", 0), [
    { id: "si_user", deleted: true },
  ]);
});

test("does not charge trial seats and invoices paid additions", () => {
  assert.equal(userSeatProrationBehavior("invite", true), "none");
  assert.equal(userSeatProrationBehavior("invite", false), "always_invoice");
  assert.equal(userSeatProrationBehavior("remove", false), "none");
});
