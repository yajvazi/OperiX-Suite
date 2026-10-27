"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Save, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";

type RoleCode = "company_administrator" | "manager" | "employee";
type Scope = "OWN" | "ASSIGNED" | "ALL";
type Permission = { code: string; name: string; category: string; description?: string | null; is_sensitive: boolean };
type MemberAccess = { role_code?: string; permissions?: string[]; scopes?: Record<string, Scope> };
type TeamMember = {
  membership_id: string;
  user_id: string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  status?: string | null;
  role_code?: string | null;
  role_name?: string | null;
  is_company_owner?: boolean;
  access?: MemberAccess | null;
};

const categoryLabels: Record<string, string> = {
  invoices: "Invoices",
  documents: "Documents",
  payments: "Payments",
  expenses: "Expenses",
  customers: "Customers",
  products: "Products",
  inventory: "Inventory",
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

const roleLabels: Record<RoleCode, string> = {
  company_administrator: "Admin",
  manager: "Manager",
  employee: "Employee",
};

const sensitivePermissionCodes = new Set([
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

export function TeamAccessPanel() {
  const workspace = useWorkspace();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [catalog, setCatalog] = useState<Permission[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [role, setRole] = useState<RoleCode>("employee");
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [scopes, setScopes] = useState<Record<string, Scope>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [initialPermissions, setInitialPermissions] = useState<Record<string, boolean>>({});

  const selectedMember = members.find((member) => member.membership_id === selectedId) || null;
  const canManage = workspace.can("permissions.manage") && Boolean(workspace.companyId);

  useEffect(() => {
    if (!canManage || !workspace.companyId) {
      return;
    }
    const client = createClient();
    if (!client) {
      queueMicrotask(() => {
        setMessage("Supabase is not configured.");
        setLoading(false);
      });
      return;
    }
    let active = true;
    queueMicrotask(() => {
      if (active) setLoading(true);
    });
    void Promise.all([
      client.rpc("rbac_list_company_members", { p_company_id: workspace.companyId }),
      client.rpc("rbac_list_permission_catalog"),
    ]).then(([membersResult, catalogResult]) => {
      if (!active) return;
      if (membersResult.error) throw membersResult.error;
      if (catalogResult.error) throw catalogResult.error;
      const nextMembers = (membersResult.data || []) as TeamMember[];
      setMembers(nextMembers);
      setCatalog((catalogResult.data || []) as Permission[]);
      setSelectedId((current) => current || nextMembers[0]?.membership_id || "");
      setMessage("");
    }).catch((error: unknown) => {
      if (active) setMessage(error instanceof Error ? error.message : "Team access could not be loaded.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [canManage, workspace.companyId]);

  useEffect(() => {
    if (!selectedMember) return;
    const nextRole = normalizeRole(selectedMember.role_code || selectedMember.access?.role_code);
    const nextPermissions = Object.fromEntries(
      catalog.map((permission) => [permission.code, Boolean(selectedMember.access?.permissions?.includes(permission.code))]),
    );
    const nextScopes = Object.fromEntries(
      scopeResources.map(({ resource }) => [resource, selectedMember.access?.scopes?.[resource] || "OWN"]),
    ) as Record<string, Scope>;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setRole(nextRole);
      setPermissions(nextPermissions);
      setInitialPermissions(nextPermissions);
      setScopes(nextScopes);
      setMessage("");
    });
    return () => { active = false; };
  }, [catalog, selectedMember]);

  const groupedPermissions = useMemo(() => {
    const groups = new Map<string, Permission[]>();
    catalog.forEach((permission) => {
      const group = groups.get(permission.category) || [];
      group.push(permission);
      groups.set(permission.category, group);
    });
    return [...groups.entries()];
  }, [catalog]);

  function changeRole(nextRole: RoleCode) {
    setRole(nextRole);
    if (nextRole === "company_administrator") {
      setPermissions(Object.fromEntries(catalog.map((permission) => [permission.code, true])));
      setScopes(Object.fromEntries(scopeResources.map(({ resource }) => [resource, "ALL"])) as Record<string, Scope>);
    }
  }

  function togglePermission(code: string) {
    if (role === "company_administrator") return;
    setPermissions((current) => ({ ...current, [code]: !current[code] }));
  }

  async function save() {
    if (!selectedMember || selectedMember.is_company_owner || !workspace.companyId) return;
    const newlySensitive = catalog.some((permission) =>
      permission.is_sensitive && permissions[permission.code] && !initialPermissions[permission.code],
    );
    if (newlySensitive && !window.confirm("You are granting a sensitive permission. The action will be audited and can expose financial or legally relevant operations. Continue?")) return;
    const client = createClient();
    if (!client) return;
    setSaving(true);
    setMessage("");
    const permissionPayload = Object.fromEntries(catalog.map((permission) => [permission.code, role === "company_administrator" || Boolean(permissions[permission.code])]));
    const { data, error } = await client.rpc("rbac_update_member_access", {
      p_membership_id: selectedMember.membership_id,
      p_role_code: role,
      p_permissions: permissionPayload,
      p_scopes: scopes,
    });
    if (error) {
      setMessage(error.message);
      setSaving(false);
      return;
    }
    const updatedAccess = (data as { access?: MemberAccess } | null)?.access;
    setMembers((current) => current.map((member) => member.membership_id === selectedMember.membership_id
      ? { ...member, role_code: role, role_name: roleLabels[role], access: updatedAccess || member.access }
      : member));
    setInitialPermissions(permissions);
    setMessage("Team access saved and recorded in the audit log.");
    setSaving(false);
    await workspace.refresh();
  }

  if (!canManage) {
    return <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">Only a tenant Admin can manage roles, permissions, and data scopes.</div>;
  }

  return <div className="mt-6 grid gap-5 lg:grid-cols-[260px_1fr]">
    <aside className="rounded-lg border border-[#dbe5f5] p-2">
      <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#61708a]">Members</p>
      {loading ? <p className="muted p-3 text-xs">Loading members…</p> : null}
      {!loading && !members.length ? <p className="muted p-3 text-xs">No active members were found.</p> : null}
      {members.map((member) => <button key={member.membership_id} type="button" onClick={() => setSelectedId(member.membership_id)} className={`flex w-full items-center gap-3 rounded-md p-3 text-left ${selectedId === member.membership_id ? "bg-[#edf4ff] text-[#004ffe]" : "hover:bg-[#f7f9fc]"}`}>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e7eefb] text-xs font-semibold">{initials(member)}</span>
        <span className="min-w-0"><strong className="block truncate text-xs">{memberName(member)}</strong><small className="muted block truncate">{member.is_company_owner ? "Admin · owner" : roleLabels[normalizeRole(member.role_code || member.access?.role_code)]}</small></span>
      </button>)}
    </aside>
    <section className="min-w-0">
      {selectedMember ? <>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">{memberName(selectedMember)}</h3><p className="muted mt-1 text-xs">{selectedMember.email || "Company member"}</p></div>{selectedMember.is_company_owner ? <span className="inline-flex items-center gap-1 rounded-full bg-[#edf4ff] px-2.5 py-1 text-[11px] font-medium text-[#004ffe]"><ShieldCheck size={13} />Owner Admin</span> : null}</div>
        <div className="mt-5 rounded-lg border border-[#dbe5f5] p-4"><label className="field max-w-xs"><span>Role</span><select className="select" value={selectedMember.is_company_owner ? "company_administrator" : role} disabled={selectedMember.is_company_owner || saving} onChange={(event) => changeRole(event.target.value as RoleCode)}><option value="company_administrator">Admin</option><option value="manager">Manager</option><option value="employee">Employee</option></select></label>{selectedMember.is_company_owner ? <p className="muted mt-3 text-xs">The owner remains the tenant Admin and cannot be edited from this screen. Platform Super Admin is not a tenant role and is never assignable here.</p> : null}</div>
        {!selectedMember.is_company_owner && role !== "company_administrator" ? <>
          <div className="mt-5 rounded-lg border border-[#dbe5f5] p-4"><div className="flex items-start justify-between gap-3"><div><h4 className="text-sm font-semibold">Permissions</h4><p className="muted mt-1 text-xs">Defaults come from the selected role. Optional sensitive actions are explicit and audited.</p></div><span className="text-[11px] text-[#61708a]">{Object.values(permissions).filter(Boolean).length} enabled</span></div><div className="mt-4 grid gap-4 md:grid-cols-2">{groupedPermissions.map(([category, categoryPermissions]) => <fieldset key={category} className="rounded-md border border-[#e6ebf3] p-3"><legend className="px-1 text-xs font-semibold">{categoryLabels[category] || category}</legend><div className="grid gap-2">{categoryPermissions.map((permission) => <label key={permission.code} className="flex items-start gap-2 rounded p-1.5 text-xs hover:bg-[#f7f9fc]"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={Boolean(permissions[permission.code])} onChange={() => togglePermission(permission.code)} /><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-1"><strong>{permission.name}</strong>{permission.is_sensitive ? <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-900">Sensitive</span> : null}</span><small className="muted mt-0.5 block">{permission.description}</small></span></label>)}</div></fieldset>)}</div></div>
          <div className="mt-5 rounded-lg border border-[#dbe5f5] p-4"><h4 className="text-sm font-semibold">Data scopes</h4><p className="muted mt-1 text-xs">Choose which records the role can retrieve. Database policies enforce this selection.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{scopeResources.map(({ resource, label }) => <label className="field" key={resource}><span>{label}</span><select className="select" value={scopes[resource] || "OWN"} disabled={saving} onChange={(event) => setScopes((current) => ({ ...current, [resource]: event.target.value as Scope }))}><option value="OWN">Own</option><option value="ASSIGNED">Assigned</option><option value="ALL">All</option></select></label>)}</div></div>
          {Object.entries(permissions).some(([code, enabled]) => enabled && sensitivePermissionCodes.has(code)) ? <div className="mt-5 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><p><strong>Sensitive access is enabled.</strong> Refunds, voids, financial exports, profit reports, inventory adjustments, and accounting period changes are recorded in the company audit log.</p></div> : null}
          <div className="mt-5 flex justify-end"><button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}><Save size={16} />{saving ? "Saving…" : "Save access"}</button></div>
        </> : <div className="mt-5 rounded-lg border border-[#dbe5f5] bg-[#f8fbff] p-4 text-xs">Admins receive all tenant permissions and all tenant data scopes. Platform permissions and OperiX Control remain separate and cannot be granted here.</div>}
      </> : <p className="muted rounded-lg border border-dashed p-8 text-center text-xs">Select a member to configure access.</p>}
      {message ? <p className="mt-4 rounded-lg bg-[#f8fbff] p-3 text-xs" role="status">{message}</p> : null}
    </section>
  </div>;
}

function normalizeRole(value?: string | null): RoleCode {
  if (value === "company_administrator" || value === "admin") return "company_administrator";
  if (value === "manager") return "manager";
  return "employee";
}

function memberName(member: TeamMember) {
  return [member.first_name, member.last_name].filter(Boolean).join(" ") || member.email || "Company member";
}

function initials(member: TeamMember) {
  return memberName(member).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "M";
}
