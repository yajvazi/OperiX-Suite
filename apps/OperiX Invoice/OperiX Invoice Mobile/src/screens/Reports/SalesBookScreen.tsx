import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Download, FileCheck2, LockKeyhole, Share2, ShieldAlert } from 'lucide-react-native';
import * as Print from 'expo-print';
import { supabase } from '@invoice-monorepo/api';
import {
    createSalesBookAmendment,
    ensureSalesBookPeriod,
    listSalesBookPeriods,
    listSalesBookTransactions,
    markSalesBookDeclared,
    type SalesBookPeriodRow,
} from '@invoice-monorepo/api/repositories';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { formatCurrency, t } from '@invoice-monorepo/i18n';
import { brand, getPalette } from '../../theme/brand';
import { getWorkspaceScope } from '../../services/workspace';
import { namePdfFile, reportPdfFileName } from '../../services/pdf/fileNaming';
import type { RootStackParamList } from '../../navigation/types';
import { Button } from '@invoice-monorepo/ui';
import { ErrorState, LoadingState, MetricCard, MobileHeader, MobileScreen, SectionTitle } from '../../components/mobile/MobileUI';

type SalesBookRow = Record<string, unknown>;
type StatusFilter = 'ALL' | SalesBookPeriodRow['status'];

function numeric(value: unknown) {
    const result = Number(value);
    return Number.isFinite(result) ? result : 0;
}

function dateParts(value: string) {
    const [year, month, day] = value.slice(0, 10).split('-');
    return { year, month, day };
}

function shortDate(value: string) {
    const { year, month, day } = dateParts(value);
    return `${day}.${month}.${year}`;
}

function monthLabel(value: string, language: string) {
    const { year, month } = dateParts(value);
    return new Intl.DateTimeFormat(language === 'sq' ? 'sq-XK' : 'en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
        .format(new Date(Date.UTC(Number(year), Number(month) - 1, 1)));
}

function periodTitle(period: Pick<SalesBookPeriodRow, 'period_start' | 'reporting_frequency'>, language: string) {
    const frequency = String(period.reporting_frequency || 'monthly').toLowerCase();
    const { year, month } = dateParts(period.period_start);
    if (frequency === 'annual') return year;
    if (frequency === 'quarterly') {
        const quarter = Math.floor((Number(month) - 1) / 3) + 1;
        return language === 'sq' ? `TM${quarter} ${year}` : `Q${quarter} ${year}`;
    }
    return monthLabel(period.period_start, language);
}

function statusLabel(status: SalesBookPeriodRow['status'], language: string) {
    const labels: Record<SalesBookPeriodRow['status'], string> = {
        OPEN: t('salesBookOpen', language),
        READY_FOR_DECLARATION: t('salesBookReadyForDeclaration', language),
        DECLARED: t('salesBookDeclared', language),
        AMENDED: t('salesBookAmended', language),
    };
    return labels[status];
}

function escapeHtml(value: unknown) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character));
}

