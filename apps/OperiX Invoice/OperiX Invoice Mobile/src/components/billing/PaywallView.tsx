import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { ArrowRight, Check, Lock } from 'lucide-react-native';
import { PLAN_DEFINITIONS, type BillingInterval } from '@invoice-monorepo/billing';
import { useTheme } from '@invoice-monorepo/hooks';
import { brand, getPalette } from '../../theme/brand';
import { createSubscriptionCheckout } from '../../services/billingService';

const copy = {
    en: {
        benefits: ['Web and mobile app always in sync', 'Cloud backup: your data is safe even if you lose your phone', 'Team members with roles and permissions', 'Customer portal links and online payments', 'Public API and integrations', 'Updates and support included'],
        yearly: 'Yearly', monthly: 'Monthly', save: 'Save', perYear: '/year', perMonth: '/month', extraUser: 'per extra user',
        subscribe: 'Subscribe', secure: 'Pay securely with Stripe: card or Google Pay. Cancel any time from Settings.',
        ios: 'Subscriptions to OperiX Cloud are managed on our website, with the account you use here.',
        notPayer: 'Only a workspace administrator can subscribe. Ask your administrator to subscribe to OperiX Cloud.',
        alwaysFree: 'OperiX is always free to use. Without a subscription you can keep your data on this device at no cost.',
        failed: 'Checkout is unavailable right now.', signOut: 'Sign out', refresh: 'I have subscribed, refresh',
    },
    sq: {
        benefits: ['Aplikacioni ueb dhe mobil gjithmonë i sinkronizuar', 'Kopje rezervë në cloud: të dhënat janë të sigurta edhe nëse humbisni telefonin', 'Anëtarë ekipi me role dhe leje', 'Lidhje për portalin e klientit dhe pagesa online', 'API publike dhe integrime', 'Përditësimet dhe mbështetja përfshihen'],
        yearly: 'Vjetor', monthly: 'Mujor', save: 'Kurseni', perYear: '/vit', perMonth: '/muaj', extraUser: 'për përdorues shtesë',
        subscribe: 'Abonohu', secure: 'Paguani në mënyrë të sigurt me Stripe: kartë ose Google Pay. Anuloni kur të dëshironi nga Cilësimet.',
        ios: 'Abonimet në OperiX Cloud menaxhohen në faqen tonë të internetit, me llogarinë që përdorni këtu.',
        notPayer: 'Vetëm administratori i hapësirës së punës mund të abonohet. Kërkojini administratorit tuaj të abonohet te OperiX Cloud.',
        alwaysFree: 'OperiX është gjithmonë falas për përdorim. Pa abonim mund t\'i mbani të dhënat në këtë pajisje pa pagesë.',
        failed: 'Pagesa nuk është e disponueshme tani.', signOut: 'Dil', refresh: 'U abonova, rifresko',
    },
} as const;

/**
 * The OperiX Cloud paywall. Android opens Stripe Checkout (card or Google Pay). iOS shows no payment button: Apple
 * requires its own In-App Purchase for subscriptions sold inside iOS apps, so Stripe checkout is off there unless
 * the build sets EXPO_PUBLIC_ALLOW_IOS_STRIPE_CHECKOUT=true.
 */
