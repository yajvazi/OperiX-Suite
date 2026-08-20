import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Clock3, RefreshCw } from 'lucide-react-native';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { supabase } from '@invoice-monorepo/api';
import { OperixLogo } from '../../components/OperixLogo';
import { brand, getPalette } from '../../theme/brand';

export function ApprovalPendingScreen() {
    const { isDark } = useTheme();
    const { user, signOut } = useAuth();
    const palette = getPalette(isDark);
    const [checking, setChecking] = useState(false);

    const checkStatus = async () => {
        if (!user) return;
        setChecking(true);
        try {
            await supabase.from('employees').select('status').eq('user_id', user.id).single();
        } finally {
            setChecking(false);
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: palette.background }]}>
            <OperixLogo width={190} reversed={isDark} />
            <View style={[styles.iconContainer, { backgroundColor: palette.iconSurface }]}><Clock3 color={brand.colors.primary} size={34} /></View>
            <Text style={[styles.title, { color: palette.text }]}>Approval pending</Text>
            <Text style={[styles.text, { color: palette.muted }]}>Your request to join the company is waiting for administrator approval.</Text>
            <TouchableOpacity style={[styles.button, { borderColor: brand.colors.primary }]} onPress={() => void checkStatus()} disabled={checking}>
                {checking ? <ActivityIndicator color={brand.colors.primary} /> : <><RefreshCw color={brand.colors.primary} size={17} /><Text style={[styles.buttonText, { color: brand.colors.primary }]}>Check status</Text></>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => void signOut()} style={styles.signOut}><Text style={[styles.signOutText, { color: palette.muted }]}>Sign out</Text></TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    iconContainer: { width: 72, height: 72, borderRadius: 23, alignItems: 'center', justifyContent: 'center', marginTop: 34, marginBottom: 22 },
    title: { fontSize: 24, fontFamily: brand.fonts.semibold, marginBottom: 10, textAlign: 'center' },
    text: { maxWidth: 300, fontSize: 14, fontFamily: brand.fonts.regular, lineHeight: 22, textAlign: 'center' },
    button: { minHeight: 52, minWidth: 175, borderWidth: 1, borderRadius: brand.radius.control, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 28 },
    buttonText: { fontSize: 14, fontFamily: brand.fonts.semibold },
    signOut: { marginTop: 22 },
    signOutText: { fontSize: 13, fontFamily: brand.fonts.medium },
});
