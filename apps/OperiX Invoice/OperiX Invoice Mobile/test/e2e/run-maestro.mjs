import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const required = ['E2E_EMAIL', 'E2E_PASSWORD', 'E2E_CUSTOMER_ID', 'E2E_PRODUCT_ID'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
    console.error(`E2E is intentionally gated. Set ${missing.join(', ')} for an isolated non-production test account.`);
    process.exit(2);
}

const targetUrl = process.env.E2E_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
if (!targetUrl) {
    console.error('E2E is intentionally gated. Set E2E_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL to a local/test/staging Supabase project.');
    process.exit(2);
}

if (/prod(?:uction)?|live/i.test(targetUrl)) {
    console.error(`Refusing to run mobile E2E tests against a production/live target: ${targetUrl}`);
    process.exit(2);
}

const allowedNonProduction = /localhost|127\.0\.0\.1|staging|stage|test|qa|dev/i.test(targetUrl) || process.env.ALLOW_NONPROD_E2E === '1';
if (!allowedNonProduction) {
    console.error(`Refusing an unclassified E2E target: ${targetUrl}. Use a local/test/staging target or explicitly classify it with ALLOW_NONPROD_E2E=1.`);
    process.exit(2);
}

const maestro = spawnSync('maestro', ['--version'], { encoding: 'utf8' });
if (maestro.error || maestro.status !== 0) {
    console.error('Maestro is not installed or not available on PATH. Install Maestro and start a test simulator/emulator before running test:e2e.');
    process.exit(2);
}

const appId = process.env.MAESTRO_APP_ID || 'com.internetkudo.invoiceapp';
process.env.E2E_CUSTOMER_NAME ||= 'OperiX E2E Customer';
process.env.E2E_CUSTOMER_EMAIL ||= 'operix-e2e-customer@example.test';
process.env.E2E_PRODUCT_NAME ||= 'OperiX E2E Product';
const flowDirectory = fileURLToPath(new URL('../../.maestro/', import.meta.url));
const flowFiles = readdirSync(flowDirectory).filter((file) => file.endsWith('.yaml')).sort();
for (const flowFile of flowFiles) {
    const result = spawnSync('maestro', ['test', `${flowDirectory}/${flowFile}`], {
        stdio: 'inherit',
        env: { ...process.env, MAESTRO_APP_ID: appId },
    });
    if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
}
