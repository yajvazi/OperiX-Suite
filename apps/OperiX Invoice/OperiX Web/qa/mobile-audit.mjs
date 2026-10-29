#!/usr/bin/env node
// Phone-width audit: for every page, reports horizontal overflow and lopsided side gutters (content that is
// closer to one edge than the other), and saves a screenshot.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as pw from '@playwright/test';
const here = path.dirname(fileURLToPath(import.meta.url));
const base = 'http://127.0.0.1:3100'; const mock = 'http://127.0.0.1:55321';
const width = Number(process.argv.includes('--width') ? process.argv[process.argv.indexOf('--width') + 1] : 390);
const out = path.join(here, 'out', 'mobile'); fs.mkdirSync(out, { recursive: true });
const session = await (await fetch(`${mock}/__qa/session`)).json();
const browser = await pw.chromium.launch({ args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await context.addCookies([{ name: 'sb-invoice-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, domain: '127.0.0.1', path: '/' }]);
await context.addInitScript(() => { try { localStorage.setItem('operix.storageMode', 'local'); localStorage.setItem('operix.uiLanguage', 'en'); } catch {} });
const page = await context.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 100)));

async function seed() {
  await page.goto(`${base}/customers?create=1`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.resource-modal', { timeout: 30000 });
  await page.locator('.resource-modal input[name="name"]').fill('Seed Customer');
  await page.locator('.resource-modal button.btn-primary').first().click();
  await page.waitForSelector('.resource-modal', { state: 'detached', timeout: 15000 });
  await page.goto(`${base}/products?create=1`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.resource-modal', { timeout: 30000 });
  await page.locator('.resource-modal input[name="name"]').fill('Seed Widget'); await page.locator('.resource-modal input[name="unit_price"]').fill('10');
  await page.locator('.resource-modal button.btn-primary').first().click();
  await page.waitForSelector('.resource-modal', { state: 'detached', timeout: 15000 });
  await page.goto(`${base}/invoices/new?documentType=INVOICE`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="invoice.customer"]', { timeout: 30000 });
  await page.selectOption('[data-testid="invoice.customer"]', { label: 'Seed Customer' });
  await page.locator('table tbody tr').first().locator('input[type="text"], input:not([type])').first().fill('Consulting');
  await page.locator('table tbody tr').first().locator('input[type="number"]').nth(1).fill('100');
  await page.locator('[data-testid="invoice.create-side"]').click();
  await page.waitForURL(/\/invoices\/[0-9a-f-]{36}/, { timeout: 20000 });
  return new URL(page.url()).pathname;
}
await page.setViewportSize({ width: 1440, height: 900 });
const invoicePath = await seed();
await page.setViewportSize({ width, height: 844 });
const routes = ['/dashboard', '/pos', '/invoices', invoicePath, '/invoices/new?documentType=INVOICE', '/quotes', '/contracts', '/payments', '/customers', '/products', '/expenses', '/income', '/vendors', '/supplier-bills', '/vendor-payments', '/cash-bank', '/accounting', '/payroll', '/reports', '/tax-reports', '/help', '/sales', '/business', '/more', '/portal-links', '/recurring', '/reminders',
  '/settings?tab=profile', '/settings?tab=appearance', '/settings?tab=company', '/settings?tab=general', '/settings?tab=templates', '/settings?tab=branches', '/settings?tab=payments', '/settings?tab=email', '/settings?tab=storage', '/settings?tab=data-transfer', '/settings?tab=billing', '/settings?tab=developers', '/settings?tab=users-access',
  '/customers?create=1', '/products?create=1', '/expenses?create=1', '/payments?create=1', '/login'];
const report = [];
for (const route of routes) {
  try { await page.goto(`${base}${route}`, { waitUntil: 'networkidle', timeout: 45000 }); } catch { /* slow page, measure anyway */ }
  await page.waitForTimeout(1200);
  const metrics = await page.evaluate((viewport) => {
    const doc = document.documentElement;
    const overflow = Math.max(doc.scrollWidth, document.body.scrollWidth) - viewport;
    const offenders = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const style = getComputedStyle(el);
      if (style.position === 'fixed' || style.visibility === 'hidden' || style.display === 'none') continue;
      if (el.closest('.help-hero, .table-wrap, .reports-table-wrap, .overflow-x-auto, [class*="scroll"], table, .operix-shared-sidebar, aside')) continue;
      if (r.right > viewport + 1 || r.left < -1) offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} ${Math.round(r.left)}→${Math.round(r.right)}`);
    }
    // gutters: the page title and the cards/sections of the page body (excluding the shell: header, nav, banners)
    const body = [...document.querySelectorAll('main *, .ux-page *, .operix-page *')].filter((el) => {
      const q = el.getBoundingClientRect(); const st = getComputedStyle(el);
      return q.width > viewport * 0.6 && q.width < viewport && q.height > 24 && st.position !== 'fixed' && !el.closest('header, nav, [role="status"], [role="alert"], .operix-shared-topbar-slot, .app-mobile-nav, .resource-modal');
    });
    const h1 = document.querySelector('h1');
    const lefts = body.map((el) => Math.round(el.getBoundingClientRect().left)); const rights = body.map((el) => Math.round(viewport - el.getBoundingClientRect().right));
    const title = h1 ? Math.round(h1.getBoundingClientRect().left) : null;
    const main = document.querySelector('main, .ux-page');
    const rect = (main || document.body).getBoundingClientRect();
    return { overflow, offenders: offenders.slice(0, 6), title, gutterL: lefts.length ? Math.min(...lefts) : null, gutterR: rights.length ? Math.min(...rights) : null };
  }, width);
  const file = route.replace(/[^a-z0-9]+/gi, '_').slice(0, 60) || 'root';
  await page.screenshot({ path: path.join(out, `${file}.png`), fullPage: true });
  const asym = (metrics.gutterL !== null && metrics.gutterR !== null && Math.abs(metrics.gutterL - metrics.gutterR) > 2) || (metrics.title !== null && metrics.gutterL !== null && Math.abs(metrics.title - metrics.gutterL) > 2) || (metrics.gutterL !== null && Math.abs(metrics.gutterL - 16) > 2);
  report.push({ route, ...metrics, asym });
  console.log(`${metrics.overflow > 1 || asym || metrics.offenders.length ? 'ISSUE' : 'ok   '} ${route}  overflow=${metrics.overflow} title=${metrics.title} gutters L=${metrics.gutterL} R=${metrics.gutterR} ${metrics.offenders.join(' | ')}`);
}
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
await browser.close();
