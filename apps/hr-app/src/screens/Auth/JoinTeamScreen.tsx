import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { ArrowRight, ShieldCheck, UserPlus } from 'lucide-react-native';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { supabase } from '@invoice-monorepo/api';
import { OperixLogo } from '../../components/OperixLogo';
import { brand, getPalette } from '../../theme/brand';

export function JoinTeamScreen({ navigation }: any) {
    const { isDark, primaryColor } = useTheme();
    const { signUp } = useAuth();
    const palette = getPalette(isDark);
    const [token, setToken] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [verifiedCompany, setVerifiedCompany] = useState<{ id: string; name: string } | null>(null);

    const checkToken = async () => {
        if (!token.trim()) {
            Alert.alert('Invite token required', 'Enter the token shared by your administrator.');
            return;
        }
        setLoading(true);
        try {
            const { data, error } = await supabase.rpc('verify_invite_token', { token_input: token.trim() });
            if (error) throw error;
            if (data && data.length > 0) setVerifiedCompany(data[0]);
            else {
                setVerifiedCompany(null);
                Alert.alert('Invalid token', 'Could not find a company with this invite token.');
            }
        } catch (error: any) {
            Alert.alert('Unable to verify token', error.message || 'Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleJoin = async () => {
        if (!verifiedCompany) return;
        if (!firstName.trim() || !lastName.trim() || !email.trim() || !password) {
            Alert.alert('Complete your details', 'Please fill in all fields.');
            return;
        }
        setLoading(true);
        try {
            const { error } = await signUp(email.trim().toLowerCase(), password, {
                data: {
                    first_name: firstName.trim(),
                    last_name: lastName.trim(),
                    invite_token: token.trim(),
                    phone: '',
                    tax_id: '',
                },
            });
            if (error) throw error;
            Alert.alert('Request sent', `Your request to join ${verifiedCompany.name} has been sent.`, [{ text: 'OK' }]);
        } catch (error: any) {
            Alert.alert('Unable to join team', error.message || 'Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.container, { backgroundColor: palette.background }]}>
            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                <View style={styles.header}>
                    <OperixLogo width={190} reversed={isDark} />
                    <View style={[styles.iconContainer, { backgroundColor: palette.iconSurface }]}><ShieldCheck color={brand.colors.primary} size={27} /></View>
                    <Text style={[styles.title, { color: palette.text }]}>{verifiedCompany ? 'Sign up & join' : 'Join your team'}</Text>
                    <Text style={[styles.subtitle, { color: palette.muted }]}>{verifiedCompany ? verifiedCompany.name : 'Enter the invite token shared by your administrator.'}</Text>
                </View>

                <View style={[styles.form, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                    {!verifiedCompany ? (
                        <>
                            <Field label="Invite token" value={token} onChangeText={setToken} placeholder="e.g. 8A2F9C" palette={palette} autoCapitalize="characters" maxLength={10} style={styles.tokenInput} />
                            <PrimaryButton label="Verify token" icon={ArrowRight} loading={loading} onPress={() => void checkToken()} color={primaryColor} />
                        </>
                    ) : (
                        <>
                            <Text style={[styles.helper, { color: palette.muted }]}>Create your account to send an approval request.</Text>
                            <Field label="First name" value={firstName} onChangeText={setFirstName} placeholder="John" palette={palette} />
                            <Field label="Last name" value={lastName} onChangeText={setLastName} placeholder="Doe" palette={palette} />
                            <Field label="Email" value={email} onChangeText={setEmail} placeholder="john@example.com" palette={palette} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
                            <Field label="Password" value={password} onChangeText={setPassword} placeholder="Create a password" palette={palette} secureTextEntry />
                            <PrimaryButton label="Create account" icon={UserPlus} loading={loading} onPress={() => void handleJoin()} color={primaryColor} />
                            <TouchableOpacity onPress={() => setVerifiedCompany(null)} style={styles.secondaryAction}><Text style={[styles.link, { color: primaryColor }]}>Use a different token</Text></TouchableOpacity>
                        </>
                    )}
                </View>

                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.cancel}><Text style={[styles.cancelText, { color: palette.muted }]}>Cancel</Text></TouchableOpacity>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

function Field({ label, palette, ...props }: { label: string; palette: ReturnType<typeof getPalette> } & React.ComponentProps<typeof TextInput>) {
    return <View style={styles.inputGroup}><Text style={[styles.label, { color: palette.textSecondary }]}>{label}</Text><TextInput {...props} placeholderTextColor={palette.muted} style={[styles.input, { backgroundColor: palette.surface, borderColor: palette.border, color: palette.text }, props.style]} /></View>;
}

function PrimaryButton({ label, icon: Icon, loading, onPress, color }: { label: string; icon: React.ComponentType<{ color?: string; size?: number }>; loading: boolean; onPress: () => void; color: string }) {
    return <TouchableOpacity style={[styles.button, { backgroundColor: color }, loading && styles.buttonDisabled]} onPress={onPress} disabled={loading}>{loading ? <ActivityIndicator color="#fff" /> : <><Icon color="#fff" size={18} /><Text style={styles.buttonText}>{label}</Text></>}</TouchableOpacity>;
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
    header: { alignItems: 'center', marginBottom: 30 },
    iconContainer: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: 28, marginBottom: 18 },
    title: { fontSize: 25, lineHeight: 32, fontFamily: brand.fonts.semibold },
    subtitle: { maxWidth: 300, textAlign: 'center', fontSize: 13, lineHeight: 20, fontFamily: brand.fonts.regular, marginTop: 6 },
    form: { borderRadius: brand.radius.panel, borderWidth: 1, padding: 22, ...brand.shadow.card },
    helper: { fontSize: 13, lineHeight: 20, fontFamily: brand.fonts.regular, marginBottom: 18 },
    inputGroup: { marginBottom: 14 },
    label: { marginBottom: 7, fontSize: 12, fontFamily: brand.fonts.medium },
    input: { minHeight: 52, borderWidth: 1, borderRadius: brand.radius.control, paddingHorizontal: 15, fontSize: 15, fontFamily: brand.fonts.regular },
    tokenInput: { textAlign: 'center', letterSpacing: 4, fontSize: 20 },
    button: { minHeight: 54, borderRadius: brand.radius.control, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', marginTop: 6, ...brand.shadow.floating },
    buttonDisabled: { opacity: 0.7 },
    buttonText: { color: '#fff', fontSize: 15, fontFamily: brand.fonts.semibold },
    secondaryAction: { alignItems: 'center', marginTop: 18 },
    link: { fontSize: 13, fontFamily: brand.fonts.semibold },
    cancel: { alignItems: 'center', marginTop: 22 },
    cancelText: { fontSize: 13, fontFamily: brand.fonts.medium },
});
