"use client";

import { useCallback, useEffect, useState } from "react";
import { Banknote, Download, FileText, Play, Plus, Trash2, Users } from "lucide-react";
import { renderPayslipHtml } from "@invoice-monorepo/payroll";
import { useWorkspace } from "@/hooks/use-workspace";
import { getLocalStore } from "@/lib/local/local-store";
import { listLocalResource, removeLocalResource, saveLocalResource } from "@/lib/local/resource";
import { buildRunItems, runTotals, type LocalEmployee, type RunItem } from "@/lib/local/payroll";
import { printHtmlInBrowser } from "@/lib/pdf-client";
import { money } from "@/lib/format";
import { PageHeader, SectionCard } from "@/components/ui";

type Run = {
  id: string; run_number: string; period: string; period_name: string; period_start: string; period_end: string; payment_date?: string;
  status: "draft" | "finalised" | "paid"; items: RunItem[]; totals: ReturnType<typeof runTotals>;
};
type EmployeeForm = { employee_number: string; first_name: string; last_name: string; position: string; department: string; salary_basis: "gross-monthly" | "net-monthly"; salary_amount: string; taxpayer_type: "primary" | "secondary"; pension_exempt: boolean };
const emptyEmployee: EmployeeForm = { employee_number: "", first_name: "", last_name: "", position: "", department: "", salary_basis: "gross-monthly", salary_amount: "", taxpayer_type: "primary", pension_exempt: false };

const lastDay = (period: string) => { const [year, month] = period.split("-").map(Number); return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10); };
const csv = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;

