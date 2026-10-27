"use client";

/* The generic Supabase row shape is intentionally open because this module
 * reads additive legacy and expanded expense columns during migration. */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { calculateExpenseEligibility, calculateExpenseTotals, exactSum, EXPENSE_CATEGORIES, type ExpenseCategoryId } from "@invoice-monorepo/api";
import { saveExpense } from "@invoice-monorepo/api/repositories";
import { DecimalAmount } from "@invoice-monorepo/money";
import { createClient } from "@/lib/supabase/client";
import { useWorkspace } from "@/hooks/use-workspace";
import { MetricCard, PageHeader, SectionCard, StatusBadge } from "@/components/ui";

type Row = Record<string, any>;
type Tab = "overview" | "expenses" | "suppliers" | "reports";

const DOCUMENT_TYPES = ["tax_invoice", "fiscal_receipt", "utility_invoice", "contract", "bank_document", "import_customs_document", "other"];
const labelFor = (id: string, sq: boolean) => {
  const category = EXPENSE_CATEGORIES.find((item) => item.id === id);
  return category ? (sq ? category.sq : category.en) : id.replaceAll("_", " ");
};
const amount = (value: string | number | null | undefined) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(Number(value || 0));

export function ExpensesModule() {
  const { user, companyId, companyIds, company, loading: workspaceLoading } = useWorkspace();
  const [tab, setTab] = useState<Tab>("overview");
  const [rows, setRows] = useState<Row[]>([]);
  const [vendors, setVendors] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [paymentStatus, setPaymentStatus] = useState("all");
  const [documentation, setDocumentation] = useState("all");
  const [selected, setSelected] = useState<Row | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ category_code: "other_expenses", vendor_id: "", vendor_name: "", document_type: "other", document_number: "", date: new Date().toISOString().slice(0, 10), gross_amount: "", vat_rate: "0", description: "", payment_method: "bank", due_date: "", tax_treatment: "review_required", vat_treatment: "review_required", business_use_percentage: "100", tax_deductible_percentage: "", vat_deductible_percentage: "", tax_override_reason: "", vat_override_reason: "", fuel_type: "", litres: "", price_per_litre: "", vehicle_label: "", billing_period_start: "", billing_period_end: "", utility_account_reference: "" });
  const sq = company?.default_language === "sq";
  const client = createClient();
  const companyScope = companyIds.join(",");

  const load = useCallback(async () => {
    const scopedCompanyIds = companyScope ? companyScope.split(",") : [];
    if (!client || !scopedCompanyIds.length) return;
    setError("");
    const [expenseResult, vendorResult] = await Promise.all([
      client.from("expenses").select("*, vendor:vendors(id,name,tax_id)").in("company_id", scopedCompanyIds).is("archived_at", null).order("date", { ascending: false }),
      client.from("vendors").select("id,name,tax_id,email,phone").in("company_id", scopedCompanyIds).order("name"),
    ]);
    if (expenseResult.error) setError(expenseResult.error.message);
    else setRows((expenseResult.data || []) as Row[]);
    if (!vendorResult.error) setVendors((vendorResult.data || []) as Row[]);
  }, [client, companyScope]);

  // Loading is an external data synchronization boundary.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => rows.filter((row) => {
    const haystack = [row.expense_number, row.vendor_name, row.vendor?.name, row.category, row.category_code, row.document_number, row.description].join(" ").toLowerCase();
    return (!query || haystack.includes(query.toLowerCase())) && (category === "all" || row.category_code === category) && (paymentStatus === "all" || row.payment_status === paymentStatus) && (documentation === "all" || row.documentation_status === documentation);
  }), [rows, query, category, paymentStatus, documentation]);

  const totals = useMemo(() => ({
    net: exactSum(filtered.map((row) => row.net_amount)),
    vat: exactSum(filtered.map((row) => row.vat_amount)),
    gross: exactSum(filtered.map((row) => row.gross_amount ?? row.amount)),
    paid: exactSum(filtered.map((row) => row.paid_amount)),
    outstanding: exactSum(filtered.map((row) => row.outstanding_amount)),
    deductible: exactSum(filtered.map((row) => row.tax_deductible_amount)),
    nonDeductible: exactSum(filtered.map((row) => row.tax_non_deductible_amount)),
    recoverableVat: exactSum(filtered.map((row) => row.vat_deductible_amount)),
  }), [filtered]);

  const openNew = (categoryCode = "other_expenses") => {
    setSelected(null);
    setIsCreating(true);
    setAttachment(null);
    setForm((current) => ({ ...current, category_code: categoryCode, vendor_id: "", vendor_name: "", gross_amount: "", vat_rate: "0", description: "" }));
    setTab("expenses");
  };

  const openEdit = (row: Row) => {
    setSelected(row);
    setIsCreating(false);
    setForm({ ...form, ...Object.fromEntries(Object.keys(form).map((key) => [key, row[key] == null ? "" : String(row[key])])) });
    setTab("expenses");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!client || !user || !companyId || !form.gross_amount) return;
    setSaving(true); setError("");
    try {
      const totalsForSave = calculateExpenseTotals({ grossAmount: form.gross_amount, vatRate: form.vat_rate });
      const eligibility = calculateExpenseEligibility({ grossAmount: totalsForSave.grossAmount, vatAmount: totalsForSave.vatAmount, taxTreatment: form.tax_treatment as any, taxDeductiblePercentage: form.tax_deductible_percentage || 0, vatTreatment: form.vat_treatment as any, vatDeductiblePercentage: form.vat_deductible_percentage || 0, businessUsePercentage: form.business_use_percentage || 100 });
      const vendor = vendors.find((item) => item.id === form.vendor_id);
      const savedExpense = await saveExpense(client, {
        ...form,
        amount: totalsForSave.grossAmount,
        gross_amount: totalsForSave.grossAmount,
        net_amount: totalsForSave.netAmount,
        vat_amount: totalsForSave.vatAmount,
        tax_amount: totalsForSave.vatAmount,
        tax_recoverable_amount: eligibility.deductibleVatAmount,
        tax_deductible_amount: eligibility.deductibleAmount,
        tax_non_deductible_amount: eligibility.nonDeductibleAmount,
        vat_deductible_amount: eligibility.deductibleVatAmount,
        vat_non_deductible_amount: eligibility.nonDeductibleVatAmount,
        vendor_name: vendor?.name || form.vendor_name || null,
        vendor_id: form.vendor_id || null,
        category: labelFor(form.category_code, sq),
        category_code: form.category_code as ExpenseCategoryId,
        invoice_number: form.document_number || null,
        issue_date: form.date,
        purchase_book_eligible: Boolean(form.document_number && form.document_type !== "other" && (form.vat_treatment !== "no_vat_exempt")),
        date: form.date,
        user_id: user.id,
        company_id: companyId,
        type: "expense",
      } as Row & { user_id: string; company_id: string }, selected?.id || null, { postExpense: !selected });
      const savedId = String(savedExpense.id || selected?.id || "");
      if (attachment && savedId) {
        const path = `${companyId}/expenses/${savedId}/${Date.now()}-${attachment.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
        const uploaded = await client.storage.from("operix-expense-documents").upload(path, attachment, { contentType: attachment.type, upsert: false });
        if (uploaded.error) throw uploaded.error;
        const archived = await client.rpc("add_expense_attachment", { p_expense_id: savedId, p_storage_bucket: "operix-expense-documents", p_storage_path: path, p_file_name: attachment.name, p_content_type: attachment.type, p_byte_size: attachment.size, p_metadata: { source: "web_upload" } });
        if (archived.error) throw archived.error;
      }
      await load();
      setSelected(null);
      setIsCreating(false);
      setTab("expenses");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Expense could not be saved.");
    } finally { setSaving(false); }
  };

  if (workspaceLoading) return <div className="ux-page"><SectionCard title="Shpenzimet / Expenses"><p>Loading workspace…</p></SectionCard></div>;

  return <div className="ux-page expenses-module">
    <PageHeader title={sq ? "Shpenzimet" : "Expenses"} description={sq ? "Regjistroni dhe analizoni shpenzimet e biznesit." : "Record, document and review business expenses."} action={<button className="btn btn-primary" onClick={() => openNew()}>{sq ? "Shpenzim i ri" : "New expense"}</button>} />
    <nav className="expenses-tabs" aria-label="Expense areas">{(["overview", "expenses", "suppliers", "reports"] as Tab[]).map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item === "overview" ? (sq ? "Përmbledhje" : "Overview") : item === "expenses" ? (sq ? "Shpenzime" : "Expenses") : item === "suppliers" ? (sq ? "Furnitorët" : "Suppliers") : (sq ? "Raportet" : "Reports")}</button>)}</nav>

    <div className="expense-metrics">
      <MetricCard label={sq ? "Shpenzime totale" : "Total expenses"} value={amount(totals.gross)} />
      <MetricCard label={sq ? "Të paguara" : "Paid expenses"} value={amount(totals.paid)} />
      <MetricCard label={sq ? "Të papaguara" : "Outstanding"} value={amount(totals.outstanding)} />
      <MetricCard label={sq ? "TVSH e rikuperueshme" : "Recoverable input VAT"} value={amount(totals.recoverableVat)} />
    </div>

    {error ? <div className="error-banner">{error}</div> : null}
    {tab === "overview" ? <Overview rows={filtered} totals={totals} sq={sq} onQuickAdd={openNew} /> : null}
    {tab === "expenses" ? <>
      <SectionCard title={sq ? "Regjistri i shpenzimeve" : "Expense register"}>
        <div className="expense-filters"><input className="input" placeholder={sq ? "Kërko furnitor, dokument…" : "Search supplier, document…"} value={query} onChange={(event) => setQuery(event.target.value)} /><select className="select" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">{sq ? "Të gjitha kategoritë" : "All categories"}</option>{EXPENSE_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{sq ? item.sq : item.en}</option>)}</select><select className="select" value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value)}><option value="all">{sq ? "Të gjitha pagesat" : "All payment statuses"}</option><option value="paid">{sq ? "Paguar" : "Paid"}</option><option value="partially_paid">{sq ? "Pjesërisht paguar" : "Partially paid"}</option><option value="unpaid">{sq ? "Papaguar" : "Unpaid"}</option><option value="overdue">{sq ? "Me afat të kaluar" : "Overdue"}</option></select><select className="select" value={documentation} onChange={(event) => setDocumentation(event.target.value)}><option value="all">{sq ? "Dokumentacioni" : "Documentation"}</option><option value="complete">{sq ? "Dokumentacion i plotë" : "Complete"}</option><option value="missing_information">{sq ? "Mungojnë të dhëna" : "Missing information"}</option><option value="missing_supporting_document">{sq ? "Mungon dokumenti" : "Missing document"}</option></select></div>
        <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Date</th><th>Reference</th><th>Supplier</th><th>Category</th><th>Document</th><th>Gross</th><th>VAT</th><th>Status</th><th>Documentation</th></tr></thead><tbody>{filtered.map((row) => <tr key={row.id} onClick={() => openEdit(row)}><td>{row.date || "—"}</td><td>{row.expense_number || "—"}</td><td>{row.vendor?.name || row.vendor_name || "—"}</td><td>{labelFor(row.category_code || "other_expenses", sq)}</td><td>{row.document_number || row.invoice_number || "—"}</td><td>{amount(row.gross_amount ?? row.amount)}</td><td>{amount(row.vat_amount ?? row.tax_amount)}</td><td><StatusBadge status={row.payment_status || "unpaid"} /></td><td><StatusBadge status={row.documentation_status || "missing_supporting_document"} /></td></tr>)}</tbody></table></div>
        {!filtered.length ? <p className="empty-state">{sq ? "Nuk ka shpenzime për këto filtra." : "No expenses match these filters."}</p> : null}
      </SectionCard>
      {selected ? <SectionCard title={sq ? "Detajet e shpenzimit" : "Expense details"}><ExpenseDetailSummary row={selected} sq={sq} /><ExpenseForm form={form} setForm={setForm} vendors={vendors} onSubmit={submit} saving={saving} sq={sq} onAttachment={setAttachment} /></SectionCard> : null}
      {isCreating ? <SectionCard title={sq ? "Shpenzim i ri" : "New expense"}><ExpenseForm form={form} setForm={setForm} vendors={vendors} onSubmit={submit} saving={saving} sq={sq} onAttachment={setAttachment} /></SectionCard> : null}
    </> : null}
    {tab === "suppliers" ? <SupplierReport rows={rows} vendors={vendors} sq={sq} onSelect={(vendor) => { setQuery(vendor.name); setTab("expenses"); }} /> : null}
    {tab === "reports" ? <Reports rows={rows} sq={sq} /> : null}
  </div>;
}

function Overview({ rows, totals, sq, onQuickAdd }: { rows: Row[]; totals: Record<string, string>; sq: boolean; onQuickAdd: (category: string) => void }) {
  const top = EXPENSE_CATEGORIES.map((category) => ({ ...category, total: exactSum(rows.filter((row) => row.category_code === category.id).map((row) => row.gross_amount ?? row.amount)) })).sort((a, b) => DecimalAmount.from(b.total).atoms > DecimalAmount.from(a.total).atoms ? 1 : DecimalAmount.from(b.total).atoms < DecimalAmount.from(a.total).atoms ? -1 : 0).slice(0, 5);
  return <div className="expense-overview-grid"><SectionCard title={sq ? "Shto shpejt" : "Quick add"}><div className="quick-add-grid">{["fuel", "electricity", "water", "internet", "rent", "consumable_materials", "transport", "other_expenses"].map((id) => <button className="quick-add-card" key={id} onClick={() => onQuickAdd(id)}>＋ {labelFor(id, sq)}</button>)}</div></SectionCard><SectionCard title={sq ? "Kategoritë kryesore" : "Top categories"}>{top.map((item) => <div className="report-row" key={item.id}><span>{sq ? item.sq : item.en}</span><strong>{amount(item.total)}</strong></div>)}</SectionCard><SectionCard title={sq ? "Dokumentacioni" : "Documentation"}><div className="report-row"><span>{sq ? "Mungojnë të dhëna / dokumente" : "Missing information / documents"}</span><strong>{rows.filter((row) => row.documentation_status !== "complete").length}</strong></div><div className="report-row"><span>{sq ? "I zbritshëm" : "Deductible"}</span><strong>{amount(totals.deductible)}</strong></div><div className="report-row"><span>{sq ? "I pazbritshëm" : "Non-deductible"}</span><strong>{amount(totals.nonDeductible)}</strong></div></SectionCard></div>;
}

function ExpenseDetailSummary({ row, sq }: { row: Row; sq: boolean }) {
  return <div className="expense-detail-summary"><div><span>Reference</span><strong>{row.expense_number || "—"}</strong></div><div><span>{sq ? "Furnitori" : "Supplier"}</span><strong>{row.vendor?.name || row.vendor_name || "—"}</strong></div><div><span>{sq ? "Neto / TVSH / Bruto" : "Net / VAT / Gross"}</span><strong>{amount(row.net_amount)} / {amount(row.vat_amount)} / {amount(row.gross_amount ?? row.amount)}</strong></div><div><span>{sq ? "Detyrimi" : "Outstanding"}</span><strong>{amount(row.outstanding_amount)}</strong></div><div><span>{sq ? "Trajtimi tatimor" : "Tax treatment"}</span><strong>{String(row.tax_treatment || "review_required").replaceAll("_", " ")}</strong></div><div><span>{sq ? "Trajtimi i TVSH-së" : "VAT treatment"}</span><strong>{String(row.vat_treatment || "review_required").replaceAll("_", " ")}</strong></div></div>;
}

function ExpenseForm({ form, setForm, vendors, onSubmit, saving, sq, onAttachment }: { form: Record<string, string>; setForm: (value: any) => void; vendors: Row[]; onSubmit: (event: FormEvent) => void; saving: boolean; sq: boolean; onAttachment: (file: File | null) => void }) {
  const set = (key: string, value: string) => setForm((current: Record<string, string>) => ({ ...current, [key]: value }));
  const totals = calculateExpenseTotals({ grossAmount: form.gross_amount || "0", vatRate: form.vat_rate || "0" });
  return <form className="expense-form" onSubmit={onSubmit}><div className="form-grid"><label>Category<select className="select" value={form.category_code} onChange={(e) => set("category_code", e.target.value)}>{EXPENSE_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{sq ? item.sq : item.en}</option>)}</select></label><label>Supplier<select className="select" value={form.vendor_id} onChange={(e) => { const vendor = vendors.find((item) => item.id === e.target.value); setForm((current: any) => ({ ...current, vendor_id: e.target.value, vendor_name: vendor?.name || "" })); }}><option value="">{sq ? "Zgjidh furnitorin" : "Select supplier"}</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></label><label>Date<input className="input" type="date" value={form.date} onChange={(e) => set("date", e.target.value)} /></label><label>Document number<input className="input" value={form.document_number} onChange={(e) => set("document_number", e.target.value)} /></label><label>Gross amount<input className="input" required inputMode="decimal" value={form.gross_amount} onChange={(e) => set("gross_amount", e.target.value)} /></label><label>VAT rate %<input className="input" inputMode="decimal" value={form.vat_rate} onChange={(e) => set("vat_rate", e.target.value)} /></label></div><div className="calculation-strip"><span>Net {amount(totals.netAmount)}</span><span>VAT {amount(totals.vatAmount)}</span><strong>Gross {amount(totals.grossAmount)}</strong></div><label>Description<textarea className="input" value={form.description} onChange={(e) => set("description", e.target.value)} /></label><label>{sq ? "Dokument mbështetës" : "Supporting document"}<input className="input" type="file" accept="application/pdf,image/jpeg,image/png,image/heic,image/heif" onChange={(e) => onAttachment(e.target.files?.[0] || null)} /></label><details><summary>{sq ? "Të dhëna tatimore dhe kontabël" : "Tax & accounting details"}</summary><div className="form-grid"><label>Document type<select className="select" value={form.document_type} onChange={(e) => set("document_type", e.target.value)}>{DOCUMENT_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>Tax treatment<select className="select" value={form.tax_treatment} onChange={(e) => set("tax_treatment", e.target.value)}><option value="review_required">Review Required</option><option value="fully_deductible">Fully Deductible</option><option value="partially_deductible">Partially Deductible</option><option value="non_deductible">Non-Deductible</option></select></label><label>Tax override reason<input className="input" value={form.tax_override_reason} onChange={(e) => set("tax_override_reason", e.target.value)} /></label><label>VAT treatment<select className="select" value={form.vat_treatment} onChange={(e) => set("vat_treatment", e.target.value)}><option value="review_required">Review Required</option><option value="deductible">Deductible VAT</option><option value="partially_deductible">Partially Deductible VAT</option><option value="non_deductible">Non-Deductible VAT</option><option value="not_vat_registered">Not VAT Registered</option><option value="no_vat_exempt">No VAT / Exempt</option></select></label><label>VAT override reason<input className="input" value={form.vat_override_reason} onChange={(e) => set("vat_override_reason", e.target.value)} /></label><label>Business use %<input className="input" value={form.business_use_percentage} onChange={(e) => set("business_use_percentage", e.target.value)} /></label>{form.category_code === "fuel" ? <><label>Vehicle<input className="input" value={form.vehicle_label} onChange={(e) => set("vehicle_label", e.target.value)} /></label><label>Fuel type<input className="input" value={form.fuel_type} onChange={(e) => set("fuel_type", e.target.value)} placeholder="diesel" /></label><label>Litres<input className="input" value={form.litres} onChange={(e) => set("litres", e.target.value)} /></label><label>Price per litre<input className="input" value={form.price_per_litre} onChange={(e) => set("price_per_litre", e.target.value)} /></label></> : null}</div></details><button className="btn btn-primary" disabled={saving} type="submit">{saving ? "Saving…" : (sq ? "Ruaj shpenzimin" : "Save expense")}</button></form>;
}

function SupplierReport({ rows, vendors, sq, onSelect }: { rows: Row[]; vendors: Row[]; sq: boolean; onSelect: (vendor: Row) => void }) { return <SectionCard title={sq ? "Furnitorët" : "Suppliers"}><div className="data-table-wrap"><table className="data-table"><thead><tr><th>{sq ? "Furnitori" : "Supplier"}</th><th>{sq ? "Blerje" : "Purchases"}</th><th>{sq ? "Detyrim" : "Outstanding"}</th><th>{sq ? "Kategoritë" : "Common categories"}</th></tr></thead><tbody>{vendors.map((vendor) => { const supplierRows = rows.filter((row) => row.vendor_id === vendor.id); return <tr key={vendor.id} onClick={() => onSelect(vendor)}><td>{vendor.name}</td><td>{amount(exactSum(supplierRows.map((row) => row.gross_amount ?? row.amount)))}</td><td>{amount(exactSum(supplierRows.map((row) => row.outstanding_amount)))}</td><td>{[...new Set(supplierRows.map((row) => labelFor(row.category_code || "other_expenses", sq)))].join(", ") || "—"}</td></tr>; })}</tbody></table></div></SectionCard>; }

function Reports({ rows, sq }: { rows: Row[]; sq: boolean }) { const groups = EXPENSE_CATEGORIES.map((category) => ({ ...category, rows: rows.filter((row) => row.category_code === category.id) })).filter((group) => group.rows.length); return <div className="expense-report-grid"><SectionCard title={sq ? "Përmbledhje e shpenzimeve" : "Expense summary"}><div className="report-row"><span>Net</span><strong>{amount(exactSum(rows.map((row) => row.net_amount)))}</strong></div><div className="report-row"><span>VAT</span><strong>{amount(exactSum(rows.map((row) => row.vat_amount)))}</strong></div><div className="report-row"><span>Gross</span><strong>{amount(exactSum(rows.map((row) => row.gross_amount ?? row.amount)))}</strong></div></SectionCard><SectionCard title={sq ? "Sipas kategorisë" : "By category"}>{groups.map((group) => <div className="report-row" key={group.id}><span>{sq ? group.sq : group.en}</span><strong>{amount(exactSum(group.rows.map((row) => row.gross_amount ?? row.amount)))}</strong></div>)}</SectionCard><SectionCard title={sq ? "Trajtimi tatimor dhe TVSH" : "Tax & VAT treatment"}>{(["fully_deductible", "partially_deductible", "non_deductible", "review_required"] as const).map((status) => <div className="report-row" key={status}><span>{status.replaceAll("_", " ")}</span><strong>{amount(exactSum(rows.filter((row) => row.tax_treatment === status).map((row) => row.gross_amount ?? row.amount)))}</strong></div>)}</SectionCard></div>; }
