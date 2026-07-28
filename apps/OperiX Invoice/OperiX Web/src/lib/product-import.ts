export type ProductImportField =
  | "supplier_name" | "supplier_tax_id" | "supplier_vat_number" | "supplier_address"
  | "invoice_number" | "invoice_date" | "expiry_date" | "customs_document_number"
  | "customs_document_date" | "payment_terms" | "organization_unit" | "received_date"
  | "document_number" | "currency" | "exchange_rate" | "customs_declaration_type"
  | "country_of_dispatch" | "sku" | "barcode" | "description" | "category"
  | "tariff_code" | "country_of_origin" | "quantity" | "unit"
  | "supplier_currency_price" | "supplier_unit_price" | "discount_percent"
  | "discount_value" | "supplier_value" | "price_after_discount"
  | "supplier_value_after_discount" | "transport_cost" | "additional_cost"
  | "customs_base" | "customs_duty" | "excise" | "customs_excise"
  | "landed_value" | "landed_unit_price" | "tax_rate" | "import_vat"
  | "total_value_with_vat" | "unit_price_with_vat" | "vat_treatment";

export interface ProductImportFieldDefinition {
  key: ProductImportField;
  label: string;
  required?: boolean;
  aliases: string[];
}

export const productImportFields: ProductImportFieldDefinition[] = [
  {key:"supplier_name",label:"Furnitori",aliases:["supplier","supplier name","furnitori","shitësi"]},
  {key:"supplier_tax_id",label:"Nr. unik / fiskal",aliases:["supplier tax id","tax id","nr unik","nr fiskal","nui"]},
  {key:"supplier_vat_number",label:"Nr. biznes / TVSH",aliases:["supplier vat","vat number","nr biznes","nr tvsh"]},
  {key:"supplier_address",label:"Adresa e furnitorit",aliases:["supplier address","adresa","address"]},
  {key:"invoice_number",label:"Nr. i faturës",aliases:["invoice number","invoice no","nr fatures","nr i faturës"]},
  {key:"invoice_date",label:"Data e faturës",aliases:["invoice date","data e fatures","data e faturës"]},
  {key:"expiry_date",label:"Data e skadimit",aliases:["expiry date","due date","data e skadimit"]},
  {key:"customs_document_number",label:"Dokumenti doganor",aliases:["customs document","customs document number","dudi","dokumenti doganor"]},
  {key:"customs_document_date",label:"Data e dokumentit doganor",aliases:["customs date","customs document date","data dudi"]},
  {key:"payment_terms",label:"Kushtet",aliases:["terms","payment terms","kushtet"]},
  {key:"organization_unit",label:"Njësia Org.",aliases:["organization unit","organizational unit","njesia org","njësia org"]},
  {key:"received_date",label:"Data e pranimit",aliases:["received date","receipt date","data e pranimit"]},
  {key:"document_number",label:"Numri i dokumentit",aliases:["document number","doc number","numri i dokumentit"]},
  {key:"currency",label:"Valuta",aliases:["currency","valuta"]},
  {key:"exchange_rate",label:"Kursi i këmbimit",aliases:["exchange rate","currency rate","kursi","kursi i kembimit","kursi i këmbimit"]},
  {key:"customs_declaration_type",label:"Lloji i deklaratës doganore",aliases:["customs declaration type","lloji i deklarates doganore","lloji i deklaratës doganore"]},
  {key:"country_of_dispatch",label:"Vendi i dërgimit",aliases:["country of dispatch","dispatch country","vendi i dergimit","vendi i dërgimit"]},
  {key:"sku",label:"Shifra / SKU",required:true,aliases:["sku","shifra","code","product code","kodi"]},
  {key:"barcode",label:"Barkodi",aliases:["barcode","barkodi"]},
  {key:"description",label:"Përshkrimi",required:true,aliases:["description","product","product name","name","pershkrimi","përshkrimi"]},
  {key:"category",label:"Kategoria",aliases:["category","kategoria"]},
  {key:"tariff_code",label:"Kodi tarifor",aliases:["tariff code","hs code","commodity code","kodi tarifor"]},
  {key:"country_of_origin",label:"Vendi i origjinës",aliases:["country of origin","origin country","vendi i origjines","vendi i origjinës"]},
  {key:"quantity",label:"Sasia",required:true,aliases:["quantity","qty","sasia"]},
  {key:"unit",label:"Njësia",aliases:["unit","njesia","njësia"]},
  {key:"supplier_currency_price",label:"Çmimi në valutë",aliases:["currency price","foreign price","cm valute","çm valutë","çmimi në valutë"]},
  {key:"supplier_unit_price",label:"Çmimi i furnitorit (EUR)",aliases:["supplier price","supplier unit price","cm furn","çm furn","çmimi furnitor"]},
  {key:"discount_percent",label:"Rabati %",aliases:["discount","discount percent","rabati","rabati %"]},
  {key:"discount_value",label:"Vlera e rabatit",aliases:["discount value","discount amount","vlera e rabatit"]},
  {key:"supplier_value",label:"Vlera e furnitorit",aliases:["supplier value","vlera furn","vlera e furnitorit"]},
  {key:"price_after_discount",label:"Çmimi pas rabatit",aliases:["price after discount","cm pas rab","çm pas rab","çmimi pas rabatit"]},
  {key:"supplier_value_after_discount",label:"Vlera e furnitorit pas rabatit",aliases:["supplier value after discount","discounted supplier value","vlera furn pas rabatit"]},
  {key:"transport_cost",label:"Transporti / shpenzimet",aliases:["transport","freight","shipping","transport cost","shpenzimet"]},
  {key:"additional_cost",label:"Shtesat",aliases:["additional cost","additional costs","shtesat"]},
  {key:"customs_base",label:"Baza doganore",aliases:["customs base","baza doganore"]},
  {key:"customs_duty",label:"Dogana",aliases:["customs duty","duty","dogana"]},
  {key:"excise",label:"Akciza",aliases:["excise","akciza"]},
  {key:"customs_excise",label:"Dogana + akciza (e kombinuar)",aliases:["customs excise","dogana akciza"]},
  {key:"landed_value",label:"Vlera kushtuese",aliases:["landed value","total landed cost","vlera kushtuese"]},
  {key:"landed_unit_price",label:"Çmimi kushtues",aliases:["landed cost","landed unit price","cost price","cmimi kushtues","çmimi kushtues"]},
  {key:"tax_rate",label:"TVSH %",aliases:["tax rate","vat rate","tax","tvsh","tvsh %"]},
  {key:"import_vat",label:"TVSH ngarkesa",aliases:["import vat","vat amount","tax amount","tvsh ngarkesa"]},
  {key:"total_value_with_vat",label:"Vlera me TVSH",aliases:["total value with vat","value with vat","vlera me tvsh"]},
  {key:"unit_price_with_vat",label:"Çmimi me TVSH",aliases:["price with vat","unit price with vat","final price","cmimi me tvsh","çmimi me tvsh"]},
  {key:"vat_treatment",label:"Trajtimi i TVSH-së",aliases:["vat treatment","tax treatment","trajtimi i tvsh","klasifikimi tvsh"]},
];

