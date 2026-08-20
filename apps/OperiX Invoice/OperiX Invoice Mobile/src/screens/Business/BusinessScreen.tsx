import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    FlatList,
    Image,
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
import { AlertTriangle, Banknote, Box, Building2, Check, ChevronDown, ChevronRight, CircleDollarSign, Package, Plus, QrCode, Receipt, Search, Tag, Truck, WalletCards, X } from 'lucide-react-native';
import { SvgXml } from 'react-native-svg';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { formatCurrency, t, type TranslationKey } from '@invoice-monorepo/i18n';
import { serviceIconNameFromValue, serviceIconSvg } from '@invoice-monorepo/invoice-template';
import { supabase } from '@invoice-monorepo/api';
import { brand, getPalette } from '../../theme/brand';
import { getActiveTenantCompanyIds, getWorkspaceScope, scopedResource } from '../../services/workspace';
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

type BusinessSection = 'products' | 'inventory' | 'expenses' | 'vendors' | 'income';
type BusinessItem = Record<string, any>;

const sections: Array<{ key: BusinessSection; labelKey: TranslationKey; icon: React.ComponentType<{ color?: string; size?: number }> }> = [
    { key: 'products', labelKey: 'products', icon: Package },
    { key: 'inventory', labelKey: 'inventory', icon: Box },
    { key: 'expenses', labelKey: 'expenses', icon: WalletCards },
    { key: 'vendors', labelKey: 'vendors', icon: Truck },
    { key: 'income', labelKey: 'incomePayment', icon: CircleDollarSign },
];

