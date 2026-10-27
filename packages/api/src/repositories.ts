import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { calculateInvoice, type InvoiceCalculationResult } from '@invoice-monorepo/money';
import type {
  InvoiceDraftInput,
  InvoiceItemPersistencePayload,
  InvoicePersistencePayload,
} from './domain';
import {
  buildInvoicePersistencePayload,
  validateInvoiceDraft,
} from './domain';
import type { WorkspaceScope } from './workspace';
import { scopedResource } from './workspace';
import type { AgentAdvance, AgentSettlement, CompanyAgent, CompanyBankAccountShare, FundBalance, FundTransfer, PostCodSettlement, StripePayoutSettlement } from '@invoice-monorepo/types';

export interface InvoiceRecord extends Record<string, unknown> {
  id: string;
}

export interface SaveInvoiceOptions {
  draft: InvoiceDraftInput;
  existingInvoiceId?: string | null;
  postInvoice?: boolean;
  replacePostedInvoice?: boolean;
  stockCheckout?: boolean;
  idempotencyKey?: string | null;
}

export interface SavedInvoice {
  invoice: InvoiceRecord;
  totals: InvoiceCalculationResult;
}

export interface BranchRecord {
  id: string;
  company_id: string;
  code: string;
  name: string;
  registered_address?: string | null;
  municipality?: string | null;
  is_head_office?: boolean;
  is_active?: boolean;
}

export interface ProductBranchStockRecord {
  id: string;
  company_id: string;
  branch_id: string;
  product_id: string;
  stock_quantity: number | string;
  low_stock_threshold: number | string;
}

export async function listBranches(client: SupabaseClient, companyId: string) {
  return unwrap<BranchRecord[]>(client.from('branches')
    .select('id,company_id,code,name,registered_address,municipality,is_head_office,is_active')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('name'));
}

export async function getPreferredBranchId(client: SupabaseClient, userId: string, companyId: string) {
  const row = await unwrap<{ preferred_branch_id: string | null } | null>(client.from('company_user_preferences')
    .select('preferred_branch_id')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .maybeSingle());
  return row?.preferred_branch_id || null;
}

export async function setPreferredBranch(client: SupabaseClient, companyId: string, branchId: string | null) {
  return unwrap<Row>(client.rpc('set_preferred_branch', { p_company_id: companyId, p_branch_id: branchId }));
}

export async function listProductBranchStock(client: SupabaseClient, companyId: string, branchId?: string | null, productIds?: readonly string[]) {
  let request = client.from('product_branch_stock').select('id,company_id,branch_id,product_id,stock_quantity,low_stock_threshold').eq('company_id', companyId);
  if (branchId) request = request.eq('branch_id', branchId);
  if (productIds?.length) request = request.in('product_id', [...productIds]);
  return unwrap<ProductBranchStockRecord[]>(request);
}

export async function saveProductBranchStock(client: SupabaseClient, input: { companyId: string; productId: string; branchId: string; stockQuantity: number | string; lowStockThreshold?: number | string }) {
  const { data, error } = await client.rpc('set_product_branch_stock', {
    p_company_id: input.companyId,
    p_product_id: input.productId,
    p_branch_id: input.branchId,
    p_stock_quantity: input.stockQuantity,
    p_low_stock_threshold: input.lowStockThreshold ?? 5,
  });

  // Keep product creation/editing compatible while an environment is still
  // running before the branch-scoped inventory migration. The legacy
  // products.stock_quantity value has already been saved by this point, so a
  // missing RPC must not make the whole product save appear to fail.
  if (error?.code === 'PGRST202') return null;
  if (error) throw error;
  return data as ProductBranchStockRecord;
}

export async function setInvoiceBranch(client: SupabaseClient, invoiceId: string, branchId: string | null) {
  return unwrap<InvoiceRecord | null>(client.rpc('set_invoice_operating_branch', {
    p_invoice_id: invoiceId,
    p_branch_id: branchId,
  }));
}

export interface BranchStockTransferResult {
  transfer_id: string;
  product_id: string;
  from_branch_id: string;
  to_branch_id: string;
  quantity: number | string;
  source_stock: number | string;
  destination_stock: number | string;
  note?: string | null;
}

export async function transferProductBranchStock(
  client: SupabaseClient,
  input: {
    companyId: string;
    productId: string;
    fromBranchId: string;
    toBranchId: string;
    quantity: number | string;
    transferId?: string | null;
    note?: string | null;
  },
) {
  return unwrap<BranchStockTransferResult>(client.rpc('transfer_product_branch_stock', {
    p_company_id: input.companyId,
    p_product_id: input.productId,
    p_from_branch_id: input.fromBranchId,
    p_to_branch_id: input.toBranchId,
    p_quantity: input.quantity,
    p_transfer_id: input.transferId || null,
    p_note: input.note || null,
  }));
}

export interface PaymentDraftInput {
  userId: string;
  companyId: string;
  customerId: string;
  invoiceId?: string | null;
  paymentNumber?: string | null;
  amount: number | string;
  paymentDate: string;
  paymentMethod: 'cash' | 'bank' | 'bank_transfer' | 'card' | 'online_payment' | 'cheque' | 'other';
  bankReference?: string | null;
  companyBankAccountId?: string | null;
  fundAccountId?: string | null;
  payerName?: string | null;
  attachmentId?: string | null;
  notes?: string | null;
  existingPaymentId?: string | null;
  currency?: string;
  idempotencyKey?: string | null;
}

export interface SavedPayment {
  payment: Record<string, unknown>;
  allocation?: Record<string, unknown> | null;
  allocationError?: PostgrestError | null;
}

export interface PosSaleLineInput {
  productId: string;
  quantity: number | string;
  unitPrice: number | string;
  discountPercent?: number | string;
  description?: string;
  unit?: string;
  sku?: string | null;
}

export interface PosSaleInput {
  userId: string;
  companyId: string;
  branchId?: string | null;
  terminalId?: string | null;
  customerId?: string | null;
  lines: readonly PosSaleLineInput[];
  payment: 'cash' | 'card' | 'bank' | 'customer_credit' | 'other';
  cashReceived?: number | string;
  documentDiscountPercent?: number | string;
  documentDiscountAmount?: number | string;
  notes?: string | null;
  currency?: string;
  idempotencyKey: string;
  customerSignature?: {
    requested: boolean;
    signatureUrl?: string | null;
    name?: string | null;
    signedAt?: string | null;
  };
}

export interface PosSaleResult {
  invoiceId: string;
  invoiceNumber: string;
  orderId?: string;
  totalAmount?: number;
  changeAmount?: number;
  idempotent?: boolean;
  paymentAllocationError?: PostgrestError | null;
}

type Row = Record<string, unknown>;

async function unwrap<T>(request: unknown) {
  const result = await request as { data: T | null; error: PostgrestError | null };
  if (result.error) throw result.error;
  return result.data as T;
}

function generatedIdempotencyKey() {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject?.randomUUID) return cryptoObject.randomUUID();
  throw new Error('A secure idempotency key generator is not available.');
}

function asInvoiceRecord(value: unknown) {
  if (!value || typeof value !== 'object' || !('id' in value)) throw new Error('The saved invoice response was invalid.');
  return value as InvoiceRecord;
}

function ownedRowScope(userId: string, companyId: string | null) {
  return companyId
    ? `company_id.eq.${companyId},and(user_id.eq.${userId},company_id.is.null)`
    : `and(user_id.eq.${userId},company_id.is.null)`;
}

function effectivePosDiscounts(input: PosSaleInput, products: Map<string, Row>) {
  return calculateInvoice({
    lines: input.lines.map((line) => {
      const product = products.get(line.productId);
      return {
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountPercent: line.discountPercent,
        taxRate: Number(product?.tax_rate) || 0,
        taxIncluded: Boolean(product?.tax_included),
      };
    }),
    documentDiscountPercent: input.documentDiscountPercent,
    documentDiscountAmount: input.documentDiscountAmount,
    currency: input.currency,
  }).lines.map((line) => line.effectiveDiscountPercent);
}

