import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchServerConfig, setSupabaseServer, type ServerConfig } from '@invoice-monorepo/api';

const STORAGE_KEY = 'operix.selfHostedServer.v1';

let current: ServerConfig | null = null;

export const getConnectedServer = () => current;

/** Restores the self-hosted server chosen earlier. Call once before the first screen renders. */
export async function restoreServerConnection(): Promise<ServerConfig | null> {
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const saved = raw ? JSON.parse(raw) as ServerConfig : null;
        if (saved?.supabaseUrl && saved.supabaseKey) {
            current = saved;
            setSupabaseServer({ url: saved.supabaseUrl, key: saved.supabaseKey });
        }
    } catch {
        current = null;
    }
    return current;
}

/** Looks the server up without switching to it, so the user can confirm first. */
export const lookUpServer = (address: string) => fetchServerConfig(address);

/** Switches the whole app to the given self-hosted server and remembers it. */
export async function connectToServer(config: ServerConfig) {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    current = config;
    setSupabaseServer({ url: config.supabaseUrl, key: config.supabaseKey });
}

/** Goes back to the OperiX cloud service. */
export async function disconnectServer() {
    await AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
    current = null;
    setSupabaseServer(null);
}
