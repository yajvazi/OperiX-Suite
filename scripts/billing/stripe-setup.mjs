#!/usr/bin/env node
/**
 * Creates (or finds) the Stripe products and prices OperiX Billing expects and prints the
 * environment variable lines to set. Safe to run repeatedly: prices are matched by lookup key.
 *
 *   STRIPE_SECRET_KEY=sk_test_... node scripts/billing/stripe-setup.mjs
 *   STRIPE_SECRET_KEY=sk_test_... node scripts/billing/stripe-setup.mjs --webhook https://invoice.example.com
 *
 * The secret key is read from the environment only and is never printed or stored.
 * Amounts mirror PLAN_DEFINITIONS in packages/billing/src/index.ts (EUR).
 */
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../package.json', import.meta.url));
const Stripe = require('stripe');

const key = process.env.STRIPE_SECRET_KEY?.trim();
if (!key) { console.error('Set STRIPE_SECRET_KEY first.'); process.exit(1); }
const stripe = new Stripe(key);
const live = key.startsWith('sk_live_') || key.startsWith('rk_live_');

const cents = (amount) => Math.round(Number(amount) * 100);
const PLANS = {
  invoice: { name: 'OperiX Invoice', monthly: '2.99', annual: '29.99' },
  suite: { name: 'OperiX Suite', monthly: '4.99', annual: '49.99' },
  booking: { name: 'OperiX Booking', monthly: '4.99', annual: '49.99' },
};
const ADDONS = {
  tenant: { name: 'OperiX additional business', monthly: '1.99', annual: '19.99' },
  user: { name: 'OperiX additional user', monthly: '0.99', annual: '9.99' },
};
const API_ADDON = { name: 'OperiX API add-on', monthly: '4.99' };

const productCache = new Map();
async function product(name, id) {
  if (productCache.has(id)) return productCache.get(id);
  let found;
  try { found = await stripe.products.retrieve(id); } catch { /* not created yet */ }
  if (!found || found.deleted) found = await stripe.products.create({ id, name, metadata: { operix: 'true' } });
  productCache.set(id, found);
  return found;
}

async function price(productId, productName, lookupKey, amount, interval) {
  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  if (existing.data[0]) {
    if (existing.data[0].unit_amount !== cents(amount)) console.warn(`! ${lookupKey}: existing price is ${existing.data[0].unit_amount / 100}, expected ${amount}. Create a new price in the Dashboard and move the lookup key if the amount should change.`);
    return existing.data[0].id;
  }
  const p = await product(productName, productId);
  const created = await stripe.prices.create({
    product: p.id, currency: 'eur', unit_amount: cents(amount), lookup_key: lookupKey,
    recurring: { interval: interval === 'annual' ? 'year' : 'month' },
  });
  return created.id;
}

const lines = [];
for (const [plan, def] of Object.entries(PLANS)) {
  for (const interval of ['monthly', 'annual']) {
    lines.push([`STRIPE_${plan.toUpperCase()}_${interval.toUpperCase()}_PRICE_ID`, await price(`operix_${plan}`, def.name, `operix_${plan}_${interval}`, def[interval], interval)]);
  }
}
for (const [kind, def] of Object.entries(ADDONS)) {
  for (const interval of ['monthly', 'annual']) {
    lines.push([`STRIPE_${kind.toUpperCase()}_${interval.toUpperCase()}_PRICE_ID`, await price(`operix_${kind}`, def.name, `operix_${kind}_${interval}`, def[interval], interval)]);
  }
}
lines.push(['STRIPE_API_ADDON_MONTHLY_PRICE_ID', await price('operix_api_addon', API_ADDON.name, 'operix_api_addon_monthly', API_ADDON.monthly, 'monthly')]);

console.log(`# Stripe ${live ? 'LIVE' : 'test'} mode price IDs (not secret)`);
for (const [name, id] of lines) console.log(`${name}=${id}`);

const hookArg = process.argv.indexOf('--webhook');
if (hookArg > -1) {
  const base = String(process.argv[hookArg + 1] || '').replace(/\/+$/, '');
  if (!/^https:\/\//.test(base)) { console.error('--webhook needs the public https address of the web app.'); process.exit(1); }
  const url = `${base}/api/webhooks/stripe`;
  const events = ['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'customer.subscription.paused', 'customer.subscription.resumed', 'invoice.paid', 'invoice.payment_failed', 'payment_intent.payment_failed'];
  const existing = (await stripe.webhookEndpoints.list({ limit: 100 })).data.find((hook) => hook.url === url);
  if (existing) {
    await stripe.webhookEndpoints.update(existing.id, { enabled_events: events });
    console.log(`# Webhook ${url} already exists (${existing.id}); events updated. Its signing secret is only shown at creation: Dashboard > Developers > Webhooks > Reveal.`);
  } else {
    const hook = await stripe.webhookEndpoints.create({ url, enabled_events: events, description: 'OperiX subscriptions' });
    console.log(`STRIPE_WEBHOOK_SECRET=${hook.secret}`);
  }
}
console.log('# Also set STRIPE_SECRET_KEY (secret) on the web app, and optionally STRIPE_AUTOMATIC_TAX_ENABLED=true, STRIPE_ALLOW_PROMOTION_CODES=true, CRON_SECRET.');
