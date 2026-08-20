import {
    DecimalAmount,
    MoneyAmount,
    atomsToDecimal,
    calculateInvoice,
    decimalToAtoms,
    rescaleAtoms,
} from '@invoice-monorepo/money';

describe('exact money primitives', () => {
    it('parses, formats, and rounds decimal atoms deterministically', () => {
        expect(decimalToAtoms('10.20')).toBe(1020n);
        expect(decimalToAtoms('1.005', 2, 'half-up')).toBe(101n);
        expect(decimalToAtoms('1.005', 2, 'half-even')).toBe(100n);
        expect(rescaleAtoms(-1005n, 3, 2, 'half-up')).toBe(-101n);
        expect(atomsToDecimal(1020n)).toBe('10.20');
        expect(atomsToDecimal(-1n)).toBe('-0.01');
    });

    it('does not allow malformed decimals, invalid currencies, or mixed currencies', () => {
        expect(() => decimalToAtoms('1e3')).toThrow(/Invalid decimal/);
        expect(() => MoneyAmount.fromDecimal('1.00', 'EURO')).toThrow(/Invalid ISO 4217/);
        expect(() => MoneyAmount.fromDecimal('1.00', 'EUR').add(MoneyAmount.fromDecimal('1.00', 'USD'))).toThrow(/same currency/);
    });

    it('keeps additions and multiplications exact', () => {
        const subtotal = DecimalAmount.from('12.00');
        const discount = subtotal.multiply(DecimalAmount.from('0.15', 4), 2);
        expect(discount.toString()).toBe('1.80');
        expect(subtotal.subtract(discount).toString()).toBe('10.20');
        expect(MoneyAmount.fromDecimal('10.20', 'eur').add(MoneyAmount.fromDecimal('0.80', 'EUR')).toJSON()).toEqual({ amount: '11.00', currency: 'EUR' });
    });
});

describe('invoice calculations', () => {
    it.each([
        ['single line', [{ quantity: 2, unitPrice: '10.00', taxRate: 18 }], 20, 3.6, 23.6],
        ['zero VAT', [{ quantity: 10, unitPrice: 1.5, taxRate: 0 }], 15, 0, 15],
        // The persistence contract rounds all monetary results to two minor units.
        ['decimal quantity', [{ quantity: '0.5', unitPrice: '19.99', taxRate: 0 }], 10, 0, 10],
    ])('%s has exact subtotal, VAT, and total', (_label, lines, subtotal, tax, total) => {
        const result = calculateInvoice({ lines });
        expect(result.subtotal).toBe(subtotal);
        expect(result.tax).toBe(tax);
        expect(result.total).toBe(total);
    });

    it('calculates line discounts, document discounts, VAT-inclusive prices, and fees', () => {
        const result = calculateInvoice({
            lines: [
                { quantity: 2, unitPrice: '100.00', discountPercent: 10, taxRate: 18 },
                { quantity: 1, unitPrice: '11.80', taxRate: 18, taxIncluded: true },
            ],
            documentDiscountPercent: 5,
            shipping: { amount: '10.00', taxRate: 18 },
            transport: { amount: '0.50', taxRate: 0 },
            additionalFees: { amount: '1.18', taxRate: 18, taxIncluded: true },
        });

        expect(result.subtotal).toBe(211.8);
        expect(result.discount).toBe(29.5);
        expect(result.taxable).toBe(192);
        expect(result.tax).toBe(34.47);
        expect(result.total).toBe(226.47);
        expect(result.shippingTax).toBe(1.8);
        expect(result.transport).toBe(0.5);
        expect(result.additionalFeesTax).toBe(0.18);
    });

    it('calculates paid, remaining, change, and paid-in-full without negative balances', () => {
        const partial = calculateInvoice({ lines: [{ quantity: 1, unitPrice: 100 }], paidAmount: 35 });
        expect(partial.paid).toBe(35);
        expect(partial.remaining).toBe(65);
        expect(partial.change).toBe(0);
        expect(partial.paidInFull).toBe(false);

        const overpaid = calculateInvoice({ lines: [{ quantity: 1, unitPrice: 100 }], paidAmount: 125 });
        expect(overpaid.remaining).toBe(0);
        expect(overpaid.change).toBe(25);
        expect(overpaid.paidInFull).toBe(true);
    });

    it('bounds negative tax and discount inputs instead of creating negative totals', () => {
        const result = calculateInvoice({
            lines: [{ quantity: 1, unitPrice: 100, taxRate: -18, discountPercent: -25 }],
            documentDiscountAmount: -50,
        });
        expect(result.discount).toBe(0);
        expect(result.tax).toBe(0);
        expect(result.total).toBe(100);
    });

    it('rejects invalid financial values and invalid currencies', () => {
        expect(() => calculateInvoice({ lines: [{ quantity: Number.NaN, unitPrice: 1 }] })).toThrow(/finite/);
        expect(() => calculateInvoice({ lines: [{ quantity: 1, unitPrice: 1 }], currency: 'EURO' })).toThrow(/three-letter/);
        expect(() => calculateInvoice({ lines: [{ quantity: 1, unitPrice: 1 }], shipping: { amount: 1, taxRate: 100 } })).not.toThrow();
    });
});
