"use client";
/* The effects synchronize asynchronous ticket, agent, and saved-filter data into local view state. */
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Filter, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "./page-header";
import { labelFor, PRIORITY_LABELS, STATUS_LABELS } from "@/lib/format";

type Ticket = {
  id: string;
  ticket_number: string;
  subject: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
  contact?: { display_name: string; email: string | null };
  department?: { name: string; code: string };
  assignee?: { company_name?: string | null; email?: string | null; role?: string | null };
};
type Agent = { id: string; profile?: { company_name?: string | null; email?: string | null; role?: string | null } | null };
type SavedFilter = { id: string; name: string; filters: Record<string, unknown>; is_shared: boolean };

export function TicketsView() {
  const searchParams = useSearchParams();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [count, setCount] = useState(0);
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [priority, setPriority] = useState(searchParams.get("priority") ?? "");
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [bulkAgentId, setBulkAgentId] = useState("");
  const [bulkPending, setBulkPending] = useState(false);
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [filterName, setFilterName] = useState("");

  const load = useCallback(async () => {
    setPending(true);
    setError(null);
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
    if (priority) params.set("priority", priority);
    const response = await fetch(`/api/tickets?${params}`);
    if (!response.ok) throw new Error("Unable to load tickets");
    const result = await response.json() as { data: Ticket[]; count: number };
    setTickets(result.data);
    setCount(result.count);
    setSelectedIds([]);
    setPending(false);
  }, [priority, q, status]);

  useEffect(() => {
    load().catch(() => { setError("Unable to load tickets."); setPending(false); });
  }, [load]);

  useEffect(() => {
    fetch("/api/agents").then((response) => response.ok ? response.json() as Promise<{ data: Agent[] }> : { data: [] }).then((result) => setAgents(result.data ?? [])).catch(() => undefined);
    fetch("/api/filters").then((response) => response.ok ? response.json() as Promise<{ data: SavedFilter[] }> : { data: [] }).then((result) => setSavedFilters(result.data ?? [])).catch(() => undefined);
  }, []);

  async function assignSelected() {
    if (!selectedIds.length) return;
    setBulkPending(true);
    setError(null);
    const response = await fetch("/api/tickets/bulk-assignment", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticketIds: selectedIds, agentId: bulkAgentId || null }) });
    if (!response.ok) {
      setError("Unable to apply the bulk assignment.");
    } else {
      setBulkAgentId("");
      await load();
    }
    setBulkPending(false);
  }

  async function saveCurrentFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!filterName.trim()) return;
    const response = await fetch("/api/filters", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: filterName, filters: { q, status, priority }, isShared: false }) });
    if (!response.ok) { setError("Unable to save this filter."); return; }
    const result = await response.json() as { data: SavedFilter };
    setSavedFilters((current) => [...current, result.data].sort((a, b) => a.name.localeCompare(b.name)));
    setFilterName("");
  }

  function applySavedFilter(value: string) {
    const saved = savedFilters.find((item) => item.id === value);
    if (!saved) return;
    setQ(typeof saved.filters.q === "string" ? saved.filters.q : "");
    setStatus(typeof saved.filters.status === "string" ? saved.filters.status : "");
    setPriority(typeof saved.filters.priority === "string" ? saved.filters.priority : "");
  }

  const allSelected = tickets.length > 0 && selectedIds.length === tickets.length;
  const toggleSelected = (ticketId: string) => setSelectedIds((current) => current.includes(ticketId) ? current.filter((id) => id !== ticketId) : [...current, ticketId]);

  return <div className="workspace">
    <PageHeader title="Tickets" description={`${count.toLocaleString()} ticket${count === 1 ? "" : "s"} in this workspace.`} action={{ href: "/tickets/new", label: "New ticket" }} />
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] p-4">
        <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-[var(--border)] px-3"><Search size={16} className="muted" /><input className="min-w-0 flex-1 bg-transparent py-2 text-xs outline-none" aria-label="Search tickets" placeholder="Search number, subject, contact, tag…" value={q} onChange={(event) => setQ(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void load(); }} /></label>
        <label className="flex items-center gap-2 text-xs"><Filter size={15} className="muted" /><select className="select min-w-40 py-2 text-xs" aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <select className="select min-w-32 py-2 text-xs" aria-label="Filter by priority" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">All priorities</option>{Object.entries(PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select className="select min-w-40 py-2 text-xs" aria-label="Saved filters" defaultValue="" onChange={(event) => applySavedFilter(event.target.value)}><option value="">Saved views</option>{savedFilters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      </div>
      <form className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--canvas)] p-3" onSubmit={saveCurrentFilter}>
        <span className="muted text-[11px]">Save current filters</span><input className="input h-8 w-44 text-xs" aria-label="Saved filter name" placeholder="e.g. Critical today" value={filterName} onChange={(event) => setFilterName(event.target.value)} /><button className="btn h-8 min-h-8 px-3 text-[11px]" type="submit" disabled={!filterName.trim()}>Save view</button>
        {selectedIds.length ? <><span className="ml-auto text-[11px] font-medium">{selectedIds.length} selected</span><select className="select h-8 py-1 text-[11px]" aria-label="Bulk assignment agent" value={bulkAgentId} onChange={(event) => setBulkAgentId(event.target.value)}><option value="">Unassign agent</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.profile?.company_name ?? agent.profile?.email ?? agent.id}</option>)}</select><button className="btn btn-primary h-8 min-h-8 px-3 text-[11px]" type="button" disabled={bulkPending} onClick={() => void assignSelected()}>{bulkPending ? "Assigning…" : "Apply assignment"}</button></> : null}
      </form>
      {error ? <p className="m-4 rounded-md bg-[#fff3f2] p-3 text-xs text-[#b42318]">{error}</p> : null}
      {pending ? <div className="grid gap-3 p-5">{[1, 2, 3, 4].map((item) => <div key={item} className="skeleton h-12 rounded" />)}</div> : tickets.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th><input type="checkbox" aria-label="Select all visible tickets" checked={allSelected} onChange={(event) => setSelectedIds(event.target.checked ? tickets.map((ticket) => ticket.id) : [])} /></th><th>Ticket</th><th>Contact</th><th>Status</th><th>Priority</th><th>Department</th><th>Assignee</th><th>Updated</th></tr></thead><tbody>{tickets.map((ticket) => <tr key={ticket.id}><td><input type="checkbox" aria-label={`Select ${ticket.ticket_number}`} checked={selectedIds.includes(ticket.id)} onChange={() => toggleSelected(ticket.id)} /></td><td><Link href={`/tickets/${ticket.id}`} className="font-semibold text-[var(--blue)] hover:underline">{ticket.ticket_number}</Link><span className="mt-1 block max-w-[280px] truncate text-xs">{ticket.subject}</span></td><td><span className="block text-xs">{ticket.contact?.display_name ?? "Unlinked contact"}</span><span className="muted mt-1 block text-[11px]">{ticket.contact?.email ?? "—"}</span></td><td><span className={`status status-${ticket.status}`}>{labelFor(ticket.status, STATUS_LABELS)}</span></td><td><span className={`status priority-${ticket.priority}`}>{labelFor(ticket.priority, PRIORITY_LABELS)}</span></td><td className="text-xs">{ticket.department?.name ?? "Unassigned"}</td><td className="text-xs">{ticket.assignee?.company_name ?? ticket.assignee?.email ?? "Unassigned"}</td><td className="muted text-xs">{new Date(ticket.updated_at).toLocaleDateString()}</td></tr>)}</tbody></table></div> : <div className="p-12 text-center"><ClipboardEmpty /><h2 className="mt-3 text-sm font-semibold">No tickets found</h2><p className="muted mt-1 text-xs">Try changing the filters or create the first ticket.</p><Link className="btn btn-primary mt-5" href="/tickets/new">Create ticket</Link></div>}
    </section>
  </div>;
}

function ClipboardEmpty() { return <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#edf4ff] text-[var(--blue)]"><Filter size={20} /></span>; }
