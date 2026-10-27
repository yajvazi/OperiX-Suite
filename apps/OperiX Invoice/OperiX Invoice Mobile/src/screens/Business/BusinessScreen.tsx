import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AlertTriangle, ArrowRightLeft, Banknote, Box, Building2, Check, ChevronDown, ChevronRight, CircleDollarSign, Package, Plus, QrCode, Receipt, Search, Tag, Truck, WalletCards, X } from 'lucide-react-native';
import { SvgXml } from 'react-native-svg';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { formatCurrency, t, type TranslationKey } from '@invoice-monorepo/i18n';
import { serviceIconNameFromValue, serviceIconSvg } from '@invoice-monorepo/invoice-template';
import { getPreferredBranchId, listBranches, listProductBranchStock, supabase, transferProductBranchStock } from '@invoice-monorepo/api';
import * as Crypto from 'expo-crypto';
import { brand, getPalette } from '../../theme/brand';
import { getActiveTenantCompanyIds, getWorkspaceScope, hasWorkspacePermission, scopedResource } from '../../services/workspace';
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

const sections: Array<{ key: BusinessSection; labelKey: TranslationKey; icon: React.ComponentType<{ color?: string; size?: number }>; permission: string }> = [
    { key: 'products', labelKey: 'products', icon: Package, permission: 'product.view' },
    { key: 'inventory', labelKey: 'inventory', icon: Box, permission: 'inventory.view' },
    { key: 'expenses', labelKey: 'expenses', icon: WalletCards, permission: 'expense.view_own' },
    { key: 'vendors', labelKey: 'vendors', icon: Truck, permission: 'expense.view_all' },
    { key: 'income', labelKey: 'incomePayment', icon: CircleDollarSign, permission: 'payment.view' },
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
    const [canManageInventory, setCanManageInventory] = useState(false);
    const [workspacePermissions, setWorkspacePermissions] = useState<string[]>([]);
    const [platformAdmin, setPlatformAdmin] = useState(false);
    const [showStockTransfer, setShowStockTransfer] = useState(false);
    const [transferBranches, setTransferBranches] = useState<Array<{ id: string; name: string }>>([]);
    const [transferProductId, setTransferProductId] = useState('');
    const [transferFromBranchId, setTransferFromBranchId] = useState('');
    const [transferToBranchId, setTransferToBranchId] = useState('');
    const [transferQuantity, setTransferQuantity] = useState('');
    const [transferNote, setTransferNote] = useState('');
    const [transferSaving, setTransferSaving] = useState(false);
    const [transferStockByProductBranch, setTransferStockByProductBranch] = useState<Record<string, Record<string, number>>>({});
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
            setWorkspacePermissions(workspaceScope.permissions);
            setPlatformAdmin(workspaceScope.platformAdmin);
            const requiredPermission = sections.find((entry) => entry.key === section)?.permission || 'product.view';
            if (!hasWorkspacePermission(workspaceScope, requiredPermission)) {
                throw new Error('BUSINESS_PERMISSION_REQUIRED');
            }
            const companyIds = getActiveTenantCompanyIds(workspaceScope);
            const companyId = workspaceScope.company?.id || workspaceScope.companyId;
            setCanManageInventory(hasWorkspacePermission(workspaceScope, 'inventory.adjust'));
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
            let nextItems = (result.data || []) as BusinessItem[];
            if (companyId && (section === 'products' || section === 'inventory') && nextItems.length > 0) {
                const branchRows = await listBranches(supabase, companyId).catch(() => []);
                const preferredBranchId = await getPreferredBranchId(supabase, user.id, companyId).catch(() => null);
                const activeBranchId = preferredBranchId && branchRows.some((branch) => branch.id === preferredBranchId)
                    ? preferredBranchId
                    : branchRows.length === 1 ? branchRows[0].id : null;
                const stockRows = await listProductBranchStock(supabase, companyId, null, nextItems.map((item) => String(item.id))).catch(() => []);
                nextItems = nextItems.map((item) => {
                    const rows = stockRows.filter((row) => row.product_id === item.id);
                    const activeRow = activeBranchId ? rows.find((row) => row.branch_id === activeBranchId) : undefined;
                    return {
                        ...item,
                        display_stock_quantity: activeRow ? Number(activeRow.stock_quantity) || 0 : rows.length > 0 ? 0 : Number(item.stock_quantity || 0),
                        display_low_stock_threshold: activeRow ? Number(activeRow.low_stock_threshold) || 5 : Number(item.low_stock_threshold || 5),
                        active_branch_name: activeBranchId ? branchRows.find((branch) => branch.id === activeBranchId)?.name || null : null,
                        other_branch_stocks: branchRows
                            .filter((branch) => branch.id !== activeBranchId)
                            .map((branch) => ({
                                name: branch.name,
                                quantity: Number(rows.find((row) => row.branch_id === branch.id)?.stock_quantity || 0),
                            })),
                    };
                });
            }
            setItems(nextItems);
        } catch (fetchError: any) {
            console.error('Business data error:', fetchError);
            setError(fetchError instanceof Error && fetchError.message === 'BUSINESS_PERMISSION_REQUIRED' ? t('permissionDenied', language) : t('unableToLoad', language));
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
        if ((section === 'products' || section === 'inventory') && can('product.create')) navigation.navigate('ProductForm');
        else if (section === 'vendors' && can('expense.manage')) navigation.navigate('VendorForm');
        else if (section === 'expenses' && can('expense.create')) navigation.navigate('ExpenseForm', { type: 'expense' });
    };

    const openStockTransfer = async () => {
        if (!user) return;
        const stockProducts = items.filter((item) => item.track_stock);
        if (!stockProducts.length) {
            Alert.alert(language === 'sq' ? 'Nuk ka produkte' : 'No products', language === 'sq' ? 'Shtoni së pari një produkt me kontroll të stokut.' : 'Add a stock-tracked product first.');
            return;
        }
        try {
            const workspaceScope = await getWorkspaceScope(user.id);
            const companyId = workspaceScope.company?.id || workspaceScope.companyId;
            if (!companyId) throw new Error(language === 'sq' ? 'Kompania nuk u gjet.' : 'Company not found.');
            const branches = await listBranches(supabase, companyId);
            if (branches.length < 2) {
                Alert.alert(language === 'sq' ? 'Duhet të keni dy degë' : 'Two branches required', language === 'sq' ? 'Krijoni të paktën dy degë aktive për të lëvizur stokun.' : 'Create at least two active branches before moving stock.');
                return;
            }
            const preferredBranchId = await getPreferredBranchId(supabase, user.id, companyId).catch(() => null);
            const fromBranchId = preferredBranchId && branches.some((branch) => branch.id === preferredBranchId) ? preferredBranchId : branches[0].id;
            const toBranchId = branches.find((branch) => branch.id !== fromBranchId)?.id || branches[1].id;
            const stockRows = await listProductBranchStock(supabase, companyId, null, stockProducts.map((product) => String(product.id))).catch(() => []);
            setTransferStockByProductBranch(Object.fromEntries(stockProducts.map((product) => [
                String(product.id),
                Object.fromEntries(branches.map((branch) => [
                    branch.id,
                    Number(stockRows.find((row) => row.product_id === product.id && row.branch_id === branch.id)?.stock_quantity || 0),
                ])),
            ])));
            setTransferBranches(branches.map((branch) => ({ id: branch.id, name: branch.name })));
            setTransferProductId(String(stockProducts[0].id));
            setTransferFromBranchId(fromBranchId);
            setTransferToBranchId(toBranchId);
            setTransferQuantity('');
            setTransferNote('');
            setShowStockTransfer(true);
        } catch (openError) {
            Alert.alert(t('error', language), openError instanceof Error ? openError.message : t('unableToLoad', language));
        }
    };

    const submitStockTransfer = async () => {
        if (!user || transferSaving || !can('inventory.adjust')) return;
        const quantity = Number(transferQuantity.replace(',', '.'));
        if (!transferProductId || !transferFromBranchId || !transferToBranchId || !Number.isFinite(quantity) || quantity <= 0) {
            Alert.alert(t('error', language), language === 'sq' ? 'Zgjidhni produktin, dy degë dhe një sasi të vlefshme.' : 'Select a product, two branches, and a valid quantity.');
            return;
        }
        if (transferFromBranchId === transferToBranchId) {
            Alert.alert(t('error', language), language === 'sq' ? 'Degët duhet të jenë të ndryshme.' : 'The branches must be different.');
            return;
        }
        if (quantity > transferSourceStock) {
            Alert.alert(t('error', language), language === 'sq' ? 'Sasia është më e madhe se stoku në degën burim.' : 'The quantity is greater than the source branch stock.');
            return;
        }
        setTransferSaving(true);
        try {
            const workspaceScope = await getWorkspaceScope(user.id);
            const companyId = workspaceScope.company?.id || workspaceScope.companyId;
            if (!companyId) throw new Error(language === 'sq' ? 'Kompania nuk u gjet.' : 'Company not found.');
            await transferProductBranchStock(supabase, {
                companyId,
                productId: transferProductId,
                fromBranchId: transferFromBranchId,
                toBranchId: transferToBranchId,
                quantity,
                transferId: Crypto.randomUUID(),
                note: transferNote.trim() || null,
            });
            setShowStockTransfer(false);
            await fetchItems();
            Alert.alert(t('success', language), language === 'sq' ? 'Stoku u lëviz me sukses.' : 'Stock was transferred successfully.');
        } catch (transferError) {
            Alert.alert(t('error', language), transferError instanceof Error ? transferError.message : (language === 'sq' ? 'Lëvizja e stokut dështoi.' : 'Stock transfer failed.'));
        } finally {
            setTransferSaving(false);
        }
    };

    const can = (permission: string) => platformAdmin || workspacePermissions.includes(permission);

    const renderProduct = (item: BusinessItem) => {
        const visibleStock = Number(item.display_stock_quantity ?? item.stock_quantity ?? 0);
        const lowStock = item.track_stock && visibleStock <= Number(item.display_low_stock_threshold ?? item.low_stock_threshold ?? 5);
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
                    <Text style={[styles.productStock, { color: lowStock ? brand.colors.warning : palette.muted }]} numberOfLines={1}>{item.track_stock ? `${visibleStock} ${item.unit || 'pcs'}${item.active_branch_name ? ` · ${item.active_branch_name}` : ''}` : t('stockNotTracked', language)}</Text>
                    <Text style={[styles.productPrice, { color: palette.text }]}>{formatCurrency(Number(item.unit_price || 0))}</Text>
                </View>
                {item.track_stock && item.other_branch_stocks?.length ? (
                    <Text style={[styles.otherBranchStock, { color: palette.muted }]} numberOfLines={2}>
                        {language === 'sq' ? 'Degët tjera' : 'Other branches'}: {item.other_branch_stocks.map((branch: { name: string; quantity: number }) => `${branch.name}: ${branch.quantity} ${item.unit || 'pcs'}`).join(' · ')}
                    </Text>
                ) : null}
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
    const transferProducts = items.filter((item) => item.track_stock);
    const selectedTransferProduct = transferProducts.find((product) => String(product.id) === transferProductId);
    const selectedTransferUnit = selectedTransferProduct?.unit || 'pcs';
    const transferSourceStock = Number(transferStockByProductBranch[transferProductId]?.[transferFromBranchId] || 0);
    const transferDestinationStock = Number(transferStockByProductBranch[transferProductId]?.[transferToBranchId] || 0);
    const transferQuantityValue = Number(transferQuantity.replace(',', '.'));
    const transferQuantityIsValid = Number.isFinite(transferQuantityValue) && transferQuantityValue > 0;
    const transferExceedsSource = transferQuantityIsValid && transferQuantityValue > transferSourceStock;
    const transferReady = Boolean(transferProductId && transferFromBranchId && transferToBranchId && transferFromBranchId !== transferToBranchId && transferQuantityIsValid && !transferExceedsSource);
    const transferBranchStock = (branchId: string) => Number(transferStockByProductBranch[transferProductId]?.[branchId] || 0);
    const setQuickTransferQuantity = (value: number) => setTransferQuantity(value > 0 ? String(value) : '');

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
                {section === 'inventory' && canManageInventory ? (
                    <TouchableOpacity
                        testID="inventory-stock-transfer-button"
                        accessibilityRole="button"
                        onPress={() => void openStockTransfer()}
                        style={[styles.transferButton, { backgroundColor: palette.surface, borderColor: primaryColor }]}
                    >
                        <ArrowRightLeft color={primaryColor} size={18} />
                        <Text style={[styles.transferButtonText, { color: primaryColor }]}>{language === 'sq' ? 'Lëvizje të stokut' : 'Stock transfer'}</Text>
                    </TouchableOpacity>
                ) : null}
                <View style={styles.listHeading}><Text style={[styles.listHint, { color: palette.muted }]}>{productSection ? t('allProducts', language) : sectionLabel}</Text><Text style={[styles.listHint, { color: palette.muted }]}>{filteredItems.length}</Text></View>
                {loading ? <LoadingState label={sectionLoading} /> : error ? <ErrorState onRetry={() => void fetchItems()} message={error} /> : <FlatList key="business-list" data={filteredItems} keyExtractor={(item) => item.id} renderItem={renderItem} numColumns={1} keyboardShouldPersistTaps="handled" keyboardDismissMode="none" showsVerticalScrollIndicator={false} contentContainerStyle={filteredItems.length ? styles.listContent : styles.emptyContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void fetchItems(); }} tintColor={primaryColor} />} ListEmptyComponent={<EmptyState title={emptyTitle} description={search ? t('tryAnotherSearch', language) : emptyDescription} actionLabel={emptyAction} onAction={!search ? openCreate : undefined} icon={section === 'vendors' ? Truck : section === 'expenses' ? WalletCards : section === 'inventory' ? Box : Package} />} ListFooterComponent={<View style={{ height: 100 }} />} />}
            </View>
            </KeyboardAvoidingView>
            <Modal visible={showStockTransfer} transparent animationType="slide" onRequestClose={() => setShowStockTransfer(false)}>
                <View style={[styles.transferModalOverlay, { backgroundColor: isDark ? 'rgba(0,0,0,0.78)' : 'rgba(0,0,0,0.5)' }]}>
                    <View style={[styles.transferModalSheet, { backgroundColor: palette.surface }]}>
                        <View style={[styles.transferModalHeader, { borderBottomColor: palette.border }]}>
                            <View style={[styles.transferHeaderIcon, { backgroundColor: `${primaryColor}18` }]}><ArrowRightLeft color={primaryColor} size={20} /></View>
                            <View style={styles.transferModalTitleWrap}>
                                <Text style={[styles.transferModalTitle, { color: palette.text }]}>{language === 'sq' ? 'Lëvizje të stokut' : 'Stock transfer'}</Text>
                                <Text style={[styles.transferModalSubtitle, { color: palette.muted }]}>{language === 'sq' ? 'Dërgo stokun nga një degë në tjetrën' : 'Move stock from one branch to another'}</Text>
                            </View>
                            <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('close', language)} onPress={() => setShowStockTransfer(false)} style={styles.transferCloseButton}><X color={palette.text} size={20} /></TouchableOpacity>
                        </View>
                        <ScrollView contentContainerStyle={styles.transferForm} keyboardShouldPersistTaps="handled">
                            <View style={styles.transferStepRow}><Text style={[styles.transferStep, { color: primaryColor }]}>{language === 'sq' ? 'HAPI 1' : 'STEP 1'}</Text><Text style={[styles.transferStepHint, { color: palette.muted }]}>{language === 'sq' ? 'Zgjidh çfarë do të lëvizësh' : 'Choose what to move'}</Text></View>
                            <Text style={[styles.transferLabel, { color: palette.text }]}>{language === 'sq' ? 'Produkti' : 'Product'}</Text>
                            <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.transferChipRow}>
                                {transferProducts.map((product) => (
                                    <TouchableOpacity key={product.id} accessibilityRole="radio" accessibilityState={{ selected: transferProductId === product.id }} onPress={() => { setTransferProductId(String(product.id)); setTransferQuantity(''); }} style={[styles.transferChip, styles.transferProductChip, { backgroundColor: transferProductId === product.id ? primaryColor : palette.iconSurface, borderColor: transferProductId === product.id ? primaryColor : palette.border }]}>
                                        <Text style={[styles.transferChipText, { color: transferProductId === product.id ? '#fff' : palette.text }]} numberOfLines={1}>{product.name}</Text>
                                        <Text style={[styles.transferChipMeta, { color: transferProductId === product.id ? 'rgba(255,255,255,0.8)' : palette.muted }]}>{transferBranchStock(transferFromBranchId)} {product.unit || 'pcs'} {language === 'sq' ? 'në burim' : 'at source'}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>

                            {selectedTransferProduct ? <View style={[styles.transferProductSummary, { backgroundColor: palette.iconSurface, borderColor: palette.border }]}>
                                <View style={[styles.transferSummaryIcon, { backgroundColor: `${primaryColor}18` }]}><Package color={primaryColor} size={18} /></View>
                                <View style={styles.transferSummaryCopy}><Text style={[styles.transferSummaryName, { color: palette.text }]} numberOfLines={1}>{selectedTransferProduct.name}</Text><Text style={[styles.transferSummaryMeta, { color: palette.muted }]} numberOfLines={1}>{[selectedTransferProduct.category, selectedTransferProduct.sku ? `SKU: ${selectedTransferProduct.sku}` : null].filter(Boolean).join(' · ') || (language === 'sq' ? 'Produkt i inventarit' : 'Inventory product')}</Text></View>
                                <View style={styles.transferSummaryAmount}><Text style={[styles.transferSummaryAmountValue, { color: palette.text }]}>{transferSourceStock}</Text><Text style={[styles.transferSummaryAmountLabel, { color: palette.muted }]}>{selectedTransferUnit}</Text></View>
                            </View> : null}

                            <View style={styles.transferStepRow}><Text style={[styles.transferStep, { color: primaryColor }]}>{language === 'sq' ? 'HAPI 2' : 'STEP 2'}</Text><Text style={[styles.transferStepHint, { color: palette.muted }]}>{language === 'sq' ? 'Zgjidh burimin dhe destinacionin' : 'Choose source and destination'}</Text></View>
                            <Text style={[styles.transferLabel, { color: palette.text }]}>{language === 'sq' ? 'Nga dega' : 'From branch'}</Text>
                            <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.transferChipRow}>
                                {transferBranches.map((branch) => (
                                    <TouchableOpacity key={branch.id} accessibilityRole="radio" accessibilityState={{ selected: transferFromBranchId === branch.id }} onPress={() => { setTransferFromBranchId(branch.id); if (transferToBranchId === branch.id) setTransferToBranchId(transferBranches.find((item) => item.id !== branch.id)?.id || ''); }} style={[styles.transferChip, { backgroundColor: transferFromBranchId === branch.id ? primaryColor : palette.iconSurface, borderColor: transferFromBranchId === branch.id ? primaryColor : palette.border }]}>
                                        <Text style={[styles.transferChipText, { color: transferFromBranchId === branch.id ? '#fff' : palette.text }]}>{branch.name}</Text>
                                        <Text style={[styles.transferChipMeta, { color: transferFromBranchId === branch.id ? 'rgba(255,255,255,0.8)' : palette.muted }]}>{transferBranchStock(branch.id)} {selectedTransferUnit}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>

                            <Text style={[styles.transferLabel, { color: palette.text }]}>{language === 'sq' ? 'Në degën' : 'To branch'}</Text>
                            <ScrollView keyboardShouldPersistTaps="handled" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.transferChipRow}>
                                {transferBranches.filter((branch) => branch.id !== transferFromBranchId).map((branch) => (
                                    <TouchableOpacity key={branch.id} accessibilityRole="radio" accessibilityState={{ selected: transferToBranchId === branch.id }} onPress={() => setTransferToBranchId(branch.id)} style={[styles.transferChip, { backgroundColor: transferToBranchId === branch.id ? primaryColor : palette.iconSurface, borderColor: transferToBranchId === branch.id ? primaryColor : palette.border }]}>
                                        <Text style={[styles.transferChipText, { color: transferToBranchId === branch.id ? '#fff' : palette.text }]}>{branch.name}</Text>
                                        <Text style={[styles.transferChipMeta, { color: transferToBranchId === branch.id ? 'rgba(255,255,255,0.8)' : palette.muted }]}>{transferBranchStock(branch.id)} {selectedTransferUnit}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>

                            <View style={styles.transferStepRow}><Text style={[styles.transferStep, { color: primaryColor }]}>{language === 'sq' ? 'HAPI 3' : 'STEP 3'}</Text><Text style={[styles.transferStepHint, { color: palette.muted }]}>{language === 'sq' ? 'Vendos sasinë dhe konfirmo' : 'Enter quantity and confirm'}</Text></View>
                            <Text style={[styles.transferLabel, { color: palette.text }]}>{language === 'sq' ? `Sasia (${selectedTransferUnit})` : `Quantity (${selectedTransferUnit})`}</Text>
                            <View style={[styles.transferQuantityRow, { backgroundColor: palette.iconSurface, borderColor: transferExceedsSource ? brand.colors.error : palette.border }]}>
                                <TextInput value={transferQuantity} onChangeText={setTransferQuantity} placeholder="0" placeholderTextColor={palette.muted} keyboardType="decimal-pad" style={[styles.transferInput, { color: palette.text }]} />
                                <Text style={[styles.transferQuantityUnit, { color: palette.muted }]}>{selectedTransferUnit}</Text>
                            </View>
                            <View style={styles.transferQuickRow}>
                                {[10, 25].map((value) => <TouchableOpacity key={value} accessibilityRole="button" onPress={() => setQuickTransferQuantity(Math.min(value, transferSourceStock))} style={[styles.transferQuickButton, { backgroundColor: palette.iconSurface, borderColor: palette.border }]}><Text style={[styles.transferQuickText, { color: palette.text }]}>{value}</Text></TouchableOpacity>)}
                                <TouchableOpacity accessibilityRole="button" onPress={() => setQuickTransferQuantity(transferSourceStock / 2)} style={[styles.transferQuickButton, { backgroundColor: palette.iconSurface, borderColor: palette.border }]}><Text style={[styles.transferQuickText, { color: palette.text }]}>{language === 'sq' ? 'Gjysma' : 'Half'}</Text></TouchableOpacity>
                                <TouchableOpacity accessibilityRole="button" onPress={() => setQuickTransferQuantity(transferSourceStock)} style={[styles.transferQuickButton, { backgroundColor: `${primaryColor}18`, borderColor: primaryColor }]}><Text style={[styles.transferQuickText, { color: primaryColor }]}>{language === 'sq' ? 'Të gjitha' : 'All'}</Text></TouchableOpacity>
                            </View>
                            {transferExceedsSource ? <Text style={[styles.transferValidation, { color: brand.colors.error }]}>{language === 'sq' ? `Maksimumi është ${transferSourceStock} ${selectedTransferUnit} në degën burim.` : `Maximum available is ${transferSourceStock} ${selectedTransferUnit} at the source branch.`}</Text> : null}
                            {transferReady ? <View style={[styles.transferAfterCard, { backgroundColor: palette.iconSurface, borderColor: palette.border }]}>
                                <View style={styles.transferAfterHeader}><Text style={[styles.transferAfterTitle, { color: palette.text }]}>{language === 'sq' ? 'Pas lëvizjes' : 'After transfer'}</Text><Check color={brand.colors.success} size={17} /></View>
                                <View style={styles.transferAfterRow}><Text style={[styles.transferAfterLabel, { color: palette.muted }]}>{transferBranches.find((branch) => branch.id === transferFromBranchId)?.name}</Text><Text style={[styles.transferAfterValue, { color: palette.text }]}>{transferSourceStock - transferQuantityValue} {selectedTransferUnit}</Text></View>
                                <View style={styles.transferAfterRow}><Text style={[styles.transferAfterLabel, { color: palette.muted }]}>{transferBranches.find((branch) => branch.id === transferToBranchId)?.name}</Text><Text style={[styles.transferAfterValue, { color: palette.text }]}>{transferDestinationStock + transferQuantityValue} {selectedTransferUnit}</Text></View>
                            </View> : null}
                            <Text style={[styles.transferLabel, { color: palette.text }]}>{language === 'sq' ? 'Shënim (opsionale)' : 'Note (optional)'}</Text>
                            <TextInput value={transferNote} onChangeText={setTransferNote} placeholder={language === 'sq' ? 'Arsyeja e lëvizjes...' : 'Reason for transfer...'} placeholderTextColor={palette.muted} multiline style={[styles.transferNoteInput, { color: palette.text, backgroundColor: palette.iconSurface, borderColor: palette.border }]} />
                            <TouchableOpacity accessibilityRole="button" disabled={transferSaving || !transferReady} onPress={() => void submitStockTransfer()} style={[styles.transferSubmitButton, { backgroundColor: primaryColor, opacity: transferSaving || !transferReady ? 0.5 : 1 }]}>
                                <ArrowRightLeft color="#fff" size={18} />
                                <Text style={styles.transferSubmitText}>{transferSaving ? (language === 'sq' ? 'Duke ruajtur...' : 'Saving...') : (language === 'sq' ? 'Lëviz stokun' : 'Transfer stock')}</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
            <Modal visible={showSectionPicker} transparent animationType="slide" onRequestClose={() => setShowSectionPicker(false)}>
                <View style={[styles.sectionModalOverlay, { backgroundColor: isDark ? 'rgba(0,0,0,0.78)' : 'rgba(0,0,0,0.5)' }]}>
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('close', language)} onPress={() => setShowSectionPicker(false)} style={StyleSheet.absoluteFill} />
                    <View style={[styles.sectionModalSheet, { backgroundColor: palette.surface }]}>
                        <View style={[styles.sectionModalHeader, { borderBottomColor: palette.border }]}><Text style={[styles.sectionModalTitle, { color: palette.text }]}>{t('business', language)}</Text><TouchableOpacity testID="business-close-section-picker-button" accessibilityRole="button" accessibilityLabel={t('close', language)} onPress={() => setShowSectionPicker(false)} style={styles.sectionModalClose}><X color={palette.text} size={20} /></TouchableOpacity></View>
                        <ScrollView contentContainerStyle={styles.sectionOptions} keyboardShouldPersistTaps="handled">
                            {sections.filter((item) => can(item.permission)).map((item) => {
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
    otherBranchStock: { marginTop: 9, fontSize: 11, lineHeight: 16, fontFamily: brand.fonts.regular },
    transferButton: { minHeight: 48, borderWidth: 1, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 14 },
    transferButtonText: { fontSize: 13, fontFamily: brand.fonts.semibold },
    transferModalOverlay: { flex: 1, justifyContent: 'flex-end' },
    transferModalSheet: { maxHeight: '92%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 18 },
    transferModalHeader: { minHeight: 82, paddingHorizontal: 20, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 11 },
    transferHeaderIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    transferModalTitleWrap: { flex: 1 },
    transferModalTitle: { fontSize: 19, fontFamily: brand.fonts.semibold },
    transferModalSubtitle: { fontSize: 12, fontFamily: brand.fonts.regular, marginTop: 3 },
    transferCloseButton: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    transferForm: { padding: 20, paddingBottom: 34 },
    transferStepRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 2 },
    transferStep: { fontSize: 10, letterSpacing: 0.7, fontFamily: brand.fonts.semibold },
    transferStepHint: { fontSize: 11, fontFamily: brand.fonts.regular },
    transferLabel: { fontSize: 12, fontFamily: brand.fonts.semibold, marginTop: 14, marginBottom: 8 },
    transferChipRow: { gap: 8, paddingBottom: 2 },
    transferChip: { maxWidth: 220, minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 7, alignItems: 'center', justifyContent: 'center' },
    transferProductChip: { minWidth: 150, alignItems: 'flex-start' },
    transferChipText: { fontSize: 12, fontFamily: brand.fonts.medium },
    transferChipMeta: { fontSize: 10, fontFamily: brand.fonts.regular, marginTop: 2 },
    transferProductSummary: { minHeight: 62, borderWidth: 1, borderRadius: 15, padding: 11, marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
    transferSummaryIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    transferSummaryCopy: { flex: 1, minWidth: 0 },
    transferSummaryName: { fontSize: 13, fontFamily: brand.fonts.semibold },
    transferSummaryMeta: { fontSize: 10, fontFamily: brand.fonts.regular, marginTop: 3 },
    transferSummaryAmount: { alignItems: 'flex-end' },
    transferSummaryAmountValue: { fontSize: 15, fontFamily: brand.fonts.semibold },
    transferSummaryAmountLabel: { fontSize: 10, fontFamily: brand.fonts.regular, marginTop: 1 },
    transferQuantityRow: { minHeight: 52, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' },
    transferInput: { flex: 1, minHeight: 50, padding: 0, fontSize: 17, fontFamily: brand.fonts.medium },
    transferQuantityUnit: { fontSize: 13, fontFamily: brand.fonts.semibold },
    transferQuickRow: { flexDirection: 'row', gap: 7, marginTop: 8 },
    transferQuickButton: { minHeight: 32, paddingHorizontal: 11, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    transferQuickText: { fontSize: 11, fontFamily: brand.fonts.medium },
    transferValidation: { fontSize: 11, lineHeight: 16, fontFamily: brand.fonts.medium, marginTop: 8 },
    transferAfterCard: { borderWidth: 1, borderRadius: 15, padding: 13, marginTop: 14, gap: 8 },
    transferAfterHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
    transferAfterTitle: { fontSize: 12, fontFamily: brand.fonts.semibold },
    transferAfterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    transferAfterLabel: { flex: 1, fontSize: 11, fontFamily: brand.fonts.regular },
    transferAfterValue: { fontSize: 12, fontFamily: brand.fonts.semibold },
    transferNoteInput: { minHeight: 78, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, paddingTop: 13, fontSize: 13, fontFamily: brand.fonts.regular, textAlignVertical: 'top' },
    transferSubmitButton: { minHeight: 52, borderRadius: 14, marginTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    transferSubmitText: { color: '#fff', fontSize: 14, fontFamily: brand.fonts.semibold },
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
