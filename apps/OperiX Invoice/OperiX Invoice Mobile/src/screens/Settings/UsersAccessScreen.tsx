import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { ExternalLink, Mail, RefreshCw, ShieldCheck, UserRound } from 'lucide-react-native';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { formatBillingAmount, BILLING_CURRENCY } from '@invoice-monorepo/billing';
import { supabase } from '@invoice-monorepo/api';
import { brand, getPalette } from '../../theme/brand';
import { getWorkspaceScope } from '../../services/workspace';
import { t, type TranslationKey } from '@invoice-monorepo/i18n';
import { MobileHeader, MobileScreen } from '../../components/mobile/MobileUI';

type UserAccessRow = { membership_id: string | null; email?: string | null; first_name?: string | null; last_name?: string | null; status?: string | null; role_name?: string | null; billing_status?: string | null; is_company_owner?: boolean };
type UserAccessBilling = { status: string; billing_interval?: string | null; total_users: number; included_users: number; billable_users: number; estimated_monthly_total: string; estimated_annual_total: string; additional_user_monthly: string; additional_user_annual: string; trial_days_remaining?: number };

function displayName(row: UserAccessRow, language: string) { return [row.first_name, row.last_name].filter(Boolean).join(' ') || row.email || t('uaCompanyUser', language); }
const STATUS_KEYS: Record<string, TranslationKey> = { active: 'active', suspended: 'statusSuspended', invited: 'statusInvited', trialing: 'statusTrialing', past_due: 'statusPastDue', canceled: 'statusCanceled', cancelled: 'statusCanceled', pending: 'statusPending', expired: 'statusExpired' };
function label(value: string | null | undefined, language: string) {
    const status = String(value || 'active').toLowerCase();
    return STATUS_KEYS[status] ? t(STATUS_KEYS[status], language) : status.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

export function UsersAccessScreen({ navigation }: any) {
    const { user } = useAuth();
    const { isDark, primaryColor, language } = useTheme();
    const palette = getPalette(isDark);
    const [rows, setRows] = useState<UserAccessRow[]>([]);
    const [billing, setBilling] = useState<UserAccessBilling | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [allowed, setAllowed] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async (refresh = false) => {
        if (!user?.id) return;
        if (refresh) setRefreshing(true); else setLoading(true);
        setError('');
        try {
            const scope = await getWorkspaceScope(user.id);
            const canManage = scope.platformAdmin || scope.permissions.includes('users.manage');
            setAllowed(canManage);
            if (!canManage) return;
            const [membersResult, billingResult] = await Promise.all([
                supabase.rpc('rbac_list_users_access', { p_company_id: scope.companyId }),
                supabase.rpc('rbac_get_users_access_billing_summary', { p_company_id: scope.companyId }),
            ]);
            if (membersResult.error) throw membersResult.error;
            if (billingResult.error) throw billingResult.error;
            setRows((membersResult.data || []) as UserAccessRow[]);
            setBilling((Array.isArray(billingResult.data) ? billingResult.data[0] : billingResult.data) as UserAccessBilling);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : t('uaLoadError', language));
        } finally {
            setLoading(false); setRefreshing(false);
        }
    }, [language, user?.id]);

    useEffect(() => { void load(); }, [load]);

    function openWebUsers() {
        const configured = process.env.EXPO_PUBLIC_INVOICE_BILLING_URL?.trim() || 'https://invoice.operixsuite.com/settings?tab=users-access';
        const url = configured.includes('tab=') ? configured.replace(/tab=[^&]*/, 'tab=users-access') : `${configured}${configured.includes('?') ? '&' : '?'}tab=users-access`;
        void WebBrowser.openBrowserAsync(url);
    }

    return <MobileScreen testID="users-access-screen">
        <MobileHeader title={t('uaTitle', language)} subtitle={t('uaSubtitle', language)} onBack={() => navigation.goBack()} />
        <ScrollView keyboardShouldPersistTaps="handled" style={styles.flex} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={primaryColor} />}>
            {loading ? <View style={styles.center}><ActivityIndicator color={primaryColor} /><Text style={[styles.muted, { color: palette.muted }]}>{t('uaLoading', language)}</Text></View> : null}
            {!loading && !allowed ? <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}><ShieldCheck color={primaryColor} size={24} /><Text style={[styles.title, { color: palette.text }]}>{t('uaRestricted', language)}</Text><Text style={[styles.muted, { color: palette.muted }]}>{t('uaRestrictedBody', language)}</Text></View> : null}
            {!loading && allowed && error ? <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}><Text style={[styles.title, { color: palette.text }]}>{t('uaUnavailable', language)}</Text><Text style={[styles.muted, { color: palette.muted }]}>{error}</Text><TouchableOpacity onPress={() => void load()} style={[styles.primaryButton, { backgroundColor: primaryColor }]}><RefreshCw color="#fff" size={16} /><Text style={styles.primaryButtonText}>{t('retry', language)}</Text></TouchableOpacity></View> : null}
            {!loading && allowed && !error && billing ? <>
                <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}><View style={styles.row}><View style={[styles.iconBox, { backgroundColor: `${primaryColor}18` }]}><UserRound color={primaryColor} size={21} /></View><View style={styles.grow}><Text style={[styles.eyebrow, { color: palette.muted }]}>{t('uaCompanyTeam', language)}</Text><Text style={[styles.title, { color: palette.text }]}>{t('uaUserCount', language).replace('{count}', String(billing.total_users))}</Text><Text style={[styles.muted, { color: palette.muted }]}>{t('uaIncluded', language).replace('{included}', String(billing.included_users)).replace('{paid}', String(billing.billable_users))}</Text></View><Text style={[styles.badge, { color: primaryColor, backgroundColor: `${primaryColor}15` }]}>{label(billing.status, language)}</Text></View><View style={styles.grid}><Metric label={t('uaAdditionalUsers', language)} value={String(billing.billable_users)} palette={palette} /><Metric label={t('uaMonthlyEstimate', language)} value={formatBillingAmount(billing.estimated_monthly_total, BILLING_CURRENCY)} palette={palette} /></View>{billing.status === 'trialing' ? <Text style={[styles.notice, { color: primaryColor, borderColor: `${primaryColor}35`, backgroundColor: `${primaryColor}08` }]}>{t('uaTrialNote', language).replace('{days}', String(billing.trial_days_remaining || 0))}</Text> : null}</View>
                <TouchableOpacity onPress={openWebUsers} style={[styles.primaryButton, { backgroundColor: primaryColor }]}><ExternalLink color="#fff" size={17} /><Text style={styles.primaryButtonText}>{t('uaManageWeb', language)}</Text></TouchableOpacity>
                <Text style={[styles.section, { color: palette.text }]}>{t('uaUsers', language)}</Text>
                <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>{rows.map((row) => <View key={`${row.membership_id || row.email}`} style={[styles.userRow, { borderBottomColor: palette.border }]}><View style={[styles.avatar, { backgroundColor: `${primaryColor}18` }]}><Text style={[styles.avatarText, { color: primaryColor }]}>{displayName(row, language).slice(0, 1).toUpperCase()}</Text></View><View style={styles.grow}><Text style={[styles.userName, { color: palette.text }]}>{displayName(row, language)}</Text><Text style={[styles.muted, { color: palette.muted }]}>{row.email || t('uaInvitationPending', language)} · {row.role_name || t('uaEmployee', language)}</Text></View><Text style={[styles.status, { color: row.status === 'suspended' ? '#B54708' : '#027A48' }]}>{label(row.status, language)}</Text></View>)}</View>
                <Text style={[styles.footnote, { color: palette.muted }]}><Mail color={palette.muted} size={14} /> {t('uaFootnote', language)}</Text>
                <Text style={[styles.muted, { color: palette.muted, textAlign: 'center' }]}>{t('uaAnnualEstimate', language).replace('{amount}', formatBillingAmount(billing.estimated_annual_total, BILLING_CURRENCY))}</Text>
            </> : null}
        </ScrollView>
    </MobileScreen>;
}

