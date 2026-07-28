"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle, Banknote, CalendarDays, CheckCircle2, ClipboardCheck, Download,
  FileText, Landmark, Loader2, LockKeyhole, Play, RefreshCw, Settings2, ShieldCheck,
  Users, WalletCards,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { money } from "@/lib/format";

export type PayrollSection =
  | "dashboard" | "employees" | "compensation" | "periods" | "runs" | "review"
  | "adjustments" | "approvals" | "payslips" | "payment-batches" | "reconciliation"
  | "configuration" | "reports" | "audit";
type Row = Record<string, unknown>;

const sections: Array<{ key: PayrollSection; label: string; icon: typeof Users }> = [
  { key: "dashboard", label: "Dashboard", icon: WalletCards },
  { key: "employees", label: "Employees", icon: Users },
  { key: "compensation", label: "Compensation", icon: Banknote },
  { key: "periods", label: "Periods", icon: CalendarDays },
  { key: "runs", label: "Payroll runs", icon: Play },
  { key: "review", label: "Review", icon: ClipboardCheck },
  { key: "adjustments", label: "Adjustments", icon: RefreshCw },
  { key: "approvals", label: "Approvals", icon: ShieldCheck },
  { key: "payslips", label: "Payslips", icon: FileText },
  { key: "payment-batches", label: "Payment batches", icon: Landmark },
  { key: "reconciliation", label: "Reconciliation", icon: CheckCircle2 },
  { key: "configuration", label: "Configuration", icon: Settings2 },
  { key: "reports", label: "Reports", icon: Download },
  { key: "audit", label: "Audit", icon: LockKeyhole },
];

