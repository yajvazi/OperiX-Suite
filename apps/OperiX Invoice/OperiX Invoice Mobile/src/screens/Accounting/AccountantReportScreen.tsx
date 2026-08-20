import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { BarChart3, CalendarDays, Check, ChevronDown, Download, FileText, X, Users } from 'lucide-react-native';
import { supabase } from '@invoice-monorepo/api';
import { listExpenses, listInvoices, listPayments } from '@invoice-monorepo/api/repositories';
import { resolveCommercialDocumentType } from '@invoice-monorepo/commercial-documents';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { formatCurrency, formatDate, getLocalizedErrorMessage, t } from '@invoice-monorepo/i18n';
import { renderTransactionReportHtml } from '@invoice-monorepo/report-templates';
import { buildInvoicePdfData, buildTransactionPdfData, companyPdfInfo, partyFor, numberFor, type BulkDocumentRow, type PdfCompany } from './BulkDocumentExportScreen';
import { createPdfZip, generateBulkPdf, sharePdfZip, type BulkPdfFile } from '../../services/bulkPdfExport';
import { dateRangeZipFileName, documentPdfFileName, reportPdfFileName } from '../../services/pdf/fileNaming';
import { generateInvoiceHtml } from '../../services/pdf/TemplateFactory';
import { generateTransactionPdfHtml } from '../../services/pdf/transactionPdf';
import { getWorkspaceScope, scopedResource } from '../../services/workspace';
import type { RootStackParamList } from '../../navigation/types';
import { brand, getPalette } from '../../theme/brand';
import { ErrorState, LoadingState, MobileHeader, MobileScreen } from '../../components/mobile/MobileUI';

type AccountantType = 'invoices' | 'payments' | 'expenses' | 'sales' | 'vendorLedgers';
type VendorRow = Record<string, any>;
type VendorActivity = { vendor: VendorRow; bills: VendorRow[]; payments: VendorRow[] };

const ACCOUNTANT_TYPES: AccountantType[] = ['invoices', 'payments', 'expenses', 'sales', 'vendorLedgers'];

