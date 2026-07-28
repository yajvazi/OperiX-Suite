import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { getMe, login as apiLogin, refreshAuthToken } from '../api/client';


const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
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
  }, [loadUser]);

  useEffect(() => {
    if (!user) return undefined;
    const intervalId = window.setInterval(() => {
      refreshAuthToken().catch(() => {});
    }, 45 * 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, [user]);

  const login = async (email, password) => {
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

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  const isAdmin = user?.role === 'admin';
  const isManager = user?.role === 'manager';
  const canViewAnalytics = isAdmin || isManager;
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
