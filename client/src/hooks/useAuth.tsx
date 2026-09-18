import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api/endpoints';
import { tokenStore } from '../api/client';
import type { AuthUser, Role } from '../api/types';

interface AuthContextValue {
  user: AuthUser | null;
  ready: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  can: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!tokenStore.get()) { setReady(true); return; }
    api.auth.me()
      .then((res) => setUser(res.user))
      .catch(() => tokenStore.clear())
      .finally(() => setReady(true));
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    const result = await api.auth.login(username, password);
    tokenStore.set(result.token);
    setUser(result.user);
  }, []);

  const signOut = useCallback(async () => {
    await api.auth.logout().catch(() => undefined);
    tokenStore.clear();
    setUser(null);
  }, []);

  const can = useCallback((...roles: Role[]) => !!user && roles.includes(user.role), [user]);
  const value = useMemo(() => ({ user, ready, signIn, signOut, can }), [user, ready, signIn, signOut, can]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
