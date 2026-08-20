import { Platform } from 'react-native';
import { ExtensionStorage } from '@bacons/apple-targets';

export const OPERIX_WIDGET_APP_GROUP = 'group.com.lrdygroup.operixinvoice';
export const OPERIX_SALES_WIDGET_KIND = 'OperixSalesWidget';

const TENANTS_KEY = 'operix.widget.tenants';
const SNAPSHOT_KEY = 'operix.widget.sales.snapshot';

export interface DailySalesWidgetTenant {
    id: string;
    name: string;
}

export interface DailySalesWidgetTenantSales extends DailySalesWidgetTenant {
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
