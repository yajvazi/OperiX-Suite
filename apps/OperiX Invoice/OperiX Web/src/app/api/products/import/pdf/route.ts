import {NextResponse} from "next/server";
import puppeteer from "puppeteer-core";
import {z} from "zod";

export const runtime="nodejs";

const optional=z.union([z.string(),z.number(),z.null()]).optional();
const schema=z.object({
  company:z.object({name:z.string().optional(),taxId:z.string().optional(),address:z.string().optional(),city:z.string().optional(),country:z.string().optional(),email:z.string().optional(),phone:z.string().optional(),website:z.string().optional(),bankName:z.string().optional(),iban:z.string().optional()}).optional(),
  batch:z.record(z.string(),z.unknown()),
  items:z.array(z.object({
    line_number:z.number(),sku:z.string(),barcode:z.string().optional(),description:z.string(),category:z.string().optional(),
    quantity:z.number(),unit:z.string(),supplier_currency_price:z.number(),discount_percent:z.number(),
    supplier_value:z.number(),price_after_discount:z.number(),transport_cost:z.number(),additional_cost:z.number(),
    customs_excise:z.number(),landed_unit_price:z.number(),tax_rate:z.number(),import_vat:z.number(),unit_price_with_vat:z.number(),
  })),
  ignored:optional,
});
type Payload=z.infer<typeof schema>;
const esc=(value:unknown)=>String(value??"").replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]!));
const money=(value:unknown)=>new Intl.NumberFormat("sq-AL",{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value||0)||0);
const date=(value:unknown)=>{if(!value)return "—";const parsed=new Date(`${String(value).slice(0,10)}T12:00:00`);return Number.isNaN(parsed.getTime())?esc(value):new Intl.DateTimeFormat("sq-AL",{day:"2-digit",month:"2-digit",year:"numeric"}).format(parsed);};

