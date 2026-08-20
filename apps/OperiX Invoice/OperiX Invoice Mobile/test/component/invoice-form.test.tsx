import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { InvoiceFormScreen } from '../../src/screens/Invoices/InvoiceFormScreen';
import { renderWithProviders, createNavigationMock, flushPromises } from '../test-utils';

jest.mock('@invoice-monorepo/api', () => ({
    supabase: { rpc: jest.fn(async () => ({ data: { id: 'walk-in', name: 'Walk-in customer', pos_walk_in_customer: true }, error: null })) },
}));

jest.mock('../../src/services/workspace', () => ({
    getWorkspaceScope: jest.fn(async () => ({
        companyId: 'company-a',
        companyIds: ['company-a'],
        company: { id: 'company-a', company_name: 'Test Company', parent_company_id: null },
        companies: [],
        profile: { id: 'user-a', company_id: 'company-a', currency: 'EUR', company_name: 'Test Company' },
        roleCode: 'company_administrator',
        isGroup: false,
    })),
    getActiveProductCompanyIds: jest.fn(() => ['company-a']),
}));

jest.mock('@invoice-monorepo/api/repositories', () => ({
    getInvoice: jest.fn(async () => null),
    listCustomers: jest.fn(async () => [{ id: 'customer-a', name: 'Blerinë & Co', email: 'blerine@example.com', pos_walk_in_customer: false, discount_percent: 5 }]),
    listInvoices: jest.fn(async () => []),
    listProducts: jest.fn(async () => [{ id: 'product-a', name: 'Shërbim premium', unit_price: 10, tax_rate: 18, tax_included: false, unit: 'pcs', sku: 'SKU-1' }]),
    saveInvoiceDocument: jest.fn(async () => ({ invoice: { id: 'invoice-a', invoice_number: 'FAT-2026-0001' }, totals: { total: 11.8 } })),
    saveCustomerPayment: jest.fn(async () => ({ payment: { id: 'payment-a' }, allocation: { id: 'allocation-a' }, allocationError: null })),
    setInvoiceDeliveryMethod: jest.fn(async () => null),
    setInvoiceDeliveryDetails: jest.fn(async () => null),
    setInvoiceProductPictures: jest.fn(async () => null),
    completePosSale: jest.fn(async () => ({ invoiceId: 'invoice-pos', invoiceNumber: 'POS-1' })),
}));

const api = () => require('@invoice-monorepo/api') as { supabase: { rpc: jest.Mock } };
const repos = () => require('@invoice-monorepo/api/repositories') as Record<string, jest.Mock>;

async function renderCreateInvoice() {
    const screen = await renderWithProviders(<InvoiceFormScreen navigation={createNavigationMock()} route={{ params: {} }} />);
    await waitFor(() => expect(screen.getByTestId('invoice-add-item-button')).toBeTruthy());
    return screen;
}

