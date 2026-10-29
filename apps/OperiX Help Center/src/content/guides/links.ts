/** Help Center paths for link cards inside guides. */
export type GuideLang = "en" | "sq";

/** Path to an Invoice guide: invoice(lang, "data-storage", "slug"). */
export const invoice = (lang: GuideLang, category: string, slug: string) => `/${lang}/help/invoice/${category}/${slug}`;

/** Path to a shared getting-started guide. */
export const general = (lang: GuideLang, slug: string) => `/${lang}/help/getting-started/${slug}`;

export const api = (lang: GuideLang, slug = "") => (slug ? `/${lang}/api/${slug}` : `/${lang}/api`);

export const appUrl = "https://invoice.operixsuite.com";