export function PayrollView({ section = "dashboard", runId }: { section?: PayrollSection; runId?: string }) {
  const workspace = useWorkspace();
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [flags, setFlags] = useState<Row[]>([]);
  const [configs, setConfigs] = useState<Row[]>([]);
  const [periods, setPeriods] = useState<Row[]>([]);
  const [runs, setRuns] = useState<Row[]>([]);
  const [employees, setEmployees] = useState<Row[]>([]);
  const [runEmployees, setRunEmployees] = useState<Row[]>([]);
  const [liabilities, setLiabilities] = useState<Row[]>([]);
  const [payslips, setPayslips] = useState<Row[]>([]);
  const [batches, setBatches] = useState<Row[]>([]);
  const [mappings, setMappings] = useState<Row[]>([]);
  const [accounts, setAccounts] = useState<Row[]>([]);
  const [branches, setBranches] = useState<Row[]>([]);
  const [costCentres, setCostCentres] = useState<Row[]>([]);
  const [projects, setProjects] = useState<Row[]>([]);
  const [bankAccounts, setBankAccounts] = useState<Row[]>([]);
  const [adjustments, setAdjustments] = useState<Row[]>([]);
  const [audit, setAudit] = useState<Row[]>([]);

  const load = useCallback(async () => {
    if (!workspace.companyId) return;
    const supabase = createClient();
    if (!supabase) return;
    setLoading(true);
    setError("");
    const companyId = workspace.companyId;
    const queryRunId = runId || runs[0]?.id;
    const results = await Promise.all([
      supabase.from("company_feature_flags").select("*").eq("company_id", companyId).like("flag", "%payroll%"),
      supabase.from("payroll_config_sets").select("*").eq("company_id", companyId).order("version", { ascending: false }),
      supabase.from("payroll_periods").select("*").eq("company_id", companyId).order("starts_on", { ascending: false }),
      supabase.from("payroll_runs").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
      supabase.from("employees").select("id,first_name,last_name,email,department,status,employee_number,branch_id,cost_centre_id,project_id,payroll_ready_status").eq("company_id", companyId).order("first_name"),
      queryRunId ? supabase.from("payroll_run_employees").select("*,employee:employees(first_name,last_name,employee_number,department)").eq("payroll_run_id", queryRunId) : Promise.resolve({ data: [], error: null }),
      supabase.from("payroll_liabilities").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
      supabase.from("payslip_snapshots").select("id,employee_id,payroll_run_id,language,verification_reference,snapshot,generated_at,revoked_at,employee:employees(first_name,last_name,employee_number)").eq("company_id", companyId).order("generated_at", { ascending: false }),
      supabase.from("payroll_payment_batches").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
      supabase.from("payroll_posting_mappings").select("*,account:chart_of_accounts(code,name)").eq("company_id", companyId).eq("active", true),
      supabase.from("chart_of_accounts").select("id,code,name,account_type").eq("company_id", companyId).eq("active", true).eq("posting_allowed", true).order("code"),
      supabase.from("branches").select("id,name,code").eq("company_id", companyId).eq("is_active", true).order("name"),
      supabase.from("accounting_cost_centres").select("id,code,name").eq("company_id", companyId).eq("active", true).order("code"),
      supabase.from("accounting_projects").select("id,code,name").eq("company_id", companyId).eq("active", true).order("code"),
      supabase.from("company_bank_accounts").select("id,bank_name,account_name,iban,currency").eq("company_id", companyId).eq("is_active", true).order("is_primary", { ascending: false }),
      supabase.from("payroll_adjustments").select("*,employee:employees(first_name,last_name,employee_number),run:payroll_runs(run_number,status)").eq("company_id", companyId).order("created_at", { ascending: false }),
      supabase.from("audit_events").select("*").eq("company_id", companyId).like("action", "payroll.%").order("occurred_at", { ascending: false }).limit(100),
    ]);
    const failed = results.find((result) => result.error)?.error;
    if (failed) setError(failed.message);
    [setFlags, setConfigs, setPeriods, setRuns, setEmployees, setRunEmployees, setLiabilities, setPayslips, setBatches, setMappings, setAccounts, setBranches, setCostCentres, setProjects, setBankAccounts, setAdjustments, setAudit]
      .forEach((setter, index) => setter((results[index].data || []) as Row[]));
    setLoading(false);
  }, [workspace.companyId, runId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (workspace.loading) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [workspace.loading, load]);

  const enabled = flags.some((flag) => flag.flag === "payroll_enabled" && flag.enabled);
  const activeConfig = configs.find((config) => config.status === "approved");
  const selectedRun = runId ? runs.find((run) => run.id === runId) : runs[0];
  const totals = useMemo(() => runs.filter((run) => ["finalized", "payment_pending", "partially_paid", "paid"].includes(String(run.status)))
    .reduce<{ gross: number; net: number; tax: number; pension: number }>((sum, run) => ({
      gross: sum.gross + Number(run.total_gross || 0),
      net: sum.net + Number(run.total_net || 0),
      tax: sum.tax + Number(run.total_tax || 0),
      pension: sum.pension + Number(run.total_employee_pension || 0) + Number(run.total_employer_pension || 0),
    }), { gross: 0, net: 0, tax: 0, pension: 0 }), [runs]);

  async function act(name: string, action: () => Promise<{ error: { message: string } | null }>) {
    setWorking(name); setError(""); setNotice("");
    const result = await action();
    if (result.error) setError(result.error.message);
    else setNotice("Payroll action completed.");
    setWorking("");
    await load();
  }

  async function calculate(id: string) {
    setWorking(`calculate:${id}`); setError(""); setNotice("");
    const response = await fetch("/api/payroll/calculate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId: id }) });
    const body = await response.json() as { calculated?: number; errors?: Array<{ message?: string }>; error?: string };
    if (!response.ok) setError(body.error || "Payroll calculation failed.");
    else if (body.errors?.length) setError(`${body.calculated || 0} calculated; ${body.errors.length} require review. ${body.errors[0]?.message || ""}`);
    else setNotice(`${body.calculated || 0} employees calculated deterministically.`);
    setWorking(""); await load();
  }

  if (loading || workspace.loading) return <div className="grid min-h-[55vh] place-items-center"><Loader2 className="animate-spin text-[#004ffe]" /></div>;

  return <div className="mx-auto max-w-[1700px] p-4 lg:p-6">
    <header className="flex flex-wrap items-end gap-3">
      <div className="min-w-[250px] flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#004ffe]">OperiX Invoice</p>
        <h1 className="page-title mt-1">Payroll</h1>
        <p className="muted mt-1 text-xs">Kosovo-ready, versioned payroll with immutable accounting and payment outputs.</p>
      </div>
      <button className="btn" onClick={() => void load()}><RefreshCw size={16}/>Refresh</button>
    </header>

    {error ? <p className="mt-4 rounded-md bg-[#fff3f2] p-3 text-xs text-[#d92d20]">{error}</p> : null}
    {notice ? <p className="mt-4 rounded-md bg-[#ecfdf3] p-3 text-xs text-[#027a48]">{notice}</p> : null}
    {!enabled ? <FeatureGate companyId={workspace.companyId!} onComplete={load} /> : null}
    {enabled && !activeConfig ? <p className="mt-4 flex items-center gap-2 rounded-md bg-[#fffaeb] p-3 text-xs text-[#b54708]"><AlertTriangle size={16}/>Payroll is enabled, but no legally reviewed configuration is approved. Calculation and finalization remain blocked.</p> : null}

    <nav className="mt-5 flex gap-1 overflow-x-auto rounded-lg border bg-white p-1 scrollbar-none">
      {sections.map((item) => { const Icon = item.icon; const active = section === item.key; return <Link key={item.key} href={item.key === "dashboard" ? "/payroll" : `/payroll/${item.key}`} className={`flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-[11px] font-medium ${active ? "bg-[#004ffe] text-white" : "text-[#667085] hover:bg-[#f7f9fc]"}`}><Icon size={15}/>{item.label}</Link>; })}
    </nav>

    {section === "dashboard" ? <Dashboard totals={totals} employees={employees} runs={runs} liabilities={liabilities} payslips={payslips}/> : null}
    {section === "employees" || section === "compensation" ? <EmployeesPanel employees={employees} branches={branches} costCentres={costCentres} projects={projects} onComplete={load}/> : null}
    {section === "periods" ? <PeriodsPanel companyId={workspace.companyId!} periods={periods} onComplete={load}/> : null}
    {section === "runs" || section === "review" || Boolean(runId) ? <RunsPanel companyId={workspace.companyId!} runs={runs} periods={periods} configs={configs} branches={branches} selectedRun={selectedRun} runEmployees={runEmployees} working={working} calculate={calculate} act={act}/> : null}
    {section === "configuration" ? <ConfigurationPanel companyId={workspace.companyId!} configs={configs} accounts={accounts} mappings={mappings} onComplete={load}/> : null}
    {section === "payslips" ? <PayslipsPanel rows={payslips}/> : null}
    {section === "payment-batches" || section === "reconciliation" ? <PaymentsPanel runs={runs} bankAccounts={bankAccounts} batches={batches} liabilities={liabilities} onComplete={load}/> : null}
    {section === "reports" ? <ReportsPanel totals={totals} runEmployees={runEmployees} runs={runs}/> : null}
    {section === "adjustments" ? <AdjustmentsPanel runs={runs} employees={employees} adjustments={adjustments} onComplete={load}/> : null}
    {section === "approvals" ? <AdjustmentApprovalsPanel adjustments={adjustments} onComplete={load}/> : null}
    {section === "audit" ? <AuditPanel rows={audit}/> : null}
  </div>;
}

function Dashboard({ totals, employees, runs, liabilities, payslips }: { totals: { gross: number; net: number; tax: number; pension: number }; employees: Row[]; runs: Row[]; liabilities: Row[]; payslips: Row[] }) {
  const cards = [["Gross payroll", totals.gross], ["Net salary", totals.net], ["Tax", totals.tax], ["Pension", totals.pension]];
  return <div className="mt-5 grid gap-4">
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value]) => <article className="card p-4" key={String(label)}><p className="muted text-[11px]">{label}</p><strong className="mt-2 block text-xl">{money(Number(value))}</strong></article>)}</section>
    <section className="grid gap-4 lg:grid-cols-3"><Stat label="Payroll-ready employees" value={employees.filter((row) => row.payroll_ready_status === "ready").length}/><Stat label="Runs awaiting approval" value={runs.filter((row) => ["under_review", "pending_approval"].includes(String(row.status))).length}/><Stat label="Open liabilities" value={liabilities.filter((row) => row.status !== "paid").length}/></section>
    <section className="card p-5"><h2 className="font-semibold">Release readiness</h2><div className="mt-4 grid gap-3 md:grid-cols-3"><Checklist ok={employees.some((row) => row.payroll_ready_status === "ready")} text="Employee payroll profiles"/><Checklist ok={runs.some((row) => row.status === "finalized")} text="Finalized payroll run"/><Checklist ok={payslips.length > 0} text="Immutable payslip snapshots"/></div></section>
  </div>;
}
function Stat({ label, value }: { label: string; value: number }) { return <article className="card p-5"><strong className="text-2xl text-[#004ffe]">{value}</strong><p className="muted mt-1 text-xs">{label}</p></article>; }
function Checklist({ ok, text }: { ok: boolean; text: string }) { return <div className="flex items-center gap-2 text-xs">{ok ? <CheckCircle2 className="text-[#12b76a]" size={17}/> : <AlertTriangle className="text-[#f79009]" size={17}/>} {text}</div>; }

