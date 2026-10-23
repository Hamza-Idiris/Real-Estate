import { describe, it, expect, vi, beforeEach } from 'vitest';
import { money, toMinor, fromMinor, fmtDateTime, label } from '../src/lib/format';
import { api, ApiError, setTokens, hasRefreshToken } from '../src/lib/api';

describe('format', () => {
  it('money is formatted from integer minor units', () => { expect(money(123456, 'USD')).toBe('$1,234.56'); expect(money(undefined)).toBe('—'); });
  it('toMinor avoids float drift', () => { expect(toMinor('19.99')).toBe(1999); expect(toMinor('0.1') + toMinor('0.2')).toBe(30); expect(fromMinor(1999)).toBe('19.99'); });
  it('dates render in the company timezone', () => {
    const iso = '2026-06-01T22:30:00Z';
    expect(fmtDateTime(iso, 'UTC')).toContain('22:30'); expect(fmtDateTime(iso, 'Africa/Mogadishu')).toContain('01:30'); // UTC+3 → next day
  });
  it('label humanises statuses', () => expect(label('waiting_for_parts')).toBe('Waiting for parts'));
});

describe('api client', () => {
  const json = (status: number, body: any) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  beforeEach(() => { setTokens(null); vi.restoreAllMocks(); });

  it('surfaces server error objects as ApiError without leaking internals', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(409, { error: { code: 'SLOT_CONFLICT', message: 'Slot taken', requestId: 'r1' } })));
    await expect(api.get('/x')).rejects.toMatchObject({ status: 409, code: 'SLOT_CONFLICT', message: 'Slot taken', requestId: 'r1' });
  });
  it('maps network failure to a friendly NETWORK error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('failed'); }));
    await expect(api.get('/x')).rejects.toMatchObject({ code: 'NETWORK' });
  });
  it('sends bearer + Idempotency-Key, and query params skip empty values', async () => {
    const f = vi.fn(async () => json(200, { data: 1 })); vi.stubGlobal('fetch', f);
    setTokens({ accessToken: 'AT', refreshToken: 'RT' });
    await api.post('/pay', { a: 1 }, { idempotencyKey: 'key-123456' });
    const [, init] = f.mock.calls[0] as any; expect(init.headers.Authorization).toBe('Bearer AT'); expect(init.headers['Idempotency-Key']).toBe('key-123456');
    await api.get('/list', { params: { q: '', page: 2, s: undefined } });
    expect(String((f.mock.calls[1] as any)[0])).toMatch(/\/list\?page=2$/);
  });
  it('on 401 it refreshes once (single flight) and retries with the new token', async () => {
    setTokens({ accessToken: 'OLD', refreshToken: 'RT1' });
    const f = vi.fn(async (url: any, init: any) => {
      const u = String(url);
      if (u.endsWith('/auth/refresh')) return json(200, { data: { accessToken: 'NEW', refreshToken: 'RT2' } });
      return init.headers.Authorization === 'Bearer NEW' ? json(200, { data: 'ok' }) : json(401, { error: { code: 'UNAUTHORIZED', message: 'x' } });
    });
    vi.stubGlobal('fetch', f);
    const [a, b] = await Promise.all([api.get('/me/a'), api.get('/me/b')]);
    expect(a.data).toBe('ok'); expect(b.data).toBe('ok');
    expect(f.mock.calls.filter((c: any) => String(c[0]).endsWith('/auth/refresh'))).toHaveLength(1);
    expect(localStorage.getItem('ef.refresh')).toBe('RT2');
  });
  it('a failed refresh clears the session', async () => {
    setTokens({ accessToken: 'OLD', refreshToken: 'RT1' });
    vi.stubGlobal('fetch', vi.fn(async (url: any) => (String(url).endsWith('/auth/refresh') ? json(401, {}) : json(401, { error: { code: 'UNAUTHORIZED', message: 'no' } }))));
    await expect(api.get('/me/a')).rejects.toBeInstanceOf(ApiError);
    expect(hasRefreshToken()).toBe(false);
  });
});
