import React, { useCallback, useState } from 'react';
import { Alert, Image, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Barcode, Box, Edit3, FileText, Package, Tag } from 'lucide-react-native';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { formatCurrency, getLocalizedErrorMessage, t } from '@invoice-monorepo/i18n';
import { supabase } from '@invoice-monorepo/api';
import { brand, getPalette } from '../../theme/brand';
import { getActiveProductCompanyIds, getWorkspaceScope } from '../../services/workspace';
import { getProduct } from '@invoice-monorepo/api/repositories';
import { serviceIconNameFromValue, serviceIconSvg } from '@invoice-monorepo/invoice-template';
import type { RootStackParamList } from '../../navigation/types';
import { ErrorState, LoadingState, MobileHeader, MobileScreen } from '../../components/mobile/MobileUI';

export function ProductDetailScreen() {
    const { user } = useAuth();
    const { isDark, language } = useTheme();
    const palette = getPalette(isDark);
    const route = useRoute<any>();
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const productId = route.params?.productId as string;
    const [product, setProduct] = useState<Record<string, any> | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [canManageProducts, setCanManageProducts] = useState(false);

    const fetchProduct = useCallback(async () => {
        if (!user || !productId) return;
        setError(null);
        try {
            const workspaceScope = await getWorkspaceScope(user.id);
            setCanManageProducts(['super_administrator', 'company_administrator', 'manager'].includes(workspaceScope.roleCode));
            const companyIds = getActiveProductCompanyIds(workspaceScope);
            const result = await getProduct(supabase, productId, { userId: user.id, companyIds });
            if (!result) throw new Error('Product not found.');
            setProduct(result as Record<string, any>);
        } catch (fetchError: any) {
            console.error('Product detail error:', fetchError);
            setError(getLocalizedErrorMessage(fetchError, language, 'unableToLoad'));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [productId, user]);

    useFocusEffect(useCallback(() => { void fetchProduct(); }, [fetchProduct]));

    return (
        <MobileScreen testID="product-detail-screen">
            <MobileHeader title={product?.name || t('product', language)} subtitle={t('productDetail', language)} onBack={() => navigation.goBack()} right={canManageProducts ? <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('editProduct', language)} onPress={() => navigation.navigate('ProductForm', { productId })}><Edit3 color={brand.colors.primary} size={19} /></TouchableOpacity> : null} />
            {loading ? <LoadingState label={t('loadingSection', language).replace('{section}', t('product', language))} /> : error ? <ErrorState onRetry={() => { setLoading(true); void fetchProduct(); }} message={error} /> : product ? <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void fetchProduct(); }} tintColor={brand.colors.primary} />}>
                <View style={[styles.hero, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                    {serviceIconNameFromValue(product.image_url) ? <View style={[styles.heroIcon, { backgroundColor: palette.iconSurface }]}><SvgXml xml={serviceIconSvg(serviceIconNameFromValue(product.image_url)!, brand.colors.primary)} width="34" height="34" /></View> : product.image_url ? <Image accessibilityLabel={`${product.name} ${t('productPhoto', language)}`} source={{ uri: String(product.image_url) }} style={styles.heroImage} resizeMode="cover" /> : <View style={[styles.heroIcon, { backgroundColor: palette.iconSurface }]}><Package color={brand.colors.primary} size={25} /></View>}
                    <Text style={[styles.name, { color: palette.text }]}>{product.name}</Text>
                    <Text style={[styles.category, { color: palette.muted }]}>{product.category || t('uncategorized', language)}</Text>
                    <Text style={[styles.price, { color: brand.colors.primary }]}>{formatCurrency(Number(product.unit_price || 0))}</Text>
                </View>
                <View style={styles.actionsRow}><TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate('MainTabs', { screen: 'POS', params: { productId } })} style={[styles.actionButton, { backgroundColor: brand.colors.primary }]}><FileText color="#fff" size={18} /><Text style={styles.actionText}>{t('createInvoice', language)}</Text></TouchableOpacity>{canManageProducts ? <TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate('ProductForm', { productId })} style={[styles.actionButton, { backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1 }]}><Edit3 color={brand.colors.primary} size={18} /><Text style={[styles.actionText, { color: palette.text }]}>{t('edit', language)}</Text></TouchableOpacity> : null}</View>
                <View style={[styles.detailsCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                    <Text style={[styles.sectionTitle, { color: palette.text }]}>{t('details', language)}</Text>
                    <View style={styles.detailRow}><Tag color={palette.muted} size={17} /><Text style={[styles.detailLabel, { color: palette.muted }]}>{t('category', language)}</Text><Text style={[styles.detailValue, { color: palette.text }]}>{product.category || '—'}</Text></View>
                    <View style={styles.detailRow}><CircleIcon color={palette.muted} /><Text style={[styles.detailLabel, { color: palette.muted }]}>{t('vatTaxRate', language)}</Text><Text style={[styles.detailValue, { color: palette.text }]}>{product.tax_rate ? `${product.tax_rate}%` : t('notSet', language)}</Text></View>
                    <View style={styles.detailRow}><Box color={palette.muted} size={17} /><Text style={[styles.detailLabel, { color: palette.muted }]}>{t('currentStock', language)}</Text><Text style={[styles.detailValue, { color: product.track_stock && Number(product.stock_quantity || 0) <= Number(product.low_stock_threshold || 5) ? brand.colors.warning : palette.text }]}>{product.track_stock ? `${Number(product.stock_quantity || 0)} ${product.unit || 'pcs'}` : t('notTracked', language)}</Text></View>
                    <View style={styles.detailRow}><Barcode color={palette.muted} size={17} /><Text style={[styles.detailLabel, { color: palette.muted }]}>{t('skuBarcode', language)}</Text><Text style={[styles.detailValue, { color: palette.text }]} numberOfLines={1}>{product.sku || product.barcode || '—'}</Text></View>
                </View>
                {product.track_stock ? <View style={[styles.notice, { backgroundColor: palette.surface, borderColor: palette.border }]}><Box color={brand.colors.warning} size={18} /><Text style={[styles.noticeText, { color: palette.muted }]}>{t('stockTrackingNotice', language)}</Text></View> : <View style={[styles.notice, { backgroundColor: palette.surface, borderColor: palette.border }]}><Box color={palette.muted} size={18} /><Text style={[styles.noticeText, { color: palette.muted }]}>{t('productNotStockTracked', language)}</Text></View>}
                <View style={{ height: 30 }} />
            </ScrollView> : null}
        </MobileScreen>
    );
}

