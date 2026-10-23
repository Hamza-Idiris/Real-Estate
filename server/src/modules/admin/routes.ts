import { Router } from 'express';
import { z } from 'zod';
import { Company, Membership } from '../companies/model';
import { User } from '../auth/model';
import { Property } from '../properties/model';
import { Tenancy } from '../tenancies/model';
import { revokeAllSessions } from '../auth/service';
import { audit } from '../audit/service';
import { ah, escapeRegex, idParam, pageMeta, pageQuery, validate } from '../../utils/http';
import { forbidden, notFound } from '../../utils/errors';

/**
 * Platform administration. Deliberately limited to account status and aggregate counts.
 * There is NO route here that reads a company's properties, tenants, invoices or documents.
 * Every mutation requires a written reason and is audit-logged.
 */
export const adminRoutes = Router();
adminRoutes.get('/stats', ah(async (_req, res) => {
  const [users, companies, activeCompanies, properties, publishedProperties, activeTenancies] = await Promise.all([
    User.countDocuments(), Company.countDocuments(), Company.countDocuments({ status: 'active' }), Property.countDocuments(), Property.countDocuments({ listingStatus: 'published' }), Tenancy.countDocuments({ status: 'active' }),
  ]);
  res.json({ data: { users, companies, activeCompanies, properties, publishedProperties, activeTenancies } });
}));
adminRoutes.get('/companies', validate({ query: pageQuery.extend({ q: z.string().max(80).optional(), status: z.enum(['active', 'suspended']).optional() }) }), ah(async (req, res) => {
  const { page, limit, q, status } = req.query;
  const f: any = {}; if (status) f.status = status; if (q) f.name = new RegExp(escapeRegex(q), 'i');
  const [data, total] = await Promise.all([Company.find(f).select('name slug country status currency createdAt').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), Company.countDocuments(f)]);
  res.json({ data, meta: pageMeta(page, limit, total) });
}));
const statusBody = z.object({ status: z.enum(['active', 'suspended']), reason: z.string().trim().min(5).max(500) }).strict();
adminRoutes.patch('/companies/:id/status', validate({ params: idParam, body: statusBody }), ah(async (req, res) => {
  const c = await Company.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true }).select('name status').lean();
  if (!c) throw notFound('Company');
  await audit(req, { action: 'admin.company_status', entityType: 'Company', entityId: req.params.id, companyId: req.params.id, meta: req.body });
  res.json({ data: c });
}));
adminRoutes.get('/users', validate({ query: pageQuery.extend({ q: z.string().max(80).optional() }) }), ah(async (req, res) => {
  const { page, limit, q } = req.query;
  const f: any = q ? { $or: [{ email: new RegExp(`^${escapeRegex(q)}`, 'i') }, { name: new RegExp(escapeRegex(q), 'i') }] } : {};
  const [data, total] = await Promise.all([User.find(f).select('email name status platformRole createdAt').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), User.countDocuments(f)]);
  res.json({ data, meta: pageMeta(page, limit, total) });
}));
adminRoutes.patch('/users/:id/status', validate({ params: idParam, body: statusBody }), ah(async (req, res) => {
  const u: any = await User.findById(req.params.id).select('platformRole status').lean();
  if (!u) throw notFound('User');
  if (String(u._id) === req.user.id || u.platformRole === 'super_admin') throw forbidden('Platform administrators cannot be suspended here');
  await User.updateOne({ _id: u._id }, { status: req.body.status });
  if (req.body.status === 'suspended') await revokeAllSessions(String(u._id));
  await audit(req, { action: 'admin.user_status', entityType: 'User', entityId: u._id, meta: req.body });
  res.json({ data: { id: u._id, status: req.body.status } });
}));
adminRoutes.post('/properties/:id/verify', validate({ params: idParam, body: z.object({ verified: z.boolean(), reason: z.string().trim().min(5).max(500) }).strict() }), ah(async (req, res) => {
  const p = await Property.findByIdAndUpdate(req.params.id, { verified: req.body.verified }, { new: true }).select('reference verified').lean();
  if (!p) throw notFound('Property');
  await audit(req, { action: 'admin.property_verify', entityType: 'Property', entityId: req.params.id, meta: req.body });
  res.json({ data: p });
}));
