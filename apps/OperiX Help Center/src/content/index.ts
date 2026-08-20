import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { articles } from "./articles";
import { productDefinitions } from "./products";

const publicRoots = [resolve(process.cwd(), "public"), resolve(process.cwd(), "apps/OperiX Help Center/public")];
const publicRoot = publicRoots.find((root) => existsSync(root));

function validateContent() {
  const articleIds = new Set<string>();
  const articleKeys = new Set<string>();
  const categoryOrders = new Map<string, Set<number>>();

  for (const article of articles) {
    if (!article.id || !article.title.trim() || !article.description.trim()) {
      throw new Error(`Invalid documentation metadata for article ${article.id || "<missing id>"}`);
    }
    if (articleIds.has(`${article.locale}:${article.id}`)) {
      throw new Error(`Duplicate article id: ${article.locale}:${article.id}`);
    }
    articleIds.add(`${article.locale}:${article.id}`);
    const key = `${article.locale}:${article.product}:${article.category}:${article.slug}`;
    if (articleKeys.has(key)) throw new Error(`Duplicate article route: ${key}`);
    articleKeys.add(key);
    const orderKey = `${article.locale}:${article.product}:${article.category}`;
    const orders = categoryOrders.get(orderKey) ?? new Set<number>();
    if (orders.has(article.order)) throw new Error(`Duplicate article order ${article.order} in ${orderKey}`);
    orders.add(article.order);
    categoryOrders.set(orderKey, orders);
    const product = productDefinitions.find((item) => item.key === article.product);
    if (!product?.categories.some((category) => category.slug === article.category)) {
      throw new Error(`Unknown documentation category: ${article.product}/${article.category} (${article.id})`);
    }
    const headingIds = new Set<string>();
    for (const block of article.blocks) {
      if (block.type === "heading") {
        if (headingIds.has(block.id)) throw new Error(`Duplicate heading id ${block.id} in ${article.id}`);
        headingIds.add(block.id);
      }
      if (block.type === "screenshot" && block.src) {
        if (!block.src.startsWith("/")) throw new Error(`Screenshot sources must be local paths: ${article.id}`);
        if (publicRoot && !existsSync(resolve(publicRoot, block.src.slice(1)))) throw new Error(`Missing screenshot ${block.src} in ${article.id}`);
      }
      if (block.type === "link-card" && !block.href.startsWith("/") && !/^https?:\/\//.test(block.href)) {
        throw new Error(`Invalid link-card URL ${block.href} in ${article.id}`);
      }
    }
    for (const relatedId of article.related ?? []) {
      const relatedExists = articles.some((candidate) => candidate.id === relatedId && candidate.locale === article.locale && !candidate.draft)
        || articles.some((candidate) => candidate.id === relatedId && candidate.locale === "en" && !candidate.draft);
      if (!relatedExists) throw new Error(`Missing related article ${relatedId} in ${article.id}`);
    }
  }

  for (const product of productDefinitions) {
    const categorySlugs = new Set<string>();
    const categoryOrdersForProduct = new Set<number>();
    for (const category of product.categories) {
      if (categorySlugs.has(category.slug)) throw new Error(`Duplicate category slug ${product.key}/${category.slug}`);
      if (categoryOrdersForProduct.has(category.order)) throw new Error(`Duplicate category order ${product.key}/${category.order}`);
      categorySlugs.add(category.slug);
      categoryOrdersForProduct.add(category.order);
    }
  }
}

validateContent();

export { articles };
