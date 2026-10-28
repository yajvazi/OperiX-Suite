import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StorageMode } from '@invoice-monorepo/data-store';

const STORAGE_MODE_KEY = 'operix.storageMode';

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
