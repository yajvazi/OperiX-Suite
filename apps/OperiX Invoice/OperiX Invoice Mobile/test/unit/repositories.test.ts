import {
    completePosSale,
    deleteCustomer,
    deleteCustomerPayment,
    deleteExpense,
    deleteProduct,
    getInvoice,
    listInvoices,
    listInvoicePayments,
    listOpenCustomerInvoices,
    listFundBalances,
    listProducts,
    reserveDocumentNumber,
    reverseCustomerPayment,
    saveCustomer,
    saveCustomerPayment,
    saveExpense,
    saveInvoiceDocument,
    saveProduct,
} from '@invoice-monorepo/api/repositories';
import { type InvoiceDraftInput } from '@invoice-monorepo/api/domain';

type Result = { data: any; error: any };

class FakeRequest {
    readonly calls: Array<{ method: string; args: unknown[] }> = [];
    constructor(private readonly result: Result) {}

    private record(method: string, ...args: unknown[]) {
        this.calls.push({ method, args });
        return this;
    }

    select(...args: unknown[]) { return this.record('select', ...args); }
    eq(...args: unknown[]) { return this.record('eq', ...args); }
    neq(...args: unknown[]) { return this.record('neq', ...args); }
    in(...args: unknown[]) { return this.record('in', ...args); }
    not(...args: unknown[]) { return this.record('not', ...args); }
    or(...args: unknown[]) { return this.record('or', ...args); }
    order(...args: unknown[]) { return this.record('order', ...args); }
    limit(...args: unknown[]) { return this.record('limit', ...args); }
    insert(...args: unknown[]) { return this.record('insert', ...args); }
    update(...args: unknown[]) { return this.record('update', ...args); }
    delete(...args: unknown[]) { return this.record('delete', ...args); }
    single() { this.record('single'); return Promise.resolve(this.result); }
    maybeSingle() { this.record('maybeSingle'); return Promise.resolve(this.result); }
    then<TResult1 = Result, TResult2 = never>(onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null) {
        return Promise.resolve(this.result).then(onfulfilled, onrejected);
    }
}

class FakeSupabase {
    readonly requests: Array<{ table: string; request: FakeRequest }> = [];
    readonly rpcs: Array<{ name: string; args: Record<string, unknown> }> = [];
    private readonly tableResults: Record<string, Result[]>;
    private readonly rpcResults: Record<string, Result[]>;

    constructor(options: { tableResults?: Record<string, Result[]>; rpcResults?: Record<string, Result[]>; [table: string]: unknown } = {}) {
        const { tableResults, rpcResults, ...directTableResults } = options;
        this.tableResults = tableResults || directTableResults as Record<string, Result[]>;
        this.rpcResults = rpcResults || {};
    }

    from(table: string) {
        const result = (this.tableResults[table] || [{ data: [], error: null }]).shift() || { data: [], error: null };
        const request = new FakeRequest(result);
        this.requests.push({ table, request });
        return request;
    }

    rpc(name: string, args: Record<string, unknown>) {
        this.rpcs.push({ name, args });
        const result = (this.rpcResults[name] || [{ data: null, error: null }]).shift() || { data: null, error: null };
        return Promise.resolve(result);
    }
}

const scope = { userId: 'user-a', companyIds: ['company-a'] };

const invoiceDraft: InvoiceDraftInput = {
    userId: 'user-a',
    companyId: 'company-a',
    issueDate: '2026-08-19',
    dueDate: '2026-09-18',
    documentType: 'INVOICE',
    paymentMethod: 'bank',
    currency: 'EUR',
    lines: [{ productId: 'product-a', description: 'Service', quantity: 1, unitPrice: 10, taxRate: 18 }],
};

