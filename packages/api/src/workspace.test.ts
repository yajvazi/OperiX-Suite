import assert from 'node:assert/strict';
import test from 'node:test';
import { collectCompanyScope, resolveWorkspace, scopedResource, scopedSearch } from './workspace.ts';

test('workspace scope includes descendants without leaking unrelated companies', () => {
  const ids = collectCompanyScope([
    { id: 'root', parent_company_id: null },
    { id: 'child', parent_company_id: 'root' },
    { id: 'grandchild', parent_company_id: 'child' },
    { id: 'unrelated', parent_company_id: null },
  ], 'root');
  assert.deepEqual(ids, ['root', 'child', 'grandchild']);
});

test('tenant filters retain legacy creator rows and company-owned rows', () => {
  const scope = scopedResource('user-1', ['company-a', 'company-b']);
  assert.equal(scope, 'and(user_id.eq.user-1,company_id.is.null),company_id.eq.company-a,company_id.eq.company-b');
  assert.match(scopedSearch(scope, ['name', 'email'], 'Acme'), /and\(user_id\.eq\.user-1,company_id\.is\.null,name\.ilike\.Acme\)/);
  assert.match(scopedSearch(scope, ['name', 'email'], 'Acme'), /and\(company_id\.eq\.company-b,email\.ilike\.Acme\)/);
});

test('workspace resolution falls back to an active membership when the legacy profile is missing', async () => {
  const results: Record<string, { data: unknown; error: unknown }> = {
    profiles: { data: null, error: null },
    memberships: { data: [{ company_id: 'company-a', role: 'company_administrator' }], error: null },
    companies: { data: [{ id: 'company-a', company_name: 'Test Company', parent_company_id: null }], error: null },
  };
  const client = {
    from(table: string) {
      const result = results[table] || { data: [], error: null };
      const query: Record<string, unknown> = {};
      const chain = () => query;
      query.select = chain;
      query.eq = chain;
      query.order = chain;
      query.limit = chain;
      query.maybeSingle = () => Promise.resolve(result);
      query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
      return query;
    },
    rpc() {
      return Promise.resolve({ data: 'company_administrator', error: null });
    },
  } as any;

  const scope = await resolveWorkspace(client, 'user-a');
  assert.equal(scope.companyId, 'company-a');
  assert.deepEqual(scope.companyIds, ['company-a']);
  assert.equal(scope.profile.company_id, 'company-a');
});