export function SalesBookScreen() {
    const { user } = useAuth();
    const { isDark, language } = useTheme();
    const palette = getPalette(isDark);
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const [periods, setPeriods] = useState<SalesBookPeriodRow[]>([]);
    const [transactions, setTransactions] = useState<SalesBookRow[]>([]);
    const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
    const [yearFilter, setYearFilter] = useState('ALL');
    const [loading, setLoading] = useState(true);
    const [loadingTransactions, setLoadingTransactions] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [companyNames, setCompanyNames] = useState<Map<string, string>>(new Map());
    const [currency, setCurrency] = useState('EUR');
    const [roleCode, setRoleCode] = useState('employee');
    const [amendmentVisible, setAmendmentVisible] = useState(false);
    const [amendmentInvoiceId, setAmendmentInvoiceId] = useState<string | null>(null);
    const [amendmentReason, setAmendmentReason] = useState('');
    const [savingAction, setSavingAction] = useState(false);

    const load = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        setError(null);
        try {
            const scope = await getWorkspaceScope(user.id);
            const names = new Map(scope.companies.map((company): [string, string] => [company.id, company.company_name || company.name || '']));
            setCompanyNames(names);
            setCurrency(scope.company?.currency || scope.profile.currency || 'EUR');
            setRoleCode(scope.roleCode || String((scope.profile as any)?.role || 'employee'));
            const incompleteCompany = scope.companies.find((company) => !['monthly', 'quarterly', 'annual'].includes(String(company.accounting_period_frequency || '').toLowerCase()));
            if (incompleteCompany) {
                setPeriods([]);
                setTransactions([]);
                setError(t('salesBookConfigurationRequired', language));
                return;
            }
            await Promise.all(scope.companies.map((company) => ensureSalesBookPeriod(supabase, company.id)));
            const nextPeriods = await listSalesBookPeriods(supabase, scope.companyIds);
            setPeriods(nextPeriods);
            setSelectedPeriodId((current) => current && nextPeriods.some((period) => period.id === current) ? current : nextPeriods[0]?.id || null);
        } catch (loadError) {
            console.error('Sales Book load error:', loadError);
            setError(t('salesBookLoadError', language));
        } finally {
            setLoading(false);
        }
    }, [language, user?.id]);

    useFocusEffect(useCallback(() => {
        void load();
    }, [load]));

    const selectedPeriod = periods.find((period) => period.id === selectedPeriodId) || periods[0] || null;

    const filteredPeriods = useMemo(() => periods.filter((period) => {
        const yearMatches = yearFilter === 'ALL' || period.period_start.slice(0, 4) === yearFilter;
        const statusMatches = statusFilter === 'ALL' || period.status === statusFilter;
        return yearMatches && statusMatches;
    }), [periods, statusFilter, yearFilter]);

    const years = useMemo(() => Array.from(new Set(periods.map((period) => period.period_start.slice(0, 4)))), [periods]);

    const loadTransactions = useCallback(async (periodId: string | null) => {
        if (!periodId || !user) {
            setTransactions([]);
            return;
        }
        setLoadingTransactions(true);
        try {
            const { companyIds } = await getWorkspaceScope(user.id);
            setTransactions(await listSalesBookTransactions(supabase, companyIds, periodId));
        } catch (loadError) {
            console.error('Sales Book transaction load error:', loadError);
            setTransactions([]);
        } finally {
            setLoadingTransactions(false);
        }
    }, [user?.id]);

    useFocusEffect(useCallback(() => {
        void loadTransactions(selectedPeriod?.id || null);
    }, [loadTransactions, selectedPeriod?.id]));

    const summary = selectedPeriod || { transaction_count: 0, taxable_amount: 0, vat_amount: 0, total_amount: 0 } as SalesBookPeriodRow;
    const canManageDeclaration = ['super_administrator', 'company_administrator', 'manager'].includes(roleCode);

    const askToDeclare = () => {
        if (!selectedPeriod || selectedPeriod.status !== 'READY_FOR_DECLARATION') return;
        Alert.alert(
            t('markSalesBookDeclared', language),
            t('markSalesBookDeclaredWarning', language),
            [
                { text: t('cancel', language), style: 'cancel' },
                {
                    text: t('confirmDeclaration', language),
                    style: 'destructive',
                    onPress: () => {
                        setSavingAction(true);
                        void markSalesBookDeclared(supabase, selectedPeriod.id)
                            .then(() => load())
                            .catch((actionError) => {
                                console.error('Sales Book declaration error:', actionError);
                                Alert.alert(t('error', language), t('salesBookActionError', language));
                            })
                            .finally(() => setSavingAction(false));
                    },
                },
            ],
        );
    };

    const saveAmendment = () => {
        if (!selectedPeriod || !amendmentInvoiceId || !amendmentReason.trim()) return;
        setSavingAction(true);
        void createSalesBookAmendment(supabase, selectedPeriod.id, amendmentInvoiceId, amendmentReason.trim())
            .then((amendment) => {
                setAmendmentVisible(false);
                setAmendmentReason('');
                const amendmentId = typeof amendment?.id === 'string' ? amendment.id : null;
                if (amendmentInvoiceId && amendmentId) {
                    Alert.alert(t('salesBookAmendmentStarted', language), t('salesBookAmendmentStartedDescription', language), [
                        { text: t('cancel', language), style: 'cancel' },
                        {
                            text: t('continue', language),
                            onPress: () => navigation.navigate('InvoiceForm', {
                                invoiceId: amendmentInvoiceId,
                                salesBookAmendmentId: amendmentId,
                                documentType: 'INVOICE',
                            }),
                        },
                    ]);
                }
                setAmendmentInvoiceId(null);
            })
            .catch((actionError) => {
                console.error('Sales Book amendment error:', actionError);
                Alert.alert(t('error', language), t('salesBookActionError', language));
            })
            .finally(() => setSavingAction(false));
    };

    const handleShare = async () => {
        if (!selectedPeriod) return;
        await Share.share({
            message: `${t('salesBook', language)} — ${periodTitle(selectedPeriod, language)}\n${shortDate(selectedPeriod.period_start)} – ${shortDate(selectedPeriod.period_end)}\n${statusLabel(selectedPeriod.status, language)}\n${t('taxableAmount', language)}: ${formatCurrency(numeric(selectedPeriod.taxable_amount), currency, language)} · ${t('vat', language)}: ${formatCurrency(numeric(selectedPeriod.vat_amount), currency, language)} · ${t('total', language)}: ${formatCurrency(numeric(selectedPeriod.total_amount), currency, language)}`,
        });
    };

    const handleExport = async () => {
        if (!selectedPeriod) return;
        setExporting(true);
        try {
            const generatedAt = new Intl.DateTimeFormat(language === 'sq' ? 'sq-XK' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date());
            const rows = transactions.map((row, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(row.invoice_date)}</td><td>${escapeHtml(row.invoice_number)}</td><td>${escapeHtml(row.customer_name || '—')}</td><td>${escapeHtml(formatCurrency(numeric(row.taxable_base), currency, language))}</td><td>${escapeHtml(formatCurrency(numeric(row.output_vat), currency, language))}</td><td>${escapeHtml(formatCurrency(numeric(row.total_amount), currency, language))}</td></tr>`).join('');
            const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#172033;padding:0 12px}h1{color:#004FFE;margin:0 0 4px}p{margin:3px 0;color:#667085;font-size:11px}.summary{margin:12px 0;font-size:12px}table{width:100%;border-collapse:collapse;font-size:9px}th{background:#004FFE;color:#fff;text-align:left;padding:7px}td{border:1px solid #D0D5DD;padding:6px}tbody tr:nth-child(even){background:#F7F9FC}</style></head><body><h1>${escapeHtml(t('salesBook', language))}</h1><p>${escapeHtml(periodTitle(selectedPeriod, language))} · ${escapeHtml(shortDate(selectedPeriod.period_start))} – ${escapeHtml(shortDate(selectedPeriod.period_end))}</p><p>${escapeHtml(t('salesBookStatus', language))}: ${escapeHtml(statusLabel(selectedPeriod.status, language))} · ${escapeHtml(t('declarationDeadline', language))}: ${escapeHtml(shortDate(selectedPeriod.declaration_deadline))}</p><p>${escapeHtml(t('generatedOn', language))}: ${escapeHtml(generatedAt)}</p><p class="summary">${escapeHtml(t('taxableAmount', language))}: ${escapeHtml(formatCurrency(numeric(selectedPeriod.taxable_amount), currency, language))} · ${escapeHtml(t('vat', language))}: ${escapeHtml(formatCurrency(numeric(selectedPeriod.vat_amount), currency, language))} · ${escapeHtml(t('total', language))}: ${escapeHtml(formatCurrency(numeric(selectedPeriod.total_amount), currency, language))}</p><table><thead><tr><th>Nr.</th><th>${escapeHtml(t('invoiceDate', language))}</th><th>${escapeHtml(t('invoiceNumber', language))}</th><th>${escapeHtml(t('customer', language))}</th><th>${escapeHtml(t('salesWithoutVat', language))}</th><th>${escapeHtml(t('vat', language))}</th><th>${escapeHtml(t('total', language))}</th></tr></thead><tbody>${rows || `<tr><td colspan="7">${escapeHtml(t('noPostedRecords', language))}</td></tr>`}</tbody></table></body></html>`;
            const { uri } = await Print.printToFileAsync({ html, base64: false, width: 842, height: 595, margins: { top: 0, right: 0, bottom: 0, left: 0 } });
            const namedUri = await namePdfFile(uri, reportPdfFileName(`${companyNames.get(selectedPeriod.company_id) || t('company', language)}-${selectedPeriod.period_start}`, t('salesBook', language)));
            await Print.printAsync({ uri: namedUri });
        } catch (exportError) {
            console.error('Sales Book export error:', exportError);
            Alert.alert(t('exportUnavailable', language), t('reportPrintFailed', language));
        } finally {
            setExporting(false);
        }
    };

    if (loading) return <MobileScreen><MobileHeader title={t('salesBook', language)} subtitle={t('salesBookPeriodLifecycle', language)} onBack={() => navigation.goBack()} /><LoadingState label={t('loadingSalesBook', language)} /></MobileScreen>;
    if (error) return <MobileScreen><MobileHeader title={t('salesBook', language)} subtitle={t('salesBookPeriodLifecycle', language)} onBack={() => navigation.goBack()} /><ErrorState message={error} onRetry={() => void load()} /></MobileScreen>;

    return (
        <MobileScreen>
            <MobileHeader
                title={t('salesBook', language)}
                subtitle={t('salesBookPeriodLifecycle', language)}
                onBack={() => navigation.goBack()}
                right={<TouchableOpacity accessibilityRole="button" accessibilityLabel={t('shareReport', language)} onPress={() => void handleShare()} hitSlop={10}><Share2 color={palette.text} size={20} /></TouchableOpacity>}
            />
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
                {periods.length === 0 ? (
                    <View style={[styles.notice, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                        <ShieldAlert color={brand.colors.warning} size={20} />
                        <View style={styles.noticeCopy}>
                            <Text style={[styles.noticeTitle, { color: palette.text }]}>{t('salesBookNotConfiguredTitle', language)}</Text>
                            <Text style={[styles.noticeText, { color: palette.muted }]}>{t('salesBookNotConfiguredDescription', language)}</Text>
                        </View>
                    </View>
                ) : null}

                {selectedPeriod ? <>
                    <View style={[styles.hero, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                        <View style={styles.heroTop}><View><Text style={[styles.eyebrow, { color: palette.muted }]}>{t('currentSalesBookPeriod', language)}</Text><Text style={[styles.heroTitle, { color: palette.text }]}>{periodTitle(selectedPeriod, language)}</Text><Text style={[styles.heroDates, { color: palette.muted }]}>{shortDate(selectedPeriod.period_start)} – {shortDate(selectedPeriod.period_end)}</Text></View><View style={[styles.statusPill, { backgroundColor: selectedPeriod.status === 'OPEN' ? '#0E3A32' : selectedPeriod.status === 'READY_FOR_DECLARATION' ? '#4A3210' : '#263A55' }]}><Text style={styles.statusPillText}>{statusLabel(selectedPeriod.status, language)}</Text></View></View>
                        <View style={styles.deadlineRow}><Text style={[styles.deadlineLabel, { color: palette.muted }]}>{t('declarationDeadline', language)}</Text><Text style={[styles.deadlineValue, { color: palette.text }]}>{shortDate(selectedPeriod.declaration_deadline)}</Text></View>
                        {selectedPeriod.status === 'DECLARED' || selectedPeriod.status === 'AMENDED' ? <View style={styles.lockedRow}><LockKeyhole color={brand.colors.warning} size={16} /><Text style={[styles.lockedText, { color: palette.muted }]}>{selectedPeriod.status === 'DECLARED' ? t('salesBookLockedDescription', language) : t('salesBookAmendedDescription', language)}</Text></View> : null}
                    </View>
                    <View style={styles.metricsRow}>
                        <MetricCard label={t('salesWithoutVat', language)} value={formatCurrency(numeric(summary.taxable_amount), currency, language)} tone="neutral" />
                        <MetricCard label={t('vat', language)} value={formatCurrency(numeric(summary.vat_amount), currency, language)} tone="warning" />
                    </View>
                    <View style={styles.metricsRow}>
                        <MetricCard label={t('totalSales', language)} value={formatCurrency(numeric(summary.total_amount), currency, language)} tone="success" />
                        <MetricCard label={t('documents', language)} value={String(numeric(summary.transaction_count))} tone="neutral" />
                    </View>
                    {selectedPeriod.status === 'READY_FOR_DECLARATION' && canManageDeclaration ? <Button title={savingAction ? t('saving', language) : t('markSalesBookDeclared', language)} icon={FileCheck2} loading={savingAction} onPress={askToDeclare} style={styles.actionButton} /> : null}
                    {(selectedPeriod.status === 'DECLARED' || selectedPeriod.status === 'AMENDED') && canManageDeclaration ? <Button title={t('startSalesBookAmendment', language)} icon={ShieldAlert} loading={savingAction} onPress={() => { setAmendmentInvoiceId(null); setAmendmentVisible(true); }} variant="secondary" style={styles.actionButton} /> : null}

                    <SectionTitle title={t('historicalSalesBooks', language)} />
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
                        <TouchableOpacity onPress={() => setYearFilter('ALL')} style={[styles.filter, { borderColor: yearFilter === 'ALL' ? brand.colors.primary : palette.border, backgroundColor: yearFilter === 'ALL' ? brand.colors.primary : palette.surface }]}><Text style={{ color: yearFilter === 'ALL' ? '#fff' : palette.text }}>{t('allYears', language)}</Text></TouchableOpacity>
                        {years.map((year) => <TouchableOpacity key={year} onPress={() => setYearFilter(year)} style={[styles.filter, { borderColor: yearFilter === year ? brand.colors.primary : palette.border, backgroundColor: yearFilter === year ? brand.colors.primary : palette.surface }]}><Text style={{ color: yearFilter === year ? '#fff' : palette.text }}>{year}</Text></TouchableOpacity>)}
                        {(['ALL', 'OPEN', 'READY_FOR_DECLARATION', 'DECLARED', 'AMENDED'] as StatusFilter[]).map((status) => <TouchableOpacity key={status} onPress={() => setStatusFilter(status)} style={[styles.filter, { borderColor: statusFilter === status ? brand.colors.primary : palette.border, backgroundColor: statusFilter === status ? brand.colors.primary : palette.surface }]}><Text style={{ color: statusFilter === status ? '#fff' : palette.text }}>{status === 'ALL' ? t('allStatuses', language) : statusLabel(status, language)}</Text></TouchableOpacity>)}
                    </ScrollView>
                    {filteredPeriods.map((period) => <TouchableOpacity key={period.id} accessibilityRole="button" onPress={() => setSelectedPeriodId(period.id)} style={[styles.periodRow, { backgroundColor: period.id === selectedPeriod?.id ? palette.iconSurface : palette.surface, borderColor: period.id === selectedPeriod?.id ? brand.colors.primary : palette.border }]}><View style={styles.periodCopy}><Text style={[styles.periodTitle, { color: palette.text }]}>{periodTitle(period, language)}</Text><Text style={[styles.periodDetail, { color: palette.muted }]}>{shortDate(period.period_start)} – {shortDate(period.period_end)} · {companyNames.get(period.company_id) || ''}</Text></View><View style={styles.periodRight}><Text style={[styles.periodStatus, { color: palette.text }]}>{statusLabel(period.status, language)}</Text><Text style={[styles.periodTotal, { color: palette.muted }]}>{formatCurrency(numeric(period.total_amount), currency, language)}</Text></View></TouchableOpacity>)}
                    {filteredPeriods.length === 0 ? <Text style={[styles.empty, { color: palette.muted }]}>{t('noSalesBookPeriods', language)}</Text> : null}
                    <Button title={exporting ? t('preparing', language) : t('exportPdf', language)} icon={Download} loading={exporting} onPress={() => void handleExport()} style={styles.exportButton} />

                    {transactions.map((row, index) => <TouchableOpacity key={`${String(row.invoice_id)}-${index}`} accessibilityRole="button" onPress={() => row.invoice_id ? navigation.navigate('InvoiceDetail', { invoiceId: String(row.invoice_id) }) : undefined} style={[styles.transaction, { backgroundColor: palette.surface, borderColor: palette.border }]}><View style={styles.transactionCopy}><Text style={[styles.transactionTitle, { color: palette.text }]}>{String(row.invoice_number || '—')}</Text><Text style={[styles.transactionDetail, { color: palette.muted }]}>{String(row.customer_name || '—')} · {String(row.invoice_date || '—')}</Text></View><View><Text style={[styles.transactionAmount, { color: palette.text }]}>{formatCurrency(numeric(row.total_amount), currency, language)}</Text><Text style={[styles.transactionVat, { color: palette.muted }]}>{formatCurrency(numeric(row.output_vat), currency, language)} {t('vat', language)}</Text></View></TouchableOpacity>)}
                    {transactions.length === 0 ? <Text style={[styles.empty, { color: palette.muted }]}>{t('noPostedRecords', language)}</Text> : null}
                </> : null}

                <View style={{ height: 28 }} />
            </ScrollView>
            <Modal visible={amendmentVisible} transparent animationType="slide" onRequestClose={() => setAmendmentVisible(false)}><View style={styles.modalOverlay}><View style={[styles.modal, { backgroundColor: palette.surface }]}><Text style={[styles.modalTitle, { color: palette.text }]}>{t('startSalesBookAmendment', language)}</Text><Text style={[styles.modalText, { color: palette.muted }]}>{t('salesBookAmendmentReasonDescription', language)}</Text>{transactions.length > 0 ? <><Text style={[styles.selectionLabel, { color: palette.text }]}>{t('selectInvoiceForAmendment', language)}</Text><ScrollView style={styles.amendmentList} nestedScrollEnabled>{transactions.filter((row) => row.invoice_id).map((row) => { const invoiceId = String(row.invoice_id); const selected = amendmentInvoiceId === invoiceId; return <TouchableOpacity key={invoiceId} onPress={() => setAmendmentInvoiceId(selected ? null : invoiceId)} style={[styles.amendmentOption, { borderColor: selected ? brand.colors.primary : palette.border, backgroundColor: selected ? palette.iconSurface : palette.background }]}><View style={styles.transactionCopy}><Text style={[styles.transactionTitle, { color: palette.text }]}>{String(row.invoice_number || '—')}</Text><Text style={[styles.transactionDetail, { color: palette.muted }]}>{String(row.customer_name || '—')}</Text></View><Text style={[styles.transactionAmount, { color: selected ? brand.colors.primary : palette.text }]}>{formatCurrency(numeric(row.total_amount), currency, language)}</Text></TouchableOpacity>; })}</ScrollView></> : null}<TextInput value={amendmentReason} onChangeText={setAmendmentReason} placeholder={t('amendmentReasonPlaceholder', language)} placeholderTextColor={palette.muted} multiline style={[styles.reasonInput, { color: palette.text, borderColor: palette.border }]} /><View style={styles.modalActions}><Button title={t('cancel', language)} variant="secondary" onPress={() => setAmendmentVisible(false)} /><Button title={t('continue', language)} loading={savingAction} disabled={!amendmentInvoiceId || !amendmentReason.trim()} onPress={saveAmendment} /></View></View></View></Modal>
        </MobileScreen>
    );
}

const styles = StyleSheet.create({
    content: { paddingHorizontal: 20, paddingBottom: 20 },
    hero: { borderWidth: 1, borderRadius: 20, padding: 17, marginBottom: 12 },
    heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
    eyebrow: { fontSize: 11, fontFamily: brand.fonts.regular, textTransform: 'uppercase', letterSpacing: 0.5 },
    heroTitle: { fontSize: 22, fontFamily: brand.fonts.semibold, marginTop: 5 },
    heroDates: { fontSize: 12, fontFamily: brand.fonts.regular, marginTop: 4 },
    statusPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
    statusPillText: { color: '#fff', fontSize: 10, fontFamily: brand.fonts.semibold },
    deadlineRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: 'rgba(148,163,184,0.18)', marginTop: 15, paddingTop: 12 },
    deadlineLabel: { fontSize: 11, fontFamily: brand.fonts.regular },
    deadlineValue: { fontSize: 11, fontFamily: brand.fonts.semibold },
    lockedRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 12 },
    lockedText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: brand.fonts.regular },
    metricsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
    actionButton: { marginTop: 4, marginBottom: 13 },
    transaction: { minHeight: 68, borderRadius: 16, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', marginBottom: 9 },
    transactionCopy: { flex: 1, marginRight: 10 },
    transactionTitle: { fontSize: 13, fontFamily: brand.fonts.semibold },
    transactionDetail: { fontSize: 10, fontFamily: brand.fonts.regular, marginTop: 4 },
    transactionAmount: { fontSize: 12, fontFamily: brand.fonts.semibold, textAlign: 'right' },
    transactionVat: { fontSize: 10, fontFamily: brand.fonts.regular, marginTop: 4, textAlign: 'right' },
    historical: { marginTop: 15 },
    filters: { gap: 8, paddingBottom: 12 },
    filter: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8 },
    periodRow: { minHeight: 66, borderRadius: 16, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', marginBottom: 9 },
    periodCopy: { flex: 1, marginRight: 10 },
    periodTitle: { fontSize: 13, fontFamily: brand.fonts.semibold },
    periodDetail: { fontSize: 10, fontFamily: brand.fonts.regular, marginTop: 4 },
    periodRight: { alignItems: 'flex-end' },
    periodStatus: { fontSize: 10, fontFamily: brand.fonts.semibold },
    periodTotal: { fontSize: 10, fontFamily: brand.fonts.regular, marginTop: 4 },
    empty: { textAlign: 'center', fontSize: 13, fontFamily: brand.fonts.regular, paddingVertical: 28 },
    exportButton: { marginTop: 14, marginBottom: 14 },
    notice: { borderWidth: 1, borderRadius: 17, padding: 14, flexDirection: 'row', alignItems: 'flex-start', marginBottom: 15 },
    noticeCopy: { flex: 1, marginLeft: 10 },
    noticeTitle: { fontSize: 13, fontFamily: brand.fonts.semibold, marginBottom: 4 },
    noticeText: { fontSize: 11, lineHeight: 17, fontFamily: brand.fonts.regular },
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
    modal: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20 },
    modalTitle: { fontSize: 18, fontFamily: brand.fonts.semibold },
    modalText: { fontSize: 12, lineHeight: 18, fontFamily: brand.fonts.regular, marginTop: 7 },
    reasonInput: { minHeight: 100, borderWidth: 1, borderRadius: 13, padding: 12, marginTop: 16, textAlignVertical: 'top' },
    selectionLabel: { fontSize: 12, fontFamily: brand.fonts.semibold, marginTop: 16 },
    amendmentList: { maxHeight: 150, marginTop: 8 },
    amendmentOption: { minHeight: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
    modalActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 16 },
});
