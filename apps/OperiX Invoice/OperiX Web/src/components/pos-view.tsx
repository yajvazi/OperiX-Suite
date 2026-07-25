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
type PosPayment = "cash" | "card" | "bank" | "mixed" | "other";
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

const paymentOptions: Array<{ value: PosPayment; label: string; icon: typeof Banknote }> = [
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "card", label: "Card", icon: CreditCard },
  { value: "mixed", label: "Mixed", icon: WalletCards },
  { value: "other", label: "Other", icon: CircleHelp },
];

function categoryLabel(value: string) {
  return value.trim() || "Uncategorized";
}

function paymentMethod(value: PosPayment): PaymentMethod {
  if (value === "cash") return "cash";
  if (value === "bank") return "bank";
  return "card";
}

function makeInvoiceNumber() {
  return `POS-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
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
  const [invoiceType, setInvoiceType] = useState<PosInvoiceType>("invoice");
  const [discountMode, setDiscountMode] = useState<DiscountMode>("percent");
  const [discountValue, setDiscountValue] = useState(0);
  const [taxRate, setTaxRate] = useState(18);
  const [note, setNote] = useState("");
  const [payment, setPayment] = useState<PosPayment>("cash");
  const [cashReceived, setCashReceived] = useState(0);
  const [heldCart, setHeldCart] = useState<CartItem[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"error" | "success">("error");
  const searchRef = useRef<HTMLInputElement>(null);

  const products = productsQuery.data;
  const clients = clientsQuery.data;
  const source = workspace.company || workspace.profile;
  const currency = source?.currency || "EUR";

  useEffect(() => {
    const configuredRate = Number(workspace.company?.tax_rate ?? workspace.profile?.tax_rate);
    if (Number.isFinite(configuredRate) && configuredRate > 0) queueMicrotask(() => setTaxRate(configuredRate));
  }, [workspace.company?.tax_rate, workspace.profile?.tax_rate]);

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
    const stored = sessionStorage.getItem("operix-pos-held-cart");
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as CartItem[];
      if (Array.isArray(parsed) && parsed.length) queueMicrotask(() => setHeldCart(parsed.map(item => ({ ...item, discountPercent: Number(item.discountPercent) || 0 }))));
    } catch {
      sessionStorage.removeItem("operix-pos-held-cart");
    }
  }, []);

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
    setCart((current) => {
      const existing = current.find((item) => item.productId === product.id);
      if (existing) return current.map((item) => item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      return [...current, {
        id: crypto.randomUUID(),
        productId: product.id,
        name: product.name,
        sku: product.sku ? String(product.sku) : product.barcode ? String(product.barcode) : undefined,
        unit: product.unit ? String(product.unit) : "pcs",
        unitPrice: Number(product.unit_price) || 0,
        taxRate: Number(product.tax_rate) || 0,
        quantity: 1,
        discountPercent: 0,
      }];
    });
  }

  function updateQuantity(id: string, quantity: number) {
    setCart((current) => quantity <= 0 ? current.filter((item) => item.id !== id) : current.map((item) => item.id === id ? { ...item, quantity } : item));
  }

  function updateProductDiscount(id: string, discountPercent: number) {
    setCart((current) => current.map((item) => item.id === id ? { ...item, discountPercent: Math.min(100, Math.max(0, discountPercent)) } : item));
  }

  function clearCart() {
    if (!cart.length || window.confirm("Clear the current POS invoice?")) {
      setCart([]);
      setCashReceived(0);
      setMessage("");
    }
  }

  function holdCurrentCart() {
    if (cart.length) {
      setHeldCart(cart);
      sessionStorage.setItem("operix-pos-held-cart", JSON.stringify(cart));
      setCart([]);
      setMessageTone("success");
      setMessage("Invoice held. Resume it when you are ready.");
    } else if (heldCart?.length) {
      setCart(heldCart);
      setHeldCart(null);
      sessionStorage.removeItem("operix-pos-held-cart");
      setMessage("");
    }
  }

  function createDraft(status: InvoiceDraft["status"]): InvoiceDraft {
    const globalDiscountRate = totals.subtotal - totals.itemDiscount > 0 ? totals.globalDiscount / (totals.subtotal - totals.itemDiscount) * 100 : 0;
    return {
      client_id: clientId,
      invoice_number: makeInvoiceNumber(),
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
    setSaving(true);
    setMessageTone("error");
    setMessage("");
    const supabase = createClient();
    if (!supabase) {
      setMessage("Supabase is not configured.");
      setSaving(false);
      return;
    }
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      setMessage("Your session has expired. Please sign in again.");
      setSaving(false);
      return;
    }
    const draft = createDraft(status === "complete" ? "paid" : "draft");
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
    if (status === "complete") {
      const paymentResult = await supabase.from("payments").insert({
        user_id: authData.user.id,
        company_id: workspace.companyId,
        client_id: clientId || null,
        invoice_id: invoiceResult.data.id,
        payment_number: `PAY-${Date.now().toString().slice(-8)}`,
        amount: totals.total,
        payment_date: draft.issue_date,
        payment_method: draft.payment_method,
        notes: note || "POS payment",
      });
      if (paymentResult.error) {
        setMessage(`Invoice saved, but payment record failed: ${paymentResult.error.message}`);
        setSaving(false);
        return;
      }
    }
    if (status === "complete") {
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
      localStorage.setItem("operix-pos-complete", JSON.stringify({ draft, client: selectedClient, company, config: source?.template_config, invoiceId: invoiceResult.data.id }));
      setCart([]);
      setCashReceived(0);
      router.push(`/pos/complete/${encodeURIComponent(draft.invoice_number)}`);
      return;
    }
    setCart([]);
    setCashReceived(0);
    setDiscountValue(0);
    setNote("");
    setMessageTone("success");
    setMessage(`${selectedInvoiceType.label} saved as draft.`);
    setSaving(false);
  }

  const dataError = productsQuery.error || clientsQuery.error || workspace.error;

  return <div className="pos-page min-h-[calc(100vh-64px)] bg-[#f7f9fc] p-3 sm:p-4 lg:p-5">
    <div className="mx-auto max-w-[1800px]">
      <header className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-full lg:w-auto"><h1 className="page-title">POS</h1><p className="muted mt-1 text-xs">Create an invoice from your product catalogue.</p></div>
        <label className="relative order-2 min-w-0 flex-1 lg:order-none lg:ml-auto lg:w-[540px] lg:flex-none"><span className="sr-only">Search products</span><Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#98a2b3]"/><input ref={searchRef} className="input pl-9 pr-14" placeholder="Search products, SKU or barcode…" value={search} onChange={(event) => setSearch(event.target.value)}/><kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-[#e4e9f0] px-1.5 py-0.5 text-[10px] muted">Ctrl K</kbd></label>
        <Link className="btn btn-primary order-3 shrink-0" href="/products"><Plus size={16}/>Add product</Link>
      </header>
      {dataError && <p className="mb-4 rounded border border-[#fecdca] bg-[#fff3f2] p-3 text-xs text-[#d92d20]">{dataError}</p>}
      {message && <div className={`mb-4 flex items-center gap-2 rounded border p-3 text-xs ${messageTone === "success" ? "border-[#abefc6] bg-[#ecfdf3] text-[#087443]" : "border-[#fecdca] bg-[#fff3f2] text-[#d92d20]"}`} role="status"><span className="flex-1">{message}</span><button onClick={() => setMessage("")} aria-label="Dismiss message"><X size={15}/></button></div>}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(460px,.92fr)]">
        <section className="card min-w-0 overflow-hidden p-3 sm:p-4">
          <div className="mb-3 flex items-center gap-2 overflow-x-auto border-b border-[#edf0f4] pb-3">{categories.map((item) => <button key={item} className={`shrink-0 rounded-md px-3 py-2 text-xs font-medium transition-colors ${category === item ? "bg-[#004ffe] text-white" : "text-[#475467] hover:bg-[#f2f5f9]"}`} onClick={() => setCategory(item)}>{item}</button>)}</div>
          <div className="mb-4 flex items-center justify-between gap-2"><span className="text-xs font-semibold text-[#344054]">{category === "All" ? "All products" : category}</span><span className="muted text-[11px]">{visibleProducts.length} available</span></div>
          {productsQuery.loading ? <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-52 animate-pulse rounded-lg bg-[#f2f5f9]"/>)}</div> : visibleProducts.length ? <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">{visibleProducts.map((product) => <ProductCard key={product.id} product={product} currency={currency} onAdd={() => addProduct(product)}/>)}</div> : <div className="grid min-h-72 place-items-center rounded-lg border border-dashed border-[#d0d5dd] p-6 text-center"><Package size={34} className="text-[#98a2b3]"/><p className="mt-3 text-sm font-medium">No products found</p><p className="muted mt-1 text-xs">Add products or adjust the search and category filter.</p><Link href="/products" className="btn mt-4">Manage products</Link></div>}
        </section>

        <section className="card min-w-0 overflow-hidden xl:sticky xl:top-20">
          <div className="flex flex-col gap-3 border-b border-[#edf0f4] p-4 sm:flex-row sm:items-start"><div className="min-w-0"><h2 className="text-lg font-semibold">{invoiceTypes.find((option) => option.value === invoiceType)?.label || "Invoice"} <span className="ml-1 rounded bg-[#ecfdf3] px-2 py-1 text-[10px] font-medium text-[#087443]">New</span></h2><p className="muted mt-1 text-[11px]">{cart.length ? `${cart.length} line item${cart.length === 1 ? "" : "s"}` : "No items added"}</p></div><div className="flex w-full min-w-0 justify-end gap-2 sm:ml-auto sm:w-auto"><label className="min-w-0 flex-1 sm:flex-none"><span className="sr-only">Invoice type</span><select className="select h-9 w-full min-w-0 px-2 text-xs sm:w-auto sm:min-w-32" value={invoiceType} onChange={(event) => setInvoiceType(event.target.value as PosInvoiceType)}>{invoiceTypes.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><button className="btn h-9 shrink-0 px-3 text-xs" onClick={holdCurrentCart} disabled={saving} title={heldCart ? "Resume held invoice" : "Hold invoice"}>{heldCart && !cart.length ? <FileText size={15}/> : <WalletCards size={15}/>}<span className="hidden sm:inline">{heldCart && !cart.length ? "Resume" : "Hold"}</span></button><button className="btn h-9 shrink-0 px-3 text-xs" onClick={clearCart} disabled={!cart.length || saving}><Trash2 size={15}/><span className="hidden sm:inline">Clear</span></button></div></div>
          <div className="border-b border-[#edf0f4] p-4"><div className="mb-2 flex items-center justify-between"><span className="text-[11px] font-semibold uppercase tracking-wide text-[#667085]">Customer</span><Link className="text-xs font-medium text-[#004ffe]" href="/customers"><Plus size={14} className="mr-1 inline"/>New customer</Link></div><div className="relative"><UserRound size={16} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-[#667085]"/><select className="select pl-9" value={clientId} onChange={(event) => setClientId(event.target.value)}><option value="">Walk-in Customer</option>{clients.length ? <optgroup label="Saved customers">{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</optgroup> : null}</select></div></div>
          <div className="max-h-[320px] overflow-y-auto border-b border-[#edf0f4]">{cart.length ? <div className="divide-y divide-[#edf0f4]">{cart.map((item) => <CartLine key={item.id} item={item} currency={currency} onQuantityChange={(value) => updateQuantity(item.id, value)} onDiscountChange={(value) => updateProductDiscount(item.id, value)} onRemove={() => updateQuantity(item.id, 0)}/>)}</div> : <div className="grid min-h-44 place-items-center p-6 text-center"><ShoppingCart size={34} className="text-[#98a2b3]"/><p className="mt-2 text-sm font-medium">No items added</p><p className="muted mt-1 text-xs">Browse products and add them to this invoice.</p></div>}</div>
          <div className="grid gap-4 border-b border-[#edf0f4] p-4 md:grid-cols-[1fr_1fr]"><div className="space-y-3"><div><label className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-[#667085]">Discount <select className="h-7 rounded border border-[#e4e9f0] bg-white px-2 text-[11px] font-normal" value={discountMode} onChange={(event) => {const mode=event.target.value as DiscountMode;setDiscountMode(mode);setDiscountValue(current=>mode === "percent" ? Math.min(100,current) : Math.min(totals.subtotal,current));}}><option value="percent">% Percent</option><option value="amount">€ Amount</option></select></label><input className="input" type="number" min="0" max={discountMode === "percent" ? 100 : totals.subtotal} step={discountMode === "percent" ? 1 : "0.01"} value={discountValue} onChange={(event) => {const value=Math.max(0,Number(event.target.value)||0);setDiscountValue(Math.min(discountMode === "percent" ? 100 : totals.subtotal,value));}}/></div><label className="field"><span>Tax rate (%)</span><input className="input" type="number" min="0" step="1" value={taxRate} onChange={(event) => setTaxRate(Math.max(0, Number(event.target.value) || 0))}/></label><label className="field"><span>Note</span><textarea className="textarea min-h-16" maxLength={250} placeholder="Add note…" value={note} onChange={(event) => setNote(event.target.value)}/></label></div><div className="rounded-lg bg-[#f7f9fc] p-3"><SummaryRow label="Subtotal" value={totals.subtotal} currency={currency}/><SummaryRow label="Discount" value={-totals.discount} currency={currency}/><SummaryRow label={`Tax included (${taxRate}%)`} value={totals.tax} currency={currency}/><div className="mt-3 flex items-center border-t border-[#e4e9f0] pt-3 text-base font-semibold"><span>Total</span><strong className="ml-auto text-xl text-[#004ffe]">{money(totals.total, currency)}</strong></div></div></div>
          <div className="border-b border-[#edf0f4] p-4"><p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#667085]">Payment method</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{paymentOptions.map((option) => {const Icon = option.icon; const active = payment === option.value; return <button key={option.value} type="button" aria-pressed={active} className={`btn pos-payment-option h-10 px-2 text-xs ${active ? "pos-payment-active" : ""}`} onClick={() => setPayment(option.value)}><Icon size={15}/>{option.label}</button>;})}</div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="field"><span>Cash received</span><div className="flex gap-2"><input className="input min-w-0" type="number" min="0" step="0.01" value={cashReceived.toFixed(2)} onChange={(event) => {const value=Number(event.target.value);setCashReceived(Number.isFinite(value) ? Math.round((value + Number.EPSILON) * 100) / 100 : 0);}} disabled={payment !== "cash"}/><button type="button" className="btn shrink-0 px-3 text-xs" onClick={() => setCashReceived(Math.round((totals.total + Number.EPSILON) * 100) / 100)} disabled={payment !== "cash" || !cart.length}>Paid in full</button></div></label><div className="field"><span>{amountDue > 0 ? "Amount due" : "Change"}</span><strong className={`input ${amountDue > 0 ? "bg-[#fff8eb] text-[#b54708]" : "bg-[#ecfdf3] text-[#087443]"}`}>{money(amountDue || change, currency)}</strong></div></div></div>
          <div className="grid gap-2 p-4 sm:grid-cols-3"><button className="btn" onClick={() => saveInvoice("draft")} disabled={busy || !cart.length}><FileText size={16}/>Save as Draft</button><button className="btn" onClick={printDraft} disabled={busy || !cart.length}><Printer size={16}/>Print</button><button className="btn btn-primary sm:col-span-1" onClick={() => saveInvoice("complete")} disabled={busy || !cart.length}><Banknote size={16}/>{saving ? "Saving…" : "Pay & Complete"}</button></div>
        </section>
      </div>
    </div>
  </div>;
}

function ProductCard({ product, currency, onAdd }: { product: ProductRow; currency: string; onAdd: () => void }) {
  const stock = Number(product.stock_quantity);
  const stockTracked = Boolean(product.track_stock);
  const outOfStock = stockTracked && Number.isFinite(stock) && stock <= 0;
  const imageUrl = product.image_url?.trim();
  return <button className="group min-w-0 overflow-hidden rounded-lg border border-[#e4e9f0] bg-white text-left transition hover:-translate-y-0.5 hover:border-[#9dbdff] hover:shadow-[0_8px_20px_rgba(16,24,40,.08)] disabled:cursor-not-allowed disabled:opacity-55" onClick={onAdd} disabled={outOfStock}>{imageUrl ? <div className="relative h-28 bg-[#f7f9fc] sm:h-32"><Image src={imageUrl} alt="" fill sizes="(max-width: 768px) 45vw, 220px" className="object-cover"/></div> : null}<div className="p-3"><strong className="block truncate text-xs text-[#101828]">{product.name}</strong><span className="mt-1 block truncate text-[10px] text-[#667085]">{String(product.sku || product.barcode || product.unit || "Product")}</span><div className="mt-2 flex items-center justify-between gap-2"><span className="text-sm font-semibold text-[#004ffe]">{money(Number(product.unit_price) || 0, currency)}</span>{outOfStock ? <span className="text-[9px] text-[#d92d20]">Out of stock</span> : <Plus size={15} className="text-[#004ffe] opacity-0 transition group-hover:opacity-100"/>}</div></div></button>;
}

function CartLine({ item, currency, onQuantityChange, onDiscountChange, onRemove }: { item: CartItem; currency: string; onQuantityChange: (value: number) => void; onDiscountChange: (value: number) => void; onRemove: () => void }) {
  return <div className="flex items-center gap-3 p-4"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-[#f2f5f9] text-[#667085]"><Package size={18}/></div><div className="min-w-0 flex-1"><strong className="block truncate text-xs">{item.name}</strong><span className="muted mt-1 block truncate text-[10px]">{money(item.unitPrice, currency)} / {item.unit}</span></div><label className="flex shrink-0 items-center gap-1 text-[10px] text-[#667085]">Disc %<input className="h-8 w-12 rounded border border-[#e4e9f0] px-1 text-center text-[10px]" type="number" min="0" max="100" step="1" value={item.discountPercent} onChange={(event) => onDiscountChange(Number(event.target.value) || 0)} aria-label={`Discount for ${item.name}`}/></label><div className="flex shrink-0 items-center rounded-md border border-[#e4e9f0] bg-white"><button className="grid h-8 w-7 place-items-center text-[#667085] hover:text-[#004ffe]" onClick={() => onQuantityChange(item.quantity - 1)} aria-label={`Decrease ${item.name}`}><Minus size={13}/></button><input className="h-8 w-9 border-x border-[#e4e9f0] text-center text-xs font-medium outline-none" type="number" min="1" step="1" value={item.quantity} onChange={(event) => onQuantityChange(Number(event.target.value) || 1)} aria-label={`Quantity for ${item.name}`}/><button className="grid h-8 w-7 place-items-center text-[#667085] hover:text-[#004ffe]" onClick={() => onQuantityChange(item.quantity + 1)} aria-label={`Increase ${item.name}`}><Plus size={13}/></button></div><strong className="w-20 shrink-0 text-right text-xs">{money(item.quantity * item.unitPrice * (1 - item.discountPercent / 100), currency)}</strong><button className="shrink-0 text-[#98a2b3] hover:text-[#d92d20]" onClick={onRemove} aria-label={`Remove ${item.name}`}><Trash2 size={16}/></button></div>;
}

function SummaryRow({ label, value, currency }: { label: string; value: number; currency: string }) {
  return <div className="flex py-1.5 text-xs"><span className="text-[#667085]">{label}</span><span className={`ml-auto ${value < 0 ? "text-[#d92d20]" : "text-[#344054]"}`}>{money(value, currency)}</span></div>;
}
