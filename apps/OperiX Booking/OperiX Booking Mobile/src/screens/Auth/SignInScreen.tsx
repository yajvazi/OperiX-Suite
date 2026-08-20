import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CalendarDays, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react-native';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { brand } from '../../theme/brand';

export function SignInScreen() {
  const { signIn } = useAuth();
  const { isDark } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!email.trim() || !password) {
      setError('Enter your email and password to continue.');
      return;
    }
    setSubmitting(true);
    setError('');
    const result = await signIn(email.trim(), password);
    setSubmitting(false);
    if (result.error) setError(result.error.message || 'Sign in failed. Please try again.');
  }

  const surface = isDark ? '#10233F' : brand.surface;
  const text = isDark ? '#fff' : brand.text;
  const muted = isDark ? '#AEBBD0' : brand.muted;

  return (
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: isDark ? brand.navy : brand.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.hero}>
        <View style={styles.logo}><View style={styles.logoMark}><CalendarDays color="#fff" size={16} strokeWidth={2.1} /></View><Text style={[styles.logoText, { color: isDark ? '#fff' : brand.text }]}><Text>OperiX</Text><Text style={{ color: brand.primary }}> Booking</Text></Text></View>
        <Text style={[styles.title, { color: text }]}>Booking that moves with your team.</Text>
        <Text style={[styles.subtitle, { color: muted }]}>Sign in with the same OperiX account you use across the Suite.</Text>
      </View>
      <View style={[styles.formCard, { backgroundColor: surface, borderColor: isDark ? '#203755' : brand.border }]}>
        <Text style={[styles.formTitle, { color: text }]}>Welcome back</Text>
        <Text style={[styles.formSubtitle, { color: muted }]}>Manage today’s schedule from anywhere.</Text>
        <View style={[styles.field, { borderColor: isDark ? '#304766' : brand.border }]}><Mail color={muted} size={18} /><TextInput value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="Email address" placeholderTextColor={muted} style={[styles.input, { color: text }]} /></View>
        <View style={[styles.field, { borderColor: isDark ? '#304766' : brand.border }]}><LockKeyhole color={muted} size={18} /><TextInput value={password} onChangeText={setPassword} secureTextEntry={!showPassword} placeholder="Password" placeholderTextColor={muted} style={[styles.input, { color: text }]} /><Pressable accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} onPress={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff color={muted} size={18} /> : <Eye color={muted} size={18} />}</Pressable></View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" disabled={submitting} onPress={() => void handleSubmit()} style={[styles.button, submitting && styles.buttonDisabled]}><Text style={styles.buttonText}>{submitting ? 'Signing in…' : 'Sign in'}</Text></Pressable>
        <Text style={[styles.securityNote, { color: muted }]}>Your session and organization access are protected by OperiX Auth.</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: 22 },
  hero: { marginBottom: 26 },
  logo: { flexDirection: 'row', alignItems: 'center', marginBottom: 30 },
  logoMark: { width: 30, height: 30, marginRight: 9, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: brand.primary, shadowColor: brand.primary, shadowOpacity: 0.22, shadowRadius: 7, elevation: 3 },
  logoText: { fontSize: 17, fontWeight: '700', letterSpacing: -0.35 },
  title: { fontSize: 31, lineHeight: 36, fontWeight: '900', letterSpacing: -0.8, maxWidth: 340 },
  subtitle: { fontSize: 15, lineHeight: 22, marginTop: 10, maxWidth: 340 },
  formCard: { borderWidth: 1, borderRadius: 22, padding: 20 },
  formTitle: { fontSize: 20, fontWeight: '900' },
  formSubtitle: { fontSize: 13, marginTop: 5, marginBottom: 18 },
  field: { height: 52, borderWidth: 1, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, marginBottom: 11 },
  input: { flex: 1, fontSize: 14 },
  error: { color: brand.error, fontSize: 12, lineHeight: 18, marginVertical: 5 },
  button: { height: 52, borderRadius: 14, backgroundColor: brand.primary, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  securityNote: { textAlign: 'center', fontSize: 11, lineHeight: 16, marginTop: 16 },
});
