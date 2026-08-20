import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowDownCircle, ArrowUpCircle, Check, ChevronDown, FileText, QrCode, Search as SearchIcon, UserRound, X } from 'lucide-react-native';
import type { CommercialDocumentType } from '@invoice-monorepo/commercial-documents';
import {
    documentTypeLabel,
    resolveCommercialDocumentType,
} from '@invoice-monorepo/commercial-documents';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { formatCurrency, formatDate as formatLocalizedDate, t, type TranslationKey } from '@invoice-monorepo/i18n';
import { supabase } from '@invoice-monorepo/api';
import { listCustomers, listPayments } from '@invoice-monorepo/api/repositories';
import { brand, getPalette } from '../../theme/brand';
import { getWorkspaceScope, scopedResource, scopedSearch } from '../../services/workspace';
import type { RootStackParamList } from '../../navigation/types';
import {
    EmptyState,
    ErrorState,
    GlobalCreateButton,
    LoadingState,
    MobileHeader,
    MobileScreen,
    SearchField,
} from '../../components/mobile/MobileUI';

type DocumentRow = Record<string, any>;
type CustomerRow = Record<string, any>;
type DocumentFilter = 'ALL' | CommercialDocumentType;
type SalesFilter = DocumentFilter | 'PAYMENTS' | 'EXPENSES';

const documentFilters: Array<{ key: DocumentFilter; labelKey: TranslationKey }> = [
    { key: 'ALL', labelKey: 'viewAll' },
    { key: 'INVOICE', labelKey: 'invoices' },
    { key: 'PROFORMA', labelKey: 'proInvoices' },
    { key: 'QUOTE', labelKey: 'offers' },
    { key: 'SALES_ORDER', labelKey: 'orders' },
    { key: 'DELIVERY_NOTE', labelKey: 'deliveryNotes' },
];

const salesFilters: Array<{ key: SalesFilter; labelKey: TranslationKey }> = [
    ...documentFilters,
    { key: 'PAYMENTS', labelKey: 'payments' },
    { key: 'EXPENSES', labelKey: 'expenses' },
];

function formatDate(value: string | undefined, language: string) {
    if (!value) return '—';
    return formatLocalizedDate(value, language);
}

function statusLabel(status: string | null | undefined, language: string) {
    const keys: Record<string, TranslationKey> = {
        DRAFT: 'draft', SENT: 'sent', VIEWED: 'viewed', ACCEPTED: 'accepted', REJECTED: 'rejected',
        EXPIRED: 'expired', CONVERTED: 'converted', CANCELLED: 'cancelled', PARTIALLY_PAID: 'partiallyPaid',
        PAID: 'paid', CONFIRMED: 'confirmed', PROCESSING: 'processing', PARTIALLY_FULFILLED: 'partiallyFulfilled',
        FULFILLED: 'fulfilled', PREPARED: 'prepared', DISPATCHED: 'dispatched', DELIVERED: 'delivered',
        PARTIALLY_DELIVERED: 'partiallyDelivered', REJECTED_DELIVERY: 'rejectedDelivery', RETURNED: 'returned',
        ISSUED: 'issued', OVERDUE: 'overdue', CREDITED: 'credited', PARTIALLY_CREDITED: 'partiallyCredited',
    };
    const normalized = String(status || 'DRAFT').toUpperCase();
    return t(keys[normalized] || 'draft', language);
}

function legacyStatus(status?: string | null) {
    const normalized = String(status || '').toUpperCase();
    if (normalized === 'PAID') return 'paid';
    if (normalized === 'OVERDUE') return 'overdue';
    if (normalized === 'SENT' || normalized === 'ISSUED' || normalized === 'DELIVERED' || normalized === 'CONFIRMED') return 'sent';
    if (normalized === 'CANCELLED' || normalized === 'REJECTED') return 'cancelled';
    return 'draft';
}

