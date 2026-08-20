import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { InvoiceDetailScreen } from '../../src/screens/Invoices/InvoiceDetailScreen';
import { renderWithProviders, createNavigationMock } from '../test-utils';

const mockNavigation = createNavigationMock();
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
        profile: { id: 'user-a', company_id: 'company-a', company_name: 'Test Company', role: 'owner', currency: 'EUR', primary_color: '#004FFE', terms_conditions: '' },
        isGroup: false,
    })),
}));
jest.mock('../../src/services/pdf/pdfService', () => ({
    generatePdf: jest.fn(async () => ({ success: true, uri: 'file:///tmp/invoice.pdf' })),
    sharePdf: jest.fn(async () => true),
    printPdf: jest.fn(async () => ({ success: true, canceled: false })),
}));
jest.mock('../../src/services/pdf/TemplateFactory', () => ({ generateInvoiceHtml: jest.fn(() => '<html><body>invoice</body></html>') }));
jest.mock('@invoice-monorepo/api', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }));
jest.mock('@invoice-monorepo/api/repositories', () => ({
    getInvoice: jest.fn(),
    listInvoicePayments: jest.fn(),
    deleteInvoice: jest.fn(),
    transitionInvoiceStatus: jest.fn(),
}));

const invoice = {
    id: 'invoice-a',
    invoice_number: 'FAT-1',
    type: 'invoice',
    status: 'sent',
    commercial_status: 'SENT',
    accounting_state: 'legacy',
    total_amount: 118,
    subtotal: 100,
    tax_amount: 18,
    amount_received: 0,
    issue_date: '2026-08-19',
    due_date: '2026-09-18',
    created_at: '2026-08-19T10:00:00Z',
    currency: 'EUR',
    client: { id: 'customer-a', name: 'Blerinë & Co', email: 'blerine@example.com' },
    items: [{ id: 'line-a', description: 'Premium service', quantity: 1, unit_price: 100, tax_rate: 18, amount: 100, discount: 0, tax_included: false }],
};

function makeQuery(result: { data: unknown; error: unknown }) {
    const query: Record<string, unknown> = {};
    const chain = jest.fn(() => query);
    query.select = chain;
    query.eq = chain;
    query.or = chain;
    query.in = chain;
    query.order = chain;
    query.limit = chain;
    query.single = jest.fn(async () => result);
    query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
    return query;
}

const repositories = () => require('@invoice-monorepo/api/repositories') as Record<string, jest.Mock>;
const supabase = () => require('@invoice-monorepo/api').supabase as { from: jest.Mock; rpc: jest.Mock };

