import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Row = Record<string, unknown>;

function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    if (!supabase) return NextResponse.json({ error: "Payroll service unavailable." }, { status: 503 });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Your session has expired." }, { status: 401 });
    const { id } = await context.params;
    const { data: batch, error: batchError } = await supabase
      .from("payroll_payment_batches")
      .select("id,batch_number,currency,payment_date,status")
      .eq("id", id)
      .single();
    if (batchError || !batch) return NextResponse.json({ error: batchError?.message || "Batch not found." }, { status: 404 });
    if (!["approved", "exported", "partially_paid", "paid"].includes(String(batch.status))) {
      return NextResponse.json({ error: "Approve the payment batch before exporting it." }, { status: 409 });
    }
    const { data: lines, error: linesError } = await supabase
      .from("payroll_payment_lines")
      .select("amount,employee:employees(employee_number,first_name,last_name),bank:employee_bank_accounts(bank_name,account_name,iban)")
      .eq("payment_batch_id", id)
      .order("employee_id");
    if (linesError) return NextResponse.json({ error: linesError.message }, { status: 400 });

    const header = ["Employee number", "Beneficiary", "Bank", "Account name", "IBAN", "Amount", "Currency", "Payment date", "Reference"];
    const body = ((lines || []) as Row[]).map((line) => {
      const employee = (Array.isArray(line.employee) ? line.employee[0] : line.employee) as Row | undefined;
      const bank = (Array.isArray(line.bank) ? line.bank[0] : line.bank) as Row | undefined;
      return [
        employee?.employee_number,
        `${String(employee?.first_name || "")} ${String(employee?.last_name || "")}`.trim(),
        bank?.bank_name,
        bank?.account_name,
        bank?.iban,
        Number(line.amount || 0).toFixed(2),
        batch.currency,
        batch.payment_date,
        batch.batch_number,
      ].map(csvCell).join(",");
    });
    const csv = `\uFEFF${header.map(csvCell).join(",")}\r\n${body.join("\r\n")}\r\n`;
    const checksum = createHash("sha256").update(csv).digest("hex");
    const { error: recordError } = await supabase.rpc("record_payroll_export", {
      p_payment_batch_id: id,
      p_export_type: "bank_csv",
      p_schema_version: "generic-payroll-bank-csv/1.0",
      p_field_mapping: {
        employeeNumber: "Employee number",
        beneficiary: "Beneficiary",
        bank: "Bank",
        accountName: "Account name",
        iban: "IBAN",
        amount: "Amount",
        currency: "Currency",
        paymentDate: "Payment date",
        reference: "Reference",
      },
      p_file_checksum: checksum,
      p_storage_path: null,
    });
    if (recordError) return NextResponse.json({ error: recordError.message }, { status: 400 });
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${batch.batch_number}.csv"`,
        "x-content-checksum-sha256": checksum,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Payroll export failed." },
      { status: 500 },
    );
  }
}
