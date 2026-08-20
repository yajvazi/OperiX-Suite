#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot }).toString().split('\0').filter(Boolean);
const findings = [];
const highConfidence = [
  ['private-key', /-----BEGIN (?:RSA|OPENSSH|EC|DSA|PRIVATE) KEY-----/],
  ['github-token', /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/],
  ['stripe-live-secret', /\bsk_live_[A-Za-z0-9]{16,}\b/],
  ['aws-access-key', /\bAKIA[0-9A-Z]{16}\b/],
  ['supabase-service-role-value', /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*['"`]?(?!\$\{|\[|<|your_|replace|example)[A-Za-z0-9._-]{20,}/i],
];

for (const relative of tracked) {
  const base = path.basename(relative);
  const normalized = relative.replaceAll('\\', '/');
  if (/^\.env(?:\.|$)/i.test(base) && !/^\.env(?:\.|$).*example/i.test(base)) {
    findings.push(`tracked-env-file: ${normalized}`);
    continue;
  }
  if (/^(?:node_modules|\.next|dist|coverage)\//.test(normalized) || /^(?:docs|\.agents)\//.test(normalized)) continue;
  let source;
  try {
    source = fs.readFileSync(path.join(repoRoot, relative), 'utf8');
  } catch {
    continue;
  }
  for (const [rule, pattern] of highConfidence) {
    if (pattern.test(source)) findings.push(`${rule}: ${normalized}`);
  }
}

const unique = [...new Set(findings)];
if (unique.length) {
  process.stderr.write(`OperiX security scan found ${unique.length} finding(s). Values are intentionally not printed:\n`);
  process.stderr.write(`${unique.map((finding) => `- ${finding}`).join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(`OperiX security scan passed for ${tracked.length} tracked files; no high-confidence secret findings.\n`);
