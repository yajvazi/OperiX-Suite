import React, { useEffect, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, ArrowRight, Eye, EyeOff } from 'lucide-react-native';
import { supabase } from '@invoice-monorepo/api';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { t } from '@invoice-monorepo/i18n';
import { AuthPreferences } from '../../components/auth/AuthPreferences';
import { PlaceholderInput } from '../../components/auth/PlaceholderInput';
import { SocialAuthButtons } from '../../components/auth/SocialAuthButtons';
import { OperixLogo } from '../../components/OperixLogo';
import { brand, getPalette } from '../../theme/brand';

interface SignUpScreenProps {
    onNavigateToSignIn: () => void;
    navigation?: { navigate?: (screen: string) => void };
}

type Step = 'account' | 'verify';
const STEPS: Step[] = ['account', 'verify'];
const RESEND_SECONDS = 30;

/**
 * Sign-up in the same step-by-step style as the onboarding: account, then the emailed code. After the code the app
 * opens the onboarding (your name, how you want to use OperiX, your company), so nothing is asked twice.
 */
export function SignUpScreen({ onNavigateToSignIn, navigation }: SignUpScreenProps) {
    const { signUp, verifyEmailOtp } = useAuth();
    const { isDark, primaryColor, language } = useTheme();
    const palette = getPalette(isDark);
    const [step, setStep] = useState<Step>('account');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [verificationCode, setVerificationCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [resendIn, setResendIn] = useState(0);
    const [accountExists, setAccountExists] = useState(false);
    const sq = language === 'sq';
    const activeIndex = STEPS.indexOf(step);

    useEffect(() => {
        if (resendIn <= 0) return undefined;
        const timer = setTimeout(() => setResendIn((seconds) => seconds - 1), 1000);
        return () => clearTimeout(timer);
    }, [resendIn]);

    const validateAccount = () => {
        setError('');
        if (!email.trim() || !password || !confirmPassword) { setError(t('requiredFields', language)); return false; }
        if (password !== confirmPassword) { setError(t('passwordMismatch', language)); return false; }
        if (password.length < 8 || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
            setError(t('passwordMin', language));
            return false;
        }
        return true;
    };

    const handleSignUp = async () => {
        if (!validateAccount()) return;
        setLoading(true);
        setError('');
        try {
            const { error: signUpError } = await signUp(email.trim(), password);
            if (signUpError) {
                // Tell people what actually went wrong instead of a vague failure.
                const info = signUpError as { code?: string; status?: number; message?: string };
                const text = String(info.message || '').toLowerCase();
                if (info.code === 'user_already_exists' || text.includes('already registered')) {
                    setError(sq ? 'Ekziston tashmë një llogari me këtë email. Hyni në vend të kësaj.' : 'An account with this email already exists. Sign in instead.');
                    setAccountExists(true);
                } else if (info.status === 429 || info.code === 'over_email_send_rate_limit' || text.includes('rate limit')) {
                    setError(sq ? 'Shumë përpjekje. Provoni përsëri pas pak.' : 'Too many attempts. Please try again in a few minutes.');
                } else if (info.code === 'weak_password') {
                    setError(t('passwordMin', language));
                } else {
                    setError(t('signUpFailed', language));
                }
                return;
            }
            // Some servers confirm accounts without an email. Then the user is signed in already and the app moves on by itself.
            const { data } = await supabase.auth.getSession();
            if (data.session) return;
            setStep('verify');
            setResendIn(RESEND_SECONDS);
        } catch {
            setError(t('unexpectedError', language));
        } finally {
            setLoading(false);
        }
    };

    const handleVerify = async () => {
        const code = verificationCode.trim();
        if (!code) { setError(t('enterVerificationCode', language)); return; }
        setLoading(true);
        setError('');
        try {
            const { error: verificationError } = await verifyEmailOtp(email.trim(), code);
            if (verificationError) setError(t('verificationFailed', language));
            // On success the session starts and the onboarding opens.
        } catch {
            setError(t('verificationFailed', language));
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        if (resendIn > 0) return;
        setError('');
        const { error: resendError } = await supabase.auth.resend({ type: 'signup', email: email.trim() });
        if (resendError) setError(t('unexpectedError', language));
        else setResendIn(RESEND_SECONDS);
    };

    const goBack = () => { setError(''); setVerificationCode(''); setStep('account'); };

    const field = (label: string, input: React.ReactNode) => (
        <View style={styles.group}>
            <Text style={[styles.label, { color: palette.textSecondary }]}>{label}</Text>
            {input}
        </View>
    );

    const inputStyle = [styles.input, { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface }];

    return (
        <SafeAreaView style={[styles.safe, { backgroundColor: palette.background }]}>
            <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={styles.top}>
                    <View style={styles.progress}>
                        {STEPS.map((item, index) => <View key={item} style={[styles.bar, { backgroundColor: index < activeIndex ? '#12B76A' : index === activeIndex ? primaryColor : palette.border }]} />)}
                    </View>
                    <View style={styles.topRow}>
                        <Text style={[styles.stepLabel, { color: palette.muted }]}>
                            {activeIndex + 1} / {STEPS.length} · {step === 'account' ? t('signupStepAccount', language) : t('signupStepVerification', language)}
                        </Text>
                    </View>
                </View>
                <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
                    <OperixLogo width={150} reversed={isDark} />

                    {step === 'account' ? <>
                        <Text style={[styles.title, { color: palette.text }]}>{t('createAccount', language)}</Text>
                        <Text style={[styles.lead, { color: palette.muted }]}>{t('signupWelcomeSubtitle', language)}</Text>
                        {error ? <Text style={styles.error}>{error}</Text> : null}
                        {accountExists ? <TouchableOpacity accessibilityRole="button" onPress={onNavigateToSignIn} style={[styles.secondary, { borderColor: palette.border }]}><Text style={{ color: primaryColor, fontWeight: '800', fontSize: 13 }}>{t('signIn', language)}</Text></TouchableOpacity> : null}
                        {field(`${t('email', language)} *`, (
                            <PlaceholderInput testID="auth-sign-up-email" style={inputStyle} value={email} onChangeText={(value) => { setEmail(value); setAccountExists(false); }} placeholder={t('enterEmail', language)} placeholderTextColor={palette.muted} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
                        ))}
                        {field(`${t('password', language)} *`, (
                            <View>
                                <TextInput testID="auth-sign-up-password" style={inputStyle} value={password} onChangeText={setPassword} placeholder={t('createPassword', language)} placeholderTextColor={palette.muted} secureTextEntry={!showPassword} autoCapitalize="none" autoComplete="new-password" />
                                <TouchableOpacity testID="auth-toggle-password" accessibilityRole="button" accessibilityLabel={t('authShowPassword', language)} style={styles.eye} onPress={() => setShowPassword((value) => !value)}>
                                    {showPassword ? <EyeOff color={palette.muted} size={18} /> : <Eye color={palette.muted} size={18} />}
                                </TouchableOpacity>
                            </View>
                        ))}
                        {field(`${t('confirmPassword', language)} *`, (
                            <View>
                                <TextInput testID="auth-sign-up-confirm-password" style={inputStyle} value={confirmPassword} onChangeText={setConfirmPassword} placeholder={t('confirmYourPassword', language)} placeholderTextColor={palette.muted} secureTextEntry={!showConfirmPassword} autoCapitalize="none" autoComplete="new-password" />
                                <TouchableOpacity testID="auth-toggle-confirm-password" accessibilityRole="button" accessibilityLabel={t('authShowConfirmPassword', language)} style={styles.eye} onPress={() => setShowConfirmPassword((value) => !value)}>
                                    {showConfirmPassword ? <EyeOff color={palette.muted} size={18} /> : <Eye color={palette.muted} size={18} />}
                                </TouchableOpacity>
                            </View>
                        ))}
                        <Text style={[styles.hint, { color: palette.muted }]}>{t('passwordRequirements', language)}</Text>
                        <TouchableOpacity testID="auth-sign-up-button" accessibilityRole="button" disabled={loading} onPress={() => void handleSignUp()} style={[styles.primary, { backgroundColor: primaryColor }, loading && { opacity: 0.65 }]}>
                            {loading ? <ActivityIndicator color="#fff" /> : <><Text style={styles.primaryText}>{t('continue', language)}</Text><ArrowRight color="#fff" size={16} /></>}
                        </TouchableOpacity>
                        <SocialAuthButtons onError={setError} />
                    </> : <>
                        <Text style={[styles.title, { color: palette.text }]}>{t('verifyEmail', language)}</Text>
                        <Text style={[styles.lead, { color: palette.muted }]}>{t('signupVerificationSubtitle', language).replace('{email}', email.trim())}</Text>
                        {error ? <Text style={styles.error}>{error}</Text> : null}
                        <TextInput
                            testID="auth-otp-input"
                            style={[styles.otp, { borderColor: palette.border, color: palette.text, backgroundColor: palette.surface }]}
                            placeholder="000000"
                            placeholderTextColor={palette.muted}
                            value={verificationCode}
                            onChangeText={setVerificationCode}
                            keyboardType="number-pad"
                            maxLength={6}
                            textContentType="oneTimeCode"
                            autoComplete="one-time-code"
                        />
                        <TouchableOpacity testID="auth-verify-button" accessibilityRole="button" disabled={loading} onPress={() => void handleVerify()} style={[styles.primary, { backgroundColor: primaryColor }, loading && { opacity: 0.65 }]}>
                            {loading ? <ActivityIndicator color="#fff" /> : <><Text style={styles.primaryText}>{t('verifyCode', language)}</Text><ArrowRight color="#fff" size={16} /></>}
                        </TouchableOpacity>
                        <TouchableOpacity accessibilityRole="button" disabled={resendIn > 0} onPress={() => void handleResend()} style={styles.link}>
                            <Text style={{ color: resendIn > 0 ? palette.muted : primaryColor, fontWeight: '800', fontSize: 13 }}>
                                {resendIn > 0 ? (sq ? `Dërgo kodin përsëri (${resendIn}s)` : `Send the code again (${resendIn}s)`) : (sq ? 'Dërgo kodin përsëri' : 'Send the code again')}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity testID="auth-sign-up-back-button" accessibilityRole="button" onPress={goBack} style={styles.link}>
                            <View style={styles.backRow}><ArrowLeft color={palette.muted} size={15} /><Text style={{ color: palette.muted, fontWeight: '700', fontSize: 13 }}>{t('back', language)}</Text></View>
                        </TouchableOpacity>
                        <TouchableOpacity testID="auth-skip-to-sign-in" accessibilityRole="button" onPress={onNavigateToSignIn} style={styles.link}>
                            <Text style={{ color: primaryColor, fontWeight: '800', fontSize: 13 }}>{t('skipToSignIn', language)}</Text>
                        </TouchableOpacity>
                    </>}

                    <View style={[styles.footer, { backgroundColor: palette.surfaceMuted, borderColor: palette.border }]}>
                        <Text style={{ color: palette.muted, fontSize: 12 }}>{t('alreadyHaveAccount', language)}</Text>
                        <TouchableOpacity testID="auth-sign-up-sign-in-link" accessibilityRole="button" onPress={onNavigateToSignIn}>
                            <Text style={{ color: primaryColor, fontWeight: '800', fontSize: 13 }}>{t('signIn', language)}</Text>
                        </TouchableOpacity>
                    </View>
                    <TouchableOpacity testID="auth-join-team-link" accessibilityRole="button" onPress={() => navigation?.navigate?.('JoinTeam')} style={styles.link}>
                        <Text style={{ color: palette.muted, fontSize: 12 }}>{t('joinCompany', language)} <Text style={{ color: primaryColor, fontWeight: '800' }}>{t('enterInviteCode', language)}</Text></Text>
                    </TouchableOpacity>
                    <View style={[styles.preferences, { backgroundColor: palette.surfaceMuted, borderColor: palette.border }]}>
                        <AuthPreferences variant="footer" />
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1 },
    top: { paddingHorizontal: 20, paddingTop: 8 },
    progress: { flexDirection: 'row', gap: 6 },
    bar: { flex: 1, height: 4, borderRadius: 2 },
    topRow: { marginTop: 10 },
    stepLabel: { fontSize: 11, fontWeight: '700' },
    scroll: { padding: 20, paddingBottom: 48, width: '100%', maxWidth: 520, alignSelf: 'center' },
    title: { marginTop: 22, fontSize: 24, fontWeight: '900', letterSpacing: -0.4 },
    lead: { marginTop: 8, marginBottom: 18, fontSize: 13, lineHeight: 20 },
    group: { marginBottom: 12 },
    label: { marginBottom: 6, fontSize: 12, fontWeight: '700' },
    input: { height: 48, paddingHorizontal: 13, paddingRight: 44, borderWidth: 1, borderRadius: 12, fontSize: 14 },
    eye: { position: 'absolute', right: 0, top: 0, width: 46, height: 48, alignItems: 'center', justifyContent: 'center' },
    hint: { fontSize: 11, lineHeight: 16, marginBottom: 4 },
    otp: { height: 60, textAlign: 'center', fontSize: 26, letterSpacing: 10, fontWeight: '800', borderWidth: 1, borderRadius: 14 },
    error: { marginBottom: 12, color: brand.colors.error, fontSize: 12, lineHeight: 17 },
    primary: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16, borderRadius: 13 },
    primaryText: { color: '#fff', fontSize: 14, fontWeight: '900' },
    secondary: { minHeight: 46, alignItems: 'center', justifyContent: 'center', marginBottom: 12, borderWidth: 1, borderRadius: 12 },
    link: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
    backRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    footer: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 18, paddingHorizontal: 14, borderWidth: 1, borderRadius: 14 },
    preferences: { marginTop: 10, padding: 10, borderWidth: 1, borderRadius: 14 },
});
