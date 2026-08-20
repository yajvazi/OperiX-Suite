import { supabase } from '@invoice-monorepo/api';
import { formatCurrency } from '@invoice-monorepo/i18n';
import { getAIIntelligenceCommentary, getAISettings, type AISettings } from '../ai/operixAi';
import { getActiveProductCompanyIds, getWorkspaceScope, getActiveTenantCompanyIds, scopedResource } from '../workspace';
import { mobileCacheKey, readMobileCache, writeMobileCache } from '../mobileCache';
import {
    buildIntelligenceSnapshot,
    intelligenceCommentaryPayload,
    localizeInsight,
    type IntelligenceAction,
    type IntelligenceCustomer,
    type IntelligenceExpense,
    type IntelligenceInvoice,
    type IntelligencePayment,
    type IntelligencePermissions,
    type IntelligenceProduct,
    type IntelligenceSnapshot,
} from './analytics';

const SNAPSHOT_CACHE_TTL_MS = 60_000;
const COMMENTARY_CACHE_TTL_MS = 6 * 60 * 60 * 1_000;
const MAX_ROWS = 5_000;

export type IntelligencePreferences = AISettings & {
    intelligence_enabled?: boolean;
    invoice_alerts_enabled?: boolean;
    customer_insights_enabled?: boolean;
    inventory_alerts_enabled?: boolean;
    sales_insights_enabled?: boolean;
    payment_alerts_enabled?: boolean;
    push_notifications_enabled?: boolean;
    show_amounts_in_notifications?: boolean;
};

export type IntelligenceNotification = {
    id: string;
    insight_key: string;
    category: string;
    priority: string;
    title: string;
    body: string;
    target_type?: IntelligenceAction['target'] | null;
    target_id?: string | null;
    target_params?: Record<string, string> | null;
    read_at?: string | null;
    dismissed_at?: string | null;
    resolved_at?: string | null;
    created_at: string;
    updated_at?: string;
};

type CacheEnvelope<T> = { generatedAt: number; value: T };

const defaultPreferences: IntelligencePreferences = {
    ai_enabled: true,
    preferred_language: 'auto',
    daily_briefing_enabled: true,
    history_enabled: true,
    intelligence_enabled: true,
    invoice_alerts_enabled: true,
    customer_insights_enabled: true,
    inventory_alerts_enabled: true,
    sales_insights_enabled: true,
    payment_alerts_enabled: true,
    push_notifications_enabled: true,
    show_amounts_in_notifications: true,
};

function hash(value: string) {
    let result = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        result ^= value.charCodeAt(index);
        result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(16);
}

async function hasAnyPermission(companyId: string, permissions: string[]) {
    const results = await Promise.all(permissions.map(async (permission) => {
        try {
            const result = await supabase.rpc('control_has_permission', { p_company_id: companyId, p_permission: permission });
            return !result.error && result.data === true;
        } catch {
            return false;
        }
    }));
    return results.some(Boolean);
}

export async function getIntelligencePermissions(companyId: string): Promise<IntelligencePermissions> {
    const [invoices, payments, customers, inventory, sales] = await Promise.all([
        hasAnyPermission(companyId, ['sales_invoice.view', 'invoice.view']),
        hasAnyPermission(companyId, ['customer.balance.view', 'payment.view', 'payments.view']),
        hasAnyPermission(companyId, ['customer.balance.view', 'customer.view']),
        hasAnyPermission(companyId, ['inventory.view', 'inventory.manage', 'products.manage']),
        hasAnyPermission(companyId, ['financial_reports.view', 'reports.view', 'report.read']),
    ]);
    return { invoices, payments, customers, inventory, sales };
}

async function readRows<T>(request: PromiseLike<{ data: unknown; error: { message?: string } | null }>) {
    const result = await request;
    if (result.error) throw new Error(result.error.message || 'OperiX data request failed.');
    return (result.data || []) as T[];
}

async function loadPreferences(language: 'en' | 'sq') {
    try {
        return { ...defaultPreferences, ...(await getAISettings(language)) } as IntelligencePreferences;
    } catch {
        return defaultPreferences;
    }
}