export type CsvRecord = Record<string,string>;
export type ColumnMapping = Record<string,ProductImportField|"">;

function normalized(value:string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu,"").toLowerCase().replace(/[^a-z0-9%]+/g," ").trim();
}

export function parseCsv(input:string): {headers:string[];rows:CsvRecord[]} {
  const source=input.replace(/^\uFEFF/,"");
  const firstLine=source.split(/\r?\n/,1)[0]||"";
  const delimiter=(firstLine.match(/;/g)||[]).length>(firstLine.match(/,/g)||[]).length?";":",";
  const lines:string[][]=[]; let row:string[]=[]; let cell=""; let quoted=false;
  for(let index=0;index<source.length;index+=1){
    const character=source[index];
    if(character==='"'){
      if(quoted&&source[index+1]==='"'){cell+='"';index+=1;}else quoted=!quoted;
    }else if(character===delimiter&&!quoted){row.push(cell.trim());cell="";}
    else if((character==="\n"||character==="\r")&&!quoted){
      if(character==="\r"&&source[index+1]==="\n")index+=1;
      row.push(cell.trim());cell="";
      if(row.some(Boolean))lines.push(row);
      row=[];
    }else cell+=character;
  }
  row.push(cell.trim());if(row.some(Boolean))lines.push(row);
  const headers=(lines.shift()||[]).map((header,index)=>header||`Column ${index+1}`);
  return {headers,rows:lines.map(values=>Object.fromEntries(headers.map((header,index)=>[header,values[index]||""])))};
}

export function autoMapColumns(headers:string[]):ColumnMapping {
  return Object.fromEntries(headers.map(header=>{
    const candidate=normalized(header);
    const exact=productImportFields.find(field=>normalized(field.key)===candidate||field.aliases.some(alias=>normalized(alias)===candidate));
    const partial=exact||productImportFields.find(field=>field.aliases.some(alias=>candidate.includes(normalized(alias))||normalized(alias).includes(candidate)));
    return [header,partial?.key||""];
  }));
}

