import { getLocalStore } from './localStore';
import { getStorageMode } from './storageMode';
import type { LocalDataStore } from '@invoice-monorepo/data-store';

/** The on-device store when the app is in local mode, otherwise null (the screen keeps using the cloud). */
export async function activeLocalStore(): Promise<LocalDataStore | null> {
    return (await getStorageMode()) === 'local' ? getLocalStore() : null;
}
