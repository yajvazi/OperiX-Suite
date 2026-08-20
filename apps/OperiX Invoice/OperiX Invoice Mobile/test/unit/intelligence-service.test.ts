import { buildIntelligenceSnapshot } from '../../src/services/intelligence/analytics';

const mockFrom = jest.fn();
const mockUpsert = jest.fn();
const mockUpdate = jest.fn();

jest.mock('@invoice-monorepo/api', () => ({
    supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));

jest.mock('../../src/services/ai/operixAi', () => ({
    getAIIntelligenceCommentary: jest.fn(),
    getAISettings: jest.fn(),
}));

jest.mock('../../src/services/workspace', () => ({
    getActiveProductCompanyIds: jest.fn(() => ['company-a']),
    getActiveTenantCompanyIds: jest.fn(() => ['company-a']),
    getWorkspaceScope: jest.fn(),
    scopedResource: jest.fn(() => 'user_id.eq.user-a'),
}));

import { syncIntelligenceNotifications } from '../../src/services/intelligence/operixIntelligence';

function configureNotificationQuery(existing: Array<{ id: string; insight_key: string }> = []) {
    const query: Record<string, any> = {};
    query.select = jest.fn(() => query);
    query.eq = jest.fn(() => query);
    query.is = jest.fn(() => query);
    query.update = jest.fn((payload: unknown) => {
        mockUpdate(payload);
        return query;
    });
    query.upsert = jest.fn((rows: unknown) => {
        mockUpsert(rows);
        return Promise.resolve({ data: rows, error: null });
    });
    query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve({ data: existing, error: null }).then(resolve, reject);
    mockFrom.mockReturnValue(query);
}

function snapshot() {
    return buildIntelligenceSnapshot({
        asOf: '2026-08-20',
        currency: 'EUR',
        invoices: [{ id: 'invoice-a', invoice_number: 'INV-1045', issue_date: '2026-07-20', due_date: '2026-08-06', status: 'sent', total_amount: 1_200, amount_received: 0, client_id: 'customer-a', client: { id: 'customer-a', name: 'ABC LLC' } }],
        customers: [{ id: 'customer-a', name: 'ABC LLC' }],
    });
}

describe('automatic intelligence notification persistence', () => {
    beforeEach(() => {
        mockFrom.mockReset();
        mockUpsert.mockReset();
        mockUpdate.mockReset();
    });

    test('persists a once-per-day briefing and redacts financial amounts when configured', async () => {
        configureNotificationQuery();
        await syncIntelligenceNotifications(snapshot(), {
            ai_enabled: true,
            preferred_language: 'sq',
            daily_briefing_enabled: true,
            history_enabled: true,
            show_amounts_in_notifications: false,
        }, 'user-a', 'company-a', 'sq');

        expect(mockUpsert).toHaveBeenCalledTimes(1);
        const rows = mockUpsert.mock.calls[0][0] as Array<Record<string, unknown>>;
        expect(rows.some((row) => row.insight_key === 'briefing:2026-08-20')).toBe(true);
        const overdue = rows.find((row) => String(row.insight_key).startsWith('overdue:'));
        expect(overdue?.title).toBe('Faturë e vonuar');
        expect(String(overdue?.body)).toContain('një shumë');
        expect(String(overdue?.body)).toContain('14 ditë');
    });

    test('moves an alert to resolved state when the deterministic finding disappears', async () => {
        configureNotificationQuery([{ id: 'notification-old', insight_key: 'overdue:old:7' }]);
        await syncIntelligenceNotifications(buildIntelligenceSnapshot({ asOf: '2026-08-20' }), {
            ai_enabled: true,
            preferred_language: 'auto',
            daily_briefing_enabled: true,
            history_enabled: true,
        }, 'user-a', 'company-a');

        expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ resolved_at: expect.any(String) }));
    });
});