function documentTypeForNumbering(value: InvoiceDraftInput['documentType']) {
  const mapping: Record<InvoiceDraftInput['documentType'], string> = {
    QUOTE: 'quote',
    PROFORMA: 'proforma',
    SALES_ORDER: 'sales_order',
    DELIVERY_NOTE: 'delivery_note',
    INVOICE: 'invoice',
    ADVANCE_INVOICE: 'advance_invoice',
    FINAL_INVOICE: 'final_invoice',
    CREDIT_NOTE: 'credit_note',
    DEBIT_NOTE: 'debit_note',
    SIMPLIFIED_INVOICE: 'simplified_invoice',
    FISCAL_RECEIPT: 'fiscal_receipt',
    BAD_DEBT_INVOICE: 'bad_debt_invoice',
  };
  return mapping[value];
}

export async function reserveDocumentNumber(
  client: SupabaseClient,
  companyId: string,
  documentType: InvoiceDraftInput['documentType'],
  issueDate: string,
) {
  const number = await unwrap<unknown>(client.rpc('reserve_invoice_number', {
    p_company_id: companyId,
    p_document_type: documentTypeForNumbering(documentType),
    p_issue_date: issueDate,
  }));
  if (typeof number !== 'string' || !number.trim()) throw new Error('The document number allocator returned no number.');
  return number;
}

export function invoiceTotalsForDraft(input: InvoiceDraftInput) {
  const totals = calculateInvoice({
    lines: input.lines.map((line) => ({
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountPercent: line.discountPercent,
      taxRate: line.taxRate,
      taxIncluded: line.taxIncluded,
    })),
    documentDiscountPercent: input.documentDiscountPercent,
    documentDiscountAmount: input.documentDiscountAmount,
    shipping: input.shipping,
    transport: input.transport,
    additionalFees: input.additionalFees,
    taxIncluded: input.taxIncluded,
    paidAmount: input.amountReceived,
    currency: input.currency,
  });
  validateInvoiceDraft(input, totals);
  return totals;
}

/** Build the same canonical persistence payload used by normal invoice saves.
 * Amendment commands reuse this payload so corrections never invent a second
 * financial calculation path.
 */
export function buildSalesBookAmendmentPayload(draft: InvoiceDraftInput) {
  const totals = invoiceTotalsForDraft(draft);
  const invoiceNumber = draft.invoiceNumber?.trim();
  if (!invoiceNumber) throw new Error('An invoice number is required for an amendment.');
  return buildInvoicePersistencePayload(draft, totals, invoiceNumber);
}

export async function saveInvoiceDocument(client: SupabaseClient, options: SaveInvoiceOptions): Promise<SavedInvoice> {
  const { draft } = options;
  const totals = invoiceTotalsForDraft(draft);
  const existingInvoiceId = options.existingInvoiceId || null;
  const idempotencyKey = options.idempotencyKey || draft.idempotencyKey || (!existingInvoiceId ? generatedIdempotencyKey() : null);
  const invoiceNumber = existingInvoiceId
    ? (draft.invoiceNumber || '')
    : draft.invoiceNumber?.trim() || await reserveDocumentNumber(client, draft.companyId, draft.documentType, draft.issueDate);
  if (!invoiceNumber) throw new Error('A document number is required.');
  const persistence = buildInvoicePersistencePayload(draft, totals, invoiceNumber);

  if (options.stockCheckout && !existingInvoiceId) {
    const stockResult = await unwrap<unknown>(client.rpc('save_invoice_document_with_stock', {
      p_invoice: persistence.invoice,
      p_items: persistence.items,
      p_idempotency_key: idempotencyKey,
      p_post_invoice: options.postInvoice ?? true,
    }));
    return { invoice: asInvoiceRecord(Array.isArray(stockResult) ? stockResult[0] : stockResult), totals };
  }

  const saveRpc = draft.externalReference !== undefined
    ? 'save_invoice_document_with_external_reference'
    : 'save_invoice_document';
  const saved = options.replacePostedInvoice && existingInvoiceId
    ? await unwrap<unknown>(client.rpc('replace_posted_invoice_document', {
      p_invoice: persistence.invoice,
      p_items: persistence.items,
      p_invoice_id: existingInvoiceId,
      p_idempotency_key: idempotencyKey,
    }))
    : await unwrap<unknown>(client.rpc(saveRpc, {
      p_invoice: persistence.invoice,
      p_items: persistence.items,
      p_invoice_id: existingInvoiceId,
      p_post_invoice: options.postInvoice ?? false,
      p_idempotency_key: idempotencyKey,
    }));
  return { invoice: asInvoiceRecord(Array.isArray(saved) ? saved[0] : saved), totals };
}

export async function postCreditNote(
  client: SupabaseClient,
  invoiceId: string,
  reason = 'Customer product return',
) {
  return unwrap<Row>(client.rpc('post_credit_note', {
    p_invoice_id: invoiceId,
    p_reason: reason,
  }));
}

export async function setInvoiceDeliveryMethod(
  client: SupabaseClient,
  invoiceId: string,
  deliveryMethod: string | null,
): Promise<InvoiceRecord | null> {
  return unwrap<InvoiceRecord | null>(client.rpc('set_invoice_delivery_method', {
    p_invoice_id: invoiceId,
    p_delivery_method: deliveryMethod,
  }));
}

export async function setInvoiceDeliveryDetails(
  client: SupabaseClient,
  input: {
    invoiceId: string;
    deliveryMethod: string | null;
    pickupBranchId?: string | null;
    deliveryDetails?: string | null;
    postCod?: boolean;
  },
): Promise<InvoiceRecord | null> {
  return unwrap<InvoiceRecord | null>(client.rpc('set_invoice_delivery_details', {
    p_invoice_id: input.invoiceId,
    p_delivery_method: input.deliveryMethod,
    p_pickup_branch_id: input.pickupBranchId || null,
    p_delivery_details: input.deliveryDetails || null,
    p_post_cod: Boolean(input.postCod),
  }));
}

export async function setInvoiceProductPictures(
  client: SupabaseClient,
  invoiceId: string,
  showProductPictures: boolean,
): Promise<InvoiceRecord | null> {
  return unwrap<InvoiceRecord | null>(client.rpc('set_invoice_product_pictures', {
    p_invoice_id: invoiceId,
    p_show_product_pictures: showProductPictures,
  }));
}

/**
 * The single POS command used by Web and Mobile. Non-stock sales use the
 * terminal/shift-aware transactional POS RPC. Stock-tracked sales use the
 * inventory checkout RPC and then the same customer-payment repository, so a
 * stock deduction, invoice, posting, and payment cannot be implemented twice
 * in the clients.
 */
