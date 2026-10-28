import { randomBytes } from "node:crypto";
import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveWorkspace, type WorkspaceScope } from "@invoice-monorepo/api/workspace";
import {
  BILLING_CURRENCY,
  API_ADDON_MONTHLY_PRICE,
  API_ADDON_PRICE_ENV,
  API_INCLUDED_REQUESTS,
  API_OVERAGE_PRICE,
  API_OVERAGE_REQUESTS,
  calculateSubscriptionPrice,
  hasProductEntitlement as hasProductEntitlementRecord,
  requireProductEntitlement as requireProductEntitlementRecord,
  normalizeSubscriptionStatus,
  type ProductEntitlementRecord,
  type BillingInterval,
  type BillingPreview,
  type PurchasablePlan,
} from "./index";

export type BillingClient = SupabaseClient;

export async function getProductEntitlements(client: BillingClient, companyId: string) {
  const { data, error } = await client.rpc("get_product_entitlements", { p_company_id: companyId });
  if (error) throw new BillingError("Unable to load product entitlements.", 502);
  return (data || []) as ProductEntitlementRecord[];
}

export async function hasProductEntitlement(client: BillingClient, companyId: string, product: PurchasablePlan | "hr" | "desk") {
  return hasProductEntitlementRecord(await getProductEntitlements(client, companyId), product);
}

export async function requireProductEntitlement(client: BillingClient, companyId: string, product: PurchasablePlan | "hr" | "desk") {
  try {
    return requireProductEntitlementRecord(await getProductEntitlements(client, companyId), product);
  } catch {
    throw new BillingError(`The ${product.toUpperCase()} product is not enabled for this organization.`, 403);
  }
}

export type ProductBillingSummary = {
  company_id: string;
  billing_account_company_id: string;
  requested_product: string;
  plan: PurchasablePlan | "enterprise" | null;
  product: string;
  entitlements: Record<string, boolean>;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string;
  billing_interval: BillingInterval | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  grace_period_ends_at: string | null;
  scheduled_plan: PurchasablePlan | null;
  scheduled_change_at: string | null;
  total_tenants: number;
  included_tenants: number;
  billable_tenants: number;
  total_users: number;
  included_users: number;
  billable_users: number;
  estimated_monthly_total: string | number | null;
  estimated_annual_total: string | number | null;
  restricted: boolean;
  billing_management_allowed: boolean;
  usage_updated_at: string | null;
};

export type BillingAuthorization = {
  workspace: WorkspaceScope;
  companyId: string;
  rootCompanyId: string;
  summary: ProductBillingSummary;
};

export class BillingError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "BillingError";
    this.status = status;
  }
}

function env(name: string) {
  return process.env[name]?.trim() || "";
}

function pastDueGraceDays() {
  const configured = Number.parseInt(env("STRIPE_PAST_DUE_GRACE_DAYS"), 10);
  return Number.isFinite(configured) && configured >= 0 ? Math.min(configured, 365) : 7;
}

type SubscriptionAccountState = {
  stripe_subscription_id?: string | null;
  status?: string | null;
  current_period_end?: string | null;
};

/**
 * A terminal account may be reused for a new Checkout session. All other
 * Stripe subscriptions still occupy the product slot, even when access is
 * restricted, so a customer cannot accidentally create parallel billing.
 */
export function stripeSubscriptionOccupiesProductSlot(account: SubscriptionAccountState) {
  if (!account.stripe_subscription_id) return false;
  const status = String(account.status || "").toLowerCase();
  if (status === "expired" || status === "incomplete_expired") return false;
  if (status === "canceled") {
    const periodEnd = account.current_period_end ? new Date(account.current_period_end).getTime() : Number.POSITIVE_INFINITY;
    return !Number.isFinite(periodEnd) || periodEnd > Date.now();
  }
  return true;
}

export function isSupersededStripeSubscription(subscriptionId: string, metadata: Record<string, unknown> | null | undefined) {
  return metadata?.superseded_stripe_subscription_id === subscriptionId;
}

export function getStripeClient() {
  const secretKey = env("STRIPE_SECRET_KEY");
  if (!secretKey) return null;
  const config: Stripe.StripeConfig = { maxNetworkRetries: 2, timeout: 20_000 };
  const configuredApiVersion = env("STRIPE_API_VERSION");
  if (configuredApiVersion) {
    (config as Stripe.StripeConfig & { apiVersion?: Stripe.LatestApiVersion }).apiVersion = configuredApiVersion as Stripe.LatestApiVersion;
  }
  return new Stripe(secretKey, config);
}

export function requireStripeClient() {
  const stripe = getStripeClient();
  if (!stripe) throw new BillingError("Stripe Billing is not configured for this environment.", 503);
  return stripe;
}

const priceEnv: Record<PurchasablePlan, Record<BillingInterval, string>> = {
  invoice: { monthly: "STRIPE_INVOICE_MONTHLY_PRICE_ID", annual: "STRIPE_INVOICE_ANNUAL_PRICE_ID" },
  booking: { monthly: "STRIPE_BOOKING_MONTHLY_PRICE_ID", annual: "STRIPE_BOOKING_ANNUAL_PRICE_ID" },
  suite: { monthly: "STRIPE_SUITE_MONTHLY_PRICE_ID", annual: "STRIPE_SUITE_ANNUAL_PRICE_ID" },
};

export function getStripePriceIds(plan: PurchasablePlan, interval: BillingInterval) {
  const values = {
    base: env(priceEnv[plan][interval]),
    additionalTenant: env(interval === "annual" ? "STRIPE_TENANT_ANNUAL_PRICE_ID" : "STRIPE_TENANT_MONTHLY_PRICE_ID"),
    additionalUser: env(interval === "annual" ? "STRIPE_USER_ANNUAL_PRICE_ID" : "STRIPE_USER_MONTHLY_PRICE_ID"),
  };
  if (!values.base || !values.additionalTenant || !values.additionalUser) throw new BillingError(`Stripe prices are not configured for ${plan} ${interval} billing.`, 503);
  return values;
}

function randomLetters(length = 8) {
  return randomBytes(length).toString("hex").replace(/[0-9]/g, "").slice(0, length).padEnd(length, "a");
}

export function buildCheckoutParams(input: {
  customerId: string;
  rootCompanyId: string;
  plan: PurchasablePlan;
  requestedProduct: "invoice" | "booking" | "suite";
  interval: BillingInterval;
  preview: BillingPreview;
  successUrl: string;
  cancelUrl: string;
  allowPromotionCodes: boolean;
  automaticTax: boolean;
}) {
  const prices = getStripePriceIds(input.plan, input.interval);
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [{ price: prices.base, quantity: 1 }];
  if (input.preview.billableTenants > 0) lineItems.push({ price: prices.additionalTenant, quantity: input.preview.billableTenants });
  if (input.preview.billableUsers > 0) lineItems.push({ price: prices.additionalUser, quantity: input.preview.billableUsers });
  const metadata = {
    operix_company_id: input.rootCompanyId,
    operix_plan: input.plan,
    operix_product: input.requestedProduct,
    operix_billing_interval: input.interval,
  };
  return {
    mode: "subscription" as const,
    customer: input.customerId,
    client_reference_id: input.rootCompanyId,
    line_items: lineItems,
    payment_method_collection: "always" as const,
    allow_promotion_codes: input.allowPromotionCodes,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata,
    subscription_data: { metadata },
    ...(input.automaticTax ? { automatic_tax: { enabled: true } } : {}),
    // Stripe requires an integration identifier on current API versions.
    integration_identifier: `operix_${input.plan}_${randomLetters(8)}`,
  } as Stripe.Checkout.SessionCreateParams & { integration_identifier: string };
}

