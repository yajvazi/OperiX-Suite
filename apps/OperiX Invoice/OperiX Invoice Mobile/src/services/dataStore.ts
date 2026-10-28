import { supabase } from '@invoice-monorepo/api';
import type { DocumentStore } from '@invoice-monorepo/data-store';
import { CloudDataStore } from '@invoice-monorepo/data-store/cloud';
import { getWorkspaceScope } from './workspace';
import { getLocalStore } from './localStore';
import { getStorageMode } from './storageMode';

export { getStorageMode, setStorageMode } from './storageMode';
export { getLocalStore } from './localStore';

/**
 * The store the screens should use for the signed-in user: the device database in local mode,
 * the OperiX cloud otherwise. Cloud behaviour is unchanged from before this layer existed.
 */
export async function getDataStore(userId: string): Promise<DocumentStore> {
    if (await getStorageMode() === 'local') return getLocalStore();
    return getCloudStore(userId);
}

/** The cloud store regardless of the chosen mode, for copying data between the device and the cloud. */
export async function getCloudStore(userId: string): Promise<DocumentStore> {
    const scope = await getWorkspaceScope(userId, { forceCloud: true });
    return new CloudDataStore(supabase, { userId, companyId: scope.company?.id ?? null, companyIds: scope.companyIds });
}
