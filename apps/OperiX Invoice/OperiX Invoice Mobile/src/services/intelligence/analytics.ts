export type InsightPriority = 'info' | 'attention' | 'important';

export type IntelligencePermissions = {
    invoices: boolean;
    payments: boolean;
    customers: boolean;
    inventory: boolean;
    sales: boolean;
};

export type IntelligenceAction = {
    target: 'invoice' | 'customer' | 'product' | 'invoices' | 'products' | 'expenses' | 'sales' | 'payments' | 'notifications';
    id?: string;
    params?: Record<string, string>;
};

export type IntelligenceInsight = {
    id: string;
    key: string;
    category: 'invoice' | 'customer' | 'inventory' | 'sales' | 'payment' | 'duplicate';
    priority: InsightPriority;
    score: number;
    title: string;
    detail: string;
    entityId?: string;
    amount?: number;
    days?: number;
    percentChange?: number;
    action: IntelligenceAction;
};

export type IntelligenceLine = {
    id?: string;
    product_id?: string | null;
    description?: string | null;
    quantity?: number | string | null;
    unit?: string | null;
};

export type IntelligenceInvoice = {
    id?: string;
    invoice_number?: string | null;
    issue_date?: string | null;
    due_date?: string | null;
    status?: string | null;
    type?: string | null;
    subtype?: string | null;
    commercial_status?: string | null;
    commercial_document_type?: string | null;
    total_amount?: number | string | null;
    amount_received?: number | string | null;
    payment_status?: string | null;
    currency?: string | null;
    client_id?: string | null;
    client?: { id?: string | null; name?: string | null } | null;
    items?: IntelligenceLine[] | null;
};

export type IntelligencePayment = {
    id?: string;
    client_id?: string | null;
    invoice_id?: string | null;
    amount?: number | string | null;
    payment_date?: string | null;
    payment_method?: string | null;
};

export type IntelligenceCustomer = {
    id?: string;
    name?: string | null;
};

export type IntelligenceProduct = {
    id?: string;
    name?: string | null;
    unit?: string | null;
    track_stock?: boolean | null;
    stock_quantity?: number | string | null;
    low_stock_threshold?: number | string | null;
};

export type IntelligenceExpense = {
    id?: string;
    vendor_name?: string | null;
    vendor?: string | null;
    amount?: number | string | null;
    date?: string | null;
};

export type IntelligenceInput = {
    invoices?: IntelligenceInvoice[];
    payments?: IntelligencePayment[];
    customers?: IntelligenceCustomer[];
    products?: IntelligenceProduct[];
    expenses?: IntelligenceExpense[];
    currency?: string;
    permissions?: Partial<IntelligencePermissions>;
    asOf?: string;
};

export type InvoiceMetrics = {
    total: number;
    paid: number;
    outstanding: number;
    overdue: number;
    overdueCount: number;
    invoiceCount: number;
    averageInvoice: number;
};

export type CustomerMetric = {
    id: string;
    name: string;
    lifetimeSales: number;
    currentSales: number;
    previousSales: number;
    salesChangePercent: number | null;
    invoiceCount: number;
    outstanding: number;
    overdue: number;
    averagePaymentDays: number | null;
    normalPaymentDays: number | null;
    paymentSampleCount: number;
    currentOverdueDays: number;
    latePaymentCount: number;
    lastPurchase: string | null;
};

export type InventoryMetric = {
    id: string;
    name: string;
    unit: string;
    stock: number;
    lowStockThreshold: number;
    unitsSold: number;
    averageDailySales: number;
    daysOfStock: number | null;
    suggestedReorder: number | null;
    historyDays: number;
    reliableForecast: boolean;
    lastSale: string | null;
};

export type IntelligenceSnapshot = {
    generatedAt: string;
    asOf: string;
    currency: string;
    permissions: IntelligencePermissions;
    hasData: boolean;
    briefing: {
        yesterday: string;
        revenue: number;
        paymentsReceived: number;
        outstanding: number;
        outstandingAdded: number;
        invoicesIssued: number;
        overdueCount: number;
        overdueValue: number;
        salesChangePercent: number | null;
        topCustomer: { id: string; name: string; amount: number } | null;
        topProduct: { id: string; name: string; units: number } | null;
    };
    invoice: {
        month: InvoiceMetrics;
        previousMonth: InvoiceMetrics;
        monthChangePercent: number | null;
        allOutstanding: number;
        overdue: number;
        overdueCount: number;
        averagePaymentDays: number | null;
        dueSoonCount: number;
        concentrationPercent: number | null;
        insights: IntelligenceInsight[];
    };
    customer: {
        metrics: CustomerMetric[];
        insights: IntelligenceInsight[];
    };
    inventory: {
        metrics: InventoryMetric[];
        lowStock: InventoryMetric[];
        stockoutRisk: InventoryMetric[];
        fastMoving: InventoryMetric[];
        slowMoving: InventoryMetric[];
        insights: IntelligenceInsight[];
    };
    sales: {
        monthRevenue: number;
        previousMonthRevenue: number;
        monthChangePercent: number | null;
        averageInvoice: number;
        averageInvoiceChangePercent: number | null;
        bestSalesDay: { date: string; amount: number } | null;
        topCustomer: { id: string; name: string; amount: number } | null;
        topProduct: { id: string; name: string; units: number } | null;
        insights: IntelligenceInsight[];
    };
    payments: {
        yesterday: number;
        month: number;
        outstanding: number;
        overdue: number;
        averageDelayDays: number | null;
        insights: IntelligenceInsight[];
    };
    duplicateWarnings: IntelligenceInsight[];
    insights: IntelligenceInsight[];
    recommendations: IntelligenceInsight[];
    commentary?: string;
    commentarySource?: 'ai' | 'deterministic';
    fingerprint: string;
};

type PaymentIndex = Map<string, IntelligencePayment[]>;
type SalesLine = IntelligenceLine & { invoiceId: string; issueDate: string };

const DAY_MS = 86_400_000;
const DEFAULT_PERMISSIONS: IntelligencePermissions = {
    invoices: true,
    payments: true,
    customers: true,
    inventory: true,
    sales: true,
};

function numberValue(value: unknown, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value: number, decimals = 2) {
    const factor = 10 ** decimals;
    return Math.round((Number.isFinite(value) ? value : 0) * factor) / factor;
}