describe('invoice detail workflow', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        repositories().getInvoice.mockResolvedValue(invoice);
        repositories().listInvoicePayments.mockResolvedValue([{ id: 'payment-a', amount: 20, payment_date: '2026-08-19', payment_method: 'bank', payment_number: 'PAY-1' }]);
        repositories().transitionInvoiceStatus.mockResolvedValue({ data: { status: 'paid' }, error: null });
        repositories().deleteInvoice.mockResolvedValue(undefined);
        supabase().from.mockImplementation((table: string) => makeQuery(table === 'profiles' ? { data: { id: 'user-a', company_name: 'Test Company', currency: 'EUR', primary_color: '#004FFE', role: 'owner', terms_conditions: '' }, error: null } : { data: [], error: null }));
    });

    it('loads exact detail totals and routes payment, preview, and status actions', async () => {
        const navigation = createNavigationMock();
        const screen = await renderWithProviders(<InvoiceDetailScreen navigation={navigation} route={{ params: { invoiceId: 'invoice-a' } }} />);
        await waitFor(() => expect(screen.getByTestId('invoice-detail-screen')).toBeTruthy());
        expect(screen.getAllByText('€118.00').length).toBeGreaterThan(0);
        expect(screen.getByText('€98.00')).toBeTruthy();

        await fireEvent.press(screen.getByTestId('invoice-add-payment-button'));
        expect(navigation.navigate).toHaveBeenCalledWith('PaymentForm', { invoiceId: 'invoice-a' });

        await fireEvent.press(screen.getByTestId('invoice-more-actions-button'));
        await fireEvent.press(screen.getByText('Preview'));
        await waitFor(() => expect(screen.getByTestId('webview')).toBeTruthy());
        await fireEvent.press(screen.getByTestId('invoice-preview-close-button'));
        await fireEvent.press(screen.getByTestId('invoice-more-actions-button'));
        await fireEvent.press(screen.getByText('Paid'));
        await waitFor(() => expect(repositories().transitionInvoiceStatus).toHaveBeenCalledWith(expect.anything(), 'invoice-a', 'PAID', 'mobile_paid'));
    });

    it('copies the invoice number when its title is held', async () => {
        const Clipboard = require('expo-clipboard') as { setStringAsync: jest.Mock };
        const screen = await renderWithProviders(<InvoiceDetailScreen navigation={mockNavigation} route={{ params: { invoiceId: 'invoice-a' } }} />);
        await waitFor(() => expect(screen.getByTestId('invoice-number-title')).toBeTruthy());

        fireEvent(screen.getByTestId('invoice-number-title'), 'longPress');

        await waitFor(() => expect(Clipboard.setStringAsync).toHaveBeenCalledWith('FAT-1'));
    });

    it('does not offer another payment for a fully paid cash invoice', async () => {
        repositories().getInvoice.mockResolvedValueOnce({ ...invoice, payment_method: 'cash', status: 'paid' });
        repositories().listInvoicePayments.mockResolvedValueOnce([{ id: 'payment-a', amount: 118, payment_date: '2026-08-19', payment_method: 'cash', payment_number: 'PAY-1' }]);
        const screen = await renderWithProviders(<InvoiceDetailScreen navigation={mockNavigation} route={{ params: { invoiceId: 'invoice-a' } }} />);
        await waitFor(() => expect(screen.getByTestId('invoice-detail-screen')).toBeTruthy());
        expect(screen.queryByTestId('invoice-add-payment-button')).toBeNull();
        expect(screen.getAllByText('Paid').length).toBeGreaterThan(0);
    });

    it('renders a controlled missing-invoice state instead of crashing', async () => {
        repositories().getInvoice.mockResolvedValueOnce(null);
        const screen = await renderWithProviders(<InvoiceDetailScreen navigation={mockNavigation} route={{ params: { invoiceId: 'missing-invoice' } }} />);
        await waitFor(() => expect(screen.getByText('This invoice is unavailable.')).toBeTruthy());
        expect(screen.getByLabelText('Try again')).toBeTruthy();
    });

    it('shows the delete action for canonical administrator role codes', async () => {
        const { Alert } = require('react-native') as { Alert: { alert: jest.Mock } };
        const workspace = require('../../src/services/workspace') as { getWorkspaceScope: jest.Mock };
        workspace.getWorkspaceScope.mockResolvedValueOnce({
            companyId: 'company-a',
            companyIds: ['company-a'],
            company: { id: 'company-a', company_name: 'Test Company', parent_company_id: null },
            companies: [],
            profile: { id: 'user-a', company_id: 'company-a', company_name: 'Test Company', role: 'company_administrator', currency: 'EUR', primary_color: '#004FFE', terms_conditions: '' },
            isGroup: false,
        });
        supabase().from.mockImplementation((table: string) => makeQuery(table === 'profiles' ? { data: { id: 'user-a', company_name: 'Test Company', currency: 'EUR', primary_color: '#004FFE', role: 'company_administrator', terms_conditions: '' }, error: null } : { data: [], error: null }));
        Alert.alert = jest.fn();

        const navigation = createNavigationMock();
        const screen = await renderWithProviders(<InvoiceDetailScreen navigation={navigation} route={{ params: { invoiceId: 'invoice-a' } }} />);
        await waitFor(() => expect(screen.getByTestId('invoice-detail-screen')).toBeTruthy());

        await fireEvent.press(screen.getByTestId('invoice-more-actions-button'));
        expect(screen.getByText('Delete invoice')).toBeTruthy();

        await fireEvent.press(screen.getByText('Delete invoice'));
        expect(Alert.alert).toHaveBeenCalledWith(
            'Delete invoice',
            expect.any(String),
            expect.arrayContaining([expect.objectContaining({ text: 'Delete', style: 'destructive' })]),
        );

        const confirmationButtons = Alert.alert.mock.calls.at(-1)?.[2] as Array<{ text: string; onPress?: () => void | Promise<void> }>;
        const deleteButton = confirmationButtons.find((button) => button.text === 'Delete');
        await deleteButton?.onPress?.();
        await waitFor(() => expect(repositories().deleteInvoice).toHaveBeenCalledWith(expect.anything(), 'invoice-a'));
        expect(navigation.goBack).toHaveBeenCalled();
    });
});