export function buildApiAddonCheckoutParams(input: {
  customerId: string;
  rootCompanyId: string;
  successUrl: string;
  cancelUrl: string;
  allowPromotionCodes: boolean;
  automaticTax: boolean;
}) {
  const price = env(API_ADDON_PRICE_ENV);
  if (!price) throw new BillingError("The OperiX API Add-on price is not configured for this environment.", 503);
  const metadata = {
    operix_company_id: input.rootCompanyId,
    operix_product: "api_addon",
    operix_api_included_requests: String(API_INCLUDED_REQUESTS),
    operix_api_overage_price: API_OVERAGE_PRICE,
    operix_api_overage_requests: String(API_OVERAGE_REQUESTS),
  };
  return {
    mode: "subscription" as const,
    customer: input.customerId,
    client_reference_id: input.rootCompanyId,
    line_items: [{ price, quantity: 1 }],
    payment_method_collection: "always" as const,
    allow_promotion_codes: input.allowPromotionCodes,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata,
    subscription_data: { metadata },
    ...(input.automaticTax ? { automatic_tax: { enabled: true } } : {}),
    integration_identifier: `operix_api_addon_${randomLetters(8)}`,
  } as Stripe.Checkout.SessionCreateParams & { integration_identifier: string };
}

export function buildPortalParams(input: { customerId: string; returnUrl: string; configurationId?: string }) {
  return {
    customer: input.customerId,
    return_url: input.returnUrl,
    ...(input.configurationId ? { configuration: input.configurationId } : {}),
  } as Stripe.BillingPortal.SessionCreateParams;
}

export function previewForPlan(summary: ProductBillingSummary, plan: PurchasablePlan, interval: BillingInterval): BillingPreview {
  return calculateSubscriptionPrice({ plan, interval, totalTenants: summary.total_tenants, totalActiveUsers: summary.total_users });
}

export async function readProductBillingSummary(client: BillingClient, companyId: string, product: "invoice" | "booking" | "suite" | "hr" | "desk") {
  const { data, error } = await client.rpc("get_product_billing_summary", { p_company_id: companyId, p_product: product });
  if (error) throw new BillingError("Billing information is unavailable for this workspace.", 502);
  const row = (Array.isArray(data) ? data[0] : data) as ProductBillingSummary | undefined;
  if (!row?.billing_account_company_id) throw new BillingError("Billing information is unavailable for this workspace.", 404);
  return {
    ...row,
    total_tenants: Number(row.total_tenants || 0),
    included_tenants: Number(row.included_tenants || 1),
    billable_tenants: Number(row.billable_tenants || 0),
    total_users: Number(row.total_users || 0),
    included_users: Number(row.included_users || 1),
    billable_users: Number(row.billable_users || 0),
    entitlements: row.entitlements || {},
  } as ProductBillingSummary;
}

export async function authorizeProductWorkspace(client: BillingClient, userId: string, requestedCompanyId: string | undefined, product: "invoice" | "booking" | "suite" | "hr" | "desk", permission: "billing.read" | "billing.manage") {
  const workspace = await resolveWorkspace(client, userId, { includeSensitiveFields: false, membershipOnly: true });
  const companyId = requestedCompanyId || workspace.companyId;
  if (!companyId || !workspace.companyIds.includes(companyId)) throw new BillingError("The selected workspace is not accessible.", 403);
  const { data: allowed, error: permissionError } = await client.rpc("billing_has_permission", { p_company_id: companyId, p_permission: permission });
  if (permissionError) throw new BillingError("Billing authorization is unavailable.", 502);
  if (allowed !== true) throw new BillingError("You do not have permission to manage billing for this workspace.", 403);
  const summary = await readProductBillingSummary(client, companyId, product);
  return { workspace, companyId, rootCompanyId: summary.billing_account_company_id, summary } as BillingAuthorization;
}

async function getBillingAccounts(admin: BillingClient, rootCompanyId: string) {
  const { data, error } = await admin.from("subscription_accounts").select("*").eq("company_id", rootCompanyId).order("created_at");
  if (error) throw new BillingError("The workspace billing account is unavailable.", 500);
  return (data || []) as Array<Record<string, unknown> & { id: string; company_id: string; product: PurchasablePlan; stripe_customer_id: string | null; stripe_subscription_id: string | null; status: string; billing_interval: BillingInterval | null }>;
}

function safeReturnUrl(request: Request, path: string) {
  const configuredOrigin = env("BILLING_APP_URL") || env("NEXT_PUBLIC_OPERIX_APP_URL");
  try {
    const origin = new URL(configuredOrigin || request.url).origin;
    return `${origin}${path}`;
  } catch {
    return `${new URL(request.url).origin}${path}`;
  }
}

async function ensureStripeCustomer(stripe: Stripe, admin: BillingClient, rootCompanyId: string, plan: PurchasablePlan, email?: string | null, companyName?: string | null) {
  const accounts = await getBillingAccounts(admin, rootCompanyId);
  const existing = accounts.find((account) => account.stripe_customer_id)?.stripe_customer_id;
  if (existing) return existing;
  const customer = await stripe.customers.create({ email: email || undefined, name: companyName || undefined, metadata: { operix_company_id: rootCompanyId, operix_source: "operix_billing" } }, { idempotencyKey: `operix-customer-${rootCompanyId}` });
  const now = new Date().toISOString();
  const { error } = accounts.length
    ? await admin.from("subscription_accounts").update({ stripe_customer_id: customer.id, updated_at: now }).eq("company_id", rootCompanyId)
    : await admin.from("subscription_accounts").upsert({ company_id: rootCompanyId, product: plan, stripe_customer_id: customer.id, status: "trialing", trial_started_at: now, trial_ends_at: new Date(Date.now() + 14 * 86_400_000).toISOString(), source: "checkout", updated_at: now }, { onConflict: "company_id,product" });
  if (error && !/0 rows/i.test(error.message)) throw new BillingError("The Stripe customer could not be linked to the workspace.", 500);
  return customer.id;
}

async function openCheckout(stripe: Stripe, customerId: string, rootCompanyId: string, plan: PurchasablePlan, interval: BillingInterval) {
  const sessions = await stripe.checkout.sessions.list({ customer: customerId, status: "open", limit: 100 });
  const session = sessions.data.find((candidate) => candidate.mode === "subscription" && candidate.metadata?.operix_company_id === rootCompanyId && candidate.metadata?.operix_plan);
  if (!session) return null;
  if (session.metadata?.operix_plan !== plan || session.metadata?.operix_billing_interval !== interval) throw new BillingError("This workspace already has an open checkout. Complete or cancel it before choosing another plan.", 409);
  return session;
}

export async function createProductCheckoutSession(request: Request, client: BillingClient, admin: BillingClient, userId: string, product: "invoice" | "booking" | "suite", plan: PurchasablePlan, interval: BillingInterval, requestedCompanyId?: string) {
  const authorization = await authorizeProductWorkspace(client, userId, requestedCompanyId, product, "billing.manage");
  const accounts = await getBillingAccounts(admin, authorization.rootCompanyId);
  const activeSamePlan = accounts.find((account) => account.product === plan && stripeSubscriptionOccupiesProductSlot(account));
  const activeSuite = accounts.find((account) => account.product === "suite" && stripeSubscriptionOccupiesProductSlot(account));
  const activeOtherStandalone = accounts.find((account) => ["invoice", "booking"].includes(account.product) && account.product !== plan && stripeSubscriptionOccupiesProductSlot(account));
  if (activeSamePlan || activeSuite || (plan === "suite" && activeOtherStandalone)) {
    throw new BillingError("This workspace already has a paid subscription for the selected product. Use the plan change or Customer Portal flow.", 409);
  }
  const stripe = requireStripeClient();
  const customerId = await ensureStripeCustomer(stripe, admin, authorization.rootCompanyId, plan, authorization.workspace.user?.email, authorization.workspace.company?.company_name || authorization.workspace.company?.name);
  const existingCheckout = await openCheckout(stripe, customerId, authorization.rootCompanyId, plan, interval);
  const preview = previewForPlan(authorization.summary, plan, interval);
  if (existingCheckout) return { id: existingCheckout.id, url: existingCheckout.url, preview };
  const params = buildCheckoutParams({
    customerId,
    rootCompanyId: authorization.rootCompanyId,
    plan,
    requestedProduct: product,
    interval,
    preview,
    allowPromotionCodes: env("STRIPE_ALLOW_PROMOTION_CODES") === "true",
    automaticTax: env("STRIPE_AUTOMATIC_TAX_ENABLED") === "true",
    successUrl: `${safeReturnUrl(request, "/settings?tab=billing")}&checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${safeReturnUrl(request, "/settings?tab=billing")}&checkout=cancelled`,
  });
  const session = await stripe.checkout.sessions.create(params, { idempotencyKey: `operix-checkout-${authorization.rootCompanyId}-${plan}-${interval}-${Math.floor(Date.now() / 300_000)}` });
  await writeAudit(admin, authorization.rootCompanyId, "checkout_session_created", "billing_web", { session_id: session.id, plan, interval, total: preview.total }, undefined, userId);
  return { id: session.id, url: session.url, preview };
}

