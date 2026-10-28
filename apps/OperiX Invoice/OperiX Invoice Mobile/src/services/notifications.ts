import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDataStore } from './dataStore';

export interface AppNotification {
    id: string;
    kind: 'invoice_overdue' | 'invoice_due' | 'bill_due' | 'low_stock';
    title: string;
    detail: string;
    /** Screen to open, with its params. */
    target: { screen: 'InvoiceDetail'; params: { invoiceId: string } } | { screen: 'SupplierBillsList' };
}

const DISMISSED_KEY = 'operix.dismissedNotifications';
const DAY = 86_400_000;

async function dismissedIds(): Promise<Set<string>> {
    try { return new Set<string>(JSON.parse((await AsyncStorage.getItem(DISMISSED_KEY)) || '[]')); } catch { return new Set(); }
}

export async function dismissNotifications(ids: string[]) {
    try { const current = await dismissedIds(); ids.forEach((id) => current.add(id)); await AsyncStorage.setItem(DISMISSED_KEY, JSON.stringify([...current].slice(-500))); } catch { /* the list simply reappears */ }
}

/** Unpaid invoices and supplier bills that are overdue or due within a week. Works on the device and in the cloud. */
export async function loadNotifications(userId: string, labels: { overdue: string; dueSoon: string; bill: string }): Promise<AppNotification[]> {
    const store = await getDataStore(userId);
    const dismissed = await dismissedIds();
    const now = Date.now();
    const end = now + 7 * DAY;
    const out: AppNotification[] = [];
    const invoices = await store.listInvoices({ documentType: 'INVOICE', limit: 200 });
    for (const invoice of invoices) {
        if (!invoice.due_date || ['paid', 'cancelled', 'draft', 'credited', 'reversed'].includes(String(invoice.status))) continue;
        const due = new Date(String(invoice.due_date)).getTime();
        if (!(due <= end)) continue;
        const id = `invoice:${invoice.id}`;
        if (dismissed.has(id)) continue;
        out.push({ id, kind: due < now ? 'invoice_overdue' : 'invoice_due', title: due < now ? labels.overdue : labels.dueSoon, detail: `${invoice.invoice_number ?? ''} · ${(invoice.client as { name?: string } | null)?.name ?? ''}`.trim(), target: { screen: 'InvoiceDetail', params: { invoiceId: String(invoice.id) } } });
    }
    try {
        for (const bill of await store.list('supplier_bills', { limit: 200 })) {
            if (!bill.due_date || ['paid', 'cancelled', 'draft'].includes(String(bill.status))) continue;
            if (new Date(String(bill.due_date)).getTime() > end) continue;
            const id = `bill:${bill.id}`;
            if (dismissed.has(id)) continue;
            out.push({ id, kind: 'bill_due', title: labels.bill, detail: String(bill.bill_number ?? ''), target: { screen: 'SupplierBillsList' } });
        }
    } catch { /* supplier bills are optional for the alert list */ }
    return out.sort((a, b) => (a.kind === 'invoice_overdue' ? 0 : 1) - (b.kind === 'invoice_overdue' ? 0 : 1));
}
