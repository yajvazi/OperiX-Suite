import fs from 'node:fs';
import path from 'node:path';

const EXCLUDED_DIRECTORY_NAMES = new Set(['node_modules', '.git', '.next', 'dist', 'coverage', '.expo', '.turbo']);

function walk(directory, predicate = () => true) {
    if (!fs.existsSync(directory)) return [];
    const result = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (EXCLUDED_DIRECTORY_NAMES.has(entry.name)) continue;
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) result.push(...walk(absolute, predicate));
        else if (predicate(absolute, entry.name)) result.push(absolute);
    }
    return result;
}

function readJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return null;
    }
}

function packageDependencies(manifest) {
    return {
        ...(manifest?.dependencies ?? {}),
        ...(manifest?.devDependencies ?? {}),
        ...(manifest?.peerDependencies ?? {}),
    };
}

function slugify(value) {
    return value
        .toLowerCase()
        .replace(/operix\s+/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'mobile-app';
}

function appIdFor(name, packageName, appPath) {
    const known = new Map([
        ['operix invoice', 'operix-invoice'],
        ['operix hr', 'operix-hr'],
        ['operix booking', 'operix-booking'],
        ['operix desk', 'operix-desk'],
        ['operix tracker', 'operix-tracker'],
        ['operix scanner', 'operix-scanner'],
    ]);
    return known.get(String(name).toLowerCase()) ?? slugify(name || packageName || appPath);
}

function expoSdkFromVersion(version) {
    if (!version) return 'unknown';
    const match = String(version).match(/(?:\^|~|>=|<=|>|<|=)?\s*(\d+)/);
    return match?.[1] ?? 'unknown';
}

function collectSourceText(appRoot) {
    const files = walk(appRoot, (absolute, name) =>
        /\.(?:ts|tsx|js|jsx|mjs|json)$/.test(name)
        && !name.endsWith('.map')
        && !absolute.endsWith('/package-lock.json')
        && !absolute.endsWith('/app.json')
        && !absolute.endsWith('/eas.json'),
    );
    return files.map((filePath) => fs.readFileSync(filePath, 'utf8')).join('\n');
}

function hasAnyFile(appRoot, patterns) {
    return walk(appRoot, (_absolute, name) => patterns.some((pattern) => pattern.test(name))).length > 0;
}

function detectBackend(appRoot, manifest, repoRoot) {
    const dependencies = packageDependencies(manifest);
    const source = collectSourceText(appRoot);
    const supabase = Boolean(dependencies['@supabase/supabase-js']) || /supabase/i.test(source);
    const postgres = fs.existsSync(path.join(repoRoot, 'supabase')) || /postgres|\.rpc\s*\(/i.test(source);
    if (supabase && postgres) return 'Supabase / PostgreSQL (shared workspace)';
    if (supabase) return 'Supabase';
    if (postgres) return 'PostgreSQL/API';
    return 'N/A';
}

function detectCapabilities(appRoot, manifest, repoRoot) {
    const dependencies = packageDependencies(manifest);
    const source = collectSourceText(appRoot);
    const hasSupabase = Boolean(dependencies['@supabase/supabase-js']) || /supabase/i.test(source);
    const hasAuth = /supabase\.auth|signIn|SignIn|AuthProvider|Protected/i.test(source)
        || fs.existsSync(path.join(appRoot, 'src', 'screens', 'Auth'));
    const hasTenantSignals = /tenant|workspace|company|organization|membership|company_id|workspace_id/i.test(source);
    const hasLocalization = /i18n|locale|translation|\bsq\b|Albanian/i.test(source)
        || fs.existsSync(path.join(repoRoot, 'packages', 'i18n'));
    const hasRtlOrSecurityTests = hasAnyFile(appRoot, [/security/i, /rls/i, /isolation/i]);
    const hasUnitTests = hasAnyFile(appRoot, [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/]);
    const hasMaestro = fs.existsSync(path.join(appRoot, '.maestro')) || hasAnyFile(appRoot, [/maestro/i]);
    const hasDetox = Boolean(dependencies.detox) || fs.existsSync(path.join(appRoot, '.detox'));
    return {
        backend: hasSupabase || postgresSignal(source) ? 'app-backend' : 'N/A',
        authentication: hasAuth,
        tenantIsolation: hasTenantSignals,
        localization: hasLocalization,
        rls: hasSupabase || hasRtlOrSecurityTests,
        unitTests: hasUnitTests,
        e2e: hasMaestro || hasDetox,
        e2eFramework: hasDetox ? 'Detox' : hasMaestro ? 'Maestro' : 'Maestro (standard; not configured)',
        visual: false,
    };
}

function postgresSignal(source) {
    return /postgres|\.rpc\s*\(/i.test(source);
}

function packageScript(manifest, names) {
    for (const name of names) {
        if (manifest?.scripts?.[name]) return { name, command: manifest.scripts[name] };
    }
    return null;
}

function makeCandidate(repoRoot, packagePath) {
    const appRoot = path.dirname(packagePath);
    const manifest = readJson(packagePath);
    if (!manifest) return null;
    const dependencies = packageDependencies(manifest);
    if (!dependencies.expo || !dependencies['react-native']) return null;

    const appJsonPath = path.join(appRoot, 'app.json');
    const appJson = readJson(appJsonPath);
    const expo = appJson?.expo ?? appJson;
    const name = expo?.name ?? manifest.name ?? '';
    if (!/^OperiX\b/i.test(name)) return null;
    if (!expo || typeof expo !== 'object') return null;

    const relativePath = path.relative(repoRoot, appRoot);
    const configFiles = ['app.json', 'app.config.js', 'app.config.ts', 'app.config.mjs']
        .filter((file) => fs.existsSync(path.join(appRoot, file)));
    const sourceText = collectSourceText(appRoot);
    const scripts = {
        install: 'npm ci (repository lockfile)',
        lint: packageScript(manifest, ['lint']),
        typecheck: packageScript(manifest, ['typecheck', 'check-types']),
        unit: packageScript(manifest, ['test:unit', 'test:core', 'test']),
        ui: packageScript(manifest, ['test:component', 'test:ui']),
        integration: packageScript(manifest, ['test:integration', 'test:api-boundaries']),
        backend: packageScript(manifest, ['test:backend', 'test:server', 'test:api']),
        legacy: packageScript(manifest, ['test:legacy']),
        core: packageScript(manifest, ['test:core']),
        fullSuite: packageScript(manifest, ['test:ci', 'test:all']),
        e2e: packageScript(manifest, ['test:e2e']),
        buildCheck: packageScript(manifest, ['build:check', 'build']),
    };
    const dependenciesObject = packageDependencies(manifest);
    const hasSupabase = Boolean(dependenciesObject['@supabase/supabase-js']) || /supabase/i.test(sourceText);
    const hasBackend = hasSupabase || postgresSignal(sourceText);
    const hasAuth = /supabase\.auth|signIn|SignIn|AuthProvider|Protected/i.test(sourceText)
        || fs.existsSync(path.join(appRoot, 'src', 'screens', 'Auth'));
    const hasTenantSignals = /tenant|workspace|company|organization|membership|company_id|workspace_id/i.test(sourceText);
    const hasLocalization = /i18n|locale|translation|\bsq\b|Albanian/i.test(sourceText)
        || fs.existsSync(path.join(repoRoot, 'packages', 'i18n'));
    const hasMaestro = fs.existsSync(path.join(appRoot, '.maestro'));
    const hasDetox = Boolean(dependenciesObject.detox) || fs.existsSync(path.join(appRoot, '.detox'));
    const easPath = path.join(appRoot, 'eas.json');

    return {
        id: appIdFor(name, manifest.name, relativePath),
        name,
        packageName: manifest.name,
        path: relativePath,
        root: appRoot,
        packageJson: path.relative(repoRoot, packagePath),
        appJson: fs.existsSync(appJsonPath) ? path.relative(repoRoot, appJsonPath) : null,
        configFiles,
        framework: 'Expo / React Native',
        expoSdk: expo.sdkVersion ?? expoSdkFromVersion(dependencies.expo),
        reactNativeVersion: dependencies['react-native'] ?? 'unknown',
        bundleId: expo.ios?.bundleIdentifier ?? 'missing',
        androidPackage: expo.android?.package ?? 'missing',
        slug: expo.slug ?? 'missing',
        scheme: expo.scheme ?? 'missing',
        version: expo.version ?? manifest.version ?? 'unknown',
        backend: hasBackend ? detectBackend(appRoot, manifest, repoRoot) : 'N/A',
        capabilities: {
            authentication: hasAuth,
            tenantIsolation: hasTenantSignals,
            localization: hasLocalization,
            rls: hasSupabase,
            backend: hasBackend,
            unitTests: hasAnyFile(appRoot, [/\.test\.[jt]sx?$/, /\.spec\.[jt]sx?$/]),
            e2e: hasMaestro || hasDetox,
            visual: false,
            e2eFramework: hasDetox ? 'Detox' : 'Maestro',
        },
        scripts,
        dependencies,
        eas: readJson(easPath),
        hasEasConfig: fs.existsSync(easPath),
        sourceText,
    };
}

export function discoverMobileApps(repoRoot) {
    const packageFiles = walk(path.join(repoRoot, 'apps'), (_absolute, name) => name === 'package.json');
    const candidates = packageFiles.map((filePath) => makeCandidate(repoRoot, filePath)).filter(Boolean);
    const seen = new Set();
    return candidates
        .filter((app) => {
            if (seen.has(app.id)) return false;
            seen.add(app.id);
            return true;
        })
        .sort((a, b) => a.name.localeCompare(b.name));
}

export function readAppJson(app) {
    return readJson(path.join(app.root, 'app.json'));
}

export function appSlug(value) {
    return slugify(value);
}

export function relativeToRepo(repoRoot, absolutePath) {
    return path.relative(repoRoot, absolutePath).split(path.sep).join('/');
}
