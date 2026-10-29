#!/usr/bin/env node
// Lists interface text that is still in English when Albanian is selected. Seeds a little data first so
// screens with rows, forms and dialogs are visited too.
import fs from 'node:fs';
import * as pw from '@playwright/test';
const base = 'http://127.0.0.1:3100'; const mock = 'http://127.0.0.1:55321';
const session = await (await fetch(`${mock}/__qa/session`)).json();
const browser = await pw.chromium.launch({ args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([{ name: 'sb-invoice-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, domain: '127.0.0.1', path: '/' }]);
const lang = process.argv.includes('--en') ? 'en' : 'sq';
await context.addInitScript((l) => { try { localStorage.setItem('operix.storageMode', 'local'); localStorage.setItem('operix.uiLanguage', l); } catch {} }, lang);
const page = await context.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
const found = new Map();
async function collect(label) {
  await page.waitForTimeout(900);
  const items = await page.evaluate(() => {
    const out = [];
    const skip = (el) => el.closest('script,style,textarea,code,pre,.document-scale-frame,.invoice-template-preview,.receipt-doc,[data-no-translate]');
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n; while ((n = walker.nextNode())) { const el = n.parentElement; if (!el || skip(el)) continue; const t = n.data.replace(/\s+/g, ' ').trim(); if (t) out.push(t); }
    for (const el of document.querySelectorAll('[placeholder],[title],[aria-label]')) { if (skip(el)) continue; for (const a of ['placeholder', 'title', 'aria-label']) { const v = el.getAttribute(a); if (v) out.push(v); } }
    return out;
  });
  for (const text of items) if (/[A-Za-z]{3}/.test(text)) { if (!found.has(text)) found.set(text, label); }
}
async function visit(url, label = url, after) {
  try { await page.goto(`${base}${url}`, { waitUntil: 'networkidle', timeout: 45000 }); } catch { console.log('slow', url); }
  if (after) { try { await after(); } catch (e) { console.log('step failed', label, String(e).slice(0, 80)); } }
  await collect(label);
}
// seed
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
const invoiceUrl = new URL(page.url()).pathname;
await collect('invoice detail');
await visit(`${invoiceUrl}`, 'invoice detail');
const routes = ['/dashboard', '/pos', '/invoices', '/quotes', '/contracts', '/payments', '/customers', '/products', '/expenses', '/income', '/vendors', '/supplier-bills', '/vendor-payments', '/cash-bank', '/accounting', '/payroll', '/reports', '/tax-reports', '/help', '/sales', '/business', '/more', '/portal-links', '/recurring', '/reminders', '/offline',
  '/settings?tab=profile', '/settings?tab=appearance', '/settings?tab=company', '/settings?tab=general', '/settings?tab=templates', '/settings?tab=branches', '/settings?tab=payments', '/settings?tab=email', '/settings?tab=storage', '/settings?tab=data-transfer', '/settings?tab=compliance', '/settings?tab=billing', '/settings?tab=developers', '/settings?tab=users-access',
  `/invoices/new?documentType=INVOICE&edit=x`, '/invoices/new?documentType=QUOTE', '/invoices/new?documentType=DELIVERY_NOTE'];
for (const r of routes) await visit(r);
// dialogs
for (const r of ['/customers', '/products', '/expenses', '/vendors', '/supplier-bills', '/vendor-payments', '/contracts', '/payments']) await visit(`${r}?create=1`, `${r} (form)`);
await visit('/pos', 'pos cart', async () => { await page.locator('button:has-text("Seed Widget")').first().click(); await page.waitForTimeout(500); });
await visit('/payroll', 'payroll employees', async () => { await page.locator('button:has-text("Employees"), button:has-text("Punonjësit")').first().click(); await page.locator('button:has-text("Add employee"), button:has-text("Shto punonjës")').first().click(); });
await visit('/settings?tab=branches', 'branch form', async () => { await page.locator('button:has-text("Add branch"), button:has-text("Shto degë")').first().click(); await page.locator('button:has-text("Add bank account"), button:has-text("Shto llogari bankare")').first().click(); });
await visit('/login', 'login (signed in redirects)');
const list = [...found.entries()];
fs.writeFileSync(`/tmp/claude-0/i18n/crawl-${lang}.json`, JSON.stringify(list, null, 1));
console.log(lang, 'texts:', list.length);
await browser.close();
