import type { Article, DocBlock, Locale, ProductKey } from "./types";

const h = (id: string, text: string, level: 2 | 3 = 2): DocBlock => ({ type: "heading", id, text, level });
const p = (text: string): DocBlock => ({ type: "paragraph", text });
const list = (items: string[], ordered = false): DocBlock => ({ type: "list", items, ordered });
const callout = (tone: "tip" | "note" | "warning" | "danger", text: string, title?: string): DocBlock => ({ type: "callout", tone, text, title });

const commonArticle = (input: Omit<Article, "draft"> & { draft?: boolean }): Article => ({ draft: false, ...input });

const plannedGettingStartedArticles: Article[] = [
  ["signing-in", "Signing In", "Find the future guide for signing in to your OperiX account."],
  ["creating-an-organization", "Creating an Organization", "Learn where organization creation guidance will live."],
  ["inviting-team-members", "Inviting Team Members", "Learn where team invitation guidance will live."],
  ["choosing-operix-apps", "Choosing OperiX Apps", "Explore the future guide to choosing applications for your organization."],
  ["understanding-roles-and-permissions", "Understanding Roles & Permissions", "Learn where shared role and permission concepts will be documented."],
  ["switching-between-apps", "Switching Between Apps", "Learn where application switching guidance will live."],
  ["managing-your-profile", "Managing Your Profile", "Learn where profile management guidance will live."],
  ["changing-language", "Changing Language", "Learn where localization and language-switching guidance will live."],
  ["security-and-mfa", "Security & MFA", "Learn where verified account security and MFA guidance will live."],
].map(([slug, title, description], index) => commonArticle({
  id: slug,
  translationId: slug,
  locale: "en",
  title,
  description,
  product: "suite",
  category: "getting-started",
  slug,
  order: index + 3,
  tags: ["getting started"],
  keywords: [title.toLowerCase()],
  lastUpdated: "2026-08-01",
  readingTime: "2 min",
  blocks: [
    h("overview", "Overview"),
    p("This starter page reserves a stable route and navigation position for verified OperiX guidance. Detailed instructions will be added when the final product flow is documented."),
    callout("note", "This page is a content placeholder; it does not describe undocumented account behavior."),
  ],
}));

export function draftsArePreviewable() {
  return process.env.PREVIEW_DRAFTS === "true" && process.env.PREVIEW_AUTHORIZED === "true";
}

function isVisible(article: Article) {
  return !article.draft || draftsArePreviewable();
}

