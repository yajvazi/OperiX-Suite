import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Switch, Alert } from 'react-native';
import { ArrowLeft, Layout, Columns, Type, Eye, Save, RotateCcw, Palette, Check } from 'lucide-react-native';

import { useTheme } from '@invoice-monorepo/hooks';
import { useAuth } from '@invoice-monorepo/hooks';
import { Card, Button, Input } from '@invoice-monorepo/ui';
import { supabase } from '@invoice-monorepo/api';
import { TemplateConfig, Profile, TemplateType } from '@invoice-monorepo/types';
import { templateInfo } from '../../services/pdf/TemplateFactory';
import { t, type TranslationKey } from '@invoice-monorepo/i18n';


const defaultLabelsFor = (locale: string) => ({
    invoice: t('invoice', locale).toUpperCase(),
    billTo: t('buyer', locale),
    date: t('invoiceDate', locale),
    due: t('dueDate', locale),
    item: t('description', locale),
    quantity: t('quantity', locale),
    price: t('unitPrice', locale),
    total: t('amount', locale),
    subtotal: t('subtotal', locale),
    tax: t('tax', locale),
    discount: t('discount', locale),
    totalDue: t('amountDue', locale),
    notes: t('notes', locale),
    terms: t('terms', locale),
});

const defaultConfig: TemplateConfig = {
    showLogo: true,
    showSignature: true,
    showBuyerSignature: true,
    showStamp: true,
    showQrCode: true,
    showNotes: true,
    showDiscount: true,
    showTax: true,
    showBankDetails: true,
    visibleColumns: {
        rowNumber: true,
        sku: false,
        description: true,
        quantity: true,
        unit: true,
        unitPrice: true,
        discount: true,
        taxRate: false,
        lineTotal: true,
        grossPrice: false,
    },
    labels: defaultLabelsFor('en'),
    style: 'corporate',
    pageSize: 'A4'
};

