import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    KeyboardAvoidingView,
    Linking,
    Platform,
    ScrollView,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowRight, LockKeyhole, Mail } from 'lucide-react-native';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { onSupabaseServerChange, parseConnectCode } from '@invoice-monorepo/api';
import { t } from '@invoice-monorepo/i18n';
import { SocialAuthButtons } from '../../components/auth/SocialAuthButtons';
import { PlaceholderInput } from '../../components/auth/PlaceholderInput';
import { ServerConnectModal, ServerStatus, useServerCopy } from '../../components/auth/ServerConnectModal';
import { AuthPreferences } from '../../components/auth/AuthPreferences';
import { OperixLogo } from '../../components/OperixLogo';
import { brand, getPalette } from '../../theme/brand';

interface SignInScreenProps {
    onNavigateToSignUp: () => void;
}

export function SignInScreen({ onNavigateToSignUp }: SignInScreenProps) {
    const { signIn } = useAuth();
    const { isDark, primaryColor, language } = useTheme();
    const palette = getPalette(isDark);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const signInInFlight = useRef(false);
    const serverText = useServerCopy();
    const [serverOpen, setServerOpen] = useState(false);
    const [linkedServer, setLinkedServer] = useState<string | undefined>();
    const [, refreshServer] = useState(0);

    useEffect(() => onSupabaseServerChange(() => refreshServer((n) => n + 1)), []);
    useEffect(() => {
        // A phone camera (or another app) can open operix-invoice://connect?server=... directly.
        const open = (url: string | null | undefined) => {
            const server = url?.startsWith('operix-invoice://connect') ? parseConnectCode(url) : null;
            if (server) { setLinkedServer(server); setServerOpen(true); }
        };
        void Linking.getInitialURL().then(open);
        const subscription = Linking.addEventListener('url', ({ url }) => open(url));
        return () => subscription.remove();
    }, []);

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
        <View style={[styles.container, { backgroundColor: palette.background }]}>
            <SafeAreaView style={styles.safeArea}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0} style={styles.safeArea}>
            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
                <View style={styles.hero}>
                    <OperixLogo width={175} reversed />
                    <Text style={styles.heroEyebrow}>{t('authProductEyebrow', language)}</Text>
                    <Text style={styles.heroTitle}>{t('authHeroTitle', language)}</Text>
                    <Text style={styles.heroSubtitle}>{t('authHeroSubtitle', language)}</Text>
                </View>
                <View style={[styles.form, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                    <Text style={[styles.formEyebrow, { color: primaryColor }]}>{t('authWelcomeBack', language)}</Text>
                    <Text style={[styles.formTitle, { color: palette.text }]}>{t('authSignInTitle', language)}</Text>
                    <Text style={[styles.formSubtitle, { color: palette.muted }]}>{t('authSignInSubtitle', language)}</Text>
                    {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}
                    <View style={styles.inputGroup}><Text style={[styles.label, { color: palette.textSecondary }]}>{t('email', language)}</Text><View style={[styles.field, { borderColor: palette.border }]}><Mail color={palette.muted} size={18} /><PlaceholderInput testID="auth-email-input" style={[styles.input, { color: palette.text }]} placeholder={t('enterEmail', language)} placeholderTextColor={palette.muted} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" /></View></View>
                    <View style={styles.inputGroup}><Text style={[styles.label, { color: palette.textSecondary }]}>{t('password', language)}</Text><View style={[styles.field, { borderColor: palette.border }]}><LockKeyhole color={palette.muted} size={18} /><TextInput testID="auth-password-input" style={[styles.input, { color: palette.text }]} placeholder={t('enterPassword', language)} placeholderTextColor={palette.muted} value={password} onChangeText={setPassword} secureTextEntry /></View></View>
                    <TouchableOpacity testID="auth-sign-in-button" accessibilityRole="button" style={[styles.button, { backgroundColor: primaryColor }, loading && styles.buttonDisabled]} onPress={handleSignIn} disabled={loading}>{loading ? <ActivityIndicator color="#fff" /> : <><Text style={styles.buttonText}>{t('signIn', language)}</Text><ArrowRight color="#fff" size={17} /></>}</TouchableOpacity>
                    <SocialAuthButtons onError={setError} />
                    <View style={[styles.footer, { backgroundColor: palette.surfaceMuted, borderColor: palette.border }]}>
                        <Text style={[styles.footerText, { color: palette.muted }]}>{t('doNotHaveAccount', language)}</Text>
                        <TouchableOpacity testID="auth-sign-up-link" accessibilityRole="button" activeOpacity={0.75} style={[styles.signUpButton, { backgroundColor: palette.iconSurface, borderColor: primaryColor }]} onPress={onNavigateToSignUp}>
                            <Text style={[styles.link, { color: primaryColor }]}>{t('signUp', language)}</Text>
                            <ArrowRight color={primaryColor} size={15} strokeWidth={2.5} />
                        </TouchableOpacity>
                    </View>
                    <View style={[styles.preferencePanel, { backgroundColor: palette.surfaceMuted, borderColor: palette.border }]}>
                        <AuthPreferences variant="footer" />
                    </View>
                    <ServerStatus version={0} onChange={() => refreshServer((n) => n + 1)} />
                    <TouchableOpacity testID="auth-own-server" accessibilityRole="button" style={styles.ownServer} onPress={() => { setLinkedServer(undefined); setServerOpen(true); }}>
                        <Text style={[styles.link, { color: primaryColor }]}>{serverText.title}</Text>
                    </TouchableOpacity>
                    <Text style={[styles.securityNote, { color: palette.muted }]}>{t('authSecurityNote', language)}</Text>
                </View>
            </ScrollView>
            <ServerConnectModal visible={serverOpen} initialAddress={linkedServer} onClose={() => setServerOpen(false)} />
            </KeyboardAvoidingView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    safeArea: { flex: 1 },
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
    googleButton: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1, borderRadius: 14 },
    googleButtonText: { fontSize: 13, fontWeight: '600' },
    footer: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 20, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderRadius: 14 },
    footerText: { fontSize: 12 },
    signUpButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 13, borderWidth: 1, borderRadius: 11 },
    link: { fontSize: 12, fontWeight: '800' },
    preferencePanel: { marginTop: 10, paddingHorizontal: 10, paddingVertical: 10, borderWidth: 1, borderRadius: 14 },
    ownServer: { minHeight: 40, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
    securityNote: { marginTop: 17, textAlign: 'center', fontSize: 10, lineHeight: 15 },
});
