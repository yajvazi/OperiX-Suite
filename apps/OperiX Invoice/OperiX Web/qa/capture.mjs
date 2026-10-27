#!/usr/bin/env node
// Visual QA: screenshots every screen at desktop and phone size and runs layout checks.
//   node qa/capture.mjs [--base http://127.0.0.1:3100] [--mock http://127.0.0.1:55321]
//        [--only dashboard,invoices] [--viewports desktop,laptop,tablet,phone] [--theme light|dark]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i === -1 ? fallback : process.argv[i + 1]; };
const base = arg('base', 'http://127.0.0.1:3100');
const mock = arg('mock', 'http://127.0.0.1:55321');
const only = arg('only', '')?.split(',').filter(Boolean);
const theme = arg('theme', 'light');
const outRoot = path.join(here, 'out', 'shots', theme);
// Phone widths (<= 767px) are redirected to the mobile app by MobileWebGate, so the responsive range
// that matters is tablet and up. "phone" is only useful for the routes the gate allows (login, portal...).
const viewports = { desktop: { width: 1440, height: 900 }, laptop: { width: 1180, height: 760 }, tablet: { width: 820, height: 1180 }, phone: { width: 390, height: 844 } };
const wanted = arg('viewports', 'desktop,laptop,tablet').split(',');

export const PAGES = [
  ['login', '/login', false], ['dashboard', '/dashboard'], ['invoices', '/invoices'], ['invoice-new', '/invoices/new'], ['invoice-detail', '/invoices/66666666-0000-4000-8000-000000000005'],
  ['quote-new', '/invoices/new?type=offer'], ['quotes', '/quotes'], ['sales', '/sales'], ['customers', '/customers'], ['payments', '/payments'], ['contracts', '/contracts'],
  ['business', '/business'], ['products', '/products'], ['inventory', '/inventory'], ['expenses', '/expenses'], ['vendors', '/vendors'], ['supplier-bills', '/supplier-bills'], ['vendor-payments', '/vendor-payments'], ['income', '/income'],
  ['cash-bank', '/cash-bank'], ['accounting', '/accounting'], ['reports', '/reports'], ['payroll', '/payroll'], ['management', '/management'],
  ['settings', '/settings'], ['settings-company', '/settings?tab=company'], ['settings-templates', '/settings?tab=templates'], ['settings-team', '/settings?tab=team'], ['settings-payments', '/settings?tab=payments'],
  ['settings-developers', '/settings?tab=developers'], ['settings-billing', '/settings?tab=billing'], ['settings-compliance', '/settings?tab=compliance'],
  ['pos', '/pos'], ['more', '/more'], ['help', '/help'], ['portal-links', '/portal-links'], ['recurring', '/recurring'], ['reminders', '/reminders'], ['payment-links', '/payment-links'],
];

