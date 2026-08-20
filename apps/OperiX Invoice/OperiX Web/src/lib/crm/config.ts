const DEFAULT_CRM_URL = "https://crm.operixsuite.com";

export function safeCrmUrl(value: string | undefined, fallback = DEFAULT_CRM_URL): string {
  const candidate = value?.trim() || fallback;
  const parsed = new URL(candidate);
  const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (!isLocal && parsed.protocol !== "https:") {
    throw new Error("OperiX CRM URLs must use HTTPS outside local development.");
  }
  if (parsed.username || parsed.password || parsed.hash || parsed.search) {
    throw new Error("OperiX CRM URLs cannot include credentials, fragments, or query strings.");
  }
  return parsed.toString().replace(/\/$/, "");
}

export function getCrmUrl(env: Record<string, string | undefined> = process.env): string {
  return safeCrmUrl(env.OPERIX_TWENTY_API_URL || env.NEXT_PUBLIC_OPERIX_CRM_URL);
}

export function getInvoiceUrl(env: Record<string, string | undefined> = process.env): string {
  return safeCrmUrl(env.NEXT_PUBLIC_INVOICE_APP_URL, "https://invoice.operixsuite.com");
}

export function crmLink(path: string, env: Record<string, string | undefined> = process.env): string {
  const base = getCrmUrl(env);
  if (!path.startsWith("/")) throw new Error("CRM paths must be absolute paths.");
  return `${base}${path}`;
}

export function invoiceLink(path: string, env: Record<string, string | undefined> = process.env): string {
  const base = getInvoiceUrl(env);
  if (!path.startsWith("/")) throw new Error("Invoice paths must be absolute paths.");
  return `${base}${path}`;
}
