import { NextResponse } from "next/server";
import {
  renderCustomerLedgerHtml,
  type CustomerLedgerReport,
} from "@invoice-monorepo/report-templates";
import puppeteer from "puppeteer-core";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const entrySchema = z.object({
  id: z.string().optional().default(""),
  kind: z.enum(["invoice", "payment"]).optional().default("invoice"),
  document: z.string(),
  number: z.string(),
  date: z.string(),
  account: z.string(),
  documentType: z.string(),
  previousDocument: z.string(),
  linkedDocument: z.string(),
  supplierInvoice: z.string(),
  reference: z.string(),
  description: z.string(),
  subjectGoods: z.string(),
  agent: z.string(),
  paymentMethod: z.string(),
  organizationalUnit: z.string(),
  openingBalance: z.number(),
  debit: z.number(),
  credit: z.number(),
  balance: z.number(),
  currency: z.string(),
  foreignOpeningBalance: z.number(),
  foreignDebit: z.number(),
  foreignCredit: z.number(),
  foreignBalance: z.number(),
  payment: z.number(),
  remaining: z.number(),
  utilization: z.number(),
  user: z.string(),
  createdAt: z.string(),
});

const payloadSchema = z.object({
  customer: z.object({
    name: z.string(),
    taxId: z.string().optional(),
    fiscalNumber: z.string().optional(),
    businessNumber: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
  }),
  company: z.object({
    name: z.string(),
    taxId: z.string().optional(),
    vatNumber: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    website: z.string().optional(),
    bankName: z.string().optional(),
    iban: z.string().optional(),
    logoUrl: z.string().optional(),
  }),
  range: z.object({ from: z.string(), to: z.string() }),
  summary: z.object({
    openingBalance: z.number(),
    totalDebit: z.number(),
    totalCredit: z.number(),
    closingBalance: z.number(),
    totalPayments: z.number(),
  }),
  entries: z.array(entrySchema),
});

export async function POST(request: Request) {
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = supabase
      ? await supabase.auth.getUser()
      : { data: { user: null } };
    if (!user) {
      return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
    }

    const payload = payloadSchema.parse(await request.json()) as CustomerLedgerReport;
    browser = await puppeteer.launch({
      executablePath: process.env.CHROME_EXECUTABLE_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      headless: true,
    });
    const page = await browser.newPage();
    await page.setContent(renderCustomerLedgerHtml(payload), { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
    });
    const safeName = customerFilename(payload.customer.name);
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="kartela-e-bleresit-${safeName}.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "PDF generation failed." },
      { status: 500 },
    );
  } finally {
    if (browser) await browser.close();
  }
}

function customerFilename(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "customer";
}
