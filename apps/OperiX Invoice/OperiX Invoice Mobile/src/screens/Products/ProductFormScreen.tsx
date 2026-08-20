import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    Image,
    ScrollView,
    TouchableOpacity,
    Alert,
    StyleSheet,
    Switch,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { SvgXml } from 'react-native-svg';
import { ArrowLeft, Package, DollarSign, Percent, Tag, Box, Scan, ChevronDown, ChevronUp, Trash2, Image as ImageIcon } from 'lucide-react-native';
import { supabase } from '@invoice-monorepo/api';
import { useAuth } from '@invoice-monorepo/hooks';
import { useTheme } from '@invoice-monorepo/hooks';
import { Card, Button, Input } from '@invoice-monorepo/ui';
import { getLocalizedErrorMessage, t, type TranslationKey } from '@invoice-monorepo/i18n';
import { SERVICE_ICON_OPTIONS, serviceIconNameFromValue, serviceIconSvg } from '@invoice-monorepo/invoice-template';
import { getActiveProductCompanyIds, getWorkspaceScope } from '../../services/workspace';
import { deleteProduct, getProduct, saveProduct } from '@invoice-monorepo/api/repositories';
import * as Crypto from 'expo-crypto';

interface ProductFormScreenProps {
    navigation: any;
    route: any;
}

const units = ['pcs', 'hrs', 'kg', 'lbs', 'mt', 'ft', 'l', 'gal', 'unit'];
const defaultCategories = ['Service', 'Product', 'Subscription', 'Consulting'];
const PRODUCT_IMAGES_BUCKET = 'product-images';
const PRODUCT_IMAGE_MAX_BYTES = 4.5 * 1024 * 1024;
const PRODUCT_IMAGE_MAX_DIMENSION = 1600;

function isRemoteImageUrl(value: string) {
    return /^(https?:|data:)/i.test(value);
}

async function prepareProductImage(uri: string) {
    const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: PRODUCT_IMAGE_MAX_DIMENSION } }],
        { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG },
    );

    const response = await fetch(result.uri);
    if (!response.ok) throw new Error('Unable to read the prepared product image.');
    let fileBuffer = await response.arrayBuffer();

    // A noisy photo can still exceed the Storage bucket limit after the first pass.
    if (fileBuffer.byteLength > PRODUCT_IMAGE_MAX_BYTES) {
        const fallback = await ImageManipulator.manipulateAsync(
            result.uri,
            [],
            { compress: 0.45, format: ImageManipulator.SaveFormat.JPEG },
        );
        const fallbackResponse = await fetch(fallback.uri);
        if (!fallbackResponse.ok) throw new Error('Unable to read the compressed product image.');
        fileBuffer = await fallbackResponse.arrayBuffer();
    }

    if (fileBuffer.byteLength > PRODUCT_IMAGE_MAX_BYTES) {
        throw new Error('Product image is too large. Please choose a smaller photo.');
    }

    return { fileBuffer, contentType: 'image/jpeg' };
}

function isMissingProductDeleteRpc(error: unknown) {
    return Boolean(error && typeof error === 'object' && 'code' in error && String((error as { code?: unknown }).code) === 'PGRST202');
}

