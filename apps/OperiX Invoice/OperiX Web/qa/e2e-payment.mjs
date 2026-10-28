#!/usr/bin/env node
// Checks the invoice detail "Record payment" action and that the payment form opens prefilled.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const base = arg('base', 'http://127.0.0.1:3100'); const mock = arg('mock', 'http://127.0.0.1:55321'); const theme = arg('theme', 'light');
const out = path.join(here, 'out', 'interact', theme); fs.mkdirSync(out, { recursive: true });
const session = await (await fetch(`${mock}/__qa/session`)).json();
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([{ name: 'sb-invoice-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, domain: new URL(base).hostname, path: '/' }]);
const page = await context.newPage();
await page.goto(`${base}/invoices`, { waitUntil: 'networkidle' });
const rows = page.locator('tbody tr');
const count = await rows.count();
let opened = false;
for (let i = 0; i < Math.min(count, 12) && !opened; i += 1) {
  await page.goto(`${base}/invoices`, { waitUntil: 'networkidle' });
  await page.locator('tbody tr').nth(i).click();
  await page.waitForURL(/\/invoices\//);
  await page.waitForTimeout(800);
  if (await page.locator('[data-testid="invoice.record-payment-desktop"]').count()) opened = true;
}
console.log('detail with Record payment button:', opened, page.url());
await page.screenshot({ path: path.join(out, 'detail-record-payment.png') });
if (opened) {
  await page.locator('[data-testid="invoice.record-payment-desktop"]').click();
  await page.waitForURL(/\/payments/);
  await page.waitForSelector('.resource-modal', { timeout: 8000 });
  await page.waitForTimeout(800);
  const values = await page.$$eval('.resource-modal select, .resource-modal input', (els) => els.map((el) => `${el.name}=${el.tagName === 'SELECT' ? el.options[el.selectedIndex]?.text : el.value}`));
  console.log(values.join('\n'));
  await page.screenshot({ path: path.join(out, 'payment-prefilled.png') });
}
await browser.close();
