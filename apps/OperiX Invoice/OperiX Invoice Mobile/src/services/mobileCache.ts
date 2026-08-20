import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = 'operix.invoice.mobile.cache.v1:';
const memoryCache = new Map<string, unknown>();

function storageKey(key: string) {
    return `${CACHE_PREFIX}${key}`;
}

export function mobileCacheKey(resource: string, userId: string, companyIds: readonly string[], variant = '') {
    const scope = [...companyIds].sort().join(',');
    return `${resource}:${userId}:${scope}:${variant}`;
}

export async function readMobileCache<T>(key: string): Promise<T | null> {
    if (memoryCache.has(key)) return memoryCache.get(key) as T;

    try {
        const stored = await AsyncStorage.getItem(storageKey(key));
        if (!stored) return null;
        const value = JSON.parse(stored) as T;
        memoryCache.set(key, value);
        return value;
    } catch (error) {
        console.warn('Unable to read mobile cache:', error);
        return null;
    }
}

export function writeMobileCache<T>(key: string, value: T) {
    memoryCache.set(key, value);
    void AsyncStorage.setItem(storageKey(key), JSON.stringify(value)).catch((error) => {
        console.warn('Unable to write mobile cache:', error);
    });
}

export function invalidateMobileCache(resource: string) {
    for (const key of memoryCache.keys()) {
        if (key.startsWith(`${resource}:`)) memoryCache.delete(key);
    }
}
