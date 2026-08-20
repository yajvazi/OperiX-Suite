import React, { useCallback, useMemo, useState } from 'react';
import {
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
    AlertTriangle,
    Bell,
    ChevronRight,
    CircleDollarSign,
    FileText,
    HandCoins,
    Package,
    Receipt,
    Search,
    Sparkles,
    UserPlus,
    WalletCards,
} from 'lucide-react-native';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { formatCurrency, formatDate as formatLocalizedDate, t } from '@invoice-monorepo/i18n';
import { repairUnpostedExpenses, supabase } from '@invoice-monorepo/api';
import type { Profile } from '@invoice-monorepo/types';
import { brand, getPalette } from '../../theme/brand';
import { getActiveProductCompanyIds, getWorkspaceScope, scopedResource } from '../../services/workspace';
import { mobileCacheKey, readMobileCache, writeMobileCache } from '../../services/mobileCache';
import type { RootStackParamList } from '../../navigation/types';
import {
    Avatar,
    EmptyState,
    ErrorState,
    GlobalCreateButton,
    IconButton,
    LoadingState,
    MetricCard,
    MobileScreen,
    SectionTitle,
    ShortcutRow,
    mobileStyles,
} from '../../components/mobile/MobileUI';

type ActivityItem = {
    id: string;
    title: string;
    detail: string;
    amount?: number;
    kind: 'invoice' | 'payment' | 'expense';
    date: string;
    invoiceId?: string;
    paymentId?: string;
    expenseId?: string;
};

type HomeData = {
    revenueToday: number;
    salesToday: number;
    outstanding: number;
    overdue: number;
    cashFlow: number;
    totalAvailableFunds: number;
    paymentsReceived: number;
    lowStockCount: number;
    recentActivity: ActivityItem[];
};

const emptyData: HomeData = {
    revenueToday: 0,
    salesToday: 0,
    outstanding: 0,
    overdue: 0,
    cashFlow: 0,
    totalAvailableFunds: 0,
    paymentsReceived: 0,
    lowStockCount: 0,
    recentActivity: [],
};

function dayGreeting(language: string) {
    const hour = new Date().getHours();
    if (hour < 12) return t('goodMorning', language);
    if (hour < 18) return t('goodAfternoon', language);
    return t('goodEvening', language);
}

function formatActivityDate(date: string, language: string) {
    return formatLocalizedDate(date, language);
}

