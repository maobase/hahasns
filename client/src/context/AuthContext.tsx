import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import api from '../api/client';
import type { PublicUser } from '../types';

const GUEST_KEY = 'haha_guest';

export interface AuthValue {
  user: PublicUser | null;
  loading: boolean;
  authOpen: boolean;
  setAuthOpen: (open: boolean) => void;
  /** 游客只读态（localStorage）；有正式 user 时始终 false */
  isGuest: boolean;
  enterGuest: () => void;
  exitGuest: () => void;
  /** 写操作前调用：未登录则弹登录并返回 false */
  requireLogin: () => boolean;
  login: (username: string, password: string) => Promise<PublicUser>;
  register: (payload: Record<string, unknown>) => Promise<PublicUser>;
  logout: () => void;
  refresh: () => Promise<void>;
  patchUser: (partial: Partial<PublicUser>) => void;
}

const AuthContext = createContext<AuthValue | null>(null);

function readGuestFlag(): boolean {
  try { return localStorage.getItem(GUEST_KEY) === '1'; } catch { return false; }
}

export function AuthProvider({ children }: { children?: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [authOpen, setAuthOpen] = useState(false); // login/register modal
  const [guest, setGuest] = useState(readGuestFlag);

  const refresh = useCallback(async () => {
    const token = localStorage.getItem('haha_token');
    if (!token) { setLoading(false); return; }
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.user);
      try { localStorage.removeItem(GUEST_KEY); } catch { /* */ }
      setGuest(false);
    } catch {
      localStorage.removeItem('haha_token');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const enterGuest = useCallback(() => {
    try { localStorage.setItem(GUEST_KEY, '1'); } catch { /* */ }
    setGuest(true);
  }, []);

  const exitGuest = useCallback(() => {
    try { localStorage.removeItem(GUEST_KEY); } catch { /* */ }
    setGuest(false);
  }, []);

  const requireLogin = useCallback(() => {
    if (user) return true;
    setAuthOpen(true);
    return false;
  }, [user]);

  const login = async (username: string, password: string): Promise<PublicUser> => {
    const { data } = await api.post('/auth/login', { username, password });
    localStorage.setItem('haha_token', data.token);
    try { localStorage.removeItem(GUEST_KEY); } catch { /* */ }
    setGuest(false);
    setUser(data.user);
    setAuthOpen(false);
    return data.user;
  };

  const register = async (payload: Record<string, unknown>): Promise<PublicUser> => {
    const { data } = await api.post('/auth/register', payload);
    localStorage.setItem('haha_token', data.token);
    try { localStorage.removeItem(GUEST_KEY); } catch { /* */ }
    setGuest(false);
    setUser(data.user);
    setAuthOpen(false);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem('haha_token');
    try { localStorage.removeItem(GUEST_KEY); } catch { /* */ }
    setGuest(false);
    setUser(null);
  };

  // Merge partial updates from server responses (points, level, etc.)
  const patchUser = (partial: Partial<PublicUser>) => setUser((u) => (u ? { ...u, ...partial } : u));

  const isGuest = !user && guest;

  return (
    <AuthContext.Provider value={{
      user, loading, login, register, logout, refresh, patchUser,
      authOpen, setAuthOpen, isGuest, enterGuest, exitGuest, requireLogin,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = (): AuthValue => useContext(AuthContext) as AuthValue;
