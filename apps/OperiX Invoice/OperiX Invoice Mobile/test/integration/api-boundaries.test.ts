import {
    listInvoices,
    saveCustomerPayment,
    saveInvoiceDocument,
} from '@invoice-monorepo/api/repositories';
import type { InvoiceDraftInput } from '@invoice-monorepo/api/domain';
import { createInvoice, createPayment, TEST_FIXTURE_IDS } from '../fixtures/factories';

type Result = { data: any; error: any };

class RecordingRequest {
    readonly calls: Array<{ method: string; args: unknown[] }> = [];

    constructor(private readonly result: Result) {}

    private record(method: string, ...args: unknown[]) {
        this.calls.push({ method, args });
        return this;
    }

    select(...args: unknown[]) { return this.record('select', ...args); }
    eq(...args: unknown[]) { return this.record('eq', ...args); }
    or(...args: unknown[]) { return this.record('or', ...args); }
    in(...args: unknown[]) { return this.record('in', ...args); }
    order(...args: unknown[]) { return this.record('order', ...args); }
    limit(...args: unknown[]) { return this.record('limit', ...args); }
    insert(...args: unknown[]) { return this.record('insert', ...args); }
    update(...args: unknown[]) { return this.record('update', ...args); }
    delete(...args: unknown[]) { return this.record('delete', ...args); }
    single() { this.record('single'); return Promise.resolve(this.result); }
    maybeSingle() { this.record('maybeSingle'); return Promise.resolve(this.result); }
    then<T1 = Result, T2 = never>(onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null, onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null) {
        return Promise.resolve(this.result).then(onfulfilled, onrejected);
    }
}

class RecordingSupabase {
    readonly requests: Array<{ table: string; request: RecordingRequest }> = [];
    readonly rpcs: Array<{ name: string; args: Record<string, unknown> }> = [];

    constructor(
        private readonly tableResults: Record<string, Result[]> = {},
        private readonly rpcResults: Record<string, Result[]> = {},
    ) {}

    from(table: string) {
        const result = this.tableResults[table]?.shift() || { data: [], error: null };
        const request = new RecordingRequest(result);
        this.requests.push({ table, request });
        return request;
    }

    rpc(name: string, args: Record<string, unknown>) {
        this.rpcs.push({ name, args });
        return Promise.resolve(this.rpcResults[name]?.shift() || { data: null, error: null });
    }
}

const scope = { userId: TEST_FIXTURE_IDS.userA, companyIds: [TEST_FIXTURE_IDS.tenantA] };

describe('mobile API integration boundaries', () => {
    it('executes a tenant-scoped invoice read against a PostgREST-shaped client', async () => {
        const invoice = createInvoice();
        const client = new RecordingSupabase({ invoices: [{ data: [invoice], error: null }] });

        await expect(listInvoices(client as any, scope, { limit: 20 })).resolves.toEqual([invoice]);
        expect(client.requests).toHaveLength(1);
        expect(client.requests[0].table).toBe('invoices');
        expect(client.requests[0].request.calls).toEqual(expect.arrayContaining([
            { method: 'or', args: ['and(user_id.eq.10000000-0000-0000-0000-000000000002,company_id.is.null),company_id.eq.10000000-0000-0000-0000-000000000001'] },
            { method: 'limit', args: [20] },
        ]));
    });

    it('uses the atomic invoice command pipeline and never falls back to direct invoice inserts', async () => {
        const draft: InvoiceDraftInput = {
            userId: TEST_FIXTURE_IDS.userA,
            companyId: TEST_FIXTURE_IDS.tenantA,
            clientId: TEST_FIXTURE_IDS.customerA,
            issueDate: '2026-08-19',
            dueDate: '2026-09-18',
            documentType: 'INVOICE',
            paymentMethod: 'bank',
            currency: 'EUR',
            lines: [{ productId: TEST_FIXTURE_IDS.productA, description: 'Test Product', quantity: 1, unitPrice: 10, taxRate: 18 }],
        };
        const client = new RecordingSupabase({}, {
            reserve_invoice_number: [{ data: 'FAT-TEST-0001', error: null }],
            save_invoice_document: [{ data: createInvoice(), error: null }],
        });

        await saveInvoiceDocument(client as any, { draft, postInvoice: true, idempotencyKey: 'integration-invoice-key' });
        expect(client.requests).toHaveLength(0);
        expect(client.rpcs.map((rpc) => rpc.name)).toEqual(['reserve_invoice_number', 'save_invoice_document']);
        expect(client.rpcs[1].args).toMatchObject({
            p_post_invoice: true,
            p_idempotency_key: 'integration-invoice-key',
        });
        expect((client.rpcs[1].args.p_invoice as Record<string, unknown>).company_id).toBe(TEST_FIXTURE_IDS.tenantA);
    });

    it('keeps payment settlement tenant-bound and propagates a payment RPC failure', async () => {
        const client = new RecordingSupabase(
            { chart_of_accounts: [{ data: { id: 'cash-account' }, error: null }] },
            { record_customer_payment: [{ data: null, error: { code: '23514', message: 'settlement rejected' } }] },
        );

        await expect(saveCustomerPayment(client as any, {
            userId: TEST_FIXTURE_IDS.userA,
            companyId: TEST_FIXTURE_IDS.tenantA,
            customerId: TEST_FIXTURE_IDS.customerA,
            invoiceId: TEST_FIXTURE_IDS.invoiceA,
            amount: createPayment().amount,
            paymentDate: '2026-08-19',
            paymentMethod: 'cash',
        })).rejects.toMatchObject({ code: '23514' });
        expect(client.rpcs[0]).toMatchObject({
            name: 'record_customer_payment',
            args: expect.objectContaining({ p_company_id: TEST_FIXTURE_IDS.tenantA, p_customer_id: TEST_FIXTURE_IDS.customerA }),
        });
    });
});
