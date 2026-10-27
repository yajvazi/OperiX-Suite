import React, { useState } from 'react';
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    ArrowLeft,
    ArrowRight,
    Building2,
    Check,
    Eye,
    EyeOff,
    LockKeyhole,
    Mail,
    Phone,
    UserRound,
} from 'lucide-react-native';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { t } from '@invoice-monorepo/i18n';
import { AuthPreferences } from '../../components/auth/AuthPreferences';
import { OperixLogo } from '../../components/OperixLogo';
import { brand, getPalette } from '../../theme/brand';

interface SignUpScreenProps {
    onNavigateToSignIn: () => void;
    navigation?: { navigate?: (screen: string) => void };
}

type FieldIconProps = {
    color?: string;
    size?: number;
    strokeWidth?: number;
};

type FormFieldProps = {
    icon: React.ComponentType<FieldIconProps>;
    label: string;
    palette: ReturnType<typeof getPalette>;
    inputProps: React.ComponentProps<typeof TextInput>;
    trailing?: React.ReactNode;
};

const TOTAL_STEPS = 4;

function FormField({ icon: Icon, label, palette, inputProps, trailing }: FormFieldProps) {
    return (
        <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: palette.textSecondary }]}>{label}</Text>
            <View style={[styles.field, { backgroundColor: palette.surfaceMuted, borderColor: palette.border }]}>
                <Icon color={palette.muted} size={18} strokeWidth={2} />
                <TextInput
                    {...inputProps}
                    style={[styles.input, { color: palette.text }, inputProps.style]}
                    placeholderTextColor={palette.muted}
                />
                {trailing}
            </View>
        </View>
    );
}

