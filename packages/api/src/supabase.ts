import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Expo injects these browser-safe values from the app environment in native
// builds. Keep a placeholder for local static previews, but never allow a
// production export to quietly point authentication at it.
const configuredSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || '';
const configuredSupabaseKey = (
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
    || ''
).trim();

export const isSupabaseConfigured = Boolean(
    configuredSupabaseUrl
    && configuredSupabaseKey
    && !configuredSupabaseUrl.includes('placeholder')
    && !configuredSupabaseKey.includes('placeholder')
    && configuredSupabaseKey !== 'sb_publishable_...'
);

if (process.env.NODE_ENV === 'production' && !isSupabaseConfigured) {
    throw new Error(
        'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY for the mobile production build.'
    );
}

export const supabaseUrl = configuredSupabaseUrl || 'http://127.0.0.1:54321';
const supabaseAnonKey = configuredSupabaseKey || 'sb_publishable_placeholder';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
        storage: AsyncStorage,
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