export function HomeScreen() {
    const { user } = useAuth();
    const { isDark, primaryColor, language } = useTheme();
    const palette = getPalette(isDark);
    const quickIconBackgrounds = {
        invoice: isDark ? 'rgba(0, 79, 254, 0.22)' : palette.iconSurface,
        customer: isDark ? 'rgba(18, 183, 106, 0.18)' : brand.colors.successSoft,
        expense: isDark ? 'rgba(245, 158, 11, 0.18)' : '#FFF6D9',
        payment: isDark ? 'rgba(6, 182, 212, 0.18)' : '#E8FAFD',
    };
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const [profile, setProfile] = useState<Profile | null>(null);
    const [workspaceRole, setWorkspaceRole] = useState<'super_administrator' | 'company_administrator' | 'manager' | 'employee'>('employee');
    const [data, setData] = useState<HomeData>(emptyData);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        if (!user) return;
        setError(null);
        try {
            const workspaceScope = await getWorkspaceScope(user.id);
            const { profile: workspaceProfile, companyIds, company: activeCompany } = workspaceScope;
            try {
                await repairUnpostedExpenses(supabase, companyIds);
            } catch (repairError) {
                // Keep the dashboard available on older deployments before the
                // expense repair function has been applied.
                console.warn('Unable to repair legacy expense postings:', repairError);
            }
            setWorkspaceRole(workspaceScope.roleCode);
            setProfile({ ...workspaceProfile, company_name: activeCompany?.company_name || workspaceProfile.company_name });
            const scope = scopedResource(user.id, companyIds);
            const productScope = scopedResource(user.id, getActiveProductCompanyIds(workspaceScope));
            const cacheKey = mobileCacheKey('home', user.id, companyIds);
            const cachedData = await readMobileCache<HomeData>(cacheKey);
            if (cachedData) {
                // Older home-cache entries do not contain the cash-flow metric.
                setData({
                    ...emptyData,
                    ...cachedData,
                    cashFlow: Number(cachedData.cashFlow || 0),
                    totalAvailableFunds: Number(cachedData.totalAvailableFunds || 0),
                });
                setLoading(false);
            }
            const [invoiceResult, paymentResult, expenseResult, productResult, cashFlowResult, fundBalancesResult, receivablesResult] = await Promise.all([
                supabase
                    .from('invoices')
                    .select('id, invoice_number, status, total_amount, amount_received, issue_date, due_date, created_at, client:clients(name)')
                    .or(scope)
                    .eq('type', 'invoice')
                    .order('created_at', { ascending: false })
                    .limit(80),
                supabase
                    .from('payments')
                    .select('id, payment_number, amount, payment_date, created_at, client:clients(name)')
                    .or(scope)
                    .neq('accounting_state', 'reversed')
                    .order('payment_date', { ascending: false })
                    .limit(30),
                supabase
                    .from('expenses')
                    .select('id, amount, category, description, date, type, created_at')
                    .or(scope)
                    .order('date', { ascending: false })
                    .limit(30),
                supabase
                    .from('products')
                    .select('id, track_stock, stock_quantity, low_stock_threshold')
                    .or(productScope)
                    .eq('track_stock', true)
                    .limit(100),
                supabase
                    .from('operix_cash_flow')
                    .select('net_change')
                    .in('company_id', companyIds),
                supabase
                    .from('operix_fund_balances')
                    .select('balance')
                    .in('company_id', companyIds)
                    .eq('is_active', true),
                supabase
                    .from('operix_ar_aging')
                    .select('outstanding_amount')
                    .in('company_id', companyIds),
            ]);

            if (invoiceResult.error) throw invoiceResult.error;
            if (paymentResult.error) throw paymentResult.error;
            if (expenseResult.error) throw expenseResult.error;
            if (productResult.error) throw productResult.error;
            if (cashFlowResult.error) throw cashFlowResult.error;
            if (fundBalancesResult.error) throw fundBalancesResult.error;
            if (receivablesResult.error) console.warn('Unable to load receivables view:', receivablesResult.error);

            const invoices = (invoiceResult.data || []) as Array<Record<string, any>>;
            const payments = (paymentResult.data || []) as Array<Record<string, any>>;
            const expenses = (expenseResult.data || []) as Array<Record<string, any>>;
            const products = (productResult.data || []) as Array<Record<string, any>>;
            const cashFlowRows = (cashFlowResult.data || []) as Array<Record<string, any>>;
            const fundBalanceRows = (fundBalancesResult.data || []) as Array<Record<string, any>>;
            const uniqueFundBalanceRows = Array.from(new Map(fundBalanceRows.map((row) => [String(row.id), row])).values());
            const receivablesRows = (receivablesResult.data || []) as Array<Record<string, any>>;
            const today = new Date().toISOString().slice(0, 10);
            const todayInvoices = invoices.filter((invoice) => String(invoice.issue_date).slice(0, 10) === today && invoice.status !== 'cancelled');
            const todayPayments = payments.filter((payment) => String(payment.payment_date).slice(0, 10) === today);
            const outstandingStatuses = new Set(['draft', 'sent', 'pending', 'partial', 'overdue']);
            const fallbackOutstanding = invoices
                .filter((invoice) => outstandingStatuses.has(String(invoice.status).toLowerCase()))
                .reduce((sum, invoice) => sum + Math.max(0, Number(invoice.total_amount || 0) - Number(invoice.amount_received || 0)), 0);

            const activity: ActivityItem[] = [
                ...invoices.slice(0, 6).map((invoice) => ({
                    id: `invoice-${invoice.id}`,
                    title: `${t('invoice', language)} ${invoice.invoice_number || ''}`.trim(),
                    detail: invoice.client?.name || t('noClientAssigned', language),
                    amount: Number(invoice.total_amount || 0),
                    kind: 'invoice' as const,
                    date: invoice.created_at || invoice.issue_date,
                    invoiceId: invoice.id,
                })),
                ...payments.slice(0, 4).map((payment) => ({
                    id: `payment-${payment.id}`,
                    title: t('paymentReceived', language),
                    detail: payment.client?.name || t('incomePayment', language),
                    amount: Number(payment.amount || 0),
                    kind: 'payment' as const,
                    date: payment.created_at || payment.payment_date,
                    paymentId: payment.id,
                })),
                ...expenses.slice(0, 4).map((expense) => ({
                    id: `expense-${expense.id}`,
                    title: expense.category || t('expense', language),
                    detail: expense.description || t('businessExpense', language),
                    amount: Number(expense.amount || 0),
                    kind: 'expense' as const,
                    date: expense.created_at || expense.date,
                    expenseId: expense.id,
                })),
            ]
                .filter((item) => item.date)
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .slice(0, 8);

            const nextData = {
                revenueToday: todayInvoices.reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0),
                salesToday: todayInvoices.length,
                outstanding: receivablesResult.error
                    ? fallbackOutstanding
                    : receivablesRows.reduce((sum, row) => sum + Math.max(0, Number(row.outstanding_amount || 0)), 0),
                overdue: invoices.filter((invoice) => invoice.status === 'overdue').reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0),
                cashFlow: cashFlowRows.reduce((sum, row) => sum + Number(row.net_change || 0), 0),
                totalAvailableFunds: uniqueFundBalanceRows.reduce((sum, row) => sum + Number(row.balance || 0), 0),
                paymentsReceived: todayPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
                lowStockCount: products.filter((product) => Number(product.stock_quantity || 0) <= Number(product.low_stock_threshold || 5)).length,
                recentActivity: activity,
            };
            setData(nextData);
            writeMobileCache(cacheKey, nextData);
        } catch (fetchError: any) {
            console.error('Home data error:', fetchError);
            setError(t('unableToLoad', language));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [language, user]);

    useFocusEffect(useCallback(() => { void fetchData(); }, [fetchData]));

    const initials = useMemo(() => (profile?.company_name || user?.email || 'O').slice(0, 1).toUpperCase(), [profile?.company_name, user?.email]);

    const openSales = () => navigation.navigate('MainTabs', { screen: 'Sales' });
    const openInvoiceBuilder = () => navigation.navigate('MainTabs', { screen: 'POS' });

    const renderActivity = ({ item }: { item: ActivityItem }) => {
        const Icon = item.kind === 'payment' ? HandCoins : item.kind === 'expense' ? WalletCards : Receipt;
        const iconColor = item.kind === 'payment' ? brand.colors.success : item.kind === 'expense' ? brand.colors.warning : brand.colors.primary;
        return (
            <TouchableOpacity
                testID={`home-activity-${item.kind}-${item.invoiceId || item.paymentId || item.expenseId || item.id}`}
                accessibilityRole="button"
                onPress={() => {
                    if (item.invoiceId) navigation.navigate('InvoiceDetail', { invoiceId: item.invoiceId });
                    else if (item.paymentId) navigation.navigate('PaymentForm', { paymentId: item.paymentId });
                    else if (item.expenseId) navigation.navigate('ExpenseForm', { expenseId: item.expenseId });
                }}
                disabled={!item.invoiceId && !item.paymentId && !item.expenseId}
                style={[styles.activityRow, { borderBottomColor: palette.border }]}
            >
                <View style={[styles.activityIcon, { backgroundColor: `${iconColor}15` }]}><Icon color={iconColor} size={17} /></View>
                <View style={styles.activityCopy}>
                    <Text style={[styles.activityTitle, { color: palette.text }]} numberOfLines={1}>{item.title}</Text>
                    <Text style={[styles.activityDetail, { color: palette.muted }]} numberOfLines={1}>{item.detail} · {formatActivityDate(item.date, language)}</Text>
                </View>
                {item.amount !== undefined ? <Text style={[styles.activityAmount, { color: item.kind === 'expense' ? palette.text : item.kind === 'payment' ? brand.colors.success : palette.text }]}>{item.kind === 'expense' ? '-' : item.kind === 'payment' ? '+' : ''}{formatCurrency(item.amount)}</Text> : null}
            </TouchableOpacity>
        );
    };

    return (
        <MobileScreen testID="home-screen">
            <View style={styles.header}>
                <TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate('Settings', { screen: 'ManageCompanies' })} style={styles.companyHeader}>
                    <Avatar label={initials} />
                    <View style={styles.companyCopy}>
                        <Text style={[styles.greeting, { color: palette.muted }]}>{dayGreeting(language)}</Text>
                        <Text style={[styles.companyName, { color: palette.text }]} numberOfLines={1}>{profile?.company_name || t('yourBusiness', language)}</Text>
                    </View>
                    <ChevronRight color={palette.muted} size={16} />
                </TouchableOpacity>
                <View style={styles.headerActions}>
                    <IconButton testID="home-global-search-button" label={t('searchYourBusiness', language)} onPress={() => navigation.navigate('GlobalSearch')}><Search color={palette.text} size={20} /></IconButton>
                    <IconButton label={t('notifications', language)} onPress={() => navigation.navigate('Notifications') }><Bell color={palette.text} size={20} /></IconButton>
                </View>
            </View>

            {loading ? <LoadingState label={t('openingWorkspace', language)} /> : error ? <ErrorState onRetry={() => { setLoading(true); void fetchData(); }} message={error} /> : (
                <FlatList
                    testID="home-refreshable-list"
                    data={data.recentActivity}
                    keyExtractor={(item) => item.id}
                    renderItem={renderActivity}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl testID="home-refresh-control" refreshing={refreshing} onRefresh={() => { setRefreshing(true); void fetchData(); }} tintColor={primaryColor} />}
                    contentContainerStyle={styles.content}
                    ListHeaderComponent={(
                        <>
                            <View style={[styles.revenueCard, { backgroundColor: primaryColor }]}>
                                <View style={styles.revenueCardTop}>
                                    <View>
                                        <Text style={styles.revenueLabel}>{t('revenueToday', language)}</Text>
                                        <Text style={styles.revenueValue}>{formatCurrency(data.revenueToday)}</Text>
                                    </View>
                                    <View style={styles.revenueIcon}><CircleDollarSign color="#fff" size={22} /></View>
                                </View>
                                <View style={styles.revenueFooter}>
                                    <Text style={styles.revenueFooterText}>{data.salesToday} {data.salesToday === 1 ? t('sale', language) : t('salesToday', language)}</Text>
                                    <Text style={styles.revenueFooterText}>{data.paymentsReceived ? `${formatCurrency(data.paymentsReceived)} ${t('received', language)}` : t('noPaymentsRecordedYet', language)}</Text>
                                </View>
                            </View>

                            <View style={styles.metricRow}>
                                <TouchableOpacity
                                    testID="home-sales-card"
                                    accessibilityRole="button"
                                    accessibilityLabel={t('sales', language)}
                                    onPress={openSales}
                                    style={styles.metricSalesTouchable}
                                >
                                    <MetricCard style={[styles.metricCard, { backgroundColor: palette.surface, borderColor: palette.border }]} label={t('sales', language)} value={data.salesToday} icon={Receipt} valueStyle={styles.metricSalesValue} />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    testID="home-total-cash-card"
                                    accessibilityRole="button"
                                    accessibilityLabel={t('totalAvailableFunds', language)}
                                    onPress={() => navigation.navigate('CashBalances')}
                                    style={styles.metricEqualTouchable}
                                >
                                    <MetricCard
                                        style={[styles.metricCard, { backgroundColor: palette.surface, borderColor: palette.border }]}
                                        label={t('totalAvailableFunds', language)}
                                        value={formatCurrency(data.totalAvailableFunds)}
                                        tone={data.totalAvailableFunds >= 0 ? 'success' : 'danger'}
                                        icon={CircleDollarSign}
                                        valueStyle={styles.metricTotalValue}
                                    />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    testID="home-outstanding-card"
                                    accessibilityRole="button"
                                    accessibilityLabel={t('moneyWaitingFor', language)}
                                    onPress={() => navigation.navigate('ReportsHub')}
                                    style={styles.metricEqualTouchable}
                                >
                                    <MetricCard
                                        style={[styles.metricCard, { backgroundColor: palette.surface, borderColor: palette.border }]}
                                        label={t('moneyWaitingFor', language)}
                                        value={formatCurrency(data.outstanding)}
                                        tone={data.outstanding > 0 ? 'warning' : 'success'}
                                        icon={HandCoins}
                                        valueStyle={styles.metricOutstandingValue}
                                    />
                                </TouchableOpacity>
                            </View>

                            <TouchableOpacity testID="home-intelligence-card" accessibilityRole="button" onPress={() => navigation.navigate('OperixAI')} style={[styles.intelligenceCard, { backgroundColor: palette.surface, borderColor: palette.border }]}> 
                                <View style={[styles.intelligenceIcon, { backgroundColor: palette.iconSurface }]}><Sparkles color={brand.colors.primary} size={18} /></View>
                                <View style={styles.intelligenceCopy}><Text style={[styles.intelligenceTitle, { color: palette.text }]}>{t('operixIntelligence', language)}</Text><Text style={[styles.intelligenceDetail, { color: palette.muted }]}>{data.overdue > 0 || data.lowStockCount > 0 ? `${data.overdue > 0 ? `${t('operixIntelligenceOverdueTotal', language)} ${formatCurrency(data.overdue)}` : ''}${data.overdue > 0 && data.lowStockCount > 0 ? ' · ' : ''}${data.lowStockCount > 0 ? `${data.lowStockCount} ${t('operixIntelligenceLowStock', language)}` : ''}` : t('operixIntelligenceNoActiveAlerts', language)}</Text></View><ChevronRight color={palette.muted} size={18} />
                            </TouchableOpacity>

                            <SectionTitle title={t('quickActions', language)} action={t('viewAll', language)} onPress={() => navigation.navigate('GlobalSearch')} />
                            <View style={styles.quickGrid}>
                                <TouchableOpacity testID="home-new-invoice-button" accessibilityRole="button" onPress={openInvoiceBuilder} style={[styles.quickAction, { backgroundColor: palette.surface, borderColor: palette.border }]}> 
                                    <View style={[styles.quickIcon, { backgroundColor: quickIconBackgrounds.invoice }]}><FileText color={brand.colors.primary} size={19} /></View>
                                    <Text style={[styles.quickText, { color: palette.text }]}>{t('newInvoice', language)}</Text>
                                </TouchableOpacity>
                                {workspaceRole !== 'employee' ? <TouchableOpacity testID="home-new-customer-button" accessibilityRole="button" onPress={() => navigation.navigate('ClientForm')} style={[styles.quickAction, { backgroundColor: palette.surface, borderColor: palette.border }]}> 
                                    <View style={[styles.quickIcon, { backgroundColor: quickIconBackgrounds.customer }]}><UserPlus color={brand.colors.success} size={19} /></View>
                                    <Text style={[styles.quickText, { color: palette.text }]}>{t('customer', language)}</Text>
                                </TouchableOpacity> : null}
                                {workspaceRole !== 'employee' ? <TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate('ExpenseForm')} style={[styles.quickAction, { backgroundColor: palette.surface, borderColor: palette.border }]}> 
                                    <View style={[styles.quickIcon, { backgroundColor: quickIconBackgrounds.expense }]}><WalletCards color={brand.colors.warning} size={19} /></View>
                                    <Text style={[styles.quickText, { color: palette.text }]}>{t('expense', language)}</Text>
                                </TouchableOpacity> : null}
                                {workspaceRole !== 'employee' ? <TouchableOpacity testID="home-new-payment-button" accessibilityRole="button" onPress={() => navigation.navigate('PaymentForm')} style={[styles.quickAction, { backgroundColor: palette.surface, borderColor: palette.border }]}> 
                                    <View style={[styles.quickIcon, { backgroundColor: quickIconBackgrounds.payment }]}><HandCoins color={brand.colors.info} size={19} /></View>
                                    <Text style={[styles.quickText, { color: palette.text }]}>{t('incomePayment', language)}</Text>
                                </TouchableOpacity> : null}
                            </View>

                            {data.lowStockCount > 0 ? <ShortcutRow icon={Package} title={`${data.lowStockCount} ${t('stockAlerts', language)}`} description={t('reviewProducts', language)} onPress={() => navigation.navigate('MainTabs', { screen: 'Business' })} trailing={<ChevronRight color={palette.muted} size={18} />} /> : null}
                            {data.overdue > 0 ? <ShortcutRow icon={AlertTriangle} title={t('invoicesNeedAttention', language)} description={t('followUpOverdue', language)} onPress={openSales} trailing={<ChevronRight color={palette.muted} size={18} />} /> : null}

                            <SectionTitle title={t('recentActivity', language)} action={data.recentActivity.length ? undefined : undefined} />
                            {!data.recentActivity.length ? <EmptyState title={t('nothingHereYet', language)} description={t('createInvoicePaymentExpense', language)} icon={Sparkles} /> : null}
                        </>
                    )}
                    ListEmptyComponent={null}
                    ListFooterComponent={<View style={{ height: 100 }} />}
                />
            )}
            <GlobalCreateButton />
        </MobileScreen>
    );
}

