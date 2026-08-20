import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { HomeScreen } from '../../src/screens/Home/HomeScreen';
import { SalesScreen } from '../../src/screens/Sales/SalesScreen';
import { BusinessScreen } from '../../src/screens/Business/BusinessScreen';
import { MoreScreen } from '../../src/screens/More/MoreScreen';
import { renderWithProviders } from '../test-utils';

const mockNavigation = {
    navigate: jest.fn(),
    replace: jest.fn(),
    push: jest.fn(),
    goBack: jest.fn(),
};
let mockResults: Record<string, { data: unknown; error: unknown }> = {};

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
        useFocusEffect: (effect: () => void | (() => void)) => {
            const ReactRuntime = require('react');
            ReactRuntime.useEffect(effect, [effect]);
        },
    };
});

jest.mock('../../src/services/workspace', () => ({
    getWorkspaceScope: jest.fn(async () => ({
        companyId: 'company-a',
        companyIds: ['company-a'],
        company: { id: 'company-a', company_name: 'Test Company', parent_company_id: null },
        companies: [],
        profile: { id: 'user-a', company_id: 'company-a', company_name: 'Test Company', role: 'owner', currency: 'EUR' },
        isGroup: false,
    })),
    getActiveProductCompanyIds: jest.fn(() => ['company-a']),
    getActiveTenantCompanyIds: jest.fn(() => ['company-a']),
    scopedResource: jest.fn(() => 'and(user_id.eq.user-a,company_id.is.null),company_id.eq.company-a'),
    scopedSearch: jest.fn(() => 'invoice_number.ilike.%needle%'),
}));

jest.mock('@invoice-monorepo/api', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));

function makeQuery(result: { data: unknown; error: unknown }) {
    const query: Record<string, unknown> = {};
    const chain = jest.fn(() => query);
    query.select = chain;
    query.or = chain;
    query.eq = chain;
    query.neq = chain;
    query.in = chain;
    query.order = chain;
    query.limit = chain;
    query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
    return query;
}

const today = new Date().toISOString().slice(0, 10);

