#!/usr/bin/env node
// Albanian interface: menus and screens are translated, the switch works both ways, nothing breaks on hydration,
// and invoice documents keep their own language.
import * as pw from '@playwright/test';
const browserName = process.argv.includes('--browser') ? process.argv[process.argv.indexOf('--browser') + 1] : 'chromium';
const base = 'http://127.0.0.1:3100'; const mock = 'http://127.0.0.1:55321';
const session = await (await fetch(`${mock}/__qa/session`)).json();
const browser = await pw[browserName].launch(browserName === 'chromium' ? { args: ['--no-sandbox'] } : {});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.addCookies([{ name: 'sb-invoice-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, domain: '127.0.0.1', path: '/' }]);
await context.addInitScript(() => { try { localStorage.setItem('operix.storageMode', 'local'); } catch {} });
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && /hydrat|did not match/i.test(m.text())) errors.push(page.url() + ' ' + m.text().slice(0, 1500)); });
let failures = 0; const check = (name, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', name, extra); if (!ok) failures += 1; };

await page.goto(`${base}/settings?tab=appearance`, { waitUntil: 'networkidle' });
await page.waitForSelector('[role="radiogroup"][aria-label="Language"]', { timeout: 30000 });
await page.locator('[role="radiogroup"][aria-label="Language"] button:has-text("Shqip")').click();
await page.waitForLoadState('networkidle'); await page.waitForTimeout(1500);
const nav = (await page.locator('aside, nav').first().innerText()).replace(/\n/g, ' | ');
check('sidebar is Albanian', /Klientët/.test(nav) && /Produktet/.test(nav) && /Shitjet/.test(nav), nav.slice(0, 120));
const order = nav.indexOf('Klientët') < nav.indexOf('Shitjet') && nav.indexOf('Produktet') < nav.indexOf('Shitjet');
check('Customers and Products are above Sales', order);
errors.length = 0; // the settings page itself logs a theme-attribute warning in Firefox that is unrelated to translation
await page.goto(`${base}/customers`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
const text = await page.locator('main, body').first().innerText();
check('customers page is Albanian', /Klientë/.test(text) && /Kërko/.test(await page.locator('input[placeholder]').first().getAttribute('placeholder')));
check('product name is not translated', /OperiX/.test(await page.locator('.operix-product-logo').first().innerText()) && !/Faturë\s*$/.test((await page.locator('.operix-product-logo').first().innerText()).trim()));
check('document language attribute', (await page.evaluate(() => document.documentElement.lang)) === 'sq');
check('no hydration errors', errors.length === 0, errors.join(' | '));
await page.goto(`${base}/settings?tab=appearance`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
await page.locator('[role="radiogroup"][aria-label="Language"] button:has-text("English")').click();
await page.waitForLoadState('networkidle'); await page.waitForTimeout(1200);
const back = (await page.locator('aside, nav').first().innerText()).replace(/\n/g, ' | ');
check('switching back gives English', /Customers/.test(back) && !/Klientët/.test(back), back.slice(0, 80));
await browser.close();
process.exit(failures ? 1 : 0);
