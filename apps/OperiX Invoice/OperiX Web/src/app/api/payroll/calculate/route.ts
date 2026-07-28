import { NextResponse } from "next/server";
import { calculatePayroll, type PayrollComponent } from "@invoice-monorepo/payroll";
import { createClient } from "@/lib/supabase/server";

type Row = Record<string, unknown>;

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { runId?: string };
  if (!body.runId) return NextResponse.json({ error: "runId is required." }, { status: 400 });

  const { data: run, error: runError } = await supabase
    .from("payroll_runs")
    .select("id,company_id,branch_id,config_set_id,payroll_period_id,status,currency")
    .eq("id", body.runId)
    .single();
  if (runError || !run) return NextResponse.json({ error: runError?.message || "Payroll run not found." }, { status: 404 });
  if (!["draft", "collecting_inputs", "calculated", "calculation_failed"].includes(run.status)) {
    return NextResponse.json({ error: `Payroll cannot be calculated in state ${run.status}.` }, { status: 409 });
  }

  const [periodResult, configResult, bracketsResult, pensionResult, employeesResult, compensationResult, taxProfilesResult, pensionProfilesResult, snapshotsResult, earningResult, deductionResult, adjustmentResult] =
    await Promise.all([
      supabase.from("payroll_periods").select("starts_on,ends_on").eq("id", run.payroll_period_id).single(),
      supabase.from("payroll_config_sets").select("*").eq("id", run.config_set_id).single(),
      supabase.from("payroll_tax_brackets").select("*").eq("config_set_id", run.config_set_id).order("bracket_order"),
      supabase.from("payroll_pension_rules").select("*").eq("config_set_id", run.config_set_id).eq("employee_category", "standard").single(),
      supabase.from("employees").select("id,branch_id,department,cost_centre_id,project_id,payroll_ready_status").eq("company_id", run.company_id).eq("status", "active"),
      supabase.from("employee_compensation_profiles").select("*").eq("company_id", run.company_id).eq("status", "approved").order("effective_from", { ascending: false }),
      supabase.from("employee_tax_profiles").select("*").eq("company_id", run.company_id).order("effective_from", { ascending: false }),
      supabase.from("employee_pension_profiles").select("*").eq("company_id", run.company_id).order("effective_from", { ascending: false }),
      supabase.from("payroll_input_snapshots").select("*").eq("payroll_run_id", run.id).in("status", ["validated", "imported"]),
      supabase.from("employee_recurring_earnings").select("*,earning_type:payroll_earning_types(*)").eq("company_id", run.company_id),
      supabase.from("employee_recurring_deductions").select("*,deduction_type:payroll_deduction_types(*)").eq("company_id", run.company_id),
      supabase.from("payroll_adjustments").select("*").eq("payroll_run_id", run.id).eq("status", "approved"),
    ]);

  const firstError = [periodResult, configResult, bracketsResult, pensionResult, employeesResult, compensationResult, taxProfilesResult, pensionProfilesResult, snapshotsResult, earningResult, deductionResult, adjustmentResult]
    .find((result) => result.error)?.error;
  if (firstError || !periodResult.data || !configResult.data || !pensionResult.data) {
    return NextResponse.json({ error: firstError?.message || "Payroll configuration is incomplete." }, { status: 422 });
  }

  const period = periodResult.data;
  const config = configResult.data;
  const pensionRule = pensionResult.data;
  const onDate = period.ends_on;
  const effective = (row: Row) =>
    String(row.effective_from) <= onDate && (!row.effective_until || String(row.effective_until) >= period.starts_on);
  const latestFor = (rows: Row[], employeeId: string) =>
    rows.find((row) => row.employee_id === employeeId && effective(row));
  const components = (rows: Row[], employeeId: string, typeKey: "earning_type" | "deduction_type"): PayrollComponent[] =>
    rows.filter((row) => row.employee_id === employeeId && effective(row)).map((row) => {
      const component = row[typeKey] as Row | Row[] | null;
      const type = Array.isArray(component) ? component[0] : component;
      return {
        code: String(type?.code || (typeKey === "earning_type" ? "EARNING" : "DEDUCTION")),
        label: String(type?.name || (typeKey === "earning_type" ? "Earning" : "Deduction")),
        amount: String(row.amount || "0"),
        taxable: Boolean(type?.taxable ?? typeKey === "earning_type"),
        pensionable: Boolean(type?.pensionable ?? typeKey === "earning_type"),
        accountingMappingCode: type?.accounting_mapping_code ? String(type.accounting_mapping_code) : null,
        sourceReference: row.source_reference ? String(row.source_reference) : null,
      };
    });

  const results: Array<{ employeeId: string; status: "calculated" | "error"; message?: string }> = [];
  for (const employee of (employeesResult.data || []) as Row[]) {
    const employeeId = String(employee.id);
    if (employee.payroll_ready_status !== "ready" || (run.branch_id && employee.branch_id !== run.branch_id)) continue;
    const compensation = latestFor((compensationResult.data || []) as Row[], employeeId);
    const taxProfile = latestFor((taxProfilesResult.data || []) as Row[], employeeId);
    const pensionProfile = latestFor((pensionProfilesResult.data || []) as Row[], employeeId);
    if (!compensation || !taxProfile || !pensionProfile) {
      results.push({ employeeId, status: "error", message: "Missing effective compensation, tax or pension profile." });
      continue;
    }
    const inputPayload: Record<string, unknown> = Object.assign({}, ...((snapshotsResult.data || []) as Row[])
      .filter((row) => row.employee_id === employeeId && row.status !== "superseded")
      .map((row) => row.payload as object));
    const adjustments = ((adjustmentResult.data || []) as Row[]).filter((row) => row.employee_id === employeeId);
    const adjustmentEarnings: PayrollComponent[] = adjustments.filter((row) => Number(row.amount) > 0).map((row) => ({
      code: `ADJUSTMENT_${String(row.adjustment_type).toUpperCase()}`,
      label: String(row.adjustment_type).replaceAll("_", " "),
      amount: String(row.amount),
      taxable: true,
      pensionable: true,
      sourceReference: String(row.id),
    }));
    const adjustmentDeductions: PayrollComponent[] = adjustments.filter((row) => Number(row.amount) < 0).map((row) => ({
      code: `ADJUSTMENT_${String(row.adjustment_type).toUpperCase()}`,
      label: String(row.adjustment_type).replaceAll("_", " "),
      amount: String(Math.abs(Number(row.amount))),
      taxable: false,
      pensionable: false,
      sourceReference: String(row.id),
    }));
    const result = calculatePayroll({
      employeeId,
      salaryBasis: compensation.salary_basis as "gross-monthly" | "net-monthly" | "hourly" | "daily",
      contractedAmount: String(compensation.amount),
      standardHours: compensation.standard_hours ? String(compensation.standard_hours) : undefined,
      standardDays: compensation.standard_days ? String(compensation.standard_days) : undefined,
      actualHours: inputPayload.actualHours ? String(inputPayload.actualHours) : undefined,
      actualDays: inputPayload.actualDays ? String(inputPayload.actualDays) : undefined,
      earnings: [...components((earningResult.data || []) as Row[], employeeId, "earning_type"), ...adjustmentEarnings],
      deductions: [...components((deductionResult.data || []) as Row[], employeeId, "deduction_type"), ...adjustmentDeductions],
      taxExemptionAmount: String(taxProfile.exemption_amount || "0"),
      taxExempt: Boolean(taxProfile.tax_exempt),
      pensionExempt: Boolean(pensionProfile.pension_exempt),
    }, {
      currency: String(config.currency || "EUR"),
      scale: Number(config.decimal_scale || 2),
      roundingMode: config.rounding_mode as "half-up" | "half-even" | "truncate",
      employeePensionRatePercent: String(pensionProfile.employee_rate_override ?? pensionRule.employee_rate_percent),
      employerPensionRatePercent: String(pensionProfile.employer_rate_override ?? pensionRule.employer_rate_percent),
      minimumPensionBase: pensionRule.minimum_contribution_base ? String(pensionRule.minimum_contribution_base) : null,
      maximumPensionBase: pensionRule.maximum_contribution_base ? String(pensionRule.maximum_contribution_base) : null,
      taxBrackets: (bracketsResult.data || []).map((bracket) => ({
        lowerBound: String(bracket.lower_bound),
        upperBound: bracket.upper_bound === null ? null : String(bracket.upper_bound),
        ratePercent: String(bracket.rate_percent),
        fixedAmount: String(bracket.fixed_amount),
      })),
      ruleReferences: [{
        id: String(config.id),
        version: Number(config.version),
        effectiveFrom: String(config.effective_from),
        effectiveUntil: config.effective_until ? String(config.effective_until) : null,
        sourceReference: config.rule_source_reference ? String(config.rule_source_reference) : null,
      }],
    });
    const { error } = await supabase.rpc("save_payroll_calculation", {
      p_payroll_run_id: run.id,
      p_employee_id: employeeId,
      p_compensation_profile_id: compensation.id,
      p_tax_profile_id: taxProfile.id,
      p_pension_profile_id: pensionProfile.id,
      p_result: result,
      p_lines: result.lines,
    });
    results.push(error ? { employeeId, status: "error", message: error.message } : { employeeId, status: "calculated" });
  }

  const calculated = results.filter((result) => result.status === "calculated").length;
  return NextResponse.json({ runId: run.id, calculated, errors: results.filter((result) => result.status === "error") });
}
