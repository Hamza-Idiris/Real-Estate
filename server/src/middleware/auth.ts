import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env';
import { User } from '../modules/auth/model';
import { Company, Membership } from '../modules/companies/model';
import { effectivePermissions, Permission } from '../domain/permissions';
import { forbidden, notFound, unauthorized } from '../utils/errors';
import { ah, objectId, oid } from '../utils/http';
import { audit } from '../modules/audit/service';

export const requireAuth = ah(async (req, _res, next) => {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) throw unauthorized();
  let payload: any;
  try {
    payload = jwt.verify(h.slice(7), env.JWT_ACCESS_SECRET, { algorithms: ['HS256'], issuer: 'estateflow' });
  } catch {
    throw unauthorized('Invalid or expired token');
  }
  const user: any = await User.findById(payload.sub).select('email name status platformRole').lean();
  if (!user || user.status !== 'active') throw unauthorized();
  req.user = { id: String(user._id), email: user.email, name: user.name, platformRole: user.platformRole };
  next();
});

export const requirePlatformAdmin = (req: any, _res: any, next: any) =>
  req.user?.platformRole === 'super_admin' ? next() : next(forbidden('Platform administrator access required'));

export const companyParams = z.object({ companyId: objectId }).passthrough();

/**
 * Resolves the company from the URL and the caller's ACTIVE membership in it.
 * The company id from the client is never proof of authorization — membership is. Non-members get 404
 * so company existence is not revealed.
 */
export const companyCtx = ah(async (req, _res, next) => {
  const companyId = oid(req.params.companyId);
  const [company, member]: any[] = await Promise.all([
    Company.findById(companyId).lean(),
    Membership.findOne({ companyId, userId: oid(req.user.id), status: 'active' }).lean(),
  ]);
  if (!company || !member) throw notFound('Company');
  if (company.status !== 'active') throw forbidden('This company account is suspended');
  req.company = company;
  req.member = member;
  req.permissions = effectivePermissions(member);
  next();
});

export const requirePerm = (...perms: Permission[]) => {
  const handler: any = (req: any, _res: any, next: any) => {
    if (perms.every((p) => req.permissions?.includes(p))) return next();
    audit(req, { action: 'permission.denied', outcome: 'denied', meta: { required: perms, path: req.originalUrl } });
    next(forbidden());
  };
  handler.perms = perms; // tag used by tests/security-inventory.test.ts to prove every company route is permission-gated
  return handler;
};
