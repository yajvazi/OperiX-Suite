"use client";

import { useEffect, useState } from "react";
import type { ClientRow, InvoiceDraft } from "@/lib/models";
import { InvoiceDocument } from "./invoice-document";
import type { DocumentCompany } from "./invoice-document";
import type { InvoiceTemplate, InvoiceTemplateConfig } from "@/lib/models";

export function PrintDocument() {
  const [payload,setPayload]=useState<{draft:InvoiceDraft;client?:ClientRow;company?:DocumentCompany;receipt?:boolean;template?:InvoiceTemplate;config?:InvoiceTemplateConfig}|null>(null);
 useEffect(()=>{const raw=localStorage.getItem("operix-print-draft");if(!raw)return;const value=JSON.parse(raw);queueMicrotask(()=>setPayload(value));if(value.receipt)document.body.classList.add("print-receipt");void (async()=>{try{const response=await fetch("/api/pdf",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(value)});if(!response.ok)throw new Error("PDF generation failed");const blob=await response.blob();const url=URL.createObjectURL(blob);window.location.replace(url);}catch{ /* Keep the HTML fallback visible if PDF generation is unavailable. */}})();return()=>document.body.classList.remove("print-receipt");},[]);
  if(!payload)return <main className="p-10 text-center">Preparing document…</main>;
  const receipt = payload.receipt || payload.template === "thermal";
  return <><style>{receipt ? "@page{size:50mm auto;margin:0}" : "@page{size:A4;margin:0}"}</style><main className={receipt ? "print-receipt-document" : "print-a4-document"}><InvoiceDocument draft={payload.draft} client={payload.client} company={payload.company} receipt={payload.receipt} template={payload.template} config={payload.config}/></main></>;
}
