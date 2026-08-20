import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet, Image, Switch, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import Constants from 'expo-constants';
import {
    ChevronRight, Moon, Sun, Smartphone, Camera, Upload, X,
    Image as ImageIcon, PenTool, Stamp, Palette, CreditCard, Languages,
    ShieldCheck, Briefcase, Users, Building, Zap, LogOut, Plus, Edit2, Trash2, Share2
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { SvgXml } from 'react-native-svg';

import { supabase } from '@invoice-monorepo/api';
import { deactivateCompanyBankAccount, listCompanyBankAccounts, listCompanyBankAccountShares, revokeCompanyBankAccountShare, saveCompanyBankAccount, shareCompanyBankAccount } from '@invoice-monorepo/api/repositories';
import { useAuth } from '@invoice-monorepo/hooks';
import { useTheme } from '@invoice-monorepo/hooks';
import { Input, SignaturePadModal } from '@invoice-monorepo/ui';
import { CompanyBankAccount, CompanyBankAccountShare, Profile } from '@invoice-monorepo/types';
import { t } from '@invoice-monorepo/i18n';
import { brand, getPalette, normalizeBrandColor } from '../../theme/brand';
import { getWorkspaceScope } from '../../services/workspace';
import { MobileHeader, MobileScreen, ShortcutRow } from '../../components/mobile/MobileUI';
import { StampGeneratorModal } from '../../components/mobile/StampGeneratorModal';

const languages = [
    { code: 'en', label: 'English', flag: '🇬🇧' },
    { code: 'sq', label: 'Shqip', flag: '🇦🇱' },
];

const appColors = [
    '#004FFE', '#3388FF', '#8CC2FF', '#12B76A', '#06B6D4', '#F59E0B', '#EF4444', '#0D1B2A'
];

type BankAccountForm = {
    bank_name: string;
    account_name: string;
    account_number: string;
    iban: string;
    swift_bic: string;
    currency: string;
    is_primary: boolean;
};

const emptyBankAccountForm: BankAccountForm = {
    bank_name: '',
    account_name: '',
    account_number: '',
    iban: '',
    swift_bic: '',
    currency: 'EUR',
    is_primary: false,
};

export function SettingsScreen({ navigation }: any) {
    const { user, signOut } = useAuth();
    const { themeMode, setThemeMode, isDark, primaryColor, setPrimaryColor, language, setLanguage } = useTheme();
    const [profile, setProfile] = useState<Profile>({
        id: user?.id || '',
        company_name: '',
        email: user?.email || '',
        phone: '',
        address: '',
        city: '',
        country: '',
        website: '',
        currency: 'EUR',
        tax_rate: 0,
        tax_name: 'VAT',
        primary_color: '#004FFE',
        is_grayscale: false,
        updated_at: new Date().toISOString(),
    });
    const [activeSection, setActiveSection] = useState<string | null>('personal');
    const [showSignaturePad, setShowSignaturePad] = useState(false);
    const [showStampGenerator, setShowStampGenerator] = useState(false);
    const [workspaceRole, setWorkspaceRole] = useState<'super_administrator' | 'company_administrator' | 'manager' | 'employee'>('employee');
    const [bankAccounts, setBankAccounts] = useState<CompanyBankAccount[]>([]);
    const [bankAccountsLoading, setBankAccountsLoading] = useState(false);
    const [bankAccountSaving, setBankAccountSaving] = useState(false);
    const [showBankAccountForm, setShowBankAccountForm] = useState(false);
    const [editingBankAccountId, setEditingBankAccountId] = useState<string | null>(null);
    const [bankAccountForm, setBankAccountForm] = useState<BankAccountForm>(emptyBankAccountForm);
    const [showBankShareForm, setShowBankShareForm] = useState(false);
    const [sharingBankAccount, setSharingBankAccount] = useState<CompanyBankAccount | null>(null);
    const [shareableCompanies, setShareableCompanies] = useState<Array<{ id: string; company_name?: string }>>([]);
    const [bankAccountShares, setBankAccountShares] = useState<CompanyBankAccountShare[]>([]);
    const [bankShareSaving, setBankShareSaving] = useState(false);

    const palette = getPalette(isDark);
    const textColor = palette.text;
    const mutedColor = palette.muted;
    const cardBg = palette.surface;
    const accentBg = palette.surfaceMuted;
    const borderColor = palette.border;
    const sectionPanelStyle = [styles.sectionContent, { backgroundColor: cardBg, borderColor }];

    useEffect(() => {
        fetchProfile();
    }, []);

    const fetchProfile = async () => {
        if (!user) return;
        let workspaceScope: Awaited<ReturnType<typeof getWorkspaceScope>> | null = null;
        try {
            workspaceScope = await getWorkspaceScope(user.id);
            setWorkspaceRole(workspaceScope.roleCode);
            await fetchBankAccounts(workspaceScope.companyId);
        } catch {
            setWorkspaceRole('employee');
        }
        const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        if (profileData) {
            let combined = { ...profileData };
            if (profileData.active_company_id) {
                const { data: companyData } = await supabase.from('companies').select('*').eq('id', profileData.active_company_id).single();
                if (companyData) {
                    combined = { ...combined, ...companyData };
                }
            }
            setProfile({
                ...combined,
                currency: 'EUR',
                primary_color: normalizeBrandColor(combined.primary_color),
            });
        }
    };

    const fetchBankAccounts = async (companyId?: string) => {
        if (!user) return;
        setBankAccountsLoading(true);
        try {
            const activeCompanyId = companyId || (await getWorkspaceScope(user.id)).companyId;
            const rows = await listCompanyBankAccounts(supabase, activeCompanyId);
            setBankAccounts(rows as unknown as CompanyBankAccount[]);
        } catch (error) {
            console.warn('Bank account load error:', error);
        } finally {
            setBankAccountsLoading(false);
        }
    };

    const resetBankAccountForm = () => {
        setBankAccountForm(emptyBankAccountForm);
        setEditingBankAccountId(null);
        setShowBankAccountForm(false);
    };

    const resetBankShareForm = () => {
        setShowBankShareForm(false);
        setSharingBankAccount(null);
        setShareableCompanies([]);
        setBankAccountShares([]);
    };

    const openBankShareForm = async (account: CompanyBankAccount) => {
        if (account.is_shared) return;
        try {
            if (!user) return;
            const scope = await getWorkspaceScope(user.id);
            const shares = await listCompanyBankAccountShares(supabase, account.id);
            setSharingBankAccount(account);
            setBankAccountShares(shares);
            setShareableCompanies(scope.companies
                .filter((company) => company.id !== scope.companyId)
                .map((company) => ({ id: company.id, company_name: company.company_name })));
            setShowBankShareForm(true);
        } catch (error) {
            Alert.alert(t('error', language), error instanceof Error ? error.message : t('bankAccountShareError', language));
        }
    };

    const handleShareBankAccount = async (companyId: string) => {
        if (!sharingBankAccount) return;
        setBankShareSaving(true);
        try {
            await shareCompanyBankAccount(supabase, sharingBankAccount.id, companyId);
            setBankAccountShares(await listCompanyBankAccountShares(supabase, sharingBankAccount.id));
        } catch (error) {
            Alert.alert(t('error', language), error instanceof Error ? error.message : t('bankAccountShareError', language));
        } finally {
            setBankShareSaving(false);
        }
    };

    const handleRevokeBankAccountShare = async (companyId: string) => {
        if (!sharingBankAccount) return;
        setBankShareSaving(true);
        try {
            await revokeCompanyBankAccountShare(supabase, sharingBankAccount.id, companyId);
            setBankAccountShares(await listCompanyBankAccountShares(supabase, sharingBankAccount.id));
        } catch (error) {
            Alert.alert(t('error', language), error instanceof Error ? error.message : t('bankAccountShareError', language));
        } finally {
            setBankShareSaving(false);
        }
    };

    const startBankAccountEdit = (account: CompanyBankAccount) => {
        setEditingBankAccountId(account.id);
        setBankAccountForm({
            bank_name: account.bank_name || '',
            account_name: account.account_name || '',
            account_number: account.account_number || '',
            iban: account.iban || '',
            swift_bic: account.swift_bic || '',
            currency: account.currency || 'EUR',
            is_primary: account.is_primary,
        });
        setShowBankAccountForm(true);
    };

    const handleSaveBankAccount = async () => {
        if (!user) return;
        if (!bankAccountForm.bank_name.trim() || (!bankAccountForm.account_number.trim() && !bankAccountForm.iban.trim())) {
            Alert.alert(t('error', language), t('bankAccountDetailsRequired', language));
            return;
        }

        setBankAccountSaving(true);
        try {
            const { companyId } = await getWorkspaceScope(user.id);
            const shouldBePrimary = bankAccountForm.is_primary || bankAccounts.length === 0;
            if (shouldBePrimary) {
                const { error } = await supabase
                    .from('company_bank_accounts')
                    .update({ is_primary: false })
                    .eq('company_id', companyId)
                    .eq('is_active', true);
                if (error) throw error;
            }

            await saveCompanyBankAccount(supabase, {
                company_id: companyId,
                bank_name: bankAccountForm.bank_name,
                account_name: bankAccountForm.account_name,
                account_number: bankAccountForm.account_number,
                iban: bankAccountForm.iban,
                swift_bic: bankAccountForm.swift_bic,
                currency: bankAccountForm.currency,
                is_primary: shouldBePrimary,
                created_by: user.id,
                updated_by: user.id,
            }, editingBankAccountId);
            await fetchBankAccounts(companyId);
            resetBankAccountForm();
        } catch (error) {
            Alert.alert(t('error', language), error instanceof Error ? error.message : t('saveError', language));
        } finally {
            setBankAccountSaving(false);
        }
    };

    const handleDeactivateBankAccount = (account: CompanyBankAccount) => {
        Alert.alert(
            t('removeBankAccount', language),
            t('removeBankAccountConfirmation', language),
            [
                { text: t('cancel', language), style: 'cancel' },
                {
                    text: t('remove', language),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            if (!user) return;
                            const { companyId } = await getWorkspaceScope(user.id);
                            await deactivateCompanyBankAccount(supabase, account.id, companyId);
                            await fetchBankAccounts(companyId);
                        } catch (error) {
                            Alert.alert(t('error', language), error instanceof Error ? error.message : t('saveError', language));
                        }
                    },
                },
            ],
        );
    };

    const updateProfile = async (updates: Partial<Profile>) => {
        // Optimistic update
        setProfile(prev => ({ ...prev, ...updates }));

        // Global state updates
        if (updates.primary_color) setPrimaryColor(updates.primary_color);
        if (updates.invoice_language) setLanguage(updates.invoice_language);

        try {
            // Determine if we are updating profile or company fields
            let profileUpdates: any = {};
            let companyUpdates: any = {};
            const profileKeys = ['biometric_enabled', 'invoice_language', 'primary_color', 'default_client_discount'];

            Object.keys(updates).forEach(key => {
                if (profileKeys.includes(key)) {
                    profileUpdates[key] = (updates as any)[key];
                } else if (profile.active_company_id) {
                    companyUpdates[key] = (updates as any)[key];
                } else {
                    // If no company, everything goes to profile (fallback)
                    profileUpdates[key] = (updates as any)[key];
                }
            });

            // Update Profile Table
            if (Object.keys(profileUpdates).length > 0) {
                const { error: pErr } = await supabase.from('profiles').update({
                    ...profileUpdates,
                    updated_at: new Date().toISOString()
                }).eq('id', user?.id);
                if (pErr) throw pErr;
            }

            // Update Company Table if applicable
            if (profile.active_company_id && Object.keys(companyUpdates).length > 0) {
                const { error: cErr } = await supabase.from('companies').update({
                    ...companyUpdates
                }).eq('id', profile.active_company_id);
                if (cErr) throw cErr;
            }

        } catch (error: any) {
            console.error('Error auto-saving:', error);
        }
    };


    const pickImage = async (type: 'logo' | 'signature' | 'stamp') => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: type === 'logo' ? [1, 1] : [4, 1],
            quality: 0.5,
            base64: true,
        });

        if (!result.canceled && result.assets[0].base64) {
            const base64 = `data:image/png;base64,${result.assets[0].base64}`;
            const field = `${type}_url` as keyof Profile;
            updateProfile({ [field]: base64 });
        }
    };

    const pickLogo = async () => {
        const result = await DocumentPicker.getDocumentAsync({
            type: ['image/png', 'image/svg+xml'],
            copyToCacheDirectory: true,
            multiple: false,
        });

        if (result.canceled || !result.assets[0]) return;

        const asset = result.assets[0];
        const isSvg = asset.mimeType === 'image/svg+xml' || /\.svg$/i.test(asset.name || asset.uri);
        const isPng = asset.mimeType === 'image/png' || /\.png$/i.test(asset.name || asset.uri);
        if (!isSvg && !isPng) {
            Alert.alert(t('error', language), t('logoFormatError', language));
            return;
        }
        if (asset.size && asset.size > 5 * 1024 * 1024) {
            Alert.alert(t('error', language), t('logoTooLarge', language));
            return;
        }

        try {
            if (isSvg) {
                const svg = await FileSystem.readAsStringAsync(asset.uri);
                updateProfile({ logo_url: `data:image/svg+xml,${encodeURIComponent(svg)}` });
            } else {
                const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' });
                updateProfile({ logo_url: `data:image/png;base64,${base64}` });
            }
        } catch (error) {
            console.error('Logo upload error:', error);
            Alert.alert(t('error', language), t('logoUploadError', language));
        }
    };

    const renderHeader = (title: string, Icon: any, section: string, color: string) => {
        const isActive = activeSection === section;
        return (
            <TouchableOpacity
                testID={`settings-section-${section}`}
                accessibilityRole="button"
                accessibilityState={{ expanded: isActive }}
                style={[styles.sectionHeader, { backgroundColor: cardBg, borderColor }, isActive && styles.sectionHeaderActive]}
                onPress={() => setActiveSection(isActive ? null : section)}
            >
                <View style={styles.sectionHeaderLeft}>
                    <View style={[styles.sectionIcon, { backgroundColor: palette.iconSurface }]}>
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

    const confirmSignOut = () => Alert.alert(
        t('signOut', language),
        t('signOutWorkspace', language),
        [
            { text: t('cancel', language), style: 'cancel' },
            { text: t('signOut', language), style: 'destructive', onPress: () => void signOut() },
        ],
    );

    return (
        <MobileScreen testID="settings-screen">
            <MobileHeader
                title={t('businessSettings', language) || 'Settings'}
                subtitle={t('workspacePreferences', language)}
                onBack={() => navigation.goBack()}
            />

            <KeyboardAvoidingView
                style={styles.keyboardAvoidingView}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={0}
            >
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="always" keyboardDismissMode="none">
                {/* User Info Overview (Merged from Profile) */}
                <View style={[styles.userCard, { backgroundColor: cardBg, borderColor }]}>
                    <View style={[styles.userAvatar, { backgroundColor: primaryColor }]}>
                        <Text style={styles.avatarText}>{user?.email?.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={styles.userDetails}>
                        <Text style={[styles.userName, { color: textColor }]}>{user?.email?.split('@')[0]}</Text>
                        <Text style={[styles.userEmail, { color: mutedColor }]}>{user?.email}</Text>
                    </View>
                </View>

                {/* Personal Settings (Merged from Profile) */}
                {renderHeader(t('language', language), Languages, 'personal', primaryColor)}
                {activeSection === 'personal' && (
                    <View style={sectionPanelStyle}>
                        <Text style={[styles.label, { color: textColor }]}>{t('appLanguage', language)}</Text>
                        <View style={styles.grid}>
                            {languages.map(lang => (
                                <TouchableOpacity
                                    testID={`settings-language-${lang.code}-button`}
                                    key={lang.code}
                                    style={[
                                        styles.optionChip,
                                        { backgroundColor: accentBg, borderColor, flex: 1 },
                                        language === lang.code && { backgroundColor: primaryColor }
                                    ]}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: language === lang.code }}
                                    onPress={() => updateProfile({ invoice_language: lang.code })}
                                >
                                    <Text style={[
                                        styles.optionText,
                                        { color: textColor },
                                        language === lang.code && { color: '#fff' }
                                    ]}>{lang.flag} {lang.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                )}

                {/* Appearance (Merged from Profile) */}
                {renderHeader(t('appTheme', language), Palette, 'appearance', primaryColor)}
                {activeSection === 'appearance' && (
                    <View style={sectionPanelStyle}>
                        <Text style={[styles.label, { color: textColor }]}>{t('appTheme', language)}</Text>
                        <View style={styles.grid}>
                            {[
                                { label: t('systemTheme', language), value: 'system', icon: Smartphone },
                                { label: t('lightMode', language), value: 'light', icon: Sun },
                                { label: t('darkMode', language), value: 'dark', icon: Moon },
                            ].map(mode => (
                                <TouchableOpacity
                                    testID={`settings-theme-${mode.value}-button`}
                                    key={mode.value}
                                    style={[
                                        styles.optionChip,
                                        { backgroundColor: accentBg, borderColor, flex: 1, minWidth: 0, flexDirection: 'row', gap: 7, justifyContent: 'center' },
                                        themeMode === mode.value && { backgroundColor: primaryColor }
                                    ]}
                                    onPress={() => setThemeMode(mode.value as any)}
                                >
                                    {React.createElement(mode.icon, { size: 16, color: themeMode === mode.value ? '#fff' : textColor })}
                                    <Text style={[
                                        styles.optionText,
                                        { color: textColor },
                                        themeMode === mode.value && { color: '#fff' }
                                    ]}>{mode.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <View style={[styles.divider, { backgroundColor: borderColor }]} />
                        <Text style={[styles.label, { color: textColor }]}>{t('brandColor', language)}</Text>
                        <View style={styles.colorGrid}>
                            {appColors.map(color => (
                                <TouchableOpacity
                                    key={color}
                                    style={[
                                        styles.colorOption,
                                        { backgroundColor: color },
                                        profile.primary_color === color && { borderColor: textColor, borderWidth: 3 }
                                    ]}
                                    onPress={() => updateProfile({ primary_color: color })}
                                />
                            ))}
                        </View>
                    </View>
                )}

                {/* Advanced Settings Link */}
                <ShortcutRow
                    icon={Zap}
                    title={t('advancedSettingsTitle', language)}
                    description={t('advancedSettingsDescription', language)}
                    onPress={() => navigation.navigate('AdvancedSettings')}
                    trailing={<ChevronRight color={palette.muted} size={18} />}
                />

                {/* Company Info */}
                {renderHeader(t('companyProfile', language), Briefcase, 'company', primaryColor)}
                {activeSection === 'company' && (
                    <View style={sectionPanelStyle}>
                        <Input label={t('companyName', language)} value={profile.company_name} onChangeText={(value) => setProfile({ ...profile, company_name: value })} onEndEditing={() => updateProfile({ company_name: profile.company_name })} />
                        <Input label={t('taxIdRegistration', language)} value={profile.tax_id} onChangeText={(value) => setProfile({ ...profile, tax_id: value })} onEndEditing={() => updateProfile({ tax_id: profile.tax_id })} />
                        <Input label={t('email', language)} value={profile.email} onChangeText={(value) => setProfile({ ...profile, email: value })} onEndEditing={() => updateProfile({ email: profile.email })} keyboardType="email-address" />
                        <Input label={t('phone', language)} value={profile.phone} onChangeText={(value) => setProfile({ ...profile, phone: value })} onEndEditing={() => updateProfile({ phone: profile.phone })} keyboardType="phone-pad" />
                        <Input label={t('address', language)} value={profile.address} onChangeText={(value) => setProfile({ ...profile, address: value })} onEndEditing={() => updateProfile({ address: profile.address })} multiline />
                        <View style={{ flexDirection: 'row', gap: 12 }}>
                            <View style={{ flex: 1 }}>
                                <Input label={t('city', language)} value={profile.city} onChangeText={(value) => setProfile({ ...profile, city: value })} onEndEditing={() => updateProfile({ city: profile.city })} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Input label={t('country', language)} value={profile.country} onChangeText={(value) => setProfile({ ...profile, country: value })} onEndEditing={() => updateProfile({ country: profile.country })} />
                            </View>
                        </View>
                        <Input label={t('website', language)} value={profile.website} onChangeText={(value) => setProfile({ ...profile, website: value })} onEndEditing={() => updateProfile({ website: profile.website })} placeholder="www.example.com" />
                    </View>
                )}

                {/* Identity & Visuals */}
                {renderHeader(t('logosSignatures', language), Camera, 'visuals', primaryColor)}
                {activeSection === 'visuals' && (
                    <View style={sectionPanelStyle}>
                        <AssetPicker label={t('companyLogo', language)} hint={t('logoFormatHint', language)} value={profile.logo_url} onPick={pickLogo} onClear={() => updateProfile({ logo_url: '' })} icon={ImageIcon} isDark={isDark} />
                        <AssetPicker
                            label={t('showSignature', language)}
                            value={profile.signature_url}
                            onPick={() => pickImage('signature')}
                            onClear={() => updateProfile({ signature_url: '' })}
                            onDraw={() => setShowSignaturePad(true)}
                            icon={PenTool}
                            isDark={isDark}
                        />
                        <AssetPicker label={t('officialStamp', language)} value={profile.stamp_url} onPick={() => pickImage('stamp')} onClear={() => updateProfile({ stamp_url: '' })} icon={Stamp} isDark={isDark} />
                        <TouchableOpacity
                            testID="settings-create-stamp-button"
                            accessibilityRole="button"
                            onPress={() => setShowStampGenerator(true)}
                            style={[styles.createStampButton, { borderColor: primaryColor, backgroundColor: `${primaryColor}12` }]}
                        >
                            <Stamp color={primaryColor} size={18} />
                            <Text style={[styles.createStampText, { color: primaryColor }]}>{t('createStamp', language)}</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Bank Details */}
                {renderHeader(t('bankDetails', language), CreditCard, 'payments', primaryColor)}
                {activeSection === 'payments' && (
                    <View style={sectionPanelStyle}>
                        <Text style={[styles.subLabel, { color: mutedColor }]}>{t('bankDetailsPdf', language)}</Text>
                        <Input label={t('bank', language)} value={profile.bank_name} onChangeText={(value) => setProfile({ ...profile, bank_name: value })} onEndEditing={() => updateProfile({ bank_name: profile.bank_name })} />
                        <Input label={t('iban', language)} value={profile.bank_iban} onChangeText={(value) => setProfile({ ...profile, bank_iban: value })} onEndEditing={() => updateProfile({ bank_iban: profile.bank_iban })} />
                        <Input label={t('swift', language)} value={profile.bank_swift} onChangeText={(value) => setProfile({ ...profile, bank_swift: value })} onEndEditing={() => updateProfile({ bank_swift: profile.bank_swift })} />

                        <View style={[styles.divider, { backgroundColor: borderColor }]} />
                        <View style={styles.bankAccountsHeader}>
                            <View style={styles.bankAccountsCopy}>
                                <Text style={[styles.label, { color: textColor }]}>{t('bankAccounts', language)}</Text>
                                <Text style={[styles.hint, { color: mutedColor }]}>{t('bankAccountsDescription', language)}</Text>
                            </View>
                            <TouchableOpacity
                                testID="settings-add-bank-account-button"
                                accessibilityRole="button"
                                onPress={() => {
                                    setEditingBankAccountId(null);
                                    setBankAccountForm({ ...emptyBankAccountForm, is_primary: bankAccounts.length === 0 });
                                    setShowBankAccountForm(true);
                                }}
                                style={[styles.addBankButton, { borderColor: primaryColor, backgroundColor: `${primaryColor}12` }]}
                            >
                                <Plus color={primaryColor} size={16} />
                                <Text style={[styles.addBankButtonText, { color: primaryColor }]}>{t('addBankAccount', language)}</Text>
                            </TouchableOpacity>
                        </View>

                        {bankAccountsLoading ? (
                            <Text style={[styles.hint, { color: mutedColor }]}>{t('loading', language)}</Text>
                        ) : bankAccounts.length ? (
                            <View style={styles.bankAccountList}>
                                {bankAccounts.map((account) => (
                                    <View key={account.id} style={[styles.bankAccountRow, { borderColor }]}>
                                        <View style={styles.bankAccountCopy}>
                                            <View style={styles.bankAccountNameRow}>
                                                <Text style={[styles.bankAccountName, { color: textColor }]} numberOfLines={1}>{account.bank_name}</Text>
                                                {account.is_primary ? <Text style={[styles.primaryBadge, { color: primaryColor, backgroundColor: `${primaryColor}15` }]}>{t('primary', language)}</Text> : null}
                                                {account.is_shared ? <Text style={[styles.primaryBadge, { color: mutedColor, backgroundColor: accentBg }]}>{t('sharedAccount', language)}</Text> : null}
                                            </View>
                                            <Text style={[styles.bankAccountDetails, { color: mutedColor }]} numberOfLines={1}>
                                                {account.account_name || account.iban || account.account_number || account.currency}
                                            </Text>
                                            {account.iban && account.account_name ? <Text style={[styles.bankAccountDetails, { color: mutedColor }]} numberOfLines={1}>{account.iban}</Text> : null}
                                        </View>
                                        <View style={styles.bankAccountActions}>
                                            {!account.is_shared ? <>
                                                <TouchableOpacity
                                                    testID={`settings-share-bank-account-${account.id}-button`}
                                                    accessibilityRole="button"
                                                    accessibilityLabel={`${t('share', language)} ${account.bank_name}`}
                                                    onPress={() => { void openBankShareForm(account); }}
                                                    style={styles.bankAccountAction}
                                                >
                                                    <Share2 color={mutedColor} size={17} />
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    testID={`settings-edit-bank-account-${account.id}-button`}
                                                    accessibilityRole="button"
                                                    accessibilityLabel={`${t('edit', language)} ${account.bank_name}`}
                                                    onPress={() => startBankAccountEdit(account)}
                                                    style={styles.bankAccountAction}
                                                >
                                                    <Edit2 color={mutedColor} size={17} />
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    testID={`settings-remove-bank-account-${account.id}-button`}
                                                    accessibilityRole="button"
                                                    accessibilityLabel={`${t('remove', language)} ${account.bank_name}`}
                                                    onPress={() => handleDeactivateBankAccount(account)}
                                                    style={styles.bankAccountAction}
                                                >
                                                    <Trash2 color={brand.colors.error} size={17} />
                                                </TouchableOpacity>
                                            </> : <Text style={[styles.sharedBankHint, { color: mutedColor }]}>{t('sharedBankAccountReadOnly', language)}</Text>}
                                        </View>
                                    </View>
                                ))}
                            </View>
                        ) : (
                            <Text style={[styles.hint, { color: mutedColor }]}>{t('noBankAccounts', language)}</Text>
                        )}

                        {showBankAccountForm ? (
                            <Modal visible transparent animationType="slide" onRequestClose={resetBankAccountForm}>
                                <KeyboardAvoidingView
                                    style={styles.bankAccountModalOverlay}
                                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                                    keyboardVerticalOffset={0}
                                >
                                    <View style={[styles.bankAccountModal, { borderColor, backgroundColor: cardBg }]}>
                                        <View style={styles.bankAccountModalHeader}>
                                            <Text style={[styles.bankAccountFormTitle, { color: textColor }]}>{editingBankAccountId ? t('editBankAccount', language) : t('addBankAccount', language)}</Text>
                                            <TouchableOpacity
                                                testID="settings-close-bank-account-form-button"
                                                accessibilityRole="button"
                                                accessibilityLabel={t('close', language)}
                                                onPress={resetBankAccountForm}
                                                style={styles.bankAccountCloseButton}
                                            >
                                                <X color={mutedColor} size={20} />
                                            </TouchableOpacity>
                                        </View>
                                        <ScrollView
                                            style={styles.bankAccountModalScroll}
                                            contentContainerStyle={styles.bankAccountModalScrollContent}
                                            keyboardShouldPersistTaps="always"
                                            keyboardDismissMode="none"
                                        >
                                            <Input label={`${t('bankName', language)} *`} value={bankAccountForm.bank_name} onChangeText={(value) => setBankAccountForm(prev => ({ ...prev, bank_name: value }))} />
                                            <Input label={t('accountName', language)} value={bankAccountForm.account_name} onChangeText={(value) => setBankAccountForm(prev => ({ ...prev, account_name: value }))} />
                                            <Input label={t('accountNumber', language)} value={bankAccountForm.account_number} onChangeText={(value) => setBankAccountForm(prev => ({ ...prev, account_number: value }))} keyboardType="number-pad" />
                                            <Input label={t('iban', language)} value={bankAccountForm.iban} onChangeText={(value) => setBankAccountForm(prev => ({ ...prev, iban: value }))} autoCapitalize="characters" />
                                            <Input label={t('swift', language)} value={bankAccountForm.swift_bic} onChangeText={(value) => setBankAccountForm(prev => ({ ...prev, swift_bic: value }))} autoCapitalize="characters" />
                                            <Input label={t('currency', language)} value={bankAccountForm.currency} onChangeText={(value) => setBankAccountForm(prev => ({ ...prev, currency: value.toUpperCase() }))} autoCapitalize="characters" />
                                            <View style={styles.primaryToggleRow}>
                                                <View style={styles.bankAccountsCopy}>
                                                    <Text style={[styles.optionTitle, { color: textColor }]}>{t('primaryBankAccount', language)}</Text>
                                                    <Text style={[styles.optionDescription, { color: mutedColor }]}>{t('primaryBankAccountDescription', language)}</Text>
                                                </View>
                                                <Switch
                                                    testID="settings-primary-bank-account-switch"
                                                    value={bankAccountForm.is_primary}
                                                    onValueChange={(value) => setBankAccountForm(prev => ({ ...prev, is_primary: value }))}
                                                    trackColor={{ false: borderColor, true: `${primaryColor}88` }}
                                                    thumbColor={bankAccountForm.is_primary ? primaryColor : '#f4f4f5'}
                                                />
                                            </View>
                                            <View style={styles.bankAccountFormActions}>
                                                <TouchableOpacity accessibilityRole="button" onPress={resetBankAccountForm} style={[styles.formSecondaryButton, { borderColor }]}>
                                                    <Text style={[styles.formSecondaryButtonText, { color: mutedColor }]}>{t('cancel', language)}</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    testID="settings-save-bank-account-button"
                                                    accessibilityRole="button"
                                                    onPress={() => { void handleSaveBankAccount(); }}
                                                    disabled={bankAccountSaving}
                                                    style={[styles.formPrimaryButton, { backgroundColor: primaryColor, opacity: bankAccountSaving ? 0.6 : 1 }]}
                                                >
                                                    <Text style={styles.formPrimaryButtonText}>{t('save', language)}</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </ScrollView>
                                    </View>
                                </KeyboardAvoidingView>
                            </Modal>
                        ) : null}
                        {showBankShareForm && sharingBankAccount ? (
                            <Modal visible transparent animationType="slide" onRequestClose={resetBankShareForm}>
                                <KeyboardAvoidingView
                                    style={styles.bankAccountModalOverlay}
                                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                                    keyboardVerticalOffset={0}
                                >
                                    <View style={[styles.bankAccountModal, { borderColor, backgroundColor: cardBg }]}>
                                        <View style={styles.bankAccountModalHeader}>
                                            <View style={styles.bankAccountsCopy}>
                                                <Text style={[styles.bankAccountFormTitle, { color: textColor }]}>{t('shareBankAccount', language)}</Text>
                                                <Text style={[styles.hint, { color: mutedColor }]}>{sharingBankAccount.bank_name} · {t('shareBankAccountDescription', language)}</Text>
                                            </View>
                                            <TouchableOpacity
                                                accessibilityRole="button"
                                                accessibilityLabel={t('close', language)}
                                                onPress={resetBankShareForm}
                                                style={styles.bankAccountCloseButton}
                                            >
                                                <X color={mutedColor} size={20} />
                                            </TouchableOpacity>
                                        </View>
                                        <ScrollView
                                            style={styles.bankAccountModalScroll}
                                            contentContainerStyle={styles.bankAccountModalScrollContent}
                                            keyboardShouldPersistTaps="always"
                                        >
                                            <Text style={[styles.label, { color: textColor }]}>{t('shareWithTenant', language)}</Text>
                                            {shareableCompanies.length ? shareableCompanies.map((company) => {
                                                const existingShare = bankAccountShares.find((share) => share.shared_company_id === company.id && share.is_active);
                                                return (
                                                    <View key={company.id} style={[styles.shareTenantRow, { borderColor }]}>
                                                        <View style={styles.bankAccountsCopy}>
                                                            <Text style={[styles.bankAccountName, { color: textColor }]}>{company.company_name || company.id}</Text>
                                                            {existingShare ? <Text style={[styles.hint, { color: mutedColor }]}>{t('sharedWith', language)}</Text> : null}
                                                        </View>
                                                        {existingShare ? (
                                                            <TouchableOpacity disabled={bankShareSaving} onPress={() => { void handleRevokeBankAccountShare(company.id); }} style={[styles.formSecondaryButton, { borderColor }]}>
                                                                <Text style={[styles.formSecondaryButtonText, { color: mutedColor }]}>{t('unshare', language)}</Text>
                                                            </TouchableOpacity>
                                                        ) : (
                                                            <TouchableOpacity disabled={bankShareSaving} onPress={() => { void handleShareBankAccount(company.id); }} style={[styles.formPrimaryButton, { backgroundColor: primaryColor, opacity: bankShareSaving ? 0.6 : 1 }]}>
                                                                <Text style={styles.formPrimaryButtonText}>{t('share', language)}</Text>
                                                            </TouchableOpacity>
                                                        )}
                                                    </View>
                                                );
                                            }) : <Text style={[styles.hint, { color: mutedColor }]}>{t('noOtherTenants', language)}</Text>}
                                            <TouchableOpacity onPress={resetBankShareForm} style={[styles.formSecondaryButton, { borderColor, alignSelf: 'flex-end', marginTop: 14 }]}>
                                                <Text style={[styles.formSecondaryButtonText, { color: mutedColor }]}>{t('close', language)}</Text>
                                            </TouchableOpacity>
                                        </ScrollView>
                                    </View>
                                </KeyboardAvoidingView>
                            </Modal>
                        ) : null}
                    </View>
                )}

                {/* Team & Collaboration */}
                {renderHeader(t('teamCollaboration', language), Users, 'team', primaryColor)}
                {activeSection === 'team' && (
                    <View style={sectionPanelStyle}>
                        <View style={styles.rowBetween}>
                            <View>
                                <Text style={[styles.label, { color: textColor }]}>{t('companyStatus', language)}</Text>
                                <Text style={[styles.hint, { color: mutedColor }]}>
                                    {t('role', language)}: <Text style={{ fontFamily: brand.fonts.semibold, color: primaryColor }}>{workspaceRole === 'super_administrator' ? 'SUPER ADMIN' : workspaceRole === 'company_administrator' ? 'ADMIN' : workspaceRole.toUpperCase()}</Text>
                                </Text>
                            </View>
                            <View style={[styles.badge, { backgroundColor: primaryColor + '20' }]}>
                                <Text style={{ color: primaryColor, fontSize: 10, fontFamily: brand.fonts.semibold }}>{t('active', language).toUpperCase()}</Text>
                            </View>
                        </View>

                        <View style={[styles.divider, { backgroundColor: borderColor }]} />

                        <Input
                            label={t('companyId', language)}
                            value={profile.company_id || user?.id}
                            editable={false}
                        />
                        <ShortcutRow
                            icon={Building}
                            title={t('company', language)}
                            description={t('switchOrManageCompanies', language)}
                            onPress={() => navigation.navigate('ManageCompanies')}
                            trailing={<ChevronRight color={palette.muted} size={18} />}
                        />
                    </View>
                )}

                {/* Security (Merged from Profile) */}
                {renderHeader(t('security', language), ShieldCheck, 'security', primaryColor)}
                {activeSection === 'security' && (
                    <View style={sectionPanelStyle}>
                        <View style={styles.rowBetween}>
                            <View style={{ flex: 1, marginRight: 16 }}>
                                <Text style={[styles.label, { color: textColor }]}>{t('biometricLock', language)}</Text>
                                <Text style={[styles.hint, { color: mutedColor }]}>{t('biometricDescription', language)}</Text>
                            </View>
                            <Switch
                                value={profile.biometric_enabled}
                                onValueChange={(val) => updateProfile({ biometric_enabled: val })}
                                trackColor={{ false: '#767577', true: primaryColor }}
                                thumbColor={'#f4f3f4'}
                            />
                        </View>
                    </View>
                )}




                <View style={styles.footer}>
                    <TouchableOpacity testID="settings-logout-button" accessibilityRole="button" onPress={confirmSignOut} style={[styles.signOut, { borderColor }]}>
                        <LogOut color={brand.colors.error} size={18} />
                        <Text style={[styles.signOutText, { color: brand.colors.error }]}>{t('signOut', language)}</Text>
                    </TouchableOpacity>
                    <Text style={[styles.version, { color: mutedColor }]}>{t('aboutOperixInvoice', language)} v{Constants.expoConfig?.version || '1.0.0'}</Text>
                </View>
            </ScrollView>
            </KeyboardAvoidingView>
            <SignaturePadModal
                visible={showSignaturePad}
                onClose={() => setShowSignaturePad(false)}
                onSave={(sig) => updateProfile({ signature_url: sig })}
                primaryColor={primaryColor}
            />
            <StampGeneratorModal
                visible={showStampGenerator}
                onClose={() => setShowStampGenerator(false)}
                onSave={(stamp) => updateProfile({ stamp_url: stamp })}
                companyName={profile.company_name}
                primaryColor={primaryColor}
            />
        </MobileScreen>
    );
}

function AssetPicker({ label, hint, value, onPick, onClear, onDraw, icon, isDark }: any) {
    const { language } = useTheme();
    const textColor = isDark ? '#fff' : '#111827';
    const mutedColor = isDark ? '#98A2B3' : '#667085';
    const borderColor = isDark ? '#263A55' : '#E4E9F0';
    const placeholderBackground = isDark ? '#102038' : '#F4F7FB';

    return (
        <View style={styles.assetContainer}>
            <Text style={[styles.assetLabel, { color: textColor }]}>{label}</Text>
            {hint ? <Text style={[styles.assetHint, { color: mutedColor }]}>{hint}</Text> : null}
            {value ? (
                <View style={[styles.assetPreview, { backgroundColor: placeholderBackground, borderColor }]}>
                    {value.startsWith('data:image/svg+xml') ? (
                        <View style={{ width: '100%', height: '100%', padding: 4 }}>
                            <SvgXml xml={decodeURIComponent(value.split(',')[1])} width="100%" height="100%" />
                        </View>
                    ) : (
                        <Image source={{ uri: value }} style={styles.assetImage} resizeMode="contain" />
                    )}
                    <TouchableOpacity style={styles.clearBadge} onPress={onClear}>
                        <X color="#fff" size={12} />
                    </TouchableOpacity>
                </View>
            ) : (
                onDraw ? (
                    <View style={[styles.assetPreview, { borderColor, backgroundColor: placeholderBackground, flexDirection: 'row', gap: 10, padding: 10 }]}>
                        <TouchableOpacity style={[styles.uploadPlaceholder, { backgroundColor: isDark ? '#263A55' : '#FFFFFF', borderRadius: 10 }]} onPress={onDraw}>
                            <PenTool color={mutedColor} size={20} />
                            <Text style={{ color: mutedColor, fontSize: 11, marginTop: 4, fontFamily: brand.fonts.medium }}>{t('draw', language)}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.uploadPlaceholder, { backgroundColor: isDark ? '#263A55' : '#FFFFFF', borderRadius: 10 }]} onPress={onPick}>
                            <Upload color={mutedColor} size={20} />
                            <Text style={{ color: mutedColor, fontSize: 11, marginTop: 4, fontFamily: brand.fonts.medium }}>{t('upload', language)}</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <TouchableOpacity style={[styles.assetPreview, { borderColor, backgroundColor: placeholderBackground }]} onPress={onPick}>
                        <View style={styles.uploadPlaceholder}>
                            {React.createElement(icon, { color: mutedColor, size: 24 })}
                            <Text style={{ color: mutedColor, fontSize: 12, marginTop: 4, fontFamily: brand.fonts.medium }}>{t('tapToUpload', language)}</Text>
                        </View>
                    </TouchableOpacity>
                )
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    keyboardAvoidingView: { flex: 1 },
    scroll: { flex: 1 },
    scrollContent: { paddingHorizontal: 20, paddingBottom: 100 },

    userCard: { flexDirection: 'row', alignItems: 'center', minHeight: 84, padding: 14, marginBottom: 20, borderRadius: 16, borderWidth: 1, ...brand.shadow.card },
    userAvatar: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: '#fff', fontSize: 18, fontFamily: brand.fonts.semibold },
    userDetails: { marginLeft: 13, flex: 1 },
    userName: { fontSize: 15, fontFamily: brand.fonts.semibold },
    userEmail: { fontSize: 12, marginTop: 3, fontFamily: brand.fonts.regular },

    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: 68,
        paddingHorizontal: 14,
        borderRadius: 16,
        borderWidth: 1,
        marginBottom: 12,
        ...brand.shadow.card,
    },
    sectionHeaderActive: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottomWidth: 0, marginBottom: 0 },
    sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
    sectionIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    sectionTitle: { fontSize: 14, fontFamily: brand.fonts.semibold },

    sectionContent: { padding: 16, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, borderWidth: 1, borderTopWidth: 0, marginBottom: 12 },

    label: { fontSize: 13, fontFamily: brand.fonts.semibold, marginBottom: 10 },
    subLabel: { fontSize: 11, fontFamily: brand.fonts.semibold, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.4 },
    divider: { height: 1, marginVertical: 16 },
    rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    hint: { fontSize: 11, marginTop: 4, fontFamily: brand.fonts.regular, lineHeight: 17 },
    colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 4 },
    colorOption: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'transparent' },
    assetContainer: { marginBottom: 18 },
    assetLabel: { fontSize: 13, fontFamily: brand.fonts.medium, marginBottom: 8 },
    assetHint: { fontSize: 11, fontFamily: brand.fonts.regular, marginTop: -3, marginBottom: 8 },
    assetPreview: { height: 80, borderRadius: 14, borderStyle: 'dashed', borderWidth: 1.5, overflow: 'hidden' },
    assetImage: { width: '100%', height: '100%' },
    clearBadge: { position: 'absolute', top: 6, right: 6, backgroundColor: '#ef4444', borderRadius: 10, padding: 4 },
    uploadPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    footer: { marginTop: 16, alignItems: 'center' },
    signOut: { width: '100%', minHeight: 50, borderWidth: 1, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
    signOutText: { fontSize: 13, fontFamily: brand.fonts.semibold },
    version: { fontSize: 11, fontFamily: brand.fonts.regular, marginTop: 12 },
    badge: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    optionChip: { minHeight: 48, minWidth: 0, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    optionText: { flexShrink: 1, textAlign: 'center', fontSize: 12, lineHeight: 16, fontFamily: brand.fonts.semibold },
    createStampButton: { minHeight: 46, borderRadius: 13, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: -6, marginBottom: 8 },
    createStampText: { fontSize: 13, fontFamily: brand.fonts.semibold },
    bankAccountsHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
    bankAccountsCopy: { flex: 1, minWidth: 0 },
    addBankButton: { minHeight: 38, paddingHorizontal: 10, borderRadius: 11, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
    addBankButtonText: { fontSize: 11, fontFamily: brand.fonts.semibold },
    bankAccountList: { gap: 8, marginTop: 12 },
    bankAccountRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 13, borderWidth: 1 },
    bankAccountCopy: { flex: 1, minWidth: 0 },
    bankAccountNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    bankAccountName: { flexShrink: 1, fontSize: 13, fontFamily: brand.fonts.semibold },
    primaryBadge: { overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 99, fontSize: 9, fontFamily: brand.fonts.semibold },
    bankAccountDetails: { fontSize: 11, marginTop: 3, fontFamily: brand.fonts.regular },
    bankAccountActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    sharedBankHint: { fontSize: 10, fontFamily: brand.fonts.regular },
    shareTenantRow: { minHeight: 56, borderWidth: 1, borderRadius: 13, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    bankAccountAction: { padding: 7 },
    bankAccountModalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.55)' },
    bankAccountModal: { maxHeight: '92%', borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, overflow: 'hidden' },
    bankAccountModalHeader: { minHeight: 62, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E4E9F0' },
    bankAccountCloseButton: { padding: 8, marginRight: -8 },
    bankAccountModalScroll: { flexGrow: 0 },
    bankAccountModalScrollContent: { padding: 18, paddingBottom: 32 },
    bankAccountForm: { marginTop: 14, padding: 12, borderRadius: 14, borderWidth: 1 },
    bankAccountFormTitle: { fontSize: 13, fontFamily: brand.fonts.semibold, marginBottom: 4 },
    optionTitle: { fontSize: 13, fontFamily: brand.fonts.semibold },
    optionDescription: { fontSize: 11, marginTop: 3, fontFamily: brand.fonts.regular },
    primaryToggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 5, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E4E9F0' },
    bankAccountFormActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 },
    formSecondaryButton: { minHeight: 42, paddingHorizontal: 14, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    formSecondaryButtonText: { fontSize: 12, fontFamily: brand.fonts.semibold },
    formPrimaryButton: { minHeight: 42, paddingHorizontal: 18, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    formPrimaryButtonText: { color: '#fff', fontSize: 12, fontFamily: brand.fonts.semibold },
});
