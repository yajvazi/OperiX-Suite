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
import { SvgXml } from 'react-native-svg';
import { ArrowRight, LockKeyhole, Mail, MapPin } from 'lucide-react-native';

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
    const { isDark, primaryColor } = useTheme();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Dynamic theme colors
    const bgColor = isDark ? '#0f172a' : '#f8fafc';
    const cardBg = isDark ? '#1e293b' : '#ffffff';
    const inputBg = isDark ? '#0f172a' : '#f1f5f9';
    const textColor = isDark ? '#fff' : '#1e293b';
    const labelColor = isDark ? '#e2e8f0' : '#374151';
    const mutedColor = isDark ? '#94a3b8' : '#64748b';
    const borderColor = isDark ? '#334155' : '#e2e8f0';

    const handleSignIn = async () => {
        if (!email || !password) {
            setError('Please fill in all fields');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const { error: signInError } = await signIn(email, password);
            if (signInError) {
                setError(signInError.message);
            }
        } catch (e) {
            setError('An unexpected error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.container, { backgroundColor: bgColor }]}>
            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                <View style={styles.hero}><View style={styles.logoRow}><View style={styles.logoMark}><MapPin color="#fff" size={16} /></View><Text style={styles.logoText}><Text>OperiX</Text><Text style={styles.logoProduct}> Tracker</Text></Text></View><Text style={styles.eyebrow}>OPERIX SUITE</Text><Text style={styles.heroTitle}>Make every movement feel effortless.</Text><Text style={styles.heroSubtitle}>One calm workspace for your team, locations, and daily work.</Text></View>
                <View style={[styles.form, { backgroundColor: cardBg, borderColor }]}>
                    <Text style={[styles.formEyebrow, { color: primaryColor }]}>WELCOME BACK</Text><Text style={[styles.formTitle, { color: textColor }]}>Sign in to Tracker</Text><Text style={[styles.formSubtitle, { color: mutedColor }]}>Use the same OperiX account you use across the Suite.</Text>
                    {error ? (
                        <View style={styles.errorBox}>
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    ) : null}

                    <View style={styles.inputGroup}><Text style={[styles.label, { color: labelColor }]}>Email address</Text><View style={[styles.field, { borderColor }]}><Mail color={mutedColor} size={18} /><TextInput style={[styles.input, { color: textColor }]} placeholder="you@company.com" placeholderTextColor={mutedColor} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" /></View></View>

                    <View style={styles.inputGroup}><Text style={[styles.label, { color: labelColor }]}>Password</Text><View style={[styles.field, { borderColor }]}><LockKeyhole color={mutedColor} size={18} /><TextInput style={[styles.input, { color: textColor }]} placeholder="••••••••" placeholderTextColor={mutedColor} value={password} onChangeText={setPassword} secureTextEntry /></View></View>

                    <TouchableOpacity
                        style={[styles.button, { backgroundColor: primaryColor }, loading && styles.buttonDisabled]}
                        onPress={handleSignIn}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (<><Text style={styles.buttonText}>Sign in</Text><ArrowRight color="#fff" size={17} /></>)}
                    </TouchableOpacity>

                    <View style={styles.divider}>
                        <View style={[styles.line, { backgroundColor: borderColor }]} />
                        <Text style={[styles.dividerText, { color: mutedColor }]}>OR</Text>
                        <View style={[styles.line, { backgroundColor: borderColor }]} />
                    </View>


                    <TouchableOpacity
                        style={[styles.googleButton, { borderColor }]}
                        onPress={async () => {
                            setLoading(true);
                            const { error } = await signInWithGoogle();
                            if (error) setError(error.message);
                            setLoading(false);
                        }}
                        disabled={loading}
                    >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                            <SvgXml xml={googleLogoXml} width={20} height={20} />
                            <Text style={[styles.googleButtonText, { color: textColor }]}>Continue with Google</Text>
                        </View>
                    </TouchableOpacity>

                    <View style={styles.footer}>
                        <Text style={[styles.footerText, { color: mutedColor }]}>Don't have an account?</Text>
                        <TouchableOpacity onPress={onNavigateToSignUp}>
                            <Text style={[styles.link, { color: primaryColor }]}>Sign Up</Text>
                        </TouchableOpacity>
                    </View>
                    <Text style={[styles.securityNote, { color: mutedColor }]}>Protected by your OperiX account.</Text>
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
    hero: { minHeight: 260, justifyContent: 'flex-end', padding: 24, borderRadius: 22, backgroundColor: '#061A38', overflow: 'hidden' },
    logoRow: { flexDirection: 'row', alignItems: 'center' },
    logoMark: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#004FFE' },
    logoText: { marginLeft: 9, color: '#fff', fontSize: 17, fontWeight: '700' },
    logoProduct: { color: '#BFDBFE', fontWeight: '500' },
    eyebrow: { marginTop: 30, color: '#8DB1FF', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
    heroTitle: { marginTop: 10, color: '#fff', fontSize: 30, lineHeight: 35, fontWeight: '900', letterSpacing: -0.7 },
    heroSubtitle: { marginTop: 10, color: '#AAB9D3', fontSize: 12, lineHeight: 18 },
    form: { marginTop: 14, borderRadius: 22, padding: 20, borderWidth: 1, shadowColor: '#101828', shadowOpacity: 0.08, shadowRadius: 18, elevation: 4 },
    formEyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
    formTitle: { marginTop: 7, fontSize: 22, fontWeight: '900' },
    formSubtitle: { marginTop: 6, marginBottom: 18, fontSize: 12, lineHeight: 18 },
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
    inputGroup: {
        marginBottom: 16,
    },
    label: {
        marginBottom: 8,
        fontWeight: '500',
    },
    field: { height: 50, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, borderWidth: 1, borderRadius: 12 },
    input: { flex: 1, minWidth: 0, fontSize: 14 },
    button: {
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        marginTop: 5,
        flexDirection: 'row',
        gap: 7,
        justifyContent: 'center',
    },
    buttonDisabled: {
        opacity: 0.7,
    },
    buttonText: {
        color: '#fff',
        fontSize: 14,
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
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 18,
    },
    line: {
        flex: 1,
        height: 1,
    },
    dividerText: {
        marginHorizontal: 10,
        fontSize: 10,
        fontWeight: '600',
    },
    googleButton: {
        minHeight: 48,
        backgroundColor: 'transparent',
        borderRadius: 13,
        padding: 12,
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 10,
        borderWidth: 1,
    },
    googleButtonText: {
        fontSize: 13,
        fontWeight: '600',
    },
    securityNote: { marginTop: 17, textAlign: 'center', fontSize: 10, lineHeight: 15 },
});


