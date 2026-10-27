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

export const supabaseUrl = configuredSupabaseUrl || 'http://127.0.0.1:54321';
const supabaseAnonKey = configuredSupabaseKey || 'sb_publishable_placeholder';
// The shared API package is imported by server-rendered Web routes as well as
// the native app. AsyncStorage touches `window` while Supabase initializes, so
// leave storage unset during SSR and let Supabase use its in-memory adapter.
const authStorage = typeof window === 'undefined' ? undefined : AsyncStorage;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
        ...(authStorage ? { storage: authStorage } : {}),
    },
});

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
