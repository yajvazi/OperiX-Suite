import { describe, expect, it } from "vitest";
import { buildCustomerLedger } from "./customer-ledger";

describe("buildCustomerLedger", () => {
  it("calculates opening, debit, credit and running balances", () => {
    const ledger = buildCustomerLedger({
      from: "2026-02-01",
      to: "2026-02-28",
      invoices: [
        { id: "old", invoice_number: "INV-1", issue_date: "2026-01-10", status: "sent", total_amount: 100 },
        { id: "new", invoice_number: "INV-2", issue_date: "2026-02-10", status: "sent", total_amount: 50 },
      ],
      payments: [
        { id: "pay", payment_number: "PAY-1", payment_date: "2026-02-15", amount: 80, invoice_number: "INV-1" },
      ],
    });

    expect(ledger.openingBalance).toBe(100);
    expect(ledger.totalDebit).toBe(50);
    expect(ledger.totalCredit).toBe(80);
    expect(ledger.closingBalance).toBe(70);
    expect(ledger.entries.map((entry) => entry.balance)).toEqual([150, 70]);
  });

  it("excludes drafts, cancelled documents, offers and delivery notes by default", () => {
    const ledger = buildCustomerLedger({
      from: "2026-01-01",
      to: "2026-12-31",
      invoices: [
        { id: "draft", invoice_number: "INV-D", issue_date: "2026-01-01", status: "draft", total_amount: 10 },
        { id: "cancelled", invoice_number: "INV-C", issue_date: "2026-01-02", status: "cancelled", total_amount: 10 },
        { id: "offer", invoice_number: "ORD-1", issue_date: "2026-01-03", status: "sent", type: "offer", total_amount: 10 },
        { id: "delivery", invoice_number: "DN-1", issue_date: "2026-01-04", status: "sent", subtype: "delivery_note", total_amount: 10 },
        { id: "posted", invoice_number: "INV-1", issue_date: "2026-01-05", status: "sent", total_amount: 10 },
      ],
      payments: [],
    });

    expect(ledger.entries.map((entry) => entry.document)).toEqual(["INV-1"]);
  });

  it("can include draft invoices when requested", () => {
    const ledger = buildCustomerLedger({
      from: "2026-01-01",
      to: "2026-12-31",
      includeDrafts: true,
      invoices: [{ id: "draft", invoice_number: "INV-D", issue_date: "2026-01-01", status: "draft", total_amount: 12.345 }],
      payments: [],
    });

    expect(ledger.totalDebit).toBe(12.35);
  });
});
