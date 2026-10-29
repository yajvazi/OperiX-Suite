"use client";

import { Fragment, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Boxes, Download, Edit3, FileSpreadsheet, FileUp, MoreHorizontal, Plus, Trash2, TrendingUp, Users, X, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useBusinessData } from "@/hooks/use-business-data";
import { createClient } from "@/lib/supabase/client";
import { money } from "@/lib/format";
import { resourceConfigs, type ResourceConfig } from "@/lib/resource-config";
import { useWorkspace } from "@/hooks/use-workspace";
import { listLocalResource, removeLocalResource, saveLocalResource } from "@/lib/local/resource";
import { getLocalStore } from "@/lib/local/local-store";
import { PurchasesNav } from "@/components/purchases-nav";
import { PortalLinksView } from "@/components/portal-links-view";
import { ProductImportDialog } from "@/components/product-import-dialog";
import { CustomerLedgerDialog } from "@/components/customer-ledger-dialog";
import { EmptyState, ErrorState, LoadingSkeleton, MetricCard, PageHeader, SearchField, SectionCard, StatusBadge } from "./ui";
import {
  deleteCustomer,
  deleteCustomerPayment,
  deleteExpense,
  deleteProduct,
  deleteScopedResource,
  getPreferredBranchId,
  listBranches,
  listCompanyBankAccounts,
  listFinancialAccountBalances,
  listOpenCustomerInvoices,
  listProductBranchStock,
  saveCustomer,
  saveCustomerPayment,
  saveExpense,
  saveProduct,
  saveProductBranchStock,
  saveScopedResource,
} from "@invoice-monorepo/api/repositories";
import { isCashPaymentAllowed, resolvePaymentFundAccount, type PaymentFundMethod } from "@invoice-monorepo/api/domain";

type ResourceRow = Record<string, unknown> & { id: string };
const PAYMENT_METHOD_LABELS: Record<string, string> = { cash: "Cash", bank: "Bank transfer", card: "Card", online_payment: "Online payment", cheque: "Cheque", other: "Other" };
type ResourcePageProps = { resourceKey: string; title?: string; description?: string; embedded?: boolean };

export function ResourcePage(props: ResourcePageProps) {
  return <Suspense fallback={<div className="ux-page"><LoadingSkeleton rows={5} /></div>}><ResourcePageContent {...props} /></Suspense>;
}

