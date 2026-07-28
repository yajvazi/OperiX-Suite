"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Banknote,
  CircleHelp,
  CreditCard,
  FileText,
  Minus,
  Package,
  Plus,
  Printer,
  Search,
  ShoppingCart,
  Trash2,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import { useBusinessData } from "@/hooks/use-business-data";
import { useWorkspace } from "@/hooks/use-workspace";
import { addDays, isoToday, money } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type {
  ClientRow,
  InvoiceDraft,
  InvoiceEditorItem,
  PaymentMethod,
  ProductRow,
} from "@/lib/models";
import type { DocumentCompany } from "./invoice-document";

type DiscountMode = "amount" | "percent";
type PosPayment = "cash" | "card" | "debt" | "other";
type PosInvoiceType = "invoice" | "offer" | "proforma" | "order";

const invoiceTypes: Array<{ value: PosInvoiceType; label: string; type: string; subtype: string }> = [
  { value: "invoice", label: "Invoice", type: "invoice", subtype: "regular" },
  { value: "offer", label: "Quote", type: "offer", subtype: "offer" },
  { value: "proforma", label: "Proforma invoice", type: "proforma", subtype: "pro_invoice" },
  { value: "order", label: "Order", type: "offer", subtype: "order" },
];

interface CartItem {
  id: string;
  productId: string;
  name: string;
  sku?: string;
  unit: string;
  unitPrice: number;
  taxRate: number;
  quantity: number;
  discountPercent: number;
}

interface HeldOrderSnapshot {
  items: CartItem[];
  clientId: string;
  invoiceType: PosInvoiceType;
  discountMode: DiscountMode;
  discountValue: number;
  taxRate: number;
  note: string;
  payment: PosPayment;
  cashReceived: number;
}

interface HeldOrder {
  id: string;
  version: number;
  status?: string;
  terminal_id?: string;
  cart_snapshot: HeldOrderSnapshot;
}

interface PosTerminal {
  id: string;
  terminal_code: string;
  display_name: string;
  branch_id: string;
  warehouse_id: string | null;
  fiscal_location_id: string | null;
  cashier_shift_required: boolean;
}

const paymentOptions: Array<{ value: PosPayment; label: string; icon: typeof Banknote }> = [
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "card", label: "Card", icon: CreditCard },
  { value: "debt", label: "Debt", icon: WalletCards },
  { value: "other", label: "Other", icon: CircleHelp },
];

function categoryLabel(value: string) {
  return value.trim() || "Uncategorized";
}

function paymentMethod(value: PosPayment): PaymentMethod {
  if (value === "cash") return "cash";
  if (value === "debt") return "bank";
  return "card";
}

