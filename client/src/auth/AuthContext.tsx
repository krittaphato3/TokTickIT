import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ApiError,
  changePassword as apiChangePassword,
  getCsrfToken,
  login as apiLogin,
  logout as apiLogout,
  me as apiMe,
  type AuthUser,
  type ChangePasswordInput,
} from '../api';

export type { AuthUser };

interface AuthState {
  user: AuthUser | null;
  csrfToken: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<AuthUser | null>;
  changePassword: (input: ChangePasswordInput) => Promise<AuthUser>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [csrfToken, setCsrf] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (): Promise<AuthUser | null> => {
    try {
      const result = await apiMe();
      setUser(result.user);
      setCsrf(result.csrfToken ?? getCsrfToken());
      return result.user;
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        setUser(null);
        setCsrf(null);
        return null;
      }
      throw e;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
      } catch {
        // Network/500 on boot: stay unauthenticated, pages surface retry.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const login = useCallback(async (email: string, password: string): Promise<AuthUser> => {
    const result = await apiLogin(email, password);
    setUser(result.user);
    setCsrf(result.csrfToken ?? getCsrfToken());
    return result.user;
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await apiLogout();
    } finally {
      setUser(null);
      setCsrf(null);
    }
  }, []);

  const changePassword = useCallback(async (input: ChangePasswordInput): Promise<AuthUser> => {
    const result = await apiChangePassword(input);
    setUser(result.user);
    return result.user;
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, csrfToken, loading, login, logout, refresh, changePassword }),
    [user, csrfToken, loading, login, logout, refresh, changePassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function roleHome(role: AuthUser['role']): string {
  if (role === 'IT_STAFF') return '#/staff/queue';
  if (role === 'ADMIN' || role === 'ADMINISTRATOR') return '#/admin/users';
  return '#/my';
}
