import { DecimalAmount, MoneyAmount } from "@invoice-monorepo/money";

export const BILLING_CURRENCY = "EUR" as const;
export const INCLUDED_TENANTS = 1;
export const INCLUDED_ACTIVE_USERS = 1;
export const TRIAL_DAYS = 14;

/** Public API add-on billing constants. The Stripe price is configured by ID
 * so test/staging/prod can use isolated prices while the displayed contract
 * remains stable. Automatic overage charging is intentionally not enabled. */
export const API_ADDON_MONTHLY_PRICE = "4.99" as const;
export const API_INCLUDED_REQUESTS = 5_000;
export const API_OVERAGE_PRICE = "1.00" as const;
export const API_OVERAGE_REQUESTS = 10_000;
export const API_ADDON_PRICE_ENV = "STRIPE_API_ADDON_MONTHLY_PRICE_ID" as const;

/** Legacy alias retained for callers that only render Invoice billing. */
export const BILLING_PRODUCT = "invoice" as const;

export type BillingInterval = "monthly" | "annual";
export type PurchasablePlan = "invoice" | "booking" | "suite";
export type EnterpriseProduct = "hr" | "desk";
export type OperixProduct = PurchasablePlan | EnterpriseProduct;

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "unpaid"
  | "canceled"
  | "expired"
  | "incomplete"
  | "incomplete_expired"
  | "paused";

export type ProductEntitlementMap = Record<EnterpriseProduct | "invoice" | "booking", boolean>;

export type PlanPricing = {
  base: string;
  additionalTenant: string;
  additionalUser: string;
};

export type PlanDefinition = {
  plan: PurchasablePlan;
  name: string;
  description: string;
  products: readonly ("invoice" | "booking")[];
  pricing: Readonly<Record<BillingInterval, PlanPricing>>;
};

export const PLAN_DEFINITIONS: Readonly<Record<PurchasablePlan, PlanDefinition>> = {
  invoice: {
    plan: "invoice",
    name: "OperiX Invoice",
    description: "Invoicing and financial operations for your organization.",
    products: ["invoice"],
    pricing: {
      monthly: { base: "2.99", additionalTenant: "1.99", additionalUser: "0.99" },
      annual: { base: "29.99", additionalTenant: "19.99", additionalUser: "9.99" },
    },
  },
  booking: {
    plan: "booking",
    name: "OperiX Booking",
    description: "Scheduling and reservation operations for your organization.",
    products: ["booking"],
    pricing: {
      monthly: { base: "4.99", additionalTenant: "1.99", additionalUser: "0.99" },
      annual: { base: "49.99", additionalTenant: "19.99", additionalUser: "9.99" },
    },
  },
  suite: {
    plan: "suite",
    name: "OperiX Suite",
    description: "OperiX Invoice and OperiX Booking with shared usage.",
    products: ["invoice", "booking"],
    pricing: {
      monthly: { base: "4.99", additionalTenant: "1.99", additionalUser: "0.99" },
      annual: { base: "49.99", additionalTenant: "19.99", additionalUser: "9.99" },
    },
  },
};

/** Compatibility export for Invoice-only consumers; new code should use PLAN_DEFINITIONS. */
export const BILLING_PRICES = PLAN_DEFINITIONS.invoice.pricing;

export const ENTERPRISE_PRODUCTS: readonly EnterpriseProduct[] = ["hr", "desk"];
export const PUBLIC_PLANS: readonly PurchasablePlan[] = ["invoice", "booking", "suite"];

export type EntitlementAction =
  | "canView"
  | "canExport"
  | "canCreateInvoice"
  | "canIssueInvoice"
  | "canCreateBooking"
  | "canConfirmBooking"
  | "canCreateTenant"
  | "canInviteUser"
  | "canManageBilling";

type BillableTenant = {
  status?: string | null;
  archivedAt?: string | null;
  deletedAt?: string | null;
  suspendedAt?: string | null;
  isInternal?: boolean | null;
  isDemo?: boolean | null;
  isActive?: boolean | null;
};

export type BillableUser = {
  status?: string | null;
  accepted?: boolean | null;
  deleted?: boolean | null;
  disabled?: boolean | null;
  isServiceAccount?: boolean | null;
  isAutomationUser?: boolean | null;
  isSystemUser?: boolean | null;
  isInternal?: boolean | null;
  isPlatformAdmin?: boolean | null;
  role?: string | null;
};

export type BillingUsage = {
  totalTenants: number;
  includedTenants: number;
  billableTenants: number;
  totalUsers: number;
  includedUsers: number;
  billableUsers: number;
};

export type BillingLineItem = {
  key: "base" | "additional_tenants" | "additional_users";
  label: string;
  quantity: number;
  unitAmount: string;
  amount: string;
};

