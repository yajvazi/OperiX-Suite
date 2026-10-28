import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
    ArrowDownUp,
    BarChart3,
    BookOpen,
    Boxes,
    Landmark,
    Scale,
    TrendingUp,
    UsersRound,
    WalletCards,
} from 'lucide-react-native';
import { supabase } from '@invoice-monorepo/api';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { formatCurrency, t } from '@invoice-monorepo/i18n';
import type { TranslationKey } from '@invoice-monorepo/i18n';
import { brand, getPalette } from '../../theme/brand';
import { getWorkspaceScope, hasWorkspacePermission } from '../../services/workspace';
import { activeLocalStore } from '../../services/localMode';
import { isLocalReportType, localReportSummary } from '../../services/localReports';
import type { RootStackParamList } from '../../navigation/types';
import { MetricCard, MobileHeader, MobileScreen, SectionTitle } from '../../components/mobile/MobileUI';

type ReportKey = 'cash_balances' | 'trial_balance' | 'profit_loss' | 'balance_sheet' | 'cash_flow' | 'changes_equity' | 'general_ledger' | 'asset_register' | 'inventory_register' | 'ar_aging' | 'ap_aging';

const REPORT_CARDS: Array<{
    key: ReportKey;
    titleKey: TranslationKey;
    descriptionKey: TranslationKey;
    icon: React.ComponentType<{ color?: string; size?: number }>;
    permission: string;
}> = [
    { key: 'cash_balances', titleKey: 'cashBalances', descriptionKey: 'cashBalancesDescription', icon: WalletCards, permission: 'reports.operational' },
    { key: 'trial_balance', titleKey: 'trialBalance', descriptionKey: 'trialBalanceDescription', icon: Scale, permission: 'reports.operational' },
    { key: 'profit_loss', titleKey: 'profitLoss', descriptionKey: 'profitLossDescription', icon: TrendingUp, permission: 'reports.profit' },
    { key: 'balance_sheet', titleKey: 'balanceSheet', descriptionKey: 'balanceSheetDescription', icon: BarChart3, permission: 'reports.operational' },
    { key: 'cash_flow', titleKey: 'cashFlow', descriptionKey: 'cashFlowDescription', icon: WalletCards, permission: 'reports.operational' },
    { key: 'changes_equity', titleKey: 'changesInEquity', descriptionKey: 'changesInEquityDescription', icon: ArrowDownUp, permission: 'reports.operational' },
    { key: 'general_ledger', titleKey: 'generalLedger', descriptionKey: 'generalLedgerDescription', icon: BookOpen, permission: 'reports.operational' },
    { key: 'asset_register', titleKey: 'assetRegister', descriptionKey: 'assetRegisterDescription', icon: Landmark, permission: 'reports.operational' },
    { key: 'inventory_register', titleKey: 'inventoryRegister', descriptionKey: 'inventoryRegisterDescription', icon: Boxes, permission: 'inventory.view' },
    { key: 'ar_aging', titleKey: 'receivablesAging', descriptionKey: 'receivablesAgingDescription', icon: UsersRound, permission: 'reports.operational' },
    { key: 'ap_aging', titleKey: 'payablesAging', descriptionKey: 'payablesAgingDescription', icon: UsersRound, permission: 'reports.operational' },
];

type Summary = {
    gross_sales: number;
    revenue: number;
    expenses: number;
    net_profit: number;
    ar_outstanding: number;
    ap_outstanding: number;
};

const SUMMARY_CACHE_TTL_MS = 30_000;
const summaryCache = new Map<string, { summary: Summary; expiresAt: number }>();

export function clearReportsSummaryCache() {
    summaryCache.clear();
}

