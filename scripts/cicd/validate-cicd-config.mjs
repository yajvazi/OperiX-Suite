#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const config = JSON.parse(fs.readFileSync(path.join(repoRoot, '.github', 'operix-apps.json'), 'utf8'));
const allowedTypes = new Set(['WEB', 'MOBILE', 'API', 'BACKEND', 'SHARED_PACKAGE', 'INTERNAL_TOOL', 'STATIC_SITE', 'SERVICE']);
const errors = [];
const ids = new Set();
const workspaces = new Set();

for (const app of config.apps) {
  if (!app.id || ids.has(app.id)) errors.push(`duplicate or missing app id: ${app.id || '<empty>'}`);
  ids.add(app.id);
  if (!allowedTypes.has(app.type)) errors.push(`${app.id}: unsupported type ${app.type}`);
  if (!app.path || path.isAbsolute(app.path)) errors.push(`${app.id}: path must be repository-relative`);
  const appRoot = path.join(repoRoot, app.path || '');
  if (!fs.existsSync(appRoot)) errors.push(`${app.id}: path does not exist: ${app.path}`);
  if (app.runner === 'npm') {
    const packagePath = path.join(appRoot, 'package.json');
    if (!fs.existsSync(packagePath)) errors.push(`${app.id}: npm app has no package.json`);
    if (!app.workspace) errors.push(`${app.id}: npm app has no workspace name`);
    if (app.workspace && workspaces.has(app.workspace)) errors.push(`${app.id}: duplicate workspace name ${app.workspace}`);
    if (app.workspace) workspaces.add(app.workspace);
  }
  if (app.dockerfile && !fs.existsSync(path.join(repoRoot, app.dockerfile))) errors.push(`${app.id}: Dockerfile does not exist: ${app.dockerfile}`);
  if (app.buildContext && !fs.existsSync(path.join(repoRoot, app.buildContext))) errors.push(`${app.id}: buildContext does not exist: ${app.buildContext}`);
  if (app.type === 'MOBILE' && (!app.expoConfig || !fs.existsSync(path.join(repoRoot, app.expoConfig))) && !fs.existsSync(path.join(appRoot, 'app.json'))) {
    errors.push(`${app.id}: mobile app has no Expo app.json/config`);
  }
  if (app.healthPath && !app.healthPath.startsWith('/')) errors.push(`${app.id}: healthPath must start with /`);
}

if (!Array.isArray(config.sharedPathRules)) errors.push('sharedPathRules must be an array');
if (errors.length) {
  process.stderr.write(`OperiX CI/CD configuration is invalid:\n${errors.map((error) => `- ${error}`).join('\n')}\n`);
  process.exit(1);
}

const counts = Object.fromEntries([...new Set(config.apps.map((app) => app.type))].map((type) => [type, config.apps.filter((app) => app.type === type).length]));
process.stdout.write(`OperiX CI/CD configuration valid: ${config.apps.length} pipeline applications (${JSON.stringify(counts)})\n`);
