import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useTheme } from '@invoice-monorepo/hooks';
import { Button, Card, LoadingOverlay } from '@invoice-monorepo/ui';
import { supabase } from '@invoice-monorepo/api';
import { ShieldCheck, ArrowRight, UserPlus, Mail, Lock, User } from 'lucide-react-native';
import { useAuth } from '@invoice-monorepo/hooks';
import { OperixLogo } from '../../components/OperixLogo';
import { getPalette } from '../../theme/brand';
import { t } from '@invoice-monorepo/i18n';

export function JoinTeamScreen({ navigation }: any) {
    const { isDark, primaryColor, language } = useTheme();
    const { signUp } = useAuth();

    const [token, setToken] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const [verifiedCompany, setVerifiedCompany] = useState<{ id: string, name: string } | null>(null);

    const checkToken = async () => {
        if (!token.trim()) return;
        setLoading(true);
        try {
            const { data, error } = await supabase.rpc('verify_invite_token', { token_input: token.trim() });
            if (error) throw error;

            if (data && data.length > 0) {
                setVerifiedCompany(data[0]);
            } else {
                Alert.alert(t('invalidToken', language), t('invalidTokenDescription', language));
                setVerifiedCompany(null);
            }
        } catch (err: any) {
            Alert.alert(t('error', language), t('somethingWentWrong', language));
        } finally {
            setLoading(false);
        }
    };

    const handleJoin = async () => {
        if (!verifiedCompany) return;
        if (!firstName || !lastName || !email || !password) {
            Alert.alert(t('error', language), t('fillAllFields', language));
            return;
        }

        setLoading(true);
        try {
            // 1. Sign Up the user with Invite Token in metadata
            // The database trigger 'process_new_user_invite' will handle the joining process automatically.
            const { error: signUpError } = await signUp(email, password, {
                data: {
                    first_name: firstName,
                    last_name: lastName,
                    invite_token: token.trim(), // Trigger looks for this
                    phone: '',
                    tax_id: ''
                }
            });

            if (signUpError) throw signUpError;

            Alert.alert(
                t('requestSent', language),
                t('joinRequestSent', language).replace('{company}', verifiedCompany.name),
                [{
                    text: t('done', language), onPress: () => {
                        // Start navigation to Dashboard (blocked by AppNavigator until approved)
                        // Or ideally reset stack.
                        // AuthContext update will trigger AppNavigator switch.
                    }
                }]
            );

        } catch (error: any) {
            console.error(error);
            Alert.alert(t('error', language), t('somethingWentWrong', language));
        } finally {
            setLoading(false);
        }
    };

    const palette = getPalette(isDark);
    const bgColor = palette.background;
    const textColor = palette.text;
    const cardBg = palette.surface;
    const mutedColor = palette.muted;
    const inputBg = palette.surface;
    const borderColor = palette.border;

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0} style={[styles.container, { backgroundColor: bgColor }]}>
            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="always" keyboardDismissMode="none">
                <LoadingOverlay visible={loading} text={verifiedCompany ? t('joining', language) : t('verifyingToken', language)} />

                <View style={styles.iconContainer}>
                    <OperixLogo width={176} reversed={isDark} />
                </View>

                {!verifiedCompany ? (
                    <>
                        <Text style={[styles.title, { color: textColor }]}>{t('joinYourTeam', language)}</Text>
                        <Text style={[styles.subtitle, { color: mutedColor }]}>
                            {t('inviteTokenDescription', language)}
                        </Text>

                        <View style={[styles.form, { backgroundColor: cardBg, borderColor }]}>
                            <View style={styles.inputGroup}>
                                <Text style={[styles.label, { color: mutedColor }]}>{t('inviteTokenLabel', language).toUpperCase()}</Text>
                                <TextInput
                                    style={[styles.input, { color: textColor, borderColor, backgroundColor: inputBg, textAlign: 'center', letterSpacing: 4, fontSize: 20 }]}
                                    placeholder={t('pasteInviteCode', language)}
                                    placeholderTextColor={mutedColor}
                                    value={token}
                                    onChangeText={setToken}
                                    autoCapitalize="characters"
                                    autoCorrect={false}
                                    maxLength={64}
                                />
                            </View>
                            <Button
                                title={t('verifyToken', language)}
                                onPress={checkToken}
                                icon={ArrowRight}
                                style={{ marginTop: 16 }}
                            />
                        </View>
                    </>
                ) : (
                    <>
                        <Text style={[styles.title, { color: textColor }]}>{t('signUpAndJoin', language)}</Text>
                        <Text style={[styles.subtitle, { color: primaryColor, fontWeight: '700' }]}>
                            {verifiedCompany.name}
                        </Text>
                        <Text style={[styles.subtitle, { color: mutedColor, fontSize: 14, marginBottom: 24 }]}>
                            {t('createAccount', language)}
                        </Text>

                        <View style={[styles.form, { backgroundColor: cardBg, borderColor }]}>
                            {/* Form Fields */}
                            <View style={styles.row}>
                                <View style={[styles.inputGroup, { flex: 1 }]}>
                                    <Text style={[styles.label, { color: mutedColor }]}>{t('firstName', language)}</Text>
                                    <TextInput
                                        style={[styles.input, { color: textColor, borderColor, backgroundColor: inputBg }]}
                                        value={firstName}
                                        onChangeText={setFirstName}
                                        placeholder="John"
                                        placeholderTextColor={mutedColor}
                                    />
                                </View>
                                <View style={[styles.inputGroup, { flex: 1 }]}>
                                    <Text style={[styles.label, { color: mutedColor }]}>{t('lastName', language)}</Text>
                                    <TextInput
                                        style={[styles.input, { color: textColor, borderColor, backgroundColor: inputBg }]}
                                        value={lastName}
                                        onChangeText={setLastName}
                                        placeholder="Doe"
                                        placeholderTextColor={mutedColor}
                                    />
                                </View>
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={[styles.label, { color: mutedColor }]}>{t('email', language)}</Text>
                                <TextInput
                                    style={[styles.input, { color: textColor, borderColor, backgroundColor: inputBg }]}
                                    value={email}
                                    onChangeText={setEmail}
                                    autoCapitalize="none"
                                    keyboardType="email-address"
                                    placeholder="john@example.com"
                                    placeholderTextColor={mutedColor}
                                />
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={[styles.label, { color: mutedColor }]}>{t('password', language)}</Text>
                                <TextInput
                                    style={[styles.input, { color: textColor, borderColor, backgroundColor: inputBg }]}
                                    value={password}
                                    onChangeText={setPassword}
                                    secureTextEntry
                                    placeholder="••••••"
                                    placeholderTextColor={mutedColor}
                                />
                            </View>

                            <Button
                                title={t('createAccount', language)}
                                onPress={handleJoin}
                                icon={UserPlus}
                                style={{ marginTop: 16 }}
                            />

                            <TouchableOpacity onPress={() => setVerifiedCompany(null)} style={{ marginTop: 16 }}>
                                <Text style={{ color: mutedColor, textAlign: 'center', fontSize: 12 }}>{t('changeToken', language)}</Text>
                            </TouchableOpacity>
                        </View>
                    </>
                )}

                <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 24 }}>
                    <Text style={{ color: mutedColor, textAlign: 'center' }}>{t('cancel', language)}</Text>
                </TouchableOpacity>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: { padding: 24, justifyContent: 'center', minHeight: '100%' },
    iconContainer: { alignItems: 'center', marginBottom: 24 },
    title: { fontSize: 28, fontWeight: '800', textAlign: 'center', marginBottom: 12 },
    subtitle: { fontSize: 16, textAlign: 'center', marginBottom: 32, lineHeight: 24 },
    form: { padding: 24, borderRadius: 16 },
    label: { fontSize: 12, fontWeight: '700', marginBottom: 8, letterSpacing: 0.5 },
    input: { fontSize: 16, height: 50, borderWidth: 1, borderRadius: 10, paddingHorizontal: 16 },
    inputGroup: { marginBottom: 16 },
    row: { flexDirection: 'row', gap: 12 },
});

