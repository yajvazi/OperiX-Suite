import React, { useRef, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { ArrowRight, LockKeyhole, Mail } from 'lucide-react-native';
import { SvgXml } from 'react-native-svg';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { t } from '@invoice-monorepo/i18n';
import { OperixLogo } from '../../components/OperixLogo';
import { brand, getPalette } from '../../theme/brand';

const googleLogoXml = `
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
</svg>
`;

interface SignInScreenProps {
    onNavigateToSignUp: () => void;
}

export function SignInScreen({ onNavigateToSignUp }: SignInScreenProps) {
    const { signIn, signInWithGoogle } = useAuth();
    const { isDark, primaryColor, language } = useTheme();
    const palette = getPalette(isDark);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const signInInFlight = useRef(false);

    const handleSignIn = async () => {
        if (signInInFlight.current) return;
        if (!email.trim() || !password) {
            setError(t('fillAllFields', language));
            return;
        }
        signInInFlight.current = true;
        setLoading(true);
        setError('');
        try {
            const { error: signInError } = await signIn(email.trim(), password);
            if (signInError) setError(t('signInFailed', language));
        } catch {
            setError(t('unexpectedError', language));
        } finally {
            signInInFlight.current = false;
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0} style={[styles.container, { backgroundColor: palette.background }]}>
            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="always" keyboardDismissMode="none">
                <View style={styles.hero}>
                    <OperixLogo width={175} reversed />
                    <Text style={styles.heroEyebrow}>OPERIX SUITE</Text>
                    <Text style={styles.heroTitle}>Make every invoice feel effortless.</Text>
                    <Text style={styles.heroSubtitle}>One calm workspace for your team, customers, and cash flow.</Text>
                </View>
                <View style={[styles.form, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                    <Text style={[styles.formEyebrow, { color: primaryColor }]}>WELCOME BACK</Text>
                    <Text style={[styles.formTitle, { color: palette.text }]}>Sign in to Invoice</Text>
                    <Text style={[styles.formSubtitle, { color: palette.muted }]}>Use the same OperiX account you use across the Suite.</Text>
                    {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}
                    <View style={styles.inputGroup}><Text style={[styles.label, { color: palette.textSecondary }]}>{t('email', language)}</Text><View style={[styles.field, { borderColor: palette.border }]}><Mail color={palette.muted} size={18} /><TextInput testID="auth-email-input" style={[styles.input, { color: palette.text }]} placeholder={t('enterEmail', language)} placeholderTextColor={palette.muted} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" /></View></View>
                    <View style={styles.inputGroup}><Text style={[styles.label, { color: palette.textSecondary }]}>{t('password', language)}</Text><View style={[styles.field, { borderColor: palette.border }]}><LockKeyhole color={palette.muted} size={18} /><TextInput testID="auth-password-input" style={[styles.input, { color: palette.text }]} placeholder={t('enterPassword', language)} placeholderTextColor={palette.muted} value={password} onChangeText={setPassword} secureTextEntry /></View></View>
                    <TouchableOpacity testID="auth-sign-in-button" accessibilityRole="button" style={[styles.button, { backgroundColor: primaryColor }, loading && styles.buttonDisabled]} onPress={handleSignIn} disabled={loading}>{loading ? <ActivityIndicator color="#fff" /> : <><Text style={styles.buttonText}>{t('signIn', language)}</Text><ArrowRight color="#fff" size={17} /></>}</TouchableOpacity>
                    <View style={styles.divider}><View style={[styles.line, { backgroundColor: palette.border }]} /><Text style={[styles.dividerText, { color: palette.muted }]}>{t('or', language)}</Text><View style={[styles.line, { backgroundColor: palette.border }]} /></View>
                    <TouchableOpacity testID="auth-google-button" accessibilityRole="button" style={[styles.googleButton, { borderColor: palette.border }]} onPress={async () => { setLoading(true); const { error: googleError } = await signInWithGoogle(); if (googleError) setError(t('signInFailed', language)); setLoading(false); }} disabled={loading}><SvgXml xml={googleLogoXml} width={20} height={20} /><Text style={[styles.googleButtonText, { color: palette.text }]}>{t('continueWithGoogle', language)}</Text></TouchableOpacity>
                    <View style={styles.footer}><Text style={[styles.footerText, { color: palette.muted }]}>{t('doNotHaveAccount', language)}</Text><TouchableOpacity testID="auth-sign-up-link" accessibilityRole="button" onPress={onNavigateToSignUp}><Text style={[styles.link, { color: primaryColor }]}>{t('signUp', language)}</Text></TouchableOpacity></View>
                    <Text style={[styles.securityNote, { color: palette.muted }]}>Protected by your OperiX account.</Text>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 22 },
    hero: { minHeight: 260, justifyContent: 'flex-end', padding: 24, borderRadius: 22, backgroundColor: brand.colors.navy, overflow: 'hidden' },
    heroEyebrow: { marginTop: 30, color: '#8DB1FF', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
    heroTitle: { maxWidth: 330, marginTop: 10, color: '#fff', fontSize: 30, lineHeight: 35, fontWeight: '900', letterSpacing: -0.7 },
    heroSubtitle: { maxWidth: 320, marginTop: 10, color: '#AAB9D3', fontSize: 12, lineHeight: 18 },
    form: { marginTop: 14, padding: 20, borderWidth: 1, borderRadius: 22, ...brand.shadow.floating },
    formEyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
    formTitle: { marginTop: 7, fontSize: 22, fontWeight: '900', letterSpacing: -0.4 },
    formSubtitle: { marginTop: 6, marginBottom: 18, fontSize: 12, lineHeight: 18 },
    errorBox: { marginBottom: 14, padding: 11, borderWidth: 1, borderColor: brand.colors.error, borderRadius: 10, backgroundColor: brand.colors.errorSoft },
    errorText: { color: brand.colors.error, fontSize: 12, lineHeight: 17 },
    inputGroup: { marginBottom: 13 },
    label: { marginBottom: 7, fontSize: 12, fontWeight: '700' },
    field: { height: 50, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, borderWidth: 1, borderRadius: 12 },
    input: { flex: 1, minWidth: 0, fontSize: 14 },
    button: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 5, borderRadius: 13, ...brand.shadow.floating },
    buttonDisabled: { opacity: 0.65 },
    buttonText: { color: '#fff', fontSize: 14, fontWeight: '900' },
    divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 18 },
    line: { flex: 1, height: 1 },
    dividerText: { marginHorizontal: 10, fontSize: 10, fontWeight: '700' },
    googleButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1, borderRadius: 13 },
    googleButtonText: { fontSize: 13, fontWeight: '600' },
    footer: { flexDirection: 'row', justifyContent: 'center', gap: 4, marginTop: 20 },
    footerText: { fontSize: 12 },
    link: { fontSize: 12, fontWeight: '700' },
    securityNote: { marginTop: 17, textAlign: 'center', fontSize: 10, lineHeight: 15 },
});
