import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeLocale } from '@invoice-monorepo/i18n';
import {
    MOBILE_DOC_ARTICLES,
    MOBILE_DOC_CATEGORIES,
    MOBILE_DOC_POPULAR_IDS,
    type MobileDocArticle,
    type MobileDocCategory,
    type MobileDocLanguage,
} from '../generated/mobileDocs';

export type DocumentationLanguage = MobileDocLanguage;

export const HELP_RECENT_STORAGE_KEY = '@operix_invoice_help_recent';

export function resolveDocumentationLanguage(value?: string | null): DocumentationLanguage {
    return normalizeLocale(value) === 'sq' ? 'sq' : 'en';
}

export function getHelpArticle(articleId: string, language: DocumentationLanguage): MobileDocArticle | undefined {
    return MOBILE_DOC_ARTICLES.find((article) => article.id === articleId && article.language === language);
}

export function getHelpCategory(categoryId: string): MobileDocCategory | undefined {
    return MOBILE_DOC_CATEGORIES.find((category) => category.id === categoryId);
}

export function getHelpCategoryTitle(categoryId: string, language: DocumentationLanguage): string {
    return getHelpCategory(categoryId)?.title[language] || categoryId;
}

export function getHelpArticlesForCategory(categoryId: string, language: DocumentationLanguage): MobileDocArticle[] {
    return MOBILE_DOC_ARTICLES.filter((article) => article.language === language && article.category === categoryId);
}

export function getPopularHelpArticles(language: DocumentationLanguage): MobileDocArticle[] {
    return MOBILE_DOC_POPULAR_IDS
        .map((articleId) => getHelpArticle(articleId, language))
        .filter((article): article is MobileDocArticle => Boolean(article));
}

function scoreArticle(article: MobileDocArticle, query: string, categoryTitle: string): number {
    const normalizedQuery = query.toLocaleLowerCase();
    const queryWords = normalizedQuery.split(/\s+/).filter(Boolean);
    const title = article.title.toLocaleLowerCase();
    const description = article.description.toLocaleLowerCase();
    const keywords = article.keywords.join(' ').toLocaleLowerCase();
    const content = article.content.toLocaleLowerCase();
    const category = categoryTitle.toLocaleLowerCase();
    let score = 0;

    if (title === normalizedQuery) score += 1_000;
    if (title.startsWith(normalizedQuery)) score += 700;
    if (title.includes(normalizedQuery)) score += 500;
    if (description.includes(normalizedQuery)) score += 180;
    if (keywords.includes(normalizedQuery)) score += 160;
    if (category.includes(normalizedQuery)) score += 120;
    if (content.includes(normalizedQuery)) score += 80;

    for (const word of queryWords) {
        if (title.includes(word)) score += 90;
        if (description.includes(word)) score += 35;
        if (keywords.includes(word)) score += 30;
        if (category.includes(word)) score += 20;
        if (content.includes(word)) score += 10;
    }

    return score;
}

export function searchHelpArticles(query: string, language: DocumentationLanguage): MobileDocArticle[] {
    const normalizedQuery = query.trim();
    const articles = MOBILE_DOC_ARTICLES.filter((article) => article.language === language);
    if (!normalizedQuery) return articles;

    return articles
        .map((article, index) => ({
            article,
            index,
            score: scoreArticle(article, normalizedQuery, getHelpCategoryTitle(article.category, language)),
        }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map(({ article }) => article);
}

export async function loadRecentlyViewedHelpArticleIds(): Promise<string[]> {
    try {
        const stored = await AsyncStorage.getItem(HELP_RECENT_STORAGE_KEY);
        if (!stored) return [];
        const parsed: unknown = JSON.parse(stored);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((value): value is string => typeof value === 'string').slice(0, 6);
    } catch {
        return [];
    }
}

export async function rememberHelpArticle(articleId: string): Promise<void> {
    const existing = await loadRecentlyViewedHelpArticleIds();
    const next = [articleId, ...existing.filter((id) => id !== articleId)].slice(0, 6);
    try {
        await AsyncStorage.setItem(HELP_RECENT_STORAGE_KEY, JSON.stringify(next));
    } catch {
        // Recent articles are a convenience. Documentation remains available when storage is unavailable.
    }
}

export function getRecentlyViewedHelpArticles(articleIds: string[], language: DocumentationLanguage): MobileDocArticle[] {
    return articleIds
        .map((articleId) => getHelpArticle(articleId, language))
        .filter((article): article is MobileDocArticle => Boolean(article));
}
