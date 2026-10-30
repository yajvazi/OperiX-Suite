/**
 * Pure helpers that turn invoice rows into the snapshot the iOS widget reads.
 * No native imports here, so it is easy to test.
 */

export interface DailySalesWidgetTenant {
    id: string;
    name: string;
}

export interface DailySalesWidgetTenantSales extends DailySalesWidgetTenant {
    /** The widget (Swift) reads these two names; `id` and `name` are kept for older widget builds. */
    tenantId: string;
    tenantName: string;
    date: string;
    currency: string;
    sales: number;
    orders: number;
}

export interface DailySalesWidgetSnapshot {
    updatedAt: string;
    defaultTenantId: string | null;
    tenants: Record<string, DailySalesWidgetTenantSales>;
}

export interface WidgetInvoiceRow {
    company_id?: string | null;
    issue_date?: string | null;
    total_amount?: number | string | null;
    status?: string | null;
    document_type?: string | null;
}

/** Documents that are not sales: they never count toward "daily sales". */
const NON_SALES_TYPES = new Set(['QUOTE', 'DELIVERY_NOTE', 'PROFORMA', 'PURCHASE_ORDER']);
const NON_SALES_STATUSES = new Set(['draft', 'cancelled', 'canceled', 'void', 'voided']);

export function localDateKey(date: Date) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function rowDateKey(value: string | null | undefined) {
    if (!value) return '';
    // A plain date ("2026-10-30") is already the issue day; only full timestamps need converting to local time.
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '' : localDateKey(parsed);
}

export function buildDailySalesSnapshot(input: {
    rows: WidgetInvoiceRow[];
    tenants: DailySalesWidgetTenant[];
    defaultTenantId: string | null;
    currency?: string | null;
    now?: Date;
}): DailySalesWidgetSnapshot {
    const now = input.now ?? new Date();
    const todayKey = localDateKey(now);
    const tenants: Record<string, DailySalesWidgetTenantSales> = {};
    for (const tenant of input.tenants) {
        let sales = 0;
        let orders = 0;
        for (const row of input.rows) {
            if ((row.company_id || input.defaultTenantId) !== tenant.id) continue;
            if (rowDateKey(row.issue_date) !== todayKey) continue;
            const type = String(row.document_type || 'INVOICE').toUpperCase();
            if (NON_SALES_TYPES.has(type)) continue;
            if (NON_SALES_STATUSES.has(String(row.status || '').toLowerCase())) continue;
            const amount = Number(row.total_amount || 0);
            if (!Number.isFinite(amount)) continue;
            if (type === 'CREDIT_NOTE') { sales -= Math.abs(amount); continue; }
            sales += amount;
            orders += 1;
        }
        tenants[tenant.id] = {
            id: tenant.id,
            name: tenant.name,
            tenantId: tenant.id,
            tenantName: tenant.name,
            date: todayKey,
            currency: input.currency || 'EUR',
            sales: Math.round(sales * 100) / 100,
            orders,
        };
    }
    return { updatedAt: now.toISOString(), defaultTenantId: input.defaultTenantId, tenants };
}