function dateValue(value: unknown) {
    const date = String(value || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function dateFromKey(value: string) {
    return new Date(`${value}T00:00:00Z`);
}

export function addDays(date: string, days: number) {
    const result = dateFromKey(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string) {
    return Math.round((dateFromKey(to).getTime() - dateFromKey(from).getTime()) / DAY_MS);
}

function monthStart(date: string) {
    return `${date.slice(0, 7)}-01`;
}

function previousMonthStart(date: string) {
    const value = dateFromKey(`${date.slice(0, 7)}-01`);
    value.setUTCDate(0);
    return value.toISOString().slice(0, 7) + '-01';
}

function monthEnd(start: string) {
    return addDays(addDays(start, 32).slice(0, 8) + '01', -1);
}

function inRange(date: string | null, from: string, to: string) {
    return Boolean(date && date >= from && date <= to);
}

function statusValues(invoice: IntelligenceInvoice) {
    return [invoice.status, invoice.commercial_status, invoice.payment_status]
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean);
}

export function isSalesInvoice(invoice: IntelligenceInvoice) {
    const documentType = String(invoice.commercial_document_type || '').toUpperCase();
    if (documentType) {
        return ['INVOICE', 'FINAL_INVOICE', 'ADVANCE_INVOICE', 'SIMPLIFIED_INVOICE', 'FISCAL_RECEIPT'].includes(documentType);
    }
    const legacyTypes = [invoice.type, invoice.subtype].map((value) => String(value || '').toLowerCase());
    return !legacyTypes.some((value) => ['offer', 'quote', 'proforma', 'sales_order', 'delivery_note', 'credit_note', 'debit_note'].includes(value));
}

export function isFinancialInvoice(invoice: IntelligenceInvoice) {
    const statuses = statusValues(invoice);
    return isSalesInvoice(invoice) && !statuses.some((status) => ['cancelled', 'canceled', 'reversed', 'credited', 'draft', 'pending_approval'].includes(status));
}

function buildPaymentIndex(payments: IntelligencePayment[]): PaymentIndex {
    const index: PaymentIndex = new Map();
    payments.forEach((payment) => {
        const invoiceId = String(payment.invoice_id || '');
        if (!invoiceId) return;
        index.set(invoiceId, [...(index.get(invoiceId) || []), payment]);
    });
    return index;
}

function paidForInvoice(invoice: IntelligenceInvoice, payments: PaymentIndex) {
    const hasRecordedAmount = invoice.amount_received !== undefined && invoice.amount_received !== null && Number.isFinite(Number(invoice.amount_received));
    const paid = hasRecordedAmount
        ? numberValue(invoice.amount_received)
        : (payments.get(String(invoice.id || '')) || []).reduce((sum, payment) => sum + Math.max(0, numberValue(payment.amount)), 0);
    const total = Math.max(0, numberValue(invoice.total_amount));
    const status = statusValues(invoice);
    if (!hasRecordedAmount && status.includes('paid') && paid === 0) return total;
    return Math.min(total, Math.max(0, paid));
}

export function outstandingForInvoice(invoice: IntelligenceInvoice, payments: PaymentIndex = new Map()) {
    return round(Math.max(0, numberValue(invoice.total_amount) - paidForInvoice(invoice, payments)));
}

export function daysOverdue(invoice: IntelligenceInvoice, asOf: string, payments: PaymentIndex = new Map()) {
    const dueDate = dateValue(invoice.due_date);
    if (!dueDate || dueDate >= asOf || outstandingForInvoice(invoice, payments) <= 0 || !isFinancialInvoice(invoice)) return 0;
    return Math.max(0, daysBetween(dueDate, asOf));
}

function summarize(invoices: IntelligenceInvoice[], payments: PaymentIndex, asOf: string): InvoiceMetrics {
    const financial = invoices.filter(isFinancialInvoice);
    const total = financial.reduce((sum, invoice) => sum + Math.max(0, numberValue(invoice.total_amount)), 0);
    const paid = financial.reduce((sum, invoice) => sum + paidForInvoice(invoice, payments), 0);
    const overdueRows = financial.filter((invoice) => daysOverdue(invoice, asOf, payments) > 0);
    const outstanding = financial.reduce((sum, invoice) => sum + outstandingForInvoice(invoice, payments), 0);
    return {
        total: round(total),
        paid: round(paid),
        outstanding: round(outstanding),
        overdue: round(overdueRows.reduce((sum, invoice) => sum + outstandingForInvoice(invoice, payments), 0)),
        overdueCount: overdueRows.length,
        invoiceCount: financial.length,
        averageInvoice: financial.length ? round(total / financial.length) : 0,
    };
}

export function percentChange(current: number, previous: number) {
    if (previous === 0) return current === 0 ? 0 : null;
    return round((current - previous) / Math.abs(previous) * 100, 1);
}

function firstPaymentDays(invoice: IntelligenceInvoice, payments: PaymentIndex) {
    const issueDate = dateValue(invoice.issue_date);
    const firstPayment = (payments.get(String(invoice.id || '')) || [])
        .map((payment) => dateValue(payment.payment_date))
        .filter((value): value is string => Boolean(value))
        .sort()[0];
    if (!issueDate || !firstPayment) return null;
    return Math.max(0, daysBetween(issueDate, firstPayment));
}

function average(values: number[]) {
    return values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

function paymentAverage(invoices: IntelligenceInvoice[], payments: PaymentIndex) {
    return average(invoices.filter(isFinancialInvoice).map((invoice) => firstPaymentDays(invoice, payments)).filter((value): value is number => value !== null));
}

function customerId(invoice: IntelligenceInvoice) {
    return String(invoice.client_id || invoice.client?.id || '');
}

function customerName(invoice: IntelligenceInvoice, customers: Map<string, IntelligenceCustomer>) {
    const id = customerId(invoice);
    return String(invoice.client?.name || customers.get(id)?.name || 'Unknown customer');
}

function invoiceLines(invoices: IntelligenceInvoice[], from: string, to: string): SalesLine[] {
    return invoices.filter((invoice) => isFinancialInvoice(invoice) && inRange(dateValue(invoice.issue_date), from, to)).flatMap((invoice) => {
        const issueDate = dateValue(invoice.issue_date) || from;
        return (invoice.items || []).map((line) => ({ ...line, invoiceId: String(invoice.id || ''), issueDate }));
    });
}

function topCustomer(invoices: IntelligenceInvoice[], customers: Map<string, IntelligenceCustomer>, from: string, to: string) {
    const totals = new Map<string, { id: string; name: string; amount: number }>();
    invoices.filter((invoice) => isFinancialInvoice(invoice) && inRange(dateValue(invoice.issue_date), from, to)).forEach((invoice) => {
        const id = customerId(invoice) || 'unassigned';
        const existing = totals.get(id) || { id, name: customerName(invoice, customers), amount: 0 };
        existing.amount += Math.max(0, numberValue(invoice.total_amount));
        totals.set(id, existing);
    });
    const result = [...totals.values()].sort((left, right) => right.amount - left.amount)[0];
    return result ? { ...result, amount: round(result.amount) } : null;
}

function topProduct(invoices: IntelligenceInvoice[], products: Map<string, IntelligenceProduct>, from: string, to: string) {
    const totals = new Map<string, { id: string; name: string; units: number }>();
    invoiceLines(invoices, from, to).forEach((line) => {
        const id = String(line.product_id || line.description || 'unknown');
        const existing = totals.get(id) || { id, name: String(line.description || products.get(id)?.name || 'Product'), units: 0 };
        existing.units += Math.max(0, numberValue(line.quantity));
        totals.set(id, existing);
    });
    const result = [...totals.values()].sort((left, right) => right.units - left.units)[0];
    return result ? { ...result, units: round(result.units) } : null;
}

function makeInsight(input: Omit<IntelligenceInsight, 'score'> & { score?: number }) {
    const base = input.priority === 'important' ? 100 : input.priority === 'attention' ? 55 : 15;
    const score = input.score ?? base + Math.min(40, Math.abs(input.amount || 0) / 100) + Math.min(30, (input.days || 0) * 1.5) + Math.min(25, Math.abs(input.percentChange || 0) / 2);
    return { ...input, score: round(score, 1) };
}

function milestone(days: number) {
    if (days >= 60) return 60;
    if (days >= 30) return 30;
    if (days >= 14) return 14;
    if (days >= 7) return 7;
    return 1;
}

export function dedupeAndRankInsights(insights: IntelligenceInsight[], limit = 6) {
    const byKey = new Map<string, IntelligenceInsight>();
    insights.forEach((insight) => {
        const previous = byKey.get(insight.key);
        if (!previous || insight.score > previous.score) byKey.set(insight.key, insight);
    });
    return [...byKey.values()].sort((left, right) => right.score - left.score).slice(0, limit);
}

const albanianInsightTitles: Record<string, string> = {
    'Invoice overdue': 'Faturë e vonuar',
    'Invoice due soon': 'Fatura maturohet së shpejti',
    'Large outstanding balance': 'Bilanc i madh i papaguar',
    'Customer growth': 'Rritje e klientit',
    'Customer decline': 'Rënie e klientit',
    'Payment behavior changed': 'Sjellja e pagesës ka ndryshuar',
    'Stock may run out soon': 'Stoku mund të mbarojë së shpejti',
    'Low stock': 'Stok i ulët',
    'Slow-moving stock': 'Stok me lëvizje të ngadaltë',
    'Possible duplicate': 'Dublikatë e mundshme',
    'Sales changed significantly': 'Shitjet ndryshuan ndjeshëm',
    'Best sales day': 'Dita më e mirë e shitjeve',
    'Overdue value is concentrated': 'Vlera e vonuar është e përqendruar',
    'Overdue balance increased': 'Bilanci i vonuar u rrit',
};

function localizeInsightDetail(detail: string, locale: 'en' | 'sq') {
    if (locale === 'en') return detail;
    let match = detail.match(/^(.*?) · (.*?) · (.*?) unpaid · (\d+) days overdue\.$/);
    if (match) return `${match[1]} · ${match[2]} · ${match[3]} të papaguara · ${match[4]} ditë me vonesë.`;
    match = detail.match(/^(.*?) · (.*?) · ([\d.,]+) due within 48 hours\.$/);
    if (match) return `${match[1]} · ${match[2]} · ${match[3]} maturohet brenda 48 orëve.`;
    match = detail.match(/^(.*?) has ([\d.,]+) unpaid across (\d+) invoice(s?)\.$/);
    if (match) return `${match[1]} ka ${match[2]} të papaguara në ${match[3]} fatur${match[3] === '1' ? 'ë' : 'a'}.`;
    match = detail.match(/^(.*?) sales are ([\d.,]+)% (higher|lower) than the previous comparable period\.$/);
    if (match) return `Shitjet e ${match[1]} janë ${match[2]}% ${match[3] === 'higher' ? 'më të larta' : 'më të ulëta'} se periudha e mëparshme e krahasueshme.`;
    match = detail.match(/^(.*?) normally pays within about (\d+) days; the current overdue balance is (\d+) days late\.$/);
    if (match) return `${match[1]} zakonisht paguan brenda rreth ${match[2]} ditësh; bilanci aktual i vonuar është ${match[3]} ditë me vonesë.`;
    match = detail.match(/^(.*?) has ([\d.,]+) (.*?) remaining, about ([\d.,]+) days at recent sales speed\. Suggested reorder: ([\d.,]+)\.$/);
    if (match) return `${match[1]} ka mbetur me ${match[2]} ${match[3]}, rreth ${match[4]} ditë me ritmin e fundit të shitjeve. Porosi e sugjeruar: ${match[5]}.`;
    match = detail.match(/^(.*?) has ([\d.,]+) (.*?) remaining\. There is not enough sales history for a reliable stockout prediction\.$/);
    if (match) return `${match[1]} ka mbetur me ${match[2]} ${match[3]}. Nuk ka histori të mjaftueshme shitjesh për një parashikim të besueshëm të mbarimit të stokut.`;
    match = detail.match(/^(.*?) has had no recorded sales for at least 30 days and ([\d.,]+) (.*?) remain\.$/);
    if (match) return `${match[1]} nuk ka pasur shitje të regjistruara për të paktën 30 ditë dhe kanë mbetur ${match[2]} ${match[3]}.`;
    match = detail.match(/^This month’s invoiced sales are ([\d.,]+)% (above|below) compared with the previous month\.$/);
    if (match) return `Shitjet e faturuara këtë muaj janë ${match[1]}% ${match[2] === 'above' ? 'më të larta' : 'më të ulëta'} krahasuar me muajin e kaluar.`;
    match = detail.match(/^(\d{4}-\d{2}-\d{2}) was the strongest invoiced sales day at ([\d.,]+)\.$/);
    if (match) return `${match[1]} ishte dita më e fortë e shitjeve të faturuara me ${match[2]}.`;
    match = detail.match(/^Yesterday’s sales were ([\d.,]+)% (above|below) the normal weekday average\.$/);
    if (match) return `Shitjet e djeshme ishin ${match[1]}% ${match[2] === 'above' ? 'më të larta' : 'më të ulëta'} se mesatarja normale e ditëve të javës.`;
    match = detail.match(/^The three largest overdue customers account for ([\d.,]+)% of current overdue value\.$/);
    if (match) return `Tre klientët me vlerën më të madhe të vonuar përbëjnë ${match[1]}% të vlerës aktuale të vonuar.`;
    match = detail.match(/^Overdue balances are ([\d.,]+)% higher than at the end of last month\.$/);
    if (match) return `Bilancet e vonuara janë ${match[1]}% më të larta se në fund të muajit të kaluar.`;
    if (detail.startsWith('This ')) return 'Ky regjistrim duket i ngjashëm me një regjistrim tjetër me të njëjtën palë, shumë dhe datë. Shqyrtojeni para se të veproni.';
    return detail;
}

export function localizeInsight(insight: IntelligenceInsight, locale: 'en' | 'sq') {
    if (locale === 'en') return insight;
    return {
        ...insight,
        title: albanianInsightTitles[insight.title] || insight.title,
        detail: localizeInsightDetail(insight.detail, locale),
    };
}

function buildCustomerMetrics(invoices: IntelligenceInvoice[], payments: PaymentIndex, customers: Map<string, IntelligenceCustomer>, asOf: string) {
    const currentFrom = addDays(asOf, -89);
    const previousTo = addDays(currentFrom, -1);
    const previousFrom = addDays(previousTo, -89);
    const grouped = new Map<string, IntelligenceInvoice[]>();
    invoices.filter(isFinancialInvoice).forEach((invoice) => {
        const id = customerId(invoice);
        if (!id) return;
        grouped.set(id, [...(grouped.get(id) || []), invoice]);
    });
    const metrics = [...grouped.entries()].map(([id, rows]) => {
        const currentRows = rows.filter((invoice) => inRange(dateValue(invoice.issue_date), currentFrom, asOf));
        const previousRows = rows.filter((invoice) => inRange(dateValue(invoice.issue_date), previousFrom, previousTo));
        const paymentDays = rows.map((invoice) => firstPaymentDays(invoice, payments)).filter((value): value is number => value !== null);
        const currentOverdue = rows.map((invoice) => daysOverdue(invoice, asOf, payments)).sort((left, right) => right - left)[0] || 0;
        const normalPaymentDays = average(paymentDays);
        return {
            id,
            name: String(customers.get(id)?.name || rows.find((invoice) => invoice.client?.name)?.client?.name || 'Customer'),
            lifetimeSales: round(rows.reduce((sum, invoice) => sum + Math.max(0, numberValue(invoice.total_amount)), 0)),
            currentSales: round(currentRows.reduce((sum, invoice) => sum + Math.max(0, numberValue(invoice.total_amount)), 0)),
            previousSales: round(previousRows.reduce((sum, invoice) => sum + Math.max(0, numberValue(invoice.total_amount)), 0)),
            salesChangePercent: currentRows.length >= 2 && previousRows.length >= 2
                ? percentChange(currentRows.reduce((sum, invoice) => sum + Math.max(0, numberValue(invoice.total_amount)), 0), previousRows.reduce((sum, invoice) => sum + Math.max(0, numberValue(invoice.total_amount)), 0))
                : null,
            invoiceCount: rows.length,
            outstanding: round(rows.reduce((sum, invoice) => sum + outstandingForInvoice(invoice, payments), 0)),
            overdue: round(rows.reduce((sum, invoice) => sum + (daysOverdue(invoice, asOf, payments) > 0 ? outstandingForInvoice(invoice, payments) : 0), 0)),
            averagePaymentDays: normalPaymentDays,
            normalPaymentDays,
            paymentSampleCount: paymentDays.length,
            currentOverdueDays: currentOverdue,
            latePaymentCount: rows.filter((invoice) => {
                const paymentDate = (payments.get(String(invoice.id || '')) || []).map((payment) => dateValue(payment.payment_date)).filter(Boolean).sort()[0];
                return Boolean(paymentDate && invoice.due_date && paymentDate > String(invoice.due_date).slice(0, 10));
            }).length,
            lastPurchase: rows.map((invoice) => dateValue(invoice.issue_date)).filter((value): value is string => Boolean(value)).sort().at(-1) || null,
        } satisfies CustomerMetric;
    }).sort((left, right) => right.lifetimeSales - left.lifetimeSales);
    return { metrics, currentFrom, previousFrom, previousTo };
}

function customerInsights(metrics: CustomerMetric[]) {
    return metrics.flatMap((metric): IntelligenceInsight[] => {
        const result: IntelligenceInsight[] = [];
        if (metric.salesChangePercent !== null && metric.salesChangePercent >= 20) {
            result.push(makeInsight({
                id: `customer-growth-${metric.id}`,
                key: `customer-growth:${metric.id}`,
                category: 'customer',
                priority: 'info',
                title: 'Customer growth',
                detail: `${metric.name} sales are ${Math.abs(metric.salesChangePercent)}% higher than the previous comparable period.`,
                entityId: metric.id,
                percentChange: metric.salesChangePercent,
                action: { target: 'customer', id: metric.id },
            }));
        }
        if (metric.salesChangePercent !== null && metric.salesChangePercent <= -20) {
            result.push(makeInsight({
                id: `customer-decline-${metric.id}`,
                key: `customer-decline:${metric.id}`,
                category: 'customer',
                priority: 'attention',
                title: 'Customer decline',
                detail: `${metric.name} sales are ${Math.abs(metric.salesChangePercent)}% lower than the previous comparable period.`,
                entityId: metric.id,
                percentChange: metric.salesChangePercent,
                action: { target: 'customer', id: metric.id },
            }));
        }
        if (metric.currentOverdueDays > 0 && metric.paymentSampleCount >= 2 && metric.normalPaymentDays !== null && metric.currentOverdueDays > Math.max(7, metric.normalPaymentDays * 1.5)) {
            result.push(makeInsight({
                id: `customer-payment-${metric.id}`,
                key: `customer-payment:${metric.id}:${milestone(metric.currentOverdueDays)}`,
                category: 'customer',
                priority: 'important',
                title: 'Payment behavior changed',
                detail: `${metric.name} normally pays within about ${Math.round(metric.normalPaymentDays)} days; the current overdue balance is ${metric.currentOverdueDays} days late.`,
                entityId: metric.id,
                amount: metric.overdue,
                days: metric.currentOverdueDays,
                action: { target: 'customer', id: metric.id },
            }));
        }
        return result;
    });
}

function buildInventoryMetrics(invoices: IntelligenceInvoice[], products: IntelligenceProduct[], asOf: string) {
    const from = addDays(asOf, -89);
    const lines = invoiceLines(invoices, from, asOf);
    const productMap = new Map<string, { units: number; firstSale: string | null; lastSale: string | null }>();
    lines.forEach((line) => {
        const id = String(line.product_id || '');
        if (!id) return;
        const current = productMap.get(id) || { units: 0, firstSale: null, lastSale: null };
        current.units += Math.max(0, numberValue(line.quantity));
        current.firstSale = !current.firstSale || line.issueDate < current.firstSale ? line.issueDate : current.firstSale;
        current.lastSale = !current.lastSale || line.issueDate > current.lastSale ? line.issueDate : current.lastSale;
        productMap.set(id, current);
    });
    const metrics = products.filter((product) => Boolean(product.track_stock)).map((product): InventoryMetric => {
        const id = String(product.id || '');
        const history = productMap.get(id) || { units: 0, firstSale: null, lastSale: null };
        const historyDays = history.firstSale ? Math.min(90, Math.max(1, daysBetween(history.firstSale, asOf) + 1)) : 0;
        const reliableForecast = historyDays >= 14 && history.units > 0;
        const averageDailySales = reliableForecast ? history.units / historyDays : 0;
        const stock = Math.max(0, numberValue(product.stock_quantity));
        return {
            id,
            name: String(product.name || 'Product'),
            unit: String(product.unit || 'units'),
            stock: round(stock),
            lowStockThreshold: round(Math.max(0, numberValue(product.low_stock_threshold, 5) || 5)),
            unitsSold: round(history.units),
            averageDailySales: round(averageDailySales, 1),
            daysOfStock: reliableForecast && averageDailySales > 0 ? round(stock / averageDailySales, 1) : null,
            suggestedReorder: reliableForecast && averageDailySales > 0 ? Math.ceil(averageDailySales * 14) : null,
            historyDays,
            reliableForecast,
            lastSale: history.lastSale,
        };
    }).sort((left, right) => (left.daysOfStock ?? 999_999) - (right.daysOfStock ?? 999_999));
    return { metrics, from };
}

function inventoryInsights(inventory: InventoryMetric[], asOf: string) {
    return inventory.flatMap((metric): IntelligenceInsight[] => {
        const result: IntelligenceInsight[] = [];
        const isLowStock = metric.stock <= metric.lowStockThreshold;
        if (isLowStock || (metric.daysOfStock !== null && metric.daysOfStock <= 14)) {
            const priority: InsightPriority = metric.daysOfStock !== null && metric.daysOfStock <= 7 ? 'important' : 'attention';
            result.push(makeInsight({
                id: `inventory-risk-${metric.id}`,
                key: `inventory-risk:${metric.id}:${metric.daysOfStock === null ? 'low' : Math.floor(metric.daysOfStock / 7)}`,
                category: 'inventory',
                priority,
                title: metric.daysOfStock !== null ? 'Stock may run out soon' : 'Low stock',
                detail: metric.daysOfStock !== null
                    ? `${metric.name} has ${metric.stock} ${metric.unit} remaining, about ${metric.daysOfStock} days at recent sales speed. Suggested reorder: ${metric.suggestedReorder || 0}.`
                    : `${metric.name} has ${metric.stock} ${metric.unit} remaining. There is not enough sales history for a reliable stockout prediction.`,
                entityId: metric.id,
                amount: metric.stock,
                days: metric.daysOfStock || 0,
                action: { target: 'product', id: metric.id },
            }));
        }
        if (metric.stock > 0 && metric.lastSale && daysBetween(metric.lastSale, asOf) >= 30) {
            result.push(makeInsight({
                id: `inventory-slow-${metric.id}`,
                key: `inventory-slow:${metric.id}`,
                category: 'inventory',
                priority: 'info',
                title: 'Slow-moving stock',
                detail: `${metric.name} has had no recorded sales for at least 30 days and ${metric.stock} ${metric.unit} remain.`,
                entityId: metric.id,
                amount: metric.stock,
                action: { target: 'product', id: metric.id },
            }));
        }
        return result;
    });
}

function duplicateInsights(invoices: IntelligenceInvoice[], payments: IntelligencePayment[], expenses: IntelligenceExpense[]) {
    const result: IntelligenceInsight[] = [];
    const addDuplicates = <T>(rows: T[], fingerprint: (row: T) => string | null, label: string, action: IntelligenceAction) => {
        const seen = new Map<string, T>();
        rows.forEach((row) => {
            const key = fingerprint(row);
            if (!key) return;
            const previous = seen.get(key);
            if (!previous) {
                seen.set(key, row);
                return;
            }
            const amount = numberValue((row as { total_amount?: unknown; amount?: unknown }).total_amount ?? (row as { amount?: unknown }).amount);
            result.push(makeInsight({
                id: `duplicate-${label}-${key}-${String((row as { id?: unknown }).id || result.length)}`,
                key: `duplicate:${label}:${key}`,
                category: 'duplicate',
                priority: 'attention',
                title: 'Possible duplicate',
                detail: `This ${label} appears similar to another record with the same party, amount, and date. Review before taking action.`,
                amount,
                action,
            }));
        });
    };
    addDuplicates(invoices.filter(isFinancialInvoice), (invoice) => {
        const number = String(invoice.invoice_number || '').trim().toLowerCase();
        const date = dateValue(invoice.issue_date);
        const amount = round(numberValue(invoice.total_amount));
        const party = customerId(invoice);
        return date && amount > 0 && (number ? `${party}:${number}:${amount}:${date}` : party ? `${party}:${amount}:${date}` : null);
    }, 'invoice', { target: 'invoices' });
    addDuplicates(expenses, (expense) => {
        const date = dateValue(expense.date);
        const amount = round(numberValue(expense.amount));
        const party = String(expense.vendor_name || expense.vendor || '').trim().toLowerCase();
        return date && amount > 0 && party ? `${party}:${amount}:${date}` : null;
    }, 'expense', { target: 'expenses' });
    addDuplicates(payments, (payment) => {
        const date = dateValue(payment.payment_date);
        const amount = round(numberValue(payment.amount));
        const party = String(payment.client_id || '').trim();
        return date && amount > 0 && party ? `${party}:${amount}:${date}` : null;
    }, 'payment', { target: 'payments' });
    return result;
}

function salesInsights(monthChangePercent: number | null, asOf: string, bestSalesDay: { date: string; amount: number } | null) {
    if (monthChangePercent === null || Math.abs(monthChangePercent) < 15) return [];
    const direction = monthChangePercent > 0 ? 'above' : 'below';
    return [makeInsight({
        id: `sales-month-change-${asOf.slice(0, 7)}`,
        key: `sales-month-change:${asOf.slice(0, 7)}:${monthChangePercent > 0 ? 'up' : 'down'}`,
        category: 'sales',
        priority: Math.abs(monthChangePercent) >= 30 ? 'important' : 'attention',
        title: 'Sales changed significantly',
        detail: `This month’s invoiced sales are ${Math.abs(monthChangePercent)}% ${direction} compared with the previous month.`,
        percentChange: monthChangePercent,
        action: { target: 'sales' },
    }), ...(bestSalesDay ? [makeInsight({
        id: `sales-best-day-${bestSalesDay.date}`,
        key: `sales-best-day:${bestSalesDay.date}`,
        category: 'sales',
        priority: 'info',
        title: 'Best sales day',
        detail: `${bestSalesDay.date} was the strongest invoiced sales day at ${round(bestSalesDay.amount)}.`,
        amount: bestSalesDay.amount,
        action: { target: 'sales' },
    })] : [])];
}

export function buildIntelligenceSnapshot(input: IntelligenceInput): IntelligenceSnapshot {
    const asOf = dateValue(input.asOf) || new Date().toISOString().slice(0, 10);
    const permissions = { ...DEFAULT_PERMISSIONS, ...(input.permissions || {}) };
    const invoices = permissions.invoices || permissions.sales ? input.invoices || [] : [];
    const payments = permissions.payments ? input.payments || [] : [];
    const customers = permissions.customers ? input.customers || [] : [];
    const products = permissions.inventory ? input.products || [] : [];
    const expenses = permissions.sales ? input.expenses || [] : [];
    const paymentIndex = buildPaymentIndex(payments);
    const customerMap = new Map(customers.map((customer) => [String(customer.id || ''), customer]));
    const productMap = new Map(products.map((product) => [String(product.id || ''), product]));
    const yesterday = addDays(asOf, -1);
    const currentMonth = monthStart(asOf);
    const previousMonth = previousMonthStart(asOf);
    const previousMonthEnd = monthEnd(previousMonth);
    const monthInvoices = invoices.filter((invoice) => inRange(dateValue(invoice.issue_date), currentMonth, asOf));
    const previousMonthInvoices = invoices.filter((invoice) => inRange(dateValue(invoice.issue_date), previousMonth, previousMonthEnd));
    const month = summarize(monthInvoices, paymentIndex, asOf);
    const previous = summarize(previousMonthInvoices, paymentIndex, previousMonthEnd);
    const allFinancial = invoices.filter(isFinancialInvoice);
    const allSummary = summarize(allFinancial, paymentIndex, asOf);
    const yesterdayInvoices = invoices.filter((invoice) => dateValue(invoice.issue_date) === yesterday);
    const yesterdaySummary = summarize(yesterdayInvoices, paymentIndex, yesterday);
    const paymentsYesterday = round(payments.filter((payment) => dateValue(payment.payment_date) === yesterday).reduce((sum, payment) => sum + Math.max(0, numberValue(payment.amount)), 0));
    const paymentsMonth = round(payments.filter((payment) => inRange(dateValue(payment.payment_date), currentMonth, asOf)).reduce((sum, payment) => sum + Math.max(0, numberValue(payment.amount)), 0));
    const overdueRows = allFinancial.filter((invoice) => daysOverdue(invoice, asOf, paymentIndex) > 0);
    const dueSoonRows = allFinancial.filter((invoice) => {
        const dueDate = dateValue(invoice.due_date);
        return Boolean(dueDate && dueDate >= asOf && dueDate <= addDays(asOf, 2) && outstandingForInvoice(invoice, paymentIndex) > 0);
    });
    const dueSoonCount = dueSoonRows.length;
    const allPaymentDays = allFinancial.map((invoice) => firstPaymentDays(invoice, paymentIndex)).filter((value): value is number => value !== null);
    const customerResult = buildCustomerMetrics(invoices, paymentIndex, customerMap, asOf);
    const visibleCustomerMetrics = permissions.customers ? customerResult.metrics : [];
    const customerMetricInsights = permissions.customers ? customerInsights(customerResult.metrics) : [];
    const inventoryResult = buildInventoryMetrics(invoices, products, asOf);
    const inventoryMetricInsights = permissions.inventory ? inventoryInsights(inventoryResult.metrics, asOf) : [];
    const stockoutRisk = permissions.inventory ? inventoryResult.metrics.filter((metric) => metric.daysOfStock !== null && metric.daysOfStock <= 14) : [];
    const lowStock = permissions.inventory ? inventoryResult.metrics.filter((metric) => metric.stock <= metric.lowStockThreshold) : [];
    const fastMoving = permissions.inventory ? [...inventoryResult.metrics].filter((metric) => metric.reliableForecast).sort((left, right) => right.averageDailySales - left.averageDailySales).slice(0, 5) : [];
    const slowMoving = permissions.inventory ? [...inventoryResult.metrics].filter((metric) => metric.stock > 0 && (!metric.lastSale || daysBetween(metric.lastSale, asOf) >= 30)).slice(0, 5) : [];
    const topMonthCustomer = permissions.customers && (permissions.sales || permissions.invoices) ? topCustomer(invoices, customerMap, currentMonth, asOf) : null;
    const topMonthProduct = permissions.inventory && (permissions.sales || permissions.invoices) ? topProduct(invoices, productMap, currentMonth, asOf) : null;
    const currentDaily = new Map<string, number>();
    monthInvoices.filter(isFinancialInvoice).forEach((invoice) => {
        const date = dateValue(invoice.issue_date);
        if (date) currentDaily.set(date, (currentDaily.get(date) || 0) + Math.max(0, numberValue(invoice.total_amount)));
    });
    const bestSalesDay = [...currentDaily.entries()].sort((left, right) => right[1] - left[1])[0];
    const salesMonthChange = percentChange(month.total, previous.total);
    const averageInvoiceChange = percentChange(month.averageInvoice, previous.averageInvoice);
    const comparableDays: number[] = [];
    for (let offset = 7; offset <= 56; offset += 7) {
        const date = addDays(yesterday, -offset);
        const value = invoices.filter((invoice) => isFinancialInvoice(invoice) && dateValue(invoice.issue_date) === date).reduce((sum, invoice) => sum + Math.max(0, numberValue(invoice.total_amount)), 0);
        comparableDays.push(value);
    }
    const comparableWeekdayAverage = comparableDays.length >= 2 ? comparableDays.reduce((sum, value) => sum + value, 0) / comparableDays.length : null;
    const salesChangePercent = comparableWeekdayAverage !== null && comparableWeekdayAverage > 0 ? percentChange(yesterdaySummary.total, comparableWeekdayAverage) : null;
    const salesInsightsList = permissions.sales ? salesInsights(salesMonthChange, asOf, bestSalesDay ? { date: bestSalesDay[0], amount: round(bestSalesDay[1]) } : null) : [];
    if (permissions.sales && salesChangePercent !== null && Math.abs(salesChangePercent) >= 20) {
        salesInsightsList.unshift(makeInsight({
            id: `sales-weekday-change-${yesterday}`,
            key: `sales-weekday-change:${yesterday}`,
            category: 'sales',
            priority: Math.abs(salesChangePercent) >= 30 ? 'important' : 'attention',
            title: 'Sales changed significantly',
            detail: `Yesterday’s sales were ${Math.abs(salesChangePercent)}% ${salesChangePercent >= 0 ? 'above' : 'below'} the normal weekday average.`,
            percentChange: salesChangePercent,
            action: { target: 'sales' },
        }));
    }
    const concentrationBase = permissions.invoices ? overdueRows.reduce((sum, invoice) => sum + outstandingForInvoice(invoice, paymentIndex), 0) : 0;
    const topOverdueCustomers = permissions.customers ? customerResult.metrics.filter((metric) => metric.overdue > 0).sort((left, right) => right.overdue - left.overdue).slice(0, 3) : [];
    const concentrationPercent = concentrationBase > 0 ? round(topOverdueCustomers.reduce((sum, metric) => sum + metric.overdue, 0) / concentrationBase * 100, 1) : null;
    const invoiceInsights: IntelligenceInsight[] = permissions.invoices ? overdueRows.map((invoice) => {
        const days = daysOverdue(invoice, asOf, paymentIndex);
        const amount = outstandingForInvoice(invoice, paymentIndex);
        const number = String(invoice.invoice_number || 'Invoice');
        const name = customerName(invoice, customerMap);
        return makeInsight({
            id: `overdue-${invoice.id || number}`,
            key: `overdue:${invoice.id || number}:${milestone(days)}`,
            category: 'invoice',
            priority: days >= 14 || amount >= Math.max(1000, month.averageInvoice * 3) ? 'important' : 'attention',
            title: 'Invoice overdue',
            detail: `${name} · ${number} · ${round(amount)} unpaid · ${days} days overdue.`,
            entityId: String(invoice.id || ''),
            amount,
            days,
            action: { target: 'invoice', id: String(invoice.id || '') },
        });
    }) : [];
    const dueSoonInsights: IntelligenceInsight[] = permissions.invoices ? dueSoonRows.slice(0, 5).map((invoice) => {
        const amount = outstandingForInvoice(invoice, paymentIndex);
        const number = String(invoice.invoice_number || 'Invoice');
        const name = customerName(invoice, customerMap);
        return makeInsight({
            id: `due-soon-${invoice.id || number}`,
            key: `due-soon:${invoice.id || number}:${dateValue(invoice.due_date) || 'unknown'}`,
            category: 'invoice',
            priority: 'attention',
            title: 'Invoice due soon',
            detail: `${name} · ${number} · ${round(amount)} due within 48 hours.`,
            entityId: String(invoice.id || ''),
            amount,
            action: { target: 'invoice', id: String(invoice.id || '') },
        });
    }) : [];
    const largeOutstanding = permissions.invoices && permissions.customers ? customerResult.metrics.filter((metric) => metric.outstanding > 0).sort((left, right) => right.outstanding - left.outstanding).slice(0, 3).map((metric) => makeInsight({
        id: `customer-balance-${metric.id}`,
        key: `customer-balance:${metric.id}`,
        category: 'invoice',
        priority: metric.outstanding >= Math.max(1000, month.averageInvoice * 3) ? 'important' : 'attention',
        title: 'Large outstanding balance',
        detail: `${metric.name} has ${round(metric.outstanding)} unpaid across ${metric.invoiceCount} invoice${metric.invoiceCount === 1 ? '' : 's'}.`,
        entityId: metric.id,
        amount: metric.outstanding,
        action: { target: 'customer', id: metric.id },
    })) : [];
    const concentrationInsight = permissions.invoices && permissions.customers && concentrationPercent !== null && concentrationPercent >= 50
        ? [makeInsight({
            id: `overdue-concentration-${asOf}`,
            key: `overdue-concentration:${asOf}`,
            category: 'payment',
            priority: 'attention',
            title: 'Overdue value is concentrated',
            detail: `The three largest overdue customers account for ${concentrationPercent}% of current overdue value.`,
            amount: overdueRows.reduce((sum, invoice) => sum + outstandingForInvoice(invoice, paymentIndex), 0),
            percentChange: concentrationPercent,
            action: { target: 'invoices', params: { status: 'overdue' } },
        })] : [];
    const previousOverdue = allFinancial.reduce((sum, invoice) => daysOverdue(invoice, previousMonthEnd, paymentIndex) > 0 ? sum + outstandingForInvoice(invoice, paymentIndex) : sum, 0);
    const overdueChange = percentChange(allSummary.overdue, round(previousOverdue));
    const overdueTrendInsight = permissions.invoices && overdueChange !== null && overdueChange >= 15
        ? [makeInsight({
            id: `overdue-balance-increase-${asOf.slice(0, 7)}`,
            key: `overdue-balance-increase:${asOf.slice(0, 7)}`,
            category: 'payment',
            priority: overdueChange >= 30 ? 'important' : 'attention',
            title: 'Overdue balance increased',
            detail: `Overdue balances are ${overdueChange}% higher than at the end of last month.`,
            amount: allSummary.overdue,
            percentChange: overdueChange,
            action: { target: 'invoices', params: { status: 'overdue' } },
        })] : [];
    const paymentInsights = [...overdueTrendInsight, ...concentrationInsight];
    const duplicateWarnings = duplicateInsights(permissions.invoices ? invoices : [], permissions.payments ? payments : [], permissions.sales ? expenses : []);
    const allInsights = dedupeAndRankInsights([
        ...invoiceInsights,
        ...dueSoonInsights,
        ...largeOutstanding,
        ...customerMetricInsights,
        ...inventoryMetricInsights,
        ...salesInsightsList,
        ...paymentInsights,
        ...duplicateWarnings,
    ], 50);
    const insights = dedupeAndRankInsights(allInsights, 6);
    const recommendations = insights.filter((insight) => insight.priority !== 'info').slice(0, 4);
    const topCustomerForBriefing = topMonthCustomer;
    const topProductForBriefing = topMonthProduct;
    const snapshot: IntelligenceSnapshot = {
        generatedAt: new Date().toISOString(),
        asOf,
        currency: input.currency || 'EUR',
        permissions,
        hasData: Boolean(invoices.length || payments.length || customers.length || products.length),
        briefing: {
            yesterday,
            revenue: permissions.sales || permissions.invoices ? yesterdaySummary.total : 0,
            paymentsReceived: permissions.payments ? paymentsYesterday : 0,
            outstanding: permissions.invoices ? allSummary.outstanding : 0,
            outstandingAdded: permissions.invoices ? round(Math.max(0, yesterdaySummary.total - yesterdaySummary.paid)) : 0,
            invoicesIssued: permissions.invoices ? yesterdaySummary.invoiceCount : 0,
            overdueCount: permissions.invoices ? overdueRows.length : 0,
            overdueValue: permissions.invoices ? round(overdueRows.reduce((sum, invoice) => sum + outstandingForInvoice(invoice, paymentIndex), 0)) : 0,
            salesChangePercent: permissions.sales ? salesChangePercent : null,
            topCustomer: topCustomerForBriefing,
            topProduct: topProductForBriefing,
        },
        invoice: {
            month: permissions.invoices ? month : { total: 0, paid: 0, outstanding: 0, overdue: 0, overdueCount: 0, invoiceCount: 0, averageInvoice: 0 },
            previousMonth: permissions.invoices ? previous : { total: 0, paid: 0, outstanding: 0, overdue: 0, overdueCount: 0, invoiceCount: 0, averageInvoice: 0 },
            monthChangePercent: permissions.invoices ? salesMonthChange : null,
            allOutstanding: permissions.invoices ? allSummary.outstanding : 0,
            overdue: permissions.invoices ? allSummary.overdue : 0,
            overdueCount: permissions.invoices ? allSummary.overdueCount : 0,
            averagePaymentDays: permissions.invoices && permissions.payments ? averagePaymentDays(invoices, payments) : null,
            dueSoonCount: permissions.invoices ? dueSoonCount : 0,
            concentrationPercent: permissions.invoices && permissions.customers ? concentrationPercent : null,
            insights: permissions.invoices ? dedupeAndRankInsights([...invoiceInsights, ...dueSoonInsights], 5) : [],
        },
        customer: { metrics: visibleCustomerMetrics, insights: dedupeAndRankInsights(customerMetricInsights, 5) },
        inventory: {
            metrics: inventoryResult.metrics,
            lowStock,
            stockoutRisk,
            fastMoving,
            slowMoving,
            insights: dedupeAndRankInsights(inventoryMetricInsights, 5),
        },
        sales: {
            monthRevenue: permissions.sales ? month.total : 0,
            previousMonthRevenue: permissions.sales ? previous.total : 0,
            monthChangePercent: permissions.sales ? salesMonthChange : null,
            averageInvoice: permissions.sales ? month.averageInvoice : 0,
            averageInvoiceChangePercent: permissions.sales ? averageInvoiceChange : null,
            bestSalesDay: permissions.sales && bestSalesDay ? { date: bestSalesDay[0], amount: round(bestSalesDay[1]) } : null,
            topCustomer: topMonthCustomer,
            topProduct: topMonthProduct,
            insights: dedupeAndRankInsights(salesInsightsList, 4),
        },
        payments: {
            yesterday: permissions.payments ? paymentsYesterday : 0,
            month: permissions.payments ? paymentsMonth : 0,
            outstanding: permissions.payments && permissions.invoices ? allSummary.outstanding : 0,
            overdue: permissions.payments && permissions.invoices ? allSummary.overdue : 0,
            averageDelayDays: permissions.payments ? average(allPaymentDays) : null,
            insights: dedupeAndRankInsights(paymentInsights, 3),
        },
        duplicateWarnings,
        insights,
        recommendations,
        fingerprint: '',
    };
    snapshot.fingerprint = JSON.stringify({
        asOf,
        currency: snapshot.currency,
        briefing: snapshot.briefing,
        invoice: snapshot.invoice,
        inventory: snapshot.inventory.metrics.map((metric) => [metric.id, metric.stock, metric.unitsSold, metric.daysOfStock]),
        customer: snapshot.customer.metrics.map((metric) => [metric.id, metric.currentSales, metric.previousSales, metric.outstanding, metric.currentOverdueDays]),
        insightKeys: allInsights.map((insight) => insight.key),
    });
    return snapshot;
}

function averagePaymentDays(invoices: IntelligenceInvoice[], payments: IntelligencePayment[]) {
    return paymentAverage(invoices, buildPaymentIndex(payments));
}

export function intelligenceCommentaryPayload(snapshot: IntelligenceSnapshot) {
    return {
        asOf: snapshot.asOf,
        currency: snapshot.currency,
        yesterday: snapshot.briefing,
        invoice: {
            monthTotal: snapshot.invoice.month.total,
            monthPaid: snapshot.invoice.month.paid,
            outstanding: snapshot.invoice.allOutstanding,
            overdue: snapshot.invoice.overdue,
            overdueCount: snapshot.invoice.overdueCount,
            dueSoonCount: snapshot.invoice.dueSoonCount,
            averagePaymentDays: snapshot.invoice.averagePaymentDays,
        },
        inventory: {
            lowStockCount: snapshot.inventory.lowStock.length,
            stockoutRiskCount: snapshot.inventory.stockoutRisk.length,
            slowMovingCount: snapshot.inventory.slowMoving.length,
        },
        sales: {
            monthRevenue: snapshot.sales.monthRevenue,
            monthChangePercent: snapshot.sales.monthChangePercent,
            averageInvoice: snapshot.sales.averageInvoice,
        },
        payments: {
            month: snapshot.payments.month,
            outstanding: snapshot.payments.outstanding,
            overdue: snapshot.payments.overdue,
            averageDelayDays: snapshot.payments.averageDelayDays,
        },
        insightPriorities: snapshot.insights.map((insight) => ({ category: insight.category, priority: insight.priority, amount: insight.amount, days: insight.days, percentChange: insight.percentChange })),
    };
}
