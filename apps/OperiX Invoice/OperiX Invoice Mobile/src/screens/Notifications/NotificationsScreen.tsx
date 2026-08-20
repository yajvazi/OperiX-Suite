import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AlertTriangle, Bell, Check, ChevronRight, Clock3, X } from 'lucide-react-native';
import { t } from '@invoice-monorepo/i18n';
import { useTheme } from '@invoice-monorepo/hooks';
import { OperixIconButton } from '@invoice-monorepo/ui';
import { MobileHeader, MobileScreen } from '../../components/mobile/MobileUI';
import type { RootStackParamList } from '../../navigation/types';
import {
    dismissIntelligenceNotification,
    listIntelligenceNotifications,
    markIntelligenceNotificationRead,
    type IntelligenceNotification,
} from '../../services/intelligence/operixIntelligence';
import { brand, getPalette } from '../../theme/brand';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'Notifications'> };

function isToday(value: string) {
    return value.slice(0, 10) === new Date().toISOString().slice(0, 10);
}

function priorityColor(priority: string) {
    return priority === 'important' ? brand.colors.error : priority === 'attention' ? brand.colors.warning : brand.colors.primary;
}

export function NotificationsScreen({ navigation }: Props) {
    const { isDark, language } = useTheme();
    const palette = getPalette(isDark);
    const [notifications, setNotifications] = useState<IntelligenceNotification[]>([]);
    const [resolved, setResolved] = useState<IntelligenceNotification[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [activeRows, resolvedRows] = await Promise.all([listIntelligenceNotifications(false), listIntelligenceNotifications(true)]);
            setNotifications(activeRows);
            setResolved(resolvedRows.filter((row) => Boolean(row.resolved_at || row.dismissed_at)));
        } catch (loadError) {
            console.error('OperiX Intelligence notifications error:', loadError);
            setError(t('operixIntelligenceNotificationsUnavailable', language));
        } finally {
            setLoading(false);
        }
    }, [language]);

    useFocusEffect(useCallback(() => { void load(); }, [load]));

    const openNotification = async (notification: IntelligenceNotification) => {
        try {
            if (!notification.read_at) {
                await markIntelligenceNotificationRead(notification.id);
                setNotifications((current) => current.map((row) => row.id === notification.id ? { ...row, read_at: new Date().toISOString() } : row));
            }
        } catch {
            // Navigation is still useful when marking a notification is unavailable.
        }
        const target = notification.target_type;
        if (target === 'invoice' && notification.target_id) navigation.navigate('InvoiceDetail', { invoiceId: notification.target_id });
        else if (target === 'customer' && notification.target_id) navigation.navigate('CustomerDetail', { clientId: notification.target_id });
        else if (target === 'product' && notification.target_id) navigation.navigate('ProductDetail', { productId: notification.target_id });
        else if (target === 'invoices') navigation.navigate('InvoicesList', notification.target_params?.status ? { status: notification.target_params.status } : undefined);
        else if (target === 'products') navigation.navigate('ProductsList');
        else if (target === 'expenses') navigation.navigate('ExpensesList');
        else if (target === 'payments') navigation.navigate('PaymentsList');
        else if (target === 'sales') navigation.navigate('ReportsHub');
        else if (target === 'notifications') navigation.navigate('OperixAI');
        else navigation.goBack();
    };

    const dismiss = async (notification: IntelligenceNotification) => {
        try {
            await dismissIntelligenceNotification(notification.id);
            setNotifications((current) => current.filter((row) => row.id !== notification.id));
        } catch {
            setError(t('operixIntelligenceNotificationsUnavailable', language));
        }
    };

    const renderRows = (rows: IntelligenceNotification[]) => rows.map((notification) => {
        const color = priorityColor(notification.priority);
        return <TouchableOpacity key={notification.id} accessibilityRole="button" onPress={() => void openNotification(notification)} style={[styles.row, { backgroundColor: palette.surface, borderColor: palette.border, opacity: notification.read_at ? 0.72 : 1 }]}>
            <View style={[styles.icon, { backgroundColor: `${color}18` }]}><AlertTriangle color={color} size={18} /></View>
            <View style={styles.copy}><View style={styles.titleLine}><Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>{notification.title}</Text>{!notification.read_at ? <View style={[styles.unread, { backgroundColor: palette.primary }]} /> : null}</View><Text style={[styles.body, { color: palette.muted }]}>{notification.body}</Text><Text style={[styles.date, { color: palette.muted }]}>{notification.created_at.slice(0, 10)}</Text></View>
            <View style={styles.rowActions}><OperixIconButton label={t('dismiss', language)} variant="ghost" size={30} onPress={() => void dismiss(notification)}><X color={palette.muted} size={15} /></OperixIconButton><ChevronRight color={palette.muted} size={17} /></View>
        </TouchableOpacity>;
    });

    const today = notifications.filter((notification) => isToday(notification.created_at));
    const earlier = notifications.filter((notification) => !isToday(notification.created_at));

    return <MobileScreen testID="notifications-screen">
        <MobileHeader title={t('notifications', language)} subtitle={t('operixIntelligenceNotificationsSubtitle', language)} onBack={() => navigation.goBack()} right={<OperixIconButton label={t('operixIntelligenceRefresh', language)} variant="ghost" onPress={() => void load()}><Clock3 color={palette.text} size={19} /></OperixIconButton>} />
        {loading ? <View style={styles.center}><ActivityIndicator color={palette.primary} size="small" /></View> : <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            {error ? <View style={[styles.error, { backgroundColor: palette.surfaceMuted }]}><Bell color={palette.warning} size={18} /><Text style={[styles.errorText, { color: palette.muted }]}>{error}</Text></View> : null}
            {today.length ? <View style={styles.section}><Text style={[styles.sectionTitle, { color: palette.text }]}>{t('operixIntelligenceNotificationsToday', language)}</Text>{renderRows(today)}</View> : null}
            {earlier.length ? <View style={styles.section}><Text style={[styles.sectionTitle, { color: palette.text }]}>{t('operixIntelligenceNotificationsEarlier', language)}</Text>{renderRows(earlier)}</View> : null}
            {resolved.length ? <View style={styles.section}><Text style={[styles.sectionTitle, { color: palette.text }]}>{t('operixIntelligenceNotificationsResolved', language)}</Text>{renderRows(resolved)}</View> : null}
            {!today.length && !earlier.length && !resolved.length ? <View style={styles.empty}><View style={[styles.emptyIcon, { backgroundColor: palette.iconSurface }]}><Check color={palette.primary} size={24} /></View><Text style={[styles.emptyTitle, { color: palette.text }]}>{t('operixIntelligenceNoNotifications', language)}</Text><Text style={[styles.emptyText, { color: palette.muted }]}>{t('operixIntelligenceNoNotificationsDescription', language)}</Text></View> : null}
            <View style={{ height: 80 }} />
        </ScrollView>}
    </MobileScreen>;
}