export async function createApiAddonCheckoutSession(request: Request, client: BillingClient, admin: BillingClient, userId: string, requestedCompanyId?: string, eligibleProduct: "invoice" | "booking" | "suite" = "invoice") {
  const authorization = await authorizeProductWorkspace(client, userId, requestedCompanyId, eligibleProduct, "billing.manage");
  const { data: baseAccess, error: baseAccessError } = await client.rpc("api_check_base_product_access", {
    p_company_id: authorization.companyId,
    p_product: eligibleProduct,
  });
  if (baseAccessError) throw new BillingError("API Add-on eligibility could not be verified.", 502);
  if (baseAccess !== true) throw new BillingError("An active OperiX Invoice, Booking, or Suite subscription is required before adding API access.", 403);

  const { data: addon, error: addonError } = await admin.from("api_addon_subscriptions").select("status,stripe_subscription_id").eq("company_id", authorization.rootCompanyId).maybeSingle();
  if (addonError) throw new BillingError("API Add-on billing state is unavailable.", 502);
  if (addon?.stripe_subscription_id && ["trialing", "active", "past_due", "unpaid", "incomplete"].includes(String(addon.status))) {
    throw new BillingError("This workspace already has an OperiX API Add-on subscription.", 409);
  }

  const stripe = requireStripeClient();
  const customerId = await ensureStripeCustomer(
    stripe,
    admin,
    authorization.rootCompanyId,
    eligibleProduct,
    authorization.workspace.user?.email,
    authorization.workspace.company?.company_name || authorization.workspace.company?.name,
  );
  const openSessions = await stripe.checkout.sessions.list({ customer: customerId, status: "open", limit: 100 });
  const existingCheckout = openSessions.data.find((session) => session.mode === "subscription" && session.metadata?.operix_company_id === authorization.rootCompanyId && session.metadata?.operix_product === "api_addon");
  if (existingCheckout) return { id: existingCheckout.id, url: existingCheckout.url, monthlyPrice: API_ADDON_MONTHLY_PRICE, includedRequests: API_INCLUDED_REQUESTS };

  const params = buildApiAddonCheckoutParams({
    customerId,
    rootCompanyId: authorization.rootCompanyId,
    allowPromotionCodes: env("STRIPE_ALLOW_PROMOTION_CODES") === "true",
    automaticTax: env("STRIPE_AUTOMATIC_TAX_ENABLED") === "true",
    successUrl: `${safeReturnUrl(request, "/settings?tab=developers")}&checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${safeReturnUrl(request, "/settings?tab=developers")}&checkout=cancelled`,
  });
  const session = await stripe.checkout.sessions.create(params, { idempotencyKey: `operix-api-addon-checkout-${authorization.rootCompanyId}-${Math.floor(Date.now() / 300_000)}` });
  await writeAudit(admin, authorization.rootCompanyId, "api_addon_checkout_session_created", "billing_web", { session_id: session.id, monthly_price: API_ADDON_MONTHLY_PRICE, included_requests: API_INCLUDED_REQUESTS, automatic_overage_charging: false }, undefined, userId);
  return { id: session.id, url: session.url, monthlyPrice: API_ADDON_MONTHLY_PRICE, includedRequests: API_INCLUDED_REQUESTS };
}

export async function createProductPortalSession(request: Request, client: BillingClient, admin: BillingClient, userId: string, product: "invoice" | "booking" | "suite", requestedCompanyId?: string) {
  const authorization = await authorizeProductWorkspace(client, userId, requestedCompanyId, product, "billing.manage");
  const accounts = await getBillingAccounts(admin, authorization.rootCompanyId);
  const customerId = accounts.find((account) => account.stripe_customer_id)?.stripe_customer_id;
  if (!customerId) throw new BillingError("No Stripe customer exists for this workspace yet.", 409);
  const stripe = requireStripeClient();
  const session = await stripe.billingPortal.sessions.create(buildPortalParams({ customerId, returnUrl: safeReturnUrl(request, "/settings?tab=billing"), configurationId: env("STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID") || undefined }));
  await writeAudit(admin, authorization.rootCompanyId, "customer_portal_session_created", "billing_web", { portal_session_id: session.id, product }, undefined, userId);
  return { url: session.url };
}

function stripeCustomerId(value: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined) {
  return typeof value === "string" ? value : value?.id || null;
}

export function stripePlanFromSubscription(subscription: Stripe.Subscription): PurchasablePlan | null {
  // Metadata is useful for reconciliation, but a Stripe subscription must
  // contain one of OperiX's configured base prices before it can affect the
  // product ledger. This prevents a metadata-only or tampered event from
  // selecting a different product plan.
  for (const plan of ["invoice", "booking", "suite"] as const) {
    for (const interval of ["monthly", "annual"] as const) {
      const base = env(priceEnv[plan][interval]);
      if (base && subscription.items.data.some((item) => item.price.id === base)) return plan;
    }
  }
  return null;
}

function subscriptionInterval(subscription: Stripe.Subscription, plan: PurchasablePlan): BillingInterval | null {
  const baseIds = [env(priceEnv[plan].monthly), env(priceEnv[plan].annual)].filter(Boolean);
  const base = subscription.items.data.find((item) => baseIds.includes(item.price.id));
  if (!base) return null;
  return base.price.id === env(priceEnv[plan].annual) || base.price.recurring?.interval === "year" ? "annual" : "monthly";
}

function subscriptionPeriod(subscription: Stripe.Subscription, plan: PurchasablePlan) {
  const baseIds = [env(priceEnv[plan].monthly), env(priceEnv[plan].annual)].filter(Boolean);
  const item = subscription.items.data.find((candidate) => baseIds.includes(candidate.price.id)) || subscription.items.data[0];
  return { start: item?.current_period_start || null, end: item?.current_period_end || null };
}

function sharedAddonRole(priceId: string) {
  if ([env("STRIPE_TENANT_MONTHLY_PRICE_ID"), env("STRIPE_TENANT_ANNUAL_PRICE_ID")].includes(priceId)) return "tenant" as const;
  if ([env("STRIPE_USER_MONTHLY_PRICE_ID"), env("STRIPE_USER_ANNUAL_PRICE_ID")].includes(priceId)) return "user" as const;
  return null;
}

export function buildPlanChangeItems(subscription: Stripe.Subscription, currentBaseItemId: string, plan: PurchasablePlan, interval: BillingInterval) {
  const prices = getStripePriceIds(plan, interval);
  const items: Stripe.SubscriptionUpdateParams.Item[] = [{ id: currentBaseItemId, price: prices.base, quantity: 1 }];
  for (const item of subscription.items.data) {
    if (item.id === currentBaseItemId) continue;
    const role = sharedAddonRole(item.price.id);
    if (!role) continue;
    const targetPrice = role === "tenant" ? prices.additionalTenant : prices.additionalUser;
    if (item.price.id !== targetPrice) items.push({ id: item.id, price: targetPrice, quantity: Number(item.quantity || 0) });
  }
  return items;
}

async function accountForStripeObject(admin: BillingClient, customerId: string | null, subscriptionId: string | null, metadataCompanyId: string | null) {
  if (subscriptionId) {
    const { data, error } = await admin.from("subscription_accounts").select("company_id,stripe_customer_id").eq("stripe_subscription_id", subscriptionId).maybeSingle();
    if (error) throw new BillingError("Stripe billing ownership could not be verified.", 500);
    if (data) return data.stripe_customer_id && customerId && data.stripe_customer_id !== customerId ? null : data.company_id as string;
  }
  if (!metadataCompanyId) return null;
  const { data: rows, error } = await admin.from("subscription_accounts").select("company_id,stripe_customer_id").eq("company_id", metadataCompanyId).limit(1);
  if (error) throw new BillingError("Stripe billing ownership could not be verified.", 500);
  const data = rows?.[0] as { company_id: string; stripe_customer_id: string | null } | undefined;
  if (!data) return null;
  if (data.stripe_customer_id && customerId && data.stripe_customer_id !== customerId) return null;
  return data.company_id;
}

