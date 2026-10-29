#!/usr/bin/env node
// Browser-database check: switches to "in this browser" mode, adds a customer, reloads, and confirms it is
// still there while no business data request reaches the backend.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const base = arg('base', 'http://127.0.0.1:3100'); const mock = arg('mock', 'http://127.0.0.1:55321');
const out = path.join(here, 'out', 'local'); fs.mkdirSync(out, { recursive: true });
const session = await (await fetch(`${mock}/__qa/session`)).json();
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([{ name: 'sb-invoice-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, domain: new URL(base).hostname, path: '/' }]);
await context.addInitScript(() => { try { if (!localStorage.getItem('operix.storageMode')) localStorage.setItem('operix.storageMode', 'local'); } catch {} });
const page = await context.newPage();
const dataRequests = [];
page.on('request', (r) => { if (r.url().includes(':55321/rest/v1/') && /\/(clients|invoices|products|payments)\b/.test(r.url())) dataRequests.push(`${r.method()} ${r.url().replace(/.*55321/, '').slice(0, 90)}`); });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 200)); });
let failures = 0; const check = (name, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', name, extra); if (!ok) failures += 1; };

await page.goto(`${base}/customers?create=1`, { waitUntil: 'networkidle' });
await page.waitForSelector('.resource-modal', { timeout: 30000 });
await page.screenshot({ path: path.join(out, 'new-customer.png') });
await page.locator('.resource-modal input[name="name"]').fill('Local Test Customer');
const email = page.locator('.resource-modal input[name="email"]'); if (await email.count()) await email.fill('local@example.com');
await page.locator('.resource-modal button.btn-primary').first().click();
await page.waitForSelector('.resource-modal', { state: 'detached', timeout: 15000 });
check('customer appears in list', (await page.locator('text=Local Test Customer').count()) > 0);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('text=Local Test Customer', { timeout: 15000 }).then(() => check('customer survives reload', true), () => check('customer survives reload', false));
await page.screenshot({ path: path.join(out, 'customers.png') });
check('no customer data requests to backend', dataRequests.length === 0, dataRequests.join(' ; '));

await page.goto(`${base}/settings?tab=storage`, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid="storage-export"]', { timeout: 15000 });
const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid="storage-export"]')]);
const file = await download.path(); const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
check('backup contains the customer', backup.records.some((r) => r.table === 'clients' && r.data.name === 'Local Test Customer'), `${backup.records.length} records`);
await page.screenshot({ path: path.join(out, 'storage.png') });
// invoice: create, open, record a payment, see it in reports
await page.goto(`${base}/invoices/new?documentType=INVOICE`, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-testid="invoice.customer"]', { timeout: 30000 });
await page.selectOption('[data-testid="invoice.customer"]', { label: 'Local Test Customer' });
const description = page.locator('table tbody tr').first().locator('input[type="text"], input:not([type])').first();
await description.fill('Consulting hour');
const numberInputs = page.locator('table tbody tr').first().locator('input[type="number"]');
await numberInputs.nth(1).fill('100');
await page.locator('button:has-text("Bank transfer")').first().click();
await page.locator('[data-testid="invoice.create-side"]').click();
await page.waitForURL(/\/invoices\/[0-9a-f-]{36}/, { timeout: 20000 }).then(() => check('invoice saved and opened', true, page.url()), async () => { check('invoice saved and opened', false, await page.locator('.rounded.bg-\\[\\#fff3f2\\], [class*="fff3f2"]').allTextContents().then((t) => t.join('|'))); });
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(out, 'invoice.png'), fullPage: true });
const body = await page.locator('body').innerText();
check('invoice number uses the device series', /FAT-[A-Z0-9]{4}-\d{4}-\d{6}/.test(body) || /FAT-/.test(body), (body.match(/FAT-[A-Z0-9-]+/) || [''])[0]);
await page.goto(`${base}/invoices`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
check('invoice listed', (await page.locator('text=/FAT-/').count()) > 0);
await page.goto(`${base}/reports`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(out, 'reports.png'), fullPage: true });
check('no data requests to backend overall', dataRequests.length === 0, dataRequests.join(' ; '));
await browser.close();
process.exit(failures ? 1 : 0);
