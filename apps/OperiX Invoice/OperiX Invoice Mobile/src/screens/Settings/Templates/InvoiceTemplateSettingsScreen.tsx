import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Switch,
    Alert,
} from 'react-native';
import { ArrowLeft, Save, FileText, Type, Hash, Calendar, Percent, User, Package, Plus, Trash2, GripVertical, Layout, Table, QrCode, Building2 } from 'lucide-react-native';
import { useTheme } from '@invoice-monorepo/hooks';
import { useAuth } from '@invoice-monorepo/hooks';
import { supabase } from '@invoice-monorepo/api';
import { Card, Input, Button } from '@invoice-monorepo/ui';
import { normalizeBrandColor } from '../../../theme/brand';
import { getLocalizedErrorMessage, t, type TranslationKey } from '@invoice-monorepo/i18n';

interface FieldConfig {
    id: string;
    key: string;
    label: string;
    type: 'text' | 'number' | 'date' | 'select' | 'textarea';
    required: boolean;
    enabled: boolean;
    placeholder?: string;
    defaultValue?: string;
    category?: 'header' | 'client' | 'items' | 'summary' | 'footer';
}

interface ColumnConfig {
    id: string;
    key: string;
    label: string;
    enabled: boolean;
    width?: string;
}

interface InvoiceTemplateSettings {
    id?: string;
    name: string;
    fields: FieldConfig[];
    columns: ColumnConfig[];
    showLogo: boolean;
    showSignature: boolean;
    showBuyerSignature: boolean;
    showStamp: boolean;
    showNotes: boolean;
    showDiscount: boolean;
    showTax: boolean;
    showQrCode: boolean;
    showBankDetails: boolean;
    defaultDueDays: number;
    defaultTaxRate: number;
    primaryColor: string;
    footerText: string;
}

// Invoice header and meta fields
const defaultFields: FieldConfig[] = [
    // Header section
    { id: '1', key: 'invoice_number', label: t('invoiceNumber', 'en'), type: 'text', required: true, enabled: true, placeholder: 'INV-001', category: 'header' },
    { id: '2', key: 'issue_date', label: t('issueDate', 'en'), type: 'date', required: true, enabled: true, category: 'header' },
    { id: '3', key: 'due_date', label: t('dueDate', 'en'), type: 'date', required: false, enabled: true, category: 'header' },
    { id: '4', key: 'document_type', label: t('documentType', 'en'), type: 'select', required: true, enabled: true, category: 'header' },
    // Client section
    { id: '5', key: 'client_name', label: t('clientName', 'en'), type: 'text', required: true, enabled: true, category: 'client' },
    { id: '6', key: 'client_nui', label: t('clientNui', 'en'), type: 'text', required: false, enabled: true, category: 'client' },
    { id: '7', key: 'client_fiscal_number', label: t('clientFiscalNumber', 'en'), type: 'text', required: false, enabled: true, category: 'client' },
    { id: '8', key: 'client_vat_number', label: t('clientVatNumber', 'en'), type: 'text', required: false, enabled: true, category: 'client' },
    { id: '9', key: 'client_address', label: t('clientAddress', 'en'), type: 'text', required: false, enabled: true, category: 'client' },
    { id: '10', key: 'client_email', label: t('clientEmail', 'en'), type: 'text', required: false, enabled: true, category: 'client' },
    { id: '11', key: 'client_phone', label: t('clientPhone', 'en'), type: 'text', required: false, enabled: true, category: 'client' },
    // Summary section
    { id: '12', key: 'subtotal', label: t('subtotal', 'en'), type: 'number', required: true, enabled: true, category: 'summary' },
    { id: '13', key: 'discount_amount', label: t('discountAmount', 'en'), type: 'number', required: false, enabled: true, category: 'summary' },
    { id: '14', key: 'net_amount', label: t('netAmountBeforeTax', 'en'), type: 'number', required: false, enabled: true, category: 'summary' },
    { id: '15', key: 'tax_amount', label: t('taxAmount', 'en'), type: 'number', required: false, enabled: true, category: 'summary' },
    { id: '16', key: 'total', label: t('totalAmount', 'en'), type: 'number', required: true, enabled: true, category: 'summary' },
    // Footer section  
    { id: '17', key: 'notes', label: t('notes', 'en'), type: 'textarea', required: false, placeholder: t('paymentTermsPlaceholder', 'en'), enabled: true, category: 'footer' },
    { id: '18', key: 'bank_name', label: t('bankName', 'en'), type: 'text', required: false, enabled: true, category: 'footer' },
    { id: '19', key: 'bank_iban', label: t('bankIban', 'en'), type: 'text', required: false, enabled: true, category: 'footer' },
    { id: '20', key: 'company_tax_id', label: t('companyTaxId', 'en'), type: 'text', required: false, enabled: true, category: 'footer' },
];