async function writeAudit(admin: BillingClient, companyId: string, event: string, source: string, metadata: Record<string, unknown>, stripeEventId?: string, actorUserId?: string) {
  const { error } = await admin.from("billing_audit_events").insert({ company_id: companyId, event, source, actor_user_id: actorUserId || null, stripe_event_id: stripeEventId || null, metadata });
  if (error) throw new BillingError("Billing audit state could not be recorded.", 500);
}

async function refreshEntitlements(admin: BillingClient, companyId: string) {
  const { error } = await admin.rpc("billing_refresh_product_entitlements", { p_company_id: companyId });
  if (error) throw new BillingError("Product entitlements could not be refreshed.", 500);
}

async function enqueueSync(admin: BillingClient, companyId: string) {
  const { error } = await admin.from("subscription_sync_queue").upsert({ company_id: companyId, requested_at: new Date().toISOString(), status: "pending", last_error: null, updated_at: new Date().toISOString() }, { onConflict: "company_id" });
  if (error) throw new BillingError("Subscription synchronization could not be queued.", 500);
}

export async function reconcileProductSubscription(admin: BillingClient, subscription: Stripe.Subscription, eventType: string, stripeEventId?: string, eventCreated?: number) {
  const customerId = stripeCustomerId(subscription.customer);
  const plan = stripePlanFromSubscription(subscription);
  const metadataCompanyId = subscription.metadata?.operix_company_id || null;
  if (!plan) return { ignored: true, reason: "unknown_operix_plan" };
  const companyId = await accountForStripeObject(admin, customerId, subscription.id, metadataCompanyId);
  if (!companyId) return { ignored: true, reason: "subscription_not_owned_by_operix" };
  const interval = subscriptionInterval(subscription, plan);
  const period = subscriptionPeriod(subscription, plan);
  const status = normalizeSubscriptionStatus(subscription.status);
  const { data: exactRows, error: exactError } = await admin.from("subscription_accounts").select("id,trial_started_at,trial_ends_at,grace_period_ends_at,product,stripe_subscription_id,status,current_period_end,metadata").eq("company_id", companyId).eq("stripe_subscription_id", subscription.id).limit(1);
  if (exactError) throw new BillingError("Subscription state could not be reconciled.", 500);
  const { data: planRows, error: planError } = await admin.from("subscription_accounts").select("id,trial_started_at,trial_ends_at,grace_period_ends_at,product,stripe_subscription_id,status,current_period_end,metadata").eq("company_id", companyId).eq("product", plan).limit(1);
  if (planError) throw new BillingError("Subscription state could not be reconciled.", 500);
  const exact = exactRows?.[0] as (SubscriptionAccountState & { id: string; trial_started_at: string | null; trial_ends_at: string | null; grace_period_ends_at: string | null; product: string; metadata?: Record<string, unknown> | null }) | undefined;
  const planAccount = planRows?.[0] as typeof exact | undefined;
  if (isSupersededStripeSubscription(subscription.id, planAccount?.metadata)) {
    return { ignored: true, reason: "superseded_stripe_subscription" };
  }
  if (planAccount?.stripe_subscription_id && planAccount.stripe_subscription_id !== subscription.id && exact?.id !== planAccount.id && stripeSubscriptionOccupiesProductSlot(planAccount)) throw new BillingError("The workspace already has another Stripe subscription for this product.", 409);
  if (exact && planAccount && exact.id !== planAccount.id) {
    const { error: retiredError } = await admin.from("subscription_accounts").update({ stripe_subscription_id: null, status: "expired", cancel_at_period_end: true, current_period_end: new Date().toISOString(), last_error: `Superseded by ${plan} subscription ${subscription.id}`, metadata: { ...(exact.metadata || {}), superseded_stripe_subscription_id: exact.stripe_subscription_id, superseded_at: new Date().toISOString() }, updated_at: new Date().toISOString() }).eq("id", exact.id);
    if (retiredError) throw new BillingError("The previous product subscription could not be retired safely.", 500);
  }
  if (planAccount?.stripe_subscription_id && planAccount.stripe_subscription_id !== subscription.id && !stripeSubscriptionOccupiesProductSlot(planAccount)) {
    const { error: retiredError } = await admin.from("subscription_accounts").update({ stripe_subscription_id: null, status: "expired", cancel_at_period_end: true, current_period_end: new Date().toISOString(), last_error: `Superseded by ${plan} subscription ${subscription.id}`, metadata: { ...(planAccount.metadata || {}), superseded_stripe_subscription_id: planAccount.stripe_subscription_id, superseded_at: new Date().toISOString() }, updated_at: new Date().toISOString() }).eq("id", planAccount.id);
    if (retiredError) throw new BillingError("The previous product subscription could not be retired safely.", 500);
  }
  const existing = (planAccount || exact) as { id: string; trial_started_at: string | null; trial_ends_at: string | null; grace_period_ends_at: string | null; product: string } | undefined;
  const grace = status === "past_due" ? (existing?.grace_period_ends_at || new Date(Date.now() + pastDueGraceDays() * 86_400_000).toISOString()) : null;
  const update = {
    company_id: companyId,
    product: plan,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    billing_interval: interval,
    status,
    trial_started_at: existing?.trial_started_at || (status === "trialing" && subscription.trial_start ? new Date(subscription.trial_start * 1000).toISOString() : null),
    trial_ends_at: existing?.trial_ends_at || (status === "trialing" && subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null),
    current_period_start: period.start ? new Date(period.start * 1000).toISOString() : null,
    current_period_end: period.end ? new Date(period.end * 1000).toISOString() : null,
    cancel_at_period_end: subscription.cancel_at_period_end,
    grace_period_ends_at: grace,
    scheduled_plan: null,
    scheduled_change_at: null,
    last_stripe_event_created: eventCreated || null,
    last_stripe_event_id: stripeEventId || null,
    last_error: null,
    updated_at: new Date().toISOString(),
  };
  let query = existing?.id
    ? admin.from("subscription_accounts").update(update).eq("id", existing.id)
    : admin.from("subscription_accounts").upsert(update, { onConflict: "company_id,product" });
  if (eventCreated && existing?.id) query = query.or(`last_stripe_event_created.is.null,last_stripe_event_created.lte.${eventCreated}`);
  const { data: written, error } = await query.select("id,company_id").maybeSingle();
  if (error) throw new BillingError("Subscription state could not be reconciled.", 500);
  if (!written) return { ignored: true, reason: "stale_stripe_event" };
  if (["active", "past_due", "unpaid", "canceled", "paused"].includes(status)) {
    const { error: trialError } = await admin.rpc("billing_consume_product_trials", { p_company_id: companyId, p_plan: plan });
    if (trialError) throw new BillingError("Trial history could not be reconciled.", 500);
  }
  await refreshEntitlements(admin, companyId);
  await enqueueSync(admin, companyId);
  await writeAudit(admin, companyId, eventType === "customer.subscription.deleted" ? "subscription_canceled" : "subscription_changed", "stripe_webhook", { event_type: eventType, subscription_id: subscription.id, plan, status, billing_interval: interval }, stripeEventId);
  return { ignored: false, companyId, plan, status };
}

async function accountForApiAddonSubscription(admin: BillingClient, subscription: Stripe.Subscription) {
  const customerId = stripeCustomerId(subscription.customer);
  const { data: existing, error: existingError } = await admin.from("api_addon_subscriptions").select("company_id,stripe_customer_id,last_stripe_event_created").eq("stripe_subscription_id", subscription.id).maybeSingle();
  if (existingError) throw new BillingError("API Add-on ownership could not be verified.", 500);
  if (existing) {
    if (existing.stripe_customer_id && customerId && existing.stripe_customer_id !== customerId) return null;
    return existing as { company_id: string; stripe_customer_id: string | null; last_stripe_event_created: number | null };
  }

  const metadataCompanyId = subscription.metadata?.operix_company_id || null;
  let query = admin.from("subscription_accounts").select("company_id,stripe_customer_id").limit(20);
  if (metadataCompanyId) query = query.eq("company_id", metadataCompanyId);
  else if (customerId) query = query.eq("stripe_customer_id", customerId);
  else return null;
  const { data: accounts, error: accountError } = await query;
  if (accountError) throw new BillingError("API Add-on ownership could not be verified.", 500);
  const matching = (accounts || []).find((account) => !account.stripe_customer_id || !customerId || account.stripe_customer_id === customerId);
  if (!matching) return null;
  return { company_id: matching.company_id as string, stripe_customer_id: matching.stripe_customer_id as string | null, last_stripe_event_created: null };
}

