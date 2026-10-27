import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildInvoiceMobileLinks, buildInvoiceMobileLinksFromWebPath, getInvoiceMobileStoreUrl, targetFromInvoiceMobilePath } from "./mobile-app-links";

describe("Invoice Mobile deep links", () => {
  beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_INVOICE_APP_URL", "https://invoice.example.com"); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("builds an invoice universal link and scheme fallback", () => {
    const links = buildInvoiceMobileLinks({ entity: "invoice", id: "invoice/123" });
    expect(links.webUrl).toBe("https://invoice.example.com/open/invoices/invoice%2F123");
    expect(links.schemeUrl).toBe("operix-invoice://open/invoices/invoice%2F123");
  });

  it("maps supported Web resource paths to mobile targets", () => {
    expect(targetFromInvoiceMobilePath("/invoices/123")).toEqual({ entity: "invoice", id: "123" });
    expect(targetFromInvoiceMobilePath("/open/customers/customer-1")).toEqual({ entity: "customer", id: "customer-1" });
    expect(buildInvoiceMobileLinksFromWebPath("/products/product-1").webUrl).toBe("https://invoice.example.com/open/products/product-1");
    expect(targetFromInvoiceMobilePath("/invoices/new")).toBeNull();
  });

  it("does not invent a store URL when configuration is absent", () => {
    expect(getInvoiceMobileStoreUrl("android", {})).toBeUndefined();
    expect(getInvoiceMobileStoreUrl("ios", { ios: "https://apps.apple.com/app/id123" })).toBe("https://apps.apple.com/app/id123");
  });
});
