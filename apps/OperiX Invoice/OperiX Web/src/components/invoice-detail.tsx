"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, ArrowLeft, CalendarDays, CreditCard, Download, Edit3, Eye, FileText, Mail, MoreHorizontal, Package, Printer, RefreshCw, Share2, StickyNote, Trash2, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getLocalStore } from "@/lib/local/local-store";
import { useWorkspace } from "@/hooks/use-workspace";
import { deleteInvoice, getInvoice, getInvoiceByNumber, listInvoicePayments, transitionInvoiceStatus } from "@invoice-monorepo/api/repositories";
import { CONVERSION_PATHS, DOCUMENT_DEFINITIONS, documentTypeLabel, isImmutableCommercialStatus, resolveCommercialDocumentType, type CommercialDocumentType } from "@invoice-monorepo/commercial-documents";
import type { ClientRow, InvoiceDraft, InvoiceRow, PaymentRow } from "@/lib/models";
import { money, shortDate } from "@/lib/format";
import { invoiceTotals } from "@/lib/invoice-calculations";
import { ScaledDocument } from "./invoice-document";
import type { DocumentCompany } from "./invoice-document";
import { openInvoicePdf } from "@/lib/pdf-client";
import { EmptyState, ErrorState, LoadingSkeleton, SectionCard, StatusBadge } from "./ui";

type DetailedInvoice = InvoiceRow & { client?: ClientRow | null; items?: Array<Record<string, unknown>> };
type DetailTab = "payments" | "activity" | "notes" | "files";

function value(row: Record<string, unknown>, key: string) {
  const result = row[key];
  return result === null || result === undefined ? "" : String(result);
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ").toLowerCase().replace(/(^|\s)\S/g, (character) => character.toUpperCase());
}

function transitionStatus(type: CommercialDocumentType, status: string) {
  if (status === "SENT") return type === "SALES_ORDER" ? "CONFIRMED" : type === "DELIVERY_NOTE" ? "PREPARED" : type === "INVOICE" || type.endsWith("_INVOICE") || type === "CREDIT_NOTE" || type === "DEBIT_NOTE" ? "ISSUED" : "SENT";
  return status;
}

function documentCreatePermission(type: CommercialDocumentType) {
  switch (type) {
    case "QUOTE": return "offer.create";
    case "PROFORMA": return "proforma.create";
    case "SALES_ORDER": return "order.create";
    case "DELIVERY_NOTE": return "delivery_note.create";
    case "CREDIT_NOTE": return "invoice.credit";
    case "DEBIT_NOTE": return "invoice.debit";
    default: return "invoice.create";
  }
}

function statusPermission(status: string) {
  if (status === "ISSUED") return "invoice.issue";
  if (["CANCELLED", "VOID", "VOIDED", "REVERSED"].includes(status)) return "invoice.void";
  return "invoice.edit";
}

