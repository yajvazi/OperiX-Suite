import { invoiceHtml } from "@/lib/invoice-html";
import type { InvoiceDraft } from "@/lib/models";
import { getStorageMode } from "@/lib/local/storage-mode";

/** Prints any HTML document through the browser (used for payslips and reports in on-device mode). */
export function printHtmlInBrowser(html: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  frame.srcdoc = html;
  frame.onload = () => {
    const view = frame.contentWindow;
    if (!view) { frame.remove(); return; }
    view.addEventListener("afterprint", () => frame.remove());
    view.focus();
    view.print();
  };
  document.body.appendChild(frame);
}

/** On-device mode never sends an invoice to a server: the document is laid out and printed (or saved as PDF) by the browser. */
export function printInvoiceInBrowser(payload: { draft: InvoiceDraft; client?: unknown; company?: unknown; receipt?: boolean; template?: string; config?: unknown }) {
  const thermal = Boolean(payload.receipt) || payload.template === "thermal";
  const html = invoiceHtml(payload.draft, payload.client as never, thermal, (payload.company || {}) as never, payload.config as never);
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  frame.srcdoc = html;
  frame.onload = () => {
    const view = frame.contentWindow;
    if (!view) { frame.remove(); return; }
    view.addEventListener("afterprint", () => frame.remove());
    view.focus();
    view.print();
  };
  document.body.appendChild(frame);
}

export async function openInvoicePdf(payload: unknown, filename = "invoice.pdf") {
  if (getStorageMode() === "local") { printInvoiceInBrowser(payload as Parameters<typeof printInvoiceInBrowser>[0]); return; }
  const response = await fetch("/api/pdf", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("Unable to generate the PDF.");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
