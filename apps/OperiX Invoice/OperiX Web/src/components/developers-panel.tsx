"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BookOpen, Check, Copy, KeyRound, Link2, RefreshCw, RotateCw, ShieldCheck, Trash2, Webhook, X } from "lucide-react";
import { INVOICE_SCOPES, BOOKING_SCOPES, PUBLIC_WEBHOOK_EVENTS } from "@invoice-monorepo/public-api/contracts";

type KeyRow = { id: string; name: string; environment: "test" | "live"; key_prefix: string; scopes: string[]; expires_at: string | null; last_used_at: string | null; revoked_at: string | null; created_at: string };
type WebhookRow = { id: string; name: string; endpoint_url: string; environment: "test" | "live"; subscribed_events: string[]; status: string; secret_prefix: string; last_delivery_at: string | null; failure_count: number; success_count: number };
type DeliveryRow = { id: string; endpoint_id: string; status: string; attempt: number; status_code: number | null; response_time_ms: number | null; error_message: string | null; next_attempt_at: string | null; delivered_at: string | null; created_at: string };
type Summary = { companyId: string; entitlement: { api_addon?: boolean; invoice?: boolean; booking?: boolean; included_requests: number; overage_price: string; overage_requests: number; automatic_overage_charging?: boolean; period_start: string; period_end: string }; keys: KeyRow[]; webhooks: WebhookRow[]; deliveries: DeliveryRow[]; usage: { requests: number; successful: number; failed: number; requests_today: number; top_endpoints: Array<{ endpoint: string; requests: number }>; by_key: Array<{ key_prefix: string; requests: number }> }; logs: Array<{ request_id: string; method: string; endpoint: string; response_status: number; duration_ms: number; occurred_at: string }> };

const allScopes = [...INVOICE_SCOPES, ...BOOKING_SCOPES];
const helpCenterUrl = process.env.NEXT_PUBLIC_OPERIX_HELP_CENTER_URL?.trim() || "https://helpdesk.operixsuite.com";
const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Never";

