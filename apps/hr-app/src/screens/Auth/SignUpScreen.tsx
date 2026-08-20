import React, { useState } from 'react';
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
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { t } from '@invoice-monorepo/i18n';
import { OperixLogo } from '../../components/OperixLogo';
import { brand, getPalette } from '../../theme/brand';

interface SignUpScreenProps {
    onNavigateToSignIn: () => void;
    navigation?: any;
}

export function SignUpScreen({ onNavigateToSignIn, navigation }: SignUpScreenProps) {
    const { signUp, verifyEmailOtp } = useAuth();
    const { isDark, primaryColor, language } = useTheme();
    const palette = getPalette(isDark);
    const [email, setEmail] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [phone, setPhone] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [companyRegNumber, setCompanyRegNumber] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [verificationCode, setVerificationCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleSignUp = async () => {
        if (!email.trim() || !password || !confirmPassword || !firstName.trim() || !lastName.trim() || !phone.trim()) {
            setError(t('requiredFields', language));
            return;
        }
        if (password !== confirmPassword) {
            setError(t('passwordMismatch', language));
            return;
        }
        if (password.length < 6) {
            setError(t('passwordMin', language));
            return;
        }

        setLoading(true);
        setError('');
        try {
            const { error: signUpError } = await signUp(email.trim().toLowerCase(), password, {
                data: {
                    first_name: firstName.trim(),
                    last_name: lastName.trim(),
                    full_name: `${firstName.trim()} ${lastName.trim()}`,
                    phone: phone.trim(),
                    company_name: companyName.trim(),
                    tax_id: companyRegNumber.trim(),
                },
            });
            if (signUpError) setError(t('signUpFailed', language));
            else setSuccess(true);
        } catch {
            setError(t('unexpectedError', language));
        } finally {
            setLoading(false);
        }
    };

    const handleVerify = async () => {
        if (!verificationCode.trim()) {
            setError(t('enterVerificationCode', language));
            return;
        }
        setLoading(true);
        setError('');
        try {
            const { error: verificationError } = await verifyEmailOtp(email.trim().toLowerCase(), verificationCode.trim());
            if (verificationError) setError(t('verificationFailed', language));
            else onNavigateToSignIn();
        } catch {
            setError(t('verificationFailed', language));
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.container, { backgroundColor: palette.background }]}>
                <ScrollView contentContainerStyle={styles.successScroll} keyboardShouldPersistTaps="handled">
                    <OperixLogo width={190} reversed={isDark} />
                    <View style={[styles.successCard, { backgroundColor: palette.surface }]}>
                        <Text style={[styles.successTitle, { color: palette.text }]}>Verify your email</Text>
                        <Text style={[styles.successText, { color: palette.muted }]}>Enter the verification code sent to {email}.</Text>
                        {error ? <ErrorMessage message={error} /> : null}
                        <TextInput
                            style={[styles.input, styles.codeInput, { backgroundColor: palette.surface, borderColor: palette.border, color: palette.text }]}
                            placeholder="000000"
                            placeholderTextColor={palette.muted}
                            value={verificationCode}
                            onChangeText={setVerificationCode}
                            keyboardType="number-pad"
                            maxLength={6}
                        />
                        <TouchableOpacity style={[styles.button, { backgroundColor: primaryColor }, loading && styles.buttonDisabled]} onPress={() => void handleVerify()} disabled={loading}>
                            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify code</Text>}
                        </TouchableOpacity>
                        <TouchableOpacity onPress={onNavigateToSignIn} style={styles.secondaryAction}>
                            <Text style={[styles.link, { color: primaryColor }]}>Back to sign in</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        );
    }

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.container, { backgroundColor: palette.background }]}>
            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                <View style={styles.header}>
                    <OperixLogo width={190} reversed={isDark} />
                    <Text style={[styles.title, { color: palette.text }]}>Create your account</Text>
                    <Text style={[styles.subtitle, { color: palette.muted }]}>Set up your OperiX HR workspace.</Text>
                </View>

                <View style={[styles.form, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                    {error ? <ErrorMessage message={error} /> : null}

                    <Field label="First name *" value={firstName} onChangeText={setFirstName} placeholder="John" palette={palette} />
                    <Field label="Last name *" value={lastName} onChangeText={setLastName} placeholder="Doe" palette={palette} />
                    <Field label="Email *" value={email} onChangeText={setEmail} placeholder="john@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} palette={palette} />
                    <Field label="Password *" value={password} onChangeText={setPassword} placeholder="Create a password" secureTextEntry palette={palette} />
                    <Field label="Confirm password *" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirm your password" secureTextEntry palette={palette} />
                    <Field label="Phone number *" value={phone} onChangeText={setPhone} placeholder="+1 234 567 8900" keyboardType="phone-pad" palette={palette} />
                    <Field label="Company name" value={companyName} onChangeText={setCompanyName} placeholder="Your company" palette={palette} />
                    <Field label="Company registration number" value={companyRegNumber} onChangeText={setCompanyRegNumber} placeholder="Tax ID / registration" palette={palette} />

                    <TouchableOpacity style={[styles.button, { backgroundColor: primaryColor }, loading && styles.buttonDisabled]} onPress={() => void handleSignUp()} disabled={loading}>
                        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create account</Text>}
                    </TouchableOpacity>

                    <View style={styles.footer}><Text style={[styles.footerText, { color: palette.muted }]}>Already have an account?</Text><TouchableOpacity onPress={onNavigateToSignIn}><Text style={[styles.link, { color: primaryColor }]}>Sign in</Text></TouchableOpacity></View>
                    <View style={styles.footer}><Text style={[styles.footerText, { color: palette.muted }]}>Joining a company?</Text><TouchableOpacity onPress={() => navigation?.navigate('JoinTeam')}><Text style={[styles.link, { color: primaryColor }]}>Enter invite code</Text></TouchableOpacity></View>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

function Field({ label, palette, ...props }: { label: string; palette: ReturnType<typeof getPalette> } & React.ComponentProps<typeof TextInput>) {
    return (
        <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: palette.textSecondary }]}>{label}</Text>
            <TextInput {...props} style={[styles.input, { backgroundColor: palette.surface, borderColor: palette.border, color: palette.text }, props.style]} placeholderTextColor={palette.muted} />
        </View>
    );
}

