#!/usr/bin/env node
// Verifies that "new invoice/quote" routes land on the POS and the editor still opens for edits.
import { chromium } from '@playwright/test';
const base = 'http://127.0.0.1:3100'; const mock = 'http://127.0.0.1:55321';
const session = await (await fetch(`${mock}/__qa/session`)).json();
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([{ name: 'sb-invoice-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, domain: '127.0.0.1', path: '/' }]);
const page = await context.newPage();
for (const route of ['/invoices/new', '/invoices/new?type=offer', '/invoices/new?documentType=CREDIT_NOTE', '/invoices/new?edit=66666666-0000-4000-8000-000000000019']) {
  await page.goto(base + route, { waitUntil: 'networkidle' });
  console.log(route.padEnd(60), '->', page.url().replace(base, ''), '|', await page.locator('h1, h2').first().textContent().catch(() => ''));
}
await page.goto(base + '/pos?type=offer', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
console.log('pos?type=offer heading:', (await page.locator('.pos-page h2').first().textContent({ timeout: 8000 }).catch(() => 'n/a')));
await page.screenshot({ path: 'qa/out/interact/pos-offer.png' });
for (const route of ['/invoices', '/dashboard']) {
  await page.goto(base + route, { waitUntil: 'networkidle' });
  const hrefs = await page.$$eval('a', (as) => as.map((a) => a.getAttribute('href')).filter((h) => h && /invoices\/new|\/pos/.test(h)));
  console.log(route, 'links:', [...new Set(hrefs)].join(', '));
}
await browser.close();
