import React, { type ComponentType } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Constants from 'expo-constants';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
    ArrowUpRight,
    BarChart3,
    CircleHelp,
    FileText,
    Globe2,
    Info,
    Package,
    ReceiptText,
    ShieldCheck,
} from 'lucide-react-native';
import { useTheme } from '@invoice-monorepo/hooks';
import { OperixLogo } from '../../components/OperixLogo';
import { MobileHeader, MobileScreen, SectionTitle } from '../../components/mobile/MobileUI';
import type { RootStackParamList } from '../../navigation/types';
import { openExternalLink } from '../../services/externalLinks';
import { brand, getPalette } from '../../theme/brand';
import { t } from '@invoice-monorepo/i18n';

const APP_VERSION = Constants.expoConfig?.version || '1.0.0';
const WEBSITE_URL = 'https://operixsuite.com';

type Icon = ComponentType<{ color?: string; size?: number }>;
type Palette = ReturnType<typeof getPalette>;

function ResourceRow({ icon: Icon, title, description, onPress, palette }: { icon: Icon; title: string; description: string; onPress: () => void; palette: Palette }) {
    return (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={[styles.resourceRow, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <View style={[styles.resourceIcon, { backgroundColor: palette.iconSurface }]}><Icon color={brand.colors.primary} size={19} /></View>
            <View style={styles.resourceCopy}>
                <Text style={[styles.resourceTitle, { color: palette.text }]}>{title}</Text>
                <Text style={[styles.resourceDescription, { color: palette.muted }]}>{description}</Text>
            </View>
            <ArrowUpRight color={brand.colors.primary} size={18} />
        </TouchableOpacity>
    );
}

export function AboutScreen() {
    const { isDark, language } = useTheme();
    const palette = getPalette(isDark);
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const features = [
        { title: t('invoices', language), description: t('createShareInvoices', language), icon: FileText },
        { title: t('sales', language), description: t('commercialDocumentsTogether', language), icon: ReceiptText },
        { title: t('products', language), description: t('manageCatalogPrices', language), icon: Package },
        { title: t('reports', language), description: t('seeBusinessNumbers', language), icon: BarChart3 },
    ];

    return (
        <MobileScreen>
            <MobileHeader title={t('aboutOperix', language)} subtitle={t('yourBusinessWorkspace', language)} onBack={() => navigation.goBack()} />
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                <View style={[styles.brandCard, { backgroundColor: isDark ? brand.colors.navy : '#EAF2FF', borderColor: isDark ? brand.colors.navy : '#D9E8FF' }]}>
                    <View style={[styles.logoPanel, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF' }]}>
                        <OperixLogo width={178} reversed={isDark} />
                    </View>
                    <View style={[styles.versionPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : '#FFFFFF' }]}>
                        <Text style={[styles.versionText, { color: isDark ? '#DDEAFF' : brand.colors.primary }]}>{t('versionLabel', language).replace('{version}', APP_VERSION)}</Text>
                    </View>
                    <Text style={[styles.brandTitle, { color: palette.text }]}>{t('businessClarityBuiltIn', language)}</Text>
                    <Text style={[styles.brandDescription, { color: palette.muted }]}>{t('operixWorkspaceDescription', language)}</Text>
                </View>

                <SectionTitle title={t('everythingOnePlace', language)} />
                <View style={styles.featureGrid}>
                    {features.map((feature) => {
                        const Icon = feature.icon;
                        return (
                            <View key={feature.title} style={[styles.featureCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                                <View style={[styles.featureIcon, { backgroundColor: palette.iconSurface }]}><Icon color={brand.colors.primary} size={20} /></View>
                                <Text style={[styles.featureTitle, { color: palette.text }]}>{feature.title}</Text>
                                <Text style={[styles.featureDescription, { color: palette.muted }]}>{feature.description}</Text>
                            </View>
                        );
                    })}
                </View>

                <SectionTitle title={t('exploreOperix', language)} />
                <ResourceRow palette={palette} icon={Globe2} title={t('operixSuiteWebsite', language)} description={t('learnFullSuite', language)} onPress={() => void openExternalLink(WEBSITE_URL, t('operixSuiteWebsite', language))} />
                <ResourceRow palette={palette} icon={CircleHelp} title={t('helpSupport', language)} description={t('findQuickAnswer', language)} onPress={() => navigation.navigate('HelpSupport')} />
                <ResourceRow palette={palette} icon={Info} title={t('aboutRelease', language)} description={t('releaseDetails', language)} onPress={() => Alert.alert(t('aboutOperix', language), `${t('versionLabel', language).replace('{version}', APP_VERSION)}\n\n${t('releaseAlert', language)}`)} />

                <View style={[styles.securityCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                    <View style={[styles.securityIcon, { backgroundColor: brand.colors.successSoft }]}><ShieldCheck color={brand.colors.success} size={20} /></View>
                    <View style={styles.securityCopy}>
                        <Text style={[styles.securityTitle, { color: palette.text }]}>{t('builtForWorkspace', language)}</Text>
                        <Text style={[styles.securityDescription, { color: palette.muted }]}>{t('workspaceSecurityDescription', language)}</Text>
                    </View>
                </View>

                <Text style={[styles.footer, { color: brand.colors.subtle }]}>© 2026 OperiX Suite · OperiX Invoice {APP_VERSION}</Text>
                <View style={{ height: 28 }} />
            </ScrollView>
        </MobileScreen>
    );
}

const styles = StyleSheet.create({
    content: { paddingHorizontal: 20, paddingBottom: 24 },
    brandCard: { borderWidth: 1, borderRadius: 24, padding: 18, marginBottom: 25 },
    logoPanel: { minHeight: 86, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    versionPill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, marginTop: 16 },
    versionText: { fontSize: 10, fontFamily: brand.fonts.semibold },
    brandTitle: { fontSize: 22, lineHeight: 29, marginTop: 15, fontFamily: brand.fonts.semibold },
    brandDescription: { fontSize: 12, lineHeight: 19, marginTop: 7, fontFamily: brand.fonts.regular },
    featureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 25 },
    featureCard: { width: '48.5%', minHeight: 145, borderWidth: 1, borderRadius: 17, padding: 14 },
    featureIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginBottom: 13 },
    featureTitle: { fontSize: 13, fontFamily: brand.fonts.semibold },
    featureDescription: { fontSize: 10, lineHeight: 15, marginTop: 4, fontFamily: brand.fonts.regular },
    resourceRow: { minHeight: 70, borderWidth: 1, borderRadius: 17, paddingHorizontal: 13, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 10 },
    resourceIcon: { width: 39, height: 39, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    resourceCopy: { flex: 1 },
    resourceTitle: { fontSize: 12, fontFamily: brand.fonts.semibold },
    resourceDescription: { fontSize: 10, lineHeight: 15, marginTop: 3, fontFamily: brand.fonts.regular },
    securityCard: { borderWidth: 1, borderRadius: 17, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginTop: 15 },
    securityIcon: { width: 39, height: 39, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    securityCopy: { flex: 1 },
    securityTitle: { fontSize: 12, fontFamily: brand.fonts.semibold },
    securityDescription: { fontSize: 10, lineHeight: 16, marginTop: 4, fontFamily: brand.fonts.regular },
    footer: { textAlign: 'center', fontSize: 10, marginTop: 22, fontFamily: brand.fonts.regular },
});