export const articles: Article[] = [
  ...plannedGettingStartedArticles,
  commonArticle({
    id: "welcome-to-operix",
    translationId: "welcome-to-operix",
    locale: "en",
    title: "Welcome to OperiX",
    description: "A starting point for understanding your OperiX account, organization and applications.",
    product: "suite",
    category: "getting-started",
    slug: "welcome-to-operix",
    order: 1,
    tags: ["getting started", "account", "organization"],
    keywords: ["operix account", "suite", "start"],
    lastUpdated: "2026-08-01",
    readingTime: "3 min",
    featured: true,
    blocks: [
      h("overview", "Overview"),
      p("OperiX brings the tools your organization uses every day into one connected suite. This Help Center is the place to learn the shared concepts first, then explore the product guides for each application."),
      callout("tip", "Start with the shared account and organization concepts before configuring an individual OperiX application."),
      h("where-to-begin", "Where to begin"),
      list([
        "Create or join your OperiX account.",
        "Create an organization and invite the people you work with.",
        "Choose the OperiX applications your organization needs.",
        "Learn how roles, permissions and application switching work together.",
      ], true),
      h("explore-the-suite", "Explore the suite"),
      p("Use Browse by Product to open a product documentation home. Sections without published guides are marked clearly so future documentation can be added without changing the navigation model."),
      callout("note", "The available features and permissions can depend on your organization and OperiX plan."),
    ],
    related: ["creating-operix-account", "about-operix-invoice", "about-operix-control"],
  }),
  commonArticle({
    id: "creating-operix-account",
    translationId: "creating-operix-account",
    locale: "en",
    title: "Creating Your OperiX Account",
    description: "Learn where account and profile documentation will live as the OperiX Help Center grows.",
    product: "suite",
    category: "getting-started",
    slug: "creating-operix-account",
    order: 2,
    tags: ["account", "getting started"],
    keywords: ["create account", "sign up", "profile"],
    lastUpdated: "2026-08-01",
    readingTime: "2 min",
    blocks: [
      h("overview", "Overview"),
      p("This starter page reserves the account onboarding structure for future step-by-step guidance. Detailed account instructions will be published once the final OperiX onboarding flow is documented."),
      callout("note", "No account or authentication behavior is invented in this starter article."),
      h("planned-topics", "Planned topics"),
      list(["Signing in", "Creating an organization", "Inviting team members", "Managing your profile", "Security and MFA"]),
    ],
    related: ["welcome-to-operix", "about-operix-control"],
  }),
  commonArticle({
    id: "about-operix-invoice",
    translationId: "about-operix-invoice",
    locale: "en",
    title: "About OperiX Invoice",
    description: "An orientation to the OperiX Invoice documentation and the areas it will cover.",
    product: "invoice",
    category: "getting-started",
    slug: "about-operix-invoice",
    order: 1,
    tags: ["invoice", "getting started"],
    keywords: ["invoice app", "billing", "customers", "payments"],
    lastUpdated: "2026-08-01",
    readingTime: "2 min",
    featured: true,
    blocks: [
      h("overview", "Overview"),
      p("OperiX Invoice helps organizations manage commercial documents, customers, payments and financial reporting. The documentation structure is ready for detailed product guides to be added by the OperiX team."),
      h("documentation-areas", "Documentation areas"),
      list(["Customers and products", "Invoices, quotes and orders", "Payments and expenses", "Inventory and POS", "Accounting and reports", "Settings and integrations"]),
      callout("note", "Detailed behavior, plan limits and accounting guidance will be added as each area is documented."),
    ],
    related: ["create-an-invoice", "welcome-to-operix"],
  }),
  commonArticle({
    id: "create-an-invoice",
    translationId: "create-an-invoice",
    locale: "en",
    title: "Create an Invoice",
    description: "Learn how to create, send and manage invoices using OperiX Invoice.",
    product: "invoice",
    category: "invoices",
    slug: "create-invoice",
    order: 1,
    tags: ["invoice", "invoices", "billing"],
    keywords: ["new invoice", "send invoice", "invoice payment"],
    lastUpdated: "2026-08-01",
    readingTime: "5 min",
    featured: true,
    blocks: [
      h("overview", "Overview"),
      p("This starter guide demonstrates the article layout and step component. Product-specific screenshots and final instructions will be added when the OperiX Invoice workflow is approved for publication."),
      callout("tip", "You can save an invoice as a draft before sending it."),
      h("create-an-invoice", "Create an invoice"),
      {
        type: "steps",
        id: "create-invoice-steps",
        items: [
          { title: "Open OperiX Invoice." },
          { title: "Select Invoices from the sidebar." },
          { title: "Click New Invoice." },
          { title: "Select your customer." },
          { title: "Add invoice items." },
          { title: "Click Save or Send." },
        ],
      },
      { type: "screenshot", alt: "Invoice editor screenshot placeholder", caption: "Invoice editor screenshot will be added here." },
      callout("note", "Some features depend on your OperiX plan."),
      h("next-steps", "Next steps"),
      p("When the full invoice workflow is documented, related guides for payments, credit notes and invoice settings will be linked from this article."),
    ],
    related: ["about-operix-invoice"],
  }),
  commonArticle({
    id: "about-operix-hr",
    translationId: "about-operix-hr",
    locale: "en",
    title: "About OperiX HR",
    description: "An orientation to the OperiX HR documentation and the people operations areas it will cover.",
    product: "hr",
    category: "getting-started",
    slug: "about-operix-hr",
    order: 1,
    tags: ["hr", "employees", "getting started"],
    keywords: ["human resources", "employee management", "payroll"],
    lastUpdated: "2026-08-01",
    readingTime: "2 min",
    featured: true,
    blocks: [
      h("overview", "Overview"),
      p("OperiX HR is the home for employee records, attendance, leave, payroll, recruitment and people operations. This starter article establishes the documentation entry point without fabricating feature instructions."),
      h("documentation-areas", "Documentation areas"),
      list(["Employees and departments", "Attendance and leave", "Payroll and reports", "Recruitment and performance", "Onboarding and offboarding", "Documents, contracts and settings"]),
      callout("note", "Screenshots and detailed HR workflows will be added after the product flows are documented."),
    ],
  }),
  commonArticle({
    id: "about-operix-booking",
    translationId: "about-operix-booking",
    locale: "en",
    title: "About OperiX Booking",
    description: "An orientation to appointments, services, staff, resources and reservations in OperiX Booking.",
    product: "booking",
    category: "getting-started",
    slug: "about-operix-booking",
    order: 1,
    tags: ["booking", "reservations", "getting started"],
    keywords: ["appointments", "calendar", "services", "availability"],
    lastUpdated: "2026-08-01",
    readingTime: "2 min",
    featured: true,
    blocks: [
      h("overview", "Overview"),
      p("OperiX Booking provides a place to organize appointments, services, staff, resources, locations and customer reservations. The product documentation structure is ready for guides and screenshots to be added later."),
      h("documentation-areas", "Documentation areas"),
      list(["Bookings and calendar", "Customers, services and staff", "Resources, locations and availability", "Payments and public booking pages", "Notifications, reports and settings"]),
      callout("note", "This starter page intentionally does not describe behavior that has not been documented yet."),
    ],
  }),
  commonArticle({
    id: "about-operix-desk",
    translationId: "about-operix-desk",
    locale: "en",
    title: "About OperiX Desk",
    description: "An orientation to desk reservations, floor plans, teams and workplace management in OperiX Desk.",
    product: "desk",
    category: "getting-started",
    slug: "about-operix-desk",
    order: 1,
    tags: ["desk", "workplace", "getting started"],
    keywords: ["desk reservation", "floor plan", "workspace"],
    lastUpdated: "2026-08-01",
    readingTime: "2 min",
    featured: true,
    blocks: [
      h("overview", "Overview"),
      p("OperiX Desk helps teams understand and reserve workplace resources. The documentation hierarchy covers desk reservations, floor plans, colleagues, resources, workspace management and analytics."),
      h("documentation-areas", "Documentation areas"),
      list(["Reserving a desk and managing reservations", "Floor plans and the floor builder", "Teams and finding colleagues", "Resources and workspace management", "Analytics, mobile app and settings"]),
      callout("note", "Detailed workplace workflows and screenshots will be added after they are approved for publication."),
    ],
  }),
  commonArticle({
    id: "about-operix-control",
    translationId: "about-operix-control",
    locale: "en",
    title: "About OperiX Control",
    description: "An orientation to organization management, applications, roles, security and settings in OperiX Control.",
    product: "control",
    category: "getting-started",
    slug: "about-operix-control",
    order: 1,
    tags: ["control", "organization", "security"],
    keywords: ["users", "roles", "permissions", "applications", "audit log"],
    lastUpdated: "2026-08-01",
    readingTime: "2 min",
    featured: true,
    blocks: [
      h("overview", "Overview"),
      p("OperiX Control is the shared administration surface for organizations, users, applications, permissions, security and usage. This starter page gives the documentation a stable home while detailed administrator guides are prepared."),
      h("documentation-areas", "Documentation areas"),
      list(["Organization, users and teams", "Roles and permissions", "Applications and integrations", "Billing and usage", "Security and audit logs", "API, webhooks, data and settings"]),
      callout("warning", "Do not use this starter page as an operational security procedure. Verified security guidance will be published separately."),
    ],
  }),
  commonArticle({
    id: "api-documentation-coming-later",
    translationId: "api-documentation-coming-later",
    locale: "en",
    title: "API Documentation — Coming Later",
    description: "The OperiX developer documentation framework is ready for verified API references and examples.",
    product: "control",
    category: "api-and-webhooks",
    slug: "api-documentation-coming-later",
    order: 1,
    tags: ["api", "developers", "webhooks"],
    keywords: ["api reference", "authentication", "sdk", "webhooks"],
    lastUpdated: "2026-08-01",
    readingTime: "1 min",
    blocks: [
      h("framework-ready", "Framework ready"),
      p("OperiX for Developers has a dedicated route structure for authentication, product API references, webhooks, errors, SDKs and examples. Verified endpoints and code samples will be added when the public API contract is available."),
      callout("note", "No production endpoints, credentials or request behavior are invented in this starter content."),
      h("future-sections", "Future sections"),
      list(["Authentication and scopes", "Invoice, HR, Booking and Desk references", "Webhook events and signature verification", "Errors, rate limits and SDKs"]),
    ],
  }),
  commonArticle({
    id: "welcome-to-operix-sq",
    translationId: "welcome-to-operix",
    locale: "sq",
    title: "Mirë se vini në OperiX",
    description: "Një pikënisje për llogarinë, organizatën dhe aplikacionet tuaja OperiX.",
    product: "suite",
    category: "getting-started",
    slug: "welcome-to-operix",
    order: 1,
    tags: ["fillimi", "llogaria", "organizata"],
    keywords: ["llogaria OperiX", "suite", "fillo"],
    lastUpdated: "2026-08-01",
    readingTime: "3 min",
    featured: true,
    blocks: [
      h("overview", "Përmbledhje"),
      p("OperiX bashkon mjetet që organizata juaj përdor çdo ditë në një suitë të lidhur. Kjo Qendër Ndihme shpjegon fillimisht konceptet e përbashkëta dhe më pas udhëzimet për çdo aplikacion."),
      callout("tip", "Filloni me llogarinë dhe organizatën përpara se të konfiguroni një aplikacion të veçantë OperiX."),
      h("where-to-begin", "Ku të filloni"),
      list(["Krijoni ose bashkohuni me llogarinë tuaj OperiX.", "Krijoni një organizatë dhe ftoni ekipin tuaj.", "Zgjidhni aplikacionet OperiX që ju nevojiten.", "Mësoni si funksionojnë rolet, lejet dhe ndërrimi i aplikacioneve."], true),
      callout("note", "Veçoritë dhe lejet mund të varen nga organizata dhe plani juaj OperiX."),
    ],
    related: ["about-operix-invoice"],
  }),
  commonArticle({
    id: "draft-preview-example",
    locale: "en",
    title: "Draft Preview Example",
    description: "Internal draft used to verify that unpublished documentation stays out of production.",
    product: "suite",
    category: "getting-started",
    slug: "draft-preview-example",
    order: 99,
    tags: ["draft"],
    keywords: ["preview"],
    lastUpdated: "2026-08-01",
    readingTime: "1 min",
    draft: true,
    blocks: [p("This draft is not public.")],
  }),
];

