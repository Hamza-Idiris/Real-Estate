import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { api, errMsg } from './api';
import { useAuth } from './auth';
import { useToast } from '@/components/ui';

/** GET with request cancellation (signal) and stable cache keys. */
export function useApi<T = any>(path: string | null, params?: Record<string, any>, opts: { keepPrevious?: boolean; enabled?: boolean; refetchInterval?: number } = {}) {
  return useQuery<any>({
    queryKey: [path, params ?? {}], enabled: !!path && (opts.enabled ?? true),
    queryFn: ({ signal }) => api.get<T>(path!, { params, signal }),
    placeholderData: opts.keepPrevious ? keepPreviousData : undefined, refetchInterval: opts.refetchInterval,
  });
}
/** Company-scoped path helper; queries are only enabled once an active company exists. */
export function useCo() {
  const { active } = useAuth();
  const base = active ? `/companies/${active.companyId}` : null;
  return { base, companyId: active?.companyId, path: (p: string) => (base ? `${base}${p}` : null) };
}
/** Runs a mutation with toast feedback and cache invalidation. Returns true on success. */
export function useAct() {
  const qc = useQueryClient(); const toast = useToast(); const [busy, setBusy] = useState(false);
  const act = useCallback(async <T,>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
    setBusy(true);
    try { const r = await fn(); if (success) toast.success(success); await qc.invalidateQueries(); return r; }
    catch (e) { toast.error(errMsg(e)); return undefined; }
    finally { setBusy(false); }
  }, [qc, toast]);
  return { act, busy };
}
export function useDebounced<T>(v: T, ms = 350) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}