function ResourcePageContent({ resourceKey, title, description, embedded = false }: ResourcePageProps) {
  const baseConfig = resourceConfigs[resourceKey];
  const config = useMemo(() => ({ ...baseConfig, title: title || baseConfig.title, description: description || baseConfig.description }), [baseConfig, description, title]);
  const searchParams = useSearchParams();
  const { data, loading, error, refresh, setData } = useBusinessData<ResourceRow>(config.table, config.select);
  const workspace = useWorkspace();
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(() => searchParams.get("create") === "1");
  const [importModal, setImportModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [exporting, setExporting] = useState(false);
  const [reportMonth, setReportMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [editing, setEditing] = useState<ResourceRow | null>(null);
  const [prefill, setPrefill] = useState<Record<string, string> | null>(null);
  const [bankAccounts, setBankAccounts] = useState<Array<{ id: string; label: string; isPrimary: boolean }>>([]);
  const [ledgerCustomer, setLedgerCustomer] = useState<ResourceRow | null>(null);
  const [secondaryFilter, setSecondaryFilter] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [customerRevenue, setCustomerRevenue] = useState<Record<string, number>>({});
  const [relationOptions, setRelationOptions] = useState<Record<string, Array<{ id: string; label: string }>>>({});
  const [branchOptions, setBranchOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [productBranchStock, setProductBranchStock] = useState<Record<string, number>>({});
  const paymentIdempotencyKey = useRef<string | null>(null);
  const createRequested = searchParams.get("create") === "1";
  const companyScopeKey = workspace.companyIds.join(",");
  const access = resourceAccess(resourceKey, config.table);
  const canRead = workspace.can(access.read);
  const canCreate = workspace.can(access.create);
  const canEdit = workspace.can(access.edit);
  const canDelete = workspace.can(access.delete);
  const canExport = workspace.can("financial.export");

  const prefillInvoiceId = resourceKey === "payments" ? searchParams.get("invoiceId") : null;
  useEffect(() => {
    if (!createRequested) return;
    if (!prefillInvoiceId) { queueMicrotask(() => setModal(true)); return; }
    if (workspace.loading) return;
    let cancelled = false;
    if (workspace.storage === "local") {
      void (async () => {
        const store = await getLocalStore();
        const invoice = await store.getInvoice(prefillInvoiceId);
        if (cancelled) return;
        if (invoice) {
          const payments = await store.listPayments({ invoiceId: prefillInvoiceId });
          const outstanding = Math.max(0, Number(invoice.total_amount || 0) - payments.reduce((sum, row) => sum + Number(row.amount || 0), 0));
          setPrefill({ invoice_id: String(invoice.id), client_id: invoice.client_id ? String(invoice.client_id) : "", amount: outstanding ? outstanding.toFixed(2) : "" });
        }
        setModal(true);
      })();
      return () => { cancelled = true; };
    }
    const supabase = createClient();
    if (!supabase) { queueMicrotask(() => setModal(true)); return; }
    void (async () => {
      const [{ data: invoice }, { data: paid }] = await Promise.all([
        supabase.from("invoices").select("id,client_id,total_amount,amount_received").eq("id", prefillInvoiceId).maybeSingle(),
        supabase.from("payments").select("amount").eq("invoice_id", prefillInvoiceId),
      ]);
      if (cancelled) return;
      if (invoice) {
        const received = paid?.length ? paid.reduce((sum, row) => sum + Number(row.amount || 0), 0) : Number(invoice.amount_received || 0);
        const outstanding = Math.max(0, Number(invoice.total_amount || 0) - received);
        setPrefill({ invoice_id: String(invoice.id), client_id: invoice.client_id ? String(invoice.client_id) : "", amount: outstanding ? outstanding.toFixed(2) : "" });
      }
      setModal(true);
    })();
    return () => { cancelled = true; };
  }, [createRequested, prefillInvoiceId, workspace.loading, workspace.storage]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    const relations = config.fields.filter((field) => field.relation);
    if (!relations.length || !workspace.companyIds.length) return;
    void Promise.all(relations.map(async (field) => {
      const relation = field.relation!;
      if (workspace.storage === "local") {
        const rows = await listLocalResource(relation.table);
        const options = rows.map((option) => ({ id: String(option.id), label: String(option[relation.label] || "—") })).sort((a, b) => a.label.localeCompare(b.label));
        return [field.key, options] as const;
      }
      const { data: options } = await supabase.from(relation.table).select(`id,${relation.label}`).in("company_id", workspace.companyIds).order(relation.label);
      const rows = (options || []) as unknown as Array<Record<string, unknown>>;
      return [field.key, rows.map((option) => ({ id: String(option.id), label: String(option[relation.label] || "—") }))] as const;
    })).then((entries) => setRelationOptions(Object.fromEntries(entries)));
  }, [companyScopeKey, config.fields, workspace.companyIds, workspace.storage]);

  useEffect(() => {
    if (config.table !== "products" || !workspace.companyId || !workspace.user || workspace.storage === "local") return;
    const supabase = createClient();
    if (!supabase) return;
    void listBranches(supabase, workspace.companyId).then(async (branches) => {
      setBranchOptions(branches.map((branch) => ({ id: branch.id, name: branch.name })));
      const preferred = await getPreferredBranchId(supabase, workspace.user!.id, workspace.companyId!).catch(() => null);
      setSelectedBranchId(preferred && branches.some((branch) => branch.id === preferred) ? preferred : branches.length === 1 ? branches[0].id : null);
    }).catch(() => setBranchOptions([]));
  }, [config.table, workspace.companyId, workspace.storage, workspace.user]);

  useEffect(() => {
    if (config.table !== "payments" || !workspace.companyId) return;
    if (workspace.storage === "local") {
      void listLocalResource("company_bank_accounts").then((rows) => setBankAccounts(rows.filter((row) => row.is_active !== false).map((row) => ({ id: String(row.id), label: [row.bank_name, row.account_name || row.iban || row.account_number].filter(Boolean).join(" · ") || "Bank account", isPrimary: Boolean(row.is_primary) })))).catch(() => setBankAccounts([]));
      return;
    }
    const supabase = createClient();
    if (!supabase) return;
    void listCompanyBankAccounts(supabase, workspace.companyId).then((rows) => setBankAccounts(rows.map((row) => ({ id: String(row.id), label: [row.bank_name, row.account_name || row.iban || row.account_number].filter(Boolean).join(" · ") || "Bank account", isPrimary: Boolean(row.is_primary) })))).catch(() => setBankAccounts([]));
  }, [config.table, workspace.companyId, workspace.storage]);

  const loadOpenInvoices = useCallback(async (clientId: string) => {
    if (workspace.storage === "local") {
      const invoices = await (await getLocalStore()).listInvoices({ clientId });
      return invoices
        .filter((row) => Number(row.total_amount || 0) - Number(row.amount_received || 0) > 0.004 && !["draft", "cancelled", "void"].includes(String(row.status || "").toLowerCase()))
        .map((row) => ({ id: String(row.id), label: `${String(row.invoice_number || "Invoice")} · ${money(Number(row.total_amount || 0) - Number(row.amount_received || 0), workspace.company?.currency || "EUR")} due` }));
    }
    const supabase = createClient();
    if (!supabase || !workspace.user) return [];
    const rows = await listOpenCustomerInvoices(supabase, { userId: workspace.user.id, companyIds: workspace.companyIds }, clientId);
    return rows.map((row) => ({ id: String(row.id), label: `${String(row.invoice_number || "Invoice")} · ${money(Number(row.total_amount || 0) - Number(row.amount_received || 0), workspace.company?.currency || "EUR")} due` }));
  }, [workspace.user, workspace.companyIds, workspace.company?.currency, workspace.storage]);

  useEffect(() => {
    if (config.table !== "products" || !workspace.companyId || !selectedBranchId || workspace.storage === "local") return;
    const supabase = createClient();
    if (!supabase) return;
    void listProductBranchStock(supabase, workspace.companyId, selectedBranchId).then((rows) => setProductBranchStock(Object.fromEntries(rows.map((row) => [row.product_id, Number(row.stock_quantity) || 0])))).catch(() => setProductBranchStock({}));
  }, [config.table, selectedBranchId, workspace.companyId, workspace.storage, data.length]);

  const displayData = useMemo(() => config.table === "products"
    ? data.map((row) => productBranchStock[String(row.id)] === undefined ? row : { ...row, stock_quantity: productBranchStock[String(row.id)] })
    : data, [config.table, data, productBranchStock]);

  useEffect(() => {
    if (config.table !== "clients" || !workspace.companyIds.length) return;
    if (workspace.storage === "local") {
      void getLocalStore().then((store) => store.listInvoices()).then((invoices) => {
        const revenue = invoices.filter((row) => String(row.status || "").toLowerCase() === "paid").reduce<Record<string, number>>((result, row) => {
          if (row.client_id) result[String(row.client_id)] = (result[String(row.client_id)] || 0) + Number(row.total_amount || 0);
          return result;
        }, {});
        setCustomerRevenue(revenue);
      }).catch(() => setCustomerRevenue({}));
      return;
    }
    const supabase = createClient();
    if (!supabase) return;
    void supabase.from("invoices").select("client_id,total_amount").in("company_id", workspace.companyIds).eq("status", "paid").then(({ data }) => {
      const revenue = (data || []).reduce<Record<string, number>>((result, row) => {
        if (row.client_id) result[String(row.client_id)] = (result[String(row.client_id)] || 0) + Number(row.total_amount || 0);
        return result;
      }, {});
      setCustomerRevenue(revenue);
    });
  }, [companyScopeKey, config.table, workspace.companyIds, workspace.storage]);

  const rows = useMemo(() => {
    const filtered = displayData.filter((row) => {
    const matchesType = !config.fixed?.type || !row.type || row.type === config.fixed.type;
    const matchesSecondary = config.table === "products"
      ? (!secondaryFilter || String(row.category || "") === secondaryFilter)
      : config.table === "clients"
        ? (!secondaryFilter || String(row.city || "") === secondaryFilter)
        : true;
    return matchesType && matchesSecondary && JSON.stringify(row).toLowerCase().includes(query.trim().toLowerCase());
    });
    return filtered.sort((left, right) => {
      if (config.table === "products" && sortBy === "price") return Number(right.unit_price || 0) - Number(left.unit_price || 0);
      if (config.table === "products" && sortBy === "stock") return Number(right.stock_quantity || 0) - Number(left.stock_quantity || 0);
      if (config.table === "clients" && sortBy === "value") return (customerRevenue[String(right.id)] || 0) - (customerRevenue[String(left.id)] || 0);
      return String(left[config.primary] || "").localeCompare(String(right[config.primary] || ""));
    });
  }, [config.fixed, config.primary, config.table, customerRevenue, displayData, query, secondaryFilter, sortBy]);
  const categories = useMemo(() => Array.from(new Set(data.map((row) => String(row.category || "")).filter(Boolean))).sort(), [data]);
  const cities = useMemo(() => Array.from(new Set(data.map((row) => String(row.city || "")).filter(Boolean))).sort(), [data]);
  const productStats = config.table === "products" ? {
    total: displayData.length,
    value: displayData.reduce((sum, row) => sum + Number(row.unit_price || 0) * Number(row.stock_quantity || 0), 0),
    low: displayData.filter((row) => Boolean(row.track_stock) && Number(row.stock_quantity || 0) <= Number(row.low_stock_threshold || 5)).length,
    out: displayData.filter((row) => Boolean(row.track_stock) && Number(row.stock_quantity || 0) <= 0).length,
  } : null;
  const purchaseStats = (() => {
    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    const currency = workspace.company?.currency || workspace.profile?.currency;
    const sum = (rows: ResourceRow[], key: string) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);
    if (resourceKey === "supplier-bills") {
      const open = data.filter((row) => String(row.status || "").toLowerCase() !== "paid");
      const overdue = open.filter((row) => row.due_date && String(row.due_date) < today);
      return [
        { label: "Open bills", value: String(open.length), icon: Boxes, tone: undefined },
        { label: "Outstanding", value: money(sum(open, "total_amount"), currency), icon: TrendingUp, tone: "green" as const },
        { label: "Overdue", value: String(overdue.length), icon: AlertTriangle, tone: "red" as const },
      ];
    }
    if (resourceKey === "vendor-payments") {
      return [
        { label: "Payments", value: String(data.length), icon: Boxes, tone: undefined },
        { label: "Total paid", value: money(sum(data, "amount"), currency), icon: TrendingUp, tone: "green" as const },
        { label: "This month", value: money(sum(data.filter((row) => String(row.payment_date || "").startsWith(month)), "amount"), currency), icon: TrendingUp, tone: undefined },
      ];
    }
    if (resourceKey === "vendors") {
      return [
        { label: "Vendors", value: String(data.length), icon: Users, tone: undefined },
        { label: "With email", value: String(data.filter((row) => row.email).length), icon: Users, tone: "green" as const },
        { label: "With phone", value: String(data.filter((row) => row.phone).length), icon: Users, tone: undefined },
      ];
    }
    return null;
  })();
  const customerStats = config.table === "clients" ? {
    total: data.length,
    revenue: data.reduce((sum, row) => sum + (customerRevenue[String(row.id)] || 0), 0),
    active: data.filter((row) => (customerRevenue[String(row.id)] || 0) > 0).length,
    discounts: data.filter((row) => Number(row.discount_percent || 0) > 0).length,
  } : null;

  async function save(formData: FormData) {
    try { await saveRecord(formData); } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "The record could not be saved.");
      setSaving(false);
    }
  }

  async function saveRecord(formData: FormData) {
    if (editing ? !canEdit : !canCreate) { setMessage("You do not have permission to change this resource."); return; }
    setSaving(true);
    setMessage("");
    const payload: Record<string, unknown> = { ...config.fixed };
    config.fields.forEach((field) => {
      const value = formData.get(field.key);
      if (field.type === "checkbox") payload[field.key] = value !== null;
      else if (field.type === "number") {
        const numericValue = Number(value || 0);
        const boundedValue = Math.min(field.max ?? Number.POSITIVE_INFINITY, Math.max(field.min ?? Number.NEGATIVE_INFINITY, numericValue));
        payload[field.key] = config.table === "clients" && field.key === "discount_percent" ? Math.round(boundedValue) : boundedValue;
      } else payload[field.key] = field.relation && !value ? null : String(value || "");
    });
    if (workspace.storage === "local") {
      if (config.table === "payments") {
        const store = await getLocalStore();
        if (!payload.invoice_id && !payload.client_id) throw new Error("Select a customer, or the invoice this payment is for.");
        const method = String(payload.payment_method || "bank") as "cash" | "bank" | "card" | "online_payment" | "cheque" | "other";
        if (method === "cash" && !isCashPaymentAllowed(Number(payload.amount || 0))) throw new Error("Cash payments are limited to amounts below €300. Choose another method.");
        if (editing?.id) await store.reverseCustomerPayment(String(editing.id), "Edited");
        const recorded = await store.recordCustomerPayment({
          invoiceId: payload.invoice_id ? String(payload.invoice_id) : null,
          customerId: payload.client_id ? String(payload.client_id) : null,
          amount: Number(payload.amount || 0),
          paymentDate: String(payload.payment_date || new Date().toISOString().slice(0, 10)),
          paymentMethod: method,
          companyBankAccountId: method === "bank" ? String(formData.get("company_bank_account_id") || "") || null : null,
          bankReference: payload.bank_reference ? String(payload.bank_reference) : undefined,
          notes: payload.notes ? String(payload.notes) : undefined,
          paymentNumber: payload.payment_number ? String(payload.payment_number) : undefined,
        });
        await refresh();
        setSaving(false); setModal(false); setEditing(null);
        window.open(`/transactions/preview?type=payments&id=${recorded.id}`, "_blank");
        return;
      }
      const saved = await saveLocalResource(config.table, payload, editing?.id);
      await refresh();
      setSaving(false); setModal(false); setEditing(null);
      if (config.table === "expenses") window.open(`/transactions/preview?type=${config.fixed?.type || config.table}&id=${saved.id}`, "_blank");
      return;
    }
    const supabase = createClient();
    if (!supabase) { setMessage("Supabase is not configured."); setSaving(false); return; }
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) { setMessage("Your session has expired."); setSaving(false); return; }
    const companyId = workspace.companyId;
    if (!companyId) { setMessage("No active company workspace is configured."); setSaving(false); return; }
    payload.user_id = authData.user.id;
    payload.company_id = companyId;
    const branchId = config.table === "products" ? String(payload.branch_id || selectedBranchId || "") : "";
    delete payload.branch_id;
    let resultData: ResourceRow;
    if (config.table === "payments") {
      if (!payload.client_id) { setMessage("Select a customer for this payment."); setSaving(false); return; }
      const paymentMethod = String(payload.payment_method || "bank") as PaymentFundMethod;
      const bankAccountId = paymentMethod === "bank" ? String(formData.get("company_bank_account_id") || "") : "";
      if (Number(payload.amount || 0) <= 0) { setMessage("Enter a payment amount greater than zero."); setSaving(false); return; }
      if (paymentMethod === "cash" && !isCashPaymentAllowed(Number(payload.amount || 0))) { setMessage("Cash payments are limited to amounts below €300. Choose another method."); setSaving(false); return; }
      if (paymentMethod === "bank" && !bankAccountId) { setMessage("Select the bank account that received this payment."); setSaving(false); return; }
      const fundAccounts = await listFinancialAccountBalances(supabase, { userId: authData.user.id, companyIds: workspace.companyIds }).catch(() => []);
      const paymentResult = await saveCustomerPayment(supabase, {
        userId: authData.user.id,
        companyId,
        customerId: String(payload.client_id),
        invoiceId: payload.invoice_id ? String(payload.invoice_id) : null,
        paymentNumber: payload.payment_number ? String(payload.payment_number) : null,
        amount: Number(payload.amount || 0),
        paymentDate: String(payload.payment_date || ""),
        paymentMethod,
        companyBankAccountId: bankAccountId || null,
        fundAccountId: resolvePaymentFundAccount(fundAccounts, paymentMethod, bankAccountId),
        bankReference: payload.bank_reference ? String(payload.bank_reference) : null,
        notes: payload.notes ? String(payload.notes) : null,
        existingPaymentId: editing?.id || null,
        currency: workspace.company?.currency || workspace.profile?.currency || "EUR",
        idempotencyKey: paymentIdempotencyKey.current || (paymentIdempotencyKey.current = crypto.randomUUID()),
      });
      resultData = paymentResult.payment as ResourceRow;
      if (paymentResult.allocationError) setMessage(`Payment saved, but invoice allocation needs attention: ${paymentResult.allocationError.message}`);
    } else if (config.table === "clients") {
      resultData = await saveCustomer(supabase, payload as Record<string, unknown> & { user_id: string; company_id: string }, editing?.id) as ResourceRow;
    } else if (config.table === "products") {
      resultData = await saveProduct(supabase, payload as Record<string, unknown> & { user_id: string; company_id: string }, editing?.id) as ResourceRow;
      if (branchId && Boolean(payload.track_stock)) {
        await saveProductBranchStock(supabase, { companyId, productId: resultData.id, branchId, stockQuantity: Number(payload.stock_quantity || 0), lowStockThreshold: Number(payload.low_stock_threshold || 5) });
      }
    } else if (config.table === "expenses") {
      resultData = await saveExpense(supabase, payload as Record<string, unknown> & { user_id: string; company_id: string }, editing?.id, {
        postExpense: !editing && config.fixed?.type === "expense",
        correctPostedExpense: Boolean(editing?.id && editing.accounting_state === "posted" && (editing.type || config.fixed?.type) === "expense"),
      }) as ResourceRow;
    } else {
      resultData = await saveScopedResource(supabase, config.table, payload, editing?.id) as ResourceRow;
    }
    await refresh();
    if (config.table === "payments") paymentIdempotencyKey.current = null;
    setSaving(false);
    setModal(false);
    setEditing(null);
    if (["payments", "expenses"].includes(config.table)) window.open(`/transactions/preview?type=${config.fixed?.type || config.table}&id=${resultData.id}`, "_blank");
  }

  async function remove(id: string) {
    if (!canDelete) { setMessage("You do not have permission to delete or reverse this resource."); return; }
    if (!window.confirm(config.table === "payments" ? "Remove this payment? A payment already posted to the accounts is reversed with an audit entry instead of being erased." : `Delete this ${config.singular.toLowerCase()}?`)) return;
    const supabase = workspace.storage === "local" ? null : createClient();
    if (workspace.storage === "local") {
      try { await removeLocalResource(config.table, id); } catch (removeError) {
        setMessage(removeError instanceof Error ? removeError.message : "The record could not be removed.");
        return;
      }
    }
    if (supabase) {
      try {
        if (config.table === "payments") await deleteCustomerPayment(supabase, id, { userId: workspace.user?.id || "", companyIds: workspace.companyIds });
        else if (config.table === "clients") await deleteCustomer(supabase, id, workspace.companyId || "", workspace.user?.id);
        else if (config.table === "products") await deleteProduct(supabase, id, workspace.companyId || "", workspace.user?.id);
        else if (config.table === "expenses") await deleteExpense(supabase, id, workspace.companyId || "", workspace.user?.id);
        else await deleteScopedResource(supabase, config.table, id, workspace.companyId || "");
      } catch (removeError) {
        setMessage(removeError instanceof Error ? removeError.message : "The record could not be removed.");
        return;
      }
    }
    setData((current) => current.filter((row) => row.id !== id));
  }

  function exportCsv() {
    if (!canExport) { setMessage("Financial export permission is required."); return; }
    const csv = [config.columns.map((column) => column.label), ...rows.map((row) => config.columns.map((column) => String(readValue(row, column.key) ?? "")))];
    const blob = new Blob([csv.map((line) => line.map((cell) => `"${cell.replaceAll("\"", "\"\"")}"`).join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `operix-${resourceKey}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function exportPdf() {
    if (!canExport) { setMessage("Financial export permission is required."); return; }
    setExporting(true);
    setMessage("");
    try {
      const source = workspace.company || workspace.profile;
      const supabase = createClient();
      let exportRows: Array<Record<string, unknown>> = rows;
      let reportPeriod: undefined | { from: string; to: string; label: string; filingFrequency: "monthly" };
      if (config.pdfTemplate === "sales-ledger" && supabase) {
        const [year, month] = reportMonth.split("-").map(Number);
        if (!year || !month) throw new Error("Select a valid reporting month.");
        const from = `${year}-${String(month).padStart(2, "0")}-01`;
        const nextMonth = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
        const to = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
        reportPeriod = { from, to, label: reportMonth, filingFrequency: "monthly" };
        let request = supabase.from("kosovo_sales_book").select("*").gte("invoice_date", from).lt("invoice_date", nextMonth).order("invoice_date", { ascending: true }).order("invoice_number");
        if (workspace.companyIds.length) request = request.in("company_id", workspace.companyIds);
        const result = await request;
        if (result.error) throw result.error;
        exportRows = (result.data || []) as Array<Record<string, unknown>>;
      }
      if (config.pdfTemplate === "vendor-ledger" && supabase) {
        let request = supabase.from("supplier_bills").select("*, vendor:vendors(*)").order("issue_date", { ascending: true });
        if (workspace.companyIds.length) request = request.in("company_id", workspace.companyIds);
        const result = await request;
        if (result.error) throw result.error;
        exportRows = (result.data || []) as Array<Record<string, unknown>>;
      }
      const company = { name: source?.company_name || workspace.company?.name || "", email: source?.email || "", phone: source?.phone || "", address: source?.address || "", city: workspace.company?.city || "", country: workspace.company?.country || "", website: source?.website || "", taxId: source?.tax_id || "", bankName: source?.bank_name || "", bankAccount: source?.bank_account || "", iban: source?.bank_iban || "", swift: source?.bank_swift || "", logoUrl: source?.logo_url || "" };
      const response = await fetch("/api/transactions/pdf", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ template: config.pdfTemplate, title: config.title, company, rows: exportRows, reportPeriod }) });
      if (!response.ok) { const detail = await response.json().catch(() => null); throw new Error(detail?.error || "The PDF could not be generated."); }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = config.pdfTemplate === "sales-ledger" ? `operix-sales-book-${reportMonth}.pdf` : `operix-${resourceKey}-${new Date().toISOString().slice(0, 10)}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setMessage(exportError instanceof Error ? exportError.message : "The PDF could not be generated.");
    } finally { setExporting(false); }
  }

  function closeModal() { setModal(false); setEditing(null); setPrefill(null); setMessage(""); }
  function openEdit(row: ResourceRow) {
    setEditing(config.table === "products" ? { ...row, stock_quantity: productBranchStock[String(row.id)] ?? row.stock_quantity } : row);
    setModal(true);
  }
  const pdfExport = Boolean(config.pdfTemplate);
  const rootClass = embedded ? "resource-page resource-page-embedded" : "ux-page resource-page";

  if (!canRead) return <div className={rootClass}><PageHeader title={config.title} description={config.description} /><SectionCard><p className="muted">You do not have permission to view this resource.</p></SectionCard></div>;

  return <div className={rootClass}>
    {!embedded && ["vendors", "supplier-bills", "vendor-payments"].includes(resourceKey) ? <PurchasesNav /> : null}
    <PageHeader title={config.title} description={config.description} actions={<>{resourceKey === "products" && canEdit ? <button type="button" className="btn" onClick={() => setImportModal(true)}><FileUp size={16} /> Import calculations</button> : null}{canCreate ? <button data-testid={resourceKey === "customers" ? "customer.create" : resourceKey === "products" ? "product.create" : resourceKey === "expenses" ? "expense.create" : "resource.create"} type="button" className="btn btn-primary" onClick={() => { setEditing(null); setModal(true); }}><Plus size={16} /> New {config.singular}</button> : null}</>} />
    {purchaseStats && !loading ? <section className="invoice-list-summary resource-stats-grid">{purchaseStats.map((stat) => <MetricCard key={stat.label} label={stat.label} value={stat.value} icon={stat.icon} tone={stat.tone} />)}</section> : null}
    {productStats ? <section className="invoice-list-summary resource-stats-grid"><MetricCard label="Products" value={String(productStats.total)} icon={Boxes} /><MetricCard label="Stock value" value={money(productStats.value, workspace.company?.currency || workspace.profile?.currency)} icon={TrendingUp} tone="green" /><MetricCard label="Low stock" value={String(productStats.low)} icon={AlertTriangle} tone="amber" /><MetricCard label="Out of stock" value={String(productStats.out)} icon={XCircle} tone="red" /></section> : null}
    {customerStats ? <section className="invoice-list-summary resource-stats-grid"><MetricCard label="Customers" value={String(customerStats.total)} icon={Users} /><MetricCard label="Paid invoice value" value={money(customerStats.revenue, workspace.company?.currency || workspace.profile?.currency)} icon={TrendingUp} tone="green" /><MetricCard label="Active customers" value={String(customerStats.active)} icon={Users} tone="green" /><MetricCard label="With default discount" value={String(customerStats.discounts)} icon={FileSpreadsheet} tone="amber" /></section> : null}
    <div className="resource-toolbar"><SearchField value={query} onChange={setQuery} placeholder={`Search ${config.title.toLowerCase()}…`} />{resourceKey === "products" ? <select aria-label="Filter products by category" className="select resource-filter-select" value={secondaryFilter} onChange={(event) => setSecondaryFilter(event.target.value)}><option value="">All categories</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select> : null}{resourceKey === "customers" ? <select aria-label="Filter customers by city" className="select resource-filter-select" value={secondaryFilter} onChange={(event) => setSecondaryFilter(event.target.value)}><option value="">All cities</option>{cities.map((city) => <option key={city} value={city}>{city}</option>)}</select> : null}{resourceKey === "products" || resourceKey === "customers" ? <select aria-label={`Sort ${config.title.toLowerCase()}`} className="select resource-sort-select" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>{resourceKey === "products" ? <><option value="name">Sort: name</option><option value="price">Sort: price</option><option value="stock">Sort: stock</option></> : <><option value="name">Sort: name</option><option value="value">Sort: paid value</option></>}</select> : null}{config.pdfTemplate === "sales-ledger" ? <label className="field resource-month-field"><span className="sr-only">Reporting month</span><input aria-label="Reporting month" className="input" type="month" value={reportMonth} onChange={(event) => setReportMonth(event.target.value)} /></label> : null}{canExport ? <button type="button" className="btn resource-export" onClick={pdfExport ? exportPdf : exportCsv} disabled={exporting}><Download size={16} />{exporting ? "Preparing…" : pdfExport ? "Export PDF" : "Export"}</button> : null}</div>
    {message ? <p className="resource-message">{message}</p> : null}
    {error ? <ErrorState message={error} onRetry={() => void refresh()} /> : null}
    {loading ? <SectionCard><LoadingSkeleton rows={6} /></SectionCard> : null}
    {!loading && !error && !rows.length ? <SectionCard><EmptyState title={`No ${config.title.toLowerCase()} yet`} description={canCreate ? `Create the first ${config.singular.toLowerCase()} to start keeping this area up to date.` : `There are no ${config.title.toLowerCase()} available in this workspace.`} actionLabel={canCreate ? `New ${config.singular}` : undefined} onAction={canCreate ? () => setModal(true) : undefined} icon={resourceKey === "customers" ? FileSpreadsheet : MoreHorizontal} /></SectionCard> : null}
    {!loading && !error && rows.length ? <>
      <section className="ux-section-card resource-desktop-table"><div className="table-wrap"><table className="data-table"><thead><tr>{config.columns.map((column) => <th key={column.key}>{column.label}</th>)}<th className="actions-column">Actions</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}>{config.columns.map((column) => <td key={column.key} className={column.key === config.primary ? "font-medium" : ""}>{column.key === "status" ? <StatusBadge status={String(row[column.key] || "draft")} /> : column.render ? column.render(row) : String(row[column.key] ?? "—")}</td>)}<td className="actions-column"><div className="resource-row-actions">{resourceKey === "customers" ? <button type="button" onClick={() => setLedgerCustomer(row)} title="Open customer ledger"><FileSpreadsheet size={14} /> <span>Ledger</span></button> : null}{canEdit ? <button type="button" onClick={() => openEdit(row)} title="Edit"><Edit3 size={14} /> <span>Edit</span></button> : null}{canDelete ? <button type="button" className="is-danger" onClick={() => void remove(row.id)} title="Delete"><Trash2 size={14} /> <span>Delete</span></button> : null}{!canEdit&&!canDelete ? <span className="muted text-xs">View only</span> : null}</div></td></tr>)}</tbody></table></div><footer className="resource-footer">Showing {rows.length} records</footer></section>
      <section className="resource-mobile-list">{rows.map((row) => <ResourceCard key={row.id} row={row} config={config} canEdit={canEdit} canDelete={canDelete} onLedger={resourceKey === "customers" ? () => setLedgerCustomer(row) : undefined} onEdit={() => openEdit(row)} onDelete={() => void remove(row.id)} />)}</section>
    </> : null}
    {resourceKey === "customers" && <PortalLinksView embedded />}
    {ledgerCustomer ? <CustomerLedgerDialog customer={ledgerCustomer} onClose={() => setLedgerCustomer(null)} /> : null}
    {importModal ? <ProductImportDialog onClose={() => setImportModal(false)} onImported={refresh} /> : null}
    {modal ? <ResourceModal key={Object.values(relationOptions).map((options) => options.length).join("-") + bankAccounts.length} prefill={prefill} bankAccounts={bankAccounts} loadOpenInvoices={loadOpenInvoices} config={config} editing={editing} relationOptions={relationOptions} branchOptions={branchOptions} selectedBranchId={selectedBranchId} saving={saving} message={message} onClose={closeModal} onSave={save} /> : null}
  </div>;
}