// Items table columns configuration
const defaultColumns: ColumnConfig[] = [
    { id: 'col_1', key: 'row_number', label: t('nr', 'en'), enabled: true, width: '5%' },
    { id: 'col_2', key: 'sku', label: t('skuCode', 'en'), enabled: true, width: '10%' },
    { id: 'col_3', key: 'description', label: t('description', 'en'), enabled: true, width: '25%' },
    { id: 'col_4', key: 'quantity', label: t('quantity', 'en'), enabled: true, width: '8%' },
    { id: 'col_5', key: 'unit', label: t('unit', 'en'), enabled: true, width: '8%' },
    { id: 'col_6', key: 'unit_price', label: t('unitPriceExclVat', 'en'), enabled: true, width: '12%' },
    { id: 'col_7', key: 'discount', label: t('discountPercent', 'en'), enabled: true, width: '8%' },
    { id: 'col_8', key: 'tax_rate', label: t('vatPercent', 'en'), enabled: true, width: '8%' },
    { id: 'col_9', key: 'line_total', label: t('lineTotal', 'en'), enabled: true, width: '10%' },
    { id: 'col_10', key: 'gross_price', label: t('grossPriceLabel', 'en'), enabled: true, width: '10%' },
];

const fieldLabelKeys: Record<string, TranslationKey> = {
    invoice_number: 'invoiceNumber',
    issue_date: 'issueDate',
    due_date: 'dueDate',
    document_type: 'documentType',
    client_name: 'clientName',
    client_nui: 'clientNui',
    client_fiscal_number: 'clientFiscalNumber',
    client_vat_number: 'clientVatNumber',
    client_address: 'clientAddress',
    client_email: 'clientEmail',
    client_phone: 'clientPhone',
    subtotal: 'subtotal',
    discount_amount: 'discountAmount',
    net_amount: 'netAmountBeforeTax',
    tax_amount: 'taxAmount',
    total: 'totalAmount',
    notes: 'notes',
    bank_name: 'bankName',
    bank_iban: 'bankIban',
    company_tax_id: 'companyTaxId',
};

const columnLabelKeys: Record<string, TranslationKey> = {
    row_number: 'nr',
    sku: 'skuCode',
    description: 'description',
    quantity: 'quantity',
    unit: 'unit',
    unit_price: 'unitPriceExclVat',
    discount: 'discountPercent',
    tax_rate: 'vatPercent',
    line_total: 'lineTotal',
    gross_price: 'grossPriceLabel',
};

const normalizedLabel = (value: string) => value.trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ');

function localizedFieldLabel(field: FieldConfig, language: string): string {
    const key = fieldLabelKeys[field.key];
    if (!key) return field.label;
    const current = normalizedLabel(field.label || '');
    const isDefault = !current || current === normalizedLabel(t(key, 'en')) || current === normalizedLabel(t(key, 'sq'));
    return isDefault ? t(key, language) : field.label;
}

function localizedColumnLabel(column: ColumnConfig, language: string): string {
    const key = columnLabelKeys[column.key];
    return key ? t(key, language) : column.label;
}

const defaultTemplate: InvoiceTemplateSettings = {
    name: t('defaultTemplate', 'en'),
    fields: defaultFields,
    columns: defaultColumns,
    showLogo: true,
    showSignature: true,
    showBuyerSignature: true,
    showStamp: true,
    showNotes: true,
    showDiscount: true,
    showTax: true,
    showQrCode: true,
    showBankDetails: true,
    defaultDueDays: 30,
    defaultTaxRate: 18,
    primaryColor: '#004FFE',
    footerText: '',
};

