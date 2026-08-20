import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Alert,
    Linking,
    Switch,
    ActivityIndicator,
} from 'react-native';
import { ArrowLeft, Zap, CreditCard, RefreshCw, Check, X, ExternalLink, Clock, DollarSign } from 'lucide-react-native';
import { supabase } from '@invoice-monorepo/api';
import { useAuth } from '@invoice-monorepo/hooks';
import { useTheme } from '@invoice-monorepo/hooks';
import { Card, Button, QuickAddModal } from '@invoice-monorepo/ui';
import { getLocalizedErrorMessage, t } from '@invoice-monorepo/i18n';
import { formatCurrency, formatDate as formatLocalizedDate } from '@invoice-monorepo/i18n';
import { stripeService, type StripeStore } from '../../services/stripeService';
import { getWorkspaceScope } from '../../services/workspace';

// Stripe logo SVG path
const StripeLogo = ({ color, size }: { color: string; size: number }) => (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: size * 0.6, fontWeight: '600', color }}>S</Text>
    </View>
);

// PayPal logo placeholder
const PayPalLogo = ({ color, size }: { color: string; size: number }) => (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: size * 0.6, fontWeight: '600', color }}>P</Text>
    </View>
);

interface PaymentConnection {
    id: string;
    provider: 'stripe' | 'paypal';
    connected: boolean;
    account_id?: string;
    account_email?: string;
    last_synced?: string;
    auto_sync: boolean;
    total_synced: number;
    store_id?: string;
    store_name?: string;
}

