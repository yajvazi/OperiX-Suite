import { NextResponse } from "next/server";
import { z } from "zod";
import puppeteer from "puppeteer-core";

export const runtime="nodejs";

const companySchema=z.object({
  name:z.string().optional(),email:z.string().optional(),phone:z.string().optional(),
  address:z.string().optional(),city:z.string().optional(),country:z.string().optional(),
  website:z.string().optional(),taxId:z.string().optional(),bankName:z.string().optional(),
  bankAccount:z.string().optional(),iban:z.string().optional(),swift:z.string().optional(),
  logoUrl:z.string().optional(),
}).optional();
const schema=z.object({
  template:z.enum(["expense-register","income-payment","sales-ledger","vendor-ledger"]),
  title:z.string(),company:companySchema,rows:z.array(z.record(z.string(),z.unknown())),
});
type Payload=z.infer<typeof schema>;
type Row=Record<string,unknown>;
const esc=(value:unknown)=>String(value??"").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]!));
const number=(value:unknown)=>Number(value||0)||0;
const money=(value:unknown)=>new Intl.NumberFormat("sq-AL",{minimumFractionDigits:2,maximumFractionDigits:2}).format(number(value));
const date=(value:unknown)=>{if(!value)return "—";const parsed=new Date(`${String(value).slice(0,10)}T12:00:00`);return Number.isNaN(parsed.getTime())?esc(value):new Intl.DateTimeFormat("sq-AL",{day:"2-digit",month:"2-digit",year:"numeric"}).format(parsed);};
const relation=(row:Row,key:string)=>row[key]&&typeof row[key]==="object"?(row[key] as Row):{};
const baseCss=`
  *{box-sizing:border-box}html,body{margin:0;padding:0;color:#101828;font-family:Arial,Helvetica,sans-serif}
  body{font-size:10px}.page{min-height:100vh;padding:12mm 13mm;display:flex;flex-direction:column;background:#fff}
  .company-head{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:1.5px solid #101828;padding-bottom:10px}
  .company-name{font-size:23px;font-weight:800;letter-spacing:.02em}.company-sub{font-size:11px;font-weight:700;margin-top:5px}
  .brand-logo{max-width:160px;max-height:55px;object-fit:contain}.meta-panels{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
  .panel{background:#f2f4f7;border:1px solid #d0d5dd;padding:9px 10px;min-height:72px}.panel-title{font-size:9px;text-transform:uppercase;color:#667085;font-weight:700;margin-bottom:6px}
  .details{display:grid;grid-template-columns:auto 1fr;gap:3px 10px}.details b{font-weight:700}
  .document-mark{text-align:center;margin:13px 0 8px}.document-mark h1{font-size:18px;margin:0 0 3px}.document-number{font-weight:700}
  .info-row{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #98a2b3;margin:8px 0 10px}.info-cell{padding:7px;border-right:1px solid #98a2b3}.info-cell:last-child{border-right:0}.label{font-size:8px;color:#667085;font-weight:700;text-transform:uppercase}.value{font-weight:700;margin-top:3px}
  table{width:100%;border-collapse:collapse}th{background:#30343b;color:#fff;font-size:8px;padding:6px 5px;border:1px solid #20242a;text-align:left}td{border:1px solid #98a2b3;padding:6px 5px;vertical-align:top}td.num,th.num{text-align:right}
  .totals{margin:10px 0 0 auto;width:43%;border:1px solid #98a2b3;padding:7px}.totals-row{display:flex;justify-content:space-between;gap:12px;padding:3px 0}.totals-row.grand{font-size:13px;font-weight:800;border-top:1.5px solid #101828;border-bottom:1.5px solid #101828;margin-top:4px;padding:6px 0}
  .signatures{margin-top:auto;display:grid;grid-template-columns:repeat(3,1fr);gap:28px;padding-top:25px}.signature{border-top:1px solid #101828;text-align:center;padding-top:5px;position:relative}.signature img{position:absolute;left:15px;bottom:12px;width:75px;height:48px;object-fit:contain}
  .footer{border-top:1px solid #101828;margin-top:14px;padding-top:7px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;font-size:8px}.footer-center{text-align:center}.footer-right{text-align:right}
  .ledger-page{padding:9mm 8mm}.ledger-title{text-align:center;font-size:16px;font-weight:800;margin-bottom:3px}.ledger-company{text-align:center;margin-bottom:10px}.ledger-table th{font-size:7px;padding:4px 3px;text-align:center}.ledger-table td{font-size:7px;padding:4px 3px}.ledger-table tfoot td{font-weight:800;background:#f2f4f7}
  .period{display:flex;justify-content:space-between;margin:5px 0 8px;font-weight:700}.page-note{margin-top:10px;text-align:right;font-size:8px;color:#667085}
  @page{size:A4;margin:0}@media print{thead{display:table-header-group}tfoot{display:table-footer-group}tr{break-inside:avoid}.page{break-after:page}}
`;

