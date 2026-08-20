import {
    buildIntelligenceSnapshot,
    daysOverdue,
    dedupeAndRankInsights,
    isFinancialInvoice,
    localizeInsight,
    outstandingForInvoice,
    type IntelligenceInsight,
} from '../../src/services/intelligence/analytics';

const customerA = { id: 'customer-a', name: 'ABC LLC' };
const customerB = { id: 'customer-b', name: 'Besa SH.P.K.' };

const invoices = [
    { id: 'overdue-14', invoice_number: 'INV-1045', issue_date: '2026-07-20', due_date: '2026-08-06', status: 'sent', total_amount: 1200, amount_received: 0, client_id: customerA.id, client: customerA, items: [{ product_id: 'product-a', description: 'Fener fluturues', quantity: 3 }] },
    { id: 'paid-old', invoice_number: 'INV-1000', issue_date: '2026-07-01', due_date: '2026-07-10', status: 'paid', total_amount: 900, amount_received: 900, client_id: customerA.id, client: customerA },
    { id: 'growth-current-1', invoice_number: 'INV-1040', issue_date: '2026-08-18', due_date: '2026-09-01', status: 'sent', total_amount: 800, amount_received: 0, client_id: customerA.id, client: customerA, items: [{ product_id: 'product-a', description: 'Fener fluturues', quantity: 20 }] },
    { id: 'growth-current-2', invoice_number: 'INV-1041', issue_date: '2026-08-19', due_date: '2026-09-02', status: 'paid', total_amount: 850, amount_received: 850, client_id: customerA.id, client: customerA, items: [{ product_id: 'product-a', description: 'Fener fluturues', quantity: 18 }] },
    { id: 'growth-previous-1', invoice_number: 'INV-0900', issue_date: '2026-05-20', due_date: '2026-06-01', status: 'paid', total_amount: 500, amount_received: 500, client_id: customerA.id, client: customerA },
    { id: 'growth-previous-2', invoice_number: 'INV-0901', issue_date: '2026-06-01', due_date: '2026-06-10', status: 'paid', total_amount: 500, amount_received: 500, client_id: customerA.id, client: customerA },
    { id: 'duplicate-a', invoice_number: 'DUP-1', issue_date: '2026-08-10', due_date: '2026-08-20', status: 'sent', total_amount: 125.4, amount_received: 0, client_id: customerB.id, client: customerB },
    { id: 'duplicate-b', invoice_number: 'DUP-1', issue_date: '2026-08-10', due_date: '2026-08-20', status: 'sent', total_amount: 125.4, amount_received: 0, client_id: customerB.id, client: customerB },
    { id: 'draft', invoice_number: 'DRAFT-1', issue_date: '2026-08-19', due_date: '2026-08-20', status: 'draft', total_amount: 10, amount_received: 0, client_id: customerB.id, client: customerB },
];