export function renderProductCalculation(payload:Payload){
  const {batch,items}=payload,company=payload.company||{};
  const totals=items.reduce((result,item)=>({
    supplier:result.supplier+item.supplier_value,
    transport:result.transport+item.transport_cost,
    additional:result.additional+item.additional_cost,
    customs:result.customs+item.customs_excise,
    landed:result.landed+item.landed_unit_price*item.quantity,
    vat:result.vat+item.import_vat,
    withVat:result.withVat+item.unit_price_with_vat*item.quantity,
  }),{supplier:0,transport:0,additional:0,customs:0,landed:0,vat:0,withVat:0});
  const body=items.map(item=>`<tr class="unit-row"><td rowspan="2">${item.line_number}</td><td>${esc(item.sku)}</td><td></td><td class="num">${money(item.quantity)}</td><td></td><td class="num">${money(item.supplier_currency_price)}</td><td class="num">${money(item.discount_percent)}</td><td></td><td class="num">${money(item.price_after_discount)}</td><td class="num">${money(item.transport_cost)}</td><td></td><td></td><td class="num">${money(item.landed_unit_price)}</td><td></td><td class="num">${money(item.import_vat)}</td><td class="num">${money(item.unit_price_with_vat)}</td></tr>
    <tr class="value-row"><td></td><td class="description">${esc(item.description)}</td><td></td><td>${esc(item.unit)}</td><td class="num">${money(item.supplier_currency_price)}</td><td></td><td class="num">${money(item.supplier_value)}</td><td class="num">${money(item.price_after_discount*item.quantity)}</td><td></td><td class="num">${money(item.additional_cost)}</td><td class="num">${money(item.customs_excise)}</td><td class="num">${money(item.landed_unit_price*item.quantity)}</td><td class="num">${money(item.tax_rate)}</td><td></td><td class="num">${money(item.unit_price_with_vat*item.quantity)}</td></tr>`).join("");
  return `<!doctype html><html lang="sq"><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;color:#101828;font-family:Arial,Helvetica,sans-serif;font-size:8px}body{background:#fff}
    .page{width:297mm;min-height:210mm;padding:7mm 8mm;display:flex;flex-direction:column;background:#fff}
    .masthead{display:grid;grid-template-columns:1fr 1.5fr 1fr;align-items:end;margin-bottom:6px}.brand{text-align:center}.brand strong{display:block;font-size:20px;line-height:1;text-transform:uppercase}.brand span{display:block;font-size:9px;font-weight:700;letter-spacing:.1em;margin-top:3px}.document-mark{text-align:center;font-weight:700}.document-mark .label{font-size:12px}.barcode{height:28px;margin:3px 0;background:repeating-linear-gradient(90deg,#000 0 2px,transparent 2px 4px,#000 4px 5px,transparent 5px 8px,#000 8px 11px,transparent 11px 13px)}.document-mark .number{font-size:11px;letter-spacing:.08em}
    .meta{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:0;border:1px solid #8b95a5;margin-bottom:8px}.meta section{padding:6px 7px;border-right:1px solid #8b95a5}.meta section:last-child{border:0}
    .meta h2{font-size:8px;text-transform:uppercase;margin:0 0 5px;color:#475467}.details{display:grid;grid-template-columns:auto 1fr;gap:3px 8px}.details b{white-space:nowrap}
    table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#fff;color:#101828;border:0;border-bottom:1px solid #667085;font-size:6px;padding:4px 2px;text-align:center;vertical-align:bottom}td{border:0;border-bottom:1px solid #d0d5dd;padding:3px 2px;font-size:6px;vertical-align:top}td.num{text-align:right}.description{width:16%}.unit-row td{font-weight:600}.value-row td{background:#fafafa}.total-row td{font-weight:800;background:#fff;border-top:1.5px solid #101828}
    .signatures{margin-top:auto;display:grid;grid-template-columns:repeat(3,1fr);gap:45px;padding-top:20px}.signature{border-top:1px solid #101828;text-align:center;padding-top:4px;font-weight:700}
    footer{border-top:1px solid #101828;margin-top:10px;padding-top:5px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:6px}footer div:nth-child(2){text-align:center}footer div:last-child{text-align:right}
    @page{size:A4 landscape;margin:0}@media print{thead{display:table-header-group}tr{break-inside:avoid}.page{break-after:page}}
  </style></head><body><main class="page">
    <div class="masthead"><div></div><div class="brand"><strong>${esc(company.name||"OperiX")}</strong><span>IMPORT · INVENTORY</span></div><div class="document-mark"><div class="label">Blerja në detale</div><div class="barcode" aria-hidden="true"></div><div class="number">${esc(batch.document_number||batch.invoice_number||"")}</div></div></div>
    <div class="meta">
      <section><h2>Furnitori</h2><div class="details"><b>Emri:</b><span>${esc(batch.supplier_name||"—")}</span><b>Nr. unik/fiskal:</b><span>${esc(batch.supplier_tax_id||"—")}</span><b>Nr. biznes/TVSH:</b><span>${esc(batch.supplier_vat_number||"—")}</span><b>Adresa:</b><span>${esc(batch.supplier_address||"—")}</span></div></section>
      <section><h2>Dokumenti i blerjes</h2><div class="details"><b>Nr. i faturës:</b><span>${esc(batch.invoice_number||"—")}</span><b>Data:</b><span>${date(batch.invoice_date)}</span><b>Skadimi:</b><span>${date(batch.expiry_date)}</span><b>Kushtet:</b><span>${esc(batch.payment_terms||"—")}</span></div></section>
      <section><h2>Pranimi dhe dogana</h2><div class="details"><b>DUDI:</b><span>${esc(batch.customs_document_number||"—")}</span><b>Data DUDI:</b><span>${date(batch.customs_document_date)}</span><b>Njësia Org.:</b><span>${esc(batch.organization_unit||"—")}</span><b>Data e pranimit:</b><span>${date(batch.received_date)}</span><b>Valuta:</b><span>${esc(batch.currency||"EUR")}</span></div></section>
    </div>
    <table><thead><tr><th>Nr.</th><th>Shifra</th><th>Përshkrimi</th><th>Sasia</th><th>Njësia</th><th>Çm. valutë<br>Çm. furn.</th><th>Rabati %<br>Vlera</th><th>Vlera furn.</th><th>Çm. pas rab.<br>Vlera furn.</th><th>Transporti<br>Shpenzimet</th><th>Shtesat<br>Baza dog.</th><th>Dogana<br>Akciza</th><th>Çmimi/Vlera<br>kushtuese</th><th>TVSH %</th><th>TVSH<br>ngarkesa</th><th>Çmimi/Vlera<br>me TVSH</th></tr></thead><tbody>${body}<tr class="total-row"><td colspan="3">TOTAL</td><td class="num">${money(items.reduce((sum,item)=>sum+item.quantity,0))}</td><td></td><td></td><td></td><td class="num">${money(totals.supplier)}</td><td></td><td class="num">${money(totals.transport)}</td><td class="num">${money(totals.additional)}</td><td class="num">${money(totals.customs)}</td><td class="num">${money(totals.landed)}</td><td></td><td class="num">${money(totals.vat)}</td><td class="num">${money(totals.withVat)}</td></tr></tbody></table>
    <div class="signatures"><div class="signature">Përpiloi</div><div class="signature">Kontrolloi</div><div class="signature">Pranoi</div></div>
    <footer><div><b>Detajet bankare:</b> ${esc(company.bankName||"—")} · IBAN: ${esc(company.iban||"—")}<br>Nr. fiskal: ${esc(company.taxId||"—")}</div><div>${esc([company.address,company.city,company.country].filter(Boolean).join(", "))}<br>${esc(company.phone||"")}</div><div>${esc(company.email||"")}<br>${esc(company.website||"")}<br>© OperiX Invoice</div></footer>
  </main></body></html>`;
}

export async function POST(request:Request){
  let browser:Awaited<ReturnType<typeof puppeteer.launch>>|null=null;
  try{
    const payload=schema.parse(await request.json());
    browser=await puppeteer.launch({executablePath:process.env.CHROME_EXECUTABLE_PATH||"/usr/bin/chromium",args:["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage"],headless:true});
    const page=await browser.newPage();await page.setContent(renderProductCalculation(payload),{waitUntil:"networkidle0"});
    const pdf=await page.pdf({format:"A4",landscape:true,printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false});
    return new NextResponse(Buffer.from(pdf),{headers:{"content-type":"application/pdf","content-disposition":`attachment; filename="operix-product-calculation-${new Date().toISOString().slice(0,10)}.pdf"`,"cache-control":"private, no-store"}});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"PDF generation failed"},{status:500});}
  finally{if(browser)await browser.close();}
}
