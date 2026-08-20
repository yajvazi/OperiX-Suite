import React, { useCallback, useMemo, useState } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronRight, FileText, HandCoins, Mail, Phone, Receipt, UserRound } from 'lucide-react-native';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { formatCurrency, formatDate as formatLocalizedDate, getLocalizedErrorMessage, t } from '@invoice-monorepo/i18n';
import { supabase } from '@invoice-monorepo/api';
import { getCustomer, listCustomerPayments, listInvoices } from '@invoice-monorepo/api/repositories';
import { brand, getPalette } from '../../theme/brand';
import { getWorkspaceScope } from '../../services/workspace';
import type { RootStackParamList } from '../../navigation/types';
import { EmptyState, ErrorState, LoadingState, MobileHeader, MobileScreen, MobileStatusBadge, ShortcutRow } from '../../components/mobile/MobileUI';

type Activity = { id: string; title: string; detail: string; date: string; amount?: number; status?: string; invoiceId?: string };

export function CustomerDetailScreen() {
    const { user } = useAuth();
    const { isDark, language } = useTheme();
    const palette = getPalette(isDark);
    const route = useRoute<any>();
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const clientId = route.params?.clientId as string;
    const [client, setClient] = useState<Record<string, any> | null>(null);
    const [activities, setActivities] = useState<Activity[]>([]);
    const [outstanding, setOutstanding] = useState(0);
    const [lifetimeValue, setLifetimeValue] = useState(0);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        if (!user || !clientId) return;
        setError(null);
        try {
            const { companyIds } = await getWorkspaceScope(user.id);
            const queryScope = { userId: user.id, companyIds };
            const [clientData, invoicesData, paymentsData, quotesData] = await Promise.all([
                getCustomer(supabase, clientId, queryScope),
                listInvoices(supabase, queryScope, { select: 'id,invoice_number,total_amount,status,issue_date,created_at', documentType: 'INVOICE', legacyType: 'invoice', limit: 50 }),
                listCustomerPayments(supabase, queryScope, clientId),
                listInvoices(supabase, queryScope, { select: 'id,invoice_number,total_amount,status,issue_date,created_at', documentType: 'QUOTE', legacyType: 'offer', limit: 20 }),
            ]);
            if (!clientData) throw new Error('Customer not found in this workspace.');

            const invoices = invoicesData as Array<Record<string, any>>;
            const payments = paymentsData as Array<Record<string, any>>;
            const quotes = quotesData as Array<Record<string, any>>;
            const nextActivities: Activity[] = [
                ...invoices.map((invoice) => ({ id: `invoice-${invoice.id}`, title: `${t('invoice', language)} ${invoice.invoice_number}`, detail: t('invoice', language), date: invoice.created_at || invoice.issue_date, amount: Number(invoice.total_amount || 0), status: invoice.status, invoiceId: invoice.id })),
                ...payments.map((payment) => ({ id: `payment-${payment.id}`, title: t('paymentReceived', language), detail: payment.payment_method === 'cash' ? t('cash', language) : payment.payment_method === 'bank' ? t('bank', language) : t('incomePayment', language), date: payment.created_at || payment.payment_date, amount: Number(payment.amount || 0) })),
                ...quotes.map((quote) => ({ id: `quote-${quote.id}`, title: `${t('quote', language)} ${quote.invoice_number}`, detail: t('quote', language), date: quote.created_at || quote.issue_date, amount: Number(quote.total_amount || 0), status: quote.status })),
            ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setClient(clientData as Record<string, any>);
            setActivities(nextActivities);
            setOutstanding(invoices.filter((invoice) => ['draft', 'sent', 'pending', 'partial', 'overdue'].includes(invoice.status)).reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0));
            setLifetimeValue(invoices.filter((invoice) => invoice.status === 'paid').reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0));
        } catch (fetchError: any) {
            console.error('Customer detail error:', fetchError);
            setError(getLocalizedErrorMessage(fetchError, language, 'unableToLoad'));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [clientId, language, user]);

    useFocusEffect(useCallback(() => { void fetchData(); }, [fetchData]));

    const initials = useMemo(() => (client?.name || '?').slice(0, 1).toUpperCase(), [client?.name]);
    const contact = (kind: 'email' | 'phone') => {
        const value = kind === 'email' ? client?.email : client?.phone;
        if (value) void Linking.openURL(kind === 'email' ? `mailto:${value}` : `tel:${value}`);
    };

    return (
        <MobileScreen testID="customer-detail-screen">
            <MobileHeader title={client?.name || t('customer', language)} subtitle={t('customerDetail', language)} onBack={() => navigation.goBack()} right={<TouchableOpacity accessibilityRole="button" accessibilityLabel={t('edit', language)} onPress={() => navigation.navigate('ClientForm', { clientId })}><Text style={[styles.editText, { color: brand.colors.primary }]}>{t('edit', language)}</Text></TouchableOpacity>} />
            {loading ? <LoadingState label={t('loadingCustomer', language)} /> : error ? <ErrorState onRetry={() => { setLoading(true); void fetchData(); }} message={error || t('customerDetailsUnavailable', language)} /> : client ? <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void fetchData(); }} tintColor={brand.colors.primary} />}>
                <View style={[styles.identityCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                    <View style={styles.identityTop}><View style={[styles.avatar, { backgroundColor: palette.iconSurface }]}><Text style={[styles.avatarText, { color: brand.colors.primary }]}>{initials}</Text></View><View style={styles.identityCopy}><Text style={[styles.name, { color: palette.text }]}>{client.name}</Text><Text style={[styles.contact, { color: palette.muted }]}>{client.email || client.phone || t('noContactDetailsYet', language)}</Text></View></View>
                    <View style={styles.balanceRow}><View><Text style={[styles.balanceLabel, { color: palette.muted }]}>{t('outstanding', language)}</Text><Text style={[styles.balanceValue, { color: outstanding > 0 ? brand.colors.error : palette.text }]}>{formatCurrency(outstanding, 'EUR', language)}</Text></View><View><Text style={[styles.balanceLabel, { color: palette.muted }]}>{t('lifetimeValue', language)}</Text><Text style={[styles.balanceValue, { color: palette.text }]}>{formatCurrency(lifetimeValue, 'EUR', language)}</Text></View></View>
                </View>
                <View style={styles.actionsRow}><TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate('InvoiceForm', { clientId: client.id })} style={[styles.actionButton, { backgroundColor: brand.colors.primary }]}><FileText color="#fff" size={18} /><Text style={styles.actionText}>{t('createInvoice', language)}</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate('PaymentForm', { clientId: client.id })} style={[styles.actionButton, { backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1 }]}><HandCoins color={brand.colors.primary} size={18} /><Text style={[styles.actionText, { color: palette.text }]}>{t('recordPayment', language)}</Text></TouchableOpacity></View>
                <View style={styles.contactRow}>{client.email ? <TouchableOpacity accessibilityRole="button" onPress={() => contact('email')} style={[styles.contactButton, { backgroundColor: palette.surface, borderColor: palette.border }]}><Mail color={palette.muted} size={17} /><Text style={[styles.contactButtonText, { color: palette.text }]}>{t('email', language)}</Text></TouchableOpacity> : null}{client.phone ? <TouchableOpacity accessibilityRole="button" onPress={() => contact('phone')} style={[styles.contactButton, { backgroundColor: palette.surface, borderColor: palette.border }]}><Phone color={palette.muted} size={17} /><Text style={[styles.contactButtonText, { color: palette.text }]}>{t('call', language)}</Text></TouchableOpacity> : null}</View>
                <View style={styles.sectionHeader}><Text style={[styles.sectionTitle, { color: palette.text }]}>{t('activity', language)}</Text><Text style={[styles.sectionCount, { color: palette.muted }]}>{activities.length}</Text></View>
                {!activities.length ? <EmptyState title={t('noActivityYet', language)} description={t('noActivityDescription', language)} icon={UserRound} /> : activities.map((item) => <TouchableOpacity key={item.id} accessibilityRole="button" onPress={() => item.invoiceId && navigation.navigate('InvoiceDetail', { invoiceId: item.invoiceId })} disabled={!item.invoiceId} style={[styles.activityRow, { borderBottomColor: palette.border }]}><View style={[styles.activityIcon, { backgroundColor: item.detail === t('payment', language) ? '#E9F9F0' : '#EAF2FF' }]}>{item.detail === t('payment', language) ? <HandCoins color={brand.colors.success} size={16} /> : item.detail === t('quote', language) ? <FileText color={brand.colors.warning} size={16} /> : <Receipt color={brand.colors.primary} size={16} />}</View><View style={styles.activityCopy}><Text style={[styles.activityTitle, { color: palette.text }]}>{item.title}</Text><Text style={[styles.activityMeta, { color: palette.muted }]}>{item.detail} · {formatLocalizedDate(item.date, language)}</Text></View>{item.status ? <MobileStatusBadge status={item.status} /> : item.amount !== undefined ? <Text style={[styles.activityAmount, { color: brand.colors.success }]}>+{formatCurrency(item.amount, 'EUR', language)}</Text> : <ChevronRight color={palette.muted} size={17} />}</TouchableOpacity>)}
                <ShortcutRow icon={FileText} title={t('openFullCustomerLedger', language)} description={t('fullCustomerLedgerDescription', language)} onPress={() => navigation.navigate('CustomerLedger', { clientId })} trailing={<ChevronRight color={palette.muted} size={18} />} />
                <View style={{ height: 30 }} />
            </ScrollView> : null}
        </MobileScreen>
    );
}

