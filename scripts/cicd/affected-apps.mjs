#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const configPath = path.join(repoRoot, '.github', 'operix-apps.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const args = process.argv.slice(2);

function option(name) {
  const prefix = `--${name}=`;
  const found = args.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

function matches(file, pattern) {
  if (pattern.endsWith('/**')) return file === pattern.slice(0, -3) || file.startsWith(pattern.slice(0, -2));
  if (pattern.includes('*')) {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
    return new RegExp(`^${escaped}$`).test(file);
  }
  return file === pattern;
}

function gitFiles(base, head) {
  try {
    const isCommit = (value) => /^[0-9a-f]{40}$/i.test(value) && !/^0{40}$/i.test(value);
    const range = isCommit(base) && isCommit(head) ? [base, head] : ['HEAD^', 'HEAD'];
    return execFileSync('git', ['diff', '--name-only', ...range], { cwd: repoRoot, encoding: 'utf8' })
      .split('\n').map((value) => value.trim()).filter(Boolean);
  } catch {
    try {
      return execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
        .split('\n').map((value) => value.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }
}

const base = option('base') || process.env.BASE_SHA || '';
const head = option('head') || process.env.HEAD_SHA || '';
const requestedApp = option('app') || process.env.OPERIX_APP || '';
const changedFiles = args.includes('--all') || requestedApp === 'all'
  ? []
  : gitFiles(base, head);
const allApps = config.apps;
const selected = new Set();

if (args.includes('--all') || requestedApp === 'all') {
  for (const app of allApps) selected.add(app.id);
} else if (requestedApp) {
  const app = allApps.find((candidate) => candidate.id === requestedApp || candidate.name.toLowerCase() === requestedApp.toLowerCase());
  if (!app) throw new Error(`Unknown OperiX app: ${requestedApp}`);
  selected.add(app.id);
} else {
  for (const file of changedFiles) {
    for (const app of allApps) {
      if (file === app.path || file.startsWith(`${app.path}/`)) selected.add(app.id);
    }
    for (const rule of config.sharedPathRules ?? []) {
      if (!matches(file, rule.pattern) || !rule.apps || rule.apps.length === 0) continue;
      const candidates = rule.apps === 'all'
        ? allApps
        : rule.apps === 'mobile'
          ? allApps.filter((app) => app.type === 'MOBILE')
          : allApps.filter((app) => rule.apps.includes(app.id));
      for (const app of candidates) selected.add(app.id);
    }
  }
}

const apps = allApps.filter((app) => selected.has(app.id));
const output = {
  changedFiles,
  apps,
  appIds: apps.map((app) => app.id),
  webApps: apps.filter((app) => ['WEB', 'STATIC_SITE'].includes(app.type)),
  mobileApps: apps.filter((app) => app.type === 'MOBILE'),
  backendApps: apps.filter((app) => ['API', 'BACKEND'].includes(app.type)),
  releaseApps: apps.filter((app) => ['WEB', 'STATIC_SITE', 'API', 'BACKEND'].includes(app.type) && (app.dockerfile || app.deployment?.kind === 'pm2')),
  hasApps: apps.length > 0,
  hasWeb: apps.some((app) => ['WEB', 'STATIC_SITE'].includes(app.type)),
  hasMobile: apps.some((app) => app.type === 'MOBILE'),
  hasBackend: apps.some((app) => ['API', 'BACKEND'].includes(app.type)),
  hasSupabase: changedFiles.some((file) => file === 'supabase' || file.startsWith('supabase/')),
  documentationOnly: changedFiles.length > 0 && apps.length === 0 && changedFiles.every((file) => file.startsWith('docs/')),
};

process.stdout.write(`${JSON.stringify(output)}\n`);