export async function reconcileApiAddonSubscription(admin: BillingClient, subscription: Stripe.Subscription, eventType: string, stripeEventId?: string, eventCreated?: number) {
  if (subscription.metadata?.operix_product !== "api_addon") return { ignored: true, reason: "not_api_addon" };
  const owner = await accountForApiAddonSubscription(admin, subscription);
  if (!owner) return { ignored: true, reason: "subscription_not_owned_by_operix" };
  if (eventCreated && owner.last_stripe_event_created && owner.last_stripe_event_created >= eventCreated) return { ignored: true, reason: "stale_stripe_event" };

  const customerId = stripeCustomerId(subscription.customer);
  const status = normalizeSubscriptionStatus(subscription.status);
  const periodItem = subscription.items.data[0];
  const periodStart = periodItem?.current_period_start ? new Date(periodItem.current_period_start * 1000).toISOString() : null;
  const periodEnd = periodItem?.current_period_end ? new Date(periodItem.current_period_end * 1000).toISOString() : null;
  const grace = status === "past_due" ? new Date(Date.now() + pastDueGraceDays() * 86_400_000).toISOString() : null;
  const update = {
    company_id: owner.company_id,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    status,
    current_period_start: periodStart,
    current_period_end: periodEnd,
    cancel_at_period_end: subscription.cancel_at_period_end,
    grace_period_ends_at: grace,
    source: "stripe",
    metadata: { operix_product: "api_addon", event_type: eventType },
    last_stripe_event_id: stripeEventId || null,
    last_stripe_event_created: eventCreated || null,
    last_error: null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin.from("api_addon_subscriptions").upsert(update, { onConflict: "company_id" });
  if (error) throw new BillingError("API Add-on subscription state could not be reconciled.", 500);
  await writeAudit(admin, owner.company_id, status === "canceled" ? "api_addon_canceled" : "api_addon_changed", "stripe_webhook", { event_type: eventType, subscription_id: subscription.id, status, current_period_end: periodEnd, included_requests: API_INCLUDED_REQUESTS, automatic_overage_charging: false }, stripeEventId);
  return { ignored: false, companyId: owner.company_id, status, currentPeriodEnd: periodEnd };
}

async function paymentIdentity(admin: BillingClient, invoice: Stripe.Invoice | null, paymentIntent?: Stripe.PaymentIntent | null) {
  const customerId = stripeCustomerId(invoice?.customer || paymentIntent?.customer || null);
  const invoiceWithLegacy = invoice as (Stripe.Invoice & { subscription?: string | Stripe.Subscription | null }) | null;
  const subscription = invoice?.parent?.subscription_details?.subscription || invoiceWithLegacy?.subscription;
  const subscriptionId = typeof subscription === "string" ? subscription : subscription?.id || null;
  const companyId = await accountForStripeObject(admin, customerId, subscriptionId, null);
  return { companyId, customerId, subscriptionId };
}

export async function reconcilePaymentEvent(admin: BillingClient, invoice: Stripe.Invoice, eventType: "invoice.paid" | "invoice.payment_failed", stripeEventId?: string, eventCreated?: number) {
  const identity = await paymentIdentity(admin, invoice);
  if (!identity.companyId) return { ignored: true, reason: "invoice_not_owned_by_operix" };
  if (eventType === "invoice.paid" && identity.subscriptionId) {
    const subscription = await requireStripeClient().subscriptions.retrieve(identity.subscriptionId);
    const result = await reconcileProductSubscription(admin, subscription, eventType, stripeEventId, eventCreated);
    await writeAudit(admin, identity.companyId, "payment_recovered", "stripe_webhook", { invoice_id: invoice.id, subscription_id: identity.subscriptionId }, stripeEventId);
    return result;
  }
  const nextStatus = eventType === "invoice.payment_failed" ? "past_due" : "active";
  const grace = nextStatus === "past_due" ? new Date(Date.now() + pastDueGraceDays() * 86_400_000).toISOString() : null;
  const { error } = await admin.from("subscription_accounts").update({ status: nextStatus, grace_period_ends_at: grace, updated_at: new Date().toISOString() }).eq("company_id", identity.companyId).eq("stripe_subscription_id", identity.subscriptionId || "");
  if (error) throw new BillingError("Payment status could not be reconciled.", 500);
  await refreshEntitlements(admin, identity.companyId);
  await writeAudit(admin, identity.companyId, eventType === "invoice.payment_failed" ? "payment_failed" : "payment_recovered", "stripe_webhook", { invoice_id: invoice.id, subscription_id: identity.subscriptionId }, stripeEventId);
  return { ignored: false, companyId: identity.companyId, status: nextStatus };
}

export async function reconcilePaymentIntentFailure(admin: BillingClient, paymentIntent: Stripe.PaymentIntent, stripeEventId?: string) {
  const metadataCompanyId = paymentIntent.metadata?.operix_company_id || null;
  const paymentCustomerId = stripeCustomerId(paymentIntent.customer);
  let accountQuery = admin.from("subscription_accounts").select("id,company_id,stripe_customer_id,stripe_subscription_id");
  if (metadataCompanyId) accountQuery = accountQuery.eq("company_id", metadataCompanyId);
  else if (paymentCustomerId) accountQuery = accountQuery.eq("stripe_customer_id", paymentCustomerId);
  else return { ignored: true, reason: "payment_intent_not_owned_by_operix" };
  const { data: accounts, error } = await accountQuery;
  if (error || !accounts?.length) return { ignored: true, reason: "payment_intent_ownership_mismatch" };
  const metadataSubscriptionId = paymentIntent.metadata?.operix_subscription_id || null;
  const matching = metadataSubscriptionId
    ? accounts.find((candidate) => candidate.stripe_subscription_id === metadataSubscriptionId)
    : accounts.length === 1 ? accounts[0] : undefined;
  if (!matching || (matching.stripe_customer_id && paymentCustomerId !== matching.stripe_customer_id)) return { ignored: true, reason: "payment_intent_ownership_mismatch" };
  const companyId = matching.company_id as string;
  const { error: updateError } = await admin.from("subscription_accounts").update({ status: "past_due", grace_period_ends_at: new Date(Date.now() + pastDueGraceDays() * 86_400_000).toISOString(), updated_at: new Date().toISOString() }).eq("id", matching.id);
  if (updateError) throw new BillingError("Payment status could not be reconciled.", 500);
  await refreshEntitlements(admin, companyId);
  await writeAudit(admin, companyId, "payment_failed", "stripe_webhook", { payment_intent_id: paymentIntent.id }, stripeEventId);
  return { ignored: false, companyId };
}

async function writeSyncLog(admin: BillingClient, input: { company_id: string; source: string; total_tenants: number; billable_tenants: number; total_users: number; billable_users: number; stripe_updated: boolean; status: "succeeded" | "skipped" | "failed"; error?: string }) {
  const { error } = await admin.from("subscription_sync_logs").insert(input);
  if (error) throw new BillingError("Billing synchronization result could not be recorded.", 500);
}

export async function syncProductSubscriptionQuantities(admin: BillingClient, rootCompanyId: string, plan: PurchasablePlan, source = "billing_sync") {
  const { data: account, error: accountError } = await admin.from("subscription_accounts").select("*").eq("company_id", rootCompanyId).eq("product", plan).maybeSingle();
  if (accountError) throw new BillingError("Subscription state could not be read.", 500);
  if (!account?.stripe_subscription_id) return { companyId: rootCompanyId, plan, stripeUpdated: false, skipped: true, reason: "no_stripe_subscription" };
  const { data: usage, error: usageError } = await admin.from("subscription_usage").select("total_tenants,billable_tenants,total_users,billable_users").eq("company_id", rootCompanyId).maybeSingle();
  if (usageError || !usage) throw new BillingError("Billing usage could not be read.", 500);
  const counts = { totalTenants: Number(usage.total_tenants || 0), billableTenants: Number(usage.billable_tenants || 0), totalUsers: Number(usage.total_users || 0), billableUsers: Number(usage.billable_users || 0) };
  if (!(["active", "trialing", "past_due"].includes(account.status))) {
    await writeSyncLog(admin, { company_id: rootCompanyId, source, total_tenants: counts.totalTenants, billable_tenants: counts.billableTenants, total_users: counts.totalUsers, billable_users: counts.billableUsers, stripe_updated: false, status: "skipped", error: `Subscription status ${account.status} is not quantity-syncable.` });
    return { companyId: rootCompanyId, plan, stripeUpdated: false, skipped: true, counts };
  }
  const stripe = requireStripeClient();
  const subscription = await stripe.subscriptions.retrieve(account.stripe_subscription_id);
  const interval = (account.billing_interval || subscriptionInterval(subscription, plan)) as BillingInterval | null;
  if (!interval) throw new BillingError("The subscription interval could not be determined.", 500);
  const prices = getStripePriceIds(plan, interval);
  const desired = new Map<string, number>([[prices.additionalTenant, counts.billableTenants], [prices.additionalUser, counts.billableUsers]]);
  const knownAddons = new Set([env("STRIPE_TENANT_MONTHLY_PRICE_ID"), env("STRIPE_TENANT_ANNUAL_PRICE_ID"), env("STRIPE_USER_MONTHLY_PRICE_ID"), env("STRIPE_USER_ANNUAL_PRICE_ID")].filter(Boolean));
  let stripeUpdated = false;
  for (const item of subscription.items.data) {
    if (!knownAddons.has(item.price.id)) continue;
    const target = desired.get(item.price.id);
    if (target === undefined || target === 0) {
      await stripe.subscriptionItems.del(item.id, { proration_behavior: "none" });
      stripeUpdated = true;
      continue;
    }
    if (Number(item.quantity || 0) !== target) {
      await stripe.subscriptionItems.update(item.id, { quantity: target, proration_behavior: target > Number(item.quantity || 0) ? "create_prorations" : "none" }, { idempotencyKey: `operix-quantity-${account.stripe_subscription_id}-${item.price.id}-${target}` });
      stripeUpdated = true;
    }
    desired.delete(item.price.id);
  }
  for (const [price, quantity] of desired) {
    if (quantity <= 0) continue;
    await stripe.subscriptionItems.create({ subscription: subscription.id, price, quantity, proration_behavior: "create_prorations" }, { idempotencyKey: `operix-addon-${subscription.id}-${price}-${quantity}` });
    stripeUpdated = true;
  }
  const { error: usageUpdateError } = await admin.from("subscription_usage").update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("company_id", rootCompanyId);
  if (usageUpdateError) throw new BillingError("Subscription usage synchronization could not be recorded.", 500);
  await writeSyncLog(admin, { company_id: rootCompanyId, source, total_tenants: counts.totalTenants, billable_tenants: counts.billableTenants, total_users: counts.totalUsers, billable_users: counts.billableUsers, stripe_updated: stripeUpdated, status: "succeeded" });
  await writeAudit(admin, rootCompanyId, "usage_quantities_synced", source, { plan, billable_tenants: counts.billableTenants, billable_users: counts.billableUsers, stripe_updated: stripeUpdated });
  return { companyId: rootCompanyId, plan, stripeUpdated, skipped: false, counts };
}

export type UserAccessOperation = {
  id: string;
  company_id: string;
  root_company_id: string;
  operation_key: string;
  operation_type: "invite" | "update" | "suspend" | "reactivate" | "remove" | "resend";
  target_membership_id: string | null;
  target_user_id: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  requested_role_code: "company_administrator" | "manager" | "employee" | null;
  requested_permissions: Record<string, boolean>;
  requested_scopes: Record<string, string>;
  status: "pending_billing" | "billing_succeeded" | "invite_pending" | "completed" | "failed" | "canceled";
  billing_required: boolean;
  billable_user_delta: number;
  billing_interval: BillingInterval | null;
  stripe_subscription_id: string | null;
  stripe_invoice_id: string | null;
  billing_preview: Record<string, unknown>;
  failure_code: string | null;
  failure_message: string | null;
  created_by: string;
  expires_at: string;
};

export type UserSeatBillingSettlement = {
  operation: UserAccessOperation;
  preview: {
    authoritative: boolean;
    amountDueCents: number;
    currency: string;
    invoiceId: string | null;
    projectedBillableUsers: number;
    trial: boolean;
  };
};

function userAccessError(caught: unknown, fallback = "The user seat billing operation could not be completed.") {
  if (caught instanceof BillingError) return caught;
  const message = caught instanceof Error ? caught.message : fallback;
  return new BillingError(message || fallback, 502);
}

function isDefinitiveStripePaymentFailure(caught: unknown) {
  const candidate = caught as { type?: unknown; statusCode?: unknown; code?: unknown } | null;
  return candidate?.type === "StripeCardError"
    || Number(candidate?.statusCode) === 402
    || ["card_declined", "payment_intent_payment_attempt_failed", "invoice_payment_intent_requires_action"].includes(String(candidate?.code || ""));
}

function operationFromRow(row: Record<string, unknown>) {
  return row as unknown as UserAccessOperation;
}

async function readUserAccessOperation(admin: BillingClient, operationId: string) {
  const { data, error } = await admin.from("user_access_operations").select("*").eq("id", operationId).maybeSingle();
  if (error || !data) throw new BillingError("The user access operation could not be found.", 404);
  return operationFromRow(data as Record<string, unknown>);
}

async function readUserAccessBillingSummary(admin: BillingClient, companyId: string) {
  const { data, error } = await admin.rpc("rbac_get_users_access_billing_summary", { p_company_id: companyId });
  if (error) throw new BillingError("User seat billing information is unavailable.", 502);
  const summary = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!summary) throw new BillingError("User seat billing information is unavailable.", 404);
  return summary;
}