export function PaymentIntegrationsScreen({ navigation }: any) {
    const { user } = useAuth();
    const { isDark, primaryColor, language } = useTheme();
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState<string | null>(null);
    const [connections, setConnections] = useState<PaymentConnection[]>([
        { id: '1', provider: 'stripe', connected: false, auto_sync: false, total_synced: 0 },
        { id: '2', provider: 'paypal', connected: false, auto_sync: false, total_synced: 0 },
    ]);
    const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
    const [showConnectModal, setShowConnectModal] = useState<'stripe' | 'paypal' | null>(null);
    const [profile, setProfile] = useState<any>(null);

    const bgColor = isDark ? '#0D1B2A' : '#F7F9FC';
    const textColor = isDark ? '#fff' : '#111827';
    const mutedColor = isDark ? '#98A2B3' : '#667085';
    const cardBg = isDark ? '#14243A' : '#ffffff';

    useEffect(() => {
        fetchConnections();
    }, []);

    const fetchConnections = async () => {
        if (!user) return;

        try {
            const { data: profileData } = await supabase.from('profiles').select('active_company_id,company_id,payment_link_paypal').eq('id', user.id).single();
            if (profileData) {
                setProfile(profileData);
                const scope = await getWorkspaceScope(user.id);
                const stores = await stripeService.listStores(scope.companyIds);
                const stripeConnections: PaymentConnection[] = stores.map((store: StripeStore) => ({
                    id: store.id,
                    provider: 'stripe',
                    connected: store.status === 'connected',
                    account_id: store.stripe_account_id || undefined,
                    account_email: store.account_email || undefined,
                    last_synced: store.last_synced_at || undefined,
                    auto_sync: store.auto_sync,
                    total_synced: 0,
                    store_id: store.id,
                    store_name: store.store_name,
                }));
                if (stripeConnections.length === 0) {
                    stripeConnections.push({ id: 'stripe', provider: 'stripe', connected: false, auto_sync: false, total_synced: 0 });
                }
                setConnections([
                    ...stripeConnections,
                    { id: 'paypal', provider: 'paypal', connected: Boolean(profileData.payment_link_paypal), account_email: profileData.payment_link_paypal || undefined, auto_sync: false, total_synced: 0 },
                ]);
            }
        } catch (error) {
            console.log('Error fetching profile:', error);
        }
    };

    const connectStripe = async () => {
        if (!user || loading) return;

        setLoading(true);
        try {
            const result = await stripeService.initiateOAuth(user.id, {
                // stripe-start resolves the active company from the profile
                // when this value is omitted. Avoid making the connect action
                // depend on the workspace role RPC being available.
                companyId: profile?.active_company_id || profile?.company_id || undefined,
            });
            if (!result.success) throw new Error(result.error || 'Could not connect Stripe');
            await fetchConnections();
            Alert.alert(t('success', language), t('connected', language));
        } catch (error: any) {
            Alert.alert(t('error', language), getLocalizedErrorMessage(error, language, 'couldNotConnectStripe'));
        } finally {
            setLoading(false);
        }
    };

    const handleConnect = async (provider: 'stripe' | 'paypal') => {
        if (provider === 'stripe') {
            await connectStripe();
            return;
        }

        // PayPal uses link input.
        setShowConnectModal(provider);
    };

    const handleSaveLink = async (formData: any) => {
        if (!user || !showConnectModal) return;

        try {
            // PayPal - just save link.
            const link = formData.link;
            const { error } = await supabase.from('profiles').update({ payment_link_paypal: link }).eq('id', user.id);
            if (error) throw error;

            setConnections(prev => prev.map(conn =>
                conn.provider === 'paypal' ? { ...conn, connected: true, account_email: link } : conn
            ));
            Alert.alert(t('success', language), t('paypalLinkSaved', language));
        } catch (error: any) {
            Alert.alert(t('error', language), getLocalizedErrorMessage(error, language));
        } finally {
            setShowConnectModal(null);
        }
    };

    const handleDisconnect = async (provider: 'stripe' | 'paypal', storeId?: string) => {
        Alert.alert(
            t('disconnect', language),
            t('disconnectConfirmation', language).replace('{provider}', provider.charAt(0).toUpperCase() + provider.slice(1)),
            [
                { text: t('cancel', language), style: 'cancel' },
                {
                    text: t('disconnect', language),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            if (provider === 'stripe') {
                                const success = await stripeService.disconnect(user?.id || '', storeId);
                                if (!success) throw new Error('Could not disconnect Stripe');
                            } else {
                                await supabase.from('profiles').update({ payment_link_paypal: null }).eq('id', user?.id);
                            }

                            setConnections(prev => prev.map(conn =>
                                conn.provider === provider && (!storeId || conn.store_id === storeId)
                                    ? { ...conn, connected: false, account_id: undefined, account_email: undefined }
                                    : conn
                            ));

                            Alert.alert(t('success', language), t('disconnectedSuccessfully', language).replace('{provider}', provider));
                        } catch (error) {
                            Alert.alert(t('error', language), t('failedToDisconnect', language));
                        }
                    }
                }
            ]
        );
    };

    const handleSync = async (provider: 'stripe' | 'paypal', storeId?: string) => {
        if (provider !== 'stripe') {
            Alert.alert(t('notAvailable', language), t('paypalSyncUnavailable', language));
            return;
        }

        // Check if Stripe is connected
        const scope = await getWorkspaceScope(user!.id);
        const status = await stripeService.checkConnectionStatus(user!.id, scope.companyIds);
        if (!status.connected) {
            Alert.alert(t('notConnectedAlert', language), t('connectStripeFirst', language));
            return;
        }

        const syncKey = storeId || provider;
        setSyncing(syncKey);

        try {
            const selectedStore = status.stores.find((store) => store.id === storeId) || status.stores.find((store) => store.status === 'connected');
            const result = await stripeService.syncViaEdgeFunction(selectedStore?.id);

            setConnections(prev => prev.map(conn =>
                conn.provider === provider && (!storeId || conn.store_id === storeId)
                    ? { ...conn, last_synced: new Date().toISOString(), total_synced: conn.total_synced + result.transactionsCount }
                    : conn
            ));

            Alert.alert(
                t('syncComplete', language),
                t('syncSummary', language)
                    .replace('{transactions}', String(result.transactionsCount))
                    .replace('{payouts}', String(result.payoutsCount))
                    .replace('{sales}', formatCurrency(result.totalSales))
                    .replace('{fees}', formatCurrency(result.totalFees)),
            );
        } catch (error: any) {
            Alert.alert(t('syncFailed', language), getLocalizedErrorMessage(error, language, 'retry'));
        } finally {
            setSyncing(null);
        }
    };

    const handleAutoSyncToggle = async (provider: 'stripe' | 'paypal', value: boolean, storeId?: string) => {
        setConnections(prev => prev.map(conn =>
            conn.provider === provider && (!storeId || conn.store_id === storeId) ? { ...conn, auto_sync: value } : conn
        ));

        if (provider === 'stripe' && storeId) {
            try {
                await stripeService.updateStoreSettings(storeId, { autoSync: value });
            } catch (_) {
                await fetchConnections();
            }
        }
    };

    const renderProviderCard = (connection: PaymentConnection) => {
        const isStripe = connection.provider === 'stripe';
        const providerColor = isStripe ? '#635bff' : '#003087';
        const providerName = isStripe ? 'Stripe' : 'PayPal';
        const description = isStripe
            ? t('stripeDescription', language)
            : t('paypalDescription', language);

        return (
            <Card key={connection.id} style={styles.providerCard}>
                {/* Header */}
                <View style={styles.providerHeader}>
                    <View style={[styles.providerLogo, { backgroundColor: `${providerColor}15` }]}>
                        {isStripe ? (
                            <Zap color={providerColor} size={28} />
                        ) : (
                            <CreditCard color={providerColor} size={28} />
                        )}
                    </View>
                    <View style={styles.providerInfo}>
                        <Text style={[styles.providerName, { color: textColor }]}>{providerName}</Text>
                        <View style={styles.statusBadge}>
                            <View style={[
                                styles.statusDot,
                                { backgroundColor: connection.connected ? '#12B76A' : '#ef4444' }
                            ]} />
                            <Text style={[styles.statusText, { color: mutedColor }]}>
                                {connection.connected ? t('connected', language) : t('notConnected', language)}
                            </Text>
                        </View>
                    </View>
                </View>

                <Text style={[styles.providerDescription, { color: mutedColor }]}>
                    {description}
                </Text>

                {connection.connected ? (
                    <>
                        {/* Connected Account Info */}
                        {connection.account_email && (
                            <View style={[styles.accountInfo, { backgroundColor: isDark ? '#263A55' : '#F4F7FB' }]}>
                                <Text style={[styles.accountEmail, { color: textColor }]}>
                                {connection.store_name ? `${connection.store_name}${connection.account_email ? ` · ${connection.account_email}` : ''}` : connection.account_email}
                                </Text>
                            </View>
                        )}

                        {/* Stats */}
                        <View style={styles.statsRow}>
                            <View style={styles.statItem}>
                                <DollarSign color={primaryColor} size={16} />
                                <Text style={[styles.statValue, { color: textColor }]}>
                                    {connection.total_synced}
                                </Text>
                                <Text style={[styles.statLabel, { color: mutedColor }]}>
                                    {t('transactions', language)}
                                </Text>
                            </View>
                            {connection.last_synced && (
                                <View style={styles.statItem}>
                                    <Clock color={mutedColor} size={16} />
                                    <Text style={[styles.statValue, { color: textColor }]}>
                                        {formatLocalizedDate(connection.last_synced, language)}
                                    </Text>
                                    <Text style={[styles.statLabel, { color: mutedColor }]}>
                                        {t('lastSynced', language)}
                                    </Text>
                                </View>
                            )}
                        </View>

                        {/* Auto Sync Toggle */}
                        <View style={styles.autoSyncRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.autoSyncLabel, { color: textColor }]}>
                                    {t('autoSync', language)}
                                </Text>
                                <Text style={[styles.autoSyncHint, { color: mutedColor }]}>
                                    {t('syncDailyAutomatically', language)}
                                </Text>
                            </View>
                            <Switch
                                value={connection.auto_sync}
                                onValueChange={(v) => handleAutoSyncToggle(connection.provider, v, connection.store_id)}
                                trackColor={{ true: primaryColor }}
                            />
                        </View>

                        {/* Action Buttons */}
                        <View style={styles.actionRow}>
                            <TouchableOpacity
                                style={[styles.syncButton, { backgroundColor: primaryColor }]}
                                onPress={() => handleSync(connection.provider, connection.store_id)}
                                disabled={syncing === (connection.store_id || connection.provider)}
                            >
                                {syncing === (connection.store_id || connection.provider) ? (
                                    <ActivityIndicator color="#fff" size="small" />
                                ) : (
                                    <>
                                        <RefreshCw color="#fff" size={18} />
                                        <Text style={styles.syncButtonText}>{t('syncPayments', language)}</Text>
                                    </>
                                )}
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.disconnectButton, { borderColor: '#ef4444' }]}
                                onPress={() => handleDisconnect(connection.provider, connection.store_id)}
                            >
                                <X color="#ef4444" size={18} />
                            </TouchableOpacity>

                            {/* View Dashboard Button for Stripe */}
                            {connection.provider === 'stripe' && (
                                <TouchableOpacity
                                    style={[styles.viewDashboardButton, { backgroundColor: '#635bff20', borderColor: '#635bff' }]}
                                    onPress={() => navigation.navigate('StripeDashboard')}
                                >
                                    <CreditCard color="#635bff" size={18} />
                                </TouchableOpacity>
                            )}
                        </View>
                    </>
                ) : (
                    /* Connect Button */
                    <TouchableOpacity
                        style={[styles.connectButton, { backgroundColor: providerColor }]}
                        onPress={() => handleConnect(connection.provider)}
                        disabled={loading && isStripe}
                    >
                        {loading && isStripe ? (
                            <ActivityIndicator color="#fff" size="small" />
                        ) : (
                            <ExternalLink color="#fff" size={18} />
                        )}
                        <Text style={styles.connectButtonText}>
                            {isStripe ? t('connectStripe', language) : t('connectPayPal', language)}
                        </Text>
                    </TouchableOpacity>
                )}
            </Card>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: bgColor }]}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => navigation.goBack()}
                    style={[styles.backButton, { backgroundColor: cardBg }]}
                >
                    <ArrowLeft color={textColor} size={20} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: textColor }]}>
                    {t('paymentIntegrations', language)}
                </Text>
                <View style={{ width: 44 }} />
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Info Card */}
                <Card style={[styles.infoCard, { backgroundColor: `${primaryColor}10` }]}>
                    <View style={styles.infoContent}>
                        <Zap color={primaryColor} size={24} />
                        <View style={styles.infoText}>
                            <Text style={[styles.infoTitle, { color: textColor }]}>
                                {t('onlineSales', language)}
                            </Text>
                            <Text style={[styles.infoDescription, { color: mutedColor }]}>
                                {t('connectPaymentAccountsDescription', language)}
                            </Text>
                        </View>
                    </View>
                </Card>

                {/* Provider Cards */}
                {connections.map(renderProviderCard)}

                {connections.some((connection) => connection.provider === 'stripe' && connection.connected) ? (
                    <Button title="Add another Stripe store" onPress={() => handleConnect('stripe')} style={{ marginBottom: 12 }} />
                ) : null}

                {/* Recent Synced Transactions */}
                {recentTransactions.length > 0 && (
                    <>
                        <Text style={[styles.sectionTitle, { color: textColor, marginTop: 24 }]}>
                            {t('recentSyncedTransactions', language)}
                        </Text>
                        {recentTransactions.map((tx, index) => (
                            <Card key={index} style={styles.transactionCard}>
                                <View style={styles.transactionRow}>
                                    <Text style={[styles.transactionDesc, { color: textColor }]}>
                                        {tx.description}
                                    </Text>
                                    <Text style={[styles.transactionAmount, { color: '#12B76A' }]}>
                                        +{formatCurrency(tx.amount)}
                                    </Text>
                                </View>
                            </Card>
                        ))}
                    </>
                )}

                <View style={{ height: 40 }} />
            </ScrollView>

            <QuickAddModal
                visible={!!showConnectModal}
                onClose={() => setShowConnectModal(null)}
                title={`${t('connect', language)} ${showConnectModal?.toUpperCase()}`}
                onAdd={handleSaveLink}
                fields={[
                    {
                        key: 'link',
                        label: t('paypalPaymentLink', language),
                        placeholder: 'https://paypal.me/...',
                        keyboardType: 'url'
                    }
                ]}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
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
    scroll: { flex: 1 },
    scrollContent: { padding: 16 },

    // Info card
    infoCard: { marginBottom: 20, padding: 16 },
    infoContent: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    infoText: { flex: 1 },
    infoTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
    infoDescription: { fontSize: 13, lineHeight: 18 },

    // Provider card
    providerCard: { padding: 20, marginBottom: 16 },
    providerHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    providerLogo: {
        width: 56,
        height: 56,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    providerInfo: { flex: 1 },
    providerName: { fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
    statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    statusText: { fontSize: 13, fontWeight: '500' },
    providerDescription: { fontSize: 13, lineHeight: 18, marginBottom: 16 },

    // Account info
    accountInfo: { padding: 12, borderRadius: 10, marginBottom: 12 },
    accountEmail: { fontSize: 14, fontWeight: '500' },

    // Stats
    statsRow: { flexDirection: 'row', gap: 20, marginBottom: 16 },
    statItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    statValue: { fontSize: 16, fontWeight: 'bold' },
    statLabel: { fontSize: 11 },

    // Auto sync
    autoSyncRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: '#263A5520',
        marginBottom: 16,
    },
    autoSyncLabel: { fontSize: 14, fontWeight: '600' },
    autoSyncHint: { fontSize: 12, marginTop: 2 },

    // Buttons
    actionRow: { flexDirection: 'row', gap: 10 },
    syncButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 12,
        gap: 8,
    },
    syncButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
    disconnectButton: {
        width: 50,
        height: 50,
        borderRadius: 12,
        borderWidth: 2,
        alignItems: 'center',
        justifyContent: 'center',
    },
    viewDashboardButton: {
        width: 50,
        height: 50,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    connectButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 12,
        gap: 8,
    },
    connectButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },

    // Section
    sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 12 },

    // Transactions
    transactionCard: { padding: 14, marginBottom: 8 },
    transactionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    transactionDesc: { fontSize: 14, fontWeight: '500' },
    transactionAmount: { fontSize: 15, fontWeight: 'bold' },
});
