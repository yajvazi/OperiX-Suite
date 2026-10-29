"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, CreditCard, Mail, Pencil, Plus, RefreshCw, ShieldCheck, UserMinus, UserPlus, UserX } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";

type RoleCode = "company_administrator" | "manager" | "employee";
type Scope = "OWN" | "ASSIGNED" | "ALL";
type Permission = { code: string; name: string; category: string; description?: string | null; is_sensitive: boolean };
type MemberAccess = { role_code?: string | null; permissions?: string[]; scopes?: Record<string, Scope> };
type UserAccessMember = {
  membership_id: string | null;
  user_id: string | null;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  status?: "active" | "invited" | "suspended" | "pending_payment" | string | null;
  role_code?: string | null;
  role_name?: string | null;
  data_scopes?: Record<string, Scope> | null;
  last_active_at?: string | null;
  date_added?: string | null;
  billing_status?: string | null;
  is_company_owner?: boolean;
  operation_id?: string | null;
  access?: MemberAccess | null;
};
type BillingSummary = {
  status: string;
  billing_interval?: "monthly" | "annual" | string | null;
  total_users: number;
  included_users: number;
  billable_users: number;
  trial_days_remaining?: number;
  trial_ends_at?: string | null;
  base_monthly: string;
  additional_user_monthly: string;
  estimated_monthly_total: string;
  base_annual: string;
  additional_user_annual: string;
  estimated_annual_total: string;
  billing_management_allowed?: boolean;
};
type UsersAccessResponse = { members: UserAccessMember[]; permissions: Permission[]; billing: BillingSummary };
type StripePreview = { authoritative: boolean; amountDueCents: number; currency: string; invoiceId: string | null; projectedBillableUsers: number; trial: boolean };
type EditorState = {
  membershipId: string | null;
  operationKey: string;
  firstName: string;
  lastName: string;
  email: string;
  role: RoleCode;
  permissions: Record<string, boolean>;
  scopes: Record<string, Scope>;
};
type PreviewState = { operationId: string; billing: BillingSummary; stripePreview: StripePreview };

const categoryLabels: Record<string, string> = {
  invoices: "Invoices",
  documents: "Documents",
  payments: "Payments",
  expenses: "Expenses",
  customers: "Customers",
  products: "Products",
  inventory: "Products & inventory",
  reports: "Reports",
  accounting: "Accounting",
  users: "Users",
  security: "Security",
  settings: "Settings",
};

const scopeResources: Array<{ resource: string; label: string }> = [
  { resource: "invoice", label: "Invoices" },
  { resource: "offer", label: "Offers" },
  { resource: "proforma", label: "Pro-formas" },
  { resource: "order", label: "Orders" },
  { resource: "delivery_note", label: "Delivery notes" },
  { resource: "customer", label: "Customers" },
  { resource: "expense", label: "Expenses" },
  { resource: "payment", label: "Payments" },
  { resource: "product", label: "Products" },
  { resource: "inventory", label: "Inventory" },
];

const sensitiveCodes = new Set([
  "payment.refund",
  "invoice.void",
  "invoice.credit",
  "invoice.debit",
  "financial.export",
  "reports.profit",
  "inventory.adjust",
  "accounting_period.close",
  "accounting_period.reopen",
]);

const defaultManagerPermissions = new Set([
  "invoice.view", "invoice.view_all", "invoice.create", "invoice.edit", "invoice.issue",
  "offer.create", "offer.manage", "proforma.create", "proforma.manage", "order.create", "order.manage",
  "delivery_note.create", "delivery_note.manage", "payment.view", "payment.create", "expense.view_own",
  "expense.view_all", "expense.create", "expense.approve", "customer.view", "customer.view_all",
  "customer.create", "customer.edit", "product.view", "product.create", "product.edit", "inventory.view",
  "reports.sales", "reports.operational", "reports.tax", "sales_book.view", "accounting_period.view", "audit.view",
]);

const defaultEmployeePermissions = new Set([
  "invoice.view", "invoice.create", "invoice.edit", "offer.create", "proforma.create", "order.create",
  "delivery_note.create", "customer.view", "customer.create", "product.view", "inventory.view", "expense.view_own", "expense.create",
]);

