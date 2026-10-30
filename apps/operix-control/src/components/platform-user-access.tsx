"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { PlatformGrant } from "@/lib/platform-types";
import { StatusBadge } from "./platform-charts";

const date = (value: string | null) => (value ? new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "no end date");

/** Grant or revoke OperiX Cloud access for one workspace. Every change needs a reason and is recorded in the audit log. */
export function PlatformCloudAccess({ rootCompanyId, workspaceName, status, subscriptionText, grants }: {
  rootCompanyId: string; workspaceName: string; status: string; subscriptionText: string; grants: PlatformGrant[];
}) {
  const router = useRouter();
  const [plan, setPlan] = useState("invoice");
  const [reason, setReason] = useState("");
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  async function grant(event: FormEvent) {
    event.preventDefault();
    if (reason.trim().length < 3) { setFailed(true); setMessage("Enter a reason of at least 3 characters."); return; }
    const client = createClient();
    if (!client) { setFailed(true); setMessage("The Control client is not configured."); return; }
    setBusy(true); setMessage("");
    const { error } = await client.rpc("platform_grant_cloud_access", {
      p_company_id: rootCompanyId, p_plan: plan, p_reason: reason.trim(),
      p_expires_at: expires ? new Date(`${expires}T23:59:59.000Z`).toISOString() : null,
    });
    setBusy(false);
    if (error) { setFailed(true); setMessage(error.message); return; }
    setFailed(false); setMessage("OperiX Cloud access granted and recorded in the audit log."); setReason(""); setExpires("");
    router.refresh();
  }

  async function revoke(item: PlatformGrant) {
    const why = window.prompt(`Reason for removing the ${item.product.toUpperCase()} access of ${workspaceName}?`, "Access ended");
    if (!why?.trim()) return;
    const client = createClient();
    if (!client) return;
    setBusy(true); setMessage("");
    const { error } = await client.rpc("platform_revoke_cloud_access", { p_grant_id: item.id, p_reason: why.trim() });
    setBusy(false);
    if (error) { setFailed(true); setMessage(error.message); return; }
    setFailed(false); setMessage("Access removed and recorded in the audit log.");
    router.refresh();
  }

  return <section className="surface-panel">
    <div className="panel-header"><div><h2>{workspaceName}</h2><p>OperiX Cloud: <StatusBadge status={status} /> {subscriptionText}</p></div></div>
    {grants.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Granted plan</th><th>Reason</th><th>Since</th><th>Until</th><th>Action</th></tr></thead><tbody>
      {grants.map((item) => <tr key={item.id}><td>{item.product}</td><td>{item.reason}</td><td>{date(item.created_at)}</td><td>{date(item.expires_at)}</td><td><button type="button" className="button" disabled={busy} onClick={() => void revoke(item)}>Remove access</button></td></tr>)}
    </tbody></table></div> : null}
    <form className="inline-form" onSubmit={(event) => void grant(event)}>
      <label className="field"><span>Plan</span><select value={plan} onChange={(event) => setPlan(event.target.value)}><option value="invoice">OperiX Invoice</option><option value="suite">OperiX Suite</option></select></label>
      <label className="field"><span>Reason (required)</span><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="For example: partner pilot, support gesture" /></label>
      <label className="field"><span>Ends on (optional)</span><input type="date" value={expires} onChange={(event) => setExpires(event.target.value)} /></label>
      <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Saving…" : grants.length ? "Replace or add access" : "Grant OperiX Cloud access"}</button>
    </form>
    {message ? <p className={`form-hint ${failed ? "form-error" : ""}`}>{message}</p> : null}
  </section>;
}
