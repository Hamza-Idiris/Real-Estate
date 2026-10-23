import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/app';
describe('HTTP smoke (no DB)', () => {
  const api = request(buildApp());
  it('health ok, ready degraded without db', async () => {
    expect((await api.get('/health')).body.status).toBe('ok');
    expect((await api.get('/health/ready')).status).toBe(503);
  });
  it('meta states mock + in-app only', async () => {
    const r = await api.get('/api/v1/meta'); expect(r.status).toBe(200); expect(r.body.data.paymentEnvironment).toBe('MOCK');
  });
  it('protected routes need auth; bad tokens rejected; unknown routes 404 JSON', async () => {
    expect((await api.get('/api/v1/me/invoices')).status).toBe(401);
    expect((await api.get('/api/v1/companies/507f1f77bcf86cd799439011/properties')).status).toBe(401);
    expect((await api.get('/api/v1/admin/stats').set('Authorization', 'Bearer abc.def.ghi')).status).toBe(401);
    const n = await api.get('/nope'); expect(n.status).toBe(404); expect(n.body.error.code).toBe('NOT_FOUND');
  });
  it('validation runs before the DB: bad body/query -> 400 with details, no stack leak', async () => {
    const r = await api.post('/api/v1/auth/register').send({ email: 'bad', password: 'x', name: 'A', role: 'owner' });
    expect(r.status).toBe(400); expect(r.body.error.code).toBe('VALIDATION_ERROR'); expect(JSON.stringify(r.body)).not.toMatch(/at .*\.ts|node_modules/);
    expect((await api.post('/api/v1/auth/login').send({ email: { $gt: '' }, password: 'x' })).status).toBe(400);
    expect((await api.get('/api/v1/public/properties?minPrice[$gt]=1')).status).toBe(400);
    expect((await api.post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{bad')).status).toBe(400);
  });
  it('CORS allowlist: unknown origin gets no ACAO header', async () => {
    const r = await api.get('/health').set('Origin', 'https://evil.example'); expect(r.headers['access-control-allow-origin']).toBeUndefined();
    const ok = await api.get('/health').set('Origin', 'http://localhost:5173'); expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(ok.headers['x-content-type-options']).toBe('nosniff');
  });
  it('private file links reject unsigned/forged requests', async () => {
    expect((await api.get('/api/v1/files/' + 'a'.repeat(32) + '.pdf')).status).toBe(404);
    expect((await api.get('/api/v1/files/..%2F..%2Fetc%2Fpasswd')).status).toBe(404);
  });
});
