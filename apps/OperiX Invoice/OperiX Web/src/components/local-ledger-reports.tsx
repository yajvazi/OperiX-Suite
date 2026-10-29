"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { LEDGER_ACCOUNTS, buildLedger, generalLedger, trialBalance, type JournalEntry } from "@invoice-monorepo/data-store";
import { getLocalStore } from "@/lib/local/local-store";
import { money } from "@/lib/format";
import { SectionCard } from "./ui";

const csv = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
function download(name: string, rows: Array<Array<string | number>>) {
  const url = URL.createObjectURL(new Blob([`﻿${rows.map((row) => row.map(csv).join(",")).join("\n")}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  URL.revokeObjectURL(url);
}

/** Trial balance and general ledger worked out from the documents stored in this browser. */
export function LocalLedgerReports() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [account, setAccount] = useState("1200");
  useEffect(() => {
    let cancelled = false;
    void getLocalStore().then(buildLedger).then((value) => { if (!cancelled) setEntries(value); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  const balance = useMemo(() => trialBalance(entries), [entries]);
  const ledger = useMemo(() => generalLedger(entries, account), [entries, account]);
  const debit = balance.reduce((sum, row) => sum + row.debit, 0);
  const credit = balance.reduce((sum, row) => sum + row.credit, 0);
  return <>
    <SectionCard title="Trial Balance" description="Debits and credits per account, worked out from the invoices, payments, bills, expenses and payroll in this browser." className="reports-chart-card">
      <div className="mb-3 flex justify-end"><button type="button" className="btn" disabled={!balance.length} onClick={() => download("trial-balance.csv", [["Code", "Account", "Debit", "Credit", "Balance"], ...balance.map((row) => [row.code, row.name, row.debit.toFixed(2), row.credit.toFixed(2), row.balance.toFixed(2)])])}><Download size={15} /> Export CSV</button></div>
      <div className="reports-table-wrap" id="trial-balance"><table className="ux-table"><thead><tr><th>Code</th><th>Account</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>
        {balance.length ? balance.map((row) => <tr key={row.code}><td>{row.code}</td><td>{row.name}</td><td>{money(row.debit)}</td><td>{money(row.credit)}</td><td>{money(row.balance)}</td></tr>) : <tr><td colSpan={5}>No entries yet.</td></tr>}
      </tbody>{balance.length ? <tfoot><tr><th colSpan={2}>Total</th><th>{money(debit)}</th><th>{money(credit)}</th><th>{Math.abs(debit - credit) < 0.005 ? "Balanced" : "Out of balance"}</th></tr></tfoot> : null}</table></div>
    </SectionCard>
    <SectionCard title="General Ledger" description="Every entry on one account with a running balance." className="reports-chart-card">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><label className="field"><span>Account</span><select className="select" value={account} onChange={(event) => setAccount(event.target.value)}>{LEDGER_ACCOUNTS.map((item) => <option key={item.code} value={item.code}>{item.code} · {item.name}</option>)}</select></label>
        <button type="button" className="btn" disabled={!ledger.length} onClick={() => download(`general-ledger-${account}.csv`, [["Date", "Reference", "Description", "Debit", "Credit", "Balance"], ...ledger.map((row) => [row.date, row.reference, row.description, row.debit.toFixed(2), row.credit.toFixed(2), row.balance.toFixed(2)])])}><Download size={15} /> Export CSV</button></div>
      <div className="reports-table-wrap" id="general-ledger"><table className="ux-table"><thead><tr><th>Date</th><th>Reference</th><th>Description</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>
        {ledger.length ? ledger.map((row, index) => <tr key={`${row.reference}-${index}`}><td>{row.date}</td><td>{row.reference}</td><td>{row.description}</td><td>{money(row.debit)}</td><td>{money(row.credit)}</td><td>{money(row.balance)}</td></tr>) : <tr><td colSpan={6}>No entries on this account.</td></tr>}
      </tbody></table></div>
    </SectionCard>
  </>;
}

/** The on-device Accounting page: journal entries first, then the reports. */
export function LocalAccountingPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  useEffect(() => {
    let cancelled = false;
    void getLocalStore().then(buildLedger).then((value) => { if (!cancelled) setEntries([...value].reverse()); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  const name = (code: string) => LEDGER_ACCOUNTS.find((item) => item.code === code)?.name ?? code;
  return <div className="ux-page">
    <header className="mb-4"><h1 className="page-title">Accounting</h1><p className="muted mt-1 text-xs">Journal entries are worked out from your documents, so they always agree with them. This simplified chart of accounts is for your accountant to review.</p></header>
    <SectionCard title="Journal" description="Newest first." className="reports-chart-card">
      <div className="reports-table-wrap"><table className="ux-table"><thead><tr><th>Date</th><th>Reference</th><th>Description</th><th>Account</th><th>Debit</th><th>Credit</th></tr></thead><tbody>
        {entries.length ? entries.flatMap((item, entryIndex) => item.lines.map((line, lineIndex) => <tr key={`${entryIndex}-${lineIndex}`}><td>{lineIndex === 0 ? item.date : ""}</td><td>{lineIndex === 0 ? item.reference : ""}</td><td>{lineIndex === 0 ? item.description : ""}</td><td>{line.account} · {name(line.account)}</td><td>{line.debit ? money(line.debit) : ""}</td><td>{line.credit ? money(line.credit) : ""}</td></tr>)) : <tr><td colSpan={6}>No entries yet.</td></tr>}
      </tbody></table></div>
    </SectionCard>
    <LocalLedgerReports />
  </div>;
}
