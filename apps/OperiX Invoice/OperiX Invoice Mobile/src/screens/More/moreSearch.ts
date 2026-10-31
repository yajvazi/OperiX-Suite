/** Lower-case and strip accents, so "ë" and "e" or "ç" and "c" match each other in both languages. */
export function normalizeSearchText(value: string): string {
    return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** True when every word of the query appears somewhere in the text. */
export function matchesSearch(query: string, text: string): boolean {
    const words = normalizeSearchText(query).split(/\s+/).filter(Boolean);
    if (!words.length) return false;
    const haystack = normalizeSearchText(text);
    return words.every((word) => haystack.includes(word));
}
