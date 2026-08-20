#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migrationRoot = path.join(repoRoot, 'supabase', 'migrations');
const files = fs.existsSync(migrationRoot)
  ? fs.readdirSync(migrationRoot).filter((name) => name.endsWith('.sql')).sort()
  : [];
const versions = new Map();
const legacy = [];
const destructive = [];
const errors = [];

for (const name of files) {
  const match = name.match(/^(\d{14})_(.+)\.sql$/);
  if (!match) legacy.push(name);
  else if (versions.has(match[1])) errors.push(`duplicate migration version ${match[1]}: ${versions.get(match[1])}, ${name}`);
  else versions.set(match[1], name);
  const source = fs.readFileSync(path.join(migrationRoot, name), 'utf8');
  if (!source.trim()) errors.push(`empty migration: ${name}`);
  if (/\bDROP\s+(?:TABLE|SCHEMA|TYPE|FUNCTION)\b|\bTRUNCATE\b|ALTER\s+TABLE[\s\S]*\bDROP\s+COLUMN\b/i.test(source)) destructive.push(name);
}

const result = { migrationCount: files.length, legacyNames: legacy, destructiveMigrations: destructive, duplicateOrInvalid: errors };
process.stdout.write(`${JSON.stringify(result)}\n`);
if (errors.length) {
  process.stderr.write(`Migration validation failed:\n${errors.map((error) => `- ${error}`).join('\n')}\n`);
  process.exit(1);
}
if (legacy.length) process.stderr.write(`Migration validation warning: ${legacy.length} legacy filename(s) remain; they require a reviewed compatibility policy.\n`);
if (destructive.length) process.stderr.write(`Migration review required: ${destructive.length} potentially destructive migration(s) detected.\n`);
