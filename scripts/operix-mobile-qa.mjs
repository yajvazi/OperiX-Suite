#!/usr/bin/env node

/*
 * Central OperiX mobile QA orchestrator.
 *
 * Safety rules:
 * - Commands are spawned without a shell.
 * - Production submission commands are not present in this file.
 * - QA secrets are never printed and service-role variables are removed from
 *   mobile child processes.
 * - A missing environment-dependent check is not reported as PASS.
 * - Visual baselines are never changed by a normal run.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { discoverMobileApps, relativeToRepo } from '../qa/mobile/registry.mjs';
import { comparePngDirectories } from '../qa/mobile/visual-compare.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsRoot = path.join(repoRoot, 'docs', 'qa');
const resultsRoot = path.join(docsRoot, 'results');
const historyRoot = path.join(docsRoot, 'history');
const artifactsRoot = path.join(docsRoot, 'artifacts');
const baselinesRoot = path.join(repoRoot, 'qa', 'mobile', 'visual-baselines');
const policy = JSON.parse(fs.readFileSync(path.join(repoRoot, 'qa', 'mobile', 'policy.json'), 'utf8'));
const recordedFixes = JSON.parse(fs.readFileSync(path.join(repoRoot, 'qa', 'mobile', 'fixes.json'), 'utf8'));

const PASS = 'PASS';
const FAIL = 'FAIL';
const NA = 'N/A';
const NOT_RUN = 'NOT_RUN';
const ENVIRONMENT_FAILURE = 'ENVIRONMENT_FAILURE';
const VISUAL_REVIEW_REQUIRED = 'VISUAL_REVIEW_REQUIRED';
const BUILD_FAILURE = 'BUILD_FAILURE';
const SECURITY_FAILURE = 'SECURITY_FAILURE';

const CORE_TEST_STAGES = [
    'lint', 'typecheck', 'unit', 'ui', 'backend', 'integration', 'database', 'authentication',
    'security', 'rls', 'e2e', 'visual', 'build', 'developmentBuild',
];

const REPORT_STAGE_LABELS = {
    environment: 'Environment',
    install: 'Dependencies',
    lint: 'Lint',
    typecheck: 'TypeScript',
    unit: 'Unit tests',
    ui: 'React Native UI tests',
    legacy: 'Legacy/domain tests',
    core: 'Shared core tests',
    fullSuite: 'Full application suite',
    backend: 'Backend/API tests',
    integration: 'Frontend/API-boundary integration tests',
    database: 'Database/Supabase tests',
    authentication: 'Authentication tests',
    security: 'Security tests',
    rls: 'RLS/tenant isolation tests',
    e2e: 'Maestro/Detox E2E',
    visual: 'Visual regression',
    performance: 'Performance sanity',
    console: 'Console/runtime capture',
    build: 'Build smoke test',
    developmentBuild: 'Expo development build',
};

function ensureDir(directory) {
    fs.mkdirSync(directory, { recursive: true });
}

function writeJson(filePath, value) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return null;
    }
}

function now() {
    return new Date().toISOString();
}

function runId() {
    const stamp = now().replace(/[-:.TZ]/g, '').slice(0, 14);
    return `${stamp}-${crypto.randomBytes(3).toString('hex')}`;
}

function stripAnsi(value) {
    return String(value ?? '').replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '');
}

function collectSecretValues() {
    return Object.entries(process.env)
        .filter(([key, value]) => value && /(secret|token|password|private|service.?role|publishable.?key|anon.?key|access.?key)/i.test(key))
        .map(([, value]) => String(value))
        .filter((value) => value.length >= 6);
}

function redact(value) {
    let output = stripAnsi(value);
    for (const secret of collectSecretValues()) output = output.split(secret).join('<redacted-secret>');
    output = output.replace(/\b(sb_(?:publishable|secret)_[A-Za-z0-9._-]{6,})\b/g, '<redacted-supabase-key>');
    output = output.replace(/(service[_-]?role|SUPABASE_SERVICE_ROLE_KEY)\s*[:=]\s*[^\s,;}]+/gi, '$1=<redacted-service-role>');
    output = output.replace(/(password|token|secret|private[_-]?key)\s*[:=]\s*[^\s,;}]+/gi, '$1=<redacted>');
    return output;
}

function safeChildEnv({ allowEas = false } = {}) {
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
        if (/SUPABASE_SERVICE_ROLE|SERVICE_ROLE_KEY|SUPABASE_SECRET|EXPO_PUBLIC_.*SERVICE/i.test(key)) delete env[key];
    }
    // The runner only maps explicitly prefixed QA credentials into app test
    // variable names. Production-looking variables are never copied.
    if (env.OPERIX_QA_E2E_EMAIL) env.E2E_EMAIL = env.OPERIX_QA_E2E_EMAIL;
    if (env.OPERIX_QA_E2E_PASSWORD) env.E2E_PASSWORD = env.OPERIX_QA_E2E_PASSWORD;
    if (env.OPERIX_QA_E2E_SUPABASE_URL) env.E2E_SUPABASE_URL = env.OPERIX_QA_E2E_SUPABASE_URL;
    if (env.OPERIX_QA_E2E_CUSTOMER_ID) env.E2E_CUSTOMER_ID = env.OPERIX_QA_E2E_CUSTOMER_ID;
    if (env.OPERIX_QA_E2E_PRODUCT_ID) env.E2E_PRODUCT_ID = env.OPERIX_QA_E2E_PRODUCT_ID;
    if (!allowEas) delete env.EAS_TOKEN;
    return env;
}

function commandExists(command) {
    const pathValue = process.env.PATH ?? '';
    return pathValue.split(path.delimiter).some((directory) => {
        const candidate = path.join(directory, command);
        return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
    });
}

function gitValue(args) {
    const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8', timeout: 10_000 });
    return result.status === 0 ? String(result.stdout).trim() : 'unknown';
}

function gitInfo() {
    return {
        branch: gitValue(['branch', '--show-current']),
        commit: gitValue(['rev-parse', 'HEAD']),
        dirty: gitValue(['status', '--porcelain']) !== '',
    };
}

function parseCounts(output) {
    const text = stripAnsi(output);
    const tests = text.match(/Tests:\s+(?:(\d+) passed,?\s*)?(?:(\d+) failed,?\s*)?(?:(\d+) skipped,?\s*)?(\d+) total/i);
    const suites = text.match(/Test Suites:\s+(?:(\d+) passed,?\s*)?(?:(\d+) failed,?\s*)?(?:(\d+) skipped,?\s*)?(\d+) total/i);
    const passing = text.match(/(\d+) passing\b/i);
    const failing = text.match(/(\d+) failing\b/i);
    return {
        tests: tests ? { passed: Number(tests[1] ?? 0), failed: Number(tests[2] ?? 0), skipped: Number(tests[3] ?? 0), total: Number(tests[4]) } : null,
        suites: suites ? { passed: Number(suites[1] ?? 0), failed: Number(suites[2] ?? 0), skipped: Number(suites[3] ?? 0), total: Number(suites[4]) } : null,
        passing: passing ? Number(passing[1]) : null,
        failing: failing ? Number(failing[1]) : null,
    };
}

function diagnose(stage, output, exitCode, spawnError) {
    const text = stripAnsi(output).toLowerCase();
    if (spawnError || text.includes('enoent') || text.includes('command not found')) {
        return 'The required command or executable is unavailable in this environment.';
    }
    if (stage === 'security' || stage === 'rls') {
        if (/service[_-]?role|cross[- ]tenant|unauthori[sz]ed|rls|policy/.test(text)) {
            return 'Security-related output requires review of authorization, RLS policy, and tenant boundaries; no code was changed automatically.';
        }
        return 'The dedicated QA database/credentials needed for an independent authorization check are unavailable.';
    }
    if (stage === 'database' || stage === 'backend' || stage === 'authentication') {
        return 'A safe non-production backend test environment or app-specific integration command is not configured.';
    }
    if (stage === 'visual') return 'Baseline and actual screenshots require human comparison; automatic baseline approval is disabled.';
    if (stage === 'e2e' || stage === 'console') return 'A real simulator/emulator plus the selected E2E/log-capture tool is unavailable.';
    if (stage === 'developmentBuild' || stage === 'build') return exitCode === 0
        ? 'The Expo config is valid, but no development build was created in this run.'
        : 'The Expo/native build command failed; inspect the preserved build log.';
    if (/typescript|ts\d+\s+error|type error/.test(text)) return 'The TypeScript compiler reported a type error in application or shared code.';
    if (/eslint|lint/.test(text)) return 'The application lint command reported an error; no stylistic rewrite was applied.';
    if (/cannot find module|module not found|eresolve|peer dep/.test(text)) return 'Dependency resolution or installation failed; the lockfile was not changed by QA.';
    if (/assert|expected .* received|test suite failed|failed tests?/.test(text)) return 'A test assertion failed. The failure remains unclassified until the first failing assertion is reproduced and reviewed.';
    return exitCode === 0 ? 'Completed.' : 'The command exited non-zero; inspect the sanitized stage log for the first actionable error.';
}

function classifyFailure(stage, output, { environment = false, visual = false, build = false } = {}) {
    if (visual) return 'VISUAL_CHANGE_EXPECTED';
    if (build) return BUILD_FAILURE;
    if (stage === 'security' || stage === 'rls') {
        if (/service[_-]?role|cross[- ]tenant|unauthori[sz]ed|rls policy|authorization bypass/i.test(output)) return SECURITY_FAILURE;
        if (environment) return 'ENVIRONMENT_FAILURE';
    }
    if (environment) return 'ENVIRONMENT_FAILURE';
    if (/typescript|ts\d+\s+error|type error/i.test(output)) return 'UNKNOWN';
    if (/cannot find module|module not found|eresolve|peer dep/i.test(output)) return 'ENVIRONMENT_FAILURE';
    return 'UNKNOWN';
}

function runCommand({ stage, command, cwd = repoRoot, artifactDirectory, env, timeout = 15 * 60_000 }) {
    ensureDir(artifactDirectory);
    const logPath = path.join(artifactDirectory, `${stage}.log`);
    const started = Date.now();
    const child = spawnSync(command[0], command.slice(1), {
        cwd,
        env: env ?? safeChildEnv(),
        encoding: 'utf8',
        timeout,
        maxBuffer: 25 * 1024 * 1024,
        shell: false,
    });
    const stdout = redact(child.stdout ?? '');
    const stderr = redact(child.stderr ?? '');
    const combined = `${stdout}${stderr ? `\n${stderr}` : ''}`.trim();
    const timedOut = child.error?.code === 'ETIMEDOUT';
    const exitCode = timedOut ? 124 : child.status;
    fs.writeFileSync(logPath, [
        `command: ${command.map((part) => JSON.stringify(part)).join(' ')}`,
        `cwd: ${relativeToRepo(repoRoot, cwd) || '.'}`,
        `exitCode: ${exitCode ?? 'unknown'}`,
        `durationMs: ${Date.now() - started}`,
        '',
        combined,
        '',
    ].join('\n'));
    return {
        ok: child.status === 0,
        exitCode,
        durationMs: Date.now() - started,
        output: combined,
        log: relativeToRepo(repoRoot, logPath),
        spawnError: child.error?.message ?? null,
        counts: parseCounts(combined),
    };
}

function stageResult(status, evidence, extras = {}) {
    return {
        status,
        evidence: Array.isArray(evidence) ? evidence : [evidence].filter(Boolean),
        classification: extras.classification ?? null,
        diagnosis: extras.diagnosis ?? null,
        command: extras.command ?? null,
        log: extras.log ?? null,
        counts: extras.counts ?? null,
        durationMs: extras.durationMs ?? 0,
        applicable: extras.applicable ?? true,
        blocking: extras.blocking ?? false,
        warnings: extras.warnings ?? [],
    };
}

function resultTemplate(app, run, git) {
    const previous = readJson(path.join(resultsRoot, app.id, 'qa-results.json'));
    const appFixes = recordedFixes.filter((fix) => fix.appId === app.id);
    const result = {
        schemaVersion: 1,
        runId: run,
        generatedAt: now(),
        app: app.name,
        appId: app.id,
        repository: repoRoot,
        path: app.path,
        branch: git.branch,
        commit: git.commit,
        worktreeDirtyAtStart: git.dirty,
        framework: app.framework,
        expoSdk: app.expoSdk,
        reactNativeVersion: app.reactNativeVersion,
        bundleId: app.bundleId,
        androidPackage: app.androidPackage,
        backend: app.backend,
        state: 'TESTING',
        stateHistory: [{ state: 'TESTING', timestamp: now() }],
        tests: {},
        stages: {},
        bugsFound: appFixes.length,
        bugsFixed: appFixes.filter((fix) => fix.status === 'FIXED').length,
        blockingIssues: [],
        fixes: appFixes,
        attempts: {
            maxPerFailure: policy.maxFixAttemptsPerFailure,
            previous: previous?.attempts?.current ?? {},
            current: {},
        },
        build: { status: NOT_RUN, developmentBuild: NOT_RUN, location: null, details: null },
        expoGo: { status: 'UNKNOWN', details: 'Not claimed until a real Expo Go launch is validated.' },
        manualQaState: 'NOT_STARTED',
        manualQaIssues: [],
        safety: {
            productionSubmission: 'DISABLED',
            productionData: 'DISABLED',
            serviceRoleInMobile: 'NOT_ALLOWED',
        },
    };
    for (const stage of CORE_TEST_STAGES) result.tests[stage] = NOT_RUN;
    return result;
}

function setStage(result, stage, value) {
    result.stages[stage] = value;
    if (Object.prototype.hasOwnProperty.call(result.tests, stage)) result.tests[stage] = value.status;
}

function transition(result, state) {
    result.stateHistory ??= [];
    result.state = state;
    const last = result.stateHistory?.at(-1)?.state;
    if (last !== state) result.stateHistory.push({ state, timestamp: now() });
}

function blockingIssue(result, stage, value) {
    if (!value.blocking) return;
    const previousAttempt = result.attempts?.previous?.[stage]?.attempts ?? 0;
    const rawAttempts = previousAttempt + 1;
    const attempts = Math.min(rawAttempts, policy.maxFixAttemptsPerFailure);
    if (result.attempts) {
        result.attempts.current[stage] = {
            attempts,
            totalAttempts: rawAttempts,
            max: policy.maxFixAttemptsPerFailure,
            classification: value.classification,
            diagnosis: value.diagnosis,
        };
    }
    const boundedDiagnosis = attempts > policy.maxFixAttemptsPerFailure
        ? `The same stage remains unresolved after ${policy.maxFixAttemptsPerFailure} bounded attempt(s); no increasingly risky automatic change was made.`
        : value.diagnosis;
    result.blockingIssues.push({
        stage,
        status: value.status,
        classification: value.classification,
        diagnosis: boundedDiagnosis,
        evidence: value.evidence,
        log: value.log,
        attempt: attempts,
        maxAttempts: policy.maxFixAttemptsPerFailure,
    });
}

function envValueConfigured(name) {
    return Boolean(process.env[name] && String(process.env[name]).trim());
}

function requiredQaEnvironment() {
    return Object.fromEntries(policy.requiredQaEnvironmentVariables.map((name) => [name, envValueConfigured(name)]));
}

function scanForMobileServiceRole(app) {
    const candidates = [];
    const walk = (directory) => {
        if (!fs.existsSync(directory)) return;
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            if (['node_modules', '.expo', 'dist', 'coverage', '.next'].includes(entry.name)) continue;
            const absolute = path.join(directory, entry.name);
            if (entry.isDirectory()) walk(absolute);
            else if (/\.(?:ts|tsx|js|jsx|mjs|json)$/.test(entry.name) && !/^(package-lock|app|eas)\.json$/.test(entry.name)) candidates.push(absolute);
        }
    };
    walk(app.root);
    return candidates.filter((filePath) => {
        const source = fs.readFileSync(filePath, 'utf8');
        return /SUPABASE_SERVICE_ROLE|service[_-]?role|serviceRole/i.test(source);
    }).map((filePath) => relativeToRepo(repoRoot, filePath));
}

function environmentStage(app, result, artifactDirectory) {
    const appManifest = readJson(path.join(app.root, 'package.json'));
    const appJson = readJson(path.join(app.root, 'app.json'))?.expo ?? readJson(path.join(app.root, 'app.json'));
    const checks = [];
    const warnings = [];
    const nodeMajor = Number(process.versions.node.split('.')[0]);
    const npmVersion = spawnSync('npm', ['--version'], { cwd: repoRoot, encoding: 'utf8' });
    const packageLock = fs.existsSync(path.join(repoRoot, 'package-lock.json'));
    const configValid = Boolean(appJson?.name && appJson?.slug && appJson?.ios?.bundleIdentifier && appJson?.android?.package);
    const serviceRoleFiles = scanForMobileServiceRole(app);
    const qaEnv = requiredQaEnvironment();

    checks.push(`Node ${process.versions.node} (required major >= ${policy.requiredNodeMajor})`);
    checks.push(`npm ${String(npmVersion.stdout ?? '').trim() || 'unknown'} with repository packageManager ${policy.packageManager}`);
    checks.push(`React Native ${app.reactNativeVersion}; Expo SDK ${app.expoSdk}`);
    checks.push(`Expo config ${app.configFiles.join(', ')}`);
    checks.push(`iOS bundle identifier ${app.bundleId}; Android package ${app.androidPackage}`);
    checks.push(`app scheme ${app.scheme}; slug ${app.slug}; version ${app.version}`);
    checks.push(`native project mode: ${fs.existsSync(path.join(app.root, 'ios')) || fs.existsSync(path.join(app.root, 'android')) ? 'native folders present' : 'managed Expo (native folders not checked in)'}`);
    checks.push(`iOS simulator/build host: ${commandExists('xcodebuild') ? 'xcodebuild available' : 'xcodebuild unavailable'}; Android host: ${commandExists('adb') ? 'adb available' : 'adb unavailable'}`);

    if (nodeMajor < policy.requiredNodeMajor) warnings.push(`Node major ${nodeMajor} is below the supported baseline.`);
    if (!packageLock) warnings.push('The canonical repository package-lock.json is missing.');
    if (!appManifest?.scripts?.typecheck) warnings.push('No app typecheck script is declared.');
    if (!app.hasEasConfig) warnings.push('No eas.json development profile is present.');
    if (!commandExists('xcodebuild')) warnings.push('xcodebuild/xcrun is unavailable in this environment; iOS native build and simulator UI validation cannot run here.');
    if (!commandExists('adb')) warnings.push('adb is unavailable in this environment; Android emulator validation cannot run here.');
    const missingQa = Object.entries(qaEnv).filter(([, configured]) => !configured).map(([name]) => name);
    if (missingQa.length) warnings.push(`Dedicated QA environment variables not configured: ${missingQa.join(', ')}`);
    if (serviceRoleFiles.length) warnings.push(`Potential service-role reference found in mobile files: ${serviceRoleFiles.join(', ')}`);

    const value = stageResult(
        nodeMajor >= policy.requiredNodeMajor && packageLock && configValid && serviceRoleFiles.length === 0 ? PASS : FAIL,
        checks,
        {
            classification: serviceRoleFiles.length ? SECURITY_FAILURE : null,
            diagnosis: serviceRoleFiles.length ? 'A service-role reference is present in mobile code/config and must be removed before any build.' : null,
            applicable: true,
            blocking: nodeMajor < policy.requiredNodeMajor || !packageLock || !configValid || serviceRoleFiles.length > 0,
            warnings,
        },
    );
    setStage(result, 'environment', value);
    blockingIssue(result, 'environment', value);
    return { qaEnv, serviceRoleFiles };
}

function installStage(result, _runId, app, artifactDirectory, options) {
    if (options.noInstall) {
        const value = stageResult(fs.existsSync(path.join(repoRoot, 'node_modules')) ? PASS : ENVIRONMENT_FAILURE,
            options.noInstall
                ? 'Dependency installation was explicitly skipped; existing node_modules presence was checked.'
                : '', {
                classification: fs.existsSync(path.join(repoRoot, 'node_modules')) ? null : 'ENVIRONMENT_FAILURE',
                diagnosis: fs.existsSync(path.join(repoRoot, 'node_modules')) ? 'Skipped by command-line option.' : 'node_modules is absent and installation was skipped.',
                applicable: true,
                blocking: !fs.existsSync(path.join(repoRoot, 'node_modules')),
                warnings: ['Use the repository lockfile with npm ci for a clean dependency validation.'],
            });
        setStage(result, 'install', value);
        blockingIssue(result, 'install', value);
        return value;
    }
    const command = ['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'];
    const execution = runCommand({ stage: 'install', command, cwd: repoRoot, artifactDirectory, timeout: 20 * 60_000 });
    const value = stageResult(execution.ok ? PASS : ENVIRONMENT_FAILURE, execution.ok ? 'npm ci completed from package-lock.json.' : 'npm ci failed; the lockfile was not changed by the runner.', {
        classification: execution.ok ? null : classifyFailure('install', execution.output, { environment: true }),
        diagnosis: execution.ok ? 'Completed.' : diagnose('install', execution.output, execution.exitCode, execution.spawnError),
        command: command.join(' '),
        log: execution.log,
        counts: execution.counts,
        durationMs: execution.durationMs,
        applicable: true,
        blocking: !execution.ok,
    });
    setStage(result, 'install', value);
    blockingIssue(result, 'install', value);
    return value;
}

function scriptFor(app, stage) {
    const scriptMap = {
        lint: app.scripts.lint,
        typecheck: app.scripts.typecheck,
        unit: app.scripts.unit,
        ui: app.scripts.ui,
        backend: app.scripts.backend,
        integration: app.scripts.integration,
        legacy: app.scripts.legacy,
        core: app.scripts.core,
        fullSuite: app.scripts.fullSuite,
        build: app.scripts.buildCheck,
    };
    return scriptMap[stage] ?? null;
}

function runAppScript(result, app, stage, artifactDirectory, options, { applicable = true, blocking = true } = {}) {
    const script = scriptFor(app, stage);
    if (!applicable) {
        const value = stageResult(NA, 'This check is not applicable to the discovered app architecture.', { applicable: false, blocking: false });
        setStage(result, stage, value);
        return value;
    }
    if (!script) {
        const value = stageResult(ENVIRONMENT_FAILURE, `No ${stage} script is declared in ${app.packageJson}; the runner did not invent a test or mark it as passed.`, {
            classification: 'ENVIRONMENT_FAILURE',
            diagnosis: `Add a real ${stage} test command for this app or document why the category is genuinely not applicable.`,
            applicable: true,
            blocking,
        });
        setStage(result, stage, value);
        blockingIssue(result, stage, value);
        return value;
    }
    const command = ['npm', 'run', script.name, `--workspace=${app.packageName}`];
    const execution = runCommand({ stage, command, cwd: repoRoot, artifactDirectory, timeout: stage === 'build' ? 20 * 60_000 : 15 * 60_000 });
    const value = stageResult(execution.ok ? PASS : FAIL, execution.ok ? `${script.name} completed.` : `${script.name} exited with code ${execution.exitCode}.`, {
        classification: execution.ok ? null : classifyFailure(stage, execution.output),
        diagnosis: execution.ok ? 'Completed.' : diagnose(stage, execution.output, execution.exitCode, execution.spawnError),
        command: command.join(' '),
        log: execution.log,
        counts: execution.counts,
        durationMs: execution.durationMs,
        applicable: true,
        blocking: !execution.ok && blocking,
    });
    setStage(result, stage, value);
    blockingIssue(result, stage, value);
    return value;
}

function checkSecurityAndBackend(result, app, artifactDirectory, options, envInfo) {
    const hasBackend = app.capabilities.backend;
    const hasAuth = app.capabilities.authentication;
    const hasRls = app.capabilities.rls && app.capabilities.tenantIsolation;
    const safeQaConfigured = Object.values(envInfo.qaEnv).every(Boolean);
    const supabaseCli = commandExists('supabase');

    if (!hasBackend) {
        for (const stage of ['backend', 'database', 'security', 'rls']) {
            const value = stageResult(NA, 'No backend, database, or Supabase integration was detected for this app.', { applicable: false, blocking: false });
            setStage(result, stage, value);
        }
    } else {
        if (app.scripts.backend) {
            runAppScript(result, app, 'backend', artifactDirectory, options, { applicable: true, blocking: true });
        } else {
            const value = stageResult(ENVIRONMENT_FAILURE, 'Backend detected, but no live backend test command is declared.', {
                classification: 'ENVIRONMENT_FAILURE',
                diagnosis: 'No real backend test command is declared. Frontend API-boundary mocks are reported separately and are not a live backend pass.',
                blocking: true,
            });
            setStage(result, 'backend', value);
            blockingIssue(result, 'backend', value);
        }

        const appSecurityPatterns = {
            'operix-invoice': /operix_invoice_mobile|invoice_customer/i,
            'operix-hr': /operix_hr/i,
            'operix-booking': /operix_booking/i,
            'operix-desk': /operix_desk/i,
            'operix-scanner': /scanner/i,
            'operix-tracker': /tracker/i,
        };
        const appSecurityPattern = appSecurityPatterns[app.id] ?? new RegExp(app.id.replace(/-/g, '_'), 'i');
        const dbTestFiles = fs.existsSync(path.join(repoRoot, 'supabase', 'tests'))
            ? fs.readdirSync(path.join(repoRoot, 'supabase', 'tests')).filter((file) => appSecurityPattern.test(file))
            : [];
        const dbEvidence = dbTestFiles.length ? `Supabase SQL test files discovered: ${dbTestFiles.join(', ')}` : 'No app-specific Supabase SQL test file was discovered.';
        let databaseValue;
        if (supabaseCli) {
            const command = ['supabase', 'test', 'db'];
            const execution = runCommand({ stage: 'database', command, cwd: repoRoot, artifactDirectory, timeout: 15 * 60_000 });
            databaseValue = stageResult(execution.ok ? PASS : FAIL, [dbEvidence, execution.ok ? 'supabase test db completed.' : `supabase test db exited with code ${execution.exitCode}.`], {
                classification: execution.ok ? null : classifyFailure('database', execution.output),
                diagnosis: execution.ok ? 'Completed against the configured local database.' : diagnose('database', execution.output, execution.exitCode, execution.spawnError),
                command: command.join(' '), log: execution.log, counts: execution.counts, durationMs: execution.durationMs, blocking: !execution.ok,
            });
        } else {
            databaseValue = stageResult(ENVIRONMENT_FAILURE, [dbEvidence, 'Supabase CLI is not installed; no remote database calls were attempted.'], {
                classification: 'ENVIRONMENT_FAILURE',
                diagnosis: 'Install/configure a local or dedicated QA Supabase environment before claiming database or RLS coverage.',
                blocking: true,
                warnings: safeQaConfigured ? [] : ['Required OPERIX_QA_* variables are not configured.'],
            });
        }
        setStage(result, 'database', databaseValue);
        blockingIssue(result, 'database', databaseValue);

        if (hasAuth) {
            const value = stageResult(ENVIRONMENT_FAILURE, safeQaConfigured
                ? 'Authentication is detected, but no independent auth test harness is declared.'
                : 'Authentication is detected, but dedicated QA accounts are not configured.', {
                classification: 'ENVIRONMENT_FAILURE',
                diagnosis: 'Run login, invalid login, expired/restored session, protected-route, and backend-token checks with non-production accounts.',
                blocking: true,
            });
            setStage(result, 'authentication', value);
            blockingIssue(result, 'authentication', value);
        } else {
            setStage(result, 'authentication', stageResult(NA, 'No authentication surface was detected.', { applicable: false, blocking: false }));
        }

        const serviceRoleFiles = envInfo.serviceRoleFiles;
        let securityValue;
        if (serviceRoleFiles.length) {
            securityValue = stageResult(FAIL, `Service-role references found in mobile files: ${serviceRoleFiles.join(', ')}`, {
                classification: SECURITY_FAILURE,
                diagnosis: 'Remove service-role access from mobile code/config. Public mobile clients must use publishable/anon access with RLS.',
                blocking: true,
            });
        } else if (!safeQaConfigured || !supabaseCli) {
            securityValue = stageResult(ENVIRONMENT_FAILURE, 'Static mobile secret scan passed, but live authorization/RLS tests were not executed.', {
                classification: 'ENVIRONMENT_FAILURE',
                diagnosis: 'Configure a dedicated QA Supabase environment, two isolated users/tenants, and run the app-specific security SQL suite.',
                blocking: true,
                warnings: ['Static scan is not a substitute for actual backend authorization tests.'],
            });
        } else {
            securityValue = stageResult(ENVIRONMENT_FAILURE, 'A live security harness is not wired for this app; no security pass was fabricated.', {
                classification: 'ENVIRONMENT_FAILURE',
                diagnosis: 'Add the app-specific Tenant A/Tenant B harness before release readiness.',
                blocking: true,
            });
        }
        setStage(result, 'security', securityValue);
        blockingIssue(result, 'security', securityValue);

        if (!hasRls) {
            const value = stageResult(NA, 'Tenant isolation/RLS is not applicable based on the discovered app signals.', { applicable: false, blocking: false });
            setStage(result, 'rls', value);
        } else {
            const value = stageResult(ENVIRONMENT_FAILURE, 'Tenant signals were detected, but live cross-tenant SELECT/INSERT/UPDATE/DELETE/RPC checks were not executed.', {
                classification: 'ENVIRONMENT_FAILURE',
                diagnosis: 'Run deterministic Tenant A/Tenant B tests against the dedicated QA database and verify actual resulting state.',
                blocking: true,
            });
            setStage(result, 'rls', value);
            blockingIssue(result, 'rls', value);
        }
    }
}

function e2eStage(result, app, artifactDirectory, options, envInfo) {
    const gateBlocking = !options.ci;
    if (options.noE2e) {
        const value = stageResult(NOT_RUN, 'E2E was explicitly disabled for this run.', { blocking: gateBlocking, classification: 'ENVIRONMENT_FAILURE', diagnosis: 'Run without --no-e2e for the release gate.' });
        setStage(result, 'e2e', value);
        blockingIssue(result, 'e2e', value);
        return value;
    }
    if (!app.capabilities.e2e) {
        const value = stageResult(ENVIRONMENT_FAILURE, 'No Maestro or Detox flow/configuration was discovered for this app.', {
            classification: 'ENVIRONMENT_FAILURE', diagnosis: 'Add app-specific real-device flows or document why E2E is genuinely not applicable.', blocking: gateBlocking,
        });
        setStage(result, 'e2e', value);
        blockingIssue(result, 'e2e', value);
        return value;
    }
    if (app.capabilities.e2eFramework === 'Maestro' && !commandExists('maestro')) {
        const value = stageResult(ENVIRONMENT_FAILURE, `Maestro flows exist, but the Maestro CLI is not installed in this environment${commandExists('xcrun') ? '' : '; xcrun is also unavailable'}.`, {
            classification: 'ENVIRONMENT_FAILURE', diagnosis: diagnose('e2e', '', 127, new Error('maestro unavailable')), blocking: gateBlocking,
        });
        setStage(result, 'e2e', value);
        blockingIssue(result, 'e2e', value);
        return value;
    }
    const required = ['OPERIX_QA_E2E_EMAIL', 'OPERIX_QA_E2E_PASSWORD', 'OPERIX_QA_E2E_SUPABASE_URL', 'OPERIX_QA_E2E_CUSTOMER_ID', 'OPERIX_QA_E2E_PRODUCT_ID'];
    const missing = required.filter((name) => !envValueConfigured(name));
    if (missing.length) {
        const value = stageResult(ENVIRONMENT_FAILURE, `E2E was not started; dedicated QA E2E variables are missing: ${missing.join(', ')}`, {
            classification: 'ENVIRONMENT_FAILURE', diagnosis: 'Use dedicated QA accounts/data and never production credentials.', blocking: gateBlocking,
        });
        setStage(result, 'e2e', value);
        blockingIssue(result, 'e2e', value);
        return value;
    }
    const script = app.scripts.e2e;
    if (!script) {
        const value = stageResult(ENVIRONMENT_FAILURE, 'E2E tooling is present, but no app E2E script is declared.', { classification: 'ENVIRONMENT_FAILURE', diagnosis: 'Add a real E2E command for this app.', blocking: gateBlocking });
        setStage(result, 'e2e', value);
        blockingIssue(result, 'e2e', value);
        return value;
    }
    const command = ['npm', 'run', script.name, `--workspace=${app.packageName}`];
    const execution = runCommand({ stage: 'e2e', command, cwd: repoRoot, artifactDirectory, env: safeChildEnv(), timeout: 30 * 60_000 });
    const value = stageResult(execution.ok ? PASS : FAIL, execution.ok ? `${script.name} completed on a real device.` : `${script.name} exited with code ${execution.exitCode}.`, {
        classification: execution.ok ? null : classifyFailure('e2e', execution.output), diagnosis: execution.ok ? 'Completed.' : diagnose('e2e', execution.output, execution.exitCode, execution.spawnError), command: command.join(' '), log: execution.log, counts: execution.counts, durationMs: execution.durationMs, blocking: !execution.ok && gateBlocking,
    });
    setStage(result, 'e2e', value);
    blockingIssue(result, 'e2e', value);
    return value;
}

function visualStage(result, app, artifactDirectory, options) {
    const gateBlocking = !options.ci;
    if (options.noVisual) {
        const value = stageResult(NOT_RUN, 'Visual regression was explicitly disabled for this run.', { classification: 'ENVIRONMENT_FAILURE', diagnosis: 'Run without --no-visual for the release gate.', blocking: gateBlocking });
        setStage(result, 'visual', value);
        blockingIssue(result, 'visual', value);
        return value;
    }
    const baselineDirectory = path.join(baselinesRoot, app.id);
    const baselineFiles = fs.existsSync(baselineDirectory)
        ? fs.readdirSync(baselineDirectory).filter((file) => file.endsWith('.png'))
        : [];
    if (!baselineFiles.length) {
        const value = stageResult(VISUAL_REVIEW_REQUIRED, 'No approved baseline screenshots exist for this app. Actual screenshots cannot be compared yet.', {
            classification: 'VISUAL_CHANGE_EXPECTED', diagnosis: 'Run the real-device screenshot flow, review baseline/actual/diff artifacts, then explicitly approve baselines.', blocking: gateBlocking, warnings: ['Baseline update is never automatic.'],
        });
        setStage(result, 'visual', value);
        blockingIssue(result, 'visual', value);
        return value;
    }
    const actualDirectory = path.join(artifactDirectory, 'visual', 'actual');
    const missingActual = baselineFiles.filter((file) => !fs.existsSync(path.join(actualDirectory, file)));
    if (missingActual.length) {
        const value = stageResult(ENVIRONMENT_FAILURE, `Baselines exist, but actual screenshots are missing: ${missingActual.join(', ')}`, {
            classification: 'ENVIRONMENT_FAILURE', diagnosis: 'Run the real-device visual flow and preserve actual/diff artifacts.', blocking: gateBlocking,
        });
        setStage(result, 'visual', value);
        blockingIssue(result, 'visual', value);
        return value;
    }
    const diffDirectory = path.join(artifactDirectory, 'visual', 'diff');
    const comparison = comparePngDirectories(baselineDirectory, actualDirectory, diffDirectory);
    writeJson(path.join(artifactDirectory, 'visual', 'comparison.json'), comparison);
    if (!comparison.available) {
        const value = stageResult(ENVIRONMENT_FAILURE, comparison.reason, { classification: 'ENVIRONMENT_FAILURE', diagnosis: 'Install the repository visual comparison dependency or configure the approved visual runner.', blocking: gateBlocking });
        setStage(result, 'visual', value);
        blockingIssue(result, 'visual', value);
        return value;
    }
    if (comparison.differences > 0) {
        const value = stageResult(VISUAL_REVIEW_REQUIRED, `${comparison.differences} of ${baselineFiles.length} screenshot(s) differ; baseline was not updated.`, { classification: 'VISUAL_CHANGE_EXPECTED', diagnosis: 'Review baseline, actual, and diff PNGs before using the explicit baseline update command.', blocking: gateBlocking, warnings: comparison.results.filter((item) => item.status !== 'PASS').map((item) => `${item.file}: ${item.status}`) });
        setStage(result, 'visual', value);
        blockingIssue(result, 'visual', value);
        return value;
    }
    const value = stageResult(PASS, `Pixel comparison passed for ${baselineFiles.length} approved baseline(s).`, { blocking: false });
    setStage(result, 'visual', value);
    return value;
}

function performanceStage(result, app) {
    const source = app.sourceText;
    const warnings = [];
    const intervals = (source.match(/setInterval\s*\(/g) ?? []).length;
    const effects = (source.match(/useEffect\s*\(/g) ?? []).length;
    const apiCalls = (source.match(/\.from\s*\(|fetch\s*\(|axios\./g) ?? []).length;
    if (intervals > 3) warnings.push(`${intervals} setInterval call sites require lifecycle review.`);
    if (effects > 60) warnings.push(`${effects} useEffect call sites detected; inspect high-frequency screens if runtime warnings appear.`);
    if (apiCalls > 100) warnings.push(`${apiCalls} API call sites detected; inspect list screens for repeated requests.`);
    const value = stageResult(PASS, `Static sanity scan completed: ${intervals} intervals, ${effects} effects, ${apiCalls} API call sites.`, { warnings, blocking: false });
    setStage(result, 'performance', value);
    return value;
}

function consoleStage(result, options) {
    const value = stageResult(ENVIRONMENT_FAILURE, 'Runtime console capture requires the real-device E2E/debug session; no runtime claim was made from static code.', {
        classification: 'ENVIRONMENT_FAILURE', diagnosis: 'Capture exceptions, unhandled rejections, functional React Native warnings, and network failures during simulator/manual preparation.', blocking: !options.ci,
    });
    setStage(result, 'console', value);
    blockingIssue(result, 'console', value);
    return value;
}

function buildStages(result, app, artifactDirectory, options) {
    if (options.noBuild) {
        const value = stageResult(NOT_RUN, 'Build was explicitly disabled for this run.', { classification: BUILD_FAILURE, diagnosis: 'Run without --no-build for the release gate.', blocking: !options.ci });
        setStage(result, 'build', value);
        blockingIssue(result, 'build', value);
        result.build.status = NOT_RUN;
    } else {
        const value = runAppScript(result, app, 'build', artifactDirectory, options, { applicable: true, blocking: true });
        result.build.status = value.status === PASS ? 'READY' : BUILD_FAILURE;
        result.build.location = value.status === PASS ? '/tmp Expo web export smoke build (not a release artifact)' : null;
        result.build.details = value.evidence;
    }

    const criticalBeforeDevBuild = result.blockingIssues.length === 0;
    if (!app.hasEasConfig || !app.eas?.build?.development) {
        const value = stageResult(BUILD_FAILURE, 'No eas.json development profile is available for this app.', { classification: BUILD_FAILURE, diagnosis: 'Add/validate a development profile without changing production release versions.', blocking: !options.ci });
        setStage(result, 'developmentBuild', value);
        blockingIssue(result, 'developmentBuild', value);
        result.build.developmentBuild = BUILD_FAILURE;
    } else if (!criticalBeforeDevBuild) {
        const value = stageResult(NOT_RUN, 'Development build was not started because critical automated gates remain unresolved.', { classification: 'ENVIRONMENT_FAILURE', diagnosis: 'Resolve the earlier blocking issues, then rerun the full app pipeline.', blocking: !options.ci });
        setStage(result, 'developmentBuild', value);
        blockingIssue(result, 'developmentBuild', value);
        result.build.developmentBuild = NOT_RUN;
    } else if (!options.prepareBuild) {
        const value = stageResult(NOT_RUN, 'Development profile is valid, but remote/native build creation is opt-in and was not requested.', { classification: 'ENVIRONMENT_FAILURE', diagnosis: 'Run with --prepare-build on a configured EAS/native environment. Submission is still disabled.', blocking: !options.ci });
        setStage(result, 'developmentBuild', value);
        blockingIssue(result, 'developmentBuild', value);
        result.build.developmentBuild = NOT_RUN;
    } else if (!commandExists('eas') && !fs.existsSync(path.join(repoRoot, 'node_modules', '.bin', 'eas'))) {
        const value = stageResult(ENVIRONMENT_FAILURE, 'EAS CLI is not installed; no development build was started.', { classification: 'ENVIRONMENT_FAILURE', diagnosis: 'Install the repository-pinned EAS CLI or use the configured CI/native build host.', blocking: !options.ci });
        setStage(result, 'developmentBuild', value);
        blockingIssue(result, 'developmentBuild', value);
        result.build.developmentBuild = ENVIRONMENT_FAILURE;
    } else {
        const command = [fs.existsSync(path.join(repoRoot, 'node_modules', '.bin', 'eas')) ? path.join(repoRoot, 'node_modules', '.bin', 'eas') : 'eas', 'build', '--profile', 'development', '--platform', 'ios', '--non-interactive', '--no-wait'];
        const execution = runCommand({ stage: 'developmentBuild', command, cwd: app.root, artifactDirectory, env: safeChildEnv({ allowEas: true }), timeout: 30 * 60_000 });
        const value = stageResult(execution.ok ? PASS : BUILD_FAILURE, execution.ok ? 'EAS development build was queued; submission was not requested.' : `EAS development build command exited with code ${execution.exitCode}.`, { classification: execution.ok ? null : classifyFailure('developmentBuild', execution.output, { build: true }), diagnosis: execution.ok ? 'Build queued for manual QA; inspect the EAS URL in the sanitized log.' : diagnose('developmentBuild', execution.output, execution.exitCode, execution.spawnError), command: command.join(' '), log: execution.log, counts: execution.counts, durationMs: execution.durationMs, blocking: !execution.ok && !options.ci });
        setStage(result, 'developmentBuild', value);
        blockingIssue(result, 'developmentBuild', value);
        result.build.developmentBuild = value.status === PASS ? 'READY' : BUILD_FAILURE;
        result.build.location = value.status === PASS ? value.log : result.build.location;
    }
}

function finalize(result) {
    const securityFailure = result.blockingIssues.some((issue) => issue.classification === SECURITY_FAILURE);
    const securityBlocking = result.blockingIssues.some((issue) => issue.stage === 'security' || issue.stage === 'rls' || issue.classification === SECURITY_FAILURE);
    const buildFailed = ['build', 'developmentBuild'].some((stage) => [FAIL, BUILD_FAILURE].includes(result.stages[stage]?.status));
    const visualReview = result.stages.visual?.status === VISUAL_REVIEW_REQUIRED;
    if (securityFailure) transition(result, 'BLOCKED_SECURITY');
    else if (buildFailed) transition(result, 'BUILD_FAILED');
    else if (securityBlocking) transition(result, 'BLOCKED');
    else if (visualReview) transition(result, VISUAL_REVIEW_REQUIRED);
    else if (result.blockingIssues.length) transition(result, 'BLOCKED');
    else transition(result, 'READY_FOR_MANUAL_QA');
    result.finishedAt = now();
    result.tests.security = result.stages.security?.status ?? NOT_RUN;
    result.tests.rls = result.stages.rls?.status ?? NOT_RUN;
    return result;
}

function updateTestAliases(result) {
    const aliases = ['lint', 'typecheck', 'unit', 'ui', 'backend', 'integration', 'database', 'authentication', 'security', 'rls', 'e2e', 'visual', 'build'];
    for (const name of aliases) result.tests[name] = result.stages[name]?.status ?? NOT_RUN;
}

function markdownCell(value) {
    return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function latestResults(apps) {
    return apps.map((app) => readJson(path.join(resultsRoot, app.id, 'qa-results.json'))).filter(Boolean);
}

function appReportFile(app) {
    return path.join(docsRoot, `${app.id.toUpperCase()}-QA-REPORT.md`);
}

function e2eReportFile(app) {
    return path.join(docsRoot, `${app.id.toUpperCase()}-E2E-FLOWS.md`);
}

function routeSignals(app) {
    const source = app.sourceText;
    const routeNames = [...source.matchAll(/<[A-Za-z0-9_.]+\.Screen\s+name\s*=\s*["']([^"']+)["']/g)].map((match) => match[1]);
    const navigations = [...source.matchAll(/(?:\b(?:navigation|mockNavigation)|props\.navigation)\.(?:navigate|replace|push)\s*\(\s*["']([^"']+)["']/g)].map((match) => match[1]);
    return [...new Set([...routeNames, ...navigations])].filter((route) => route.length < 80).sort();
}

function inferredFlows(app) {
    const routes = routeSignals(app);
    const flowById = {
        'operix-invoice': ['Login', 'Dashboard/Home', 'Customers → create customer', 'Products → create product', 'Invoices → create invoice', 'Payments', 'Document/report preview', 'Settings → language (English/Albanian)', 'Logout'],
        'operix-hr': ['Login', 'HR dashboard', 'Employee directory → create/update employee', 'Attendance/time', 'Leave request/approval', 'Payroll', 'Logout'],
        'operix-booking': ['Login', 'Home', 'Bookings list', 'Calendar', 'Create booking', 'Booking detail/workflow action', 'Logout'],
        'operix-desk': ['Login', 'Home', 'Floor plan/resources', 'Bookings', 'Reserve resource', 'Notifications/More', 'Logout'],
        'operix-tracker': ['Login', 'Time/location dashboard', 'Create/update tracking record', 'Protected screen access', 'Logout'],
        'operix-scanner': ['Login', 'Scanner permission state', 'Scan workflow', 'Result/error state', 'Logout'],
    };
    return { steps: flowById[app.id] ?? ['Login', ...routes, 'Logout'], routes };
}

function generateE2eDoc(app, result) {
    const flows = inferredFlows(app);
    const lines = [
        `# ${app.name} E2E flows`,
        '',
        `- App: ${app.name}`,
        `- Path: \`${app.path}\``,
        `- Standard: ${app.capabilities.e2eFramework} (real simulator/emulator only)`,
        `- QA data: dedicated non-production accounts/tenants only`,
        `- Latest execution: ${result?.stages?.e2e?.status ?? NOT_RUN}`,
        '',
        '## Discovered routes',
        '',
        flows.routes.length ? flows.routes.map((route) => `- \`${route}\``).join('\n') : '- No static route names were confidently extracted.',
        '',
        '## Major user journey',
        '',
        flows.steps.map((step, index) => `${index + 1}. ${step}`).join('\n'),
        '',
        '## Flow requirements',
        '',
        '- Use stable accessibility labels/test IDs following `<screen>-<element>-<action>`.',
        '- Assert loading, empty, error, protected-route, and success states where they exist.',
        '- Tag all created data with the QA namespace and clean only that data.',
        '- Capture console/runtime/network failures as separate evidence.',
        '- Do not run against production or use customer accounts.',
        '',
        '## Current limitation',
        '',
        result?.stages?.e2e?.evidence?.map((item) => `- ${item}`).join('\n') ?? '- This app has not been run by the central pipeline yet.',
        '',
    ];
    ensureDir(path.dirname(e2eReportFile(app)));
    fs.writeFileSync(e2eReportFile(app), lines.join('\n'));
}

function generateAppReport(app, result) {
    const stageRows = Object.entries(REPORT_STAGE_LABELS).map(([stage, label]) => {
        const value = result?.stages?.[stage];
        return `| ${label} | ${markdownCell(value?.status ?? NOT_RUN)} | ${markdownCell(value?.evidence?.join('; ') ?? 'Not run')} |`;
    });
    const issueRows = result?.blockingIssues?.length
        ? result.blockingIssues.map((issue) => `| ${issue.stage} | ${issue.status} | ${issue.classification ?? 'UNKNOWN'} | ${markdownCell(issue.diagnosis)} |`).join('\n')
        : '| — | — | — | None recorded |';
    const lines = [
        `# ${app.name} QA report`,
        '',
        `- App: ${app.name}`,
        `- Repository: \`${result?.repository ?? repoRoot}\``,
        `- Path: \`${app.path}\``,
        `- Branch: \`${result?.branch ?? 'unknown'}\``,
        `- Commit tested: \`${result?.commit ?? 'unknown'}\``,
        `- Run: \`${result?.runId ?? 'not tested'}\``,
        `- Frameworks: ${app.framework}; Expo SDK ${app.expoSdk}; React Native ${app.reactNativeVersion}`,
        `- Backend: ${app.backend}`,
        '',
        '## Automated results',
        '',
        '| Check | Status | Evidence |',
        '| --- | --- | --- |',
        ...stageRows,
        '',
        '## Test counts',
        '',
        `- Unit: ${result?.stages?.unit?.counts?.tests ? `${result.stages.unit.counts.tests.passed}/${result.stages.unit.counts.tests.total}` : 'not reported by command'}`,
        `- UI: ${result?.stages?.ui?.counts?.tests ? `${result.stages.ui.counts.tests.passed}/${result.stages.ui.counts.tests.total}` : 'not reported by command'}`,
        `- Backend: ${result?.stages?.backend?.counts?.tests ? `${result.stages.backend.counts.tests.passed}/${result.stages.backend.counts.tests.total}` : 'not reported by command'}`,
        `- Frontend/API-boundary integration: ${result?.stages?.integration?.counts?.tests ? `${result.stages.integration.counts.tests.passed}/${result.stages.integration.counts.tests.total}` : 'not reported by command'}`,
        `- E2E: ${result?.stages?.e2e?.counts?.tests ? `${result.stages.e2e.counts.tests.passed}/${result.stages.e2e.counts.tests.total}` : 'not reported by command'}`,
        `- Bugs found: ${result?.bugsFound ?? 0}`,
        `- Bugs fixed: ${result?.bugsFixed ?? 0}`,
        `- Retry policy: max ${result?.attempts?.maxPerFailure ?? policy.maxFixAttemptsPerFailure} bounded attempt(s) per repeated failure; no infinite fix loop`,
        `- Current failure attempts: ${result?.attempts?.current ? Object.entries(result.attempts.current).map(([stage, attempt]) => `${stage} ${attempt.attempts}/${attempt.max}`).join(', ') || 'none' : 'not recorded'}`,
        '',
        '## Blocking issues and failure classification',
        '',
        '| Stage | Status | Classification | Diagnosis |',
        '| --- | --- | --- | --- |',
        issueRows,
        '',
        '## Visual differences',
        '',
        `- Baseline policy: ${result?.stages?.visual?.status === PASS ? 'comparison artifacts present' : 'no automatic baseline approval'}`,
        `- Evidence: ${result?.stages?.visual?.evidence?.join('; ') ?? 'not run'}`,
        '',
        '## Build and Expo',
        '',
        `- Build smoke: ${result?.build?.status ?? NOT_RUN}`,
        `- Development build: ${result?.build?.developmentBuild ?? NOT_RUN}`,
        `- Build details/location: ${result?.build?.location ?? 'not created'}`,
        `- Expo Go: ${result?.expoGo?.status ?? 'UNKNOWN'} — ${result?.expoGo?.details ?? 'not validated'}`,
        '- Submission: disabled by design; no TestFlight or App Store action is performed by this pipeline.',
        '',
        '## Final QA state',
        '',
        `**${result?.state ?? 'NOT_TESTED'}**`,
        '',
        'The automated gate stops before manual QA approval. A human must inspect the app and explicitly record the manual-QA decision.',
        '',
    ];
    fs.writeFileSync(appReportFile(app), lines.join('\n'));
}

function generateInventory(apps, results) {
    const resultById = new Map(results.map((result) => [result.appId, result]));
    const rows = apps.map((app) => {
        const result = resultById.get(app.id);
        return `| ${markdownCell(app.name)} | \`${app.path}\` | ${app.framework} | ${app.expoSdk} | ${app.bundleId} | ${markdownCell(app.backend)} | ${result?.state ?? NOT_RUN} | ${result?.build?.status ?? NOT_RUN} (dev: ${result?.build?.developmentBuild ?? NOT_RUN}) |`;
    });
    const lines = [
        '# OperiX mobile app inventory',
        '',
        `Generated: ${now()}`,
        '',
        'Only apps verified by the central discovery rules are included: an Expo dependency, a React Native dependency, an Expo app configuration, and an `OperiX` Expo app name.',
        '',
        '| App | Path | Framework | Expo SDK | Bundle ID | Backend | Test Status | Build Status |',
        '| --- | --- | --- | --- | --- | --- | --- | --- |',
        ...rows,
        '',
        '## Discovery notes',
        '',
        '- The canonical source is the `/root/OperiX` monorepo. Duplicate/standalone worktrees and the unrelated `IKDMOBILE` repository are not included.',
        '- Dynamic `app.config.*` files are inspected as source; static metadata is taken from `app.json` without printing environment values.',
        '- Test/build states are read from the latest machine-readable result when one exists. No result is fabricated for an unrun app.',
        '',
    ];
    ensureDir(path.dirname(path.join(docsRoot, 'OPERIX-MOBILE-APP-INVENTORY.md')));
    fs.writeFileSync(path.join(docsRoot, 'OPERIX-MOBILE-APP-INVENTORY.md'), lines.join('\n'));
}

function generateSummary(apps, results) {
    const resultById = new Map(results.map((result) => [result.appId, result]));
    const rows = apps.map((app) => {
        const result = resultById.get(app.id);
        const status = result?.state ?? NOT_RUN;
        return `| ${markdownCell(app.name)} | ${result?.tests?.unit ?? NOT_RUN} | ${result?.tests?.ui ?? NOT_RUN} | ${result?.tests?.backend ?? (app.capabilities.backend ? NOT_RUN : NA)} | ${result?.tests?.integration ?? NOT_RUN} | ${result?.tests?.security ?? (app.capabilities.backend ? NOT_RUN : NA)} | ${result?.tests?.e2e ?? NOT_RUN} | ${result?.tests?.visual ?? NOT_RUN} | ${result?.build?.status ?? NOT_RUN} (dev: ${result?.build?.developmentBuild ?? NOT_RUN}) | ${status} |`;
    });
    const lines = [
        '# OperiX mobile QA summary',
        '',
        `Generated: ${now()}`,
        '',
        'This is the first central status file to inspect. It reports actual runner evidence only. `READY_FOR_MANUAL_QA` is the terminal automated state; TestFlight/App Store submission is intentionally outside this pipeline.',
        '',
        '| App | Unit | UI | Backend | Integration | Security | E2E | Visual | Build | Status |',
        '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
        ...rows,
        '',
        '## State meanings',
        '',
        '- `NOT_TESTED`: no central run exists.',
        '- `BLOCKED` / `BLOCKED_SECURITY`: release gates are unresolved.',
        '- `VISUAL_REVIEW_REQUIRED`: screenshots need human review; baselines were not changed.',
        '- `READY_FOR_MANUAL_QA`: applicable automated checks and a development build are ready for human inspection.',
        '- `MANUAL_QA_APPROVED` does not start a release or submission; a future separately approved release workflow is required.',
        '',
        '## Safety and execution',
        '',
        '- Production data, production service-role keys, and automatic submission are disabled.',
        '- Run one app with `npm run qa:mobile:invoice` or all discovered apps with `npm run qa:mobile:all`.',
        '- Full logs and append-only run history are under `docs/qa/artifacts/` and `docs/qa/history/`.',
        '',
    ];
    fs.writeFileSync(path.join(docsRoot, 'OPERIX-MOBILE-QA-SUMMARY.md'), lines.join('\n'));
}

function generateDashboard(apps, results) {
    const resultById = new Map(results.map((result) => [result.appId, result]));
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
    const rows = apps.map((app) => {
        const result = resultById.get(app.id);
        const cell = (value) => `<td>${escapeHtml(value ?? NOT_RUN)}</td>`;
        return `<tr>${cell(app.name)}${cell(result?.generatedAt ?? NOT_RUN)}${cell(result?.branch ?? 'unknown')}<td><code>${escapeHtml((result?.commit ?? 'unknown').slice(0, 12))}</code></td>${cell(result?.tests?.lint)}${cell(result?.tests?.typecheck)}${cell(result?.tests?.unit)}${cell(result?.tests?.ui)}${cell(result?.tests?.backend)}${cell(result?.tests?.security)}${cell(result?.tests?.e2e)}${cell(result?.tests?.visual)}${cell(`${result?.build?.status ?? NOT_RUN} (dev: ${result?.build?.developmentBuild ?? NOT_RUN})`)}<td><strong>${escapeHtml(result?.state ?? NOT_RUN)}</strong></td></tr>`;
    }).join('\n');
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OperiX Mobile QA</title>
<style>body{font:14px system-ui,sans-serif;margin:24px;color:#172033}h1{margin-bottom:4px}p{color:#536078}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #dbe2ee;padding:8px;text-align:left;vertical-align:top}th{background:#eef3fb;position:sticky;top:0}code{font-size:11px}.PASS{color:#087443}.BLOCKED,.BLOCKED_SECURITY,.BUILD_FAILED,.VISUAL_REVIEW_REQUIRED{color:#a92828}</style></head>
<body><h1>OperiX Mobile QA</h1><p>Generated ${escapeHtml(now())}. Automated submission is disabled. Final gate: READY_FOR_MANUAL_QA.</p>
<table><thead><tr><th>App</th><th>Latest run</th><th>Branch</th><th>Commit</th><th>Lint</th><th>Typecheck</th><th>Unit</th><th>UI</th><th>Backend</th><th>Security</th><th>E2E</th><th>Visual</th><th>Build</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
<p>See <code>OPERIX-MOBILE-QA-SUMMARY.md</code>, per-app reports, sanitized logs, and append-only history in this directory.</p></body></html>
`;
    fs.writeFileSync(path.join(docsRoot, 'OPERIX-MOBILE-QA-DASHBOARD.html'), html);
}

function generateReports(apps, results) {
    ensureDir(docsRoot);
    for (const app of apps) {
        const result = results.find((candidate) => candidate.appId === app.id) ?? null;
        generateE2eDoc(app, result);
        generateAppReport(app, result);
    }
    generateInventory(apps, results);
    generateSummary(apps, results);
    generateDashboard(apps, results);
    const machine = {
        schemaVersion: 1,
        generatedAt: now(),
        repository: repoRoot,
        submission: 'DISABLED',
        apps: results,
    };
    writeJson(path.join(docsRoot, 'qa-results.json'), machine);
}

function persistResult(app, result) {
    const currentPath = path.join(resultsRoot, app.id, 'qa-results.json');
    const historyPath = path.join(historyRoot, app.id, `${result.runId}.json`);
    writeJson(currentPath, result);
    writeJson(historyPath, result);
}

function appById(apps, value) {
    const normalized = String(value ?? '').toLowerCase();
    return apps.find((app) => app.id === normalized || app.packageName.toLowerCase() === normalized || app.name.toLowerCase() === normalized || app.path.toLowerCase() === normalized);
}

function parseArgs(argv) {
    const args = [...argv];
    const command = args.shift() ?? 'all';
    const options = {
        noInstall: false, noE2e: false, noVisual: false, noBuild: false, prepareBuild: false,
        humanApproved: false, from: null, issue: null, ci: false,
    };
    const positional = [];
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === '--no-install') options.noInstall = true;
        else if (arg === '--no-e2e') options.noE2e = true;
        else if (arg === '--no-visual') options.noVisual = true;
        else if (arg === '--no-build') options.noBuild = true;
        else if (arg === '--prepare-build') options.prepareBuild = true;
        else if (arg === '--human-approved') options.humanApproved = true;
        else if (arg === '--ci') options.ci = true;
        else if (arg === '--from') options.from = args[++index];
        else if (arg === '--issue') options.issue = args[++index];
        else positional.push(arg);
    }
    return { command, positional, options };
}

function manualStatePath(app) {
    return path.join(resultsRoot, app.id, 'manual-qa.json');
}

function manualApprove(app, latest) {
    if (!latest) throw new Error(`No QA result exists for ${app.name}. Run the pipeline first.`);
    if (latest.state !== 'READY_FOR_MANUAL_QA') throw new Error(`${app.name} is ${latest.state}; only READY_FOR_MANUAL_QA can be manually approved.`);
    latest.manualQaState = 'MANUAL_QA_APPROVED';
    transition(latest, 'MANUAL_QA_APPROVED');
    latest.manualQaApprovedAt = now();
    writeJson(manualStatePath(app), { appId: app.id, state: latest.manualQaState, timestamp: latest.manualQaApprovedAt });
    writeJson(path.join(resultsRoot, app.id, 'qa-results.json'), latest);
    return latest;
}

function manualFail(app, latest, issue) {
    if (!latest) throw new Error(`No QA result exists for ${app.name}. Run the pipeline first.`);
    if (!issue) throw new Error('manual-fail requires --issue "reproducible issue".');
    latest.manualQaState = 'MANUAL_QA_FAILED';
    transition(latest, 'MANUAL_QA_FAILED');
    const entry = { timestamp: now(), issue, status: 'OPEN', severity: 'UNKNOWN' };
    latest.manualQaIssues = [...(latest.manualQaIssues ?? []), entry];
    writeJson(manualStatePath(app), { appId: app.id, state: latest.manualQaState, issues: latest.manualQaIssues });
    writeJson(path.join(resultsRoot, app.id, 'qa-results.json'), latest);
    return latest;
}

function updateVisualBaselines(app, options) {
    if (!options.humanApproved) throw new Error('Visual baseline updates require --human-approved.');
    if (!options.from) throw new Error('Visual baseline updates require --from <repository-local-directory>.');
    const source = path.resolve(repoRoot, options.from);
    const relative = path.relative(repoRoot, source);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Baseline source must be inside the repository.');
    if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) throw new Error(`Baseline source directory does not exist: ${relative}`);
    const files = fs.readdirSync(source).filter((file) => file.endsWith('.png'));
    if (!files.length) throw new Error('No PNG screenshots found in the source directory.');
    const target = path.join(baselinesRoot, app.id);
    ensureDir(target);
    for (const file of files) fs.copyFileSync(path.join(source, file), path.join(target, file));
    console.log(`Approved ${files.length} visual baseline(s) for ${app.name}.`);
}

async function runOne(app, run, git, options, sharedInstall) {
    const result = resultTemplate(app, run, git);
    const artifactDirectory = path.join(artifactsRoot, run, app.id);
    ensureDir(artifactDirectory);
    const envInfo = environmentStage(app, result, artifactDirectory);
    if (sharedInstall) {
        setStage(result, 'install', sharedInstall);
        blockingIssue(result, 'install', sharedInstall);
    } else installStage(result, run, app, artifactDirectory, options);

    runAppScript(result, app, 'lint', artifactDirectory, options, { applicable: true, blocking: true });
    runAppScript(result, app, 'typecheck', artifactDirectory, options, { applicable: true, blocking: true });
    runAppScript(result, app, 'unit', artifactDirectory, options, { applicable: true, blocking: true });
    runAppScript(result, app, 'ui', artifactDirectory, options, { applicable: true, blocking: true });
    runAppScript(result, app, 'integration', artifactDirectory, options, { applicable: Boolean(app.scripts.integration), blocking: true });
    runAppScript(result, app, 'legacy', artifactDirectory, options, { applicable: Boolean(app.scripts.legacy), blocking: false });
    runAppScript(result, app, 'core', artifactDirectory, options, { applicable: Boolean(app.scripts.core), blocking: true });
    runAppScript(result, app, 'fullSuite', artifactDirectory, options, { applicable: Boolean(app.scripts.fullSuite), blocking: true });
    checkSecurityAndBackend(result, app, artifactDirectory, options, envInfo);
    e2eStage(result, app, artifactDirectory, options, envInfo);
    visualStage(result, app, artifactDirectory, options);
    performanceStage(result, app);
    consoleStage(result, options);
    buildStages(result, app, artifactDirectory, options);
    updateTestAliases(result);
    finalize(result);
    persistResult(app, result);
    return result;
}

async function main() {
    const { command, positional, options } = parseArgs(process.argv.slice(2));
    const apps = discoverMobileApps(repoRoot);
    if (!apps.length) throw new Error('No verified OperiX Expo/React Native mobile apps were discovered.');

    if (command === 'inventory') {
        const results = latestResults(apps);
        generateReports(apps, results);
        console.log(`Discovered ${apps.length} verified OperiX mobile apps.`);
        for (const app of apps) console.log(`- ${app.id}: ${app.path}`);
        return;
    }

    if (command === 'visual:update') {
        const app = appById(apps, positional[0]);
        if (!app) throw new Error(`Unknown app. Use one of: ${apps.map((candidate) => candidate.id).join(', ')}`);
        updateVisualBaselines(app, options);
        return;
    }

    if (command === 'approve' || command === 'manual-fail') {
        const app = appById(apps, positional[0]);
        if (!app) throw new Error(`Unknown app. Use one of: ${apps.map((candidate) => candidate.id).join(', ')}`);
        const latest = readJson(path.join(resultsRoot, app.id, 'qa-results.json'));
        const result = command === 'approve' ? manualApprove(app, latest) : manualFail(app, latest, options.issue);
        generateReports(apps, latestResults(apps));
        console.log(`${app.name}: ${result.state}`);
        return;
    }

    const selected = command === 'all' ? apps : [appById(apps, command)].filter(Boolean);
    if (!selected.length) throw new Error(`Unknown app. Use one of: ${apps.map((app) => app.id).join(', ')}`);
    const git = gitInfo();
    const run = runId();
    let sharedInstall = null;
    if (selected.length > 1 && !options.noInstall) {
        const sharedDirectory = path.join(artifactsRoot, run, '_repository');
        const shared = runCommand({ stage: 'install', command: ['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], cwd: repoRoot, artifactDirectory: sharedDirectory, timeout: 20 * 60_000 });
        sharedInstall = stageResult(shared.ok ? PASS : ENVIRONMENT_FAILURE, shared.ok ? 'Shared repository npm ci completed from package-lock.json.' : 'Shared repository npm ci failed.', { classification: shared.ok ? null : 'ENVIRONMENT_FAILURE', diagnosis: shared.ok ? 'Completed.' : diagnose('install', shared.output, shared.exitCode, shared.spawnError), command: 'npm ci --ignore-scripts --no-audit --no-fund', log: shared.log, durationMs: shared.durationMs, blocking: !shared.ok });
    }
    const results = [];
    for (const app of selected) {
        console.log(`\n[OperiX QA] ${app.name} (${app.id})`);
        const result = await runOne(app, run, git, options, sharedInstall);
        results.push(result);
        console.log(`[OperiX QA] ${app.name}: ${result.state}`);
    }
    const allLatest = latestResults(apps);
    generateReports(apps, allLatest);
    console.log(`\nCentral report: ${relativeToRepo(repoRoot, path.join(docsRoot, 'OPERIX-MOBILE-QA-SUMMARY.md'))}`);
    console.log(`Machine results: ${relativeToRepo(repoRoot, path.join(docsRoot, 'qa-results.json'))}`);
    if (results.some((result) => result.state !== 'READY_FOR_MANUAL_QA')) process.exitCode = 2;
}

main().catch((error) => {
    console.error(`[OperiX QA] ${error.message}`);
    process.exitCode = 1;
});
