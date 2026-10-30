import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from '@invoice-monorepo/api';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { brand, getPalette } from '../../theme/brand';
import { MobileHeader, MobileScreen } from '../../components/mobile/MobileUI';
import { registerPushNotifications } from '../../services/pushNotifications';

const categories = [
    { key: 'invoices', en: ['Invoices', 'When someone issues, cancels or fully collects an invoice'], sq: ['Faturat', 'Kur dikush lëshon, anulon ose arkëton plotësisht një faturë'] },
    { key: 'payments', en: ['Payments', 'When someone records a payment from a customer'], sq: ['Pagesat', 'Kur dikush regjistron një pagesë nga një klient'] },
    { key: 'expenses', en: ['Expenses and approvals', 'New expenses, and approval requests'], sq: ['Shpenzimet dhe aprovimet', 'Shpenzime të reja dhe kërkesa për aprovim'] },
    { key: 'stock', en: ['Low stock', 'When a product runs low'], sq: ['Stoku i ulët', 'Kur një produkt po mbaron'] },
    { key: 'money', en: ['Money transfers', 'When money moves between cash, bank and card accounts'], sq: ['Transferet e parasë', 'Kur paratë lëvizin mes arkës, bankës dhe kartës'] },
    { key: 'team', en: ['Team', 'When a new member joins'], sq: ['Ekipi', 'Kur bashkohet një anëtar i ri'] },
    { key: 'billing', en: ['Billing', 'Subscription payments and status'], sq: ['Faturimi', 'Pagesat dhe statusi i abonimit'] },
] as const;

/** Which notifications this person receives from the rest of their workspace. All are on unless switched off here. */
export function NotificationSettingsScreen({ navigation }: any) {
    const { user } = useAuth();
    const { isDark, primaryColor, language } = useTheme();
    const palette = getPalette(isDark);
    const sq = language === 'sq';
    const [enabled, setEnabled] = useState<Record<string, boolean>>({});
    const [loading, setLoading] = useState(true);
    const [permission, setPermission] = useState<'granted' | 'denied' | 'unknown'>('unknown');
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        if (!user?.id) return;
        setLoading(true);
        try {
            const { data } = await supabase.from('notification_preferences').select('category,enabled').eq('user_id', user.id);
            const next: Record<string, boolean> = {};
            categories.forEach((item) => { next[item.key] = true; });
            (data || []).forEach((row: { category: string; enabled: boolean }) => { next[row.category] = row.enabled; });
            setEnabled(next);
            const status = await Notifications.getPermissionsAsync();
            setPermission(status.granted ? 'granted' : status.canAskAgain ? 'unknown' : 'denied');
        } catch {
            setError(sq ? 'Cilësimet nuk u ngarkuan.' : 'Settings could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, [user?.id, sq]);
    useEffect(() => { void load(); }, [load]);

    const toggle = async (key: string, value: boolean) => {
        if (!user?.id) return;
        setEnabled((current) => ({ ...current, [key]: value }));
        setError('');
        const { error: failure } = await supabase.from('notification_preferences').upsert({ user_id: user.id, category: key, enabled: value, updated_at: new Date().toISOString() }, { onConflict: 'user_id,category' });
        if (failure) {
            setEnabled((current) => ({ ...current, [key]: !value }));
            setError(sq ? 'Ndryshimi nuk u ruajt.' : 'The change could not be saved.');
        }
    };

    const enableOnThisPhone = async () => {
        if (!user?.id) return;
        await registerPushNotifications(user.id, language).catch(() => false);
        await load();
    };

    return (
        <MobileScreen testID="notification-settings-screen">
            <MobileHeader title={sq ? 'Njoftimet' : 'Notifications'} subtitle={sq ? 'Çfarë dëshironi të merrni nga ekipi' : 'What you get from your team'} onBack={() => navigation.goBack()} />
            <ScrollView contentContainerStyle={styles.content}>
                {permission !== 'granted' ? (
                    <View style={[styles.notice, { borderColor: '#FEDF89', backgroundColor: '#FFFAEB' }]}>
                        <Text style={[styles.noticeText, { color: '#7A2E0B' }]}>{sq ? 'Njoftimet janë të çaktivizuara në këtë telefon.' : 'Notifications are turned off on this phone.'}</Text>
                        <TouchableOpacity accessibilityRole="button" onPress={() => (permission === 'denied' ? void Linking.openSettings() : void enableOnThisPhone())} style={[styles.noticeButton, { backgroundColor: primaryColor }]}>
                            <Text style={styles.noticeButtonText}>{permission === 'denied' ? (sq ? 'Hap cilësimet e telefonit' : 'Open phone settings') : (sq ? 'Aktivizo' : 'Turn on')}</Text>
                        </TouchableOpacity>
                    </View>
                ) : null}
                {loading ? <ActivityIndicator color={primaryColor} style={{ marginTop: 24 }} /> : categories.map((item) => {
                    const [title, text] = sq ? item.sq : item.en;
                    return (
                        <View key={item.key} style={[styles.row, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
                                <Text style={[styles.text, { color: palette.muted }]}>{text}</Text>
                            </View>
                            <Switch testID={`notification-${item.key}-switch`} value={enabled[item.key] !== false} onValueChange={(value) => void toggle(item.key, value)} trackColor={{ true: primaryColor }} />
                        </View>
                    );
                })}
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <Text style={[styles.footnote, { color: palette.muted }]}>
                    {sq ? 'Ju njoftoheni vetëm për ndryshimet e njerëzve të tjerë, jo për ato që bëni vetë. Shihni vetëm njoftimet për të dhënat që keni të drejtë t\'i shihni.' : 'You are only told about other people\'s changes, never your own. You only get notifications about data you are allowed to see.'}
                </Text>
            </ScrollView>
        </MobileScreen>
    );
}

const styles = StyleSheet.create({
    content: { paddingHorizontal: 20, paddingBottom: 110, gap: 10 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1, borderRadius: 16 },
    title: { fontSize: 14, fontWeight: '800' },
    text: { marginTop: 3, fontSize: 11, lineHeight: 16 },
    notice: { padding: 14, borderWidth: 1, borderRadius: 14, gap: 10 },
    noticeText: { fontSize: 12, lineHeight: 18 },
    noticeButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
    noticeButtonText: { color: '#fff', fontWeight: '800', fontSize: 13 },
    error: { color: brand.colors.error, fontSize: 12 },
    footnote: { marginTop: 8, fontSize: 11, lineHeight: 16 },
});
