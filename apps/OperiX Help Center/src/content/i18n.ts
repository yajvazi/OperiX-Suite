import type { CategoryDefinition, Locale, ProductDefinition } from "./types";

/** Albanian names for documentation categories, by slug. English comes from products.ts. */
const categoryNamesSq: Record<string, string> = {
  "getting-started": "Fillimi",
  "data-storage": "Ruajtja e të dhënave",
  "plans-and-billing": "Planet dhe faturimi",
  "web-vs-mobile": "Web dhe celular",
  dashboard: "Paneli kryesor",
  customers: "Klientët",
  "products-and-services": "Produkte dhe shërbime",
  invoices: "Faturat",
  quotes: "Ofertat",
  "proforma-invoices": "Faturat proformë",
  "delivery-notes": "Fletëdërgesat",
  orders: "Porositë",
  payments: "Pagesat",
  expenses: "Shpenzimet",
  inventory: "Stoku",
  pos: "Pika e shitjes (POS)",
  accounting: "Kontabiliteti",
  reports: "Raportet",
  payroll: "Pagat",
  taxes: "Tatimet",
  fiscalization: "Fiskalizimi",
  documents: "Dokumentet",
  settings: "Cilësimet",
  integrations: "Integrimet",
  company: "Kompania",
  "users-and-permissions": "Përdoruesit dhe lejet",
  notifications: "Njoftimet",
  "mobile-app": "Aplikacioni celular",
  "self-hosting": "Hostim në serverin tuaj",
  troubleshooting: "Zgjidhja e problemeve",
  faq: "Pyetje të shpeshta",
  bookings: "Rezervimet",
  calendar: "Kalendari",
  services: "Shërbimet",
  staff: "Stafi",
  resources: "Burimet",
  locations: "Vendndodhjet",
  availability: "Disponueshmëria",
  "public-booking-page": "Faqja publike e rezervimit",
};

const productDescriptionsSq: Record<string, string> = {
  invoice: "Fatura, pika e shitjes, shpenzime, libra të TVSH-së, raporte dhe paga në web dhe në telefon.",
  booking: "Takime, shërbime, staf dhe klientë në një kalendar. Vjen së shpejti.",
  general: "Udhëzime të përbashkëta për fillimin me OperiX.",
};

export function categoryLabel(locale: Locale, category: Pick<CategoryDefinition, "slug" | "name">) {
  return locale === "sq" ? categoryNamesSq[category.slug] ?? category.name : category.name;
}

export function categoryLabelBySlug(locale: Locale, slug: string, fallback: string) {
  return locale === "sq" ? categoryNamesSq[slug] ?? fallback : fallback;
}

export function productDescription(locale: Locale, product: Pick<ProductDefinition, "key" | "description">) {
  return locale === "sq" ? productDescriptionsSq[product.key] ?? product.description : product.description;
}

export function categoryIntro(locale: Locale, categoryName: string, productName: string) {
  return locale === "sq" ? `Udhëzime dhe dokumentacion për ${categoryName.toLowerCase()} në ${productName}.` : `Guides and documentation for ${categoryName.toLowerCase()} in ${productName}.`;
}

export function publishedArticlesLabel(locale: Locale, count: number) {
  if (locale === "sq") return `${count} ${count === 1 ? "artikull i publikuar" : "artikuj të publikuar"}`;
  return `${count} published ${count === 1 ? "article" : "articles"}`;
}

/** "4 min" becomes "4 min" in both languages; kept separate so wording can change per language. */
export function readingTimeLabel(locale: Locale, value: string) {
  return locale === "sq" ? value.replace(/\bmin\b/, "min") : value;
}

const faqCategoriesSq: Record<string, string> = {
  General: "Të përgjithshme",
  Account: "Llogaria",
  Billing: "Faturimi",
  Invoice: "Invoice",
  Booking: "Booking",
  Security: "Siguria",
  "Mobile Apps": "Aplikacionet celulare",
  Troubleshooting: "Zgjidhja e problemeve",
};

export function faqCategoryLabel(locale: Locale, category: string) {
  return locale === "sq" ? faqCategoriesSq[category] ?? category : category;
}
