import { describe, expect, it } from "vitest";
import { crmLink, safeCrmUrl } from "./config";
import { readCrmFlags } from "./flags";

describe("CRM configuration", () => {
  it("accepts HTTPS URLs and generates centralized links", () => {
    expect(safeCrmUrl("https://crm.operixsuite.com/")).toBe("https://crm.operixsuite.com");
    expect(crmLink("/companies/company-1", { NEXT_PUBLIC_OPERIX_CRM_URL: "https://crm.operixsuite.com" })).toBe("https://crm.operixsuite.com/companies/company-1");
  });

  it("rejects unsafe URL forms", () => {
    expect(() => safeCrmUrl("http://crm.operixsuite.com")).toThrow("HTTPS");
    expect(() => safeCrmUrl("https://user:pass@crm.operixsuite.com")).toThrow("credentials");
    expect(() => safeCrmUrl("https://crm.operixsuite.com/?next=http://internal")).toThrow("query");
  });

  it("keeps every integration action disabled unless explicitly enabled", () => {
    expect(readCrmFlags({})).toEqual({ enabled: false, syncCustomers: false, createDraftOnWon: false, deepLinksEnabled: false, webhooksEnabled: false });
  });
});
