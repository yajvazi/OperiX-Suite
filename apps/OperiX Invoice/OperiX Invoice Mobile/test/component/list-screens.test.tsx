import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { ClientsScreen } from '../../src/screens/Clients/ClientsScreen';
import { ProductsScreen } from '../../src/screens/Products/ProductsScreen';
import { InvoicesScreen } from '../../src/screens/Invoices/InvoicesScreen';
import { PaymentsListScreen } from '../../src/screens/Payments/PaymentsListScreen';
import { createNavigationMock, renderWithProviders } from '../test-utils';

const navigation = createNavigationMock();
const customers = [
    { id: 'customer-a', name: 'Blerinë & Co', email: 'blerine@example.com', city: 'Prishtinë', country: 'Kosovo', discount_percent: 5 },
    { id: 'customer-b', name: 'Acme Sh.p.k.', email: 'acme@example.com', city: 'Prizren', country: 'Kosovo', discount_percent: 0 },
];
const products = [
    { id: 'product-a', name: 'Premium service', sku: 'SKU-10', category: 'Services', unit_price: 10, unit: 'hour', tax_rate: 18, tax_included: false, track_stock: true, stock_quantity: 2, low_stock_threshold: 5 },
    { id: 'product-b', name: 'Standard product', sku: 'SKU-20', category: 'Goods', unit_price: 20, unit: 'piece', tax_rate: 0, tax_included: true, track_stock: false, stock_quantity: 0 },
];
const invoices = [{ id: 'invoice-a', invoice_number: 'FAT-2026-0001', status: 'sent', issue_date: '2026-08-19', total_amount: 118, client: { name: 'Blerinë & Co' }, items: [{ id: 'line-a' }] }];
const payments = [{ id: 'payment-a', payment_number: 'PAY-2026-0001', payment_method: 'bank', amount: 25.5, payment_date: '2026-08-19', client: { name: 'Blerinë & Co' }, invoice: { invoice_number: 'FAT-2026-0001' } }];

let mockLists = { customers, products, invoices, payments };

jest.mock('../../src/services/workspace', () => ({
    getWorkspaceScope: jest.fn(async () => ({
        companyId: 'company-a',
        companyIds: ['company-a'],
        company: { id: 'company-a', company_name: 'Test Company', parent_company_id: null },
        companies: [],
        profile: { id: 'user-a', company_id: 'company-a', company_name: 'Test Company', currency: 'EUR' },
        isGroup: false,
    })),
    getActiveProductCompanyIds: jest.fn(() => ['company-a']),
    scopedResource: jest.fn(() => 'and(user_id.eq.user-a,company_id.is.null),company_id.eq.company-a'),
}));

jest.mock('../../src/services/mobileCache', () => ({
    mobileCacheKey: jest.fn(() => 'test-cache-key'),
    readMobileCache: jest.fn(async () => null),
    writeMobileCache: jest.fn(async () => undefined),
}));

jest.mock('@invoice-monorepo/api/repositories', () => ({
    listCustomers: jest.fn(async () => mockLists.customers),
    listProducts: jest.fn(async () => mockLists.products),
    listInvoices: jest.fn(async (_client: unknown, _scope: unknown, options: { documentType?: string } = {}) => options.documentType === 'QUOTE' ? [] : mockLists.invoices),
    listPayments: jest.fn(async () => mockLists.payments),
    deleteCustomerPayment: jest.fn(async () => undefined),
    deleteCustomer: jest.fn(async () => undefined),
    deleteProduct: jest.fn(async () => undefined),
    deleteExpense: jest.fn(async () => undefined),
}));

jest.mock('@invoice-monorepo/api', () => ({
    supabase: {
        from: jest.fn((table: string) => {
            const query: Record<string, unknown> = {};
            const chain = jest.fn(() => query);
            const data = table === 'expenses' ? [{ id: 'expense-a', description: 'Office supplies', amount: 50, date: '2026-08-19', category: 'Supplies' }] : [];
            query.select = chain;
            query.or = chain;
            query.eq = chain;
            query.order = chain;
            query.limit = chain;
            query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve, reject);
            return query;
        }),
        rpc: jest.fn(),
    },
}));