export async function completePosSale(client: SupabaseClient, input: PosSaleInput): Promise<PosSaleResult> {
  if (!input.userId || !input.companyId || !input.idempotencyKey) throw new Error('POS company, user, and idempotency key are required.');
  if (!input.lines.length) throw new Error('At least one POS item is required.');

  let terminalId = input.terminalId || null;
  const productIds = input.lines.map((line) => line.productId);
  const products = await unwrap<Row[]>(client.from('products')
    .select('id,name,unit,sku,barcode,unit_price,tax_rate,tax_included,track_stock')
    .eq('company_id', input.companyId)
    .in('id', productIds));
  const productById = new Map(products.map((product) => [String(product.id), product]));
  if (productById.size !== new Set(productIds).size) throw new Error('One or more POS products are not available in this company.');
  const hasTrackedStock = products.some((product) => Boolean(product.track_stock));

  if (!hasTrackedStock) {
    if (!terminalId) {
      const terminals = await unwrap<Row[]>(client.from('pos_terminals').select('id').eq('company_id', input.companyId).eq('status', 'active').order('created_at'));
      if (terminals.length !== 1) throw new Error(terminals.length ? 'Select a POS terminal before completing a sale.' : 'An active POS terminal is required before completing a sale.');
      terminalId = String(terminals[0].id);
    }
    const discounts = effectivePosDiscounts(input, productById);
    const total = calculateInvoice({
      lines: input.lines.map((line, index) => {
        const product = productById.get(line.productId)!;
        return {
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountPercent: discounts[index],
          taxRate: Number(product.tax_rate) || 0,
          taxIncluded: Boolean(product.tax_included),
        };
      }),
      currency: input.currency,
    }).total;
    const completion = await unwrap<unknown>(client.rpc('complete_pos_sale_with_signature', {
      p_company_id: input.companyId,
      p_terminal_id: terminalId,
      p_customer_id: input.customerId || null,
      p_items: input.lines.map((line, index) => ({
        product_id: line.productId,
        quantity: line.quantity,
        unit_price: line.unitPrice,
        discount_percent: discounts[index],
      })),
      p_payments: [{
        method: input.payment,
        amount: total,
        tendered_amount: input.payment === 'cash' ? Number(input.cashReceived || 0) : total,
        reference: null,
        settlement_account_id: null,
      }],
      p_invoice_type: 'invoice',
      p_notes: input.notes || null,
      p_idempotency_key: input.idempotencyKey,
      p_occurred_at: new Date().toISOString(),
      p_customer_signature: input.customerSignature || { requested: false },
    }));
    const result = (Array.isArray(completion) ? completion[0] : completion) as Row | null;
    if (!result?.invoice_id || !result.invoice_number) throw new Error('The POS completion command returned no invoice.');
    return {
      invoiceId: String(result.invoice_id),
      invoiceNumber: String(result.invoice_number),
      orderId: result.order_id ? String(result.order_id) : undefined,
      totalAmount: Number(result.total_amount || total),
      changeAmount: Number(result.change_amount || 0),
      idempotent: Boolean(result.idempotent),
    };
  }

  // The shared stock checkout RPC is the inventory-safe path. It receives the
  // same canonical invoice representation as the ordinary invoice writer.
  let customerId = input.customerId || null;
  if (!customerId) {
    customerId = String(await unwrap<unknown>(client.rpc('ensure_walk_in_customer', { p_company_id: input.companyId })));
  }
  const productLines = input.lines.map((line) => {
    const product = productById.get(line.productId)!;
    return {
      productId: line.productId,
      description: String(line.description || product.name || ''),
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxRate: Number(product.tax_rate) || 0,
      discountPercent: line.discountPercent || 0,
      unit: String(line.unit || product.unit || 'pcs'),
      sku: line.sku || (typeof product.sku === 'string' ? product.sku : null) || (typeof product.barcode === 'string' ? product.barcode : null),
      taxIncluded: Boolean(product.tax_included),
    };
  });
  const persistencePaymentMethod = input.payment === 'cash' ? 'cash' : input.payment === 'card' ? 'card' : 'bank';
  const draft: InvoiceDraftInput = {
    userId: input.userId,
    companyId: input.companyId,
    branchId: input.branchId || null,
    clientId: customerId,
    invoiceNumber: null,
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date().toISOString().slice(0, 10),
    documentType: 'INVOICE',
    status: 'draft',
    commercialStatus: 'DRAFT',
    paymentMethod: persistencePaymentMethod,
    amountReceived: input.payment === 'cash' ? Number(input.cashReceived || 0) : input.payment === 'customer_credit' ? 0 : undefined,
    notes: input.notes || null,
    currency: input.currency || 'EUR',
    documentDiscountPercent: input.documentDiscountPercent,
    documentDiscountAmount: input.documentDiscountAmount,
    customerSignatureRequested: Boolean(input.customerSignature?.requested),
    buyerSignatureUrl: input.customerSignature?.signatureUrl || null,
    customerSignatureStatus: input.customerSignature?.signatureUrl ? 'signed' : 'pending',
    customerSignatureName: input.customerSignature?.name || null,
    customerSignedAt: input.customerSignature?.signedAt || null,
    idempotencyKey: input.idempotencyKey,
    lines: productLines,
  };
  const saved = await saveInvoiceDocument(client, {
    draft,
    postInvoice: true,
    stockCheckout: true,
    idempotencyKey: input.idempotencyKey,
  });
  let paymentAllocationError: PostgrestError | null = null;
  if (input.payment !== 'customer_credit') {
    const amount = Number(saved.invoice.total_amount || saved.totals.total);
    const payment = await saveCustomerPayment(client, {
      userId: input.userId,
      companyId: input.companyId,
      customerId,
      invoiceId: saved.invoice.id,
      amount,
      paymentDate: draft.issueDate,
      paymentMethod: persistencePaymentMethod,
      notes: input.notes || null,
      currency: draft.currency,
      idempotencyKey: input.idempotencyKey,
    });
    paymentAllocationError = payment.allocationError || null;
  }
  return {
    invoiceId: saved.invoice.id,
    invoiceNumber: String(saved.invoice.invoice_number),
    totalAmount: Number(saved.invoice.total_amount || saved.totals.total),
    changeAmount: saved.totals.change,
    paymentAllocationError,
  };
}

export async function getInvoice(
  client: SupabaseClient,
  invoiceId: string,
  scope?: { userId: string; companyIds: readonly string[] },
  select = '*, client:clients(*), items:invoice_items(*)',
) {
  let request = client.from('invoices').select(select).eq('id', invoiceId);
  if (scope) request = request.or(scopedResource(scope.userId, scope.companyIds));
  return unwrap<InvoiceRecord | null>(request.maybeSingle());
}

export async function getInvoiceByNumber(
  client: SupabaseClient,
  invoiceNumber: string,
  scope?: { userId: string; companyIds: readonly string[] },
) {
  let request = client.from('invoices').select('*, client:clients(*), items:invoice_items(*, product:products(image_url))').eq('invoice_number', invoiceNumber);
  if (scope) request = request.or(scopedResource(scope.userId, scope.companyIds));
  return unwrap<InvoiceRecord | null>(request.maybeSingle());
}

export async function listInvoicePayments(
  client: SupabaseClient,
  scope: { userId: string; companyIds: readonly string[] },
  invoiceId: string,
  options?: { limit?: number },
) {
  const paymentSelect = 'id,payment_number,amount,payment_date,payment_method,bank_reference,created_at';
  const queryLimit = options?.limit ? options.limit + 1 : undefined;
  let directQuery = client.from('payments')
    .select(paymentSelect)
    .eq('invoice_id', invoiceId)
    .or(scopedResource(scope.userId, scope.companyIds))
    .order('payment_date', { ascending: false });
  if (queryLimit) directQuery = directQuery.limit(queryLimit);
  let allocationQuery = client.from('payment_allocations')
    .select('payment_id,allocated_amount,allocation_date')
    .eq('invoice_id', invoiceId)
    .eq('status', 'active')
    .in('company_id', scope.companyIds)
    .order('allocation_date', { ascending: false });
  if (queryLimit) allocationQuery = allocationQuery.limit(queryLimit);
  const [directPayments, allocationRows] = await Promise.all([
    unwrap<Row[]>(directQuery),
    unwrap<Array<{ payment_id: string; allocated_amount: number | string; allocation_date: string }>>(allocationQuery),
  ]);

  const allocationPaymentIds = [...new Set(allocationRows.map((row) => String(row.payment_id)))];
  if (!allocationPaymentIds.length) return options?.limit ? directPayments.slice(0, options.limit + 1) : directPayments;

  const allocationPayments = await unwrap<Row[]>(client.from('payments')
    .select(paymentSelect)
    .in('id', allocationPaymentIds)
    .or(scopedResource(scope.userId, scope.companyIds)));
  const paymentById = new Map(allocationPayments.map((payment) => [String(payment.id), payment]));
  const allocatedPayments: Row[] = allocationRows.flatMap((allocation): Row[] => {
    const payment = paymentById.get(String(allocation.payment_id));
    if (!payment) return [];
    return [{
      ...payment,
      amount: allocation.allocated_amount,
      payment_date: allocation.allocation_date || payment.payment_date,
      allocation_amount: allocation.allocated_amount,
    }];
  });
  const directPaymentIds = new Set(allocationPaymentIds);
  const rows = [...allocatedPayments, ...directPayments.filter((payment) => !directPaymentIds.has(String(payment.id)))].sort((left, right) =>
    String(right.payment_date || right.created_at || '').localeCompare(String(left.payment_date || left.created_at || '')),
  );
  return options?.limit ? rows.slice(0, options.limit + 1) : rows;
}

