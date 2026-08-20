import React, { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
    AlertTriangle,
    BarChart3,
    Bell,
    CheckCircle2,
    ChevronRight,
    CircleDollarSign,
    FileText,
    Package,
    RefreshCw,
    Settings2,
    TrendingDown,
    TrendingUp,
    Users,
    WalletCards,
} from 'lucide-react-native';
import { formatCurrency, t } from '@invoice-monorepo/i18n';
import { useTheme } from '@invoice-monorepo/hooks';
import { OperixCard, OperixIconButton } from '@invoice-monorepo/ui';
import { MobileHeader, MobileScreen } from '../../components/mobile/MobileUI';
import type { RootStackParamList } from '../../navigation/types';
import { getIntelligenceSnapshot } from '../../services/intelligence/operixIntelligence';
import { localizeInsight, type CustomerMetric, type IntelligenceAction, type IntelligenceInsight, type IntelligenceSnapshot, type InventoryMetric } from '../../services/intelligence/analytics';
import { brand, getPalette } from '../../theme/brand';

type Props = { navigation: NativeStackNavigationProp<RootStackParamList, 'OperixAI'> };

function currency(value: number, code: string, language: string) {
    return formatCurrency(value, code, language);
}

function percent(value: number | null) {
    if (value === null) return '—';
    return `${value > 0 ? '+' : ''}${value}%`;
}

