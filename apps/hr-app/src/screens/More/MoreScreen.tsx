import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
    Award,
    BriefcaseBusiness,
    ChevronRight,
    ClipboardCheck,
    LogOut,
    Settings,
    UserRound,
    Wallet,
} from 'lucide-react-native';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { brand, getPalette } from '../../theme/brand';
import { MobileHeader, MobileScreen, SectionTitle, ShortcutRow } from '../../components/mobile/MobileUI';

export function MoreScreen({ navigation }: any) {
    const { signOut } = useAuth();
    const { isDark } = useTheme();
    const palette = getPalette(isDark);

    const confirmSignOut = () => Alert.alert(
        'Sign out',
        'Are you sure you want to sign out of this workspace?',
        [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
        ],
    );

    return (
        <MobileScreen>
            <MobileHeader title="More" subtitle="Tools and workspace settings" />
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
                <SectionTitle title="People & work" />
                <ShortcutRow icon={Wallet} title="Payroll" description="Payroll runs and payslips" onPress={() => navigation.navigate('Payroll')} trailing={<ChevronRight color={palette.muted} size={18} />} />
                <ShortcutRow icon={ClipboardCheck} title="Approvals" description="Review pending HR decisions" onPress={() => navigation.navigate('Approvals')} trailing={<ChevronRight color={palette.muted} size={18} />} />
                <ShortcutRow icon={BriefcaseBusiness} title="Recruitment" description="Openings and candidates" onPress={() => navigation.navigate('Recruitment')} trailing={<ChevronRight color={palette.muted} size={18} />} />
                <ShortcutRow icon={Award} title="Performance" description="Reviews and employee goals" onPress={() => navigation.navigate('Performance')} trailing={<ChevronRight color={palette.muted} size={18} />} />

                <SectionTitle title="Account" />
                <ShortcutRow icon={UserRound} title="Profile" description="Your OperiX account" onPress={() => navigation.navigate('Profile')} trailing={<ChevronRight color={palette.muted} size={18} />} />
                <ShortcutRow icon={Settings} title="Settings" description="Organization and security" onPress={() => navigation.navigate('Settings')} trailing={<ChevronRight color={palette.muted} size={18} />} />

                <TouchableOpacity accessibilityRole="button" onPress={confirmSignOut} style={[styles.signOut, { borderColor: palette.border }]}>
                    <LogOut color={brand.colors.error} size={18} />
                    <Text style={[styles.signOutText, { color: brand.colors.error }]}>Sign out</Text>
                </TouchableOpacity>
                <View style={styles.bottomSpacer} />
            </ScrollView>
        </MobileScreen>
    );
}

const styles = StyleSheet.create({
    content: { paddingHorizontal: 20, paddingBottom: 18 },
    signOut: { minHeight: 50, borderWidth: 1, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 14 },
    signOutText: { fontSize: 13, fontFamily: brand.fonts.semibold },
    bottomSpacer: { height: 90 },
});
