import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Bell, X } from 'lucide-react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { t } from '@invoice-monorepo/i18n';
import { brand, getPalette } from '../../theme/brand';
import { MobileHeader, MobileScreen } from '../../components/mobile/MobileUI';
import { dismissNotifications, loadNotifications, type AppNotification } from '../../services/notifications';

export function NotificationsScreen() {
    const { user } = useAuth();
    const { isDark, primaryColor, language } = useTheme();
    const palette = getPalette(isDark);
    const navigation = useNavigation<any>();
    const [items, setItems] = useState<AppNotification[] | null>(null);

    const load = useCallback(async () => {
        if (!user) return;
        try {
            setItems(await loadNotifications(user.id, { overdue: t('invoiceOverdueNotice', language), dueSoon: t('invoiceDueSoonNotice', language), bill: t('billDueNotice', language) }));
        } catch { setItems([]); }
    }, [language, user]);
    useFocusEffect(useCallback(() => { void load(); }, [load]));

    const clear = async (ids: string[]) => { await dismissNotifications(ids); setItems((current) => (current ?? []).filter((item) => !ids.includes(item.id))); };

    return <MobileScreen testID="notifications-screen">
        <MobileHeader title={t('notifications', language)} subtitle={`${t('needsAttention', language)} · ${t('nextSevenDays', language)}`} onBack={() => navigation.goBack()} />
        <ScrollView contentContainerStyle={styles.content}>
            {items === null ? <ActivityIndicator color={primaryColor} /> : items.length === 0 ? <Text style={[styles.empty, { color: palette.muted }]}>{t('allCaughtUp', language)}</Text> : <>
                {items.map((item) => <TouchableOpacity key={item.id} accessibilityRole="button" onPress={() => navigation.navigate(item.target.screen, 'params' in item.target ? item.target.params : undefined)} style={[styles.row, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                    <View style={[styles.icon, { backgroundColor: item.kind === 'invoice_overdue' ? `${brand.colors.error}18` : palette.iconSurface }]}><Bell size={18} color={item.kind === 'invoice_overdue' ? brand.colors.error : primaryColor} /></View>
                    <View style={styles.copy}><Text style={[styles.title, { color: palette.text }]}>{item.title}</Text><Text style={[styles.detail, { color: palette.muted }]} numberOfLines={1}>{item.detail}</Text></View>
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('clear', language)} hitSlop={10} onPress={() => void clear([item.id])}><X size={18} color={palette.muted} /></TouchableOpacity>
                </TouchableOpacity>)}
                <TouchableOpacity accessibilityRole="button" onPress={() => void clear(items.map((item) => item.id))} style={[styles.clear, { backgroundColor: palette.iconSurface }]} testID="notifications-clear"><Text style={[styles.clearText, { color: primaryColor }]}>{t('clearNotifications', language)}</Text></TouchableOpacity>
            </>}
        </ScrollView>
    </MobileScreen>;
}

const styles = StyleSheet.create({
    content: { padding: 20, paddingBottom: 110, gap: 10 },
    empty: { textAlign: 'center', marginTop: 40, fontSize: 14, fontFamily: brand.fonts.regular },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1 },
    icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    copy: { flex: 1, minWidth: 0 },
    title: { fontSize: 14, fontFamily: brand.fonts.semibold },
    detail: { fontSize: 12, marginTop: 2, fontFamily: brand.fonts.regular },
    clear: { minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
    clearText: { fontSize: 14, fontFamily: brand.fonts.semibold },
});