function InsightCard({ insight, language, palette, onPress }: { insight: IntelligenceInsight; language: string; palette: ReturnType<typeof getPalette>; onPress: () => void }) {
    const tone = insight.priority === 'important' ? brand.colors.error : insight.priority === 'attention' ? brand.colors.warning : brand.colors.primary;
    const Icon = insight.category === 'inventory' ? Package : insight.category === 'customer' ? Users : insight.category === 'sales' ? (insight.percentChange !== null && insight.percentChange < 0 ? TrendingDown : TrendingUp) : insight.category === 'payment' ? WalletCards : insight.category === 'duplicate' ? AlertTriangle : FileText;
    return (
        <TouchableOpacity accessibilityRole="button" onPress={onPress} style={[styles.insightCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <View style={[styles.insightIcon, { backgroundColor: `${tone}18` }]}><Icon color={tone} size={18} /></View>
            <View style={styles.insightCopy}>
                <View style={styles.insightTitleRow}><Text style={[styles.insightTitle, { color: palette.text }]} numberOfLines={1}>{insight.title}</Text><View style={[styles.priorityDot, { backgroundColor: tone }]} /></View>
                <Text style={[styles.insightDetail, { color: palette.muted }]}>{insight.detail}</Text>
                <Text style={[styles.insightAction, { color: palette.primary }]}>{actionLabel(insight.action, language)}</Text>
            </View>
            <ChevronRight color={palette.muted} size={18} />
        </TouchableOpacity>
    );
}

function actionLabel(action: IntelligenceAction, language: string) {
    if (action.target === 'invoice' || action.target === 'invoices') return t('operixIntelligenceViewInvoice', language);
    if (action.target === 'customer') return t('operixIntelligenceViewCustomer', language);
    if (action.target === 'product' || action.target === 'products') return t('operixIntelligenceViewProduct', language);
    if (action.target === 'expenses') return t('operixIntelligenceViewExpenses', language);
    if (action.target === 'payments') return t('operixIntelligenceViewPayments', language);
    return t('operixIntelligenceViewReport', language);
}

function SectionHeader({ title, count, palette, icon: Icon }: { title: string; count?: number; palette: ReturnType<typeof getPalette>; icon: React.ComponentType<{ color?: string; size?: number }> }) {
    return <View style={styles.sectionHeader}><View style={styles.sectionTitleRow}><View style={[styles.sectionIcon, { backgroundColor: palette.iconSurface }]}><Icon color={palette.primary} size={17} /></View><Text style={[styles.sectionTitle, { color: palette.text }]}>{title}</Text></View>{count !== undefined ? <Text style={[styles.sectionCount, { color: palette.muted }]}>{count}</Text> : null}</View>;
}

function MetricTile({ label, value, tone, palette }: { label: string; value: string | number; tone?: string; palette: ReturnType<typeof getPalette> }) {
    return <View style={[styles.metricTile, { backgroundColor: palette.surfaceMuted }]}><Text style={[styles.metricValue, { color: tone || palette.text }]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text><Text style={[styles.metricLabel, { color: palette.muted }]} numberOfLines={2}>{label}</Text></View>;
}

function CustomerMetricRow({ metric, currencyCode, language, palette, onPress }: { metric: CustomerMetric; currencyCode: string; language: string; palette: ReturnType<typeof getPalette>; onPress: () => void }) {
    const outstanding = metric.outstanding > 0 ? `${t('operixIntelligenceCurrentOutstanding', language)}: ${currency(metric.outstanding, currencyCode, language)}` : t('operixIntelligenceNoOutstanding', language);
    const payment = metric.normalPaymentDays === null ? t('operixIntelligenceNoPaymentHistory', language) : `${t('operixIntelligenceNormalPayment', language)}: ${Math.round(metric.normalPaymentDays)} ${t('days', language)}`;
    return <TouchableOpacity accessibilityRole="button" onPress={onPress} style={[styles.metricRowCard, { backgroundColor: palette.surface, borderColor: palette.border }]}><View style={styles.metricRowCopy}><Text style={[styles.metricRowTitle, { color: palette.text }]} numberOfLines={1}>{metric.name}</Text><Text style={[styles.metricRowDetail, { color: palette.muted }]}>{t('operixIntelligenceLifetimeSales', language)}: {currency(metric.lifetimeSales, currencyCode, language)}</Text><Text style={[styles.metricRowDetail, { color: palette.muted }]}>{payment} · {outstanding}</Text></View><ChevronRight color={palette.muted} size={17} /></TouchableOpacity>;
}

function InventoryVelocityRow({ metric, language, palette, onPress }: { metric: InventoryMetric; language: string; palette: ReturnType<typeof getPalette>; onPress: () => void }) {
    return <TouchableOpacity accessibilityRole="button" onPress={onPress} style={[styles.metricRowCard, { backgroundColor: palette.surface, borderColor: palette.border }]}><View style={styles.metricRowCopy}><Text style={[styles.metricRowTitle, { color: palette.text }]} numberOfLines={1}>{metric.name}</Text><Text style={[styles.metricRowDetail, { color: palette.muted }]}>{metric.averageDailySales} {metric.unit} {t('operixIntelligencePerDay', language)} · {metric.unitsSold} {t('operixIntelligenceUnitsSold', language)}</Text></View><ChevronRight color={palette.muted} size={17} /></TouchableOpacity>;
}

export function OperixIntelligenceScreen({ navigation }: Props) {
    const { isDark, language } = useTheme();
    const palette = getPalette(isDark);
    const locale = language === 'sq' ? 'sq' : 'en';
    const [snapshot, setSnapshot] = useState<IntelligenceSnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async (forceRefresh = false) => {
        setError(null);
        if (forceRefresh) setRefreshing(true);
        else setLoading(true);
        try {
            setSnapshot(await getIntelligenceSnapshot({ locale, forceRefresh }));
        } catch (loadError) {
            console.error('OperiX Intelligence load error:', loadError);
            setError(t('unableToLoad', language));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [language, locale]);

    useFocusEffect(useCallback(() => {
        void load(false);
    }, [load]));

    const openAction = useCallback((action: IntelligenceAction) => {
        if (action.target === 'invoice' && action.id) navigation.navigate('InvoiceDetail', { invoiceId: action.id });
        else if (action.target === 'customer' && action.id) navigation.navigate('CustomerDetail', { clientId: action.id });
        else if (action.target === 'product' && action.id) navigation.navigate('ProductDetail', { productId: action.id });
        else if (action.target === 'invoices') navigation.navigate('InvoicesList', action.params?.status ? { status: action.params.status } : undefined);
        else if (action.target === 'products') navigation.navigate('ProductsList');
        else if (action.target === 'expenses') navigation.navigate('ExpensesList');
        else if (action.target === 'payments') navigation.navigate('PaymentsList');
        else if (action.target === 'notifications') navigation.navigate('Notifications');
        else navigation.navigate('ReportsHub');
    }, [navigation]);

    const attention = useMemo(() => (snapshot?.insights || []).filter((insight) => insight.priority !== 'info'), [snapshot]);
    const recommendations = useMemo(() => (snapshot?.recommendations || []).filter((insight) => !attention.some((item) => item.key === insight.key)), [attention, snapshot]);
    const noData = Boolean(snapshot && !snapshot.hasData);
    const fallbackCommentary = snapshot
        ? snapshot.briefing.salesChangePercent !== null
            ? `${t('operixIntelligenceYesterdaySales', language).replace('{change}', percent(snapshot.briefing.salesChangePercent))} ${snapshot.briefing.overdueCount ? t('operixIntelligenceOverdueSummary', language).replace('{count}', String(snapshot.briefing.overdueCount)) : ''}`.trim()
            : t('operixIntelligenceDeterministicSummary', language)
        : '';

    const renderInsight = (insight: IntelligenceInsight) => <InsightCard key={insight.id} insight={localizeInsight(insight, locale)} language={language} palette={palette} onPress={() => openAction(insight.action)} />;

    return (
        <MobileScreen testID="operix-intelligence-screen" edges={['top', 'bottom']}>
            <MobileHeader
                title={t('operixIntelligence', language)}
                subtitle={t('operixIntelligenceSubtitle', language)}
                right={<View style={styles.headerActions}>
                    <OperixIconButton testID="intelligence-notifications-button" label={t('notifications', language)} variant="ghost" onPress={() => navigation.navigate('Notifications')}><Bell color={palette.text} size={19} /></OperixIconButton>
                    <OperixIconButton testID="intelligence-refresh-button" label={t('operixIntelligenceRefresh', language)} variant="ghost" onPress={() => void load(true)}><RefreshCw color={palette.text} size={19} /></OperixIconButton>
                    <OperixIconButton testID="intelligence-settings-button" label={t('operixIntelligenceSettings', language)} variant="ghost" onPress={() => navigation.navigate('Settings', { screen: 'AdvancedSettings', params: { section: 'intelligence' } })}><Settings2 color={palette.text} size={19} /></OperixIconButton>
                </View>}
            />
            {loading && !snapshot ? <View style={styles.centerState}><ActivityIndicator color={palette.primary} size="small" /><Text style={[styles.stateText, { color: palette.muted }]}>{t('operixIntelligenceLoading', language)}</Text></View> : error && !snapshot ? <View style={styles.centerState}><AlertTriangle color={palette.error} size={25} /><Text style={[styles.stateText, { color: palette.muted }]}>{error}</Text><TouchableOpacity accessibilityRole="button" onPress={() => void load(true)}><Text style={[styles.retryText, { color: palette.primary }]}>{t('retry', language)}</Text></TouchableOpacity></View> : snapshot ? (
                <ScrollView
                    testID="operix-intelligence-scroll"
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void load(true); }} tintColor={palette.primary} />}
                    contentContainerStyle={styles.content}
                >
                    {noData ? <OperixCard variant="soft" style={[styles.learningCard, { borderColor: palette.border, backgroundColor: palette.surface }]}>
                        <View style={[styles.learningIcon, { backgroundColor: palette.iconSurface }]}><CircleDollarSign color={palette.primary} size={23} /></View>
                        <View style={styles.learningCopy}><Text style={[styles.learningTitle, { color: palette.text }]}>{t('operixIntelligenceLearning', language)}</Text><Text style={[styles.learningText, { color: palette.muted }]}>{t('operixIntelligenceNoData', language)}</Text></View>
                    </OperixCard> : null}

                    <View style={[styles.briefingCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                        <View style={styles.briefingHeading}><View><Text style={[styles.eyebrow, { color: palette.muted }]}>{t('operixIntelligenceToday', language)}</Text><Text style={[styles.briefingTitle, { color: palette.text }]}>{t('operixIntelligenceBriefing', language)}</Text></View><View style={[styles.briefingBadge, { backgroundColor: palette.iconSurface }]}><CheckCircle2 color={palette.primary} size={20} /></View></View>
                        <View style={styles.metricsGrid}>
                            <MetricTile label={t('operixIntelligenceIssued', language)} value={currency(snapshot.briefing.revenue, snapshot.currency, language)} tone={palette.text} palette={palette} />
                            <MetricTile label={t('operixIntelligenceCollected', language)} value={currency(snapshot.briefing.paymentsReceived, snapshot.currency, language)} tone={brand.colors.success} palette={palette} />
                            <MetricTile label={t('operixIntelligenceOutstanding', language)} value={currency(snapshot.briefing.outstanding, snapshot.currency, language)} tone={snapshot.briefing.outstanding > 0 ? brand.colors.warning : palette.text} palette={palette} />
                            <MetricTile label={t('operixIntelligenceInvoices', language)} value={snapshot.briefing.invoicesIssued} palette={palette} />
                        </View>
                        <View style={[styles.commentary, { backgroundColor: palette.surfaceMuted }]}><Text style={[styles.commentaryLabel, { color: palette.primary }]}>{t('operixIntelligenceInsight', language)}{snapshot.commentarySource === 'ai' ? '' : ` · ${t('operixIntelligenceCalculated', language)}`}</Text><Text style={[styles.commentaryText, { color: palette.text }]}>{snapshot.commentary || fallbackCommentary}</Text></View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actionRow}>
                            <TouchableOpacity accessibilityRole="button" onPress={() => openAction({ target: 'sales' })} style={[styles.actionChip, { backgroundColor: palette.iconSurface }]}><Text style={[styles.actionChipText, { color: palette.primary }]}>{t('operixIntelligenceViewSales', language)}</Text></TouchableOpacity>
                            <TouchableOpacity accessibilityRole="button" onPress={() => openAction({ target: 'invoices', params: { status: 'overdue' } })} style={[styles.actionChip, { backgroundColor: palette.iconSurface }]}><Text style={[styles.actionChipText, { color: palette.primary }]}>{t('operixIntelligenceViewOverdue', language)}</Text></TouchableOpacity>
                            <TouchableOpacity accessibilityRole="button" onPress={() => openAction({ target: 'products' })} style={[styles.actionChip, { backgroundColor: palette.iconSurface }]}><Text style={[styles.actionChipText, { color: palette.primary }]}>{t('operixIntelligenceViewInventory', language)}</Text></TouchableOpacity>
                        </ScrollView>
                    </View>

                    {attention.length ? <View style={styles.section}><SectionHeader title={t('operixIntelligenceNeedsAttention', language)} count={attention.length} palette={palette} icon={AlertTriangle} />{attention.map(renderInsight)}</View> : null}

                    {snapshot.permissions.invoices ? <View style={styles.section}><SectionHeader title={t('operixIntelligenceInvoice', language)} palette={palette} icon={FileText} /><View style={[styles.sectionCard, { backgroundColor: palette.surface, borderColor: palette.border }]}><View style={styles.metricsGrid}><MetricTile label={t('operixIntelligenceInvoicedThisMonth', language)} value={currency(snapshot.invoice.month.total, snapshot.currency, language)} palette={palette} /><MetricTile label={t('operixIntelligencePaidThisMonth', language)} value={currency(snapshot.invoice.month.paid, snapshot.currency, language)} tone={brand.colors.success} palette={palette} /><MetricTile label={t('operixIntelligenceOutstandingThisMonth', language)} value={currency(snapshot.invoice.month.outstanding, snapshot.currency, language)} tone={brand.colors.warning} palette={palette} /><MetricTile label={t('operixIntelligenceOverdueInvoices', language)} value={snapshot.invoice.overdueCount} tone={snapshot.invoice.overdueCount ? brand.colors.warning : brand.colors.success} palette={palette} /></View><Text style={[styles.sectionHint, { color: palette.muted }]}>{snapshot.invoice.averagePaymentDays !== null ? `${t('operixIntelligenceAveragePaymentTime', language)}: ${Math.round(snapshot.invoice.averagePaymentDays)} ${t('days', language)}` : t('operixIntelligenceNoPaymentHistory', language)}{snapshot.invoice.dueSoonCount ? ` · ${t('operixIntelligenceDueSoon', language).replace('{count}', String(snapshot.invoice.dueSoonCount))}` : ''}</Text></View>{snapshot.invoice.insights.filter((insight) => !attention.some((item) => item.key === insight.key)).map(renderInsight)}</View> : null}

                    {snapshot.permissions.customers ? <View style={styles.section}><SectionHeader title={t('operixIntelligenceCustomer', language)} count={snapshot.customer.metrics.length} palette={palette} icon={Users} />{snapshot.customer.metrics.slice(0, 3).map((metric) => <CustomerMetricRow key={metric.id} metric={metric} currencyCode={snapshot.currency} language={language} palette={palette} onPress={() => openAction({ target: 'customer', id: metric.id })} />)}{snapshot.customer.insights.length ? snapshot.customer.insights.map(renderInsight) : !snapshot.customer.metrics.length ? <View style={[styles.sectionCard, { backgroundColor: palette.surface, borderColor: palette.border }]}><Text style={[styles.sectionHint, { color: palette.muted }]}>{t('operixIntelligenceNoCustomerSignals', language)}</Text></View> : null}</View> : null}

                    {snapshot.permissions.inventory ? <View style={styles.section}><SectionHeader title={t('operixIntelligenceInventory', language)} count={snapshot.inventory.lowStock.length + snapshot.inventory.stockoutRisk.length + snapshot.inventory.slowMoving.length} palette={palette} icon={Package} />{snapshot.inventory.insights.length ? [...new Map([...snapshot.inventory.insights].map((insight) => [insight.key, insight])).values()].map(renderInsight) : null}{snapshot.inventory.fastMoving.length ? <Text style={[styles.sectionHint, { color: palette.muted }]}>{t('operixIntelligenceFastMoving', language)}</Text> : null}{snapshot.inventory.fastMoving.slice(0, 3).map((metric) => <InventoryVelocityRow key={`fast-${metric.id}`} metric={metric} language={language} palette={palette} onPress={() => openAction({ target: 'product', id: metric.id })} />)}{!snapshot.inventory.insights.length && !snapshot.inventory.fastMoving.length ? <View style={[styles.sectionCard, { backgroundColor: palette.surface, borderColor: palette.border }]}><Text style={[styles.sectionHint, { color: palette.muted }]}>{t('operixIntelligenceNoInventorySignals', language)}</Text></View> : null}{snapshot.inventory.metrics.some((metric) => !metric.reliableForecast) ? <Text style={[styles.insufficientText, { color: palette.muted }]}>{t('operixIntelligenceInsufficientHistory', language)}</Text> : null}</View> : null}

                    {snapshot.permissions.sales ? <View style={styles.section}><SectionHeader title={t('operixIntelligenceSales', language)} palette={palette} icon={BarChart3} /><View style={[styles.sectionCard, { backgroundColor: palette.surface, borderColor: palette.border }]}><View style={styles.salesHero}><Text style={[styles.salesAmount, { color: palette.text }]}>{currency(snapshot.sales.monthRevenue, snapshot.currency, language)}</Text><Text style={[styles.changeText, { color: snapshot.sales.monthChangePercent !== null && snapshot.sales.monthChangePercent >= 0 ? brand.colors.success : brand.colors.warning }]}>{percent(snapshot.sales.monthChangePercent)} {t('operixIntelligenceVsLastMonth', language)}</Text></View><View style={styles.detailGrid}><MetricTile label={t('operixIntelligenceAverageInvoice', language)} value={currency(snapshot.sales.averageInvoice, snapshot.currency, language)} palette={palette} /><MetricTile label={t('operixIntelligenceBestSalesDay', language)} value={snapshot.sales.bestSalesDay ? `${snapshot.sales.bestSalesDay.date} · ${currency(snapshot.sales.bestSalesDay.amount, snapshot.currency, language)}` : '—'} palette={palette} /><MetricTile label={t('operixIntelligenceTopCustomer', language)} value={snapshot.sales.topCustomer ? `${snapshot.sales.topCustomer.name} · ${currency(snapshot.sales.topCustomer.amount, snapshot.currency, language)}` : '—'} palette={palette} /><MetricTile label={t('operixIntelligenceTopProduct', language)} value={snapshot.sales.topProduct ? `${snapshot.sales.topProduct.name} · ${snapshot.sales.topProduct.units}` : '—'} palette={palette} /></View></View>{snapshot.sales.insights.filter((insight) => !attention.some((item) => item.key === insight.key)).map(renderInsight)}</View> : null}

                    {snapshot.permissions.payments ? <View style={styles.section}><SectionHeader title={t('operixIntelligencePayments', language)} palette={palette} icon={WalletCards} /><View style={[styles.sectionCard, { backgroundColor: palette.surface, borderColor: palette.border }]}><View style={styles.metricsGrid}><MetricTile label={t('operixIntelligenceCollectedYesterday', language)} value={currency(snapshot.payments.yesterday, snapshot.currency, language)} tone={brand.colors.success} palette={palette} /><MetricTile label={t('operixIntelligenceCollectedThisMonth', language)} value={currency(snapshot.payments.month, snapshot.currency, language)} tone={brand.colors.success} palette={palette} /><MetricTile label={t('operixIntelligenceOutstandingTotal', language)} value={currency(snapshot.payments.outstanding, snapshot.currency, language)} tone={brand.colors.warning} palette={palette} /><MetricTile label={t('operixIntelligenceOverdueTotal', language)} value={currency(snapshot.payments.overdue, snapshot.currency, language)} tone={snapshot.payments.overdue ? brand.colors.warning : brand.colors.success} palette={palette} /></View><Text style={[styles.sectionHint, { color: palette.muted }]}>{snapshot.payments.averageDelayDays !== null ? `${t('operixIntelligenceAverageDelay', language)}: ${Math.round(snapshot.payments.averageDelayDays)} ${t('days', language)}` : t('operixIntelligenceNoPaymentHistory', language)}</Text></View>{snapshot.payments.insights.filter((insight) => !attention.some((item) => item.key === insight.key)).map(renderInsight)}</View> : null}

                    {recommendations.length ? <View style={styles.section}><SectionHeader title={t('operixIntelligenceRecommendations', language)} palette={palette} icon={CheckCircle2} />{recommendations.map(renderInsight)}</View> : null}
                    {error ? <Text style={[styles.refreshError, { color: palette.warning }]}>{error}</Text> : null}
                    <View style={styles.footerSpace} />
                </ScrollView>
            ) : null}
        </MobileScreen>
    );
}

const styles = StyleSheet.create({
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 1 },
    content: { paddingHorizontal: 18, paddingBottom: 24 },
    centerState: { flex: 1, minHeight: 420, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 30 },
    stateText: { fontSize: 13, lineHeight: 20, textAlign: 'center', fontFamily: brand.fonts.regular },
    retryText: { fontSize: 13, fontFamily: brand.fonts.semibold, marginTop: 4 },
    learningCard: { flexDirection: 'row', alignItems: 'center', padding: 15, borderWidth: 1, borderRadius: 18, marginBottom: 12 },
    learningIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
    learningCopy: { flex: 1 },
    learningTitle: { fontSize: 14, fontFamily: brand.fonts.semibold },
    learningText: { fontSize: 12, lineHeight: 18, marginTop: 4, fontFamily: brand.fonts.regular },
    briefingCard: { borderWidth: 1, borderRadius: 20, padding: 16, marginBottom: 23, ...brand.shadow.card },
    briefingHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 },
    eyebrow: { fontSize: 11, fontFamily: brand.fonts.medium, textTransform: 'uppercase', letterSpacing: 0.7 },
    briefingTitle: { fontSize: 20, fontFamily: brand.fonts.semibold, marginTop: 3 },
    briefingBadge: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    metricTile: { width: '48.5%', minHeight: 67, borderRadius: 13, padding: 10, justifyContent: 'center' },
    metricValue: { fontSize: 16, fontFamily: brand.fonts.semibold },
    metricLabel: { fontSize: 10, lineHeight: 14, marginTop: 4, fontFamily: brand.fonts.medium },
    commentary: { borderRadius: 14, padding: 12, marginTop: 12 },
    commentaryLabel: { fontSize: 10, fontFamily: brand.fonts.semibold, textTransform: 'uppercase', letterSpacing: 0.4 },
    commentaryText: { fontSize: 13, lineHeight: 19, marginTop: 5, fontFamily: brand.fonts.regular },
    actionRow: { gap: 8, paddingTop: 12 },
    actionChip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9 },
    actionChipText: { fontSize: 11, fontFamily: brand.fonts.semibold },
    section: { marginBottom: 22 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    sectionIcon: { width: 31, height: 31, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    sectionTitle: { fontSize: 17, fontFamily: brand.fonts.semibold },
    sectionCount: { fontSize: 12, fontFamily: brand.fonts.medium },
    sectionCard: { borderWidth: 1, borderRadius: 17, padding: 13 },
    metricRowCard: { minHeight: 70, borderWidth: 1, borderRadius: 17, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    metricRowCopy: { flex: 1, minWidth: 0 },
    metricRowTitle: { fontSize: 13, fontFamily: brand.fonts.semibold },
    metricRowDetail: { fontSize: 11, lineHeight: 17, marginTop: 3, fontFamily: brand.fonts.regular },
    sectionHint: { fontSize: 12, lineHeight: 18, marginTop: 11, fontFamily: brand.fonts.regular },
    insufficientText: { fontSize: 11, lineHeight: 17, marginTop: 8, fontFamily: brand.fonts.regular },
    insightCard: { minHeight: 82, borderWidth: 1, borderRadius: 17, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    insightIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    insightCopy: { flex: 1, minWidth: 0 },
    insightTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    insightTitle: { flex: 1, fontSize: 13, fontFamily: brand.fonts.semibold },
    priorityDot: { width: 6, height: 6, borderRadius: 3 },
    insightDetail: { fontSize: 11, lineHeight: 17, marginTop: 3, fontFamily: brand.fonts.regular },
    insightAction: { fontSize: 11, marginTop: 6, fontFamily: brand.fonts.semibold },
    salesHero: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
    salesAmount: { fontSize: 25, fontFamily: brand.fonts.semibold },
    changeText: { fontSize: 12, fontFamily: brand.fonts.semibold },
    detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
    refreshError: { fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 4, fontFamily: brand.fonts.regular },
    footerSpace: { height: 70 },
});
