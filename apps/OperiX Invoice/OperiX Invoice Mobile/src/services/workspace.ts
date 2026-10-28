import { supabase } from '@invoice-monorepo/api';
import {
  resolveWorkspace,
  scopedResource as sharedScopedResource,
  scopedSearch as sharedScopedSearch,
  type WorkspaceScope as SharedWorkspaceScope,
} from '@invoice-monorepo/api/workspace';
import type { Company, Profile } from '@invoice-monorepo/types';
import { getLocalStore } from './localStore';
import { LOCAL_PERMISSIONS } from './localPermissions';
import { getStorageMode } from './storageMode';

export type WorkspaceCompany = Pick<Company, 'id' | 'company_name' | 'parent_company_id'> &
    Partial<Pick<Company, 'currency'>>;
export interface WorkspaceScope extends Omit<SharedWorkspaceScope, 'profile' | 'company'> {
    profile: Profile;
    company: WorkspaceCompany | null;
}

const WORKSPACE_CACHE_TTL_MS = 60_000;
const workspaceCache = new Map<string, { scope: WorkspaceScope; expiresAt: number }>();

async function getLocalWorkspaceScope(userId: string): Promise<WorkspaceScope> {
    const store = await getLocalStore();
    const company = await store.getCompany() as unknown as Record<string, unknown>;
    const workspaceCompany = { id: store.companyId, company_name: String(company.company_name || ''), parent_company_id: null, currency: String(company.currency || 'EUR') } as WorkspaceCompany;
    return {
        user: null,
        profile: { ...company, id: userId, company_id: store.companyId, active_company_id: store.companyId } as unknown as Profile,
        companyId: store.companyId,
        roleCode: 'company_administrator',
        permissions: [...LOCAL_PERMISSIONS],
        scopes: Object.fromEntries(LOCAL_PERMISSIONS.map((permission) => [permission, 'ALL'])) as WorkspaceScope['scopes'],
        platformAdmin: false,
        companyIds: [store.companyId],
        company: workspaceCompany,
        companies: [workspaceCompany],
        isGroup: false,
    } as unknown as WorkspaceScope;
}

export async function getWorkspaceScope(userId: string, options: { forceCloud?: boolean } = {}): Promise<WorkspaceScope> {
    if (!options.forceCloud && await getStorageMode() === 'local') return getLocalWorkspaceScope(userId);
    const cached = workspaceCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.scope;

    // Invoice is an account-facing client. Resolve only companies the user
    // owns or actively belongs to (plus their authorized subdivisions), even
    // when the authenticated user is also a platform administrator.
    const scope = await resolveWorkspace(supabase, userId, { membershipOnly: true });
    const workspaceScope = {
        ...scope,
        profile: scope.profile as unknown as Profile,
        company: scope.company as WorkspaceCompany | null,
    };
    workspaceCache.set(userId, { scope: workspaceScope, expiresAt: Date.now() + WORKSPACE_CACHE_TTL_MS });
    return workspaceScope;
}

export function invalidateWorkspaceScope(userId?: string) {
  if (userId) workspaceCache.delete(userId);
  else workspaceCache.clear();
}

export function hasWorkspacePermission(scope: Pick<WorkspaceScope, 'permissions' | 'platformAdmin'>, permission: string) {
  return scope.platformAdmin || scope.permissions.includes(permission);
}

/**
 * A group root sees the product catalogs of its tenant companies. A tenant
 * remains isolated because getActiveTenantCompanyIds returns only itself.
 */
export function getActiveProductCompanyIds(scope: WorkspaceScope): string[] {
  return getActiveTenantCompanyIds(scope);
}

/** Main companies can see their descendant tenants; subdivisions stay isolated. */
export function getActiveTenantCompanyIds(scope: WorkspaceScope): string[] {
  if (!scope.company) return [scope.companyId];
  return scope.company.parent_company_id ? [scope.companyId] : scope.companyIds;
}

export function scopedResource(userId: string, companyIds: string | string[]) {
  return sharedScopedResource(userId, companyIds);
}

export function scopedSearch(scope: string, fields: string[], pattern: string) {
  return sharedScopedSearch(scope, fields, pattern);
}
