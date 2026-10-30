#!/usr/bin/env node
/**
 * Builds the "client secret" Supabase needs for Sign in with Apple: a JWT signed (ES256) with your .p8 key.
 *
 *   node scripts/auth/apple-client-secret.mjs --team ABCDE12345 --key-id K1234567 --client-id com.example.web --p8 AuthKey_K1234567.p8
 *
 * --client-id is the Services ID (the web identifier). The result is valid for 180 days (Apple's maximum is
 * about 6 months): regenerate it before then. The .p8 file is only read; nothing is stored or sent anywhere.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => (value.startsWith('--') ? [...pairs, [value.slice(2), all[index + 1]]] : pairs), []));
for (const name of ['team', 'key-id', 'client-id', 'p8']) {
  if (!args[name]) { console.error(`Missing --${name}. See the comment at the top of this file.`); process.exit(1); }
}

const b64 = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const lifetime = 180 * 24 * 60 * 60;
const unsigned = `${b64({ alg: 'ES256', kid: args['key-id'], typ: 'JWT' })}.${b64({ iss: args.team, iat: now, exp: now + lifetime, aud: 'https://appleid.apple.com', sub: args['client-id'] })}`;
const signature = crypto.sign('sha256', Buffer.from(unsigned), { key: fs.readFileSync(args.p8), dsaEncoding: 'ieee-p1363' });
console.log(`${unsigned}.${signature.toString('base64url')}`);
console.error(`Valid until ${new Date((now + lifetime) * 1000).toISOString().slice(0, 10)}. Paste the line above into Supabase > Authentication > Providers > Apple > Secret.`);
