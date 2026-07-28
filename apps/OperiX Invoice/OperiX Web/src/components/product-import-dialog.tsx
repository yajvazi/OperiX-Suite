"use client";

import {useMemo,useRef,useState} from "react";
import {ArrowLeft,CheckCircle2,Download,FileSpreadsheet,Upload,X} from "lucide-react";
import {createClient} from "@/lib/supabase/client";
import {useWorkspace} from "@/hooks/use-workspace";
import {
  autoMapColumns,mappedRecord,normalizeProductImportRow,parseCsv,parseImportNumber,
  productImportFields,productImportTemplateHeaders,type ColumnMapping,type CsvRecord,
  type ProductImportField,
} from "@/lib/product-import";

type Step="upload"|"map"|"review"|"complete";
type ImportResult={batchId:string;created:number;updated:number;items:ReturnType<typeof normalizeProductImportRow>[];batch:Record<string,unknown>};

export function ProductImportDialog({onClose,onImported}:{onClose:()=>void;onImported:()=>Promise<unknown>|unknown}){
  const workspace=useWorkspace();
  const fileRef=useRef<HTMLInputElement>(null);
  const [step,setStep]=useState<Step>("upload");
  const [fileName,setFileName]=useState("");
  const [headers,setHeaders]=useState<string[]>([]);
  const [records,setRecords]=useState<CsvRecord[]>([]);
  const [mapping,setMapping]=useState<ColumnMapping>({});
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState<ImportResult|null>(null);
  const mappedKeys=useMemo(()=>new Set(Object.values(mapping).filter(Boolean)),[mapping]);
  const normalizedRows=useMemo(()=>records.map((record,index)=>normalizeProductImportRow(mappedRecord(record,mapping),index)),[records,mapping]);
  const validRows=normalizedRows.filter(row=>row.sku&&row.description&&row.quantity>0);
  const missingRequired=productImportFields.filter(field=>field.required&&!mappedKeys.has(field.key));

  async function readFile(file:File){
    setError("");
    if(!/\.csv$/i.test(file.name)){setError("Choose a CSV file. You can download the mapped template below.");return;}
    const parsed=parseCsv(await file.text());
    if(!parsed.headers.length||!parsed.rows.length){setError("The CSV does not contain any product rows.");return;}
    setFileName(file.name);setHeaders(parsed.headers);setRecords(parsed.rows);setMapping(autoMapColumns(parsed.headers));setStep("map");
  }
  function downloadTemplate(){
    const sample=productImportTemplateHeaders.map(label=>{
      const values:Record<string,string>={"Furnitori":"Supplier LLC","Nr. unik / fiskal":"810000000","Nr. biznes / TVSH":"300000000","Nr. i faturës":"PUR-2026-001","Data e faturës":"2026-07-27","Valuta":"EUR","Kursi i këmbimit":"1","Shifra / SKU":"SKU-001","Përshkrimi":"Sample product","Kodi tarifor":"8481.80","Vendi i origjinës":"DE","Sasia":"10","Njësia":"pcs","Çmimi në valutë":"12.50","Çmimi i furnitorit (EUR)":"12.50","Rabati %":"5","Transporti / shpenzimet":"8","Shtesat":"0","Dogana":"0","Akciza":"0","TVSH %":"18","Trajtimi i TVSH-së":"standard_18"};
      return values[label]||"";
    });
    const csv=[productImportTemplateHeaders,sample].map(row=>row.map(value=>`"${String(value).replaceAll('"','""')}"`).join(",")).join("\n");
    const url=URL.createObjectURL(new Blob([`\uFEFF${csv}`],{type:"text/csv;charset=utf-8"}));
    const link=document.createElement("a");link.href=url;link.download="operix-product-calculation-import.csv";link.click();URL.revokeObjectURL(url);
  }
  function mappedBatch(){
    const first=mappedRecord(records[0]||{},mapping);
    const fields:ProductImportField[]=["supplier_name","supplier_tax_id","supplier_vat_number","supplier_address","invoice_number","invoice_date","expiry_date","customs_document_number","customs_document_date","payment_terms","organization_unit","received_date","document_number","currency","exchange_rate","customs_declaration_type","country_of_dispatch"];
    return Object.fromEntries(fields.map(field=>[field,first[field]||null]));
  }
  async function importProducts(){
    setBusy(true);setError("");
    const supabase=createClient();
    try{
      if(!supabase)throw new Error("Supabase is not configured.");
      if(!workspace.user)throw new Error("Your session has expired.");
      if(!validRows.length)throw new Error("No valid products are ready to import.");
      const batchPayload={...mappedBatch(),currency:String(mappedBatch().currency||"EUR"),exchange_rate:parseImportNumber(mappedBatch().exchange_rate)||1,user_id:workspace.user.id,company_id:workspace.companyId};
      const batchResult=await supabase.from("product_import_batches").insert(batchPayload).select().single();
      if(batchResult.error)throw batchResult.error;
      let created=0,updated=0;
      const itemPayloads=[];
      for(const row of validRows){
        let existingQuery=supabase.from("products").select("id,stock_quantity,unit_price").eq("sku",row.sku).limit(1);
        if(workspace.companyId)existingQuery=existingQuery.eq("company_id",workspace.companyId);
        const existing=await existingQuery.maybeSingle();
        if(existing.error)throw existing.error;
        const baseProductPayload={
          user_id:workspace.user.id,company_id:workspace.companyId,name:row.description,description:row.description,
          sku:row.sku,barcode:row.barcode||null,category:row.category||null,unit:row.unit,
          cost_price:row.landed_unit_price,tax_rate:row.tax_rate,purchase_currency:String(batchPayload.currency||"EUR"),
          exchange_rate:row.exchange_rate,supplier_unit_price:row.supplier_unit_price,
          supplier_discount_percent:row.discount_percent,supplier_unit_price_after_discount:row.price_after_discount,
          transport_cost:row.transport_cost,additional_cost:row.additional_cost,customs_base:row.customs_base,
          customs_duty:row.customs_duty,excise:row.excise,import_vat_rate:row.tax_rate,
          import_vat_amount:row.import_vat,unit_cost_with_vat:row.unit_price_with_vat,
          tariff_code:row.tariff_code||null,country_of_origin:row.country_of_origin||null,
          vat_treatment:row.vat_treatment,
          stock_quantity:Number(existing.data?.stock_quantity||0)+row.quantity,track_stock:true,
        };
        const productResult=existing.data?.id
          ?await supabase.from("products").update(baseProductPayload).eq("id",existing.data.id).select("id").single()
          :await supabase.from("products").insert({...baseProductPayload,unit_price:row.unit_price_with_vat||row.landed_unit_price,tax_included:true}).select("id").single();
        if(productResult.error)throw productResult.error;
        if(existing.data?.id)updated+=1;else created+=1;
        itemPayloads.push({...row,batch_id:batchResult.data.id,product_id:productResult.data.id,user_id:workspace.user.id,company_id:workspace.companyId});
      }
      const itemsResult=await supabase.from("product_import_items").insert(itemPayloads);
      if(itemsResult.error)throw itemsResult.error;
      const nextResult={batchId:String(batchResult.data.id),created,updated,items:validRows,batch:batchPayload};
      setResult(nextResult);setStep("complete");await onImported();
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Products could not be imported.");
    }finally{setBusy(false);}
  }
  async function exportCalculation(){
    if(!result)return;
    setBusy(true);setError("");
    try{
      const source=workspace.company||workspace.profile;
      const response=await fetch("/api/products/import/pdf",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
        batch:result.batch,items:result.items,company:{
          name:source?.company_name||workspace.company?.name||"",taxId:source?.tax_id||"",address:source?.address||"",
          city:workspace.company?.city||"",country:workspace.company?.country||"",email:source?.email||"",
          phone:source?.phone||"",website:source?.website||"",bankName:source?.bank_name||"",
          iban:source?.bank_iban||source?.bank_account||"",
        },
      })});
      if(!response.ok){const detail=await response.json().catch(()=>null);throw new Error(detail?.error||"The calculation PDF could not be generated.");}
      const url=URL.createObjectURL(await response.blob());const link=document.createElement("a");link.href=url;link.download=`product-calculation-${String(result.batch.invoice_number||result.batchId)}.pdf`;link.click();URL.revokeObjectURL(url);
    }catch(reason){setError(reason instanceof Error?reason.message:"The calculation PDF could not be generated.");}
    finally{setBusy(false);}
  }

  return <div className="fixed inset-0 z-[60] bg-[#061a38]/55 p-3 sm:p-6 grid place-items-center" onMouseDown={onClose}>
    <section className="card shadow-2xl w-full max-w-6xl max-h-[94vh] overflow-auto" onMouseDown={event=>event.stopPropagation()}>
      <header className="sticky top-0 z-10 bg-white p-5 border-b flex items-center gap-3">
        {step!=="upload"&&step!=="complete"&&<button className="icon-btn" onClick={()=>setStep(step==="review"?"map":"upload")} aria-label="Go back"><ArrowLeft size={18}/></button>}
        <div><h2 className="text-lg font-semibold">Import product calculations</h2><p className="text-xs muted mt-1">Map the supplier document and every landed-cost field into OperiX.</p></div>
        <button className="icon-btn ml-auto" onClick={onClose} aria-label="Close"><X size={18}/></button>
      </header>
      <div className="px-5 pt-4 flex items-center gap-2 text-xs" aria-label="Import progress">
        {(["upload","map","review","complete"] as Step[]).map((item,index)=><div key={item} className={`flex-1 h-1.5 rounded-full ${(["upload","map","review","complete"] as Step[]).indexOf(step)>=index?"bg-[#0b5cff]":"bg-[#e9eef6]"}`}/>)}
      </div>
      {step==="upload"&&<div className="p-5">
        <button className="w-full min-h-64 rounded-xl border-2 border-dashed border-[#bfd0e8] bg-[#f8fbff] grid place-items-center p-8 hover:border-[#0b5cff]" onClick={()=>fileRef.current?.click()}>
          <span className="grid place-items-center text-center"><span className="size-14 rounded-xl bg-[#eaf2ff] text-[#0b5cff] grid place-items-center"><Upload size={25}/></span><b className="mt-4">Choose your product calculation CSV</b><span className="muted text-xs mt-2">The first row must contain column names. Albanian and English labels are mapped automatically.</span></span>
        </button>
        <input ref={fileRef} hidden type="file" accept=".csv,text/csv" onChange={event=>event.target.files?.[0]&&void readFile(event.target.files[0])}/>
        <div className="mt-4 flex flex-col sm:flex-row gap-3 sm:items-center"><p className="text-xs muted">Starting from another file? Use the exact mapped format.</p><button className="btn sm:ml-auto justify-center" onClick={downloadTemplate}><Download size={16}/>Download CSV template</button></div>
      </div>}
      {step==="map"&&<div className="p-5">
        <div className="rounded-lg bg-[#f7f9fc] border p-4 flex items-center gap-3"><FileSpreadsheet className="text-[#0b5cff]"/><div><b>{fileName}</b><p className="text-xs muted">{records.length} product rows · {headers.length} source columns</p></div></div>
        <div className="mt-5 grid lg:grid-cols-2 gap-3">{headers.map(header=><label className="field grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 border rounded-lg p-3" key={header}><span className="truncate" title={header}>{header}</span><select className="select" value={mapping[header]||""} onChange={event=>setMapping(current=>({...current,[header]:event.target.value as ProductImportField|""}))}><option value="">Do not import</option>{productImportFields.map(field=><option value={field.key} key={field.key} disabled={mappedKeys.has(field.key)&&mapping[header]!==field.key}>{field.label}{field.required?" *":""}</option>)}</select></label>)}</div>
        {missingRequired.length>0&&<p className="mt-4 p-3 rounded-lg bg-[#fff8e8] text-[#854a0e] text-xs">Map the required fields: {missingRequired.map(field=>field.label).join(", ")}.</p>}
        <footer className="mt-5 flex justify-end"><button className="btn btn-primary" disabled={missingRequired.length>0} onClick={()=>setStep("review")}>Review import</button></footer>
      </div>}
      {step==="review"&&<div className="p-5">
        <div className="grid sm:grid-cols-4 gap-3">{[
          ["Products",validRows.length],["New or updated",validRows.length],["Invoice",String(mappedBatch().invoice_number||"—")],["Supplier",String(mappedBatch().supplier_name||"—")],
        ].map(([label,value])=><div className="rounded-lg border p-4" key={String(label)}><span className="text-xs muted">{label}</span><b className="block mt-1 truncate">{value}</b></div>)}</div>
        <div className="table-wrap card mt-4"><table className="data-table"><thead><tr><th>SKU</th><th>Description</th><th>Qty</th><th>Supplier price</th><th>Discount</th><th>Landed cost</th><th>VAT</th><th>Price with VAT</th></tr></thead><tbody>{normalizedRows.slice(0,12).map(row=><tr key={`${row.line_number}-${row.sku}`} className={!row.sku||!row.description||!row.quantity?"bg-[#fff3f2]":""}><td>{row.sku||"Missing"}</td><td>{row.description||"Missing"}</td><td>{row.quantity} {row.unit}</td><td>{row.supplier_currency_price.toFixed(2)}</td><td>{row.discount_percent}%</td><td>{row.landed_unit_price.toFixed(2)}</td><td>{row.tax_rate}%</td><td className="font-semibold">{row.unit_price_with_vat.toFixed(2)}</td></tr>)}</tbody></table></div>
        {normalizedRows.length>12&&<p className="text-xs muted mt-2">Showing 12 of {normalizedRows.length} rows.</p>}
        <p className="mt-4 text-xs muted">Existing products with the same SKU receive the imported stock and cost without overwriting their selling price. New SKUs are created with the calculated VAT-inclusive price. The full calculation remains linked to this supplier invoice.</p>
        <footer className="mt-5 flex justify-end"><button className="btn btn-primary" disabled={busy||!validRows.length} onClick={importProducts}>{busy?"Importing…":`Import ${validRows.length} products`}</button></footer>
      </div>}
      {step==="complete"&&result&&<div className="p-8 text-center">
        <CheckCircle2 size={52} className="mx-auto text-[#12b76a]"/><h3 className="text-2xl font-semibold mt-4">Product calculation imported</h3>
        <p className="muted mt-2">{result.created} products created · {result.updated} products updated · all {result.items.length} calculation lines saved.</p>
        <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3"><button className="btn justify-center" disabled={busy} onClick={exportCalculation}><Download size={16}/>{busy?"Preparing…":"Download calculation PDF"}</button><button className="btn btn-primary justify-center" onClick={onClose}>Done</button></div>
      </div>}
      {error&&<p className="mx-5 mb-5 p-3 rounded bg-[#fff3f2] text-[#d92d20] text-xs">{error}</p>}
    </section>
  </div>;
}
