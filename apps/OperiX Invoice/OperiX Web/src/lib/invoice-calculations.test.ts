import { describe, expect, it } from "vitest";
import { cashAllowed, invoiceTotals, paymentState } from "./invoice-calculations";

const items=[{id:"1",description:"Service",quantity:2,unit_price:100,tax_rate:18,discount:10,unit:"pcs"}];
describe("invoice calculations",()=>{
  it("calculates discount before tax",()=>{expect(invoiceTotals({items})).toEqual({subtotal:200,discount:20,tax:32.4,total:212.4})});
  it("allows cash only below 300 euros",()=>{expect(cashAllowed(299.99)).toBe(true);expect(cashAllowed(300)).toBe(false)});
  it("returns paid, due and change state",()=>{expect(paymentState(60.18,62)).toEqual({paid:true,change:1.8200000000000003,due:0});expect(paymentState(60.18,40)).toEqual({paid:false,change:0,due:20.18})});
});
