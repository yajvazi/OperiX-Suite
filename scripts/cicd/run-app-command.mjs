#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const config = JSON.parse(fs.readFileSync(path.join(repoRoot, '.github', 'operix-apps.json'), 'utf8'));
const [appId, commandName, ...flags] = process.argv.slice(2);
const app = config.apps.find((candidate) => candidate.id === appId);

if (!app) throw new Error(`Unknown OperiX app: ${appId}`);
const command = app.commands?.[commandName];
const required = flags.includes('--required');

if (command == null) {
  process.stdout.write(`OperiX ${app.name}: ${commandName} is not declared for this architecture (not applicable).\n`);
  if (required) throw new Error(`${app.name} does not declare required command ${commandName}`);
  process.exit(0);
}

const cwd = path.join(repoRoot, app.path);
let executable;
let commandArgs;
if (app.runner === 'python') {
  executable = process.platform === 'win32' ? 'python' : 'python3';
  commandArgs = Array.isArray(command) ? command : String(command).trim().split(/\s+/);
} else {
  executable = 'npm';
  commandArgs = ['run', String(command), '--workspace', app.workspace];
}

process.stdout.write(`Running ${executable} ${commandArgs.join(' ')} for ${app.name} in ${app.path}\n`);
const result = spawnSync(executable, commandArgs, {
  cwd,
  env: { ...process.env, CI: process.env.CI || '1' },
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
