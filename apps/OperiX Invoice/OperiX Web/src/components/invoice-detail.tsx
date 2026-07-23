"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Edit3, Mail, MoreHorizontal, Printer, ReceiptText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import type { ClientRow, InvoiceDraft, InvoiceRow } from "@/lib/models";
import { invoiceTotals } from "@/lib/invoice-calculations";
import { InvoiceDocument } from "./invoice-document";
import type { DocumentCompany } from "./invoice-document";
import { openInvoicePdf } from "@/lib/pdf-client";

type DetailedInvoice=InvoiceRow&{client?:ClientRow|null;items?:Array<Record<string,unknown>>};

export function InvoiceDetail({id, invoiceNumber}:{id?:string; invoiceNumber?:string}){
  const [invoice,setInvoice]=useState<DetailedInvoice|null>(null);
  const [draft,setDraft]=useState<InvoiceDraft|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const workspace=useWorkspace();

  useEffect(()=>{const supabase=createClient();if(!supabase){queueMicrotask(()=>{setError("Supabase is not configured.");setLoading(false);});return;}const lookupColumn=invoiceNumber?"invoice_number":"id";const lookupValue=invoiceNumber||id;void supabase.from("invoices").select("*, client:clients(*), items:invoice_items(*)").eq(lookupColumn,lookupValue).single().then(({data,error:queryError})=>{if(queryError){setError(queryError.message);setLoading(false);return;}const row=data as DetailedInvoice;setInvoice(row);setDraft({client_id:row.client_id||"",invoice_number:row.invoice_number,issue_date:row.issue_date,due_date:row.due_date||row.issue_date,payment_method:row.payment_method||"bank",amount_received:Number(row.amount_received||0),notes:row.notes||"",status:row.status,items:(row.items||[]).map(item=>({id:String(item.id),product_id:item.product_id?String(item.product_id):undefined,description:String(item.description||""),quantity:Number(item.quantity||0),unit_price:Number(item.unit_price||0),tax_rate:Number(item.tax_rate||0),discount:Number(item.discount||0),unit:String(item.unit||"pcs"),sku:item.sku?String(item.sku):undefined}))});setLoading(false);});},[id,invoiceNumber]);

  const template=invoice?.template_id==="thermal"||invoice?.paper_size==="Receipt"?"thermal":"corporate";
  const source=workspace.company||workspace.profile;
  const company:DocumentCompany={name:source?.company_name||workspace.company?.name||"",email:source?.email||"",phone:source?.phone||"",address:source?.address||"",city:[workspace.company?.city,workspace.company?.country].filter(Boolean).join(", "),taxId:source?.tax_id||"",bankName:source?.bank_name||"",iban:source?.bank_iban||"",website:source?.website||"",signatureUrl:source?.signature_url};
  async function print(receipt=false){if(!draft)return;setError("");try{await openInvoicePdf({draft,client:invoice?.client||undefined,company,receipt,template,config:workspace.company?.template_config||workspace.profile?.template_config},`${draft.invoice_number}.pdf`);}catch(error){setError(error instanceof Error?error.message:"Unable to generate the PDF.");}}
  async function download(){if(!draft)return;setError("");const response=await fetch("/api/pdf",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({draft,client:invoice?.client,company,template})});if(!response.ok){setError("Unable to generate the PDF.");return;}const blob=await response.blob();const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=`${draft.invoice_number}.pdf`;link.click();URL.revokeObjectURL(url);}
  if(loading)return <div className="p-8"><div className="skeleton h-[700px] rounded"/></div>;
  if(error&&!draft)return <div className="p-8"><p className="p-4 rounded bg-[#fff3f2] text-[#d92d20]">{error}</p><Link href="/invoices" className="btn mt-4">Back to invoices</Link></div>;
  if(!invoice||!draft)return null;
  const totals=invoiceTotals(draft);

  return <main className="invoice-workspace">
    <header className="invoice-commandbar no-print">
      <div className="invoice-command-title">
        <Link className="invoice-preview-back" href="/invoices"><ArrowLeft size={16}/>Back to invoices</Link>
        <div className="invoice-title-row">
          <h1>{invoice.invoice_number}</h1>
          <span className={`status status-${invoice.status}`}>{invoice.status}</span>
        </div>
      </div>
      <div className="invoice-command-actions">
        <a className="btn" href={`mailto:${invoice.client?.email||""}?subject=${encodeURIComponent(`Invoice ${invoice.invoice_number}`)}`}><Mail size={16}/>Email</a>
        <button className="btn" onClick={()=>print(false)}><Printer size={16}/>Print A4</button>
        <button className="btn invoice-desktop-receipt" onClick={()=>print(true)}><ReceiptText size={16}/>50 mm</button>
        <button className="btn" onClick={download}><Download size={16}/>Download PDF</button>
        <Link className="btn btn-primary" href={`/invoices/new?edit=${invoice.id}`}><Edit3 size={16}/>Edit</Link>
        <details className="invoice-mobile-more">
          <summary className="btn"><MoreHorizontal size={16}/>More actions</summary>
          <button type="button" onClick={()=>print(true)}><ReceiptText size={15}/>Print 50 mm receipt</button>
        </details>
      </div>
    </header>
    {error?<p className="invoice-workspace-error no-print">{error}</p>:null}
    <div className="invoice-workspace-grid">
      <section className="invoice-document-panel" aria-label={`Preview of invoice ${invoice.invoice_number}`}>
        <div className="invoice-document-panel-head no-print"><span>Document preview</span><span>A4 · {template==="thermal"?"Thermal template":"Corporate template"}</span></div>
        <div className="invoice-document-canvas">
          <InvoiceDocument draft={draft} client={invoice.client||undefined} company={company} template={template} config={workspace.company?.template_config||workspace.profile?.template_config}/>
        </div>
      </section>
      <aside className="invoice-inspector no-print">
        <div className="invoice-inspector-head"><h2>Invoice summary</h2><span className="invoice-preview-file">PDF</span></div>
        <div className="invoice-inspector-total"><span>Total</span><strong>{new Intl.NumberFormat(undefined,{style:"currency",currency:source?.currency||"EUR"}).format(totals.total)}</strong></div>
        <dl className="invoice-inspector-facts">
          <div><dt>Customer</dt><dd>{invoice.client?.name||"Walk-in Customer"}</dd></div>
          <div><dt>Issue date</dt><dd>{invoice.issue_date}</dd></div>
          <div><dt>Due date</dt><dd>{invoice.due_date||invoice.issue_date}</dd></div>
          <div><dt>Payment</dt><dd className="capitalize">{invoice.payment_method||"—"}</dd></div>
        </dl>
        <div className="invoice-inspector-actions">
          <a className="btn" href={`mailto:${invoice.client?.email||""}?subject=${encodeURIComponent(`Invoice ${invoice.invoice_number}`)}`}><Mail size={16}/>Email</a>
          <button className="btn" onClick={()=>print(false)}><Printer size={16}/>Print A4</button>
          <button className="btn" onClick={download}><Download size={16}/>Download PDF</button>
          <Link className="btn btn-primary" href={`/invoices/new?edit=${invoice.id}`}><Edit3 size={16}/>Edit invoice</Link>
        </div>
      </aside>
    </div>
  </main>;
}
