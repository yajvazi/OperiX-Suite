"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, ArrowDownUp, ArrowLeft, CreditCard, HandCoins, Landmark, WalletCards } from "lucide-react";
import {
  createAgentAdvance, createAgentSettlement, createFundTransfer, createPostCodSettlement, createStripePayoutSettlement,
  listCompanyAgents, listFundBalances,
} from "@invoice-monorepo/api/repositories";
import type { AgentAdvance, AgentSettlement, CompanyAgent, FundBalance, PostCodSettlement, StripePayoutSettlement } from "@invoice-monorepo/types";
import { useWorkspace } from "@/hooks/use-workspace";
import { createClient } from "@/lib/supabase/client";
import { getUiLanguage } from "@/lib/i18n/language";
import { money } from "@/lib/format";
import { ErrorState, MetricCard, PageHeader } from "./ui";

type Row = Record<string, unknown>;
type Sale = { user_id: string; company_id: string; total_amount: number | string | null; payment_method?: string | null; type?: string | null; status?: string | null; post_cod?: boolean | null };
type Dialog = "transfer" | "advance" | "settlement" | "post_cod" | "stripe_payout" | null;
type Activity = { id: string; kind: string; title: string; detail: string; date: string; amount: number; negative: boolean };

const SALE_TYPES = ["INVOICE", "FINAL_INVOICE", "ADVANCE_INVOICE", "SIMPLIFIED_INVOICE"];
const VOID_STATUSES = ["CANCELLED", "CREDITED", "REVERSED"];
const today = () => new Date().toISOString().slice(0, 10);
const fundKey = (fund?: FundBalance | null) => (fund ? `${fund.company_id}:${fund.id}` : "");
const agentName = (agent: CompanyAgent) => [agent.first_name, agent.last_name].filter(Boolean).join(" ").trim() || agent.email || agent.user_id;
const missingTable = (error: { code?: string | null; message?: string | null } | null, table: string) => Boolean(error && (error.code === "PGRST205" || error.message?.includes(table)));

const SQ: Record<string, string> = {
  "Cash balances": "Gjendjet e arkës", "Cash accounts, bank accounts, agent advances and cash on delivery.": "Arkat, llogaritë bankare, paradhëniet e agjentëve dhe pagesa me dorëzim.",
  "Cash & Bank": "Arka dhe Banka", "Total available funds": "Totali i mjeteve në dispozicion", "Move money": "Lëviz para", "Cash account": "Arkë", "Bank account": "Llogari bankare",
  "Agent": "Agjenti", "All agents": "Të gjithë agjentët", "Agent sales": "Shitjet e agjentit", "Agent outstanding": "Detyrimi i agjentit", "Documents sold": "Dokumente të shitura",
  "Settled": "Të shlyera", "Advances": "Paradhënie", "View agent activity": "Shiko aktivitetin e agjentit", "Agent advance": "Paradhënie për agjent", "Settle agent": "Shlyej agjentin",
  "Cash on delivery (COD)": "Pagesa me dorëzim (COD)", "Delivered orders waiting for the post office to pay out.": "Porosi të dorëzuara që presin pagesën nga posta.",
  "Settle COD": "Shlyej COD", "Stripe payouts": "Pagesat nga Stripe", "Reconcile Stripe payout": "Rakordo pagesën nga Stripe", "Net received": "Neto e pranuar",
  "From account": "Nga llogaria", "To account": "Te llogaria", "Account": "Llogaria", "Amount": "Shuma", "Date": "Data", "Note (optional)": "Shënim (opsionale)", "Cancel": "Anulo", "Save": "Ruaj",
  "Payout amount": "Shuma e pagesës", "Bank fee": "Tarifa e bankës", "Stripe balance": "Bilanci i Stripe", "Receiving account": "Llogaria pritëse",
  "Move money between accounts": "Lëvizni para mes llogarive", "Give an advance to the agent": "Jepni një paradhënie agjentit", "Settle the agent's cash": "Shlyeni parat e agjentit",
  "Settle cash on delivery": "Shlyeni pagesat me dorëzim", "Reconcile a Stripe payout": "Rakordoni një pagesë nga Stripe",
  "Back to Cash & Bank": "Kthehu te Arka dhe Banka", "No fund accounts yet.": "Nuk ka ende llogari mjetesh.", "Loading…": "Po ngarkohet…",
  "Agent activity": "Aktiviteti i agjentit", "No activity for this agent.": "Nuk ka aktivitet për këtë agjent.", "Pending": "Në pritje", "Close": "Mbyll",
  "Saved.": "U ruajt.", "Payment permission is required.": "Kërkohet leja për pagesa.", "Enter an amount greater than zero.": "Shkruani një shumë më të madhe se zero.",
  "Choose an account.": "Zgjidhni një llogari.", "Choose two different accounts.": "Zgjidhni dy llogari të ndryshme.", "The amount exceeds the available balance.": "Shuma tejkalon gjendjen në dispozicion.",
  "The amount exceeds what is outstanding.": "Shuma tejkalon atë që mbetet pa u shlyer.", "Invoices": "Faturat", "Payments": "Pagesat", "Expenses": "Shpenzimet",
  "Invoice": "Fatura", "Payment": "Pagesa", "Expense": "Shpenzim", "Settlement": "Shlyerje", "Advance": "Paradhënie", "Open": "Hap",
};
const tr = (lang: "en" | "sq", text: string) => (lang === "sq" ? SQ[text] ?? text : text);