const styles = StyleSheet.create({
    content: { paddingHorizontal: 18, paddingBottom: 24 },
    center: { flex: 1, minHeight: 400, alignItems: 'center', justifyContent: 'center' },
    error: { minHeight: 52, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
    errorText: { flex: 1, fontSize: 12, lineHeight: 17, fontFamily: brand.fonts.regular },
    section: { marginBottom: 23 },
    sectionTitle: { fontSize: 16, fontFamily: brand.fonts.semibold, marginBottom: 10 },
    row: { minHeight: 82, borderWidth: 1, borderRadius: 17, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    icon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    copy: { flex: 1, minWidth: 0 },
    titleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    title: { flex: 1, fontSize: 13, fontFamily: brand.fonts.semibold },
    unread: { width: 6, height: 6, borderRadius: 3 },
    body: { fontSize: 11, lineHeight: 17, marginTop: 3, fontFamily: brand.fonts.regular },
    date: { fontSize: 10, marginTop: 4, fontFamily: brand.fonts.regular },
    rowActions: { alignItems: 'center', flexDirection: 'row', gap: 2 },
    empty: { minHeight: 420, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 26 },
    emptyIcon: { width: 58, height: 58, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    emptyTitle: { fontSize: 18, fontFamily: brand.fonts.semibold, textAlign: 'center' },
    emptyText: { fontSize: 13, lineHeight: 20, fontFamily: brand.fonts.regular, textAlign: 'center', marginTop: 7 },
});
