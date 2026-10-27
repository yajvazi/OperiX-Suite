import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BILLING_CURRENCY,
  BILLING_PRICES,
  PLAN_DEFINITIONS,
  type BillingInterval,
  type BillingPreview,
} from "@invoice-monorepo/billing";
import {
  BillingError,
  buildCheckoutParams,
  buildPortalParams,
  createProductCheckoutSession,
  createApiAddonCheckoutSession,
  createProductPortalSession,
  expireProductTrials,
  getStripeClient,
  getStripePriceIds as getProductStripePriceIds,
  previewForPlan,
  processProductBillingSyncQueue,
  readProductBillingSummary,
  reconcilePaymentEvent,
  reconcilePaymentIntentFailure,
  reconcileProductSubscription,
  reconcileApiAddonSubscription,
  syncProductSubscriptionQuantities,
  settleUserAccessOperation,
  previewUserAccessOperation,
  authorizeProductWorkspace,
  requestPlanChange,
  applyScheduledPlanChanges,
} from "@invoice-monorepo/billing/server";
import type { ProductBillingSummary } from "@invoice-monorepo/billing/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type InvoiceBillingSummary = ProductBillingSummary;
export type { UserAccessOperation, UserSeatBillingSettlement } from "@invoice-monorepo/billing/server";
export type BillingAuthorization = {
  workspace: Awaited<ReturnType<typeof authorizeProductWorkspace>>["workspace"];
  companyId: string;
  rootCompanyId: string;
  summary: InvoiceBillingSummary;
};

export { BillingError, BILLING_CURRENCY, getStripeClient };

export function getStripePriceIds(interval: BillingInterval) {
  return getProductStripePriceIds("invoice", interval);
}

export function buildInvoiceCheckoutParams(input: {
  customerId: string;
  rootCompanyId: string;
  interval: BillingInterval;
  preview: BillingPreview;
  successUrl: string;
  cancelUrl: string;
  allowPromotionCodes: boolean;
  automaticTax: boolean;
}) {
  return buildCheckoutParams({ ...input, plan: "invoice", requestedProduct: "invoice" });
}

export function buildInvoicePortalParams(input: { customerId: string; returnUrl: string; configurationId?: string }) {
  return buildPortalParams(input);
}

export function previewFromSummary(summary: Pick<InvoiceBillingSummary, "total_tenants" | "total_users">, interval: BillingInterval) {
  return previewForPlan(summary as InvoiceBillingSummary, "invoice", interval);
}

export async function readInvoiceBillingSummary(client: SupabaseClient, companyId: string) {
  return readProductBillingSummary(client, companyId, "invoice");
}

export async function authorizeInvoiceWorkspace(client: SupabaseClient, userId: string, requestedCompanyId?: string) {
  return authorizeProductWorkspace(client, userId, requestedCompanyId, "invoice", "billing.read");
}

export async function authorizeInvoiceBilling(client: SupabaseClient, userId: string, requestedCompanyId: string | undefined, permission: "billing.read" | "billing.manage") {
  return authorizeProductWorkspace(client, userId, requestedCompanyId, "invoice", permission);
}

export async function createInvoiceCheckoutSession(request: Request, client: SupabaseClient, userId: string, interval: BillingInterval, requestedCompanyId?: string) {
  return createInvoicePlanCheckoutSession(request, client, userId, "invoice", interval, requestedCompanyId);
}

export async function createInvoicePlanCheckoutSession(request: Request, client: SupabaseClient, userId: string, plan: "invoice" | "suite", interval: BillingInterval, requestedCompanyId?: string) {
  const admin = createAdminClient();
  if (!admin) throw new BillingError("Server billing storage is not configured.", 503);
  return createProductCheckoutSession(request, client, admin, userId, plan, plan, interval, requestedCompanyId);
}

export async function createInvoicePortalSession(request: Request, client: SupabaseClient, userId: string, requestedCompanyId?: string) {
  const admin = createAdminClient();
  if (!admin) throw new BillingError("Server billing storage is not configured.", 503);
  return createProductPortalSession(request, client, admin, userId, "invoice", requestedCompanyId);
}