describe('customer and product lists', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockLists = { customers, products, invoices, payments };
    });

    it('searches customers and opens the selected customer route', async () => {
        const screen = await renderWithProviders(<ClientsScreen navigation={navigation} />);
        await waitFor(() => expect(screen.getByTestId('customer-row-customer-a')).toBeTruthy());
        await fireEvent.changeText(screen.getByTestId('customers-search-input'), 'Acme');
        expect(screen.getByTestId('customer-row-customer-b')).toBeTruthy();
        expect(screen.queryByTestId('customer-row-customer-a')).toBeNull();
        await fireEvent.press(screen.getByTestId('customer-row-customer-b'));
        expect(navigation.navigate).toHaveBeenCalledWith('ClientForm', { clientId: 'customer-b' });
        await fireEvent.press(screen.getByTestId('customer-create-button'));
        expect(navigation.navigate).toHaveBeenCalledWith('ClientForm');
    });

    it('renders a customer empty state when the tenant has no rows', async () => {
        mockLists.customers = [];
        const screen = await renderWithProviders(<ClientsScreen navigation={navigation} />);
        await waitFor(() => expect(screen.getByText('No clients yet')).toBeTruthy());
    });

    it('searches products, opens a product, and exposes the barcode scanner', async () => {
        const screen = await renderWithProviders(<ProductsScreen navigation={navigation} />);
        await waitFor(() => expect(screen.getByTestId('product-row-product-a')).toBeTruthy());
        await fireEvent.changeText(screen.getByTestId('products-search-input'), 'SKU-20');
        expect(screen.getByTestId('product-row-product-b')).toBeTruthy();
        expect(screen.queryByTestId('product-row-product-a')).toBeNull();
        await fireEvent.press(screen.getByTestId('product-row-product-b'));
        expect(navigation.navigate).toHaveBeenCalledWith('ProductForm', { productId: 'product-b' });
        await fireEvent.press(screen.getByTestId('products-scan-button'));
        expect(screen.getByTestId('camera-view')).toBeTruthy();
    });
});

describe('invoice and payment lists', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockLists = { customers, products, invoices, payments };
    });

    it('opens invoice detail and preview routes and handles type switching', async () => {
        const screen = await renderWithProviders(<InvoicesScreen navigation={navigation} route={{ params: {} }} />);
        await waitFor(() => expect(screen.getByTestId('invoice-row-invoice-a')).toBeTruthy());
        await fireEvent.press(screen.getByTestId('invoice-row-invoice-a'));
        expect(navigation.navigate).toHaveBeenCalledWith('InvoiceDetail', { invoiceId: 'invoice-a' });
        await fireEvent.press(screen.getByTestId('invoice-preview-invoice-a-button'));
        expect(navigation.navigate).toHaveBeenCalledWith('InvoiceDetail', { invoiceId: 'invoice-a', autoPreview: true });
        await fireEvent.press(screen.getByTestId('invoice-type-offer-button'));
        await waitFor(() => expect(screen.getByText(/offer.*not found/i)).toBeTruthy());
    });

    it('renders payment totals, routes rows/add, and guards empty exports', async () => {
        const screen = await renderWithProviders(<PaymentsListScreen navigation={navigation} />);
        await waitFor(() => expect(screen.getByTestId('payment-row-payment-a')).toBeTruthy());
        expect(screen.getByText('€25.50')).toBeTruthy();
        await fireEvent.press(screen.getByTestId('payment-row-payment-a'));
        expect(navigation.navigate).toHaveBeenCalledWith('PaymentForm', { paymentId: 'payment-a' });
        await fireEvent.press(screen.getByTestId('payment-list-add-button'));
        expect(navigation.navigate).toHaveBeenCalledWith('PaymentForm');

        mockLists.payments = [];
        const emptyScreen = await renderWithProviders(<PaymentsListScreen navigation={navigation} />);
        await waitFor(() => expect(emptyScreen.getByText('No payments recorded')).toBeTruthy());
        const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
        await fireEvent.press(emptyScreen.getByTestId('payment-export-print-button'));
        expect(alert).toHaveBeenCalledWith('Info', 'There are no payments to export.');
        alert.mockRestore();
    });

});