export function BusinessScreen() {
    const { user } = useAuth();
    const { isDark, primaryColor, language } = useTheme();
    const palette = getPalette(isDark);
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const route = useRoute<any>();
    const [section, setSection] = useState<BusinessSection>('products');
    const [categoryFilter, setCategoryFilter] = useState('ALL');
    const [showSectionPicker, setShowSectionPicker] = useState(false);
    const [items, setItems] = useState<BusinessItem[]>([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        const businessSearch = route.params?.businessSearch as string | undefined;
        if (!businessSearch) return;
        setSearch(businessSearch);
        navigation.setParams({ businessSearch: undefined });
    }, [navigation, route.params?.businessSearch]);

    const fetchItems = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        setError(null);
        try {
            const workspaceScope = await getWorkspaceScope(user.id);
            const companyIds = getActiveTenantCompanyIds(workspaceScope);
            const scope = scopedResource(user.id, companyIds);
            let result;
            if (section === 'vendors') {
                result = await supabase.from('vendors').select('id,name,email,phone,city,created_at').or(scope).order('name').limit(80);
            } else if (section === 'expenses' || section === 'income') {
                result = await supabase.from('expenses').select('id,amount,category,description,date,type,vendor_name,invoice_number,created_at').or(scope).eq('type', section === 'income' ? 'income' : 'expense').order('date', { ascending: false }).limit(80);
            } else {
                result = await supabase.from('products').select('id,name,image_url,unit_price,tax_rate,category,sku,barcode,stock_quantity,track_stock,low_stock_threshold,unit,created_at').or(scope).order('name').limit(80);
            }
            if (result.error) throw result.error;
            setItems((result.data || []) as BusinessItem[]);
        } catch (fetchError: any) {
            console.error('Business data error:', fetchError);
            setError(t('unableToLoad', language));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [language, section, user]);

    useFocusEffect(useCallback(() => { void fetchItems(); }, [fetchItems]));

    const filteredItems = useMemo(() => {
        const query = search.trim().toLowerCase();
        return items.filter((item) => {
            if (section === 'inventory' && !item.track_stock) return false;
            const itemCategory = section === 'vendors' ? item.city : item.category;
            if (categoryFilter !== 'ALL' && itemCategory !== categoryFilter) return false;
            if (!query) return true;
            return [item.name, item.category, item.sku, item.barcode, item.description, item.vendor?.name, item.email].filter(Boolean).join(' ').toLowerCase().includes(query);
        });
    }, [categoryFilter, items, search, section]);

    const openCreate = () => {
        if (section === 'income') return;
        if (section === 'products' || section === 'inventory') navigation.navigate('ProductForm');
        else if (section === 'vendors') navigation.navigate('VendorForm');
        else navigation.navigate('ExpenseForm', { type: 'expense' });
    };

    const renderProduct = (item: BusinessItem) => {
        const lowStock = item.track_stock && Number(item.stock_quantity || 0) <= Number(item.low_stock_threshold || 5);
        return (
            <TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate('ProductDetail', { productId: item.id })} style={[styles.productCard, { backgroundColor: palette.surface, borderColor: palette.border }]}> 
                <View style={styles.productTopLine}>
                    <View style={[styles.productIconTile, { backgroundColor: palette.iconSurface }]}>{serviceIconNameFromValue(item.image_url) ? <SvgXml xml={serviceIconSvg(serviceIconNameFromValue(item.image_url)!, brand.colors.primary)} width="28" height="28" /> : item.image_url ? <Image source={{ uri: item.image_url }} style={styles.productIconImage} resizeMode="cover" /> : <Package color={brand.colors.primary} size={24} />}</View>
                    <View style={styles.productCopy}>
                        <Text style={[styles.productName, { color: palette.text }]} numberOfLines={1}>{item.name}</Text>
                        <Text style={[styles.productCategory, { color: palette.muted }]} numberOfLines={1}>{item.category || t('products', language)}</Text>
                    </View>
                    <View style={[styles.productAddCircle, { backgroundColor: primaryColor }]}><Plus color="#fff" size={20} /></View>
                </View>
                <View style={styles.productDivider} />
                <View style={styles.productBottomLine}>
                    <Text style={[styles.productBottomCategory, { color: primaryColor }]} numberOfLines={1}>{item.category || t('products', language)}</Text>
                    <Text style={[styles.productStock, { color: lowStock ? brand.colors.warning : palette.muted }]} numberOfLines={1}>{item.track_stock ? `${Number(item.stock_quantity || 0)} ${item.unit || 'pcs'}` : t('stockNotTracked', language)}</Text>
                    <Text style={[styles.productPrice, { color: palette.text }]}>{formatCurrency(Number(item.unit_price || 0))}</Text>
                </View>
            </TouchableOpacity>
        );
    };

    const renderExpense = (item: BusinessItem) => (
        <TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate('ExpenseForm', { expenseId: item.id })} style={[styles.listCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <View style={styles.rowTop}><View style={[styles.iconBox, { backgroundColor: section === 'income' ? '#E9F9F0' : '#FFF6D9' }]}>{section === 'income' ? <Banknote color={brand.colors.success} size={18} /> : <Receipt color={brand.colors.warning} size={18} />}</View><View style={styles.copy}><Text style={[styles.primary, { color: palette.text }]}>{item.category || t('other', language)}</Text><Text style={[styles.secondary, { color: palette.muted }]} numberOfLines={1}>{item.description || t('noDescription', language)}</Text>{(item.vendor_name || item.invoice_number) ? <Text style={[styles.secondary, { color: palette.muted }]} numberOfLines={1}>{[item.vendor_name, item.invoice_number].filter(Boolean).join(' • ')}</Text> : null}</View><Text style={[styles.amount, { color: section === 'income' ? brand.colors.success : palette.text }]}>{section === 'income' ? '+' : '-'}{formatCurrency(Number(item.amount || 0))}</Text></View><View style={styles.rowBottom}><Text style={[styles.secondary, { color: palette.muted }]}>{item.date || '—'}</Text></View>
        </TouchableOpacity>
    );

    const renderVendor = (item: BusinessItem) => (
        <TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate('VendorForm', { vendorId: item.id })} style={[styles.listCard, { backgroundColor: palette.surface, borderColor: palette.border }]}><View style={styles.rowTop}><View style={[styles.iconBox, { backgroundColor: '#EAF2FF' }]}><Building2 color={brand.colors.primary} size={18} /></View><View style={styles.copy}><Text style={[styles.primary, { color: palette.text }]}>{item.name}</Text><Text style={[styles.secondary, { color: palette.muted }]} numberOfLines={1}>{item.email || item.phone || item.city || t('noContactDetailsYet', language)}</Text></View><ChevronRight color={palette.muted} size={18} /></View></TouchableOpacity>
    );

    const renderItem = ({ item }: { item: BusinessItem }) => section === 'vendors' ? renderVendor(item) : section === 'expenses' || section === 'income' ? renderExpense(item) : renderProduct(item);
    const productSection = section === 'products' || section === 'inventory';
    const selectedSection = sections.find((item) => item.key === section) || sections[0];
    const SelectedSectionIcon = selectedSection.icon;
    const categoryFilters = useMemo(() => {
        const values = items
            .map((item) => section === 'vendors' ? item.city : item.category)
            .filter((value): value is string => Boolean(value));
        return ['ALL', ...Array.from(new Set(values))];
    }, [items, section]);
    const sectionLabel = t(selectedSection.labelKey, language);
    const emptyDescription = section === 'inventory' ? t('noInventoryProducts', language) : undefined;
    const searchPlaceholder = `${t('search', language)} ${sectionLabel.toLocaleLowerCase(language === 'sq' ? 'sq-XK' : 'en-US')}`;
    const sectionLoading = t('loadingSection', language).replace('{section}', sectionLabel.toLocaleLowerCase(language === 'sq' ? 'sq-XK' : 'en-US'));
    const emptyTitle = search ? t('noMatches', language) : t('noSectionYet', language).replace('{section}', sectionLabel.toLocaleLowerCase(language === 'sq' ? 'sq-XK' : 'en-US'));
    const emptyAction = !search && section !== 'income' ? t('addSection', language).replace('{section}', sectionLabel.toLocaleLowerCase(language === 'sq' ? 'sq-XK' : 'en-US')) : undefined;

    return (
        <MobileScreen testID="business-screen">
            <MobileHeader
                title={t('business', language)}
                subtitle={t('keepOperationsMoving', language)}
                right={(
                    <TouchableOpacity
                        testID="business-open-products-button"
                        accessibilityRole="button"
                        accessibilityLabel={t('openFullProductList', language)}
                        onPress={() => navigation.navigate('ProductsList')}
                        style={styles.headerSearchButton}
                        hitSlop={4}
                    >
                        <Search color={palette.text} size={22} strokeWidth={2.2} />
                    </TouchableOpacity>
                )}
            />
            <KeyboardAvoidingView style={styles.keyboardAvoidingView} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={styles.body}>
                <TouchableOpacity
                    testID="business-section-selector"
                    accessibilityRole="button"
                    accessibilityLabel={t('business', language)}
                    accessibilityState={{ expanded: showSectionPicker }}
                    onPress={() => setShowSectionPicker(true)}
                    style={[styles.sectionSelector, { backgroundColor: palette.surface, borderColor: palette.border }]}
                >
                    <View style={[styles.sectionSelectorIcon, { backgroundColor: palette.iconSurface }]}><SelectedSectionIcon color={primaryColor} size={18} /></View>
                    <View style={styles.sectionSelectorCopy}><Text style={[styles.sectionSelectorLabel, { color: palette.muted }]}>{t('business', language)}</Text><Text style={[styles.sectionSelectorName, { color: palette.text }]}>{sectionLabel}</Text></View>
                    <ChevronDown color={palette.muted} size={20} />
                </TouchableOpacity>
                <SearchField
                    testID="business-search-input"
                    value={search}
                    onChangeText={setSearch}
                    placeholder={searchPlaceholder}
                    rightAccessory={<TouchableOpacity testID="business-barcode-scan-button" accessibilityRole="button" accessibilityLabel={t('scanBarcode', language)} onPress={() => navigation.navigate('QRScanner', { mode: 'search', returnTo: 'Business' })} style={styles.inlineScanButton}><QrCode color={primaryColor} size={20} /></TouchableOpacity>}
                />
                <ScrollView horizontal style={styles.categoryScroll} showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.categoryScroller}>
                    {categoryFilters.map((value) => {
                        const selected = categoryFilter === value;
                        return <TouchableOpacity key={value} testID={`business-category-${value.toLowerCase()}`} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => setCategoryFilter(value)} style={[styles.categoryChip, { backgroundColor: selected ? primaryColor : palette.surface, borderColor: selected ? primaryColor : palette.border }]}><Text style={[styles.categoryText, { color: selected ? '#fff' : palette.muted }]} numberOfLines={1}>{value === 'ALL' ? t('viewAll', language) : value}</Text></TouchableOpacity>;
                    })}
                </ScrollView>
                <View style={styles.listHeading}><Text style={[styles.listHint, { color: palette.muted }]}>{productSection ? t('allProducts', language) : sectionLabel}</Text><Text style={[styles.listHint, { color: palette.muted }]}>{filteredItems.length}</Text></View>
                {loading ? <LoadingState label={sectionLoading} /> : error ? <ErrorState onRetry={() => void fetchItems()} message={error} /> : <FlatList key="business-list" data={filteredItems} keyExtractor={(item) => item.id} renderItem={renderItem} numColumns={1} keyboardShouldPersistTaps="handled" keyboardDismissMode="none" showsVerticalScrollIndicator={false} contentContainerStyle={filteredItems.length ? styles.listContent : styles.emptyContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void fetchItems(); }} tintColor={primaryColor} />} ListEmptyComponent={<EmptyState title={emptyTitle} description={search ? t('tryAnotherSearch', language) : emptyDescription} actionLabel={emptyAction} onAction={!search ? openCreate : undefined} icon={section === 'vendors' ? Truck : section === 'expenses' ? WalletCards : section === 'inventory' ? Box : Package} />} ListFooterComponent={<View style={{ height: 100 }} />} />}
            </View>
            </KeyboardAvoidingView>
            <Modal visible={showSectionPicker} transparent animationType="slide" onRequestClose={() => setShowSectionPicker(false)}>
                <View style={[styles.sectionModalOverlay, { backgroundColor: isDark ? 'rgba(0,0,0,0.78)' : 'rgba(0,0,0,0.5)' }]}>
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('close', language)} onPress={() => setShowSectionPicker(false)} style={StyleSheet.absoluteFill} />
                    <View style={[styles.sectionModalSheet, { backgroundColor: palette.surface }]}>
                        <View style={[styles.sectionModalHeader, { borderBottomColor: palette.border }]}><Text style={[styles.sectionModalTitle, { color: palette.text }]}>{t('business', language)}</Text><TouchableOpacity testID="business-close-section-picker-button" accessibilityRole="button" accessibilityLabel={t('close', language)} onPress={() => setShowSectionPicker(false)} style={styles.sectionModalClose}><X color={palette.text} size={20} /></TouchableOpacity></View>
                        <ScrollView contentContainerStyle={styles.sectionOptions} keyboardShouldPersistTaps="handled">
                            {sections.map((item) => {
                                const Icon = item.icon;
                                const selected = section === item.key;
                                return <TouchableOpacity testID={`business-section-${item.key}`} key={item.key} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => { setSection(item.key); setCategoryFilter('ALL'); setSearch(''); setShowSectionPicker(false); }} style={[styles.sectionOption, { borderBottomColor: palette.border }]}><View style={[styles.sectionOptionIcon, { backgroundColor: palette.iconSurface }]}><Icon color={primaryColor} size={18} /></View><Text style={[styles.sectionOptionName, { color: palette.text }]}>{t(item.labelKey, language)}</Text>{selected ? <Check color={primaryColor} size={20} /> : null}</TouchableOpacity>;
                            })}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
            <GlobalCreateButton />
        </MobileScreen>
    );
}

