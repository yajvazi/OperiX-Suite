export type LedgerKind = "invoice" | "payment";

export interface CustomerLedgerInvoice {
  id: string;
  invoice_number: string;
  issue_date: string;
  status?: string | null;
  type?: string | null;
  subtype?: string | null;
  total_amount?: number | null;
  payment_method?: string | null;
  notes?: string | null;
  created_at?: string | null;
  organization_unit?: string | null;
  account_code?: string | null;
  previous_document?: string | null;
  reference?: string | null;
  subject_goods?: string | null;
  agent_name?: string | null;
  currency?: string | null;
  created_by_name?: string | null;
}

export interface CustomerLedgerPayment {
  id: string;
  payment_number?: string | null;
  payment_date: string;
  amount?: number | null;
  payment_method?: string | null;
  bank_reference?: string | null;
  notes?: string | null;
  invoice_id?: string | null;
  invoice_number?: string | null;
  created_at?: string | null;
  organization_unit?: string | null;
  account_code?: string | null;
  previous_document?: string | null;
  reference?: string | null;
  subject_goods?: string | null;
  agent_name?: string | null;
  currency?: string | null;
  created_by_name?: string | null;
}

export interface CustomerLedgerEntry {
  id: string;
  kind: LedgerKind;
  document: string;
  number: string;
  date: string;
  account: string;
  documentType: string;
  previousDocument: string;
  linkedDocument: string;
  supplierInvoice: string;
  reference: string;
  description: string;
  subjectGoods: string;
  agent: string;
  paymentMethod: string;
  organizationalUnit: string;
  openingBalance: number;
  debit: number;
  credit: number;
  balance: number;
  currency: string;
  foreignOpeningBalance: number;
  foreignDebit: number;
  foreignCredit: number;
  foreignBalance: number;
  payment: number;
  remaining: number;
  utilization: number;
  user: string;
  createdAt: string;
}

export interface CustomerLedger {
  entries: CustomerLedgerEntry[];
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  totalPayments: number;
}

export interface BuildCustomerLedgerOptions {
  invoices: CustomerLedgerInvoice[];
  payments: CustomerLedgerPayment[];
  from: string;
  to: string;
  includeDrafts?: boolean;
  customerName?: string;
  organizationUnit?: string;
  userName?: string;
}

export interface LedgerParty {
  name: string;
  taxId?: string;
  fiscalNumber?: string;
  businessNumber?: string;
  email?: string;
  phone?: string;
  address?: string;
}

export interface ReportCompany {
  name: string;
  taxId?: string;
  vatNumber?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
  bankName?: string;
  iban?: string;
  logoUrl?: string;
}

export interface CustomerLedgerReport {
  customer: LedgerParty;
  company: ReportCompany;
  range: { from: string; to: string };
  summary: Omit<CustomerLedger, "entries">;
  entries: CustomerLedgerEntry[];
}

const cents = (value: unknown) => Math.round((Number(value) || 0) * 100);
const amount = (value: number) => value / 100;
const normalizedDate = (value: string | null | undefined) =>
  String(value || "").slice(0, 10);

function invoiceIsPosted(
  invoice: CustomerLedgerInvoice,
  includeDrafts: boolean,
) {
  const status = String(invoice.status || "").toLowerCase();
  const type = String(invoice.type || "").toLowerCase();
  const subtype = String(invoice.subtype || "").toLowerCase();
  if (status === "cancelled") return false;
  if (!includeDrafts && status === "draft") return false;
  return type !== "offer" && subtype !== "delivery_note";
}

