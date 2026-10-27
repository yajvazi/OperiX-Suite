import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AlertTriangle, LogOut, RefreshCw, Trash2 } from 'lucide-react-native';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { t } from '@invoice-monorepo/i18n';
import { brand, getPalette } from '../../theme/brand';

interface WorkspaceRecoveryScreenProps {
    onRetry: () => void;
}

export function WorkspaceRecoveryScreen({ onRetry }: WorkspaceRecoveryScreenProps) {
    const { signOut, deleteAccount } = useAuth();
    const { isDark, language, primaryColor } = useTheme();
    const palette = getPalette(isDark);

    const confirmDeleteAccount = () => Alert.alert(
        t('deleteAccountTitle', language),
        t('deleteAccountConfirmation', language),
        [
            { text: t('cancel', language), style: 'cancel' },
            {
                text: t('deleteAccountConfirm', language),
                style: 'destructive',
                onPress: () => {
                    void deleteAccount().then(({ error }) => {
                        if (error) Alert.alert(t('deleteAccount', language), t('deleteAccountError', language));
                    });
                },
            },
        ],
    );

    return (
        <SafeAreaView style={[styles.safeArea, { backgroundColor: palette.background }]}>
            <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                <View style={[styles.icon, { backgroundColor: palette.errorSoft }]}>
                    <AlertTriangle color={palette.error} size={30} strokeWidth={2.2} />
                </View>
                <Text style={[styles.title, { color: palette.text }]}>{t('workspaceUnavailableTitle', language)}</Text>
                <Text style={[styles.description, { color: palette.muted }]}>{t('workspaceUnavailableDescription', language)}</Text>

                <TouchableOpacity
                    testID="workspace-recovery-retry"
                    accessibilityRole="button"
                    style={[styles.secondaryButton, { borderColor: palette.border }]}
                    onPress={onRetry}
                >
                    <RefreshCw color={primaryColor} size={18} />
                    <Text style={[styles.secondaryButtonText, { color: palette.text }]}>{t('retry', language)}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    testID="workspace-recovery-delete-account"
                    accessibilityRole="button"
                    style={[styles.deleteButton, { borderColor: palette.error }]}
                    onPress={confirmDeleteAccount}
                >
                    <Trash2 color={palette.error} size={18} />
                    <Text style={[styles.deleteButtonText, { color: palette.error }]}>{t('deleteAccount', language)}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    testID="workspace-recovery-logout"
                    accessibilityRole="button"
                    style={[styles.logoutButton, { backgroundColor: palette.error }]}
                    onPress={() => { void signOut(); }}
                >
                    <LogOut color="#fff" size={18} />
                    <Text style={styles.logoutButtonText}>{t('signOut', language)}</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1 },
    card: { width: '88%', maxWidth: 440, alignSelf: 'center', alignItems: 'center', padding: 26, borderWidth: 1, borderRadius: 22, ...brand.shadow.floating },
    icon: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center', marginBottom: 18, borderRadius: 20 },
    title: { textAlign: 'center', fontSize: 23, fontWeight: '900' },
    description: { marginTop: 10, textAlign: 'center', fontSize: 13, lineHeight: 20 },
    secondaryButton: { width: '100%', minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24, borderWidth: 1, borderRadius: 13 },
    secondaryButtonText: { fontSize: 14, fontWeight: '800' },
    deleteButton: { width: '100%', minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, borderWidth: 1, borderRadius: 13 },
    deleteButtonText: { fontSize: 14, fontWeight: '900' },
    logoutButton: { width: '100%', minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, borderRadius: 13 },
    logoutButtonText: { color: '#fff', fontSize: 14, fontWeight: '900' },
});
