import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, copyFileSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const visualDirectory = join(appRoot, '.maestro', 'visual');
const mode = process.argv.includes('--update') ? 'update' : 'check';
const device = process.env.VISUAL_DEVICE || 'large-iphone';
const language = process.env.VISUAL_LANGUAGE || 'en';
const allowedDevices = new Set(['small-iphone', 'large-iphone']);
const allowedLanguages = new Set(['en', 'sq']);

if (!allowedDevices.has(device) || !allowedLanguages.has(language)) {
    console.error('Visual tests require VISUAL_DEVICE=small-iphone|large-iphone and VISUAL_LANGUAGE=en|sq.');
    process.exit(2);
}

const required = ['E2E_EMAIL', 'E2E_PASSWORD', 'E2E_CUSTOMER_ID', 'E2E_PRODUCT_ID'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
    console.error(`Visual tests are intentionally gated. Set ${missing.join(', ')} for an isolated non-production test account.`);
    process.exit(2);
}

const targetUrl = process.env.E2E_SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
if (!targetUrl) {
    console.error('Visual tests are intentionally gated. Set E2E_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL to a local/test/staging Supabase project.');
    process.exit(2);
}
if (/prod(?:uction)?|live/i.test(targetUrl)) {
    console.error(`Refusing to run visual tests against a production/live target: ${targetUrl}`);
    process.exit(2);
}
if (!/localhost|127\.0\.0\.1|staging|stage|test|qa|dev/i.test(targetUrl) && process.env.ALLOW_NONPROD_E2E !== '1') {
    console.error(`Refusing an unclassified visual target: ${targetUrl}. Use a local/test/staging target or explicitly classify it with ALLOW_NONPROD_E2E=1.`);
    process.exit(2);
}

const maestro = spawnSync('maestro', ['--version'], { encoding: 'utf8' });
if (maestro.error || maestro.status !== 0) {
    console.error('Maestro is not installed or not available on PATH. Install Maestro and boot the configured iPhone simulator before running visual tests.');
    process.exit(2);
}

const outputDirectory = resolve(process.env.MAESTRO_VISUAL_OUTPUT_DIR || join(appRoot, 'build', 'maestro-visual-results', `${device}-${language}-${mode}`));
mkdirSync(outputDirectory, { recursive: true });
const environment = {
    ...process.env,
    MAESTRO_APP_ID: process.env.MAESTRO_APP_ID || 'com.internetkudo.invoiceapp',
    VISUAL_DEVICE: device,
    VISUAL_LANGUAGE: language,
    VISUAL_SIGN_OUT: language === 'sq' ? 'Dil' : 'Sign Out',
    VISUAL_ERROR_TEXT: language === 'sq' ? 'Ngarkimi nuk ishte i mundur' : 'Unable to load',
};

function runMaestro(flowPath) {
    const outputPath = relative(flowPath, outputDirectory) || '.';
    return spawnSync('maestro', ['test', flowPath, `--test-output-dir=${outputPath}`], {
        cwd: appRoot,
        env: environment,
        stdio: 'inherit',
    });
}

function resolveTemplate(value) {
    return value
        .replaceAll('${VISUAL_DEVICE}', device)
        .replaceAll('${VISUAL_LANGUAGE}', language)
        .replaceAll('${MAESTRO_APP_ID}', environment.MAESTRO_APP_ID);
}

function findPng(directory, captureName) {
    for (const entry of readdirSync(directory)) {
        const entryPath = join(directory, entry);
        if (statSync(entryPath).isDirectory()) {
            const nested = findPng(entryPath, captureName);
            if (nested) return nested;
        } else if (entry.toLowerCase().endsWith('.png') && (entry === `${captureName}.png` || entry.startsWith(`${captureName}.`))) {
            return entryPath;
        }
    }
    return null;
}

if (mode === 'check') {
    const result = runMaestro(visualDirectory);
    process.exit(result.status ?? 1);
}

const flowFiles = readdirSync(visualDirectory).filter((file) => extname(file) === '.yaml');
const generatedDirectory = mkdtempSync(join(visualDirectory, '.generated-update-'));
const captures = [];
try {
    for (const file of flowFiles) {
        const source = readFileSync(join(visualDirectory, file), 'utf8');
        let index = 0;
        const transformed = source.replace(/- assertScreenshot:\s*\n\s+path:\s*([^\n]+)\n\s+thresholdPercentage:\s*[^\n]+/g, (_match, rawPath) => {
            const captureName = `${basename(file, extname(file))}-${index}`;
            index += 1;
            const pathValue = rawPath.trim().replace(/^['"]|['"]$/g, '');
            captures.push({ captureName, target: resolve(visualDirectory, resolveTemplate(pathValue)) });
            return `- takeScreenshot: ${captureName}`;
        });
        if (transformed === source) throw new Error(`No assertScreenshot commands found in ${file}.`);
        writeFileSync(join(generatedDirectory, file), transformed);
    }

    const result = runMaestro(generatedDirectory);
    if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);

    const missingCaptures = [];
    for (const capture of captures) {
        const actualPath = findPng(outputDirectory, capture.captureName);
        if (!actualPath) {
            missingCaptures.push(capture.captureName);
            continue;
        }
        mkdirSync(dirname(capture.target), { recursive: true });
        copyFileSync(actualPath, capture.target);
        console.log(`Approved visual baseline: ${capture.target}`);
    }
    if (missingCaptures.length) {
        console.error(`Maestro did not produce screenshots for: ${missingCaptures.join(', ')}`);
        process.exit(1);
    }
} finally {
    rmSync(generatedDirectory, { recursive: true, force: true });
}
