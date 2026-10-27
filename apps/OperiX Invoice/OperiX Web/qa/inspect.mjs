#!/usr/bin/env node
// Debug helper: node qa/inspect.mjs <route> <css selector> [--w 1440] [--h 900] [--styles prop1,prop2] [--html]
import { chromium } from '@playwright/test';
const [route, selector] = process.argv.slice(2, 4);
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const base = arg('base', 'http://127.0.0.1:3100'); const mock = arg('mock', 'http://127.0.0.1:55321');
const session = await (await fetch(`${mock}/__qa/session`)).json();
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: Number(arg('w', 1440)), height: Number(arg('h', 900)) } });
await context.addCookies([{ name: 'sb-invoice-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, domain: new URL(base).hostname, path: '/' }]);
const page = await context.newPage();
await page.goto(`${base}${route}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(600);
const props = arg('styles', 'display,position,width,height,margin,padding,flex,gridTemplateColumns,gap,overflow,fontSize,color,border,boxShadow,transform,zIndex').split(',');
const result = await page.evaluate(({ selector, props, html }) => [...document.querySelectorAll(selector)].slice(0, 6).map((el) => {
  const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
  return { tag: el.tagName.toLowerCase(), class: String(el.className).slice(0, 120), rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], styles: Object.fromEntries(props.map((p) => [p, cs[p]])), html: html ? el.outerHTML.slice(0, 1400) : undefined };
}), { selector, props, html: process.argv.includes('--html') });
console.log(JSON.stringify(result, null, 2));
await browser.close();
