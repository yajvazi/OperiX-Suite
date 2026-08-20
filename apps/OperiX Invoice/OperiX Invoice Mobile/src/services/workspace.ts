import { supabase } from '@invoice-monorepo/api';
import {
  resolveWorkspace,
  scopedResource as sharedScopedResource,
  scopedSearch as sharedScopedSearch,
  type WorkspaceScope as SharedWorkspaceScope,
} from '@invoice-monorepo/api/workspace';
import type { Company, Profile } from '@invoice-monorepo/types';

export type WorkspaceCompany = Pick<Company, 'id' | 'company_name' | 'parent_company_id'> &
    Partial<Pick<Company, 'currency'>>;
export interface WorkspaceScope extends Omit<SharedWorkspaceScope, 'profile' | 'company'> {
    profile: Profile;
    company: WorkspaceCompany | null;
}

const WORKSPACE_CACHE_TTL_MS = 60_000;
const workspaceCache = new Map<string, { scope: WorkspaceScope; expiresAt: number }>();

export async function getWorkspaceScope(userId: string): Promise<WorkspaceScope> {
    const cached = workspaceCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.scope;

    const scope = await resolveWorkspace(supabase, userId);
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