function FeatureGate({ companyId, onComplete }: { companyId: string; onComplete: () => Promise<void> }) {
  const [working, setWorking] = useState(false);
  return <section className="card mt-5 border-[#fedf89] bg-[#fffcf5] p-5"><h2 className="font-semibold">Payroll is safely disabled</h2><p className="muted mt-2 max-w-3xl text-xs">Enable the payroll foundation only after assigning payroll roles. Kosovo tax and pension values still require an approved source and accountant/legal review.</p><button className="btn btn-primary mt-4" disabled={working} onClick={async () => { const reason=window.prompt("Reason for enabling payroll for this company"); if(!reason)return; setWorking(true); const supabase=createClient(); if(supabase) await supabase.rpc("set_payroll_feature_flags",{p_company_id:companyId,p_enabled:true,p_reason:reason}); setWorking(false); await onComplete(); }}>{working?<Loader2 size={15} className="animate-spin"/>:<ShieldCheck size={15}/>}Enable controlled payroll setup</button></section>;
}

function EmployeesPanel({ employees, branches, costCentres, projects, onComplete }: { employees: Row[]; branches: Row[]; costCentres: Row[]; projects: Row[]; onComplete: () => Promise<void> }) {
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);
  const employee = employees.find((row) => row.id === selected);
  async function submit(form: FormData) {
    if (!selected) return; setSaving(true);
    const supabase=createClient();
    if(supabase) await supabase.rpc("save_employee_payroll_profile",{
      p_employee_id:selected,p_employee_number:String(form.get("number")||""),p_branch_id:String(form.get("branch")||"")||null,
      p_cost_centre_id:String(form.get("costCentre")||"")||null,p_project_id:String(form.get("project")||"")||null,
      p_salary_basis:String(form.get("basis")||"gross-monthly"),p_contracted_amount:String(form.get("amount")||"0"),
      p_standard_hours:String(form.get("hours")||"")||null,p_standard_days:String(form.get("days")||"")||null,
      p_effective_from:String(form.get("effectiveFrom")),p_tax_status:String(form.get("taxStatus")||"standard"),
      p_pension_status:String(form.get("pensionStatus")||"standard"),p_iban:String(form.get("iban")||""),
      p_bank_name:String(form.get("bank")||""),p_reason:String(form.get("reason")||""),
    });
    setSaving(false); await onComplete();
  }
  return <div className="mt-5 grid gap-4 xl:grid-cols-[1.2fr_.8fr]"><section className="card overflow-hidden"><TableHead columns={["Employee","Department","Number","Readiness"]}/>{employees.map((row)=><button key={String(row.id)} onClick={()=>setSelected(String(row.id))} className={`grid w-full grid-cols-4 gap-3 border-t p-3 text-left text-xs hover:bg-[#f7f9fc] ${selected===row.id?"bg-[#edf4ff]":""}`}><span className="font-medium">{String(row.first_name || "")} {String(row.last_name || "")}</span><span>{String(row.department||"—")}</span><span>{String(row.employee_number||"—")}</span><Status value={String(row.payroll_ready_status||"requires_review")}/></button>)}</section><form action={(data)=>void submit(data)} className="card grid content-start gap-3 p-5"><h2 className="font-semibold">Payroll-ready employee profile</h2>{!employee?<p className="muted text-xs">Select an employee to configure effective compensation.</p>:<><input name="number" className="input" placeholder="Employee number" defaultValue={String(employee.employee_number||"")}/><Select name="branch" label="Branch" rows={branches}/><Select name="costCentre" label="Cost centre" rows={costCentres} optional/><Select name="project" label="Project" rows={projects} optional/><select name="basis" className="input"><option value="gross-monthly">Gross monthly</option><option value="net-monthly">Net monthly</option><option value="hourly">Hourly</option><option value="daily">Daily</option></select><input name="amount" type="number" min="0" step="0.01" className="input" placeholder="Contracted EUR amount"/><div className="grid grid-cols-2 gap-2"><input name="hours" type="number" step="0.01" className="input" placeholder="Standard hours"/><input name="days" type="number" step="0.01" className="input" placeholder="Standard days"/></div><input name="effectiveFrom" type="date" required className="input"/><div className="grid grid-cols-2 gap-2"><input name="taxStatus" className="input" defaultValue="standard"/><input name="pensionStatus" className="input" defaultValue="standard"/></div><input name="iban" className="input" placeholder="IBAN"/><input name="bank" className="input" placeholder="Bank name"/><input name="reason" required className="input" placeholder="Reason for effective change"/><button className="btn btn-primary" disabled={saving}>{saving?<Loader2 size={15} className="animate-spin"/>:null}Save effective profile</button></>}</form></div>;
}

