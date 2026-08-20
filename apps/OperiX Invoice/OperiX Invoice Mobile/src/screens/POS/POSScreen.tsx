import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    FlatList,
    Image,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Crypto from 'expo-crypto';
import { Banknote, ChevronDown, Clock3, CreditCard, Grid2X2, Minus, MoreHorizontal, Plus, QrCode, Search, ShoppingCart, UserRound, WalletCards, X } from 'lucide-react-native';
import { SvgXml } from 'react-native-svg';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { formatCurrency, t } from '@invoice-monorepo/i18n';
import { serviceIconNameFromValue, serviceIconSvg } from '@invoice-monorepo/invoice-template';
import { supabase } from '@invoice-monorepo/api';
import { listCustomers, listProducts } from '@invoice-monorepo/api/repositories';
import { brand, getPalette } from '../../theme/brand';
import { getActiveTenantCompanyIds, getWorkspaceScope } from '../../services/workspace';
import { mobileCacheKey, readMobileCache, writeMobileCache } from '../../services/mobileCache';
import type { PosCartItem, RootStackParamList } from '../../navigation/types';
import { ErrorState, LoadingState, MobileHeader, MobileScreen, SearchField, mobileStyles } from '../../components/mobile/MobileUI';

type ProductItem = Record<string, any>;
type CustomerItem = Record<string, any>;
type CartLine = ProductItem & { quantity: number };
type PaymentChoice = 'cash' | 'card' | 'debt' | 'other';