export function getArticle(locale: Locale, product: ProductKey, category: string, slug: string) {
  return articles.find((article) => article.locale === locale && article.product === product && article.category === category && article.slug === slug);
}

export function getPublishedArticle(locale: Locale, product: ProductKey, category: string, slug: string) {
  const exact = getArticle(locale, product, category, slug);
  if (exact && isVisible(exact)) return { article: exact, isFallback: false };
  if (locale !== "en") {
    const fallback = getArticle("en", product, category, slug);
    if (fallback && isVisible(fallback)) return { article: fallback, isFallback: true };
  }
  return { article: undefined, isFallback: false };
}

export function getPublishedArticles(locale: Locale, product?: ProductKey, category?: string) {
  const localized = articles.filter((article) => article.locale === locale && isVisible(article));
  const localizedKeys = new Set(localized.map((article) => `${article.product}:${article.category}:${article.slug}`));
  const fallback = locale === "en" ? [] : articles.filter((article) => article.locale === "en" && isVisible(article) && !localizedKeys.has(`${article.product}:${article.category}:${article.slug}`));
  return [...localized, ...fallback]
    .filter((article) => (product ? article.product === product : true))
    .filter((article) => (category ? article.category === category : true))
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

export function getArticleById(id: string, locale: Locale = "en") {
  return articles.find((article) => article.locale === locale && article.id === id && isVisible(article))
    ?? articles.find((article) => article.locale === "en" && article.id === id && isVisible(article));
}

export function getArticleDateLabel(article: Article, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "sq" ? "sq-AL" : "en-US", { month: "short", year: "numeric" }).format(new Date(`${article.lastUpdated}T12:00:00Z`));
}
