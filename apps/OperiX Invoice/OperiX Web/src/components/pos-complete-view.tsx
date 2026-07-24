"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, FileText, Pencil, Printer } from "lucide-react";
import { InvoiceDocument, type DocumentCompany } from "./invoice-document";
import type { ClientRow, InvoiceDraft, InvoiceTemplateConfig } from "@/lib/models";
import { openInvoicePdf } from "@/lib/pdf-client";

type CompletePayload = { draft: InvoiceDraft; client?: ClientRow; company?: DocumentCompany; config?: InvoiceTemplateConfig; invoiceId?: string };

export function PosCompleteView({ invoiceCode }: { invoiceCode?: string }) {
  const [payload, setPayload] = useState<CompletePayload | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const raw = localStorage.getItem("operix-pos-complete");
    if (!raw) return;
    try { const value = JSON.parse(raw) as CompletePayload; queueMicrotask(() => setPayload(value)); } catch { queueMicrotask(() => setMessage("The invoice preview could not be loaded.")); }
  }, []);

  useEffect(() => {
    if (!payload || !new URLSearchParams(window.location.search).has("print")) return;
    const timer = window.setTimeout(() => { void printPdf(); }, 350);
    return () => window.clearTimeout(timer);
  }, [payload]);

  async function printPdf() {
    if (!payload) return;
    setPdfBusy(true); setMessage("");
    try { await openInvoicePdf({ draft: payload.draft, client: payload.client, company: payload.company, template: "corporate", config: payload.config }, `${payload.draft.invoice_number}.pdf`); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The PDF could not be generated."); }
    setPdfBusy(false);
  }

  async function downloadPdf() {
    if (!payload) return;
    setPdfBusy(true); setMessage("");
    try {
      const response = await fetch("/api/pdf", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ draft: payload.draft, client: payload.client, company: payload.company, template: "corporate", config: payload.config }) });
      if (!response.ok) throw new Error("The PDF could not be generated.");
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `${payload.draft.invoice_number}.pdf`; link.click(); URL.revokeObjectURL(url);
    } catch (error) { setMessage(error instanceof Error ? error.message : "The PDF could not be generated."); }
    setPdfBusy(false);
  }

  if (!payload) return <main className="p-6"><div className="card mx-auto max-w-xl p-8 text-center"><FileText className="mx-auto text-[#98a2b3]" size={32}/><h1 className="mt-3 text-lg font-semibold">Invoice preview</h1><p className="muted mt-2 text-sm">{message || (invoiceCode ? `Preparing ${decodeURIComponent(invoiceCode)}…` : "Preparing invoice preview…")}</p><Link className="btn btn-primary mt-5" href="/pos">Back to POS</Link></div></main>;

  return <div className="pos-complete-page mx-auto max-w-[1500px] p-4 lg:p-6"><header className="no-print mb-5 flex flex-col gap-3 sm:flex-row sm:items-center"><div><p className="text-xs font-medium text-[#12b76a]">Payment completed</p><h1 className="page-title mt-1">{payload.draft.invoice_number}</h1><p className="muted mt-1 text-xs">The invoice was saved successfully.</p></div><div className="flex flex-wrap gap-2 sm:ml-auto"><button className="btn" onClick={printPdf}><Printer size={16}/>Print</button><button className="btn" onClick={downloadPdf} disabled={pdfBusy}><Download size={16}/>{pdfBusy ? "Preparing…" : "PDF"}</button><Link className="btn" href="/pos"><Pencil size={16}/>New invoice</Link><Link className="btn btn-primary" href="/invoices">Invoice list</Link></div></header>{message && <p className="no-print mb-4 rounded bg-[#fff3f2] p-3 text-xs text-[#d92d20]">{message}</p>}<div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(420px,680px)]"><section className="no-print card p-5"><h2 className="text-base font-semibold">Invoice actions</h2><p className="muted mt-2 text-sm">Review the invoice preview, print it, download a PDF, or start another invoice.</p><div className="mt-5 grid gap-2"><button className="btn justify-center" onClick={printPdf}><Printer size={16}/>Print invoice</button><button className="btn justify-center" onClick={downloadPdf} disabled={pdfBusy}><Download size={16}/>{pdfBusy ? "Preparing PDF…" : "Download PDF"}</button><Link className="btn justify-center" href="/pos">Create another invoice</Link></div></section><section className="card bg-[#edf1f6] p-3 sm:p-5"><InvoiceDocument draft={payload.draft} client={payload.client} company={payload.company} template="corporate" config={payload.config}/></section></div></div>;
}