async function loadSnapshotRows(userId: string, companyIds: string[], productCompanyIds: string[], permissions: IntelligencePermissions) {
    const scope = scopedResource(userId, companyIds);
    const productScope = scopedResource(userId, productCompanyIds);
    const invoiceRequest = permissions.invoices || permissions.sales
        ? readRows<IntelligenceInvoice>(supabase.from('invoices')
            .select('id,invoice_number,issue_date,due_date,status,type,subtype,commercial_status,commercial_document_type,total_amount,amount_received,payment_status,currency,client_id,client:clients(id,name),items:invoice_items(id,product_id,description,quantity,unit)')
            .or(scope)
            .order('issue_date', { ascending: false })
            .limit(MAX_ROWS))
        : Promise.resolve([] as IntelligenceInvoice[]);
    const paymentRequest = permissions.payments
        ? readRows<IntelligencePayment>(supabase.from('payments')
            .select('id,client_id,invoice_id,amount,payment_date,payment_method')
            .or(scope)
            .order('payment_date', { ascending: false })
            .limit(MAX_ROWS))
        : Promise.resolve([] as IntelligencePayment[]);
    const customerRequest = permissions.customers
        ? readRows<IntelligenceCustomer>(supabase.from('clients').select('id,name').or(scope).order('name').limit(MAX_ROWS))
        : Promise.resolve([] as IntelligenceCustomer[]);
    const productRequest = permissions.inventory
        ? readRows<IntelligenceProduct>(supabase.from('products').select('id,name,unit,track_stock,stock_quantity,low_stock_threshold').or(productScope).order('name').limit(MAX_ROWS))
        : Promise.resolve([] as IntelligenceProduct[]);
    const expenseRequest = permissions.sales
        // Expense schemas differ between legacy receipt deployments and the
        // accounting schema. Keep Intelligence dependent only on shared
        // columns; supplier-specific duplicate detection remains optional.
        ? readRows<IntelligenceExpense>(supabase.from('expenses').select('id,amount,date,category,description').or(scope).order('date', { ascending: false }).limit(MAX_ROWS))
        : Promise.resolve([] as IntelligenceExpense[]);
    return Promise.all([invoiceRequest, paymentRequest, customerRequest, productRequest, expenseRequest]);
}

function snapshotCacheKey(userId: string, companyIds: string[], language: string, currency: string) {
    return mobileCacheKey('intelligence', userId, companyIds, `${language}:${currency}`);
}

function commentaryCacheKey(userId: string, companyIds: string[], locale: string, fingerprint: string) {
    return mobileCacheKey('intelligence-commentary', userId, companyIds, `${locale}:${hash(fingerprint)}`);
}

async function cachedCommentary(userId: string, companyIds: string[], locale: 'en' | 'sq', snapshot: IntelligenceSnapshot) {
    const key = commentaryCacheKey(userId, companyIds, locale, snapshot.fingerprint);
    const cached = await readMobileCache<CacheEnvelope<string>>(key);
    if (cached && Date.now() - cached.generatedAt < COMMENTARY_CACHE_TTL_MS && cached.value) return cached.value;
    try {
        const response = await getAIIntelligenceCommentary({
            locale,
            fingerprint: hash(snapshot.fingerprint),
            metrics: intelligenceCommentaryPayload(snapshot),
        });
        if (response.commentary) writeMobileCache(key, { generatedAt: Date.now(), value: response.commentary });
        return response.commentary || null;
    } catch {
        return null;
    }
}

function insightCategoryEnabled(preferences: IntelligencePreferences, category: string) {
    if (category === 'invoice') return preferences.invoice_alerts_enabled !== false;
    if (category === 'customer') return preferences.customer_insights_enabled !== false;
    if (category === 'inventory') return preferences.inventory_alerts_enabled !== false;
    if (category === 'sales') return preferences.sales_insights_enabled !== false;
    if (category === 'payment') return preferences.payment_alerts_enabled !== false;
    return true;
}

