import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CreditCard, FileText, HandCoins, ReceiptText } from 'lucide-react-native';
import { supabase } from '@invoice-monorepo/api';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { formatCurrency, formatDate, t } from '@invoice-monorepo/i18n';
import { brand, getPalette } from '../../theme/brand';
import { getWorkspaceScope } from '../../services/workspace';
import type { RootStackParamList } from '../../navigation/types';
import { ErrorState, LoadingState, MetricCard, MobileHeader, MobileScreen } from '../../components/mobile/MobileUI';

type ActivityRow = {
    id: string;
    kind: 'invoice' | 'payment' | 'expense';
    title: string;
    detail: string;
    date: string;
    amount: number;
    invoiceId?: string;
};

export function AgentActivityScreen({ route }: any) {
    const { user } = useAuth();
    const { isDark, language } = useTheme();
    const palette = getPalette(isDark);
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const agentId = String(route.params?.agentId || '');
    const agentName = String(route.params?.agentName || t('agent', language));
    const [rows, setRows] = useState<ActivityRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!user || !agentId) return;
        setLoading(true);
        setError(null);
        try {
            const { companyIds } = await getWorkspaceScope(user.id);
            const [invoiceResult, paymentResult, expenseResult] = await Promise.all([
                supabase.from('invoices')
                    .select('id,invoice_number,total_amount,issue_date,status,company_id,client:clients(name)')
                    .in('company_id', companyIds)
                    .eq('user_id', agentId)
                    .order('issue_date', { ascending: false }),
                supabase.from('payments')
                    .select('id,payment_number,amount,payment_date,payment_method,company_id,client:clients(name)')
                    .in('company_id', companyIds)
                    .eq('user_id', agentId)
                    .order('payment_date', { ascending: false }),
                supabase.from('expenses')
                    .select('id,amount,category,description,date,type,company_id')
                    .in('company_id', companyIds)
                    .eq('user_id', agentId)
                    .order('date', { ascending: false }),
            ]);
            if (invoiceResult.error) throw invoiceResult.error;
            if (paymentResult.error) throw paymentResult.error;
            if (expenseResult.error) throw expenseResult.error;

            const nextRows: ActivityRow[] = [
                ...((invoiceResult.data || []) as any[]).map((row) => ({
                    id: `invoice-${row.id}`,
                    kind: 'invoice' as const,
                    title: `${t('invoice', language)} ${row.invoice_number || ''}`.trim(),
                    detail: row.client?.name || t('noClientAssigned', language),
                    date: row.issue_date,
                    amount: Number(row.total_amount || 0),
                    invoiceId: row.id,
                })),
                ...((paymentResult.data || []) as any[]).map((row) => ({
                    id: `payment-${row.id}`,
                    kind: 'payment' as const,
                    title: t('incomePayment', language),
                    detail: row.client?.name || t('noClient', language),
                    date: row.payment_date,
                    amount: Number(row.amount || 0),
                })),
                ...((expenseResult.data || []) as any[]).map((row) => ({
                    id: `expense-${row.id}`,
                    kind: 'expense' as const,
                    title: row.category || t('expense', language),
                    detail: row.description || t('businessExpense', language),
                    date: row.date,
                    amount: Number(row.amount || 0),
                })),
            ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setRows(nextRows);
        } catch (loadError) {
            console.error('Agent activity load error:', loadError);
            setError(t('unableToLoad', language));
        } finally {
            setLoading(false);
        }
    }, [agentId, language, user]);

    useFocusEffect(useCallback(() => {
        void load();
    }, [load]));

    const invoiceTotal = rows.filter((row) => row.kind === 'invoice').reduce((sum, row) => sum + row.amount, 0);
    const paymentTotal = rows.filter((row) => row.kind === 'payment').reduce((sum, row) => sum + row.amount, 0);
    const expenseTotal = rows.filter((row) => row.kind === 'expense').reduce((sum, row) => sum + row.amount, 0);

    return (
        <MobileScreen>
            <MobileHeader title={agentName} subtitle={t('agentActivityDescription', language)} onBack={() => navigation.goBack()} />
            {loading ? <LoadingState label={t('loading', language)} /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : (
                <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                    <View style={styles.metricsRow}>
                        <MetricCard label={t('invoices', language)} value={formatCurrency(invoiceTotal)} />
                        <MetricCard label={t('payments', language)} value={formatCurrency(paymentTotal)} tone="success" />
                        <MetricCard label={t('expenses', language)} value={formatCurrency(expenseTotal)} tone="warning" />
                    </View>
                    {rows.length === 0 ? <Text style={[styles.empty, { color: palette.muted }]}>{t('noAgentActivity', language)}</Text> : rows.map((row) => {
                        const Icon = row.kind === 'invoice' ? FileText : row.kind === 'payment' ? HandCoins : CreditCard;
                        const amountColor = row.kind === 'expense' ? palette.text : brand.colors.success;
                        return <TouchableOpacity key={row.id} disabled={!row.invoiceId} onPress={() => row.invoiceId && navigation.navigate('InvoiceDetail', { invoiceId: row.invoiceId })} style={[styles.row, { borderBottomColor: palette.border }]}>
                            <View style={[styles.icon, { backgroundColor: palette.iconSurface }]}><Icon color={brand.colors.primary} size={17} /></View>
                            <View style={styles.copy}><Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>{row.title}</Text><Text style={[styles.detail, { color: palette.muted }]} numberOfLines={1}>{row.detail} · {formatDate(row.date, language)}</Text></View>
                            <Text style={[styles.amount, { color: amountColor }]}>{row.kind === 'expense' ? '-' : '+'}{formatCurrency(row.amount, 'EUR', language)}</Text>
                        </TouchableOpacity>;
                    })}
                </ScrollView>
            )}
        </MobileScreen>
    );
}

const styles = StyleSheet.create({
    content: { padding: 20, paddingBottom: 32 },
    metricsRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
    row: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
    icon: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    copy: { flex: 1 },
    title: { fontSize: 13, fontFamily: brand.fonts.semibold },
    detail: { fontSize: 11, fontFamily: brand.fonts.regular, marginTop: 3 },
    amount: { fontSize: 12, fontFamily: brand.fonts.semibold },
    empty: { textAlign: 'center', paddingVertical: 40, fontFamily: brand.fonts.regular },
});

