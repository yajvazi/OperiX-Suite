import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDailySalesSnapshot, localDateKey } from './dailySalesSnapshot.ts';

const now = new Date(2026, 9, 30, 15, 0, 0);
const today = localDateKey(now);
const tenants = [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }];
const row = (extra) => ({ company_id: 'a', issue_date: today, total_amount: 100, status: 'sent', document_type: 'INVOICE', ...extra });

test('counts only real sales made today', () => {
    const snapshot = buildDailySalesSnapshot({
        now, tenants, defaultTenantId: 'a', currency: 'EUR',
        rows: [row({}), row({ total_amount: '50.5', status: 'paid' }), row({ status: 'draft' }), row({ status: 'cancelled' }), row({ document_type: 'QUOTE' }),
            row({ issue_date: '2026-10-29' }), row({ company_id: 'b', total_amount: 7 }), row({ company_id: null, total_amount: 1 })],
    });
    assert.equal(snapshot.tenants.a.sales, 151.5);
    assert.equal(snapshot.tenants.a.orders, 3);
    assert.equal(snapshot.tenants.b.sales, 7);
    assert.equal(snapshot.tenants.b.orders, 1);
});

test('credit notes reduce sales but are not orders', () => {
    const snapshot = buildDailySalesSnapshot({ now, tenants, defaultTenantId: 'a', rows: [row({}), row({ document_type: 'CREDIT_NOTE', total_amount: -30 })] });
    assert.equal(snapshot.tenants.a.sales, 70);
    assert.equal(snapshot.tenants.a.orders, 1);
});

test('uses the field names the Swift widget decodes', () => {
    const snapshot = buildDailySalesSnapshot({ now, tenants, defaultTenantId: 'a', rows: [] });
    const entry = snapshot.tenants.a;
    assert.equal(entry.tenantId, 'a');
    assert.equal(entry.tenantName, 'Alpha');
    assert.equal(entry.date, today);
    assert.equal(entry.currency, 'EUR');
    assert.equal(snapshot.defaultTenantId, 'a');
});

test('a full timestamp is converted to the local day', () => {
    const local = new Date(now);
    const snapshot = buildDailySalesSnapshot({ now, tenants, defaultTenantId: 'a', rows: [row({ issue_date: local.toISOString() })] });
    assert.equal(snapshot.tenants.a.orders, 1);
});