function PeriodsPanel({ companyId, periods, onComplete }: { companyId: string; periods: Row[]; onComplete: () => Promise<void> }) {
  const [saving,setSaving]=useState(false);
  return <div className="mt-5 grid gap-4 lg:grid-cols-[.7fr_1.3fr]"><form className="card grid gap-3 p-5" action={async(form)=>{setSaving(true);const supabase=createClient();if(supabase)await supabase.rpc("create_payroll_period",{p_company_id:companyId,p_code:String(form.get("code")),p_name:String(form.get("name")),p_starts_on:String(form.get("starts")),p_ends_on:String(form.get("ends")),p_payment_date:String(form.get("payment")),p_payroll_group_id:null});setSaving(false);await onComplete();}}><h2 className="font-semibold">New payroll period</h2><input name="code" required className="input" placeholder="2026-07"/><input name="name" required className="input" placeholder="July 2026"/><label className="field">Start<input name="starts" type="date" required className="input"/></label><label className="field">End<input name="ends" type="date" required className="input"/></label><label className="field">Payment date<input name="payment" type="date" required className="input"/></label><button className="btn btn-primary" disabled={saving}>Create period</button></form><section className="card overflow-hidden"><TableHead columns={["Period","Dates","Payment","Status"]}/>{periods.map(row=><div key={String(row.id)} className="grid grid-cols-4 gap-3 border-t p-3 text-xs"><strong>{String(row.name)}</strong><span>{String(row.starts_on)} – {String(row.ends_on)}</span><span>{String(row.payment_date)}</span><Status value={String(row.status)}/></div>)}</section></div>;
}

