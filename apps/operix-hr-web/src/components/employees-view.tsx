"use client";

import { FormEvent, useMemo, useState } from "react";
import { Edit3, Plus, UserRound, UserX, Users } from "lucide-react";
import { employeeSchema, employeeDisplayName, type HrEmployee } from "@invoice-monorepo/hr";
import { createClient } from "@/lib/supabase/client";
import { useHrSnapshot } from "@/lib/hr-hooks";
import { Card, Button, EmptyState, ErrorState, FormMessage, LoadingBlock, Modal, PageHeader, SearchInput, StatusBadge, Spinner } from "./ui";

type EmployeeForm = { first_name: string; last_name: string; email: string; phone: string; job_title: string; department: string; employee_number: string; hire_date: string; status: HrEmployee["status"] };
const initialForm: EmployeeForm = { first_name: "", last_name: "", email: "", phone: "", job_title: "", department: "", employee_number: "", hire_date: new Date().toISOString().slice(0, 10), status: "active" };

function formFromEmployee(employee?: HrEmployee | null): EmployeeForm { return employee ? { first_name: employee.first_name, last_name: employee.last_name, email: employee.email || "", phone: employee.phone || "", job_title: employee.job_title || "", department: employee.department || "", employee_number: employee.employee_number || "", hire_date: employee.hire_date || employee.employment_start_date || "", status: employee.status } : initialForm; }
function initials(employee: Pick<HrEmployee, "first_name" | "last_name">) { return `${employee.first_name.slice(0, 1)}${employee.last_name.slice(0, 1)}`.toUpperCase(); }

