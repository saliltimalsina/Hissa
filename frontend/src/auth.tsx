import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface AuthUser {
  user_id: number;
  email: string;
  name: string;
  token: string;
}

interface AuthCtx {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx>(null!);
const STORAGE_KEY = 'ncap_auth';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const persist = useCallback((u: AuthUser | null) => {
    setUser(u);
    if (u) localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    else localStorage.removeItem(STORAGE_KEY);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Login failed');
    }
    const data = await res.json();
    persist({ user_id: data.user_id, email: data.email, name: data.name, token: data.token });
  }, [persist]);

  const signup = useCallback(async (email: string, password: string, name: string) => {
    const res = await fetch('/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Signup failed');
    }
    const data = await res.json();
    persist({ user_id: data.user_id, email: data.email, name: data.name, token: data.token });
  }, [persist]);

  const logout = useCallback(() => {
    persist(null);
    // Clear accounts cache too
    localStorage.removeItem('ncap_accounts');
  }, [persist]);

  return <Ctx.Provider value={{ user, login, signup, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() { return useContext(Ctx); }
