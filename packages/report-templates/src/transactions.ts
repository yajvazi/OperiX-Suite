export type TransactionReportTemplate =
  "expense-register" | "income-payment" | "sales-ledger" | "vendor-ledger";

export type TransactionReportCompany = {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  website?: string;
  taxId?: string;
  bankName?: string;
  bankAccount?: string;
  iban?: string;
  swift?: string;
  logoUrl?: string;
};

export type TransactionReportPayload = {
  template: TransactionReportTemplate;
  title: string;
  company?: TransactionReportCompany;
  rows: Record<string, unknown>[];
  reportPeriod?: {
    from: string;
    to: string;
    label?: string;
    filingFrequency?: "monthly" | "quarterly";
  };
};

type Row = Record<string, unknown>;
const esc = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char]!,
  );
const num = (value: unknown) => Number(value || 0) || 0;
const money = (value: unknown) =>
  new Intl.NumberFormat("sq-AL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num(value));
const date = (value: unknown) => {
  if (!value) return "—";
  const parsed = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? esc(value)
    : new Intl.DateTimeFormat("sq-AL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(parsed);
};
const relation = (row: Row, key: string) =>
  row[key] && typeof row[key] === "object" ? (row[key] as Row) : {};
const period = (rows: Row[], key: string) => {
  const values = rows
    .map((row) => String(row[key] || "").slice(0, 10))
    .filter(Boolean)
    .sort();
  const today = new Date().toISOString().slice(0, 10);
  return { from: values[0] || today, to: values.at(-1) || today };
};

const baseCss = `
*{box-sizing:border-box}html,body{margin:0;padding:0;color:#101828;font-family:Arial,Helvetica,sans-serif}
body{font-size:10px}.page{min-height:100vh;padding:12mm 13mm;display:flex;flex-direction:column;background:#fff}
.company-head{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:1.5px solid #101828;padding-bottom:10px}
.company-name{font-size:23px;font-weight:800;letter-spacing:.02em}.company-sub{font-size:11px;font-weight:700;margin-top:5px}
.brand-logo{max-width:160px;max-height:55px;object-fit:contain}.document-mark{text-align:center;margin:13px 0 8px}
.document-mark h1{font-size:18px;margin:0 0 3px}.document-number{font-weight:700}
.info-row{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #98a2b3;margin:8px 0 10px}
.info-cell{padding:7px;border-right:1px solid #98a2b3}.info-cell:last-child{border-right:0}
.label{font-size:8px;color:#667085;font-weight:700;text-transform:uppercase}.value{font-weight:700;margin-top:3px}
table{width:100%;border-collapse:collapse}th{background:#30343b;color:#fff;font-size:8px;padding:6px 5px;border:1px solid #20242a;text-align:left}
td{border:1px solid #98a2b3;padding:6px 5px;vertical-align:top}td.num,th.num{text-align:right}
.totals{margin:10px 0 0 auto;width:43%;border:1px solid #98a2b3;padding:7px}.totals-row{display:flex;justify-content:space-between;gap:12px;padding:3px 0}
.totals-row.grand{font-size:13px;font-weight:800;border-top:1.5px solid #101828;border-bottom:1.5px solid #101828;margin-top:4px;padding:6px 0}
.signatures{margin-top:auto;display:grid;grid-template-columns:repeat(3,1fr);gap:28px;padding-top:25px}
.signature{border-top:1px solid #101828;text-align:center;padding-top:5px}
.footer{border-top:1px solid #101828;margin-top:14px;padding-top:7px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;font-size:8px}
.footer-center{text-align:center}.footer-right{text-align:right}.ledger-page{padding:9mm 8mm}
.ledger-title{text-align:center;font-size:16px;font-weight:800;margin-bottom:3px}.ledger-company{text-align:center;margin-bottom:10px}
.ledger-table th{font-size:6px;padding:3px 2px;text-align:center}.ledger-table td{font-size:6px;padding:3px 2px}
.ledger-table tfoot td{font-weight:800;background:#f2f4f7}.period{display:flex;justify-content:space-between;margin:5px 0 8px;font-weight:700}
.page-note{margin-top:10px;text-align:right;font-size:8px;color:#667085}
@page{size:A4;margin:0}@media print{thead{display:table-header-group}tfoot{display:table-footer-group}tr{break-inside:avoid}.page{break-after:page}}
`;

const companyHeader = (payload: TransactionReportPayload, subtitle: string) => {
  const company = payload.company || {};
  const identity = company.logoUrl
    ? `<img class="brand-logo" src="${esc(company.logoUrl)}" alt="">`
    : `<div class="company-name">${esc(company.name || "OperiX")}</div>`;
  return `<div class="company-head"><div>${identity}<div class="company-sub">${esc(subtitle)}</div></div><div style="text-align:right"><b>${esc(company.name || "")}</b><br>${esc(company.taxId || "")}</div></div>`;
};
const footer = (payload: TransactionReportPayload) => {
  const company = payload.company || {};
  return `<div class="footer"><div><b>Detajet bankare:</b> ${esc(company.bankName || "—")}<br>IBAN: ${esc(company.iban || company.bankAccount || "—")}</div><div class="footer-center">${esc([company.address, company.city, company.country].filter(Boolean).join(", "))}<br>${esc(company.phone || "")}</div><div class="footer-right">${esc(company.email || "")}<br>${esc(company.website || "")}<br>© OperiX Invoice</div></div>`;
};
const signatures = (labels: string[]) =>
  `<div class="signatures">${labels.map((label) => `<div class="signature">${esc(label)}</div>`).join("")}</div>`;
const htmlDocument = (body: string, landscape = false) =>
  `<!doctype html><html lang="sq"><head><meta charset="utf-8"><style>${baseCss}${landscape ? "@page{size:A4 landscape;margin:0}" : ""}</style></head><body>${body}</body></html>`;

function expenseReport(payload: TransactionReportPayload) {
  const total = payload.rows.reduce((sum, row) => sum + num(row.amount), 0);
  const range = period(payload.rows, "date");
  const rows = payload.rows
    .map(
      (row, index) =>
        `<tr><td>${index + 1}</td><td>${esc(row.vendor_name || "—")}</td><td>${esc(row.description || "—")}</td><td>${esc(row.category || "—")}</td><td class="num">${money(row.amount)} EUR</td><td class="num">0,00 EUR</td><td class="num">${money(row.amount)} EUR</td></tr>`,
    )
    .join("");
  return htmlDocument(`<main class="page">${companyHeader(payload, "REGJISTËR I SHPENZIMEVE")}
  <div class="document-mark"><h1>Blerje / Shpenzime</h1><div class="document-number">${esc(payload.title)}</div></div>
  <div class="info-row"><div class="info-cell"><div class="label">Periudha nga</div><div class="value">${date(range.from)}</div></div><div class="info-cell"><div class="label">Periudha deri</div><div class="value">${date(range.to)}</div></div><div class="info-cell"><div class="label">Referenca</div><div class="value">Regjistri i shpenzimeve</div></div><div class="info-cell"><div class="label">Valuta</div><div class="value">EUR</div></div></div>
  <table><thead><tr><th>Nr.</th><th>Furnitori</th><th>Përshkrimi</th><th>Kategoria</th><th class="num">Vlera</th><th class="num">TVSH</th><th class="num">Për pagesë</th></tr></thead><tbody>${rows || `<tr><td colspan="7">Nuk ka të dhëna për periudhën.</td></tr>`}</tbody></table>
  <div class="totals"><div class="totals-row"><span>Vlera:</span><b>${money(total)} EUR</b></div><div class="totals-row grand"><span>Vlera për pagesë:</span><span>${money(total)} EUR</span></div></div>${signatures(["Përgatiti", "Kontrolloi", "Pranoi"])}${footer(payload)}</main>`);
}

function incomeReport(payload: TransactionReportPayload) {
  const total = payload.rows.reduce((sum, row) => sum + num(row.amount), 0);
  const remaining = payload.rows.reduce((sum, row) => {
    const invoice = relation(row, "invoice");
    return (
      sum +
      Math.max(0, num(invoice.total_amount || row.amount) - num(row.amount))
    );
  }, 0);
  const rows = payload.rows
    .map((row, index) => {
      const invoice = relation(row, "invoice");
      const client = relation(row, "client");
      const balance = Math.max(
        0,
        num(invoice.total_amount || row.amount) - num(row.amount),
      );
      return `<tr><td>${index + 1}</td><td>${esc(invoice.invoice_number || row.payment_number || row.id || "—")}</td><td>${esc(client.name || row.vendor_name || "—")}</td><td>${esc(row.notes || row.description || row.payment_method || "—")}</td><td class="num">${money(invoice.total_amount || row.amount)} EUR</td><td class="num">${money(row.amount)} EUR</td><td class="num">${money(balance)} EUR</td></tr>`;
    })
    .join("");
  return htmlDocument(`<main class="page">${companyHeader(payload, "DOKUMENT I PAGESËS HYRËSE")}
  <div class="document-mark"><h1>Pagesat hyrëse</h1><div class="document-number">${esc(payload.title)}</div></div>
  <table><thead><tr><th>Nr.</th><th>Dokumenti</th><th>Subjekti</th><th>Përshkrimi</th><th class="num">Për pagesë</th><th class="num">Pagesa</th><th class="num">Mbetja</th></tr></thead><tbody>${rows || `<tr><td colspan="7">Nuk ka të dhëna për periudhën.</td></tr>`}</tbody><tfoot><tr><td colspan="5"><b>Gjithsej</b></td><td class="num"><b>${money(total)} EUR</b></td><td class="num"><b>${money(remaining)} EUR</b></td></tr></tfoot></table>
  ${signatures(["Arkëtari", "Likuiduesi", "Subjekti"])}${footer(payload)}</main>`);
}

export type KosovoSalesBookAmounts = {
  exemptNoCredit: number;
  foreignServices: number;
  domesticReverseCharge: number;
  exemptWithCredit: number;
  exemptWithCreditTotal: number;
  exports: number;
  standardBase: number;
  debitCredit18: number;
  badDebt18: number;
  adjustment18: number;
  reverseChargePurchase18: number;
  outputVat18: number;
  reducedBase: number;
  debitCredit8: number;
  badDebt8: number;
  adjustment8: number;
  outputVat8: number;
  outputVatTotal: number;
};

const emptySalesBookAmounts = (): KosovoSalesBookAmounts => ({
  exemptNoCredit: 0, foreignServices: 0, domesticReverseCharge: 0,
  exemptWithCredit: 0, exemptWithCreditTotal: 0, exports: 0,
  standardBase: 0, debitCredit18: 0, badDebt18: 0, adjustment18: 0,
  reverseChargePurchase18: 0, outputVat18: 0, reducedBase: 0,
  debitCredit8: 0, badDebt8: 0, adjustment8: 0, outputVat8: 0,
  outputVatTotal: 0,
});

const invoiceNetAndVatByRate = (row: Row) => {
  const items = Array.isArray(row.items) ? row.items as Row[] : [];
  if (items.length) {
    return items.reduce<{ standard: number; reduced: number; zero: number }>((result, item) => {
      const net = num(item.quantity) * num(item.unit_price) * (1 - num(item.discount) / 100);
      const rate = num(item.tax_rate);
      if (rate === 8) result.reduced += net;
      else if (rate === 18) result.standard += net;
      else result.zero += net;
      return result;
    }, {standard: 0, reduced: 0, zero: 0});
  }
  const total = num(row.total_amount);
  const tax = num(row.tax_amount);
  const net = Math.max(0, total - tax);
  const effectiveRate = net ? Math.round((tax / net) * 100) : 0;
  return {
    standard: effectiveRate === 18 ? net : 0,
    reduced: effectiveRate === 8 ? net : 0,
    zero: effectiveRate !== 18 && effectiveRate !== 8 ? net : 0,
  };
};

export function kosovoSalesBookAmounts(row: Row): KosovoSalesBookAmounts {
  const result = emptySalesBookAmounts();
  const category = String(row.tax_reporting_category || "");
  const bases = invoiceNetAndVatByRate(row);
  const totalNet = bases.standard + bases.reduced + bases.zero;
  const amount = totalNet || Math.max(0, num(row.total_amount) - num(row.tax_amount));

  if (category === "domestic_standard_18") result.standardBase = amount;
  else if (category === "domestic_reduced_8") result.reducedBase = amount;
  else if (category === "exempt_no_credit") result.exemptNoCredit = amount;
  else if (category === "foreign_services") result.foreignServices = amount;
  else if (category === "domestic_reverse_charge") result.domesticReverseCharge = amount;
  else if (category === "exempt_with_credit" || category === "international_organization") result.exemptWithCredit = amount;
  else if (category === "export") result.exports = amount;
  else if (category === "debit_credit_18") result.debitCredit18 = amount;
  else if (category === "bad_debt_18") result.badDebt18 = amount;
  else if (category === "vat_adjustment_18") result.adjustment18 = amount;
  else if (category === "reverse_charge_purchase_18") result.reverseChargePurchase18 = amount;
  else if (category === "debit_credit_8") result.debitCredit8 = amount;
  else if (category === "bad_debt_8") result.badDebt8 = amount;
  else if (category === "vat_adjustment_8") result.adjustment8 = amount;
  else {
    result.standardBase = bases.standard;
    result.reducedBase = bases.reduced;
    if (!category && bases.zero) result.exemptNoCredit = bases.zero;
  }
  result.exemptWithCreditTotal = result.foreignServices + result.domesticReverseCharge + result.exemptWithCredit;
  result.outputVat18 = (result.standardBase + result.debitCredit18 + result.badDebt18 + result.adjustment18 + result.reverseChargePurchase18) * .18;
  result.outputVat8 = (result.reducedBase + result.debitCredit8 + result.badDebt8 + result.adjustment8) * .08;
  result.outputVatTotal = result.outputVat18 + result.outputVat8;
  return result;
}

/**
 * TAK permits reserved one-digit identifiers in the Sales Book for transaction
 * classes that are not reported against a normal Kosovo NUI/fiscal number.
 * Ordinary B2B rows retain the customer's actual identifier.
 */
export function kosovoSalesBookBuyerIdentifier(row: Row, client: Row = {}) {
  const category = String(row.tax_reporting_category || "");
  const specialCodes: Record<string, string> = {
    foreign_services: "2",
    export: "3",
    vat_adjustment_18: "4",
    vat_adjustment_8: "5",
    domestic_reverse_charge: "6",
    reverse_charge_purchase_18: "6",
    international_organization: "7",
  };

  return (
    specialCodes[category] ||
    String(client.nui || client.fiscal_number || client.tax_id || "1")
  );
}

function ledgerReport(payload: TransactionReportPayload, purchase: boolean) {
  const rows = purchase
    ? payload.rows
    : payload.rows.filter(
        (row) =>
          String(row.status || "") !== "cancelled" &&
          String(row.type || "") !== "offer",
      );
  const range = payload.reportPeriod || period(rows, "issue_date");
  if (!purchase) return salesLedgerReport(payload, rows, range);
  let gross = 0;
  let base = 0;
  let vat = 0;
  const body = rows
    .map((row, index) => {
      const party = relation(row, purchase ? "vendor" : "client");
      const total = num(row.total_amount);
      const tax = num(row.tax_amount);
      gross += total;
      vat += tax;
      base += Math.max(0, total - tax);
      return `<tr><td>${index + 1}</td><td>${date(row.issue_date)}</td><td>${esc(purchase ? row.bill_number || "—" : row.invoice_number || "—")}</td><td>${esc(party.name || "—")}</td><td>${esc(party.fiscal_number || party.tax_id || party.nui || "—")}</td><td>${esc(party.vat_number || "—")}</td><td>${purchase ? "Blerje" : esc(row.type || "Faturë")}</td><td class="num">${money(total)}</td><td class="num">0,00</td><td class="num">${money(total - tax)}</td><td class="num">${money(tax)}</td></tr>`;
    })
    .join("");
  const label = purchase ? "LIBRI I BLERJES" : "LIBRI I SHITJES";
  return htmlDocument(
    `<main class="page ledger-page"><div class="ledger-title">${label}</div><div class="ledger-company"><b>${esc(payload.company?.name || "")}</b> · Numri fiskal: ${esc(payload.company?.taxId || "—")}</div><div class="period"><span>Periudha: ${date(range.from)} — ${date(range.to)}</span><span>Valuta: EUR</span></div>
  <table class="ledger-table"><thead><tr><th>Nr.</th><th>Data</th><th>Nr. i faturës</th><th>${purchase ? "Shitësi / Furnitori" : "Blerësi"}</th><th>Nr. fiskal</th><th>Nr. TVSH</th><th>Lloji</th><th>${purchase ? "Blerjet" : "Shitjet"} totale</th><th>Të liruara</th><th>Baza e tatueshme</th><th>TVSH</th></tr></thead><tbody>${body || `<tr><td colspan="11">Nuk ka të dhëna për periudhën.</td></tr>`}</tbody><tfoot><tr><td colspan="7">GJITHSEJ</td><td class="num">${money(gross)}</td><td class="num">0,00</td><td class="num">${money(base)}</td><td class="num">${money(vat)}</td></tr></tfoot></table><div class="page-note">Gjeneruar nga OperiX Invoice · ${date(new Date().toISOString())}</div></main>`,
    true,
  );
}

function salesLedgerReport(payload: TransactionReportPayload, rows: Row[], range: {from:string;to:string;label?:string;filingFrequency?:string}) {
  const totals = emptySalesBookAmounts();
  const keys = Object.keys(totals) as Array<keyof KosovoSalesBookAmounts>;
  const body = rows.map((row,index)=>{
    const client=relation(row,"client");
    const values=kosovoSalesBookAmounts(row);
    keys.forEach(key=>{totals[key]+=values[key];});
    const cells=[
      index+1,date(row.issue_date),row.invoice_number||"—",client.name||"—",
      kosovoSalesBookBuyerIdentifier(row,client),client.vat_number||"—",
      values.exemptNoCredit,values.foreignServices,values.domesticReverseCharge,
      values.exemptWithCredit,values.exemptWithCreditTotal,values.exports,
      values.standardBase,values.debitCredit18,values.badDebt18,values.adjustment18,
      values.reverseChargePurchase18,values.outputVat18,values.reducedBase,
      values.debitCredit8,values.badDebt8,values.adjustment8,values.outputVat8,
      values.outputVatTotal,
    ];
    return `<tr>${cells.map((value,cellIndex)=>`<td class="${cellIndex>5?"num":""}">${cellIndex>5?money(value):esc(value)}</td>`).join("")}</tr>`;
  }).join("");
  const totalCells=[
    totals.exemptNoCredit,totals.foreignServices,totals.domesticReverseCharge,
    totals.exemptWithCredit,totals.exemptWithCreditTotal,totals.exports,
    totals.standardBase,totals.debitCredit18,totals.badDebt18,totals.adjustment18,
    totals.reverseChargePurchase18,totals.outputVat18,totals.reducedBase,
    totals.debitCredit8,totals.badDebt8,totals.adjustment8,totals.outputVat8,
    totals.outputVatTotal,
  ];
  const headers=[
    "Nr.","Data","Nr. faturës","Blerësi","NUI / NF","Nr. TVSH",
    "9 · Liruar pa kreditim","10a · Shërbime jashtë KS","10b · Ngarkesë e kundërt",
    "10c · Tjera me kreditim","10 · Gjithsej 10a–c","11 · Eksport",
    "12 · Bazë 18%","16 · DN/CN 18%","20 · Borxh i keq 18%","24 · Rritje 18%",
    "28 · Reverse charge 18%","K1 · TVSH 18%","14 · Bazë 8%","18 · DN/CN 8%",
    "22 · Borxh i keq 8%","26 · Rritje 8%","K2 · TVSH 8%","30 · TVSH gjithsej",
  ];
  return htmlDocument(`<main class="page ledger-page"><div class="ledger-title">LIBRI I SHITJES</div><div class="ledger-company"><b>${esc(payload.company?.name||"")}</b> · Numri fiskal: ${esc(payload.company?.taxId||"—")}</div><div class="period"><span>Periudha: ${date(range.from)} — ${date(range.to)}</span><span>${esc(range.filingFrequency==="quarterly"?"Deklarim tremujor":"Deklarim mujor")} · EUR</span></div>
  <table class="ledger-table"><thead><tr>${headers.map(header=>`<th>${esc(header)}</th>`).join("")}</tr></thead><tbody>${body||`<tr><td colspan="${headers.length}">Nuk ka të dhëna për periudhën.</td></tr>`}</tbody><tfoot><tr><td colspan="6">GJITHSEJ</td>${totalCells.map(value=>`<td class="num">${money(value)}</td>`).join("")}</tr></tfoot></table><div class="page-note">Klasifikimi ndjek rubrikat e Librit të Shitjes të TAK. Gjeneruar nga OperiX Invoice · ${date(new Date().toISOString())}</div></main>`,true);
}

export const isLandscapeTransactionReport = (
  template: TransactionReportTemplate,
) => template === "sales-ledger" || template === "vendor-ledger";

export function renderTransactionReportHtml(payload: TransactionReportPayload) {
  if (payload.template === "expense-register") return expenseReport(payload);
  if (payload.template === "income-payment") return incomeReport(payload);
  return ledgerReport(payload, payload.template === "vendor-ledger");
}
