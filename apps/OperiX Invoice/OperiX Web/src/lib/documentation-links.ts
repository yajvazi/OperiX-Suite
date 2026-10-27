import { INVOICE_DOCUMENTATION_PATHS } from './documentation-links.generated';

export const HELP_CENTER_URL = 'https://helpdesk.operixsuite.com';

/** Build a stable contextual Help Center URL from a feature ID, never from a tenant or record ID. */
export function invoiceHelpUrl(featureId: string, locale: 'en' | 'sq' = 'en', platform: 'web' | 'mobile' = 'web'): string | null {
    const entry = INVOICE_DOCUMENTATION_PATHS[featureId];
    if (!entry) return null;
    const slug = platform === 'mobile' ? entry.mobileSlug : entry.webSlug;
    return `${HELP_CENTER_URL}/${locale}/help/invoice/${entry.category}/${slug}`;
}