function parseDecimalInput(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized || normalized === ".") return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function makeInvoiceNumber(type: PosInvoiceType) {
  const prefix: Record<PosInvoiceType, string> = { invoice: "INV", offer: "QUO", proforma: "PRO", order: "ORD" };
  return `${prefix[type]}-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
}

export function PosView() {
  const router = useRouter();
  const workspace = useWorkspace();
  const productsQuery = useBusinessData<ProductRow>("products");
  const clientsQuery = useBusinessData<ClientRow>("clients");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [clientId, setClientId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [invoiceType, setInvoiceType] = useState<PosInvoiceType>("invoice");
  const [discountMode, setDiscountMode] = useState<DiscountMode>("percent");
  const [discountValue, setDiscountValue] = useState(0);
  const [taxRate, setTaxRate] = useState(18);
  const [note, setNote] = useState("");
  const [payment, setPayment] = useState<PosPayment>("cash");
  const [cashReceived, setCashReceived] = useState(0);
  const [cashReceivedText, setCashReceivedText] = useState("");
  const [heldOrder, setHeldOrder] = useState<HeldOrder | null>(null);
  const [terminals, setTerminals] = useState<PosTerminal[]>([]);
  const [terminalId, setTerminalId] = useState("");
  const [terminalsLoading, setTerminalsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"error" | "success">("error");
  const searchRef = useRef<HTMLInputElement>(null);
  const completionIdempotencyKeyRef = useRef<string | null>(null);

  const products = productsQuery.data;
  const clients = clientsQuery.data;
  const source = workspace.company || workspace.profile;
  const currency = source?.currency || "EUR";
  const matchingClients = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();
    if (!query) return clients.slice(0, 30);
    return clients.filter((client) => [client.name, client.email, client.phone].filter(Boolean).join(" ").toLowerCase().includes(query)).slice(0, 30);
  }, [clients, customerSearch]);

  useEffect(() => {
    const configuredRate = Number(workspace.company?.tax_rate ?? workspace.profile?.tax_rate);
    if (Number.isFinite(configuredRate) && configuredRate > 0) queueMicrotask(() => setTaxRate(configuredRate));
  }, [workspace.company?.tax_rate, workspace.profile?.tax_rate]);

  // A transient network failure must reuse the same key. A meaningful checkout
  // change intentionally starts a new transaction.
  useEffect(() => {
    completionIdempotencyKeyRef.current = null;
  }, [cart, clientId, discountMode, discountValue, invoiceType, note, payment, taxRate, terminalId]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    const userId = workspace.user?.id;
    if (!workspace.companyId || !userId) return;
    let cancelled = false;
    const loadHeldOrder = async () => {
      const supabase = createClient();
      if (!supabase) return;
      const { data, error } = await supabase
        .from("held_orders")
        .select("id,version,status,terminal_id,cart_snapshot")
        .eq("company_id", workspace.companyId)
        .eq("cashier_id", userId)
        .eq("status", "held")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        // The feature is deliberately off for existing companies. A missing
        // migration or disabled RLS path must not break the rest of checkout.
        if (error.code !== "42P01") setMessage(error.message);
        return;
      }
      if (data) {
        const order = data as unknown as HeldOrder;
        setHeldOrder(order);
        if (order.terminal_id) setTerminalId(order.terminal_id);
      }
    };
    void loadHeldOrder();
    return () => { cancelled = true; };
  }, [workspace.companyId, workspace.user?.id]);

  useEffect(() => {
    if (!workspace.companyId) return;
    let cancelled = false;
    const loadTerminals = async () => {
      setTerminalsLoading(true);
      const supabase = createClient();
      if (!supabase) {
        setTerminalsLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("pos_terminals")
        .select("id,terminal_code,display_name,branch_id,warehouse_id,fiscal_location_id,cashier_shift_required")
        .eq("company_id", workspace.companyId)
        .eq("active", true)
        .order("display_name");
      if (cancelled) return;
      setTerminalsLoading(false);
      if (error) {
        if (error.code !== "42P01") {
          setMessageTone("error");
          setMessage(error.message);
        }
        return;
      }
      const activeTerminals = (data || []) as PosTerminal[];
      setTerminals(activeTerminals);
      setTerminalId((current) => (
        activeTerminals.some((terminal) => terminal.id === current)
          ? current
          : activeTerminals.length === 1
            ? activeTerminals[0].id
            : ""
      ));
    };
    void loadTerminals();
    return () => { cancelled = true; };
  }, [workspace.companyId]);

  const categories = useMemo(() => {
    const values = new Set(products.map((product) => categoryLabel(String(product.category || ""))));
    return ["All", ...Array.from(values).sort((a, b) => a.localeCompare(b))];
  }, [products]);

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((product) => {
      const productCategory = categoryLabel(String(product.category || ""));
      const matchesCategory = category === "All" || productCategory === category;
      const searchable = [product.name, product.description, product.sku, product.barcode, product.category].filter(Boolean).join(" ").toLowerCase();
      return matchesCategory && (!query || searchable.includes(query));
    });
  }, [category, products, search]);

  const totals = useMemo(() => {
    const subtotal = cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const itemDiscount = cart.reduce((sum, item) => sum + item.quantity * item.unitPrice * Math.min(100, Math.max(0, item.discountPercent)) / 100, 0);
    const afterItemDiscount = Math.max(0, subtotal - itemDiscount);
    const globalDiscount = discountMode === "percent" ? afterItemDiscount * Math.min(100, Math.max(0, discountValue)) / 100 : Math.min(afterItemDiscount, Math.max(0, discountValue));
    const discount = itemDiscount + globalDiscount;
    const total = Math.max(0, subtotal - discount);
    // POS product prices are tax-inclusive. Show the tax portion separately
    // without adding it a second time to the amount the customer pays.
    const tax = total * Math.max(0, taxRate) / (100 + Math.max(0, taxRate));
    const taxable = total - tax;
    return { subtotal, itemDiscount, globalDiscount, discount, tax, total, taxable };
  }, [cart, discountMode, discountValue, taxRate]);

  const change = payment === "cash" ? Math.max(0, cashReceived - totals.total) : 0;
  const amountDue = payment === "cash" ? Math.max(0, totals.total - cashReceived) : 0;
  const selectedClient = clients.find((client) => client.id === clientId);
  const busy = saving || productsQuery.loading || clientsQuery.loading;

  function addProduct(product: ProductRow) {
    setMessage("");
    const quantity = 1;
    setCart((current) => {
      const existing = current.find((item) => item.productId === product.id);
      if (existing) return current.map((item) => item.productId === product.id ? { ...item, quantity: item.quantity + quantity } : item);
      return [...current, {
        id: crypto.randomUUID(),
        productId: product.id,
        name: product.name,
        sku: product.sku ? String(product.sku) : product.barcode ? String(product.barcode) : undefined,
        unit: product.unit ? String(product.unit) : "pcs",
        unitPrice: Number(product.unit_price) || 0,
        taxRate: Number(product.tax_rate) || 0,
        quantity,
        discountPercent: 0,
      }];
    });
  }

  function updateQuantity(id: string, quantity: number) {
    setCart((current) => quantity <= 0 ? current.filter((item) => item.id !== id) : current.map((item) => item.id === id ? { ...item, quantity } : item));
  }

  function updateProductQuantity(productId: string, quantity: number) {
    const item = cart.find((entry) => entry.productId === productId);
    if (item) updateQuantity(item.id, quantity);
  }

  function updateProductDiscount(id: string, discountPercent: number) {
    setCart((current) => current.map((item) => item.id === id ? { ...item, discountPercent: Math.min(100, Math.max(0, discountPercent)) } : item));
  }

  function clearCart() {
    if (!cart.length || window.confirm("Clear the current POS invoice?")) {
      setCart([]);
      setCashReceived(0);
      setCashReceivedText("");
      setMessage("");
    }
  }

  async function holdCurrentCart() {
    const supabase = createClient();
    if (!supabase || !workspace.companyId) {
      setMessageTone("error");
      setMessage("A company workspace is required to hold an order.");
      return;
    }
    if (!terminalId) {
      setMessageTone("error");
      setMessage(terminals.length
        ? "Select a POS terminal before holding this order."
        : "No active POS terminal is configured for this company.");
      return;
    }
    setSaving(true);
    setMessage("");
    if (cart.length) {
      const snapshot: HeldOrderSnapshot = {
        items: cart,
        clientId,
        invoiceType,
        discountMode,
        discountValue,
        taxRate,
        note,
        payment,
        cashReceived,
      };
      const { data, error } = await supabase.rpc("hold_pos_order", {
        p_company_id: workspace.companyId,
        p_terminal_id: terminalId,
        p_customer_id: clientId || null,
        p_cart_snapshot: snapshot,
        p_expires_at: null,
      });
      if (error) {
        setMessageTone("error");
        setMessage(error.message);
        setSaving(false);
        return;
      }
      setHeldOrder(data as unknown as HeldOrder);
      setCart([]);
      setCashReceived(0);
      setCashReceivedText("");
      setMessageTone("success");
      setMessage("Order held securely on this terminal.");
    } else if (heldOrder) {
      const { data, error } = await supabase.rpc("resume_held_pos_order", {
        p_company_id: workspace.companyId,
        p_held_order_id: heldOrder.id,
        p_expected_version: heldOrder.version,
      });
      if (error) {
        setMessageTone("error");
        setMessage(error.message);
        setSaving(false);
        return;
      }
      const resumed = data as unknown as HeldOrder;
      if (resumed.status === "expired") {
        setHeldOrder(null);
        setMessageTone("error");
        setMessage("This held order has expired.");
        setSaving(false);
        return;
      }
      const snapshot = resumed.cart_snapshot;
      setCart(snapshot.items.map((item) => ({
        ...item,
        discountPercent: Number(item.discountPercent) || 0,
      })));
      setClientId(snapshot.clientId || "");
      setInvoiceType(snapshot.invoiceType || "invoice");
      setDiscountMode(snapshot.discountMode || "percent");
      setDiscountValue(Number(snapshot.discountValue) || 0);
      setTaxRate(Number(snapshot.taxRate) || 0);
      setNote(snapshot.note || "");
      setPayment(snapshot.payment || "cash");
      setCashReceived(Number(snapshot.cashReceived) || 0);
      setCashReceivedText(snapshot.cashReceived ? String(snapshot.cashReceived) : "");
      setHeldOrder(null);
      setMessageTone("success");
      setMessage("Held order resumed.");
    }
    setSaving(false);
  }

  function createDraft(status: InvoiceDraft["status"]): InvoiceDraft {
    const globalDiscountRate = totals.subtotal - totals.itemDiscount > 0 ? totals.globalDiscount / (totals.subtotal - totals.itemDiscount) * 100 : 0;
    return {
      client_id: clientId,
      invoice_number: makeInvoiceNumber(invoiceType),
      issue_date: isoToday(),
      due_date: addDays(isoToday(), 0),
      payment_method: paymentMethod(payment),
      amount_received: payment === "cash" ? cashReceived : status === "paid" ? totals.total : 0,
      notes: note,
      status,
      items: cart.map((item): InvoiceEditorItem => ({
        id: item.id,
        product_id: item.productId,
        description: item.name,
        quantity: item.quantity,
        unit_price: item.unitPrice * (1 - item.discountPercent / 100) * (1 - globalDiscountRate / 100) / (1 + Math.max(0, taxRate) / 100),
        tax_rate: taxRate,
        discount: 100 - (1 - item.discountPercent / 100) * (1 - globalDiscountRate / 100) * 100,
        unit: item.unit,
        sku: item.sku,
      })),
    };
  }

  function printDraft() {
    if (!cart.length) {
      setMessageTone("error");
      setMessage("Add at least one product before printing.");
      return;
    }
    const draft = createDraft("draft");
    const company: DocumentCompany = {
      name: source?.company_name || workspace.company?.name || "",
      email: source?.email || "",
      phone: source?.phone || "",
      address: source?.address || "",
      city: [workspace.company?.city, workspace.company?.country].filter(Boolean).join(", "),
      taxId: source?.tax_id || "",
      bankName: source?.bank_name || "",
      iban: source?.bank_iban || "",
      website: source?.website || "",
      signatureUrl: source?.signature_url,
      stampUrl: source?.stamp_url,
    };
    localStorage.setItem("operix-print-draft", JSON.stringify({ draft, client: selectedClient, company, template: "corporate", config: source?.template_config }));
    router.push(`/pos/complete/${encodeURIComponent(draft.invoice_number)}?print=1`);
  }

  async function saveInvoice(status: "draft" | "complete") {
    if (!cart.length) {
      setMessageTone("error");
      setMessage("Add at least one product before saving.");
      return;
    }
    if (payment === "cash" && status === "complete" && cashReceived < totals.total) {
      setMessageTone("error");
      setMessage(`Cash received is ${money(amountDue, currency)} short of the total.`);
      return;
    }
    if (status === "complete" && !terminalId) {
      setMessageTone("error");
      setMessage(terminals.length
        ? "Select a POS terminal before completing this sale."
        : "No active POS terminal is configured for this company.");
      return;
    }
    const supabase = createClient();
    if (!supabase) {
      setMessage("Supabase is not configured.");
      setSaving(false);
      return;
    }
    setSaving(true);
    setMessageTone("error");
    setMessage("");

    // Completion is one idempotent server command. Do not recreate the old
    // browser-side invoice → lines → payment sequence here.
    if (status === "complete") {
      const tenderedAmount = payment === "cash" ? cashReceived : totals.total;
      const { data, error } = await supabase.rpc("complete_pos_sale", {
        p_company_id: workspace.companyId,
        p_terminal_id: terminalId,
        p_customer_id: clientId || null,
        p_items: cart.map((item) => ({
          product_id: item.productId,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          discount_percent: item.discountPercent,
        })),
        p_payments: [{
          method: payment === "debt" ? "customer_credit" : payment,
          amount: totals.total,
          tendered_amount: tenderedAmount,
          reference: null,
          settlement_account_id: null,
        }],
        p_invoice_type: invoiceType,
        p_notes: note || null,
        p_idempotency_key: completionIdempotencyKeyRef.current || (completionIdempotencyKeyRef.current = crypto.randomUUID()),
        p_occurred_at: new Date().toISOString(),
      });
      if (error) {
        setMessage(error.message);
        setSaving(false);
        return;
      }
      const result = data as { invoice_number?: string } | null;
      if (!result?.invoice_number) {
        setMessage("The POS completion command returned no invoice number.");
        setSaving(false);
        return;
      }
      setCart([]);
      setCashReceived(0);
      setCashReceivedText("");
      setDiscountValue(0);
      setNote("");
      completionIdempotencyKeyRef.current = null;
      setSaving(false);
      router.push(`/invoices/preview/${encodeURIComponent(result.invoice_number)}`);
      return;
    }

    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      setMessage("Your session has expired. Please sign in again.");
      setSaving(false);
      return;
    }
    const draft = createDraft("draft");
    const selectedInvoiceType = invoiceTypes.find((option) => option.value === invoiceType) || invoiceTypes[0];
    const payload = {
      user_id: authData.user.id,
      company_id: workspace.companyId,
      client_id: clientId || null,
      invoice_number: draft.invoice_number,
      issue_date: draft.issue_date,
      due_date: draft.due_date,
      status: draft.status,
      type: selectedInvoiceType.type,
      subtype: selectedInvoiceType.subtype,
      discount_amount: totals.discount,
      discount_percent: totals.subtotal ? totals.discount / totals.subtotal * 100 : 0,
      tax_amount: totals.tax,
      total_amount: totals.total,
      notes: note || null,
      template_id: "corporate",
      payment_method: draft.payment_method,
      amount_received: draft.amount_received,
      change_amount: change,
      paper_size: "A4",
    };
    const invoiceResult = await supabase.from("invoices").insert(payload).select("id").single();
    if (invoiceResult.error) {
      setMessage(invoiceResult.error.message);
      setSaving(false);
      return;
    }
    const globalDiscountRate = totals.subtotal - totals.itemDiscount > 0 ? totals.globalDiscount / (totals.subtotal - totals.itemDiscount) * 100 : 0;
    const items = cart.map((item) => ({
      invoice_id: invoiceResult.data.id,
      product_id: item.productId,
      description: item.name,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      tax_rate: taxRate,
      discount: 100 - (1 - item.discountPercent / 100) * (1 - globalDiscountRate / 100) * 100,
      amount: item.quantity * item.unitPrice * (1 - item.discountPercent / 100) * (1 - globalDiscountRate / 100) / (1 + Math.max(0, taxRate) / 100),
      unit: item.unit,
      sku: item.sku || null,
    }));
    const itemsResult = await supabase.from("invoice_items").insert(items);
    if (itemsResult.error) {
      setMessage(itemsResult.error.message);
      setSaving(false);
      return;
    }
    setCart([]);
    setCashReceived(0);
    setCashReceivedText("");
    setDiscountValue(0);
    setNote("");
    setMessageTone("success");
    setMessage(`${selectedInvoiceType.label} saved as draft.`);
    setSaving(false);
  }

  const dataError = productsQuery.error || clientsQuery.error || workspace.error;
  const terminalReady = Boolean(terminalId);

  return <div className="pos-page min-h-[calc(100vh-64px)] bg-[#f7f9fc] p-3 sm:p-4 lg:p-5">
    <div className="mx-auto max-w-[1800px]">
      <header className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-full lg:w-auto"><h1 className="page-title">POS</h1><p className="muted mt-1 text-xs">Create an invoice from your product catalogue.</p></div>
        <label className="order-1 min-w-0 flex-1 sm:max-w-64 lg:order-none lg:ml-auto"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#667085]">Terminal</span><select className="select h-10 w-full text-xs" value={terminalId} onChange={(event) => setTerminalId(event.target.value)} disabled={terminalsLoading || !terminals.length}><option value="">{terminalsLoading ? "Loading terminals…" : terminals.length ? "Select terminal" : "No active terminal"}</option>{terminals.map((terminal) => <option key={terminal.id} value={terminal.id}>{terminal.display_name || terminal.terminal_code}</option>)}</select></label>
        <label className="relative order-2 min-w-0 flex-1 lg:order-none lg:w-[430px] lg:flex-none"><span className="sr-only">Search products</span><Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#98a2b3]"/><input ref={searchRef} className="input pl-9 pr-14" placeholder="Search products, SKU or barcode…" value={search} onChange={(event) => setSearch(event.target.value)}/><kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-[#e4e9f0] px-1.5 py-0.5 text-[10px] muted">Ctrl K</kbd></label>
        <Link className="btn btn-primary order-3 shrink-0" href="/products"><Plus size={16}/>Add product</Link>
      </header>
      {dataError && <p className="mb-4 rounded border border-[#fecdca] bg-[#fff3f2] p-3 text-xs text-[#d92d20]">{dataError}</p>}
      {message && <div className={`mb-4 flex items-center gap-2 rounded border p-3 text-xs ${messageTone === "success" ? "border-[#abefc6] bg-[#ecfdf3] text-[#087443]" : "border-[#fecdca] bg-[#fff3f2] text-[#d92d20]"}`} role="status"><span className="flex-1">{message}</span><button onClick={() => setMessage("")} aria-label="Dismiss message"><X size={15}/></button></div>}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(460px,.92fr)]">
        <section className="card min-w-0 overflow-hidden p-3 sm:p-4">
          <div className="pos-category-bar relative z-10 mb-4 rounded-lg border border-[#e4e9f0] bg-white p-1.5 shadow-sm"><div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide text-[#667085]">Categories</div><div className="flex items-center gap-1.5 overflow-x-auto">{categories.map((item) => <button key={item} className={`shrink-0 rounded-md px-3 py-2 text-xs font-medium transition-colors ${category === item ? "bg-[#004ffe] text-white shadow-sm" : "text-[#475467] hover:bg-[#f2f5f9]"}`} onClick={() => setCategory(item)}>{item}</button>)}</div></div>
          <div className="mb-4 flex items-center justify-between gap-2"><span className="text-xs font-semibold text-[#344054]">{category === "All" ? "All products" : category}</span><span className="muted text-[11px]">{visibleProducts.length} available</span></div>
          {productsQuery.loading ? <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-52 animate-pulse rounded-lg bg-[#f2f5f9]"/>)}</div> : visibleProducts.length ? <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">{visibleProducts.map((product) => <ProductCard key={product.id} product={product} currency={currency} quantity={cart.find((item) => item.productId === product.id)?.quantity || 0} onAdd={() => addProduct(product)} onQuantityChange={(value) => updateProductQuantity(product.id, value)}/>)}</div> : <div className="grid min-h-72 place-items-center rounded-lg border border-dashed border-[#d0d5dd] p-6 text-center"><Package size={34} className="text-[#98a2b3]"/><p className="mt-3 text-sm font-medium">No products found</p><p className="muted mt-1 text-xs">Add products or adjust the search and category filter.</p><Link href="/products" className="btn mt-4">Manage products</Link></div>}
        </section>

        <section className="card min-w-0 overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-[#edf0f4] p-4 sm:flex-row sm:items-start"><div className="min-w-0"><h2 className="text-lg font-semibold">{invoiceTypes.find((option) => option.value === invoiceType)?.label || "Invoice"} <span className="ml-1 rounded bg-[#ecfdf3] px-2 py-1 text-[10px] font-medium text-[#087443]">New</span></h2><p className="muted mt-1 text-[11px]">{cart.length ? `${cart.length} line item${cart.length === 1 ? "" : "s"}` : "No items added"} · {terminalReady ? terminals.find((terminal) => terminal.id === terminalId)?.display_name || "Terminal ready" : "Terminal required"}</p></div><div className="flex w-full min-w-0 justify-end gap-2 sm:ml-auto sm:w-auto"><label className="min-w-0 flex-1 sm:flex-none"><span className="sr-only">Invoice type</span><select className="select h-9 w-full min-w-0 px-2 text-xs sm:w-auto sm:min-w-32" value={invoiceType} onChange={(event) => setInvoiceType(event.target.value as PosInvoiceType)}>{invoiceTypes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><button className="btn h-9 shrink-0 px-3 text-xs" onClick={() => void holdCurrentCart()} disabled={saving || !terminalReady || (!cart.length && !heldOrder)} title={heldOrder && !cart.length ? "Resume held order" : "Hold order"}>{heldOrder && !cart.length ? <FileText size={15}/> : <WalletCards size={15}/>}<span className="hidden sm:inline">{heldOrder && !cart.length ? "Resume" : "Hold"}</span></button><button className="btn h-9 shrink-0 px-3 text-xs" onClick={clearCart} disabled={!cart.length || saving}><Trash2 size={15}/><span className="hidden sm:inline">Clear</span></button></div></div>
          <div className="border-b border-[#edf0f4] p-4"><div className="mb-2 flex items-center justify-between"><span className="text-[11px] font-semibold uppercase tracking-wide text-[#667085]">Customer</span><Link className="text-xs font-medium text-[#004ffe]" href="/customers"><Plus size={14} className="mr-1 inline"/>New customer</Link></div><div className="relative"><UserRound size={16} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[#667085]"/><input className="input pl-9 pr-9" placeholder="Search customers…" value={clientId ? (clients.find((client) => client.id === clientId)?.name || "") : customerSearch} onFocus={() => setCustomerPickerOpen(true)} onChange={(event) => { setCustomerSearch(event.target.value); setClientId(""); setCustomerPickerOpen(true); }} aria-label="Search customers"/><button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-[#667085]" onClick={() => { setClientId(""); setCustomerSearch(""); setCustomerPickerOpen(true); }} aria-label="Clear customer"><X size={15}/></button>{customerPickerOpen ? <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-md border border-[#e4e9f0] bg-white p-1 shadow-lg"><button type="button" className="w-full rounded px-3 py-2 text-left text-xs hover:bg-[#f2f5f9]" onClick={() => { setClientId(""); setCustomerSearch(""); setCustomerPickerOpen(false); }}>Walk-in Customer</button>{matchingClients.map((client) => <button type="button" key={client.id} className="w-full rounded px-3 py-2 text-left text-xs hover:bg-[#f2f5f9]" onClick={() => { setClientId(client.id); setCustomerSearch(""); setCustomerPickerOpen(false); }}><span className="block font-medium text-[#101828]">{client.name}</span>{client.email ? <span className="muted block text-[10px]">{client.email}</span> : null}</button>)}{!matchingClients.length ? <p className="p-2 text-xs muted">No customers found.</p> : null}</div> : null}</div></div>
          <div className="max-h-[320px] overflow-y-auto border-b border-[#edf0f4]">{cart.length ? <div className="divide-y divide-[#edf0f4]">{cart.map((item) => <CartLine key={item.id} item={item} currency={currency} onQuantityChange={(value) => updateQuantity(item.id, value)} onDiscountChange={(value) => updateProductDiscount(item.id, value)} onRemove={() => updateQuantity(item.id, 0)}/>)}</div> : <div className="grid min-h-44 place-items-center p-6 text-center"><ShoppingCart size={34} className="text-[#98a2b3]"/><p className="mt-2 text-sm font-medium">No items added</p><p className="muted mt-1 text-xs">Browse products and add them to this invoice.</p></div>}</div>
          <div className="grid gap-4 border-b border-[#edf0f4] p-4 md:grid-cols-[1fr_1fr]"><div className="space-y-3"><div><label className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-[#667085]">Discount <select className="h-7 rounded border border-[#e4e9f0] bg-white px-2 text-[11px] font-normal" value={discountMode} onChange={(event) => {const mode=event.target.value as DiscountMode;setDiscountMode(mode);setDiscountValue(current=>mode === "percent" ? Math.min(100,current) : Math.min(totals.subtotal,current));}}><option value="percent">% Percent</option><option value="amount">€ Amount</option></select></label><input className="input" type="number" min="0" max={discountMode === "percent" ? 100 : totals.subtotal} step={discountMode === "percent" ? 1 : "0.01"} value={discountValue || ""} onFocus={(event) => event.currentTarget.select()} onChange={(event) => {const value=Math.max(0,Number(event.target.value)||0);setDiscountValue(Math.min(discountMode === "percent" ? 100 : totals.subtotal,value));}}/></div><label className="field"><span>Note</span><textarea className="textarea min-h-16" maxLength={250} placeholder="Add note…" value={note} onChange={(event) => setNote(event.target.value)}/></label></div><div className="rounded-lg bg-[#f7f9fc] p-3"><SummaryRow label="Subtotal" value={totals.subtotal} currency={currency}/><SummaryRow label="Discount" value={-totals.discount} currency={currency}/><SummaryRow label={`Tax included (${taxRate}%)`} value={totals.tax} currency={currency}/><div className="mt-3 flex items-center border-t border-[#e4e9f0] pt-3 text-base font-semibold"><span>Total</span><strong className="ml-auto text-xl text-[#004ffe]">{money(totals.total, currency)}</strong></div></div></div>
          <div className="border-b border-[#edf0f4] p-4"><p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#667085]">Payment method</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{paymentOptions.map((option) => {const Icon = option.icon; const active = payment === option.value; return <button key={option.value} type="button" aria-pressed={active} className={`btn pos-payment-option h-10 px-2 text-xs ${active ? "pos-payment-active" : ""}`} onClick={() => setPayment(option.value)}><Icon size={15}/>{option.label}</button>;})}</div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="field"><span>Cash received</span><div className="flex gap-2"><input className="input min-w-0" type="text" inputMode="decimal" placeholder="0.00" value={cashReceivedText} onChange={(event) => { const next = event.target.value; setCashReceivedText(next); setCashReceived(parseDecimalInput(next)); }} disabled={payment !== "cash"}/><button type="button" className="btn shrink-0 px-3 text-xs" onClick={() => { const amount = Number(totals.total.toFixed(2)); setCashReceived(amount); setCashReceivedText(String(amount)); }} disabled={payment !== "cash" || !cart.length}>Paid in full</button></div></label><div className="field"><span>{payment === "debt" ? "Customer balance" : amountDue > 0 ? "Amount due" : "Change"}</span><strong className={`input ${payment === "debt" ? "bg-[#fff8eb] text-[#b54708]" : amountDue > 0 ? "bg-[#fff8eb] text-[#b54708]" : "bg-[#ecfdf3] text-[#087443]"}`}>{payment === "debt" ? money(totals.total, currency) : money(amountDue || change, currency)}</strong></div></div></div>
          <div className="grid gap-2 p-4 sm:grid-cols-3"><button className="btn" onClick={() => saveInvoice("draft")} disabled={busy || !cart.length}><FileText size={16}/>Save as Draft</button><button className="btn" onClick={printDraft} disabled={busy || !cart.length}><Printer size={16}/>Print</button><button className="btn btn-primary sm:col-span-1" onClick={() => saveInvoice("complete")} disabled={busy || !cart.length || !terminalReady} title={terminalReady ? undefined : "Configure and select an active POS terminal first"}><Banknote size={16}/>{saving ? "Saving…" : "Pay & Complete"}</button></div>
        </section>
      </div>
    </div>
  </div>;
}

function ProductCard({ product, currency, quantity, onAdd, onQuantityChange }: { product: ProductRow; currency: string; quantity: number; onAdd: () => void; onQuantityChange: (quantity: number) => void }) {
  const stock = Number(product.stock_quantity);
  const stockTracked = Boolean(product.track_stock);
  const outOfStock = stockTracked && Number.isFinite(stock) && stock <= 0;
  const imageUrl = product.image_url?.trim();
  return <div className="group min-w-0 overflow-hidden rounded-lg border border-[#e4e9f0] bg-white text-left transition hover:-translate-y-0.5 hover:border-[#9dbdff] hover:shadow-[0_8px_20px_rgba(16,24,40,.08)]"><button className="block w-full text-left disabled:cursor-not-allowed disabled:opacity-55" onClick={onAdd} disabled={outOfStock}>{imageUrl ? <div className="relative h-28 bg-[#f7f9fc] sm:h-32"><Image src={imageUrl} alt="" fill sizes="(max-width: 768px) 45vw, 220px" className="object-cover"/></div> : null}<div className="p-3"><strong className="block truncate text-xs text-[#101828]">{product.name}</strong><span className="mt-1 block truncate text-[10px] text-[#667085]">{String(product.sku || product.barcode || product.unit || "Product")}</span><div className="mt-2 flex items-center justify-between gap-2"><span className="text-sm font-semibold text-[#004ffe]">{money(Number(product.unit_price) || 0, currency)}</span>{outOfStock ? <span className="text-[9px] text-[#d92d20]">Out of stock</span> : <Plus size={15} className="text-[#004ffe] opacity-0 transition group-hover:opacity-100"/>}</div></div></button>{quantity > 0 ? <div className="mx-3 mb-3 flex items-center justify-between rounded-md border border-[#d0d5dd] bg-white"><button type="button" className="grid h-8 w-9 place-items-center text-[#004ffe] hover:bg-[#f2f5f9]" onClick={() => onQuantityChange(quantity - 1)} aria-label={`Decrease ${product.name}`}><Minus size={14}/></button><span className="text-xs font-semibold text-[#344054]">{quantity}</span><button type="button" className="grid h-8 w-9 place-items-center text-[#004ffe] hover:bg-[#f2f5f9]" onClick={() => onQuantityChange(quantity + 1)} aria-label={`Increase ${product.name}`}><Plus size={14}/></button></div> : null}</div>;
}

function CartLine({ item, currency, onQuantityChange, onDiscountChange, onRemove }: { item: CartItem; currency: string; onQuantityChange: (value: number) => void; onDiscountChange: (value: number) => void; onRemove: () => void }) {
  return <div className="flex items-center gap-3 p-4"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-[#f2f5f9] text-[#667085]"><Package size={18}/></div><div className="min-w-0 flex-1"><strong className="block truncate text-xs">{item.name}</strong><span className="muted mt-1 block truncate text-[10px]">{money(item.unitPrice, currency)} / {item.unit}</span></div><div className="flex shrink-0 items-center gap-1 text-[10px] text-[#667085]"><span>Disc %</span><div className="flex items-center rounded-md border border-[#e4e9f0] bg-white"><button type="button" className="grid h-8 w-7 place-items-center text-[#667085] hover:text-[#004ffe]" onClick={() => onDiscountChange(item.discountPercent - 1)} aria-label={`Decrease discount for ${item.name}`}><Minus size={13}/></button><span className="grid h-8 w-8 place-items-center border-x border-[#e4e9f0] text-xs font-medium text-[#344054]">{item.discountPercent}</span><button type="button" className="grid h-8 w-7 place-items-center text-[#667085] hover:text-[#004ffe]" onClick={() => onDiscountChange(item.discountPercent + 1)} aria-label={`Increase discount for ${item.name}`}><Plus size={13}/></button></div></div><div className="flex shrink-0 items-center rounded-md border border-[#e4e9f0] bg-white"><button className="grid h-8 w-7 place-items-center text-[#667085] hover:text-[#004ffe]" onClick={() => onQuantityChange(item.quantity - 1)} aria-label={`Decrease ${item.name}`}><Minus size={13}/></button><input className="h-8 w-9 border-x border-[#e4e9f0] text-center text-xs font-medium outline-none" type="number" min="1" step="1" value={item.quantity} onChange={(event) => onQuantityChange(Number(event.target.value) || 1)} aria-label={`Quantity for ${item.name}`}/><button className="grid h-8 w-7 place-items-center text-[#667085] hover:text-[#004ffe]" onClick={() => onQuantityChange(item.quantity + 1)} aria-label={`Increase ${item.name}`}><Plus size={13}/></button></div><strong className="w-20 shrink-0 text-right text-xs">{money(item.quantity * item.unitPrice * (1 - item.discountPercent / 100), currency)}</strong><button className="shrink-0 text-[#98a2b3] hover:text-[#d92d20]" onClick={onRemove} aria-label={`Remove ${item.name}`}><Trash2 size={16}/></button></div>;
}

function SummaryRow({ label, value, currency }: { label: string; value: number; currency: string }) {
  return <div className="flex py-1.5 text-xs"><span className="text-[#667085]">{label}</span><span className={`ml-auto ${value < 0 ? "text-[#d92d20]" : "text-[#344054]"}`}>{money(value, currency)}</span></div>;
}