async function readUserAccessSubscription(admin: BillingClient, rootCompanyId: string) {
  const { data, error } = await admin
    .from("subscription_accounts")
    .select("*")
    .eq("company_id", rootCompanyId)
    .in("product", ["invoice", "suite"])
    .order("created_at", { ascending: true });
  if (error) throw new BillingError("The workspace subscription could not be read.", 500);
  const rows = (data || []) as Array<Record<string, unknown>>;
  const account = rows.find((row) => row.product === "suite") || rows.find((row) => row.product === "invoice");
  return account || null;
}

export function buildUserSeatSubscriptionItems(subscription: Stripe.Subscription, targetPriceId: string, desiredQuantity: number) {
  if (!Number.isInteger(desiredQuantity) || desiredQuantity < 0) throw new BillingError("The calculated user seat quantity is invalid.", 500);
  const knownUserPrices = new Set([
    env("STRIPE_USER_MONTHLY_PRICE_ID"),
    env("STRIPE_USER_ANNUAL_PRICE_ID"),
  ].filter(Boolean));
  const items: Stripe.SubscriptionUpdateParams.Item[] = [];
  let targetFound = false;
  for (const item of subscription.items.data) {
    if (!knownUserPrices.has(item.price.id)) continue;
    if (!targetFound) {
      targetFound = true;
      if (desiredQuantity === 0) items.push({ id: item.id, deleted: true });
      else items.push({ id: item.id, price: targetPriceId, quantity: desiredQuantity });
    } else {
      // A duplicated add-on is a drift condition. The serialized operation
      // removes the extra item while preserving the authoritative quantity.
      items.push({ id: item.id, deleted: true });
    }
  }
  if (!targetFound && desiredQuantity > 0) items.push({ price: targetPriceId, quantity: desiredQuantity });
  return items;
}

export function userSeatProrationBehavior(operationType: UserAccessOperation["operation_type"], trial: boolean): Stripe.SubscriptionUpdateParams.ProrationBehavior {
  if (trial) return "none";
  return operationType === "remove" ? "none" : "always_invoice";
}

/**
 * Read Stripe's authoritative upcoming-invoice preview for a reserved seat
 * operation without changing the subscription. The database reservation is
 * already included in the projected usage returned by the RBAC summary.
 */
