import {describe,expect,it} from "vitest";
import {
  kosovoSalesBookAmounts,
  kosovoSalesBookBuyerIdentifier,
} from "@invoice-monorepo/report-templates";

describe("Kosovo Sales Book mapping",()=>{
  it("splits standard and reduced VAT invoice lines into TAK columns",()=>{
    const result=kosovoSalesBookAmounts({
      items:[
        {quantity:2,unit_price:100,discount:10,tax_rate:18},
        {quantity:1,unit_price:50,discount:0,tax_rate:8},
      ],
    });

    expect(result.standardBase).toBe(180);
    expect(result.outputVat18).toBeCloseTo(32.4);
    expect(result.reducedBase).toBe(50);
    expect(result.outputVat8).toBeCloseTo(4);
    expect(result.outputVatTotal).toBeCloseTo(36.4);
  });

  it("places explicitly classified exports only in TAK column 11",()=>{
    const result=kosovoSalesBookAmounts({
      tax_reporting_category:"export",
      total_amount:125,
      tax_amount:0,
    });

    expect(result.exports).toBe(125);
    expect(result.exemptNoCredit).toBe(0);
    expect(result.outputVatTotal).toBe(0);
  });

  it("places domestic reverse charge supplies in TAK column 10b",()=>{
    const result=kosovoSalesBookAmounts({
      tax_reporting_category:"domestic_reverse_charge",
      total_amount:240,
      tax_amount:0,
    });

    expect(result.domesticReverseCharge).toBe(240);
    expect(result.exemptWithCreditTotal).toBe(240);
    expect(result.outputVatTotal).toBe(0);
  });

  it("uses TAK special buyer codes only for their corresponding transaction class",()=>{
    expect(kosovoSalesBookBuyerIdentifier(
      {tax_reporting_category:"export"},
      {nui:"811234567"},
    )).toBe("3");
    expect(kosovoSalesBookBuyerIdentifier(
      {tax_reporting_category:"international_organization"},
      {},
    )).toBe("7");
    expect(kosovoSalesBookBuyerIdentifier(
      {tax_reporting_category:"domestic_standard_18"},
      {nui:"811234567"},
    )).toBe("811234567");
    expect(kosovoSalesBookBuyerIdentifier({},{})).toBe("1");
  });
});
