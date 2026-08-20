import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CircleHelp } from 'lucide-react-native';
import { useTheme } from '@invoice-monorepo/hooks';
import type { RootStackParamList } from '../../navigation/types';
import {
    getHelpArticlesForCategory,
    getHelpCategory,
    getHelpCategoryTitle,
    resolveDocumentationLanguage,
    searchHelpArticles,
    type DocumentationLanguage,
} from '../../services/helpDocumentation';
import { brand, getPalette } from '../../theme/brand';
import { EmptyState, MobileHeader, MobileScreen, SearchField } from '../../components/mobile/MobileUI';
import { HelpArticleCard, HelpLanguageToggle } from '../../components/mobile/HelpCenterUI';

const COPY = {
    en: { subtitle: 'Help articles', search: 'Search this category...', count: 'articles', missing: 'Category not found', missingDescription: 'This help category is not available in this app version.' },
    sq: { subtitle: 'Artikujt e ndihmës', search: 'Kërko në këtë kategori...', count: 'artikuj', missing: 'Kategoria nuk u gjet', missingDescription: 'Kjo kategori e ndihmës nuk është e disponueshme në këtë version të aplikacionit.' },
} as const;

type Props = NativeStackScreenProps<RootStackParamList, 'HelpCategory'>;

export function HelpCategoryScreen({ navigation, route }: Props) {
    const { isDark, language } = useTheme();
    const palette = getPalette(isDark);
    const initialLanguage = resolveDocumentationLanguage(route.params.language || language);
    const [documentationLanguage, setDocumentationLanguage] = useState<DocumentationLanguage>(initialLanguage);
    const [query, setQuery] = useState('');
    const copy = COPY[documentationLanguage];
    const category = getHelpCategory(route.params.category);

    useEffect(() => {
        if (!route.params.language) setDocumentationLanguage(resolveDocumentationLanguage(language));
    }, [language, route.params.language]);

    const articles = useMemo(() => {
        if (!category) return [];
        if (!query.trim()) return getHelpArticlesForCategory(category.id, documentationLanguage);
        return searchHelpArticles(query, documentationLanguage).filter((article) => article.category === category.id);
    }, [category, documentationLanguage, query]);

    return (
        <MobileScreen>
            <MobileHeader
                title={category ? getHelpCategoryTitle(category.id, documentationLanguage) : copy.missing}
                subtitle={copy.subtitle}
                onBack={() => navigation.goBack()}
                right={<HelpLanguageToggle language={documentationLanguage} onChange={setDocumentationLanguage} />}
            />
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {category ? (
                    <>
                        <View style={[styles.summary, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                            <Text style={[styles.summaryTitle, { color: palette.text }]}>{getHelpCategoryTitle(category.id, documentationLanguage)}</Text>
                            <Text style={[styles.summaryDescription, { color: palette.muted }]}>{articles.length} {copy.count}</Text>
                        </View>
                        <SearchField value={query} onChangeText={setQuery} placeholder={copy.search} autoCorrect={false} />
                        <View style={styles.list}>
                            {articles.length ? articles.map((article) => (
                                <HelpArticleCard
                                    key={article.id}
                                    article={article}
                                    language={documentationLanguage}
                                    onPress={() => navigation.navigate('HelpArticle', { articleId: article.id, language: documentationLanguage })}
                                />
                            )) : <EmptyState icon={CircleHelp} title={documentationLanguage === 'sq' ? 'Nuk u gjetën artikuj' : 'No articles found'} description={documentationLanguage === 'sq' ? 'Provoni një kërkim tjetër.' : 'Try a different search.'} />}
                        </View>
                    </>
                ) : <EmptyState icon={CircleHelp} title={copy.missing} description={copy.missingDescription} />}
                <View style={{ height: 28 }} />
            </ScrollView>
        </MobileScreen>
    );
}

const styles = StyleSheet.create({
    content: { paddingHorizontal: 20, paddingBottom: 24 },
    summary: { borderWidth: 1, borderRadius: 18, padding: 15, marginBottom: 14, ...brand.shadow.card },
    summaryTitle: { fontSize: 17, fontFamily: brand.fonts.semibold },
    summaryDescription: { fontSize: 11, fontFamily: brand.fonts.regular, marginTop: 3 },
    list: { marginTop: 24 },
});
