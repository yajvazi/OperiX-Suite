#!/usr/bin/env node
// Two tabs on the same browser profile: the second must explain itself instead of failing silently,
// and the backup reminder must appear for a browser that holds data.
import * as pw from '@playwright/test';
const browserName = process.argv.includes('--browser') ? process.argv[process.argv.indexOf('--browser') + 1] : 'chromium';
const base = 'http://127.0.0.1:3100'; const mock = 'http://127.0.0.1:55321';
const session = await (await fetch(`${mock}/__qa/session`)).json();
const browser = await pw[browserName].launch(browserName === 'chromium' ? { args: ['--no-sandbox'] } : {});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([{ name: 'sb-invoice-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, domain: '127.0.0.1', path: '/' }]);
await context.addInitScript(() => { try { if (!localStorage.getItem('operix.storageMode')) localStorage.setItem('operix.storageMode', 'local'); } catch {} });
let failures = 0; const check = (name, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', name, extra); if (!ok) failures += 1; };
const first = await context.newPage();
await first.goto(`${base}/customers?create=1`, { waitUntil: 'networkidle' });
await first.waitForSelector('.resource-modal', { timeout: 30000 });
await first.locator('.resource-modal input[name="name"]').fill('Tab Test');
await first.locator('.resource-modal button.btn-primary').first().click();
await first.waitForSelector('.resource-modal', { state: 'detached', timeout: 15000 });
await first.goto(`${base}/dashboard`, { waitUntil: 'networkidle' }); await first.waitForTimeout(2000);
check('backup reminder shown', (await first.locator('text=stored only in this browser').count()) > 0);
const second = await context.newPage();
await second.goto(`${base}/customers`, { waitUntil: 'networkidle' }); await second.waitForTimeout(3000);
const text = await second.locator('body').innerText();
check('second tab explains the lock', /another tab or window/i.test(text), text.slice(0, 120).replace(/\n/g, ' '));
await browser.close();
process.exit(failures ? 1 : 0);
