"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, Download, FileText, LockKeyhole, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useHrSnapshot } from "@/lib/hr-hooks";
import { Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, StatusBadge } from "./ui";

type Run = { id: string; run_number?: string | null; status?: string | null; currency?: string | null; total_gross?: number | null; total_net?: number | null; total_tax?: number | null; created_at?: string | null };
type Payslip = { id: string; payroll_run_id?: string | null; language?: string | null; verification_reference?: string | null; snapshot?: Record<string, unknown> | null; generated_at?: string | null; revoked_at?: string | null };

function money(value: unknown, currency = "EUR") { return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value || 0)); }

export function PayrollView() {
  const query = useHrSnapshot();
  const [runs, setRuns] = useState<Run[]>([]);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const client = createClient();
    if (!client || !query.workspace?.companyId) return;
    setLoading(true); setError("");
    const [runResult, payslipResult] = await Promise.all([
      client.from("payroll_runs").select("id,run_number,status,currency,total_gross,total_net,total_tax,created_at").eq("company_id", query.workspace.companyId).order("created_at", { ascending: false }).limit(20),
      client.from("payslip_snapshots").select("id,payroll_run_id,language,verification_reference,snapshot,generated_at,revoked_at").eq("company_id", query.workspace.companyId).order("generated_at", { ascending: false }).limit(30),
    ]);
    if (runResult.error && payslipResult.error) setError(runResult.error.message);
    setRuns((runResult.data || []) as Run[]);
    setPayslips((payslipResult.data || []) as Payslip[]);
    setLoading(false);
  }, [query.workspace?.companyId]);

  useEffect(() => { void load(); }, [load]);
  const totals = useMemo(() => runs.reduce((result, run) => ({ gross: result.gross + Number(run.total_gross || 0), net: result.net + Number(run.total_net || 0), tax: result.tax + Number(run.total_tax || 0) }), { gross: 0, net: 0, tax: 0 }), [runs]);
  if ((query.loading || loading) && !query.data) return <><PageHeader title="Payroll" description="Loading secure payroll records…" /><Card><LoadingBlock lines={12} /></Card></>;
  if (query.error && !query.data) return <><PageHeader title="Payroll" description="Payroll access follows your OperiX role." /><ErrorState message={query.error} onRetry={() => void query.refresh()} /></>;
  return <><PageHeader title="Payroll" description="Finalized payroll and personal payslips from the shared OperiX payroll foundation." action={<Button variant="secondary" onClick={() => void load()}><RefreshCw size={15} />Refresh</Button>} />{error ? <ErrorState message={error} onRetry={() => void load()} /> : null}<div className="stat-grid payroll-stat-grid"><Stat label="Payroll runs" value={runs.length} icon={<FileText size={16} />} /><Stat label="Gross total" value={runs.length ? money(totals.gross, runs[0]?.currency || query.workspace?.company?.currency || "EUR") : "—"} icon={<Banknote size={16} />} tone="green" /><Stat label="Net total" value={runs.length ? money(totals.net, runs[0]?.currency || query.workspace?.company?.currency || "EUR") : "—"} icon={<ShieldCheck size={16} />} tone="purple" /><Stat label="My payslips" value={payslips.length} icon={<Users size={16} />} tone="amber" /></div><div className="dashboard-grid"><Card title="Payroll periods" action={<span className="muted-inline"><LockKeyhole size={14} />Server-authorized</span>}>{runs.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Run</th><th>Status</th><th>Currency</th><th>Gross</th><th>Net</th><th>Created</th></tr></thead><tbody>{runs.map((run) => <tr key={run.id}><td><strong>{run.run_number || run.id.slice(0, 8)}</strong></td><td><StatusBadge status={run.status} /></td><td>{run.currency || query.workspace?.company?.currency || "EUR"}</td><td>{money(run.total_gross, run.currency || "EUR")}</td><td>{money(run.total_net, run.currency || "EUR")}</td><td>{run.created_at ? new Date(run.created_at).toLocaleDateString() : "—"}</td></tr>)}</tbody></table></div> : <EmptyState icon={<LockKeyhole size={19} />} title="No payroll runs available" description="Payroll runs are visible only to authorized payroll roles after they are created and calculated." />}</Card><Card title="My payslips" action={<span className="muted-inline">Private access</span>}>{payslips.length ? <div className="activity-list">{payslips.map((payslip) => { const snapshot = payslip.snapshot || {}; return <div className="payslip-row" key={payslip.id}><span className="payslip-icon"><FileText size={16} /></span><div><strong>{String(snapshot.runNumber || payslip.verification_reference || "Payslip")}</strong><p>{payslip.generated_at ? new Date(payslip.generated_at).toLocaleDateString() : "Generated payslip"}{payslip.revoked_at ? " · Revoked" : ""}</p></div><a className="table-action" href={`/api/payroll/payslips/${payslip.id}`} aria-label="Download payslip"><Download size={16} /></a></div>; })}</div> : <EmptyState icon={<FileText size={19} />} title="No payslips yet" description="Your payslips will appear here after an authorized payroll run is finalized and generated." />}</Card></div></>;
}

function Stat({ label, value, icon, tone = "blue" }: { label: string; value: string | number; icon: React.ReactNode; tone?: "blue" | "green" | "amber" | "purple" }) { return <article className={`stat-card stat-${tone}`}><div className="stat-card-top"><span className="stat-label">{label}</span><span className="stat-icon">{icon}</span></div><strong className="payroll-stat-value">{value}</strong></article>; }
