import React, { useEffect, useState, useCallback } from 'react';
import {
    View,
    Text,
    Image,
    ScrollView,
    TouchableOpacity,
    RefreshControl,
    Alert,
    StyleSheet,
    TextInput,
} from 'react-native';
import { Trash2, Search, X, Percent, Box, AlertTriangle, DollarSign, Scan } from 'lucide-react-native';
import { SvgXml } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@invoice-monorepo/api';
import { useAuth } from '@invoice-monorepo/hooks';
import { useTheme } from '@invoice-monorepo/hooks';
import { Card, FAB, BarcodeScannerModal } from '@invoice-monorepo/ui';

import { Product } from '@invoice-monorepo/types';
import { formatCurrency } from '@invoice-monorepo/i18n';
import { t } from '@invoice-monorepo/i18n';
import { serviceIconNameFromValue, serviceIconSvg } from '@invoice-monorepo/invoice-template';
import { getActiveProductCompanyIds, getWorkspaceScope } from '../../services/workspace';
import { deleteProduct, listProducts } from '@invoice-monorepo/api/repositories';
import { mobileCacheKey, readMobileCache, writeMobileCache } from '../../services/mobileCache';

interface ProductsScreenProps {
    navigation: any;
    showHeader?: boolean;
}

export function ProductsScreen({ navigation, showHeader = false }: ProductsScreenProps) {
    const { user } = useAuth();
    const { isDark, primaryColor, language } = useTheme();
    const [products, setProducts] = useState<Product[]>([]);
    const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<'name' | 'price' | 'stock'>('name');
    const [showScanner, setShowScanner] = useState(false);
    const [canManageProducts, setCanManageProducts] = useState(false);

    const bgColor = isDark ? '#0D1B2A' : '#F7F9FC';
    const textColor = isDark ? '#fff' : '#111827';
    const mutedColor = isDark ? '#98A2B3' : '#667085';
    const cardBg = isDark ? '#14243A' : '#ffffff';
    const inputBg = isDark ? '#14243A' : '#ffffff';
    const borderColor = isDark ? '#263A55' : '#E4E9F0';

    const categories = ['All', ...Array.from(new Set(products.map(p => p.category).filter((c): c is string => !!c)))];

    const stats = {
        totalProducts: products.length,
        totalValue: products.reduce((sum, p) => sum + (Number(p.unit_price) * (p.stock_quantity || 0)), 0),
        lowStockItems: products.filter(p => p.track_stock && (p.stock_quantity || 0) <= (p.low_stock_threshold || 5)).length,
        outOfStockItems: products.filter(p => p.track_stock && (p.stock_quantity || 0) <= 0).length,
    };

    useFocusEffect(
        useCallback(() => {
            fetchProducts();
        }, [user?.id])
    );

    const fetchProducts = async () => {
        if (!user) return;
        try {
            const workspaceScope = await getWorkspaceScope(user.id);
            setCanManageProducts(['super_administrator', 'company_administrator', 'manager'].includes(workspaceScope.roleCode));
            const companyIds = getActiveProductCompanyIds(workspaceScope);
            const cacheKey = mobileCacheKey('products', user.id, companyIds);
            const cachedProducts = await readMobileCache<Product[]>(cacheKey);
            if (cachedProducts) {
                setProducts(cachedProducts);
                applyFiltersAndSort(cachedProducts, searchQuery, selectedCategory, sortBy);
            }
            const data = await listProducts(supabase, { userId: user.id, companyIds });
            const productRows = data as unknown as Product[];
            setProducts(productRows);
            applyFiltersAndSort(productRows, searchQuery, selectedCategory, sortBy);
            writeMobileCache(cacheKey, productRows);
        } catch (err) {
            console.error(err);
        }
    };

    const applyFiltersAndSort = (data: Product[], query: string, category: string | null, sort: string) => {
        let filtered = [...data];

        // Search
        if (query.trim()) {
            const q = query.toLowerCase();
            filtered = filtered.filter(p =>
                p.name.toLowerCase().includes(q) ||
                p.sku?.toLowerCase().includes(q) ||
                p.barcode?.includes(q) ||
                p.description?.toLowerCase().includes(q)
            );
        }

        // Category
        if (category && category !== 'All') {
            filtered = filtered.filter(p => p.category === category);
        }

        // Sort
        filtered.sort((a, b) => {
            if (sort === 'name') return a.name.localeCompare(b.name);
            if (sort === 'price') return Number(b.unit_price) - Number(a.unit_price);
            if (sort === 'stock') return (b.stock_quantity || 0) - (a.stock_quantity || 0);
            return 0;
        });

        setFilteredProducts(filtered);
    };

    useEffect(() => {
        applyFiltersAndSort(products, searchQuery, selectedCategory, sortBy);
    }, [searchQuery, selectedCategory, sortBy, products]);

    const onRefresh = async () => {
        setRefreshing(true);
        await fetchProducts();
        setRefreshing(false);
    };

    const handleBarcodeScanned = (code: string) => {
        setSearchQuery(code);
        setShowScanner(false);
    };

    const handleDelete = (id: string) => {
        if (!canManageProducts) return;
        Alert.alert(t('delete', language), t('areYouSure', language), [
            { text: t('cancel', language), style: 'cancel' },
            {
                text: t('delete', language),
                style: 'destructive',
                onPress: async () => {
                    const { companyId } = await getWorkspaceScope(user!.id);
                    await deleteProduct(supabase, id, companyId, user!.id);
                    await fetchProducts();
                    Alert.alert(t('success', language), t('productDeletedSuccessfully', language));
                },
            },
        ]);
    };

    const renderStatCard = (title: string, value: string | number, icon: any, color: string) => {
        const Icon = icon;
        return (
            <View style={[styles.statCard, { backgroundColor: cardBg }]}>
                <View style={[styles.statIconContainer, { backgroundColor: `${color}15` }]}>
                    <Icon color={color} size={20} />
                </View>
                <Text style={[styles.statValue, { color: textColor }]}>{value}</Text>
                <Text style={[styles.statLabel, { color: mutedColor }]}>{title}</Text>
            </View>
        );
    };

    const renderProduct = (item: Product) => {
        const isLowStock = item.track_stock && (item.stock_quantity || 0) <= (item.low_stock_threshold || 5);
        const outOfStock = item.track_stock && (item.stock_quantity || 0) <= 0;
        const serviceIcon = serviceIconNameFromValue(item.image_url);

        return (
            <TouchableOpacity
                key={item.id}
                testID={`product-row-${item.id}`}
                activeOpacity={0.7}
                onPress={() => navigation.navigate(canManageProducts ? 'ProductForm' : 'ProductDetail', { productId: item.id })}
            >
                <View style={[styles.productCard, { backgroundColor: cardBg }]}>
                    <View style={styles.productHeader}>
                        {serviceIcon ? <View style={[styles.productImage, styles.productImagePlaceholder, { backgroundColor: isDark ? '#263A55' : '#EDF4FF' }]}><SvgXml xml={serviceIconSvg(serviceIcon, primaryColor)} width="30" height="30" /></View> : item.image_url ? <Image accessibilityLabel={`${item.name} ${t('productPhoto', language)}`} source={{ uri: item.image_url }} style={styles.productImage} resizeMode="cover" /> : <View style={[styles.productImage, styles.productImagePlaceholder, { backgroundColor: isDark ? '#263A55' : '#EDF4FF' }]}><Box color={primaryColor} size={23} /></View>}
                        <View style={styles.productInfo}>
                            <View style={styles.nameRow}>
                                <Text style={[styles.productName, { color: textColor }]}>{item.name}</Text>
                                {item.category && (
                                    <View style={styles.categoryBadge}>
                                        <Text style={styles.categoryText}>{item.category}</Text>
                                    </View>
                                )}
                            </View>
                            {item.sku && <Text style={[styles.productSku, { color: mutedColor }]}>SKU: {item.sku}</Text>}

                            {item.track_stock && (
                                <View style={styles.stockRow}>
                                    <Box size={12} color={outOfStock ? '#ef4444' : isLowStock ? '#f59e0b' : '#12B76A'} />
                                    <Text style={[
                                        styles.stockText,
                                        { color: outOfStock ? '#ef4444' : isLowStock ? '#f59e0b' : mutedColor }
                                    ]}>
                                        {t('inventory', language)}: {item.stock_quantity} {item.unit}
                                    </Text>
                                    {isLowStock && <AlertTriangle size={12} color="#f59e0b" />}
                                </View>
                            )}
                        </View>
                        {canManageProducts ? <TouchableOpacity testID={`product-delete-${item.id}`} onPress={() => handleDelete(item.id)} style={styles.deleteButton}>
                            <Trash2 color="#ef4444" size={20} />
                        </TouchableOpacity> : null}
                    </View>
                    <View style={styles.productFooter}>
                        <View style={styles.priceRow}>
                            <Text style={styles.productPrice}>
                                {formatCurrency(item.tax_included
                                    ? Number(item.unit_price || 0)
                                    : Number(item.unit_price || 0) * (1 + (item.tax_rate || 0) / 100)
                                )}
                            </Text>
                            <Text style={[styles.unitText, { color: mutedColor }]}>/{item.unit}</Text>
                        </View>
                        {Number(item.tax_rate || 0) > 0 && (
                            <View style={styles.taxBadge}>
                                <Percent color="#004FFE" size={12} />
                                <Text style={styles.taxText}>{item.tax_rate}% {t('tax', language)}</Text>
                            </View>
                        )}
                    </View>
                </View>
            </TouchableOpacity>
        );
    }

    return (
        <View testID="products-screen" style={[styles.container, { backgroundColor: bgColor }]}>
            <View style={styles.header}>
                <View>
                    <Text style={[styles.subtitle, { color: mutedColor }]}>{t('management', language)}</Text>
                    <Text style={[styles.title, { color: textColor }]}>{t('products', language)}</Text>
                </View>
                {canManageProducts ? <TouchableOpacity testID="product-create-button" accessibilityRole="button" style={[styles.iconButton, { backgroundColor: cardBg }]} onPress={() => navigation.navigate('ProductForm')}>
                    <Box color={primaryColor} size={20} />
                </TouchableOpacity> : null}
            </View>
            <ScrollView
                refreshControl={<RefreshControl testID="products-refresh-control" refreshing={refreshing} onRefresh={onRefresh} tintColor={mutedColor} />}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="none"
            >
                {/* Inventory HUD */}
                <View style={styles.statsContainer}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsScroll}>
                        {renderStatCard(t('products', language), stats.totalProducts, Box, '#004FFE')}
                        {renderStatCard(t('totalValue', language), formatCurrency(stats.totalValue), DollarSign, '#12B76A')}
                        {renderStatCard(t('lowStock', language), stats.lowStockItems, AlertTriangle, '#f59e0b')}
                        {renderStatCard(t('outOfStock', language), stats.outOfStockItems, X, '#ef4444')}
                    </ScrollView>
                </View>

                {/* Filters & Search Header */}
                <View>
                    <View style={[styles.searchBar, { backgroundColor: inputBg }]}>
                        <Search color={mutedColor} size={20} />
                        <TextInput
                            testID="products-search-input"
                            style={[styles.searchInput, { color: textColor }]}
                            placeholder={t('search', language)}
                            placeholderTextColor={mutedColor}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                        <TouchableOpacity testID="products-scan-button" onPress={() => setShowScanner(true)}>
                            <Scan color={primaryColor} size={20} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
                        {categories.map((cat, idx) => (
                            <TouchableOpacity
                                key={idx}
                                onPress={() => setSelectedCategory(cat === 'All' ? null : cat)}
                                style={[
                                    styles.filterChip,
                                    { backgroundColor: cardBg },
                                    ((selectedCategory === null && cat === 'All') || selectedCategory === cat) && { backgroundColor: primaryColor }
                                ]}
                            >
                                <Text style={[
                                    styles.filterText,
                                    { color: ((selectedCategory === null && cat === 'All') || selectedCategory === cat) ? '#fff' : mutedColor }
                                ]}>{cat === 'All' ? t('viewAll', language) : cat}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>

                    <View style={styles.sortContainer}>
                        <Text style={[styles.tinyLabel, { color: mutedColor }]}>{t('sortBy', language).toUpperCase()}:</Text>
                        <View style={styles.sortButtons}>
                            {(['name', 'price', 'stock'] as const).map(s => (
                                <TouchableOpacity
                                    key={s}
                                    onPress={() => setSortBy(s)}
                                    style={[
                                        styles.sortBtn,
                                        sortBy === s && { borderBottomColor: primaryColor, borderBottomWidth: 2 }
                                    ]}
                                >
                                    <Text style={[
                                        styles.sortBtnText,
                                        { color: sortBy === s ? primaryColor : mutedColor }
                                    ]}>{s === 'name' ? t('name', language) : s === 'price' ? t('unitPrice', language) : t('inventory', language)}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </View>

                {filteredProducts.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Box color={mutedColor} size={48} opacity={0.2} />
                        <Text style={[styles.emptyText, { color: mutedColor }]}>
                            {searchQuery ? t('noProductsFound', language) : t('noProductsInInventory', language)}
                        </Text>
                    </View>
                ) : (
                    <View style={styles.productList}>
                        {filteredProducts.map(p => renderProduct(p))}
                    </View>
                )}
            </ScrollView>

            <BarcodeScannerModal
                visible={showScanner}
                onClose={() => setShowScanner(false)}
                onScanned={handleBarcodeScanned}
            />

            <FAB testID="product-fab" onPress={() => navigation.navigate('ProductForm')} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 },
    subtitle: { fontSize: 13, fontWeight: '500', marginBottom: 2 },
    title: { fontSize: 28, fontWeight: '800' },
    iconButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },

    scrollContent: { paddingBottom: 100 },

    // Stats
    statsContainer: { marginBottom: 24 },
    statsScroll: { paddingHorizontal: 20, gap: 12 },
    statCard: {
        minWidth: 140,
        padding: 16,
        borderRadius: 16,
        alignItems: 'center',
        gap: 8
    },
    statIconContainer: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    statValue: { fontSize: 18, fontWeight: 'bold' },
    statLabel: { fontSize: 11, fontWeight: '500' },

    // Search & Filter
    searchBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 14, marginBottom: 16, gap: 12 },
    searchInput: { flex: 1, fontSize: 16 },

    filterScroll: { gap: 8, marginBottom: 16, paddingHorizontal: 20 },
    filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
    filterText: { fontSize: 13, fontWeight: '600' },

    sortContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingHorizontal: 20 },
    tinyLabel: { fontSize: 11, fontWeight: '700', opacity: 0.7 },
    sortButtons: { flexDirection: 'row', gap: 16 },
    sortBtn: { paddingVertical: 4 },
    sortBtnText: { fontSize: 12, fontWeight: '700' },

    productList: { paddingHorizontal: 20, gap: 12 },
    productCard: { padding: 16, borderRadius: 16 },
    productHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
    productImage: { width: 58, height: 58, borderRadius: 14, marginRight: 12 },
    productImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
    productInfo: { flex: 1, minWidth: 0 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    productName: { fontSize: 16, fontWeight: '700' },
    categoryBadge: { backgroundColor: 'rgba(0, 79, 254, 0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    categoryText: { color: '#004FFE', fontSize: 10, fontWeight: '700' },
    productSku: { fontSize: 12, marginTop: 4 },
    stockRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
    stockText: { fontSize: 12, fontWeight: '600' },

    productFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)', paddingTop: 12 },
    priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
    productPrice: { color: '#12B76A', fontSize: 20, fontWeight: '800' },
    unitText: { fontSize: 12, fontWeight: '600' },
    taxBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0, 79, 254, 0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    taxText: { color: '#004FFE', fontSize: 10, fontWeight: '700' },
    deleteButton: { padding: 8 },

    emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 60, gap: 16 },
    emptyText: { fontSize: 14, fontWeight: '500' },
});
