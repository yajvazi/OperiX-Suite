import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Armchair, ArrowRight, LockKeyhole, Mail } from 'lucide-react-native';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { brand } from '../../theme/brand';
import { t } from '../../lib/i18n';

export function SignInScreen() {
  const { signIn } = useAuth();
  const { language, isDark } = useTheme();
  const surface = isDark ? '#10233F' : brand.surface;
  const text = isDark ? '#fff' : brand.text;
  const muted = isDark ? '#AEBBD0' : brand.muted;
  const border = isDark ? '#304766' : brand.border;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) { setError(t('email', language)); return; }
    setBusy(true); setError('');
    const result = await signIn(email.trim().toLowerCase(), password);
    if (result.error) setError(result.error.message || t('signInFailed', language));
    setBusy(false);
  };

  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.screen, { backgroundColor: isDark ? brand.background : brand.background }]}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><View style={styles.hero}><View style={styles.logoRow}><View style={styles.brandMark}><Armchair color="#fff" size={16} strokeWidth={2.1} /></View><Text style={styles.brandText}><Text>OperiX</Text><Text style={styles.brandProduct}> Desk</Text></Text></View><Text style={styles.heroEyebrow}>OPERIX SUITE</Text><Text style={styles.heroTitle}>Make every workspace feel effortless.</Text><Text style={styles.heroSubtitle}>One calm workspace for your team, desks, and reservations.</Text></View><View style={[styles.card, { backgroundColor: surface, borderColor: isDark ? '#203755' : brand.border }]}><Text style={[styles.formEyebrow, { color: brand.primary }]}>WELCOME BACK</Text><Text style={[styles.formTitle, { color: text }]}>Sign in to Desk</Text><Text style={[styles.formSubtitle, { color: muted }]}>Use the same OperiX account you use across the Suite.</Text>{error ? <Text style={styles.error}>{error}</Text> : null}<Text style={[styles.label, { color: text }]}>{t('email', language)}</Text><View style={[styles.field, { borderColor: border }]}><Mail color={muted} size={18} /><TextInput value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="you@example.com" placeholderTextColor={muted} style={[styles.input, { color: text }]} /></View><Text style={[styles.label, { color: text }]}>{t('password', language)}</Text><View style={[styles.field, { borderColor: border }]}><LockKeyhole color={muted} size={18} /><TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder={t('password', language)} placeholderTextColor={muted} style={[styles.input, { color: text }]} /></View><Pressable disabled={busy} onPress={() => void submit()} style={[styles.button, busy && styles.disabled]}>{busy ? <ActivityIndicator color="#fff" /> : <><Text style={styles.buttonText}>{t('signIn', language)}</Text><ArrowRight color="#fff" size={17} /></>}</Pressable><Text style={[styles.note, { color: muted }]}>Protected by your OperiX account.</Text></View></ScrollView></KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, content: { flexGrow: 1, justifyContent: 'center', padding: 22 },
  hero: { minHeight: 260, justifyContent: 'flex-end', padding: 24, borderRadius: 22, backgroundColor: brand.primaryPressed, overflow: 'hidden' },
  logoRow: { flexDirection: 'row', alignItems: 'center' }, brandMark: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: brand.primary }, brandText: { marginLeft: 9, color: '#fff', fontSize: 17, fontWeight: '700', letterSpacing: -0.35 }, brandProduct: { color: '#BFDBFE', fontWeight: '500' },
  heroEyebrow: { marginTop: 30, color: '#8DB1FF', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 }, heroTitle: { maxWidth: 330, marginTop: 10, color: '#fff', fontSize: 30, lineHeight: 35, fontWeight: '900', letterSpacing: -0.7 }, heroSubtitle: { maxWidth: 320, marginTop: 10, color: '#AAB9D3', fontSize: 12, lineHeight: 18 },
  card: { marginTop: 14, padding: 20, borderWidth: 1, borderRadius: 22, shadowColor: '#101828', shadowOpacity: 0.08, shadowRadius: 18, elevation: 4 }, formEyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 }, formTitle: { marginTop: 7, fontSize: 22, fontWeight: '900', letterSpacing: -0.4 }, formSubtitle: { marginTop: 6, marginBottom: 18, fontSize: 12, lineHeight: 18 }, error: { marginBottom: 14, borderRadius: 10, padding: 11, color: '#B42318', backgroundColor: '#FFF0EF', fontSize: 12, lineHeight: 17 }, label: { marginTop: 13, marginBottom: 7, fontSize: 12, fontWeight: '700' }, field: { height: 50, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, borderWidth: 1, borderRadius: 12 }, input: { flex: 1, minWidth: 0, fontSize: 14 }, button: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 22, borderRadius: 13, backgroundColor: brand.primary }, disabled: { opacity: 0.65 }, buttonText: { color: '#fff', fontSize: 14, fontWeight: '900' }, note: { marginTop: 17, textAlign: 'center', fontSize: 10, lineHeight: 15 },
});
