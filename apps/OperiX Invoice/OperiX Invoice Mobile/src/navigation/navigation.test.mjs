import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const navigationRoot = path.dirname(fileURLToPath(import.meta.url));
const appNavigator = fs.readFileSync(path.join(navigationRoot, 'AppNavigator.tsx'), 'utf8');
const navigationTypes = fs.readFileSync(path.join(navigationRoot, 'types.ts'), 'utf8');

test('mobile primary navigation exposes exactly five task destinations', () => {
    const tabRoutes = [...appNavigator.matchAll(/<Tab\.Screen name="([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(tabRoutes, ['Home', 'Sales', 'POS', 'Business', 'More']);
    assert.match(navigationTypes, /export type MainTabParamList = \{[\s\S]*?Home: undefined;[\s\S]*?Sales: undefined;[\s\S]*?POS:/);
});

test('removed legacy tab aliases are not used as navigation destinations', () => {
    const sourceFiles = [];
    const walk = (directory) => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const entryPath = path.join(directory, entry.name);
            if (entry.isDirectory()) walk(entryPath);
            else if (/\.(ts|tsx)$/.test(entry.name)) sourceFiles.push(fs.readFileSync(entryPath, 'utf8'));
        }
    };
    walk(path.resolve(navigationRoot, '..'));
    const source = sourceFiles.join('\n');
    assert.doesNotMatch(source, /navigate\(['"]ManagementTab['"]/);
    assert.doesNotMatch(source, /navigate\(['"]ExpensesTab['"]/);
    assert.doesNotMatch(appNavigator, /name="ManagementTab"/);
    assert.doesNotMatch(appNavigator, /name="ExpensesTab"/);
});

test('critical root routes are registered and authentication gates protected navigation', () => {
    const rootRoutes = [...appNavigator.matchAll(/<RootStack\.Screen name="([^"]+)"/g)].map((match) => match[1]);
    for (const route of [
        'MainTabs', 'GlobalSearch', 'InvoiceForm', 'InvoiceDetail', 'InvoicesList', 'AllInvoices',
        'PaymentForm', 'PaymentsList', 'ClientForm', 'CustomerDetail', 'ProductsList', 'ProductForm',
        'ProductDetail', 'ReportsHub', 'CashBalances', 'ReportPreview', 'SalesBook', 'Settings', 'Profile', 'QRScanner',
    ]) assert.ok(rootRoutes.includes(route), `missing critical root route: ${route}`);
    assert.match(appNavigator, /return <NavigationContainer[\s\S]*?\{user \? <RootNavigator \/> : <AuthNavigator \/>\}/);
    assert.match(appNavigator, /if \(user && isPending\)/);
    assert.match(appNavigator, /if \(user && isLocked\)/);
});

test('all declared root routes are represented by a registered screen or compatibility navigator', () => {
    const declaredBlock = navigationTypes.match(/export type RootStackParamList = \{([\s\S]*?)\n\};/);
    assert.ok(declaredBlock, 'RootStackParamList is missing');
    const declaredRoutes = [...declaredBlock[1].matchAll(/^\s{4}([A-Za-z0-9_]+):/gm)].map((match) => match[1]);
    const registeredRoutes = new Set([...appNavigator.matchAll(/<RootStack\.Screen name="([^"]+)"/g)].map((match) => match[1]));
    for (const route of declaredRoutes) assert.ok(registeredRoutes.has(route), `declared route is not registered: ${route}`);
});
