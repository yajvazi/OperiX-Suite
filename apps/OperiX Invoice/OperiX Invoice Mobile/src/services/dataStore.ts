import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import { supabase } from '@invoice-monorepo/api';
import { LocalDataStore, type DocumentStore, type StorageMode } from '@invoice-monorepo/data-store';
import { CloudDataStore } from '@invoice-monorepo/data-store/cloud';
import { createExpoSqliteDriver } from '@invoice-monorepo/data-store/drivers/expo-sqlite';
import { getWorkspaceScope } from './workspace';

const STORAGE_MODE_KEY = 'operix.storageMode';
const LOCAL_DATABASE_NAME = 'operix-local.db';

/** Existing accounts keep using the cloud until they choose otherwise. */
export async function getStorageMode(): Promise<StorageMode> {
    try {
        return (await AsyncStorage.getItem(STORAGE_MODE_KEY)) === 'local' ? 'local' : 'cloud';
    } catch {
        return 'cloud';
    }
}

export async function setStorageMode(mode: StorageMode): Promise<void> {
    await AsyncStorage.setItem(STORAGE_MODE_KEY, mode);
}

let localStore: Promise<LocalDataStore> | null = null;

/** The on-device store (one database per install). */
export function getLocalStore(): Promise<LocalDataStore> {
    if (!localStore) {
        localStore = SQLite.openDatabaseAsync(LOCAL_DATABASE_NAME)
            .then((database) => LocalDataStore.open(createExpoSqliteDriver(database), {
            newId: () => Crypto.randomUUID(),
            getRandomValues: (bytes) => Crypto.getRandomValues(bytes),
            sha256Hex: (value) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value),
        }))
            .catch((error) => { localStore = null; throw error; });
    }
    return localStore;
}

/**
 * The store the screens should use for the signed-in user: the device database in local mode,
 * the OperiX cloud otherwise. Cloud behaviour is unchanged from before this layer existed.
 */
export async function getDataStore(userId: string): Promise<DocumentStore> {
    if (await getStorageMode() === 'local') return getLocalStore();
    const scope = await getWorkspaceScope(userId);
    return new CloudDataStore(supabase, { userId, companyId: scope.company?.id ?? null, companyIds: scope.companyIds });
}
