import type { DataRecord } from './store.ts';
import type { LocalDataStore } from './local.ts';

type Row = Record<string, unknown>;

/** Report types that can be produced from the records on the device. The ledger-based ones need the cloud. */
export const LOCAL_REPORT_TYPES = ['daily', 'profit_loss', 'cash_flow', 'cash_book', 'inventory_register', 'ar_aging', 'ap_aging'] as const;
export function isLocalReportType(type: string) { return (LOCAL_REPORT_TYPES as readonly string[]).includes(type); }

const SALES_TYPES = ['INVOICE', 'FINAL_INVOICE', 'SIMPLIFIED_INVOICE', 'FISCAL_RECEIPT', 'ADVANCE_INVOICE', 'DEBIT_NOTE'];
const round = (value: number) => Math.round(value * 100) / 100;
const month = (date: unknown) => `${String(date ?? '').slice(0, 7)}-01`;

function isIssuedSale(invoice: DataRecord) {
    return SALES_TYPES.includes(String(invoice.commercial_document_type)) && !['draft', 'cancelled', 'reversed'].includes(String(invoice.status));
}

function agingBucket(dueDate: unknown) {
    if (!dueDate) return 'current';
    const days = Math.floor((Date.now() - new Date(String(dueDate)).getTime()) / 86_400_000);
    if (days <= 0) return 'current';
    if (days <= 30) return '1-30';
    if (days <= 60) return '31-60';
    if (days <= 90) return '61-90';
    return '90+';
}

async function receivables(store: LocalDataStore) {
    return (await store.listInvoices())
        .filter((invoice) => isIssuedSale(invoice) && invoice.status !== 'paid' && invoice.payment_status !== 'NOT_APPLICABLE')
        .map((invoice) => ({ invoice, outstanding: round(Number(invoice.total_amount || 0) - Number(invoice.amount_received || 0)) }))
        .filter((entry) => entry.outstanding > 0);
}

async function payables(store: LocalDataStore) {
    const vendors = new Map((await store.list('vendors')).map((vendor) => [vendor.id, vendor]));
    return (await store.list('supplier_bills')).filter((bill) => bill.status !== 'paid').map((bill) => ({
        bill, vendorName: String(vendors.get(String(bill.vendor_id))?.name ?? ''), outstanding: round(Number(bill.total_amount || 0)),
    }));
}

export async function localReportSummary(store: LocalDataStore) {
    const sales = (await store.listInvoices()).filter(isIssuedSale);
    const revenue = round(sales.reduce((sum, invoice) => sum + Number(invoice.total_amount || 0) - Number(invoice.tax_amount || 0), 0));
    const expenses = round((await store.list('expenses')).filter((expense) => expense.type !== 'income').reduce((sum, expense) => sum + Number(expense.amount || 0), 0));
    return {
        gross_sales: round(sales.reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0)),
        revenue, expenses, net_profit: round(revenue - expenses),
        ar_outstanding: round((await receivables(store)).reduce((sum, entry) => sum + entry.outstanding, 0)),
        ap_outstanding: round((await payables(store)).reduce((sum, entry) => sum + entry.outstanding, 0)),
    };
}

/** Rows shaped like the cloud report views, so the same report screen renders both. */
export async function localReportRows(store: LocalDataStore, source: string): Promise<Row[]> {
    const company_id = store.companyId;
    if (source === 'operix_report_summary') {
        const summary = await localReportSummary(store);
        return [{ company_id, ...summary }];
    }
    if (source === 'operix_ar_aging') {
        return (await receivables(store)).map(({ invoice, outstanding }) => ({
            company_id, invoice_id: invoice.id, invoice_number: invoice.invoice_number, customer_name: (invoice.client as { name?: string } | null)?.name ?? '',
            issue_date: invoice.issue_date, due_date: invoice.due_date, status: invoice.status, total_amount: invoice.total_amount, outstanding_amount: outstanding,
            aging_bucket: agingBucket(invoice.due_date),
        })).sort((a, b) => String(a.due_date ?? '').localeCompare(String(b.due_date ?? '')));
    }
    if (source === 'operix_ap_open_items') {
        return (await payables(store)).map(({ bill, vendorName, outstanding }) => ({
            company_id, supplier_bill_id: bill.id, bill_number: bill.bill_number, supplier_name: vendorName, issue_date: bill.issue_date, due_date: bill.due_date,
            status: bill.status, total_amount: bill.total_amount, outstanding_amount: outstanding, aging_bucket: agingBucket(bill.due_date),
        }));
    }
    if (source === 'inventory_register') {
        return (await store.list('products', { orderBy: 'name' })).filter((product) => product.track_stock).map((product) => {
            const quantity = Number(product.stock_quantity || 0);
            const unitCost = Number(product.unit_cost_with_vat || product.supplier_unit_price_after_discount || product.supplier_unit_price || product.unit_price || 0);
            return { company_id, product_id: product.id, name: product.name, sku: product.sku ?? '', stock_quantity: quantity, unit_cost: unitCost, inventory_value: round(quantity * unitCost) };
        });
    }
    if (source === 'operix_cash_flow') {
        const buckets = new Map<string, number>();
        const add = (date: unknown, method: unknown, amount: number) => {
            const key = `${month(date)}|${method === 'cash' ? 'cash' : 'bank'}`;
            buckets.set(key, round((buckets.get(key) ?? 0) + amount));
        };
        (await store.listPayments()).forEach((payment) => add(payment.payment_date, payment.payment_method, Number(payment.amount || 0)));
        (await store.list('expenses')).filter((expense) => expense.type !== 'income').forEach((expense) => add(expense.date, expense.payment_method, -Number(expense.amount || 0)));
        (await store.list('vendor_payments')).forEach((payment) => add(payment.payment_date, payment.payment_method, -Number(payment.amount || 0)));
        return [...buckets.entries()].map(([key, net]) => { const [period_start, cash_account_type] = key.split('|'); return { company_id, period_start, cash_account_type, net_change: net }; })
            .sort((a, b) => String(b.period_start).localeCompare(String(a.period_start)));
    }
    if (source === 'operix_profit_loss') {
        const rows = new Map<string, { account_name: string; account_type: string; period_start: string; amount: number }>();
        const add = (period: string, name: string, type: string, amount: number) => {
            const key = `${period}|${type}|${name}`;
            const current = rows.get(key) ?? { account_name: name, account_type: type, period_start: period, amount: 0 };
            current.amount = round(current.amount + amount);
            rows.set(key, current);
        };
        (await store.listInvoices()).filter(isIssuedSale).forEach((invoice) => add(month(invoice.issue_date), 'Sales revenue', 'revenue', Number(invoice.total_amount || 0) - Number(invoice.tax_amount || 0)));
        (await store.list('expenses')).filter((expense) => expense.type !== 'income').forEach((expense) => add(month(expense.date), String(expense.category || 'Other expenses'), 'expense', Number(expense.amount || 0)));
        return [...rows.values()].map((row) => ({ company_id, account_code: '', account_name: row.account_name, account_type: row.account_type, period_start: row.period_start, presentation_amount: row.amount }))
            .sort((a, b) => String(b.period_start).localeCompare(String(a.period_start)));
    }
    return [];
}
