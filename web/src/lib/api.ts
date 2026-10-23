const BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const V1 = `${BASE}/api/v1`;
const RT_KEY = 'ef.refresh';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: any, public requestId?: string) { super(message); }
}

// Access token lives in memory only. Refresh token is in localStorage (the API issues bearer refresh tokens);
// see README "Security notes" for the httpOnly-cookie hardening path.
let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onSessionLost: (() => void) | null = null;
export const setSessionLostHandler = (fn: () => void) => { onSessionLost = fn; };
export const hasRefreshToken = () => !!localStorage.getItem(RT_KEY);
export function setTokens(t: { accessToken: string; refreshToken: string } | null) {
  accessToken = t?.accessToken ?? null;
  if (t) localStorage.setItem(RT_KEY, t.refreshToken); else localStorage.removeItem(RT_KEY);
}

async function doRefresh(): Promise<boolean> {
  const rt = localStorage.getItem(RT_KEY);
  if (!rt) return false;
  try {
    const r = await fetch(`${V1}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: rt }) });
    if (!r.ok) { setTokens(null); return false; }
    setTokens((await r.json()).data);
    return true;
  } catch { return false; }
}
export const refreshSession = () => (refreshing ??= doRefresh().finally(() => { refreshing = null; }));

export type Req = { params?: Record<string, any>; body?: any; form?: FormData; idempotencyKey?: string; signal?: AbortSignal; auth?: boolean; raw?: boolean };

export async function request<T = any>(method: string, path: string, o: Req = {}, retried = false): Promise<T> {
  const url = new URL(`${V1}${path}`);
  Object.entries(o.params ?? {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v)); });
  const headers: Record<string, string> = {};
  if (o.body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken && o.auth !== false) headers.Authorization = `Bearer ${accessToken}`;
  if (o.idempotencyKey) headers['Idempotency-Key'] = o.idempotencyKey;
  // timeout + caller cancellation (react-query passes a signal for obsolete queries)
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  o.signal?.addEventListener('abort', () => ctrl.abort());
  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: o.form ?? (o.body !== undefined ? JSON.stringify(o.body) : undefined), signal: ctrl.signal });
  } catch (e: any) {
    if (o.signal?.aborted) throw e;
    throw new ApiError(0, 'NETWORK', e?.name === 'AbortError' ? 'The request timed out. Check your connection and retry.' : 'Cannot reach the server. Check your connection and retry.');
  } finally { clearTimeout(timer); }

  if (res.status === 401 && !retried && o.auth !== false && hasRefreshToken()) {
    if (await refreshSession()) return request<T>(method, path, o, true);
    onSessionLost?.();
  }
  if (o.raw) { if (!res.ok) throw new ApiError(res.status, 'ERROR', 'Request failed'); return (await res.blob()) as any; }
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) { const e = json?.error ?? {}; throw new ApiError(res.status, e.code ?? 'ERROR', e.message ?? 'Something went wrong', e.details, e.requestId); }
  return json as T;
}
export const api = {
  get: <T = any>(p: string, o?: Req) => request<T>('GET', p, o),
  post: <T = any>(p: string, body?: any, o?: Req) => request<T>('POST', p, { ...o, body: body ?? {} }),
  patch: <T = any>(p: string, body?: any, o?: Req) => request<T>('PATCH', p, { ...o, body }),
  put: <T = any>(p: string, body?: any, o?: Req) => request<T>('PUT', p, { ...o, body }),
  del: <T = any>(p: string, body?: any, o?: Req) => request<T>('DELETE', p, { ...o, body }),
  upload: <T = any>(p: string, file: File, fields: Record<string, string> = {}) => {
    const f = new FormData(); Object.entries(fields).forEach(([k, v]) => f.append(k, v)); f.append('file', file);
    return request<T>('POST', p, { form: f });
  },
};
export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
export const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong');
