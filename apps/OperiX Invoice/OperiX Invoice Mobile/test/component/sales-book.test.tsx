import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { SalesBookScreen } from '../../src/screens/Reports/SalesBookScreen';
import { renderWithProviders, createNavigationMock } from '../test-utils';

const mockNavigation = createNavigationMock();

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
        companies: [{ id: 'company-a', company_name: 'Test Company', vat_registration_status: 'registered', accounting_period_frequency: 'monthly' }],
        profile: { id: 'user-a', company_id: 'company-a', company_name: 'Test Company', currency: 'EUR', role: 'company_administrator' },
        roleCode: 'company_administrator',
        isGroup: false,
    })),
}));

jest.mock('@invoice-monorepo/api', () => ({ supabase: {} }));
jest.mock('@invoice-monorepo/api/repositories', () => ({
    ensureSalesBookPeriod: jest.fn(async () => ({ id: 'period-a' })),
    listSalesBookPeriods: jest.fn(async () => [{
        id: 'period-a',
        company_id: 'company-a',
        period_start: '2026-08-01',
        period_end: '2026-08-31',
        reporting_frequency: 'monthly',
        status: 'READY_FOR_DECLARATION',
        declaration_deadline: '2026-09-20',
        transaction_count: 1,
        taxable_amount: 100,
        vat_amount: 18,
        total_amount: 118,
    }]),
    listSalesBookTransactions: jest.fn(async () => [{
        invoice_id: 'invoice-a',
        invoice_number: 'INV-001',
        invoice_date: '2026-08-19',
        customer_name: 'Blerinë & Co',
        taxable_base: 100,
        output_vat: 18,
        total_amount: 118,
    }]),
    markSalesBookDeclared: jest.fn(async () => undefined),
    createSalesBookAmendment: jest.fn(async () => ({ id: 'amendment-a' })),
}));

describe('Sales Book period lifecycle screen', () => {
    beforeEach(() => jest.clearAllMocks());

    it('renders the selected period, deterministic totals, status, and transactions', async () => {
        const screen = await renderWithProviders(<SalesBookScreen />);

        await waitFor(() => expect(screen.getAllByText('August 2026').length).toBeGreaterThan(0));
        expect(screen.getAllByText('Ready for declaration').length).toBeGreaterThan(0);
        expect(screen.getAllByText('€100.00').length).toBeGreaterThan(0);
        expect(screen.getAllByText('€18.00').length).toBeGreaterThan(0);
        expect(screen.getAllByText('€118.00').length).toBeGreaterThan(0);
        expect(screen.getByText('INV-001')).toBeTruthy();
        expect(screen.getAllByText('Mark as declared').length).toBeGreaterThan(0);
    });

    it('deep-links a Sales Book transaction to the invoice detail screen', async () => {
        const screen = await renderWithProviders(<SalesBookScreen />);
        await waitFor(() => expect(screen.getByText('INV-001')).toBeTruthy());

        await fireEvent.press(screen.getByText('INV-001'));
        expect(mockNavigation.navigate).toHaveBeenCalledWith('InvoiceDetail', { invoiceId: 'invoice-a' });
    });
});