export function CashBalancesView() {
  const workspace = useWorkspace();
  const lang = getUiLanguage();
  const tt = (text: string) => tr(lang, text);
  const canAct = workspace.can("payment.create");
  const [funds, setFunds] = useState<FundBalance[]>([]);
  const [agents, setAgents] = useState<CompanyAgent[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [settlements, setSettlements] = useState<AgentSettlement[]>([]);
  const [advances, setAdvances] = useState<AgentAdvance[]>([]);
  const [codSettlements, setCodSettlements] = useState<PostCodSettlement[]>([]);
  const [stripeSettlements, setStripeSettlements] = useState<StripePayoutSettlement[]>([]);
  const [agentId, setAgentId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ source: "", target: "", fund: "", stripe: "", amount: "", fee: "", date: today(), note: "" });
  const [activity, setActivity] = useState<Activity[] | null>(null);

  const load = useCallback(async () => {
    if (workspace.loading || !workspace.companyIds.length) return;
    const supabase = createClient();
    if (!supabase) { setError("Supabase is not configured."); setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const ids = workspace.companyIds;
      const [rows, salesResult, settlementResult, advanceResult, codResult, stripeResult] = await Promise.all([
        listFundBalances(supabase, ids),
        supabase.from("invoices").select("user_id,total_amount,company_id,accounting_state,type,status,post_cod,payment_method").in("company_id", ids).eq("accounting_state", "posted"),
        supabase.from("agent_settlements").select("*").in("company_id", ids).eq("status", "active").order("created_at", { ascending: false }),
        supabase.from("agent_advances").select("*").in("company_id", ids).eq("status", "active").order("created_at", { ascending: false }),
        supabase.from("post_cod_settlements").select("*").in("company_id", ids).eq("status", "active").order("created_at", { ascending: false }),
        supabase.from("stripe_payout_settlements").select("*").in("company_id", ids).eq("status", "active").order("created_at", { ascending: false }),
      ]);
      if (settlementResult.error && !missingTable(settlementResult.error, "agent_settlements")) throw settlementResult.error;
      if (advanceResult.error) throw advanceResult.error;
      if (codResult.error && !missingTable(codResult.error, "post_cod_settlements")) throw codResult.error;
      if (stripeResult.error && !missingTable(stripeResult.error, "stripe_payout_settlements")) throw stripeResult.error;
      let agentRows: CompanyAgent[] = [];
      try {
        const groups = await Promise.all(ids.map((id) => listCompanyAgents(supabase, id)));
        agentRows = Array.from(new Map(groups.flat().filter((agent) => agent.user_id).map((agent) => [agent.user_id, agent])).values());
      } catch { /* agents are optional */ }
      setFunds(rows);
      setAgents(agentRows);
      setSales((salesResult.data || []) as Sale[]);
      setSettlements((settlementResult.data || []) as AgentSettlement[]);
      setAdvances((advanceResult.data || []) as AgentAdvance[]);
      setCodSettlements((codResult.data || []) as PostCodSettlement[]);
      setStripeSettlements((stripeResult.data || []) as StripePayoutSettlement[]);
      setAgentId((current) => current === "all" || agentRows.some((agent) => agent.user_id === current) ? current : "all");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The balances could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [workspace.companyIds, workspace.loading]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const total = useMemo(() => Array.from(new Map(funds.map((fund) => [fund.id, fund])).values()).reduce((sum, fund) => sum + Number(fund.provider_available_balance ?? fund.available_balance ?? fund.balance ?? 0), 0), [funds]);
  const settlementFunds = useMemo(() => funds.filter((fund) => !fund.stripe_store_id && (fund.fund_type === "cash" || fund.fund_type === "bank")), [funds]);
  const stripeFunds = useMemo(() => funds.filter((fund) => Boolean(fund.stripe_store_id)), [funds]);
  const agent = agents.find((candidate) => candidate.user_id === agentId);
  const validSale = (sale: Sale) => SALE_TYPES.includes(String(sale.type || "").toUpperCase()) && !VOID_STATUSES.includes(String(sale.status || "").toUpperCase());
  const agentSales = useMemo(() => sales.filter((sale) => validSale(sale) && !sale.post_cod && String(sale.payment_method || "").toLowerCase() === "cash" && (agentId === "all" || sale.user_id === agentId)), [agentId, sales]);
  const codSales = useMemo(() => sales.filter((sale) => validSale(sale) && Boolean(sale.post_cod)), [sales]);
  const sum = (rows: Array<{ amount?: unknown; total_amount?: unknown }>, key: "amount" | "total_amount") => rows.reduce((acc, row) => acc + Number(row[key] || 0), 0);
  const settledTotal = sum(settlements.filter((row) => agentId === "all" || row.agent_user_id === agentId), "amount");
  const advancedTotal = sum(advances.filter((row) => agentId === "all" || row.agent_user_id === agentId), "amount");
  const agentOutstanding = Math.max(sum(agentSales, "total_amount") + advancedTotal - settledTotal, 0);
  const codSettledTotal = sum(codSettlements, "amount");
  const codOutstanding = Math.max(sum(codSales, "total_amount") - codSettledTotal, 0);
  const stripeNet = stripeSettlements.reduce((acc, row) => acc + Number(row.net_received || 0), 0);

  const agentOutstandingFor = (companyId: string) => {
    if (!agent) return 0;
    const own = (row: { company_id: string }) => row.company_id === companyId;
    const salesTotal = sum(agentSales.filter((sale) => own(sale) && sale.user_id === agent.user_id), "total_amount");
    return Math.max(salesTotal + sum(advances.filter((row) => own(row) && row.agent_user_id === agent.user_id), "amount") - sum(settlements.filter((row) => own(row) && row.agent_user_id === agent.user_id), "amount"), 0);
  };
  const codOutstandingFor = (companyId: string) => Math.max(sum(codSales.filter((sale) => sale.company_id === companyId), "total_amount") - sum(codSettlements.filter((row) => row.company_id === companyId), "amount"), 0);
  const pick = (key: string, list: FundBalance[]) => list.find((fund) => fundKey(fund) === key);

  function open(next: Exclude<Dialog, null>) {
    setMessage("");
    const cash = settlementFunds.find((fund) => fund.fund_type === "cash") || settlementFunds[0];
    const base = { ...form, amount: "", fee: "", date: today(), note: "", fund: fundKey(cash) };
    if (next === "transfer") Object.assign(base, { source: fundKey(funds[0]), target: fundKey(funds[1]) });
    if (next === "settlement") base.amount = agentOutstandingFor(cash?.company_id || "").toFixed(2);
    if (next === "post_cod") base.amount = codOutstandingFor(cash?.company_id || "").toFixed(2);
    if (next === "stripe_payout") Object.assign(base, { stripe: fundKey(stripeFunds[0]), fund: fundKey(settlementFunds.find((fund) => fund.company_id === stripeFunds[0]?.company_id) || cash) });
    setForm(base);
    setDialog(next);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canAct) { setMessage(tt("Payment permission is required.")); return; }
    const supabase = createClient();
    if (!supabase || !dialog) return;
    const value = Number(form.amount.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) { setMessage(tt("Enter an amount greater than zero.")); return; }
    const key = crypto.randomUUID();
    setSaving(true); setMessage("");
    try {
      if (dialog === "transfer") {
        const source = pick(form.source, funds); const target = pick(form.target, funds);
        if (!source || !target || source.id === target.id) throw new Error(tt("Choose two different accounts."));
        if (value > Number(source.available_balance ?? source.balance)) throw new Error(tt("The amount exceeds the available balance."));
        await createFundTransfer(supabase, { sourceFundAccountId: source.id, targetFundAccountId: target.id, amount: value, transferDate: form.date, description: form.note, idempotencyKey: key });
      } else if (dialog === "stripe_payout") {
        const stripe = pick(form.stripe, stripeFunds); const bank = pick(form.fund, settlementFunds);
        const fee = Number(form.fee.replace(",", ".") || 0);
        if (!stripe || !bank) throw new Error(tt("Choose an account."));
        if (!Number.isFinite(fee) || fee < 0 || fee > value) throw new Error(tt("Enter an amount greater than zero."));
        await createStripePayoutSettlement(supabase, { companyId: stripe.company_id, stripeFundAccountId: stripe.id, bankFundAccountId: bank.id, payoutAmount: value, bankFee: fee, settlementDate: form.date, description: form.note, idempotencyKey: key });
      } else {
        const fund = pick(form.fund, settlementFunds);
        if (!fund) throw new Error(tt("Choose an account."));
        if (dialog === "advance") {
          if (!agent) throw new Error(tt("Agent"));
          if (value > Number(fund.available_balance ?? fund.balance) + 0.0001) throw new Error(tt("The amount exceeds the available balance."));
          await createAgentAdvance(supabase, { companyId: fund.company_id, agentUserId: agent.user_id, fundAccountId: fund.id, amount: value, advanceDate: form.date, description: form.note, idempotencyKey: key });
        } else if (dialog === "settlement") {
          if (!agent) throw new Error(tt("Agent"));
          if (value > agentOutstandingFor(fund.company_id) + 0.0001) throw new Error(tt("The amount exceeds what is outstanding."));
          await createAgentSettlement(supabase, { companyId: fund.company_id, agentUserId: agent.user_id, fundAccountId: fund.id, amount: value, settlementDate: form.date, description: form.note, idempotencyKey: key });
        } else {
          if (value > codOutstandingFor(fund.company_id) + 0.0001) throw new Error(tt("The amount exceeds what is outstanding."));
          await createPostCodSettlement(supabase, { companyId: fund.company_id, fundAccountId: fund.id, amount: value, settlementDate: form.date, description: form.note, idempotencyKey: key });
        }
      }
      setDialog(null);
      setMessage(tt("Saved."));
      await load();
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "The change could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function showActivity() {
    if (!agent) return;
    const supabase = createClient();
    if (!supabase) return;
    const ids = workspace.companyIds;
    const [invoices, payments, expenses] = await Promise.all([
      supabase.from("invoices").select("id,invoice_number,total_amount,created_at,post_cod,client:clients(name)").in("company_id", ids).eq("user_id", agent.user_id),
      supabase.from("payments").select("id,amount,created_at,client:clients(name)").in("company_id", ids).eq("user_id", agent.user_id),
      supabase.from("expenses").select("id,amount,category,description,created_at").in("company_id", ids).eq("user_id", agent.user_id),
    ]);
    const clientName = (row: Row) => String((row.client as Row | null)?.name || "—");
    const rows: Activity[] = [
      ...((invoices.data || []) as Row[]).filter((row) => !row.post_cod).map((row) => ({ id: `i${row.id}`, kind: "Invoice", title: `${tt("Invoice")} ${row.invoice_number || ""}`, detail: clientName(row), date: String(row.created_at), amount: Number(row.total_amount || 0), negative: false })),
      ...((payments.data || []) as Row[]).map((row) => ({ id: `p${row.id}`, kind: "Payment", title: tt("Payment"), detail: clientName(row), date: String(row.created_at), amount: Number(row.amount || 0), negative: false })),
      ...((expenses.data || []) as Row[]).map((row) => ({ id: `e${row.id}`, kind: "Expense", title: String(row.category || tt("Expense")), detail: String(row.description || ""), date: String(row.created_at), amount: Number(row.amount || 0), negative: true })),
      ...settlements.filter((row) => row.agent_user_id === agent.user_id).map((row) => ({ id: `s${row.id}`, kind: "Settlement", title: tt("Settlement"), detail: String(row.description || ""), date: String(row.created_at), amount: Number(row.amount || 0), negative: true })),
      ...advances.filter((row) => row.agent_user_id === agent.user_id).map((row) => ({ id: `a${row.id}`, kind: "Advance", title: tt("Advance"), detail: String(row.description || ""), date: String(row.created_at), amount: Number(row.amount || 0), negative: true })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setActivity(rows);
  }

  const header = <PageHeader title={tt("Cash balances")} description={tt("Cash accounts, bank accounts, agent advances and cash on delivery.")} actions={<Link href="/cash-bank" className="btn"><ArrowLeft size={16} /> {tt("Back to Cash & Bank")}</Link>} />;
  if (loading || workspace.loading) return <div className="ux-page">{header}<div className="ux-state"><p>{tt("Loading…")}</p></div></div>;
  if (error) return <div className="ux-page">{header}<ErrorState message={error} onRetry={() => void load()} /></div>;

  const fundSelect = (value: string, onChange: (next: string) => void, list: FundBalance[]) => <select className="select" value={value} onChange={(event) => onChange(event.target.value)}>{list.map((fund) => <option key={fundKey(fund)} value={fundKey(fund)}>{fund.name} · {money(Number(fund.available_balance ?? fund.balance), fund.currency)}</option>)}</select>;
  const titles: Record<Exclude<Dialog, null>, string> = { transfer: "Move money between accounts", advance: "Give an advance to the agent", settlement: "Settle the agent's cash", post_cod: "Settle cash on delivery", stripe_payout: "Reconcile a Stripe payout" };

  return <div className="ux-page">
    {header}
    {message && !dialog ? <p className="mb-4 rounded-md bg-[#f0f6ff] p-3 text-xs" role="status">{message}</p> : null}
    <section className="grid gap-3 sm:grid-cols-3">
      <MetricCard label={tt("Total available funds")} value={money(total, funds[0]?.currency || "EUR")} icon={Landmark} tone="blue" />
      <MetricCard label={agentId === "all" ? tt("Agent sales") : tt("Agent outstanding")} value={money(agentOutstanding)} icon={HandCoins} tone="green" />
      <MetricCard label={tt("Cash on delivery (COD)")} value={money(codOutstanding)} icon={WalletCards} tone="amber" />
    </section>

    <div className="mt-4 flex flex-wrap gap-2">{canAct ? <button type="button" className="btn btn-primary" disabled={funds.length < 2} onClick={() => open("transfer")}><ArrowDownUp size={16} /> {tt("Move money")}</button> : null}</div>

    <section className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {funds.length === 0 ? <p className="muted text-sm">{tt("No fund accounts yet.")}</p> : funds.map((fund) => {
        const Icon = fund.stripe_store_id ? CreditCard : fund.fund_type === "cash" ? WalletCards : Landmark;
        const shown = fund.stripe_store_id && fund.provider_available_balance != null ? Number(fund.provider_available_balance) : Number(fund.available_balance ?? fund.balance);
        const company = workspace.companies.find((candidate) => candidate.id === fund.company_id);
        return <div key={fundKey(fund)} className="card flex items-center gap-3 p-4"><span className="reports-category-icon"><Icon size={19} /></span><span className="min-w-0 flex-1"><strong className="block truncate text-sm">{fund.name}</strong><small className="muted block text-xs">{workspace.isGroup ? `${String(company?.company_name || "")} · ` : ""}{fund.stripe_store_id ? tt("Stripe balance") : fund.fund_type === "cash" ? tt("Cash account") : tt("Bank account")}</small>{fund.stripe_store_id && fund.provider_pending_balance != null ? <small className="muted block text-xs">{tt("Pending")} {money(Number(fund.provider_pending_balance), fund.currency)}</small> : null}</span><strong className={`text-sm ${shown < 0 ? "text-red-600" : ""}`}>{money(shown, fund.currency)}</strong></div>;
      })}
    </section>

    <section className="card mt-6 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-sm font-bold">{agentId === "all" ? tt("Agent sales") : tt("Agent outstanding")}</h2><p className="muted mt-1 text-xs">{tt("Documents sold")}: {agentSales.length} · {tt("Settled")}: {money(settledTotal)} · {tt("Advances")}: {money(advancedTotal)}</p></div>
        {agents.length ? <label className="field min-w-56"><span>{tt("Agent")}</span><select className="select" value={agentId} onChange={(event) => { setAgentId(event.target.value); setActivity(null); }}><option value="all">{tt("All agents")}</option>{agents.map((candidate) => <option key={candidate.user_id} value={candidate.user_id}>{agentName(candidate)}</option>)}</select></label> : null}
      </div>
      <p className="mt-3 text-2xl font-bold">{money(agentOutstanding)}</p>
      {agent ? <div className="mt-3 flex flex-wrap gap-2"><button type="button" className="btn" onClick={() => void showActivity()}><Activity size={15} /> {tt("View agent activity")}</button>{canAct ? <><button type="button" className="btn" disabled={!settlementFunds.length} onClick={() => open("advance")}><WalletCards size={15} /> {tt("Agent advance")}</button><button type="button" className="btn btn-primary" disabled={agentOutstanding <= 0 || !settlementFunds.length} onClick={() => open("settlement")}><HandCoins size={15} /> {tt("Settle agent")}</button></> : null}</div> : null}
      {activity ? <div className="table-wrap mt-4"><div className="mb-2 flex items-center justify-between"><strong className="text-sm">{tt("Agent activity")} · {agent ? agentName(agent) : ""}</strong><button type="button" className="btn" onClick={() => setActivity(null)}>{tt("Close")}</button></div>{activity.length ? <table className="data-table"><tbody>{activity.map((row) => <tr key={row.id}><td>{row.title}</td><td>{row.detail}</td><td>{row.date.slice(0, 16).replace("T", " ")}</td><td className="numeric">{row.negative ? "-" : "+"}{money(row.amount)}</td></tr>)}</tbody></table> : <p className="muted text-sm">{tt("No activity for this agent.")}</p>}</div> : null}
    </section>

    <section className="card mt-4 p-4">
      <h2 className="text-sm font-bold">{tt("Cash on delivery (COD)")}</h2>
      <p className="muted mt-1 text-xs">{tt("Delivered orders waiting for the post office to pay out.")} · {tt("Documents sold")}: {codSales.length} · {tt("Settled")}: {money(codSettledTotal)}</p>
      <p className="mt-3 text-2xl font-bold">{money(codOutstanding)}</p>
      {canAct ? <button type="button" className="btn btn-primary mt-3" disabled={codOutstanding <= 0 || !settlementFunds.length} onClick={() => open("post_cod")}><HandCoins size={15} /> {tt("Settle COD")}</button> : null}
    </section>

    {stripeFunds.length || stripeSettlements.length ? <section className="card mt-4 p-4">
      <h2 className="text-sm font-bold">{tt("Stripe payouts")}</h2>
      <p className="muted mt-1 text-xs">{tt("Net received")}</p>
      <p className="mt-3 text-2xl font-bold">{money(stripeNet)}</p>
      {canAct ? <button type="button" className="btn btn-primary mt-3" disabled={!stripeFunds.length || !settlementFunds.length} onClick={() => open("stripe_payout")}><HandCoins size={15} /> {tt("Reconcile Stripe payout")}</button> : null}
    </section> : null}

    {dialog ? <div className="resource-modal-backdrop" onMouseDown={() => !saving && setDialog(null)}><form className="resource-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()} onSubmit={save}>
      <h2 className="text-base font-bold">{tt(titles[dialog])}</h2>
      <div className="mt-4 grid gap-3">
        {dialog === "transfer" ? <><label className="field"><span>{tt("From account")}</span>{fundSelect(form.source, (next) => setForm({ ...form, source: next }), funds)}</label><label className="field"><span>{tt("To account")}</span>{fundSelect(form.target, (next) => setForm({ ...form, target: next }), funds)}</label></> : null}
        {dialog === "stripe_payout" ? <><label className="field"><span>{tt("Stripe balance")}</span>{fundSelect(form.stripe, (next) => setForm({ ...form, stripe: next }), stripeFunds)}</label><label className="field"><span>{tt("Receiving account")}</span>{fundSelect(form.fund, (next) => setForm({ ...form, fund: next }), settlementFunds)}</label></> : null}
        {dialog === "advance" || dialog === "settlement" || dialog === "post_cod" ? <label className="field"><span>{tt("Account")}</span>{fundSelect(form.fund, (next) => setForm({ ...form, fund: next, amount: dialog === "advance" ? form.amount : (dialog === "settlement" ? agentOutstandingFor(pick(next, settlementFunds)?.company_id || "") : codOutstandingFor(pick(next, settlementFunds)?.company_id || "")).toFixed(2) }), settlementFunds)}</label> : null}
        <label className="field"><span>{dialog === "stripe_payout" ? tt("Payout amount") : tt("Amount")}</span><input className="input" inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required /></label>
        {dialog === "stripe_payout" ? <label className="field"><span>{tt("Bank fee")}</span><input className="input" inputMode="decimal" value={form.fee} onChange={(event) => setForm({ ...form, fee: event.target.value })} /></label> : null}
        <label className="field"><span>{tt("Date")}</span><input className="input" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required /></label>
        <label className="field"><span>{tt("Note (optional)")}</span><input className="input" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
      </div>
      {message ? <p className="mt-3 rounded-md bg-[#fff8eb] p-2 text-xs text-[#b54708]" role="alert">{message}</p> : null}
      <div className="mt-4 flex justify-end gap-2"><button type="button" className="btn" disabled={saving} onClick={() => setDialog(null)}>{tt("Cancel")}</button><button type="submit" className="btn btn-primary" disabled={saving}>{tt("Save")}</button></div>
    </form></div> : null}
  </div>;
}
