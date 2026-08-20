import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { POSScreen } from '../../src/screens/POS/POSScreen';
import { ReportsHubScreen } from '../../src/screens/Reports/ReportsHubScreen';
import { SettingsScreen } from '../../src/screens/Settings/SettingsScreen';
import { HelpSupportScreen } from '../../src/screens/Support/HelpSupportScreen';
import { ProfileScreen } from '../../src/screens/Profile/ProfileScreen';
import { renderWithProviders, createNavigationMock, TEST_USER } from '../test-utils';

const mockNavigation = createNavigationMock();
const mockRoute = { params: {} as Record<string, unknown> };
const mockUserId = '00000000-0000-0000-0000-000000000001';
const mockProducts = [
    { id: 'product-a', name: 'Premium service', category: 'Services', unit_price: 10, tax_rate: 18, track_stock: true, stock_quantity: 4, unit: 'pcs', sku: 'PREM-1' },
];
const mockCustomers = [{ id: 'customer-a', name: 'Blerinë & Co', email: 'blerine@example.com' }];
let mockReportRows: unknown[] = [{ revenue: 1000, expenses: 250, net_profit: 750, ar_outstanding: 300, ap_outstanding: 100 }];
let mockReportError: Error | null = null;

jest.mock('react-native-safe-area-context', () => ({
    SafeAreaView: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => {
        const ReactRuntime = require('react');
        const { View } = require('react-native');
        return ReactRuntime.createElement(View, props, children);
    },
}));

jest.mock('@react-navigation/native', () => {
    const actual = jest.requireActual('@react-navigation/native');
    return {
        ...actual,
        useNavigation: () => mockNavigation,
        useRoute: () => mockRoute,
        useFocusEffect: (effect: () => void | (() => void)) => {
            const ReactRuntime = require('react');
            ReactRuntime.useEffect(effect, [effect]);
        },
    };
});

jest.mock('expo-image-picker', () => ({
    __esModule: true,
    MediaTypeOptions: { Images: 'Images' },
    launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
}));

jest.mock('../../src/services/externalLinks', () => ({
    openExternalLink: jest.fn(async () => true),
}));

jest.mock('../../src/services/mobileCache', () => ({
    mobileCacheKey: jest.fn((resource: string, userId: string, companyIds: string[]) => `${resource}:${userId}:${companyIds.join(',')}`),
    readMobileCache: jest.fn(async () => null),
    writeMobileCache: jest.fn(),
}));

jest.mock('../../src/services/workspace', () => ({
    getWorkspaceScope: jest.fn(async () => ({
        companyId: 'company-a',
        companyIds: ['company-a'],
        company: { id: 'company-a', company_name: 'Test Company', parent_company_id: null },
        companies: [],
        profile: { id: mockUserId, company_id: 'company-a', company_name: 'Test Company', role: 'owner', currency: 'EUR' },
        isGroup: false,
    })),
    getActiveProductCompanyIds: jest.fn(() => ['company-a']),
    getActiveTenantCompanyIds: jest.fn(() => ['company-a']),
}));

jest.mock('@invoice-monorepo/api/repositories', () => ({
    listProducts: jest.fn(async () => mockProducts),
    listCustomers: jest.fn(async () => mockCustomers),
    listCompanyBankAccounts: jest.fn(async () => []),
    listCompanyBankAccountShares: jest.fn(async () => []),
    shareCompanyBankAccount: jest.fn(async () => ({})),
    revokeCompanyBankAccountShare: jest.fn(async () => ({})),
}));

jest.mock('@invoice-monorepo/api', () => ({
    supabase: { from: jest.fn(), rpc: jest.fn() },
    repairUnpostedSalesInvoices: jest.fn(async () => undefined),
    repairUnpostedCustomerPayments: jest.fn(async () => undefined),
}));

