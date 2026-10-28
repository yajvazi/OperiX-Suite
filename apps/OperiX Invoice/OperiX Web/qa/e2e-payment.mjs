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
const writes = [];
page.on('request', (r) => { if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(r.method()) && r.url().includes(':55321') && !/rpc\/(get_my|rbac_get)/.test(r.url())) writes.push(`${r.method()} ${r.url().replace(/.*55321/, '')} ${(r.postData() || '').slice(0, 1200)}`); });
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
if (opened) {
  const cash = page.locator('.resource-modal select[name="payment_method"] option[value="cash"]');
  console.log('cash option disabled at', await page.locator('.resource-modal input[name="amount"]').inputValue(), '->', await cash.isDisabled());
  await page.locator('.resource-modal select[name="payment_method"]').selectOption('bank');
  await page.waitForTimeout(300);
  console.log('bank account select visible:', await page.locator('.resource-modal select[name="company_bank_account_id"]').isVisible());
  console.log('invoice options:', (await page.locator('.resource-modal select[name="invoice_id"] option').allTextContents()).join(' | '));
  await page.screenshot({ path: path.join(out, 'payment-bank.png') });
  await page.locator('.resource-modal footer button.btn-primary').click();
  await page.waitForTimeout(2000);
  console.log('modal error:', (await page.locator('.resource-modal-error').allTextContents()).join(' | '), '| modal open:', await page.locator('.resource-modal').count());
  console.log('writes:\n' + writes.join('\n'));
}
await browser.close();
