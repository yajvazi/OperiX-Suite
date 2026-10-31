import { describe, expect, it } from "vitest";
import { invoiceMarkup } from "./invoice-html";
import type { InvoiceDraft } from "./models";

const draft = {
  client_id: "c1", invoice_number: "INV-1", issue_date: "2026-10-30", due_date: "2026-11-30", payment_method: "bank", currency: "EUR",
  amount_received: 0, notes: "", status: "sent", commercial_document_type: "INVOICE", agent_name: "Ardit Krasniqi", branch_name: "Prishtina",
  items: [{ id: "i1", description: "Service", quantity: 1, unit_price: 100, tax_rate: 18, tax_included: false, discount: 0, unit: "pcs" }],
} as unknown as InvoiceDraft;

describe("web invoice matches the mobile document", () => {
  const html = invoiceMarkup(draft, undefined, false, { name: "Acme", terms: "Pay within 30 days" }, null);
  it("prints the agent, the branch and the terms", () => {
    expect(html).toContain("Ardit Krasniqi");
    expect(html).toContain("Prishtina");
    expect(html).toContain("Pay within 30 days");
  });
});