describe('invoice creation workflow', () => {
    it('renders the empty state and does not mutate when saved without a line item', async () => {
        const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
        const screen = await renderCreateInvoice();
        await fireEvent.press(screen.getByTestId('invoice-save-button'));
        expect(repos().saveInvoiceDocument).not.toHaveBeenCalled();
        expect(alert).toHaveBeenCalled();
        alert.mockRestore();
    });

    it('opens the calendar when the payment due date field is pressed', async () => {
        const screen = await renderCreateInvoice();

        await fireEvent.press(screen.getByTestId('invoice-more-options-button'));
        await fireEvent.press(screen.getByTestId('invoice-due-date-button'));
        expect(screen.getByTestId('invoice-due-date-option-custom')).toBeTruthy();
        await fireEvent.press(screen.getByTestId('invoice-due-date-option-custom'));

        expect(screen.getByTestId('invoice-date-picker')).toBeTruthy();
    });

    it('calculates an automatic due date from the invoice date', async () => {
        const screen = await renderCreateInvoice();

        await fireEvent.press(screen.getByTestId('invoice-more-options-button'));
        await fireEvent.press(screen.getByTestId('invoice-due-date-button'));
        await fireEvent.press(screen.getByTestId('invoice-due-date-option-two_weeks'));

        expect(screen.getByText('9/2/2026')).toBeTruthy();
    });

    it('saves comments, due date, and delivery method from advanced options', async () => {
        const screen = await renderCreateInvoice();

        await fireEvent.press(screen.getByTestId('invoice-more-options-button'));
        await fireEvent.press(screen.getByTestId('invoice-due-date-button'));
        await fireEvent.press(screen.getByTestId('invoice-due-date-option-custom'));
        await fireEvent(screen.getByTestId('invoice-date-picker'), 'touchEnd');
        await fireEvent.press(screen.getByTestId('invoice-date-picker-done'));
        await fireEvent.changeText(screen.getByTestId('invoice-notes-input'), 'Call before delivery');
        await fireEvent.press(screen.getByTestId('invoice-delivery-method-delivery'));
        await fireEvent.press(screen.getByTestId('invoice-add-item-button'));
        await waitFor(() => expect(screen.getByTestId('invoice-product-option-product-a')).toBeTruthy());
        await fireEvent.press(screen.getByTestId('invoice-product-option-product-a'));
        await fireEvent.press(screen.getByTestId('invoice-save-button'));

        await waitFor(() => expect(repos().saveInvoiceDocument).toHaveBeenCalled());
        expect(repos().setInvoiceDeliveryDetails).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ invoiceId: 'invoice-a', deliveryMethod: 'delivery' }));
    });

    it('links a customer offer and copies its lines into the invoice', async () => {
        repos().listInvoices.mockResolvedValueOnce([{
            id: 'quote-a',
            invoice_number: 'OF-2026-0001',
            client_id: 'customer-a',
            commercial_document_type: 'QUOTE',
            issue_date: '2026-08-19',
            total_amount: 118,
            items: [{ id: 'quote-line-a', description: 'Linked service', quantity: 2, unit_price: 50, tax_rate: 18, discount: 0, amount: 100 }],
        }]);
        const screen = await renderCreateInvoice();

        await fireEvent.press(screen.getByTestId('invoice-customer-selector'));
        await waitFor(() => expect(screen.getByTestId('invoice-customer-option-customer-a')).toBeTruthy());
        await fireEvent.press(screen.getByTestId('invoice-customer-option-customer-a'));
        await fireEvent.press(screen.getByTestId('invoice-more-options-button'));
        await fireEvent.press(screen.getByTestId('invoice-link-document-button'));
        await waitFor(() => expect(screen.getByTestId('invoice-linked-document-option-quote-a')).toBeTruthy());
        await fireEvent.press(screen.getByTestId('invoice-linked-document-option-quote-a'));

        expect(repos().listInvoices).toHaveBeenCalledWith(
            expect.anything(),
            expect.any(Object),
            expect.objectContaining({ clientId: 'customer-a' })
        );
        expect(screen.getByTestId('invoice-item-description-0').props.value).toBe('Linked service');
        expect(screen.getByTestId('invoice-item-quantity-0').props.value).toBe('2');
    });

    it('selects a customer/product, edits quantity/price/discount, previews, and persists the canonical draft', async () => {
        const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
        const navigation = createNavigationMock();
        const screen = await renderWithProviders(<InvoiceFormScreen navigation={navigation} route={{ params: {} }} />);
        await waitFor(() => expect(screen.getByTestId('invoice-add-item-button')).toBeTruthy());

        await fireEvent.press(screen.getByTestId('invoice-customer-selector'));
        await waitFor(() => expect(screen.getByTestId('invoice-customer-option-customer-a')).toBeTruthy());
        await fireEvent.press(screen.getByTestId('invoice-customer-option-customer-a'));

        await fireEvent.press(screen.getByTestId('invoice-add-item-button'));
        await waitFor(() => expect(screen.getByTestId('invoice-product-option-product-a')).toBeTruthy());
        await fireEvent.press(screen.getByTestId('invoice-product-option-product-a'));
        await fireEvent.changeText(screen.getByTestId('invoice-item-quantity-0'), '3');
        await fireEvent.changeText(screen.getByTestId('invoice-item-price-0'), '12.50');
        await fireEvent.changeText(screen.getByTestId('invoice-item-discount-0'), '10');
        expect(screen.getByText('€39.83')).toBeTruthy();

        await fireEvent.press(screen.getByTestId('invoice-preview-button'));
        await waitFor(() => expect(screen.getByTestId('webview')).toBeTruthy());
        await fireEvent.press(screen.getByTestId('invoice-close-preview-button'));
        await fireEvent.press(screen.getByTestId('invoice-save-button'));
        await waitFor(() => expect(repos().saveInvoiceDocument).toHaveBeenCalledTimes(1));
        const options = repos().saveInvoiceDocument.mock.calls[0][1];
        expect(options).toMatchObject({ existingInvoiceId: undefined, postInvoice: true, idempotencyKey: '00000000-0000-4000-8000-000000000001' });
        expect(options.draft).toMatchObject({ clientId: 'customer-a', companyId: 'company-a', documentType: 'INVOICE', currency: 'EUR' });
        expect(options.draft.lines).toEqual([expect.objectContaining({ productId: 'product-a', description: 'Shërbim premium', quantity: 3, unitPrice: 12.5, discountPercent: 10, taxRate: 18 })]);
        expect(alert).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('Invoice'), expect.any(Array));
        alert.mockRestore();
    });

    it('removes a line and prevents duplicate writes while the save is pending', async () => {
        let resolveSave!: (value: unknown) => void;
        repos().saveInvoiceDocument.mockImplementationOnce(() => new Promise((resolve) => { resolveSave = resolve; }));
        const screen = await renderCreateInvoice();
        await fireEvent.press(screen.getByTestId('invoice-add-item-button'));
        await waitFor(() => expect(screen.getByTestId('invoice-custom-item-option')).toBeTruthy());
        await fireEvent.press(screen.getByTestId('invoice-custom-item-option'));
        expect(screen.getByTestId('invoice-item-quantity-0')).toBeTruthy();
        await fireEvent.press(screen.getByTestId('invoice-delete-item-0'));
        expect(screen.getByText('No items added yet')).toBeTruthy();

        await fireEvent.press(screen.getByTestId('invoice-add-item-button'));
        await fireEvent.press(screen.getByTestId('invoice-custom-item-option'));
        let firstSave!: Promise<unknown>;
        await act(async () => {
            firstSave = screen.getByTestId('invoice-save-button').props.onClick();
            await Promise.resolve();
        });
        await act(async () => {
            await screen.getByTestId('invoice-save-button').props.onClick();
        });
        expect(repos().saveInvoiceDocument).toHaveBeenCalledTimes(1);
        resolveSave({ invoice: { id: 'invoice-a', invoice_number: 'FAT-1' }, totals: { total: 10 } });
        await act(async () => {
            await firstSave;
        });
        await flushPromises();
    });

    it('blocks cash settlement at the legal limit before an invoice mutation', async () => {
        const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
        const screen = await renderCreateInvoice();
        await fireEvent.press(screen.getByTestId('invoice-add-item-button'));
        await waitFor(() => expect(screen.getByTestId('invoice-custom-item-option')).toBeTruthy());
        await fireEvent.press(screen.getByTestId('invoice-custom-item-option'));
        await fireEvent.changeText(screen.getByTestId('invoice-item-price-0'), '300');
        const cash = screen.getByTestId('invoice-payment-method-cash');
        expect(cash.props.accessibilityState).toMatchObject({ disabled: true });
        expect(repos().saveInvoiceDocument).not.toHaveBeenCalled();
        expect(alert).not.toHaveBeenCalled();
        alert.mockRestore();
    });

    it('records a fully paid cash invoice as a customer payment', async () => {
        const screen = await renderCreateInvoice();
        await fireEvent.press(screen.getByTestId('invoice-customer-selector'));
        await waitFor(() => expect(screen.getByTestId('invoice-customer-option-customer-a')).toBeTruthy());
        await fireEvent.press(screen.getByTestId('invoice-customer-option-customer-a'));
        await fireEvent.press(screen.getByTestId('invoice-add-item-button'));
        await waitFor(() => expect(screen.getByTestId('invoice-product-option-product-a')).toBeTruthy());
        await fireEvent.press(screen.getByTestId('invoice-product-option-product-a'));
        await fireEvent.press(screen.getByTestId('invoice-payment-method-cash'));
        await fireEvent.press(screen.getByTestId('invoice-exact-amount-button'));
        await waitFor(() => expect(screen.getByTestId('invoice-amount-received-input').props.value).toBe('11.21'));
        await fireEvent.press(screen.getByTestId('invoice-save-button'));
        await waitFor(() => expect(repos().saveInvoiceDocument).toHaveBeenCalled());
        expect(repos().saveInvoiceDocument.mock.calls.at(-1)?.[1].draft).toEqual(expect.objectContaining({ commercialStatus: 'PAID' }));

        await waitFor(() => expect(repos().saveCustomerPayment).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                companyId: 'company-a',
                customerId: 'customer-a',
                invoiceId: 'invoice-a',
                amount: 11.21,
                paymentMethod: 'cash',
            }),
        ));
    });
});