function validDate(value: string) {
    return !value || /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function dateToInput(date: Date) {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function inputToDate(value: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date();
}

function displayDate(value: string, language: 'en' | 'sq') {
    if (!value) return '';
    return inputToDate(value).toLocaleDateString(language === 'sq' ? 'sq-XK' : 'en-US', { day: '2-digit', month: 'short', year: 'numeric' });
}

type DatePreset = 'today' | 'thisWeek' | 'thisMonth' | 'lastMonth' | 'thisYear';

function dateRangeForPreset(preset: DatePreset) {
    const now = new Date();
    if (preset === 'today') return { from: dateToInput(now), to: dateToInput(now) };
    if (preset === 'thisWeek') {
        const start = new Date(now);
        const mondayOffset = now.getDay() === 0 ? -6 : 1 - now.getDay();
        start.setDate(now.getDate() + mondayOffset);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        return { from: dateToInput(start), to: dateToInput(end) };
    }
    if (preset === 'thisMonth') return { from: dateToInput(new Date(now.getFullYear(), now.getMonth(), 1)), to: dateToInput(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
    if (preset === 'lastMonth') return { from: dateToInput(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: dateToInput(new Date(now.getFullYear(), now.getMonth(), 0)) };
    return { from: dateToInput(new Date(now.getFullYear(), 0, 1)), to: dateToInput(new Date(now.getFullYear(), 11, 31)) };
}

function inDateRange(value: unknown, from: string, to: string) {
    const date = String(value || '').slice(0, 10);
    return Boolean(date) && (!from || date >= from) && (!to || date <= to);
}

function escapeHtml(value: unknown) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] || character));
}

function reportCompany(company: PdfCompany) {
    return {
        name: company.name,
        email: company.email,
        phone: company.phone,
        address: company.address,
        city: company.city,
        country: company.country,
        website: company.website,
        taxId: company.tax_id,
        bankName: company.bank_name,
        bankAccount: company.bank_account,
        iban: company.bank_iban,
        swift: company.bank_swift,
        signatureUrl: company.signature_url,
        stampUrl: company.stamp_url,
        showSignature: true,
        showStamp: true,
    };
}

function selectedDate(rows: BulkDocumentRow[], dateKey: string, fallback: string) {
    const dates = rows.map((row) => String(row[dateKey] || '').slice(0, 10)).filter(Boolean).sort();
    return dates[0] || fallback;
}

function vendorLedgerHtml(activity: VendorActivity, company: PdfCompany, language: 'en' | 'sq', from: string, to: string) {
    const entries = [
        ...activity.bills.map((bill) => ({ date: bill.issue_date, description: `${t('supplierBill', language)} #${bill.bill_number || bill.id}`, debit: Number(bill.total_amount) || 0, credit: 0 })),
        ...activity.payments.map((payment) => ({ date: payment.payment_date, description: `${t('payment', language)}${payment.payment_method ? ` - ${payment.payment_method}` : ''}`, debit: 0, credit: Number(payment.amount) || 0 })),
    ].sort((left, right) => String(left.date).localeCompare(String(right.date)));
    let balance = 0;
    let debitTotal = 0;
    let creditTotal = 0;
    const rows = entries.map((entry, index) => {
        debitTotal += entry.debit;
        creditTotal += entry.credit;
        balance += entry.debit - entry.credit;
        return `<tr><td>${index + 1}</td><td>${escapeHtml(formatDate(entry.date, language))}</td><td>${escapeHtml(entry.description)}</td><td class="num">${entry.debit ? escapeHtml(formatCurrency(entry.debit, 'EUR', language)) : '—'}</td><td class="num">${entry.credit ? escapeHtml(formatCurrency(entry.credit, 'EUR', language)) : '—'}</td><td class="num">${escapeHtml(formatCurrency(balance, 'EUR', language))}</td></tr>`;
    }).join('');
    const companyInfo = reportCompany(company);
    const signature = companyInfo.signatureUrl ? `<div class="signature-asset"><img src="${escapeHtml(companyInfo.signatureUrl)}" alt="Nënshkrimi"/></div>` : '<div class="signature-space"></div>';
    const stamp = companyInfo.stampUrl ? `<div class="stamp-asset"><img src="${escapeHtml(companyInfo.stampUrl)}" alt="Vula"/></div>` : '<div class="stamp-space"></div>';
    const footer = `<footer><div>Bankë: ${escapeHtml(companyInfo.bankName || '—')}<br>IBAN: ${escapeHtml(companyInfo.iban || companyInfo.bankAccount || '—')}</div><div class="footer-center">${escapeHtml([companyInfo.address, companyInfo.city, companyInfo.country].filter(Boolean).join(', '))}<br>${escapeHtml(companyInfo.phone || '')}</div><div class="footer-right">${escapeHtml(companyInfo.email || '')}<br>${escapeHtml(companyInfo.website || '')}<br>© OperiX Invoice</div></footer>`;
    return `<!doctype html><html lang="sq"><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;padding:0;color:#101828;font-family:Arial,Helvetica,sans-serif}body{font-size:10px}.page{min-height:277mm;padding:12mm 13mm;display:flex;flex-direction:column}.head{border-bottom:1.5px solid #101828;padding-bottom:8px}.company{font-size:23px;font-weight:800}.title{font-size:18px;font-weight:800;margin-top:16px}.period{font-size:10px;color:#667085;margin:4px 0 12px}table{width:100%;border-collapse:collapse}th{background:#30343b;color:#fff;text-align:left;padding:6px 5px;font-size:8px}td{border:1px solid #98a2b3;padding:6px 5px}td.num{text-align:right}.total{width:43%;margin:10px 0 0 auto;border:1px solid #98a2b3;padding:7px}.total div{display:flex;justify-content:space-between;padding:3px 0}.total .grand{border-top:1.5px solid #101828;font-size:13px;font-weight:800;margin-top:4px;padding-top:6px}.signatures{margin-top:auto;padding-top:24px;display:grid;grid-template-columns:1fr 1fr;gap:34px}.signature{text-align:center}.signature-asset,.stamp-asset{height:20mm;display:flex;align-items:flex-end;justify-content:center}.stamp-asset{align-items:center}.signature-asset img{max-width:45mm;max-height:18mm;object-fit:contain}.stamp-asset img{max-width:40mm;max-height:40mm;object-fit:contain}.signature-space,.stamp-space{height:20mm}.line{border-top:1px solid #101828;margin-top:2mm;padding-top:1.5mm;font-size:8px}footer{border-top:1px solid #101828;margin-top:14px;padding-top:7px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;font-size:8px}.footer-center{text-align:center}.footer-right{text-align:right}@page{size:A4;margin:0}@media print{thead{display:table-header-group}tr{break-inside:avoid}}
</style></head><body><main class="page"><div class="head"><div class="company">${escapeHtml(companyInfo.name || 'OperiX')}</div><div>${escapeHtml(companyInfo.address || '')}${companyInfo.city ? `, ${escapeHtml(companyInfo.city)}` : ''}</div></div><div class="title">${escapeHtml(t('supplierCard', language))} - ${escapeHtml(activity.vendor.name || '—')}</div><div class="period">${escapeHtml(t('dateFrom', language))}: ${escapeHtml(from || '—')} · ${escapeHtml(t('dateTo', language))}: ${escapeHtml(to || '—')}</div><table><thead><tr><th>Nr.</th><th>${escapeHtml(t('date', language))}</th><th>${escapeHtml(t('description', language))}</th><th class="num">${escapeHtml(t('debit', language))}</th><th class="num">${escapeHtml(t('credit', language))}</th><th class="num">${escapeHtml(t('balance', language))}</th></tr></thead><tbody>${rows || `<tr><td colspan="6">${escapeHtml(t('noDocumentsMatch', language))}</td></tr>`}</tbody><tfoot><tr><td colspan="3"><b>${escapeHtml(t('total', language))}</b></td><td class="num"><b>${escapeHtml(formatCurrency(debitTotal, 'EUR', language))}</b></td><td class="num"><b>${escapeHtml(formatCurrency(creditTotal, 'EUR', language))}</b></td><td class="num"><b>${escapeHtml(formatCurrency(balance, 'EUR', language))}</b></td></tr></tfoot></table><div class="total"><div><span>${escapeHtml(t('debit', language))}</span><b>${escapeHtml(formatCurrency(debitTotal, 'EUR', language))}</b></div><div><span>${escapeHtml(t('credit', language))}</span><b>${escapeHtml(formatCurrency(creditTotal, 'EUR', language))}</b></div><div class="grand"><span>${escapeHtml(t('balance', language))}</span><span>${escapeHtml(formatCurrency(balance, 'EUR', language))}</span></div></div><div class="signatures"><div class="signature">${signature}<div class="line">${escapeHtml(t('signature', language))}</div></div><div class="signature">${stamp}<div class="line">${escapeHtml(t('officialStamp', language))}</div></div></div>${footer}</main></body></html>`;
}

export function AccountantReportScreen() {
    const { user } = useAuth();
    const { isDark, language } = useTheme();
    const palette = getPalette(isDark);
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const locale: 'en' | 'sq' = language === 'sq' ? 'sq' : 'en';
    const [company, setCompany] = useState<PdfCompany>({});
    const [tenantName, setTenantName] = useState('OperiX');
    const [invoices, setInvoices] = useState<BulkDocumentRow[]>([]);
    const [expenses, setExpenses] = useState<BulkDocumentRow[]>([]);
    const [payments, setPayments] = useState<BulkDocumentRow[]>([]);
    const [vendors, setVendors] = useState<VendorRow[]>([]);
    const [bills, setBills] = useState<VendorRow[]>([]);
    const [vendorPayments, setVendorPayments] = useState<VendorRow[]>([]);
    const [selectedTypes, setSelectedTypes] = useState<Set<AccountantType>>(new Set(ACCOUNTANT_TYPES));
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);
    const [exportTotal, setExportTotal] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [datePickerTarget, setDatePickerTarget] = useState<'from' | 'to' | null>(null);
    const [pickerDate, setPickerDate] = useState(new Date());

    const load = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        setError(null);
        try {
            const scope = await getWorkspaceScope(user.id);
            const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
            let tenantData: Record<string, any> = (scope.company || {}) as Record<string, any>;
            const activeCompanyId = profileData?.active_company_id || scope.companyId;
            if (activeCompanyId) {
                const { data } = await supabase.from('companies').select('*').eq('id', activeCompanyId).maybeSingle();
                if (data) tenantData = data as Record<string, any>;
            }
            const pdfCompany = companyPdfInfo({ ...(scope.profile as any), ...(profileData || {}) }, tenantData);
            setCompany(pdfCompany);
            setTenantName(String(pdfCompany.name || 'OperiX'));
            const [invoiceRows, expenseRows, paymentRows, vendorResult, billResult, vendorPaymentResult] = await Promise.all([
                listInvoices(supabase, { userId: user.id, companyIds: scope.companyIds }, { select: '*, client:clients(*), items:invoice_items(*, product:products(sku,name,image_url))' }),
                listExpenses(supabase, { userId: user.id, companyIds: scope.companyIds }),
                listPayments(supabase, { userId: user.id, companyIds: scope.companyIds }),
                supabase.from('vendors').select('*').or(scopedResource(user.id, scope.companyIds)).order('name'),
                supabase.from('supplier_bills').select('*').or(scopedResource(user.id, scope.companyIds)).order('issue_date', { ascending: true }),
                supabase.from('vendor_payments').select('*').or(scopedResource(user.id, scope.companyIds)).order('payment_date', { ascending: true }),
            ]);
            if (vendorResult.error) throw vendorResult.error;
            if (billResult.error) throw billResult.error;
            if (vendorPaymentResult.error) throw vendorPaymentResult.error;
            setInvoices((invoiceRows as BulkDocumentRow[]).filter((row) => ['INVOICE', 'FINAL_INVOICE', 'ADVANCE_INVOICE', 'SIMPLIFIED_INVOICE'].includes(resolveCommercialDocumentType(row)) && !['cancelled', 'credited', 'reversed'].includes(String(row.status || '').toLowerCase())));
            setExpenses((expenseRows as BulkDocumentRow[]).filter((row) => String(row.type || 'expense').toLowerCase() !== 'income'));
            setPayments(paymentRows as BulkDocumentRow[]);
            setVendors((vendorResult.data || []) as VendorRow[]);
            setBills((billResult.data || []) as VendorRow[]);
            setVendorPayments((vendorPaymentResult.data || []) as VendorRow[]);
        } catch (loadError) {
            console.error('Accountant report load error:', loadError);
            setError(getLocalizedErrorMessage(loadError, language, 'unableToLoad'));
        } finally {
            setLoading(false);
        }
    }, [language, user?.id]);

    useFocusEffect(useCallback(() => { void load(); }, [load]));

    const filtered = useMemo(() => {
        const dateFilter = (row: BulkDocumentRow, key: string) => inDateRange(row[key], fromDate, toDate);
        const vendorIds = new Set(vendors.map((vendor) => String(vendor.id)));
        const filteredBills = bills.filter((row) => dateFilter(row, 'issue_date') && vendorIds.has(String(row.vendor_id)));
        const filteredVendorPayments = vendorPayments.filter((row) => dateFilter(row, 'payment_date') && vendorIds.has(String(row.vendor_id)));
        return {
            invoices: invoices.filter((row) => dateFilter(row, 'issue_date')),
            expenses: expenses.filter((row) => dateFilter(row, 'date')),
            payments: payments.filter((row) => dateFilter(row, 'payment_date')),
            bills: filteredBills,
            vendorPayments: filteredVendorPayments,
        };
    }, [bills, expenses, fromDate, invoices, payments, toDate, vendorPayments, vendors]);

    const vendorActivities = useMemo(() => vendors.map((vendor) => ({
        vendor,
        bills: filtered.bills.filter((bill) => String(bill.vendor_id) === String(vendor.id)),
        payments: filtered.vendorPayments.filter((payment) => String(payment.vendor_id) === String(vendor.id)),
    })).filter((activity) => activity.bills.length || activity.payments.length), [filtered.bills, filtered.vendorPayments, vendors]);

    const typeLabel = (type: AccountantType) => ({
        invoices: t('accountantInvoices', language), payments: t('accountantIncomePayments', language), expenses: t('accountantExpenses', language), sales: t('accountantSales', language), vendorLedgers: t('accountantVendorLedgers', language),
    }[type]);
    const typeCount = (type: AccountantType) => type === 'invoices' ? filtered.invoices.length : type === 'expenses' ? filtered.expenses.length : type === 'payments' ? filtered.payments.length : type === 'sales' ? (filtered.invoices.length ? 1 : 0) : vendorActivities.length;

    const toggleType = (type: AccountantType) => setSelectedTypes((current) => {
        const next = new Set(current);
        if (next.has(type)) next.delete(type); else next.add(type);
        return next;
    });

    const setDateTarget = (target: 'from' | 'to', date: Date) => {
        const value = dateToInput(date);
        if (target === 'from') setFromDate(value); else setToDate(value);
    };

    const openDatePicker = (target: 'from' | 'to') => {
        const current = inputToDate(target === 'from' ? fromDate : toDate);
        if (Platform.OS === 'android') {
            DateTimePickerAndroid.open({ value: current, mode: 'date', display: 'calendar', onChange: (event, selected) => { if (event.type !== 'dismissed' && selected) setDateTarget(target, selected); } });
            return;
        }
        setPickerDate(current);
        setDatePickerTarget(target);
    };

    const applyPreset = (preset: DatePreset) => {
        const range = dateRangeForPreset(preset);
        setFromDate(range.from);
        setToDate(range.to);
    };

    const datePresets: Array<{ id: DatePreset; label: string }> = [
        { id: 'today', label: t('today', language) },
        { id: 'thisWeek', label: t('thisWeek', language) },
        { id: 'thisMonth', label: t('thisMonth', language) },
        { id: 'lastMonth', label: t('lastMonth', language) },
        { id: 'thisYear', label: t('thisYear', language) },
    ];

    const handleExport = async () => {
        if (!validDate(fromDate) || !validDate(toDate) || (fromDate && toDate && fromDate > toDate)) {
            Alert.alert(t('error', language), t('invalidDateRange', language));
            return;
        }
        if (!selectedTypes.size) {
            Alert.alert(t('info', language), t('selectReportType', language));
            return;
        }
        const total = Array.from(selectedTypes).reduce((sum, type) => sum + typeCount(type), 0);
        if (!total) {
            Alert.alert(t('info', language), t('noDocumentsMatch', language));
            return;
        }
        setExporting(true);
        setExportProgress(0);
        setExportTotal(total);
        try {
            const files: BulkPdfFile[] = [];
            let progress = 0;
            const addFile = async (html: string, path: string, landscape = false) => {
                const uri = await generateBulkPdf(html, { landscape });
                files.push({ uri, name: path.split('/').at(-1) || path, path });
                progress += 1;
                setExportProgress(progress);
            };
            const reportDate = new Date();
            const reportDateLabel = reportDate.toISOString().slice(0, 10);
            if (selectedTypes.has('invoices')) {
                for (const row of filtered.invoices) await addFile(generateInvoiceHtml(buildInvoicePdfData(row, company, locale), 'corporate'), `${t('accountantInvoices', language)}/${documentPdfFileName(tenantName, numberFor('invoices', row), partyFor('invoices', row) || t('client', language))}`);
            }
            if (selectedTypes.has('payments')) {
                for (const row of filtered.payments) await addFile(generateTransactionPdfHtml(buildTransactionPdfData('payments', row, company, locale)), `${t('accountantIncomePayments', language)}/${documentPdfFileName(tenantName, numberFor('payments', row), partyFor('payments', row) || t('client', language))}`);
            }
            if (selectedTypes.has('expenses')) {
                for (const row of filtered.expenses) await addFile(generateTransactionPdfHtml(buildTransactionPdfData('expenses', row, company, locale)), `${t('accountantExpenses', language)}/${documentPdfFileName(tenantName, numberFor('expenses', row), partyFor('expenses', row) || t('vendorSearch', language))}`);
            }
            if (selectedTypes.has('sales') && filtered.invoices.length) {
                const html = renderTransactionReportHtml({ template: 'sales-ledger', title: t('salesBook', language), company: reportCompany(company), rows: filtered.invoices, reportPeriod: { from: fromDate || selectedDate(filtered.invoices, 'issue_date', reportDateLabel), to: toDate || selectedDate([...filtered.invoices].reverse(), 'issue_date', reportDateLabel) } });
                await addFile(html, `${t('accountantSales', language)}/${reportPdfFileName(tenantName, t('salesBook', language), reportDate)}`, true);
            }
            if (selectedTypes.has('vendorLedgers')) {
                for (const activity of vendorActivities) {
                    const html = vendorLedgerHtml(activity, company, locale, fromDate || selectedDate([...activity.bills, ...activity.payments].map((row) => ({ date: row.issue_date || row.payment_date })), 'date', reportDateLabel), toDate || reportDateLabel);
                    await addFile(html, `${t('accountantVendorLedgers', language)}/${reportPdfFileName(tenantName, `${t('supplierCard', language)} - ${activity.vendor.name || '—'}`, reportDate)}`);
                }
            }
            const zipName = dateRangeZipFileName(tenantName, t('accountantReport', language), fromDate, toDate);
            const zipUri = await createPdfZip(files, zipName);
            await sharePdfZip(zipUri, t('accountantReport', language));
            Alert.alert(t('zipExportReady', language), t('zipExportDescription', language));
        } catch (exportError) {
            console.error('Accountant report export error:', exportError);
            Alert.alert(t('error', language), getLocalizedErrorMessage(exportError, language, 'exportFailed'));
        } finally {
            setExporting(false);
        }
    };

    if (loading) return <MobileScreen><LoadingState label={t('loading', language)} /></MobileScreen>;
    if (error) return <MobileScreen><ErrorState message={error} onRetry={() => { void load(); }} /></MobileScreen>;

    return <MobileScreen>
        <MobileHeader title={t('accountantReport', language)} subtitle={t('accountantReportSubtitle', language)} onBack={() => navigation.goBack()} />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={[styles.filterCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                <View style={styles.filterHeading}><View style={[styles.filterIcon, { backgroundColor: palette.iconSurface }]}><CalendarDays color={brand.colors.primary} size={17} /></View><View><Text style={[styles.filterTitle, { color: palette.text }]}>{t('dateRange', language)}</Text><Text style={[styles.filterHint, { color: palette.muted }]}>{t('dateRangeHint', language)}</Text></View></View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetRow}>{datePresets.map((preset) => <TouchableOpacity key={preset.id} onPress={() => applyPreset(preset.id)} style={[styles.preset, { backgroundColor: fromDate === dateRangeForPreset(preset.id).from && toDate === dateRangeForPreset(preset.id).to ? brand.colors.primary : palette.background, borderColor: fromDate === dateRangeForPreset(preset.id).from && toDate === dateRangeForPreset(preset.id).to ? brand.colors.primary : palette.border }]}><Text style={[styles.presetText, { color: fromDate === dateRangeForPreset(preset.id).from && toDate === dateRangeForPreset(preset.id).to ? '#fff' : palette.text }]}>{preset.label}</Text></TouchableOpacity>)}</ScrollView>
                <View style={styles.inputRow}><TouchableOpacity accessibilityRole="button" onPress={() => openDatePicker('from')} style={[styles.dateField, { borderColor: palette.border }]}><CalendarDays color={palette.muted} size={16} /><View style={styles.dateFieldCopy}><Text style={[styles.dateLabel, { color: palette.muted }]}>{t('dateFrom', language)}</Text><Text style={[styles.dateValue, { color: fromDate ? palette.text : palette.muted }]}>{fromDate ? displayDate(fromDate, locale) : t('chooseDate', language)}</Text></View><ChevronDown color={palette.muted} size={16} /></TouchableOpacity><TouchableOpacity accessibilityRole="button" onPress={() => openDatePicker('to')} style={[styles.dateField, { borderColor: palette.border }]}><CalendarDays color={palette.muted} size={16} /><View style={styles.dateFieldCopy}><Text style={[styles.dateLabel, { color: palette.muted }]}>{t('dateTo', language)}</Text><Text style={[styles.dateValue, { color: toDate ? palette.text : palette.muted }]}>{toDate ? displayDate(toDate, locale) : t('chooseDate', language)}</Text></View><ChevronDown color={palette.muted} size={16} /></TouchableOpacity></View>
            </View>
            <Text style={[styles.sectionTitle, { color: palette.text }]}>{t('accountantSelectTypes', language)}</Text>
            {ACCOUNTANT_TYPES.map((type) => { const checked = selectedTypes.has(type); return <TouchableOpacity key={type} accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => toggleType(type)} style={[styles.typeRow, { backgroundColor: palette.surface, borderColor: checked ? brand.colors.primary : palette.border }]}><View style={[styles.checkbox, { borderColor: checked ? brand.colors.primary : palette.border, backgroundColor: checked ? brand.colors.primary : 'transparent' }]}>{checked ? <Check color="#fff" size={15} /> : null}</View><View style={styles.typeCopy}><Text style={[styles.typeTitle, { color: palette.text }]}>{typeLabel(type)}</Text><Text style={[styles.typeMeta, { color: palette.muted }]}>{typeCount(type)} · {t('accountantIncludedInZip', language)}</Text></View>{type === 'invoices' ? <FileText color={brand.colors.primary} size={19} /> : type === 'sales' ? <BarChart3 color={brand.colors.primary} size={19} /> : type === 'vendorLedgers' ? <Users color={brand.colors.primary} size={19} /> : <Download color={brand.colors.primary} size={19} />}</TouchableOpacity>; })}
            <TouchableOpacity onPress={handleExport} disabled={exporting} style={[styles.exportButton, { backgroundColor: exporting ? palette.border : brand.colors.primary }]}><Download color="#fff" size={18} /><Text style={styles.exportText}>{exporting ? `${t('exporting', language)} ${exportProgress}/${exportTotal}` : t('downloadZip', language)}</Text></TouchableOpacity>
            <Text style={[styles.note, { color: palette.muted }]}>{t('accountantFolderNote', language)}</Text>
        </ScrollView>
        {datePickerTarget ? <Modal visible transparent animationType="slide" onRequestClose={() => setDatePickerTarget(null)}><View style={styles.modalOverlay}><TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setDatePickerTarget(null)} /><View style={[styles.datePickerSheet, { backgroundColor: palette.surface }]}><View style={styles.datePickerHeader}><Text style={[styles.datePickerTitle, { color: palette.text }]}>{datePickerTarget === 'from' ? t('dateFrom', language) : t('dateTo', language)}</Text><TouchableOpacity accessibilityRole="button" onPress={() => setDatePickerTarget(null)}><X color={palette.muted} size={21} /></TouchableOpacity></View><DateTimePicker value={pickerDate} mode="date" display="spinner" onChange={(_, selected) => { if (selected) { setPickerDate(selected); setDateTarget(datePickerTarget, selected); } }} themeVariant={isDark ? 'dark' : 'light'} /><TouchableOpacity onPress={() => setDatePickerTarget(null)} style={[styles.doneButton, { backgroundColor: brand.colors.primary }]}><Text style={styles.doneText}>{t('done', language)}</Text></TouchableOpacity></View></View></Modal> : null}
    </MobileScreen>;
}

