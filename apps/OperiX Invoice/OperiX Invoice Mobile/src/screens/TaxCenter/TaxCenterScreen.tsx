import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
    Archive,
    CalendarDays,
    CircleHelp,
    FileCheck2,
    FileText,
    Landmark,
    ReceiptText,
    WalletCards,
} from 'lucide-react-native';
import { useTheme } from '@invoice-monorepo/hooks';
import { t } from '@invoice-monorepo/i18n';
import type { TranslationKey } from '@invoice-monorepo/i18n';
import { brand, getPalette } from '../../theme/brand';
import type { RootStackParamList } from '../../navigation/types';
import { MobileHeader, MobileScreen, SectionTitle } from '../../components/mobile/MobileUI';

type TaxItem = {
    key: string;
    titleKey: TranslationKey;
    descriptionKey: TranslationKey;
    icon: React.ComponentType<{ color?: string; size?: number }>;
    route?: keyof RootStackParamList;
    subtype?: string;
};

const TAX_ITEMS: TaxItem[] = [
    { key: 'sales_book', titleKey: 'salesBook', descriptionKey: 'postedSalesVat', icon: ReceiptText, route: 'SalesBook' },
    { key: 'purchase_book', titleKey: 'purchaseBook', descriptionKey: 'supplierInvoicesVat', icon: FileText, route: 'ReportPreview', subtype: 'purchase_book' },
    { key: 'cash_book', titleKey: 'cashAndPayments', descriptionKey: 'cashBankJournals', icon: WalletCards, route: 'ReportPreview', subtype: 'cash_book' },
    { key: 'payroll', titleKey: 'payroll', descriptionKey: 'payrollPitPension', icon: Landmark, route: 'Payroll' },
    { key: 'withholding', titleKey: 'withholdingTax', descriptionKey: 'verifiedWithholding', icon: FileCheck2, route: 'ReportPreview', subtype: 'withholding' },
    { key: 'declarations', titleKey: 'declarations', descriptionKey: 'declarationPreviews', icon: FileCheck2, route: 'ReportPreview', subtype: 'declarations' },
    { key: 'archive', titleKey: 'archivedDocuments', descriptionKey: 'sourceDocumentsLinked', icon: Archive, route: 'ReportPreview', subtype: 'archive' },
    { key: 'tax_calendar', titleKey: 'taxCalendar', descriptionKey: 'taxObligations', icon: CalendarDays, route: 'ReportPreview', subtype: 'tax_calendar' },
];

export function TaxCenterScreen() {
    const { isDark, language } = useTheme();
    const palette = getPalette(isDark);
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

    return (
        <MobileScreen>
            <MobileHeader
                title={t('taxes', language)}
                subtitle={t('taxCenterSubtitle', language)}
                onBack={() => navigation.goBack()}
                right={(
                    <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={language === 'sq' ? 'Mëso për tatimet' : 'Learn about taxes'}
                        onPress={() => navigation.navigate('HelpArticle', { articleId: 'taxes/tax-center', language: language === 'sq' ? 'sq' : 'en' })}
                        style={[styles.contextHelpButton, { backgroundColor: palette.surface, borderColor: palette.border }]}
                    >
                        <CircleHelp color={brand.colors.primary} size={20} />
                    </TouchableOpacity>
                )}
            />
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
                    <SectionTitle title={t('taxBooksControls', language)} />
                    {TAX_ITEMS.map((item) => {
                        const Icon = item.icon;
                        return (
                            <TouchableOpacity
                                key={item.key}
                                accessibilityRole="button"
                                accessibilityLabel={`${t('open', language)} ${t(item.titleKey, language)}`}
                                onPress={() => {
                                    if (item.route === 'ReportPreview') navigation.navigate('ReportPreview', { subtype: item.subtype });
                                    else if (item.route) navigation.navigate(item.route as never);
                                }}
                                style={[styles.taxCard, { backgroundColor: palette.surface, borderColor: palette.border }]}
                            >
                                <View style={[styles.taxIcon, { backgroundColor: palette.iconSurface }]}><Icon color={brand.colors.primary} size={21} /></View>
                                <View style={styles.taxCopy}>
                                    <Text style={[styles.taxTitle, { color: palette.text }]}>{t(item.titleKey, language)}</Text>
                                    <Text style={[styles.taxDescription, { color: palette.muted }]}>{t(item.descriptionKey, language)}</Text>
                                </View>
                                <Text style={[styles.openLabel, { color: brand.colors.primary }]}>{t('open', language)}</Text>
                            </TouchableOpacity>
                        );
                    })}
                    <View style={{ height: 28 }} />
            </ScrollView>
        </MobileScreen>
    );
}

const styles = StyleSheet.create({
    content: { paddingHorizontal: 20, paddingBottom: 20 },
    taxCard: { minHeight: 80, borderRadius: 17, borderWidth: 1, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 10, ...brand.shadow.card },
    taxIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    taxCopy: { flex: 1 },
    taxTitle: { fontSize: 14, fontFamily: brand.fonts.semibold },
    taxDescription: { fontSize: 11, lineHeight: 17, fontFamily: brand.fonts.regular, marginTop: 3 },
    openLabel: { fontSize: 11, fontFamily: brand.fonts.semibold, marginLeft: 8 },
    contextHelpButton: { width: 42, height: 42, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
