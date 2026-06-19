import { useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { api, UNAUTHORIZED_EVENT } from '../lib/api';
import { AuthContext } from './useAuth';
import type { AuthUser } from './useAuth';

// Re-export so existing `import { useAuth } from '../auth/useAuth'` works, and
// AuthUser stays importable from a single place if needed.
export type { AuthUser } from './useAuth';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api<AuthUser>('/api/auth/me');
      setUser(me);
    } catch {
      setUser(null);
    }
  }, []);

  // Bootstrap session on mount.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const me = await api<AuthUser>('/api/auth/me');
        if (active) setUser(me);
      } catch {
        if (active) setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  // Any 401 anywhere logs the user out.
  useEffect(() => {
    function onUnauthorized() {
      setUser(null);
    }
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const u = await api<AuthUser>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    setUser(u);
  }, []);

  const signup = useCallback(async (email: string, password: string, name?: string) => {
    const u = await api<AuthUser>('/api/auth/signup', {
      method: 'POST',
      body: name ? { email, password, name } : { email, password },
    });
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      /* clear locally regardless */
    }
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}