export function TemplateEditorScreen({ navigation }: any) {
    const { user } = useAuth();
    const { isDark, language } = useTheme();
    const [config, setConfig] = useState<TemplateConfig>(() => ({ ...defaultConfig, labels: defaultLabelsFor(language) }));
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'layout' | 'columns' | 'labels' | 'style'>('layout');


    const bgColor = isDark ? '#0D1B2A' : '#F7F9FC';
    const textColor = isDark ? '#fff' : '#111827';
    const mutedColor = isDark ? '#98A2B3' : '#667085';
    const cardBg = isDark ? '#14243A' : '#ffffff';
    const accentBg = isDark ? '#14243A' : '#F4F7FB';

    useEffect(() => {
        fetchConfig();
    }, []);

    const fetchConfig = async () => {
        if (!user) return;
        const { data } = await supabase.from('profiles').select('template_config').eq('id', user.id).single();
        if (data?.template_config) {
            const storedConfig = data.template_config as TemplateConfig;
            setConfig({ ...storedConfig, labels: storedConfig.labels || defaultLabelsFor(language) });
        }
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            await supabase.from('profiles').update({ template_config: config }).eq('id', user?.id);
            Alert.alert(t('success', language), t('settingsSaved', language));
        } catch (error) {
            Alert.alert(t('error', language), t('saveError', language));
        } finally {
            setLoading(false);
        }
    };

    const resetToDefault = () => {
        Alert.alert(
            t('resetSettings', language),
            t('resetSettingsConfirmation', language),
            [
                { text: t('cancel', language), style: 'cancel' },
                { text: t('resetSettings', language), style: 'destructive', onPress: () => setConfig({ ...defaultConfig, labels: defaultLabelsFor(language) }) }
            ]
        );
    };

    const updateLabel = (key: string, value: string) => {
        setConfig({
            ...config,
            labels: { ...config.labels, [key]: value }
        });
    };

    const toggleColumn = (key: keyof TemplateConfig['visibleColumns']) => {
        setConfig({
            ...config,
            visibleColumns: { ...config.visibleColumns, [key]: !config.visibleColumns[key] }
        });
    };

    return (
        <View style={[styles.container, { backgroundColor: bgColor }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <ArrowLeft color={textColor} size={24} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: textColor }]}>{t('pdfEditor', language)}</Text>
                <TouchableOpacity onPress={handleSave} disabled={loading}>
                    <Save color={loading ? mutedColor : '#004FFE'} size={24} />
                </TouchableOpacity>
            </View>

            <View style={styles.tabBar}>
                {[
                    { id: 'layout', label: t('layout', language), icon: Layout },
                    { id: 'style', label: t('style', language), icon: Palette },
                    { id: 'columns', label: t('columns', language), icon: Columns },
                    { id: 'labels', label: t('labels', language), icon: Type },
                ].map(tab => (

                    <TouchableOpacity
                        key={tab.id}
                        style={[styles.tab, activeTab === tab.id && styles.activeTab]}
                        onPress={() => setActiveTab(tab.id as any)}
                    >
                        <tab.icon size={18} color={activeTab === tab.id ? '#004FFE' : mutedColor} />
                        <Text style={[styles.tabLabel, { color: activeTab === tab.id ? '#004FFE' : mutedColor }]}>{tab.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
                {activeTab === 'layout' && (
                    <Card style={styles.card}>
                        <Text style={[styles.sectionTitle, { color: textColor }]}>{t('visibilityToggle', language)}</Text>
                        <View style={styles.row}>
                            <Text style={[styles.itemLabel, { color: textColor }]}>{t('showLogo', language)}</Text>
                            <Switch value={config.showLogo} onValueChange={(v) => setConfig({ ...config, showLogo: v })} />
                        </View>
                        <View style={styles.row}>
                            <Text style={[styles.itemLabel, { color: textColor }]}>{t('showSignature', language)}</Text>
                            <Switch value={config.showSignature} onValueChange={(v) => setConfig({ ...config, showSignature: v })} />
                        </View>
                        <View style={styles.row}>
                            <Text style={[styles.itemLabel, { color: textColor }]}>{t('showOfficialStamp', language)}</Text>
                            <Switch value={config.showStamp} onValueChange={(v) => setConfig({ ...config, showStamp: v })} />
                        </View>

                        <View style={styles.divider} />

                        <Text style={[styles.sectionTitle, { color: textColor, marginTop: 8 }]}>{t('pageSize', language)}</Text>
                        <View style={styles.pageSizeContainer}>
                            {['A4', 'A5', 'Receipt'].map((size) => (
                                <TouchableOpacity
                                    key={size}
                                    style={[
                                        styles.pageSizeOption,
                                        { backgroundColor: cardBg },
                                        config.pageSize === size && styles.activePageSize
                                    ]}
                                    onPress={() => setConfig({ ...config, pageSize: size as any })}
                                >
                                    <View style={[styles.paperIcon, { height: size === 'A4' ? 30 : 22, width: size === 'A4' ? 22 : 16 }]} />
                                    <Text style={[styles.pageSizeText, { color: config.pageSize === size ? '#004FFE' : mutedColor }]}>{size}</Text>
                                    {config.pageSize === size && <View style={styles.checkDot} />}
                                </TouchableOpacity>
                            ))}
                        </View>
                    </Card>
                )}

                {activeTab === 'style' && (
                    <Card style={styles.card}>
                        <Text style={[styles.sectionTitle, { color: textColor }]}>{t('invoiceStyle', language)}</Text>
                        <Text style={[styles.hint, { color: mutedColor }]}>{t('invoiceStyleDescription', language)}</Text>

                        {(Object.entries(templateInfo) as [TemplateType, { nameKey: TranslationKey; descriptionKey: TranslationKey }][]).map(([key, info]) => (
                            <TouchableOpacity
                                key={key}
                                style={[
                                    styles.styleOption,
                                    { backgroundColor: cardBg },
                                    config.style === key && styles.activeStyle
                                ]}
                                onPress={() => setConfig({ ...config, style: key })}
                            >
                                <View style={styles.styleContent}>
                                    <Text style={[styles.styleName, { color: config.style === key ? '#004FFE' : textColor }]}>
                                        {t(info.nameKey, language)}
                                    </Text>
                                    <Text style={styles.styleDesc}>{t(info.descriptionKey, language)}</Text>
                                </View>
                                {config.style === key && (
                                    <View style={{ backgroundColor: '#004FFE', padding: 4, borderRadius: 10 }}>
                                        <Check color="#fff" size={14} />
                                    </View>
                                )}
                            </TouchableOpacity>
                        ))}
                    </Card>
                )}

                {activeTab === 'columns' && (
                    <Card style={styles.card}>
                        <Text style={[styles.sectionTitle, { color: textColor }]}>{t('tableColumns', language)}</Text>
                        <Text style={[styles.hint, { color: mutedColor }]}>{t('tableColumnsDescription', language)}</Text>

                        <View style={styles.row}>
                            <Text style={[styles.itemLabel, { color: textColor }]}>{t('rowNumber', language)}</Text>
                            <Switch value={config.visibleColumns.rowNumber} onValueChange={() => toggleColumn('rowNumber')} />
                        </View>
                        <View style={styles.row}>
                            <Text style={[styles.itemLabel, { color: textColor }]}>{t('skuCode', language)}</Text>
                            <Switch value={config.visibleColumns.sku} onValueChange={() => toggleColumn('sku')} />
                        </View>
                        <View style={styles.row}>
                            <Text style={[styles.itemLabel, { color: textColor }]}>{t('description', language)}</Text>
                            <Switch value={config.visibleColumns.description} onValueChange={() => toggleColumn('description')} />
                        </View>
                        <View style={styles.row}>
                            <Text style={[styles.itemLabel, { color: textColor }]}>{t('quantity', language)}</Text>
                            <Switch value={config.visibleColumns.quantity} onValueChange={() => toggleColumn('quantity')} />
                        </View>
                        <View style={styles.row}>
                            <Text style={[styles.itemLabel, { color: textColor }]}>{t('unitPcsHrs', language)}</Text>
                            <Switch value={config.visibleColumns.unit} onValueChange={() => toggleColumn('unit')} />
                        </View>
                        <View style={styles.row}>
                            <Text style={[styles.itemLabel, { color: textColor }]}>{t('unitPrice', language)}</Text>
                            <Switch value={config.visibleColumns.unitPrice} onValueChange={() => toggleColumn('unitPrice')} />
                        </View>
                        <View style={styles.row}>
                            <Text style={[styles.itemLabel, { color: textColor }]}>{t('discountPercent', language)}</Text>
                            <Switch value={config.visibleColumns.discount} onValueChange={() => toggleColumn('discount')} />
                        </View>
                        <View style={styles.row}>
                            <Text style={[styles.itemLabel, { color: textColor }]}>{t('vatTaxRate', language)}</Text>
                            <Switch value={config.visibleColumns.taxRate} onValueChange={() => toggleColumn('taxRate')} />
                        </View>
                        <View style={styles.row}>
                            <Text style={[styles.itemLabel, { color: textColor }]}>{t('lineTotal', language)}</Text>
                            <Switch value={config.visibleColumns.lineTotal} onValueChange={() => toggleColumn('lineTotal')} />
                        </View>
                        <View style={styles.row}>
                            <Text style={[styles.itemLabel, { color: textColor }]}>{t('priceIncludingVat', language)}</Text>
                            <Switch value={config.visibleColumns.grossPrice} onValueChange={() => toggleColumn('grossPrice')} />
                        </View>
                    </Card>
                )}

                {activeTab === 'labels' && (
                    <Card style={styles.card}>
                        <Text style={[styles.sectionTitle, { color: textColor }]}>{t('customLabels', language)}</Text>
                        <Text style={[styles.hint, { color: mutedColor }]}>{t('customLabelsDescription', language)}</Text>

                        <View style={styles.grid}>
                            <Input label={t('invoice', language)} value={config.labels.invoice} onChangeText={(value) => updateLabel('invoice', value)} />
                            <Input label={t('buyer', language)} value={config.labels.billTo} onChangeText={(value) => updateLabel('billTo', value)} />
                            <Input label={t('quantity', language)} value={config.labels.quantity} onChangeText={(value) => updateLabel('quantity', value)} />
                            <Input label={t('price', language)} value={config.labels.price} onChangeText={(value) => updateLabel('price', value)} />
                            <Input label={t('total', language)} value={config.labels.total} onChangeText={(value) => updateLabel('total', value)} />
                            <Input label={t('notes', language)} value={config.labels.notes} onChangeText={(value) => updateLabel('notes', value)} />
                        </View>
                    </Card>
                )}

                <Button
                    title={t('resetToDefaults', language)}
                    variant="outline"
                    icon={RotateCcw}
                    onPress={resetToDefault}
                    style={{ marginTop: 20 }}
                />

                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16 },
    backBtn: { padding: 4 },
    title: { fontSize: 20, fontWeight: 'bold' },
    tabBar: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 16, gap: 12 },
    tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 12, gap: 6, backgroundColor: 'rgba(0, 79, 254, 0.05)' },
    activeTab: { backgroundColor: 'rgba(0, 79, 254, 0.15)', borderWidth: 1, borderColor: '#004FFE' },
    tabLabel: { fontSize: 13, fontWeight: '600' },
    content: { flex: 1 },
    scrollContent: { padding: 16 },
    card: { padding: 16, marginBottom: 16 },
    sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 16 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
    itemLabel: { fontSize: 15 },
    hint: { fontSize: 13, marginBottom: 16 },
    grid: { gap: 4 },
    divider: { height: 1, backgroundColor: 'rgba(0,0,0,0.05)', marginVertical: 16 },
    pageSizeContainer: { flexDirection: 'row', gap: 12, marginTop: 8 },
    pageSizeOption: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', position: 'relative' },
    activePageSize: { borderColor: '#004FFE', backgroundColor: 'rgba(0, 79, 254, 0.05)' },
    paperIcon: { borderWidth: 1.5, borderColor: '#004FFE', borderRadius: 2, marginBottom: 8 },
    pageSizeText: { fontSize: 14, fontWeight: '700' },
    checkDot: { position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: '#004FFE' },
    styleOption: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)', marginBottom: 8 },
    activeStyle: { borderColor: '#004FFE', backgroundColor: 'rgba(0, 79, 254, 0.05)' },
    styleContent: { flex: 1 },
    styleName: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
    styleDesc: { fontSize: 12, color: '#667085' },
});

