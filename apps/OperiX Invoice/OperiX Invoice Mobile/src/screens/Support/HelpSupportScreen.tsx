import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ExternalLink, LifeBuoy, MessageCircle } from 'lucide-react-native';
import { useTheme } from '@invoice-monorepo/hooks';
import type { RootStackParamList } from '../../navigation/types';
import { openExternalLink } from '../../services/externalLinks';
import {
    getHelpArticlesForCategory,
    getPopularHelpArticles,
    getRecentlyViewedHelpArticles,
    loadRecentlyViewedHelpArticleIds,
    resolveDocumentationLanguage,
    searchHelpArticles,
    type DocumentationLanguage,
} from '../../services/helpDocumentation';
import { brand, getPalette } from '../../theme/brand';
import { EmptyState, MobileHeader, MobileScreen, SearchField, SectionTitle } from '../../components/mobile/MobileUI';
import { HelpArticleCard, HelpCategoryCard, HelpLanguageToggle } from '../../components/mobile/HelpCenterUI';
import { MOBILE_DOC_CATEGORIES } from '../../generated/mobileDocs';

const HELP_CENTER_URL = 'https://helpdesk.operixsuite.com';
const CONTACT_URL = 'https://operixsuite.com/#contact';

const COPY = {
    en: {
        title: 'Help & Support',
        subtitle: 'Guides for OperiX Invoice Mobile',
        search: 'Search help...',
        popular: 'Popular',
        browse: 'Browse help',
        recent: 'Recently viewed',
        results: 'Search results',
        resultCount: 'results',
        contactTitle: 'Still need help?',
        contactDescription: 'Contact OperiX Support for help with your workspace.',
        contact: 'Contact Support',
        externalTitle: 'Open Help Center',
        externalDescription: 'Open the external OperiX support center in your browser.',
        noResults: 'No help articles found',
        noResultsDescription: 'Try a different word, such as invoice, payment, or VAT.',
        offline: 'Help articles are included in the app and remain available offline.',
    },
    sq: {
        title: 'Ndihmë dhe mbështetje',
        subtitle: 'Udhëzues për OperiX Invoice Mobile',
        search: 'Kërko në ndihmë...',
        popular: 'Të përdorura shpesh',
        browse: 'Shfleto ndihmën',
        recent: 'Të shikuara së fundmi',
        results: 'Rezultatet e kërkimit',
        resultCount: 'rezultate',
        contactTitle: 'Keni ende nevojë për ndihmë?',
        contactDescription: 'Kontaktoni mbështetjen e OperiX për ndihmë me hapësirën tuaj të punës.',
        contact: 'Kontakto mbështetjen',
        externalTitle: 'Hap qendrën e ndihmës',
        externalDescription: 'Hap qendrën e jashtme të mbështetjes së OperiX në shfletues.',
        noResults: 'Nuk u gjetën artikuj ndihme',
        noResultsDescription: 'Provoni një fjalë tjetër, si faturë, pagesë ose TVSH.',
        offline: 'Artikujt e ndihmës janë pjesë e aplikacionit dhe mund të lexohen pa internet.',
    },
} as const;

type Props = NativeStackScreenProps<RootStackParamList, 'HelpSupport'>;

