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
import { resolveCommercialDocumentType } from '@invoice-monorepo/commercial-documents';
import type { TranslationKey } from '@invoice-monorepo/i18n';
import { brand, getPalette } from '../../theme/brand';
import { getWorkspaceScope } from '../../services/workspace';
import type { RootStackParamList } from '../../navigation/types';
import { ErrorState, LoadingState, MetricCard, MobileHeader, MobileScreen, SectionTitle } from '../../components/mobile/MobileUI';

type ReportKey = 'cash_balances' | 'trial_balance' | 'profit_loss' | 'balance_sheet' | 'cash_flow' | 'changes_equity' | 'general_ledger' | 'asset_register' | 'inventory_register' | 'ar_aging' | 'ap_aging';

const REPORT_CARDS: Array<{
    key: ReportKey;
    titleKey: TranslationKey;
    descriptionKey: TranslationKey;
    icon: React.ComponentType<{ color?: string; size?: number }>;
}> = [
    { key: 'cash_balances', titleKey: 'cashBalances', descriptionKey: 'cashBalancesDescription', icon: WalletCards },
    { key: 'trial_balance', titleKey: 'trialBalance', descriptionKey: 'trialBalanceDescription', icon: Scale },
    { key: 'profit_loss', titleKey: 'profitLoss', descriptionKey: 'profitLossDescription', icon: TrendingUp },
    { key: 'balance_sheet', titleKey: 'balanceSheet', descriptionKey: 'balanceSheetDescription', icon: BarChart3 },
    { key: 'cash_flow', titleKey: 'cashFlow', descriptionKey: 'cashFlowDescription', icon: WalletCards },
    { key: 'changes_equity', titleKey: 'changesInEquity', descriptionKey: 'changesInEquityDescription', icon: ArrowDownUp },
    { key: 'general_ledger', titleKey: 'generalLedger', descriptionKey: 'generalLedgerDescription', icon: BookOpen },
    { key: 'asset_register', titleKey: 'assetRegister', descriptionKey: 'assetRegisterDescription', icon: Landmark },
    { key: 'inventory_register', titleKey: 'inventoryRegister', descriptionKey: 'inventoryRegisterDescription', icon: Boxes },
    { key: 'ar_aging', titleKey: 'receivablesAging', descriptionKey: 'receivablesAgingDescription', icon: UsersRound },
    { key: 'ap_aging', titleKey: 'payablesAging', descriptionKey: 'payablesAgingDescription', icon: UsersRound },
];

type Summary = {
    gross_sales: number;
    revenue: number;
    expenses: number;
    net_profit: number;
    ar_outstanding: number;
    ap_outstanding: number;
};

export function ReportsHubScreen() {
    const { user } = useAuth();
    const { isDark, language } = useTheme();
    const palette = getPalette(isDark);
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const [summary, setSummary] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retryToken, setRetryToken] = useState(0);

    useFocusEffect(useCallback(() => {
        let active = true;
        const load = async () => {
            if (!user) return;
            setLoading(true);
            setError(null);
            try {
                const { companyIds } = await getWorkspaceScope(user.id);
                const [summaryResult, salesResult] = await Promise.all([
                    supabase
                        .from('operix_report_summary')
                        .select('revenue, expenses, net_profit, ar_outstanding, ap_outstanding')
                        .in('company_id', companyIds),
                    supabase
                        .from('invoices')
                        .select('total_amount, accounting_state, status, type, subtype, commercial_document_type, commercial_status')
                        .in('company_id', companyIds)
                        .eq('accounting_state', 'posted'),
                ]);
                if (summaryResult.error) throw summaryResult.error;
                if (salesResult.error) throw salesResult.error;
                const grossSales = (salesResult.data || [])
                    .filter((row) => !['REVERSED', 'CREDITED', 'CANCELLED'].includes(String(row.status || '').toUpperCase()))
                    .filter((row) => ['INVOICE', 'FINAL_INVOICE', 'ADVANCE_INVOICE', 'SIMPLIFIED_INVOICE'].includes(resolveCommercialDocumentType(row)))
                    .filter((row) => !['CANCELLED', 'CREDITED', 'REVERSED'].includes(String(row.commercial_status || '').toUpperCase()))
                    .reduce((total, row) => total + Number(row.total_amount || 0), 0);
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
                }), { gross_sales: grossSales, revenue: 0, expenses: 0, net_profit: 0, ar_outstanding: 0, ap_outstanding: 0 });
                totals.net_profit = totals.revenue - totals.expenses;
                if (active) setSummary(totals);
            } catch (loadError) {
                console.error('Reports hub load error:', loadError);
                if (active) setError(t('financialReportsLoadError', language));
            } finally {
                if (active) setLoading(false);
            }
        };
        void load();
        return () => { active = false; };
    }, [user, retryToken]));

    return (
        <MobileScreen testID="reports-hub-screen">
            <MobileHeader title={t('reports', language)} subtitle={t('fromAccountingEngine', language)} onBack={() => navigation.goBack()} />
            {loading ? <LoadingState label={t('loadingFinancialSnapshot', language)} /> : error ? <ErrorState message={error} onRetry={() => { setLoading(true); setRetryToken((value) => value + 1); }} /> : (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
                    <View style={styles.metricsRow}>
                        <MetricCard label={t('grossSales', language)} value={formatCurrency(summary?.gross_sales || 0)} />
                        <MetricCard label={t('revenue', language)} value={formatCurrency(summary?.revenue || 0)} />
                    </View>
                    <View style={styles.metricsRow}>
                        <MetricCard label={t('expenses', language)} value={formatCurrency(summary?.expenses || 0)} tone="warning" />
                        <MetricCard label={t('netProfitLabel', language)} value={formatCurrency(summary?.net_profit || 0)} tone={(summary?.net_profit || 0) >= 0 ? 'success' : 'danger'} />
                    </View>
                    <View style={styles.metricsRow}>
                        <MetricCard label={t('receivables', language)} value={formatCurrency(summary?.ar_outstanding || 0)} tone="warning" />
                        <MetricCard label={t('payables', language)} value={formatCurrency(summary?.ap_outstanding || 0)} tone="warning" />
                    </View>
                    <SectionTitle title={t('financialStatements', language)} />
                    {REPORT_CARDS.map((report) => {
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
            )}
        </MobileScreen>
    );
}

const styles = StyleSheet.create({
    content: { paddingHorizontal: 20, paddingBottom: 20 },
    metricsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
    reportCard: { minHeight: 80, borderRadius: 17, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 10, ...brand.shadow.card },
    reportIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    reportCopy: { flex: 1 },
    reportTitle: { fontSize: 14, fontFamily: brand.fonts.semibold },
    reportDescription: { fontSize: 11, lineHeight: 17, fontFamily: brand.fonts.regular, marginTop: 3 },
    openLabel: { fontSize: 11, fontFamily: brand.fonts.semibold, marginLeft: 8 },
});