const styles = StyleSheet.create({
    content: { paddingHorizontal: 20, paddingBottom: 32 },
    filterCard: { borderWidth: 1, borderRadius: 17, padding: 14, marginBottom: 16 },
    filterHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 13 },
    filterIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    filterTitle: { fontSize: 14, fontFamily: brand.fonts.semibold },
    filterHint: { fontSize: 10, marginTop: 2 },
    presetRow: { gap: 8, paddingBottom: 12 },
    preset: { borderWidth: 1, borderRadius: 15, paddingHorizontal: 12, paddingVertical: 8 },
    presetText: { fontSize: 11, fontFamily: brand.fonts.semibold },
    sectionTitle: { fontSize: 14, fontFamily: brand.fonts.semibold, marginBottom: 10 },
    inputRow: { flexDirection: 'row', gap: 9 },
    dateField: { flex: 1, minHeight: 55, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
    dateFieldCopy: { flex: 1 },
    dateLabel: { fontSize: 10 },
    dateValue: { fontSize: 12, fontFamily: brand.fonts.semibold, marginTop: 3 },
    typeRow: { minHeight: 66, borderWidth: 1, borderRadius: 15, padding: 12, marginBottom: 9, flexDirection: 'row', alignItems: 'center', gap: 10 },
    checkbox: { width: 22, height: 22, borderWidth: 1.5, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
    typeCopy: { flex: 1 },
    typeTitle: { fontSize: 13, fontFamily: brand.fonts.semibold },
    typeMeta: { fontSize: 11, marginTop: 4 },
    exportButton: { minHeight: 47, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8 },
    exportText: { color: '#fff', fontSize: 12, fontFamily: brand.fonts.semibold },
    note: { fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 12 },
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
    datePickerSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 28 },
    datePickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    datePickerTitle: { fontSize: 17, fontFamily: brand.fonts.semibold },
    doneButton: { minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 5 },
    doneText: { color: '#fff', fontSize: 12, fontFamily: brand.fonts.semibold },
});