function RunsPanel({ companyId, runs, periods, configs, branches, selectedRun, runEmployees, working, calculate, act }: { companyId: string; runs: Row[]; periods: Row[]; configs: Row[]; branches: Row[]; selectedRun?: Row; runEmployees: Row[]; working: string; calculate: (id:string)=>Promise<void>; act: (name:string, action:()=>Promise<{error:{message:string}|null}>)=>Promise<void> }) {
  const [creating,setCreating]=useState(false);
  return <div className="mt-5 grid gap-4"><form className="card grid gap-3 p-4 md:grid-cols-5" action={async(form)=>{setCreating(true);const supabase=createClient();if(supabase)await supabase.rpc("create_payroll_run",{p_company_id:companyId,p_payroll_period_id:String(form.get("period")),p_config_set_id:String(form.get("config")),p_run_type:"regular",p_branch_id:String(form.get("branch")||"")||null,p_payroll_group_id:null,p_idempotency_key:crypto.randomUUID(),p_original_run_id:null});setCreating(false);window.location.reload();}}><select name="period" required className="input"><option value="">Period</option>{periods.filter(row=>["open","reopened","processing"].includes(String(row.status))).map(row=><option key={String(row.id)} value={String(row.id)}>{String(row.name)}</option>)}</select><select name="config" required className="input"><option value="">Approved configuration</option>{configs.filter(row=>row.status==="approved").map(row=><option key={String(row.id)} value={String(row.id)}>v{String(row.version)} · {String(row.name)}</option>)}</select><select name="branch" className="input"><option value="">All branches</option>{branches.map(row=><option key={String(row.id)} value={String(row.id)}>{String(row.name)}</option>)}</select><button className="btn btn-primary md:col-span-2" disabled={creating}>Create payroll run</button></form><section className="card overflow-hidden"><TableHead columns={["Run","Status","Gross","Net","Actions"]}/>{runs.map(row=><div key={String(row.id)} className="grid grid-cols-[1fr_.8fr_.8fr_.8fr_1.7fr] items-center gap-3 border-t p-3 text-xs"><Link className="font-semibold text-[#004ffe]" href={`/payroll/runs/${row.id}`}>{String(row.run_number)}</Link><Status value={String(row.status)}/><span>{money(Number(row.total_gross||0))}</span><span>{money(Number(row.total_net||0))}</span><div className="flex flex-wrap gap-1"><button className="btn h-8 px-2 text-[10px]" disabled={Boolean(working)} onClick={()=>void calculate(String(row.id))}>Calculate</button>{row.status==="calculated"?<button className="btn h-8 px-2 text-[10px]" onClick={()=>void act("review",async()=>{const s=createClient();return s?await s.rpc("submit_payroll_for_review",{p_payroll_run_id:row.id}):{error:{message:"Unavailable"}};})}>Review</button>:null}{row.status==="under_review"?<button className="btn h-8 px-2 text-[10px]" onClick={()=>void act("approve",async()=>{const s=createClient();return s?await s.rpc("approve_payroll_run",{p_payroll_run_id:row.id,p_reason:"Reviewed in OperiX Invoice"}):{error:{message:"Unavailable"}};})}>Approve</button>:null}{row.status==="approved"?<button className="btn btn-primary h-8 px-2 text-[10px]" onClick={()=>void act("finalize",async()=>{const s=createClient();return s?await s.rpc("finalize_payroll_run",{p_payroll_run_id:row.id,p_idempotency_key:crypto.randomUUID(),p_reason:"Authorized payroll finalization"}):{error:{message:"Unavailable"}};})}>Finalize</button>:null}</div></div>)}</section>{selectedRun?<section className="card overflow-hidden"><div className="border-b p-4"><h2 className="font-semibold">{String(selectedRun.run_number)} employee review</h2><p className="muted text-xs">{runEmployees.length} calculated employees</p></div><TableHead columns={["Employee","Gross","Pension","Tax","Net"]}/>{runEmployees.map(row=>{const employee=(Array.isArray(row.employee)?row.employee[0]:row.employee) as Row;return <div key={String(row.id)} className="grid grid-cols-5 gap-3 border-t p-3 text-xs"><strong>{String(employee?.first_name||"")} {String(employee?.last_name||"")}</strong><span>{money(Number(row.gross_pay))}</span><span>{money(Number(row.employee_pension))}</span><span>{money(Number(row.personal_income_tax))}</span><strong>{money(Number(row.net_salary))}</strong></div>})}</section>:null}</div>;
}