export type BillingPreview = BillingUsage & {
  plan: PurchasablePlan;
  interval: BillingInterval;
  currency: typeof BILLING_CURRENCY;
  lineItems: BillingLineItem[];
  total: string;
};

export type EntitlementSnapshot = {
  status: SubscriptionStatus | string | null | undefined;
  trialEndsAt?: string | null;
  currentPeriodEnd?: string | null;
  gracePeriodEndsAt?: string | null;
  manualGrantActive?: boolean | null;
  now?: Date;
};

export type ProductEntitlementSnapshot = {
  entitlements: Partial<ProductEntitlementMap>;
  status?: SubscriptionStatus | string | null;
  trialEndsAt?: string | null;
  currentPeriodEnd?: string | null;
  gracePeriodEndsAt?: string | null;
  manualGrantActive?: boolean | null;
  now?: Date;
};

export type EntitlementDecision = {
  action: EntitlementAction;
  product: OperixProduct;
  allowed: boolean;
  restricted: boolean;
  status: SubscriptionStatus;
  reason: "full_access" | "past_due_grace" | "billing_or_read_only" | "subscription_required" | "product_not_entitled";
};

function positiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative integer.`);
  return value;
}

export function billableTenantQuantity(totalTenants: number) {
  return Math.max(positiveInteger(totalTenants, "Tenant count") - INCLUDED_TENANTS, 0);
}

export function billableUserQuantity(totalActiveUsers: number) {
  return Math.max(positiveInteger(totalActiveUsers, "User count") - INCLUDED_ACTIVE_USERS, 0);
}

export function isBillableTenant(tenant: BillableTenant) {
  const status = String(tenant.status || "active").toLowerCase();
  return tenant.isActive !== false
    && tenant.isInternal !== true
    && tenant.isDemo !== true
    && !tenant.archivedAt
    && !tenant.deletedAt
    && !tenant.suspendedAt
    && !["archived", "deleted", "suspended", "disabled", "inactive"].includes(status);
}

function truthy(value: boolean | null | undefined) {
  return value === true;
}

export function isActiveAcceptedUser(user: BillableUser) {
  const status = String(user.status || "active").toLowerCase();
  return user.accepted !== false && status === "active" && !truthy(user.deleted) && !truthy(user.disabled);
}

export function isBillableUser(user: BillableUser) {
  if (!isActiveAcceptedUser(user)) return false;
  if (truthy(user.isServiceAccount) || truthy(user.isAutomationUser) || truthy(user.isSystemUser) || truthy(user.isInternal) || truthy(user.isPlatformAdmin)) return false;
  const role = String(user.role || "").trim().toLowerCase().replace(/[ -]+/g, "_");
  return !["super_admin", "super_administrator", "platform_owner", "platform_admin"].includes(role);
}

export function calculateBillingUsage(input: { tenants: readonly BillableTenant[]; users: readonly BillableUser[] }): BillingUsage {
  const totalTenants = input.tenants.filter(isBillableTenant).length;
  const totalUsers = input.users.filter(isBillableUser).length;
  return {
    totalTenants,
    includedTenants: INCLUDED_TENANTS,
    billableTenants: billableTenantQuantity(totalTenants),
    totalUsers,
    includedUsers: INCLUDED_ACTIVE_USERS,
    billableUsers: billableUserQuantity(totalUsers),
  };
}

function amount(value: string) {
  return DecimalAmount.from(value, 2);
}

function multiplyAmount(unitAmount: string, quantity: number) {
  return amount(unitAmount).multiply(DecimalAmount.from(String(quantity), 0), 2).toString();
}

export function calculateSubscriptionPrice(input: {
  plan: PurchasablePlan;
  interval: BillingInterval;
  totalTenants: number;
  totalActiveUsers: number;
}): BillingPreview {
  const totalTenants = positiveInteger(input.totalTenants, "Tenant count");
  const totalUsers = positiveInteger(input.totalActiveUsers, "User count");
  const usage: BillingUsage = {
    totalTenants,
    includedTenants: INCLUDED_TENANTS,
    billableTenants: billableTenantQuantity(totalTenants),
    totalUsers,
    includedUsers: INCLUDED_ACTIVE_USERS,
    billableUsers: billableUserQuantity(totalUsers),
  };
  const prices = PLAN_DEFINITIONS[input.plan].pricing[input.interval];
  const lineItems: BillingLineItem[] = [{
    key: "base",
    label: PLAN_DEFINITIONS[input.plan].name,
    quantity: 1,
    unitAmount: prices.base,
    amount: prices.base,
  }];
  if (usage.billableTenants > 0) lineItems.push({ key: "additional_tenants", label: input.plan === "suite" ? "Additional shared tenants" : "Additional tenants", quantity: usage.billableTenants, unitAmount: prices.additionalTenant, amount: multiplyAmount(prices.additionalTenant, usage.billableTenants) });
  if (usage.billableUsers > 0) lineItems.push({ key: "additional_users", label: input.plan === "suite" ? "Additional shared active users" : "Additional active users", quantity: usage.billableUsers, unitAmount: prices.additionalUser, amount: multiplyAmount(prices.additionalUser, usage.billableUsers) });
  const total = lineItems.reduce((sum, item) => sum.add(amount(item.amount)), amount("0.00"));
  return { ...usage, plan: input.plan, interval: input.interval, currency: BILLING_CURRENCY, lineItems, total: total.toString() };
}

/** Compatibility wrapper; legacy Invoice callers now use the new Invoice price. */
export function calculateBillingPreview(input: { plan?: PurchasablePlan; interval: BillingInterval; totalTenants: number; totalActiveUsers: number }) {
  return calculateSubscriptionPrice({ ...input, plan: input.plan || "invoice" });
}

export function planEntitlements(plan: PurchasablePlan): ProductEntitlementMap {
  return {
    invoice: plan === "invoice" || plan === "suite",
    booking: plan === "booking" || plan === "suite",
    hr: false,
    desk: false,
  };
}

export function hasProductAccess(entitlements: Partial<ProductEntitlementMap>, product: OperixProduct) {
  return entitlements[product as keyof ProductEntitlementMap] === true;
}

const STRIPE_STATUS_MAP: Record<string, SubscriptionStatus> = {
  trialing: "trialing",
  active: "active",
  past_due: "past_due",
  unpaid: "unpaid",
  canceled: "canceled",
  incomplete: "incomplete",
  incomplete_expired: "incomplete_expired",
  paused: "paused",
  expired: "expired",
};

export function normalizeSubscriptionStatus(value: string | null | undefined): SubscriptionStatus {
  return STRIPE_STATUS_MAP[String(value || "").toLowerCase()] || "expired";
}

function future(value: string | null | undefined, now: Date) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp > now.getTime();
}

export function subscriptionHasFullAccess(snapshot: EntitlementSnapshot) {
  const now = snapshot.now || new Date();
  if (snapshot.manualGrantActive) return true;
  const status = normalizeSubscriptionStatus(snapshot.status);
  if (status === "trialing") return future(snapshot.trialEndsAt, now);
  if (status === "active") return true;
  if (status === "canceled") return future(snapshot.currentPeriodEnd, now);
  if (status === "past_due") return future(snapshot.gracePeriodEndsAt, now);
  return false;
}

export function getProductEntitlementDecision(product: OperixProduct, action: EntitlementAction, snapshot: ProductEntitlementSnapshot): EntitlementDecision {
  const status = normalizeSubscriptionStatus(snapshot.status);
  // A healthy subscription status is not enough to unlock every OperiX
  // product. The server-projected product entitlement must also be true.
  // Read-only actions remain available so expired or non-entitled workspaces
  // can reach billing/export surfaces without gaining product mutations.
  const fullAccess = hasProductAccess(snapshot.entitlements, product)
    && subscriptionHasFullAccess({ ...snapshot, status: snapshot.status || "expired" });
  const readOnlyAction = action === "canView" || action === "canExport" || action === "canManageBilling";
  const allowed = readOnlyAction || fullAccess;
  return {
    action,
    product,
    allowed,
    restricted: !fullAccess,
    status,
    reason: fullAccess ? (status === "past_due" ? "past_due_grace" : "full_access") : readOnlyAction ? "billing_or_read_only" : "product_not_entitled",
  };
}

/** Compatibility wrapper for Invoice-only guards. */
export function getEntitlementDecision(action: EntitlementAction, snapshot: EntitlementSnapshot) {
  return getProductEntitlementDecision("invoice", action, { ...snapshot, entitlements: { invoice: subscriptionHasFullAccess(snapshot) } });
}

export function formatBillingAmount(value: string, currency = BILLING_CURRENCY, locale = "en-IE") {
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value));
}

export function addTrialDays(start: Date, days = TRIAL_DAYS) {
  const end = new Date(start.getTime());
  end.setUTCDate(end.getUTCDate() + days);
  return end;
}

export function billingPriceDisplay(plan: PurchasablePlan, interval: BillingInterval) {
  return PLAN_DEFINITIONS[plan].pricing[interval];
}

export function separatePlanMonthlyTotal(totalTenants = 1, totalActiveUsers = 1) {
  const invoice = calculateSubscriptionPrice({ plan: "invoice", interval: "monthly", totalTenants, totalActiveUsers });
  const booking = calculateSubscriptionPrice({ plan: "booking", interval: "monthly", totalTenants, totalActiveUsers });
  const total = MoneyAmount.fromDecimal(invoice.total, BILLING_CURRENCY).add(MoneyAmount.fromDecimal(booking.total, BILLING_CURRENCY));
  return total.amount.toString();
}

export * from "./authorization";