describe('critical mobile screens', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockResults = {};
        const supabase = require('@invoice-monorepo/api').supabase as { from: jest.Mock };
        supabase.from.mockImplementation((table: string) => makeQuery(mockResults[table] || { data: [], error: null }));
    });

    it('loads tenant-scoped home metrics, recent activity, and quick actions', async () => {
        mockResults = {
            invoices: { data: [{ id: 'invoice-a', invoice_number: 'FAT-1', status: 'sent', total_amount: 100, issue_date: today, created_at: `${today}T10:00:00Z`, client: { name: 'Blerinë & Co' } }], error: null },
            payments: { data: [{ id: 'payment-a', amount: 20, payment_date: today, created_at: `${today}T11:00:00Z`, client: { name: 'Blerinë & Co' } }], error: null },
            expenses: { data: [{ id: 'expense-a', amount: 15, category: 'Supplies', description: 'Office supplies', date: today, created_at: `${today}T12:00:00Z` }], error: null },
            products: { data: [{ id: 'product-a', track_stock: true, stock_quantity: 0, low_stock_threshold: 5 }], error: null },
            operix_cash_flow: { data: [{ net_change: 80 }], error: null },
            operix_fund_balances: { data: [{ balance: 80 }], error: null },
            operix_ar_aging: { data: [{ outstanding_amount: 65 }], error: null },
        };
        const screen = await renderWithProviders(<HomeScreen />);

        await waitFor(() => expect(screen.getByTestId('home-screen')).toBeTruthy());
        expect(screen.getAllByText('€100.00').length).toBeGreaterThan(0);
        expect(screen.getByText('€80.00')).toBeTruthy();
        expect(screen.getByText('€65.00')).toBeTruthy();
        await fireEvent.press(screen.getByTestId('home-outstanding-card'));
        expect(mockNavigation.navigate).toHaveBeenCalledWith('ReportsHub');
        await fireEvent.press(screen.getByTestId('home-total-cash-card'));
        expect(mockNavigation.navigate).toHaveBeenCalledWith('CashBalances');
        await waitFor(() => expect(screen.getByTestId('home-activity-payment-payment-a')).toBeTruthy());
        await fireEvent.press(screen.getByTestId('home-activity-payment-payment-a'));
        expect(mockNavigation.navigate).toHaveBeenCalledWith('PaymentForm', { paymentId: 'payment-a' });
        await fireEvent.press(screen.getByTestId('home-activity-expense-expense-a'));
        expect(mockNavigation.navigate).toHaveBeenCalledWith('ExpenseForm', { expenseId: 'expense-a' });
        await fireEvent.press(screen.getByTestId('home-global-search-button'));
        expect(mockNavigation.navigate).toHaveBeenCalledWith('GlobalSearch');
        await fireEvent.press(screen.getByTestId('home-new-customer-button'));
        expect(mockNavigation.navigate).toHaveBeenCalledWith('ClientForm');
        const supabase = require('@invoice-monorepo/api').supabase as { from: jest.Mock };
        const queryCountBeforeRefresh = supabase.from.mock.calls.length;
        await act(async () => {
            await screen.getByTestId('home-refreshable-list').props.refreshControl.props.onRefresh();
        });
        await waitFor(() => expect(supabase.from.mock.calls.length).toBeGreaterThan(queryCountBeforeRefresh));
    });

    it('shows a recoverable home error when a source query fails', async () => {
        mockResults = {
            invoices: { data: null, error: new Error('offline') },
            payments: { data: [], error: null },
            expenses: { data: [], error: null },
            products: { data: [], error: null },
            operix_cash_flow: { data: [], error: null },
        };
        const screen = await renderWithProviders(<HomeScreen />);
        await waitFor(() => expect(screen.getAllByText('Unable to load').length).toBeGreaterThan(0));
        expect(screen.getByLabelText('Try again')).toBeTruthy();
    });

    it('loads sales documents and routes document creation from the global action', async () => {
        mockResults = {
            clients: { data: [{ id: 'client-a', name: 'Customer A' }, { id: 'client-b', name: 'Customer B' }], error: null },
            invoices: { data: [{ id: 'quote-a', client_id: 'client-a', invoice_number: 'OFFER-1', total_amount: 50, status: 'draft', commercial_document_type: 'QUOTE', commercial_status: 'DRAFT', issue_date: today, client: { name: 'Customer A' } }], error: null },
        };
        const screen = await renderWithProviders(<SalesScreen />);
        await waitFor(() => expect(screen.getByTestId('sales-screen')).toBeTruthy());
        expect(screen.getByText('OFFER-1')).toBeTruthy();
        expect(screen.queryByText('Documents')).toBeNull();
        expect(screen.queryByTestId('sales-create-quote-button')).toBeNull();
        await fireEvent.press(screen.getByTestId('sales-client-selector'));
        await waitFor(() => expect(screen.getByTestId('sales-client-option-client-b')).toBeTruthy());
        await fireEvent.press(screen.getByTestId('sales-client-option-client-b'));
        await waitFor(() => expect(screen.queryByText('OFFER-1')).toBeNull());
        await fireEvent.press(screen.getByTestId('sales-client-selector'));
        await fireEvent.press(screen.getByTestId('sales-all-customers-option'));
        await waitFor(() => expect(screen.getByText('OFFER-1')).toBeTruthy());
        await fireEvent.press(screen.getByTestId('global-create-button'));
        await fireEvent.press(screen.getByTestId('global-create-quote-action'));
        expect(mockNavigation.navigate).toHaveBeenCalledWith('InvoiceForm', expect.objectContaining({ documentType: 'QUOTE', type: 'offer', subtype: 'offer' }));
        await fireEvent.changeText(screen.getByTestId('sales-search-input'), 'needle');
        expect(screen.getByTestId('sales-search-input')).toBeTruthy();
    });

    it('switches business sections and routes the add action', async () => {
        mockResults = {
            products: { data: [{ id: 'product-a', name: 'Premium service', unit_price: 10, track_stock: true, stock_quantity: 4, low_stock_threshold: 5 }], error: null },
            expenses: { data: [], error: null },
        };
        const screen = await renderWithProviders(<BusinessScreen />);
        await waitFor(() => expect(screen.getByText('Premium service')).toBeTruthy());
        await fireEvent.press(screen.getByTestId('global-create-button'));
        await fireEvent.press(screen.getByTestId('global-create-product-action'));
        expect(mockNavigation.navigate).toHaveBeenCalledWith('ProductForm');
        await fireEvent.press(screen.getByTestId('business-section-selector'));
        await fireEvent.press(screen.getByTestId('business-section-expenses'));
        await waitFor(() => expect(screen.getByText(/No expenses yet|No expenses found/i)).toBeTruthy());
    });

    it('shows More actions and requires confirmation before sign-out', async () => {
        const signOut = jest.fn(async () => undefined);
        const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
        const screen = await renderWithProviders(<MoreScreen />, { auth: { signOut } });
        await waitFor(() => expect(screen.getByTestId('more-screen')).toBeTruthy());
        expect(screen.getByText('Reports')).toBeTruthy();
        await fireEvent.press(screen.getByTestId('more-logout-button'));
        expect(alert).toHaveBeenCalledTimes(1);
        const actions = alert.mock.calls[0][2] as Array<{ onPress?: () => void }>;
        actions[1].onPress?.();
        await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
        alert.mockRestore();
    });
});
