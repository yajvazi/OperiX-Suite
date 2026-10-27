// Public base URL of this deployment (no trailing slash), or "" when not configured.
// Used for links that must be absolute outside a request, such as invoice QR codes
// and mobile deep links. Set NEXT_PUBLIC_INVOICE_APP_URL at build time.
export function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_INVOICE_APP_URL ?? "").trim().replace(/\/+$/, "");
}