export async function listCustomerPayments(
  client: SupabaseClient,
  scope: { userId: string; companyIds: readonly string[] },
  customerId: string,
  options?: { limit?: number },
) {
  const queryLimit = options?.limit ? options.limit + 1 : undefined;
  let directQuery = client.from('payments')
    .select('id,payment_number,amount,payment_date,created_at,payment_method,bank_reference,notes,invoice_id')
    .eq('client_id', customerId)
    .or(scopedResource(scope.userId, scope.companyIds))
    .order('payment_date', { ascending: false });
  if (queryLimit) directQuery = directQuery.limit(queryLimit);
  const [directPayments, customerInvoices] = await Promise.all([
    unwrap<Row[]>(directQuery),
    listCustomerInvoices(client, scope, customerId),
  ]);
  const invoiceIds = customerInvoices.map((invoice) => String(invoice.id));
  if (!invoiceIds.length) return options?.limit ? directPayments.slice(0, options.limit + 1) : directPayments.slice(0, 50);

  let allocationQuery = client.from('payment_allocations')
    .select('payment_id,invoice_id,allocated_amount,allocation_date')
    .in('invoice_id', invoiceIds)
    .eq('status', 'active')
    .in('company_id', scope.companyIds)
    .order('allocation_date', { ascending: false });
  if (queryLimit) allocationQuery = allocationQuery.limit(queryLimit);
  const allocationRows = await unwrap<Array<{ payment_id: string; invoice_id: string; allocated_amount: number | string; allocation_date: string }>>(allocationQuery);
  const allocationPaymentIds = [...new Set(allocationRows.map((row) => String(row.payment_id)))];
  if (!allocationPaymentIds.length) return options?.limit ? directPayments.slice(0, options.limit + 1) : directPayments.slice(0, 50);

  const allocationPayments = await unwrap<Row[]>(client.from('payments')
    .select('id,payment_number,amount,payment_date,created_at,payment_method,bank_reference,notes,invoice_id')
    .in('id', allocationPaymentIds)
    .or(scopedResource(scope.userId, scope.companyIds)));
  const paymentById = new Map(allocationPayments.map((payment) => [String(payment.id), payment]));
  const invoiceNumberById = new Map(customerInvoices.map((invoice) => [String(invoice.id), invoice.invoice_number]));
  const allocatedPayments: Row[] = allocationRows.flatMap((allocation): Row[] => {
    const payment = paymentById.get(String(allocation.payment_id));
    if (!payment) return [];
    return [{
      ...payment,
      amount: allocation.allocated_amount,
      invoice_id: allocation.invoice_id,
      invoice_number: invoiceNumberById.get(String(allocation.invoice_id)) || null,
      payment_date: allocation.allocation_date || payment.payment_date,
      allocation_amount: allocation.allocated_amount,
    }];
  });
  const allocatedPaymentIds = new Set(allocationPaymentIds);
  const rows = [...allocatedPayments, ...directPayments.filter((payment) => !allocatedPaymentIds.has(String(payment.id)))]
    .sort((left, right) => String(right.payment_date || right.created_at || '').localeCompare(String(left.payment_date || left.created_at || '')))
  return options?.limit ? rows.slice(0, options.limit + 1) : rows.slice(0, 50);
}

export async function listCustomerInvoices(
  client: SupabaseClient,
  scope: { userId: string; companyIds: readonly string[] },
  customerId: string,
) {
  return unwrap<Row[]>(client.from('invoices')
    .select('id,invoice_number,issue_date,status,type,subtype,commercial_document_type,commercial_status,total_amount,payment_method,notes,created_at')
    .eq('client_id', customerId)
    .or(scopedResource(scope.userId, scope.companyIds))
    .order('issue_date', { ascending: true }));
}

export async function listInvoices(
  client: SupabaseClient,
  scope: { userId: string; companyIds: readonly string[] },
  options?: { select?: string; documentType?: InvoiceDraftInput['documentType']; legacyType?: string; clientId?: string; limit?: number },
) {
  let request = client.from('invoices')
    .select(options?.select || '*, client:clients(name), items:invoice_items(id)')
    .or(scopedResource(scope.userId, scope.companyIds))
    .order('created_at', { ascending: false });
  if (options?.clientId) request = request.eq('client_id', options.clientId);
  if (options?.documentType && options.legacyType) request = request.or(`commercial_document_type.eq.${options.documentType},type.eq.${options.legacyType}`);
  else if (options?.documentType) request = request.eq('commercial_document_type', options.documentType);
  else if (options?.legacyType) request = request.eq('type', options.legacyType);
  if (options?.limit) request = request.limit(options.limit);
  return unwrap<InvoiceRecord[]>(request);
}

/**
 * Repairs issued invoices created before ledger posting was wired into the
 * invoice save flow. The server excludes genuine drafts and is idempotent.
 */
export async function repairUnpostedSalesInvoices(client: SupabaseClient, companyIds: readonly string[]) {
  const results = await Promise.all(companyIds.map(async (companyId) => {
    return unwrap<Record<string, unknown>>(client.rpc('repair_unposted_sales_invoices', {
      p_company_id: companyId,
    }));
  }));
  return results;
}

export async function repairUnpostedCustomerPayments(client: SupabaseClient, companyIds: readonly string[]) {
  const results = await Promise.all(companyIds.map(async (companyId) => {
    return unwrap<Record<string, unknown>>(client.rpc('repair_unposted_customer_payments', {
      p_company_id: companyId,
    }));
  }));
  return results;
}

export async function repairUnpostedExpenses(client: SupabaseClient, companyIds: readonly string[]) {
  const results = await Promise.all(companyIds.map(async (companyId) => {
    return unwrap<Record<string, unknown>>(client.rpc('repair_unposted_expenses', {
      p_company_id: companyId,
    }));
  }));
  return results;
}

export interface SalesBookPeriodRow extends Record<string, unknown> {
  id: string;
  company_id: string;
  period_start: string;
  period_end: string;
  reporting_frequency: string;
  status: 'OPEN' | 'READY_FOR_DECLARATION' | 'DECLARED' | 'AMENDED';
  declaration_deadline: string;
  transaction_count: number;
  taxable_amount: number;
  vat_amount: number;
  total_amount: number;
}

export async function ensureSalesBookPeriod(client: SupabaseClient, companyId: string, asOfDate?: string) {
  return unwrap<SalesBookPeriodRow | null>(client.rpc('ensure_sales_book_period', {
    p_company_id: companyId,
    p_as_of_date: asOfDate || null,
  }));
}

export async function listSalesBookPeriods(client: SupabaseClient, companyIds: readonly string[]) {
  if (!companyIds.length) return [] as SalesBookPeriodRow[];
  return unwrap<SalesBookPeriodRow[]>(client
    .from('kosovo_sales_book_period_summary')
    .select('*')
    .in('company_id', companyIds)
    .order('period_start', { ascending: false }));
}

export async function listSalesBookTransactions(client: SupabaseClient, companyIds: readonly string[], periodId: string) {
  if (!companyIds.length) return [] as Row[];
  return unwrap<Row[]>(client
    .from('kosovo_sales_book')
    .select('*')
    .in('company_id', companyIds)
    .eq('sales_book_period_id', periodId)
    .order('invoice_date', { ascending: false })
    .order('invoice_number'));
}

export async function markSalesBookDeclared(client: SupabaseClient, periodId: string, reason?: string) {
  return unwrap<SalesBookPeriodRow>(client.rpc('mark_sales_book_declared', {
    p_period_id: periodId,
    p_confirmation: true,
    p_reason: reason || null,
  }));
}

