#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
function value(name, fallback = '') {
  const prefix = `--${name}=`;
  const found = args.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const outputPath = value('output', path.join(repoRoot, 'release.json'));
const metadata = {
  schemaVersion: 1,
  app: value('app'),
  environment: value('environment', 'artifact'),
  commit: value('commit', process.env.GITHUB_SHA || 'unknown'),
  artifact: value('artifact'),
  artifactKind: value('artifact-kind', 'ghcr-image'),
  artifactDigest: value('artifact-digest'),
  buildTimestamp: new Date().toISOString(),
  status: value('status', 'ARTIFACT_READY'),
  version: value('version', 'unknown'),
  workflowRun: process.env.GITHUB_RUN_ID || 'local',
};
if (!metadata.app || !metadata.commit || !metadata.artifact) throw new Error('release metadata requires --app, --commit, and --artifact');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(metadata, null, 2)}\n`);
process.stdout.write(`${outputPath}\n`);