export function SignUpScreen({ onNavigateToSignIn, navigation }: SignUpScreenProps) {
    const { signUp, verifyEmailOtp, beginOnboarding, completeSignup } = useAuth();
    const { isDark, primaryColor, language } = useTheme();
    const palette = getPalette(isDark);
    const [step, setStep] = useState(1);
    const [email, setEmail] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [phone, setPhone] = useState('');
    const [tenantName, setTenantName] = useState('');
    const [companyRegNumber, setCompanyRegNumber] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [verificationCode, setVerificationCode] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [emailVerificationSent, setEmailVerificationSent] = useState(false);

    const validateStep = (targetStep: number) => {
        setError('');

        if (targetStep === 1) {
            if (!email.trim() || !password || !confirmPassword) {
                setError(t('requiredFields', language));
                return false;
            }
            if (password !== confirmPassword) {
                setError(t('passwordMismatch', language));
                return false;
            }
            if (
                password.length < 8
                || !/[A-Z]/.test(password)
                || !/\d/.test(password)
                || !/[^A-Za-z0-9]/.test(password)
            ) {
                setError(t('passwordMin', language));
                return false;
            }
        }

        if (targetStep === 2 && (!firstName.trim() || !lastName.trim() || !phone.trim())) {
            setError(t('requiredFields', language));
            return false;
        }

        if (targetStep === 3 && !tenantName.trim()) {
            setError(t('tenantNameRequired', language));
            return false;
        }

        return true;
    };

    const handleNext = () => {
        if (!validateStep(step)) return;
        if (step === 1) {
            void handleSignUp();
            return;
        }
        setStep((currentStep) => Math.min(TOTAL_STEPS, currentStep + 1));
    };

    const handleBack = () => {
        setError('');
        setStep((currentStep) => Math.max(1, currentStep - 1));
    };

    const handleSignUp = async () => {
        if (!validateStep(1)) return;

        setLoading(true);
        setError('');
        beginOnboarding();

        try {
            const { error: signUpError } = await signUp(email.trim(), password, {
                data: {
                    first_name: firstName.trim(),
                    last_name: lastName.trim(),
                    full_name: `${firstName.trim()} ${lastName.trim()}`,
                    phone: phone.trim(),
                    company_name: tenantName.trim(),
                    tenant_name: tenantName.trim(),
                    tax_id: companyRegNumber.trim(),
                },
            });

            if (signUpError) {
                setError(t('signUpFailed', language));
            } else {
                setEmailVerificationSent(true);
                setStep(2);
            }
        } catch {
            setError(t('unexpectedError', language));
        } finally {
            setLoading(false);
        }
    };

    const handleVerify = async () => {
        const code = verificationCode.trim();
        if (!code) {
            setError(t('enterVerificationCode', language));
            return;
        }

        setLoading(true);
        setError('');
        try {
            const { error: verificationError } = await verifyEmailOtp(email.trim(), code);
            if (verificationError) {
                setError(t('verificationFailed', language));
            } else {
                const { error: workspaceError } = await completeSignup({
                    tenantName: tenantName.trim(),
                    firstName: firstName.trim(),
                    lastName: lastName.trim(),
                    phone: phone.trim(),
                    taxId: companyRegNumber.trim(),
                });
                if (workspaceError) {
                    setError(t('workspaceCreationFailed', language));
                }
            }
        } catch {
            setError(t('verificationFailed', language));
        } finally {
            setLoading(false);
        }
    };

    if (emailVerificationSent && step === TOTAL_STEPS) {
        return (
            <View style={[styles.container, { backgroundColor: palette.background }]}>
                <SafeAreaView style={styles.safeArea}>
                    <KeyboardAvoidingView style={styles.safeArea} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.successScrollContent}>
                    <View style={[styles.successCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                        <View style={[styles.successIcon, { backgroundColor: palette.iconSurface }]}>
                            <Mail color={primaryColor} size={26} strokeWidth={2.2} />
                        </View>
                        <Text style={[styles.successTitle, { color: palette.text }]}>{t('verifyEmail', language)}</Text>
                        <Text style={[styles.successText, { color: palette.muted }]}>
                            {t('signupVerificationSubtitle', language).replace('{email}', email.trim())}
                        </Text>

                        {error ? (
                            <View style={[styles.errorBox, { backgroundColor: palette.errorSoft, borderColor: palette.error }]}>
                                <Text style={[styles.errorText, { color: palette.error }]}>{error}</Text>
                            </View>
                        ) : null}

                        <TextInput
                            testID="auth-otp-input"
                            style={[styles.otpInput, { backgroundColor: palette.surfaceMuted, borderColor: palette.border, color: palette.text }]}
                            placeholder="000000"
                            placeholderTextColor={palette.muted}
                            value={verificationCode}
                            onChangeText={setVerificationCode}
                            keyboardType="number-pad"
                            maxLength={6}
                            textContentType="oneTimeCode"
                            autoComplete="one-time-code"
                        />

                        <TouchableOpacity
                            testID="auth-verify-button"
                            accessibilityRole="button"
                            style={[styles.button, styles.fullWidthButton, { backgroundColor: primaryColor }, loading && styles.buttonDisabled]}
                            onPress={handleVerify}
                            disabled={loading}
                        >
                            {loading ? <ActivityIndicator color="#fff" /> : <><Text style={styles.buttonText}>{t('verifyCode', language)}</Text><ArrowRight color="#fff" size={17} /></>}
                        </TouchableOpacity>

                        <TouchableOpacity testID="auth-skip-to-sign-in" accessibilityRole="button" style={styles.textButton} onPress={onNavigateToSignIn}>
                            <Text style={[styles.link, { color: primaryColor }]}>{t('skipToSignIn', language)}</Text>
                        </TouchableOpacity>
                    </View>
                    </ScrollView>
                    </KeyboardAvoidingView>
                </SafeAreaView>
            </View>
        );
    }

    const stepCopy = [
        { label: t('signupStepAccount', language), description: t('signupStepAccountDescription', language) },
        { label: t('signupStepPersonal', language), description: t('signupStepPersonalDescription', language) },
        { label: t('signupStepCompany', language), description: t('signupStepCompanyDescription', language) },
        { label: t('signupStepVerification', language), description: t('signupStepVerificationDescription', language) },
    ][step - 1];
    const StepIcon = step === 1 ? LockKeyhole : step === 2 ? UserRound : step === 3 ? Building2 : Mail;
    const optionalLabel = (key: 'companyRegisteredNumber') => `${t(key, language)} (${t('optional', language)})`;

    return (
        <View style={[styles.container, { backgroundColor: palette.background }]}>
            <SafeAreaView style={styles.safeArea}>
                <KeyboardAvoidingView style={styles.safeArea} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                <View style={styles.page}>
                    <AuthPreferences />
                    <View style={styles.brandRow}>
                        <OperixLogo width={155} reversed={isDark} />
                        <Text style={[styles.brandCaption, { color: palette.muted }]}>{t('authProductEyebrow', language)}</Text>
                    </View>
                    <Text style={[styles.title, { color: palette.text }]}>{t('createAccount', language)}</Text>
                    <Text style={[styles.subtitle, { color: palette.muted }]}>{t('signupWelcomeSubtitle', language)}</Text>

                    <View style={[styles.progressCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                        <View style={styles.progressHeader}>
                            <Text style={[styles.progressStep, { color: primaryColor }]}>
                                {t('signupStepOf', language).replace('{current}', String(step)).replace('{total}', String(TOTAL_STEPS))}
                            </Text>
                            <Text style={[styles.progressName, { color: palette.text }]}>{stepCopy.label}</Text>
                        </View>
                        <View style={[styles.progressTrack, { backgroundColor: palette.surfaceMuted }]}>
                            <View style={[styles.progressFill, { backgroundColor: primaryColor, width: `${(step / TOTAL_STEPS) * 100}%` }]} />
                        </View>
                        <View style={styles.stepRow}>
                            {[1, 2, 3].map((stepNumber) => {
                                const complete = stepNumber < step;
                                const current = stepNumber === step;
                                return (
                                    <View key={stepNumber} style={styles.stepItem}>
                                        <View style={[styles.stepDot, { borderColor: current || complete ? primaryColor : palette.border, backgroundColor: complete ? primaryColor : current ? palette.iconSurface : palette.surface }]}>
                                            {complete ? <Check color="#fff" size={13} strokeWidth={3} /> : <Text style={[styles.stepNumber, { color: current ? primaryColor : palette.muted }]}>{stepNumber}</Text>}
                                        </View>
                                        <Text style={[styles.stepDotLabel, { color: current ? palette.text : palette.muted }]}>{stepNumber === 1 ? t('signupStepAccount', language) : stepNumber === 2 ? t('signupStepPersonal', language) : t('signupStepCompany', language)}</Text>
                                    </View>
                                );
                            })}
                        </View>
                    </View>

                    <View style={[styles.form, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                        <View style={styles.sectionHeader}>
                            <View style={[styles.sectionIcon, { backgroundColor: palette.iconSurface }]}><StepIcon color={primaryColor} size={19} /></View>
                            <View style={styles.sectionCopy}>
                                <Text style={[styles.sectionTitle, { color: palette.text }]}>{stepCopy.label}</Text>
                                <Text style={[styles.sectionDescription, { color: palette.muted }]}>{stepCopy.description}</Text>
                            </View>
                        </View>

                        {error ? (
                            <View style={[styles.errorBox, { backgroundColor: palette.errorSoft, borderColor: palette.error }]}>
                                <Text style={[styles.errorText, { color: palette.error }]}>{error}</Text>
                            </View>
                        ) : null}

                        {step === 1 ? (
                            <>
                                <FormField
                                    icon={Mail}
                                    label={`${t('email', language)} *`}
                                    palette={palette}
                                    inputProps={{
                                        testID: 'auth-sign-up-email',
                                        placeholder: t('enterEmail', language),
                                        value: email,
                                        onChangeText: setEmail,
                                        keyboardType: 'email-address',
                                        autoCapitalize: 'none',
                                        autoCorrect: false,
                                        returnKeyType: 'next',
                                    }}
                                />
                                <FormField
                                    icon={LockKeyhole}
                                    label={`${t('password', language)} *`}
                                    palette={palette}
                                    inputProps={{
                                        testID: 'auth-sign-up-password',
                                        placeholder: t('createPassword', language),
                                        value: password,
                                        onChangeText: setPassword,
                                        secureTextEntry: !showPassword,
                                        autoCapitalize: 'none',
                                        returnKeyType: 'next',
                                    }}
                                    trailing={<TouchableOpacity testID="auth-toggle-password" accessibilityRole="button" accessibilityLabel={t('authShowPassword', language)} onPress={() => setShowPassword((visible) => !visible)}><>{showPassword ? <EyeOff color={palette.muted} size={18} /> : <Eye color={palette.muted} size={18} />}</></TouchableOpacity>}
                                />
                                <FormField
                                    icon={LockKeyhole}
                                    label={`${t('confirmPassword', language)} *`}
                                    palette={palette}
                                    inputProps={{
                                        testID: 'auth-sign-up-confirm-password',
                                        placeholder: t('confirmYourPassword', language),
                                        value: confirmPassword,
                                        onChangeText: setConfirmPassword,
                                        secureTextEntry: !showConfirmPassword,
                                        autoCapitalize: 'none',
                                        returnKeyType: 'done',
                                    }}
                                    trailing={<TouchableOpacity testID="auth-toggle-confirm-password" accessibilityRole="button" accessibilityLabel={t('authShowConfirmPassword', language)} onPress={() => setShowConfirmPassword((visible) => !visible)}><>{showConfirmPassword ? <EyeOff color={palette.muted} size={18} /> : <Eye color={palette.muted} size={18} />}</></TouchableOpacity>}
                                />
                                <Text style={[styles.passwordHint, { color: palette.muted }]}>{t('passwordRequirements', language)}</Text>
                            </>
                        ) : null}

                        {step === 2 ? (
                            <>
                                <FormField
                                    icon={UserRound}
                                    label={`${t('firstName', language)} *`}
                                    palette={palette}
                                    inputProps={{ testID: 'auth-sign-up-first-name', placeholder: t('firstName', language), value: firstName, onChangeText: setFirstName, autoCapitalize: 'words', returnKeyType: 'next' }}
                                />
                                <FormField
                                    icon={UserRound}
                                    label={`${t('lastName', language)} *`}
                                    palette={palette}
                                    inputProps={{ testID: 'auth-sign-up-last-name', placeholder: t('lastName', language), value: lastName, onChangeText: setLastName, autoCapitalize: 'words', returnKeyType: 'next' }}
                                />
                                <FormField
                                    icon={Phone}
                                    label={`${t('phoneNumber', language)} *`}
                                    palette={palette}
                                    inputProps={{ testID: 'auth-sign-up-phone', placeholder: t('phonePlaceholder', language), value: phone, onChangeText: setPhone, keyboardType: 'phone-pad', returnKeyType: 'done' }}
                                />
                            </>
                        ) : null}

                        {step === 3 ? (
                            <>
                                <FormField
                                    icon={Building2}
                                    label={`${t('tenantName', language)} *`}
                                    palette={palette}
                                    inputProps={{ testID: 'auth-sign-up-tenant-name', placeholder: t('tenantNamePlaceholder', language), value: tenantName, onChangeText: setTenantName, autoCapitalize: 'words', returnKeyType: 'next' }}
                                />
                                <FormField
                                    icon={Building2}
                                    label={optionalLabel('companyRegisteredNumber')}
                                    palette={palette}
                                    inputProps={{ placeholder: t('taxIdRegistration', language), value: companyRegNumber, onChangeText: setCompanyRegNumber, returnKeyType: 'done' }}
                                />
                                <View style={[styles.infoBox, { backgroundColor: palette.iconSurface }]}>
                                    <Text style={[styles.infoText, { color: palette.textSecondary }]}>{t('signupWorkspaceWillBeCreated', language)}</Text>
                                </View>
                            </>
                        ) : null}

                        <View style={[styles.actions, step === 1 && styles.actionsSingle]}>
                            {step > 1 ? (
                                <TouchableOpacity testID="auth-sign-up-back-button" accessibilityRole="button" style={[styles.backButton, { borderColor: palette.border }]} onPress={handleBack} disabled={loading}>
                                    <ArrowLeft color={palette.textSecondary} size={17} />
                                    <Text style={[styles.backButtonText, { color: palette.textSecondary }]}>{t('back', language)}</Text>
                                </TouchableOpacity>
                            ) : null}
                            <TouchableOpacity
                                testID="auth-sign-up-button"
                                accessibilityRole="button"
                                style={[styles.button, step === 1 && styles.fullWidthButton, { backgroundColor: primaryColor }, loading && styles.buttonDisabled]}
                                onPress={step === TOTAL_STEPS ? handleSignUp : handleNext}
                                disabled={loading}
                            >
                                {loading ? <ActivityIndicator color="#fff" /> : <><Text style={styles.buttonText}>{step === 1 ? t('sendVerificationCode', language) : t('continue', language)}</Text><ArrowRight color="#fff" size={17} /></>}
                            </TouchableOpacity>
                        </View>

                        <View style={styles.footer}>
                            <Text style={[styles.footerText, { color: palette.muted }]}>{t('alreadyHaveAccount', language)}</Text>
                            <TouchableOpacity testID="auth-sign-up-sign-in-link" accessibilityRole="button" onPress={onNavigateToSignIn}>
                                <Text style={[styles.link, { color: primaryColor }]}>{t('signIn', language)}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.joinFooter}>
                        <Text style={[styles.footerText, { color: palette.muted }]}>{t('joinCompany', language)}</Text>
                        <TouchableOpacity testID="auth-join-team-link" accessibilityRole="button" onPress={() => navigation?.navigate?.('JoinTeam')}>
                            <Text style={[styles.link, { color: primaryColor }]}>{t('enterInviteCode', language)}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
                </ScrollView>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    safeArea: { flex: 1 },
    scrollContent: { flexGrow: 1, padding: 20 },
    page: { width: '100%', maxWidth: 520, alignSelf: 'center', paddingTop: 8, paddingBottom: 18 },
    brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
    brandCaption: { fontSize: 10, fontWeight: '800', letterSpacing: 1.3 },
    title: { fontSize: 30, lineHeight: 36, fontWeight: '900', letterSpacing: -0.6 },
    subtitle: { marginTop: 7, marginBottom: 20, fontSize: 14, lineHeight: 20 },
    progressCard: { padding: 16, borderWidth: 1, borderRadius: 18, marginBottom: 14, ...brand.shadow.floating },
    progressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    progressStep: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
    progressName: { fontSize: 12, fontWeight: '700' },
    progressTrack: { height: 5, overflow: 'hidden', borderRadius: 5 },
    progressFill: { height: '100%', borderRadius: 5 },
    stepRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
    stepItem: { alignItems: 'center', flex: 1 },
    stepDot: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderRadius: 13 },
    stepNumber: { fontSize: 12, fontWeight: '800' },
    stepDotLabel: { marginTop: 6, fontSize: 10, fontWeight: '600' },
    form: { padding: 20, borderWidth: 1, borderRadius: 22, ...brand.shadow.floating },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    sectionIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13 },
    sectionCopy: { flex: 1, marginLeft: 12 },
    sectionTitle: { fontSize: 18, fontWeight: '900', letterSpacing: -0.2 },
    sectionDescription: { marginTop: 3, fontSize: 12, lineHeight: 17 },
    errorBox: { marginBottom: 15, padding: 11, borderWidth: 1, borderRadius: 11 },
    errorText: { fontSize: 12, lineHeight: 17 },
    inputGroup: { marginBottom: 14 },
    label: { marginBottom: 7, fontSize: 12, fontWeight: '800' },
    field: { height: 54, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderWidth: 1, borderRadius: 14 },
    input: { flex: 1, minWidth: 0, height: '100%', marginLeft: 10, paddingVertical: 0, fontSize: 14 },
    passwordHint: { marginTop: -4, marginBottom: 10, fontSize: 11, lineHeight: 16 },
    infoBox: { marginTop: 2, padding: 12, borderRadius: 12 },
    infoText: { fontSize: 12, lineHeight: 17 },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 7 },
    actionsSingle: { flexDirection: 'column', alignItems: 'stretch' },
    backButton: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 16, borderWidth: 1, borderRadius: 14 },
    backButtonText: { fontSize: 13, fontWeight: '800' },
    button: { minHeight: 52, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 14, ...brand.shadow.floating },
    buttonDisabled: { opacity: 0.65 },
    fullWidthButton: { width: '100%', flex: 0 },
    buttonText: { color: '#fff', fontSize: 14, fontWeight: '900' },
    footer: { flexDirection: 'row', justifyContent: 'center', gap: 4, marginTop: 20 },
    joinFooter: { flexDirection: 'row', justifyContent: 'center', gap: 4, marginTop: 17 },
    footerText: { fontSize: 12 },
    link: { fontSize: 12, fontWeight: '800' },
    textButton: { marginTop: 18, padding: 6 },
    successScrollContent: { flexGrow: 1, justifyContent: 'center', padding: 20 },
    successCard: { width: '100%', maxWidth: 440, alignSelf: 'center', alignItems: 'center', padding: 24, borderWidth: 1, borderRadius: 22, ...brand.shadow.floating },
    successIcon: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center', marginBottom: 18, borderRadius: 20 },
    successTitle: { fontSize: 24, fontWeight: '900', letterSpacing: -0.4 },
    successText: { maxWidth: 330, marginTop: 8, marginBottom: 20, textAlign: 'center', fontSize: 13, lineHeight: 20 },
    otpInput: { width: '100%', height: 58, borderWidth: 1, borderRadius: 14, textAlign: 'center', fontSize: 24, fontWeight: '800', letterSpacing: 6 },
});
