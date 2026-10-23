import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, hasRefreshToken, refreshSession, setSessionLostHandler, setTokens } from './api';

export type Membership = { companyId: string; company: { _id: string; name: string; timezone: string; currency: string }; role: string; scope: string; permissions: string[] };
type User = { id: string; email: string; name: string; phone?: string; platformRole: string };
type Ctx = {
  user: User | null; loading: boolean; memberships: Membership[]; active: Membership | null;
  can: (p: string) => boolean; isAdmin: boolean; tz: string;
  setActive: (id: string) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (i: { email: string; password: string; name: string; phone?: string }) => Promise<void>;
  logout: () => Promise<void>; reload: () => Promise<void>;
};
const AuthCtx = createContext<Ctx>(null as any);
export const useAuth = () => useContext(AuthCtx);
const ACTIVE_KEY = 'ef.company';

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [activeId, setActiveId] = useState<string | null>(localStorage.getItem(ACTIVE_KEY));
  const [loading, setLoading] = useState(hasRefreshToken());

  const load = useCallback(async () => {
    const [u, m] = await Promise.all([api.get('/me/profile'), api.get('/me/companies')]);
    setUser(u.data); setMemberships(m.data);
  }, []);
  const clear = useCallback(() => { setTokens(null); setUser(null); setMemberships([]); qc.clear(); }, [qc]);

  useEffect(() => {
    setSessionLostHandler(clear);
    (async () => {
      if (hasRefreshToken() && (await refreshSession())) { try { await load(); } catch { clear(); } }
      setLoading(false);
    })();
  }, [load, clear]);

  const finish = async (d: any) => { setTokens(d); setUser(d.user); await load(); };
  const value = useMemo<Ctx>(() => {
    const active = memberships.find((m) => m.companyId === activeId) ?? memberships[0] ?? null;
    return {
      user, loading, memberships, active, tz: active?.company.timezone ?? 'UTC',
      isAdmin: user?.platformRole === 'super_admin',
      can: (p) => !!active?.permissions.includes(p),
      setActive: (id) => { localStorage.setItem(ACTIVE_KEY, id); setActiveId(id); qc.invalidateQueries(); },
      login: async (email, password) => finish((await api.post('/auth/login', { email, password }, { auth: false })).data),
      register: async (i) => finish((await api.post('/auth/register', i, { auth: false })).data),
      logout: async () => { const rt = localStorage.getItem('ef.refresh'); try { if (rt) await api.post('/auth/logout', { refreshToken: rt }); } catch { /* ignore */ } clear(); },
      reload: load,
    };
  }, [user, loading, memberships, activeId, qc, load, clear]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
