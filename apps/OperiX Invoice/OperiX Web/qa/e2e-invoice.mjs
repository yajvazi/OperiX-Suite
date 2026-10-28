#!/usr/bin/env node
// End-to-end check of the invoice editor against the mock backend:
// opens Advanced options, fills an item, saves, and reports the request made.
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
await context.addInitScript((t) => { try { localStorage.setItem('theme', t); localStorage.setItem('operix-theme', t); } catch {} document.documentElement.dataset.theme = t; }, theme);
const page = await context.newPage();
const writes = [];
page.on('request', (r) => { if (['POST', 'PATCH', 'PUT'].includes(r.method()) && r.url().includes(':55321') && !/rpc\/(get_my|rbac_get)/.test(r.url())) writes.push(`${r.method()} ${r.url().replace(/.*55321/, '')} ${(r.postData() || '').slice(0, 160)}`); });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
await page.goto(`${base}/invoices/new`, { waitUntil: 'networkidle' });
await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
await page.locator('summary:has-text("Advanced options")').click();
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(out, 'editor-advanced.png'), fullPage: true });
console.log('shot editor-advanced');
// pick the first real product for the first line, set quantity
const itemSelect = page.locator('select').filter({ has: page.locator('option:has-text("Custom item")') }).first();
const options = await itemSelect.locator('option').allTextContents();
console.log('item options:', options.slice(0, 4).join(' | '));
if (options.length > 1) await itemSelect.selectOption({ index: 1 });
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(out, 'editor-filled.png'), fullPage: true });
const branch = page.locator('select').filter({ has: page.locator('option:has-text("Select branch")') }).first();
if (await branch.count()) await branch.selectOption({ index: 1 });
await page.locator('button:has-text("Bank transfer")').first().click();
await page.locator('[data-testid="invoice.create-side"]').click();
await page.waitForTimeout(2500);
console.log('url after save:', page.url());
const msg = await page.locator('[role="alert"], [role="status"], .toast, .text-red-600, .text-\\[\\#b42318\\]').allTextContents();
console.log('messages:', msg.join(' | ').slice(0, 300));
console.log('writes:\n' + writes.join('\n'));
await page.screenshot({ path: path.join(out, 'editor-saved.png') });
await browser.close();