const styles = StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 7, paddingBottom: 12 },
    companyHeader: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 44 },
    companyCopy: { flex: 1, marginLeft: 10, marginRight: 4 },
    greeting: { fontSize: 11, fontFamily: brand.fonts.medium },
    companyName: { fontSize: 14, fontFamily: brand.fonts.semibold, marginTop: 2 },
    headerActions: { flexDirection: 'row', gap: 8 },
    content: { paddingHorizontal: 20, paddingBottom: 20 },
    revenueCard: { borderRadius: 20, padding: 19, marginBottom: 12, ...brand.shadow.floating },
    revenueCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    revenueLabel: { color: 'rgba(255,255,255,0.78)', fontSize: 12, fontFamily: brand.fonts.medium },
    revenueValue: { color: '#fff', fontSize: 30, lineHeight: 38, fontFamily: brand.fonts.semibold, marginTop: 4 },
    revenueIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
    revenueFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.18)' },
    revenueFooterText: { color: 'rgba(255,255,255,0.84)', fontSize: 11, fontFamily: brand.fonts.medium },
    metricRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8, marginBottom: 24 },
    metricSalesTouchable: { flex: 1, minWidth: 0 },
    metricEqualTouchable: { flex: 1, minWidth: 0 },
    metricCard: { flex: 1, minWidth: 0, minHeight: 112, alignSelf: 'stretch' },
    metricSalesValue: { fontSize: 29, lineHeight: 35, textAlign: 'center', fontFamily: brand.fonts.semibold, letterSpacing: -0.35 },
    metricOutstandingValue: { fontSize: 29, lineHeight: 35, textAlign: 'center', fontFamily: brand.fonts.semibold, letterSpacing: -0.35 },
    metricTotalValue: { fontSize: 29, lineHeight: 35, textAlign: 'center', fontFamily: brand.fonts.semibold, letterSpacing: -0.35 },
    quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 14 },
    quickAction: { width: '48.5%', minHeight: 72, borderRadius: 16, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
    quickIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    quickText: { fontSize: 13, fontFamily: brand.fonts.semibold },
    intelligenceCard: { minHeight: 70, borderRadius: 17, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 21 },
    intelligenceIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    intelligenceCopy: { flex: 1 },
    intelligenceTitle: { fontSize: 13, fontFamily: brand.fonts.semibold },
    intelligenceDetail: { fontSize: 11, lineHeight: 16, marginTop: 3, fontFamily: brand.fonts.regular },
    activityRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, gap: 11 },
    activityIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    activityCopy: { flex: 1 },
    activityTitle: { fontSize: 13, fontFamily: brand.fonts.semibold },
    activityDetail: { fontSize: 11, fontFamily: brand.fonts.regular, marginTop: 3 },
    activityAmount: { fontSize: 12, fontFamily: brand.fonts.semibold, marginLeft: 8 },
});
