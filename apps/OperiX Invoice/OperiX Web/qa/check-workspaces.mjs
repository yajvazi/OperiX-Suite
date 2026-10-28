#!/usr/bin/env node
// The workspace switcher must list only companies the user belongs to, never every tenant the database lets them read.
import { chromium } from '@playwright/test';
const base = 'http://127.0.0.1:3100'; const mock = 'http://127.0.0.1:55321';
const session = await (await fetch(`${mock}/__qa/session`)).json();
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([{ name: 'sb-invoice-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, domain: '127.0.0.1', path: '/' }]);
const page = await context.newPage();
await page.goto(`${base}/dashboard`, { waitUntil: 'networkidle' });
await page.locator('.operix-shared-sidebar-workspace').first().click();
await page.waitForTimeout(600);
const text = await page.locator('body').innerText();
console.log('lists Demo Trade:', text.includes('Demo Trade'));
console.log('lists Unrelated Tenant:', text.includes('Unrelated Tenant'));
await page.screenshot({ path: 'qa/out/interact/workspace-menu.png' });
await browser.close();
process.exit(text.includes('Unrelated Tenant') ? 1 : 0);