export function POSScreen() {
    const { user } = useAuth();
    const { isDark, primaryColor, language } = useTheme();
    const palette = getPalette(isDark);
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const route = useRoute<any>();
    const [products, setProducts] = useState<ProductItem[]>([]);
    const [customers, setCustomers] = useState<CustomerItem[]>([]);
    const [cart, setCart] = useState<CartLine[]>([]);
    const [heldOrders, setHeldOrders] = useState<CartLine[][]>([]);
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('All');
    const [customerSearch, setCustomerSearch] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState<CustomerItem | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showCart, setShowCart] = useState(false);
    const [showCustomers, setShowCustomers] = useState(false);
    const [showPayment, setShowPayment] = useState(false);
    const [showHeldOrders, setShowHeldOrders] = useState(false);
    const autoAddedProduct = useRef<string | null>(null);
    useEffect(() => {
        const barcodeSearch = route.params?.barcodeSearch as string | undefined;
        if (!barcodeSearch) return;
        setSearch(barcodeSearch);
        navigation.setParams({ barcodeSearch: undefined });
    }, [navigation, route.params?.barcodeSearch]);

    const fetchData = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        setError(null);
        try {
            const workspaceScope = await getWorkspaceScope(user.id);
            const activeTenantCompanyIds = getActiveTenantCompanyIds(workspaceScope);
            const productCompanyIds = activeTenantCompanyIds;
            const customerCompanyIds = activeTenantCompanyIds;
            const productQueryScope = { userId: user.id, companyIds: productCompanyIds };
            const customerQueryScope = { userId: user.id, companyIds: customerCompanyIds };
            const productsCacheKey = mobileCacheKey('products', user.id, productCompanyIds);
            const customersCacheKey = mobileCacheKey('customers', user.id, customerCompanyIds);
            const [cachedProducts, cachedCustomers] = await Promise.all([
                readMobileCache<ProductItem[]>(productsCacheKey),
                readMobileCache<CustomerItem[]>(customersCacheKey),
            ]);
            if (cachedProducts) setProducts(cachedProducts);
            if (cachedCustomers) setCustomers(cachedCustomers);
            if (cachedProducts || cachedCustomers) setLoading(false);
            const [productRows, customerRows] = await Promise.all([
                listProducts(supabase, productQueryScope),
                listCustomers(supabase, customerQueryScope),
            ]);
            const nextProducts = productRows as ProductItem[];
            const nextCustomers = customerRows as CustomerItem[];
            setProducts(nextProducts);
            setCustomers(nextCustomers);
            writeMobileCache(productsCacheKey, nextProducts);
            writeMobileCache(customersCacheKey, nextCustomers);
        } catch (fetchError: any) {
            console.error('Invoice builder data error:', fetchError);
            setError(t('unableToLoad', language));
        } finally {
            setLoading(false);
        }
    }, [language, user]);

    useFocusEffect(useCallback(() => { void fetchData(); }, [fetchData]));

    useEffect(() => {
        const productId = route.params?.productId as string | undefined;
        if (!productId || !products.length || autoAddedProduct.current === productId) return;
        const product = products.find((item) => item.id === productId);
        if (product) {
            autoAddedProduct.current = productId;
            addToCart(product);
        }
    }, [products, route.params?.productId]);

    const categories = useMemo(() => ['All', ...Array.from(new Set(products.map((product) => product.category).filter(Boolean) as string[])).slice(0, 8)], [products]);
    const filteredProducts = useMemo(() => products.filter((product) => {
        const matchesCategory = category === 'All' || product.category === category;
        const query = search.trim().toLowerCase();
        return matchesCategory && (!query || [product.name, product.sku, product.barcode, product.category].filter(Boolean).join(' ').toLowerCase().includes(query));
    }), [category, products, search]);
    const total = useMemo(() => cart.reduce((sum, line) => sum + Number(line.unit_price || 0) * line.quantity, 0), [cart]);
    const itemCount = useMemo(() => cart.reduce((sum, line) => sum + line.quantity, 0), [cart]);

    function addToCart(product: ProductItem) {
        const availableStock = Number(product.stock_quantity ?? 0);
        const currentQuantity = cart.find((line) => line.id === product.id)?.quantity || 0;
        if (product.track_stock && availableStock <= currentQuantity) {
            Alert.alert(t('outOfStock', language), `${product.name}: ${t('outOfStock', language).toLocaleLowerCase(language === 'sq' ? 'sq-XK' : 'en-US')}.`);
            return;
        }
        setCart((current) => {
            const existing = current.find((line) => line.id === product.id);
            if (existing) return current.map((line) => line.id === product.id ? { ...line, quantity: line.quantity + 1 } : line);
            return [...current, { ...product, quantity: 1 }];
        });
    }

    function changeQuantity(productId: string, delta: number) {
        const line = cart.find((candidate) => candidate.id === productId);
        if (line && delta > 0 && line.track_stock && line.quantity + delta > Number(line.stock_quantity ?? 0)) {
            Alert.alert(t('stockLimitReached', language), t('stockLimitMessage', language).replace('{count}', String(Number(line.stock_quantity ?? 0))).replace('{unit}', line.unit || 'pcs').replace('{name}', line.name));
            return;
        }
        setCart((current) => current.flatMap((line) => line.id !== productId ? [line] : line.quantity + delta <= 0 ? [] : [{ ...line, quantity: line.quantity + delta }]));
    }

    const filteredCustomers = customers.filter((customer) => !customerSearch.trim() || [customer.name, customer.email, customer.phone].filter(Boolean).join(' ').toLowerCase().includes(customerSearch.toLowerCase()));

    const continueToInvoice = (paymentMethod: PaymentChoice) => {
        const posCart: PosCartItem[] = cart.map((line) => ({ productId: line.id, name: line.name, quantity: line.quantity, unitPrice: Number(line.unit_price || 0), taxRate: Number(line.tax_rate || 0), taxIncluded: Boolean(line.tax_included), unit: line.unit || 'pcs', sku: line.sku || '' }));
        setShowPayment(false);
        setShowCart(false);
        navigation.navigate('InvoiceForm', { posCart, posCustomerId: selectedCustomer?.id, posPaymentMethod: paymentMethod, posIdempotencyKey: Crypto.randomUUID() });
    };

    const holdOrder = () => {
        if (!cart.length) return;
        setHeldOrders((current) => [...current, cart]);
        setCart([]);
        setShowCart(false);
    };

    const restoreOrder = (order: CartLine[]) => {
        setCart(order);
        setHeldOrders((current) => current.filter((candidate) => candidate !== order));
        setShowHeldOrders(false);
    };

    const renderProduct = ({ item }: { item: ProductItem }) => {
        const imageUrl = typeof item.image_url === 'string' ? item.image_url.trim() : '';
        return (
        <TouchableOpacity testID={`pos-product-${item.id}`} accessibilityRole="button" accessibilityLabel={`${t('add', language)} ${item.name} ${t('cart', language)}`} onPress={() => addToCart(item)} style={[styles.productCard, { backgroundColor: palette.surface, borderColor: palette.border }]}> 
            <ProductMedia imageUrl={imageUrl} name={item.name} backgroundColor={palette.iconSurface} color={brand.colors.primary} photoLabel={t('productPhoto', language)} />
            <Text style={[styles.productName, { color: palette.text }]} numberOfLines={2}>{item.name}</Text>
            <Text style={[styles.productCategory, { color: palette.muted }]} numberOfLines={1}>{item.category || t('products', language)}</Text>
            <View style={styles.productBottom}><Text style={[styles.productPrice, { color: primaryColor }]}>{formatCurrency(Number(item.unit_price || 0))}</Text><View style={[styles.addCircle, { backgroundColor: primaryColor }]}><Plus color="#fff" size={16} /></View></View>
            {item.track_stock ? <Text style={[styles.stockNote, { color: Number(item.stock_quantity ?? 0) > 0 ? palette.muted : brand.colors.error }]}>{Number(item.stock_quantity ?? 0) > 0 ? `${Number(item.stock_quantity ?? 0)} ${item.unit || 'pcs'} ${t('available', language)}` : t('outOfStock', language)}</Text> : null}
        </TouchableOpacity>
        );
    };

    return (
        <MobileScreen testID="pos-screen">
            <MobileHeader title={t('invoice', language)} subtitle={t('newSale', language)} right={<TouchableOpacity accessibilityRole="button" accessibilityLabel={t('heldOrders', language)} onPress={() => setShowHeldOrders(true)} style={styles.heldButton}><Clock3 color="#FFFFFF" size={21} /></TouchableOpacity>} />
            <View style={styles.body}>
                <TouchableOpacity testID="pos-customer-selector" accessibilityRole="button" onPress={() => setShowCustomers(true)} style={[styles.customerPicker, { backgroundColor: palette.surface, borderColor: palette.border }]}><View style={[styles.customerIcon, { backgroundColor: palette.iconSurface }]}><UserRound color={brand.colors.primary} size={17} /></View><View style={styles.customerCopy}><Text style={[styles.customerLabel, { color: palette.muted }]}>{t('customer', language)}</Text><Text style={[styles.customerName, { color: palette.text }]}>{selectedCustomer?.name || t('walkInCustomer', language)}</Text></View><ChevronDown color={palette.muted} size={18} /></TouchableOpacity>
                <SearchField testID="pos-product-search" value={search} onChangeText={setSearch} placeholder={`${t('search', language)} ${t('products', language).toLocaleLowerCase(language === 'sq' ? 'sq-XK' : 'en-US')}`} rightAccessory={<TouchableOpacity testID="pos-barcode-scan-button" accessibilityRole="button" accessibilityLabel={t('scanBarcode', language)} onPress={() => navigation.navigate('QRScanner', { mode: 'search', returnTo: 'POS' })} style={styles.inlineScanButton}><QrCode color={primaryColor} size={20} /></TouchableOpacity>} />
                <ScrollView horizontal style={styles.categoryScroll} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroller}>{categories.map((item) => <TouchableOpacity testID={`pos-category-${item.toLowerCase()}`} key={item} accessibilityRole="tab" accessibilityState={{ selected: category === item }} onPress={() => setCategory(item)} style={[styles.categoryChip, { backgroundColor: category === item ? primaryColor : palette.surface, borderColor: category === item ? primaryColor : palette.border }]}><Text style={[styles.categoryText, { color: category === item ? '#fff' : palette.muted }]}>{item === 'All' ? t('viewAll', language) : item}</Text></TouchableOpacity>)}</ScrollView>
                <View style={styles.listHeading}><Text style={[styles.listHint, { color: palette.muted }]}>{t('allProducts', language)}</Text><Text style={[styles.listHint, { color: palette.muted }]}>{filteredProducts.length}</Text></View>
                {loading ? <LoadingState label={`${t('loading', language)} ${t('products', language).toLocaleLowerCase(language === 'sq' ? 'sq-XK' : 'en-US')}…`} /> : error ? <ErrorState onRetry={() => void fetchData()} message={error} /> : <FlatList data={filteredProducts} keyExtractor={(item) => item.id} renderItem={renderProduct} numColumns={2} style={styles.productListView} columnWrapperStyle={styles.productColumns} contentContainerStyle={filteredProducts.length ? styles.productList : styles.emptyList} showsVerticalScrollIndicator={false} ListEmptyComponent={<View style={styles.noProducts}><Grid2X2 color={palette.muted} size={27} /><Text style={[styles.noProductsTitle, { color: palette.text }]}>{t('noProductsFound', language)}</Text><Text style={[styles.noProductsText, { color: palette.muted }]}>{t('addProductsToStartSale', language)}</Text></View>} />}
            </View>

                <View style={[styles.cartBar, { backgroundColor: palette.surface, borderTopColor: palette.border }]}><TouchableOpacity testID="pos-cart-button" accessibilityRole="button" accessibilityLabel={t('cart', language)} onPress={() => setShowCart(true)} style={styles.cartSummary}><View style={[styles.cartIcon, { backgroundColor: primaryColor }]}><ShoppingCart color="#fff" size={18} /></View><View><Text style={[styles.cartLabel, { color: palette.muted }]}>{itemCount} {itemCount === 1 ? t('item', language) : t('itemsInInvoice', language)}</Text><Text style={[styles.cartTotal, { color: palette.text }]}>{formatCurrency(total)}</Text></View></TouchableOpacity><TouchableOpacity testID="pos-checkout-button" accessibilityRole="button" accessibilityState={{ disabled: !cart.length }} disabled={!cart.length} onPress={() => setShowPayment(true)} style={[styles.checkoutButton, { backgroundColor: primaryColor, opacity: cart.length ? 1 : 0.45 }]}><Text style={styles.checkoutText}>{t('createInvoiceAction', language)}</Text></TouchableOpacity></View>

            <Modal visible={showCart} transparent animationType="slide" onRequestClose={() => setShowCart(false)}><View testID="pos-cart-modal" style={styles.modalOverlay}><View style={[styles.modalSheet, { backgroundColor: palette.surface }]}><SheetHeader title={t('cart', language)} onClose={() => setShowCart(false)} palette={palette} /><ScrollView contentContainerStyle={styles.cartList}>{cart.length ? cart.map((line) => <View key={line.id} style={[styles.cartLine, { borderBottomColor: palette.border }]}><View style={styles.cartLineCopy}><Text style={[styles.cartLineName, { color: palette.text }]}>{line.name}</Text><Text style={[styles.cartLinePrice, { color: palette.muted }]}>{formatCurrency(Number(line.unit_price || 0))} {t('each', language)}</Text></View><View style={styles.quantityControl}><TouchableOpacity accessibilityRole="button" accessibilityLabel={`${t('delete', language)} ${line.name}`} onPress={() => changeQuantity(line.id, -1)} style={styles.quantityButton}><Minus color={palette.text} size={15} /></TouchableOpacity><Text style={[styles.quantityText, { color: palette.text }]}>{line.quantity}</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel={`${t('add', language)} ${line.name}`} onPress={() => changeQuantity(line.id, 1)} style={styles.quantityButton}><Plus color={palette.text} size={15} /></TouchableOpacity></View><Text style={[styles.lineTotal, { color: palette.text }]}>{formatCurrency(Number(line.unit_price || 0) * line.quantity)}</Text></View>) : <Text style={[styles.emptyCartText, { color: palette.muted }]}>{t('emptyCart', language)}</Text>}</ScrollView><View style={styles.cartActions}><TouchableOpacity testID="pos-hold-order-button" accessibilityRole="button" accessibilityState={{ disabled: !cart.length }} disabled={!cart.length} onPress={holdOrder} style={[styles.holdButton, { borderColor: palette.border, opacity: cart.length ? 1 : 0.45 }]}><Text style={[styles.holdButtonText, { color: palette.text }]}>{t('holdOrder', language)}</Text></TouchableOpacity><TouchableOpacity testID="pos-choose-payment-button" accessibilityRole="button" accessibilityState={{ disabled: !cart.length }} disabled={!cart.length} onPress={() => setShowPayment(true)} style={[styles.modalCheckout, { backgroundColor: primaryColor, opacity: cart.length ? 1 : 0.45 }]}><Text style={styles.checkoutText}>{t('choosePayment', language)}</Text></TouchableOpacity></View></View></View></Modal>

            <Modal visible={showPayment} transparent animationType="slide" onRequestClose={() => setShowPayment(false)}><View testID="pos-payment-modal" style={styles.modalOverlay}><View style={[styles.modalSheet, { backgroundColor: palette.surface }]}><SheetHeader title={t('paymentType', language)} onClose={() => setShowPayment(false)} palette={palette} /><Text style={[styles.paymentHint, { color: palette.muted }]}>{t('paymentHint', language)}</Text><View style={styles.paymentGrid}>{([['cash', t('cash', language), Banknote, t('availableBelow', language)], ['card', t('card', language), CreditCard, t('cardPayment', language)], ['debt', t('balance', language), WalletCards, t('leaveOutstanding', language)], ['other', t('other', language), MoreHorizontal, t('chooseInReview', language)]] as const).map(([key, label, Icon, description]) => <TouchableOpacity testID={`pos-payment-${key}-button`} key={key} accessibilityRole="button" onPress={() => continueToInvoice(key)} style={[styles.paymentOption, { backgroundColor: palette.background, borderColor: palette.border }]}><View style={[styles.paymentIcon, { backgroundColor: palette.iconSurface }]}><Icon color={brand.colors.primary} size={20} /></View><View style={styles.paymentCopy}><Text style={[styles.paymentLabel, { color: palette.text }]}>{label}</Text><Text style={[styles.paymentDescription, { color: palette.muted }]}>{description}</Text></View></TouchableOpacity>)}</View></View></View></Modal>

            <Modal visible={showCustomers} transparent animationType="slide" onRequestClose={() => setShowCustomers(false)}><View testID="pos-customer-modal" style={styles.modalOverlay}><View style={[styles.modalSheet, { backgroundColor: palette.surface }]}><SheetHeader title={t('customer', language)} onClose={() => setShowCustomers(false)} palette={palette} /><TouchableOpacity testID="pos-walk-in-customer-button" accessibilityRole="button" onPress={() => { setSelectedCustomer(null); setShowCustomers(false); }} style={[styles.walkIn, { backgroundColor: palette.background, borderColor: palette.border }]}><UserRound color={brand.colors.primary} size={18} /><View style={styles.customerCopy}><Text style={[styles.customerName, { color: palette.text }]}>{t('walkInCustomer', language)}</Text><Text style={[styles.customerLabel, { color: palette.muted }]}>{t('customerOptional', language)}</Text></View></TouchableOpacity><SearchField autoFocus value={customerSearch} onChangeText={setCustomerSearch} placeholder={`${t('search', language)} ${t('clients', language).toLocaleLowerCase(language === 'sq' ? 'sq-XK' : 'en-US')}`} /><ScrollView contentContainerStyle={styles.customerList}>{customers.length ? filteredCustomers.map((customer) => <TouchableOpacity testID={`pos-customer-${customer.id}-button`} key={customer.id} accessibilityRole="button" onPress={() => { setSelectedCustomer(customer); setShowCustomers(false); }} style={[styles.customerOption, { borderBottomColor: palette.border }]}><View style={[styles.customerIcon, { backgroundColor: palette.iconSurface }]}><UserRound color={brand.colors.primary} size={16} /></View><View style={styles.customerCopy}><Text style={[styles.customerName, { color: palette.text }]}>{customer.name}</Text><Text style={[styles.customerLabel, { color: palette.muted }]}>{customer.email || customer.phone || t('noContactDetails', language)}</Text></View></TouchableOpacity>) : <Text style={[styles.emptyCartText, { color: palette.muted }]}>{t('noCustomersFound', language)}</Text>}</ScrollView></View></View></Modal>

            <Modal visible={showHeldOrders} transparent animationType="slide" onRequestClose={() => setShowHeldOrders(false)}><View style={styles.modalOverlay}><View style={[styles.modalSheet, { backgroundColor: palette.surface }]}><SheetHeader title={t('heldOrders', language)} onClose={() => setShowHeldOrders(false)} palette={palette} />{heldOrders.length ? heldOrders.map((order, index) => <TouchableOpacity key={index} accessibilityRole="button" onPress={() => restoreOrder(order)} style={[styles.heldOrder, { borderBottomColor: palette.border }]}><View><Text style={[styles.primaryText, { color: palette.text }]}>{t('heldOrder', language)} {index + 1}</Text><Text style={[styles.secondaryText, { color: palette.muted }]}>{order.reduce((sum, line) => sum + line.quantity, 0)} {t('items', language).toLocaleLowerCase(language === 'sq' ? 'sq-XK' : 'en-US')} · {formatCurrency(order.reduce((sum, line) => sum + Number(line.unit_price || 0) * line.quantity, 0))}</Text></View><Text style={[styles.restoreText, { color: primaryColor }]}>{t('restore', language)}</Text></TouchableOpacity>) : <View style={styles.noHeld}><Text style={[styles.noProductsTitle, { color: palette.text }]}>{t('noHeldOrders', language)}</Text><Text style={[styles.noProductsText, { color: palette.muted }]}>{t('holdCartDescription', language)}</Text></View>}</View></View></Modal>
        </MobileScreen>
    );
}

