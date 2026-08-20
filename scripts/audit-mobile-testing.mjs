import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mobileRoot = path.join(repoRoot, 'apps', 'OperiX Invoice', 'OperiX Invoice Mobile');
const sourceRoot = path.join(mobileRoot, 'src');
const apiRoot = path.join(repoRoot, 'packages', 'api', 'src');

function walk(directory) {
    const files = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) files.push(...walk(fullPath));
        else if (/\.(ts|tsx|mjs)$/.test(entry.name)) files.push(fullPath);
    }
    return files;
}

const mobileSourceFiles = walk(sourceRoot);
const apiSourceFiles = walk(apiRoot);
const sourceFiles = [...mobileSourceFiles, ...apiSourceFiles];
const screenFiles = mobileSourceFiles.filter((file) => /src\/screens\/.*\.tsx$/.test(file));
const mobileSourceText = mobileSourceFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const apiSourceText = apiSourceFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const sourceText = `${mobileSourceText}\n${apiSourceText}`;
const navigatorText = fs.readFileSync(path.join(sourceRoot, 'navigation', 'AppNavigator.tsx'), 'utf8');

const unique = (values) => [...new Set(values)].sort();
const matches = (pattern, text = sourceText) => [...text.matchAll(pattern)].map((match) => match[1] || match[0]);
const routes = unique(matches(/<(?:RootStack|Tab|AuthStack|InvoicesStack|ManagementStack|ExpensesStack|SettingsStack)\.Screen name="([^"]+)"/g, navigatorText));
const testIds = unique(matches(/testID\s*=\s*["']([^"']+)["']/g));
const tables = unique(matches(/\.from\(["']([^"']+)["']\)/g));
const rpcs = unique(matches(/\.rpc\(["']([^"']+)["']/g));
const navigationActions = unique([...mobileSourceText.matchAll(/(?:navigation|props\.navigation)\.(navigate|replace|push|goBack)\s*\(/g)].map((match) => match[1]));

const inventory = {
    generatedAt: new Date().toISOString(),
    mobileRoot: path.relative(repoRoot, mobileRoot),
    screenCount: screenFiles.length,
    screens: screenFiles.map((file) => path.relative(mobileRoot, file)).sort(),
    routeCount: routes.length,
    routes,
    stableTestIdCount: testIds.length,
    stableTestIds: testIds,
    interactiveSurfaceCounts: {
        pressablesAndButtons: (mobileSourceText.match(/<(?:Pressable|TouchableOpacity|TouchableWithoutFeedback|Button|OperixButton|OperixIconButton)\b/g) || []).length,
        textInputs: (mobileSourceText.match(/<TextInput\b/g) || []).length,
        switches: (mobileSourceText.match(/<Switch\b/g) || []).length,
        modals: (mobileSourceText.match(/<Modal\b/g) || []).length,
        alerts: (mobileSourceText.match(/Alert\.alert\s*\(/g) || []).length,
        loadingIndicators: (mobileSourceText.match(/<ActivityIndicator\b/g) || []).length,
        navigationActionSites: navigationActions.length,
    },
    supabase: {
        tableCount: tables.length,
        tables,
        rpcCount: rpcs.length,
        rpcs,
        mobileDirect: {
            tableCount: unique(matches(/\.from\(["']([^"']+)["']\)/g, mobileSourceText)).length,
            tables: unique(matches(/\.from\(["']([^"']+)["']\)/g, mobileSourceText)),
            rpcCount: unique(matches(/\.rpc\(["']([^"']+)["']/g, mobileSourceText)).length,
            rpcs: unique(matches(/\.rpc\(["']([^"']+)["']/g, mobileSourceText)),
        },
        sharedApi: {
            tableCount: unique(matches(/\.from\(["']([^"']+)["']\)/g, apiSourceText)).length,
            tables: unique(matches(/\.from\(["']([^"']+)["']\)/g, apiSourceText)),
            rpcCount: unique(matches(/\.rpc\(["']([^"']+)["']/g, apiSourceText)).length,
            rpcs: unique(matches(/\.rpc\(["']([^"']+)["']/g, apiSourceText)),
        },
    },
};

console.log(JSON.stringify(inventory, null, 2));