function makeQuery(table: string) {
    const query: Record<string, unknown> = {};
    const result = table === 'profiles'
        ? { data: { id: TEST_USER.id, email: TEST_USER.email, primary_color: '#004FFE' }, error: null }
        : table === 'operix_report_summary'
            ? { data: mockReportRows, error: mockReportError }
            : { data: null, error: null };
    const chain = jest.fn(() => query);
    query.select = chain;
    query.eq = chain;
    query.in = chain;
    query.update = chain;
    query.order = chain;
    query.single = jest.fn(async () => result);
    query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
    return query;
}

const api = () => require('@invoice-monorepo/api') as { supabase: { from: jest.Mock } };
const repositories = () => require('@invoice-monorepo/api/repositories') as { listProducts: jest.Mock; listCustomers: jest.Mock };

beforeEach(() => {
    jest.clearAllMocks();
    mockNavigation.navigate.mockClear();
    mockNavigation.replace.mockClear();
    mockNavigation.goBack.mockClear();
    mockRoute.params = {};
    mockReportRows = [{ revenue: 1000, expenses: 250, net_profit: 750, ar_outstanding: 300, ap_outstanding: 100 }];
    mockReportError = null;
    repositories().listProducts.mockResolvedValue(mockProducts);
    repositories().listCustomers.mockResolvedValue(mockCustomers);
    api().supabase.from.mockImplementation((table: string) => makeQuery(table));
});

describe('POS surfaces', () => {
    it('renders a loading state while product data is pending', async () => {
        let resolveProducts!: (value: unknown) => void;
        repositories().listProducts.mockImplementationOnce(() => new Promise((resolve) => { resolveProducts = resolve; }));
        const screen = await renderWithProviders(<POSScreen />);
        expect(screen.getByText(/Loading.*products/i)).toBeTruthy();
        resolveProducts(mockProducts);
        await waitFor(() => expect(screen.getByTestId('pos-product-product-a')).toBeTruthy());
    });

    it('keeps checkout disabled until a product is added, then opens customer/cart/payment sheets', async () => {
        const screen = await renderWithProviders(<POSScreen />);

        await waitFor(() => expect(screen.getByTestId('pos-product-product-a')).toBeTruthy());
        expect(screen.getByTestId('pos-checkout-button').props.accessibilityState.disabled).toBe(true);

        await fireEvent.press(screen.getByTestId('pos-customer-selector'));
        expect(screen.getByTestId('pos-customer-modal')).toBeTruthy();
        await fireEvent.press(screen.getByTestId('pos-customer-customer-a-button'));
        expect(screen.getByText('Blerinë & Co')).toBeTruthy();

        await fireEvent.press(screen.getByTestId('pos-product-product-a'));
        await waitFor(() => expect(screen.getByTestId('pos-checkout-button').props.accessibilityState.disabled).toBe(false));
        await fireEvent.press(screen.getByTestId('pos-cart-button'));
        expect(screen.getByTestId('pos-cart-modal')).toBeTruthy();
        await fireEvent.press(screen.getByTestId('pos-choose-payment-button'));
        expect(screen.getByTestId('pos-payment-modal')).toBeTruthy();
        await fireEvent.press(screen.getByTestId('pos-payment-cash-button'));

        expect(mockNavigation.navigate).toHaveBeenCalledWith('InvoiceForm', expect.objectContaining({
            posCustomerId: 'customer-a',
            posPaymentMethod: 'cash',
            posCart: [{ productId: 'product-a', name: 'Premium service', quantity: 1, unitPrice: 10, taxRate: 18, taxIncluded: false, unit: 'pcs', sku: 'PREM-1' }],
        }));
    });

    it('does not add an out-of-stock product and exposes search filtering', async () => {
        const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
        repositories().listProducts.mockResolvedValueOnce([{ ...mockProducts[0], stock_quantity: 0 }]);
        const screen = await renderWithProviders(<POSScreen />);

        await waitFor(() => expect(screen.getByTestId('pos-product-product-a')).toBeTruthy());
        await fireEvent.changeText(screen.getByTestId('pos-product-search'), 'does-not-match');
        expect(screen.queryByTestId('pos-product-product-a')).toBeNull();
        await fireEvent.changeText(screen.getByTestId('pos-product-search'), 'premium');
        await fireEvent.press(screen.getByTestId('pos-product-product-a'));
        expect(alert).toHaveBeenCalled();
        expect(screen.getByTestId('pos-checkout-button').props.accessibilityState.disabled).toBe(true);
        alert.mockRestore();
    });
});

