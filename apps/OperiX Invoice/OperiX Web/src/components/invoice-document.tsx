"use client";

import { useEffect, useRef, useState } from "react";
import type { ClientRow, InvoiceDraft, InvoiceTemplate, InvoiceTemplateConfig } from "@/lib/models";
import { invoiceMarkup } from "@/lib/invoice-html";

export interface DocumentCompany { name:string; email:string; phone:string; address:string; city:string; taxId:string; businessId?:string; vatNumber?:string; bankName:string; iban:string; website:string; logoUrl?:string; signatureUrl?:string; stampUrl?:string; }
export const defaultCompany:DocumentCompany={name:"",email:"",phone:"",address:"",city:"",taxId:"",bankName:"",iban:"",website:""};

// The template stylesheet is written for standalone print pages (html/body, generic class names such as
// .invoice-summary). Injected into the app it must neither restyle the page nor be restyled by the app's own
// rules, so every selector is prefixed with the document's wrapper class.
function scopeDocumentCss(css: string, scope: string): string {
  const scopeSelector = (selector: string) => {
    const trimmed = selector.trim();
    if (trimmed === "html" || trimmed === "body") return scope;
    return `${scope} ${trimmed.replace(/^(html|body)\s+/, "")}`;
  };
  let output = ""; let index = 0;
  while (index < css.length) {
    const open = css.indexOf("{", index);
    if (open === -1) break;
    const header = css.slice(index, open).trim();
    let depth = 1; let close = open + 1;
    while (close < css.length && depth > 0) { if (css[close] === "{") depth += 1; else if (css[close] === "}") depth -= 1; close += 1; }
    const body = css.slice(open + 1, close - 1);
    if (header.startsWith("@page")) { /* print page setup belongs to the standalone document */ }
    else if (header.startsWith("@media")) output += `${header}{${scopeDocumentCss(body, scope)}}`;
    else if (header.startsWith("@")) output += `${header}{${body}}`;
    else output += `${header.split(",").map(scopeSelector).join(",")}{${body}}`;
    index = close;
  }
  return output;
}

export function InvoiceDocument({draft,client,company=defaultCompany,receipt=false,template="corporate",config}:{draft:InvoiceDraft;client?:ClientRow;company?:DocumentCompany;receipt?:boolean;template?:InvoiceTemplate;config?:InvoiceTemplateConfig}) {
  const isReceipt = receipt || template === "thermal";
  const fullMarkup = invoiceMarkup(draft,client,isReceipt,company,config);
  const styleMatch = fullMarkup.match(/^<style>([\s\S]*?)<\/style>/);
  const markup = styleMatch ? fullMarkup.slice(styleMatch[0].length) : fullMarkup;
  return <><style dangerouslySetInnerHTML={{__html: scopeDocumentCss(styleMatch?.[1] || "", isReceipt ? ".receipt-doc" : ".invoice-template-preview")}} /><div className={isReceipt ? "receipt-doc" : "invoice-template-preview"} dangerouslySetInnerHTML={{__html:markup}} /></>;
}

type DocumentProps = Parameters<typeof InvoiceDocument>[0];

const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;

// Shows the document as a real A4 page, scaled to the width of its container (no CSS zoom, so
// text stays crisp and nothing overflows). Receipts keep their narrow width.
export function ScaledDocument(props: DocumentProps) {
  const isReceipt = props.receipt || props.template === "thermal";
  const pageWidth = isReceipt ? 227 : A4_WIDTH_PX;
  const frame = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  const [offset, setOffset] = useState(0);
  const [pageHeight, setPageHeight] = useState(isReceipt ? 0 : A4_HEIGHT_PX);
  useEffect(() => {
    const frameNode = frame.current; const pageNode = page.current;
    if (!frameNode || !pageNode) return;
    const measure = () => { const next = Math.min(1, frameNode.clientWidth / pageWidth); setScale(next); setOffset(Math.max(0, (frameNode.clientWidth - pageWidth * next) / 2)); setPageHeight(Math.max(isReceipt ? 0 : A4_HEIGHT_PX, pageNode.scrollHeight)); };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frameNode); observer.observe(pageNode);
    return () => observer.disconnect();
  }, [pageWidth, isReceipt]);
  return <div ref={frame} className="document-scale-frame" style={{ height: pageHeight * scale }}>
    <div ref={page} className={isReceipt ? "document-scale-page document-scale-receipt" : "document-scale-page"} style={{ width: pageWidth, left: offset, transform: `scale(${scale})` }}><InvoiceDocument {...props} /></div>
  </div>;
}
