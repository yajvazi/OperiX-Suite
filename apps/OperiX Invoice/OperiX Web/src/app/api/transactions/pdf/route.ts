import { NextResponse } from "next/server";
import { z } from "zod";
import puppeteer from "puppeteer-core";
import {
  isLandscapeTransactionReport,
  renderTransactionReportHtml,
} from "@invoice-monorepo/report-templates";

export const runtime = "nodejs";

const companySchema = z
  .object({
    name: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    country: z.string().optional(),
    website: z.string().optional(),
    taxId: z.string().optional(),
    bankName: z.string().optional(),
    bankAccount: z.string().optional(),
    iban: z.string().optional(),
    swift: z.string().optional(),
    logoUrl: z.string().optional(),
  })
  .optional();

const schema = z.object({
  template: z.enum([
    "expense-register",
    "income-payment",
    "sales-ledger",
    "vendor-ledger",
  ]),
  title: z.string(),
  company: companySchema,
  rows: z.array(z.record(z.string(), z.unknown())),
  reportPeriod: z.object({
    from: z.string(),
    to: z.string(),
    label: z.string().optional(),
    filingFrequency: z.enum(["monthly","quarterly"]).optional(),
  }).optional(),
});

export async function POST(request: Request) {
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    const payload = schema.parse(await request.json());
    const html = renderTransactionReportHtml(payload);
    browser = await puppeteer.launch({
      executablePath: process.env.CHROME_EXECUTABLE_PATH || "/usr/bin/chromium",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
      headless: true,
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({
      format: "A4",
      landscape: isLandscapeTransactionReport(payload.template),
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
    });
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="operix-${payload.template}-${new Date().toISOString().slice(0, 10)}.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "PDF generation failed",
      },
      { status: 500 },
    );
  } finally {
    if (browser) await browser.close();
  }
}
