#!/usr/bin/env node
// Interaction screenshots: forms, modals and menus. node qa/interact.mjs [--theme light|dark]
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
const shot = async (name) => { await page.waitForTimeout(500); await page.screenshot({ path: path.join(out, `${name}.png`) }); console.log('shot', name); };
const go = async (route) => { await page.goto(`${base}${route}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(500); await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme); };
const click = async (sel, name) => { try { await page.locator(sel).first().click({ timeout: 4000 }); await shot(name); } catch (e) { console.log('skip', name, String(e.message).split('\n')[0]); } };

await go('/customers'); await click('text=New Customer', 'customer-new'); await page.keyboard.press('Escape');
await go('/products'); await click('button:has-text("New")', 'product-new'); await page.keyboard.press('Escape');
await go('/expenses'); await click('button:has-text("New"), button:has-text("Add")', 'expense-new'); await page.keyboard.press('Escape');
await go('/payments'); await click('button:has-text("New"), button:has-text("Record")', 'payment-new'); await page.keyboard.press('Escape');
await go('/dashboard'); await click('.app-topbar-primary', 'menu-create');
await go('/dashboard'); await click('[aria-label*="otification" i]', 'menu-notifications');
await go('/dashboard'); await click('.operix-shared-sidebar-workspace', 'menu-workspace');
await go('/pos'); await click('text=Standing desk 160cm', 'pos-cart');
await go('/invoices/new'); await click('button:has-text("Items")', 'invoice-step-items'); await click('button:has-text("Review")', 'invoice-step-review');
await browser.close();
