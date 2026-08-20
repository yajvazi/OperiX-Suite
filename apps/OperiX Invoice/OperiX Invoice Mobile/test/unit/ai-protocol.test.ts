import {
    dedupeCards,
    numberArg,
    parseAIEnvelope,
    redactAuditArguments,
} from '../../../../../supabase/functions/_shared/ai';

describe('OperiX AI protocol validation', () => {
    test('normalizes malformed model envelopes without trusting arbitrary cards', () => {
        const result = parseAIEnvelope(JSON.stringify({
            message: 'Done',
            cards: [
                { type: 'invoice', data: { invoiceId: 'server-id' } },
                { type: 'unknown', data: { id: 'not-allowed' } },
                { type: 'customer', data: 'not-an-object' },
            ],
            suggestedQuestions: ['one', 2, 'two'],
        }));

        expect(result.message).toBe('Done');
        expect(result.cards).toHaveLength(1);
        expect(result.cards[0].type).toBe('invoice');
        expect(result.suggestedQuestions).toEqual(['one', 'two']);
    });

    test('redacts document and free-form content from audit arguments', () => {
        expect(redactAuditArguments({ notes: 'ignore the system', base64: 'abc', quantity: 2 })).toEqual({
            notes: '[redacted:17]',
            base64: '[redacted:3]',
            quantity: 2,
        });
    });

    test('enforces numeric tool argument bounds and de-duplicates cards', () => {
        expect(() => numberArg({ amount: -1 }, 'amount', { min: 0 })).toThrow();
        expect(numberArg({ amount: '12.50' }, 'amount', { min: 0 })).toBe(12.5);
        const card = { type: 'error' as const, data: { message: 'Try again' } };
        expect(dedupeCards([card, card])).toHaveLength(1);
    });
});