function normalizeRole(value?: string | null): RoleCode {
  if (value === "company_administrator" || value === "admin") return "company_administrator";
  if (value === "manager") return "manager";
  return "employee";
}

function roleLabel(role: RoleCode | string | null | undefined) {
  return normalizeRole(role) === "company_administrator" ? "Admin" : normalizeRole(role) === "manager" ? "Manager" : "Employee";
}

function memberName(member: UserAccessMember) {
  return [member.first_name, member.last_name].filter(Boolean).join(" ") || member.email || "Company user";
}

function initials(member: UserAccessMember) {
  return memberName(member).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U";
}

function date(value?: string | null) {
  return value ? new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";
}

function amount(value: string | number, currency = "EUR") {
  const numeric = typeof value === "number" ? value : Number(value);
  return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 2 }).format(Number.isFinite(numeric) ? numeric : 0);
}

function statusLabel(value?: string | null) {
  return String(value || "active").replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function statusClass(value?: string | null) {
  const normalized = String(value || "active");
  if (normalized === "suspended") return "status status-draft";
  if (normalized === "pending_payment") return "status status-overdue";
  if (normalized === "invited") return "status status-draft";
  return "status status-paid";
}

function emptyScopes(defaultScope: Scope = "OWN") {
  return Object.fromEntries(scopeResources.map(({ resource }) => [resource, defaultScope])) as Record<string, Scope>;
}

function defaultScopesForRole(role: RoleCode) {
  if (role === "company_administrator" || role === "manager") return emptyScopes("ALL");
  return {
    ...emptyScopes("OWN"),
    customer: "ASSIGNED" as Scope,
    product: "ALL" as Scope,
    inventory: "ALL" as Scope,
  };
}

function permissionsForRole(catalog: Permission[], role: RoleCode, existing?: string[]) {
  const existingSet = new Set(existing || []);
  const defaults = role === "manager" ? defaultManagerPermissions : defaultEmployeePermissions;
  return Object.fromEntries(catalog.map((permission) => [permission.code, existing ? existingSet.has(permission.code) : defaults.has(permission.code)]));
}

function scopesForMember(member: UserAccessMember | null, role: RoleCode) {
  if (member) return Object.fromEntries(scopeResources.map(({ resource }) => [resource, member.access?.scopes?.[resource] || member.data_scopes?.[resource] || defaultScopesForRole(role)[resource]])) as Record<string, Scope>;
  return defaultScopesForRole(role);
}

export function UsersAccessPanel() {
  const workspace = useWorkspace();
  const [data, setData] = useState<UsersAccessResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);

  const canManage = workspace.can("users.manage") && Boolean(workspace.companyId);

  const load = useCallback(async () => {
    if (!workspace.companyId || !canManage) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/users-access?companyId=${encodeURIComponent(workspace.companyId)}`, { cache: "no-store" });
      const body = await response.json() as UsersAccessResponse & { error?: string };
      if (!response.ok) throw new Error(body.error || "Users & Access could not be loaded.");
      setData(body);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Users & Access could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [canManage, workspace.companyId]);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const groupedPermissions = useMemo(() => {
    const groups = new Map<string, Permission[]>();
    for (const permission of data?.permissions || []) groups.set(permission.category, [...(groups.get(permission.category) || []), permission]);
    return [...groups.entries()];
  }, [data?.permissions]);

  function startAdd() {
    if (!data) return;
    setPreview(null);
    setEditor({ membershipId: null, operationKey: `${crypto.randomUUID()}-invite`, firstName: "", lastName: "", email: "", role: "employee", permissions: permissionsForRole(data.permissions, "employee"), scopes: defaultScopesForRole("employee") });
  }

  function startEdit(member: UserAccessMember) {
    if (!data || !member.membership_id || member.is_company_owner || member.status === "invited" || member.status === "pending_payment") return;
    const role = normalizeRole(member.role_code);
    setPreview(null);
    setEditor({ membershipId: member.membership_id, operationKey: "", firstName: member.first_name || "", lastName: member.last_name || "", email: member.email || "", role, permissions: permissionsForRole(data.permissions, role, member.access?.permissions), scopes: scopesForMember(member, role) });
  }

  function changeEditorRole(role: RoleCode) {
    if (!editor || !data) return;
    setEditor({ ...editor, role, permissions: permissionsForRole(data.permissions, role), scopes: scopesForMember(null, role) });
  }

  function payloadForEditor(current: EditorState) {
    return {
      permissions: Object.fromEntries((data?.permissions || []).map((permission) => [permission.code, current.role === "company_administrator" || Boolean(current.permissions[permission.code])])),
      scopes: current.role === "company_administrator" ? emptyScopes("ALL") : current.scopes,
    };
  }

  async function previewInvite() {
    if (!editor || editor.membershipId || !workspace.companyId || !editor.email.trim()) return;
    if (!editor.firstName.trim() || !editor.lastName.trim()) { setMessage("Enter the user's first and last name."); return; }
    setBusy("preview");
    setMessage("");
    try {
      const payload = payloadForEditor(editor);
      const response = await fetch("/api/users-access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "preview_invite", companyId: workspace.companyId, operationKey: editor.operationKey, email: editor.email.trim(), firstName: editor.firstName.trim(), lastName: editor.lastName.trim(), roleCode: editor.role, ...payload }) });
      const body = await response.json() as { operation?: { operation_id?: string }; billing?: BillingSummary; stripePreview?: StripePreview; error?: string };
      if (!response.ok || !body.operation?.operation_id || !body.billing || !body.stripePreview) throw new Error(body.error || "The billing preview could not be prepared.");
      setPreview({ operationId: body.operation.operation_id, billing: body.billing, stripePreview: body.stripePreview });
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "The billing preview could not be prepared."); }
    finally { setBusy(null); }
  }

  async function confirmInvite() {
    if (!editor || editor.membershipId || !workspace.companyId || !preview) return;
    if (sensitiveEnabled(editor.permissions)) {
      const confirmed = window.confirm("This user is receiving sensitive access. The permission grant will be audited and may expose refunds, legally relevant documents, or financial exports. Continue?");
      if (!confirmed) return;
    }
    setBusy("invite");
    setMessage("");
    try {
      const payload = payloadForEditor(editor);
      const response = await fetch("/api/users-access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "invite", companyId: workspace.companyId, operationKey: editor.operationKey, email: editor.email.trim(), firstName: editor.firstName.trim(), lastName: editor.lastName.trim(), roleCode: editor.role, ...payload }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "The user could not be invited.");
      setEditor(null); setPreview(null); setMessage("User seat billed and invitation created. The invitation link expires securely according to the Auth configuration.");
      await load();
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "The user could not be invited."); }
    finally { setBusy(null); }
  }

  async function saveEdit() {
    if (!editor?.membershipId || !workspace.companyId) return;
    if (sensitiveEnabled(editor.permissions) && !window.confirm("This change grants sensitive access. Continue?")) return;
    setBusy("edit"); setMessage("");
    try {
      const payload = payloadForEditor(editor);
      const response = await fetch("/api/users-access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "update", companyId: workspace.companyId, membershipId: editor.membershipId, roleCode: editor.role, firstName: editor.firstName.trim(), lastName: editor.lastName.trim(), ...payload }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "The user access could not be updated.");
      setEditor(null); setMessage("User access updated and recorded in the audit log."); await load(); await workspace.refresh();
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "The user access could not be updated."); }
    finally { setBusy(null); }
  }

  async function callMemberAction(action: "suspend" | "reactivate" | "remove" | "resend", member: UserAccessMember) {
    if (!workspace.companyId) return;
    if (action === "remove" && !window.confirm(`Remove ${memberName(member)} from this company? Their access will be revoked and the billable seat will be removed, but historical invoices and audit records will remain.`)) return;
    setBusy(`${action}-${member.membership_id || member.operation_id}`); setMessage("");
    try {
      const body: Record<string, unknown> = { action, companyId: workspace.companyId, membershipId: member.membership_id, operationId: member.operation_id, email: member.email, operationKey: `${crypto.randomUUID()}-${action}`, roleCode: normalizeRole(member.role_code) };
      const response = await fetch("/api/users-access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || `The user could not be ${action}.`);
      setMessage(action === "remove" ? "User removed. Historical business records were preserved." : action === "resend" ? "Invitation resent or the pending billing operation was retried safely." : `User ${action === "suspend" ? "suspended" : "reactivated"}.`);
      await load();
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "The user action could not be completed."); }
    finally { setBusy(null); }
  }

  if (!canManage) return <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">Only a tenant Admin with Users &amp; Access permission can manage company users. Managers and Employees cannot reach this workflow.</div>;
  if (loading && !data) return <div className="mt-6 grid gap-3"><div className="skeleton h-28 rounded-xl" /><div className="skeleton h-64 rounded-xl" /></div>;
  if (!data || !data.billing) return <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-800"><strong>Users &amp; Access unavailable</strong><p className="mt-1">{message || "Try again."}</p><button type="button" className="btn mt-4" onClick={() => void load()}><RefreshCw size={15} /> Try again</button></div>;

  const billing = data.billing;
  const annual = billing.billing_interval === "annual";
  const sensitiveSelected = editor ? sensitiveEnabled(editor.permissions) : false;

  return <div className="mt-6 grid gap-5">
    <section className="rounded-xl border border-[#dbe5f5] bg-[#f8fbff] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="muted text-[11px] uppercase tracking-[0.12em]">Company team</p><h3 className="mt-1 text-xl font-semibold">{billing.total_users} users</h3><p className="muted mt-1 text-xs">{billing.included_users} included · {billing.billable_users} additional paid user{billing.billable_users === 1 ? "" : "s"}</p></div><div className="flex flex-wrap gap-2"><Link href="/settings?tab=billing" className="btn"><CreditCard size={15} /> Manage Subscription</Link><button type="button" className="btn btn-primary" onClick={startAdd}><Plus size={16} /> Add User</button></div></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3"><SummaryMetric label="Additional user cost" value={`${billing.billable_users} × ${amount(annual ? billing.additional_user_annual : billing.additional_user_monthly)}`} detail={annual ? "per year" : "per month"} /><SummaryMetric label={annual ? "Estimated annual total" : "Estimated monthly total"} value={amount(annual ? billing.estimated_annual_total : billing.estimated_monthly_total)} detail={billing.status === "trialing" ? "once a plan is active" : "current subscription estimate"} /><SummaryMetric label="Subscription status" value={statusLabel(billing.status)} detail={billing.status === "trialing" ? "no paid plan yet" : "authoritative account state"} /></div>
      {billing.status === "trialing" ? <p className="mt-4 rounded-lg border border-[#b9d2ff] bg-white p-3 text-xs text-[#174ea6]">No paid plan yet. Additional users are tracked now and charged at {amount(annual ? billing.additional_user_annual : billing.additional_user_monthly)} once a plan is active, according to the selected billing interval.</p> : null}
    </section>

    {message ? <p className="rounded-lg bg-[#f8fbff] p-3 text-xs" role="status">{message}</p> : null}
    <section className="overflow-hidden rounded-xl border border-[#dbe5f5]">
      <div className="flex items-center justify-between border-b border-[#e6ebf3] p-4"><div><h3 className="text-sm font-semibold">Users</h3><p className="muted mt-1 text-xs">Suspended users retain their seat. Removed users lose access and no longer count toward billing.</p></div><button type="button" className="icon-btn" onClick={() => void load()} aria-label="Refresh users"><RefreshCw size={16} /></button></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead><tr className="border-b border-[#e6ebf3] text-[11px] text-[#61708a]"><th className="px-4 py-3 font-medium">User</th><th className="px-4 py-3 font-medium">Role</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Data scope</th><th className="px-4 py-3 font-medium">Last active</th><th className="px-4 py-3 font-medium">Billing</th><th className="px-4 py-3 text-right font-medium">Actions</th></tr></thead><tbody>{data.members.map((member) => <UserRow key={`${member.membership_id || "pending"}-${member.operation_id || member.email}`} member={member} busy={busy} onEdit={startEdit} onAction={callMemberAction} />)}</tbody></table></div>
      {!data.members.length ? <p className="muted p-8 text-center text-xs">No company users were found.</p> : null}
    </section>

    {editor ? <EditorModal editor={editor} setEditor={setEditor} groupedPermissions={groupedPermissions} preview={preview} sensitiveSelected={sensitiveSelected} busy={busy} onRoleChange={changeEditorRole} onPreview={() => void previewInvite()} onConfirmInvite={() => void confirmInvite()} onSave={() => void saveEdit()} onClose={() => { setEditor(null); setPreview(null); }} /> : null}
  </div>;
}

function UserRow({ member, busy, onEdit, onAction }: { member: UserAccessMember; busy: string | null; onEdit: (member: UserAccessMember) => void; onAction: (action: "suspend" | "reactivate" | "remove" | "resend", member: UserAccessMember) => void }) {
  const actionKey = (action: string) => `${action}-${member.membership_id || member.operation_id}`;
  const isPending = member.status === "invited" || member.status === "pending_payment";
  const paymentPending = member.billing_status === "pending_payment";
  const scopes = Object.entries(member.data_scopes || member.access?.scopes || {}).filter(([, value]) => value && value !== "OWN").slice(0, 2).map(([key, value]) => `${key}: ${value}`).join(" · ") || "Own";
  return <tr className="border-b border-[#eef2f7] last:border-0"><td className="px-4 py-3"><div className="flex items-center gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e7eefb] text-[11px] font-semibold text-[#174ea6]">{initials(member)}</span><span className="min-w-0"><strong className="block truncate">{memberName(member)}</strong><small className="muted block truncate">{member.email || "Invitation pending"}</small></span></div></td><td className="px-4 py-3"><span className="font-medium">{roleLabel(member.role_code)}</span>{member.is_company_owner ? <small className="muted mt-0.5 block">Company owner</small> : null}</td><td className="px-4 py-3"><span className={statusClass(member.status)}>{statusLabel(member.status)}</span></td><td className="px-4 py-3 text-[11px] text-[#61708a]">{scopes}</td><td className="px-4 py-3 text-[#61708a]">{date(member.last_active_at)}</td><td className="px-4 py-3 text-[#61708a]">{statusLabel(member.billing_status || "active")}</td><td className="px-4 py-3"><div className="flex justify-end gap-1.5">{member.is_company_owner ? <span className="inline-flex items-center gap-1 text-[11px] text-[#61708a]"><ShieldCheck size={14} /> Protected</span> : isPending ? <><button type="button" className="btn h-8 px-2.5 text-[11px]" disabled={!member.operation_id || busy === actionKey("resend")} onClick={() => onAction("resend", member)}><Mail size={13} /> {paymentPending ? "Retry" : "Resend"}</button><button type="button" className="btn btn-danger h-8 px-2.5 text-[11px]" disabled={busy === actionKey("remove")} onClick={() => onAction("remove", member)}><UserMinus size={13} /> Remove</button></> : <><button type="button" className="icon-btn" aria-label={`Edit ${memberName(member)}`} onClick={() => onEdit(member)}><Pencil size={15} /></button>{member.status === "suspended" ? <button type="button" className="btn h-8 px-2.5 text-[11px]" disabled={busy === actionKey("reactivate")} onClick={() => onAction("reactivate", member)}><UserPlus size={13} /> Reactivate</button> : <button type="button" className="btn h-8 px-2.5 text-[11px]" disabled={busy === actionKey("suspend")} onClick={() => onAction("suspend", member)}><UserX size={13} /> Suspend</button>}<button type="button" className="btn btn-danger h-8 px-2.5 text-[11px]" disabled={busy === actionKey("remove")} onClick={() => onAction("remove", member)}><UserMinus size={13} /> Remove</button></>}</div></td></tr>;
}

function EditorModal({ editor, setEditor, groupedPermissions, preview, sensitiveSelected, busy, onRoleChange, onPreview, onConfirmInvite, onSave, onClose }: { editor: EditorState; setEditor: (next: EditorState) => void; groupedPermissions: Array<[string, Permission[]]>; preview: PreviewState | null; sensitiveSelected: boolean; busy: string | null; onRoleChange: (role: RoleCode) => void; onPreview: () => void; onConfirmInvite: () => void; onSave: () => void; onClose: () => void }) {
  const isNew = !editor.membershipId;
  function toggle(code: string) { setEditor({ ...editor, permissions: { ...editor.permissions, [code]: !editor.permissions[code] } }); }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={isNew ? "Add user" : "Edit user"}><div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-5 shadow-2xl sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="muted text-[11px] uppercase tracking-[0.12em]">Users &amp; Access</p><h2 className="mt-1 text-lg font-semibold">{isNew ? "Add User" : "Edit User"}</h2><p className="muted mt-1 text-xs">Role, permissions, and data scopes are checked again by the server before they are applied.</p></div><button type="button" className="icon-btn" onClick={onClose} aria-label="Close">×</button></div>
    <div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="field"><span>First name</span><input className="input" value={editor.firstName} disabled={Boolean(preview) || Boolean(busy)} onChange={(event) => setEditor({ ...editor, firstName: event.target.value })} /></label><label className="field"><span>Last name</span><input className="input" value={editor.lastName} disabled={Boolean(preview) || Boolean(busy)} onChange={(event) => setEditor({ ...editor, lastName: event.target.value })} /></label><label className="field sm:col-span-2"><span>Email</span><input className="input" type="email" value={editor.email} disabled={!isNew || Boolean(preview) || Boolean(busy)} onChange={(event) => setEditor({ ...editor, email: event.target.value })} placeholder="name@company.com" /></label><label className="field"><span>Role</span><select className="select" value={editor.role} disabled={Boolean(preview) || Boolean(busy)} onChange={(event) => onRoleChange(event.target.value as RoleCode)}><option value="company_administrator">Admin</option><option value="manager">Manager</option><option value="employee">Employee</option></select></label></div>
    {!preview && editor.role !== "company_administrator" ? <><div className="mt-6 rounded-lg border border-[#dbe5f5] p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">Permissions</h3><p className="muted mt-1 text-xs">Defaults are loaded for the selected role. Optional permissions are individually configurable.</p></div><span className="muted text-[11px]">{Object.values(editor.permissions).filter(Boolean).length} enabled</span></div><div className="mt-4 grid gap-4 md:grid-cols-2">{groupedPermissions.map(([category, permissions]) => <fieldset key={category} className="rounded-md border border-[#e6ebf3] p-3"><legend className="px-1 text-xs font-semibold">{categoryLabels[category] || category}</legend><div className="grid gap-1">{permissions.map((permission) => <label key={permission.code} className="flex items-start gap-2 rounded p-1.5 text-xs hover:bg-[#f7f9fc]"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={Boolean(editor.permissions[permission.code])} disabled={Boolean(busy)} onChange={() => toggle(permission.code)} /><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-1"><strong>{permission.name}</strong>{permission.is_sensitive ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-900">Sensitive</span> : null}</span>{permission.description ? <small className="muted mt-0.5 block">{permission.description}</small> : null}</span></label>)}</div></fieldset>)}</div></div><ScopeEditor scopes={editor.scopes} disabled={Boolean(busy)} onChange={(scopes) => setEditor({ ...editor, scopes })}/>{sensitiveSelected ? <SensitiveWarning /> : null}</> : <div className="mt-6 rounded-lg border border-[#b9d2ff] bg-[#f8fbff] p-4 text-xs text-[#174ea6]"><strong>Admin access</strong><p className="mt-1">Admins receive all tenant permissions and all tenant data scopes. Platform Super Admin is separate and is never assignable from this page.</p></div>}
    {preview ? <BillingPreview preview={preview} role={editor.role} name={[editor.firstName, editor.lastName].filter(Boolean).join(" ")} /> : null}
    <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-[#e6ebf3] pt-5"><button type="button" className="btn" onClick={onClose}>Cancel</button>{isNew ? preview ? <button type="button" className="btn btn-primary" disabled={busy === "invite"} onClick={onConfirmInvite}>{busy === "invite" ? "Creating…" : "Confirm & Add User"}<UserPlus size={15} /></button> : <button type="button" className="btn btn-primary" disabled={busy === "preview"} onClick={onPreview}>{busy === "preview" ? "Preparing preview…" : "Review billing"}<CreditCard size={15} /></button> : <button type="button" className="btn btn-primary" disabled={busy === "edit"} onClick={onSave}>{busy === "edit" ? "Saving…" : "Save access"}<Check size={15} /></button>}</div>
  </div></div>;
}

function ScopeEditor({ scopes, disabled, onChange }: { scopes: Record<string, Scope>; disabled: boolean; onChange: (scopes: Record<string, Scope>) => void }) {
  return <div className="mt-6 rounded-lg border border-[#dbe5f5] p-4"><h3 className="text-sm font-semibold">Data scopes</h3><p className="muted mt-1 text-xs">Own shows records created by the user. Assigned shows records assigned to the user. All shows company records allowed by their permissions.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{scopeResources.map(({ resource, label }) => <label className="field" key={resource}><span>{label}</span><select className="select" value={scopes[resource] || "OWN"} disabled={disabled} onChange={(event) => onChange({ ...scopes, [resource]: event.target.value as Scope })}><option value="OWN">Own</option><option value="ASSIGNED">Assigned</option><option value="ALL">All</option></select></label>)}</div></div>;
}

function BillingPreview({ preview, role, name }: { preview: PreviewState; role: RoleCode; name: string }) {
  const billing = preview.billing;
  const annual = billing.billing_interval === "annual";
  const stripe = preview.stripePreview;
  return <section className="mt-6 rounded-lg border border-[#b9d2ff] bg-[#f8fbff] p-4"><div className="flex items-start gap-3"><CreditCard size={18} className="mt-0.5 text-[#004ffe]" /><div className="min-w-0 flex-1"><h3 className="text-sm font-semibold">Add {name || "this user"} as {roleLabel(role)}?</h3><dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2"><div><dt className="muted">Additional user</dt><dd className="mt-1 font-medium">{amount(annual ? billing.additional_user_annual : billing.additional_user_monthly)} / {annual ? "year" : "month"}</dd></div><div><dt className="muted">Users after creation</dt><dd className="mt-1 font-medium">{billing.total_users} total · {billing.billable_users} additional</dd></div><div><dt className="muted">Subscription estimate after creation</dt><dd className="mt-1 font-medium">{amount(annual ? billing.estimated_annual_total : billing.estimated_monthly_total)} / {annual ? "year" : "month"}</dd></div><div><dt className="muted">Billing state</dt><dd className="mt-1 font-medium">{billing.status === "trialing" ? "Tracked until a plan is active" : "Existing subscription"}</dd></div></dl>{stripe.authoritative ? <p className="mt-4 rounded-md bg-white p-3 text-xs text-[#174ea6]">Stripe billing preview: <strong>{amount(stripe.amountDueCents / 100, stripe.currency)}</strong> due immediately. This is the authoritative preview returned for the current subscription and proration.</p> : <p className="mt-4 rounded-md bg-white p-3 text-xs text-[#174ea6]">No immediate charge is expected before a paid plan is active. The additional seat is tracked and will be included once a paid plan is active.</p>}<p className="muted mt-3 text-[11px]">The seat is not activated until the server confirms the required billing operation. Invitation delivery can be retried without creating another seat.</p></div></div></section>;
}

function SensitiveWarning() { return <div className="mt-5 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><p><strong>Sensitive access is enabled.</strong> Refunds, invoice voids, credit/debit notes, financial exports, profit reports, inventory adjustments, and accounting-period changes are audited.</p></div>; }
function sensitiveEnabled(permissions: Record<string, boolean>) { return Object.entries(permissions).some(([code, enabled]) => enabled && sensitiveCodes.has(code)); }
function SummaryMetric({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="rounded-lg bg-white p-3"><p className="muted text-[11px]">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p><p className="muted mt-1 text-[11px]">{detail}</p></div>; }
