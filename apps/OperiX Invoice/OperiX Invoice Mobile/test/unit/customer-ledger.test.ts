import { buildCustomerLedger } from '@invoice-monorepo/report-templates';

describe('customer ledger credit notes', () => {
    it('treats a posted credit note as a credit against the customer balance', () => {
        const ledger = buildCustomerLedger({
            invoices: [
                { id: 'sale', invoice_number: 'FAT-1', issue_date: '2026-08-01', status: 'posted', commercial_document_type: 'INVOICE', total_amount: 100 },
                { id: 'return', invoice_number: 'NK-1', issue_date: '2026-08-02', status: 'posted', commercial_document_type: 'CREDIT_NOTE', total_amount: 25 },
            ],
            payments: [],
            from: '2026-01-01',
            to: '2026-12-31',
        });

        expect(ledger.totalDebit).toBe(100);
        expect(ledger.totalCredit).toBe(25);
        expect(ledger.closingBalance).toBe(75);
        expect(ledger.entries[1]).toMatchObject({ documentType: 'Notë Krediti', debit: 0, credit: 25, balance: 75 });
    });
});