export function EmployeesView() {
  const query = useHrSnapshot();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<HrEmployee | null>(null);
  const [form, setForm] = useState<EmployeeForm>(initialForm);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const employees = useMemo(() => (query.data?.employees || []).filter((employee) => { const normalized = search.trim().toLowerCase(); const matchesSearch = !normalized || `${employee.first_name} ${employee.last_name} ${employee.email || ""} ${employee.job_title || ""} ${employee.department || ""} ${employee.employee_number || ""}`.toLowerCase().includes(normalized); return matchesSearch && (status === "all" || employee.status === status); }), [query.data?.employees, search, status]);

  function openForm(employee?: HrEmployee) { setEditing(employee || null); setForm(formFromEmployee(employee)); setFormError(""); setModalOpen(true); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setFormError("");
    const parsed = employeeSchema.safeParse(form);
    if (!parsed.success) { setFormError(parsed.error.issues[0]?.message || "Check the employee details."); return; }
    const client = createClient();
    const companyId = query.workspace?.companyId;
    if (!client || !companyId) { setFormError("The organization workspace is not available."); return; }
    setBusy(true);
    const payload = { ...parsed.data, company_id: companyId, hire_date: parsed.data.hire_date || null, email: parsed.data.email || null, phone: parsed.data.phone || null, job_title: parsed.data.job_title || null, department: parsed.data.department || null, employee_number: parsed.data.employee_number || null };
    const result = editing ? await client.from("employees").update(payload).eq("id", editing.id).eq("company_id", companyId).select("id").single() : await client.from("employees").insert(payload).select("id").single();
    if (result.error) setFormError(result.error.message); else { setModalOpen(false); await query.refresh(); }
    setBusy(false);
  }

  async function terminate(employee: HrEmployee) {
    if (employee.status === "terminated") return;
    if (!window.confirm(`Mark ${employeeDisplayName(employee)} as terminated? Historical HR records will be retained.`)) return;
    const client = createClient();
    if (!client || !query.workspace?.companyId) return;
    const result = await client.from("employees").update({ status: "terminated", employment_end_date: new Date().toISOString().slice(0, 10) }).eq("id", employee.id).eq("company_id", query.workspace.companyId);
    if (result.error) setFormError(result.error.message); else await query.refresh();
  }

  if (query.loading && !query.data) return <><PageHeader title="Employees" description="Loading the employee directory…" /><Card><LoadingBlock lines={10} /></Card></>;
  if (query.error && !query.data) return <><PageHeader title="Employees" description="Your organization directory." /><ErrorState message={query.error} onRetry={() => void query.refresh()} /></>;
  return <><PageHeader title="Employees" description={`${query.data?.employees.length || 0} people in your organization.`} action={<Button onClick={() => openForm()}><Plus size={16} />Add employee</Button>} /><div className="toolbar"><div className="toolbar-left"><SearchInput value={search} onChange={setSearch} placeholder="Search employees, role, department" /><select className="select-control" value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status"><option value="all">All statuses</option><option value="active">Active</option><option value="onboarding">Onboarding</option><option value="on_leave">On leave</option><option value="pending">Pending</option><option value="terminated">Terminated</option></select></div><div className="toolbar-right"><span className="muted-inline"><UserRound size={14} />{employees.length} shown</span></div></div><Card className="table-card"><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Employee</th><th>Role</th><th>Department</th><th>Start date</th><th>Status</th><th aria-label="Actions" /></tr></thead><tbody>{employees.map((employee) => <tr key={employee.id}><td><div className="employee-cell"><span className="employee-avatar">{initials(employee)}</span><div><strong>{employeeDisplayName(employee)}</strong><span>{employee.email || employee.employee_number || "No contact details"}</span></div></div></td><td>{employee.job_title || "—"}</td><td>{employee.department || "—"}</td><td>{employee.hire_date || employee.employment_start_date || "—"}</td><td><StatusBadge status={employee.status} /></td><td><div className="row-actions"><button type="button" className="table-action" onClick={() => openForm(employee)} aria-label={`Edit ${employeeDisplayName(employee)}`}><Edit3 size={15} /></button>{employee.status !== "terminated" ? <button type="button" className="table-action danger-action" onClick={() => void terminate(employee)} aria-label={`Terminate ${employeeDisplayName(employee)}`}><UserX size={15} /></button> : null}</div></td></tr>)}</tbody></table></div><div className="mobile-list">{employees.map((employee) => <article className="mobile-list-card" key={employee.id}><div className="employee-cell mobile-list-main"><span className="employee-avatar">{initials(employee)}</span><div><strong>{employeeDisplayName(employee)}</strong><p>{employee.job_title || employee.department || "Employee"}</p><p>{employee.email || "No email"}</p></div></div><div className="mobile-list-meta"><StatusBadge status={employee.status} /><button type="button" className="table-action" onClick={() => openForm(employee)}><Edit3 size={15} /></button></div></article>)}</div>{!employees.length ? <EmptyState icon={<UsersIcon />} title="No employees found" description={search || status !== "all" ? "Try changing the filters." : "Start building your team by adding the first employee."} action={!search && status === "all" ? <Button onClick={() => openForm()}><Plus size={15} />Add employee</Button> : undefined} /> : null}</Card><Modal open={modalOpen} title={editing ? "Edit employee" : "Add employee"} onClose={() => setModalOpen(false)} wide><form onSubmit={save}><div className="form-section"><h3>Identity</h3><div className="form-grid"><label className="form-field">First name <span><span className="required">*</span></span><input value={form.first_name} onChange={(event) => setForm({ ...form, first_name: event.target.value })} required /></label><label className="form-field">Last name <span><span className="required">*</span></span><input value={form.last_name} onChange={(event) => setForm({ ...form, last_name: event.target.value })} required /></label><label className="form-field">Work email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label className="form-field">Phone<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label></div></div><div className="form-section"><h3>Employment</h3><div className="form-grid"><label className="form-field">Job title<input value={form.job_title} onChange={(event) => setForm({ ...form, job_title: event.target.value })} /></label><label className="form-field">Department<input value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} /></label><label className="form-field">Employee ID<input value={form.employee_number} onChange={(event) => setForm({ ...form, employee_number: event.target.value })} /></label><label className="form-field">Start date<input type="date" value={form.hire_date} onChange={(event) => setForm({ ...form, hire_date: event.target.value })} /></label><label className="form-field">Status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as EmployeeForm["status"] })}><option value="active">Active</option><option value="onboarding">Onboarding</option><option value="on_leave">On leave</option><option value="pending">Pending</option><option value="terminated">Terminated</option></select></label></div></div>{formError ? <FormMessage message={formError} /> : null}<div className="form-actions"><Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? <Spinner /> : null}{editing ? "Save changes" : "Add employee"}</Button></div></form></Modal></>;
}

function UsersIcon() { return <Users size={19} />; }