export function InvoiceTemplateSettingsScreen({ navigation }: any) {
    const { isDark, primaryColor, language } = useTheme();
    const { user } = useAuth();
    const [template, setTemplate] = useState<InvoiceTemplateSettings>(() => ({
        ...defaultTemplate,
        footerText: t('thankYouForBusiness', language),
    }));
    const [loading, setLoading] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    const bgColor = isDark ? '#0D1B2A' : '#F7F9FC';
    const textColor = isDark ? '#fff' : '#111827';
    const cardBg = isDark ? '#14243A' : '#ffffff';
    const mutedColor = isDark ? '#98A2B3' : '#667085';
    const inputBg = isDark ? '#0D1B2A' : '#F4F7FB';

    useEffect(() => {
        loadTemplate();
    }, []);

    const loadTemplate = async () => {
        if (!user) return;
        const { data } = await supabase
            .from('invoice_templates')
            .select('*')
            .eq('user_id', user.id)
            .eq('is_default', true)
            .single();

        if (data) {
            setTemplate({
                id: data.id,
                name: data.name,
                fields: data.fields || defaultFields,
                columns: data.columns || defaultColumns,
                showLogo: data.show_logo ?? true,
                showSignature: data.show_signature ?? true,
                showBuyerSignature: data.show_buyer_signature ?? true,
                showStamp: data.show_stamp ?? true,
                showNotes: data.show_notes ?? true,
                showDiscount: data.show_discount ?? true,
                showTax: data.show_tax ?? true,
                showQrCode: data.show_qr_code ?? true,
                showBankDetails: data.show_bank_details ?? true,
                defaultDueDays: data.default_due_days ?? 30,
                defaultTaxRate: data.default_tax_rate ?? 18,
                primaryColor: normalizeBrandColor(data.primary_color),
                footerText: data.footer_text || '',
            });
        }
    };

    const handleSave = async () => {
        if (!user) return;
        setLoading(true);

        try {
            const templateData = {
                user_id: user.id,
                name: template.name,
                fields: template.fields,
                columns: template.columns,
                show_logo: template.showLogo,
                show_signature: template.showSignature,
                show_buyer_signature: template.showBuyerSignature,
                show_stamp: template.showStamp,
                show_notes: template.showNotes,
                show_discount: template.showDiscount,
                show_tax: template.showTax,
                show_qr_code: template.showQrCode,
                show_bank_details: template.showBankDetails,
                default_due_days: template.defaultDueDays,
                default_tax_rate: template.defaultTaxRate,
                primary_color: template.primaryColor,
                footer_text: template.footerText,
                is_default: true,
            };

            if (template.id) {
                await supabase.from('invoice_templates').update(templateData).eq('id', template.id);
            } else {
                await supabase.from('invoice_templates').insert(templateData);
            }

            Alert.alert(t('success', language), t('templateSettingsSaved', language));
            setHasChanges(false);
        } catch (error: any) {
            Alert.alert(t('error', language), getLocalizedErrorMessage(error, language, 'saveError'));
        } finally {
            setLoading(false);
        }
    };

    const updateField = (fieldId: string, updates: Partial<FieldConfig>) => {
        setTemplate(prev => ({
            ...prev,
            fields: prev.fields.map(f => f.id === fieldId ? { ...f, ...updates } : f),
        }));
        setHasChanges(true);
    };

    const toggleSection = (key: keyof InvoiceTemplateSettings, value: boolean) => {
        setTemplate(prev => ({ ...prev, [key]: value }));
        setHasChanges(true);
    };

    const renderFieldEditor = (field: FieldConfig) => (
        <View key={field.id} style={[styles.fieldItem, { backgroundColor: inputBg }]}>
            <View style={styles.fieldHeader}>
                <View style={styles.fieldInfo}>
                    <GripVertical color={mutedColor} size={16} />
                    <View style={{ marginLeft: 12, flex: 1 }}>
                        <Input
                            value={localizedFieldLabel(field, language)}
                            onChangeText={(text) => updateField(field.id, { label: text })}
                            placeholder={t('labels', language)}
                            containerStyle={{ marginBottom: 0 }}
                        />
                    </View>
                </View>
                <Switch
                    value={field.enabled}
                    onValueChange={(val) => updateField(field.id, { enabled: val })}
                    trackColor={{ false: '#263A55', true: primaryColor + '50' }}
                    thumbColor={field.enabled ? primaryColor : '#667085'}
                />
            </View>
            {field.enabled && (
                <View style={styles.fieldOptions}>
                    <View style={styles.optionRow}>
                    <Text style={[styles.optionLabel, { color: mutedColor }]}>{t('requiredField', language)}</Text>
                        <Switch
                            value={field.required}
                            onValueChange={(val) => updateField(field.id, { required: val })}
                            trackColor={{ false: '#263A55', true: '#12B76A50' }}
                            thumbColor={field.required ? '#12B76A' : '#667085'}
                        />
                    </View>
                    {field.type === 'text' && (
                        <Input
                            label={t('placeholderLabel', language)}
                            value={field.placeholder || ''}
                            onChangeText={(text) => updateField(field.id, { placeholder: text })}
                            placeholder={t('enterPlaceholderText', language)}
                        />
                    )}
                </View>
            )}
        </View>
    );

    const SettingRow = ({ label, value, onToggle }: { label: string; value: boolean; onToggle: (v: boolean) => void }) => (
        <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: textColor }]}>{label}</Text>
            <Switch
                value={value}
                onValueChange={onToggle}
                trackColor={{ false: '#263A55', true: primaryColor + '50' }}
                thumbColor={value ? primaryColor : '#667085'}
            />
        </View>
    );

    return (
        <View style={[styles.container, { backgroundColor: bgColor }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <ArrowLeft color={textColor} size={24} />
                </TouchableOpacity>
                <Text style={[styles.title, { color: textColor }]}>{t('invoiceTemplate', language)}</Text>
                <TouchableOpacity onPress={handleSave} disabled={loading}>
                    <Save color={hasChanges ? primaryColor : mutedColor} size={24} />
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
                {/* Template Name */}
                <Card style={{ backgroundColor: cardBg, marginBottom: 16 }}>
                    <View style={styles.sectionHeader}>
                        <FileText color={primaryColor} size={20} />
                        <Text style={[styles.sectionTitle, { color: textColor }]}>{t('templateInfo', language)}</Text>
                    </View>
                    <Input
                        label={t('templateName', language)}
                        value={template.name}
                        onChangeText={(text) => {
                            setTemplate(prev => ({ ...prev, name: text }));
                            setHasChanges(true);
                        }}
                        placeholder={t('templateName', language)}
                    />
                    <Input
                        label={t('footerText', language)}
                        value={template.footerText}
                        onChangeText={(text) => {
                            setTemplate(prev => ({ ...prev, footerText: text }));
                            setHasChanges(true);
                        }}
                        placeholder={t('thankYouForBusiness', language)}
                        multiline
                    />
                    <Button
                        title={t('changeDesignStyle', language)}
                        variant="outline"
                        icon={Layout}
                        onPress={() => navigation.navigate('TemplateEditor')}
                        style={{ marginTop: 16 }}
                    />
                </Card>

                {/* Display Options */}
                <Card style={{ backgroundColor: cardBg, marginBottom: 16 }}>
                    <View style={styles.sectionHeader}>
                        <Type color={primaryColor} size={20} />
                        <Text style={[styles.sectionTitle, { color: textColor }]}>{t('displayOptions', language)}</Text>
                    </View>
                    <SettingRow label={t('showCompanyLogo', language)} value={template.showLogo} onToggle={(v) => toggleSection('showLogo', v)} />
                    <SettingRow label={t('showSellerSignature', language)} value={template.showSignature} onToggle={(v) => toggleSection('showSignature', v)} />
                    <SettingRow label={t('showBuyerSignature', language)} value={template.showBuyerSignature} onToggle={(v) => toggleSection('showBuyerSignature', v)} />
                    <SettingRow label={t('showCompanyStamp', language)} value={template.showStamp} onToggle={(v) => toggleSection('showStamp', v)} />
                    <SettingRow label={t('showQrCode', language)} value={template.showQrCode} onToggle={(v) => toggleSection('showQrCode', v)} />
                    <SettingRow label={t('showNotesSection', language)} value={template.showNotes} onToggle={(v) => toggleSection('showNotes', v)} />
                    <SettingRow label={t('showDiscountField', language)} value={template.showDiscount} onToggle={(v) => toggleSection('showDiscount', v)} />
                    <SettingRow label={t('showTaxField', language)} value={template.showTax} onToggle={(v) => toggleSection('showTax', v)} />
                    <SettingRow label={t('showBankDetails', language)} value={template.showBankDetails} onToggle={(v) => toggleSection('showBankDetails', v)} />
                </Card>

                {/* Items Table Columns */}
                <Card style={{ backgroundColor: cardBg, marginBottom: 16 }}>
                    <View style={styles.sectionHeader}>
                        <Table color={primaryColor} size={20} />
                        <Text style={[styles.sectionTitle, { color: textColor }]}>{t('itemsTableColumns', language)}</Text>
                    </View>
                    <Text style={[styles.helperText, { color: mutedColor }]}>
                        {t('itemsTableColumnsDescription', language)}
                    </Text>
                    {template.columns.map((col) => (
                        <View key={col.id} style={[styles.columnRow, { backgroundColor: inputBg }]}>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.columnLabel, { color: textColor }]}>{localizedColumnLabel(col, language)}</Text>
                                <Text style={[styles.columnKey, { color: mutedColor }]}>{col.key}</Text>
                            </View>
                            <Switch
                                value={col.enabled}
                                onValueChange={(val) => {
                                    setTemplate(prev => ({
                                        ...prev,
                                        columns: prev.columns.map(c => c.id === col.id ? { ...c, enabled: val } : c),
                                    }));
                                    setHasChanges(true);
                                }}
                                trackColor={{ false: '#263A55', true: primaryColor + '50' }}
                                thumbColor={col.enabled ? primaryColor : '#667085'}
                            />
                        </View>
                    ))}
                </Card>

                {/* Default Values */}
                <Card style={{ backgroundColor: cardBg, marginBottom: 16 }}>
                    <View style={styles.sectionHeader}>
                        <Hash color={primaryColor} size={20} />
                        <Text style={[styles.sectionTitle, { color: textColor }]}>{t('defaultValues', language)}</Text>
                    </View>
                    <View style={styles.row}>
                        <View style={{ flex: 1 }}>
                            <Input
                                label={t('dueDays', language)}
                                value={String(template.defaultDueDays)}
                                onChangeText={(text) => {
                                    setTemplate(prev => ({ ...prev, defaultDueDays: Number(text) || 30 }));
                                    setHasChanges(true);
                                }}
                                keyboardType="numeric"
                                placeholder="30"
                            />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Input
                                label={t('taxRatePercent', language)}
                                value={String(template.defaultTaxRate)}
                                onChangeText={(text) => {
                                    setTemplate(prev => ({ ...prev, defaultTaxRate: Number(text) || 0 }));
                                    setHasChanges(true);
                                }}
                                keyboardType="numeric"
                                placeholder="18"
                            />
                        </View>
                    </View>
                </Card>

                {/* Field Configuration */}
                <Card style={{ backgroundColor: cardBg, marginBottom: 16 }}>
                    <View style={styles.sectionHeader}>
                        <Package color={primaryColor} size={20} />
                        <Text style={[styles.sectionTitle, { color: textColor }]}>{t('invoiceFields', language)}</Text>
                    </View>
                    <Text style={[styles.helperText, { color: mutedColor }]}>
                        {t('invoiceFieldsDescription', language)}
                    </Text>
                    {template.fields.map(renderFieldEditor)}
                </Card>

                {/* Save Button */}
                <Button
                    title={t('saveTemplate', language)}
                    icon={Save}
                    onPress={handleSave}
                    loading={loading}
                    disabled={!hasChanges}
                    style={{ marginBottom: 32 }}
                />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16 },
    title: { fontSize: 20, fontWeight: 'bold' },
    content: { padding: 16 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
    sectionTitle: { fontSize: 16, fontWeight: 'bold' },
    row: { flexDirection: 'row', gap: 12 },
    settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
    settingLabel: { fontSize: 15 },
    fieldItem: { padding: 16, borderRadius: 12, marginBottom: 12 },
    fieldHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    fieldInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    fieldOptions: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
    optionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    optionLabel: { fontSize: 13 },
    helperText: { fontSize: 13, marginBottom: 16 },
    columnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 12, marginBottom: 8 },
    columnLabel: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
    columnKey: { fontSize: 12 },
});
