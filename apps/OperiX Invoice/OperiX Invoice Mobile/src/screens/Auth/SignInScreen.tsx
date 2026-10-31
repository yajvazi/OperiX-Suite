import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    InputAccessoryView,
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
    const { signIn, sendSignInCode, verifyEmailOtp } = useAuth();
    const { isDark, primaryColor, language } = useTheme();
    const palette = getPalette(isDark);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    // Sign-in is by emailed one-time code; the password form stays available as a fallback.
    const [usePassword, setUsePassword] = useState(false);
    const [codeSent, setCodeSent] = useState(false);
    const [code, setCode] = useState('');
    const [resendIn, setResendIn] = useState(0);
    const sq = language === 'sq';
    const [error, setError] = useState('');
    const signInInFlight = useRef(false);
    const passwordRef = useRef<React.ElementRef<typeof TextInput>>(null);
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

    useEffect(() => {
        if (resendIn <= 0) return undefined;
        const timer = setTimeout(() => setResendIn((value) => value - 1), 1000);
        return () => clearTimeout(timer);
    }, [resendIn]);

    const handleSendCode = async () => {
        if (signInInFlight.current || resendIn > 0) return;
        if (!email.trim()) { setError(t('fillAllFields', language)); return; }
        signInInFlight.current = true;
        setLoading(true);
        setError('');
        try {
            const { error: sendError } = await sendSignInCode(email.trim());
            if (sendError) {
                const info = sendError as { code?: string; status?: number; message?: string };
                const text = String(info.message || '').toLowerCase();
                if (info.status === 429 || info.code === 'over_email_send_rate_limit' || text.includes('rate limit') || text.includes('seconds')) {
                    setError(sq ? 'Shumë kërkesa. Prisni pak dhe provoni përsëri.' : 'Too many requests. Please wait a moment and try again.');
                } else if (info.code === 'otp_disabled' || text.includes('signup') || text.includes('not found')) {
                    setError(sq ? 'Nuk ka llogari me këtë email. Krijoni një llogari më poshtë.' : 'There is no account with this email. Create one below.');
                } else {
                    setError(t('unexpectedError', language));
                }
                return;
            }
            setCodeSent(true);
            setCode('');
            setResendIn(60);
        } catch {
            setError(t('unexpectedError', language));
        } finally {
            signInInFlight.current = false;
            setLoading(false);
        }
    };

    const handleVerifyCode = async (typed?: string) => {
        if (signInInFlight.current) return;
        const token = (typed ?? code).trim();
        if (!token) { setError(t('enterVerificationCode', language)); return; }
        signInInFlight.current = true;
        setLoading(true);
        setError('');
        try {
            const { error: verifyError } = await verifyEmailOtp(email.trim(), token);
            if (verifyError) setError(sq ? 'Kodi është i pasaktë ose ka skaduar.' : 'The code is incorrect or has expired.');
        } catch {
            setError(t('unexpectedError', language));
        } finally {
            signInInFlight.current = false;
            setLoading(false);
        }
    };

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

    const submitOnReturn = usePassword ? undefined : codeSent ? () => void handleVerifyCode() : () => void handleSendCode();
    const title = codeSent && !usePassword ? (sq ? 'Kontrolloni emailin' : 'Check your email') : t('authSignInTitle', language);
    const subtitle = codeSent && !usePassword
        ? (sq ? `Dërguam një kod 6-shifror te ${email.trim()}.` : `We sent a 6-digit code to ${email.trim()}.`)
        : (sq ? 'Futni emailin dhe do t\'ju dërgojmë një kod hyrjeje.' : 'Enter your email and we\'ll send you a sign-in code.');
    const emailField = (
        <View style={[styles.field, { borderColor: palette.border, backgroundColor: palette.surface }]}>
            <Mail color={palette.muted} size={18} />
            <PlaceholderInput
                testID="auth-email-input"
                style={[styles.input, { color: palette.text }]}
                placeholder={t('enterEmail', language)}
                placeholderTextColor={palette.muted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType={usePassword ? 'next' : 'go'}
                enablesReturnKeyAutomatically
                onSubmitEditing={usePassword ? () => passwordRef.current?.focus() : submitOnReturn}
            />
        </View>
    );
    const primaryButton = (testID: string, label: string, onPress: () => void) => (
        <TouchableOpacity testID={testID} accessibilityRole="button" style={[styles.button, { backgroundColor: primaryColor }, loading && styles.buttonDisabled]} onPress={onPress} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <><Text style={styles.buttonText}>{label}</Text><ArrowRight color="#fff" size={17} /></>}
        </TouchableOpacity>
    );
    const textLink = (testID: string, label: string, onPress: () => void, muted = false, disabled = false) => (
        <TouchableOpacity testID={testID} accessibilityRole="button" style={styles.altLink} onPress={onPress} disabled={disabled}>
            <Text style={[styles.link, { color: muted || disabled ? palette.muted : primaryColor }]}>{label}</Text>
        </TouchableOpacity>
    );

    return (
        <View style={[styles.container, { backgroundColor: palette.background }]}>
            <SafeAreaView style={styles.safeArea}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0} style={styles.safeArea}>
            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="none" showsVerticalScrollIndicator={false}>
                <View style={styles.logo}><OperixLogo width={175} reversed={isDark} /></View>
                <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
                <Text style={[styles.subtitle, { color: palette.muted }]}>{subtitle}</Text>
                {error ? <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View> : null}

                {usePassword ? (
                    <View style={styles.formStack}>
                        {emailField}
                        <View style={[styles.field, { borderColor: palette.border, backgroundColor: palette.surface }]}>
                            <LockKeyhole color={palette.muted} size={18} />
                            <TextInput
                                ref={passwordRef}
                                testID="auth-password-input"
                                style={[styles.input, { color: palette.text }]}
                                placeholder={t('enterPassword', language)}
                                placeholderTextColor={palette.muted}
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry
                                returnKeyType="go"
                                onSubmitEditing={() => void handleSignIn()}
                            />
                        </View>
                        {primaryButton('auth-sign-in-button', t('signIn', language), () => void handleSignIn())}
                        {textLink('auth-use-code', sq ? 'Hyr me kod me email' : 'Use an emailed code instead', () => { setUsePassword(false); setError(''); }, true)}
                    </View>
                ) : codeSent ? (
                    <View style={styles.formStack}>
                        <TextInput
                            testID="auth-otp-input"
                            style={[styles.otpInput, { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface }]}
                            placeholder="000000"
                            placeholderTextColor={palette.muted}
                            value={code}
                            onChangeText={(value) => {
                                const digits = value.replace(/\D/g, '').slice(0, 6);
                                setCode(digits);
                                // The sixth digit is the last thing to type: sign in without another tap.
                                if (digits.length === 6) void handleVerifyCode(digits);
                            }}
                            keyboardType="number-pad"
                            maxLength={6}
                            autoFocus
                            textContentType="oneTimeCode"
                            autoComplete="one-time-code"
                            inputAccessoryViewID={Platform.OS === 'ios' ? 'sign-in-code-accessory' : undefined}
                            returnKeyType="go"
                            onSubmitEditing={() => void handleVerifyCode()}
                        />
                        {primaryButton('auth-verify-code-button', t('verifyCode', language), () => void handleVerifyCode())}
                        {textLink('auth-resend-code', resendIn > 0 ? (sq ? `Dërgo kodin përsëri (${resendIn}s)` : `Send the code again (${resendIn}s)`) : (sq ? 'Dërgo kodin përsëri' : 'Send the code again'), () => void handleSendCode(), false, resendIn > 0 || loading)}
                        {textLink('auth-change-email', sq ? 'Ndrysho emailin' : 'Use a different email', () => { setCodeSent(false); setCode(''); setError(''); }, true)}
                    </View>
                ) : (
                    <View style={styles.formStack}>
                        {emailField}
                        {primaryButton('auth-send-code-button', sq ? 'Dërgo kodin' : 'Send me a code', () => void handleSendCode())}
                        <SocialAuthButtons onError={setError} layout="row" />
                        {textLink('auth-use-password', sq ? 'Hyr me fjalëkalim' : 'Sign in with a password', () => { setUsePassword(true); setError(''); }, true)}
                    </View>
                )}

                <View style={styles.signUpRow}>
                    <Text style={[styles.footerText, { color: palette.muted }]}>{t('doNotHaveAccount', language)}</Text>
                    <TouchableOpacity testID="auth-sign-up-link" accessibilityRole="button" hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }} onPress={onNavigateToSignUp}>
                        <Text style={[styles.link, { color: primaryColor, fontSize: 13 }]}>{t('signUp', language)}</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.bottom}>
                    <AuthPreferences variant="footer" />
                    <ServerStatus version={0} onChange={() => refreshServer((n) => n + 1)} />
                    <TouchableOpacity testID="auth-own-server" accessibilityRole="button" style={styles.ownServer} onPress={() => { setLinkedServer(undefined); setServerOpen(true); }}>
                        <Text style={[styles.footerText, { color: palette.muted }]}>{serverText.title}</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
            {Platform.OS === 'ios' ? (
                // A number pad has no Return key, so this bar above it plays that part.
                <InputAccessoryView nativeID="sign-in-code-accessory">
                    <View style={[styles.accessory, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                        <TouchableOpacity testID="auth-code-accessory-continue" accessibilityRole="button" onPress={() => void handleVerifyCode()} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
                            <Text style={[styles.link, { color: primaryColor, fontSize: 15 }]}>{t('verifyCode', language)}</Text>
                        </TouchableOpacity>
                    </View>
                </InputAccessoryView>
            ) : null}
            <ServerConnectModal visible={serverOpen} initialAddress={linkedServer} onClose={() => setServerOpen(false)} />
            </KeyboardAvoidingView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    safeArea: { flex: 1 },
    scrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 26, paddingVertical: 28 },
    logo: { marginBottom: 34 },
    title: { fontSize: 28, lineHeight: 33, fontWeight: '900', letterSpacing: -0.6 },
    subtitle: { marginTop: 8, marginBottom: 24, fontSize: 14, lineHeight: 20 },
    errorBox: { marginBottom: 14, padding: 11, borderWidth: 1, borderColor: brand.colors.error, borderRadius: 10, backgroundColor: brand.colors.errorSoft },
    errorText: { color: brand.colors.error, fontSize: 12, lineHeight: 17 },
    formStack: { gap: 12 },
    field: { height: 54, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderWidth: 1, borderRadius: 14 },
    input: { flex: 1, minWidth: 0, fontSize: 15 },
    button: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, ...brand.shadow.floating },
    buttonDisabled: { opacity: 0.65 },
    buttonText: { color: '#fff', fontSize: 15, fontWeight: '900' },
    otpInput: { height: 64, textAlign: 'center', fontSize: 28, letterSpacing: 12, fontWeight: '800', borderWidth: 1, borderRadius: 14 },
    altLink: { alignItems: 'center', paddingVertical: 6 },
    link: { fontSize: 13, fontWeight: '800' },
    signUpRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 26 },
    footerText: { fontSize: 13 },
    bottom: { marginTop: 30, alignItems: 'center', gap: 4 },
    ownServer: { minHeight: 36, alignItems: 'center', justifyContent: 'center' },
    accessory: { height: 46, alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 18, borderTopWidth: StyleSheet.hairlineWidth },
});