function ConfigurationPanel({ companyId, configs, accounts, mappings, onComplete }: { companyId:string; configs:Row[]; accounts:Row[]; mappings:Row[]; onComplete:()=>Promise<void> }) {
  const [saving,setSaving]=useState(false);
  const required=["SALARY_EXPENSE","EMPLOYER_PENSION_EXPENSE","EMPLOYEE_PENSION_PAYABLE","EMPLOYER_PENSION_PAYABLE","PERSONAL_INCOME_TAX_PAYABLE","OTHER_DEDUCTION_PAYABLE","NET_SALARY_PAYABLE"];
  return <div className="mt-5 grid gap-4 xl:grid-cols-2"><form className="card grid gap-3 p-5" action={async(form)=>{setSaving(true);const supabase=createClient();let brackets:unknown=[];try{brackets=JSON.parse(String(form.get("brackets")));}catch{}if(supabase)await supabase.rpc("save_payroll_configuration",{p_company_id:companyId,p_name:String(form.get("name")),p_effective_from:String(form.get("from")),p_effective_until:String(form.get("until")||"")||null,p_rule_source_reference:String(form.get("source")),p_rounding_mode:String(form.get("rounding")),p_money_scale:2,p_tax_brackets:brackets,p_pension_rule:{employeeRatePercent:String(form.get("employeePension")),employerRatePercent:String(form.get("employerPension"))},p_reason:String(form.get("reason"))});setSaving(false);await onComplete();}}><h2 className="font-semibold">Versioned Kosovo payroll rules</h2><p className="rounded-md bg-[#fffaeb] p-3 text-[11px] text-[#b54708]">Enter only values reviewed against a cited legal/accounting source. OperiX does not pre-fill or claim legal approval.</p><input name="name" required className="input" placeholder="Configuration name"/><div className="grid grid-cols-2 gap-2"><input name="from" type="date" required className="input"/><input name="until" type="date" className="input"/></div><input name="source" required className="input" placeholder="Legal/source reference"/><select name="rounding" className="input"><option value="half-up">Half up</option><option value="half-even">Half even</option><option value="truncate">Truncate</option></select><textarea name="brackets" required className="input min-h-32 font-mono text-[10px]" placeholder='[{"sequence":1,"lowerBound":"0","upperBound":null,"ratePercent":"0","fixedAmount":"0"}]'/><div className="grid grid-cols-2 gap-2"><input name="employeePension" required type="number" step="0.000001" className="input" placeholder="Employee pension %"/><input name="employerPension" required type="number" step="0.000001" className="input" placeholder="Employer pension %"/></div><input name="reason" required className="input" placeholder="Configuration reason"/><button className="btn btn-primary" disabled={saving}>Save draft version</button>{configs.map(row=><div key={String(row.id)} className="flex items-center gap-2 rounded border p-2 text-xs"><span>v{String(row.version)} · {String(row.name)}</span><Status value={String(row.status)}/>{row.status==="draft"?<button type="button" className="ml-auto text-[#004ffe]" onClick={async()=>{const reason=window.prompt("Approval reason");if(!reason)return;const s=createClient();if(s)await s.rpc("approve_payroll_configuration",{p_config_set_id:row.id,p_reason:reason});await onComplete();}}>Approve</button>:null}</div>)}</form><section className="card p-5"><h2 className="font-semibold">Payroll posting mappings</h2><p className="muted mt-1 text-xs">Every finalization mapping must resolve to an active posting account.</p><div className="mt-4 grid gap-2">{required.map(code=>{const existing=mappings.find(row=>row.mapping_code===code);return <form key={code} className="grid grid-cols-[1fr_1.2fr_auto] items-center gap-2" action={async(form)=>{const s=createClient();if(s)await s.rpc("save_payroll_posting_mapping",{p_company_id:companyId,p_mapping_code:code,p_account_id:String(form.get("account")),p_branch_id:null,p_cost_centre_id:null,p_project_id:null,p_effective_from:new Date().toISOString().slice(0,10),p_reason:"Payroll account mapping setup"});await onComplete();}}><span className="text-[10px] font-semibold">{code}</span><select name="account" required className="input h-9 text-[10px]" defaultValue={String(existing?.account_id||"")}><option value="">Select account</option>{accounts.map(account=><option key={String(account.id)} value={String(account.id)}>{String(account.code)} · {String(account.name)}</option>)}</select><button className="btn h-9 px-2 text-[10px]">Save</button></form>})}</div></section></div>;
}