export function buildCustomerLedger({
  invoices,
  payments,
  from,
  to,
  includeDrafts = false,
  customerName = "—",
  organizationUnit = "—",
  userName = "—",
}: BuildCustomerLedgerOptions): CustomerLedger {
  const invoiceEvents = invoices
    .filter((invoice) => invoiceIsPosted(invoice, includeDrafts))
    .map((invoice) => ({
      id: invoice.id,
      kind: "invoice" as const,
      document: invoice.invoice_number,
      number: invoice.invoice_number,
      date: normalizedDate(invoice.issue_date),
      account: invoice.account_code || "—",
      documentType: "Faturë",
      previousDocument: invoice.previous_document || "—",
      linkedDocument: "—",
      supplierInvoice: "—",
      reference: invoice.reference || invoice.invoice_number,
      description: invoice.notes || `Faturë ${invoice.invoice_number}`,
      subjectGoods: invoice.subject_goods || customerName,
      agent: invoice.agent_name || "—",
      paymentMethod: invoice.payment_method || "—",
      organizationalUnit: invoice.organization_unit || organizationUnit,
      currency: invoice.currency || "EUR",
      user: invoice.created_by_name || userName,
      debitCents: cents(invoice.total_amount),
      creditCents: 0,
      paymentCents: 0,
      createdAt: invoice.created_at || invoice.issue_date,
    }));

  const paymentEvents = payments.map((payment) => ({
    id: payment.id,
    kind: "payment" as const,
    document: payment.payment_number || `PAY-${payment.id.slice(0, 8)}`,
    number: payment.payment_number || payment.id.slice(0, 8),
    date: normalizedDate(payment.payment_date),
    account: payment.account_code || "—",
    documentType: "Pagesë",
    previousDocument: payment.previous_document || "—",
    linkedDocument: payment.invoice_number || "—",
    supplierInvoice: payment.invoice_number || "—",
    reference: payment.reference || payment.bank_reference || payment.invoice_number || "—",
    description:
      payment.notes ||
      `Pagesë${payment.invoice_number ? ` për ${payment.invoice_number}` : ""}`,
    subjectGoods: payment.subject_goods || customerName,
    agent: payment.agent_name || "—",
    paymentMethod: payment.payment_method || "—",
    organizationalUnit: payment.organization_unit || organizationUnit,
    currency: payment.currency || "EUR",
    user: payment.created_by_name || userName,
    debitCents: 0,
    creditCents: cents(payment.amount),
    paymentCents: cents(payment.amount),
    createdAt: payment.created_at || payment.payment_date,
  }));

  const events = [...invoiceEvents, ...paymentEvents]
    .filter((event) => event.date)
    .sort((left, right) => {
      const byDate = left.date.localeCompare(right.date);
      if (byDate) return byDate;
      if (left.kind !== right.kind) return left.kind === "invoice" ? -1 : 1;
      return left.createdAt.localeCompare(right.createdAt);
    });

  let runningCents = events
    .filter((event) => event.date < from)
    .reduce((sum, event) => sum + event.debitCents - event.creditCents, 0);
  const openingCents = runningCents;
  let totalDebitCents = 0;
  let totalCreditCents = 0;
  let totalPaymentCents = 0;

  const entries = events
    .filter((event) => event.date >= from && event.date <= to)
    .map((event) => {
      const rowOpeningCents = runningCents;
      runningCents += event.debitCents - event.creditCents;
      totalDebitCents += event.debitCents;
      totalCreditCents += event.creditCents;
      totalPaymentCents += event.paymentCents;
      return {
        id: event.id,
        kind: event.kind,
        document: event.document,
        number: event.number,
        date: event.date,
        account: event.account,
        documentType: event.documentType,
        previousDocument: event.previousDocument,
        linkedDocument: event.linkedDocument,
        supplierInvoice: event.supplierInvoice,
        reference: event.reference,
        description: event.description,
        subjectGoods: event.subjectGoods,
        agent: event.agent,
        paymentMethod: event.paymentMethod,
        organizationalUnit: event.organizationalUnit,
        openingBalance: amount(rowOpeningCents),
        debit: amount(event.debitCents),
        credit: amount(event.creditCents),
        balance: amount(runningCents),
        currency: event.currency,
        foreignOpeningBalance: amount(rowOpeningCents),
        foreignDebit: amount(event.debitCents),
        foreignCredit: amount(event.creditCents),
        foreignBalance: amount(runningCents),
        payment: amount(event.paymentCents),
        remaining: amount(Math.max(0, runningCents)),
        utilization:
          event.debitCents > 0
            ? Math.min(
                100,
                Math.max(
                  0,
                  Math.round((event.creditCents / event.debitCents) * 100),
                ),
              )
            : event.creditCents > 0
              ? 100
              : 0,
        user: event.user,
        createdAt: event.createdAt,
      };
    });

  return {
    entries,
    openingBalance: amount(openingCents),
    totalDebit: amount(totalDebitCents),
    totalCredit: amount(totalCreditCents),
    closingBalance: amount(runningCents),
    totalPayments: amount(totalPaymentCents),
  };
}

