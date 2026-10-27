import assert from "node:assert/strict";
import test from "node:test";
import { buildCheckoutParams, buildPlanChangeItems, buildPortalParams, getStripePriceIds, isSupersededStripeSubscription, stripePlanFromSubscription, stripeSubscriptionOccupiesProductSlot } from "./server";
import { calculateSubscriptionPrice } from "./index";

const originalEnv = { ...process.env };

function restoreEnv() {
  process.env = { ...originalEnv };
}

test.afterEach(restoreEnv);

test("selects the server-only price set for every public plan and interval", () => {
  Object.assign(process.env, {
    STRIPE_INVOICE_MONTHLY_PRICE_ID: "price_invoice_monthly",
    STRIPE_INVOICE_ANNUAL_PRICE_ID: "price_invoice_annual",
    STRIPE_BOOKING_MONTHLY_PRICE_ID: "price_booking_monthly",
    STRIPE_BOOKING_ANNUAL_PRICE_ID: "price_booking_annual",
    STRIPE_SUITE_MONTHLY_PRICE_ID: "price_suite_monthly",
    STRIPE_SUITE_ANNUAL_PRICE_ID: "price_suite_annual",
    STRIPE_TENANT_MONTHLY_PRICE_ID: "price_tenant_monthly",
    STRIPE_TENANT_ANNUAL_PRICE_ID: "price_tenant_annual",
    STRIPE_USER_MONTHLY_PRICE_ID: "price_user_monthly",
    STRIPE_USER_ANNUAL_PRICE_ID: "price_user_annual",
  });
  assert.deepEqual(getStripePriceIds("invoice", "monthly"), { base: "price_invoice_monthly", additionalTenant: "price_tenant_monthly", additionalUser: "price_user_monthly" });
  assert.deepEqual(getStripePriceIds("booking", "annual"), { base: "price_booking_annual", additionalTenant: "price_tenant_annual", additionalUser: "price_user_annual" });
  assert.deepEqual(getStripePriceIds("suite", "monthly"), { base: "price_suite_monthly", additionalTenant: "price_tenant_monthly", additionalUser: "price_user_monthly" });
});

test("builds a Suite Checkout with one shared add-on quantity set", () => {
  Object.assign(process.env, {
    STRIPE_SUITE_ANNUAL_PRICE_ID: "price_suite_annual",
    STRIPE_TENANT_ANNUAL_PRICE_ID: "price_tenant_annual",
    STRIPE_USER_ANNUAL_PRICE_ID: "price_user_annual",
  });
  const preview = calculateSubscriptionPrice({ plan: "suite", interval: "annual", totalTenants: 3, totalActiveUsers: 5 });
  const params = buildCheckoutParams({
    customerId: "cus_test",
    rootCompanyId: "company_test",
    plan: "suite",
    requestedProduct: "suite",
    interval: "annual",
    preview,
    successUrl: "https://suite.test/settings?checkout=success",
    cancelUrl: "https://suite.test/settings?checkout=cancelled",
    allowPromotionCodes: false,
    automaticTax: false,
  });
  assert.deepEqual(params.line_items, [
    { price: "price_suite_annual", quantity: 1 },
    { price: "price_tenant_annual", quantity: 2 },
    { price: "price_user_annual", quantity: 4 },
  ]);
  assert.deepEqual(params.metadata, { operix_company_id: "company_test", operix_plan: "suite", operix_product: "suite", operix_billing_interval: "annual" });
  assert.match(params.integration_identifier, /^operix_suite_[a-z]+$/);
});

test("does not create zero-quantity Checkout add-on items", () => {
  Object.assign(process.env, {
    STRIPE_BOOKING_MONTHLY_PRICE_ID: "price_booking_monthly",
    STRIPE_TENANT_MONTHLY_PRICE_ID: "price_tenant_monthly",
    STRIPE_USER_MONTHLY_PRICE_ID: "price_user_monthly",
  });
  const preview = calculateSubscriptionPrice({ plan: "booking", interval: "monthly", totalTenants: 1, totalActiveUsers: 1 });
  const params = buildCheckoutParams({
    customerId: "cus_test",
    rootCompanyId: "company_test",
    plan: "booking",
    requestedProduct: "booking",
    interval: "monthly",
    preview,
    successUrl: "https://booking.test/settings?checkout=success",
    cancelUrl: "https://booking.test/settings?checkout=cancelled",
    allowPromotionCodes: false,
    automaticTax: false,
  });
  assert.deepEqual(params.line_items, [{ price: "price_booking_monthly", quantity: 1 }]);
});

