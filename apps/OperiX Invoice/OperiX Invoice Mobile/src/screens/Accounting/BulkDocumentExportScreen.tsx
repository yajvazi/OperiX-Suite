import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CalendarDays, Check, Download, FileText, Search, Square, WalletCards } from 'lucide-react-native';
import { supabase } from '@invoice-monorepo/api';
import { listExpenses, listInvoices, listPayments } from '@invoice-monorepo/api/repositories';
import { calculateInvoice } from '@invoice-monorepo/money';
import { documentTypeLabel, resolveCommercialDocumentType } from '@invoice-monorepo/commercial-documents';
import type { InvoiceData } from '@invoice-monorepo/types';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { formatCurrency, formatDate, getLocalizedErrorMessage, t } from '@invoice-monorepo/i18n';
import { generateInvoiceHtml } from '../../services/pdf/TemplateFactory';
import { generateTransactionPdfHtml } from '../../services/pdf/transactionPdf';
import { dateRangeZipFileName, documentPdfFileName } from '../../services/pdf/fileNaming';
import { createPdfZip, generateBulkPdf, sharePdfZip, type BulkPdfFile } from '../../services/bulkPdfExport';
import { getWorkspaceScope } from '../../services/workspace';
import { normalizeBrandColor, brand, getPalette } from '../../theme/brand';
import type { RootStackParamList } from '../../navigation/types';
import { ErrorState, LoadingState, MobileHeader, MobileScreen } from '../../components/mobile/MobileUI';

export type BulkDocumentKind = 'invoices' | 'expenses' | 'payments';
export type BulkDocumentRow = Record<string, any>;
export type PdfCompany = Record<string, any>;