describe('deterministic OperiX Intelligence analytics', () => {
    test('calculates invoice totals, outstanding balances, and overdue milestones without an LLM', () => {
        const paymentIndex = new Map([['paid-old', [{ amount: 900, payment_date: '2026-07-10', invoice_id: 'paid-old' }]]]);
        const overdue = invoices[0];
        expect(isFinancialInvoice(invoices.find((invoice) => invoice.id === 'draft')!)).toBe(false);
        expect(outstandingForInvoice(overdue)).toBe(1200);
        expect(daysOverdue(overdue, '2026-08-20')).toBe(14);
        expect(outstandingForInvoice(invoices[1], paymentIndex)).toBe(0);
    });

    test('surfaces ranked overdue, customer, inventory, sales, and duplicate insights', () => {
        const snapshot = buildIntelligenceSnapshot({
            asOf: '2026-08-20',
            currency: 'EUR',
            invoices,
            customers: [customerA, customerB],
            payments: [{ invoice_id: 'paid-old', client_id: customerA.id, amount: 900, payment_date: '2026-07-10' }],
            products: [{ id: 'product-a', name: 'Fener fluturues', unit: 'units', track_stock: true, stock_quantity: 18, low_stock_threshold: 20 }],
            expenses: [{ id: 'expense-a', vendor_name: 'Supplier', amount: 125.4, date: '2026-08-10' }, { id: 'expense-b', vendor_name: 'Supplier', amount: 125.4, date: '2026-08-10' }],
        });
        expect(snapshot.invoice.overdueCount).toBeGreaterThan(0);
        expect(snapshot.invoice.allOutstanding).toBeGreaterThan(0);
        expect(snapshot.briefing.outstanding).toBe(snapshot.invoice.allOutstanding);
        expect(snapshot.customer.metrics.find((metric) => metric.id === customerA.id)?.lifetimeSales).toBeGreaterThan(0);
        expect(snapshot.inventory.lowStock.map((product) => product.id)).toContain('product-a');
        expect(snapshot.duplicateWarnings.length).toBeGreaterThanOrEqual(2);
        expect(snapshot.insights.length).toBeLessThanOrEqual(6);
        expect(snapshot.recommendations.every((insight) => insight.priority !== 'info')).toBe(true);
    });

    test('does not forecast stockout when history is insufficient', () => {
        const snapshot = buildIntelligenceSnapshot({
            asOf: '2026-08-20',
            invoices: [{ id: 'recent', issue_date: '2026-08-19', status: 'paid', total_amount: 50, amount_received: 50, items: [{ product_id: 'new-product', quantity: 1 }] }],
            products: [{ id: 'new-product', name: 'New product', track_stock: true, stock_quantity: 3, low_stock_threshold: 5 }],
        });
        const product = snapshot.inventory.metrics[0];
        expect(product.reliableForecast).toBe(false);
        expect(product.daysOfStock).toBeNull();
        expect(snapshot.inventory.insights[0]?.detail).toContain('not enough sales history');
    });

    test('deduplicates repeated milestone keys and keeps the highest priority item', () => {
        const first: IntelligenceInsight = { id: 'first', key: 'overdue:invoice:14', category: 'invoice', priority: 'attention', score: 60, title: 'Invoice overdue', detail: 'first', action: { target: 'invoice', id: 'invoice' } };
        const second: IntelligenceInsight = { ...first, id: 'second', priority: 'important', score: 120, detail: 'second' };
        const third: IntelligenceInsight = { ...first, id: 'third', key: 'inventory:product:7', score: 40, category: 'inventory', action: { target: 'product', id: 'product' } };
        expect(dedupeAndRankInsights([first, second, third], 6)).toEqual([second, third]);
    });

    test('fails closed when all intelligence permissions are unavailable', () => {
        const snapshot = buildIntelligenceSnapshot({
            permissions: { invoices: false, payments: false, customers: false, inventory: false, sales: false },
            invoices,
            payments: [{ amount: 100 }],
            customers: [customerA],
            products: [{ id: 'product-a', track_stock: true, stock_quantity: 1 }],
        });
        expect(snapshot.hasData).toBe(false);
        expect(snapshot.invoice.month.total).toBe(0);
        expect(snapshot.inventory.metrics).toHaveLength(0);
        expect(snapshot.payments.outstanding).toBe(0);
    });

    test('compares payment behavior only after enough history exists', () => {
        const snapshot = buildIntelligenceSnapshot({
            asOf: '2026-08-20',
            invoices: [
                { id: 'paid-a', issue_date: '2026-06-01', due_date: '2026-06-05', status: 'paid', total_amount: 100, amount_received: 100, client_id: 'customer-a', client: customerA },
                { id: 'paid-b', issue_date: '2026-07-01', due_date: '2026-07-05', status: 'paid', total_amount: 100, amount_received: 100, client_id: 'customer-a', client: customerA },
                { id: 'late-now', issue_date: '2026-07-20', due_date: '2026-08-06', status: 'sent', total_amount: 1_200, amount_received: 0, client_id: 'customer-a', client: customerA },
            ],
            customers: [customerA],
            payments: [
                { invoice_id: 'paid-a', client_id: 'customer-a', amount: 100, payment_date: '2026-06-10' },
                { invoice_id: 'paid-b', client_id: 'customer-a', amount: 100, payment_date: '2026-07-10' },
            ],
        });
        const metric = snapshot.customer.metrics[0];
        expect(metric.paymentSampleCount).toBe(2);
        expect(metric.normalPaymentDays).toBe(9);
        expect(snapshot.customer.insights.some((insight) => insight.key.startsWith('customer-payment:'))).toBe(true);
    });

    test('uses same-weekday history for a sales anomaly and localizes generated insights', () => {
        const snapshot = buildIntelligenceSnapshot({
            asOf: '2026-08-20',
            invoices: [
                { id: 'yesterday', issue_date: '2026-08-19', status: 'sent', total_amount: 100 },
                { id: 'week-1', issue_date: '2026-08-12', status: 'sent', total_amount: 10 },
                { id: 'week-2', issue_date: '2026-08-05', status: 'sent', total_amount: 10 },
                { id: 'week-3', issue_date: '2026-07-29', status: 'sent', total_amount: 10 },
            ],
        });
        const anomaly = snapshot.insights.find((insight) => insight.key.startsWith('sales-weekday-change:'));
        expect(anomaly?.percentChange).toBe(2566.7);
        expect(localizeInsight(anomaly!, 'sq').title).toBe('Shitjet ndryshuan ndjeshëm');
    });

    test('alerts on invoices approaching due date and a rising overdue balance', () => {
        const snapshot = buildIntelligenceSnapshot({
            asOf: '2026-08-20',
            invoices: [
                { id: 'old-overdue', invoice_number: 'INV-1', issue_date: '2026-07-01', due_date: '2026-07-05', status: 'sent', total_amount: 100, amount_received: 0, client_id: 'customer-a', client: customerA },
                { id: 'current-overdue', invoice_number: 'INV-2', issue_date: '2026-08-01', due_date: '2026-08-05', status: 'sent', total_amount: 200, amount_received: 0, client_id: 'customer-a', client: customerA },
                { id: 'due-soon', invoice_number: 'INV-3', issue_date: '2026-08-19', due_date: '2026-08-21', status: 'sent', total_amount: 300, amount_received: 0, client_id: 'customer-a', client: customerA },
            ],
            customers: [customerA],
        });
        expect(snapshot.invoice.dueSoonCount).toBe(1);
        expect(snapshot.invoice.insights.some((insight) => insight.key.startsWith('due-soon:'))).toBe(true);
        expect(snapshot.insights.some((insight) => insight.key.startsWith('overdue-balance-increase:'))).toBe(true);
    });
});