export async function previewUserAccessOperation(admin: BillingClient, operationId: string): Promise<UserSeatBillingSettlement["preview"]> {
  const operation = await readUserAccessOperation(admin, operationId);
  const summary = await readUserAccessBillingSummary(admin, operation.company_id);
  const projectedBillableUsers = Number(summary.billable_users || 0);
  const subscriptionAccount = await readUserAccessSubscription(admin, operation.root_company_id);
  const trial = String(summary.status || subscriptionAccount?.status || "").toLowerCase() === "trialing" || operation.billing_required !== true;
  const preview: UserSeatBillingSettlement["preview"] = {
    authoritative: false,
    amountDueCents: 0,
    currency: BILLING_CURRENCY,
    invoiceId: null,
    projectedBillableUsers,
    trial,
  };
  if (trial) return preview;
  if (!subscriptionAccount?.stripe_subscription_id) throw new BillingError("A paid subscription is required before adding or removing a billable user.", 409);
  const accountStatus = String(subscriptionAccount.status || summary.status || "").toLowerCase();
  if (!["active", "past_due"].includes(accountStatus)) throw new BillingError("The workspace subscription is not ready for a seat change.", 409);
  const plan = subscriptionAccount.product === "suite" ? "suite" : "invoice";
  const interval = (String(summary.billing_interval || subscriptionAccount.billing_interval || "monthly") === "annual" ? "annual" : "monthly") as BillingInterval;
  const stripe = requireStripeClient();
  const subscription = await stripe.subscriptions.retrieve(String(subscriptionAccount.stripe_subscription_id));
  const prices = getStripePriceIds(plan, interval);
  const desiredItems = buildUserSeatSubscriptionItems(subscription, prices.additionalUser, projectedBillableUsers);
  const prorationBehavior = userSeatProrationBehavior(operation.operation_type, false);
  const customerId = stripeCustomerId(subscription.customer);
  if (!customerId) throw new BillingError("The Stripe customer could not be verified.", 502);
  const invoicePreview = await stripe.invoices.createPreview({
    customer: customerId,
    subscription: subscription.id,
    subscription_details: {
      items: desiredItems.map((item) => ({ id: item.id, price: item.price, quantity: item.quantity, deleted: item.deleted })),
      proration_behavior: prorationBehavior,
      proration_date: Math.floor(Date.now() / 1000),
    },
  });
  preview.authoritative = true;
  preview.amountDueCents = Number(invoicePreview.amount_due || 0);
  preview.currency = String(invoicePreview.currency || BILLING_CURRENCY).toUpperCase();
  preview.invoiceId = invoicePreview.id || null;
  return preview;
}

/**
 * Reconcile exactly one database-reserved user seat operation against the
 * existing product subscription. This never creates a second Stripe
 * subscription. A short server-side lease serializes changes for one billing
 * account; Stripe idempotency keys make a retry safe.
 */
export async function settleUserAccessOperation(admin: BillingClient, operationId: string): Promise<UserSeatBillingSettlement> {
  let operation = await readUserAccessOperation(admin, operationId);
  if (["completed", "invite_pending", "billing_succeeded"].includes(operation.status)) {
    return {
      operation,
      preview: {
        authoritative: Boolean(operation.billing_preview && Object.keys(operation.billing_preview).length),
        amountDueCents: Number(operation.billing_preview?.amount_due_cents || 0),
        currency: String(operation.billing_preview?.currency || BILLING_CURRENCY).toUpperCase(),
        invoiceId: (operation.billing_preview?.invoice_id as string | null) || operation.stripe_invoice_id || null,
        projectedBillableUsers: Number(operation.billing_preview?.projected_billable_users || 0),
        trial: Boolean(operation.billing_preview?.trial),
      },
    };
  }
  if (operation.status !== "pending_billing") throw new BillingError(operation.failure_message || "This user access operation is no longer retryable.", 409);

  const { data: claimed, error: lockError } = await admin.rpc("rbac_claim_user_access_billing_lock", {
    p_root_company_id: operation.root_company_id,
    p_operation_id: operation.id,
    p_lease_seconds: 180,
  });
  if (lockError) throw new BillingError("The billing account could not be locked safely.", 503);
  if (claimed !== true) throw new BillingError("Another billing change is being processed for this workspace. Try again shortly.", 409);

  let stripeMutationAttempted = false;
  let stripeMutationConfirmed = false;
  try {
    operation = await readUserAccessOperation(admin, operationId);
    if (["completed", "invite_pending", "billing_succeeded"].includes(operation.status)) {
      return { operation, preview: { authoritative: true, amountDueCents: Number(operation.billing_preview?.amount_due_cents || 0), currency: String(operation.billing_preview?.currency || BILLING_CURRENCY).toUpperCase(), invoiceId: (operation.billing_preview?.invoice_id as string | null) || operation.stripe_invoice_id || null, projectedBillableUsers: Number(operation.billing_preview?.projected_billable_users || 0), trial: Boolean(operation.billing_preview?.trial) } };
    }

    const summary = await readUserAccessBillingSummary(admin, operation.company_id);
    const projectedBillableUsers = Number(summary.billable_users || 0);
    const subscriptionAccount = await readUserAccessSubscription(admin, operation.root_company_id);
    const trial = String(summary.status || subscriptionAccount?.status || "").toLowerCase() === "trialing" || operation.billing_required !== true;
    const accountStatus = String(subscriptionAccount?.status || summary.status || "").toLowerCase();
    const interval = (String(summary.billing_interval || subscriptionAccount?.billing_interval || "monthly") === "annual" ? "annual" : "monthly") as BillingInterval;
    const previewData: UserSeatBillingSettlement["preview"] = { authoritative: false, amountDueCents: 0, currency: BILLING_CURRENCY, invoiceId: null, projectedBillableUsers, trial };

    if (!trial) {
      if (!subscriptionAccount?.stripe_subscription_id) throw new BillingError("A paid subscription is required before adding or removing a billable user.", 409);
      if (!["active", "past_due"].includes(accountStatus)) throw new BillingError("The workspace subscription is not ready for a seat change.", 409);
      const plan = subscriptionAccount.product === "suite" ? "suite" : "invoice";
      const stripe = requireStripeClient();
      const subscription = await stripe.subscriptions.retrieve(String(subscriptionAccount.stripe_subscription_id));
      const prices = getStripePriceIds(plan, interval);
      const desiredItems = buildUserSeatSubscriptionItems(subscription, prices.additionalUser, projectedBillableUsers);
      const prorationBehavior = userSeatProrationBehavior(operation.operation_type, false);
      const prorationDate = Math.floor(Date.now() / 1000);
      if (prorationBehavior !== "none") {
        const customerId = stripeCustomerId(subscription.customer);
        if (!customerId) throw new BillingError("The Stripe customer could not be verified.", 502);
        const invoicePreview = await stripe.invoices.createPreview({
          customer: customerId,
          subscription: subscription.id,
          subscription_details: {
            items: desiredItems.map((item) => ({ id: item.id, price: item.price, quantity: item.quantity, deleted: item.deleted })),
            proration_behavior: prorationBehavior,
            proration_date: prorationDate,
          },
        });
        previewData.authoritative = true;
        previewData.amountDueCents = Number(invoicePreview.amount_due || 0);
        previewData.currency = String(invoicePreview.currency || BILLING_CURRENCY).toUpperCase();
        previewData.invoiceId = invoicePreview.id || null;
      }
      stripeMutationAttempted = true;
      const updated = await stripe.subscriptions.update(subscription.id, {
        items: desiredItems,
        proration_behavior: prorationBehavior,
        payment_behavior: "error_if_incomplete",
        ...(prorationBehavior !== "none" ? { proration_date: prorationDate } : {}),
        metadata: { ...subscription.metadata, operix_user_access_operation_id: operation.id },
      }, { idempotencyKey: `operix-user-seat-${operation.id}` });
      stripeMutationConfirmed = true;
      previewData.authoritative = true;
      await reconcileProductSubscription(admin, updated, "user_access_seat_changed");
    }

    const marked = await admin.rpc("rbac_mark_user_access_billing_succeeded", {
      p_operation_id: operation.id,
      p_billing_interval: interval,
      p_stripe_subscription_id: subscriptionAccount?.stripe_subscription_id || null,
      // invoices.createPreview returns a preview reference, not proof that a
      // paid invoice exists. Keep that reference in the server-side preview
      // payload, but do not persist/expose it as a Stripe invoice ID.
      p_stripe_invoice_id: null,
      p_billing_preview: {
        amount_due_cents: previewData.amountDueCents,
        currency: previewData.currency,
        invoice_id: previewData.invoiceId,
        projected_billable_users: projectedBillableUsers,
        trial: previewData.trial,
        operation_type: operation.operation_type,
      },
    });
    if (marked.error) throw new BillingError("The user seat billing result could not be recorded.", 502);
    operation = operationFromRow((Array.isArray(marked.data) ? marked.data[0] : marked.data) as Record<string, unknown>);
    return { operation, preview: previewData };
  } catch (caught) {
    const error = userAccessError(caught);
    if (stripeMutationAttempted && !isDefinitiveStripePaymentFailure(caught)) {
      // A timeout or a post-Stripe database failure is not proof that Stripe
      // rejected the change. Leave the operation pending so a retry can use
      // the same idempotency key, reconcile the authoritative subscription,
      // and only then activate the tenant seat.
      throw new BillingError(
        stripeMutationConfirmed
          ? "Stripe confirmed the seat change, but OperiX could not record the confirmation. Retry safely; the user remains inactive until the server confirms it."
          : "Stripe did not return a definitive result for the seat change. Retry safely; the user remains inactive until billing is confirmed.",
        503,
      );
    }
    try {
      await admin.rpc("rbac_mark_user_access_billing_failed", { p_operation_id: operation.id, p_failure_code: error.name || "billing_failed", p_failure_message: error.message });
    } catch {
      // Preserve the original billing failure if the compensating audit call is unavailable.
    }
    throw error;
  } finally {
    try {
      await admin.rpc("rbac_release_user_access_billing_lock", { p_root_company_id: operation.root_company_id, p_operation_id: operation.id });
    } catch {
      // The lock has its own expiry/recovery path in the database.
    }
  }
}

