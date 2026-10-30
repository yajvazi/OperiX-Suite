import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { AlertTriangle, Check, CreditCard, ExternalLink, Users } from 'lucide-react-native';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { calculateSubscriptionPrice, formatBillingAmount, BILLING_CURRENCY } from '@invoice-monorepo/billing';
import { brand, getPalette } from '../../theme/brand';
import { getWorkspaceScope } from '../../services/workspace';
import { createBillingPortal, createSubscriptionCheckout, getInvoiceBillingSummary, type MobileInvoiceBillingSummary } from '../../services/billingService';
import { MobileHeader, MobileScreen } from '../../components/mobile/MobileUI';

function date(value: string | null) {
    return value ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
}

function statusLabel(value: string) {
    return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function daysRemaining(value: string | null) {
    if (!value) return 0;
    return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000));
}

export function SubscriptionScreen({ navigation }: any) {
    const { user } = useAuth();
    const { isDark, primaryColor, language } = useTheme();
    const palette = getPalette(isDark);
    const [summary, setSummary] = useState<MobileInvoiceBillingSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async (refresh = false) => {
        if (!user?.id) return;
        if (refresh) setRefreshing(true); else setLoading(true);
        setError('');
        try {
            const scope = await getWorkspaceScope(user.id);
            setSummary(await getInvoiceBillingSummary(scope.companyId));
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'Billing information could not be loaded.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [user?.id]);

    useEffect(() => { void load(); }, [load]);

    // Coming back from Stripe Checkout or the billing portal: re-read the plan (the webhook may already have activated it).
    useEffect(() => {
        const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void load(true); });
        return () => subscription.remove();
    }, [load]);

    // Apple requires In-App Purchase for subscriptions sold inside iOS apps, so Stripe checkout is off on iOS
    // unless the build explicitly opts in (for example for a storefront where external payment links are allowed).
    const inAppCheckout = Platform.OS !== 'ios' || process.env.EXPO_PUBLIC_ALLOW_IOS_STRIPE_CHECKOUT === 'true';
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState('');
    const startBilling = async (kind: 'monthly' | 'annual' | 'portal') => {
        if (!summary || busy) return;
        setBusy(true);
        setActionError('');
        try {
            const url = kind === 'portal' ? await createBillingPortal(summary.billing_account_company_id || summary.company_id) : await createSubscriptionCheckout(summary.billing_account_company_id || summary.company_id, plan, kind);
            await WebBrowser.openBrowserAsync(url);
            void load(true);
        } catch (caught) {
            setActionError(caught instanceof Error ? caught.message : 'Billing is unavailable right now.');
        } finally {
            setBusy(false);
        }
    };

    const openBilling = () => {
        const url = process.env.EXPO_PUBLIC_INVOICE_BILLING_URL?.trim() || 'https://invoice.operixsuite.com/settings?tab=billing';
        void WebBrowser.openBrowserAsync(url);
    };

    const textColor = palette.text;
    const mutedColor = palette.muted;
    const cardColor = palette.surface;
    const borderColor = palette.border;
    const interval = summary?.billing_interval || 'annual';
    const plan = summary?.plan === 'suite' ? 'suite' : 'invoice';
    const preview = summary ? calculateSubscriptionPrice({ plan, interval, totalTenants: summary.total_tenants, totalActiveUsers: summary.total_users }) : null;
    const suitePreview = summary ? calculateSubscriptionPrice({ plan: 'suite', interval, totalTenants: summary.total_tenants, totalActiveUsers: summary.total_users }) : null;
    const paymentWarning = summary && ['past_due', 'unpaid'].includes(summary.status);
    const hasSubscription = Boolean(summary?.stripe_subscription_id) || Boolean(summary?.billing_interval && ['active', 'past_due', 'unpaid', 'canceled', 'incomplete', 'paused'].includes(summary.status));

    return <MobileScreen testID="subscription-screen">
        <MobileHeader title={language === 'sq' ? 'Abonimi dhe pagesa' : 'Subscription & billing'} subtitle={plan === 'suite' ? 'OperiX Suite' : 'OperiX Invoice'} onBack={() => navigation.goBack()} />
        <ScrollView keyboardShouldPersistTaps="handled" style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={primaryColor} />}>
            {loading ? <View style={styles.center}><ActivityIndicator color={primaryColor} /><Text style={[styles.muted, { color: mutedColor }]}>Loading billing…</Text></View> : null}
            {!loading && error ? <View style={[styles.card, { backgroundColor: cardColor, borderColor }]}><Text style={[styles.title, { color: textColor }]}>Billing unavailable</Text><Text style={[styles.muted, { color: mutedColor }]}>{error}</Text><TouchableOpacity onPress={() => void load()} style={[styles.primaryButton, { backgroundColor: primaryColor }]}><Text style={styles.primaryButtonText}>Try again</Text></TouchableOpacity></View> : null}
            {!loading && !error && summary && preview ? <>
                <View style={[styles.card, { backgroundColor: cardColor, borderColor }]}><View style={styles.row}><View style={[styles.iconBox, { backgroundColor: `${primaryColor}18` }]}><CreditCard color={primaryColor} size={22} /></View><View style={styles.grow}><Text style={[styles.eyebrow, { color: mutedColor }]}>{plan === 'suite' ? 'OperiX Suite' : 'OperiX Invoice'}</Text><Text style={[styles.title, { color: textColor }]}>{plan === 'suite' ? 'Invoice + Booking subscription' : 'Invoice subscription'}</Text></View><Text style={[styles.badge, { color: summary.restricted ? '#B42318' : paymentWarning ? '#B54708' : '#027A48', backgroundColor: summary.restricted ? '#FEE4E2' : paymentWarning ? '#FEF0C7' : '#ECFDF3' }]}>{statusLabel(summary.status)}</Text></View>
                    {summary.status === 'trialing' && !summary.restricted ? <View style={[styles.notice, { backgroundColor: `${primaryColor}10`, borderColor: `${primaryColor}35` }]}><Text style={[styles.noticeTitle, { color: textColor }]}>{daysRemaining(summary.trial_ends_at)} days remaining in your free trial</Text><Text style={[styles.muted, { color: mutedColor }]}>No credit card is required for the 14-day trial.</Text></View> : null}
                    {paymentWarning ? <View style={[styles.notice, { backgroundColor: '#FFFAEB', borderColor: '#FEDF89' }]}><AlertTriangle color="#B54708" size={18} /><View style={styles.grow}><Text style={[styles.noticeTitle, { color: '#7A2E0B' }]}>Payment failed</Text><Text style={[styles.muted, { color: '#7A2E0B' }]}>Update your payment method to avoid interruption.</Text></View></View> : null}
                    {summary.restricted ? <View style={[styles.notice, { backgroundColor: '#FEF3F2', borderColor: '#FECDCA' }]}><AlertTriangle color="#B42318" size={18} /><View style={styles.grow}><Text style={[styles.noticeTitle, { color: '#7A271A' }]}>Restricted mode</Text><Text style={[styles.muted, { color: '#7A271A' }]}>Records remain readable, while core paid-product writes are disabled.</Text></View></View> : null}
                </View>

                <Section title="Usage" color={textColor} />
                <View style={styles.grid}><Usage label="Tenants" total={summary.total_tenants} included={summary.included_tenants} additional={summary.billable_tenants} cardColor={cardColor} borderColor={borderColor} textColor={textColor} mutedColor={mutedColor} /><Usage label="Active users" total={summary.total_users} included={summary.included_users} additional={summary.billable_users} cardColor={cardColor} borderColor={borderColor} textColor={textColor} mutedColor={mutedColor} /></View>

                <Section title="Current price" color={textColor} />
                <View style={[styles.card, { backgroundColor: cardColor, borderColor }]}><Text style={[styles.muted, { color: mutedColor }]}>{interval === 'annual' ? 'Annual' : 'Monthly'} billing</Text><Text style={[styles.total, { color: textColor }]}>{formatBillingAmount(preview.total, BILLING_CURRENCY)}<Text style={[styles.totalSuffix, { color: mutedColor }]}>/{interval === 'annual' ? 'year' : 'month'}</Text></Text>{preview.lineItems.map((item) => <View key={item.key} style={styles.line}><Text style={[styles.muted, { color: mutedColor }]}>{item.label} · {item.quantity}</Text><Text style={[styles.lineAmount, { color: textColor }]}>{formatBillingAmount(item.amount, BILLING_CURRENCY)}</Text></View>)}<Text style={[styles.estimate, { color: mutedColor }]}>Estimated total from backend usage. Stripe prorations may change the immediate invoice.</Text></View>

                <View style={[styles.card, { backgroundColor: cardColor, borderColor }]}><Row label="Renewal / period end" value={date(summary.current_period_end)} textColor={textColor} mutedColor={mutedColor} /><Row label="Trial ends" value={date(summary.trial_ends_at)} textColor={textColor} mutedColor={mutedColor} />{summary.scheduled_plan ? <Row label="Scheduled plan" value={`${summary.scheduled_plan} · ${date(summary.scheduled_change_at)}`} textColor={textColor} mutedColor={mutedColor} /> : null}{summary.cancel_at_period_end ? <Row label="Cancellation" value={`At ${date(summary.current_period_end)}`} textColor="#B54708" mutedColor="#B54708" /> : null}</View>
                {summary.billing_management_allowed && inAppCheckout ? <>
                    {actionError ? <Text style={[styles.muted, styles.centerText, { color: '#B42318' }]}>{actionError}</Text> : null}
                    {hasSubscription && summary.status !== 'canceled' ? <TouchableOpacity testID="subscription-manage" disabled={busy} onPress={() => void startBilling('portal')} style={[styles.primaryButton, { backgroundColor: primaryColor }, busy && { opacity: 0.6 }]}>{busy ? <ActivityIndicator color="#fff" /> : <><CreditCard color="#fff" size={17} /><Text style={styles.primaryButtonText}>{language === 'sq' ? 'Menaxho abonimin' : 'Manage subscription'}</Text></>}</TouchableOpacity> : <>
                        <TouchableOpacity testID="subscription-subscribe-annual" disabled={busy} onPress={() => void startBilling('annual')} style={[styles.primaryButton, { backgroundColor: primaryColor }, busy && { opacity: 0.6 }]}>{busy ? <ActivityIndicator color="#fff" /> : <><CreditCard color="#fff" size={17} /><Text style={styles.primaryButtonText}>{language === 'sq' ? 'Abonohu çdo vit' : 'Subscribe yearly'} · {formatBillingAmount(calculateSubscriptionPrice({ plan, interval: 'annual', totalTenants: summary.total_tenants, totalActiveUsers: summary.total_users }).total, BILLING_CURRENCY)}</Text></>}</TouchableOpacity>
                        <TouchableOpacity testID="subscription-subscribe-monthly" disabled={busy} onPress={() => void startBilling('monthly')} style={[styles.secondaryButton, { borderColor }]}><Text style={[styles.secondaryButtonText, { color: primaryColor }]}>{language === 'sq' ? 'Abonohu çdo muaj' : 'Subscribe monthly'} · {formatBillingAmount(calculateSubscriptionPrice({ plan, interval: 'monthly', totalTenants: summary.total_tenants, totalActiveUsers: summary.total_users }).total, BILLING_CURRENCY)}</Text></TouchableOpacity>
                    </>}
                </> : summary.billing_management_allowed ? <TouchableOpacity onPress={openBilling} style={[styles.primaryButton, { backgroundColor: primaryColor }]}><ExternalLink color="#fff" size={17} /><Text style={styles.primaryButtonText}>{hasSubscription ? 'Manage subscription on web' : 'Subscribe on web'}</Text></TouchableOpacity> : <Text style={[styles.muted, styles.centerText, { color: mutedColor }]}>Billing management is limited to workspace administrators.</Text>}
                {summary.billing_management_allowed ? <TouchableOpacity onPress={() => navigation.navigate('UsersAccess')} style={[styles.secondaryButton, { borderColor }]}><Users color={primaryColor} size={17} /><Text style={[styles.secondaryButtonText, { color: primaryColor }]}>Manage users</Text></TouchableOpacity> : null}
                {plan === 'invoice' && suitePreview ? <View style={[styles.card, { backgroundColor: cardColor, borderColor }]}><Text style={[styles.title, { color: textColor }]}>Recommended: OperiX Suite</Text><Text style={[styles.muted, { color: mutedColor }]}>Invoice + Booking with one shared meter: {formatBillingAmount(suitePreview.total, BILLING_CURRENCY)}/{interval === 'annual' ? 'year' : 'month'}.</Text></View> : null}
                <Text style={[styles.footnote, { color: mutedColor }]}><Check color="#027A48" size={14} /> Entitlement and usage are read from the shared Supabase billing service.</Text>
            </> : null}
        </ScrollView>
    </MobileScreen>;
}

