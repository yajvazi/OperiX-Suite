import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getProduct } from "../content/products";
import type { Locale, ProductKey } from "../content/types";
import { getPublicArticles } from "../lib/content";
import { docsPath } from "../lib/paths";
import { Icon } from "./icons";

export interface NavigationGroup {
  label: string;
  href: string;
  active?: boolean;
  children?: Array<{ label: string; href: string; active?: boolean }>;
}

export function buildNavigationGroups(locale: Locale, product?: ProductKey, currentCategory?: string, currentSlug?: string): NavigationGroup[] {
  if (!product) {
    return [
      { label: "Getting Started", href: docsPath(locale, "suite", "getting-started") },
      ...(["suite", "control", "invoice", "hr", "booking", "desk"] as ProductKey[]).map((key) => {
        const item = getProduct(key)!;
        return { label: item.name, href: docsPath(locale, key), children: [] };
      }),
      { label: "API & Developers", href: `/${locale}/api` },
      { label: "FAQs", href: `/${locale}/faq` },
      { label: "Troubleshooting", href: `/${locale}/troubleshooting` },
    ];
  }
  const selected = getProduct(product);
  if (!selected) return [];
  return selected.categories.map((category) => {
    const categoryArticles = getPublicArticles(locale, product, category.slug);
    return {
      label: category.name,
      href: docsPath(locale, product, category.slug),
      active: currentCategory === category.slug,
      children: categoryArticles.map((article) => ({ label: article.title, href: docsPath(locale, article.product, article.category, article.slug), active: currentSlug === article.slug })),
    };
  });
}

export function DocsSidebar({ locale, product, currentCategory, currentSlug }: { locale: Locale; product?: ProductKey; currentCategory?: string; currentSlug?: string }) {
  const groups = buildNavigationGroups(locale, product, currentCategory, currentSlug);
  const productDefinition = product ? getProduct(product) : undefined;
  return <aside className="docs-sidebar" aria-label="Documentation navigation">
    <div className="sidebar-title"><span>{productDefinition?.name ?? "Documentation"}</span><Icon name="book-open" size={16} /></div>
    <nav>{groups.map((group) => <div className={`sidebar-group ${group.active ? "is-active" : ""}`} key={group.href}>
      <Link className="sidebar-group-link" href={group.href}><span>{group.label}</span><ChevronRight size={14} /></Link>
      {group.children?.length ? <div className="sidebar-children">{group.children.map((child) => <Link className={child.active ? "is-active" : ""} href={child.href} key={child.href}>{child.label}</Link>)}</div> : null}
    </div>)}</nav>
  </aside>;
}

export function MobileDocsNavigation({ locale, product, currentCategory, currentSlug }: { locale: Locale; product?: ProductKey; currentCategory?: string; currentSlug?: string }) {
  const groups = buildNavigationGroups(locale, product, currentCategory, currentSlug);
  return <MobileDocsNavigationClient locale={locale} groups={groups} productName={getProduct(product ?? "suite")?.name ?? "Documentation"} />;
}

export function ArticleToc({ headings, label }: { headings: Array<{ id: string; text: string; level: 2 | 3 }>; label: string }) {
  return <aside className="article-toc" aria-label={label}><p>{label}</p><nav>{headings.map((heading) => <a className={heading.level === 3 ? "toc-sub" : ""} href={`#${heading.id}`} key={heading.id}>{heading.text}</a>)}</nav></aside>;
}

function MobileDocsNavigationClient({ locale, groups, productName }: { locale: Locale; groups: NavigationGroup[]; productName: string }) {
  return <MobileDocsNavigationInner locale={locale} groups={groups} productName={productName} />;
}

// Kept as a separate client boundary so the sidebar itself stays server-rendered.
function MobileDocsNavigationInner({ locale, groups, productName }: { locale: Locale; groups: NavigationGroup[]; productName: string }) {
  return <MobileDocsNavRuntime locale={locale} groups={groups} productName={productName} />;
}

import { MobileDocsNavRuntime } from "./mobile-docs-navigation";