test("builds a Customer Portal request without payment data", () => {
  assert.deepEqual(buildPortalParams({ customerId: "cus_test", returnUrl: "https://booking.test/settings?tab=billing", configurationId: "bpc_test" }), {
    customer: "cus_test",
    return_url: "https://booking.test/settings?tab=billing",
    configuration: "bpc_test",
  });
});

test("changes base and shared add-ons to the same annual interval", () => {
  Object.assign(process.env, {
    STRIPE_INVOICE_MONTHLY_PRICE_ID: "price_invoice_monthly",
    STRIPE_INVOICE_ANNUAL_PRICE_ID: "price_invoice_annual",
    STRIPE_SUITE_ANNUAL_PRICE_ID: "price_suite_annual",
    STRIPE_TENANT_MONTHLY_PRICE_ID: "price_tenant_monthly",
    STRIPE_TENANT_ANNUAL_PRICE_ID: "price_tenant_annual",
    STRIPE_USER_MONTHLY_PRICE_ID: "price_user_monthly",
    STRIPE_USER_ANNUAL_PRICE_ID: "price_user_annual",
  });
  const items = buildPlanChangeItems({ items: { data: [
    { id: "si_base", quantity: 1, price: { id: "price_invoice_monthly" } },
    { id: "si_tenants", quantity: 2, price: { id: "price_tenant_monthly" } },
    { id: "si_users", quantity: 4, price: { id: "price_user_monthly" } },
  ] } } as unknown as import("stripe").default.Subscription, "si_base", "suite", "annual");
  assert.deepEqual(items, [
    { id: "si_base", price: "price_suite_annual", quantity: 1 },
    { id: "si_tenants", price: "price_tenant_annual", quantity: 2 },
    { id: "si_users", price: "price_user_annual", quantity: 4 },
  ]);
});

test("does not block a new product Checkout after a canceled period ends", () => {
  assert.equal(stripeSubscriptionOccupiesProductSlot({ stripe_subscription_id: "sub_active", status: "active" }), true);
  assert.equal(stripeSubscriptionOccupiesProductSlot({ stripe_subscription_id: "sub_past_due", status: "past_due" }), true);
  assert.equal(stripeSubscriptionOccupiesProductSlot({ stripe_subscription_id: "sub_canceled", status: "canceled", current_period_end: new Date(Date.now() + 86_400_000).toISOString() }), true);
  assert.equal(stripeSubscriptionOccupiesProductSlot({ stripe_subscription_id: "sub_expired", status: "canceled", current_period_end: new Date(Date.now() - 86_400_000).toISOString() }), false);
  assert.equal(stripeSubscriptionOccupiesProductSlot({ stripe_subscription_id: "sub_terminal", status: "incomplete_expired" }), false);
});

test("derives a webhook plan from a configured Stripe base price, not metadata alone", () => {
  Object.assign(process.env, {
    STRIPE_INVOICE_MONTHLY_PRICE_ID: "price_invoice_monthly",
    STRIPE_SUITE_MONTHLY_PRICE_ID: "price_suite_monthly",
  });
  const invoiceSubscription = { metadata: { operix_plan: "suite" }, items: { data: [{ price: { id: "price_invoice_monthly" } }] } } as unknown as import("stripe").default.Subscription;
  const unknownSubscription = { metadata: { operix_plan: "invoice" }, items: { data: [{ price: { id: "price_external" } }] } } as unknown as import("stripe").default.Subscription;
  assert.equal(stripePlanFromSubscription(invoiceSubscription), "invoice");
  assert.equal(stripePlanFromSubscription(unknownSubscription), null);
  assert.equal(isSupersededStripeSubscription("sub_old", { superseded_stripe_subscription_id: "sub_old" }), true);
  assert.equal(isSupersededStripeSubscription("sub_new", { superseded_stripe_subscription_id: "sub_old" }), false);
});
