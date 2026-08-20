import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { OperixAIScreen } from '../../src/screens/AI/OperixAIScreen';
import { buildIntelligenceSnapshot } from '../../src/services/intelligence/analytics';
import { getIntelligenceSnapshot } from '../../src/services/intelligence/operixIntelligence';
import { createNavigationMock, renderWithProviders } from '../test-utils';

jest.mock('@react-navigation/native', () => {
    const actual = jest.requireActual('@react-navigation/native');
    return {
        ...actual,
        useNavigation: () => ({ goBack: jest.fn() }),
        useFocusEffect: (effect: () => void | (() => void)) => {
            const ReactRuntime = require('react');
            ReactRuntime.useEffect(effect, [effect]);
        },
    };
});

jest.mock('../../src/services/intelligence/operixIntelligence', () => ({
    __esModule: true,
    getIntelligenceSnapshot: jest.fn(),
}));

const mockedSnapshot = getIntelligenceSnapshot as jest.MockedFunction<typeof getIntelligenceSnapshot>;

function fixture() {
    return buildIntelligenceSnapshot({
        asOf: '2026-08-20',
        currency: 'EUR',
        invoices: [
            { id: 'invoice-overdue', invoice_number: 'INV-1045', issue_date: '2026-07-20', due_date: '2026-08-06', status: 'sent', total_amount: 1200, amount_received: 0, client_id: 'customer-a', client: { id: 'customer-a', name: 'ABC LLC' } },
            { id: 'invoice-current', invoice_number: 'INV-1046', issue_date: '2026-08-19', due_date: '2026-09-01', status: 'paid', total_amount: 400, amount_received: 400, client_id: 'customer-a', client: { id: 'customer-a', name: 'ABC LLC' } },
        ],
        customers: [{ id: 'customer-a', name: 'ABC LLC' }],
        payments: [{ id: 'payment-a', invoice_id: 'invoice-current', client_id: 'customer-a', amount: 400, payment_date: '2026-08-19' }],
        products: [{ id: 'product-a', name: 'Fener fluturues', unit: 'units', track_stock: true, stock_quantity: 18, low_stock_threshold: 20 }],
    });
}

describe('OperiX AI mobile page', () => {
    beforeEach(() => {
        mockedSnapshot.mockResolvedValue(fixture());
    });

    test('replaces the visible AI chat with automatic dashboard intelligence', async () => {
        const navigation = createNavigationMock();
        const view = await renderWithProviders(<OperixAIScreen navigation={navigation} />);
        await waitFor(() => expect(view.getByTestId('operix-intelligence-screen')).toBeTruthy());
        expect(view.getByText('OperiX AI')).toBeTruthy();
        expect(view.getByText('Today’s briefing')).toBeTruthy();
        expect(view.getByText('Invoice overdue')).toBeTruthy();
        expect(view.queryByTestId('ai-input')).toBeNull();
        expect(view.queryByTestId('ai-send-button')).toBeNull();
        expect(view.queryByTestId('ai-attach-button')).toBeNull();
        expect(view.queryByText('Ask OperiX AI anything about your business…')).toBeNull();
        expect(view.queryByText('Conversation history')).toBeNull();
    });

    test('deep-links an automatic overdue insight to the existing invoice screen', async () => {
        const navigation = createNavigationMock();
        const view = await renderWithProviders(<OperixAIScreen navigation={navigation} />);
        await waitFor(() => expect(view.getByText('Invoice overdue')).toBeTruthy());
        fireEvent.press(view.getByText('Invoice overdue'));
        expect(navigation.navigate).toHaveBeenCalledWith('InvoiceDetail', { invoiceId: 'invoice-overdue' });
    });

    test('renders deterministic data when AI commentary is unavailable', async () => {
        const snapshot = fixture();
        snapshot.commentary = undefined;
        snapshot.commentarySource = 'deterministic';
        mockedSnapshot.mockResolvedValueOnce(snapshot);
        const view = await renderWithProviders(<OperixAIScreen navigation={createNavigationMock()} />);
        await waitFor(() => expect(view.getByText(/Calculated/)).toBeTruthy());
        expect(view.getByText(/OperiX has refreshed|Yesterday’s sales/)).toBeTruthy();
    });

    test('shows the learning state without fake alerts when there is no data', async () => {
        mockedSnapshot.mockResolvedValueOnce(buildIntelligenceSnapshot({ permissions: { invoices: false, payments: false, customers: false, inventory: false, sales: false } }));
        const view = await renderWithProviders(<OperixAIScreen navigation={createNavigationMock()} />);
        await waitFor(() => expect(view.getByText('OperiX AI is learning from your business')).toBeTruthy());
        expect(view.queryByText('Invoice overdue')).toBeNull();
    });
});
