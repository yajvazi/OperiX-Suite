import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { fetchEnabledSocialProviders, onSupabaseServerChange, type SocialProvider } from '@invoice-monorepo/api';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { t } from '@invoice-monorepo/i18n';
import { getPalette } from '../../theme/brand';

const googleLogoXml = `
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
</svg>`;

const appleLogoXml = (color: string) => `
<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path fill="${color}" d="M16.37 1.43c0 1.14-.46 2.22-1.2 3-.8.84-2.1 1.5-3.16 1.41-.13-1.1.42-2.25 1.15-3 .82-.86 2.2-1.5 3.21-1.41zM20.5 17.1c-.55 1.27-.82 1.84-1.53 2.96-1 1.57-2.4 3.52-4.14 3.54-1.55.02-1.95-1-4.05-.99-2.1.01-2.54 1.01-4.09.99-1.74-.02-3.07-1.78-4.07-3.35C-.1 15.9-.4 10.7 1.4 7.93c1.28-1.97 3.3-3.12 5.2-3.12 1.93 0 3.14 1.06 4.74 1.06 1.55 0 2.5-1.06 4.73-1.06 1.69 0 3.48.92 4.75 2.51-4.17 2.28-3.5 8.22.68 9.78z"/>
</svg>`;

/** "Continue with Google / Apple". Shows only the providers the connected server has enabled. */
export function SocialAuthButtons({ onError, dividerAbove = true, layout = 'stack' }: { onError: (message: string) => void; dividerAbove?: boolean; layout?: 'stack' | 'row' }) {
    const { signInWithGoogle, signInWithApple } = useAuth();
    const { isDark, language } = useTheme();
    const palette = getPalette(isDark);
    const [providers, setProviders] = useState<SocialProvider[]>([]);
    const [busy, setBusy] = useState<SocialProvider | null>(null);

    useEffect(() => {
        let active = true;
        const load = () => { void fetchEnabledSocialProviders().then((enabled) => { if (active) setProviders(enabled); }); };
        load();
        const unsubscribe = onSupabaseServerChange(load);
        return () => { active = false; unsubscribe(); };
    }, []);

    if (!providers.length) return null;

    const run = async (provider: SocialProvider) => {
        setBusy(provider);
        onError('');
        const action = provider === 'google' ? signInWithGoogle : signInWithApple;
        const { error } = action ? await action() : { error: new Error('unsupported') };
        if (error) onError(t('signInFailed', language));
        setBusy(null);
    };

    const button = (provider: SocialProvider) => {
        const label = layout === 'row' ? (provider === 'google' ? 'Google' : 'Apple') : provider === 'google' ? t('continueWithGoogle', language) : (language === 'sq' ? 'Vazhdo me Apple' : 'Continue with Apple');
        return <TouchableOpacity key={provider} testID={`auth-${provider}-button`} accessibilityRole="button" disabled={busy !== null}
            style={[styles.button, layout === 'row' && styles.rowButton, { backgroundColor: provider === 'apple' ? (isDark ? '#fff' : '#000') : palette.surfaceMuted, borderColor: palette.borderStrong }]}
            onPress={() => void run(provider)}>
            {busy === provider ? <ActivityIndicator color={provider === 'apple' ? (isDark ? '#000' : '#fff') : palette.text} /> : <>
                <SvgXml xml={provider === 'google' ? googleLogoXml : appleLogoXml(isDark ? '#000' : '#fff')} width={20} height={20} />
                <Text style={[styles.text, { color: provider === 'apple' ? (isDark ? '#000' : '#fff') : palette.text }]}>{label}</Text>
            </>}
        </TouchableOpacity>;
    };

    return <View>
        {dividerAbove ? <View style={styles.divider}><View style={[styles.line, { backgroundColor: palette.border }]} /><Text style={[styles.dividerText, { color: palette.muted }]}>{t('or', language)}</Text><View style={[styles.line, { backgroundColor: palette.border }]} /></View> : null}
        <View style={layout === 'row' ? styles.row : styles.stack}>{providers.map(button)}</View>
    </View>;
}

const styles = StyleSheet.create({
    stack: { gap: 10 },
    row: { flexDirection: 'row', gap: 10 },
    rowButton: { flex: 1 },
    button: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1, borderRadius: 14 },
    text: { fontSize: 13, fontWeight: '600' },
    divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 18 },
    line: { flex: 1, height: 1 },
    dividerText: { marginHorizontal: 10, fontSize: 10, fontWeight: '700' },
});
