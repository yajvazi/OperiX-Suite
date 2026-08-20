import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet, Switch, ActivityIndicator } from 'react-native';
import {
    CreditCard,
    Mail,
    Download,
    User,
    ArrowLeft,
    ShieldCheck,
    ChevronRight,
    FileText,
    Hash,
    Settings,
    Layout,
    BrainCircuit,
} from 'lucide-react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { supabase } from '@invoice-monorepo/api';
import { useAuth } from '@invoice-monorepo/hooks';
import { useTheme } from '@invoice-monorepo/hooks';
import { Card, Button, Input } from '@invoice-monorepo/ui';
import { getLocalizedErrorMessage, t } from '@invoice-monorepo/i18n';
import { getActiveProductCompanyIds, getWorkspaceScope, scopedResource } from '../../services/workspace';
import { getAISettings, saveAISettings, type AISettings } from '../../services/ai/operixAi';

export function AdvancedSettingsScreen({ navigation, route }: any) {
    const { user } = useAuth();
    const { isDark, primaryColor, language, setLanguage } = useTheme();
    const [saving, setSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const [profile, setProfile] = useState<any>(null);
    const [numberingSequences, setNumberingSequences] = useState<Array<Record<string, any>>>([]);
    const [activeSection, setActiveSection] = useState<string | null>(route?.params?.section || 'integrations');
    const [intelligenceSettings, setIntelligenceSettings] = useState<AISettings>({ ai_enabled: true, preferred_language: 'auto', daily_briefing_enabled: true, history_enabled: true, intelligence_enabled: true, invoice_alerts_enabled: true, customer_insights_enabled: true, inventory_alerts_enabled: true, sales_insights_enabled: true, payment_alerts_enabled: true, push_notifications_enabled: true, show_amounts_in_notifications: true });

    const bgColor = isDark ? '#0D1B2A' : '#F7F9FC';
    const textColor = isDark ? '#fff' : '#111827';
    const mutedColor = isDark ? '#98A2B3' : '#667085';
    const cardBg = isDark ? '#14243A' : '#ffffff';
    const borderColor = isDark ? '#263A55' : '#E4E9F0';

    useEffect(() => {
        fetchProfile();
        void fetchIntelligenceSettings();
    }, []);

    const fetchIntelligenceSettings = async () => {
        try {
            const loaded = await getAISettings(language === 'sq' ? 'sq' : 'en');
            setIntelligenceSettings((current) => ({ ...current, ...loaded }));
        } catch {
            // Intelligence remains deterministic when optional settings are unavailable.
        }
    };

    const updateIntelligenceSetting = async (key: keyof AISettings, value: boolean) => {
        setIntelligenceSettings((current) => ({ ...current, [key]: value }));
        try {
            const saved = await saveAISettings({ [key]: value } as Partial<AISettings>, language === 'sq' ? 'sq' : 'en');
            setIntelligenceSettings((current) => ({ ...current, ...saved }));
        } catch {
            // Keep the optimistic value; the next settings load will reconcile it.
        }
    };

    const fetchProfile = async () => {
        if (!user) return;
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        if (data) {
            setProfile(data);
            const companyId = data.active_company_id || data.company_id;
            if (companyId) {
                const { data: sequences } = await supabase
                    .from('document_sequences')
                    .select('id,document_type,prefix,next_value,padding,current_period_key,reset_rule,branch_id')
                    .eq('company_id', companyId)
                    .is('branch_id', null)
                    .eq('is_active', true)
                    .order('document_type');
                if (sequences) setNumberingSequences(sequences as Array<Record<string, any>>);
            }
        }
    };

    const updateField = async (field: string, value: any) => {
        if (!user) return;

        // Update local state immediately for snappy UI
        setProfile((prev: any) => ({ ...prev, [field]: value }));

        setSaving(true);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ [field]: value, updated_at: new Date().toISOString() })
                .eq('id', user.id);

            if (error) throw error;
            setLastSaved(new Date());
        } catch (error: any) {
            console.error('Auto-save error:', error);
        } finally {
            setSaving(false);
        }
    };

    const handleExportData = async (format: 'json' | 'csv') => {
        try {
            if (!user) throw new Error(t('signInToCreateProduct', language));
            const workspaceScope = await getWorkspaceScope(user.id);
            const { companyIds } = workspaceScope;
            const scope = scopedResource(user.id, companyIds);
            const productScope = scopedResource(user.id, getActiveProductCompanyIds(workspaceScope));
            Alert.alert(t('exporting', language), t('prepareData', language));

            const { data: invoices, error: invoicesError } = await supabase.from('invoices').select('*').or(scope);
            const { data: clients, error: clientsError } = await supabase.from('clients').select('*').or(scope);
            const { data: products, error: productsError } = await supabase.from('products').select('*').or(productScope);
            const { data: expenses, error: expensesError } = await supabase.from('expenses').select('*').or(scope);
            const { data: vendors, error: vendorsError } = await supabase.from('vendors').select('*').or(scope);

            if (invoicesError) console.error('Invoices error:', invoicesError);
            if (clientsError) console.error('Clients error:', clientsError);
            if (productsError) console.error('Products error:', productsError);
            if (expensesError) console.error('Expenses error:', expensesError);
            if (vendorsError) console.error('Vendors error:', vendorsError);

            // Create a map of client IDs to names
            const clientMap: { [key: string]: string } = {};
            clients?.forEach(c => { clientMap[c.id] = c.name; });

            if (format === 'json') {
                const backupData = {
                    exportDate: new Date().toISOString(),
                    invoices: invoices || [],
                    clients: clients || [],
                    products: products || [],
                    expenses: expenses || [],
                    vendors: vendors || []
                };
                const content = JSON.stringify(backupData, null, 2);
                const folder = (FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || '';
                const dateStr = new Date().toISOString().split('T')[0];
                const fileUri = `${folder}backup_${dateStr}.json`;
                await FileSystem.writeAsStringAsync(fileUri, content);
                await Sharing.shareAsync(fileUri, {
                    mimeType: 'application/json',
                    dialogTitle: t('exportBackupData', language)
                });
            } else {
                const csvHeader = `${t('date', language)},${t('invoiceNumber', language)},${t('client', language)},${t('amount', language)},${t('status', language)}\n`;
                const csvRows = invoices?.map(inv => {
                    const clientName = clientMap[inv.client_id] || t('unknownError', language);
                    return `${inv.issue_date || ''},${inv.invoice_number || ''},"${clientName}",${inv.total_amount || 0},${inv.status || 'draft'}`;
                }).join('\n') || '';

                const folder = (FileSystem as any).documentDirectory || (FileSystem as any).cacheDirectory || '';
                const dateStr = new Date().toISOString().split('T')[0];
                const fileUri = `${folder}invoices_${dateStr}.csv`;
                await FileSystem.writeAsStringAsync(fileUri, csvHeader + csvRows);
                await Sharing.shareAsync(fileUri, {
                    mimeType: 'text/csv',
                    dialogTitle: t('exportInvoices', language)
                });
            }

            Alert.alert(t('success', language), t('exportCompleted', language));
        } catch (error: any) {
            console.error('Export error:', error);
            Alert.alert(t('error', language), `${t('exportFailed', language)}: ${getLocalizedErrorMessage(error, language, 'unknownError')}`);
        }
    };

    const renderHeader = (title: string, Icon: any, section: string, color: string) => {
        const isActive = activeSection === section;
        return (
            <TouchableOpacity
                style={[styles.sectionHeader, { backgroundColor: cardBg }]}
                onPress={() => setActiveSection(isActive ? null : section)}
            >
                <View style={styles.sectionHeaderLeft}>
                    <View style={[styles.sectionIcon, { backgroundColor: color + '15' }]}>
                        <Icon color={color} size={20} />
                    </View>
                    <Text style={[styles.sectionTitle, { color: textColor }]}>{title}</Text>
                </View>
                <ChevronRight
                    color={mutedColor}
                    size={20}
                    style={{ transform: [{ rotate: isActive ? '90deg' : '0deg' }] }}
                />
            </TouchableOpacity>
        );
    };

    if (!profile) return null;

    return (
        <View style={[styles.container, { backgroundColor: bgColor }]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <ArrowLeft color={textColor} size={24} />
                </TouchableOpacity>
                <View>
                    <Text style={[styles.subtitle, { color: mutedColor }]}>{t('settings', language)}</Text>
                    <Text style={[styles.title, { color: textColor }]}>{t('advanced', language)}</Text>
                </View>

                <View style={styles.statusIndicator}>
                    {saving ? (
                        <View style={styles.savingBadge}>
                            <ActivityIndicator size="small" color={primaryColor} style={{ marginRight: 6 }} />
                            <Text style={{ color: primaryColor, fontSize: 12, fontWeight: '600' }}>{t('saving', language)}</Text>
                        </View>
                    ) : lastSaved ? (
                        <View style={styles.savedBadge}>
                            <ShieldCheck color="#12B76A" size={14} style={{ marginRight: 4 }} />
                            <Text style={{ color: '#12B76A', fontSize: 12, fontWeight: '500' }}>{t('synced', language)}</Text>
                        </View>
                    ) : null}
                </View>
            </View>

            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
                {/* Document Layout */}
                {renderHeader(t('documentLayout', language), Layout, 'appearance', primaryColor)}
                {activeSection === 'appearance' && (
                    <Card style={styles.sectionContent}>
                        <Text style={[styles.label, { color: textColor }]}>{t('defaultTermsConditions', language)}</Text>
                        <Input
                            value={profile.terms_conditions}
                            onChangeText={(t) => updateField('terms_conditions', t)}
                            multiline
                            numberOfLines={4}
                            placeholder={t('paymentDueWithin30Days', language)}
                        />

                        <View style={styles.divider} />
                        <Text style={[styles.label, { color: textColor }]}>{t('defaultPaperSize', language)}</Text>
                        <View style={styles.langGrid}>
                            {['A4', 'A5', 'Receipt'].map(size => (
                                <TouchableOpacity
                                    key={size}
                                    style={[
                                        styles.langOption,
                                        { backgroundColor: isDark ? '#263A55' : '#F4F7FB', flex: 1, alignItems: 'center' },
                                        profile.template_config?.pageSize === size && { backgroundColor: primaryColor }
                                    ]}
                                    onPress={() => updateField('template_config', {
                                        ...(profile.template_config || { showLogo: true, showSignature: true, showBuyerSignature: true, showStamp: true, visibleColumns: { sku: true, unit: true, tax: true, quantity: true, price: true }, labels: {} }),
                                        pageSize: size
                                    })}
                                >
                                    <Text style={[styles.langText, { color: textColor }, profile.template_config?.pageSize === size && { color: '#fff' }]}>{size}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <View style={styles.divider} />
                        <Button
                            title={t('invoiceDesignStyle', language)}
                            variant="shortcut"
                            icon={Layout}
                            onPress={() => navigation.navigate('TemplateEditor')}
                            style={{ marginTop: 8 }}
                        />
                        <Button
                            title={t('contractTemplates', language)}
                            variant="shortcut"
                            icon={FileText}
                            onPress={() => navigation.navigate('ContractTemplates')}
                            style={{ marginTop: 8 }}
                        />
                        <Button
                            title={t('invoiceFieldsDefaults', language)}
                            variant="shortcut"
                            icon={Settings}
                            onPress={() => navigation.navigate('InvoiceTemplateSettings')}
                            style={{ marginTop: 8 }}
                        />
                    </Card>
                )}

                {renderHeader(t('documentNumbering', language), Hash, 'numbering', primaryColor)}
                {activeSection === 'numbering' && (
                    <Card style={styles.sectionContent}>
                        <Text style={[styles.hint, { color: mutedColor }]}>{t('numberingDescription', language)}</Text>
                        {numberingSequences.length ? numberingSequences.map((sequence) => {
                            const preview = `${sequence.prefix || ''}${sequence.current_period_key || new Date().getFullYear()}-${String(sequence.next_value || 1).padStart(Number(sequence.padding || 6), '0')}${sequence.suffix || ''}`;
                            return <View key={sequence.id} style={[styles.sequenceRow, { borderBottomColor: borderColor }]}><View style={styles.sequenceCopy}><Text style={[styles.label, { color: textColor }]}>{String(sequence.document_type || '').replace(/^operix_/, '').replace(/_/g, ' ')}</Text><Text style={[styles.hint, { color: mutedColor }]}>{t('prefix', language)}: {sequence.prefix || '—'} · {t('reset', language)}: {sequence.reset_rule || '—'}</Text></View><Text style={[styles.sequencePreview, { color: primaryColor }]}>{preview}</Text></View>;
                        }) : <Text style={[styles.hint, { color: mutedColor }]}>{t('numberingCreatedDescription', language)}</Text>}
                    </Card>
                )}

                {renderHeader(t('operixIntelligence', language), BrainCircuit, 'intelligence', primaryColor)}
                {activeSection === 'intelligence' && (
                    <Card style={styles.sectionContent}>
                        <Text style={[styles.subLabel, { color: mutedColor }]}>{t('operixIntelligenceSettings', language)}</Text>
                        <Text style={[styles.hint, { color: mutedColor, marginBottom: 12 }]}>{t('operixIntelligenceSettingsDescription', language)}</Text>
                        {[
                            ['intelligence_enabled', 'operixIntelligenceEnabled'],
                            ['daily_briefing_enabled', 'operixIntelligenceDailyBriefing'],
                            ['invoice_alerts_enabled', 'operixIntelligenceInvoiceAlerts'],
                            ['customer_insights_enabled', 'operixIntelligenceCustomerInsights'],
                            ['inventory_alerts_enabled', 'operixIntelligenceInventoryAlerts'],
                            ['sales_insights_enabled', 'operixIntelligenceSalesInsights'],
                            ['payment_alerts_enabled', 'operixIntelligencePaymentAlerts'],
                            ['push_notifications_enabled', 'operixIntelligencePushNotifications'],
                            ['show_amounts_in_notifications', 'operixIntelligenceShowAmounts'],
                        ].map(([key, labelKey]) => (
                            <View key={key} style={[styles.intelligenceSettingRow, { borderBottomColor: borderColor }]}>
                                <Text style={[styles.intelligenceSettingLabel, { color: textColor }]}>{t(labelKey as any, language)}</Text>
                                <Switch value={Boolean(intelligenceSettings[key as keyof AISettings])} onValueChange={(value) => void updateIntelligenceSetting(key as keyof AISettings, value)} trackColor={{ false: '#cbd5e1', true: `${primaryColor}55` }} thumbColor={intelligenceSettings[key as keyof AISettings] ? primaryColor : '#f4f3f4'} />
                            </View>
                        ))}
                    </Card>
                )}

                {/* Stripe/PayPal Integration */}
                {renderHeader(t('paymentIntegrations', language), CreditCard, 'integrations', primaryColor)}
                {activeSection === 'integrations' && (
                    <Card style={styles.sectionContent}>
                        <Text style={[styles.subLabel, { color: mutedColor }]}>{t('nativeIntegrations', language)}</Text>
                        <Text style={[styles.hint, { color: mutedColor, marginBottom: 12 }]}>
                            {t('stripePayPalDescription', language)}
                        </Text>
                        <Button
                            title={t('manageStripePayPal', language)}
                            variant="shortcut"
                            icon={CreditCard}
                            onPress={() => navigation.navigate('PaymentIntegrations')}
                        />
                    </Card>
                )}

                {/* Email & SMTP */}
                {renderHeader(t('emailServerSmtp', language), Mail, 'smtp', primaryColor)}
                {activeSection === 'smtp' && (
                    <Card style={styles.sectionContent}>
                        <Text style={[styles.hint, { color: mutedColor, marginBottom: 16 }]}>
                            {t('smtpDescription', language)}
                        </Text>
                        <Input
                            label={t('smtpHost', language)}
                            value={profile.smtp_host}
                            onChangeText={(val) => updateField('smtp_host', val)}
                            placeholder="smtp.gmail.com"
                        />
                        <View style={{ flexDirection: 'row', gap: 12 }}>
                            <View style={{ flex: 1 }}>
                                <Input
                                    label={t('port', language)}
                                    value={String(profile.smtp_port || '')}
                                    onChangeText={(val) => updateField('smtp_port', val ? Number(val) : null)}
                                    placeholder="587"
                                    keyboardType="number-pad"
                                />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.inputLabel, { color: textColor, marginBottom: 8 }]}>{t('secureSslTls', language)}</Text>
                                <View style={styles.switchContainer}>
                                    <Switch
                                        value={profile.smtp_secure}
                                        onValueChange={(v) => updateField('smtp_secure', v)}
                                        trackColor={{ false: '#cbd5e1', true: primaryColor + '50' }}
                                        thumbColor={profile.smtp_secure ? primaryColor : '#f4f3f4'}
                                    />
                                    <Text style={[styles.switchText, { color: mutedColor }]}>
                                        {profile.smtp_secure ? t('encrypted', language) : t('standard', language)}
                                    </Text>
                                </View>
                            </View>
                        </View>
                        <Input
                            label={t('username', language)}
                            value={profile.smtp_user}
                            onChangeText={(val) => updateField('smtp_user', val)}
                        />
                        <Input
                            label={t('passwordLabel', language)}
                            value={profile.smtp_pass}
                            onChangeText={(val) => updateField('smtp_pass', val)}
                            secureTextEntry
                        />
                        <Input
                            label={t('fromEmail', language)}
                            value={profile.smtp_from_email}
                            onChangeText={(val) => updateField('smtp_from_email', val)}
                            placeholder="billing@yourcompany.com"
                        />
                    </Card>
                )}

                {/* Backup & Data */}
                {renderHeader(t('backupRestore', language), Download, 'backup', primaryColor)}
                {activeSection === 'backup' && (
                    <Card style={styles.sectionContent}>
                        <Text style={[styles.hint, { color: mutedColor, marginBottom: 12 }]}>
                            {t('exportDataDescription', language)}
                        </Text>
                        <Button title={t('backupAllJson', language)} variant="shortcut" onPress={() => handleExportData('json')} icon={Download} />
                        <View style={{ height: 12 }} />
                        <Button title={t('exportInvoicesCsv', language)} variant="shortcut" onPress={() => handleExportData('csv')} icon={FileText} />
                    </Card>
                )}

                {/* Account Settings */}
                {renderHeader(t('accountSecurity', language), User, 'account', primaryColor)}
                {activeSection === 'account' && (
                    <Card style={styles.sectionContent}>
                        <Button
                            title={t('manageProfileSecurity', language)}
                            variant="shortcut"
                            icon={User}
                            onPress={() => navigation.navigate('Settings', { screen: 'SettingsMain' })}
                        />
                        <View style={{ height: 12 }} />
                        <Button
                            title={t('manageCompanies', language)}
                            variant="shortcut"
                            icon={Settings}
                            onPress={() => navigation.navigate('ManageCompanies')}
                        />
                    </Card>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20, gap: 16 },
    backButton: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.05)', alignItems: 'center', justifyContent: 'center' },
    subtitle: { fontSize: 13, fontWeight: '500', marginBottom: 2 },
    title: { fontSize: 28, fontWeight: '800' },
    statusIndicator: {
        position: 'absolute',
        top: 60,
        right: 20,
    },
    savingBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 79, 254, 0.1)',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 20
    },
    savedBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 20
    },
    scroll: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 60 },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderRadius: 14,
        marginBottom: 10,
    },
    sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
    sectionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
    sectionTitle: { fontSize: 16, fontWeight: '700' },
    sectionContent: { padding: 20, borderRadius: 20, marginTop: -6, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
    subLabel: { fontSize: 12, fontWeight: 'bold', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
    hint: { fontSize: 13, lineHeight: 20 },
    inputLabel: { fontSize: 14, fontWeight: '600' },
    switchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
        backgroundColor: 'rgba(0,0,0,0.02)',
        padding: 10,
        borderRadius: 12
    },
    switchText: { fontSize: 12, fontWeight: '600', marginLeft: 8 },
    label: { fontSize: 14, fontWeight: 'bold', marginBottom: 12 },
    divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginVertical: 16 },
    langGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    langOption: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
    langText: { fontSize: 13, fontWeight: '600' },
    sequenceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, borderBottomWidth: 1 },
    sequenceCopy: { flex: 1, paddingRight: 12 },
    sequencePreview: { fontSize: 12, fontWeight: '800', maxWidth: 150, textAlign: 'right' },
    intelligenceSettingRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottomWidth: 1 },
    intelligenceSettingLabel: { flex: 1, fontSize: 13, fontWeight: '600' },
});
