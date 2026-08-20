import { collectCompanyScope, scopedResource, scopedSearch } from '@invoice-monorepo/api/workspace';
import { getActiveProductCompanyIds, getActiveTenantCompanyIds } from '../../src/services/workspace';

describe('tenant workspace scope', () => {
    it('collects a root company and all descendants without cycles', () => {
        expect(collectCompanyScope([
            { id: 'child-a', company_name: 'Child A', parent_company_id: 'root' },
            { id: 'grandchild', company_name: 'Grandchild', parent_company_id: 'child-a' },
            { id: 'child-b', company_name: 'Child B', parent_company_id: 'root' },
            { id: 'root', company_name: 'Root', parent_company_id: 'grandchild' },
            { id: 'other', company_name: 'Other', parent_company_id: 'unrelated' },
        ], 'root')).toEqual(['root', 'child-a', 'child-b', 'grandchild']);
    });

    it('builds an OR scope that includes both legacy creator rows and tenant rows', () => {
        expect(scopedResource('user-a', ['company-a', 'company-b'])).toBe('and(user_id.eq.user-a,company_id.is.null),company_id.eq.company-a,company_id.eq.company-b');
        expect(scopedSearch(scopedResource('user-a', ['company-a']), ['name', 'email'], '%ada%')).toContain('and(user_id.eq.user-a,company_id.is.null,name.ilike.%ada%)');
        expect(scopedSearch(scopedResource('user-a', ['company-a']), ['name', 'email'], '%ada%')).toContain('and(company_id.eq.company-a,email.ilike.%ada%)');
    });

    it('shows tenant products to a group root while keeping child tenants isolated', () => {
        expect(getActiveProductCompanyIds({ company: { id: 'child', company_name: 'Child', parent_company_id: 'root' }, companyId: 'child', roleCode: 'company_administrator', companyIds: ['child', 'sibling'], profile: {} as any, companies: [], isGroup: false, user: null })).toEqual(['child']);
        expect(getActiveProductCompanyIds({ company: { id: 'root', company_name: 'Root', parent_company_id: null }, companyId: 'root', roleCode: 'company_administrator', companyIds: ['root', 'child'], profile: {} as any, companies: [], isGroup: true, user: null })).toEqual(['root', 'child']);
    });

    it('shows descendant tenant data only from a main company', () => {
        expect(getActiveTenantCompanyIds({ company: { id: 'child', company_name: 'Child', parent_company_id: 'root' }, companyId: 'child', roleCode: 'company_administrator', companyIds: ['child', 'grandchild'], profile: {} as any, companies: [], isGroup: true, user: null })).toEqual(['child']);
        expect(getActiveTenantCompanyIds({ company: { id: 'root', company_name: 'Root', parent_company_id: null }, companyId: 'root', roleCode: 'company_administrator', companyIds: ['root', 'child'], profile: {} as any, companies: [], isGroup: true, user: null })).toEqual(['root', 'child']);
    });
});
