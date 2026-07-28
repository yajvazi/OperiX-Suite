"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, RefreshCw, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { buildCustomerLedger, type CustomerLedgerInvoice, type CustomerLedgerPayment } from "@/lib/customer-ledger";
import { useWorkspace } from "@/hooks/use-workspace";

type Customer = Record<string, unknown> & { id: string };
type PaymentQueryRow = CustomerLedgerPayment & { invoice?: { invoice_number?: string | null } | null };

const today = () => new Date().toISOString().slice(0, 10);
const yearStart = () => `${new Date().getFullYear()}-01-01`;
const money = (value: number) => new Intl.NumberFormat("sq-AL", {
  style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(value);
const shortDate = (value: string) => new Intl.DateTimeFormat("sq-AL", {
  day: "2-digit", month: "2-digit", year: "numeric",
}).format(new Date(`${value}T12:00:00`));

export function CustomerLedgerDialog({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const workspace = useWorkspace();
  const [from, setFrom] = useState(yearStart);
  const [to, setTo] = useState(today);
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const [invoices, setInvoices] = useState<CustomerLedgerInvoice[]>([]);
  const [payments, setPayments] = useState<CustomerLedgerPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const supabase = createClient();
      if (!supabase) throw new Error("Supabase is not configured.");
      let invoiceQuery = supabase
        .from("invoices")
        .select("id,invoice_number,issue_date,status,type,subtype,total_amount,payment_method,notes,created_at")
        .eq("client_id", customer.id)
        .order("issue_date", { ascending: true });
      if (workspace.companyId) invoiceQuery = invoiceQuery.eq("company_id", workspace.companyId);
      const invoiceResult = await invoiceQuery;
      if (invoiceResult.error) throw invoiceResult.error;
      const nextInvoices = (invoiceResult.data || []) as CustomerLedgerInvoice[];
      const invoiceIds = nextInvoices.map((invoice) => invoice.id);

      let directQuery = supabase
        .from("payments")
        .select("id,payment_number,payment_date,amount,payment_method,bank_reference,notes,invoice_id,created_at,invoice:invoices(invoice_number)")
        .eq("client_id", customer.id);
      if (workspace.companyId) directQuery = directQuery.eq("company_id", workspace.companyId);
      const directResult = await directQuery;
      if (directResult.error) throw directResult.error;

      let linkedRows: PaymentQueryRow[] = [];
      if (invoiceIds.length) {
        let linkedQuery = supabase
          .from("payments")
          .select("id,payment_number,payment_date,amount,payment_method,bank_reference,notes,invoice_id,created_at,invoice:invoices(invoice_number)")
          .in("invoice_id", invoiceIds);
        if (workspace.companyId) linkedQuery = linkedQuery.eq("company_id", workspace.companyId);
        const linkedResult = await linkedQuery;
        if (linkedResult.error) throw linkedResult.error;
        linkedRows = (linkedResult.data || []) as unknown as PaymentQueryRow[];
      }
      const merged = new Map<string, PaymentQueryRow>();
      ([...(directResult.data || []), ...linkedRows] as unknown as PaymentQueryRow[]).forEach((payment) => merged.set(payment.id, payment));
      setInvoices(nextInvoices);
      setPayments([...merged.values()].map((payment) => ({
        ...payment,
        invoice_number: payment.invoice?.invoice_number || null,
      })));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Kartela e blerësit nuk mund të ngarkohej.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!workspace.loading) queueMicrotask(() => void load());
    // The customer and workspace determine the complete source set; period changes are calculated locally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer.id, workspace.companyId, workspace.loading]);

  const ledger = useMemo(() => buildCustomerLedger({
    invoices,
    payments,
    from,
    to,
    includeDrafts,
    customerName: String(customer.name || "—"),
    organizationUnit: String(workspace.company?.name || "—"),
    userName: String(
      [workspace.profile?.first_name, workspace.profile?.last_name].filter(Boolean).join(" ")
      || workspace.profile?.email
      || "—",
    ),
  }), [customer.name, from, includeDrafts, invoices, payments, to, workspace.company?.name, workspace.profile?.email, workspace.profile?.first_name, workspace.profile?.last_name]);

  async function exportPdf() {
    setExporting(true);
    setError("");
    try {
      const source = workspace.company || workspace.profile;
      const response = await fetch("/api/customers/ledger/pdf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customer: {
            name: String(customer.name || "Customer"),
            taxId: String(customer.tax_id || customer.nui || ""),
            fiscalNumber: String(customer.fiscal_number || ""),
            businessNumber: String(customer.vat_number || ""),
            email: String(customer.email || ""),
            phone: String(customer.phone || ""),
            address: [customer.address, customer.city, customer.country].filter(Boolean).join(", "),
          },
          company: {
            name: String(source?.company_name || workspace.company?.name || "OperiX"),
            taxId: String(source?.tax_id || ""),
            vatNumber: "",
            email: String(source?.email || ""),
            phone: String(source?.phone || ""),
            address: [source?.address, workspace.company?.city, workspace.company?.country].filter(Boolean).join(", "),
            website: String(source?.website || ""),
            bankName: String(source?.bank_name || ""),
            iban: String(source?.bank_iban || source?.bank_account || ""),
            logoUrl: String(source?.logo_url || ""),
          },
          range: { from, to },
          summary: {
            openingBalance: ledger.openingBalance,
            totalDebit: ledger.totalDebit,
            totalCredit: ledger.totalCredit,
            closingBalance: ledger.closingBalance,
            totalPayments: ledger.totalPayments,
          },
          entries: ledger.entries,
        }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.error || "PDF-ja nuk mund të gjenerohej.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `kartela-e-bleresit-${String(customer.name || "customer").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "PDF-ja nuk mund të gjenerohej.");
    } finally {
      setExporting(false);
    }
  }

  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#061a38]/55 p-3 sm:p-6" onMouseDown={onClose}>
    <section className="card flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden shadow-2xl" onMouseDown={(event) => event.stopPropagation()} aria-modal="true" role="dialog" aria-labelledby="customer-ledger-title">
      <header className="flex items-start gap-4 border-b border-[#e4e9f0] p-4 sm:p-5">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#edf4ff] text-[#004ffe]"><FileSpreadsheet size={22}/></div>
        <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#004ffe]">Kartela e blerësit</p><h2 id="customer-ledger-title" className="mt-1 truncate text-lg font-semibold">{String(customer.name || "Customer")}</h2><p className="muted mt-1 text-xs">Faturat, pagesat dhe saldoja rrjedhëse e klientit.</p></div>
        <button className="icon-btn ml-auto shrink-0" onClick={onClose} aria-label="Close buyer ledger"><X size={18}/></button>
      </header>
      <div className="border-b border-[#e4e9f0] bg-[#f8faff] p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(150px,1fr)_minmax(150px,1fr)_auto_auto] sm:items-end">
          <label className="field"><span>Nga data</span><input className="input" type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)}/></label>
          <label className="field"><span>Deri më</span><input className="input" type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)}/></label>
          <label className="flex h-10 items-center gap-2 rounded-md border border-[#d8e0ea] bg-white px-3 text-xs"><input type="checkbox" checked={includeDrafts} onChange={(event) => setIncludeDrafts(event.target.checked)}/>Përfshi draftet</label>
          <button className="btn justify-center" onClick={load} disabled={loading}><RefreshCw size={16} className={loading ? "animate-spin" : ""}/>Rifresko</button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px bg-[#e4e9f0] sm:grid-cols-4">
        {[["Saldo paraprake", ledger.openingBalance], ["Debi", ledger.totalDebit], ["Kredi", ledger.totalCredit], ["Saldo", ledger.closingBalance]].map(([label, value]) => <div className="bg-white p-4" key={String(label)}><p className="muted text-[10px] uppercase tracking-wide">{label}</p><strong className={`mt-1 block text-base ${label === "Saldo" ? "text-[#004ffe]" : ""}`}>{money(Number(value))}</strong></div>)}
      </div>
      {error && <p className="mx-4 mt-4 rounded-md bg-[#fff3f2] p-3 text-xs text-[#d92d20] sm:mx-5">{error}</p>}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="data-table min-w-[980px]">
          <thead><tr><th>Dokumenti</th><th>Data</th><th>Lloji</th><th>Dok. i lidhur</th><th>Përshkrimi</th><th>Saldo paraprake</th><th>Debi</th><th>Kredi</th><th>Saldo</th><th>Pagesa</th><th>Mbetur</th></tr></thead>
          <tbody>{loading ? <tr><td colSpan={11} className="py-16 text-center muted">Duke ngarkuar kartelën…</td></tr> : ledger.entries.length ? ledger.entries.map((entry) => <tr key={`${entry.kind}-${entry.id}`}><td className="font-medium">{entry.document}</td><td>{shortDate(entry.date)}</td><td>{entry.documentType}</td><td>{entry.linkedDocument}</td><td className="max-w-[220px] truncate">{entry.description}</td><td className="text-right">{money(entry.openingBalance)}</td><td className="text-right">{money(entry.debit)}</td><td className="text-right">{money(entry.credit)}</td><td className="text-right font-semibold">{money(entry.balance)}</td><td className="text-right">{money(entry.payment)}</td><td className="text-right">{money(entry.remaining)}</td></tr>) : <tr><td colSpan={11} className="py-16 text-center muted">Nuk ka dokumente për intervalin e zgjedhur.</td></tr>}</tbody>
        </table>
      </div>
      <footer className="flex flex-col gap-2 border-t border-[#e4e9f0] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"><p className="muted text-xs">{ledger.entries.length} dokumente · Intervali {shortDate(from)} – {shortDate(to)}</p><div className="flex gap-2"><button className="btn flex-1 justify-center sm:flex-none" onClick={onClose}>Mbyll</button><button className="btn btn-primary flex-1 justify-center sm:flex-none" onClick={exportPdf} disabled={loading || exporting}><Download size={16}/>{exporting ? "Duke përgatitur…" : "Shkarko PDF"}</button></div></footer>
    </section>
  </div>;
}