function Section({ title, color }: { title: string; color: string }) { return <Text style={[styles.section, { color }]}>{title}</Text>; }
function Usage({ label, total, included, additional, cardColor, borderColor, textColor, mutedColor }: { label: string; total: number; included: number; additional: number; cardColor: string; borderColor: string; textColor: string; mutedColor: string }) { return <View style={[styles.usage, { backgroundColor: cardColor, borderColor }]}><Text style={[styles.muted, { color: mutedColor }]}>{label}</Text><Text style={[styles.usageTotal, { color: textColor }]}>{total} total</Text><Text style={[styles.muted, { color: mutedColor }]}>{included} included · {additional} additional</Text></View>; }
function Row({ label, value, textColor, mutedColor }: { label: string; value: string; textColor: string; mutedColor: string }) { return <View style={styles.line}><Text style={[styles.muted, { color: mutedColor }]}>{label}</Text><Text style={[styles.lineAmount, { color: textColor }]}>{value}</Text></View>; }

const styles = StyleSheet.create({
    flex: { flex: 1 },
    content: { paddingHorizontal: 20, paddingBottom: 110 },
    center: { alignItems: 'center', justifyContent: 'center', padding: 40, gap: 10 },
    centerText: { textAlign: 'center', paddingHorizontal: 20 },
    card: { padding: 16, borderRadius: 18, borderWidth: 1, marginBottom: 12, ...brand.shadow.card },
    row: { flexDirection: 'row', alignItems: 'center', gap: 11 },
    grow: { flex: 1, minWidth: 0 },
    iconBox: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    eyebrow: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.7, fontFamily: brand.fonts.semibold },
    title: { fontSize: 16, marginTop: 4, fontFamily: brand.fonts.semibold },
    badge: { fontSize: 10, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 99, overflow: 'hidden', fontFamily: brand.fonts.semibold },
    notice: { marginTop: 16, padding: 12, borderRadius: 13, borderWidth: 1, flexDirection: 'row', gap: 9 },
    noticeTitle: { fontSize: 12, marginBottom: 3, fontFamily: brand.fonts.semibold },
    muted: { fontSize: 11, lineHeight: 17, fontFamily: brand.fonts.regular },
    section: { fontSize: 14, marginTop: 8, marginBottom: 10, fontFamily: brand.fonts.semibold },
    grid: { flexDirection: 'row', gap: 10, marginBottom: 8 },
    usage: { flex: 1, padding: 14, borderRadius: 15, borderWidth: 1 },
    usageTotal: { fontSize: 18, marginVertical: 4, fontFamily: brand.fonts.semibold },
    total: { fontSize: 28, marginTop: 3, fontFamily: brand.fonts.semibold },
    totalSuffix: { fontSize: 12, fontFamily: brand.fonts.regular },
    line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E4E9F0' },
    lineAmount: { fontSize: 12, fontFamily: brand.fonts.semibold },
    estimate: { fontSize: 10, lineHeight: 15, marginTop: 12, fontFamily: brand.fonts.regular },
    primaryButton: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 5, marginBottom: 12 },
    primaryButtonText: { color: '#fff', fontSize: 13, fontFamily: brand.fonts.semibold },
    secondaryButton: { minHeight: 46, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 1, marginBottom: 12 },
    secondaryButtonText: { fontSize: 13, fontFamily: brand.fonts.semibold },
    footnote: { flexDirection: 'row', alignItems: 'center', gap: 4, textAlign: 'center', fontSize: 10, lineHeight: 15, marginTop: 8, fontFamily: brand.fonts.regular },
});