function ResourceCard({ row, config, canEdit, canDelete, onLedger, onEdit, onDelete }: { row: ResourceRow; config: ResourceConfig; canEdit: boolean; canDelete: boolean; onLedger?: () => void; onEdit: () => void; onDelete: () => void }) {
  const primary = String(readValue(row, config.primary) ?? row[config.columns[0]?.key] ?? "—");
  const secondary = config.columns.filter((column) => column.key !== config.primary).slice(0, 2).map((column) => `${column.label}: ${String(column.render ? column.render(row) : readValue(row, column.key) ?? "—")}`).join(" · ");
  const statusColumn = config.columns.find((column) => column.key === "status");
  const amountColumn = config.columns.find((column) => /amount|price|total|cost/i.test(column.key));
  const amount = amountColumn ? String(amountColumn.render ? amountColumn.render(row) : readValue(row, amountColumn.key) ?? "") : "";
  return <article className="resource-mobile-card"><div className="resource-mobile-card-leading"><span className="resource-mobile-card-icon"><MoreHorizontal size={17} /></span><div><strong>{primary}</strong><small>{secondary}</small></div></div><div className="resource-mobile-card-trailing">{amount ? <strong>{amount}</strong> : null}{statusColumn ? <StatusBadge status={String(row.status || "draft")} /> : null}<details className="relative"><summary className="icon-btn list-none" aria-label={`Actions for ${primary}`}><MoreHorizontal size={16} /></summary><div className="action-menu">{onLedger ? <button type="button" onClick={onLedger}>Open ledger</button> : null}{canEdit ? <button type="button" onClick={onEdit}>Edit</button> : null}{canDelete ? <button type="button" onClick={onDelete}>Delete</button> : null}{!canEdit&&!canDelete ? <span className="muted block px-2 py-1 text-xs">View only</span> : null}</div></details></div></article>;
}

