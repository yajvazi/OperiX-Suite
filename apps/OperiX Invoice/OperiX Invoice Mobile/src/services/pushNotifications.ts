import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '@invoice-monorepo/api';
import { getWorkspaceScope } from './workspace';

if (Platform.OS !== 'web') {
    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
        }),
    });
}

function expoProjectId() {
    return Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
}

function notificationPermissionGranted(permission: Notifications.NotificationPermissionsStatus) {
    return ('granted' in permission && permission.granted === true)
        || ('status' in permission && permission.status === 'granted');
}

export async function registerPushNotifications(userId: string, language: string = 'en') {
    if (Platform.OS === 'web' || !Device.isDevice) return false;

    let permission = await Notifications.getPermissionsAsync();
    if (!notificationPermissionGranted(permission)) permission = await Notifications.requestPermissionsAsync();
    if (!notificationPermissionGranted(permission)) return false;

    const projectId = expoProjectId();
    if (!projectId) throw new Error('Expo push notification project ID is not configured.');
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    if (!token) return false;

    const scope = await getWorkspaceScope(userId);
    const companyIds = Array.from(new Set([scope.companyId, ...scope.companyIds].filter(Boolean)));
    if (!companyIds.length) return false;

    const rows = companyIds.map((companyId) => ({
        user_id: userId,
        company_id: companyId,
        expo_push_token: token,
        platform: Platform.OS,
        language: language === 'sq' ? 'sq' : 'en',
        is_active: true,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('operix_push_device_tokens').upsert(rows, {
        onConflict: 'user_id,company_id,expo_push_token',
    });
    if (error) throw error;

    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.DEFAULT,
        });
    }
    return true;
}

/** Where a tapped notification should go: the link the server put in the message (an operix-invoice://open/... address). */
export function notificationLink(response: Notifications.NotificationResponse | null | undefined): string | null {
    const data = response?.notification?.request?.content?.data as { url?: unknown } | undefined;
    const url = typeof data?.url === 'string' ? data.url : '';
    return url.startsWith('operix-invoice://open/') ? url : null;
}

export async function deactivatePushNotifications(userId: string) {
    if (Platform.OS === 'web') return;
    await supabase
        .from('operix_push_device_tokens')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
}

export async function notifyInvoiceCreated(invoiceId: string, companyId: string) {
    return notifyBusinessEvent('invoice_created', companyId, invoiceId);
}

export type BusinessNotificationEvent =
    | 'invoice_created'
    | 'invoice_updated'
    | 'invoice_cancelled'
    | 'invoice_paid'
    | 'payment_received'
    | 'expense_created'
    | 'expense_approved'
    | 'money_transferred'
    | 'shared_bank_activity'
    | 'member_added'
    | 'payment_failed'
    | 'sync_failed'
    | 'approval_requested';

export async function notifyBusinessEvent(
    eventType: BusinessNotificationEvent,
    companyId: string,
    entityId?: string | null,
    metadata?: Record<string, unknown>,
) {
    const { data, error } = await supabase.functions.invoke('business-notification', {
        body: { eventType, companyId, entityId: entityId || null, metadata: metadata || {} },
    });
    if (error) throw error;
    return data as { sent?: number; recipients?: number };
}
