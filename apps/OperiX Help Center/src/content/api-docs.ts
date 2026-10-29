import type { ApiSection, Locale } from "./types";

// The section registry for the developer documentation. Endpoint reference cards are rendered from
// packages/public-api/openapi.json (see components/api-page.tsx), so this navigation cannot quietly document
// an endpoint that is missing from the contract. OperiX Invoice is documented in full. OperiX Booking is not
// launched, so it has one "coming soon" page and no usable endpoint reference.

export type ApiGroupKey = "start" | "concepts" | "invoice" | "booking" | "reference";

export interface ApiSectionEntry extends ApiSection {
  group: ApiGroupKey;
  /** Slugs from the previous documentation that should now show the Booking "coming soon" page. */
  comingSoon?: boolean;
}

export const apiGroups: Record<ApiGroupKey, { en: string; sq: string; order: number }> = {
  start: { en: "Get started", sq: "Filloni", order: 1 },
  concepts: { en: "Core concepts", sq: "Konceptet themelore", order: 2 },
  invoice: { en: "OperiX Invoice API", sq: "API e OperiX Invoice", order: 3 },
  booking: { en: "OperiX Booking API", sq: "API e OperiX Booking", order: 4 },
  reference: { en: "Reference", sq: "Referenca", order: 5 },
};

export const apiSections: ApiSectionEntry[] = [
  { slug: "introduction", group: "start", title: "Introduction", description: "What the OperiX Invoice API does, what it needs, and how requests are shaped.", icon: "book-open", order: 1 },
  { slug: "quick-start", group: "start", title: "Quick Start", description: "Create a test key, then make a customer, an invoice, a payment and a PDF with cURL, JavaScript or Python.", icon: "sparkles", order: 2 },
  { slug: "authentication", group: "concepts", title: "Authentication", description: "Bearer API keys, key formats, environments and how a request is attributed.", icon: "lock", order: 3 },
  { slug: "test-mode", group: "concepts", title: "Test Mode", description: "Exercise your integration safely with opx_test_ keys before going live.", icon: "shield", order: 4 },
  { slug: "api-keys", group: "concepts", title: "API Keys", description: "Create, scope, rotate and revoke keys in Settings → Developers.", icon: "settings", order: 5 },
  { slug: "permissions", group: "concepts", title: "Permissions and Scopes", description: "Every scope, what it allows, and how to choose least-privilege keys.", icon: "lock", order: 6 },
  { slug: "rate-limits", group: "concepts", title: "Rate Limits", description: "Per-key limits, the rate-limit headers and how to back off on 429.", icon: "sliders", order: 7 },
  { slug: "idempotency", group: "concepts", title: "Idempotency", description: "Retry invoice, customer and payment writes without creating duplicates.", icon: "shield", order: 8 },
  { slug: "pagination", group: "concepts", title: "Pagination", description: "Page through collections with cursors and filter by date or reference.", icon: "code", order: 9 },
  { slug: "errors", group: "concepts", title: "Errors", description: "The error envelope and every error code, with its cause and fix.", icon: "help-circle", order: 10 },
  { slug: "webhooks", group: "concepts", title: "Webhooks", description: "Signed event delivery: events, payloads, verification, retries and testing.", icon: "webhook", order: 11 },
  { slug: "invoice-integration", group: "invoice", title: "Invoice Integration Guide", description: "Turn website and ecommerce orders into invoices and reconcile payments.", icon: "receipt", order: 12 },
  { slug: "invoice-customers", group: "invoice", title: "Customers", description: "Create, find and update customers, with external references.", icon: "users", order: 20 },
  { slug: "invoice-products", group: "invoice", title: "Products", description: "Create and maintain products and services with prices, VAT and stock.", icon: "receipt", order: 21 },
  { slug: "invoice-invoices", group: "invoice", title: "Invoices", description: "Create drafts, edit them, finalize, void, filter and retrieve invoices.", icon: "receipt", order: 22 },
  { slug: "invoice-documents", group: "invoice", title: "Document Types", description: "Quotes, pro-formas, orders, delivery notes and other documents through the invoice resource.", icon: "file-text", order: 23 },
  { slug: "invoice-payments", group: "invoice", title: "Payments", description: "Record payments, allocate them to invoices and list payment history.", icon: "receipt", order: 24 },
  { slug: "invoice-pdfs", group: "invoice", title: "PDFs", description: "Retrieve the same invoice PDF that OperiX Invoice produces.", icon: "file-text", order: 25 },
  { slug: "booking-api", group: "booking", title: "Booking API — Coming Soon", description: "OperiX Booking is not available yet. See what the API will cover.", icon: "calendar", order: 30, comingSoon: true },
  { slug: "changelog", group: "reference", title: "Versioning and Changelog", description: "The /v1 compatibility policy and the list of API changes.", icon: "megaphone", order: 40 },
];

