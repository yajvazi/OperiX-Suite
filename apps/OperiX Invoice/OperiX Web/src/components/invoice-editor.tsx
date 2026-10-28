"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Eye, FileDown, Plus, Save, Trash2 } from "lucide-react";
import { addDays, isoToday, money } from "@/lib/format";
import { cashAllowed, invoiceTotals, paymentState } from "@/lib/invoice-calculations";
import type { ClientRow, InvoiceDraft, InvoiceEditorItem, InvoiceRow, InvoiceTemplate, InvoiceTemplateConfig, PaymentMethod, ProductRow } from "@/lib/models";
import { createClient } from "@/lib/supabase/client";
import { useBusinessData } from "@/hooks/use-business-data";
import { useWorkspace } from "@/hooks/use-workspace";
import { InvoiceDocument } from "./invoice-document";
import type { DocumentCompany } from "./invoice-document";
import { SignatureCapture } from "./signature-capture";
import { templateConfigFromRow, type InvoiceTemplateRow } from "@/lib/invoice-template-settings";
import { openInvoicePdf } from "@/lib/pdf-client";
import { applySalesBookAmendment, buildSalesBookAmendmentPayload, getInvoice, invoiceTotalsForDraft, listInvoices, saveCustomerPayment, saveInvoiceDocument, setInvoiceBranch, setInvoiceDeliveryDetails, setInvoiceProductPictures, type InvoiceRecord, type SavedInvoice } from "@invoice-monorepo/api/repositories";
import { DomainValidationError, DUE_DATE_PRESETS, dueDateForPreset, TAX_REPORTING_CATEGORIES, type DueDatePreset, type InvoiceDraftInput } from "@invoice-monorepo/api/domain";

const DUE_DATE_PRESET_LABELS: Record<DueDatePreset, string> = { one_week: "1 week", two_weeks: "2 weeks", one_month: "1 month", two_months: "2 months", three_months: "3 months" };
import { documentTypeLabel, resolveCommercialDocumentType, type CommercialDocumentType } from "@invoice-monorepo/commercial-documents";

function blankItem(id = crypto.randomUUID()): InvoiceEditorItem {
  return { id, description: "", quantity: 1, unit_price: 0, tax_rate: 18, tax_included: false, discount: 0, unit: "pcs" };
}

const documentTypeOptions: CommercialDocumentType[] = ["INVOICE", "QUOTE", "PROFORMA", "SALES_ORDER", "DELIVERY_NOTE", "ADVANCE_INVOICE", "FINAL_INVOICE", "CREDIT_NOTE", "DEBIT_NOTE", "SIMPLIFIED_INVOICE"];

function permissionForDocumentType(documentType: CommercialDocumentType) {
  switch (documentType) {
    case "QUOTE": return "offer.create";
    case "PROFORMA": return "proforma.create";
    case "SALES_ORDER": return "order.create";
    case "DELIVERY_NOTE": return "delivery_note.create";
    case "CREDIT_NOTE": return "invoice.credit";
    case "DEBIT_NOTE": return "invoice.debit";
    default: return "invoice.create";
  }
}

type MobileStep = "customer" | "items" | "review";

