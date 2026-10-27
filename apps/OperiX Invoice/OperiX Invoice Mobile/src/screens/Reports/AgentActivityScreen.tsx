import React, { useCallback, useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { ArrowDownCircle, CalendarDays, ChevronDown, Clock3, CreditCard, FileText, HandCoins, X } from 'lucide-react-native';
import { supabase } from '@invoice-monorepo/api';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { formatCurrency, t } from '@invoice-monorepo/i18n';
import { brand, getPalette } from '../../theme/brand';
import { getWorkspaceScope } from '../../services/workspace';
import type { RootStackParamList } from '../../navigation/types';
import { ErrorState, LoadingState, MetricCard, MobileHeader, MobileScreen } from '../../components/mobile/MobileUI';

type ActivityRow = {
    id: string;
    kind: 'invoice' | 'payment' | 'expense' | 'settlement' | 'advance';
    title: string;
    detail: string;
    date: string;
    amount: number;
    invoiceId?: string;
};

type RangeTarget = 'from' | 'to';
type PickerMode = 'date' | 'time';

function defaultRangeDate(target: RangeTarget): Date {
    const date = new Date();
    if (target === 'from') date.setHours(0, 0, 0, 0);
    else date.setHours(23, 59, 0, 0);
    return date;
}

function mergePickerDate(base: Date, selected: Date, mode: PickerMode): Date {
    const next = new Date(base);
    if (mode === 'date') {
        next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
    } else {
        next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
    }
    return next;
}

function formatDateTime(value: Date): string {
    const pad = (part: number) => String(part).padStart(2, '0');
    return `${pad(value.getDate())}/${pad(value.getMonth() + 1)}/${value.getFullYear()} ${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function inclusiveEndOfMinute(value: Date): Date {
    const next = new Date(value);
    next.setSeconds(59, 999);
    return next;
}

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
    const [fromDate, setFromDate] = useState<Date | null>(null);
    const [toDate, setToDate] = useState<Date | null>(null);
    const [pickerTarget, setPickerTarget] = useState<RangeTarget | null>(null);
    const [pickerMode, setPickerMode] = useState<PickerMode>('date');
    const [pickerDate, setPickerDate] = useState(new Date());

    const setRangeDate = useCallback((target: RangeTarget, value: Date) => {
        if (target === 'from') setFromDate(value);
        else setToDate(value);
    }, []);

    const handleAndroidDate = useCallback((target: RangeTarget, selected: Date) => {
        const next = mergePickerDate(defaultRangeDate(target), selected, 'date');
        DateTimePickerAndroid.open({
            value: next,
            mode: 'time',
            display: 'clock',
            is24Hour: true,
            onChange: (event, time) => {
                if (event.type !== 'dismissed' && time) setRangeDate(target, mergePickerDate(next, time, 'time'));
            },
        });
    }, [setRangeDate]);

    const openPicker = useCallback((target: RangeTarget) => {
        const current = target === 'from' ? fromDate : toDate;
        const initial = current ? new Date(current) : defaultRangeDate(target);
        if (Platform.OS === 'android') {
            DateTimePickerAndroid.open({
                value: initial,
                mode: 'date',
                display: 'calendar',
                onChange: (event, selected) => {
                    if (event.type !== 'dismissed' && selected) handleAndroidDate(target, selected);
                },
            });
            return;
        }
        setPickerDate(initial);
        setPickerMode('date');
        setPickerTarget(target);
    }, [fromDate, handleAndroidDate, toDate]);

    const finishPicker = useCallback(() => {
        if (!pickerTarget) return;
        if (pickerMode === 'date') {
            setPickerMode('time');
            return;
        }
        setRangeDate(pickerTarget, pickerDate);
        setPickerTarget(null);
    }, [pickerDate, pickerMode, pickerTarget, setRangeDate]);

    const clearRange = useCallback(() => {
        setFromDate(null);
        setToDate(null);
    }, []);

    const load = useCallback(async () => {
        if (!user || !agentId) return;
        setLoading(true);
        setError(null);
        try {
            const { companyIds } = await getWorkspaceScope(user.id);
            let invoiceQuery = supabase.from('invoices')
                .select('id,invoice_number,total_amount,issue_date,status,created_at,company_id,post_cod,client:clients(name)')
                .in('company_id', companyIds)
                .eq('user_id', agentId);
            let paymentQuery = supabase.from('payments')
                .select('id,payment_number,amount,payment_date,payment_method,created_at,company_id,client:clients(name)')
                .in('company_id', companyIds)
                .eq('user_id', agentId);
            let expenseQuery = supabase.from('expenses')
                .select('id,amount,category,description,date,type,created_at,company_id')
                .in('company_id', companyIds)
                .eq('user_id', agentId);
            let settlementQuery = supabase.from('agent_settlements')
                .select('id,amount,settlement_date,description,created_at,company_id,fund:company_fund_accounts(name,fund_type)')
                .in('company_id', companyIds)
                .eq('agent_user_id', agentId)
                .eq('status', 'active');
            let advanceQuery = supabase.from('agent_advances')
                .select('id,amount,advance_date,description,created_at,company_id,fund:company_fund_accounts(name,fund_type)')
                .in('company_id', companyIds)
                .eq('agent_user_id', agentId)
                .eq('status', 'active');
            if (fromDate) {
                const from = fromDate.toISOString();
                invoiceQuery = invoiceQuery.gte('created_at', from);
                paymentQuery = paymentQuery.gte('created_at', from);
                expenseQuery = expenseQuery.gte('created_at', from);
                settlementQuery = settlementQuery.gte('created_at', from);
                advanceQuery = advanceQuery.gte('created_at', from);
            }
            if (toDate) {
                const to = inclusiveEndOfMinute(toDate).toISOString();
                invoiceQuery = invoiceQuery.lte('created_at', to);
                paymentQuery = paymentQuery.lte('created_at', to);
                expenseQuery = expenseQuery.lte('created_at', to);
                settlementQuery = settlementQuery.lte('created_at', to);
                advanceQuery = advanceQuery.lte('created_at', to);
            }
            const [invoiceResult, paymentResult, expenseResult, settlementResult, advanceResult] = await Promise.all([
                invoiceQuery.order('created_at', { ascending: false }),
                paymentQuery.order('created_at', { ascending: false }),
                expenseQuery.order('created_at', { ascending: false }),
                settlementQuery.order('created_at', { ascending: false }),
                advanceQuery.order('created_at', { ascending: false }),
            ]);
            if (invoiceResult.error) throw invoiceResult.error;
            if (paymentResult.error) throw paymentResult.error;
            if (expenseResult.error) throw expenseResult.error;
            if (settlementResult.error) throw settlementResult.error;
            if (advanceResult.error) throw advanceResult.error;

            const nextRows: ActivityRow[] = [
                ...((invoiceResult.data || []) as any[]).filter((row) => !row.post_cod).map((row) => ({
                    id: `invoice-${row.id}`,
                    kind: 'invoice' as const,
                    title: `${t('invoice', language)} ${row.invoice_number || ''}`.trim(),
                    detail: row.client?.name || t('noClientAssigned', language),
                    date: row.created_at || row.issue_date,
                    amount: Number(row.total_amount || 0),
                    invoiceId: row.id,
                })),
                ...((paymentResult.data || []) as any[]).map((row) => ({
                    id: `payment-${row.id}`,
                    kind: 'payment' as const,
                    title: t('incomePayment', language),
                    detail: row.client?.name || t('noClient', language),
                    date: row.created_at || row.payment_date,
                    amount: Number(row.amount || 0),
                })),
                ...((expenseResult.data || []) as any[]).map((row) => ({
                    id: `expense-${row.id}`,
                    kind: 'expense' as const,
                    title: row.category || t('expense', language),
                    detail: row.description || t('businessExpense', language),
                    date: row.created_at || row.date,
                    amount: Number(row.amount || 0),
                })),
                ...((settlementResult.data || []) as any[]).map((row) => ({
                    id: `settlement-${row.id}`,
                    kind: 'settlement' as const,
                    title: t('agentSettlement', language),
                    detail: row.fund?.name || row.description || t('agentSettlementDescription', language),
                    date: row.created_at || row.settlement_date,
                    amount: Number(row.amount || 0),
                })),
                ...((advanceResult.data || []) as any[]).map((row) => ({
                    id: `advance-${row.id}`,
                    kind: 'advance' as const,
                    title: t('agentAdvance', language),
                    detail: row.fund?.name || row.description || t('agentAdvanceDescription', language),
                    date: row.created_at || row.advance_date,
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
    }, [agentId, fromDate, language, toDate, user]);

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
                <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                    <View style={[styles.filterCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                        <View style={styles.filterHeader}>
                            <View style={[styles.filterIcon, { backgroundColor: palette.iconSurface }]}><CalendarDays color={brand.colors.primary} size={17} /></View>
                            <View style={styles.filterCopy}><Text style={[styles.filterTitle, { color: palette.text }]}>{t('dateRange', language)}</Text><Text style={[styles.filterHint, { color: palette.muted }]}>{t('activityDateTimeHint', language)}</Text></View>
                            {fromDate || toDate ? <TouchableOpacity accessibilityRole="button" onPress={clearRange}><Text style={[styles.clearText, { color: brand.colors.primary }]}>{t('clear', language)}</Text></TouchableOpacity> : null}
                        </View>
                        <View style={styles.filterFields}>
                            {(['from', 'to'] as RangeTarget[]).map((target) => {
                                const value = target === 'from' ? fromDate : toDate;
                                return <TouchableOpacity key={target} accessibilityRole="button" onPress={() => openPicker(target)} style={[styles.dateField, { borderColor: palette.border }]}>
                                    <Clock3 color={palette.muted} size={16} />
                                    <View style={styles.dateFieldCopy}><Text style={[styles.dateLabel, { color: palette.muted }]}>{t(target === 'from' ? 'dateFrom' : 'dateTo', language)}</Text><Text style={[styles.dateValue, { color: value ? palette.text : palette.muted }]}>{value ? formatDateTime(value) : t('allTime', language)}</Text></View>
                                    <ChevronDown color={palette.muted} size={16} />
                                </TouchableOpacity>;
                            })}
                        </View>
                    </View>
                    <View style={styles.metricsRow}>
                        <MetricCard label={t('invoices', language)} value={formatCurrency(invoiceTotal)} />
                        <MetricCard label={t('payments', language)} value={formatCurrency(paymentTotal)} tone="success" />
                        <MetricCard label={t('expenses', language)} value={formatCurrency(expenseTotal)} tone="warning" />
                    </View>
                    {rows.length === 0 ? <Text style={[styles.empty, { color: palette.muted }]}>{t('noAgentActivity', language)}</Text> : rows.map((row) => {
                        const Icon = row.kind === 'invoice' ? FileText : row.kind === 'payment' ? HandCoins : row.kind === 'settlement' || row.kind === 'advance' ? ArrowDownCircle : CreditCard;
                        const isNegative = row.kind === 'expense' || row.kind === 'settlement' || row.kind === 'advance';
                        const amountColor = isNegative ? palette.text : brand.colors.success;
                        return <TouchableOpacity key={row.id} disabled={!row.invoiceId} onPress={() => row.invoiceId && navigation.navigate('InvoiceDetail', { invoiceId: row.invoiceId })} style={[styles.row, { borderBottomColor: palette.border }]}>
                            <View style={[styles.icon, { backgroundColor: palette.iconSurface }]}><Icon color={brand.colors.primary} size={17} /></View>
                            <View style={styles.copy}><Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>{row.title}</Text><Text style={[styles.detail, { color: palette.muted }]} numberOfLines={1}>{row.detail} · {formatDateTime(new Date(row.date))}</Text></View>
                            <Text style={[styles.amount, { color: amountColor }]}>{isNegative ? '-' : '+'}{formatCurrency(row.amount, 'EUR', language)}</Text>
                        </TouchableOpacity>;
                    })}
                </ScrollView>
            )}
            {pickerTarget ? <Modal visible transparent animationType="slide" onRequestClose={() => setPickerTarget(null)}>
                <View style={styles.modalOverlay}>
                    <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setPickerTarget(null)} />
                    <View style={[styles.pickerSheet, { backgroundColor: palette.surface }]}>
                        <View style={styles.pickerHeader}><Text style={[styles.pickerTitle, { color: palette.text }]}>{t(pickerTarget === 'from' ? 'dateFrom' : 'dateTo', language)} · {pickerMode === 'date' ? t('date', language) : t('time', language)}</Text><TouchableOpacity accessibilityRole="button" onPress={() => setPickerTarget(null)}><X color={palette.muted} size={21} /></TouchableOpacity></View>
                        <DateTimePicker value={pickerDate} mode={pickerMode} display="spinner" is24Hour themeVariant={isDark ? 'dark' : 'light'} onChange={(_, selected) => { if (selected) setPickerDate(mergePickerDate(pickerDate, selected, pickerMode)); }} />
                        <TouchableOpacity onPress={finishPicker} style={[styles.doneButton, { backgroundColor: brand.colors.primary }]}><Text style={styles.doneText}>{pickerMode === 'date' ? t('next', language) : t('done', language)}</Text></TouchableOpacity>
                    </View>
                </View>
            </Modal> : null}
        </MobileScreen>
    );
}

const styles = StyleSheet.create({
    content: { padding: 20, paddingBottom: 32 },
    filterCard: { borderWidth: 1, borderRadius: 17, padding: 14, marginBottom: 18 },
    filterHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 13 },
    filterIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    filterCopy: { flex: 1 },
    filterTitle: { fontSize: 14, fontFamily: brand.fonts.semibold },
    filterHint: { fontSize: 10, marginTop: 2 },
    clearText: { fontSize: 11, fontFamily: brand.fonts.semibold },
    filterFields: { flexDirection: 'row', gap: 9 },
    dateField: { flex: 1, minHeight: 58, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
    dateFieldCopy: { flex: 1 },
    dateLabel: { fontSize: 10 },
    dateValue: { fontSize: 11, fontFamily: brand.fonts.semibold, marginTop: 3 },
    metricsRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
    row: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
    icon: { width: 36, height: 36, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    copy: { flex: 1 },
    title: { fontSize: 13, fontFamily: brand.fonts.semibold },
    detail: { fontSize: 11, fontFamily: brand.fonts.regular, marginTop: 3 },
    amount: { fontSize: 12, fontFamily: brand.fonts.semibold },
    empty: { textAlign: 'center', paddingVertical: 40, fontFamily: brand.fonts.regular },
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
    pickerSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 28 },
    pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    pickerTitle: { fontSize: 17, fontFamily: brand.fonts.semibold },
    doneButton: { minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 5 },
    doneText: { color: '#fff', fontSize: 12, fontFamily: brand.fonts.semibold },
});
