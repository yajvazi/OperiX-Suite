"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowDownToLine, Landmark, Plus, RefreshCw } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { createClient } from "@/lib/supabase/client";
import { getLocalStore } from "@/lib/local/local-store";
import { OTHER_INCOME_CATEGORIES, localReportRows } from "@invoice-monorepo/data-store";
import { money } from "@/lib/format";
import { PageHeader } from "@/components/ui";

type Row = Record<string, unknown>;

export function FinanceOverview({ initialTab = "accounts" }: { initialTab?: "accounts" | "income" }) {
  const workspace = useWorkspace();
  const [tab, setTab] = useState(initialTab);
  const canViewIncome = workspace.can("payment.view");
  const canRecordIncome = workspace.can("payment.create");
  const activeTab = tab === "income" && !canViewIncome ? "accounts" : tab;
  const [accounts, setAccounts] = useState<Row[]>([]);
  const [income, setIncome] = useState<Row[]>([]);
  const [categories, setCategories] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ categoryId: "", date: new Date().toISOString().slice(0, 10), payer: "", description: "", net: "", vat: "", accountId: "", reference: "" });

  const load = useCallback(async () => {
    if (!workspace.companyIds.length) return;
    const supabase = createClient();
    if (!supabase) return;
    setLoading(true);
    if (workspace.storage === "local") {
      const store = await getLocalStore();
      const flow = await localReportRows(store, "operix_cash_flow");
      const balance = (type: string) => flow.filter((row) => row.cash_account_type === type).reduce((sum, row) => sum + Number(row.net_change || 0), 0);
      const bankAccounts = (await store.list("company_bank_accounts")).filter((row) => row.is_active !== false);
      const tagged = new Map<string, number>();
      for (const payment of await store.listPayments()) if (payment.payment_method !== "cash" && payment.company_bank_account_id) tagged.set(String(payment.company_bank_account_id), (tagged.get(String(payment.company_bank_account_id)) || 0) + Number(payment.amount || 0));
      const taggedTotal = [...tagged.values()].reduce((sum, value) => sum + value, 0);
      const localAccounts = [
        { id: "cash", name: "Cash", account_type: "cash", currency: "EUR", company_id: store.companyId, current_balance: balance("cash") },
        ...bankAccounts.map((row) => ({ id: String(row.id), name: [row.bank_name, row.account_name || row.iban || row.account_number].filter(Boolean).join(" · ") || "Bank account", account_type: "bank", currency: String(row.currency || "EUR"), company_id: store.companyId, current_balance: tagged.get(String(row.id)) || 0 })),
        { id: "bank", name: bankAccounts.length ? "Bank · other movements" : "Bank", account_type: "bank", currency: "EUR", company_id: store.companyId, current_balance: balance("bank") - taggedTotal },
      ] as Row[];
      setAccounts(localAccounts);
      setIncome((await store.list("other_income", { orderBy: "-income_date" })) as unknown as Row[]);
      setCategories(OTHER_INCOME_CATEGORIES.map((row) => ({ id: row.category_key, ...row })) as unknown as Row[]);
      setForm((current) => ({ ...current, categoryId: current.categoryId || "other_income", accountId: current.accountId || "cash" }));
      setMessage("");
      setLoading(false);
      return;
    }
    const [accountResult, incomeResult, categoryResult] = await Promise.all([
      supabase.from("operix_financial_account_balances").select("*").in("company_id", workspace.companyIds).order("account_type").order("name"),
      supabase.from("other_income").select("*,category:other_income_categories(name_en,name_sq)").in("company_id", workspace.companyIds).order("income_date", { ascending: false }),
      supabase.from("other_income_categories").select("*").eq("active", true).or(`company_id.is.null,company_id.eq.${workspace.companyId}`),
    ]);
    setAccounts((accountResult.data || []) as Row[]);
    setIncome((incomeResult.data || []) as Row[]);
    setCategories((categoryResult.data || []) as Row[]);
    setForm((current) => ({ ...current, categoryId: current.categoryId || String(categoryResult.data?.[0]?.id || ""), accountId: current.accountId || String(accountResult.data?.[0]?.id || "") }));
    setMessage(accountResult.error?.message || incomeResult.error?.message || "");
    setLoading(false);
  }, [workspace.companyId, workspace.companyIds, workspace.storage]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canRecordIncome) { setMessage("Payment permission is required to record other income."); return; }
    if (!workspace.companyId || !form.categoryId || !form.accountId || !form.description || Number(form.net) <= 0) return;
    const supabase = createClient();
    if (!supabase) return;
    setWorking(true); setMessage("");
    if (workspace.storage === "local") {
      try {
        const store = await getLocalStore();
        const category = categories.find((row) => String(row.id) === form.categoryId);
        const net = Number(form.net); const vat = Number(form.vat || 0);
        await store.save("other_income", { income_number: await store.reserveSeriesNumber("INC", form.date.slice(0, 4)), category_id: form.categoryId, category: category ? { name_en: category.name_en, name_sq: category.name_sq } : null, income_date: form.date, payer_source: form.payer || null, description: form.description.trim(), currency: "EUR", net_amount: net, vat_amount: vat, gross_amount: Math.round((net + vat) * 100) / 100, tax_treatment: "review_required", payment_method: form.accountId === "cash" ? "cash" : "bank", reference: form.reference || null, notes: null });
        setMessage("Other income recorded. Tax treatment remains Review Required until confirmed.");
        setForm((current) => ({ ...current, payer: "", description: "", net: "", vat: "", reference: "" }));
        await load();
      } catch (error) { setMessage(error instanceof Error ? error.message : "The income could not be saved."); }
      setWorking(false);
      return;
    }
    const { error } = await supabase.rpc("record_other_income", { p_company_id: workspace.companyId, p_category_id: form.categoryId, p_income_date: form.date, p_payer_source: form.payer || null, p_description: form.description, p_currency: "EUR", p_net_amount: Number(form.net), p_vat_amount: Number(form.vat || 0), p_tax_treatment: "review_required", p_payment_method: "bank", p_fund_account_id: form.accountId, p_reference: form.reference || null, p_notes: null, p_attachment_id: null, p_idempotency_key: crypto.randomUUID() });
    if (error) setMessage(error.message); else { setMessage("Other income recorded. Tax treatment remains Review Required until confirmed."); setForm((current) => ({ ...current, payer: "", description: "", net: "", vat: "", reference: "" })); await load(); }
    setWorking(false);
  }

  // In a parent workspace the accounts of every workspace in scope are shown, one block per workspace.
  // An account is listed once: by its own id, and a shared bank account only under the workspace that owns it.
  const seen = new Set<string>();
  const uniqueAccounts = [...accounts].sort((left, right) => Number(Boolean(right.company_id === workspace.companyId)) - Number(Boolean(left.company_id === workspace.companyId))).filter((account) => {
    const keys = [`id:${String(account.id)}`, account.company_bank_account_id ? `bank:${String(account.company_bank_account_id)}` : ""].filter(Boolean);
    if (keys.some((key) => seen.has(key))) return false;
    keys.forEach((key) => seen.add(key));
    return true;
  });
  const companyGroups = workspace.companyIds.map((id) => {
    const companyAccounts = uniqueAccounts.filter((account) => String(account.company_id) === id);
    const currencies = new Set(companyAccounts.map((account) => String(account.currency || "EUR")));
    const company = workspace.companies.find((candidate) => candidate.id === id);
    return { id, name: String(company?.company_name || company?.name || "Workspace"), accounts: companyAccounts, currency: [...currencies][0] || "EUR", total: currencies.size === 1 ? companyAccounts.reduce((sum, account) => sum + Number(account.current_balance || 0), 0) : null };
  }).filter((group) => group.accounts.length);

  return <div className="ux-page">
    <PageHeader title={activeTab === "income" ? "Other Income" : "Cash & Bank"} description={activeTab === "income" ? "Non-invoice income is kept separate from sales revenue and customer settlements." : "Actual account movements, current balances, and reconciliation visibility."} actions={<><button className="btn" onClick={() => void load()} disabled={loading}><RefreshCw size={16} className={loading ? "animate-spin" : ""}/>Refresh</button></>} />
    <div className="card mt-5 flex gap-1 p-1.5"><button className={`btn ${activeTab === "accounts" ? "btn-primary" : ""}`} onClick={() => setTab("accounts")}><Landmark size={15}/>Cash & Bank</button>{canViewIncome ? <button className={`btn ${activeTab === "income" ? "btn-primary" : ""}`} onClick={() => setTab("income")}><Plus size={15}/>Other Income</button> : null}</div>
    {message ? <p className="mt-4 rounded-md bg-[#fff8eb] p-3 text-xs text-[#b54708]">{message}</p> : null}
    {activeTab === "accounts" ? <div className="mt-5 grid gap-6">{companyGroups.map((group) => <section key={group.id}>{workspace.isGroup ? <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-sm font-semibold">{group.name}</h2><span className="muted text-xs">{group.accounts.length} account{group.accounts.length === 1 ? "" : "s"}{group.total !== null ? <> · Total <b>{money(group.total, group.currency)}</b></> : null}</span></div> : null}<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{group.accounts.map((account) => <article className="card p-5" key={String(account.id)}><div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-[#edf4ff] text-[#004ffe]"><Landmark size={19}/></span><div><h2 className="font-semibold">{String(account.name)}</h2><p className="muted mt-1 text-xs">{String(account.account_type || account.fund_type)} · {String(account.currency)}</p></div></div><strong className="mt-5 block text-2xl">{money(Number(account.current_balance || 0), String(account.currency || "EUR"))}</strong><div className="mt-4 grid grid-cols-2 gap-2 text-xs"><span className="rounded-md bg-[#f7f9fc] p-2">Reconciled<br/><b>{money(Number(account.reconciled_balance || 0), String(account.currency || "EUR"))}</b></span><span className="rounded-md bg-[#f7f9fc] p-2">Unreconciled<br/><b>{money(Number(account.unreconciled_balance || 0), String(account.currency || "EUR"))}</b></span></div></article>)}</div></section>)}{!uniqueAccounts.length && !loading ? <p className="muted">No financial accounts are configured.</p> : null}</div> : <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]"><form className="card grid gap-3 p-5" onSubmit={submit}><h2 className="font-semibold">Record Other Income</h2><label className="field"><span>Category</span><select className="select" value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}>{categories.map((category) => <option key={String(category.id)} value={String(category.id)}>{String(category.name_en)}</option>)}</select></label><label className="field"><span>Payer / Source</span><input className="input" value={form.payer} onChange={(event) => setForm({ ...form, payer: event.target.value })}/></label><label className="field"><span>Description</span><input className="input" required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })}/></label><div className="grid grid-cols-2 gap-3"><label className="field"><span>Net amount</span><input className="input" required type="number" min="0.01" step="0.0001" value={form.net} onChange={(event) => setForm({ ...form, net: event.target.value })}/></label><label className="field"><span>VAT amount</span><input className="input" type="number" min="0" step="0.0001" value={form.vat} onChange={(event) => setForm({ ...form, vat: event.target.value })}/></label></div><label className="field"><span>Income date</span><input className="input" type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })}/></label><label className="field"><span>Destination account</span><select className="select" value={form.accountId} onChange={(event) => setForm({ ...form, accountId: event.target.value })}>{accounts.map((account) => <option key={String(account.id)} value={String(account.id)}>{String(account.name)} · {String(account.currency)}</option>)}</select></label><label className="field"><span>Reference</span><input className="input" value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })}/></label><p className="text-xs text-[#b54708]">Tax treatment: Review Required. Confirm the Kosovo treatment before filing.</p><button className="btn btn-primary" disabled={working || !canRecordIncome}><Plus size={15}/>{working ? "Saving…" : canRecordIncome ? "Save Other Income" : "Payment permission required"}</button></form><section className="card overflow-hidden"><div className="border-b p-5 font-semibold">Other Income History</div>{income.map((row) => <div className="flex flex-wrap items-center gap-3 border-b p-4 text-sm last:border-0" key={String(row.id)}><span className="grid h-8 w-8 place-items-center rounded-md bg-[#ecfdf3] text-[#027a48]"><ArrowDownToLine size={15}/></span><span className="min-w-0 flex-1"><b className="block">{String(row.description)}</b><small className="muted">{String(row.income_number)} · {String(row.income_date)} · {String((row.category as Row | null)?.name_en || "Other Income")}</small></span><b>{money(Number(row.gross_amount || 0), String(row.currency || "EUR"))}</b></div>)}{!income.length ? <p className="muted p-5">No other income records yet.</p> : null}</section></div>}
  </div>;
}
