import { calculateInvoice } from "@invoice-monorepo/money";
import type { InvoiceDraft } from "./models";

export function invoiceTotals(draft: Pick<InvoiceDraft, "items"> & Partial<Pick<InvoiceDraft, "amount_received" | "currency" | "discount_percent">>) {
  const result = calculateInvoice({
    lines: draft.items.map((item) => ({
      quantity: item.quantity,
      unitPrice: item.unit_price,
      taxRate: item.tax_rate,
      discountPercent: item.discount,
      taxIncluded: item.tax_included,
    })),
    // Invoice Mobile applies the form-level percentage to every line. Keep
    // that behavior at the Web boundary while the shared calculator remains
    // the source of rounding and VAT truth.
    documentDiscountPercent: undefined,
    paidAmount: draft.amount_received,
    currency: draft.currency,
  });
  return {
    lines: result.lines,
    subtotal: result.subtotal,
    discount: result.discount,
    tax: result.tax,
    total: result.total,
    taxable: result.taxable,
    shipping: result.shipping,
    transport: result.transport,
    additionalFees: result.additionalFees,
  };
}

export function cashAllowed(total: number) {
  return total < 300;
}

export function paymentState(total: number, received: number) {
  const result = calculateInvoice({
    lines: [{ quantity: 1, unitPrice: total }],
    paidAmount: received,
  });
  return {
    paid: result.paidInFull,
    change: result.change,
    due: result.remaining,
  };
}