function resourceAccess(resourceKey: string, table: string) {
  if (resourceKey === "customers" || table === "clients") return { read: "customer.view", create: "customer.create", edit: "customer.edit", delete: "customer.delete" };
  if (resourceKey === "products" || table === "products") return { read: "product.view", create: "product.create", edit: "product.edit", delete: "product.delete" };
  if (resourceKey === "expenses") return { read: "expense.view_own", create: "expense.create", edit: "expense.edit", delete: "expense.manage" };
  if (resourceKey === "payments" || table === "payments") return { read: "payment.view", create: "payment.create", edit: "payment.create", delete: "payment.refund" };
  if (resourceKey === "income") return { read: "payment.view", create: "payment.create", edit: "payment.create", delete: "payment.refund" };
  if (resourceKey === "vendors" || resourceKey === "supplier-bills" || resourceKey === "vendor-payments") return { read: "expense.view_own", create: "expense.manage", edit: "expense.manage", delete: "expense.manage" };
  if (resourceKey === "tax-reports") return { read: "reports.tax", create: "settings.tax", edit: "settings.tax", delete: "settings.tax" };
  if (resourceKey === "payment-links") return { read: "payment.view", create: "payment.create", edit: "payment.create", delete: "payment.refund" };
  if (resourceKey === "contracts" || table === "contracts") return { read: "contracts.manage", create: "contracts.manage", edit: "contracts.manage", delete: "contracts.manage" };
  return { read: "invoice.view", create: "invoice.create", edit: "invoice.edit", delete: "invoice.delete_draft" };
}

