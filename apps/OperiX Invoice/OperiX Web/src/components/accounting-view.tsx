"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BookOpenCheck,
  CalendarRange,
  CheckCircle2,
  CircleDollarSign,
  FilePlus2,
  Loader2,
  LockKeyhole,
  Plus,
  RefreshCw,
  RotateCcw,
  Scale,
} from "lucide-react";
import {
  journalTotals,
  validateJournalDraft,
  type AccountingAccount,
  type AccountingPeriod,
  type JournalEntry,
  type JournalLineDraft,
  type TrialBalanceRow,
} from "@invoice-monorepo/accounting";
import { useWorkspace } from "@/hooks/use-workspace";
import { money } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

type Tab = "overview" | "accounts" | "journals" | "periods" | "rules";
type PostingRule = {
  id: string;
  event_type: string;
  name: string;
  version: number;
  effective_from: string;
  effective_until: string | null;
  active: boolean;
  metadata: Record<string, unknown>;
};

const copy = {
  en: {
    title: "Accounting",
    subtitle: "Double-entry journals, periods, ledgers and configurable posting rules.",
    overview: "Overview",
    accounts: "Chart of accounts",
    journals: "Journal entries",
    periods: "Accounting periods",
    rules: "Posting rules",
    initialize: "Initialize accounting",
    initializeText:
      "Create the Kosovo-oriented starter chart, the fiscal year, monthly periods and reviewable posting mappings.",
    review:
      "Starter mappings require review by a qualified Kosovo accountant before production posting.",
    debit: "Debit",
    credit: "Credit",
    balance: "Balance",
    createJournal: "New journal",
    post: "Post",
    reverse: "Reverse",
    refresh: "Refresh",
    empty: "No accounting records yet.",
  },
  sq: {
    title: "Kontabiliteti",
    subtitle: "Ditarët me hyrje të dyfishtë, periudhat, librat dhe rregullat e konfigurueshme.",
    overview: "Përmbledhje",
    accounts: "Plani kontabël",
    journals: "Regjistrimet në ditar",
    periods: "Periudhat kontabël",
    rules: "Rregullat e regjistrimit",
    initialize: "Inicializo kontabilitetin",
    initializeText:
      "Krijo planin fillestar të orientuar për Kosovë, vitin fiskal, periudhat mujore dhe hartëzimet për shqyrtim.",
    review:
      "Hartëzimet fillestare duhet të shqyrtohen nga një kontabilist i kualifikuar në Kosovë para përdorimit në prodhim.",
    debit: "Debit",
    credit: "Kredit",
    balance: "Gjendja",
    createJournal: "Ditar i ri",
    post: "Posto",
    reverse: "Storno",
    refresh: "Rifresko",
    empty: "Ende nuk ka të dhëna kontabël.",
  },
  sr: {
    title: "Računovodstvo",
    subtitle: "Dvojno knjigovodstvo, periodi, glavna knjiga i pravila knjiženja.",
    overview: "Pregled",
    accounts: "Kontni plan",
    journals: "Dnevnik",
    periods: "Računovodstveni periodi",
    rules: "Pravila knjiženja",
    initialize: "Pokreni računovodstvo",
    initializeText: "Kreirajte početni kontni plan, fiskalnu godinu i mesečne periode.",
    review: "Početna mapiranja zahtevaju stručnu proveru pre produkcione upotrebe.",
    debit: "Duguje",
    credit: "Potražuje",
    balance: "Saldo",
    createJournal: "Novi dnevnik",
    post: "Knjiži",
    reverse: "Storniraj",
    refresh: "Osveži",
    empty: "Još nema računovodstvenih podataka.",
  },
} as const;

const emptyLine = (): JournalLineDraft => ({
  accountId: "",
  description: "",
  debit: "0",
  credit: "0",
});

