import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Native app workspaces declare AsyncStorage directly. Keeping it out of this
// shared package's dependency graph prevents server-only consumers (including
// the public API) from installing the React Native/Metro toolchain.
// Expo injects these browser-safe values in native builds. Next injects the
// equivalent NEXT_PUBLIC values in Web builds. Keep this shared client
// constructible during SSR/static generation; the native app config performs
// the hard production-environment validation before an Expo build starts.
const configuredSupabaseUrl = (
    process.env.EXPO_PUBLIC_SUPABASE_URL
    || process.env.NEXT_PUBLIC_SUPABASE_URL
    || ''
).trim();
const configuredSupabaseKey = (
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || ''
).trim();

export const isSupabaseConfigured = Boolean(
    configuredSupabaseUrl
    && configuredSupabaseKey
    && !configuredSupabaseUrl.includes('placeholder')
    && !configuredSupabaseKey.includes('placeholder')
    && configuredSupabaseKey !== 'sb_publishable_...'
);

const defaultSupabaseUrl = configuredSupabaseUrl || 'http://127.0.0.1:54321';
const defaultSupabaseKey = configuredSupabaseKey || 'sb_publishable_placeholder';
// The shared API package is imported by server-rendered Web routes as well as
// the native app. AsyncStorage touches `window` while Supabase initializes, so
// leave storage unset during SSR and let Supabase use its in-memory adapter.
const authStorage = typeof window === 'undefined' ? undefined : AsyncStorage;

function buildClient(url: string, key: string) {
    return createClient(url, key, {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: false,
            flowType: 'pkce',
            ...(authStorage ? { storage: authStorage } : {}),
        },
    });
}

let activeUrl = defaultSupabaseUrl;
let activeClient = buildClient(defaultSupabaseUrl, defaultSupabaseKey);
const serverListeners = new Set<() => void>();

/** Address of the backend currently in use (the hosted one unless a self-hosted server was chosen). */
export const getSupabaseUrl = () => activeUrl;
export const supabaseUrl = defaultSupabaseUrl;

/**
 * The shared client. It forwards to whichever backend is active, so the mobile
 * app can switch to a self-hosted server at runtime without every caller
 * having to re-import a new client.
 */
export const supabase: typeof activeClient = new Proxy({} as typeof activeClient, {
    get(_target, property) {
        const value = Reflect.get(activeClient, property, activeClient);
        return typeof value === 'function' ? value.bind(activeClient) : value;
    },
});

/** Points the app at another backend (self-hosted) or back to the hosted one (no arguments). */
export function setSupabaseServer(server?: { url: string; key: string } | null) {
    const url = server?.url || defaultSupabaseUrl;
    const key = server?.key || defaultSupabaseKey;
    if (url === activeUrl && !server) return;
    void activeClient.auth.stopAutoRefresh?.();
    activeClient = buildClient(url, key);
    activeUrl = url;
    serverListeners.forEach((listener) => listener());
}

/** Called after the active backend changed; returns an unsubscribe function. */
export function onSupabaseServerChange(listener: () => void) {
    serverListeners.add(listener);
    return () => { serverListeners.delete(listener); };
}

type SupabaseAuthErrorLike = {
    code?: unknown;
    status?: unknown;
    message?: unknown;
};

/** True when Supabase can no longer refresh the locally persisted session. */
export function isStaleSupabaseSessionError(error: unknown): boolean {
    const candidate = (error as { error?: SupabaseAuthErrorLike } | null)?.error || error;
    const authError = candidate as SupabaseAuthErrorLike | null;
    const code = String(authError?.code ?? '').toLowerCase();
    const message = String(authError?.message ?? '').toLowerCase();
    const status = Number(authError?.status ?? 0);

    return code === 'refresh_token_not_found'
        || code === 'refresh_token_already_used'
        || code === 'invalid_refresh_token'
        || code === 'refresh_token_expired'
        || code === 'user_not_found'
        || message.includes('refresh token')
        || message.includes('user from sub claim')
        || message.includes('user not found')
        || message.includes('invalid jwt')
        || status === 401
        || (status === 400 && code === 'invalid_grant');
}

/** Remove only the local session so a dead refresh token cannot be retried. */
export async function clearLocalSupabaseSession(): Promise<void> {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
}
