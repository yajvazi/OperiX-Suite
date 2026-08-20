import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateInvoice } from '@invoice-monorepo/money';
import { buildInvoicePersistencePayload, DomainValidationError, type InvoiceDraftInput } from './domain.ts';

function invoiceDraft(overrides: Partial<InvoiceDraftInput> = {}): InvoiceDraftInput {
  return {
    userId: '00000000-0000-0000-0000-000000000001',
    companyId: '00000000-0000-0000-0000-000000000002',
    clientId: '00000000-0000-0000-0000-000000000003',
    issueDate: '2026-08-13',
    dueDate: '2026-08-27',
    documentType: 'INVOICE',
    paymentMethod: 'bank',
    currency: 'EUR',
    lines: [{
      productId: '00000000-0000-0000-0000-000000000004',
      description: 'Service',
      quantity: 10,
      unitPrice: '1.50',
      taxRate: 0,
      discountPercent: 0,
      unit: 'pcs',
    }],
    ...overrides,
  };
}

test('builds one canonical tax-exclusive invoice persistence shape', () => {
  const input = invoiceDraft({
    lines: [
      { description: 'Net item', quantity: 2, unitPrice: '100.00', taxRate: 18, discountPercent: 10, taxIncluded: false },
      { description: 'Gross item', quantity: 1, unitPrice: '11.80', taxRate: 18, taxIncluded: true },
    ],
    documentDiscountPercent: 5,
  });
  const totals = calculateInvoice({
    lines: input.lines,
    documentDiscountPercent: input.documentDiscountPercent,
    currency: input.currency,
  });
  const payload = buildInvoicePersistencePayload(input, totals, 'FAT-2026-0001');

  assert.equal(payload.invoice.commercial_document_type, 'INVOICE');
  assert.equal(payload.invoice.invoice_number, 'FAT-2026-0001');
  assert.equal(payload.invoice.tax_amount, 32.49);
  assert.equal(payload.invoice.total_amount, 212.99);
  assert.equal(payload.items[0].amount, 171);
  assert.equal(payload.items[1].amount, 9.5);
  assert.equal(payload.items[1].tax_included, true);
  assert.equal(payload.items[0].discount, 14.5);
  assert.equal(payload.items[1].discount, 5);
});

test('maps platform-neutral save statuses to the shared commercial status', () => {
  const issued = buildInvoicePersistencePayload(
    invoiceDraft({ status: 'sent', commercialStatus: 'DRAFT' }),
    calculateInvoice({ lines: invoiceDraft().lines }),
    'FAT-2026-0003',
  );
  assert.equal(issued.invoice.commercial_status, 'ISSUED');

  const quote = buildInvoicePersistencePayload(
    invoiceDraft({ documentType: 'QUOTE', status: 'sent', commercialStatus: 'DRAFT' }),
    calculateInvoice({ lines: invoiceDraft().lines }),
    'OF-2026-0001',
  );
  assert.equal(quote.invoice.commercial_status, 'SENT');

  const draft = buildInvoicePersistencePayload(
    invoiceDraft({ status: 'draft' }),
    calculateInvoice({ lines: invoiceDraft().lines }),
    'FAT-2026-0004',
  );
  assert.equal(draft.invoice.commercial_status, 'DRAFT');
});

test('rejects invalid financial input before a Supabase write', () => {
  assert.throws(
    () => buildInvoicePersistencePayload(invoiceDraft({ lines: [{ description: '', quantity: 0, unitPrice: -1 }] }), calculateInvoice({ lines: [{ quantity: 1, unitPrice: 1 }] }), 'FAT-2026-0002'),
    (error: unknown) => error instanceof DomainValidationError,
  );
});

test('rejects decimal discount percentages', () => {
  const lineDiscount = invoiceDraft({
    lines: [{ description: 'Service', quantity: 1, unitPrice: 10, discountPercent: 12.5 }],
  });
  assert.throws(
    () => buildInvoicePersistencePayload(lineDiscount, calculateInvoice({ lines: lineDiscount.lines }), 'FAT-2026-0005'),
    (error: unknown) => error instanceof DomainValidationError && error.field === 'lines.0.discountPercent',
  );

  const documentDiscount = invoiceDraft({ documentDiscountPercent: 7.5 });
  assert.throws(
    () => buildInvoicePersistencePayload(documentDiscount, calculateInvoice({ lines: documentDiscount.lines }), 'FAT-2026-0006'),
    (error: unknown) => error instanceof DomainValidationError && error.field === 'documentDiscountPercent',
  );
});
