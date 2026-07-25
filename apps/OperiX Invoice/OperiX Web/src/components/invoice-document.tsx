"use client";

import type { ClientRow, InvoiceDraft, InvoiceTemplate, InvoiceTemplateConfig } from "@/lib/models";
import { invoiceMarkup } from "@/lib/invoice-html";

export interface DocumentCompany { name:string; email:string; phone:string; address:string; city:string; taxId:string; bankName:string; iban:string; website:string; signatureUrl?:string; stampUrl?:string; }
export const defaultCompany:DocumentCompany={name:"",email:"",phone:"",address:"",city:"",taxId:"",bankName:"",iban:"",website:""};

export function InvoiceDocument({draft,client,company=defaultCompany,receipt=false,template="corporate",config}:{draft:InvoiceDraft;client?:ClientRow;company?:DocumentCompany;receipt?:boolean;template?:InvoiceTemplate;config?:InvoiceTemplateConfig}) {
  const isReceipt = receipt || template === "thermal";
  const fullMarkup = invoiceMarkup(draft,client,isReceipt,company,config);
  const styleMatch = fullMarkup.match(/^<style>([\s\S]*?)<\/style>/);
  const markup = styleMatch ? fullMarkup.slice(styleMatch[0].length) : fullMarkup;
  return <><style dangerouslySetInnerHTML={{__html: styleMatch?.[1] || ""}} /><div className={isReceipt ? "receipt-doc" : "invoice-template-preview"} dangerouslySetInnerHTML={{__html:markup}} /></>;
}
