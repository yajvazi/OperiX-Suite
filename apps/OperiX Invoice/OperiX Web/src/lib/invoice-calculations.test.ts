import { describe, expect, it } from "vitest";
import { cashAllowed, invoiceTotals, paymentState } from "./invoice-calculations";
import { corporateInvoiceMarkup } from "@invoice-monorepo/invoice-template";
import type { InvoiceData } from "@invoice-monorepo/types";

const items=[{id:"1",description:"Service",quantity:2,unit_price:100,tax_rate:18,discount:10,unit:"pcs"}];
describe("invoice calculations",()=>{
  it("calculates discount before tax",()=>{expect(invoiceTotals({items})).toMatchObject({subtotal:200,discount:20,tax:32.4,total:212.4,taxable:180});});
  it("keeps tax-included prices at their entered gross total",()=>{
    expect(invoiceTotals({items:[{id:"gross",description:"Gross product",quantity:1,unit_price:100,tax_rate:18,tax_included:true,discount:0,unit:"pcs"}]})).toMatchObject({subtotal:100,discount:0,tax:15.25,total:100,taxable:84.75});
  });
  it("allows cash only below 300 euros",()=>{expect(cashAllowed(299.99)).toBe(true);expect(cashAllowed(300)).toBe(false)});
  it("returns paid, due and change state",()=>{expect(paymentState(60.18,62)).toEqual({paid:true,change:1.82,due:0});expect(paymentState(60.18,40)).toEqual({paid:false,change:0,due:20.18})});
  it("does not add VAT again when rendering a tax-included line",()=>{
    const data: InvoiceData = {
      company: { name: "OperiX", address: "" },
      client: { name: "Buyer", address: "", email: "" },
      details: { number: "INV-1", issueDate: "2026-01-01", dueDate: "", currency: "EUR" },
      items: [{ description: "Gross product", quantity: 1, price: 100, taxable: 84.75, tax: 15.25, total: 100, taxIncluded: true, taxRate: 18 }],
      summary: { subtotal: 100, discount: 0, tax: 15.25, total: 100 },
    };
    const markup = corporateInvoiceMarkup(data);
    expect(markup).toContain("100,00 EUR");
    expect(markup).not.toContain("118,00 EUR");
  });
  it("does not expose fiscal identifiers on protected commercial documents",()=>{
    const data: InvoiceData = {
      company: { name: "OperiX", address: "", taxId: "NUI-SECRET-123" },
      client: { name: "Buyer", address: "", email: "", taxId: "BUYER-SECRET-456" },
      details: { number: "QUO-1", issueDate: "2026-01-01", dueDate: "", currency: "EUR", commercialDocumentType: "QUOTE" },
      items: [{ description: "Proposal", quantity: 1, price: 100, taxable: 100, tax: 18, total: 118, taxRate: 18 }],
      summary: { subtotal: 100, discount: 0, tax: 18, total: 118 },
    };
    const markup = corporateInvoiceMarkup(data);
    expect(markup).not.toContain("NUI-SECRET-123");
    expect(markup).not.toContain("BUYER-SECRET-456");
  });
});
