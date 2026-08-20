import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function loadPng() {
    try {
        return require('pngjs').PNG;
    } catch {
        return null;
    }
}

/**
 * Compare identically named PNG files with zero tolerance by default. The
 * caller can review the generated diff and explicitly update a baseline; a
 * normal QA run never writes to the baseline directory.
 */
export function comparePngDirectories(baselineDirectory, actualDirectory, diffDirectory) {
    const PNG = loadPng();
    if (!PNG) return { available: false, reason: 'pngjs is not installed in the repository runtime.' };
    const baselineFiles = fs.readdirSync(baselineDirectory).filter((file) => file.endsWith('.png')).sort();
    const results = [];
    fs.mkdirSync(diffDirectory, { recursive: true });
    for (const file of baselineFiles) {
        const baselinePath = path.join(baselineDirectory, file);
        const actualPath = path.join(actualDirectory, file);
        if (!fs.existsSync(actualPath)) {
            results.push({ file, status: 'MISSING_ACTUAL' });
            continue;
        }
        try {
            const baseline = PNG.sync.read(fs.readFileSync(baselinePath));
            const actual = PNG.sync.read(fs.readFileSync(actualPath));
            if (baseline.width !== actual.width || baseline.height !== actual.height) {
                results.push({ file, status: 'DIMENSION_MISMATCH', baseline: [baseline.width, baseline.height], actual: [actual.width, actual.height] });
                continue;
            }
            const diff = new PNG({ width: baseline.width, height: baseline.height });
            let differentPixels = 0;
            for (let offset = 0; offset < baseline.data.length; offset += 4) {
                const same = baseline.data[offset] === actual.data[offset]
                    && baseline.data[offset + 1] === actual.data[offset + 1]
                    && baseline.data[offset + 2] === actual.data[offset + 2]
                    && baseline.data[offset + 3] === actual.data[offset + 3];
                if (!same) {
                    differentPixels += 1;
                    diff.data[offset] = 255;
                    diff.data[offset + 1] = 0;
                    diff.data[offset + 2] = 0;
                    diff.data[offset + 3] = 255;
                } else {
                    diff.data[offset] = baseline.data[offset];
                    diff.data[offset + 1] = baseline.data[offset + 1];
                    diff.data[offset + 2] = baseline.data[offset + 2];
                    diff.data[offset + 3] = 90;
                }
            }
            const diffPath = path.join(diffDirectory, file);
            fs.writeFileSync(diffPath, PNG.sync.write(diff));
            results.push({ file, status: differentPixels ? 'DIFF' : 'PASS', differentPixels, totalPixels: baseline.width * baseline.height, diff: diffPath });
        } catch (error) {
            results.push({ file, status: 'COMPARE_ERROR', error: error.message });
        }
    }
    return {
        available: true,
        passed: results.filter((item) => item.status === 'PASS').length,
        differences: results.filter((item) => item.status !== 'PASS').length,
        results,
    };
}
