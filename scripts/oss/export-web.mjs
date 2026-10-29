#!/usr/bin/env node
// Builds the public (open-source) tree for the Invoice web app from this private
// monorepo. The private repo stays the source of truth; the public repo is a
// generated, clean-history copy.
//
//   node scripts/oss/export-web.mjs --out ../operix-invoice-web [--force] [--init-git]
//
// Safe by default: only the paths in INCLUDE are copied (an allowlist), the mobile
// app and the other products are never copied, and the result is scanned for
// secrets and private identifiers. The script never pushes anywhere.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const WEB_APP = 'apps/OperiX Invoice/OperiX Web';
const PACKAGES = [
  'accounting', 'api', 'app-shell', 'billing', 'commercial-documents', 'data-store', 'invoice-template',
  'money', 'operix-ui', 'payroll', 'public-api', 'report-templates', 'types',
];
const INCLUDE_DIRS = [WEB_APP, ...PACKAGES.map((name) => `packages/${name}`)];
const INCLUDE_FILES = ['tsconfig.base.json', '.npmrc'];

// Never copied, wherever they appear inside an included directory.
const EXCLUDE_NAMES = new Set([
  'node_modules', '.next', 'dist', 'coverage', '.turbo', '.vercel', '.agents', '.claude',
  '.DS_Store', 'AGENTS.md', 'CLAUDE.md', 'design-qa.md',
]);
const isExcluded = (name) => EXCLUDE_NAMES.has(name)
  || name.endsWith('.tsbuildinfo') || name.endsWith('.log')
  || (name.startsWith('.env') && name !== '.env.example');

// Hard failures: secrets and identifiers that must never be published.
const SECRET_PATTERNS = [
  ['JWT', /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['Stripe live/test secret key', /\b(sk|rk)_(live|test)_[A-Za-z0-9]{16,}/],
  ['Stripe webhook secret', /\bwhsec_[A-Za-z0-9]{16,}/],
  ['Private key block', /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{30,}/],
  ['GitHub token', /\b(ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{20,}/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['LLM API key', /\bsk-[A-Za-z0-9]{32,}/],
];
const PRIVATE_IDENTIFIERS = [
  ['Apple team ID', /X3Z79N6Q9Y/],
  ['Personal/company handle', /yllajvazi|lrdy-?group|lrdygroup|internetkudo/i],
  ['Mobile bundle id', /com\.(lrdygroup|internetkudo)\.[a-z.]+/],
  ['Customer or partner name', /hidroterm|feneri|fenera/i],
];
// Reported, but not blocking: references to the hosted service you operate.
const HOSTED_REFERENCES = [['Hosted OperiX domain', /operixsuite\.com/]];

function parseArgs(argv) {
  const args = { out: '', force: false, initGit: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--force') args.force = true;
    else if (argv[i] === '--init-git') args.initGit = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!args.out) throw new Error('Usage: export-web.mjs --out <directory> [--force] [--init-git]');
  return args;
}

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (isExcluded(entry.name)) continue;
    if (entry.name === 'out' && path.basename(from) === 'qa') continue; // QA screenshots
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(source, target);
    else if (entry.isFile()) fs.copyFileSync(source, target);
    // Symlinks are skipped on purpose.
  }
}

// Supabase project hosts used by the private apps must not appear in the output.
function privateSupabaseHosts() {
  const hosts = new Set();
  const stack = [path.join(repoRoot, 'apps')];
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { stack.push(full); continue; }
      if (!/^\.env(\.|$)/.test(entry.name) || entry.name.endsWith('.example')) continue;
      for (const line of fs.readFileSync(full, 'utf8').split('\n')) {
        const match = line.match(/SUPABASE_URL\s*=\s*["']?(https?:\/\/[^\s"']+)/);
        if (!match) continue;
        try { const host = new URL(match[1]).host; if (!/^(localhost|127\.0\.0\.1)/.test(host)) hosts.add(host); } catch { /* ignore */ }
      }
    }
  }
  return [...hosts];
}

function walkFiles(dir, visit) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, visit);
    else if (entry.isFile()) visit(full);
  }
}

function scan(outDir) {
  const hostPatterns = privateSupabaseHosts().map((host) => ['Private Supabase host', new RegExp(host.replace(/\./g, '\\.'))]);
  const blocking = [...SECRET_PATTERNS, ...PRIVATE_IDENTIFIERS, ...hostPatterns];
  const errors = [];
  const warnings = new Map();
  walkFiles(outDir, (file) => {
    const rel = path.relative(outDir, file);
    if (/\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|pdf|zip)$/i.test(rel)) return;
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { return; }
    if (text.includes('\u0000')) return;
    text.split('\n').forEach((line, index) => {
      for (const [label, pattern] of blocking) if (pattern.test(line)) errors.push(`${label}: ${rel}:${index + 1}`);
      for (const [label, pattern] of HOSTED_REFERENCES) {
        if (pattern.test(line)) warnings.set(`${label}: ${rel}`, (warnings.get(`${label}: ${rel}`) ?? 0) + 1);
      }
    });
  });
  return { errors, warnings };
}

