export type Locale = "en" | "sq";

export type Platform = "web" | "mobile";
export type ArticleStatus = "CURRENT" | "AUTO_UPDATED" | "REVIEW_REQUIRED" | "OUTDATED" | "MISSING" | "DEPRECATED";
export type DocumentationRisk = "low" | "medium" | "high" | "booking-critical" | "financial" | "legal" | "security" | "subscription" | "integration";

export type DocumentationPlatform = "web" | "mobile" | "both";
export type DocumentationStatus = "CURRENT" | "AUTO_UPDATED" | "REVIEW_REQUIRED" | "OUTDATED" | "MISSING" | "DEPRECATED";
/** "general" holds the shared getting-started guides and is not listed as a product. */
export type ProductKey = "general" | "invoice" | "booking";

export type IconName =
  | "book-open"
  | "briefcase"
  | "building"
  | "calendar"
  | "code"
  | "file-text"
  | "grid"
  | "headphones"
  | "help-circle"
  | "layout-grid"
  | "lock"
  | "map"
  | "megaphone"
  | "receipt"
  | "search"
  | "settings"
  | "shield"
  | "sliders"
  | "sparkles"
  | "troubleshoot"
  | "users"
  | "webhook";

export interface CategoryDefinition {
  slug: string;
  name: string;
  description?: string;
  order: number;
}

export interface ProductDefinition {
  key: ProductKey;
  name: string;
  description: string;
  icon: IconName;
  comingSoon?: boolean;
  hidden?: boolean;
  categories: CategoryDefinition[];
}

export interface HeadingBlock {
  type: "heading";
  id: string;
  level: 2 | 3;
  text: string;
}

export interface ParagraphBlock {
  type: "paragraph";
  text: string;
}

export interface ListBlock {
  type: "list";
  ordered?: boolean;
  items: string[];
}

export interface CalloutBlock {
  type: "callout";
  tone: "tip" | "note" | "warning" | "danger";
  title?: string;
  text: string;
}

export interface StepsBlock {
  type: "steps";
  id?: string;
  title?: string;
  items: Array<{ title: string; text?: string; screenshot?: ScreenshotBlock }>;
}

export interface ScreenshotBlock {
  type: "screenshot";
  src?: string;
  alt: string;
  caption: string;
  mobile?: boolean;
  screenshotId?: string;
  scenario?: string;
  annotations?: Array<{ number: string; label: string; description: string }>;
}

export interface VideoBlock {
  type: "video";
  provider: "youtube" | "vimeo" | "self-hosted";
  src: string;
  title: string;
}

export interface CodeBlock {
  type: "code";
  language: string;
  code: string;
  filename?: string;
}

export interface TableBlock {
  type: "table";
  headers: string[];
  rows: string[][];
}

export interface AccordionBlock {
  type: "accordion";
  items: Array<{ question: string; answer: string }>;
}

export interface TabsBlock {
  type: "tabs";
  tabs: Array<{ label: string; language?: string; code: string }>;
}

export interface LinkCardBlock {
  type: "link-card";
  title: string;
  description: string;
  href: string;
}

export type DocBlock =
  | HeadingBlock
  | ParagraphBlock
  | ListBlock
  | CalloutBlock
  | StepsBlock
  | ScreenshotBlock
  | VideoBlock
  | CodeBlock
  | TableBlock
  | AccordionBlock
  | TabsBlock
  | LinkCardBlock;

export interface Article {
  id: string;
  locale: Locale;
  title: string;
  description: string;
  product: ProductKey;
  category: string;
  slug: string;
  order: number;
  tags: string[];
  keywords: string[];
  lastUpdated: string;
  readingTime: string;
  draft: boolean;
  featured?: boolean;
  translationId?: string;
  featureId?: string;
  platforms?: Platform[];
  status?: ArticleStatus;
  riskLevel?: DocumentationRisk;
  documentation?: {
    lastVerifiedCommit?: string;
    lastDocumentationCommit?: string;
    lastScreenshotCommit?: string;
    lastAutomatedVerification?: string;
    latestRelevantApplicationCommit?: string;
    reviewStatus?: "approved" | "review_required" | "outdated" | "missing";
    screenshotIds?: string[];
  };
  blocks: DocBlock[];
  related?: string[];
  platform?: DocumentationPlatform;
  documentationStatus?: DocumentationStatus;
  requiredPermissions?: string[];
  lastVerifiedCommit?: string;
  lastScreenshotCommit?: string;
  latestRelevantApplicationCommit?: string;
  screenshotIds?: string[];
  visualGuide?: boolean;
  availableSince?: string;
}

export interface FaqItem {
  id: string;
  locale: Locale;
  category: string;
  question: string;
  answer: string;
  order: number;
}

export interface TroubleshootingCategory {
  slug: string;
  name: string;
  order: number;
}

export interface ReleaseNote {
  id: string;
  month: string;
  product: ProductKey;
  title: string;
  description: string;
  releaseDate: string;
  type: "new" | "improved" | "fixed" | "deprecated";
  /** Albanian wording of the month, title and description. */
  sq?: { month: string; title: string; description: string };
}

export interface ApiSection {
  slug: string;
  title: string;
  description: string;
  icon: IconName;
  order: number;
}