const styles = StyleSheet.create({
    editText: { fontSize: 13, fontFamily: brand.fonts.semibold },
    content: { paddingHorizontal: 20, paddingBottom: 24 },
    identityCard: { borderRadius: 20, borderWidth: 1, padding: 17 },
    identityTop: { flexDirection: 'row', alignItems: 'center' },
    avatar: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontSize: 21, fontFamily: brand.fonts.semibold },
    identityCopy: { flex: 1, marginLeft: 13 },
    name: { fontSize: 18, fontFamily: brand.fonts.semibold },
    contact: { fontSize: 12, fontFamily: brand.fonts.regular, marginTop: 4 },
    balanceRow: { flexDirection: 'row', gap: 26, marginTop: 19, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(148,163,184,0.17)' },
    balanceLabel: { fontSize: 10, fontFamily: brand.fonts.medium },
    balanceValue: { fontSize: 18, fontFamily: brand.fonts.semibold, marginTop: 4 },
    actionsRow: { flexDirection: 'row', gap: 9, marginTop: 13 },
    actionButton: { flex: 1, minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
    actionText: { color: '#fff', fontSize: 11, fontFamily: brand.fonts.semibold, textAlign: 'center' },
    contactRow: { flexDirection: 'row', gap: 9, marginTop: 9 },
    contactButton: { minHeight: 42, borderRadius: 13, borderWidth: 1, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 7 },
    contactButtonText: { fontSize: 12, fontFamily: brand.fonts.medium },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 25, marginBottom: 8 },
    sectionTitle: { fontSize: 17, fontFamily: brand.fonts.semibold },
    sectionCount: { fontSize: 12, fontFamily: brand.fonts.medium },
    activityRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1 },
    activityIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    activityCopy: { flex: 1 },
    activityTitle: { fontSize: 13, fontFamily: brand.fonts.semibold },
    activityMeta: { fontSize: 11, fontFamily: brand.fonts.regular, marginTop: 3 },
    activityAmount: { fontSize: 12, fontFamily: brand.fonts.semibold },
});
