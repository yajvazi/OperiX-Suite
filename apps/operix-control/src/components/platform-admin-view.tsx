"use client";

import { useMemo, useState } from "react";
import { Download, LockKeyhole, Search, ShieldCheck } from "lucide-react";
import type { PlatformOrganizationRow } from "@/lib/control-types";

export function PlatformAdminView({ organizations }: { organizations: PlatformOrganizationRow[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => organizations.filter((item) => `${item.organization || ""} ${item.plan || ""} ${item.status}`.toLowerCase().includes(query.toLowerCase())), [organizations, query]);
  function exportOrganizations() {
    if (!filtered.length) return;
    const columns = ["organization", "plan", "members", "enabled_apps", "status", "created_at"];
    const rows = filtered.map((item) => [item.organization || "", item.plan || "", item.member_count, item.enabled_apps, item.status, item.created_at].map((value) => JSON.stringify(value)).join(","));
    const url = URL.createObjectURL(new Blob([[columns.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "operix-platform-organizations.csv"; anchor.click(); URL.revokeObjectURL(url);
  }
  return <main className="platform-page"><header className="platform-header"><div><span className="eyebrow-label">Internal only</span><h1>Platform administration</h1><p>Tenant directory and adoption visibility for authorized OperiX platform administrators.</p></div><div className="platform-header-actions"><span className="platform-protected"><LockKeyhole size={15} />Platform role protected</span><button className="button button-quiet" type="button" onClick={exportOrganizations}><Download size={15} />Export</button></div></header><div className="callout callout-info"><ShieldCheck size={17} /><span>This surface is separate from organization administration. It does not grant tenant access, reveal secrets, or provide impersonation.</span></div><section className="surface-panel table-panel"><div className="table-toolbar"><div className="table-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search organizations" /></div><span className="permission-note">{filtered.length} of {organizations.length} organizations</span></div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Organization</th><th>Plan</th><th>Users</th><th>Active apps</th><th>Status</th><th>Created</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td><strong>{item.organization || "Unnamed organization"}</strong><small>{item.id}</small></td><td>{item.plan || "—"}</td><td>{item.member_count}</td><td>{item.enabled_apps}</td><td><span className={`status-badge status-badge-${item.status === "active" ? "success" : "warning"}`}><span className="status-dot" />{item.status}</span></td><td>{new Date(item.created_at).toLocaleDateString()}</td></tr>)}</tbody></table>{!filtered.length ? <div className="empty-state"><Search size={22} /><strong>No organizations match</strong><span>Use a different search term.</span></div> : null}</div></section></main>;
}