export async function createSalesBookAmendment(client: SupabaseClient, periodId: string, invoiceId: string | null, reason: string) {
  return unwrap<Row>(client.rpc('create_sales_book_amendment', {
    p_period_id: periodId,
    p_invoice_id: invoiceId,
    p_reason: reason,
  }));
}

export async function applySalesBookAmendment(
  client: SupabaseClient,
  amendmentId: string,
  invoice: Record<string, unknown>,
  items: readonly Record<string, unknown>[],
  idempotencyKey?: string | null,
) {
  return unwrap<Row>(client.rpc('apply_sales_book_amendment', {
    p_amendment_id: amendmentId,
    p_invoice: invoice,
    p_items: items,
    p_idempotency_key: idempotencyKey || null,
  }));
}

export async function deleteInvoice(client: SupabaseClient, invoiceId: string) {
  await unwrap<unknown>(client.rpc('delete_invoice', { p_invoice_id: invoiceId }));
}

export function transitionInvoiceStatus(client: SupabaseClient, invoiceId: string, status: string, eventType: string) {
  return client.rpc('transition_commercial_document', {
    p_document_id: invoiceId,
    p_status: status,
    p_event_type: eventType,
  });
}

export async function listCustomers(client: SupabaseClient, scope: { userId: string; companyIds: readonly string[] }) {
  return unwrap<Row[]>(client.from('clients').select('*').or(scopedResource(scope.userId, scope.companyIds)).order('name'));
}

export async function getCustomer(client: SupabaseClient, customerId: string, scope: { userId: string; companyIds: readonly string[] }) {
  return unwrap<Row | null>(client.from('clients').select('*').eq('id', customerId).or(scopedResource(scope.userId, scope.companyIds)).maybeSingle());
}

export async function saveCustomer(client: SupabaseClient, input: Row & { user_id: string; company_id: string | null }, existingId?: string | null) {
  const request = existingId
    ? client.from('clients').update(input).eq('id', existingId).or(ownedRowScope(input.user_id, input.company_id)).select().single()
    : client.from('clients').insert(input).select().single();
  return unwrap<Row>(request);
}

export async function deleteCustomer(client: SupabaseClient, customerId: string, companyId: string | null, userId?: string) {
  let request = client.from('clients').delete().eq('id', customerId);
  request = userId ? request.or(ownedRowScope(userId, companyId || null)) : request.eq('company_id', companyId);
  await unwrap<unknown>(request);
}

export async function listProducts(client: SupabaseClient, scope: { userId: string; companyIds: readonly string[] }) {
  return unwrap<Row[]>(client.from('products').select('*').or(scopedResource(scope.userId, scope.companyIds)).order('name'));
}

export async function getProduct(client: SupabaseClient, productId: string, scope: { userId: string; companyIds: readonly string[] }) {
  return unwrap<Row | null>(client.from('products').select('*').eq('id', productId).or(scopedResource(scope.userId, scope.companyIds)).maybeSingle());
}

export async function saveProduct(client: SupabaseClient, input: Row & { user_id: string; company_id: string | null }, existingId?: string | null) {
  const request = existingId
    ? client.from('products').update(input).eq('id', existingId).or(ownedRowScope(input.user_id, input.company_id)).select().single()
    : client.from('products').insert(input).select().single();
  return unwrap<Row>(request);
}

export async function deleteProduct(client: SupabaseClient, productId: string, companyId: string, userId?: string) {
  void userId;
  if (!companyId.trim()) throw new Error('A company is required to delete a product.');
  const { error } = await client.rpc('delete_product', {
    p_product_id: productId,
    p_company_id: companyId,
  });
  if (error) throw error;
}

export interface SaveExpenseOptions {
  postExpense?: boolean;
  correctPostedExpense?: boolean;
  idempotencyKey?: string | null;
}

export interface SaveCompanyBankAccountInput {
  company_id: string;
  bank_name: string;
  account_name?: string | null;
  account_number?: string | null;
  iban?: string | null;
  swift_bic?: string | null;
  currency?: string;
  is_primary?: boolean;
  created_by?: string | null;
  updated_by?: string | null;
}

export async function listCompanyBankAccounts(client: SupabaseClient, companyId: string) {
  return unwrap<Row[]>(client.from('operix_accessible_company_bank_accounts')
    .select('id,company_id,owner_company_id,available_company_id,bank_name,account_name,account_number,iban,swift_bic,currency,is_primary,is_active,created_at,account_id,is_shared')
    .eq('available_company_id', companyId)
    .eq('is_active', true)
    .order('is_primary', { ascending: false })
    .order('bank_name'));
}

export async function listCompanyAgents(client: SupabaseClient, companyId: string): Promise<CompanyAgent[]> {
  return unwrap<CompanyAgent[]>(client.rpc('list_company_agents', { p_company_id: companyId }));
}

export async function listCompanyBankAccountShares(client: SupabaseClient, bankAccountId: string): Promise<CompanyBankAccountShare[]> {
  return unwrap<CompanyBankAccountShare[]>(client.from('company_bank_account_shares')
    .select('id,company_bank_account_id,shared_company_id,is_active,created_at')
    .eq('company_bank_account_id', bankAccountId)
    .eq('is_active', true));
}

export async function shareCompanyBankAccount(client: SupabaseClient, bankAccountId: string, sharedCompanyId: string) {
  return unwrap<Row>(client.rpc('share_company_bank_account', {
    p_company_bank_account_id: bankAccountId,
    p_shared_company_id: sharedCompanyId,
  }));
}

export async function revokeCompanyBankAccountShare(client: SupabaseClient, bankAccountId: string, sharedCompanyId: string) {
  return unwrap<Row>(client.rpc('revoke_company_bank_account_share', {
    p_company_bank_account_id: bankAccountId,
    p_shared_company_id: sharedCompanyId,
  }));
}

export async function saveCompanyBankAccount(
  client: SupabaseClient,
  input: SaveCompanyBankAccountInput,
  existingId?: string | null,
) {
  const payload = {
    ...input,
    bank_name: input.bank_name.trim(),
    account_name: input.account_name?.trim() || null,
    account_number: input.account_number?.trim() || null,
    iban: input.iban?.trim() || null,
    swift_bic: input.swift_bic?.trim() || null,
    currency: (input.currency || 'EUR').trim().toUpperCase(),
  };
  const request = existingId
    ? client.from('company_bank_accounts').update(payload).eq('id', existingId).eq('company_id', input.company_id).select().single()
    : client.from('company_bank_accounts').insert(payload).select().single();
  return unwrap<Row>(request);
}

export async function deactivateCompanyBankAccount(client: SupabaseClient, bankAccountId: string, companyId: string) {
  return unwrap<Row>(client.from('company_bank_accounts')
    .update({ is_active: false, is_primary: false })
    .eq('id', bankAccountId)
    .eq('company_id', companyId)
    .select()
    .single());
}

export async function listFundBalances(client: SupabaseClient, companyIds: string | readonly string[]): Promise<FundBalance[]> {
  const ids = Array.isArray(companyIds) ? companyIds : [companyIds];
  if (ids.length === 0) return [];
  const rows = await unwrap<FundBalance[]>(client.from('operix_fund_balances')
    .select('id,company_id,owner_company_id,fund_type,company_bank_account_id,stripe_store_id,name,currency,opening_balance,transaction_total,balance,pending_balance,available_balance,provider_available_balance,provider_pending_balance,provider_balance_as_of,is_active,is_shared')
    .in('company_id', ids)
    .eq('is_active', true)
    .order('fund_type')
    .order('name'));
  // Keep one projection per company so the parent can show which tenant owns
  // or uses each account. Consumers should deduplicate by fund id only when
  // calculating a physical total.
  return rows;
}

export async function setFundOpeningBalance(
  client: SupabaseClient,
  fundAccountId: string,
  amount: number | string,
  reason?: string | null,
) {
  return unwrap<Row>(client.rpc('set_fund_opening_balance', {
    p_fund_account_id: fundAccountId,
    p_amount: Number(amount),
    p_reason: reason || null,
  }));
}