describe('Supabase repository query contracts', () => {
    it('scopes invoice reads by user and all permitted company IDs', async () => {
        const client = new FakeSupabase({ invoices: [{ data: { id: 'invoice-a' }, error: null }] });
        await getInvoice(client as any, 'invoice-a', scope);
        const request = client.requests[0];
        expect(request.table).toBe('invoices');
        expect(request.request.calls).toEqual(expect.arrayContaining([
            { method: 'select', args: ['*, client:clients(*), items:invoice_items(*)'] },
            { method: 'eq', args: ['id', 'invoice-a'] },
            { method: 'or', args: ['and(user_id.eq.user-a,company_id.is.null),company_id.eq.company-a'] },
            { method: 'maybeSingle', args: [] },
        ]));
    });

    it('filters invoices by commercial type, legacy type, and bounded result size', async () => {
        const client = new FakeSupabase({ invoices: [{ data: [], error: null }] });
        await listInvoices(client as any, scope, { documentType: 'INVOICE', legacyType: 'invoice', limit: 25 });
        const calls = client.requests[0].request.calls;
        expect(calls).toEqual(expect.arrayContaining([
            { method: 'or', args: ['commercial_document_type.eq.INVOICE,type.eq.invoice'] },
            { method: 'limit', args: [25] },
        ]));
    });

    it('returns empty lists and propagates Supabase errors without hiding them', async () => {
        const empty = new FakeSupabase({ products: [{ data: [], error: null }] });
        await expect(listProducts(empty as any, scope)).resolves.toEqual([]);
        const failing = new FakeSupabase({ invoices: [{ data: null, error: { code: 'PGRST116', message: 'denied' } }] });
        await expect(getInvoice(failing as any, 'invoice-b', scope)).rejects.toMatchObject({ code: 'PGRST116' });
    });

    it('uses tenant ownership predicates for updates and deletes', async () => {
        const updateClient = new FakeSupabase({ clients: [{ data: { id: 'customer-a' }, error: null }] });
        await saveCustomer(updateClient as any, { id: 'customer-a', name: 'Updated', user_id: 'user-a', company_id: 'company-a' }, 'customer-a');
        expect(updateClient.requests[0].request.calls).toEqual(expect.arrayContaining([
            { method: 'eq', args: ['id', 'customer-a'] },
            { method: 'or', args: ['company_id.eq.company-a,and(user_id.eq.user-a,company_id.is.null)'] },
        ]));

        const deleteClient = new FakeSupabase();
        await deleteCustomer(deleteClient as any, 'customer-b', 'company-a', 'user-a');
        expect(deleteClient.requests[0].request.calls).toEqual(expect.arrayContaining([
            { method: 'eq', args: ['id', 'customer-b'] },
            { method: 'or', args: ['company_id.eq.company-a,and(user_id.eq.user-a,company_id.is.null)'] },
        ]));
    });

    it('uses the same tenant-safe contract for products', async () => {
        const client = new FakeSupabase({ products: [{ data: { id: 'product-a' }, error: null }] });
        await saveProduct(client as any, { id: 'product-a', name: 'Updated', user_id: 'user-a', company_id: 'company-a' }, 'product-a');
        expect(client.requests[0].request.calls).toEqual(expect.arrayContaining([
            { method: 'or', args: ['company_id.eq.company-a,and(user_id.eq.user-a,company_id.is.null)'] },
        ]));
    });

    it('deletes products through the history-preserving RPC', async () => {
        const client = new FakeSupabase();
        await deleteProduct(client as any, 'product-a', 'company-a', 'user-a');
        expect(client.rpcs).toEqual([{
            name: 'delete_product',
            args: { p_product_id: 'product-a', p_company_id: 'company-a' },
        }]);
    });

    it('refuses to delete a product without an exact active company scope', async () => {
        const client = new FakeSupabase();
        await expect(deleteProduct(client as any, 'product-a', '   ', 'user-a')).rejects.toThrow(/company is required/);
        expect(client.rpcs).toHaveLength(0);
    });

    it('keeps shared fund projections separate for tenant-labelled balances', async () => {
        const client = new FakeSupabase({ operix_fund_balances: [{ data: [
            { id: 'fund-a', company_id: 'tenant-a', is_shared: false },
            { id: 'fund-a', company_id: 'tenant-b', is_shared: true },
            { id: 'fund-b', company_id: 'tenant-b', is_shared: false },
        ], error: null }] });
        const funds = await listFundBalances(client as any, ['root', 'tenant-a', 'tenant-b']);
        expect(funds.map((fund) => `${fund.company_id}:${fund.id}`)).toEqual([
            'tenant-a:fund-a',
            'tenant-b:fund-a',
            'tenant-b:fund-b',
        ]);
    });

    it('deletes expenses through the ledger-aware RPC', async () => {
        const client = new FakeSupabase();
        await deleteExpense(client as any, 'expense-a', 'company-a', 'user-a');
        expect(client.requests).toHaveLength(0);
        expect(client.rpcs).toEqual([{ name: 'delete_expense', args: { p_expense_id: 'expense-a' } }]);
    });

    it('corrects posted expenses through the audited correction RPC', async () => {
        const client = new FakeSupabase({ rpcResults: { correct_expense: [{ data: { id: 'expense-a' }, error: null }] } });
        await saveExpense(client as any, {
            amount: 46.43,
            category: 'Marketing',
            description: 'Corrected expense',
            date: '2026-08-20',
            receipt_url: '',
            type: 'expense',
            payment_method: 'cash',
            user_id: 'user-a',
            company_id: 'company-a',
        }, 'expense-a', { correctPostedExpense: true, idempotencyKey: 'correction-id' });
        expect(client.requests).toHaveLength(0);
        expect(client.rpcs).toEqual([{
            name: 'correct_expense',
            args: expect.objectContaining({
                p_expense_id: 'expense-a',
                p_amount: 46.43,
                p_category: 'Marketing',
                p_description: 'Corrected expense',
                p_date: '2026-08-20',
                p_payment_method: 'cash',
                p_correction_id: 'correction-id',
            }),
        }]);
    });
});

