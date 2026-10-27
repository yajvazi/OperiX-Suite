import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateInvoice } from '@invoice-monorepo/money';
import { buildInvoicePersistencePayload, DomainValidationError, dueDateForPreset, isCashPaymentAllowed, TAX_REPORTING_CATEGORIES, taxReportingCategoryLabel, type InvoiceDraftInput } from './domain.ts';
import { existsSync, readFileSync } from 'node:fs';

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

test('shares the strict cash threshold used by Web and Mobile', () => {
  assert.equal(isCashPaymentAllowed('299.99'), true);
  assert.equal(isCashPaymentAllowed('300.00'), false);
  assert.equal(isCashPaymentAllowed(300), false);

  const input = invoiceDraft({ paymentMethod: 'cash', amountReceived: '300.00' });
  assert.throws(
    () => buildInvoicePersistencePayload(input, calculateInvoice({ lines: input.lines, paidAmount: input.amountReceived }), 'FAT-2026-0007'),
    (error: unknown) => error instanceof DomainValidationError,
  );
});

const taxFieldsMigration = new URL('../../../supabase/migrations/20260727160000_kosovo_tax_reporting_fields.sql', import.meta.url);

// The migrations are not part of the public export, so this check only runs in the full repository.
test('tax reporting categories match the database check constraint', { skip: !existsSync(taxFieldsMigration) && 'migrations not present' }, () => {
  const sql = readFileSync(taxFieldsMigration, 'utf8');
  const block = /tax_reporting_category in \(([^)]*)\)/.exec(sql);
  assert.ok(block, 'constraint not found');
  const allowed = [...block[1].matchAll(/'([a-z0-9_]+)'/g)].map((match) => match[1]).sort();
  assert.deepEqual(TAX_REPORTING_CATEGORIES.map((category) => category.value).slice().sort(), allowed);
  assert.equal(taxReportingCategoryLabel('export', 'sq'), 'Eksport · kolona 11');
  assert.equal(taxReportingCategoryLabel('', 'en'), '');
});

test('due date presets add days or clamped months to the issue date', () => {
  assert.equal(dueDateForPreset('2026-01-31', 'one_week'), '2026-02-07');
  assert.equal(dueDateForPreset('2026-02-20', 'two_weeks'), '2026-03-06');
  assert.equal(dueDateForPreset('2026-01-31', 'one_month'), '2026-02-28');
  assert.equal(dueDateForPreset('2028-01-31', 'one_month'), '2028-02-29');
  assert.equal(dueDateForPreset('2026-03-15', 'two_months'), '2026-05-15');
  assert.equal(dueDateForPreset('2026-11-30', 'three_months'), '2027-02-28');
  assert.throws(() => dueDateForPreset('31/01/2026', 'one_week'));
});