const styles = StyleSheet.create({
    headerSearchButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    inlineScanButton: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    keyboardAvoidingView: { flex: 1 },
    body: { flex: 1, minHeight: 0, paddingHorizontal: 20 },
    sectionSelector: { minHeight: 58, borderWidth: 1, borderRadius: 16, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 10, marginBottom: 10 },
    sectionSelectorIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    sectionSelectorCopy: { flex: 1, minWidth: 0 },
    sectionSelectorLabel: { fontSize: 10, fontFamily: brand.fonts.medium },
    sectionSelectorName: { fontSize: 13, fontFamily: brand.fonts.semibold, marginTop: 3 },
    categoryScroll: { height: 52, flexGrow: 0, marginTop: 8, marginBottom: 18 },
    categoryScroller: { gap: 7, paddingVertical: 8, paddingRight: 20, alignItems: 'center' },
    listHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 0, marginBottom: 12 },
    listHint: { fontSize: 11, lineHeight: 16, fontFamily: brand.fonts.medium },
    categoryChip: { height: 36, minHeight: 36, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, justifyContent: 'center' },
    categoryText: { fontSize: 11, fontFamily: brand.fonts.medium },
    listContent: { paddingBottom: 20 },
    emptyContent: { flexGrow: 1 },
    productCard: { width: '100%', minHeight: 116, borderWidth: 1, borderRadius: 18, padding: 16, marginBottom: 12 },
    productTopLine: { flexDirection: 'row', alignItems: 'center', gap: 11 },
    productIconTile: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    productIconImage: { width: '100%', height: '100%' },
    productCopy: { flex: 1, minWidth: 0 },
    productName: { fontSize: 15, lineHeight: 20, fontFamily: brand.fonts.semibold },
    productCategory: { fontSize: 12, lineHeight: 17, fontFamily: brand.fonts.regular, marginTop: 2 },
    productAddCircle: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
    productDivider: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(148,163,184,0.16)' },
    productBottomLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    productBottomCategory: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: brand.fonts.semibold },
    productPrice: { fontSize: 16, lineHeight: 21, fontFamily: brand.fonts.semibold },
    productStock: { maxWidth: '42%', fontSize: 11, lineHeight: 16, fontFamily: brand.fonts.regular },
    listCard: { borderWidth: 1, borderRadius: 17, padding: 14, marginBottom: 9 },
    rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(148,163,184,0.16)' },
    iconBox: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    copy: { flex: 1 },
    primary: { fontSize: 14, fontFamily: brand.fonts.semibold },
    secondary: { fontSize: 11, fontFamily: brand.fonts.regular, marginTop: 3 },
    amount: { fontSize: 13, fontFamily: brand.fonts.semibold, marginLeft: 6 },
    alertInline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    sectionModalOverlay: { flex: 1, justifyContent: 'flex-end' },
    sectionModalSheet: { maxHeight: '72%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 24 },
    sectionModalHeader: { minHeight: 62, paddingHorizontal: 20, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionModalTitle: { fontSize: 19, fontFamily: brand.fonts.semibold },
    sectionModalClose: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    sectionOptions: { paddingHorizontal: 20, paddingBottom: 20 },
    sectionOption: { minHeight: 60, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
    sectionOptionIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    sectionOptionName: { flex: 1, fontSize: 14, fontFamily: brand.fonts.semibold },
});