function ErrorMessage({ message }: { message: string }) {
    return <View style={styles.errorBox}><Text style={styles.errorText}>{message}</Text></View>;
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
    successScroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    header: { alignItems: 'center', marginBottom: 32 },
    title: { fontSize: 25, lineHeight: 32, fontFamily: brand.fonts.semibold, marginTop: 24 },
    subtitle: { fontSize: 14, fontFamily: brand.fonts.regular, marginTop: 6 },
    form: { borderRadius: brand.radius.panel, borderWidth: 1, padding: 22, ...brand.shadow.card },
    successCard: { width: '100%', borderRadius: brand.radius.panel, padding: 24, marginTop: 28, ...brand.shadow.card },
    successTitle: { fontSize: 23, fontFamily: brand.fonts.semibold, textAlign: 'center' },
    successText: { fontSize: 13, fontFamily: brand.fonts.regular, textAlign: 'center', lineHeight: 20, marginTop: 8, marginBottom: 22 },
    errorBox: { backgroundColor: brand.colors.errorSoft, borderWidth: 1, borderColor: brand.colors.error, borderRadius: 12, padding: 12, marginBottom: 16 },
    errorText: { color: brand.colors.error, textAlign: 'center', fontFamily: brand.fonts.medium, fontSize: 12 },
    inputGroup: { marginBottom: 14 },
    label: { marginBottom: 7, fontFamily: brand.fonts.medium, fontSize: 12 },
    input: { borderWidth: 1, borderRadius: brand.radius.control, paddingHorizontal: 15, minHeight: 52, fontSize: 15, fontFamily: brand.fonts.regular },
    codeInput: { textAlign: 'center', fontSize: 23, letterSpacing: 5 },
    button: { minHeight: 54, borderRadius: brand.radius.control, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, marginTop: 6, ...brand.shadow.floating },
    buttonDisabled: { opacity: 0.7 },
    buttonText: { color: '#fff', fontSize: 15, fontFamily: brand.fonts.semibold },
    footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 20, gap: 4 },
    footerText: { fontSize: 12, fontFamily: brand.fonts.regular },
    link: { fontSize: 12, fontFamily: brand.fonts.semibold },
    secondaryAction: { alignItems: 'center', marginTop: 18 },
});
