import Stripe from "stripe";
import { afterEach, describe, expect, it } from "vitest";
import { buildInvoiceCheckoutParams, buildInvoicePortalParams, getStripeClient, getStripePriceIds, previewFromSummary } from "./server";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("Invoice server billing contracts", () => {
  it("selects a complete interval-specific price set without exposing it to clients", () => {
    process.env.STRIPE_INVOICE_MONTHLY_PRICE_ID = "price_monthly_base";
    process.env.STRIPE_TENANT_MONTHLY_PRICE_ID = "price_monthly_tenant";
    process.env.STRIPE_USER_MONTHLY_PRICE_ID = "price_monthly_user";
    process.env.STRIPE_INVOICE_ANNUAL_PRICE_ID = "price_annual_base";
    process.env.STRIPE_TENANT_ANNUAL_PRICE_ID = "price_annual_tenant";
    process.env.STRIPE_USER_ANNUAL_PRICE_ID = "price_annual_user";
    expect(getStripePriceIds("monthly")).toEqual({ base: "price_monthly_base", additionalTenant: "price_monthly_tenant", additionalUser: "price_monthly_user" });
    expect(getStripePriceIds("annual")).toEqual({ base: "price_annual_base", additionalTenant: "price_annual_tenant", additionalUser: "price_annual_user" });
  });

  it("builds exact server-side billing previews from authoritative usage", () => {
    const preview = previewFromSummary({ total_tenants: 3, total_users: 5 } as never, "annual");
    expect(preview.lineItems.map((item) => item.amount)).toEqual(["29.99", "39.98", "39.96"]);
    expect(preview.total).toBe("109.93");
  });

  it("builds Checkout with the selected interval and only positive add-on quantities", () => {
    process.env.STRIPE_INVOICE_ANNUAL_PRICE_ID = "price_annual_base";
    process.env.STRIPE_TENANT_ANNUAL_PRICE_ID = "price_annual_tenant";
    process.env.STRIPE_USER_ANNUAL_PRICE_ID = "price_annual_user";
    const preview = previewFromSummary({ total_tenants: 3, total_users: 5 } as never, "annual");
    const params = buildInvoiceCheckoutParams({
      customerId: "cus_test",
      rootCompanyId: "company_test",
      interval: "annual",
      preview,
      successUrl: "https://invoice.test/settings?tab=billing&checkout=success",
      cancelUrl: "https://invoice.test/settings?tab=billing&checkout=cancelled",
      allowPromotionCodes: false,
      automaticTax: false,
    });
    expect(params.line_items).toEqual([
      { price: "price_annual_base", quantity: 1 },
      { price: "price_annual_tenant", quantity: 2 },
      { price: "price_annual_user", quantity: 4 },
    ]);
    expect(params.metadata).toMatchObject({ operix_company_id: "company_test", operix_billing_interval: "annual" });
    expect(params.subscription_data?.metadata).toMatchObject({ operix_company_id: "company_test", operix_product: "invoice" });
    expect(params.automatic_tax).toBeUndefined();
  });

  it("builds a Customer Portal session without exposing payment details", () => {
    expect(buildInvoicePortalParams({ customerId: "cus_test", returnUrl: "https://invoice.test/settings?tab=billing", configurationId: "bpc_test" })).toEqual({
      customer: "cus_test",
      return_url: "https://invoice.test/settings?tab=billing",
      configuration: "bpc_test",
    });
  });

  it("validates Stripe webhook signatures without a network call", () => {
    const stripe = new Stripe("sk_test_billing_contract", { apiVersion: "2026-07-29.dahlia" });
    const payload = JSON.stringify({ id: "evt_invoice_test", object: "event", api_version: "2026-07-29.dahlia", created: 1_700_000_000, livemode: false, pending_webhooks: 1, request: null, type: "invoice.paid", data: { object: {} } });
    const secret = "whsec_invoice_contract";
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(stripe.webhooks.constructEvent(payload, signature, secret)).toMatchObject({ id: "evt_invoice_test", type: "invoice.paid" });
    expect(() => stripe.webhooks.constructEvent(payload, signature.replace(/v1=[^,]+/, "v1=invalid"), secret)).toThrow();
  });

  it("creates a server Stripe client only when a secret exists", () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect(getStripeClient()).toBeNull();
    process.env.STRIPE_SECRET_KEY = "sk_test_billing_contract";
    expect(getStripeClient()).toBeInstanceOf(Stripe);
  });
});
