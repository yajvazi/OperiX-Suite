import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ArrowLeft, Banknote, Building2, FileText, Package, QrCode, Search as SearchIcon, UserRound } from 'lucide-react-native';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { formatCurrency, getLocalizedErrorMessage, t } from '@invoice-monorepo/i18n';
import { supabase } from '@invoice-monorepo/api';
import { brand, getPalette } from '../../theme/brand';
import { getActiveProductCompanyIds, getWorkspaceScope, scopedResource, scopedSearch } from '../../services/workspace';
import type { RootStackParamList } from '../../navigation/types';
import { EmptyState, ErrorState, MobileScreen, MobileStatusBadge, SearchField } from '../../components/mobile/MobileUI';

type ResultGroup = { key: 'invoices' | 'customers' | 'products' | 'payments' | 'vendors'; title: string; icon: React.ComponentType<{ color?: string; size?: number }>; items: Array<Record<string, any>> };

function cleanQuery(value: string) {
    // Keep the value safe for the existing PostgREST filter strings. Hyphens,
    // email characters, Unicode letters, and numbers remain searchable; filter
    // delimiters and wildcard characters are never passed through.
    return value.replace(/[^\p{L}\p{N}@_\s-]/gu, ' ').trim().slice(0, 80);
}

export function GlobalSearchScreen() {
    const { user } = useAuth();
    const { isDark, language } = useTheme();
    const palette = getPalette(isDark);
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const route = useRoute<any>();
    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [groups, setGroups] = useState<ResultGroup[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        const scannedSearch = route.params?.scannedSearch as string | undefined;
        if (!scannedSearch) return;
        setQuery(scannedSearch);
        navigation.setParams({ scannedSearch: undefined });
    }, [navigation, route.params?.scannedSearch]);

    useEffect(() => {
        const timeout = setTimeout(() => setDebouncedQuery(cleanQuery(query)), 280);
        return () => clearTimeout(timeout);
    }, [query]);

    useEffect(() => {
        let active = true;
        const search = async () => {
            if (!user || debouncedQuery.length < 2) {
                setGroups([]);
                setLoading(false);
                return;
            }
            setLoading(true);
            setError(null);
            try {
                const workspaceScope = await getWorkspaceScope(user.id);
                const { companyIds } = workspaceScope;
                const scope = scopedResource(user.id, companyIds);
                const productScope = scopedResource(user.id, getActiveProductCompanyIds(workspaceScope));
                const pattern = `%${debouncedQuery}%`;
                const [invoiceResult, customerResult, productResult, paymentResult, vendorResult] = await Promise.all([
                    supabase.from('invoices').select('id,invoice_number,total_amount,status,issue_date,client:clients(name)').or(scopedSearch(scope, ['invoice_number', 'notes'], pattern)).order('created_at', { ascending: false }).limit(8),
                    supabase.from('clients').select('id,name,email,phone').or(scopedSearch(scope, ['name', 'email', 'phone'], pattern)).order('name').limit(8),
                    supabase.from('products').select('id,name,unit_price,category,sku,barcode').or(scopedSearch(productScope, ['name', 'sku', 'barcode'], pattern)).order('name').limit(8),
                    supabase.from('payments').select('id,payment_number,amount,payment_date,payment_method,client:clients(name)').or(scopedSearch(scope, ['payment_number'], pattern)).order('payment_date', { ascending: false }).limit(8),
                    supabase.from('vendors').select('id,name,email,phone').or(scopedSearch(scope, ['name', 'email', 'phone'], pattern)).order('name').limit(8),
                ]);
                if (invoiceResult.error) throw invoiceResult.error;
                if (customerResult.error) throw customerResult.error;
                if (productResult.error) throw productResult.error;
                if (paymentResult.error) throw paymentResult.error;
                if (vendorResult.error) throw vendorResult.error;
                if (!active) return;
                setGroups(([
                    { key: 'invoices', title: t('invoices', language), icon: FileText, items: (invoiceResult.data || []) as Array<Record<string, any>> },
                    { key: 'customers', title: t('clients', language), icon: UserRound, items: (customerResult.data || []) as Array<Record<string, any>> },
                    { key: 'products', title: t('products', language), icon: Package, items: (productResult.data || []) as Array<Record<string, any>> },
                    { key: 'payments', title: t('payments', language), icon: Banknote, items: (paymentResult.data || []) as Array<Record<string, any>> },
                    { key: 'vendors', title: t('vendors', language), icon: Building2, items: (vendorResult.data || []) as Array<Record<string, any>> },
                ] as ResultGroup[]).filter((group) => group.items.length));
            } catch (searchError: any) {
                console.error('Global search error:', searchError);
                if (active) setError(getLocalizedErrorMessage(searchError, language, 'searchUnavailable'));
            } finally {
                if (active) setLoading(false);
            }
        };
        void search();
        return () => { active = false; };
    }, [debouncedQuery, user, language]);

    const resultCount = useMemo(() => groups.reduce((sum, group) => sum + group.items.length, 0), [groups]);

    const openResult = (group: ResultGroup['key'], item: Record<string, any>) => {
        if (group === 'invoices') navigation.navigate('InvoiceDetail', { invoiceId: item.id });
        else if (group === 'customers') navigation.navigate('CustomerDetail', { clientId: item.id });
        else if (group === 'products') navigation.navigate('ProductDetail', { productId: item.id });
        else if (group === 'payments') navigation.navigate('PaymentForm', { paymentId: item.id });
        else navigation.navigate('VendorForm', { vendorId: item.id });
    };

    const renderGroup = ({ item: group }: { item: ResultGroup }) => {
        const Icon = group.icon;
        return <View style={styles.group}><View style={styles.groupHeader}><Text style={[styles.groupTitle, { color: palette.text }]}>{group.title}</Text><Text style={[styles.groupCount, { color: palette.muted }]}>{group.items.length}</Text></View>{group.items.map((result) => <TouchableOpacity key={result.id} accessibilityRole="button" onPress={() => openResult(group.key, result)} style={[styles.resultRow, { backgroundColor: palette.surface, borderColor: palette.border }]}><View style={[styles.resultIcon, { backgroundColor: palette.iconSurface }]}><Icon color={brand.colors.primary} size={18} /></View><View style={styles.resultCopy}><Text style={[styles.resultTitle, { color: palette.text }]} numberOfLines={1}>{result.invoice_number || result.payment_number || result.name || t('untitled', language)}</Text><Text style={[styles.resultMeta, { color: palette.muted }]} numberOfLines={1}>{result.client?.name || result.email || result.category || result.issue_date || result.payment_date || t('openDetail', language)}</Text></View>{group.key === 'invoices' ? <View style={styles.resultRight}><MobileStatusBadge status={result.status} /><Text style={[styles.resultAmount, { color: palette.text }]}>{formatCurrency(Number(result.total_amount || 0))}</Text></View> : group.key === 'products' ? <Text style={[styles.resultAmount, { color: palette.text }]}>{formatCurrency(Number(result.unit_price || 0))}</Text> : group.key === 'payments' ? <Text style={[styles.resultAmount, { color: brand.colors.success }]}>+{formatCurrency(Number(result.amount || 0))}</Text> : null}</TouchableOpacity>)}</View>;
    };

    return (
        <MobileScreen testID="global-search-screen">
            <View style={styles.header}><TouchableOpacity accessibilityRole="button" accessibilityLabel={t('closeSearch', language)} onPress={() => navigation.goBack()} style={styles.backButton}><ArrowLeft color={palette.text} size={21} /></TouchableOpacity><Text style={[styles.title, { color: palette.text }]}>{t('searchTitle', language)}</Text><View style={styles.headerSpacer} /></View>
            <View style={styles.body}><SearchField testID="global-search-input" value={query} onChangeText={setQuery} placeholder={t('invoicesCustomersProducts', language)} autoFocus rightAccessory={<TouchableOpacity testID="global-barcode-scan-button" accessibilityRole="button" accessibilityLabel={t('scanBarcode', language)} onPress={() => navigation.navigate('QRScanner', { mode: 'search', returnTo: 'GlobalSearch' })} style={styles.inlineScanButton}><QrCode color={brand.colors.primary} size={20} /></TouchableOpacity>} />{loading ? <View style={styles.searching}><ActivityIndicator color={brand.colors.primary} /><Text style={[styles.searchingText, { color: palette.muted }]}>{t('searchingWorkspace', language)}</Text></View> : error ? <ErrorState onRetry={() => setDebouncedQuery(cleanQuery(query))} message={error} /> : query.trim().length < 2 ? <EmptyState title={t('searchBusiness', language)} description={t('searchBusinessDescription', language)} icon={SearchIcon} /> : resultCount === 0 ? <EmptyState title={t('searchResults', language)} description={t('searchResultsDescription', language)} icon={SearchIcon} /> : <FlatList data={groups} keyExtractor={(group) => group.key} renderItem={renderGroup} showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContent} />}</View>
        </MobileScreen>
    );
}