export async function processProductBillingSyncQueue(admin: BillingClient, limit = 25) {
  const { data: claimed, error } = await admin.rpc("claim_product_sync_queue", { p_limit: limit });
  if (error) throw new BillingError("Billing synchronization queue could not be claimed.", 500);
  let succeeded = 0; let failed = 0;
  for (const row of (claimed || []) as Array<{ company_id: string }>) {
    try {
      const accounts = await getBillingAccounts(admin, row.company_id);
      for (const account of accounts) if (account.stripe_subscription_id && ["invoice", "booking", "suite"].includes(account.product)) await syncProductSubscriptionQuantities(admin, row.company_id, account.product, "billing_queue");
      await admin.from("subscription_sync_queue").update({ status: "succeeded", processed_at: new Date().toISOString(), locked_at: null, last_error: null, updated_at: new Date().toISOString() }).eq("company_id", row.company_id);
      succeeded += 1;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Billing synchronization failed.";
      await admin.from("subscription_sync_queue").update({ status: "failed", requested_at: new Date(Date.now() + 300_000).toISOString(), locked_at: null, last_error: message.slice(0, 1000), updated_at: new Date().toISOString() }).eq("company_id", row.company_id);
      failed += 1;
    }
  }
  return { claimed: (claimed || []).length, succeeded, failed };
}

export async function expireProductTrials(admin: BillingClient) {
  const { data, error } = await admin.rpc("expire_product_trials");
  if (error) throw new BillingError("Trial status reconciliation failed.", 500);
  return Number(data || 0);
}

export async function applyScheduledPlanChanges(admin: BillingClient) {
  const { data, error } = await admin.rpc("claim_scheduled_product_changes", { p_limit: 25 });
  if (error) throw new BillingError("Scheduled product changes could not be claimed.", 500);
  const stripe = requireStripeClient();
  let applied = 0;
  for (const row of (data || []) as Array<{ id: string; company_id: string; stripe_subscription_id: string; product: PurchasablePlan; scheduled_plan: PurchasablePlan; billing_interval: BillingInterval }>) {
    try {
      const subscription = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
      const currentBase = subscription.items.data.find((item) => Object.values(priceEnv).some((ids) => Object.values(ids).some((key) => env(key) === item.price.id)));
      if (!currentBase) throw new BillingError("The scheduled Stripe base subscription item could not be found.", 500);
      await stripe.subscriptions.update(subscription.id, { items: buildPlanChangeItems(subscription, currentBase.id, row.scheduled_plan, row.billing_interval), proration_behavior: "none", metadata: { ...subscription.metadata, operix_plan: row.scheduled_plan, operix_billing_interval: row.billing_interval } }, { idempotencyKey: `operix-scheduled-plan-${row.id}-${row.scheduled_plan}-${row.billing_interval}` });
      const refreshed = await stripe.subscriptions.retrieve(subscription.id);
      await reconcileProductSubscription(admin, refreshed, "scheduled_product_change");
      applied += 1;
    } catch (caught) {
      await admin.from("subscription_accounts").update({ last_error: (caught instanceof Error ? caught.message : "Scheduled change failed").slice(0, 1000), updated_at: new Date().toISOString() }).eq("id", row.id);
    }
  }
  return applied;
}

export async function requestPlanChange(admin: BillingClient, client: BillingClient, request: Request, userId: string, requestedCompanyId: string | undefined, currentPlan: PurchasablePlan, targetPlan: PurchasablePlan, interval?: BillingInterval) {
  const authorization = await authorizeProductWorkspace(client, userId, requestedCompanyId, currentPlan, "billing.manage");
  const accounts = await getBillingAccounts(admin, authorization.rootCompanyId);
  const account = accounts.find((candidate) => candidate.product === currentPlan && stripeSubscriptionOccupiesProductSlot(candidate));
  if (!account || !account.stripe_subscription_id) throw new BillingError("There is no active Stripe subscription for this plan.", 409);
  if (currentPlan === targetPlan && (!interval || interval === account.billing_interval)) throw new BillingError("The workspace is already on this plan and billing interval.", 409);
  if (targetPlan === "suite" && accounts.some((candidate) => candidate.product !== currentPlan && stripeSubscriptionOccupiesProductSlot(candidate))) throw new BillingError("Separate Invoice and Booking subscriptions must be consolidated explicitly before moving to Suite.", 409);
  const stripe = requireStripeClient();
  const subscription = await stripe.subscriptions.retrieve(account.stripe_subscription_id);
  const targetInterval = interval || account.billing_interval || subscriptionInterval(subscription, currentPlan) || "monthly";
  const currentBase = subscription.items.data.find((item) => item.price.id === getStripePriceIds(currentPlan, account.billing_interval || targetInterval).base) || subscription.items.data[0];
  if (!currentBase) throw new BillingError("The Stripe base subscription item could not be found.", 500);
  const isDowngrade = currentPlan === "suite" && targetPlan !== "suite";
  if (isDowngrade) {
    const changeAt = account.current_period_end || new Date().toISOString();
    const { error } = await admin.from("subscription_accounts").update({ scheduled_plan: targetPlan, scheduled_billing_interval: targetInterval, scheduled_change_at: changeAt, updated_at: new Date().toISOString() }).eq("id", account.id);
    if (error) throw new BillingError("The downgrade could not be scheduled.", 500);
    await writeAudit(admin, authorization.rootCompanyId, "plan_downgrade_scheduled", "billing_web", { from: currentPlan, to: targetPlan, change_at: changeAt }, undefined, userId);
    return { scheduled: true, effectiveAt: changeAt, plan: targetPlan, preview: previewForPlan(authorization.summary, targetPlan, targetInterval) };
  }
  const updated = await stripe.subscriptions.update(subscription.id, { items: buildPlanChangeItems(subscription, currentBase.id, targetPlan, targetInterval), proration_behavior: "create_prorations", metadata: { ...subscription.metadata, operix_plan: targetPlan, operix_billing_interval: targetInterval } }, { idempotencyKey: `operix-plan-change-${subscription.id}-${targetPlan}-${targetInterval}` });
  const result = await reconcileProductSubscription(admin, updated, "plan_changed");
  await writeAudit(admin, authorization.rootCompanyId, "plan_changed", "billing_web", { from: currentPlan, to: targetPlan, interval: targetInterval }, undefined, userId);
  return { scheduled: false, effectiveAt: new Date().toISOString(), plan: targetPlan, result, preview: previewForPlan(authorization.summary, targetPlan, targetInterval) };
}

export function billingCurrency() {
  return BILLING_CURRENCY;
}
