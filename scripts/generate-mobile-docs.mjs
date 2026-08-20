import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const DOCS_ROOT = path.join(REPO_ROOT, 'docs', 'mobile');
const USER_LANGUAGES = ['en', 'sq'];
const METADATA_PATH = path.join(DOCS_ROOT, 'article-metadata.json');
const OUTPUT_PATH = path.join(REPO_ROOT, 'apps', 'OperiX Invoice', 'OperiX Invoice Mobile', 'src', 'generated', 'mobileDocs.ts');

function fail(message) {
  throw new Error(`[mobile-docs] ${message}`);
}

function listMarkdownFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return listMarkdownFiles(absolute);
    return entry.isFile() && entry.name.endsWith('.md') ? [absolute] : [];
  });
}

function parseFrontmatter(source, filePath) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  if (lines[0] !== '---') fail(`${path.relative(REPO_ROOT, filePath)} must start with frontmatter`);
  const end = lines.indexOf('---', 1);
  if (end < 0) fail(`${path.relative(REPO_ROOT, filePath)} has unterminated frontmatter`);
  const values = {};
  let arrayKey = null;
  for (const line of lines.slice(1, end)) {
    if (/^\s*-\s+/.test(line) && arrayKey) {
      values[arrayKey] ||= [];
      values[arrayKey].push(line.replace(/^\s*-\s+/, '').trim().replace(/^['"]|['"]$/g, ''));
      continue;
    }
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (rawValue.trim() === '') {
      arrayKey = key;
      values[key] = [];
      continue;
    }
    arrayKey = null;
    values[key] = rawValue.trim().replace(/^['"]|['"]$/g, '');
  }
  return { values, body: lines.slice(end + 1).join('\n') };
}

function articleIdFromRelative(relativePath) {
  const normalized = relativePath.split(path.sep).join('/');
  if (normalized === 'README.md') return 'mobile-guide';
  if (normalized.endsWith('/README.md')) return normalized.slice(0, -'/README.md'.length);
  return normalized.slice(0, -'.md'.length);
}

function cleanBody(body) {
  return body
    .replace(/^\s*(?:Language|Gjuha):.*\n?/mi, '')
    .replace(/^\s*\n/, '')
    .trim();
}

function resolveArticleLink(sourceFile, href, language) {
  const [withoutHash] = href.split('#');
  if (!withoutHash.endsWith('.md')) return null;
  const absoluteTarget = path.resolve(path.dirname(sourceFile), withoutHash);
  const languageRoot = path.join(DOCS_ROOT, language);
  const relative = path.relative(languageRoot, absoluteTarget).split(path.sep).join('/');
  if (relative.startsWith('../') || relative === '') return null;
  return articleIdFromRelative(relative);
}

function extractLinks(body, sourceFile, language) {
  const links = [];
  const seen = new Set();
  const expression = /\[([^\]]+)\]\(([^)]+)\)/g;
  for (const match of body.matchAll(expression)) {
    const [, text, href] = match;
    const key = `${text}\u0000${href}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ text, href, targetId: resolveArticleLink(sourceFile, href, language) });
  }
  return links;
}

function normalizeArticleStatus(value) {
  const allowed = new Set(['production', 'partial', 'experimental', 'development', 'internal', 'disabled', 'broken']);
  return allowed.has(value) ? value : 'production';
}

function loadArticles(metadata) {
  const byLanguage = new Map();
  for (const language of USER_LANGUAGES) {
    const languageRoot = path.join(DOCS_ROOT, language);
    const articles = new Map();
    for (const filePath of listMarkdownFiles(languageRoot)) {
      const relative = path.relative(languageRoot, filePath);
      const id = articleIdFromRelative(relative);
      if (articles.has(id)) fail(`duplicate article id ${id} in ${language}`);
      const parsed = parseFrontmatter(fs.readFileSync(filePath, 'utf8'), filePath);
      const { values } = parsed;
      if (values.language !== language) fail(`${path.relative(REPO_ROOT, filePath)} declares language ${values.language}, expected ${language}`);
      if (!values.title || !values.description || !values.category || !Array.isArray(values.keywords) || values.keywords.length === 0) {
        fail(`${path.relative(REPO_ROOT, filePath)} is missing title, description, category, or keywords`);
      }
      const body = cleanBody(parsed.body);
      articles.set(id, {
        id,
        language,
        category: values.category,
        title: values.title,
        description: values.description,
        keywords: values.keywords,
        content: body,
        links: extractLinks(body, filePath, language),
        app: metadata.app,
        status: normalizeArticleStatus(metadata.statusByArticle?.[id] || values.status || metadata.status),
        introducedIn: values.introducedIn || null,
        updatedIn: values.updatedIn || null,
        updatedAt: values.updatedAt || null,
      });
    }
    byLanguage.set(language, articles);
  }
  return byLanguage;
}

function validateAndBuild(metadata, byLanguage) {
  const english = byLanguage.get('en');
  const albanian = byLanguage.get('sq');
  const englishIds = [...english.keys()].sort();
  const albanianIds = [...albanian.keys()].sort();
  const missingSq = englishIds.filter((id) => !albanian.has(id));
  const missingEn = albanianIds.filter((id) => !english.has(id));
  if (missingSq.length || missingEn.length) fail(`language pairs differ; missing sq: ${missingSq.join(', ') || 'none'}; missing en: ${missingEn.join(', ') || 'none'}`);

  const categories = [...new Set([...english.values()].map((article) => article.category))];
  for (const category of categories) {
    if (!metadata.categories?.[category]) fail(`category ${category} is not defined in article-metadata.json`);
  }
  for (const category of Object.keys(metadata.categories || {})) {
    if (!categories.includes(category)) fail(`category ${category} is defined but has no user documentation`);
  }
  const allIds = new Set(englishIds);
  for (const id of metadata.popular || []) if (!allIds.has(id)) fail(`popular article ${id} does not exist`);
  for (const [id, related] of Object.entries(metadata.relatedArticles || {})) {
    if (!allIds.has(id)) fail(`related-article source ${id} does not exist`);
    for (const target of related) if (!allIds.has(target)) fail(`related article ${target} from ${id} does not exist`);
  }
  for (const language of USER_LANGUAGES) {
    for (const article of byLanguage.get(language).values()) {
      for (const link of article.links) {
        if (link.targetId && !allIds.has(link.targetId)) fail(`broken article link ${link.targetId} from ${language}/${article.id}`);
      }
    }
  }

  const categoriesOutput = Object.entries(metadata.categories)
    .map(([id, value]) => ({ id, title: value.title, icon: value.icon, order: value.order ?? 999 }))
    .sort((a, b) => a.order - b.order);
  const articles = [];
  for (const id of englishIds) {
    for (const language of USER_LANGUAGES) {
      const article = byLanguage.get(language).get(id);
      const relatedArticles = metadata.relatedArticles?.[id] || [];
      articles.push({ ...article, relatedArticles });
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    app: metadata.app,
    status: metadata.status,
    categories: categoriesOutput,
    popular: metadata.popular || [],
    articles,
  };
}

function renderTypeScript(index) {
  return `/* GENERATED FILE. Do not edit manually. Run: npm run docs:mobile:generate */\n\nexport type MobileDocLanguage = 'en' | 'sq';\nexport type MobileDocStatus = 'production' | 'partial' | 'experimental' | 'development' | 'internal' | 'disabled' | 'broken';\n\nexport type MobileDocLink = { text: string; href: string; targetId: string | null };\nexport type MobileDocArticle = {\n  id: string;\n  language: MobileDocLanguage;\n  category: string;\n  title: string;\n  description: string;\n  keywords: string[];\n  content: string;\n  links: MobileDocLink[];\n  relatedArticles: string[];\n  app: string;\n  status: MobileDocStatus;\n  introducedIn: string | null;\n  updatedIn: string | null;\n  updatedAt: string | null;\n};\n\nexport type MobileDocCategory = {\n  id: string;\n  title: { en: string; sq: string };\n  icon: string;\n  order: number;\n};\n\nexport const MOBILE_DOCS_GENERATED_AT = ${JSON.stringify(index.generatedAt)};\nexport const MOBILE_DOCS_APP = ${JSON.stringify(index.app)};\nexport const MOBILE_DOCS_STATUS = ${JSON.stringify(index.status)} as MobileDocStatus;\nexport const MOBILE_DOC_CATEGORIES: MobileDocCategory[] = ${JSON.stringify(index.categories, null, 2)};\nexport const MOBILE_DOC_POPULAR_IDS: string[] = ${JSON.stringify(index.popular, null, 2)};\nexport const MOBILE_DOC_ARTICLES: MobileDocArticle[] = ${JSON.stringify(index.articles, null, 2)};\n`;
}

export function buildMobileDocs({ write = true } = {}) {
  const metadata = JSON.parse(fs.readFileSync(METADATA_PATH, 'utf8'));
  const byLanguage = loadArticles(metadata);
  const index = validateAndBuild(metadata, byLanguage);
  if (write) {
    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, renderTypeScript(index));
  }
  return index;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    const index = buildMobileDocs({ write: true });
    const languages = new Set(index.articles.map((article) => article.language));
    console.log(`[mobile-docs] generated ${index.articles.length} localized articles (${index.articles.length / languages.size} logical articles) at ${path.relative(REPO_ROOT, OUTPUT_PATH)}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
