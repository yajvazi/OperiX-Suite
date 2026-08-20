import React, { useEffect, useMemo, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ArrowUpRight, CircleHelp, ExternalLink } from 'lucide-react-native';
import { useTheme } from '@invoice-monorepo/hooks';
import type { RootStackParamList } from '../../navigation/types';
import {
    getHelpArticle,
    getHelpCategoryTitle,
    rememberHelpArticle,
    resolveDocumentationLanguage,
    type DocumentationLanguage,
} from '../../services/helpDocumentation';
import { openExternalLink } from '../../services/externalLinks';
import { brand, getPalette } from '../../theme/brand';
import { EmptyState, MobileHeader, MobileScreen } from '../../components/mobile/MobileUI';
import { HelpArticleCard, HelpLanguageToggle } from '../../components/mobile/HelpCenterUI';

const STATUS_LABELS: Record<DocumentationLanguage, Record<string, string>> = {
    en: { partial: 'Partial feature', experimental: 'Experimental', development: 'In development', internal: 'Internal', disabled: 'Disabled', broken: 'Unavailable' },
    sq: { partial: 'Funksion pjesërisht i disponueshëm', experimental: 'Eksperimentale', development: 'Në zhvillim', internal: 'E brendshme', disabled: 'E çaktivizuar', broken: 'E padisponueshme' },
};

type Props = NativeStackScreenProps<RootStackParamList, 'HelpArticle'>;

function inlineMarkdown(
    text: string,
    keyPrefix: string,
    articleLinks: { text: string; href: string; targetId: string | null }[],
    navigation: Props['navigation'],
    language: DocumentationLanguage,
    palette: ReturnType<typeof getPalette>,
) {
    const nodes: ReactNode[] = [];
    const expression = /(\*\*[^*]+\*\*|`[^`]+`|\[([^\]]+)\]\(([^)]+)\))/g;
    let cursor = 0;
    let partIndex = 0;
    for (const match of text.matchAll(expression)) {
        const full = match[0];
        const offset = match.index ?? 0;
        if (offset > cursor) nodes.push(text.slice(cursor, offset));
        if (full.startsWith('**')) {
            nodes.push(<Text key={`${keyPrefix}-bold-${partIndex}`} style={styles.bold}>{full.slice(2, -2)}</Text>);
        } else if (full.startsWith('`')) {
            nodes.push(<Text key={`${keyPrefix}-code-${partIndex}`} style={[styles.inlineCode, { color: palette.text }]}>{full.slice(1, -1)}</Text>);
        } else {
            const label = match[2] || full;
            const href = match[3] || '';
            const link = articleLinks.find((item) => item.href === href && item.text === label);
            if (!link?.targetId && !/^https?:\/\//.test(href)) {
                nodes.push(label);
            } else {
                nodes.push(
                    <Text
                        key={`${keyPrefix}-link-${partIndex}`}
                        accessibilityRole="link"
                        onPress={() => {
                            if (link?.targetId) navigation.navigate('HelpArticle', { articleId: link.targetId, language });
                            else void openExternalLink(href, label);
                        }}
                        style={[styles.inlineLink, { color: brand.colors.primary }]}
                    >
                        {label}
                    </Text>,
                );
            }
        }
        cursor = offset + full.length;
        partIndex += 1;
    }
    if (cursor < text.length) nodes.push(text.slice(cursor));
    return nodes;
}

function isTableSeparator(line: string) {
    return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
}

function tableCells(line: string) {
    const value = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    return value.split('|').map((cell) => cell.trim());
}

