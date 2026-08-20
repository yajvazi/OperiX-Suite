import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { ClientFormScreen } from '../../src/screens/Clients/ClientFormScreen';
import { ProductFormScreen } from '../../src/screens/Products/ProductFormScreen';
import { PaymentFormScreen } from '../../src/screens/Payments/PaymentFormScreen';
import { ExpenseFormScreen } from '../../src/screens/Expenses/ExpenseFormScreen';
import { renderWithProviders, createNavigationMock, flushPromises, TEST_USER } from '../test-utils';

jest.mock('../../src/services/workspace', () => ({
    getWorkspaceScope: jest.fn(async () => ({
        companyId: 'company-a',
        companyIds: ['company-a'],
        company: { id: 'company-a', company_name: 'Test Company', parent_company_id: null },
        companies: [],
        roleCode: 'company_administrator',
        profile: { id: 'user-a', company_id: 'company-a', currency: 'EUR' },
        isGroup: false,
    })),
}));

jest.mock('@invoice-monorepo/api/repositories', () => ({
    getCustomer: jest.fn(async () => null),
    deleteCustomer: jest.fn(async () => undefined),
    saveCustomer: jest.fn(async (_client: unknown, input: unknown) => ({ id: 'customer-a', ...(input as object) })),
    getProduct: jest.fn(async () => null),
    saveProduct: jest.fn(async (_client: unknown, input: unknown) => ({ id: 'product-a', ...(input as object) })),
    getPayment: jest.fn(async () => null),
    deleteCustomerPayment: jest.fn(async () => undefined),
    getExpense: jest.fn(async () => null),
    listExpenses: jest.fn(async () => []),
    listCompanyBankAccounts: jest.fn(async () => []),
    saveExpense: jest.fn(async () => ({ id: 'expense-a' })),
    deleteExpense: jest.fn(async () => undefined),
    getInvoice: jest.fn(async () => ({ id: 'invoice-a', invoice_number: 'FAT-1', total_amount: 118, client: { id: 'customer-a', name: 'Blerinë & Co' } })),
    listCustomers: jest.fn(async () => [{ id: 'customer-a', name: 'Blerinë & Co', email: 'blerine@example.com' }]),
    listOpenCustomerInvoices: jest.fn(async () => [{ id: 'invoice-a', invoice_number: 'FAT-1', total_amount: 118, status: 'sent', client_id: 'customer-a' }]),
    saveCustomerPayment: jest.fn(async () => ({ payment: { id: 'payment-a', payment_number: 'PAY-1' }, allocation: null, allocationError: null })),
}));

const repos = () => require('@invoice-monorepo/api/repositories') as Record<string, jest.Mock>;