describe('invoice/payment/RPC command contracts', () => {
    it('reserves a document number using the canonical RPC arguments', async () => {
        const client = new FakeSupabase({ rpcResults: { reserve_invoice_number: [{ data: 'FAT-2026-0001', error: null }] } });
        await expect(reserveDocumentNumber(client as any, 'company-a', 'INVOICE', '2026-08-19')).resolves.toBe('FAT-2026-0001');
        expect(client.rpcs[0]).toEqual({ name: 'reserve_invoice_number', args: { p_company_id: 'company-a', p_document_type: 'invoice', p_issue_date: '2026-08-19' } });
    });

    it('saves an invoice through one idempotent server command and never directly inserts rows', async () => {
        const client = new FakeSupabase({ rpcResults: {
            reserve_invoice_number: [{ data: 'FAT-2026-0001', error: null }],
            save_invoice_document: [{ data: { id: 'invoice-a', invoice_number: 'FAT-2026-0001' }, error: null }],
        } });
        await expect(saveInvoiceDocument(client as any, { draft: invoiceDraft, postInvoice: true, idempotencyKey: 'idem-a' })).resolves.toMatchObject({ invoice: { id: 'invoice-a' } });
        expect(client.rpcs.map((rpc) => rpc.name)).toEqual(['reserve_invoice_number', 'save_invoice_document']);
        expect(client.rpcs[1].args).toMatchObject({ p_invoice_id: null, p_post_invoice: true, p_idempotency_key: 'idem-a' });
        expect(client.rpcs[1].args.p_items).toEqual([expect.objectContaining({ product_id: 'product-a', amount: 10 })]);
    });

    it('rejects invalid payment values before any database call', async () => {
        const client = new FakeSupabase();
        await expect(saveCustomerPayment(client as any, { userId: 'user-a', companyId: 'company-a', customerId: 'customer-a', amount: 0, paymentDate: '2026-08-19', paymentMethod: 'cash' })).rejects.toThrow(/greater than zero/);
        await expect(saveCustomerPayment(client as any, { userId: 'user-a', companyId: 'company-a', customerId: 'customer-a', amount: 10, paymentDate: '19/08/2026', paymentMethod: 'cash' })).rejects.toThrow(/ISO date/);
        expect(client.requests).toHaveLength(0);
        expect(client.rpcs).toHaveLength(0);
    });

    it('records and allocates a payment through settlement and accounting RPCs', async () => {
        const client = new FakeSupabase({
            chart_of_accounts: [{ data: { id: 'cash-account' }, error: null }],
            payment_allocations: [{ data: null, error: null }],
            rpcResults: {
                record_customer_payment: [{ data: { id: 'payment-a' }, error: null }],
                allocate_customer_payment: [{ data: { id: 'allocation-a' }, error: null }],
            },
        });
        const result = await saveCustomerPayment(client as any, { userId: 'user-a', companyId: 'company-a', customerId: 'customer-a', invoiceId: 'invoice-a', amount: '25.50', paymentDate: '2026-08-19', paymentMethod: 'cash', idempotencyKey: 'payment-idem' });
        expect(result).toEqual({ payment: { id: 'payment-a' }, allocation: { id: 'allocation-a' }, allocationError: null });
        expect(client.rpcs).toEqual(expect.arrayContaining([
            { name: 'record_customer_payment', args: expect.objectContaining({ p_company_id: 'company-a', p_settlement_account_id: 'cash-account', p_amount: 25.5, p_idempotency_key: 'payment-idem' }) },
            { name: 'allocate_customer_payment', args: { p_payment_id: 'payment-a', p_invoice_id: 'invoice-a', p_amount: 25.5, p_allocation_date: '2026-08-19' } },
        ]));
    });

    it('requires a reason and calls the reversal RPC', async () => {
        const client = new FakeSupabase({ rpcResults: { reverse_customer_payment: [{ data: { id: 'reversed' }, error: null }] } });
        await expect(reverseCustomerPayment(client as any, 'payment-a', ' Duplicate entry ')).resolves.toEqual({ id: 'reversed' });
        expect(client.rpcs[0].args).toMatchObject({ p_payment_id: 'payment-a', p_reason: 'Duplicate entry' });
        await expect(reverseCustomerPayment(client as any, 'payment-a', '   ')).rejects.toThrow(/reason is required/);
    });

    it('deletes legacy payments in tenant scope and reverses posted payments', async () => {
        const legacyClient = new FakeSupabase({ payments: [{ data: { id: 'payment-a', accounting_state: 'legacy' }, error: null }] });
        await deleteCustomerPayment(legacyClient as any, 'payment-a', scope);
        expect(legacyClient.requests.map(({ request }) => request.calls)).toEqual(expect.arrayContaining([
            expect.arrayContaining([{ method: 'delete', args: [] }]),
            expect.arrayContaining([{ method: 'or', args: ['and(user_id.eq.user-a,company_id.is.null),company_id.eq.company-a'] }]),
        ]));

        const postedClient = new FakeSupabase({
            payments: [{ data: { id: 'payment-a', accounting_state: 'posted' }, error: null }],
            rpcResults: { reverse_customer_payment: [{ data: { id: 'payment-a', accounting_state: 'reversed' }, error: null }] },
        });
        await deleteCustomerPayment(postedClient as any, 'payment-a', scope);
        expect(postedClient.rpcs[0]).toEqual(expect.objectContaining({
            name: 'reverse_customer_payment',
            args: expect.objectContaining({ p_payment_id: 'payment-a', p_reason: 'Payment deleted by user' }),
        }));
    });

    it('completes a non-stock POS sale through the terminal-aware RPC and includes idempotency', async () => {
        const client = new FakeSupabase({
            products: [{ data: [{ id: 'product-a', name: 'Coffee', unit: 'pcs', unit_price: 10, tax_rate: 18, tax_included: false, track_stock: false }], error: null }],
            pos_terminals: [{ data: [{ id: 'terminal-a' }], error: null }],
            rpcResults: { complete_pos_sale_with_signature: [{ data: { invoice_id: 'invoice-a', invoice_number: 'FAT-1', total_amount: 11.8, change_amount: 0 }, error: null }] },
        });
        const result = await completePosSale(client as any, { userId: 'user-a', companyId: 'company-a', lines: [{ productId: 'product-a', quantity: 1, unitPrice: 10 }], payment: 'cash', cashReceived: 11.8, idempotencyKey: 'pos-idem' });
        expect(result).toMatchObject({ invoiceId: 'invoice-a', invoiceNumber: 'FAT-1', totalAmount: 11.8 });
        expect(client.rpcs[0]).toEqual(expect.objectContaining({ name: 'complete_pos_sale_with_signature', args: expect.objectContaining({ p_company_id: 'company-a', p_terminal_id: 'terminal-a', p_idempotency_key: 'pos-idem' }) }));
    });

    it('rejects a cross-tenant POS product response before creating a sale', async () => {
        const client = new FakeSupabase({ products: [{ data: [], error: null }] });
        await expect(completePosSale(client as any, { userId: 'user-a', companyId: 'company-a', lines: [{ productId: 'product-from-b', quantity: 1, unitPrice: 10 }], payment: 'cash', idempotencyKey: 'pos-idem' })).rejects.toThrow(/not available in this company/);
        expect(client.rpcs).toHaveLength(0);
    });

    it('keeps open invoice queries tenant-scoped and excludes paid/cancelled rows', async () => {
        const client = new FakeSupabase({ invoices: [{ data: [], error: null }] });
        await listOpenCustomerInvoices(client as any, scope, 'customer-a');
        expect(client.requests[0].request.calls).toEqual(expect.arrayContaining([
            { method: 'eq', args: ['client_id', 'customer-a'] },
            { method: 'in', args: ['commercial_document_type', ['INVOICE', 'FINAL_INVOICE', 'ADVANCE_INVOICE']] },
            { method: 'not', args: ['status', 'in', '(paid,cancelled,credited,reversed)'] },
            { method: 'or', args: ['and(user_id.eq.user-a,company_id.is.null),company_id.eq.company-a'] },
        ]));
    });

    it('merges allocated and direct invoice payments without duplicate payment IDs', async () => {
        const client = new FakeSupabase({
            payments: [
                { data: [{ id: 'payment-a', amount: 100, payment_date: '2026-08-01' }, { id: 'payment-b', amount: 10, payment_date: '2026-07-01' }], error: null },
                { data: [{ id: 'payment-a', amount: 100, payment_date: '2026-08-01' }], error: null },
            ],
            payment_allocations: [{ data: [{ payment_id: 'payment-a', allocated_amount: 60, allocation_date: '2026-08-03' }], error: null }],
        });
        const payments = await listInvoicePayments(client as any, scope, 'invoice-a');
        expect(payments).toEqual([
            expect.objectContaining({ id: 'payment-a', amount: 60, allocation_amount: 60, payment_date: '2026-08-03' }),
            expect.objectContaining({ id: 'payment-b', amount: 10 }),
        ]);
    });
});
