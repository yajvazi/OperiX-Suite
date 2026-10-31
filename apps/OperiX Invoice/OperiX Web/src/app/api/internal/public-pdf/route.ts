import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import puppeteer from "puppeteer-core";

import { getInvoice } from "@invoice-monorepo/api/repositories";
import { verifyHandoff } from "@invoice-monorepo/public-api/security";
import { createAdminClient } from "@/lib/supabase/admin";
import { invoiceHtml } from "@/lib/invoice-html";
import type { ClientRow, InvoiceDraft } from "@/lib/models";
import type { HtmlCompany } from "@/lib/invoice-html";

export const runtime = "nodejs";

function safeEqualCompany(value: unknown, expected: string) {
  return typeof value === "string" && createHash("sha256").update(value).digest("hex") === createHash("sha256").update(expected).digest("hex");
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || "";
  if (!token) return NextResponse.json({ error: "PDF unavailable." }, { status: 404 });
  const encoded = token.split(".", 1)[0] || "";
  let environment: "test" | "live" | null = null;
  try {
    const decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as { environment?: unknown };
    environment = decoded.environment === "test" || decoded.environment === "live" ? decoded.environment : null;
  } catch { environment = null; }
  if (!environment) return NextResponse.json({ error: "PDF link expired or invalid." }, { status: 401 });
  const expectedEnvironment = process.env.INVOICE_PDF_ENVIRONMENT?.trim() === "test" ? "test" : "live";
  if (environment !== expectedEnvironment) return NextResponse.json({ error: "PDF link is for a different environment." }, { status: 404 });
  const secret = (environment === "test" ? process.env.PUBLIC_API_TEST_PDF_SIGNING_SECRET : process.env.PUBLIC_API_PDF_SIGNING_SECRET)?.trim();
  if (!secret) return NextResponse.json({ error: "PDF unavailable." }, { status: 404 });
  const payload = verifyHandoff<{ invoice_id?: unknown; company_id?: unknown; exp?: unknown; environment?: unknown }>(token, secret);
  if (!payload || payload.environment !== environment || typeof payload.invoice_id !== "string" || typeof payload.company_id !== "string" || typeof payload.exp !== "number" || payload.exp <= Date.now()) return NextResponse.json({ error: "PDF link expired or invalid." }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "PDF service is not configured." }, { status: 503 });
  const invoice = await getInvoice(admin, payload.invoice_id);
  if (!invoice || !safeEqualCompany(invoice.company_id, payload.company_id)) return NextResponse.json({ error: "PDF unavailable." }, { status: 404 });
  const { data: company } = await admin.from("companies").select("*").eq("id", payload.company_id).maybeSingle();
  const row = invoice as Record<string, unknown>;
  const client = (row.client || undefined) as ClientRow | undefined;
  const draft: InvoiceDraft = {
    client_id: String(row.client_id || ""),
    invoice_number: String(row.invoice_number || ""),
    issue_date: String(row.issue_date || ""),
    due_date: String(row.due_date || row.issue_date || ""),
    payment_method: String(row.payment_method || "bank") as InvoiceDraft["payment_method"],
    amount_received: Number(row.amount_received || 0),
    notes: String(row.notes || ""),
    status: String(row.commercial_status || row.status || "draft") as InvoiceDraft["status"],
    currency: String(row.currency || "EUR"),
    commercial_document_type: String(row.commercial_document_type || "INVOICE") as InvoiceDraft["commercial_document_type"],
    source_document_type: row.source_document_type ? String(row.source_document_type) : null,
    source_document_id: row.source_document_id ? String(row.source_document_id) : null,
    show_product_pictures: Boolean(row.show_product_pictures),
    items: (Array.isArray(row.items) ? row.items : []).map((item: Record<string, unknown>, index) => ({
      id: String(item.id || index), product_id: item.product_id ? String(item.product_id) : undefined, description: String(item.description || ""), quantity: Number(item.quantity || 0), unit_price: Number(item.unit_price || 0), tax_rate: Number(item.tax_rate || 0), tax_included: Boolean(item.tax_included), discount: Number(item.discount || 0), unit: String(item.unit || "pcs"), sku: item.sku ? String(item.sku) : undefined, image_url: item.image_url ? String(item.image_url) : undefined,
    })),
  };
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    browser = await puppeteer.launch({ executablePath: process.env.CHROME_EXECUTABLE_PATH || "/usr/bin/chromium", args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-crash-reporter", "--disable-breakpad"], headless: true });
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (incoming) => { try { const url = new URL(incoming.url()); const allowed = url.protocol === "data:" || url.protocol === "about:" || url.hostname === "api.qrserver.com"; if (allowed) incoming.continue(); else incoming.abort(); } catch { incoming.abort(); } });
    const companyRow = (company || {}) as Record<string, unknown>;
    const documentCompany: HtmlCompany = { name: String(companyRow.company_name || companyRow.name || "OperiX"), email: companyRow.email ? String(companyRow.email) : "", phone: companyRow.phone ? String(companyRow.phone) : "", address: companyRow.address ? String(companyRow.address) : "", city: companyRow.city ? String(companyRow.city) : "", country: companyRow.country ? String(companyRow.country) : "", taxId: String(companyRow.tax_id || companyRow.fiscal_number || companyRow.vat_number || ""), businessId: companyRow.unique_business_number ? String(companyRow.unique_business_number) : "", vatNumber: companyRow.vat_number ? String(companyRow.vat_number) : "", bankName: companyRow.bank_name ? String(companyRow.bank_name) : "", iban: companyRow.bank_iban ? String(companyRow.bank_iban) : "", website: companyRow.website ? String(companyRow.website) : "", logoUrl: companyRow.logo_url ? String(companyRow.logo_url) : undefined, signatureUrl: companyRow.signature_url ? String(companyRow.signature_url) : undefined, stampUrl: companyRow.stamp_url ? String(companyRow.stamp_url) : undefined, bankAccount: companyRow.bank_account ? String(companyRow.bank_account) : undefined, bankSwift: companyRow.bank_swift ? String(companyRow.bank_swift) : undefined, primaryColor: companyRow.primary_color ? String(companyRow.primary_color) : undefined, isGrayscale: Boolean(companyRow.is_grayscale), paymentLinkStripe: companyRow.payment_link_stripe ? String(companyRow.payment_link_stripe) : undefined, paymentLinkPaypal: companyRow.payment_link_paypal ? String(companyRow.payment_link_paypal) : undefined, terms: companyRow.terms_conditions ? String(companyRow.terms_conditions) : undefined, language: companyRow.invoice_language ? String(companyRow.invoice_language) : undefined };
    await page.setContent(invoiceHtml(draft, client, false, documentCompany, (companyRow.template_config || {}) as never), { waitUntil: "networkidle0" });
    const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
    const filename = String(row.invoice_number || "invoice").replace(/[^a-zA-Z0-9._-]/g, "_");
    return new NextResponse(Buffer.from(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${filename}.pdf"`, "cache-control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "PDF generation failed." }, { status: 500 });
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}
