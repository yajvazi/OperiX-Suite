"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { getLocalStore } from "@/lib/local/local-store";
import { money } from "@/lib/format";
import { SectionCard } from "./ui";

type Row = { date: string; number: string; party: string; base: number; vat: number; total: number };

const SALES_TYPES = ["INVOICE", "FINAL_INVOICE", "SIMPLIFIED_INVOICE", "ADVANCE_INVOICE", "DEBIT_NOTE", "CREDIT_NOTE"];
const csvEscape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;

function download(name: string, rows: Row[]) {
  const lines = [["Date", "Number", "Party", "Taxable base", "VAT", "Total"], ...rows.map((row) => [row.date, row.number, row.party, row.base.toFixed(2), row.vat.toFixed(2), row.total.toFixed(2)])];
  const url = URL.createObjectURL(new Blob([`﻿${lines.map((line) => line.map(csvEscape).join(",")).join("\n")}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  URL.revokeObjectURL(url);
}

function Register({ title, description, rows, file }: { title: string; description: string; rows: Row[]; file: string }) {
  const sum = (key: "base" | "vat" | "total") => rows.reduce((total, row) => total + row[key], 0);
  return <SectionCard title={title} description={description} className="reports-chart-card">
    <div className="mb-3 flex justify-end"><button type="button" className="btn" disabled={!rows.length} onClick={() => download(file, rows)}><Download size={15} /> Export CSV</button></div>
    <div className="reports-table-wrap"><table className="ux-table"><thead><tr><th>Date</th><th>Number</th><th>Party</th><th>Taxable base</th><th>VAT</th><th>Total</th></tr></thead><tbody>
      {rows.length ? rows.map((row, index) => <tr key={`${row.number}-${index}`}><td>{row.date}</td><td>{row.number}</td><td>{row.party || "—"}</td><td>{money(row.base)}</td><td>{money(row.vat)}</td><td>{money(row.total)}</td></tr>) : <tr><td colSpan={6}>No entries yet.</td></tr>}
    </tbody>{rows.length ? <tfoot><tr><th colSpan={3}>Total</th><th>{money(sum("base"))}</th><th>{money(sum("vat"))}</th><th>{money(sum("total"))}</th></tr></tfoot> : null}</table></div>
  </SectionCard>;
}

/** Sales and purchase registers from the records stored in this browser. A working list for your accountant, not a filed return. */
export function LocalTaxRegisters() {
  const [sales, setSales] = useState<Row[]>([]);
  const [purchases, setPurchases] = useState<Row[]>([]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const store = await getLocalStore();
      const invoices = (await store.listInvoices({ ascending: true })).filter((invoice) => SALES_TYPES.includes(String(invoice.commercial_document_type)) && !["draft", "cancelled", "reversed"].includes(String(invoice.status)));
      const vendors = new Map((await store.list("vendors")).map((vendor) => [vendor.id, String(vendor.name ?? "")]));
      const bills = (await store.list("supplier_bills", { orderBy: "issue_date" })).filter((bill) => bill.status !== "draft");
      if (cancelled) return;
      setSales(invoices.map((invoice) => {
        const sign = invoice.commercial_document_type === "CREDIT_NOTE" ? -1 : 1;
        const total = Number(invoice.total_amount || 0) * sign; const vat = Number(invoice.tax_amount || 0) * sign;
        return { date: String(invoice.issue_date ?? ""), number: String(invoice.invoice_number ?? ""), party: String((invoice.client as { name?: string } | null)?.name ?? ""), base: total - vat, vat, total };
      }));
      setPurchases(bills.map((bill) => {
        const total = Number(bill.total_amount || 0); const vat = Number(bill.tax_amount || bill.vat_amount || 0);
        return { date: String(bill.issue_date ?? ""), number: String(bill.bill_number ?? ""), party: vendors.get(String(bill.vendor_id)) ?? "", base: total - vat, vat, total };
      }));
    })().catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  return <section id="tax-books">
    <h2 className="ux-section-heading">Sales and purchase registers</h2>
    <p className="ux-section-description">Lists of issued sales and received supplier bills with VAT, for your accountant. Review before any filing: declarations and electronic submission are not part of on-device mode.</p>
    <div className="mt-4 grid gap-5"><Register title="Sales register" description="Issued invoices and notes, credit notes negative." rows={sales} file="operix-sales-register.csv" /><Register title="Purchase register" description="Supplier bills." rows={purchases} file="operix-purchase-register.csv" /></div>
  </section>;
}
