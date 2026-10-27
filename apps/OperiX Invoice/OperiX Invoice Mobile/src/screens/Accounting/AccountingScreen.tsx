import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BarChart3, BookOpen, ClipboardList, FileText, Landmark } from 'lucide-react-native';
import { useAuth, useTheme } from '@invoice-monorepo/hooks';
import { t } from '@invoice-monorepo/i18n';
import { brand, getPalette } from '../../theme/brand';
import type { RootStackParamList } from '../../navigation/types';
import { MobileHeader, MobileScreen, ShortcutRow } from '../../components/mobile/MobileUI';
import { getWorkspaceScope } from '../../services/workspace';

export function AccountingScreen() {
    const { user } = useAuth();
    const { isDark, language } = useTheme();
    const palette = getPalette(isDark);
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const [permissions, setPermissions] = useState<string[]>([]);
    const [platformAdmin, setPlatformAdmin] = useState(false);
    useEffect(() => {
        if (!user) return;
        void getWorkspaceScope(user.id).then((scope) => {
            setPermissions(scope.permissions);
            setPlatformAdmin(scope.platformAdmin);
        }).catch((error) => console.warn('Accounting permission load failed:', error));
    }, [user?.id]);
    const can = (permission: string) => platformAdmin || permissions.includes(permission);
    return (
        <MobileScreen>
            <MobileHeader title={t('accounting', language)} subtitle={t('accountingWorkspace', language)} onBack={() => navigation.goBack()} />
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={[styles.hero, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                    <View style={[styles.heroIcon, { backgroundColor: palette.iconSurface }]}><Landmark color={brand.colors.primary} size={23} /></View>
                    <Text style={[styles.heroTitle, { color: palette.text }]}>{t('keepBooksClear', language)}</Text>
                    <Text style={[styles.heroText, { color: palette.muted }]}>{t('accountingDescription', language)}</Text>
                </View>
                {can('sales_book.view') ? <ShortcutRow icon={BarChart3} title={t('salesLedger', language)} description={t('salesLedgerDescription', language)} onPress={() => navigation.navigate('SalesBook')} /> : null}
                {can('financial.export') ? <ShortcutRow icon={ClipboardList} title={t('accountantReport', language)} description={t('accountantReportDescription', language)} onPress={() => navigation.navigate('AccountantReport')} /> : null}
                {can('reports.profit') ? <ShortcutRow icon={BookOpen} title={t('dailyReport', language)} description={t('dailyReportDescription', language)} onPress={() => navigation.navigate('ReportPreview', { subtype: 'daily' })} /> : null}
                {can('customer.view') ? <ShortcutRow icon={FileText} title={t('customerLedger', language)} description={t('customerLedgerDescription', language)} onPress={() => navigation.navigate('CustomerLedger')} /> : null}
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
