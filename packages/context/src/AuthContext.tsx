import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { clearLocalSupabaseSession, isStaleSupabaseSessionError, isSupabaseConfigured, supabase } from '@invoice-monorepo/api';

WebBrowser.maybeCompleteAuthSession();

interface AuthContextType {
    user: User | null;
    session: Session | null;
    loading: boolean;
    signUp: (email: string, password: string, options?: { data: any }) => Promise<{ error: Error | null }>;
    signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
    signInWithGoogle: () => Promise<{ error: Error | null }>;
    verifyEmailOtp: (email: string, token: string) => Promise<{ error: Error | null }>;
    signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

const missingSupabaseConfiguration = () => new Error(
    'Mobile authentication is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY before launching this app.'
);

interface AuthProviderProps {
    children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;

        if (!isSupabaseConfigured) {
            setLoading(false);
            return () => {
                mounted = false;
            };
        }

        const resetToCleanLogin = async () => {
            await clearLocalSupabaseSession();
            if (!mounted) return;
            setSession(null);
            setUser(null);
            setLoading(false);
        };

        // Resolve the persisted session once. Any auth error means the local
        // token is not trustworthy and must not be retried on the next call.
        void supabase.auth.getSession().then(async ({ data: { session }, error }) => {
            if (error || isStaleSupabaseSessionError(error)) {
                await resetToCleanLogin();
                return;
            }

            // getSession() can return a cached JWT even after its user has
            // been deleted from Supabase Auth. Verify the user server-side so
            // a deleted account cannot keep the app on a dead workspace.
            if (session) {
                const { data: { user: verifiedUser }, error: userError } = await supabase.auth.getUser();
                if (userError && isStaleSupabaseSessionError(userError)) {
                    await resetToCleanLogin();
                    return;
                }
                if (!verifiedUser && !userError) {
                    await resetToCleanLogin();
                    return;
                }
            }

            if (!mounted) return;
            setSession(session);
            setUser((currentUser) => {
                const nextUser = session?.user ?? null;
                return currentUser?.id && currentUser.id === nextUser?.id ? currentUser : nextUser;
            });
            setLoading(false);
        }).catch(() => resetToCleanLogin());

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, session) => {
                if (!session) {
                    if (!mounted) return;
                    setSession(null);
                    setUser(null);
                    setLoading(false);
                    return;
                }
                if (!mounted) return;
                setSession(session);
                setUser((currentUser) => currentUser?.id === session.user.id ? currentUser : session.user);
                setLoading(false);
            }
        );

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, []);

    const signUp = async (email: string, password: string, options?: {
        data: {
            first_name: string;
            last_name: string;
            phone: string;
            company_name: string;
            tax_id: string; // company registered number
        }
    }) => {
        if (!isSupabaseConfigured) return { error: missingSupabaseConfiguration() };
        const { error } = await supabase.auth.signUp({
            email,
            password,
            options,
        });
        return { error: error as Error | null };
    };

    const signIn = async (email: string, password: string) => {
        if (!isSupabaseConfigured) return { error: missingSupabaseConfiguration() };
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        return { error: error as Error | null };
    };

    const signInWithGoogle = async () => {
        if (!isSupabaseConfigured) return { error: missingSupabaseConfiguration() };
        try {
            const redirectTo = AuthSession.makeRedirectUri({ scheme: 'operixbooking' });
            console.log('Redirecting to:', redirectTo);

            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo,
                    skipBrowserRedirect: true,
                },
            });

            if (error) throw error;

            const res = await WebBrowser.openAuthSessionAsync(
                data?.url ?? '',
                redirectTo
            );

            if (res.type === 'success') {
                const { url } = res;
                const callbackUrl = new URL(url);
                const code = callbackUrl.searchParams.get('code');
                const oauthError = callbackUrl.searchParams.get('error_description') || callbackUrl.searchParams.get('error');
                if (oauthError) throw new Error(oauthError);
                if (!code) throw new Error('Google sign-in did not return an authorization code.');
                const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
                if (sessionError) throw sessionError;
            }
            return { error: null };
        } catch (error) {
            console.error('Google Sign-In Error:', error);
            return { error: error as Error };
        }
    };

    const verifyEmailOtp = async (email: string, token: string) => {
        if (!isSupabaseConfigured) return { error: missingSupabaseConfiguration() };
        const { error } = await supabase.auth.verifyOtp({
            email,
            token,
            type: 'signup',
        });
        return { error: error as Error | null };
    };

    const signOut = async () => {
        await clearLocalSupabaseSession();
        setSession(null);
        setUser(null);
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                session,
                loading,
                signUp,
                signIn,
                signInWithGoogle,
                verifyEmailOtp,
                signOut,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}