describe('customer form', () => {
    it('blocks empty names, preserves Unicode input, and saves the tenant ID', async () => {
        const navigation = createNavigationMock();
        const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
        const screen = await renderWithProviders(<ClientFormScreen navigation={navigation} route={{ params: {} }} />);
        await fireEvent.press(screen.getByTestId('customer-save-button'));
        expect(repos().saveCustomer).not.toHaveBeenCalled();
        expect(alert).toHaveBeenCalled();

        await fireEvent.changeText(screen.getByTestId('customer-name-input'), '  Blerinë & Shokë  ');
        await fireEvent.changeText(screen.getByTestId('customer-email-input'), 'blerinë@example.com');
        await fireEvent.changeText(screen.getByTestId('customer-phone-input'), '+383 44 123 456');
        await fireEvent.press(screen.getByTestId('customer-more-options-button'));
        expect(screen.getByText('Business Details')).toBeTruthy();
        await fireEvent.press(screen.getByTestId('customer-save-button'));
        await waitFor(() => expect(repos().saveCustomer).toHaveBeenCalledTimes(1));
        expect(repos().saveCustomer.mock.calls[0][1]).toMatchObject({ name: '  Blerinë & Shokë  ', email: 'blerinë@example.com', user_id: TEST_USER.id, company_id: 'company-a' });
        expect(navigation.goBack).toHaveBeenCalledTimes(1);
        alert.mockRestore();
    });

    it('prevents a duplicate customer mutation while the first request is pending', async () => {
        let resolveSave!: (value: unknown) => void;
        repos().saveCustomer.mockImplementationOnce(() => new Promise((resolve) => { resolveSave = resolve; }));
        const screen = await renderWithProviders(<ClientFormScreen navigation={createNavigationMock()} route={{ params: {} }} />);
        await fireEvent.changeText(screen.getByTestId('customer-name-input'), 'Customer A');
        let firstSave!: Promise<unknown>;
        await act(async () => {
            firstSave = screen.getByTestId('customer-save-button').props.onClick();
            await Promise.resolve();
        });
        await act(async () => {
            await screen.getByTestId('customer-save-button').props.onClick();
        });
        expect(repos().saveCustomer).toHaveBeenCalledTimes(1);
        resolveSave({ id: 'customer-a' });
        await act(async () => {
            await firstSave;
        });
        await flushPromises();
    });

    it('places client deletion inside edit mode and confirms before deleting', async () => {
        repos().getCustomer.mockResolvedValueOnce({ id: 'customer-a', name: 'Blerinë & Co' });
        const navigation = createNavigationMock();
        const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
        const screen = await renderWithProviders(<ClientFormScreen navigation={navigation} route={{ params: { clientId: 'customer-a' } }} />);
        await waitFor(() => expect(screen.getByTestId('customer-delete-button')).toBeTruthy());
        await fireEvent.press(screen.getByTestId('customer-delete-button'));

        expect(alert).toHaveBeenCalledWith(
            'Delete',
            expect.stringContaining('Delete this client'),
            expect.arrayContaining([expect.objectContaining({ text: 'Delete', style: 'destructive' })]),
        );
        const actions = alert.mock.calls.at(-1)?.[2] as Array<{ onPress?: () => Promise<void> }>;
        await act(async () => { await actions[1].onPress?.(); });
        expect(repos().deleteCustomer).toHaveBeenCalledWith(expect.anything(), 'customer-a', 'company-a', TEST_USER.id);
        expect(navigation.goBack).toHaveBeenCalled();
        alert.mockRestore();
    });
});

describe('product form', () => {
    it('validates name, calculates decimal unit price, and persists inventory settings', async () => {
        const navigation = createNavigationMock();
        const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
        const screen = await renderWithProviders(<ProductFormScreen navigation={navigation} route={{ params: {} }} />);
        await fireEvent.press(screen.getByTestId('product-save-button'));
        expect(repos().saveProduct).not.toHaveBeenCalled();
        await fireEvent.changeText(screen.getByTestId('product-name-input'), 'Shërbim premium');
        await fireEvent.changeText(screen.getByTestId('product-price-major-input'), '12');
        await fireEvent.changeText(screen.getByTestId('product-price-minor-input'), '50');
        await fireEvent(screen.getByTestId('product-track-stock-switch'), 'valueChange', true);
        await fireEvent.changeText(screen.getByTestId('product-stock-input'), '10');
        await fireEvent.press(screen.getByTestId('product-save-button'));
        await waitFor(() => expect(repos().saveProduct).toHaveBeenCalled());
        expect(repos().saveProduct.mock.calls.at(-1)?.[1]).toMatchObject({ name: 'Shërbim premium', unit_price: 12.5, track_stock: true, stock_quantity: 10, company_id: 'company-a', user_id: TEST_USER.id });
        expect(navigation.goBack).toHaveBeenCalled();
        alert.mockRestore();
    });

    it('keeps the current form data when the barcode flow is opened', async () => {
        const navigation = createNavigationMock();
        const screen = await renderWithProviders(<ProductFormScreen navigation={navigation} route={{ params: {} }} />);
        await fireEvent.changeText(screen.getByTestId('product-name-input'), 'Barcode product');
        await fireEvent.press(screen.getByTestId('product-scan-button'));
        expect(navigation.navigate).toHaveBeenCalledWith('QRScanner', expect.objectContaining({ mode: 'generic', returnTo: 'ProductForm', currentData: expect.objectContaining({ name: 'Barcode product' }) }));
    });
});

