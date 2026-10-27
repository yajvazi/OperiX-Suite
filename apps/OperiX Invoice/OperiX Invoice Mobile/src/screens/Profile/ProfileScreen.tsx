import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Mail, MapPin, Phone, Globe, Save, LockKeyhole } from 'lucide-react-native';
import { supabase } from '@invoice-monorepo/api';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { Button, Input } from '@invoice-monorepo/ui';
import { t } from '@invoice-monorepo/i18n';
import { getPalette, brand } from '../../theme/brand';
import { MobileHeader, MobileScreen } from '../../components/mobile/MobileUI';

type ProfileDraft = {
    first_name: string;
    last_name: string;
    phone: string;
    address: string;
    city: string;
    country: string;
    website: string;
};

const emptyDraft: ProfileDraft = {
    first_name: '',
    last_name: '',
    phone: '',
    address: '',
    city: '',
    country: '',
    website: '',
};

export function ProfileScreen({ navigation }: any) {
    const { user } = useAuth();
    const { isDark, language, primaryColor } = useTheme();
    const palette = getPalette(isDark);
    const [draft, setDraft] = useState<ProfileDraft>(emptyDraft);
    const [email, setEmail] = useState(user?.email || '');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [companyId, setCompanyId] = useState<string | null>(null);
    const [accountEmail, setAccountEmail] = useState(user?.email || '');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [accountSaving, setAccountSaving] = useState(false);

    useEffect(() => {
        let active = true;
        const loadProfile = async () => {
            if (!user) {
                setLoading(false);
                return;
            }
            const { data } = await supabase.from('profiles').select('first_name,last_name,email,phone,address,website,active_company_id,company_id').eq('id', user.id).maybeSingle();
            if (!active) return;
            setEmail(user.email || data?.email || '');
            setAccountEmail(user.email || data?.email || '');
            const activeCompanyId = data?.active_company_id || data?.company_id || null;
            setCompanyId(activeCompanyId);
            const { data: company } = activeCompanyId
                ? await supabase.from('companies').select('city,country').eq('id', activeCompanyId).maybeSingle()
                : { data: null };
            setDraft({
                first_name: data?.first_name || '',
                last_name: data?.last_name || '',
                phone: data?.phone || '',
                address: data?.address || '',
                city: company?.city || '',
                country: company?.country || '',
                website: data?.website || '',
            });
            setLoading(false);
        };
        void loadProfile();
        return () => { active = false; };
    }, [user]);

    const updateDraft = (field: keyof ProfileDraft, value: string) => {
        setDraft((current) => ({ ...current, [field]: value }));
    };

    const saveProfile = async () => {
        if (!user) return;
        setSaving(true);
        try {
            const { first_name, last_name, phone, address, website, city, country } = draft;
            const { error: profileError } = await supabase
                .from('profiles')
                .update({ first_name, last_name, phone, address, website, updated_at: new Date().toISOString() })
                .eq('id', user.id);
            if (profileError) throw profileError;
            if (companyId) {
                const { error: companyError } = await supabase
                    .from('companies')
                    .update({ city, country })
                    .eq('id', companyId);
                if (companyError) throw companyError;
            }
            Alert.alert(t('success', language), t('settingsSaved', language));
        } catch (error) {
            Alert.alert(t('error', language), error instanceof Error ? error.message : t('saveError', language));
        } finally {
            setSaving(false);
        }
    };

    const saveAccountSettings = async () => {
        if (!user) return;
        const nextEmail = accountEmail.trim();
        const currentEmail = (user.email || email).trim();
        if (!nextEmail) {
            Alert.alert(t('error', language), t('emailRequired', language));
            return;
        }
        if (newPassword && newPassword.length < 6) {
            Alert.alert(t('error', language), language === 'sq' ? 'Fjalëkalimi duhet të ketë të paktën 6 karaktere.' : 'Password must be at least 6 characters.');
            return;
        }
        if (newPassword !== confirmPassword) {
            Alert.alert(t('error', language), language === 'sq' ? 'Fjalëkalimet nuk përputhen.' : 'Passwords do not match.');
            return;
        }
        if (nextEmail === currentEmail && !newPassword) {
            Alert.alert(t('error', language), language === 'sq' ? 'Nuk ka ndryshime për t’u ruajtur.' : 'There are no account changes to save.');
            return;
        }
        setAccountSaving(true);
        try {
            if (nextEmail !== currentEmail) {
                const { error } = await supabase.auth.updateUser({ email: nextEmail });
                if (error) throw error;
            }
            if (newPassword) {
                const { error } = await supabase.auth.updateUser({ password: newPassword });
                if (error) throw error;
            }
            setEmail(nextEmail);
            setNewPassword('');
            setConfirmPassword('');
            Alert.alert(t('success', language), language === 'sq' ? 'Cilësimet e llogarisë u përditësuan.' : 'Account settings updated.');
        } catch (error) {
            Alert.alert(t('error', language), error instanceof Error ? error.message : t('saveError', language));
        } finally {
            setAccountSaving(false);
        }
    };

    return (
        <MobileScreen testID="profile-screen">
            <MobileHeader title={t('profile', language)} subtitle={t('workspacePreferences', language)} onBack={() => navigation.goBack()} />
            <KeyboardAvoidingView style={styles.keyboardContent} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="none"
                showsVerticalScrollIndicator={false}
                automaticallyAdjustContentInsets={false}
            >
                <View style={[styles.identityCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                    <View style={[styles.avatar, { backgroundColor: primaryColor }]}>
                        <Text style={styles.avatarText}>{(email || user?.email || '?').charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={styles.identityCopy}>
                        <Text style={[styles.identityName, { color: palette.text }]}>{[draft.first_name, draft.last_name].filter(Boolean).join(' ') || email.split('@')[0] || t('profile', language)}</Text>
                        <Text style={[styles.identityEmail, { color: palette.muted }]}>{email || user?.email}</Text>
                    </View>
                </View>

                <Text style={[styles.sectionTitle, { color: palette.text }]}>{language === 'sq' ? 'Të dhënat e profilit' : 'Profile details'}</Text>
                <Text style={[styles.sectionDescription, { color: palette.muted }]}>{language === 'sq' ? 'Përditësoni të dhënat tuaja të kontaktit.' : 'Update your contact information.'}</Text>

                <View style={[styles.formCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                    <View style={styles.readOnlyRow}>
                        <View style={[styles.fieldIcon, { backgroundColor: palette.iconSurface }]}><Mail color={primaryColor} size={18} /></View>
                        <View style={styles.readOnlyCopy}>
                            <Text style={[styles.readOnlyLabel, { color: palette.muted }]}>{t('email', language)}</Text>
                            <Text style={[styles.readOnlyValue, { color: palette.text }]}>{email || '—'}</Text>
                        </View>
                    </View>
                    <View style={styles.twoColumns}>
                        <View style={styles.column}><Input label={language === 'sq' ? 'Emri' : 'First name'} value={draft.first_name} onChangeText={(value) => updateDraft('first_name', value)} /></View>
                        <View style={styles.column}><Input label={language === 'sq' ? 'Mbiemri' : 'Last name'} value={draft.last_name} onChangeText={(value) => updateDraft('last_name', value)} /></View>
                    </View>
                    <Input label={t('phone', language)} value={draft.phone} onChangeText={(value) => updateDraft('phone', value)} keyboardType="phone-pad" left={<Phone color={palette.muted} size={18} />} />
                    <Input label={t('address', language)} value={draft.address} onChangeText={(value) => updateDraft('address', value)} multiline left={<MapPin color={palette.muted} size={18} />} />
                    <View style={styles.twoColumns}>
                        <View style={styles.column}><Input label={t('city', language)} value={draft.city} onChangeText={(value) => updateDraft('city', value)} /></View>
                        <View style={styles.column}><Input label={t('country', language)} value={draft.country} onChangeText={(value) => updateDraft('country', value)} /></View>
                    </View>
                    <Input label={t('website', language)} value={draft.website} onChangeText={(value) => updateDraft('website', value)} placeholder="www.example.com" left={<Globe color={palette.muted} size={18} />} />
                    <Button title={t('save', language)} onPress={() => void saveProfile()} loading={saving} icon={Save} style={styles.saveButton} />
                </View>
                <Text style={[styles.sectionTitle, styles.accountTitle, { color: palette.text }]}>{language === 'sq' ? 'Cilësimet e llogarisë' : 'Account settings'}</Text>
                <Text style={[styles.sectionDescription, { color: palette.muted }]}>{language === 'sq' ? 'Menaxhoni email-in dhe fjalëkalimin e llogarisë.' : 'Manage your account email and password.'}</Text>
                <View style={[styles.formCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                    <View style={styles.accountHeading}>
                        <View style={[styles.fieldIcon, { backgroundColor: palette.iconSurface }]}><LockKeyhole color={primaryColor} size={18} /></View>
                        <Text style={[styles.accountHeadingText, { color: palette.text }]}>{language === 'sq' ? 'Siguria e llogarisë' : 'Account security'}</Text>
                    </View>
                    <Input label={t('email', language)} value={accountEmail} onChangeText={setAccountEmail} keyboardType="email-address" autoCapitalize="none" left={<Mail color={palette.muted} size={18} />} />
                    <Input label={language === 'sq' ? 'Fjalëkalimi i ri' : 'New password'} value={newPassword} onChangeText={setNewPassword} secureTextEntry />
                    <Input label={language === 'sq' ? 'Konfirmo fjalëkalimin' : 'Confirm password'} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
                    <Button title={language === 'sq' ? 'Ruaj llogarinë' : 'Save account'} onPress={() => void saveAccountSettings()} loading={accountSaving} icon={LockKeyhole} style={styles.saveButton} />
                </View>
                {loading ? <Text style={[styles.loadingText, { color: palette.muted }]}>{t('loading', language)}…</Text> : null}
            </ScrollView>
            </KeyboardAvoidingView>
        </MobileScreen>
    );
}

const styles = StyleSheet.create({
    keyboardContent: { flex: 1, minHeight: 0 },
    scroll: { flex: 1 },
    content: { paddingHorizontal: 20, paddingBottom: 220 },
    identityCard: { minHeight: 84, padding: 14, borderRadius: 18, borderWidth: 1, flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
    avatar: { width: 56, height: 56, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    avatarText: { color: '#fff', fontSize: 22, fontFamily: brand.fonts.semibold },
    identityCopy: { flex: 1, minWidth: 0, marginLeft: 14 },
    identityName: { fontSize: 16, fontFamily: brand.fonts.semibold },
    identityEmail: { fontSize: 12, marginTop: 4, fontFamily: brand.fonts.regular },
    sectionTitle: { fontSize: 20, fontFamily: brand.fonts.semibold },
    sectionDescription: { fontSize: 12, lineHeight: 18, marginTop: 4, marginBottom: 14, fontFamily: brand.fonts.regular },
    accountTitle: { marginTop: 26 },
    formCard: { borderRadius: 18, borderWidth: 1, padding: 16 },
    readOnlyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 16, marginBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(148,163,184,0.25)' },
    fieldIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    readOnlyCopy: { flex: 1, minWidth: 0 },
    readOnlyLabel: { fontSize: 11, fontFamily: brand.fonts.regular },
    readOnlyValue: { fontSize: 14, marginTop: 3, fontFamily: brand.fonts.semibold },
    twoColumns: { flexDirection: 'row', gap: 12 },
    column: { flex: 1 },
    saveButton: { marginTop: 4 },
    accountHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
    accountHeadingText: { fontSize: 14, fontFamily: brand.fonts.semibold },
    loadingText: { textAlign: 'center', marginTop: 12, fontSize: 12, fontFamily: brand.fonts.regular },
});