function writeRootFiles(outDir) {
  const privateRoot = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const web = JSON.parse(fs.readFileSync(path.join(repoRoot, WEB_APP, 'package.json'), 'utf8'));
  const rootPackage = {
    name: 'operix-invoice',
    version: '1.0.0',
    private: true,
    packageManager: privateRoot.packageManager,
    workspaces: [WEB_APP, ...PACKAGES.map((name) => `packages/${name}`)],
    scripts: {
      dev: `npm run dev -w ${web.name}`,
      build: `npm run build -w ${web.name}`,
      start: `npm run start -w ${web.name}`,
      lint: `npm run lint -w ${web.name}`,
      typecheck: `npm run typecheck -w ${web.name}`,
      test: `npm run test -w ${web.name}`,
    },
    devDependencies: { typescript: privateRoot.devDependencies?.typescript ?? '~5.9.2' },
  };
  fs.writeFileSync(path.join(outDir, 'package.json'), `${JSON.stringify(rootPackage, null, 2)}\n`);
  // A committed lockfile for this exact workspace set keeps builds reproducible. Regenerate it
  // with docs/oss/README.md when dependencies change.
  const committedLock = path.join(repoRoot, 'deploy', 'web-oss', 'package-lock.json');
  if (fs.existsSync(committedLock)) fs.copyFileSync(committedLock, path.join(outDir, 'package-lock.json'));
  fs.writeFileSync(path.join(outDir, '.dockerignore'), ['**/node_modules', '**/.next', '.git', '.env', '.env.local', ''].join('\n'));
  fs.writeFileSync(path.join(outDir, '.gitignore'), ['node_modules', '.next', 'dist', 'coverage', '.turbo', '*.tsbuildinfo', '.env', '.env.*', '!.env.example', '.DS_Store', ''].join('\n'));
  if (!fs.existsSync(path.join(outDir, 'README.md'))) {
    fs.writeFileSync(path.join(outDir, 'README.md'), [
      '# OperiX Invoice (web)',
      '',
      'Invoicing and accounting for businesses.',
      '',
      '## Important: fiscal receipts',
      '',
      'This edition is for business-to-business invoicing. It is **not** an ATK-certified fiscal',
      'software (SEF) and does not issue fiscal receipts. The POS module is disabled by default',
      '(`NEXT_PUBLIC_POS_ENABLED`). Consumer sales in Kosovo must be registered through a',
      'certified SEF.',
      '',
      '## Where your data lives',
      '',
      'Sign-in uses a Supabase project (see `.env.example`). Business data can then be kept either in the',
      'browser on your own computer (Settings -> Data storage -> "In this browser", free, works offline, back it',
      'up with the backup file) or in the Supabase database. The browser database is SQLite compiled to',
      'WebAssembly (`@sqlite.org/sqlite-wasm`); its files are copied to `public/sqlite` before `dev` and `build`.',
      'It needs HTTPS or localhost and holds the data per browser profile.',
      '',
      '## Getting started',
      '',
      '```sh',
      'npm install --legacy-peer-deps',
      'cp "apps/OperiX Invoice/OperiX Web/.env.example" "apps/OperiX Invoice/OperiX Web/.env.local"',
      'npm run dev',
      '```',
      '',
      'License: to be decided before the first public release.',
      '',
    ].join('\n'));
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(process.cwd(), args.out);
  if (outDir === repoRoot || outDir.startsWith(`${repoRoot}${path.sep}`)) throw new Error('--out must be outside the repository');
  if (fs.existsSync(outDir) && fs.readdirSync(outDir).length) {
    if (!args.force) throw new Error(`${outDir} is not empty (use --force to replace its contents)`);
    for (const entry of fs.readdirSync(outDir)) fs.rmSync(path.join(outDir, entry), { recursive: true, force: true });
  }
  fs.mkdirSync(outDir, { recursive: true });

  for (const dir of INCLUDE_DIRS) {
    const source = path.join(repoRoot, dir);
    if (!fs.existsSync(source)) throw new Error(`Missing ${dir}`);
    copyTree(source, path.join(outDir, dir));
  }
  for (const file of INCLUDE_FILES) {
    const source = path.join(repoRoot, file);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(outDir, file));
  }
  writeRootFiles(outDir);

  const { errors, warnings } = scan(outDir);
  let files = 0;
  walkFiles(outDir, () => { files += 1; });
  console.log(`Exported ${files} files to ${outDir}`);
  for (const [item, count] of warnings) console.log(`  note: ${item} (${count} line${count === 1 ? '' : 's'})`);
  if (errors.length) {
    console.error(`\nBLOCKED: ${errors.length} secret/private identifier match(es):`);
    for (const error of errors.slice(0, 40)) console.error(`  ${error}`);
    process.exit(1);
  }
  console.log('Scan: no secrets or private identifiers found.');

  if (args.initGit) {
    const git = (...gitArgs) => execFileSync('git', gitArgs, { cwd: outDir, stdio: 'inherit' });
    git('init', '-q', '-b', 'main');
    git('add', '-A');
    git('commit', '-q', '-m', 'Initial public release');
    console.log('Created a local git repository with one commit. Nothing was pushed.');
  }
}

try { main(); } catch (error) { console.error(error instanceof Error ? error.message : error); process.exit(1); }