export async function createFundTransfer(
  client: SupabaseClient,
  input: {
    sourceFundAccountId: string;
    targetFundAccountId: string;
    amount: number | string;
    transferDate: string;
    description?: string | null;
    idempotencyKey?: string | null;
  },
): Promise<FundTransfer> {
  return unwrap<FundTransfer>(client.rpc('create_fund_transfer', {
    p_source_fund_account_id: input.sourceFundAccountId,
    p_target_fund_account_id: input.targetFundAccountId,
    p_amount: Number(input.amount),
    p_transfer_date: input.transferDate,
    p_description: input.description || null,
    p_idempotency_key: input.idempotencyKey || generatedIdempotencyKey(),
  }));
}

export async function createAgentSettlement(
  client: SupabaseClient,
  input: {
    companyId: string;
    agentUserId: string;
    fundAccountId: string;
    amount: number | string;
    settlementDate: string;
    description?: string | null;
    idempotencyKey?: string | null;
  },
): Promise<AgentSettlement> {
  return unwrap<AgentSettlement>(client.rpc('create_agent_settlement', {
    p_company_id: input.companyId,
    p_agent_user_id: input.agentUserId,
    p_fund_account_id: input.fundAccountId,
    p_amount: Number(input.amount),
    p_settlement_date: input.settlementDate,
    p_description: input.description || null,
    p_idempotency_key: input.idempotencyKey || generatedIdempotencyKey(),
  }));
}

export async function createAgentAdvance(
  client: SupabaseClient,
  input: {
    companyId: string;
    agentUserId: string;
    fundAccountId: string;
    amount: number | string;
    advanceDate: string;
    description?: string | null;
    idempotencyKey?: string | null;
  },
): Promise<AgentAdvance> {
  return unwrap<AgentAdvance>(client.rpc('create_agent_advance', {
    p_company_id: input.companyId,
    p_agent_user_id: input.agentUserId,
    p_fund_account_id: input.fundAccountId,
    p_amount: Number(input.amount),
    p_advance_date: input.advanceDate,
    p_description: input.description || null,
    p_idempotency_key: input.idempotencyKey || generatedIdempotencyKey(),
  }));
}


export async function createPostCodSettlement(
  client: SupabaseClient,
  input: {
    companyId: string;
    fundAccountId: string;
    amount: number | string;
    settlementDate: string;
    description?: string | null;
    idempotencyKey?: string | null;
  },
): Promise<PostCodSettlement> {
  return unwrap<PostCodSettlement>(client.rpc('create_post_cod_settlement', {
    p_company_id: input.companyId,
    p_fund_account_id: input.fundAccountId,
    p_amount: Number(input.amount),
    p_settlement_date: input.settlementDate,
    p_description: input.description || null,
    p_idempotency_key: input.idempotencyKey || generatedIdempotencyKey(),
  }));
}

export async function createStripePayoutSettlement(
  client: SupabaseClient,
  input: {
    companyId: string;
    stripeFundAccountId: string;
    bankFundAccountId: string;
    payoutAmount: number | string;
    bankFee?: number | string;
    settlementDate: string;
    description?: string | null;
    idempotencyKey?: string | null;
  },
): Promise<StripePayoutSettlement> {
  return unwrap<StripePayoutSettlement>(client.rpc('create_stripe_payout_settlement', {
    p_company_id: input.companyId,
    p_stripe_fund_account_id: input.stripeFundAccountId,
    p_bank_fund_account_id: input.bankFundAccountId,
    p_payout_amount: Number(input.payoutAmount),
    p_bank_fee: Number(input.bankFee || 0),
    p_settlement_date: input.settlementDate,
    p_description: input.description || null,
    p_idempotency_key: input.idempotencyKey || generatedIdempotencyKey(),
  }));
}

export async function listExpenses(client: SupabaseClient, scope: { userId: string; companyIds: readonly string[] }) {
  return unwrap<Row[]>(client.from('expenses').select('*').or(scopedResource(scope.userId, scope.companyIds)).order('date', { ascending: false }));
}

export async function getExpense(client: SupabaseClient, expenseId: string, scope: { userId: string; companyIds: readonly string[] }) {
  return unwrap<Row | null>(client.from('expenses').select('*').eq('id', expenseId).or(scopedResource(scope.userId, scope.companyIds)).maybeSingle());
}

export async function saveExpense(
  client: SupabaseClient,
  input: Row & { user_id: string; company_id: string | null },
  existingId?: string | null,
  options: SaveExpenseOptions = {},
) {
  if (existingId && options.correctPostedExpense) {
    const correctionParams = {
      p_expense_id: existingId,
      p_amount: Number(input.amount),
      p_category: input.category == null ? null : String(input.category),
      p_description: input.description == null ? null : String(input.description),
      p_date: input.date == null ? null : String(input.date),
      p_receipt_url: input.receipt_url == null ? null : String(input.receipt_url),
      p_type: input.type == null ? 'expense' : String(input.type),
      p_payment_method: input.payment_method == null ? 'bank' : String(input.payment_method),
      p_vendor_name: input.vendor_name == null ? null : String(input.vendor_name),
      p_invoice_number: input.invoice_number == null ? null : String(input.invoice_number),
      p_bank_reference: input.bank_reference == null ? null : String(input.bank_reference),
      p_notes: input.notes == null ? null : String(input.notes),
      p_company_bank_account_id: input.company_bank_account_id == null ? null : String(input.company_bank_account_id),
      p_correction_id: options.idempotencyKey || generatedIdempotencyKey(),
      p_reason: 'Expense edited',
    };
    const hasVatDetails = 'vat_rate' in input || 'tax_amount' in input || 'article' in input || 'vendor_id' in input;
    if (hasVatDetails) {
      return unwrap<Row>(client.rpc('correct_expense_with_vat', {
        ...correctionParams,
        p_article: input.article == null ? null : String(input.article),
        p_vendor_id: input.vendor_id == null ? null : String(input.vendor_id),
        p_vat_rate: Number(input.vat_rate || 0),
        p_tax_amount: Number(input.tax_amount || 0),
        p_tax_recoverable_amount: Number(input.tax_recoverable_amount ?? input.tax_amount ?? 0),
      }));
    }
    return unwrap<Row>(client.rpc('correct_expense', correctionParams));
  }

  const request = existingId
    ? client.from('expenses').update(input).eq('id', existingId).or(ownedRowScope(input.user_id, input.company_id)).select().single()
    : client.from('expenses').insert(input).select().single();
  const saved = await unwrap<Row>(request);
  if (!existingId && options.postExpense && saved.id) {
    return unwrap<Row>(client.rpc('post_expense', {
      p_expense_id: saved.id,
      p_idempotency_key: options.idempotencyKey || generatedIdempotencyKey(),
      p_reason: 'Expense recorded',
    }));
  }
  return saved;
}

export async function deleteExpense(client: SupabaseClient, expenseId: string, companyId: string, userId?: string) {
  if (!userId) throw new Error('An authenticated user is required to delete an expense.');
  const existing = await getExpense(client, expenseId, { userId, companyIds: [companyId] });
  if (!existing || String(existing.company_id || '') !== companyId) {
    throw new Error('The expense is not available in this workspace.');
  }
  await unwrap<unknown>(client.rpc('delete_expense', { p_expense_id: expenseId }));
}

/** Records through the existing supplier-payment journal, then allocates the
 * posted payment to an expense. This is deliberately not a second payment
 * engine. */