function hideNotificationAmount(detail: string, insight: { amount?: number; category?: string }, locale: 'en' | 'sq') {
    if (insight.amount === undefined || !Number.isFinite(insight.amount) || !['invoice', 'customer', 'payment', 'duplicate', 'sales'].includes(String(insight.category || ''))) return detail;
    const rawAmount = String(insight.amount);
    const escapedAmount = rawAmount.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return detail.replace(new RegExp(`\\b${escapedAmount}\\b`, 'g'), locale === 'sq' ? 'një shumë' : 'an amount');
}

export async function syncIntelligenceNotifications(snapshot: IntelligenceSnapshot, preferences: IntelligencePreferences, userId: string, companyId: string, locale: 'en' | 'sq' = 'en') {
    if (preferences.intelligence_enabled === false) return;
    const candidateInsights = [...new Map([...snapshot.insights, ...snapshot.invoice.insights].map((insight) => [insight.key, insight])).values()];
    const insights = candidateInsights.filter((insight) => insight.priority !== 'info' && insightCategoryEnabled(preferences, insight.category)).sort((left, right) => right.score - left.score).slice(0, 6);
    const amount = (value: number) => preferences.show_amounts_in_notifications === false ? (locale === 'sq' ? 'një shumë' : 'an amount') : formatCurrency(value, snapshot.currency, locale);
    const briefingAvailable = snapshot.hasData && preferences.daily_briefing_enabled !== false && Boolean(snapshot.briefing.revenue || snapshot.briefing.paymentsReceived || snapshot.briefing.invoicesIssued || snapshot.briefing.overdueCount || snapshot.inventory.lowStock.length);
    const briefingRow = briefingAvailable ? {
        user_id: userId,
        company_id: companyId,
        insight_key: `briefing:${snapshot.asOf}`,
        category: 'sales',
        priority: 'info',
        title: 'OperiX AI',
        body: locale === 'sq'
            ? `Dje: ${amount(snapshot.briefing.revenue)} faturuar · ${amount(snapshot.briefing.paymentsReceived)} mbledhur · ${snapshot.briefing.overdueCount} fatura kërkojnë vëmendje.`
            : `Yesterday: ${amount(snapshot.briefing.revenue)} invoiced · ${amount(snapshot.briefing.paymentsReceived)} collected · ${snapshot.briefing.overdueCount} invoices need attention.`,
        target_type: 'notifications' as const,
        target_id: null,
        target_params: {},
        last_surfaced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    } : null;
    const rows = [
        ...(briefingRow ? [briefingRow] : []),
        ...insights.map((insight) => {
            const localized = localizeInsight(insight, locale);
            return {
                user_id: userId,
                company_id: companyId,
                insight_key: insight.key,
                category: insight.category,
                priority: insight.priority,
                title: localized.title,
                body: preferences.show_amounts_in_notifications === false ? hideNotificationAmount(localized.detail, { ...insight.action, amount: insight.amount, category: insight.category }, locale) : localized.detail,
                target_type: insight.action.target,
                target_id: insight.action.id || null,
                target_params: insight.action.params || {},
                last_surfaced_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
        }),
    ];
    try {
        const existing = await supabase.from('operix_intelligence_notifications')
            .select('id,insight_key')
            .eq('user_id', userId)
            .eq('company_id', companyId)
            .is('resolved_at', null)
            .is('dismissed_at', null);
        const activeKeys = new Set(rows.map((row) => row.insight_key));
        const stale = (existing.data || []).filter((row: { id?: string; insight_key?: string }) => row.id && row.insight_key && !activeKeys.has(row.insight_key));
        await Promise.all(stale.map((row: { id?: string }) => supabase.from('operix_intelligence_notifications').update({ resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', row.id)));
        if (rows.length) await supabase.from('operix_intelligence_notifications').upsert(rows, { onConflict: 'user_id,company_id,insight_key', ignoreDuplicates: false });
    } catch {
        // The dashboard remains useful when the optional notification migration is not installed yet.
    }
}

export async function getIntelligenceSnapshot(options: { locale?: 'en' | 'sq'; forceRefresh?: boolean } = {}) {
    const locale = options.locale || 'en';
    const workspace = await getWorkspaceScope((await supabase.auth.getUser()).data.user?.id || '');
    const userId = workspace.profile.id;
    const tenantCompanyIds = getActiveTenantCompanyIds(workspace);
    const productCompanyIds = getActiveProductCompanyIds(workspace);
    const workspaceCurrency = workspace.company?.currency || workspace.profile.currency || 'EUR';
    const cacheKey = snapshotCacheKey(userId, tenantCompanyIds, locale, workspaceCurrency);
    if (!options.forceRefresh) {
        const cached = await readMobileCache<CacheEnvelope<IntelligenceSnapshot>>(cacheKey);
        if (cached && Date.now() - cached.generatedAt < SNAPSHOT_CACHE_TTL_MS) return cached.value;
    }
    const [permissions, preferences] = await Promise.all([
        getIntelligencePermissions(workspace.companyId),
        loadPreferences(locale),
    ]);
    const [invoices, payments, customers, products, expenses] = await loadSnapshotRows(workspace.profile.id, tenantCompanyIds, productCompanyIds, permissions);
    const snapshot = buildIntelligenceSnapshot({
        invoices: permissions.customers ? invoices : invoices.map((invoice) => ({ ...invoice, client: null })),
        payments: permissions.payments ? payments : [],
        customers,
        products,
        expenses,
        currency: workspaceCurrency,
        permissions,
    });
    if (preferences.ai_enabled !== false && preferences.intelligence_enabled !== false && preferences.daily_briefing_enabled !== false && snapshot.hasData && snapshot.insights.length) {
        snapshot.commentary = await cachedCommentary(userId, tenantCompanyIds, locale, snapshot) || undefined;
        snapshot.commentarySource = snapshot.commentary ? 'ai' : 'deterministic';
    } else {
        snapshot.commentarySource = 'deterministic';
    }
    writeMobileCache(cacheKey, { generatedAt: Date.now(), value: snapshot });
    void syncIntelligenceNotifications(snapshot, preferences, userId, workspace.companyId, locale);
    return snapshot;
}

async function notificationScope() {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) throw new Error('Authentication required.');
    const workspace = await getWorkspaceScope(userId);
    return { userId, workspace };
}

function isNotificationTableUnavailable(error: { code?: string; message?: string } | null) {
    const message = String(error?.message || '').toLowerCase();
    return error?.code === 'PGRST205'
        || (message.includes('operix_intelligence_notifications') && (message.includes('schema cache') || message.includes('relation') || message.includes('table')));
}

export async function listIntelligenceNotifications(includeResolved = false) {
    const { userId, workspace } = await notificationScope();
    let query = supabase.from('operix_intelligence_notifications')
        .select('id,insight_key,category,priority,title,body,target_type,target_id,target_params,read_at,dismissed_at,resolved_at,created_at,updated_at')
        .eq('user_id', userId)
        .in('company_id', getActiveTenantCompanyIds(workspace))
        .order('created_at', { ascending: false })
        .limit(100);
    if (!includeResolved) query = query.is('resolved_at', null).is('dismissed_at', null);
    const result = await query;
    if (result.error) {
        if (isNotificationTableUnavailable(result.error)) return [];
        throw result.error;
    }
    return (result.data || []) as IntelligenceNotification[];
}

export async function markIntelligenceNotificationRead(notificationId: string) {
    const { userId, workspace } = await notificationScope();
    const result = await supabase.from('operix_intelligence_notifications')
        .update({ read_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', notificationId)
        .eq('user_id', userId)
        .in('company_id', getActiveTenantCompanyIds(workspace));
    if (result.error && !isNotificationTableUnavailable(result.error)) throw result.error;
}

export async function dismissIntelligenceNotification(notificationId: string) {
    const { userId, workspace } = await notificationScope();
    const result = await supabase.from('operix_intelligence_notifications')
        .update({ dismissed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', notificationId)
        .eq('user_id', userId)
        .in('company_id', getActiveTenantCompanyIds(workspace));
    if (result.error && !isNotificationTableUnavailable(result.error)) throw result.error;
}
