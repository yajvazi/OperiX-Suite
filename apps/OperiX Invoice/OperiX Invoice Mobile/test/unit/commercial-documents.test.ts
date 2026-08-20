import {
    COMMERCIAL_DOCUMENT_TYPES,
    DOCUMENT_DEFINITIONS,
    allowedConversion,
    calculateCommercialTotals,
    defaultCommercialStatus,
    documentTypeLabel,
    documentTypePrefix,
    isImmutableCommercialStatus,
    legacyFieldsForDocumentType,
    normalizeCommercialDocumentType,
    planConversion,
    remainingAfterAdvances,
    resolveCommercialDocumentType,
} from '@invoice-monorepo/commercial-documents';

describe('commercial document rules', () => {
    it('covers every implemented document type with a label, prefix, and initial status', () => {
        expect(Object.keys(DOCUMENT_DEFINITIONS)).toEqual(expect.arrayContaining([...COMMERCIAL_DOCUMENT_TYPES]));
        for (const type of COMMERCIAL_DOCUMENT_TYPES) {
            expect(documentTypePrefix(type)).toMatch(/^[A-Z]+$/);
            expect(documentTypeLabel(type, 'en')).toBeTruthy();
            expect(documentTypeLabel(type, 'sq')).toBeTruthy();
            expect(defaultCommercialStatus(type)).toBe(DOCUMENT_DEFINITIONS[type].statuses[0]);
            expect(legacyFieldsForDocumentType(type).subtype).toBeTruthy();
        }
    });

    it('normalizes explicit and legacy document types but never infers from a title', () => {
        expect(normalizeCommercialDocumentType(' sales-order ')).toBe('SALES_ORDER');
        expect(resolveCommercialDocumentType({ commercial_document_type: 'CREDIT_NOTE' })).toBe('CREDIT_NOTE');
        expect(resolveCommercialDocumentType({ subtype: 'delivery_note' })).toBe('DELIVERY_NOTE');
        expect(resolveCommercialDocumentType({ type: 'offer' })).toBe('QUOTE');
        expect(resolveCommercialDocumentType({ title: 'Credit note', type: 'invoice' })).toBe('INVOICE');
    });

    it('enforces conversion paths and original-document requirements', () => {
        expect(allowedConversion('QUOTE', 'INVOICE')).toBe(true);
        expect(allowedConversion('QUOTE', 'CREDIT_NOTE')).toBe(false);
        expect(planConversion('INVOICE', 'CREDIT_NOTE')).toMatchObject({
            sourceType: 'INVOICE',
            targetType: 'CREDIT_NOTE',
            requiresOriginalDocument: true,
            createsEconomicEvents: false,
        });
        expect(() => planConversion('CREDIT_NOTE', 'INVOICE')).toThrow(/not supported/);
    });

    it('calculates shared commercial totals and advance balances', () => {
        expect(calculateCommercialTotals([{ quantity: 2, unitPrice: 50, taxRate: 18 }])).toEqual({
            subtotal: 100,
            discount: 0,
            taxable: 100,
            vat: 18,
            total: 118,
        });
        expect(remainingAfterAdvances(118, [20, 30])).toBe(68);
        expect(remainingAfterAdvances(118, [200])).toBe(0);
    });

    it('treats issued and terminal statuses as immutable', () => {
        expect(isImmutableCommercialStatus('issued')).toBe(true);
        expect(isImmutableCommercialStatus('paid')).toBe(true);
        expect(isImmutableCommercialStatus('draft')).toBe(false);
    });
});