export function DevelopersPanel() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [secret, setSecret] = useState("");
  const [keyForm, setKeyForm] = useState({ name: "", environment: "test" as "test" | "live", expires_at: "", scopes: [] as string[] });
  const [webhookForm, setWebhookForm] = useState({ name: "", url: "", environment: "test" as "test" | "live", events: ["invoice.created", "booking.created"] });

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/developers/summary", { cache: "no-store" });
      const body = await response.json() as { error?: string } & Partial<Summary>;
      if (!response.ok) throw new Error(body.error || "Developer settings could not be loaded.");
      const nextSummary = body as Summary;
      setSummary(nextSummary);
      const allowed = [...(nextSummary.entitlement.invoice ? INVOICE_SCOPES : []), ...(nextSummary.entitlement.booking ? BOOKING_SCOPES : [])];
      setKeyForm(current => {
        const retained = current.scopes.filter(scope => allowed.includes(scope as never));
        return { ...current, scopes: retained.length ? retained : allowed.slice() };
      });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Developer settings could not be loaded."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  async function addApiAccess() {
    setBusy("addon"); setError("");
    try {
      const response = await fetch("/api/billing/api-addon", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ product: summary?.entitlement.invoice ? "invoice" : "booking" }) });
      const body = await response.json() as { url?: string; error?: string };
      if (!response.ok || !body.url) throw new Error(body.error || "Secure checkout could not be opened.");
      window.location.assign(body.url);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Secure checkout could not be opened."); setBusy(""); }
  }

  async function createKey(event: React.FormEvent) {
    event.preventDefault(); setBusy("key"); setError(""); setSecret("");
    try {
      const response = await fetch("/api/developers/keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: keyForm.name, environment: keyForm.environment, expires_at: keyForm.expires_at ? new Date(keyForm.expires_at).toISOString() : null, scopes: keyForm.scopes }) });
      const body = await response.json() as { data?: { key?: string }; error?: string };
      if (!response.ok || !body.data?.key) throw new Error(body.error || "The API key could not be created.");
      setSecret(body.data.key); setKeyForm(current => ({ ...current, name: "" })); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The API key could not be created."); }
    finally { setBusy(""); }
  }

  async function keyAction(id: string, action: "revoke" | "rotate") {
    if (action === "revoke" && !window.confirm("Revoke this API key? Existing integrations using it will stop working.")) return;
    setBusy(`${action}-${id}`); setError(""); setSecret("");
    try {
      const response = await fetch(`/api/developers/keys/${id}`, { method: action === "revoke" ? "DELETE" : "POST" });
      const body = await response.json() as { data?: { key?: string }; error?: string };
      if (!response.ok) throw new Error(body.error || "The API key action failed.");
      if (body.data?.key) setSecret(body.data.key);
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The API key action failed."); }
    finally { setBusy(""); }
  }

  async function createWebhook(event: React.FormEvent) {
    event.preventDefault(); setBusy("webhook"); setError(""); setSecret("");
    try {
      const response = await fetch("/api/developers/webhooks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(webhookForm) });
      const body = await response.json() as { data?: { secret?: string }; error?: string };
      if (!response.ok || !body.data?.secret) throw new Error(body.error || "The webhook endpoint could not be created.");
      setSecret(body.data.secret); setWebhookForm(current => ({ ...current, name: "", url: "" })); await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The webhook endpoint could not be created."); }
    finally { setBusy(""); }
  }

  async function webhookAction(id: string, action: "disable" | "enable" | "delete" | "rotate") {
    if (action === "delete" && !window.confirm("Delete this webhook endpoint? Existing delivery history is retained only as long as the endpoint record remains.")) return;
    setBusy(`${action}-${id}`); setError(""); setSecret("");
    try {
      const response = await fetch(`/api/developers/webhooks/${id}`, { method: action === "rotate" ? "POST" : action === "delete" ? "DELETE" : "PATCH", ...(action === "disable" || action === "enable" ? { headers: { "content-type": "application/json" }, body: JSON.stringify({ status: action === "disable" ? "disabled" : "active" }) } : {}) });
      const body = await response.json() as { data?: { secret?: string }; error?: string };
      if (!response.ok) throw new Error(body.error || "The webhook action failed.");
      if (body.data?.secret) setSecret(body.data.secret);
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The webhook action failed."); }
    finally { setBusy(""); }
  }

  async function retryDelivery(endpointId: string, deliveryId: string) {
    setBusy(`retry-${deliveryId}`); setError("");
    try {
      const response = await fetch(`/api/developers/webhooks/${endpointId}/deliveries/${deliveryId}`, { method: "POST" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "The webhook delivery could not be retried.");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The webhook delivery could not be retried."); }
    finally { setBusy(""); }
  }

  function toggleScope(scope: string) { setKeyForm(current => ({ ...current, scopes: current.scopes.includes(scope) ? current.scopes.filter(item => item !== scope) : [...current.scopes, scope] })); }
  function toggleEvent(event: string) { setWebhookForm(current => ({ ...current, events: current.events.includes(event) ? current.events.filter(item => item !== event) : [...current.events, event] })); }
  const availableScopes = allScopes.filter(scope => (summary?.entitlement.invoice && (scope.startsWith("invoice:") || scope.startsWith("customer:") || scope.startsWith("product:") || scope.startsWith("payment:") || scope.startsWith("document:"))) || (summary?.entitlement.booking && (scope.startsWith("booking:") || scope.startsWith("availability:") || scope.startsWith("service:") || scope.startsWith("provider:") || scope.startsWith("resource:") || scope.startsWith("location:") || scope.startsWith("booking_customer:"))));
  const used = summary?.usage.requests || 0;
  const included = summary?.entitlement.included_requests || 5000;
  const percent = Math.min(100, Math.round((used / included) * 1000) / 10);

  if (loading) return <div className="grid gap-3"><div className="skeleton h-32 rounded-xl" /><div className="skeleton h-60 rounded-xl" /><div className="skeleton h-52 rounded-xl" /></div>;
  if (!summary) return <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800"><strong>Developer settings unavailable</strong><p className="mt-1">{error || "Try again later."}</p><button className="btn mt-4" type="button" onClick={() => void load()}><RefreshCw size={15} />Try again</button></div>;

  if (!summary.entitlement.api_addon) return <section className="rounded-xl border border-[#b9d2ff] bg-[#f8fbff] p-6 sm:p-8"><div className="flex items-start gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#004ffe] text-white"><KeyRound size={23} /></span><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#004ffe]">OperiX API</p><h2 className="mt-1 text-2xl font-semibold">Connect your website, store or application directly to OperiX.</h2><p className="muted mt-2 max-w-2xl text-sm">API access follows your existing Invoice, Booking, or Suite subscription. It is protected by server-side entitlement checks and includes a separate test environment.</p></div></div><div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{["Invoice or Booking API access", "5,000 requests/month", "API keys and signed webhooks", "Test mode and request logs"].map(item => <div key={item} className="rounded-lg border border-[#dbe5f5] bg-white p-4 text-sm"><Check size={16} className="text-[#12b76a]" /><p className="mt-2">{item}</p></div>)}</div><div className="mt-7 flex flex-wrap items-center gap-4"><button type="button" className="btn btn-primary" disabled={busy === "addon"} onClick={() => void addApiAccess()}>{busy === "addon" ? "Opening secure checkout…" : "Add API Access · €4.99/month"}</button><span className="muted text-xs">No card details are collected by this page. Checkout is handled by Stripe.</span></div>{error ? <p className="mt-4 text-xs text-red-700">{error}</p> : null}</section>;

  return <div className="grid gap-6">
    {error ? <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}<button type="button" className="ml-auto" onClick={() => setError("")} aria-label="Dismiss"><X size={15} /></button></div> : null}
    {secret ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950"><div className="flex items-start gap-3"><ShieldCheck size={20} className="mt-0.5 shrink-0" /><div className="min-w-0"><strong>Copy this secret now.</strong><p className="mt-1 text-xs">For security reasons, OperiX will not show it again.</p><div className="mt-3 flex items-center gap-2"><code className="min-w-0 flex-1 overflow-x-auto rounded bg-white px-3 py-2 text-xs">{secret}</code><button type="button" className="btn shrink-0" onClick={() => void navigator.clipboard?.writeText(secret)}><Copy size={14} />Copy</button></div></div></div></div> : null}
    <section className="rounded-xl border border-[#dbe5f5] bg-[#f8fbff] p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#004ffe]">OperiX API Add-on</p><h2 className="mt-1 text-xl font-semibold">Developer access</h2><p className="muted mt-1 text-xs">€4.99/month · 5,000 live requests included. Automatic overage charging is not enabled.</p></div><a className="btn" href={`${helpCenterUrl}/en/api/`} target="_blank" rel="noreferrer"><BookOpen size={15} />Documentation</a></div><div className="mt-5 grid gap-3 sm:grid-cols-4"><Metric label="Current period" value={`${used.toLocaleString()} / ${included.toLocaleString()}`} detail={`${percent}% of included`} /><Metric label="Today" value={(summary.usage.requests_today || 0).toLocaleString()} detail="Live requests" /><Metric label="Successful" value={(summary.usage.successful || 0).toLocaleString()} detail="HTTP < 400" /><Metric label="Failed" value={(summary.usage.failed || 0).toLocaleString()} detail="HTTP 400+" /></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-[#e6ebf3]"><div className={`h-full rounded-full ${percent >= 90 ? "bg-amber-500" : "bg-[#004ffe]"}`} style={{ width: `${percent}%` }} /></div></section>
    <section className="rounded-xl border border-[#dbe5f5] p-5 sm:p-6"><SectionHeading icon={<KeyRound size={17} />} title="API keys" text="Secrets are displayed once. Use live keys only from a trusted backend or serverless function." /><form className="mt-5 grid gap-3 rounded-lg bg-[#f7f9fc] p-4 md:grid-cols-[1fr_130px_190px_auto]" onSubmit={createKey}><input className="input" required placeholder="Website Production" value={keyForm.name} onChange={event => setKeyForm(current => ({ ...current, name: event.target.value }))} /><select className="select" value={keyForm.environment} onChange={event => setKeyForm(current => ({ ...current, environment: event.target.value as "test" | "live" }))}><option value="test">Test</option><option value="live">Live</option></select><input className="input" type="datetime-local" aria-label="Optional expiration" title="Optional expiration" value={keyForm.expires_at} onChange={event => setKeyForm(current => ({ ...current, expires_at: event.target.value }))} /><button className="btn btn-primary" type="submit" disabled={busy === "key" || keyForm.scopes.length === 0}>{busy === "key" ? "Creating…" : "Create API key"}</button><div className="md:col-span-4 flex flex-wrap gap-x-4 gap-y-2">{availableScopes.map(scope => <label key={scope} className="flex items-center gap-2 text-[11px]"><input type="checkbox" checked={keyForm.scopes.includes(scope)} onChange={() => toggleScope(scope)} />{scope}</label>)}</div></form><div className="mt-4 grid gap-2">{summary.keys.map(key => <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#e6ebf3] p-3 text-xs" key={key.id}><span className={`rounded-full px-2 py-1 font-medium ${key.environment === "live" ? "bg-[#eaf7ef] text-[#087443]" : "bg-[#edf4ff] text-[#004ffe]"}`}>{key.environment}</span><strong>{key.name}</strong><code className="text-[11px]">{key.key_prefix}</code><span className="muted">Last used {formatDate(key.last_used_at)}</span><span className="muted">{key.expires_at ? `Expires ${formatDate(key.expires_at)}` : "No expiry"}</span><span className="muted">{key.revoked_at ? "Revoked" : `Created ${formatDate(key.created_at)}`}</span><div className="ml-auto flex gap-1"><button className="btn h-8 px-2" type="button" title="Rotate" onClick={() => void keyAction(key.id, "rotate")} disabled={Boolean(key.revoked_at) || busy === `rotate-${key.id}`}><RotateCw size={14} /></button><button className="btn h-8 px-2 text-red-700" type="button" title="Revoke" onClick={() => void keyAction(key.id, "revoke")} disabled={Boolean(key.revoked_at) || busy === `revoke-${key.id}`}><Trash2 size={14} /></button></div></div>)}</div></section>
    <section className="rounded-xl border border-[#dbe5f5] p-5 sm:p-6"><SectionHeading icon={<Webhook size={17} />} title="Webhooks" text="Signed HTTPS deliveries use timestamped HMAC signatures and retry with exponential backoff." /><form className="mt-5 grid gap-3 rounded-lg bg-[#f7f9fc] p-4 md:grid-cols-[1fr_1fr_130px_auto]" onSubmit={createWebhook}><input className="input" required placeholder="Website events" value={webhookForm.name} onChange={event => setWebhookForm(current => ({ ...current, name: event.target.value }))} /><input className="input" required type="url" placeholder="https://example.com/webhooks/operix" value={webhookForm.url} onChange={event => setWebhookForm(current => ({ ...current, url: event.target.value }))} /><select className="select" value={webhookForm.environment} onChange={event => setWebhookForm(current => ({ ...current, environment: event.target.value as "test" | "live" }))}><option value="test">Test</option><option value="live">Live</option></select><button className="btn btn-primary" type="submit" disabled={busy === "webhook" || webhookForm.events.length === 0}>{busy === "webhook" ? "Adding…" : "Add endpoint"}</button><div className="md:col-span-4 flex max-h-28 flex-wrap gap-x-4 gap-y-2 overflow-y-auto">{PUBLIC_WEBHOOK_EVENTS.map(event => <label key={event} className="flex items-center gap-2 text-[11px]"><input type="checkbox" checked={webhookForm.events.includes(event)} onChange={() => toggleEvent(event)} />{event}</label>)}</div></form><div className="mt-4 grid gap-2">{summary.webhooks.map(endpoint => <div className="rounded-lg border border-[#e6ebf3] p-3 text-xs" key={endpoint.id}><div className="flex flex-wrap items-center gap-2"><span className={`h-2 w-2 rounded-full ${endpoint.status === "active" ? "bg-[#12b76a]" : "bg-amber-500"}`} /><strong>{endpoint.name}</strong><span className="rounded-full bg-[#edf4ff] px-2 py-1 text-[11px]">{endpoint.environment}</span><span className="muted">{endpoint.status}</span><div className="ml-auto flex gap-1"><button className="btn h-8 px-2" type="button" title="Rotate secret" onClick={() => void webhookAction(endpoint.id, "rotate")}><RotateCw size={14} /></button><button className="btn h-8 px-2" type="button" onClick={() => void webhookAction(endpoint.id, endpoint.status === "active" ? "disable" : "enable")}>{endpoint.status === "active" ? "Disable" : "Enable"}</button><button className="btn h-8 px-2 text-red-700" type="button" onClick={() => void webhookAction(endpoint.id, "delete")}><Trash2 size={14} /></button></div></div><p className="mt-2 break-all text-[11px]">{endpoint.endpoint_url}</p><p className="muted mt-1 text-[11px]">{endpoint.subscribed_events.length} events · {endpoint.failure_count} failures · Last delivery {formatDate(endpoint.last_delivery_at)}</p></div>)}<div className="mt-5 border-t border-[#e6ebf3] pt-4"><div className="flex items-center justify-between gap-3"><h4 className="text-xs font-semibold">Recent deliveries</h4><span className="muted text-[11px]">Status, response, and attempts</span></div><div className="mt-3 grid gap-2">{summary.deliveries.slice(0, 20).map(delivery => <div className="grid gap-2 rounded-lg border border-[#eef1f6] p-3 text-[11px] sm:grid-cols-[1fr_auto_auto_auto] sm:items-center" key={delivery.id}><div><strong>{summary.webhooks.find(endpoint => endpoint.id === delivery.endpoint_id)?.name || "Webhook endpoint"}</strong><p className="muted mt-1">{delivery.status} · attempt {delivery.attempt} · {delivery.status_code ?? "—"} · {delivery.response_time_ms === null ? "—" : delivery.response_time_ms + "ms"}</p>{delivery.error_message ? <p className="mt-1 text-red-700">{delivery.error_message}</p> : null}</div><span className="muted">{formatDate(delivery.delivered_at || delivery.created_at)}</span>{["failed", "exhausted"].includes(delivery.status) ? <button className="btn h-8 px-2" type="button" disabled={busy === "retry-" + delivery.id} onClick={() => void retryDelivery(delivery.endpoint_id, delivery.id)}><RefreshCw size={13} />Retry</button> : <span />}</div>)}</div>{summary.deliveries.length === 0 ? <p className="muted mt-3 text-xs">No webhook deliveries have been recorded.</p> : null}</div></div></section>
    <section className="grid gap-6 lg:grid-cols-2"><section className="rounded-xl border border-[#dbe5f5] p-5 sm:p-6"><SectionHeading icon={<Link2 size={17} />} title="Top endpoints" text="Aggregated live usage for the current billing period." /><div className="mt-4 grid gap-2">{summary.usage.top_endpoints.length ? summary.usage.top_endpoints.map(item => <div className="flex items-center justify-between gap-4 text-xs" key={item.endpoint}><code className="min-w-0 overflow-x-auto">{item.endpoint}</code><strong>{item.requests.toLocaleString()}</strong></div>) : <p className="muted text-xs">No live API traffic in this period.</p>}</div></section><section className="rounded-xl border border-[#dbe5f5] p-5 sm:p-6"><SectionHeading icon={<ShieldCheck size={17} />} title="Recent request logs" text="Bodies and secrets are never shown here." /><div className="mt-4 grid gap-2">{summary.logs.slice(0, 8).map(log => <div className="grid grid-cols-[auto_1fr_auto] gap-3 text-xs" key={log.request_id}><code>{log.request_id}</code><span className="min-w-0 truncate">{log.method} {log.endpoint}</span><span className={log.response_status >= 400 ? "text-red-700" : "text-[#087443]"}>{log.response_status} · {log.duration_ms}ms</span></div>)}</div></section></section>
  </div>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="rounded-lg border border-[#dbe5f5] bg-white p-3"><p className="muted text-[11px]">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p><p className="muted mt-1 text-[11px]">{detail}</p></div>; }
function SectionHeading({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="flex items-start gap-3"><span className="text-[#004ffe]">{icon}</span><div><h3 className="text-sm font-semibold">{title}</h3><p className="muted mt-1 text-xs">{text}</p></div></div>; }
