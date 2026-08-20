/**
 * Formats stored ISO calendar dates for human-readable PDF output.
 * Database and API values remain YYYY-MM-DD.
 */
export function formatPdfDate(value: string | null | undefined): string {
    if (!value) return '';

    const raw = String(value).trim();
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw;

    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
    if (!match) return raw;

    return `${match[3]}/${match[2]}/${match[1]}`;
}
