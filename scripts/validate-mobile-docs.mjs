import { buildMobileDocs } from './generate-mobile-docs.mjs';

try {
  const index = buildMobileDocs({ write: false });
  const english = index.articles.filter((article) => article.language === 'en').length;
  const albanian = index.articles.filter((article) => article.language === 'sq').length;
  console.log(`[mobile-docs] valid: ${english} English articles, ${albanian} Albanian articles, ${index.categories.length} categories`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
