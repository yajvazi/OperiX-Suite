import React, { createContext, useState, useEffect, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { clearLocalSupabaseSession, isStaleSupabaseSessionError, isSupabaseConfigured, onSupabaseServerChange, supabase } from '@invoice-monorepo/api';

WebBrowser.maybeCompleteAuthSession();

interface AuthContextType {
    user: User | null;
    session: Session | null;
    loading: boolean;
    isOnboarding: boolean;
    beginOnboarding: () => void;
    signUp: (email: string, password: string, options?: { data: any }) => Promise<{ error: Error | null }>;
    signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
    signInWithGoogle: () => Promise<{ error: Error | null }>;
    signInWithApple?: () => Promise<{ error: Error | null }>;
    verifyEmailOtp: (email: string, token: string) => Promise<{ error: Error | null }>;
    completeSignup: (input: {
        tenantName: string;
        firstName: string;
        lastName: string;
        phone: string;
        taxId: string;
    }) => Promise<{ companyId: string | null; error: Error | null }>;
    deleteAccount: () => Promise<{ error: Error | null }>;
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
    const [isOnboarding, setIsOnboarding] = useState(false);
    // Bumped when the app is pointed at another (self-hosted) backend, so the session below is re-read from it.
    const [serverVersion, setServerVersion] = useState(0);

    useEffect(() => onSupabaseServerChange(() => {
        setSession(null);
        setUser(null);
        setLoading(true);
        setServerVersion((version) => version + 1);
    }), []);

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
    }, [serverVersion]);

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
        if (!error) setIsOnboarding(false);
        return { error: error as Error | null };
    };

    const signInWithProvider = async (provider: 'google' | 'apple') => {
        if (!isSupabaseConfigured) return { error: missingSupabaseConfiguration() };
        try {
            // Uses the URL scheme of the app that is running, so the browser hands control back to the right app.
            const redirectTo = AuthSession.makeRedirectUri({ path: 'auth-callback' });

            const { data, error } = await supabase.auth.signInWithOAuth({
                provider,
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

            // Closing the browser without finishing is not an error.
            if (res.type !== 'success') return { error: null };

            const callbackUrl = new URL(res.url);
            const code = callbackUrl.searchParams.get('code');
            const oauthError = callbackUrl.searchParams.get('error_description') || callbackUrl.searchParams.get('error');
            if (oauthError) throw new Error(oauthError);
            if (!code) throw new Error('Sign-in did not return an authorization code.');
            const { error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
            if (sessionError) throw sessionError;
            setIsOnboarding(false);
            return { error: null };
        } catch (error) {
            console.error(`${provider} sign-in error:`, error);
            return { error: error as Error };
        }
    };

    const signInWithGoogle = () => signInWithProvider('google');
    const signInWithApple = () => signInWithProvider('apple');

    const verifyEmailOtp = async (email: string, token: string) => {
        if (!isSupabaseConfigured) return { error: missingSupabaseConfiguration() };
        const { error } = await supabase.auth.verifyOtp({
            email,
            token,
            type: 'email',
        });
        return { error: error as Error | null };
    };

    const beginOnboarding = () => {
        setIsOnboarding(true);
    };

    const completeSignup = async (input: {
        tenantName: string;
        firstName: string;
        lastName: string;
        phone: string;
        taxId: string;
    }) => {
        if (!isSupabaseConfigured) return { companyId: null, error: missingSupabaseConfiguration() };

        const { data, error } = await supabase.rpc('complete_signup_onboarding', {
            p_tenant_name: input.tenantName,
            p_first_name: input.firstName,
            p_last_name: input.lastName,
            p_phone: input.phone,
            p_tax_id: input.taxId,
        });

        if (error) return { companyId: null, error: error as Error };

        const companyId = data && typeof data === 'object' && 'id' in data ? String((data as { id: unknown }).id) : null;
        if (!companyId) return { companyId: null, error: new Error('Workspace creation did not return a company.') };

        setIsOnboarding(false);
        return { companyId, error: null };
    };

    const signOut = async () => {
        await clearLocalSupabaseSession();
        setSession(null);
        setUser(null);
        setIsOnboarding(false);
    };

    const deleteAccount = async () => {
        if (!isSupabaseConfigured) return { error: missingSupabaseConfiguration() };

        const { error } = await supabase.rpc('delete_my_account');
        if (error) return { error: error as Error };

        await clearLocalSupabaseSession();
        setSession(null);
        setUser(null);
        setIsOnboarding(false);
        return { error: null };
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                session,
                loading,
                isOnboarding,
                beginOnboarding,
                signUp,
                signIn,
                signInWithGoogle,
                signInWithApple,
                verifyEmailOtp,
                completeSignup,
                deleteAccount,
                signOut,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}
