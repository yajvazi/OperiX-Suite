import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Download, Share2 } from 'lucide-react-native';
import * as Print from 'expo-print';
import { supabase } from '@invoice-monorepo/api';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { formatCurrency, t, type TranslationKey } from '@invoice-monorepo/i18n';
import { brand, getPalette } from '../../theme/brand';
import { getWorkspaceScope } from '../../services/workspace';
import { namePdfFile, reportPdfFileName } from '../../services/pdf/fileNaming';
import { Button } from '@invoice-monorepo/ui';
import { ErrorState, LoadingState, MetricCard, MobileHeader, MobileScreen, SectionTitle } from '../../components/mobile/MobileUI';

type ReportRow = Record<string, unknown>;

type ReportOrder = {
    column: string;
    ascending?: boolean;
    nullsFirst?: boolean;
};

type ReportDefinition = {
    titleKey: TranslationKey;
    subtitleKey: TranslationKey;
    source: string;
    amountKeys: string[];
    rowAmountKey?: string;
    orderBy?: ReportOrder[];
};

type ReportMetric = {
    label: string;
    value: number | string;
    tone: 'neutral' | 'warning' | 'success' | 'danger';
};

export const REPORT_DEFINITIONS: Record<string, ReportDefinition> = {
    daily: { titleKey: 'dailyReport', subtitleKey: 'dailyReportDescription', source: 'operix_report_summary', amountKeys: ['net_profit'], orderBy: [{ column: 'company_id' }] },
    trial_balance: { titleKey: 'trialBalance', subtitleKey: 'trialBalanceDescription', source: 'operix_trial_balance', amountKeys: ['total_debit'], rowAmountKey: 'balance', orderBy: [{ column: 'account_code' }, { column: 'company_id' }, { column: 'account_id' }] },
    profit_loss: { titleKey: 'profitLoss', subtitleKey: 'profitLossDescription', source: 'operix_profit_loss', amountKeys: ['presentation_amount'], rowAmountKey: 'presentation_amount', orderBy: [{ column: 'period_start', ascending: false, nullsFirst: false }, { column: 'account_code' }, { column: 'company_id' }, { column: 'account_id' }] },
    balance_sheet: { titleKey: 'balanceSheet', subtitleKey: 'balanceSheetDescription', source: 'operix_balance_sheet', amountKeys: ['presentation_amount'], rowAmountKey: 'presentation_amount', orderBy: [{ column: 'account_code' }, { column: 'company_id' }, { column: 'account_id' }] },
    cash_flow: { titleKey: 'cashFlow', subtitleKey: 'cashFlowDescription', source: 'operix_cash_flow', amountKeys: ['net_change'], rowAmountKey: 'net_change', orderBy: [{ column: 'period_start', ascending: false, nullsFirst: false }, { column: 'cash_account_type' }, { column: 'company_id' }] },
    cash_book: { titleKey: 'cashAndPayments', subtitleKey: 'cashBankJournals', source: 'operix_cash_flow', amountKeys: ['net_change'], rowAmountKey: 'net_change', orderBy: [{ column: 'period_start', ascending: false, nullsFirst: false }, { column: 'cash_account_type' }, { column: 'company_id' }] },
    changes_equity: { titleKey: 'changesInEquity', subtitleKey: 'changesInEquityDescription', source: 'operix_changes_in_equity', amountKeys: ['change_amount'], rowAmountKey: 'change_amount', orderBy: [{ column: 'period_start', ascending: false, nullsFirst: false }, { column: 'account_code' }, { column: 'company_id' }, { column: 'account_id' }] },
    general_ledger: { titleKey: 'generalLedger', subtitleKey: 'generalLedgerDescription', source: 'operix_general_ledger', amountKeys: ['signed_amount'], rowAmountKey: 'signed_amount', orderBy: [{ column: 'posting_date', ascending: false, nullsFirst: false }, { column: 'entry_number', ascending: false }, { column: 'line_number' }, { column: 'company_id' }, { column: 'journal_line_id' }] },
    asset_register: { titleKey: 'assetRegister', subtitleKey: 'assetRegisterDescription', source: 'operix_asset_register', amountKeys: ['acquisition_cost'], rowAmountKey: 'acquisition_cost', orderBy: [{ column: 'acquisition_date', ascending: false, nullsFirst: false }, { column: 'asset_number' }, { column: 'company_id' }, { column: 'fixed_asset_id' }] },
    inventory_register: { titleKey: 'inventoryRegister', subtitleKey: 'inventoryRegisterDescription', source: 'inventory_register', amountKeys: ['inventory_value'], rowAmountKey: 'inventory_value', orderBy: [{ column: 'name' }, { column: 'sku' }, { column: 'company_id' }, { column: 'product_id' }] },
    ar_aging: { titleKey: 'receivablesAging', subtitleKey: 'receivablesAgingDescription', source: 'operix_ar_aging', amountKeys: ['outstanding_amount'], rowAmountKey: 'outstanding_amount', orderBy: [{ column: 'due_date', nullsFirst: false }, { column: 'invoice_number' }, { column: 'company_id' }, { column: 'invoice_id' }] },
    ap_aging: { titleKey: 'payablesAging', subtitleKey: 'payablesAgingDescription', source: 'operix_ap_open_items', amountKeys: ['outstanding_amount'], rowAmountKey: 'outstanding_amount', orderBy: [{ column: 'due_date', nullsFirst: false }, { column: 'bill_number' }, { column: 'company_id' }, { column: 'supplier_bill_id' }] },
    sales_book: { titleKey: 'salesBook', subtitleKey: 'postedSalesVat', source: 'kosovo_sales_book', amountKeys: ['total_amount'], rowAmountKey: 'total_amount', orderBy: [{ column: 'invoice_date', ascending: false, nullsFirst: false }, { column: 'invoice_number' }, { column: 'company_id' }, { column: 'invoice_id' }] },
    purchase_book: { titleKey: 'purchaseBook', subtitleKey: 'supplierInvoicesVat', source: 'kosovo_purchase_book', amountKeys: ['total_amount'], rowAmountKey: 'total_amount', orderBy: [{ column: 'bill_date', ascending: false, nullsFirst: false }, { column: 'bill_number' }, { column: 'company_id' }, { column: 'supplier_bill_id' }] },
    withholding: { titleKey: 'withholdingTax', subtitleKey: 'verifiedWithholding', source: 'withholding_transactions', amountKeys: ['withheld_amount'], rowAmountKey: 'withheld_amount', orderBy: [{ column: 'payment_date', ascending: false, nullsFirst: false }, { column: 'created_at', ascending: false, nullsFirst: false }, { column: 'company_id' }, { column: 'id' }] },
    declarations: { titleKey: 'declarations', subtitleKey: 'declarationPreviews', source: 'tax_declarations', amountKeys: [], orderBy: [{ column: 'period_start', ascending: false, nullsFirst: false }, { column: 'declaration_type' }, { column: 'company_id' }, { column: 'id' }] },
    archive: { titleKey: 'archivedDocuments', subtitleKey: 'sourceDocumentsLinked', source: 'document_archive', amountKeys: ['byte_size'], rowAmountKey: 'byte_size', orderBy: [{ column: 'document_date', ascending: false, nullsFirst: false }, { column: 'file_name' }, { column: 'company_id' }, { column: 'id' }] },
    tax_calendar: { titleKey: 'taxCalendar', subtitleKey: 'taxObligations', source: 'kosovo_tax_calendar', amountKeys: [], orderBy: [{ column: 'due_date', nullsFirst: false }, { column: 'tax_type' }, { column: 'company_id' }, { column: 'id' }] },
};