export async function createInvoiceApiAddonCheckoutSession(request: Request, client: SupabaseClient, userId: string, requestedCompanyId?: string, eligibleProduct: "invoice" | "booking" | "suite" = "invoice") {
  const admin = createAdminClient();
  if (!admin) throw new BillingError("Server billing storage is not configured.", 503);
  return createApiAddonCheckoutSession(request, client, admin, userId, requestedCompanyId, eligibleProduct);
}

export async function reconcileInvoiceSubscription(subscription: Stripe.Subscription, eventType: string, stripeEventId?: string, eventCreated?: number) {
  const admin = createAdminClient();
  if (!admin) throw new BillingError("Server billing storage is not configured.", 503);
  return reconcileProductSubscription(admin, subscription, eventType, stripeEventId, eventCreated);
}

export async function reconcileInvoiceApiAddonSubscription(subscription: Stripe.Subscription, eventType: string, stripeEventId?: string, eventCreated?: number) {
  const admin = createAdminClient();
  if (!admin) throw new BillingError("Server billing storage is not configured.", 503);
  return reconcileApiAddonSubscription(admin, subscription, eventType, stripeEventId, eventCreated);
}

export async function reconcileInvoicePaymentEvent(invoice: Stripe.Invoice, eventType: "invoice.paid" | "invoice.payment_failed", stripeEventId?: string, eventCreated?: number) {
  const admin = createAdminClient();
  if (!admin) throw new BillingError("Server billing storage is not configured.", 503);
  return reconcilePaymentEvent(admin, invoice, eventType, stripeEventId, eventCreated);
}

export async function reconcileInvoicePaymentIntentFailure(paymentIntent: Stripe.PaymentIntent, stripeEventId?: string) {
  const admin = createAdminClient();
  if (!admin) throw new BillingError("Server billing storage is not configured.", 503);
  return reconcilePaymentIntentFailure(admin, paymentIntent, stripeEventId);
}

export async function syncInvoiceSubscriptionQuantities(rootCompanyId: string, source = "billing_sync") {
  const admin = createAdminClient();
  if (!admin) throw new BillingError("Server billing storage is not configured.", 503);
  const { data, error } = await admin.from("subscription_accounts").select("product").eq("company_id", rootCompanyId);
  if (error) throw new BillingError("Billing subscriptions could not be read.", 500);
  const results = [];
  for (const row of (data || []) as Array<{ product: "invoice" | "booking" | "suite" }>) {
    results.push(await syncProductSubscriptionQuantities(admin, rootCompanyId, row.product, source));
  }
  return { companyId: rootCompanyId, results, stripeUpdated: results.some((result) => result.stripeUpdated) };
}

export async function previewInvoiceUserAccessOperation(operationId: string) {
  const admin = createAdminClient();
  if (!admin) throw new BillingError("Server billing storage is not configured.", 503);
  return previewUserAccessOperation(admin, operationId);
}

export async function settleInvoiceUserAccessOperation(operationId: string) {
  const admin = createAdminClient();
  if (!admin) throw new BillingError("Server billing storage is not configured.", 503);
  return settleUserAccessOperation(admin, operationId);
}

export async function processInvoiceBillingSyncQueue(limit = 25) {
  const admin = createAdminClient();
  if (!admin) throw new BillingError("Server billing storage is not configured.", 503);
  return processProductBillingSyncQueue(admin, limit);
}

export async function expireInvoiceTrials() {
  const admin = createAdminClient();
  if (!admin) throw new BillingError("Server billing storage is not configured.", 503);
  return expireProductTrials(admin);
}

export async function changeInvoicePlan(request: Request, client: SupabaseClient, userId: string, currentPlan: "invoice" | "suite", targetPlan: "invoice" | "suite", interval?: BillingInterval, requestedCompanyId?: string) {
  const admin = createAdminClient();
  if (!admin) throw new BillingError("Server billing storage is not configured.", 503);
  return requestPlanChange(admin, client, request, userId, requestedCompanyId, currentPlan, targetPlan, interval);
}

export async function applyScheduledInvoicePlanChanges() {
  const admin = createAdminClient();
  if (!admin) throw new BillingError("Server billing storage is not configured.", 503);
  return applyScheduledPlanChanges(admin);
}

export function billingPriceDisplay(interval: BillingInterval) {
  return PLAN_DEFINITIONS.invoice.pricing[interval] || BILLING_PRICES[interval];
}