export function LocalPayrollView() {
  const workspace = useWorkspace();
  const [tab, setTab] = useState<"employees" | "runs">("runs");
  const [employees, setEmployees] = useState<LocalEmployee[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [form, setForm] = useState<EmployeeForm>(emptyEmployee);
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [openRun, setOpenRun] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const currency = workspace.company?.currency || "EUR";

  const load = useCallback(async () => {
    setEmployees((await listLocalResource("employees")) as unknown as LocalEmployee[]);
    setRuns(((await listLocalResource("payroll_runs")) as unknown as Run[]).sort((a, b) => b.period.localeCompare(a.period)));
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  async function saveEmployee() {
    if (!form.first_name.trim() || !form.last_name.trim() || !(Number(form.salary_amount) > 0)) { setMessage("First name, last name and a salary above zero are required."); return; }
    await saveLocalResource("employees", { ...form, salary_amount: Number(form.salary_amount), active: true }, editing || undefined);
    setForm(emptyEmployee); setEditing(null); setShowForm(false); setMessage("Employee saved."); await load();
  }
  async function toggleEmployee(employee: LocalEmployee) { await saveLocalResource("employees", { active: employee.active === false }, employee.id); await load(); }

  async function calculate() {
    setMessage("");
    const existing = runs.find((run) => run.period === period);
    if (existing && existing.status !== "draft") { setMessage(`The ${period} payroll is already ${existing.status}. It cannot be recalculated.`); return; }
    const items = buildRunItems(employees);
    if (!items.length) { setMessage("Add at least one active employee first."); return; }
    const store = await getLocalStore();
    const failed = items.find((item) => item.result.errors.length);
    if (failed) { setMessage(`${failed.name}: ${failed.result.errors[0]}`); return; }
    await saveLocalResource("payroll_runs", {
      run_number: existing?.run_number ?? `PR-${store.deviceCode}-${period}`, period, period_name: period, period_start: `${period}-01`, period_end: lastDay(period),
      status: "draft", items, totals: runTotals(items),
    }, existing?.id);
    setMessage(`Payroll for ${period} calculated for ${items.length} employee${items.length === 1 ? "" : "s"}. Review it, then finalise.`);
    await load();
  }
  async function setStatus(run: Run, status: Run["status"]) {
    if (status === "finalised" && !window.confirm(`Finalise ${run.period}? Finalised payroll is posted to the ledger and cannot be recalculated.`)) return;
    const paymentDate = status === "paid" ? window.prompt("Payment date (YYYY-MM-DD)", new Date().toISOString().slice(0, 10)) : undefined;
    if (status === "paid" && (!paymentDate || !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate))) return;
    await saveLocalResource("payroll_runs", { status, ...(paymentDate ? { payment_date: paymentDate } : {}) }, run.id);
    await load();
  }
  async function removeRun(run: Run) { if (run.status === "draft" && window.confirm(`Delete the draft ${run.period} payroll?`)) { await removeLocalResource("payroll_runs", run.id); await load(); } }

  function payslip(run: Run, item: RunItem) {
    const company = workspace.company;
    const [first, ...rest] = item.name.split(" ");
    printHtmlInBrowser(renderPayslipHtml({
      runNumber: run.run_number, period: { name: run.period_name, startsOn: run.period_start, endsOn: run.period_end, paymentDate: run.payment_date ?? run.period_end },
      company: { legalName: company?.company_name || company?.name, fiscalNumber: company?.fiscal_number || company?.tax_id, address: company?.address, municipality: company?.municipality, country: company?.country, email: company?.email, phone: company?.phone },
      employee: { employeeNumber: item.employeeNumber, firstName: first, lastName: rest.join(" "), position: item.position, department: item.department },
      currency, grossPay: item.result.grossPay, employeePension: item.result.employeePension, employerPension: item.result.employerPension, personalIncomeTax: item.result.personalIncomeTax,
      otherDeductions: item.result.otherDeductions, netSalary: item.result.netSalary, employerCost: item.result.employerCost, lines: item.result.lines,
    }, { language: workspace.company?.default_language === "en" ? "en" : "sq" }));
  }
  function exportRun(run: Run) {
    const rows = [["Employee", "Gross", "Employee pension", "Employer pension", "Income tax", "Net", "Employer cost"], ...run.items.map((item) => [item.name, item.result.grossPay, item.result.employeePension, item.result.employerPension, item.result.personalIncomeTax, item.result.netSalary, item.result.employerCost])];
    const url = URL.createObjectURL(new Blob([`﻿${rows.map((row) => row.map(csv).join(",")).join("\n")}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `payroll-${run.period}.csv`; link.click(); URL.revokeObjectURL(url);
  }

  const selected = runs.find((run) => run.id === openRun) || null;
  return <div className="ux-page">
    <PageHeader title="Payroll" description="Employees, monthly payroll and payslips stored in this browser. Rules are a starting point: check them with your accountant." />
    <div className="card mt-5 flex gap-1 p-1.5">
      <button className={`btn ${tab === "runs" ? "btn-primary" : ""}`} onClick={() => setTab("runs")}><Play size={15} />Payroll runs</button>
      <button className={`btn ${tab === "employees" ? "btn-primary" : ""}`} onClick={() => setTab("employees")}><Users size={15} />Employees</button>
    </div>
    {message ? <p className="mt-4 rounded-md bg-[#eef4ff] p-3 text-xs text-[#1d3a8a]">{message}</p> : null}
    {tab === "employees" ? <SectionCard title="Employees" description="Salary is gross or net per month. Net salaries are grossed up with the same rules.">
      <div className="mb-3 flex justify-end"><button type="button" className="btn btn-primary" onClick={() => { setForm(emptyEmployee); setEditing(null); setShowForm(true); }}><Plus size={15} /> Add employee</button></div>
      {showForm ? <div className="settings-subcard mb-4 grid gap-4 sm:grid-cols-2">
        {([["first_name", "First name"], ["last_name", "Last name"], ["employee_number", "Employee number"], ["position", "Position"], ["department", "Department"]] as const).map(([key, label]) => <label className="field" key={key}><span>{label}</span><input className="input" value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></label>)}
        <label className="field"><span>Salary basis</span><select className="select" value={form.salary_basis} onChange={(event) => setForm({ ...form, salary_basis: event.target.value as EmployeeForm["salary_basis"] })}><option value="gross-monthly">Gross per month</option><option value="net-monthly">Net per month</option></select></label>
        <label className="field"><span>Monthly salary ({currency})</span><input className="input" type="number" min="0" step="0.01" value={form.salary_amount} onChange={(event) => setForm({ ...form, salary_amount: event.target.value })} /></label>
        <label className="field"><span>Employment</span><select className="select" value={form.taxpayer_type} onChange={(event) => setForm({ ...form, taxpayer_type: event.target.value as EmployeeForm["taxpayer_type"] })}><option value="primary">Primary employer</option><option value="secondary">Secondary employer (flat 10% tax)</option></select></label>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.pension_exempt} onChange={(event) => setForm({ ...form, pension_exempt: event.target.checked })} /> Exempt from pension contributions</label>
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className="btn" onClick={() => setShowForm(false)}>Cancel</button><button type="button" className="btn btn-primary" onClick={() => void saveEmployee()}>{editing ? "Save employee" : "Add employee"}</button></div>
      </div> : null}
      <div className="table-wrap"><table className="data-table"><thead><tr><th>Name</th><th>Position</th><th>Basis</th><th>Salary</th><th>Status</th><th /></tr></thead><tbody>
        {employees.length ? employees.map((employee) => <tr key={employee.id}><td>{employee.first_name} {employee.last_name}</td><td>{employee.position || "—"}</td><td>{employee.salary_basis === "net-monthly" ? "Net" : "Gross"}</td><td>{money(Number(employee.salary_amount || 0), currency)}</td><td>{employee.active === false ? "Inactive" : "Active"}</td>
          <td className="text-right"><button type="button" className="btn" onClick={() => { setForm({ employee_number: employee.employee_number ?? "", first_name: employee.first_name ?? "", last_name: employee.last_name ?? "", position: employee.position ?? "", department: employee.department ?? "", salary_basis: employee.salary_basis === "net-monthly" ? "net-monthly" : "gross-monthly", salary_amount: String(employee.salary_amount ?? ""), taxpayer_type: employee.taxpayer_type ?? "primary", pension_exempt: Boolean(employee.pension_exempt) }); setEditing(employee.id); setShowForm(true); }}>Edit</button> <button type="button" className="btn" onClick={() => void toggleEmployee(employee)}>{employee.active === false ? "Activate" : "Deactivate"}</button></td></tr>) : <tr><td colSpan={6}>No employees yet.</td></tr>}
      </tbody></table></div>
    </SectionCard> : <>
      <SectionCard title="Calculate payroll" description="One run per month. A draft can be recalculated; a finalised run is posted to the ledger.">
        <div className="flex flex-wrap items-end gap-3"><label className="field"><span>Month</span><input className="input" type="month" value={period} onChange={(event) => setPeriod(event.target.value)} /></label><button type="button" className="btn btn-primary" onClick={() => void calculate()}><Banknote size={15} /> Calculate</button></div>
      </SectionCard>
      <SectionCard title="Payroll runs" description="Open a run to see each employee and print payslips.">
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Period</th><th>Employees</th><th>Gross</th><th>Net</th><th>Employer cost</th><th>Status</th><th /></tr></thead><tbody>
          {runs.length ? runs.map((run) => <tr key={run.id}><td>{run.period}</td><td>{run.items.length}</td><td>{money(run.totals.gross, currency)}</td><td>{money(run.totals.net, currency)}</td><td>{money(run.totals.employerCost, currency)}</td><td>{run.status}</td>
            <td className="text-right"><button type="button" className="btn" onClick={() => setOpenRun(openRun === run.id ? null : run.id)}>{openRun === run.id ? "Close" : "Open"}</button> {run.status === "draft" ? <button type="button" className="btn" onClick={() => void setStatus(run, "finalised")}>Finalise</button> : null}{run.status === "finalised" ? <button type="button" className="btn" onClick={() => void setStatus(run, "paid")}>Mark paid</button> : null}{run.status === "draft" ? <button type="button" className="btn" aria-label="Delete draft" onClick={() => void removeRun(run)}><Trash2 size={14} /></button> : null}</td></tr>) : <tr><td colSpan={7}>No payroll runs yet.</td></tr>}
        </tbody></table></div>
      </SectionCard>
      {selected ? <SectionCard title={`Payroll ${selected.period}`} description={`${selected.run_number} · ${selected.status}${selected.payment_date ? ` · paid ${selected.payment_date}` : ""}`}>
        <div className="mb-3 flex justify-end"><button type="button" className="btn" onClick={() => exportRun(selected)}><Download size={15} /> Export CSV</button></div>
        <div className="table-wrap"><table className="data-table"><thead><tr><th>Employee</th><th>Gross</th><th>Pension (employee)</th><th>Income tax</th><th>Net</th><th>Employer cost</th><th /></tr></thead><tbody>
          {selected.items.map((item) => <tr key={item.employeeId}><td>{item.name}</td><td>{money(Number(item.result.grossPay), currency)}</td><td>{money(Number(item.result.employeePension), currency)}</td><td>{money(Number(item.result.personalIncomeTax), currency)}</td><td>{money(Number(item.result.netSalary), currency)}</td><td>{money(Number(item.result.employerCost), currency)}</td><td className="text-right"><button type="button" className="btn" onClick={() => payslip(selected, item)}><FileText size={14} /> Payslip</button></td></tr>)}
        </tbody><tfoot><tr><th>Total</th><th>{money(selected.totals.gross, currency)}</th><th>{money(selected.totals.employeePension, currency)}</th><th>{money(selected.totals.tax, currency)}</th><th>{money(selected.totals.net, currency)}</th><th>{money(selected.totals.employerCost, currency)}</th><th /></tr></tfoot></table></div>
      </SectionCard> : null}
    </>}
  </div>;
}