export function HelpArticleScreen({ navigation, route }: Props) {
    const { isDark, language } = useTheme();
    const palette = getPalette(isDark);
    const documentationLanguage = resolveDocumentationLanguage(route.params.language || language);
    const [activeLanguage, setActiveLanguage] = React.useState<DocumentationLanguage>(documentationLanguage);
    const article = getHelpArticle(route.params.articleId, activeLanguage);

    useEffect(() => {
        void rememberHelpArticle(route.params.articleId);
    }, [route.params.articleId]);

    useEffect(() => {
        if (!route.params.language) setActiveLanguage(resolveDocumentationLanguage(language));
    }, [language, route.params.language]);

    const categoryTitle = article ? getHelpCategoryTitle(article.category, activeLanguage) : activeLanguage === 'sq' ? 'Ndihmë' : 'Help';
    const relatedArticles = useMemo(() => {
        if (!article) return [];
        return article.relatedArticles
            .map((articleId) => getHelpArticle(articleId, activeLanguage))
            .filter((related): related is NonNullable<typeof related> => Boolean(related));
    }, [activeLanguage, article]);

    const renderMarkdown = (content: string) => {
        const lines = content.split(/\r?\n/);
        const nodes: ReactNode[] = [];
        let index = 0;
        const renderInline = (value: string, key: string) => inlineMarkdown(value, key, article?.links || [], navigation, activeLanguage, palette);

        while (index < lines.length) {
            const line = lines[index];
            if (!line.trim()) {
                index += 1;
                continue;
            }

            if (/^```/.test(line.trim())) {
                const codeLines: string[] = [];
                index += 1;
                while (index < lines.length && !/^```/.test(lines[index].trim())) {
                    codeLines.push(lines[index]);
                    index += 1;
                }
                index += 1;
                nodes.push(<Text key={`code-${index}`} style={[styles.codeBlock, { backgroundColor: palette.surfaceMuted, color: palette.text }]}>{codeLines.join('\n')}</Text>);
                continue;
            }

            const heading = line.match(/^(#{1,3})\s+(.+)$/);
            if (heading) {
                const level = heading[1].length;
                nodes.push(<Text key={`heading-${index}`} style={[level === 1 ? styles.heading1 : level === 2 ? styles.heading2 : styles.heading3, { color: palette.text }]}>{renderInline(heading[2], `heading-${index}`)}</Text>);
                index += 1;
                continue;
            }

            const screenshot = line.match(/^>\s*(?:Screenshot|Pamje ekrani):\s*(.+)$/i);
            if (screenshot) {
                nodes.push(
                    <View key={`screenshot-${index}`} style={[styles.placeholder, { backgroundColor: palette.surfaceMuted, borderColor: palette.border }]}>
                        <CircleHelp color={brand.colors.primary} size={18} />
                        <Text style={[styles.placeholderText, { color: palette.muted }]}>{activeLanguage === 'sq' ? 'Pamje ekrani: ' : 'Screenshot: '}{screenshot[1]}</Text>
                    </View>,
                );
                index += 1;
                continue;
            }

            const notice = line.match(/^>\s*(Note|Warning|Shënim|Kujdes):\s*(.+)$/i);
            if (notice) {
                const warning = /warning|kujdes/i.test(notice[1]);
                nodes.push(
                    <View key={`notice-${index}`} style={[styles.notice, { backgroundColor: warning ? '#FFF6D9' : palette.surfaceMuted, borderColor: warning ? '#F3C969' : palette.border }]}>
                        <Text style={[styles.noticeLabel, { color: warning ? '#A15C00' : palette.text }]}>{notice[1]}</Text>
                        <Text style={[styles.noticeText, { color: palette.muted }]}>{renderInline(notice[2], `notice-${index}`)}</Text>
                    </View>,
                );
                index += 1;
                continue;
            }

            if (line.trim().startsWith('|')) {
                const rows: string[][] = [];
                while (index < lines.length && lines[index].trim().startsWith('|')) {
                    if (!isTableSeparator(lines[index])) rows.push(tableCells(lines[index]));
                    index += 1;
                }
                nodes.push(
                    <ScrollView key={`table-${index}`} horizontal showsHorizontalScrollIndicator={false} style={styles.tableScroll}>
                        <View style={[styles.table, { borderColor: palette.border }]}>
                            {rows.map((row, rowIndex) => (
                                <View key={`row-${rowIndex}`} style={[styles.tableRow, { borderBottomColor: palette.border, backgroundColor: rowIndex === 0 ? palette.surfaceMuted : palette.surface }]}>
                                    {row.map((cell, cellIndex) => <Text key={`cell-${cellIndex}`} style={[styles.tableCell, { color: palette.text }]}>{renderInline(cell, `table-${rowIndex}-${cellIndex}`)}</Text>)}
                                </View>
                            ))}
                        </View>
                    </ScrollView>,
                );
                continue;
            }

            const unordered = line.match(/^\s*[-*]\s+(.+)$/);
            const ordered = line.match(/^\s*(\d+)\.\s+(.+)$/);
            if (unordered || ordered) {
                const listItems: { marker: string; value: string }[] = [];
                const orderedList = Boolean(ordered);
                while (index < lines.length) {
                    const current = lines[index].match(orderedList ? /^\s*(\d+)\.\s+(.+)$/ : /^\s*[-*]\s+(.+)$/);
                    if (!current) break;
                    listItems.push({ marker: orderedList ? `${current[1]}.` : '•', value: orderedList ? current[2] : current[1] });
                    index += 1;
                }
                nodes.push(
                    <View key={`list-${index}`} style={styles.list}>
                        {listItems.map((item, itemIndex) => <View key={`item-${itemIndex}`} style={styles.listRow}><Text style={[styles.listMarker, { color: brand.colors.primary }]}>{item.marker}</Text><Text style={[styles.body, { color: palette.text }]}>{renderInline(item.value, `list-${index}-${itemIndex}`)}</Text></View>)}
                    </View>,
                );
                continue;
            }

            const paragraph: string[] = [line.trim()];
            index += 1;
            while (index < lines.length && lines[index].trim() && !/^(#{1,3})\s+/.test(lines[index]) && !/^\s*[-*]\s+/.test(lines[index]) && !/^\s*\d+\.\s+/.test(lines[index]) && !lines[index].trim().startsWith('|') && !/^>/.test(lines[index].trim()) && !/^```/.test(lines[index].trim())) {
                paragraph.push(lines[index].trim());
                index += 1;
            }
            nodes.push(<Text key={`paragraph-${index}`} style={[styles.body, { color: palette.text }]}>{renderInline(paragraph.join(' '), `paragraph-${index}`)}</Text>);
        }

        return nodes;
    };

    return (
        <MobileScreen>
            <MobileHeader
                title={article?.title || (activeLanguage === 'sq' ? 'Artikulli nuk u gjet' : 'Article not found')}
                subtitle={categoryTitle}
                onBack={() => navigation.goBack()}
                right={<HelpLanguageToggle language={activeLanguage} onChange={setActiveLanguage} />}
            />
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
                {article ? (
                    <>
                        <View style={[styles.articleHeader, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                            <Text style={[styles.articleTitle, { color: palette.text }]}>{article.title}</Text>
                            <Text style={[styles.articleDescription, { color: palette.muted }]}>{article.description}</Text>
                            {article.status !== 'production' ? <View style={[styles.status, { backgroundColor: article.status === 'disabled' ? '#FFF0EF' : '#FFF6D9' }]}><Text style={[styles.statusText, { color: article.status === 'disabled' ? brand.colors.error : brand.colors.warning }]}>{STATUS_LABELS[activeLanguage][article.status]}</Text></View> : null}
                        </View>
                        <View style={styles.markdown}>{renderMarkdown(article.content)}</View>

                        {article.links.some((link) => !link.targetId && /^https?:\/\//.test(link.href)) ? (
                            <View style={styles.externalArticles}>
                                {article.links.filter((link) => !link.targetId && /^https?:\/\//.test(link.href)).map((link) => (
                                    <TouchableOpacity key={`${link.text}-${link.href}`} accessibilityRole="link" onPress={() => void openExternalLink(link.href, link.text)} style={[styles.externalArticleLink, { borderColor: palette.border }]}>
                                        <Text style={[styles.externalArticleText, { color: brand.colors.primary }]}>{link.text}</Text>
                                        <ArrowUpRight color={brand.colors.primary} size={16} />
                                    </TouchableOpacity>
                                ))}
                            </View>
                        ) : null}

                        {relatedArticles.length ? (
                            <View style={styles.related}>
                                <Text style={[styles.relatedTitle, { color: palette.text }]}>{activeLanguage === 'sq' ? 'Artikuj të ngjashëm' : 'Related articles'}</Text>
                                {relatedArticles.map((related) => <HelpArticleCard key={related.id} article={related} language={activeLanguage} onPress={() => navigation.navigate('HelpArticle', { articleId: related.id, language: activeLanguage })} />)}
                            </View>
                        ) : null}
                    </>
                ) : <EmptyState icon={CircleHelp} title={activeLanguage === 'sq' ? 'Artikulli nuk u gjet' : 'Article not found'} description={activeLanguage === 'sq' ? 'Ky artikull nuk është i disponueshëm në këtë version.' : 'This article is not available in this app version.'} />}
                <View style={{ height: 28 }} />
            </ScrollView>
        </MobileScreen>
    );
}

const styles = StyleSheet.create({
    content: { paddingHorizontal: 20, paddingBottom: 24 },
    articleHeader: { borderWidth: 1, borderRadius: 19, padding: 16, ...brand.shadow.card },
    articleTitle: { fontSize: 21, lineHeight: 28, fontFamily: brand.fonts.semibold },
    articleDescription: { fontSize: 12, lineHeight: 19, fontFamily: brand.fonts.regular, marginTop: 6 },
    status: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginTop: 10 },
    statusText: { fontSize: 10, fontFamily: brand.fonts.semibold },
    markdown: { marginTop: 22 },
    heading1: { fontSize: 21, lineHeight: 28, fontFamily: brand.fonts.semibold, marginTop: 12, marginBottom: 9 },
    heading2: { fontSize: 17, lineHeight: 24, fontFamily: brand.fonts.semibold, marginTop: 17, marginBottom: 7 },
    heading3: { fontSize: 14, lineHeight: 21, fontFamily: brand.fonts.semibold, marginTop: 13, marginBottom: 5 },
    body: { fontSize: 13, lineHeight: 21, fontFamily: brand.fonts.regular, marginBottom: 12 },
    bold: { fontFamily: brand.fonts.semibold },
    inlineCode: { fontFamily: 'Courier', fontSize: 12, backgroundColor: '#EAF2FF', paddingHorizontal: 3 },
    inlineLink: { fontFamily: brand.fonts.medium, textDecorationLine: 'underline' },
    codeBlock: { borderRadius: 12, padding: 13, fontFamily: 'Courier', fontSize: 11, lineHeight: 17, marginBottom: 13 },
    placeholder: { minHeight: 58, borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 13 },
    placeholderText: { flex: 1, fontSize: 11, lineHeight: 17, fontFamily: brand.fonts.regular },
    notice: { borderWidth: 1, borderRadius: 14, padding: 13, marginBottom: 13 },
    noticeLabel: { fontSize: 11, fontFamily: brand.fonts.semibold, marginBottom: 4 },
    noticeText: { fontSize: 12, lineHeight: 19, fontFamily: brand.fonts.regular },
    list: { marginBottom: 5 },
    listRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 5 },
    listMarker: { width: 24, fontSize: 13, lineHeight: 21, fontFamily: brand.fonts.semibold },
    tableScroll: { marginBottom: 14 },
    table: { borderWidth: 1, borderRadius: 12, overflow: 'hidden', minWidth: 500 },
    tableRow: { flexDirection: 'row', borderBottomWidth: 1, paddingVertical: 9, paddingHorizontal: 10 },
    tableCell: { width: 160, fontSize: 11, lineHeight: 17, fontFamily: brand.fonts.regular, paddingRight: 10 },
    externalArticles: { marginTop: 8 },
    externalArticleLink: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    externalArticleText: { fontSize: 11, fontFamily: brand.fonts.medium },
    related: { marginTop: 22 },
    relatedTitle: { fontSize: 18, fontFamily: brand.fonts.semibold, marginBottom: 12 },
});
