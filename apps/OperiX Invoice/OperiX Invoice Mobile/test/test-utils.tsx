import React, { ReactElement } from 'react';
import { render } from '@testing-library/react-native';
import { AuthContext, ThemeContext } from '@invoice-monorepo/context';

export const TEST_USER = {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'test@example.com',
} as any;

export const TEST_COMPANY = {
    id: '00000000-0000-0000-0000-000000000002',
    company_name: 'Test Company',
    parent_company_id: null,
};

export function createNavigationMock() {
    return {
        navigate: jest.fn(),
        replace: jest.fn(),
        push: jest.fn(),
        goBack: jest.fn(),
        setParams: jest.fn(),
        getParent: jest.fn(() => undefined),
        addListener: jest.fn(() => ({ remove: jest.fn() })),
    } as any;
}

export function createAuthValue(overrides: Record<string, unknown> = {}) {
    return {
        user: TEST_USER,
        session: { user: TEST_USER },
        loading: false,
        signUp: jest.fn(async () => ({ error: null })),
        signIn: jest.fn(async () => ({ error: null })),
        signInWithGoogle: jest.fn(async () => ({ error: null })),
        verifyEmailOtp: jest.fn(async () => ({ error: null })),
        signOut: jest.fn(async () => undefined),
        ...overrides,
    } as any;
}

export function createThemeValue(overrides: Record<string, unknown> = {}) {
    return {
        theme: 'light',
        themeMode: 'light',
        setThemeMode: jest.fn(),
        primaryColor: '#004FFE',
        setPrimaryColor: jest.fn(),
        isDark: false,
        language: 'en',
        setLanguage: jest.fn(),
        ...overrides,
    } as any;
}

export function renderWithProviders(
    ui: ReactElement,
    options: { auth?: Record<string, unknown>; theme?: Record<string, unknown> } = {},
) {
    return render(
        <AuthContext.Provider value={createAuthValue(options.auth)}>
            <ThemeContext.Provider value={createThemeValue(options.theme)}>
                {ui}
            </ThemeContext.Provider>
        </AuthContext.Provider>,
    );
}

export const flushPromises = () => new Promise<void>((resolve) => setImmediate(resolve));