function PayslipsPanel({ rows }: { rows: Row[] }) { return <section className="card mt-5 overflow-hidden"><TableHead columns={["Payslip","Employee","Gross","Net","Status"]}/>{rows.map(row=>{const e=(Array.isArray(row.employee)?row.employee[0]:row.employee) as Row;const snapshot=row.snapshot as Row;return <div key={String(row.id)} className="grid grid-cols-5 items-center gap-3 border-t p-3 text-xs"><Link href={`/api/payroll/payslips/${row.id}`} className="font-semibold text-[#004ffe]">{String(snapshot?.runNumber||row.verification_reference||row.id)}</Link><span>{String(e?.first_name||"")} {String(e?.last_name||"")}</span><span>{money(Number(snapshot?.grossPay||0))}</span><strong>{money(Number(snapshot?.netSalary||0))}</strong><Status value={row.revoked_at?"revoked":"generated"}/></div>})}</section>; }
function PaymentsPanel({ runs, bankAccounts, batches, liabilities, onComplete }: { runs: Row[]; bankAccounts: Row[]; batches: Row[]; liabilities: Row[]; onComplete:()=>Promise<void> }) {
  return <div className="mt-5 grid gap-4"><form className="card grid gap-3 p-4 md:grid-cols-4" action={async(form)=>{const s=createClient();if(s)await s.rpc("create_payroll_payment_batch",{p_payroll_run_id:String(form.get("run")),p_company_bank_account_id:String(form.get("bank")),p_payment_date:String(form.get("date")),p_idempotency_key:crypto.randomUUID(),p_employee_ids:null});await onComplete();}}><select name="run" required className="input"><option value="">Finalized payroll run</option>{runs.filter(row=>["finalized","payment_pending","partially_paid"].includes(String(row.status))).map(row=><option key={String(row.id)} value={String(row.id)}>{String(row.run_number)}</option>)}</select><select name="bank" required className="input"><option value="">Company bank account</option>{bankAccounts.map(row=><option key={String(row.id)} value={String(row.id)}>{String(row.bank_name)} · {String(row.iban||row.account_name)}</option>)}</select><input name="date" type="date" required className="input"/><button className="btn btn-primary">Create payment batch</button></form><div className="grid gap-4 lg:grid-cols-2"><section className="card overflow-hidden"><div className="p-4 font-semibold">Payment batches</div>{batches.map(row=><div key={String(row.id)} className="flex flex-wrap items-center justify-between gap-2 border-t p-3 text-xs"><span>{String(row.batch_number)} · {money(Number(row.total_amount))}</span><div className="flex items-center gap-2"><Status value={String(row.status)}/>{row.status==="draft"?<button className="text-[#004ffe]" onClick={async()=>{const reason=window.prompt("Payment batch approval reason");if(!reason)return;const s=createClient();if(s)await s.rpc("approve_payroll_payment_batch",{p_batch_id:row.id,p_reason:reason});await onComplete();}}>Approve</button>:null}{["approved","exported","partially_paid","paid"].includes(String(row.status))?<a className="text-[#004ffe]" href={`/api/payroll/payment-batches/${row.id}/export`}>CSV</a>:null}</div></div>)}</section><section className="card overflow-hidden"><div className="p-4 font-semibold">Payroll liabilities</div>{liabilities.map(row=><div key={String(row.id)} className="flex items-center justify-between border-t p-3 text-xs"><span>{String(row.liability_type)} · {money(Number(row.amount)-Number(row.paid_amount||0))}</span><Status value={String(row.status)}/></div>)}</section></div></div>;
}
function ReportsPanel({ totals, runs }: { totals:{gross:number;net:number;tax:number;pension:number};runEmployees:Row[];runs:Row[] }) { return <div className="mt-5 grid gap-4"><section className="grid gap-3 md:grid-cols-4"><Stat label="Gross-to-net gross" value={Math.round(totals.gross)}/><Stat label="Net payable" value={Math.round(totals.net)}/><Stat label="Tax liability" value={Math.round(totals.tax)}/><Stat label="Pension liability" value={Math.round(totals.pension)}/></section><section className="card p-5"><h2 className="font-semibold">Journal-derived payroll reports</h2><p className="muted mt-2 text-xs">{runs.length} payroll runs available. PDF, Excel and CSV export snapshots are tracked in payroll_exports; statutory formats remain provider-based until an official specification is supplied.</p></section></div>; }
function AdjustmentsPanel({ runs, employees, adjustments, onComplete }: { runs:Row[];employees:Row[];adjustments:Row[];onComplete:()=>Promise<void> }) {
  const [saving,setSaving]=useState(false);
  return <div className="mt-5 grid gap-4 xl:grid-cols-[.75fr_1.25fr]">
    <form className="card grid content-start gap-3 p-5" action={async(form)=>{
      setSaving(true);
      const s=createClient();
      if(s) await s.rpc("add_payroll_adjustment",{
        p_payroll_run_id:String(form.get("run")),p_employee_id:String(form.get("employee")),
        p_adjustment_type:String(form.get("type")),p_amount:String(form.get("amount")),
        p_reason:String(form.get("reason")),p_source_period_id:null,
      });
      setSaving(false);await onComplete();
    }}>
      <h2 className="font-semibold">New payroll adjustment</h2>
      <p className="muted text-xs">Positive amounts are added earnings; negative amounts are deductions. A separate user must approve the adjustment.</p>
      <select name="run" required className="input"><option value="">Editable payroll run</option>{runs.filter(row=>["draft","collecting_inputs","calculated"].includes(String(row.status))).map(row=><option key={String(row.id)} value={String(row.id)}>{String(row.run_number)}</option>)}</select>
      <select name="employee" required className="input"><option value="">Employee</option>{employees.map(row=><option key={String(row.id)} value={String(row.id)}>{String(row.first_name)} {String(row.last_name)}</option>)}</select>
      <input name="type" required className="input" placeholder="Adjustment type, e.g. LATE_BONUS"/>
      <input name="amount" required type="number" step="0.01" className="input" placeholder="Signed EUR amount"/>
      <textarea name="reason" required className="input min-h-24" placeholder="Mandatory adjustment reason"/>
      <button className="btn btn-primary" disabled={saving}>{saving?<Loader2 className="animate-spin" size={15}/>:null}Submit for approval</button>
    </form>
    <AdjustmentList rows={adjustments}/>
  </div>;
}
function AdjustmentApprovalsPanel({ adjustments, onComplete }: {adjustments:Row[];onComplete:()=>Promise<void>}) {
  const pending=adjustments.filter(row=>row.status==="pending_approval");
  return <section className="card mt-5 overflow-hidden">
    <div className="p-4"><h2 className="font-semibold">Adjustment approvals</h2><p className="muted mt-1 text-xs">The database enforces creator/approver segregation.</p></div>
    {pending.length===0?<p className="border-t p-5 text-xs text-[#667085]">No adjustments await approval.</p>:pending.map(row=><AdjustmentRow key={String(row.id)} row={row} actions={<div className="flex gap-2"><button className="text-[#004ffe]" onClick={async()=>{const reason=window.prompt("Approval reason");if(!reason)return;const s=createClient();if(s)await s.rpc("approve_payroll_adjustment",{p_adjustment_id:row.id,p_approved:true,p_reason:reason});await onComplete();}}>Approve</button><button className="text-[#d92d20]" onClick={async()=>{const reason=window.prompt("Rejection reason");if(!reason)return;const s=createClient();if(s)await s.rpc("approve_payroll_adjustment",{p_adjustment_id:row.id,p_approved:false,p_reason:reason});await onComplete();}}>Reject</button></div>}/>)}
  </section>;
}
function AdjustmentList({rows}:{rows:Row[]}) { return <section className="card overflow-hidden"><div className="p-4 font-semibold">Adjustment history</div>{rows.length===0?<p className="border-t p-5 text-xs text-[#667085]">No adjustments recorded.</p>:rows.map(row=><AdjustmentRow key={String(row.id)} row={row}/>)}</section>; }
function AdjustmentRow({row,actions}:{row:Row;actions?:ReactNode}) {
  const employee=(Array.isArray(row.employee)?row.employee[0]:row.employee) as Row;
  const run=(Array.isArray(row.run)?row.run[0]:row.run) as Row;
  return <div className="grid gap-3 border-t p-3 text-xs md:grid-cols-[1.1fr_1fr_.7fr_.7fr_1fr] md:items-center"><strong>{String(employee?.first_name||"")} {String(employee?.last_name||"")}</strong><span>{String(run?.run_number||"—")} · {String(row.adjustment_type)}</span><span>{money(Number(row.amount))}</span><Status value={String(row.status)}/>{actions||<span className="text-[#667085]">{String(row.reason||"")}</span>}</div>;
}
function AuditPanel({ rows }: { rows:Row[] }) { return <section className="card mt-5 overflow-hidden"><div className="p-4 font-semibold">Payroll audit</div>{rows.map(row=><div key={String(row.id)} className="grid grid-cols-[1fr_1fr_.6fr] gap-3 border-t p-3 text-xs"><strong>{String(row.action)}</strong><span>{String(row.entity_type)} · {String(row.entity_id)}</span><span>{String(row.occurred_at||"")}</span></div>)}</section>; }
function TableHead({ columns }: { columns:string[] }) { return <div className={`grid gap-3 bg-[#f7f9fc] p-3 text-[10px] font-semibold uppercase tracking-wide text-[#667085]`} style={{gridTemplateColumns:`repeat(${columns.length},minmax(0,1fr))`}}>{columns.map(value=><span key={value}>{value}</span>)}</div>; }
function Status({ value }: { value:string }) { return <span className="w-fit rounded-full bg-[#edf4ff] px-2 py-1 text-[10px] font-medium text-[#004ffe]">{value.replaceAll("_"," ")}</span>; }
function Select({ name,label,rows,optional=false }: {name:string;label:string;rows:Row[];optional?:boolean}) { return <label className="field">{label}<select name={name} required={!optional} className="input"><option value="">{optional?"None":`Select ${label.toLowerCase()}`}</option>{rows.map(row=><option key={String(row.id)} value={String(row.id)}>{String(row.code?`${row.code} · `:"")}{String(row.name)}</option>)}</select></label>; }