export function InvoiceEditor() {
  const router = useRouter();
  const search = useSearchParams();
  const today = isoToday();
  const editId = search.get("edit");
  const convertId = search.get("convert");
  const salesBookAmendmentId = search.get("salesBookAmendment");
  const clientsQuery = useBusinessData<ClientRow>("clients");
  const productsQuery = useBusinessData<ProductRow>("products");
  const workspace = useWorkspace();
  const clients = clientsQuery.data;
  const products = productsQuery.data;
  const initialDocumentType = resolveCommercialDocumentType({ commercial_document_type: search.get("documentType") || (search.get("type") === "offer" ? "QUOTE" : "INVOICE") });
  const [documentType, setDocumentType] = useState<CommercialDocumentType>(initialDocumentType);
  const [template, setTemplate] = useState<InvoiceTemplate>("corporate");
  const [templateConfig, setTemplateConfig] = useState<InvoiceTemplateConfig>({ style: "corporate", pageSize: "A4", showSignature: true, showStamp: true, showNotes: true, showDiscount: true, showTax: true, showBankDetails: true });
  const [draft, setDraft] = useState<InvoiceDraft>(() => ({ client_id: "", invoice_number: "", issue_date: today, due_date: addDays(today, 14), payment_method: "bank", amount_received: 0, notes: "", status: "draft", commercial_document_type: initialDocumentType, source_document_id: null, source_document_type: null, branch_id: null, delivery_method: null, pickup_branch_id: null, delivery_details: "", post_cod: false, discount_percent: 0, show_product_pictures: false, show_stamp: true, show_signature: true, items: [blankItem("new-item")] }));
  const [accountingState, setAccountingState] = useState("legacy");
  const [commercialStatus, setCommercialStatus] = useState("DRAFT");
  const [taxReportingCategory, setTaxReportingCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [previewMode, setPreviewMode] = useState(false);
  const [mobileStep, setMobileStep] = useState<MobileStep>("customer");
  const [showCustomerSignature, setShowCustomerSignature] = useState(false);
  const [sourceDocuments, setSourceDocuments] = useState<InvoiceRow[]>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string; registered_address?: string }>>([]);
  const saveIdempotencyKey = useRef<string | null>(null);
  const companyScopeKey = workspace.companyIds.join(",");

  useEffect(() => {
    const config = (workspace.company?.template_config || workspace.profile?.template_config || {}) as InvoiceTemplateConfig;
    const style = config.style || (config.pageSize === "Receipt" ? "thermal" : "corporate");
    queueMicrotask(() => { setTemplate(style); setTemplateConfig((current) => ({ ...current, ...config, style })); });
  }, [workspace.company?.template_config, workspace.profile?.template_config]);

  useEffect(() => {
    const currency = workspace.company?.currency || workspace.profile?.currency;
    if (!currency) return;
    queueMicrotask(() => setDraft((current) => current.currency ? current : { ...current, currency }));
  }, [workspace.company?.currency, workspace.profile?.currency]);

  useEffect(() => {
    if (!workspace.user) return;
    const supabase = createClient();
    if (!supabase) return;
    void supabase.from("invoice_templates").select("*").eq("user_id", workspace.user.id).eq("is_default", true).maybeSingle().then(({ data, error }) => {
      if (error) { setMessage(error.message); return; }
      if (!data) return;
      const shared = templateConfigFromRow(data as InvoiceTemplateRow);
      setTemplateConfig((current) => ({ ...current, ...shared }));
      if (!editId) setDraft((current) => ({ ...current, due_date: addDays(current.issue_date, shared.defaultDueDays || 30), items: current.items.map((item) => ({ ...item, tax_rate: shared.defaultTaxRate ?? item.tax_rate })) }));
    });
  }, [editId, workspace.user]);

  useEffect(() => {
    if (!workspace.companyId) return;
    const supabase = createClient();
    if (!supabase) return;
    void supabase.from("branches").select("id,name,registered_address").eq("company_id", workspace.companyId).eq("is_active", true).order("name").then(({ data, error }) => {
      if (error && error.code !== "42P01") setMessage(error.message);
      setBranches((data || []) as Array<{ id: string; name: string; registered_address?: string }>);
      if (!editId && data?.length) {
        void supabase.from("company_user_preferences").select("preferred_branch_id").eq("company_id", workspace.companyId).eq("user_id", workspace.user?.id || "").maybeSingle().then(({ data: preference }) => {
          const preferred = preference?.preferred_branch_id && data.some((branch) => branch.id === preference.preferred_branch_id) ? preference.preferred_branch_id : data.length === 1 ? data[0].id : null;
          if (preferred) setDraft((current) => ({ ...current, branch_id: preferred, pickup_branch_id: current.pickup_branch_id || preferred }));
        });
      }
    });
  }, [workspace.companyId]);


  useEffect(() => {
    if (!workspace.user || !workspace.companyIds.length || !draft.client_id || clients.find((item) => item.id === draft.client_id)?.pos_walk_in_customer) {
      queueMicrotask(() => setSourceDocuments([]));
      return;
    }
    const supabase = createClient();
    if (!supabase) return;
    void listInvoices(supabase, { userId: workspace.user.id, companyIds: workspace.companyIds }, {
      clientId: draft.client_id,
      select: "id,invoice_number,client_id,issue_date,due_date,status,type,subtype,commercial_document_type,commercial_status,total_amount,discount_percent,notes,items:invoice_items(*)",
      limit: 100,
    }).then((rows) => setSourceDocuments((rows as unknown as InvoiceRow[]).filter((row) => ["QUOTE", "PROFORMA", "SALES_ORDER", "INVOICE", "FINAL_INVOICE", "SIMPLIFIED_INVOICE"].includes(resolveCommercialDocumentType(row))))).catch(() => setSourceDocuments([]));
  }, [companyScopeKey, draft.client_id, clients, workspace.companyIds, workspace.user]);

  useEffect(() => {
    if (!editId || !workspace.user) return;
    const supabase = createClient();
    if (!supabase) return;
    void getInvoice(supabase, editId, { userId: workspace.user.id, companyIds: workspace.companyIds }, "*, client:clients(*), items:invoice_items(*, product:products(image_url))").then((data) => {
      if (!data) { setMessage("Invoice not found or not available in this workspace."); return; }
      const row = data as Record<string, unknown>;
      const itemRows = Array.isArray(row.items) ? row.items as Array<Record<string, unknown>> : [];
      setAccountingState(String(row.accounting_state || "legacy").toLowerCase());
      setCommercialStatus(String(row.commercial_status || row.status || "DRAFT").toUpperCase());
      setTaxReportingCategory(String(row.tax_reporting_category || ""));
      const resolvedDocumentType = resolveCommercialDocumentType(row);
      setDocumentType(resolvedDocumentType);
      setDraft({ client_id: row.client_id ? String(row.client_id) : "", invoice_number: String(row.invoice_number || ""), issue_date: String(row.issue_date || today), due_date: String(row.due_date || row.issue_date || today), payment_method: String(row.payment_method || "bank") as PaymentMethod, currency: String(row.currency || workspace.company?.currency || workspace.profile?.currency || "EUR"), amount_received: Number(row.amount_received || 0), notes: String(row.notes || ""), status: String(row.status || "draft") as InvoiceDraft["status"], commercial_document_type: resolvedDocumentType, source_document_type: row.source_document_type ? String(row.source_document_type) : null, source_document_id: row.source_document_id ? String(row.source_document_id) : null, branch_id: row.branch_id ? String(row.branch_id) : null, delivery_method: row.delivery_method ? String(row.delivery_method) as InvoiceDraft["delivery_method"] : null, pickup_branch_id: row.pickup_branch_id ? String(row.pickup_branch_id) : null, delivery_details: String(row.delivery_details || ""), post_cod: Boolean(row.post_cod), discount_percent: Number(row.discount_percent || 0), show_product_pictures: Boolean(row.show_product_pictures), show_stamp: true, show_signature: true, buyer_signature_url: row.buyer_signature_url ? String(row.buyer_signature_url) : null, customer_signature_requested: Boolean(row.customer_signature_requested), customer_signature_status: String(row.customer_signature_status || "not_requested") as InvoiceDraft["customer_signature_status"], customer_signature_name: row.customer_signature_name ? String(row.customer_signature_name) : null, customer_signed_at: row.customer_signed_at ? String(row.customer_signed_at) : null, items: itemRows.map((item) => ({ id: String(item.id), product_id: item.product_id ? String(item.product_id) : undefined, description: String(item.description || ""), quantity: Number(item.quantity || 0), unit_price: Number(item.unit_price || 0), tax_rate: Number(item.tax_rate || 0), tax_included: Boolean(item.tax_included), discount: Number(item.discount || 0), unit: String(item.unit || "pcs"), sku: item.sku ? String(item.sku) : undefined, image_url: item.image_url ? String(item.image_url) : (item.product && typeof item.product === "object" && (item.product as Record<string, unknown>).image_url ? String((item.product as Record<string, unknown>).image_url) : undefined) })) });
      setTemplate(row.template_id === "thermal" || row.paper_size === "Receipt" ? "thermal" : "corporate");
    }).catch((loadError) => setMessage(loadError instanceof Error ? loadError.message : "The invoice could not be loaded."));
  }, [companyScopeKey, editId, today, workspace.companyIds, workspace.company?.currency, workspace.profile?.currency, workspace.user]);

  useEffect(() => {
    if (!convertId || editId || !workspace.user) return;
    const supabase = createClient();
    if (!supabase) return;
    void getInvoice(supabase, convertId, { userId: workspace.user.id, companyIds: workspace.companyIds }, "*, client:clients(*), items:invoice_items(*, product:products(image_url))").then((data) => {
      if (!data) { setMessage("The source document was not found or is not available in this workspace."); return; }
      const row = data as Record<string, unknown>;
      const source = String(row.invoice_number || "");
      const itemRows = Array.isArray(row.items) ? row.items as Array<Record<string, unknown>> : [];
      const sourceType = resolveCommercialDocumentType(row);
      const targetType = resolveCommercialDocumentType({ commercial_document_type: search.get("documentType") || "INVOICE" });
      setDocumentType(targetType);
      setDraft((current) => ({ ...current, commercial_document_type: targetType, source_document_id: convertId, source_document_type: sourceType }));
      setTaxReportingCategory(String(row.tax_reporting_category || ""));
      setDraft({ client_id: row.client_id ? String(row.client_id) : "", invoice_number: "", issue_date: today, due_date: row.due_date ? String(row.due_date) : addDays(today, 14), payment_method: String(row.payment_method || "bank") as PaymentMethod, currency: String(row.currency || workspace.company?.currency || workspace.profile?.currency || "EUR"), amount_received: 0, notes: String(row.notes || `Converted from ${sourceType.toLowerCase()}`), status: "draft", commercial_document_type: targetType, source_document_id: convertId, source_document_type: sourceType, discount_percent: Number(row.discount_percent || 0), show_product_pictures: Boolean(row.show_product_pictures), show_stamp: true, show_signature: true, customer_signature_requested: false, customer_signature_status: "not_requested", buyer_signature_url: null, items: itemRows.map((item) => ({ id: crypto.randomUUID(), product_id: item.product_id ? String(item.product_id) : undefined, description: String(item.description || ""), quantity: Number(item.quantity || 0), unit_price: Number(item.unit_price || 0), tax_rate: Number(item.tax_rate || 0), tax_included: Boolean(item.tax_included), discount: Number(item.discount || 0), unit: String(item.unit || "pcs"), sku: item.sku ? String(item.sku) : undefined, image_url: item.image_url ? String(item.image_url) : undefined })) });
      setMessage(source ? `Ready to convert ${source}. A new number will be assigned when saved.` : "Ready to convert this document.");
    }).catch((loadError) => setMessage(loadError instanceof Error ? loadError.message : "The source document could not be loaded."));
  }, [companyScopeKey, convertId, editId, search, today, workspace.companyIds, workspace.company?.currency, workspace.profile?.currency, workspace.user]);

  const totals = useMemo(() => invoiceTotals(draft), [draft]);
  const payment = paymentState(totals.total, draft.amount_received);
  const cashPaymentAmount = Math.max(totals.total, Number(draft.amount_received) || 0);
  const cashIsAllowed = cashAllowed(cashPaymentAmount);
  const client = clients.find((item) => item.id === draft.client_id);
  const source = workspace.company || workspace.profile;
  const company: DocumentCompany = { name: source?.company_name || workspace.company?.name || "", email: source?.email || "", phone: source?.phone || "", address: source?.address || "", city: [workspace.company?.city, workspace.company?.country].filter(Boolean).join(", "), taxId: source?.tax_id || workspace.company?.fiscal_number || workspace.company?.vat_number || "", businessId: workspace.company?.unique_business_number, vatNumber: workspace.company?.vat_number, bankName: source?.bank_name || "", iban: source?.bank_iban || "", website: source?.website || "", logoUrl: source?.logo_url, signatureUrl: source?.signature_url, stampUrl: source?.stamp_url };
  const dataError = clientsQuery.error || productsQuery.error || workspace.error;
  const canEditCurrent = workspace.can("invoice.edit");
  const canCreateCurrent = workspace.can(permissionForDocumentType(documentType));
  const canIssueCurrent = workspace.can("invoice.issue");
  const canExportCurrent = workspace.can("financial.export");
  const availableDocumentTypes = documentTypeOptions.filter((type) => workspace.can(permissionForDocumentType(type)) || Boolean(editId && canEditCurrent));
  const canSaveCurrent = editId ? canEditCurrent : canCreateCurrent;

  function wholePercentage(value: string | number) { const parsed = Number(String(value).replace(",", ".")); return Number.isFinite(parsed) ? Math.min(100, Math.max(0, Math.round(parsed))) : 0; }
  function update<K extends keyof InvoiceDraft>(key: K, value: InvoiceDraft[K]) { setDraft((current) => ({ ...current, [key]: value, ...(key === "pickup_branch_id" && typeof value === "string" && value ? { branch_id: value } : {}) })); }
  function updateItem(id: string, key: keyof InvoiceEditorItem, value: string | number | boolean) { const nextValue = key === "discount" ? wholePercentage(value as string | number) : value; setDraft((current) => ({ ...current, items: current.items.map((item) => item.id === id ? { ...item, [key]: nextValue } : item) })); }
  function applyGlobalDiscount(value: string | number) { const discount = wholePercentage(value); setDraft((current) => ({ ...current, discount_percent: discount, items: current.items.map((item) => ({ ...item, discount })) })); }
  function chooseProduct(id: string, productId: string) { const product = products.find((row) => row.id === productId); if (!product) return; setDraft((current) => ({ ...current, items: current.items.map((item) => item.id === id ? { ...item, product_id: product.id, description: product.name, unit_price: product.unit_price, tax_rate: Number(product.tax_rate || 0), tax_included: Boolean(product.tax_included), unit: product.unit || "pcs", sku: product.sku, image_url: product.image_url, discount: current.discount_percent || item.discount } : item) })); }
  function chooseClient(clientId: string) { const selected = clients.find((item) => item.id === clientId); const discount = selected?.pos_walk_in_customer ? 0 : wholePercentage(selected?.discount_percent || 0); setDraft((current) => ({ ...current, client_id: clientId, discount_percent: discount, source_document_id: null, source_document_type: null, items: current.items.map((item) => ({ ...item, discount })) })); }
  function applySourceDocument(sourceId: string) { const sourceRow = sourceDocuments.find((row) => row.id === sourceId); if (!sourceRow) { setDraft((current) => ({ ...current, source_document_id: null, source_document_type: null })); return; } const sourceItems = Array.isArray((sourceRow as InvoiceRow & { items?: unknown[] }).items) ? (sourceRow as InvoiceRow & { items: Array<Record<string, unknown>> }).items : []; const sourceDiscount = wholePercentage(sourceRow.discount_percent || 0); setDraft((current) => ({ ...current, source_document_id: sourceRow.id, source_document_type: resolveCommercialDocumentType(sourceRow), due_date: sourceRow.due_date || current.due_date, notes: String(sourceRow.notes || current.notes), discount_percent: sourceDiscount, items: sourceItems.map((item) => ({ id: String(item.id || crypto.randomUUID()), product_id: item.product_id ? String(item.product_id) : undefined, description: String(item.description || ""), quantity: Number(item.quantity || 0), unit_price: Number(item.unit_price || 0), tax_rate: Number(item.tax_rate || 0), tax_included: Boolean(item.tax_included), discount: wholePercentage(Number(item.discount || sourceDiscount)), unit: String(item.unit || "pcs"), sku: item.sku ? String(item.sku) : undefined, image_url: item.image_url ? String(item.image_url) : item.product && typeof item.product === "object" ? String((item.product as Record<string, unknown>).image_url || "") || undefined : undefined })) })); }
  function chooseMethod(method: PaymentMethod) { if (method === "cash" && !cashIsAllowed) return; setDraft((current) => ({ ...current, payment_method: method, amount_received: method === "cash" ? current.amount_received : 0 })); }
  function toggleCustomerSignature(requested: boolean) { setDraft((current) => ({ ...current, customer_signature_requested: requested, buyer_signature_url: requested ? current.buyer_signature_url || null : null, customer_signature_status: requested ? current.buyer_signature_url ? "signed" : "pending" : "not_requested", customer_signature_name: requested ? client?.name || null : null, customer_signed_at: requested ? current.customer_signed_at || null : null })); }
  function saveCustomerSignature(signature: string) { setDraft((current) => ({ ...current, customer_signature_requested: true, buyer_signature_url: signature, customer_signature_status: "signed", customer_signature_name: client?.name || null, customer_signed_at: new Date().toISOString() })); setMessage("Customer signature captured. Review the invoice, then create it."); }

  async function save(status: "draft" | "sent") {
    if (salesBookAmendmentId && status === "draft") { setMessage("A Sales Book amendment must be applied as an issued invoice."); return; }
    if (branches.length > 0 && !draft.branch_id) { setMessage("Select the invoice and stock branch before saving."); return; }
    if (!workspace.user || (editId ? !canEditCurrent : !canCreateCurrent)) { setMessage(editId ? "Invoice edit permission is required." : "This document type is not enabled for your workspace."); return; }
    if (status !== "draft" && !canIssueCurrent) { setMessage("Invoice issue permission is required to finalize a document."); return; }
    if (salesBookAmendmentId && !workspace.can("sales_book.manage")) { setMessage("Sales Book management permission is required for an audited amendment."); return; }
    const domainDraft: InvoiceDraftInput = {
      userId: workspace.user?.id || "",
      companyId: workspace.companyId || "",
      branchId: draft.branch_id || null,
      clientId: draft.client_id && draft.client_id !== "walk-in" ? draft.client_id : null,
      // New document numbers are assigned by the tenant-scoped allocator;
      // existing documents keep their persisted number unchanged.
      invoiceNumber: editId ? draft.invoice_number || null : null,
      issueDate: draft.issue_date,
      dueDate: draft.due_date || null,
      documentType,
      status,
      commercialStatus: status !== "draft" && documentType === "INVOICE" && draft.payment_method === "cash" && cashIsAllowed && Number(draft.amount_received || 0) >= totals.total
        ? "PAID"
        : commercialStatus === "DRAFT" ? "DRAFT" : commercialStatus,
      paymentMethod: draft.payment_method,
      amountReceived: draft.amount_received,
      notes: draft.notes,
      currency: workspace.company?.currency || workspace.profile?.currency || "EUR",
      templateId: template,
      paperSize: template === "thermal" ? "Receipt" : "A4",
      taxReportingCategory: taxReportingCategory || null,
      postCod: draft.delivery_method === "delivery" && Boolean(draft.post_cod),
      sourceDocumentType: draft.source_document_type || (draft.source_document_id ? "commercial_document" : null),
      sourceDocumentId: draft.source_document_id || null,
      buyerSignatureUrl: draft.buyer_signature_url || null,
      customerSignatureRequested: draft.customer_signature_requested,
      customerSignatureStatus: draft.customer_signature_status,
      customerSignatureName: draft.customer_signature_name || client?.name || null,
      customerSignedAt: draft.customer_signed_at || null,
      showProductPictures: Boolean(draft.show_product_pictures),
      idempotencyKey: saveIdempotencyKey.current || (saveIdempotencyKey.current = crypto.randomUUID()),
      lines: draft.items.map((item) => ({
        id: item.id,
        productId: item.product_id || null,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        taxRate: item.tax_rate,
        discountPercent: wholePercentage(item.discount),
        unit: item.unit,
        sku: item.sku || null,
        taxIncluded: Boolean(item.tax_included),
      })),
    };
    if (!domainDraft.lines.length || domainDraft.lines.some((item) => !item.description)) { setMessage("Add at least one completed item."); return; }
    if (status !== "draft" && domainDraft.customerSignatureRequested && !domainDraft.buyerSignatureUrl) { setMessage("Ask the customer to sign before creating the invoice."); setShowCustomerSignature(true); return; }
    setSaving(true); setMessage("");
    const supabase = createClient();
    if (!supabase) { setMessage("Supabase is not configured."); setSaving(false); return; }
    try {
      if (!domainDraft.clientId) {
        const walkIn = await supabase.rpc("ensure_walk_in_customer", { p_company_id: domainDraft.companyId });
        if (walkIn.error || !walkIn.data) throw walkIn.error || new Error("The walk-in customer is unavailable.");
        domainDraft.clientId = String(walkIn.data);
      }
      let saved: SavedInvoice;
      if (salesBookAmendmentId) {
        if (!editId || documentType !== "INVOICE") throw new Error("A Sales Book amendment must target an ordinary invoice.");
        const amendmentPayload = buildSalesBookAmendmentPayload(domainDraft);
        const amended = await applySalesBookAmendment(supabase, salesBookAmendmentId, amendmentPayload.invoice as unknown as Record<string, unknown>, amendmentPayload.items as unknown as Record<string, unknown>[], domainDraft.idempotencyKey);
        saved = { invoice: amended as InvoiceRecord, totals: invoiceTotalsForDraft(domainDraft) };
      } else {
        saved = await saveInvoiceDocument(supabase, {
          draft: domainDraft,
          existingInvoiceId: editId,
          postInvoice: status !== "draft" && documentType === "INVOICE",
          // Finalized new invoices issue tracked stock atomically. Drafts,
          // non-invoice documents, and edits remain outside this path.
          stockCheckout: !editId && status !== "draft" && documentType === "INVOICE",
          replacePostedInvoice: Boolean(
            editId
            && documentType === "INVOICE"
            && (
              accountingState === "posted"
              || !["DRAFT", "SENT", "VIEWED"].includes(commercialStatus)
            )
          ),
        });
      }
      if (saved.invoice.id) {
        if (draft.branch_id) await setInvoiceBranch(supabase, saved.invoice.id, draft.branch_id);
        await setInvoiceProductPictures(supabase, saved.invoice.id, Boolean(draft.show_product_pictures));
        if (draft.delivery_method || editId) await setInvoiceDeliveryDetails(supabase, { invoiceId: saved.invoice.id, deliveryMethod: draft.delivery_method || null, pickupBranchId: draft.pickup_branch_id || null, deliveryDetails: draft.delivery_details || null });
        if (documentType === "DELIVERY_NOTE" && draft.source_document_id) {
          const fulfillment = await supabase.rpc("apply_delivery_fulfillment", { p_delivery_id: saved.invoice.id });
          if (fulfillment.error) throw fulfillment.error;
        }
        const fullyPaidCash = !salesBookAmendmentId && !editId && documentType === "INVOICE" && draft.payment_method === "cash" && saved.totals.total > 0 && draft.amount_received >= saved.totals.total;
        if (fullyPaidCash) {
          const paymentResult = await saveCustomerPayment(supabase, { userId: domainDraft.userId, companyId: domainDraft.companyId, customerId: domainDraft.clientId!, invoiceId: saved.invoice.id, amount: saved.totals.total, paymentDate: domainDraft.issueDate, paymentMethod: "cash", notes: `Cash payment for ${String(saved.invoice.invoice_number || "invoice")}`, currency: domainDraft.currency, idempotencyKey: domainDraft.idempotencyKey });
          if (paymentResult.allocationError) throw paymentResult.allocationError;
        }
      }
      saveIdempotencyKey.current = null;
      setSaving(false);
      router.push(`/invoices/${saved.invoice.id}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof DomainValidationError || error instanceof Error ? (error as Error).message : "The invoice could not be saved.");
      setSaving(false);
    }
  }

  async function print(receipt = false) { if (!canExportCurrent) { setMessage("Financial export permission is required."); return; } setMessage(""); try { await openInvoicePdf({ draft, client, company, receipt, template, config: templateConfig }, `${draft.invoice_number}.pdf`); } catch (error) { setMessage(error instanceof Error ? error.message : "The PDF could not be generated."); } }
  async function download() { if (!canExportCurrent) { setMessage("Financial export permission is required."); return; } setMessage(""); const response = await fetch("/api/pdf", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ draft, client, company, receipt: false, template, config: templateConfig }) }); if (!response.ok) { setMessage("The PDF could not be generated. Try printing the preview."); return; } const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `${draft.invoice_number}.pdf`; link.click(); URL.revokeObjectURL(url); }
  function nextMobileStep() { if (mobileStep === "customer") { setMessage(""); setMobileStep("items"); return; } if (mobileStep === "items") { if (!draft.items.length || draft.items.some((item) => !item.description)) { setMessage("Add at least one completed item before continuing."); return; } setMessage(""); setMobileStep("review"); return; } void save("sent"); }

  return <div className="mx-auto invoice-editor-page" data-mobile-step={mobileStep}>
    <header className="flex flex-wrap items-center gap-3 mb-5"><div><h1 className="page-title">{editId ? "Edit" : "Create"} {documentTypeLabel(documentType, "en")}</h1><p className="text-xs mt-1.5"><span className="text-[#004ffe]">Invoices</span><span className="muted"> &nbsp;/&nbsp; {editId ? "Edit" : "Create"}</span></p></div><div className="invoice-flow-stepper" aria-label="Invoice creation steps">{([["customer", "Customer"], ["items", "Items"], ["review", "Review"]] as const).map(([value, label], index) => <button type="button" key={value} className={mobileStep === value ? "is-active" : ""} onClick={() => setMobileStep(value)}><span>{index + 1}</span>{label}</button>)}</div><div className="ml-auto flex gap-2 invoice-editor-actions"><button data-testid="invoice.save-draft" className="btn" onClick={() => void save("draft")} disabled={saving || !canSaveCurrent}>Save as Draft</button><button data-testid="invoice.preview" className="btn" onClick={() => setPreviewMode(!previewMode)}><Eye size={16} /> Preview</button><button data-testid="invoice.create" className="btn btn-primary" onClick={() => void save("sent")} disabled={saving || !canSaveCurrent || !canIssueCurrent}><Save size={16} />{saving ? "Saving…" : editId ? "Update" : `Create ${documentTypeLabel(documentType, "en")}`}</button></div></header>
    {dataError ? <p className="mb-4 p-3 rounded bg-[#fff3f2] text-[#d92d20] text-xs">{dataError}</p> : null}{salesBookAmendmentId ? <p className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">This invoice is being corrected through an audited Sales Book amendment. Save as an issued invoice to apply the recorded reason.</p> : null}{message ? <p className="mb-4 p-3 rounded bg-[#fff3f2] text-[#d92d20] text-xs">{message}</p> : null}
    <div className={`grid gap-5 ${previewMode ? "grid-cols-1" : "xl:grid-cols-[minmax(0,1.9fr)_minmax(340px,1fr)]"}`}><div className={`${previewMode ? "hidden" : "grid grid-cols-1 gap-4"} min-w-0`}>
      <FormCard className="invoice-flow-customer invoice-flow-details" title="Customer &amp; dates"><div className="grid sm:grid-cols-2 gap-4"><label className="field"><span>Customer</span><select data-testid="invoice.customer" className="select" value={draft.client_id} onChange={(event) => chooseClient(event.target.value)}><option value="">Walk-in customer</option>{clients.filter((item) => !item.pos_walk_in_customer).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><Field label="Invoice Number" value={draft.invoice_number} onChange={(value) => update("invoice_number", value)} /><Field label="Issue Date" type="date" value={draft.issue_date} onChange={(value) => update("issue_date", value)} /><Field label="Due Date" type="date" value={draft.due_date} onChange={(value) => update("due_date", value)} /><div className="invoice-due-presets sm:col-span-2"><span className="muted">Due in:</span>{DUE_DATE_PRESETS.map((preset) => <button key={preset} type="button" className="invoice-chip" onClick={() => update("due_date", dueDateForPreset(draft.issue_date, preset))}>{DUE_DATE_PRESET_LABELS[preset]}</button>)}</div>{branches.length ? <label className="field"><span>Branch (stock) <b className="text-[#d92d20]">*</b></span><select className="select" value={draft.branch_id || ""} onChange={(event) => update("branch_id", event.target.value || null)}><option value="">Select branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label> : null}</div><p className="invoice-client-info">{client ? [client.email, [client.address, client.city].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "No contact details on file" : (!clientsQuery.loading && !clients.length ? "A walk-in customer is used when no customer record is selected." : "Walk-in customer: no customer details on the invoice.")}</p></FormCard>
      <FormCard className="invoice-flow-items" title="Items"><div className="table-wrap"><table className="data-table min-w-[740px]"><thead><tr><th>Item</th><th>Qty</th><th>Unit Price</th><th>VAT</th><th>Discount</th><th>Total</th><th /></tr></thead><tbody>{draft.items.map((item, index) => <tr key={item.id}><td><select className="select min-w-40" value={item.product_id || ""} onChange={(event) => chooseProduct(item.id, event.target.value)}><option value="">Custom item</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select><input className="input mt-2 block min-w-40" value={item.description} onChange={(event) => updateItem(item.id, "description", event.target.value)} /></td><td><input className="input w-16" type="number" min=".01" step=".01" value={item.quantity} onChange={(event) => updateItem(item.id, "quantity", Number(event.target.value))} /></td><td><input className="input w-24" type="number" min="0" step=".01" value={item.unit_price} onChange={(event) => updateItem(item.id, "unit_price", Number(event.target.value))} />{item.tax_included ? <small className="muted block mt-1">VAT included</small> : null}</td><td><input className="input" style={{ width: 76 }} type="number" min="0" max="100" step=".01" value={item.tax_rate} onChange={(event) => updateItem(item.id, "tax_rate", Number(event.target.value))} /><label className="mt-1 flex items-center gap-1 text-[10px] muted"><input type="checkbox" checked={Boolean(item.tax_included)} onChange={(event) => updateItem(item.id, "tax_included", event.target.checked)} /> incl.</label></td><td><input className="input" style={{ width: 76 }} type="number" min="0" max="100" step="1" value={item.discount} onChange={(event) => updateItem(item.id, "discount", Number(event.target.value))} /></td><td className="font-medium">{money(totals.lines[index]?.total || 0, draft.currency)}</td><td><button type="button" className="icon-btn w-8 h-8 text-[#d92e20]" onClick={() => setDraft((current) => ({ ...current, items: current.items.filter((row) => row.id !== item.id) }))} aria-label="Remove item"><Trash2 size={15} /></button></td></tr>)}</tbody></table></div><button data-testid="invoice.add-item" type="button" className="btn mt-3" onClick={() => setDraft((current) => ({ ...current, items: [...current.items, { ...blankItem(), discount: current.discount_percent || 0 }] }))}><Plus size={16} /> Add item</button></FormCard>
      <FormCard className="invoice-flow-review" title="Payment"><div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3"><PaymentChoice label="Bank transfer" active={draft.payment_method === "bank"} onClick={() => chooseMethod("bank")} /><PaymentChoice label="Cash" active={draft.payment_method === "cash"} disabled={!cashIsAllowed} onClick={() => chooseMethod("cash")} /><PaymentChoice label="Card" active={draft.payment_method === "card"} onClick={() => chooseMethod("card")} /><PaymentChoice label="Online payment" active={draft.payment_method === "online_payment"} onClick={() => chooseMethod("online_payment")} /><PaymentChoice label="Cheque" active={draft.payment_method === "cheque"} onClick={() => chooseMethod("cheque")} /><PaymentChoice label="Other" active={draft.payment_method === "other"} onClick={() => chooseMethod("other")} /><PaymentChoice label="Debt" active={draft.payment_method === "customer_credit"} onClick={() => chooseMethod("customer_credit")} /></div>{draft.payment_method === "cash" ? <div className="mt-4 grid sm:grid-cols-2 gap-4"><label className="field"><span className="flex">Amount paid ({draft.currency || "EUR"})<button type="button" className="ml-auto text-[#004ffe]" onClick={() => update("amount_received", Number(totals.total.toFixed(2)))}>Exact amount</button></span><input className="input" type="number" step=".01" value={draft.amount_received} onChange={(event) => update("amount_received", Number(event.target.value))} /></label><div className="field"><span>Change</span><strong className="input bg-[#f7f9fc] text-[#004ffe]">{money(payment.change, draft.currency)}</strong></div></div> : null}<p className="text-[11px] muted mt-3">Cash is available for payments below €300. Other methods are recorded with the invoice and can be allocated from Payments.</p></FormCard>
      <FormCard className="invoice-flow-review" title="Notes"><textarea className="textarea" value={draft.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Add payment terms or notes…" /></FormCard>
      <details className="card invoice-advanced invoice-flow-review"><summary><span><strong>Advanced options</strong><small>Document type, delivery, VAT treatment, template, customer signature</small></span><ChevronDown size={18} /></summary><div className="invoice-advanced-body"><div className="grid sm:grid-cols-2 gap-4"><label className="field"><span>Currency</span><select className="select" value={draft.currency || source?.currency || "EUR"} disabled><option value={draft.currency || source?.currency || "EUR"}>{draft.currency || source?.currency || "EUR"}</option></select></label><label className="field"><span>TAK sales-book treatment</span><select className="select" value={taxReportingCategory} onChange={(event) => setTaxReportingCategory(event.target.value)}><option value="">Automatic from invoice lines</option>{TAX_REPORTING_CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label.en}</option>)}</select></label></div><p className="mt-3 text-[11px] muted">Leave automatic for ordinary Kosovo invoices. Select an explicit TAK treatment for exports, exemptions, reverse charge, credit/debit notes, bad debt, or VAT adjustments.</p><div className="mt-4"><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4"><label className="field"><span>Document type</span><select className="select" value={documentType} disabled={!availableDocumentTypes.length} onChange={(event) => { const next = event.target.value as CommercialDocumentType; setDocumentType(next); update("commercial_document_type", next); }}>{availableDocumentTypes.map((type) => <option key={type} value={type}>{documentTypeLabel(type, "en")}</option>)}</select></label><label className="field"><span>Link source document</span><select className="select" value={draft.source_document_id || ""} onChange={(event) => applySourceDocument(event.target.value)}><option value="">No linked document</option>{sourceDocuments.map((row) => <option key={row.id} value={row.id}>{documentTypeLabel(resolveCommercialDocumentType(row), "en")} · {row.invoice_number}</option>)}</select></label><label className="field"><span>Form discount (%)</span><input className="input" type="number" min="0" max="100" step="1" value={draft.discount_percent || 0} onChange={(event) => applyGlobalDiscount(event.target.value)} /></label><label className="field"><span>Delivery method</span><select className="select" value={draft.delivery_method || ""} onChange={(event) => { const method = (event.target.value || null) as InvoiceDraft["delivery_method"]; setDraft((current) => ({ ...current, delivery_method: method, ...(method !== "delivery" ? { post_cod: false } : {}) })); }}><option value="">Not specified</option><option value="pickup">Pickup</option><option value="delivery">Delivery</option><option value="bus">Bus / carrier</option><option value="other">Other transport</option></select></label>{draft.delivery_method === "pickup" ? <label className="field"><span>Pickup store</span><select className="select" value={draft.pickup_branch_id || ""} onChange={(event) => update("pickup_branch_id", event.target.value || null)}><option value="">Select store</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label> : null}<label className="field"><span>Delivery details</span><input className="input" value={draft.delivery_details || ""} onChange={(event) => update("delivery_details", event.target.value)} placeholder="Address, carrier, or reference" /></label>{draft.delivery_method === "delivery" ? <label className="flex items-start gap-2 text-xs sm:col-span-2"><input type="checkbox" className="mt-0.5" checked={Boolean(draft.post_cod)} onChange={(event) => update("post_cod", event.target.checked)} /><span><span className="font-medium">Post COD</span><br /><span className="muted">The courier is holding the cash until it is reconciled.</span></span></label> : null}</div><div className="mt-4 grid gap-2 sm:grid-cols-3"><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={Boolean(draft.show_product_pictures)} onChange={(event) => update("show_product_pictures", event.target.checked)} /> Show product pictures</label><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={draft.show_signature !== false} onChange={(event) => update("show_signature", event.target.checked)} /> Show company signature</label><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={draft.show_stamp !== false} onChange={(event) => update("show_stamp", event.target.checked)} /> Show company stamp</label></div><p className="mt-3 text-[11px] muted">Document identity, links, delivery metadata, and display choices are saved with the invoice. Fiscal receipts remain unavailable until EFS certification.</p></div><FormCard className="invoice-flow-review" title="Template"><div className="grid sm:grid-cols-2 gap-3"><button type="button" className={`btn text-left ${template === "corporate" ? "border-[#004ffe] bg-[#edf4ff] text-[#004ffe]" : ""}`} onClick={() => { setTemplate("corporate"); setTemplateConfig((current) => ({ ...current, style: "corporate", pageSize: "A4" })); }}><b className="block">Corporate</b><span className="text-[11px] muted">A4 professional invoice</span></button><button type="button" className={`btn text-left ${template === "thermal" ? "border-[#004ffe] bg-[#edf4ff] text-[#004ffe]" : ""}`} onClick={() => { setTemplate("thermal"); setTemplateConfig((current) => ({ ...current, style: "thermal", pageSize: "Receipt" })); }}><b className="block">Thermal receipt</b><span className="text-[11px] muted">Compact 50 mm receipt</span></button></div></FormCard><FormCard className="invoice-flow-review" title="Customer acceptance"><label className="flex cursor-pointer items-start gap-3"><input className="mt-1 h-4 w-4 accent-[#004ffe]" type="checkbox" checked={Boolean(draft.customer_signature_requested)} onChange={(event) => toggleCustomerSignature(event.target.checked)} /><span><strong className="block text-sm">Ask customer to sign this invoice</strong><span className="muted mt-1 block text-xs">Hand the phone to the customer before creating the invoice. Their signature will be printed alongside the issuer signature.</span></span></label>{draft.customer_signature_requested ? <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-[#d0d5dd] bg-[#f8fafc] p-3">{draft.buyer_signature_url ? <img src={draft.buyer_signature_url} alt="Captured customer signature" className="h-12 max-w-40 rounded border border-[#d0d5dd] bg-white object-contain px-2" /> : <span className="text-xs text-[#b54708]">Signature still required before creating.</span>}<button type="button" className="btn ml-auto" onClick={() => setShowCustomerSignature(true)}>{draft.buyer_signature_url ? "Replace signature" : "Capture signature"}</button></div> : null}</FormCard></div></details>
    </div><aside className={`min-w-0 grid grid-cols-[minmax(0,1fr)] gap-4 ${previewMode ? "max-w-[840px] mx-auto w-full" : "xl:sticky xl:top-20 self-start"}`}>{previewMode ? null : <div className="card p-5 invoice-flow-summary invoice-summary-card"><SummaryLine label="Subtotal" value={totals.subtotal} currency={draft.currency} /><SummaryLine label="Tax" value={totals.tax} currency={draft.currency} /><SummaryLine label="Discount" value={-totals.discount} currency={draft.currency} /><div className="border-t mt-3 pt-3 flex font-semibold text-lg"><span>Total</span><span className="ml-auto text-[#004ffe]">{money(totals.total, draft.currency)}</span></div><button data-testid="invoice.create-side" type="button" className="btn btn-primary mt-4 w-full" onClick={() => void save("sent")} disabled={saving || !canSaveCurrent || !canIssueCurrent}><Save size={16} />{saving ? "Saving…" : editId ? "Update" : `Create ${documentTypeLabel(documentType, "en")}`}</button><button type="button" className="btn mt-2 w-full" onClick={() => void save("draft")} disabled={saving || !canSaveCurrent}>Save as draft</button></div>}<div className="card p-3 sm:p-4 bg-[#f1f4f8]"><div className="flex items-center mb-3"><strong className="text-xs">Invoice preview ({template === "thermal" ? "50 mm" : "A4"})</strong><span className="ml-auto text-[10px] text-[#12b76a]">● Live</span></div><div className={previewMode ? "overflow-auto" : "overflow-auto invoice-editor-preview-scale"}><InvoiceDocument draft={draft} client={client} company={company} template={template} config={templateConfig} /></div><div className="mt-3 flex flex-wrap gap-2"><button type="button" className="btn flex-1" onClick={() => void print(template === "thermal")}>{template === "thermal" ? "Print receipt" : "Print A4"}</button><button type="button" className="btn" onClick={() => void download()}><FileDown size={16} /> PDF</button></div></div></aside></div>
    <div className="invoice-mobile-flow-cta"><button type="button" className="btn btn-primary" onClick={nextMobileStep} disabled={saving}>{mobileStep === "customer" ? "Next: Items" : mobileStep === "items" ? "Next: Review" : saving ? "Saving…" : editId ? "Update invoice" : "Create invoice"}</button></div>
    <SignatureCapture open={showCustomerSignature} customerName={client?.name} onClose={() => setShowCustomerSignature(false)} onSave={saveCustomerSignature} />
  </div>;
}

function FormCard({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) { return <section className={`card p-4 invoice-flow-card ${className}`}><h2 className="font-semibold mb-4">{title}</h2>{children}</section>; }
function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  const readOnly = label === "Invoice Number";
  return <label className="field"><span>{label}</span><input className="input" type={type} value={value || (readOnly ? "Assigned automatically on save" : "")} onChange={readOnly ? undefined : (event) => onChange(event.target.value)} readOnly={readOnly} aria-readonly={readOnly || undefined} /></label>;
}
function PaymentChoice({ label, active, disabled, onClick }: { label: string; active: boolean; disabled?: boolean; onClick: () => void }) { return <button type="button" disabled={disabled} className={`btn ${active ? "border-[#004ffe] bg-[#edf4ff] text-[#004ffe]" : ""}`} onClick={onClick}>{label}</button>; }
function SummaryLine({ label, value, currency }: { label: string; value: number; currency?: string }) { return <div className="flex py-1.5 text-xs"><span className="muted">{label}</span><span className={`ml-auto ${value < 0 ? "text-[#d92d20]" : ""}`}>{money(value, currency)}</span></div>; }