describe('reports, settings, help, and profile surfaces', () => {
    it('renders the reports snapshot and routes a report card', async () => {
        const screen = await renderWithProviders(<ReportsHubScreen />);
        await waitFor(() => expect(screen.getByTestId('reports-hub-screen')).toBeTruthy());
        expect(screen.getByText('€750.00')).toBeTruthy();
        expect(screen.getByText('€1,000.00')).toBeTruthy();
        await fireEvent.press(screen.getByTestId('reports-trial_balance-button'));
        expect(mockNavigation.navigate).toHaveBeenCalledWith('ReportPreview', { subtype: 'trial_balance' });
    });

    it('shows a recoverable reports error instead of a blank screen', async () => {
        mockReportError = new Error('offline');
        const screen = await renderWithProviders(<ReportsHubScreen />);
        await waitFor(() => expect(screen.getByLabelText('Try again')).toBeTruthy());
        expect(screen.getByTestId('reports-hub-screen')).toBeTruthy();
    });

    it('switches settings language/theme and requires explicit logout confirmation', async () => {
        const setLanguage = jest.fn();
        const setThemeMode = jest.fn();
        const signOut = jest.fn(async () => undefined);
        const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
        const screen = await renderWithProviders(<SettingsScreen navigation={mockNavigation} />, {
            auth: { signOut },
            theme: { setLanguage, setThemeMode },
        });

        await waitFor(() => expect(screen.getByTestId('settings-screen')).toBeTruthy());
        await fireEvent.press(screen.getByTestId('settings-language-sq-button'));
        expect(setLanguage).toHaveBeenCalledWith('sq');
        await fireEvent.press(screen.getByTestId('settings-section-appearance'));
        await fireEvent.press(screen.getByTestId('settings-theme-dark-button'));
        expect(setThemeMode).toHaveBeenCalledWith('dark');

        await fireEvent.press(screen.getByTestId('settings-logout-button'));
        expect(alert).toHaveBeenCalledTimes(1);
        expect(signOut).not.toHaveBeenCalled();
        const actions = alert.mock.calls[0][2] as Array<{ onPress?: () => void }>;
        actions[1].onPress?.();
        await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
        alert.mockRestore();
    });

    it('searches help content, switches documentation language, and opens external support', async () => {
        const navigation = createNavigationMock();
        const screen = await renderWithProviders(<HelpSupportScreen navigation={navigation} route={{ key: 'HelpSupport-test', name: 'HelpSupport', params: {} }} />);
        await waitFor(() => expect(screen.getByTestId('help-support-screen')).toBeTruthy());
        await fireEvent.press(screen.getByLabelText('Shqip'));
        expect(screen.getAllByText('Ndihmë dhe mbështetje').length).toBeGreaterThan(0);
        await fireEvent.changeText(screen.getByTestId('help-search-input'), 'no-article-with-this-name');
        await waitFor(() => expect(screen.getByText('Nuk u gjetën artikuj ndihme')).toBeTruthy());
        await fireEvent.press(screen.getByTestId('help-contact-button'));
        expect(require('../../src/services/externalLinks').openExternalLink).toHaveBeenCalled();
    });

    it('redirects the legacy profile route to the merged settings screen', async () => {
        const navigation = createNavigationMock();
        await renderWithProviders(<ProfileScreen navigation={navigation} />);
        await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('Settings', { screen: 'SettingsMain' }));
    });
});
