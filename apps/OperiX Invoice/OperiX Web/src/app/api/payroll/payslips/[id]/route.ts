import { NextResponse } from "next/server";
import puppeteer from "puppeteer-core";
import {
  renderPayslipHtml,
  type PayslipSnapshot,
} from "@invoice-monorepo/payroll";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type PayslipAccess = {
  language?: "sq" | "en";
  verificationReference?: string;
  snapshot?: PayslipSnapshot;
};

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    const supabase = await createClient();
    if (!supabase) return NextResponse.json({ error: "Payroll service unavailable." }, { status: 503 });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });

    const { id } = await context.params;
    const url = new URL(request.url);
    const format = url.searchParams.get("format") === "html" ? "html" : "pdf";
    const language = url.searchParams.get("lang") === "en" ? "en" : "sq";
    const { data, error } = await supabase.rpc("access_payroll_payslip", {
      p_payslip_id: id,
      p_access_type: format === "pdf" ? "download" : "view",
    });
    if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 404 });
    const payslip = data as PayslipAccess;
    if (!payslip.snapshot) return NextResponse.json({ error: "Payslip snapshot is unavailable." }, { status: 404 });
    const html = renderPayslipHtml(payslip.snapshot, {
      language,
      verificationReference: payslip.verificationReference,
    });
    if (format === "html") {
      return new NextResponse(html, {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" },
      });
    }

    browser = await puppeteer.launch({
      executablePath: process.env.CHROME_EXECUTABLE_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      headless: true,
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
    const safeRun = payslip.snapshot.runNumber.replace(/[^a-z0-9-]+/gi, "-");
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="OperiX-Payslip-${safeRun}.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Payslip generation failed." },
      { status: 500 },
    );
  } finally {
    if (browser) await browser.close();
  }
}