async function sessionCookie() {
  const session = await (await fetch(`${mock}/__qa/session`)).json();
  return `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
}

// Runs inside the page: returns layout problems worth a human look.
const auditPage = () => {
  const problems = [];
  const vw = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > vw + 1) problems.push(`page scrolls horizontally (${document.documentElement.scrollWidth}px > ${vw}px)`);
  const describe = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}` : ''}${el.textContent ? ` "${el.textContent.trim().replace(/\s+/g, ' ').slice(0, 30)}"` : ''}`;
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || el.closest('[hidden]') || el.closest('.sr-only') || el.classList.contains('sr-only') || el.closest('nextjs-portal')) continue;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    if (rect.right > vw + 1 && rect.left < vw && !el.closest('[data-scroll], .overflow-x-auto, .table-wrap, table')) {
      const key = describe(el); if (!seen.has(key)) { seen.add(key); problems.push(`extends past the right edge by ${Math.round(rect.right - vw)}px: ${key}`); }
    }
    if ((style.overflow === 'hidden' || style.textOverflow === 'ellipsis') && el.scrollWidth > el.clientWidth + 2 && el.children.length === 0 && style.textOverflow !== 'ellipsis' && el.textContent.trim()) {
      const key = `clipped: ${describe(el)}`; if (!seen.has(key)) { seen.add(key); problems.push(`text is clipped: ${describe(el)}`); }
    }
    if (el.tagName === 'IMG' && el.complete && el.naturalWidth === 0) problems.push(`broken image: ${el.getAttribute('src')}`);
    if ((el.tagName === 'BUTTON' || el.tagName === 'A') && rect.height < 24 && rect.width < 24 && el.textContent.trim().length === 0 && !el.querySelector('svg, img')) problems.push(`empty tiny control: ${describe(el)}`);
  }
  return problems.slice(0, 25);
};

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const cookie = await sessionCookie();
const report = {};
for (const viewportName of wanted) {
  const viewport = viewports[viewportName];
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: theme === 'dark' ? 'dark' : 'light' });
  const url = new URL(base);
  await context.addCookies([{ name: 'sb-invoice-auth-token', value: cookie, domain: url.hostname, path: '/', httpOnly: false, sameSite: 'Lax' }]);
  await context.addInitScript((value) => { try { localStorage.setItem('operix-theme', value); localStorage.setItem('theme', value); } catch { /* ignore */ } }, theme);
  for (const [name, route, auth = true] of PAGES) {
    if (only.length && !only.includes(name)) continue;
    const page = await context.newPage();
    const errors = []; const failed = [];
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 200)); });
    page.on('pageerror', (error) => errors.push(`pageerror: ${String(error).slice(0, 200)}`));
    page.on('response', (response) => { if (response.status() >= 400 && !response.url().includes('/_next/')) failed.push(`${response.status()} ${response.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 110)}`); });
    if (!auth) await context.clearCookies();
    try {
      await page.goto(`${base}${route}`, { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForTimeout(700);
      const finalPath = new URL(page.url()).pathname + new URL(page.url()).search;
      const problems = await page.evaluate(auditPage);
      fs.mkdirSync(path.join(outRoot, viewportName), { recursive: true });
      await page.addStyleTag({ content: 'nextjs-portal, [data-nextjs-toast], [data-next-badge-root] { display: none !important; }' });
      await page.screenshot({ path: path.join(outRoot, viewportName, `${name}.png`) });
      await page.screenshot({ path: path.join(outRoot, viewportName, `${name}.full.png`), fullPage: true });
      report[`${viewportName}/${name}`] = { route, finalPath: finalPath === route ? undefined : finalPath, problems, errors: [...new Set(errors)].slice(0, 6), failed: [...new Set(failed)].slice(0, 6) };
    } catch (error) {
      report[`${viewportName}/${name}`] = { route, fatal: String(error).slice(0, 200) };
    }
    await page.close();
    if (!auth) await context.addCookies([{ name: 'sb-invoice-auth-token', value: cookie, domain: url.hostname, path: '/', httpOnly: false, sameSite: 'Lax' }]);
  }
  await context.close();
}
await browser.close();
fs.mkdirSync(path.join(here, 'out'), { recursive: true });
fs.writeFileSync(path.join(here, 'out', `report-${theme}.json`), JSON.stringify(report, null, 2));
let flagged = 0;
for (const [key, value] of Object.entries(report)) {
  const issues = (value.problems?.length || 0) + (value.errors?.length || 0) + (value.failed?.length || 0) + (value.fatal ? 1 : 0);
  if (issues) { flagged += 1; console.log(`\n${key}  (${value.route}${value.finalPath ? ` → ${value.finalPath}` : ''})`); for (const p of value.problems || []) console.log(`  layout: ${p}`); for (const e of value.errors || []) console.log(`  console: ${e}`); for (const f of value.failed || []) console.log(`  request: ${f}`); if (value.fatal) console.log(`  FATAL: ${value.fatal}`); }
}
console.log(`\n${Object.keys(report).length} screens captured, ${flagged} with findings. Screenshots: ${outRoot}`);
