import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Languages, Moon, Sun } from 'lucide-react-native';
import { useTheme } from '@invoice-monorepo/hooks';
import { t } from '@invoice-monorepo/i18n';
import { getPalette } from '../../theme/brand';

interface AuthPreferencesProps {
    variant?: 'header' | 'footer';
}

export function AuthPreferences({ variant = 'header' }: AuthPreferencesProps) {
    const { isDark, language, setLanguage, setThemeMode } = useTheme();
    const palette = getPalette(isDark);
    const nextLanguage = language === 'sq' ? 'en' : 'sq';
    const nextIsDark = !isDark;

    return (
        <View style={[styles.row, variant === 'footer' && styles.footerRow]}>
            <TouchableOpacity
                testID="auth-language-toggle"
                accessibilityRole="button"
                accessibilityLabel={language === 'sq' ? t('authSwitchToEnglish', language) : t('authSwitchToAlbanian', language)}
                style={[styles.control, variant === 'footer' && styles.footerControl, { backgroundColor: palette.surface, borderColor: palette.border }]}
                onPress={() => { void setLanguage(nextLanguage); }}
            >
                <Languages color={palette.textSecondary} size={16} strokeWidth={2.2} />
                <Text style={[styles.controlText, { color: palette.textSecondary }]}>{language === 'sq' ? 'SQ' : 'EN'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
                testID="auth-theme-toggle"
                accessibilityRole="button"
                accessibilityLabel={nextIsDark ? t('authSwitchToDark', language) : t('authSwitchToLight', language)}
                style={[styles.control, variant === 'footer' && styles.footerControl, { backgroundColor: palette.surface, borderColor: palette.border }]}
                onPress={() => { void setThemeMode(nextIsDark ? 'dark' : 'light'); }}
            >
                {isDark ? <Sun color={palette.textSecondary} size={16} strokeWidth={2.2} /> : <Moon color={palette.textSecondary} size={16} strokeWidth={2.2} />}
                <Text style={[styles.controlText, { color: palette.textSecondary }]}>{isDark ? t('authLightMode', language) : t('authDarkMode', language)}</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginBottom: 14 },
    footerRow: { justifyContent: 'space-between', marginTop: 12, marginBottom: 0 },
    control: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 11, borderWidth: 1, borderRadius: 18 },
    footerControl: { flex: 1, minHeight: 44, borderRadius: 13 },
    controlText: { fontSize: 11, fontWeight: '800' },
});
