import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    Alert,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { ArrowLeft, User, Percent, FileText, MapPin, Globe, ChevronDown, ChevronUp, Trash2 } from 'lucide-react-native';
import { supabase } from '@invoice-monorepo/api';
import { useAuth } from '@invoice-monorepo/hooks';
import { useTheme } from '@invoice-monorepo/hooks';
import { Card, Button, Input } from '@invoice-monorepo/ui';
import { getWorkspaceScope } from '../../services/workspace';
import { getLocalizedErrorMessage, t } from '@invoice-monorepo/i18n';
import { deleteCustomer, getCustomer, saveCustomer } from '@invoice-monorepo/api/repositories';

interface ClientFormScreenProps {
    navigation: any;
    route: any;
}

const wholePercentageValue = (value: unknown) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.min(100, Math.max(0, Math.trunc(parsed)));
};

const wholePercentageText = (text: string) => {
    const integerPart = text.split(/[.,]/, 1)[0].replace(/\D/g, '');
    return integerPart ? String(wholePercentageValue(integerPart)) : '';
};

export function ClientFormScreen({ navigation, route }: ClientFormScreenProps) {
    const { user } = useAuth();
    const { isDark, language } = useTheme();
    const clientId = route.params?.clientId;
    const isEditing = !!clientId;

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        zip_code: '',
        country: '',
        tax_id: '',
        nui: '',
        fiscal_number: '',
        vat_number: '',
        discount_percent: 0,
        notes: '',
    });
    const [loading, setLoading] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const saveInFlight = useRef(false);

    const bgColor = isDark ? '#0D1B2A' : '#F7F9FC';
    const textColor = isDark ? '#fff' : '#111827';
    const mutedColor = isDark ? '#98A2B3' : '#667085';
    const cardBg = isDark ? '#14243A' : '#ffffff';

    useEffect(() => {
        if (isEditing) fetchClient();
    }, [clientId]);

    const fetchClient = async () => {
        if (!user) return;
        const { companyIds } = await getWorkspaceScope(user.id);
        const data = await getCustomer(supabase, clientId, { userId: user.id, companyIds });
        if (data) {
            const client = data as unknown as Partial<Parameters<typeof saveCustomer>[1]> & Record<string, unknown>;
            setFormData({
            name: String(client.name || ''),
            email: String(client.email || ''),
            phone: String(client.phone || ''),
            address: String(client.address || ''),
            city: String(client.city || ''),
            zip_code: String(client.zip_code || ''),
            country: String(client.country || ''),
            tax_id: String(client.tax_id || ''),
            nui: String(client.nui || ''),
            fiscal_number: String(client.fiscal_number || ''),
            vat_number: String(client.vat_number || ''),
            discount_percent: wholePercentageValue(client.discount_percent),
            notes: String(client.notes || ''),
        });
        }
    };

    const handleSave = async () => {
        if (saveInFlight.current) return;
        if (!formData.name) {
            Alert.alert(t('error', language), t('nameRequired', language));
            return;
        }

        if (!user?.id) {
            Alert.alert(t('error', language), t('loginRequired', language));
            return;
        }

        saveInFlight.current = true;
        setLoading(true);
        try {
            // Do not use the user ID as a company ID. Older profiles can exist
            // without a company yet, and the company-scoped RLS policy allows
            // those creator-owned rows only when company_id is null.
            // Resolve the selected company from the actual company rows so a
            // legacy profile.company_id that points at the user UUID cannot be
            // sent to the database as a non-existent company.
            const { company } = await getWorkspaceScope(user.id);
            const companyId = company?.id ?? null;

            await saveCustomer(supabase, { ...formData, discount_percent: wholePercentageValue(formData.discount_percent), user_id: user.id, company_id: companyId }, isEditing ? clientId : null);
            navigation.goBack();
        } catch (error: any) {
            console.error('Exception:', error);
            Alert.alert(t('error', language), `${t('saveError', language)}: ${getLocalizedErrorMessage(error, language, 'somethingWentWrong')}`);
        } finally {
            saveInFlight.current = false;
            setLoading(false);
        }
    };

    const handleDelete = () => {
        if (!clientId) return;
        Alert.alert(
            t('delete', language),
            t('deleteClientConfirmation', language),
            [
                { text: t('cancel', language), style: 'cancel' },
                {
                    text: t('delete', language),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            if (!user?.id) throw new Error(t('loginRequired', language));
                            setDeleting(true);
                            const { company } = await getWorkspaceScope(user.id);
                            await deleteCustomer(supabase, clientId, company?.id ?? null, user.id);
                            navigation.goBack();
                        } catch (error) {
                            Alert.alert(
                                t('error', language),
                                error instanceof Error ? error.message : t('failedToDeleteClient', language),
                            );
                        } finally {
                            setDeleting(false);
                        }
                    },
                },
            ],
        );
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={0}
            testID="customer-form-screen"
            style={[styles.container, { backgroundColor: bgColor }]}
        >
            <View style={styles.header}>
                <TouchableOpacity testID="customer-form-back-button" accessibilityRole="button" onPress={() => navigation.goBack()} style={styles.backButton}>
                    <ArrowLeft color={textColor} size={24} />
                </TouchableOpacity>
                <View>
                    <Text style={[styles.subtitle, { color: mutedColor }]}>{isEditing ? t('updateClient', language) : t('newClient', language)}</Text>
                    <Text style={[styles.title, { color: textColor }]}>{t('clientDetails', language)}</Text>
                </View>
            </View>

            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="always"
                keyboardDismissMode="none"
            >
                {/* Contact Info */}
                <View style={[styles.section, { backgroundColor: cardBg }]}>
                    <View style={styles.sectionHeader}>
                        <User color="#004FFE" size={20} />
                        <Text style={[styles.sectionTitle, { color: textColor }]}>{t('contactInfo', language)}</Text>
                    </View>
                    <Input testID="customer-name-input" label={`${t('name', language)} *`} value={formData.name} onChangeText={(text) => setFormData((current) => ({ ...current, name: text }))} placeholder={t('client', language)} />
                    <Input testID="customer-email-input" label={t('email', language)} value={formData.email} onChangeText={(text) => setFormData((current) => ({ ...current, email: text }))} placeholder={t('email', language)} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} blurOnSubmit={false} />
                    <Input testID="customer-phone-input" label={t('phone', language)} value={formData.phone} onChangeText={(text) => setFormData((current) => ({ ...current, phone: text }))} placeholder={t('phone', language)} keyboardType="phone-pad" blurOnSubmit={false} />
                </View>

                {/* Address Details */}
                <View style={[styles.section, { backgroundColor: cardBg }]}>
                    <View style={styles.sectionHeader}>
                        <MapPin color="#12B76A" size={20} />
                        <Text style={[styles.sectionTitle, { color: textColor }]}>{t('addressDetails', language)}</Text>
                    </View>
                    <Input testID="customer-address-input" label={t('streetAddress', language)} value={formData.address} onChangeText={(text) => setFormData((current) => ({ ...current, address: text }))} placeholder={t('fullAddress', language)} multiline />
                    <View style={styles.row}>
                        <View style={styles.halfField}>
                            <Input testID="customer-city-input" label={t('city', language)} value={formData.city} onChangeText={(text) => setFormData((current) => ({ ...current, city: text }))} placeholder={t('city', language)} />
                        </View>
                        <View style={styles.halfField}>
                            <Input testID="customer-zip-input" label={t('zipCode', language)} value={formData.zip_code} onChangeText={(text) => setFormData((current) => ({ ...current, zip_code: text }))} placeholder={t('zip', language)} keyboardType="number-pad" />
                        </View>
                    </View>
                    <Input testID="customer-country-input" label={t('country', language)} value={formData.country} onChangeText={(text) => setFormData((current) => ({ ...current, country: text }))} placeholder={t('country', language)} />
                </View>

                <TouchableOpacity testID="customer-more-options-button" accessibilityRole="button" accessibilityState={{ expanded: showAdvanced }} onPress={() => setShowAdvanced((current) => !current)} style={styles.advancedToggle}>
                    <Text style={[styles.advancedText, { color: '#004FFE' }]}>{showAdvanced ? t('hideBusinessDetails', language) : t('moreOptions', language)}</Text>
                    {showAdvanced ? <ChevronUp color="#004FFE" size={17} /> : <ChevronDown color="#004FFE" size={17} />}
                </TouchableOpacity>

                {/* Business Info */}
                {showAdvanced ? <View style={[styles.section, { backgroundColor: cardBg }]}>
                    <View style={styles.sectionHeader}>
                        <Globe color="#12B76A" size={20} />
                        <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={[styles.sectionTitle, { color: textColor }]}>{t('businessDetails', language)}</Text>
                            <TouchableOpacity
                                testID="customer-check-registry-button"
                                accessibilityRole="button"
                                style={{ backgroundColor: '#12B76A20', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}
                                onPress={() => WebBrowser.openBrowserAsync('https://apps.atk-ks.org/BizPasiveApp/VatRegist/Index')}
                            >
                                <Text style={{ color: '#12B76A', fontSize: 12, fontWeight: '600' }}>{t('checkRegistry', language)} ↗</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                    <Input label={t('taxIdNui', language)} value={formData.nui || formData.tax_id} onChangeText={(text) => setFormData((current) => ({ ...current, nui: text, tax_id: text }))} placeholder={t('taxIdRegistration', language)} />
                    <Input label={t('fiscalNumber', language)} value={formData.fiscal_number} onChangeText={(text) => setFormData((current) => ({ ...current, fiscal_number: text }))} placeholder={t('fiscalNumber', language)} />
                    <Input label={t('vatNumberLabel', language)} value={formData.vat_number} onChangeText={(text) => setFormData((current) => ({ ...current, vat_number: text }))} placeholder={t('vatNumber', language)} />
                </View> : null}

                {/* Discount */}
                {showAdvanced ? <View style={[styles.section, { backgroundColor: cardBg }]}>
                    <View style={styles.sectionHeader}>
                        <Percent color="#f59e0b" size={20} />
                        <Text style={[styles.sectionTitle, { color: textColor }]}>{t('clientDiscount', language)}</Text>
                    </View>
                    <Text style={[styles.hintText, { color: mutedColor }]}>
                        {t('clientDiscountDescription', language)}
                    </Text>
                    <Input
                        label={`${t('discount', language)} (%)`}
                        value={String(formData.discount_percent || 0)}
                        onChangeText={(text) => setFormData((current) => ({ ...current, discount_percent: wholePercentageValue(wholePercentageText(text)) }))}
                        placeholder="0"
                        keyboardType="number-pad"
                    />
                </View> : null}

                {/* Notes */}
                {showAdvanced ? <View style={[styles.section, { backgroundColor: cardBg }]}>
                    <Input
                        label={t('notes', language)}
                        value={formData.notes}
                        onChangeText={(text) => setFormData((current) => ({ ...current, notes: text }))}
                        placeholder={t('additionalNotes', language)}
                        multiline
                        numberOfLines={3}
                    />
                </View> : null}

                <Button
                    testID="customer-save-button"
                    title={isEditing ? t('updateClient', language) : t('createClient', language)}
                    onPress={handleSave}
                    loading={loading}
                    style={styles.saveButton}
                />
                {isEditing ? (
                    <Button
                        testID="customer-delete-button"
                        title={t('delete', language)}
                        onPress={handleDelete}
                        loading={deleting}
                        disabled={loading || deleting}
                        variant="danger"
                        icon={Trash2}
                        style={styles.deleteButton}
                    />
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
    sectionTitle: { fontSize: 16, fontWeight: '600' },
    hintText: { fontSize: 13, marginBottom: 12, lineHeight: 20 },
    row: { flexDirection: 'row', gap: 12 },
    halfField: { flex: 1 },
    saveButton: { marginTop: 8 },
    deleteButton: { marginTop: 12 },
    advancedToggle: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    advancedText: { fontSize: 13, fontWeight: '700' },
});
