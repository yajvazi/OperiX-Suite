import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    ActivityIndicator,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
} from 'react-native';
import { useAuth } from '@invoice-monorepo/hooks';
import { useTheme } from '@invoice-monorepo/hooks';
import { OperixLogo } from '../../components/OperixLogo';
import { brand, getPalette } from '../../theme/brand';
import { t } from '@invoice-monorepo/i18n';

interface SignUpScreenProps {
    onNavigateToSignIn: () => void;
    navigation?: any;
}

export function SignUpScreen({ onNavigateToSignIn, navigation }: SignUpScreenProps) {
    const { signUp, verifyEmailOtp } = useAuth();
    const { isDark, primaryColor, language } = useTheme();
    const [email, setEmail] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [phone, setPhone] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [companyRegNumber, setCompanyRegNumber] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    // Dynamic theme colors
    const palette = getPalette(isDark);
    const bgColor = palette.background;
    const cardBg = palette.surface;
    const inputBg = palette.surface;
    const textColor = palette.text;
    const labelColor = palette.textSecondary;
    const mutedColor = palette.muted;
    const borderColor = palette.border;

    const handleSignUp = async () => {
        if (!email || !password || !confirmPassword || !firstName || !lastName || !phone) {
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
            const { error: signUpError } = await signUp(email, password, {
                data: {
                    first_name: firstName,
                    last_name: lastName,
                    full_name: `${firstName} ${lastName}`,
                    phone: phone,
                    company_name: companyName,
                    tax_id: companyRegNumber
                }
            });
            if (signUpError) {
                setError(t('signUpFailed', language));
            } else {
                setSuccess(true);
            }
        } catch (e) {
            setError(t('unexpectedError', language));
        } finally {
            setLoading(false);
        }
    };

    const [verificationCode, setVerificationCode] = useState('');

    const handleVerify = async () => {
        if (!verificationCode) {
            setError(t('enterVerificationCode', language));
            return;
        }
        setLoading(true);
        try {
            const { error } = await verifyEmailOtp(email, verificationCode);
            if (error) {
                setError(t('verificationFailed', language));
            } else {
                onNavigateToSignIn();
            }
        } catch (e) {
            setError(t('verificationFailed', language));
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.container, { backgroundColor: bgColor }]}>
                <View style={styles.successBox}>
                    <Text style={styles.successTitle}>{t('verifyEmail', language)}</Text>
                    <Text style={[styles.successText, { color: mutedColor }]}>
                        {t('verificationCodeSentTo', language).replace('{email}', email)}
                    </Text>

                    {error ? (
                        <View style={styles.errorBox}>
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    ) : null}

                    <TextInput
                        testID="auth-otp-input"
                        style={[styles.input, { backgroundColor: inputBg, borderColor, color: textColor, width: '100%', textAlign: 'center', fontSize: 24, letterSpacing: 4 }]}
                        placeholder="000000"
                        placeholderTextColor={mutedColor}
                        value={verificationCode}
                        onChangeText={setVerificationCode}
                        keyboardType="number-pad"
                        maxLength={6}
                    />

                    <TouchableOpacity testID="auth-verify-button" accessibilityRole="button" style={[styles.button, { backgroundColor: primaryColor, marginTop: 24, width: '100%' }]} onPress={handleVerify} disabled={loading}>
                        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{t('verifyCode', language)}</Text>}
                    </TouchableOpacity>

                    <TouchableOpacity testID="auth-skip-to-sign-in" accessibilityRole="button" style={{ marginTop: 16 }} onPress={onNavigateToSignIn}>
                        <Text style={[styles.link, { color: primaryColor }]}>{t('skipToSignIn', language)}</Text>
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        );
    }

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={[styles.container, { backgroundColor: bgColor }]}
        >
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="none"
            >
                <View style={styles.header}>
                    <OperixLogo width={180} reversed={isDark} />
                    <Text style={[styles.title, { color: primaryColor }]}>{t('createAccount', language)}</Text>
                    <Text style={[styles.subtitle, { color: mutedColor }]}>{t('startManagingInvoices', language)}</Text>
                </View>

                <View style={[styles.form, { backgroundColor: cardBg, borderColor }]}>
                    {error ? (
                        <View style={styles.errorBox}>
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    ) : null}

                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: labelColor }]}>{t('firstName', language)} *</Text>
                        <TextInput
                            testID="auth-sign-up-first-name"
                            style={[styles.input, { backgroundColor: inputBg, borderColor, color: textColor }]}
                            placeholder={t('firstName', language)}
                            placeholderTextColor={mutedColor}
                            value={firstName}
                            onChangeText={setFirstName}
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: labelColor }]}>{t('lastName', language)} *</Text>
                        <TextInput
                            testID="auth-sign-up-last-name"
                            style={[styles.input, { backgroundColor: inputBg, borderColor, color: textColor }]}
                            placeholder={t('lastName', language)}
                            placeholderTextColor={mutedColor}
                            value={lastName}
                            onChangeText={setLastName}
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: labelColor }]}>{t('email', language)} *</Text>
                        <TextInput
                            testID="auth-sign-up-email"
                            style={[styles.input, { backgroundColor: inputBg, borderColor, color: textColor }]}
                            placeholder={t('enterEmail', language)}
                            placeholderTextColor={mutedColor}
                            value={email}
                            onChangeText={setEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: labelColor }]}>{t('password', language)} *</Text>
                        <TextInput
                            testID="auth-sign-up-password"
                            style={[styles.input, { backgroundColor: inputBg, borderColor, color: textColor }]}
                            placeholder={t('createPassword', language)}
                            placeholderTextColor={mutedColor}
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: labelColor }]}>{t('confirmPassword', language)} *</Text>
                        <TextInput
                            testID="auth-sign-up-confirm-password"
                            style={[styles.input, { backgroundColor: inputBg, borderColor, color: textColor }]}
                            placeholder={t('confirmYourPassword', language)}
                            placeholderTextColor={mutedColor}
                            value={confirmPassword}
                            onChangeText={setConfirmPassword}
                            secureTextEntry
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: labelColor }]}>{t('phoneNumber', language)} *</Text>
                        <TextInput
                            testID="auth-sign-up-phone"
                            style={[styles.input, { backgroundColor: inputBg, borderColor, color: textColor }]}
                            placeholder="+1 234 567 8900"
                            placeholderTextColor={mutedColor}
                            value={phone}
                            onChangeText={setPhone}
                            keyboardType="phone-pad"
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: labelColor }]}>{t('companyName', language)}</Text>
                        <TextInput
                            style={[styles.input, { backgroundColor: inputBg, borderColor, color: textColor }]}
                            placeholder={t('yourCompanyDetails', language)}
                            placeholderTextColor={mutedColor}
                            value={companyName}
                            onChangeText={setCompanyName}
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={[styles.label, { color: labelColor }]}>{t('companyRegisteredNumber', language)}</Text>
                        <TextInput
                            style={[styles.input, { backgroundColor: inputBg, borderColor, color: textColor }]}
                            placeholder={t('taxIdRegistration', language)}
                            placeholderTextColor={mutedColor}
                            value={companyRegNumber}
                            onChangeText={setCompanyRegNumber}
                        />
                    </View>

                    <TouchableOpacity
                        testID="auth-sign-up-button"
                        accessibilityRole="button"
                        style={[styles.button, { backgroundColor: primaryColor }, loading && styles.buttonDisabled]}
                        onPress={handleSignUp}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.buttonText}>{t('createAccount', language)}</Text>
                        )}
                    </TouchableOpacity>

                    <View style={styles.footer}>
                        <Text style={[styles.footerText, { color: mutedColor }]}>{t('alreadyHaveAccount', language)}</Text>
                        <TouchableOpacity testID="auth-sign-up-sign-in-link" accessibilityRole="button" onPress={onNavigateToSignIn}>
                            <Text style={[styles.link, { color: primaryColor }]}>{t('signIn', language)}</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={[styles.footer, { marginTop: 12 }]}>
                        <Text style={[styles.footerText, { color: mutedColor }]}>{t('joinCompany', language)}</Text>
                        <TouchableOpacity testID="auth-join-team-link" accessibilityRole="button" onPress={() => (navigation as any).navigate('JoinTeam')}>
                            <Text style={[styles.link, { color: primaryColor }]}>{t('enterInviteCode', language)}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        justifyContent: 'center',
        padding: 24,
    },
    header: {
        alignItems: 'center',
        marginBottom: 48,
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
    },
    form: {
        borderRadius: 16,
        padding: 24,
    },
    errorBox: {
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderWidth: 1,
        borderColor: '#ef4444',
        borderRadius: 8,
        padding: 12,
        marginBottom: 16,
    },
    errorText: {
        color: '#ef4444',
        textAlign: 'center',
    },
    successBox: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    successTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#12B76A',
        marginBottom: 12,
    },
    successText: {
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 24,
    },
    inputGroup: {
        marginBottom: 16,
    },
    label: {
        marginBottom: 8,
        fontWeight: '500',
    },
    input: {
        borderWidth: 1,
        borderRadius: 12,
        padding: 16,
        fontSize: 16,
    },
    button: {
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        marginTop: 8,
    },
    buttonDisabled: {
        opacity: 0.7,
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 24,
        gap: 4,
    },
    footerText: {
    },
    link: {
        fontWeight: '600',
    },
});