const PRIMARY_LABEL_KEYS = ['invoice_number', 'bill_number', 'entry_number', 'account_name', 'name', 'asset_number', 'supplier_name', 'customer_name', 'declaration_type', 'title', 'file_name', 'sku', 'description', 'tax_type', '__company_name'];
const REPORT_PAGE_SIZE = 1000;
const REPORT_PREVIEW_PAGE_SIZE = 100;

function asRows(value: unknown): ReportRow[] {
    return Array.isArray(value) ? value as ReportRow[] : [];
}

function numericValue(row: ReportRow, keys: string[]) {
    for (const key of keys) {
        const value = row[key];
        if (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value)))) return Number(value);
    }
    return 0;
}

function reportRowAmount(row: ReportRow, definition: ReportDefinition) {
    return numericValue(row, definition.rowAmountKey ? [definition.rowAmountKey] : definition.amountKeys);
}

async function fetchReportRows(source: string, companyIds: string[], orderBy: ReportOrder[], companyNames: Map<string, string>, maxRows?: number) {
    if (companyIds.length === 0) return [] as ReportRow[];

    const rows: ReportRow[] = [];
    let offset = 0;
    while (true) {
        let request = supabase
            .from(source)
            .select('*')
            .in('company_id', companyIds);
        for (const order of orderBy) {
            request = request.order(order.column, {
                ascending: order.ascending !== false,
                nullsFirst: order.nullsFirst,
            });
        }
        const { data, error } = await request.range(offset, offset + REPORT_PAGE_SIZE - 1);
        if (error) throw error;
        const page = asRows(data).map((row) => ({
            ...row,
            __company_name: companyNames.get(String(row.company_id)) || row.__company_name,
        }));
        rows.push(...page);
        if (maxRows && rows.length >= maxRows) return rows.slice(0, maxRows);
        if (page.length < REPORT_PAGE_SIZE) return rows;
        offset += REPORT_PAGE_SIZE;
    }
}

