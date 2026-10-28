import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Cloud } from 'lucide-react-native';
import { useTheme } from '@invoice-monorepo/hooks';
import { brand, getPalette } from '../../theme/brand';
import { getStorageMode } from '../../services/storageMode';
import { MobileHeader, MobileScreen } from './MobileUI';

/**
 * Screens that need the OperiX servers (accounting ledger, payroll, Stripe, teams, subscriptions...).
 * With on-device storage they show this notice instead of failing to load.
 */
export function withCloudOnly<P extends object>(Screen: React.ComponentType<P>, title: { en: string; sq: string }): React.ComponentType<P> {
    function CloudOnlyScreen(props: P) {
        const [mode, setMode] = useState<'loading' | 'local' | 'cloud'>('loading');
        const { isDark, primaryColor, language } = useTheme();
        const palette = getPalette(isDark);
        const sq = language === 'sq';
        const navigation = (props as { navigation?: any }).navigation;
        useEffect(() => { void getStorageMode().then(setMode); }, []);
        if (mode === 'loading') return null;
        if (mode === 'cloud') return <Screen {...props} />;
        return <MobileScreen testID="cloud-only-screen">
            <MobileHeader title={sq ? title.sq : title.en} subtitle={sq ? 'Pjesë e planit cloud' : 'Part of the cloud plan'} onBack={() => navigation?.goBack?.()} />
            <View style={styles.body}>
                <View style={[styles.icon, { backgroundColor: palette.iconSurface }]}><Cloud color={primaryColor} size={28} /></View>
                <Text style={[styles.heading, { color: palette.text }]}>{sq ? 'Kërkon ruajtje në cloud' : 'Needs cloud storage'}</Text>
                <Text style={[styles.text, { color: palette.muted }]}>
                    {sq
                        ? 'Kjo veçori punon me serverat e OperiX dhe nuk është e disponueshme kur të dhënat ruhen vetëm në këtë pajisje.'
                        : 'This feature runs on the OperiX servers and is not available while your data is stored only on this device.'}
                </Text>
                <TouchableOpacity accessibilityRole="button" onPress={() => navigation?.navigate?.('Settings', { screen: 'StorageSettings' })} style={[styles.button, { backgroundColor: primaryColor }]}>
                    <Text style={styles.buttonText}>{sq ? 'Ndrysho ruajtjen e të dhënave' : 'Change data storage'}</Text>
                </TouchableOpacity>
            </View>
        </MobileScreen>;
    }
    CloudOnlyScreen.displayName = `CloudOnly(${Screen.displayName || Screen.name || 'Screen'})`;
    return CloudOnlyScreen;
}

const styles = StyleSheet.create({
    body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
    icon: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    heading: { fontSize: 18, fontFamily: brand.fonts.semibold, textAlign: 'center' },
    text: { fontSize: 13, lineHeight: 20, textAlign: 'center', fontFamily: brand.fonts.regular },
    button: { minHeight: 46, borderRadius: 12, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
    buttonText: { color: '#fff', fontSize: 14, fontFamily: brand.fonts.semibold },
});
