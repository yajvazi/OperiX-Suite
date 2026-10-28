import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import { LocalDataStore } from '@invoice-monorepo/data-store';
import { createExpoSqliteDriver } from '@invoice-monorepo/data-store/drivers/expo-sqlite';

const LOCAL_DATABASE_NAME = 'operix-local.db';

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