function rowLabel(row: ReportRow, language: string) {
    for (const key of PRIMARY_LABEL_KEYS) {
        const value = row[key];
        if (value !== null && value !== undefined && String(value).trim() !== '') return String(value);
    }
    return t('accountingEntry', language);
}

function rowDetail(row: ReportRow) {
    const parts = ['posting_date', 'document_date', 'issue_date', 'invoice_date', 'bill_date', 'payment_date', 'period_start', 'due_date', 'aging_bucket', 'status', 'account_code', '__company_name']
        .map((key) => row[key])
        .filter((value) => value !== null && value !== undefined && String(value).trim() !== '')
        .map(String);
    return parts.join(' · ');
}

function escapeHtml(value: unknown) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character));
}

function reportColumnLabel(column: string, language: string) {
    if (language === 'sq') {
        const albanianLabels: Record<string, string> = {
            tenant_name: 'Kompania',
            invoice_number: 'Nr. i faturës',
            bill_number: 'Nr. i faturës së furnitorit',
            entry_number: 'Nr. i regjistrimit',
            account_name: 'Emri i llogarisë',
            account_code: 'Kodi i llogarisë',
            name: 'Emri',
            asset_number: 'Nr. i aktivit',
            supplier_name: 'Furnitori',
            customer_name: 'Klienti',
            declaration_type: 'Lloji i deklaratës',
            title: 'Titulli',
            file_name: 'Emri i skedarit',
            sku: 'Kodi',
            description: 'Përshkrimi',
            tax_type: 'Lloji i tatimit',
            posting_date: 'Data e postimit',
            document_date: 'Data e dokumentit',
            issue_date: 'Data e lëshimit',
            invoice_date: 'Data e faturës',
            bill_date: 'Data e faturës së furnitorit',
            payment_date: 'Data e pagesës',
            period_start: 'Fillimi i periudhës',
            period_end: 'Fundi i periudhës',
            due_date: 'Afati i pagesës',
            status: 'Statusi',
            total_amount: 'Shuma totale',
            net_amount: 'Shuma pa TVSH',
            taxable_amount: 'Baza e tatueshme',
            taxable_base: 'Baza e tatueshme',
            output_vat: 'TVSH në dalje',
            input_vat: 'TVSH e zbritshme',
            recoverable_vat: 'TVSH e zbritshme',
            vat_amount: 'Shuma e TVSH-së',
            withheld_amount: 'Shuma e mbajtur në burim',
            tax_rate: 'Norma tatimore',
            tax_base: 'Baza tatimore',
            total_vat: 'TVSH gjithsej',
            vat_total: 'TVSH gjithsej',
            obligation_type: 'Lloji i detyrimit',
            obligation_status: 'Statusi i detyrimit',
            amount: 'Shuma',
            currency: 'Monedha',
            notes: 'Shënime',
            declaration_status: 'Statusi i deklarimit',
            declaration_number: 'Nr. i deklarimit',
            category: 'Kategoria',
            source: 'Burimi',
            created_at: 'Krijuar më',
            updated_at: 'Përditësuar më',
            presentation_amount: 'Shuma',
            balance: 'Bilanci',
            outstanding_amount: 'Shuma e papaguar',
        };
        if (albanianLabels[column]) return albanianLabels[column];
    }
    if (column === 'tenant_name') return t('company', language);
    return column
        .replace(/^[a-z]+_id$/, '')
        .replaceAll('_', ' ')
        .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function ReportPreviewScreen({ navigation, route }: any) {
    const { user } = useAuth();
    const { isDark, language } = useTheme();
    const palette = getPalette(isDark);
    const type = String(route.params?.subtype || 'daily');
    const definition = REPORT_DEFINITIONS[type] || REPORT_DEFINITIONS.daily;
    const [rows, setRows] = useState<ReportRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [retryToken, setRetryToken] = useState(0);

    useEffect(() => {
        let active = true;
        const load = async () => {
            if (!user) return;
            setLoading(true);
            setError(null);
            try {
                const { companyIds, companies } = await getWorkspaceScope(user.id);
                const companyNames = new Map<string, string>(
                    companies.map((company): [string, string] => [company.id, company.company_name || '']),
                );
                const reportRows = await fetchReportRows(
                    definition.source,
                    companyIds,
                    definition.orderBy || [],
                    companyNames,
                    REPORT_PREVIEW_PAGE_SIZE,
                );
                if (active) setRows(reportRows);

                if (reportRows.length === REPORT_PREVIEW_PAGE_SIZE) {
                    // Do not block the first screen on large ledgers. The
                    // complete result continues loading after page one is visible.
                    void fetchReportRows(
                        definition.source,
                        companyIds,
                        definition.orderBy || [],
                        companyNames,
                    ).then((completeRows) => {
                        if (active) setRows(completeRows);
                    }).catch((backgroundError) => {
                        console.warn(`Report background load error (${type}):`, backgroundError);
                    });
                }
            } catch (loadError) {
                console.error(`Report load error (${type}):`, loadError);
                if (active) setError(t('reportLoadFailed', language));
            } finally {
                if (active) setLoading(false);
            }
        };
        void load();
        return () => { active = false; };
    }, [definition.source, language, type, user, retryToken]);

    const metrics = useMemo<ReportMetric[]>(() => {
        if (type === 'daily') {
            const dailyTotals = rows.reduce<{ revenue: number; expenses: number; netProfit: number }>((result, row) => ({
                revenue: result.revenue + Number(row.revenue || 0),
                expenses: result.expenses + Number(row.expenses || 0),
                netProfit: result.netProfit + Number(row.net_profit || 0),
            }), { revenue: 0, expenses: 0, netProfit: 0 });
            return [
                { label: t('revenue', language), value: dailyTotals.revenue, tone: 'neutral' as const },
                { label: t('expenses', language), value: dailyTotals.expenses, tone: 'warning' as const },
                { label: t('netProfit', language), value: dailyTotals.netProfit, tone: dailyTotals.netProfit >= 0 ? 'success' as const : 'danger' as const },
            ];
        }
        const total = rows.reduce((sum, row) => sum + numericValue(row, definition.amountKeys), 0);
        return [
            { label: t('rows', language), value: rows.length, tone: 'neutral' as const },
            { label: t('primaryTotal', language), value: total, tone: 'neutral' as const },
            { label: t('source', language), value: definition.source.replace('operix_', '').replaceAll('_', ' '), tone: 'neutral' as const },
        ];
    }, [definition.amountKeys, definition.source, language, rows, type]);

    const handleShare = async () => {
        try {
            await Share.share({ message: `${t(definition.titleKey, language)}\n${t(definition.subtitleKey, language)}\n${rows.length} ${t('rows', language)} · OperiX Invoice` });
        } catch (shareError) {
            console.error('Report share error:', shareError);
        }
    };

    const handleExportPdf = async () => {
        setExporting(true);
        try {
            let exportRows = rows;
            if (user) {
                const { companyIds, companies } = await getWorkspaceScope(user.id);
                const companyNames = new Map<string, string>(
                    companies.map((company): [string, string] => [company.id, company.company_name || '']),
                );
                exportRows = await fetchReportRows(
                    definition.source,
                    companyIds,
                    definition.orderBy || [],
                    companyNames,
                );
            }
            const technicalColumns = new Set(['__company_name', 'id', 'company_id', 'client_id', 'invoice_id', 'supplier_bill_id', 'account_id', 'journal_entry_id', 'journal_line_id', 'fixed_asset_id', 'product_id']);
            const exportRowsWithTenant = exportRows.map((row) => ({ ...row, tenant_name: row.__company_name || '—' }));
            const columns = Array.from(new Set(exportRowsWithTenant.flatMap((row) => Object.keys(row))))
                .filter((column) => !technicalColumns.has(column))
                .slice(0, 9);
            const tableRows = exportRowsWithTenant.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row[column])}</td>`).join('')}</tr>`).join('');
            const tenantNames = Array.from(new Set(exportRowsWithTenant.map((row) => String(row.tenant_name || '').trim()).filter(Boolean))).join(', ');
            const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#172033;margin:0;padding:0 12px}header{border-bottom:3px solid #004FFE;padding-bottom:12px;margin-bottom:16px}h1{color:#004FFE;font-size:22px;margin:0 0 5px}p{color:#667085;font-size:11px;margin:3px 0}.tenant{color:#172033;font-size:13px;font-weight:700}table{width:100%;border-collapse:collapse;font-size:9px;table-layout:fixed}th{background:#004FFE;color:white;text-align:left;padding:7px 6px;font-size:9px}td{border:1px solid #D0D5DD;padding:6px;vertical-align:top;overflow-wrap:anywhere}tbody tr:nth-child(even){background:#F7F9FC}.empty{text-align:center;color:#667085;padding:16px}</style></head><body><header><h1>${escapeHtml(t(definition.titleKey, language))}</h1><p>${escapeHtml(t(definition.subtitleKey, language))} · ${escapeHtml(t('generatedByOperix', language))}</p><p class="tenant">${escapeHtml(t('company', language))}: ${escapeHtml(tenantNames || '—')}</p></header><table><thead><tr>${columns.map((column) => `<th>${escapeHtml(reportColumnLabel(column, language))}</th>`).join('')}</tr></thead><tbody>${tableRows || `<tr><td class="empty" colspan="${Math.max(columns.length, 1)}">${escapeHtml(t('noPostedRecords', language))}</td></tr>`}</tbody></table></body></html>`;
            const { uri } = await Print.printToFileAsync({ html, base64: false, width: 842, height: 595, margins: { top: 0, right: 0, bottom: 0, left: 0 } });
            const namedUri = await namePdfFile(uri, reportPdfFileName(tenantNames || t('company', language), t(definition.titleKey, language)));
            await Print.printAsync({ uri: namedUri });
        } catch (exportError) {
            const message = exportError instanceof Error ? exportError.message : String(exportError || '');
            const printWasCancelled = /printing did not complete|cancelled|canceled|user cancel/i.test(message);
            if (!printWasCancelled) {
                console.error('Report PDF export error:', exportError);
                Alert.alert(t('exportUnavailable', language), t('reportPrintFailed', language));
            }
        } finally {
            setExporting(false);
        }
    };

    return (
        <MobileScreen>
            <MobileHeader title={t(definition.titleKey, language)} subtitle={t(definition.subtitleKey, language)} onBack={() => navigation.goBack()} right={<TouchableOpacity accessibilityRole="button" accessibilityLabel={t('shareReport', language)} onPress={() => void handleShare()} hitSlop={10}><Share2 color={palette.text} size={20} /></TouchableOpacity>} />
            {loading ? <LoadingState label={t('readingPostedAccounting', language)} /> : error ? <ErrorState message={error} onRetry={() => { setLoading(true); setRetryToken((value) => value + 1); }} /> : (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
                    <View style={styles.metricsRow}>
                        {metrics.map((metric) => (
                            <MetricCard key={metric.label} label={metric.label} value={typeof metric.value === 'number' && metric.label !== t('rows', language) ? formatCurrency(metric.value) : metric.value} tone={metric.tone} />
                        ))}
                    </View>
                    <Button title={exporting ? t('preparing', language) : t('exportPdf', language)} icon={Download} loading={exporting} onPress={() => void handleExportPdf()} style={styles.exportButton} />
                    <SectionTitle title={t('postedRecords', language)} action={`${rows.length}`} />
                    {rows.slice(0, 100).map((row, index) => (
                        <View key={`${String(row.id || row.journal_entry_id || row.invoice_id || index)}`} style={[styles.row, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                            <View style={styles.rowCopy}>
                                <Text style={[styles.rowTitle, { color: palette.text }]} numberOfLines={1}>{rowLabel(row, language)}</Text>
                                <Text style={[styles.rowDetail, { color: palette.muted }]} numberOfLines={1}>{rowDetail(row) || t(definition.subtitleKey, language)}</Text>
                            </View>
                        <Text style={[styles.rowAmount, { color: palette.text }]}>{formatCurrency(reportRowAmount(row, definition))}</Text>
                        </View>
                    ))}
                    {rows.length === 0 ? <Text style={[styles.empty, { color: palette.muted }]}>{t('noPostedRecords', language)}</Text> : null}
                    <View style={{ height: 28 }} />
                </ScrollView>
            )}
        </MobileScreen>
    );
}

const styles = StyleSheet.create({
    content: { paddingHorizontal: 20, paddingBottom: 20 },
    metricsRow: { flexDirection: 'row', gap: 10, marginBottom: 22 },
    row: { minHeight: 68, borderRadius: 15, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', marginBottom: 9 },
    rowCopy: { flex: 1, marginRight: 10 },
    rowTitle: { fontSize: 13, fontFamily: brand.fonts.semibold },
    rowDetail: { fontSize: 10, fontFamily: brand.fonts.regular, marginTop: 4 },
    rowAmount: { fontSize: 12, fontFamily: brand.fonts.semibold },
    empty: { textAlign: 'center', fontSize: 13, fontFamily: brand.fonts.regular, paddingVertical: 32 },
    exportButton: { marginBottom: 22 },
});