export function InvoiceDetail({ id, invoiceNumber }: { id?: string; invoiceNumber?: string }) {
  const router = useRouter();
  const workspace = useWorkspace();
  const [invoice, setInvoice] = useState<DetailedInvoice | null>(null);
  const [draft, setDraft] = useState<InvoiceDraft | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [relatedDocuments, setRelatedDocuments] = useState<InvoiceRow[]>([]);
  const [sourceBooking, setSourceBooking] = useState<{ id: string; booking_number: string | null } | null>(null);
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [salesBookPeriodStatus, setSalesBookPeriodStatus] = useState<string | null>(null);
  const [tab, setTab] = useState<DetailTab>("payments");
  const [reloadToken, setReloadToken] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const companyScopeKey = workspace.companyIds.join(",");

  useEffect(() => {
    if (workspace.loading || !workspace.user || !workspace.companyIds.length) return;
    const supabase = createClient();
    if (!supabase) { queueMicrotask(() => { setError("Supabase is not configured."); setLoading(false); }); return; }
    let cancelled = false;
    const scope = { userId: workspace.user.id, companyIds: workspace.companyIds };
    const isLocal = workspace.storage === "local";
    const localStore = isLocal ? getLocalStore() : null;
    const request = localStore ? localStore.then(async (store) => id ? store.getInvoice(id) : (await store.list("invoices", { where: { invoice_number: invoiceNumber ?? null }, limit: 1 }).then((rows) => rows[0] ? store.getInvoice(rows[0].id) : null))) : invoiceNumber ? getInvoiceByNumber(supabase, invoiceNumber, scope) : id ? getInvoice(supabase, id, scope, "*, client:clients(*), items:invoice_items(*, product:products(image_url))") : Promise.resolve(null);
    void request.then(async (data) => {
      if (cancelled) return;
      if (!data) { setError("Invoice not found or not available in this workspace."); setLoading(false); return; }
      const row = data as unknown as DetailedInvoice;
      const rowRecord = row as unknown as Record<string, unknown>;
      const itemRows = Array.isArray(row.items) ? row.items : [];
      const type = resolveCommercialDocumentType(rowRecord);
      setInvoice(row);
      if (rowRecord.sales_book_period_id && !isLocal) {
        const periodResult = await supabase.from("sales_book_periods").select("status").eq("id", String(rowRecord.sales_book_period_id)).maybeSingle();
        setSalesBookPeriodStatus(periodResult.data?.status ? String(periodResult.data.status).toUpperCase() : null);
      } else setSalesBookPeriodStatus(null);
      setDraft({
        client_id: value(rowRecord, "client_id"), invoice_number: value(rowRecord, "invoice_number"), issue_date: value(rowRecord, "issue_date"), due_date: value(rowRecord, "due_date") || value(rowRecord, "issue_date"), payment_method: (value(rowRecord, "payment_method") || "bank") as InvoiceDraft["payment_method"], currency: value(rowRecord, "currency") || workspace.company?.currency || workspace.profile?.currency || "EUR", amount_received: Number(rowRecord.amount_received || 0), notes: value(rowRecord, "notes"), status: (value(rowRecord, "status") || "draft") as InvoiceDraft["status"], commercial_document_type: type, source_document_type: value(rowRecord, "source_document_type") || null, source_document_id: value(rowRecord, "source_document_id") || null, delivery_method: (value(rowRecord, "delivery_method") || null) as InvoiceDraft["delivery_method"], pickup_branch_id: value(rowRecord, "pickup_branch_id") || null, delivery_details: value(rowRecord, "delivery_details"), show_product_pictures: Boolean(rowRecord.show_product_pictures), show_stamp: true, show_signature: true, qrReference: value(rowRecord, "public_qr_token") || undefined, buyer_signature_url: value(rowRecord, "buyer_signature_url") || null, customer_signature_requested: Boolean(rowRecord.customer_signature_requested), customer_signature_status: (value(rowRecord, "customer_signature_status") || "not_requested") as InvoiceDraft["customer_signature_status"], customer_signature_name: value(rowRecord, "customer_signature_name") || null, customer_signed_at: value(rowRecord, "customer_signed_at") || null, items: itemRows.map((item) => ({ id: value(item, "id"), product_id: value(item, "product_id") || undefined, description: value(item, "description"), quantity: Number(item.quantity || 0), unit_price: Number(item.unit_price || 0), tax_rate: Number(item.tax_rate || 0), tax_included: Boolean(item.tax_included), discount: Number(item.discount || 0), unit: value(item, "unit") || "pcs", sku: value(item, "sku") || undefined, image_url: value(item, "image_url") || undefined }))
      });
      if (isLocal) {
        const store = await getLocalStore();
        setSourceBooking(null);
        setPayments((await store.listPayments({ invoiceId: row.id })) as unknown as PaymentRow[]);
        const links = [...await store.list("document_source_links", { where: { source_id: row.id } }), ...await store.list("document_source_links", { where: { target_id: row.id } })];
        const relatedIds = [...new Set(links.flatMap((link) => [value(link, "source_id"), value(link, "target_id")]).filter((relatedId) => relatedId && relatedId !== row.id))];
        const related = await Promise.all(relatedIds.map((relatedId) => store.get("invoices", relatedId)));
        setRelatedDocuments(related.filter(Boolean) as unknown as InvoiceRow[]);
        const localEvents = await store.list("commercial_document_events", { where: { document_id: row.id }, orderBy: "-occurred_at", limit: 30 });
        if (cancelled) return;
        setEvents(localEvents as Array<Record<string, unknown>>);
        setLoading(false);
        return;
      }
      if (String(rowRecord.source_document_type || "").toUpperCase() === "BOOKING" && rowRecord.source_document_id && workspace.can("booking.read")) {
        const sourceResult = await supabase.from("bookings").select("id,booking_number").eq("id", String(rowRecord.source_document_id)).in("company_id", workspace.companyIds).maybeSingle();
        if (!cancelled && !sourceResult.error && sourceResult.data) setSourceBooking(sourceResult.data as { id: string; booking_number: string | null });
        else if (!cancelled) setSourceBooking(null);
      } else if (!cancelled) setSourceBooking(null);
      const paymentRows = await listInvoicePayments(supabase, scope, row.id);
      setPayments(paymentRows as PaymentRow[]);
      const linkResult = await supabase.from("document_source_links").select("source_id,target_id,link_type,amount,metadata,created_at").or(`source_id.eq.${row.id},target_id.eq.${row.id}`).in("company_id", workspace.companyIds).order("created_at", { ascending: false });
      const links = (linkResult.data || []) as Array<Record<string, unknown>>;
      const relatedIds = [...new Set(links.flatMap((link) => [value(link, "source_id"), value(link, "target_id")]).filter((relatedId) => relatedId && relatedId !== row.id))];
      if (relatedIds.length) {
        const relatedResult = await supabase.from("invoices").select("id,invoice_number,issue_date,due_date,status,type,subtype,commercial_document_type,commercial_status,total_amount,client_id").in("id", relatedIds).in("company_id", workspace.companyIds);
        setRelatedDocuments((relatedResult.data || []) as InvoiceRow[]);
      } else setRelatedDocuments([]);
      const eventResult = await supabase.from("commercial_document_events").select("id,event_type,from_status,to_status,payload,occurred_at").eq("document_id", row.id).in("company_id", workspace.companyIds).order("occurred_at", { ascending: false }).limit(30);
      if (cancelled) return;
      setEvents((eventResult.data || []) as Array<Record<string, unknown>>);
      setLoading(false);
    }).catch((loadError) => { if (!cancelled) { setError(loadError instanceof Error ? loadError.message : "The invoice could not be loaded."); setLoading(false); } });
    return () => { cancelled = true; };
  }, [companyScopeKey, id, invoiceNumber, reloadToken, workspace.companyIds, workspace.company?.currency, workspace.loading, workspace.profile?.currency, workspace.storage, workspace.user]);

  const source = workspace.company || workspace.profile;
  const documentType = invoice ? resolveCommercialDocumentType(invoice as unknown as Record<string, unknown>) : "INVOICE";
  const commercialStatus = value((invoice || {}) as unknown as Record<string, unknown>, "commercial_status").toUpperCase() || value((invoice || {}) as unknown as Record<string, unknown>, "status").toUpperCase() || "DRAFT";
  const totals = useMemo(() => draft ? invoiceTotals(draft) : null, [draft]);
  const paidAmount = useMemo(() => payments.length ? payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0) : Number(invoice?.amount_received || 0), [invoice?.amount_received, payments]);
  const outstanding = Math.max(0, Number(totals?.total || invoice?.total_amount || 0) - paidAmount);
  const displayStatus = outstanding <= 0.005 && Number(totals?.total || invoice?.total_amount || 0) > 0 && !["QUOTE", "SALES_ORDER", "DELIVERY_NOTE"].includes(documentType) ? "PAID" : commercialStatus;
  const salesBookPeriodLocked = ["DECLARED", "AMENDED"].includes(String(salesBookPeriodStatus || "").toUpperCase());
  const canManage = workspace.can("invoice.edit");
  const canEdit = workspace.can("invoice.edit") && !salesBookPeriodLocked && !isImmutableCommercialStatus(commercialStatus);
  const canDelete = workspace.can("invoice.delete_draft") && commercialStatus === "DRAFT" && !salesBookPeriodLocked;
  const canCreatePayment = workspace.can("payment.create");
  const canRecordPayment = outstanding > 0.005 && canCreatePayment && !["QUOTE", "SALES_ORDER", "DELIVERY_NOTE"].includes(documentType);
  const company: DocumentCompany = { name: source?.company_name || workspace.company?.name || "", email: source?.email || "", phone: source?.phone || "", address: source?.address || "", city: [workspace.company?.city, workspace.company?.country].filter(Boolean).join(", "), taxId: source?.tax_id || workspace.company?.fiscal_number || workspace.company?.vat_number || "", businessId: workspace.company?.unique_business_number, vatNumber: workspace.company?.vat_number, bankName: source?.bank_name || "", iban: source?.bank_iban || "", website: source?.website || "", logoUrl: source?.logo_url, signatureUrl: source?.signature_url, stampUrl: source?.stamp_url };

  async function print(receipt = false) { if (!draft) return; try { await openInvoicePdf({ draft, client: invoice?.client || undefined, company, receipt, template: invoice?.paper_size === "Receipt" ? "thermal" : "corporate", config: workspace.company?.template_config || workspace.profile?.template_config }, `${draft.invoice_number}.pdf`); } catch (printError) { setNotice(printError instanceof Error ? printError.message : "The PDF could not be generated."); } }
  async function download() { if (!draft) return; if (workspace.storage === "local") { await print(); return; } const response = await fetch("/api/pdf", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ invoice_id: invoice?.id, draft, client: invoice?.client, company, receipt: false, template: invoice?.paper_size === "Receipt" ? "thermal" : "corporate", config: workspace.company?.template_config || workspace.profile?.template_config }) }); if (!response.ok) { setNotice("The PDF could not be generated."); return; } const url = URL.createObjectURL(await response.blob()); const link = document.createElement("a"); link.href = url; link.download = `${draft.invoice_number}.pdf`; link.click(); URL.revokeObjectURL(url); }
  async function share() { if (!draft || !navigator.share) { setNotice("Use Download PDF to share this document."); return; } try { await navigator.share({ title: `${documentTypeLabel(documentType, "en")} ${draft.invoice_number}`, text: `${documentTypeLabel(documentType, "en")} ${draft.invoice_number}`, url: window.location.href }); } catch { /* User cancelled the native share dialog. */ } }
  async function createPaymentLink() { if (!invoice || !canCreatePayment) { setNotice("Payment permission is required."); return; } setPaymentBusy(true); const response = await fetch("/api/payments/create-link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ invoiceId: invoice.id }) }); const result = await response.json().catch(() => ({})); setPaymentBusy(false); setNotice(response.ok ? `Payment link ready: ${String(result.url || "")}` : String(result.error || "Unable to create an online payment link.")); }
  async function removeInvoice() { if (!invoice || !canDelete || !window.confirm(`Delete ${documentTypeLabel(documentType, "en").toLowerCase()} ${invoice.invoice_number}?`)) return; const supabase = createClient(); if (!supabase) return; setDeleteBusy(true); try { if (workspace.storage === "local") await (await getLocalStore()).deleteInvoice(invoice.id); else await deleteInvoice(supabase, invoice.id); router.push("/invoices"); } catch (removeError) { setNotice(removeError instanceof Error ? removeError.message : "The document could not be deleted."); setDeleteBusy(false); } }
  async function updateStatus(nextStatus: string) { if (!invoice || !canManage || salesBookPeriodLocked) return; const targetStatus = transitionStatus(documentType, nextStatus); const requiredPermission = targetStatus === "ISSUED" ? "invoice.issue" : ["CANCELLED", "VOID", "VOIDED", "REVERSED"].includes(targetStatus) ? "invoice.void" : "invoice.edit"; if (!workspace.can(requiredPermission)) { setNotice(`Permission required: ${requiredPermission}`); return; } const supabase = createClient(); if (!supabase) { setNotice("Supabase is not configured."); return; } if (workspace.storage === "local") { try { await (await getLocalStore()).transitionDocumentStatus(invoice.id, targetStatus, `web_${nextStatus.toLowerCase()}`); } catch (transitionError) { setNotice(transitionError instanceof Error ? transitionError.message : "The status could not be updated."); return; } setNotice("Status updated."); setReloadToken((token) => token + 1); return; } const result = await transitionInvoiceStatus(supabase, invoice.id, targetStatus, `web_${nextStatus.toLowerCase()}`); if (result.error) { setNotice(result.error.message); return; } setNotice("Status updated."); setReloadToken((token) => token + 1); }
  async function convert(targetType: CommercialDocumentType) { if (!invoice || !workspace.can(documentCreatePermission(targetType))) { setNotice(`Permission required: ${documentCreatePermission(targetType)}`); return; } const supabase = createClient(); if (!supabase) return; if (workspace.storage === "local") { try { const created = await (await getLocalStore()).convertDocument(invoice.id, targetType); router.push(`/invoices/${created.id}`); } catch (convertError) { setNotice(convertError instanceof Error ? convertError.message : "The document could not be converted."); } return; } const result = await supabase.rpc("convert_commercial_document", { p_source_document_id: invoice.id, p_target_document_type: targetType, p_idempotency_key: crypto.randomUUID() }); if (result.error) { setNotice(result.error.message); return; } const converted = Array.isArray(result.data) ? result.data[0] : result.data; if (converted?.id) router.push(`/invoices/${converted.id}`); else setReloadToken((token) => token + 1); }

  if (loading) return <div className="invoice-detail-page"><LoadingSkeleton rows={7} /></div>;
  if (error && !draft) return <div className="invoice-detail-page"><ErrorState message={error} /><Link href="/invoices" className="btn">Back to invoices</Link></div>;
  if (!invoice || !draft || !totals) return <div className="invoice-detail-page"><EmptyState title="Document not found" description="This document may have been removed or you may not have access to it." actionLabel="Back to invoices" actionHref="/invoices" icon={FileText} /></div>;

  const conversionTargets = (CONVERSION_PATHS[documentType] || []) as readonly CommercialDocumentType[];
  const availableConversionTargets = conversionTargets.filter((target) => workspace.can(documentCreatePermission(target)));
  const config = workspace.company?.template_config || workspace.profile?.template_config;
  return <div className="invoice-detail-page">
    <div className="invoice-detail-top"><Link className="invoice-detail-back" href="/invoices"><ArrowLeft size={15} /> Back to invoices</Link><div className="invoice-detail-heading"><div><p className="muted text-xs">{documentTypeLabel(documentType, "en")}</p><h1>{invoice.invoice_number}</h1><p className="muted">{invoice.client?.name || "Walk-in customer"} · {shortDate(invoice.issue_date)}</p></div><StatusBadge status={displayStatus} /></div>
      <div className="invoice-detail-actions"><a data-testid="invoice.send" className="btn" href={`mailto:${invoice.client?.email || ""}?subject=${encodeURIComponent(`${documentTypeLabel(documentType, "en")} ${invoice.invoice_number}`)}`}><Mail size={16} /> Send</a>{canRecordPayment ? <Link data-testid="invoice.record-payment-desktop" className="btn" href={`/payments?create=1&invoiceId=${invoice.id}`}><CreditCard size={16} /> Record payment</Link> : null}<button data-testid="invoice.print-pdf" type="button" className="btn" onClick={() => void print(false)}><Printer size={16} /> Print / PDF</button>{canEdit ? <Link data-testid="invoice.edit" className="btn btn-primary" href={`/invoices/new?edit=${invoice.id}`}><Edit3 size={16} /> Edit</Link> : null}<details className="relative"><summary data-testid="invoice.more-actions" className="btn list-none"><MoreHorizontal size={16} /> More</summary><div className="action-menu"><button type="button" onClick={() => void share()}><Share2 size={14} /> Share</button>{!["QUOTE", "PROFORMA", "SALES_ORDER", "DELIVERY_NOTE"].includes(documentType) && canCreatePayment ? <button type="button" onClick={() => void createPaymentLink()}>{paymentBusy ? "Creating…" : "Payment link"}</button> : null}<button type="button" onClick={() => void print(true)}>Print receipt</button><button type="button" onClick={() => void download()}>Download PDF</button>{canDelete ? <button type="button" onClick={() => void removeInvoice()} disabled={deleteBusy}><Trash2 size={14} /> {deleteBusy ? "Deleting…" : "Delete"}</button> : null}</div></details></div>
    </div>
    {notice ? <p className="invoice-success-banner">{notice}</p> : null}
    {DOCUMENT_DEFINITIONS[documentType].mustHideFiscalIdentifiers ? <p className="invoice-compliance-note">This {documentTypeLabel(documentType, "en").toLowerCase()} is not a fiscal invoice. Fiscal identifiers and EFS claims are hidden.</p> : null}
    {salesBookPeriodLocked ? <p className="invoice-compliance-note">This invoice belongs to a {salesBookPeriodStatus === "AMENDED" ? "amended" : "declared"} Sales Book period and is locked. Use the audited amendment workflow from <Link href="/reports#sales-book" className="text-[#004ffe] underline">Reports → Sales Book</Link> for corrections.</p> : null}
    <div className="invoice-detail-action-grid" aria-label="Document actions">{documentType === "PROFORMA" && workspace.can(documentCreatePermission("ADVANCE_INVOICE")) ? <Link className="invoice-detail-action" href={`/invoices/new?convert=${invoice.id}&documentType=ADVANCE_INVOICE`}><CreditCard size={17} /> Create advance invoice</Link> : outstanding > 0.005 && !["QUOTE", "SALES_ORDER", "DELIVERY_NOTE"].includes(documentType) && canCreatePayment ? <Link data-testid="invoice.record-payment" className="invoice-detail-action" href={`/payments?create=1&invoiceId=${invoice.id}`}><CreditCard size={17} /> Record payment</Link> : null}<button data-testid="invoice.share" type="button" className="invoice-detail-action" onClick={() => void share()}><Share2 size={17} /> Share</button><button data-testid="invoice.preview" type="button" className="invoice-detail-action" aria-pressed={previewOpen} onClick={() => setPreviewOpen(true)}><Eye size={17} /> Preview</button>{availableConversionTargets.length ? <details className="relative"><summary data-testid="invoice.convert" className="invoice-detail-action list-none"><RefreshCw size={17} /> Convert</summary><div className="action-menu">{availableConversionTargets.map((target) => <button type="button" key={target} onClick={() => void convert(target)}>{documentTypeLabel(target, "en")}</button>)}</div></details> : null}</div>
    {sourceBooking ? <SectionCard title="Source" description="Linked from the native OperiX Booking → Invoice workflow."><div className="invoice-activity-row"><span className="invoice-row-icon"><CalendarDays size={15} /></span><span className="invoice-row-copy"><strong>OperiX Booking · {sourceBooking.booking_number || sourceBooking.id}</strong><small>The source booking remains linked to this document.</small></span><a className="btn" href={`${(process.env.NEXT_PUBLIC_OPERIX_BOOKING_URL || "https://booking.operixsuite.com").replace(/\/$/, "")}/bookings/${encodeURIComponent(sourceBooking.id)}`} target="_blank" rel="noreferrer">Open Booking</a></div></SectionCard> : null}
    {canManage && !salesBookPeriodLocked ? <div className="invoice-status-bar" title="Status changes are recorded in the document event log."><span className="invoice-status-bar-label">Status</span><div className="invoice-status-segments">{DOCUMENT_DEFINITIONS[documentType].statuses.filter((status) => ["DRAFT", "SENT", "ISSUED", "OVERDUE", "CANCELLED", "CONFIRMED", "PREPARED", "DELIVERED"].includes(status)).map((status) => { const targetStatus = transitionStatus(documentType, status); const permission = statusPermission(targetStatus); return <button type="button" disabled={!workspace.can(permission)} title={!workspace.can(permission) ? `Permission required: ${permission}` : undefined} className={`invoice-status-segment ${commercialStatus === status ? "is-active" : ""}`} key={status} onClick={() => void updateStatus(status)}>{statusLabel(status)}</button>; })}</div></div> : null}
    <div className="invoice-detail-layout"><main className="invoice-detail-main"><SectionCard title="Summary"><dl className="invoice-summary-grid"><SummaryFact icon={UserRound} label="Customer" value={invoice.client?.name || "Walk-in customer"} /><SummaryFact icon={CalendarDays} label="Issue date" value={shortDate(invoice.issue_date)} /><SummaryFact icon={CalendarDays} label="Due date" value={shortDate(invoice.due_date || invoice.issue_date)} /><SummaryFact icon={CreditCard} label="Payment method" value={paymentLabel(invoice.payment_method)} /><SummaryFact icon={FileText} label="Document type" value={documentTypeLabel(documentType, "en")} /><SummaryFact icon={Activity} label="Accounting" value={value(invoice as unknown as Record<string, unknown>, "accounting_state") || "legacy"} /></dl>{invoice.delivery_method ? <p className="muted mt-4">Delivery: <strong>{invoice.delivery_method}</strong>{invoice.delivery_details ? ` · ${invoice.delivery_details}` : ""}</p> : null}</SectionCard>
      <SectionCard title={`Items (${draft.items.length})`}><div className="invoice-items-table-wrap"><table className="invoice-items-table"><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>VAT</th><th>Total</th></tr></thead><tbody>{draft.items.map((item, index) => <tr key={item.id}><td><strong>{item.description || "Item"}</strong>{item.sku ? <small className="muted block">{item.sku}</small> : null}</td><td>{item.quantity} {item.unit}</td><td>{money(item.unit_price, draft.currency)}</td><td>{item.tax_rate}%{item.tax_included ? " incl." : ""}</td><td>{money(totals.lines[index]?.total || 0, draft.currency)}</td></tr>)}</tbody></table></div><div className="invoice-item-mobile-list">{draft.items.map((item, index) => <div className="invoice-item-mobile-row" key={item.id}><Package size={15} /><span className="invoice-item-mobile-copy"><strong>{item.description || "Item"}</strong><small>{item.quantity} {item.unit} · {item.tax_rate}% VAT</small></span><span className="invoice-item-mobile-total">{money(totals.lines[index]?.total || 0, draft.currency)}</span></div>)}</div><div className="invoice-detail-totals"><div className="invoice-total-line"><span>Subtotal</span><strong>{money(totals.subtotal, draft.currency)}</strong></div>{totals.discount > 0.005 ? <div className="invoice-total-line"><span>Discount</span><strong>-{money(totals.discount, draft.currency)}</strong></div> : null}<div className="invoice-total-line"><span>VAT</span><strong>{money(totals.tax, draft.currency)}</strong></div><div className="invoice-total-line is-total"><span>Total</span><strong>{money(totals.total, draft.currency)}</strong></div><div className="invoice-total-line"><span>Paid / allocated</span><strong>{money(paidAmount, draft.currency)}</strong></div><div className="invoice-total-line"><span>Outstanding</span><strong>{money(outstanding, draft.currency)}</strong></div></div></SectionCard>
      <SectionCard><div className="invoice-detail-tabs" role="tablist" aria-label="Document information">{(["payments", "activity", "notes", "files"] as DetailTab[]).map((item) => <button type="button" key={item} role="tab" aria-selected={tab === item} className={tab === item ? "is-active" : ""} onClick={() => setTab(item)}>{item.charAt(0).toUpperCase() + item.slice(1)}</button>)}</div>{tab === "payments" ? <PaymentsPanel payments={payments} currency={draft.currency || "EUR"} invoiceId={invoice.id} canRecordPayment={canRecordPayment} /> : null}{tab === "activity" ? <ActivityPanel events={events} status={commercialStatus} createdAt={invoice.created_at} /> : null}{tab === "notes" ? invoice.notes ? <p className="invoice-notes-copy">{String(invoice.notes)}</p> : <EmptyState title="No notes" description="Add notes from the invoice editor when context needs to travel with the document." icon={StickyNote} /> : null}{tab === "files" ? <div className="invoice-file-links"><button type="button" className="btn" onClick={() => void print(false)}><Printer size={16} /> Print / PDF</button><button type="button" className="btn" onClick={() => void download()}><Download size={16} /> Download PDF</button></div> : null}</SectionCard>
      {relatedDocuments.length ? <SectionCard title="Related documents"><div className="invoice-activity-list">{relatedDocuments.map((related) => <Link className="invoice-activity-row" key={related.id} href={`/invoices/${related.id}`}><span className="invoice-row-icon"><RefreshCw size={15} /></span><span className="invoice-row-copy"><strong>{documentTypeLabel(resolveCommercialDocumentType(related), "en")} · {related.invoice_number}</strong><small>{shortDate(related.issue_date)} · {statusLabel(String(related.commercial_status || related.status))}</small></span><span>{money(Number(related.total_amount || 0), draft.currency)}</span></Link>)}</div></SectionCard> : null}
    </main><aside className="invoice-detail-side no-print"><SectionCard><div className="invoice-side-total"><span>Total</span><strong>{money(totals.total, draft.currency)}</strong></div><dl className="invoice-side-facts"><div><dt>Status</dt><dd>{statusLabel(displayStatus)}</dd></div><div><dt>Outstanding</dt><dd>{money(outstanding, draft.currency)}</dd></div><div><dt>Customer</dt><dd>{invoice.client?.name || "Walk-in customer"}</dd></div></dl></SectionCard><SectionCard title="Document preview" className="invoice-preview-card"><div className="invoice-document-canvas"><button type="button" className="invoice-preview-open" aria-label="Open full-size preview" onClick={() => setPreviewOpen(true)}><ScaledDocument draft={draft} client={invoice.client || undefined} company={company} template={invoice.paper_size === "Receipt" ? "thermal" : "corporate"} config={config} /></button></div></SectionCard></aside></div>
    {previewOpen ? <div className="invoice-preview-modal no-print" role="dialog" aria-modal="true" aria-label="Document preview" onClick={() => setPreviewOpen(false)}><div className="invoice-preview-modal-body" onClick={(event) => event.stopPropagation()}><div className="invoice-preview-modal-bar"><strong>{documentTypeLabel(documentType, "en")} {invoice.invoice_number}</strong><div><button type="button" className="btn" onClick={() => void print()}><Printer size={15} /> Print / PDF</button><button type="button" className="btn" onClick={() => setPreviewOpen(false)}>Close</button></div></div><div className="invoice-preview-modal-scroll"><ScaledDocument draft={draft} client={invoice.client || undefined} company={company} template={invoice.paper_size === "Receipt" ? "thermal" : "corporate"} config={config} /></div></div></div> : null}
  </div>;
}

function SummaryFact({ icon: Icon, label, value: textValue }: { icon: typeof UserRound; label: string; value: string }) { return <div className="invoice-summary-item"><dt><Icon size={13} className="inline mr-1" aria-hidden="true" />{label}</dt><dd>{textValue}</dd></div>; }
function PaymentsPanel({ payments, currency, invoiceId, canRecordPayment }: { payments: PaymentRow[]; currency: string; invoiceId: string; canRecordPayment: boolean }) { return payments.length ? <div className="invoice-payment-list">{payments.map((payment) => <div className="invoice-payment-row" key={payment.id}><span className="invoice-row-icon"><CreditCard size={15} /></span><span className="invoice-row-copy"><strong>{payment.payment_number || "Payment received"}</strong><small>{shortDate(payment.payment_date)} · {paymentLabel(payment.payment_method)}</small></span><span className="invoice-row-amount">{money(Number(payment.amount || 0), currency)}</span></div>)}</div> : <div className="invoice-empty-tab"><EmptyState title="No payments recorded" description={canRecordPayment ? "Record and allocate a payment when money is received." : "Payments are not applicable to this document type."} actionLabel={canRecordPayment ? "Record payment" : undefined} actionHref={canRecordPayment ? `/payments?create=1&invoiceId=${invoiceId}` : undefined} icon={CreditCard} /></div>; }
function ActivityPanel({ events, status, createdAt }: { events: Array<Record<string, unknown>>; status: string; createdAt: string }) { const rows = events.length ? events : [{ event_type: "created", occurred_at: createdAt, to_status: status }]; return <div className="invoice-activity-list">{rows.map((event, index) => <div className="invoice-activity-row" key={value(event, "id") || `${value(event, "event_type")}-${index}`}><span className="invoice-row-icon"><Activity size={15} /></span><span className="invoice-row-copy"><strong>{statusLabel(value(event, "event_type") || "created")}</strong><small>{value(event, "occurred_at") ? new Date(value(event, "occurred_at")).toLocaleString() : "—"}{value(event, "to_status") ? ` · ${statusLabel(value(event, "to_status"))}` : ""}</small></span></div>)}</div>; }
function paymentLabel(value: string | undefined) { return value === "cash" ? "Cash" : value === "card" ? "Card" : "Bank transfer"; }