export async function recordExpensePayment(
  client: SupabaseClient,
  input: { companyId: string; supplierId: string; expenseId: string; paymentDate: string; amount: string | number; paymentMethod: string; settlementAccountId: string; reference?: string | null; notes?: string | null; bankAccountId?: string | null },
) {
  const amount = String(input.amount);
  const payment = await unwrap<Row>(input.bankAccountId
    ? client.rpc('record_supplier_payment_with_bank_account', {
      p_company_id: input.companyId, p_supplier_id: input.supplierId, p_payment_date: input.paymentDate, p_amount: amount,
      p_payment_method: input.paymentMethod, p_settlement_account_id: input.settlementAccountId, p_reference: input.reference || null,
      p_notes: input.notes || null, p_branch_id: null, p_currency: 'EUR', p_idempotency_key: generatedIdempotencyKey(), p_company_bank_account_id: input.bankAccountId,
    })
    : client.rpc('record_supplier_payment', {
      p_company_id: input.companyId, p_supplier_id: input.supplierId, p_payment_date: input.paymentDate, p_amount: amount,
      p_payment_method: input.paymentMethod, p_settlement_account_id: input.settlementAccountId, p_reference: input.reference || null,
      p_notes: input.notes || null, p_branch_id: null, p_currency: 'EUR', p_idempotency_key: generatedIdempotencyKey(),
    }));
  const allocation = await unwrap<Row>(client.rpc('allocate_expense_payment', { p_expense_id: input.expenseId, p_vendor_payment_id: payment.id, p_amount: amount, p_allocation_date: input.paymentDate }));
  return { payment, allocation };
}

export async function listExpenseAttachments(client: SupabaseClient, expenseId: string, companyIds: readonly string[]) {
  return unwrap<Row[]>(client.from('financial_document_attachments').select('*').eq('document_type', 'expense').eq('document_id', expenseId).in('company_id', companyIds).is('deleted_at', null).order('uploaded_at', { ascending: false }));
}

export async function createExpenseAttachmentUrl(client: SupabaseClient, attachment: { storage_bucket: string; storage_path: string }, expiresIn = 600) {
  const result = await client.storage.from(attachment.storage_bucket).createSignedUrl(attachment.storage_path, expiresIn);
  if (result.error) throw result.error;
  return result.data.signedUrl;
}

export async function listPayments(
  client: SupabaseClient,
  scope: { userId: string; companyIds: readonly string[] },
  options?: { limit?: number; customerId?: string; invoiceId?: string; externalReference?: string; createdBefore?: string; createdAfter?: string },
) {
  let request = client.from('payments').select('*, client:clients(*), invoice:invoices(*)')
    .or(scopedResource(scope.userId, scope.companyIds))
    .neq('accounting_state', 'reversed')
    .order(options?.limit ? 'created_at' : 'payment_date', { ascending: false });
  if (options?.limit) request = request.limit(options.limit + 1);
  if (options?.customerId) request = request.eq('client_id', options.customerId);
  if (options?.invoiceId) request = request.eq('invoice_id', options.invoiceId);
  if (options?.externalReference) request = request.eq('bank_reference', options.externalReference);
  if (options?.createdBefore) request = request.lt('created_at', options.createdBefore);
  if (options?.createdAfter) request = request.gte('created_at', options.createdAfter);
  return unwrap<Row[]>(request);
}

export async function listFinancialAccountBalances(client: SupabaseClient, scope: { userId: string; companyIds: readonly string[] }) {
  return unwrap<Row[]>(client.from('operix_financial_account_balances').select('*').in('company_id', scope.companyIds).order('account_type').order('name'));
}

export async function listFinancialAccountTransactions(client: SupabaseClient, scope: { userId: string; companyIds: readonly string[] }, accountId?: string | null) {
  let request = client.from('operix_financial_account_transactions').select('*').in('company_id', scope.companyIds).order('transaction_date', { ascending: false }).order('created_at', { ascending: false });
  if (accountId) request = request.eq('fund_account_id', accountId);
  return unwrap<Row[]>(request);
}

export async function listOtherIncomeCategories(client: SupabaseClient, companyId?: string | null) {
  let request = client.from('other_income_categories').select('*').eq('active', true).order('name_en');
  if (companyId) request = request.or(`company_id.is.null,company_id.eq.${companyId}`);
  else request = request.is('company_id', null);
  return unwrap<Row[]>(request);
}

export interface OtherIncomeDraftInput {
  companyId: string;
  categoryId: string;
  incomeDate: string;
  payerSource?: string | null;
  description: string;
  currency?: string;
  netAmount: number | string;
  vatAmount?: number | string;
  taxTreatment?: string;
  paymentMethod: 'cash' | 'bank' | 'bank_transfer' | 'card' | 'online_payment' | 'cheque' | 'other';
  fundAccountId: string;
  reference?: string | null;
  notes?: string | null;
  attachmentId?: string | null;
  idempotencyKey?: string | null;
}

export async function listOtherIncome(client: SupabaseClient, scope: { userId: string; companyIds: readonly string[] }) {
  return unwrap<Row[]>(client.from('other_income').select('*, category:other_income_categories(*)').in('company_id', scope.companyIds).order('income_date', { ascending: false }));
}