export function parseImportNumber(value:unknown){
  if(typeof value==="number")return Number.isFinite(value)?value:0;
  let source=String(value??"").trim().replace(/[^\d,.-]/g,"");
  if(!source)return 0;
  const lastComma=source.lastIndexOf(","),lastDot=source.lastIndexOf(".");
  if(lastComma>=0&&lastDot>=0)source=lastComma>lastDot?source.replaceAll(".","").replace(",","."):source.replaceAll(",","");
  else if(lastComma>=0)source=source.replace(",",".");
  const parsed=Number(source);return Number.isFinite(parsed)?parsed:0;
}

export interface NormalizedProductImportRow {
  line_number:number; sku:string; barcode:string; description:string; category:string;
  quantity:number; unit:string; exchange_rate:number; supplier_currency_price:number;
  supplier_unit_price:number; discount_percent:number; discount_value:number;
  supplier_value:number; price_after_discount:number; supplier_value_after_discount:number;
  transport_cost:number; additional_cost:number; customs_base:number;
  customs_duty:number; excise:number; customs_excise:number; landed_value:number;
  landed_unit_price:number; tax_rate:number; import_vat:number;
  total_value_with_vat:number; unit_price_with_vat:number; tariff_code:string;
  country_of_origin:string; vat_treatment:string;
}

export function mappedRecord(record:CsvRecord,mapping:ColumnMapping){
  const result:Partial<Record<ProductImportField,string>>={};
  Object.entries(mapping).forEach(([source,target])=>{if(target&&record[source]!==undefined)result[target]=record[source];});
  return result;
}

export function normalizeProductImportRow(record:Partial<Record<ProductImportField,string>>,index:number):NormalizedProductImportRow {
  const quantity=Math.max(0,parseImportNumber(record.quantity));
  const exchangeRate=Math.max(0,parseImportNumber(record.exchange_rate))||1;
  const currencyPrice=Math.max(0,parseImportNumber(record.supplier_currency_price));
  const supplierPrice=Math.max(0,parseImportNumber(record.supplier_unit_price))||currencyPrice*exchangeRate;
  const discount=Math.min(100,Math.max(0,parseImportNumber(record.discount_percent)));
  const supplierValue=parseImportNumber(record.supplier_value)||quantity*supplierPrice;
  const discountValue=parseImportNumber(record.discount_value)||supplierValue*discount/100;
  const priceAfterDiscount=parseImportNumber(record.price_after_discount)||supplierPrice*(1-discount/100);
  const valueAfterDiscount=parseImportNumber(record.supplier_value_after_discount)||Math.max(0,supplierValue-discountValue);
  const transport=parseImportNumber(record.transport_cost);
  const additional=parseImportNumber(record.additional_cost);
  const customsCombined=parseImportNumber(record.customs_excise);
  const customsDuty=parseImportNumber(record.customs_duty)||customsCombined;
  const excise=parseImportNumber(record.excise);
  const customsBase=parseImportNumber(record.customs_base)||valueAfterDiscount+transport+additional;
  const costBase=parseImportNumber(record.landed_value)||customsBase+customsDuty+excise;
  const landed=parseImportNumber(record.landed_unit_price)||(quantity?costBase/quantity:0);
  const taxRate=Math.max(0,parseImportNumber(record.tax_rate));
  const importVat=parseImportNumber(record.import_vat)||costBase*taxRate/100;
  const totalWithVat=parseImportNumber(record.total_value_with_vat)||costBase+importVat;
  const withVat=parseImportNumber(record.unit_price_with_vat)||(quantity?totalWithVat/quantity:0);
  const inferredTreatment=taxRate===8?"reduced_8":taxRate===0?"exempt_no_credit":"standard_18";
  return {
    line_number:index+1,sku:String(record.sku||"").trim(),barcode:String(record.barcode||"").trim(),
    description:String(record.description||"").trim(),category:String(record.category||"").trim(),
    quantity,unit:String(record.unit||"pcs").trim()||"pcs",exchange_rate:exchangeRate,
    supplier_currency_price:currencyPrice,supplier_unit_price:supplierPrice,
    discount_percent:discount,discount_value:discountValue,supplier_value:supplierValue,
    price_after_discount:priceAfterDiscount,supplier_value_after_discount:valueAfterDiscount,
    transport_cost:transport,additional_cost:additional,customs_base:customsBase,
    customs_duty:customsDuty,excise,customs_excise:customsDuty+excise,
    landed_value:costBase,landed_unit_price:landed,tax_rate:taxRate,
    import_vat:importVat,total_value_with_vat:totalWithVat,unit_price_with_vat:withVat,
    tariff_code:String(record.tariff_code||"").trim(),country_of_origin:String(record.country_of_origin||"").trim(),
    vat_treatment:String(record.vat_treatment||inferredTreatment).trim()||inferredTreatment,
  };
}

export const productImportTemplateHeaders=productImportFields.map(field=>field.label);
