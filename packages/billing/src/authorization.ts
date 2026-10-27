import type { EnterpriseProduct, OperixProduct } from "./index";

export type ProductEntitlementRecord = {
  product: OperixProduct | string;
  enabled?: boolean | null;
  source?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
};

export const ENTERPRISE_ENTITLEMENT_SOURCES = ["enterprise_contract", "manual_grant", "internal"] as const;

function sourceAllowsProduct(record: ProductEntitlementRecord) {
  const product = String(record.product).toLowerCase();
  if (product !== "hr" && product !== "desk") return true;
  return ENTERPRISE_ENTITLEMENT_SOURCES.includes(record.source as (typeof ENTERPRISE_ENTITLEMENT_SOURCES)[number]);
}

function isInWindow(value: string | null | undefined, now: Date, fallback: boolean) {
  if (!value) return fallback;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp <= now.getTime();
}

function isNotExpired(value: string | null | undefined, now: Date) {
  if (!value) return true;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp > now.getTime();
}

export function isProductEntitlementActive(record: ProductEntitlementRecord, now = new Date()) {
  const startsAt = record.starts_at ?? record.startsAt;
  const endsAt = record.ends_at ?? record.endsAt;
  return sourceAllowsProduct(record) && record.enabled === true && isInWindow(startsAt, now, true) && isNotExpired(endsAt, now);
}

/** Pure domain check. The server remains the authority for the records passed here. */
export function hasProductEntitlement(
  entitlements: readonly ProductEntitlementRecord[],
  product: OperixProduct,
  now = new Date(),
) {
  return entitlements.some((record) => record.product === product && isProductEntitlementActive(record, now));
}

export function getProductEntitlement(
  entitlements: readonly ProductEntitlementRecord[],
  product: OperixProduct,
  now = new Date(),
) {
  return entitlements.find((record) => record.product === product && isProductEntitlementActive(record, now)) ?? null;
}

/** Product ownership and user role permission are intentionally separate checks. */
export function canAccessProduct(input: {
  entitlements: readonly ProductEntitlementRecord[];
  product: OperixProduct;
  roleAllowed: boolean;
  now?: Date;
}) {
  return input.roleAllowed && hasProductEntitlement(input.entitlements, input.product, input.now);
}

export function requireProductEntitlement(
  entitlements: readonly ProductEntitlementRecord[],
  product: OperixProduct,
  now = new Date(),
) {
  const entitlement = getProductEntitlement(entitlements, product, now);
  if (!entitlement) throw new Error(`The ${product.toUpperCase()} product entitlement is not active.`);
  return entitlement;
}

export const ENTERPRISE_ONLY_PRODUCTS: readonly EnterpriseProduct[] = ["hr", "desk"];