export async function saveOtherIncome(client: SupabaseClient, input: OtherIncomeDraftInput) {
  const netAmount = Number(input.netAmount);
  const vatAmount = Number(input.vatAmount || 0);
  if (!Number.isFinite(netAmount) || netAmount <= 0) throw new Error('Other income net amount must be greater than zero.');
  if (!Number.isFinite(vatAmount) || vatAmount < 0) throw new Error('Other income VAT amount must be zero or greater.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.incomeDate)) throw new Error('Income date must be an ISO date.');
  if (!input.description.trim()) throw new Error('Other income description is required.');
  return unwrap<Row>(client.rpc('record_other_income', {
    p_company_id: input.companyId,
    p_category_id: input.categoryId,
    p_income_date: input.incomeDate,
    p_payer_source: input.payerSource || null,
    p_description: input.description.trim(),
    p_currency: (input.currency || 'EUR').toUpperCase(),
    p_net_amount: netAmount,
    p_vat_amount: vatAmount,
    p_tax_treatment: input.taxTreatment || 'review_required',
    p_payment_method: input.paymentMethod,
    p_fund_account_id: input.fundAccountId,
    p_reference: input.reference || null,
    p_notes: input.notes || null,
    p_attachment_id: input.attachmentId || null,
    p_idempotency_key: input.idempotencyKey || generatedIdempotencyKey(),
  }));
}

export async function getPayment(client: SupabaseClient, paymentId: string, scope: { userId: string; companyIds: readonly string[] }) {
  return unwrap<Row | null>(client.from('payments').select('*, client:clients(*), invoice:invoices(*)').eq('id', paymentId).or(scopedResource(scope.userId, scope.companyIds)).maybeSingle());
}

export async function listOpenCustomerInvoices(
  client: SupabaseClient,
  scope: { userId: string; companyIds: readonly string[] },
  customerId: string,
) {
  return unwrap<Row[]>(client.from('invoices')
    .select('*')
    .eq('client_id', customerId)
    .in('commercial_document_type', ['INVOICE', 'FINAL_INVOICE', 'ADVANCE_INVOICE'])
    .not('status', 'in', '(paid,cancelled,credited,reversed)')
    .or(scopedResource(scope.userId, scope.companyIds))
    .order('issue_date', { ascending: false }));
}

export async function saveCustomerPayment(client: SupabaseClient, input: PaymentDraftInput): Promise<SavedPayment> {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Payment amount must be greater than zero.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paymentDate)) throw new Error('Payment date must be an ISO date.');

  const settlementCode = input.paymentMethod === 'cash' ? '1010' : '1020';
  const selectedBankAccountId = ['bank', 'bank_transfer'].includes(input.paymentMethod) ? input.companyBankAccountId || null : null;
  if (['bank', 'bank_transfer'].includes(input.paymentMethod) && !selectedBankAccountId && !input.fundAccountId) {
    throw new Error('A bank account must be selected for a bank payment.');
  }
  let settlementAccount = await unwrap<Row | null>(client.from('chart_of_accounts').select('id').eq('company_id', input.companyId).eq('code', settlementCode).maybeSingle());
  if (selectedBankAccountId) {
    const bankAccount = await unwrap<Row | null>(client.from('operix_accessible_company_bank_accounts')
      .select('id,company_id,available_company_id,is_active,account_id')
      .eq('id', selectedBankAccountId)
      .eq('available_company_id', input.companyId)
      .eq('is_active', true)
      .maybeSingle());
    if (!bankAccount) throw new Error('The selected bank account is not available for this company.');
    if (bankAccount.account_id) {
      const mappedAccount = await unwrap<Row | null>(client.from('chart_of_accounts')
        .select('id')
        .eq('id', bankAccount.account_id)
        .eq('company_id', input.companyId)
        .eq('active', true)
        .eq('posting_allowed', true)
        .maybeSingle());
      if (mappedAccount?.id) settlementAccount = { id: mappedAccount.id };
    }
  }
  if (!settlementAccount?.id) throw new Error(`Settlement account ${settlementCode} is not configured.`);

  // New financial accounts support cash, bank, card-clearing, online-clearing,
  // cheque, and other receipts. The server command still delegates invoice
  // settlement to allocate_customer_payment, so revenue is not rewritten.
  if (input.fundAccountId && !input.existingPaymentId) {
    const payment = await unwrap<Row>(client.rpc('record_customer_payment_financial', {
      p_company_id: input.companyId,
      p_customer_id: input.customerId,
      p_payment_date: input.paymentDate,
      p_amount: amount,
      p_payment_method: input.paymentMethod,
      p_fund_account_id: input.fundAccountId,
      p_reference: input.bankReference || null,
      p_notes: input.notes || null,
      p_payer_name: input.payerName || null,
      p_currency: (input.currency || 'EUR').toUpperCase(),
      p_idempotency_key: input.idempotencyKey || generatedIdempotencyKey(),
      p_attachment_id: input.attachmentId || null,
    }));
    let allocation: Record<string, unknown> | null = null;
    let allocationError: PostgrestError | null = null;
    if (input.invoiceId && payment.id) {
      const existingAllocation = await unwrap<Record<string, unknown> | null>(client.from('payment_allocations')
        .select('*').eq('payment_id', payment.id).eq('invoice_id', input.invoiceId).eq('status', 'active').maybeSingle());
      if (existingAllocation) return { payment, allocation: existingAllocation, allocationError: null };
      const result = await client.rpc('allocate_customer_payment', {
        p_payment_id: payment.id,
        p_invoice_id: input.invoiceId,
        p_amount: amount,
        p_allocation_date: input.paymentDate,
      });
      allocationError = result.error;
      allocation = result.data as Record<string, unknown> | null;
    }
    return { payment, allocation, allocationError };
  }

  if (input.existingPaymentId) {
    const payment = await unwrap<Row>(client.rpc('update_customer_payment_with_bank_account', {
      p_payment_id: input.existingPaymentId,
      p_company_id: input.companyId,
      p_customer_id: input.customerId,
      p_invoice_id: input.invoiceId || null,
      p_payment_date: input.paymentDate,
      p_amount: amount,
      p_payment_method: input.paymentMethod,
      p_settlement_account_id: settlementAccount?.id,
      p_reference: input.bankReference || null,
      p_notes: input.notes || null,
      p_currency: (input.currency || 'EUR').toUpperCase(),
      p_idempotency_key: input.idempotencyKey || generatedIdempotencyKey(),
      p_reason: 'Customer payment edited',
      p_company_bank_account_id: selectedBankAccountId,
    }));
    return { payment };
  }

  const payment = await unwrap<Row>(selectedBankAccountId
    ? client.rpc('record_customer_payment_with_bank_account', {
      p_company_id: input.companyId,
      p_customer_id: input.customerId,
      p_payment_date: input.paymentDate,
      p_amount: amount,
      p_payment_method: input.paymentMethod,
      p_settlement_account_id: settlementAccount.id,
      p_reference: input.bankReference || null,
      p_notes: input.notes || null,
      p_branch_id: null,
      p_currency: (input.currency || 'EUR').toUpperCase(),
      p_idempotency_key: input.idempotencyKey || generatedIdempotencyKey(),
      p_company_bank_account_id: selectedBankAccountId,
    })
    : client.rpc('record_customer_payment', {
      p_company_id: input.companyId,
      p_customer_id: input.customerId,
      p_payment_date: input.paymentDate,
      p_amount: amount,
      p_payment_method: input.paymentMethod,
      p_settlement_account_id: settlementAccount.id,
      p_reference: input.bankReference || null,
      p_notes: input.notes || null,
      p_branch_id: null,
      p_currency: (input.currency || 'EUR').toUpperCase(),
      p_idempotency_key: input.idempotencyKey || generatedIdempotencyKey(),
    }));

  let allocation: Record<string, unknown> | null = null;
  let allocationError: PostgrestError | null = null;
  if (input.invoiceId && payment.id) {
    // A retry may receive the already-created payment from the idempotency
    // lookup above. Reusing its existing allocation keeps the operation
    // idempotent instead of attempting to allocate the same payment twice.
    const existingAllocation = await unwrap<Record<string, unknown> | null>(client
      .from('payment_allocations')
      .select('*')
      .eq('payment_id', payment.id)
      .eq('invoice_id', input.invoiceId)
      .eq('status', 'active')
      .maybeSingle());
    if (existingAllocation) return { payment, allocation: existingAllocation, allocationError: null };

    const result = await client.rpc('allocate_customer_payment', {
      p_payment_id: payment.id,
      p_invoice_id: input.invoiceId,
      p_amount: amount,
      p_allocation_date: input.paymentDate,
    });
    allocationError = result.error;
    allocation = result.data as Record<string, unknown> | null;
  }
  return { payment, allocation, allocationError };
}

export async function reverseCustomerPayment(client: SupabaseClient, paymentId: string, reason: string) {
  const normalizedReason = reason.trim();
  if (!normalizedReason) throw new Error('A reason is required to reverse a payment.');
  return unwrap<Row>(client.rpc('reverse_customer_payment', {
    p_payment_id: paymentId,
    p_reversal_date: new Date().toISOString().slice(0, 10),
    p_reason: normalizedReason,
  }));
}

/**
 * Removes a customer payment from the active workspace view without bypassing
 * the financial immutability rules. Legacy/unposted rows can be deleted; a
 * posted payment is reversed through the audited accounting command instead.
 */
export async function deleteCustomerPayment(
  client: SupabaseClient,
  paymentId: string,
  scope: { userId: string; companyIds: readonly string[] },
) {
  const payment = await getPayment(client, paymentId, scope);
  if (!payment) throw new Error('Payment not found.');

  const accountingState = String(payment.accounting_state || 'legacy').toLowerCase();
  if (accountingState === 'reversed') {
    throw new Error('This payment has already been reversed.');
  }
  if (accountingState === 'opening_balance') {
    throw new Error('Opening balance payments cannot be deleted.');
  }
  if (accountingState === 'posted') {
    return reverseCustomerPayment(client, paymentId, 'Payment deleted by user');
  }

  let request = client.from('payments').delete().eq('id', paymentId);
  request = request.or(scopedResource(scope.userId, scope.companyIds));
  await unwrap<unknown>(request);
  return null;
}

export async function listScopedResource<T extends Row>(
  client: SupabaseClient,
  table: string,
  scope: { userId: string; companyIds: readonly string[] },
  select = '*',
) {
  return unwrap<T[]>(client.from(table).select(select).or(scopedResource(scope.userId, scope.companyIds)).order('created_at', { ascending: false }).limit(250));
}

export async function saveScopedResource(
  client: SupabaseClient,
  table: string,
  payload: Row,
  existingId?: string | null,
) {
  const request = existingId
    ? client.from(table).update(payload).eq('id', existingId).eq('company_id', String(payload.company_id)).select().single()
    : client.from(table).insert(payload).select().single();
  return unwrap<Row>(request);
}

export async function deleteScopedResource(client: SupabaseClient, table: string, id: string, companyId: string) {
  await unwrap<unknown>(client.from(table).delete().eq('id', id).eq('company_id', companyId));
}

export type { InvoiceDraftInput, InvoiceItemPersistencePayload, InvoicePersistencePayload, WorkspaceScope };
