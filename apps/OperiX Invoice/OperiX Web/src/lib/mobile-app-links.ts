import { appBaseUrl } from "@/lib/app-config";
export type InvoiceMobileEntity = "invoice" | "customer" | "product" | "payment" | "expense" | "booking";

export interface InvoiceMobileTarget {
  entity: InvoiceMobileEntity;
  id: string;
}

export interface InvoiceMobileLinks {
  webUrl: string;
  schemeUrl: string;
  target: InvoiceMobileTarget | null;
}

export interface InvoiceMobileStoreUrls {
  ios?: string;
  android?: string;
}

const DEFAULT_APP_SCHEME = "operix-invoice";

const envValue = (...keys: string[]) => {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return "";
};

const withoutTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const entityPath: Record<InvoiceMobileEntity, string> = {
  invoice: "invoices",
  customer: "customers",
  product: "products",
  payment: "payments",
  expense: "expenses",
  booking: "bookings",
};

export function invoiceMobileWebBaseUrl() {
  const configured = envValue("NEXT_PUBLIC_OPERIX_INVOICE_DEEP_LINK", "NEXT_PUBLIC_INVOICE_MOBILE_DEEP_LINK");
  if (configured) return withoutTrailingSlash(configured);
  const base = appBaseUrl();
  return base ? `${base}/open` : "/open";
}

export function invoiceMobileAppScheme() {
  return withoutTrailingSlash(envValue("NEXT_PUBLIC_OPERIX_INVOICE_APP_SCHEME") || DEFAULT_APP_SCHEME).replace(/:$/, "");
}

export function buildInvoiceMobileLinks(target?: InvoiceMobileTarget | null): InvoiceMobileLinks {
  const safeTarget = target?.id.trim() ? target : null;
  const path = safeTarget ? `${entityPath[safeTarget.entity]}/${encodeURIComponent(safeTarget.id.trim())}` : "home";
  return {
    webUrl: `${invoiceMobileWebBaseUrl()}/${path}`,
    schemeUrl: `${invoiceMobileAppScheme()}://open/${path}`,
    target: safeTarget,
  };
}

export function targetFromInvoiceMobilePath(pathname: string): InvoiceMobileTarget | null {
  const parts = pathname.split("/").map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  }).filter(Boolean);
  const openIndex = parts[0]?.toLowerCase() === "open" ? 1 : 0;
  const collection = parts[openIndex]?.toLowerCase();
  const id = parts[openIndex + 1]?.trim();
  if (!collection || !id || ["new", "create", "undefined", "null"].includes(id.toLowerCase())) return null;
  const entry = (Object.entries(entityPath) as Array<[InvoiceMobileEntity, string]>).find(([, value]) => value === collection);
  return entry ? { entity: entry[0], id } : null;
}

export function buildInvoiceMobileLinksFromWebPath(pathname: string) {
  return buildInvoiceMobileLinks(targetFromInvoiceMobilePath(pathname));
}

export function getInvoiceMobileStoreUrls(): InvoiceMobileStoreUrls {
  const ios = envValue("NEXT_PUBLIC_OPERIX_INVOICE_IOS_URL", "NEXT_PUBLIC_IOS_APP_URL");
  const android = envValue("NEXT_PUBLIC_OPERIX_INVOICE_ANDROID_URL", "NEXT_PUBLIC_ANDROID_APP_URL");
  return { ios: ios || undefined, android: android || undefined };
}

export type MobileStorePlatform = "ios" | "android" | "other";

export function detectMobileStorePlatform(userAgent = "", platform = ""): MobileStorePlatform {
  if (/iphone|ipad|ipod/i.test(userAgent) || /mac/i.test(platform) && /touch/i.test(platform)) return "ios";
  if (/android/i.test(userAgent) || /android/i.test(platform)) return "android";
  return "other";
}

export function getInvoiceMobileStoreUrl(platform: MobileStorePlatform, urls = getInvoiceMobileStoreUrls()) {
  if (platform === "ios") return urls.ios;
  if (platform === "android") return urls.android;
  return urls.ios || urls.android;
}

export type InvoiceMobileGateEvent =
  | "invoice_mobile_gate_viewed"
  | "invoice_mobile_open_clicked"
  | "invoice_mobile_download_clicked"
  | "invoice_mobile_fallback_triggered";

/** Emits a browser event for any existing analytics integration. */
export function trackInvoiceMobileGateEvent(event: InvoiceMobileGateEvent, detail?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(event, { detail }));
}
