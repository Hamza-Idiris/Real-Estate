/**
 * Route inventory: walks the real Express router tree and fails if a route is added that is
 * (a) unexpectedly public, (b) a company route without membership context + permission gate,
 * (c) an admin route without the platform-admin guard, or (d) takes an :id param without validation.
 * Needs no database.
 */
import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app';
import { companyCtx, requireAuth, requirePlatformAdmin } from '../src/middleware/auth';

type R = { method: string; path: string; chain: any[] };
function mountPath(layer: any): string {
  let i = 0; const keys = layer.keys ?? [];
  return layer.regexp.source
    .replace(/\(\?:\\\/\(\[\^\/\]\+\?\)\)/g, () => `/:${keys[i++]?.name}`) // Express 4 encodes ":param" as (?:\/([^/]+?))
    .replace('\\/?(?=\\/|$)', '').replace(/\\\//g, '/').replace(/^\^/, '').replace(/\$$/, '');
}
function walk(stack: any[], prefix: string, inherited: any[], out: R[]) {
  const local: any[] = [];
  for (const l of stack) {
    if (l.route) {
      for (const m of Object.keys(l.route.methods)) out.push({ method: m.toUpperCase(), path: prefix + (l.route.path === '/' ? '' : l.route.path), chain: [...inherited, ...local, ...l.route.stack.map((x: any) => x.handle)] });
    } else if (l.name === 'router' && l.handle?.stack) {
      walk(l.handle.stack, prefix + mountPath(l), [...inherited, ...local], out);
    } else local.push(l.handle);
  }
}
const app: any = buildApp();
const routes: R[] = []; walk(app._router.stack, '', [], routes);
const api = routes.filter((r) => r.path.startsWith('/api/v1'));
const label = (r: R) => `${r.method} ${r.path}`;

describe('route inventory (security)', () => {
  it('found a realistic number of routes (walker sanity)', () => expect(api.length).toBeGreaterThan(100));

  it('the ONLY unauthenticated API routes are the intended public ones', () => {
    const open = api.filter((r) => !r.chain.includes(requireAuth)).map(label).sort();
    expect(open).toEqual([
      'GET /api/v1/files/:name', 'GET /api/v1/meta', 'GET /api/v1/public/properties', 'GET /api/v1/public/properties/:idOrRef',
      'GET /api/v1/public/properties/:idOrRef/similar', 'GET /api/v1/public/properties/facets',
      'POST /api/v1/auth/forgot-password', 'POST /api/v1/auth/login', 'POST /api/v1/auth/logout', 'POST /api/v1/auth/refresh', 'POST /api/v1/auth/register', 'POST /api/v1/auth/reset-password',
    ].sort());
  });

  it('every company-scoped route resolves membership (companyCtx) and is permission-gated', () => {
    const co = api.filter((r) => r.path.startsWith('/api/v1/companies/:companyId'));
    expect(co.length).toBeGreaterThan(50);
    const noCtx = co.filter((r) => !r.chain.includes(companyCtx)).map(label);
    expect(noCtx).toEqual([]);
    // Deliberate exceptions: company home (any member), branch list (any member), assignable directory (inline multi-permission check)
    const allowNoPerm = new Set(['GET /api/v1/companies/:companyId', 'GET /api/v1/companies/:companyId/branches', 'GET /api/v1/companies/:companyId/staff/assignable']);
    const ungated = co.filter((r) => !r.chain.some((h: any) => Array.isArray(h?.perms)) && !allowNoPerm.has(label(r))).map(label);
    expect(ungated).toEqual([]);
  });

  it('mutating company routes always require at least one permission', () => {
    const bad = api.filter((r) => r.path.startsWith('/api/v1/companies/:companyId') && r.method !== 'GET' && !r.chain.some((h: any) => h?.perms?.length)).map(label);
    expect(bad).toEqual([]);
  });

  it('every admin route requires platform-admin', () => {
    const admin = api.filter((r) => r.path.startsWith('/api/v1/admin'));
    expect(admin.length).toBeGreaterThan(5);
    expect(admin.filter((r) => !r.chain.includes(requirePlatformAdmin)).map(label)).toEqual([]);
  });

  it('routes with an :id style path param validate it (no raw ids reach the database)', () => {
    const allow = new Set(['GET /api/v1/files/:name']); // validated by strict regex + HMAC in handler
    const bad = api.filter((r) => /:(?!companyId)\w+/.test(r.path.replace('/api/v1', '')) && !allow.has(label(r)) && !r.chain.some((h: any) => h?.isValidator?.params)).map(label);
    expect(bad).toEqual([]);
  });

  it('company id in the URL is validated before it is used', () => {
    const co = api.filter((r) => r.path.startsWith('/api/v1/companies/:companyId'));
    expect(co.filter((r) => !r.chain.some((h: any) => h?.isValidator?.params)).map(label)).toEqual([]);
  });

  it('all body-accepting routes parse bodies through a validator or are body-less actions', () => {
    const bodyful = api.filter((r) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method));
    // upload endpoints read multipart (checked by magic bytes); everything else must have a body validator unless it takes no body.
    const NO_BODY = /\/(publish|unpublish|archive|submit|withdraw|accept|read-all|read|company-accept|logout)$|\/(read)$|complete|upload|\/media$|\/documents$|\/attachments$|\/receipt$|\/data-export$/;
    const missing = bodyful.filter((r) => !r.chain.some((h: any) => h?.isValidator?.body) && !NO_BODY.test(r.path)).map(label);
    // Remaining items are body-less state transitions taking only an :id; list them explicitly so a new one is a conscious decision.
    expect(missing.sort()).toEqual([
      'POST /api/v1/companies/:companyId/tenancies/:id/company-accept',
      'POST /api/v1/me/tenancies/:id/accept',
      'POST /api/v1/me/applications/:id/withdraw',
    ].filter((x) => missing.includes(x)).sort());
  });
});
