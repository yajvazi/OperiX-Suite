#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = path.join(root, 'packages/i18n/src/index.ts');
const mobileSourcePath = path.join(root, 'apps/OperiX Invoice/OperiX Invoice Mobile/src');

const source = fs.readFileSync(catalogPath, 'utf8');

function objectBlock(name, endMarker) {
    const startMarker = `    ${name}: {`;
    const start = source.indexOf(startMarker);
    if (start < 0) throw new Error(`Could not find ${name} catalog`);
    const end = source.indexOf(endMarker, start);
    if (end < 0) throw new Error(`Could not find the end of ${name} catalog`);
    return source.slice(start, end);
}

function keysFrom(block) {
    return new Set([...block.matchAll(/^        ([A-Za-z0-9_]+):/gm)].map((match) => match[1]));
}

function valuesFrom(block) {
    const values = new Map();
    for (const match of block.matchAll(/^        ([A-Za-z0-9_]+):\s*(['"])(.*?)\2,?$/gm)) {
        values.set(match[1], match[3]);
    }
    return values;
}

const enBlock = objectBlock('en', '    },\n    sq: {');
const sqBlock = objectBlock('sq', '    },\n};');
const enKeys = keysFrom(enBlock);
const sqKeys = keysFrom(sqBlock);
const enValues = valuesFrom(enBlock);
const sqValues = valuesFrom(sqBlock);

const missing = [...enKeys].filter((key) => !sqKeys.has(key));
const extra = [...sqKeys].filter((key) => !enKeys.has(key));

const sourceFiles = [];
function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(entryPath);
        else if (/\.(tsx?|jsx?)$/.test(entry.name)) sourceFiles.push(entryPath);
    }
}
walk(mobileSourcePath);

const usedKeys = new Set();
for (const filePath of sourceFiles) {
    const file = fs.readFileSync(filePath, 'utf8');
    for (const match of file.matchAll(/\bt\(\s*['"]([^'"]+)['"]/g)) usedKeys.add(match[1]);
}
const missingUsed = [...usedKeys].filter((key) => !enKeys.has(key));

const technicalKeys = new Set([
    'aboutOperixInvoice', 'appVersionLegalInfo', 'iban', 'swift', 'skuCode', 'nda', 'ndas',
]);
const sameAsEnglish = [...enKeys].filter((key) => enValues.get(key) && sqValues.get(key) === enValues.get(key) && !technicalKeys.has(key));

console.log(`Mobile localization catalog: ${enKeys.size} English keys / ${sqKeys.size} Albanian keys`);
console.log(`Missing Albanian keys: ${missing.length}`);
console.log(`Extra Albanian keys: ${extra.length}`);
console.log(`Missing keys used by mobile source: ${missingUsed.length}`);
if (missing.length) console.log(`  ${missing.join(', ')}`);
if (extra.length) console.log(`  ${extra.join(', ')}`);
if (missingUsed.length) console.log(`  ${missingUsed.join(', ')}`);
if (sameAsEnglish.length) {
    console.log(`Same English/Albanian values requiring review: ${sameAsEnglish.length}`);
    console.log(`  ${sameAsEnglish.join(', ')}`);
}

if (missing.length || extra.length || missingUsed.length) process.exitCode = 1;