function PackageMark({ color }: { color: string }) {
    return <View style={{ width: 23, height: 21, borderWidth: 1.8, borderColor: color, borderRadius: 5, alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 13, height: 1.8, backgroundColor: color, transform: [{ rotate: '30deg' }] }} /></View>;
}

function ProductMedia({ imageUrl, name, backgroundColor, color, photoLabel }: { imageUrl: string; name: string; backgroundColor: string; color: string; photoLabel: string }) {
    const [imageFailed, setImageFailed] = useState(false);
    const serviceIcon = serviceIconNameFromValue(imageUrl);
    if (serviceIcon) {
        return <View style={[styles.productVisual, { backgroundColor, alignItems: 'center', justifyContent: 'center' }]}><SvgXml xml={serviceIconSvg(serviceIcon, color)} width="52" height="52" /></View>;
    }
    if (imageUrl && !imageFailed) {
        return <Image accessibilityLabel={`${name} ${photoLabel}`} source={{ uri: imageUrl }} onError={() => setImageFailed(true)} style={[styles.productVisual, { backgroundColor }]} resizeMode="cover" />;
    }
    return <View style={[styles.productVisual, { backgroundColor }]}><PackageMark color={color} /></View>;
}

function SheetHeader({ title, onClose, palette }: { title: string; onClose: () => void; palette: ReturnType<typeof getPalette> }) {
    const { language } = useTheme();
    return <View style={styles.sheetHeader}><Text style={[styles.sheetTitle, { color: palette.text }]}>{title}</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel={`${t('close', language)} ${title}`} onPress={onClose} style={mobileStyles.iconButton}><X color={palette.text} size={19} /></TouchableOpacity></View>;
}

