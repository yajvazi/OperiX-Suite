import { calculateInvoice } from '@invoice-monorepo/money';
import {
    DomainValidationError,
    buildInvoicePersistencePayload,
    type InvoiceDraftInput,
    validateInvoiceDraft,
} from '@invoice-monorepo/api/domain';

const ids = {
    user: '00000000-0000-0000-0000-000000000001',
    company: '00000000-0000-0000-0000-000000000002',
    customer: '00000000-0000-0000-0000-000000000003',
    product: '00000000-0000-0000-0000-000000000004',
};

function draft(overrides: Partial<InvoiceDraftInput> = {}): InvoiceDraftInput {
    return {
        userId: ids.user,
        companyId: ids.company,
        clientId: ids.customer,
        issueDate: '2026-08-19',
        dueDate: '2026-09-18',
        documentType: 'INVOICE',
        paymentMethod: 'bank',
        currency: 'EUR',
        lines: [{ productId: ids.product, description: 'Service', quantity: 2, unitPrice: '100.00', taxRate: 18, discountPercent: 10 }],
        ...overrides,
    };
}

describe('invoice persistence domain', () => {
    it('builds a canonical tax-exclusive persistence payload', () => {
        const input = draft({
            lines: [
                { description: 'Net item', quantity: 2, unitPrice: '100.00', taxRate: 18, discountPercent: 10, taxIncluded: false },
                { description: 'Gross item', quantity: 1, unitPrice: '11.80', taxRate: 18, taxIncluded: true },
            ],
            documentDiscountPercent: 5,
        });
        const totals = calculateInvoice({ lines: input.lines, documentDiscountPercent: input.documentDiscountPercent, currency: input.currency });
        const payload = buildInvoicePersistencePayload(input, totals, 'FAT-2026-0001');

        expect(payload.invoice).toMatchObject({
            user_id: ids.user,
            company_id: ids.company,
            client_id: ids.customer,
            invoice_number: 'FAT-2026-0001',
            commercial_document_type: 'INVOICE',
            commercial_status: 'DRAFT',
            accounting_state: 'ready_for_posting',
            tax_amount: 32.49,
            total_amount: 212.99,
            amount_received: 0,
            customer_signature_status: 'not_requested',
        });
        expect(payload.items).toEqual(expect.arrayContaining([
            expect.objectContaining({ description: 'Net item', amount: 171, discount: 14.5, tax_included: false }),
            expect.objectContaining({ description: 'Gross item', amount: 9.5, discount: 5, tax_included: true }),
        ]));
    });

    it.each([
        ['no user', { userId: '' }, 'userId'],
        ['no company', { companyId: '' }, 'companyId'],
        ['bad issue date', { issueDate: '19/08/2026' }, 'issueDate'],
        ['unsupported document type', { documentType: 'NOT_A_DOCUMENT' as any }, 'documentType'],
        ['no lines', { lines: [] }, 'lines'],
    ])('rejects %s before a write', (_label, overrides, field) => {
        expect(() => validateInvoiceDraft(draft(overrides as Partial<InvoiceDraftInput>))).toThrow(DomainValidationError);
        try { validateInvoiceDraft(draft(overrides as Partial<InvoiceDraftInput>)); } catch (error) { expect((error as DomainValidationError).field).toBe(field); }
    });

    it('rejects invalid line quantities, prices, discounts, VAT, and cash settlement', () => {
        expect(() => validateInvoiceDraft(draft({ lines: [{ description: 'x', quantity: 0, unitPrice: 1 }] }))).toThrow(/greater than zero/);
        expect(() => validateInvoiceDraft(draft({ lines: [{ description: 'x', quantity: 1, unitPrice: -1 }] }))).toThrow(/negative/);
        expect(() => validateInvoiceDraft(draft({ lines: [{ description: 'x', quantity: 1, unitPrice: 1, discountPercent: 101 }] }))).toThrow(/between 0 and 100/);
        expect(() => validateInvoiceDraft(draft({ lines: [{ description: 'x', quantity: 1, unitPrice: 1, taxRate: -1 }] }))).toThrow(/between 0 and 100/);
        const totals = calculateInvoice({ lines: [{ quantity: 1, unitPrice: 10 }] });
        expect(() => validateInvoiceDraft(draft({ paymentMethod: 'cash', amountReceived: 1 }), totals)).toThrow(/cover/);
        expect(() => validateInvoiceDraft(draft({ paymentMethod: 'cash', amountReceived: 400 }), calculateInvoice({ lines: [{ quantity: 1, unitPrice: 300 }] }))).toThrow(/below 300/);
    });

    it('maps document types, statuses, signatures, fees, and cash change', () => {
        const input = draft({
            documentType: 'QUOTE',
            status: 'sent',
            commercialStatus: 'DRAFT',
            paymentMethod: 'cash',
            amountReceived: 250,
            shipping: { amount: 2, taxRate: 18 },
            customerSignatureRequested: true,
            buyerSignatureUrl: 'data:image/svg+xml,signature',
            customerSignatureName: 'Blerina',
        });
        const totals = calculateInvoice({ lines: input.lines, shipping: input.shipping, paidAmount: input.amountReceived });
        const payload = buildInvoicePersistencePayload(input, totals, 'OF-2026-0001');
        expect(payload.invoice).toMatchObject({
            type: 'offer',
            subtype: 'offer',
            commercial_status: 'SENT',
            accounting_state: 'legacy',
            shipping_amount: 2,
            shipping_tax_amount: 0.36,
            amount_received: 0,
            customer_signature_requested: false,
            customer_signature_status: 'not_requested',
        });
    });
});
