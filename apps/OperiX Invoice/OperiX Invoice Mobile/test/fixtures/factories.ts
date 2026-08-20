export const TEST_FIXTURE_IDS = {
    tenantA: '10000000-0000-0000-0000-000000000001',
    tenantB: '20000000-0000-0000-0000-000000000001',
    userA: '10000000-0000-0000-0000-000000000002',
    userB: '20000000-0000-0000-0000-000000000002',
    customerA: '10000000-0000-0000-0000-000000000003',
    customerB: '20000000-0000-0000-0000-000000000003',
    productA: '10000000-0000-0000-0000-000000000004',
    productB: '20000000-0000-0000-0000-000000000004',
    invoiceA: '10000000-0000-0000-0000-000000000005',
    invoiceB: '20000000-0000-0000-0000-000000000005',
    paymentA: '10000000-0000-0000-0000-000000000006',
    paymentB: '20000000-0000-0000-0000-000000000006',
} as const;

export function createTenant(overrides: Record<string, unknown> = {}) {
    return {
        id: TEST_FIXTURE_IDS.tenantA,
        company_name: 'OperiX Test Tenant A',
        parent_company_id: null,
        ...overrides,
    };
}

export function createUser(overrides: Record<string, unknown> = {}) {
    return {
        id: TEST_FIXTURE_IDS.userA,
        email: 'tenant-a@example.test',
        role: 'owner',
        company_id: TEST_FIXTURE_IDS.tenantA,
        ...overrides,
    };
}

export function createCustomer(overrides: Record<string, unknown> = {}) {
    return {
        id: TEST_FIXTURE_IDS.customerA,
        user_id: TEST_FIXTURE_IDS.userA,
        company_id: TEST_FIXTURE_IDS.tenantA,
        name: 'Blerinë Test Customer',
        email: 'customer-a@example.test',
        phone: '+38344123456',
        ...overrides,
    };
}

export function createProduct(overrides: Record<string, unknown> = {}) {
    return {
        id: TEST_FIXTURE_IDS.productA,
        user_id: TEST_FIXTURE_IDS.userA,
        company_id: TEST_FIXTURE_IDS.tenantA,
        name: 'Test Product',
        sku: 'SKU-TEST-A',
        unit_price: 10,
        tax_rate: 18,
        tax_included: false,
        track_stock: true,
        stock_quantity: 25,
        unit: 'pcs',
        ...overrides,
    };
}

export function createInvoice(overrides: Record<string, unknown> = {}) {
    return {
        id: TEST_FIXTURE_IDS.invoiceA,
        user_id: TEST_FIXTURE_IDS.userA,
        company_id: TEST_FIXTURE_IDS.tenantA,
        client_id: TEST_FIXTURE_IDS.customerA,
        invoice_number: 'FAT-TEST-0001',
        commercial_document_type: 'INVOICE',
        commercial_status: 'ISSUED',
        status: 'sent',
        total_amount: 11.8,
        amount_paid: 0,
        remaining_amount: 11.8,
        ...overrides,
    };
}

export function createPayment(overrides: Record<string, unknown> = {}) {
    return {
        id: TEST_FIXTURE_IDS.paymentA,
        user_id: TEST_FIXTURE_IDS.userA,
        company_id: TEST_FIXTURE_IDS.tenantA,
        customer_id: TEST_FIXTURE_IDS.customerA,
        invoice_id: TEST_FIXTURE_IDS.invoiceA,
        amount: 5,
        payment_date: '2026-08-19',
        payment_method: 'cash',
        ...overrides,
    };
}