function ResourceModal({ config, editing, prefill, bankAccounts, loadOpenInvoices, relationOptions, branchOptions, selectedBranchId, saving, message, onClose, onSave }: { config: ResourceConfig; editing: ResourceRow | null; prefill: Record<string, string> | null; bankAccounts: Array<{ id: string; label: string; isPrimary: boolean }>; loadOpenInvoices: (clientId: string) => Promise<Array<{ id: string; label: string }>>; relationOptions: Record<string, Array<{ id: string; label: string }>>; branchOptions: Array<{ id: string; name: string }>; selectedBranchId: string | null; saving: boolean; message: string; onClose: () => void; onSave: (formData: FormData) => Promise<void> }) {
  const isPayment = config.table === "payments";
  const [clientId, setClientId] = useState(String(editing?.client_id ?? prefill?.client_id ?? ""));
  const [method, setMethod] = useState(String(editing?.payment_method ?? (isCashPaymentAllowed(prefill?.amount) ? "cash" : "bank")));
  const [amount, setAmount] = useState(String(editing?.amount ?? prefill?.amount ?? ""));
  const [openInvoices, setOpenInvoices] = useState<Array<{ id: string; label: string }> | null>(null);
  useEffect(() => {
    if (!isPayment || !clientId) { setOpenInvoices(null); return; }
    let cancelled = false;
    void loadOpenInvoices(clientId).then((rows) => { if (!cancelled) setOpenInvoices(rows); }).catch(() => { if (!cancelled) setOpenInvoices(null); });
    return () => { cancelled = true; };
  }, [isPayment, clientId, loadOpenInvoices]);
  const cashBlocked = !isCashPaymentAllowed(amount);
  const primaryBank = bankAccounts.find((account) => account.isPrimary) || bankAccounts[0];
  return <div className="resource-modal-backdrop" onMouseDown={onClose}><section className="resource-modal" onMouseDown={(event) => event.stopPropagation()}><header className="resource-modal-header"><div><h2>{editing ? "Edit" : "New"} {config.singular}</h2><p>Keep the information clear and up to date.</p></div><button type="button" className="icon-btn" onClick={onClose} aria-label="Close form"><X size={18} /></button></header><form action={onSave}><div className="resource-modal-fields">{config.table === "products" && branchOptions.length ? <label className="field"><span>Stock branch</span><select className="select" name="branch_id" defaultValue={selectedBranchId || ""}><option value="">Global stock</option>{branchOptions.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label> : null}{config.fields.map((field) => { const defaultValue = editing?.[field.key] ?? prefill?.[field.key] ?? field.defaultValue ?? (!editing && field.key === "payment_date" ? new Date().toISOString().slice(0, 10) : ""); if (field.type === "checkbox") return <label className="field flex-row items-center gap-3" key={field.key}><input className="h-4 w-4" name={field.key} type="checkbox" defaultChecked={Boolean(defaultValue)} /><span>{field.label}{field.required ? " *" : ""}</span></label>; const control = <label className={`field ${field.type === "textarea" ? "field-wide" : ""}`} key={field.key}><span>{field.label}{field.required ? " *" : ""}</span>{field.relation ? <select key={isPayment && field.key === "invoice_id" ? `invoice-${clientId}-${openInvoices ? "open" : "all"}` : field.key} className="select" name={field.key} required={field.required} defaultValue={String(defaultValue)} onChange={isPayment && field.key === "client_id" ? (event) => setClientId(event.target.value) : undefined}><option value="">{isPayment && field.key === "invoice_id" ? "No invoice (on account)" : `Select ${field.label.toLowerCase()}`}</option>{(isPayment && field.key === "invoice_id" && openInvoices ? [...openInvoices, ...(relationOptions[field.key] || []).filter((option) => option.id === String(defaultValue) && !openInvoices.some((open) => open.id === option.id))] : relationOptions[field.key])?.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select> : field.type === "select" ? <select className="select" name={field.key} required={field.required} defaultValue={String(defaultValue)} onChange={isPayment && field.key === "payment_method" ? (event) => setMethod(event.target.value) : undefined}>{field.options?.map((option) => <option key={option} value={option} disabled={isPayment && field.key === "payment_method" && option === "cash" && cashBlocked}>{field.key === "payment_method" ? PAYMENT_METHOD_LABELS[option] || option : option}</option>)}</select> : field.type === "textarea" ? <textarea className="textarea" name={field.key} defaultValue={String(defaultValue)} /> : <input className="input" name={field.key} type={field.type || "text"} min={field.min} max={field.max} step={field.step ?? (field.type === "number" ? "0.01" : undefined)} required={field.required} defaultValue={String(defaultValue)} onChange={isPayment && field.key === "amount" ? (event) => setAmount(event.target.value) : undefined} />}</label>; if (!(isPayment && field.key === "payment_method" && method === "bank")) return control; return <Fragment key={field.key}>{control}<label className="field"><span>Bank account *</span><select className="select" name="company_bank_account_id" required defaultValue={String(editing?.company_bank_account_id ?? primaryBank?.id ?? "")}><option value="">Select bank account</option>{bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}</select></label></Fragment>; })}</div>{isPayment && method === "cash" && cashBlocked ? <p className="resource-modal-error">Cash payments are limited to amounts below €300. Choose another method.</p> : null}{message ? <p className="resource-modal-error">{message}</p> : null}<footer className="resource-modal-footer"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving ? "Saving…" : `${editing ? "Update" : "Save"} ${config.singular}`}</button></footer></form></section></div>;
}

function readValue(row: Record<string, unknown>, key: string) { return key.split(".").reduce<unknown>((current, part) => current && typeof current === "object" ? (current as Record<string, unknown>)[part] : undefined, row); }