export function SalesScreen() {
    const { user } = useAuth();
    const { isDark, primaryColor, language } = useTheme();
    const palette = getPalette(isDark);
    const locale = language === 'sq' ? 'sq' : 'en';
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const route = useRoute<any>();
    const [documents, setDocuments] = useState<DocumentRow[]>([]);
    const [customers, setCustomers] = useState<CustomerRow[]>([]);
    const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);
    const [customerSearch, setCustomerSearch] = useState('');
    const [showCustomerPicker, setShowCustomerPicker] = useState(false);
    const [filter, setFilter] = useState<SalesFilter>('ALL');
    const [payments, setPayments] = useState<Record<string, any>[]>([]);
    const [expenses, setExpenses] = useState<Record<string, any>[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        const invoiceSearch = route.params?.invoiceSearch as string | undefined;
        if (!invoiceSearch) return;
        setSearch(invoiceSearch.replace(/^INVOICE:/i, '').trim());
        navigation.setParams({ invoiceSearch: undefined });
    }, [navigation, route.params?.invoiceSearch]);

    const fetchCustomers = useCallback(async () => {
        if (!user) return;
        try {
            const { companyIds } = await getWorkspaceScope(user.id);
            const rows = await listCustomers(supabase, { userId: user.id, companyIds });
            setCustomers((rows || []) as CustomerRow[]);
        } catch (fetchError) {
            console.error('Sales customers error:', fetchError);
            setCustomers([]);
        }
    }, [user?.id]);

    const fetchDocuments = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        setError(null);
        try {
            const { companyIds } = await getWorkspaceScope(user.id);
            const scope = scopedResource(user.id, companyIds);
            let query: any = supabase
                .from('invoices')
                .select('id,client_id,invoice_number,total_amount,status,commercial_document_type,commercial_status,issue_date,due_date,created_at,notes,client:clients(id,name)')
                .or(scope)
                .order('created_at', { ascending: false })
                .limit(150);
            if (search.trim()) query = query.or(scopedSearch(scope, ['invoice_number', 'notes'], `%${search.trim().slice(0, 80)}%`));
            const result = await query;
            if (result.error && /commercial_document_type/i.test(result.error.message || '')) {
                const fallback = await supabase
                    .from('invoices')
                    .select('id,client_id,invoice_number,total_amount,status,type,subtype,issue_date,due_date,created_at,notes,client:clients(id,name)')
                    .or(scope)
                    .order('created_at', { ascending: false })
                    .limit(150);
                if (fallback.error) throw fallback.error;
                setDocuments((fallback.data || []) as DocumentRow[]);
            } else {
                if (result.error) throw result.error;
                setDocuments((result.data || []) as DocumentRow[]);
            }

            const [paymentRows, expenseResult] = await Promise.all([
                listPayments(supabase, { userId: user.id, companyIds }),
                supabase
                    .from('expenses')
                    .select('id,amount,category,description,date,type,created_at')
                    .or(scope)
                    .order('date', { ascending: false })
                    .limit(150),
            ]);
            if (expenseResult.error) throw expenseResult.error;
            setPayments((paymentRows || []) as Record<string, any>[]);
            setExpenses((expenseResult.data || []) as Record<string, any>[]);
        } catch (fetchError: any) {
            console.error('Commercial documents error:', fetchError);
            setError(t('unableToLoad', language));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [language, search, user]);

    useFocusEffect(useCallback(() => {
        void fetchDocuments();
        void fetchCustomers();
    }, [fetchCustomers, fetchDocuments]));

    const filteredDocuments = useMemo(() => documents.filter((document) => {
        const type = resolveCommercialDocumentType(document);
        const matchesCustomer = !selectedCustomer || document.client_id === selectedCustomer.id || document.client?.id === selectedCustomer.id;
        return matchesCustomer && (filter === 'ALL' || type === filter);
    }), [documents, filter, selectedCustomer]);

    const filteredPayments = useMemo(() => {
        const query = search.trim().toLocaleLowerCase(locale === 'sq' ? 'sq-XK' : 'en-US');
        return payments.filter((payment) => {
            const matchesCustomer = !selectedCustomer || payment.client_id === selectedCustomer.id || payment.client?.id === selectedCustomer.id;
            const searchable = [payment.payment_number, payment.client?.name, payment.invoice?.invoice_number, payment.bank_reference].filter(Boolean).join(' ').toLocaleLowerCase(locale === 'sq' ? 'sq-XK' : 'en-US');
            return matchesCustomer && (!query || searchable.includes(query));
        });
    }, [locale, payments, search, selectedCustomer]);

    const filteredExpenses = useMemo(() => {
        const query = search.trim().toLocaleLowerCase(locale === 'sq' ? 'sq-XK' : 'en-US');
        return expenses.filter((expense) => !query || [expense.description, expense.category].filter(Boolean).join(' ').toLocaleLowerCase(locale === 'sq' ? 'sq-XK' : 'en-US').includes(query));
    }, [expenses, locale, search]);

    const activeRows = filter === 'PAYMENTS' ? filteredPayments : filter === 'EXPENSES' ? filteredExpenses : filteredDocuments;

    const filteredCustomers = useMemo(() => {
        const query = customerSearch.trim().toLocaleLowerCase(language === 'sq' ? 'sq-XK' : 'en-US');
        return customers.filter((customer) => !query || [customer.name, customer.email, customer.phone].filter(Boolean).join(' ').toLocaleLowerCase(language === 'sq' ? 'sq-XK' : 'en-US').includes(query));
    }, [customerSearch, customers, language]);

    const createDocument = (type: CommercialDocumentType) => {
        const legacy = type === 'QUOTE' || type === 'SALES_ORDER' ? 'offer' : 'invoice';
        const subtype = type === 'QUOTE' ? 'offer'
            : type === 'PROFORMA' ? 'pro_invoice'
                : type === 'SALES_ORDER' ? 'order'
                    : type === 'DELIVERY_NOTE' ? 'delivery_note' : 'regular';
        navigation.navigate('InvoiceForm', { documentType: type, type: legacy, subtype });
    };

    const createForFilter = () => {
        if (filter === 'PAYMENTS') {
            navigation.navigate('PaymentForm');
            return;
        }
        if (filter === 'EXPENSES') {
            navigation.navigate('ExpenseForm', { type: 'expense' });
            return;
        }
        createDocument(filter === 'ALL' ? 'INVOICE' : filter);
    };

    const renderDocument = ({ item }: { item: DocumentRow }) => {
        const type = resolveCommercialDocumentType(item);
        const status = item.commercial_status || item.status;
        const typeColor = type === 'INVOICE' || type === 'FINAL_INVOICE' ? primaryColor : palette.muted;
        return (
            <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`${t('openDocument', language)} ${documentTypeLabel(type, locale)} ${item.invoice_number || ''}`}
                onPress={() => navigation.navigate('InvoiceDetail', { invoiceId: item.id })}
                style={[styles.documentCard, { backgroundColor: palette.surface, borderColor: palette.border }]}
            >
                <View style={styles.documentTopLine}>
                    <View style={[styles.documentIcon, { backgroundColor: `${typeColor}14` }]}>
                        <FileText color={typeColor} size={18} />
                    </View>
                    <View style={styles.documentCopy}>
                        <Text style={[styles.documentNumber, { color: palette.text }]}>{item.invoice_number || t('noNumber', language)}</Text>
                        <Text style={[styles.documentCustomer, { color: palette.muted }]} numberOfLines={1}>{item.client?.name || t('noClientAssigned', language)}</Text>
                    </View>
                    <View style={[styles.statusPill, { backgroundColor: `${primaryColor}12` }]}>
                        <Text style={[styles.statusText, { color: primaryColor }]}>{statusLabel(status, language)}</Text>
                    </View>
                </View>
                <View style={styles.documentBottomLine}>
                        <Text style={[styles.typeText, { color: typeColor }]}>{documentTypeLabel(type, locale)}</Text>
                    <Text style={[styles.documentMeta, { color: palette.muted }]}>{formatDate(item.issue_date, language)}</Text>
                    <Text style={[styles.documentAmount, { color: palette.text }]}>{formatCurrency(Number(item.total_amount || 0))}</Text>
                </View>
            </TouchableOpacity>
        );
    };

    const renderPayment = ({ item }: { item: Record<string, any> }) => (
        <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`${t('open', language)} ${item.payment_number || t('incomePayment', language)}`}
            onPress={() => navigation.navigate('PaymentForm', { paymentId: item.id })}
            style={[styles.documentCard, { backgroundColor: palette.surface, borderColor: palette.border }]}
        >
            <View style={styles.documentTopLine}>
                <View style={[styles.documentIcon, { backgroundColor: '#12B76A14' }]}>
                    <ArrowDownCircle color="#12B76A" size={18} />
                </View>
                <View style={styles.documentCopy}>
                    <Text style={[styles.documentNumber, { color: palette.text }]}>{item.payment_number || t('incomePayment', language)}</Text>
                    <Text style={[styles.documentCustomer, { color: palette.muted }]} numberOfLines={1}>{item.client?.name || t('noClientAssigned', language)}</Text>
                </View>
                <Text style={[styles.activityAmount, { color: '#12B76A' }]}>+{formatCurrency(Number(item.amount || 0))}</Text>
            </View>
            <View style={styles.documentBottomLine}>
                <Text style={[styles.typeText, { color: '#12B76A' }]}>{t('incomePayments', language)}</Text>
                <Text style={[styles.documentMeta, { color: palette.muted }]}>{formatDate(item.payment_date, language)}</Text>
                {item.invoice?.invoice_number ? <Text style={[styles.documentMeta, { color: palette.muted }]}>{item.invoice.invoice_number}</Text> : null}
            </View>
        </TouchableOpacity>
    );

    const renderExpense = ({ item }: { item: Record<string, any> }) => (
        <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={`${t('open', language)} ${item.description || t('expense', language)}`}
            onPress={() => navigation.navigate('ExpenseForm', { expenseId: item.id })}
            style={[styles.documentCard, { backgroundColor: palette.surface, borderColor: palette.border }]}
        >
            <View style={styles.documentTopLine}>
                <View style={[styles.documentIcon, { backgroundColor: '#EF444414' }]}>
                    <ArrowUpCircle color="#EF4444" size={18} />
                </View>
                <View style={styles.documentCopy}>
                    <Text style={[styles.documentNumber, { color: palette.text }]} numberOfLines={1}>{item.description || t('expense', language)}</Text>
                    <Text style={[styles.documentCustomer, { color: palette.muted }]} numberOfLines={1}>{item.category || t('expenses', language)}</Text>
                </View>
                <Text style={[styles.activityAmount, { color: '#EF4444' }]}>-{formatCurrency(Number(item.amount || 0))}</Text>
            </View>
            <View style={styles.documentBottomLine}>
                <Text style={[styles.typeText, { color: '#EF4444' }]}>{t('expenses', language)}</Text>
                <Text style={[styles.documentMeta, { color: palette.muted }]}>{formatDate(item.date, language)}</Text>
            </View>
        </TouchableOpacity>
    );

    const renderSalesItem = ({ item }: { item: Record<string, any> }) => {
        if (filter === 'PAYMENTS') return renderPayment({ item });
        if (filter === 'EXPENSES') return renderExpense({ item });
        return renderDocument({ item });
    };

    const activeListLabel = filter === 'PAYMENTS' ? t('incomePayments', language) : filter === 'EXPENSES' ? t('expenses', language) : t('sharedDocumentTrail', language);
    const activeEmptyTitle = filter === 'PAYMENTS' ? t('noPaymentsRecorded', language) : filter === 'EXPENSES' ? t('noExpensesYet', language) : t('noDocuments', language);
    const activeEmptyDescription = filter === 'PAYMENTS' ? t('noPaymentsRecordedYet', language) : filter === 'EXPENSES' ? t('noExpensesYet', language) : filter === 'ALL' ? t('createFirstSalesDocument', language) : t('noDocumentsOfType', language);
    const activeActionLabel = filter === 'PAYMENTS' ? t('newIncomePayment', language) : filter === 'EXPENSES' ? t('addExpense', language) : t('createDocument', language);

    return (
        <MobileScreen testID="sales-screen">
            <MobileHeader
                title={t('sales', language)}
                subtitle={t('commercialDocuments', language)}
                right={(
                    <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={t('searchDocumentsLabel', language)}
                        onPress={() => navigation.navigate('GlobalSearch')}
                        style={styles.headerSearchButton}
                        hitSlop={4}
                    >
                        <SearchIcon color={palette.text} size={22} strokeWidth={2.2} />
                    </TouchableOpacity>
                )}
            />
            <KeyboardAvoidingView style={styles.keyboardAvoidingView} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.body}>
                <TouchableOpacity
                    testID="sales-client-selector"
                    accessibilityRole="button"
                    accessibilityLabel={t('selectCustomer', language)}
                    accessibilityState={{ expanded: showCustomerPicker }}
                    onPress={() => setShowCustomerPicker(true)}
                    style={[styles.clientSelector, { backgroundColor: palette.surface, borderColor: palette.border }]}
                >
                    <View style={[styles.clientSelectorIcon, { backgroundColor: palette.iconSurface }]}>
                        <UserRound color={primaryColor} size={17} />
                    </View>
                    <View style={styles.clientSelectorCopy}>
                        <Text style={[styles.clientSelectorLabel, { color: palette.muted }]}>{t('customer', language)}</Text>
                        <Text style={[styles.clientSelectorName, { color: palette.text }]} numberOfLines={1}>{selectedCustomer?.name || t('allCustomers', language)}</Text>
                    </View>
                    <ChevronDown color={palette.muted} size={21} />
                </TouchableOpacity>

                <View style={styles.searchFieldWrap}>
                    <SearchField
                        testID="sales-search-input"
                        value={search}
                        onChangeText={setSearch}
                        placeholder={t('searchDocuments', language)}
                        rightAccessory={<TouchableOpacity testID="sales-barcode-scan-button" accessibilityRole="button" accessibilityLabel={t('scanInvoiceQr', language)} onPress={() => navigation.navigate('QRScanner', { mode: 'search', returnTo: 'Sales' })} style={styles.inlineScanButton}><QrCode color={primaryColor} size={20} /></TouchableOpacity>}
                    />
                </View>

                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    style={styles.filterScroller}
                    contentContainerStyle={styles.filterScrollerContent}
                >
                    {salesFilters.map((chip) => {
                        const selected = filter === chip.key;
                        return <TouchableOpacity key={chip.key} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => setFilter(chip.key)} style={[styles.filterChip, { backgroundColor: selected ? primaryColor : palette.surface, borderColor: selected ? primaryColor : palette.border }]}><Text style={[styles.filterText, { color: selected ? '#fff' : palette.muted }]}>{t(chip.labelKey, language)}</Text></TouchableOpacity>;
                    })}
                </ScrollView>

                <View style={styles.listHeading}><Text style={[styles.listHint, { color: palette.muted }]}>{activeListLabel}</Text><Text style={[styles.listHint, { color: palette.muted }]}>{activeRows.length}</Text></View>
                {loading ? <LoadingState label={`${t('loading', language)} ${t('documents', language).toLocaleLowerCase(language === 'sq' ? 'sq-XK' : 'en-US')}`} /> : error ? <ErrorState onRetry={() => void fetchDocuments()} message={error} /> : (
                    <FlatList
                        data={activeRows}
                        keyExtractor={(item, index) => `${item.id || index}`}
                        renderItem={renderSalesItem}
                        style={styles.documentList}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode="none"
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={activeRows.length ? styles.listContent : styles.emptyListContent}
                        refreshControl={<RefreshControl testID="sales-refresh-control" refreshing={refreshing} onRefresh={() => { setRefreshing(true); void fetchDocuments(); }} tintColor={primaryColor} />}
                        ListEmptyComponent={<EmptyState title={activeEmptyTitle} description={activeEmptyDescription} actionLabel={activeActionLabel} onAction={createForFilter} icon={filter === 'PAYMENTS' ? ArrowDownCircle : filter === 'EXPENSES' ? ArrowUpCircle : FileText} />}
                        ListFooterComponent={<View style={{ height: 24 }} />}
                    />
                )}
            </View>
            </KeyboardAvoidingView>
            <Modal visible={showCustomerPicker} transparent animationType="slide" onRequestClose={() => setShowCustomerPicker(false)}>
                <View style={[styles.clientModalOverlay, { backgroundColor: isDark ? 'rgba(0,0,0,0.78)' : 'rgba(0,0,0,0.5)' }]}>
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('close', language)} onPress={() => setShowCustomerPicker(false)} style={StyleSheet.absoluteFill} />
                    <View style={[styles.clientModalSheet, { backgroundColor: palette.surface }]}>
                        <View style={[styles.clientModalHeader, { borderBottomColor: palette.border }]}>
                            <Text style={[styles.clientModalTitle, { color: palette.text }]}>{t('selectCustomer', language)}</Text>
                            <TouchableOpacity testID="sales-close-client-picker-button" accessibilityRole="button" accessibilityLabel={t('close', language)} onPress={() => setShowCustomerPicker(false)} style={styles.clientModalClose}>
                                <X color={palette.text} size={20} />
                            </TouchableOpacity>
                        </View>
                        <View style={styles.clientModalSearch}>
                            <SearchField testID="sales-client-search-input" value={customerSearch} onChangeText={setCustomerSearch} placeholder={t('searchCustomers', language)} autoFocus />
                        </View>
                        <ScrollView contentContainerStyle={styles.clientOptions} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                            <TouchableOpacity
                                testID="sales-all-customers-option"
                                accessibilityRole="radio"
                                accessibilityState={{ selected: !selectedCustomer }}
                                onPress={() => { setSelectedCustomer(null); setCustomerSearch(''); setShowCustomerPicker(false); }}
                                style={[styles.clientOption, { borderBottomColor: palette.border }]}
                            >
                                <View style={[styles.clientOptionIcon, { backgroundColor: palette.iconSurface }]}><UserRound color={primaryColor} size={18} /></View>
                                <View style={styles.clientOptionCopy}><Text style={[styles.clientOptionName, { color: palette.text }]}>{t('allCustomers', language)}</Text><Text style={[styles.clientOptionMeta, { color: palette.muted }]}>{t('allDocuments', language)}</Text></View>
                                {!selectedCustomer ? <Check color={primaryColor} size={20} /> : null}
                            </TouchableOpacity>
                            {filteredCustomers.map((customer) => (
                                <TouchableOpacity
                                    testID={`sales-client-option-${customer.id}`}
                                    accessibilityRole="radio"
                                    accessibilityState={{ selected: selectedCustomer?.id === customer.id }}
                                    key={customer.id}
                                    onPress={() => { setSelectedCustomer(customer); setCustomerSearch(''); setShowCustomerPicker(false); }}
                                    style={[styles.clientOption, { borderBottomColor: palette.border }]}
                                >
                                    <View style={[styles.clientOptionIcon, { backgroundColor: palette.iconSurface }]}><Text style={[styles.clientInitial, { color: primaryColor }]}>{String(customer.name || '?').charAt(0).toUpperCase()}</Text></View>
                                    <View style={styles.clientOptionCopy}><Text style={[styles.clientOptionName, { color: palette.text }]} numberOfLines={1}>{customer.name}</Text><Text style={[styles.clientOptionMeta, { color: palette.muted }]} numberOfLines={1}>{customer.email || customer.phone || t('noContactDetails', language)}</Text></View>
                                    {selectedCustomer?.id === customer.id ? <Check color={primaryColor} size={20} /> : null}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
            <GlobalCreateButton />
        </MobileScreen>
    );
}

const styles = StyleSheet.create({
    keyboardAvoidingView: { flex: 1 },
    body: { flex: 1, minHeight: 0, paddingHorizontal: 20 },
    headerSearchButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    clientSelector: { minHeight: 58, borderWidth: 1, borderRadius: 16, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 10, marginBottom: 10 },
    clientSelectorIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    clientSelectorCopy: { flex: 1, minWidth: 0 },
    clientSelectorLabel: { fontSize: 10, fontFamily: brand.fonts.medium },
    clientSelectorName: { fontSize: 13, fontFamily: brand.fonts.semibold, marginTop: 3 },
    filterScroller: { height: 52, flexGrow: 0, marginTop: 8, marginBottom: 18 },
    filterScrollerContent: { gap: 7, paddingVertical: 8, paddingRight: 24, alignItems: 'center' },
    filterChip: { height: 36, minHeight: 36, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, justifyContent: 'center' },
    filterText: { fontSize: 11, fontFamily: brand.fonts.medium },
    searchFieldWrap: { marginTop: 0, marginBottom: 0 },
    inlineScanButton: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    listHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 9, marginBottom: 12 },
    listHint: { fontSize: 11, lineHeight: 16, fontFamily: brand.fonts.medium },
    documentList: { flex: 1, minHeight: 0 },
    listContent: { paddingTop: 10, paddingBottom: 84 },
    emptyListContent: { flexGrow: 1, paddingBottom: 84 },
    documentCard: { minHeight: 116, borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 12 },
    documentTopLine: { flexDirection: 'row', alignItems: 'center', gap: 11 },
    documentIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    documentCopy: { flex: 1 },
    documentNumber: { fontSize: 15, lineHeight: 20, fontFamily: brand.fonts.semibold },
    documentCustomer: { fontSize: 12, lineHeight: 17, fontFamily: brand.fonts.regular, marginTop: 2 },
    activityAmount: { fontSize: 15, lineHeight: 20, fontFamily: brand.fonts.semibold, marginLeft: 8 },
    statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, maxWidth: 110 },
    statusText: { fontSize: 10, fontFamily: brand.fonts.semibold, textAlign: 'center' },
    documentBottomLine: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(148,163,184,0.16)' },
    typeText: { flex: 1, fontSize: 12, lineHeight: 17, fontFamily: brand.fonts.semibold },
    documentMeta: { fontSize: 11, lineHeight: 16, fontFamily: brand.fonts.regular },
    documentAmount: { fontSize: 14, lineHeight: 19, fontFamily: brand.fonts.semibold, marginLeft: 4 },
    clientModalOverlay: { flex: 1, justifyContent: 'flex-end' },
    clientModalSheet: { maxHeight: '86%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 24 },
    clientModalHeader: { minHeight: 62, paddingHorizontal: 20, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    clientModalTitle: { fontSize: 19, fontFamily: brand.fonts.semibold },
    clientModalClose: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    clientModalSearch: { paddingHorizontal: 20, paddingTop: 14 },
    clientOptions: { paddingHorizontal: 20, paddingBottom: 24 },
    clientOption: { minHeight: 64, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
    clientOptionIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    clientInitial: { fontSize: 16, fontFamily: brand.fonts.semibold },
    clientOptionCopy: { flex: 1, minWidth: 0 },
    clientOptionName: { fontSize: 14, fontFamily: brand.fonts.semibold },
    clientOptionMeta: { fontSize: 11, fontFamily: brand.fonts.regular, marginTop: 3 },
});