export function HelpSupportScreen({ navigation, route }: Props) {
    const { isDark, language } = useTheme();
    const palette = getPalette(isDark);
    const initialLanguage = resolveDocumentationLanguage(route.params?.language || language);
    const [documentationLanguage, setDocumentationLanguage] = useState<DocumentationLanguage>(initialLanguage);
    const [query, setQuery] = useState('');
    const [recentIds, setRecentIds] = useState<string[]>([]);
    const copy = COPY[documentationLanguage];

    useEffect(() => {
        if (!route.params?.language) setDocumentationLanguage(resolveDocumentationLanguage(language));
    }, [language, route.params?.language]);

    useEffect(() => {
        void loadRecentlyViewedHelpArticleIds().then(setRecentIds);
    }, []);

    const popularArticles = useMemo(() => getPopularHelpArticles(documentationLanguage), [documentationLanguage]);
    const recentArticles = useMemo(() => getRecentlyViewedHelpArticles(recentIds, documentationLanguage), [recentIds, documentationLanguage]);
    const helpCategories = useMemo(() => {
        // Categories are kept in the generated index; filtering here hides categories without
        // user-facing articles without maintaining a second hard-coded list in the app.
        return MOBILE_DOC_CATEGORIES.filter((category) => getHelpArticlesForCategory(category.id, documentationLanguage).length > 0);
    }, [documentationLanguage]);
    const results = useMemo(() => searchHelpArticles(query, documentationLanguage), [query, documentationLanguage]);
    const hasQuery = query.trim().length > 0;

    const openArticle = (articleId: string) => navigation.navigate('HelpArticle', { articleId, language: documentationLanguage });
    const openCategory = (category: string) => navigation.navigate('HelpCategory', { category, language: documentationLanguage });

    return (
        <MobileScreen testID="help-support-screen">
            <MobileHeader
                title={copy.title}
                subtitle={copy.subtitle}
                onBack={() => navigation.goBack()}
                right={<HelpLanguageToggle language={documentationLanguage} onChange={setDocumentationLanguage} />}
            />
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={[styles.introCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                    <View style={[styles.introIcon, { backgroundColor: palette.iconSurface }]}><LifeBuoy color={brand.colors.primary} size={23} /></View>
                    <View style={styles.introCopy}>
                        <Text style={[styles.introTitle, { color: palette.text }]}>{copy.title}</Text>
                        <Text style={[styles.introDescription, { color: palette.muted }]}>{copy.offline}</Text>
                    </View>
                </View>

                <SearchField testID="help-search-input" value={query} onChangeText={setQuery} placeholder={copy.search} autoCorrect={false} />

                {hasQuery ? (
                    <View style={styles.sectionBlock}>
                        <SectionTitle title={copy.results} action={`${results.length} ${copy.resultCount}`} />
                        {results.length ? results.map((article) => <HelpArticleCard key={article.id} article={article} language={documentationLanguage} onPress={() => openArticle(article.id)} />) : (
                            <EmptyState icon={LifeBuoy} title={copy.noResults} description={copy.noResultsDescription} />
                        )}
                    </View>
                ) : (
                    <>
                        <View style={styles.sectionBlock}>
                            <SectionTitle title={copy.popular} />
                            {popularArticles.map((article) => <HelpArticleCard key={article.id} article={article} language={documentationLanguage} onPress={() => openArticle(article.id)} />)}
                        </View>

                        {recentArticles.length ? (
                            <View style={styles.sectionBlock}>
                                <SectionTitle title={copy.recent} />
                                {recentArticles.map((article) => <HelpArticleCard key={article.id} article={article} language={documentationLanguage} onPress={() => openArticle(article.id)} />)}
                            </View>
                        ) : null}

                        <View style={styles.sectionBlock}>
                            <SectionTitle title={copy.browse} />
                            <View style={styles.categoryGrid}>
                                {helpCategories.map((category) => (
                                    <HelpCategoryCard
                                        key={category.id}
                                        category={category}
                                        language={documentationLanguage}
                                        articleCount={getHelpArticlesForCategory(category.id, documentationLanguage).length}
                                        onPress={() => openCategory(category.id)}
                                    />
                                ))}
                            </View>
                        </View>
                    </>
                )}

                <TouchableOpacity
                    testID="help-contact-button"
                    accessibilityRole="button"
                    accessibilityLabel={copy.contact}
                    onPress={() => void openExternalLink(CONTACT_URL, copy.contact)}
                    style={[styles.supportCard, { backgroundColor: palette.surface, borderColor: palette.border }]}
                >
                    <View style={[styles.supportIcon, { backgroundColor: palette.iconSurface }]}><MessageCircle color={brand.colors.primary} size={20} /></View>
                    <View style={styles.supportCopy}>
                        <Text style={[styles.supportTitle, { color: palette.text }]}>{copy.contactTitle}</Text>
                        <Text style={[styles.supportDescription, { color: palette.muted }]}>{copy.contactDescription}</Text>
                    </View>
                    <Text style={[styles.supportAction, { color: brand.colors.primary }]}>{copy.contact}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    testID="help-center-button"
                    accessibilityRole="button"
                    accessibilityLabel={copy.externalTitle}
                    onPress={() => void openExternalLink(HELP_CENTER_URL, copy.externalTitle)}
                    style={styles.externalLink}
                >
                    <ExternalLink color={brand.colors.primary} size={16} />
                    <View style={styles.externalCopy}>
                        <Text style={[styles.externalTitle, { color: palette.text }]}>{copy.externalTitle}</Text>
                        <Text style={[styles.externalDescription, { color: palette.muted }]}>{copy.externalDescription}</Text>
                    </View>
                </TouchableOpacity>
                <View style={{ height: 26 }} />
            </ScrollView>
        </MobileScreen>
    );
}

const styles = StyleSheet.create({
    content: { paddingHorizontal: 20, paddingBottom: 24 },
    introCard: { borderWidth: 1, borderRadius: 19, padding: 15, flexDirection: 'row', alignItems: 'center', marginBottom: 14, ...brand.shadow.card },
    introIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    introCopy: { flex: 1 },
    introTitle: { fontSize: 14, fontFamily: brand.fonts.semibold },
    introDescription: { fontSize: 11, lineHeight: 17, fontFamily: brand.fonts.regular, marginTop: 3 },
    sectionBlock: { marginTop: 25 },
    categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    supportCard: { minHeight: 82, borderWidth: 1, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', marginTop: 8, ...brand.shadow.card },
    supportIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
    supportCopy: { flex: 1 },
    supportTitle: { fontSize: 13, fontFamily: brand.fonts.semibold },
    supportDescription: { fontSize: 10, lineHeight: 15, fontFamily: brand.fonts.regular, marginTop: 3 },
    supportAction: { fontSize: 10, fontFamily: brand.fonts.semibold, marginLeft: 8 },
    externalLink: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingVertical: 15, gap: 10 },
    externalCopy: { flex: 1 },
    externalTitle: { fontSize: 12, fontFamily: brand.fonts.semibold },
    externalDescription: { fontSize: 10, lineHeight: 15, fontFamily: brand.fonts.regular, marginTop: 2 },
});
