import {describe,expect,it} from "vitest";
import {autoMapColumns,normalizeProductImportRow,parseCsv,parseImportNumber} from "./product-import";

describe("product import",()=>{
  it("parses quoted comma CSV and maps Albanian headers",()=>{
    const parsed=parseCsv('Shifra,Përshkrimi,Sasia,Çmimi me TVSH\nA-1,"Valvul, 1 inç",2,"12,50"');
    expect(parsed.rows[0]["Përshkrimi"]).toBe("Valvul, 1 inç");
    expect(autoMapColumns(parsed.headers)).toMatchObject({Shifra:"sku",Përshkrimi:"description",Sasia:"quantity","Çmimi me TVSH":"unit_price_with_vat"});
  });
  it("accepts Albanian decimal formatting",()=>{
    expect(parseImportNumber("1.234,56 EUR")).toBe(1234.56);
  });
  it("derives landed and VAT-inclusive unit costs",()=>{
    const row=normalizeProductImportRow({sku:"A",description:"Item",quantity:"2",supplier_currency_price:"100",discount_percent:"10",transport_cost:"20",tax_rate:"18"},0);
    expect(row.landed_unit_price).toBe(100);
    expect(row.import_vat).toBe(36);
    expect(row.unit_price_with_vat).toBe(118);
  });
  it("maps foreign-currency price, customs duty and excise into the full landed-cost chain",()=>{
    const row=normalizeProductImportRow({sku:"B",description:"Imported item",quantity:"4",supplier_currency_price:"10",exchange_rate:"1.2",discount_percent:"10",transport_cost:"4",customs_duty:"2",excise:"1",tax_rate:"18"},0);
    expect(row.supplier_unit_price).toBe(12);
    expect(row.discount_value).toBeCloseTo(4.8);
    expect(row.customs_base).toBeCloseTo(47.2);
    expect(row.landed_value).toBeCloseTo(50.2);
    expect(row.import_vat).toBeCloseTo(9.036);
    expect(row.total_value_with_vat).toBeCloseTo(59.236);
  });
});
