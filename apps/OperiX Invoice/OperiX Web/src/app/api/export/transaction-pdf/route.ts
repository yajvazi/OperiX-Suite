import { NextResponse } from "next/server";
import { z } from "zod";
import puppeteer from "puppeteer-core";
import { createClient } from "@/lib/supabase/server";
import { getExpense, getPayment } from "@invoice-monorepo/api/repositories";
import { hasWorkspacePermission, resolveWorkspace } from "@invoice-monorepo/api/workspace";

export const runtime = "nodejs";

const schema = z.object({ kind: z.enum(["payments", "expenses"]), id: z.string().uuid(), language: z.enum(["en", "sq"]).optional() });
type Row = Record<string, unknown>;

const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));
const safeImage = (value: unknown) => (typeof value === "string" && /^(data:image\/(png|jpeg|webp|svg\+xml)[;,]|https:\/\/)/.test(value) ? esc(value) : "");

const TEXT = {
  en: { payment: "Payment receipt", expense: "Expense", number: "Number", date: "Date", party: "Customer", vendor: "Vendor", amount: "Amount", net: "Net", vat: "VAT", category: "Category", method: "Payment method", reference: "Reference", invoice: "Invoice", description: "Description", notes: "Notes", signature: "Signature", stamp: "Official stamp", taxId: "Tax ID" },
  sq: { payment: "Dëftesë pagese", expense: "Shpenzim", number: "Numri", date: "Data", party: "Klienti", vendor: "Furnitori", amount: "Shuma", net: "Pa TVSH", vat: "TVSH", category: "Kategoria", method: "Mënyra e pagesës", reference: "Referenca", invoice: "Fatura", description: "Përshkrimi", notes: "Shënime", signature: "Nënshkrimi", stamp: "Vula zyrtare", taxId: "Nr. fiskal" },
} as const;

function documentHtml(kind: "payments" | "expenses", row: Row, company: Row, language: "en" | "sq") {
  const L = TEXT[language];
  const payment = kind === "payments";
  const amount = Number(row.amount || 0);
  const money = new Intl.NumberFormat(language === "sq" ? "sq-AL" : "en-GB", { style: "currency", currency: String(row.currency || company.currency || "EUR") }).format(amount);
  const client = (row.client && typeof row.client === "object" ? row.client : {}) as Row;
  const invoice = (row.invoice && typeof row.invoice === "object" ? row.invoice : {}) as Row;
  const party = payment ? String(client.name || "") : String(row.vendor_name || "");
  const number = payment ? String(row.payment_number || row.id || "") : `EXP-${String(row.id || "").slice(0, 8).toUpperCase()}`;
  const date = String((payment ? row.payment_date : row.date) || "").slice(0, 10);
  const facts: Array<[string, unknown]> = [
    [L.number, number], [L.date, date], [payment ? L.party : L.vendor, party || "—"],
    ...(payment ? [[L.invoice, invoice.invoice_number || "—"] as [string, unknown]] : [[L.category, row.category || "—"] as [string, unknown]]),
    [L.method, row.payment_method || "—"], [L.reference, row.bank_reference || "—"],
    ...(!payment && row.tax_amount != null ? [[L.net, new Intl.NumberFormat(language === "sq" ? "sq-AL" : "en-GB", { minimumFractionDigits: 2 }).format(amount - Number(row.tax_amount || 0))] as [string, unknown], [L.vat, row.tax_amount] as [string, unknown]] : []),
  ];
  const stamp = safeImage(company.stamp_url);
  const signature = safeImage(company.signature_url);
  return `<!doctype html><html lang="${language}"><head><meta charset="utf-8"><style>
    @page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#101828}.page{padding:16mm}
    .head{display:flex;justify-content:space-between;border-bottom:2px solid #101828;padding-bottom:10px}.company{font-size:22px;font-weight:800}.muted{color:#667085;font-size:11px;line-height:1.5}
    h1{font-size:20px;margin:22px 0 4px}.amount{font-size:30px;font-weight:800;margin:6px 0 18px}table{width:100%;border-collapse:collapse}td{border:1px solid #d0d5dd;padding:9px 10px;font-size:12px}td:first-child{width:34%;background:#f2f4f7;font-weight:700}
    .block{margin-top:18px;font-size:12px;line-height:1.5}.sign{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:70px;text-align:center;font-size:11px;color:#667085}.sign div{border-top:1px solid #101828;padding-top:6px}.sign img{max-height:60px;display:block;margin:-66px auto 8px}
  </style></head><body><div class="page">
    <div class="head"><div><div class="company">${esc(company.company_name || company.name || "")}</div><div class="muted">${esc([company.address, company.city, company.country].filter(Boolean).join(", "))}<br>${esc(company.email || "")} ${esc(company.phone || "")}</div></div><div class="muted" style="text-align:right">${L.taxId}: ${esc(company.tax_id || company.fiscal_number || "—")}</div></div>
    <h1>${payment ? L.payment : L.expense}</h1><div class="amount">${esc(money)}</div>
    <table>${facts.map(([label, value]) => `<tr><td>${esc(label)}</td><td>${esc(value)}</td></tr>`).join("")}</table>
    ${row.description ? `<div class="block"><b>${L.description}:</b> ${esc(row.description)}</div>` : ""}${row.notes ? `<div class="block"><b>${L.notes}:</b> ${esc(row.notes)}</div>` : ""}
    <div class="sign"><div>${signature ? `<img src="${signature}" alt="">` : ""}${L.signature}</div><div>${stamp ? `<img src="${stamp}" alt="">` : ""}${L.stamp}</div></div>
  </div></body></html>`;
}

export async function POST(request: Request) {
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    const supabase = await createClient();
    if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const workspace = await resolveWorkspace(supabase, user.id, { membershipOnly: true });
    if (!hasWorkspacePermission(workspace, "financial.export")) return NextResponse.json({ error: "Financial export permission is required." }, { status: 403 });
    const payload = schema.parse(await request.json());
    const scope = { userId: user.id, companyIds: workspace.companyIds };
    const row = (payload.kind === "payments" ? await getPayment(supabase, payload.id, scope) : await getExpense(supabase, payload.id, scope)) as Row | null;
    if (!row) return NextResponse.json({ error: "The document is not available in this workspace." }, { status: 404 });
    const { data: company } = await supabase.from("companies").select("*").eq("id", String(row.company_id || workspace.companyId)).maybeSingle();
    const html = documentHtml(payload.kind, row, (company || workspace.company || {}) as Row, payload.language || "en");
    browser = await puppeteer.launch({ executablePath: process.env.CHROME_EXECUTABLE_PATH || "/usr/bin/chromium", args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"], headless: true });
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request", (pageRequest) => { const protocol = new URL(pageRequest.url()).protocol; if (protocol === "data:" || protocol === "about:") void pageRequest.continue(); else void pageRequest.abort(); });
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
    return new NextResponse(Buffer.from(pdf), { headers: { "content-type": "application/pdf", "cache-control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof z.ZodError ? "Invalid request." : "PDF generation failed." }, { status: error instanceof z.ZodError ? 400 : 500 });
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}
