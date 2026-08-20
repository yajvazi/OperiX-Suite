import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { getMe, login as apiLogin, refreshAuthToken } from '../api/client';
import {
  clearLocalSupabaseSession,
  isStaleSupabaseSessionError,
  supabase,
} from '../utils/supabase';


const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    if (supabase) {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        await clearLocalSupabaseSession();
        setUser(null);
        setLoading(false);
        return;
      }
      if (!data.session) {
        setLoading(false);
        return;
      }
      try {
        setUser(await getMe());
      } catch {
        await clearLocalSupabaseSession();
        setUser(null);
      } finally {
        setLoading(false);
      }
      return;
    }
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const me = await getMe();
      setUser(me);
    } catch {
      localStorage.removeItem('token');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
    if (!supabase) return undefined;
    const onAuthReset = () => {
      setUser(null);
      setLoading(false);
    };
    window.addEventListener('operix-auth-reset', onAuthReset);
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setUser(null);
        setLoading(false);
        return;
      }
      // Auth callbacks should not do a second password exchange. The API
      // resolves the same Auth subject to the legacy Desk ownership row.
      getMe().then(setUser).catch(async () => {
        await clearLocalSupabaseSession();
        setUser(null);
      });
    });
    return () => {
      window.removeEventListener('operix-auth-reset', onAuthReset);
      data.subscription.unsubscribe();
    };
  }, [loadUser]);

  useEffect(() => {
    if (!user || supabase) return undefined;
    const intervalId = window.setInterval(() => {
      refreshAuthToken().catch(() => {});
    }, 45 * 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, [user]);

  const login = async (email, password) => {
    if (supabase) {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) throw error;
      const u = await getMe();
      setUser(u);
      return { access_token: data.session?.access_token, user: u };
    }
    const { access_token, user: u } = await apiLogin(email, password);
    localStorage.setItem('token', access_token);
    setUser(u);
    return { access_token, user: u };
  };

  const refreshUser = async () => {
    const me = await getMe();
    setUser(me);
    return me;
  };

  const logout = async () => {
    await clearLocalSupabaseSession();
    setUser(null);
  };

  const hasPermission = (permission) =>
    Boolean(user?.permissions?.includes(permission));
  const isAdmin = user?.role === 'admin' || hasPermission('workspace.manage');
  const isManager =
    isAdmin || user?.role === 'manager' || hasPermission('analytics.read');
  const canViewAnalytics = isManager || hasPermission('analytics.read');
  const isEmployeeInTeam = user?.role === 'employee' && Boolean(user?.team_name);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        refreshUser,
        logout,
        isAdmin,
        isManager,
        canViewAnalytics,
        isEmployeeInTeam,
        hasPermission,
        sharedAuth: Boolean(supabase),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
