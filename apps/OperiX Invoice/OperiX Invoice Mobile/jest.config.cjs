const path = require('node:path');

const workspaceRoot = path.resolve(__dirname, '../../..');

module.exports = {
    preset: 'jest-expo',
    rootDir: __dirname,
    coverageProvider: 'v8',
    setupFilesAfterEnv: ['<rootDir>/test/jest.setup.ts'],
    testMatch: ['<rootDir>/test/**/*.test.[jt]s?(x)'],
    testPathIgnorePatterns: ['/node_modules/', '/e2e/'],
    clearMocks: true,
    restoreMocks: true,
    resetMocks: false,
    maxWorkers: 1,
    transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?|react-navigation|@react-navigation|@invoice-monorepo|lucide-react-native|react-native-svg))',
    ],
    moduleNameMapper: {
        '^@invoice-monorepo/api$': path.join(workspaceRoot, 'packages/api/src/index.ts'),
        '^@invoice-monorepo/api/(.*)$': path.join(workspaceRoot, 'packages/api/src/$1.ts'),
        '^@invoice-monorepo/commercial-documents$': path.join(workspaceRoot, 'packages/commercial-documents/src/index.ts'),
        '^@invoice-monorepo/context$': path.join(workspaceRoot, 'packages/context/src/index.ts'),
        '^@invoice-monorepo/hooks$': path.join(workspaceRoot, 'packages/hooks/src/index.ts'),
        '^@invoice-monorepo/i18n$': path.join(workspaceRoot, 'packages/i18n/src/index.ts'),
        '^@invoice-monorepo/invoice-template$': path.join(workspaceRoot, 'packages/invoice-template/src/index.ts'),
        '^@invoice-monorepo/money$': path.join(workspaceRoot, 'packages/money/src/index.ts'),
        '^@invoice-monorepo/report-templates$': path.join(workspaceRoot, 'packages/report-templates/src/index.ts'),
        '^@invoice-monorepo/types$': path.join(workspaceRoot, 'packages/types/src/index.ts'),
        '^@invoice-monorepo/ui$': path.join(workspaceRoot, 'packages/ui/src/index.ts'),
    },
    collectCoverageFrom: [
        'src/**/*.{ts,tsx}',
        '!src/generated/**',
        '!src/navigation/types.ts',
    ],
    coveragePathIgnorePatterns: ['/node_modules/', '/test/', '/generated/'],
    coverageThreshold: {
        global: {
            // Whole mobile-source signal. Shared financial/API packages have a
            // separate Node V8 coverage command because Jest/Expo excludes
            // workspace package files outside its mobile root from its map.
            statements: 18,
            branches: 45,
            functions: 30,
            lines: 18,
        },
    },
};