function validDate(value: string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function dateFor(kind: BulkDocumentKind, row: BulkDocumentRow) {
    return String(kind === 'invoices' ? row.issue_date : kind === 'expenses' ? row.date : row.payment_date || '');
}

export function partyFor(kind: BulkDocumentKind, row: BulkDocumentRow) {
    if (kind === 'invoices' || kind === 'payments') return String(row.client?.name || '');
    return String(row.vendor_name || '');
}

export function amountFor(kind: BulkDocumentKind, row: BulkDocumentRow) {
    return Number(kind === 'invoices' ? row.total_amount : row.amount) || 0;
}

export function numberFor(kind: BulkDocumentKind, row: BulkDocumentRow) {
    if (kind === 'invoices') return String(row.invoice_number || row.id || '—');
    if (kind === 'payments') return String(row.payment_number || row.id || '—');
    return `EXP-${String(row.id || '').slice(0, 8).toUpperCase()}`;
}

export function companyPdfInfo(profile: Record<string, any>, tenant: Record<string, any>): PdfCompany {
    return {
        ...profile,
        ...tenant,
        name: tenant.company_name || tenant.name || profile.company_name || 'OperiX',
        email: tenant.email || profile.email,
        phone: tenant.phone || profile.phone,
        address: tenant.address || tenant.registered_address || profile.address || '',
        city: tenant.city || tenant.municipality || profile.city,
        country: tenant.country || profile.country,
        website: tenant.website || profile.website,
        tax_id: tenant.tax_id || tenant.unique_business_number || profile.tax_id,
        logo_url: tenant.logo_url || profile.logo_url,
        signature_url: tenant.signature_url || profile.signature_url,
        stamp_url: tenant.stamp_url || profile.stamp_url,
        bank_name: tenant.bank_name || profile.bank_name,
        bank_iban: tenant.bank_iban || profile.bank_iban,
        primary_color: tenant.primary_color || profile.primary_color,
        template_config: tenant.template_config || profile.template_config || {},
    };
}

export function buildInvoicePdfData(row: BulkDocumentRow, company: PdfCompany, language: 'en' | 'sq'): InvoiceData {
    const rawItems = Array.isArray(row.items) ? row.items : [];
    const items = rawItems.length ? rawItems : [{ description: t('invoice', language), quantity: 1, unit_price: Number(row.total_amount) || 0, tax_rate: 0, tax_included: false, amount: Number(row.total_amount) || 0 }];
    const calculated = calculateInvoice({
        lines: items.map((item: any) => ({
            quantity: Number(item.quantity) || 0,
            unitPrice: Number(item.unit_price) || 0,
            discountPercent: Number(item.discount) || 0,
            taxRate: Number(item.tax_rate) || 0,
            taxIncluded: Boolean(item.tax_included),
        })),
        currency: String(row.currency || company.currency || 'EUR'),
    });
    const documentType = resolveCommercialDocumentType(row);
    const client = row.client || {};
    return {
        company: {
            name: company.name,
            address: company.address || '',
            city: company.city,
            country: company.country,
            email: company.email,
            phone: company.phone,
            website: company.website,
            taxId: company.tax_id,
            logoUrl: company.logo_url,
            signatureUrl: company.signature_url,
            stampUrl: company.stamp_url,
            bankName: company.bank_name,
            bankAccount: company.bank_account,
            bankIban: company.bank_iban,
            bankSwift: company.bank_swift,
            primaryColor: normalizeBrandColor(company.primary_color),
            isGrayscale: company.is_grayscale,
            paymentLinkStripe: company.payment_link_stripe,
            paymentLinkPaypal: company.payment_link_paypal,
        },
        client: {
            name: client.name || t('client', language),
            address: [client.address, client.city, client.zip_code, client.country].filter(Boolean).join(', '),
            email: client.email || '',
            phone: client.phone || '',
            taxId: client.tax_id || '',
            nui: client.nui || '',
            fiscalNumber: client.fiscal_number || '',
            vatNumber: client.vat_number || '',
        },
        details: {
            number: String(row.invoice_number || row.id),
            issueDate: String(row.issue_date || ''),
            dueDate: String(row.due_date || ''),
            currency: calculated.currency,
            language,
            notes: row.notes || '',
            terms: company.terms_conditions || '',
            paymentMethod: row.payment_method,
            amountReceived: Number(row.amount_received) || 0,
            changeAmount: Number(row.change_amount) || 0,
            type: row.type === 'offer' ? 'offer' : 'invoice',
            subtype: row.subtype || 'regular',
            commercialDocumentType: documentType,
            documentTypeLabel: documentTypeLabel(documentType, language),
            deliveryMethod: row.delivery_method || '',
            deliveryDetails: row.delivery_details || '',
            showStampOnInvoice: true,
        },
        items: items.map((item: any, index: number) => ({
            description: String(item.description || item.product?.name || ''),
            quantity: Number(item.quantity) || 0,
            unit: item.unit || 'pcs',
            sku: item.sku || item.product?.sku || '',
            price: Number(item.unit_price) || 0,
            discount: Number(item.discount) || 0,
            total: calculated.lines[index]?.total ?? (Number(item.amount) || 0),
            taxable: calculated.lines[index]?.taxable ?? (Number(item.amount) || 0),
            tax: calculated.lines[index]?.tax ?? 0,
            taxIncluded: Boolean(item.tax_included),
            taxRate: Number(item.tax_rate) || 0,
            imageUrl: item.image_url || item.product?.image_url,
        })),
        summary: {
            subtotal: calculated.subtotal,
            tax: calculated.tax,
            discount: calculated.discount,
            total: calculated.total,
            amountReceived: Number(row.amount_received) || 0,
            changeAmount: Number(row.change_amount) || 0,
            discountPercent: Number(row.discount_percent) || 0,
        },
        config: {
            showLogo: true,
            showBuyerSignature: true,
            showStamp: true,
            showSignature: true,
            showNotes: true,
            showDiscount: true,
            showTax: true,
            showBankDetails: true,
            pageSize: 'A4',
            style: 'corporate',
            ...(company.template_config || {}),
        },
    };
}

export function buildTransactionPdfData(kind: 'expenses' | 'payments', row: BulkDocumentRow, company: PdfCompany, language: 'en' | 'sq') {
    const isPayment = kind === 'payments';
    const number = numberFor(kind, row);
    const party = partyFor(kind, row);
    return {
        title: isPayment ? t('incomingPayments', language) : t('expense', language),
        number,
        amount: amountFor(kind, row),
        date: dateFor(kind, row),
        description: row.description || '',
        notes: row.notes || '',
        category: row.category || '',
        method: row.payment_method || '',
        counterparty: party || undefined,
        counterpartyType: isPayment ? 'customer' as const : party ? 'vendor' as const : undefined,
        counterpartyEmail: row.client?.email || undefined,
        counterpartyPhone: row.client?.phone || undefined,
        counterpartyAddress: row.client?.address || undefined,
        relatedDocumentNumber: isPayment ? row.invoice?.invoice_number : row.invoice_number,
        relatedDocumentLabel: t('invoiceNumber', language),
        reference: row.bank_reference || '',
        transactionType: isPayment ? 'payment' as const : 'expense' as const,
        documentStatusLabel: isPayment ? t('paymentReceipt', language) : t('expense', language),
        barcodeValue: `${isPayment ? 'PAYMENT' : 'EXPENSE'}:${row.id}`,
        language,
        company: {
            name: company.name,
            email: company.email,
            phone: company.phone,
            address: company.address,
            city: company.city,
            country: company.country,
            website: company.website,
            taxId: company.tax_id,
            bankName: company.bank_name,
            iban: company.bank_iban,
            primaryColor: normalizeBrandColor(company.primary_color),
            signatureUrl: company.signature_url,
            stampUrl: company.stamp_url,
            showSignature: true,
            showStamp: true,
        },
    };
}

export function BulkDocumentExportScreen({ route }: { route: { params?: { kind?: BulkDocumentKind } } }) {
    const kind = route.params?.kind || 'invoices';
    const { user } = useAuth();
    const { isDark, language } = useTheme();
    const palette = getPalette(isDark);
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const locale = language === 'sq' ? 'sq' : 'en';
    const [rows, setRows] = useState<BulkDocumentRow[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [company, setCompany] = useState<PdfCompany>({});
    const [tenantName, setTenantName] = useState('OperiX');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [partySearch, setPartySearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [exportProgress, setExportProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);

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

            let nextRows: BulkDocumentRow[];
            if (kind === 'invoices') {
                const invoiceRows = await listInvoices(supabase, { userId: user.id, companyIds: scope.companyIds }, {
                    select: '*, client:clients(*), items:invoice_items(*, product:products(sku,name,image_url))',
                });
                nextRows = (invoiceRows as BulkDocumentRow[]).filter((row) => {
                    const type = resolveCommercialDocumentType(row);
                    return ['INVOICE', 'FINAL_INVOICE', 'ADVANCE_INVOICE', 'SIMPLIFIED_INVOICE'].includes(type)
                        && !['cancelled', 'credited', 'reversed'].includes(String(row.status || '').toLowerCase());
                });
            } else if (kind === 'expenses') {
                nextRows = (await listExpenses(supabase, { userId: user.id, companyIds: scope.companyIds }) as BulkDocumentRow[])
                    .filter((row) => String(row.type || 'expense').toLowerCase() !== 'income');
            } else {
                nextRows = await listPayments(supabase, { userId: user.id, companyIds: scope.companyIds }) as BulkDocumentRow[];
            }
            setRows(nextRows);
            setSelected(new Set());
        } catch (loadError) {
            console.error('Bulk document export load error:', loadError);
            setError(getLocalizedErrorMessage(loadError, language, 'unableToLoad'));
        } finally {
            setLoading(false);
        }
    }, [kind, language, user?.id]);

    useFocusEffect(useCallback(() => { void load(); }, [load]));

    const filteredRows = useMemo(() => rows.filter((row) => {
        const date = dateFor(kind, row).slice(0, 10);
        const dateMatches = (!validDate(fromDate) || date >= fromDate) && (!validDate(toDate) || date <= toDate);
        const search = partySearch.trim().toLocaleLowerCase('sq-XK');
        const partyMatches = !search || partyFor(kind, row).toLocaleLowerCase('sq-XK').includes(search);
        return dateMatches && partyMatches;
    }), [fromDate, kind, partySearch, rows, toDate]);

    const allFilteredSelected = filteredRows.length > 0 && filteredRows.every((row) => selected.has(String(row.id)));

    const toggleSelected = (id: string) => {
        setSelected((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleAllFiltered = () => {
        setSelected((current) => {
            const next = new Set(current);
            if (allFilteredSelected) filteredRows.forEach((row) => next.delete(String(row.id)));
            else filteredRows.forEach((row) => next.add(String(row.id)));
            return next;
        });
    };

    const pageTitle = kind === 'invoices' ? t('bulkInvoices', language) : kind === 'expenses' ? t('bulkExpenses', language) : t('bulkIncomePayments', language);

    const handleExport = async () => {
        const selectedRows = filteredRows.filter((row) => selected.has(String(row.id)));
        if (!selectedRows.length) {
            Alert.alert(t('info', language), t('noDocumentsMatch', language));
            return;
        }
        setExporting(true);
        setExportProgress(0);
        try {
            const files: BulkPdfFile[] = [];
            for (let index = 0; index < selectedRows.length; index += 1) {
                const row = selectedRows[index];
                const html = kind === 'invoices'
                    ? generateInvoiceHtml(buildInvoicePdfData(row, company, locale), 'corporate')
                    : generateTransactionPdfHtml(buildTransactionPdfData(kind, row, company, locale));
                const uri = await generateBulkPdf(html);
                const clientName = partyFor(kind, row) || t('client', language);
                files.push({
                    uri,
                    name: documentPdfFileName(tenantName, numberFor(kind, row), clientName),
                });
                setExportProgress(index + 1);
            }
            const zipName = dateRangeZipFileName(tenantName, pageTitle, fromDate, toDate);
            const zipUri = await createPdfZip(files, zipName);
            await sharePdfZip(zipUri, pageTitle);
            Alert.alert(t('zipExportReady', language), t('zipExportDescription', language));
        } catch (exportError) {
            console.error('Bulk document export error:', exportError);
            Alert.alert(t('error', language), getLocalizedErrorMessage(exportError, language, 'exportFailed'));
        } finally {
            setExporting(false);
        }
    };

    const renderRow = ({ item }: { item: BulkDocumentRow }) => {
        const id = String(item.id);
        const checked = selected.has(id);
        return (
            <TouchableOpacity
                accessibilityRole="checkbox"
                accessibilityState={{ checked }}
                onPress={() => toggleSelected(id)}
                style={[styles.row, { backgroundColor: palette.surface, borderColor: palette.border }]}
            >
                <View style={[styles.checkbox, { borderColor: checked ? brand.colors.primary : palette.border, backgroundColor: checked ? brand.colors.primary : 'transparent' }]}>
                    {checked ? <Check color="#fff" size={15} /> : null}
                </View>
                <View style={styles.rowCopy}>
                    <Text style={[styles.rowTitle, { color: palette.text }]} numberOfLines={1}>{numberFor(kind, item)}</Text>
                    <Text style={[styles.rowMeta, { color: palette.muted }]} numberOfLines={1}>{partyFor(kind, item) || '—'} · {formatDate(dateFor(kind, item), language)}</Text>
                </View>
                <Text style={[styles.rowAmount, { color: palette.text }]}>{formatCurrency(amountFor(kind, item), 'EUR', language)}</Text>
            </TouchableOpacity>
        );
    };

    if (loading) return <MobileScreen><LoadingState label={t('loading', language)} /></MobileScreen>;
    if (error) return <MobileScreen><ErrorState message={error} onRetry={() => { void load(); }} /></MobileScreen>;

    return (
        <MobileScreen>
            <MobileHeader title={pageTitle} subtitle={t('bulkDocumentDownloads', language)} onBack={() => navigation.goBack()} />
            <View style={styles.content}>
                <View style={[styles.filterCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                    <View style={styles.filterTitleRow}><Search color={brand.colors.primary} size={18} /><Text style={[styles.filterTitle, { color: palette.text }]}>{t('filter', language)}</Text></View>
                    <View style={styles.inputRow}>
                        <View style={styles.inputWrap}><CalendarDays color={palette.muted} size={16} /><TextInput value={fromDate} onChangeText={setFromDate} placeholder={t('dateFrom', language)} placeholderTextColor={palette.muted} style={[styles.input, { color: palette.text }]} keyboardType="numbers-and-punctuation" /></View>
                        <View style={styles.inputWrap}><CalendarDays color={palette.muted} size={16} /><TextInput value={toDate} onChangeText={setToDate} placeholder={t('dateTo', language)} placeholderTextColor={palette.muted} style={[styles.input, { color: palette.text }]} keyboardType="numbers-and-punctuation" /></View>
                    </View>
                    <View style={styles.inputWrap}><Search color={palette.muted} size={16} /><TextInput value={partySearch} onChangeText={setPartySearch} placeholder={kind === 'expenses' ? t('vendorSearch', language) : t('clientSearch', language)} placeholderTextColor={palette.muted} style={[styles.input, { color: palette.text }]} /></View>
                </View>
                <View style={styles.actionRow}>
                    <TouchableOpacity onPress={toggleAllFiltered} style={[styles.secondaryButton, { borderColor: palette.border }]}><Square color={brand.colors.primary} size={16} /><Text style={[styles.buttonText, { color: palette.text }]}>{allFilteredSelected ? t('clearSelection', language) : t('selectAll', language)}</Text></TouchableOpacity>
                    <TouchableOpacity onPress={handleExport} disabled={exporting || selected.size === 0} style={[styles.exportButton, { backgroundColor: exporting || selected.size === 0 ? palette.border : brand.colors.primary }]}><Download color="#fff" size={17} /><Text style={styles.exportText}>{exporting ? `${t('exporting', language)} ${exportProgress}/${selected.size}` : t('downloadZip', language)}</Text></TouchableOpacity>
                </View>
                <Text style={[styles.countText, { color: palette.muted }]}>{t('selectedCount', language).replace('{count}', String(selected.size))} · {filteredRows.length} {pageTitle.toLocaleLowerCase(locale)}</Text>
                <FlatList
                    data={filteredRows}
                    renderItem={renderRow}
                    keyExtractor={(item) => String(item.id)}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.list}
                    ListEmptyComponent={<View style={styles.empty}><FileText color={palette.muted} size={38} /><Text style={[styles.emptyText, { color: palette.muted }]}>{t('noDocumentsMatch', language)}</Text></View>}
                />
            </View>
        </MobileScreen>
    );
}

const styles = StyleSheet.create({
    content: { flex: 1, paddingHorizontal: 20 },
    filterCard: { borderWidth: 1, borderRadius: 17, padding: 14, marginBottom: 12 },
    filterTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 11 },
    filterTitle: { fontSize: 14, fontFamily: brand.fonts.semibold },
    inputRow: { flexDirection: 'row', gap: 9, marginBottom: 9 },
    inputWrap: { flex: 1, minHeight: 42, borderWidth: 1, borderColor: '#98A2B3', borderRadius: 11, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 7 },
    input: { flex: 1, fontSize: 12, paddingVertical: 9 },
    actionRow: { flexDirection: 'row', gap: 9, marginBottom: 8 },
    secondaryButton: { flex: 1, minHeight: 43, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
    exportButton: { flex: 1.25, minHeight: 43, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
    buttonText: { fontSize: 11, fontFamily: brand.fonts.semibold },
    exportText: { color: '#fff', fontSize: 11, fontFamily: brand.fonts.semibold },
    countText: { fontSize: 11, marginBottom: 9 },
    list: { paddingBottom: 26 },
    row: { minHeight: 70, borderWidth: 1, borderRadius: 15, padding: 12, marginBottom: 9, flexDirection: 'row', alignItems: 'center', gap: 10 },
    checkbox: { width: 22, height: 22, borderWidth: 1.5, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
    rowCopy: { flex: 1 },
    rowTitle: { fontSize: 13, fontFamily: brand.fonts.semibold },
    rowMeta: { fontSize: 11, marginTop: 4 },
    rowAmount: { fontSize: 13, fontFamily: brand.fonts.semibold },
    empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
    emptyText: { fontSize: 13, textAlign: 'center' },
});