const styles = StyleSheet.create({
    body: { flex: 1, minHeight: 0, paddingHorizontal: 20 },
    inlineScanButton: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    heldButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 2 },
    customerPicker: { minHeight: 58, borderWidth: 1, borderRadius: 16, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 10, marginBottom: 10 },
    customerIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    customerCopy: { flex: 1 },
    customerLabel: { fontSize: 10, fontFamily: brand.fonts.medium },
    customerName: { fontSize: 13, fontFamily: brand.fonts.semibold, marginTop: 3 },
    categoryScroll: { height: 52, flexGrow: 0, marginTop: 8, marginBottom: 18 },
    categoryScroller: { gap: 7, paddingVertical: 8, alignItems: 'center' },
    listHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 0, marginBottom: 12 },
    listHint: { fontSize: 11, lineHeight: 16, fontFamily: brand.fonts.medium },
    categoryChip: { height: 36, minHeight: 36, alignSelf: 'flex-start', paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, justifyContent: 'center' },
    categoryText: { fontSize: 11, fontFamily: brand.fonts.medium },
    productListView: { flex: 1, minHeight: 0 },
    productList: { paddingBottom: 16 },
    emptyList: { flexGrow: 1 },
    productColumns: { gap: 9 },
    productCard: { flex: 1, minHeight: 170, maxWidth: '50%', borderWidth: 1, borderRadius: 17, padding: 13, marginBottom: 9 },
    productVisual: { width: 64, height: 64, alignSelf: 'flex-start', borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 11 },
    productName: { fontSize: 13, lineHeight: 18, fontFamily: brand.fonts.semibold, minHeight: 36 },
    productCategory: { fontSize: 10, fontFamily: brand.fonts.regular, marginTop: 4 },
    productBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 11 },
    productPrice: { fontSize: 13, fontFamily: brand.fonts.semibold },
    addCircle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    stockNote: { fontSize: 9, fontFamily: brand.fonts.regular, marginTop: 7 },
    noProducts: { alignItems: 'center', justifyContent: 'center', paddingVertical: 64, paddingHorizontal: 24 },
    noProductsTitle: { fontSize: 16, fontFamily: brand.fonts.semibold, marginTop: 12, textAlign: 'center' },
    noProductsText: { fontSize: 12, lineHeight: 18, fontFamily: brand.fonts.regular, marginTop: 5, textAlign: 'center' },
    cartBar: { minHeight: 76, borderTopWidth: 1, paddingHorizontal: 20, paddingBottom: 9, paddingTop: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    cartSummary: { flexDirection: 'row', alignItems: 'center', gap: 9, flex: 1 },
    cartIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    cartLabel: { fontSize: 10, fontFamily: brand.fonts.medium },
    cartTotal: { fontSize: 16, fontFamily: brand.fonts.semibold, marginTop: 2 },
    checkoutButton: { minHeight: 48, paddingHorizontal: 19, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    checkoutText: { color: '#fff', fontSize: 13, fontFamily: brand.fonts.semibold },
    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(7,20,42,0.4)' },
    modalSheet: { maxHeight: '82%', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 28 },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 },
    sheetTitle: { fontSize: 20, fontFamily: brand.fonts.semibold },
    cartList: { paddingBottom: 4 },
    cartLine: { minHeight: 70, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
    cartLineCopy: { flex: 1 },
    cartLineName: { fontSize: 13, fontFamily: brand.fonts.semibold },
    cartLinePrice: { fontSize: 10, fontFamily: brand.fonts.regular, marginTop: 3 },
    quantityControl: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    quantityButton: { width: 30, height: 30, borderRadius: 10, backgroundColor: 'rgba(148,163,184,0.12)', alignItems: 'center', justifyContent: 'center' },
    quantityText: { minWidth: 16, textAlign: 'center', fontSize: 13, fontFamily: brand.fonts.semibold },
    lineTotal: { width: 67, textAlign: 'right', fontSize: 12, fontFamily: brand.fonts.semibold },
    emptyCartText: { fontSize: 13, fontFamily: brand.fonts.regular, textAlign: 'center', paddingVertical: 28 },
    cartActions: { flexDirection: 'row', gap: 9, marginTop: 14 },
    holdButton: { flex: 1, minHeight: 50, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    holdButtonText: { fontSize: 12, fontFamily: brand.fonts.semibold },
    modalCheckout: { flex: 1.5, minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    paymentHint: { fontSize: 12, lineHeight: 18, fontFamily: brand.fonts.regular, marginBottom: 14 },
    paymentGrid: { gap: 9 },
    paymentOption: { minHeight: 66, borderWidth: 1, borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11 },
    paymentIcon: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    paymentCopy: { flex: 1 },
    paymentLabel: { fontSize: 14, fontFamily: brand.fonts.semibold },
    paymentDescription: { fontSize: 10, fontFamily: brand.fonts.regular, marginTop: 3 },
    walkIn: { minHeight: 57, borderWidth: 1, borderRadius: 15, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    customerList: { paddingTop: 10, paddingBottom: 15 },
    customerOption: { minHeight: 58, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
    heldOrder: { minHeight: 66, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    restoreText: { fontSize: 12, fontFamily: brand.fonts.semibold },
    noHeld: { alignItems: 'center', paddingVertical: 35 },
    primaryText: { fontSize: 13, fontFamily: brand.fonts.semibold },
    secondaryText: { fontSize: 11, fontFamily: brand.fonts.regular, marginTop: 3 },
});
