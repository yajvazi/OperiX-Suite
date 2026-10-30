import AsyncStorage from '@react-native-async-storage/async-storage';
import { HELP_CENTER_URL, type DocumentationLanguage } from './helpDocumentation';

export type LiveHelpArticle = { id: string; category: string; slug: string; title: string; description: string; readingTime: string; path: string };
export type LiveHelpCategory = { slug: string; name: string };
export type LiveHelpIndex = { categories: LiveHelpCategory[]; articles: LiveHelpArticle[] };

const cacheKey = (language: DocumentationLanguage) => `@operix_invoice_help_live_${language}`;

/** The OperiX Invoice mobile guides as published on the Help Center site; the last good copy is kept for offline use. */
export async function loadLiveHelpIndex(language: DocumentationLanguage): Promise<LiveHelpIndex | null> {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const response = await fetch(`${HELP_CENTER_URL}/api/mobile-docs?lang=${language}`, { signal: controller.signal });
        clearTimeout(timer);
        if (!response.ok) throw new Error(`Help Center returned ${response.status}`);
        const index = await response.json() as LiveHelpIndex;
        if (!Array.isArray(index.articles) || !index.articles.length) throw new Error('Help Center returned no articles');
        await AsyncStorage.setItem(cacheKey(language), JSON.stringify(index)).catch(() => undefined);
        return index;
    } catch {
        try {
            const cached = await AsyncStorage.getItem(cacheKey(language));
            return cached ? JSON.parse(cached) as LiveHelpIndex : null;
        } catch {
            return null;
        }
    }
}

export function helpCenterArticleUrl(article: Pick<LiveHelpArticle, 'path'>) {
    return `${HELP_CENTER_URL}${article.path}`;
}

export function searchLiveHelp(index: LiveHelpIndex, query: string): LiveHelpArticle[] {
    const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return index.articles;
    return index.articles.filter((article) => {
        const haystack = `${article.title} ${article.description}`.toLocaleLowerCase();
        return words.every((word) => haystack.includes(word));
    });
}
