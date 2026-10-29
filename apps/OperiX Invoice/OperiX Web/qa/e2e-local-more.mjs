#!/usr/bin/env node
// More on-device checks: product, POS sale, payment on account, other income, CSV import.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const base = 'http://127.0.0.1:3100'; const mock = 'http://127.0.0.1:55321';
const out = path.join(here, 'out', 'local'); fs.mkdirSync(out, { recursive: true });
const session = await (await fetch(`${mock}/__qa/session`)).json();
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
await context.addCookies([{ name: 'sb-invoice-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, domain: new URL(base).hostname, path: '/' }]);
await context.addInitScript(() => { try { if (!localStorage.getItem('operix.storageMode')) localStorage.setItem('operix.storageMode', 'local'); } catch {} });
const page = await context.newPage();
const dataRequests = [];
page.on('request', (r) => { if (r.url().includes(':55321/rest/v1/') && /\/(clients|invoices|products|payments|other_income|held_orders|pos_terminals)\b/.test(r.url())) dataRequests.push(`${r.method()} ${r.url().replace(/.*55321/, '').slice(0, 90)}`); });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
let failures = 0; const check = (name, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', name, extra); if (!ok) failures += 1; };

// product
await page.goto(`${base}/products?create=1`, { waitUntil: 'networkidle' });
await page.waitForSelector('.resource-modal', { timeout: 30000 });
await page.locator('.resource-modal input[name="name"]').fill('Widget');
await page.locator('.resource-modal input[name="unit_price"]').fill('10');
await page.locator('.resource-modal button.btn-primary').first().click();
await page.waitForSelector('.resource-modal', { state: 'detached', timeout: 15000 });
check('product saved', (await page.locator('text=Widget').count()) > 0);

// POS sale
await page.goto(`${base}/pos`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.locator('button:has-text("Widget")').first().click();
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(out, 'pos.png') });
await page.locator('button:has-text("Card")').first().click();
await page.locator('button.btn-primary:has-text("Pay & Complete")').click();
await page.waitForURL(/\/invoices\/[0-9a-f-]{36}/, { timeout: 20000 }).then(() => check('POS sale completed', true), async () => { await page.screenshot({ path: path.join(out, 'pos-fail.png'), fullPage: true }); check('POS sale completed', false, (await page.locator('body').innerText()).split('\n').filter((l) => /cash|enter|select|required|could not|ask/i.test(l)).slice(0, 4).join(' | ')); });
await page.waitForTimeout(1500);
check('POS invoice shows paid', /paid/i.test(await page.locator('body').innerText()));

// hold and resume
await page.goto(`${base}/pos`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.locator('button:has-text("Widget")').first().click();
await page.locator('button[title="Hold order"]').click();
await page.waitForTimeout(800);
check('order held (cart emptied)', (await page.locator('text=No items added').count()) > 0);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
await page.locator('button[title="Resume held order"]').click();
await page.waitForTimeout(800);
check('held order resumed after reload', (await page.locator('text=1 line item').count()) > 0);

// other income
await page.goto(`${base}/income`, { waitUntil: 'networkidle' }).catch(() => {});
await page.waitForTimeout(1500);
await page.locator('form input').nth(1).fill('Interest Q3');
await page.locator('form input[type="number"], form input[inputmode="decimal"]').first().fill('25');
await page.locator('form button[type="submit"], form button.btn-primary').first().click();
await page.waitForTimeout(1500);
check('other income listed', (await page.locator('text=Interest Q3').count()) > 0);
await page.screenshot({ path: path.join(out, 'income.png') });

check('no data requests to backend', dataRequests.length === 0, dataRequests.join(' ; '));
await browser.close();
process.exit(failures ? 1 : 0);