export function ProductFormScreen({ navigation, route }: ProductFormScreenProps) {
    const { user } = useAuth();
    const { isDark, language, primaryColor } = useTheme();
    const productId = route.params?.productId;
    const isEditing = !!productId;

    const [formData, setFormData] = useState({
        name: '',
        description: '',
        image_url: '',
        sku: '',
        unit_price: 0,
        tax_rate: 0,
        tax_included: false,
        unit: 'pcs',
        category: '',
        stock_quantity: 0,
        track_stock: false,
        low_stock_threshold: 5,
        purchase_currency: 'EUR',
        exchange_rate: 1,
        supplier_unit_price: 0,
        supplier_discount_percent: 0,
        supplier_unit_price_after_discount: 0,
        transport_cost: 0,
        additional_cost: 0,
        customs_base: 0,
        customs_duty: 0,
        excise: 0,
        import_vat_rate: 18,
        import_vat_amount: 0,
        unit_cost_with_vat: 0,
        tariff_code: '',
        country_of_origin: '',
        vat_treatment: 'standard_18',
    });
    const [loading, setLoading] = useState(false);
    const [showUnits, setShowUnits] = useState(false);
    const [showCategories, setShowCategories] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [majorPrice, setMajorPrice] = useState('0');
    const [minorPrice, setMinorPrice] = useState('00');
    const [taxRateInput, setTaxRateInput] = useState('');
    const [importVatRateInput, setImportVatRateInput] = useState('18');
    // Keep the form interactive while the workspace permission check is loading.
    // handleSave performs the authoritative permission check before writing.
    const [canManageProducts, setCanManageProducts] = useState(true);
    const saveInFlight = useRef(false);

    const bgColor = isDark ? '#0D1B2A' : '#F7F9FC';
    const textColor = isDark ? '#fff' : '#111827';
    const mutedColor = isDark ? '#98A2B3' : '#667085';
    const cardBg = isDark ? '#14243A' : '#ffffff';
    const inputBg = isDark ? '#0D1B2A' : '#F4F7FB';
    const categoryLabels: Record<string, string> = {
        Service: t('serviceCategory', language),
        Product: t('productCategory', language),
        Subscription: t('subscriptionCategory', language),
        Consulting: t('consultingCategory', language),
    };

    useEffect(() => {
        void loadProductAccess();
        if (isEditing) fetchProduct();
    }, [productId, user?.id]);

    const loadProductAccess = async () => {
        if (!user) return;
        try {
            const workspaceScope = await getWorkspaceScope(user.id);
            setCanManageProducts(['super_administrator', 'company_administrator', 'manager'].includes(workspaceScope.roleCode));
        } catch {
            setCanManageProducts(false);
        }
    };

    useEffect(() => {
        if (route.params?.scannedSKU) {
            setFormData(prev => ({
                ...(route.params?.restoredData || prev), // Restore if passed, else keep prev
                sku: route.params.scannedSKU
            }));

            // Clear params
            navigation.setParams({ scannedSKU: undefined, restoredData: undefined });
        }
    }, [route.params?.scannedSKU]);

    const fetchProduct = async () => {
        if (!user) return;
        const workspaceScope = await getWorkspaceScope(user.id);
        setCanManageProducts(['super_administrator', 'company_administrator', 'manager'].includes(workspaceScope.roleCode));
        const companyIds = getActiveProductCompanyIds(workspaceScope);
        const data = await getProduct(supabase, productId, { userId: user.id, companyIds });
        if (data) {
            const product = data as unknown as Record<string, unknown>;
            const price = Number(product.unit_price) || 0;
            const parts = price.toFixed(2).split('.');

            setMajorPrice(parts[0]);
            setMinorPrice(parts[1] === '00' ? '' : parts[1]);

            const taxRate = Number(product.tax_rate) || 0;
            const importVatRate = Number(product.import_vat_rate) || 0;
            setTaxRateInput(product.tax_rate === null || product.tax_rate === undefined ? '' : String(product.tax_rate));
            setImportVatRateInput(product.import_vat_rate === null || product.import_vat_rate === undefined ? '' : String(product.import_vat_rate));
            setFormData({
                name: String(product.name || ''),
                description: String(product.description || ''),
                image_url: String(product.image_url || ''),
                sku: String(product.sku || ''),
                unit_price: price,
                tax_rate: taxRate,
                tax_included: Boolean(product.tax_included),
                unit: String(product.unit || 'pcs'),
                category: String(product.category || ''),
                stock_quantity: Number(product.stock_quantity) || 0,
                track_stock: Boolean(product.track_stock),
                low_stock_threshold: Number(product.low_stock_threshold) || 5,
                purchase_currency: String(product.purchase_currency || 'EUR'),
                exchange_rate: Number(product.exchange_rate) || 1,
                supplier_unit_price: Number(product.supplier_unit_price) || 0,
                supplier_discount_percent: Number(product.supplier_discount_percent) || 0,
                supplier_unit_price_after_discount: Number(product.supplier_unit_price_after_discount) || 0,
                transport_cost: Number(product.transport_cost) || 0,
                additional_cost: Number(product.additional_cost) || 0,
                customs_base: Number(product.customs_base) || 0,
                customs_duty: Number(product.customs_duty) || 0,
                excise: Number(product.excise) || 0,
                import_vat_rate: importVatRate,
                import_vat_amount: Number(product.import_vat_amount) || 0,
                unit_cost_with_vat: Number(product.unit_cost_with_vat) || 0,
                tariff_code: String(product.tariff_code || ''),
                country_of_origin: String(product.country_of_origin || ''),
                vat_treatment: String(product.vat_treatment || 'standard_18'),
            });
        }
    };

    const updateUnitPrice = (major: string, minor: string) => {
        const majorVal = parseInt(major.replace(/\D/g, '')) || 0;
        const minorVal = parseInt(minor.replace(/\D/g, '')) || 0;

        let total = majorVal;
        if (minor.length > 0) {
            // Treat minor as decimal part: "5" -> 0.5, "05" -> 0.05
            total += minorVal / Math.pow(10, minor.length);
        }

        setFormData(prev => ({ ...prev, unit_price: total }));
    };

    const pickProductImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.7,
        });

        const asset = result.canceled ? null : result.assets[0];
        if (!asset?.uri) return;
        setFormData((current) => ({ ...current, image_url: asset.uri }));
    };

    const handleScan = () => {
        navigation.navigate('QRScanner', {
            mode: 'generic',
            returnTo: 'ProductForm',
            currentData: formData // Pass current state to preserve it
        });
    };

    const handleSave = async () => {
        if (saveInFlight.current) return;
        if (!formData.name) {
            Alert.alert(t('error', language), t('nameRequiredProduct', language));
            return;
        }

        saveInFlight.current = true;
        setLoading(true);

        try {
            if (!user) throw new Error(t('signInToCreateProduct', language));
            const workspaceScope = await getWorkspaceScope(user.id);
            if (!['super_administrator', 'company_administrator', 'manager'].includes(workspaceScope.roleCode)) {
                throw new Error('Only Super admin, Admin, or Manager can manage products.');
            }
            setCanManageProducts(true);
            const { company } = workspaceScope;
            let imageUrl = formData.image_url;
            if (imageUrl && !isRemoteImageUrl(imageUrl) && !serviceIconNameFromValue(imageUrl)) {
                const { fileBuffer, contentType } = await prepareProductImage(imageUrl);
                const fileExtension = 'jpeg';
                const storagePath = company
                    ? `company/${company.id}/${user.id}/${Crypto.randomUUID()}.${fileExtension}`
                    : `user/${user.id}/${Crypto.randomUUID()}.${fileExtension}`;
                const { error: uploadError } = await supabase.storage
                    .from(PRODUCT_IMAGES_BUCKET)
                    .upload(storagePath, fileBuffer, {
                        contentType,
                        cacheControl: '31536000',
                        upsert: false,
                    });
                if (uploadError) throw uploadError;
                imageUrl = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(storagePath).data.publicUrl;
            }
            await saveProduct(supabase, { ...formData, image_url: imageUrl, user_id: user.id, company_id: company?.id ?? null }, isEditing ? productId : null);
            setLoading(false);
            navigation.goBack();
        } catch (error) {
            setLoading(false);
            console.error('Error saving product:', error);
            Alert.alert(t('error', language), `${t('productSavedError', language)}: ${getLocalizedErrorMessage(error, language, 'productSavedError')}`);
        } finally {
            saveInFlight.current = false;
        }
    };

    const handleDelete = () => {
        if (!isEditing || loading) return;
        Alert.alert(t('deleteProduct', language), t('deleteProductConfirmation', language), [
            { text: t('cancel', language), style: 'cancel' },
            {
                text: t('delete', language),
                style: 'destructive',
                onPress: async () => {
                    if (!user) return;
                    setLoading(true);
                    try {
                        const { companyId } = await getWorkspaceScope(user.id);
                        await deleteProduct(supabase, productId, companyId, user.id);
                        setLoading(false);
                        Alert.alert(
                            t('success', language),
                            t('productDeletedSuccessfully', language),
                            [{ text: t('done', language), onPress: () => navigation.navigate('ProductsList') }],
                        );
                    } catch (error) {
                        setLoading(false);
                        const missingRpc = isMissingProductDeleteRpc(error);
                        if (!missingRpc) console.error('Error deleting product:', error);
                        Alert.alert(t('error', language), missingRpc ? t('productDeleteDatabaseUpdateRequired', language) : getLocalizedErrorMessage(error, language, 'productDeletedError'));
                    }
                },
            },
        ]);
    };

    return (
        <KeyboardAvoidingView
            testID="product-form-screen"
            style={[styles.container, { backgroundColor: bgColor }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={0}
        >
            <View style={styles.header}>
                <TouchableOpacity testID="product-form-back-button" accessibilityRole="button" onPress={() => navigation.goBack()} style={styles.backButton}>
                    <ArrowLeft color={textColor} size={24} />
                </TouchableOpacity>
                <View>
                    <Text style={[styles.subtitle, { color: mutedColor }]}>{isEditing ? t('updateItem', language) : t('newItem', language)}</Text>
                    <Text style={[styles.title, { color: textColor }]}>{t('productDetailsTitle', language)}</Text>
                </View>
            </View>

            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="always" keyboardDismissMode="none">
                {/* Basic Info */}
                <View style={[styles.section, { backgroundColor: cardBg }]}>
                    <View style={styles.sectionHeader}>
                        <Package color="#004FFE" size={20} />
                        <Text style={[styles.sectionTitle, { color: textColor }]}>{t('productInformation', language)}</Text>
                    </View>
                    <Input testID="product-name-input" label={`${t('name', language)} *`} value={formData.name} onChangeText={(text) => setFormData((current) => ({ ...current, name: text }))} placeholder={t('productOrServiceName', language)} />
                    <Input label={t('description', language)} value={formData.description} onChangeText={(text) => setFormData((current) => ({ ...current, description: text }))} placeholder={t('detailedDescription', language)} multiline numberOfLines={3} />

                    <View style={[styles.imageField, { borderColor: isDark ? '#263A55' : '#E4E9F0', backgroundColor: inputBg }]}>
                        {formData.image_url ? (
                            serviceIconNameFromValue(formData.image_url) ? (
                                <View style={[styles.imagePreview, styles.serviceIconPreview, { backgroundColor: isDark ? '#263A55' : '#EDF4FF' }]}>
                                    <SvgXml xml={serviceIconSvg(serviceIconNameFromValue(formData.image_url)!, primaryColor)} width="54" height="54" />
                                </View>
                            ) : <Image accessibilityLabel={t('productPhoto', language)} source={{ uri: formData.image_url }} style={styles.imagePreview} resizeMode="cover" />
                        ) : (
                            <View style={[styles.imagePlaceholder, { backgroundColor: isDark ? '#263A55' : '#EDF4FF' }]}>
                                <ImageIcon color="#004FFE" size={25} />
                            </View>
                        )}
                        <View style={styles.imageCopy}>
                            <Text style={[styles.fieldLabel, { color: textColor }]}>{t('productPhoto', language)}</Text>
                            <Text style={[styles.imageHint, { color: mutedColor }]}>{t('pickFromGallery', language)}</Text>
                            <View style={styles.imageActions}>
                                <TouchableOpacity testID="product-image-picker-button" accessibilityRole="button" onPress={() => { void pickProductImage(); }} style={[styles.imageAction, { backgroundColor: '#004FFE' }]}>
                                    <Text style={styles.imageActionText}>{formData.image_url ? t('changePhoto', language) : t('pickFromGallery', language)}</Text>
                                </TouchableOpacity>
                                {formData.image_url ? <TouchableOpacity testID="product-image-remove-button" accessibilityRole="button" onPress={() => setFormData((current) => ({ ...current, image_url: '' }))} style={styles.imageRemoveAction}>
                                    <Text style={styles.imageRemoveText}>{t('delete', language)}</Text>
                                </TouchableOpacity> : null}
                            </View>
                        </View>
                    </View>

                    <View style={styles.serviceIconSection}>
                        <Text style={[styles.fieldLabel, { color: textColor }]}>{t('serviceIcon', language)}</Text>
                        <Text style={[styles.imageHint, { color: mutedColor }]}>{t('serviceIconDescription', language)}</Text>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.serviceIconCarousel}
                            keyboardShouldPersistTaps="handled"
                        >
                            {SERVICE_ICON_OPTIONS.map((option) => {
                                const selected = serviceIconNameFromValue(formData.image_url) === option.name;
                                return (
                                    <TouchableOpacity
                                        key={option.name}
                                        testID={`product-service-icon-${option.name}-button`}
                                        accessibilityRole="button"
                                        accessibilityLabel={t(option.labelKey as TranslationKey, language)}
                                        accessibilityState={{ selected }}
                                        onPress={() => setFormData((current) => ({ ...current, image_url: `icon:${option.name}` }))}
                                        style={[styles.serviceIconOption, { backgroundColor: selected ? `${primaryColor}18` : inputBg, borderColor: selected ? primaryColor : (isDark ? '#263A55' : '#E4E9F0') }]}
                                    >
                                        <SvgXml xml={serviceIconSvg(option.name, selected ? primaryColor : mutedColor)} width="25" height="25" />
                                        <Text style={[styles.serviceIconLabel, { color: selected ? primaryColor : mutedColor }]} numberOfLines={1}>{t(option.labelKey as TranslationKey, language)}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>

                    <View style={styles.row}>
                        <View style={{ flex: 1 }}>
                            <Input
                                testID="product-sku-input"
                                label={t('skuCode', language)}
                                value={formData.sku}
                                        onChangeText={(text) => setFormData((current) => ({ ...current, sku: text }))}
                                placeholder={t('skuCodeOptional', language)}
                            />
                        </View>
                        <TouchableOpacity
                            testID="product-scan-button"
                            accessibilityRole="button"
                            style={[styles.scanIconBtn, { backgroundColor: inputBg }]}
                            onPress={handleScan}
                        >
                            <Scan color={textColor} size={24} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Pricing & Units */}
                <View style={[styles.section, { backgroundColor: cardBg }]}>
                    <View style={styles.sectionHeader}>
                        <DollarSign color="#f59e0b" size={20} />
                        <Text style={[styles.sectionTitle, { color: textColor }]}>{t('pricingQuantity', language)}</Text>
                    </View>

                    <View style={styles.row}>
                        <View style={{ flex: 2 }}>
                            <Text style={[styles.fieldLabel, { color: textColor }]}>{t('priceNet', language)}</Text>
                            <View style={styles.priceGrid}>
                                <Input
                                    testID="product-price-major-input"
                                    value={majorPrice}
                                    onChangeText={(text) => {
                                        const clean = text.replace(/\D/g, '');
                                        setMajorPrice(clean);
                                        updateUnitPrice(clean, minorPrice);
                                    }}
                                    placeholder="0"
                                    keyboardType="number-pad"
                                    containerStyle={{ flex: 2, marginBottom: 0 }}
                                />
                                <View style={styles.decimalSeparator}>
                                    <Text style={{ color: textColor, fontWeight: '600', fontSize: 20 }}>.</Text>
                                </View>
                                <Input
                                    testID="product-price-minor-input"
                                    value={minorPrice}
                                    onChangeText={(text) => {
                                        const clean = text.replace(/\D/g, '').slice(0, 2);
                                        setMinorPrice(clean);
                                        updateUnitPrice(majorPrice, clean);
                                    }}
                                    placeholder="00"
                                    keyboardType="number-pad"
                                    containerStyle={{ flex: 1, marginBottom: 0 }}
                                    maxLength={2}
                                />
                            </View>
                        </View>

                        {/* Display Gross Price */}
                        <View style={{ flex: 2 }}>
                            <Text style={[styles.fieldLabel, { color: textColor }]}>{t('finalPriceIncludingTax', language)}</Text>
                            <View style={[styles.priceGrid, { backgroundColor: inputBg, borderRadius: 7, paddingHorizontal: 12, height: 50 }]}>
                                <Text style={{ fontSize: 16, fontWeight: '600', color: '#12B76A' }}>
                                    {(formData.tax_included
                                        ? (formData.unit_price || 0)
                                        : (formData.unit_price || 0) * (1 + (formData.tax_rate || 0) / 100)
                                    ).toFixed(2)}
                                </Text>
                            </View>
                        </View>
                    </View>

                    <View style={{ marginTop: 16 }}>
                        <Text style={[styles.fieldLabel, { color: textColor }]}>{t('unit', language)}</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                            {units.map((unit) => (
                                <TouchableOpacity
                                    key={unit}
                                    style={[
                                        styles.option,
                                        { backgroundColor: inputBg, paddingVertical: 8, paddingHorizontal: 16 },
                                        formData.unit === unit && styles.optionActive
                                    ]}
                                    onPress={() => setFormData({ ...formData, unit })}
                                >
                                    <Text style={[styles.optionText, formData.unit === unit && styles.optionTextActive, { fontSize: 13 }]}>
                                        {unit}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </View>

                {/* Stock Management */}
                <View style={[styles.section, { backgroundColor: cardBg }]}>
                    <View style={styles.sectionHeader}>
                        <Box color="#12B76A" size={20} />
                        <Text style={[styles.sectionTitle, { color: textColor }]}>{t('inventoryControl', language)}</Text>
                        <Switch
                            testID="product-track-stock-switch"
                            value={formData.track_stock}
                            onValueChange={(val) => setFormData((current) => ({ ...current, track_stock: val }))}
                            trackColor={{ false: '#263A55', true: '#004FFE' }}
                        />
                    </View>

                    {formData.track_stock && (
                        <>
                            <View style={styles.row}>
                                <View style={styles.flex1}>
                                    <Input testID="product-stock-input" label={t('currentStock', language)} value={String(formData.stock_quantity)} onChangeText={(text) => setFormData((current) => ({ ...current, stock_quantity: Number(text) || 0 }))} placeholder="0" keyboardType="number-pad" />
                                </View>
                                <View style={styles.flex1}>
                                    <Input label={t('lowStockAlert', language)} value={String(formData.low_stock_threshold)} onChangeText={(text) => setFormData((current) => ({ ...current, low_stock_threshold: Number(text) || 0 }))} placeholder="5" keyboardType="number-pad" />
                                </View>
                            </View>
                            <Text style={[styles.hintText, { color: mutedColor }]}>
                                {t('stockThresholdDescription', language)}
                            </Text>
                        </>
                    )}
                </View>

                {/* Category */}
                <View style={[styles.section, { backgroundColor: cardBg }]}>
                    <View style={styles.sectionHeader}>
                        <Tag color="#12B76A" size={20} />
                        <Text style={[styles.sectionTitle, { color: textColor }]}>{t('classification', language)}</Text>
                    </View>

                    {!showCategories && (
                        <View style={{ marginBottom: 16 }}>
                            <Input
                                label={t('customCategory', language)}
                                value={formData.category}
                                onChangeText={(text) => setFormData((current) => ({ ...current, category: text }))}
                                placeholder={t('typeOrSelectBelow', language)}
                            />
                        </View>
                    )}

                    <TouchableOpacity style={[styles.picker, { backgroundColor: inputBg }]} onPress={() => setShowCategories(!showCategories)}>
                        <Text style={formData.category ? { color: textColor } : { color: mutedColor }}>
                            {formData.category || t('selectFromList', language)}
                        </Text>
                    </TouchableOpacity>
                    {showCategories && (
                        <View style={styles.optionGrid}>
                            {defaultCategories.map((cat) => (
                                <TouchableOpacity
                                    key={cat}
                                    style={[styles.option, { backgroundColor: inputBg }, formData.category === cat && styles.optionActive]}
                                    onPress={() => { setFormData({ ...formData, category: cat }); setShowCategories(false); }}
                                >
                                    <Text style={[styles.optionText, formData.category === cat && styles.optionTextActive]}>{categoryLabels[cat] || cat}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                </View>

                {/* Tax */}
                <View style={[styles.section, { backgroundColor: cardBg }]}>
                    <View style={styles.sectionHeader}>
                        <Percent color="#06B6D4" size={20} />
                        <Text style={[styles.sectionTitle, { color: textColor }]}>{t('taxRules', language)}</Text>
                    </View>
                    <Input
                        testID="product-tax-rate-input"
                        label={`${t('taxRate', language)} (%)`}
                        value={taxRateInput}
                        onChangeText={(text) => {
                            const normalized = text.replace(',', '.');
                            if (!/^\d*(?:\.\d*)?$/.test(normalized)) return;
                            setTaxRateInput(normalized);
                            setFormData((current) => ({ ...current, tax_rate: Number(normalized) || 0 }));
                        }}
                        placeholder="0"
                        keyboardType="decimal-pad"
                    />

                    <TouchableOpacity
                        style={styles.checkboxRow}
                        onPress={() => setFormData((current) => ({ ...current, tax_included: !current.tax_included }))}
                    >
                        <View style={[styles.checkbox, formData.tax_included && styles.checkboxChecked]}>
                            {formData.tax_included && <Text style={styles.checkmark}>✓</Text>}
                        </View>
                        <Text style={[styles.checkboxLabel, { color: textColor }]}>{t('priceIncludesTax', language)}</Text>
                    </TouchableOpacity>
                </View>

                {/* Import costing */}
                <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: showAdvanced }} onPress={() => setShowAdvanced((current) => !current)} style={styles.advancedToggle}>
                    <Text style={[styles.advancedText, { color: '#004FFE' }]}>{showAdvanced ? t('hideLandedCostOptions', language) : t('landedCostOptions', language)}</Text>
                    {showAdvanced ? <ChevronUp color="#004FFE" size={17} /> : <ChevronDown color="#004FFE" size={17} />}
                </TouchableOpacity>
                {showAdvanced ? <View style={[styles.section, { backgroundColor: cardBg }]}>
                    <View style={styles.sectionHeader}>
                        <Package color="#7F56D9" size={20} />
                        <Text style={[styles.sectionTitle, { color: textColor }]}>{t('importLandedCost', language)}</Text>
                    </View>
                    <Text style={[styles.hintText, { color: mutedColor, marginBottom: 16 }]}>
                        {t('kosovoImportFieldsDescription', language)}
                    </Text>

                    <View style={styles.row}>
                        <View style={styles.flex1}>
                            <Input
                                label={t('supplierCurrency', language)}
                                value={formData.purchase_currency}
                                onChangeText={(text) => setFormData((current) => ({ ...current, purchase_currency: text.toUpperCase() }))}
                                placeholder="EUR"
                            />
                        </View>
                        <View style={styles.flex1}>
                            <Input
                                label={t('exchangeRateToEur', language)}
                                value={String(formData.exchange_rate)}
                                onChangeText={(text) => setFormData((current) => ({ ...current, exchange_rate: Number(text.replace(',', '.')) || 0 }))}
                                keyboardType="decimal-pad"
                            />
                        </View>
                    </View>
                    <View style={styles.row}>
                        <View style={styles.flex1}>
                            <Input
                                label={t('supplierUnitPrice', language)}
                                value={String(formData.supplier_unit_price)}
                                onChangeText={(text) => setFormData((current) => ({ ...current, supplier_unit_price: Number(text.replace(',', '.')) || 0 }))}
                                keyboardType="decimal-pad"
                            />
                        </View>
                        <View style={styles.flex1}>
                            <Input
                                label={t('supplierDiscountPercent', language)}
                                value={String(formData.supplier_discount_percent)}
                                onChangeText={(text) => setFormData((current) => ({ ...current, supplier_discount_percent: Number(text.replace(',', '.')) || 0 }))}
                                keyboardType="decimal-pad"
                            />
                        </View>
                    </View>
                    <Input
                        label={t('unitPriceAfterDiscount', language)}
                        value={String(formData.supplier_unit_price_after_discount)}
                        onChangeText={(text) => setFormData((current) => ({ ...current, supplier_unit_price_after_discount: Number(text.replace(',', '.')) || 0 }))}
                        keyboardType="decimal-pad"
                    />
                    <View style={styles.row}>
                        <View style={styles.flex1}>
                            <Input
                                label={t('transport', language)}
                                value={String(formData.transport_cost)}
                                onChangeText={(text) => setFormData((current) => ({ ...current, transport_cost: Number(text.replace(',', '.')) || 0 }))}
                                keyboardType="decimal-pad"
                            />
                        </View>
                        <View style={styles.flex1}>
                            <Input
                                label={t('otherAdditions', language)}
                                value={String(formData.additional_cost)}
                                onChangeText={(text) => setFormData((current) => ({ ...current, additional_cost: Number(text.replace(',', '.')) || 0 }))}
                                keyboardType="decimal-pad"
                            />
                        </View>
                    </View>
                    <View style={styles.row}>
                        <View style={styles.flex1}>
                            <Input
                                label={t('customsBase', language)}
                                value={String(formData.customs_base)}
                                onChangeText={(text) => setFormData((current) => ({ ...current, customs_base: Number(text.replace(',', '.')) || 0 }))}
                                keyboardType="decimal-pad"
                            />
                        </View>
                        <View style={styles.flex1}>
                            <Input
                                label={t('customsDuty', language)}
                                value={String(formData.customs_duty)}
                                onChangeText={(text) => setFormData((current) => ({ ...current, customs_duty: Number(text.replace(',', '.')) || 0 }))}
                                keyboardType="decimal-pad"
                            />
                        </View>
                    </View>
                    <View style={styles.row}>
                        <View style={styles.flex1}>
                            <Input
                                label={t('excise', language)}
                                value={String(formData.excise)}
                                onChangeText={(text) => setFormData((current) => ({ ...current, excise: Number(text.replace(',', '.')) || 0 }))}
                                keyboardType="decimal-pad"
                            />
                        </View>
                        <View style={styles.flex1}>
                            <Input
                                label={t('importVatPercent', language)}
                                value={importVatRateInput}
                                onChangeText={(text) => {
                                    const normalized = text.replace(',', '.');
                                    if (!/^\d*(?:\.\d*)?$/.test(normalized)) return;
                                    setImportVatRateInput(normalized);
                                    setFormData((current) => ({ ...current, import_vat_rate: Number(normalized) || 0 }));
                                }}
                                keyboardType="decimal-pad"
                            />
                        </View>
                    </View>
                    <View style={styles.row}>
                        <View style={styles.flex1}>
                            <Input
                                label={t('importVatAmount', language)}
                                value={String(formData.import_vat_amount)}
                                onChangeText={(text) => setFormData((current) => ({ ...current, import_vat_amount: Number(text.replace(',', '.')) || 0 }))}
                                keyboardType="decimal-pad"
                            />
                        </View>
                        <View style={styles.flex1}>
                            <Input
                                label={t('unitCostIncludingVat', language)}
                                value={String(formData.unit_cost_with_vat)}
                                onChangeText={(text) => setFormData((current) => ({ ...current, unit_cost_with_vat: Number(text.replace(',', '.')) || 0 }))}
                                keyboardType="decimal-pad"
                            />
                        </View>
                    </View>
                    <View style={styles.row}>
                        <View style={styles.flex1}>
                            <Input
                                label={t('tariffCode', language)}
                                value={formData.tariff_code}
                                onChangeText={(text) => setFormData((current) => ({ ...current, tariff_code: text }))}
                            />
                        </View>
                        <View style={styles.flex1}>
                            <Input
                                label={t('countryOfOrigin', language)}
                                value={formData.country_of_origin}
                                onChangeText={(text) => setFormData((current) => ({ ...current, country_of_origin: text }))}
                            />
                        </View>
                    </View>
                    <Text style={[styles.fieldLabel, { color: textColor }]}>{t('kosovoVatTreatment', language)}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                        {[
                            ['standard_18', t('standard18', language)],
                            ['reduced_8', t('reduced8', language)],
                            ['exempt_no_credit', t('exemptNoCredit', language)],
                            ['exempt_with_credit', t('exemptWithCredit', language)],
                            ['export', t('exportVat', language)],
                            ['reverse_charge', t('reverseCharge', language)],
                            ['out_of_scope', t('outOfScope', language)],
                        ].map(([value, label]) => (
                            <TouchableOpacity
                                key={value}
                                style={[
                                    styles.option,
                                    { backgroundColor: inputBg },
                                    formData.vat_treatment === value && styles.optionActive,
                                ]}
                                onPress={() => setFormData({ ...formData, vat_treatment: value })}
                            >
                                <Text style={[
                                    styles.optionText,
                                    formData.vat_treatment === value && styles.optionTextActive,
                                ]}>
                                    {label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View> : null}

                    <Button
                        testID="product-save-button"
                        title={isEditing ? t('update', language) : t('create', language)}
                        onPress={handleSave}
                        loading={loading}
                        disabled={!canManageProducts}
                        style={styles.saveButton}
                    />
                    {isEditing && canManageProducts ? (
                        <TouchableOpacity
                            testID="product-delete-button"
                            accessibilityRole="button"
                            accessibilityLabel={t('deleteProduct', language)}
                            onPress={handleDelete}
                            disabled={loading}
                            style={[styles.deleteButton, loading && styles.deleteButtonDisabled]}
                        >
                            <Trash2 color="#D92D20" size={18} />
                            <Text style={styles.deleteButtonText}>{t('deleteProduct', language)}</Text>
                        </TouchableOpacity>
                    ) : null}
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20, gap: 16 },
    backButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.05)', alignItems: 'center', justifyContent: 'center' },
    subtitle: { fontSize: 13, fontWeight: '500', marginBottom: 2 },
    title: { fontSize: 28, fontWeight: '800' },
    scroll: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 40 },
    section: { borderRadius: 16, padding: 16, marginBottom: 12 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
    sectionTitle: { fontSize: 16, fontWeight: '600', flex: 1 },
    hintText: { fontSize: 12, marginTop: 4, lineHeight: 18 },
    row: { flexDirection: 'row', gap: 12 },
    flex1: { flex: 1 },
    fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6, opacity: 0.8 },
    priceGrid: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    decimalSeparator: { paddingBottom: 8 },
    picker: { padding: 16, borderRadius: 12 },
    optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
    option: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: '#263A55' },
    optionActive: { backgroundColor: '#004FFE', borderColor: '#004FFE' },
    optionText: { color: '#98A2B3', fontWeight: '500' },
    optionTextActive: { color: '#fff' },
    checkboxRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 12 },
    checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#263A55', alignItems: 'center', justifyContent: 'center' },
    checkboxChecked: { backgroundColor: '#004FFE', borderColor: '#004FFE' },
    checkmark: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
    checkboxLabel: { fontSize: 15 },
    saveButton: { marginTop: 8 },
    deleteButton: { minHeight: 50, marginTop: 12, borderWidth: 1, borderColor: '#D92D20', borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    deleteButtonDisabled: { opacity: 0.5 },
    deleteButtonText: { color: '#D92D20', fontSize: 14, fontWeight: '700' },
    scanIconBtn: { width: 56, height: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 30 },
    imageField: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 10, marginBottom: 16 },
    imagePreview: { width: 76, height: 76, borderRadius: 11 },
    serviceIconPreview: { alignItems: 'center', justifyContent: 'center' },
    imagePlaceholder: { width: 76, height: 76, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    imageCopy: { flex: 1, minWidth: 0 },
    imageHint: { fontSize: 11, marginTop: -4, marginBottom: 8 },
    imageActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    imageAction: { borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8 },
    imageActionText: { color: '#fff', fontSize: 11, fontWeight: '700' },
    imageRemoveAction: { paddingHorizontal: 4, paddingVertical: 8 },
    imageRemoveText: { color: '#D92D20', fontSize: 11, fontWeight: '700' },
    serviceIconSection: { marginTop: 2, marginBottom: 14 },
    serviceIconCarousel: { flexDirection: 'row', gap: 8, paddingVertical: 2, paddingRight: 8 },
    serviceIconOption: { width: 78, minHeight: 68, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, gap: 4 },
    serviceIconLabel: { fontSize: 9, fontWeight: '600', textAlign: 'center' },
    advancedToggle: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    advancedText: { fontSize: 13, fontWeight: '700' },
});
