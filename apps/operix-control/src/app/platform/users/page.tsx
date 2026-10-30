import Link from "next/link";
import { Search } from "lucide-react";
import { PlatformBoundary, gatePlatform } from "@/lib/platform-access";
import type { PlatformUserRow } from "@/lib/platform-types";
import { PlatformNav } from "@/components/platform-nav";
import { StatusBadge } from "@/components/platform-charts";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 25;
const date = (value: string | null) => (value ? new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—");

export default async function PlatformUsersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const { q = "", page: pageParam = "1" } = await searchParams;
  const search = q.trim().slice(0, 100);
  const page = Math.max(1, Number.parseInt(pageParam, 10) || 1);
  const gate = await gatePlatform("/platform/users");
  if (!gate.ok) return <PlatformBoundary title={gate.title} body={gate.body} />;
  const { data, error } = await gate.client.rpc("platform_list_users", { p_search: search || null, p_limit: PAGE_SIZE, p_offset: (page - 1) * PAGE_SIZE });
  if (error) return <PlatformBoundary title="Users unavailable" body="The user directory could not be loaded." />;
  const rows = (data || []) as PlatformUserRow[];
  const total = rows[0]?.total_count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (target: number) => `/platform/users?${new URLSearchParams({ ...(search ? { q: search } : {}), page: String(target) }).toString()}`;

  return <main className="platform-page">
    <PlatformNav active="users" email={gate.email} title="Users" description="Everyone with an OperiX account: how they signed up, their workspaces and their OperiX Cloud access." />
    <section className="surface-panel table-panel">
      <form className="table-toolbar" action="/platform/users" method="get">
        <div className="table-search"><Search size={16} /><input name="q" defaultValue={search} placeholder="Search by name or email" aria-label="Search users" /></div>
        <span className="permission-note">{total} user{total === 1 ? "" : "s"}{search ? ` matching “${search}”` : ""}</span>
      </form>
      <div className="data-table-wrap"><table className="data-table">
        <thead><tr><th>User</th><th>Sign-in</th><th className="num">Workspaces</th><th>Cloud access</th><th className="num">Invoices</th><th>Joined</th><th>Last sign-in</th></tr></thead>
        <tbody>{rows.length ? rows.map((row) => <tr key={row.id}>
          <td><Link href={`/platform/users/${row.id}`}><strong>{row.full_name || row.email}</strong></Link><small>{row.full_name ? row.email : ""}{row.email_confirmed ? "" : " · email not confirmed"}</small></td>
          <td>{row.provider}</td><td className="num">{row.workspaces}</td><td><StatusBadge status={row.cloud_status} /></td><td className="num">{row.invoices}</td><td>{date(row.created_at)}</td><td>{date(row.last_sign_in_at)}</td>
        </tr>) : <tr><td colSpan={7}>No users found.</td></tr>}</tbody>
      </table></div>
      {pages > 1 ? <div className="table-toolbar"><span className="permission-note">Page {page} of {pages}</span><span className="platform-pager">{page > 1 ? <Link href={link(page - 1)}>← Previous</Link> : null}{page < pages ? <Link href={link(page + 1)}>Next →</Link> : null}</span></div> : null}
    </section>
  </main>;
}
