import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Building2 } from 'lucide-react-native';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { brand, getPalette } from '../../theme/brand';

const copy = {
    en: { title: 'Set up your company', text: 'You are signed in. Tell us about your business to create your workspace.', company: 'Company name', first: 'First name', last: 'Last name', phone: 'Phone (optional)', tax: 'Business registration number (optional)', create: 'Create workspace', signOut: 'Sign out', failed: 'The workspace could not be created. Please try again.', required: 'Enter your company name.' },
    sq: { title: 'Konfiguro kompaninë', text: 'Je i kyçur. Na tregoni për biznesin tuaj për të krijuar hapësirën e punës.', company: 'Emri i kompanisë', first: 'Emri', last: 'Mbiemri', phone: 'Telefoni (opsional)', tax: 'Numri i regjistrimit të biznesit (opsional)', create: 'Krijo hapësirën e punës', signOut: 'Dil', failed: 'Hapësira e punës nuk u krijua. Provoni përsëri.', required: 'Shkruani emrin e kompanisë.' },
} as const;

/** First step for accounts that signed in with Google or Apple and do not have a company yet. */
export function CompanySetupScreen({ onDone }: { onDone: () => void }) {
    const { user, completeSignup, signOut } = useAuth();
    const { isDark, primaryColor, language } = useTheme();
    const palette = getPalette(isDark);
    const text = language === 'sq' ? copy.sq : copy.en;
    const meta = (user?.user_metadata || {}) as Record<string, unknown>;
    const fullName = String(meta.full_name || meta.name || '').trim();
    const [firstName, setFirstName] = useState(String(meta.given_name || fullName.split(' ')[0] || ''));
    const [lastName, setLastName] = useState(String(meta.family_name || fullName.split(' ').slice(1).join(' ') || ''));
    const [company, setCompany] = useState('');
    const [phone, setPhone] = useState('');
    const [taxId, setTaxId] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const submit = async () => {
        if (!company.trim()) { setError(text.required); return; }
        setBusy(true);
        setError('');
        const { error: failure } = await completeSignup({ tenantName: company.trim(), firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim(), taxId: taxId.trim() });
        setBusy(false);
        if (failure) setError(text.failed); else onDone();
    };

    const field = (label: string, value: string, set: (v: string) => void, extra: object = {}) => <View style={styles.group}>
        <Text style={[styles.label, { color: palette.textSecondary }]}>{label}</Text>
        <TextInput style={[styles.input, { borderColor: palette.border, color: palette.text }]} value={value} onChangeText={set} placeholderTextColor={palette.muted} {...extra} />
    </View>;

    return <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.safe}>
            <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
                <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                    <View style={[styles.icon, { backgroundColor: palette.iconSurface }]}><Building2 color={primaryColor} size={26} /></View>
                    <Text style={[styles.title, { color: palette.text }]}>{text.title}</Text>
                    <Text style={[styles.description, { color: palette.muted }]}>{text.text}</Text>
                    {error ? <Text style={styles.error}>{error}</Text> : null}
                    {field(`${text.company} *`, company, setCompany, { testID: 'company-setup-name', autoCapitalize: 'words' })}
                    {field(text.first, firstName, setFirstName, { autoCapitalize: 'words' })}
                    {field(text.last, lastName, setLastName, { autoCapitalize: 'words' })}
                    {field(text.phone, phone, setPhone, { keyboardType: 'phone-pad' })}
                    {field(text.tax, taxId, setTaxId)}
                    <TouchableOpacity testID="company-setup-submit" accessibilityRole="button" disabled={busy} style={[styles.button, { backgroundColor: primaryColor }, busy && { opacity: 0.65 }]} onPress={submit}>
                        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{text.create}</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity accessibilityRole="button" style={styles.link} onPress={() => { void signOut(); }}><Text style={{ color: primaryColor, fontWeight: '800', fontSize: 13 }}>{text.signOut}</Text></TouchableOpacity>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    </SafeAreaView>;
}

const styles = StyleSheet.create({
    safe: { flex: 1 },
    scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
    card: { width: '100%', maxWidth: 480, alignSelf: 'center', padding: 22, borderWidth: 1, borderRadius: 22, ...brand.shadow.floating },
    icon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
    title: { fontSize: 22, fontWeight: '900' },
    description: { marginTop: 8, marginBottom: 16, fontSize: 13, lineHeight: 19 },
    error: { marginBottom: 12, color: brand.colors.error, fontSize: 12, lineHeight: 17 },
    group: { marginBottom: 12 },
    label: { marginBottom: 6, fontSize: 12, fontWeight: '700' },
    input: { height: 48, paddingHorizontal: 13, borderWidth: 1, borderRadius: 12, fontSize: 14 },
    button: { minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 8, borderRadius: 13 },
    buttonText: { color: '#fff', fontSize: 14, fontWeight: '900' },
    link: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
});
