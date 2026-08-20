import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

// The Desk copy can still render its public auth screens when the shared
// environment is not configured. Production uses the same Supabase Auth
// project as the other OperiX Suite applications.
export const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
        },
      })
    : null;

export function isStaleSupabaseSessionError(error) {
  const candidate = error?.error || error;
  const code = String(candidate?.code || '').toLowerCase();
  const message = String(candidate?.message || '').toLowerCase();
  const status = Number(candidate?.status || 0);
  return code === 'refresh_token_not_found'
    || code === 'refresh_token_already_used'
    || code === 'invalid_refresh_token'
    || code === 'refresh_token_expired'
    || message.includes('refresh token')
    || (status === 400 && code === 'invalid_grant');
}

export async function clearLocalSupabaseSession() {
  if (supabase) await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  localStorage.removeItem('token');
  window.dispatchEvent(new Event('operix-auth-reset'));
}

export const hasSharedAuth = Boolean(supabase);