const styles = StyleSheet.create({
    header: { minHeight: 64, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center' },
    backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
    title: { flex: 1, fontSize: 24, fontFamily: brand.fonts.semibold },
    headerSpacer: { width: 44 },
    body: { flex: 1, paddingHorizontal: 20 },
    inlineScanButton: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    searching: { minHeight: 190, alignItems: 'center', justifyContent: 'center', gap: 10 },
    searchingText: { fontSize: 13, fontFamily: brand.fonts.regular },
    listContent: { paddingTop: 19, paddingBottom: 30 },
    group: { marginBottom: 20 },
    groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 },
    groupTitle: { fontSize: 16, fontFamily: brand.fonts.semibold },
    groupCount: { fontSize: 12, fontFamily: brand.fonts.medium },
    resultRow: { minHeight: 66, borderRadius: 16, borderWidth: 1, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    resultIcon: { width: 37, height: 37, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    resultCopy: { flex: 1 },
    resultTitle: { fontSize: 13, fontFamily: brand.fonts.semibold },
    resultMeta: { fontSize: 11, fontFamily: brand.fonts.regular, marginTop: 3 },
    resultRight: { alignItems: 'flex-end', gap: 5 },
    resultAmount: { fontSize: 12, fontFamily: brand.fonts.semibold },
});