describe('payment form', () => {
    it('requires a positive amount and selected customer before mutation', async () => {
        repos().listCompanyBankAccounts.mockResolvedValueOnce([{
            id: 'bank-a',
            company_id: 'company-a',
            bank_name: 'Raiffeisen Bank',
            account_number: '123456',
            iban: 'XK05123456',
            currency: 'EUR',
            is_primary: true,
            is_active: true,
            created_at: '2026-08-19T00:00:00.000Z',
        }]);
        const navigation = createNavigationMock();
        const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
        const screen = await renderWithProviders(<PaymentFormScreen navigation={navigation} route={{ params: {} }} />);
        expect(screen.getByText('New Income Payment')).toBeTruthy();
        expect(screen.getByTestId('payment-method-cash')).toBeTruthy();
        expect(screen.getByTestId('payment-method-bank')).toBeTruthy();
        expect(screen.queryByTestId('payment-method-card')).toBeNull();
        await fireEvent.press(screen.getByTestId('payment-save-button'));
        expect(repos().saveCustomerPayment).not.toHaveBeenCalled();
        expect(alert).toHaveBeenCalled();

        await fireEvent.changeText(screen.getByTestId('payment-amount-input'), '25.50');
        await fireEvent.press(screen.getByTestId('payment-customer-selector'));
        await waitFor(() => expect(screen.getByText('Blerinë & Co')).toBeTruthy());
        await fireEvent.press(screen.getByText('Blerinë & Co'));
        await fireEvent.press(screen.getByTestId('payment-method-bank'));
        await waitFor(() => expect(screen.getByTestId('payment-bank-account-option-bank-a')).toBeTruthy());
        await fireEvent.press(screen.getByTestId('payment-bank-account-option-bank-a'));
        await fireEvent.changeText(screen.getByLabelText('Bank Reference'), 'BANK-123');
        await fireEvent.press(screen.getByTestId('payment-save-button'));
        await waitFor(() => expect(repos().saveCustomerPayment).toHaveBeenCalled());
        expect(repos().saveCustomerPayment.mock.calls.at(-1)?.[1]).toMatchObject({ customerId: 'customer-a', amount: '25.50', paymentMethod: 'bank', companyBankAccountId: 'bank-a', bankReference: 'BANK-123', companyId: 'company-a' });
        expect(navigation.goBack).toHaveBeenCalled();
        alert.mockRestore();
    });

    it('loads a preselected invoice and prevents duplicate payment submission', async () => {
        let resolvePayment!: (value: unknown) => void;
        repos().saveCustomerPayment.mockImplementationOnce(() => new Promise((resolve) => { resolvePayment = resolve; }));
        const navigation = createNavigationMock();
        const screen = await renderWithProviders(<PaymentFormScreen navigation={navigation} route={{ params: { invoiceId: 'invoice-a' } }} />);
        await waitFor(() => expect(screen.getByDisplayValue('118')).toBeTruthy());
        await fireEvent.changeText(screen.getByTestId('payment-amount-input'), '25');
        let firstSave!: Promise<unknown>;
        await act(async () => {
            firstSave = screen.getByTestId('payment-save-button').props.onClick();
            await Promise.resolve();
        });
        await act(async () => {
            await screen.getByTestId('payment-save-button').props.onClick();
        });
        expect(repos().saveCustomerPayment).toHaveBeenCalledTimes(1);
        resolvePayment({ payment: { id: 'payment-a' }, allocation: null, allocationError: null });
        await act(async () => {
            await firstSave;
        });
        await flushPromises();
    });

    it('places payment deletion inside edit mode and confirms before deleting', async () => {
        repos().getPayment.mockResolvedValueOnce({
            id: 'payment-a',
            payment_number: 'PAY-1',
            amount: 25,
            payment_date: '2026-08-19',
            payment_method: 'cash',
            client: { id: 'customer-a', name: 'Blerinë & Co' },
        });
        const navigation = createNavigationMock();
        const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
        const screen = await renderWithProviders(<PaymentFormScreen navigation={navigation} route={{ params: { paymentId: 'payment-a' } }} />);
        await waitFor(() => expect(screen.getByTestId('payment-delete-button')).toBeTruthy());
        await fireEvent.press(screen.getByTestId('payment-delete-button'));

        expect(alert).toHaveBeenCalledWith(
            'Delete',
            expect.stringContaining('PAY-1'),
            expect.arrayContaining([expect.objectContaining({ text: 'Delete', style: 'destructive' })]),
        );
        const actions = alert.mock.calls.at(-1)?.[2] as Array<{ onPress?: () => Promise<void> }>;
        await act(async () => { await actions[1].onPress?.(); });
        expect(repos().deleteCustomerPayment).toHaveBeenCalledWith(expect.anything(), 'payment-a', { userId: TEST_USER.id, companyIds: ['company-a'] });
        expect(navigation.goBack).toHaveBeenCalled();
        alert.mockRestore();
    });
});