const esc = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );

const money = (value: number) =>
  new Intl.NumberFormat("sq-AL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const reportDate = (value: string) => {
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? esc(value)
    : new Intl.DateTimeFormat("sq-AL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(parsed);
};

export function renderCustomerLedgerHtml(payload: CustomerLedgerReport) {
  const { customer, company, range, summary, entries } = payload;
  const logo = company.logoUrl
    ? `<img class="logo" src="${esc(company.logoUrl)}" alt="">`
    : `<div class="company-name">${esc(company.name)}</div>`;
  const rows = entries
    .map(
      (entry, index) => `<tr>
    <td class="left">${esc(entry.document)}</td><td>${index + 1}</td><td>${reportDate(entry.date)}</td><td>${esc(entry.account)}</td>
    <td>${esc(entry.documentType)}</td><td class="left">${esc(entry.previousDocument)}</td><td class="left">${esc(entry.linkedDocument)}</td>
    <td class="left">${esc(entry.supplierInvoice)}</td><td class="left">${esc(entry.reference)}</td><td class="left">${esc(entry.description)}</td>
    <td class="left">${esc(entry.subjectGoods)}</td><td>${esc(entry.agent)}</td><td>${esc(entry.paymentMethod)}</td>
    <td>${esc(entry.organizationalUnit)}</td><td class="num">${money(entry.openingBalance)}</td>
    <td class="num">${money(entry.debit)}</td><td class="num">${money(entry.credit)}</td>
    <td class="num strong">${money(entry.balance)}</td><td>${esc(entry.currency)}</td>
    <td class="num">${money(entry.foreignOpeningBalance)}</td><td class="num">${money(entry.foreignDebit)}</td>
    <td class="num">${money(entry.foreignCredit)}</td><td class="num">${money(entry.foreignBalance)}</td>
    <td class="num">${money(entry.payment)}</td>
    <td class="num">${money(entry.remaining)}</td><td class="num">${entry.utilization.toFixed(0)}%</td>
    <td>${esc(entry.user)}</td><td>${reportDate(entry.createdAt)}</td></tr>`,
    )
    .join("");

  return `<!doctype html><html lang="sq"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;color:#101828;font-family:Arial,Helvetica,sans-serif}
    @page{size:A4 landscape;margin:0}.page{width:297mm;min-height:210mm;padding:9mm 6mm 7mm;display:flex;flex-direction:column;background:#fff}
    .head{display:flex;align-items:flex-start;justify-content:space-between;gap:24px}.logo{max-width:108mm;max-height:22mm;object-fit:contain;object-position:left top}
    .company-name{font-size:24px;font-weight:900}.subject{text-align:right;font-size:10px;line-height:1.5}.subject b{font-size:13px}
    .range{text-align:right;font-size:11px;font-weight:700;margin:3px 0 8px}table{width:100%;border-collapse:collapse;table-layout:fixed}
    th{background:#d0d0d0;border:1px solid #999;padding:3px 1px;font-size:5.2px;line-height:1.1;text-align:center}
    td{border:1px solid #a9a9a9;padding:2px 1px;font-size:5.1px;text-align:center;overflow-wrap:anywhere}.left{text-align:left}
    .num{text-align:right;font-variant-numeric:tabular-nums}.strong{font-weight:800}tfoot td{background:#d0d0d0;font-weight:800}
    .summary{margin:10px 8% 0 auto;width:60mm;font-size:11px}.summary-row{display:flex;justify-content:space-between;gap:20px;padding:2px 0}
    .summary-row.balance{font-size:14px;border-bottom:2px solid #101828;font-weight:900}
    .footer{margin-top:auto;border-top:1px solid #101828;padding-top:5px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;font-size:7.5px;line-height:1.35}
    .footer-center{text-align:center}.footer-right{text-align:right}thead{display:table-header-group}tr{break-inside:avoid}
  </style></head><body><main class="page">
    <header class="head"><div>${logo}</div><div class="subject"><b>Kartela e Blerësit: ${esc(customer.name)}</b><br>Nr. identifikues: ${esc(customer.taxId || customer.fiscalNumber || "—")}<br>Nr. fiskal: ${esc(customer.fiscalNumber || customer.taxId || "—")}<br>Nr. i biznesit: ${esc(customer.businessNumber || "—")}</div></header>
    <div class="range">Intervali: ${reportDate(range.from)} - ${reportDate(range.to)}</div>
    <table>
    <thead><tr><th>Dokumenti</th><th>Nr.</th><th>Data</th><th>Llogaria</th><th>Lloji i dokumentit</th><th>Dok. paraprak</th><th>Dok. i ndërlidhur</th><th>Fatura e furnitorit</th><th>Referenca</th><th>Përshkrimi</th><th>Subjekti / Malli</th><th>Agjenti</th><th>Mënyra e pagesës</th><th>Njësia org.</th><th>Saldo paraprake</th><th>Debi</th><th>Kredi</th><th>Saldo</th><th>Valuta</th><th>Saldo e jashtme</th><th>Debi e jashtme</th><th>Kredi e jashtme</th><th>Saldo e jashtme përfund.</th><th>Pagesa</th><th>Mbetur</th><th>Përqindja</th><th>Përdoruesi</th><th>Data e krijimit</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="28" style="padding:18px">Nuk ka dokumente për intervalin e zgjedhur.</td></tr>`}</tbody>
    <tfoot><tr><td class="left">Dokumentet: ${entries.length}</td><td colspan="13"></td><td class="num">${money(summary.openingBalance)}</td><td class="num">${money(summary.totalDebit)}</td><td class="num">${money(summary.totalCredit)}</td><td class="num">${money(summary.closingBalance)}</td><td>EUR</td><td class="num">${money(summary.openingBalance)}</td><td class="num">${money(summary.totalDebit)}</td><td class="num">${money(summary.totalCredit)}</td><td class="num">${money(summary.closingBalance)}</td><td class="num">${money(summary.totalPayments)}</td><td class="num">${money(Math.max(0, summary.closingBalance))}</td><td colspan="3"></td></tr></tfoot></table>
    <section class="summary"><div class="summary-row"><span>Kërkesa:</span><b>${money(summary.totalDebit + Math.max(0, summary.openingBalance))}</b></div><div class="summary-row"><span>Obligimi:</span><b>${money(summary.totalCredit)}</b></div><div class="summary-row balance"><span>Saldo:</span><span>${money(summary.closingBalance)}</span></div></section>
    <footer class="footer"><div>Nr. ID: ${esc(company.taxId || "—")}<br>Nr. TVSH: ${esc(company.vatNumber || "—")}<br>${esc(company.bankName || "")}${company.iban ? ` · IBAN: ${esc(company.iban)}` : ""}</div><div class="footer-center">${esc(company.address || "")}<br>${esc(company.phone || "")}</div><div class="footer-right">${esc(company.email || "")}<br>${esc(company.website || "")}<br>© OperiX Invoice</div></footer>
  </main></body></html>`;
}

export * from "./transactions";