function Metric({ label: metricLabel, value, palette }: { label: string; value: string; palette: ReturnType<typeof getPalette> }) { return <View style={[styles.metric, { backgroundColor: palette.surfaceMuted }]}><Text style={[styles.muted, { color: palette.muted }]}>{metricLabel}</Text><Text style={[styles.metricValue, { color: palette.text }]}>{value}</Text></View>; }

const styles = StyleSheet.create({ flex: { flex: 1 }, content: { padding: 20, paddingBottom: 110 }, center: { alignItems: 'center', justifyContent: 'center', padding: 40, gap: 10 }, card: { padding: 16, borderRadius: 18, borderWidth: 1, marginBottom: 12, ...brand.shadow.card }, row: { flexDirection: 'row', alignItems: 'center', gap: 11 }, grow: { flex: 1, minWidth: 0 }, iconBox: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' }, avatarText: { fontSize: 12, fontFamily: brand.fonts.semibold }, eyebrow: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.7, fontFamily: brand.fonts.semibold }, title: { fontSize: 16, marginTop: 4, fontFamily: brand.fonts.semibold }, muted: { fontSize: 11, lineHeight: 17, fontFamily: brand.fonts.regular }, badge: { fontSize: 10, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 99, overflow: 'hidden', fontFamily: brand.fonts.semibold }, grid: { flexDirection: 'row', gap: 10, marginTop: 16 }, metric: { flex: 1, padding: 12, borderRadius: 13 }, metricValue: { fontSize: 17, marginTop: 4, fontFamily: brand.fonts.semibold }, notice: { marginTop: 16, padding: 11, borderRadius: 12, borderWidth: 1, fontSize: 11, lineHeight: 17, fontFamily: brand.fonts.regular }, primaryButton: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginBottom: 15 }, primaryButtonText: { color: '#fff', fontSize: 13, fontFamily: brand.fonts.semibold }, section: { fontSize: 14, marginBottom: 10, fontFamily: brand.fonts.semibold }, userRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth }, userName: { fontSize: 12, fontFamily: brand.fonts.semibold }, status: { fontSize: 10, fontFamily: brand.fonts.semibold }, footnote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 4, fontSize: 10, lineHeight: 15, marginVertical: 5, fontFamily: brand.fonts.regular } });