describe('expense form', () => {
    it('captures the vendor, invoice number, and selected payment bank', async () => {
        repos().getExpense.mockResolvedValueOnce({
            id: 'expense-a',
            amount: 50,
            category: 'Supplies',
            description: 'Office supplies',
            date: '2026-08-19',
            type: 'expense',
            payment_method: 'cash',
            accounting_state: 'legacy',
        });
        repos().listCompanyBankAccounts.mockResolvedValueOnce([{
            id: 'bank-a',
            company_id: 'company-a',
            bank_name: 'Raiffeisen Bank',
            account_number: '123456',
            iban: 'XK05123456',
            currency: 'EUR',
            is_primary: true,
            is_active: true,
            created_at: '2026-08-19T00:00:00.000Z',
        }]);
        const navigation = createNavigationMock();
        const screen = await renderWithProviders(<ExpenseFormScreen navigation={navigation} route={{ params: { expenseId: 'expense-a' } }} />);
        await waitFor(() => expect(screen.getByDisplayValue('50')).toBeTruthy());

        await fireEvent.changeText(screen.getByLabelText('Vendor'), 'Office Depot');
        await fireEvent.changeText(screen.getByLabelText('Invoice Number'), 'INV-1001');
        await fireEvent.press(screen.getByTestId('expense-payment-bank-button'));
        await waitFor(() => expect(screen.getByTestId('expense-bank-account-option-bank-a')).toBeTruthy());
        await fireEvent.press(screen.getByTestId('expense-bank-account-option-bank-a'));
        await fireEvent.changeText(screen.getByTestId('expense-bank-reference-input'), 'BANK-EXP-1001');
        await fireEvent.changeText(screen.getByTestId('expense-notes-input'), 'Paid from the operating account');
        await fireEvent.press(screen.getByTestId('expense-save-button'));

        await waitFor(() => expect(repos().saveExpense).toHaveBeenCalled());
        expect(repos().saveExpense.mock.calls.at(-1)?.[1]).toMatchObject({
            type: 'expense',
            vendor_name: 'Office Depot',
            invoice_number: 'INV-1001',
            payment_method: 'bank',
            company_bank_account_id: 'bank-a',
            bank_reference: 'BANK-EXP-1001',
            notes: 'Paid from the operating account',
        });
    });

    it('places expense deletion inside edit mode and confirms before deleting', async () => {
        repos().getExpense.mockResolvedValueOnce({ id: 'expense-a', amount: 50, category: 'Supplies', description: 'Office supplies', date: '2026-08-19', type: 'expense' });
        const navigation = createNavigationMock();
        const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
        const screen = await renderWithProviders(<ExpenseFormScreen navigation={navigation} route={{ params: { expenseId: 'expense-a' } }} />);
        await waitFor(() => expect(screen.getByTestId('expense-delete-button')).toBeTruthy());
        await fireEvent.press(screen.getByTestId('expense-delete-button'));

        expect(alert).toHaveBeenCalledWith(
            'Delete',
            'Delete this expense? This action cannot be undone.',
            expect.arrayContaining([expect.objectContaining({ text: 'Delete', style: 'destructive' })]),
        );
        const actions = alert.mock.calls.at(-1)?.[2] as Array<{ onPress?: () => Promise<void> }>;
        await act(async () => { await actions[1].onPress?.(); });
        expect(repos().deleteExpense).toHaveBeenCalledWith(expect.anything(), 'expense-a', 'company-a', TEST_USER.id);
        expect(navigation.goBack).toHaveBeenCalled();
        alert.mockRestore();
    });
});
