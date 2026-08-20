import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    RefreshControl,
    Alert,
    ActivityIndicator,
    Modal,
} from 'react-native';
import { ArrowLeft, Briefcase, ArrowUpRight, ArrowDownRight, TrendingUp, Wallet, Users, Package, FileText, BarChart2, QrCode, AlertTriangle, Calendar, Clock, Receipt, ScanLine, User, Settings, ChevronRight, ShoppingCart, Info, X, DollarSign, TrendingDown, RefreshCcw, CreditCard, ArrowDownLeft } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@invoice-monorepo/api';
import { useAuth } from '@invoice-monorepo/hooks';
import { useTheme } from '@invoice-monorepo/hooks';
import { Card, Button } from '@invoice-monorepo/ui';
import { formatCurrency, formatDate as formatLocalizedDate, getLocalizedErrorMessage, t, type TranslationKey } from '@invoice-monorepo/i18n';
import { stripeService, StripeTransaction, StripePayout } from '../../services/stripeService';
import { getWorkspaceScope } from '../../services/workspace';

export function StripeDashboardScreen({ navigation }: any) {
    const { user } = useAuth();
    const { isDark, primaryColor, language } = useTheme();
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [profile, setProfile] = useState<any>(null);
    const [summary, setSummary] = useState({
        totalSales: 0,
        totalPayouts: 0,
        totalFees: 0,
        totalNet: 0,
        pendingPayouts: 0,
        recentTransactions: [] as StripeTransaction[],
        recentPayouts: [] as StripePayout[],
        stores: [],
        balances: [],
        onlineInvoices: [],
    });

    const bgColor = isDark ? '#0D1B2A' : '#F7F9FC';
    const textColor = isDark ? '#fff' : '#111827';
    const mutedColor = isDark ? '#98A2B3' : '#667085';
    const cardBg = isDark ? '#14243A' : '#ffffff';

    // Modal states
    const [selectedTransaction, setSelectedTransaction] = useState<StripeTransaction | null>(null);
    const [selectedPayout, setSelectedPayout] = useState<StripePayout | null>(null);

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [user?.id])
    );

    const loadData = async () => {
        if (!user) return;
        setLoading(true);

        try {
            // Only non-secret status fields are read by the mobile client.
            const { data: profileData } = await supabase
                .from('profiles')
                .select('stripe_account_id,stripe_last_synced')
                .eq('id', user.id)
                .single();
            setProfile(profileData || {});
            const { companyIds } = await getWorkspaceScope(user.id);
            const dashboardData = await stripeService.getDashboardSummary(user.id, companyIds);
            setSummary(dashboardData);
        } catch (error) {
            console.error('Error loading Stripe data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSync = async (force: boolean = false) => {
        const { companyIds } = await getWorkspaceScope(user!.id);
        const status = await stripeService.checkConnectionStatus(user!.id, companyIds);
        if (!status.connected) {
            Alert.alert(t('notConnectedAlert', language), t('connectStripeFirst', language));
            return;
        }

        setSyncing(true);
        try {
            const stores = status.stores.filter((store) => store.status === 'connected');
            const results = await Promise.all(stores.map((store) => stripeService.syncViaEdgeFunction(store.id, force)));
            const result = results.reduce((total, current) => ({
                transactionsCount: total.transactionsCount + current.transactionsCount,
                payoutsCount: total.payoutsCount + current.payoutsCount,
                invoicesCreated: total.invoicesCreated + current.invoicesCreated,
                totalSales: total.totalSales + current.totalSales,
                totalPayouts: total.totalPayouts + current.totalPayouts,
                totalFees: total.totalFees + current.totalFees,
            }), { transactionsCount: 0, payoutsCount: 0, invoicesCreated: 0, totalSales: 0, totalPayouts: 0, totalFees: 0 });

            Alert.alert(
                force ? t('deepSyncComplete', language) : t('syncComplete', language),
                t('syncedTransactionsPayouts', language)
                    .replace('{transactions}', String(result.transactionsCount))
                    .replace('{payouts}', String(result.payoutsCount)),
            );

            // Reload data
            await loadData();
        } catch (error: any) {
            Alert.alert(t('syncFailed', language), getLocalizedErrorMessage(error, language, 'couldNotSwitchCompany'));
        } finally {
            setSyncing(false);
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return formatLocalizedDate(date.toISOString(), language);
    };

    // Payout to income conversion
    const handleRecordIncome = (payout: StripePayout) => {
        setSelectedPayout(null);
        // Navigate to payment form for "Pagese Hyrese"
        navigation.navigate('MainTabs', {
            screen: 'InvoicesTab',
            params: {
                screen: 'PaymentForm',
                params: {
                    prefillData: {
                        amount: payout.amount,
                        notes: `Stripe Payout: ${payout.stripe_id}`,
                        payment_method: 'bank',
                        stripeTransactionId: payout.stripe_id,
                    }
                }
            }
        });
    };



    const getTransactionIcon = (type: string) => {
        switch (type) {
            case 'charge':
            case 'payment':
                return <ArrowDownRight color="#12B76A" size={18} />;
            case 'refund':
                return <ArrowUpRight color="#ef4444" size={18} />;
            case 'payout':
                return <Wallet color="#004FFE" size={18} />;
            default:
                return <DollarSign color={mutedColor} size={18} />;
        }
    };

    if (loading) {
        return (
            <View style={[styles.container, styles.centered, { backgroundColor: bgColor }]}>
                <ActivityIndicator size="large" color={primaryColor} />
            </View>
        );
    }

    if (!summary.stores.some((store) => store.status === 'connected')) {
        return (
            <View style={[styles.container, { backgroundColor: bgColor }]}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backButton, { backgroundColor: cardBg }]}>
                        <ArrowLeft color={textColor} size={20} />
                    </TouchableOpacity>
                    <Text style={[styles.title, { color: textColor }]}>{t('stripeDashboard', language)}</Text>
                    <View style={{ width: 44 }} />
                </View>
                <View style={[styles.centered, { flex: 1 }]}>
                    <CreditCard color={mutedColor} size={64} />
                    <Text style={[styles.emptyTitle, { color: textColor }]}>{t('stripeNotConnected', language)}</Text>
                    <Text style={[styles.emptyText, { color: mutedColor }]}>
                        {t('connectStripeAccountDescription', language)}
                    </Text>
                    <Button
                        title={t('connectStripe', language)}
                        onPress={() => navigation.navigate('PaymentIntegrations')}
                        style={{ marginTop: 20 }}
                    />
                </View>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: bgColor }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backButton, { backgroundColor: cardBg }]}>
                    <ArrowLeft color={textColor} size={20} />
                </TouchableOpacity>
                <View>
                    <Text style={[styles.title, { color: textColor }]}>{t('stripeDashboard', language)}</Text>
                    <Text style={[styles.subtitle, { color: mutedColor }]}>{`${summary.stores.length} store${summary.stores.length === 1 ? '' : 's'}`}</Text>
                </View>
                <TouchableOpacity
                    onPress={() => handleSync(false)}
                    onLongPress={() => {
                        Alert.alert(
                            t('deepSyncComplete', language),
                            t('deepSyncDescription', language),
                            [
                                { text: t('cancel', language), style: 'cancel' },
                                { text: t('syncAll', language), onPress: () => handleSync(true) }
                            ]
                        );
                    }}
                    style={[styles.syncButton, { backgroundColor: primaryColor }]}
                    disabled={syncing}
                >
                    {syncing ? (
                        <ActivityIndicator size="small" color="#fff" />
                    ) : (
                        <RefreshCcw color="#fff" size={18} />
                    )}
                </TouchableOpacity>
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={mutedColor} />}
            >
                {/* Main Net Volume Card */}
                <Card style={[styles.mainNetCard, { backgroundColor: primaryColor }]}>
                    <View style={styles.mainNetHeader}>
                        <TrendingUp color="#fff" size={20} />
                        <Text style={styles.mainNetLabel}>{t('netVolume', language)}</Text>
                    </View>
                    <Text style={styles.mainNetValue}>{formatCurrency(summary.totalNet)}</Text>
                    <Text style={styles.mainNetSublabel}>{t('salesMinusFeesRefunds', language)}</Text>
                </Card>

                {/* Summary Grid 1 */}
                <View style={styles.summaryGrid}>
                    <Card style={[styles.summaryCard, { backgroundColor: '#12B76A' }]}>
                        <DollarSign color="#fff" size={20} />
                        <Text style={styles.summaryValue}>{formatCurrency(summary.totalSales)}</Text>
                        <Text style={styles.summaryLabel}>{t('grossSales', language)}</Text>
                    </Card>
                    <Card style={[styles.summaryCard, { backgroundColor: '#004FFE' }]}>
                        <Wallet color="#fff" size={20} />
                        <Text style={styles.summaryValue}>{formatCurrency(summary.totalPayouts)}</Text>
                        <Text style={styles.summaryLabel}>{t('received', language)}</Text>
                    </Card>
                </View>

                {/* Summary Grid 2 */}
                <View style={styles.summaryGrid}>
                    <Card style={[styles.summaryCard, { backgroundColor: '#ef4444' }]}>
                        <TrendingDown color="#fff" size={20} />
                        <Text style={styles.summaryValue}>{formatCurrency(summary.totalFees)}</Text>
                        <Text style={styles.summaryLabel}>{t('stripeFees', language)}</Text>
                    </Card>
                    <Card style={[styles.summaryCard, { backgroundColor: '#f59e0b' }]}>
                        <Clock color="#fff" size={20} />
                        <Text style={styles.summaryValue}>{formatCurrency(summary.pendingPayouts)}</Text>
                        <Text style={styles.summaryLabel}>{t('onTheWay', language)}</Text>
                    </Card>
                </View>

                {/* Last Synced */}
                {profile.stripe_last_synced && (
                    <Text style={[styles.lastSynced, { color: mutedColor }]}>
                        {t('lastSynced', language)}: {formatDate(profile.stripe_last_synced)}
                    </Text>
                )}

                {summary.balances.length > 0 ? (
                    <Card style={[styles.emptyCard, { marginBottom: 18 }]}>
                        <Text style={[styles.sectionTitle, { color: textColor, marginBottom: 8 }]}>Stripe balances</Text>
                        {summary.balances.map((balance) => (
                            <View key={`${balance.stripe_store_id}-${balance.currency}`} style={styles.transactionRow}>
                                <View style={styles.transactionInfo}>
                                    <Text style={[styles.transactionType, { color: textColor }]}>{summary.stores.find((store) => store.id === balance.stripe_store_id)?.store_name || 'Stripe'} · {balance.currency}</Text>
                                    <Text style={[styles.transactionDesc, { color: mutedColor }]}>Available · Pending</Text>
                                </View>
                                <Text style={[styles.transactionAmount, { color: '#12B76A' }]}>
                                    {formatCurrency(balance.available_balance, balance.currency)}
                                    {' · '}
                                    {formatCurrency(balance.pending_balance, balance.currency)}
                                </Text>
                            </View>
                        ))}
                    </Card>
                ) : null}

                {/* Recent Transactions */}
                <Text style={[styles.sectionTitle, { color: textColor }]}>{t('recentTransactions', language)}</Text>
                {summary.recentTransactions.length === 0 ? (
                    <Card style={styles.emptyCard}>
                        <Text style={{ color: mutedColor, textAlign: 'center' }}>
                            {t('noTransactionsSync', language)}
                        </Text>
                    </Card>
                ) : (
                    summary.recentTransactions.slice(0, 20).map((tx, index) => (
                        <TouchableOpacity
                            key={tx.stripe_id || index}
                            onPress={() => setSelectedTransaction(tx)}
                            activeOpacity={tx.type === 'refund' || tx.type === 'payout' ? 1 : 0.7}
                        >
                            <Card style={styles.transactionCard}>
                                <View style={styles.transactionRow}>
                                    <View style={[styles.iconCircle, { backgroundColor: isDark ? '#263A55' : '#F4F7FB' }]}>
                                        {getTransactionIcon(tx.type)}
                                    </View>
                                    <View style={styles.transactionInfo}>
                                        <Text style={[styles.transactionType, { color: textColor }]}>
                                            {tx.type.charAt(0).toUpperCase() + tx.type.slice(1)}
                                        </Text>
                                        <Text style={[styles.transactionDesc, { color: mutedColor }]} numberOfLines={1}>
                                            {[tx.store_name, tx.description || tx.customer_email || tx.stripe_id].filter(Boolean).join(' · ')}
                                        </Text>
                                    </View>
                                    <View style={styles.transactionAmounts}>
                                        <Text style={[
                                            styles.transactionAmount,
                                            { color: tx.type === 'refund' ? '#ef4444' : '#12B76A' }
                                        ]}>
                                            {tx.type === 'refund' ? '-' : '+'}{formatCurrency(tx.amount)}
                                        </Text>
                                        {(tx.fee || 0) > 0 && (
                                            <Text style={[styles.transactionFee, { color: mutedColor }]}>
                                                {t('fee', language)}: {formatCurrency(tx.fee || 0)}
                                            </Text>
                                        )}
                                        <Text style={[styles.transactionDate, { color: mutedColor }]}>
                                            {formatDate(tx.created_at)}
                                        </Text>
                                    </View>
                                </View>

                            </Card>
                        </TouchableOpacity>
                    ))
                )}

                {summary.onlineInvoices.length > 0 ? (
                    <>
                        <Text style={[styles.sectionTitle, { color: textColor, marginTop: 24 }]}>Online sale invoices</Text>
                        {summary.onlineInvoices.map((invoice) => (
                            <TouchableOpacity key={invoice.id} onPress={() => navigation.navigate('InvoiceDetail', { invoiceId: invoice.id })}>
                                <Card style={styles.transactionCard}>
                                    <View style={styles.transactionRow}>
                                        <View style={styles.transactionInfo}>
                                            <Text style={[styles.transactionType, { color: textColor }]}>{invoice.invoice_number}</Text>
                                            <Text style={[styles.transactionDesc, { color: mutedColor }]}>{[invoice.store_name, invoice.client_name || 'Stripe customer', formatDate(invoice.issue_date), invoice.status].filter(Boolean).join(' · ')}</Text>
                                        </View>
                                        <Text style={[styles.transactionAmount, { color: '#12B76A' }]}>{formatCurrency(invoice.total_amount, invoice.currency)}</Text>
                                    </View>
                                </Card>
                            </TouchableOpacity>
                        ))}
                    </>
                ) : null}

                {/* Recent Payouts */}
                <Text style={[styles.sectionTitle, { color: textColor, marginTop: 24 }]}>{t('recentPayouts', language)}</Text>
                {summary.recentPayouts.length === 0 ? (
                    <Card style={styles.emptyCard}>
                        <Text style={{ color: mutedColor, textAlign: 'center' }}>
                            {t('noPayoutsYet', language)}
                        </Text>
                    </Card>
                ) : (
                    summary.recentPayouts.map((payout, index) => (
                        <TouchableOpacity
                            key={payout.stripe_id || index}
                            onPress={() => setSelectedPayout(payout)}
                            activeOpacity={0.7}
                        >
                            <Card style={styles.transactionCard}>
                                <View style={styles.transactionRow}>
                                    <View style={[styles.iconCircle, { backgroundColor: '#004FFE20' }]}>
                                        <Wallet color="#004FFE" size={18} />
                                    </View>
                                    <View style={styles.transactionInfo}>
                                        <Text style={[styles.transactionType, { color: textColor }]}>
                                            {t('bankTransfer', language)}
                                        </Text>
                                        <View style={[styles.statusBadge, {
                                            backgroundColor: payout.status === 'paid' ? '#12B76A20' : '#f59e0b20'
                                        }]}>
                                            <Text style={{
                                                fontSize: 10,
                                                fontWeight: '600',
                                                color: payout.status === 'paid' ? '#12B76A' : '#f59e0b',
                                            }}>
                                                {payout.status.toUpperCase()}
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={styles.transactionAmounts}>
                                        <Text style={[styles.transactionAmount, { color: '#004FFE' }]}>
                                            {formatCurrency(payout.amount)}
                                        </Text>
                                        <Text style={[styles.transactionDate, { color: mutedColor }]}>
                                            {formatDate(payout.arrival_date)}
                                        </Text>
                                    </View>
                                </View>
                            </Card>
                        </TouchableOpacity>
                    ))
                )}

                <View style={{ height: 40 }} />
            </ScrollView>

            {/* Transaction Detail Modal */}
            <Modal
                visible={!!selectedTransaction}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setSelectedTransaction(null)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: cardBg }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: textColor }]}>{t('transactionDetails', language)}</Text>
                            <TouchableOpacity onPress={() => setSelectedTransaction(null)}>
                                <X color={mutedColor} size={24} />
                            </TouchableOpacity>
                        </View>

                        {selectedTransaction && (
                            <ScrollView style={styles.modalBody}>
                                <View style={[styles.modalDetailRow, { borderBottomColor: isDark ? '#263A55' : '#E4E9F0' }]}>
                                    <Text style={[styles.modalLabel, { color: mutedColor }]}>{t('type', language)}</Text>
                                    <Text style={[styles.modalValue, { color: textColor }]}>
                                        {selectedTransaction.type.charAt(0).toUpperCase() + selectedTransaction.type.slice(1)}
                                    </Text>
                                </View>
                                <View style={[styles.modalDetailRow, { borderBottomColor: isDark ? '#263A55' : '#E4E9F0' }]}>
                                    <Text style={[styles.modalLabel, { color: mutedColor }]}>{t('amount', language)}</Text>
                                    <Text style={[styles.modalValue, { color: '#12B76A', fontWeight: '600', fontSize: 18 }]}>
                                        {formatCurrency(selectedTransaction.amount)}
                                    </Text>
                                </View>
                                {selectedTransaction.fee !== undefined && selectedTransaction.fee > 0 && (
                                    <View style={[styles.modalDetailRow, { borderBottomColor: isDark ? '#263A55' : '#E4E9F0' }]}>
                                        <Text style={[styles.modalLabel, { color: mutedColor }]}>{t('stripeFee', language)}</Text>
                                        <Text style={[styles.modalValue, { color: '#ef4444' }]}>
                                            -{formatCurrency(selectedTransaction.fee)}
                                        </Text>
                                    </View>
                                )}
                                {selectedTransaction.net !== undefined && (
                                    <View style={[styles.modalDetailRow, { borderBottomColor: isDark ? '#263A55' : '#E4E9F0' }]}>
                                        <Text style={[styles.modalLabel, { color: mutedColor }]}>{t('netAmount', language)}</Text>
                                        <Text style={[styles.modalValue, { color: textColor, fontWeight: '600' }]}>
                                            {formatCurrency(selectedTransaction.net)}
                                        </Text>
                                    </View>
                                )}
                                {selectedTransaction.description && (
                                    <View style={[styles.modalDetailRow, { borderBottomColor: isDark ? '#263A55' : '#E4E9F0' }]}>
                                        <Text style={[styles.modalLabel, { color: mutedColor }]}>{t('description', language)}</Text>
                                        <Text style={[styles.modalValue, { color: textColor }]}>
                                            {selectedTransaction.description}
                                        </Text>
                                    </View>
                                )}
                                {selectedTransaction.customer_email && (
                                    <View style={[styles.modalDetailRow, { borderBottomColor: isDark ? '#263A55' : '#E4E9F0' }]}>
                                        <Text style={[styles.modalLabel, { color: mutedColor }]}>{t('customer', language)}</Text>
                                        <Text style={[styles.modalValue, { color: textColor }]}>
                                            {selectedTransaction.customer_email}
                                        </Text>
                                    </View>
                                )}
                                <View style={[styles.modalDetailRow, { borderBottomColor: isDark ? '#263A55' : '#E4E9F0' }]}>
                                    <Text style={[styles.modalLabel, { color: mutedColor }]}>{t('date', language)}</Text>
                                    <Text style={[styles.modalValue, { color: textColor }]}>
                                        {formatDate(selectedTransaction.created_at)}
                                    </Text>
                                </View>
                                <View style={[styles.modalDetailRow, { borderBottomColor: isDark ? '#263A55' : '#E4E9F0' }]}>
                                    <Text style={[styles.modalLabel, { color: mutedColor }]}>{t('status', language)}</Text>
                                    <Text style={[styles.modalValue, { color: '#12B76A' }]}>
                                        {selectedTransaction.status || t('completed', language)}
                                    </Text>
                                </View>
                                <View style={styles.modalDetailRow}>
                                    <Text style={[styles.modalLabel, { color: mutedColor }]}>{t('stripeId', language)}</Text>
                                    <Text style={[styles.modalValue, { color: mutedColor, fontSize: 11 }]}>
                                        {selectedTransaction.stripe_id}
                                    </Text>
                                </View>

                                {selectedTransaction.payment_details && (() => {
                                    const pd = selectedTransaction.payment_details;

                                    // Robust data extraction across different Stripe versions/objects
                                    // pd could be a Charge object or a PaymentIntent-based structure
                                    const pm = pd.payment_method_details || {};
                                    const pm_object = typeof pd.payment_method === 'object' ? pd.payment_method : null;

                                    const card = pd.card ||
                                        pm.card ||
                                        pm_object?.card ||
                                        (pd.source?.object === 'card' ? pd.source : null);

                                    const billing = pd.billing_details ||
                                        pm_object?.billing_details ||
                                        pd.source?.owner ||
                                        {};

                                    const countryMap: Record<string, TranslationKey> = {
                                        'XK': 'kosovo',
                                        'SR': 'suriname',
                                        'US': 'unitedStates',
                                        'GB': 'unitedKingdom',
                                        'AL': 'albania',
                                        'DE': 'germany',
                                        'FR': 'france',
                                        'IT': 'italy',
                                    };

                                    const getCountryName = (code: string) => {
                                        if (!code) return t('notAvailable', language);
                                        const key = countryMap[code.toUpperCase()];
                                        return key ? t(key, language) : code.toUpperCase();
                                    };

                                    return (
                                        <>
                                            <Text style={styles.modalSectionTitle}>{t('paymentMethodDetails', language)}</Text>
                                            <View style={[styles.modalDetailRow, { borderBottomColor: isDark ? '#263A55' : '#E4E9F0' }]}>
                                                <Text style={[styles.modalLabel, { color: mutedColor }]}>{t('id', language)}</Text>
                                                <Text style={[styles.modalValue, { color: textColor, fontSize: 11 }]}>
                                                    {pd.payment_method?.id || pd.payment_method || pd.id}
                                                </Text>
                                            </View>

                                            {card ? (
                                                <>
                                                    <View style={[styles.modalDetailRow, { borderBottomColor: isDark ? '#263A55' : '#E4E9F0' }]}>
                                                        <Text style={[styles.modalLabel, { color: mutedColor }]}>{t('number', language)}</Text>
                                                        <Text style={[styles.modalValue, { color: textColor }]}>
                                                            •••• {card.last4}
                                                        </Text>
                                                    </View>
                                                    <View style={[styles.modalDetailRow, { borderBottomColor: isDark ? '#263A55' : '#E4E9F0' }]}>
                                                        <Text style={[styles.modalLabel, { color: mutedColor }]}>{t('fingerprint', language)}</Text>
                                                        <Text style={[styles.modalValue, { color: textColor }]}>
                                                            {card.fingerprint || 'N/A'}
                                                        </Text>
                                                    </View>
                                                    <View style={[styles.modalDetailRow, { borderBottomColor: isDark ? '#263A55' : '#E4E9F0' }]}>
                                                        <Text style={[styles.modalLabel, { color: mutedColor }]}>{t('expires', language)}</Text>
                                                        <Text style={[styles.modalValue, { color: textColor }]}>
                                                            {card.exp_month} / {card.exp_year}
                                                        </Text>
                                                    </View>
                                                    <View style={[styles.modalDetailRow, { borderBottomColor: isDark ? '#263A55' : '#E4E9F0' }]}>
                                                        <Text style={[styles.modalLabel, { color: mutedColor }]}>{t('type', language)}</Text>
                                                        <Text style={[styles.modalValue, { color: textColor }]}>
                                                            {card.brand?.charAt(0).toUpperCase() + card.brand?.slice(1)} {card.funding || ''} {t('card', language)}
                                                        </Text>
                                                    </View>
                                                    <View style={[styles.modalDetailRow, { borderBottomColor: isDark ? '#263A55' : '#E4E9F0' }]}>
                                                        <Text style={[styles.modalLabel, { color: mutedColor }]}>{t('issuer', language)}</Text>
                                                        <Text style={[styles.modalValue, { color: textColor }]}>
                                                            {card.issuer || card.network?.toUpperCase() || card.brand?.toUpperCase() || 'N/A'}
                                                        </Text>
                                                    </View>
                                                    <View style={[styles.modalDetailRow, { borderBottomColor: isDark ? '#263A55' : '#E4E9F0' }]}>
                                                        <Text style={[styles.modalLabel, { color: mutedColor }]}>{t('origin', language)}</Text>
                                                        <Text style={[styles.modalValue, { color: textColor }]}>
                                                            {getCountryName(card.country)}
                                                        </Text>
                                                    </View>
                                                    <View style={[styles.modalDetailRow, { borderBottomColor: isDark ? '#263A55' : '#E4E9F0' }]}>
                                                        <Text style={[styles.modalLabel, { color: mutedColor }]}>{t('cvcCheck', language)}</Text>
                                                        <Text style={[styles.modalValue, { color: '#12B76A' }]}>
                                                            {card.checks?.cvc_check?.toUpperCase() || pd.cvc_check?.toUpperCase() || t('passed', language)}
                                                        </Text>
                                                    </View>
                                                </>
                                            ) : (
                                                <View style={[styles.modalDetailRow, { borderBottomColor: isDark ? '#263A55' : '#E4E9F0' }]}>
                                                    <Text style={[styles.modalLabel, { color: mutedColor }]}>{t('methodType', language)}</Text>
                                                    <Text style={[styles.modalValue, { color: textColor }]}>
                                                        {pd.object || t('payment', language)}
                                                    </Text>
                                                </View>
                                            )}

                                            <Text style={styles.modalSectionTitle}>{t('ownerDetails', language)}</Text>
                                            <View style={[styles.modalDetailRow, { borderBottomColor: isDark ? '#263A55' : '#E4E9F0' }]}>
                                                <Text style={[styles.modalLabel, { color: mutedColor }]}>{t('owner', language)}</Text>
                                                <Text style={[styles.modalValue, { color: textColor }]}>
                                                    {billing.name || 'N/A'}
                                                </Text>
                                            </View>
                                            <View style={[styles.modalDetailRow, { borderBottomColor: isDark ? '#263A55' : '#E4E9F0' }]}>
                                                <Text style={[styles.modalLabel, { color: mutedColor }]}>{t('ownerEmail', language)}</Text>
                                                <Text style={[styles.modalValue, { color: textColor }]}>
                                                    {billing.email || selectedTransaction.customer_email || 'N/A'}
                                                </Text>
                                            </View>
                                            <View style={[styles.modalDetailRow, { borderBottomColor: isDark ? '#263A55' : '#E4E9F0' }]}>
                                                <Text style={[styles.modalLabel, { color: mutedColor }]}>{t('address', language)}</Text>
                                                <Text style={[styles.modalValue, { color: textColor }]}>
                                                    {getCountryName(billing.address?.country)}
                                                </Text>
                                            </View>
                                        </>
                                    );
                                })()}
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>

            {/* Payout Detail Modal */}
            <Modal
                visible={!!selectedPayout}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setSelectedPayout(null)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { backgroundColor: cardBg }]}>
                        <View style={styles.modalHeader}>
                            <Text style={[styles.modalTitle, { color: textColor }]}>{t('payoutDetails', language)}</Text>
                            <TouchableOpacity onPress={() => setSelectedPayout(null)}>
                                <X color={mutedColor} size={24} />
                            </TouchableOpacity>
                        </View>

                        {selectedPayout && (
                            <ScrollView style={styles.modalBody}>
                                <View style={[styles.modalDetailRow, { borderBottomColor: isDark ? '#263A55' : '#E4E9F0' }]}>
                                    <Text style={[styles.modalLabel, { color: mutedColor }]}>{t('amount', language)}</Text>
                                    <Text style={[styles.modalValue, { color: '#004FFE', fontWeight: '600', fontSize: 18 }]}>
                                        {formatCurrency(selectedPayout.amount)}
                                    </Text>
                                </View>
                                <View style={[styles.modalDetailRow, { borderBottomColor: isDark ? '#263A55' : '#E4E9F0' }]}>
                                    <Text style={[styles.modalLabel, { color: mutedColor }]}>{t('arrivalDate', language)}</Text>
                                    <Text style={[styles.modalValue, { color: textColor }]}>
                                        {formatDate(selectedPayout.arrival_date)}
                                    </Text>
                                </View>
                                <View style={[styles.modalDetailRow, { borderBottomColor: isDark ? '#263A55' : '#E4E9F0' }]}>
                                    <Text style={[styles.modalLabel, { color: mutedColor }]}>{t('status', language)}</Text>
                                    <Text style={[styles.modalValue, {
                                        color: selectedPayout.status === 'paid' ? '#12B76A' : '#f59e0b'
                                    }]}>
                                        {selectedPayout.status.charAt(0).toUpperCase() + selectedPayout.status.slice(1)}
                                    </Text>
                                </View>
                                {selectedPayout.method && (
                                    <View style={[styles.modalDetailRow, { borderBottomColor: isDark ? '#263A55' : '#E4E9F0' }]}>
                                        <Text style={[styles.modalLabel, { color: mutedColor }]}>{t('method', language)}</Text>
                                        <Text style={[styles.modalValue, { color: textColor }]}>
                                            {selectedPayout.method.toUpperCase()}
                                        </Text>
                                    </View>
                                )}
                                {selectedPayout.description && (
                                    <View style={[styles.modalDetailRow, { borderBottomColor: isDark ? '#263A55' : '#E4E9F0' }]}>
                                        <Text style={[styles.modalLabel, { color: mutedColor }]}>{t('description', language)}</Text>
                                        <Text style={[styles.modalValue, { color: textColor }]}>
                                            {selectedPayout.description}
                                        </Text>
                                    </View>
                                )}
                                <View style={styles.modalDetailRow}>
                                    <Text style={[styles.modalLabel, { color: mutedColor }]}>{t('stripeId', language)}</Text>
                                    <Text style={[styles.modalValue, { color: mutedColor, fontSize: 11 }]}>
                                        {selectedPayout.stripe_id}
                                    </Text>
                                </View>

                                <View style={styles.modalActions}>
                                    <TouchableOpacity
                                        style={[styles.modalActionButton, { backgroundColor: '#12B76A' }]}
                                        onPress={() => handleRecordIncome(selectedPayout)}
                                    >
                                        <Receipt color="#fff" size={18} />
                                        <Text style={styles.modalActionButtonText}>{t('recordAsIncome', language)}</Text>
                                    </TouchableOpacity>
                                </View>
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    centered: { alignItems: 'center', justifyContent: 'center' },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 60,
        paddingBottom: 16,
    },
    backButton: {
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: { fontSize: 20, fontWeight: 'bold' },
    subtitle: { fontSize: 12, marginTop: 2 },
    syncButton: {
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scroll: { flex: 1 },
    scrollContent: { padding: 16 },

    // Summary
    summaryGrid: { flexDirection: 'row', gap: 12, marginBottom: 12 },
    summaryCard: {
        flex: 1,
        padding: 16,
        alignItems: 'flex-start',
        gap: 8,
    },
    summaryValue: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
    summaryLabel: { fontSize: 12, color: 'rgba(255,255,255,0.8)' },

    mainNetCard: {
        padding: 24,
        borderRadius: 20,
        marginBottom: 20,
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
    },
    mainNetHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    mainNetLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.9)',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    mainNetValue: {
        fontSize: 36,
        fontWeight: '800',
        color: '#fff',
        marginBottom: 4,
    },
    mainNetSublabel: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.7)',
    },

    lastSynced: { fontSize: 12, textAlign: 'center', marginBottom: 20 },

    // Sections
    sectionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12 },

    // Transactions
    transactionCard: { padding: 14, marginBottom: 10 },
    transactionRow: { flexDirection: 'row', alignItems: 'center' },
    iconCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    transactionInfo: { flex: 1 },
    transactionType: { fontSize: 14, fontWeight: '600' },
    transactionDesc: { fontSize: 12, marginTop: 2 },
    transactionAmounts: { alignItems: 'flex-end' },
    transactionAmount: { fontSize: 15, fontWeight: 'bold' },
    transactionFee: { fontSize: 10, marginTop: 1 },
    transactionDate: { fontSize: 11, marginTop: 2 },

    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
        marginTop: 4,
        alignSelf: 'flex-start',
    },

    // Empty states
    emptyCard: { padding: 24 },
    emptyTitle: { fontSize: 18, fontWeight: 'bold', marginTop: 16 },
    emptyText: { fontSize: 14, textAlign: 'center', marginTop: 8, maxWidth: 280 },

    // Action buttons
    actionButtonsRow: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(100,100,100,0.1)'
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        gap: 6
    },
    actionButtonText: { fontSize: 13, fontWeight: '600' },

    // Modal styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '80%',
        paddingBottom: 40,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(100,100,100,0.1)',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    modalBody: {
        padding: 20,
    },
    modalDetailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 14,
        borderBottomWidth: 1,
    },
    modalLabel: {
        fontSize: 14,
    },
    modalValue: {
        fontSize: 14,
        textAlign: 'right',
        flex: 1,
        marginLeft: 16,
    },
    modalActions: {
        marginTop: 24,
        gap: 12,
    },
    modalActionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 12,
        gap: 10,
    },
    modalActionButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    modalSectionTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        marginTop: 20,
        marginBottom: 10,
        color: '#004FFE',
    },
});
