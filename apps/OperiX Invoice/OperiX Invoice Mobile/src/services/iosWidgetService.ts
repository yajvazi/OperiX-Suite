import { Platform } from 'react-native';
import { ExtensionStorage } from '@bacons/apple-targets';
import { supabase } from '@invoice-monorepo/api';
import { activeLocalStore } from './localMode';
import { getWorkspaceScope, scopedResource } from './workspace';
import {
    buildDailySalesSnapshot,
    localDateKey,
    type DailySalesWidgetSnapshot,
    type DailySalesWidgetTenant,
    type WidgetInvoiceRow,
} from './dailySalesSnapshot';

export type { DailySalesWidgetSnapshot, DailySalesWidgetTenant, DailySalesWidgetTenantSales } from './dailySalesSnapshot';

export const OPERIX_WIDGET_APP_GROUP = 'group.com.lrdygroup.operixinvoice';
export const OPERIX_SALES_WIDGET_KIND = 'OperixSalesWidget';

const TENANTS_KEY = 'operix.widget.tenants';
const SNAPSHOT_KEY = 'operix.widget.sales.snapshot';
const MIN_REFRESH_GAP_MS = 20_000;

function isIOSWidgetRuntime() {
    return Platform.OS === 'ios';
}

/**
 * Writes a tenant-scoped, non-credentialed sales snapshot to the iOS App
 * Group and asks WidgetKit to refresh the widget timeline.
 */
export function syncDailySalesWidget(
    tenants: DailySalesWidgetTenant[],
    snapshot: DailySalesWidgetSnapshot,
) {
    if (!isIOSWidgetRuntime()) return;

    const storage = new ExtensionStorage(OPERIX_WIDGET_APP_GROUP);
    storage.set(TENANTS_KEY, JSON.stringify(tenants));
    storage.set(SNAPSHOT_KEY, JSON.stringify(snapshot));
    ExtensionStorage.reloadWidget(OPERIX_SALES_WIDGET_KIND);
}

/** Removes the stored numbers (for example on sign-out) so a widget never shows another account's sales. */
export function clearDailySalesWidget() {
    if (!isIOSWidgetRuntime()) return;
    try {
        const storage = new ExtensionStorage(OPERIX_WIDGET_APP_GROUP);
        storage.set(TENANTS_KEY, '[]');
        storage.set(SNAPSHOT_KEY, '');
        ExtensionStorage.reloadWidget(OPERIX_SALES_WIDGET_KIND);
    } catch (error) {
        console.warn('iOS sales widget clear unavailable:', error);
    }
}

let lastRefreshAt = 0;
let refreshing: Promise<void> | null = null;

/**
 * Reads today's invoices and updates the widget. Runs on its own, so the widget stays current without
 * opening the Dashboard: call it when the app opens, goes to the background, or after saving an invoice.
 */
export function refreshDailySalesWidget(userId: string, options: { force?: boolean } = {}): Promise<void> {
    if (!isIOSWidgetRuntime() || !userId) return Promise.resolve();
    if (refreshing) return refreshing;
    if (!options.force && Date.now() - lastRefreshAt < MIN_REFRESH_GAP_MS) return Promise.resolve();
    refreshing = (async () => {
        try {
            const scope = await getWorkspaceScope(userId);
            const todayKey = localDateKey(new Date());
            const local = await activeLocalStore();
            const rows = local
                ? (await local.listInvoices({ fullItems: false }) as WidgetInvoiceRow[])
                : ((await supabase
                    .from('invoices')
                    .select('company_id,issue_date,total_amount,status,document_type')
                    .or(scopedResource(userId, scope.companyIds))
                    .gte('issue_date', todayKey)
                    .limit(2000)).data || []) as WidgetInvoiceRow[];
            const tenants = scope.companyIds.map((companyId) => {
                const company = scope.companies.find((candidate) => candidate.id === companyId);
                return { id: companyId, name: company?.company_name || (companyId === scope.companyId ? scope.profile.company_name || 'OperiX tenant' : 'OperiX tenant') };
            });
            syncDailySalesWidget(tenants, buildDailySalesSnapshot({ rows, tenants, defaultTenantId: scope.companyId, currency: scope.profile.currency }));
            lastRefreshAt = Date.now();
        } catch (error) {
            console.warn('iOS sales widget refresh unavailable:', error);
        } finally {
            refreshing = null;
        }
    })();
    return refreshing;
}