export function ReportsHubScreen() {
    const { user } = useAuth();
    const { isDark, language } = useTheme();
    const palette = getPalette(isDark);
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const [summary, setSummary] = useState<Summary | null>(null);
    const [summaryLoading, setSummaryLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retryToken, setRetryToken] = useState(0);
    const [permissions, setPermissions] = useState<string[]>([]);
    const [platformAdmin, setPlatformAdmin] = useState(false);
    // On the device only the reports that can be built from the local records are offered.
    const [localMode, setLocalMode] = useState(false);

    useFocusEffect(useCallback(() => {
        let active = true;
        const load = async () => {
            if (!user) return;
            setSummaryLoading(true);
            setError(null);
            try {
                const workspace = await getWorkspaceScope(user.id);
                setPermissions(workspace.permissions);
                setPlatformAdmin(workspace.platformAdmin);
                const can = (permission: string) => hasWorkspacePermission(workspace, permission);
                if (!['reports.sales', 'reports.operational', 'reports.profit', 'inventory.view'].some(can)) {
                    throw new Error('REPORT_PERMISSION_REQUIRED');
                }
                const { companyIds } = workspace;
                const localStore = await activeLocalStore();
                if (localStore) {
                    if (active) { setLocalMode(true); setSummary(await localReportSummary(localStore)); }
                    return;
                }
                const cacheKey = `${user.id}:${[...companyIds].sort().join(',')}`;
                const cached = summaryCache.get(cacheKey);
                if (cached && cached.expiresAt > Date.now()) {
                    if (active) setSummary(cached.summary);
                    return;
                }
                const [summaryResult, grossSalesResult] = await Promise.all([
                    can('reports.profit') ? supabase
                        .from('operix_report_summary')
                        .select('revenue, expenses, net_profit, ar_outstanding, ap_outstanding')
                        .in('company_id', companyIds) : Promise.resolve({ data: [], error: null }),
                    can('reports.sales') ? supabase
                        .from('operix_report_gross_sales')
                        .select('company_id, gross_sales')
                        .in('company_id', companyIds) : Promise.resolve({ data: [], error: null }),
                ]);
                if (summaryResult.error) throw summaryResult.error;
                if (grossSalesResult.error) throw grossSalesResult.error;
                const totals = (summaryResult.data || []).reduce<Summary>((result, row) => ({
                    gross_sales: result.gross_sales,
                    revenue: result.revenue + Number(row.revenue || 0),
                    expenses: result.expenses + Number(row.expenses || 0),
                    // Derive this from the same aggregate values shown in the
                    // cards. This keeps the summary internally consistent
                    // even if an older database view returns a stale rounded
                    // net_profit value.
                    net_profit: 0,
                    ar_outstanding: result.ar_outstanding + Number(row.ar_outstanding || 0),
                    ap_outstanding: result.ap_outstanding + Number(row.ap_outstanding || 0),
                }), {
                    gross_sales: (grossSalesResult.data || []).reduce((total, row) => total + Number(row.gross_sales || 0), 0),
                    revenue: 0,
                    expenses: 0,
                    net_profit: 0,
                    ar_outstanding: 0,
                    ap_outstanding: 0,
                });
                totals.net_profit = totals.revenue - totals.expenses;
                summaryCache.set(cacheKey, { summary: totals, expiresAt: Date.now() + SUMMARY_CACHE_TTL_MS });
                if (active) setSummary(totals);
            } catch (loadError) {
                console.error('Reports hub load error:', loadError);
                if (active) setError(loadError instanceof Error && loadError.message === 'REPORT_PERMISSION_REQUIRED' ? 'REPORT_PERMISSION_REQUIRED' : t('financialReportsLoadError', language));
            } finally {
                if (active) setSummaryLoading(false);
            }
        };
        void load();
        return () => { active = false; };
    }, [language, retryToken, user]));

    const metricValue = (value: number | undefined) => summary ? formatCurrency(value || 0) : summaryLoading ? '…' : '—';
    const can = (permission: string) => platformAdmin || permissions.includes(permission);

    return (
        <MobileScreen testID="reports-hub-screen">
            <MobileHeader title={t('reports', language)} subtitle={t('fromAccountingEngine', language)} onBack={() => navigation.goBack()} />
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
                    {error ? <View style={[styles.errorBanner, { backgroundColor: palette.surface, borderColor: palette.border }]}><Text style={[styles.errorText, { color: palette.muted }]}>{error === 'REPORT_PERMISSION_REQUIRED' ? t('permissionDenied', language) : error}</Text><TouchableOpacity onPress={() => { summaryCache.clear(); setError(null); setSummaryLoading(true); setRetryToken((value) => value + 1); }}><Text style={[styles.retryText, { color: brand.colors.primary }]}>{t('retry', language)}</Text></TouchableOpacity></View> : null}
                    {can('reports.sales') ? <View style={styles.metricsRow}><MetricCard label={t('grossSales', language)} value={metricValue(summary?.gross_sales)} /></View> : null}
                    {can('reports.profit') ? <><View style={styles.metricsRow}><MetricCard label={t('revenue', language)} value={metricValue(summary?.revenue)} /><MetricCard label={t('expenses', language)} value={metricValue(summary?.expenses)} tone="warning" /></View><View style={styles.metricsRow}><MetricCard label={t('netProfitLabel', language)} value={metricValue(summary?.net_profit)} tone={(summary?.net_profit || 0) >= 0 ? 'success' : 'danger'} /><MetricCard label={t('receivables', language)} value={metricValue(summary?.ar_outstanding)} tone="warning" /></View></> : null}
                    <SectionTitle title={t('financialStatements', language)} />
                    {REPORT_CARDS.filter((report) => can(report.permission) && (!localMode || isLocalReportType(report.key))).map((report) => {
                        const Icon = report.icon;
                        return (
                            <TouchableOpacity
                                key={report.key}
                                testID={`reports-${report.key}-button`}
                                accessibilityRole="button"
                                accessibilityLabel={`${t('open', language)} ${t(report.titleKey, language)}`}
                                onPress={() => report.key === 'cash_balances' ? navigation.navigate('CashBalances') : navigation.navigate('ReportPreview', { subtype: report.key })}
                                style={[styles.reportCard, { backgroundColor: palette.surface, borderColor: palette.border }]}
                            >
                                <View style={[styles.reportIcon, { backgroundColor: palette.iconSurface }]}><Icon color={brand.colors.primary} size={21} /></View>
                                <View style={styles.reportCopy}>
                                    <Text style={[styles.reportTitle, { color: palette.text }]}>{t(report.titleKey, language)}</Text>
                                    <Text style={[styles.reportDescription, { color: palette.muted }]}>{t(report.descriptionKey, language)}</Text>
                                </View>
                                <Text style={[styles.openLabel, { color: brand.colors.primary }]}>{t('open', language)}</Text>
                            </TouchableOpacity>
                        );
                    })}
                    <View style={{ height: 28 }} />
                </ScrollView>
        </MobileScreen>
    );
}

const styles = StyleSheet.create({
    content: { paddingHorizontal: 20, paddingBottom: 20 },
    errorBanner: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
    errorText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: brand.fonts.regular },
    retryText: { fontSize: 11, fontFamily: brand.fonts.semibold },
    metricsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
    reportCard: { minHeight: 80, borderRadius: 17, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 10, ...brand.shadow.card },
    reportIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    reportCopy: { flex: 1 },
    reportTitle: { fontSize: 14, fontFamily: brand.fonts.semibold },
    reportDescription: { fontSize: 11, lineHeight: 17, fontFamily: brand.fonts.regular, marginTop: 3 },
    openLabel: { fontSize: 11, fontFamily: brand.fonts.semibold, marginLeft: 8 },
});