function CircleIcon({ color }: { color: string }) {
    return <View style={{ width: 17, height: 17, borderRadius: 9, borderWidth: 1.7, borderColor: color, alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: color }} /></View>;
}

const styles = StyleSheet.create({
    content: { paddingHorizontal: 20, paddingBottom: 24 },
    hero: { borderRadius: 20, borderWidth: 1, padding: 19 },
    heroImage: { width: 86, height: 86, borderRadius: 20, marginBottom: 14 },
    heroIcon: { width: 52, height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
    name: { fontSize: 21, fontFamily: brand.fonts.semibold },
    category: { fontSize: 12, fontFamily: brand.fonts.regular, marginTop: 4 },
    price: { fontSize: 27, fontFamily: brand.fonts.semibold, marginTop: 17 },
    actionsRow: { flexDirection: 'row', gap: 9, marginTop: 12 },
    actionButton: { flex: 1, minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
    actionText: { color: '#fff', fontSize: 13, fontFamily: brand.fonts.semibold },
    detailsCard: { borderRadius: 19, borderWidth: 1, padding: 17, marginTop: 18 },
    sectionTitle: { fontSize: 17, fontFamily: brand.fonts.semibold, marginBottom: 8 },
    detailRow: { minHeight: 45, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: 1, borderBottomColor: 'rgba(148,163,184,0.16)' },
    detailLabel: { flex: 1, fontSize: 12, fontFamily: brand.fonts.regular },
    detailValue: { maxWidth: '45%', fontSize: 12, fontFamily: brand.fonts.semibold, textAlign: 'right' },
    notice: { borderRadius: 16, borderWidth: 1, padding: 14, flexDirection: 'row', gap: 9, alignItems: 'flex-start', marginTop: 12 },
    noticeText: { flex: 1, fontSize: 11, lineHeight: 17, fontFamily: brand.fonts.regular },
});
