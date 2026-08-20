import { describe, expect, it, vi } from "vitest";
import { TwentyApiError, TwentyClient, twentyLinkFieldName } from "./twenty-client";

describe("Twenty API adapter", () => {
  it("uses server-side bearer authentication and centralized REST paths", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: "company-1" }), { status: 200 }));
    const client = new TwentyClient("https://crm.operixsuite.com", "server-only-key", fetcher);
    await client.updateCompany("company-1", { operixInvoiceCustomerId: "client-1" });
    expect(fetcher).toHaveBeenCalledWith("https://crm.operixsuite.com/rest/companies/company-1", expect.objectContaining({ method: "PATCH", headers: expect.objectContaining({ authorization: "Bearer server-only-key" }) }));
  });

  it("classifies retryable API responses", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 503 }));
    const client = new TwentyClient("https://crm.operixsuite.com", "server-only-key", fetcher);
    await expect(client.updateCompany("company-1", {})).rejects.toMatchObject({ status: 503, retriable: true } satisfies Partial<TwentyApiError>);
  });

  it("validates the configurable writeback field", () => {
    expect(twentyLinkFieldName({ OPERIX_TWENTY_INVOICE_CUSTOMER_FIELD: "operixInvoiceCustomerId" })).toBe("operixInvoiceCustomerId");
    expect(() => twentyLinkFieldName({ OPERIX_TWENTY_INVOICE_CUSTOMER_FIELD: "not-safe.field" })).toThrow("field name");
  });
});