export const apiSectionBySlug = Object.fromEntries(apiSections.map((section) => [section.slug, section])) as Record<string, ApiSectionEntry>;

/** Titles and descriptions in Albanian. English lives in the registry above. */
const albanianText: Record<string, { title: string; description: string }> = {
  introduction: { title: "Hyrje", description: "Çfarë bën API e OperiX Invoice, çfarë kërkon dhe si janë të formuara kërkesat." },
  "quick-start": { title: "Fillim i shpejtë", description: "Krijoni një çelës provë, pastaj një klient, një faturë, një pagesë dhe një PDF me cURL, JavaScript ose Python." },
  authentication: { title: "Autentikimi", description: "Çelësat Bearer API, formatet, mjediset dhe si i atribuohet një kërkesë." },
  "test-mode": { title: "Modaliteti provë", description: "Provoni integrimin tuaj në mënyrë të sigurt me çelësa opx_test_ para se të kaloni live." },
  "api-keys": { title: "Çelësat API", description: "Krijoni, kufizoni, rrotulloni dhe shfuqizoni çelësat te Cilësimet → Zhvilluesit." },
  permissions: { title: "Lejet dhe fushëveprimet", description: "Çdo fushëveprim, çfarë lejon dhe si të zgjidhni çelësa me privilegjet më të pakta." },
  "rate-limits": { title: "Kufijtë e kërkesave", description: "Kufijtë për çelës, header-at e kufirit dhe si të prisni pas një 429." },
  idempotency: { title: "Idempotenca", description: "Riprovoni shkrimet e faturave, klientëve dhe pagesave pa krijuar dublikata." },
  pagination: { title: "Faqosja", description: "Kaloni nëpër koleksione me kursorë dhe filtroni sipas datës ose references." },
  errors: { title: "Gabimet", description: "Zarfi i gabimit dhe çdo kod gabimi, me shkakun dhe zgjidhjen." },
  webhooks: { title: "Webhooks", description: "Dërgim i nënshkruar i ngjarjeve: ngjarjet, ngarkesat, verifikimi, riprovimet dhe testimi." },
  "invoice-integration": { title: "Udhëzues integrimi i faturave", description: "Shndërroni porositë e faqes dhe të dyqanit online në fatura dhe pajtoni pagesat." },
  "invoice-customers": { title: "Klientët", description: "Krijoni, gjeni dhe përditësoni klientë, me referenca të jashtme." },
  "invoice-products": { title: "Produktet", description: "Krijoni dhe mirëmbani produkte e shërbime me çmime, TVSH dhe stok." },
  "invoice-invoices": { title: "Faturat", description: "Krijoni drafte, ndryshojini, finalizojini, anulojini, filtrojini dhe merrni fatura." },
  "invoice-documents": { title: "Llojet e dokumenteve", description: "Oferta, proformë, porosi, fletëdërgesa dhe dokumente të tjera përmes burimit të faturës." },
  "invoice-payments": { title: "Pagesat", description: "Regjistroni pagesa, alokojini te faturat dhe listoni historikun e pagesave." },
  "invoice-pdfs": { title: "PDF", description: "Merrni të njëjtin PDF të faturës që prodhon OperiX Invoice." },
  "booking-api": { title: "API e Booking — së shpejti", description: "OperiX Booking nuk është ende në dispozicion. Shihni çfarë do të mbulojë API." },
  changelog: { title: "Versionimi dhe ndryshimet", description: "Politika e përputhshmërisë për /v1 dhe lista e ndryshimeve të API." },
};

export function localizedSection(slug: string, locale: Locale) {
  const section = apiSectionBySlug[slug];
  if (!section) return undefined;
  if (locale === "sq" && albanianText[slug]) return { ...section, ...albanianText[slug] };
  return section;
}

/** Old Booking slugs from the previous documentation now resolve to the coming-soon page. */
export function resolveApiSlug(slug: string) {
  if (apiSectionBySlug[slug]) return slug;
  if (slug === "booking-integration" || slug.startsWith("booking-")) return "booking-api";
  return undefined;
}
