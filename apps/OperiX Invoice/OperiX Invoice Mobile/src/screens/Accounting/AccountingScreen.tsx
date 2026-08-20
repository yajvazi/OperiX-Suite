import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BarChart3, BookOpen, ClipboardList, FileText, Landmark } from 'lucide-react-native';
import { useTheme } from '@invoice-monorepo/hooks';
import { t } from '@invoice-monorepo/i18n';
import { brand, getPalette } from '../../theme/brand';
import type { RootStackParamList } from '../../navigation/types';
import { MobileHeader, MobileScreen, ShortcutRow } from '../../components/mobile/MobileUI';

export function AccountingScreen() {
    const { isDark, language } = useTheme();
    const palette = getPalette(isDark);
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    return (
        <MobileScreen>
            <MobileHeader title={t('accounting', language)} subtitle={t('accountingWorkspace', language)} onBack={() => navigation.goBack()} />
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={[styles.hero, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                    <View style={[styles.heroIcon, { backgroundColor: palette.iconSurface }]}><Landmark color={brand.colors.primary} size={23} /></View>
                    <Text style={[styles.heroTitle, { color: palette.text }]}>{t('keepBooksClear', language)}</Text>
                    <Text style={[styles.heroText, { color: palette.muted }]}>{t('accountingDescription', language)}</Text>
                </View>
                <ShortcutRow icon={BarChart3} title={t('salesLedger', language)} description={t('salesLedgerDescription', language)} onPress={() => navigation.navigate('SalesBook')} />
                <ShortcutRow icon={ClipboardList} title={t('accountantReport', language)} description={t('accountantReportDescription', language)} onPress={() => navigation.navigate('AccountantReport')} />
                <ShortcutRow icon={BookOpen} title={t('dailyReport', language)} description={t('dailyReportDescription', language)} onPress={() => navigation.navigate('ReportPreview', { subtype: 'daily' })} />
                <ShortcutRow icon={FileText} title={t('customerLedger', language)} description={t('customerLedgerDescription', language)} onPress={() => navigation.navigate('CustomerLedger')} />
                <View style={{ height: 40 }} />
            </ScrollView>
        </MobileScreen>
    );
}

const styles = StyleSheet.create({
    content: { paddingHorizontal: 20, paddingBottom: 24 },
    hero: { borderWidth: 1, borderRadius: 20, padding: 18, marginBottom: 18 },
    heroIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 13 },
    heroTitle: { fontSize: 18, fontFamily: brand.fonts.semibold },
    heroText: { fontSize: 12, lineHeight: 19, fontFamily: brand.fonts.regular, marginTop: 7 },
});
