import { describe, expect, it } from "vitest";
import { invoiceCustomerInput, ownedCustomerFields } from "./customer-linking";

describe("CRM customer linking", () => {
  it("maps relationship fields into an Invoice customer without financial ownership", () => {
    const input = invoiceCustomerInput({ id: "twenty-1", name: "Acme", email: " sales@acme.test ", taxId: "T-1" }, "user-1", "company-1");
    expect(input).toMatchObject({ name: "Acme", email: "sales@acme.test", tax_id: "T-1", user_id: "user-1", company_id: "company-1" });
    expect(ownedCustomerFields().crm).toContain("crmOwner");
    expect(ownedCustomerFields().invoice).toContain("tax_id");
  });

  it("requires a usable company name", () => {
    expect(() => invoiceCustomerInput({ id: "twenty-1" }, "user-1", "company-1")).toThrow("company name");
  });
});