export function PaywallView({ title, lead, companyId, canPay = true, freeLabel, onFree, onSignOut, onRefresh, onClose }: {
    title: string;
    lead: string;
    companyId?: string;
    canPay?: boolean;
    freeLabel: string;
    onFree: () => void;
    onSignOut?: () => void;
    /** Called when the user comes back from checkout, so the screen can look at the subscription again. */
    onRefresh?: () => void;
    onClose?: () => void;
}) {
    const { isDark, primaryColor, language } = useTheme();
    const palette = getPalette(isDark);
    const text = language === 'sq' ? copy.sq : copy.en;
    const [interval, setInterval] = useState<BillingInterval>('annual');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const pricing = PLAN_DEFINITIONS.invoice.pricing;
    const savings = useMemo(() => Math.round((1 - Number(pricing.annual.base) / (Number(pricing.monthly.base) * 12)) * 100), [pricing]);
    const checkoutAllowed = Platform.OS !== 'ios' || process.env.EXPO_PUBLIC_ALLOW_IOS_STRIPE_CHECKOUT === 'true';

    const subscribe = async () => {
        if (!companyId) return;
        setBusy(true);
        setError('');
        try {
            await WebBrowser.openBrowserAsync(await createSubscriptionCheckout(companyId, 'invoice', interval));
            onRefresh?.();
        } catch (caught) {
            setError(caught instanceof Error && caught.message ? caught.message : text.failed);
        } finally {
            setBusy(false);
        }
    };

    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
            <ScrollView contentContainerStyle={styles.scroll}>
                <View style={[styles.icon, { backgroundColor: `${primaryColor}18` }]}><Lock color={primaryColor} size={24} /></View>
                <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
                <Text style={[styles.lead, { color: palette.muted }]}>{lead}</Text>

                <View style={[styles.toggle, { backgroundColor: palette.surfaceMuted }]}>
                    {(['annual', 'monthly'] as const).map((value) => (
                        <TouchableOpacity key={value} accessibilityRole="button" onPress={() => setInterval(value)} style={[styles.toggleItem, interval === value && { backgroundColor: palette.surface }]}>
                            <Text style={{ color: palette.text, fontWeight: '700', fontSize: 12 }}>{value === 'annual' ? `${text.yearly} · ${text.save} ${savings}%` : text.monthly}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
                <Text style={[styles.price, { color: palette.text }]}>€{pricing[interval].base}<Text style={{ color: palette.muted, fontSize: 14, fontWeight: '500' }}>{interval === 'annual' ? text.perYear : text.perMonth}</Text></Text>
                <Text style={[styles.lead, { color: palette.muted, marginTop: 2, marginBottom: 12 }]}>OperiX Invoice · €{pricing[interval].additionalUser} {text.extraUser}</Text>
                {text.benefits.map((item) => <View key={item} style={styles.row}><Check color="#12B76A" size={14} style={{ marginTop: 2 }} /><Text style={[styles.rowText, { color: palette.textSecondary }]}>{item}</Text></View>)}

                {error ? <Text style={styles.error}>{error}</Text> : null}
                {!canPay ? <Text style={[styles.note, { color: '#7A2E0B', backgroundColor: '#FFFAEB', borderColor: '#FEDF89' }]}>{text.notPayer}</Text> : checkoutAllowed ? <>
                    <TouchableOpacity testID="paywall-subscribe" accessibilityRole="button" disabled={busy || !companyId} onPress={() => void subscribe()} style={[styles.primary, { backgroundColor: primaryColor }, (busy || !companyId) && { opacity: 0.6 }]}>
                        {busy ? <ActivityIndicator color="#fff" /> : <><Text style={styles.primaryText}>{text.subscribe}</Text><ArrowRight color="#fff" size={16} /></>}
                    </TouchableOpacity>
                    <Text style={[styles.small, { color: palette.muted }]}>{text.secure}</Text>
                </> : <Text style={[styles.note, { color: palette.text, backgroundColor: `${primaryColor}10`, borderColor: `${primaryColor}35` }]}>{text.ios}</Text>}

                {onRefresh ? <TouchableOpacity accessibilityRole="button" onPress={onRefresh} style={styles.link}><Text style={{ color: primaryColor, fontWeight: '700', fontSize: 13 }}>{text.refresh}</Text></TouchableOpacity> : null}
                <TouchableOpacity testID="paywall-free" accessibilityRole="button" onPress={onFree} style={[styles.secondary, { borderColor: palette.border }]}><Text style={[styles.secondaryText, { color: palette.text }]}>{freeLabel}</Text></TouchableOpacity>
                <Text style={[styles.small, { color: palette.muted }]}>{text.alwaysFree}</Text>
                {onClose ? <TouchableOpacity accessibilityRole="button" onPress={onClose} style={styles.link}><Text style={{ color: palette.muted, fontWeight: '700', fontSize: 13 }}>✕</Text></TouchableOpacity> : null}
                {onSignOut ? <TouchableOpacity accessibilityRole="button" onPress={onSignOut} style={styles.link}><Text style={{ color: primaryColor, fontWeight: '800', fontSize: 13 }}>{text.signOut}</Text></TouchableOpacity> : null}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1 },
    scroll: { padding: 22, paddingBottom: 48 },
    icon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
    title: { fontSize: 24, fontWeight: '900', letterSpacing: -0.4 },
    lead: { marginTop: 8, marginBottom: 16, fontSize: 13, lineHeight: 20 },
    toggle: { flexDirection: 'row', padding: 4, borderRadius: 12, marginBottom: 14 },
    toggleItem: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 9, paddingHorizontal: 6 },
    price: { fontSize: 36, fontWeight: '900', letterSpacing: -1 },
    row: { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'flex-start' },
    rowText: { flex: 1, fontSize: 12.5, lineHeight: 18 },
    error: { marginTop: 8, color: brand.colors.error, fontSize: 12, lineHeight: 17 },
    primary: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16, borderRadius: 14 },
    primaryText: { color: '#fff', fontSize: 15, fontWeight: '900' },
    secondary: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 12, borderWidth: 1, borderRadius: 13 },
    secondaryText: { fontSize: 13, fontWeight: '800' },
    note: { marginTop: 14, padding: 13, borderWidth: 1, borderRadius: 12, fontSize: 12, lineHeight: 18 },
    small: { marginTop: 10, fontSize: 11, lineHeight: 16, textAlign: 'center' },
    link: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
});