function companyHeader(payload:Payload,subtitle:string){
  const company=payload.company||{};
  const logo=company.logoUrl?`<img class="brand-logo" src="${esc(company.logoUrl)}" alt="">`:"";
  return `<div class="company-head"><div>${logo||`<div class="company-name">${esc(company.name||"OperiX")}</div>`}<div class="company-sub">${esc(subtitle)}</div></div><div style="text-align:right"><b>${esc(company.name||"")}</b><br>${esc(company.taxId||"")}</div></div>`;
}
function footer(payload:Payload){
  const company=payload.company||{};
  return `<div class="footer"><div><b>Detajet bankare:</b> ${esc(company.bankName||"—")}<br>IBAN: ${esc(company.iban||company.bankAccount||"—")}${company.swift?` · SWIFT: ${esc(company.swift)}`:""}</div><div class="footer-center">${esc([company.address,company.city,company.country].filter(Boolean).join(", "))}<br>${esc(company.phone||"")}</div><div class="footer-right">${esc(company.email||"")}<br>${esc(company.website||"")}<br>© OperiX Invoice</div></div>`;
}
function signatures(labels:string[]){
  return `<div class="signatures">${labels.map(label=>`<div class="signature">${esc(label)}</div>`).join("")}</div>`;
}
function period(rows:Row[],key:string){
  const dates=rows.map(row=>String(row[key]||"").slice(0,10)).filter(Boolean).sort();
  return {from:dates[0]||new Date().toISOString().slice(0,10),to:dates.at(-1)||new Date().toISOString().slice(0,10)};
}
function expenseHtml(payload:Payload){
  const rows=payload.rows;
  const total=rows.reduce((sum,row)=>sum+number(row.amount),0);
  const vendor=rows.length===1?String(rows[0].vendor_name||"—"):"Furnitorë të ndryshëm";
  return `<!doctype html><html lang="sq"><head><meta charset="utf-8"><style>${baseCss}</style></head><body><main class="page">
    ${companyHeader(payload,"REGJISTËR I SHPENZIMEVE")}
    <div class="meta-panels"><section class="panel"><div class="panel-title">Furnitori</div><div class="details"><b>Emri:</b><span>${esc(vendor)}</span><b>Numri fiskal:</b><span>—</span><b>Adresa:</b><span>—</span></div></section><section class="panel"><div class="panel-title">Pranimi</div><div class="details"><b>Njësia organizative:</b><span>${esc(payload.company?.name||"—")}</span><b>Data e pranimit:</b><span>${date(rows[0]?.date)}</span><b>Valuta:</b><span>EUR</span></div></section></div>
    <div class="document-mark"><h1>Blerje / Shpenzime</h1><div class="document-number">Dokumenti: EXP-${new Date().toISOString().slice(0,10).replaceAll("-","")}</div></div>
    <div class="info-row"><div class="info-cell"><div class="label">Periudha nga</div><div class="value">${date(period(rows,"date").from)}</div></div><div class="info-cell"><div class="label">Periudha deri</div><div class="value">${date(period(rows,"date").to)}</div></div><div class="info-cell"><div class="label">Referenca</div><div class="value">Regjistri i shpenzimeve</div></div><div class="info-cell"><div class="label">Kushtet</div><div class="value">Sipas dokumentit</div></div></div>
    <table><thead><tr><th>Nr.</th><th>Furnitori</th><th>Përshkrimi</th><th>Kategoria</th><th>Njësia</th><th class="num">Vlera</th><th class="num">TVSH</th><th class="num">Për pagesë</th></tr></thead><tbody>${rows.map((row,index)=>`<tr><td>${index+1}</td><td>${esc(row.vendor_name||"—")}</td><td>${esc(row.description||"—")}</td><td>${esc(row.category||"—")}</td><td>copë</td><td class="num">${money(row.amount)} EUR</td><td class="num">0,00 EUR</td><td class="num">${money(row.amount)} EUR</td></tr>`).join("")||`<tr><td colspan="8">Nuk ka të dhëna për periudhën.</td></tr>`}</tbody></table>
    <div class="totals"><div class="totals-row"><span>Vlera e furnitorit:</span><b>${money(total)} EUR</b></div><div class="totals-row"><span>TVSH:</span><b>0,00 EUR</b></div><div class="totals-row grand"><span>Vlera për pagesë:</span><span>${money(total)} EUR</span></div></div>
    ${signatures(["Përgatiti","Kontrolloi","Pranoi"])}${footer(payload)}
  </main></body></html>`;
}
function incomeHtml(payload:Payload){
  const rows=payload.rows;
  const total=rows.reduce((sum,row)=>sum+number(row.amount),0);
  const remaining=rows.reduce((sum,row)=>{const invoice=relation(row,"invoice");return sum+Math.max(0,number(invoice.total_amount||row.amount)-number(row.amount));},0);
  const first=rows[0]||{};
  const client=relation(first,"client");
  const subject=client.name||first.vendor_name||first.counterparty||"Subjekt i ndryshëm";
  return `<!doctype html><html lang="sq"><head><meta charset="utf-8"><style>${baseCss}.paid-amount{text-align:center;font-size:24px;font-weight:800;margin:14px 0}.paid-amount small{display:block;font-size:9px;color:#667085;margin-bottom:4px;text-transform:uppercase}</style></head><body><main class="page">
    ${companyHeader(payload,"DOKUMENT I PAGESËS HYRËSE")}
    <div class="meta-panels"><section class="panel"><div class="panel-title">Subjekti / Klienti</div><div class="details"><b>Emri:</b><span>${esc(subject)}</span><b>Numri fiskal:</b><span>${esc(client.tax_id||client.fiscal_number||"—")}</span><b>Kontakti:</b><span>${esc(client.phone||client.email||"—")}</span></div></section><section class="panel"><div class="panel-title">Pagesa</div><div class="details"><b>Mënyra:</b><span>${esc(first.payment_method||"Tjetër")}</span><b>Data:</b><span>${date(first.payment_date||first.date)}</span><b>Referenca:</b><span>${esc(first.bank_reference||first.category||"—")}</span></div></section></div>
    <div class="document-mark"><h1>Pagesat hyrëse</h1><div class="document-number">${esc(first.payment_number||`PAY-${new Date().toISOString().slice(0,10).replaceAll("-","")}`)}</div></div>
    <div class="paid-amount"><small>Vlera e paguar</small>${money(total)} EUR</div>
    <table><thead><tr><th>Nr.</th><th>Dokumenti</th><th>Subjekti</th><th>Përshkrimi</th><th class="num">Për pagesë</th><th class="num">Pagesa</th><th class="num">Mbetja</th></tr></thead><tbody>${rows.map((row,index)=>{const invoice=relation(row,"invoice");const rowClient=relation(row,"client");return `<tr><td>${index+1}</td><td>${esc(invoice.invoice_number||row.payment_number||row.id||"—")}</td><td>${esc(rowClient.name||row.vendor_name||"—")}</td><td>${esc(row.notes||row.description||row.category||"—")}</td><td class="num">${money(invoice.total_amount||row.amount)} EUR</td><td class="num">${money(row.amount)} EUR</td><td class="num">${money(Math.max(0,number(invoice.total_amount||row.amount)-number(row.amount)))} EUR</td></tr>`;}).join("")||`<tr><td colspan="7">Nuk ka të dhëna për periudhën.</td></tr>`}</tbody><tfoot><tr><td colspan="5"><b>Gjithsej</b></td><td class="num"><b>${money(total)} EUR</b></td><td class="num"><b>${money(remaining)} EUR</b></td></tr></tfoot></table>
    ${signatures(["Arkëtari","Likuiduesi","Subjekti"])}${footer(payload)}
  </main></body></html>`;
}
function salesLedgerHtml(payload:Payload){
  const rows=payload.rows.filter(row=>String(row.status||"")!=="cancelled"&&String(row.type||"")!=="offer");
  const range=period(rows,"issue_date");
  let gross=0,base=0,vat=0;
  const body=rows.map((row,index)=>{const client=relation(row,"client");const total=number(row.total_amount);const tax=number(row.tax_amount);gross+=total;vat+=tax;base+=Math.max(0,total-tax);return `<tr><td>${index+1}</td><td>${date(row.issue_date)}</td><td>${esc(row.invoice_number||"—")}</td><td>${esc(client.name||"—")}</td><td>${esc(client.fiscal_number||client.tax_id||client.nui||"—")}</td><td>${esc(client.vat_number||"—")}</td><td>${esc(row.type||"Faturë")}</td><td class="num">${money(total)}</td><td class="num">0,00</td><td class="num">${money(total-tax)}</td><td class="num">${money(tax)}</td></tr>`;}).join("");
  return `<!doctype html><html lang="sq"><head><meta charset="utf-8"><style>${baseCss}@page{size:A4 landscape;margin:0}</style></head><body><main class="page ledger-page">
    <div class="ledger-title">LIBRI I SHITJES</div><div class="ledger-company"><b>${esc(payload.company?.name||"")}</b> · Numri fiskal: ${esc(payload.company?.taxId||"—")}</div><div class="period"><span>Periudha: ${date(range.from)} — ${date(range.to)}</span><span>Valuta: EUR</span></div>
    <table class="ledger-table"><thead><tr><th>Nr.</th><th>Data</th><th>Nr. i faturës</th><th>Blerësi</th><th>Nr. fiskal</th><th>Nr. TVSH</th><th>Lloji</th><th>Shitjet totale</th><th>Shitje të liruara</th><th>Baza e tatueshme</th><th>TVSH</th></tr></thead><tbody>${body||`<tr><td colspan="11">Nuk ka shitje për periudhën.</td></tr>`}</tbody><tfoot><tr><td colspan="7">GJITHSEJ</td><td class="num">${money(gross)}</td><td class="num">0,00</td><td class="num">${money(base)}</td><td class="num">${money(vat)}</td></tr></tfoot></table>
    <div class="page-note">Gjeneruar nga OperiX Invoice · ${date(new Date().toISOString())}</div>
  </main></body></html>`;
}
function vendorLedgerHtml(payload:Payload){
  const rows=payload.rows;
  const range=period(rows,"issue_date");
  let gross=0,base=0,vat=0;
  const body=rows.map((row,index)=>{const vendor=relation(row,"vendor");const total=number(row.total_amount);const tax=number(row.tax_amount);gross+=total;vat+=tax;base+=Math.max(0,total-tax);return `<tr><td>${index+1}</td><td>${date(row.issue_date)}</td><td>${esc(row.bill_number||"—")}</td><td>${esc(vendor.name||"—")}</td><td>${esc(vendor.fiscal_number||vendor.tax_id||"—")}</td><td>${esc(vendor.vat_number||"—")}</td><td>Blerje</td><td class="num">${money(total)}</td><td class="num">0,00</td><td class="num">${money(total-tax)}</td><td class="num">${money(tax)}</td><td class="num">${money(Math.max(0,total-tax))}</td></tr>`;}).join("");
  return `<!doctype html><html lang="sq"><head><meta charset="utf-8"><style>${baseCss}@page{size:A4 landscape;margin:0}</style></head><body><main class="page ledger-page">
    <div class="ledger-title">LIBRI I BLERJES</div><div class="ledger-company"><b>${esc(payload.company?.name||"")}</b> · Numri fiskal: ${esc(payload.company?.taxId||"—")}</div><div class="period"><span>Periudha: ${date(range.from)} — ${date(range.to)}</span><span>Valuta: EUR</span></div>
    <table class="ledger-table"><thead><tr><th>Nr.</th><th>Data</th><th>Nr. i faturës</th><th>Shitësi / Furnitori</th><th>Nr. fiskal</th><th>Nr. TVSH</th><th>Lloji</th><th>Blerjet totale</th><th>Blerje të liruara</th><th>Baza e tatueshme</th><th>TVSH</th><th>Kosto pa TVSH</th></tr></thead><tbody>${body||`<tr><td colspan="12">Nuk ka blerje për periudhën.</td></tr>`}</tbody><tfoot><tr><td colspan="7">GJITHSEJ</td><td class="num">${money(gross)}</td><td class="num">0,00</td><td class="num">${money(base)}</td><td class="num">${money(vat)}</td><td class="num">${money(base)}</td></tr></tfoot></table>
    <div class="page-note">Gjeneruar nga OperiX Invoice · ${date(new Date().toISOString())}</div>
  </main></body></html>`;
}

export async function POST(request:Request){
  let browser:Awaited<ReturnType<typeof puppeteer.launch>>|null=null;
  try{
    const payload=schema.parse(await request.json());
    const html=payload.template==="expense-register"?expenseHtml(payload):payload.template==="income-payment"?incomeHtml(payload):payload.template==="sales-ledger"?salesLedgerHtml(payload):vendorLedgerHtml(payload);
    browser=await puppeteer.launch({executablePath:process.env.CHROME_EXECUTABLE_PATH||"/usr/bin/chromium",args:["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage"],headless:true});
    const page=await browser.newPage();
    await page.setContent(html,{waitUntil:"networkidle0"});
    const landscape=["sales-ledger","vendor-ledger"].includes(payload.template);
    const pdf=await page.pdf({format:"A4",landscape,printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false});
    return new NextResponse(Buffer.from(pdf),{headers:{"content-type":"application/pdf","content-disposition":`attachment; filename="operix-${payload.template}-${new Date().toISOString().slice(0,10)}.pdf"`,"cache-control":"private, no-store"}});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"PDF generation failed"},{status:500});
  }finally{if(browser)await browser.close();}
}