export function AccountingView() {
  const workspace = useWorkspace();
  const locale = workspace.company?.default_language || "en";
  const t = copy[locale] || copy.en;
  const [tab, setTab] = useState<Tab>("overview");
  const [accounts, setAccounts] = useState<AccountingAccount[]>([]);
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [trialBalance, setTrialBalance] = useState<TrialBalanceRow[]>([]);
  const [rules, setRules] = useState<PostingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!workspace.companyId) return;
    const supabase = createClient();
    if (!supabase) return;
    setLoading(true);
    setError("");
    const companyId = workspace.companyId;
    const [accountResult, periodResult, journalResult, balanceResult, ruleResult] =
      await Promise.all([
        supabase
          .from("chart_of_accounts")
          .select("id,company_id,code,name,account_type,normal_balance,posting_allowed,active,currency")
          .eq("company_id", companyId)
          .order("code"),
        supabase
          .from("accounting_periods")
          .select("id,company_id,fiscal_year_id,period_number,name,start_date,end_date,status")
          .eq("company_id", companyId)
          .order("start_date", { ascending: false }),
        supabase
          .from("journal_entries")
          .select("id,company_id,entry_number,status,entry_type,posting_date,document_date,description,reference,currency,posted_at")
          .eq("company_id", companyId)
          .order("posting_date", { ascending: false })
          .limit(100),
        supabase.from("trial_balance").select("*").eq("company_id", companyId).order("account_code"),
        supabase
          .from("posting_rule_sets")
          .select("id,event_type,name,version,effective_from,effective_until,active,metadata")
          .eq("company_id", companyId)
          .order("event_type"),
      ]);
    const firstError =
      accountResult.error ||
      periodResult.error ||
      journalResult.error ||
      balanceResult.error ||
      ruleResult.error;
    if (firstError) setError(firstError.message);
    setAccounts((accountResult.data || []) as AccountingAccount[]);
    setPeriods((periodResult.data || []) as AccountingPeriod[]);
    setJournals((journalResult.data || []) as JournalEntry[]);
    setTrialBalance((balanceResult.data || []) as TrialBalanceRow[]);
    setRules((ruleResult.data || []) as PostingRule[]);
    setLoading(false);
  }, [workspace.companyId]);

  useEffect(() => {
    if (workspace.loading) return;
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [workspace.loading, load]);

  async function initialize() {
    if (!workspace.companyId) return;
    const supabase = createClient();
    if (!supabase) return;
    setWorking(true);
    setError("");
    const startMonth = workspace.company?.fiscal_year_start_month || 1;
    const year = new Date().getUTCFullYear();
    const startDate = `${year}-${String(startMonth).padStart(2, "0")}-01`;
    const { error: requestError } = await supabase.rpc("initialize_company_accounting", {
      p_company_id: workspace.companyId,
      p_fiscal_year_start: startDate,
      p_template_code: "xk-operix-base-v1",
    });
    if (requestError) setError(requestError.message);
    else setNotice("Accounting foundation initialized. Review mappings before production use.");
    setWorking(false);
    await load();
  }

  const tabs: Array<[Tab, string]> = [
    ["overview", t.overview],
    ["accounts", t.accounts],
    ["journals", t.journals],
    ["periods", t.periods],
    ["rules", t.rules],
  ];

  return (
    <div className="mx-auto max-w-[1700px] p-4 lg:p-6">
      <header className="flex flex-wrap items-end gap-3">
        <div className="min-w-[230px] flex-1">
          <h1 className="page-title">{t.title}</h1>
          <p className="muted mt-1.5 text-xs">{t.subtitle}</p>
        </div>
        <button className="btn" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          {t.refresh}
        </button>
        <button className="btn btn-primary" onClick={() => setTab("journals")} disabled={!accounts.length}>
          <FilePlus2 size={16} />
          {t.createJournal}
        </button>
      </header>

      {error ? <p className="mt-4 rounded-md bg-[#fff3f2] p-3 text-xs text-[#d92d20]">{error}</p> : null}
      {notice ? <p className="mt-4 rounded-md bg-[#ecfdf3] p-3 text-xs text-[#027a48]">{notice}</p> : null}

      {!loading && !accounts.length ? (
        <section className="card mt-6 overflow-hidden">
          <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-[#edf4ff] text-[#004ffe]">
                <BookOpenCheck size={22} />
              </span>
              <h2 className="mt-4 text-xl font-semibold">{t.initialize}</h2>
              <p className="muted mt-2 max-w-2xl text-sm leading-6">{t.initializeText}</p>
              <p className="mt-3 max-w-2xl text-xs font-medium text-[#b54708]">{t.review}</p>
            </div>
            <button className="btn btn-primary" onClick={initialize} disabled={working}>
              {working ? <Loader2 size={17} className="animate-spin" /> : <Plus size={17} />}
              {t.initialize}
            </button>
          </div>
        </section>
      ) : (
        <>
          <div className="card mt-6 flex gap-1 overflow-x-auto p-1.5">
            {tabs.map(([value, label]) => (
              <button
                key={value}
                onClick={() => setTab(value)}
                className={`h-9 shrink-0 rounded-md px-4 text-xs font-medium ${
                  tab === value ? "bg-[#edf4ff] text-[#004ffe]" : "text-[#667085] hover:bg-[#f7f9fc]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {loading ? (
            <div className="grid min-h-64 place-items-center"><Loader2 className="animate-spin text-[#004ffe]" /></div>
          ) : tab === "overview" ? (
            <Overview balance={trialBalance} journals={journals} periods={periods} t={t} />
          ) : tab === "accounts" ? (
            <Accounts accounts={accounts} companyId={workspace.companyId!} reload={load} />
          ) : tab === "journals" ? (
            <Journals accounts={accounts} journals={journals} companyId={workspace.companyId!} reload={load} t={t} />
          ) : tab === "periods" ? (
            <Periods periods={periods} reload={load} />
          ) : (
            <PostingRules rules={rules} />
          )}
        </>
      )}
    </div>
  );
}

function Overview({
  balance,
  journals,
  periods,
  t,
}: {
  balance: TrialBalanceRow[];
  journals: JournalEntry[];
  periods: AccountingPeriod[];
  t: (typeof copy)["en"] | (typeof copy)["sq"] | (typeof copy)["sr"];
}) {
  const debit = balance.reduce((sum, row) => sum + Number(row.total_debit || 0), 0);
  const credit = balance.reduce((sum, row) => sum + Number(row.total_credit || 0), 0);
  const openPeriods = periods.filter((period) => period.status === "open").length;
  return (
    <>
      <section className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label={t.debit} value={money(debit)} icon={ArrowDownToLine} />
        <Metric label={t.credit} value={money(credit)} icon={ArrowUpFromLine} />
        <Metric label="Posted journals" value={String(journals.filter((item) => item.status === "posted").length)} icon={CheckCircle2} />
        <Metric label="Open periods" value={String(openPeriods)} icon={CalendarRange} />
      </section>
      <section className="card mt-4 overflow-hidden">
        <div className="border-b p-4"><h2 className="font-semibold">Trial balance</h2><p className="muted mt-1 text-xs">Posted entries only</p></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-xs">
            <thead className="bg-[#f8fafc] text-[#667085]"><tr><th className="p-3">Account</th><th className="p-3">Type</th><th className="p-3 text-right">{t.debit}</th><th className="p-3 text-right">{t.credit}</th><th className="p-3 text-right">{t.balance}</th></tr></thead>
            <tbody>{balance.length ? balance.map((row) => <tr key={row.account_id} className="border-t"><td className="p-3 font-medium">{row.account_code} · {row.account_name}</td><td className="p-3 capitalize text-[#667085]">{row.account_type}</td><td className="p-3 text-right">{money(Number(row.total_debit))}</td><td className="p-3 text-right">{money(Number(row.total_credit))}</td><td className="p-3 text-right font-semibold">{money(Number(row.balance))}</td></tr>) : <tr><td colSpan={5} className="p-8 text-center text-[#667085]">{t.empty}</td></tr>}</tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Scale }) {
  return <div className="card flex items-center gap-3 p-4"><span className="grid h-10 w-10 place-items-center rounded-md bg-[#edf4ff] text-[#004ffe]"><Icon size={19} /></span><div><span className="muted text-[11px]">{label}</span><strong className="mt-1 block text-lg">{value}</strong></div></div>;
}

function Accounts({ accounts, companyId, reload }: { accounts: AccountingAccount[]; companyId: string; reload: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", account_type: "asset", normal_balance: "debit" });
  const [error, setError] = useState("");
  async function save() {
    const supabase = createClient();
    if (!supabase) return;
    const { error: requestError } = await supabase.from("chart_of_accounts").insert({
      company_id: companyId, code: form.code.trim(), name: form.name.trim(),
      account_type: form.account_type, normal_balance: form.normal_balance,
      posting_allowed: true, currency: "EUR",
    });
    if (requestError) setError(requestError.message);
    else { setOpen(false); setForm({ code: "", name: "", account_type: "asset", normal_balance: "debit" }); await reload(); }
  }
  return <section className="card mt-4 overflow-hidden"><header className="flex items-center justify-between border-b p-4"><div><h2 className="font-semibold">Chart of accounts</h2><p className="muted mt-1 text-xs">Company-specific accounts and statement mappings.</p></div><button className="btn" onClick={() => setOpen((value) => !value)}><Plus size={16} />Add account</button></header>{open ? <div className="grid gap-3 border-b bg-[#f8fafc] p-4 md:grid-cols-5"><input className="input" placeholder="Code" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} /><input className="input md:col-span-2" placeholder="Account name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /><select className="select" value={form.account_type} onChange={(event) => setForm({ ...form, account_type: event.target.value })}>{["asset","liability","equity","revenue","expense"].map(value => <option key={value}>{value}</option>)}</select><div className="flex gap-2"><select className="select min-w-0 flex-1" value={form.normal_balance} onChange={(event) => setForm({ ...form, normal_balance: event.target.value })}><option value="debit">Debit</option><option value="credit">Credit</option></select><button className="btn btn-primary" onClick={save}>Save</button></div>{error ? <p className="text-xs text-[#d92d20] md:col-span-5">{error}</p> : null}</div> : null}<div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-xs"><thead className="bg-[#f8fafc] text-[#667085]"><tr><th className="p-3">Code</th><th className="p-3">Name</th><th className="p-3">Type</th><th className="p-3">Nature</th><th className="p-3">Posting</th><th className="p-3">Status</th></tr></thead><tbody>{accounts.map(account => <tr key={account.id} className="border-t"><td className="p-3 font-semibold">{account.code}</td><td className="p-3">{account.name}</td><td className="p-3 capitalize">{account.account_type}</td><td className="p-3 capitalize">{account.normal_balance}</td><td className="p-3">{account.posting_allowed ? "Allowed" : "Header only"}</td><td className="p-3">{account.active ? "Active" : "Inactive"}</td></tr>)}</tbody></table></div></section>;
}

function Journals({ accounts, journals, companyId, reload, t }: { accounts: AccountingAccount[]; journals: JournalEntry[]; companyId: string; reload: () => Promise<void>; t: (typeof copy)["en"] | (typeof copy)["sq"] | (typeof copy)["sr"] }) {
  const today = new Date().toISOString().slice(0, 10);
  const [showForm, setShowForm] = useState(false);
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(today);
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<JournalLineDraft[]>([emptyLine(), emptyLine()]);
  const [error, setError] = useState("");
  const totals = useMemo(() => { try { return journalTotals(lines); } catch { return null; } }, [lines]);
  function updateLine(index: number, patch: Partial<JournalLineDraft>) { setLines((current) => current.map((line, position) => position === index ? { ...line, ...patch } : line)); }
  async function save() {
    const validation = validateJournalDraft(lines);
    if (validation) return setError(validation);
    if (!description.trim()) return setError("Description is required.");
    const supabase = createClient();
    if (!supabase) return;
    const { data, error: createError } = await supabase.rpc("create_journal_entry", {
      p_company_id: companyId, p_posting_date: date, p_document_date: date,
      p_description: description.trim(), p_reference: reference.trim() || null,
      p_currency: "EUR", p_exchange_rate: 1, p_branch_id: null, p_entry_type: "manual",
    });
    if (createError || !data) return setError(createError?.message || "Journal could not be created.");
    const entry = data as JournalEntry;
    const { error: linesError } = await supabase.from("journal_entry_lines").insert(lines.map((line, index) => ({
      journal_entry_id: entry.id, company_id: companyId, line_number: index + 1,
      account_id: line.accountId, description: line.description || description,
      debit: line.debit || "0", credit: line.credit || "0",
    })));
    if (linesError) { await supabase.from("journal_entries").delete().eq("id", entry.id).eq("status", "draft"); return setError(linesError.message); }
    setShowForm(false); setDescription(""); setReference(""); setLines([emptyLine(), emptyLine()]); setError(""); await reload();
  }
  async function post(id: string) {
    if (!window.confirm("Post this balanced journal? Posted entries can only be corrected by reversal.")) return;
    const supabase = createClient(); if (!supabase) return;
    const { error: requestError } = await supabase.rpc("post_journal_entry", { p_journal_entry_id: id, p_reason: "Posted from accounting workspace" });
    if (requestError) setError(requestError.message); else await reload();
  }
  async function reverse(id: string) {
    const reason = window.prompt("Reason for reversal:");
    if (!reason?.trim()) return;
    const supabase = createClient(); if (!supabase) return;
    const { error: requestError } = await supabase.rpc("reverse_journal_entry", { p_journal_entry_id: id, p_reversal_date: today, p_reason: reason.trim() });
    if (requestError) setError(requestError.message); else await reload();
  }
  return <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]"><section className="card overflow-hidden"><header className="flex items-center justify-between border-b p-4"><div><h2 className="font-semibold">Journal entries</h2><p className="muted mt-1 text-xs">Posted records are immutable.</p></div><button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={16} />{t.createJournal}</button></header>{error ? <p className="m-4 rounded bg-[#fff3f2] p-3 text-xs text-[#d92d20]">{error}</p> : null}<div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-[#f8fafc] text-[#667085]"><tr><th className="p-3">Number</th><th className="p-3">Date</th><th className="p-3">Description</th><th className="p-3">Type</th><th className="p-3">Status</th><th className="p-3 text-right">Actions</th></tr></thead><tbody>{journals.map(entry => <tr key={entry.id} className="border-t"><td className="p-3 font-semibold">{entry.entry_number}</td><td className="p-3">{entry.posting_date}</td><td className="p-3">{entry.description}</td><td className="p-3 capitalize">{entry.entry_type}</td><td className="p-3"><Status value={entry.status} /></td><td className="p-3 text-right">{entry.status === "draft" ? <button className="text-[#004ffe]" onClick={() => void post(entry.id)}>{t.post}</button> : entry.status === "posted" ? <button className="text-[#b54708]" onClick={() => void reverse(entry.id)}>{t.reverse}</button> : "—"}</td></tr>)}</tbody></table></div></section>{showForm ? <aside className="card h-fit p-4 xl:sticky xl:top-20"><div className="flex items-center justify-between"><h2 className="font-semibold">{t.createJournal}</h2><button onClick={() => setShowForm(false)} className="text-xs text-[#667085]">Close</button></div><div className="mt-4 grid gap-3"><input className="input" placeholder="Description" value={description} onChange={(event) => setDescription(event.target.value)} /><div className="grid grid-cols-2 gap-2"><input className="input" type="date" value={date} onChange={(event) => setDate(event.target.value)} /><input className="input" placeholder="Reference" value={reference} onChange={(event) => setReference(event.target.value)} /></div>{lines.map((line, index) => <div key={index} className="rounded-lg border p-3"><div className="flex items-center justify-between"><span className="text-xs font-semibold">Line {index + 1}</span>{lines.length > 2 ? <button className="text-xs text-[#d92d20]" onClick={() => setLines(current => current.filter((_, position) => position !== index))}>Remove</button> : null}</div><select className="select mt-2" value={line.accountId} onChange={(event) => updateLine(index, { accountId: event.target.value })}><option value="">Select account</option>{accounts.filter(account => account.active && account.posting_allowed).map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select><input className="input mt-2" placeholder="Line description" value={line.description} onChange={(event) => updateLine(index, { description: event.target.value })} /><div className="mt-2 grid grid-cols-2 gap-2"><label className="text-[10px] text-[#667085]">{t.debit}<input className="input mt-1" inputMode="decimal" value={line.debit} onFocus={(event) => event.currentTarget.select()} onChange={(event) => updateLine(index, { debit: event.target.value, ...(event.target.value !== "0" ? { credit: "0" } : {}) })} /></label><label className="text-[10px] text-[#667085]">{t.credit}<input className="input mt-1" inputMode="decimal" value={line.credit} onFocus={(event) => event.currentTarget.select()} onChange={(event) => updateLine(index, { credit: event.target.value, ...(event.target.value !== "0" ? { debit: "0" } : {}) })} /></label></div></div>)}<button className="btn justify-center" onClick={() => setLines(current => [...current, emptyLine()])}><Plus size={15} />Add line</button><div className="grid grid-cols-2 gap-2 rounded-lg bg-[#f8fafc] p-3 text-xs"><span>{t.debit}<strong className="block text-sm">{totals ? money(Number(totals.debit.toString())) : "—"}</strong></span><span>{t.credit}<strong className="block text-sm">{totals ? money(Number(totals.credit.toString())) : "—"}</strong></span></div><button className="btn btn-primary justify-center" onClick={() => void save()}><FilePlus2 size={16} />Save draft</button></div></aside> : <aside className="card grid min-h-56 place-items-center p-6 text-center"><div><BookOpenCheck className="mx-auto text-[#98a2b3]" /><p className="muted mt-3 text-xs">Select “New journal” to compose a balanced entry.</p></div></aside>}</div>;
}

function Periods({ periods, reload }: { periods: AccountingPeriod[]; reload: () => Promise<void> }) {
  const [error, setError] = useState("");
  async function change(period: AccountingPeriod, status: AccountingPeriod["status"]) {
    const reason = status === "open" && period.status !== "open" ? window.prompt("Reason for reopening this period:") : window.prompt(`Reason for changing this period to ${status} (optional):`);
    if (status === "open" && !reason?.trim()) return;
    const supabase = createClient(); if (!supabase) return;
    const { error: requestError } = await supabase.rpc("set_accounting_period_status", { p_period_id: period.id, p_status: status, p_reason: reason?.trim() || null });
    if (requestError) setError(requestError.message); else { setError(""); await reload(); }
  }
  return <section className="card mt-4 overflow-hidden"><header className="border-b p-4"><h2 className="font-semibold">Accounting periods</h2><p className="muted mt-1 text-xs">Locked periods reject all normal posting. Reopening requires elevated permission and a reason.</p></header>{error ? <p className="m-4 rounded bg-[#fff3f2] p-3 text-xs text-[#d92d20]">{error}</p> : null}<div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">{periods.map(period => <article key={period.id} className="rounded-lg border p-4"><div className="flex items-start justify-between"><div><strong>{period.name}</strong><p className="muted mt-1 text-[11px]">{period.start_date} — {period.end_date}</p></div><Status value={period.status} /></div><div className="mt-4 flex flex-wrap gap-2">{period.status === "open" ? <><button className="btn h-8 text-[11px]" onClick={() => void change(period, "closed")}><CheckCircle2 size={14} />Close</button><button className="btn h-8 text-[11px]" onClick={() => void change(period, "locked")}><LockKeyhole size={14} />Lock</button></> : <button className="btn h-8 text-[11px]" onClick={() => void change(period, "open")}><RotateCcw size={14} />Reopen</button>}{period.status === "closed" ? <button className="btn h-8 text-[11px]" onClick={() => void change(period, "locked")}><LockKeyhole size={14} />Lock</button> : null}</div></article>)}</div></section>;
}

function PostingRules({ rules }: { rules: PostingRule[] }) {
  return <section className="card mt-4 overflow-hidden"><header className="border-b p-4"><h2 className="font-semibold">Automatic posting rules</h2><p className="muted mt-1 text-xs">Account IDs are mapped in data, not embedded in application code.</p></header><div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">{rules.map(rule => <article className="rounded-lg border p-4" key={rule.id}><div className="flex items-center justify-between gap-3"><span className="grid h-9 w-9 place-items-center rounded-md bg-[#edf4ff] text-[#004ffe]"><CircleDollarSign size={18} /></span><Status value={rule.active ? "active" : "inactive"} /></div><h3 className="mt-3 font-semibold">{rule.name}</h3><p className="muted mt-1 text-xs">{rule.event_type.replaceAll("_", " ")} · v{rule.version}</p><p className="mt-3 text-[10px] font-medium text-[#b54708]">Professional compliance review required</p><p className="muted mt-1 text-[10px]">Effective {rule.effective_from}{rule.effective_until ? ` — ${rule.effective_until}` : ""}</p></article>)}</div></section>;
}

function Status({ value }: { value: string }) {
  const tone = value === "posted" || value === "open" || value === "active" ? "bg-[#ecfdf3] text-[#027a48]" : value === "locked" || value === "reversed" ? "bg-[#fff3f2] text-[#b42318]" : "bg-[#f2f4f7] text-[#475467]";
  return <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-medium capitalize ${tone}`}>{value}</span>;
}
